// Programação Gestor — Etapa 1 = O.S. + despesas no mesmo card.
import { supabase } from './supabaseClient.js';
import { renderProgramacaoEquipe } from './programacao-equipe.js?v=20260630-caronas2';

let currentUiStep = '1';
let equipeRendering = false;
let equipePending = false;
let finalRenderScheduled = false;
let renderTentativas = 0;
let clobberRetries = 0;
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

function injectGestorAjustesStyles() {
  if (document.getElementById('programacaoGestorAjustesStyles')) return;
  const style = document.createElement('style');
  style.id = 'programacaoGestorAjustesStyles';
  style.textContent = `
    .prog-toolbar{position:relative!important;z-index:9000!important;overflow:visible!important}
    .prog-toolbar-row{position:relative!important;z-index:9001!important;overflow:visible!important}
    .prog-tfield-sup{flex:1 1 320px!important;max-width:520px!important;position:relative!important;z-index:9010!important;overflow:visible!important}
    .prog-tfield-sup select,#progSup{position:relative!important;z-index:9020!important;min-width:320px!important;background:#020617!important;background-color:#020617!important;color:#f8fafc!important;border-color:rgba(52,211,153,.45)!important;opacity:1!important;color-scheme:dark!important;box-shadow:0 10px 26px rgba(0,0,0,.42)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
    .prog-tfield-sup select:focus,#progSup:focus{background:#020617!important;background-color:#020617!important;color:#f8fafc!important;outline:2px solid rgba(52,211,153,.35)!important;outline-offset:1px!important}
    #progSup option,#progSup optgroup{background:#020617!important;background-color:#020617!important;color:#f8fafc!important;opacity:1!important;text-shadow:none!important}
    #progSup option:checked,#progSup option:hover{background:#064e3b!important;background-color:#064e3b!important;color:#ffffff!important}
    #progSteps,#progSteps .stepbtn{position:relative!important;z-index:0!important}
    .prog-toolbar:has(#progSup:focus) .prog-toolbar-row-steps{opacity:0!important;visibility:hidden!important;pointer-events:none!important}
    .prog-list-card,#progList,#peqbOsList{position:relative;z-index:1;overflow:visible!important}
    .prog-os-lazy-card{border:1px dashed rgba(52,211,153,.22);border-radius:18px;padding:18px;background:rgba(15,23,42,.18);color:#94a3b8;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
    .prog-os-lazy-card strong{display:block;color:#f8fafc;margin-bottom:4px;font-size:14px}
    .prog-os-lazy-card p{margin:0;font-size:13px;line-height:1.35}
    .prog-os-lazy-card .btn{min-height:38px}
    .prog-sup-native-hidden{position:absolute!important;width:0!important;height:0!important;padding:0!important;border:0!important;opacity:0!important;pointer-events:none!important;overflow:hidden!important}
    .prog-sup-combo-input{position:relative!important;z-index:9020!important;min-width:320px!important;width:100%;box-sizing:border-box;padding:9px 12px;background:#020617!important;color:#f8fafc!important;border:1px solid rgba(52,211,153,.45)!important;border-radius:10px;font-size:13.5px;outline:none}
    .prog-sup-combo-input:focus{outline:2px solid rgba(52,211,153,.35)!important;outline-offset:1px!important}
    .prog-sup-combo-portal{position:fixed;background:#020617;border:1px solid rgba(52,211,153,.35);border-radius:10px;max-height:280px;overflow-y:auto;z-index:99999;box-shadow:0 14px 38px rgba(0,0,0,.55);opacity:1;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
    .prog-sup-combo-item{padding:9px 12px;cursor:pointer;font-size:13.5px;color:#f8fafc;background:#020617}
    .prog-sup-combo-item:hover,.prog-sup-combo-item.active{background:#064e3b;color:#ffffff}
    .prog-sup-combo-empty{padding:9px 12px;font-size:13px;color:#94a3b8;font-style:italic;background:#020617}
    @media(max-width:900px){
      .prog-tfield-sup select,#progSup,.prog-sup-combo-input{min-width:0!important}
      .prog-os-lazy-card{align-items:stretch}
      .prog-os-lazy-card .btn{width:100%;justify-content:center}
    }
    @media(max-width:720px){#progSteps .stepbtn-label{display:none}}
  `;
  document.head.appendChild(style);
}

function hideCoreControls() {
  ['progSaveProgramacao', 'progSearchWrap', 'progOsStatusTopWrap'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function setActiveUiStep(step) {
  document.querySelectorAll('#progSteps .stepbtn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.uiStep === step);
  });
  document.body.classList.toggle('prog-step-a-os', false);
}

function renderIdle() {
  if (currentUiStep !== '1') return;
  const list = document.getElementById('progList');
  const feedback = document.getElementById('progCtxFeedback');
  if (feedback) {
    feedback.className = 'feedback mt-16 prog-feedback-ok';
    feedback.textContent = 'Etapa 1 — O.S. e despesas do colaborador na mesma tela.';
  }
  if (!list) return;
  const sup = document.getElementById('progSup')?.value || '';
  list.innerHTML = `
    <div class="prog-section-title">
      <h4>Programar OS — O.S. + despesas</h4>
      <span class="badge">Tela única</span>
    </div>
    <div class="prog-os-lazy-card">
      <div>
        <strong>Tela pronta para carregar</strong>
        <p>${sup ? `Supervisão selecionada: ${escapeHtml(sup)}.` : 'Selecione a supervisão e a data no topo.'} Clique em <b>Carregar</b> para montar a tela final.</p>
      </div>
      <button type="button" class="btn btn-primary" id="progEquipeLoadNow">Carregar</button>
    </div>
  `;
  list.querySelector('#progEquipeLoadNow')?.addEventListener('click', () => {
    document.getElementById('progLoadContext')?.click();
  });
}

async function marcarPendentesComoAtender(supervisao) {
  if (!supervisao) return;
  const { error } = await supabase
    .from('operacional_os')
    .update({ status_gestor: 'ATENDER', updated_at: new Date().toISOString() })
    .eq('supervisao', supervisao)
    .or('status_gestor.is.null,status_gestor.eq.PENDENTE,status_gestor.eq.AGUARDAR');
  if (error) console.warn('[programacao] não foi possível preparar O.S. como ATENDER', error);
}

async function renderEquipeFinal() {
  const list = document.getElementById('progList');
  const feedback = document.getElementById('progCtxFeedback');
  if (!list || currentUiStep !== '1') return;

  setActiveUiStep('1');
  hideCoreControls();

  const programacaoId = window.__progGetProgramacaoId?.() || null;
  const supervisao = document.getElementById('progSup')?.value || '';
  if (!programacaoId) {
    if (renderTentativas < 10) {
      renderTentativas += 1;
      scheduleFinalRender(250);
    } else {
      renderIdle();
    }
    return;
  }

  // Já existe um render em andamento: em vez de descartar o pedido (o que
  // deixaria a tela travada em "Montando..." se o núcleo tivesse sobrescrito a
  // lista no meio do caminho), marca pendência para re-renderizar ao terminar.
  if (equipeRendering) { equipePending = true; return; }
  equipeRendering = true;
  try {
    if (feedback) {
      feedback.className = 'feedback mt-16 prog-feedback-ok';
      feedback.textContent = 'Preparando O.S. e despesas em tela única...';
    }
    list.innerHTML = PROG_MONTANDO_HTML;
    await marcarPendentesComoAtender(supervisao);
    // Auto-preenche a equipe de menor custo só uma vez por contexto
    // (programação/supervisão/data) e ANTES do 1º render — a tela vai direto de
    // "preparando" para os cards confirmados, sem exibir os não confirmados.
    const dataRef = document.getElementById('progDataRef')?.value || '';
    const autoKey = [programacaoId || '', supervisao, dataRef].join('|');
    window.__progAutoEquipeKeys = window.__progAutoEquipeKeys || new Set();
    const autoPreencher = !window.__progAutoEquipeKeys.has(autoKey);
    if (autoPreencher) window.__progAutoEquipeKeys.add(autoKey);
    await renderProgramacaoEquipe(list, {
      supervisao,
      dataReferencia: dataRef,
      programacaoId,
      autoPreencher,
    });
    if (feedback) {
      feedback.className = 'feedback mt-16 prog-feedback-ok';
      feedback.textContent = 'Etapa 1 — O.S. e despesas do colaborador na mesma tela.';
    }
  } finally {
    equipeRendering = false;
    // Re-renderiza se (a) alguém pediu re-render enquanto renderizávamos, ou
    // (b) o núcleo sobrescreveu o #progList durante o render (corrida do
    // renderRows): nesse caso os cards de O.S. foram para um nó destacado e o
    // #peqbOsList não está mais anexado. Sem isso a tela trava em "Montando...".
    const clobbered = currentUiStep === '1' && !document.querySelector('#progList #peqbOsList');
    const precisaRe = equipePending || clobbered;
    equipePending = false;
    if (precisaRe && clobberRetries < 10) {
      clobberRetries += 1;
      scheduleFinalRender(0);
    } else if (!precisaRe) {
      clobberRetries = 0;
    }
  }
}

function scheduleFinalRender(delay = 250) {
  if (currentUiStep !== '1' || finalRenderScheduled) return;
  finalRenderScheduled = true;
  setTimeout(async () => {
    finalRenderScheduled = false;
    await renderEquipeFinal();
  }, delay);
}

function listShowsCoreDisponibilidade() {
  const list = document.getElementById('progList');
  if (!list) return false;
  if (list.querySelector('#peqbOsList') || list.querySelector('#progEquipeLoadNow')) return false;
  return /Disponíveis|Disponiveis|DISPONIBILIDADE|Contexto carregado/i.test(list.textContent || '');
}

const PROG_MONTANDO_HTML = '<div class="prog-os-lazy-card"><div><strong>Montando tela final...</strong><p>Organizando O.S., equipe e despesas no mesmo card.</p></div></div>';

// O núcleo (programacao.js) tem state.step = 'A' por padrão e renderiza a
// Disponibilidade no #progList ao terminar de carregar o contexto. Na aba
// "Programar O.S." (uiStep '1') isso NÃO deve aparecer — para o usuário a tela
// de cards de disponibilidade no lugar dos cards de O.S. parece um bug.
//
// O observer geral abaixo é debounced (160ms), tempo suficiente para a
// Disponibilidade pintar e "piscar"/permanecer numa carga lenta. Este guard é
// um observer SÍNCRONO ancorado direto no #progList: o callback do
// MutationObserver roda antes da pintura do browser, então trocamos o conteúdo
// pelo placeholder ANTES de o usuário ver a Disponibilidade, e disparamos o
// render final (cards de O.S.).
function attachProgListGuard() {
  const list = document.getElementById('progList');
  if (!list || list.dataset.gestorGuard === '1') return;
  list.dataset.gestorGuard = '1';
  const guard = new MutationObserver(() => {
    if (currentUiStep !== '1') return;
    if (!listShowsCoreDisponibilidade()) return;
    list.innerHTML = PROG_MONTANDO_HTML;
    scheduleFinalRender(0);
  });
  guard.observe(list, { childList: true });
}

function configureSteps() {
  const stepsWrap = document.getElementById('progSteps');
  if (!stepsWrap) return;

  const existing = [...stepsWrap.querySelectorAll('.stepbtn')];
  const layout = [
    { ui: '1', label: 'Programar O.S.', internal: '__equipe' },
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
  existing.slice(layout.length).forEach((btn) => btn.remove());

  if (stepsWrap.dataset.gestorAjustado === '1') return;
  stepsWrap.dataset.gestorAjustado = '1';
  stepsWrap.addEventListener('click', (event) => {
    const btn = event.target.closest('.stepbtn');
    if (!btn) return;
    currentUiStep = btn.dataset.uiStep;

    if (btn.dataset.uiStep === '1') {
      event.preventDefault();
      event.stopImmediatePropagation();
      setActiveUiStep('1');
      hideCoreControls();
      renderTentativas = 0;
      clobberRetries = 0;
      renderIdle();
      return;
    }

    setActiveUiStep('3');
    const saveBtn = document.getElementById('progSaveProgramacao');
    if (saveBtn) saveBtn.style.display = '';
    const searchWrap = document.getElementById('progSearchWrap');
    if (searchWrap) searchWrap.style.display = 'none';
    hideCoreControls();
  }, true);
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
      syncSupComboDisplay(nativeSelect, true);
      renderIdle();
    },
  };
  positionSupDropdown(dd, input);
  const norm = normalize(query);
  const options = [...nativeSelect.options]
    .filter((opt) => opt.value)
    .filter((opt) => !norm || normalize(opt.textContent).includes(norm));
  dd.hidden = false;
  dd.innerHTML = options.length
    ? options.map((opt) => `<div class="prog-sup-combo-item ${opt.value === nativeSelect.value ? 'active' : ''}" data-value="${escapeHtml(opt.value)}">${escapeHtml(opt.textContent)}</div>`).join('')
    : '<div class="prog-sup-combo-empty">Nenhuma supervisão encontrada.</div>';
}

function syncSupComboDisplay(nativeSelect, force = false) {
  const input = document.getElementById('progSupCombo');
  if (!input || (!force && document.activeElement === input)) return;
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
    input.addEventListener('input', () => abrirDropdownSupervisao(input, nativeSelect, input.value));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        hideSupDropdown();
        input.blur();
      }
      if (event.key === 'Enter') {
        const active = supDropdownEl?.querySelector('.prog-sup-combo-item.active') || supDropdownEl?.querySelector('.prog-sup-combo-item');
        if (active) {
          event.preventDefault();
          const value = active.dataset.value;
          hideSupDropdown();
          nativeSelect.value = value;
          nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
          syncSupComboDisplay(nativeSelect, true);
          input.blur();
          renderIdle();
        }
      }
    });
  }
  syncSupComboDisplay(nativeSelect);
  if (nativeSelect.dataset.comboBound !== '1') {
    nativeSelect.dataset.comboBound = '1';
    nativeSelect.addEventListener('change', () => {
      syncSupComboDisplay(nativeSelect, true);
      renderIdle();
    });
  }
}

function hookContextLoad() {
  const loadBtn = document.getElementById('progLoadContext');
  if (!loadBtn || loadBtn.dataset.gestorFinalBound === '1') return;
  loadBtn.dataset.gestorFinalBound = '1';
  loadBtn.addEventListener('click', () => {
    if (currentUiStep !== '1') return;
    renderTentativas = 0;
    clobberRetries = 0;
    [250, 700, 1200].forEach((delay) => setTimeout(() => scheduleFinalRender(0), delay));
  }, true);
}

function boot() {
  injectGestorAjustesStyles();
  waitForElement('#progSteps').then(() => {
    configureSteps();
    hookContextLoad();
    attachProgListGuard();
    hideCoreControls();
    ensureSupCombo();
    const sup = document.getElementById('progSup');
    if (sup) {
      const obsSup = new MutationObserver(() => ensureSupCombo());
      obsSup.observe(sup, { childList: true, subtree: true, attributes: true });
    }
    setActiveUiStep('1');
    renderIdle();
  }).catch(() => {});
}

const observer = new MutationObserver(debounce(() => {
  if (!document.getElementById('progSteps')) return;
  configureSteps();
  hookContextLoad();
  attachProgListGuard();
  hideCoreControls();
  ensureSupCombo();
  if (currentUiStep === '1' && listShowsCoreDisponibilidade()) scheduleFinalRender(150);
}, 160));
observer.observe(document.documentElement, { childList: true, subtree: true });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
