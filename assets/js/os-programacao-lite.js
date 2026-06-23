import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

const PAGE_SIZE = 150;
const BR = new Intl.NumberFormat('pt-BR');
const KM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const STATUS_OPTIONS = ['AGUARDAR', 'ATENDER', 'FINALIZAR'];
const ICO_PLUS = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="pointer-events:none;vertical-align:middle"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
const ICO_FOLHA = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;vertical-align:middle"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>`;

const OS_SELECT = [
  'id',
  'numero_os',
  'data_os',
  'cliente',
  'servico',
  'supervisao',
  'embarque',
  'destino',
  'contrato',
  'produto',
  'remanescente',
  'lote',
  'embarcado',
  'status_gestor',
  'observacao_logistica',
  'permitir_mais_classificadores',
  'status_logistica',
  'enviado_logistica_em',
  'logistica_solicitado_por',
  'configurada_em',
  'updated_at',
  'created_at',
].join(',');

const COLAB_SELECT = 'id,colaborador_id,cpf,nome,supervisao,coordenacao,latitude,longitude,ativo';
const PONTO_SELECT = 'id,tipo_local,nome_local,uf,cidade,latitude,longitude,supervisao,coordenacao,ativo';

let currentUser = null;
let loadToken = 0;
const pontosCache = new Map();
const colabsCache = new Map();

let gacDropdownEl = null;
let gacState = { input: null, row: null, onSelect: null };

function ensureGacDropdown() {
  if (gacDropdownEl) return gacDropdownEl;
  gacDropdownEl = document.createElement('div');
  gacDropdownEl.id = 'osLiteGacDropdown';
  gacDropdownEl.className = 'os-lite-gac-portal';
  gacDropdownEl.hidden = true;
  document.body.appendChild(gacDropdownEl);

  document.addEventListener('mousedown', (event) => {
    if (gacDropdownEl.hidden) return;
    const item = event.target.closest('.os-lite-gac-item');
    if (item && gacDropdownEl.contains(item)) {
      event.preventDefault();
      const { row, onSelect } = gacState;
      const key = item.dataset.key;
      hideGacDropdown();
      if (row && onSelect) onSelect(row, key);
      return;
    }
    if (!gacDropdownEl.contains(event.target) && event.target !== gacState.input) {
      hideGacDropdown();
    }
  });
  const reposition = () => { if (gacDropdownEl && !gacDropdownEl.hidden && gacState.input) positionGacDropdown(gacDropdownEl, gacState.input); };
  window.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);

  return gacDropdownEl;
}

function positionGacDropdown(dd, input) {
  const rect = input.getBoundingClientRect();
  dd.style.left = `${rect.left}px`;
  dd.style.top = `${rect.bottom + 4}px`;
  dd.style.width = `${rect.width}px`;
}

function hideGacDropdown() {
  if (gacDropdownEl) gacDropdownEl.hidden = true;
  gacState = { input: null, row: null, onSelect: null };
}

function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

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

function num(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const clean = String(value ?? '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmtTon(value) {
  return BR.format(num(value));
}

function brDate(value) {
  if (!value) return '-';
  const raw = String(value).slice(0, 10);
  const [y, m, d] = raw.split('-');
  return y && m && d ? `${d}/${m}/${y}` : escapeHtml(value);
}

function onlyActiveColab(c) {
  return !!c && c.ativo !== false;
}

function colabKey(c) {
  return String(c?.colaborador_id || c?.cpf || c?.id || c?.nome || '').replace(/\D/g, '') || String(c?.id || c?.nome || '').trim();
}

function hasGeo(lat, lng) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

function haversineKm(aLat, aLng, bLat, bLng) {
  const lat1 = Number(aLat), lon1 = Number(aLng), lat2 = Number(bLat), lon2 = Number(bLng);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s1 + s2), Math.sqrt(1 - s1 - s2));
}

function splitUfCidadeLocal(text) {
  const raw = String(text || '').trim();
  const match = raw.match(/^([A-Z]{2})\s*-\s*([^()]+?)(?:\s*\(([^)]+)\))?\s*$/i);
  if (!match) return { uf: '', cidade: raw, local: '' };
  return { uf: match[1].toUpperCase(), cidade: match[2].trim(), local: (match[3] || '').trim() };
}

function statusLabel(row) {
  return normalize(row?.status_gestor) || 'PENDENTE';
}

function statusClass(row) {
  const st = statusLabel(row);
  if (st === 'ATENDER') return 'ok';
  if (st === 'FINALIZAR') return 'danger';
  if (st === 'AGUARDAR') return 'warn';
  return '';
}

function injectStyles() {
  if (document.getElementById('osProgramacaoLiteStyles')) return;
  const style = document.createElement('style');
  style.id = 'osProgramacaoLiteStyles';
  style.textContent = `
    .os-lite-actions{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:0 0 12px}.os-lite-actions .muted{font-size:12px}.os-lite-actions .btn{min-height:36px}
    .os-lite-list{display:flex;flex-direction:column;gap:10px}
    .os-lite-card{border:1px solid rgba(52,211,153,.16);border-radius:18px;background:rgba(2,6,23,.25);overflow:hidden}
    .os-lite-row{padding:10px 13px;border-bottom:1px solid rgba(148,163,184,.1)}
    .os-lite-row:last-child{border-bottom:0}
    .os-lite-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
    .os-lite-rembox{display:flex;flex-direction:column;gap:3px;align-items:flex-end;text-align:right;flex-shrink:0}
    .os-lite-title{font-weight:900;color:#f8fafc;font-size:13.5px;line-height:1.18}.os-lite-meta{font-size:11px;color:#6b7280;margin-top:3px;line-height:1.25}.os-lite-route{display:block;white-space:normal;overflow-wrap:anywhere}
    .os-lite-indic .os-lite-gac-input{margin-bottom:4px}
    .os-lite-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
    .os-lite-chip{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:900;border:1px solid rgba(148,163,184,.18);white-space:nowrap}.os-lite-chip.ok{background:rgba(22,163,74,.13);color:#bbf7d0}.os-lite-chip.warn{background:rgba(250,204,21,.14);color:#fde68a}.os-lite-chip.info{background:rgba(59,130,246,.13);color:#bfdbfe}.os-lite-chip.danger{background:rgba(239,68,68,.12);color:#fecaca}
    .os-lite-buttons{display:flex;gap:4px;flex-wrap:wrap}.os-lite-btn{border:1px solid rgba(52,211,153,.22);background:rgba(15,23,42,.72);color:#dcfce7;border-radius:999px;padding:6px 8px;font-weight:900;cursor:pointer;font-size:12px;flex-shrink:0}.os-lite-btn.active{background:linear-gradient(135deg,#16a34a,#86efac);color:#052e16}.os-lite-btn.warn.active{background:#fde68a;color:#713f12}.os-lite-btn.danger.active{background:#fecaca;color:#7f1d1d}.os-lite-btn:disabled{opacity:.55;cursor:not-allowed}
    .os-lite-row-aguardar{background:rgba(250,204,21,.06)}.os-lite-row-atender{background:rgba(34,197,94,.06)}.os-lite-row-finalizar{background:rgba(59,130,246,.06)}.os-lite-row-kg{background:rgba(239,68,68,.06)}.os-lite-zero{box-shadow:inset 4px 0 0 #facc15}
    .os-lite-empty{border:1px dashed rgba(148,163,184,.2);border-radius:18px;padding:18px;color:#6b7280;background:rgba(15,23,42,.16)}.os-lite-load-more{display:flex;justify-content:center;margin-top:12px}
    .os-lite-gac-input{width:100%;box-sizing:border-box;padding:6px 8px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#f1f5f9;font-size:12.5px;outline:none}
    .os-lite-gac-input:focus{border-color:#4ade80}
    .os-lite-gac-portal{position:fixed;background:#0b1220;border:1px solid #334155;border-radius:8px;max-height:260px;overflow-y:auto;z-index:99999;box-shadow:0 14px 38px rgba(0,0,0,.55);opacity:1;backdrop-filter:none;-webkit-backdrop-filter:none}
    .os-lite-gac-item{padding:7px 10px;cursor:pointer;font-size:12.5px;color:#f1f5f9;display:flex;justify-content:space-between;align-items:center;gap:8px;background:#0b1220}
    .os-lite-gac-item:hover{background:rgba(74,222,128,.16)}
    .os-lite-gac-dist{font-size:10.5px;color:#94a3b8;white-space:nowrap;flex-shrink:0}
    .os-lite-gac-empty{padding:8px 10px;font-size:12.5px;color:#94a3b8;font-style:italic;background:#0b1220}
    .os-lite-btn.kg{color:#90cdf4;border-color:rgba(99,179,237,.35)}.os-lite-btn.kg.active{background:rgba(99,179,237,.35);color:#0c2942}
    .os-lite-btn.conferir{color:#c4b5fd;border-color:rgba(167,139,250,.35)}.os-lite-btn.conferir.active{background:rgba(167,139,250,.35);color:#2e1065}
    .os-lite-kg-overlay{position:fixed;inset:0;background:rgba(2,6,23,.65);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px}
    .os-lite-kg-modal{background:#0f172a;border:1px solid rgba(52,211,153,.25);border-radius:16px;padding:18px;width:100%;max-width:360px;display:flex;flex-direction:column;gap:10px}
    .os-lite-kg-modal h3{margin:0;font-size:15px;color:#f8fafc}
    .os-lite-kg-modal p{margin:0;font-size:12px;color:#94a3b8}
    .os-lite-kg-modal input{padding:9px 10px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#f8fafc;font-size:14px}
    .os-lite-kg-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}
    .os-lite-dropzone{border:2px dashed rgba(167,139,250,.4);border-radius:14px;padding:24px 14px;text-align:center;color:#94a3b8;cursor:pointer;font-size:13px;transition:border-color .15s}
    .os-lite-dropzone:hover{border-color:rgba(167,139,250,.7)}
    .os-lite-dropzone small{font-size:11px}
    .os-lite-file-list{font-size:12px;color:#bbf7d0;min-height:18px}
    @media (min-width:901px){
      .os-lite-list{display:flex;flex-direction:column;gap:8px}
      .os-lite-card{display:grid;grid-template-columns:minmax(170px,1.05fr) minmax(280px,1.7fr) minmax(220px,1.15fr) minmax(190px,.95fr);align-items:stretch;border-radius:12px;overflow:visible}
      .os-lite-row{display:flex;min-width:0;padding:9px 11px;border-bottom:0;border-right:1px solid rgba(148,163,184,.1)}
      .os-lite-row:last-child{border-right:0}
      .os-lite-head{align-items:center}
      .os-lite-client,.os-lite-indic{flex-direction:column;justify-content:center}
      .os-lite-footer{align-items:center;justify-content:center;flex-direction:column;gap:7px}
      .os-lite-rembox{min-width:96px}
      .os-lite-buttons{justify-content:center;flex-wrap:nowrap}
      .os-lite-gac-input{min-height:34px}
    }
  `;
  document.head.appendChild(style);
}

function buildQuery(supervisao, status, from, to) {
  let query = supabase
    .from('operacional_os')
    .select(OS_SELECT, { count: 'exact' })
    .eq('supervisao', supervisao)
    .order('data_os', { ascending: false })
    .order('numero_os', { ascending: false })
    .range(from, to);

  const statusNorm = normalize(status);
  if (statusNorm === 'PENDENTE') {
    query = query.or('status_gestor.is.null,status_gestor.eq.PENDENTE');
  } else if (statusNorm) {
    query = query.eq('status_gestor', statusNorm);
  }

  return query;
}

async function loadAtribuicoes(osIds) {
  const ids = osIds.filter(Boolean);
  if (!ids.length) return [];
  const chunks = [];
  for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
  const results = await Promise.all(chunks.map((chunk) => (
    supabase
      .from('operacional_os_colaboradores')
      .select('id,os_id,colaborador_key,colaborador_nome,distancia_km,origem_sugestao')
      .in('os_id', chunk)
  )));
  const erro = results.find((r) => r.error);
  if (erro) {
    console.warn('Falha ao carregar colaboradores vinculados às O.S.', erro.error);
    return [];
  }
  return results.flatMap((r) => Array.isArray(r.data) ? r.data : []);
}

async function fetchDeduped(queries, dedupeKey) {
  const results = await Promise.all(queries);
  const erro = results.find((r) => r.error);
  if (erro) throw erro.error;
  const merged = new Map();
  results.forEach((r) => (r.data || []).forEach((row) => merged.set(dedupeKey(row), row)));
  return [...merged.values()];
}

async function loadPontos(supervisao) {
  const key = normalize(supervisao || 'GERAL');
  if (pontosCache.has(key)) return pontosCache.get(key);

  const base = () => supabase.from('operacional_pontos_embarque').select(PONTO_SELECT).limit(2000);
  const data = supervisao
    ? await fetchDeduped([base().eq('supervisao', supervisao), base().eq('coordenacao', supervisao)], (p) => p.id)
    : await fetchDeduped([base()], (p) => p.id);
  const rows = data.filter((p) => p.ativo !== false && hasGeo(p.latitude, p.longitude));
  pontosCache.set(key, rows);
  return rows;
}

async function loadColabs(supervisao) {
  const key = normalize(supervisao || 'GERAL');
  if (colabsCache.has(key)) return colabsCache.get(key);

  const base = () => supabase.from('operacional_colaborador_base').select(COLAB_SELECT).eq('ativo', true).limit(2500);
  const data = supervisao
    ? await fetchDeduped([base().eq('supervisao', supervisao), base().eq('coordenacao', supervisao)], (c) => c.id)
    : await fetchDeduped([base()], (c) => c.id);
  const rows = data.filter(onlyActiveColab);
  colabsCache.set(key, rows);
  return rows;
}

function bestPontoForOs(row, pontos) {
  const parsed = splitUfCidadeLocal(row.embarque || row.local_embarque || '');
  const uf = normalize(parsed.uf);
  const cidade = normalize(parsed.cidade);
  const local = normalize(parsed.local);
  const cliente = normalize(row.cliente);
  const candidatos = (pontos || []).map((p) => {
    let score = 0;
    const pUf = normalize(p.uf);
    const pCidade = normalize(p.cidade);
    const pNome = normalize(p.nome_local || p.tipo_local || '');
    const pSup = normalize(p.supervisao || p.coordenacao || '');
    if (uf && pUf === uf) score += 50;
    if (cidade && (pCidade === cidade || pCidade.includes(cidade) || cidade.includes(pCidade))) score += 80;
    if (local && (pNome.includes(local) || local.includes(pNome))) score += 120;
    if (cliente && (pNome.includes(cliente) || cliente.includes(pNome))) score += 30;
    if (row.supervisao && pSup && (pSup.includes(normalize(row.supervisao)) || normalize(row.supervisao).includes(pSup))) score += 15;
    return { ponto: p, score };
  }).filter((x) => x.score >= 120).sort((a, b) => b.score - a.score);
  return candidatos[0]?.ponto || null;
}

async function sugerirColaborador(row, atribuicoes) {
  const atuais = atribuicoes.filter((a) => String(a.os_id) === String(row.id));
  if (atuais.length) return atuais[0];

  const [pontos, colabs] = await Promise.all([loadPontos(row.supervisao), loadColabs(row.supervisao)]);
  const ponto = bestPontoForOs(row, pontos);
  if (!ponto || !hasGeo(ponto.latitude, ponto.longitude)) {
    throw new Error('Ponto de embarque sem coordenadas. Ajuste o mapa operacional ou use o menu OS completo para indicar manualmente.');
  }

  const candidatos = colabs
    .filter((c) => hasGeo(c.latitude, c.longitude))
    .map((c) => ({ ...c, distancia_km: haversineKm(ponto.latitude, ponto.longitude, c.latitude, c.longitude) }))
    .filter((c) => c.distancia_km != null)
    .sort((a, b) => a.distancia_km - b.distancia_km);

  const escolhido = candidatos[0];
  if (!escolhido) throw new Error('Nenhum colaborador com coordenadas foi encontrado para esta supervisão.');

  const payload = {
    os_id: row.id,
    colaborador_key: colabKey(escolhido),
    colaborador_nome: escolhido.nome || 'Colaborador sugerido',
    distancia_km: Number(escolhido.distancia_km),
    origem_sugestao: 'DISTANCIA_OPERACIONAL_LITE',
    indicado_por: currentUser?.id || null,
  };

  const { data, error } = await supabase
    .from('operacional_os_colaboradores')
    .upsert(payload, { onConflict: 'os_id,colaborador_key' })
    .select('id,os_id,colaborador_key,colaborador_nome,distancia_km,origem_sugestao')
    .maybeSingle();
  if (error) throw error;
  return data || payload;
}

function statsHtml(rows, total) {
  const atender = rows.filter((r) => normalize(r.status_gestor) === 'ATENDER').length;
  const zero = rows.filter((r) => num(r.remanescente) === 0).length;
  const ate555 = rows.filter((r) => num(r.remanescente) > 0 && num(r.remanescente) <= 555000).length;
  return `
    <section class="grid-cards mt-16">
      <article class="card"><h3>Total filtrado</h3><p class="metric">${BR.format(total ?? rows.length)}</p><p class="muted">No Supabase, conforme filtro.</p></article>
      <article class="card"><h3>Na tela</h3><p class="metric">${BR.format(rows.length)}</p><p class="muted">Carregamento paginado.</p></article>
      <article class="card"><h3>Para atender</h3><p class="metric">${BR.format(atender)}</p><p class="muted">Nesta página.</p></article>
      <article class="card"><h3>Rem. zero</h3><p class="metric">${BR.format(zero)}</p><p class="muted">Nesta página.</p></article>
      <article class="card"><h3>Até 555.000</h3><p class="metric">${BR.format(ate555)}</p><p class="muted">Nesta página.</p></article>
    </section>
  `;
}

function rowHtml(row, atribuicoes) {
  const rem = num(row.remanescente);
  const zero = rem === 0;
  const isNegativo = rem < 0;
  const status = statusLabel(row);
  const atr = atribuicoes.filter((a) => String(a.os_id) === String(row.id));
  const main = atr[0] || null;
  const rowColorClass = isNegativo ? 'os-lite-row-kg' : row.observacao_logistica?.startsWith('KG solicitado') ? 'os-lite-row-kg' : status === 'AGUARDAR' ? 'os-lite-row-aguardar' : status === 'ATENDER' ? 'os-lite-row-atender' : status === 'FINALIZAR' ? 'os-lite-row-finalizar' : '';
  const statusButtons = STATUS_OPTIONS.map((opt) => {
    const icon = opt === 'AGUARDAR' ? 'Ⅱ' : opt === 'ATENDER' ? '✓' : '$';
    const title = opt === 'ATENDER' ? 'Atender' : opt === 'AGUARDAR' ? 'Aguardar' : 'Finalizar';
    return `<button class="os-lite-btn ${opt === 'AGUARDAR' ? 'warn' : opt === 'FINALIZAR' ? 'danger' : ''} ${status === opt ? 'active' : ''}" data-status="${opt}" title="${title}">${icon}</button>`;
  }).join('');
  const kgButton = `<button class="os-lite-btn kg ${row.observacao_logistica?.startsWith('KG solicitado') ? 'active' : ''}" data-action-kg="${escapeHtml(row.id)}" type="button" title="Adicionar saldo">${ICO_PLUS}</button>`;
  const conferirButton = `<button class="os-lite-btn conferir ${row.observacao_logistica?.startsWith('LAUDO:') ? 'active' : ''}" data-action-conferir="${escapeHtml(row.id)}" type="button" title="Conferir · Anexar arquivo">${ICO_FOLHA}</button>`;
  return `<article data-os-id="${escapeHtml(row.id)}" class="os-lite-card ${zero ? 'os-lite-zero' : ''} ${rowColorClass}">
    <div class="os-lite-row os-lite-head">
      <div>
        <div class="os-lite-title">${escapeHtml(row.numero_os)}</div>
        <div class="os-lite-meta">${brDate(row.data_os)} · ${escapeHtml(row.servico || '-')} · ${escapeHtml(row.supervisao || '-')}</div>
      </div>
      <div class="os-lite-rembox">
        <span class="os-lite-chip ${zero ? 'warn' : rem <= 555000 ? 'info' : 'ok'}">${fmtTon(rem)}</span>
        <div class="os-lite-meta">Lote ${fmtTon(row.lote)} · Emb. ${fmtTon(row.embarcado)}</div>
      </div>
    </div>
    <div class="os-lite-row os-lite-client">
      <div class="os-lite-title">${escapeHtml(row.cliente || '-')}</div>
      <div class="os-lite-meta os-lite-route">Emb.: ${escapeHtml(row.embarque || '-')} → Dest.: ${escapeHtml(row.destino || '-')}</div>
      <div class="os-lite-meta os-lite-route">Contrato ${escapeHtml(row.contrato || '-')} • ${escapeHtml(row.produto || '-')}</div>
    </div>
    <div class="os-lite-row os-lite-indic">
      <input type="text" class="os-lite-gac-input" value="${escapeHtml(main?.colaborador_nome || '')}" placeholder="Selecionar colaborador..." autocomplete="off" spellcheck="false" />
      <div class="os-lite-meta">${main?.distancia_km != null ? `${KM.format(main.distancia_km)} km` : main ? 'Indicado' : 'Sem indicação. Ao marcar Atender, o painel tenta sugerir pelo mapa operacional.'}</div>
    </div>
    <div class="os-lite-row os-lite-footer">
      <div class="os-lite-buttons">${statusButtons}${kgButton}${conferirButton}</div>
      <span class="os-lite-chip ${statusClass(row)}">${escapeHtml(status)}</span>
    </div>
  </article>`;
}

export async function renderOsProgramacaoLite(content, options = {}) {
  injectStyles();
  const token = ++loadToken;
  const state = {
    supervisao: String(options.supervisao || '').trim(),
    status: String(options.status || '').trim(),
    rows: [],
    atribuicoes: [],
    total: 0,
    offset: 0,
    loadingMore: false,
  };

  if (!currentUser) currentUser = await getCurrentUser().catch(() => null);

  content.innerHTML = `
    <div id="osLiteRoot">
      <div class="os-lite-actions"><span class="muted" id="osLiteFeedback">Preparando consulta...</span><button type="button" class="btn btn-secondary" id="osLiteReload">↻ Atualizar</button></div>
      <div id="osLiteStats"></div>
      <div id="osLiteList"><div class="os-lite-empty">Carregando...</div></div>
    </div>
  `;

  const el = {
    feedback: content.querySelector('#osLiteFeedback'),
    reload: content.querySelector('#osLiteReload'),
    stats: content.querySelector('#osLiteStats'),
    list: content.querySelector('#osLiteList'),
  };

  if (!state.supervisao) {
    el.feedback.textContent = 'Selecione uma supervisão no topo para evitar consulta pesada no banco.';
    el.list.innerHTML = '<div class="os-lite-empty">Selecione uma supervisão e clique em Carregar.</div>';
    return;
  }

  async function loadPage({ append = false } = {}) {
    if (token !== loadToken || state.loadingMore) return;
    state.loadingMore = true;
    const from = append ? state.rows.length : 0;
    const to = from + PAGE_SIZE - 1;
    el.feedback.textContent = append ? 'Carregando mais O.S...' : `Consultando Supabase para ${state.supervisao}...`;

    try {
      const { data, error, count } = await buildQuery(state.supervisao, state.status, from, to);
      if (error) throw error;
      const chunk = Array.isArray(data) ? data : [];
      const atribuicoes = await loadAtribuicoes(chunk.map((row) => row.id));
      if (append) {
        state.rows = [...state.rows, ...chunk];
        state.atribuicoes = [...state.atribuicoes, ...atribuicoes];
      } else {
        state.rows = chunk;
        state.atribuicoes = atribuicoes;
      }
      state.total = count ?? state.rows.length;
      render();
    } catch (error) {
      console.error(error);
      el.feedback.textContent = error.message || 'Erro ao carregar O.S.';
      el.list.innerHTML = `<div class="os-lite-empty">${escapeHtml(error.message || 'Erro ao carregar O.S.')}</div>`;
    } finally {
      state.loadingMore = false;
    }
  }

  function render() {
    if (token !== loadToken) return;
    el.stats.innerHTML = statsHtml(state.rows, state.total);
    el.feedback.textContent = `Mostrando ${BR.format(state.rows.length)} de ${BR.format(state.total || state.rows.length)} O.S. filtradas.`;
    if (!state.rows.length) {
      el.list.innerHTML = '<div class="os-lite-empty">Nenhuma O.S. encontrada para o filtro atual.</div>';
      return;
    }
    const more = state.rows.length < state.total
      ? `<div class="os-lite-load-more"><button type="button" class="btn btn-secondary" id="osLiteMore">Carregar mais ${Math.min(PAGE_SIZE, state.total - state.rows.length)} O.S.</button></div>`
      : '';
    el.list.innerHTML = `<div class="os-lite-list">${state.rows.map((row) => rowHtml(row, state.atribuicoes)).join('')}</div>${more}`;
    el.list.querySelector('#osLiteMore')?.addEventListener('click', () => loadPage({ append: true }));
  }

  async function atualizarStatus(osId, nextStatus, button) {
    const row = state.rows.find((item) => String(item.id) === String(osId));
    if (!row || button?.disabled) return;
    const previous = { ...row };
    const previousAtribuicoes = [...state.atribuicoes];
    button.disabled = true;

    try {
      if (nextStatus === 'ATENDER') {
        const atual = state.atribuicoes.filter((a) => String(a.os_id) === String(row.id));
        if (!atual.length) {
          el.feedback.textContent = `Buscando colaborador sugerido para OS ${row.numero_os}...`;
          const novo = await sugerirColaborador(row, state.atribuicoes);
          state.atribuicoes = [...state.atribuicoes.filter((a) => !(String(a.os_id) === String(novo.os_id) && String(a.colaborador_key) === String(novo.colaborador_key))), novo];
        }
      }

      const agoraIso = new Date().toISOString();
      const patch = {
        status_gestor: nextStatus,
        configurada_em: agoraIso,
        observacao_logistica: null,
      };
      if (nextStatus === 'FINALIZAR') {
        patch.status_logistica = 'PENDENTE';
        patch.enviado_logistica_em = row.enviado_logistica_em || agoraIso;
        patch.logistica_solicitado_por = currentUser?.id || null;
      } else {
        patch.status_logistica = null;
        patch.enviado_logistica_em = null;
        patch.logistica_solicitado_por = null;
      }

      Object.assign(row, patch);
      render();
      const { error } = await supabase.from('operacional_os').update({ ...patch, updated_at: agoraIso }).eq('id', osId);
      if (error) throw error;

      if (nextStatus === 'ATENDER') {
        try {
          const engine = window.__painelNotifEngine;
          if (engine) {
            await engine.criarNotificacao({
              tipo: 'os_atender',
              titulo: `OS ${row.numero_os} pronta para conferência`,
              descricao: `${row.supervisao || ''} — ${row.cliente || ''} — ${row.data_os || ''}`,
              destinatario_modulo: 'distribuir_os',
              supervisao: row.supervisao || null,
              referencia_tabela: 'operacional_os',
              referencia_id: String(row.id),
              chave_dedup: `os_atender:${row.id}`,
            });
          }
        } catch (_) {}
      }

      el.feedback.textContent = `OS ${row.numero_os} atualizada para ${nextStatus}.`;
    } catch (error) {
      console.error(error);
      Object.assign(row, previous);
      state.atribuicoes = previousAtribuicoes;
      render();
      alert(error.message || 'Não foi possível atualizar a O.S.');
    }
  }

  async function buscarColabsParaOs(row, query) {
    const [colabs, pontos] = await Promise.all([loadColabs(row.supervisao), loadPontos(row.supervisao)]);
    const ponto = bestPontoForOs(row, pontos);
    const norm = normalize(query);
    const hasQuery = norm.length >= 2;
    return colabs
      .filter((c) => !hasQuery || normalize(c.nome).includes(norm))
      .map((c) => ({ c, distancia: ponto && hasGeo(c.latitude, c.longitude) ? haversineKm(ponto.latitude, ponto.longitude, c.latitude, c.longitude) : null }))
      .sort((a, b) => {
        if (Number.isFinite(a.distancia) && Number.isFinite(b.distancia)) return a.distancia - b.distancia;
        if (Number.isFinite(a.distancia)) return -1;
        if (Number.isFinite(b.distancia)) return 1;
        return 0;
      })
      .slice(0, 15);
  }

  async function abrirDropdownColaborador(input, row, query) {
    const dd = ensureGacDropdown();
    gacState = {
      input,
      row,
      onSelect: (r, key) => {
        const colabs = colabsCache.get(normalize(r.supervisao || 'GERAL')) || [];
        const colab = colabs.find((c) => colabKey(c) === key);
        if (colab) selecionarColaborador(r, colab);
      },
    };
    positionGacDropdown(dd, input);
    dd.hidden = false;
    dd.innerHTML = '<div class="os-lite-gac-empty">Buscando...</div>';
    let results;
    try {
      results = await buscarColabsParaOs(row, query);
    } catch (error) {
      console.error('Falha ao buscar colaboradores para indicação.', error);
      if (gacState.input !== input) return;
      dd.innerHTML = `<div class="os-lite-gac-empty">Erro ao buscar colaboradores: ${escapeHtml(error.message || 'falha desconhecida')}</div>`;
      return;
    }
    if (gacState.input !== input) return;
    if (!results.length) {
      dd.innerHTML = '<div class="os-lite-gac-empty">Nenhum colaborador encontrado.</div>';
      return;
    }
    dd.innerHTML = results.map(({ c, distancia }) => {
      const dist = Number.isFinite(distancia) ? ` <span class="os-lite-gac-dist">${KM.format(distancia)} km</span>` : '';
      return `<div class="os-lite-gac-item" data-key="${escapeHtml(colabKey(c))}">${escapeHtml(c.nome)}${dist}</div>`;
    }).join('');
  }

  async function selecionarColaborador(row, colab) {
    const pontos = await loadPontos(row.supervisao);
    const ponto = bestPontoForOs(row, pontos);
    const distancia = ponto && hasGeo(colab.latitude, colab.longitude) ? haversineKm(ponto.latitude, ponto.longitude, colab.latitude, colab.longitude) : null;
    const payload = {
      os_id: row.id,
      colaborador_key: colabKey(colab),
      colaborador_nome: colab.nome || 'Colaborador',
      distancia_km: Number.isFinite(distancia) ? distancia : null,
      origem_sugestao: 'APP_GESTOR_MANUAL_LITE',
      indicado_por: currentUser?.id || null,
    };
    el.feedback.textContent = `Atualizando colaborador da OS ${row.numero_os}...`;
    try {
      await supabase.from('operacional_os_colaboradores').delete().eq('os_id', row.id);
      const { data, error } = await supabase
        .from('operacional_os_colaboradores')
        .insert(payload)
        .select('id,os_id,colaborador_key,colaborador_nome,distancia_km,origem_sugestao')
        .maybeSingle();
      if (error) throw error;
      state.atribuicoes = [...state.atribuicoes.filter((a) => String(a.os_id) !== String(row.id)), data || payload];
      el.feedback.textContent = `Colaborador da OS ${row.numero_os} atualizado.`;
      render();
    } catch (error) {
      console.error(error);
      alert(error.message || 'Não foi possível atualizar o colaborador.');
    }
  }

  function openKgModalLite(row) {
    const existing = document.getElementById('os-lite-kg-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'os-lite-kg-overlay';
    overlay.className = 'os-lite-kg-overlay';
    overlay.innerHTML = `
      <div class="os-lite-kg-modal">
        <h3>Qual o valor precisa somar na O.S.?</h3>
        <p>O.S. <strong style="color:#bbf7d0">${escapeHtml(row.numero_os)}</strong> — valor será enviado para a Logística.</p>
        <input id="osLiteKgInput" type="number" min="1" placeholder="Inserir KG" inputmode="numeric" />
        <div class="os-lite-kg-actions">
          <button type="button" class="btn btn-secondary" id="osLiteKgCancelar">Cancelar</button>
          <button type="button" class="btn btn-primary" id="osLiteKgConfirmar">Confirmar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#osLiteKgInput');
    input.focus();
    overlay.querySelector('#osLiteKgCancelar').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#osLiteKgConfirmar').addEventListener('click', async () => {
      const kg = Number(input.value);
      if (!kg || kg <= 0) { input.focus(); return; }
      const btn = overlay.querySelector('#osLiteKgConfirmar');
      btn.disabled = true;
      btn.textContent = 'Enviando...';
      const kgText = `KG solicitado pelo gestor: ${new Intl.NumberFormat('pt-BR').format(kg)} kg`;
      const agoraIso = new Date().toISOString();
      try {
        const { error } = await supabase.from('operacional_os').update({
          observacao_logistica: kgText,
          status_gestor: 'AGUARDAR',
          configurada_em: null,
          updated_at: agoraIso,
        }).eq('id', row.id);
        if (error) throw error;
        Object.assign(row, { observacao_logistica: kgText, status_gestor: 'AGUARDAR', configurada_em: null });
        overlay.remove();
        render();
        el.feedback.textContent = `Solicitação de saldo enviada para a Logística (OS ${row.numero_os}).`;
      } catch (error) {
        console.error(error);
        alert(error.message || 'Não foi possível enviar a solicitação.');
        btn.disabled = false;
        btn.textContent = 'Confirmar';
      }
    });
  }

  function openConferirModalLite(row) {
    const existing = document.getElementById('os-lite-conferir-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'os-lite-conferir-overlay';
    overlay.className = 'os-lite-kg-overlay';
    overlay.innerHTML = `
      <div class="os-lite-kg-modal">
        <h3>Conferir O.S. ${escapeHtml(row.numero_os)}</h3>
        <p>Anexe imagens, planilhas ou PDFs para conferência.</p>
        <div class="os-lite-dropzone" id="osLiteConferirDropzone">
          Clique ou arraste arquivos aqui<br><small>imagens, PDF, Excel, CSV</small>
        </div>
        <input id="osLiteConferirFileInput" type="file" multiple accept="image/*,.pdf,.xlsx,.xls,.csv" style="display:none" />
        <div class="os-lite-file-list" id="osLiteConferirFileList"></div>
        <div class="os-lite-kg-actions">
          <button type="button" class="btn btn-secondary" id="osLiteConferirCancelar">Cancelar</button>
          <button type="button" class="btn btn-primary" id="osLiteConferirEnviar">Enviar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const dropzone = overlay.querySelector('#osLiteConferirDropzone');
    const fileInput = overlay.querySelector('#osLiteConferirFileInput');
    const fileList = overlay.querySelector('#osLiteConferirFileList');
    let selectedFiles = [];

    const updateFileList = () => { fileList.textContent = selectedFiles.map((f) => f.name).join(', ') || ''; };

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.style.borderColor = 'rgba(167,139,250,.8)'; });
    dropzone.addEventListener('dragleave', () => { dropzone.style.borderColor = 'rgba(167,139,250,.4)'; });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'rgba(167,139,250,.4)';
      selectedFiles = [...(e.dataTransfer.files || [])];
      updateFileList();
    });
    fileInput.addEventListener('change', () => {
      selectedFiles = [...(fileInput.files || [])];
      updateFileList();
    });

    overlay.querySelector('#osLiteConferirCancelar').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#osLiteConferirEnviar').addEventListener('click', async () => {
      if (!selectedFiles.length) { dropzone.style.borderColor = 'rgba(239,68,68,.8)'; return; }
      const btn = overlay.querySelector('#osLiteConferirEnviar');
      btn.disabled = true;
      btn.textContent = 'Enviando...';

      try {
        const urls = [];
        for (const file of selectedFiles) {
          const path = `os/${row.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          const { data: upData, error: upErr } = await supabase.storage.from('os-laudos').upload(path, file, { upsert: true });
          if (upErr) throw upErr;
          const { data: urlData } = supabase.storage.from('os-laudos').getPublicUrl(upData.path);
          urls.push(urlData.publicUrl);
        }
        const laudoText = `LAUDO:${urls.join(',')}`;
        const agoraIso = new Date().toISOString();
        const { error } = await supabase.from('operacional_os').update({ observacao_logistica: laudoText, updated_at: agoraIso }).eq('id', row.id);
        if (error) throw error;
        Object.assign(row, { observacao_logistica: laudoText });
        overlay.remove();
        render();
        el.feedback.textContent = `Arquivo de conferência anexado à OS ${row.numero_os}.`;
      } catch (error) {
        console.error(error);
        alert(error.message || 'Não foi possível enviar o anexo.');
        btn.disabled = false;
        btn.textContent = 'Enviar';
      }
    });
  }

  el.reload.addEventListener('click', () => loadPage({ append: false }));
  el.list.addEventListener('click', (event) => {
    const statusBtn = event.target.closest('[data-status]');
    if (statusBtn) {
      const tr = statusBtn.closest('[data-os-id]');
      if (tr) atualizarStatus(tr.dataset.osId, statusBtn.dataset.status, statusBtn);
      return;
    }
    const conferirBtn = event.target.closest('[data-action-conferir]');
    if (conferirBtn) {
      const tr = conferirBtn.closest('[data-os-id]');
      const row = state.rows.find((r) => String(r.id) === String(tr?.dataset.osId));
      if (row) openConferirModalLite(row);
      return;
    }
    const kgBtn = event.target.closest('[data-action-kg]');
    if (kgBtn) {
      const tr = kgBtn.closest('[data-os-id]');
      const row = state.rows.find((r) => String(r.id) === String(tr?.dataset.osId));
      if (row) openKgModalLite(row);
    }
  });
  const debouncedGacInput = debounce((event) => {
    const input = event.target.closest('.os-lite-gac-input');
    if (!input) return;
    const tr = input.closest('[data-os-id]');
    const row = state.rows.find((r) => String(r.id) === String(tr?.dataset.osId));
    if (!row) return;
    abrirDropdownColaborador(input, row, input.value);
  }, 200);
  el.list.addEventListener('input', debouncedGacInput);
  el.list.addEventListener('focusin', (event) => {
    const input = event.target.closest('.os-lite-gac-input');
    if (!input) return;
    const tr = input.closest('[data-os-id]');
    const row = state.rows.find((r) => String(r.id) === String(tr?.dataset.osId));
    if (!row) return;
    input.select();
    abrirDropdownColaborador(input, row, '');
  });
  el.list.addEventListener('focusout', (event) => {
    const input = event.target.closest('.os-lite-gac-input');
    if (!input) return;
    setTimeout(() => { if (gacState.input === input) hideGacDropdown(); }, 150);
  });

  await loadPage({ append: false });
}
