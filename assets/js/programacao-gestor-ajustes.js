// Programação Gestor — cria os 3 botões de etapa (1 Situação da O.S., 2 Equipe
// + Mapa, 3 Despesas) e o combo de supervisão pesquisável. A renderização das
// 3 abas em si (todas de uma vez, sem reload ao trocar de aba) é feita por
// programacao-gestor-fluxo-avancado.js — este arquivo NÃO escreve mais em
// #progList sozinho (fazia isso antes e entrava em corrida com o fluxo novo,
// sobrescrevendo o wrapper das 3 abas e deixando os botões 2/3 mortos).
import { TODAS_SUPERVISOES } from './programacao-gestor-filtro-fix.js';

let currentUiStep = '1';
let supDropdownEl = null;
let supComboState = { input: null, onSelect: null };

const STEP_LABELS = {
  '1': { label: 'Situação da O.S.', title: 'Situação da O.S.' },
  '2': { label: 'Equipe e mapa do gestor', title: 'Equipe + Mapa' },
  '3': { label: 'Despesas da equipe', title: 'Despesas' },
};

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
    .replace(/[̀-ͯ]/g, '')
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
    .prog-os-lazy-card.is-loading{justify-content:flex-start}
    .prog-os-lazy-card strong{display:block;color:#f8fafc;margin-bottom:4px;font-size:14px}
    .prog-os-lazy-card p{margin:0;font-size:13px;line-height:1.35}
    .prog-os-lazy-card .btn{min-height:38px}
    .prog-spinner{width:28px;height:28px;border-radius:999px;border:3px solid rgba(111,208,165,.18);border-top-color:#6fd0a5;flex:0 0 auto;animation:progSpin .75s linear infinite}
    @keyframes progSpin{to{transform:rotate(360deg)}}
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

// Placeholder mostrado só antes do primeiro "Carregar" (ou depois de trocar a
// supervisão, antes de recarregar). Uma vez que o fluxo novo monta as 3 abas
// em #pgcPane1/2/3, os cliques nos botões de etapa são interceptados por
// programacao-gestor-fluxo-avancado.js antes de chegar aqui — este texto só
// aparece se o usuário ainda não clicou em Carregar.
function renderIdle() {
  const list = document.getElementById('progList');
  const feedback = document.getElementById('progCtxFeedback');
  const info = STEP_LABELS[currentUiStep] || STEP_LABELS['1'];
  if (feedback) {
    feedback.className = 'feedback mt-16 prog-feedback-ok';
    feedback.textContent = `Etapa ${currentUiStep} — ${info.label}.`;
  }
  if (!list) return;
  const sup = document.getElementById('progSup')?.value || '';
  list.innerHTML = `
    <div class="prog-section-title">
      <h4>${info.title}</h4>
      <span class="badge">Etapa ${currentUiStep}</span>
    </div>
    <div class="prog-os-lazy-card">
      <div>
        <strong>Tela pronta para carregar</strong>
        <p>${sup ? `Supervisão selecionada: ${escapeHtml(sup)}.` : 'Selecione a supervisão e a data no topo.'} Use o botão Carregar no topo para montar a tela final.</p>
      </div>
    </div>
  `;
}

// O núcleo (programacao.js) tem state.step = 'A' por padrão e, quando termina
// de carregar o contexto sozinho, escreve a Disponibilidade nativa em
// #progList — mesmo depois do fluxo novo (programacao-gestor-fluxo-avancado.js)
// já ter montado o wrapper #pgcTabsShell com as 3 abas. Sem esse guard, essa
// Disponibilidade nativa aparece por cima das abas. Ao contrário da versão
// antiga deste guard, NÃO renderizamos nada aqui: só detectamos o vazamento e
// pedimos pro fluxo novo remontar (window.__pgcProgramacaoReload, exposto por
// programacao-gestor-fluxo-avancado.js) — assim não competimos pelo #progList.
// Checagem barata (querySelector, sem serializar o textContent da árvore
// inteira toda hora): .colab-name/.colab-meta/.prog-status só existem no
// colabCell() do núcleo (programacao.js), nunca nos templates das 3 abas.
function listShowsCoreDisponibilidade() {
  const list = document.getElementById('progList');
  if (!list) return false;
  if (list.querySelector('#pgcTabsShell')) return false;
  return !!list.querySelector('.colab-name, .colab-meta, .prog-status, .table-empty');
}

function attachProgListGuard() {
  const list = document.getElementById('progList');
  if (!list || list.dataset.gestorGuard === '1') return;
  list.dataset.gestorGuard = '1';
  const guard = new MutationObserver(() => {
    if (!listShowsCoreDisponibilidade()) return;
    window.__pgcProgramacaoReload?.();
  });
  guard.observe(list, { childList: true });
}

// Defesa definitiva: os guards acima são REATIVOS (detectam o vazamento
// depois que ele já apareceu e pedem pro fluxo novo remontar) — dependem de
// timing de MutationObserver/polling que, na prática, às vezes não pega a
// tempo e o usuário chega a ver a Disponibilidade nativa por um bom tempo.
// Em vez de corrigir depois, intercepta a ESCRITA em si: sobrescreve o
// setter nativo de innerHTML só em #progList e ignora silenciosamente
// qualquer valor que pareça a Disponibilidade nativa (tem .colab-name/
// .colab-meta/.prog-status, exclusivos de colabCell() no núcleo) e não seja
// o wrapper das 3 abas nem o placeholder daqui. Todo o resto passa normal.
function installProgListWriteGuard(list) {
  if (!list || list.dataset.gestorWriteGuard === '1') return;
  list.dataset.gestorWriteGuard = '1';
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')
    || Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerHTML');
  const nativeSet = descriptor?.set;
  const nativeGet = descriptor?.get;
  if (!nativeSet || !nativeGet) return;
  Object.defineProperty(list, 'innerHTML', {
    configurable: true,
    get() { return nativeGet.call(this); },
    set(html) {
      if (typeof html === 'string' && !html.includes('id="pgcTabsShell"') && /colab-name|colab-meta|prog-status|table-empty/.test(html)) {
        console.warn('[gestor-ajustes] bloqueada escrita da Disponibilidade nativa em #progList');
        return;
      }
      nativeSet.call(this, html);
    },
  });
}

// Rede de segurança: o núcleo também escuta o Realtime de programacao_colaboradores
// (mesma tabela que os vínculos do mapa gravam) e chama sua própria renderRows()
// quando essa tabela muda — não só ao carregar o contexto. Isso pode clobbrar
// #progList bem depois do attachProgListGuard já ter sido "satisfeito" uma vez, e
// depende de detalhes de timing do MutationObserver que às vezes falham. Um
// polling simples (a cada 1.2s) é o jeito mais confiável de nunca deixar a
// Disponibilidade nativa visível por muito tempo, custando quase nada.
let ultimoReloadVazamento = 0;
function checarVazamentoPeriodico() {
  if (!listShowsCoreDisponibilidade()) return;
  const agora = Date.now();
  if (agora - ultimoReloadVazamento < 2000) return;
  ultimoReloadVazamento = agora;
  window.__pgcProgramacaoReload?.();
}
setInterval(checarVazamentoPeriodico, 1200);

function configureSteps() {
  const stepsWrap = document.getElementById('progSteps');
  if (!stepsWrap) return;

  const existing = [...stepsWrap.querySelectorAll('.stepbtn')];
  const layout = [
    { ui: '1', label: STEP_LABELS['1'].title },
    { ui: '2', label: STEP_LABELS['2'].title },
    { ui: '3', label: STEP_LABELS['3'].title },
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
    btn.innerHTML = `<span class="stepbtn-letter">${index + 1}</span><span class="stepbtn-label"> · ${step.label}</span>`;
  });
  existing.slice(layout.length).forEach((btn) => btn.remove());

  if (stepsWrap.dataset.gestorAjustado === '1') return;
  stepsWrap.dataset.gestorAjustado = '1';
  // Fallback: só roda se programacao-gestor-fluxo-avancado.js ainda não tiver
  // as abas montadas (state.panes null lá) — nesse caso ele deixa o clique
  // passar em vez de consumir com stopImmediatePropagation.
  stepsWrap.addEventListener('click', (event) => {
    const btn = event.target.closest('.stepbtn');
    if (!btn) return;
    event.preventDefault();
    currentUiStep = btn.dataset.uiStep;
    setActiveUiStep(currentUiStep);
    hideCoreControls();
    renderIdle();
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

  // Defesa contra re-render duplicado do toolbar (ex.: initProtectedPage sendo
  // acionado 2x, uma via navegação suave e outra pelo boot interno do módulo):
  // se sobrar mais de um <select id="progSup"> ou mais de um combo já montado
  // no mesmo wrapper, mantém só o par oficial (o select atual + seu combo) e
  // remove o resto — evita a barra de Supervisão aparecer duplicada.
  const wrap = nativeSelect.closest('.prog-tfield-sup');
  if (wrap) {
    wrap.querySelectorAll('select#progSup').forEach((sel) => { if (sel !== nativeSelect) sel.remove(); });
    wrap.querySelectorAll('#progSupCombo').forEach((el, index) => { if (index > 0) el.remove(); });
  }

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

function boot() {
  injectGestorAjustesStyles();
  waitForElement('#progSteps').then(() => {
    configureSteps();
    hideCoreControls();
    ensureSupCombo();
    attachProgListGuard();
    installProgListWriteGuard(document.getElementById('progList'));
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
  hideCoreControls();
  ensureSupCombo();
  attachProgListGuard();
  installProgListWriteGuard(document.getElementById('progList'));
}, 160));
observer.observe(document.documentElement, { childList: true, subtree: true });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
