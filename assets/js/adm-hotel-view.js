// Renderizadores HTML puros do módulo Hotel — não tocam em state, só formatam.
import {
  esc, brDate, money, normalizeText, statusLabel, tabGroup, STATUS_COTACAO, LOTE_STATUS_LABEL, preferenciaLabel,
} from './adm-hotel-helpers.js';
import { ICON, cardFiltro, iconBtn } from './patrimonioLayoutFrotas.js?v=20261019-ordenar';

// Casca de Alojamentos no padrão das listas do Frotas. As abas (Alojamentos, Compras, Pagamentos, Hospedados) são injetadas em #alojTabs
// pelos módulos de modules/hospedagem-alojamentos/; o conteúdo do cadastro monta em #tab-alojamentos.
export function renderShellAlojamentos() {
  return `
    <section class="card mt-16 ah-page" id="alojPage">
      <div class="frotas-hub-tabs" id="alojTabs"></div>
      <div class="frotas-hub-tab-body fm-shell">
        <section id="tab-alojamentos" class="adm-hosp-panel active"></section>
      </div>
    </section>
  `;
}

// ─── Histórico do fluxo antigo (v2), somente leitura, no layout das listas do Frotas ─────────────────────────
const GRUPOS_HISTORICO = [
  ['solicitada', 'Solicitada', 'amber', 'relogio', 'warn'],
  ['reservada', 'Reservada', 'green', 'ok', 'ok'],
  ['concluida', 'Concluída', 'blue', 'total', 'info'],
  ['cancelada', 'Cancelada', 'red', 'erro', 'err'],
];

export function filtrarHistorico(rows, { filtro = 'todos', busca = '' } = {}) {
  const q = normalizeText(busca);
  return rows.filter((r) => (filtro === 'todos' || !filtro || tabGroup(r) === filtro)
    && (!q || normalizeText([r.hotel, r.cidade, r.uf, r.solicitante_nome, r.supervisao, r.colaboradores, r.cliente, statusLabel(r),
      brDate(r.data_checkin || r.data_checkin_prevista), brDate(r.data_checkout || r.data_checkout_prevista)].join(' ')).includes(q)));
}

export function renderHistoricoCards(rows, filtro) {
  const contagem = {};
  rows.forEach((r) => { const g = tabGroup(r); contagem[g] = (contagem[g] || 0) + 1; });
  return cardFiltro({ filtro: 'todos', label: 'Todas', tone: 'blue', icone: 'total', valor: String(rows.length), ativo: filtro === 'todos' })
    + GRUPOS_HISTORICO.filter(([g]) => contagem[g] || filtro === g)
      .map(([g, label, tone, icone]) => cardFiltro({ filtro: g, label, tone, icone, valor: String(contagem[g] || 0), ativo: filtro === g })).join('');
}

export function renderHistoricoCorpo(lista) {
  if (!lista.length) return '<tr><td colspan="7" class="fm-empty">Nenhuma solicitação neste filtro.</td></tr>';
  return lista.map((r) => {
    const selo = GRUPOS_HISTORICO.find(([g]) => g === tabGroup(r))?.[4] || '';
    return `<tr>
      <td><span class="fm-badge ${selo}">${esc(statusLabel(r))}</span></td>
      <td>${brDate(r.data_checkin || r.data_checkin_prevista)}</td>
      <td>${brDate(r.data_checkout || r.data_checkout_prevista)}</td>
      <td>${esc(r.hotel || '—')}</td>
      <td><b>${esc(r.cidade || '—')}</b><span class="fm-prazo-dia">${esc(r.uf || '—')}</span></td>
      <td><div class="fm-cell">${esc(r.solicitante_nome || '—')}<span class="fm-prazo-dia">${esc(r.supervisao || '')}</span></div></td>
      <td><div class="fm-actions">${iconBtn('data-open', r.solicitacao_id, 'anexo', 'Ver detalhes (somente leitura)', 'ver')}</div></td>
    </tr>`;
  }).join('');
}

export function renderHistorico(rows, { filtro = 'todos', busca = '' } = {}) {
  const lista = filtrarHistorico(rows, { filtro, busca });
  return `<div id="ahHistPage">
    <p class="fm-prazo-dia" style="margin:0 0 12px">Solicitações do fluxo antigo, mantidas só para consulta. Cotar, reservar e fazer check-out agora é pela aba Solicitações.</p>
    <div class="fm-kpis" id="ahHistKpis">${renderHistoricoCards(rows, filtro)}</div>
    <div class="fm-card"><div class="fm-body">
      <div class="fm-bar"><div class="fm-search">${ICON.busca}<input class="fm-input" id="ahHistBusca" placeholder="Buscar por hotel, cidade, solicitante, supervisão, colaborador ou data..." autocomplete="off" value="${esc(busca)}"></div><span data-chip></span><span class="fm-count" id="ahHistCount">${lista.length} solicitação(ões)</span></div>
      <div class="fm-table-wrap"><table class="fm-table"><thead><tr><th>Status</th><th>Entrada</th><th>Saída</th><th>Hotel</th><th>Cidade/UF</th><th>Solicitante</th><th>Ações</th></tr></thead><tbody id="ahHistCorpo">${renderHistoricoCorpo(lista)}</tbody></table></div>
    </div></div>
  </div>`;
}

export function renderFluxoBoard(cards) {
  if (!cards.length) {
    return `<div class="fm-card"><div class="fm-body"><div class="fm-empty">Nenhum hotel com reserva enviada ao Financeiro ou crédito registrado ainda.</div></div></div>`;
  }
  const devido = cards.reduce((s, c) => s + c.saldoDevido, 0);
  const credito = cards.reduce((s, c) => s + c.creditoDisponivel, 0);
  return `
    <div class="fm-kpis">
      ${cardFiltro({ label: 'Hotéis com movimento', tone: 'blue', icone: 'total', valor: String(cards.length) })}
      ${cardFiltro({ label: 'Saldo devido', tone: devido > 0 ? 'amber' : 'green', icone: 'dinheiro', valor: money(devido), dica: 'Soma do que ainda falta pagar aos hotéis' })}
      ${cardFiltro({ label: 'Crédito disponível', tone: 'green', icone: 'ok', valor: money(credito), dica: 'Adiantamentos ainda não consumidos' })}
    </div>
    <div class="fm-card"><div class="fm-body">
      <div class="fm-table-wrap"><table class="fm-table"><thead><tr><th>Hotel</th><th>Cidade/UF</th><th>Saldo devido</th><th>Crédito</th><th>Ações</th></tr></thead><tbody>
        ${cards.map((c) => `<tr>
          <td><b>${esc(c.nome)}</b></td>
          <td>${esc(c.cidade || '—')}${c.uf ? `/${esc(c.uf)}` : ''}</td>
          <td>${c.saldoDevido > 0 ? `<span class="fm-badge warn">${money(c.saldoDevido)}</span>` : money(0)}</td>
          <td>${c.creditoDisponivel > 0 ? `<span class="fm-badge ok">${money(c.creditoDisponivel)}</span>` : '—'}</td>
          <td><div class="fm-actions">${iconBtn('data-open-extrato', c.hotelId, 'anexo', 'Ver o extrato do hotel', 'ver')}</div></td>
        </tr>`).join('')}
      </tbody></table></div>
    </div></div>
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
            <div class="ah-detail-row"><span>Preferência do gestor</span><span class="muted">${esc(preferenciaLabel(row))}</span></div>
            ${row.observacao_gestor ? `<div class="ah-detail-row"><span>Observação do gestor</span><span class="muted">${esc(row.observacao_gestor)}</span></div>` : ''}
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
        <div class="ah-modal-foot-left"></div>
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
          </div>
        `).join('')}
      </div>
    ` : '<p class="ah-note">Nenhuma cotação enviada ainda.</p>'}
  `;
}

// Confirmação de pagamento dos lotes antigos de check-out, no layout das listas do Frotas (cards que filtram, busca com chip, tabela fixa).
export function renderFinanceiroShell() {
  return `
    <section class="card mt-16 ah-page" id="ahFinPage">
      <div class="frotas-hub-tab-body fm-shell">
        <div class="fm-topo"><div class="fm-head-actions"><button class="fm-btn soft" id="ahFinAtualizar" type="button">↻ Atualizar</button></div></div>
        <p class="fm-prazo-dia" style="margin:0 0 12px">Lotes de check-out já enviados ao Financeiro, aguardando a confirmação do pagamento.</p>
        <div id="ahFinBoard"></div>
      </div>
    </section>
  `;
}

const SITUACOES_FINANCEIRO = [
  ['PENDENTE', 'Pendentes', 'amber', 'relogio', 'warn'],
  ['EM_ANALISE', 'Em análise', 'blue', 'doc', 'info'],
];

export function filtrarFinanceiro(items, { filtro = 'todos', busca = '' } = {}) {
  const q = normalizeText(busca);
  return items.filter((it) => (filtro === 'todos' || !filtro || it.status === filtro)
    && (!q || normalizeText([it.favorecido_nome, it.descricao, it.status, it.competencia ? brDate(it.competencia) : ''].join(' ')).includes(q)));
}

export function renderFinanceiroCards(items, filtro) {
  const contagem = {};
  items.forEach((it) => { contagem[it.status] = (contagem[it.status] || 0) + 1; });
  const devido = items.reduce((sum, it) => sum + Number(it.valor || 0), 0);
  return cardFiltro({ filtro: 'todos', label: 'Todos', tone: 'blue', icone: 'total', valor: String(items.length), ativo: filtro === 'todos' })
    + SITUACOES_FINANCEIRO.filter(([st]) => contagem[st] || filtro === st)
      .map(([st, label, tone, icone]) => cardFiltro({ filtro: st, label, tone, icone, valor: String(contagem[st] || 0), ativo: filtro === st })).join('')
    + cardFiltro({ label: 'Valor devido', tone: 'purple', icone: 'dinheiro', valor: money(devido), dica: 'Soma dos pagamentos pendentes de confirmação' });
}

export function renderFinanceiroCorpo(lista) {
  if (!lista.length) return '<tr><td colspan="7" class="fm-empty">Nenhum pagamento de hospedagem pendente neste filtro.</td></tr>';
  return lista.map((it) => {
    const selo = SITUACOES_FINANCEIRO.find(([st]) => st === it.status)?.[4] || '';
    const rotulo = it.status === 'EM_ANALISE' ? 'Em análise' : 'Pendente';
    const lote = it.hospedagem_checkout_lote_id;
    const confirmacao = lote
      ? `<td><input type="number" min="0" step="0.01" class="fm-input" data-fin-field="valorPago" data-fin-id="${esc(lote)}" value="${esc(it.valor)}" aria-label="Valor pago"></td>
         <td><input type="text" class="fm-input" data-fin-field="comprovante" data-fin-id="${esc(lote)}" placeholder="https://..." aria-label="Comprovante (URL)"></td>
         <td><button class="fm-btn primary" data-confirmar-pagamento="${esc(lote)}" type="button">Confirmar pagamento</button></td>`
      : '<td colspan="3"><span class="fm-prazo-dia">Sem lote de check-out vinculado (lançamento anterior à reconstrução do módulo): confirme em Financeiro &gt; Pagamentos.</span></td>';
    return `<tr>
      <td><div class="fm-cell"><b>${esc(it.favorecido_nome || '—')}</b><span class="fm-prazo-dia">${esc(it.descricao || '—')}</span></div></td>
      <td>${it.competencia ? brDate(it.competencia) : '—'}</td>
      <td><b>${money(it.valor)}</b></td>
      <td><span class="fm-badge ${selo}">${rotulo}</span></td>
      ${confirmacao}
    </tr>`;
  }).join('');
}

export function renderFinanceiroQueue(items, { filtro = 'todos', busca = '' } = {}) {
  const lista = filtrarFinanceiro(items, { filtro, busca });
  return `<div id="ahFinPainel">
    <div class="fm-kpis" id="ahFinKpis">${renderFinanceiroCards(items, filtro)}</div>
    <div class="fm-card"><div class="fm-body">
      <div class="fm-bar"><div class="fm-search">${ICON.busca}<input class="fm-input" id="ahFinBusca" placeholder="Buscar por hotel, descrição ou competência..." autocomplete="off" value="${esc(busca)}"></div><span data-chip></span><span class="fm-count" id="ahFinCount">${lista.length} pagamento(s)</span></div>
      <div class="fm-table-wrap"><table class="fm-table"><thead><tr><th>Favorecido</th><th>Competência</th><th>Valor devido</th><th>Situação</th><th>Valor pago</th><th>Comprovante (URL)</th><th>Confirmação</th></tr></thead><tbody id="ahFinCorpo">${renderFinanceiroCorpo(lista)}</tbody></table></div>
    </div></div>
  </div>`;
}
