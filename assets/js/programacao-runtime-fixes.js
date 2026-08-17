import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseClient.js';

const CASA_ICON = '<svg viewBox="0 0 48 48"><path d="M7 24L24 10l17 14"/><path d="M13 22v17h22V22"/><path d="M20 39V28h8v11"/></svg>';
const FINALIZAR_IDLE_MS = 5 * 60 * 1000;
const FINALIZAR_RPC = 'solicitar_finalizacao_os_gestor';

function routeName() {
  return String(window.location.pathname || '')
    .split('/')
    .filter(Boolean)
    .pop()
    ?.replace(/\.html$/i, '')
    .toLowerCase() || '';
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function injectStyles() {
  if (document.getElementById('programacaoRuntimeFixesStyles')) return;
  const style = document.createElement('style');
  style.id = 'programacaoRuntimeFixesStyles';
  style.textContent = `
    .prog-estadia-selector{grid-template-columns:repeat(4,minmax(72px,1fr))!important;min-width:340px!important}
    @media(max-width:680px){.prog-estadia-selector{grid-template-columns:repeat(2,minmax(96px,1fr))!important;min-width:220px!important}}
  `;
  document.head.appendChild(style);
}

function field(tr, name) {
  return tr?.querySelector(`[data-field="${name}"]`) || null;
}

function clearCasaFields(tr) {
  ['cidade', 'uf', 'alojamento_id', 'alojamento_nome', 'checkin', 'checkout'].forEach((name) => {
    const input = field(tr, name);
    if (input) input.value = '';
  });
}

function ensureCasaButton(selector) {
  const tr = selector.closest('tr[data-table="programacao_estadia"]');
  const hidden = field(tr, 'tipo_estadia');
  if (!tr || !hidden) return;

  const blocked = Boolean(selector.querySelector('.prog-estadia-card:disabled'));
  let casa = selector.querySelector('[data-estadia-tipo="CASA"]');
  if (!casa) {
    casa = document.createElement('button');
    casa.type = 'button';
    casa.className = 'prog-estadia-card';
    casa.dataset.estadiaTipo = 'CASA';
    casa.innerHTML = `${CASA_ICON}<span>Casa</span>`;
    selector.insertBefore(casa, selector.firstElementChild);
  }
  casa.disabled = blocked;

  if (!normalize(hidden.value)) hidden.value = 'CASA';
  const current = normalize(hidden.value) || 'CASA';
  selector.querySelectorAll('.prog-estadia-card[data-estadia-tipo]').forEach((btn) => {
    btn.classList.toggle('active', normalize(btn.dataset.estadiaTipo) === current);
  });

  const note = tr.querySelector('.prog-required-note');
  if (note && /Casa \(nenhuma op(?:ç|c)ão selecionada\)/i.test(note.textContent || '')) {
    note.textContent = 'Casa selecionada: não gera hospedagem.';
  }
}

function patchEstadiaRows(content) {
  content.querySelectorAll('.prog-estadia-selector').forEach(ensureCasaButton);
}

function bindClickGuard(content) {
  if (content.dataset.programacaoRuntimeFixesClickGuard === '1') return;
  content.dataset.programacaoRuntimeFixesClickGuard = '1';

  content.addEventListener('click', (event) => {
    const btn = event.target.closest('.prog-estadia-card[data-estadia-tipo]');
    if (!btn || !content.contains(btn)) return;

    const tr = btn.closest('tr[data-table="programacao_estadia"]');
    const hidden = field(tr, 'tipo_estadia');
    if (!tr || !hidden) return;

    const tipo = normalize(btn.dataset.estadiaTipo) || 'CASA';

    // O script original alternava o botão ativo para vazio ao clicar de novo.
    // Isso deixava "Casa" sem valor real e fazia a validação travar a etapa B.
    if (!btn.classList.contains('active')) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    hidden.value = tipo;
    tr.querySelectorAll('.prog-estadia-card[data-estadia-tipo]').forEach((card) => {
      card.classList.toggle('active', card === btn);
    });

    if (tipo === 'CASA') clearCasaFields(tr);
    const note = tr.querySelector('.prog-required-note');
    if (note) note.textContent = tipo === 'CASA' ? 'Casa selecionada: não gera hospedagem.' : '';

    hidden.dispatchEvent(new Event('input', { bubbles: true }));
  }, true);
}

function initFinalizacaoAgentTrigger() {
  if (window.__programacaoFinalizacaoAgentTrigger) return;

  const state = {
    lastRoute: routeName(),
    dirty: routeName() === 'programacao',
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
    if (routeName() !== 'programacao' || !state.dirty) return;
    state.idleTimer = setTimeout(() => {
      dispatchAgent('inatividade_5_min').catch(() => {});
    }, FINALIZAR_IDLE_MS);
  }

  async function refreshToken() {
    try {
      const { data } = await supabase.auth.getSession();
      state.accessToken = data?.session?.access_token || null;
    } catch {
      state.accessToken = null;
    }
  }

  async function dispatchAgent(reason = 'programacao') {
    const now = Date.now();
    if (!state.dirty || state.requestInFlight || now - state.lastDispatchAt < 5000) return null;
    state.lastDispatchAt = now;
    state.requestInFlight = supabase
      .rpc(FINALIZAR_RPC, { p_motivo: reason })
      .then(({ data, error }) => {
        if (error) throw error;
        const pending = Number(data?.pendencias || 0);
        state.dirty = pending > 0 && data?.enfileirado !== true;
        if (data?.enfileirado || data?.job_existente) state.dirty = false;
        return data;
      })
      .catch((error) => {
        console.warn('[programacao] falha ao disparar agente de finalização:', error);
        state.dirty = true;
        throw error;
      })
      .finally(() => {
        state.requestInFlight = null;
        armIdleTimer();
      });
    return state.requestInFlight;
  }

  function dispatchKeepalive(reason = 'saida_programacao') {
    if (!state.dirty || !state.accessToken) return;
    const url = `${SUPABASE_URL}/rest/v1/rpc/${FINALIZAR_RPC}`;
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
    if (state.lastRoute === 'programacao' && current !== 'programacao') {
      clearIdleTimer();
      dispatchAgent('saida_programacao').catch(() => {});
    }
    if (state.lastRoute !== 'programacao' && current === 'programacao') {
      state.dirty = true;
      armIdleTimer();
    }
    state.lastRoute = current;
  }

  const activityEvents = ['pointerdown', 'keydown', 'input', 'change', 'touchstart', 'wheel'];
  activityEvents.forEach((eventName) => {
    document.addEventListener(eventName, () => {
      if (routeName() === 'programacao' && state.dirty) armIdleTimer();
    }, { capture: true, passive: true });
  });

  document.addEventListener('click', (event) => {
    const finalizeBtn = event.target.closest?.('[data-acao-status="FINALIZAR"]');
    if (finalizeBtn) markPending();
    setTimeout(syncRoute, 0);
    setTimeout(syncRoute, 300);
  }, true);

  window.addEventListener('popstate', () => setTimeout(syncRoute, 0));
  window.addEventListener('pagehide', () => {
    if (routeName() === 'programacao') dispatchKeepalive('saida_programacao_pagehide');
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    state.accessToken = session?.access_token || null;
  });
  refreshToken();
  setInterval(syncRoute, 1000);
  if (state.dirty) armIdleTimer();

  window.__programacaoFinalizacaoAgentTrigger = {
    markPending,
    dispatch: dispatchAgent,
  };
}

// FINALIZAR agora é uma solicitação manual: o status salvo pela Programação
// alimenta Logística > O.S. > Finalização. O agente só é enfileirado pelo
// Check da Logística, portanto não há disparo por inatividade ou saída da tela.

export function initProgramacaoRuntimeFixes(content = document.getElementById('pageContent')) {
  if (!content || routeName() !== 'programacao') return;

  injectStyles();
  patchEstadiaRows(content);
  bindClickGuard(content);

  if (content.dataset.programacaoRuntimeFixesObserver === '1') return;
  content.dataset.programacaoRuntimeFixesObserver = '1';

  const observer = new MutationObserver(() => patchEstadiaRows(content));
  observer.observe(content, { childList: true, subtree: true });
}
