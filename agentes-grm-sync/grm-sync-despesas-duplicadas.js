#!/usr/bin/env node
'use strict';

/*
 * Agente auxiliar do sync-despesas-retroativas: trata despesas DUPLICADAS que o
 * colaborador lança no Caixa Operacional do GRM (pendências, status P).
 *
 * Só olha Almoço, Café, Janta, Pernoite e Diária (Salário de Intermitente +
 * Serviços Terceirizados; Serviços Terceirizados de valor <= 45 conta como
 * Almoço lançado errado). Qualquer outra despesa é ignorada.
 *
 * Data efetiva de um lançamento = data citada na observação (prioritária) ou,
 * sem ela, a data do lançamento.
 *
 *  1) Sem data na observação: se já existe outro lançamento ativo (P/A) do mesmo
 *     colaborador + despesa na data, recusa com "lançamento duplicado".
 *  2) Observação com data diferente da do lançamento: vale a data da observação.
 *     - Já existe lançamento ativo da despesa nessa data -> recusa "Duplicata".
 *     - Não existe -> se estiver nas regras, corrige a data (cria na data da
 *       observação, aprova o novo e recusa o original com "data corrigida").
 *       Fora das regras a pendência fica como está (revisão humana).
 *
 * Regras para aprovar na data da observação (mesmas decididas em 01/10/2026):
 *   Almoço / Diária / Pernoite: o colaborador tem movimento (Embarque SIM) na data
 *     — produção, laudo ou NHE; Pernoite também não pode ter Café/Almoço/Janta
 *     ativo no dia (hospedagem cobre a alimentação).
 *   Janta: laudo registrado a partir das 19h no horário local do embarque.
 *   Café: laudo registrado antes das 07h no horário local do embarque.
 *
 * Quando há mais de um lançamento no mesmo grupo (colaborador + despesa + data
 * efetiva) sobrevive um só: o aprovado, senão a pendência lançada direto na data
 * (sem data divergente na observação), senão a de menor ofmCode.
 *
 * Travas (grm-despesas-guardas.js): nunca recusa quando a observação cita outra despesa
 * ("janta", "km rodado"), outra pessoa ("Almoço do Bruno") ou um extra (Salário Família), nem
 * quando o valor é MAIOR que o do lançamento que ficaria (Almoço R$ 30 x R$ 3 aprovado).
 * Esses casos ficam pendentes para revisão humana (log "Mantida pendente", resumo revisao_humana).
 *
 * Tipo de despesa incorreto (regra de 05/10/2026): toda despesa deve ser lançada no campo correspondente.
 * Pendência cuja observação diz que é de OUTRA despesa (campo Almoço com "janta dia tal") é recusada na hora com
 * "Tipo de despesa incorreto. lançar despesa no campo correspondente" (tipoIncorretoNaObs em
 * grm-despesas-guardas.js; km/combustível/pedágio só seguram a pendência).
 *
 * Auditoria: grm_despesas_retroativas_auditoria (mesma tabela do agente
 * principal) com diagnostico.agente = 'sync-despesas-duplicadas'. Recusas entram
 * como REPROVE; a correção de data entra como CREATE (custo aprovado na data
 * correta, que é o que a Produtividade lê).
 *
 *   node grm-sync-despesas-duplicadas.js [--dry-run]
 * Env: GRM_DESPESAS_DUPLICADAS_DRY_RUN, _JANELA_DIAS (padrão 10), _MAX_ACOES (padrão 100).
 */

require('dotenv').config();
require('dotenv').config({ path: '.env.production' });

const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const { registerDateAtPoint } = require('./grm-sync-despesas-retroativas');
const {
  norm, addDias, dateFromObs, grupoDespesa, categoriaDivergente, tipoIncorretoNaObs, MOTIVO_TIPO_INCORRETO,
  observacaoNaoRepete, valorMaiorQueMantido,
} = require('./grm-despesas-guardas');
const { obterTokenGrm } = require('./grm-token-cache');

const VERSION = 'V1.2-AUXILIAR-DUPLICADAS-TIPO-INCORRETO';
const AGENTE_ID = 'sync-despesas-duplicadas';
const GRM_BASE_URL = String(
  process.env.GRMSERVER_API_URL || 'https://www.grmserver.com.br/api/',
).replace(/\/?$/, '/');
const GRM_WEB_HEADERS = {
  accept: 'application/json',
  origin: 'https://www.grmserver.com.br',
  referer: 'https://www.grmserver.com.br/login',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
};
const DRY_RUN = process.argv.includes('--dry-run')
  || String(process.env.GRM_DESPESAS_DUPLICADAS_DRY_RUN || 'false').toLowerCase() === 'true';
const JANELA_DIAS = Math.max(1, Number(process.env.GRM_DESPESAS_DUPLICADAS_JANELA_DIAS || 10));
const MAX_ACTIONS = Math.max(1, Number(process.env.GRM_DESPESAS_DUPLICADAS_MAX_ACOES || 100));
const MAX_DIAS_DISTANCIA = 20; // data da observação mais longe que isso é provável erro de digitação

const MOTIVO_DUPLICADO = 'lançamento duplicado';
const MOTIVO_DUPLICATA = 'Duplicata';
const MOTIVO_DATA_CORRIGIDA = 'data corrigida';

const REFEICOES = new Set(['ALMOCO', 'CAFE', 'JANTA']);

let supabase;
function getSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL || process.env.SB_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: WebSocket } },
    );
  }
  return supabase;
}

function log(level, message, data) {
  console.log(`[${level}] ${new Date().toISOString()} - ${message}${data === undefined ? '' : ` ${JSON.stringify(data)}`}`);
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const digits = (value) => String(value || '').replace(/\D/g, '');
const isoToBr = (iso) => iso.split('-').reverse().join('/');

function hojeSaoPaulo(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function infoLancamento(row) {
  const ofmIso = String(row.ofmDate).slice(0, 10);
  const obsData = dateFromObs(row.ofmDescription, ofmIso);
  return { ofmIso, dataEf: obsData || ofmIso, divergente: !!obsData && obsData !== ofmIso };
}

const chaveGrupo = (row, info) => `${Number(row.staCode)}|${grupoDespesa(row)}|${info.dataEf}`;

// Índice dos lançamentos ativos (P/A) das despesas tratadas, por grupo+data efetiva.
function montarIndice(rows) {
  const indice = new Map();
  const vistos = new Set();
  for (const row of rows) {
    if (row.ofmType !== 'D' || !['P', 'A'].includes(row.ofmStatus) || !grupoDespesa(row)) continue;
    if (categoriaDivergente(row) || observacaoNaoRepete(row)) continue;
    if (vistos.has(Number(row.ofmCode))) continue;
    vistos.add(Number(row.ofmCode));
    const info = infoLancamento(row);
    const key = chaveGrupo(row, info);
    if (!indice.has(key)) indice.set(key, []);
    indice.get(key).push({ row, info });
  }
  return indice;
}

// Sobrevive: aprovado > pendência lançada direto na data > pendência com data
// divergente na observação; empate pelo menor ofmCode.
const rank = (item) => [item.row.ofmStatus === 'A' ? 0 : 1, item.info.divergente ? 1 : 0, Number(item.row.ofmCode)];
function compararRank(a, b) {
  const ra = rank(a); const rb = rank(b);
  for (let i = 0; i < ra.length; i += 1) if (ra[i] !== rb[i]) return ra[i] - rb[i];
  return 0;
}

// Decide o que fazer com UMA pendência. Devolve:
//   { acao: 'RECUSAR', motivo, tipoCitado }   -> observação diz que é de OUTRA despesa (campo errado): recusa imediata
//   { acao: 'RECUSAR', motivo, referencia }   -> há lançamento melhor na mesma data efetiva
//   { acao: 'AVALIAR_DATA' }                  -> sem duplicata, data da observação diferente
//   { acao: 'REVISAR', motivo }               -> parece cópia, mas a observação/valor mostram que não é:
//                                                fica pendente para revisão humana (grm-despesas-guardas.js)
//   { acao: 'NADA' }                          -> sem duplicata e sem data divergente
function classificar(row, indice) {
  const info = infoLancamento(row);
  // Regra de 05/10: toda despesa deve ser lançada no campo correspondente — observação de outra despesa = recusa
  const tipoCitado = tipoIncorretoNaObs(row);
  if (tipoCitado) return { acao: 'RECUSAR', motivo: MOTIVO_TIPO_INCORRETO, tipoCitado, info };
  if (categoriaDivergente(row)) return { acao: 'NADA', info };
  const naoRepete = observacaoNaoRepete(row);
  if (naoRepete) return { acao: 'REVISAR', motivo: naoRepete, info };
  const grupo = indice.get(chaveGrupo(row, info)) || [];
  const eu = grupo.find((item) => Number(item.row.ofmCode) === Number(row.ofmCode)) || { row, info };
  const melhor = grupo
    .filter((item) => Number(item.row.ofmCode) !== Number(row.ofmCode) && compararRank(item, eu) < 0)
    .sort(compararRank)[0];
  if (melhor && valorMaiorQueMantido(row, melhor.row)) {
    return {
      acao: 'REVISAR',
      motivo: 'valor_maior_que_o_mantido',
      referencia: { ofmCode: Number(melhor.row.ofmCode), status: melhor.row.ofmStatus, valor: Number(melhor.row.ofmValue) },
      info,
    };
  }
  if (melhor) {
    return {
      acao: 'RECUSAR',
      motivo: info.divergente ? MOTIVO_DUPLICATA : MOTIVO_DUPLICADO,
      referencia: { ofmCode: Number(melhor.row.ofmCode), status: melhor.row.ofmStatus, dataLancamento: melhor.info.ofmIso },
      info,
    };
  }
  return { acao: info.divergente ? 'AVALIAR_DATA' : 'NADA', info };
}

// ---- API do GRM ----------------------------------------------------------------------
async function grmRequest(path, body, token, multipart = false) {
  const endpoint = String(path || '').replace(/^\/+/, '').replace(/^api\//, '');
  const headers = { ...GRM_WEB_HEADERS, ...(token ? { authorization: `Bearer ${token}` } : {}) };
  let requestBody;
  if (multipart) {
    const form = new FormData();
    Object.entries(body || {}).forEach(([key, value]) => form.append(key, value == null ? '' : String(value)));
    requestBody = form;
  } else {
    headers['content-type'] = 'application/json';
    requestBody = JSON.stringify(body || {});
  }
  const response = await fetch(`${GRM_BASE_URL}${endpoint}`, {
    method: 'POST', headers, body: requestBody, signal: AbortSignal.timeout(60000),
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (_) {
    throw new Error(`GRM ${endpoint} retornou conteúdo inválido (HTTP ${response.status}): ${text.slice(0, 300)}`);
  }
  if (!response.ok || json?.result === false) {
    throw new Error(`GRM ${endpoint} HTTP ${response.status}: ${json?.message || text.slice(0, 500)}`);
  }
  return json;
}

// Token em cache compartilhado (grm-token-cache.js). Em 30/09/2026 o login direto
// passou a exigir Turnstile: o token do dia é gravado à mão no servidor.
async function login() {
  return obterTokenGrm({
    login: async () => {
      const response = await grmRequest('user/login', {
        userEmail: process.env.GRMSERVER_USER,
        userPass: process.env.GRMSERVER_PASSWORD,
        loginInfo: {
          ip: '', browser: 'GRM API Agent', browserVersion: '1.0', engine: 'Node.js',
          engineVersion: process.version, platform: process.platform, screenSize: '', windowSize: '',
        },
      }, null);
      if (!response.token) throw new Error('Login GRM concluído sem token.');
      return response.token;
    },
  });
}

const fluxoDia = async (token, iso) => (await grmRequest('/api/reports/finance/operatingFlow', {
  ofmDateFrom: isoToBr(iso), ofmDateTo: isoToBr(iso), ofmStatusReport: ['P', 'A'], reportType: 'flowList',
}, token)).searchData || [];
const aprovar = (token, row) => grmRequest('/api/oFlow/approve', { ofmCode: Number(row.ofmCode), reproveReason: '', type: 'A' }, token);
const recusar = (token, row, motivo) => grmRequest('/api/oFlow/disapprove', { ofmCode: Number(row.ofmCode), reproveReason: motivo, type: 'D' }, token);
const criar = (token, row, dataIso, descricao) => grmRequest('/api/oFlow/setRecord', {
  ofmType: 'D',
  staCode: Number(row.staCode),
  ofmDate: isoToBr(dataIso),
  ofmDescription: descricao,
  ofmValue: Number(row.ofmValue).toFixed(2),
  oexCode: Number(row.oexCode),
  odtCode: Number(row.odtCode || 1),
  ofmDocument: '0',
  moreThenOneCompany: 'N',
  scpCode: Number(row.scpCode || 1),
}, token, true);

// ---- evidências no Supabase (regras da data da observação) --------------------------
async function queryAll(table, select, configure) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await configure(getSupabase().from(table).select(select).range(from, from + 999));
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

const evidenciaCache = new Map();
// Quem teve movimento (produção, laudo ou NHE) no dia, e os laudos por colaborador.
async function evidenciaDia(dataIso) {
  if (evidenciaCache.has(dataIso)) return evidenciaCache.get(dataIso);
  const [producao, nheNovo, nheAntigo] = await Promise.all([
    queryAll('producao_snapshot', 'funcionario', (q) => q.eq('data', dataIso).not('funcionario', 'is', null)),
    queryAll('grm_nhe_importacoes', 'dados_json', (q) => q.eq('dados_json->>lnsDate', dataIso).order('id')),
    queryAll('grm_nhe_importacoes', 'dados_json', (q) => q.eq('dados_json->>Data', isoToBr(dataIso)).order('id')),
  ]);
  const nomes = new Set(producao.map((r) => norm(r.funcionario)).filter(Boolean));
  nheNovo.forEach((r) => nomes.add(norm(r.dados_json?.staName)));
  nheAntigo.forEach((r) => nomes.add(norm(r.dados_json?.Classificador)));

  // laudos de D-1..D+1: o registro pode cair no dia vizinho por causa do fuso do embarque
  const laudos = new Map();
  for (const dia of [-1, 0, 1].map((n) => addDias(dataIso, n))) {
    const cargas = await queryAll(
      'grm_cargas_importacoes',
      'colaborador,laudo,os,reg:dados_json->>loaRegisterDate,uf:dados_json->>staAbreviation,cidade:dados_json->>citName',
      (q) => q.eq('data_classificacao', dia).order('id'),
    );
    for (const carga of cargas) {
      if (!carga.laudo || !carga.reg) continue;
      const local = registerDateAtPoint(carga.reg, carga.uf, carga.cidade);
      if (!local || local.ymd !== dataIso) continue;
      const key = norm(carga.colaborador);
      if (!laudos.has(key)) laudos.set(key, []);
      laudos.get(key).push({ laudo: carga.laudo, os: carga.os, hora: local.hour, local: `${local.ymd} ${local.time}` });
    }
  }
  const resultado = { nomes, laudos };
  evidenciaCache.set(dataIso, resultado);
  return resultado;
}

// Almoço/Diária/Pernoite/Janta/Café na data da observação. Devolve { ok, motivo, evidencia }.
async function avaliarRegras(row, info, indice, hoje) {
  if (info.dataEf > hoje) return { ok: false, motivo: 'data_futura' };
  const distancia = Math.abs(Date.parse(info.ofmIso) - Date.parse(info.dataEf)) / 86400000;
  if (distancia > MAX_DIAS_DISTANCIA) return { ok: false, motivo: 'data_da_observacao_muito_distante' };

  const grupo = grupoDespesa(row);
  const nome = norm(row.staName);
  const ev = await evidenciaDia(info.dataEf);
  const laudos = ev.laudos.get(nome) || [];

  if (grupo === 'CAFE') {
    const apto = laudos.filter((l) => l.hora < 7).sort((a, b) => a.local.localeCompare(b.local))[0];
    return apto ? { ok: true, evidencia: `laudo ${apto.laudo} OS ${apto.os} às ${apto.local} (antes das 07h local)` }
      : { ok: false, motivo: 'sem_laudo_antes_das_07h_na_data' };
  }
  if (grupo === 'JANTA') {
    const apto = laudos.filter((l) => l.hora >= 19).sort((a, b) => b.local.localeCompare(a.local))[0];
    return apto ? { ok: true, evidencia: `laudo ${apto.laudo} OS ${apto.os} às ${apto.local} (a partir das 19h local)` }
      : { ok: false, motivo: 'sem_laudo_a_partir_das_19h_na_data' };
  }
  // ALMOCO, DIARIA e PERNOITE exigem Embarque SIM (movimento) na data
  if (!ev.nomes.has(nome) && !laudos.length) return { ok: false, motivo: 'sem_embarque_na_data' };
  if (grupo === 'PERNOITE') {
    const refeicoes = [...indice.values()].flat().filter((item) => Number(item.row.staCode) === Number(row.staCode)
      && REFEICOES.has(grupoDespesa(item.row)) && item.info.dataEf === info.dataEf);
    if (refeicoes.length) return { ok: false, motivo: 'refeicao_lancada_no_dia', refeicoes: refeicoes.map((i) => `${i.row.oexName.trim()} ${i.row.ofmCode} ${i.row.ofmStatus}`) };
  }
  return { ok: true, evidencia: 'Embarque SIM na data (produção/laudo/NHE)' };
}

// ---- auditoria -------------------------------------------------------------------------
async function carregarCadastros(token) {
  const staff = (await grmRequest('/api/staff/getRecords', { staName: '', staCPF: '', staEmail: '', staStatus: 'A' }, token)).searchData || [];
  const contratos = await queryAll('colaborador_cruzamento', 'cpf,tipo_contrato', (q) => q.order('colaborador_id'));
  return {
    cpfPorSta: new Map(staff.map((s) => [Number(s.staCode), digits(s.staCPF)])),
    contratoPorCpf: new Map(contratos.map((c) => [digits(c.cpf), c.tipo_contrato])),
  };
}

async function auditar(cad, row, dataRef, acao, sucesso, diagnostico, erro) {
  const cpf = cad.cpfPorSta.get(Number(row.staCode)) || '';
  const { error } = await getSupabase().from('grm_despesas_retroativas_auditoria').insert({
    data_referencia: dataRef,
    cpf,
    colaborador: String(row.staName || '').trim(),
    sta_code: Number(row.staCode),
    tipo_contrato: cad.contratoPorCpf.get(cpf) || '',
    tipo_despesa: String(row.oexName || '').trim(),
    oex_code: Number(row.oexCode),
    valor: Number(row.ofmValue) || 0,
    acao,
    ofm_code: Number(diagnostico.ofm_code_aprovado || row.ofmCode),
    dry_run: DRY_RUN,
    sucesso,
    erro: erro || null,
    diagnostico: { agente: AGENTE_ID, versao: VERSION, ...diagnostico },
  });
  if (error) log('ERROR', `Falha ao gravar auditoria do ofmCode ${row.ofmCode}: ${error.message}`);
}

// ---- execução ----------------------------------------------------------------------------
// Serviços Terceirizados de valor <= 45 é Almoço digitado na despesa errada: o lançamento novo
// nasce como Almoço (a despesa que a Conferência/Produtividade esperam), não como Terceirizados.
// O código do Almoço vem de qualquer Almoço já lido do GRM nesta execução; sem ele, copia o original.
function modeloParaCriar(row, todos) {
  if (norm(row.oexName) !== 'SERVICOS TERCEIRIZADOS' || grupoDespesa(row) !== 'ALMOCO') return row;
  const almoco = [...todos.values()].find((r) => norm(r.oexName) === 'ALMOCO');
  return almoco ? { ...row, oexCode: almoco.oexCode, odtCode: almoco.odtCode ?? row.odtCode } : row;
}

async function corrigirData(token, row, info, modelo = row) {
  const marca = `original ${row.ofmCode}`;
  const doDestino = async () => (await fluxoDia(token, info.dataEf)).filter((y) => y.ofmType === 'D'
    && Number(y.staCode) === Number(row.staCode) && Number(y.oexCode) === Number(modelo.oexCode));
  // idempotência: uma tentativa anterior pode ter criado o lançamento e falhado antes de aprovar
  let novo = (await doDestino()).find((y) => String(y.ofmDescription || '').includes(marca));
  if (!novo) {
    await criar(token, modelo, info.dataEf, `${row.ofmDescription || ''} (data corrigida; ${marca})`.trim());
    novo = (await doDestino()).filter((y) => String(y.ofmDescription || '').includes(marca))
      .sort((a, b) => Number(b.ofmCode) - Number(a.ofmCode))[0];
    if (!novo) throw new Error('Lançamento criado não apareceu na conferência — original mantido pendente.');
  }
  if (novo.ofmStatus === 'P') await aprovar(token, novo);
  await recusar(token, row, MOTIVO_DATA_CORRIGIDA);
  return Number(novo.ofmCode);
}

async function main() {
  if (!process.env.GRMSERVER_USER || !process.env.GRMSERVER_PASSWORD) {
    // o token em cache dispensa as credenciais, mas o login direto de reserva precisa delas
    log('WARN', 'Credenciais GRM ausentes: só funciona com token em cache.');
  }
  const hoje = hojeSaoPaulo();
  const inicio = addDias(hoje, -JANELA_DIAS);
  log('INFO', `Agente ${VERSION}: janela ${inicio} a ${hoje}.`, { dry_run: DRY_RUN, max_acoes: MAX_ACTIONS });

  const token = await login();
  const diasBuscados = new Set();
  const todos = new Map();
  const buscarDia = async (iso) => {
    if (diasBuscados.has(iso)) return;
    diasBuscados.add(iso);
    (await fluxoDia(token, iso)).forEach((row) => todos.set(Number(row.ofmCode), row));
    await sleep(150);
  };
  for (let d = inicio; d <= hoje; d = addDias(d, 1)) await buscarDia(d);

  // datas citadas nas observações das pendências podem cair fora da janela
  const tratadas = [...todos.values()].filter((row) => row.ofmType === 'D' && row.ofmStatus === 'P' && grupoDespesa(row));
  // categoria divergente "forte" (Café/Almoço/Janta/Pernoite/Diária) é recusada; a "fraca" (km, combustível,
  // pedágio) só fica pendente para revisão
  const pendentes = tratadas.filter((row) => !categoriaDivergente(row) || tipoIncorretoNaObs(row));
  for (const row of tratadas.filter((r) => categoriaDivergente(r) && !tipoIncorretoNaObs(r))) {
    log('INFO', `Mantida pendente: ${row.staName} / ${row.oexName.trim()} / ofm ${row.ofmCode}: observação cita outra despesa (${categoriaDivergente(row).join(', ')}) — "${String(row.ofmDescription || '').replace(/\s+/g, ' ').slice(0, 80)}".`);
  }
  for (const row of pendentes) {
    const info = infoLancamento(row);
    if (info.divergente) await buscarDia(info.dataEf);
  }
  const indice = montarIndice([...todos.values()]);
  pendentes.sort((a, b) => Number(a.ofmCode) - Number(b.ofmCode));

  const resumo = {
    pendentes: pendentes.length, categoria_divergente: tratadas.length - pendentes.length, recusadas_duplicado: 0, recusadas_duplicata: 0, recusadas_tipo_incorreto: 0, datas_corrigidas: 0,
    sem_regra: 0, sem_acao: 0, revisao_humana: 0, adiados: 0, errors: 0,
  };
  const naoAptos = {};
  const plano = [];
  for (const row of pendentes) {
    const decisao = classificar(row, indice);
    if (decisao.acao === 'NADA') { resumo.sem_acao += 1; continue; }
    if (decisao.acao === 'REVISAR') {
      resumo.revisao_humana += 1;
      log('INFO', `Mantida pendente: ${row.staName} / ${row.oexName.trim()} / ofm ${row.ofmCode} / valor ${row.ofmValue}: ${decisao.motivo}${decisao.referencia ? ` (ficaria ofm ${decisao.referencia.ofmCode} ${decisao.referencia.status} valor ${decisao.referencia.valor})` : ''} — "${String(row.ofmDescription || '').replace(/\s+/g, ' ').slice(0, 80)}".`);
      continue;
    }
    if (decisao.acao === 'RECUSAR') { plano.push({ row, decisao }); continue; }
    const regras = await avaliarRegras(row, decisao.info, indice, hoje);
    if (!regras.ok) {
      resumo.sem_regra += 1;
      naoAptos[regras.motivo] = (naoAptos[regras.motivo] || 0) + 1;
      log('INFO', `Mantida pendente: ${row.staName} / ${row.oexName.trim()} / ofm ${row.ofmCode} (obs → ${decisao.info.dataEf}): ${regras.motivo}.`, regras.refeicoes ? { refeicoes: regras.refeicoes } : undefined);
      continue;
    }
    plano.push({ row, decisao: { ...decisao, acao: 'CORRIGIR_DATA', evidencia: regras.evidencia } });
  }
  log('INFO', 'Plano.', {
    recusar: plano.filter((p) => p.decisao.acao === 'RECUSAR').length,
    recusar_tipo_incorreto: plano.filter((p) => p.decisao.acao === 'RECUSAR' && p.decisao.tipoCitado).length,
    corrigir_data: plano.filter((p) => p.decisao.acao === 'CORRIGIR_DATA').length,
    nao_aptos: naoAptos,
  });

  if (!plano.length) {
    log('SUCCESS', 'Execução concluída.', resumo);
    return;
  }

  const cad = await carregarCadastros(token);
  let acoes = 0;
  for (const { row, decisao } of plano) {
    const base = {
      data_lancamento: decisao.info.ofmIso,
      data_efetiva: decisao.info.dataEf,
      observacao: row.ofmDescription || '',
      haveMovement: row.haveMovement,
    };
    const obs = String(row.ofmDescription || '').replace(/\s+/g, ' ').slice(0, 80);
    const rotulo = `${row.staName} / ${row.oexName.trim()} / ofm ${row.ofmCode} / lanç ${decisao.info.ofmIso}${obs ? ` / obs "${obs}"` : ''}`;
    if (acoes >= MAX_ACTIONS) { resumo.adiados += 1; log('WARN', `${rotulo}: limite de ${MAX_ACTIONS} ações; adiado.`); continue; }
    acoes += 1;
    try {
      if (decisao.acao === 'RECUSAR') {
        const tipoIncorreto = !!decisao.tipoCitado;
        log('INFO', `${DRY_RUN ? '[DRY-RUN] ' : ''}Recusar ${rotulo} (${decisao.motivo})${tipoIncorreto ? ` — observação cita ${decisao.tipoCitado.join(', ')}` : ` — repete ofm ${decisao.referencia.ofmCode} (${decisao.referencia.status})`}.`);
        if (!DRY_RUN) await recusar(token, row, decisao.motivo);
        if (tipoIncorreto) resumo.recusadas_tipo_incorreto += 1;
        else if (decisao.motivo === MOTIVO_DUPLICATA) resumo.recusadas_duplicata += 1; else resumo.recusadas_duplicado += 1;
        await auditar(cad, row, decisao.info.dataEf, 'REPROVE', true, {
          ...base, motivo: decisao.motivo, ...(tipoIncorreto ? { tipo_citado: decisao.tipoCitado } : { repete: decisao.referencia }),
        });
      } else {
        log('INFO', `${DRY_RUN ? '[DRY-RUN] ' : ''}Corrigir data de ${rotulo}: ${decisao.info.ofmIso} → ${decisao.info.dataEf} (${decisao.evidencia}).`);
        const novoCodigo = DRY_RUN ? null : await corrigirData(token, row, decisao.info, modeloParaCriar(row, todos));
        resumo.datas_corrigidas += 1;
        await auditar(cad, row, decisao.info.dataEf, 'CREATE', true, {
          ...base, origem: 'data_corrigida_observacao', evidencia: decisao.evidencia, ofm_code_original: Number(row.ofmCode), ofm_code_aprovado: novoCodigo,
        });
      }
    } catch (error) {
      resumo.errors += 1;
      log('ERROR', `${rotulo}: ${error.message}`);
      await auditar(cad, row, decisao.info.dataEf, decisao.acao === 'RECUSAR' ? 'REPROVE' : 'CREATE', false, { ...base, motivo: decisao.motivo || 'data_corrigida' }, error.message);
    }
  }

  log(resumo.errors ? 'WARN' : 'SUCCESS', 'Execução concluída.', resumo);
  if (resumo.errors) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  dateFromObs,
  grupoDespesa,
  categoriaDivergente,
  infoLancamento,
  montarIndice,
  classificar,
  modeloParaCriar,
  MOTIVO_DUPLICADO,
  MOTIVO_DUPLICATA,
  MOTIVO_TIPO_INCORRETO,
};
