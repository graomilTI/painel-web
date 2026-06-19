// Ajustes do Gestor: Programação passa a concentrar Distribuição de O.S. + etapas operacionais.

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

function buildPanelHref(path = '') {
  const target = String(path || '').replace(/^\/+/, '').replace(/\.html$/i, '');
  const host = String(window.location.hostname || '').toLowerCase();
  if (host === 'grao1000.com.br' || host === 'www.grao1000.com.br') {
    return target ? `/painel/${target}`.replace(/([^:]\/)\/+/, '$1') : '/painel';
  }
  const base = window.location.pathname.includes('/painel/') ? '/painel/' : './';
  return base === './' ? `./${target}` : `${base}${target}`;
}

function buildOsEmbeddedUrl() {
  const sup = document.getElementById('progSup')?.value || '';
  const dataRef = document.getElementById('progDataRef')?.value || '';
  const url = new URL(buildPanelHref('os'), window.location.href);
  url.searchParams.set('embedded', '1');
  if (sup) url.searchParams.set('supervisao', sup);
  if (dataRef) url.searchParams.set('data', dataRef);
  return url.pathname + url.search + url.hash;
}

function setSaveVisibility(isDistribuicao) {
  const saveBtn = document.getElementById('progSaveProgramacao');
  const search = document.getElementById('progSearch')?.closest('.filters-grid');
  if (saveBtn) saveBtn.style.display = isDistribuicao ? 'none' : '';
  if (search) search.style.display = isDistribuicao ? 'none' : '';
}

let currentUiStep = 'A';

function guardDistribuicaoView() {
  if (currentUiStep !== 'A') return;
  const list = document.getElementById('progList');
  if (!list || document.getElementById('progDistribuicaoOsFrame')) return;
  renderDistribuicao();
}

function setActiveDistribution() {
  document.querySelectorAll('#progSteps .stepbtn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.uiStep === 'A');
  });
}

function renderDistribuicao() {
  const list = document.getElementById('progList');
  const feedback = document.getElementById('progCtxFeedback');
  if (!list) return;

  setActiveDistribution();
  setSaveVisibility(true);
  if (feedback) {
    const sup = document.getElementById('progSup')?.value || '';
    feedback.className = 'feedback mt-16 prog-feedback-ok';
    feedback.textContent = sup
      ? `Distribuição carregada para ${sup}.`
      : 'Distribuição carregada conforme as supervisões liberadas no login do gestor.';
  }

  list.innerHTML = `
    <div class="prog-section-title">
      <h4>Distribuição de O.S.</h4>
      <span class="badge">Etapa A</span>
    </div>
    <div class="prog-empty-section" style="margin-bottom:12px">
      As O.S. que precisam de verificação ficam aqui. Quando o gestor tiver mais de uma supervisão, a lista é carregada por blocos de supervisão.
    </div>
    <iframe
      id="progDistribuicaoOsFrame"
      title="Distribuição de O.S."
      src="${buildOsEmbeddedUrl()}"
      style="width:100%;min-height:980px;border:0;border-radius:18px;background:transparent;display:block"
      loading="eager"></iframe>
  `;
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
      renderDistribuicao();
      return;
    }
    setSaveVisibility(false);
  }, true);
}

function autoLoadSingleSupervisao() {
  const select = document.getElementById('progSup');
  const loadBtn = document.getElementById('progLoadContext');
  if (!select || !loadBtn || select.dataset.autoLoadChecked === '1') return;

  const options = [...select.options].filter((opt) => opt.value);
  if (!options.length) return;
  select.dataset.autoLoadChecked = '1';

  if (options.length === 1) {
    select.value = options[0].value;
    setTimeout(() => {
      loadBtn.click();
      setTimeout(() => {
        const active = document.querySelector('#progSteps .stepbtn.active');
        if (!active || active.dataset.uiStep === 'A') renderDistribuicao();
      }, 1800);
    }, 250);
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
      renderDistribuicao();
    }, true);
  }
}

async function initGestorProgramacaoAjustes() {
  await waitForElement('#progSteps');
  configureSteps();
  renderDistribuicao();

  const observer = new MutationObserver(() => {
    autoLoadSingleSupervisao();
    patchPendingOsModal();
    guardDistribuicaoView();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  autoLoadSingleSupervisao();
  patchPendingOsModal();

  document.getElementById('progSup')?.addEventListener('change', () => {
    if (currentUiStep === 'A') renderDistribuicao();
  });
}

initGestorProgramacaoAjustes().catch((error) => console.warn('[programacao-ajustes]', error));