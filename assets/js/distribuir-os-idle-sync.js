// Dispara o agente aplicar-distribuicao-os quando o gestor fica 5 min sem
// atividade em Distribuir O.S, troca de tela ou fecha a aba — mesmo padrão
// de solicitar_finalizacao_os_gestor em assets/js/programacao-runtime-fixes.js.
// Substitui o cron fixo de 15 min (ver supabase/migrations/20260810160100_*).
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseClient.js';

const IDLE_MS = 5 * 60 * 1000;
const RPC = 'solicitar_aplicar_distribuicao_os';

function routeName() {
  return String(window.location.pathname || '')
    .split('/')
    .filter(Boolean)
    .pop()
    ?.replace(/\.html$/i, '')
    .toLowerCase() || '';
}

function initDistribuirOsAgentTrigger() {
  if (window.__distribuirOsAgentTrigger) return window.__distribuirOsAgentTrigger;

  const state = {
    lastRoute: routeName(),
    dirty: routeName() === 'distribuir-os',
    idleTimer: null,
    requestInFlight: null,
    accessToken: null,
    lastDispatchAt: 0,
  };

  function clearIdleTimer() {
    if (state.idleTimer) clearTimeout(state.idleTimer);
    state.idleTimer = null;
  }

  function armIdleTimer() {
    clearIdleTimer();
    if (routeName() !== 'distribuir-os' || !state.dirty) return;
    state.idleTimer = setTimeout(() => {
      dispatchAgent('inatividade_5_min').catch(() => {});
    }, IDLE_MS);
  }

  async function refreshToken() {
    try {
      const { data } = await supabase.auth.getSession();
      state.accessToken = data?.session?.access_token || null;
    } catch {
      state.accessToken = null;
    }
  }

  async function dispatchAgent(reason = 'distribuir_os') {
    const now = Date.now();
    if (!state.dirty || state.requestInFlight || now - state.lastDispatchAt < 5000) return null;
    state.lastDispatchAt = now;
    state.requestInFlight = supabase
      .rpc(RPC, { p_motivo: reason })
      .then(({ data, error }) => {
        if (error) throw error;
        if (data?.enfileirado || data?.job_existente) state.dirty = false;
        return data;
      })
      .catch((error) => {
        console.warn('[distribuir-os] falha ao disparar agente de distribuição:', error);
        state.dirty = true;
        throw error;
      })
      .finally(() => {
        state.requestInFlight = null;
        armIdleTimer();
      });
    return state.requestInFlight;
  }

  function dispatchKeepalive(reason = 'saida_distribuir_os_pagehide') {
    if (!state.dirty || !state.accessToken) return;
    const url = `${SUPABASE_URL}/rest/v1/rpc/${RPC}`;
    fetch(url, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${state.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_motivo: reason }),
      keepalive: true,
    }).catch(() => {});
    state.dirty = false;
  }

  function markPending() {
    state.dirty = true;
    armIdleTimer();
  }

  function syncRoute() {
    const current = routeName();
    if (state.lastRoute === 'distribuir-os' && current !== 'distribuir-os') {
      clearIdleTimer();
      dispatchAgent('saida_distribuir_os').catch(() => {});
    }
    if (state.lastRoute !== 'distribuir-os' && current === 'distribuir-os') {
      state.dirty = true;
      armIdleTimer();
    }
    state.lastRoute = current;
  }

  const activityEvents = ['pointerdown', 'keydown', 'input', 'change', 'touchstart', 'wheel'];
  activityEvents.forEach((eventName) => {
    document.addEventListener(eventName, () => {
      if (routeName() === 'distribuir-os' && state.dirty) armIdleTimer();
    }, { capture: true, passive: true });
  });

  window.addEventListener('popstate', () => setTimeout(syncRoute, 0));
  window.addEventListener('pagehide', () => {
    if (routeName() === 'distribuir-os') dispatchKeepalive('saida_distribuir_os_pagehide');
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    state.accessToken = session?.access_token || null;
  });
  refreshToken();
  setInterval(syncRoute, 1000);
  if (state.dirty) armIdleTimer();

  window.__distribuirOsAgentTrigger = { markPending, dispatch: dispatchAgent };
  return window.__distribuirOsAgentTrigger;
}

export const distribuirOsAgentTrigger = initDistribuirOsAgentTrigger();
