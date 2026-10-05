#!/usr/bin/env node
'use strict';

/*
 * Script PONTUAL (04/10/2026): relança despesas que o bot recusou por engano (auditoria das
 * recusas do sync-despesas-duplicadas / sync-despesas-retroativas) — a observação citava uma
 * data em que o colaborador hoje NÃO tem a despesa.
 *
 * Plano (JSON): [{ "ofm": <ofmCode da recusada>, "dataLanc": "AAAA-MM-DD", "dataAlvo": "AAAA-MM-DD" }]
 *   dataLanc = dia em que a recusada foi lançada (onde ela está no Caixa); dataAlvo = dia citado.
 *   Despesa APAGADA (lixeira do GRM): { "excluida": true, "ofm", "cpf", "tipo", "valor", "obs", "dataLanc", "dataAlvo", "motivoExclusao" } —
 *   monta o lançamento pelo CPF/tipo; Intermitente não é relançado antes da admissão (decisão de 03/10).
 *
 * Para cada item, nesta ordem:
 *   1) a recusada ainda está recusada (status N) — senão pula;
 *   2) duplicado no próprio plano (mesmo colaborador + despesa + dataAlvo): relança só o de menor ofm;
 *   3) ainda não existe lançamento ativo (P/A) da mesma despesa na dataAlvo — senão pula;
 *   4) evidência de trabalho no dia (mesmas regras de 01/10 do agente de duplicadas):
 *      Almoço/Diária/Pernoite: movimento (produção, laudo ou NHE); Janta: laudo a partir das 19h local;
 *      Café: laudo antes das 07h local.
 * Aprovado em todos: cria na dataAlvo (mesma despesa, valor e observação do original, com a marca
 * "relançado; original N"), aprova o novo e grava a auditoria como CREATE (custo aprovado na data
 * correta). O original continua recusado. Idempotente: a marca evita criar duas vezes.
 *
 *   node grm-relancar-recusadas-pontual.js plano.json            (dry-run, padrão)
 *   node grm-relancar-recusadas-pontual.js plano.json --executar
 *   ... --ignorar-evidencia   só por decisão explícita do usuário: pula o passo 4 (fica na auditoria)
 */

require('dotenv').config();
require('dotenv').config({ path: '.env.production' });

const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const { registerDateAtPoint } = require('./grm-sync-despesas-retroativas');
const { norm, addDias, grupoDespesa } = require('./grm-despesas-guardas');
const { obterTokenGrm } = require('./grm-token-cache');

const AGENTE_ID = 'relancar-recusadas-pontual';
const EXECUTAR = process.argv.includes('--executar');
// Decisão explícita do usuário (05/10/2026): relança mesmo sem produção/laudo/NHE no dia citado.
// Continua barrando recusada que não está mais recusada, duplicata no plano e despesa que já existe na data.
const IGNORAR_EVIDENCIA = process.argv.includes('--ignorar-evidencia');
const PLANO = process.argv.slice(2).find((a) => !a.startsWith('--'));
const GRM_BASE_URL = String(process.env.GRMSERVER_API_URL || 'https://www.grmserver.com.br/api/').replace(/\/?$/, '/');
const GRM_WEB_HEADERS = {
  accept: 'application/json',
  origin: 'https://www.grmserver.com.br',
  referer: 'https://www.grmserver.com.br/login',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const digits = (value) => String(value || '').replace(/\D/g, '');
const isoToBr = (iso) => iso.split('-').reverse().join('/');
const log = (msg, data) => console.log(`${new Date().toISOString()} ${msg}${data === undefined ? '' : ` ${JSON.stringify(data)}`}`);

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
  try { json = text ? JSON.parse(text) : {}; } catch (_) {
    throw new Error(`GRM ${endpoint} retornou conteúdo inválido (HTTP ${response.status}): ${text.slice(0, 300)}`);
  }
  if (!response.ok || json?.result === false) throw new Error(`GRM ${endpoint} HTTP ${response.status}: ${json?.message || text.slice(0, 500)}`);
  return json;
}

const login = () => obterTokenGrm({
  login: async () => { throw new Error('Sem token em cache do GRM (grm-token-cache.js salvar).'); },
});

const fluxoDia = async (token, iso, status = ['P', 'A']) => (await grmRequest('/api/reports/finance/operatingFlow', {
  ofmDateFrom: isoToBr(iso), ofmDateTo: isoToBr(iso), ofmStatusReport: status, reportType: 'flowList',
}, token)).searchData || [];
const aprovar = (token, row) => grmRequest('/api/oFlow/approve', { ofmCode: Number(row.ofmCode), reproveReason: '', type: 'A' }, token);
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

async function queryAll(table, select, configure) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await configure(getSupabase().from(table).select(select).range(from, from + 999));
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

// ---- evidência de trabalho no dia (mesma do agente de duplicadas) ------------------------
const evidenciaCache = new Map();
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

async function avaliarEvidencia(row, dataAlvo) {
  const grupo = grupoDespesa(row);
  const nome = norm(row.staName);
  const ev = await evidenciaDia(dataAlvo);
  const laudos = ev.laudos.get(nome) || [];
  if (grupo === 'CAFE') {
    const apto = laudos.filter((l) => l.hora < 7).sort((a, b) => a.local.localeCompare(b.local))[0];
    return apto ? { ok: true, evidencia: `laudo ${apto.laudo} OS ${apto.os} às ${apto.local} (antes das 07h local)` } : { ok: false, motivo: 'sem_laudo_antes_das_07h_na_data' };
  }
  if (grupo === 'JANTA') {
    const apto = laudos.filter((l) => l.hora >= 19).sort((a, b) => b.local.localeCompare(a.local))[0];
    return apto ? { ok: true, evidencia: `laudo ${apto.laudo} OS ${apto.os} às ${apto.local} (a partir das 19h local)` } : { ok: false, motivo: 'sem_laudo_a_partir_das_19h_na_data' };
  }
  if (!ev.nomes.has(nome) && !laudos.length) return { ok: false, motivo: 'sem_embarque_na_data' };
  return { ok: true, evidencia: 'Embarque SIM na data (produção/laudo/NHE)' };
}

async function carregarCadastros(token) {
  const staff = (await grmRequest('/api/staff/getRecords', { staName: '', staCPF: '', staEmail: '', staStatus: 'A' }, token)).searchData || [];
  const contratos = await queryAll('colaborador_cruzamento', 'cpf,tipo_contrato', (q) => q.order('colaborador_id'));
  return {
    cpfPorSta: new Map(staff.map((s) => [Number(s.staCode), digits(s.staCPF)])),
    contratoPorCpf: new Map(contratos.map((c) => [digits(c.cpf), c.tipo_contrato])),
  };
}

async function auditar(cad, row, dataRef, diagnostico, sucesso, erro) {
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
    acao: 'CREATE',
    ofm_code: Number(diagnostico.ofm_code_aprovado || row.ofmCode),
    dry_run: !EXECUTAR,
    sucesso,
    erro: erro || null,
    diagnostico: { agente: AGENTE_ID, ...diagnostico },
  });
  if (error) log(`ERRO gravando auditoria do ofm ${row.ofmCode}: ${error.message}`);
}

async function relancar(token, original, dataAlvo) {
  const marca = `relançado; original ${original.ofmCode}`;
  const doDestino = async () => (await fluxoDia(token, dataAlvo)).filter((y) => y.ofmType === 'D'
    && Number(y.staCode) === Number(original.staCode) && Number(y.oexCode) === Number(original.oexCode));
  let novo = (await doDestino()).find((y) => String(y.ofmDescription || '').includes(marca));
  if (!novo) {
    await criar(token, original, dataAlvo, `${String(original.ofmDescription || '').trim()} (${marca})`.trim());
    novo = (await doDestino()).filter((y) => String(y.ofmDescription || '').includes(marca))
      .sort((a, b) => Number(b.ofmCode) - Number(a.ofmCode))[0];
    if (!novo) throw new Error('Lançamento criado não apareceu na conferência.');
  }
  if (novo.ofmStatus === 'P') await aprovar(token, novo);
  return Number(novo.ofmCode);
}

async function main() {
  if (!PLANO) throw new Error('Uso: node grm-relancar-recusadas-pontual.js plano.json [--executar]');
  const plano = JSON.parse(fs.readFileSync(PLANO, 'utf8'));
  log(`${EXECUTAR ? 'EXECUTANDO' : 'DRY-RUN'}: ${plano.length} itens no plano.`);
  const token = await login();

  // 1) recusadas no GRM
  const TODOS = ['P', 'A', 'N', 'D'];
  const cacheDia = new Map();
  const tipos = new Map(); // despesa -> { oexCode, odtCode, scpCode }, aprendido das linhas lidas do GRM
  const lerDia = async (iso, status = TODOS) => {
    const k = `${iso}|${status.join('')}`;
    if (!cacheDia.has(k)) {
      const rows = await fluxoDia(token, iso, status);
      rows.forEach((r) => { if (r.oexName && !tipos.has(norm(r.oexName))) tipos.set(norm(r.oexName), { oexCode: r.oexCode, odtCode: r.odtCode, scpCode: r.scpCode }); });
      cacheDia.set(k, rows);
      await sleep(150);
    }
    return cacheDia.get(k);
  };

  // itens "excluida": despesa APAGADA do GRM (lixeira) — não há linha para ler; monta a partir do plano
  // (CPF -> colaborador ativo no GRM; despesa -> código aprendido do GRM; admissão do Intermitente).
  const temExcluidas = plano.some((p) => p.excluida);
  const staffPorCpf = new Map();
  const admissaoPorCpf = new Map();
  if (temExcluidas) {
    ((await grmRequest('/api/staff/getRecords', { staName: '', staCPF: '', staEmail: '', staStatus: 'A' }, token)).searchData || [])
      .forEach((st) => staffPorCpf.set(digits(st.staCPF), st));
    (await queryAll('colaboradores', 'cpf,admissao', (q) => q.order('cpf'))).forEach((c) => { if (c.admissao) admissaoPorCpf.set(digits(c.cpf), String(c.admissao).slice(0, 10)); });
  }

  const itens = [];
  for (const p of plano) {
    if (p.excluida) {
      const st = staffPorCpf.get(digits(p.cpf));
      if (!st) { itens.push({ ...p, resultado: 'PULADO', motivo: 'colaborador_nao_encontrado_ativo_no_grm' }); continue; }
      await lerDia(p.dataAlvo);
      const t = tipos.get(norm(p.tipo));
      if (!t) { itens.push({ ...p, resultado: 'PULADO', motivo: 'tipo_de_despesa_desconhecido_no_grm' }); continue; }
      const original = { ofmCode: p.ofm, ofmStatus: 'EXCLUIDA', staCode: st.staCode, staName: st.staName, oexCode: t.oexCode, oexName: p.tipo, odtCode: t.odtCode, scpCode: t.scpCode, ofmValue: p.valor, ofmDescription: p.obs };
      const adm = admissaoPorCpf.get(digits(p.cpf));
      if (norm(p.tipo) === 'SALARIO DE INTERMITENTE' && adm && p.dataAlvo < adm) { itens.push({ ...p, original, resultado: 'PULADO', motivo: `antes_da_admissao (${adm})` }); continue; }
      itens.push({ ...p, original });
      continue;
    }
    const original = (await lerDia(p.dataLanc)).find((r) => Number(r.ofmCode) === Number(p.ofm));
    if (!original) { itens.push({ ...p, resultado: 'PULADO', motivo: 'recusada_nao_encontrada_no_dia' }); continue; }
    if (original.ofmStatus !== 'N') { itens.push({ ...p, original, resultado: 'PULADO', motivo: `status_atual_${original.ofmStatus}` }); continue; }
    itens.push({ ...p, original });
  }

  // 2) duplicados no próprio plano
  const vistos = new Map();
  for (const it of itens.filter((i) => !i.resultado).sort((a, b) => Number(a.ofm) - Number(b.ofm))) {
    const key = `${it.original.staCode}|${grupoDespesa(it.original)}|${it.dataAlvo}`;
    if (vistos.has(key)) { it.resultado = 'PULADO'; it.motivo = `duplicado_no_plano (fica o ofm ${vistos.get(key)})`; } else vistos.set(key, it.ofm);
  }

  // 3) já existe na data alvo? 4) evidência
  for (const it of itens.filter((i) => !i.resultado)) {
    const grupo = grupoDespesa(it.original);
    const ativos = (await lerDia(it.dataAlvo)).filter((r) => r.ofmType === 'D' && ['P', 'A'].includes(r.ofmStatus)
      && Number(r.staCode) === Number(it.original.staCode) && grupoDespesa(r) === grupo);
    if (ativos.length) { it.resultado = 'PULADO'; it.motivo = `ja_existe_na_data_alvo (ofm ${ativos[0].ofmCode} ${ativos[0].ofmStatus} R$${ativos[0].ofmValue})`; continue; }
    const ev = await avaliarEvidencia(it.original, it.dataAlvo);
    if (!ev.ok && !IGNORAR_EVIDENCIA) { it.resultado = 'PULADO'; it.motivo = ev.motivo; continue; }
    it.evidencia = ev.ok ? ev.evidencia : `SEM evidência (${ev.motivo}); relançado por decisão do usuário (--ignorar-evidencia)`;
    it.resultado = 'RELANCAR';
  }

  const aRelancar = itens.filter((i) => i.resultado === 'RELANCAR');
  console.log('\n=== PLANO ===');
  for (const it of itens) {
    const o = it.original;
    console.log(`${it.resultado.padEnd(8)} ofm ${it.ofm} ${o ? String(o.staName).trim().slice(0, 26).padEnd(26) : ''.padEnd(26)} ${o ? String(o.oexName).trim().slice(0, 14).padEnd(14) : ''} R$${o ? o.ofmValue : '?'} ${it.dataLanc} → ${it.dataAlvo} | ${it.motivo || it.evidencia}`);
  }
  log('Resumo', { relancar: aRelancar.length, pulados: itens.length - aRelancar.length, valor_relancar: aRelancar.reduce((s, i) => s + Number(i.original.ofmValue), 0) });
  if (!EXECUTAR) { log('DRY-RUN: nada foi criado. Rode com --executar.'); return; }

  const cad = await carregarCadastros(token);
  let erros = 0;
  for (const it of aRelancar) {
    const o = it.original;
    const base = { ofm_code_original: Number(o.ofmCode), data_lancamento: it.dataLanc, data_efetiva: it.dataAlvo, observacao: o.ofmDescription || '', evidencia: it.evidencia, origem: it.excluida ? 'relancado_excluida_obs_data' : 'relancado_recusa_indevida', ...(it.excluida ? { excluida_motivo: it.motivoExclusao || null } : {}) };
    try {
      const novo = await relancar(token, o, it.dataAlvo);
      it.novo = novo;
      log(`OK  ofm ${o.ofmCode} → novo ${novo} em ${it.dataAlvo} (${String(o.staName).trim()} / ${String(o.oexName).trim()} R$${o.ofmValue})`);
      await auditar(cad, o, it.dataAlvo, { ...base, ofm_code_aprovado: novo }, true);
    } catch (error) {
      erros += 1;
      log(`ERRO ofm ${o.ofmCode}: ${error.message}`);
      await auditar(cad, o, it.dataAlvo, base, false, error.message);
    }
    await sleep(300);
  }
  log('Concluído', { criados: aRelancar.filter((i) => i.novo).length, erros });
  if (erros) process.exitCode = 1;
}

main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
