import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const LABELS = {
  CASA: 'Casa', APARTAMENTO: 'Apartamento', POUSADA: 'Pousada', ESCRITORIO: 'Escritório',
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
function toNumber(value) { const n = Number(String(value ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; }
function getHotelDiariaPorTipo(hotel, tipo = 'INDIVIDUAL') {
  if (!hotel) return 0;
  const keyByTipo = {
    INDIVIDUAL: 'valor_diaria_individual',
    DUPLO: 'valor_diaria_duplo',
    TRIPLO: 'valor_diaria_triplo',
    QUADRUPLO: 'valor_diaria_quadruplo'
  };
  const key = keyByTipo[String(tipo || 'INDIVIDUAL').toUpperCase()] || 'valor_diaria_individual';
  return toNumber(hotel[key] ?? hotel.valor_diaria_padrao ?? hotel.valor_diaria_individual);
}


function injectStyles() {
  if (document.getElementById('admHospStyles')) return;
  const style = document.createElement('style');
  style.id = 'admHospStyles';
  style.textContent = `
    .adm-hosp-tabs{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}.adm-hosp-tab{width:auto!important;margin-top:0!important;border:1px solid var(--line-2);background:#0b1220;color:var(--text);border-radius:999px;padding:10px 14px;cursor:pointer;font-weight:800}.adm-hosp-tab.active{background:rgba(22,101,52,.32);color:#dcfce7;border-color:rgba(111,208,165,.34)}.adm-hosp-panel{display:none}.adm-hosp-panel.active{display:block}.adm-hosp-btn{width:auto!important;margin-top:0!important}.adm-hosp-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px}.adm-hosp-table{width:100%;border-collapse:collapse;min-width:1180px;background:#0b1220}.adm-hosp-table th,.adm-hosp-table td{padding:12px 14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.adm-hosp-table th{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em}.adm-hosp-table tr:hover td{background:rgba(111,208,165,.035)}.adm-hosp-actions{display:flex;gap:8px;flex-wrap:wrap}.adm-hosp-small{padding:8px 10px!important;border-radius:12px!important;font-size:12px}.adm-hosp-status{display:inline-flex;align-items:center;padding:6px 9px;border-radius:999px;border:1px solid var(--line-2);background:rgba(255,255,255,.04);font-size:12px;font-weight:800;white-space:nowrap}.adm-hosp-status.solicitada,.adm-hosp-status.em_analise,.adm-hosp-status.em_cotacao,.adm-hosp-status.aguardando_pagamento,.adm-hosp-status.aguardando_nf{color:#fde68a;background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.24)}.adm-hosp-status.reservada,.adm-hosp-status.checkin_previsto,.adm-hosp-status.hospedado,.adm-hosp-status.enviado_ao_financeiro,.adm-hosp-status.nf_recebida{color:#bfdbfe;background:rgba(59,130,246,.11);border-color:rgba(59,130,246,.25)}.adm-hosp-status.concluida,.adm-hosp-status.pago,.adm-hosp-status.lancado,.adm-hosp-status.ativo,.adm-hosp-status.preferencial{color:#bbf7d0;background:rgba(22,101,52,.22);border-color:rgba(22,101,52,.34)}.adm-hosp-status.cancelada,.adm-hosp-status.bloqueado,.adm-hosp-status.evitar{color:#fecaca;background:rgba(220,38,38,.13);border-color:rgba(220,38,38,.24)}.adm-hosp-status.checkout_hoje,.adm-hosp-status.renovacao_necessaria{color:#fed7aa;background:rgba(249,115,22,.11);border-color:rgba(249,115,22,.24)}
    .adm-hosp-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.adm-hosp-field{display:flex;flex-direction:column;gap:7px}.adm-hosp-field.full{grid-column:1/-1}.adm-hosp-field label{font-size:13px;color:#cbd5e1;font-weight:800}.adm-hosp-field input,.adm-hosp-field textarea,.adm-hosp-field select{width:100%;border:1px solid #334155;background:#0b1220;color:var(--text);border-radius:14px;padding:12px 13px;outline:none;color-scheme:dark}.adm-hosp-field textarea{resize:vertical;min-height:76px}.adm-hosp-field input:focus,.adm-hosp-field textarea:focus,.adm-hosp-field select:focus{border-color:var(--green-2);box-shadow:0 0 0 3px rgba(111,208,165,.12)}.adm-hosp-form-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:16px}.adm-hosp-feedback{color:var(--muted);font-size:13px}.adm-hosp-danger{border-color:rgba(220,38,38,.32)!important;background:rgba(127,29,29,.45)!important;color:#fecaca!important}.adm-hosp-danger:hover{background:rgba(185,28,28,.55)!important;color:#fff!important}.adm-hosp-feedback.ok{color:#bbf7d0}.adm-hosp-feedback.err{color:#fecaca}.adm-hosp-modal{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(2,6,23,.75);backdrop-filter:blur(6px)}.adm-hosp-modal.open{display:flex}.adm-hosp-modal-card{width:min(980px,100%);max-height:92vh;overflow:auto;background:#081611;border:1px solid var(--line-2);border-radius:24px;box-shadow:var(--shadow);padding:20px}.adm-hosp-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:16px}.adm-hosp-modal-head h3{margin:0}.adm-hosp-muted{color:var(--muted);font-size:13px}.adm-hosp-filters{display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:12px;align-items:end;margin-bottom:14px}.adm-hosp-empty{padding:18px;text-align:center;color:var(--muted)}.adm-hosp-kpi-alert{color:#fecaca}.adm-hosp-kpi-warn{color:#fde68a}.adm-hosp-kpi-good{color:#bbf7d0}.adm-hosp-row-note{display:block;color:var(--muted);font-size:12px;margin-top:3px}.adm-hosp-colab-list{display:grid;gap:7px}.adm-hosp-colab-item{display:grid;gap:2px;line-height:1.15}.adm-hosp-colab-name{font-weight:800;color:var(--text)}.adm-hosp-colab-regional{font-size:12px;color:#9ca3af}.adm-hosp-card-line{display:grid;gap:8px}.adm-hosp-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px}.adm-hosp-status-tabs{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}.adm-hosp-status-tab{border:1px solid var(--line-2);background:#0b1220;color:#cbd5e1;border-radius:999px;padding:9px 13px;cursor:pointer;font-weight:900}.adm-hosp-status-tab.active{background:rgba(22,101,52,.35);border-color:rgba(111,208,165,.45);color:#dcfce7}.adm-hosp-status-tab small{margin-left:6px;color:#fde68a}.adm-hosp-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px}.adm-hosp-search{min-width:260px;border:1px solid #334155;background:#0b1220;color:var(--text);border-radius:14px;padding:12px 13px;color-scheme:dark}.adm-hosp-select-hint{margin-top:6px;font-size:12px;color:#93c5fd}.adm-hosp-select-hint.warn{color:#fde68a}.adm-room-wrap{grid-column:1/-1;border:1px solid var(--line);border-radius:18px;background:rgba(15,23,42,.34);padding:14px}.adm-room-title{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px}.adm-room-title strong{display:block;color:#e5e7eb}.adm-room-title span{display:block;color:#9ca3af;font-size:12px;margin-top:3px}.adm-room-chip{display:inline-flex;border:1px solid rgba(111,208,165,.22);background:rgba(22,101,52,.16);color:#dcfce7;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:900}.adm-room-add{display:grid;grid-template-columns:1fr 1fr .65fr .9fr auto;gap:10px;align-items:end;margin-top:12px}.adm-room-add .adm-room-mini{display:flex;flex-direction:column;gap:6px}.adm-room-add label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:900}.adm-room-add select,.adm-room-add input{border:1px solid #334155;background:#0b1220;color:var(--text);border-radius:12px;padding:10px 11px;outline:none;color-scheme:dark}.adm-room-list{display:grid;gap:8px;margin-top:12px}.adm-room-row{display:grid;grid-template-columns:1fr 1fr .65fr .9fr 1fr auto;gap:8px;align-items:center;border:1px solid rgba(148,163,184,.14);background:rgba(2,6,23,.34);border-radius:14px;padding:10px}.adm-room-row-pill{font-weight:900;color:#e5e7eb}.adm-room-row-type{color:#cbd5e1}.adm-room-row input{border:1px solid #334155;background:#0b1220;color:var(--text);border-radius:12px;padding:10px 11px;outline:none;color-scheme:dark}.adm-room-row-subtotal{font-weight:900;color:#bbf7d0}.adm-room-remove{border:1px solid rgba(220,38,38,.24);background:rgba(127,29,29,.36);color:#fecaca;border-radius:12px;padding:9px 11px;font-weight:900;cursor:pointer}.adm-room-empty{border:1px dashed rgba(148,163,184,.22);border-radius:14px;padding:12px;color:#94a3b8;font-size:12px}.adm-room-summary{margin-top:10px;color:#fde68a;font-size:12px;font-weight:800}.adm-occ-wrap{grid-column:1/-1;border:1px solid var(--line);border-radius:18px;background:rgba(15,23,42,.26);padding:14px}.adm-occ-title{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px}.adm-occ-title strong{display:block;color:#e5e7eb}.adm-occ-title span{display:block;color:#9ca3af;font-size:12px;margin-top:3px}.adm-occ-add{display:grid;grid-template-columns:1fr .8fr .8fr 1.4fr auto;gap:10px;align-items:end}.adm-occ-mini{display:flex;flex-direction:column;gap:6px}.adm-occ-add label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:900}.adm-occ-add select,.adm-occ-add input{border:1px solid #334155;background:#0b1220;color:var(--text);border-radius:12px;padding:10px 11px;outline:none;color-scheme:dark}.adm-occ-list{display:grid;gap:8px;margin-top:12px}.adm-occ-row{display:grid;grid-template-columns:1fr .8fr .8fr 1.5fr auto;gap:8px;align-items:center;border:1px solid rgba(148,163,184,.14);background:rgba(2,6,23,.34);border-radius:14px;padding:10px}.adm-occ-row strong{color:#e5e7eb}.adm-occ-row small{color:#94a3b8}.adm-occ-remove{border:1px solid rgba(220,38,38,.24);background:rgba(127,29,29,.36);color:#fecaca;border-radius:12px;padding:9px 11px;font-weight:900;cursor:pointer}.adm-occ-empty{border:1px dashed rgba(148,163,184,.22);border-radius:14px;padding:12px;color:#94a3b8;font-size:12px}.adm-process-tabs{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0 16px}.adm-process-tab{width:auto!important;border:1px solid var(--line-2);background:#0b1220;color:#cbd5e1;border-radius:999px;padding:9px 13px;font-weight:900;cursor:pointer}.adm-process-tab.active{background:rgba(22,101,52,.36);border-color:rgba(111,208,165,.42);color:#dcfce7}.adm-process-panel{display:none}.adm-process-panel.active{display:block}.adm-process-lock{border:1px solid rgba(245,158,11,.24);background:rgba(245,158,11,.09);color:#fde68a;border-radius:16px;padding:12px 14px;margin-bottom:14px;font-size:13px;font-weight:800}.adm-process-summary{display:grid;gap:7px;border:1px solid rgba(148,163,184,.18);background:rgba(2,6,23,.28);border-radius:16px;padding:13px;margin-bottom:14px}.adm-process-summary strong{color:#e5e7eb}.adm-process-summary span{color:#cbd5e1}.adm-hosp-field select[multiple]{min-height:112px}.adm-hosp-help{font-size:12px;color:#94a3b8;margin-top:4px}.adm-hosp-action-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.adm-hosp-action-grid .btn{width:100%!important}.adm-reserva-dates-row{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.adm-hidden-soft{display:none!important}.adm-extra-list{display:grid;gap:8px;margin-top:8px}.adm-extra-row{display:grid;grid-template-columns:1fr .45fr auto;gap:8px;align-items:end}.adm-extra-row input{border:1px solid #334155;background:#0b1220;color:var(--text);border-radius:12px;padding:10px 11px;color-scheme:dark}.adm-payment-summary{border:1px solid rgba(111,208,165,.22);background:rgba(22,101,52,.11);border-radius:18px;padding:14px;margin-top:14px}.adm-payment-summary h4{margin:0 0 8px;color:#dcfce7}.adm-payment-summary-line{display:grid;grid-template-columns:170px 1fr;gap:8px;color:#e5e7eb;font-size:13px}.adm-payment-files{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}.adm-menu-mode-hoteis [data-tab="alojamentos"],.adm-menu-mode-alojamentos [data-tab="painel"],.adm-menu-mode-alojamentos [data-tab="solicitacoes"],.adm-menu-mode-alojamentos [data-tab="hoteis"]{display:none!important}@media(max-width:900px){.adm-hosp-action-grid{grid-template-columns:1fr}}.adm-hidden{display:none!important}@media(max-width:900px){.adm-room-add,.adm-room-row,.adm-occ-add,.adm-occ-row{grid-template-columns:1fr}.adm-room-row-subtotal{font-size:14px}}
    @media(max-width:900px){.adm-hosp-form,.adm-hosp-filters{grid-template-columns:1fr}.adm-hosp-search{min-width:0;width:100%}}
  `;
  document.head.appendChild(style);
}

initProtectedPage('Módulo Hospedagem', (content, userContext) => {
  injectStyles();
  const state = { rows: [], resumo: {}, hoteis: [], alojamentos: [], editingHotel: null, editingAlojamento: null, tab: 'painel', selected: null, painelStatus: 'reservados' };
  function getHotelById(id) { return state.hoteis.find((h) => String(h.id) === String(id)); }

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
      <button class="adm-hosp-tab" data-tab="alojamentos" type="button">Alojamentos</button>
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
        <div class="section-head"><div><h3>Fila operacional</h3><p class="muted">Gerencie por etapa: reservas ativas, check-outs, pendências e pagamentos concluídos.</p></div><button class="btn btn-secondary adm-hosp-btn" id="refreshPainel" type="button">Atualizar</button></div>
        <div class="adm-hosp-status-tabs" id="painelStatusTabs">
          <button class="adm-hosp-status-tab active" type="button" data-painel-status="reservados">Reservados <small id="countReservados">0</small></button>
          <button class="adm-hosp-status-tab" type="button" data-painel-status="checkout">Check-out <small id="countCheckout">0</small></button>
          <button class="adm-hosp-status-tab" type="button" data-painel-status="pendentes">Pendentes <small id="countPendentes">0</small></button>
          <button class="adm-hosp-status-tab" type="button" data-painel-status="pagos">Pagos <small id="countPagos">0</small></button>
        </div>
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
          <div class="adm-hosp-field"><label>Diária individual</label><input id="hotelDiariaIndividual" type="number" step="0.01" min="0" /></div>
          <div class="adm-hosp-field"><label>Diária duplo</label><input id="hotelDiariaDuplo" type="number" step="0.01" min="0" /></div>
          <div class="adm-hosp-field"><label>Diária triplo</label><input id="hotelDiariaTriplo" type="number" step="0.01" min="0" /></div>
          <div class="adm-hosp-field"><label>Diária quádruplo</label><input id="hotelDiariaQuadruplo" type="number" step="0.01" min="0" /></div>
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
      <article class="card mt-16"><div class="adm-hosp-table-wrap"><table class="adm-hosp-table"><thead><tr><th>Hotel</th><th>Cidade</th><th>Diárias</th><th>Contato</th><th>Status</th><th>Prioridade</th><th>Ações</th></tr></thead><tbody id="hotelTbody"><tr><td colspan="7" class="adm-hosp-empty">Carregando...</td></tr></tbody></table></div></article>
    </section>


    <section id="tab-alojamentos" class="adm-hosp-panel">
      <article class="card">
        <div class="adm-hosp-toolbar">
          <div><h3>Cadastro de alojamentos</h3><p class="muted">Base de casas, apartamentos, pousadas e escritórios para sugerir na programação quando o gestor selecionar ALOJAMENTO.</p></div>
          <input id="alojSearch" class="adm-hosp-search" placeholder="Buscar alojamento, cidade, responsável..." />
        </div>
        <form id="alojForm" class="adm-hosp-form">
          <div class="adm-hosp-field"><label>Nome do alojamento *</label><input id="alojNome" required placeholder="Ex.: MT - Confresa" /></div>
          <div class="adm-hosp-field"><label>Tipo</label><select id="alojTipo"><option value="CASA">Casa</option><option value="APARTAMENTO">Apartamento</option><option value="POUSADA">Pousada</option><option value="ESCRITORIO">Escritório</option><option value="OUTRO">Outro</option></select></div>
          <div class="adm-hosp-field"><label>Cidade *</label><input id="alojCidade" required /></div>
          <div class="adm-hosp-field"><label>UF *</label><input id="alojUf" required maxlength="2" /></div>
          <div class="adm-hosp-field full"><label>Endereço</label><input id="alojEndereco" /></div>
          <div class="adm-hosp-field"><label>Capacidade</label><input id="alojCapacidade" type="number" min="0" step="1" /></div>
          <div class="adm-hosp-field"><label>Quartos</label><input id="alojQuartos" type="number" min="0" step="1" /></div>
          <div class="adm-hosp-field"><label>Responsável</label><input id="alojResponsavel" /></div>
          <div class="adm-hosp-field"><label>Contato</label><input id="alojContato" /></div>
          <div class="adm-hosp-field"><label>Status</label><select id="alojStatus"><option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option><option value="BLOQUEADO">Bloqueado</option></select></div>
          <div class="adm-hosp-field"><label>Prioridade</label><select id="alojPrioridade"><option value="NORMAL">Normal</option><option value="PREFERENCIAL">Preferencial</option><option value="EVITAR">Evitar</option></select></div>
          <div class="adm-hosp-field"><label>Aluguel mensal</label><input id="alojAluguel" type="number" min="0" step="0.01" /></div>
          <div class="adm-hosp-field"><label>Água</label><input id="alojAgua" placeholder="Conta, status ou valor" /></div>
          <div class="adm-hosp-field"><label>Energia</label><input id="alojEnergia" placeholder="Conta, status ou valor" /></div>
          <div class="adm-hosp-field"><label>Internet</label><input id="alojInternet" placeholder="Conta, status ou valor" /></div>
          <div class="adm-hosp-field"><label>Empresa internet</label><input id="alojEmpresaNet" /></div>
          <div class="adm-hosp-field"><label>Vencimento aluguel</label><input id="alojVencAluguel" type="number" min="1" max="31" /></div>
          <div class="adm-hosp-field"><label>Vencimento água</label><input id="alojVencAgua" type="number" min="1" max="31" /></div>
          <div class="adm-hosp-field"><label>Vencimento energia</label><input id="alojVencEnergia" type="number" min="1" max="31" /></div>
          <div class="adm-hosp-field"><label>Vencimento internet</label><input id="alojVencInternet" type="number" min="1" max="31" /></div>
          <div class="adm-hosp-field full"><label>Anexo comprovante/fatura</label><input id="alojAnexo" placeholder="Cole o link do Drive/Supabase Storage da fatura ou comprovante" /></div>
          <div class="adm-hosp-field full"><label>Descrição da fatura</label><textarea id="alojDescricaoFatura" placeholder="Ex.: aluguel janeiro/26 lançado; energia solicitada; internet isenta..."></textarea></div>
          <div class="adm-hosp-field full"><label>Observações</label><textarea id="alojObs"></textarea></div>
        </form>
        <div class="adm-hosp-form-actions"><button class="btn btn-primary adm-hosp-btn" type="submit" form="alojForm" id="alojSave">Salvar alojamento</button><button class="btn btn-secondary adm-hosp-btn" type="button" id="alojClear">Limpar</button><span id="alojFeedback" class="adm-hosp-feedback"></span></div>
      </article>
      <article class="card mt-16"><div class="adm-hosp-table-wrap"><table class="adm-hosp-table"><thead><tr><th>Alojamento</th><th>Cidade</th><th>Estrutura</th><th>Despesas</th><th>Fatura</th><th>Status</th><th>Ações</th></tr></thead><tbody id="alojTbody"><tr><td colspan="7" class="adm-hosp-empty">Carregando...</td></tr></tbody></table></div></article>
    </section>

    <div id="reservaModal" class="adm-hosp-modal">
      <div class="adm-hosp-modal-card">
        <div class="adm-hosp-modal-head"><div><h3 id="modalTitle">Reserva</h3><p class="muted" id="modalSub">Fluxo por etapa: configurar, estender, checkout e financeiro/NF.</p></div><button class="btn btn-secondary adm-hosp-btn" type="button" id="modalClose">Fechar</button></div>
        <div class="adm-process-tabs" id="hospProcessTabs">
          <button class="adm-process-tab active" type="button" data-process="config">Configurar Reserva</button>
          <button class="adm-process-tab" type="button" data-process="incluir">Incluir</button>
          <button class="adm-process-tab" type="button" data-process="extend">Estender</button>
          <button class="adm-process-tab" type="button" data-process="checkout">Checkout</button>
          <button class="adm-process-tab" type="button" data-process="finance">Financeiro/NF</button>
        </div>
        <div id="hospLockNotice" class="adm-process-lock adm-hidden">Check-in já realizado. A reserva fica bloqueada para edição direta; use as etapas de estender reserva, solicitar checkout ou financeiro/NF.</div>

        <section class="adm-process-panel active" data-process-panel="config" id="reservaConfigPanel">
          <div id="reservaResumoBloqueada" class="adm-process-summary adm-hidden"></div>
          <form id="reservaForm" class="adm-hosp-form">
            <div class="adm-hosp-field full"><label>Solicitação</label><input id="resInfo" readonly /></div>
            <div class="adm-hosp-field"><label>Hotel recomendado *</label><select id="resHotel"></select><span id="resHotelHint" class="adm-hosp-select-hint"></span></div>
            <div class="adm-hosp-field"><label>Nome do hotel manual</label><input id="resHotelNome" placeholder="Use caso ainda não esteja cadastrado" /></div>
            <div class="adm-reserva-dates-row">
              <div class="adm-hosp-field"><label>Check-in *</label><input id="resCheckin" type="date" required /></div>
              <div class="adm-hosp-field"><label>Check-out *</label><input id="resCheckout" type="date" required /></div>
              <div class="adm-hosp-field"><label>Diárias</label><input id="resDiarias" readonly /></div>
            </div>
            <div class="adm-hosp-field adm-hidden-soft"><label>Total previsto</label><input id="resTotal" readonly /></div>
            <div class="adm-room-wrap">
              <div class="adm-room-title"><div><strong>Configuração dos quartos, valor e hóspedes</strong><span>Informe o quarto, o tipo, o valor da diária e depois vincule os hóspedes em cada quarto. Ex.: Fulano e Ciclano no Quarto 1 duplo; Fulana no Quarto 2 individual.</span></div><span class="adm-room-chip">Separado por gênero</span></div>
              <div class="adm-room-add">
                <div class="adm-room-mini"><label>Gênero</label><select id="roomGenero"><option value="FEMININO">Feminino</option><option value="MASCULINO">Masculino</option></select></div>
                <div class="adm-room-mini"><label>Tipo de quarto</label><select id="roomTipo"><option value="INDIVIDUAL">Individual</option><option value="DUPLO">Duplo</option><option value="TRIPLO">Triplo</option><option value="QUADRUPLO">Quádruplo</option></select></div>
                <div class="adm-room-mini"><label>Qtd.</label><input id="roomQtd" type="number" min="1" step="1" value="1" /></div>
                <div class="adm-room-mini"><label>Diária</label><input id="roomDiaria" type="number" min="0" step="0.01" value="0" /></div>
                <button class="btn btn-secondary adm-hosp-btn" type="button" id="roomAdd">Adicionar</button>
              </div>
              <div class="adm-room-list" id="roomList"><div class="adm-room-empty">Nenhum quarto adicionado.</div></div>
              <div class="adm-room-summary" id="roomSummary">Adicione a composição dos quartos.</div>
            </div>
            <div class="adm-occ-wrap adm-hidden-soft">
              <div class="adm-occ-title"><div><strong>Hóspedes por quarto</strong><span>Removido da configuração: a entrada mantém os mesmos hóspedes da solicitação.</span></div><span class="adm-room-chip">Ocupação</span></div>
              <div class="adm-occ-add">
                <div class="adm-occ-mini"><label>Quarto</label><select id="occQuarto"><option value="">Adicione um quarto acima</option></select></div>
                <div class="adm-occ-mini"><label>Check-in</label><input id="occInicio" type="date" /></div>
                <div class="adm-occ-mini"><label>Check-out</label><input id="occFim" type="date" /></div>
                <div class="adm-occ-mini"><label>Hóspedes</label><input id="occOcupantes" list="occColabList" placeholder="Ex.: ADEMIR, ALEXSANDRO" /><datalist id="occColabList"></datalist></div>
                <button class="btn btn-secondary adm-hosp-btn" type="button" id="occAdd">Adicionar hóspedes</button>
              </div>
              <div class="adm-occ-list" id="occList"><div class="adm-occ-empty">Nenhum hóspede vinculado ao quarto.</div></div>
              <span id="occFeedback" class="adm-hosp-feedback"></span>
            </div>
            <input id="resDiaria" class="adm-hidden" type="number" step="0.01" min="0" />
            <input id="resQuartos" class="adm-hidden" type="number" min="1" value="1" />
            <select id="resTipo" class="adm-hidden"><option value="OUTRO">Outro</option><option value="INDIVIDUAL">Individual</option><option value="DUPLO">Duplo</option><option value="TRIPLO">Triplo</option><option value="QUADRUPLO">Quádruplo</option></select>
            <div class="adm-hosp-field"><label>Confirmado com</label><input id="resConfirmado" /></div>
            <div class="adm-hosp-field"><label>Contato confirmação</label><input id="resContato" /></div>
            <div class="adm-hosp-field adm-hidden-soft"><label>Status hospedagem</label><select id="resStatus"><option value="CHECKIN_PREVISTO">Reservado</option><option value="CANCELADA">Cancelada</option></select></div>
            <div class="adm-hosp-field full"><label>Observação hospedagem</label><textarea id="resObs"></textarea></div>
          </form>
          <div class="adm-hosp-form-actions" id="reservaConfigActions"><button class="btn btn-primary adm-hosp-btn" type="submit" form="reservaForm" id="resSave">Salvar reserva</button><button class="btn btn-secondary adm-hosp-btn" type="button" id="markAnalise">Marcar em análise</button><button class="btn btn-secondary adm-hosp-btn adm-hosp-danger" type="button" id="recusarSolicitacao">Recusar solicitação</button><span id="resFeedback" class="adm-hosp-feedback"></span></div>
        </section>

        <section class="adm-process-panel" data-process-panel="incluir" id="incluirPanel">
          <div class="card" style="box-shadow:none;">
            <h3>Incluir solicitação na mesma hospedagem</h3>
            <p class="muted">Agrupe outra solicitação no mesmo hotel usando o mesmo período/base da reserva atual.</p>
            <div class="adm-hosp-form">
              <div class="adm-hosp-field full"><label>Solicitação para incluir</label><select id="incSolicitacao"><option value="">Selecione uma solicitação aberta</option></select><span class="adm-hosp-help">A lista prioriza solicitações ainda sem reserva. Depois de incluir, o status muda para RESERVADO.</span></div>
              <div class="adm-hosp-field full"><label>Observação</label><textarea id="incObs" placeholder="Ex.: agrupada no mesmo hotel/quarto da reserva principal."></textarea></div>
            </div>
            <div class="adm-hosp-form-actions"><button class="btn btn-primary adm-hosp-btn" type="button" id="btnIncluirReserva">Incluir na reserva</button><span id="incFeedback" class="adm-hosp-feedback"></span></div>
          </div>
        </section>

        <section class="adm-process-panel" data-process-panel="extend" id="extensaoPanel">
          <div class="card" style="box-shadow:none;">
            <h3>Estender reserva</h3>
            <p class="muted">Use quando parte da equipe continua no hotel ou quando a diária precisa ser renovada.</p>
            <div class="adm-hosp-form">
              <div class="adm-hosp-field"><label>Check-out atual</label><input id="extCheckoutAtual" readonly /></div>
              <div class="adm-hosp-field"><label>Novo check-out *</label><input id="extNovoCheckout" type="date" /></div>
              <div class="adm-hosp-field full"><label>Quem fica no hotel</label><select id="extHospedesFicam" multiple></select><span class="adm-hosp-help">Segure Ctrl para selecionar mais de um colaborador.</span></div>
              <div class="adm-hosp-field full"><label>Observação da extensão</label><textarea id="extObs" placeholder="Ex.: ADEMIR e ALEXSANDRO permanecem no quarto 1 até a nova data."></textarea></div>
            </div>
            <div class="adm-hosp-form-actions"><button class="btn btn-primary adm-hosp-btn" type="button" id="btnEstenderReserva">Salvar extensão</button><span id="extFeedback" class="adm-hosp-feedback"></span></div>
          </div>
        </section>

        <section class="adm-process-panel" data-process-panel="checkout" id="checkoutPanel">
          <div class="card" style="box-shadow:none;">
            <h3>Checkout</h3>
            <p class="muted">Fechamento da hospedagem com valor automático de diárias, extras, pagamento ou envio ao financeiro.</p>
            <div class="adm-hosp-form">
              <div class="adm-hosp-field"><label>Data checkout *</label><input id="chkData" type="date" /></div>
              <div class="adm-hosp-field"><label>Valor diárias</label><input id="chkValorDiarias" type="number" step="0.01" min="0" readonly /></div>
              <div class="adm-hosp-field full"><label>Colaboradores que farão check-out</label><select id="chkHospedesSaem" multiple></select></div>
              <div class="adm-hosp-field full adm-hidden-soft"><label>Quem fica no hotel</label><select id="chkHospedesFicam" multiple></select></div>
              <div class="adm-hosp-field full"><label>Extras</label><div id="chkExtrasList" class="adm-extra-list"></div><button class="btn btn-secondary adm-hosp-btn" type="button" id="btnAddExtra">+ Adicionar extra</button></div>
              <div class="adm-hosp-field full"><label>Observação do checkout</label><textarea id="chkObs" placeholder="Ex.: consumo frigobar, taxa adicional, saída parcial..."></textarea></div>
            </div>
            <div class="adm-hosp-form-actions"><button class="btn btn-primary adm-hosp-btn" type="button" id="btnCheckoutPagar">Pagar</button><button class="btn btn-secondary adm-hosp-btn" type="button" id="btnCheckoutFinanceiro">Enviar pro financeiro</button><button class="btn btn-secondary adm-hosp-btn" type="button" id="btnSolicitarCheckout">Salvar checkout</button><span id="chkFeedback" class="adm-hosp-feedback"></span></div>
            <div id="payConfirmBox" class="adm-payment-summary adm-hidden-soft">
              <h4>Resumo da hospedagem</h4>
              <div id="payResumo"></div>
              <div class="adm-hosp-form-actions"><button class="btn btn-primary adm-hosp-btn" type="button" id="btnPayOk">OK</button><button class="btn btn-secondary adm-hosp-btn" type="button" id="btnPayRevisar">REVISAR</button></div>
              <div id="payFilesBox" class="adm-hidden-soft">
                <div class="adm-payment-files">
                  <div class="adm-hosp-field"><label>Comprovante</label><input id="payCompFile" type="file" /><input id="payCompUrl" placeholder="ou cole o link do comprovante" /></div>
                  <div class="adm-hosp-field"><label>Nota Fiscal</label><input id="payNfFile" type="file" /><input id="payNfUrl" placeholder="ou cole o link da NF" /></div>
                </div>
                <div class="adm-hosp-form-actions"><button class="btn btn-primary adm-hosp-btn" type="button" id="btnSalvarPagamentoLocal">Salvar pagamento</button><span id="payFeedback" class="adm-hosp-feedback"></span></div>
              </div>
            </div>
          </div>
        </section>

        <section class="adm-process-panel" data-process-panel="finance" id="financePanel">
          <div class="card" style="box-shadow:none;">
            <h3>Checkout, financeiro e NF</h3>
            <p class="muted">Após checkout, envie para o financeiro e anexe comprovante/NF por link.</p>
            <div class="adm-hosp-form">
              <div class="adm-hosp-field"><label>Status financeiro</label><select id="finStatus"><option value="NAO_INICIADO">Não iniciado</option><option value="AGUARDANDO_PAGAMENTO">Aguardando pagamento</option><option value="ENVIADO_AO_FINANCEIRO">Enviado ao financeiro</option><option value="PAGO">Pago</option><option value="SEM_COBRANCA">Sem cobrança</option><option value="CANCELADO">Cancelado</option></select></div>
              <div class="adm-hosp-field"><label>Valor total</label><input id="finValor" type="number" step="0.01" min="0" /></div>
              <div class="adm-hosp-field"><label>Data vencimento</label><input id="finVenc" type="date" /></div>
              <div class="adm-hosp-field"><label>Data pagamento</label><input id="finPag" type="date" /></div>
              <div class="adm-hosp-field full"><label>Anexar comprovante</label><input id="finComp" placeholder="Cole o link do comprovante" /></div>
              <div class="adm-hosp-field"><label>Status NF</label><select id="nfStatus"><option value="NAO_SOLICITADA">Não solicitada</option><option value="AGUARDANDO_NF">Aguardando NF</option><option value="NF_RECEBIDA">NF recebida</option><option value="ENVIADO_PARA_LANCAMENTO">Enviado para lançamento</option><option value="LANCADO">Lançado</option><option value="DISPENSADO">Dispensado</option><option value="CANCELADO">Cancelado</option></select></div>
              <div class="adm-hosp-field"><label>Número NF</label><input id="nfNumero" /></div>
              <div class="adm-hosp-field"><label>Valor NF</label><input id="nfValor" type="number" step="0.01" min="0" /></div>
              <div class="adm-hosp-field"><label>Data emissão</label><input id="nfEmissao" type="date" /></div>
              <div class="adm-hosp-field full"><label>Anexar NF</label><input id="nfUrl" placeholder="Cole o link da nota fiscal" /></div>
            </div>
            <div class="adm-hosp-form-actions adm-hosp-action-grid"><button class="btn btn-primary adm-hosp-btn" type="button" id="sendToFinanceiro">Enviar pro financeiro</button><button class="btn btn-secondary adm-hosp-btn" type="button" id="btnAnexarComprovante">Anexar comprovante</button><button class="btn btn-secondary adm-hosp-btn" type="button" id="btnAnexarNf">Anexar NF</button><button class="btn btn-secondary adm-hosp-btn" type="button" id="saveFinNf">Salvar financeiro/NF</button></div>
            <div class="adm-hosp-form-actions"><span id="finNfFeedback" class="adm-hosp-feedback"></span></div>
          </div>
        </section>      </div>
    </div>
  `;

  function setFeedback(id, msg, type = '') { const el = document.getElementById(id); if (!el) return; el.textContent = msg || ''; el.className = `adm-hosp-feedback ${type}`.trim(); }
  function statusPill(value) { return `<span class="adm-hosp-status ${esc(slug(value))}">${esc(label(value))}</span>`; }

  function splitColaboradores(value) {
    return String(value || '')
      .split(/[\n\r,;]+/)
      .map((nome) => nome.trim())
      .filter(Boolean);
  }

  function getRegionalColaborador(colab, fallback = '') {
    return colab?.supervisao || colab?.regional || colab?.supervisao_colaborador || colab?.regional_colaborador || fallback || '-';
  }

  function getColaboradoresDetalhados(row) {
    if (Array.isArray(row?._colaboradoresDetalhados) && row._colaboradoresDetalhados.length) return row._colaboradoresDetalhados;
    return splitColaboradores(row?.colaboradores).map((nome) => ({ nome_colaborador: nome, supervisao: row?.supervisao_colaborador || row?.regional_colaborador || '' }));
  }

  function renderColaboradoresCell(row) {
    const colaboradores = getColaboradoresDetalhados(row);
    if (!colaboradores.length) return '-';
    return `<div class="adm-hosp-colab-list">${colaboradores.map((colab) => {
      const nome = colab.nome_colaborador || colab.nome || '-';
      const regional = getRegionalColaborador(colab);
      return `<div class="adm-hosp-colab-item"><span class="adm-hosp-colab-name">${esc(nome)}</span><span class="adm-hosp-colab-regional">${esc(regional)}</span></div>`;
    }).join('')}</div>`;
  }


  const ROOM_KEYS = [
    { key: 'FEMININO_INDIVIDUAL', grupo: 'Feminino', tipo: 'INDIVIDUAL', label: 'Feminino individual' },
    { key: 'FEMININO_DUPLO', grupo: 'Feminino', tipo: 'DUPLO', label: 'Feminino duplo' },
    { key: 'FEMININO_TRIPLO', grupo: 'Feminino', tipo: 'TRIPLO', label: 'Feminino triplo' },
    { key: 'FEMININO_QUADRUPLO', grupo: 'Feminino', tipo: 'QUADRUPLO', label: 'Feminino quádruplo' },
    { key: 'MASCULINO_INDIVIDUAL', grupo: 'Masculino', tipo: 'INDIVIDUAL', label: 'Masculino individual' },
    { key: 'MASCULINO_DUPLO', grupo: 'Masculino', tipo: 'DUPLO', label: 'Masculino duplo' },
    { key: 'MASCULINO_TRIPLO', grupo: 'Masculino', tipo: 'TRIPLO', label: 'Masculino triplo' },
    { key: 'MASCULINO_QUADRUPLO', grupo: 'Masculino', tipo: 'QUADRUPLO', label: 'Masculino quádruplo' }
  ];

  function emptyComposicaoQuartos() {
    return ROOM_KEYS.reduce((acc, item) => {
      acc[item.key] = { qtd: 0, diaria: 0 };
      return acc;
    }, {});
  }

  function getRoomKey(grupo, tipo) {
    return `${String(grupo || '').toUpperCase()}_${String(tipo || '').toUpperCase()}`;
  }

  function getRoomMeta(key) {
    return ROOM_KEYS.find((item) => item.key === key) || null;
  }

  function getComposicaoFromForm() {
    const comp = emptyComposicaoQuartos();
    document.querySelectorAll('#roomList [data-room-row]').forEach((row) => {
      const key = row.dataset.roomKey;
      if (!comp[key]) return;
      comp[key] = {
        qtd: Math.max(0, Math.floor(Number(row.querySelector('[data-room-qtd]')?.value || 0))),
        diaria: Math.max(0, Number(row.querySelector('[data-room-diaria]')?.value || 0))
      };
    });
    return comp;
  }

  function renderRoomRow(item, value = {}) {
    const qtd = Math.max(0, Math.floor(Number(value.qtd || 0)));
    const diaria = Math.max(0, Number(value.diaria || 0));
    return `
      <div class="adm-room-row" data-room-row data-room-key="${esc(item.key)}">
        <div class="adm-room-row-pill">${esc(item.grupo)}</div>
        <div class="adm-room-row-type">${esc(item.tipo.charAt(0) + item.tipo.slice(1).toLowerCase())}</div>
        <input type="number" min="1" step="1" value="${qtd || 1}" data-room-qtd aria-label="Quantidade" />
        <input type="number" min="0" step="0.01" value="${diaria}" data-room-diaria aria-label="Diária" />
        <div class="adm-room-row-subtotal">${money(qtd * diaria)}</div>
        <button class="adm-room-remove" type="button" data-room-remove title="Remover quarto">Remover</button>
      </div>`;
  }

  function setComposicaoForm(comp = {}) {
    const normalized = { ...emptyComposicaoQuartos(), ...(comp || {}) };
    const list = document.getElementById('roomList');
    if (!list) return;
    const rows = ROOM_KEYS
      .filter((item) => Number(normalized[item.key]?.qtd || 0) > 0 || Number(normalized[item.key]?.diaria || 0) > 0)
      .map((item) => renderRoomRow(item, normalized[item.key]));
    list.innerHTML = rows.length ? rows.join('') : '<div class="adm-room-empty">Nenhum quarto adicionado.</div>';
  }

  function atualizarDiariaSugeridaQuarto() {
    const hotel = getHotelById(document.getElementById('resHotel')?.value);
    const tipo = document.getElementById('roomTipo')?.value || 'INDIVIDUAL';
    const diariaEl = document.getElementById('roomDiaria');
    if (!hotel || !diariaEl) return;
    const diaria = getHotelDiariaPorTipo(hotel, tipo);
    if (diaria && !Number(diariaEl.value || 0)) diariaEl.value = diaria;
  }

  function addRoomFromDraft() {
    const grupo = document.getElementById('roomGenero')?.value || 'FEMININO';
    const tipo = document.getElementById('roomTipo')?.value || 'INDIVIDUAL';
    const key = getRoomKey(grupo, tipo);
    const item = getRoomMeta(key);
    if (!item) return;
    const qtd = Math.max(1, Math.floor(Number(document.getElementById('roomQtd')?.value || 1)));
    const diaria = Math.max(0, Number(document.getElementById('roomDiaria')?.value || 0));
    const list = document.getElementById('roomList');
    if (!list) return;
    const empty = list.querySelector('.adm-room-empty');
    if (empty) empty.remove();
    const existing = list.querySelector(`[data-room-key="${key}"]`);
    if (existing) {
      const qtdEl = existing.querySelector('[data-room-qtd]');
      const diariaEl = existing.querySelector('[data-room-diaria]');
      if (qtdEl) qtdEl.value = Math.max(1, Math.floor(Number(qtdEl.value || 0))) + qtd;
      if (diariaEl) diariaEl.value = diaria || Number(diariaEl.value || 0);
    } else {
      list.insertAdjacentHTML('beforeend', renderRoomRow(item, { qtd, diaria }));
    }
    document.getElementById('roomQtd').value = 1;
    updateReservaTotals();
  }

  function calcularComposicao(comp = getComposicaoFromForm()) {
    return ROOM_KEYS.reduce((acc, item) => {
      const qtd = Number(comp[item.key]?.qtd || 0);
      const diaria = Number(comp[item.key]?.diaria || 0);
      acc.quartos += qtd;
      acc.totalDia += qtd * diaria;
      if (qtd > 0) acc.itens.push({ ...item, qtd, diaria, subtotal: qtd * diaria });
      return acc;
    }, { quartos: 0, totalDia: 0, itens: [] });
  }

  function formatComposicaoResumo(comp = getComposicaoFromForm()) {
    const calc = calcularComposicao(comp);
    if (!calc.itens.length) return '';
    return calc.itens.map((item) => `${item.qtd} ${item.label} (${money(item.diaria)}/dia)`).join(' + ');
  }

  function aplicarDiariasHotelNaComposicao(hotel, substituir = false) {
    if (!hotel) return;
    document.querySelectorAll('#roomList [data-room-row]').forEach((row) => {
      const item = getRoomMeta(row.dataset.roomKey);
      const diariaEl = row.querySelector('[data-room-diaria]');
      if (!item || !diariaEl) return;
      const diaria = getHotelDiariaPorTipo(hotel, item.tipo);
      if (diaria && (substituir || !Number(diariaEl.value || 0))) diariaEl.value = diaria;
    });
    const tipoAtual = document.getElementById('roomTipo')?.value || 'INDIVIDUAL';
    const diariaDraft = getHotelDiariaPorTipo(hotel, tipoAtual);
    const draftEl = document.getElementById('roomDiaria');
    if (draftEl && diariaDraft && (substituir || !Number(draftEl.value || 0))) draftEl.value = diariaDraft;
    updateReservaTotals();
  }

  function extrairComposicaoObservacao(value) {
    const text = String(value || '');
    const match = text.match(/\[COMPOSICAO_QUARTOS\]([\s\S]*?)\[\/COMPOSICAO_QUARTOS\]/);
    if (!match) return { observacao: text, composicao: null };
    try {
      return {
        observacao: text.replace(match[0], '').replace(/^Composição dos quartos:.*$/gmi, '').trim(),
        composicao: { ...emptyComposicaoQuartos(), ...JSON.parse(match[1]) }
      };
    } catch (err) {
      return { observacao: text.replace(match[0], '').replace(/^Composição dos quartos:.*$/gmi, '').trim(), composicao: null };
    }
  }

  function extrairOcupacaoObservacao(value) {
    const text = String(value || '');
    const match = text.match(/\[OCUPACAO_QUARTOS\]([\s\S]*?)\[\/OCUPACAO_QUARTOS\]/);
    if (!match) return { observacao: text, ocupacao: [] };
    try {
      const parsed = JSON.parse(match[1]);
      return {
        observacao: text.replace(match[0], '').replace(/^Ocupação por período:.*$/gmi, '').trim(),
        ocupacao: Array.isArray(parsed) ? parsed : []
      };
    } catch (err) {
      return { observacao: text.replace(match[0], '').replace(/^Ocupação por período:.*$/gmi, '').trim(), ocupacao: [] };
    }
  }

  function montarObservacaoComComposicao(observacao, comp, ocupacao = []) {
    const resumo = formatComposicaoResumo(comp);
    const ocupacaoLimpa = Array.isArray(ocupacao) ? ocupacao.filter((item) => item && (item.quarto || item.inicio || item.fim || item.ocupantes)) : [];
    const blocoComposicao = `[COMPOSICAO_QUARTOS]${JSON.stringify(comp)}[/COMPOSICAO_QUARTOS]`;
    const blocoOcupacao = ocupacaoLimpa.length ? `[OCUPACAO_QUARTOS]${JSON.stringify(ocupacaoLimpa)}[/OCUPACAO_QUARTOS]` : '';
    const resumoOcupacao = ocupacaoLimpa.length
      ? `Ocupação por período: ${ocupacaoLimpa.map((item) => `${item.quarto_label || item.quarto || 'Quarto'} · ${brDate(item.inicio)} até ${brDate(item.fim)} · ${item.ocupantes || '-'}`).join(' | ')}`
      : '';
    return [String(observacao || '').trim(), resumo ? `Composição dos quartos: ${resumo}` : '', resumoOcupacao, blocoComposicao, blocoOcupacao].filter(Boolean).join('\n');
  }

  function getQuartosDaComposicao() {
    const comp = getComposicaoFromForm();
    const quartos = [];
    ROOM_KEYS.forEach((item) => {
      const qtd = Math.max(0, Math.floor(Number(comp[item.key]?.qtd || 0)));
      for (let i = 1; i <= qtd; i += 1) {
        quartos.push({
          value: `${item.key}__${i}`,
          label: `${item.label} #${i}`
        });
      }
    });
    return quartos;
  }

  function refreshOcupacaoQuartoSelect() {
    const select = document.getElementById('occQuarto');
    if (!select) return;
    const atual = select.value;
    const quartos = getQuartosDaComposicao();
    select.innerHTML = quartos.length
      ? `<option value="">Selecionar quarto</option>${quartos.map((q) => `<option value="${esc(q.value)}">${esc(q.label)}</option>`).join('')}`
      : '<option value="">Adicione um quarto acima</option>';
    if (atual && quartos.some((q) => q.value === atual)) select.value = atual;
  }

  function fillOcupantesDatalist(row = state.selected) {
    const list = document.getElementById('occColabList');
    if (!list) return;
    const nomes = getColaboradoresDetalhados(row).map((c) => c.nome_colaborador || c.nome).filter(Boolean);
    list.innerHTML = [...new Set(nomes)].map((nome) => `<option value="${esc(nome)}"></option>`).join('');
  }

  function getQuartoLabel(value) {
    const quartos = getQuartosDaComposicao();
    return quartos.find((q) => q.value === value)?.label || value || 'Quarto';
  }

  function renderOcupacaoRow(item = {}) {
    const quarto = item.quarto || '';
    const quartoLabel = item.quarto_label || getQuartoLabel(quarto);
    return `
      <div class="adm-occ-row" data-occ-row>
        <input type="hidden" data-occ-quarto value="${esc(quarto)}" />
        <input type="hidden" data-occ-quarto-label value="${esc(quartoLabel)}" />
        <div class="adm-occ-row-pill">${esc(quartoLabel)}</div>
        <input type="date" data-occ-inicio value="${esc(item.inicio || '')}" aria-label="Check-in ocupação" />
        <input type="date" data-occ-fim value="${esc(item.fim || '')}" aria-label="Check-out ocupação" />
        <input type="text" data-occ-ocupantes value="${esc(item.ocupantes || '')}" aria-label="Ocupantes" />
        <button class="adm-room-remove" type="button" data-occ-remove title="Remover período">Remover</button>
      </div>`;
  }

  function setOcupacaoForm(ocupacao = []) {
    const list = document.getElementById('occList');
    if (!list) return;
    const rows = Array.isArray(ocupacao) ? ocupacao.filter(Boolean).map(renderOcupacaoRow) : [];
    list.innerHTML = rows.length ? rows.join('') : '<div class="adm-occ-empty">Nenhum período específico adicionado.</div>';
    setFeedback('occFeedback', '');
  }

  function getOcupacaoFromForm() {
    return Array.from(document.querySelectorAll('#occList [data-occ-row]')).map((row) => ({
      quarto: row.querySelector('[data-occ-quarto]')?.value || '',
      quarto_label: row.querySelector('[data-occ-quarto-label]')?.value || '',
      inicio: row.querySelector('[data-occ-inicio]')?.value || '',
      fim: row.querySelector('[data-occ-fim]')?.value || '',
      ocupantes: String(row.querySelector('[data-occ-ocupantes]')?.value || '').trim()
    })).filter((item) => item.quarto || item.inicio || item.fim || item.ocupantes);
  }

  function addOcupacaoFromDraft() {
    const quarto = document.getElementById('occQuarto')?.value || '';
    const inicio = document.getElementById('occInicio')?.value || document.getElementById('resCheckin')?.value || '';
    const fim = document.getElementById('occFim')?.value || document.getElementById('resCheckout')?.value || '';
    const ocupantes = String(document.getElementById('occOcupantes')?.value || '').trim();

    if (!quarto) { setFeedback('occFeedback', 'Selecione o quarto antes de adicionar o período.', 'err'); return; }
    if (!inicio || !fim) { setFeedback('occFeedback', 'Informe check-in e check-out do período.', 'err'); return; }
    if (new Date(`${fim}T00:00:00`) <= new Date(`${inicio}T00:00:00`)) { setFeedback('occFeedback', 'O check-out precisa ser posterior ao check-in.', 'err'); return; }
    if (!ocupantes) { setFeedback('occFeedback', 'Informe os ocupantes do período.', 'err'); return; }

    const list = document.getElementById('occList');
    if (!list) return;
    list.querySelector('.adm-occ-empty')?.remove();
    list.insertAdjacentHTML('beforeend', renderOcupacaoRow({ quarto, quarto_label: getQuartoLabel(quarto), inicio, fim, ocupantes }));
    document.getElementById('occOcupantes').value = '';
    setFeedback('occFeedback', 'Período adicionado.', 'ok');
  }

  async function enrichRowsWithColaboradores(rows) {
    const ids = [...new Set((rows || []).map((row) => row.solicitacao_id).filter(Boolean))];
    if (!ids.length) return rows || [];

    const { data, error } = await supabase
      .from('hospedagem_solicitacao_colaboradores')
      .select('solicitacao_id,nome_colaborador,supervisao,regional,coordenacao,empresa,tipo_colaborador')
      .in('solicitacao_id', ids);

    if (error || !Array.isArray(data)) return rows || [];

    const porSolicitacao = new Map();
    data.forEach((colab) => {
      const key = String(colab.solicitacao_id || '');
      if (!porSolicitacao.has(key)) porSolicitacao.set(key, []);
      porSolicitacao.get(key).push(colab);
    });

    return (rows || []).map((row) => ({
      ...row,
      _colaboradoresDetalhados: porSolicitacao.get(String(row.solicitacao_id || '')) || []
    }));
  }
  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.adm-hosp-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.adm-hosp-panel').forEach((p) => p.classList.remove('active'));
    document.getElementById(`tab-${tab}`)?.classList.add('active');
    if (tab === 'hoteis') return loadHoteis();
    if (tab === 'alojamentos') return loadAlojamentos();
    loadRows();
  }

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
    state.rows = await enrichRowsWithColaboradores(data || []);
    renderPainel();
    renderSolicitacoes();
  }

  function painelBucket(r) {
    const fin = String(r.status_financeiro || 'NAO_INICIADO').toUpperCase();
    const nf = String(r.status_nota || 'NAO_SOLICITADA').toUpperCase();
    const hosp = String(r.status_hospedagem || '').toUpperCase();
    const sol = String(r.status_solicitacao || '').toUpperCase();
    if (fin === 'PAGO' || nf === 'LANCADO' || sol === 'CONCLUIDA') return 'pagos';
    if (r.pendencia_financeira || r.pendencia_nf || ['AGUARDANDO_PAGAMENTO','ENVIADO_AO_FINANCEIRO'].includes(fin) || ['AGUARDANDO_NF','NF_RECEBIDA','ENVIADO_PARA_LANCAMENTO'].includes(nf)) return 'pendentes';
    if (r.checkout_hoje || r.checkout_vencido || ['CHECKOUT_HOJE','RENOVACAO_NECESSARIA','CHECKOUT_REALIZADO'].includes(hosp)) return 'checkout';
    if (sol === 'RESERVADA' || ['CHECKIN_PREVISTO','HOSPEDADO'].includes(hosp)) return 'reservados';
    return 'pendentes';
  }

  function updatePainelStatusCounts() {
    const counts = { reservados: 0, checkout: 0, pendentes: 0, pagos: 0 };
    (state.rows || []).forEach((r) => { counts[painelBucket(r)] = (counts[painelBucket(r)] || 0) + 1; });
    const map = { countReservados: counts.reservados, countCheckout: counts.checkout, countPendentes: counts.pendentes, countPagos: counts.pagos };
    Object.entries(map).forEach(([id, value]) => { const el = document.getElementById(id); if (el) el.textContent = value; });
  }

  function setPainelStatus(status) {
    state.painelStatus = status || 'reservados';
    document.querySelectorAll('[data-painel-status]').forEach((btn) => btn.classList.toggle('active', btn.dataset.painelStatus === state.painelStatus));
    renderPainel();
  }

  function renderPainel() {
    const tbody = document.getElementById('painelTbody');
    updatePainelStatusCounts();
    let rows = state.rows.filter((r) => painelBucket(r) === state.painelStatus);
    if (state.painelStatus !== 'pagos') rows = rows.slice(0, 50);
    const emptyLabel = ({ reservados: 'Nenhuma reserva ativa.', checkout: 'Nenhum check-out pendente.', pendentes: 'Nenhuma pendência financeira/NF.', pagos: 'Nenhuma hospedagem paga/finalizada.' })[state.painelStatus] || 'Nenhum registro.';
    if (!rows.length) { tbody.innerHTML = `<tr><td colspan="9" class="adm-hosp-empty">${emptyLabel}</td></tr>`; return; }
    tbody.innerHTML = rows.map(rowHtml).join('');
  }

  function renderSolicitacoes() {
    const tbody = document.getElementById('solTbody');
    const status = document.getElementById('filterStatus').value;
    const search = String(document.getElementById('filterSearch').value || '').toLowerCase().trim();
    const checkout = document.getElementById('filterCheckout').value;
    let rows = [...state.rows];
    if (status) rows = rows.filter((r) => r.status_solicitacao === status);
    if (checkout) rows = rows.filter((r) => !r.data_checkout || r.data_checkout <= checkout || !r.reserva_id);
    if (search) rows = rows.filter((r) => [r.codigo, r.solicitante_nome, r.colaboradores, ...(getColaboradoresDetalhados(r).flatMap((c) => [c.nome_colaborador, c.supervisao, c.regional, c.coordenacao])), r.cidade, r.uf, r.local_embarque, r.hotel, r.cliente].join(' ').toLowerCase().includes(search));
    if (!rows.length) { tbody.innerHTML = `<tr><td colspan="9" class="adm-hosp-empty">Nenhuma solicitação encontrada.</td></tr>`; return; }
    tbody.innerHTML = rows.map((r) => `
      <tr>
        <td><strong>${esc(r.codigo || '-')}</strong><span class="adm-hosp-row-note">${brDate(r.data_solicitacao)}</span></td>
        <td><strong>${esc(r.solicitante_nome || '-')}</strong></td>
        <td>${renderColaboradoresCell(r)}</td>
        <td>${esc([r.cidade, r.uf].filter(Boolean).join('/'))}<span class="adm-hosp-row-note">${esc(r.cliente || '')}</span></td>
        <td>${esc(r.local_embarque || '-')}</td>
        <td>${brDate(r.data_checkin_prevista)} até ${brDate(r.data_checkout_prevista)}<span class="adm-hosp-row-note">${esc(r.quantidade_diarias_prevista || '-')} diária(s)</span></td>
        <td>${esc(r.hotel || '-')}</td>
        <td>${statusPill(r.status_solicitacao)}</td>
        <td><div class="adm-hosp-actions"><button class="btn btn-secondary adm-hosp-small" data-action="open-process" data-process-target="incluir" data-id="${esc(r.solicitacao_id)}" type="button">Incluir</button><button class="btn btn-secondary adm-hosp-small" data-action="open-process" data-process-target="extend" data-id="${esc(r.solicitacao_id)}" type="button">Estender</button><button class="btn btn-secondary adm-hosp-small" data-action="open-process" data-process-target="checkout" data-id="${esc(r.solicitacao_id)}" type="button">Checkout</button><button class="btn btn-secondary adm-hosp-small" data-action="open" data-id="${esc(r.solicitacao_id)}" type="button">Configurar</button></div></td>
      </tr>
    `).join('');
  }

  function rowHtml(r) {
    return `
      <tr>
        <td><strong>${esc(r.codigo || '-')}</strong><span class="adm-hosp-row-note">${brDate(r.data_solicitacao)}</span></td>
        <td>${renderColaboradoresCell(r)}</td>
        <td>${esc([r.cidade, r.uf].filter(Boolean).join('/'))}<span class="adm-hosp-row-note">${esc(r.local_embarque || '')}</span></td>
        <td>${brDate(r.data_checkin || r.data_checkin_prevista)} até ${brDate(r.data_checkout || r.data_checkout_prevista)}</td>
        <td>${esc(r.hotel || '-')}<span class="adm-hosp-row-note">${r.valor_total_previsto ? money(r.valor_total_previsto) : ''}</span></td>
        <td>${statusPill(r.status_solicitacao)}<span class="adm-hosp-row-note">${r.status_hospedagem ? label(r.status_hospedagem) : ''}</span></td>
        <td>${statusPill(r.status_financeiro || 'NAO_INICIADO')}</td>
        <td>${statusPill(r.status_nota || 'NAO_SOLICITADA')}</td>
        <td><div class="adm-hosp-actions"><button class="btn btn-secondary adm-hosp-small" data-action="open-process" data-process-target="incluir" data-id="${esc(r.solicitacao_id)}" type="button">Incluir</button><button class="btn btn-secondary adm-hosp-small" data-action="open-process" data-process-target="extend" data-id="${esc(r.solicitacao_id)}" type="button">Estender</button><button class="btn btn-secondary adm-hosp-small" data-action="open-process" data-process-target="checkout" data-id="${esc(r.solicitacao_id)}" type="button">Checkout</button><button class="btn btn-secondary adm-hosp-small" data-action="open" data-id="${esc(r.solicitacao_id)}" type="button">Configurar</button></div></td>
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
    select.innerHTML = `<option value="">Selecionar hotel cadastrado</option>` + rows.map((h) => {
      const ind = getHotelDiariaPorTipo(h, 'INDIVIDUAL');
      const dup = getHotelDiariaPorTipo(h, 'DUPLO');
      const rates = [ind ? `Ind. ${money(ind)}` : '', dup ? `Dup. ${money(dup)}` : ''].filter(Boolean).join(' · ');
      return `<option value="${esc(h.id)}" data-nome="${esc(h.nome)}" data-cidade="${esc(h.cidade || '')}" data-uf="${esc(h.uf || '')}">${esc(h.nome)} · ${esc(h.cidade || '-')}/${esc(h.uf || '')}${rates ? ` · ${rates}` : ''}</option>`;
    }).join('');
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
        <td>
          <strong>Ind:</strong> ${h.valor_diaria_individual ? money(h.valor_diaria_individual) : '-'}<br>
          <strong>Dup:</strong> ${h.valor_diaria_duplo ? money(h.valor_diaria_duplo) : '-'}<br>
          <strong>Tri:</strong> ${h.valor_diaria_triplo ? money(h.valor_diaria_triplo) : '-'}<br>
          <strong>Quad:</strong> ${h.valor_diaria_quadruplo ? money(h.valor_diaria_quadruplo) : '-'}
        </td>
        <td>${esc(h.whatsapp || h.telefone || '-')}<span class="adm-hosp-row-note">${esc(h.cnpj_cpf || '')}</span></td>
        <td>${statusPill(h.status || 'ATIVO')}</td>
        <td>${statusPill(h.prioridade || 'NORMAL')}</td>
        <td><div class="adm-hosp-actions"><button class="btn btn-secondary adm-hosp-small" data-action="edit-hotel" data-id="${esc(h.id)}" type="button">Editar</button><button class="btn btn-secondary adm-hosp-small adm-hosp-danger" data-action="delete-hotel" data-id="${esc(h.id)}" type="button">Excluir</button></div></td>
      </tr>
    `).join('');
  }


  async function loadAlojamentos() {
    const tbody = document.getElementById('alojTbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="adm-hosp-empty">Carregando...</td></tr>`;
    const { data, error } = await supabase.from('hospedagem_alojamentos').select('*').order('cidade', { ascending: true }).order('nome', { ascending: true });
    if (error) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="adm-hosp-empty">${esc(error.message)}. Rode a migration de alojamentos no Supabase.</td></tr>`;
      return;
    }
    state.alojamentos = data || [];
    renderAlojamentos();
  }

  function renderAlojamentos() {
    const tbody = document.getElementById('alojTbody');
    if (!tbody) return;
    const search = normalizeText(document.getElementById('alojSearch')?.value || '');
    let rows = state.alojamentos || [];
    if (search) rows = rows.filter((a) => normalizeText([a.nome, a.cidade, a.uf, a.responsavel, a.contato, a.empresa_internet, a.descricao_fatura].join(' ')).includes(search));
    if (!rows.length) { tbody.innerHTML = `<tr><td colspan="7" class="adm-hosp-empty">Nenhum alojamento encontrado.</td></tr>`; return; }
    tbody.innerHTML = rows.map((a) => {
      const despesas = [
        a.valor_aluguel ? `Aluguel: ${money(a.valor_aluguel)}` : '',
        a.agua ? `Água: ${esc(a.agua)}` : '',
        a.energia ? `Energia: ${esc(a.energia)}` : '',
        a.internet ? `Internet: ${esc(a.internet)}` : '',
        a.empresa_internet ? `Empresa: ${esc(a.empresa_internet)}` : ''
      ].filter(Boolean).join('<br>') || '-';
      const vencs = [
        a.vencimento_aluguel ? `Aluguel dia ${esc(a.vencimento_aluguel)}` : '',
        a.vencimento_agua ? `Água dia ${esc(a.vencimento_agua)}` : '',
        a.vencimento_energia ? `Energia dia ${esc(a.vencimento_energia)}` : '',
        a.vencimento_internet ? `Internet dia ${esc(a.vencimento_internet)}` : ''
      ].filter(Boolean).join(' · ');
      return `<tr>
        <td><strong>${esc(a.nome)}</strong><span class="adm-hosp-row-note">${esc(a.endereco || '')}</span></td>
        <td>${esc([a.cidade, a.uf].filter(Boolean).join('/'))}</td>
        <td>${statusPill(a.tipo || 'CASA')}<span class="adm-hosp-row-note">Cap.: ${esc(a.capacidade || '-')} · Quartos: ${esc(a.quartos || '-')}</span><span class="adm-hosp-row-note">${esc(a.responsavel || '')}${a.contato ? ` · ${esc(a.contato)}` : ''}</span></td>
        <td>${despesas}<span class="adm-hosp-row-note">${esc(vencs)}</span></td>
        <td>${a.anexo_url ? `<a href="${esc(a.anexo_url)}" target="_blank" rel="noopener">Abrir anexo</a>` : '-'}<span class="adm-hosp-row-note">${esc(a.descricao_fatura || '')}</span></td>
        <td>${statusPill(a.status || 'ATIVO')}<br>${statusPill(a.prioridade || 'NORMAL')}</td>
        <td><div class="adm-hosp-actions"><button class="btn btn-secondary adm-hosp-small" data-action="edit-alojamento" data-id="${esc(a.id)}" type="button">Editar</button><button class="btn btn-secondary adm-hosp-small adm-hosp-danger" data-action="delete-alojamento" data-id="${esc(a.id)}" type="button">Excluir</button></div></td>
      </tr>`;
    }).join('');
  }

  function resetAlojamentoForm() {
    state.editingAlojamento = null;
    document.getElementById('alojForm')?.reset();
    if (document.getElementById('alojStatus')) document.getElementById('alojStatus').value = 'ATIVO';
    if (document.getElementById('alojPrioridade')) document.getElementById('alojPrioridade').value = 'NORMAL';
    if (document.getElementById('alojSave')) document.getElementById('alojSave').textContent = 'Salvar alojamento';
    setFeedback('alojFeedback', '');
  }

  function fillAlojamentoForm(a) {
    state.editingAlojamento = a.id;
    document.getElementById('alojNome').value = a.nome || '';
    document.getElementById('alojTipo').value = a.tipo || 'CASA';
    document.getElementById('alojCidade').value = a.cidade || '';
    document.getElementById('alojUf').value = a.uf || '';
    document.getElementById('alojEndereco').value = a.endereco || '';
    document.getElementById('alojCapacidade').value = a.capacidade || '';
    document.getElementById('alojQuartos').value = a.quartos || '';
    document.getElementById('alojResponsavel').value = a.responsavel || '';
    document.getElementById('alojContato').value = a.contato || '';
    document.getElementById('alojStatus').value = a.status || 'ATIVO';
    document.getElementById('alojPrioridade').value = a.prioridade || 'NORMAL';
    document.getElementById('alojAluguel').value = a.valor_aluguel || '';
    document.getElementById('alojAgua').value = a.agua || '';
    document.getElementById('alojEnergia').value = a.energia || '';
    document.getElementById('alojInternet').value = a.internet || '';
    document.getElementById('alojEmpresaNet').value = a.empresa_internet || '';
    document.getElementById('alojVencAluguel').value = a.vencimento_aluguel || '';
    document.getElementById('alojVencAgua').value = a.vencimento_agua || '';
    document.getElementById('alojVencEnergia').value = a.vencimento_energia || '';
    document.getElementById('alojVencInternet').value = a.vencimento_internet || '';
    document.getElementById('alojAnexo').value = a.anexo_url || '';
    document.getElementById('alojDescricaoFatura').value = a.descricao_fatura || '';
    document.getElementById('alojObs').value = a.observacoes || '';
    document.getElementById('alojSave').textContent = 'Salvar alterações';
    document.getElementById('alojNome').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function saveAlojamento(ev) {
    ev.preventDefault();
    setFeedback('alojFeedback', 'Salvando...');
    const payload = {
      nome: document.getElementById('alojNome').value.trim(),
      tipo: document.getElementById('alojTipo').value || 'CASA',
      cidade: document.getElementById('alojCidade').value.trim(),
      uf: normalizeUF(document.getElementById('alojUf').value),
      endereco: document.getElementById('alojEndereco').value.trim() || null,
      capacidade: document.getElementById('alojCapacidade').value ? Number(document.getElementById('alojCapacidade').value) : null,
      quartos: document.getElementById('alojQuartos').value ? Number(document.getElementById('alojQuartos').value) : null,
      responsavel: document.getElementById('alojResponsavel').value.trim() || null,
      contato: document.getElementById('alojContato').value.trim() || null,
      status: document.getElementById('alojStatus').value,
      prioridade: document.getElementById('alojPrioridade').value,
      valor_aluguel: document.getElementById('alojAluguel').value ? Number(document.getElementById('alojAluguel').value) : null,
      agua: document.getElementById('alojAgua').value.trim() || null,
      energia: document.getElementById('alojEnergia').value.trim() || null,
      internet: document.getElementById('alojInternet').value.trim() || null,
      empresa_internet: document.getElementById('alojEmpresaNet').value.trim() || null,
      vencimento_aluguel: document.getElementById('alojVencAluguel').value ? Number(document.getElementById('alojVencAluguel').value) : null,
      vencimento_agua: document.getElementById('alojVencAgua').value ? Number(document.getElementById('alojVencAgua').value) : null,
      vencimento_energia: document.getElementById('alojVencEnergia').value ? Number(document.getElementById('alojVencEnergia').value) : null,
      vencimento_internet: document.getElementById('alojVencInternet').value ? Number(document.getElementById('alojVencInternet').value) : null,
      anexo_url: document.getElementById('alojAnexo').value.trim() || null,
      descricao_fatura: document.getElementById('alojDescricaoFatura').value.trim() || null,
      observacoes: document.getElementById('alojObs').value.trim() || null,
      atualizado_por: userContext?.user?.id || null
    };
    if (!payload.nome || !payload.cidade || !payload.uf) { setFeedback('alojFeedback', 'Informe nome, cidade e UF do alojamento.', 'err'); return; }
    const result = state.editingAlojamento
      ? await supabase.from('hospedagem_alojamentos').update(payload).eq('id', state.editingAlojamento)
      : await supabase.from('hospedagem_alojamentos').insert({ ...payload, criado_por: userContext?.user?.id || null });
    if (result.error) { setFeedback('alojFeedback', result.error.message, 'err'); return; }
    resetAlojamentoForm();
    setFeedback('alojFeedback', 'Alojamento salvo com sucesso.', 'ok');
    await loadAlojamentos();
  }

  async function deleteAlojamento(id) {
    const aloj = (state.alojamentos || []).find((a) => String(a.id) === String(id));
    if (!aloj) return;
    if (!window.confirm(`Excluir o alojamento ${aloj.nome}?`)) return;
    setFeedback('alojFeedback', 'Excluindo alojamento...');
    const { error } = await supabase.from('hospedagem_alojamentos').delete().eq('id', id);
    if (error) { setFeedback('alojFeedback', error.message, 'err'); return; }
    if (state.editingAlojamento === id) resetAlojamentoForm();
    setFeedback('alojFeedback', 'Alojamento excluído com sucesso.', 'ok');
    await loadAlojamentos();
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
    document.getElementById('hotelDiariaIndividual').value = h.valor_diaria_individual || h.valor_diaria_padrao || '';
    document.getElementById('hotelDiariaDuplo').value = h.valor_diaria_duplo || '';
    document.getElementById('hotelDiariaTriplo').value = h.valor_diaria_triplo || '';
    document.getElementById('hotelDiariaQuadruplo').value = h.valor_diaria_quadruplo || '';
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
      valor_diaria_padrao: document.getElementById('hotelDiariaIndividual').value ? Number(document.getElementById('hotelDiariaIndividual').value) : null,
      valor_diaria_individual: document.getElementById('hotelDiariaIndividual').value ? Number(document.getElementById('hotelDiariaIndividual').value) : null,
      valor_diaria_duplo: document.getElementById('hotelDiariaDuplo').value ? Number(document.getElementById('hotelDiariaDuplo').value) : null,
      valor_diaria_triplo: document.getElementById('hotelDiariaTriplo').value ? Number(document.getElementById('hotelDiariaTriplo').value) : null,
      valor_diaria_quadruplo: document.getElementById('hotelDiariaQuadruplo').value ? Number(document.getElementById('hotelDiariaQuadruplo').value) : null,
      whatsapp: document.getElementById('hotelWhatsapp').value.trim() || null,
      cnpj_cpf: document.getElementById('hotelCnpj').value.trim() || null, endereco: document.getElementById('hotelEndereco').value.trim() || null, link_maps: document.getElementById('hotelMaps').value.trim() || null,
      status: document.getElementById('hotelStatus').value, prioridade: document.getElementById('hotelPrioridade').value, observacoes: document.getElementById('hotelObs').value.trim() || null, atualizado_por: userContext?.user?.id || null
    };
    const result = state.editingHotel ? await supabase.from('hospedagem_hoteis').update(payload).eq('id', state.editingHotel) : await supabase.from('hospedagem_hoteis').insert({ ...payload, criado_por: userContext?.user?.id || null });
    if (result.error) { setFeedback('hotelFeedback', result.error.message, 'err'); return; }
    resetHotelForm(); setFeedback('hotelFeedback', 'Hotel salvo com sucesso.', 'ok'); await loadHoteis();
  }


  async function deleteHotel(id) {
    const hotel = getHotelById(id);
    if (!hotel) return;

    const nome = hotel.nome || 'hotel selecionado';
    const cidadeUf = [hotel.cidade, hotel.uf].filter(Boolean).join('/');
    const ok = window.confirm(`Excluir o cadastro do hotel ${nome}${cidadeUf ? ` (${cidadeUf})` : ''}?

Essa ação remove o hotel da base de Hospedagem e ele deixará de aparecer no Operacional.`);
    if (!ok) return;

    setFeedback('hotelFeedback', 'Excluindo hotel...');
    const result = await supabase.from('hospedagem_hoteis').delete().eq('id', id);

    if (result.error) {
      const msg = String(result.error.message || '').toLowerCase();
      const podeInativar = msg.includes('foreign key') || msg.includes('violates') || msg.includes('referenced') || msg.includes('constraint');

      if (podeInativar) {
        const inactive = await supabase
          .from('hospedagem_hoteis')
          .update({ status: 'INATIVO', atualizado_por: userContext?.user?.id || null })
          .eq('id', id);

        if (inactive.error) {
          setFeedback('hotelFeedback', inactive.error.message, 'err');
          return;
        }

        setFeedback('hotelFeedback', 'Hotel já possuía vínculo em reserva. Cadastro marcado como INATIVO.', 'ok');
        if (state.editingHotel === id) resetHotelForm();
        await loadHoteis();
        return;
      }

      setFeedback('hotelFeedback', result.error.message, 'err');
      return;
    }

    setFeedback('hotelFeedback', 'Hotel excluído com sucesso.', 'ok');
    if (state.editingHotel === id) resetHotelForm();
    await loadHoteis();
  }



  function getHojeIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function isReservaBloqueada(row = state.selected) {
    const status = String(row?.status_hospedagem || '').toUpperCase();
    return Boolean(row?.reserva_id && ['HOSPEDADO', 'CHECKOUT_HOJE', 'RENOVACAO_NECESSARIA', 'CHECKOUT_REALIZADO', 'CONCLUIDA'].includes(status));
  }

  function getNomesColaboradores(row = state.selected) {
    return getColaboradoresDetalhados(row).map((c) => c.nome_colaborador || c.nome).filter(Boolean);
  }

  function getSelectedMultiValues(id) {
    return Array.from(document.getElementById(id)?.selectedOptions || []).map((opt) => opt.value).filter(Boolean);
  }

  function fillMultiSelect(id, nomes = [], selecionados = []) {
    const el = document.getElementById(id);
    if (!el) return;
    const selectedSet = new Set(selecionados.map(String));
    el.innerHTML = [...new Set(nomes)].map((nome) => `<option value="${esc(nome)}" ${selectedSet.has(String(nome)) ? 'selected' : ''}>${esc(nome)}</option>`).join('');
  }


  function calcularValorDiariasCheckout(row = state.selected) {
    const checkin = row?.data_checkin || row?.data_checkin_prevista || '';
    const checkout = document.getElementById('chkData')?.value || row?.data_checkout || row?.data_checkout_prevista || '';
    const diarias = diffDays(checkin, checkout);
    const valorDia = Number(row?.valor_diaria || 0) * Number(row?.quantidade_quartos || 1);
    const totalBase = Number(row?.valor_total_previsto || 0);
    return valorDia ? valorDia * diarias : totalBase;
  }

  function getCheckoutExtras() {
    return Array.from(document.querySelectorAll('#chkExtrasList [data-extra-row]')).map((row) => ({
      descricao: row.querySelector('[data-extra-desc]')?.value?.trim() || '',
      valor: Number(row.querySelector('[data-extra-valor]')?.value || 0)
    })).filter((item) => item.descricao || item.valor);
  }

  function extrasTotal() { return getCheckoutExtras().reduce((sum, item) => sum + Number(item.valor || 0), 0); }

  function addCheckoutExtra(desc = '', valor = '') {
    const list = document.getElementById('chkExtrasList');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'adm-extra-row';
    row.dataset.extraRow = '1';
    row.innerHTML = `<input data-extra-desc placeholder="Descrição do extra" value="${esc(desc)}" /><input data-extra-valor type="number" step="0.01" min="0" placeholder="Valor" value="${esc(valor)}" /><button class="btn btn-secondary adm-hosp-small" type="button" data-extra-remove>Remover</button>`;
    list.appendChild(row);
    row.querySelector('[data-extra-remove]')?.addEventListener('click', () => { row.remove(); updateCheckoutValor(); });
    row.querySelector('[data-extra-valor]')?.addEventListener('input', updateCheckoutValor);
  }

  function updateCheckoutValor() {
    const el = document.getElementById('chkValorDiarias');
    if (el) el.value = calcularValorDiariasCheckout().toFixed(2);
    const box = document.getElementById('payConfirmBox');
    if (box && !box.classList.contains('adm-hidden-soft')) renderPaymentSummary();
  }

  function renderPaymentSummary() {
    const diarias = calcularValorDiariasCheckout();
    const extras = getCheckoutExtras();
    const totalExtras = extrasTotal();
    const total = diarias + totalExtras;
    const nomes = getSelectedMultiValues('chkHospedesSaem');
    const resumo = document.getElementById('payResumo');
    if (!resumo) return;
    resumo.innerHTML = `
      <div class="adm-payment-summary-line"><b>Hotel</b><span>${esc(state.selected?.hotel || state.selected?.nome_hotel || '-')}</span></div>
      <div class="adm-payment-summary-line"><b>Período</b><span>${brDate(state.selected?.data_checkin || state.selected?.data_checkin_prevista)} até ${brDate(document.getElementById('chkData')?.value || state.selected?.data_checkout || state.selected?.data_checkout_prevista)}</span></div>
      <div class="adm-payment-summary-line"><b>Colaboradores</b><span>${esc(nomes.length ? nomes.join(', ') : (state.selected?.colaboradores || '-'))}</span></div>
      <div class="adm-payment-summary-line"><b>Diárias</b><span>${money(diarias)}</span></div>
      <div class="adm-payment-summary-line"><b>Extras</b><span>${esc(extras.map((e) => `${e.descricao || 'Extra'}: ${money(e.valor)}`).join(' | ') || 'Sem extras')}</span></div>
      <div class="adm-payment-summary-line"><b>Total</b><span><strong>${money(total)}</strong></span></div>
    `;
  }

  function populateIncluirOptions(row = state.selected) {
    const select = document.getElementById('incSolicitacao');
    if (!select) return;
    const atual = String(row?.solicitacao_id || '');
    const cidade = normalizeText(row?.cidade || '');
    const disponiveis = (state.rows || []).filter((r) => String(r.solicitacao_id || '') !== atual && !r.reserva_id && ['SOLICITADA','EM_ANALISE','EM_COTACAO'].includes(String(r.status_solicitacao || '').toUpperCase()));
    disponiveis.sort((a,b) => (normalizeText(b.cidade || '') === cidade ? 1 : 0) - (normalizeText(a.cidade || '') === cidade ? 1 : 0));
    select.innerHTML = `<option value="">Selecione uma solicitação aberta</option>` + disponiveis.map((r) => `<option value="${esc(r.solicitacao_id)}">${esc(r.codigo || '-')} · ${esc(r.colaboradores || '-')} · ${esc([r.cidade,r.uf].filter(Boolean).join('/'))}</option>`).join('');
  }

  async function incluirNaReservaAtual() {
    const solicitacaoId = document.getElementById('incSolicitacao')?.value || '';
    if (!state.selected?.reserva_id) { setFeedback('incFeedback', 'Salve a reserva principal antes de incluir outra solicitação.', 'err'); return; }
    if (!solicitacaoId) { setFeedback('incFeedback', 'Selecione uma solicitação para incluir.', 'err'); return; }
    const obs = String(document.getElementById('incObs')?.value || '').trim();
    const payload = {
      solicitacao_id: solicitacaoId,
      hotel_id: state.selected.hotel_id || null,
      nome_hotel: state.selected.hotel || state.selected.nome_hotel || null,
      cidade_hotel: state.selected.cidade_hotel || state.selected.cidade || null,
      uf_hotel: state.selected.uf_hotel || state.selected.uf || null,
      valor_diaria: Number(state.selected.valor_diaria || 0),
      quantidade_diarias: Number(state.selected.quantidade_diarias || state.selected.quantidade_diarias_prevista || 1),
      quantidade_quartos: Number(state.selected.quantidade_quartos || 1),
      tipo_quarto: state.selected.tipo_quarto || 'OUTRO',
      valor_total_previsto: Number(state.selected.valor_total_previsto || 0),
      data_checkin: state.selected.data_checkin || state.selected.data_checkin_prevista || null,
      data_checkout: state.selected.data_checkout || state.selected.data_checkout_prevista || null,
      confirmado_com: state.selected.confirmado_com || null,
      contato_confirmacao: state.selected.contato_confirmacao || null,
      status_hospedagem: 'CHECKIN_PREVISTO',
      observacao_hospedagem: appendObservacaoProcesso(state.selected, 'Solicitação incluída na mesma hospedagem', [obs]),
      criado_por: userContext?.user?.id || null,
      atualizado_por: userContext?.user?.id || null
    };
    setFeedback('incFeedback', 'Incluindo solicitação...');
    const { error } = await supabase.from('hospedagem_reservas').insert(payload);
    if (error) { setFeedback('incFeedback', error.message, 'err'); return; }
    await supabase.from('hospedagem_solicitacoes').update({ status_solicitacao: 'RESERVADA' }).eq('id', solicitacaoId);
    setFeedback('incFeedback', 'Solicitação incluída e marcada como RESERVADA.', 'ok');
    await loadRows();
    populateIncluirOptions(state.selected);
  }

  function buildResumoReserva(row = state.selected) {
    const obsComp = extrairComposicaoObservacao(row?.observacao_hospedagem || '');
    const obsOcc = extrairOcupacaoObservacao(obsComp.observacao || '');
    const compResumo = obsComp.composicao ? formatComposicaoResumo(obsComp.composicao) : '';
    const ocupacao = Array.isArray(obsOcc.ocupacao) && obsOcc.ocupacao.length
      ? obsOcc.ocupacao.map((item) => `${item.quarto_label || item.quarto || 'Quarto'}: ${item.ocupantes || '-'} (${brDate(item.inicio)} até ${brDate(item.fim)})`).join('<br>')
      : 'Ocupação por quarto ainda não informada.';
    return `
      <strong>Reserva bloqueada para edição direta</strong>
      <span><b>Hotel:</b> ${esc(row?.hotel || row?.nome_hotel || '-')}</span>
      <span><b>Período:</b> ${esc(brDate(row?.data_checkin || row?.data_checkin_prevista))} até ${esc(brDate(row?.data_checkout || row?.data_checkout_prevista))}</span>
      <span><b>Total previsto:</b> ${esc(money(row?.valor_total_previsto || row?.valor_financeiro || 0))}</span>
      <span><b>Quartos:</b> ${esc(compResumo || `${row?.quantidade_quartos || '-'} quarto(s)`)}</span>
      <span><b>Hóspedes por quarto:</b><br>${ocupacao}</span>
    `;
  }

  function setReservaFormLocked(locked) {
    document.querySelectorAll('#reservaForm input, #reservaForm select, #reservaForm textarea, #roomAdd, #occAdd').forEach((el) => {
      if (el.id === 'resInfo') return;
      el.disabled = Boolean(locked);
    });
    document.getElementById('reservaConfigActions')?.classList.toggle('adm-hidden', Boolean(locked));
    document.getElementById('hospLockNotice')?.classList.toggle('adm-hidden', !locked);
    document.getElementById('reservaResumoBloqueada')?.classList.toggle('adm-hidden', !locked);
  }

  function setProcess(process = 'config') {
    const target = process || 'config';
    document.querySelectorAll('#hospProcessTabs [data-process]').forEach((btn) => btn.classList.toggle('active', btn.dataset.process === target));
    document.querySelectorAll('[data-process-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.processPanel === target));
  }

  function configureProcessUI(row = state.selected, preferredProcess = '') {
    const locked = isReservaBloqueada(row);
    setReservaFormLocked(locked);
    const resumo = document.getElementById('reservaResumoBloqueada');
    if (resumo) resumo.innerHTML = locked ? buildResumoReserva(row) : '';

    const nomes = getNomesColaboradores(row);
    fillMultiSelect('extHospedesFicam', nomes, nomes);
    fillMultiSelect('chkHospedesSaem', nomes, []);
    fillMultiSelect('chkHospedesFicam', nomes, nomes);

    const checkoutAtual = row?.data_checkout || row?.data_checkout_prevista || '';
    const checkin = row?.data_checkin || row?.data_checkin_prevista || '';
    const hoje = getHojeIso();
    const extAtual = document.getElementById('extCheckoutAtual');
    if (extAtual) extAtual.value = checkoutAtual ? brDate(checkoutAtual) : '-';
    const extNovo = document.getElementById('extNovoCheckout');
    if (extNovo) extNovo.value = checkoutAtual || '';
    const chkData = document.getElementById('chkData');
    if (chkData) chkData.value = checkoutAtual || hoje;
    const extrasList = document.getElementById('chkExtrasList');
    if (extrasList) extrasList.innerHTML = '';
    document.getElementById('payConfirmBox')?.classList.add('adm-hidden-soft');
    document.getElementById('payFilesBox')?.classList.add('adm-hidden-soft');
    document.getElementById('extObs') && (document.getElementById('extObs').value = '');
    document.getElementById('chkObs') && (document.getElementById('chkObs').value = '');
    document.getElementById('incObs') && (document.getElementById('incObs').value = '');
    populateIncluirOptions(row);
    updateCheckoutValor();
    setFeedback('extFeedback', '');
    setFeedback('chkFeedback', '');
    setFeedback('incFeedback', '');
    setFeedback('payFeedback', '');

    let next = preferredProcess || 'config';
    if (!preferredProcess && locked) {
      const status = String(row?.status_hospedagem || '').toUpperCase();
      next = ['CHECKOUT_HOJE', 'CHECKOUT_REALIZADO'].includes(status) ? 'checkout' : 'extend';
    }
    if (!row?.reserva_id && ['incluir', 'extend', 'checkout', 'finance'].includes(next)) next = 'config';
    setProcess(next);
  }

  function appendObservacaoProcesso(row, titulo, linhas = []) {
    const base = String(row?.observacao_hospedagem || '').trim();
    const corpo = linhas.filter(Boolean).join(' | ');
    const registro = `[${new Date().toLocaleString('pt-BR')}] ${titulo}${corpo ? `: ${corpo}` : ''}`;
    return [base, registro].filter(Boolean).join('\n');
  }

  async function atualizarReservaProcesso(payload, feedbackId, okMsg) {
    if (!state.selected?.reserva_id) {
      setFeedback(feedbackId, 'Salve a reserva antes de executar esta etapa.', 'err');
      return false;
    }
    const { error } = await supabase.from('hospedagem_reservas').update({ ...payload, atualizado_por: userContext?.user?.id || null }).eq('id', state.selected.reserva_id);
    if (error) {
      setFeedback(feedbackId, error.message, 'err');
      return false;
    }
    setFeedback(feedbackId, okMsg, 'ok');
    await loadRows();
    const fresh = state.rows.find((r) => r.reserva_id === state.selected?.reserva_id || r.solicitacao_id === state.selected?.solicitacao_id);
    if (fresh) {
      state.selected = fresh;
      configureProcessUI(fresh, document.querySelector('#hospProcessTabs .active')?.dataset?.process || 'config');
    }
    return true;
  }

  async function estenderReserva() {
    const novoCheckout = document.getElementById('extNovoCheckout')?.value || '';
    if (!novoCheckout) { setFeedback('extFeedback', 'Informe o novo check-out.', 'err'); return; }
    const atual = state.selected?.data_checkout || state.selected?.data_checkout_prevista || '';
    if (atual && new Date(`${novoCheckout}T00:00:00`) <= new Date(`${atual}T00:00:00`)) {
      setFeedback('extFeedback', 'O novo check-out precisa ser posterior ao check-out atual.', 'err');
      return;
    }
    const ficam = getSelectedMultiValues('extHospedesFicam');
    const obs = String(document.getElementById('extObs')?.value || '').trim();
    setFeedback('extFeedback', 'Salvando extensão...');
    await atualizarReservaProcesso({
      data_checkout: novoCheckout,
      quantidade_diarias: diffDays(state.selected.data_checkin || state.selected.data_checkin_prevista, novoCheckout),
      status_hospedagem: 'RENOVACAO_NECESSARIA',
      observacao_hospedagem: appendObservacaoProcesso(state.selected, 'Extensão de reserva', [
        `Novo checkout ${brDate(novoCheckout)}`,
        ficam.length ? `Ficam: ${ficam.join(', ')}` : '',
        obs
      ])
    }, 'extFeedback', 'Extensão salva. Confira o valor financeiro, se necessário.');
  }

  async function solicitarCheckout(destino = 'SALVAR') {
    const data = document.getElementById('chkData')?.value || '';
    if (!data) { setFeedback('chkFeedback', 'Informe a data do checkout.', 'err'); return false; }
    const saem = getSelectedMultiValues('chkHospedesSaem');
    const obs = String(document.getElementById('chkObs')?.value || '').trim();
    const extras = getCheckoutExtras();
    const valorDiarias = calcularValorDiariasCheckout();
    const valorTotal = valorDiarias + extrasTotal();
    const status = destino === 'PAGAR' ? 'CHECKOUT_REALIZADO' : 'CHECKOUT_HOJE';
    setFeedback('chkFeedback', 'Salvando checkout...');
    const ok = await atualizarReservaProcesso({
      data_checkout: data,
      quantidade_diarias: diffDays(state.selected.data_checkin || state.selected.data_checkin_prevista, data),
      valor_total_previsto: valorTotal,
      status_hospedagem: status,
      observacao_hospedagem: appendObservacaoProcesso(state.selected, destino === 'PAGAR' ? 'Checkout para pagamento' : 'Checkout enviado/salvo', [
        `Data ${brDate(data)}`,
        saem.length ? `Check-out: ${saem.join(', ')}` : '',
        `Diárias: ${money(valorDiarias)}`,
        extras.length ? `Extras: ${extras.map((e) => `${e.descricao || 'Extra'} ${money(e.valor)}`).join('; ')}` : '',
        obs
      ])
    }, 'chkFeedback', destino === 'PAGAR' ? 'Checkout conferido. Valide o resumo para pagamento.' : 'Checkout salvo com sucesso.');
    if (ok) {
      const finValor = document.getElementById('finValor');
      if (finValor) finValor.value = valorTotal.toFixed(2);
    }
    return ok;
  }


  async function anexarComprovanteFinanceiro() {
    const url = String(document.getElementById('finComp')?.value || '').trim();
    if (!url) { setFeedback('finNfFeedback', 'Cole o link do comprovante antes de anexar.', 'err'); return; }
    if (document.getElementById('finStatus')?.value === 'NAO_INICIADO') document.getElementById('finStatus').value = 'PAGO';
    await saveFinNf();
  }

  async function anexarNotaFiscal() {
    const url = String(document.getElementById('nfUrl')?.value || '').trim();
    if (!url) { setFeedback('finNfFeedback', 'Cole o link da NF antes de anexar.', 'err'); return; }
    if (document.getElementById('nfStatus')?.value === 'NAO_SOLICITADA') document.getElementById('nfStatus').value = 'NF_RECEBIDA';
    await saveFinNf();
  }

  function openModal(row) {
    state.selected = row;
    const colaboradoresResumo = getColaboradoresDetalhados(row).map((c) => `${c.nome_colaborador || c.nome || '-'} (${getRegionalColaborador(c)})`).join(', ') || row.colaboradores || '-';
    document.getElementById('modalTitle').textContent = `Reserva ${row.codigo || ''}`;
    document.getElementById('modalSub').textContent = `${colaboradoresResumo} · ${[row.cidade, row.uf].filter(Boolean).join('/')}`;
    document.getElementById('resInfo').value = `${row.codigo || '-'} · ${colaboradoresResumo} · ${[row.cidade, row.uf].filter(Boolean).join('/')}`;
    document.getElementById('resCheckin').value = row.data_checkin || row.data_checkin_prevista || '';
    document.getElementById('resCheckout').value = row.data_checkout || row.data_checkout_prevista || '';
    document.getElementById('resDiaria').value = row.valor_diaria || '';
    document.getElementById('resQuartos').value = row.quantidade_quartos || 1;
    document.getElementById('resTipo').value = 'OUTRO';
    document.getElementById('resStatus').value = row.status_hospedagem === 'CANCELADA' ? 'CANCELADA' : 'CHECKIN_PREVISTO';
    document.getElementById('resHotelNome').value = row.hotel || '';
    fillHotelSelect(row);
    const obsComp = extrairComposicaoObservacao(row.observacao_hospedagem || '');
    const obsOcc = extrairOcupacaoObservacao(obsComp.observacao || '');
    const obsData = { observacao: obsOcc.observacao, composicao: obsComp.composicao, ocupacao: obsOcc.ocupacao || [] };
    document.getElementById('resConfirmado').value = row.confirmado_com || '';
    document.getElementById('resContato').value = row.contato_confirmacao || '';
    document.getElementById('resObs').value = obsData.observacao || '';
    if (obsData.composicao) {
      setComposicaoForm(obsData.composicao);
    } else {
      const compDefault = emptyComposicaoQuartos();
      const tipoSalvo = String(row.tipo_quarto || 'INDIVIDUAL').toUpperCase();
      const tipoBase = ['INDIVIDUAL', 'DUPLO', 'TRIPLO', 'QUADRUPLO'].includes(tipoSalvo) ? tipoSalvo : 'INDIVIDUAL';
      compDefault[`MASCULINO_${tipoBase}`] = { qtd: Number(row.quantidade_quartos || 0), diaria: Number(row.valor_diaria || 0) };
      setComposicaoForm(compDefault);
    }
    refreshOcupacaoQuartoSelect();
    fillOcupantesDatalist(row);
    setOcupacaoForm(obsData.ocupacao || []);
    document.getElementById('occInicio').value = document.getElementById('resCheckin').value || '';
    document.getElementById('occFim').value = document.getElementById('resCheckout').value || '';
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
    configureProcessUI(row);
    document.getElementById('reservaModal').classList.add('open');
  }

  function closeModal() { document.getElementById('reservaModal').classList.remove('open'); state.selected = null; setProcess('config'); }
function aplicarDiariaHotelSelecionado() {
    const select = document.getElementById('resHotel');
    const hotel = getHotelById(select?.value);
    if (!hotel) return;
    document.getElementById('resHotelNome').value = hotel.nome || '';
    aplicarDiariasHotelNaComposicao(hotel, true);
  }

  function updateReservaTotals() {
    const dias = diffDays(document.getElementById('resCheckin').value, document.getElementById('resCheckout').value);
    const comp = getComposicaoFromForm();
    const calc = calcularComposicao(comp);
    const total = dias * calc.totalDia;
    document.querySelectorAll('#roomList [data-room-row]').forEach((row) => {
      const qtd = Number(row.querySelector('[data-room-qtd]')?.value || 0);
      const diaria = Number(row.querySelector('[data-room-diaria]')?.value || 0);
      const subtotal = row.querySelector('.adm-room-row-subtotal');
      if (subtotal) subtotal.textContent = money(qtd * diaria);
    });
    document.getElementById('resDiarias').value = dias;
    document.getElementById('resTotal').value = money(total);
    document.getElementById('resQuartos').value = Math.max(1, calc.quartos || 1);
    document.getElementById('resDiaria').value = calc.quartos ? (calc.totalDia / calc.quartos).toFixed(2) : '';
    document.getElementById('resTipo').value = 'OUTRO';
    const resumo = formatComposicaoResumo(comp);
    const summary = document.getElementById('roomSummary');
    if (summary) summary.textContent = resumo ? `${calc.quartos} quarto(s) · ${money(calc.totalDia)} por dia · Total ${money(total)} · ${resumo}` : 'Informe a quantidade de quartos e o valor da diária.';
    refreshOcupacaoQuartoSelect();

    const finValorEl = document.getElementById('finValor');
    const finStatusEl = document.getElementById('finStatus');
    const statusFinanceiro = String(finStatusEl?.value || '').toUpperCase();
    if (finValorEl && !['PAGO', 'SEM_COBRANCA', 'CANCELADO'].includes(statusFinanceiro)) {
      finValorEl.value = total ? total.toFixed(2) : '';
    }
  }

  async function saveReserva(ev) {
    ev.preventDefault();
    if (!state.selected) return;
    if (isReservaBloqueada(state.selected)) { setFeedback('resFeedback', 'Check-in já realizado. Use as etapas de estender, checkout ou financeiro/NF.', 'err'); return; }
    setFeedback('resFeedback', 'Salvando reserva...');
    const hotelSelect = document.getElementById('resHotel');
    const opt = hotelSelect.selectedOptions[0];
    const hotelId = hotelSelect.value || null;
    const hotelManual = document.getElementById('resHotelNome').value.trim();
    if (!hotelId && !hotelManual) { setFeedback('resFeedback', 'Selecione um hotel recomendado da cidade/UF solicitada ou informe o nome manualmente.', 'err'); return; }
    const composicao = getComposicaoFromForm();
    const calc = calcularComposicao(composicao);
    if (!calc.quartos || !calc.totalDia) { setFeedback('resFeedback', 'Informe a composição dos quartos: quantidade e diária por tipo/gênero.', 'err'); return; }
    const quartos = calc.quartos;
    const diariaMedia = calc.totalDia / quartos;
    const diarias = diffDays(document.getElementById('resCheckin').value, document.getElementById('resCheckout').value);
    const totalPrevisto = calc.totalDia * diarias;
    const payload = {
      solicitacao_id: state.selected.solicitacao_id, hotel_id: hotelId, nome_hotel: hotelManual || opt?.dataset?.nome || state.selected.hotel || null,
      cidade_hotel: opt?.dataset?.cidade || state.selected.cidade || null, uf_hotel: opt?.dataset?.uf || state.selected.uf || null, valor_diaria: diariaMedia, quantidade_diarias: diarias, quantidade_quartos: quartos,
      tipo_quarto: 'OUTRO', valor_total_previsto: totalPrevisto, data_checkin: document.getElementById('resCheckin').value, data_checkout: document.getElementById('resCheckout').value,
      confirmado_com: document.getElementById('resConfirmado').value.trim() || null, contato_confirmacao: document.getElementById('resContato').value.trim() || null, status_hospedagem: 'CHECKIN_PREVISTO',
      observacao_hospedagem: montarObservacaoComComposicao(document.getElementById('resObs').value, composicao, getOcupacaoFromForm()), atualizado_por: userContext?.user?.id || null
    };
    const result = state.selected.reserva_id ? await supabase.from('hospedagem_reservas').update(payload).eq('id', state.selected.reserva_id) : await supabase.from('hospedagem_reservas').insert({ ...payload, criado_por: userContext?.user?.id || null }).select('id').single();
    if (result.error) {
      const msg = String(result.error.message || '');
      const detalhe = msg.toLowerCase().includes('row-level security')
        ? 'Permissão RLS bloqueou o cadastro da reserva. Rode o SQL sql/hospedagem_rls_fix.sql no Supabase e tente novamente.'
        : msg;
      setFeedback('resFeedback', detalhe, 'err');
      return;
    }
    const reservaId = state.selected.reserva_id || result.data?.id;
    await supabase.from('hospedagem_solicitacoes').update({ status_solicitacao: payload.status_hospedagem === 'CANCELADA' ? 'CANCELADA' : 'RESERVADA' }).eq('id', state.selected.solicitacao_id);
    state.selected.reserva_id = reservaId;
    setFeedback('resFeedback', 'Reserva salva com sucesso.', 'ok');
    await loadRows();
    const fresh = state.rows.find((r) => r.reserva_id === reservaId || r.solicitacao_id === state.selected?.solicitacao_id);
    if (fresh) { state.selected = fresh; configureProcessUI(fresh, 'config'); }
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


  async function enviarCobrancaFinanceiro() {
    if (!state.selected?.reserva_id) {
      setFeedback('finNfFeedback', 'Salve a reserva antes de enviar a cobrança ao financeiro.', 'err');
      return;
    }

    const reservaId = state.selected.reserva_id;
    const valor = Number(document.getElementById('finValor').value || state.selected.valor_financeiro || state.selected.valor_total_previsto || 0);
    if (!valor) {
      setFeedback('finNfFeedback', 'Informe o valor total antes de enviar ao financeiro.', 'err');
      return;
    }

    setFeedback('finNfFeedback', 'Enviando cobrança ao financeiro...');

    const hotelNome = document.getElementById('resHotelNome').value.trim() || state.selected.hotel || 'Hotel';
    const checkin = document.getElementById('resCheckin').value || state.selected.data_checkin || state.selected.data_checkin_prevista || null;
    const checkout = document.getElementById('resCheckout').value || state.selected.data_checkout || state.selected.data_checkout_prevista || null;
    const colaboradores = getColaboradoresDetalhados(state.selected).map((c) => c.nome_colaborador || c.nome).filter(Boolean).join(', ');
    const destino = [state.selected.cidade, state.selected.uf].filter(Boolean).join('/');

    const pagamentoPayload = {
      origem_setor: 'HOSPEDAGEM',
      origem_tabela: 'hospedagem_reservas',
      origem_id: reservaId,
      origem_codigo: state.selected.codigo || null,
      competencia: checkin,
      descricao: `Hospedagem ${destino || ''}${checkin || checkout ? ` · ${brDate(checkin)} até ${brDate(checkout)}` : ''}${colaboradores ? ` · ${colaboradores}` : ''}`.trim(),
      favorecido_nome: hotelNome,
      forma_pagamento: 'PIX',
      valor,
      data_vencimento: document.getElementById('finVenc').value || null,
      status: 'PENDENTE',
      prioridade: 'NORMAL',
      nf_status: ({
        NAO_SOLICITADA: 'NAO_INFORMADA',
        AGUARDANDO_NF: 'AGUARDANDO_NF',
        NF_RECEBIDA: 'NF_RECEBIDA',
        ENVIADO_PARA_LANCAMENTO: 'NF_RECEBIDA',
        LANCADO: 'LANCADA',
        DISPENSADO: 'DISPENSADA'
      })[document.getElementById('nfStatus').value] || 'NAO_INFORMADA',
      nf_numero: document.getElementById('nfNumero').value.trim() || null,
      nf_url: document.getElementById('nfUrl').value.trim() || null,
      comprovante_url: document.getElementById('finComp').value.trim() || null,
      observacoes: state.selected.observacao_hospedagem || state.selected.observacao || null,
      solicitado_por: userContext?.user?.id || null,
      solicitado_por_nome: userContext?.user?.name || userContext?.profile?.nome || null,
      atualizado_por: userContext?.user?.id || null,
      atualizado_por_nome: userContext?.user?.name || userContext?.profile?.nome || null
    };

    const { error } = await supabase
      .from('financeiro_pagamentos')
      .upsert(pagamentoPayload, { onConflict: 'origem_tabela,origem_id' });

    if (error) {
      setFeedback('finNfFeedback', `${error.message}. Confira se o SQL do módulo financeiro já foi executado.`, 'err');
      return;
    }

    const finPayload = {
      reserva_id: reservaId,
      status_financeiro: 'ENVIADO_AO_FINANCEIRO',
      valor_total: valor,
      data_vencimento: document.getElementById('finVenc').value || null,
      data_pagamento: document.getElementById('finPag').value || null,
      comprovante_pagamento_url: document.getElementById('finComp').value.trim() || null,
      responsavel_pagamento_id: userContext?.user?.id || null,
      responsavel_pagamento: userContext?.user?.name || null
    };

    let finResult;
    if (state.selected.financeiro_id) {
      finResult = await supabase.from('hospedagem_financeiro').update(finPayload).eq('id', state.selected.financeiro_id);
    } else {
      finResult = await supabase.from('hospedagem_financeiro').insert(finPayload).select('id').single();
    }

    if (finResult?.error) {
      setFeedback('finNfFeedback', `Cobrança enviada, mas não atualizei o status da hospedagem: ${finResult.error.message}`, 'err');
      return;
    }

    document.getElementById('finStatus').value = 'ENVIADO_AO_FINANCEIRO';
    setFeedback('finNfFeedback', 'Cobrança enviada ao Financeiro com sucesso.', 'ok');
    await loadRows();
  }

  async function markAnalise() {
    if (!state.selected) return;
    await supabase.from('hospedagem_solicitacoes').update({ status_solicitacao: 'EM_ANALISE' }).eq('id', state.selected.solicitacao_id);
    setFeedback('resFeedback', 'Solicitação marcada em análise.', 'ok');
    await loadRows();
  }

  async function recusarSolicitacao() {
    if (!state.selected) return;
    const motivo = window.prompt('Informe o motivo da recusa da solicitação:');
    if (motivo === null) return;
    const motivoLimpo = String(motivo || '').trim();
    if (!motivoLimpo) {
      setFeedback('resFeedback', 'Informe o motivo da recusa para continuar.', 'err');
      return;
    }

    setFeedback('resFeedback', 'Recusando solicitação...');
    const solResult = await supabase
      .from('hospedagem_solicitacoes')
      .update({ status_solicitacao: 'CANCELADA' })
      .eq('id', state.selected.solicitacao_id);

    if (solResult.error) {
      setFeedback('resFeedback', solResult.error.message, 'err');
      return;
    }

    if (state.selected.reserva_id) {
      const observacaoAtual = String(document.getElementById('resObs')?.value || state.selected.observacao_hospedagem || '').trim();
      const observacaoFinal = [observacaoAtual, `Recusada: ${motivoLimpo}`].filter(Boolean).join('\n');
      const resResult = await supabase
        .from('hospedagem_reservas')
        .update({ status_hospedagem: 'CANCELADA', observacao_hospedagem: observacaoFinal })
        .eq('id', state.selected.reserva_id);
      if (resResult.error) {
        setFeedback('resFeedback', resResult.error.message, 'err');
        return;
      }
    }

    setFeedback('resFeedback', 'Solicitação recusada com sucesso.', 'ok');
    await loadRows();
    setTimeout(closeModal, 450);
  }


  async function checkoutPagar() {
    const ok = await solicitarCheckout('PAGAR');
    if (!ok) return;
    renderPaymentSummary();
    document.getElementById('payConfirmBox')?.classList.remove('adm-hidden-soft');
    document.getElementById('payFilesBox')?.classList.add('adm-hidden-soft');
  }

  async function checkoutEnviarFinanceiro() {
    const ok = await solicitarCheckout('FINANCEIRO');
    if (!ok) return;
    const valor = calcularValorDiariasCheckout() + extrasTotal();
    const finValor = document.getElementById('finValor');
    const finStatus = document.getElementById('finStatus');
    if (finValor) finValor.value = valor.toFixed(2);
    if (finStatus) finStatus.value = 'ENVIADO_AO_FINANCEIRO';
    await enviarCobrancaFinanceiro();
  }

  async function uploadHospedagemFile(inputId, tipo) {
    const input = document.getElementById(inputId);
    const file = input?.files?.[0];
    if (!file) return '';
    const cleanName = String(file.name || 'arquivo').replace(/[^a-zA-Z0-9._-]+/g, '_');
    const path = `hospedagem/${state.selected?.reserva_id || state.selected?.solicitacao_id || 'sem-reserva'}/${tipo}_${Date.now()}_${cleanName}`;
    const { error } = await supabase.storage.from('relatorios-uploads').upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('relatorios-uploads').getPublicUrl(path);
    return data?.publicUrl || path;
  }

  async function salvarPagamentoLocal() {
    if (!state.selected?.reserva_id) { setFeedback('payFeedback', 'Salve a reserva antes de anexar comprovante/NF.', 'err'); return; }
    setFeedback('payFeedback', 'Salvando anexos...');
    let compUrl = String(document.getElementById('payCompUrl')?.value || '').trim();
    let nfUrl = String(document.getElementById('payNfUrl')?.value || '').trim();
    try {
      compUrl = compUrl || await uploadHospedagemFile('payCompFile', 'comprovante');
      nfUrl = nfUrl || await uploadHospedagemFile('payNfFile', 'nf');
    } catch (error) {
      setFeedback('payFeedback', `Erro ao anexar arquivo: ${error.message || error}`, 'err');
      return;
    }
    if (!compUrl) { setFeedback('payFeedback', 'Informe/anexe ao menos o comprovante.', 'err'); return; }
    const valor = calcularValorDiariasCheckout() + extrasTotal();
    document.getElementById('finStatus').value = 'PAGO';
    document.getElementById('finValor').value = valor.toFixed(2);
    document.getElementById('finPag').value = document.getElementById('chkData')?.value || getHojeIso();
    document.getElementById('finComp').value = compUrl;
    document.getElementById('nfStatus').value = nfUrl ? 'ENVIADO_PARA_LANCAMENTO' : 'AGUARDANDO_NF';
    document.getElementById('nfUrl').value = nfUrl;
    document.getElementById('nfValor').value = nfUrl ? valor.toFixed(2) : '';
    await saveFinNf();
    if (nfUrl) {
      await supabase.from('financeiro_notas_fiscais_resumo').upsert({
        data_pagamento: document.getElementById('finPag').value,
        regional: state.selected.regional || state.selected.supervisao || state.selected.cidade || 'Hospedagem',
        destino: 'Hospedagem',
        quantidade: 1,
        valor_total: valor,
        modulo_origem: 'HOSPEDAGEM'
      }, { onConflict: 'data_pagamento,regional,destino,modulo_origem' });
      setFeedback('payFeedback', 'Comprovante e NF salvos. Enviado para Notas Fiscais.', 'ok');
    } else {
      setFeedback('payFeedback', 'Comprovante salvo. Hospedagem ficará PENDENTE aguardando NF.', 'ok');
    }
  }

  function initialTabFromHash() {
    const hash = normalizeText(window.location.hash.replace('#', ''));
    const root = content.closest('main') || content;
    if (hash.includes('aloj')) { root.classList.add('adm-menu-mode-alojamentos'); return 'alojamentos'; }
    if (hash.includes('hotel') || hash.includes('hoteis')) { root.classList.add('adm-menu-mode-hoteis'); return 'painel'; }
    return 'painel';
  }

  document.querySelectorAll('.adm-hosp-tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  document.getElementById('refreshPainel').addEventListener('click', loadRows);
  document.getElementById('painelStatusTabs')?.addEventListener('click', (ev) => { const btn = ev.target.closest('[data-painel-status]'); if (btn) setPainelStatus(btn.dataset.painelStatus); });
  document.getElementById('applyFilters').addEventListener('click', renderSolicitacoes);
  document.getElementById('filterStatus').addEventListener('change', renderSolicitacoes);
  document.getElementById('filterSearch').addEventListener('input', renderSolicitacoes);
  document.getElementById('filterCheckout').addEventListener('change', renderSolicitacoes);
  document.getElementById('hotelSearch').addEventListener('input', renderHoteis);
  document.getElementById('hotelForm').addEventListener('submit', saveHotel);
  document.getElementById('hotelClear').addEventListener('click', resetHotelForm);
  document.getElementById('alojSearch')?.addEventListener('input', renderAlojamentos);
  document.getElementById('alojForm')?.addEventListener('submit', saveAlojamento);
  document.getElementById('alojClear')?.addEventListener('click', resetAlojamentoForm);
  document.getElementById('reservaForm').addEventListener('submit', saveReserva);
  document.getElementById('saveFinNf').addEventListener('click', saveFinNf);
  document.getElementById('sendToFinanceiro').addEventListener('click', enviarCobrancaFinanceiro);
  document.getElementById('btnAnexarComprovante')?.addEventListener('click', anexarComprovanteFinanceiro);
  document.getElementById('btnAnexarNf')?.addEventListener('click', anexarNotaFiscal);
  document.getElementById('btnEstenderReserva')?.addEventListener('click', estenderReserva);
  document.getElementById('btnSolicitarCheckout')?.addEventListener('click', () => solicitarCheckout('SALVAR'));
  document.getElementById('btnCheckoutPagar')?.addEventListener('click', checkoutPagar);
  document.getElementById('btnCheckoutFinanceiro')?.addEventListener('click', checkoutEnviarFinanceiro);
  document.getElementById('btnAddExtra')?.addEventListener('click', () => addCheckoutExtra());
  document.getElementById('btnPayOk')?.addEventListener('click', () => document.getElementById('payFilesBox')?.classList.remove('adm-hidden-soft'));
  document.getElementById('btnPayRevisar')?.addEventListener('click', () => document.getElementById('payConfirmBox')?.classList.add('adm-hidden-soft'));
  document.getElementById('btnSalvarPagamentoLocal')?.addEventListener('click', salvarPagamentoLocal);
  document.getElementById('btnIncluirReserva')?.addEventListener('click', incluirNaReservaAtual);
  document.getElementById('hospProcessTabs')?.addEventListener('click', (ev) => { const btn = ev.target.closest('[data-process]'); if (btn) setProcess(btn.dataset.process); });
  document.getElementById('markAnalise').addEventListener('click', markAnalise);
  document.getElementById('recusarSolicitacao').addEventListener('click', recusarSolicitacao);
  document.getElementById('modalClose').addEventListener('click', closeModal);
  ['resCheckin','resCheckout'].forEach((id) => document.getElementById(id).addEventListener('input', updateReservaTotals));
  document.getElementById('roomAdd')?.addEventListener('click', addRoomFromDraft);
  document.getElementById('roomList')?.addEventListener('input', updateReservaTotals);
  document.getElementById('roomList')?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-room-remove]');
    if (!btn) return;
    btn.closest('[data-room-row]')?.remove();
    const list = document.getElementById('roomList');
    if (list && !list.querySelector('[data-room-row]')) list.innerHTML = '<div class="adm-room-empty">Nenhum quarto adicionado.</div>';
    updateReservaTotals();
  });
  document.getElementById('occAdd')?.addEventListener('click', addOcupacaoFromDraft);
  document.getElementById('occList')?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-occ-remove]');
    if (!btn) return;
    btn.closest('[data-occ-row]')?.remove();
    const list = document.getElementById('occList');
    if (list && !list.querySelector('[data-occ-row]')) list.innerHTML = '<div class="adm-occ-empty">Nenhum período específico adicionado.</div>';
    setFeedback('occFeedback', '');
  });
  ['roomGenero','roomTipo'].forEach((id) => document.getElementById(id)?.addEventListener('change', () => {
    const diariaEl = document.getElementById('roomDiaria');
    if (diariaEl) diariaEl.value = '';
    atualizarDiariaSugeridaQuarto();
  }));
  document.getElementById('resHotel').addEventListener('change', aplicarDiariaHotelSelecionado);
  document.getElementById('chkHospedesSaem')?.addEventListener('change', () => {
    const saem = new Set(getSelectedMultiValues('chkHospedesSaem'));
    Array.from(document.getElementById('chkHospedesFicam')?.options || []).forEach((opt) => { if (saem.has(opt.value)) opt.selected = false; });
  });
  document.getElementById('reservaModal').addEventListener('click', (ev) => { if (ev.target.id === 'reservaModal') closeModal(); });
  content.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-action]'); if (!btn) return;
    if (btn.dataset.action === 'open') { const row = state.rows.find((r) => r.solicitacao_id === btn.dataset.id); if (row) openModal(row); }
    if (btn.dataset.action === 'open-process') { const row = state.rows.find((r) => r.solicitacao_id === btn.dataset.id); if (row) { openModal(row); configureProcessUI(row, btn.dataset.processTarget || 'config'); } }
    if (btn.dataset.action === 'edit-hotel') { const h = state.hoteis.find((x) => x.id === btn.dataset.id); if (h) fillHotelForm(h); }
    if (btn.dataset.action === 'delete-hotel') deleteHotel(btn.dataset.id);
    if (btn.dataset.action === 'edit-alojamento') { const a = (state.alojamentos || []).find((x) => String(x.id) === String(btn.dataset.id)); if (a) fillAlojamentoForm(a); }
    if (btn.dataset.action === 'delete-alojamento') deleteAlojamento(btn.dataset.id);
  });

  (async function boot(){ await loadHoteis(); await loadAlojamentos(); await loadRows(); setTab(initialTabFromHash()); })();
});
