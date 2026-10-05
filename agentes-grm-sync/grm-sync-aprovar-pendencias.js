#!/usr/bin/env node
'use strict';

/*
 * Aprova as pendências (status P) de Café, Almoço, Janta e Pernoite do Caixa Operacional do GRM
 * que o colaborador lançou e que cumprem as regras decididas em 01/10/2026 (grm-despesas-evidencia.js):
 *
 *   Almoço / Diária / Pernoite : movimento no dia (produção, laudo ou NHE); Pernoite sem Café/Almoço/Janta no dia;
 *                       Diária = Salário de Intermitente ou Serviços Terceirizados > R$ 45;
 *   Janta             : laudo a partir das 19h no horário local do embarque;
 *   Café              : laudo antes das 07h no horário local do embarque.
 *
 * Por quê: o sync-despesas-retroativas só aprova o que está na Programação do Painel e só olha D-1;
 * as regras de 01/10 só rodaram em scripts pontuais. Auditoria de 05/10/2026: 42 Almoços, 5 Jantas e
 * 1 Café pendentes cumpriam as regras e ficavam parados (quase todos fora da Programação).
 *
 * Janela: de D-JANELA até D-1 (o dia de hoje fica de fora: produção/laudo ainda incompletos).
 * Só aprova quando a pendência é "limpa" — NÃO aprova (fica para revisão humana / outro agente):
 *   - observação cita outra despesa, outra pessoa ou extra (grm-despesas-guardas.js);
 *   - observação cita outra data (é do sync-despesas-duplicadas: corrige a data ou recusa);
 *   - valor diferente do padrão (Café R$ 10; Almoço, Janta e Pernoite R$ 30; Diária = salário do cadastro);
 *   - Diária de vínculo incompatível: Salário de Intermitente só para Intermitente a partir da admissão
 *     (decisão de 03/10: nada de Intermitente antes da admissão); Serviços Terceirizados só para Diarista
 *     (ou Intermitente em data anterior à admissão, quando ainda era diarista); sem salário no cadastro;
 *   - há outro lançamento ativo (P/A) da mesma despesa na mesma data EFETIVA (a citada na observação, senão a do
 *     lançamento) — duplicata: o sync-despesas-duplicadas recusa e, na rodada seguinte, a que sobra é avaliada aqui.
 *
 * Auditoria: grm_despesas_retroativas_auditoria, acao APPROVE, diagnostico.agente =
 * 'sync-aprovar-pendencias' (mesma tabela do retroativas; a view da Produtividade usa o registro mais
 * recente por colaborador/dia/despesa, então não duplica custo).
 *
 *   node grm-sync-aprovar-pendencias.js [--dry-run]
 * Env: GRM_APROVAR_PENDENCIAS_DRY_RUN, _JANELA_DIAS (padrão 10), _MAX_ACOES (padrão 100).
 */

require('dotenv').config();
require('dotenv').config({ path: '.env.production' });

const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const {
  norm, addDias, dateFromObs, grupoDespesa, categoriaDivergente, observacaoNaoRepete,
} = require('./grm-despesas-guardas');
const { evidenciaDia, avaliarRegra } = require('./grm-despesas-evidencia');
const { obterTokenGrm } = require('./grm-token-cache');

const VERSION = 'V1.2-APROVAR-PENDENCIAS-DUPLICATA-POR-DATA-EFETIVA';
const AGENTE_ID = 'sync-aprovar-pendencias';
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
  || String(process.env.GRM_APROVAR_PENDENCIAS_DRY_RUN || 'false').toLowerCase() === 'true';
const JANELA_DIAS = Math.max(1, Number(process.env.GRM_APROVAR_PENDENCIAS_JANELA_DIAS || 10));
const MAX_ACTIONS = Math.max(1, Number(process.env.GRM_APROVAR_PENDENCIAS_MAX_ACOES || 100));

const GRUPOS = new Set(['CAFE', 'ALMOCO', 'JANTA', 'PERNOITE', 'DIARIA']);
const REFEICOES = new Set(['CAFE', 'ALMOCO', 'JANTA']);
const VALOR_PADRAO = { CAFE: 10, ALMOCO: 30, JANTA: 30, PERNOITE: 30 };

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

// ---- decisão (pura) ------------------------------------------------------------------
const diaDe = (row) => String(row.ofmDate).slice(0, 10);
// Data efetiva do lançamento = data citada na observação ou, sem ela, a do lançamento (mesmo critério do
// sync-despesas-duplicadas): "Janta referente ao dia 29/09" lançada em 01/10 é do dia 29/09, não do dia 01/10.
const efetivaDe = (row) => dateFromObs(row.ofmDescription, diaDe(row)) || diaDe(row);

// Grupo aprovável da pendência (Café, Almoço, Janta, Pernoite ou Diária lançados com a despesa certa) ou null.
// Diária = Salário de Intermitente / Serviços Terceirizados > R$ 45 (Terceirizados <= 45 é Almoço digitado
// errado: não é tratado aqui).
function grupoAprovavel(row) {
  const c = norm(row?.oexName);
  if (c === 'CAFE' || c === 'ALMOCO' || c === 'JANTA' || c === 'PERNOITE') return c;
  return grupoDespesa(row) === 'DIARIA' ? 'DIARIA' : null;
}

// Diária: valor tem que ser o salário do cadastro e o tipo lançado tem que combinar com o vínculo.
// cadastro = { salario, contrato (normalizado), admissao (AAAA-MM-DD ou '') }. Devolve o motivo ou null.
function motivoDiariaInvalida(row, cadastro = {}) {
  if (!(Number(cadastro.salario) > 0)) return 'sem_salario_no_cadastro';
  if (Math.abs(Number(row.ofmValue) - Number(cadastro.salario)) > 0.005) return 'valor_diferente_do_salario';
  const dia = diaDe(row);
  const antesDaAdmissao = !!cadastro.admissao && dia < cadastro.admissao;
  if (norm(row.oexName) === 'SALARIO DE INTERMITENTE') {
    if (cadastro.contrato !== 'INTERMITENTE') return 'vinculo_incompativel';
    if (antesDaAdmissao) return 'antes_da_admissao';
    return null;
  }
  // Serviços Terceirizados: Diarista, ou Intermitente em data anterior à admissão (ainda era diarista)
  if (cadastro.contrato === 'DIARISTA' || (cadastro.contrato === 'INTERMITENTE' && antesDaAdmissao)) return null;
  return 'vinculo_incompativel';
}

// ativos = linhas P/A do período (todas as despesas). Devolve { acao: 'APROVAR'|'MANTER', motivo, evidencia }.
// `ev` é a evidência do dia da pendência (grm-despesas-evidencia.js); `cadastro` só é usado na Diária.
function decidir(row, ativos, ev, cadastro = {}) {
  const grupo = grupoAprovavel(row);
  if (!grupo) return { acao: 'MANTER', motivo: 'despesa_nao_tratada' };
  if (categoriaDivergente(row)) return { acao: 'MANTER', motivo: 'observacao_cita_outra_despesa' };
  const naoRepete = observacaoNaoRepete(row);
  if (naoRepete) return { acao: 'MANTER', motivo: naoRepete };
  const dia = diaDe(row);
  const citada = dateFromObs(row.ofmDescription, dia);
  if (citada && citada !== dia) return { acao: 'MANTER', motivo: 'observacao_cita_outra_data' };
  if (grupo === 'DIARIA') {
    const invalida = motivoDiariaInvalida(row, cadastro);
    if (invalida) return { acao: 'MANTER', motivo: invalida };
  } else if (Number(row.ofmValue) !== VALOR_PADRAO[grupo]) {
    return { acao: 'MANTER', motivo: 'valor_fora_do_padrao' };
  }

  // Lançamentos do mesmo colaborador cuja data EFETIVA é o dia da pendência.
  const doColaboradorNoDia = ativos.filter((r) => r.ofmType === 'D' && Number(r.staCode) === Number(row.staCode)
    && Number(r.ofmCode) !== Number(row.ofmCode) && efetivaDe(r) === dia);
  // Duplicata: observação que cita outra despesa/pessoa/extra não é repetição (o duplicadas também as ignora).
  if (doColaboradorNoDia.some((r) => grupoDespesa(r) === grupo && !categoriaDivergente(r) && !observacaoNaoRepete(r))) {
    return { acao: 'MANTER', motivo: 'ha_outro_lancamento_ativo_no_dia' };
  }

  // Pernoite: QUALQUER Café/Almoço/Janta ativo no dia bloqueia (a hospedagem cobre a alimentação), inclusive
  // reembolso de refeição; só não conta o que, pela observação, é de outro dia.
  const refeicoesNoDia = doColaboradorNoDia
    .filter((r) => REFEICOES.has(grupoDespesa(r)))
    .map((r) => `${String(r.oexName).trim()} ${r.ofmCode} ${r.ofmStatus}`);
  const regra = avaliarRegra(grupo, norm(row.staName), ev, { refeicoesNoDia });
  if (!regra.ok) return { acao: 'MANTER', motivo: regra.motivo, refeicoes: regra.refeicoes };
  return { acao: 'APROVAR', grupo, evidencia: regra.evidencia };
}

// ---- API do GRM ----------------------------------------------------------------------
async function grmRequest(path, body, token) {
  const endpoint = String(path || '').replace(/^\/+/, '').replace(/^api\//, '');
  const response = await fetch(`${GRM_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { ...GRM_WEB_HEADERS, 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(60000),
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

// Token em cache compartilhado (grm-token-cache.js): o login direto exige Turnstile desde 30/09/2026.
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

// ---- auditoria -------------------------------------------------------------------------
async function lerTudo(tabela, colunas, ordem) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await getSupabase().from(tabela).select(colunas).order(ordem).range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

const admissaoIso = (value) => {
  const text = String(value || '').trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : '';
};

async function carregarCadastros(token) {
  const staff = (await grmRequest('/api/staff/getRecords', { staName: '', staCPF: '', staEmail: '', staStatus: 'A' }, token)).searchData || [];
  const contratos = await lerTudo('colaborador_cruzamento', 'cpf,tipo_contrato,salario', 'colaborador_id');
  const admissoes = await lerTudo('colaboradores', 'cpf,admissao', 'cpf');
  const cad = {
    cpfPorSta: new Map(staff.map((s) => [Number(s.staCode), digits(s.staCPF)])),
    contratoPorCpf: new Map(contratos.map((c) => [digits(c.cpf), c.tipo_contrato])),
    salarioPorCpf: new Map(contratos.map((c) => [digits(c.cpf), Number(c.salario) || 0])),
    admissaoPorCpf: new Map(admissoes.map((c) => [digits(c.cpf), admissaoIso(c.admissao)])),
  };
  cad.de = (row) => {
    const cpf = cad.cpfPorSta.get(Number(row.staCode)) || '';
    return { salario: cad.salarioPorCpf.get(cpf) || 0, contrato: norm(cad.contratoPorCpf.get(cpf)), admissao: cad.admissaoPorCpf.get(cpf) || '' };
  };
  return cad;
}

async function auditar(cad, row, sucesso, diagnostico, erro) {
  const cpf = cad.cpfPorSta.get(Number(row.staCode)) || '';
  const { error } = await getSupabase().from('grm_despesas_retroativas_auditoria').insert({
    data_referencia: diaDe(row),
    cpf,
    colaborador: String(row.staName || '').trim(),
    sta_code: Number(row.staCode),
    tipo_contrato: cad.contratoPorCpf.get(cpf) || '',
    tipo_despesa: String(row.oexName || '').trim(),
    oex_code: Number(row.oexCode),
    valor: Number(row.ofmValue) || 0,
    acao: 'APPROVE',
    ofm_code: Number(row.ofmCode),
    dry_run: DRY_RUN,
    sucesso,
    erro: erro || null,
    diagnostico: { agente: AGENTE_ID, versao: VERSION, ...diagnostico },
  });
  if (error) log('ERROR', `Falha ao gravar auditoria do ofmCode ${row.ofmCode}: ${error.message}`);
}

// ---- execução ----------------------------------------------------------------------------
async function main() {
  const hoje = hojeSaoPaulo();
  const fim = addDias(hoje, -1);
  const inicio = addDias(hoje, -JANELA_DIAS);
  log('INFO', `Agente ${VERSION}: janela ${inicio} a ${fim}.`, { dry_run: DRY_RUN, max_acoes: MAX_ACTIONS });

  const token = await login();
  const ativos = [];
  // busca até hoje: um lançamento de hoje pode citar (na observação) o dia da pendência
  for (let d = inicio; d <= hoje; d = addDias(d, 1)) {
    ativos.push(...(await fluxoDia(token, d)).filter((r) => r.ofmType === 'D' && ['P', 'A'].includes(r.ofmStatus)));
    await sleep(150);
  }
  const pendentes = ativos.filter((r) => r.ofmStatus === 'P' && grupoAprovavel(r) && diaDe(r) <= fim)
    .sort((a, b) => Number(a.ofmCode) - Number(b.ofmCode));

  const cad = await carregarCadastros(token);
  const resumo = { pendentes: pendentes.length, aprovadas: 0, mantidas: 0, adiados: 0, errors: 0 };
  const motivos = {};
  const plano = [];
  for (const row of pendentes) {
    const ev = await evidenciaDia(getSupabase(), diaDe(row));
    const decisao = decidir(row, ativos, ev, cad.de(row));
    if (decisao.acao === 'APROVAR') { plano.push({ row, decisao }); continue; }
    resumo.mantidas += 1;
    motivos[decisao.motivo] = (motivos[decisao.motivo] || 0) + 1;
  }
  log('INFO', 'Plano.', { aprovar: plano.length, mantidas_por_motivo: motivos });

  if (!plano.length) {
    log('SUCCESS', 'Execução concluída.', resumo);
    return;
  }

  let acoes = 0;
  for (const { row, decisao } of plano) {
    const rotulo = `${String(row.staName).trim()} / ${String(row.oexName).trim()} / ofm ${row.ofmCode} / ${diaDe(row)} / R$ ${row.ofmValue}`;
    if (acoes >= MAX_ACTIONS) { resumo.adiados += 1; log('WARN', `${rotulo}: limite de ${MAX_ACTIONS} ações; adiado.`); continue; }
    acoes += 1;
    const diagnostico = { motivo: 'pendencia_cumpre_regras_01_10', evidencia: decisao.evidencia, data_lancamento: diaDe(row), observacao: row.ofmDescription || '', haveMovement: row.haveMovement };
    try {
      log('INFO', `${DRY_RUN ? '[DRY-RUN] ' : ''}Aprovar ${rotulo} (${decisao.evidencia}).`);
      if (!DRY_RUN) await aprovar(token, row);
      resumo.aprovadas += 1;
      await auditar(cad, row, true, diagnostico);
    } catch (error) {
      resumo.errors += 1;
      log('ERROR', `${rotulo}: ${error.message}`);
      await auditar(cad, row, false, diagnostico, error.message);
    }
    await sleep(200);
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

module.exports = { decidir, grupoAprovavel, motivoDiariaInvalida, VALOR_PADRAO };
