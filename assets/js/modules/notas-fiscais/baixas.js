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
  table, pagination, badge, kpis, openModal, closeModal, confirmar, toast,
  esc, dinheiro, dataBR, dataHoraBR, debounce,
} from '../../core/ui.js';
import {
  supabase, listar, atualizar, inserir, mensagemDeErro,
} from '../../core/supabaseService.js';

const TABELA = 'grm_nf_baixas';
const TABELA_JOBS = 'grm_sync_jobs';
const AGENTE_ID = 'sync-baixa-notas-fiscais';
const BUCKET = 'notas-fiscais';

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

// Cartões do topo: cada um é um filtro de status (e mostra quantos comprovantes
// existem nele, independente dos outros filtros da tela).
const FILTROS = [
  { id: 'todos', label: 'Comprovantes' },
  { id: 'BAIXADO', label: 'Baixados' },
  { id: 'AGUARDANDO_REVISAO', label: 'Revisão manual' },
  { id: 'NOVO', label: 'Na fila' },
  { id: 'ERRO', label: 'Com erro' },
];

// Colunas que a busca por "Descrição" varre: tudo que aparece em texto na linha
// (arquivo, favorecido, empresa, detalhe/erro), o pinCode da baixa e o número do
// DOC (pinDocNumber guardado dentro de pin_codes_json).
const COLUNAS_BUSCA = [
  'arquivo_nome', 'favorecido_nome', 'empresa_detectada', 'erro', 'pin_code',
  'pin_codes_json->0->>pinDocNumber',
];

// A baixa traz o DOC do GRM em pin_codes_json; as mais antigas não têm, e aí vale o
// número do documento da NF lançada que originou a baixa.
const SELECT_LISTA = '*, grm_nf_lancamentos(numero_documento)';

const FILTROS_VAZIOS = {
  descricao: '', dataDe: '', dataAte: '', valorDe: '', valorAte: '',
};

let estado = {
  status: 'loading', erro: null, itens: [], total: 0, filtro: 'todos', pagina: 1, porPagina: 20,
  campos: { ...FILTROS_VAZIOS }, contagens: null, atualizadoEm: null,
};

function usuarioAtual() {
  return window.currentUser?.email || window.currentUser?.id || null;
}

export function baixasFiltroAtivo() {
  return estado.filtro;
}

export function baixasAtualizadoEm() {
  return estado.atualizadoEm;
}

// "948,82", "1.234,56", "948.82" e "R$ 1.234,56" viram número; texto inválido vira null.
function numeroDoCampo(texto) {
  let t = String(texto ?? '').replace(/[^\d.,-]/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (!/^-?\d+\.\d{1,2}$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// O termo vai dentro de um .or() do PostgREST: vírgula, parênteses, aspas e
// curingas quebrariam a expressão, então saem do termo.
function termoBusca(texto) {
  return String(texto ?? '').replace(/[(),"\\%*]/g, ' ').replace(/\s+/g, ' ').trim();
}

function filtrosAtivos(campos = estado.campos) {
  return Object.values(campos).some((v) => String(v).trim() !== '');
}

export async function carregarBaixas() {
  estado = { ...estado, status: 'loading', erro: null };
  try {
    const { descricao, dataDe, dataAte, valorDe, valorAte } = estado.campos;
    const filtros = [];
    if (estado.filtro !== 'todos') filtros.push({ coluna: 'status', valor: [estado.filtro], op: 'in' });
    if (dataDe) filtros.push({ coluna: 'data_pagamento', op: 'gte', valor: dataDe });
    if (dataAte) filtros.push({ coluna: 'data_pagamento', op: 'lte', valor: dataAte });
    const vDe = numeroDoCampo(valorDe);
    const vAte = numeroDoCampo(valorAte);
    if (vDe != null) filtros.push({ coluna: 'valor', op: 'gte', valor: vDe });
    if (vAte != null) filtros.push({ coluna: 'valor', op: 'lte', valor: vAte });
    const termo = termoBusca(descricao);
    const { rows, total, cancelada } = await listar(TABELA, {
      select: SELECT_LISTA,
      filtros,
      busca: termo ? { colunas: COLUNAS_BUSCA, termo } : null,
      ordenar: [{ coluna: 'updated_at', asc: false }],
      pagina: estado.pagina,
      porPagina: estado.porPagina,
      chaveCorrida: 'nf-baixas',
    });
    // Consulta mais nova já foi disparada (filtro mudou no meio): ela é quem grava o resultado.
    if (cancelada) return;
    estado = { ...estado, status: 'ok', itens: rows, total, atualizadoEm: new Date().toISOString() };
  } catch (error) {
    estado = { ...estado, status: 'error', erro: mensagemDeErro(error, TABELA) };
  }
}

async function contarStatus(status) {
  try {
    const { total } = await listar(TABELA, {
      filtros: status ? [{ coluna: 'status', valor: [status], op: 'in' }] : [], porPagina: 1, head: true,
    });
    return total || 0;
  } catch (_) {
    return 0;
  }
}

// Quantos comprovantes há em cada status (cartões do topo e selo da aba).
export async function carregarContagens() {
  const ids = FILTROS.map((f) => f.id);
  const totais = await Promise.all(ids.map((id) => contarStatus(id === 'todos' ? null : id)));
  estado = { ...estado, contagens: Object.fromEntries(ids.map((id, i) => [id, totais[i]])) };
  return estado.contagens;
}

export async function contarRevisaoPendente() {
  return contarStatus('AGUARDANDO_REVISAO');
}

// O bucket é público (a tela de Envios abre os arquivos dele assim): a URL leva
// direto ao PDF do comprovante, pra quem revisa conferir o que foi pago.
function urlComprovante(row) {
  if (!row?.storage_path) return null;
  const { data } = supabase.storage.from(row.storage_bucket || BUCKET).getPublicUrl(row.storage_path);
  return data?.publicUrl || null;
}

function abrirComprovante(id) {
  const url = urlComprovante(estado.itens.find((r) => r.id === id));
  if (!url) {
    toast('Não encontrei o arquivo deste comprovante.', 'warn');
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

function botaoIcone(atributo, id, icone, titulo, estilo = '') {
  return `<button class="ds-btn-icon" ${atributo}="${esc(id)}" type="button" title="${esc(titulo)}" aria-label="${esc(titulo)}"${estilo ? ` style="${estilo}"` : ''}>${icone}</button>`;
}

function acoesLinha(row) {
  const botoes = [];
  if (row.storage_path) {
    botoes.push(botaoIcone('data-baixa-abrir', row.id, '📄', 'Abrir o comprovante', 'border-color:rgba(90,150,230,.5);background:rgba(90,150,230,.12);color:#a9c8f5'));
  }
  if (row.status === 'AGUARDANDO_REVISAO') {
    botoes.push(botaoIcone('data-baixa-revisar', row.id, '🔍', 'Revisar e escolher a parcela', 'border-color:rgba(214,170,60,.5);background:rgba(214,170,60,.12);color:#f0d27a'));
  }
  if (row.status === 'ERRO' || row.status === 'AGUARDANDO_REVISAO') {
    botoes.push(botaoIcone('data-baixa-relancar', row.id, '↻', 'Relançar (volta pra fila)', 'border-color:rgba(63,168,120,.45);background:rgba(63,168,120,.12);color:#9fe6c0'));
  }
  if (['NOVO', 'PROCESSANDO', 'AGUARDANDO_REVISAO', 'ERRO'].includes(row.status)) {
    botoes.push(botaoIcone('data-baixa-cancelar', row.id, '✕', 'Cancelar comprovante'));
  }
  return botoes.join('');
}

// O agente grava via_conta_cadastrada quando o favorecido do comprovante é
// titular de conta de outro titular / beneficiário de pensão cadastrado em RH >
// Folha e Holerite > Contas e a baixa foi casada com a parcela do colaborador.
// Sem esse aviso o financeiro veria favorecido diferente da parcela no GRM.
function viaContaTexto(row) {
  const via = row.extraido_json?.via_conta_cadastrada;
  if (!via) return '';
  const tipo = via.tipo === 'pensao' ? 'pensão' : 'conta de outro titular';
  return `<br>Casou pela aba Contas: ${tipo} de ${esc(via.colaborador_nome)}`;
}

// DOC(s) do GRM que esta baixa quitou: um por parcela (soma de parcelas gera vários).
function docsDaBaixa(row) {
  const itens = Array.isArray(row.pin_codes_json) ? row.pin_codes_json : [];
  const docs = itens.map((i) => i?.pinDocNumber).filter(Boolean);
  if (!docs.length && row.extraido_json?.pinDocNumber) docs.push(row.extraido_json.pinDocNumber);
  const lanc = row.grm_nf_lancamentos;
  const numeroNf = (Array.isArray(lanc) ? lanc[0] : lanc)?.numero_documento;
  if (!docs.length && numeroNf) docs.push(numeroNf);
  return [...new Set(docs.map(String))];
}

function docLinha(row) {
  const docs = docsDaBaixa(row);
  return docs.length ? docs.map(esc).join('<br>') : '<span style="color:#6b7280">—</span>';
}

function detalheLinha(row) {
  if (row.status === 'BAIXADO') return `pinCode ${esc(row.pin_code || '-')}${viaContaTexto(row)}`;
  if (row.status === 'VALIDADO') return `Aguardando o agente confirmar no GRM (pinCode ${esc(row.pin_code || '-')})${viaContaTexto(row)}`;
  if (row.status === 'DIVIDIDO') return `Lote com ${esc(row.extraido_json?.paginas ?? '?')} comprovante(s) — cada um virou um item novo na fila`;
  return `${esc(row.erro || '-')}${viaContaTexto(row)}`;
}

function linhaHtml(row) {
  return `
    <tr>
      <td>${esc(row.arquivo_nome)}</td>
      <td>${esc(row.empresa_detectada || '-')}</td>
      <td>${esc(row.favorecido_nome || '-')}</td>
      <td style="white-space:nowrap"><strong>${docLinha(row)}</strong></td>
      <td>${row.valor != null ? dinheiro(row.valor) : '-'}</td>
      <td>${row.data_pagamento ? dataBR(row.data_pagamento) : '-'}</td>
      <td>${badge(STATUS_LABEL[row.status] || row.status, STATUS_BADGE[row.status] || 'neutral')}</td>
      <td style="max-width:260px;color:#94a3b8;font-size:13px">${detalheLinha(row)}</td>
      <td style="display:flex;gap:6px">${acoesLinha(row)}</td>
    </tr>`;
}

function camposFiltroHtml() {
  const c = estado.campos;
  const campo = (id, rotulo, atributos, valor, estilo) => `
      <div class="ds-field" style="${estilo}">
        <label for="${id}">${rotulo}</label>
        <input id="${id}" value="${esc(valor)}" autocomplete="off" ${atributos}>
      </div>`;
  return `
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">
      ${campo('baixaFiltroDescricao', 'Descrição', 'type="search" placeholder="Arquivo, favorecido, empresa, DOC ou detalhe"', c.descricao, 'flex:2 1 260px')}
      ${campo('baixaFiltroDataDe', 'Pago de', 'type="date"', c.dataDe, 'flex:1 1 150px')}
      ${campo('baixaFiltroDataAte', 'Pago até', 'type="date"', c.dataAte, 'flex:1 1 150px')}
      ${campo('baixaFiltroValorDe', 'Valor de', 'type="text" inputmode="decimal" placeholder="0,00"', c.valorDe, 'flex:1 1 120px')}
      ${campo('baixaFiltroValorAte', 'Valor até', 'type="text" inputmode="decimal" placeholder="0,00"', c.valorAte, 'flex:1 1 120px')}
      <button class="ds-btn" data-baixa-limpar type="button" ${filtrosAtivos() ? '' : 'hidden'}>Limpar filtros</button>
    </div>`;
}

function corpoTabelaHtml() {
  return estado.status === 'ok'
    ? `${table({
      colunas: [
        { id: 'arquivo', label: 'Arquivo' },
        { id: 'empresa', label: 'Empresa' },
        { id: 'favorecido', label: 'Favorecido' },
        { id: 'doc', label: 'DOC' },
        { id: 'valor', label: 'Valor' },
        { id: 'data', label: 'Pago em' },
        { id: 'status', label: 'Status' },
        { id: 'detalhe', label: 'Detalhe' },
        { id: 'acoes', label: '' },
      ],
      linhasHtml: estado.itens.map(linhaHtml).join(''),
      minWidth: 980,
      vazio: filtrosAtivos() ? 'Nenhum comprovante encontrado com esses filtros.' : 'Nenhum comprovante nessa janela.',
    })}${pagination({ pagina: estado.pagina, porPagina: estado.porPagina, total: estado.total, attr: 'data-baixa-pagina' })}`
    : estado.status === 'error'
      ? `<div class="ds-state ds-empty">${esc(estado.erro)}</div>`
      : '<div class="ds-state ds-loading"><span class="ds-spinner"></span>Carregando...</div>';
}

// Cartões = filtro de status. Enquanto as contagens não chegam, aparece "…".
export function cartoesBaixasHtml() {
  const c = estado.contagens;
  return kpis(
    FILTROS.map((f) => ({ chave: f.id, label: f.label, valor: c ? String(c[f.id]) : '…' })),
    { attr: 'data-baixa-filtro', ativo: estado.filtro, colunas: FILTROS.length },
  );
}

export function renderBaixas() {
  return `
    <div id="baixasCartoes">${cartoesBaixasHtml()}</div>
    <article class="ds-card" style="display:grid;gap:14px">
      ${camposFiltroHtml()}
      <div id="baixasTabelaWrap">${corpoTabelaHtml()}</div>
    </article>`;
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
    : `<p style="color:#94a3b8">${esc(row.erro || 'Nenhum lançamento em aberto no GRM bateu com empresa + valor pra este comprovante.')} Confira se o holerite/NF já foi lançado (Painel de Notas Fiscais &gt; Pendentes, ou direto no GRM) antes de relançar.</p>`;

  const overlay = openModal({
    id: 'baixaRevisaoModal',
    conteudoHtml: `
      <h3 class="ds-modal-title">Revisar baixa — ${esc(row.arquivo_nome)}</h3>
      <p class="ds-modal-text">Comprovante: ${esc(row.favorecido_nome || '-')} · ${row.valor != null ? dinheiro(row.valor) : '-'} · pago em ${row.data_pagamento ? dataBR(row.data_pagamento) : '-'} · ${esc(row.empresa_detectada || '-')}</p>
      <button class="ds-btn" data-baixa-abrir-modal type="button" title="Abre o comprovante em outra aba pra conferir antes de escolher">📄 Abrir comprovante</button>
      <div style="max-height:340px;overflow:auto;margin:12px 0">${opcoesHtml}</div>
      <div class="ds-modal-actions">
        <button class="ds-btn" data-ds-cancel type="button">Fechar</button>
        ${candidatos.length ? '<button class="ds-btn ds-btn-primary" data-baixa-confirmar type="button">Confirmar candidato</button>' : ''}
      </div>`,
  });
  overlay.querySelector('[data-baixa-abrir-modal]').addEventListener('click', () => abrirComprovante(row.id));
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
      await Promise.all([carregarBaixas(), carregarContagens()]);
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
    await Promise.all([carregarBaixas(), carregarContagens()]);
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
    await Promise.all([carregarBaixas(), carregarContagens()]);
    aoAtualizar();
  } catch (error) {
    toast(mensagemDeErro(error, TABELA), 'danger', 6000);
  }
}

// Eventos da tabela (paginação e ações da linha). Ficam separados porque, ao
// filtrar, só o #baixasTabelaWrap é redesenhado — redesenhar a tela inteira
// tiraria o foco do campo que a pessoa está digitando.
function vincularEventosTabela(container, aoAtualizar) {
  const wrap = container.querySelector('#baixasTabelaWrap');
  if (!wrap) return;
  wrap.querySelectorAll('[data-baixa-pagina]').forEach((b) => {
    b.addEventListener('click', async () => {
      const p = Number(b.dataset.baixaPagina);
      if (!Number.isFinite(p) || p < 1) return;
      estado = { ...estado, pagina: p };
      await recarregarTabela(container, aoAtualizar);
    });
  });
  wrap.querySelectorAll('[data-baixa-abrir]').forEach((b) => {
    b.addEventListener('click', () => abrirComprovante(b.dataset.baixaAbrir));
  });
  wrap.querySelectorAll('[data-baixa-revisar]').forEach((b) => {
    b.addEventListener('click', () => abrirRevisao(b.dataset.baixaRevisar, aoAtualizar));
  });
  wrap.querySelectorAll('[data-baixa-relancar]').forEach((b) => {
    b.addEventListener('click', () => relancar(b.dataset.baixaRelancar, aoAtualizar));
  });
  wrap.querySelectorAll('[data-baixa-cancelar]').forEach((b) => {
    b.addEventListener('click', () => cancelar(b.dataset.baixaCancelar, aoAtualizar));
  });
}

async function recarregarTabela(container, aoAtualizar) {
  const wrap = container.querySelector('#baixasTabelaWrap');
  if (wrap) wrap.style.opacity = '.55';
  await carregarBaixas();
  // Ainda "loading": outra consulta mais nova está em andamento e vai redesenhar.
  if (estado.status === 'loading') return;
  const atual = container.querySelector('#baixasTabelaWrap');
  if (!atual) return;
  atual.style.opacity = '';
  atual.innerHTML = corpoTabelaHtml();
  vincularEventosTabela(container, aoAtualizar);
  const limpar = container.querySelector('[data-baixa-limpar]');
  if (limpar) limpar.hidden = !filtrosAtivos();
}

const CAMPOS_FILTRO = [
  { id: 'baixaFiltroDescricao', chave: 'descricao', evento: 'input' },
  { id: 'baixaFiltroDataDe', chave: 'dataDe', evento: 'change' },
  { id: 'baixaFiltroDataAte', chave: 'dataAte', evento: 'change' },
  { id: 'baixaFiltroValorDe', chave: 'valorDe', evento: 'input' },
  { id: 'baixaFiltroValorAte', chave: 'valorAte', evento: 'input' },
];

export function vincularEventosBaixas(container, { aoAtualizar }) {
  container.querySelectorAll('[data-baixa-filtro]').forEach((b) => {
    b.addEventListener('click', async () => {
      if (b.dataset.baixaFiltro === estado.filtro) return;
      estado = { ...estado, filtro: b.dataset.baixaFiltro, pagina: 1 };
      await carregarBaixas();
      if (estado.status !== 'loading') aoAtualizar();
    });
  });

  const aplicar = debounce(() => {
    estado = { ...estado, pagina: 1 };
    recarregarTabela(container, aoAtualizar);
  }, 400);
  CAMPOS_FILTRO.forEach(({ id, chave, evento }) => {
    container.querySelector(`#${id}`)?.addEventListener(evento, (e) => {
      estado = { ...estado, campos: { ...estado.campos, [chave]: e.target.value } };
      const limpar = container.querySelector('[data-baixa-limpar]');
      if (limpar) limpar.hidden = !filtrosAtivos();
      // Data é escolhida de uma vez no seletor; texto e valor esperam a pessoa parar de digitar.
      if (evento === 'change') {
        estado = { ...estado, pagina: 1 };
        recarregarTabela(container, aoAtualizar);
      } else {
        aplicar();
      }
    });
  });
  container.querySelector('[data-baixa-limpar]')?.addEventListener('click', async () => {
    estado = { ...estado, campos: { ...FILTROS_VAZIOS }, pagina: 1 };
    await carregarBaixas();
    if (estado.status !== 'loading') aoAtualizar();
  });

  vincularEventosTabela(container, aoAtualizar);
}
