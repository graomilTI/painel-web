// Renderizadores HTML puros do módulo Hotel — não tocam em state, só formatam.
import { esc, brDate, money, statusLabel, tabGroup, STATUS_SOLICITACAO } from './adm-hotel-helpers.js';

const TABS = [
  { key: 'todas', label: 'Todas' },
  { key: 'solicitada', label: 'Solicitada' },
  { key: 'reservada', label: 'Reservada' },
  { key: 'concluida', label: 'Concluída' },
  { key: 'cancelada', label: 'Cancelada' },
  { key: 'fluxo', label: 'Fluxo' },
];

export function renderShellAlojamentos() {
  return `
    <section class="hero-card">
      <div>
        <div class="eyebrow">Hospedagem</div>
        <h2>Alojamentos</h2>
        <p>Controle dos alojamentos próprios e locados utilizados na Programação.</p>
      </div>
      <div class="hero-badge-wrap"><span class="hero-badge">ALOJAMENTOS</span></div>
    </section>
    <div class="adm-hosp-tabs">
      <button class="adm-hosp-tab active" data-tab="alojamentos" type="button">Alojamentos</button>
    </div>
    <section id="tab-alojamentos" class="adm-hosp-panel active"></section>
  `;
}

function rowsForGroup(rows, group) {
  if (group === 'todas' || group === 'fluxo') return rows;
  return rows.filter((r) => tabGroup(r) === group);
}

export function renderTabsBar(rows, activeTab, openKpi) {
  return TABS.map((t) => {
    if (t.key === 'fluxo') {
      return `<div class="ah-tab-wrap"><button class="ah-tab" data-tab="fluxo" type="button">${t.label}</button></div>`;
    }
    const list = rowsForGroup(rows, t.key);
    return `
      <div class="ah-tab-wrap">
        <button class="ah-tab" data-active="${activeTab === t.key}" data-tab="${t.key}" type="button">
          ${t.label}<span class="ah-count">${list.length}</span><span class="ah-kpi-arrow" data-kpi="${t.key}" title="Ver reservas">${openKpi === t.key ? '▴' : '▾'}</span>
        </button>
        ${openKpi === t.key ? renderKpiPopover(list, t.label) : ''}
      </div>
    `;
  }).join('');
}

function bucketKey(row) {
  return row.reserva_id || `sol:${row.solicitacao_id}`;
}

function groupByReserva(list) {
  const buckets = new Map();
  list.forEach((r) => {
    const key = bucketKey(r);
    if (!buckets.has(key)) {
      buckets.set(key, { key, hotel: r.hotel, cidade: r.cidade, uf: r.uf, status: statusLabel(r), colaboradores: new Set(), rows: [] });
    }
    const b = buckets.get(key);
    b.rows.push(r);
    String(r.colaboradores || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((c) => b.colaboradores.add(c));
  });
  return [...buckets.values()];
}

export function renderKpiPopover(list, label) {
  const buckets = groupByReserva(list);
  if (buckets.length === 0) {
    return `<div class="ah-kpi-pop"><div class="ah-kpi-empty">Nenhuma reserva em ${esc(label)}.</div></div>`;
  }
  const totalColab = buckets.reduce((s, b) => s + b.colaboradores.size, 0);
  return `
    <div class="ah-kpi-pop">
      <div class="ah-kpi-title">${esc(label)} · ${buckets.length} reserva${buckets.length === 1 ? '' : 's'} · ${totalColab} colaborador${totalColab === 1 ? '' : 'es'}</div>
      <div class="ah-kpi-list">
        ${buckets.map((b) => `
          <div class="ah-kpi-item">
            <span class="name">${esc(b.hotel || b.cidade || '—')}</span>
            <span class="meta">${b.colaboradores.size} colab. · ${esc(b.status)}</span>
          </div>
          <div class="ah-kpi-guests">
            ${[...b.colaboradores].map((c) => `<span class="ah-kpi-guest">${esc(c)}</span>`).join('')}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

export function renderTable(list) {
  if (list.length === 0) {
    return `<div class="card"><div class="ah-empty">Nenhuma solicitação neste filtro.</div></div>`;
  }
  return `
    <div class="card ah-table-scroll">
      <table class="ah-table">
        <thead><tr>
          <th>Status</th><th>Entrada</th><th>Saída</th><th>Hotel</th><th>Cidade</th><th>UF</th><th>Solicitante</th>
        </tr></thead>
        <tbody>
          ${list.map((r) => {
            const group = tabGroup(r);
            const entrada = r.data_checkin || r.data_checkin_prevista;
            const saida = r.data_checkout || r.data_checkout_prevista;
            return `<tr data-row="${esc(r.solicitacao_id)}">
              <td><button class="ah-chip ah-chip-${group}" data-open="${esc(r.solicitacao_id)}" type="button">${esc(statusLabel(r))}</button></td>
              <td class="ah-mono">${brDate(entrada)}</td>
              <td class="ah-mono">${brDate(saida)}</td>
              <td class="ah-muted">${esc(r.hotel || '—')}</td>
              <td class="ah-city">${esc(r.cidade || '—')}</td>
              <td class="ah-mono ah-muted">${esc(r.uf || '—')}</td>
              <td>
                ${esc(r.solicitante_nome || '—')}
                <span class="ah-sup">${esc(r.supervisao || '')}</span>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

export function renderFluxoPlaceholder() {
  return `
    <div class="card ah-fluxo-placeholder">
      <p class="eyebrow">Fluxo de caixa</p>
      <p class="muted">Saldo por hotel, extrato e pagamento em lote chegam na próxima fase da reconstrução — por enquanto esta aba fica reservada.</p>
    </div>
  `;
}

export function renderDetalhes(row, quotes) {
  const colaboradores = String(row.colaboradores || '').split(',').map((s) => s.trim()).filter(Boolean);
  const quotesForRow = (quotes || []).filter((q) => q.solicitacao_id === row.solicitacao_id);
  const temReserva = Boolean(row.reserva_id);
  return `
    <div class="ah-modal">
      <div class="ah-modal-head">
        <div><h3>${esc(row.hotel || row.cidade || 'Solicitação')}</h3><p class="muted">${esc(row.cidade || '')}${row.uf ? ` · ${esc(row.uf)}` : ''} · ${esc(statusLabel(row))}</p></div>
        <button class="ah-modal-x" data-close type="button">✕</button>
      </div>
      <div class="ah-modal-body">
        <div class="ah-field">
          <label>Solicitação</label>
          <div class="ah-detail-list">
            <div class="ah-detail-row"><span>Solicitante</span><span class="muted">${esc(row.solicitante_nome || '—')}</span></div>
            <div class="ah-detail-row"><span>Supervisão</span><span class="muted">${esc(row.supervisao || '—')}</span></div>
            <div class="ah-detail-row"><span>Cliente</span><span class="muted">${esc(row.cliente || '—')}</span></div>
            <div class="ah-detail-row"><span>Local de embarque</span><span class="muted">${esc(row.local_embarque || '—')}</span></div>
            <div class="ah-detail-row"><span>Período previsto</span><span class="muted">${brDate(row.data_checkin_prevista)} → ${brDate(row.data_checkout_prevista)}</span></div>
          </div>
        </div>

        <div class="ah-field">
          <label>Colaboradores (${colaboradores.length})</label>
          <div class="ah-guest-wrap">
            ${colaboradores.map((c) => `<span class="ah-guest-tag">${esc(c)}</span>`).join('') || '<span class="muted">Nenhum colaborador vinculado.</span>'}
          </div>
        </div>

        ${temReserva ? `
          <div class="ah-field">
            <label>Reserva</label>
            <div class="ah-detail-list">
              <div class="ah-detail-row"><span>Hotel</span><span class="muted">${esc(row.hotel || '—')}</span></div>
              <div class="ah-detail-row"><span>Diária</span><span class="muted">${row.valor_diaria != null ? money(row.valor_diaria) : '—'} · ${row.quantidade_diarias ?? '—'} diária(s) · ${row.quantidade_quartos ?? '—'} quarto(s)</span></div>
              <div class="ah-detail-row"><span>Total previsto</span><span class="muted">${row.valor_total_previsto != null ? money(row.valor_total_previsto) : '—'}</span></div>
              <div class="ah-detail-row"><span>Financeiro</span><span class="muted">${esc(row.status_financeiro || 'Não iniciado')}${row.pendencia_financeira ? ' · pendente' : ''}</span></div>
              <div class="ah-detail-row"><span>Nota fiscal</span><span class="muted">${esc(row.status_nota || '—')}${row.pendencia_nf ? ' · pendente' : ''}</span></div>
            </div>
          </div>
        ` : `<p class="ah-note">Ainda sem reserva — os detalhes de hotel e financeiro aparecem depois que uma reserva for criada.</p>`}

        ${quotesForRow.length ? `
          <div class="ah-field">
            <label>Cotações enviadas</label>
            <div class="ah-detail-list">
              ${quotesForRow.map((q) => `
                <div class="ah-detail-row">
                  <span>${esc(q.hotel_nome || '—')} <span class="muted">· ${esc(q.status || '—')}</span></span>
                  <span class="muted">${q.valor_diaria != null ? money(q.valor_diaria) : (q.status === 'RESPONDIDA' || q.status === 'INDISPONIVEL' ? 'sem valor' : 'aguardando')}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
      <div class="ah-modal-foot">
        <button class="btn btn-secondary ah-btn-sm" data-close type="button">Fechar</button>
      </div>
    </div>
  `;
}
