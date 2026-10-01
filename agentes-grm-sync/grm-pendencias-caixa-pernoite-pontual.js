#!/usr/bin/env node
'use strict';

/*
 * EXECUÇÃO PONTUAL (01/10/2026) — não faz parte do SCRIPT_MAP/cron.
 *
 * Aprova (SOMENTE aprova; nunca recusa nem cria) as pendências de Pernoite do
 * Caixa Operacional do GRM quando:
 *   - Embarque = SIM (haveMovement = 'S'); e
 *   - o colaborador NÃO tem Café, Almoço ou Janta ativo (pendente ou aprovado)
 *     no dia do Pernoite — hospedagem cobre a alimentação.
 * Data do Pernoite = data citada na observação (prioritária) ou a do lançamento;
 * para as refeições vale a data efetiva E a data do lançamento (conservador).
 * Pernoite cuja observação aponta data diferente da do lançamento, ou que já
 * tenha outro Pernoite aprovado no mesmo dia, não é aprovado (fica para revisão).
 * Várias pendências aptas no mesmo dia: aprova a de menor ofmCode, as demais ficam.
 *
 * Usa token em cache (nunca faz login). Padrão: DRY-RUN.
 *   node grm-pendencias-caixa-pernoite-pontual.js [--de 25/08/2026] [--ate 01/10/2026] [--executar]
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
const REFEICOES = new Set(['CAFE', 'ALMOCO', 'JANTA']);

const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const log = (m, d) => console.log(`${new Date().toISOString()} ${m}${d === undefined ? '' : ' ' + JSON.stringify(d)}`);
const iso = (d) => d.toISOString().slice(0, 10);
const br = (i) => i.split('-').reverse().join('/');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isSim = (r) => String(r.haveMovement || '').toUpperCase() === 'S';

async function grm(path, body, token) {
  const res = await fetch(`${GRM_BASE_URL}${path.replace(/^\/+/, '').replace(/^api\//, '')}`, {
    method: 'POST', headers: { ...HEADERS, authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch (_) { throw new Error(`${path} HTTP ${res.status}: ${text.slice(0, 300)}`); }
  if (!res.ok || json?.result === false) throw new Error(`${path} HTTP ${res.status}: ${json?.message || text.slice(0, 300)}`);
  return json;
}
const aprovar = (t, r) => grm('/api/oFlow/approve', { ofmCode: Number(r.ofmCode), reproveReason: '', type: 'A' }, t);

const DATE_RE = /(?<!\d)(\d{1,2})\s*([/.-])\s*(\d{1,2})(?:\s*[/.-]?\s*(\d{4}|\d{2}))?(?!\d)/g;
function dateFromObs(obs, ofmIso) {
  const text = String(obs || '');
  const [y0, m0] = ofmIso.split('-').map(Number);
  const valid = (y, m, d) => {
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCMonth() !== m - 1) return null;
    const dias = (Date.parse(ofmIso) - Date.parse(iso(dt))) / 86400000;
    return dias >= -7 && dias <= 45 ? iso(dt) : null;
  };
  for (const m of text.matchAll(DATE_RE)) {
    if (m[2] === '.' && m[4] === undefined) continue;
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
  const todos = [...rows.values()].filter((r) => r.ofmType === 'D');
  const info = (r) => { const ofmIso = String(r.ofmDate).slice(0, 10); const obsData = dateFromObs(r.ofmDescription, ofmIso); return { ofmIso, dataEf: obsData || ofmIso, divergente: !!obsData && obsData !== ofmIso }; };
  const pernoitesP = todos.filter((r) => r.ofmStatus === 'P' && norm(r.oexName) === 'PERNOITE');
  log(`Lançamentos ativos: ${todos.length}; Pernoites pendentes: ${pernoitesP.length} (SIM: ${pernoitesP.filter(isSim).length})`);

  const refeicoesPorSta = new Map(); // staCode -> [{r, datas:Set}]
  todos.filter((r) => REFEICOES.has(norm(r.oexName))).forEach((r) => {
    const i = info(r);
    const k = Number(r.staCode);
    if (!refeicoesPorSta.has(k)) refeicoesPorSta.set(k, []);
    refeicoesPorSta.get(k).push({ r, datas: new Set([i.ofmIso, i.dataEf]) });
  });
  const pernoitesAprovados = todos.filter((r) => r.ofmStatus === 'A' && norm(r.oexName) === 'PERNOITE');

  const aprovarLista = []; const naoAprovados = {}; const detalhesNao = [];
  const nao = (r, motivo, extra) => { naoAprovados[motivo] = (naoAprovados[motivo] || 0) + 1; detalhesNao.push({ ofmCode: Number(r.ofmCode), nome: r.staName, data: br(String(r.ofmDate).slice(0, 10)), motivo, extra }); };
  const grupos = new Map();
  for (const r of pernoitesP) {
    if (!isSim(r)) { nao(r, 'Embarque NÃO'); continue; }
    const i = info(r);
    if (i.divergente) { nao(r, 'observação aponta data diferente do lançamento (revisar/corrigir)', `obs → ${br(i.dataEf)}`); continue; }
    const refs = (refeicoesPorSta.get(Number(r.staCode)) || []).filter((x) => x.datas.has(i.dataEf));
    if (refs.length) { nao(r, 'tem café/almoço/janta no dia', refs.map((x) => `${x.r.oexName.trim()} ${x.r.ofmCode} ${x.r.ofmStatus}`).join(', ')); continue; }
    const jaAprov = pernoitesAprovados.find((x) => Number(x.staCode) === Number(r.staCode) && info(x).dataEf === i.dataEf);
    if (jaAprov) { nao(r, 'já existe Pernoite aprovado no dia', `ofmCode ${jaAprov.ofmCode}`); continue; }
    const k = `${Number(r.staCode)}|${i.dataEf}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(r);
  }
  for (const g of grupos.values()) {
    g.sort((a, b) => Number(a.ofmCode) - Number(b.ofmCode));
    aprovarLista.push(g[0]);
    g.slice(1).forEach((r) => nao(r, 'mais de um Pernoite pendente apto no dia (aprovada a de menor código)', `mantida ${g[0].ofmCode}`));
  }

  log(`PLANO: aprovar ${aprovarLista.length} Pernoite(s)`);
  log('Não aprovados', naoAprovados);
  aprovarLista.forEach((r) => console.log(`  APROVAR ${r.ofmCode} | ${r.staName} | Pernoite ${r.ofmValue} | ${br(String(r.ofmDate).slice(0, 10))} | "${String(r.ofmDescription || '').replace(/\s+/g, ' ').slice(0, 50)}"`));

  const resultados = [];
  if (EXECUTAR) {
    for (const r of aprovarLista) {
      const base = { ofmCode: Number(r.ofmCode), nome: r.staName, despesa: 'Pernoite', valor: Number(r.ofmValue), dataLancamento: String(r.ofmDate).slice(0, 10) };
      try { await aprovar(token, r); resultados.push({ ...base, status: 'OK' }); } catch (e) { resultados.push({ ...base, status: 'ERRO', erro: e.message }); log(`ERRO ${r.ofmCode}: ${e.message}`); }
    }
    log('RESUMO', resultados.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {}));
  }
  const out = `pernoite.${EXECUTAR ? 'executado' : 'dryrun'}.json`;
  fs.writeFileSync(out, JSON.stringify({ aprovar: EXECUTAR ? resultados : aprovarLista.map((r) => Number(r.ofmCode)), naoAprovados: detalhesNao }, null, 1));
  log(`Detalhes em ${out}`);
}

main().catch((e) => { console.error(`[ERRO FATAL] ${e.message}`); process.exit(1); });
