import { supabase } from './supabaseClient.js';

const VERSION = '20260818-integrado1';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');
const norm = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();
const iso = (value) => String(value || '').slice(0, 10);
const brDate = (value) => {
  const [y, m, d] = iso(value).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '-';
};
const today = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map((item) => [item.type, item.value]));
  return `${p.year}-${p.month}-${p.day}`;
};
const addDays = (date, amount) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + amount);
  return d.toISOString().slice(0, 10);
};
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const state = {
  root: null,
  observer: null,
  maintainScheduled: false,
  cancelOpen: false,
  cancelRows: [],
  cancelSearch: '',
  cancelLoading: false,
  canManual: false,
  manualPeople: [],
  manualPeopleLoaded: false,
  manualSelected: new Set(),
  manualSearch: '',
  manualSaving: false,
};

function icon(name) {
  const paths = {
    cancel: '<path d="M18 6 6 18M6 6l12 12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.plus}</svg>`;
}

function injectStyles() {
  if ($('#hospRdIntegracoesCss')) return;
  const style = document.createElement('style');
  style.id = 'hospRdIntegracoesCss';
  style.textContent = `
    .hosp-rd-tab[data-hosp-int-tab="canceladas"] svg,
    .hosp-rd-btn[data-hosp-int-action="manual-new"] svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .hosp-rd-tab[data-hosp-int-tab="canceladas"].active{color:#fecaca!important;background:rgba(127,29,29,.24)!important}
    #hospRdCanceladas .hosp-rd-table{min-width:1180px}
    #hospRdCanceladas .hosp-rd-table td{vertical-align:middle}
    #hospRdCanceladas .hosp-int-person{font-weight:800;color:#e9fff4}
    #hospRdCanceladas .hosp-int-muted{color:#91a89e;font-size:11px}
    .hosp-int-manual-btn{display:inline-flex!important;align-items:center;gap:7px;white-space:nowrap}
    #hospIntManual{position:fixed;inset:0;z-index:10120;display:none;place-items:center;padding:18px;background:rgba(0,8,5,.82);backdrop-filter:blur(6px)}
    #hospIntManual.open{display:grid}
    .hosp-int-card{width:min(780px,100%);max-height:92vh;overflow:auto;padding:22px;border:1px solid rgba(74,222,128,.25);border-radius:18px;background:#061610;box-shadow:0 25px 70px #0008}
    .hosp-int-head{display:flex;justify-content:space-between;gap:15px;margin-bottom:16px}.hosp-int-head h3{margin:0;color:#effff5}.hosp-int-head p{margin:5px 0 0;color:#8fa399;font-size:12px}
    .hosp-int-close{border:0;background:transparent;color:#c7d8d0;font-size:24px;cursor:pointer}
    .hosp-int-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.hosp-int-field{display:flex;flex-direction:column;gap:6px}.hosp-int-field.full{grid-column:1/-1}
    .hosp-int-field label{font-size:11px;font-weight:900;color:#9eb1a7;text-transform:uppercase}.hosp-int-field input,.hosp-int-field select,.hosp-int-field textarea{box-sizing:border-box;width:100%;border:1px solid #ffffff18;border-radius:11px;background:#0b2118;color:#effff5;padding:10px 11px;outline:none;color-scheme:dark}
    .hosp-int-people{max-height:250px;overflow:auto;border:1px solid #ffffff14;border-radius:11px;padding:6px}.hosp-int-person-row{display:flex;gap:9px;align-items:center;padding:8px;border-radius:8px;cursor:pointer}.hosp-int-person-row:hover{background:#4ade8010}.hosp-int-person-row input{width:16px;height:16px;accent-color:#4ade80}.hosp-int-person-row strong{display:block;font-size:12px;color:#effff5}.hosp-int-person-row small{display:block;font-size:10px;color:#82968c;margin-top:2px}
    .hosp-int-meta{font-size:11px;color:#86efac}.hosp-int-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:16px;padding-top:14px;border-top:1px solid #ffffff12}.hosp-int-actions button{border:1px solid #ffffff18;border-radius:10px;background:#0b2118;color:#dcebe4;padding:10px 14px;font-weight:850;cursor:pointer}.hosp-int-actions .primary{background:#16a34a;border-color:#22c55e;color:#04180d}.hosp-int-actions button:disabled{opacity:.5}
    .hosp-int-toast{position:fixed;right:22px;bottom:22px;z-index:10140;padding:12px 15px;border-radius:11px;background:#092319;color:#eafff1;border:1px solid #4ade8055;opacity:0;transform:translateY(8px);transition:.18s;pointer-events:none}.hosp-int-toast.show{opacity:1;transform:none}.hosp-int-toast.err{background:#2a1010;color:#fecaca;border-color:#f8717166}
    @media(max-width:680px){.hosp-int-grid{grid-template-columns:1fr}.hosp-int-field.full{grid-column:auto}}
  `;
  document.head.appendChild(style);
}

function toast(message, error = false) {
  let el = $('#hospIntToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'hospIntToast';
    el.className = 'hosp-int-toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.toggle('err', error);
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 3500);
}

function cancelPanelMarkup() {
  return `
    <div class="hosp-rd-toolbar">
      <div class="hosp-rd-title"><h3>Canceladas</h3><p>Arquivo de solicitações canceladas para consulta e auditoria.</p></div>
      <div class="hosp-rd-toolbar-right">
        <span class="hosp-int-muted" id="hospRdCanceladasMeta">${state.cancelRows.length} canceladas</span>
        <div class="hosp-rd-field hosp-rd-search"><label>Buscar</label><input data-hosp-int-search="canceladas" type="search" autocomplete="off" value="${esc(state.cancelSearch)}" placeholder="Colaborador, cidade, supervisão..." /></div>
      </div>
    </div>
    <div class="hosp-rd-table-wrap"><table class="hosp-rd-table"><thead><tr>
      <th>Solicitação</th><th>Data</th><th>Dias</th><th>Colaboradores</th><th>Cidade</th><th>UF</th><th>Supervisão</th><th>Solicitante</th><th>Cancelado por</th>
    </tr></thead><tbody id="hospRdCanceladasBody"></tbody></table></div>`;
}

function filteredCancelRows() {
  const q = norm(state.cancelSearch);
  if (!q) return state.cancelRows;
  return state.cancelRows.filter((row) => norm([
    row.solicitacao, row.data, row.dias, row.colaboradores, row.cidade, row.uf,
    row.supervisao, row.solicitante, row.cancelado_por, row.motivo_cancelamento,
  ].join(' ')).includes(q));
}

function renderCanceladas() {
  const panel = $('#hospRdCanceladas');
  if (!panel) return;
  if (!$('#hospRdCanceladasBody', panel)) panel.innerHTML = cancelPanelMarkup();
  const tbody = $('#hospRdCanceladasBody', panel);
  const rows = filteredCancelRows();
  if (!tbody) return;
  tbody.innerHTML = rows.length ? rows.map((row) => `
    <tr title="${esc(row.motivo_cancelamento || '')}">
      <td>${esc(row.solicitacao || '-')}</td>
      <td>${brDate(row.data)}</td>
      <td>${esc(row.dias ?? '-')}</td>
      <td><div class="hosp-int-person">${esc(row.colaboradores || '-')}</div></td>
      <td>${esc(row.cidade || '-')}</td>
      <td>${esc(row.uf || '-')}</td>
      <td>${esc(row.supervisao || '-')}</td>
      <td>${esc(row.solicitante || '-')}</td>
      <td>${esc(row.cancelado_por || 'Não identificado (registro antigo)')}</td>
    </tr>`).join('') : '<tr><td colspan="9"><div class="hosp-rd-empty">Nenhuma solicitação cancelada encontrada.</div></td></tr>';
  const meta = $('#hospRdCanceladasMeta', panel);
  if (meta) meta.textContent = state.cancelSearch ? `${rows.length} de ${state.cancelRows.length} canceladas` : `${state.cancelRows.length} canceladas`;
  const input = $('[data-hosp-int-search="canceladas"]', panel);
  if (input && input.value !== state.cancelSearch) input.value = state.cancelSearch;
}

async function loadCanceladas({ render = true } = {}) {
  if (state.cancelLoading) return;
  state.cancelLoading = true;
  try {
    const { data, error } = await supabase
      .from('hospedagem_canceladas')
      .select('*')
      .order('cancelado_em', { ascending: false, nullsFirst: false })
      .order('data', { ascending: false });
    if (error) throw error;
    state.cancelRows = data || [];
    const count = $('#hospRdCountCancelled');
    if (count) count.textContent = String(state.cancelRows.length);
    if (render || state.cancelOpen) renderCanceladas();
  } catch (error) {
    console.error('[hosp-integracoes] canceladas', error);
    if (render || state.cancelOpen) toast(`Não foi possível carregar canceladas: ${error.message || error}`, true);
  } finally {
    state.cancelLoading = false;
  }
}

function ensureCancelTab() {
  const tabs = state.root?.querySelector('.hosp-rd-tabs');
  if (!tabs) return;
  let tab = $('[data-hosp-int-tab="canceladas"]', tabs);
  if (!tab) {
    tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'hosp-rd-tab';
    tab.dataset.hospIntTab = 'canceladas';
    tab.innerHTML = `${icon('cancel')} Canceladas <span class="hosp-rd-count" id="hospRdCountCancelled">${state.cancelRows.length}</span>`;
    const hotels = $('[data-hosp-rd-tab="hoteis"]', tabs);
    tabs.insertBefore(tab, hotels || $('.hosp-rd-refresh', tabs));
  }
  const count = $('#hospRdCountCancelled');
  if (count) count.textContent = String(state.cancelRows.length);
}

function ensureCancelPanel() {
  if (!state.root) return;
  let panel = $('#hospRdCanceladas', state.root);
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'hospRdCanceladas';
    panel.className = 'hosp-rd-panel';
    const hotels = $('#hospRdHoteis', state.root);
    state.root.insertBefore(panel, hotels || $('#hospRdModal', state.root));
  }
  if (!panel.children.length || !$('#hospRdCanceladasBody', panel)) {
    panel.innerHTML = cancelPanelMarkup();
    renderCanceladas();
  }
}

function openCanceladas() {
  if (!state.root) return;
  state.cancelOpen = true;
  ensureCancelTab();
  ensureCancelPanel();
  $$('.hosp-rd-tab', state.root).forEach((tab) => tab.classList.remove('active'));
  $$(':scope > .hosp-rd-panel', state.root).forEach((panel) => panel.classList.remove('active'));
  $('[data-hosp-int-tab="canceladas"]', state.root)?.classList.add('active');
  $('#hospRdCanceladas', state.root)?.classList.add('active');
  renderCanceladas();
  loadCanceladas({ render: true });
}

function enforceCancelOpen() {
  if (!state.cancelOpen || !state.root) return;
  const tab = $('[data-hosp-int-tab="canceladas"]', state.root);
  const panel = $('#hospRdCanceladas', state.root);
  if (!tab || !panel) return;
  if (!tab.classList.contains('active') || !panel.classList.contains('active')) {
    $$('.hosp-rd-tab', state.root).forEach((item) => item.classList.remove('active'));
    $$(':scope > .hosp-rd-panel', state.root).forEach((item) => item.classList.remove('active'));
    tab.classList.add('active');
    panel.classList.add('active');
  }
}

async function loadManualPeople() {
  if (state.manualPeopleLoaded) return;
  const { data, error } = await supabase
    .from('colaboradores')
    .select('id,nome,cpf,empresa,coordenacao,supervisao,situacao')
    .eq('situacao', 'Ativo')
    .order('nome');
  if (error) throw error;
  state.manualPeople = data || [];
  state.manualPeopleLoaded = true;
}

function manualFilteredPeople() {
  const q = norm(state.manualSearch);
  return state.manualPeople
    .filter((person) => !q || norm(`${person.nome} ${person.cpf} ${person.supervisao} ${person.coordenacao}`).includes(q))
    .slice(0, 120);
}

function manualSelectionMeta() {
  const selected = state.manualPeople.filter((person) => state.manualSelected.has(String(person.id)));
  const supervisors = [...new Set(selected.map((person) => person.supervisao).filter(Boolean))];
  return `${selected.length} selecionado${selected.length === 1 ? '' : 's'}${supervisors.length ? ` • ${supervisors.join(' | ')}` : ''}`;
}

function renderManualPeople() {
  const box = $('#hospIntManualPeople');
  if (!box) return;
  const rows = manualFilteredPeople();
  box.innerHTML = rows.length ? rows.map((person) => {
    const id = String(person.id);
    return `<label class="hosp-int-person-row"><input type="checkbox" data-hosp-int-person="${esc(id)}" ${state.manualSelected.has(id) ? 'checked' : ''}><span><strong>${esc(person.nome)}</strong><small>${esc(person.supervisao || person.coordenacao || '')}</small></span></label>`;
  }).join('') : '<div class="hosp-rd-empty">Nenhum colaborador encontrado.</div>';
  const meta = $('#hospIntManualMeta');
  if (meta) meta.textContent = manualSelectionMeta();
}

function updateManualDays() {
  const start = $('#hospIntManualIn')?.value;
  const end = $('#hospIntManualOut')?.value;
  const meta = $('#hospIntManualDays');
  if (!meta || !start || !end) return;
  if (end < start) {
    meta.textContent = 'Período inválido';
    return;
  }
  const days = Math.max(1, Math.round((new Date(`${end}T12:00:00`) - new Date(`${start}T12:00:00`)) / 86400000) || 1);
  meta.textContent = `${days} diária${days === 1 ? '' : 's'}`;
}

function manualMarkup() {
  const start = today();
  const requester = $('#welcomeUser')?.textContent?.replace(/^Olá\s*/i, '').trim() || 'ADM de Hotéis';
  return `<div class="hosp-int-card">
    <div class="hosp-int-head"><div><h3>Nova solicitação de hospedagem</h3><p>Solicitação manual do ADM de Hotéis. Ela entra na mesma fila das solicitações do Gestor.</p></div><button class="hosp-int-close" type="button" data-hosp-int-manual-close>×</button></div>
    <div class="hosp-int-grid">
      <div class="hosp-int-field"><label>Entrada</label><input id="hospIntManualIn" type="date" value="${start}"></div>
      <div class="hosp-int-field"><label>Saída <span class="hosp-int-meta" id="hospIntManualDays"></span></label><input id="hospIntManualOut" type="date" value="${addDays(start, 1)}"></div>
      <div class="hosp-int-field"><label>Cidade</label><input id="hospIntManualCity" autocomplete="off" placeholder="Cidade da hospedagem"></div>
      <div class="hosp-int-field"><label>UF</label><select id="hospIntManualUf"><option value="">Selecione...</option>${UFS.map((uf) => `<option value="${uf}">${uf}</option>`).join('')}</select></div>
      <div class="hosp-int-field"><label>Horário previsto</label><input id="hospIntManualTime" type="time"></div>
      <div class="hosp-int-field"><label>Solicitante</label><input value="${esc(requester)}" disabled></div>
      <div class="hosp-int-field full"><label>Colaboradores</label><input id="hospIntManualSearch" type="search" autocomplete="off" placeholder="Buscar nome, CPF ou supervisão..."><div class="hosp-int-meta" id="hospIntManualMeta"></div><div class="hosp-int-people" id="hospIntManualPeople"></div></div>
      <div class="hosp-int-field full"><label>Observação</label><textarea id="hospIntManualObs" rows="3" placeholder="Informações adicionais"></textarea></div>
    </div>
    <div class="hosp-int-actions"><button type="button" data-hosp-int-manual-close>Cancelar</button><button type="button" class="primary" id="hospIntManualSave">Criar solicitação</button></div>
  </div>`;
}

async function openManualRequest() {
  try {
    await loadManualPeople();
  } catch (error) {
    toast(`Erro ao carregar colaboradores: ${error.message || error}`, true);
    return;
  }
  state.manualSelected.clear();
  state.manualSearch = '';
  let modal = $('#hospIntManual');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'hospIntManual';
    document.body.appendChild(modal);
  }
  modal.innerHTML = manualMarkup();
  modal.classList.add('open');
  renderManualPeople();
  updateManualDays();
  setTimeout(() => $('#hospIntManualCity')?.focus(), 30);
}

function closeManualRequest() {
  $('#hospIntManual')?.classList.remove('open');
}

async function saveManualRequest() {
  if (state.manualSaving) return;
  const ids = [...state.manualSelected];
  const city = $('#hospIntManualCity')?.value.trim();
  const uf = $('#hospIntManualUf')?.value;
  const checkin = $('#hospIntManualIn')?.value;
  const checkout = $('#hospIntManualOut')?.value;
  const time = $('#hospIntManualTime')?.value || null;
  const observation = $('#hospIntManualObs')?.value.trim() || null;
  if (!ids.length) return toast('Selecione ao menos um colaborador.', true);
  if (!city || !uf) return toast('Informe cidade e UF.', true);
  if (!checkin || !checkout || checkout < checkin) return toast('Confira o período da hospedagem.', true);

  state.manualSaving = true;
  const button = $('#hospIntManualSave');
  if (button) {
    button.disabled = true;
    button.textContent = 'Criando...';
  }
  try {
    const { data, error } = await supabase.rpc('hospedagem_criar_solicitacao_manual', {
      p_colaborador_ids: ids,
      p_cidade: city,
      p_uf: uf,
      p_checkin: checkin,
      p_checkout: checkout,
      p_horario_chegada: time,
      p_observacao: observation,
    });
    if (error) throw error;
    closeManualRequest();
    toast(`Solicitação criada${data ? ` • ${String(data).slice(0, 8).toUpperCase()}` : ''}`);
    setTimeout(() => $('[data-hosp-rd-action="refresh"]', state.root)?.click(), 80);
  } catch (error) {
    toast(error.message || 'Não foi possível criar a solicitação.', true);
  } finally {
    state.manualSaving = false;
    if (button) {
      button.disabled = false;
      button.textContent = 'Criar solicitação';
    }
  }
}

function ensureManualButton() {
  if (!state.canManual || !state.root) return;
  const toolbar = $('#hospRdSolicitacoes .hosp-rd-toolbar-right', state.root);
  if (!toolbar || $('[data-hosp-int-action="manual-new"]', toolbar)) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hosp-rd-btn primary hosp-int-manual-btn';
  button.dataset.hospIntAction = 'manual-new';
  button.innerHTML = `${icon('plus')} Nova solicitação`;
  toolbar.prepend(button);
}

function restoreMainSearchFocus(target) {
  const scope = target.dataset?.hospRdSearch;
  if (!scope) return;
  const value = target.value;
  const start = target.selectionStart;
  const end = target.selectionEnd;
  const locator = `[data-hosp-rd-search="${CSS.escape(scope)}"]`;
  const restore = () => {
    const replacement = $(locator, state.root || document);
    if (!replacement || replacement.disabled) return;
    replacement.value = value;
    replacement.focus({ preventScroll: true });
    try {
      const length = replacement.value.length;
      replacement.setSelectionRange(Math.min(start ?? length, length), Math.min(end ?? length, length));
    } catch {}
  };
  queueMicrotask(restore);
  requestAnimationFrame(restore);
}

function scheduleMaintain() {
  if (state.maintainScheduled) return;
  state.maintainScheduled = true;
  requestAnimationFrame(() => {
    state.maintainScheduled = false;
    if (!state.root?.isConnected) return;
    ensureCancelTab();
    ensureCancelPanel();
    ensureManualButton();
    enforceCancelOpen();
  });
}

function bind() {
  state.root.addEventListener('click', (event) => {
    const cancelTab = event.target.closest('[data-hosp-int-tab="canceladas"]');
    if (cancelTab) {
      event.preventDefault();
      event.stopPropagation();
      openCanceladas();
      return;
    }
    if (event.target.closest('[data-hosp-rd-tab]')) state.cancelOpen = false;
    if (event.target.closest('[data-hosp-int-action="manual-new"]')) {
      event.preventDefault();
      openManualRequest();
    }
  }, true);

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-hosp-int-manual-close]') || event.target.id === 'hospIntManual') closeManualRequest();
    if (event.target.closest('#hospIntManualSave')) saveManualRequest();
  });

  document.addEventListener('input', (event) => {
    if (event.target.matches?.('[data-hosp-rd-search]')) restoreMainSearchFocus(event.target);
    if (event.target.matches?.('[data-hosp-int-search="canceladas"]')) {
      const value = event.target.value;
      const start = event.target.selectionStart;
      const end = event.target.selectionEnd;
      state.cancelSearch = value;
      renderCanceladas();
      const replacement = $('[data-hosp-int-search="canceladas"]', state.root);
      if (replacement) {
        replacement.focus({ preventScroll: true });
        try { replacement.setSelectionRange(start ?? value.length, end ?? value.length); } catch {}
      }
    }
    if (event.target.id === 'hospIntManualSearch') {
      state.manualSearch = event.target.value;
      renderManualPeople();
      $('#hospIntManualSearch')?.focus({ preventScroll: true });
    }
    if (event.target.id === 'hospIntManualIn' || event.target.id === 'hospIntManualOut') updateManualDays();
  }, true);

  document.addEventListener('change', (event) => {
    const checkbox = event.target.closest?.('[data-hosp-int-person]');
    if (!checkbox) return;
    const id = String(checkbox.dataset.hospIntPerson || '');
    if (!id) return;
    if (checkbox.checked) state.manualSelected.add(id);
    else state.manualSelected.delete(id);
    const meta = $('#hospIntManualMeta');
    if (meta) meta.textContent = manualSelectionMeta();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeManualRequest();
  });

  state.observer = new MutationObserver(scheduleMaintain);
  state.observer.observe(state.root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
}

async function init() {
  let attempts = 0;
  while (!$('#hospRedesignRoot') && attempts < 100) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    attempts += 1;
  }
  state.root = $('#hospRedesignRoot');
  if (!state.root) return;
  injectStyles();

  try {
    const { data, error } = await supabase.rpc('hospedagem_pode_criar_solicitacao_manual');
    state.canManual = !error && data === true;
  } catch {
    state.canManual = false;
  }

  ensureCancelTab();
  ensureCancelPanel();
  ensureManualButton();
  bind();
  loadCanceladas({ render: false });
  scheduleMaintain();
  console.info(`[hosp-integracoes] ativo ${VERSION}`);
}

init();
