// Frotas · Manutenção › Painel, Veículos e Agenda: leitura compartilhada. As três abas usam os mesmos dados (veículos, manutenções
// e vencimentos da preventiva), então a última leitura fica em memória por alguns segundos e as leituras simultâneas se juntam em uma.
// A navegação entre abas (abrir a ficha, o prontuário ou uma nova manutenção) também fica aqui.
import * as dados from './frotas-manutencao-dados.js?v=20261029-frotas-manut49';
import { expandirPainel } from './frotas-manutencao-preventiva-regras.js?v=20261029-frotas-manut49';
import { resumoPreventiva, veiculosDaManutencao, veiculosPorId } from './frotas-manutencao-visao-regras.js?v=20261029-frotas-manut49';

const VALIDADE_MS = 45000;
let guardado = null; // { em, valor }
let emAndamento = null;

async function lerPreventiva(supabase) {
  const [painel, planos, categorias, pendencias] = await Promise.all([
    dados.carregarPainelPreventiva(supabase).catch(() => null),
    dados.carregarPlanos(supabase).catch(() => []),
    dados.carregarCategorias(supabase).catch(() => []),
    dados.carregarPendenciasPreventivas(supabase).catch(() => []),
  ]);
  const mapaPlanos = new Map(planos.map((p) => [p.id, p]));
  const linhas = painel
    ? expandirPainel(painel, mapaPlanos, new Map(categorias.map((c) => [c.codigo, c.nome])))
    : await dados.carregarVencimentos(supabase).catch(() => []); // plano B: view paginada (mais lenta)
  return { linhas, pendencias, planos: mapaPlanos };
}

async function ler(supabase) {
  const [veiculosTodos, manutencoes, prev] = await Promise.all([
    dados.carregarVeiculosVisao(supabase),
    dados.carregarManutencoesVisao(supabase),
    lerPreventiva(supabase),
  ]);
  const veiculos = veiculosDaManutencao(veiculosTodos);
  // Manutenção antiga pode apontar para o cadastro duplicado (mesmo RENAVAM): o mapa conhece todos, a lista mostra um só.
  return {
    veiculos, mapaVeiculos: veiculosPorId(veiculosTodos), manutencoes,
    linhasPreventiva: prev.linhas, pendencias: prev.pendencias, planos: prev.planos,
    preventivaPorVeiculo: resumoPreventiva(prev.linhas, prev.pendencias),
    lidoEm: Date.now(),
  };
}

// forcar = ignora a leitura guardada (botão Atualizar).
export async function carregarVisao(supabase, { forcar = false } = {}) {
  if (!forcar && guardado && Date.now() - guardado.em < VALIDADE_MS) return guardado.valor;
  if (!emAndamento) {
    emAndamento = ler(supabase).then((valor) => { guardado = { em: Date.now(), valor }; return valor; }).finally(() => { emAndamento = null; });
  }
  return emAndamento;
}

export function invalidarVisao() { guardado = null; }

// ---------- navegação entre abas do hub ----------
function irParaAba(id) {
  const aba = document.querySelector(`[data-ds-tab="${id}"]`);
  if (aba) aba.click();
  return !!aba;
}

const abaAtiva = () => document.querySelector('[data-ds-tab].active')?.dataset.dsTab || '';

// Abre a ficha de uma manutenção na aba Corretiva (a aba lê o pedido ao montar).
export function abrirFicha(id) {
  if (!id) return;
  window.FROTAS_MANUTENCAO_ABRIR = id;
  irParaAba('manutencao');
}

// Abre o formulário de nova manutenção na aba Corretiva, já com o veículo escolhido.
export function abrirNovaManutencao(preset = {}) {
  window.FROTAS_MANUTENCAO_NOVA = preset;
  irParaAba('manutencao');
}

// Abre o prontuário de um veículo (aba Veículos).
export function abrirProntuario(veiculoId) {
  if (!veiculoId) return;
  window.FROTAS_MANUT_VEICULO_ABRIR = veiculoId;
  if (abaAtiva() === 'veiculos' && window.FROTAS_MANUT_VEICULOS?.abrir) window.FROTAS_MANUT_VEICULOS.abrir(veiculoId);
  else irParaAba('veiculos');
}

export function irCorretiva() { irParaAba('manutencao'); }
export function abrirAgenda() { irParaAba('agenda'); }
export function abrirPreventiva() { irParaAba('preventiva'); }
