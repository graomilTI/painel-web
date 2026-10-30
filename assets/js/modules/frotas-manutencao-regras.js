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

// Compra dividida (espelha a trava do banco): `escolha` liga o nome de um item ao id do orçamento do fornecedor que o fornece; o
// resto fica na cotação principal (a escolhida). O total é o da principal trocando, em cada item escolhido de outro fornecedor, o valor
// da linha pelo da cotação dele. `valido: false` = o fornecedor escolhido não tem valor para o item (ou a cotação sumiu).
export function compraDividida(orcamentos = [], escolha = {}) {
  const principal = orcamentoSelecionado(orcamentos);
  if (!principal) return { principal: null, total: null, trocas: [] };
  const soma = (o, nome) => {
    const com = (o?.linhas || []).filter((l) => l.nome === nome && !l.faltante && l.valor != null && l.valor !== '' && Number.isFinite(Number(l.valor)));
    return com.length ? com.reduce((s, l) => s + Number(l.valor), 0) : null;
  };
  let total = Number(principal.valor_total) || 0;
  const trocas = [];
  for (const [nome, id] of Object.entries(escolha || {})) {
    if (id === principal.id) continue;
    const orcamento = orcamentos.find((o) => o.id === id) || null;
    const valor = soma(orcamento, nome);
    const valorPrincipal = soma(principal, nome) ?? 0;
    trocas.push({ nome, orcamento, valor, valorPrincipal, valido: valor != null });
    if (valor != null) total += valor - valorPrincipal;
  }
  return { principal, total, trocas };
}

// Pendências para entrar em `para`, na mesma ordem das mensagens do trigger.
export function pendenciasPara(m, para, { itens = [], orcamentos = [] } = {}) {
  const lista = [];
  if (para === 'em_aprovacao' && !orcamentos.length) lista.push('Cadastre ao menos um orçamento.');
  if (para === 'aprovada') {
    // A natureza não bloqueia: se ninguém definiu, a tela grava a sugerida (naturezaSugerida) junto da aprovação.
    if (!m.responsavel_pagamento) lista.push('Informe quem paga a manutenção.');
    if (!itens.length) lista.push('Informe ao menos um item (categoria do guia).');
  }
  return lista;
}

// Ações do botão de etapa. `bloqueio` explica por que a ação aparece desabilitada.
export function acoesDisponiveis(m, { podeAprovar = false, itens = [], orcamentos = [] } = {}) {
  if (!m) return [];
  const ctx = { itens, orcamentos };
  const acao = (a) => {
    const pend = pendenciasPara(m, a.para, ctx);
    if (a.exigeAprovador && !podeAprovar) pend.unshift('Só aprovadores podem fazer isso.');
    if (a.exigeOrcamento && !orcamentos.length) pend.push('Cadastre ao menos um orçamento.');
    return { tom: 'ghost', ...a, bloqueio: pend.length ? pend.join(' ') : null };
  };
  const cancelar = acao({ id: 'cancelar', rotulo: 'Cancelar manutenção', para: 'cancelada', exigeMotivo: true, tom: 'danger' });
  switch (m.status) {
    case 'solicitada': {
      // Toda aprovação passa por orçamento: a solicitação só segue para a cotação (ou é cancelada).
      return [acao({ id: 'iniciar_orcamento', rotulo: podeAprovar ? 'Pedir orçamento' : 'Iniciar orçamento', para: 'em_orcamento', tom: 'primary' }), cancelar];
    }
    case 'em_orcamento':
      // Quem tem autonomia (aprovador) aprova direto da cotação, sem pedir aprovação a ninguém; a cotação escolhida continua obrigatória.
      return [
        ...(podeAprovar ? [acao({ id: 'aprovar', rotulo: 'Aprovar', para: 'aprovada', exigeAprovador: true, exigeOrcamento: true, tom: 'primary' })] : []),
        acao({ id: 'enviar_aprovacao', rotulo: 'Enviar para aprovação', para: 'em_aprovacao', tom: podeAprovar ? 'soft' : 'primary' }),
        cancelar,
      ];
    case 'em_aprovacao':
      return [
        acao({ id: 'aprovar', rotulo: 'Aprovar', para: 'aprovada', exigeAprovador: true, exigeOrcamento: true, tom: 'primary' }),
        acao({ id: 'reprovar', rotulo: 'Recusar orçamento', para: 'reprovada', exigeAprovador: true, exigeMotivo: true, tom: 'danger' }),
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

// Cartões da lista: um por "quem age e o que fazer" (cobrem todas as manutenções em andamento).
// Os ids antigos (abertas, solicitada, aprovada, sem_servico...) continuam valendo em bateFiltro, só não têm cartão.
export const FILTROS = [
  { id: 'orcar', rotulo: 'Para orçar', tone: 'blue', icone: 'dinheiro', dica: 'Pedido novo ou em cotação: falta chegar a um valor (inclui as reprovadas, que voltam para novo orçamento)' },
  { id: 'aprovar', rotulo: 'Para aprovar', tone: 'purple', icone: 'relogio', dica: 'Orçamento pronto, esperando a decisão do aprovador' },
  { id: 'emitir_os', rotulo: 'Para emitir OS', tone: 'green', icone: 'ok', dica: 'Aprovada: falta emitir a OS e mandar o veículo à oficina' },
  { id: 'na_oficina', rotulo: 'Na oficina', tone: 'amber', icone: 'carro', dica: 'OS emitida, veículo na oficina' },
];

const ABERTAS = ['solicitada', 'em_orcamento', 'em_aprovacao', 'aprovada', 'em_execucao'];
const GRUPOS_FILTRO = {
  orcar: ['solicitada', 'em_orcamento', 'reprovada'],
  aprovar: ['em_aprovacao'],
  emitir_os: ['aprovada'],
  na_oficina: ['em_execucao'],
  abertas: ABERTAS,
  encerradas: ['concluida', 'cancelada', 'reprovada'],
  sem_servico: ['reprovada', 'cancelada'],
};

export function bateFiltro(m, filtro) {
  if (!filtro || filtro === 'todos') return true;
  return GRUPOS_FILTRO[filtro] ? GRUPOS_FILTRO[filtro].includes(m.status) : m.status === filtro;
}

// "Ver": o que a lista mostra por padrão (em andamento), as encerradas ou tudo.
export const VISOES = [
  { id: 'andamento', label: 'Em andamento' },
  { id: 'encerradas', label: 'Encerradas' },
  { id: 'todas', label: 'Todas' },
];

export function bateVisao(m, visao) {
  if (visao === 'todas') return true;
  const aberta = ABERTAS.includes(m.status);
  return visao === 'encerradas' ? !aberta : aberta;
}

// Contagem dos cartões: só as manutenções em andamento (reprovada conta em "Para orçar").
export function contarPorFiltro(lista) {
  const out = {};
  for (const f of FILTROS) out[f.id] = lista.filter((m) => bateFiltro(m, f.id)).length;
  return out;
}

// O que falta fazer, em palavras simples (coluna "Próximo passo" da lista e linha de cima da ficha).
export function proximoPasso(m, { notas = [] } = {}) {
  switch (m?.status) {
    case 'solicitada': return { rotulo: 'Orçar ou aprovar', tone: 'blue' };
    case 'em_orcamento': return { rotulo: 'Fechar orçamento', tone: 'blue' };
    case 'em_aprovacao': return { rotulo: 'Aprovar', tone: 'purple' };
    case 'reprovada': return { rotulo: 'Refazer orçamento', tone: 'red' };
    case 'aprovada': return { rotulo: 'Emitir OS', tone: 'green' };
    case 'em_execucao': return { rotulo: 'Concluir', tone: 'amber' };
    case 'concluida': {
      const enviar = m.responsavel_pagamento === 'empresa' && notas.some((n) => !n.enviada_em);
      return enviar ? { rotulo: 'Enviar notas', tone: 'amber' } : { rotulo: 'Concluída', tone: 'green' };
    }
    case 'cancelada': return { rotulo: 'Cancelada', tone: 'red' };
    default: return { rotulo: statusInfo(m?.status).label, tone: 'blue' };
  }
}

// Quem abre a manutenção escolhe um dos grupos do guia (Suspensão, Freios, Motor...), não um dos 29 sistemas. O item grava a
// categoria representativa do grupo (grupo.categoria_codigo) ou, se veio da Preventiva, a categoria do próprio serviço.
export function grupoDaCategoria(categorias = [], categoria) {
  const c = categorias.find((x) => Number(x.codigo) === Number(categoria));
  return c?.grupo_codigo != null ? Number(c.grupo_codigo) : null;
}

export function categoriaDoGrupo(grupos = [], grupo) {
  const g = grupos.find((x) => Number(x.codigo) === Number(grupo));
  return g ? Number(g.categoria_codigo) : null;
}

// Nome do grupo de uma categoria; sem grupo cadastrado, o nome do próprio sistema.
export function nomeDoGrupoDaCategoria({ categorias = [], grupos = [] }, categoria) {
  const g = grupos.find((x) => Number(x.codigo) === grupoDaCategoria(categorias, categoria));
  return g?.nome || categorias.find((x) => Number(x.codigo) === Number(categoria))?.nome || '';
}

// Componentes e peças de um grupo, na ordem do guia. `marcados` (nomes já gravados no item) entram mesmo que o catálogo
// tenha mudado depois, para não sumirem da ficha.
export function componentesDoGrupo(componentes = [], grupo, marcados = []) {
  const doGuia = componentes.filter((c) => Number(c.grupo_codigo) === Number(grupo)).sort((a, b) => (a.ordem || 0) - (b.ordem || 0)).map((c) => c.nome);
  return [...doGuia, ...marcados.filter((n) => !doGuia.includes(n))];
}

// ---------- peça ou serviço ----------
// O tipo vem do componente (padrão: peça, produto comprado). "Mão de obra" é serviço e a tela a oferece em todos os grupos.
export const MAO_DE_OBRA = 'Mão de obra';

// Tipo de um componente pelo nome; "digitados" guarda o tipo dos itens digitados à mão (Outro item).
export function tipoDoComponente(componentes = [], grupo, nome, digitados = new Map()) {
  if (nome === MAO_DE_OBRA) return 'servico';
  const c = componentes.find((x) => Number(x.grupo_codigo) === Number(grupo) && x.nome === nome);
  return c?.tipo || digitados.get(nome) || 'peca';
}

// Lista do grupo na tela: peças e serviços do guia, depois "Mão de obra"; o que já estava marcado e não está no catálogo vai ao fim.
export function itensDoGrupo(componentes = [], grupo, marcados = []) {
  const lista = componentesDoGrupo(componentes, grupo, []);
  if (!lista.includes(MAO_DE_OBRA)) lista.push(MAO_DE_OBRA);
  return [...lista, ...marcados.filter((n) => !lista.includes(n))];
}

// Itens gravados a partir dos nomes marcados em um grupo: um de peças e um de serviço (Mão de obra primeiro), cada um com os seus
// componentes. O tipo do item decide a categoria da nota fiscal no GRM.
export function itensPorTipo(categoria_codigo, nomes = [], tipoDe = () => 'peca', pecaDe = () => null) {
  const pecas = nomes.filter((n) => tipoDe(n) !== 'servico');
  const servicos = nomes.filter((n) => tipoDe(n) === 'servico').sort((a, b) => (b === MAO_DE_OBRA) - (a === MAO_DE_OBRA));
  const item = (lista, tipo_item) => {
    const pecas = Object.fromEntries(lista.map((n) => [n, pecaDe(n)]).filter(([, p]) => p));
    return { categoria_codigo, descricao: lista.join(', '), tipo_item, componentes: [...lista], ...(Object.keys(pecas).length ? { pecas } : {}) };
  };
  return [pecas.length ? item(pecas, 'peca') : null, servicos.length ? item(servicos, 'servico') : null].filter(Boolean);
}

// Componentes do guia ligados a um serviço (plano) da Preventiva; vazio quando o serviço não tem peças catalogadas.
export function componentesDoServico(componentes = [], categoria, planoCodigo) {
  if (!planoCodigo) return [];
  return componentes.filter((c) => Number(c.categoria_codigo) === Number(categoria) && c.plano_codigo === planoCodigo)
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0)).map((c) => c.nome);
}

// ---------- peças por modelo de veículo (catálogo que aprende com o uso) ----------
const MARCAS_IGUAIS = { VOLKSWAGEN: 'VW', GM: 'CHEVROLET', CHEV: 'CHEVROLET' };

// Família do veículo: "FIAT/MOBI LIKE" → "FIAT/MOBI"; "VW/NOVO GOL 1.0 CITY" → "VW/GOL"; "RENAULT/KWID ZEN 10MT" → "RENAULT/KWID".
// Aceita o veículo (cadastro) ou o texto marca/modelo; vazio quando não dá para saber.
export function modeloDoVeiculo(veiculo) {
  const texto = (typeof veiculo === 'string' ? veiculo : rotuloVeiculo(veiculo)).toUpperCase().replace(/\s+/g, ' ').trim();
  if (!texto) return '';
  let [marcaBruta, ...resto] = texto.includes('/') ? texto.split('/') : ['', texto];
  let palavras = resto.join('/').replace(/^(NOVO|NOVA)\s+/, '').split(' ').filter(Boolean);
  // Importado ("I/FIAT TORO", "I/JEEP COMPASS"): a marca vem na primeira palavra.
  if (marcaBruta.trim() === 'I' && palavras.length > 1) { marcaBruta = palavras[0]; palavras = palavras.slice(1); }
  const modelo = palavras[0] || '';
  if (!modelo) return '';
  const marca = MARCAS_IGUAIS[marcaBruta.trim()] || marcaBruta.trim();
  return marca ? marca + '/' + modelo : modelo;
}

// "FIAT/MOBI" → "Fiat Mobi"; "VW/GOL" → "VW Gol".
export function rotuloModelo(chave) {
  const titulo = (t) => (t.length <= 2 ? t : t.charAt(0) + t.slice(1).toLowerCase());
  return String(chave || '').split('/').filter(Boolean).map(titulo).join(' ');
}

// Peças já usadas no modelo, por item do guia (mais usadas e mais recentes primeiro): Map(item do guia → peças).
export function pecasDoModelo(pecas = [], modelo = '') {
  const por = new Map();
  if (!modelo) return por;
  for (const p of pecas) {
    if (p.ativo === false || p.modelo !== modelo) continue;
    if (!por.has(p.componente)) por.set(p.componente, []);
    por.get(p.componente).push(p);
  }
  for (const lista of por.values()) lista.sort((a, b) => (b.usos || 0) - (a.usos || 0) || String(b.ultima_data || '').localeCompare(String(a.ultima_data || '')));
  return por;
}

// Peça escolhida como o item guarda: { detalhe, valor }.
export const pecaEscolhida = (p) => ({ detalhe: p.detalhe, valor: p.ultimo_valor == null ? null : Number(p.ultimo_valor) });

// ---------- linhas do orçamento (marca/observação e valor de cada peça ou serviço) ----------
const emCentavos = (n) => Math.round(Number(n) * 100) / 100;
const valorLinha = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

// Soma dos valores das linhas; null quando nenhuma linha tem valor (aí vale o que a pessoa digitar em "Peças").
// Com `tipo`: só as linhas de peça (as sem tipo contam como peça) ou só as de serviço (mão de obra).
export function somarLinhas(linhas = [], tipo = null) {
  const doTipo = (l) => !tipo || (tipo === 'servico' ? l?.tipo === 'servico' : l?.tipo !== 'servico');
  const valores = linhas.filter(doTipo).map((l) => valorLinha(l?.valor)).filter((v) => v != null);
  return valores.length ? emCentavos(valores.reduce((s, v) => s + v, 0)) : null;
}

// Total do orçamento = peças + mão de obra; null quando os dois estão vazios.
export function totalDoOrcamento({ pecas = null, maoObra = null } = {}) {
  const p = valorLinha(pecas); const m = valorLinha(maoObra);
  return p == null && m == null ? null : emCentavos((p || 0) + (m || 0));
}

// Linhas que valem a pena guardar: com nome e com marca/observação ou valor.
export function normalizarLinhas(linhas = []) {
  // Peça faltante: o fornecedor não tem a peça ou o serviço; a linha fica registrada (sem valor) para a aprovação saber.
  return linhas.map((l) => ({ nome: String(l?.nome || '').trim().slice(0, 120), detalhe: String(l?.detalhe || '').trim().slice(0, 160), valor: l?.faltante ? null : valorLinha(l?.valor), tipo: l?.tipo === 'servico' ? 'servico' : 'peca', ...(l?.faltante ? { faltante: true } : {}) }))
    .filter((l) => l.nome && (l.detalhe || l.valor != null || l.faltante));
}

// Linhas do formulário: as já salvas e, para cada peça/serviço marcado nos itens que ainda não tem linha, uma linha em branco.
export function linhasIniciais(itens = [], salvas = []) {
  const tipoDoNome = new Map();
  for (const it of itens) {
    const nomes = (it.componentes || []).length ? it.componentes : [it.descricao].filter(Boolean);
    for (const nome of nomes) tipoDoNome.set(norm(nome), it.tipo_item === 'servico' ? 'servico' : 'peca');
  }
  const escolhida = new Map(); // nome (sem acento) → peça escolhida no item ({ detalhe, valor })
  for (const it of itens) for (const [nome, p] of Object.entries(it.pecas || {})) escolhida.set(norm(nome), p);
  const linhas = (Array.isArray(salvas) ? salvas : []).map((l) => ({ nome: l.nome, detalhe: l.detalhe || '', valor: valorLinha(l.valor), tipo: l.tipo || tipoDoNome.get(norm(l.nome)) || 'peca', ...(l.faltante ? { faltante: true } : {}) }));
  const tem = new Set(linhas.map((l) => norm(l.nome)));
  for (const [chave, tipo] of tipoDoNome) {
    if (tem.has(chave)) continue;
    tem.add(chave);
    const nome = itens.flatMap((it) => ((it.componentes || []).length ? it.componentes : [it.descricao])).find((n) => norm(n) === chave);
    const p = escolhida.get(chave);
    linhas.push({ nome, detalhe: p?.detalhe || '', valor: valorLinha(p?.valor), tipo });
  }
  return linhas;
}

// Texto do item quando a pessoa só marcou componentes.
export const descricaoDosComponentes = (nomes = []) => nomes.join(', ');

// Natureza que vale na aprovação quando ninguém definiu: tudo preventivo → preventiva; senão corretiva.
export function naturezaSugerida(m, itens = []) {
  if (m?.natureza) return m.natureza;
  return itens.length && itens.every((i) => i.natureza === 'preventiva') ? 'preventiva' : 'corretiva';
}

const RANK_PRIORIDADE = { urgente: 0, alta: 1, normal: 2, baixa: 3 };

// Busca por código, placa, descrição, oficina, motorista e categorias dos itens. Urgentes e altas primeiro (a ordem
// do banco, mais recentes antes, vale dentro de cada prioridade).
export function filtrarManutencoes(lista, { filtro = 'todos', visao = 'andamento', busca = '' } = {}, itensPorManut = new Map(), categorias = []) {
  const termo = norm(busca);
  const nomeCategoria = new Map(categorias.map((c) => [c.codigo, c.nome]));
  const achadas = lista.filter((m) => {
    if (!bateVisao(m, visao) || !bateFiltro(m, filtro)) return false;
    if (!termo) return true;
    const cats = (itensPorManut.get(m.id) || []).map((i) => `${i.categoria_codigo} ${nomeCategoria.get(i.categoria_codigo) || ''} ${i.descricao || ''}`).join(' ');
    return norm([codigoManutencao(m), m.__placa, m.__modelo, m.descricao, m.oficina, m.motorista_nome, m.solicitante_nome, m.cidade, m.uf, m.os_numero, cats].join(' ')).includes(termo);
  });
  if (visao === 'encerradas') return achadas;
  return achadas.map((m, i) => ({ m, i })).sort((a, b) => ((RANK_PRIORIDADE[a.m.prioridade] ?? 2) - (RANK_PRIORIDADE[b.m.prioridade] ?? 2)) || a.i - b.i).map((x) => x.m);
}

// ---------- validações dos formulários ----------
export function validarSolicitacao({ veiculo_id, descricao, itens = [], uf, cidade }) {
  const erros = [];
  // UF e cidade só são cobradas de quem informa (a nova manutenção da Corretiva sempre informa).
  if (uf !== undefined && !String(uf || '').trim()) erros.push('Escolha a UF.');
  else if (cidade !== undefined && !String(cidade || '').trim()) erros.push('Escolha a cidade.');
  if (!veiculo_id) erros.push('Selecione o veículo.');
  if (!String(descricao || '').trim()) erros.push('Descreva o problema ou o serviço.');
  if (!itens.length) erros.push('Marque ao menos um item do que será feito (escolha o grupo e marque os itens).');
  itens.forEach((it, i) => { if (!it.categoria_codigo) erros.push(`Item ${i + 1}: escolha o grupo.`); });
  return erros;
}

export function validarOrcamento({ fornecedor, valor_total }) {
  const erros = [];
  if (!String(fornecedor || '').trim()) erros.push('Informe a oficina/fornecedor.');
  const v = Number(valor_total);
  if (valor_total === '' || valor_total == null || !Number.isFinite(v) || v < 0) erros.push('Informe o valor total do orçamento.');
  return erros;
}

// A cotação aceita qualquer nome de oficina/fornecedor; o cadastro só é exigido quando o serviço vai ser executado (Emitir OS).
// Devolve a oficina cadastrada da manutenção (a já ligada ou a de mesmo nome do orçamento aprovado) ou null quando falta cadastrar.
export function oficinaCadastradaDaManutencao(m, oficinas = []) {
  const ativas = oficinas.filter((o) => o.ativo !== false);
  if (m?.oficina_id) return ativas.find((o) => o.id === m.oficina_id) || null;
  const nome = norm(m?.oficina);
  return nome ? ativas.find((o) => norm(o.nome) === nome) || null : null;
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
    motorista: String(check.responsavel || '').trim(),
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
