// Ajustes do Gestor: Programação passa a concentrar Distribuição de O.S. + etapas operacionais.
import { renderOsProgramacaoLite } from './os-programacao-lite.js';
import { renderProgramacaoEquipe } from './programacao-equipe.js?v=20260627-merge';
import { renderFase2Custos } from './programacao-fase2-custos.js?v=20260627-restruct';

const OS_STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'PENDENTE', label: 'Pendente' },
  { value: 'AGUARDAR', label: 'Aguardar' },
  { value: 'ATENDER', label: 'Atender' },
  { value: 'FINALIZAR', label: 'Finalizar' },
];

let currentUiStep = '1';
let distribuicaoLoaded = false;
let distribuicaoLoading = false;
let pendingKpiReload = false;

let supDropdownEl = null;
let supComboState = { input: null, onSelect: null };

function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

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
    .prog-toolbar{position:relative!important;z-index:9000!important;overflow:visible!important}
    .prog-toolbar-row{position:relative!important;z-index:9001!important;overflow:visible!important}
    .prog-tfield-sup{flex:1 1 320px!important;max-width:520px!important;position:relative!important;z-index:9010!important;overflow:visible!important}
    .prog-tfield-sup select,#progSup{position:relative!important;z-index:9020!important;min-width:320px!important;background:#020617!important;background-color:#020617!important;background-image:linear-gradient(#020617,#020617)!important;color:#f8fafc!important;border-color:rgba(52,211,153,.45)!important;opacity:1!important;color-scheme:dark!important;box-shadow:0 10px 26px rgba(0,0,0,.42)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
    .prog-tfield-sup select:focus,#progSup:focus{background:#020617!important;background-color:#020617!important;color:#f8fafc!important;outline:2px solid rgba(52,211,153,.35)!important;outline-offset:1px!important}
    #progSup option,#progSup optgroup,#progOsStatusTop option,#progOsStatusTop optgroup{background:#020617!important;background-color:#020617!important;color:#f8fafc!important;opacity:1!important;text-shadow:none!important}
    #progSup option:checked,#progSup option:hover,#progOsStatusTop option:checked,#progOsStatusTop option:hover{background:#064e3b!important;background-color:#064e3b!important;color:#ffffff!important}
    #progSteps,#progSteps .stepbtn{position:relative!important;z-index:0!important}
    .prog-toolbar:has(#progSup:focus) .prog-toolbar-row-steps{opacity:0!important;visibility:hidden!important;pointer-events:none!important}
    .prog-tfield-os-status{flex:0 0 170px;max-width:190px;position:relative!important;z-index:9005!important}
    .prog-list-card,#progList,#progDistribuicaoOsMount,#osLiteRoot,#osLiteStats,#osLiteList{position:relative;z-index:1;overflow:visible!important}
    #progDistribuicaoOsMount .grid-cards,#progDistribuicaoOsMount .card:not(:first-child){position:relative;z-index:1}
    #progDistribuicaoOsMount .filters-grid.os-grid{display:none!important}
    #progDistribuicaoOsMount .card:first-child{margin-top:0}
    #progDistribuicaoOsMount #osStats{margin-top:12px}
    .prog-os-lazy-card{border:1px dashed rgba(52,211,153,.22);border-radius:18px;padding:18px;background:rgba(15,23,42,.18);color:#94a3b8;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
    .prog-os-lazy-card strong{display:block;color:#f8fafc;margin-bottom:4px;font-size:14px}
    .prog-os-lazy-card p{margin:0;font-size:13px;line-height:1.35}
    .prog-os-lazy-card .btn{min-height:38px}
    @media(max-width:900px){
      .prog-tfield-sup select,#progSup{min-width:0!important}
      .prog-os-lazy-card{align-items:stretch}
      .prog-os-lazy-card .btn{width:100%;justify-content:center}
    }
    @media(max-width:720px){
      #progSteps .stepbtn-label{display:none}
    }
    .prog-sup-native-hidden{position:absolute!important;width:0!important;height:0!important;padding:0!important;border:0!important;opacity:0!important;pointer-events:none!important;overflow:hidden!important}
    .prog-sup-combo-input{position:relative!important;z-index:9020!important;min-width:320px!important;width:100%;box-sizing:border-box;padding:9px 12px;background:#020617!important;color:#f8fafc!important;border:1px solid rgba(52,211,153,.45)!important;border-radius:10px;font-size:13.5px;outline:none}
    .prog-sup-combo-input:focus{outline:2px solid rgba(52,211,153,.35)!important;outline-offset:1px!important}
    .prog-sup-combo-portal{position:fixed;background:#020617;border:1px solid rgba(52,211,153,.35);border-radius:10px;max-height:280px;overflow-y:auto;z-index:99999;box-shadow:0 14px 38px rgba(0,0,0,.55);opacity:1;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
    .prog-sup-combo-item{padding:9px 12px;cursor:pointer;font-size:13.5px;color:#f8fafc;background:#020617}
    .prog-sup-combo-item:hover,.prog-sup-combo-item.active{background:#064e3b;color:#ffffff}
    .prog-sup-combo-empty{padding:9px 12px;font-size:13px;color:#94a3b8;font-style:italic;background:#020617}
    @media(max-width:900px){.prog-sup-combo-input{min-width:0!important}}
    .prog-f1-tabs{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}
    .prog-f1-tab{padding:9px 15px;border-radius:11px;border:1px solid rgba(111,208,165,.22);background:rgba(8,22,17,.5);color:#9fb7aa;font-weight:800;font-size:13px;cursor:pointer}
    .prog-f1-tab:hover{color:#cfe7da;border-color:rgba(111,208,165,.4)}
    .prog-f1-tab.active{background:linear-gradient(135deg,#13392a,#1f6f4a);border-color:#6fd0a5;color:#f0fff7}
  `;
  document.head.appendChild(style);
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
      // A triagem agora vive dentro da tela da equipe (Fase 1), que carrega
      // todos os status relevantes — o filtro do topo fica oculto nessa fase.
      if (currentUiStep === '1') renderEquipe();
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

function guardEquipeView() {
  if (currentUiStep !== '1') return;
  const list = document.getElementById('progList');
  if (!list || document.getElementById('peqbOsList') || document.getElementById('progEquipeLoadNow')) return;
  // A tela da Fase 1 foi substituída (ex.: o núcleo renderizou outra coisa em
  // #progList) — reconstrói.
  renderEquipe();
}

function guardFase2View() {
  if (currentUiStep !== '2' || fase2Loading) return;
  const list = document.getElementById('progList');
  if (!list || document.getElementById('f2Count') || document.getElementById('progFase2LoadNow')) return;
  renderFase2();
}

function setActiveUiStep(step) {
  document.querySelectorAll('#progSteps .stepbtn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.uiStep === step);
  });
  // O modo os-lite (compactação de cards de OS) não é usado nas novas fases.
  document.body.classList.toggle('prog-step-a-os', false);
}

// Nas fases 1 e 2 a persistência é por autosave; escondemos os controles do
// núcleo (Salvar/Buscar/Status OS) que pertenciam ao fluxo antigo de tabelas.
function hideCoreControls() {
  ['progSaveProgramacao', 'progSearchWrap'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  setStatusOsVisibility(false);
}

let fase2Loading = false;

async function renderFase2() {
  const list = document.getElementById('progList');
  const feedback = document.getElementById('progCtxFeedback');
  if (!list) return;

  setActiveUiStep('2');
  hideCoreControls();
  if (feedback) {
    feedback.className = 'feedback mt-16 prog-feedback-ok';
    feedback.textContent = 'Fase 2 — feche os custos de cada pessoa que embarca, num card só.';
  }

  const programacaoId = window.__progGetProgramacaoId?.() || null;
  if (!programacaoId) {
    const sup = document.getElementById('progSup')?.value || '';
    list.innerHTML = `
      <div class="prog-section-title"><h4>Fechar custos da equipe</h4><span class="badge">Fase 2</span></div>
      <div class="prog-os-lazy-card">
        <div><strong>Pronto para fechar custos</strong>
        <p>${sup ? `Supervisão: ${escapeHtml(sup)}.` : 'Selecione a supervisão e a data no topo.'} Clique em <b>Carregar</b> para trazer a equipe confirmada.</p></div>
        <button type="button" class="btn btn-primary" id="progFase2LoadNow">Carregar</button>
      </div>`;
    list.querySelector('#progFase2LoadNow')?.addEventListener('click', () => document.getElementById('progLoadContext')?.click());
    return;
  }

  if (fase2Loading) return;
  fase2Loading = true;
  try {
    await renderFase2Custos(list, {
      supervisao: document.getElementById('progSup')?.value || '',
      dataReferencia: document.getElementById('progDataRef')?.value || '',
      programacaoId,
    });
  } finally {
    fase2Loading = false;
  }
}

async function renderDistribuicao({ loadOs = false, force = false } = {}) {
  const list = document.getElementById('progList');
  const feedback = document.getElementById('progCtxFeedback');
  if (!list) return;

  setActiveUiStep('A');
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

function renderEquipePlaceholder(list) {
  const sup = document.getElementById('progSup')?.value || '';
  list.innerHTML = `
    <div class="prog-section-title">
      <h4>Programar OS — equipe de menor custo</h4>
      <span class="badge">Fase 1</span>
    </div>
    <div class="prog-os-lazy-card">
      <div>
        <strong>Pronto para programar as O.S.</strong>
        <p>${sup ? `Supervisão selecionada: ${escapeHtml(sup)}.` : 'Selecione a supervisão e a data no topo.'} Clique em <b>Carregar</b> para buscar as O.S. em ATENDER e sugerir a equipe de menor custo.</p>
      </div>
      <button type="button" class="btn btn-primary" id="progEquipeLoadNow">Carregar</button>
    </div>
  `;
  list.querySelector('#progEquipeLoadNow')?.addEventListener('click', () => {
    document.getElementById('progLoadContext')?.click();
  });
}

// Fase 1 "Programar O.S." = uma tela só: triar as O.S. (status ✓/aguardar/
// finalizar/saldo/conferir) e atribuir a equipe de menor custo convivem na
// mesma view (renderProgramacaoEquipe), com o bloco "Não vão atender" embaixo.
async function renderEquipe() {
  const list = document.getElementById('progList');
  const feedback = document.getElementById('progCtxFeedback');
  if (!list) return;

  setActiveUiStep('1');
  hideCoreControls();
  if (feedback) {
    feedback.className = 'feedback mt-16 prog-feedback-ok';
    feedback.textContent = 'Fase 1 — trie as O.S. (✓ atender) e atribua a equipe de menor custo, na mesma tela.';
  }

  const programacaoId = window.__progGetProgramacaoId?.() || null;
  if (!programacaoId) {
    renderEquipePlaceholder(list);
    return;
  }
  await renderProgramacaoEquipe(list, {
    supervisao: document.getElementById('progSup')?.value || '',
    dataReferencia: document.getElementById('progDataRef')?.value || '',
    programacaoId,
  });
}

function configureSteps() {
  const stepsWrap = document.getElementById('progSteps');
  if (!stepsWrap || stepsWrap.dataset.gestorAjustado === '1') return;

  const existing = [...stepsWrap.querySelectorAll('.stepbtn')];
  // Reestruturação: 7 etapas -> 3 fases.
  //  Fase 1 "Programar OS"  -> Organizar Equipe (custo-benefício, auto-preenche)
  //  Fase 2 "Fechar custos" -> card único por colaborador (estadia+desloc+alim+extras)
  //  Fase 3 "Disponibilidade" -> etapa interna 'A' do núcleo (quem não embarca)
  const layout = [
    { ui: '1', label: 'Programar OS', internal: '__equipe' },
    { ui: '2', label: 'Fechar custos', internal: '__custos' },
    { ui: '3', label: 'Disponibilidade', internal: 'A' },
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
    btn.innerHTML = `<span class="stepbtn-letter">${index + 1}</span><span class="stepbtn-label"> · ${step.label}</span>`;
  });
  // Remove botões sobrando do layout antigo de 7 etapas.
  existing.slice(layout.length).forEach((btn) => btn.remove());

  stepsWrap.dataset.gestorAjustado = '1';
  stepsWrap.addEventListener('click', (event) => {
    const btn = event.target.closest('.stepbtn');
    if (!btn) return;
    currentUiStep = btn.dataset.uiStep;
    if (btn.dataset.uiStep === '1') {
      event.preventDefault();
      event.stopImmediatePropagation();
      renderEquipe();
      return;
    }
    if (btn.dataset.uiStep === '2') {
      event.preventDefault();
      event.stopImmediatePropagation();
      renderFase2();
      return;
    }
    // Fase 3: deixa o clique chegar no listener do núcleo (data-step='A'),
    // que renderiza a Disponibilidade do restante. Mantemos aqui o botão
    // "Salvar programação" do núcleo, que finaliza e notifica a Conferência
    // (ele valida as mesmas tabelas que a Fase 2 preenche).
    setActiveUiStep('3');
    const saveBtn = document.getElementById('progSaveProgramacao');
    if (saveBtn) saveBtn.style.display = '';
    const searchWrap = document.getElementById('progSearchWrap');
    if (searchWrap) searchWrap.style.display = 'none';
    setStatusOsVisibility(false);
    if (pendingKpiReload) triggerKpiReload();
  }, true);
}

function triggerKpiReload() {
  const loadBtn = document.getElementById('progLoadContext');
  const dataRef = document.getElementById('progDataRef')?.value || '';
  const sup = document.getElementById('progSup')?.value || '';
  if (!loadBtn || !dataRef || !sup) return;
  pendingKpiReload = false;
  loadBtn.click();
}

function ensureSupDropdown() {
  if (supDropdownEl) return supDropdownEl;
  supDropdownEl = document.createElement('div');
  supDropdownEl.className = 'prog-sup-combo-portal';
  supDropdownEl.hidden = true;
  document.body.appendChild(supDropdownEl);

  document.addEventListener('mousedown', (event) => {
    if (supDropdownEl.hidden) return;
    const item = event.target.closest('.prog-sup-combo-item');
    if (item && supDropdownEl.contains(item)) {
      event.preventDefault();
      const { onSelect } = supComboState;
      const value = item.dataset.value;
      hideSupDropdown();
      if (onSelect) onSelect(value);
      return;
    }
    if (!supDropdownEl.contains(event.target) && event.target !== supComboState.input) {
      hideSupDropdown();
    }
  });
  const reposition = () => { if (supDropdownEl && !supDropdownEl.hidden && supComboState.input) positionSupDropdown(supDropdownEl, supComboState.input); };
  window.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);

  return supDropdownEl;
}

function positionSupDropdown(dd, input) {
  const rect = input.getBoundingClientRect();
  dd.style.left = `${rect.left}px`;
  dd.style.top = `${rect.bottom + 4}px`;
  dd.style.width = `${rect.width}px`;
}

function hideSupDropdown() {
  if (supDropdownEl) supDropdownEl.hidden = true;
  supComboState = { input: null, onSelect: null };
}

function abrirDropdownSupervisao(input, nativeSelect, query) {
  const dd = ensureSupDropdown();
  supComboState = {
    input,
    onSelect: (value) => {
      nativeSelect.value = value;
      nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      syncSupComboDisplay(nativeSelect);
    },
  };
  positionSupDropdown(dd, input);
  const norm = normalize(query);
  const options = [...nativeSelect.options].filter((opt) => opt.value).filter((opt) => !norm || normalize(opt.textContent).includes(norm));
  dd.hidden = false;
  dd.innerHTML = options.length
    ? options.map((opt) => `<div class="prog-sup-combo-item ${opt.value === nativeSelect.value ? 'active' : ''}" data-value="${escapeHtml(opt.value)}">${escapeHtml(opt.textContent)}</div>`).join('')
    : '<div class="prog-sup-combo-empty">Nenhuma supervisão encontrada.</div>';
}

function syncSupComboDisplay(nativeSelect) {
  const input = document.getElementById('progSupCombo');
  if (!input || document.activeElement === input) return;
  const opt = nativeSelect.options[nativeSelect.selectedIndex];
  input.value = opt && opt.value ? opt.textContent : '';
}

function ensureSupCombo() {
  const nativeSelect = document.getElementById('progSup');
  if (!nativeSelect) return;

  let input = document.getElementById('progSupCombo');
  if (!input) {
    nativeSelect.classList.add('prog-sup-native-hidden');
    nativeSelect.tabIndex = -1;
    input = document.createElement('input');
    input.type = 'text';
    input.id = 'progSupCombo';
    input.className = 'prog-sup-combo-input';
    input.placeholder = 'Selecione a supervisão...';
    input.autocomplete = 'off';
    input.spellcheck = false;
    nativeSelect.insertAdjacentElement('beforebegin', input);

    input.addEventListener('focus', () => {
      input.select();
      abrirDropdownSupervisao(input, nativeSelect, '');
    });
    input.addEventListener('input', debounce(() => abrirDropdownSupervisao(input, nativeSelect, input.value), 150));
    input.addEventListener('blur', () => {
      setTimeout(() => {
        if (supComboState.input === input) hideSupDropdown();
        syncSupComboDisplay(nativeSelect);
      }, 150);
    });
  }
  syncSupComboDisplay(nativeSelect);
}

function autoSelectSingleSupervisao() {
  const select = document.getElementById('progSup');
  if (!select || select.dataset.autoLoadChecked === '1') return;

  const options = [...select.options].filter((opt) => opt.value);
  if (!options.length) return;
  select.dataset.autoLoadChecked = '1';

  if (options.length === 1) {
    select.value = options[0].value;
    if (currentUiStep === '1') renderEquipe();
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

function bindTopLoad() {
  const loadBtn = document.getElementById('progLoadContext');
  if (!loadBtn || loadBtn.dataset.distribuicaoLoadBound === '1') return;
  loadBtn.dataset.distribuicaoLoadBound = '1';
  loadBtn.addEventListener('click', (event) => {
    // Fases 1 e 2 usam o mesmo pré-carregamento de contexto (colaboradores +
    // OS em ATENDER) que escreve em #progList; rodamos em sequência e só então
    // renderizamos a fase atual, para um não sobrescrever o outro.
    if (currentUiStep === '1') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const list = document.getElementById('progList');
      if (list) list.innerHTML = '<div class="prog-os-lazy-card"><div><strong>Carregando contexto...</strong><p>Buscando colaboradores e OS em ATENDER.</p></div></div>';
      Promise.resolve(window.__progLoadColaboradores?.()).finally(() => {
        if (currentUiStep === '1') renderEquipe();
      });
      return;
    }
    if (currentUiStep === '2') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const list = document.getElementById('progList');
      if (list) list.innerHTML = '<div class="prog-os-lazy-card"><div><strong>Carregando custos...</strong><p>Buscando a equipe confirmada.</p></div></div>';
      Promise.resolve(window.__progLoadColaboradores?.()).finally(() => {
        if (currentUiStep === '2') renderFase2();
      });
    }
    // Fase 3 (Disponibilidade): deixa o núcleo carregar/renderizar normalmente.
  }, true);
}

async function initGestorProgramacaoAjustes() {
  await waitForElement('#progSteps');
  injectGestorAjustesStyles();
  ensureStatusOsFilter();
  ensureSupCombo();
  bindTopLoad();
  configureSteps();
  setActiveUiStep('1');
  renderEquipe();

  const observer = new MutationObserver(() => {
    autoSelectSingleSupervisao();
    patchPendingOsModal();
    guardEquipeView();
    guardFase2View();
    bindTopLoad();
    ensureSupCombo();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  autoSelectSingleSupervisao();
  patchPendingOsModal();

  document.getElementById('progSup')?.addEventListener('change', () => {
    distribuicaoLoaded = false;
    pendingKpiReload = true;
    if (currentUiStep === '1') {
      renderEquipe();
    } else if (currentUiStep === '2') {
      renderFase2();
    } else {
      triggerKpiReload();
    }
  });
}

initGestorProgramacaoAjustes().catch((error) => console.warn('[programacao-ajustes]', error));
