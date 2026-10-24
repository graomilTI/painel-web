import { supabase } from '../../supabaseClient.js';
import { loadUserContext } from '../../sessionStore.js';
import { ICON, aoClicarCard, cardFiltro, iconBtn, sincronizarCards } from '../../patrimonioLayoutFrotas.js?v=20261019-ordenar';

const META_START = '[ALOJAMENTO_FATURA_V1]';
const META_END = '[/ALOJAMENTO_FATURA_V1]';
const STORAGE_BUCKET = 'notas-fiscais';

const state = {
  mounted: false,
  mode: 'cadastro',
  alojamentos: [],
  pagamentos: [],
  filtro: 'todos',
  search: '',
  editingId: null,
  loading: false,
  timer: null,
};

const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');
const norm = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .trim();
const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const todayIso = () => new Date().toISOString().slice(0, 10);

function brDate(value) {
  if (!value) return '-';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : String(value);
}

function competenceLabel(value) {
  const text = String(value || '').slice(0, 7);
  const [year, month] = text.split('-');
  return year && month ? `${month}/${year}` : '-';
}

function serviceLabel(value) {
  return ({ AGUA: 'Água', ENERGIA: 'Luz', INTERNET: 'Internet' })[norm(value)] || value || '-';
}

function safeFileName(value) {
  return String(value || 'fatura')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(-120);
}

function icon(name) {
  const paths = {
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
    pay: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    water: '<path d="M12 2s7 7.1 7 13a7 7 0 0 1-14 0C5 9.1 12 2 12 2Z"/>',
    energy: '<path d="m13 2-9 12h8l-1 8 9-12h-8l1-8Z"/>',
    internet: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01M2 9a14 14 0 0 1 20 0"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    external: '<path d="M14 3h7v7M10 14 21 3"/><path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.file}</svg>`;
}

function extractMeta(observacoes) {
  const text = String(observacoes || '');
  const start = text.indexOf(META_START);
  const end = text.indexOf(META_END);
  if (start < 0 || end < start) return {};
  try {
    return JSON.parse(text.slice(start + META_START.length, end).trim()) || {};
  } catch {
    return {};
  }
}

function composeObservations(meta, note = '') {
  const human = [
    `Alojamento: ${meta.alojamento_nome}`,
    `Serviço: ${serviceLabel(meta.servico)}`,
    `Competência: ${competenceLabel(meta.competencia)}`,
    meta.matricula ? `Matrícula: ${meta.matricula}` : '',
    meta.arquivo_url ? `Fatura anexada: ${meta.arquivo_url}` : '',
    note ? `Observação: ${note}` : '',
  ].filter(Boolean).join('\n');
  return `${human}\n${META_START}${JSON.stringify(meta)}${META_END}`;
}

function paymentMeta(row) {
  const meta = extractMeta(row?.observacoes);
  return {
    ...meta,
    alojamento_nome: meta.alojamento_nome || String(row?.descricao || '').replace(/^Fatura de .*? - /, '').split(' - ')[0] || 'Alojamento',
    servico: meta.servico || 'OUTRO',
    competencia: meta.competencia || String(row?.competencia || '').slice(0, 7),
    vencimento: meta.vencimento || row?.vencimento || '',
    arquivo_url: meta.arquivo_url || '',
  };
}

function isPaid(row) {
  return ['PAGO', 'LANCADO', 'CONCLUIDO'].includes(norm(row.status));
}

function isRejected(row) {
  return ['RECUSADO', 'REJEITADO', 'CANCELADO'].includes(norm(row.status));
}

function isOverdue(row) {
  const meta = paymentMeta(row);
  return !isPaid(row) && meta.vencimento && meta.vencimento < todayIso();
}

function statusLabel(row) {
  if (isPaid(row)) return 'Pago';
  if (isRejected(row)) return 'Recusado';
  if (isOverdue(row)) return 'Vencido';
  return 'Pendente';
}

function statusClass(row) {
  if (isPaid(row)) return 'paid';
  if (isRejected(row)) return 'rejected';
  if (isOverdue(row)) return 'overdue';
  return 'pending';
}

function ensureStyles() {
  if ($('#alojPayStyles')) return;
  const style = document.createElement('style');
  style.id = 'alojPayStyles';
  style.textContent = `
    .aloj-v2-shell.aloj-pay-mode>#alojCadPanel,.aloj-v2-shell.aloj-buy-mode>#alojCadPanel{display:none!important}.aloj-pay-panel{display:none}.aloj-v2-shell.aloj-pay-mode>.aloj-pay-panel{display:grid;gap:14px}
    .aloj-pay-primary{display:inline-flex;align-items:center;gap:7px;border:1px solid rgba(74,222,128,.34);background:linear-gradient(135deg,#15803d,#166534);color:#effff4;border-radius:12px;padding:11px 15px;font-weight:900;cursor:pointer}.aloj-pay-primary svg{width:16px;height:16px}
    .aloj-pay-modal{position:fixed;inset:0;z-index:10030;display:none;place-items:center;padding:16px;background:rgba(0,7,5,.84);backdrop-filter:blur(7px)}.aloj-pay-modal.open{display:grid}.aloj-pay-modal-card{width:min(840px,100%);max-height:94vh;overflow:auto;border:1px solid rgba(74,222,128,.28);border-radius:20px;background:linear-gradient(145deg,#081b14,#03100c);box-shadow:0 30px 90px rgba(0,0,0,.56)}.aloj-pay-modal-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:18px 20px;border-bottom:1px solid rgba(148,163,184,.12)}.aloj-pay-modal-head h3{margin:3px 0;color:#f1fff6}.aloj-pay-modal-head p{margin:0;color:#83998f;font-size:11px}.aloj-pay-close{width:38px;height:38px;display:grid;place-items:center;border:1px solid rgba(148,163,184,.15);border-radius:11px;background:rgba(255,255,255,.03);color:#dceae3;cursor:pointer}.aloj-pay-close svg{width:17px;height:17px}.aloj-pay-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:18px 20px}.aloj-pay-field{display:grid;gap:6px;min-width:0}.aloj-pay-field.full{grid-column:1/-1}.aloj-pay-field label{color:#9bafa5;font-size:10px;text-transform:uppercase;letter-spacing:.06em;font-weight:900}.aloj-pay-field input,.aloj-pay-field select,.aloj-pay-field textarea{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.14);border-radius:11px;background:#071611;color:#f0fff6;padding:10px 11px;outline:none;color-scheme:dark}.aloj-pay-field textarea{min-height:74px;resize:vertical}.aloj-pay-file-hint{color:#73887e;font-size:10px}.aloj-pay-modal-actions{display:flex;justify-content:flex-end;align-items:center;gap:9px;padding:15px 20px;border-top:1px solid rgba(148,163,184,.12)}.aloj-pay-feedback{margin-right:auto;color:#91a69c;font-size:11px}.aloj-pay-feedback.err{color:#fca5a5}.aloj-pay-feedback.ok{color:#86efac}.aloj-pay-secondary{border:1px solid rgba(148,163,184,.16);border-radius:11px;background:rgba(255,255,255,.03);color:#dce8e2;padding:10px 14px;font-weight:850;cursor:pointer}

    @media(max-width:600px){.aloj-pay-primary{justify-content:center}.aloj-pay-form{grid-template-columns:1fr}.aloj-pay-field.full{grid-column:auto}.aloj-pay-modal{padding:0}.aloj-pay-modal-card{height:100%;max-height:100vh;border-radius:0}}
  `;
  document.head.appendChild(style);
}

function navHtml() {
  return `<div class="ds-tabs" role="tablist">
    <button type="button" class="ds-tab active" role="tab" data-aloj-pay-mode="cadastro">Alojamentos</button>
    <button type="button" class="ds-tab" role="tab" data-aloj-pay-mode="compras">Compras <span class="ds-tab-badge" id="alojBuyPendingBadge" hidden></span></button>
    <button type="button" class="ds-tab" role="tab" data-aloj-pay-mode="pagamentos">Pagamentos <span class="ds-tab-badge" id="alojPayPendingBadge" hidden></span></button>
  </div>`;
}

function setBadge(id, total) {
  const badge = $(id);
  if (!badge) return;
  badge.textContent = total ? String(total) : '';
  badge.hidden = !total;
}

function panelHtml() {
  return `<section class="aloj-pay-panel" id="alojPayPanel">
    <div class="fm-topo"><div class="fm-head-actions"><button type="button" class="fm-btn primary" id="alojPayNew">${icon('plus')} Nova fatura</button></div></div>
    <div class="fm-kpis" id="alojPayKpis"></div>
    <div class="fm-card"><div class="fm-body">
      <div class="fm-bar"><div class="fm-search">${ICON.busca}<input id="alojPaySearch" class="fm-input" placeholder="Buscar alojamento, serviço ou favorecido..." autocomplete="off"></div><span data-chip></span><span class="fm-count" id="alojPayCount">0 fatura(s)</span></div>
      <div class="fm-table-wrap"><table class="fm-table"><thead><tr><th>Status</th><th>Alojamento</th><th>Serviço</th><th>Competência</th><th>Vencimento</th><th>Favorecido</th><th>Valor</th><th>Ações</th></tr></thead><tbody id="alojPayBody"><tr><td colspan="8" class="fm-empty">Carregando...</td></tr></tbody></table></div>
    </div></div>
  </section>`;
}

function modalHtml() {
  return `<div class="aloj-pay-modal" id="alojPayModal" aria-hidden="true"><div class="aloj-pay-modal-card" role="dialog" aria-modal="true" aria-labelledby="alojPayModalTitle"><div class="aloj-pay-modal-head"><div><div class="aloj-v2-eyebrow">Solicitação ao Financeiro</div><h3 id="alojPayModalTitle">Nova fatura</h3><p>O anexo será vinculado à solicitação de pagamento.</p></div><button type="button" class="aloj-pay-close" id="alojPayClose">${icon('close')}</button></div>
    <form id="alojPayForm" class="aloj-pay-form"><div class="aloj-pay-field full"><label>Alojamento *</label><select id="alojPayAlojamento" required></select></div><div class="aloj-pay-field"><label>Serviço *</label><select id="alojPayService" required><option value="AGUA">Água</option><option value="ENERGIA">Luz</option><option value="INTERNET">Internet</option></select></div><div class="aloj-pay-field"><label>Matrícula</label><input id="alojPayMatricula"></div><div class="aloj-pay-field"><label>Competência *</label><input id="alojPayCompetence" type="month" required></div><div class="aloj-pay-field"><label>Vencimento *</label><input id="alojPayDue" type="date" required></div><div class="aloj-pay-field"><label>Valor (R$) *</label><input id="alojPayValue" type="number" min="0.01" step="0.01" required></div><div class="aloj-pay-field"><label>Favorecido / concessionária *</label><input id="alojPaySupplier" required placeholder="Ex.: Copel, Sanepar, provedor"></div><div class="aloj-pay-field"><label>Forma de pagamento</label><select id="alojPayMethod"><option value="BOLETO">Boleto</option><option value="PIX">PIX</option><option value="TRANSFERENCIA">Transferência</option><option value="OUTRO">Outro</option></select></div><div class="aloj-pay-field"><label>Dados de pagamento</label><input id="alojPayDetails" placeholder="Código de barras, chave PIX ou dados bancários"></div><div class="aloj-pay-field full"><label>Arquivo da fatura *</label><input id="alojPayFile" type="file" accept="application/pdf,image/*" required><span class="aloj-pay-file-hint" id="alojPayFileHint">PDF ou imagem. O arquivo será armazenado junto aos documentos fiscais.</span></div><div class="aloj-pay-field full"><label>Observação</label><textarea id="alojPayNote"></textarea></div></form>
    <div class="aloj-pay-modal-actions"><span id="alojPayFeedback" class="aloj-pay-feedback"></span><button type="button" class="aloj-pay-secondary" id="alojPayCancel">Cancelar</button><button type="submit" form="alojPayForm" class="aloj-pay-primary" id="alojPaySave">Enviar ao Financeiro</button></div></div></div>`;
}

function setMode(mode) {
  state.mode = ['pagamentos','compras'].includes(mode) ? mode : 'cadastro';
  const shell = $('.aloj-v2-shell');
  shell?.classList.toggle('aloj-pay-mode', state.mode === 'pagamentos');
  shell?.classList.toggle('aloj-buy-mode', state.mode === 'compras');
  document.querySelectorAll('[data-aloj-pay-mode]').forEach((button) => button.classList.toggle('active', button.dataset.alojPayMode === state.mode));
  if (state.mode === 'pagamentos') loadData();
  if (state.mode === 'compras') window.dispatchEvent(new CustomEvent('alojamentos:compras'));
}

function updateSelect() {
  const select = $('#alojPayAlojamento');
  if (!select) return;
  select.innerHTML = '<option value="">Selecione...</option>' + state.alojamentos
    .filter((row) => norm(row.status || 'ATIVO') === 'ATIVO')
    .map((row) => `<option value="${esc(row.id)}">${esc(row.nome)} · ${esc([row.cidade, row.uf].filter(Boolean).join('/'))}</option>`)
    .join('');
}

function autoMatricula() {
  const alojamento = state.alojamentos.find((row) => String(row.id) === String($('#alojPayAlojamento')?.value));
  const service = norm($('#alojPayService')?.value);
  const value = service === 'AGUA' ? alojamento?.agua_matricula : service === 'ENERGIA' ? alojamento?.energia_matricula : alojamento?.internet_matricula;
  const field = $('#alojPayMatricula');
  if (field) field.value = value || '';
}

function resetForm() {
  state.editingId = null;
  $('#alojPayForm')?.reset();
  $('#alojPayModalTitle').textContent = 'Nova fatura';
  $('#alojPaySave').textContent = 'Enviar ao Financeiro';
  $('#alojPayCompetence').value = todayIso().slice(0, 7);
  $('#alojPayService').value = 'AGUA';
  $('#alojPayFile').required = true;
  $('#alojPayFileHint').textContent = 'PDF ou imagem. O arquivo será armazenado junto aos documentos fiscais.';
  setFeedback('');
}

function openModal(row = null) {
  resetForm();
  if (row) {
    state.editingId = row.id;
    const meta = paymentMeta(row);
    $('#alojPayModalTitle').textContent = 'Atualizar fatura';
    $('#alojPaySave').textContent = 'Atualizar solicitação';
    $('#alojPayAlojamento').value = meta.alojamento_id || '';
    $('#alojPayService').value = meta.servico || 'AGUA';
    $('#alojPayMatricula').value = meta.matricula || '';
    $('#alojPayCompetence').value = String(meta.competencia || '').slice(0, 7);
    $('#alojPayDue').value = meta.vencimento || row.vencimento || '';
    $('#alojPayValue').value = row.valor || '';
    $('#alojPaySupplier').value = row.favorecido_nome || row.favorecido || row.fornecedor || '';
    $('#alojPayMethod').value = row.forma_pagamento || 'BOLETO';
    $('#alojPayDetails').value = row.dados_pagamento || '';
    $('#alojPayNote').value = meta.nota || '';
    $('#alojPayFile').required = false;
    $('#alojPayFileHint').textContent = meta.arquivo_nome ? `Fatura atual: ${meta.arquivo_nome}. Selecione outro arquivo apenas para substituir.` : 'Selecione um arquivo para substituir a fatura atual.';
  }
  $('#alojPayModal')?.classList.add('open');
  $('#alojPayModal')?.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  $('#alojPayModal')?.classList.remove('open');
  $('#alojPayModal')?.setAttribute('aria-hidden', 'true');
  setFeedback('');
}

function setFeedback(message, type = '') {
  const element = $('#alojPayFeedback');
  if (!element) return;
  element.textContent = message || '';
  element.className = `aloj-pay-feedback ${type}`.trim();
}

async function uploadInvoice(file, alojamento, service, competence) {
  const path = `alojamentos/${alojamento.id}/${competence}/${service.toLowerCase()}-${Date.now()}-${safeFileName(file.name)}`;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('Não foi possível obter o link público da fatura.');
  return { url: data.publicUrl, path };
}

function uniqueCode(alojamentoId, service, competence) {
  return `ALOJ-${String(alojamentoId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 18)}-${service}-${competence.replace('-', '')}`;
}

async function findExisting(code) {
  const { data, error } = await supabase.from('financeiro_pagamentos').select('*').eq('origem_codigo', code).maybeSingle();
  if (error && !/0 rows|multiple/i.test(error.message || '')) throw error;
  return data || null;
}

async function saveInvoice(event) {
  event.preventDefault();
  const alojamento = state.alojamentos.find((row) => String(row.id) === String($('#alojPayAlojamento')?.value));
  const service = norm($('#alojPayService')?.value);
  const competence = $('#alojPayCompetence')?.value || '';
  const due = $('#alojPayDue')?.value || '';
  const value = Number($('#alojPayValue')?.value || 0);
  const supplier = $('#alojPaySupplier')?.value.trim() || '';
  const file = $('#alojPayFile')?.files?.[0] || null;
  if (!alojamento || !['AGUA', 'ENERGIA', 'INTERNET'].includes(service) || !competence || !due || value <= 0 || !supplier) return setFeedback('Preencha alojamento, serviço, competência, vencimento, valor e favorecido.', 'err');

  const current = state.pagamentos.find((row) => String(row.id) === String(state.editingId));
  if (!file && !paymentMeta(current || {}).arquivo_url) return setFeedback('Anexe o arquivo da fatura.', 'err');
  if (current && isPaid(current)) return setFeedback('Uma solicitação já paga não pode ser alterada.', 'err');

  try {
    setFeedback(file ? 'Enviando fatura...' : 'Atualizando solicitação...');
    const code = uniqueCode(alojamento.id, service, competence);
    const existing = current || await findExisting(code);
    if (existing && isPaid(existing)) throw new Error('Esta fatura já foi paga no Financeiro.');
    if (existing && !current && !window.confirm('Já existe uma solicitação para este alojamento, serviço e competência. Deseja atualizá-la?')) return setFeedback('Operação cancelada.');

    const previousMeta = paymentMeta(existing || {});
    const uploaded = file ? await uploadInvoice(file, alojamento, service, competence) : { url: previousMeta.arquivo_url, path: previousMeta.arquivo_path };
    const meta = {
      alojamento_id: alojamento.id,
      alojamento_nome: alojamento.nome,
      servico: service,
      competencia: competence,
      vencimento: due,
      matricula: $('#alojPayMatricula')?.value.trim() || null,
      arquivo_url: uploaded.url,
      arquivo_path: uploaded.path || null,
      arquivo_nome: file?.name || previousMeta.arquivo_nome || null,
      nota: $('#alojPayNote')?.value.trim() || null,
    };
    const user = loadUserContext()?.user || {};
    const originId = existing?.origem_id || crypto.randomUUID();
    const payload = {
      origem_setor: 'HOSPEDAGEM',
      origem_tabela: 'hospedagem_alojamento_faturas',
      origem_id: originId,
      origem_codigo: code,
      competencia: `${competence}-01`,
      descricao: `Fatura de ${serviceLabel(service)} - ${alojamento.nome} - ${competenceLabel(competence)}`,
      favorecido_nome: supplier,
      forma_pagamento: $('#alojPayMethod')?.value || 'BOLETO',
      dados_pagamento: $('#alojPayDetails')?.value.trim() || null,
      valor: value,
      vencimento: due,
      status: existing && isRejected(existing) ? 'PENDENTE' : (existing?.status || 'PENDENTE'),
      prioridade: 'NORMAL',
      observacoes: composeObservations(meta, meta.nota || ''),
      solicitado_por: existing?.solicitado_por || user.id || null,
      solicitado_por_nome: existing?.solicitado_por_nome || user.name || null,
      atualizado_por: user.id || null,
      atualizado_por_nome: user.name || null,
    };

    let result;
    if (existing?.id) result = await supabase.from('financeiro_pagamentos').update(payload).eq('id', existing.id).select('*').single();
    else result = await supabase.from('financeiro_pagamentos').upsert(payload, { onConflict: 'origem_tabela,origem_id' }).select('*').single();
    if (result.error) throw result.error;

    closeModal();
    await loadData();
    setMode('pagamentos');
  } catch (error) {
    console.error('[alojamentos-pagamentos] saveInvoice', error);
    setFeedback(error?.message || 'Não foi possível enviar a fatura ao Financeiro.', 'err');
  }
}

async function loadData() {
  if (state.loading) return;
  state.loading = true;
  const body = $('#alojPayBody');
  if (body) body.innerHTML = '<tr><td colspan="9" class="aloj-pay-empty">Carregando faturas...</td></tr>';
  try {
    const [alojRes, payRes] = await Promise.all([
      supabase.from('hospedagem_alojamentos').select('*').order('nome', { ascending: true }),
      supabase.from('financeiro_pagamentos').select('*').eq('origem_tabela', 'hospedagem_alojamento_faturas').order('created_at', { ascending: false }).limit(1000),
    ]);
    if (alojRes.error) throw alojRes.error;
    if (payRes.error) throw payRes.error;
    state.alojamentos = alojRes.data || [];
    state.pagamentos = payRes.data || [];
    updateSelect();
    renderPayments();
  } catch (error) {
    console.error('[alojamentos-pagamentos] loadData', error);
    if (body) body.innerHTML = `<tr><td colspan="9" class="aloj-pay-empty">${esc(error?.message || 'Não foi possível carregar as faturas.')}</td></tr>`;
  } finally {
    state.loading = false;
  }
}

function filteredPayments() {
  const query = norm(state.search);
  return state.pagamentos.filter((row) => {
    if (state.filtro !== 'todos' && paymentStatus(row) !== state.filtro) return false;
    if (!query) return true;
    const meta = paymentMeta(row);
    return norm([meta.alojamento_nome, meta.servico, row.favorecido_nome, row.descricao, row.origem_codigo].join(' ')).includes(query);
  });
}

function serviceIcon(service) {
  const key = norm(service) === 'AGUA' ? 'water' : norm(service) === 'ENERGIA' ? 'energy' : 'internet';
  return icon(key);
}

// Estado de uma fatura para filtro, selo e cards: PAGO, VENCIDO, RECUSADO ou PENDENTE.
function paymentStatus(row) {
  if (isPaid(row)) return 'PAGO';
  if (isRejected(row)) return 'RECUSADO';
  if (isOverdue(row)) return 'VENCIDO';
  return 'PENDENTE';
}

const SELO_FATURA = { PAGO: 'ok', RECUSADO: 'err', VENCIDO: 'err', PENDENTE: 'warn' };

function cardsHtml() {
  const todas = state.pagamentos;
  const por = (status) => todas.filter((row) => paymentStatus(row) === status);
  const soma = (lista) => lista.reduce((sum, row) => sum + Number(row.valor || 0), 0);
  const pendentes = por('PENDENTE');
  const vencidas = por('VENCIDO');
  const pagas = por('PAGO');
  const mes = todayIso().slice(0, 7);
  const doMes = todas.filter((row) => paymentMeta(row).competencia === mes);
  return cardFiltro({ filtro: 'todos', label: 'Todas', tone: 'blue', icone: 'total', valor: String(todas.length), ativo: state.filtro === 'todos' })
    + cardFiltro({ filtro: 'PENDENTE', label: 'Pendentes', tone: 'amber', icone: 'relogio', valor: String(pendentes.length), dica: `Pendentes: ${money(soma(pendentes))}`, ativo: state.filtro === 'PENDENTE' })
    + cardFiltro({ filtro: 'VENCIDO', label: 'Vencidas', tone: 'red', icone: 'alerta', valor: String(vencidas.length), dica: `Vencidas: ${money(soma(vencidas))}`, ativo: state.filtro === 'VENCIDO' })
    + cardFiltro({ filtro: 'PAGO', label: 'Pagas', tone: 'green', icone: 'ok', valor: String(pagas.length), dica: 'Concluídas pelo Financeiro', ativo: state.filtro === 'PAGO' })
    + cardFiltro({ label: 'Competência atual', tone: 'purple', icone: 'dinheiro', valor: money(soma(doMes)), dica: `${doMes.length} fatura${doMes.length === 1 ? '' : 's'} em ${competenceLabel(mes)}` });
}

function paymentRow(row) {
  const meta = paymentMeta(row);
  const status = paymentStatus(row);
  const abrir = meta.arquivo_url
    ? `<a class="fm-ic anexo" href="${esc(meta.arquivo_url)}" target="_blank" rel="noopener" title="Abrir a fatura anexada" aria-label="Abrir a fatura anexada">${ICON.anexo}</a>` : '';
  const atualizar = isPaid(row) ? '' : iconBtn('data-aloj-pay-edit', row.id, 'termo', 'Atualizar a fatura', 'editar');
  return `<tr><td><span class="fm-badge ${SELO_FATURA[status]}">${esc(statusLabel(row))}</span></td><td><b>${esc(meta.alojamento_nome)}</b></td><td><span class="fm-badge info">${serviceIcon(meta.servico)}${esc(serviceLabel(meta.servico))}</span></td><td>${esc(competenceLabel(meta.competencia))}</td><td>${esc(brDate(meta.vencimento || row.vencimento))}</td><td>${esc(row.favorecido_nome || row.favorecido || row.fornecedor || '-')}</td><td><b>${esc(money(row.valor))}</b></td><td><div class="fm-actions">${abrir}${atualizar || (abrir ? '' : '-')}</div></td></tr>`;
}

function renderPayments() {
  const rows = filteredPayments();
  const body = $('#alojPayBody');
  if (!body) return;
  body.innerHTML = rows.length ? rows.map(paymentRow).join('') : '<tr><td colspan="8" class="fm-empty">Nenhuma fatura encontrada.</td></tr>';
  const kpis = $('#alojPayKpis');
  if (kpis) kpis.innerHTML = cardsHtml();
  const count = $('#alojPayCount');
  if (count) count.textContent = `${rows.length} fatura(s)`;
  const painel = $('#alojPayPanel');
  if (painel) sincronizarCards(painel, state.filtro);
  setBadge('#alojPayPendingBadge', state.pagamentos.filter((row) => !isPaid(row) && !isRejected(row)).length);
}

function bindEvents() {
  document.addEventListener('click', (event) => {
    const mode = event.target.closest('[data-aloj-pay-mode]');
    if (mode) { setMode(mode.dataset.alojPayMode); return; }
    const edit = event.target.closest('[data-aloj-pay-edit]');
    if (edit) { const row = state.pagamentos.find((item) => String(item.id) === String(edit.dataset.alojPayEdit)); if (row) openModal(row); return; }
    if (event.target === $('#alojPayModal')) closeModal();
  });
  $('#alojPayNew')?.addEventListener('click', () => openModal());
  aoClicarCard($('#alojPayPanel'), (card, limpar) => {
    state.filtro = limpar || !card || state.filtro === card.dataset.filtro ? 'todos' : card.dataset.filtro;
    renderPayments();
  });
  $('#alojPayClose')?.addEventListener('click', closeModal);
  $('#alojPayCancel')?.addEventListener('click', closeModal);
  $('#alojPayForm')?.addEventListener('submit', saveInvoice);
  $('#alojPayAlojamento')?.addEventListener('change', autoMatricula);
  $('#alojPayService')?.addEventListener('change', autoMatricula);
  $('#alojPaySearch')?.addEventListener('input', (event) => { state.search = event.target.value; renderPayments(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && $('#alojPayModal')?.classList.contains('open')) closeModal(); });
}

function mount() {
  if (state.mounted) return true;
  const shell = $('.aloj-v2-shell');
  if (!shell || !$('#alojV2List')) return false;
  ensureStyles();
  (document.getElementById('alojTabs') || shell).insertAdjacentHTML('afterbegin', navHtml());
  shell.insertAdjacentHTML('beforeend', panelHtml() + modalHtml());
  state.mounted = true;
  bindEvents();
  loadData();
  return true;
}

function scheduleMount() {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => mount(), 40);
}

if (!window.__alojamentosPagamentosV1) {
  window.__alojamentosPagamentosV1 = true;
  new MutationObserver(scheduleMount).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('hashchange', scheduleMount);
}

scheduleMount();
