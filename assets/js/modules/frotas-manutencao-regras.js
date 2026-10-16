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
  if (!itens.length) erros.push('Adicione ao menos um item: escolha a categoria e clique em +.');
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

// ---------- entrada automática (Fase 2) ----------

// Itens do checklist (ITENS_PADRAO em frotas-checklists.js) → categoria do guia. Extintor e documentação
// (CRLV) não são manutenção mecânica e ficam fora.
export const CHECKLIST_CATEGORIAS = {
  Pneus: 13,
  Freios: 9,
  'Luzes/Faróis': 19,
  'Óleo/Fluidos': 2,
  'Para-brisa/Limpador': 18,
  'Cintos de segurança': 20,
  Buzina: 6,
  Retrovisores: 18,
};

const ROTULO_STATUS_CHECK = { FALHA: 'falha', ATENCAO: 'atenção' };

// Pré-preenche a nova solicitação a partir de um checklist com itens em FALHA ou ATENÇÃO.
// Devolve null quando não há nada para abrir (tudo OK).
export function presetDoChecklist(check, { dataBr = '' } = {}) {
  const problemas = (Array.isArray(check?.itens) ? check.itens : []).filter((i) => i && (i.status === 'FALHA' || i.status === 'ATENCAO'));
  if (!problemas.length) return null;
  const porCategoria = new Map();
  for (const p of problemas) {
    const cat = CHECKLIST_CATEGORIAS[p.item];
    if (!cat) continue;
    const texto = `${p.item} (${ROTULO_STATUS_CHECK[p.status]}${p.observacao ? `: ${p.observacao}` : ''})`;
    porCategoria.set(cat, [...(porCategoria.get(cat) || []), texto]);
  }
  const resumo = problemas.map((p) => `${p.item} (${ROTULO_STATUS_CHECK[p.status]}${p.observacao ? `: ${p.observacao}` : ''})`).join('; ');
  return {
    veiculo_id: check.veiculo_id,
    origem: 'checklist',
    checklist_id: check.id,
    prioridade: problemas.some((p) => p.status === 'FALHA') ? 'alta' : 'normal',
    descricao: `Checklist${dataBr ? ` de ${dataBr}` : ''}${check.responsavel ? ` (${check.responsavel})` : ''}: ${resumo}`,
    itens: [...porCategoria.entries()].map(([categoria_codigo, textos]) => ({ categoria_codigo, natureza: 'corretiva', descricao: textos.join('; ') })),
  };
}

// ---------- importação de histórico ----------
export const COLUNAS_HISTORICO = ['Placa', 'Plano', 'Data', 'Km'];

export function excelSerialParaISO(n) {
  return new Date(Math.round((Number(n) - 25569) * 86400000)).toISOString().slice(0, 10);
}

function dataParaISO(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  if (typeof v === 'number') return v > 20000 ? excelSerialParaISO(v) : '';
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s; // o banco recusa e a linha volta nos erros
}

function kmParaNumero(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/\s|km/gi, '');
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Linha da planilha (cabeçalhos em qualquer caixa/acentuação) → { placa, plano, data, km }, ou null se vazia.
export function normalizarLinhaHistorico(row) {
  const mapa = {};
  for (const [k, v] of Object.entries(row || {})) mapa[norm(k).replace(/[^a-z]/g, '')] = v;
  const placa = String(mapa.placa ?? '').trim();
  const plano = String(mapa.plano ?? mapa.codigo ?? '').trim();
  if (!placa && !plano && (mapa.data == null || mapa.data === '')) return null;
  return { placa, plano, data: dataParaISO(mapa.data), km: kmParaNumero(mapa.km ?? mapa.quilometragem ?? mapa.hodometro) };
}

// Placa unificada (ex.: AAR5019 → AAR5A19) deixa dois cadastros com o mesmo RENAVAM: na lista de escolha aparece um só,
// o mais completo (com modelo) e, se empatar, o atualizado mais recentemente. Sem RENAVAM, nada é agrupado.
export function veiculosUnicos(veiculos) {
  const melhor = new Map();
  const semRenavam = [];
  const pontos = (v) => (v.marca_modelo ? 2 : 0) + (v.status === 'ATIVO' ? 1 : 0);
  for (const v of veiculos) {
    const renavam = String(v.renavam || '').replace(/\D/g, '');
    if (!renavam) { semRenavam.push(v); continue; }
    const atual = melhor.get(renavam);
    if (!atual || pontos(v) > pontos(atual) || (pontos(v) === pontos(atual) && String(v.updated_at || '') > String(atual.updated_at || ''))) melhor.set(renavam, v);
  }
  const mantidos = new Set([...melhor.values(), ...semRenavam]);
  return veiculos.filter((v) => mantidos.has(v));
}

// Marca/modelo para exibir: o campo do cadastro e, quando vier vazio, marca + modelo (cadastro, depois BFleet) ou o
// nome interno sem a placa. Evita "ABC1D23 · " em branco na escolha do veículo.
export function rotuloVeiculo(v) {
  const t = (x) => String(x ?? '').trim();
  if (t(v?.marca_modelo)) return t(v.marca_modelo);
  const cadastro = [t(v?.marca), t(v?.modelo)].filter(Boolean).join('/');
  if (cadastro) return cadastro.toUpperCase();
  const bfleet = [t(v?.bfleet_marca), t(v?.bfleet_modelo)].filter(Boolean).join('/');
  if (bfleet) return bfleet.toUpperCase();
  const placa = t(v?.placa).replace(/[^A-Za-z0-9]/g, '');
  return t(v?.nome).replace(new RegExp(placa, 'ig'), '').replace(/^[\s\-–·]+|[\s\-–·]+$/g, '');
}

// ---------- notas fiscais da manutenção (várias por manutenção) ----------
export const TIPOS_NOTA = [
  { id: 'peca', label: 'Peças' },
  { id: 'servico', label: 'Serviço' },
  { id: 'misto', label: 'Peças e serviço' },
];

export function somaNotas(notas = []) {
  return Math.round(notas.reduce((s, n) => s + (Number(n.valor) || 0), 0) * 100) / 100;
}

// comprovante: quando informado (File ou null) a nota pode ter só a NF ou só o comprovante (o que faltar vira pendência);
// sem ele (undefined) a NF é obrigatória, como na ficha da Corretiva.
export function validarNota({ valor, fornecedor, arquivo, comprovante }) {
  const erros = [];
  const v = Number(valor);
  if (valor === '' || valor == null || !Number.isFinite(v) || v <= 0) erros.push('Informe o valor da nota.');
  if (!String(fornecedor || '').trim()) erros.push('Informe quem emitiu a nota (oficina ou loja de peças).');
  if (comprovante === undefined) {
    if (!arquivo) erros.push('Anexe o arquivo da nota fiscal (PDF, XML ou imagem).');
  } else if (!arquivo && !comprovante) {
    erros.push('Anexe a NF/NFS-e ou o comprovante de pagamento (o que faltar fica como pendência).');
  }
  return erros;
}

// Soma das notas contra o custo final: o banco recusa o envio quando as notas passam do custo.
export function conferenciaNotas(notas = [], custo = null) {
  const soma = somaNotas(notas);
  if (custo == null || !Number.isFinite(Number(custo))) return { soma, diferenca: null, situacao: 'sem_custo' };
  const diferenca = Math.round((Number(custo) - soma) * 100) / 100;
  return { soma, diferenca, situacao: diferenca < -0.01 ? 'acima' : Math.abs(diferenca) <= 0.01 ? 'igual' : 'abaixo' };
}
