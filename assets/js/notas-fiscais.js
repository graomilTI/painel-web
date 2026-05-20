import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const state = {
  inicio: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  fim: new Date().toISOString().slice(0, 10),
  rows: [],
  kpiRows: [],
  kpiFilter: 'pendentes',
  tab: 'resumo'
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function brDate(value) {
  if (!value) return '-';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(value);
}

function isUrl(v) {
  return /^https?:\/\//i.test(String(v || ''));
}

initProtectedPage('Notas Fiscais', (content) => {
  content.innerHTML = `
    <style>
      .nf-wrap{display:grid;gap:18px}
      .nf-hero{border:1px solid rgba(148,163,184,.18);border-radius:24px;padding:22px;background:linear-gradient(135deg,rgba(15,23,42,.96),rgba(22,101,52,.22));box-shadow:0 20px 50px rgba(2,6,23,.22)}
      .nf-hero h2{margin:0 0 6px;color:#f8fafc;font-size:28px}.nf-hero p{margin:0;color:#6b7280}
      .nf-card{border:1px solid rgba(148,163,184,.16);border-radius:22px;background:rgba(15,23,42,.82);padding:18px}
      .nf-tabs{display:flex;gap:8px;flex-wrap:wrap}
      .nf-tab{border:1px solid rgba(148,163,184,.18);border-radius:999px;padding:9px 18px;background:rgba(15,23,42,.6);color:#94a3b8;cursor:pointer;font-weight:700;font-size:13px}
      .nf-tab.active{background:rgba(22,101,52,.28);color:#bbf7d0;border-color:rgba(111,208,165,.3)}
      .nf-panel{display:none}.nf-panel.active{display:grid;gap:18px}
      .nf-filter{display:grid;grid-template-columns:repeat(3,minmax(160px,1fr));gap:12px;align-items:end}
      .nf-field{display:grid;gap:6px}.nf-field label{font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em}
      .nf-field input,.nf-field select{border:1px solid rgba(148,163,184,.22);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:10px 12px;color-scheme:dark}
      .nf-kpis{display:grid;grid-template-columns:repeat(3,minmax(150px,1fr));gap:12px}
      .nf-kpi{border:1px solid rgba(148,163,184,.14);border-radius:18px;padding:14px;background:rgba(2,6,23,.36)}
      .nf-kpi span{display:block;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
      .nf-kpi strong{display:block;margin-top:6px;color:#f8fafc;font-size:20px}
      .nf-table-wrap{overflow:auto;border-radius:18px;border:1px solid rgba(148,163,184,.14)}
      .nf-table{width:100%;border-collapse:collapse;min-width:760px}
      .nf-table th,.nf-table td{padding:12px;border-bottom:1px solid rgba(148,163,184,.12);text-align:left;color:#e2e2f0;vertical-align:top}
      .nf-table th{background:rgba(15,23,42,.96);color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.06em}
      .nf-empty{text-align:center;color:#6b7280;padding:24px!important}
      .nf-act{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
      .nf-act .btn{padding:6px 12px!important;font-size:12px!important;white-space:nowrap}
      .nf-badge{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700}
      .nf-badge.lancado{background:rgba(22,101,52,.22);color:#bbf7d0;border:1px solid rgba(22,101,52,.34)}
      .nf-badge.pendente{background:rgba(245,158,11,.1);color:#fde68a;border:1px solid rgba(245,158,11,.24)}
      .nf-filter-tabs{display:flex;gap:8px}
      .nf-filter-tab{border:1px solid rgba(148,163,184,.18);border-radius:999px;padding:7px 14px;background:rgba(15,23,42,.6);color:#94a3b8;cursor:pointer;font-weight:600;font-size:12px}
      .nf-filter-tab.active{background:rgba(22,101,52,.24);color:#bbf7d0;border-color:rgba(111,208,165,.28)}
      /* modal */
      .nf-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;align-items:center;justify-content:center;padding:16px}
      .nf-modal.open{display:flex}
      .nf-modal-card{background:#0f172a;border:1px solid rgba(148,163,184,.18);border-radius:24px;padding:24px;max-width:640px;width:100%;max-height:88vh;overflow-y:auto}
      .nf-modal-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px}
      .nf-modal-full{grid-column:1/-1}
      .nf-modal-label{font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}
      .nf-modal-value{color:#e2e2f0;font-size:14px}
      @media(max-width:760px){.nf-filter,.nf-kpis,.nf-modal-grid{grid-template-columns:1fr}.nf-modal-full{grid-column:1}}
    </style>

    <section class="nf-wrap">
      <div class="nf-hero">
        <h2>Notas Fiscais</h2>
        <p>Controle de emissão e lançamento de NFs por regional. Gerencie os KPIs de compras que aguardam lançamento contábil.</p>
      </div>

      <div class="nf-tabs">
        <button class="nf-tab active" data-tab="resumo" type="button">Resumo Financeiro</button>
        <button class="nf-tab" data-tab="kpis" type="button">KPIs de Compras</button>
      </div>

      <!-- PAINEL RESUMO -->
      <div class="nf-panel active" id="nfPanelResumo">
        <article class="nf-card">
          <form class="nf-filter" id="nfFilterForm">
            <div class="nf-field"><label>Data inicial</label><input id="nfInicio" type="date" value="${esc(state.inicio)}"></div>
            <div class="nf-field"><label>Data final</label><input id="nfFim" type="date" value="${esc(state.fim)}"></div>
            <div class="nf-field"><label>&nbsp;</label><button class="btn btn-primary" type="submit">Atualizar</button></div>
          </form>
        </article>
        <div class="nf-kpis">
          <div class="nf-kpi"><span>Registros</span><strong id="nfKpiRegistros">0</strong></div>
          <div class="nf-kpi"><span>Total pago</span><strong id="nfKpiTotal">R$ 0,00</strong></div>
          <div class="nf-kpi"><span>Regionais</span><strong id="nfKpiRegionais">0</strong></div>
        </div>
        <article class="nf-card">
          <div class="nf-table-wrap">
            <table class="nf-table">
              <thead><tr><th>Data pagamento</th><th>Regional</th><th>Destino</th><th>Quantidade</th><th>Valor total</th><th>Origem</th></tr></thead>
              <tbody id="nfTbody"><tr><td colspan="6" class="nf-empty">Carregando...</td></tr></tbody>
            </table>
          </div>
        </article>
      </div>

      <!-- PAINEL KPIs COMPRAS -->
      <div class="nf-panel" id="nfPanelKpis">
        <div class="nf-filter-tabs">
          <button class="nf-filter-tab active" data-kpi-filter="pendentes" type="button">Pendentes</button>
          <button class="nf-filter-tab" data-kpi-filter="lancados" type="button">Lançados</button>
        </div>
        <div class="nf-kpis">
          <div class="nf-kpi"><span>Itens pendentes</span><strong id="kpiNfPendentes">0</strong></div>
          <div class="nf-kpi"><span>Total pendente</span><strong id="kpiNfTotalPend">R$ 0,00</strong></div>
          <div class="nf-kpi"><span>Total lançado</span><strong id="kpiNfTotalLanc">R$ 0,00</strong></div>
        </div>
        <article class="nf-card">
          <div class="nf-table-wrap">
            <table class="nf-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Regional</th>
                  <th>Solicitante</th>
                  <th>Valor</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody id="nfKpiTbody"><tr><td colspan="5" class="nf-empty">Carregando...</td></tr></tbody>
            </table>
          </div>
        </article>
      </div>
    </section>

    <div class="nf-modal" id="nfModal">
      <div class="nf-modal-card" id="nfModalCard"></div>
    </div>
  `;

  // ─── TABS ────────────────────────────────────────────────────────────────────
  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.nf-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('nfPanelResumo').classList.toggle('active', tab === 'resumo');
    document.getElementById('nfPanelKpis').classList.toggle('active', tab === 'kpis');
    if (tab === 'kpis') loadKpis();
  }

  document.querySelectorAll('.nf-tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

  // ─── RESUMO FINANCEIRO ───────────────────────────────────────────────────────
  function render() {
    const tbody = document.getElementById('nfTbody');
    if (!state.rows.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="nf-empty">Nenhum resumo localizado no período.</td></tr>`;
    } else {
      tbody.innerHTML = state.rows.map((row) => `
        <tr>
          <td>${brDate(row.data_pagamento)}</td>
          <td><strong>${esc(row.regional || '-')}</strong></td>
          <td>${esc(row.destino || '-')}</td>
          <td>${Number(row.quantidade || 0)}</td>
          <td>${money(row.valor_total)}</td>
          <td>${esc(row.modulo_origem || 'FINANCEIRO')}</td>
        </tr>
      `).join('');
    }
    const total = state.rows.reduce((sum, row) => sum + Number(row.valor_total || 0), 0);
    document.getElementById('nfKpiRegistros').textContent = String(state.rows.length);
    document.getElementById('nfKpiTotal').textContent = money(total);
    document.getElementById('nfKpiRegionais').textContent = String(new Set(state.rows.map((row) => row.regional || '-')).size);
  }

  async function load() {
    const tbody = document.getElementById('nfTbody');
    tbody.innerHTML = `<tr><td colspan="6" class="nf-empty">Consultando Notas Fiscais...</td></tr>`;
    const { data, error } = await supabase
      .from('financeiro_notas_fiscais_resumo')
      .select('*')
      .gte('data_pagamento', state.inicio)
      .lte('data_pagamento', state.fim)
      .order('data_pagamento', { ascending: false })
      .order('regional', { ascending: true });
    if (error) {
      tbody.innerHTML = `<tr><td colspan="6" class="nf-empty">${esc(error.message)}<br>Execute a migration de pagamentos/notas fiscais no Supabase.</td></tr>`;
      return;
    }
    state.rows = data || [];
    render();
  }

  document.getElementById('nfFilterForm').addEventListener('submit', (event) => {
    event.preventDefault();
    state.inicio = document.getElementById('nfInicio').value;
    state.fim = document.getElementById('nfFim').value;
    load();
  });

  // ─── KPIs COMPRAS ────────────────────────────────────────────────────────────
  async function loadKpis() {
    const tbody = document.getElementById('nfKpiTbody');
    tbody.innerHTML = `<tr><td colspan="5" class="nf-empty">Carregando...</td></tr>`;

    const { data, error } = await supabase
      .from('compras_itens')
      .select('id, material, tipo, quantidade, unidade, valor_total, comprado_em, nf_url, comprovante_url, nf_lancado, nf_lancado_em, marca, compras_solicitacoes(solicitante, coordenacao, data_solicitacao, observacoes)')
      .eq('status', 'comprado')
      .not('nf_url', 'is', null)
      .not('comprovante_url', 'is', null)
      .order('comprado_em', { ascending: false })
      .limit(500);

    if (error) {
      tbody.innerHTML = `<tr><td colspan="5" class="nf-empty">${esc(error.message)}</td></tr>`;
      return;
    }

    state.kpiRows = data || [];
    updateKpiCounters();
    renderKpis();
  }

  function updateKpiCounters() {
    const pendentes = state.kpiRows.filter((r) => !r.nf_lancado);
    const lancados = state.kpiRows.filter((r) => r.nf_lancado);
    document.getElementById('kpiNfPendentes').textContent = String(pendentes.length);
    document.getElementById('kpiNfTotalPend').textContent = money(pendentes.reduce((s, r) => s + Number(r.valor_total || 0), 0));
    document.getElementById('kpiNfTotalLanc').textContent = money(lancados.reduce((s, r) => s + Number(r.valor_total || 0), 0));
  }

  function renderKpis() {
    const tbody = document.getElementById('nfKpiTbody');
    const rows = state.kpiRows.filter((r) => state.kpiFilter === 'lancados' ? r.nf_lancado : !r.nf_lancado);

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="nf-empty">${state.kpiFilter === 'lancados' ? 'Nenhum item lançado ainda.' : 'Nenhum item aguardando lançamento.'}</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map((r) => {
      const sol = r.compras_solicitacoes || {};
      const regional = sol.coordenacao || '-';
      const data = brDate(r.comprado_em || sol.data_solicitacao);
      const lancadoBadge = r.nf_lancado
        ? `<span class="nf-badge lancado">Lançado ${brDate(r.nf_lancado_em)}</span>`
        : '';
      return `<tr>
        <td>${data}</td>
        <td><strong>${esc(regional)}</strong></td>
        <td>${esc(sol.solicitante || '-')}</td>
        <td>${money(r.valor_total)}</td>
        <td>
          <div class="nf-act">
            <button class="btn btn-secondary" data-open-kpi="${esc(r.id)}" type="button">Abrir KPI</button>
            ${isUrl(r.nf_url) ? `<a class="btn btn-secondary" href="${esc(r.nf_url)}" target="_blank" rel="noopener">Baixar NF</a>` : ''}
            ${isUrl(r.comprovante_url) ? `<a class="btn btn-secondary" href="${esc(r.comprovante_url)}" target="_blank" rel="noopener">Baixar Comprovante</a>` : ''}
            ${!r.nf_lancado ? `<button class="btn btn-primary" data-lancar="${esc(r.id)}" type="button">Lançado</button>` : lancadoBadge}
          </div>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-open-kpi]').forEach((b) => b.addEventListener('click', () => openKpiModal(b.dataset.openKpi)));
    tbody.querySelectorAll('[data-lancar]').forEach((b) => b.addEventListener('click', () => lancarItem(b.dataset.lancar, b)));
  }

  function openKpiModal(id) {
    const r = state.kpiRows.find((x) => String(x.id) === String(id));
    if (!r) return;
    const sol = r.compras_solicitacoes || {};
    const modal = document.getElementById('nfModal');
    const card = document.getElementById('nfModalCard');

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
        <div>
          <h3 style="margin:0 0 4px;color:#f8fafc">${esc(r.material || 'Compra')}</h3>
          <p style="margin:0;color:#6b7280;font-size:13px">${esc(sol.solicitante || '-')} · ${brDate(r.comprado_em)}</p>
        </div>
        <button class="btn btn-secondary" id="nfModalClose" type="button" style="flex-shrink:0">Fechar</button>
      </div>
      <div class="nf-modal-grid">
        <div>
          <div class="nf-modal-label">Regional / Coordenação</div>
          <div class="nf-modal-value">${esc(sol.coordenacao || '-')}</div>
        </div>
        <div>
          <div class="nf-modal-label">Data da compra</div>
          <div class="nf-modal-value">${brDate(r.comprado_em)}</div>
        </div>
        <div>
          <div class="nf-modal-label">Tipo</div>
          <div class="nf-modal-value">${esc(r.tipo || '-')}</div>
        </div>
        <div>
          <div class="nf-modal-label">Quantidade</div>
          <div class="nf-modal-value">${esc(r.quantidade || r.unidade || '1')}</div>
        </div>
        ${r.marca ? `<div><div class="nf-modal-label">Marca</div><div class="nf-modal-value">${esc(r.marca)}</div></div>` : ''}
        <div>
          <div class="nf-modal-label">Valor total</div>
          <div class="nf-modal-value" style="font-size:18px;font-weight:700;color:#bbf7d0">${money(r.valor_total)}</div>
        </div>
        <div>
          <div class="nf-modal-label">Status NF</div>
          <div class="nf-modal-value">
            ${r.nf_lancado
              ? `<span class="nf-badge lancado">Lançado ${brDate(r.nf_lancado_em)}</span>`
              : `<span class="nf-badge pendente">Aguardando lançamento</span>`}
          </div>
        </div>
        ${sol.observacoes ? `<div class="nf-modal-full"><div class="nf-modal-label">Observações</div><div class="nf-modal-value">${esc(sol.observacoes)}</div></div>` : ''}
        <div class="nf-modal-full" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
          ${isUrl(r.nf_url) ? `<a class="btn btn-secondary" href="${esc(r.nf_url)}" target="_blank" rel="noopener">Baixar NF</a>` : `<span style="color:#6b7280;font-size:13px">NF: ${esc(r.nf_url || '-')}</span>`}
          ${isUrl(r.comprovante_url) ? `<a class="btn btn-secondary" href="${esc(r.comprovante_url)}" target="_blank" rel="noopener">Baixar Comprovante</a>` : ''}
          ${!r.nf_lancado ? `<button class="btn btn-primary" data-lancar-modal="${esc(r.id)}" type="button">Lançado</button>` : ''}
        </div>
      </div>
    `;

    modal.classList.add('open');
    card.querySelector('#nfModalClose').addEventListener('click', () => modal.classList.remove('open'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); }, { once: true });

    const btnLancar = card.querySelector('[data-lancar-modal]');
    if (btnLancar) btnLancar.addEventListener('click', () => lancarItem(btnLancar.dataset.lancarModal, btnLancar));
  }

  async function lancarItem(id, btn) {
    if (!confirm('Confirmar lançamento desta NF?')) return;
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    const { error } = await supabase
      .from('compras_itens')
      .update({ nf_lancado: true, nf_lancado_em: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      alert(`Erro ao lançar: ${error.message}`);
      btn.disabled = false;
      btn.textContent = original;
      return;
    }

    const item = state.kpiRows.find((r) => String(r.id) === String(id));
    if (item) {
      item.nf_lancado = true;
      item.nf_lancado_em = new Date().toISOString();
    }

    document.getElementById('nfModal').classList.remove('open');
    updateKpiCounters();
    renderKpis();
  }

  document.querySelectorAll('[data-kpi-filter]').forEach((b) => {
    b.addEventListener('click', () => {
      state.kpiFilter = b.dataset.kpiFilter;
      document.querySelectorAll('[data-kpi-filter]').forEach((x) => x.classList.toggle('active', x === b));
      renderKpis();
    });
  });

  load();
});
