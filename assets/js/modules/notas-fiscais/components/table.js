// assets/js/modules/notas-fiscais/components/table.js
// Tabela de NFs (Pendentes | Lançados) usando o design system.

import { table, pagination, badge, esc, dinheiro, dataBR, emptyState, errorState, loadingState } from '../../../core/ui.js';
import { isUrl, fornecedorNaoCadastradoNoGrm, podeCompletarDadosGrm } from '../service.js';
import { icone } from './icones.js';

// Andamento da NF no agente de lançamento do GRM (grm_nf_lancamentos).
const STATUS_GRM = {
  NOVO: ['Na fila do GRM', 'neutral'],
  PROCESSANDO: ['Lançando no GRM…', 'neutral'],
  VALIDADO: ['Lançando no GRM…', 'neutral'],
  DRY_RUN_OK: ['Conferido (teste)', 'neutral'],
  AGUARDANDO_DADOS: ['GRM: faltam dados', 'warn'],
  AGUARDANDO_CLASSIFICACAO: ['GRM: sem categoria', 'warn'],
  DUPLICADO: ['GRM: duplicada', 'warn'],
  ERRO: ['Erro no GRM', 'danger'],
  LANCADO: ['Lançado no GRM', 'ok'],
  CANCELADO: ['Cancelado', 'warn'],
};

function statusGrm(g) {
  if (!g.grm) return badge(g.storage_path ? 'Não enviado ao GRM' : 'Pendente', 'warn');
  const [label, tipo] = STATUS_GRM[g.grm.status] || [g.grm.status, 'warn'];
  // Fornecedor fora do Graint: mostra o motivo (o agente de cadastro pode estar cuidando disso).
  const motivo = fornecedorNaoCadastradoNoGrm(g)
    ? `<br><small style="color:#6b7280">${esc(String(g.grm.erro).slice(0, 220))}</small>`
    : '';
  return `${badge(label, tipo)}${motivo}`;
}

// Ação em ícone: o texto vai em title (tooltip) e aria-label.
function botaoIcone({ attr, key, icon, titulo, variante = '' }) {
  return `<button class="ds-icon-btn ${variante}" ${attr}="${esc(key)}" type="button" title="${esc(titulo)}" aria-label="${esc(titulo)}">${icone(icon)}</button>`;
}

function linkIcone({ href, icon, titulo, contador = null }) {
  return `<a class="ds-icon-btn" href="${esc(href)}" target="_blank" rel="noopener" title="${esc(titulo)}" aria-label="${esc(titulo)}">${icone(icon)}${contador ? `<span class="ds-icon-count">${contador}</span>` : ''}</a>`;
}

function acaoLancamento(g) {
  if (g.nf_lancado) return '';
  if (!g.storage_path) {
    return botaoIcone({ attr: 'data-lancar', key: g.key, icon: 'lancado', variante: 'primary', titulo: 'Marcar lançado (NF sem arquivo anexado: não passa pelo agente)' });
  }
  if (!g.grm) return botaoIcone({ attr: 'data-enviar-grm', key: g.key, icon: 'enviar', variante: 'primary', titulo: 'Enviar ao GRM' });
  if (g.grm.status === 'ERRO') {
    const cadastrar = fornecedorNaoCadastradoNoGrm(g)
      ? botaoIcone({ attr: 'data-cadastrar-fornecedor', key: g.key, icon: 'fornecedor', titulo: 'Cadastrar fornecedor no GRM (dados da Receita); a NF volta sozinha para a fila' })
      : '';
    return `${cadastrar}${botaoIcone({ attr: 'data-enviar-grm', key: g.key, icon: 'relancar', variante: 'primary', titulo: 'Relançar no GRM' })}`;
  }
  return '';
}

// Faltou dado na NF: o lápis abre o formulário pra preencher e devolver a NF à fila.
function acaoCompletar(g) {
  return podeCompletarDadosGrm(g)
    ? botaoIcone({ attr: 'data-completar', key: g.key, icon: 'editar', variante: 'warn', titulo: 'Completar dados que faltam e relançar' })
    : '';
}

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
    const pendencias = !g.nf_lancado && g.pendencias?.length
      ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">${g.pendencias.map((p) => badge(p, 'danger')).join(' ')}</div>`
      : '';
    const statusCell = (g.nf_lancado
      ? badge(`Lançado ${dataBR(g.nf_lancado_em)}`, 'ok')
      : statusGrm(g)) + pendencias;
    const acoes = [
      botaoIcone({ attr: 'data-consultar', key: g.key, icon: 'consultar', titulo: 'Consultar detalhes da NF' }),
      acaoCompletar(g),
      isUrl(g.nf_url) ? linkIcone({ href: g.nf_url, icon: 'nf', titulo: 'Baixar NF' }) : '',
      ...(g.nf_anexos || []).filter((a) => isUrl(a.url)).map((a, i) => linkIcone({ href: a.url, icon: 'anexo', titulo: `Anexo ${i + 2}${a.nome ? `: ${a.nome}` : ''}`, contador: i + 2 })),
      isUrl(g.comprovante_url) ? linkIcone({ href: g.comprovante_url, icon: 'comprovante', titulo: 'Baixar comprovante' }) : '',
      acaoLancamento(g),
      g.nf_lancado ? botaoIcone({ attr: 'data-estornar', key: g.key, icon: 'estornar', variante: 'danger', titulo: 'Estornar NF (volta para Pendentes)' }) : '',
    ].filter(Boolean).join('');
    return `<tr>
      <td>${dataBR(g.comprado_em)}${itensLabel}</td>
      <td><strong>${esc(g.regional)}</strong><br><small style="color:#6b7280">${esc(g.categoria || 'Geral')}</small></td>
      <td>${esc(g.solicitante)}</td>
      <td>${dinheiro(g.valor_total)}</td>
      <td>${statusCell}</td>
      <td><div class="ds-icon-actions">${acoes}</div></td>
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
