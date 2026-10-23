#!/usr/bin/env node

/**
 * Cadastra no GRM (Graint > Financeiro > Fornecedores, suppliers/setRecord) o fornecedor que o agente de
 * lançamento de NF não encontrou, e devolve as NFs paradas para a fila.
 *
 * Fila: public.grm_fornecedor_cadastros (um registro por CNPJ; PENDENTE -> PROCESSANDO -> CONCLUIDO | ERRO),
 * reivindicada com claim_next_grm_fornecedor_cadastro(). O pedido nasce no gatilho de grm_nf_lancamentos
 * (NF em ERRO 'Fornecedor "X" não encontrado no GRM (suppliers).') — migration 20261023230000. O agente nasce
 * DESLIGADO (grm_sync_agent_settings.enabled = false) até a conferência com --dry-run.
 *
 * Como cada campo do formulário do Graint é preenchido (decisões de 23/10/2026):
 *   Tipo (supType)          -> PJ (CNPJ). CPF (pessoa física) NÃO é cadastrado: sem consulta de endereço, vai p/ ERRO
 *   Nome / Endereço / CEP / Cidade / Bairro / E-mail / Telefone
 *                           -> Receita Federal via BrasilAPI (fallback ReceitaWS); CEP/ViaCEP completam o que faltar
 *   Categoria do fornecedor -> derivada da categoria da NF (mesmo nome, tabela de mapeamento, grupo), senão DIVERSOS
 *   Categoria de pagamento  -> a categoria da NF (payInvoiceCategory), a mesma do lançamento que vai ser feito
 *   Coordenação / Supervisão-> GERAL / GERAL - Administrativo (o Graint exige; é o que a maioria dos cadastros usa)
 *   Valor máx. de NF        -> 0 (sem limite), como os cadastros existentes
 * Só cadastra CNPJ com situação ATIVA na Receita; fornecedor que existe no GRM mas está inativo vai p/ ERRO
 * (reativar é decisão da equipe). Idempotente: se o CNPJ já existe ativo no GRM, só conclui a fila.
 *
 * Uso:
 *   node grmserver-cadastrar-fornecedor-api.js                          # processa a fila
 *   node grmserver-cadastrar-fornecedor-api.js --dry-run [--cnpj=00000000000191 [--categoria="MATERIAL EXPEDIENTE"]]
 *       # só lê o GRM, a Receita e a fila e mostra o que enviaria; NUNCA grava no GRM nem muda a fila
 */

require('dotenv').config();
const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
const base = require('./grmserver-cadastrar-veiculo-api');

const { norm, digits, grm, grmEscrever, login, log, erro, safe } = base;

const DRY_RUN = process.argv.includes('--dry-run')
  || String(process.env.GRM_CADASTRAR_FORNECEDOR_DRY_RUN || 'false').toLowerCase() === 'true';
const argValor = (prefixo) => (process.argv.find((arg) => arg.startsWith(prefixo)) || '').slice(prefixo.length) || null;
const ONLY_CNPJ = digits(argValor('--cnpj='));
const CATEGORIA_SIMULADA = DRY_RUN ? argValor('--categoria=') : null;
const MAX_PER_RUN = Math.max(1, Number(process.env.GRM_CADASTRAR_FORNECEDOR_MAX_POR_EXECUCAO || 20));
const MAX_TENTATIVAS = 3;
const TIMEOUT_MIN = 10;
const COORDENACAO_PADRAO = process.env.GRM_FORNECEDOR_COORDENACAO || 'GERAL';
const SUPERVISAO_PADRAO = process.env.GRM_FORNECEDOR_SUPERVISAO || 'GERAL - Administrativo';
const CATEGORIA_FORNECEDOR_PADRAO = 'DIVERSOS';
const HTTP_TIMEOUT_MS = 20000;

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
// Funções puras (testadas em test-cadastrar-fornecedor.js)
// ---------------------------------------------------------------------------

function cnpjValido(valor) {
  const c = digits(valor);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const dv = (tamanho) => {
    let soma = 0;
    let peso = tamanho - 7;
    for (let i = 0; i < tamanho; i += 1) {
      soma += Number(c[i]) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}

// O GRM grava supDocument formatado ("21.948.503/0001-63").
function formatarCnpj(valor) {
  const c = digits(valor);
  return c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c;
}

function formatarCep(valor) {
  const c = digits(valor);
  return c.length === 8 ? `${c.slice(0, 5)}-${c.slice(5)}` : '';
}

// "6535412345" -> "(65) 3541-2345"; celular (11 dígitos) -> "(65) 99625-1212". Fora disso, vazio (campo opcional).
function formatarTelefone(valor) {
  let c = digits(String(valor ?? '').split(/[\/;,]| ou /i)[0]);
  if (c.length > 11 && c.startsWith('0')) c = c.replace(/^0+/, '');
  // A Receita às vezes traz número de enchimento (99999999, 00000000): melhor vazio que errado.
  if (c.length >= 10 && /^(\d)\1+$/.test(c.slice(2))) return '';
  if (c.length === 10) return c.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  if (c.length === 11) return c.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  return '';
}

function emailValido(valor) {
  const e = String(valor ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : '';
}

// Resposta da BrasilAPI (/api/cnpj/v1) -> forma única usada pelo agente.
function normalizarBrasilApi(r) {
  if (!r || !r.razao_social) return null;
  const situacaoCodigo = r.situacao_cadastral;
  return {
    fonte: 'brasilapi',
    razaoSocial: String(r.razao_social).trim(),
    fantasia: String(r.nome_fantasia || '').trim(),
    ativa: Number(situacaoCodigo) === 2 || norm(r.descricao_situacao_cadastral) === 'ATIVA',
    situacao: String(r.descricao_situacao_cadastral || situacaoCodigo || '').trim(),
    cep: digits(r.cep),
    tipoLogradouro: String(r.descricao_tipo_de_logradouro || '').trim(),
    logradouro: String(r.logradouro || '').trim(),
    numero: String(r.numero || '').trim(),
    complemento: String(r.complemento || '').trim(),
    bairro: String(r.bairro || '').trim(),
    municipio: String(r.municipio || '').trim(),
    uf: String(r.uf || '').trim().toUpperCase(),
    ibge: digits(r.codigo_municipio_ibge),
    telefone: r.ddd_telefone_1 || '',
    email: r.email || '',
  };
}

// Resposta da ReceitaWS (/v1/cnpj) -> mesma forma. Não traz código IBGE nem tipo de logradouro separado.
function normalizarReceitaWs(r) {
  if (!r || r.status === 'ERROR' || !r.nome) return null;
  return {
    fonte: 'receitaws',
    razaoSocial: String(r.nome).trim(),
    fantasia: String(r.fantasia || '').trim(),
    ativa: norm(r.situacao) === 'ATIVA',
    situacao: String(r.situacao || '').trim(),
    cep: digits(r.cep),
    tipoLogradouro: '',
    logradouro: String(r.logradouro || '').trim(),
    numero: String(r.numero || '').trim(),
    complemento: String(r.complemento || '').trim(),
    bairro: String(r.bairro || '').trim(),
    municipio: String(r.municipio || '').trim(),
    uf: String(r.uf || '').trim().toUpperCase(),
    ibge: '',
    telefone: r.telefone || '',
    email: r.email || '',
  };
}

// Tipo de logradouro (satCode): o nome vindo da Receita ("AVENIDA") ou a abreviatura no começo da rua ("AV GENERAL MELLO").
const ABREVIATURAS_LOGRADOURO = {
  AV: 'AVENIDA', AVE: 'AVENIDA', R: 'RUA', ROD: 'RODOVIA', RDV: 'RODOVIA', AL: 'ALAMEDA', EST: 'ESTRADA', ESTR: 'ESTRADA',
  PC: 'PRACA', PCA: 'PRACA', TV: 'TRAVESSA', TRAV: 'TRAVESSA', VL: 'VILA', LG: 'LARGO', LRG: 'LARGO', BC: 'BECO',
  FAZ: 'FAZENDA', COND: 'CONDOMINIO', CHAC: 'CHACARA', PRO: 'PROLONGAMENTO', VIA: 'VIA',
};

function resolverTipoLogradouro({ tipoLogradouro, logradouro }, tipos) {
  const lista = Array.isArray(tipos) ? tipos : [];
  const porNome = (nome) => lista.find((t) => norm(t.satName) === norm(nome));
  const candidatos = [];
  if (tipoLogradouro) candidatos.push(tipoLogradouro);
  const primeira = norm(logradouro).split(' ')[0].replace(/\./g, '');
  if (primeira) candidatos.push(primeira, ABREVIATURAS_LOGRADOURO[primeira]);
  for (const candidato of candidatos) {
    const achou = candidato && porNome(candidato);
    if (achou) return { tipo: achou, padrao: false };
  }
  const rua = porNome('Rua');
  return rua ? { tipo: rua, padrao: true } : null;
}

// Cidade (citCode) = código IBGE; confere se existe no GRM para a UF, senão procura pelo nome.
function resolverCidade({ ibge, municipio }, cidades) {
  const lista = (Array.isArray(cidades) ? cidades : []).filter((c) => String(c.citStatus || 'A') === 'A');
  if (ibge) {
    const porCodigo = lista.find((c) => String(c.citCode) === String(ibge));
    if (porCodigo) return porCodigo;
  }
  const alvo = norm(municipio);
  return alvo ? lista.find((c) => norm(c.citName) === alvo) || null : null;
}

// Categoria do fornecedor (scaCode) derivada da categoria da NF (payInvoiceCategory). Ordem: mesmo nome ->
// mapeamento explícito -> grupo (categoria-pai) -> DIVERSOS. Só vale nome que existe (ativo) no catálogo do GRM.
const MAPA_CATEGORIA_NF = {
  'INSUMOS OPERACAO': 'INSUMOS DIVERSOS',
  'INSUMOS OPER. - REEMBOLSO CLIENTE': 'INSUMOS DIVERSOS',
  'MAQ. E EQUIPAMENTOS < 500': 'PATRIMONIO',
  'MOVEIS E EQUIP. INFORMATICA < 500': 'PATRIMONIO',
  'IMOBILIZADO (MAIOR QUE 500,00)': 'PATRIMONIO',
  'LOCACAO MAQ. E EQUIPAMENTOS': 'ALUGUEL DE EQUIPAMENTOS',
  'LOCACAO DE MAQUINAS E EQUIP - REEMBOLSO CLIENTE': 'ALUGUEL DE EQUIPAMENTOS',
  'ALUGUEL DE ALOJAMENTOS': 'ALUGUEL ALOJAMENTOS/CONTAINER',
  'ALOJAMENTOS OUTRAS DESPESAS': 'ALUGUEL ALOJAMENTOS/CONTAINER',
  'LOCACAO DE INSTALACOES': 'ALUGUEL ALOJAMENTOS/CONTAINER',
  'INTERNET/TELEFONE': 'TELEFONE/INTERNET',
  'PLANO EMPRESARIAL MOVEL': 'TELEFONE/INTERNET',
  'RECARGA CELULAR': 'TELEFONE/INTERNET',
  'EPI - EQUIP DE PROTECAO INDIVIDUAL': 'SAUDE E SEGURANCA DO TRABALHO',
  'EXAMES OCUP. E ENVIO E-SOCIAL': 'SAUDE E SEGURANCA DO TRABALHO',
  'PPRA/PCMSO': 'SAUDE E SEGURANCA DO TRABALHO',
  'MEDICO HOSPIT. E MEDICAMENTOS': 'SAUDE E SEGURANCA DO TRABALHO',
  'UNIFORME/CRACHA': 'DESPESAS RH',
  'ALIMENTACAO - REEMBOLSO CLIENTE': 'ALIMENTACAO',
  'HOSPEDAGEM - REEMBOLSO CLIENTE': 'HOSPEDAGEM',
  'AGUA FATURA': 'ENERGIA/AGUA',
  'AGUA MINERAL NFE': 'ENERGIA/AGUA',
  'ENERGIA ELETRICA': 'ENERGIA/AGUA',
  'PADRONIZACAO E FRETES': 'PADRONIZACAO E FRETES CARGAS',
  'HONORARIOS ADVOCATICIOS': 'HONORARIOS DE TERCEIROS',
  'HONORARIOS CONTABILIDADE': 'HONORARIOS DE TERCEIROS',
  'SOFTWARE/SISTEMA': 'MENSALIDADE SISTEMAS E PLATAFORMAS',
  'PUBLICIDADE/MATERIAL GRAFICO': 'PUBLICIDADE / PROPAGANDA',
  'BRINDES / PATROCINIOS': 'PUBLICIDADE / PROPAGANDA',
  'MANUT. MAQUINAS E EQUIPAMENTOS': 'MANUT. PATRIMONIO',
  'MANUT. IMOBILIZADOS': 'MANUT. PATRIMONIO',
  'SERV. TERCEIROS CLASSIFICACAO': 'SERVICOS TERCEIR.-CLASSIFICACAO',
  'SERV. MEI CLASSIFICACAO': 'SERVICOS TERCEIR.-CLASSIFICACAO',
  'SERV. TERCEIROS AUDITORIA': 'SERVICOS TERCEIR.-CLASSIFICACAO',
  'OUTROS SERV TOMADOS': 'SERVICOS DIVERSOS TOMADOS',
  'SERVICOS DE LIMPEZA': 'SERVICOS DIVERSOS TOMADOS',
};
const MAPA_GRUPO_NF = {
  'DESPESAS COM VEICULOS': 'DESPESAS COM VEICULOS',
  'COMBUSTIVEIS E LUBRIFICANTES': 'COMBUSTIVEIS',
  IMPOSTOS: 'IMPOSTOS',
  'DESPESAS RH': 'DESPESAS RH',
  PATRIMONIO: 'PATRIMONIO',
};

function derivarCategoriaFornecedor(categoriaNf, grupoNf, categoriasFornecedor) {
  const ativas = (Array.isArray(categoriasFornecedor) ? categoriasFornecedor : []).filter((c) => String(c.scaStatus || 'A') === 'A');
  const achar = (nome) => ativas.find((c) => norm(c.scaName) === norm(nome));
  const etapas = [
    ['mesmo nome', norm(categoriaNf)],
    ['mapeamento', MAPA_CATEGORIA_NF[norm(categoriaNf)]],
    ['grupo da categoria', MAPA_GRUPO_NF[norm(grupoNf)]],
    ['padrão', CATEGORIA_FORNECEDOR_PADRAO],
  ];
  for (const [motivo, nome] of etapas) {
    const categoria = nome && achar(nome);
    if (categoria) return { categoria, motivo };
  }
  throw erro('CATEGORIA_FORNECEDOR_NAO_ENCONTRADA', `Não achei no GRM a categoria de fornecedor "${CATEGORIA_FORNECEDOR_PADRAO}" (padrão). Existentes: ${ativas.map((c) => c.scaName).slice(0, 20).join(', ')}.`);
}

function validarReceita(receita, cnpj) {
  if (!receita.ativa) {
    throw erro('CNPJ_INATIVO', `O CNPJ ${formatarCnpj(cnpj)} (${receita.razaoSocial}) está "${receita.situacao || 'não ativo'}" na Receita Federal. Confira se a NF é do fornecedor certo; se for, cadastre manualmente no Graint.`);
  }
  const faltando = [];
  if (!receita.razaoSocial) faltando.push('razão social');
  if (!formatarCep(receita.cep)) faltando.push('CEP');
  if (!receita.logradouro) faltando.push('logradouro');
  if (!receita.municipio) faltando.push('município');
  if (!/^[A-Z]{2}$/.test(receita.uf)) faltando.push('UF');
  return faltando;
}

// Mesma forma do recordData que a tela de Fornecedores do Graint monta (campos não preenchidos vão como a tela envia).
function montarPayload({ cnpj, receita, categoriaFornecedor, categoriaPagamento, local, tipoLogradouro, cidade, aviso }) {
  const numero = digits(receita.numero);
  if (!numero && aviso) aviso(`Sem número do endereço na Receita ("${receita.numero || ''}"): enviado 0.`);
  return {
    supType: 'PJ',
    supName: receita.razaoSocial.toUpperCase(),
    scaCode: categoriaFornecedor.scaCode,
    supDocument: formatarCnpj(cnpj),
    supIE: '',
    supEmail: emailValido(receita.email),
    supPhone: formatarTelefone(receita.telefone),
    supCellPhone: '',
    supContact: '',
    olcCode: local.olcCode,
    olsCode: local.olsCode,
    supCEP: formatarCep(receita.cep),
    staAbreviation: receita.uf,
    citCode: cidade.citCode,
    supCitName: cidade.citName,
    supCitUF: receita.uf,
    supDistrict: receita.bairro,
    satCode: tipoLogradouro.satCode,
    supAddress: receita.logradouro,
    supAddressNumber: numero || '0',
    supAddressComplement: receita.complemento,
    bnkCode: '',
    supAgencyNumber: '',
    supAccountNumber: '',
    supMaxInvoiceValue: '0',
    supBiled: '',
    supTaxesCredits: '',
    supShowMobile: '',
    supVehicleTracker: 'N',
    picCode: categoriaPagamento.picCode,
  };
}

// ---------------------------------------------------------------------------
// Receita Federal / CEP (fora do GRM; o proxy de saída só mexe no tráfego do GRM)
// ---------------------------------------------------------------------------

async function getJson(url, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(url, { headers: { accept: 'application/json', 'user-agent': 'painel-grao1000/1.0' }, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
  if (res.status === 404 || res.status === 400) return { naoEncontrado: true, status: res.status };
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${new URL(url).host}`);
  return { json: await res.json() };
}

async function consultarReceita(cnpj, deps = {}) {
  const fontes = [
    [`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, normalizarBrasilApi],
    [`https://receitaws.com.br/v1/cnpj/${cnpj}`, normalizarReceitaWs],
  ];
  const falhas = [];
  let naoEncontrado = 0;
  for (const [url, normalizar] of fontes) {
    try {
      const r = await getJson(url, deps);
      if (r.naoEncontrado) { naoEncontrado += 1; continue; }
      const receita = normalizar(r.json);
      if (receita) return receita;
      naoEncontrado += 1;
    } catch (error) {
      falhas.push(error.message);
    }
  }
  if (naoEncontrado && !falhas.length) {
    throw erro('CNPJ_NAO_ENCONTRADO', `O CNPJ ${formatarCnpj(cnpj)} não foi encontrado na Receita Federal. Confira o CNPJ da NF.`);
  }
  throw erro('RECEITA_INDISPONIVEL', `Não consegui consultar o CNPJ ${formatarCnpj(cnpj)} na Receita (${falhas.join('; ') || 'sem resposta'}). Tento de novo em instantes.`);
}

// Completa bairro / logradouro / IBGE que a Receita deixou vazios, pelo CEP.
async function completarPeloCep(receita, deps = {}) {
  if (receita.bairro && receita.logradouro && receita.ibge) return receita;
  const cep = digits(receita.cep);
  if (cep.length !== 8) return receita;
  try {
    const r = await getJson(`https://viacep.com.br/ws/${cep}/json/`, deps);
    const v = r.json;
    if (!v || v.erro) return receita;
    return {
      ...receita,
      bairro: receita.bairro || String(v.bairro || '').trim().toUpperCase(),
      logradouro: receita.logradouro || String(v.logradouro || '').trim().toUpperCase(),
      ibge: receita.ibge || digits(v.ibge),
      municipio: receita.municipio || String(v.localidade || '').trim(),
      uf: receita.uf || String(v.uf || '').trim().toUpperCase(),
    };
  } catch (error) {
    log('WARN', `ViaCEP indisponível (${error.message}); sigo só com os dados da Receita.`);
    return receita;
  }
}

// ---------------------------------------------------------------------------
// GRM
// ---------------------------------------------------------------------------

// suppliers/getRecords devolve result=false com 'records_not_found' quando não há resultado.
async function buscarRegistros(token, path, body) {
  try {
    return safe((await grm(token, path, body)).searchData);
  } catch (error) {
    if (error.code === 'GRM_RECUSOU' && /records_not_found/i.test(error.message)) return [];
    throw error;
  }
}

// Procura o CNPJ no GRM (ativos e inativos). A busca por nome/CNPJ traz homônimos: só vale o mesmo documento.
async function buscarFornecedorGrm(token, cnpj) {
  for (const supStatus of ['A', 'N']) {
    const rows = await buscarRegistros(token, 'suppliers/getRecords', { supName: '', supDocument: '', supStatus, groupSearch: formatarCnpj(cnpj) });
    const achou = rows.find((r) => digits(r.supDocument) === cnpj);
    if (achou) return { ...achou, supStatus: achou.supStatus || supStatus };
  }
  return null;
}

async function carregarContexto(token) {
  const [categoriasFornecedor, tiposLogradouro, categoriasPagamento, coordenacoes, supervisoes] = await Promise.all([
    buscarRegistros(token, 'supplierCategory/getRecords', {}),
    buscarRegistros(token, 'address/getAddressTypes', {}),
    buscarRegistros(token, 'payInvoiceCategory/getRecords', {}),
    buscarRegistros(token, 'coordination/getForSelect', {}),
    buscarRegistros(token, 'supervision/getForSelect', { olsStatus: 'A' }),
  ]);
  const coordenacao = coordenacoes.find((c) => norm(c.olcName) === norm(COORDENACAO_PADRAO) && String(c.olcStatus || 'A') === 'A');
  if (!coordenacao) throw erro('COORDENACAO_NAO_ENCONTRADA', `Coordenação padrão "${COORDENACAO_PADRAO}" não existe (ativa) no GRM.`);
  const supervisao = supervisoes.find((s) => norm(s.olsName) === norm(SUPERVISAO_PADRAO) && Number(s.olcCode) === Number(coordenacao.olcCode));
  if (!supervisao) throw erro('SUPERVISAO_NAO_ENCONTRADA', `Supervisão padrão "${SUPERVISAO_PADRAO}" não existe (ativa) na coordenação ${coordenacao.olcName} do GRM.`);
  return {
    categoriasFornecedor,
    tiposLogradouro,
    categoriasPagamento,
    local: { olcCode: coordenacao.olcCode, olsCode: supervisao.olsCode },
    cidadesPorUf: new Map(),
  };
}

async function cidadesDaUf(token, ctx, uf) {
  if (!ctx.cidadesPorUf.has(uf)) ctx.cidadesPorUf.set(uf, await buscarRegistros(token, 'address/getCities', { staAbreviation: uf }));
  return ctx.cidadesPorUf.get(uf);
}

// A categoria de pagamento é a da NF (payInvoiceCategory folha); o grupo (pai) ajuda a derivar a do fornecedor.
function resolverCategoriaPagamento(nome, categorias) {
  const alvo = norm(nome);
  if (!alvo) throw erro('DADOS_INCOMPLETOS', 'A NF não informa a categoria; sem ela não dá para derivar as categorias do fornecedor. Cadastre manualmente no Graint.');
  const ativas = safe(categorias).filter((c) => String(c.picStatus || 'A') === 'A');
  const folha = ativas.find((c) => norm(c.picName) === alvo && Number(c.picParent) !== 0);
  if (!folha) throw erro('CATEGORIA_NF_NAO_ENCONTRADA', `A categoria da NF "${nome}" não existe (ativa) no GRM.`);
  return folha;
}

async function cadastrar(token, ctx, linha) {
  const cnpj = digits(linha.cnpj);
  const resultado = { cnpj, nome: linha.nome || null, avisos: [] };
  const aviso = (texto) => { resultado.avisos.push(texto); log('WARN', `${cnpj}: ${texto}`); };

  if (cnpj.length === 11) {
    throw erro('FORNECEDOR_PF', 'Fornecedor pessoa física (CPF): o cadastro automático só atende CNPJ, porque não há consulta de endereço por CPF. Cadastre manualmente no Graint e relance a NF.');
  }
  if (!cnpjValido(cnpj)) throw erro('CNPJ_INVALIDO', `O CNPJ ${linha.cnpj} é inválido (dígitos verificadores). Corrija na NF e relance.`);

  const existente = await buscarFornecedorGrm(token, cnpj);
  if (existente) {
    if (String(existente.supStatus) === 'A') {
      resultado.jaExistia = true;
      resultado.supCode = existente.supCode;
      resultado.nome = existente.supName;
      return resultado;
    }
    throw erro('FORNECEDOR_INATIVO_NO_GRM', `O fornecedor ${existente.supName} (código ${existente.supCode}) já existe no GRM, mas está INATIVO. Reative-o no Graint (Financeiro > Fornecedores) e relance a NF.`);
  }

  let receita = await consultarReceita(cnpj);
  const faltandoAntes = validarReceita(receita, cnpj);
  if (faltandoAntes.length) receita = await completarPeloCep(receita);
  const faltando = validarReceita(receita, cnpj);
  if (!receita.bairro) faltando.push('bairro');
  if (faltando.length) throw erro('DADOS_INCOMPLETOS', `A Receita não trouxe: ${[...new Set(faltando)].join(', ')}. Cadastre manualmente no Graint e relance a NF.`);
  receita = await completarPeloCep(receita);
  if (linha.nome && norm(linha.nome) !== norm(receita.razaoSocial) && !norm(receita.razaoSocial).includes(norm(linha.nome)) && !norm(linha.nome).includes(norm(receita.razaoSocial))) {
    aviso(`O nome na NF ("${linha.nome}") difere da razão social na Receita ("${receita.razaoSocial}"); cadastrado com o nome da Receita.`);
  }

  const categoriaNf = String(linha.categoria_nf || CATEGORIA_SIMULADA || '').trim();
  const categoriaPagamento = resolverCategoriaPagamento(categoriaNf, ctx.categoriasPagamento);
  const grupo = ctx.categoriasPagamento.find((c) => Number(c.picCode) === Number(categoriaPagamento.picParent));
  const { categoria: categoriaFornecedor, motivo } = derivarCategoriaFornecedor(categoriaNf, grupo?.picName || categoriaPagamento.picParentName, ctx.categoriasFornecedor);

  const cidade = resolverCidade(receita, await cidadesDaUf(token, ctx, receita.uf));
  if (!cidade) throw erro('CIDADE_NAO_ENCONTRADA', `A cidade "${receita.municipio}/${receita.uf}" (IBGE ${receita.ibge || '?'}) não foi encontrada no GRM. Cadastre manualmente no Graint e relance a NF.`);
  const tipoLogradouro = resolverTipoLogradouro(receita, ctx.tiposLogradouro);
  if (!tipoLogradouro) throw erro('TIPO_LOGRADOURO_NAO_ENCONTRADO', 'Não achei o tipo de logradouro (Rua) no GRM.');
  if (tipoLogradouro.padrao) aviso(`Tipo de logradouro não identificado ("${receita.tipoLogradouro || receita.logradouro}"): usado Rua.`);

  const payload = montarPayload({
    cnpj, receita, categoriaFornecedor, categoriaPagamento, local: ctx.local, tipoLogradouro: tipoLogradouro.tipo, cidade, aviso,
  });
  resultado.nome = payload.supName;
  resultado.resolvido = {
    fonteReceita: receita.fonte,
    categoriaFornecedor: `${categoriaFornecedor.scaName} (${categoriaFornecedor.scaCode}) - ${motivo}`,
    categoriaPagamento: `${categoriaPagamento.picName} (${categoriaPagamento.picCode})`,
    cidade: `${cidade.citName}/${receita.uf} (${cidade.citCode})`,
    tipoLogradouro: tipoLogradouro.tipo.satName,
  };
  resultado.payload = payload;

  if (DRY_RUN) {
    log('INFO', `DRY_RUN: suppliers/setRecord NÃO enviado. Payload:`, payload);
    resultado.dryRun = true;
    return resultado;
  }

  try {
    await grmEscrever(token, 'suppliers/setRecord', payload);
  } catch (error) {
    // Resposta perdida/recusada: confere se o GRM gravou mesmo assim antes de falhar.
    if (!(await buscarFornecedorGrm(token, cnpj))) throw erro(error.code || 'FORNECEDOR_FALHOU', `Cadastro do fornecedor falhou: ${error.message}`, resultado);
    log('WARN', `Fornecedor ${cnpj} apareceu no GRM apesar do erro (${error.message}); seguindo.`);
  }
  const gravado = await buscarFornecedorGrm(token, cnpj);
  if (!gravado) throw erro('FORNECEDOR_NAO_CONFIRMADO', `O GRM respondeu OK mas o fornecedor ${formatarCnpj(cnpj)} não apareceu na consulta. Confira no Graint antes de reenviar.`, resultado);
  resultado.supCode = gravado.supCode;
  resultado.criado = true;
  log('SUCCESS', `Fornecedor ${formatarCnpj(cnpj)} criado no GRM: ${gravado.supName} (código ${gravado.supCode}).`);
  return resultado;
}

// ---------------------------------------------------------------------------
// Fila
// ---------------------------------------------------------------------------

function resumo(r) {
  if (r.dryRun) return `DRY_RUN: criaria o fornecedor ${formatarCnpj(r.cnpj)} (${r.nome}).`;
  return `Fornecedor ${formatarCnpj(r.cnpj)} ${r.jaExistia ? 'já existia' : 'criado'} no GRM (${r.nome}, código ${r.supCode}).${r.avisos?.length ? ` Atenção: ${r.avisos.join(' ')}` : ''}`;
}

async function updateLinha(id, patch) {
  const { error } = await getSupabase().from('grm_fornecedor_cadastros').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

async function claimNext() {
  const { data, error } = await getSupabase().rpc('claim_next_grm_fornecedor_cadastro');
  if (error) throw error;
  return data && data.id ? data : null;
}

async function contarPendentes() {
  const { count, error } = await getSupabase()
    .from('grm_fornecedor_cadastros')
    .select('id', { count: 'exact', head: true })
    .in('status', ['PENDENTE', 'PROCESSANDO']);
  if (error) throw error;
  return count || 0;
}

const NF_ERRO_FORNECEDOR = '%não encontrado no GRM (suppliers)%';

// NFs paradas por causa desse CNPJ.
async function nfsParadas(cnpj) {
  const { data, error } = await getSupabase()
    .from('grm_nf_lancamentos')
    .select('id, erro, fornecedor_cnpj')
    .eq('status', 'ERRO')
    .like('erro', NF_ERRO_FORNECEDOR)
    .in('fornecedor_cnpj', [cnpj, formatarCnpj(cnpj)]);
  if (error) throw error;
  return data || [];
}

// Concluído: as NFs voltam para NOVO (o gatilho nf_lancamento_enfileirar_job cria o job do agente de NF).
async function relancarNfs(cnpj) {
  const nfs = await nfsParadas(cnpj);
  if (!nfs.length) return 0;
  const { error } = await getSupabase()
    .from('grm_nf_lancamentos')
    .update({ status: 'NOVO', erro: null })
    .in('id', nfs.map((n) => n.id));
  if (error) throw error;
  return nfs.length;
}

// Falha definitiva: troca o texto "solicitado" por um que diga o que aconteceu.
async function avisarNfsDoErro(cnpj, mensagem) {
  const nfs = await nfsParadas(cnpj);
  for (const nf of nfs) {
    const original = String(nf.erro || '').split(' Cadastro automático do fornecedor')[0].trim();
    const texto = `${original} Cadastro automático do fornecedor falhou: ${mensagem}`.slice(0, 4000);
    const { error } = await getSupabase().from('grm_nf_lancamentos').update({ erro: texto }).eq('id', nf.id);
    if (error) log('WARN', `Não atualizei o erro da NF ${nf.id}: ${error.message}`);
  }
}

const ERROS_DEFINITIVOS = new Set([
  'FORNECEDOR_PF', 'CNPJ_INVALIDO', 'CNPJ_INATIVO', 'CNPJ_NAO_ENCONTRADO', 'DADOS_INCOMPLETOS', 'FORNECEDOR_INATIVO_NO_GRM',
  'CATEGORIA_NF_NAO_ENCONTRADA', 'CATEGORIA_FORNECEDOR_NAO_ENCONTRADA', 'CIDADE_NAO_ENCONTRADA', 'TIPO_LOGRADOURO_NAO_ENCONTRADO',
  'COORDENACAO_NAO_ENCONTRADA', 'SUPERVISAO_NAO_ENCONTRADA', 'FORNECEDOR_NAO_CONFIRMADO', 'GRM_RECUSOU', 'FORNECEDOR_FALHOU',
]);

async function processar(token, ctx) {
  let processed = 0;
  let errors = 0;
  for (let index = 0; index < MAX_PER_RUN; index += 1) {
    const linha = await claimNext();
    if (!linha) break;
    processed += 1;
    watchdogCurrentId = linha.id;
    try {
      const resultado = await cadastrar(token, ctx, linha);
      const relancadas = await relancarNfs(digits(linha.cnpj));
      await updateLinha(linha.id, {
        status: 'CONCLUIDO',
        mensagem: `${resumo(resultado)}${relancadas ? ` ${relancadas} NF(s) voltaram para a fila.` : ''}`,
        sup_code: resultado.supCode || null,
        dados: resultado.payload ? { ...resultado.resolvido, avisos: resultado.avisos } : { avisos: resultado.avisos },
        concluido_em: new Date().toISOString(),
        travado_em: null,
      });
      log('SUCCESS', `${linha.cnpj}: ${resumo(resultado)}${relancadas ? ` ${relancadas} NF(s) relançada(s).` : ''}`);
    } catch (error) {
      errors += 1;
      // Dado errado não se resolve sozinho: vai direto para ERRO. Falha de rede/Receita volta para a fila
      // (o cron de 5 min reenfileira) até MAX_TENTATIVAS.
      const definitivo = ERROS_DEFINITIVOS.has(error.code);
      const esgotou = definitivo || Number(linha.tentativas || 0) >= MAX_TENTATIVAS;
      await updateLinha(linha.id, { status: esgotou ? 'ERRO' : 'PENDENTE', mensagem: error.message, travado_em: null });
      if (esgotou) await avisarNfsDoErro(digits(linha.cnpj), error.message).catch((e) => log('WARN', `Aviso nas NFs falhou: ${e.message}`));
      log('ERROR', `${linha.cnpj}: ${error.message}`);
    } finally {
      watchdogCurrentId = null;
    }
  }
  return { processed, errors };
}

async function dryRun(token, ctx) {
  let query = getSupabase().from('grm_fornecedor_cadastros').select('*').order('created_at', { ascending: true });
  if (ONLY_CNPJ) query = query.eq('cnpj', ONLY_CNPJ);
  else query = query.in('status', ['PENDENTE', 'ERRO']);
  const resp = await query.limit(MAX_PER_RUN);
  if (resp.error) throw resp.error;
  let linhas = resp.data || [];
  if (!linhas.length && ONLY_CNPJ) linhas = [{ cnpj: ONLY_CNPJ, nome: null, categoria_nf: CATEGORIA_SIMULADA }];
  if (!linhas.length) log('INFO', 'DRY_RUN: nenhuma linha para validar.');
  let errors = 0;
  for (const linha of linhas) {
    try {
      const resultado = await cadastrar(token, ctx, linha);
      log('INFO', `DRY_RUN ${linha.cnpj}: ${resultado.jaExistia ? `já existe no GRM (${resultado.nome}, código ${resultado.supCode})` : resumo(resultado)}`, resultado.resolvido);
    } catch (err) {
      errors += 1;
      log('ERROR', `DRY_RUN ${linha.cnpj}: [${err.code || 'ERRO'}] ${err.message}`);
    }
  }
  return { processed: linhas.length, errors };
}

async function main() {
  log('INFO', `Iniciando agente de cadastro de fornecedor no GRM (dry_run=${DRY_RUN}).`);
  if (!DRY_RUN) {
    const pendentes = await contarPendentes();
    if (!pendentes) {
      log('INFO', 'Nenhum fornecedor aguardando cadastro no GRM.');
      return;
    }
  }
  const token = await login();
  const ctx = await carregarContexto(token);
  log('INFO', `Contexto: ${ctx.categoriasFornecedor.length} categoria(s) de fornecedor, ${ctx.tiposLogradouro.length} tipo(s) de logradouro, ${ctx.categoriasPagamento.length} categoria(s) de pagamento; local ${COORDENACAO_PADRAO} / ${SUPERVISAO_PADRAO}.`);
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
      updateLinha(watchdogCurrentId, { status: 'PENDENTE', travado_em: null, mensagem: 'Watchdog: execução interrompida, volta pra fila.' }),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]).finally(() => process.exit(1));
  }, TIMEOUT_MIN * 60 * 1000).unref();
}

module.exports = {
  cnpjValido, formatarCnpj, formatarCep, formatarTelefone, emailValido,
  normalizarBrasilApi, normalizarReceitaWs, resolverTipoLogradouro, resolverCidade,
  derivarCategoriaFornecedor, validarReceita, montarPayload, resolverCategoriaPagamento,
  consultarReceita, completarPeloCep,
};
