#!/usr/bin/env node
'use strict';

/*
 * EXECUÇÃO PONTUAL (01/10/2026) — não faz parte do SCRIPT_MAP/cron.
 *
 * Recusa com o motivo "Duplicado" as pendências do Caixa Operacional com
 * Embarque NÃO (haveMovement != 'S') em Almoço, Café, Janta, Serviços
 * Terceirizados e Salário de Intermitente que repetem um lançamento do mesmo
 * colaborador+categoria na mesma data. A data efetiva de cada lançamento é a
 * data citada na observação (prioritária) ou, sem ela, a data do lançamento.
 * Diária = Salário de Intermitente + Serviços Terceirizados (grupo único);
 * Serviços Terceirizados de valor <= 45 é tratado como Almoço lançado errado.
 *
 * Duplicata quando, no mesmo grupo (colaborador+categoria+data efetiva):
 *   - existe lançamento APROVADO, ou
 *   - existe pendência Embarque SIM, ou
 *   - há várias pendências Embarque NÃO (mantém a de menor ofmCode, recusa as demais).
 *
 * Usa o token em cache (grm-token-cache.js), nunca faz login. Padrão: DRY-RUN.
 *   node grm-pendencias-caixa-duplicados-pontual.js [--de 25/08/2026] [--ate 01/10/2026] [--executar]
 */

require('dotenv').config();
require('dotenv').config({ path: '.env.production' });
const fs = require('fs');
const { obterTokenGrm } = require('./grm-token-cache');

const GRM_BASE_URL = String(process.env.GRMSERVER_API_URL || 'https://www.grmserver.com.br/api/').replace(/\/?$/, '/');
const HEADERS = {
  accept: 'application/json',
  origin: 'https://www.grmserver.com.br',
  referer: 'https://www.grmserver.com.br/login',
  'content-type': 'application/json',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
};
const args = process.argv.slice(2);
const argVal = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const EXECUTAR = args.includes('--executar');
const DE = argVal('--de', '25/08/2026');
const ATE = argVal('--ate', '01/10/2026');
const CATEGORIAS = new Set(['ALMOCO', 'CAFE', 'JANTA', 'SERVICOS TERCEIRIZADOS', 'SALARIO DE INTERMITENTE']);

const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const log = (m, d) => console.log(`${new Date().toISOString()} ${m}${d === undefined ? '' : ' ' + JSON.stringify(d)}`);
const iso = (d) => d.toISOString().slice(0, 10);
const br = (isoDate) => isoDate.split('-').reverse().join('/');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function grm(path, body, token) {
  const res = await fetch(`${GRM_BASE_URL}${path.replace(/^\/+/, '').replace(/^api\//, '')}`, {
    method: 'POST', headers: { ...HEADERS, authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch (_) { throw new Error(`${path} HTTP ${res.status}: ${text.slice(0, 300)}`); }
  if (!res.ok || json?.result === false) throw new Error(`${path} HTTP ${res.status}: ${json?.message || text.slice(0, 300)}`);
  return json;
}

// Data citada na observação (formato ISO) ou null. Só vale se estiver entre 45 dias antes e 7 dias depois da data do lançamento.
const DATE_RE = /(?<!\d)(\d{1,2})\s*([/.-])\s*(\d{1,2})(?:\s*[/.-]?\s*(\d{4}|\d{2}))?(?!\d)/g;
function dateFromObs(obs, ofmIso) {
  const text = String(obs || '');
  const [y0, m0] = ofmIso.split('-').map(Number);
  const valid = (y, m, d) => {
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCMonth() !== m - 1) return null;
    const i = iso(dt);
    const dias = (Date.parse(ofmIso) - Date.parse(i)) / 86400000;
    return dias >= -7 && dias <= 45 ? i : null;
  };
  for (const m of text.matchAll(DATE_RE)) {
    const hasYear = m[4] !== undefined;
    if (m[2] === '.' && !hasYear) continue; // "5.5 litros" não é data
    const r = valid(y0, Number(m[3]), Number(m[1]));
    if (r) return r;
  }
  const dia = text.match(/\bdia\s+(\d{1,2})(?!\d|\s*[/.-]\s*\d)/i);
  if (dia) {
    const d = Number(dia[1]);
    const r = valid(y0, m0, d) || valid(m0 === 1 ? y0 - 1 : y0, m0 === 1 ? 12 : m0 - 1, d);
    if (r) return r;
  }
  const t = norm(text);
  const menos = (n) => iso(new Date(Date.parse(ofmIso) - n * 86400000));
  if (/\bANTEONTEM\b/.test(t)) return menos(2);
  if (/\bONTEM\b/.test(t)) return menos(1);
  return null;
}

const grupoCategoria = (row) => {
  const c = norm(row.oexName);
  if (c === 'SERVICOS TERCEIRIZADOS' && Number(row.ofmValue) <= 45) return 'ALMOCO';
  if (c === 'SERVICOS TERCEIRIZADOS' || c === 'SALARIO DE INTERMITENTE') return 'DIARIA';
  return c;
};

async function main() {
  log(`Modo: ${EXECUTAR ? 'EXECUTAR (grava no GRM)' : 'DRY-RUN (só leitura)'} — ${DE} a ${ATE}`);
  const token = await obterTokenGrm({ login: async () => { throw new Error('Token GRM do dia ausente/vencido — grave com: node grm-token-cache.js salvar'); } });

  const rows = new Map();
  const [dd, mm, yy] = DE.split('/').map(Number); const [d2, m2, y2] = ATE.split('/').map(Number);
  for (let t = Date.UTC(yy, mm - 1, dd); t <= Date.UTC(y2, m2 - 1, d2); t += 86400000) {
    const d = br(iso(new Date(t)));
    const r = await grm('/api/reports/finance/operatingFlow', { ofmDateFrom: d, ofmDateTo: d, ofmStatusReport: ['P', 'A'], reportType: 'flowList' }, token);
    (r.searchData || []).forEach((x) => rows.set(Number(x.ofmCode), x));
    await sleep(150);
  }
  const todos = [...rows.values()].filter((r) => r.ofmType === 'D' && CATEGORIAS.has(norm(r.oexName)));
  log(`Lançamentos ativos (P/A) nas categorias: ${todos.length}`);

  const grupos = new Map();
  for (const r of todos) {
    const ofmIso = String(r.ofmDate).slice(0, 10);
    const dataEf = dateFromObs(r.ofmDescription, ofmIso) || ofmIso;
    const k = `${Number(r.staCode)}|${grupoCategoria(r)}|${dataEf}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push({ r, dataEf, ofmIso });
  }

  const multi = [...grupos.values()].filter((g) => g.length > 1);
  log(`Grupos com 2+ lançamentos: ${multi.length}; com alguma pendência Embarque NÃO: ${multi.filter((g) => g.some((x) => x.r.ofmStatus === 'P' && String(x.r.haveMovement || '').toUpperCase() !== 'S')).length}`);
  const recusar = [];
  for (const [k, g] of grupos) {
    const pend = g.filter((x) => x.r.ofmStatus === 'P' && String(x.r.haveMovement || '').toUpperCase() !== 'S')
      .sort((a, b) => Number(a.r.ofmCode) - Number(b.r.ofmCode));
    if (!pend.length || g.length < 2) continue;
    const aprovado = g.find((x) => x.r.ofmStatus === 'A');
    const simPend = g.find((x) => x.r.ofmStatus === 'P' && String(x.r.haveMovement || '').toUpperCase() === 'S');
    const ref = aprovado || simPend;
    pend.forEach((x, i) => {
      let motivoRef = null;
      if (ref) motivoRef = `${aprovado ? 'aprovado' : 'pendente Embarque SIM'} ofmCode ${ref.r.ofmCode}`;
      else if (i > 0) motivoRef = `pendente Embarque NÃO ofmCode ${pend[0].r.ofmCode} (mantido)`;
      if (motivoRef) recusar.push({ ofmCode: Number(x.r.ofmCode), nome: x.r.staName, categoria: x.r.oexName, valor: Number(x.r.ofmValue), dataLancamento: br(x.ofmIso), dataEfetiva: br(x.dataEf), obs: x.r.ofmDescription || '', repete: motivoRef });
    });
  }
  recusar.sort((a, b) => a.nome.localeCompare(b.nome) || a.dataEfetiva.localeCompare(b.dataEfetiva));
  log(`Duplicados a recusar: ${recusar.length}`);
  recusar.forEach((x) => console.log(`  ${x.ofmCode} | ${x.nome} | ${x.categoria} ${x.valor} | lanç ${x.dataLancamento} efetiva ${x.dataEfetiva} | "${String(x.obs).replace(/\s+/g, ' ').slice(0, 70)}" | repete ${x.repete}`));

  const resultados = [];
  if (EXECUTAR) {
    for (const x of recusar) {
      try {
        await grm('/api/oFlow/disapprove', { ofmCode: x.ofmCode, reproveReason: 'Duplicado', type: 'D' }, token);
        resultados.push({ ...x, status: 'OK' });
      } catch (e) { resultados.push({ ...x, status: 'ERRO', erro: e.message }); log(`ERRO ${x.ofmCode}: ${e.message}`); }
    }
    log('RESUMO', resultados.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {}));
  }
  const out = `duplicados-embarque-nao.${EXECUTAR ? 'executado' : 'dryrun'}.json`;
  fs.writeFileSync(out, JSON.stringify(EXECUTAR ? resultados : recusar, null, 1));
  log(`Detalhes em ${out}`);
}

main().catch((e) => { console.error(`[ERRO FATAL] ${e.message}`); process.exit(1); });
