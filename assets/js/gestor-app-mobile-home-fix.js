import { supabase } from './supabaseClient.js';
import { getCurrentUser, getUserContext } from './auth.js';
import { toPanelUrl } from './paths.js';

const STYLE_ID = 'gestorMobileHomeFixStyles';
const PROGRAMACAO_URL = toPanelUrl('programacao');
const cache = { loading: false, loaded: false, rows: [], error: '', access: null };

function norm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
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

function buildAccess(context, appUser) {
  const labels = [
    ...parseList(appUser?.supervisao),
    ...parseList(appUser?.supervisoes),
    ...parseList(context?.user?.supervisao),
    ...parseList(context?.user?.supervisoes),
    ...parseList(context?.supervisao),
    ...parseList(context?.supervisoes),
  ].filter(Boolean);

  const coordenacao = String(appUser?.coordenacao || context?.coordenacao || context?.user?.coordenacao || '').trim();
  if (coordenacao) labels.push(coordenacao);

  const setor = norm(appUser?.setor || context?.setor || context?.department?.name || context?.department?.code || '');
  const master = isMasterContext(context);
  const restricted = setor === 'GESTOR' || labels.length > 0 || !master;
  const fullTokens = [...new Set(labels.map(norm).filter((item) => item.length >= 4))];
  const wordTokens = fullTokens
    .flatMap((item) => item.split(/\s+/))
    .filter((item) => item.length >= 4 && !['GERAL', 'SETOR', 'GESTOR', 'SUPERVISAO', 'REGIONAL'].includes(item));

  return {
    restricted,
    coordenacao,
    allowed: [...new Set(labels)],
    tokens: [...new Set([...fullTokens, ...wordTokens])],
  };
}

function rowAllowed(row, access) {
  if (!access?.restricted) return true;
  const sup = norm(row?.supervisao);
  const coord = norm(row?.coordenacao);
  return access.tokens.some((token) => token && (
    sup === token || sup.includes(token) || token.includes(sup) ||
    coord === token || coord.includes(token) || token.includes(coord)
  ));
}

function osStatus(row) {
  const st = String(row?.status_gestor || 'AGUARDAR').toUpperCase();
  if (st === 'AGUARDAR' && !row?.configurada_em) return 'PENDENTE';
  return st || 'PENDENTE';
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
    @media(max-width:430px){
      .app-main{padding-left:12px!important;padding-right:12px!important;padding-top:14px!important}
      .db-prod-card{padding:12px!important}
      .db-prod-body{grid-template-columns:1fr .86fr!important;gap:8px!important}
      .db-state-svg{max-height:188px!important}
      .db-state-pct{font-size:38px!important}
      .db-state-abbr{font-size:15px!important}
      .db-stat-value{font-size:17px!important}
      .db-os-num,.db-patri-num{font-size:32px!important}
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

    const access = buildAccess(context, appUser);
    cache.access = access;
    // operacional_os não tem coluna coordenacao (só supervisao) — filtra sempre por
    // supervisao; access.allowed já inclui a coordenação do gestor como um dos rótulos.
    let query = supabase
      .from('operacional_os')
      .select('id,numero_os,cliente,embarque,destino,supervisao,status_gestor,configurada_em,data_os,remanescente')
      .limit(250);

    if (access.restricted) {
      if (access.allowed.length === 1) query = query.ilike('supervisao', `%${access.allowed[0]}%`);
      else if (access.allowed.length > 1) query = query.in('supervisao', access.allowed);
      else query = query.eq('supervisao', '__sem_supervisao_liberada__');
    }

    const { data, error } = await query;
    if (error) throw error;
    cache.rows = (Array.isArray(data) ? data : []).filter((row) => rowAllowed(row, access));
    cache.loaded = true;
  } catch (error) {
    cache.error = error?.message || 'Não foi possível carregar a sequência de O.S.';
    cache.rows = [];
  } finally {
    cache.loading = false;
  }
  return cache.rows;
}

// Tela inicial mostra só a quantidade (card é clicável e abre a Programação completa
// com a lista); manter a lista aqui também seria redundante.
function patchProgramacaoCard() {
  const card = document.querySelector('.db-os-card');
  if (!card) return;
  card.setAttribute('title', 'Abrir Programação completa');
  card.setAttribute('aria-label', 'Abrir Programação completa');
  card.querySelector('.db-os-sequence')?.remove();

  if (!cache.loaded) return;
  const rows = cache.rows;
  const pendentes = rows.filter((row) => osStatus(row) === 'PENDENTE').length;
  const conferencia = rows.filter((row) => osStatus(row) === 'ATENDER').length;

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
