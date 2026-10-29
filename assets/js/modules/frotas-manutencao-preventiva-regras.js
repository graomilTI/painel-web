// Frotas · Manutenção › Preventiva: regras puras (sem DOM nem Supabase).
// A tela é uma lista com um veículo por linha; os serviços do guia de cada veículo (frotas_manutencao_vencimentos_v)
// aparecem no painel lateral, agrupados por sistema.
import { RESPONSAVEIS, norm, somaNotas } from './frotas-manutencao-regras.js?v=20261029-frotas-inst80';

export const FILTROS_PREVENTIVA = [
  { id: 'atencao', rotulo: 'Com vencida ou próxima', tone: 'red', icone: 'alerta', dica: 'Veículos com algum serviço vencido ou perto de vencer' },
  { id: 'vencida', rotulo: 'Com vencida', tone: 'red', icone: 'erro', dica: 'Passaram do km ou da data' },
  { id: 'proxima', rotulo: 'Com próxima', tone: 'amber', icone: 'relogio', dica: 'Vencem em breve' },
  { id: 'sem_historico', rotulo: 'Sem histórico', tone: 'blue', icone: 'doc', dica: 'Há serviço sem nenhuma execução registrada' },
  { id: 'documentos', rotulo: 'Documentos pendentes', tone: 'amber', icone: 'doc', dica: 'Preventivas registradas a que ainda faltam NF, comprovante ou envio' },
  { id: 'todos', rotulo: 'Todos os veículos', tone: 'green', icone: 'total', dica: 'Todos os veículos ativos' },
];

const ORDEM_STATUS = { vencida: 0, proxima: 1, sem_hodometro: 2, em_dia: 3, sem_historico: 4 };

const compara = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const numOuFim = (v) => (v == null ? Number.POSITIVE_INFINITY : Number(v));

// Ordem de urgência de um serviço: vencida antes de próxima; dentro da situação, o mais atrasado (menos dias/km restantes) primeiro.
export function comparaUrgencia(a, b) {
  return compara(ORDEM_STATUS[a.status] ?? 9, ORDEM_STATUS[b.status] ?? 9)
    || compara(numOuFim(a.dias_restantes), numOuFim(b.dias_restantes))
    || compara(numOuFim(a.km_restante), numOuFim(b.km_restante))
    || compara(a.categoria_codigo, b.categoria_codigo)
    || compara(String(a.plano_nome), String(b.plano_nome));
}

// Veículo bate com o filtro se algum serviço dele (dos exibidos) está na situação.
export function veiculoBateFiltro(resumo, filtro) {
  if (filtro === 'todos') return true;
  if (filtro === 'atencao') return resumo.vencida > 0 || resumo.proxima > 0;
  return (resumo[filtro] || 0) > 0;
}

// Sistemas (categorias do guia) que existem nos dados, para o filtro "Sistema".
export function categoriasDisponiveis(linhas, tipo = 'servico') {
  const mapa = new Map();
  for (const l of linhas || []) if (tipo === 'todos' || l.tipo === tipo) mapa.set(l.categoria_codigo, l.categoria_nome);
  return [...mapa.entries()].map(([codigo, nome]) => ({ codigo, nome })).sort((a, b) => a.codigo - b.codigo);
}

// Um item por veículo, do mais urgente para o menos; cada veículo leva seus serviços ordenados por urgência.
export function montarLista(linhas, { tipo = 'servico', busca = '', filtro = 'todos', categoria = '', pendencias = [] } = {}) {
  const porVeiculo = new Map();
  const docsPorVeiculo = new Map();
  for (const p of pendencias) docsPorVeiculo.set(p.veiculo_id, (docsPorVeiculo.get(p.veiculo_id) || 0) + 1);
  for (const l of linhas || []) {
    if (tipo !== 'todos' && l.tipo !== tipo) continue;
    if (categoria && String(l.categoria_codigo) !== String(categoria)) continue;
    if (!porVeiculo.has(l.veiculo_id)) {
      porVeiculo.set(l.veiculo_id, {
        veiculo_id: l.veiculo_id, placa: l.placa, marca_modelo: l.marca_modelo, coordenacao: l.coordenacao, supervisao: l.supervisao,
        hodometro: l.hodometro, servicos: [], resumo: { vencida: 0, proxima: 0, em_dia: 0, sem_historico: 0, sem_hodometro: 0, documentos: docsPorVeiculo.get(l.veiculo_id) || 0 }, maisUrgente: null,
      });
    }
    const v = porVeiculo.get(l.veiculo_id);
    v.servicos.push(l);
    v.resumo[l.status] = (v.resumo[l.status] || 0) + 1;
  }
  for (const v of porVeiculo.values()) {
    v.servicos.sort(comparaUrgencia);
    const primeiro = v.servicos[0];
    v.maisUrgente = primeiro && ['vencida', 'proxima'].includes(primeiro.status) ? primeiro : null;
  }
  const termo = norm(busca);
  const todos = [...porVeiculo.values()]
    .sort((a, b) => compara(b.resumo.vencida, a.resumo.vencida) || compara(b.resumo.proxima, a.resumo.proxima) || compara(a.placa, b.placa));
  const buscados = todos.filter((v) => !termo || norm([v.placa, v.marca_modelo, v.coordenacao, v.supervisao].join(' ')).includes(termo));
  const veiculos = buscados.filter((v) => veiculoBateFiltro(v.resumo, filtro));
  const contagem = Object.fromEntries(FILTROS_PREVENTIVA.map((f) => [f.id, buscados.filter((v) => veiculoBateFiltro(v.resumo, f.id)).length]));
  return { veiculos, contagem };
}

// A RPC frotas_preventiva_painel devolve um item por veículo com os serviços dentro (chaves curtas, sem nulos). Aqui volta ao formato
// de linha da view frotas_manutencao_vencimentos_v (uma por veículo e serviço), juntando o nome/sistema do serviço (planos e
// categorias do guia, que o cliente já tem). planos: Map(id → plano); categorias: Map(codigo → nome).
export function expandirPainel(painel, planos, categorias) {
  const linhas = [];
  for (const v of painel || []) {
    for (const s of v.s || []) {
      const p = planos.get(s.p);
      if (!p) continue;
      linhas.push({
        veiculo_id: v.v, placa: v.placa, marca_modelo: v.mm ?? null, coordenacao: v.co ?? null, supervisao: v.su ?? null, hodometro: v.km ?? null,
        plano_id: s.p, plano_codigo: p.codigo, plano_nome: p.nome, tipo: p.tipo, categoria_codigo: p.categoria_codigo, categoria_nome: categorias.get(p.categoria_codigo) || '',
        status: s.st, data_ultima: s.du ?? null, km_ultima: s.ku ?? null, vencimento_km: s.vk ?? null, vencimento_data: s.vd ?? null,
        km_restante: s.kr ?? null, dias_restantes: s.dr ?? null, em_andamento: !!s.ea,
      });
    }
  }
  return linhas;
}

// Nome do serviço para os cards: sem o "Troca de/do/da/dos/das" do início (a ação é óbvia) e com a primeira letra maiúscula.
export function nomeCurto(nome) {
  const t = String(nome || '').trim().replace(/^troca\s+(?:de|do|da|dos|das)\s+/i, '');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : String(nome || '');
}

// Serviços que aparecem nos cards: serviços (verificações só quando ligadas ou já selecionadas) que combinam com a pesquisa
// (nome do serviço ou do sistema do guia, sem acento nem caixa). Mantém a ordem recebida (urgência).
export function filtrarServicos(servicos, { busca = '', verificacoes = false, selecionados = new Set() } = {}) {
  const termo = norm(busca);
  return (servicos || []).filter((s) => (verificacoes || s.tipo === 'servico' || selecionados.has(s.plano_id))
    && (!termo || norm(`${s.plano_nome} ${nomeCurto(s.plano_nome)} ${s.categoria_nome || ''}`).includes(termo)));
}

// Grupos do guia (Pneus, Freios, Motor...) dos serviços de um veículo: cada serviço vai ao grupo do seu sistema; o que não tem grupo
// cai em "Outros" (código 0). Devolve [{ codigo, nome, total, status (o mais urgente do grupo) }] na ordem do guia.
const PESO_STATUS = { vencida: 4, proxima: 3, sem_historico: 2, em_dia: 1 };
export function gruposDoPainel(servicos = [], { categorias = [], grupos = [] } = {}) {
  const porCategoria = new Map(categorias.map((c) => [Number(c.codigo), c.grupo_codigo != null ? Number(c.grupo_codigo) : 0]));
  const mapa = new Map();
  for (const s of servicos) {
    const cod = porCategoria.get(Number(s.categoria_codigo)) || 0;
    const g = mapa.get(cod) || { codigo: cod, nome: '', total: 0, status: 'em_dia' };
    g.total += 1;
    if ((PESO_STATUS[s.status] || 0) > (PESO_STATUS[g.status] || 0)) g.status = s.status;
    mapa.set(cod, g);
  }
  const ordem = new Map(grupos.map((g, i) => [Number(g.codigo), i]));
  return [...mapa.values()]
    .map((g) => ({ ...g, nome: g.codigo ? (grupos.find((x) => Number(x.codigo) === g.codigo)?.nome || `Grupo ${g.codigo}`) : 'Outros' }))
    .sort((a, b) => (ordem.has(a.codigo) ? ordem.get(a.codigo) : 99) - (ordem.has(b.codigo) ? ordem.get(b.codigo) : 99));
}

export function grupoDoServico(servico, { categorias = [] } = {}) {
  const c = categorias.find((x) => Number(x.codigo) === Number(servico.categoria_codigo));
  return c?.grupo_codigo != null ? Number(c.grupo_codigo) : 0;
}

// Serviços de um veículo que pedem uma solicitação: vencidos ou próximos, sem outra em andamento.
export function pendentesDoVeiculo(veiculo, tipo = 'servico') {
  return [...veiculo.servicos]
    .filter((c) => ['vencida', 'proxima'].includes(c.status) && !c.em_andamento && (tipo === 'todos' || c.tipo === tipo))
    .sort(comparaUrgencia);
}

// ---------- datas e prazos ----------
// Data de hoje em Brasília (toISOString daria a data em UTC, que vira amanhã a partir das 21h).
export const hojeBrasilISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

const pad = (n) => String(n).padStart(2, '0');
const ultimoDiaDoMes = (ano, mes) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

// Soma meses e dias como o Postgres (dia limitado ao fim do mês: 31/01 + 1 mês = 28/02).
export function somarPrazo(dataISO, { meses = 0, dias = 0 } = {}) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dataISO || ''));
  if (!m) return null;
  let ano = Number(m[1]); let mes = Number(m[2]) + Number(meses || 0); const dia0 = Number(m[3]);
  ano += Math.floor((mes - 1) / 12); mes = ((mes - 1) % 12 + 12) % 12 + 1;
  const dia = Math.min(dia0, ultimoDiaDoMes(ano, mes));
  const d = new Date(Date.UTC(ano, mes - 1, dia + Number(dias || 0)));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// Próximo km e próxima data sugeridos para um serviço feito em (dataISO, km) pelo intervalo do plano.
export function proximoPrazo(plano, dataISO, km) {
  const kmNum = km === '' || km == null ? null : Number(km);
  const proximoKm = plano.intervalo_km && kmNum > 0 ? kmNum + Number(plano.intervalo_km) : null;
  const proximaData = (plano.intervalo_meses || plano.intervalo_dias) && dataISO
    ? somarPrazo(dataISO, { meses: plano.intervalo_meses || 0, dias: plano.intervalo_dias || 0 })
    : null;
  return { proximo_km: proximoKm, proxima_data: proximaData };
}

// Opções de prazo para escolher com um toque: o guia dá faixas (ex.: 5.000 a 10.000 km, 6 a 12 meses); o intervalo
// do plano é o menor, o máximo é a outra opção.
export function opcoesDePrazo(plano) {
  const unicos = (...v) => [...new Set(v.filter((x) => x != null && Number(x) > 0).map(Number))];
  return { kms: unicos(plano.intervalo_km, plano.intervalo_km_max), meses: unicos(plano.intervalo_meses, plano.intervalo_meses_max), dias: unicos(plano.intervalo_dias) };
}

// Km do serviço + um acréscimo (nulo se o km do serviço não foi informado).
export const kmMais = (km, add) => (km !== '' && km != null && Number(km) > 0 ? Number(km) + Number(add) : null);

// ---------- validação do registro, por passo ----------
const kmOuNulo = (km) => (km === '' || km == null ? null : Number(km));

// Passo 1: o que foi feito (data, km e ao menos um serviço).
export function validarPasso1({ data, km, itens = [] }, hojeISO) {
  const erros = [];
  if (!data) erros.push('Informe a data em que o serviço foi feito.');
  else if (hojeISO && data > hojeISO) erros.push('A data do serviço não pode ser futura.');
  const kmNum = kmOuNulo(km);
  if (kmNum == null || !(kmNum > 0)) erros.push('Informe o km do veículo no dia do serviço.');
  if (!itens.length) erros.push('Marque ao menos um serviço que foi feito.');
  return erros;
}

// Passo 2: próximos prazos (opcionais, mas precisam ser depois do serviço).
export function validarPasso2({ data, km, itens = [] }) {
  const erros = [];
  const kmNum = kmOuNulo(km);
  for (const it of itens) {
    const nome = it.nome || 'Serviço';
    const pk = it.proximo_km;
    if (pk != null && pk !== '' && !(Number(pk) > 0)) erros.push(`Próximo km de "${nome}" deve ser maior que zero.`);
    else if (pk != null && pk !== '' && kmNum != null && Number(pk) <= kmNum) erros.push(`Próximo km de "${nome}" deve ser maior que o km do serviço.`);
    if (it.proxima_data && data && it.proxima_data <= data) erros.push(`Próxima data de "${nome}" deve ser depois da data do serviço.`);
  }
  return erros;
}

// Passo 3: pagamento e notas (opcional; com notas exige quem paga e custo que cubra a soma).
export function validarPasso3({ notas = [], custo = 0, responsavel = '' }) {
  const erros = [];
  if (Number(custo) < 0) erros.push('O custo não pode ser negativo.');
  if (notas.length) {
    if (!responsavel) erros.push('Informe quem paga a manutenção para lançar as notas.');
    if (somaNotas(notas) > Number(custo || 0) + 0.01) erros.push('O custo total não pode ser menor que a soma das notas.');
  }
  return erros;
}

export function validarRegistroPreventiva(registro, hojeISO) {
  return [...validarPasso1(registro, hojeISO), ...validarPasso2(registro), ...validarPasso3(registro)];
}

// Mesmos indicadores da view frotas_preventiva_pendencias_v, calculados no cliente a partir da manutenção e das notas
// (para atualizar o "o que falta" na hora, sem recarregar a view).
export function registroComPendencias(m, notas = []) {
  const semNf = notas.filter((n) => !n.anexo_url).length;
  const aEnviar = notas.filter((n) => n.anexo_url && !n.enviada_em).length;
  const semComprovante = notas.filter((n) => !n.comprovante_url && !n.pago_em).length;
  const exige = !m.pendencia_dispensada_em && (m.responsavel_pagamento || 'empresa') === 'empresa';
  return {
    ...m,
    falta_responsavel: !m.pendencia_dispensada_em && !m.responsavel_pagamento,
    falta_nf: exige && (!notas.length || semNf > 0),
    falta_enviar: exige && aEnviar > 0,
    falta_comprovante: exige && (!notas.length || semComprovante > 0),
  };
}

// O que falta em uma preventiva registrada (linha de frotas_preventiva_pendencias_v). itens = o que falta, em ordem de ação.
export function pendenciasDoRegistro(r) {
  if (r.pendencia_dispensada_em) return { id: 'dispensada', tom: 'gray', texto: 'Pendências dispensadas', itens: [] };
  const resp = r.responsavel_pagamento;
  if (resp && resp !== 'empresa') return { id: 'outro', tom: 'blue', texto: `Pago por ${(RESPONSAVEIS.find((x) => x.id === resp) || {}).label || resp}`, itens: [] };
  const itens = [];
  if (r.falta_responsavel) itens.push({ id: 'responsavel', texto: 'Falta definir quem paga' });
  if (r.falta_nf) itens.push({ id: 'nf', texto: 'Falta NF/NFS-e' });
  if (r.falta_enviar) itens.push({ id: 'enviar', texto: 'Falta enviar ao GRM e Financeiro' });
  if (r.falta_comprovante) itens.push({ id: 'comprovante', texto: 'Falta comprovante' });
  return itens.length ? { id: 'pendente', tom: 'amber', texto: itens.map((i) => i.texto).join(' · '), itens } : { id: 'completo', tom: 'green', texto: 'Completo', itens: [] };
}

// Texto curto do vencimento: quanto falta (ou passou) em km e em dias.
const fmtNum = (v) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
export function restanteCelula(l) {
  const partes = [];
  if (l.km_restante != null) partes.push(l.km_restante < 0 ? `${fmtNum(Math.abs(l.km_restante))} km acima` : `faltam ${fmtNum(l.km_restante)} km`);
  if (l.dias_restantes != null) partes.push(l.dias_restantes < 0 ? `${Math.abs(l.dias_restantes)} d atrasado` : l.dias_restantes === 0 ? 'vence hoje' : `${l.dias_restantes} d`);
  return partes.join(' · ');
}
