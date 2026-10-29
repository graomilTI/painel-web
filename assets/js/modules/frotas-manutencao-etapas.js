// Frotas · Manutenção › Corretiva: etapas da tela (mesmo modelo de Compras: Cotações, Em andamento, À pagar, Aguardando NF,
// Concluído). Quem registra a manutenção já é da equipe de Frotas (está aprovada para registrar), então não há etapa de
// solicitação: ela nasce em Cotações. Regras puras, sem DOM nem Supabase. O banco continua com UM status por manutenção
// (frotas_manutencoes_fluxo); a etapa é derivada dele.
import { acoesDisponiveis, filtrarManutencoes, norm } from './frotas-manutencao-regras.js?v=20261029-frotas-manut56';

export const ETAPAS = [
  { id: 'cotacoes', rotulo: 'Cotações', dica: 'Manutenções recém-registradas: cadastre os orçamentos, envie para aprovação e, aprovada, ela segue para Em andamento. As reprovadas voltam para cá.' },
  { id: 'andamento', rotulo: 'Em andamento', dica: 'Aprovadas: emita a OS, acompanhe o veículo na oficina e conclua informando o serviço realizado, o km e o custo.' },
  { id: 'apagar', rotulo: 'À pagar', dica: 'Serviço concluído e ainda sem pagamento. Cadastre as notas e o comprovante; ao enviar, o pagamento vai para o Financeiro e a nota para o GRM.' },
  { id: 'nf', rotulo: 'Aguardando NF', dica: 'Pagas, mas ainda sem a nota fiscal anexada.' },
  { id: 'concluido', rotulo: 'Concluído', dica: 'Serviço feito, pago e com nota fiscal (ou pago por outro responsável).' },
  { id: 'canceladas', rotulo: 'Canceladas', dica: 'Manutenções canceladas.' },
];

export const ETAPA_PADRAO = 'cotacoes';

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
    case 'solicitada': // registrada por outro caminho (plano, checklist, gestor): também começa em Cotações
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

// Colunas da lista (cabeçalho ordenável). Entrada = data em que a manutenção entrou (registro); Previsão = previsão de saída.
export const COLUNAS = [
  { id: 'codigo', rotulo: 'Código' },
  { id: 'placa', rotulo: 'Placa' },
  { id: 'responsavel', rotulo: 'Responsável' },
  { id: 'cidade', rotulo: 'Cidade/UF' },
  { id: 'entrada', rotulo: 'Entrada' },
  { id: 'previsao', rotulo: 'Previsão' },
];

const VALOR_ORDEM = {
  codigo: (m) => Number(m.numero) || 0,
  placa: (m) => norm(m.__placa),
  responsavel: (m) => norm(m.solicitante_nome),
  cidade: (m) => norm(`${m.uf || ''} ${m.cidade || ''}`.trim()),
  entrada: (m) => String(m.solicitado_em || ''),
  previsao: (m) => String(m.previsao_entrega || ''),
};

// Ordena por uma coluna (asc | desc). Sem valor (cidade ou previsão em branco) vai sempre para o fim, em qualquer sentido.
export function ordenarManutencoes(lista, ordem) {
  const valor = VALOR_ORDEM[ordem?.coluna];
  if (!valor) return lista;
  const sentido = ordem.sentido === 'desc' ? -1 : 1;
  const vazio = (v) => v === '' || v === 0;
  return lista.map((m, i) => ({ m, i, v: valor(m) })).sort((a, b) => {
    if (vazio(a.v) !== vazio(b.v)) return vazio(a.v) ? 1 : -1;
    const c = typeof a.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v), 'pt-BR');
    return c * sentido || a.i - b.i;
  }).map((x) => x.m);
}

// Manutenções da etapa (com busca e urgentes primeiro). Encerradas saem do mais recente para o mais antigo.
export function manutencoesDaEtapa(lista, { etapa = ETAPA_PADRAO, busca = '', ordem = null } = {}, { itensPorManut = new Map(), notasPorManut = new Map(), categorias = [] } = {}) {
  const daEtapa = lista.filter((m) => etapaDaManutencao(m, notasPorManut.get(m.id) || []) === etapa);
  const achadas = filtrarManutencoes(daEtapa, { filtro: 'todos', visao: 'todas', busca }, itensPorManut, categorias);
  // Coluna escolhida no cabeçalho manda; sem escolha, o padrão: encerradas do mais recente ao mais antigo, as outras urgentes primeiro.
  if (ordem?.coluna) return ordenarManutencoes(achadas, ordem);
  if (['concluido', 'nf', 'apagar', 'canceladas'].includes(etapa)) {
    const quando = (m) => String(m.concluida_em || m.solicitado_em || '');
    return [...achadas].sort((a, b) => quando(b).localeCompare(quando(a)));
  }
  return achadas;
}

// ---------- ações da coluna da direita ----------
const ACOES = {
  iniciar_orcamento: { icone: 'tag', titulo: 'Iniciar a cotação' },
  reabrir_orcamento: { icone: 'tag', titulo: 'Refazer o orçamento' },
  enviar_aprovacao: { icone: 'send', titulo: 'Enviar para aprovação' },
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
  // Em cotação, a ação da etapa é cadastrar o orçamento: abre a ficha já com o formulário.
  if (m?.status === 'em_orcamento' || m?.status === 'reprovada') {
    doFluxo.unshift({ id: 'orcamento', icone: 'mais', titulo: 'Adicionar cotação', tom: 'soft', bloqueio: null });
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
