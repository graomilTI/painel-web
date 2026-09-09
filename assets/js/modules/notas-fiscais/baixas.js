// assets/js/modules/notas-fiscais/baixas.js
// Aba "Baixas" do Painel de Notas Fiscais: revisão e acompanhamento da fila
// de baixa de pagamentos (holerite/NF) a partir de comprovante bancário.
//
// Fluxo: Financeiro (assets/js/financeiro.js, aba Pagamentos) anexa os
// comprovantes -> fila grm_nf_baixas -> agente sync-baixa-notas-fiscais
// (agentes-grm-sync/grmserver-baixa-notas-fiscais-api.js) extrai os dados,
// acha o lançamento certo no GRM por empresa+valor+nome e, se o match for
// único, dá baixa sozinho (payInvoice/payment). Quando o match é ambíguo ou
// não existe, o item fica em AGUARDANDO_REVISAO e um humano escolhe o
// candidato certo aqui (ou cancela/relança) — nada é baixado sem match
// único, automático ou confirmado manualmente.

import {
  table, pagination, badge, openModal, closeModal, confirmar, toast,
  esc, dinheiro, dataBR, dataHoraBR,
} from '../../core/ui.js';
import { listar, atualizar, inserir, mensagemDeErro } from '../../core/supabaseService.js';

const TABELA = 'grm_nf_baixas';
const TABELA_JOBS = 'grm_sync_jobs';
const AGENTE_ID = 'sync-baixa-notas-fiscais';

const STATUS_LABEL = {
  NOVO: 'Na fila',
  PROCESSANDO: 'Processando',
  AGUARDANDO_REVISAO: 'Revisão manual',
  VALIDADO: 'Validado',
  BAIXADO: 'Baixado',
  DIVIDIDO: 'Lote dividido',
  DUPLICADO: 'Duplicado',
  ERRO: 'Erro',
  CANCELADO: 'Cancelado',
};

const STATUS_BADGE = {
  NOVO: 'neutral',
  PROCESSANDO: 'neutral',
  AGUARDANDO_REVISAO: 'warn',
  VALIDADO: 'ok',
  BAIXADO: 'ok',
  DIVIDIDO: 'neutral',
  DUPLICADO: 'warn',
  ERRO: 'danger',
  CANCELADO: 'neutral',
};

const FILTROS = [
  { id: 'todos', label: 'Todos' },
  { id: 'AGUARDANDO_REVISAO', label: 'Revisão manual' },
  { id: 'NOVO', label: 'Na fila' },
  { id: 'BAIXADO', label: 'Baixado' },
  { id: 'ERRO', label: 'Erro' },
];

let estado = {
  status: 'loading', erro: null, itens: [], total: 0, filtro: 'todos', pagina: 1, porPagina: 20,
};

function usuarioAtual() {
  return window.currentUser?.email || window.currentUser?.id || null;
}

export function baixasFiltroAtivo() {
  return estado.filtro;
}

export async function carregarBaixas() {
  estado = { ...estado, status: 'loading', erro: null };
  try {
    const filtros = [];
    if (estado.filtro !== 'todos') filtros.push({ coluna: 'status', valor: [estado.filtro], op: 'in' });
    const { rows, total } = await listar(TABELA, {
      filtros,
      ordenar: [{ coluna: 'updated_at', asc: false }],
      pagina: estado.pagina,
      porPagina: estado.porPagina,
    });
    estado = { ...estado, status: 'ok', itens: rows, total };
  } catch (error) {
    estado = { ...estado, status: 'error', erro: mensagemDeErro(error, TABELA) };
  }
}

export async function contarRevisaoPendente() {
  try {
    const { total } = await listar(TABELA, {
      filtros: [{ coluna: 'status', valor: 'AGUARDANDO_REVISAO' }], porPagina: 1, head: true,
    });
    return total || 0;
  } catch (_) {
    return 0;
  }
}

function acoesLinha(row) {
  const botoes = [];
  if (row.status === 'AGUARDANDO_REVISAO') {
    botoes.push(`<button class="ds-btn ds-btn-primary" data-baixa-revisar="${esc(row.id)}" type="button">Revisar</button>`);
  }
  if (row.status === 'ERRO') {
    botoes.push(`<button class="ds-btn" data-baixa-relancar="${esc(row.id)}" type="button">Relançar</button>`);
  }
  if (['NOVO', 'PROCESSANDO', 'AGUARDANDO_REVISAO', 'ERRO'].includes(row.status)) {
    botoes.push(`<button class="ds-btn ds-btn-danger" data-baixa-cancelar="${esc(row.id)}" type="button">Cancelar</button>`);
  }
  return botoes.join('');
}

function detalheLinha(row) {
  if (row.status === 'BAIXADO') return `pinCode ${esc(row.pin_code || '-')}`;
  if (row.status === 'VALIDADO') return `Aguardando o agente confirmar no GRM (pinCode ${esc(row.pin_code || '-')})`;
  if (row.status === 'DIVIDIDO') return `Lote com ${esc(row.extraido_json?.paginas ?? '?')} comprovante(s) — cada um virou um item novo na fila`;
  return esc(row.erro || '-');
}

function linhaHtml(row) {
  return `
    <tr>
      <td>${esc(row.arquivo_nome)}</td>
      <td>${esc(row.empresa_detectada || '-')}</td>
      <td>${esc(row.favorecido_nome || '-')}</td>
      <td>${row.valor != null ? dinheiro(row.valor) : '-'}</td>
      <td>${row.data_pagamento ? dataBR(row.data_pagamento) : '-'}</td>
      <td>${badge(STATUS_LABEL[row.status] || row.status, STATUS_BADGE[row.status] || 'neutral')}</td>
      <td style="max-width:260px;color:#94a3b8;font-size:13px">${detalheLinha(row)}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">${acoesLinha(row)}</td>
    </tr>`;
}

export function renderBaixas() {
  const corpo = estado.status === 'ok'
    ? `${table({
      colunas: [
        { id: 'arquivo', label: 'Arquivo' },
        { id: 'empresa', label: 'Empresa' },
        { id: 'favorecido', label: 'Favorecido' },
        { id: 'valor', label: 'Valor' },
        { id: 'data', label: 'Pago em' },
        { id: 'status', label: 'Status' },
        { id: 'detalhe', label: 'Detalhe' },
        { id: 'acoes', label: '' },
      ],
      linhasHtml: estado.itens.map(linhaHtml).join(''),
      vazio: 'Nenhum comprovante nessa janela.',
    })}${pagination({ pagina: estado.pagina, porPagina: estado.porPagina, total: estado.total, attr: 'data-baixa-pagina' })}`
    : estado.status === 'error'
      ? `<div class="ds-state ds-empty">${esc(estado.erro)}</div>`
      : '<div class="ds-state ds-loading"><span class="ds-spinner"></span>Carregando...</div>';

  return `
    <div class="fin-setor-filter" style="margin:0 0 14px">
      ${FILTROS.map((f) => `<button class="fin-setor-btn ${estado.filtro === f.id ? 'active' : ''}" data-baixa-filtro="${esc(f.id)}" type="button">${esc(f.label)}</button>`).join('')}
    </div>
    <div id="baixasTabelaWrap">${corpo}</div>`;
}

async function abrirRevisao(id, aoAtualizar) {
  const row = estado.itens.find((r) => r.id === id);
  if (!row) return;
  const candidatos = Array.isArray(row.candidatos_json) ? row.candidatos_json : [];

  const opcoesHtml = candidatos.length
    ? candidatos.map((c, i) => `
      <label style="display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid rgba(148,163,184,.12)">
        <input type="radio" name="baixaCandidato" value="${i}" ${i === 0 ? 'checked' : ''} style="margin-top:3px">
        <span>
          <strong>${esc(c.favoredName)}</strong> — ${dinheiro(c.valor)}<br>
          <span style="color:#94a3b8;font-size:13px">Doc ${esc(c.pinDocNumber || '-')} · vencimento ${c.pinDueDate ? dataBR(c.pinDueDate) : '-'} · pinCode ${esc(c.pinCode)}</span>
        </span>
      </label>`).join('')
    : `<p style="color:#94a3b8">Nenhum lançamento em aberto no GRM bateu com empresa + valor pra este comprovante. Confira se o holerite/NF já foi lançado (Painel de Notas Fiscais &gt; Pendentes, ou direto no GRM) antes de relançar.</p>`;

  const overlay = openModal({
    id: 'baixaRevisaoModal',
    conteudoHtml: `
      <h3 class="ds-modal-title">Revisar baixa — ${esc(row.arquivo_nome)}</h3>
      <p class="ds-modal-text">Comprovante: ${esc(row.favorecido_nome || '-')} · ${row.valor != null ? dinheiro(row.valor) : '-'} · pago em ${row.data_pagamento ? dataBR(row.data_pagamento) : '-'} · ${esc(row.empresa_detectada || '-')}</p>
      <div style="max-height:340px;overflow:auto;margin:12px 0">${opcoesHtml}</div>
      <div class="ds-modal-actions">
        <button class="ds-btn" data-ds-cancel type="button">Fechar</button>
        ${candidatos.length ? '<button class="ds-btn ds-btn-primary" data-baixa-confirmar type="button">Confirmar candidato</button>' : ''}
      </div>`,
  });
  overlay.querySelector('[data-ds-cancel]').addEventListener('click', () => closeModal('baixaRevisaoModal'));
  overlay.querySelector('[data-baixa-confirmar]')?.addEventListener('click', async () => {
    const idx = Number(overlay.querySelector('input[name="baixaCandidato"]:checked')?.value);
    const candidato = candidatos[idx];
    if (!candidato) return;
    try {
      await atualizar(TABELA, [{ coluna: 'id', valor: row.id }], {
        status: 'VALIDADO',
        pin_code: String(candidato.pinCode),
        pin_codes_json: [{
          pinCode: String(candidato.pinCode), patCode: candidato.patCode ?? null,
          valor: candidato.valor, pinDocNumber: candidato.pinDocNumber || null,
        }],
        pat_code: candidato.patCode ?? null,
        candidatos_json: [],
        erro: null,
      });
      await inserir(TABELA_JOBS, {
        agente_id: AGENTE_ID, status: 'pendente', lane: 'alteracoes', solicitado_por: usuarioAtual(),
      });
      toast('Candidato confirmado — a baixa é enviada ao GRM no próximo ciclo do agente.', 'ok');
      closeModal('baixaRevisaoModal');
      await carregarBaixas();
      aoAtualizar();
    } catch (error) {
      toast(mensagemDeErro(error, TABELA), 'danger', 6000);
    }
  });
}

async function relancar(id, aoAtualizar) {
  const ok = await confirmar({
    titulo: 'Relançar comprovante',
    mensagem: 'Volta pra fila pra o agente tentar de novo (extração e casamento). Confirmar?',
    confirmarLabel: 'Relançar',
  });
  if (!ok) return;
  try {
    await atualizar(TABELA, [{ coluna: 'id', valor: id }], { status: 'NOVO', erro: null });
    await inserir(TABELA_JOBS, {
      agente_id: AGENTE_ID, status: 'pendente', lane: 'alteracoes', solicitado_por: usuarioAtual(),
    });
    toast('Comprovante voltou pra fila.', 'ok');
    await carregarBaixas();
    aoAtualizar();
  } catch (error) {
    toast(mensagemDeErro(error, TABELA), 'danger', 6000);
  }
}

async function cancelar(id, aoAtualizar) {
  const ok = await confirmar({
    titulo: 'Cancelar comprovante',
    mensagem: 'O agente não vai mais processar esse comprovante. Confirmar?',
    confirmarLabel: 'Cancelar comprovante',
  });
  if (!ok) return;
  try {
    await atualizar(TABELA, [{ coluna: 'id', valor: id }], { status: 'CANCELADO' });
    toast('Comprovante cancelado.', 'ok');
    await carregarBaixas();
    aoAtualizar();
  } catch (error) {
    toast(mensagemDeErro(error, TABELA), 'danger', 6000);
  }
}

export function vincularEventosBaixas(container, { aoAtualizar }) {
  container.querySelectorAll('[data-baixa-filtro]').forEach((b) => {
    b.addEventListener('click', async () => {
      if (b.dataset.baixaFiltro === estado.filtro) return;
      estado = { ...estado, filtro: b.dataset.baixaFiltro, pagina: 1 };
      await carregarBaixas();
      aoAtualizar();
    });
  });
  container.querySelectorAll('[data-baixa-pagina]').forEach((b) => {
    b.addEventListener('click', async () => {
      const p = Number(b.dataset.baixaPagina);
      if (!Number.isFinite(p) || p < 1) return;
      estado = { ...estado, pagina: p };
      await carregarBaixas();
      aoAtualizar();
    });
  });
  container.querySelectorAll('[data-baixa-revisar]').forEach((b) => {
    b.addEventListener('click', () => abrirRevisao(b.dataset.baixaRevisar, aoAtualizar));
  });
  container.querySelectorAll('[data-baixa-relancar]').forEach((b) => {
    b.addEventListener('click', () => relancar(b.dataset.baixaRelancar, aoAtualizar));
  });
  container.querySelectorAll('[data-baixa-cancelar]').forEach((b) => {
    b.addEventListener('click', () => cancelar(b.dataset.baixaCancelar, aoAtualizar));
  });
}
