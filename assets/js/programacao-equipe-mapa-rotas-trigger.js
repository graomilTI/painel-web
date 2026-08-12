// Dispara o recálculo de operacional_mapa_rotas (camadas Colaborador/Veículo/
// Rota do Mapa Operacional — Operacional > Mapa) quando o gestor marca O.S.
// como ATENDER na tela de Equipe (programacao-equipe.js:atualizarStatusOsCore).
//
// Antes disso a Edge Function operacional-mapa-rotas só era chamada pelo
// antigo "Salvar programação" de despesas (programacao.js), fluxo que na
// prática parou de ser o caminho usado dia a dia pro gestor marcar ATENDER —
// resultado: O.S. continuavam aparecendo no Mapa (pontos verdes), mas
// Colaborador/Veículo/Rota ficavam vazios porque a tabela de rotas nunca era
// recalculada (achado 11/08, última linha gerada em 07/08).
//
// Mesmo padrão idle/troca-de-tela/fechar-aba já usado por
// solicitar_finalizacao_os_gestor (programacao-runtime-fixes.js) e por
// aplicar-distribuicao-os (programacao-equipe.js:enfileirarDistribuicaoOs):
// acumula supervisão+data pendentes e dispara em lote depois de 5 min parado,
// ao trocar de tela ou ao fechar a aba — evita 1 chamada por clique.
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseClient.js';

const IDLE_MS = 5 * 60 * 1000;
const FUNC_URL = `${SUPABASE_URL}/functions/v1/operacional-mapa-rotas`;

const pendentes = new Map(); // supervisao -> dataReferencia
let idleTimer = null;
let inFlight = null;
let accessToken = null;

function clearIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
}

function armIdleTimer() {
  clearIdleTimer();
  if (!pendentes.size) return;
  idleTimer = setTimeout(() => { dispatch('inatividade_5_min').catch(() => {}); }, IDLE_MS);
}

async function dispatch(motivo = 'equipe_atender') {
  if (!pendentes.size) return null;
  if (inFlight) return inFlight;
  const lote = [...pendentes.entries()];
  pendentes.clear();
  inFlight = Promise.all(lote.map(([supervisao, dataReferencia]) =>
    supabase.functions.invoke('operacional-mapa-rotas', { body: { supervisao, dataReferencia } })
      .then(({ error }) => { if (error) throw error; })
      .catch((error) => {
        console.warn(`[programacao-equipe] operacional-mapa-rotas (${motivo}) falhou para ${supervisao}:`, error);
        if (!pendentes.has(supervisao)) pendentes.set(supervisao, dataReferencia);
      })
  )).finally(() => {
    inFlight = null;
    armIdleTimer();
  });
  return inFlight;
}

export function marcarMapaRotasPendente(supervisao, dataReferencia) {
  if (!supervisao || !dataReferencia) return;
  pendentes.set(supervisao, dataReferencia);
  armIdleTimer();
}

const activityEvents = ['pointerdown', 'keydown', 'input', 'change', 'touchstart', 'wheel'];
activityEvents.forEach((eventName) => {
  document.addEventListener(eventName, () => { if (pendentes.size) armIdleTimer(); }, { capture: true, passive: true });
});

// Best-effort ao fechar a aba/navegar pra fora — sem esperar resposta, via
// fetch com keepalive (supabase.functions.invoke não expõe essa opção).
window.addEventListener('pagehide', () => {
  if (!pendentes.size || !accessToken) return;
  const lote = [...pendentes.entries()];
  pendentes.clear();
  clearIdleTimer();
  lote.forEach(([supervisao, dataReferencia]) => {
    fetch(FUNC_URL, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ supervisao, dataReferencia }),
      keepalive: true,
    }).catch(() => {});
  });
});

supabase.auth.onAuthStateChange((_event, session) => { accessToken = session?.access_token || null; });
supabase.auth.getSession().then(({ data }) => { accessToken = data?.session?.access_token || null; }).catch(() => {});
