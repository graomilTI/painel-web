// Publica a versão de despesas da Programação para a fila do agente GRM.
// Gatilhos: 5 min sem edição, Salvar programação, troca de tela/contexto e
// fechamento da aba. As alterações de cada campo continuam sendo gravadas
// pelos módulos atuais; esta camada só fecha uma versão depois do período de
// estabilidade e não interfere no autosave existente.
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseClient.js';

const FUNCTION_NAME = 'grm-liberacao-despesas-publicar';
const IDLE_MS = 5 * 60 * 1000;
const SETTLE_MS = 1200;

let idleTimer = null;
let dirty = false;
let publishing = false;
let cachedAccessToken = '';
let cachedContext = { ids: [], key: '' };
let lastPublishedKey = '';
let lastPublishedAt = 0;

function unique(values) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function getProgramacaoIds() {
  try {
    const idMap = window.__progGetProgramacaoIdMap?.();
    if (idMap && typeof idMap.values === 'function') {
      const values = unique([...idMap.values()]);
      if (values.length) return values;
    }
  } catch (_) {}

  try {
    return unique([window.__progGetProgramacaoId?.()]);
  } catch (_) {
    return [];
  }
}

function contextKey(ids = getProgramacaoIds()) {
  const date = document.getElementById('progDataRef')?.value || '';
  const regional = document.getElementById('progSup')?.value || '';
  return `${unique(ids).sort().join(',')}|${date}|${regional}`;
}

function refreshContextSnapshot() {
  const ids = getProgramacaoIds();
  if (ids.length) cachedContext = { ids, key: contextKey(ids) };
  return cachedContext;
}

async function refreshToken() {
  try {
    const { data } = await supabase.auth.getSession();
    cachedAccessToken = data?.session?.access_token || cachedAccessToken || '';
  } catch (_) {}
  return cachedAccessToken;
}

function shouldMarkDirty(target, eventType) {
  if (!(target instanceof Element)) return false;
  // O drawer de Lista de OS é montado diretamente no <body>, fora de
  // #pageContent. As ações mais importantes (ATENDER e vincular colaborador)
  // acontecem nele e antes não armavam a publicação após 5 minutos.
  if (!target.closest('#pageContent, #pldDrawer')) return false;
  if (target.closest('#progSearch, #progGerarPdf, #progLoadContext')) return false;
  if (target.closest('a[href]')) return false;

  if (eventType === 'input' || eventType === 'change') return true;
  if (eventType !== 'click') return false;

  return !!target.closest([
    'button[data-status]',
    'button[data-action]',
    'button[data-ref]',
    'button[data-add-extra]',
    'button[data-remove]',
    'button[data-confirm]',
    'button[data-tipo]',
    '.peqd-chip',
    '.peqb-row-btn',
    '.prog-mini-btn',
    '[data-acao-status]',
    '[data-confirmar-candidato]',
    '[data-add-colab-confirm]',
    '[data-add-frota-confirm]',
    '[data-remover-colab]',
    '[data-disponivel]',
  ].join(','));
}

function scheduleIdlePublish() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    publishVersion('INATIVIDADE_5_MIN', { settleMs: 0 }).catch((error) => {
      console.warn('[programacao-grm-despesas] publicação por inatividade falhou:', error);
    });
  }, IDLE_MS);
}

function markDirty() {
  const ctx = refreshContextSnapshot();
  if (!ctx.ids.length) return;
  dirty = true;
  scheduleIdlePublish();
}

async function publishVersion(reason, { ids, settleMs = SETTLE_MS, force = false } = {}) {
  const selectedIds = unique(ids?.length ? ids : refreshContextSnapshot().ids);
  if (!selectedIds.length) return null;
  if (!force && !dirty) return null;
  if (publishing) return null;

  const key = `${contextKey(selectedIds)}|${reason}`;
  if (!force && key === lastPublishedKey && Date.now() - lastPublishedAt < 15000) return null;

  publishing = true;
  clearTimeout(idleTimer);
  try {
    const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
      body: {
        programacaoIds: selectedIds,
        motivo: reason,
        settleMs,
      },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    dirty = false;
    lastPublishedKey = key;
    lastPublishedAt = Date.now();
    window.dispatchEvent(new CustomEvent('programacao:grm-despesas-publicada', { detail: data }));
    console.info('[programacao-grm-despesas] versão publicada:', data);
    return data;
  } finally {
    publishing = false;
  }
}

async function publishKeepalive(reason, ids) {
  const selectedIds = unique(ids?.length ? ids : refreshContextSnapshot().ids);
  if (!dirty || !selectedIds.length) return;

  const token = cachedAccessToken || await refreshToken();
  if (!token) return;

  // O request é disparado antes de a página trocar/fechar. keepalive permite ao
  // navegador concluir a chamada mesmo depois do documento ser descarregado.
  dirty = false;
  clearTimeout(idleTimer);
  try {
    fetch(`${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`, {
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        programacaoIds: selectedIds,
        motivo: reason,
        settleMs: SETTLE_MS,
      }),
    }).catch((error) => console.warn('[programacao-grm-despesas] keepalive falhou:', error));
  } catch (error) {
    console.warn('[programacao-grm-despesas] não foi possível iniciar o keepalive:', error);
  }
}

function bind() {
  refreshToken();
  supabase.auth.onAuthStateChange((_event, session) => {
    cachedAccessToken = session?.access_token || '';
  });

  // Aguarda o núcleo de Programação expor os getters do contexto.
  const contextPoll = setInterval(() => {
    if (typeof window.__progGetProgramacaoId !== 'function') return;
    refreshContextSnapshot();
    clearInterval(contextPoll);
  }, 250);
  setTimeout(() => clearInterval(contextPoll), 30000);

  document.addEventListener('input', (event) => {
    if (shouldMarkDirty(event.target, 'input')) markDirty();
  }, true);
  document.addEventListener('change', (event) => {
    if (shouldMarkDirty(event.target, 'change')) markDirty();
  }, true);
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    // Capture roda antes do listener do core: publica o contexto anterior sem
    // bloquear a troca de supervisão/data.
    if (target.closest('#progLoadContext')) {
      const previous = { ...cachedContext, ids: [...cachedContext.ids] };
      publishKeepalive('TROCA_DE_TELA', previous.ids);
      setTimeout(refreshContextSnapshot, 1800);
      return;
    }

    if (target.closest('#progSaveProgramacao')) {
      markDirty();
      setTimeout(() => {
        publishVersion('SALVAR_MANUAL', { settleMs: 0, force: true }).catch((error) => {
          console.warn('[programacao-grm-despesas] publicação após salvar falhou:', error);
        });
      }, 1600);
      return;
    }

    const anchor = target.closest('a[href]');
    if (anchor) {
      try {
        const url = new URL(anchor.href, window.location.href);
        if (url.origin === window.location.origin && url.href !== window.location.href) {
          publishKeepalive('TROCA_DE_TELA', cachedContext.ids);
        }
      } catch (_) {}
      return;
    }

    if (shouldMarkDirty(target, 'click')) markDirty();
  }, true);

  window.addEventListener('pagehide', () => {
    publishKeepalive('FECHAMENTO_JANELA', cachedContext.ids);
  });
  window.addEventListener('beforeunload', () => {
    publishKeepalive('FECHAMENTO_JANELA', cachedContext.ids);
  });

  window.__publicarGrmLiberacaoDespesas = (motivo = 'SALVAR_MANUAL') =>
    publishVersion(motivo, { force: true, settleMs: 0 });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
else bind();
