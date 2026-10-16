// Frotas · Manutenção › Preventiva: regras puras (sem DOM nem Supabase).
// A tela é uma lista com um veículo por linha; os serviços do guia de cada veículo (frotas_manutencao_vencimentos_v)
// aparecem no painel lateral, agrupados por sistema.
import { norm, somaNotas } from './frotas-manutencao-regras.js?v=20261016-frotas-manut18';

export const FILTROS_PREVENTIVA = [
  { id: 'atencao', rotulo: 'Com vencida ou próxima', tone: 'red', icone: 'alerta', dica: 'Veículos com algum serviço vencido ou perto de vencer' },
  { id: 'vencida', rotulo: 'Com vencida', tone: 'red', icone: 'erro', dica: 'Passaram do km ou da data' },
  { id: 'proxima', rotulo: 'Com próxima', tone: 'amber', icone: 'relogio', dica: 'Vencem em breve' },
  { id: 'sem_historico', rotulo: 'Sem histórico', tone: 'blue', icone: 'doc', dica: 'Há serviço sem nenhuma execução registrada' },
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
export function montarLista(linhas, { tipo = 'servico', busca = '', filtro = 'todos', categoria = '' } = {}) {
  const porVeiculo = new Map();
  for (const l of linhas || []) {
    if (tipo !== 'todos' && l.tipo !== tipo) continue;
    if (categoria && String(l.categoria_codigo) !== String(categoria)) continue;
    if (!porVeiculo.has(l.veiculo_id)) {
      porVeiculo.set(l.veiculo_id, {
        veiculo_id: l.veiculo_id, placa: l.placa, marca_modelo: l.marca_modelo, coordenacao: l.coordenacao, supervisao: l.supervisao,
        hodometro: l.hodometro, servicos: [], resumo: { vencida: 0, proxima: 0, em_dia: 0, sem_historico: 0, sem_hodometro: 0 }, maisUrgente: null,
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

// Serviços de um veículo agrupados por sistema do guia; o grupo pede atenção se tem vencida ou próxima.
export function agruparPorSistema(servicos) {
  const grupos = new Map();
  for (const s of servicos || []) {
    if (!grupos.has(s.categoria_codigo)) grupos.set(s.categoria_codigo, { categoria_codigo: s.categoria_codigo, categoria_nome: s.categoria_nome, itens: [], vencida: 0, proxima: 0 });
    const g = grupos.get(s.categoria_codigo);
    g.itens.push(s);
    if (s.status === 'vencida') g.vencida += 1;
    if (s.status === 'proxima') g.proxima += 1;
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, itens: [...g.itens].sort(comparaUrgencia), atencao: g.vencida + g.proxima > 0 }))
    .sort((a, b) => compara(Number(b.atencao), Number(a.atencao)) || compara(a.categoria_codigo, b.categoria_codigo));
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

// Texto curto do vencimento: quanto falta (ou passou) em km e em dias.
const fmtNum = (v) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
export function restanteCelula(l) {
  const partes = [];
  if (l.km_restante != null) partes.push(l.km_restante < 0 ? `${fmtNum(Math.abs(l.km_restante))} km acima` : `faltam ${fmtNum(l.km_restante)} km`);
  if (l.dias_restantes != null) partes.push(l.dias_restantes < 0 ? `${Math.abs(l.dias_restantes)} d atrasado` : l.dias_restantes === 0 ? 'vence hoje' : `${l.dias_restantes} d`);
  return partes.join(' · ');
}
