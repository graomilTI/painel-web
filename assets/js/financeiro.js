import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const SETORES = ['RH', 'FROTAS', 'HOSPEDAGEM', 'COMPRAS'];
const STATUS = {
  PENDENTE: 'Pendente',
  EM_ANALISE: 'Em análise',
  APROVADO: 'Aprovado',
  AGENDADO: 'Agendado',
  PAGO: 'Pago',
  RECUSADO: 'Recusado',
  CANCELADO: 'Cancelado'
};
const NF_STATUS = {
  NAO_INFORMADA: 'Não informada',
  AGUARDANDO_NF: 'Aguardando NF',
  NF_RECEBIDA: 'NF recebida',
  LANCADA: 'Lançada',
  DISPENSADA: 'Dispensada'
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function brDate(value) {
  if (!value) return '-';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(value);
}
function todayISO() { return new Date().toISOString().slice(0, 10); }
function money(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function slug(value) { return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_'); }
function labelStatus(value) { return STATUS[value] || value || '-'; }
function labelNf(value) { return NF_STATUS[value] || value || '-'; }
function normalize(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }

function injectStyles() {
  if (document.getElementById('financeiroStyles')) return;
  const style = document.createElement('style');
  style.id = 'financeiroStyles';
  style.textContent = `
    .fin-tabs{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}.fin-tab{width:auto!important;margin-top:0!important;border:1px solid var(--line-2);background:#0b1220;color:var(--text);border-radius:999px;padding:10px 14px;cursor:pointer;font-weight:800}.fin-tab.active{background:rgba(22,101,52,.32);color:#dcfce7;border-color:rgba(111,208,165,.34)}
    .fin-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:16px}.fin-kpis .card{box-shadow:none}.fin-kpis .metric{font-size:28px;font-weight:900;margin:6px 0 0}.fin-warn{color:#fde68a}.fin-good{color:#bbf7d0}.fin-info{color:#bfdbfe}.fin-danger{color:#fecaca}
    .fin-panel{display:none}.fin-panel.active{display:block}.fin-toolbar{display:grid;grid-template-columns:180px 180px 180px 1fr auto;gap:12px;align-items:end;margin-bottom:14px}.fin-field{display:flex;flex-direction:column;gap:7px}.fin-field label{font-size:13px;color:#cbd5e1;font-weight:800}.fin-field input,.fin-field textarea,.fin-field select{width:100%;border:1px solid #334155;background:#0b1220;color:var(--text);border-radius:14px;padding:12px 13px;outline:none;color-scheme:dark}.fin-field textarea{resize:vertical;min-height:78px}.fin-field input:focus,.fin-field textarea:focus,.fin-field select:focus{border-color:var(--green-2);box-shadow:0 0 0 3px rgba(111,208,165,.12)}
    .fin-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px}.fin-table{width:100%;border-collapse:collapse;min-width:1180px;background:#0b1220}.fin-table th,.fin-table td{padding:12px 14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.fin-table th{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em}.fin-table tr:hover td{background:rgba(111,208,165,.035)}.fin-row-note{display:block;color:var(--muted);font-size:12px;margin-top:3px}.fin-actions{display:flex;gap:8px;flex-wrap:wrap}.fin-small{padding:8px 10px!important;border-radius:12px!important;font-size:12px;width:auto!important;margin-top:0!important}.fin-status{display:inline-flex;align-items:center;padding:6px 9px;border-radius:999px;border:1px solid var(--line-2);background:rgba(255,255,255,.04);font-size:12px;font-weight:900;white-space:nowrap}.fin-status.pendente,.fin-status.em_analise,.fin-status.aguardando_nf{color:#fde68a;background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.24)}.fin-status.aprovado,.fin-status.agendado,.fin-status.nf_recebida,.fin-status.lancada{color:#bfdbfe;background:rgba(59,130,246,.11);border-color:rgba(59,130,246,.25)}.fin-status.pago,.fin-status.dispensada{color:#bbf7d0;background:rgba(22,101,52,.22);border-color:rgba(22,101,52,.34)}.fin-status.recusado,.fin-status.cancelado{color:#fecaca;background:rgba(220,38,38,.13);border-color:rgba(220,38,38,.24)}
    .fin-modal{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(2,6,23,.75);backdrop-filter:blur(6px)}.fin-modal.open{display:flex}.fin-modal-card{width:min(980px,100%);max-height:92vh;overflow:auto;background:#081611;border:1px solid var(--line-2);border-radius:24px;box-shadow:var(--shadow);padding:20px}.fin-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:16px}.fin-modal-head h3{margin:0}.fin-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.fin-field.full{grid-column:1/-1}.fin-form-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:16px}.fin-feedback{color:var(--muted);font-size:13px}.fin-feedback.ok{color:#bbf7d0}.fin-feedback.err{color:#fecaca}.fin-empty{padding:18px;text-align:center;color:var(--muted)}
    @media(max-width:1100px){.fin-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.fin-toolbar{grid-template-columns:1fr 1fr}}@media(max-width:760px){.fin-kpis,.fin-toolbar,.fin-form{grid-template-columns:1fr}.fin-field.full{grid-column:auto}}
  `;
  document.head.appendChild(style);
}

initProtectedPage('Financeiro', (content, userContext) => {
  injectStyles();
  const state = { rows: [], selected: null, tab: 'pagamentos' };

  content.innerHTML = `
    <section class="hero-card">
      <div>
        <div class="eyebrow">Diretoria</div>
        <h2>Financeiro</h2>
        <p>Centralize cobranças e pagamentos enviados por RH, Frotas, Hospedagem e Compras em um único painel de conferência.</p>
      </div>
      <div class="hero-badge-wrap"><span class="hero-badge">PAGAMENTOS</span></div>
    </section>

    <div class="fin-tabs">
      <button class="fin-tab active" data-tab="pagamentos" type="button">Pagamentos</button>
      <button class="fin-tab" data-tab="novo" type="button">Lançamento manual</button>
    </div>

    <section class="fin-panel active" id="tab-pagamentos">
      <div class="fin-kpis">
        <article class="card"><h3>Pendentes</h3><p class="metric fin-warn" id="kpiPendentes">0</p><p class="muted">Aguardando análise.</p></article>
        <article class="card"><h3>Aprovados/Agendados</h3><p class="metric fin-info" id="kpiAprovados">0</p><p class="muted">Prontos para pagamento.</p></article>
        <article class="card"><h3>Pagos</h3><p class="metric fin-good" id="kpiPagos">0</p><p class="muted">Concluídos no financeiro.</p></article>
        <article class="card"><h3>Total aberto</h3><p class="metric fin-danger" id="kpiTotalAberto">R$ 0,00</p><p class="muted">Pendente + aprovado + agendado.</p></article>
      </div>

      <article class="card">
        <div class="fin-toolbar">
          <div class="fin-field"><label>Setor</label><select id="filterSetor"><option value="">Todos</option>${SETORES.map((s) => `<option value="${s}">${s}</option>`).join('')}</select></div>
          <div class="fin-field"><label>Status</label><select id="filterStatus"><option value="">Todos</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
          <div class="fin-field"><label>Vencimento até</label><input id="filterVencimento" type="date" /></div>
          <div class="fin-field"><label>Busca</label><input id="filterSearch" placeholder="Favorecido, descrição, código, setor..." /></div>
          <button class="btn btn-secondary fin-small" id="refreshFinanceiro" type="button">Atualizar</button>
        </div>
        <div class="fin-table-wrap">
          <table class="fin-table">
            <thead><tr><th>Origem</th><th>Favorecido</th><th>Descrição</th><th>Valor</th><th>Vencimento</th><th>Status</th><th>NF</th><th>Ações</th></tr></thead>
            <tbody id="financeiroTbody"><tr><td colspan="8" class="fin-empty">Carregando...</td></tr></tbody>
          </table>
        </div>
      </article>
    </section>

    <section class="fin-panel" id="tab-novo">
      <article class="card">
        <h3>Lançamento manual</h3>
        <p class="muted">Use para testes ou despesas que ainda não nascem em outro módulo.</p>
        <form id="manualForm" class="fin-form">
          <div class="fin-field"><label>Setor</label><select id="manualSetor" required>${SETORES.map((s) => `<option value="${s}">${s}</option>`).join('')}</select></div>
          <div class="fin-field"><label>Favorecido</label><input id="manualFavorecido" required /></div>
          <div class="fin-field"><label>Valor</label><input id="manualValor" type="number" step="0.01" min="0" required /></div>
          <div class="fin-field"><label>Vencimento</label><input id="manualVencimento" type="date" /></div>
          <div class="fin-field"><label>Forma de pagamento</label><select id="manualForma"><option value="PIX">PIX</option><option value="BOLETO">Boleto</option><option value="TRANSFERENCIA">Transferência</option><option value="CARTAO">Cartão</option><option value="OUTRO">Outro</option></select></div>
          <div class="fin-field"><label>Prioridade</label><select id="manualPrioridade"><option value="NORMAL">Normal</option><option value="ALTA">Alta</option><option value="BAIXA">Baixa</option></select></div>
          <div class="fin-field full"><label>Descrição</label><textarea id="manualDescricao" required></textarea></div>
          <div class="fin-field full"><label>Observações</label><textarea id="manualObs"></textarea></div>
        </form>
        <div class="fin-form-actions"><button class="btn btn-primary fin-small" type="submit" form="manualForm">Criar lançamento</button><span id="manualFeedback" class="fin-feedback"></span></div>
      </article>
    </section>

    <div class="fin-modal" id="financeiroModal">
      <div class="fin-modal-card">
        <div class="fin-modal-head">
          <div><h3 id="modalTitle">Pagamento</h3><p class="muted" id="modalSub">Conferência e baixa do financeiro.</p></div>
          <button class="btn btn-secondary fin-small" id="modalClose" type="button">Fechar</button>
        </div>
        <form id="pagamentoForm" class="fin-form">
          <div class="fin-field"><label>Setor</label><select id="pagSetor">${SETORES.map((s) => `<option value="${s}">${s}</option>`).join('')}</select></div>
          <div class="fin-field"><label>Status</label><select id="pagStatus">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
          <div class="fin-field"><label>Favorecido</label><input id="pagFavorecido" /></div>
          <div class="fin-field"><label>Valor</label><input id="pagValor" type="number" step="0.01" min="0" /></div>
          <div class="fin-field"><label>Vencimento</label><input id="pagVencimento" type="date" /></div>
          <div class="fin-field"><label>Data pagamento</label><input id="pagDataPagamento" type="date" /></div>
          <div class="fin-field"><label>Forma de pagamento</label><select id="pagForma"><option value="PIX">PIX</option><option value="BOLETO">Boleto</option><option value="TRANSFERENCIA">Transferência</option><option value="CARTAO">Cartão</option><option value="OUTRO">Outro</option></select></div>
          <div class="fin-field"><label>Status NF</label><select id="pagNfStatus">${Object.entries(NF_STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
          <div class="fin-field"><label>Número NF</label><input id="pagNfNumero" /></div>
          <div class="fin-field"><label>URL NF</label><input id="pagNfUrl" /></div>
          <div class="fin-field full"><label>Comprovante</label><input id="pagComprovante" placeholder="Link do comprovante" /></div>
          <div class="fin-field full"><label>Descrição</label><textarea id="pagDescricao"></textarea></div>
          <div class="fin-field full"><label>Observações</label><textarea id="pagObs"></textarea></div>
        </form>
        <div class="fin-form-actions">
          <button class="btn btn-primary fin-small" type="submit" form="pagamentoForm">Salvar</button>
          <button class="btn btn-secondary fin-small" type="button" data-fast-status="APROVADO">Aprovar</button>
          <button class="btn btn-secondary fin-small" type="button" data-fast-status="PAGO">Marcar pago</button>
          <button class="btn btn-secondary fin-small" type="button" data-fast-status="RECUSADO">Recusar</button>
          <span id="pagFeedback" class="fin-feedback"></span>
        </div>
      </div>
    </div>
  `;

  function setFeedback(id, msg, type = '') {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg || '';
    el.className = `fin-feedback ${type}`.trim();
  }
  function statusPill(value, nf = false) {
    return `<span class="fin-status ${esc(slug(value))}">${esc(nf ? labelNf(value) : labelStatus(value))}</span>`;
  }
  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.fin-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.fin-panel').forEach((p) => p.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
  }

  async function loadRows() {
    const { data, error } = await supabase.from('financeiro_pagamentos').select('*').order('created_at', { ascending: false });
    if (error) {
      document.getElementById('financeiroTbody').innerHTML = `<tr><td colspan="8" class="fin-empty">${esc(error.message)}<br>Execute o SQL do módulo financeiro no Supabase antes de testar.</td></tr>`;
      updateKpis([]);
      return;
    }
    state.rows = data || [];
    renderRows();
  }

  function getFilteredRows() {
    const setor = document.getElementById('filterSetor').value;
    const status = document.getElementById('filterStatus').value;
    const venc = document.getElementById('filterVencimento').value;
    const search = normalize(document.getElementById('filterSearch').value);
    return state.rows.filter((r) => {
      if (setor && r.origem_setor !== setor) return false;
      if (status && r.status !== status) return false;
      if (venc && r.data_vencimento && r.data_vencimento > venc) return false;
      if (search) {
        const text = normalize([r.origem_setor, r.origem_codigo, r.favorecido_nome, r.descricao, r.observacoes, r.status, r.nf_numero].join(' '));
        if (!text.includes(search)) return false;
      }
      return true;
    });
  }

  function updateKpis(rows = state.rows) {
    const pendentes = rows.filter((r) => r.status === 'PENDENTE' || r.status === 'EM_ANALISE');
    const aprovados = rows.filter((r) => r.status === 'APROVADO' || r.status === 'AGENDADO');
    const pagos = rows.filter((r) => r.status === 'PAGO');
    const aberto = rows.filter((r) => ['PENDENTE', 'EM_ANALISE', 'APROVADO', 'AGENDADO'].includes(r.status)).reduce((sum, r) => sum + Number(r.valor || 0), 0);
    document.getElementById('kpiPendentes').textContent = pendentes.length;
    document.getElementById('kpiAprovados').textContent = aprovados.length;
    document.getElementById('kpiPagos').textContent = pagos.length;
    document.getElementById('kpiTotalAberto').textContent = money(aberto);
  }

  function renderRows() {
    updateKpis(state.rows);
    const tbody = document.getElementById('financeiroTbody');
    const rows = getFilteredRows();
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="fin-empty">Nenhum pagamento encontrado.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map((r) => `
      <tr>
        <td><strong>${esc(r.origem_setor || '-')}</strong><span class="fin-row-note">${esc(r.origem_codigo || r.origem_tabela || 'Manual')}</span></td>
        <td><strong>${esc(r.favorecido_nome || '-')}</strong><span class="fin-row-note">${esc(r.favorecido_documento || '')}</span></td>
        <td>${esc(r.descricao || '-')}<span class="fin-row-note">Solicitado por: ${esc(r.solicitado_por_nome || '-')}</span></td>
        <td><strong>${money(r.valor)}</strong><span class="fin-row-note">${esc(r.forma_pagamento || '-')}</span></td>
        <td>${brDate(r.data_vencimento)}<span class="fin-row-note">Pago: ${brDate(r.data_pagamento)}</span></td>
        <td>${statusPill(r.status || 'PENDENTE')}</td>
        <td>${statusPill(r.nf_status || 'NAO_INFORMADA', true)}<span class="fin-row-note">${esc(r.nf_numero || '')}</span></td>
        <td><div class="fin-actions"><button class="btn btn-secondary fin-small" data-action="open" data-id="${esc(r.id)}" type="button">Abrir</button></div></td>
      </tr>
    `).join('');
  }

  function openModal(row) {
    state.selected = row;
    document.getElementById('modalTitle').textContent = `${row.origem_setor || 'Financeiro'} · ${row.favorecido_nome || '-'}`;
    document.getElementById('modalSub').textContent = row.origem_codigo ? `Origem: ${row.origem_codigo}` : 'Lançamento financeiro';
    document.getElementById('pagSetor').value = row.origem_setor || 'HOSPEDAGEM';
    document.getElementById('pagStatus').value = row.status || 'PENDENTE';
    document.getElementById('pagFavorecido').value = row.favorecido_nome || '';
    document.getElementById('pagValor').value = row.valor || '';
    document.getElementById('pagVencimento').value = row.data_vencimento || '';
    document.getElementById('pagDataPagamento').value = row.data_pagamento || '';
    document.getElementById('pagForma').value = row.forma_pagamento || 'PIX';
    document.getElementById('pagNfStatus').value = row.nf_status || 'NAO_INFORMADA';
    document.getElementById('pagNfNumero').value = row.nf_numero || '';
    document.getElementById('pagNfUrl').value = row.nf_url || '';
    document.getElementById('pagComprovante').value = row.comprovante_url || '';
    document.getElementById('pagDescricao').value = row.descricao || '';
    document.getElementById('pagObs').value = row.observacoes || '';
    setFeedback('pagFeedback', '');
    document.getElementById('financeiroModal').classList.add('open');
  }
  function closeModal() {
    document.getElementById('financeiroModal').classList.remove('open');
    state.selected = null;
  }

  function readModalPayload() {
    return {
      origem_setor: document.getElementById('pagSetor').value,
      status: document.getElementById('pagStatus').value,
      favorecido_nome: document.getElementById('pagFavorecido').value.trim() || null,
      valor: Number(document.getElementById('pagValor').value || 0),
      data_vencimento: document.getElementById('pagVencimento').value || null,
      data_pagamento: document.getElementById('pagDataPagamento').value || null,
      forma_pagamento: document.getElementById('pagForma').value,
      nf_status: document.getElementById('pagNfStatus').value,
      nf_numero: document.getElementById('pagNfNumero').value.trim() || null,
      nf_url: document.getElementById('pagNfUrl').value.trim() || null,
      comprovante_url: document.getElementById('pagComprovante').value.trim() || null,
      descricao: document.getElementById('pagDescricao').value.trim() || null,
      observacoes: document.getElementById('pagObs').value.trim() || null,
      atualizado_por: userContext?.user?.id || null,
      atualizado_por_nome: userContext?.user?.name || userContext?.profile?.nome || null
    };
  }

  async function savePagamento(ev) {
    ev.preventDefault();
    if (!state.selected?.id) return;
    setFeedback('pagFeedback', 'Salvando...');
    const payload = readModalPayload();
    if (payload.status === 'PAGO' && !payload.data_pagamento) payload.data_pagamento = todayISO();
    const { error } = await supabase.from('financeiro_pagamentos').update(payload).eq('id', state.selected.id);
    if (error) { setFeedback('pagFeedback', error.message, 'err'); return; }
    setFeedback('pagFeedback', 'Pagamento atualizado.', 'ok');
    await loadRows();
  }

  async function createManual(ev) {
    ev.preventDefault();
    setFeedback('manualFeedback', 'Criando lançamento...');
    const payload = {
      origem_setor: document.getElementById('manualSetor').value,
      origem_tabela: 'manual',
      origem_codigo: `MANUAL-${Date.now()}`,
      descricao: document.getElementById('manualDescricao').value.trim(),
      favorecido_nome: document.getElementById('manualFavorecido').value.trim(),
      valor: Number(document.getElementById('manualValor').value || 0),
      data_vencimento: document.getElementById('manualVencimento').value || null,
      forma_pagamento: document.getElementById('manualForma').value,
      prioridade: document.getElementById('manualPrioridade').value,
      status: 'PENDENTE',
      nf_status: 'NAO_INFORMADA',
      observacoes: document.getElementById('manualObs').value.trim() || null,
      solicitado_por: userContext?.user?.id || null,
      solicitado_por_nome: userContext?.user?.name || userContext?.profile?.nome || null
    };
    const { error } = await supabase.from('financeiro_pagamentos').insert(payload);
    if (error) { setFeedback('manualFeedback', error.message, 'err'); return; }
    setFeedback('manualFeedback', 'Lançamento criado com sucesso.', 'ok');
    document.getElementById('manualForm').reset();
    await loadRows();
    setTab('pagamentos');
  }

  document.querySelectorAll('.fin-tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  document.getElementById('refreshFinanceiro').addEventListener('click', loadRows);
  ['filterSetor', 'filterStatus', 'filterVencimento', 'filterSearch'].forEach((id) => document.getElementById(id).addEventListener('input', renderRows));
  document.getElementById('manualForm').addEventListener('submit', createManual);
  document.getElementById('pagamentoForm').addEventListener('submit', savePagamento);
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('financeiroModal').addEventListener('click', (ev) => { if (ev.target.id === 'financeiroModal') closeModal(); });
  document.querySelectorAll('[data-fast-status]').forEach((btn) => btn.addEventListener('click', () => {
    document.getElementById('pagStatus').value = btn.dataset.fastStatus;
    if (btn.dataset.fastStatus === 'PAGO' && !document.getElementById('pagDataPagamento').value) document.getElementById('pagDataPagamento').value = todayISO();
    document.getElementById('pagamentoForm').requestSubmit();
  }));
  content.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-action="open"]');
    if (!btn) return;
    const row = state.rows.find((item) => String(item.id) === String(btn.dataset.id));
    if (row) openModal(row);
  });

  loadRows();
});
