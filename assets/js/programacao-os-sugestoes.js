import { supabase } from './supabaseClient.js';

const KM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const BR = new Intl.NumberFormat('pt-BR');
const BRL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CACHE_TTL_MS = 1000 * 60 * 8;

const cache = {
  os: new Map(),
  pontos: new Map(),
  colabs: new Map(),
  snapshots: new Map(),
  cruzamento: new Map(),
  auditorias: null,
};

let observerStarted = false;
let refreshTimer = null;
let runSeq = 0;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const clean = String(value ?? '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasGeo(lat, lng) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

function haversineKm(aLat, aLng, bLat, bLng) {
  const lat1 = Number(aLat), lon1 = Number(aLng), lat2 = Number(bLat), lon2 = Number(bLng);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const radius = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(s1 + s2), Math.sqrt(1 - s1 - s2));
}

function readCache(map, key) {
  const item = map.get(key);
  if (!item || Date.now() - item.ts > CACHE_TTL_MS) return null;
  return item.data;
}

function writeCache(map, key, data) {
  map.set(key, { ts: Date.now(), data });
  return data;
}

function cargoRank(row) {
  const text = normalize(`${row?.cargo || ''} ${row?.tipo || ''} ${row?.tipo_funcionario || ''} ${row?.vinculo || ''} ${row?.contrato || ''} ${row?.tipo_contrato || ''} ${row?.situacao_contrato || ''}`);
  if (text.includes('EFETIVO') || text.includes('CLT')) return 0;
  if (text.includes('INTERMITENTE')) return 1;
  if (text.includes('DIARISTA') || text.includes('DIARIA')) return 2;
  return 3;
}

function contratoLabel(row) {
  const rank = cargoRank(row || {});
  if (rank === 0) return 'Efetivo';
  if (rank === 1) return 'Intermitente';
  if (rank === 2) return 'Diarista';
  return 'Contrato não informado';
}

function splitUfCidadeLocal(text) {
  const raw = String(text || '').trim();
  const match = raw.match(/^([A-Z]{2})\s*-\s*([^()]+?)(?:\s*\(([^)]+)\))?\s*$/i);
  if (!match) return { uf: '', cidade: raw, local: '' };
  return { uf: match[1].toUpperCase(), cidade: match[2].trim(), local: (match[3] || '').trim() };
}

function bestPontoForOs(row, pontos) {
  const parsed = splitUfCidadeLocal(row?.embarque || row?.local_embarque || '');
  const uf = normalize(parsed.uf);
  const cidade = normalize(parsed.cidade);
  const local = normalize(parsed.local);
  const cliente = normalize(row?.cliente);
  const supervisao = normalize(row?.supervisao);

  const candidatos = (pontos || []).map((ponto) => {
    let score = 0;
    const pUf = normalize(ponto.uf);
    const pCidade = normalize(ponto.cidade);
    const pNome = normalize(ponto.nome_local || ponto.tipo_local || '');
    const pSup = normalize(ponto.supervisao || ponto.coordenacao || '');
    if (uf && pUf === uf) score += 50;
    if (cidade && (pCidade === cidade || pCidade.includes(cidade) || cidade.includes(pCidade))) score += 80;
    if (local && (pNome.includes(local) || local.includes(pNome))) score += 120;
    if (cliente && (pNome.includes(cliente) || cliente.includes(pNome))) score += 30;
    if (supervisao && pSup && (pSup.includes(supervisao) || supervisao.includes(pSup))) score += 15;
    return { ponto, score };
  }).filter((item) => item.score >= 120 && hasGeo(item.ponto.latitude, item.ponto.longitude));

  candidatos.sort((a, b) => b.score - a.score);
  return candidatos[0]?.ponto || null;
}

function buildSnapshotIndex(rows) {
  const byCpf = new Map();
  const byName = new Map();
  (rows || []).forEach((row) => {
    const cpf = onlyDigits(row.cpf || row.documento || row.colaborador_cpf);
    const nome = normalize(row.nome || row.colaborador || row.nome_colaborador);
    if (cpf && !byCpf.has(cpf)) byCpf.set(cpf, row);
    if (nome && !byName.has(nome)) byName.set(nome, row);
  });
  return { byCpf, byName };
}

function mergeColab(base, snapshotIndex) {
  const cpf = onlyDigits(base?.cpf || base?.documento || base?.colaborador_cpf);
  const nomeKey = normalize(base?.nome || base?.colaborador || base?.nome_colaborador);
  const snap = (cpf && snapshotIndex.byCpf.get(cpf)) || snapshotIndex.byName.get(nomeKey) || null;
  return { ...(snap || {}), ...(base || {}) };
}

function findColabByName(nome, context) {
  const wanted = normalize(nome);
  if (!wanted) return null;
  return (context.colabs || []).map((base) => mergeColab(base, context.snapshotIndex)).find((row) => {
    const rowName = normalize(row.nome || row.colaborador || row.nome_colaborador);
    return rowName && (rowName === wanted || rowName.includes(wanted) || wanted.includes(rowName));
  }) || null;
}

function auditScoreFromRows(...rows) {
  const fields = ['taxa_auditoria', 'auditoria_taxa', 'indice_auditoria', 'percentual_auditoria', 'taxa_recusa', 'taxa_reprovacao', 'qtd_auditorias', 'auditorias'];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    for (const field of fields) {
      const parsed = toNumber(row[field]);
      if (parsed !== null) return { value: parsed, label: field.includes('taxa') || field.includes('percentual') || field.includes('indice') ? `${parsed}%` : BR.format(parsed) };
    }
  }
  return null;
}

function candidateFromBase(base, ponto, context) {
  const merged = mergeColab(base, context.snapshotIndex);
  const nome = merged.nome || base.nome || merged.colaborador || base.colaborador || 'Colaborador';
  const auditField = auditScoreFromRows(base, merged);
  const fallbackAudit = context.auditorias.get(normalize(nome));
  const distanciaKm = ponto && hasGeo(base.latitude, base.longitude)
    ? haversineKm(ponto.latitude, ponto.longitude, base.latitude, base.longitude)
    : null;

  const cpfNorm = onlyDigits(merged.cpf || merged.documento || merged.colaborador_cpf || base.cpf || '');
  const cruzEntry = cpfNorm ? context.cruzamentoIndex?.get(cpfNorm) : null;
  const mergedComCruz = cruzEntry ? { ...merged, tipo_contrato: cruzEntry.tipo_contrato } : merged;
  const rank = cargoRank(mergedComCruz);
  const isEfetivo = rank === 0;
  const salario = Number(cruzEntry?.salario) || 0;
  // Efetivo: salário é custo fixo do mês, não varia com o embarque — custo marginal = só combustível
  // Intermitente/Diarista: recebem por dia embarcado → custo = salário + combustível
  const custoTotal = distanciaKm != null
    ? (isEfetivo ? 0 : salario) + (distanciaKm * 2 / 10) * 7.0
    : null;

  return {
    nome,
    contrato: contratoLabel(mergedComCruz),
    cargoRank: rank,
    distanciaKm,
    custoTotal,
    auditScore: auditField?.value ?? (Number.isFinite(fallbackAudit) ? fallbackAudit : null),
    auditLabel: auditField?.label ?? (Number.isFinite(fallbackAudit) ? `${BR.format(fallbackAudit)} hist.` : 's/dados'),
  };
}

function sortCandidates(a, b) {
  // Primário: menor custo total (efetivo só paga combustível; intermitente/diarista paga salário + combustível)
  const aHasCusto = Number.isFinite(a.custoTotal);
  const bHasCusto = Number.isFinite(b.custoTotal);
  if (aHasCusto && bHasCusto && a.custoTotal !== b.custoTotal) return a.custoTotal - b.custoTotal;
  if (aHasCusto && !bHasCusto) return -1;
  if (!aHasCusto && bHasCusto) return 1;

  // Fallback sem dados de custo: tipo de contrato, depois distância
  if (a.cargoRank !== b.cargoRank) return a.cargoRank - b.cargoRank;
  const aHasKm = Number.isFinite(a.distanciaKm);
  const bHasKm = Number.isFinite(b.distanciaKm);
  if (aHasKm && bHasKm && a.distanciaKm !== b.distanciaKm) return a.distanciaKm - b.distanciaKm;
  if (aHasKm && !bHasKm) return -1;
  if (!aHasKm && bHasKm) return 1;

  const aAudit = Number.isFinite(a.auditScore) ? a.auditScore : Number.MAX_SAFE_INTEGER;
  const bAudit = Number.isFinite(b.auditScore) ? b.auditScore : Number.MAX_SAFE_INTEGER;
  if (aAudit !== bAudit) return aAudit - bAudit;

  return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
}

function buildSuggestion(os, context) {
  const ponto = bestPontoForOs(os, context.pontos);
  const candidatos = (context.colabs || [])
    .filter((base) => base?.ativo !== false)
    .map((base) => candidateFromBase(base, ponto, context))
    .filter((item) => item.nome);

  candidatos.sort(sortCandidates);
  return candidatos[0] || null;
}

async function loadOsRows(ids) {
  const missing = ids.filter((id) => id && !cache.os.has(String(id)));
  if (missing.length) {
    const { data, error } = await supabase
      .from('operacional_os')
      .select('id,numero_os,supervisao,embarque,cliente,status_gestor')
      .in('id', missing);
    if (error) throw error;
    (data || []).forEach((row) => cache.os.set(String(row.id), row));
  }
  return ids.map((id) => cache.os.get(String(id))).filter(Boolean);
}

async function fetchDeduped(table, supervisao, limit = 2500) {
  const base = () => supabase.from(table).select('*').limit(limit);
  const queries = supervisao
    ? [base().eq('supervisao', supervisao), base().eq('coordenacao', supervisao)]
    : [base()];
  const results = await Promise.all(queries);
  const erro = results.find((res) => res.error);
  if (erro) throw erro.error;
  const merged = new Map();
  results.forEach((res) => (res.data || []).forEach((row) => merged.set(String(row.id || row.cpf || row.nome || Math.random()), row)));
  return [...merged.values()];
}

async function loadPontos(supervisao) {
  const key = normalize(supervisao || 'GERAL');
  const cached = readCache(cache.pontos, key);
  if (cached) return cached;
  try {
    const rows = await fetchDeduped('operacional_pontos_embarque', supervisao, 4000);
    return writeCache(cache.pontos, key, rows.filter((row) => row?.ativo !== false && hasGeo(row.latitude, row.longitude)));
  } catch (error) {
    console.warn('[OS sugestão] pontos indisponíveis:', error);
    return writeCache(cache.pontos, key, []);
  }
}

async function loadColabs(supervisao) {
  const key = normalize(supervisao || 'GERAL');
  const cached = readCache(cache.colabs, key);
  if (cached) return cached;
  try {
    const rows = await fetchDeduped('operacional_colaborador_base', supervisao, 3000);
    return writeCache(cache.colabs, key, rows.filter((row) => row?.ativo !== false));
  } catch (error) {
    console.warn('[OS sugestão] colaboradores indisponíveis:', error);
    return writeCache(cache.colabs, key, []);
  }
}

async function loadSnapshot(supervisao) {
  const key = normalize(supervisao || 'GERAL');
  const cached = readCache(cache.snapshots, key);
  if (cached) return cached;
  try {
    const latest = await supabase
      .from('colaborador_snapshot')
      .select('data_referencia')
      .order('data_referencia', { ascending: false })
      .limit(1);
    if (latest.error) throw latest.error;
    const dataReferencia = latest.data?.[0]?.data_referencia;
    if (!dataReferencia) return writeCache(cache.snapshots, key, []);

    const { data, error } = await supabase
      .from('colaborador_snapshot')
      .select('*')
      .eq('data_referencia', dataReferencia)
      .eq('supervisao', supervisao)
      .limit(3000);
    if (error) throw error;
    return writeCache(cache.snapshots, key, data || []);
  } catch (error) {
    console.warn('[OS sugestão] snapshot indisponível:', error);
    return writeCache(cache.snapshots, key, []);
  }
}

async function loadAuditorias() {
  if (cache.auditorias && Date.now() - cache.auditorias.ts < CACHE_TTL_MS) return cache.auditorias.data;
  try {
    const { data, error } = await supabase
      .from('operacional_auditoria_colaborador')
      .select('*')
      .order('data_evento', { ascending: false, nullsFirst: false })
      .limit(5000);
    if (error) throw error;
    const map = new Map();
    (data || []).forEach((row) => {
      const key = normalize(row.nome_colaborador || row.classificador || row.colaborador || row.nome || '');
      if (!key) return;
      map.set(key, (map.get(key) || 0) + 1);
    });
    cache.auditorias = { ts: Date.now(), data: map };
    return map;
  } catch (error) {
    console.warn('[OS sugestão] auditoria indisponível:', error);
    const map = new Map();
    cache.auditorias = { ts: Date.now(), data: map };
    return map;
  }
}

async function loadCruzamento(supervisao) {
  const key = normalize(supervisao || 'GERAL');
  const cached = readCache(cache.cruzamento, key);
  if (cached) return cached;
  try {
    const { data, error } = await supabase
      .from('colaborador_cruzamento')
      .select('cpf,tipo_contrato,salario')
      .eq('supervisao', supervisao)
      .neq('cpf', '')
      .limit(3000);
    if (error) throw error;
    const index = new Map();
    (data || []).forEach((row) => {
      if (row.cpf && !index.has(row.cpf)) index.set(row.cpf, row);
    });
    return writeCache(cache.cruzamento, key, index);
  } catch (error) {
    console.warn('[OS sugestão] cruzamento indisponível:', error);
    return writeCache(cache.cruzamento, key, new Map());
  }
}

async function loadContext(supervisao) {
  const [pontos, colabs, snapshot, cruzamentoIndex, auditorias] = await Promise.all([
    loadPontos(supervisao),
    loadColabs(supervisao),
    loadSnapshot(supervisao),
    loadCruzamento(supervisao),
    loadAuditorias(),
  ]);
  return { pontos, colabs, snapshot, snapshotIndex: buildSnapshotIndex(snapshot), cruzamentoIndex, auditorias };
}

function injectStyles() {
  if (document.getElementById('programacaoOsSugestoesCompactStyles')) return;
  const style = document.createElement('style');
  style.id = 'programacaoOsSugestoesCompactStyles';
  style.textContent = `
    .os-lite-gac-input.os-sug-default{border-color:rgba(134,239,172,.42)!important;background:rgba(22,101,52,.18)!important;color:#f8fafc!important}
    .os-lite-indic .os-sug-compact{margin-top:4px;font-size:10.7px;line-height:1.25;color:#9ca3af;overflow-wrap:anywhere}
    .os-lite-indic .os-sug-compact b{color:#bbf7d0;font-weight:950}
    .os-lite-indic .os-sug-compact.warn{color:#fbbf24}
  `;
  document.head.appendChild(style);
}

function ensureMeta(indic) {
  let meta = indic.querySelector('.os-sug-compact');
  if (!meta) {
    meta = document.createElement('div');
    meta.className = 'os-sug-compact';
    indic.appendChild(meta);
  }
  return meta;
}

function clearOldBlocks(indic) {
  indic.querySelectorAll('.os-sug-safe').forEach((el) => el.remove());
}

function applyDisplay(card, os, context) {
  const indic = card.querySelector('.os-lite-indic');
  const input = indic?.querySelector('.os-lite-gac-input');
  if (!indic || !input) return;

  clearOldBlocks(indic);
  const meta = ensureMeta(indic);
  const rawValue = String(input.value || '').trim();
  const hadSavedValue = rawValue && input.dataset.osSugDefault !== '1';
  const sug = buildSuggestion(os, context);

  input.classList.remove('os-sug-default');
  input.dataset.osSugDefault = '';

  if (hadSavedValue) {
    const colab = findColabByName(rawValue, context);
    const contrato = contratoLabel(colab || {});
    meta.classList.remove('warn');
    meta.innerHTML = `<b>${escapeHtml(contrato)}</b>${sug ? ` · Sug.: ${escapeHtml(sug.nome)} · ${escapeHtml(sug.contrato)}` : ''}`;
    return;
  }

  if (sug) {
    input.value = sug.nome;
    input.dataset.osSugDefault = '1';
    input.classList.add('os-sug-default');
    const km = Number.isFinite(sug.distanciaKm) ? `${KM.format(sug.distanciaKm)} km` : 'km s/dados';
    const custo = Number.isFinite(sug.custoTotal) ? ` · R$ ${BRL.format(sug.custoTotal)}` : '';
    meta.classList.remove('warn');
    meta.innerHTML = `<b>Sugestão</b> · ${escapeHtml(sug.contrato)} · ${escapeHtml(km)}${escapeHtml(custo)} · Aud.: ${escapeHtml(sug.auditLabel)}`;
    return;
  }

  input.value = '';
  meta.classList.add('warn');
  meta.textContent = 'Sem indicação e sem sugestão calculada.';
}

async function refreshCards() {
  const seq = ++runSeq;
  injectStyles();

  const cards = [...document.querySelectorAll('#progDistribuicaoOsMount .os-lite-card[data-os-id]')];
  if (!cards.length) return;

  const ids = cards.map((card) => card.dataset.osId).filter(Boolean);
  let rows = [];
  try {
    rows = await loadOsRows(ids);
  } catch (error) {
    console.warn('[OS sugestão] não foi possível carregar OS:', error);
    return;
  }
  if (seq !== runSeq) return;

  const rowById = new Map(rows.map((row) => [String(row.id), row]));
  const supervisoes = [...new Set(rows.map((row) => String(row.supervisao || '').trim()).filter(Boolean))];
  const contexts = new Map();

  await Promise.all(supervisoes.map(async (supervisao) => {
    contexts.set(supervisao, await loadContext(supervisao));
  }));
  if (seq !== runSeq) return;

  cards.forEach((card) => {
    const os = rowById.get(String(card.dataset.osId));
    const context = os ? contexts.get(String(os.supervisao || '').trim()) : null;
    if (!os || !context) return;
    applyDisplay(card, os, context);
  });
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refreshCards, 180);
}

function startObserver() {
  if (observerStarted) return;
  observerStarted = true;
  const observer = new MutationObserver(scheduleRefresh);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', scheduleRefresh);
  scheduleRefresh();
}

window.__programacaoOsSugestoesRefresh = scheduleRefresh;
startObserver();
