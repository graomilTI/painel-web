// Renderizadores HTML puros do módulo Hotel — não tocam em state, só formatam.
import {
  esc, brDate, money, normalizeText, statusLabel, tabGroup, STATUS_SOLICITACAO, STATUS_COTACAO,
  ROOM_TYPES, ROOM_TYPE_LABEL, ROOM_CAPACITY, nightsBetween, EXTRA_TYPE_LABEL, LOTE_STATUS_LABEL,
} from './adm-hotel-helpers.js';

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

export function renderFluxoBoard(cards) {
  if (cards.length === 0) {
    return `
      <div class="card ah-fluxo-placeholder">
        <p class="eyebrow">Fluxo de caixa</p>
        <p class="muted">Nenhum hotel com reserva enviada ao Financeiro ou crédito registrado ainda.</p>
      </div>
    `;
  }
  return `
    <div class="ah-fluxo-grid">
      ${cards.map((c) => `
        <button class="ah-fluxo-card" data-open-extrato="${esc(c.hotelId)}" type="button">
          <div class="ah-fluxo-card-head">
            <span class="ah-fluxo-card-name">${esc(c.nome)}</span>
            <span class="ah-fluxo-card-city muted">${esc(c.cidade || '—')}${c.uf ? `/${esc(c.uf)}` : ''}</span>
          </div>
          <div class="ah-fluxo-card-saldo ${c.saldoDevido > 0 ? 'ah-fluxo-saldo-devido' : ''}">${money(c.saldoDevido)}</div>
          ${c.creditoDisponivel > 0 ? `<div class="ah-fluxo-card-credito">Crédito ${money(c.creditoDisponivel)}</div>` : ''}
        </button>
      `).join('')}
    </div>
  `;
}

function loteBadgeClass(status) {
  if (status === 'PAGO') return 'ah-quote-ok';
  if (status === 'CANCELADO') return 'ah-quote-falha';
  return 'ah-quote-pendente';
}

export function renderHotelExtrato(hotelInfo, reservas, lots, pendingByLote, advances, moves) {
  return `
    <div class="ah-modal ah-extrato">
      <div class="ah-modal-head">
        <div>
          <h3>${esc(hotelInfo.nome)}</h3>
          <p class="muted">${esc(hotelInfo.cidade || '')}${hotelInfo.uf ? ` · ${esc(hotelInfo.uf)}` : ''} · Saldo devido ${money(hotelInfo.saldoDevido)}${hotelInfo.creditoDisponivel > 0 ? ` · Crédito ${money(hotelInfo.creditoDisponivel)}` : ''}</p>
        </div>
        <button class="ah-modal-x" data-close-extrato type="button">✕</button>
      </div>
      <div class="ah-modal-body">
        <div class="ah-field">
          <label>Reservas (${reservas.length})</label>
          <div class="ah-detail-list">
            ${reservas.length ? reservas.map((r) => `
              <div class="ah-detail-row"><span>${brDate(r.data_checkin)} → ${brDate(r.data_checkout)} <span class="muted">· ${esc(statusLabel(r))}</span></span><span class="muted">${r.valor_total_previsto != null ? money(r.valor_total_previsto) : '—'}</span></div>
            `).join('') : '<p class="ah-note">Nenhuma reserva neste hotel ainda.</p>'}
          </div>
        </div>

        <div class="ah-field">
          <label>Lançamentos de check-out (${lots.length})</label>
          <div class="ah-detail-list">
            ${lots.length ? lots.map((l) => {
              const pending = pendingByLote.get(l.id);
              return `
                <div class="ah-quote-row">
                  <div class="ah-quote-main">
                    <span class="ah-quote-hotel">${brDate(l.data_checkout)}</span>
                    <span class="ah-quote-badge ${loteBadgeClass(l.status)}">${esc(LOTE_STATUS_LABEL[l.status] || l.status)}</span>
                  </div>
                  <div class="ah-quote-meta muted">Diárias ${money(l.valor_diarias)} · Extras ${money(l.valor_extras)} · Total ${money(l.valor_total)}</div>
                  ${pending ? `
                    <div class="ah-field-row">
                      <div class="ah-field"><label>Valor pago</label><input type="number" min="0" step="0.01" class="ah-input-sm" data-fin-field="valorPago" data-fin-id="${esc(l.id)}" value="${pending.valor}" /></div>
                      <div class="ah-field"><label>Comprovante (URL)</label><input type="text" class="ah-input-sm" data-fin-field="comprovante" data-fin-id="${esc(l.id)}" placeholder="https://..." /></div>
                    </div>
                    <button class="btn btn-primary ah-btn-sm" data-confirmar-pagamento="${esc(l.id)}" type="button">Confirmar pagamento</button>
                  ` : ''}
                </div>
              `;
            }).join('') : '<p class="ah-note">Nenhum check-out lançado ainda.</p>'}
          </div>
        </div>

        ${moves.length ? `
          <div class="ah-field">
            <label>Movimentações de crédito (${moves.length})</label>
            <div class="ah-detail-list">
              ${moves.map((m) => `
                <div class="ah-detail-row"><span>${brDate(m.created_at)} <span class="muted">· ${esc(m.tipo)}</span></span><span class="muted">${money(m.valor)}</span></div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
      <div class="ah-modal-foot">
        <span></span>
        <button class="btn btn-secondary ah-btn-sm" data-close-extrato type="button">Fechar</button>
      </div>
    </div>
  `;
}

export function renderDetalhes(row, quotes) {
  const colaboradores = String(row.colaboradores || '').split(',').map((s) => s.trim()).filter(Boolean);
  const quotesForRow = (quotes || []).filter((q) => q.solicitacao_id === row.solicitacao_id);
  const temReserva = Boolean(row.reserva_id);
  const podeCotar = tabGroup(row) === 'solicitada';
  const podeEstender = temReserva && (row.status_hospedagem === 'CHECKIN_PREVISTO' || row.status_hospedagem === 'HOSPEDADO');
  const podeCheckout = podeEstender;
  const podeDiferenca = temReserva;
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

        <div class="ah-field" id="ahCotacoesBox">
          ${renderCotacoesSection(row, quotesForRow)}
        </div>
      </div>
      <div class="ah-modal-foot">
        <div class="ah-modal-foot-left">
          ${podeCotar ? `<button class="btn btn-secondary ah-btn-sm" data-cotar="${esc(row.solicitacao_id)}" type="button">Cotar hotéis</button>` : ''}
          ${podeCotar ? `<button class="btn btn-secondary ah-btn-sm" data-agrupar="${esc(row.solicitacao_id)}" type="button">Agrupar</button>` : ''}
          ${podeCotar ? `<button class="btn btn-primary ah-btn-sm" data-reservar="${esc(row.solicitacao_id)}" type="button">Reservar</button>` : ''}
          ${podeEstender ? `<button class="btn btn-secondary ah-btn-sm" data-estender="${esc(row.solicitacao_id)}" type="button">Estender</button>` : ''}
          ${podeCheckout ? `<button class="btn btn-primary ah-btn-sm" data-checkout="${esc(row.solicitacao_id)}" type="button">Check-out</button>` : ''}
          ${podeDiferenca ? `<button class="btn btn-secondary ah-btn-sm" data-diferenca="${esc(row.solicitacao_id)}" type="button">Diferença</button>` : ''}
        </div>
        <button class="btn btn-secondary ah-btn-sm" data-close type="button">Fechar</button>
      </div>
    </div>
  `;
}

function quoteBadgeClass(status) {
  if (status === 'RESPONDIDA') return 'ah-quote-ok';
  if (status === 'INDISPONIVEL') return 'ah-quote-indisponivel';
  if (status === 'FALHA') return 'ah-quote-falha';
  return 'ah-quote-pendente';
}

export function renderCotacoesSection(row, quotesForRow) {
  return `
    <label>Cotações (${quotesForRow.length})</label>
    ${quotesForRow.length ? `
      <div class="ah-detail-list">
        ${quotesForRow.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map((q) => `
          <div class="ah-quote-row ${q.selecionada ? 'ah-quote-selected' : ''}">
            <div class="ah-quote-main">
              <span class="ah-quote-hotel">${esc(q.hotel_nome || '—')}</span>
              <span class="ah-quote-badge ${quoteBadgeClass(q.status)}">${esc(STATUS_COTACAO[q.status] || q.status || '—')}</span>
              ${q.selecionada ? '<span class="ah-quote-badge ah-quote-selected-badge">Selecionada</span>' : ''}
            </div>
            <div class="ah-quote-meta muted">
              ${q.valor_diaria != null ? `Diária ${money(q.valor_diaria)}` : ''}
              ${q.valor_total != null ? ` · Total ${money(q.valor_total)}` : ''}
              ${q.disponibilidade === false ? ' · sem disponibilidade' : ''}
              ${q.resposta_texto ? ` · "${esc(q.resposta_texto).slice(0, 140)}"` : ''}
            </div>
            ${q.status === 'RESPONDIDA' && q.disponibilidade !== false && !q.selecionada ? `
              <button class="btn btn-secondary ah-btn-sm ah-quote-use" data-use-quote="${esc(q.id)}" type="button">Usar esta cotação</button>
            ` : ''}
          </div>
        `).join('')}
      </div>
    ` : '<p class="ah-note">Nenhuma cotação enviada ainda.</p>'}
  `;
}

export function renderHoteisPicker(row, query) {
  return `
    <div class="ah-modal ah-picker">
      <div class="ah-modal-head">
        <div><h3>Cotar hotéis</h3><p class="muted">${esc(row.cidade || '')}${row.uf ? ` · ${esc(row.uf)}` : ''} · ${brDate(row.data_checkin_prevista)} → ${brDate(row.data_checkout_prevista)}</p></div>
        <button class="ah-modal-x" data-close-picker type="button">✕</button>
      </div>
      <div class="ah-modal-body">
        <input type="text" class="ah-picker-search" id="ahPickerSearch" placeholder="Buscar por nome ou cidade..." value="${esc(query)}" autocomplete="off" />
        <div id="ahPickerList" class="ah-picker-list"></div>
      </div>
      <div class="ah-modal-foot">
        <button class="btn btn-secondary ah-btn-sm" data-back-detalhes type="button">Voltar</button>
        <button class="btn btn-primary ah-btn-sm" id="ahPickerConfirm" data-confirm-cotar type="button" disabled>Cotar em lote (0)</button>
      </div>
    </div>
  `;
}

const PICKER_LIMIT = 60;

export function renderPickerList(hotels, query, selectedIds) {
  const q = normalizeText(query);
  const filtered = q
    ? hotels.filter((h) => normalizeText(h.nome).includes(q) || normalizeText(h.cidade).includes(q) || normalizeText(h.uf).includes(q))
    : hotels;
  if (filtered.length === 0) {
    return '<div class="ah-empty">Nenhum hotel encontrado.</div>';
  }
  const shown = filtered.slice(0, PICKER_LIMIT);
  const hint = filtered.length > PICKER_LIMIT
    ? `<div class="ah-picker-hint muted">Mostrando ${PICKER_LIMIT} de ${filtered.length} — refine a busca para ver mais.</div>`
    : '';
  return `
    ${shown.map((h) => `
      <label class="ah-picker-item">
        <input type="checkbox" data-hotel-id="${esc(h.id)}" ${selectedIds.has(h.id) ? 'checked' : ''} />
        <span class="ah-picker-item-name">${esc(h.nome || '—')}</span>
        <span class="ah-picker-item-meta muted">${esc(h.cidade || '—')}${h.uf ? `/${esc(h.uf)}` : ''}</span>
      </label>
    `).join('')}
    ${hint}
  `;
}

export function renderAgruparPicker(row, reservas) {
  return `
    <div class="ah-modal">
      <div class="ah-modal-head">
        <div><h3>Agrupar</h3><p class="muted">${esc(row.cidade || '')}${row.uf ? ` · ${esc(row.uf)}` : ''} · junta esta solicitação numa reserva já existente na mesma cidade</p></div>
        <button class="ah-modal-x" data-close-agrupar type="button">✕</button>
      </div>
      <div class="ah-modal-body">
        ${reservas.length ? `
          <div class="ah-detail-list">
            ${reservas.map((r) => `
              <div class="ah-quote-row">
                <div class="ah-quote-main">
                  <span class="ah-quote-hotel">${esc(r.hotel || '—')}</span>
                  <span class="ah-quote-badge ${r.status_hospedagem === 'HOSPEDADO' ? 'ah-quote-ok' : 'ah-quote-pendente'}">${esc(statusLabel(r))}</span>
                </div>
                <div class="ah-quote-meta muted">
                  ${brDate(r.data_checkin)} → ${brDate(r.data_checkout)} · ${r.total_colaboradores ?? 0} colaborador(es)
                </div>
                <button class="btn btn-secondary ah-btn-sm" data-agrupar-reserva="${esc(r.reserva_id)}" type="button">Agrupar nesta reserva</button>
              </div>
            `).join('')}
          </div>
        ` : `<p class="ah-note">Nenhuma reserva ativa em ${esc(row.cidade || 'sem cidade definida')}${row.uf ? `/${esc(row.uf)}` : ''} pra agrupar. Use "Reservar" pra criar uma nova.</p>`}
      </div>
      <div class="ah-modal-foot">
        <button class="btn btn-secondary ah-btn-sm" data-back-detalhes-agrupar type="button">Voltar</button>
        <span></span>
      </div>
    </div>
  `;
}

export function renderEstenderForm(row) {
  return `
    <div class="ah-modal">
      <div class="ah-modal-head">
        <div><h3>Estender hospedagem</h3><p class="muted">${esc(row.hotel || '—')} · check-out atual ${brDate(row.data_checkout)}</p></div>
        <button class="ah-modal-x" data-close-estender type="button">✕</button>
      </div>
      <div class="ah-modal-body">
        <div class="ah-field">
          <label>Nova data de check-out</label>
          <input type="date" id="ahExtCheckout" value="${esc(row.data_checkout || '')}" min="${esc(row.data_checkout || '')}" />
        </div>
        <div id="ahExtErrorBox"></div>
        <p class="ah-note">Atualiza a reserva e todas as solicitações agrupadas nela.</p>
      </div>
      <div class="ah-modal-foot">
        <button class="btn btn-secondary ah-btn-sm" data-back-detalhes-estender type="button">Voltar</button>
        <button class="btn btn-primary ah-btn-sm" id="ahExtConfirm" data-confirm-estender type="button">Confirmar extensão</button>
      </div>
    </div>
  `;
}

export function renderCheckoutForm(row, colaboradores, selectedIds, valorDiarias) {
  return `
    <div class="ah-modal">
      <div class="ah-modal-head">
        <div><h3>Check-out</h3><p class="muted">${esc(row.hotel || '—')} · ${brDate(row.data_checkin)} → ${brDate(row.data_checkout)}</p></div>
        <button class="ah-modal-x" data-close-checkout type="button">✕</button>
      </div>
      <div class="ah-modal-body">
        <div class="ah-field">
          <label>Colaboradores fazendo check-out (<span id="ahCkoColabCount">${selectedIds.size}/${colaboradores.length}</span>)</label>
          <div class="ah-guest-wrap">
            ${colaboradores.length ? colaboradores.map((c) => `
              <label class="ah-picker-item">
                <input type="checkbox" data-colaborador-id="${esc(c.id)}" ${selectedIds.has(c.id) ? 'checked' : ''} />
                <span class="ah-picker-item-name">${esc(c.nome)}</span>
              </label>
            `).join('') : '<span class="muted">Nenhum colaborador hospedado nesta reserva.</span>'}
          </div>
          <p class="ah-note">Desmarque quem continua hospedado — o check-out desses colaboradores fica pendente pra outro lote.</p>
        </div>

        <div class="ah-field">
          <label>Valor das diárias deste check-out</label>
          <input type="number" min="0" step="0.01" id="ahCkoValorDiarias" value="${valorDiarias}" />
        </div>

        <div class="ah-field" id="ahCkoExtrasBox"></div>

        <div class="ah-field">
          <label>Observações</label>
          <input type="text" id="ahCkoObservacoes" placeholder="Opcional" />
        </div>
        <div id="ahCkoErrorBox"></div>
      </div>
      <div class="ah-modal-foot">
        <button class="btn btn-secondary ah-btn-sm" data-back-detalhes-checkout type="button">Voltar</button>
        <button class="btn btn-primary ah-btn-sm" id="ahCkoConfirm" data-confirm-checkout type="button">Confirmar check-out</button>
      </div>
    </div>
  `;
}

export function renderExtrasTotalText(extras) {
  const total = extras.reduce((s, e) => s + (e.tipo === 'desconto' ? -Math.abs(Number(e.valor || 0)) : Math.abs(Number(e.valor || 0))), 0);
  return `Itens extras (${extras.length}) · ${money(total)}`;
}

export function renderExtrasBox(extras) {
  return `
    <label id="ahCkoExtrasLabel">${renderExtrasTotalText(extras)}</label>
    <div class="ah-quartos-list">
      ${extras.map((e) => `
        <div class="ah-quarto-card">
          <div class="ah-quarto-head">
            <select data-extra-field="tipo" data-extra-id="${esc(e.localId)}" class="ah-select-sm">
              <option value="adicional" ${e.tipo === 'adicional' ? 'selected' : ''}>${EXTRA_TYPE_LABEL.adicional}</option>
              <option value="desconto" ${e.tipo === 'desconto' ? 'selected' : ''}>${EXTRA_TYPE_LABEL.desconto}</option>
            </select>
            <input type="text" class="ah-input-sm ah-extra-desc" data-extra-field="descricao" data-extra-id="${esc(e.localId)}" value="${esc(e.descricao)}" placeholder="Descrição" />
            <input type="number" min="0" step="0.01" class="ah-input-sm" data-extra-field="valor" data-extra-id="${esc(e.localId)}" value="${e.valor || 0}" placeholder="Valor" />
            <button type="button" class="ah-quarto-remove" data-remove-extra="${esc(e.localId)}" title="Remover item">✕</button>
          </div>
        </div>
      `).join('')}
    </div>
    <button type="button" class="btn btn-secondary ah-btn-sm" data-add-extra>+ Adicionar item</button>
  `;
}

export function renderDiferencaForm(row, colaboradores) {
  return `
    <div class="ah-modal">
      <div class="ah-modal-head">
        <div><h3>Registrar diferença</h3><p class="muted">${esc(row.hotel || '—')}</p></div>
        <button class="ah-modal-x" data-close-diferenca type="button">✕</button>
      </div>
      <div class="ah-modal-body">
        <div class="ah-field">
          <label>Colaborador</label>
          <select id="ahDifColaborador" class="ah-select">
            <option value="">Selecione...</option>
            ${colaboradores.map((c) => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('')}
          </select>
        </div>
        <div class="ah-field-row">
          <div class="ah-field"><label>Valor</label><input type="number" min="0.01" step="0.01" id="ahDifValor" placeholder="0,00" /></div>
          <div class="ah-field"><label>Observações</label><input type="text" id="ahDifObs" placeholder="Ex.: ficou em hotel próprio" /></div>
        </div>
        <div id="ahDifErrorBox"></div>
        <p class="ah-note">Credita a diferença no caixa do colaborador — não altera o financeiro da reserva.</p>
      </div>
      <div class="ah-modal-foot">
        <button class="btn btn-secondary ah-btn-sm" data-back-detalhes-diferenca type="button">Voltar</button>
        <button class="btn btn-primary ah-btn-sm" id="ahDifConfirm" data-confirm-diferenca type="button">Registrar diferença</button>
      </div>
    </div>
  `;
}

export function renderFinanceiroShell() {
  return `
    <section class="hero-card">
      <div>
        <div class="eyebrow">Financeiro</div>
        <h2>Confirmação de pagamento — Hospedagem</h2>
        <p>Lotes de check-out já enviados ao Financeiro, aguardando confirmação de pagamento.</p>
      </div>
      <div class="hero-badge-wrap"><span class="hero-badge">FINANCEIRO</span></div>
    </section>
    <div id="ahFinBoard"></div>
  `;
}

export function renderFinanceiroQueue(items) {
  if (items.length === 0) {
    return `<div class="card"><div class="ah-empty">Nenhum pagamento de hospedagem pendente.</div></div>`;
  }
  return `
    <div class="ah-detail-list">
      ${items.map((it) => `
        <div class="ah-quote-row">
          <div class="ah-quote-main">
            <span class="ah-quote-hotel">${esc(it.favorecido_nome || '—')}</span>
            <span class="ah-quote-badge ${it.status === 'EM_ANALISE' ? 'ah-quote-falha' : 'ah-quote-pendente'}">${it.status === 'EM_ANALISE' ? 'Em análise' : 'Pendente'}</span>
          </div>
          <div class="ah-quote-meta muted">${esc(it.descricao || '—')}</div>
          <div class="ah-quote-meta muted">Valor devido ${money(it.valor)}${it.competencia ? ` · ${brDate(it.competencia)}` : ''}</div>
          ${it.hospedagem_checkout_lote_id ? `
            <div class="ah-field-row">
              <div class="ah-field"><label>Valor pago</label><input type="number" min="0" step="0.01" class="ah-input-sm" data-fin-field="valorPago" data-fin-id="${esc(it.hospedagem_checkout_lote_id)}" value="${it.valor}" /></div>
              <div class="ah-field"><label>Comprovante (URL)</label><input type="text" class="ah-input-sm" data-fin-field="comprovante" data-fin-id="${esc(it.hospedagem_checkout_lote_id)}" placeholder="https://..." /></div>
            </div>
            <button class="btn btn-primary ah-btn-sm" data-confirmar-pagamento="${esc(it.hospedagem_checkout_lote_id)}" type="button">Confirmar pagamento</button>
          ` : `
            <p class="ah-note">Pagamento sem lote de check-out vinculado (lançamento anterior à reconstrução do módulo) — confirme em Financeiro &gt; Pagamentos.</p>
          `}
        </div>
      `).join('')}
    </div>
  `;
}

export function renderReservarForm(row, hotelsSorted, selectedHotelId) {
  return `
    <div class="ah-modal ah-reservar">
      <div class="ah-modal-head">
        <div><h3>Reservar</h3><p class="muted">${esc(row.cidade || '')}${row.uf ? ` · ${esc(row.uf)}` : ''}</p></div>
        <button class="ah-modal-x" data-close-reservar type="button">✕</button>
      </div>
      <div class="ah-modal-body">
        <div class="ah-field">
          <label>Hotel</label>
          <select id="ahResvHotel" class="ah-select">
            <option value="">Selecione um hotel...</option>
            ${hotelsSorted.map((h) => `<option value="${esc(h.id)}" ${h.id === selectedHotelId ? 'selected' : ''}>${esc(h.nome)}${h.cidade ? ` — ${esc(h.cidade)}${h.uf ? `/${esc(h.uf)}` : ''}` : ''}</option>`).join('')}
          </select>
        </div>

        <div class="ah-field-row">
          <div class="ah-field"><label>Check-in</label><input type="date" id="ahResvCheckin" value="${esc(row.data_checkin_prevista || '')}" /></div>
          <div class="ah-field"><label>Check-out</label><input type="date" id="ahResvCheckout" value="${esc(row.data_checkout_prevista || '')}" /></div>
          <div class="ah-field"><label>Horário de chegada</label><input type="time" id="ahResvHorario" value="${esc(row.horario_chegada_previsto || '')}" /></div>
        </div>

        <div class="ah-field">
          <label>Inclusos</label>
          <div class="ah-checks">
            <label class="ah-check"><input type="checkbox" id="ahResvCafe" /> Café da manhã</label>
            <label class="ah-check"><input type="checkbox" id="ahResvAlmoco" /> Almoço</label>
            <label class="ah-check"><input type="checkbox" id="ahResvJanta" /> Janta</label>
            <label class="ah-check"><input type="checkbox" id="ahResvEstacionamento" /> Estacionamento</label>
          </div>
        </div>

        <div class="ah-field-row">
          <div class="ah-field"><label>Confirmado com</label><input type="text" id="ahResvConfirmadoCom" placeholder="Quem confirmou no hotel" /></div>
          <div class="ah-field"><label>Contato</label><input type="text" id="ahResvContato" placeholder="Telefone/WhatsApp" /></div>
          <div class="ah-field"><label>Código da reserva no hotel</label><input type="text" id="ahResvCodigo" placeholder="Opcional" /></div>
        </div>

        <div class="ah-field" id="ahResvQuartosBox"></div>
        <div id="ahResvErrorBox"></div>
      </div>
      <div class="ah-modal-foot">
        <button class="btn btn-secondary ah-btn-sm" data-back-detalhes-resv type="button">Voltar</button>
        <button class="btn btn-primary ah-btn-sm" id="ahResvConfirm" data-confirm-reservar type="button">Confirmar reserva</button>
      </div>
    </div>
  `;
}

export function renderQuartosSummaryText(quartos, checkin, checkout) {
  const nights = nightsBetween(checkin, checkout);
  const total = quartos.reduce((s, q) => s + Number(q.valorDiaria || 0), 0) * nights;
  return `${nights} diária(s) · Total previsto ${money(total)}`;
}

export function renderQuartosBox(quartos, people, assignments, checkin, checkout) {
  const unassigned = people.filter((p) => !assignments.get(p.id));

  return `
    <label>Quartos (${quartos.length})</label>
    <div id="ahResvSummary" class="muted">${renderQuartosSummaryText(quartos, checkin, checkout)}</div>
    <div class="ah-quartos-list">
      ${quartos.map((q, i) => {
        const cap = ROOM_CAPACITY[q.tipoQuarto] || 1;
        const guests = people.filter((p) => assignments.get(p.id) === q.localId);
        return `
          <div class="ah-quarto-card">
            <div class="ah-quarto-head">
              <span class="ah-quarto-index">Quarto ${i + 1}</span>
              <select data-quarto-field="tipoQuarto" data-quarto-id="${esc(q.localId)}" class="ah-select-sm">
                ${ROOM_TYPES.map((t) => `<option value="${t}" ${t === q.tipoQuarto ? 'selected' : ''}>${ROOM_TYPE_LABEL[t]}</option>`).join('')}
              </select>
              <select data-quarto-field="genero" data-quarto-id="${esc(q.localId)}" class="ah-select-sm">
                <option value="" ${!q.genero ? 'selected' : ''}>Misto</option>
                <option value="MASC" ${q.genero === 'MASC' ? 'selected' : ''}>Masc.</option>
                <option value="FEM" ${q.genero === 'FEM' ? 'selected' : ''}>Fem.</option>
              </select>
              <input type="number" min="0" step="0.01" class="ah-input-sm" data-quarto-field="valorDiaria" data-quarto-id="${esc(q.localId)}" value="${q.valorDiaria || 0}" placeholder="Diária" />
              <span class="ah-quarto-cap ${guests.length > cap ? 'ah-quarto-cap-over' : ''}">${guests.length}/${cap}</span>
              <button type="button" class="ah-quarto-remove" data-remove-quarto="${esc(q.localId)}" title="Remover quarto">✕</button>
            </div>
            <div class="ah-quarto-guests">
              ${guests.length ? guests.map((p) => `<span class="ah-guest-tag ah-guest-clickable" data-assign-person="${esc(p.id)}">${esc(p.nome_colaborador)}</span>`).join('') : '<span class="muted">Nenhum hóspede alocado — clique num nome abaixo.</span>'}
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <button type="button" class="btn btn-secondary ah-btn-sm" data-add-quarto>+ Adicionar quarto</button>

    <div class="ah-field">
      <label>Não alocados (${unassigned.length})</label>
      <div class="ah-guest-wrap">
        ${unassigned.length ? unassigned.map((p) => `<span class="ah-guest-tag ah-guest-clickable" data-assign-person="${esc(p.id)}">${esc(p.nome_colaborador)}</span>`).join('') : '<span class="muted">Todos alocados.</span>'}
      </div>
    </div>
  `;
}
