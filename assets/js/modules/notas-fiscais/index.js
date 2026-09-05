// assets/js/modules/notas-fiscais/index.js
// Página de Notas Fiscais no padrão da fundação (docs/ARQUITETURA.md).
//
// Demanda 6.1 do plano de reestruturação: a aba "Resumo Financeiro" foi
// removida — o módulo agora tem apenas as janelas PENDENTES e LANÇADOS,
// com busca, ordenação, paginação, estados de tela e auditoria do lançamento.

import { pageHeader, tabs, kpis, dataStatus, esc, dinheiro, debounce, toast, confirmar } from '../../core/ui.js';
import { normalizarTexto } from '../../core/supabaseService.js';
import { nfState } from './state.js';
import { carregarNotas, agruparPorNf, resumo, lancarNf, estornarNf } from './service.js';
import { renderTabela } from './components/table.js';
import { abrirModalNf } from './components/modal.js';

let raiz = null;
let bootId = 0; // evita boot/listeners duplicados em soft-nav

function gruposVisiveis(estado) {
  let grupos = agruparPorNf(estado.itens, estado.pagamentos)
    .filter((g) => (estado.janela === 'lancados' ? g.nf_lancado : !g.nf_lancado));

  const termo = normalizarTexto(estado.busca);
  if (termo) {
    grupos = grupos.filter((g) => [g.regional, g.solicitante, g.fornecedor, g.cnpj, g.numero]
      .some((v) => normalizarTexto(v).includes(termo)));
  }

  const { coluna, asc } = estado.ordenacao;
  grupos.sort((a, b) => {
    const va = a[coluna] ?? '';
    const vb = b[coluna] ?? '';
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return asc ? cmp : -cmp;
  });
  return grupos;
}

function render() {
  if (!raiz) return;
  const estado = nfState.get();
  const todosGrupos = agruparPorNf(estado.itens, estado.pagamentos);
  const r = resumo(todosGrupos);
  const grupos = gruposVisiveis(estado);
  const total = grupos.length;
  const inicio = (estado.pagina - 1) * estado.porPagina;
  const paginaGrupos = grupos.slice(inicio, inicio + estado.porPagina);

  raiz.innerHTML = `
    <section style="display:grid;gap:18px">
      ${pageHeader({
        titulo: 'Notas Fiscais',
        subtitulo: 'NFs de compras aguardando lançamento contábil e histórico das já lançadas.',
      })}

      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        ${tabs({
          itens: [
            { id: 'pendentes', label: 'Pendentes', badge: r.pendentes },
            { id: 'lancados', label: 'Lançados', badge: r.lancados },
          ],
          ativo: estado.janela,
          attr: 'data-nf-janela',
        })}
        ${estado.atualizadoEm ? dataStatus({
          atualizadoEm: estado.atualizadoEm,
          origem: 'Supabase',
          duracaoMs: estado.duracaoMs,
          erro: estado.status === 'error' ? estado.erro : null,
        }) : ''}
      </div>

      ${kpis([
        { label: 'NFs pendentes', valor: String(r.pendentes) },
        { label: 'Total pendente', valor: dinheiro(r.totalPendente) },
        { label: 'Total lançado', valor: dinheiro(r.totalLancado) },
      ])}

      <article class="ds-card" style="display:grid;gap:14px">
        <div class="ds-field" style="max-width:380px">
          <label for="nfBusca">Buscar</label>
          <input id="nfBusca" type="search" placeholder="Regional, solicitante, fornecedor, CNPJ ou número"
                 value="${esc(estado.busca)}" autocomplete="off">
        </div>
        <div id="nfTabela">
          ${renderTabela({
            status: estado.status,
            erro: estado.erro,
            grupos: paginaGrupos,
            janela: estado.janela,
            ordenacao: estado.ordenacao,
            pagina: estado.pagina,
            porPagina: estado.porPagina,
            total,
          })}
        </div>
      </article>
    </section>`;

  vincularEventos(grupos);
}

function vincularEventos(grupos) {
  raiz.querySelectorAll('[data-nf-janela]').forEach((b) => {
    b.addEventListener('click', () => {
      nfState.set({ janela: b.dataset.nfJanela, pagina: 1 });
      render();
    });
  });

  const busca = raiz.querySelector('#nfBusca');
  if (busca) {
    const aplicar = debounce((valor) => {
      nfState.set({ busca: valor, pagina: 1 });
      render();
      raiz.querySelector('#nfBusca')?.focus();
      const el = raiz.querySelector('#nfBusca');
      if (el) el.setSelectionRange(el.value.length, el.value.length);
    }, 300);
    busca.addEventListener('input', (e) => aplicar(e.target.value));
  }

  raiz.querySelectorAll('[data-ds-sort]').forEach((b) => {
    b.addEventListener('click', () => {
      const coluna = b.dataset.dsSort;
      const atual = nfState.get().ordenacao;
      nfState.set({ ordenacao: { coluna, asc: atual.coluna === coluna ? !atual.asc : true }, pagina: 1 });
      render();
    });
  });

  raiz.querySelectorAll('[data-ds-page]').forEach((b) => {
    b.addEventListener('click', () => {
      const pagina = Number(b.dataset.dsPage);
      if (!Number.isFinite(pagina) || pagina < 1) return;
      nfState.set({ pagina });
      render();
    });
  });

  raiz.querySelector('#nfRetry')?.addEventListener('click', () => carregar());

  raiz.querySelectorAll('[data-consultar]').forEach((b) => {
    b.addEventListener('click', () => {
      const grupo = grupos.find((g) => g.key === b.dataset.consultar);
      if (grupo) abrirModalNf(grupo, { pagamentos: nfState.get().pagamentos, aoLancar: lancar });
    });
  });

  raiz.querySelectorAll('[data-lancar]').forEach((b) => {
    b.addEventListener('click', async () => {
      const grupo = grupos.find((g) => g.key === b.dataset.lancar);
      if (!grupo) return;
      b.disabled = true;
      const ok = await lancar(grupo);
      if (!ok) b.disabled = false;
    });
  });

  raiz.querySelectorAll('[data-estornar]').forEach((b) => {
    b.addEventListener('click', async () => {
      const grupo = grupos.find((g) => g.key === b.dataset.estornar);
      if (!grupo) return;
      b.disabled = true;
      const ok = await estornar(grupo);
      if (!ok) b.disabled = false;
    });
  });
}

async function estornar(grupo) {
  const justificativa = await confirmar({
    titulo: 'Estornar NF',
    mensagem: `A NF de ${dinheiro(grupo.valor_total)} (${grupo.regional}) voltará para Pendentes. Esta ação fica registrada na auditoria.`,
    confirmarLabel: 'Estornar',
    justificativa: true,
    justificativaPlaceholder: 'Explique o motivo do estorno…',
  });
  if (!justificativa) return false;

  try {
    await estornarNf(grupo, { justificativa, usuario: window.currentUser?.email || null });
    const estado = nfState.get();
    const itens = estado.itens.map((r) => (grupo.ids.includes(r.id)
      ? { ...r, nf_lancado: false, nf_lancado_em: null }
      : r));
    nfState.set({ itens });
    toast('NF estornada e devolvida para Pendentes.', 'ok');
    render();
    return true;
  } catch (error) {
    toast(`Erro ao estornar: ${String(error?.message || error)}`, 'err', 6000);
    return false;
  }
}

async function lancar(grupo) {
  const confirmado = await confirmar({
    titulo: 'Lançar NF',
    mensagem: `Confirmar o lançamento desta NF de ${dinheiro(grupo.valor_total)} (${grupo.regional})?`,
    confirmarLabel: 'Lançar',
  });
  if (!confirmado) return false;

  try {
    const { quando, enviadoGrm } = await lancarNf(grupo);
    const estado = nfState.get();
    const itens = estado.itens.map((r) => (grupo.ids.includes(r.id)
      ? { ...r, nf_lancado: true, nf_lancado_em: quando }
      : r));
    nfState.set({ itens });
    toast(enviadoGrm ? 'NF marcada como lançada e enviada pra fila de lançamento do GRM.' : 'NF marcada como lançada.', 'ok');
    render();
    return true;
  } catch (error) {
    toast(`Erro ao lançar: ${String(error?.message || error)}`, 'err', 6000);
    return false;
  }
}

async function carregar() {
  const meuBoot = bootId;
  nfState.set({ status: 'loading', erro: null });
  render();
  try {
    const { itens, pagamentos, duracaoMs, atualizadoEm } = await carregarNotas({ chaveCorrida: 'notas-fiscais' });
    if (meuBoot !== bootId) return;
    nfState.set({ status: 'ok', itens, pagamentos, duracaoMs, atualizadoEm });
  } catch (error) {
    if (meuBoot !== bootId) return;
    nfState.set({ status: 'error', erro: String(error?.message || error) });
  }
  render();
}

export function renderContent(content) {
  bootId += 1;
  raiz = content;
  nfState.reset();
  render();
  carregar();
}
