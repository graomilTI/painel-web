import { supabase } from './supabaseClient.js';
import { getCurrentUser, getUserContext } from './auth.js';

const state = {
  ready: false,
  restricted: false,
  allowedLabels: [],
  allowedKeys: new Set(),
  autoSelectedOnce: false,
};

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
  if (typeof value === 'object') {
    return parseList(value.supervisao || value.supervisoes || value.nome || value.name || value.label || value.value);
  }

  const text = String(value).trim();
  if (!text) return [];

  try {
    if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('{') && text.endsWith('}'))) {
      return parseList(JSON.parse(text));
    }
  } catch {}

  return [...new Set(text.split(/[,;|\n]+/).map((item) => item.trim()).filter(Boolean))];
}

// Marcadores de papel/perfil que às vezes aparecem misturados no campo livre
// app_usuarios.supervisao (ex.: "Master" herdado de backfill legado) — não são
// coordenações reais e não podem aparecer como se fossem uma.
const NAO_COORDENACAO = new Set(['MASTER', 'ADMIN', 'ADMINISTRADOR', 'GESTOR', 'DIRETOR']);

function uniqLabels(values) {
  const map = new Map();
  values.flatMap(parseList).forEach((item) => {
    const label = String(item || '').trim();
    const key = norm(label);
    if (label && key && !NAO_COORDENACAO.has(key) && !map.has(key)) map.set(key, label);
  });
  return [...map.values()];
}

function isMasterContext(context) {
  const role = context?.user?.role || context?.perfil_codigo || context?.perfil_nome || context?.role || '';
  return Boolean(context?.user?.is_master || context?.is_master || norm(role) === 'MASTER');
}

function looksLikeGestor(value) {
  const normalized = norm(value);
  return normalized === 'GESTOR' || normalized.startsWith('GESTOR ');
}

function extractAllowedSupervisoes(appUser, context) {
  return uniqLabels([
    appUser?.supervisoes,
    appUser?.supervisao,
    context?.user?.supervisoes,
    context?.user?.supervisao,
    context?.supervisoes,
    context?.supervisao,
  ]).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function buildAccess(appUser, context) {
  const setor = appUser?.setor || context?.setor || context?.department?.name || context?.department?.code || '';
  const role = context?.user?.role || context?.perfil_codigo || context?.perfil_nome || context?.role || '';
  const master = isMasterContext(context);
  const allowedLabels = extractAllowedSupervisoes(appUser, context);
  const restricted = !master && (looksLikeGestor(setor) || looksLikeGestor(role) || allowedLabels.length > 0);

  return {
    restricted,
    allowedLabels,
    allowedKeys: new Set(allowedLabels.map(norm).filter(Boolean)),
  };
}

function optionAllowed(optionText) {
  if (!state.restricted) return true;
  const key = norm(optionText);
  return Boolean(key && state.allowedKeys.has(key));
}

function addAllowedOptions(select) {
  if (!select || !state.restricted) return;

  const existing = new Set([...select.options].map((option) => norm(option.value || option.textContent)));
  state.allowedLabels.forEach((label) => {
    const key = norm(label);
    if (!key || existing.has(key)) return;
    const option = document.createElement('option');
    option.value = label;
    option.textContent = label;
    select.appendChild(option);
    existing.add(key);
  });
}

function patchSelect() {
  const select = document.getElementById('filterSupervisao');
  if (!select || !state.ready) return;

  if (!state.restricted) return;

  addAllowedOptions(select);

  if (!state.allowedLabels.length) {
    select.value = '';
    select.disabled = true;
    return;
  }

  let visibleCount = 0;
  let first = '';
  [...select.options].forEach((option) => {
    if (!option.value) {
      option.hidden = false;
      option.disabled = false;
      return;
    }
    const ok = optionAllowed(option.textContent || option.value);
    option.hidden = !ok;
    option.disabled = !ok;
    if (ok) {
      visibleCount += 1;
      if (!first) first = option.value;
    }
  });

  if (!visibleCount) {
    select.value = '';
    select.disabled = true;
    return;
  }

  if (!select.value || select.selectedOptions?.[0]?.disabled) {
    select.value = first;
    if (!state.autoSelectedOnce) {
      state.autoSelectedOnce = true;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  select.disabled = visibleCount === 1;
}

async function getAppUser(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('app_usuarios')
    .select('*')
    .eq('auth_user_id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[gestor-app-supervisao-fix] app_usuarios:', error);
    return null;
  }
  return data || null;
}

async function init() {
  try {
    const user = await getCurrentUser().catch(() => null);
    const [context, appUser] = await Promise.all([
      user?.id ? getUserContext(user.id).catch(() => null) : Promise.resolve(null),
      getAppUser(user?.id),
    ]);
    Object.assign(state, buildAccess(appUser, context), { ready: true });
    patchSelect();
  } catch (error) {
    console.warn('[gestor-app-supervisao-fix] falha ao iniciar:', error);
    state.ready = true;
  }
}

let scheduled = false;
function schedulePatch() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    patchSelect();
  });
}

new MutationObserver(schedulePatch).observe(document.body, { childList: true, subtree: true });
window.addEventListener('load', schedulePatch);
init();
