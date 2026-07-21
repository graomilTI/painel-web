import { supabase } from './supabaseClient.js';
import { logActivity } from './activityLogger.js';
import { renderProgramacaoEquipe, renderProgramacaoSituacao } from './programacao-equipe.js?v=20260721-mockupredesign1';
import { renderProgramacaoDespesas } from './programacao-despesas.js?v=20260721-alojcombo1';
import { renderProgramacaoSemOs } from './programacao-sem-os.js?v=20260720-supfix1';
import { TODAS_SUPERVISOES } from './programacao-gestor-filtro-fix.js';

// Programação Gestor — fluxo avançado:
// - o botão Carregar monta as 4 abas de uma vez;
// - Aba 1 fica em linhas compactas de O.S.;
// - Aba 2 ganha lista lateral arrastável de colaboradores/motoristas;
// - vínculos feitos por arrastar alimentam a Aba 3 automaticamente.

const state = {
  activeStep: '1',
  renderingAll: false,
  renderToken: 0,
  panes: null,
  lastOptionsKey: '',
  motoristasCacheKey: '',
  motoristasCache: [],
  poolTab: 'pessoas',
  veiculosCacheKey: '',
  veiculosCache: [],
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function cpfNorm(value) { return String(value || '').replace(/\D/g, ''); }
function onlyPlate(value) { return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7); }
function todayIso() { const n = new Date(); return new Date(n.getTime() - n.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

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
  // O mapa arrastável da Etapa 2 (#peqbMapBand) só abre quando alguém chama
  // window.__pmgRenderMapaGestor, exposto por programacao-gestor-hotfix-manual-v3.js.
  // O clique no botão de etapa é interceptado aqui via stopImmediatePropagation
  // antes de chegar no listener de clique daquele arquivo — sem este gatilho o
  // mapa nunca abre sozinho ao trocar de aba, só a lista lateral de arrastar.
  if (state.activeStep === '2') window.__pmgRenderMapaGestor?.();
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
      <section class="pgc-tab-pane" id="pgcPane1" data-pgc-pane="1">${loadingHtml('Aba 1 · Situação da O.S.')}</section>
      <section class="pgc-tab-pane" id="pgcPane2" data-pgc-pane="2" hidden>${loadingHtml('Aba 2 · Equipe + mapa')}</section>
      <section class="pgc-tab-pane" id="pgcPane3" data-pgc-pane="3" hidden>${loadingHtml('Aba 3 · Despesas')}</section>
      <section class="pgc-tab-pane" id="pgcPane4" data-pgc-pane="4" hidden>${loadingHtml('Aba 4 · Sem O.S.')}</section>
    </div>`;
  state.panes = {
    '1': document.getElementById('pgcPane1'),
    '2': document.getElementById('pgcPane2'),
    '3': document.getElementById('pgcPane3'),
    '4': document.getElementById('pgcPane4'),
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
  setFeedback('Carregando as 4 abas da programação...', 'ok');
  const common = {
    supervisao: opts.supervisao,
    supervisoesResolvidas: opts.supervisoesResolvidas,
    dataReferencia: opts.dataReferencia,
    programacaoId: opts.programacaoId,
    programacaoIdMap: opts.programacaoIdMap,
  };
  try {
    const results = await Promise.allSettled([
      renderProgramacaoSituacao(panes['1'], common),
      renderProgramacaoEquipe(panes['2'], { ...common, autoPreencher: false }),
      renderProgramacaoDespesas(panes['3'], common),
      renderProgramacaoSemOs(panes['4'], common),
    ]);
    if (token !== state.renderToken) return;
    const falhas = results.filter((r) => r.status === 'rejected');
    if (falhas.length) {
      falhas.forEach((f) => console.error('[programacao-fluxo] falha ao carregar aba', f.reason));
      setFeedback(`Carregou com ${falhas.length} alerta(s). Confira as abas.`, 'warn');
    } else {
      setFeedback('As 4 abas foram carregadas.', 'ok');
    }
    setActiveStep(state.activeStep);
    scheduleEquipeAugment(250);
  } catch (error) {
    console.error('[programacao-fluxo] renderAllTabs:', error);
    setFeedback(error.message || 'Erro ao carregar as abas.', 'error');
  } finally {
    state.renderingAll = false;
  }
}

window.__pgcProgramacaoReload = () => renderAllTabs({ force: true });

// Refresh pós-vínculo (drag do pool de colaboradores): usa o mesmo caminho
// leve já comprovado pelo drag no mapa e pelo botão "+" nativo
// (window.__peqbSilentRefresh, ver programacao-equipe.js) em vez de
// renderAllTabs({force:true}) — que remonta as 3 abas e o mapa Leaflet do
// zero e pode ser descartado silenciosamente pela trava de reentrância de
// renderAllTabs se outro render estiver em andamento. Cai pro remount
// completo só se o bridge ainda não existir (pane 2 nunca foi aberta).
async function refreshAposVinculo() {
  if (window.__peqbSilentRefresh) {
    await Promise.all([window.__peqbSilentRefresh(), window.__pgcRefreshDespesas?.()]);
  } else {
    await renderAllTabs({ force: true });
  }
}

// Atualização parcial da Aba 3 (Despesas), usada por
// programacao-gestor-hotfix-manual-v3.js depois de um vínculo feito pelo
// mapa: o roster de despesas depende de quem está confirmado em
// programacao_equipe, então precisa buscar de novo — diferente das Abas 1/2,
// que já são atualizadas por outros caminhos (silentRefresh, mapa) sem
// precisar tocar na Aba 3. Não passa por mountShell/renderAllTabs pra não
// recriar as Abas 1/2 (e o mapa Leaflet vivo dentro da Aba 2) à toa.
window.__pgcRefreshDespesas = async () => {
  if (!state.panes?.['3']) return;
  // Refresh sem remontar a aba (mantém a rolagem — ver
  // window.__pgcSilentRefreshDespesas em programacao-despesas.js). Só cai pro
  // remount completo se a aba 3 nunca chegou a montar essa ponte.
  if (window.__pgcSilentRefreshDespesas) {
    await window.__pgcSilentRefreshDespesas();
    return;
  }
  const opts = getContextOptions();
  if (!contextReady(opts)) return;
  await renderProgramacaoDespesas(state.panes['3'], {
    supervisao: opts.supervisao,
    supervisoesResolvidas: opts.supervisoesResolvidas,
    dataReferencia: opts.dataReferencia,
    programacaoId: opts.programacaoId,
    programacaoIdMap: opts.programacaoIdMap,
  });
};

const scheduleEquipeAugment = debounce(() => augmentEquipeDnd(), 180);

function tipoLetter(label) {
  const n = normalizeText(label);
  if (n.includes('INTERMITENTE')) return 'I';
  if (n.includes('DIARISTA')) return 'D';
  return 'E';
}

function tipoLabelFromAny(row) {
  return row?.tipoLabel || row?.tipo_contrato || row?.tipoContrato || row?.contrato || row?.tipo || 'Efetivo';
}

function isMotorista(row) {
  return !!(row?.veiculoId || row?.veiculo_id || row?.veiculoPlaca || row?.veiculo_placa || row?.placa_veiculo);
}

function poolAdd(pool, row, extras = {}) {
  const colaboradorId = String(row?.colaboradorId || row?.colaborador_id || row?.cpf || row?.id || '').trim();
  const nome = String(row?.nome || row?.nome_colaborador || row?.colaborador_nome || row?.name || '').trim();
  if (!colaboradorId || !nome) return;
  const atual = pool.get(colaboradorId) || {};
  pool.set(colaboradorId, {
    ...atual,
    ...extras,
    colaboradorId,
    nome,
    cargo: row?.cargo || atual.cargo || null,
    coordenacao: row?.coordenacao || atual.coordenacao || null,
    supervisao: row?.supervisao || atual.supervisao || null,
    tipoLabel: tipoLabelFromAny(row) || atual.tipoLabel || 'Efetivo',
    km: row?.km ?? atual.km ?? null,
    score: row?.score ?? atual.score ?? 0,
    scoreContrato: row?.scoreContrato ?? atual.scoreContrato ?? 0,
    scoreDistancia: row?.scoreDistancia ?? atual.scoreDistancia ?? 0,
    scoreAuditoria: row?.scoreAuditoria ?? atual.scoreAuditoria ?? 0,
    lat: row?.lat ?? row?.latitude ?? atual.lat ?? null,
    lng: row?.lng ?? row?.longitude ?? atual.lng ?? null,
    veiculoId: row?.veiculoId || row?.veiculo_id || atual.veiculoId || null,
    veiculoPlaca: row?.veiculoPlaca || row?.veiculo_placa || row?.placa_veiculo || atual.veiculoPlaca || null,
    linked: !!(extras.linked || atual.linked),
  });
}

function buildPoolFromSnapshot(snapshot) {
  const pool = new Map();
  (snapshot?.osComCandidatosAtual || []).forEach((item) => {
    (item.candidatos || []).forEach((c) => poolAdd(pool, c, { origem: 'candidato' }));
    (item.colaboradoresRegional || []).forEach((c) => poolAdd(pool, c, { origem: 'regional' }));
    (item.equipeRows || []).forEach((r) => poolAdd(pool, r, { origem: 'equipe', linked: true }));
  });
  (state.motoristasCache || []).forEach((m) => poolAdd(pool, m, { origem: 'motorista' }));
  return [...pool.values()].sort((a, b) => {
    const ma = isMotorista(a) ? 0 : 1;
    const mb = isMotorista(b) ? 0 : 1;
    if (ma !== mb) return ma - mb;
    if (a.linked !== b.linked) return a.linked ? -1 : 1;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
}

// "Veículos disponíveis" (inspirado no mockup de referência, 2026-07-21) —
// painel só INFORMATIVO por enquanto (não arrastável): o schema não tem
// vínculo O.S./veículo direto, só colaborador→placa (programacao_deslocamento,
// item.custos.placaAuto) — arrastar um veículo sozinho pra uma O.S. não tem
// pra onde gravar sem também escolher UM colaborador motorista, o que essa
// lista não carrega. Serve pra o gestor ver de relance o que está livre
// antes de escolher o motorista na aba Pessoas (cujo card já traz a placa).
async function carregarVeiculos(supervisoes) {
  const lista = Array.isArray(supervisoes) ? supervisoes.filter(Boolean) : [supervisoes].filter(Boolean);
  const key = lista.slice().sort().join('|');
  if (!key || state.veiculosCacheKey === key) return state.veiculosCache;
  state.veiculosCacheKey = key;
  try {
    let query = supabase.from('frotas_veiculos').select('id,placa,marca,modelo,status,motorista_atual,supervisao').eq('status', 'ATIVO');
    query = lista.length > 1 ? query.in('supervisao', lista) : query.eq('supervisao', lista[0]);
    const { data, error } = await query.order('placa', { ascending: true }).limit(2000);
    if (error) throw error;
    state.veiculosCache = (data || []).filter((v) => v.placa);
  } catch (error) {
    console.warn('[programacao-fluxo] veículos indisponíveis', error);
    state.veiculosCache = [];
  }
  return state.veiculosCache;
}

function veiculoCardHtml(v, placasEmUso) {
  const placa = onlyPlate(v.placa);
  const emUso = placasEmUso.has(placa);
  return `<div class="pgc-colab-card pgc-veiculo-card ${emUso ? 'is-linked' : ''}">
    <span class="pgc-colab-ico car">🚚</span>
    <span class="pgc-colab-main">
      <span class="pgc-colab-name">${esc(v.placa)}</span>
      <span class="pgc-colab-meta">${esc([v.marca, v.modelo].filter(Boolean).join(' ') || '—')}</span>
    </span>
    <span class="pgc-colab-tag ${emUso ? 'is-linked' : ''}">${emUso ? 'Em uso' : 'Disponível'}</span>
  </div>`;
}

async function carregarMotoristas(supervisoes) {
  const lista = Array.isArray(supervisoes) ? supervisoes.filter(Boolean) : [supervisoes].filter(Boolean);
  const key = lista.slice().sort().join('|');
  if (!key || state.motoristasCacheKey === key) return state.motoristasCache;
  state.motoristasCacheKey = key;
  try {
    let query = supabase.from('colaborador_cruzamento').select('*');
    query = lista.length > 1 ? query.in('supervisao', lista) : query.eq('supervisao', lista[0]);
    const { data, error } = await query.limit(8000);
    if (error) throw error;
    state.motoristasCache = (data || [])
      .filter((r) => r.veiculo_id || r.veiculo_placa || r.placa_veiculo)
      .map((r) => ({
        colaboradorId: cpfNorm(r.cpf) || String(r.id || r.nome || ''),
        nome: r.nome || r.colaborador_nome || r.funcionario || r.cpf || 'Motorista',
        cargo: r.cargo || null,
        coordenacao: r.coordenacao || null,
        supervisao: r.supervisao || null,
        tipoLabel: r.tipo_contrato || 'Efetivo',
        veiculoId: r.veiculo_id || null,
        veiculoPlaca: r.veiculo_placa || r.placa_veiculo || '',
        lat: r.latitude ?? null,
        lng: r.longitude ?? null,
      }))
      .filter((r) => r.colaboradorId && r.nome);
  } catch (error) {
    console.warn('[programacao-fluxo] motoristas indisponíveis', error);
    state.motoristasCache = [];
  }
  return state.motoristasCache;
}

function colabCardHtml(c, readOnly = false) {
  const motorista = isMotorista(c);
  const letter = motorista ? '🚗' : tipoLetter(c.tipoLabel);
  // Só o nome no card (a linha de tipo/supervisão/placa poluía — a supervisão
  // já é fixa após o filtro da Etapa 2). A busca do pool ainda casa por
  // tipo/supervisão/placa via os dados do objeto, mesmo sem exibi-los.
  return `<div class="pgc-colab-card ${c.linked ? 'is-linked' : ''}" draggable="${readOnly ? 'false' : 'true'}" data-pgc-colab='${esc(JSON.stringify(c))}'>
    <span class="pgc-colab-ico ${motorista ? 'car' : 'person'}">${esc(letter)}</span>
    <span class="pgc-colab-main"><span class="pgc-colab-name">${esc(c.nome)}</span></span>
    <span class="pgc-colab-tag ${c.linked ? 'is-linked' : ''}">${c.linked ? 'Escalado' : 'Disponível'}</span>
  </div>`;
}

// observeEquipePane() (embaixo) reage a QUALQUER mutação no documento pra
// reconstruir esta lista. Escrever inner/textContent incondicionalmente aqui
// cria um loop de auto-alimentação: escrever é uma mutação -> dispara o
// observer de novo -> escreve de novo -> ... rodando pra sempre a cada ~400ms
// assim que a Etapa 2 é aberta pela 1ª vez, mesmo sem nada realmente mudar.
// Só escreve quando o conteúdo calculado é diferente do que já está lá.
function renderIntoList(list, html) {
  if (list.__pgcHtmlCache === html) return;
  list.__pgcHtmlCache = html;
  // augmentEquipeDnd roda a cada mutação de DOM na página inteira (observer
  // global em document.documentElement, ver observeEquipePane) — sem
  // preservar a rolagem aqui, o sidebar de colaboradores/motoristas voltava
  // pro topo a qualquer ação, mesmo sem relação com o pool (autosave, toggle
  // de status, etc.).
  const scroller = list.closest('.pgc-colab-pool') || list;
  const scrollPos = scroller.scrollTop;
  list.innerHTML = html;
  scroller.scrollTop = scrollPos;
}

function renderPool(poolEl, pool, query = '', readOnly = false) {
  const q = normalizeText(query);
  const filtrados = q ? pool.filter((c) => normalizeText(`${c.nome} ${c.tipoLabel} ${c.supervisao} ${c.veiculoPlaca}`).includes(q)) : pool;
  const list = poolEl.querySelector('[data-pool-panel="pessoas"]');
  const html = filtrados.length ? filtrados.map((c) => colabCardHtml(c, readOnly)).join('') : '<div class="pgc-colab-empty">Nenhum colaborador encontrado.</div>';
  renderIntoList(list, html);
  if (poolEl.dataset.pgcActiveTab !== 'frota') {
    const countEl = poolEl.querySelector('.pgc-pool-count');
    const countText = `${filtrados.length}/${pool.length}`;
    if (countEl.textContent !== countText) countEl.textContent = countText;
  }
}

function renderVeiculosPool(poolEl, veiculos, query = '', placasEmUso) {
  const q = normalizeText(query);
  const filtrados = q ? veiculos.filter((v) => normalizeText(`${v.placa} ${v.marca} ${v.modelo}`).includes(q)) : veiculos;
  const list = poolEl.querySelector('[data-pool-panel="frota"]');
  const html = filtrados.length ? filtrados.map((v) => veiculoCardHtml(v, placasEmUso)).join('') : '<div class="pgc-colab-empty">Nenhum veículo ativo encontrado pra essa supervisão.</div>';
  renderIntoList(list, html);
  if (poolEl.dataset.pgcActiveTab === 'frota') {
    const countEl = poolEl.querySelector('.pgc-pool-count');
    const countText = `${filtrados.length}/${veiculos.length}`;
    if (countEl.textContent !== countText) countEl.textContent = countText;
  }
}

function ensureEquipeSplit(pane) {
  const list = pane.querySelector('#peqbOsList');
  if (!list) return null;
  let pool = pane.querySelector('#pgcColabPool');
  if (pool) return { pool, list };
  const split = document.createElement('div');
  split.className = 'pgc-equipe-split';
  pool = document.createElement('aside');
  pool.id = 'pgcColabPool';
  pool.className = 'pgc-colab-pool';
  pool.innerHTML = `
    <div class="pgc-pool-head"><strong>Recursos disponíveis</strong><span class="pgc-pool-count">0</span></div>
    <div class="pgc-pool-tabs" role="tablist">
      <button type="button" class="pgc-pool-tab active" data-pool-tab="pessoas">Pessoas</button>
      <button type="button" class="pgc-pool-tab" data-pool-tab="frota">Frota</button>
    </div>
    <input class="pgc-pool-search" id="pgcPoolSearch" placeholder="Buscar colaborador, tipo ou placa..." />
    <div class="pgc-colab-list" data-pool-panel="pessoas"><div class="pgc-colab-empty">Carregando lista...</div></div>
    <div class="pgc-colab-list" data-pool-panel="frota" hidden><div class="pgc-colab-empty">Carregando frota...</div></div>
    <div class="pgc-dnd-note">Arraste para uma O.S. para associar. Se a O.S. já tiver colaborador, a justificativa é obrigatória. Motorista pode ser solto na O.S. ou sobre um colaborador confirmado. A lista de veículos é só consulta — o vínculo é feito pelo motorista.</div>`;
  list.parentNode.insertBefore(split, list);
  split.appendChild(pool);
  split.appendChild(list);
  return { pool, list };
}

async function augmentEquipeDnd() {
  const pane = document.getElementById('pgcPane2') || document;
  const snapshot = window.__peqbGetEquipeSnapshot?.();
  const list = pane.querySelector('#peqbOsList');
  if (!snapshot?.osComCandidatosAtual?.length || !list) return;
  const { pool: poolEl } = ensureEquipeSplit(pane) || {};
  if (!poolEl) return;

  const [, veiculos] = await Promise.all([
    carregarMotoristas(snapshot.supervisoesResolvidas || []),
    carregarVeiculos(snapshot.supervisoesResolvidas || []),
  ]);
  const pool = buildPoolFromSnapshot(snapshot);
  // Placa "em uso" = já é o veículo de algum motorista LINKED no pool (ou
  // seja, confirmado numa O.S. hoje) — mesma noção de "escalado" aplicada ao
  // veículo em vez do colaborador.
  const placasEmUso = new Set(pool.filter((c) => c.linked && c.veiculoPlaca).map((c) => onlyPlate(c.veiculoPlaca)));
  const searchValue = poolEl.querySelector('#pgcPoolSearch')?.value || '';
  renderPool(poolEl, pool, searchValue, snapshot.readOnly);
  renderVeiculosPool(poolEl, veiculos, searchValue, placasEmUso);

  if (poolEl.dataset.pgcWired !== '1') {
    poolEl.dataset.pgcWired = '1';
    poolEl.dataset.pgcActiveTab = 'pessoas';
    poolEl.addEventListener('input', (event) => {
      if (!event.target.matches('#pgcPoolSearch')) return;
      const freshSnapshot = window.__peqbGetEquipeSnapshot?.();
      const freshPool = buildPoolFromSnapshot(freshSnapshot);
      const freshPlacas = new Set(freshPool.filter((c) => c.linked && c.veiculoPlaca).map((c) => onlyPlate(c.veiculoPlaca)));
      renderPool(poolEl, freshPool, event.target.value, freshSnapshot?.readOnly);
      renderVeiculosPool(poolEl, state.veiculosCache, event.target.value, freshPlacas);
    });
    poolEl.addEventListener('click', (event) => {
      const tabBtn = event.target.closest('[data-pool-tab]');
      if (!tabBtn) return;
      const alvo = tabBtn.dataset.poolTab;
      poolEl.dataset.pgcActiveTab = alvo;
      poolEl.querySelectorAll('[data-pool-tab]').forEach((b) => b.classList.toggle('active', b === tabBtn));
      poolEl.querySelector('[data-pool-panel="pessoas"]').hidden = alvo !== 'pessoas';
      poolEl.querySelector('[data-pool-panel="frota"]').hidden = alvo !== 'frota';
      const searchEl = poolEl.querySelector('#pgcPoolSearch');
      searchEl.placeholder = alvo === 'frota' ? 'Buscar placa ou modelo...' : 'Buscar colaborador, tipo ou placa...';
      const freshSnapshot = window.__peqbGetEquipeSnapshot?.();
      const countEl = poolEl.querySelector('.pgc-pool-count');
      if (alvo === 'frota') {
        countEl.textContent = `${state.veiculosCache.length}/${state.veiculosCache.length}`;
      } else {
        const freshPool = buildPoolFromSnapshot(freshSnapshot);
        countEl.textContent = `${freshPool.length}/${freshPool.length}`;
      }
    });
    poolEl.addEventListener('dragstart', (event) => {
      if (window.__peqbGetEquipeSnapshot?.()?.readOnly) { event.preventDefault(); return; }
      const card = event.target.closest('[data-pgc-colab]');
      if (!card) return;
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('application/json', card.dataset.pgcColab || '{}');
      event.dataTransfer.setData('text/plain', card.dataset.pgcColab || '{}');
    });
  }

  if (list.dataset.pgcDndWired !== '1') {
    list.dataset.pgcDndWired = '1';
    list.addEventListener('dragover', (event) => {
      if (window.__peqbGetEquipeSnapshot?.()?.readOnly) return;
      const row = event.target.closest('.peqb-row[data-os-id]');
      if (!row) return;
      event.preventDefault();
      row.classList.add('pgc-drop-hot');
      const pessoa = event.target.closest('.peqb-conf-name,.peqb-extra-colab');
      if (pessoa) pessoa.classList.add('pgc-drop-hot');
    });
    list.addEventListener('dragleave', (event) => {
      const row = event.target.closest('.peqb-row[data-os-id]');
      if (row) row.classList.remove('pgc-drop-hot');
      const pessoa = event.target.closest('.peqb-conf-name,.peqb-extra-colab');
      if (pessoa) pessoa.classList.remove('pgc-drop-hot');
    });
    list.addEventListener('drop', async (event) => {
      if (window.__peqbGetEquipeSnapshot?.()?.readOnly) return;
      const row = event.target.closest('.peqb-row[data-os-id]');
      if (!row) return;
      event.preventDefault();
      row.classList.remove('pgc-drop-hot');
      row.querySelectorAll('.pgc-drop-hot').forEach((el) => el.classList.remove('pgc-drop-hot'));
      let colab;
      try { colab = JSON.parse(event.dataTransfer.getData('application/json') || event.dataTransfer.getData('text/plain') || '{}'); } catch { colab = null; }
      if (!colab?.colaboradorId) return;
      const alvoPessoa = event.target.closest('.peqb-conf-name,.peqb-extra-colab');
      if (alvoPessoa && isMotorista(colab)) {
        await vincularMotoristaAoColaborador(row.dataset.osId, alvoPessoa, colab);
      } else {
        await vincularColaboradorNaOs(row.dataset.osId, colab);
      }
    });
  }
}

function findItemByOs(osId) {
  const snapshot = window.__peqbGetEquipeSnapshot?.();
  const item = (snapshot?.osComCandidatosAtual || []).find((it) => String(it.os?.id) === String(osId));
  return { snapshot, item };
}

function materializarCand(item, colab) {
  const id = String(colab.colaboradorId || '');
  const cand = (item?.candidatos || []).find((c) => String(c.colaboradorId) === id)
    || (item?.colaboradoresRegional || []).find((c) => String(c.colaboradorId) === id);
  return {
    ...(cand || {}),
    ...colab,
    colaboradorId: id,
    nome: colab.nome || cand?.nome || id,
    tipoLabel: colab.tipoLabel || cand?.tipoLabel || 'Efetivo',
    score: cand?.score || colab.score || 0,
    scoreContrato: cand?.scoreContrato || colab.scoreContrato || 0,
    scoreDistancia: cand?.scoreDistancia || colab.scoreDistancia || 0,
    scoreAuditoria: cand?.scoreAuditoria || colab.scoreAuditoria || 0,
    km: cand?.km ?? colab.km ?? null,
  };
}

function pedirJustificativa(os, atuais, novo) {
  return new Promise((resolve) => {
    const nomes = (atuais || []).map((c) => c.nome_colaborador || c.nome).filter(Boolean).join(', ');
    const ov = document.createElement('div');
    ov.className = 'peqb-modal-ov';
    ov.innerHTML = `<div class="peqb-modal">
      <h3>Justificar mais de 1 colaborador</h3>
      <p>O.S. <b style="color:#bbf7d0">${esc(os?.numero_os || '-')}</b> já possui <b>${esc(nomes || '-')}</b>. Informe o motivo para adicionar <b style="color:#bbf7d0">${esc(novo?.nome || '-')}</b>.</p>
      <textarea id="pgcJustif" rows="3" placeholder="Ex.: volume, distância ou demanda exige mais pessoas no ponto" style="width:100%;resize:vertical;background:#0d0d18;color:#e2e2f0;border:1px solid rgba(52,211,153,.28);border-radius:10px;padding:9px 10px;font-size:13px"></textarea>
      <div class="peqb-modal-actions"><button type="button" class="peqb-row-btn" data-cancel>Cancelar</button><button type="button" class="peqb-row-btn" data-ok style="border-color:rgba(134,239,172,.4);color:#bbf7d0">Confirmar</button></div>
    </div>`;
    document.body.appendChild(ov);
    const input = ov.querySelector('#pgcJustif');
    const close = (v) => { ov.remove(); resolve(v); };
    input.focus();
    ov.addEventListener('click', (e) => { if (e.target === ov) close(null); });
    ov.querySelector('[data-cancel]').addEventListener('click', () => close(null));
    ov.querySelector('[data-ok]').addEventListener('click', () => {
      const motivo = input.value.trim();
      if (!motivo) { input.focus(); return; }
      close(motivo);
    });
  });
}

function escolherDisponibilidadeMotorista(nome) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'peqb-modal-ov';
    ov.innerHTML = `<div class="peqb-modal">
      <h3>Motorista na programação</h3>
      <p><b style="color:#bbf7d0">${esc(nome || 'Motorista')}</b> será lançado como:</p>
      <div class="peqb-modal-actions" style="justify-content:stretch">
        <button type="button" class="peqb-row-btn" data-valor="OK" style="flex:1">Atendimento</button>
        <button type="button" class="peqb-row-btn" data-valor="LOGISTICA" style="flex:1;border-color:rgba(134,239,172,.4);color:#bbf7d0">Logística</button>
      </div>
      <button type="button" class="peqb-row-btn danger" data-cancel>Cancelar</button>
    </div>`;
    document.body.appendChild(ov);
    const close = (v) => { ov.remove(); resolve(v); };
    ov.addEventListener('click', (e) => { if (e.target === ov) close(null); });
    ov.querySelector('[data-cancel]').addEventListener('click', () => close(null));
    ov.querySelectorAll('[data-valor]').forEach((btn) => btn.addEventListener('click', () => close(btn.dataset.valor)));
  });
}

async function upsertVinculo({ programacaoId, os, cand, disponibilidade }) {
  const equipePayload = {
    programacao_id: programacaoId,
    os_id: os.id,
    colaborador_id: cand.colaboradorId,
    nome_colaborador: cand.nome,
    score: cand.score || 0,
    score_contrato: cand.scoreContrato || 0,
    score_distancia: cand.scoreDistancia || 0,
    score_auditoria: cand.scoreAuditoria || 0,
    km_estimado: cand.km ?? null,
    confirmado: true,
  };
  // .select() aqui não é só pra ler o resultado: programacao-ultima-programacao-fix.js
  // faz um monkeypatch em supabase.from('programacao_equipe').upsert(...) que, se a
  // chamada NÃO encadear .select(), apaga em seguida qualquer outro colaborador já
  // confirmado nessa mesma O.S. que não esteja neste payload — pensado pra "trocar"
  // colaborador (não deixar linha antiga duplicando despesa), mas isso também apaga
  // por engano o 1º colaborador quando o objetivo aqui é ADICIONAR um 2º/3º (drag do
  // pool). O botão nativo "+" (adicionarColaboradorOs) já encadeia .select() por isso
  // nunca teve esse problema. Ver limparEquipeAntiga() nesse arquivo.
  const { error: equipeErr } = await supabase.from('programacao_equipe').upsert(equipePayload, { onConflict: 'programacao_id,os_id,colaborador_id' }).select().limit(1);
  if (equipeErr) throw equipeErr;

  const cpf = /^\d+$/.test(String(cand.colaboradorId)) ? String(cand.colaboradorId) : null;
  const del = await supabase.from('operacional_os_colaboradores').delete().eq('os_id', os.id).eq('colaborador_key', cand.colaboradorId);
  if (del.error) console.warn('[programacao-fluxo] limpar vínculo OS/colaborador', del.error);
  const ins = await supabase.from('operacional_os_colaboradores').insert({
    os_id: os.id,
    colaborador_key: cand.colaboradorId,
    colaborador_nome: cand.nome,
    colaborador_cpf: cpf,
    distancia_km: cand.km ?? null,
    origem_sugestao: isMotorista(cand) ? 'PROGRAMACAO_DRAG_MOTORISTA' : 'PROGRAMACAO_DRAG_COLABORADOR',
  });
  if (ins.error) console.warn('[programacao-fluxo] gravar vínculo OS/colaborador', ins.error);

  const espelho = await supabase.from('programacao_colaboradores').upsert({
    programacao_id: programacaoId,
    colaborador_id: cand.colaboradorId,
    nome_colaborador: cand.nome,
    cargo: cand.cargo || null,
    coordenacao: cand.coordenacao || null,
    supervisao: cand.supervisao || null,
    disponibilidade,
  }, { onConflict: 'programacao_id,colaborador_id' });
  if (espelho.error) console.warn('[programacao-fluxo] espelhar disponibilidade', espelho.error);
}

async function vincularColaboradorNaOs(osId, colab) {
  const { snapshot, item } = findItemByOs(osId);
  if (!snapshot || !item) return;
  if (snapshot.readOnly) { alert('Data retroativa — somente leitura.'); return; }
  const cand = materializarCand(item, colab);
  const jaNaOs = (item.equipeRows || []).some((r) => String(r.colaborador_id) === String(cand.colaboradorId));
  if (jaNaOs) { alert(`${cand.nome} já está vinculado nesta O.S.`); return; }

  let disponibilidade = isMotorista(cand) ? await escolherDisponibilidadeMotorista(cand.nome) : 'OK';
  if (!disponibilidade) return;
  const atuais = item.equipeRows || [];
  let motivo = null;
  if (disponibilidade === 'OK' && atuais.length) {
    motivo = await pedirJustificativa(item.os, atuais, cand);
    if (!motivo) return;
  }
  const programacaoId = snapshot.programacaoIdParaOs?.(item.os) || item.programacao_id || snapshot.programacaoId || item.equipeRows?.[0]?.programacao_id;
  if (!programacaoId) { alert('Programação da O.S. não encontrada. Recarregue a tela.'); return; }

  setFeedback(`Vinculando ${cand.nome} na O.S. ${item.os.numero_os || ''}...`, 'ok');
  try {
    await upsertVinculo({ programacaoId, os: item.os, cand, disponibilidade });
    if (motivo) {
      logActivity('action', 'justificativa_multiplos_colaboradores_os', 'programacao', {
        os_id: item.os.id,
        numero_os: item.os.numero_os,
        colaboradores: [...atuais.map((c) => c.colaborador_id), cand.colaboradorId],
        nomes: [...atuais.map((c) => c.nome_colaborador), cand.nome],
        motivo,
      });
    }
    await refreshAposVinculo();
    setActiveStep('2');
    setFeedback(`${cand.nome} vinculado à O.S. ${item.os.numero_os || ''}.`, 'ok');
  } catch (error) {
    console.error('[programacao-fluxo] vincular colaborador:', error);
    setFeedback(error.message || 'Não foi possível vincular colaborador.', 'error');
    alert(error.message || 'Não foi possível vincular colaborador.');
  }
}

function alvoColaboradorIdFromDrop(alvoPessoa, item) {
  if (!alvoPessoa || !item) return null;
  if (alvoPessoa.classList.contains('peqb-conf-name')) return item.confirmadoRow?.colaborador_id || item.equipeRows?.[0]?.colaborador_id || null;
  const rm = alvoPessoa.querySelector('[data-remover-adicional]');
  const rowId = rm?.dataset.removerAdicional;
  return (item.equipeRows || []).find((r) => String(r.id) === String(rowId))?.colaborador_id || null;
}

async function vincularMotoristaAoColaborador(osId, alvoPessoa, motorista) {
  const { snapshot, item } = findItemByOs(osId);
  if (!snapshot || !item) return;
  if (snapshot.readOnly) { alert('Data retroativa — somente leitura.'); return; }
  const alvoId = alvoColaboradorIdFromDrop(alvoPessoa, item);
  if (!alvoId) { await vincularColaboradorNaOs(osId, motorista); return; }
  const programacaoId = snapshot.programacaoIdParaOs?.(item.os) || item.equipeRows?.[0]?.programacao_id || snapshot.programacaoId;
  if (!programacaoId) { alert('Programação da O.S. não encontrada. Recarregue a tela.'); return; }
  const disponibilidade = 'LOGISTICA';
  const cand = materializarCand(item, motorista);
  try {
    await upsertVinculo({ programacaoId, os: item.os, cand, disponibilidade });
    const placa = onlyPlate(cand.veiculoPlaca || '');
    if (placa) {
      await supabase.from('programacao_deslocamento').upsert({
        programacao_id: programacaoId,
        data_referencia: snapshot.dataReferencia || todayIso(),
        colaborador_id: alvoId,
        tipo_deslocamento: 'CARONA FROTA',
        placa_veiculo: placa,
        observacao: `Motorista vinculado na programação: ${cand.nome}`,
      }, { onConflict: 'programacao_id,colaborador_id' });
    }
    logActivity('action', 'motorista_vinculado_colaborador_os', 'programacao', {
      os_id: item.os.id,
      numero_os: item.os.numero_os,
      motorista_id: cand.colaboradorId,
      motorista_nome: cand.nome,
      colaborador_id: alvoId,
      placa,
      disponibilidade,
    });
    await refreshAposVinculo();
    setActiveStep('2');
    setFeedback(`Motorista ${cand.nome} vinculado na O.S. ${item.os.numero_os || ''}.`, 'ok');
  } catch (error) {
    console.error('[programacao-fluxo] vincular motorista:', error);
    alert(error.message || 'Não foi possível vincular motorista.');
  }
}

function hookStepClicks() {
  document.addEventListener('click', (event) => {
    const btn = event.target.closest('#progSteps .stepbtn');
    if (!btn || !state.panes) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const ui = btn.dataset.uiStep || btn.dataset.step || (btn.textContent.match(/\d/) || ['1'])[0];
    setActiveStep(ui);
    if (ui === '2') scheduleEquipeAugment(120);
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
    setFeedback('Carregando contexto e preparando as 4 abas...', 'ok');
    await waitLoadColaboradores();
    await renderAllTabs({ force: true });
  }, false);
}

function observeEquipePane() {
  const obs = new MutationObserver(debounce(() => {
    hookLoadButton();
    if (document.getElementById('peqbOsList')) scheduleEquipeAugment(150);
  }, 220));
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
