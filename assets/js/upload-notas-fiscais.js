// assets/js/upload-notas-fiscais.js
// Entrada única para documentos financeiros que alimentam o agente do GRM.
// O upload vai para o bucket 'notas-fiscais' e cria uma linha em
// grm_nf_lancamentos. O agente identifica automaticamente se o arquivo é
// holerite ou documento fiscal e aplica o fluxo correspondente.

import { initProtectedPage } from './pageInit.js';
import {
  pageHeader, table, pagination, tabs, badge, kpis, toast, confirmar,
  loadingState, emptyState, errorState, esc,
} from './core/ui.js';
import {
  supabase, listar, inserir, atualizar, mensagemDeErro,
} from './core/supabaseService.js';

const BUCKET = 'notas-fiscais';
const TABELA = 'grm_nf_lancamentos';
const TABELA_JOBS = 'grm_sync_jobs';
const AGENTE_ID = 'sync-lancar-notas-fiscais';
const ACCEPT = '.pdf,.xml,.png,.jpg,.jpeg,.webp';

const SETORES = [
  { valor: 'AUTO', label: 'Reconhecimento automático' },
  { valor: 'HOSPEDAGEM', label: 'Hospedagem' },
  { valor: 'FROTAS', label: 'Frotas' },
  { valor: 'RH', label: 'RH' },
  { valor: 'COMPRAS', label: 'Compras' },
  { valor: 'OUTRO', label: 'Outro' },
];

const STATUS_BADGE = {
  NOVO: 'neutral',
  PROCESSANDO: 'neutral',
  VALIDADO: 'ok',
  DRY_RUN_OK: 'ok',
  LANCADO: 'ok',
  AGUARDANDO_DADOS: 'warn',
  AGUARDANDO_CLASSIFICACAO: 'warn',
  DUPLICADO: 'warn',
  ERRO: 'danger',
  CANCELADO: 'neutral',
};

const STATUS_LABEL = {
  NOVO: 'Aguardando leitura',
  PROCESSANDO: 'Reconhecendo documento',
  VALIDADO: 'Validado',
  DRY_RUN_OK: 'Testado (dry-run)',
  LANCADO: 'Lançado no GRM',
  AGUARDANDO_DADOS: 'Faltam dados',
  AGUARDANDO_CLASSIFICACAO: 'Falta classificar',
  DUPLICADO: 'Duplicado',
  ERRO: 'Erro',
  CANCELADO: 'Cancelado',
};

const JANELA_STATUS = {
  pendente: ['NOVO', 'VALIDADO', 'DRY_RUN_OK', 'AGUARDANDO_DADOS', 'AGUARDANDO_CLASSIFICACAO'],
  processando: ['PROCESSANDO'],
  erro: ['ERRO'],
  concluido: ['LANCADO', 'CANCELADO', 'DUPLICADO'],
};

const JANELAS = [
  { id: 'pendente', label: 'Pendente' },
  { id: 'processando', label: 'Processando' },
  { id: 'erro', label: 'Erro' },
  { id: 'concluido', label: 'Concluído' },
];

let raiz = null;
let bootId = 0;
let enviando = false;
let disparando = false;
let resumo = { pendentes: 0, erros: 0, lancados: 0, jobAtivo: null };
let contagens = { pendente: 0, processando: 0, erro: 0, concluido: 0 };
let tabelaEstado = { janela: 'pendente', pagina: 1, porPagina: 25 };

function safeFileName(name) {
  return String(name || 'arquivo').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
}

function dataHora(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function fluxoDocumento(row) {
  return String(row?.extraido_json?.tipo_documento_fluxo || '').toUpperCase();
}

function documentoBadge(row) {
  const fluxo = fluxoDocumento(row);
  if (fluxo === 'HOLERITE') return badge('Holerite', 'ok');
  if (fluxo === 'NOTA_FISCAL') {
    return badge(row?.extraido_json?.tipo_documento || 'Documento fiscal', 'neutral');
  }
  if (row.status === 'NOVO' || row.status === 'PROCESSANDO') return badge('A identificar', 'neutral');
  return badge('Não identificado', 'warn');
}

function detalhesDocumento(row) {
  if (row.erro) return esc(row.erro);
  if (fluxoDocumento(row) === 'HOLERITE') {
    const funcionario = row?.extraido_json?.funcionario_nome || '-';
    const competencia = row?.extraido_json?.competencia || '-';
    return `${esc(funcionario)} · ${esc(competencia)}`;
  }
  const fornecedor = row?.extraido_json?.fornecedor || row?.extraido_json?.fornecedor_nome;
  const numero = row?.extraido_json?.numero_documento;
  if (fornecedor || numero) return [fornecedor, numero && `Doc. ${numero}`].filter(Boolean).map(esc).join(' · ');
  return '-';
}

async function uploadArquivo(file, setor, userId) {
  const ano = new Date().getFullYear();
  const path = `financeiro/lancamento-nf/${ano}/${Date.now()}_${safeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || 'application/octet-stream',
  });
  if (uploadError) throw new Error(`Falha ao enviar "${file.name}": ${uploadError.message}`);

  await inserir(TABELA, {
    storage_bucket: BUCKET,
    storage_path: path,
    arquivo_nome: file.name,
    arquivo_mime_type: file.type || null,
    setor,
    status: 'NOVO',
    enviado_por: userId,
  });
}

const STATUS_CANCELAVEIS = new Set([
  'NOVO', 'PROCESSANDO', 'VALIDADO', 'DRY_RUN_OK',
  'AGUARDANDO_DADOS', 'AGUARDANDO_CLASSIFICACAO', 'DUPLICADO', 'ERRO',
]);

function acaoCancelar(row) {
  if (!STATUS_CANCELAVEIS.has(row.status)) return '';
  return `<button class="ds-btn-icon" data-unf-cancelar="${esc(row.id)}" data-unf-arquivo="${esc(row.arquivo_nome)}" type="button" title="Cancelar envio">✕</button>`;
}

function renderLinhas(linhas) {
  return linhas.map((r) => `
    <tr>
      <td>${esc(r.arquivo_nome)}</td>
      <td>${documentoBadge(r)}</td>
      <td>${esc(SETORES.find((s) => s.valor === r.setor)?.label || r.setor || '-')}</td>
      <td>${esc(dataHora(r.created_at))}</td>
      <td>${badge(STATUS_LABEL[r.status] || r.status, STATUS_BADGE[r.status] || 'neutral')}</td>
      <td>${detalhesDocumento(r)}</td>
      <td>${acaoCancelar(r)}</td>
    </tr>`).join('');
}

async function cancelarLancamento(id, nomeArquivo) {
  const ok = await confirmar({
    titulo: 'Cancelar envio',
    mensagem: `Cancelar "${nomeArquivo}"? O agente não vai mais processar esse arquivo.`,
    confirmarLabel: 'Cancelar envio',
    cancelarLabel: 'Voltar',
  });
  if (!ok) return;
  try {
    await atualizar(TABELA, [{ coluna: 'id', valor: id }], {
      status: 'CANCELADO',
      erro: 'Cancelado manualmente pelo painel.',
      updated_at: new Date().toISOString(),
    });
    toast('Envio cancelado.', 'ok');
    await carregarResumo();
    if (raiz) { renderResumo(); renderJanelas(); }
    await carregarTabela();
  } catch (error) {
    toast(mensagemDeErro(error, TABELA), 'danger', 6000);
  }
}

function renderJanelas() {
  const alvo = raiz?.querySelector('#unfJanelas');
  if (!alvo) return;
  alvo.innerHTML = tabs({
    itens: JANELAS.map((j) => ({ ...j, badge: contagens[j.id] })),
    ativo: tabelaEstado.janela,
    attr: 'data-unf-janela',
  });
  alvo.querySelectorAll('[data-unf-janela]').forEach((b) => {
    b.addEventListener('click', () => {
      if (b.dataset.unfJanela === tabelaEstado.janela) return;
      tabelaEstado = { ...tabelaEstado, janela: b.dataset.unfJanela, pagina: 1 };
      renderJanelas();
      carregarTabela();
    });
  });
}

async function carregarTabela() {
  const alvo = raiz?.querySelector('#unfTabela');
  if (!alvo) return;
  alvo.innerHTML = loadingState('Carregando envios...');
  try {
    const statusDaJanela = JANELA_STATUS[tabelaEstado.janela] || [];
    const { rows, total } = await listar(TABELA, {
      select: 'id,arquivo_nome,setor,status,erro,created_at,extraido_json',
      filtros: [{ coluna: 'status', valor: statusDaJanela, op: 'in' }],
      ordenar: [{ coluna: 'created_at', asc: false }],
      pagina: tabelaEstado.pagina,
      porPagina: tabelaEstado.porPagina,
    });
    if (!raiz) return;
    alvo.innerHTML = rows.length
      ? `${table({
        colunas: [
          { id: 'arquivo', label: 'Arquivo' },
          { id: 'documento', label: 'Documento reconhecido' },
          { id: 'tipo', label: 'Setor auxiliar' },
          { id: 'enviado_em', label: 'Enviado em' },
          { id: 'status', label: 'Status' },
          { id: 'detalhes', label: 'Detalhes' },
          { id: 'acoes', label: '' },
        ],
        linhasHtml: renderLinhas(rows),
      })}${pagination({ pagina: tabelaEstado.pagina, porPagina: tabelaEstado.porPagina, total, attr: 'data-unf-pagina' })}`
      : emptyState('Nenhum documento nessa janela.');
    alvo.querySelectorAll('[data-unf-cancelar]').forEach((btn) => {
      btn.addEventListener('click', () => cancelarLancamento(btn.dataset.unfCancelar, btn.dataset.unfArquivo));
    });
    alvo.querySelectorAll('[data-unf-pagina]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pagina = Number(btn.dataset.unfPagina);
        if (!Number.isFinite(pagina) || pagina < 1) return;
        tabelaEstado = { ...tabelaEstado, pagina };
        carregarTabela();
      });
    });
  } catch (error) {
    if (!raiz) return;
    alvo.innerHTML = errorState(mensagemDeErro(error, TABELA), { retryId: 'unfRetry' });
    raiz.querySelector('#unfRetry')?.addEventListener('click', carregarTabela);
  }
}

async function carregarResumo() {
  const [
    { total: pendentes }, { total: erros }, { total: lancados }, { rows: jobsAtivos },
    { total: cPendente }, { total: cProcessando }, { total: cConcluido },
  ] = await Promise.all([
    listar(TABELA, { filtros: [{ coluna: 'status', valor: 'NOVO' }], porPagina: 1, head: true }),
    listar(TABELA, { filtros: [{ coluna: 'status', valor: 'ERRO' }], porPagina: 1, head: true }),
    listar(TABELA, { filtros: [{ coluna: 'status', valor: 'LANCADO' }], porPagina: 1, head: true }),
    listar(TABELA_JOBS, {
      select: 'id,status,created_at',
      filtros: [{ coluna: 'agente_id', valor: AGENTE_ID }, { coluna: 'status', valor: ['pendente', 'rodando'], op: 'in' }],
      ordenar: [{ coluna: 'created_at', asc: false }],
      porPagina: 1,
    }).catch(() => ({ rows: [] })),
    listar(TABELA, { filtros: [{ coluna: 'status', valor: JANELA_STATUS.pendente, op: 'in' }], porPagina: 1, head: true }),
    listar(TABELA, { filtros: [{ coluna: 'status', valor: JANELA_STATUS.processando, op: 'in' }], porPagina: 1, head: true }),
    listar(TABELA, { filtros: [{ coluna: 'status', valor: JANELA_STATUS.concluido, op: 'in' }], porPagina: 1, head: true }),
  ]);
  resumo = { pendentes, erros, lancados, jobAtivo: jobsAtivos?.[0] || null };
  contagens = {
    pendente: cPendente, processando: cProcessando, erro: erros, concluido: cConcluido,
  };
}

function renderResumo() {
  const alvo = raiz?.querySelector('#unfResumo');
  if (!alvo) return;
  const emAndamento = Boolean(resumo.jobAtivo);
  alvo.innerHTML = `
    ${kpis([
      { label: 'Pendentes de lançamento', valor: String(resumo.pendentes) },
      { label: 'Com erro', valor: String(resumo.erros) },
      { label: 'Lançados no GRM', valor: String(resumo.lancados) },
    ])}
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <button class="ds-btn ds-btn-primary" id="unfProcessar" type="button" ${resumo.pendentes === 0 ? 'disabled' : ''}>
        ${emAndamento ? 'Processamento em andamento…' : 'Processar pendentes agora'}
      </button>
      <small style="opacity:.72">
        ${emAndamento
    ? 'O agente já está rodando ou na fila — aguarde terminar antes de disparar de novo.'
    : 'Lança até 5 notas/holerites pendentes de verdade no GRM (não é teste). Roda em alguns minutos.'}
      </small>
    </div>`;
  const botao = alvo.querySelector('#unfProcessar');
  if (botao) botao.addEventListener('click', dispararAgente);
}

async function dispararAgente() {
  if (disparando || !raiz) return;
  if (resumo.jobAtivo) {
    toast('Já existe um processamento em andamento para este agente.', 'warn');
    return;
  }
  const confirmado = await confirmar({
    titulo: 'Processar pendentes agora',
    mensagem: `Isso vai lançar de verdade no GRM até 5 das ${resumo.pendentes} notas/holerites pendentes (sem revisão manual por item). Confirmar?`,
    confirmarLabel: 'Processar agora',
  });
  if (!confirmado) return;

  disparando = true;
  const botao = raiz.querySelector('#unfProcessar');
  if (botao) { botao.disabled = true; botao.textContent = 'Disparando…'; }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    await inserir(TABELA_JOBS, {
      agente_id: AGENTE_ID,
      status: 'pendente',
      lane: 'alteracoes',
      solicitado_por: session?.user?.email || session?.user?.id || null,
    });
    toast('Processamento disparado. O agente roda em até 1 minuto e leva alguns minutos por lote.', 'ok', 6000);
    await carregarResumo();
    if (raiz) renderResumo();
  } catch (error) {
    toast(mensagemDeErro(error, TABELA_JOBS), 'danger', 6000);
  } finally {
    disparando = false;
  }
}

function render() {
  if (!raiz) return;
  raiz.innerHTML = `
    <section style="display:grid;gap:18px">
      ${pageHeader({
        titulo: 'Enviar Notas Fiscais e Holerites',
        subtitulo: 'Envie XML, PDF ou imagem. O agente reconhece automaticamente o tipo do documento e usa o fluxo correto no Contas a Pagar do GRM.',
      })}

      <article class="ds-card" style="display:grid;gap:14px">
        <div class="ds-field">
          <label for="unfTipo">Setor auxiliar</label>
          <select id="unfTipo">
            ${SETORES.map((s) => `<option value="${esc(s.valor)}">${esc(s.label)}</option>`).join('')}
          </select>
          <small style="opacity:.72">Para holerites, mantenha Reconhecimento automático. Para notas fiscais, o setor ajuda na classificação contábil.</small>
        </div>
        <div class="ds-field">
          <label for="unfArquivos">Arquivos (XML, PDF ou imagem)</label>
          <input id="unfArquivos" type="file" multiple accept="${ACCEPT}">
          <small style="opacity:.72">Holerite: envie um arquivo por funcionário. Duas vias do mesmo funcionário no mesmo PDF são aceitas.</small>
        </div>
        <div>
          <button class="ds-btn ds-btn-primary" id="unfEnviar" type="button">Enviar</button>
        </div>
      </article>

      <article class="ds-card" style="display:grid;gap:14px" id="unfResumo"></article>

      <article class="ds-card" style="display:grid;gap:14px">
        <h3 style="margin:0">Envios</h3>
        <div id="unfJanelas"></div>
        <div id="unfTabela"></div>
      </article>
    </section>`;

  raiz.querySelector('#unfEnviar').addEventListener('click', aoEnviar);
  renderResumo();
  renderJanelas();
}

async function aoEnviar() {
  if (enviando || !raiz) return;
  const input = raiz.querySelector('#unfArquivos');
  const setor = raiz.querySelector('#unfTipo').value;
  const arquivos = Array.from(input?.files || []);
  if (!arquivos.length) {
    toast('Selecione ao menos um arquivo.', 'warn');
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    toast('Sessão expirada. Recarregue a página.', 'danger');
    return;
  }

  enviando = true;
  const botao = raiz.querySelector('#unfEnviar');
  if (botao) { botao.disabled = true; botao.textContent = 'Enviando...'; }

  let sucesso = 0;
  let falhas = 0;
  for (const arquivo of arquivos) {
    try {
      await uploadArquivo(arquivo, setor, session.user.id);
      sucesso += 1;
    } catch (error) {
      falhas += 1;
      toast(String(error?.message || error), 'danger', 6000);
    }
  }

  if (sucesso) toast(`${sucesso} arquivo(s) enviado(s) para reconhecimento.`, 'ok');
  enviando = false;
  if (botao) { botao.disabled = false; botao.textContent = 'Enviar'; }
  if (input) input.value = '';
  if (!falhas || sucesso) {
    await carregarResumo();
    if (!raiz) return;
    renderResumo();
    renderJanelas();
    await carregarTabela();
  }
}

export async function renderContent(content) {
  bootId += 1;
  const meuBoot = bootId;
  raiz = content;
  render();
  await Promise.all([carregarTabela(), carregarResumo()]);
  if (meuBoot !== bootId) return;
  renderResumo();
  renderJanelas();
}

initProtectedPage('Enviar Notas Fiscais e Holerites', renderContent);
