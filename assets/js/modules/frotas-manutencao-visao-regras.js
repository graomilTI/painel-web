// Frotas · Manutenção › Painel, Veículos e Agenda: regras puras da visão de conjunto da frota (sem DOM, sem Supabase).
// Junta o que o fluxo já grava (frotas_manutencoes) com os vencimentos da preventiva para responder, em um olhar:
// o que está parado, o que está travado em cada etapa, o que vence e quanto custou.
import { norm, rotuloVeiculo, statusInfo, veiculosUnicos } from './frotas-manutencao-regras.js?v=20261020-frotas-manut44';
import { montarLista } from './frotas-manutencao-preventiva-regras.js?v=20261020-frotas-manut44';

const DIA_MS = 86400000;
const RANK_PRIORIDADE = { urgente: 0, alta: 1, normal: 2, baixa: 3 };
const ABERTAS = ['solicitada', 'em_orcamento', 'em_aprovacao', 'reprovada', 'aprovada', 'em_execucao'];
const compara = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export const estaAberta = (m) => ABERTAS.includes(m?.status);

// ---------- datas (sempre em Brasília: toISOString viraria o dia em UTC a partir das 21h) ----------
export const hojeBrasil = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

export function dataBrasil(valor) {
  if (!valor) return '';
  const s = String(valor);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // coluna date já vem no dia certo
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

const diaNumero = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / DIA_MS : null; };

// Dias de `de` até `ate` (datas yyyy-mm-dd); negativo quando `ate` é anterior. null se alguma data faltar.
export function diasEntre(de, ate) {
  const a = diaNumero(de); const b = diaNumero(ate);
  return a == null || b == null ? null : Math.round(b - a);
}

export function somarDias(iso, n) {
  const d = diaNumero(iso);
  return d == null ? '' : new Date((d + n) * DIA_MS).toISOString().slice(0, 10);
}

// ---------- etapa e prazo ----------
// Quando a manutenção entrou na etapa em que está (último registro da linha do tempo para o status atual).
export function desdeDaEtapa(m) {
  const linha = Array.isArray(m?.linha_tempo) ? m.linha_tempo : [];
  for (let i = linha.length - 1; i >= 0; i--) if (linha[i]?.para === m.status && linha[i]?.em) return linha[i].em;
  if (m?.status === 'em_execucao') return m.entrada_oficina_em || m.os_emitida_em || m.solicitado_em || null;
  if (m?.status === 'aprovada') return m.aprovado_em || m.solicitado_em || null;
  return m?.solicitado_em || m?.created_at || null;
}

export function diasNaEtapa(m, hoje = hojeBrasil()) {
  const d = diasEntre(dataBrasil(desdeDaEtapa(m)), hoje);
  return d == null ? null : Math.max(0, d);
}

// Dias parada que já passam do aceitável em cada etapa (os mesmos prazos dos lembretes do painel: orçamento 3, aprovação 2, OS 3, oficina 15).
export const LIMITE_DIAS = { solicitada: 2, em_orcamento: 3, reprovada: 3, em_aprovacao: 2, aprovada: 3, em_execucao: 15 };

export function etapaAtrasada(m, hoje = hojeBrasil()) {
  const limite = LIMITE_DIAS[m?.status];
  const dias = diasNaEtapa(m, hoje);
  return limite != null && dias != null && dias > limite;
}

// Previsão de entrega vencida (OS na oficina com a data já passada).
export function entregaAtrasada(m, hoje = hojeBrasil()) {
  return m?.status === 'em_execucao' && !!m.previsao_entrega && m.previsao_entrega < hoje;
}

export const estaParado = (m) => m?.status === 'em_execucao' && !!m.veiculo_parado;

// ---------- quadro por etapa ----------
export const COLUNAS = [
  { id: 'solicitada', titulo: 'Solicitadas', dica: 'Pedido registrado, falta começar o orçamento', tone: 'blue', status: ['solicitada'] },
  { id: 'em_orcamento', titulo: 'Em orçamento', dica: 'Cotando valores (inclui as reprovadas, que voltam para novo orçamento)', tone: 'amber', status: ['em_orcamento', 'reprovada'] },
  { id: 'em_aprovacao', titulo: 'Para aprovar', dica: 'Orçamento pronto, esperando o aprovador', tone: 'purple', status: ['em_aprovacao'] },
  { id: 'aprovada', titulo: 'Emitir OS', dica: 'Aprovada: falta emitir a OS e levar à oficina', tone: 'green', status: ['aprovada'] },
  { id: 'em_execucao', titulo: 'Na oficina', dica: 'OS emitida, serviço em andamento', tone: 'amber', status: ['em_execucao'] },
];

export function veiculosPorId(veiculos = []) {
  return new Map(veiculos.map((v) => [v.id, v]));
}

const RANK_ETAPA = Object.fromEntries(COLUNAS.flatMap((c, i) => c.status.map((s) => [s, i])));

function cartao(m, v, hoje) {
  const dias = diasNaEtapa(m, hoje);
  return {
    id: m.id, veiculo_id: m.veiculo_id, status: m.status, etapa: RANK_ETAPA[m.status] ?? 9,
    codigo: m.numero != null ? `MAN-${String(m.numero).padStart(6, '0')}` : '—',
    placa: v?.placa || '(sem placa)', modelo: v ? rotuloVeiculo(v) : '', coordenacao: v?.coordenacao || '', supervisao: v?.supervisao || '',
    descricao: m.descricao || '', natureza: m.natureza || '', prioridade: m.prioridade || 'normal', parado: estaParado(m),
    oficina: m.oficina || '', previsao: m.previsao_entrega || '', valor: m.valor_aprovado != null ? Number(m.valor_aprovado) : null,
    dias, atrasada: etapaAtrasada(m, hoje), entregaAtrasada: entregaAtrasada(m, hoje), reprovada: m.status === 'reprovada',
    quem: m.solicitante_nome || m.motorista_nome || '',
  };
}

export const FILTROS_VAZIOS = { coordenacao: '', supervisao: '', natureza: '', busca: '', so_parados: false, so_atrasadas: false };

function bateFiltros(c, f) {
  if (f.coordenacao && c.coordenacao !== f.coordenacao) return false;
  if (f.supervisao && c.supervisao !== f.supervisao) return false;
  if (f.natureza && c.natureza !== f.natureza) return false;
  if (f.so_parados && !c.parado) return false;
  if (f.so_atrasadas && !(c.atrasada || c.entregaAtrasada)) return false;
  const termo = norm(f.busca);
  return !termo || norm([c.codigo, c.placa, c.modelo, c.descricao, c.oficina, c.quem, c.coordenacao, c.supervisao].join(' ')).includes(termo);
}

// Mais urgentes primeiro; dentro da mesma prioridade, quem está esperando há mais tempo.
const compararCartao = (a, b) => ((RANK_PRIORIDADE[a.prioridade] ?? 2) - (RANK_PRIORIDADE[b.prioridade] ?? 2)) || ((b.dias ?? 0) - (a.dias ?? 0)) || compara(a.placa, b.placa);

export function montarQuadro(manutencoes = [], veiculos = new Map(), filtros = FILTROS_VAZIOS, hoje = hojeBrasil()) {
  const f = { ...FILTROS_VAZIOS, ...filtros };
  const cartoes = manutencoes.filter(estaAberta).map((m) => cartao(m, veiculos.get(m.veiculo_id), hoje)).filter((c) => bateFiltros(c, f));
  return {
    total: cartoes.length,
    colunas: COLUNAS.map((col) => {
      const itens = cartoes.filter((c) => col.status.includes(c.status)).sort(compararCartao);
      return { ...col, itens, atrasadas: itens.filter((c) => c.atrasada || c.entregaAtrasada).length };
    }),
  };
}

// Lista única dos cartões do quadro, na ordem em que a equipe deve olhar: atrasados primeiro, depois prioridade e tempo na etapa.
// `etapa` (id de COLUNAS) restringe a uma etapa; vazio = todas.
export function listaPorAtencao(quadro, etapa = '') {
  const itens = quadro.colunas.filter((c) => !etapa || c.id === etapa).flatMap((c) => c.itens);
  const peso = (c) => (c.entregaAtrasada ? 0 : c.atrasada ? 1 : 2);
  return itens.sort((a, b) => peso(a) - peso(b) || compararCartao(a, b));
}

// ---------- parados e alertas ----------
// Veículos parados agora (OS na oficina com o veículo marcado como parado), os mais antigos primeiro.
export function listarParados(manutencoes = [], veiculos = new Map(), hoje = hojeBrasil()) {
  return manutencoes.filter(estaParado).map((m) => {
    const desde = dataBrasil(m.entrada_oficina_em || m.os_emitida_em);
    return { ...cartao(m, veiculos.get(m.veiculo_id), hoje), desde, diasParado: desde ? Math.max(0, diasEntre(desde, hoje)) : null, diasParaEntrega: m.previsao_entrega ? diasEntre(hoje, m.previsao_entrega) : null };
  }).sort((a, b) => (b.diasParado ?? -1) - (a.diasParado ?? -1) || compara(a.placa, b.placa));
}

// O que pede atenção hoje, do mais grave ao menos: entrega vencida, parado sem previsão, etapa travada, urgentes.
export function montarAlertas(manutencoes = [], veiculos = new Map(), hoje = hojeBrasil()) {
  const out = [];
  for (const m of manutencoes.filter(estaAberta)) {
    const c = cartao(m, veiculos.get(m.veiculo_id), hoje);
    const base = { manutencao_id: m.id, veiculo_id: m.veiculo_id, placa: c.placa, codigo: c.codigo };
    if (c.entregaAtrasada) out.push({ ...base, tipo: 'entrega', grau: 0, tom: 'red', titulo: `${c.placa} devia ter saído da oficina`, detalhe: `Previsão ${m.previsao_entrega.split('-').reverse().join('/')} · ${-diasEntre(hoje, m.previsao_entrega)} dia(s) de atraso` });
    else if (c.parado && !c.previsao) out.push({ ...base, tipo: 'sem_previsao', grau: 1, tom: 'amber', titulo: `${c.placa} parado sem previsão de entrega`, detalhe: `Na oficina há ${c.dias ?? 0} dia(s). Informe quando volta para a Programação se organizar.` });
    if (c.atrasada && !c.entregaAtrasada) out.push({ ...base, tipo: 'etapa', grau: 2, tom: 'amber', titulo: `${c.placa} parado em "${statusInfo(m.status).label}"`, detalhe: `${c.dias} dia(s) na mesma etapa (o esperado é até ${LIMITE_DIAS[m.status]}).` });
    if (c.prioridade === 'urgente' && !c.parado) out.push({ ...base, tipo: 'urgente', grau: 3, tom: 'red', titulo: `${c.placa} é urgente`, detalhe: `${statusInfo(m.status).label} há ${c.dias ?? 0} dia(s).` });
  }
  return out.sort((a, b) => a.grau - b.grau || compara(a.placa, b.placa));
}

// ---------- saúde da preventiva ----------
export const SAUDE = [
  { id: 'vencida', rotulo: 'Com serviço vencido', tone: 'red' },
  { id: 'proxima', rotulo: 'Vencendo em breve', tone: 'amber' },
  { id: 'em_dia', rotulo: 'Em dia', tone: 'green' },
  { id: 'sem_historico', rotulo: 'Sem histórico', tone: 'blue' },
];

export function saudeDoResumo(r = {}) {
  if (r.vencida > 0) return 'vencida';
  if (r.proxima > 0) return 'proxima';
  return r.em_dia > 0 ? 'em_dia' : 'sem_historico';
}

// Um resumo por veículo com plano (id → { servicos, resumo, saude }), só dos serviços (trocas e revisões), não das verificações.
export function resumoPreventiva(linhas = [], pendencias = []) {
  const por = new Map();
  for (const v of montarLista(linhas, { tipo: 'servico', pendencias }).veiculos) por.set(v.veiculo_id, { ...v, saude: saudeDoResumo(v.resumo) });
  return por;
}

export function contarSaude(porVeiculo, idsAtivos = null) {
  const out = { vencida: 0, proxima: 0, em_dia: 0, sem_historico: 0 };
  for (const [id, v] of porVeiculo) if (!idsAtivos || idsAtivos.has(id)) out[v.saude] += 1;
  return out;
}

// ---------- custo ----------
export const mesDe = (iso) => String(iso || '').slice(0, 7);

// Custo final das concluídas do mês e nº de serviços, só do que a empresa paga (a que segue para NF/Financeiro).
export function custoDoMes(manutencoes = [], mes = hojeBrasil().slice(0, 7)) {
  let total = 0; let qtd = 0;
  for (const m of manutencoes) {
    if (m.status !== 'concluida' || m.responsavel_pagamento !== 'empresa' || !(Number(m.custo) > 0)) continue;
    if (mesDe(dataBrasil(m.data_execucao)) !== mes) continue;
    total += Number(m.custo); qtd += 1;
  }
  return { total: Math.round(total * 100) / 100, qtd };
}

// ---------- filtros de coordenação/supervisão ----------
export function opcoesDe(veiculos = [], campo) {
  return [...new Set(veiculos.map((v) => String(v[campo] || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// ---------- agenda ----------
export const TIPOS_EVENTO = {
  entrada: { rotulo: 'Entrada na oficina', tone: 'blue' },
  entrega: { rotulo: 'Previsão de entrega', tone: 'amber' },
  atraso: { rotulo: 'Entrega atrasada', tone: 'red' },
  concluida: { rotulo: 'Serviço concluído', tone: 'green' },
  vence: { rotulo: 'Preventiva vence', tone: 'purple' },
};

// Dias do mês em semanas (segunda a domingo), incluindo os dias vizinhos que completam as semanas. Cada dia: { iso, doMes }.
export function gradeDoMes(ano, mes) {
  const primeiro = Date.UTC(ano, mes - 1, 1);
  const dow = (new Date(primeiro).getUTCDay() + 6) % 7; // 0 = segunda
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const total = Math.ceil((dow + ultimo) / 7) * 7;
  const dias = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(primeiro + (i - dow) * DIA_MS);
    dias.push({ iso: d.toISOString().slice(0, 10), doMes: d.getUTCMonth() === mes - 1 });
  }
  const semanas = [];
  for (let i = 0; i < dias.length; i += 7) semanas.push(dias.slice(i, i + 7));
  return semanas;
}

// Eventos por dia (iso → lista) no intervalo [inicio, fim]. Preventivas: um evento por veículo e serviço que vence em data (sem entrar
// o que está em andamento nem o que não tem data de vencimento).
export function eventosDaAgenda(manutencoes = [], veiculos = new Map(), linhasPreventiva = [], { inicio, fim, hoje = hojeBrasil(), incluirPreventivas = true } = {}) {
  const por = new Map();
  const dentro = (iso) => !!iso && (!inicio || iso >= inicio) && (!fim || iso <= fim);
  const add = (iso, ev) => { if (!dentro(iso)) return; if (!por.has(iso)) por.set(iso, []); por.get(iso).push(ev); };
  for (const m of manutencoes) {
    const v = veiculos.get(m.veiculo_id);
    const base = { manutencao_id: m.id, veiculo_id: m.veiculo_id, placa: v?.placa || '(sem placa)', texto: m.descricao || '', parado: estaParado(m) };
    if (m.status !== 'cancelada' && m.status !== 'reprovada') add(dataBrasil(m.entrada_oficina_em), { ...base, tipo: 'entrada' });
    if (m.status === 'em_execucao' && m.previsao_entrega) add(m.previsao_entrega, { ...base, tipo: m.previsao_entrega < hoje ? 'atraso' : 'entrega' });
    if (m.status === 'concluida') add(dataBrasil(m.data_execucao || m.concluida_em), { ...base, tipo: 'concluida' });
  }
  if (incluirPreventivas) {
    for (const l of linhasPreventiva) {
      if (l.tipo !== 'servico' || l.em_andamento || !l.vencimento_data || !['vencida', 'proxima', 'em_dia'].includes(l.status)) continue;
      // Já vencido e fora do mês mostrado não entra; dentro do intervalo aparece no dia do vencimento.
      add(String(l.vencimento_data).slice(0, 10), { tipo: 'vence', veiculo_id: l.veiculo_id, placa: l.placa, texto: l.plano_nome, status: l.status });
    }
  }
  const ordem = { atraso: 0, entrega: 1, entrada: 2, vence: 3, concluida: 4 };
  for (const lista of por.values()) lista.sort((a, b) => (ordem[a.tipo] ?? 9) - (ordem[b.tipo] ?? 9) || compara(a.placa, b.placa));
  return por;
}

// OS na oficina sem data de previsão (a agenda pede para preencher).
export function semPrevisao(manutencoes = [], veiculos = new Map(), hoje = hojeBrasil()) {
  return manutencoes.filter((m) => m.status === 'em_execucao' && !m.previsao_entrega).map((m) => cartao(m, veiculos.get(m.veiculo_id), hoje)).sort(compararCartao);
}

// Veículos na oficina (ou com OS pendente) com entrada e previsão, para a linha do tempo da semana/mês.
export function naOficina(manutencoes = [], veiculos = new Map(), hoje = hojeBrasil()) {
  return manutencoes.filter((m) => m.status === 'em_execucao').map((m) => ({
    ...cartao(m, veiculos.get(m.veiculo_id), hoje), entrada: dataBrasil(m.entrada_oficina_em || m.os_emitida_em),
  })).sort((a, b) => compara(a.previsao || '9999', b.previsao || '9999') || compara(a.placa, b.placa));
}

// ---------- veículos e prontuário ----------
export const SITUACOES_VEICULO = [
  { id: 'parado', rotulo: 'Parado', tone: 'red', dica: 'Veículo na oficina com a OS emitida e marcado como parado' },
  { id: 'andamento', rotulo: 'Com manutenção aberta', tone: 'amber', dica: 'Há solicitação, orçamento, aprovação ou OS em andamento' },
  { id: 'vencida', rotulo: 'Preventiva vencida', tone: 'red', dica: 'Algum serviço do guia já passou do km ou da data' },
  { id: 'proxima', rotulo: 'Vence em breve', tone: 'amber', dica: 'Algum serviço do guia vence em breve' },
  { id: 'documentos', rotulo: 'Documentos pendentes', tone: 'amber', dica: 'Preventivas registradas a que faltam NF, comprovante ou envio' },
  { id: 'todos', rotulo: 'Todos', tone: 'green', dica: 'Todos os veículos ativos e em manutenção' },
];

export function veiculosDaManutencao(veiculos = []) {
  return veiculosUnicos(veiculos).filter((v) => ['ATIVO', 'MANUTENCAO'].includes(String(v.status || '').toUpperCase()));
}

export function situacaoDoVeiculo(v, { abertas = [], preventiva = null, docs = 0 } = {}) {
  const parado = abertas.some(estaParado);
  const saude = preventiva?.saude || null;
  return {
    parado,
    abertas: abertas.length,
    saude,
    docs,
    // única etiqueta de ordenação: o pior estado primeiro
    principal: parado ? 'parado' : abertas.length ? 'andamento' : saude === 'vencida' ? 'vencida' : saude === 'proxima' ? 'proxima' : docs ? 'documentos' : 'ok',
  };
}

const ORDEM_PRINCIPAL = { parado: 0, andamento: 1, vencida: 2, proxima: 3, documentos: 4, ok: 5 };

export function listarVeiculos(veiculos = [], manutencoes = [], preventivaPorVeiculo = new Map(), pendencias = [], { busca = '', filtro = 'todos', coordenacao = '', supervisao = '' } = {}) {
  const abertasPor = new Map(); const docsPor = new Map(); const ultimaPor = new Map(); const custoPor = new Map();
  const limite = somarDias(hojeBrasil(), -365);
  for (const m of manutencoes) {
    if (estaAberta(m)) { if (!abertasPor.has(m.veiculo_id)) abertasPor.set(m.veiculo_id, []); abertasPor.get(m.veiculo_id).push(m); }
    if (m.status === 'concluida') {
      const d = dataBrasil(m.data_execucao || m.concluida_em);
      if (d && d > (ultimaPor.get(m.veiculo_id) || '')) ultimaPor.set(m.veiculo_id, d);
      if (d >= limite && m.responsavel_pagamento === 'empresa' && Number(m.custo) > 0) custoPor.set(m.veiculo_id, (custoPor.get(m.veiculo_id) || 0) + Number(m.custo));
    }
  }
  for (const p of pendencias) docsPor.set(p.veiculo_id, (docsPor.get(p.veiculo_id) || 0) + 1);
  const termo = norm(busca);
  const linhas = veiculos.map((v) => {
    const sit = situacaoDoVeiculo(v, { abertas: abertasPor.get(v.id) || [], preventiva: preventivaPorVeiculo.get(v.id) || null, docs: docsPor.get(v.id) || 0 });
    const prev = preventivaPorVeiculo.get(v.id) || null;
    return { veiculo: v, placa: v.placa, modelo: rotuloVeiculo(v), sit, resumo: prev?.resumo || null, maisUrgente: prev?.maisUrgente || null, km: prev?.hodometro ?? null, ultima: ultimaPor.get(v.id) || '', custo12m: Math.round((custoPor.get(v.id) || 0) * 100) / 100, abertas: abertasPor.get(v.id) || [] };
  }).filter((l) => (!coordenacao || l.veiculo.coordenacao === coordenacao) && (!supervisao || l.veiculo.supervisao === supervisao)
    && (!termo || norm([l.placa, l.modelo, l.veiculo.coordenacao, l.veiculo.supervisao, l.veiculo.motorista_atual].join(' ')).includes(termo)));
  const bate = (l, f) => f === 'todos' || (f === 'parado' ? l.sit.parado : f === 'andamento' ? l.sit.abertas > 0 : f === 'vencida' ? l.sit.saude === 'vencida' : f === 'proxima' ? l.sit.saude === 'proxima' : f === 'documentos' ? l.sit.docs > 0 : true);
  const contagem = Object.fromEntries(SITUACOES_VEICULO.map((s) => [s.id, linhas.filter((l) => bate(l, s.id)).length]));
  const lista = linhas.filter((l) => bate(l, filtro)).sort((a, b) => (ORDEM_PRINCIPAL[a.sit.principal] - ORDEM_PRINCIPAL[b.sit.principal]) || compara(a.placa, b.placa));
  return { lista, contagem };
}

// Tudo de um veículo para a ficha (prontuário): abertas, histórico, custos, preventiva e pendências de documento.
export function montarProntuario(veiculo, manutencoes = [], preventiva = null, pendencias = [], hoje = hojeBrasil()) {
  const minhas = manutencoes.filter((m) => m.veiculo_id === veiculo.id);
  const abertas = minhas.filter(estaAberta).sort((a, b) => ((RANK_PRIORIDADE[a.prioridade] ?? 2) - (RANK_PRIORIDADE[b.prioridade] ?? 2)) || compara(desdeDaEtapa(a) || '', desdeDaEtapa(b) || ''));
  const historico = minhas.filter((m) => !estaAberta(m)).sort((a, b) => compara(dataBrasil(b.data_execucao || b.concluida_em || b.solicitado_em), dataBrasil(a.data_execucao || a.concluida_em || a.solicitado_em)) || compara(b.numero || 0, a.numero || 0));
  const concluidas = minhas.filter((m) => m.status === 'concluida');
  const limite = somarDias(hoje, -365);
  const doAno = concluidas.filter((m) => (dataBrasil(m.data_execucao || m.concluida_em) || '') >= limite);
  const custoAno = doAno.filter((m) => m.responsavel_pagamento === 'empresa' && Number(m.custo) > 0).reduce((s, m) => s + Number(m.custo), 0);
  const parada = abertas.find(estaParado) || null;
  const servicos = preventiva?.servicos || [];
  return {
    abertas, historico, parada,
    servicosAtencao: servicos.filter((s) => ['vencida', 'proxima'].includes(s.status)),
    servicosSemHistorico: servicos.filter((s) => s.status === 'sem_historico').length,
    servicosEmDia: servicos.filter((s) => s.status === 'em_dia').length,
    kpis: {
      qtdAno: doAno.length, corretivas: doAno.filter((m) => m.natureza === 'corretiva').length, preventivas: doAno.filter((m) => m.natureza === 'preventiva').length,
      custoAno: Math.round(custoAno * 100) / 100, ultima: concluidas.map((m) => dataBrasil(m.data_execucao || m.concluida_em)).sort().pop() || '',
    },
    docs: pendencias.filter((p) => p.veiculo_id === veiculo.id),
  };
}
