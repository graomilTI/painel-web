import { supabase } from './supabaseClient.js';
import { getCurrentUser, getUserContext } from './auth.js';

const state = {
  ready: false,
  restricted: false,
  allowedLabels: [],
  tokens: [],
  options: [],
  loading: false,
  loaded: false,
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
  if (typeof value === 'object') return parseList(value.supervisao || value.supervisoes || value.nome || value.name || value.coordenacao || value.regional);
  const text = String(value).trim();
  if (!text) return [];
  try {
    if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('{') && text.endsWith('}'))) return parseList(JSON.parse(text));
  } catch {}
  return [...new Set(text.split(/[,;|\n]+/).map((item) => item.trim()).filter(Boolean))];
}

function uniqSorted(values) {
  const map = new Map();
  values.flatMap(parseList).forEach((item) => {
    const label = String(item || '').trim();
    const key = norm(label);
    if (label && key && !map.has(key)) map.set(key, label);
  });
  return [...map.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function isMasterContext(context) {
  const role = context?.user?.role || context?.perfil_codigo || context?.perfil_nome || context?.role || '';
  return Boolean(context?.user?.is_master || context?.is_master || norm(role) === 'MASTER');
}

function buildAccess(appUser, context) {
  const labels = [
    ...parseList(appUser?.supervisao),
    ...parseList(appUser?.supervisoes),
    ...parseList(appUser?.supervisao_liberada),
    ...parseList(appUser?.supervisoes_liberadas),
    ...parseList(appUser?.coordenacao),
    ...parseList(context?.user?.supervisao),
    ...parseList(context?.user?.supervisoes),
    ...parseList(context?.user?.coordenacao),
    ...parseList(context?.supervisao),
    ...parseList(context?.supervisoes),
    ...parseList(context?.coordenacao),
  ].filter(Boolean);

  const setor = norm(appUser?.setor || context?.setor || context?.department?.name || context?.department?.code || '');
  const master = isMasterContext(context);
  const restricted = setor === 'GESTOR' || labels.length > 0 || !master;
  const fullTokens = uniqSorted(labels).map(norm).filter((item) => item.length >= 4);
  const wordTokens = fullTokens
    .flatMap((item) => item.split(/\s+/))
    .filter((item) => item.length >= 4 && !['GERAL', 'SETOR', 'GESTOR', 'SUPERVISAO', 'REGIONAL'].includes(item));

  return {
    restricted,
    allowedLabels: uniqSorted(labels),
    tokens: [...new Set([...fullTokens, ...wordTokens])],
  };
}

function allowed(label) {
  if (!state.restricted) return true;
  const key = norm(label);
  return state.tokens.some((token) => token && (key === token || key.includes(token) || token.includes(key)));
}

function collectRows(rows, fields) {
  return (rows || []).flatMap((row) => fields.flatMap((field) => parseList(row?.[field])));
}

async function loadOptions() {
  if (state.loading) return state.options;
  if (state.loaded) return state.options;

  state.loading = true;
  const collected = [...state.allowedLabels];
  const requests = [
    supabase.from('supervisoes').select('nome').eq('ativo', true).order('nome', { ascending: true }),
    supabase.from('operacional_os').select('supervisao').limit(5000),
    supabase.from('operacional_colaborador_base').select('supervisao,coordenacao').eq('ativo', true).limit(5000),
    supabase.from('operacional_pontos_embarque').select('supervisao,coordenacao').eq('ativo', true).limit(8000),
    supabase.from('colaborador_snapshot').select('supervisao,coordenacao').limit(5000),
  ];

  const results = await Promise.allSettled(requests);
  results.forEach((result) => {
    if (result.status !== 'fulfilled' || result.value?.error) return;
    collected.push(...collectRows(result.value?.data || [], ['nome', 'supervisao', 'supervisoes', 'coordenacao', 'regional']));
  });

  state.options = uniqSorted(collected);
  state.loaded = true;
  state.loading = false;
  return state.options;
}

function applySelectOptions(select) {
  if (!select || !state.ready) return;

  let candidates = state.options.filter(allowed);
  if (state.restricted && !candidates.length && state.allowedLabels.length) candidates = state.allowedLabels;

  const existing = new Set([...select.options].map((option) => norm(option.value || option.textContent)));
  candidates.forEach((label) => {
    const key = norm(label);
    if (!key || existing.has(key)) return;
    const option = document.createElement('option');
    option.value = label;
    option.textContent = label;
    select.appendChild(option);
    existing.add(key);
  });

  let visibleCount = 0;
  let first = '';
  [...select.options].forEach((option) => {
    if (!option.value) return;
    const ok = allowed(option.textContent || option.value);
    option.hidden = !ok;
    option.disabled = !ok;
    if (ok) {
      visibleCount += 1;
      if (!first) first = option.value;
    }
  });

  if (state.restricted && first && (!select.value || select.selectedOptions?.[0]?.disabled)) {
    select.value = first;
    if (!select.dataset.gestorSupFixSelected) {
      select.dataset.gestorSupFixSelected = '1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  if (state.restricted && visibleCount === 1) select.disabled = true;
}

async function patchSelect() {
  const select = document.getElementById('filterSupervisao');
  if (!select || !state.ready) return;
  if (select.options.length <= 1 && !state.loaded) await loadOptions().catch((error) => console.warn('[gestor-app-supervisao-fix] opções:', error));
  applySelectOptions(select);
}

async function init() {
  try {
    const user = await getCurrentUser().catch(() => null);
    const [context, userRes] = await Promise.all([
      user?.id ? getUserContext(user.id).catch(() => null) : Promise.resolve(null),
      supabase
        .from('app_usuarios')
        .select('id,nome,email,setor,supervisao,supervisoes,supervisao_liberada,supervisoes_liberadas,coordenacao,status')
        .eq('auth_user_id', user?.id || '')
        .maybeSingle(),
    ]);
    Object.assign(state, buildAccess(userRes?.data || null, context), { ready: true });
    await loadOptions();
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
