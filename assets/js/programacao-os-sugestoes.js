import { supabase } from './supabaseClient.js';

const KM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const BR = new Intl.NumberFormat('pt-BR');
const CACHE_TTL_MS = 1000 * 60 * 8;

const cache = {
  os: new Map(),
  pontos: new Map(),
  colabs: new Map(),
  snapshots: new Map(),
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

  return {
    nome,
    contrato: contratoLabel(merged),
    cargoRank: cargoRank(merged),
    distanciaKm,
    auditScore: auditField?.value ?? (Number.isFinite(fallbackAudit) ? fallbackAudit : null),
    auditLabel: auditField?.label ?? (Number.isFinite(fallbackAudit) ? `${BR.format(fallbackAudit)} hist.` : 's/dados'),
  };
}

function sortCandidates(a, b) {
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

async function loadContext(supervisao) {
  const [pontos, colabs, snapshot, auditorias] = await Promise.all([
    loadPontos(supervisao),
    loadColabs(supervisao),
    loadSnapshot(supervisao),
    loadAuditorias(),
  ]);
  return { pontos, colabs, snapshot, snapshotIndex: buildSnapshotIndex(snapshot), auditorias };
}

function injectStyles() {
  if (document.getElementById('programacaoOsSugestoesSafeStyles')) return;
  const style = document.createElement('style');
  style.id = 'programacaoOsSugestoesSafeStyles';
  style.textContent = `
    .os-lite-indic .os-sug-safe{margin-top:5px;border-radius:9px;padding:5px 7px;background:rgba(15,23,42,.34);border:1px solid rgba(148,163,184,.14);line-height:1.25}
    .os-lite-indic .os-sug-safe span{display:block;font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;font-weight:950;color:#94a3b8;margin-bottom:1px}
    .os-lite-indic .os-sug-safe strong{display:block;font-size:11.5px;color:#f8fafc;font-weight:950;overflow-wrap:anywhere}
    .os-lite-indic .os-sug-safe em{display:block;font-style:normal;font-size:10.5px;color:#9ca3af;margin-top:1px;overflow-wrap:anywhere}
    .os-lite-indic .os-sug-safe.suggestion{background:rgba(22,101,52,.16);border-color:rgba(134,239,172,.24)}
    .os-lite-indic .os-sug-safe.suggestion span{color:#bbf7d0}
    .os-lite-indic .os-sug-safe.suggestion em{color:#a7f3d0}
    .os-lite-indic .os-sug-safe.empty strong{color:#fbbf24}
  `;
  document.head.appendChild(style);
}

function ensureBlocks(card) {
  if (card.dataset.osSugSafeBound === '1') return;
  const indic = card.querySelector('.os-lite-indic');
  if (!indic) return;
  card.dataset.osSugSafeBound = '1';

  const atual = document.createElement('div');
  atual.className = 'os-sug-safe current';
  atual.innerHTML = '<span>Indicação atual</span><strong>Carregando contrato...</strong>';

  const sugestao = document.createElement('div');
  sugestao.className = 'os-sug-safe suggestion';
  sugestao.innerHTML = '<span>Sugestão</span><strong>Calculando...</strong>';

  indic.appendChild(atual);
  indic.appendChild(sugestao);
}

function renderCurrent(card, context) {
  const box = card.querySelector('.os-sug-safe.current');
  if (!box) return;
  const nome = String(card.querySelector('.os-lite-gac-input')?.value || '').trim();
  if (!nome) {
    box.classList.add('empty');
    box.innerHTML = '<span>Indicação atual</span><strong>Sem indicação gravada</strong>';
    return;
  }
  const colab = findColabByName(nome, context);
  box.classList.remove('empty');
  box.innerHTML = `<span>Indicação atual</span><strong>${escapeHtml(nome)} · ${escapeHtml(contratoLabel(colab || {}))}</strong>`;
}

function renderSuggestion(card, os, context) {
  const box = card.querySelector('.os-sug-safe.suggestion');
  if (!box) return;
  const sug = buildSuggestion(os, context);
  if (!sug) {
    box.innerHTML = '<span>Sugestão</span><strong>Sem sugestão calculada</strong><em>Verifique coordenadas do ponto/colaborador.</em>';
    return;
  }
  const km = Number.isFinite(sug.distanciaKm) ? `${KM.format(sug.distanciaKm)} km` : 'km s/dados';
  box.innerHTML = `<span>Sugestão</span><strong>${escapeHtml(sug.nome)} · ${escapeHtml(sug.contrato)}</strong><em>${escapeHtml(km)} · Aud.: ${escapeHtml(sug.auditLabel)}</em>`;
}

async function refreshCards() {
  const seq = ++runSeq;
  injectStyles();

  const cards = [...document.querySelectorAll('#progDistribuicaoOsMount .os-lite-card[data-os-id]')];
  if (!cards.length) return;
  cards.forEach(ensureBlocks);

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
    const current = card.querySelector('.os-sug-safe.current');
    const suggestion = card.querySelector('.os-sug-safe.suggestion');
    if (!os || !context) {
      if (current) current.innerHTML = '<span>Indicação atual</span><strong>Contrato não carregado</strong>';
      if (suggestion) suggestion.innerHTML = '<span>Sugestão</span><strong>Não carregada</strong>';
      return;
    }
    renderCurrent(card, context);
    renderSuggestion(card, os, context);
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
