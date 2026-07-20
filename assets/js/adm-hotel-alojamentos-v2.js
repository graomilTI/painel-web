import { supabase } from './supabaseClient.js';
import { loadUserContext } from './sessionStore.js';
import { normalizeText, nullableBoolean, ensureStyles, composeObservations, hydrateRow, esc } from './adm-hotel-alojamentos-v2-helpers.js?v=20260720-lista1';
import { panelHtml, renderRows, renderDetailsContent } from './adm-hotel-alojamentos-v2-view.js?v=20260720-lista1';

const state = { rows: [], editingId: null, selectedDetailsId: null, query: '', mountTimer: null };
let toastTimer = null;

function getValue(id) { return document.getElementById(id)?.value ?? ''; }
function setValue(id, value) { const el = document.getElementById(id); if (el) el.value = value ?? ''; }

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
      alojV2AguaInclusa: row.agua_inclusa === null ? '' : String(row.agua_inclusa), alojV2AguaMatricula: row.agua_matricula,
      alojV2EnergiaInclusa: row.energia_inclusa === null ? '' : String(row.energia_inclusa), alojV2EnergiaMatricula: row.energia_matricula,
      alojV2InternetInclusa: row.internet_inclusa === null ? '' : String(row.internet_inclusa), alojV2InternetMatricula: row.internet_matricula,
      alojV2EmpresaInternet: row.empresa_internet, alojV2GasPagamento: row.gas_forma_pagamento, alojV2Observacoes: row.observacoes_limpa
    };
    Object.entries(values).forEach(([id, value]) => setValue(id, value));
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

function readForm() {
  const boolValue = (id) => nullableBoolean(getValue(id));
  return {
    nome: getValue('alojV2Nome').trim(), tipo: getValue('alojV2Tipo') || 'CASA', status: getValue('alojV2Status') || 'ATIVO',
    responsavel: getValue('alojV2Responsavel').trim(), contato: getValue('alojV2Contato').trim(), valor_aluguel: getValue('alojV2Aluguel'),
    capacidade: getValue('alojV2Capacidade'), quartos: getValue('alojV2Quartos'), prioridade: getValue('alojV2Prioridade') || 'NORMAL',
    contrato_url: getValue('alojV2ContratoUrl').trim(), contrato_inicio: getValue('alojV2ContratoInicio'), contrato_fim: getValue('alojV2ContratoFim'),
    endereco_logradouro: getValue('alojV2Logradouro').trim(), endereco_numero: getValue('alojV2Numero').trim(), endereco_complemento: getValue('alojV2Complemento').trim(),
    bairro: getValue('alojV2Bairro').trim(), cidade: getValue('alojV2Cidade').trim(), uf: getValue('alojV2Uf').trim().toUpperCase().slice(0, 2),
    cep: getValue('alojV2Cep').trim(), referencia: getValue('alojV2Referencia').trim(), link_localizacao: getValue('alojV2Localizacao').trim(),
    agua_inclusa: boolValue('alojV2AguaInclusa'), agua_matricula: getValue('alojV2AguaMatricula').trim(),
    energia_inclusa: boolValue('alojV2EnergiaInclusa'), energia_matricula: getValue('alojV2EnergiaMatricula').trim(),
    internet_inclusa: boolValue('alojV2InternetInclusa'), internet_matricula: getValue('alojV2InternetMatricula').trim(),
    empresa_internet: getValue('alojV2EmpresaInternet').trim(), gas_forma_pagamento: getValue('alojV2GasPagamento').trim(),
    observacoes: getValue('alojV2Observacoes').trim()
  };
}

function schemaCompatibilityError(error) {
  const message = normalizeText(error?.message || '');
  return message.includes('schema cache') || message.includes('does not exist') || message.includes('could not find') || message.includes('column');
}

async function persist(payload) {
  if (state.editingId) return supabase.from('hospedagem_alojamentos').update(payload).eq('id', state.editingId);
  return supabase.from('hospedagem_alojamentos').insert(payload);
}

async function saveRecord(event) {
  event.preventDefault();
  const data = readForm();
  if (!data.nome || !data.cidade || !data.uf) return feedback('Informe nome, cidade e UF.', 'err');

  const current = state.rows.find((row) => String(row.id) === String(state.editingId));
  const userId = loadUserContext()?.user?.id || null;
  const meta = {
    contrato_url: data.contrato_url || null, contrato_inicio: data.contrato_inicio || null, contrato_fim: data.contrato_fim || null,
    endereco_logradouro: data.endereco_logradouro || null, endereco_numero: data.endereco_numero || null, endereco_complemento: data.endereco_complemento || null,
    bairro: data.bairro || null, cep: data.cep || null, referencia: data.referencia || null, link_localizacao: data.link_localizacao || null,
    agua_inclusa: data.agua_inclusa, agua_matricula: data.agua_matricula || null, energia_inclusa: data.energia_inclusa,
    energia_matricula: data.energia_matricula || null, internet_inclusa: data.internet_inclusa, internet_matricula: data.internet_matricula || null,
    gas_forma_pagamento: data.gas_forma_pagamento || null
  };
  const legacy = {
    nome: data.nome, tipo: data.tipo, cidade: data.cidade, uf: data.uf,
    endereco: [data.endereco_logradouro, data.endereco_numero].filter(Boolean).join(', ') || null,
    capacidade: data.capacidade ? Number(data.capacidade) : null, quartos: data.quartos ? Number(data.quartos) : null,
    responsavel: data.responsavel || null, contato: data.contato || null, status: data.status, prioridade: data.prioridade,
    valor_aluguel: data.valor_aluguel ? Number(data.valor_aluguel) : null,
    agua: data.agua_inclusa === null ? null : data.agua_inclusa ? 'INCLUSO' : 'PAGO',
    energia: data.energia_inclusa === null ? null : data.energia_inclusa ? 'INCLUSO' : 'PAGO',
    internet: data.internet_inclusa === null ? null : data.internet_inclusa ? 'INCLUSO' : 'PAGO',
    empresa_internet: data.empresa_internet || null, anexo_url: current?.anexo_url || null, descricao_fatura: current?.descricao_fatura || null,
    observacoes: composeObservations(data.observacoes, meta), atualizado_por: userId
  };
  const enhanced = {
    ...legacy, ...meta,
    endereco_logradouro: meta.endereco_logradouro, endereco_numero: meta.endereco_numero, endereco_complemento: meta.endereco_complemento
  };
  if (!state.editingId) { legacy.criado_por = userId; enhanced.criado_por = userId; }

  feedback('Salvando...');
  let result = await persist(enhanced);
  let compatibilityMode = false;
  if (result.error && schemaCompatibilityError(result.error)) {
    compatibilityMode = true;
    result = await persist(legacy);
  }
  if (result.error) return feedback(result.error.message || 'Não foi possível salvar.', 'err');
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
    else if (document.getElementById('alojV2DetailsModal')?.classList.contains('open')) closeDetails();
  });
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
  await loadRows();
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
