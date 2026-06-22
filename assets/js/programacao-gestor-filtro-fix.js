import { supabase } from './supabaseClient.js';
import { getCurrentUser, getUserContext } from './auth.js';

const state = {
  ready: false,
  restricted: false,
  allowedLabels: [],
  tokens: [],
  feedback: '',
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

function buildAccess(appUser, context) {
  const labels = [
    ...parseList(appUser?.supervisao),
    ...parseList(appUser?.supervisoes),
    ...parseList(appUser?.supervisao_liberada),
    ...parseList(appUser?.supervisoes_liberadas),
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
    allowedLabels: [...new Set(labels)],
    tokens: [...new Set([...fullTokens, ...wordTokens])],
  };
}

function optionAllowed(optionText) {
  if (!state.restricted) return true;
  const key = norm(optionText);
  if (!key) return true;
  return state.tokens.some((token) => token && (key === token || key.includes(token) || token.includes(key)));
}

function setFeedback(message, type = 'ok') {
  const feedback = document.getElementById('progCtxFeedback');
  if (!feedback || !message) return;
  feedback.className = `feedback mt-16 prog-feedback-${type}`;
  feedback.textContent = message;
}

function filterSelect() {
  const select = document.getElementById('progSup');
  if (!select || !state.ready || !state.restricted) return;

  const options = [...select.options];
  if (options.length <= 1) return;

  let visibleCount = 0;
  let firstAllowed = '';
  for (const option of options) {
    if (!option.value) {
      option.hidden = false;
      option.disabled = false;
      continue;
    }
    const allowed = optionAllowed(option.textContent || option.value);
    option.hidden = !allowed;
    option.disabled = !allowed;
    if (allowed) {
      visibleCount += 1;
      if (!firstAllowed) firstAllowed = option.value;
    }
  }

  if (!visibleCount) {
    select.value = '';
    select.disabled = true;
    setFeedback('Seu usuário está como Gestor, mas nenhuma supervisão da regional liberada foi encontrada. Verifique app_usuarios.coordenacao/supervisao.', 'error');
    return;
  }

  if (!select.value || select.selectedOptions?.[0]?.disabled) {
    select.value = firstAllowed;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  select.disabled = visibleCount === 1;
  setFeedback(`Programação limitada ao login do gestor: ${state.allowedLabels.join(', ')}.`, 'ok');
}

async function initAccess() {
  try {
    const user = await getCurrentUser().catch(() => null);
    const [context, userRes] = await Promise.all([
      user?.id ? getUserContext(user.id).catch(() => null) : Promise.resolve(null),
      supabase
        .from('app_usuarios')
        .select('id,nome,email,setor,supervisao,coordenacao,status')
        .eq('auth_user_id', user?.id || '')
        .maybeSingle(),
    ]);

    const appUser = userRes?.data || null;
    Object.assign(state, buildAccess(appUser, context), { ready: true });
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
