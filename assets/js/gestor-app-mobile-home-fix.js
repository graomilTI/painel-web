import { supabase } from './supabaseClient.js';
import { getCurrentUser, getUserContext } from './auth.js';
import { toPanelUrl } from './paths.js';

const STYLE_ID = 'gestorMobileHomeFixStyles';
const PROGRAMACAO_URL = toPanelUrl('programacao');
const cache = { loading: false, loaded: false, rows: [], error: '' };

function norm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function parseList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return [...new Set(value.flatMap(parseList))];
  if (typeof value === 'object') return parseList(value.supervisao || value.supervisoes || value.nome || value.name);
  const text = String(value).trim();
  if (!text) return [];
  try {
    if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('{') && text.endsWith('}'))) return parseList(JSON.parse(text));
  } catch {}
  return [...new Set(text.split(/[,;|\n]+/).map((item) => item.trim()).filter(Boolean))];
}

function isMasterContext(context) {
  const role = context?.user?.role || context?.perfil_codigo || context?.perfil_nome || context?.role || '';
  return Boolean(context?.user?.is_master || context?.is_master || norm(role) === 'MASTER');
}

function allowedSupervisoes(context, appUser) {
  return [
    ...parseList(appUser?.supervisao),
    ...parseList(context?.user?.supervisao),
    ...parseList(context?.user?.supervisoes),
    ...parseList(context?.supervisao),
    ...parseList(context?.supervisoes),
  ].filter(Boolean);
}

function osStatus(row) {
  const st = String(row?.status_gestor || 'AGUARDAR').toUpperCase();
  if (st === 'AGUARDAR' && !row?.configurada_em) return 'PENDENTE';
  return st || 'PENDENTE';
}

function brDate(value) {
  const raw = String(value || '').slice(0, 10);
  const [y, m, d] = raw.split('-');
  return y && m && d ? `${d}/${m}` : '';
}

function osNumber(row) {
  return String(row?.numero_os || row?.id || '').trim();
}

function sortOs(a, b) {
  const priority = { PENDENTE: 1, AGUARDAR: 2, ATENDER: 3, FINALIZAR: 4 };
  const pa = priority[osStatus(a)] || 9;
  const pb = priority[osStatus(b)] || 9;
  if (pa !== pb) return pa - pb;
  const da = String(a?.data_os || '').slice(0, 10);
  const db = String(b?.data_os || '').slice(0, 10);
  if (da !== db) return da.localeCompare(db);
  return osNumber(a).localeCompare(osNumber(b), 'pt-BR', { numeric: true });
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .gestor-app{padding-bottom:calc(18px + env(safe-area-inset-bottom))!important}
    .bottom-nav{display:none!important}
    #uxRegionalMetaMount{display:none!important}
    #appMain{padding-bottom:18px!important}
    .ux-home-actions,.db-actions-label,#appMain>.quick-grid{display:none!important}
    .db-prod-card{display:block!important;margin-bottom:10px!important;padding:14px 14px 12px!important;border-radius:22px!important}
    .db-prod-eyebrow{margin-bottom:8px!important}
    .db-topbar{margin-bottom:10px!important}
    .db-prod-body{grid-template-columns:minmax(0,1fr) minmax(0,.92fr)!important;gap:10px!important;margin-bottom:10px!important}
    .db-prod-right{gap:8px!important}
    .db-state-svg{max-height:210px!important}
    .db-stat-value{font-size:clamp(17px,4.8vw,23px)!important}
    .db-stat-sub,.db-delta{font-size:9.5px!important}
    .db-chart-label{font-size:8.5px!important}
    .db-pace-row{gap:6px!important}
    .db-row-2{grid-template-columns:1fr!important;gap:10px!important;margin-bottom:0!important}
    .db-os-card{order:1;min-height:auto!important;padding:14px!important}
    .db-patri-card{order:2;min-height:auto!important;padding:14px!important}
    .db-card-eyebrow{margin-bottom:9px!important}
    .db-os-hero,.db-patri-hero{margin-bottom:8px!important}
    .db-os-sequence{margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.06);display:grid;gap:7px;max-height:178px;overflow:auto;scrollbar-width:none}
    .db-os-sequence::-webkit-scrollbar{display:none}
    .db-os-sequence-title{font-size:9px;font-weight:950;text-transform:uppercase;letter-spacing:.12em;color:var(--soft)}
    .db-os-seq-row{display:grid;grid-template-columns:1fr auto;gap:6px;align-items:center;padding:8px 9px;border-radius:13px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.055)}
    .db-os-seq-title{font-size:12px;font-weight:950;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .db-os-seq-meta{margin-top:2px;font-size:10.5px;font-weight:750;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .db-os-seq-status{font-size:9px;font-weight:950;border-radius:999px;padding:5px 7px;color:#011a0d;background:var(--green-2);white-space:nowrap}
    .db-os-seq-status.is-pendente{background:rgba(148,163,184,.24);color:#e2e8f0;border:1px solid rgba(148,163,184,.35)}
    .db-os-seq-status.is-aguardar{background:var(--yellow);color:#3b2f00}
    .db-os-seq-status.is-atender{background:var(--green-2);color:#011a0d}
    .db-os-seq-empty,.db-os-seq-more{font-size:11px;color:var(--muted);font-weight:800;line-height:1.35}
    @media(max-width:430px){
      .app-main{padding-left:12px!important;padding-right:12px!important;padding-top:14px!important}
      .db-prod-card{padding:12px!important}
      .db-prod-body{grid-template-columns:1fr .86fr!important;gap:8px!important}
      .db-state-svg{max-height:188px!important}
      .db-state-pct{font-size:38px!important}
      .db-state-abbr{font-size:15px!important}
      .db-stat-value{font-size:17px!important}
      .db-os-num,.db-patri-num{font-size:32px!important}
      .db-os-sequence{max-height:162px!important}
    }
  `;
  document.head.appendChild(style);
}

async function loadProgramacaoRows() {
  if (cache.loaded || cache.loading) return cache.rows;
  cache.loading = true;
  cache.error = '';
  try {
    const user = await getCurrentUser().catch(() => null);
    const context = user?.id ? await getUserContext(user.id).catch(() => null) : null;
    const { data: appUser, error: userError } = await supabase
      .from('app_usuarios')
      .select('id,nome,email,setor,supervisao,coordenacao,status')
      .eq('auth_user_id', user?.id || '')
      .maybeSingle();
    if (userError) throw userError;

    const master = isMasterContext(context);
    const allowed = allowedSupervisoes(context, appUser);
    let query = supabase
      .from('operacional_os')
      .select('id,numero_os,cliente,embarque,destino,supervisao,coordenacao,status_gestor,configurada_em,data_os,remanescente')
      .limit(250);

    if (!master) {
      if (allowed.length) query = query.in('supervisao', allowed);
      else if (String(appUser?.supervisao || '').trim()) query = query.eq('supervisao', String(appUser.supervisao).trim());
      else if (String(appUser?.coordenacao || '').trim()) query = query.eq('coordenacao', String(appUser.coordenacao).trim());
      else query = query.eq('supervisao', '__sem_supervisao_liberada__');
    }

    const { data, error } = await query;
    if (error) throw error;
    cache.rows = Array.isArray(data) ? data : [];
    cache.loaded = true;
  } catch (error) {
    cache.error = error?.message || 'Não foi possível carregar a sequência de O.S.';
    cache.rows = [];
  } finally {
    cache.loading = false;
  }
  return cache.rows;
}

function sequenceHtml(rows) {
  const active = [...rows].filter((row) => osStatus(row) !== 'FINALIZAR').sort(sortOs);
  const visible = active.slice(0, 5);
  if (cache.loading && !cache.loaded) {
    return `<div class="db-os-sequence"><div class="db-os-sequence-title">Sequência liberada</div><div class="db-os-seq-empty">Carregando O.S. liberadas...</div></div>`;
  }
  if (cache.error) {
    return `<div class="db-os-sequence"><div class="db-os-sequence-title">Sequência liberada</div><div class="db-os-seq-empty">${escapeHtml(cache.error)}</div></div>`;
  }
  if (!visible.length) {
    return `<div class="db-os-sequence"><div class="db-os-sequence-title">Sequência liberada</div><div class="db-os-seq-empty">Nenhuma O.S. liberada para esta supervisão.</div></div>`;
  }

  const rowsHtml = visible.map((row) => {
    const st = osStatus(row);
    const cls = st === 'PENDENTE' ? 'is-pendente' : st === 'AGUARDAR' ? 'is-aguardar' : st === 'ATENDER' ? 'is-atender' : '';
    const cliente = row?.cliente ? ` · ${row.cliente}` : '';
    const sup = row?.supervisao ? ` · ${row.supervisao}` : '';
    const date = brDate(row?.data_os);
    return `
      <div class="db-os-seq-row">
        <div>
          <div class="db-os-seq-title">OS ${escapeHtml(osNumber(row) || '-')}</div>
          <div class="db-os-seq-meta">${escapeHtml(`${date ? `${date} · ` : ''}${row?.embarque || '-'}${cliente}${sup}`)}</div>
        </div>
        <span class="db-os-seq-status ${cls}">${escapeHtml(st)}</span>
      </div>`;
  }).join('');
  const more = active.length > visible.length
    ? `<div class="db-os-seq-more">+${active.length - visible.length} O.S. na programação completa</div>`
    : '';
  return `<div class="db-os-sequence"><div class="db-os-sequence-title">Sequência liberada</div>${rowsHtml}${more}</div>`;
}

function patchProgramacaoCard() {
  const card = document.querySelector('.db-os-card');
  if (!card) return;
  card.setAttribute('title', 'Abrir Programação completa');
  card.setAttribute('aria-label', 'Abrir Programação completa');

  const rows = cache.rows;
  const pendentes = rows.filter((row) => osStatus(row) === 'PENDENTE').length;
  const conferencia = rows.filter((row) => osStatus(row) === 'ATENDER').length;

  if (cache.loaded) {
    const number = card.querySelector('.db-os-num');
    if (number) {
      number.textContent = String(pendentes);
      number.classList.toggle('is-amber', pendentes > 0);
      number.classList.toggle('is-green', pendentes === 0);
    }
    const den = card.querySelector('.db-os-den');
    if (den) den.textContent = `pendente${pendentes === 1 ? '' : 's'}`;
    const status = card.querySelector('.db-os-status');
    if (status) {
      status.innerHTML = conferencia > 0
        ? `<span class="db-status-late">${conferencia} em conferência</span>`
        : '<span class="db-status-ok">Tudo ajustado ✓</span>';
    }
  }

  const current = card.querySelector('.db-os-sequence');
  const html = sequenceHtml(rows);
  if (current) current.outerHTML = html;
  else card.insertAdjacentHTML('beforeend', html);
}

function forceMapVisible() {
  const nativeCard = document.querySelector('.db-prod-card');
  if (nativeCard) {
    nativeCard.hidden = false;
    nativeCard.style.removeProperty('display');
  }
  document.getElementById('uxRegionalMetaMount')?.setAttribute('hidden', 'hidden');
}

function patchHome() {
  injectStyles();
  forceMapVisible();
  patchProgramacaoCard();
}

function isProgramacaoTarget(target) {
  const el = target?.closest?.('[data-go="programacao"],.nav-btn[data-tab="programacao"],[data-ux-module="programacao"]');
  return Boolean(el);
}

function openFullProgramacao(event) {
  if (!isProgramacaoTarget(event.target)) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  window.location.href = PROGRAMACAO_URL;
}

let scheduled = false;
function schedulePatch() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    patchHome();
  });
}

async function start() {
  patchHome();
  await loadProgramacaoRows();
  patchHome();
}

document.addEventListener('click', openFullProgramacao, true);
document.addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && isProgramacaoTarget(event.target)) openFullProgramacao(event);
}, true);
new MutationObserver(schedulePatch).observe(document.body, { childList: true, subtree: true });
window.addEventListener('load', start);
schedulePatch();
start();
