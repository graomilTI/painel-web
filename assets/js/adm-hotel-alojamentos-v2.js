import { supabase } from './supabaseClient.js';
import { loadUserContext } from './sessionStore.js';
import { normalizeText, nullableBoolean, ensureStyles, composeObservations, hydrateRow, esc } from './adm-hotel-alojamentos-v2-helpers.js?v=20260721-obs1';
import { panelHtml, renderRows, renderDetailsContent, renderObsCalendar, renderObsList, isoDate } from './adm-hotel-alojamentos-v2-view.js?v=20260804-multisupervisao1';
import { mensagemFalhaSalvar } from './rls-sessao-expirada.js';

const state = { rows: [], editingId: null, selectedDetailsId: null, query: '', mountTimer: null, supervisoes: [] };
const obsState = { alojamentoId: null, year: 0, month: 0, selectedDate: '' };
let toastTimer = null;

function getValue(id) { return document.getElementById(id)?.value ?? ''; }
function setValue(id, value) { const el = document.getElementById(id); if (el) el.value = value ?? ''; }
function getValues(id) {
  const el = document.getElementById(id);
  return el ? [...el.selectedOptions].map((option) => option.value).filter(Boolean) : [];
}
function setValues(id, values = []) {
  const el = document.getElementById(id);
  if (!el) return;
  const selected = new Set(values.map((value) => String(value || '').trim()).filter(Boolean));
  [...el.options].forEach((option) => { option.selected = selected.has(option.value); });
}
function rowSupervisoes(row = {}) {
  return [...new Set([
    ...(Array.isArray(row.supervisoes) ? row.supervisoes : []),
    row.supervisao,
  ].map((value) => String(value || '').trim()).filter(Boolean))];
}

function feedback(message, type = '') {
  const el = document.getElementById('alojV2Feedback');
  if (!el) return;
  el.textContent = message || '';
  el.className = `aloj-v2-feedback ${type}`.trim();
}

function toast(message, type = '') {
  const el = document.getElementById('alojV2Toast');
  if (!el) return;
  clearTimeout(toastTimer);
  el.textContent = message;
  el.className = `aloj-v2-toast ${type} show`.trim();
  toastTimer = setTimeout(() => { el.className = 'aloj-v2-toast'; }, 3200);
}

async function loadSupervisoes() {
  if (state.supervisoes.length) return;
  const select = document.getElementById('alojV2Supervisao');
  const { data, error } = await supabase.from('supervisoes').select('nome').eq('ativo', true).order('nome', { ascending: true });
  if (error) {
    if (select) select.innerHTML = '<option value="" disabled>Não foi possível carregar</option>';
    return;
  }
  state.supervisoes = (data || []).map((row) => row.nome).filter(Boolean);
  if (select) {
    select.innerHTML = state.supervisoes.map((nome) => `<option value="${esc(nome)}">${esc(nome)}</option>`).join('');
  }
}

function resetForm() {
  state.editingId = null;
  document.getElementById('alojV2Form')?.reset();
  setValue('alojV2Tipo', 'CASA');
  setValue('alojV2Status', 'ATIVO');
  setValue('alojV2Prioridade', 'NORMAL');
  const title = document.getElementById('alojV2ModalTitle');
  const save = document.getElementById('alojV2Save');
  if (title) title.textContent = 'Novo alojamento';
  if (save) save.textContent = 'Salvar alojamento';
  feedback('');
}

function openModal(row = null) {
  resetForm();
  if (row) {
    state.editingId = row.id;
    const values = {
      alojV2Nome: row.nome, alojV2Tipo: row.tipo || 'CASA', alojV2Status: row.status || 'ATIVO', alojV2Responsavel: row.responsavel,
      alojV2Contato: row.contato, alojV2Aluguel: row.valor_aluguel, alojV2Capacidade: row.capacidade, alojV2Quartos: row.quartos,
      alojV2Prioridade: row.prioridade || 'NORMAL', alojV2ContratoUrl: row.contrato_url, alojV2ContratoInicio: row.contrato_inicio,
      alojV2ContratoFim: row.contrato_fim, alojV2Logradouro: row.endereco_logradouro || row.endereco, alojV2Numero: row.endereco_numero,
      alojV2Complemento: row.endereco_complemento, alojV2Bairro: row.bairro, alojV2Cidade: row.cidade, alojV2Uf: row.uf,
      alojV2Cep: row.cep, alojV2Referencia: row.referencia, alojV2Localizacao: row.link_localizacao,
      alojV2AguaInclusa: row.agua_inclusa === null ? '' : String(row.agua_inclusa), alojV2AguaTitular: row.agua_titular, alojV2AguaMatricula: row.agua_matricula,
      alojV2EnergiaInclusa: row.energia_inclusa === null ? '' : String(row.energia_inclusa), alojV2EnergiaTitular: row.energia_titular, alojV2EnergiaMatricula: row.energia_matricula,
      alojV2InternetInclusa: row.internet_inclusa === null ? '' : String(row.internet_inclusa), alojV2InternetTitular: row.internet_titular, alojV2InternetMatricula: row.internet_matricula,
      alojV2EmpresaInternet: row.empresa_internet, alojV2GasTitular: row.gas_titular, alojV2GasPagamento: row.gas_forma_pagamento, alojV2Observacoes: row.observacoes_limpa
    };
    Object.entries(values).forEach(([id, value]) => setValue(id, value));
    setValues('alojV2Supervisao', rowSupervisoes(row));
    document.getElementById('alojV2ModalTitle').textContent = 'Editar alojamento';
    document.getElementById('alojV2Save').textContent = 'Salvar alterações';
  }
  const modal = document.getElementById('alojV2Modal');
  modal?.classList.add('open');
  modal?.setAttribute('aria-hidden', 'false');
  setTimeout(() => document.getElementById('alojV2Nome')?.focus(), 40);
}

function closeModal() {
  const modal = document.getElementById('alojV2Modal');
  modal?.classList.remove('open');
  modal?.setAttribute('aria-hidden', 'true');
  feedback('');
}

function openDetails(row) {
  state.selectedDetailsId = row.id;
  const modal = document.getElementById('alojV2DetailsModal');
  const body = document.getElementById('alojV2DetailsBody');
  const title = document.getElementById('alojV2DetailsTitle');
  const subtitle = document.getElementById('alojV2DetailsSubtitle');
  if (!modal || !body) return;
  body.innerHTML = renderDetailsContent(row);
  if (title) title.textContent = row.nome || 'Alojamento';
  if (subtitle) subtitle.textContent = `${row.tipo || 'CASA'} · ${[row.cidade, row.uf].filter(Boolean).join('/') || 'Local não informado'}`;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeDetails() {
  state.selectedDetailsId = null;
  const modal = document.getElementById('alojV2DetailsModal');
  modal?.classList.remove('open');
  modal?.setAttribute('aria-hidden', 'true');
}

function authorName() {
  const ctx = loadUserContext();
  return ctx?.user?.nome || ctx?.user?.name || ctx?.user?.email || 'Sistema';
}

function notesByDate(notes) {
  return notes.reduce((map, note) => {
    (map[note.data] || (map[note.data] = [])).push(note);
    return map;
  }, {});
}

function renderObsPanel() {
  const row = state.rows.find((item) => String(item.id) === String(obsState.alojamentoId));
  if (!row) return;
  renderObsCalendar(obsState.year, obsState.month, notesByDate(row.anotacoes || []), obsState.selectedDate);
  renderObsList(row.anotacoes || [], obsState.selectedDate);
}

function openObs(row) {
  obsState.alojamentoId = row.id;
  const today = new Date();
  obsState.year = today.getFullYear();
  obsState.month = today.getMonth();
  obsState.selectedDate = isoDate(today);
  const title = document.getElementById('alojV2ObsTitle');
  if (title) title.textContent = row.nome || 'Alojamento';
  const dataInput = document.getElementById('alojV2ObsData');
  if (dataInput) dataInput.value = obsState.selectedDate;
  const textarea = document.getElementById('alojV2ObsTexto');
  if (textarea) textarea.value = '';
  const obsFeedback = document.getElementById('alojV2ObsFeedback');
  if (obsFeedback) obsFeedback.textContent = '';
  renderObsPanel();
  const modal = document.getElementById('alojV2ObsModal');
  modal?.classList.add('open');
  modal?.setAttribute('aria-hidden', 'false');
}

function closeObs() {
  obsState.alojamentoId = null;
  const modal = document.getElementById('alojV2ObsModal');
  modal?.classList.remove('open');
  modal?.setAttribute('aria-hidden', 'true');
}

async function persistNotes(row, anotacoes) {
  const result = await supabase.from('hospedagem_alojamentos').update({ anotacoes }).eq('id', row.id);
  if (result.error) return false;
  row.anotacoes = anotacoes;
  return true;
}

async function addNote(event) {
  event.preventDefault();
  const row = state.rows.find((item) => String(item.id) === String(obsState.alojamentoId));
  const obsFeedback = document.getElementById('alojV2ObsFeedback');
  if (!row) return;
  const data = document.getElementById('alojV2ObsData')?.value;
  const texto = document.getElementById('alojV2ObsTexto')?.value.trim();
  if (!data || !texto) { if (obsFeedback) { obsFeedback.textContent = 'Informe a data e a anotação.'; obsFeedback.className = 'aloj-v2-feedback err'; } return; }
  const note = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, data, texto, autor: authorName(), criado_por: loadUserContext()?.user?.id || null, criado_em: new Date().toISOString() };
  const anotacoes = [...(row.anotacoes || []), note];
  if (obsFeedback) { obsFeedback.textContent = 'Salvando...'; obsFeedback.className = 'aloj-v2-feedback'; }
  const ok = await persistNotes(row, anotacoes);
  if (!ok) { if (obsFeedback) { obsFeedback.textContent = 'Não foi possível salvar a anotação.'; obsFeedback.className = 'aloj-v2-feedback err'; } return; }
  const textarea = document.getElementById('alojV2ObsTexto');
  if (textarea) textarea.value = '';
  if (obsFeedback) { obsFeedback.textContent = 'Anotação adicionada.'; obsFeedback.className = 'aloj-v2-feedback ok'; }
  obsState.selectedDate = data;
  renderObsPanel();
}

async function deleteNote(noteId) {
  const row = state.rows.find((item) => String(item.id) === String(obsState.alojamentoId));
  if (!row || !window.confirm('Excluir esta anotação?')) return;
  const anotacoes = (row.anotacoes || []).filter((note) => String(note.id) !== String(noteId));
  const ok = await persistNotes(row, anotacoes);
  if (!ok) return toast('Não foi possível excluir a anotação.', 'err');
  renderObsPanel();
}

function shiftObsMonth(delta) {
  const date = new Date(obsState.year, obsState.month + delta, 1);
  obsState.year = date.getFullYear();
  obsState.month = date.getMonth();
  renderObsPanel();
}

function bindObsPanel(panel) {
  document.getElementById('alojV2ObsClose')?.addEventListener('click', closeObs);
  document.getElementById('alojV2ObsForm')?.addEventListener('submit', addNote);
  document.getElementById('alojV2ObsPrev')?.addEventListener('click', () => shiftObsMonth(-1));
  document.getElementById('alojV2ObsNext')?.addEventListener('click', () => shiftObsMonth(1));
  document.getElementById('alojV2ObsModal')?.addEventListener('click', (event) => {
    if (event.target === document.getElementById('alojV2ObsModal')) closeObs();
    const dayButton = event.target.closest('[data-date]');
    if (dayButton) {
      obsState.selectedDate = dayButton.dataset.date;
      const dataInput = document.getElementById('alojV2ObsData');
      if (dataInput) dataInput.value = obsState.selectedDate;
      renderObsPanel();
      return;
    }
    const deleteButton = event.target.closest('.aloj-v2-obs-delete');
    if (deleteButton) deleteNote(deleteButton.dataset.id);
  });
}

function readForm() {
  const boolValue = (id) => nullableBoolean(getValue(id));
  return {
    nome: getValue('alojV2Nome').trim(), tipo: getValue('alojV2Tipo') || 'CASA', status: getValue('alojV2Status') || 'ATIVO',
    responsavel: getValue('alojV2Responsavel').trim(), contato: getValue('alojV2Contato').trim(), valor_aluguel: getValue('alojV2Aluguel'),
    capacidade: getValue('alojV2Capacidade'), quartos: getValue('alojV2Quartos'), prioridade: getValue('alojV2Prioridade') || 'NORMAL',
    supervisoes: getValues('alojV2Supervisao'),
    supervisao: getValues('alojV2Supervisao')[0] || '',
    contrato_url: getValue('alojV2ContratoUrl').trim(), contrato_inicio: getValue('alojV2ContratoInicio'), contrato_fim: getValue('alojV2ContratoFim'),
    endereco_logradouro: getValue('alojV2Logradouro').trim(), endereco_numero: getValue('alojV2Numero').trim(), endereco_complemento: getValue('alojV2Complemento').trim(),
    bairro: getValue('alojV2Bairro').trim(), cidade: getValue('alojV2Cidade').trim(), uf: getValue('alojV2Uf').trim().toUpperCase().slice(0, 2),
    cep: getValue('alojV2Cep').trim(), referencia: getValue('alojV2Referencia').trim(), link_localizacao: getValue('alojV2Localizacao').trim(),
    agua_inclusa: boolValue('alojV2AguaInclusa'), agua_titular: getValue('alojV2AguaTitular').trim(), agua_matricula: getValue('alojV2AguaMatricula').trim(),
    energia_inclusa: boolValue('alojV2EnergiaInclusa'), energia_titular: getValue('alojV2EnergiaTitular').trim(), energia_matricula: getValue('alojV2EnergiaMatricula').trim(),
    internet_inclusa: boolValue('alojV2InternetInclusa'), internet_titular: getValue('alojV2InternetTitular').trim(), internet_matricula: getValue('alojV2InternetMatricula').trim(),
    empresa_internet: getValue('alojV2EmpresaInternet').trim(), gas_titular: getValue('alojV2GasTitular').trim(), gas_forma_pagamento: getValue('alojV2GasPagamento').trim(),
    observacoes: getValue('alojV2Observacoes').trim()
  };
}

function schemaCompatibilityError(error) {
  const message = normalizeText(error?.message || '');
  return message.includes('schema cache') || message.includes('does not exist') || message.includes('could not find') || message.includes('column');
}

const geocodeCache = new Map();
// Mapa Operacional só desenha o alojamento se ele tiver coordenada — geocodifica por
// cidade/UF (sem endereço completo, a maioria dos cadastros só tem isso) ao salvar, em vez
// de depender de um backfill manual toda vez que um alojamento novo entra.
async function geocodeCidadeUf(cidade, uf) {
  const chave = `${normalizeText(cidade)}|${normalizeText(uf)}`;
  if (geocodeCache.has(chave)) return geocodeCache.get(chave);
  const promise = fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&country=Brazil&city=${encodeURIComponent(cidade)}&state=${encodeURIComponent(uf)}`, {
    headers: { 'Accept-Language': 'pt-BR' },
  })
    .then((r) => (r.ok ? r.json() : []))
    .then((rows) => {
      const first = Array.isArray(rows) ? rows[0] : null;
      const lat = Number(first?.lat), lng = Number(first?.lon);
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    })
    .catch(() => null);
  geocodeCache.set(chave, promise);
  return promise;
}

async function persist(payload) {
  if (state.editingId) return supabase.from('hospedagem_alojamentos').update(payload).eq('id', state.editingId);
  return supabase.from('hospedagem_alojamentos').insert(payload);
}

async function saveRecord(event) {
  event.preventDefault();
  const data = readForm();
  if (!data.nome || !data.cidade || !data.uf) return feedback('Informe nome, cidade e UF.', 'err');
  if (!data.supervisoes.length) return feedback('Selecione pelo menos uma supervisão.', 'err');

  const current = state.rows.find((row) => String(row.id) === String(state.editingId));
  const userId = loadUserContext()?.user?.id || null;
  const meta = {
    contrato_url: data.contrato_url || null, contrato_inicio: data.contrato_inicio || null, contrato_fim: data.contrato_fim || null,
    endereco_logradouro: data.endereco_logradouro || null, endereco_numero: data.endereco_numero || null, endereco_complemento: data.endereco_complemento || null,
    bairro: data.bairro || null, cep: data.cep || null, referencia: data.referencia || null, link_localizacao: data.link_localizacao || null,
    agua_inclusa: data.agua_inclusa, agua_titular: data.agua_titular || null, agua_matricula: data.agua_matricula || null,
    energia_inclusa: data.energia_inclusa, energia_titular: data.energia_titular || null, energia_matricula: data.energia_matricula || null,
    internet_inclusa: data.internet_inclusa, internet_titular: data.internet_titular || null, internet_matricula: data.internet_matricula || null,
    gas_titular: data.gas_titular || null, gas_forma_pagamento: data.gas_forma_pagamento || null
  };
  const legacy = {
    nome: data.nome, tipo: data.tipo, cidade: data.cidade, uf: data.uf,
    endereco: [data.endereco_logradouro, data.endereco_numero].filter(Boolean).join(', ') || null,
    capacidade: data.capacidade ? Number(data.capacidade) : null, quartos: data.quartos ? Number(data.quartos) : null,
    responsavel: data.responsavel || null, contato: data.contato || null, status: data.status, prioridade: data.prioridade,
    supervisao: data.supervisao || null,
    valor_aluguel: data.valor_aluguel ? Number(data.valor_aluguel) : null,
    agua: data.agua_inclusa === null ? null : data.agua_inclusa ? 'INCLUSO' : 'PAGO',
    energia: data.energia_inclusa === null ? null : data.energia_inclusa ? 'INCLUSO' : 'PAGO',
    internet: data.internet_inclusa === null ? null : data.internet_inclusa ? 'INCLUSO' : 'PAGO',
    empresa_internet: data.empresa_internet || null, anexo_url: current?.anexo_url || null, descricao_fatura: current?.descricao_fatura || null,
    observacoes: composeObservations(data.observacoes, meta), atualizado_por: userId
  };
  const enhanced = {
    ...legacy, ...meta,
    supervisoes: data.supervisoes,
    endereco_logradouro: meta.endereco_logradouro, endereco_numero: meta.endereco_numero, endereco_complemento: meta.endereco_complemento
  };
  if (!state.editingId) { legacy.criado_por = userId; enhanced.criado_por = userId; }

  const cidadeMudou = !current || normalizeText(current.cidade) !== normalizeText(data.cidade) || normalizeText(current.uf) !== normalizeText(data.uf);
  if (cidadeMudou || current?.latitude == null || current?.longitude == null) {
    const geo = await geocodeCidadeUf(data.cidade, data.uf);
    if (geo) { legacy.latitude = geo.lat; legacy.longitude = geo.lng; enhanced.latitude = geo.lat; enhanced.longitude = geo.lng; }
  }

  feedback('Salvando...');
  let result = await persist(enhanced);
  let compatibilityMode = false;
  if (result.error && schemaCompatibilityError(result.error)) {
    compatibilityMode = true;
    result = await persist(legacy);
  }
  if (result.error) return feedback(await mensagemFalhaSalvar(result.error, result.error.message || 'Não foi possível salvar.'), 'err');
  closeModal();
  await loadRows();
  toast(compatibilityMode ? 'Alojamento salvo; novos campos preservados em modo compatível.' : 'Alojamento salvo com sucesso.');
}

async function deleteRecord(id) {
  const row = state.rows.find((item) => String(item.id) === String(id));
  if (!row || !window.confirm(`Excluir o alojamento ${row.nome}?`)) return;
  const result = await supabase.from('hospedagem_alojamentos').delete().eq('id', id);
  if (result.error) {
    const message = normalizeText(result.error.message);
    if (message.includes('foreign key') || message.includes('violates') || message.includes('referenced')) {
      const fallback = await supabase.from('hospedagem_alojamentos').update({ status: 'INATIVO', atualizado_por: loadUserContext()?.user?.id || null }).eq('id', id);
      if (!fallback.error) { closeDetails(); await loadRows(); toast('Alojamento com vínculo marcado como inativo.'); return; }
    }
    return toast(result.error.message || 'Não foi possível excluir.', 'err');
  }
  closeDetails();
  await loadRows();
  toast('Alojamento excluído.');
}

async function loadRows() {
  const list = document.getElementById('alojV2List');
  if (list) list.innerHTML = '<div class="aloj-v2-loading"><strong>Carregando alojamentos</strong>Aguarde a consulta da base.</div>';
  const { data, error } = await supabase.from('hospedagem_alojamentos').select('*').order('cidade', { ascending: true }).order('nome', { ascending: true });
  if (error) {
    if (list) list.innerHTML = `<div class="aloj-v2-empty"><strong>Erro ao carregar</strong>${esc(error.message)}</div>`;
    return;
  }
  state.rows = (data || []).map(hydrateRow);
  renderRows(state);
}

function bindPanel(panel) {
  panel.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-aloj-v2-action]');
    if (actionButton) {
      const row = state.rows.find((item) => String(item.id) === String(actionButton.dataset.id));
      if (actionButton.dataset.alojV2Action === 'details' && row) openDetails(row);
      if (actionButton.dataset.alojV2Action === 'edit' && row) { closeDetails(); openModal(row); }
      if (actionButton.dataset.alojV2Action === 'delete') deleteRecord(actionButton.dataset.id);
      if (actionButton.dataset.alojV2Action === 'obs' && row) openObs(row);
      return;
    }
    if (event.target === document.getElementById('alojV2Modal')) closeModal();
    if (event.target === document.getElementById('alojV2DetailsModal')) closeDetails();
  });
  document.getElementById('alojV2New')?.addEventListener('click', () => openModal());
  document.getElementById('alojV2Close')?.addEventListener('click', closeModal);
  document.getElementById('alojV2Cancel')?.addEventListener('click', closeModal);
  document.getElementById('alojV2DetailsClose')?.addEventListener('click', closeDetails);
  document.getElementById('alojV2Form')?.addEventListener('submit', saveRecord);
  document.getElementById('alojV2Search')?.addEventListener('input', (event) => { state.query = event.target.value; renderRows(state); });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (document.getElementById('alojV2Modal')?.classList.contains('open')) closeModal();
    else if (document.getElementById('alojV2ObsModal')?.classList.contains('open')) closeObs();
    else if (document.getElementById('alojV2DetailsModal')?.classList.contains('open')) closeDetails();
  });
  bindObsPanel(panel);
}

async function mount() {
  const panel = document.getElementById('tab-alojamentos');
  if (!panel || panel.dataset.alojV2Mounted === '1') return;
  ensureStyles();
  document.getElementById('modalAlojamentoCadastro')?.remove();
  panel.dataset.alojV2Mounted = '1';
  panel.innerHTML = panelHtml();
  state.query = '';
  bindPanel(panel);
  await Promise.all([loadRows(), loadSupervisoes()]);
}

function scheduleMount() {
  clearTimeout(state.mountTimer);
  state.mountTimer = setTimeout(() => mount().catch((error) => console.error('[alojamentos-v2] falha ao montar:', error)), 30);
}

if (!window.__admAlojamentosV2Observer) {
  window.__admAlojamentosV2Observer = true;
  new MutationObserver(scheduleMount).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('hashchange', scheduleMount);
  document.addEventListener('click', (event) => { if (event.target.closest('[data-tab="alojamentos"]')) setTimeout(scheduleMount, 0); }, true);
}

scheduleMount();
