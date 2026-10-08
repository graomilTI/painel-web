#!/usr/bin/env node

/**
 * Cadastra no GRM (Graint) um veículo novo cadastrado no painel (Frotas > Veículos),
 * nas DUAS telas onde o GRM guarda veículo:
 *
 *   1. Patrimônios  -> patrimonies/setRecord  (categoria VEICULOS, tipo "M" Material,
 *                      identificação "PLACA MARCA MODELO COR", igual aos ~315 já cadastrados)
 *   2. Veículos     -> vehicle/setRecord      (placa com hífen, marca/modelo do catálogo,
 *                      Próprio/Alugado/Terceiro, Hodômetro, Cor, Ano...)
 *
 * Fila: colunas grm_cadastro_* de public.frotas_veiculos (PENDENTE -> PROCESSANDO ->
 * CONCLUIDO | ERRO), reivindicadas com claim_next_frotas_veiculo_grm_cadastro(). O job em
 * grm_sync_jobs é criado pelo gatilho da migration 20261008180000 (ao cadastrar o veículo ou
 * clicar em "Reenviar ao GRM") e por um cron de segurança de 5 min.
 *
 * Os campos dos dois formulários foram lidos nos bundles públicos do Graint
 * (assets/Patrimony-*.js e assets/Vehicles-*.js) e os registros reais (patType, supCode,
 * formato de vehName/patName, catálogo de marcas) conferidos por leitura em 08/10/2026:
 *
 *   Patrimônio: patNumber (digitado), patName, pcaCode=70 VEICULOS, patType='M',
 *     pbrCode, pmoCode, olcCode, olsCode, staCode, patSituation (E/A/M/B), supCode, oldPatNumber=null.
 *     O formulário é multipart (isMultipart) quando cfgEnableCloudFlareR2 != 'S'; o agente
 *     faz igual (FormData, null -> "").
 *   Veículo: vehName/vehLicensePlate ("ABC-1D23"), vehRenavam, pbrCode, pmoCode, vehHodometer,
 *     vehColor, vehYear, vehType (P/A/T), olcCode, olsCode, staCode; Alugado exige
 *     vehRentalMonthValue + vehRentalMonthDay, Terceiro exige vehValueKilometer.
 *     vehChassis/vehYearModel existem no registro mas não no formulário: vão como melhor
 *     esforço (se o GRM recusar, reenvia sem eles e avisa na mensagem).
 *
 * Marca e modelo precisam existir no catálogo do GRM (o agente NÃO cria catálogo: o catálogo
 * tem marcas duplicadas por nome — FIAT 147 e 225 — e criar por texto livre pioraria isso).
 * Sem correspondência, o veículo vai pra ERRO com sugestões e o usuário corrige e reenvia.
 *
 * Idempotente: se a placa já existe em Patrimônios e/ou Veículos, só cria a tela que falta,
 * então reenviar depois de um erro no meio nunca duplica.
 *
 * Uso:
 *   node grmserver-cadastrar-veiculo-api.js                       # processa a fila
 *   node grmserver-cadastrar-veiculo-api.js --dry-run [--id=<uuid> | --placa=ABC1D23] [--forcar-novo]
 *       # só lê o GRM e mostra o que enviaria; --forcar-novo ignora o que já existe no GRM
 *       # (pra ver o payload de um veículo que já está cadastrado). Nunca grava no GRM.
 *   node grmserver-cadastrar-veiculo-api.js --dry-run --simular=arquivo.json [--forcar-novo]
 *       # veículo fictício (JSON com os campos de frotas_veiculos), sem linha no banco
 *   node grmserver-cadastrar-veiculo-api.js --catalogo            # só atualiza grm_veiculo_catalogo
 */

require('dotenv').config();
const fs = require('fs');
const https = require('https');
const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');

const GRM_BASE_URL = String(process.env.GRMSERVER_API_URL || 'https://www.grmserver.com.br/api/').replace(/\/?$/, '/');
const DRY_RUN = process.argv.includes('--dry-run')
  || String(process.env.GRM_CADASTRAR_VEICULO_DRY_RUN || 'false').toLowerCase() === 'true';
const SO_CATALOGO = process.argv.includes('--catalogo');
const FORCAR_NOVO = process.argv.includes('--forcar-novo');
const argValor = (prefixo) => (process.argv.find((arg) => arg.startsWith(prefixo)) || '').slice(prefixo.length) || null;
const ONLY_ID = argValor('--id=');
const ONLY_PLACA = argValor('--placa=');
const SIMULAR = argValor('--simular=');
const MAX_PER_RUN = Math.max(1, Number(process.env.GRM_CADASTRAR_VEICULO_MAX_POR_EXECUCAO || 10));
const MAX_TENTATIVAS = 3;
const TIMEOUT_MIN = 10;
const CATEGORIA_VEICULOS = 'VEICULOS';

const GRM_WEB_HEADERS = {
  origin: 'https://www.grmserver.com.br',
  referer: 'https://www.grmserver.com.br/login',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

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

function log(level, message, extra) {
  const suffix = extra === undefined ? '' : ` ${JSON.stringify(extra)}`;
  console.log(`[${level}] ${new Date().toISOString()} - ${message}${suffix}`);
}

function erro(code, message, extra) {
  const error = new Error(message);
  error.code = code;
  if (extra) error.resultado = extra;
  return error;
}

// ---------------------------------------------------------------------------
// Funções puras (testadas em test-cadastrar-veiculo.js)
// ---------------------------------------------------------------------------

function norm(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function safe(data) { return Array.isArray(data) ? data : []; }

function placaLimpa(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// "ABC1D23" -> "ABC-1D23" (máscara do campo Placa do Graint; é como os 332 veículos estão gravados).
function formatPlacaGrm(value) {
  const p = placaLimpa(value);
  return p.length === 7 ? `${p.slice(0, 3)}-${p.slice(3)}` : p;
}

// Chave tolerante: Mercosul (5ª posição A-J) == placa antiga com o dígito 0-9 correspondente.
// Mesma regra de public.frotas_chave_placa().
function chavePlaca(value) {
  const p = placaLimpa(value);
  if (p.length === 7 && /[A-J]/.test(p[4])) return p.slice(0, 4) + String(p.charCodeAt(4) - 65) + p.slice(5);
  return p;
}

function placasNoTexto(texto) {
  const t = String(texto ?? '').toUpperCase();
  return [...t.matchAll(/[A-Z]{3}[- ]?[0-9][A-Z0-9][0-9]{2}/g)].map((m) => placaLimpa(m[0]));
}

// Texto livre do painel (coluna tipo) -> código do GRM. "PROPIO" aparece em 2 veículos antigos.
function tipoParaGrm(tipo) {
  const t = norm(tipo);
  if (!t) return null;
  if (/^(P|PROPRIO|PROPIO|PROPRIA)$/.test(t)) return 'P';
  if (/^(A|ALUGADO|ALUGADA|LOCADO|LOCADA|LOCACAO|LOCAL|ALUGUEL)$/.test(t)) return 'A';
  if (/^(T|TERCEIRO|TERCEIRIZADO|TERCEIRA|TERCEIROS)$/.test(t)) return 'T';
  return null;
}

// status do painel -> patSituation do GRM (E Estoque, A Em Uso, M Manutenção, B Baixado).
function situacaoParaGrm(status) {
  switch (norm(status)) {
    case 'MANUTENCAO': return 'M';
    case 'VENDIDO': return 'B';
    case 'INATIVO': return 'E';
    default: return 'A';
  }
}

function validarDados(veic) {
  const faltando = [];
  const placa = placaLimpa(veic.placa);
  if (placa.length !== 7) faltando.push('Placa (7 caracteres)');
  const renavam = digits(veic.renavam);
  if (renavam.length < 9 || renavam.length > 11) faltando.push('Renavam (9 a 11 números)');
  if (!String(veic.marca ?? '').trim()) faltando.push('Marca');
  if (!String(veic.modelo ?? '').trim()) faltando.push('Modelo');
  const ano = Number(veic.ano);
  if (!Number.isInteger(ano) || ano < 1950 || ano > new Date().getFullYear() + 1) faltando.push('Ano (4 dígitos)');
  if (!String(veic.cor ?? '').trim()) faltando.push('Cor');
  const tipo = tipoParaGrm(veic.tipo);
  if (!tipo) faltando.push('Tipo (Próprio, Alugado ou Terceiro)');
  const numero = digits(veic.grm_patrimonio_numero);
  if (!numero || numero.length > 9 || numero !== String(veic.grm_patrimonio_numero ?? '').trim()) faltando.push('Patrimônio (só números, até 9 dígitos)');
  if (!String(veic.coordenacao ?? '').trim() && !String(veic.supervisao ?? '').trim() && !String(veic.motorista_atual ?? '').trim()) {
    faltando.push('Coordenação (ou Supervisão/Funcionário)');
  }
  if (tipo === 'A') {
    if (!(Number(veic.valor_mensal) > 0)) faltando.push('Valor mensal (veículo Alugado)');
    const dia = Number(veic.dia_vencimento);
    if (!Number.isInteger(dia) || dia < 1 || dia > 31) faltando.push('Dia de vencimento 1-31 (veículo Alugado)');
  }
  if (tipo === 'T' && !(Number(veic.valor_km) > 0)) faltando.push('R$/Km (veículo Terceirizado)');
  return faltando;
}

function usoPorChave(lista, campo) {
  const uso = new Map();
  for (const row of lista) {
    const k = Number(row[campo]);
    if (k) uso.set(k, (uso.get(k) || 0) + 1);
  }
  return uso;
}

// O catálogo tem a mesma marca com mais de um código (FIAT 147/225, CHEVROLET 156/235...):
// escolhe o código mais usado pelos veículos/patrimônios já cadastrados.
function resolverMarca(nomeDigitado, marcas, usoMarca) {
  const alvo = norm(nomeDigitado);
  const ativas = safe(marcas).filter((m) => String(m.pbrStatus || 'A') === 'A');
  let candidatas = ativas.filter((m) => norm(m.pbrName) === alvo);
  if (!candidatas.length) {
    // "VW"/"VOLKSWAGEN" -> "VOLKSWAGEN/VW": confere cada parte separada por / - ,
    candidatas = ativas.filter((m) => norm(m.pbrName).split(/[/\-,]/).map((p) => p.trim()).includes(alvo));
  }
  if (!candidatas.length) {
    const nomes = [...new Set(ativas.map((m) => String(m.pbrName).trim()))].sort();
    throw erro('MARCA_NAO_ENCONTRADA', `Marca "${nomeDigitado}" não existe no catálogo do GRM. Marcas disponíveis: ${nomes.join(', ')}. Escolha uma da lista (ou peça o cadastro da marca no GRM) e reenvie.`);
  }
  candidatas.sort((a, b) => (usoMarca.get(b.pbrCode) || 0) - (usoMarca.get(a.pbrCode) || 0) || a.pbrCode - b.pbrCode);
  return candidatas[0];
}

function normModelo(nome, marcaNome) {
  let m = norm(nome);
  const prefixos = [norm(marcaNome), ...norm(marcaNome).split(/[/\-,]/).map((p) => p.trim())].filter(Boolean);
  for (const p of prefixos) {
    if (m.startsWith(`${p} `)) { m = m.slice(p.length + 1).trim(); break; }
    if (m.startsWith(`${p}/`)) { m = m.slice(p.length + 1).trim(); break; }
  }
  return m;
}

// Devolve { pbrCode, pbrName, pmoCode, pmoName }. O modelo manda: se ele pertence a um código de
// marca irmão (mesmo nome), usa esse código, pra marca e modelo ficarem consistentes no GRM.
function resolverModelo(nomeDigitado, marcaEscolhida, marcas, modelos, usoModelo) {
  const irmaos = safe(marcas).filter((m) => norm(m.pbrName) === norm(marcaEscolhida.pbrName)).map((m) => m.pbrCode);
  const doGrupo = safe(modelos).filter((m) => String(m.pmoStatus || 'A') === 'A' && irmaos.includes(m.pbrCode));
  const alvo = normModelo(nomeDigitado, marcaEscolhida.pbrName);
  const ordenar = (lista) => lista.sort((a, b) => (usoModelo.get(b.pmoCode) || 0) - (usoModelo.get(a.pmoCode) || 0)
    || (b.pbrCode === marcaEscolhida.pbrCode) - (a.pbrCode === marcaEscolhida.pbrCode)
    || a.pmoCode - b.pmoCode);

  let candidatos = doGrupo.filter((m) => norm(m.pmoName) === alvo);
  if (!candidatos.length) {
    // Digitou menos do que o catálogo ("ARGO 1.0" -> "ARGO 1.0 6V FLEX"): só aceita se for único.
    const porPrefixo = doGrupo.filter((m) => norm(m.pmoName).startsWith(`${alvo} `));
    if (new Set(porPrefixo.map((m) => norm(m.pmoName))).size === 1) candidatos = porPrefixo;
  }
  if (!candidatos.length) {
    const primeira = alvo.split(' ')[0];
    const parecidos = [...new Set(doGrupo.filter((m) => norm(m.pmoName).startsWith(primeira)).map((m) => String(m.pmoName).trim()))].sort();
    const todos = [...new Set(doGrupo.map((m) => String(m.pmoName).trim()))].sort();
    throw erro('MODELO_NAO_ENCONTRADO', `Modelo "${nomeDigitado}" não existe para a marca ${String(marcaEscolhida.pbrName).trim()} no catálogo do GRM. ${parecidos.length ? `Parecidos: ${parecidos.join(', ')}.` : `Modelos da marca: ${todos.join(', ') || 'nenhum'}.`} Escolha um da lista (ou peça o cadastro do modelo no GRM) e reenvie.`);
  }
  const m = ordenar(candidatos)[0];
  const marca = safe(marcas).find((x) => x.pbrCode === m.pbrCode) || marcaEscolhida;
  return { pbrCode: m.pbrCode, pbrName: String(marca.pbrName).trim(), pmoCode: m.pmoCode, pmoName: String(m.pmoName).trim() };
}

function sugestoes(nomes, alvo) {
  const a = norm(alvo);
  const lista = [...new Set(nomes.map((n) => String(n).trim()))].sort();
  const parecidas = lista.filter((n) => norm(n).includes(a) || a.includes(norm(n)));
  return (parecidas.length ? parecidas : lista).slice(0, 12).join(', ');
}

// Coordenação/Supervisão/Funcionário do painel -> códigos do GRM. O Graint só deixa escolher
// funcionário da supervisão e supervisão da coordenação; aqui vale a mesma regra.
function resolverLocal(ctx, { coordenacao, supervisao }, staff) {
  const sup = String(supervisao ?? '').trim() ? ctx.supervisaoPorNome.get(norm(supervisao)) : null;
  if (String(supervisao ?? '').trim() && !sup) {
    throw erro('SUPERVISAO_NAO_ENCONTRADA', `Supervisão "${supervisao}" não existe (ativa) no GRM. Parecidas: ${sugestoes([...ctx.supervisaoPorNome.values()].map((s) => s.olsName), supervisao)}.`);
  }
  const coord = String(coordenacao ?? '').trim() ? ctx.coordenacaoPorNome.get(norm(coordenacao)) : null;
  if (String(coordenacao ?? '').trim() && !coord) {
    throw erro('COORDENACAO_NAO_ENCONTRADA', `Coordenação "${coordenacao}" não existe (ativa) no GRM. Parecidas: ${sugestoes([...ctx.coordenacaoPorNome.values()].map((c) => c.olcName), coordenacao)}.`);
  }
  if (sup && coord && Number(sup.olcCode) !== Number(coord.olcCode)) {
    throw erro('LOCAL_DIVERGENTE', `No GRM a supervisão "${sup.olsName}" pertence à coordenação "${sup.olcName}", não a "${coord.olcName}". Ajuste Coordenação/Supervisão e reenvie.`);
  }
  let olcCode = coord ? coord.olcCode : sup ? sup.olcCode : null;
  let olsCode = sup ? sup.olsCode : null;
  if (staff) {
    if (sup && Number(staff.olsCode) !== Number(sup.olsCode)) {
      throw erro('FUNCIONARIO_SUPERVISAO_DIVERGENTE', `No GRM ${staff.staName} está na supervisão "${staff.olsName}", não em "${sup.olsName}". O Graint só permite funcionário da própria supervisão: ajuste a Supervisão ou o Funcionário e reenvie.`);
    }
    if (!olcCode) olcCode = staff.olcCode;
    if (!olsCode) olsCode = staff.olsCode;
    if (coord && Number(staff.olcCode) !== Number(coord.olcCode)) {
      throw erro('FUNCIONARIO_SUPERVISAO_DIVERGENTE', `No GRM ${staff.staName} está na coordenação "${staff.olcName}", não em "${coord.olcName}". Ajuste a Coordenação ou o Funcionário e reenvie.`);
    }
  }
  if (!olcCode) throw erro('DADOS_INCOMPLETOS', 'Informe a Coordenação (ou Supervisão/Funcionário) para cadastrar no GRM.');
  return { olcCode, olsCode: olsCode || null };
}

function montarPatName(placa, marcaNome, modeloNome, cor) {
  return [placaLimpa(placa), norm(marcaNome), norm(modeloNome), norm(cor)].filter(Boolean).join(' ');
}

// Mesma forma do recordData que a tela de Patrimônio monta (Te + campos do formulário).
function montarPayloadPatrimonio({ veic, marca, local, staCode, pcaCode }) {
  return {
    patNumber: digits(veic.grm_patrimonio_numero),
    oldPatNumber: null,
    patName: montarPatName(veic.placa, marca.pbrName, marca.pmoName, veic.cor),
    pcaCode,
    pbrCode: marca.pbrCode,
    pmoCode: marca.pmoCode,
    olcCode: local.olcCode,
    olsCode: local.olsCode,
    staCode: staCode || null,
    patSituation: situacaoParaGrm(veic.status),
    patType: 'M',
    patComments: '',
    patAcquisitionDate: '',
    supCode: null,
    patSerialNumber: '',
    patIMEI: '',
    patPhoneLine: '',
    patIsPersonal: null,
  };
}

// Mesma forma do recordData da tela de Veículos (ue + campos), mais chassi/ano-modelo.
function montarPayloadVeiculo({ veic, marca, local, staCode }, { comExtras = true } = {}) {
  const tipo = tipoParaGrm(veic.tipo);
  const placaFmt = formatPlacaGrm(veic.placa);
  const payload = {
    vehName: placaFmt,
    vehLicensePlate: placaFmt,
    vehRenavam: digits(veic.renavam),
    pbrCode: marca.pbrCode,
    pmoCode: marca.pmoCode,
    vehHodometer: Math.max(0, Math.round(Number(veic.hodometro) || 0)),
    vehColor: norm(veic.cor),
    olcCode: local.olcCode,
    olsCode: local.olsCode,
    staCode: staCode || null,
    vehYear: Number(veic.ano),
    vehType: tipo,
    vehRentalMonthValue: tipo === 'A' ? Number(veic.valor_mensal) : null,
    vehRentalMonthDay: tipo === 'A' ? Number(veic.dia_vencimento) : null,
    vehValueKilometer: tipo === 'T' ? Number(veic.valor_km) : null,
  };
  if (comExtras) {
    const chassi = placaLimpa(veic.chassi);
    if (chassi) payload.vehChassis = chassi;
    const anoModelo = Number(veic.ano_modelo) || Number(veic.ano);
    if (anoModelo) payload.vehYearModel = anoModelo;
  }
  return payload;
}

// ---------------------------------------------------------------------------
// GRM
// ---------------------------------------------------------------------------

function requestJson(url, method = 'GET', body = null, headers = {}) {
  const parsed = new URL(url);
  const payload = body == null ? '' : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: `${parsed.pathname}${parsed.search}`,
      method,
      timeout: 60000,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let data;
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          const e = new Error(`GRM retornou conteúdo inválido (HTTP ${response.statusCode}).`);
          e.http = response.statusCode;
          reject(e);
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const e = new Error(`GRM respondeu HTTP ${response.statusCode}: ${data.message || 'erro'}`);
          e.http = response.statusCode;
          reject(e);
          return;
        }
        resolve(data);
      });
    });
    request.on('timeout', () => request.destroy(new Error('Timeout ao consultar o GRM.')));
    request.on('error', reject);
    request.end(payload || undefined);
  });
}
function postJson(url, body, headers = {}) { return requestJson(url, 'POST', body, headers); }
function authHeaders(token) { return { ...GRM_WEB_HEADERS, authorization: `Bearer ${token}` }; }
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Leitura: tenta de novo em 5xx/timeout (GRM às vezes devolve 502 — ver 29/09).
async function grm(token, path, body) {
  let ultimo;
  for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
    try {
      const response = await postJson(`${GRM_BASE_URL}${path}`, body, authHeaders(token));
      if (!response.result) throw erro('GRM_RECUSOU', `${path} falhou: ${response.message || 'erro'}`);
      return response;
    } catch (error) {
      ultimo = error;
      const transitorio = !error.code && (!error.http || error.http >= 500);
      if (!transitorio || tentativa === 3) break;
      await dormir(2000 * tentativa);
    }
  }
  throw ultimo;
}

// Escrita: uma tentativa só (nunca reenviar às cegas); quem chama confere no GRM depois.
async function grmEscrever(token, path, record, { multipart = false } = {}) {
  let response;
  if (multipart) {
    const form = new FormData();
    for (const [chave, valor] of Object.entries(record)) form.append(chave, valor === null || valor === undefined ? '' : String(valor));
    const res = await fetch(`${GRM_BASE_URL}${path}`, { method: 'POST', headers: authHeaders(token), body: form });
    const texto = await res.text();
    try {
      response = texto ? JSON.parse(texto) : {};
    } catch {
      throw erro('GRM_RESPOSTA_INVALIDA', `${path}: GRM retornou conteúdo inválido (HTTP ${res.status}).`);
    }
    if (!res.ok) throw erro('GRM_RECUSOU', `${path}: GRM respondeu HTTP ${res.status}: ${response.message || 'erro'}`);
  } else {
    response = await postJson(`${GRM_BASE_URL}${path}`, record, authHeaders(token));
  }
  if (!response.result) throw erro('GRM_RECUSOU', `${path} recusado pelo GRM: ${response.message || 'sem mensagem'}`);
  return response;
}

// Token em cache compartilhado (grm-token-cache.js): evita login a cada execução
// e o captcha_invalid que o GRM passou a devolver em 30/09/2026.
const { obterTokenGrm } = require('./grm-token-cache');
async function login() {
  return obterTokenGrm({ login: loginDireto });
}

async function loginDireto() {
  const userEmail = process.env.GRMSERVER_USER;
  const userPass = process.env.GRMSERVER_PASSWORD;
  if (!userEmail || !userPass) throw new Error('Credenciais GRMSERVER_USER/GRMSERVER_PASSWORD ausentes.');
  const response = await postJson(`${GRM_BASE_URL}user/login`, {
    userEmail,
    userPass,
    loginInfo: {
      ip: '', browser: 'GRM API Agent', browserVersion: '1.0',
      engine: 'Node.js', engineVersion: process.version,
      platform: process.platform, screenSize: '', windowSize: '',
    },
  }, GRM_WEB_HEADERS);
  if (!response.result || !response.token) throw new Error(`Login GRM recusado: ${response.message || 'sem token'}`);
  return response.token;
}

async function carregarContexto(token) {
  const [coordenacoes, supervisoes, categorias, marcas, modelos] = await Promise.all([
    grm(token, 'coordination/getForSelect', {}),
    grm(token, 'supervision/getForSelect', { olsStatus: 'A' }),
    grm(token, 'patrimonyCategory/getRecords', {}),
    grm(token, 'patrimonyBrand/getRecords', {}),
    grm(token, 'patrimonyModel/getRecords', {}),
  ]);
  const coordenacaoPorNome = new Map();
  for (const c of safe(coordenacoes.searchData)) if (c.olcName && String(c.olcStatus || 'A') === 'A') coordenacaoPorNome.set(norm(c.olcName), c);
  const supervisaoPorNome = new Map();
  for (const s of safe(supervisoes.searchData)) if (s.olsName) supervisaoPorNome.set(norm(s.olsName), s);
  const categoria = safe(categorias.searchData).find((c) => norm(c.pcaName) === CATEGORIA_VEICULOS && String(c.pcaStatus || 'A') === 'A');

  // R2 ligado = o Graint manda JSON; desligado = multipart (padrão do front). Falha na leitura = multipart.
  let multipartPatrimonio = true;
  try {
    const cfg = await grm(token, 'sysConfig/getSysConfig', {});
    const dados = Array.isArray(cfg.searchData) ? cfg.searchData[0] : cfg.searchData;
    if (dados && dados.cfgEnableCloudFlareR2 === 'S') multipartPatrimonio = false;
    log('INFO', `cfgEnableCloudFlareR2=${dados ? dados.cfgEnableCloudFlareR2 : 'n/d'} -> patrimonies/setRecord em ${multipartPatrimonio ? 'multipart' : 'JSON'}.`);
  } catch (error) {
    log('WARN', `Não consegui ler sysConfig (${error.message}); usando multipart no Patrimônio.`);
  }

  return {
    coordenacaoPorNome,
    supervisaoPorNome,
    pcaVeiculos: categoria ? categoria.pcaCode : null,
    marcas: safe(marcas.searchData),
    modelos: safe(modelos.searchData),
    multipartPatrimonio,
  };
}

async function atualizarCatalogo(ctx) {
  const agora = new Date().toISOString();
  const linhas = [];
  for (const m of ctx.marcas) {
    if (String(m.pbrStatus || 'A') !== 'A') continue;
    linhas.push({ pbr_code: m.pbrCode, pmo_code: 0, marca: String(m.pbrName).trim(), modelo: null, atualizado_em: agora });
  }
  for (const mo of ctx.modelos) {
    if (String(mo.pmoStatus || 'A') !== 'A') continue;
    const marca = ctx.marcas.find((m) => m.pbrCode === mo.pbrCode);
    if (!marca) continue;
    linhas.push({ pbr_code: mo.pbrCode, pmo_code: mo.pmoCode, marca: String(marca.pbrName).trim(), modelo: String(mo.pmoName).trim(), atualizado_em: agora });
  }
  if (!linhas.length) return;
  const sb = getSupabase();
  const { error } = await sb.from('grm_veiculo_catalogo').upsert(linhas, { onConflict: 'pbr_code,pmo_code' });
  if (error) { log('WARN', `Catálogo de marcas/modelos não atualizado: ${error.message}`); return; }
  await sb.from('grm_veiculo_catalogo').delete().lt('atualizado_em', agora);
  log('INFO', `Catálogo de marcas/modelos atualizado (${linhas.length} linha(s)).`);
}

async function buscarFuncionario(token, nome) {
  const alvo = norm(nome);
  const response = await grm(token, 'staff/getRecords', { staName: '', staCPF: '', staEmail: '', staStatus: 'A', groupSearch: String(nome).trim() });
  const exatos = safe(response.searchData).filter((s) => norm(s.staName) === alvo);
  if (exatos.length === 1) return exatos[0];
  if (exatos.length > 1) {
    throw erro('FUNCIONARIO_AMBIGUO', `Há ${exatos.length} funcionários ativos chamados "${nome}" no GRM. Ajuste o nome no painel e reenvie.`);
  }
  const parecidos = safe(response.searchData).map((s) => s.staName).slice(0, 8).join(', ');
  throw erro('FUNCIONARIO_NAO_ENCONTRADO', `Funcionário "${nome}" não encontrado (ativo) no GRM.${parecidos ? ` Parecidos: ${parecidos}.` : ''} Confira o nome ou deixe o campo vazio e reenvie.`);
}

// ---------------------------------------------------------------------------
// Fluxo por veículo
// ---------------------------------------------------------------------------

async function cadastrar(token, ctx, veic) {
  const faltando = validarDados(veic);
  if (faltando.length) throw erro('DADOS_INCOMPLETOS', `Faltam dados para cadastrar no GRM: ${faltando.join('; ')}.`);
  if (!ctx.pcaVeiculos) throw erro('CATEGORIA_NAO_ENCONTRADA', `Categoria de patrimônio "${CATEGORIA_VEICULOS}" não encontrada no GRM.`);

  const placa = placaLimpa(veic.placa);
  const numeroPat = digits(veic.grm_patrimonio_numero);
  const [veiculosRes, patrimoniosRes] = await Promise.all([
    grm(token, 'vehicle/getRecords', {}),
    grm(token, 'patrimonies/getRecords', {}),
  ]);
  const veiculosGrm = safe(veiculosRes.searchData);
  const patrimoniosGrm = safe(patrimoniosRes.searchData);

  const veiculoExistente = FORCAR_NOVO ? null : veiculosGrm.find((v) => chavePlaca(v.vehLicensePlate) === chavePlaca(placa));
  const patrimonioExistente = FORCAR_NOVO ? null : patrimoniosGrm.find(
    (p) => Number(p.pcaCode) === Number(ctx.pcaVeiculos) && placasNoTexto(p.patName).some((x) => chavePlaca(x) === chavePlaca(placa)),
  );

  const resultado = {
    placa,
    patrimonio: patrimonioExistente ? { ja_existia: true, numero: patrimonioExistente.patNumber } : null,
    veiculo: veiculoExistente ? { ja_existia: true, vehCode: veiculoExistente.vehCode } : null,
    avisos: [],
  };
  if (patrimonioExistente && String(patrimonioExistente.patNumber) !== numeroPat) {
    resultado.avisos.push(`A placa já tem o Patrimônio ${patrimonioExistente.patNumber} no GRM (não ${numeroPat}); mantido o do GRM.`);
  }
  if (patrimonioExistente && veiculoExistente) {
    log('WARN', `${placa} já está nas duas telas do GRM (patrimônio ${patrimonioExistente.patNumber}, veículo ${veiculoExistente.vehCode}); só vinculando.`);
    return resultado;
  }

  // Marca/modelo/local/funcionário só importam se algo vai ser criado.
  const usoMarca = usoPorChave([...veiculosGrm, ...patrimoniosGrm.filter((p) => Number(p.pcaCode) === Number(ctx.pcaVeiculos))], 'pbrCode');
  const usoModelo = usoPorChave(veiculosGrm, 'pmoCode');
  const marcaBase = resolverMarca(veic.marca, ctx.marcas, usoMarca);
  const marca = resolverModelo(veic.modelo, marcaBase, ctx.marcas, ctx.modelos, usoModelo);
  const staff = String(veic.motorista_atual ?? '').trim() ? await buscarFuncionario(token, veic.motorista_atual) : null;
  const local = resolverLocal(ctx, veic, staff);
  const staCode = staff ? staff.staCode : null;
  resultado.resolvido = { marca: `${marca.pbrName} (${marca.pbrCode})`, modelo: `${marca.pmoName} (${marca.pmoCode})`, olcCode: local.olcCode, olsCode: local.olsCode, staCode };

  if (!patrimonioExistente) {
    const emUso = patrimoniosGrm.find((p) => String(p.patNumber) === numeroPat);
    if (emUso) {
      throw erro('PATRIMONIO_NUMERO_EM_USO', `O Patrimônio ${numeroPat} já existe no GRM (${emUso.patName}). Informe outro número e reenvie.`, resultado);
    }
    const payload = montarPayloadPatrimonio({ veic, marca, local, staCode, pcaCode: ctx.pcaVeiculos });
    resultado.patrimonio = { ja_existia: false, numero: payload.patNumber, patName: payload.patName };
    if (DRY_RUN) {
      log('INFO', 'DRY_RUN: patrimonies/setRecord NÃO enviado. Payload:', payload);
    } else {
      try {
        await grmEscrever(token, 'patrimonies/setRecord', payload, { multipart: ctx.multipartPatrimonio });
      } catch (error) {
        // Resposta perdida/recusada: confere se o GRM gravou mesmo assim antes de falhar.
        const conferencia = safe((await grm(token, 'patrimonies/getRecords', {})).searchData).find((p) => String(p.patNumber) === numeroPat);
        if (!conferencia) throw erro(error.code || 'PATRIMONIO_FALHOU', `Cadastro do Patrimônio falhou: ${error.message}`, resultado);
        log('WARN', `Patrimônio ${numeroPat} apareceu no GRM apesar do erro (${error.message}); seguindo.`);
      }
      const gravado = safe((await grm(token, 'patrimonies/getRecords', {})).searchData).find((p) => String(p.patNumber) === numeroPat);
      if (!gravado) throw erro('PATRIMONIO_NAO_CONFIRMADO', `O GRM respondeu OK mas o Patrimônio ${numeroPat} não apareceu na consulta. Confira no GRM antes de reenviar.`, resultado);
      resultado.patrimonio.patName = gravado.patName;
      log('SUCCESS', `Patrimônio ${numeroPat} criado no GRM: ${gravado.patName}`);
    }
  }

  if (!veiculoExistente) {
    let payload = montarPayloadVeiculo({ veic, marca, local, staCode });
    resultado.veiculo = { ja_existia: false, vehName: payload.vehName };
    if (DRY_RUN) {
      log('INFO', 'DRY_RUN: vehicle/setRecord NÃO enviado. Payload:', payload);
    } else {
      let extrasEnviados = Boolean(payload.vehChassis || payload.vehYearModel);
      try {
        await grmEscrever(token, 'vehicle/setRecord', payload);
      } catch (error) {
        const jaGravou = safe((await grm(token, 'vehicle/getRecords', {})).searchData).find((v) => chavePlaca(v.vehLicensePlate) === chavePlaca(placa));
        if (jaGravou) {
          log('WARN', `Veículo ${placa} apareceu no GRM apesar do erro (${error.message}); seguindo.`);
        } else if (extrasEnviados) {
          log('WARN', `vehicle/setRecord recusou com chassi/ano-modelo (${error.message}); reenviando sem eles.`);
          payload = montarPayloadVeiculo({ veic, marca, local, staCode }, { comExtras: false });
          extrasEnviados = false;
          try {
            await grmEscrever(token, 'vehicle/setRecord', payload);
          } catch (error2) {
            const ainda = safe((await grm(token, 'vehicle/getRecords', {})).searchData).find((v) => chavePlaca(v.vehLicensePlate) === chavePlaca(placa));
            if (!ainda) throw erro(error2.code || 'VEICULO_FALHOU', `Cadastro do Veículo falhou: ${error2.message}`, resultado);
          }
        } else {
          throw erro(error.code || 'VEICULO_FALHOU', `Cadastro do Veículo falhou: ${error.message}`, resultado);
        }
      }
      const gravado = safe((await grm(token, 'vehicle/getRecords', {})).searchData).find((v) => chavePlaca(v.vehLicensePlate) === chavePlaca(placa));
      if (!gravado) throw erro('VEICULO_NAO_CONFIRMADO', `O GRM respondeu OK mas o Veículo ${placa} não apareceu na consulta. Confira no GRM antes de reenviar.`, resultado);
      resultado.veiculo.vehCode = gravado.vehCode;
      if (placaLimpa(veic.chassi) && !gravado.vehChassis) {
        resultado.avisos.push('O GRM não gravou o chassi (a tela de Veículos não tem esse campo no cadastro); preencha direto no GRM se precisar.');
      }
      log('SUCCESS', `Veículo ${gravado.vehLicensePlate} (código ${gravado.vehCode}) criado no GRM.`);
    }
  }

  return resultado;
}

// ---------------------------------------------------------------------------
// Fila
// ---------------------------------------------------------------------------

function resumo(resultado) {
  const partes = [];
  if (resultado.patrimonio) partes.push(`Patrimônio ${resultado.patrimonio.numero} ${resultado.patrimonio.ja_existia ? 'já existia' : 'criado'}`);
  if (resultado.veiculo) partes.push(`Veículo ${resultado.veiculo.ja_existia ? 'já existia' : 'criado'}${resultado.veiculo.vehCode ? ` (código ${resultado.veiculo.vehCode})` : ''}`);
  return `${partes.join('; ')} no GRM.${resultado.avisos?.length ? ` Atenção: ${resultado.avisos.join(' ')}` : ''}`;
}

async function updateVeiculo(id, patch) {
  const { error } = await getSupabase().from('frotas_veiculos').update(patch).eq('id', id);
  if (error) throw error;
}

async function claimNext() {
  const { data, error } = await getSupabase().rpc('claim_next_frotas_veiculo_grm_cadastro');
  if (error) throw error;
  return data && data.id ? data : null;
}

async function contarPendentes() {
  const { count, error } = await getSupabase()
    .from('frotas_veiculos')
    .select('id', { count: 'exact', head: true })
    .in('grm_cadastro_status', ['PENDENTE', 'PROCESSANDO']);
  if (error) throw error;
  return count || 0;
}

// Depois de criar, pede uma leitura de Patrimônios pra o painel ligar a placa ao patrimônio
// (código, supervisão, último check) sem esperar o ciclo normal. Falha aqui não importa.
async function pedirSyncPatrimonios() {
  try {
    const sb = getSupabase();
    const { data: ativos } = await sb.from('grm_sync_jobs').select('id').eq('agente_id', 'sync-patrimonios').in('status', ['pendente', 'rodando']).limit(1);
    if (ativos && ativos.length) return;
    const { error } = await sb.from('grm_sync_jobs').insert({ agente_id: 'sync-patrimonios', status: 'pendente', solicitado_por: 'cadastrar-veiculo' });
    if (error) log('WARN', `Não enfileirei sync-patrimonios: ${error.message}`);
    else log('INFO', 'sync-patrimonios enfileirado para vincular o veículo novo.');
  } catch (error) {
    log('WARN', `Não enfileirei sync-patrimonios: ${error.message}`);
  }
}

const ERROS_DEFINITIVOS = new Set([
  'DADOS_INCOMPLETOS', 'MARCA_NAO_ENCONTRADA', 'MODELO_NAO_ENCONTRADO', 'SUPERVISAO_NAO_ENCONTRADA',
  'COORDENACAO_NAO_ENCONTRADA', 'LOCAL_DIVERGENTE', 'FUNCIONARIO_NAO_ENCONTRADO', 'FUNCIONARIO_AMBIGUO',
  'FUNCIONARIO_SUPERVISAO_DIVERGENTE', 'PATRIMONIO_NUMERO_EM_USO', 'CATEGORIA_NAO_ENCONTRADA',
  'PATRIMONIO_NAO_CONFIRMADO', 'VEICULO_NAO_CONFIRMADO', 'GRM_RECUSOU', 'PATRIMONIO_FALHOU', 'VEICULO_FALHOU',
]);

async function processar(token, ctx) {
  let processed = 0;
  let errors = 0;
  let criou = false;
  for (let index = 0; index < MAX_PER_RUN; index += 1) {
    const veic = await claimNext();
    if (!veic) break;
    processed += 1;
    watchdogCurrentId = veic.id;
    try {
      const resultado = await cadastrar(token, ctx, veic);
      const patNumero = resultado.patrimonio ? String(resultado.patrimonio.numero) : veic.grm_patrimonio_numero;
      await updateVeiculo(veic.id, {
        grm_cadastro_status: 'CONCLUIDO',
        grm_cadastro_mensagem: resumo(resultado),
        grm_cadastro_em: new Date().toISOString(),
        grm_cadastro_travado_em: null,
        grm_patrimonio_numero: patNumero,
        grm_veh_code: resultado.veiculo?.vehCode ?? veic.grm_veh_code ?? null,
      });
      if (!(resultado.patrimonio?.ja_existia && resultado.veiculo?.ja_existia)) criou = true;
      log('SUCCESS', `${veic.placa}: ${resumo(resultado)}`);
    } catch (error) {
      errors += 1;
      // Dado errado não se resolve sozinho: vai direto pra ERRO. Falha de rede/GRM volta pra fila
      // (o cron de 5 min reenfileira) até MAX_TENTATIVAS.
      const definitivo = ERROS_DEFINITIVOS.has(error.code);
      const esgotou = definitivo || Number(veic.grm_cadastro_tentativas || 0) >= MAX_TENTATIVAS;
      await updateVeiculo(veic.id, {
        grm_cadastro_status: esgotou ? 'ERRO' : 'PENDENTE',
        grm_cadastro_mensagem: error.message,
        grm_cadastro_em: new Date().toISOString(),
        grm_cadastro_travado_em: null,
      });
      log('ERROR', `${veic.placa}: ${error.message}`);
    } finally {
      watchdogCurrentId = null;
    }
  }
  if (criou) await pedirSyncPatrimonios();
  return { processed, errors };
}

async function dryRun(token, ctx) {
  let data;
  if (SIMULAR) {
    data = [JSON.parse(fs.readFileSync(SIMULAR.replace(/^@/, ''), 'utf8'))];
  } else {
    let query = getSupabase().from('frotas_veiculos').select('*');
    if (ONLY_ID) query = query.eq('id', ONLY_ID);
    else if (ONLY_PLACA) query = query.eq('placa', placaLimpa(ONLY_PLACA));
    else query = query.in('grm_cadastro_status', ['PENDENTE', 'ERRO']);
    const resp = await query.limit(MAX_PER_RUN);
    if (resp.error) throw resp.error;
    data = resp.data;
  }
  if (!data?.length) log('INFO', 'DRY_RUN: nenhum veículo para validar.');
  let errors = 0;
  for (const veic of data || []) {
    // Veículo antigo sem nº de Patrimônio digitado: usa o que o painel já conhece, só pra simular.
    const simulado = { ...veic, grm_patrimonio_numero: veic.grm_patrimonio_numero || veic.patrimonio_codigo };
    try {
      const resultado = await cadastrar(token, ctx, simulado);
      log('INFO', `DRY_RUN ${veic.placa}: ${resumo(resultado)}`, resultado.resolvido);
    } catch (err) {
      errors += 1;
      log('ERROR', `DRY_RUN ${veic.placa}: ${err.message}`);
    }
  }
  return { processed: data?.length || 0, errors };
}

async function main() {
  log('INFO', `Iniciando agente de cadastro de veículo no GRM (dry_run=${DRY_RUN}).`);
  if (!DRY_RUN && !SO_CATALOGO) {
    const pendentes = await contarPendentes();
    if (!pendentes) {
      log('INFO', 'Nenhum veículo aguardando cadastro no GRM.');
      return;
    }
  }
  const token = await login();
  const ctx = await carregarContexto(token);
  log('INFO', `Contexto: ${ctx.coordenacaoPorNome.size} coordenação(ões), ${ctx.supervisaoPorNome.size} supervisão(ões), ${ctx.marcas.length} marca(s), ${ctx.modelos.length} modelo(s), categoria VEICULOS=${ctx.pcaVeiculos}.`);
  await atualizarCatalogo(ctx);
  if (SO_CATALOGO) return;
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
      updateVeiculo(watchdogCurrentId, { grm_cadastro_status: 'PENDENTE', grm_cadastro_travado_em: null, grm_cadastro_mensagem: 'Watchdog: execução interrompida, volta pra fila.' }),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]).finally(() => process.exit(1));
  }, TIMEOUT_MIN * 60 * 1000).unref();
}

module.exports = {
  norm, digits, placaLimpa, formatPlacaGrm, chavePlaca, placasNoTexto, tipoParaGrm, situacaoParaGrm,
  validarDados, usoPorChave, resolverMarca, resolverModelo, resolverLocal, montarPatName,
  montarPayloadPatrimonio, montarPayloadVeiculo,
};
