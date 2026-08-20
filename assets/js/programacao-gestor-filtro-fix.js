import { supabase } from './supabaseClient.js';
import { getCurrentUser, getUserContext } from './auth.js';

const state = {
  ready: false,
  restricted: false,
  allowedLabels: [],
  allowedKeys: new Set(),
};

// Valor sintético da opção "Todas" no seletor de Supervisão — não existe na
// tabela supervisoes. Quando selecionado, a Programação trabalha somente com
// as supervisões explicitamente liberadas ao usuário.
export const TODAS_SUPERVISOES = '__TODAS__';

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
// app_usuarios.supervisao não são supervisões reais.
const NAO_SUPERVISAO = new Set(['MASTER', 'ADMIN', 'ADMINISTRADOR', 'GESTOR', 'DIRETOR']);

function uniqLabels(values) {
  const map = new Map();
  values.flatMap(parseList).forEach((item) => {
    const label = String(item || '').trim();
    const key = norm(label);
    if (label && key && !NAO_SUPERVISAO.has(key) && !map.has(key)) map.set(key, label);
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

function extractAllowedSupervisoes(appUser, context, relationRows = []) {
  return uniqLabels([
    relationRows,
    appUser?.supervisoes,
    appUser?.supervisao,
    context?.user?.supervisoes,
    context?.user?.supervisao,
    context?.supervisoes,
    context?.supervisao,
  ]).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function buildAccess(appUser, context, relationRows = []) {
  const setor = appUser?.setor || context?.setor || context?.department?.name || context?.department?.code || '';
  const role = context?.user?.role || context?.perfil_codigo || context?.perfil_nome || context?.role || '';
  const master = isMasterContext(context);
  const allowedLabels = extractAllowedSupervisoes(appUser, context, relationRows);
  const restricted = !master && (
    looksLikeGestor(setor)
    || looksLikeGestor(role)
    || allowedLabels.length > 0
  );

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

function setFeedback(message, type = 'ok') {
  const feedback = document.getElementById('progCtxFeedback');
  if (!feedback || !message) return;
  feedback.className = `feedback mt-16 prog-feedback-${type}`;
  feedback.textContent = message;
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

function ensureTodasOption(select, visibleCount) {
  const existingTodas = [...select.options].find((o) => o.value === TODAS_SUPERVISOES);
  if (visibleCount > 1) {
    if (!existingTodas) {
      const todas = document.createElement('option');
      todas.value = TODAS_SUPERVISOES;
      todas.textContent = 'Todas';
      const placeholder = select.options[0] && !select.options[0].value ? select.options[0] : null;
      select.insertBefore(todas, placeholder ? placeholder.nextSibling : select.firstChild);
    }
    return;
  }
  existingTodas?.remove();
}

function filterSelect() {
  const select = document.getElementById('progSup');
  if (!select || !state.ready) return;

  if (!state.restricted) return;

  addAllowedOptions(select);

  if (!state.allowedLabels.length) {
    select.value = '';
    select.disabled = true;
    setFeedback('Seu usuário está como Gestor, mas não possui supervisão liberada.', 'error');
    return;
  }

  let visibleCount = 0;
  let firstAllowed = '';
  [...select.options].forEach((option) => {
    if (!option.value || option.value === TODAS_SUPERVISOES) {
      option.hidden = false;
      option.disabled = false;
      return;
    }
    const allowed = optionAllowed(option.textContent || option.value);
    option.hidden = !allowed;
    option.disabled = !allowed;
    if (allowed) {
      visibleCount += 1;
      if (!firstAllowed) firstAllowed = option.value;
    }
  });

  ensureTodasOption(select, visibleCount);

  if (!visibleCount) {
    select.value = '';
    select.disabled = true;
    setFeedback('Nenhuma supervisão liberada para este usuário foi encontrada no seletor.', 'error');
    return;
  }

  const defaultValue = visibleCount > 1 ? TODAS_SUPERVISOES : firstAllowed;

  // Importante: não dispara "change" ao corrigir/selecionar automaticamente.
  // programacao-gestor-ajustes.js trata qualquer change como ação do gestor e
  // chama renderIdle(), o que apagava a programação já carregada e causava o
  // efeito de piscar/reiniciar. A seleção automática só ajusta o valor.
  if (!select.value || select.selectedOptions?.[0]?.disabled || (select.value === TODAS_SUPERVISOES && visibleCount === 1)) {
    select.value = defaultValue;
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
    console.warn('[programacao-gestor-filtro] app_usuarios:', error);
    return null;
  }
  return data || null;
}

async function getRelationSupervisoes() {
  try {
    const { data, error } = await supabase.rpc('programacao_listar_supervisoes');
    if (error) throw error;
    return (data || []).map((row) => row.nome || row.supervisao).filter(Boolean);
  } catch (error) {
    console.warn('[programacao-gestor-filtro] relação de supervisões:', error);
    return [];
  }
}

async function initAccess() {
  try {
    const user = await getCurrentUser().catch(() => null);
    const [context, appUser, relationRows] = await Promise.all([
      user?.id ? getUserContext(user.id).catch(() => null) : Promise.resolve(null),
      getAppUser(user?.id),
      getRelationSupervisoes(),
    ]);

    Object.assign(state, buildAccess(appUser, context, relationRows), { ready: true });
    filterSelect();
  } catch (error) {
    console.warn('[programacao-gestor-filtro] Falha ao resolver acesso:', error);
    state.ready = true;
  }
}

let scheduled = false;
function scheduleFilter() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    filterSelect();
  });
}

new MutationObserver(scheduleFilter).observe(document.body, { childList: true, subtree: true });
window.addEventListener('load', scheduleFilter);
initAccess();
