#!/usr/bin/env node

/**
 * Cadastra no GRM (Graint > Patrimônios, patrimonies/setRecord) o patrimônio comprado pelo módulo
 * Compras, assim que o número da etiqueta é salvo no painel (Patrimônios > Cadastro ou app do gestor).
 *
 * Fila: colunas grm_cadastro_* de public.compras_patrimonios_cadastro (PENDENTE -> PROCESSANDO ->
 * CONCLUIDO | ERRO), reivindicadas com claim_next_compras_patrimonio_grm_cadastro(). O job em
 * grm_sync_jobs é criado pelo gatilho da migration 20261021120000 e por um cron de segurança de 5 min.
 * O agente nasce DESLIGADO (grm_sync_agent_settings.enabled = false) até a conferência com --dry-run.
 *
 * Como cada campo do formulário do Graint é preenchido (decisões de 21/10/2026):
 *   N° Patrimônio  -> o número digitado no painel (inteiro positivo de até 9 dígitos)
 *   Identificação  -> nome do material (como já estão os patrimônios dessas categorias)
 *   Categoria      -> categoria do GRM com o MESMO NOME do material (CALADOR, QUARTEADOR, ...)
 *   Marca          -> informada na compra; precisa existir no catálogo do GRM (o agente não cria marca)
 *   Modelo         -> vazio (como os patrimônios existentes dessas categorias)
 *   Funcionário    -> o SOLICITANTE da compra (ou o "responsável" editado na tela de Patrimônios)
 *   Coordenação / Supervisão -> as do funcionário no Supabase (colaboradores_atuais), conferidas contra
 *                     o GRM: o Graint só aceita funcionário da própria supervisão
 *   Situação       -> A (Em uso: o material já está com o responsável)
 *   Tipo           -> o mais usado entre os patrimônios já cadastrados da mesma categoria (padrão M)
 *
 * Idempotente: se o número já existe no GRM e é da mesma categoria, só marca como concluído; se for de
 * outro material, vai para ERRO (nunca sobrescreve).
 *
 * Uso:
 *   node grmserver-cadastrar-patrimonio-api.js                          # processa a fila
 *   node grmserver-cadastrar-patrimonio-api.js --dry-run [--id=<uuid> | --numero=10039]
 *       # só lê o GRM e o painel e mostra o que enviaria; NUNCA grava no GRM nem muda a fila
 */

require('dotenv').config();
const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
const base = require('./grmserver-cadastrar-veiculo-api');

const { norm, digits, usoPorChave, resolverMarca, resolverLocal, grm, grmEscrever, login, buscarFuncionario, log, erro, safe } = base;

const DRY_RUN = process.argv.includes('--dry-run')
  || String(process.env.GRM_CADASTRAR_PATRIMONIO_DRY_RUN || 'false').toLowerCase() === 'true';
const argValor = (prefixo) => (process.argv.find((arg) => arg.startsWith(prefixo)) || '').slice(prefixo.length) || null;
const ONLY_ID = argValor('--id=');
const ONLY_NUMERO = argValor('--numero=');
// Só vale com --dry-run: simula a marca nas linhas que ainda não têm, para conferir o resto do fluxo.
const MARCA_SIMULADA = DRY_RUN ? argValor('--simular-marca=') : null;
const MAX_PER_RUN = Math.max(1, Number(process.env.GRM_CADASTRAR_PATRIMONIO_MAX_POR_EXECUCAO || 30));
const MAX_TENTATIVAS = 3;
const TIMEOUT_MIN = 10;

let supabase = null;
function getSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
      { realtime: { transport: WebSocket } },
    );
  }
  return supabase;
}

let watchdogCurrentId = null;

// ---------------------------------------------------------------------------
// Funções puras (testadas em test-cadastrar-patrimonio.js)
// ---------------------------------------------------------------------------

const NUMERO_VALIDO = /^[1-9][0-9]{0,8}$/;
const numeroValido = (numero) => NUMERO_VALIDO.test(String(numero ?? '').trim());

function validarDados({ numero, material, marca, responsavel }) {
  const faltando = [];
  if (!numeroValido(numero)) faltando.push('Nº do patrimônio (só números, até 9 dígitos, maior que zero)');
  if (!String(material ?? '').trim()) faltando.push('Material');
  if (!String(marca ?? '').trim()) faltando.push('Marca (informe na compra ou na tela de Patrimônios; "SEM MARCA" se não houver)');
  if (!String(responsavel ?? '').trim()) faltando.push('Responsável (solicitante da compra)');
  return faltando;
}

function sugestoes(nomes, alvo) {
  const a = norm(alvo);
  const lista = [...new Set(nomes.map((n) => String(n).trim()))].sort();
  const parecidas = lista.filter((n) => norm(n).includes(a) || a.includes(norm(n)));
  return (parecidas.length ? parecidas : lista).slice(0, 15).join(', ');
}

// Categoria do GRM com o mesmo nome do material (é assim que CALADOR, QUARTEADOR... estão cadastrados).
function resolverCategoria(material, categorias) {
  const ativas = (Array.isArray(categorias) ? categorias : []).filter((c) => String(c.pcaStatus || 'A') === 'A');
  const alvo = norm(material);
  const exata = ativas.find((c) => norm(c.pcaName) === alvo);
  if (exata) return exata;
  throw erro('CATEGORIA_NAO_ENCONTRADA', `Não existe no GRM uma categoria de patrimônio chamada "${String(material).trim()}". Parecidas: ${sugestoes(ativas.map((c) => c.pcaName), material)}. Peça o cadastro da categoria no GRM (ou ajuste o nome do material) e reenvie.`);
}

// Tipo (patType) mais usado entre os patrimônios já cadastrados da categoria; sem exemplo, "M" (Material).
function tipoPadrao(patrimonios, pcaCode) {
  const contagem = new Map();
  for (const p of Array.isArray(patrimonios) ? patrimonios : []) {
    if (Number(p.pcaCode) !== Number(pcaCode) || !p.patType) continue;
    contagem.set(p.patType, (contagem.get(p.patType) || 0) + 1);
  }
  const ordenado = [...contagem.entries()].sort((a, b) => b[1] - a[1]);
  return ordenado.length ? ordenado[0][0] : 'M';
}

// O responsável tem que estar ativo no painel (colaboradores_atuais). Nome igual ignorando acento/caixa.
function resolverResponsavel(nome, colaboradores) {
  const alvo = norm(nome);
  const iguais = (Array.isArray(colaboradores) ? colaboradores : []).filter((c) => norm(c.nome) === alvo);
  if (!iguais.length) {
    throw erro('RESPONSAVEL_NAO_ENCONTRADO', `Responsável "${String(nome).trim()}" não encontrado no cadastro de colaboradores do painel. Corrija o nome do responsável na tela de Patrimônios e reenvie.`);
  }
  const ativos = iguais.filter((c) => c.ativo === true || norm(c.situacao) === 'ATIVO');
  if (!ativos.length) {
    throw erro('RESPONSAVEL_INATIVO', `Responsável "${String(nome).trim()}" está "${iguais[0].situacao || 'inativo'}" no painel. Informe outro responsável na tela de Patrimônios e reenvie.`);
  }
  if (new Set(ativos.map((c) => c.cpf || c.nome)).size > 1) {
    throw erro('RESPONSAVEL_AMBIGUO', `Há mais de um colaborador ativo chamado "${String(nome).trim()}" no painel. Informe o nome completo do responsável na tela de Patrimônios e reenvie.`);
  }
  const colab = ativos[0];
  if (!String(colab.coordenacao ?? '').trim() && !String(colab.supervisao ?? '').trim()) {
    throw erro('DADOS_INCOMPLETOS', `O colaborador ${colab.nome} está sem coordenação/supervisão no painel.`);
  }
  return colab;
}

// Mesma forma do recordData que a tela de Patrimônio do Graint monta (ver cadastrar-veiculo).
function montarPayload({ numero, material, categoria, marca, local, staCode, tipo }) {
  return {
    patNumber: digits(numero),
    oldPatNumber: null,
    patName: String(material).trim().toUpperCase(),
    pcaCode: categoria.pcaCode,
    pbrCode: marca.pbrCode,
    pmoCode: null,
    olcCode: local.olcCode,
    olsCode: local.olsCode,
    staCode: staCode || null,
    patSituation: 'A',
    patType: tipo || 'M',
    patComments: '',
    patAcquisitionDate: '',
    supCode: null,
    patSerialNumber: '',
    patIMEI: '',
    patPhoneLine: '',
    patIsPersonal: null,
  };
}

// ---------------------------------------------------------------------------
// GRM e painel
// ---------------------------------------------------------------------------

async function carregarContexto(token) {
  const [coordenacoes, supervisoes, categorias, marcas] = await Promise.all([
    grm(token, 'coordination/getForSelect', {}),
    grm(token, 'supervision/getForSelect', { olsStatus: 'A' }),
    grm(token, 'patrimonyCategory/getRecords', {}),
    grm(token, 'patrimonyBrand/getRecords', {}),
  ]);
  const coordenacaoPorNome = new Map();
  for (const c of safe(coordenacoes.searchData)) if (c.olcName && String(c.olcStatus || 'A') === 'A') coordenacaoPorNome.set(norm(c.olcName), c);
  const supervisaoPorNome = new Map();
  for (const s of safe(supervisoes.searchData)) if (s.olsName) supervisaoPorNome.set(norm(s.olsName), s);

  // R2 ligado = o Graint manda JSON; desligado = multipart (padrão do front). Falha na leitura = multipart.
  let multipartPatrimonio = true;
  try {
    const cfg = await grm(token, 'sysConfig/getSysConfig', {});
    const dados = Array.isArray(cfg.searchData) ? cfg.searchData[0] : cfg.searchData;
    if (dados && dados.cfgEnableCloudFlareR2 === 'S') multipartPatrimonio = false;
  } catch (error) {
    log('WARN', `Não consegui ler sysConfig (${error.message}); usando multipart no Patrimônio.`);
  }
  return {
    coordenacaoPorNome,
    supervisaoPorNome,
    categorias: safe(categorias.searchData),
    marcas: safe(marcas.searchData),
    multipartPatrimonio,
  };
}

async function carregarColaboradores() {
  const sb = getSupabase();
  const todos = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from('colaboradores_atuais').select('nome,cpf,coordenacao,supervisao,situacao,ativo').range(de, de + 999);
    if (error) throw error;
    todos.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return todos;
}

// Dados da compra por trás da linha: material, marca e solicitante.
async function carregarCompra(linha) {
  const { data, error } = await getSupabase()
    .from('compras_patrimonios_cadastro')
    .select('id, material, marca, compra_item_id, compras_itens(material, marca, compras_solicitacoes(solicitante))')
    .eq('id', linha.id)
    .maybeSingle();
  if (error) throw error;
  const item = data?.compras_itens || {};
  return {
    material: String(item.material || data?.material || linha.material || '').trim(),
    // A marca da própria linha (corrigida na tela de Patrimônios) vale mais que a do item.
    marca: String(data?.marca || linha.marca || item.marca || '').trim(),
    solicitante: String(item.compras_solicitacoes?.solicitante || '').trim(),
  };
}

async function cadastrar(token, ctx, colaboradores, linha) {
  const compra = await carregarCompra(linha);
  if (MARCA_SIMULADA && !compra.marca) compra.marca = MARCA_SIMULADA;
  const numero = String(linha.numero_patrimonio ?? '').trim();
  const responsavel = String(linha.grm_responsavel || compra.solicitante || '').trim();
  const faltando = validarDados({ numero, material: compra.material, marca: compra.marca, responsavel });
  const resultado = { numero, material: compra.material, avisos: [] };

  // Número e material são o mínimo para conferir se o GRM já tem o patrimônio.
  if (!numeroValido(numero) || !compra.material) throw erro('DADOS_INCOMPLETOS', `Faltam dados para cadastrar no GRM: ${faltando.join('; ')}.`);
  const categoria = resolverCategoria(compra.material, ctx.categorias);
  const patrimoniosGrm = safe((await grm(token, 'patrimonies/getRecords', {})).searchData);
  const existente = patrimoniosGrm.find((p) => String(p.patNumber) === numero);
  if (existente) {
    if (Number(existente.pcaCode) === Number(categoria.pcaCode)) {
      resultado.jaExistia = true;
      resultado.patName = existente.patName;
      return resultado;
    }
    throw erro('PATRIMONIO_NUMERO_EM_USO', `O Patrimônio ${numero} já existe no GRM como outro material (${existente.patName}). Informe outro número e reenvie.`, resultado);
  }

  if (faltando.length) throw erro('DADOS_INCOMPLETOS', `Faltam dados para cadastrar no GRM: ${faltando.join('; ')}.`);
  const usoMarca = usoPorChave(patrimoniosGrm.filter((p) => Number(p.pcaCode) === Number(categoria.pcaCode)), 'pbrCode');
  const marca = resolverMarca(compra.marca, ctx.marcas, usoMarca);
  const colab = resolverResponsavel(responsavel, colaboradores);
  const staff = await buscarFuncionario(token, colab.nome);
  const local = resolverLocal(ctx, { coordenacao: colab.coordenacao, supervisao: colab.supervisao }, staff);
  const tipo = tipoPadrao(patrimoniosGrm, categoria.pcaCode);
  const payload = montarPayload({ numero, material: compra.material, categoria, marca, local, staCode: staff.staCode, tipo });
  resultado.resolvido = {
    categoria: `${categoria.pcaName} (${categoria.pcaCode})`,
    marca: `${String(marca.pbrName).trim()} (${marca.pbrCode})`,
    responsavel: `${colab.nome} -> staCode ${staff.staCode}`,
    coordenacao: colab.coordenacao, supervisao: colab.supervisao, olcCode: local.olcCode, olsCode: local.olsCode, tipo,
  };

  if (DRY_RUN) {
    log('INFO', 'DRY_RUN: patrimonies/setRecord NÃO enviado. Payload:', payload);
    resultado.dryRun = true;
    return resultado;
  }

  try {
    await grmEscrever(token, 'patrimonies/setRecord', payload, { multipart: ctx.multipartPatrimonio });
  } catch (error) {
    // Resposta perdida/recusada: confere se o GRM gravou mesmo assim antes de falhar.
    const conferencia = safe((await grm(token, 'patrimonies/getRecords', {})).searchData).find((p) => String(p.patNumber) === numero);
    if (!conferencia) throw erro(error.code || 'PATRIMONIO_FALHOU', `Cadastro do Patrimônio falhou: ${error.message}`, resultado);
    log('WARN', `Patrimônio ${numero} apareceu no GRM apesar do erro (${error.message}); seguindo.`);
  }
  const gravado = safe((await grm(token, 'patrimonies/getRecords', {})).searchData).find((p) => String(p.patNumber) === numero);
  if (!gravado) throw erro('PATRIMONIO_NAO_CONFIRMADO', `O GRM respondeu OK mas o Patrimônio ${numero} não apareceu na consulta. Confira no GRM antes de reenviar.`, resultado);
  resultado.patName = gravado.patName;
  resultado.criado = true;
  log('SUCCESS', `Patrimônio ${numero} criado no GRM: ${gravado.patName}`);
  return resultado;
}

// ---------------------------------------------------------------------------
// Fila
// ---------------------------------------------------------------------------

function resumo(r) {
  if (r.dryRun) return `DRY_RUN: criaria o Patrimônio ${r.numero} (${r.material}).`;
  return `Patrimônio ${r.numero} ${r.jaExistia ? 'já existia' : 'criado'} no GRM (${r.patName || r.material}).${r.avisos?.length ? ` Atenção: ${r.avisos.join(' ')}` : ''}`;
}

async function updateLinha(id, patch) {
  const { error } = await getSupabase().from('compras_patrimonios_cadastro').update(patch).eq('id', id);
  if (error) throw error;
}

async function claimNext() {
  const { data, error } = await getSupabase().rpc('claim_next_compras_patrimonio_grm_cadastro');
  if (error) throw error;
  return data && data.id ? data : null;
}

async function contarPendentes() {
  const { count, error } = await getSupabase()
    .from('compras_patrimonios_cadastro')
    .select('id', { count: 'exact', head: true })
    .in('grm_cadastro_status', ['PENDENTE', 'PROCESSANDO']);
  if (error) throw error;
  return count || 0;
}

// Depois de criar, pede uma leitura de Patrimônios para o painel enxergar os novos. Falha aqui não importa.
async function pedirSyncPatrimonios() {
  try {
    const sb = getSupabase();
    const { data: ativos } = await sb.from('grm_sync_jobs').select('id').eq('agente_id', 'sync-patrimonios').in('status', ['pendente', 'rodando']).limit(1);
    if (ativos && ativos.length) return;
    const { error } = await sb.from('grm_sync_jobs').insert({ agente_id: 'sync-patrimonios', status: 'pendente', solicitado_por: 'cadastrar-patrimonio' });
    if (error) log('WARN', `Não enfileirei sync-patrimonios: ${error.message}`);
  } catch (error) {
    log('WARN', `Não enfileirei sync-patrimonios: ${error.message}`);
  }
}

const ERROS_DEFINITIVOS = new Set([
  'DADOS_INCOMPLETOS', 'CATEGORIA_NAO_ENCONTRADA', 'MARCA_NAO_ENCONTRADA', 'SUPERVISAO_NAO_ENCONTRADA',
  'COORDENACAO_NAO_ENCONTRADA', 'LOCAL_DIVERGENTE', 'FUNCIONARIO_NAO_ENCONTRADO', 'FUNCIONARIO_AMBIGUO',
  'FUNCIONARIO_SUPERVISAO_DIVERGENTE', 'RESPONSAVEL_NAO_ENCONTRADO', 'RESPONSAVEL_INATIVO', 'RESPONSAVEL_AMBIGUO',
  'PATRIMONIO_NUMERO_EM_USO', 'PATRIMONIO_NAO_CONFIRMADO', 'GRM_RECUSOU', 'PATRIMONIO_FALHOU',
]);

async function processar(token, ctx) {
  const colaboradores = await carregarColaboradores();
  let processed = 0;
  let errors = 0;
  let criou = false;
  for (let index = 0; index < MAX_PER_RUN; index += 1) {
    const linha = await claimNext();
    if (!linha) break;
    processed += 1;
    watchdogCurrentId = linha.id;
    try {
      const resultado = await cadastrar(token, ctx, colaboradores, linha);
      await updateLinha(linha.id, {
        grm_cadastro_status: 'CONCLUIDO',
        grm_cadastro_mensagem: resumo(resultado),
        grm_cadastro_em: new Date().toISOString(),
        grm_cadastro_travado_em: null,
      });
      if (resultado.criado) criou = true;
      log('SUCCESS', `${linha.numero_patrimonio}: ${resumo(resultado)}`);
    } catch (error) {
      errors += 1;
      // Dado errado não se resolve sozinho: vai direto para ERRO. Falha de rede/GRM volta para a fila
      // (o cron de 5 min reenfileira) até MAX_TENTATIVAS.
      const definitivo = ERROS_DEFINITIVOS.has(error.code);
      const esgotou = definitivo || Number(linha.grm_cadastro_tentativas || 0) >= MAX_TENTATIVAS;
      await updateLinha(linha.id, {
        grm_cadastro_status: esgotou ? 'ERRO' : 'PENDENTE',
        grm_cadastro_mensagem: error.message,
        grm_cadastro_em: new Date().toISOString(),
        grm_cadastro_travado_em: null,
      });
      log('ERROR', `${linha.numero_patrimonio}: ${error.message}`);
    } finally {
      watchdogCurrentId = null;
    }
  }
  if (criou) await pedirSyncPatrimonios();
  return { processed, errors };
}

async function dryRun(token, ctx) {
  const colaboradores = await carregarColaboradores();
  let query = getSupabase().from('compras_patrimonios_cadastro').select('*').order('created_at', { ascending: true });
  if (ONLY_ID) query = query.eq('id', ONLY_ID);
  else if (ONLY_NUMERO) query = query.eq('numero_patrimonio', ONLY_NUMERO);
  else query = query.in('grm_cadastro_status', ['PENDENTE', 'ERRO']);
  const resp = await query.limit(MAX_PER_RUN);
  if (resp.error) throw resp.error;
  if (!resp.data?.length) log('INFO', 'DRY_RUN: nenhuma linha para validar.');
  let errors = 0;
  for (const linha of resp.data || []) {
    try {
      const resultado = await cadastrar(token, ctx, colaboradores, linha);
      log('INFO', `DRY_RUN ${linha.numero_patrimonio}: ${resultado.jaExistia ? `já existe no GRM (${resultado.patName})` : resumo(resultado)}`, resultado.resolvido);
    } catch (err) {
      errors += 1;
      log('ERROR', `DRY_RUN ${linha.numero_patrimonio}: ${err.message}`);
    }
  }
  return { processed: resp.data?.length || 0, errors };
}

async function main() {
  log('INFO', `Iniciando agente de cadastro de patrimônio no GRM (dry_run=${DRY_RUN}).`);
  if (!DRY_RUN) {
    const pendentes = await contarPendentes();
    if (!pendentes) {
      log('INFO', 'Nenhum patrimônio aguardando cadastro no GRM.');
      return;
    }
  }
  const token = await login();
  const ctx = await carregarContexto(token);
  log('INFO', `Contexto: ${ctx.coordenacaoPorNome.size} coordenação(ões), ${ctx.supervisaoPorNome.size} supervisão(ões), ${ctx.categorias.length} categoria(s), ${ctx.marcas.length} marca(s).`);
  const result = DRY_RUN ? await dryRun(token, ctx) : await processar(token, ctx);
  log(result.errors ? 'ERROR' : 'SUCCESS', 'Agente concluído.', result);
  if (result.errors) process.exitCode = 1;
}

if (require.main === module) {
  main().then(() => process.exit(process.exitCode || 0)).catch((error) => {
    log('ERROR', `Erro fatal: ${error.message}`, { stack: error.stack });
    process.exit(1);
  });
  setTimeout(() => {
    log('ERROR', `Watchdog atingiu ${TIMEOUT_MIN} minuto(s); encerrando.`);
    if (!watchdogCurrentId) { process.exit(1); return; }
    Promise.race([
      updateLinha(watchdogCurrentId, { grm_cadastro_status: 'PENDENTE', grm_cadastro_travado_em: null, grm_cadastro_mensagem: 'Watchdog: execução interrompida, volta pra fila.' }),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]).finally(() => process.exit(1));
  }, TIMEOUT_MIN * 60 * 1000).unref();
}

module.exports = { numeroValido, validarDados, resolverCategoria, tipoPadrao, resolverResponsavel, montarPayload };
