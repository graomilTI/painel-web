import { supabase } from './supabaseClient.js';

// Programação > O.S. — correção de consistência da lista.
//
// 1) programacao-lista-drawer.js mantém os filtros em um state de módulo. Quando
//    o contexto é remontado, os inputs voltam visualmente vazios, mas o state
//    antigo continuava filtrando a lista. O resultado era uma O.S. válida
//    desaparecer mesmo com a tela mostrando "Todos"/busca vazia.
//    Cada NOVA montagem dos controles agora dispara os próprios eventos do
//    drawer com os valores padrão, mantendo DOM e state sempre sincronizados.
//
// 2) operacional_os passa a atualizar a Programação via Supabase Realtime.
//    Assim uma O.S. importada/corrigida depois que o gestor abriu a tela entra
//    sem depender de um novo clique manual em Carregar.

function limparFiltrosDaNovaMontagem() {
  const busca = document.getElementById('pldBusca');
  if (!busca || busca.dataset.osFiltrosFix === '1') return;

  // O elemento é recriado a cada renderProgramacaoListaDrawer(). Marcar o
  // próprio input evita zerar filtros durante renderLista(), que só redesenha
  // a tabela e deve preservar a escolha feita pelo usuário.
  busca.dataset.osFiltrosFix = '1';

  queueMicrotask(() => {
    if (!busca.isConnected) return;

    const cliente = document.getElementById('pldCliente');
    const cidade = document.getElementById('pldCidade');
    const local = document.getElementById('pldLocal');
    const remanescente = document.getElementById('pldSoRemanescente');

    // Os listeners abaixo pertencem ao próprio drawer e atualizam o state
    // privado do módulo. Mesmo que o valor visual já seja vazio, o evento é
    // necessário para apagar um valor que tenha ficado no state anterior.
    busca.value = '';
    busca.dispatchEvent(new Event('input', { bubbles: true }));

    [cliente, cidade, local].forEach((select) => {
      if (!select) return;
      select.value = '';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    if (remanescente) {
      remanescente.checked = false;
      remanescente.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}

let filtrosScheduled = false;
function scheduleLimpezaFiltros() {
  if (filtrosScheduled) return;
  filtrosScheduled = true;
  queueMicrotask(() => {
    filtrosScheduled = false;
    limparFiltrosDaNovaMontagem();
  });
}

new MutationObserver(scheduleLimpezaFiltros).observe(document.body, {
  childList: true,
  subtree: true,
});
window.addEventListener('load', scheduleLimpezaFiltros);
scheduleLimpezaFiltros();

function norm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function supervisoesDoContexto() {
  const selecionada = String(document.getElementById('progSup')?.value || '').trim();
  if (!selecionada) return [];

  if (selecionada !== '__TODAS__') return [selecionada];

  try {
    const map = window.__progGetProgramacaoIdMap?.();
    if (map instanceof Map) return [...map.keys()].filter(Boolean);
  } catch (_) {}
  return [];
}

function eventoPertenceAoContexto(payload) {
  const supervisoes = new Set(supervisoesDoContexto().map(norm).filter(Boolean));
  if (!supervisoes.size) return false;

  const supervisaoEvento = norm(payload?.new?.supervisao || payload?.old?.supervisao || '');
  if (supervisaoEvento) return supervisoes.has(supervisaoEvento);

  // DELETE pode chegar sem as colunas antigas quando a tabela não usa
  // REPLICA IDENTITY FULL. Nesse caso é mais seguro atualizar a lista atual.
  return payload?.eventType === 'DELETE';
}

let reloadTimer = null;
let ultimoReload = 0;
function agendarReload(payload) {
  if (!eventoPertenceAoContexto(payload)) return;

  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    const reload = window.__pgcProgramacaoReload;
    if (typeof reload !== 'function') return;

    const agora = Date.now();
    if (agora - ultimoReload < 700) return;
    ultimoReload = agora;

    Promise.resolve(reload()).catch((error) => {
      console.warn('[programacao-os-live] falha ao atualizar lista:', error);
    });
  }, 350);
}

if (!window.__programacaoOsLiveFix) {
  const channel = supabase
    .channel('programacao-operacional-os-live-v1')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'operacional_os' },
      agendarReload,
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[programacao-os-live] canal Realtime indisponível:', status);
      }
    });

  window.__programacaoOsLiveFix = { channel };

  window.addEventListener('beforeunload', () => {
    try { supabase.removeChannel(channel); } catch (_) {}
  }, { once: true });
}
