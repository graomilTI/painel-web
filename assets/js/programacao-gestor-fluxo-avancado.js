import { renderProgramacaoSemOs } from './programacao-sem-os.js?v=20260811-disponiveis-todos';
import { renderProgramacaoListaDrawer } from './programacao-lista-drawer.js?v=20260820-os-paginadas';
import { renderProgramacaoRecusas } from './programacao-recusas.js?v=20260730-recusas1';
import { TODAS_SUPERVISOES } from './programacao-gestor-filtro-fix.js';

// Programação Gestor (2026-07-21, "lista + painel lateral"): o botão Carregar
// monta 2 abas — O.S. (lista+drawer, programacao-lista-drawer.js) e Sem O.S.
// (renderProgramacaoSemOs, mantido à parte porque não é sobre uma O.S.
// específica, não cabe no modelo de painel lateral). Substitui o antigo
// sistema de 4 abas (Situação/Equipe+Mapa/Despesas/Sem O.S.) — ver
// [[programacao-redesign]] na memória do projeto pro histórico completo.
// O mapa do gestor e o drag-and-drop de colaboradores/motoristas eram
// exclusivos da antiga Aba 2 "Equipe + Mapa", que não existe mais nesta
// tela — removidos em 2026-07-22 (nunca mais eram acionados:
// scheduleEquipeAugment dependia de #peqbOsList, só criado pela antiga
// renderProgramacaoEquipe, também removida).

const state = {
  activeStep: '1',
  renderingAll: false,
  renderToken: 0,
  panes: null,
  lastOptionsKey: '',
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


function debounce(fn, wait = 180) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function injectStyles() {
  if (document.getElementById('programacaoGestorFluxoAvancadoStyles')) return;
  const style = document.createElement('style');
  style.id = 'programacaoGestorFluxoAvancadoStyles';
  style.textContent = `
    .pgc-tabs-shell{display:block;width:100%}
    .pgc-tab-pane[hidden]{display:none!important}
    .pgc-tab-pane.pgc-prelayout{position:absolute!important;left:-100000px!important;top:0!important;width:min(1400px,100vw)!important;display:block!important;visibility:hidden!important;pointer-events:none!important;contain:layout style paint!important}
    .pgc-loading-card{border:1px dashed rgba(52,211,153,.22);border-radius:18px;padding:18px;background:rgba(15,23,42,.18);color:#94a3b8;display:flex;gap:12px;align-items:center}
    .pgc-spinner{width:26px;height:26px;border-radius:999px;border:3px solid rgba(111,208,165,.18);border-top-color:#6fd0a5;animation:pgcSpin .75s linear infinite;flex:0 0 auto}
    @keyframes pgcSpin{to{transform:rotate(360deg)}}

    /* Aba 1: OS em linha, sem cara de card pesado */
    #pgcPane1 .peqb-os-list{gap:6px;max-height:none;overflow:visible;padding-right:0}
    #pgcPane1 .peqs-row{border-radius:10px!important;padding:0!important;background:rgba(2,6,23,.20)!important;border-color:rgba(52,211,153,.12)!important}
    #pgcPane1 .peqs-row .peqb-os2-left{display:grid;grid-template-columns:minmax(120px,.8fr) minmax(220px,1.6fr) 120px 105px auto;gap:8px;align-items:center;padding:8px 10px!important;border:0!important}
    #pgcPane1 .peqs-row .peqb-os2-kpis{display:contents!important}
    #pgcPane1 .peqs-row .peqb-os2-kpi{padding:5px 8px!important;border-radius:8px!important;background:rgba(15,23,42,.42)!important;margin:0!important;min-width:0}
    #pgcPane1 .peqs-row .peqb-os2-kpi span{font-size:8.5px!important;color:#7d8aa3!important}
    #pgcPane1 .peqs-row .peqb-os2-kpi strong{font-size:11.5px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #pgcPane1 .peqs-row .peqb-os2-tagsrow{margin:0!important;justify-content:flex-end}
    #pgcPane1 .peqs-row .peqb-status-strip{margin:0!important;flex-wrap:nowrap}
    #pgcPane1 .peqs-row .peqb-st{height:28px!important;min-width:30px!important;font-size:11px!important}
    @media(max-width:980px){#pgcPane1 .peqs-row .peqb-os2-left{grid-template-columns:1fr 1fr}#pgcPane1 .peqs-row .peqb-os2-tagsrow{justify-content:flex-start}}
    @media(max-width:720px){#pgcPane1 .peqs-row .peqb-os2-left{display:block}#pgcPane1 .peqs-row .peqb-os2-kpis{display:grid!important;grid-template-columns:1fr 1fr}#pgcPane1 .peqs-row .peqb-os2-tagsrow{margin-top:8px!important}}

    /* Aba 2: os 4 KPIs da O.S. (Cliente/Local/Remanescente/OS) numa linha só
       (OS/Rem estreitos, Cliente/Local largos) — o card virou uma coluna só
       (ver .peqb-row.peqb-os2 em programacao-equipe.js), então sobra largura
       de sobra pra caber tudo numa linha em vez do 2x2/flex-wrap de antes
       (pedido do usuário, 2026-07-17). Só reposiciona visualmente
       (grid-column) — a ordem no HTML continua a mesma de sempre, então a
       Aba 1 (#pgcPane1, que trata esses 4 itens como "contents" dentro do
       próprio grid dela) não é afetada. */
    #pgcPane2 .peqb-os2-kpis{display:grid;grid-template-columns:minmax(60px,74px) minmax(220px,1.5fr) minmax(220px,1.5fr) minmax(64px,84px);gap:0}
    /* Tiles com borda própria viravam "caixa dentro de caixa" ao lado uma da
       outra — troca por uma única linha com divisores finos entre colunas
       (pedido do usuário, 2026-07-17: "menos poluído"). */
    #pgcPane2 .peqb-os2-kpi{min-width:0;flex:none;border:0!important;background:transparent!important;border-radius:0!important;padding:0 14px!important}
    #pgcPane2 .peqb-os2-kpi:nth-child(4){padding-left:0!important}
    #pgcPane2 .peqb-os2-kpi:nth-child(1),#pgcPane2 .peqb-os2-kpi:nth-child(2),#pgcPane2 .peqb-os2-kpi:nth-child(3){border-left:1px solid rgba(148,163,184,.14)!important}
    #pgcPane2 .peqb-os2-kpi span{font-size:8.5px!important;color:#7fa596!important}
    #pgcPane2 .peqb-os2-kpi strong{font-weight:750!important}
    /* grid-row:1 explícito em todo mundo — sem isso, o cursor de auto-placement
       do grid manda a OS (coluna 1, mas é o 4º item no HTML) pra uma 2ª linha
       só porque a coluna dela é "menor" que a do item anterior (regra do
       algoritmo de auto-placement pra layout "sparse"). */
    #pgcPane2 .peqb-os2-kpi:nth-child(1){grid-column:2;grid-row:1} /* Cliente */
    #pgcPane2 .peqb-os2-kpi:nth-child(2){grid-column:3;grid-row:1} /* Local de embarque */
    #pgcPane2 .peqb-os2-kpi:nth-child(3){grid-column:4;grid-row:1} /* Remanescente */
    #pgcPane2 .peqb-os2-kpi:nth-child(4){grid-column:1;grid-row:1} /* OS */
    @media(max-width:760px){
      #pgcPane2 .peqb-os2-kpis{grid-template-columns:1fr 1fr}
      #pgcPane2 .peqb-os2-kpi:nth-child(1),#pgcPane2 .peqb-os2-kpi:nth-child(2),#pgcPane2 .peqb-os2-kpi:nth-child(3),#pgcPane2 .peqb-os2-kpi:nth-child(4){grid-column:auto;grid-row:auto}
    }
    /* Local de embarque só tem 2 linhas de verdade (UF+cidade / local) — sem
       isso, cada parte quebrava palavra por palavra quando a coluna era
       estreita, virando 3-4 linhas em vez de 2 (pedido do usuário,
       2026-07-17). Trunca com "..." em vez de quebrar. */
    #pgcPane2 .peqb-os2-kpi .peqb-os2-emb-l1,#pgcPane2 .peqb-os2-kpi .peqb-os2-emb-l2{display:block!important;width:100%!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
    #pgcPane2 .peqb-os2-kpi .peqb-os2-uf{display:inline!important;white-space:nowrap!important}
    #pgcPane2 .peqb-os2-kpi strong br{display:none!important}

    /* Aba 2: lista arrastável + OS — uma janela só (pool + cards de O.S.) com
       rolagem própria, pra não empurrar o mapa (que fica logo abaixo) pra
       baixo conforme a quantidade de O.S. (pedido do usuário, 2026-07-17). */
    .pgc-equipe-split{display:grid;grid-template-columns:minmax(250px,320px) minmax(360px,1fr);gap:12px;align-items:start;max-height:min(560px,calc(100vh - 260px));overflow-y:auto;padding-right:6px;border:1px solid rgba(148,163,184,.14);border-radius:16px}
    @media(max-width:1080px){.pgc-equipe-split{grid-template-columns:1fr}.pgc-colab-pool{position:relative!important;top:auto!important;max-height:none!important}}
    .pgc-colab-pool{position:sticky;top:0;max-height:min(560px,calc(100vh - 260px));overflow:auto;border:1px solid rgba(148,163,184,.16);border-radius:16px;background:rgba(2,6,23,.34);padding:10px}
    .pgc-pool-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
    .pgc-pool-head strong{font-size:12.5px;color:#f8fafc}.pgc-pool-head span{font-size:10.5px;color:#9fb7aa}
    /* Pessoas/Frota — segmentado (inspirado no mockup de referência, 2026-07-21):
       o painel de recursos vira 2 abas em vez de uma lista só misturando
       colaborador e veículo, mais fácil de escanear quando o gestor já sabe
       o que está procurando. */
    .pgc-pool-tabs{display:flex;gap:4px;margin-bottom:8px;border:1px solid rgba(148,163,184,.16);border-radius:10px;padding:3px;background:rgba(2,6,23,.3)}
    .pgc-pool-tab{flex:1 1 0;border:0;border-radius:8px;background:transparent;color:#9fb7aa;font-size:11.5px;font-weight:850;padding:7px 0;cursor:pointer}
    .pgc-pool-tab:hover{color:#dcfce7}
    .pgc-pool-tab.active{background:rgba(22,163,74,.28);color:#dcfce7}
    .pgc-pool-search{width:100%;height:34px;margin:0 0 9px;border:1px solid rgba(148,163,184,.2);border-radius:10px;background:#06130e;color:#eef7f2;padding:0 10px;color-scheme:dark;box-sizing:border-box}
    .pgc-pool-search:focus{outline:none;border-color:rgba(52,211,153,.5)}
    .pgc-colab-list{display:flex;flex-direction:column;gap:6px}
    .pgc-colab-list[hidden]{display:none}
    .pgc-colab-card{display:grid;grid-template-columns:34px 1fr auto;gap:8px;align-items:center;border:1px solid rgba(148,163,184,.14);background:rgba(15,23,42,.55);border-radius:12px;padding:7px 8px;cursor:grab;color:#e2e8f0;user-select:none}
    .pgc-colab-card:hover{border-color:rgba(134,239,172,.42);background:rgba(22,101,52,.16)}
    .pgc-colab-card:active{cursor:grabbing}
    .pgc-colab-card.is-linked{border-color:rgba(34,197,94,.34);background:rgba(22,101,52,.18)}
    .pgc-colab-ico{width:30px;height:30px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-weight:950;font-size:12px;border:1px solid rgba(255,255,255,.75);box-shadow:0 0 0 1px rgba(0,0,0,.35)}
    .pgc-colab-ico.person{background:#eab308;color:#422006}.pgc-colab-card.is-linked .pgc-colab-ico.person{background:#22c55e;color:#052e16}
    .pgc-colab-ico.car{background:#eab308;color:#422006}.pgc-colab-card.is-linked .pgc-colab-ico.car{background:#22c55e;color:#052e16}
    .pgc-colab-main{min-width:0}
    .pgc-colab-name{font-size:12px;font-weight:900;color:#f8fafc;line-height:1.15;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pgc-colab-meta{font-size:10.5px;color:#9fb7aa;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .pgc-colab-tag{flex:0 0 auto;font-size:9.5px;font-weight:850;color:#6fd0a5;white-space:nowrap}
    .pgc-colab-tag.is-linked{color:#7d8aa3}
    .pgc-veiculo-card{cursor:default}
    .pgc-colab-empty{font-size:12px;color:#94a3b8;border:1px dashed rgba(148,163,184,.22);border-radius:12px;padding:12px;text-align:center}
    .peqb-row.pgc-drop-hot{outline:2px dashed rgba(134,239,172,.75);outline-offset:3px;background:rgba(22,101,52,.18)!important}
    .peqb-conf-name.pgc-drop-hot,.peqb-extra-colab.pgc-drop-hot{outline:2px dashed rgba(56,189,248,.75);outline-offset:3px;border-radius:10px}
    .pgc-dnd-note{font-size:10.5px;color:#9fb7aa;line-height:1.35;margin:7px 2px 0}
  `;
  document.head.appendChild(style);
}

function waitForElement(selector, timeout = 12000) {
  const found = document.querySelector(selector);
  if (found) return Promise.resolve(found);
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const obs = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) { obs.disconnect(); resolve(el); return; }
      if (Date.now() - started > timeout) { obs.disconnect(); reject(new Error(selector)); }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  });
}

function setFeedback(text, tone = 'ok') {
  const feedback = document.getElementById('progCtxFeedback');
  if (!feedback) return;
  feedback.className = `feedback mt-16 prog-feedback-${tone}`;
  feedback.textContent = text;
}

function setActiveStep(step) {
  state.activeStep = String(step || '1');
  document.querySelectorAll('#progSteps .stepbtn').forEach((btn) => {
    const ui = btn.dataset.uiStep || btn.dataset.step || '';
    btn.classList.toggle('active', ui === state.activeStep || (!ui && btn.textContent.trim().startsWith(state.activeStep)));
  });
  if (state.panes) {
    Object.entries(state.panes).forEach(([key, pane]) => { pane.hidden = key !== state.activeStep; });
  }
  // Além do refresh disparado ao editar a equipe, confira novamente ao abrir
  // Sem O.S. para absorver vínculos feitos por outro usuário/dispositivo.
  // Não aguardamos a rede: a troca visual da aba continua instantânea.
  if (state.activeStep === '2' && typeof window.__pgcSilentRefreshSemOs === 'function') {
    window.__pgcSilentRefreshSemOs().catch((error) => {
      console.warn('[programacao-fluxo] refresh Sem O.S.:', error);
    });
  }
  // O aquecimento de layout (ver prelayoutInactivePanes abaixo) só rodava
  // 1x, logo após "Carregar" — aquecia a aba que estava inativa NAQUELE
  // momento (normalmente a 2). A aba que ficava ativa (a 1) nunca era
  // aquecida, então só a 1ª troca (1→2) ficava fluida; a volta (2→1) não,
  // porque a aba 1 tinha acabado de ser escondida sem re-aquecimento
  // (reportado pela usuária, 2026-07-23: "fluida independente da direção").
  // Chamando aqui também, toda troca de aba re-aquece quem acabou de ficar
  // oculta, deixando a PRÓXIMA troca de volta igualmente fluida.
  prelayoutInactivePanes();
}

// `hidden` evita trabalho enquanto os dados das duas abas são montados, mas
// também faz o navegador adiar o primeiro layout da aba oculta até o clique.
// Em listas grandes esse layout aparecia para o usuário como uma transição
// lenta entre O.S. e Sem O.S. Aquecemos a aba pronta durante o tempo ocioso;
// depois disso o clique abaixo só alterna visibilidade.
function prelayoutInactivePanes() {
  const run = () => {
    if (!state.panes || state.renderingAll) return;
    Object.entries(state.panes).forEach(([key, pane]) => {
      if (!pane || key === state.activeStep || !pane.hidden) return;
      pane.classList.add('pgc-prelayout');
      pane.hidden = false;
      // Leitura intencional: força o cálculo de layout fora do clique.
      void pane.getBoundingClientRect().height;
      pane.hidden = true;
      pane.classList.remove('pgc-prelayout');
    });
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 800 });
  else window.setTimeout(run, 80);
}

function getContextOptions() {
  const supervisao = document.getElementById('progSup')?.value || '';
  const dataReferencia = document.getElementById('progDataRef')?.value || '';
  const isTodas = supervisao === TODAS_SUPERVISOES;
  const programacaoId = window.__progGetProgramacaoId?.() || null;
  const programacaoIdMap = isTodas ? (window.__progGetProgramacaoIdMap?.() || new Map()) : new Map();
  const supervisoesResolvidas = isTodas ? [...programacaoIdMap.keys()] : [supervisao].filter(Boolean);
  const programacaoIds = isTodas ? [...programacaoIdMap.values()].filter(Boolean) : [programacaoId].filter(Boolean);
  return { supervisao, dataReferencia, programacaoId, programacaoIdMap, supervisoesResolvidas, programacaoIds };
}

function contextReady(opts) { return !!(opts?.supervisao && (opts.programacaoId || opts.programacaoIdMap?.size)); }
function optionsKey(opts) { return [opts.supervisao, opts.dataReferencia, opts.programacaoId || '', [...(opts.programacaoIdMap || new Map()).values()].join(',')].join('|'); }

function loadingHtml(label) {
  return `<div class="pgc-loading-card"><span class="pgc-spinner" aria-hidden="true"></span><div><strong>${esc(label)}</strong><br><span>Carregando dados...</span></div></div>`;
}

function mountShell() {
  const list = document.getElementById('progList');
  if (!list) return null;
  list.innerHTML = `
    <div class="pgc-tabs-shell" id="pgcTabsShell">
      <section class="pgc-tab-pane" id="pgcPane1" data-pgc-pane="1">${loadingHtml('O.S.')}</section>
      <section class="pgc-tab-pane" id="pgcPane2" data-pgc-pane="2" hidden>${loadingHtml('Sem O.S.')}</section>
      <section class="pgc-tab-pane" id="pgcPane3" data-pgc-pane="3" hidden>${loadingHtml('Recusas')}</section>
    </div>`;
  state.panes = {
    '1': document.getElementById('pgcPane1'),
    '2': document.getElementById('pgcPane2'),
    '3': document.getElementById('pgcPane3'),
  };
  setActiveStep(state.activeStep);
  return state.panes;
}

async function renderAllTabs({ force = false } = {}) {
  if (state.renderingAll) return;
  const opts = getContextOptions();
  if (!contextReady(opts)) {
    setFeedback('Selecione a supervisão/data e clique em Carregar.', 'warn');
    return;
  }
  const key = optionsKey(opts);
  if (!force && state.panes && state.lastOptionsKey === key) {
    setActiveStep(state.activeStep);
    return;
  }
  state.renderingAll = true;
  state.lastOptionsKey = key;
  const token = ++state.renderToken;
  const panes = mountShell();
  if (!panes) { state.renderingAll = false; return; }
  setFeedback('Carregando a programação...', 'ok');
  const common = {
    supervisao: opts.supervisao,
    supervisoesResolvidas: opts.supervisoesResolvidas,
    dataReferencia: opts.dataReferencia,
    programacaoId: opts.programacaoId,
    programacaoIdMap: opts.programacaoIdMap,
  };
  try {
    const results = await Promise.allSettled([
      renderProgramacaoListaDrawer(panes['1'], common),
      renderProgramacaoSemOs(panes['2'], common),
      renderProgramacaoRecusas(panes['3'], common),
    ]);
    if (token !== state.renderToken) return;
    const falhas = results.filter((r) => r.status === 'rejected');
    if (falhas.length) {
      falhas.forEach((f) => console.error('[programacao-fluxo] falha ao carregar aba', f.reason));
      setFeedback(`Carregou com ${falhas.length} alerta(s). Confira as abas.`, 'warn');
    } else {
      setFeedback('Programação carregada.', 'ok');
    }
    setActiveStep(state.activeStep);
  } catch (error) {
    console.error('[programacao-fluxo] renderAllTabs:', error);
    setFeedback(error.message || 'Erro ao carregar as abas.', 'error');
  } finally {
    state.renderingAll = false;
  }
}

window.__pgcProgramacaoReload = () => renderAllTabs({ force: true });

function hookStepClicks() {
  document.addEventListener('click', (event) => {
    const btn = event.target.closest('#progSteps .stepbtn');
    if (!btn || !state.panes) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const ui = btn.dataset.uiStep || btn.dataset.step || (btn.textContent.match(/\d/) || ['1'])[0];
    setActiveStep(ui);
  }, true);
}

// Espera window.__progLoadColaboradoresPromise (setada pelo próprio clique em
// programacao.js, ver bindEvents lá) em vez de adivinhar com setTimeout. Numa
// data nunca usada antes (programar adiantado) ensureProgramacaoDia() precisa
// criar a linha em programacao_dia — mais lento que reaproveitar uma
// existente — e os 3 timers fixos (650/1250/2100ms) do fluxo antigo podiam
// disparar renderAllTabs() ANTES do contexto (programacaoId da nova data)
// estar pronto: contextReady() falhava, a tela ficava com o conteúdo da data
// anterior (mountShell nunca rodava) e os botões de ação, presos a
// data-os/data-status da O.S. antiga, pareciam "não responder". poll curto
// como rede de segurança caso a promise ainda não tenha sido setada (ordem
// de anexação dos listeners no mesmo clique).
async function waitLoadColaboradores() {
  for (let tentativa = 0; tentativa < 20 && !window.__progLoadColaboradoresPromise; tentativa += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  try { await window.__progLoadColaboradoresPromise; } catch (error) { console.warn('[programacao-fluxo] loadContext falhou', error); }
}

function hookLoadButton() {
  const loadBtn = document.getElementById('progLoadContext');
  if (!loadBtn || loadBtn.dataset.pgcAllTabsBound === '1') return;
  loadBtn.dataset.pgcAllTabsBound = '1';
  loadBtn.addEventListener('click', async () => {
    state.panes = null;
    state.lastOptionsKey = '';
    setFeedback('Carregando contexto e preparando a programação...', 'ok');
    await waitLoadColaboradores();
    await renderAllTabs({ force: true });
  }, false);
}

function observeEquipePane() {
  const obs = new MutationObserver(debounce(() => hookLoadButton(), 220));
  obs.observe(document.documentElement, { childList: true, subtree: true });
}

function boot() {
  injectStyles();
  hookStepClicks();
  observeEquipePane();
  waitForElement('#progLoadContext').then(() => hookLoadButton()).catch(() => {});
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
