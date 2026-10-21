// Frotas · Manutenção › Corretiva: etapas da tela (mesmo modelo de Compras: Solicitações, Cotações, Em andamento, À pagar,
// Aguardando NF, Concluído) e as linhas marcáveis de cada manutenção (peças, mão de obra e serviços). Regras puras, sem DOM
// nem Supabase. O banco continua com UM status por manutenção (frotas_manutencoes_fluxo); a etapa é derivada dele.
import {
  MAO_DE_OBRA, acoesDisponiveis, filtrarManutencoes, grupoDaCategoria, nomeDoGrupoDaCategoria,
} from './frotas-manutencao-regras.js?v=20261021-frotas-manut45';

export const ETAPAS = [
  { id: 'solicitacoes', rotulo: 'Solicitações', dica: 'Pedidos novos. Marque o que vai para a cotação (peças, mão de obra ou serviço); sem marcação segue a solicitação inteira e o que não for marcado continua aqui.' },
  { id: 'cotacoes', rotulo: 'Cotações', dica: 'Só o que foi marcado na solicitação. Cadastre os orçamentos, envie para aprovação e, aprovada, ela segue para Em andamento. As reprovadas voltam para cá.' },
  { id: 'andamento', rotulo: 'Em andamento', dica: 'Aprovadas: emita a OS, acompanhe o veículo na oficina e conclua informando o serviço realizado, o km e o custo.' },
  { id: 'apagar', rotulo: 'À pagar', dica: 'Serviço concluído e ainda sem pagamento. Cadastre as notas e o comprovante; ao enviar, o pagamento vai para o Financeiro e a nota para o GRM.' },
  { id: 'nf', rotulo: 'Aguardando NF', dica: 'Pagas, mas ainda sem a nota fiscal anexada.' },
  { id: 'concluido', rotulo: 'Concluído', dica: 'Serviço feito, pago e com nota fiscal (ou pago por outro responsável).' },
  { id: 'canceladas', rotulo: 'Canceladas', dica: 'Manutenções canceladas.' },
];

export const ETAPA_PADRAO = 'solicitacoes';

// Pagamento e nota da manutenção concluída. Só a que a empresa paga e tem custo passa por À pagar e Aguardando NF:
// À pagar = falta pagar; Aguardando NF = pago, mas falta a NF de alguma nota ou lançá-la (enviar ao GRM/Financeiro).
export function situacaoPagamento(m, notas = []) {
  const exige = m?.responsavel_pagamento === 'empresa' && Number(m?.custo) > 0;
  if (!exige) return { exige: false, pago: true, temNF: true };
  const pago = !!m.pago_em || (notas.length > 0 && notas.every((n) => !!n.pago_em || !!n.comprovante_url));
  // A nota só conta quando todas têm a NF e já foram enviadas (GRM e Financeiro): NF anexada e parada ainda é trabalho a fazer.
  const temNF = notas.length > 0 && notas.every((n) => !!n.anexo_url && !!n.enviada_em);
  return { exige, pago, temNF };
}

export function etapaDaManutencao(m, notas = []) {
  switch (m?.status) {
    case 'solicitada': return 'solicitacoes';
    case 'em_orcamento':
    case 'em_aprovacao':
    case 'reprovada': return 'cotacoes';
    case 'aprovada':
    case 'em_execucao': return 'andamento';
    case 'cancelada': return 'canceladas';
    case 'concluida': {
      const s = situacaoPagamento(m, notas);
      if (!s.pago) return 'apagar';
      return s.temNF ? 'concluido' : 'nf';
    }
    default: return ETAPA_PADRAO;
  }
}

export function contarPorEtapa(lista = [], notasPorManut = new Map()) {
  const out = Object.fromEntries(ETAPAS.map((e) => [e.id, 0]));
  for (const m of lista) out[etapaDaManutencao(m, notasPorManut.get(m.id) || [])] += 1;
  return out;
}

// Manutenções da etapa (com busca e urgentes primeiro). Encerradas saem do mais recente para o mais antigo.
export function manutencoesDaEtapa(lista, { etapa = ETAPA_PADRAO, busca = '' } = {}, { itensPorManut = new Map(), notasPorManut = new Map(), categorias = [] } = {}) {
  const daEtapa = lista.filter((m) => etapaDaManutencao(m, notasPorManut.get(m.id) || []) === etapa);
  const achadas = filtrarManutencoes(daEtapa, { filtro: 'todos', visao: 'todas', busca }, itensPorManut, categorias);
  if (['concluido', 'nf', 'apagar', 'canceladas'].includes(etapa)) {
    const quando = (m) => String(m.concluida_em || m.solicitado_em || '');
    return [...achadas].sort((a, b) => quando(b).localeCompare(quando(a)));
  }
  return achadas;
}

// ---------- linhas marcáveis ----------
// Cada manutenção tem itens (um de peças e um de serviço por grupo do guia) e cada item lista seus componentes. A tela mostra
// UMA linha por componente (peça, serviço do guia ou Mão de obra); item sem componentes (checklist, texto livre) é uma linha só.
export function linhasDosItens(itens = [], base = {}) {
  const linhas = [];
  for (const it of itens) {
    const grupo = nomeDoGrupoDaCategoria(base, it.categoria_codigo) || 'Outros';
    const grupoCod = grupoDaCategoria(base.categorias || [], it.categoria_codigo);
    const componentes = Array.isArray(it.componentes) ? it.componentes : [];
    const atomico = !componentes.length;
    for (const nome of (atomico ? [it.descricao || '—'] : componentes)) {
      const doGuia = (base.componentes || []).find((c) => Number(c.grupo_codigo) === Number(grupoCod) && c.nome === nome);
      const tipo = nome === MAO_DE_OBRA ? 'servico' : (doGuia?.tipo || (it.tipo_item === 'peca' ? 'peca' : 'servico'));
      const escolhida = it.pecas && typeof it.pecas === 'object' ? it.pecas[nome] : null;
      linhas.push({
        key: `${it.id}|${atomico ? '' : nome}`, item_id: it.id, grupo, nome, tipo, atomico,
        maoDeObra: nome === MAO_DE_OBRA, detalhe: escolhida?.detalhe || '', valor: escolhida?.valor ?? null,
      });
    }
  }
  return linhas;
}

// Linhas por grupo, na ordem em que aparecem; o mesmo grupo em itens diferentes (peças e serviço) fica junto.
export function agruparLinhas(linhas = []) {
  const grupos = new Map();
  for (const l of linhas) {
    if (!grupos.has(l.grupo)) grupos.set(l.grupo, []);
    grupos.get(l.grupo).push(l);
  }
  return [...grupos].map(([grupo, lista]) => ({ grupo, linhas: lista }));
}

// O que marcar vira o pedido da RPC frotas_manutencao_dividir: { item_id, componentes? } por item. `todas`: não há o que separar
// (a solicitação inteira segue); `nenhuma`: nada marcado (quem chama decide: aqui também segue a solicitação inteira).
export function resolverSelecao(linhas = [], marcadas = new Set()) {
  const vao = linhas.filter((l) => marcadas.has(l.key));
  if (!vao.length) return { nenhuma: true, todas: false, selecao: [], quantas: 0 };
  if (vao.length === linhas.length) return { nenhuma: false, todas: true, selecao: [], quantas: vao.length };
  const porItem = new Map();
  for (const l of vao) {
    const e = porItem.get(l.item_id) || { item_id: l.item_id, componentes: [], atomico: l.atomico };
    if (!l.atomico) e.componentes.push(l.nome);
    porItem.set(l.item_id, e);
  }
  return {
    nenhuma: false, todas: false, quantas: vao.length,
    selecao: [...porItem.values()].map((e) => (e.atomico ? { item_id: e.item_id } : { item_id: e.item_id, componentes: e.componentes })),
  };
}

// ---------- ações da coluna da direita ----------
const ACOES = {
  iniciar_orcamento: { icone: 'tag', titulo: 'Cotar (itens marcados)' },
  reabrir_orcamento: { icone: 'tag', titulo: 'Refazer o orçamento' },
  enviar_aprovacao: { icone: 'send', titulo: 'Enviar para aprovação' },
  aprovar_sem_orcamento: { icone: 'check', titulo: 'Aprovar sem orçamento' },
  aprovar: { icone: 'check', titulo: 'Aprovar' },
  reprovar: { icone: 'x', titulo: 'Reprovar' },
  devolver: { icone: 'volta', titulo: 'Devolver para orçamento' },
  emitir_os: { icone: 'chave', titulo: 'Emitir OS e enviar à oficina' },
  concluir: { icone: 'check', titulo: 'Concluir manutenção' },
  cancelar: { icone: 'x', titulo: 'Cancelar manutenção' },
};

// Ações do cartão: as do fluxo (mesmas regras do trigger) e, nas etapas de pagamento, notas e envio ao GRM/Financeiro.
export function acoesDoCard(m, { podeAprovar = false, itens = [], orcamentos = [], notas = [] } = {}) {
  const doFluxo = acoesDisponiveis(m, { podeAprovar, itens, orcamentos }).map((a) => ({
    id: a.id, tom: a.tom, bloqueio: a.bloqueio, ...(ACOES[a.id] || { icone: 'check', titulo: a.rotulo }),
  }));
  // Cotar é a ação da etapa: fica no topo da coluna mesmo para quem também pode aprovar direto.
  doFluxo.sort((a, b) => (b.id === 'iniciar_orcamento') - (a.id === 'iniciar_orcamento'));
  // Em cotação, a ação da etapa é cadastrar o orçamento: abre a ficha já com o formulário.
  if (m?.status === 'em_orcamento' || m?.status === 'reprovada') {
    doFluxo.unshift({ id: 'orcamento', icone: 'mais', titulo: 'Adicionar orçamento', tom: 'soft', bloqueio: null });
  }
  const extras = [];
  if (m?.status === 'concluida' && m.responsavel_pagamento === 'empresa') {
    extras.push({ id: 'notas', icone: 'doc', titulo: 'Notas fiscais e comprovante', tom: 'soft', bloqueio: null });
    if (notas.some((n) => !n.enviada_em && n.anexo_url)) {
      extras.push({ id: 'enviar_notas', icone: 'send', titulo: 'Enviar ao GRM e ao Financeiro', tom: 'primary', bloqueio: null });
    }
  }
  return [...doFluxo, ...extras];
}
