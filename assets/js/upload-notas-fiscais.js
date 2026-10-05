// assets/js/upload-notas-fiscais.js
// Entrada única para documentos financeiros que alimentam o agente do GRM.
// O upload vai para o bucket 'notas-fiscais' e cria uma linha em
// grm_nf_lancamentos. O agente identifica automaticamente se o arquivo é
// holerite ou documento fiscal e aplica o fluxo correspondente.

import { initProtectedPage } from './pageInit.js';
import {
  pageHeader, table, pagination, tabs, badge, toast, confirmar, openModal, closeModal,
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
let linhasPorId = new Map();
let catalogoGrm = null;

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
  // Arquivo de 0 bytes sobe normalmente pro Storage e só estoura no agente
  // ("pdftoppm: Document stream is empty", 05/10). Costuma ser download que não
  // terminou, anexo de e-mail que não baixou ou arquivo só na nuvem (OneDrive).
  if (!file.size) {
    throw new Error(`"${file.name}" está vazio (0 bytes) — baixe o arquivo de novo e reenvie.`);
  }
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

function acaoRelancar(row) {
  if (row.status !== 'ERRO') return '';
  return `<button class="ds-btn-icon" data-unf-relancar="${esc(row.id)}" data-unf-arquivo="${esc(row.arquivo_nome)}" type="button" title="Relançar (volta pra fila)" style="border-color:rgba(63,168,120,.45);background:rgba(63,168,120,.12);color:#9fe6c0">↻</button>`;
}

const STATUS_COMPLETAVEIS = new Set(['AGUARDANDO_DADOS', 'AGUARDANDO_CLASSIFICACAO', 'ERRO']);

function acaoCompletar(row) {
  if (!STATUS_COMPLETAVEIS.has(row.status)) return '';
  return `<button class="ds-btn-icon" data-unf-completar="${esc(row.id)}" type="button" title="Completar dados e relançar" style="border-color:rgba(214,170,60,.5);background:rgba(214,170,60,.12);color:#f0d27a">✎</button>`;
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
      <td style="display:flex;gap:6px">${acaoCompletar(r)}${acaoRelancar(r)}${acaoCancelar(r)}</td>
    </tr>`).join('');
}

// ── completar dados pendentes ────────────────────────────────────────────────
// O agente grava em validacao_erros o que não conseguiu extrair. Aqui a pessoa
// preenche olhando o documento; os valores vão pra ajustes_manuais (RPC
// completar_lancamento_nf) e o agente aplica por cima da extração ao relançar.
const FORMAS_PAGAMENTO_PADRAO = [
  'Boleto', 'Cartão de Crédito', 'Cartão de Débito', 'Cheque', 'Débito em Conta',
  'Depósito / Transferência', 'Dinheiro', 'PIX',
];

function campoDaPendencia(texto) {
  const t = String(texto || '');
  if (t === 'grupo_categoria' || t === 'categoria') return 'categoria';
  if (t.startsWith('tipo_contrato')) return 'tipo_contrato';
  return ['data_vencimento', 'forma_pagamento', 'numero_documento', 'data_conta'].includes(t) ? t : null;
}

function dataBrParaIso(valor) {
  const m = String(valor || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return /^\d{4}-\d{2}-\d{2}/.test(String(valor || '')) ? String(valor).slice(0, 10) : '';
}

async function carregarCatalogo() {
  if (catalogoGrm) return catalogoGrm;
  const { data, error } = await supabase.from('grm_nf_catalogo').select('tipo,nome,grupo').order('nome');
  if (error) throw error;
  const rows = data || [];
  catalogoGrm = {
    categorias: rows.filter((r) => r.tipo === 'CATEGORIA'),
    formas: rows.filter((r) => r.tipo === 'FORMA_PAGAMENTO').map((r) => r.nome),
  };
  return catalogoGrm;
}

function opcoesCategoria(categorias, atual) {
  const grupos = new Map();
  categorias.forEach((c) => {
    if (!grupos.has(c.grupo)) grupos.set(c.grupo, []);
    grupos.get(c.grupo).push(c);
  });
  const conhecida = categorias.some((c) => c.nome === atual);
  const extra = atual && !conhecida ? `<option value="${esc(atual)}" data-grupo="" selected>${esc(atual)}</option>` : '';
  return `<option value="">Selecione…</option>${extra}${Array.from(grupos.entries()).sort(([a], [b]) => a.localeCompare(b, 'pt-BR')).map(([grupo, itens]) => `
    <optgroup label="${esc(grupo || 'Sem grupo')}">${itens.map((c) => `<option value="${esc(c.nome)}" data-grupo="${esc(c.grupo)}"${c.nome === atual ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</optgroup>`).join('')}`;
}

function campoCompletar({ id, label, pendente, html }) {
  const aviso = pendente ? '<small style="color:#e0a93b">● pendente — o agente não achou no documento</small>' : '';
  return `<div class="ds-field"><label for="unfc_${id}">${esc(label)}</label>${html}${aviso}</div>`;
}

async function abrirCompletar(id) {
  const row = linhasPorId.get(id);
  if (!row) return;
  let catalogo;
  try {
    catalogo = await carregarCatalogo();
  } catch (error) {
    toast(mensagemDeErro(error, 'grm_nf_catalogo'), 'danger', 6000);
    return;
  }

  const extraido = row.extraido_json || {};
  const holerite = fluxoDocumento(row) === 'HOLERITE';
  const pendencias = new Set((row.validacao_erros || []).map(campoDaPendencia).filter(Boolean));
  const foraDoAlcance = (row.validacao_erros || []).filter((p) => !campoDaPendencia(p));
  const limpa = (v) => (/^PREENCHER/i.test(String(v || '')) ? '' : String(v || ''));
  const inicial = {
    data_vencimento: dataBrParaIso(extraido.data_vencimento),
    data_conta: dataBrParaIso(extraido.data_conta),
    forma_pagamento: limpa(extraido.forma_pagamento),
    categoria: limpa(extraido.categoria),
    numero_documento: limpa(extraido.numero_documento),
    tipo_contrato: limpa(extraido.tipo_contrato),
  };
  const formas = catalogo.formas.length ? catalogo.formas : FORMAS_PAGAMENTO_PADRAO;
  const formaAtual = inicial.forma_pagamento;
  const optForma = `<option value="">Selecione…</option>${formaAtual && !formas.includes(formaAtual) ? `<option value="${esc(formaAtual)}" selected>${esc(formaAtual)}</option>` : ''}${formas.map((f) => `<option value="${esc(f)}"${f === formaAtual ? ' selected' : ''}>${esc(f)}</option>`).join('')}`;

  const campos = [
    holerite
      ? campoCompletar({
        id: 'tipo_contrato', label: 'Tipo de contrato', pendente: pendencias.has('tipo_contrato'),
        html: `<select id="unfc_tipo_contrato" data-campo="tipo_contrato"><option value="">Selecione…</option>${['Mensalista', 'Intermitente'].map((t) => `<option value="${t}"${t === inicial.tipo_contrato ? ' selected' : ''}>${t}</option>`).join('')}</select>`,
      })
      : campoCompletar({
        id: 'categoria', label: 'Categoria', pendente: pendencias.has('categoria'),
        html: `<select id="unfc_categoria" data-campo="categoria">${opcoesCategoria(catalogo.categorias, inicial.categoria)}</select>`,
      }),
    campoCompletar({
      id: 'forma_pagamento', label: 'Forma de pagamento', pendente: pendencias.has('forma_pagamento'),
      html: `<select id="unfc_forma_pagamento" data-campo="forma_pagamento">${optForma}</select>`,
    }),
    campoCompletar({
      id: 'data_vencimento', label: 'Data de vencimento', pendente: pendencias.has('data_vencimento'),
      html: `<input id="unfc_data_vencimento" data-campo="data_vencimento" type="date" value="${esc(inicial.data_vencimento)}">`,
    }),
    campoCompletar({
      id: 'data_conta', label: 'Data da conta (emissão)', pendente: pendencias.has('data_conta'),
      html: `<input id="unfc_data_conta" data-campo="data_conta" type="date" value="${esc(inicial.data_conta)}">`,
    }),
    holerite ? '' : campoCompletar({
      id: 'numero_documento', label: 'Número do documento', pendente: pendencias.has('numero_documento'),
      html: `<input id="unfc_numero_documento" data-campo="numero_documento" type="text" maxlength="60" value="${esc(inicial.numero_documento)}">`,
    }),
  ].join('');

  const aviso = foraDoAlcance.length
    ? `<p class="ds-modal-text" style="color:#e0a93b">Também pendente, mas não editável aqui: ${esc(foraDoAlcance.join(', '))}. Se for o caso, cancele e reenvie o documento.</p>`
    : '';

  const overlay = openModal({
    id: 'unfCompletarModal',
    conteudoHtml: `
      <h3 class="ds-modal-title">Completar dados</h3>
      <p class="ds-modal-text">${esc(row.arquivo_nome)} — preencha o que o agente não encontrou. Só os campos alterados são enviados; o resto segue como o agente leu.</p>
      ${aviso}
      <div style="display:grid;gap:12px;margin-top:8px">${campos}</div>
      <div class="ds-modal-actions">
        <button class="ds-btn" data-unfc-cancelar type="button">Cancelar</button>
        <button class="ds-btn" data-unfc-salvar type="button" title="Guarda os dados e devolve o documento pra fila">Salvar</button>
        <button class="ds-btn ds-btn-primary" data-unfc-lancar type="button" title="Guarda os dados e dispara o agente agora (lança de verdade no GRM)">Salvar e lançar</button>
      </div>`,
  });

  const coletar = () => {
    const valores = {};
    overlay.querySelectorAll('[data-campo]').forEach((el) => {
      const campo = el.dataset.campo;
      const valor = String(el.value || '').trim();
      if (!valor || valor === inicial[campo]) return;
      valores[campo] = valor;
      if (campo === 'categoria') valores.grupo_categoria = el.selectedOptions[0]?.dataset.grupo || '';
    });
    return valores;
  };

  overlay.querySelector('[data-unfc-cancelar]').addEventListener('click', () => closeModal('unfCompletarModal'));
  const salvar = async (lancar) => {
    const valores = coletar();
    if (!Object.keys(valores).length) {
      toast('Nenhum campo foi alterado.', 'warn');
      return;
    }
    overlay.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try {
      const { error } = await supabase.rpc('completar_lancamento_nf', { p_id: row.id, p_ajustes: valores });
      if (error) throw error;
      closeModal('unfCompletarModal');
      if (lancar && !resumo.jobAtivo) {
        await enfileirarAgente();
        toast('Dados salvos. O agente roda em até 1 minuto e leva alguns minutos por lote.', 'ok', 6000);
      } else if (lancar) {
        toast('Dados salvos. Já há um processamento em andamento — o documento entra no próximo lote.', 'ok', 6000);
      } else {
        toast('Dados salvos. O documento voltou pra fila (use Processamento pra lançar).', 'ok', 6000);
      }
      await carregarResumo();
      if (raiz) { renderResumo(); renderJanelas(); }
      await carregarTabela();
    } catch (error) {
      overlay.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      toast(mensagemDeErro(error, TABELA), 'danger', 6000);
    }
  };
  overlay.querySelector('[data-unfc-salvar]').addEventListener('click', () => salvar(false));
  overlay.querySelector('[data-unfc-lancar]').addEventListener('click', () => salvar(true));
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

async function relancarLancamento(id, nomeArquivo) {
  const ok = await confirmar({
    titulo: 'Relançar envio',
    mensagem: `Voltar "${nomeArquivo}" pra fila? O agente tenta lançar de novo no próximo ciclo.`,
    confirmarLabel: 'Relançar',
    cancelarLabel: 'Voltar',
  });
  if (!ok) return;
  try {
    await atualizar(TABELA, [{ coluna: 'id', valor: id }], {
      status: 'NOVO',
      erro: null,
      updated_at: new Date().toISOString(),
    });
    toast('Envio voltou pra fila.', 'ok');
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
      select: 'id,arquivo_nome,setor,status,erro,created_at,extraido_json,validacao_erros',
      filtros: [{ coluna: 'status', valor: statusDaJanela, op: 'in' }],
      ordenar: [{ coluna: 'created_at', asc: false }],
      pagina: tabelaEstado.pagina,
      porPagina: tabelaEstado.porPagina,
    });
    if (!raiz) return;
    linhasPorId = new Map(rows.map((r) => [r.id, r]));
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
    alvo.querySelectorAll('[data-unf-completar]').forEach((btn) => {
      btn.addEventListener('click', () => abrirCompletar(btn.dataset.unfCompletar));
    });
    alvo.querySelectorAll('[data-unf-relancar]').forEach((btn) => {
      btn.addEventListener('click', () => relancarLancamento(btn.dataset.unfRelancar, btn.dataset.unfArquivo));
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
  const botao = raiz?.querySelector('#unfProcessar');
  if (!botao) return;
  const emAndamento = Boolean(resumo.jobAtivo);
  botao.disabled = resumo.pendentes === 0;
  botao.textContent = emAndamento ? 'Processando…' : `Processamento (${resumo.pendentes})`;
  botao.title = emAndamento
    ? 'O agente já está rodando ou na fila — aguarde terminar antes de disparar de novo.'
    : `Lança até 5 das ${resumo.pendentes} notas/holerites pendentes de verdade no GRM (não é teste).`;
  botao.onclick = dispararAgente;
}

async function enfileirarAgente() {
  const { data: { session } } = await supabase.auth.getSession();
  await inserir(TABELA_JOBS, {
    agente_id: AGENTE_ID,
    status: 'pendente',
    lane: 'alteracoes',
    solicitado_por: session?.user?.email || session?.user?.id || null,
  });
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
    await enfileirarAgente();
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

      <article class="ds-card" style="display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap">
        <div class="ds-field" style="min-width:200px">
          <label for="unfTipo">Setor</label>
          <select id="unfTipo" title="Para holerites, mantenha Reconhecimento automático. Para notas fiscais, o setor ajuda na classificação contábil.">
            ${SETORES.map((s) => `<option value="${esc(s.valor)}">${esc(s.label)}</option>`).join('')}
          </select>
        </div>
        <div class="ds-field" style="flex:1;min-width:240px">
          <label for="unfArquivos">Upload</label>
          <input id="unfArquivos" type="file" multiple accept="${ACCEPT}"
                 title="Holerite: envie um arquivo por funcionário. Duas vias do mesmo funcionário no mesmo PDF são aceitas.">
        </div>
        <button class="ds-btn ds-btn-primary" id="unfEnviar" type="button">Enviar</button>
        <button class="ds-btn ds-btn-primary" id="unfProcessar" type="button">Processamento</button>
      </article>

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
