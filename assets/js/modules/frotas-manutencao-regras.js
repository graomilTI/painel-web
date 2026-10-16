// Frotas · Manutenção: regras puras do fluxo (sem DOM, sem Supabase), espelhando o trigger
// frotas_manutencoes_fluxo (migrations 20261016170000 e 20261016180000). O banco é quem decide;
// aqui só se evita oferecer uma ação que ele vai recusar e se explica o porquê.

export const STATUS = [
  { id: 'solicitada', label: 'Solicitada', curto: 'Solicitação', tone: 'blue' },
  { id: 'em_orcamento', label: 'Em orçamento', curto: 'Orçamento', tone: 'amber' },
  { id: 'em_aprovacao', label: 'Em aprovação', curto: 'Aprovação', tone: 'purple' },
  { id: 'aprovada', label: 'Aprovada', curto: 'Aprovada', tone: 'green' },
  { id: 'em_execucao', label: 'Em execução (OS)', curto: 'OS', tone: 'amber' },
  { id: 'concluida', label: 'Concluída', curto: 'Conclusão', tone: 'green' },
  { id: 'reprovada', label: 'Reprovada', curto: 'Reprovada', tone: 'red' },
  { id: 'cancelada', label: 'Cancelada', curto: 'Cancelada', tone: 'red' },
];

// Etapas do caminho feliz, na ordem em que aparecem no passo a passo.
export const ETAPAS = ['solicitada', 'em_orcamento', 'em_aprovacao', 'aprovada', 'em_execucao', 'concluida'];

export const NATUREZAS = [
  { id: 'preventiva', label: 'Preventiva' },
  { id: 'corretiva', label: 'Corretiva' },
];

export const PRIORIDADES = [
  { id: 'baixa', label: 'Baixa' },
  { id: 'normal', label: 'Normal' },
  { id: 'alta', label: 'Alta' },
  { id: 'urgente', label: 'Urgente' },
];

export const RESPONSAVEIS = [
  { id: 'empresa', label: 'Empresa' },
  { id: 'locadora', label: 'Locadora' },
  { id: 'colaborador', label: 'Colaborador' },
  { id: 'proprietario', label: 'Proprietário' },
];

export const ORIGENS = {
  manual: 'Manual', plano: 'Plano de manutenção', checklist: 'Checklist', ocorrencia: 'Ocorrência', motorista: 'Motorista',
};

const ENCERRADOS = ['concluida', 'cancelada'];

export const TRANSICOES = {
  solicitada: ['em_orcamento', 'aprovada', 'cancelada'],
  em_orcamento: ['em_aprovacao', 'aprovada', 'cancelada'],
  em_aprovacao: ['aprovada', 'reprovada', 'em_orcamento', 'cancelada'],
  reprovada: ['em_orcamento', 'cancelada'],
  aprovada: ['em_execucao', 'cancelada'],
  em_execucao: ['concluida', 'cancelada'],
  concluida: [],
  cancelada: [],
};

export function statusInfo(id) {
  return STATUS.find((s) => s.id === id) || { id, label: id || '—', curto: id || '—', tone: 'blue' };
}

export const estaEncerrada = (m) => ENCERRADOS.includes(m?.status);

export function norm(v) {
  return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function normalizarPlaca(v) {
  return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function numeroOS(m) {
  return m?.os_numero || (m?.numero != null ? `OS-${String(m.numero).padStart(6, '0')}` : '');
}

export function codigoManutencao(m) {
  return m?.numero != null ? `MAN-${String(m.numero).padStart(6, '0')}` : '—';
}

// Quais blocos da ficha aceitam edição em cada etapa.
export function camposEditaveis(status) {
  if (ENCERRADOS.includes(status)) return { cabecalho: false, itens: false, orcamentos: false, execucao: false };
  if (status === 'aprovada') return { cabecalho: true, itens: true, orcamentos: false, execucao: true };
  if (status === 'em_execucao') return { cabecalho: true, itens: true, orcamentos: false, execucao: true };
  return { cabecalho: true, itens: true, orcamentos: true, execucao: false };
}

export function orcamentoSelecionado(orcamentos = []) {
  return orcamentos.find((o) => o.selecionado) || null;
}

// Pendências para entrar em `para`, na mesma ordem das mensagens do trigger.
export function pendenciasPara(m, para, { itens = [], orcamentos = [] } = {}) {
  const lista = [];
  if (para === 'em_aprovacao' && !orcamentos.length) lista.push('Cadastre ao menos um orçamento.');
  if (para === 'aprovada') {
    if (!m.natureza) lista.push('Defina a natureza (preventiva ou corretiva).');
    if (!m.responsavel_pagamento) lista.push('Informe quem paga a manutenção.');
    if (!itens.length) lista.push('Informe ao menos um item (categoria do guia).');
  }
  return lista;
}

// Ações do botão de etapa. `bloqueio` explica por que a ação aparece desabilitada.
export function acoesDisponiveis(m, { podeAprovar = false, itens = [], orcamentos = [] } = {}) {
  if (!m) return [];
  const ctx = { itens, orcamentos };
  const sel = orcamentoSelecionado(orcamentos);
  const acao = (a) => {
    const pend = pendenciasPara(m, a.para, ctx);
    if (a.exigeAprovador && !podeAprovar) pend.unshift('Só aprovadores podem fazer isso.');
    if (a.exigeOrcamentoEscolhido && !sel) pend.push('Escolha o orçamento aprovado.');
    return { tom: 'ghost', ...a, bloqueio: pend.length ? pend.join(' ') : null };
  };
  const cancelar = acao({ id: 'cancelar', rotulo: 'Cancelar manutenção', para: 'cancelada', exigeMotivo: true, tom: 'danger' });
  switch (m.status) {
    case 'solicitada':
      return [
        acao({ id: 'iniciar_orcamento', rotulo: 'Iniciar orçamento', para: 'em_orcamento', tom: 'primary' }),
        acao({ id: 'aprovar_sem_orcamento', rotulo: 'Aprovar sem orçamento', para: 'aprovada', exigeAprovador: true, formulario: 'sem_orcamento', tom: 'soft' }),
        cancelar,
      ];
    case 'em_orcamento':
      return [
        acao({ id: 'enviar_aprovacao', rotulo: 'Enviar para aprovação', para: 'em_aprovacao', tom: 'primary' }),
        acao({ id: 'aprovar_sem_orcamento', rotulo: 'Aprovar sem orçamento', para: 'aprovada', exigeAprovador: true, formulario: 'sem_orcamento', tom: 'soft' }),
        cancelar,
      ];
    case 'em_aprovacao':
      return [
        acao({ id: 'aprovar', rotulo: 'Aprovar', para: 'aprovada', exigeAprovador: true, exigeOrcamentoEscolhido: true, tom: 'primary' }),
        acao({ id: 'reprovar', rotulo: 'Reprovar', para: 'reprovada', exigeAprovador: true, exigeMotivo: true, tom: 'danger' }),
        acao({ id: 'devolver', rotulo: 'Devolver para orçamento', para: 'em_orcamento' }),
        cancelar,
      ];
    case 'reprovada':
      return [acao({ id: 'reabrir_orcamento', rotulo: 'Reabrir orçamento', para: 'em_orcamento', tom: 'primary' }), cancelar];
    case 'aprovada':
      return [acao({ id: 'emitir_os', rotulo: 'Emitir OS e enviar à oficina', para: 'em_execucao', tom: 'primary' }), cancelar];
    case 'em_execucao':
      return [acao({ id: 'concluir', rotulo: 'Concluir manutenção', para: 'concluida', formulario: 'conclusao', tom: 'primary' }), cancelar];
    default:
      return [];
  }
}

// Valores mostrados na lista: o que vale em cada etapa (final > aprovado > menor orçamento).
export function valorDaManutencao(m, orcamentos = []) {
  if (m.status === 'concluida' && m.custo != null) return { rotulo: 'Final', valor: Number(m.custo) };
  if (m.valor_aprovado != null) return { rotulo: 'Aprovado', valor: Number(m.valor_aprovado) };
  const valores = orcamentos.map((o) => Number(o.valor_total)).filter((v) => Number.isFinite(v));
  if (valores.length) return { rotulo: valores.length > 1 ? 'Menor orçamento' : 'Orçamento', valor: Math.min(...valores) };
  return null;
}

// Cartões-filtro da lista.
export const FILTROS = [
  { id: 'abertas', rotulo: 'Abertas', tone: 'blue', icone: 'ferramenta', dica: 'Tudo que ainda não foi concluído, reprovado ou cancelado' },
  { id: 'solicitada', rotulo: 'Solicitadas', tone: 'blue', icone: 'doc', dica: 'Aguardando iniciar o orçamento' },
  { id: 'em_orcamento', rotulo: 'Em orçamento', tone: 'amber', icone: 'dinheiro', dica: 'Cotando com as oficinas' },
  { id: 'em_aprovacao', rotulo: 'Em aprovação', tone: 'purple', icone: 'relogio', dica: 'Aguardando decisão do aprovador' },
  { id: 'aprovada', rotulo: 'Aprovadas', tone: 'green', icone: 'ok', dica: 'Aprovadas, aguardando a OS' },
  { id: 'em_execucao', rotulo: 'Em execução', tone: 'amber', icone: 'carro', dica: 'Veículo na oficina' },
  { id: 'concluida', rotulo: 'Concluídas', tone: 'green', icone: 'ok', dica: 'Serviço feito e custo final lançado' },
  { id: 'sem_servico', rotulo: 'Reprovadas / canceladas', tone: 'red', icone: 'erro', dica: 'Encerradas sem serviço' },
  { id: 'todos', rotulo: 'Todas', tone: 'blue', icone: 'total', dica: 'Todas as manutenções' },
];

export function bateFiltro(m, filtro) {
  if (!filtro || filtro === 'todos') return true;
  if (filtro === 'abertas') return !['concluida', 'cancelada', 'reprovada'].includes(m.status);
  if (filtro === 'sem_servico') return ['reprovada', 'cancelada'].includes(m.status);
  return m.status === filtro;
}

export function contarPorFiltro(lista) {
  const out = {};
  for (const f of FILTROS) out[f.id] = lista.filter((m) => bateFiltro(m, f.id)).length;
  return out;
}

// Busca por código, placa, descrição, oficina, motorista e categorias dos itens.
export function filtrarManutencoes(lista, { filtro = 'abertas', busca = '', natureza = '', prioridade = '' } = {}, itensPorManut = new Map(), categorias = []) {
  const termo = norm(busca);
  const nomeCategoria = new Map(categorias.map((c) => [c.codigo, c.nome]));
  return lista.filter((m) => {
    if (!bateFiltro(m, filtro)) return false;
    if (natureza && m.natureza !== natureza) return false;
    if (prioridade && m.prioridade !== prioridade) return false;
    if (!termo) return true;
    const cats = (itensPorManut.get(m.id) || []).map((i) => `${i.categoria_codigo} ${nomeCategoria.get(i.categoria_codigo) || ''} ${i.descricao || ''}`).join(' ');
    return norm([codigoManutencao(m), m.__placa, m.__modelo, m.descricao, m.oficina, m.motorista_nome, m.os_numero, cats].join(' ')).includes(termo);
  });
}

// ---------- validações dos formulários ----------
export function validarSolicitacao({ veiculo_id, descricao, itens = [] }) {
  const erros = [];
  if (!veiculo_id) erros.push('Selecione o veículo.');
  if (!String(descricao || '').trim()) erros.push('Descreva o problema ou o serviço.');
  itens.forEach((it, i) => { if (!it.categoria_codigo) erros.push(`Item ${i + 1}: escolha a categoria.`); });
  return erros;
}

export function validarOrcamento({ fornecedor, valor_total }) {
  const erros = [];
  if (!String(fornecedor || '').trim()) erros.push('Informe a oficina/fornecedor.');
  const v = Number(valor_total);
  if (valor_total === '' || valor_total == null || !Number.isFinite(v) || v < 0) erros.push('Informe o valor total do orçamento.');
  return erros;
}

export function validarConclusao({ data_execucao, km_execucao, custo }) {
  const erros = [];
  if (!data_execucao) erros.push('Informe a data em que o serviço foi feito.');
  if (km_execucao === '' || km_execucao == null || !Number.isFinite(Number(km_execucao)) || Number(km_execucao) <= 0) erros.push('Informe o km do veículo.');
  if (custo === '' || custo == null || !Number.isFinite(Number(custo)) || Number(custo) < 0) erros.push('Informe o custo final.');
  return erros;
}

export function numeroOuNulo(v) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Planos do guia aplicáveis a uma categoria (padrão da frota, não exceções por veículo).
export function planosDaCategoria(planos, categoria) {
  return planos.filter((p) => p.ativo !== false && !p.veiculo_id && Number(p.categoria_codigo) === Number(categoria));
}

// Descrição do intervalo de um plano, ex.: "5.000–10.000 km ou 6–12 meses".
export function descreverIntervalo(p) {
  const partes = [];
  const fmt = (n) => Number(n).toLocaleString('pt-BR');
  if (p.intervalo_km) partes.push(p.intervalo_km_max ? `${fmt(p.intervalo_km)}–${fmt(p.intervalo_km_max)} km` : `${fmt(p.intervalo_km)} km`);
  if (p.intervalo_meses) partes.push(p.intervalo_meses_max ? `${p.intervalo_meses}–${p.intervalo_meses_max} meses` : `${p.intervalo_meses} ${p.intervalo_meses === 1 ? 'mês' : 'meses'}`);
  if (p.intervalo_dias) partes.push(`${p.intervalo_dias} dias`);
  return partes.join(' ou ');
}

export const STATUS_VENCIMENTO = {
  vencida: { label: 'Vencida', tone: 'red' },
  proxima: { label: 'Próxima', tone: 'amber' },
  em_dia: { label: 'Em dia', tone: 'green' },
  sem_historico: { label: 'Sem histórico', tone: 'blue' },
  sem_hodometro: { label: 'Sem km', tone: 'blue' },
};
