// assets/js/upload-notas-fiscais.js
// Página simples pra enviar NF/comprovante (PDF, XML ou imagem) que alimentam
// o agente de lançamento automático em Contas a Pagar no GRM. Solução
// provisória: os arquivos iam pra uma pasta do Google Drive, mas isso exigia
// criar uma conta de serviço Google só pra isso — agora vão direto pro bucket
// 'notas-fiscais' do Supabase (mesmo bucket já usado por adm-compras.js e
// comprovante-mobile.js) e o agente lê a fila pela tabela grm_nf_lancamentos.
//
// Separada de assets/js/modules/notas-fiscais/ de propósito: aquela página
// controla compras_itens e "lançar" lá é só uma flag interna, sem relação
// com o GRM.

import { initProtectedPage } from './pageInit.js';
import {
  pageHeader, table, badge, toast, loadingState, emptyState, errorState, esc,
} from './core/ui.js';
import { supabase, listar, inserir, mensagemDeErro } from './core/supabaseService.js';

const BUCKET = 'notas-fiscais';
const TABELA = 'grm_nf_lancamentos';
const ACCEPT = '.pdf,.xml,.png,.jpg,.jpeg,.webp';

const SETORES = [
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
};

const STATUS_LABEL = {
  NOVO: 'Novo',
  PROCESSANDO: 'Processando',
  VALIDADO: 'Validado',
  DRY_RUN_OK: 'Testado (dry-run)',
  LANCADO: 'Lançado no GRM',
  AGUARDANDO_DADOS: 'Faltam dados',
  AGUARDANDO_CLASSIFICACAO: 'Falta classificar',
  DUPLICADO: 'Duplicado',
  ERRO: 'Erro',
};

let raiz = null;
let bootId = 0;
let enviando = false;

function safeFileName(name) {
  return String(name || 'arquivo').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
}

function dataHora(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

function renderLinhas(linhas) {
  return linhas.map((r) => `
    <tr>
      <td>${esc(r.arquivo_nome)}</td>
      <td>${esc(SETORES.find((s) => s.valor === r.setor)?.label || r.setor || '-')}</td>
      <td>${esc(dataHora(r.created_at))}</td>
      <td>${badge(STATUS_LABEL[r.status] || r.status, STATUS_BADGE[r.status] || 'neutral')}</td>
      <td>${r.erro ? esc(r.erro) : '-'}</td>
    </tr>`).join('');
}

async function carregarTabela() {
  const alvo = raiz?.querySelector('#unfTabela');
  if (!alvo) return;
  alvo.innerHTML = loadingState('Carregando envios recentes...');
  try {
    const { rows } = await listar(TABELA, {
      select: 'id,arquivo_nome,setor,status,erro,created_at',
      ordenar: [{ coluna: 'created_at', asc: false }],
      porPagina: 100,
    });
    if (!raiz) return;
    alvo.innerHTML = rows.length
      ? table({
        colunas: [
          { id: 'arquivo', label: 'Arquivo' },
          { id: 'tipo', label: 'Tipo' },
          { id: 'enviado_em', label: 'Enviado em' },
          { id: 'status', label: 'Status' },
          { id: 'erro', label: 'Detalhes' },
        ],
        linhasHtml: renderLinhas(rows),
      })
      : emptyState('Nenhuma nota enviada ainda.');
  } catch (error) {
    if (!raiz) return;
    alvo.innerHTML = errorState(mensagemDeErro(error, TABELA), { retryId: 'unfRetry' });
    raiz.querySelector('#unfRetry')?.addEventListener('click', carregarTabela);
  }
}

function render() {
  if (!raiz) return;
  raiz.innerHTML = `
    <section style="display:grid;gap:18px">
      ${pageHeader({
        titulo: 'Enviar Notas Fiscais',
        subtitulo: 'Envie XML, PDF ou imagem da nota/comprovante. O agente lê a fila e lança em Contas a Pagar no GRM automaticamente.',
      })}

      <article class="ds-card" style="display:grid;gap:14px">
        <div class="ds-field">
          <label for="unfTipo">Tipo de despesa</label>
          <select id="unfTipo">
            ${SETORES.map((s) => `<option value="${esc(s.valor)}">${esc(s.label)}</option>`).join('')}
          </select>
        </div>
        <div class="ds-field">
          <label for="unfArquivos">Arquivos (XML, PDF ou imagem)</label>
          <input id="unfArquivos" type="file" multiple accept="${ACCEPT}">
        </div>
        <div>
          <button class="ds-btn ds-btn-primary" id="unfEnviar" type="button">Enviar</button>
        </div>
      </article>

      <article class="ds-card" style="display:grid;gap:14px">
        <h3 style="margin:0">Envios recentes</h3>
        <div id="unfTabela"></div>
      </article>
    </section>`;

  raiz.querySelector('#unfEnviar').addEventListener('click', aoEnviar);
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

  if (sucesso) toast(`${sucesso} arquivo(s) enviado(s).`, 'ok');
  enviando = false;
  if (botao) { botao.disabled = false; botao.textContent = 'Enviar'; }
  if (input) input.value = '';
  if (!falhas || sucesso) await carregarTabela();
}

export async function renderContent(content) {
  bootId += 1;
  const meuBoot = bootId;
  raiz = content;
  render();
  await carregarTabela();
  if (meuBoot !== bootId) return;
}

initProtectedPage('Enviar Notas Fiscais', renderContent);
