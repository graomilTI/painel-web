// assets/js/modules/notas-fiscais/components/table.js
// Tabela de NFs (Pendentes | Lançados) usando o design system.

import { table, pagination, badge, esc, dinheiro, dataBR, emptyState, errorState, loadingState } from '../../../core/ui.js';
import { isUrl } from '../service.js';

export function renderTabela({ status, erro, grupos, janela, ordenacao, pagina, porPagina, total }) {
  if (status === 'loading') return loadingState('Consultando Notas Fiscais...');
  if (status === 'error') return errorState(erro, { retryId: 'nfRetry' });
  if (!grupos.length) {
    return emptyState(
      janela === 'lancados' ? 'Nenhuma NF lançada ainda.' : 'Nenhuma NF aguardando lançamento.',
      janela === 'lancados' ? '' : 'As NFs chegam aqui quando a compra tem nota e comprovante anexados.',
    );
  }

  const linhas = grupos.map((g) => {
    const itensLabel = g.itens.length > 1 ? `<br><small style="color:#6b7280">${g.itens.length} itens</small>` : '';
    const statusCell = g.nf_lancado
      ? badge(`Lançado ${dataBR(g.nf_lancado_em)}`, 'ok')
      : badge('Pendente', 'warn');
    const acoes = [
      `<button class="ds-btn" data-consultar="${esc(g.key)}" type="button">Consultar</button>`,
      isUrl(g.nf_url) ? `<a class="ds-btn" href="${esc(g.nf_url)}" target="_blank" rel="noopener">Baixar NF</a>` : '',
      isUrl(g.comprovante_url) ? `<a class="ds-btn" href="${esc(g.comprovante_url)}" target="_blank" rel="noopener">Comprovante</a>` : '',
      !g.nf_lancado ? `<button class="ds-btn ds-btn-primary" data-lancar="${esc(g.key)}" type="button">Lançado</button>` : '',
      g.nf_lancado ? `<button class="ds-btn ds-btn-danger" data-estornar="${esc(g.key)}" type="button">Estornar</button>` : '',
    ].filter(Boolean).join(' ');
    return `<tr>
      <td>${dataBR(g.comprado_em)}${itensLabel}</td>
      <td><strong>${esc(g.regional)}</strong></td>
      <td>${esc(g.solicitante)}</td>
      <td>${dinheiro(g.valor_total)}</td>
      <td>${statusCell}</td>
      <td><div style="display:flex;gap:6px;flex-wrap:wrap">${acoes}</div></td>
    </tr>`;
  }).join('');

  return `
    ${table({
      colunas: [
        { id: 'comprado_em', label: 'Data', sortable: true },
        { id: 'regional', label: 'Regional', sortable: true },
        { id: 'solicitante', label: 'Solicitante', sortable: true },
        { id: 'valor_total', label: 'Valor', sortable: true },
        { id: 'status', label: 'Status' },
        { id: 'acoes', label: 'Ações' },
      ],
      linhasHtml: linhas,
      ordenacao,
      minWidth: 860,
    })}
    ${pagination({ pagina, porPagina, total })}`;
}
