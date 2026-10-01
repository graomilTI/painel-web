#!/usr/bin/env node
'use strict';

/*
 * EXECUÇÃO PONTUAL (01/10/2026) — não faz parte do SCRIPT_MAP/cron.
 *
 * Regras decididas pelo usuário para as pendências do Caixa Operacional:
 *   1) Almoço e diária (Salário de Intermitente / Serviços Terceirizados) com
 *      Embarque SIM: aprova direto (sem checar duplicata).
 *   2) Janta: aprova se o colaborador tiver laudo (grm_cargas_importacoes) em
 *      nome dele, na data do lançamento, registrado a partir das 19h no horário
 *      local do local de embarque (UF/cidade da carga).
 *   3) Café: idem, com laudo registrado antes das 07h local.
 *   Em todos os casos a data efetiva é a citada na observação (prioritária) ou,
 *   sem ela, a data do lançamento. Se a observação traz uma data diferente da
 *   do lançamento, o lançamento é CORRIGIDO: cria na data correta (se ali não
 *   houver lançamento ativo da mesma despesa), aprova o novo e recusa o original
 *   com "data corrigida"; havendo lançamento ativo na data correta, o original
 *   é recusado como "Duplicado".
 *   Janta/Café: se já existe aprovado do mesmo colaborador+categoria+data
 *   efetiva, recusa como "Duplicado"; várias pendências aptas no mesmo grupo
 *   aprovam a de menor ofmCode e recusam as demais como "Duplicado".
 *
 * Usa token em cache (nunca faz login). Padrão: DRY-RUN.
 *   node grm-pendencias-caixa-sim-laudo-pontual.js [--de 25/08/2026] [--ate 01/10/2026] [--executar]
 */

require('dotenv').config();
require('dotenv').config({ path: '.env.production' });
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const { obterTokenGrm } = require('./grm-token-cache');

const GRM_BASE_URL = String(process.env.GRMSERVER_API_URL || 'https://www.grmserver.com.br/api/').replace(/\/?$/, '/');
const HEADERS = {
  accept: 'application/json',
  origin: 'https://www.grmserver.com.br',
  referer: 'https://www.grmserver.com.br/login',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
};
const args = process.argv.slice(2);
const argVal = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const EXECUTAR = args.includes('--executar');
const DE = argVal('--de', '25/08/2026');
const ATE = argVal('--ate', '01/10/2026');

const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const log = (m, d) => console.log(`${new Date().toISOString()} ${m}${d === undefined ? '' : ' ' + JSON.stringify(d)}`);
const iso = (d) => d.toISOString().slice(0, 10);
const br = (i) => i.split('-').reverse().join('/');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isSim = (r) => String(r.haveMovement || '').toUpperCase() === 'S';

let supabase;
function sb() {
  if (!supabase) {
    supabase = createClient(process.env.SUPABASE_URL || process.env.SB_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: WebSocket } });
  }
  return supabase;
}

async function grm(path, body, token, multipart = false) {
  const headers = { ...HEADERS, authorization: `Bearer ${token}` };
  let rb;
  if (multipart) {
    rb = new FormData();
    Object.entries(body || {}).forEach(([k, v]) => rb.append(k, v == null ? '' : String(v)));
  } else { headers['content-type'] = 'application/json'; rb = JSON.stringify(body || {}); }
  const res = await fetch(`${GRM_BASE_URL}${path.replace(/^\/+/, '').replace(/^api\//, '')}`, { method: 'POST', headers, body: rb, signal: AbortSignal.timeout(60000) });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch (_) { throw new Error(`${path} HTTP ${res.status}: ${text.slice(0, 300)}`); }
  if (!res.ok || json?.result === false) throw new Error(`${path} HTTP ${res.status}: ${json?.message || text.slice(0, 300)}`);
  return json;
}
const fluxo = async (token, d, status = ['P', 'A']) => (await grm('/api/reports/finance/operatingFlow', { ofmDateFrom: d, ofmDateTo: d, ofmStatusReport: status, reportType: 'flowList' }, token)).searchData || [];
const aprovar = (t, r) => grm('/api/oFlow/approve', { ofmCode: Number(r.ofmCode), reproveReason: '', type: 'A' }, t);
const recusar = (t, r, m) => grm('/api/oFlow/disapprove', { ofmCode: Number(r.ofmCode), reproveReason: m, type: 'D' }, t);
const criar = (t, r, dataBr, desc) => grm('/api/oFlow/setRecord', {
  ofmType: 'D', staCode: Number(r.staCode), ofmDate: dataBr, ofmDescription: desc, ofmValue: Number(r.ofmValue).toFixed(2),
  oexCode: Number(r.oexCode), odtCode: Number(r.odtCode || 1), ofmDocument: '0', moreThenOneCompany: 'N', scpCode: Number(r.scpCode || 1),
}, t, true);

// ---- data citada na observação ------------------------------------------------
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

// ---- fuso do local de embarque (mesma regra de grm-sync-despesas-retroativas.js) ----
const AMAZONAS_UTC5 = new Set(['ATALAIA DO NORTE', 'BENJAMIN CONSTANT', 'BOCA DO ACRE', 'EIRUNEPE', 'ENVIRA', 'GUAJARA', 'IPIXUNA', 'ITAMARATI', 'JUTAI', 'LABREA', 'PAUINI', 'SAO PAULO DE OLIVENCA', 'TABATINGA', 'TONANTINS']);
function offsetFromSP(uf, city) {
  const s = norm(uf); const c = norm(city);
  if (s === 'AC') return -2;
  if (s === 'AM' && AMAZONAS_UTC5.has(c)) return -2;
  if (['AM', 'MT', 'MS', 'RO', 'RR'].includes(s)) return -1;
  if (s === 'PE' && c.includes('FERNANDO DE NORONHA')) return 1;
  return 0;
}
function localTime(reg, uf, city) {
  const m = String(reg || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const off = offsetFromSP(uf, city);
  const l = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) + off * 3600000);
  return { ymd: iso(l), hour: l.getUTCHours(), hhmm: `${String(l.getUTCHours()).padStart(2, '0')}:${String(l.getUTCMinutes()).padStart(2, '0')}`, off };
}

const loadsCache = new Map(); // dataIso -> Map(nomeNorm -> [{reg, uf, cidade, laudo, os}])
async function loadsDoDia(dataIso) {
  if (loadsCache.has(dataIso)) return loadsCache.get(dataIso);
  const mapa = new Map();
  const dias = [-1, 0, 1].map((n) => iso(new Date(Date.parse(dataIso) + n * 86400000)));
  for (const d of dias) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb().from('grm_cargas_importacoes')
        .select('colaborador,laudo,os,reg:dados_json->>loaRegisterDate,uf:dados_json->>staAbreviation,cidade:dados_json->>citName')
        .eq('data_classificacao', d).order('id').range(from, from + 999);
      if (error) throw error;
      for (const x of data || []) {
        if (!x.laudo || !x.reg) continue;
        const k = norm(x.colaborador);
        if (!mapa.has(k)) mapa.set(k, []);
        mapa.get(k).push(x);
      }
      if (!data || data.length < 1000) break;
    }
  }
  loadsCache.set(dataIso, mapa);
  return mapa;
}
async function laudoApto(row, dataEf, cat) {
  const mapa = await loadsDoDia(dataEf);
  const mine = mapa.get(norm(row.staName)) || [];
  const aptos = [];
  for (const x of mine) {
    const l = localTime(x.reg, x.uf, x.cidade);
    if (!l || l.ymd !== dataEf) continue;
    if (cat === 'JANTA' ? l.hour >= 19 : l.hour < 7) aptos.push({ laudo: x.laudo, os: x.os, local: `${l.ymd} ${l.hhmm}`, uf: x.uf, cidade: x.cidade, offset: l.off });
  }
  const horas = mine.map((x) => localTime(x.reg, x.uf, x.cidade)).filter((l) => l && l.ymd === dataEf).map((l) => l.hour);
  aptos.sort((a, b) => (cat === 'JANTA' ? b.local.localeCompare(a.local) : a.local.localeCompare(b.local)));
  return { apto: aptos.length > 0, melhor: aptos[0] || null, total: mine.length, horas };
}

const ALMOCO_DIARIA = (r) => {
  const c = norm(r.oexName);
  if (c === 'ALMOCO') return 'ALMOCO';
  if (c === 'SERVICOS TERCEIRIZADOS') return Number(r.ofmValue) <= 45 ? 'ALMOCO' : 'DIARIA';
  if (c === 'SALARIO DE INTERMITENTE') return 'DIARIA';
  return null;
};

async function main() {
  log(`Modo: ${EXECUTAR ? 'EXECUTAR (grava no GRM)' : 'DRY-RUN (só leitura)'} — ${DE} a ${ATE}`);
  const token = await obterTokenGrm({ login: async () => { throw new Error('Token GRM do dia ausente/vencido — grave com: node grm-token-cache.js salvar'); } });

  const rows = new Map();
  const [dd, mm, yy] = DE.split('/').map(Number); const [d2, m2, y2] = ATE.split('/').map(Number);
  for (let t = Date.UTC(yy, mm - 1, dd); t <= Date.UTC(y2, m2 - 1, d2); t += 86400000) {
    (await fluxo(token, br(iso(new Date(t))))).forEach((x) => rows.set(Number(x.ofmCode), x));
    await sleep(150);
  }
  const todos = [...rows.values()].filter((r) => r.ofmType === 'D');
  const pend = todos.filter((r) => r.ofmStatus === 'P');
  log(`Lançamentos ativos: ${todos.length}; pendentes: ${pend.length}`);
  const info = (r) => { const ofmIso = String(r.ofmDate).slice(0, 10); const obsData = dateFromObs(r.ofmDescription, ofmIso); return { ofmIso, dataEf: obsData || ofmIso, corrigir: !!obsData && obsData !== ofmIso }; };

  const aprovarLista = []; // {r, tipo, dataEf, corrigir, evidencia}
  const recusarLista = []; // {r, motivo, ref}
  const naoAptos = {}; const diag = {};

  // 1) almoço / diária SIM
  for (const r of pend.filter((x) => isSim(x) && ALMOCO_DIARIA(x))) {
    const i = info(r);
    aprovarLista.push({ r, tipo: ALMOCO_DIARIA(r), ...i, evidencia: 'Embarque SIM' });
  }

  // 2) janta / café com laudo
  const aptosPorGrupo = new Map();
  for (const r of pend.filter((x) => ['JANTA', 'CAFE'].includes(norm(x.oexName)))) {
    const cat = norm(r.oexName); const i = info(r);
    const l = await laudoApto(r, i.dataEf, cat);
    if (!l.apto && l.horas.length) { const h = cat === 'JANTA' ? Math.max(...l.horas) : Math.min(...l.horas); const b = cat === 'JANTA' ? `maior hora do laudo ${h >= 17 ? h : h >= 14 ? '14-16' : '<14'}` : `menor hora do laudo ${h >= 10 ? '10+' : h}`; diag[`${cat} ${b}`] = (diag[`${cat} ${b}`] || 0) + 1; }
    if (!l.apto) { const k = `${cat} ${isSim(r) ? 'SIM' : 'NÃO'} sem laudo apto (${l.total ? 'tem laudo na data, fora do horário' : 'sem laudo'})`; naoAptos[k] = (naoAptos[k] || 0) + 1; continue; }
    const key = `${Number(r.staCode)}|${cat}|${i.dataEf}`;
    if (!aptosPorGrupo.has(key)) aptosPorGrupo.set(key, []);
    aptosPorGrupo.get(key).push({ r, tipo: cat, ...i, evidencia: `laudo ${l.melhor.laudo} OS ${l.melhor.os} às ${l.melhor.local} (${l.melhor.cidade}/${l.melhor.uf}, fuso ${l.melhor.offset >= 0 ? '+' : ''}${l.melhor.offset}h vs SP)` });
  }
  const efetiva = (x) => { const i = info(x); return i.dataEf; };
  for (const [key, g] of aptosPorGrupo) {
    const [sta, cat, dataEf] = key.split('|');
    g.sort((a, b) => Number(a.r.ofmCode) - Number(b.r.ofmCode));
    const aprovado = todos.find((x) => x.ofmStatus === 'A' && Number(x.staCode) === Number(sta) && norm(x.oexName) === cat && efetiva(x) === dataEf);
    g.forEach((x, idx) => {
      if (aprovado) recusarLista.push({ r: x.r, motivo: 'Duplicado', ref: `aprovado ofmCode ${aprovado.ofmCode}` });
      else if (idx > 0) recusarLista.push({ r: x.r, motivo: 'Duplicado', ref: `pendente apta ofmCode ${g[0].r.ofmCode} (mantida)` });
      else aprovarLista.push(x);
    });
  }

  // correção com data muito distante do lançamento (>20 dias) é provável erro de digitação: não age, lista p/ revisão manual
  const revisaoManual = aprovarLista.filter((x) => x.corrigir && Math.abs(Date.parse(x.ofmIso) - Date.parse(x.dataEf)) / 86400000 > 20);
  revisaoManual.forEach((x) => aprovarLista.splice(aprovarLista.indexOf(x), 1));
  revisaoManual.forEach((x) => console.log(`  REVISÃO MANUAL (data da observação muito distante) ${x.r.ofmCode} | ${x.r.staName} | lanç ${x.ofmIso} obs "${String(x.r.ofmDescription || '').slice(0, 60)}" -> ${x.dataEf}`));
  const resumoAprov = aprovarLista.reduce((a, x) => { const k = `${x.tipo} ${isSim(x.r) ? 'SIM' : 'NÃO'}${x.corrigir ? ' (corrigir data)' : ''}`; a[k] = (a[k] || 0) + 1; return a; }, {});
  log('PLANO aprovar/corrigir', resumoAprov);
  log('PLANO recusar Duplicado', { total: recusarLista.length });
  log('Não aptos (permanecem pendentes)', naoAptos);
  log('Diagnóstico de horários (laudos na data, locais)', diag);
  const fmt = (r) => `${r.ofmCode} | ${r.staName} | ${r.oexName.trim()} ${r.ofmValue} | lanç ${String(r.ofmDate).slice(0, 10)} | "${String(r.ofmDescription || '').replace(/\s+/g, ' ').slice(0, 60)}"`;
  aprovarLista.filter((x) => x.corrigir).forEach((x) => console.log(`  CORRIGIR ${fmt(x.r)} -> ${x.dataEf}`));
  recusarLista.forEach((x) => console.log(`  RECUSAR  ${fmt(x.r)} | ${x.ref}`));
  if (!EXECUTAR) aprovarLista.filter((x) => x.tipo === 'JANTA' || x.tipo === 'CAFE').slice(0, 15).forEach((x) => console.log(`  amostra ${x.tipo} ${isSim(x.r) ? 'SIM' : 'NÃO'} ${x.r.staName}: ${x.evidencia}`));

  const resultados = [];
  const reg = (x, status, detalhe) => resultados.push({ ofmCode: Number(x.r.ofmCode), nome: x.r.staName, despesa: x.r.oexName.trim(), valor: Number(x.r.ofmValue), dataLancamento: String(x.r.ofmDate).slice(0, 10), acao: x.acao, status, detalhe });
  if (EXECUTAR) {
    for (const x of recusarLista) {
      try { await recusar(token, x.r, x.motivo); reg({ ...x, acao: 'RECUSAR' }, 'OK', x.ref); } catch (e) { reg({ ...x, acao: 'RECUSAR' }, 'ERRO', e.message); }
    }
    for (const x of aprovarLista.filter((y) => !y.corrigir)) {
      try { await aprovar(token, x.r); reg({ ...x, acao: 'APROVAR' }, 'OK', x.evidencia); } catch (e) { reg({ ...x, acao: 'APROVAR' }, 'ERRO', e.message); }
    }
    for (const x of aprovarLista.filter((y) => y.corrigir)) {
      try {
        const destino = br(x.dataEf);
        const noDestino = (await fluxo(token, destino)).filter((y) => y.ofmType === 'D' && Number(y.staCode) === Number(x.r.staCode) && Number(y.oexCode) === Number(x.r.oexCode));
        if (noDestino.length) {
          await recusar(token, x.r, 'Duplicado');
          reg({ ...x, acao: 'CORRIGIR' }, 'OK', `já existe em ${destino} (ofmCode ${noDestino[0].ofmCode}, ${noDestino[0].ofmStatus === 'A' ? 'APROVADO' : 'PENDENTE'}); original recusado Duplicado`);
        } else {
          await criar(token, x.r, destino, `${x.r.ofmDescription || ''} (data corrigida de ${br(x.ofmIso)}; original ${x.r.ofmCode})`.trim());
          const novos = (await fluxo(token, destino)).filter((y) => y.ofmType === 'D' && Number(y.staCode) === Number(x.r.staCode) && Number(y.oexCode) === Number(x.r.oexCode)).sort((a, b) => Number(b.ofmCode) - Number(a.ofmCode));
          if (!novos.length) throw new Error('lançamento criado não apareceu — original mantido pendente');
          if (novos[0].ofmStatus === 'P') await aprovar(token, novos[0]);
          await recusar(token, x.r, 'data corrigida');
          reg({ ...x, acao: 'CORRIGIR' }, 'OK', `criado/aprovado em ${destino} (ofmCode ${novos[0].ofmCode}); original recusado (data corrigida)`);
        }
      } catch (e) { reg({ ...x, acao: 'CORRIGIR' }, 'ERRO', e.message); log(`ERRO ${x.r.ofmCode}: ${e.message}`); }
    }
    log('RESUMO', resultados.reduce((a, r) => { const k = `${r.acao}/${r.status}`; a[k] = (a[k] || 0) + 1; return a; }, {}));
  }
  const out = `sim-laudo.${EXECUTAR ? 'executado' : 'dryrun'}.json`;
  fs.writeFileSync(out, JSON.stringify(EXECUTAR ? resultados : { aprovar: aprovarLista.map((x) => ({ ofmCode: x.r.ofmCode, nome: x.r.staName, tipo: x.tipo, corrigir: x.corrigir, dataEf: x.dataEf, evidencia: x.evidencia })), recusar: recusarLista.map((x) => ({ ofmCode: x.r.ofmCode, nome: x.r.staName, motivo: x.motivo, ref: x.ref })) }, null, 1));
  log(`Detalhes em ${out}`);
}

main().catch((e) => { console.error(`[ERRO FATAL] ${e.message}`); process.exit(1); });
