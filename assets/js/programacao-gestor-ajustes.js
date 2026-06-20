// Ajustes do Gestor: Programação passa a concentrar Distribuição de O.S. + etapas operacionais.
import { supabase } from './supabaseClient.js';
import { renderOsProgramacaoLite } from './os-programacao-lite.js';

const OS_STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'PENDENTE', label: 'Pendente' },
  { value: 'AGUARDAR', label: 'Aguardar' },
  { value: 'ATENDER', label: 'Atender' },
  { value: 'FINALIZAR', label: 'Finalizar' },
];

let currentUiStep = 'A';
let distribuicaoLoaded = false;
let distribuicaoLoading = false;
let supervisoesDropdownLoading = false;
let supervisoesDropdownLoaded = false;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function waitForElement(selector, timeout = 12000) {
  const found = document.querySelector(selector);
  if (found) return Promise.resolve(found);
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      } else if (Date.now() - started > timeout) {
        observer.disconnect();
        reject(new Error(`Elemento não encontrado: ${selector}`));
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

function statusOptionsHtml(selected = '') {
  return OS_STATUS_OPTIONS.map((option) => (
    `<option value="${escapeHtml(option.value)}" ${String(selected || '') === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`
  )).join('');
}

function injectGestorAjustesStyles() {
  if (document.getElementById('programacaoGestorAjustesStyles')) return;
  const style = document.createElement('style');
  style.id = 'programacaoGestorAjustesStyles';
  style.textContent = `
    .prog-tfield-sup{flex:1 1 320px!important;max-width:480px!important}
    .prog-tfield-os-status{flex:0 0 170px;max-width:190px}
    #progDistribuicaoOsMount .filters-grid.os-grid{display:none!important}
    #progDistribuicaoOsMount .card:first-child{margin-top:0}
    #progDistribuicaoOsMount #osStats{margin-top:12px}
    .prog-os-lazy-card{border:1px dashed rgba(52,211,153,.22);border-radius:18px;padding:18px;background:rgba(15,23,42,.18);color:#94a3b8;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
    .prog-os-lazy-card strong{display:block;color:#f8fafc;margin-bottom:4px;font-size:14px}
    .prog-os-lazy-card p{margin:0;font-size:13px;line-height:1.35}
    .prog-os-lazy-card .btn{min-height:38px}
    @media(max-width:900px){.prog-tfield-sup,.prog-tfield-os-status{flex:1 1 100%!important;max-width:none!important}.prog-os-lazy-card{align-items:stretch}.prog-os-lazy-card .btn{width:100%;justify-content:center}}
  `;
  document.head.appendChild(style);
}

async function liberarListaSupervisoes() {
  const select = document.getElementById('progSup');
  if (!select || supervisoesDropdownLoading) return;

  const opcoesAtuais = [...select.options].filter((opt) => opt.value);
  if (supervisoesDropdownLoaded && !select.disabled && opcoesAtuais.length > 1) return;

  supervisoesDropdownLoading = true;
  try {
    const valorAtual = select.value || '';
    const { data, error } = await supabase
      .from('supervisoes')
      .select('nome')
      .eq('ativo', true)
      .order('nome', { ascending: true });

    if (error) throw error;

    const supervisoes = [...new Set((data || [])
      .map((row) => String(row.nome || '').trim())
      .filter(Boolean))];

    if (supervisoes.length) {
      select.innerHTML = '<option value="">Selecione...</option>' + supervisoes
        .map((sup) => `<option value="${escapeHtml(sup)}">${escapeHtml(sup)}</option>`)
        .join('');
      if (valorAtual && supervisoes.some((sup) => normalize(sup) === normalize(valorAtual))) {
        select.value = supervisoes.find((sup) => normalize(sup) === normalize(valorAtual));
      }
    }

    select.disabled = false;
    select.dataset.supervisoesLiberadas = '1';
    supervisoesDropdownLoaded = true;
  } catch (error) {
    console.warn('[programacao-ajustes] Não foi possível liberar lista completa de supervisões.', error);
    select.disabled = false;
  } finally {
    supervisoesDropdownLoading = false;
  }
}

function ensureStatusOsFilter() {
  injectGestorAjustesStyles();
  const loadBtn = document.getElementById('progLoadContext');
  if (!loadBtn) return null;

  let field = document.getElementById('progOsStatusTopWrap');
  if (!field) {
    field = document.createElement('div');
    field.className = 'prog-tfield prog-tfield-os-status';
    field.id = 'progOsStatusTopWrap';
    field.innerHTML = `
      <label for="progOsStatusTop">Status OS</label>
      <select id="progOsStatusTop">${statusOptionsHtml()}</select>
    `;
    loadBtn.insertAdjacentElement('beforebegin', field);
  }

  const select = field.querySelector('#progOsStatusTop');
  if (select && select.dataset.statusOsBound !== '1') {
    select.dataset.statusOsBound = '1';
    select.addEventListener('change', () => {
      if (distribuicaoLoaded) syncStatusToOsModule();
    });
  }
  return select;
}

function syncStatusToOsModule(root = document) {
  const topStatus = document.getElementById('progOsStatusTop');
  const osStatus = root.querySelector?.('#osStatus') || document.getElementById('osStatus');
  if (!topStatus || !osStatus) return;
  if (osStatus.value !== topStatus.value) {
    osStatus.value = topStatus.value;
    osStatus.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function prepareEmbeddedOsFilters(mount) {
  if (!mount) return;
  mount.classList.add('prog-os-embedded');
  const filters = mount.querySelector('.filters-grid.os-grid');
  if (filters) filters.setAttribute('aria-hidden', 'true');
  syncStatusToOsModule(mount);
}

function setStatusOsVisibility(isDistribuicao) {
  const topStatus = ensureStatusOsFilter();
  const wrap = topStatus?.closest('.prog-tfield-os-status');
  if (wrap) wrap.style.display = isDistribuicao ? '' : 'none';
}

function setSaveVisibility(isDistribuicao) {
  const saveBtn = document.getElementById('progSaveProgramacao');
  const search = document.getElementById('progSearchWrap');
  if (saveBtn) saveBtn.style.display = isDistribuicao ? 'none' : '';
  if (search) search.style.display = isDistribuicao ? 'none' : '';
  setStatusOsVisibility(isDistribuicao);
}

function distribuicaoHeaderHtml() {
  return `
    <div class="prog-section-title">
      <h4>Distribuição de O.S.</h4>
      <span class="badge">Etapa A</span>
    </div>
    <div class="prog-empty-section" style="margin-bottom:12px">
      As O.S. que precisam de verificação ficam aqui, dentro da própria Programação.
    </div>
    <div id="progDistribuicaoOsMount"></div>
  `;
}

function renderDistribuicaoPlaceholder() {
  const mount = document.getElementById('progDistribuicaoOsMount');
  if (!mount) return;
  const sup = document.getElementById('progSup')?.value || '';
  mount.innerHTML = `
    <div class="prog-os-lazy-card">
      <div>
        <strong>Distribuição pronta para carregar</strong>
        <p>${sup ? `Supervisão selecionada: ${escapeHtml(sup)}.` : 'Selecione a supervisão e a data no topo.'} Clique em <b>Carregar</b> para buscar as O.S.</p>
      </div>
      <button type="button" class="btn btn-primary" id="progDistribuicaoLoadNow">Carregar O.S.</button>
    </div>
  `;
  mount.querySelector('#progDistribuicaoLoadNow')?.addEventListener('click', () => renderDistribuicao({ loadOs: true, force: true }));
}

function renderDistribuicaoLoading() {
  const mount = document.getElementById('progDistribuicaoOsMount');
  if (!mount) return;
  const sup = document.getElementById('progSup')?.value || '';
  mount.innerHTML = `
    <div class="prog-os-lazy-card">
      <div>
        <strong>Carregando distribuição de O.S...</strong>
        <p>${sup ? `Buscando O.S. para ${escapeHtml(sup)}.` : 'Buscando O.S. liberadas para o seu usuário.'}</p>
      </div>
    </div>
  `;
}

function guardDistribuicaoView() {
  if (currentUiStep !== 'A') return;
  const list = document.getElementById('progList');
  if (!list || document.getElementById('progDistribuicaoOsMount')) return;
  renderDistribuicao({ loadOs: false });
}

function setActiveDistribution() {
  document.querySelectorAll('#progSteps .stepbtn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.uiStep === 'A');
  });
}

async function renderDistribuicao({ loadOs = false, force = false } = {}) {
  const list = document.getElementById('progList');
  const feedback = document.getElementById('progCtxFeedback');
  if (!list) return;

  setActiveDistribution();
  setSaveVisibility(true);
  if (feedback) {
    const sup = document.getElementById('progSup')?.value || '';
    feedback.className = 'feedback mt-16 prog-feedback-ok';
    feedback.textContent = loadOs
      ? (sup ? `Carregando distribuição para ${sup}.` : 'Carregando distribuição conforme o acesso do usuário.')
      : 'Etapa A aberta. Clique em Carregar para buscar as O.S.';
  }

  list.innerHTML = distribuicaoHeaderHtml();

  if (!loadOs && !distribuicaoLoaded) {
    renderDistribuicaoPlaceholder();
    return;
  }

  if (distribuicaoLoading) return;
  distribuicaoLoading = true;
  renderDistribuicaoLoading();

  try {
    const mount = document.getElementById('progDistribuicaoOsMount');
    await renderOsProgramacaoLite(mount, {
      reuseData: !force,
      supervisao: document.getElementById('progSup')?.value || '',
      status: document.getElementById('progOsStatusTop')?.value || '',
      data: document.getElementById('progDataRef')?.value || '',
    });
    prepareEmbeddedOsFilters(mount);
    distribuicaoLoaded = true;
    if (feedback) {
      const sup = document.getElementById('progSup')?.value || '';
      feedback.className = 'feedback mt-16 prog-feedback-ok';
      feedback.textContent = sup ? `Distribuição carregada para ${sup}.` : 'Distribuição carregada conforme as supervisões liberadas no login do gestor.';
    }
  } finally {
    distribuicaoLoading = false;
  }
}

function configureSteps() {
  const stepsWrap = document.getElementById('progSteps');
  if (!stepsWrap || stepsWrap.dataset.gestorAjustado === '1') return;

  const existing = [...stepsWrap.querySelectorAll('.stepbtn')];
  const layout = [
    { ui: 'A', label: 'Distribuição', internal: '__distribuicao' },
    { ui: 'B', label: 'Disponibilidade', internal: 'A' },
    { ui: 'C', label: 'Estadia', internal: 'B' },
    { ui: 'D', label: 'Alimentação', internal: 'C' },
    { ui: 'E', label: 'Deslocamento', internal: 'D' },
    { ui: 'F', label: 'Extras', internal: 'E' },
  ];

  layout.forEach((step, index) => {
    let btn = existing[index];
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'stepbtn';
      stepsWrap.appendChild(btn);
    }
    btn.dataset.uiStep = step.ui;
    btn.dataset.step = step.internal;
    btn.textContent = `${step.ui} · ${step.label}`;
  });

  stepsWrap.dataset.gestorAjustado = '1';
  stepsWrap.addEventListener('click', (event) => {
    const btn = event.target.closest('.stepbtn');
    if (!btn) return;
    currentUiStep = btn.dataset.uiStep;
    if (btn.dataset.uiStep === 'A') {
      event.preventDefault();
      event.stopImmediatePropagation();
      renderDistribuicao({ loadOs: distribuicaoLoaded });
      return;
    }
    setSaveVisibility(false);
  }, true);
}

function autoSelectSingleSupervisao() {
  const select = document.getElementById('progSup');
  if (!select || select.dataset.autoLoadChecked === '1') return;

  const options = [...select.options].filter((opt) => opt.value);
  if (!options.length) return;
  select.dataset.autoLoadChecked = '1';

  if (options.length === 1) {
    select.value = options[0].value;
    if (currentUiStep === 'A') renderDistribuicao({ loadOs: false });
  }
}

function patchPendingOsModal() {
  const modal = document.getElementById('progOsPendingModal');
  if (!modal || modal.dataset.distribuicaoPatched === '1') return;
  modal.dataset.distribuicaoPatched = '1';
  const btn = modal.querySelector('[data-os-open]');
  if (btn) {
    btn.textContent = 'Abrir Distribuição agora';
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      modal.remove();
      renderDistribuicao({ loadOs: true, force: true });
    }, true);
  }
}

function bindTopLoadForEtapaA() {
  const loadBtn = document.getElementById('progLoadContext');
  if (!loadBtn || loadBtn.dataset.distribuicaoLoadBound === '1') return;
  loadBtn.dataset.distribuicaoLoadBound = '1';
  loadBtn.addEventListener('click', (event) => {
    if (currentUiStep !== 'A') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    renderDistribuicao({ loadOs: true, force: true });
  }, true);
}

async function initGestorProgramacaoAjustes() {
  await waitForElement('#progSteps');
  injectGestorAjustesStyles();
  ensureStatusOsFilter();
  bindTopLoadForEtapaA();
  configureSteps();
  renderDistribuicao({ loadOs: false });
  setTimeout(() => liberarListaSupervisoes(), 250);
  setTimeout(() => liberarListaSupervisoes(), 900);

  const observer = new MutationObserver(() => {
    liberarListaSupervisoes();
    autoSelectSingleSupervisao();
    patchPendingOsModal();
    guardDistribuicaoView();
    bindTopLoadForEtapaA();
    if (currentUiStep === 'A') {
      ensureStatusOsFilter();
      const mount = document.getElementById('progDistribuicaoOsMount');
      prepareEmbeddedOsFilters(mount);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  liberarListaSupervisoes();
  autoSelectSingleSupervisao();
  patchPendingOsModal();

  document.getElementById('progSup')?.addEventListener('change', () => {
    distribuicaoLoaded = false;
    if (currentUiStep === 'A') renderDistribuicao({ loadOs: false });
  });
}

initGestorProgramacaoAjustes().catch((error) => console.warn('[programacao-ajustes]', error));
