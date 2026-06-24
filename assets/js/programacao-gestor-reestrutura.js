import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

const BR = new Intl.NumberFormat('pt-BR');
const KM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const CACHE_TTL_MS = 1000 * 60 * 8;

const state = {
  activeStep: 'A',
  loaded: false,
  loading: false,
  user: null,
  cache: {
    pontos: new Map(),
    colabs: new Map(),
    snapshots: new Map(),
    auditorias: null,
  },
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function norm(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function num(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const clean = String(value ?? '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
}

function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function hasGeo(lat, lng) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

function haversineKm(aLat, aLng, bLat, bLng) {
  const lat1 = Number(aLat), lon1 = Number(aLng), lat2 = Number(bLat), lon2 = Number(bLng);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const r = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(s1 + s2), Math.sqrt(1 - s1 - s2));
}

function cacheGet(map, key) {
  const item = map.get(key);
  if (!item || Date.now() - item.ts > CACHE_TTL_MS) return null;
  return item.data;
}

function cacheSet(map, key, data) {
  map.set(key, { ts: Date.now(), data });
  return data;
}

function contratoRank(row) {
  const text = norm(`${row?.cargo || ''} ${row?.tipo || ''} ${row?.tipo_funcionario || ''} ${row?.vinculo || ''} ${row?.contrato || ''} ${row?.tipo_contrato || ''}`);
  if (text.includes('EFETIVO') || text.includes('CLT')) return 0;
  if (text.includes('INTERMITENTE')) return 1;
  if (text.includes('DIARISTA') || text.includes('DIARIA')) return 2;
  return 3;
}

function contratoLabel(row) {
  const rank = contratoRank(row || {});
  if (rank === 0) return 'Efetivo';
  if (rank === 1) return 'Intermitente';
  if (rank === 2) return 'Diarista';
  return 'Contrato não informado';
}

function colabKey(row) {
  return onlyDigits(row?.colaborador_id || row?.cpf || row?.id || '') || String(row?.id || row?.nome || '').trim();
}

function splitUfCidadeLocal(text) {
  const raw = String(text || '').trim();
  const match = raw.match(/^([A-Z]{2})\s*-\s*([^()]+?)(?:\s*\(([^)]+)\))?\s*$/i);
  if (!match) return { uf: '', cidade: raw, local: '' };
  return { uf: match[1].toUpperCase(), cidade: match[2].trim(), local: (match[3] || '').trim() };
}

function fmtSaldo(value) {
  return BR.format(num(value));
}

function setFeedback(text) {
  const fb = document.getElementById('progCtxFeedback');
  if (fb) {
    fb.className = 'feedback mt-16 prog-feedback-ok';
    fb.textContent = text;
  }
}

function selectedSupervisao() {
  return document.getElementById('progSup')?.value || '';
}

function selectedData() {
  return document.getElementById('progDataRef')?.value || '';
}

function injectStyles() {
  if (document.getElementById('progGestorReestruturaStyles')) return;
  const style = document.createElement('style');
  style.id = 'progGestorReestruturaStyles';
  style.textContent = `
    body.prog-step-a-os #progDistribuicaoOsMount .os-lite-indic{display:none!important}
    body.prog-step-a-os #progDistribuicaoOsMount .os-lite-card{grid-template-columns:minmax(130px,.9fr) minmax(360px,2fr) minmax(170px,.65fr)!important}
    body.prog-step-a-os #progDistribuicaoOsMount .os-lite-head .os-lite-meta{display:none!important}
    body.prog-step-a-os #progDistribuicaoOsMount .os-lite-client .os-lite-route:nth-of-type(1){font-weight:800;color:#94a3b8}
    body.prog-step-a-os #progDistribuicaoOsMount .os-lite-footer{min-width:170px}
    @media(max-width:900px){body.prog-step-a-os #progDistribuicaoOsMount .os-lite-card{display:block!important}}

    .prog-dist-shell{display:grid;grid-template-columns:minmax(380px,1.05fr) minmax(420px,.95fr);gap:14px;align-items:start}
    .prog-dist-panel{border:1px solid rgba(52,211,153,.18);border-radius:18px;background:rgba(2,6,23,.23);box-shadow:var(--shadow-soft);overflow:hidden}
    .prog-dist-head{padding:14px 16px;border-bottom:1px solid rgba(148,163,184,.12);display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
    .prog-dist-head h4{margin:0;color:#f8fafc;font-size:15px}.prog-dist-head p{margin:4px 0 0;color:#94a3b8;font-size:12px;line-height:1.35}
    .prog-dist-list{display:flex;flex-direction:column;gap:8px;padding:12px;max-height:calc(100vh - 310px);overflow:auto;min-height:360px}
    .prog-dist-os{border:1px solid rgba(52,211,153,.16);border-radius:14px;background:rgba(8,47,35,.34);padding:12px;display:grid;grid-template-columns:1fr;gap:9px}
    .prog-dist-os-title{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;color:#f8fafc;font-weight:950;font-size:13px}.prog-dist-os-title small{color:#bbf7d0;font-size:11px;white-space:nowrap}
    .prog-dist-meta{color:#94a3b8;font-size:11.5px;line-height:1.35}.prog-dist-meta b{color:#e5e7eb}
    .prog-dist-suggest{border-top:1px solid rgba(148,163,184,.12);padding-top:9px;display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end}
    .prog-dist-field label{display:block;color:#a7f3d0;text-transform:uppercase;font-size:9.5px;font-weight:950;letter-spacing:.06em;margin-bottom:3px}
    .prog-dist-field input{width:100%;box-sizing:border-box;border:1px solid rgba(134,239,172,.3);background:#1e293b;color:#f8fafc;border-radius:9px;padding:7px 9px;font-size:12.5px;font-weight:800;outline:none}
    .prog-dist-field input:focus{border-color:#86efac}.prog-dist-info{font-size:10.7px;color:#a7f3d0;margin-top:4px;line-height:1.3}.prog-dist-info.warn{color:#fbbf24}
    .prog-dist-btn{border:1px solid rgba(134,239,172,.35);background:rgba(22,163,74,.2);color:#dcfce7;border-radius:999px;padding:8px 11px;font-size:12px;font-weight:950;cursor:pointer;white-space:nowrap}
    .prog-dist-btn:hover{background:rgba(22,163,74,.34)}.prog-dist-btn.done{background:rgba(34,197,94,.75);color:#052e16}.prog-dist-btn:disabled{opacity:.65;cursor:not-allowed}
    .prog-dist-map{position:sticky;top:92px;min-height:520px}.prog-map-body{padding:12px}.prog-map-canvas{min-height:420px;border:1px solid rgba(148,163,184,.14);border-radius:16px;background:radial-gradient(circle at top right,rgba(34,197,94,.16),transparent 30%),rgba(2,6,23,.45);position:relative;overflow:hidden}
    .prog-map-canvas svg{width:100%;height:420px;display:block}.prog-map-label{font-size:10px;fill:#dcfce7;font-weight:800}.prog-map-point{filter:drop-shadow(0 0 8px rgba(34,197,94,.35))}.prog-map-card{position:absolute;left:12px;bottom:12px;right:12px;border:1px solid rgba(52,211,153,.16);background:rgba(2,6,23,.76);border-radius:12px;padding:10px;color:#94a3b8;font-size:11.5px;line-height:1.4}.prog-map-card b{color:#bbf7d0}
    .prog-dist-empty{border:1px dashed rgba(148,163,184,.22);border-radius:16px;padding:24px;text-align:center;color:#94a3b8;background:rgba(15,23,42,.2);line-height:1.45}
    .prog-impact-modal{position:fixed;inset:0;background:rgba(2,6,23,.72);display:flex;align-items:center;justify-content:center;z-index:99999;padding:16px}.prog-impact-box{width:min(520px,94vw);border:1px solid rgba(251,191,36,.35);background:#0f172a;border-radius:20px;padding:18px;box-shadow:0 22px 70px rgba(0,0,0,.5)}
    .prog-impact-box h3{margin:0 0 8px;color:#fde68a;font-size:17px}.prog-impact-box p{margin:0;color:#e5e7eb;line-height:1.45}.prog-impact-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}.prog-impact-actions button{border:1px solid rgba(148,163,184,.24);border-radius:999px;padding:9px 14px;font-weight:950;cursor:pointer}.prog-impact-ok{background:#22c55e;color:#052e16}.prog-impact-cancel{background:rgba(15,23,42,.8);color:#f8fafc}
    @media(max-width:1100px){.prog-dist-shell{grid-template-columns:1fr}.prog-dist-map{position:relative;top:auto}.prog-dist-list{max-height:none}}
  `;
  document.head.appendChild(style);
}

function applyStepBodyClass(step) {
  document.body.classList.toggle('prog-step-a-os', step === 'A');
  document.body.classList.toggle('prog-step-b-distribuicao', step === 'B');
}

function patchSteps() {
  const stepsWrap = document.getElementById('progSteps');
  if (!stepsWrap || stepsWrap.dataset.reestruturaOs === '1') return;

  const desired = [
    { ui: 'A', label: 'O.S.', internal: '__distribuicao' },
    { ui: 'B', label: 'Distribuição', internal: '__distribuicao_colaboradores' },
    { ui: 'C', label: 'Disponibilidade', internal: 'A' },
    { ui: 'D', label: 'Estadia', internal: 'B' },
    { ui: 'E', label: 'Alimentação', internal: 'C' },
    { ui: 'F', label: 'Deslocamento', internal: 'D' },
    { ui: 'G', label: 'Extras', internal: 'E' },
  ];

  const existing = [...stepsWrap.querySelectorAll('.stepbtn')];
  desired.forEach((step, index) => {
    let btn = existing[index];
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'stepbtn';
      stepsWrap.appendChild(btn);
    }
    btn.dataset.uiStep = step.ui;
    btn.dataset.step = step.internal;
    btn.innerHTML = `<span class="stepbtn-letter">${step.ui}</span><span class="stepbtn-label"> · ${step.label}</span>`;
  });
  existing.slice(desired.length).forEach((btn) => btn.remove());

  stepsWrap.dataset.reestruturaOs = '1';
  stepsWrap.addEventListener('click', (event) => {
    const btn = event.target.closest('.stepbtn');
    if (!btn) return;
    const step = btn.dataset.uiStep;
    state.activeStep = step;
    applyStepBodyClass(step);
    if (step === 'B') {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setActiveStep('B');
      renderDistribuicaoColaboradores({ force: true });
      return;
    }
    setActiveStep(step);
    if (step === 'A') setTimeout(compactarCardsOs, 250);
  }, true);

  applyStepBodyClass('A');
  setActiveStep('A');
}

function setActiveStep(step) {
  document.querySelectorAll('#progSteps .stepbtn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.uiStep === step);
  });
}

function compactarCardsOs() {
  if (state.activeStep !== 'A') return;
  document.querySelectorAll('#progDistribuicaoOsMount .os-lite-card').forEach((card) => {
    if (card.dataset.osCompactado === '1') return;
    card.dataset.osCompactado = '1';
    const route = card.querySelector('.os-lite-route');
    if (route && route.textContent.includes('→')) {
      route.textContent = route.textContent.replace(/Emb\.:\s*/i, 'Local de embarque: ').split('→')[0].trim();
    }
  });
}

async function fetchRows(table, supervisao, limit = 2500) {
  const base = () => supabase.from(table).select('*').limit(limit);
  const queries = supervisao
    ? [base().eq('supervisao', supervisao), base().eq('coordenacao', supervisao)]
    : [base()];
  const results = await Promise.all(queries);
  const err = results.find((r) => r.error);
  if (err) throw err.error;
  const map = new Map();
  results.forEach((res) => (res.data || []).forEach((row) => map.set(String(row.id || row.cpf || row.nome || Math.random()), row)));
  return [...map.values()];
}

async function loadPontos(supervisao) {
  const key = norm(supervisao || 'GERAL');
  const cached = cacheGet(state.cache.pontos, key);
  if (cached) return cached;
  try {
    const rows = await fetchRows('operacional_pontos_embarque', supervisao, 4000);
    return cacheSet(state.cache.pontos, key, rows.filter((row) => row?.ativo !== false && hasGeo(row.latitude, row.longitude)));
  } catch (error) {
    console.warn('[Distribuição] pontos:', error);
    return cacheSet(state.cache.pontos, key, []);
  }
}

async function loadColabs(supervisao) {
  const key = norm(supervisao || 'GERAL');
  const cached = cacheGet(state.cache.colabs, key);
  if (cached) return cached;
  try {
    const rows = await fetchRows('operacional_colaborador_base', supervisao, 3500);
    return cacheSet(state.cache.colabs, key, rows.filter((row) => row?.ativo !== false));
  } catch (error) {
    console.warn('[Distribuição] colaboradores:', error);
    return cacheSet(state.cache.colabs, key, []);
  }
}

async function loadSnapshot(supervisao) {
  const key = norm(supervisao || 'GERAL');
  const cached = cacheGet(state.cache.snapshots, key);
  if (cached) return cached;
  try {
    const latest = await supabase.from('colaborador_snapshot').select('data_referencia').order('data_referencia', { ascending: false }).limit(1);
    if (latest.error) throw latest.error;
    const ref = latest.data?.[0]?.data_referencia;
    if (!ref) return cacheSet(state.cache.snapshots, key, []);
    const { data, error } = await supabase.from('colaborador_snapshot').select('*').eq('data_referencia', ref).eq('supervisao', supervisao).limit(3500);
    if (error) throw error;
    return cacheSet(state.cache.snapshots, key, data || []);
  } catch (error) {
    console.warn('[Distribuição] snapshot:', error);
    return cacheSet(state.cache.snapshots, key, []);
  }
}

async function loadAuditorias() {
  if (state.cache.auditorias && Date.now() - state.cache.auditorias.ts < CACHE_TTL_MS) return state.cache.auditorias.data;
  try {
    const { data, error } = await supabase.from('operacional_auditoria_colaborador').select('*').order('data_evento', { ascending: false, nullsFirst: false }).limit(5000);
    if (error) throw error;
    const map = new Map();
    (data || []).forEach((row) => {
      const key = norm(row.nome_colaborador || row.classificador || row.colaborador || row.nome || '');
      if (!key) return;
      map.set(key, (map.get(key) || 0) + 1);
    });
    state.cache.auditorias = { ts: Date.now(), data: map };
    return map;
  } catch (error) {
    console.warn('[Distribuição] auditorias:', error);
    const map = new Map();
    state.cache.auditorias = { ts: Date.now(), data: map };
    return map;
  }
}

function snapshotIndex(rows) {
  const byCpf = new Map();
  const byName = new Map();
  (rows || []).forEach((row) => {
    const cpf = onlyDigits(row.cpf || row.documento || row.colaborador_cpf);
    const nome = norm(row.nome || row.colaborador || row.nome_colaborador);
    if (cpf && !byCpf.has(cpf)) byCpf.set(cpf, row);
    if (nome && !byName.has(nome)) byName.set(nome, row);
  });
  return { byCpf, byName };
}

function mergeColab(base, index) {
  const cpf = onlyDigits(base?.cpf || base?.documento || base?.colaborador_cpf);
  const nomeKey = norm(base?.nome || base?.colaborador || base?.nome_colaborador);
  const snap = (cpf && index.byCpf.get(cpf)) || index.byName.get(nomeKey) || null;
  return { ...(snap || {}), ...(base || {}) };
}

function auditInfo(row, auditorias) {
  const fields = ['taxa_auditoria', 'auditoria_taxa', 'indice_auditoria', 'percentual_auditoria', 'taxa_recusa', 'taxa_reprovacao', 'qtd_auditorias', 'auditorias'];
  for (const field of fields) {
    const parsed = num(row?.[field]);
    if (Number.isFinite(parsed) && String(row?.[field] ?? '').trim() !== '') return { value: parsed, label: field.includes('taxa') || field.includes('percentual') || field.includes('indice') ? `${parsed}%` : BR.format(parsed) };
  }
  const fallback = auditorias.get(norm(row?.nome || row?.colaborador || row?.nome_colaborador || ''));
  return Number.isFinite(fallback) ? { value: fallback, label: `${BR.format(fallback)} hist.` } : { value: null, label: 's/dados' };
}

function bestPontoForOs(os, pontos) {
  const parsed = splitUfCidadeLocal(os.embarque || '');
  const uf = norm(parsed.uf);
  const cidade = norm(parsed.cidade);
  const local = norm(parsed.local);
  const cliente = norm(os.cliente);
  const supervisao = norm(os.supervisao);
  const matches = (pontos || []).map((ponto) => {
    let score = 0;
    const pUf = norm(ponto.uf);
    const pCidade = norm(ponto.cidade);
    const pNome = norm(ponto.nome_local || ponto.tipo_local || '');
    const pSup = norm(ponto.supervisao || ponto.coordenacao || '');
    if (uf && pUf === uf) score += 50;
    if (cidade && (pCidade === cidade || pCidade.includes(cidade) || cidade.includes(pCidade))) score += 80;
    if (local && (pNome.includes(local) || local.includes(pNome))) score += 120;
    if (cliente && (pNome.includes(cliente) || cliente.includes(pNome))) score += 30;
    if (supervisao && pSup && (pSup.includes(supervisao) || supervisao.includes(pSup))) score += 15;
    return { ponto, score };
  }).filter((item) => item.score >= 120 && hasGeo(item.ponto.latitude, item.ponto.longitude));
  matches.sort((a, b) => b.score - a.score);
  return matches[0]?.ponto || null;
}

function buildSuggestion(os, context) {
  const ponto = bestPontoForOs(os, context.pontos);
  const candidates = (context.colabs || []).map((base) => {
    const merged = mergeColab(base, context.index);
    const info = auditInfo(merged, context.auditorias);
    const distancia = ponto && hasGeo(base.latitude, base.longitude)
      ? haversineKm(ponto.latitude, ponto.longitude, base.latitude, base.longitude)
      : null;
    const routePenalty = Number.isFinite(distancia) ? distancia : 99999;
    return {
      key: colabKey(merged),
      nome: merged.nome || base.nome || 'Colaborador',
      contrato: contratoLabel(merged),
      rank: contratoRank(merged),
      distancia,
      auditValue: Number.isFinite(info.value) ? info.value : 99999,
      auditLabel: info.label,
      score: contratoRank(merged) * 100000 + routePenalty * 10 + (Number.isFinite(info.value) ? info.value : 9999),
    };
  }).filter((c) => c.nome && c.key);
  candidates.sort((a, b) => a.score - b.score || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  return { suggestion: candidates[0] || null, ponto, candidates };
}

async function loadOsAtender(supervisao) {
  let query = supabase
    .from('operacional_os')
    .select('id,numero_os,cliente,contrato,produto,embarque,remanescente,supervisao,status_gestor')
    .eq('supervisao', supervisao)
    .eq('status_gestor', 'ATENDER')
    .order('data_os', { ascending: false })
    .order('numero_os', { ascending: false })
    .limit(300);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function renderDistribuicaoShell() {
  const list = document.getElementById('progList');
  if (!list) return null;
  list.innerHTML = `
    <div class="prog-section-title">
      <h4>Distribuição</h4>
      <span class="badge">Etapa B</span>
    </div>
    <div class="prog-dist-shell">
      <section class="prog-dist-panel">
        <div class="prog-dist-head">
          <div><h4>O.S. para distribuir</h4><p>Somente O.S. confirmadas como ATENDER na etapa A.</p></div>
          <button type="button" class="prog-dist-btn" id="progDistReload">Atualizar</button>
        </div>
        <div class="prog-dist-list" id="progDistList"><div class="prog-dist-empty">Carregando distribuição...</div></div>
      </section>
      <aside class="prog-dist-panel prog-dist-map">
        <div class="prog-dist-head"><div><h4>Mapa operacional</h4><p>Pontos roteirizados conforme as O.S. e as coordenadas disponíveis.</p></div></div>
        <div class="prog-map-body"><div class="prog-map-canvas" id="progDistMap"></div></div>
      </aside>
    </div>
  `;
  list.querySelector('#progDistReload')?.addEventListener('click', () => renderDistribuicaoColaboradores({ force: true }));
  return list;
}

function mapSvg(osRows, suggestions) {
  const points = osRows.map((os) => suggestions.get(String(os.id))?.ponto).filter(Boolean).filter((p) => hasGeo(p.latitude, p.longitude));
  if (!points.length) {
    return `<div class="prog-map-card"><b>Mapa aguardando coordenadas.</b><br>Sem coordenadas suficientes para montar a rota. Verifique o mapa operacional dos pontos de embarque.</div>`;
  }
  const lats = points.map((p) => Number(p.latitude));
  const lngs = points.map((p) => Number(p.longitude));
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const pad = 42;
  const w = 720, h = 420;
  const project = (p) => {
    const x = pad + ((Number(p.longitude) - minLng) / ((maxLng - minLng) || 1)) * (w - pad * 2);
    const y = h - pad - ((Number(p.latitude) - minLat) / ((maxLat - minLat) || 1)) * (h - pad * 2);
    return { x, y };
  };
  const coords = points.map(project);
  const path = coords.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const circles = points.map((p, i) => {
    const pos = coords[i];
    const label = p.nome_local || p.cidade || `Ponto ${i + 1}`;
    return `<g><circle class="prog-map-point" cx="${pos.x}" cy="${pos.y}" r="8" fill="#22c55e" stroke="#bbf7d0" stroke-width="2"/><text class="prog-map-label" x="${pos.x + 12}" y="${pos.y - 10}">${esc(String(label).slice(0, 26))}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Mapa operacional"><path d="${path}" fill="none" stroke="rgba(134,239,172,.56)" stroke-width="3" stroke-dasharray="8 7"/>${circles}</svg><div class="prog-map-card"><b>${points.length} ponto(s) roteirizado(s)</b><br>Esta visualização usa as coordenadas dos pontos de embarque. A integração com leitura de patrimônio/BFleet fica preparada para alimentar a origem do veículo e motorista.</div>`;
}

function osCardHtml(os, result) {
  const sug = result.suggestion;
  const km = sug && Number.isFinite(sug.distancia) ? `${KM.format(sug.distancia)} km` : 'km s/dados';
  const nome = sug?.nome || '';
  const info = sug ? `${sug.contrato} · ${km} · Aud.: ${sug.auditLabel}` : 'Sem sugestão calculada';
  return `
    <article class="prog-dist-os" data-os-id="${esc(os.id)}" data-suggest-name="${esc(nome)}" data-suggest-km="${sug && Number.isFinite(sug.distancia) ? String(sug.distancia) : ''}">
      <div class="prog-dist-os-title"><span>${esc(os.cliente || '-')}</span><small>OS ${esc(os.numero_os || '-')}</small></div>
      <div class="prog-dist-meta"><b>Contrato:</b> ${esc(os.contrato || '-')} · <b>Produto:</b> ${esc(os.produto || '-')} · <b>Saldo:</b> ${fmtSaldo(os.remanescente)}</div>
      <div class="prog-dist-meta"><b>Local de embarque:</b> ${esc(os.embarque || '-')}</div>
      <div class="prog-dist-suggest">
        <div class="prog-dist-field">
          <label>Colaborador sugerido / associado</label>
          <input type="text" value="${esc(nome)}" data-colab-input autocomplete="off" spellcheck="false" placeholder="Selecionar colaborador..." />
          <div class="prog-dist-info ${sug ? '' : 'warn'}" data-colab-info>${esc(info)}</div>
        </div>
        <button type="button" class="prog-dist-btn" data-confirm-dist>Confirmar</button>
      </div>
    </article>
  `;
}

async function confirmWithImpact(message) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'prog-impact-modal';
    modal.innerHTML = `
      <div class="prog-impact-box">
        <h3>Impacto operacional alto</h3>
        <p>${esc(message)}</p>
        <div class="prog-impact-actions">
          <button type="button" class="prog-impact-cancel" data-cancel-impact>✕ Cancelar</button>
          <button type="button" class="prog-impact-ok" data-ok-impact>✓ Confirmar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('[data-cancel-impact]').addEventListener('click', () => { modal.remove(); resolve(false); });
    modal.querySelector('[data-ok-impact]').addEventListener('click', () => { modal.remove(); resolve(true); });
  });
}

function findSelectedColab(name, context) {
  const wanted = norm(name);
  if (!wanted) return null;
  return (context.colabs || []).map((base) => mergeColab(base, context.index)).find((row) => {
    const rowName = norm(row.nome || row.colaborador || row.nome_colaborador);
    return rowName && (rowName === wanted || rowName.includes(wanted) || wanted.includes(rowName));
  }) || null;
}

async function confirmarDistribuicao(card, os, result, context) {
  const input = card.querySelector('[data-colab-input]');
  const btn = card.querySelector('[data-confirm-dist]');
  const nome = String(input?.value || '').trim();
  if (!nome || !btn) return;

  const selected = findSelectedColab(nome, context);
  const ponto = result.ponto;
  const selectedKm = selected && ponto && hasGeo(selected.latitude, selected.longitude)
    ? haversineKm(ponto.latitude, ponto.longitude, selected.latitude, selected.longitude)
    : null;
  const suggestedKm = Number.isFinite(result.suggestion?.distancia) ? result.suggestion.distancia : null;
  const mudouSugestao = norm(nome) !== norm(result.suggestion?.nome || '');
  const grandeImpacto = mudouSugestao && (!Number.isFinite(selectedKm) || !Number.isFinite(suggestedKm) || selectedKm > suggestedKm * 1.6 + 25 || selectedKm - suggestedKm > 80);

  if (grandeImpacto) {
    const ok = await confirmWithImpact('Esta alteração causará um grande impacto na despesa da regional podendo afetar o percentual de bônus. Confirma essa Distribuição?');
    if (!ok) return;
  }

  btn.disabled = true;
  btn.textContent = 'Salvando...';
  try {
    const payload = {
      os_id: os.id,
      colaborador_key: selected ? colabKey(selected) : nome,
      colaborador_nome: nome,
      distancia_km: Number.isFinite(selectedKm) ? selectedKm : (Number.isFinite(suggestedKm) ? suggestedKm : null),
      origem_sugestao: mudouSugestao ? 'GESTOR_DISTRIBUICAO_MANUAL' : 'GESTOR_DISTRIBUICAO_SUGESTAO',
      indicado_por: state.user?.id || null,
    };
    await supabase.from('operacional_os_colaboradores').delete().eq('os_id', os.id);
    const { error } = await supabase.from('operacional_os_colaboradores').insert(payload);
    if (error) throw error;
    btn.classList.add('done');
    btn.textContent = 'Confirmado';
    const info = card.querySelector('[data-colab-info]');
    if (info) info.textContent = `Confirmado · ${Number.isFinite(payload.distancia_km) ? `${KM.format(payload.distancia_km)} km` : 'km s/dados'}`;
  } catch (error) {
    console.error('[Distribuição] salvar:', error);
    btn.disabled = false;
    btn.textContent = 'Confirmar';
    alert(error.message || 'Não foi possível confirmar a distribuição.');
  }
}

async function renderDistribuicaoColaboradores({ force = false } = {}) {
  injectStyles();
  applyStepBodyClass('B');
  setActiveStep('B');
  renderDistribuicaoShell();
  setFeedback('Etapa B aberta. Distribua os colaboradores para as O.S. marcadas como ATENDER.');

  const listEl = document.getElementById('progDistList');
  const mapEl = document.getElementById('progDistMap');
  const supervisao = selectedSupervisao();
  if (!supervisao) {
    if (listEl) listEl.innerHTML = '<div class="prog-dist-empty">Selecione uma supervisão no topo para montar a distribuição.</div>';
    if (mapEl) mapEl.innerHTML = '<div class="prog-map-card"><b>Sem supervisão selecionada.</b></div>';
    return;
  }

  if (state.loading && !force) return;
  state.loading = true;
  if (listEl) listEl.innerHTML = '<div class="prog-dist-empty">Calculando sugestões de distribuição...</div>';

  try {
    state.user ||= await getCurrentUser().catch(() => null);
    const [osRows, pontos, colabs, snapshot, auditorias] = await Promise.all([
      loadOsAtender(supervisao),
      loadPontos(supervisao),
      loadColabs(supervisao),
      loadSnapshot(supervisao),
      loadAuditorias(),
    ]);
    const context = { pontos, colabs, snapshot, index: snapshotIndex(snapshot), auditorias };
    const suggestions = new Map();
    osRows.forEach((os) => suggestions.set(String(os.id), buildSuggestion(os, context)));

    if (!osRows.length) {
      if (listEl) listEl.innerHTML = '<div class="prog-dist-empty">Nenhuma O.S. marcada como ATENDER. Confirme as O.S. na etapa A para iniciar a distribuição.</div>';
      if (mapEl) mapEl.innerHTML = '<div class="prog-map-card"><b>Aguardando O.S. ATENDER.</b><br>Após confirmar na etapa A, os pontos aparecerão aqui.</div>';
      return;
    }

    if (listEl) {
      listEl.innerHTML = osRows.map((os) => osCardHtml(os, suggestions.get(String(os.id)))).join('');
      listEl.querySelectorAll('.prog-dist-os').forEach((card) => {
        const os = osRows.find((row) => String(row.id) === String(card.dataset.osId));
        const result = suggestions.get(String(card.dataset.osId));
        card.querySelector('[data-confirm-dist]')?.addEventListener('click', () => confirmarDistribuicao(card, os, result, context));
      });
    }
    if (mapEl) mapEl.innerHTML = mapSvg(osRows, suggestions);
  } catch (error) {
    console.error('[Distribuição] render:', error);
    if (listEl) listEl.innerHTML = `<div class="prog-dist-empty">${esc(error.message || 'Erro ao montar distribuição.')}</div>`;
  } finally {
    state.loading = false;
  }
}

function bindTopLoad() {
  const btn = document.getElementById('progLoadContext');
  if (!btn || btn.dataset.reestruturaLoadBound === '1') return;
  btn.dataset.reestruturaLoadBound = '1';
  btn.addEventListener('click', () => {
    if (state.activeStep === 'B') setTimeout(() => renderDistribuicaoColaboradores({ force: true }), 250);
    if (state.activeStep === 'A') setTimeout(compactarCardsOs, 400);
  }, true);
}

function initObserver() {
  const observer = new MutationObserver(() => {
    injectStyles();
    patchSteps();
    bindTopLoad();
    if (state.activeStep === 'A') compactarCardsOs();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

async function init() {
  injectStyles();
  await new Promise((resolve) => {
    const timer = setInterval(() => {
      if (document.getElementById('progSteps')) {
        clearInterval(timer);
        resolve();
      }
    }, 120);
  });
  patchSteps();
  bindTopLoad();
  initObserver();
  setTimeout(compactarCardsOs, 800);
}

init().catch((error) => console.warn('[programacao-reestrutura]', error));
