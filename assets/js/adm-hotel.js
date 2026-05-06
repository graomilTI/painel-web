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
    .adm-hosp-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.adm-hosp-field{display:flex;flex-direction:column;gap:7px}.adm-hosp-field.full{grid-column:1/-1}.adm-hosp-field label{font-size:13px;color:#cbd5e1;font-weight:800}.adm-hosp-field input,.adm-hosp-field textarea,.adm-hosp-field select{width:100%;border:1px solid #334155;background:#0b1220;color:var(--text);border-radius:14px;padding:12px 13px;outline:none;color-scheme:dark}.adm-hosp-field textarea{resize:vertical;min-height:76px}.adm-hosp-field input:focus,.adm-hosp-field textarea:focus,.adm-hosp-field select:focus{border-color:var(--green-2);box-shadow:0 0 0 3px rgba(111,208,165,.12)}.adm-hosp-form-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:16px}.adm-hosp-feedback{color:var(--muted);font-size:13px}.adm-hosp-danger{border-color:rgba(220,38,38,.32)!important;background:rgba(127,29,29,.45)!important;color:#fecaca!important}.adm-hosp-danger:hover{background:rgba(185,28,28,.55)!important;color:#fff!important}.adm-hosp-feedback.ok{color:#bbf7d0}.adm-hosp-feedback.err{color:#fecaca}.adm-hosp-modal{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(2,6,23,.75);backdrop-filter:blur(6px)}.adm-hosp-modal.open{display:flex}.adm-hosp-modal-card{width:min(980px,100%);max-height:92vh;overflow:auto;background:#081611;border:1px solid var(--line-2);border-radius:24px;box-shadow:var(--shadow);padding:20px}.adm-hosp-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:16px}.adm-hosp-modal-head h3{margin:0}.adm-hosp-muted{color:var(--muted);font-size:13px}.adm-hosp-filters{display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:12px;align-items:end;margin-bottom:14px}.adm-hosp-empty{padding:18px;text-align:center;color:var(--muted)}.adm-hosp-kpi-alert{color:#fecaca}.adm-hosp-kpi-warn{color:#fde68a}.adm-hosp-kpi-good{color:#bbf7d0}.adm-hosp-row-note{display:block;color:var(--muted);font-size:12px;margin-top:3px}.adm-hosp-colab-list{display:grid;gap:7px}.adm-hosp-colab-item{display:grid;gap:2px;line-height:1.15}.adm-hosp-colab-name{font-weight:800;color:var(--text)}.adm-hosp-colab-regional{font-size:12px;color:#9ca3af}.adm-hosp-card-line{display:grid;gap:8px}.adm-hosp-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px}.adm-hosp-search{min-width:260px;border:1px solid #334155;background:#0b1220;color:var(--text);border-radius:14px;padding:12px 13px;color-scheme:dark}.adm-hosp-select-hint{margin-top:6px;font-size:12px;color:#93c5fd}.adm-hosp-select-hint.warn{color:#fde68a}.adm-room-wrap{grid-column:1/-1;border:1px solid var(--line);border-radius:18px;background:rgba(15,23,42,.34);padding:14px}.adm-room-title{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px}.adm-room-title strong{display:block;color:#e5e7eb}.adm-room-title span{display:block;color:#9ca3af;font-size:12px;margin-top:3px}.adm-room-grid{display:grid;grid-template-columns:1.15fr 1fr .7fr 1fr 1fr;gap:8px;align-items:center}.adm-room-head{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:900}.adm-room-label{font-weight:800;color:#e5e7eb}.adm-room-chip{display:inline-flex;border:1px solid rgba(111,208,165,.22);background:rgba(22,101,52,.16);color:#dcfce7;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:900}.adm-room-grid input{border:1px solid #334155;background:#0b1220;color:var(--text);border-radius:12px;padding:10px 11px;outline:none;color-scheme:dark}.adm-room-subtotal{font-weight:900;color:#bbf7d0}.adm-room-summary{margin-top:10px;color:#fde68a;font-size:12px;font-weight:800}.adm-hidden{display:none!important}
    @media(max-width:900px){.adm-hosp-form,.adm-hosp-filters{grid-template-columns:1fr}.adm-hosp-search{min-width:0;width:100%}}
  `;
  document.head.appendChild(style);
}

initProtectedPage('Módulo Hospedagem', (content, userContext) => {
  injectStyles();
  const state = { rows: [], resumo: {}, hoteis: [], editingHotel: null, tab: 'painel', selected: null };
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

    <div id="reservaModal" class="adm-hosp-modal">
      <div class="adm-hosp-modal-card">
        <div class="adm-hosp-modal-head"><div><h3 id="modalTitle">Reserva</h3><p class="muted" id="modalSub">Transforme a solicitação em reserva e acompanhe financeiro/NF.</p></div><button class="btn btn-secondary adm-hosp-btn" type="button" id="modalClose">Fechar</button></div>
        <form id="reservaForm" class="adm-hosp-form">
          <div class="adm-hosp-field full"><label>Solicitação</label><input id="resInfo" readonly /></div>
          <div class="adm-hosp-field"><label>Hotel recomendado *</label><select id="resHotel"></select><span id="resHotelHint" class="adm-hosp-select-hint"></span></div>
          <div class="adm-hosp-field"><label>Nome do hotel manual</label><input id="resHotelNome" placeholder="Use caso ainda não esteja cadastrado" /></div>
          <div class="adm-hosp-field"><label>Check-in *</label><input id="resCheckin" type="date" required /></div>
          <div class="adm-hosp-field"><label>Check-out *</label><input id="resCheckout" type="date" required /></div>
          <div class="adm-hosp-field"><label>Diárias</label><input id="resDiarias" readonly /></div>
          <div class="adm-hosp-field"><label>Total previsto</label><input id="resTotal" readonly /></div>
          <div class="adm-room-wrap">
            <div class="adm-room-title"><div><strong>Composição dos quartos</strong><span>Mulheres e homens devem ficar em quartos separados. Ex.: 1 feminino individual + 1 masculino duplo.</span></div><span class="adm-room-chip">Separado por gênero</span></div>
            <div class="adm-room-grid">
              <div class="adm-room-head">Grupo</div><div class="adm-room-head">Tipo</div><div class="adm-room-head">Qtd.</div><div class="adm-room-head">Diária</div><div class="adm-room-head">Subtotal/dia</div>
              <div class="adm-room-label">Feminino</div><div>Individual</div><input id="room_FEMININO_INDIVIDUAL_qtd" type="number" min="0" step="1" value="0" data-room-qtd data-room-key="FEMININO_INDIVIDUAL" /><input id="room_FEMININO_INDIVIDUAL_diaria" type="number" min="0" step="0.01" value="0" data-room-diaria data-room-key="FEMININO_INDIVIDUAL" /><div class="adm-room-subtotal" id="room_FEMININO_INDIVIDUAL_sub">R$ 0,00</div>
              <div class="adm-room-label">Feminino</div><div>Duplo</div><input id="room_FEMININO_DUPLO_qtd" type="number" min="0" step="1" value="0" data-room-qtd data-room-key="FEMININO_DUPLO" /><input id="room_FEMININO_DUPLO_diaria" type="number" min="0" step="0.01" value="0" data-room-diaria data-room-key="FEMININO_DUPLO" /><div class="adm-room-subtotal" id="room_FEMININO_DUPLO_sub">R$ 0,00</div>
              <div class="adm-room-label">Feminino</div><div>Triplo</div><input id="room_FEMININO_TRIPLO_qtd" type="number" min="0" step="1" value="0" data-room-qtd data-room-key="FEMININO_TRIPLO" /><input id="room_FEMININO_TRIPLO_diaria" type="number" min="0" step="0.01" value="0" data-room-diaria data-room-key="FEMININO_TRIPLO" /><div class="adm-room-subtotal" id="room_FEMININO_TRIPLO_sub">R$ 0,00</div>
              <div class="adm-room-label">Feminino</div><div>Quádruplo</div><input id="room_FEMININO_QUADRUPLO_qtd" type="number" min="0" step="1" value="0" data-room-qtd data-room-key="FEMININO_QUADRUPLO" /><input id="room_FEMININO_QUADRUPLO_diaria" type="number" min="0" step="0.01" value="0" data-room-diaria data-room-key="FEMININO_QUADRUPLO" /><div class="adm-room-subtotal" id="room_FEMININO_QUADRUPLO_sub">R$ 0,00</div>
              <div class="adm-room-label">Masculino</div><div>Individual</div><input id="room_MASCULINO_INDIVIDUAL_qtd" type="number" min="0" step="1" value="0" data-room-qtd data-room-key="MASCULINO_INDIVIDUAL" /><input id="room_MASCULINO_INDIVIDUAL_diaria" type="number" min="0" step="0.01" value="0" data-room-diaria data-room-key="MASCULINO_INDIVIDUAL" /><div class="adm-room-subtotal" id="room_MASCULINO_INDIVIDUAL_sub">R$ 0,00</div>
              <div class="adm-room-label">Masculino</div><div>Duplo</div><input id="room_MASCULINO_DUPLO_qtd" type="number" min="0" step="1" value="0" data-room-qtd data-room-key="MASCULINO_DUPLO" /><input id="room_MASCULINO_DUPLO_diaria" type="number" min="0" step="0.01" value="0" data-room-diaria data-room-key="MASCULINO_DUPLO" /><div class="adm-room-subtotal" id="room_MASCULINO_DUPLO_sub">R$ 0,00</div>
              <div class="adm-room-label">Masculino</div><div>Triplo</div><input id="room_MASCULINO_TRIPLO_qtd" type="number" min="0" step="1" value="0" data-room-qtd data-room-key="MASCULINO_TRIPLO" /><input id="room_MASCULINO_TRIPLO_diaria" type="number" min="0" step="0.01" value="0" data-room-diaria data-room-key="MASCULINO_TRIPLO" /><div class="adm-room-subtotal" id="room_MASCULINO_TRIPLO_sub">R$ 0,00</div>
              <div class="adm-room-label">Masculino</div><div>Quádruplo</div><input id="room_MASCULINO_QUADRUPLO_qtd" type="number" min="0" step="1" value="0" data-room-qtd data-room-key="MASCULINO_QUADRUPLO" /><input id="room_MASCULINO_QUADRUPLO_diaria" type="number" min="0" step="0.01" value="0" data-room-diaria data-room-key="MASCULINO_QUADRUPLO" /><div class="adm-room-subtotal" id="room_MASCULINO_QUADRUPLO_sub">R$ 0,00</div>
            </div>
            <div class="adm-room-summary" id="roomSummary">Informe a quantidade de quartos e o valor da diária.</div>
          </div>
          <input id="resDiaria" class="adm-hidden" type="number" step="0.01" min="0" />
          <input id="resQuartos" class="adm-hidden" type="number" min="1" value="1" />
          <select id="resTipo" class="adm-hidden"><option value="OUTRO">Outro</option><option value="INDIVIDUAL">Individual</option><option value="DUPLO">Duplo</option><option value="TRIPLO">Triplo</option><option value="QUADRUPLO">Quádruplo</option></select>
          <div class="adm-hosp-field"><label>Confirmado com</label><input id="resConfirmado" /></div>
          <div class="adm-hosp-field"><label>Contato confirmação</label><input id="resContato" /></div>
          <div class="adm-hosp-field"><label>Status hospedagem</label><select id="resStatus"><option value="CHECKIN_PREVISTO">Check-in previsto</option><option value="HOSPEDADO">Hospedado</option><option value="CHECKOUT_HOJE">Checkout hoje</option><option value="RENOVACAO_NECESSARIA">Renovação necessária</option><option value="CHECKOUT_REALIZADO">Checkout realizado</option><option value="CANCELADA">Cancelada</option></select></div>
          <div class="adm-hosp-field full"><label>Observação hospedagem</label><textarea id="resObs"></textarea></div>
        </form>
        <div class="adm-hosp-form-actions"><button class="btn btn-primary adm-hosp-btn" type="submit" form="reservaForm" id="resSave">Salvar reserva</button><button class="btn btn-secondary adm-hosp-btn" type="button" id="markAnalise">Marcar em análise</button><button class="btn btn-secondary adm-hosp-btn adm-hosp-danger" type="button" id="recusarSolicitacao">Recusar solicitação</button><span id="resFeedback" class="adm-hosp-feedback"></span></div>

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
          <div class="adm-hosp-form-actions"><button class="btn btn-secondary adm-hosp-btn" type="button" id="saveFinNf">Salvar financeiro/NF</button><button class="btn btn-primary adm-hosp-btn" type="button" id="sendToFinanceiro">Enviar cobrança ao financeiro</button><span id="finNfFeedback" class="adm-hosp-feedback"></span></div>
        </div>
      </div>
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

  function getComposicaoFromForm() {
    const comp = emptyComposicaoQuartos();
    ROOM_KEYS.forEach((item) => {
      comp[item.key] = {
        qtd: Math.max(0, Math.floor(Number(document.getElementById(`room_${item.key}_qtd`)?.value || 0))),
        diaria: Math.max(0, Number(document.getElementById(`room_${item.key}_diaria`)?.value || 0))
      };
    });
    return comp;
  }

  function setComposicaoForm(comp = {}) {
    const normalized = { ...emptyComposicaoQuartos(), ...(comp || {}) };
    ROOM_KEYS.forEach((item) => {
      const qtdEl = document.getElementById(`room_${item.key}_qtd`);
      const diariaEl = document.getElementById(`room_${item.key}_diaria`);
      if (qtdEl) qtdEl.value = Number(normalized[item.key]?.qtd || 0);
      if (diariaEl) diariaEl.value = Number(normalized[item.key]?.diaria || 0);
    });
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
    ROOM_KEYS.forEach((item) => {
      const diariaEl = document.getElementById(`room_${item.key}_diaria`);
      if (!diariaEl) return;
      const diaria = getHotelDiariaPorTipo(hotel, item.tipo);
      if (diaria && (substituir || !Number(diariaEl.value || 0))) diariaEl.value = diaria;
    });
    updateReservaTotals();
  }

  function extrairComposicaoObservacao(value) {
    const text = String(value || '');
    const match = text.match(/\[COMPOSICAO_QUARTOS\]([\s\S]*?)\[\/COMPOSICAO_QUARTOS\]/);
    if (!match) return { observacao: text, composicao: null };
    try {
      return {
        observacao: text.replace(match[0], '').trim(),
        composicao: { ...emptyComposicaoQuartos(), ...JSON.parse(match[1]) }
      };
    } catch (err) {
      return { observacao: text.replace(match[0], '').trim(), composicao: null };
    }
  }

  function montarObservacaoComComposicao(observacao, comp) {
    const resumo = formatComposicaoResumo(comp);
    const bloco = `[COMPOSICAO_QUARTOS]${JSON.stringify(comp)}[/COMPOSICAO_QUARTOS]`;
    return [String(observacao || '').trim(), resumo ? `Composição dos quartos: ${resumo}` : '', bloco].filter(Boolean).join('\n');
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
    state.rows = await enrichRowsWithColaboradores(data || []);
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
        <td><div class="adm-hosp-actions"><button class="btn btn-secondary adm-hosp-small" data-action="open" data-id="${esc(r.solicitacao_id)}" type="button">Abrir</button></div></td>
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
    document.getElementById('resStatus').value = row.status_hospedagem || 'CHECKIN_PREVISTO';
    document.getElementById('resHotelNome').value = row.hotel || '';
    fillHotelSelect(row);
    const obsData = extrairComposicaoObservacao(row.observacao_hospedagem || '');
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
    ROOM_KEYS.forEach((item) => {
      const sub = document.getElementById(`room_${item.key}_sub`);
      if (sub) sub.textContent = money(Number(comp[item.key]?.qtd || 0) * Number(comp[item.key]?.diaria || 0));
    });
    document.getElementById('resDiarias').value = dias;
    document.getElementById('resTotal').value = money(total);
    document.getElementById('resQuartos').value = Math.max(1, calc.quartos || 1);
    document.getElementById('resDiaria').value = calc.quartos ? (calc.totalDia / calc.quartos).toFixed(2) : '';
    document.getElementById('resTipo').value = 'OUTRO';
    const resumo = formatComposicaoResumo(comp);
    const summary = document.getElementById('roomSummary');
    if (summary) summary.textContent = resumo ? `${calc.quartos} quarto(s) · ${money(calc.totalDia)} por dia · Total ${money(total)} · ${resumo}` : 'Informe a quantidade de quartos e o valor da diária.';

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
      confirmado_com: document.getElementById('resConfirmado').value.trim() || null, contato_confirmacao: document.getElementById('resContato').value.trim() || null, status_hospedagem: document.getElementById('resStatus').value,
      observacao_hospedagem: montarObservacaoComComposicao(document.getElementById('resObs').value, composicao), atualizado_por: userContext?.user?.id || null
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
  document.getElementById('sendToFinanceiro').addEventListener('click', enviarCobrancaFinanceiro);
  document.getElementById('markAnalise').addEventListener('click', markAnalise);
  document.getElementById('recusarSolicitacao').addEventListener('click', recusarSolicitacao);
  document.getElementById('modalClose').addEventListener('click', closeModal);
  ['resCheckin','resCheckout'].forEach((id) => document.getElementById(id).addEventListener('input', updateReservaTotals));
  document.querySelectorAll('[data-room-qtd],[data-room-diaria]').forEach((el) => el.addEventListener('input', updateReservaTotals));
  document.getElementById('resHotel').addEventListener('change', aplicarDiariaHotelSelecionado);
  document.getElementById('reservaModal').addEventListener('click', (ev) => { if (ev.target.id === 'reservaModal') closeModal(); });
  content.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-action]'); if (!btn) return;
    if (btn.dataset.action === 'open') { const row = state.rows.find((r) => r.solicitacao_id === btn.dataset.id); if (row) openModal(row); }
    if (btn.dataset.action === 'edit-hotel') { const h = state.hoteis.find((x) => x.id === btn.dataset.id); if (h) fillHotelForm(h); }
    if (btn.dataset.action === 'delete-hotel') deleteHotel(btn.dataset.id);
  });

  (async function boot(){ await loadHoteis(); await loadRows(); })();
});
