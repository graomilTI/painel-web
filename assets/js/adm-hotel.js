import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const LABELS = {
  SOLICITADA: 'Solicitada', EM_ANALISE: 'Em análise', EM_COTACAO: 'Em cotação', RESERVADA: 'Reservada', CANCELADA: 'Cancelada', CONCLUIDA: 'Concluída',
  CHECKIN_PREVISTO: 'Check-in previsto', HOSPEDADO: 'Hospedado', CHECKOUT_HOJE: 'Checkout hoje', RENOVACAO_NECESSARIA: 'Renovação necessária', CHECKOUT_REALIZADO: 'Checkout realizado',
  NAO_INICIADO: 'Não iniciado', AGUARDANDO_PAGAMENTO: 'Aguardando pagamento', ENVIADO_AO_FINANCEIRO: 'Enviado ao financeiro', PAGO: 'Pago', SEM_COBRANCA: 'Sem cobrança',
  NAO_SOLICITADA: 'Não solicitada', AGUARDANDO_NF: 'Aguardando NF', NF_RECEBIDA: 'NF recebida', ENVIADO_PARA_LANCAMENTO: 'Enviado p/ lançamento', LANCADO: 'Lançado', DISPENSADO: 'Dispensado',
  ATIVO: 'Ativo', INATIVO: 'Inativo', BLOQUEADO: 'Bloqueado', PREFERENCIAL: 'Preferencial', NORMAL: 'Normal', EVITAR: 'Evitar'
};

function esc(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
function brDate(value) { if (!value) return '-'; const [y,m,d] = String(value).slice(0,10).split('-'); return y && m && d ? `${d}/${m}/${y}` : String(value); }
function money(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function diffDays(start, end) { if (!start || !end) return 1; return Math.max(1, Math.round((new Date(`${end}T00:00:00`) - new Date(`${start}T00:00:00`)) / 86400000) || 1); }
function slug(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_'); }
function label(value) { return LABELS[value] || value || '-'; }
function normalizeText(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase(); }
function normalizeUF(value) { return String(value || '').trim().toUpperCase().slice(0, 2); }

function injectStyles() {
  if (document.getElementById('admHospStyles')) return;
  const style = document.createElement('style');
  style.id = 'admHospStyles';
  style.textContent = `
    .adm-hosp-tabs{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}.adm-hosp-tab{width:auto!important;margin-top:0!important;border:1px solid var(--line-2);background:#0b1220;color:var(--text);border-radius:999px;padding:10px 14px;cursor:pointer;font-weight:800}.adm-hosp-tab.active{background:rgba(22,101,52,.32);color:#dcfce7;border-color:rgba(111,208,165,.34)}.adm-hosp-panel{display:none}.adm-hosp-panel.active{display:block}.adm-hosp-btn{width:auto!important;margin-top:0!important}.adm-hosp-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px}.adm-hosp-table{width:100%;border-collapse:collapse;min-width:1180px;background:#0b1220}.adm-hosp-table th,.adm-hosp-table td{padding:12px 14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.adm-hosp-table th{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em}.adm-hosp-table tr:hover td{background:rgba(111,208,165,.035)}.adm-hosp-actions{display:flex;gap:8px;flex-wrap:wrap}.adm-hosp-small{padding:8px 10px!important;border-radius:12px!important;font-size:12px}.adm-hosp-status{display:inline-flex;align-items:center;padding:6px 9px;border-radius:999px;border:1px solid var(--line-2);background:rgba(255,255,255,.04);font-size:12px;font-weight:800;white-space:nowrap}.adm-hosp-status.solicitada,.adm-hosp-status.em_analise,.adm-hosp-status.em_cotacao,.adm-hosp-status.aguardando_pagamento,.adm-hosp-status.aguardando_nf{color:#fde68a;background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.24)}.adm-hosp-status.reservada,.adm-hosp-status.checkin_previsto,.adm-hosp-status.hospedado,.adm-hosp-status.enviado_ao_financeiro,.adm-hosp-status.nf_recebida{color:#bfdbfe;background:rgba(59,130,246,.11);border-color:rgba(59,130,246,.25)}.adm-hosp-status.concluida,.adm-hosp-status.pago,.adm-hosp-status.lancado,.adm-hosp-status.ativo,.adm-hosp-status.preferencial{color:#bbf7d0;background:rgba(22,101,52,.22);border-color:rgba(22,101,52,.34)}.adm-hosp-status.cancelada,.adm-hosp-status.bloqueado,.adm-hosp-status.evitar{color:#fecaca;background:rgba(220,38,38,.13);border-color:rgba(220,38,38,.24)}.adm-hosp-status.checkout_hoje,.adm-hosp-status.renovacao_necessaria{color:#fed7aa;background:rgba(249,115,22,.11);border-color:rgba(249,115,22,.24)}
    .adm-hosp-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.adm-hosp-field{display:flex;flex-direction:column;gap:7px}.adm-hosp-field.full{grid-column:1/-1}.adm-hosp-field label{font-size:13px;color:#cbd5e1;font-weight:800}.adm-hosp-field input,.adm-hosp-field textarea,.adm-hosp-field select{width:100%;border:1px solid #334155;background:#0b1220;color:var(--text);border-radius:14px;padding:12px 13px;outline:none;color-scheme:dark}.adm-hosp-field textarea{resize:vertical;min-height:76px}.adm-hosp-field input:focus,.adm-hosp-field textarea:focus,.adm-hosp-field select:focus{border-color:var(--green-2);box-shadow:0 0 0 3px rgba(111,208,165,.12)}.adm-hosp-form-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:16px}.adm-hosp-feedback{color:var(--muted);font-size:13px}.adm-hosp-feedback.ok{color:#bbf7d0}.adm-hosp-feedback.err{color:#fecaca}.adm-hosp-modal{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(2,6,23,.75);backdrop-filter:blur(6px)}.adm-hosp-modal.open{display:flex}.adm-hosp-modal-card{width:min(980px,100%);max-height:92vh;overflow:auto;background:#081611;border:1px solid var(--line-2);border-radius:24px;box-shadow:var(--shadow);padding:20px}.adm-hosp-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:16px}.adm-hosp-modal-head h3{margin:0}.adm-hosp-muted{color:var(--muted);font-size:13px}.adm-hosp-filters{display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:12px;align-items:end;margin-bottom:14px}.adm-hosp-empty{padding:18px;text-align:center;color:var(--muted)}.adm-hosp-kpi-alert{color:#fecaca}.adm-hosp-kpi-warn{color:#fde68a}.adm-hosp-kpi-good{color:#bbf7d0}.adm-hosp-row-note{display:block;color:var(--muted);font-size:12px;margin-top:3px}.adm-hosp-card-line{display:grid;gap:8px}.adm-hosp-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px}.adm-hosp-search{min-width:260px;border:1px solid #334155;background:#0b1220;color:var(--text);border-radius:14px;padding:12px 13px;color-scheme:dark}.adm-hosp-select-hint{margin-top:6px;font-size:12px;color:#93c5fd}.adm-hosp-select-hint.warn{color:#fde68a}
    @media(max-width:900px){.adm-hosp-form,.adm-hosp-filters{grid-template-columns:1fr}.adm-hosp-search{min-width:0;width:100%}}
  `;
  document.head.appendChild(style);
}

initProtectedPage('Módulo Hospedagem', (content, userContext) => {
  injectStyles();
  const state = { rows: [], resumo: {}, hoteis: [], editingHotel: null, tab: 'painel', selected: null };

  content.innerHTML = `
    <section class="hero-card">
      <div>
        <div class="eyebrow">Operação</div>
        <h2>Hospedagem</h2>
        <p>Controle solicitações, reservas, checkouts, pagamentos, notas fiscais e cadastro de hotéis em um fluxo único.</p>
      </div>
      <div class="hero-badge-wrap"><span class="hero-badge">HOTELARIA</span></div>
    </section>

    <div class="adm-hosp-tabs">
      <button class="adm-hosp-tab active" data-tab="painel" type="button">Painel</button>
      <button class="adm-hosp-tab" data-tab="solicitacoes" type="button">Solicitações</button>
      <button class="adm-hosp-tab" data-tab="hoteis" type="button">Hotéis</button>
    </div>

    <section id="tab-painel" class="adm-hosp-panel active">
      <section class="grid-cards compact-grid">
        <article class="card"><h3>Solicitações abertas</h3><p class="metric adm-hosp-kpi-warn" id="kpiAbertas">0</p><p class="muted">Aguardando análise/cotação.</p></article>
        <article class="card"><h3>Checkouts hoje</h3><p class="metric" id="kpiHoje">0</p><p class="muted">Reservas com saída prevista hoje.</p></article>
        <article class="card"><h3>Checkouts vencidos</h3><p class="metric adm-hosp-kpi-alert" id="kpiVencidos">0</p><p class="muted">Precisam de ação ou renovação.</p></article>
        <article class="card"><h3>Pendências financeiras</h3><p class="metric adm-hosp-kpi-warn" id="kpiFin">0</p><p class="muted">Aguardando pagamento/financeiro.</p></article>
        <article class="card"><h3>Pendências de NF</h3><p class="metric adm-hosp-kpi-warn" id="kpiNf">0</p><p class="muted">Pago/encaminhado e sem nota concluída.</p></article>
      </section>
      <article class="card mt-16">
        <div class="section-head"><div><h3>Fila operacional</h3><p class="muted">Principais solicitações e pendências em aberto.</p></div><button class="btn btn-secondary adm-hosp-btn" id="refreshPainel" type="button">Atualizar</button></div>
        <div class="adm-hosp-table-wrap"><table class="adm-hosp-table"><thead><tr><th>Código</th><th>Colaboradores</th><th>Cidade</th><th>Período</th><th>Hotel</th><th>Status</th><th>Financeiro</th><th>NF</th><th>Ações</th></tr></thead><tbody id="painelTbody"><tr><td colspan="9" class="adm-hosp-empty">Carregando...</td></tr></tbody></table></div>
      </article>
    </section>

    <section id="tab-solicitacoes" class="adm-hosp-panel">
      <article class="card">
        <div class="adm-hosp-filters">
          <div class="adm-hosp-field"><label>Status</label><select id="filterStatus"><option value="">Todos</option><option value="SOLICITADA">Solicitada</option><option value="EM_ANALISE">Em análise</option><option value="EM_COTACAO">Em cotação</option><option value="RESERVADA">Reservada</option><option value="CONCLUIDA">Concluída</option><option value="CANCELADA">Cancelada</option></select></div>
          <div class="adm-hosp-field"><label>Busca</label><input id="filterSearch" placeholder="Código, colaborador, cidade, hotel..." /></div>
          <div class="adm-hosp-field"><label>Checkout até</label><input id="filterCheckout" type="date" /></div>
          <button class="btn btn-secondary adm-hosp-btn" type="button" id="applyFilters">Filtrar</button>
        </div>
        <div class="adm-hosp-table-wrap"><table class="adm-hosp-table"><thead><tr><th>Código</th><th>Solicitante</th><th>Colaboradores</th><th>Destino</th><th>Embarque</th><th>Período</th><th>Hotel</th><th>Status</th><th>Ações</th></tr></thead><tbody id="solTbody"><tr><td colspan="9" class="adm-hosp-empty">Carregando...</td></tr></tbody></table></div>
      </article>
    </section>

    <section id="tab-hoteis" class="adm-hosp-panel">
      <article class="card">
        <div class="adm-hosp-toolbar"><div><h3>Cadastro de hotéis</h3><p class="muted">Base usada pela equipe de hospedagem e pelo futuro mapa de custos.</p></div><input id="hotelSearch" class="adm-hosp-search" placeholder="Buscar hotel, cidade, CNPJ..." /></div>
        <form id="hotelForm" class="adm-hosp-form">
          <div class="adm-hosp-field"><label>Nome do hotel *</label><input id="hotelNome" required /></div>
          <div class="adm-hosp-field"><label>Cidade *</label><input id="hotelCidade" required /></div>
          <div class="adm-hosp-field"><label>UF *</label><input id="hotelUf" required maxlength="2" /></div>
          <div class="adm-hosp-field"><label>Valor diária padrão</label><input id="hotelDiaria" type="number" step="0.01" min="0" /></div>
          <div class="adm-hosp-field"><label>WhatsApp</label><input id="hotelWhatsapp" /></div>
          <div class="adm-hosp-field"><label>CNPJ/CPF</label><input id="hotelCnpj" /></div>
          <div class="adm-hosp-field full"><label>Endereço</label><input id="hotelEndereco" /></div>
          <div class="adm-hosp-field full"><label>Link Google Maps</label><input id="hotelMaps" /></div>
          <div class="adm-hosp-field"><label>Status</label><select id="hotelStatus"><option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option><option value="BLOQUEADO">Bloqueado</option></select></div>
          <div class="adm-hosp-field"><label>Prioridade</label><select id="hotelPrioridade"><option value="NORMAL">Normal</option><option value="PREFERENCIAL">Preferencial</option><option value="EVITAR">Evitar</option></select></div>
          <div class="adm-hosp-field full"><label>Observações</label><textarea id="hotelObs"></textarea></div>
        </form>
        <div class="adm-hosp-form-actions"><button class="btn btn-primary adm-hosp-btn" type="submit" form="hotelForm" id="hotelSave">Salvar hotel</button><button class="btn btn-secondary adm-hosp-btn" type="button" id="hotelClear">Limpar</button><span id="hotelFeedback" class="adm-hosp-feedback"></span></div>
      </article>
      <article class="card mt-16"><div class="adm-hosp-table-wrap"><table class="adm-hosp-table"><thead><tr><th>Hotel</th><th>Cidade</th><th>Diária</th><th>Contato</th><th>Status</th><th>Prioridade</th><th>Ações</th></tr></thead><tbody id="hotelTbody"><tr><td colspan="7" class="adm-hosp-empty">Carregando...</td></tr></tbody></table></div></article>
    </section>

    <div id="reservaModal" class="adm-hosp-modal">
      <div class="adm-hosp-modal-card">
        <div class="adm-hosp-modal-head"><div><h3 id="modalTitle">Reserva</h3><p class="muted" id="modalSub">Transforme a solicitação em reserva e acompanhe financeiro/NF.</p></div><button class="btn btn-secondary adm-hosp-btn" type="button" id="modalClose">Fechar</button></div>
        <form id="reservaForm" class="adm-hosp-form">
          <div class="adm-hosp-field full"><label>Solicitação</label><input id="resInfo" readonly /></div>
          <div class="adm-hosp-field"><label>Hotel recomendado *</label><select id="resHotel"></select><span id="resHotelHint" class="adm-hosp-select-hint"></span></div>
          <div class="adm-hosp-field"><label>Nome do hotel manual</label><input id="resHotelNome" placeholder="Use caso ainda não esteja cadastrado" /></div>
          <div class="adm-hosp-field"><label>Valor diária *</label><input id="resDiaria" type="number" step="0.01" min="0" required /></div>
          <div class="adm-hosp-field"><label>Quartos</label><input id="resQuartos" type="number" min="1" value="1" /></div>
          <div class="adm-hosp-field"><label>Check-in *</label><input id="resCheckin" type="date" required /></div>
          <div class="adm-hosp-field"><label>Check-out *</label><input id="resCheckout" type="date" required /></div>
          <div class="adm-hosp-field"><label>Diárias</label><input id="resDiarias" readonly /></div>
          <div class="adm-hosp-field"><label>Total previsto</label><input id="resTotal" readonly /></div>
          <div class="adm-hosp-field"><label>Tipo quarto</label><select id="resTipo"><option value="INDIVIDUAL">Individual</option><option value="DUPLO">Duplo</option><option value="TRIPLO">Triplo</option><option value="COLETIVO">Coletivo</option><option value="OUTRO">Outro</option></select></div>
          <div class="adm-hosp-field"><label>Confirmado com</label><input id="resConfirmado" /></div>
          <div class="adm-hosp-field"><label>Contato confirmação</label><input id="resContato" /></div>
          <div class="adm-hosp-field"><label>Status hospedagem</label><select id="resStatus"><option value="CHECKIN_PREVISTO">Check-in previsto</option><option value="HOSPEDADO">Hospedado</option><option value="CHECKOUT_HOJE">Checkout hoje</option><option value="RENOVACAO_NECESSARIA">Renovação necessária</option><option value="CHECKOUT_REALIZADO">Checkout realizado</option><option value="CANCELADA">Cancelada</option></select></div>
          <div class="adm-hosp-field full"><label>Observação hospedagem</label><textarea id="resObs"></textarea></div>
        </form>
        <div class="adm-hosp-form-actions"><button class="btn btn-primary adm-hosp-btn" type="submit" form="reservaForm" id="resSave">Salvar reserva</button><button class="btn btn-secondary adm-hosp-btn" type="button" id="markAnalise">Marcar em análise</button><span id="resFeedback" class="adm-hosp-feedback"></span></div>

        <div class="card mt-16" style="box-shadow:none;">
          <h3>Financeiro e NF</h3>
          <div class="adm-hosp-form">
            <div class="adm-hosp-field"><label>Status financeiro</label><select id="finStatus"><option value="NAO_INICIADO">Não iniciado</option><option value="AGUARDANDO_PAGAMENTO">Aguardando pagamento</option><option value="ENVIADO_AO_FINANCEIRO">Enviado ao financeiro</option><option value="PAGO">Pago</option><option value="SEM_COBRANCA">Sem cobrança</option><option value="CANCELADO">Cancelado</option></select></div>
            <div class="adm-hosp-field"><label>Valor total</label><input id="finValor" type="number" step="0.01" min="0" /></div>
            <div class="adm-hosp-field"><label>Data vencimento</label><input id="finVenc" type="date" /></div>
            <div class="adm-hosp-field"><label>Data pagamento</label><input id="finPag" type="date" /></div>
            <div class="adm-hosp-field full"><label>URL comprovante</label><input id="finComp" placeholder="Link do comprovante" /></div>
            <div class="adm-hosp-field"><label>Status NF</label><select id="nfStatus"><option value="NAO_SOLICITADA">Não solicitada</option><option value="AGUARDANDO_NF">Aguardando NF</option><option value="NF_RECEBIDA">NF recebida</option><option value="ENVIADO_PARA_LANCAMENTO">Enviado para lançamento</option><option value="LANCADO">Lançado</option><option value="DISPENSADO">Dispensado</option><option value="CANCELADO">Cancelado</option></select></div>
            <div class="adm-hosp-field"><label>Número NF</label><input id="nfNumero" /></div>
            <div class="adm-hosp-field"><label>Valor NF</label><input id="nfValor" type="number" step="0.01" min="0" /></div>
            <div class="adm-hosp-field"><label>Data emissão</label><input id="nfEmissao" type="date" /></div>
            <div class="adm-hosp-field full"><label>URL nota</label><input id="nfUrl" placeholder="Link da nota fiscal" /></div>
          </div>
          <div class="adm-hosp-form-actions"><button class="btn btn-secondary adm-hosp-btn" type="button" id="saveFinNf">Salvar financeiro/NF</button><span id="finNfFeedback" class="adm-hosp-feedback"></span></div>
        </div>
      </div>
    </div>
  `;

  function setFeedback(id, msg, type = '') { const el = document.getElementById(id); if (!el) return; el.textContent = msg || ''; el.className = `adm-hosp-feedback ${type}`.trim(); }
  function statusPill(value) { return `<span class="adm-hosp-status ${esc(slug(value))}">${esc(label(value))}</span>`; }
  function setTab(tab) { state.tab = tab; document.querySelectorAll('.adm-hosp-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab)); document.querySelectorAll('.adm-hosp-panel').forEach((p) => p.classList.remove('active')); document.getElementById(`tab-${tab}`).classList.add('active'); if (tab === 'hoteis') loadHoteis(); if (tab !== 'hoteis') loadRows(); }

  async function loadResumo() {
    const { data } = await supabase.from('hospedagem_dashboard_resumo').select('*').maybeSingle();
    state.resumo = data || {};
    document.getElementById('kpiAbertas').textContent = state.resumo.solicitacoes_abertas || 0;
    document.getElementById('kpiHoje').textContent = state.resumo.checkouts_hoje || 0;
    document.getElementById('kpiVencidos').textContent = state.resumo.checkouts_vencidos || 0;
    document.getElementById('kpiFin').textContent = state.resumo.pendencias_financeiras || 0;
    document.getElementById('kpiNf').textContent = state.resumo.pendencias_nf || 0;
  }

  async function loadRows() {
    await loadResumo();
    const { data, error } = await supabase.from('hospedagem_painel_geral').select('*').order('data_solicitacao', { ascending: false });
    if (error) {
      document.getElementById('painelTbody').innerHTML = `<tr><td colspan="9" class="adm-hosp-empty">${esc(error.message)}</td></tr>`;
      document.getElementById('solTbody').innerHTML = `<tr><td colspan="9" class="adm-hosp-empty">${esc(error.message)}</td></tr>`;
      return;
    }
    state.rows = data || [];
    renderPainel();
    renderSolicitacoes();
  }

  function renderPainel() {
    const tbody = document.getElementById('painelTbody');
    const priority = state.rows.filter((r) => ['SOLICITADA','EM_ANALISE','EM_COTACAO','RESERVADA'].includes(r.status_solicitacao) || r.checkout_hoje || r.checkout_vencido || r.pendencia_financeira || r.pendencia_nf).slice(0, 30);
    if (!priority.length) { tbody.innerHTML = `<tr><td colspan="9" class="adm-hosp-empty">Nenhuma pendência operacional.</td></tr>`; return; }
    tbody.innerHTML = priority.map(rowHtml).join('');
  }

  function renderSolicitacoes() {
    const tbody = document.getElementById('solTbody');
    const status = document.getElementById('filterStatus').value;
    const search = String(document.getElementById('filterSearch').value || '').toLowerCase().trim();
    const checkout = document.getElementById('filterCheckout').value;
    let rows = [...state.rows];
    if (status) rows = rows.filter((r) => r.status_solicitacao === status);
    if (checkout) rows = rows.filter((r) => !r.data_checkout || r.data_checkout <= checkout || !r.reserva_id);
    if (search) rows = rows.filter((r) => [r.codigo, r.solicitante_nome, r.colaboradores, r.cidade, r.uf, r.local_embarque, r.hotel, r.cliente].join(' ').toLowerCase().includes(search));
    if (!rows.length) { tbody.innerHTML = `<tr><td colspan="9" class="adm-hosp-empty">Nenhuma solicitação encontrada.</td></tr>`; return; }
    tbody.innerHTML = rows.map((r) => `
      <tr>
        <td><strong>${esc(r.codigo || '-')}</strong><span class="adm-hosp-row-note">${brDate(r.data_solicitacao)}</span></td>
        <td>${esc(r.solicitante_nome || '-')}<span class="adm-hosp-row-note">${esc([r.supervisao, r.coordenacao].filter(Boolean).join(' · '))}</span></td>
        <td>${esc(r.colaboradores || '-')}</td>
        <td>${esc([r.cidade, r.uf].filter(Boolean).join('/'))}<span class="adm-hosp-row-note">${esc(r.cliente || '')}</span></td>
        <td>${esc(r.local_embarque || '-')}</td>
        <td>${brDate(r.data_checkin_prevista)} até ${brDate(r.data_checkout_prevista)}<span class="adm-hosp-row-note">${esc(r.quantidade_diarias_prevista || '-')} diária(s)</span></td>
        <td>${esc(r.hotel || '-')}</td>
        <td>${statusPill(r.status_solicitacao)}</td>
        <td><div class="adm-hosp-actions"><button class="btn btn-secondary adm-hosp-small" data-action="open" data-id="${esc(r.solicitacao_id)}" type="button">Abrir</button></div></td>
      </tr>
    `).join('');
  }

  function rowHtml(r) {
    return `
      <tr>
        <td><strong>${esc(r.codigo || '-')}</strong><span class="adm-hosp-row-note">${brDate(r.data_solicitacao)}</span></td>
        <td>${esc(r.colaboradores || '-')}</td>
        <td>${esc([r.cidade, r.uf].filter(Boolean).join('/'))}<span class="adm-hosp-row-note">${esc(r.local_embarque || '')}</span></td>
        <td>${brDate(r.data_checkin || r.data_checkin_prevista)} até ${brDate(r.data_checkout || r.data_checkout_prevista)}</td>
        <td>${esc(r.hotel || '-')}<span class="adm-hosp-row-note">${r.valor_total_previsto ? money(r.valor_total_previsto) : ''}</span></td>
        <td>${statusPill(r.status_solicitacao)}<span class="adm-hosp-row-note">${r.status_hospedagem ? label(r.status_hospedagem) : ''}</span></td>
        <td>${statusPill(r.status_financeiro || 'NAO_INICIADO')}</td>
        <td>${statusPill(r.status_nota || 'NAO_SOLICITADA')}</td>
        <td><div class="adm-hosp-actions"><button class="btn btn-secondary adm-hosp-small" data-action="open" data-id="${esc(r.solicitacao_id)}" type="button">Abrir</button></div></td>
      </tr>`;
  }

  async function loadHoteis() {
    const { data, error } = await supabase.from('hospedagem_hoteis').select('*').order('cidade', { ascending: true }).order('nome', { ascending: true });
    if (error) { document.getElementById('hotelTbody').innerHTML = `<tr><td colspan="7" class="adm-hosp-empty">${esc(error.message)}</td></tr>`; return; }
    state.hoteis = data || [];
    fillHotelSelect();
    renderHoteis();
  }

  function getHoteisRecomendados(row = state.selected) {
    const cidadeSolicitada = normalizeText(row?.cidade);
    const ufSolicitada = normalizeUF(row?.uf);
    if (!cidadeSolicitada && !ufSolicitada) return [];
    return state.hoteis.filter((h) => {
      const mesmaCidade = cidadeSolicitada ? normalizeText(h.cidade) === cidadeSolicitada : true;
      const mesmaUf = ufSolicitada ? normalizeUF(h.uf) === ufSolicitada : true;
      return mesmaCidade && mesmaUf && String(h.status || 'ATIVO').toUpperCase() !== 'INATIVO' && String(h.status || '').toUpperCase() !== 'BLOQUEADO';
    }).sort((a, b) => {
      const prioridade = { PREFERENCIAL: 0, NORMAL: 1, EVITAR: 2 };
      return (prioridade[String(a.prioridade || 'NORMAL').toUpperCase()] ?? 1) - (prioridade[String(b.prioridade || 'NORMAL').toUpperCase()] ?? 1)
        || String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
    });
  }

  function fillHotelSelect(row = state.selected) {
    const select = document.getElementById('resHotel');
    if (!select) return;
    const hint = document.getElementById('resHotelHint');
    const rows = getHoteisRecomendados(row);
    const cidadeUf = [row?.cidade, row?.uf].filter(Boolean).join('/');
    select.innerHTML = `<option value="">Selecionar hotel cadastrado</option>` + rows.map((h) => `<option value="${esc(h.id)}" data-diaria="${esc(h.valor_diaria_padrao || '')}" data-nome="${esc(h.nome)}" data-cidade="${esc(h.cidade || '')}" data-uf="${esc(h.uf || '')}">${esc(h.nome)} · ${esc(h.cidade || '-')}/${esc(h.uf || '')}${h.valor_diaria_padrao ? ` · ${money(h.valor_diaria_padrao)}` : ''}</option>`).join('');
    if (hint) {
      if (rows.length) {
        hint.textContent = `${rows.length} hotel(is) recomendado(s) para ${cidadeUf || 'a cidade solicitada'}.`;
        hint.className = 'adm-hosp-select-hint';
      } else {
        hint.textContent = `Nenhum hotel ativo cadastrado para ${cidadeUf || 'a cidade solicitada'}. Use o campo manual ou cadastre o hotel.`;
        hint.className = 'adm-hosp-select-hint warn';
      }
    }
  }

  function renderHoteis() {
    const tbody = document.getElementById('hotelTbody');
    const search = String(document.getElementById('hotelSearch').value || '').toLowerCase().trim();
    let rows = state.hoteis;
    if (search) rows = rows.filter((h) => [h.nome, h.cidade, h.uf, h.cnpj_cpf, h.whatsapp].join(' ').toLowerCase().includes(search));
    if (!rows.length) { tbody.innerHTML = `<tr><td colspan="7" class="adm-hosp-empty">Nenhum hotel encontrado.</td></tr>`; return; }
    tbody.innerHTML = rows.map((h) => `
      <tr>
        <td><strong>${esc(h.nome)}</strong><span class="adm-hosp-row-note">${esc(h.endereco || '')}</span></td>
        <td>${esc([h.cidade, h.uf].filter(Boolean).join('/'))}</td>
        <td>${h.valor_diaria_padrao ? money(h.valor_diaria_padrao) : '-'}</td>
        <td>${esc(h.whatsapp || h.telefone || '-')}<span class="adm-hosp-row-note">${esc(h.cnpj_cpf || '')}</span></td>
        <td>${statusPill(h.status || 'ATIVO')}</td>
        <td>${statusPill(h.prioridade || 'NORMAL')}</td>
        <td><div class="adm-hosp-actions"><button class="btn btn-secondary adm-hosp-small" data-action="edit-hotel" data-id="${esc(h.id)}" type="button">Editar</button></div></td>
      </tr>
    `).join('');
  }

  function resetHotelForm() {
    state.editingHotel = null;
    document.getElementById('hotelForm').reset();
    document.getElementById('hotelStatus').value = 'ATIVO';
    document.getElementById('hotelPrioridade').value = 'NORMAL';
    document.getElementById('hotelSave').textContent = 'Salvar hotel';
    setFeedback('hotelFeedback', '');
  }

  function fillHotelForm(h) {
    state.editingHotel = h.id;
    document.getElementById('hotelNome').value = h.nome || '';
    document.getElementById('hotelCidade').value = h.cidade || '';
    document.getElementById('hotelUf').value = h.uf || '';
    document.getElementById('hotelDiaria').value = h.valor_diaria_padrao || '';
    document.getElementById('hotelWhatsapp').value = h.whatsapp || '';
    document.getElementById('hotelCnpj').value = h.cnpj_cpf || '';
    document.getElementById('hotelEndereco').value = h.endereco || '';
    document.getElementById('hotelMaps').value = h.link_maps || '';
    document.getElementById('hotelStatus').value = h.status || 'ATIVO';
    document.getElementById('hotelPrioridade').value = h.prioridade || 'NORMAL';
    document.getElementById('hotelObs').value = h.observacoes || '';
    document.getElementById('hotelSave').textContent = 'Salvar alterações';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveHotel(ev) {
    ev.preventDefault();
    setFeedback('hotelFeedback', 'Salvando...');
    const payload = {
      nome: document.getElementById('hotelNome').value.trim(), cidade: document.getElementById('hotelCidade').value.trim(), uf: document.getElementById('hotelUf').value.trim().toUpperCase(),
      valor_diaria_padrao: document.getElementById('hotelDiaria').value ? Number(document.getElementById('hotelDiaria').value) : null, whatsapp: document.getElementById('hotelWhatsapp').value.trim() || null,
      cnpj_cpf: document.getElementById('hotelCnpj').value.trim() || null, endereco: document.getElementById('hotelEndereco').value.trim() || null, link_maps: document.getElementById('hotelMaps').value.trim() || null,
      status: document.getElementById('hotelStatus').value, prioridade: document.getElementById('hotelPrioridade').value, observacoes: document.getElementById('hotelObs').value.trim() || null, atualizado_por: userContext?.user?.id || null
    };
    const result = state.editingHotel ? await supabase.from('hospedagem_hoteis').update(payload).eq('id', state.editingHotel) : await supabase.from('hospedagem_hoteis').insert({ ...payload, criado_por: userContext?.user?.id || null });
    if (result.error) { setFeedback('hotelFeedback', result.error.message, 'err'); return; }
    resetHotelForm(); setFeedback('hotelFeedback', 'Hotel salvo com sucesso.', 'ok'); await loadHoteis();
  }

  function openModal(row) {
    state.selected = row;
    document.getElementById('modalTitle').textContent = `Reserva ${row.codigo || ''}`;
    document.getElementById('modalSub').textContent = `${row.colaboradores || '-'} · ${[row.cidade, row.uf].filter(Boolean).join('/')}`;
    document.getElementById('resInfo').value = `${row.codigo || '-'} · ${row.colaboradores || '-'} · ${[row.cidade, row.uf].filter(Boolean).join('/')}`;
    document.getElementById('resCheckin').value = row.data_checkin || row.data_checkin_prevista || '';
    document.getElementById('resCheckout').value = row.data_checkout || row.data_checkout_prevista || '';
    document.getElementById('resDiaria').value = row.valor_diaria || '';
    document.getElementById('resQuartos').value = row.quantidade_quartos || 1;
    document.getElementById('resTipo').value = 'INDIVIDUAL';
    document.getElementById('resStatus').value = row.status_hospedagem || 'CHECKIN_PREVISTO';
    document.getElementById('resHotelNome').value = row.hotel || '';
    fillHotelSelect(row);
    document.getElementById('resConfirmado').value = '';
    document.getElementById('resContato').value = '';
    document.getElementById('resObs').value = '';
    document.getElementById('resHotel').value = row.hotel_id || '';
    if (row.hotel_id && document.getElementById('resHotel').value !== row.hotel_id) {
      document.getElementById('resHotel').value = '';
    }
    document.getElementById('finStatus').value = row.status_financeiro || 'NAO_INICIADO';
    document.getElementById('finValor').value = row.valor_financeiro || row.valor_total_previsto || '';
    document.getElementById('finVenc').value = row.data_vencimento || '';
    document.getElementById('finPag').value = row.data_pagamento || '';
    document.getElementById('finComp').value = row.comprovante_pagamento_url || '';
    document.getElementById('nfStatus').value = row.status_nota || 'NAO_SOLICITADA';
    document.getElementById('nfNumero').value = row.numero_nf || '';
    document.getElementById('nfValor').value = row.valor_nf || '';
    document.getElementById('nfEmissao').value = '';
    document.getElementById('nfUrl').value = row.nota_url || '';
    updateReservaTotals();
    setFeedback('resFeedback', ''); setFeedback('finNfFeedback', '');
    document.getElementById('reservaModal').classList.add('open');
  }

  function closeModal() { document.getElementById('reservaModal').classList.remove('open'); state.selected = null; }
  function updateReservaTotals() { const dias = diffDays(document.getElementById('resCheckin').value, document.getElementById('resCheckout').value); const total = dias * Number(document.getElementById('resDiaria').value || 0) * Number(document.getElementById('resQuartos').value || 1); document.getElementById('resDiarias').value = dias; document.getElementById('resTotal').value = money(total); if (!document.getElementById('finValor').value) document.getElementById('finValor').value = total || ''; }

  async function saveReserva(ev) {
    ev.preventDefault();
    if (!state.selected) return;
    setFeedback('resFeedback', 'Salvando reserva...');
    const hotelSelect = document.getElementById('resHotel');
    const opt = hotelSelect.selectedOptions[0];
    const hotelId = hotelSelect.value || null;
    const hotelManual = document.getElementById('resHotelNome').value.trim();
    if (!hotelId && !hotelManual) { setFeedback('resFeedback', 'Selecione um hotel recomendado da cidade/UF solicitada ou informe o nome manualmente.', 'err'); return; }
    const diaria = Number(document.getElementById('resDiaria').value || 0);
    const quartos = Number(document.getElementById('resQuartos').value || 1);
    const diarias = diffDays(document.getElementById('resCheckin').value, document.getElementById('resCheckout').value);
    const payload = {
      solicitacao_id: state.selected.solicitacao_id, hotel_id: hotelId, nome_hotel: hotelManual || opt?.dataset?.nome || state.selected.hotel || null,
      cidade_hotel: opt?.dataset?.cidade || state.selected.cidade || null, uf_hotel: opt?.dataset?.uf || state.selected.uf || null, valor_diaria: diaria, quantidade_diarias: diarias, quantidade_quartos: quartos,
      tipo_quarto: document.getElementById('resTipo').value, valor_total_previsto: diaria * diarias * quartos, data_checkin: document.getElementById('resCheckin').value, data_checkout: document.getElementById('resCheckout').value,
      confirmado_com: document.getElementById('resConfirmado').value.trim() || null, contato_confirmacao: document.getElementById('resContato').value.trim() || null, status_hospedagem: document.getElementById('resStatus').value,
      observacao_hospedagem: document.getElementById('resObs').value.trim() || null, atualizado_por: userContext?.user?.id || null
    };
    const result = state.selected.reserva_id ? await supabase.from('hospedagem_reservas').update(payload).eq('id', state.selected.reserva_id) : await supabase.from('hospedagem_reservas').insert({ ...payload, criado_por: userContext?.user?.id || null }).select('id').single();
    if (result.error) { setFeedback('resFeedback', result.error.message, 'err'); return; }
    const reservaId = state.selected.reserva_id || result.data?.id;
    await supabase.from('hospedagem_solicitacoes').update({ status_solicitacao: payload.status_hospedagem === 'CANCELADA' ? 'CANCELADA' : 'RESERVADA' }).eq('id', state.selected.solicitacao_id);
    state.selected.reserva_id = reservaId;
    setFeedback('resFeedback', 'Reserva salva com sucesso.', 'ok');
    await loadRows();
  }

  async function saveFinNf() {
    if (!state.selected?.reserva_id) { setFeedback('finNfFeedback', 'Salve a reserva antes de controlar financeiro/NF.', 'err'); return; }
    setFeedback('finNfFeedback', 'Salvando financeiro/NF...');
    const reservaId = state.selected.reserva_id;
    const finPayload = { reserva_id: reservaId, status_financeiro: document.getElementById('finStatus').value, valor_total: Number(document.getElementById('finValor').value || 0), data_vencimento: document.getElementById('finVenc').value || null, data_pagamento: document.getElementById('finPag').value || null, comprovante_pagamento_url: document.getElementById('finComp').value.trim() || null, responsavel_pagamento_id: userContext?.user?.id || null, responsavel_pagamento: userContext?.user?.name || null };
    const nfPayload = { reserva_id: reservaId, status_nota: document.getElementById('nfStatus').value, numero_nf: document.getElementById('nfNumero').value.trim() || null, valor_nf: document.getElementById('nfValor').value ? Number(document.getElementById('nfValor').value) : null, data_emissao: document.getElementById('nfEmissao').value || null, nota_url: document.getElementById('nfUrl').value.trim() || null };
    let finResult;
    if (state.selected.financeiro_id) finResult = await supabase.from('hospedagem_financeiro').update(finPayload).eq('id', state.selected.financeiro_id); else finResult = await supabase.from('hospedagem_financeiro').insert(finPayload).select('id').single();
    if (finResult.error) { setFeedback('finNfFeedback', finResult.error.message, 'err'); return; }
    let nfResult;
    if (state.selected.nota_id) nfResult = await supabase.from('hospedagem_notas').update(nfPayload).eq('id', state.selected.nota_id); else nfResult = await supabase.from('hospedagem_notas').insert(nfPayload).select('id').single();
    if (nfResult.error) { setFeedback('finNfFeedback', nfResult.error.message, 'err'); return; }
    if (nfPayload.status_nota === 'LANCADO' || nfPayload.status_nota === 'ENVIADO_PARA_LANCAMENTO') await supabase.from('hospedagem_solicitacoes').update({ status_solicitacao: 'CONCLUIDA' }).eq('id', state.selected.solicitacao_id);
    setFeedback('finNfFeedback', 'Financeiro/NF salvo com sucesso.', 'ok');
    await loadRows();
  }

  async function markAnalise() {
    if (!state.selected) return;
    await supabase.from('hospedagem_solicitacoes').update({ status_solicitacao: 'EM_ANALISE' }).eq('id', state.selected.solicitacao_id);
    setFeedback('resFeedback', 'Solicitação marcada em análise.', 'ok');
    await loadRows();
  }

  document.querySelectorAll('.adm-hosp-tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  document.getElementById('refreshPainel').addEventListener('click', loadRows);
  document.getElementById('applyFilters').addEventListener('click', renderSolicitacoes);
  document.getElementById('filterStatus').addEventListener('change', renderSolicitacoes);
  document.getElementById('filterSearch').addEventListener('input', renderSolicitacoes);
  document.getElementById('filterCheckout').addEventListener('change', renderSolicitacoes);
  document.getElementById('hotelSearch').addEventListener('input', renderHoteis);
  document.getElementById('hotelForm').addEventListener('submit', saveHotel);
  document.getElementById('hotelClear').addEventListener('click', resetHotelForm);
  document.getElementById('reservaForm').addEventListener('submit', saveReserva);
  document.getElementById('saveFinNf').addEventListener('click', saveFinNf);
  document.getElementById('markAnalise').addEventListener('click', markAnalise);
  document.getElementById('modalClose').addEventListener('click', closeModal);
  ['resDiaria','resQuartos','resCheckin','resCheckout'].forEach((id) => document.getElementById(id).addEventListener('input', updateReservaTotals));
  document.getElementById('resHotel').addEventListener('change', () => { const opt = document.getElementById('resHotel').selectedOptions[0]; if (opt?.dataset?.diaria) document.getElementById('resDiaria').value = opt.dataset.diaria; if (opt?.dataset?.nome) document.getElementById('resHotelNome').value = opt.dataset.nome; updateReservaTotals(); });
  document.getElementById('reservaModal').addEventListener('click', (ev) => { if (ev.target.id === 'reservaModal') closeModal(); });
  content.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-action]'); if (!btn) return;
    if (btn.dataset.action === 'open') { const row = state.rows.find((r) => r.solicitacao_id === btn.dataset.id); if (row) openModal(row); }
    if (btn.dataset.action === 'edit-hotel') { const h = state.hoteis.find((x) => x.id === btn.dataset.id); if (h) fillHotelForm(h); }
  });

  (async function boot(){ await loadHoteis(); await loadRows(); })();
});
