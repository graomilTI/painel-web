/* assets/js/modules/frotas-multas.js */
(function () {
  const MODULE_NAME = 'FROTAS_MULTAS';

  const state = {
    rows: [],
    arquivos: [],
    loading: false,
    filter: 'abertas',
    search: ''
  };

  function escapeHtml(value = '') {
    return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  }

  function normalizeText(value = '') {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  }

  function money(value) {
    const n = Number(value || 0);
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function dateBR(value) {
    if (!value) return '-';
    const d = new Date(String(value).includes('T') ? value : `${value}T00:00:00`);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('pt-BR');
  }

  function statusLabel(row) {
    return row.status_multa || row.situacao || 'A PAGAR';
  }

  function toast(message, type = 'ok') {
    let el = document.querySelector('.fleet-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'fleet-toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.toggle('error', type === 'error');
    el.classList.add('show');
    window.clearTimeout(el._timer);
    el._timer = window.setTimeout(() => el.classList.remove('show'), 2800);
  }

  function ensureStyles() {
    if (document.getElementById('frotas-multas-module-style')) return;
    const style = document.createElement('style');
    style.id = 'frotas-multas-module-style';
    style.textContent = `
      .fleet-page{color:#e5e7eb}.fleet-head{margin-bottom:18px}.fleet-kicker{display:inline-flex;color:#86efac;font-size:12px;font-weight:950;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px}.fleet-title{margin:0;color:#f8fafc;font-size:clamp(24px,2.4vw,34px);letter-spacing:-.04em}.fleet-sub{max-width:880px;margin:10px 0 0;color:#9ca3af;line-height:1.55}.fleet-card{background:radial-gradient(circle at top left,rgba(34,197,94,.12),transparent 34%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));border:1px solid rgba(148,163,184,.16);border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.28)}.fleet-tabs{display:flex;gap:10px;flex-wrap:wrap;padding:14px;border-bottom:1px solid rgba(148,163,184,.12);background:rgba(2,6,23,.36)}.fleet-tab{appearance:none;border:1px solid rgba(148,163,184,.16);background:rgba(15,23,42,.72);color:#cbd5e1;border-radius:999px;padding:10px 14px;font-weight:950;font-size:13px;cursor:pointer}.fleet-tab.active,.fleet-tab:hover{color:#f8fafc;border-color:rgba(34,197,94,.55);background:rgba(22,101,52,.35)}.fleet-body{padding:18px}.fleet-tools{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}.fleet-input,.fleet-select{border:1px solid rgba(148,163,184,.18);background:#0f172a;color:#e5e7eb;border-radius:14px;padding:12px 13px;outline:none;color-scheme:dark}.fleet-input{min-width:min(360px,100%)}.fleet-select option{background:#0f172a;color:#e5e7eb}.fleet-btn{border:1px solid rgba(34,197,94,.24);background:rgba(34,197,94,.12);color:#86efac;border-radius:14px;padding:12px 14px;font-weight:950;cursor:pointer}.fleet-btn:hover{background:rgba(22,101,52,.28)}.fleet-kpis{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px;margin:14px 0}.fleet-kpi{border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.34);border-radius:18px;padding:14px}.fleet-kpi span{display:block;color:#93c5fd;font-size:11px;font-weight:950;letter-spacing:.10em;text-transform:uppercase}.fleet-kpi strong{display:block;color:#f8fafc;font-size:22px;margin-top:8px}.fleet-table-wrap{overflow:auto;border:1px solid rgba(148,163,184,.12);border-radius:18px}.fleet-table{width:100%;border-collapse:collapse;min-width:1040px;background:rgba(15,23,42,.54)}.fleet-table th{color:#bfdbfe;font-size:11px;letter-spacing:.12em;text-transform:uppercase;text-align:left;padding:12px;border-bottom:1px solid rgba(148,163,184,.16)}.fleet-table td{padding:12px;border-bottom:1px solid rgba(148,163,184,.08);color:#dbeafe;font-size:13px;vertical-align:top}.fleet-table tr:hover td{background:rgba(22,101,52,.10)}.fleet-muted{color:#94a3b8;font-size:12px}.fleet-badge{display:inline-flex;border:1px solid rgba(34,197,94,.22);background:rgba(34,197,94,.12);border-radius:999px;padding:4px 8px;color:#bbf7d0;font-size:11px;font-weight:900}.fleet-badge.warn{border-color:rgba(245,158,11,.32);background:rgba(245,158,11,.10);color:#fde68a}.fleet-actions{display:flex;gap:8px;flex-wrap:wrap}.fleet-action{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.85);color:#e5e7eb;border-radius:10px;padding:8px 10px;font-size:12px;font-weight:900;cursor:pointer}.fleet-note{margin-top:14px;border:1px dashed rgba(34,197,94,.28);background:rgba(22,101,52,.10);border-radius:16px;padding:12px;color:#cbd5e1;font-size:12px;line-height:1.45}.fleet-toast{position:fixed;right:22px;bottom:22px;background:rgba(22,101,52,.96);color:#dcfce7;border:1px solid rgba(134,239,172,.32);border-radius:16px;padding:12px 14px;font-weight:900;box-shadow:0 16px 45px rgba(0,0,0,.35);z-index:99999;opacity:0;transform:translateY(10px);pointer-events:none;transition:.2s ease}.fleet-toast.error{background:rgba(127,29,29,.96);color:#fee2e2;border-color:rgba(252,165,165,.35)}.fleet-toast.show{opacity:1;transform:translateY(0)}@media(max-width:980px){.fleet-kpis{grid-template-columns:1fr 1fr}}@media(max-width:580px){.fleet-kpis{grid-template-columns:1fr}.fleet-tools{display:grid}.fleet-input{min-width:0;width:100%}}
    `;
    document.head.appendChild(style);
  }

  function filteredRows() {
    const q = normalizeText(state.search);
    return state.rows.filter((row) => {
      const status = normalizeText(statusLabel(row));
      const podeIndicar = normalizeText(row.pode_indicar_condutor || row.indicar_condutor_msg || '').includes('SIM') || row.pode_indicar_condutor === true;
      const vencida = row.data_limite_defesa ? new Date(row.data_limite_defesa) < new Date() : status.includes('VENC');
      if (state.filter === 'vencidas' && !vencida) return false;
      if (state.filter === 'indicar' && !podeIndicar) return false;
      if (state.filter === 'abertas' && (status.includes('PAGA') || status.includes('CANCEL'))) return false;
      if (q) {
        const hay = normalizeText([row.placa, row.empresa, row.motorista, row.numero_auto_infracao, row.auto, row.renavam, row.descricao, row.local].join(' '));
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function buildMessage(row) {
    return [
      `Olá${row.motorista ? `, ${row.motorista}` : ''}.`,
      '',
      'Foi identificada uma multa vinculada ao veículo da empresa:',
      `Placa: ${row.placa || '-'}`,
      `Data da infração: ${dateBR(row.data_infracao)}`,
      `Infração: ${row.descricao || '-'}`,
      `Local: ${row.local || '-'}`,
      `Auto: ${row.numero_auto_infracao || row.auto || '-'}`,
      `Valor: ${money(row.valor_original)}`,
      '',
      'Por gentileza, retorne com as informações necessárias para conferência/indicação do condutor.'
    ].join('\n');
  }

  function renderTable(root) {
    const rows = filteredRows();
    const table = root.querySelector('[data-multas-table]');
    const count = root.querySelector('[data-multas-count]');
    if (count) count.textContent = `${rows.length} multa(s) encontrada(s)`;
    if (!table) return;
    if (!rows.length) {
      table.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:28px;color:#f8fafc;font-weight:900">Nenhuma multa encontrada para o filtro selecionado.</td></tr>`;
      return;
    }
    table.innerHTML = rows.map((row) => {
      const status = statusLabel(row);
      const arquivo = state.arquivos.find((a) => a.multa_id === row.id || (a.cod_auto && a.cod_auto === row.cod_auto));
      return `<tr>
        <td><strong>${escapeHtml(row.placa || '-')}</strong><div class="fleet-muted">${escapeHtml(row.empresa || row.renavam || '')}</div></td>
        <td>${dateBR(row.data_infracao)}<div class="fleet-muted">${escapeHtml(row.hora || '')}</div></td>
        <td>${escapeHtml(row.motorista || '-')}</td>
        <td>${escapeHtml(row.descricao || '-')}<div class="fleet-muted">${escapeHtml(row.local || '')}</div></td>
        <td>${escapeHtml(row.numero_auto_infracao || row.auto || row.cod_auto || '-')}</td>
        <td><strong>${money(row.valor_original)}</strong></td>
        <td><span class="fleet-badge ${normalizeText(status).includes('VENC') ? 'warn' : ''}">${escapeHtml(status)}</span>${arquivo?.arquivo_pdf_url ? `<div class="fleet-muted"><a href="${escapeHtml(arquivo.arquivo_pdf_url)}" target="_blank" style="color:#86efac;font-weight:900">PDF</a></div>` : ''}</td>
        <td><div class="fleet-actions"><button class="fleet-action" type="button" data-copy-multa="${row.id}">Copiar msg</button><button class="fleet-action" type="button" data-mark-indicar="${row.id}">Indicar</button><button class="fleet-action" type="button" data-mark-dobrar="${row.id}">Dobrar</button></div></td>
      </tr>`;
    }).join('');

    table.querySelectorAll('[data-copy-multa]').forEach((btn) => btn.addEventListener('click', async () => {
      const row = state.rows.find((r) => r.id === btn.getAttribute('data-copy-multa'));
      if (!row) return;
      const msg = buildMessage(row);
      try { await navigator.clipboard.writeText(msg); toast('Mensagem da multa copiada.'); }
      catch { toast('Não foi possível copiar automaticamente.', 'error'); }
    }));

    table.querySelectorAll('[data-mark-indicar]').forEach((btn) => btn.addEventListener('click', () => updateStatus(root, btn.getAttribute('data-mark-indicar'), { status_multa: 'EM INDICACAO' })));
    table.querySelectorAll('[data-mark-dobrar]').forEach((btn) => btn.addEventListener('click', () => updateStatus(root, btn.getAttribute('data-mark-dobrar'), { status_multa: 'DOBRAR' })));
  }

  function renderKpis(root) {
    const rows = filteredRows();
    const vencidas = rows.filter((r) => r.data_limite_defesa ? new Date(r.data_limite_defesa) < new Date() : normalizeText(statusLabel(r)).includes('VENC')).length;
    const abertas = rows.filter((r) => !normalizeText(statusLabel(r)).includes('PAGA')).length;
    const valor = rows.reduce((sum, r) => sum + Number(r.valor_original || 0), 0);
    const guias = state.arquivos.length;
    const map = { abertas, vencidas, valor: money(valor), guias };
    Object.entries(map).forEach(([key, value]) => {
      const el = root.querySelector(`[data-kpi="${key}"]`);
      if (el) el.textContent = value;
    });
  }

  async function updateStatus(root, id, payload) {
    const supabase = root._opts?.supabase;
    if (!supabase || !id) return toast('Supabase não disponível.', 'error');
    const { error } = await supabase.from('frotas_multas').update({ ...payload, atualizado_em: new Date().toISOString() }).eq('id', id);
    if (error) return toast(error.message || 'Erro ao atualizar multa.', 'error');
    const row = state.rows.find((r) => r.id === id);
    if (row) Object.assign(row, payload);
    renderKpis(root); renderTable(root); toast('Status atualizado.');
  }

  async function fetchRows(root, opts = {}) {
    const supabase = opts.supabase;
    if (!supabase) return;
    state.loading = true;
    const count = root.querySelector('[data-multas-count]');
    if (count) count.textContent = 'Carregando multas...';
    try {
      const { data, error } = await supabase.from('frotas_multas').select('*').order('data_infracao', { ascending: false }).limit(800);
      if (error) throw error;
      state.rows = Array.isArray(data) ? data : [];
      const { data: arquivos } = await supabase.from('frotas_multas_arquivos').select('*').order('criado_em', { ascending: false }).limit(1000);
      state.arquivos = Array.isArray(arquivos) ? arquivos : [];
      renderKpis(root); renderTable(root);
    } catch (err) {
      console.error('[FROTAS_MULTAS] fetchRows:', err);
      if (count) count.textContent = 'Erro ao carregar multas.';
      toast('Não foi possível carregar frotas_multas. Confira se o SQL foi executado.', 'error');
      renderKpis(root); renderTable(root);
    } finally { state.loading = false; }
  }

  function openHome(container, opts = {}) {
    ensureStyles();
    container._opts = opts;
    container.innerHTML = `<section class="fleet-page">
      <div class="fleet-head"><div class="fleet-kicker">Frotas · Notificações</div><h1 class="fleet-title">Multas</h1><p class="fleet-sub">Base migrada do Apps Script para o painel: consulta, conferência, indicação/dobra, mensagem e acompanhamento de guias/PDFs.</p></div>
      <div class="fleet-card">
        <div class="fleet-tabs"><button class="fleet-tab" type="button" data-open-excesso>Excesso de Velocidade</button><button class="fleet-tab active" type="button">Multas</button></div>
        <div class="fleet-body">
          <div class="fleet-tools"><select class="fleet-select" data-filter><option value="abertas">Abertas / a pagar</option><option value="vencidas">Vencidas</option><option value="indicar">Pode indicar condutor</option><option value="todas">Todas</option></select><input class="fleet-input" data-search placeholder="Buscar por placa, motorista, auto, renavam, empresa..."><button class="fleet-btn" type="button" data-refresh>Atualizar</button></div>
          <div class="fleet-kpis"><div class="fleet-kpi"><span>Abertas</span><strong data-kpi="abertas">0</strong></div><div class="fleet-kpi"><span>Vencidas</span><strong data-kpi="vencidas">0</strong></div><div class="fleet-kpi"><span>Valor filtrado</span><strong data-kpi="valor">R$ 0,00</strong></div><div class="fleet-kpi"><span>Guias/PDFs</span><strong data-kpi="guias">0</strong></div></div>
          <p class="fleet-muted" data-multas-count>Carregando multas...</p>
          <div class="fleet-table-wrap"><table class="fleet-table"><thead><tr><th>Placa / Empresa</th><th>Data</th><th>Motorista</th><th>Descrição / Local</th><th>Auto</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead><tbody data-multas-table></tbody></table></div>
          <div class="fleet-note"><strong>Observação:</strong> tokens e integrações devem ser gerenciados em <strong>TI &gt; Integrações</strong>. O frontend consulta a base do painel; as chamadas diretas ao DETRAN/BotConversa devem passar por Edge Function/Worker.</div>
        </div>
      </div>
    </section>`;

    container.querySelector('[data-open-excesso]')?.addEventListener('click', () => window.location.assign('./frotas.html'));
    container.querySelector('[data-refresh]')?.addEventListener('click', () => fetchRows(container, opts));
    container.querySelector('[data-filter]')?.addEventListener('change', (ev) => { state.filter = ev.target.value || 'abertas'; renderKpis(container); renderTable(container); });
    container.querySelector('[data-search]')?.addEventListener('input', (ev) => { state.search = ev.target.value || ''; renderKpis(container); renderTable(container); });
    fetchRows(container, opts);
  }

  window[MODULE_NAME] = window[MODULE_NAME] || {};
  window[MODULE_NAME].openHome = openHome;
})();
