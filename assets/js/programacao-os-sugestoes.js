import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

const BR = new Intl.NumberFormat('pt-BR');
const KM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const CACHE_TTL_MS = 1000 * 60 * 8;
const PAGE_LIMIT = 2500;

const cache = {
  os: new Map(),
  pontos: new Map(),
  colabs: new Map(),
  snapshots: new Map(),
  auditorias: null,
};

let currentUserPromise = null;
let observerStarted = false;
let enhancementToken = 0;

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

function readCached(map, key) {
  const item = map.get(key);
  if (!item || Date.now() - item.ts > CACHE_TTL_MS) return null;
  return item.data;
}

function writeCached(map, key, data) {
  map.set(key, { ts: Date.now(), data });
  return data;
}

function colabKey(colab) {
  return onlyDigits(colab?.colaborador_id || colab?.cpf || colab?.id || '') || String(colab?.id || colab?.nome || '').trim();
}

function cargoRank(row) {
  const text = normalize(`${row?.cargo || ''} ${row?.tipo || ''} ${row?.tipo_funcionario || ''} ${row?.vinculo || ''} ${row?.contrato || ''} ${row?.tipo_contrato || ''}`);
  if (text.includes('EFETIVO') || text.includes('CLT')) return 0;
  if (text.includes('INTERMITENTE')) return 1;
  if (text.includes('DIARISTA') || text.includes('DIARIA')) return 2;
  return 3;
}

function contratoLabel(row) {
  const rank = cargoRank(row);
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

  const candidates = (pontos || []).map((ponto) => {
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

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.ponto || null;
}

async function fetchDeduped(table, select, supervisao, keyGetter, limit = PAGE_LIMIT) {
  const base = () => supabase.from(table).select(select).limit(limit);
  const queries = supervisao
    ? [base().eq('supervisao', supervisao), base().eq('coordenacao', supervisao)]
    : [base()];
  const results = await Promise.all(queries);
  const erro = results.find((res) => res.error);
  if (erro) throw erro.error;
  const merged = new Map();
  results.forEach((res) => (res.data || []).forEach((row) => {
    const key = keyGetter(row);
    if (key && !merged.has(key)) merged.set(key, row);
  }));
  return [...merged.values()];
}

async function loadPontos(supervisao) {
  const key = normalize(supervisao || 'GERAL');
  const cached = readCached(cache.pontos, key);
  if (cached) return cached;
  try {
    const rows = await fetchDeduped('operacional_pontos_embarque', '*', supervisao, (row) => row.id, 4000);
    return writeCached(cache.pontos, key, rows.filter((row) => row?.ativo !== false && hasGeo(row.latitude, row.longitude)));
  } catch (error) {
    console.warn('[Sugestão OS] Falha ao carregar pontos de embarque:', error);
    return writeCached(cache.pontos, key, []);
  }
}

async function loadColabsBase(supervisao) {
  const key = normalize(supervisao || 'GERAL');
  const cached = readCached(cache.colabs, key);
  if (cached) return cached;
  try {
    const rows = await fetchDeduped('operacional_colaborador_base', '*', supervisao, (row) => row.id || colabKey(row) || normalize(row.nome), PAGE_LIMIT);
    return writeCached(cache.colabs, key, rows.filter((row) => row?.ativo !== false));
  } catch (error) {
    console.warn('[Sugestão OS] Falha ao carregar colaboradores operacionais:', error);
    return writeCached(cache.colabs, key, []);
  }
}

async function loadSnapshot(supervisao) {
  const key = normalize(supervisao || 'GERAL');
  const cached = readCached(cache.snapshots, key);
  if (cached) return cached;
  try {
    const latest = await supabase
      .from('colaborador_snapshot')
      .select('data_referencia')
      .order('data_referencia', { ascending: false })
      .limit(1);
    if (latest.error) throw latest.error;
    const dataReferencia = latest.data?.[0]?.data_referencia;
    if (!dataReferencia) return writeCached(cache.snapshots, key, []);

    const { data, error } = await supabase
      .from('colaborador_snapshot')
      .select('*')
      .eq('data_referencia', dataReferencia)
      .eq('supervisao', supervisao)
      .limit(PAGE_LIMIT);
    if (error) throw error;
    return writeCached(cache.snapshots, key, data || []);
  } catch (error) {
    console.warn('[Sugestão OS] Falha ao carregar snapshot de colaboradores:', error);
    return writeCached(cache.snapshots, key, []);
  }
}

async function loadAuditoriaIndex() {
  if (cache.auditorias && Date.now() - cache.auditorias.ts < CACHE_TTL_MS) return cache.auditorias.data;
  try {
    const { data, error } = await supabase
      .from('operacional_auditoria_colaborador')
      .select('*')
      .order('data_evento', { ascending: false, nullsFirst: false })
      .limit(5000);
    if (error) throw error;
    const byName = new Map();
    (data || []).forEach((row) => {
      const key = normalize(row.nome_colaborador || row.classificador || row.colaborador || row.nome || '');
      if (!key) return;
      byName.set(key, (byName.get(key) || 0) + 1);
    });
    cache.auditorias = { ts: Date.now(), data: byName };
    return byName;
  } catch (error) {
    console.warn('[Sugestão OS] Histórico de auditoria não disponível para cálculo:', error);
    const empty = new Map();
    cache.auditorias = { ts: Date.now(), data: empty };
    return empty;
  }
}

function auditScoreFromRows(...rows) {
  const fields = [
    'taxa_auditoria',
    'auditoria_taxa',
    'indice_auditoria',
    'percentual_auditoria',
    'taxa_recusa',
    'taxa_reprovacao',
    'qtd_auditorias',
    'auditorias',
  ];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    for (const field of fields) {
      const parsed = toNumber(row[field]);
      if (parsed !== null) return { value: parsed, label: field.includes('taxa') || field.includes('percentual') || field.includes('indice') ? `${parsed}%` : BR.format(parsed) };
    }
  }
  return null;
}

function buildSnapshotIndexes(snapshot) {
  const byCpf = new Map();
  const byName = new Map();
  (snapshot || []).forEach((row) => {
    const cpf = onlyDigits(row.cpf || row.documento || row.colaborador_cpf);
    const nome = normalize(row.nome || row.colaborador || row.nome_colaborador);
    if (cpf && !byCpf.has(cpf)) byCpf.set(cpf, row);
    if (nome && !byName.has(nome)) byName.set(nome, row);
  });
  return { byCpf, byName };
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

async function loadOsRows(osIds) {
  const missing = osIds.filter((id) => id && !cache.os.has(String(id)));
  if (missing.length) {
    const { data, error } = await supabase
      .from('operacional_os')
      .select('id,numero_os,supervisao,embarque,cliente,status_gestor')
      .in('id', missing);
    if (error) throw error;
    (data || []).forEach((row) => cache.os.set(String(row.id), row));
  }
  return osIds.map((id) => cache.os.get(String(id))).filter(Boolean);
}

async function buildContextForSupervisao(supervisao) {
  const [pontos, colabsBase, snapshot, auditorias] = await Promise.all([
    loadPontos(supervisao),
    loadColabsBase(supervisao),
    loadSnapshot(supervisao),
    loadAuditoriaIndex(),
  ]);
  return { pontos, colabsBase, snapshot, auditorias, snapshotIndex: buildSnapshotIndexes(snapshot) };
}

function mergeColabWithSnapshot(base, context) {
  const cpf = onlyDigits(base?.cpf || base?.documento || base?.colaborador_cpf);
  const nomeKey = normalize(base?.nome || base?.colaborador || base?.nome_colaborador);
  const snap = (cpf && context.snapshotIndex.byCpf.get(cpf)) || context.snapshotIndex.byName.get(nomeKey) || null;
  return { ...(snap || {}), ...(base || {}) };
}

function findColabByName(nome, context) {
  const key = normalize(nome);
  if (!key) return null;
  return (context.colabsBase || []).map((base) => mergeColabWithSnapshot(base, context)).find((row) => {
    const rowName = normalize(row.nome || row.colaborador || row.nome_colaborador);
    return rowName && (rowName === key || rowName.includes(key) || key.includes(rowName));
  }) || null;
}

function currentIndicacaoHtml(card, context) {
  const input = card.querySelector('.os-lite-gac-input');
  const nome = String(input?.value || '').trim();
  if (!nome) {
    return '<div class="os-current-card empty"><span>Indicação atual</span><b>Sem indicação gravada</b></div>';
  }
  const colab = findColabByName(nome, context);
  const contrato = contratoLabel(colab || {});
  return `<div class="os-current-card"><span>Indicação atual</span><b>${escapeHtml(nome)} · ${escapeHtml(contrato)}</b></div>`;
}

function candidateFromBase(base, ponto, context) {
  const merged = mergeColabWithSnapshot(base, context);
  const auditField = auditScoreFromRows(base, merged);
  const fallbackAudit = context.auditorias.get(normalize(merged.nome || base.nome || ''));
  const distanciaKm = ponto && hasGeo(base.latitude, base.longitude)
    ? haversineKm(ponto.latitude, ponto.longitude, base.latitude, base.longitude)
    : null;

  return {
    key: colabKey(merged),
    nome: merged.nome || base.nome || 'Colaborador',
    contrato: contratoLabel(merged),
    cargoRank: cargoRank(merged),
    distanciaKm,
    auditScore: auditField?.value ?? (Number.isFinite(fallbackAudit) ? fallbackAudit : null),
    auditLabel: auditField?.label ?? (Number.isFinite(fallbackAudit) ? `${BR.format(fallbackAudit)} hist.` : 's/dados'),
  };
}

function buildSuggestionForOs(os, context) {
  const ponto = bestPontoForOs(os, context.pontos);
  const candidatos = (context.colabsBase || [])
    .map((base) => candidateFromBase(base, ponto, context))
    .filter((item) => item.key && item.nome);

  candidatos.sort(sortCandidates);
  return candidatos[0] || null;
}

function suggestionHtml(sug) {
  if (!sug) {
    return '<div class="os-sug-meta">Sem sugestão calculada. Verifique coordenadas do ponto e do colaborador.</div>';
  }
  const km = Number.isFinite(sug.distanciaKm) ? `${KM.format(sug.distanciaKm)} km` : 'km s/dados';
  return `
    <div class="os-sug-name">${escapeHtml(sug.nome)} · ${escapeHtml(sug.contrato)}</div>
    <div class="os-sug-meta">${escapeHtml(km)} · Aud.: ${escapeHtml(sug.auditLabel)}</div>
    <button type="button" class="os-sug-apply" data-sug-key="${escapeHtml(sug.key)}" data-sug-name="${escapeHtml(sug.nome)}" data-sug-km="${Number.isFinite(sug.distanciaKm) ? String(sug.distanciaKm) : ''}">Aplicar sugestão</button>
  `;
}

function injectStyles() {
  if (document.getElementById('programacaoOsSugestoesStyles')) return;
  const style = document.createElement('style');
  style.id = 'programacaoOsSugestoesStyles';
  style.textContent = `
    .os-current-card{margin-top:7px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.42);border-radius:10px;padding:7px 9px;display:flex;flex-direction:column;gap:2px}
    .os-current-card span{font-size:10px;text-transform:uppercase;letter-spacing:.06em;font-weight:950;color:#94a3b8}
    .os-current-card b{font-size:12.5px;line-height:1.25;color:#f8fafc}
    .os-current-card.empty b{color:#fbbf24}
    .os-sug-card{margin-top:7px;border:1px solid rgba(134,239,172,.26);background:rgba(22,101,52,.16);border-radius:10px;padding:8px 9px;display:flex;flex-direction:column;gap:4px}
    .os-sug-title{font-size:10px;text-transform:uppercase;letter-spacing:.06em;font-weight:950;color:#bbf7d0}
    .os-sug-name{font-size:13px;line-height:1.2;font-weight:950;color:#f8fafc}
    .os-sug-meta{font-size:11px;line-height:1.25;color:#a7f3d0}
    .os-sug-apply{align-self:flex-start;border:1px solid rgba(134,239,172,.36);background:rgba(20,83,45,.58);color:#dcfce7;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:900;cursor:pointer;margin-top:2px}
    .os-sug-apply:hover{background:rgba(22,101,52,.9)}
    .os-sug-apply:disabled{opacity:.6;cursor:wait}
  `;
  document.head.appendChild(style);
}

async function applySuggestion(card, osId, button) {
  const nome = button.dataset.sugName || '';
  const key = button.dataset.sugKey || '';
  const km = toNumber(button.dataset.sugKm);
  if (!osId || !nome || !key) return;

  button.disabled = true;
  button.textContent = 'Aplicando...';
  try {
    const user = await (currentUserPromise ||= getCurrentUser().catch(() => null));
    await supabase.from('operacional_os_colaboradores').delete().eq('os_id', osId);
    const { error } = await supabase.from('operacional_os_colaboradores').insert({
      os_id: osId,
      colaborador_key: key,
      colaborador_nome: nome,
      distancia_km: km,
      origem_sugestao: 'PRIORIDADE_GESTOR_CARGO_KM_AUDITORIA',
      indicado_por: user?.id || null,
    });
    if (error) throw error;

    const input = card.querySelector('.os-lite-gac-input');
    if (input) input.value = nome;
    button.textContent = 'Aplicado';
    document.getElementById('osLiteReload')?.click();
  } catch (error) {
    console.error('[Sugestão OS] Falha ao aplicar sugestão:', error);
    button.disabled = false;
    button.textContent = 'Aplicar sugestão';
    alert(error.message || 'Não foi possível aplicar a sugestão.');
  }
}

async function enhanceVisibleCards() {
  const token = ++enhancementToken;
  injectStyles();
  const cards = [...document.querySelectorAll('#progDistribuicaoOsMount .os-lite-card[data-os-id], #osLiteList .os-lite-card[data-os-id]')];
  const pendingCards = cards.filter((card) => !card.dataset.osSugestaoBound);
  if (!pendingCards.length) return;

  pendingCards.forEach((card) => {
    card.dataset.osSugestaoBound = '1';
    const indic = card.querySelector('.os-lite-indic');
    if (!indic) return;
    const currentBox = document.createElement('div');
    currentBox.className = 'os-current-card';
    currentBox.innerHTML = '<span>Indicação atual</span><b>Carregando contrato...</b>';
    const sugBox = document.createElement('div');
    sugBox.className = 'os-sug-card';
    sugBox.innerHTML = '<div class="os-sug-title">Sugestão</div><div class="os-sug-meta">Calculando prioridade...</div>';
    indic.appendChild(currentBox);
    indic.appendChild(sugBox);
  });

  try {
    const osIds = pendingCards.map((card) => card.dataset.osId).filter(Boolean);
    const rows = await loadOsRows(osIds);
    if (token !== enhancementToken) return;

    const contexts = new Map();
    await Promise.all([...new Set(rows.map((os) => String(os.supervisao || '').trim()).filter(Boolean))].map(async (supervisao) => {
      contexts.set(supervisao, await buildContextForSupervisao(supervisao));
    }));

    await Promise.all(rows.map(async (os) => {
      const card = document.querySelector(`#progDistribuicaoOsMount .os-lite-card[data-os-id="${CSS.escape(String(os.id))}"], #osLiteList .os-lite-card[data-os-id="${CSS.escape(String(os.id))}"]`);
      const currentBox = card?.querySelector('.os-current-card');
      const sugBox = card?.querySelector('.os-sug-card');
      if (!card || !sugBox) return;
      try {
        const context = contexts.get(String(os.supervisao || '').trim()) || await buildContextForSupervisao(os.supervisao);
        if (currentBox) currentBox.outerHTML = currentIndicacaoHtml(card, context);
        const sug = buildSuggestionForOs(os, context);
        sugBox.innerHTML = `<div class="os-sug-title">Sugestão</div>${suggestionHtml(sug)}`;
        sugBox.querySelector('.os-sug-apply')?.addEventListener('click', (event) => applySuggestion(card, os.id, event.currentTarget));
      } catch (error) {
        console.warn('[Sugestão OS] Falha ao calcular sugestão da OS:', os.numero_os, error);
        if (currentBox) currentBox.innerHTML = '<span>Indicação atual</span><b>Contrato não carregado</b>';
        sugBox.innerHTML = '<div class="os-sug-title">Sugestão</div><div class="os-sug-meta">Não foi possível calcular agora.</div>';
      }
    }));
  } catch (error) {
    console.warn('[Sugestão OS] Falha ao melhorar cards:', error);
  }
}

function startObserver() {
  if (observerStarted) return;
  observerStarted = true;
  const debounced = debounce(enhanceVisibleCards, 180);
  const observer = new MutationObserver(debounced);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', debounced);
  debounced();
}

startObserver();
