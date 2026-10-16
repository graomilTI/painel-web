// Frotas · Manutenção › Preventiva: regras puras (sem DOM nem Supabase).
// A matriz tem um veículo por linha e um serviço do guia por coluna; cada célula vem de frotas_manutencao_vencimentos_v.
import { norm } from './frotas-manutencao-regras.js?v=20261016-frotas-termo-cnpj';

export const FILTROS_PREVENTIVA = [
  { id: 'atencao', rotulo: 'Com vencida ou próxima', tone: 'red', icone: 'alerta', dica: 'Veículos com algum serviço vencido ou perto de vencer' },
  { id: 'vencida', rotulo: 'Com vencida', tone: 'red', icone: 'erro', dica: 'Passaram do km ou da data' },
  { id: 'proxima', rotulo: 'Com próxima', tone: 'amber', icone: 'relogio', dica: 'Vencem em breve' },
  { id: 'sem_historico', rotulo: 'Sem histórico', tone: 'blue', icone: 'doc', dica: 'Há serviço sem nenhuma execução registrada' },
  { id: 'todos', rotulo: 'Todos os veículos', tone: 'green', icone: 'total', dica: 'Todos os veículos ativos' },
];

const ORDEM_STATUS = { vencida: 0, proxima: 1, sem_hodometro: 2, em_dia: 3, sem_historico: 4 };

const compara = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Veículo bate com o filtro se alguma célula dele (dos serviços exibidos) está na situação.
export function veiculoBateFiltro(resumo, filtro) {
  if (filtro === 'todos') return true;
  if (filtro === 'atencao') return resumo.vencida > 0 || resumo.proxima > 0;
  return (resumo[filtro] || 0) > 0;
}

export function montarMatriz(linhas, { tipo = 'servico', busca = '', filtro = 'todos' } = {}) {
  const doTipo = (linhas || []).filter((l) => tipo === 'todos' || l.tipo === tipo);
  const colunasPorCodigo = new Map();
  const porVeiculo = new Map();
  for (const l of doTipo) {
    if (!colunasPorCodigo.has(l.plano_codigo)) {
      colunasPorCodigo.set(l.plano_codigo, { codigo: l.plano_codigo, nome: l.plano_nome, categoria_codigo: l.categoria_codigo, categoria_nome: l.categoria_nome, tipo: l.tipo });
    }
    if (!porVeiculo.has(l.veiculo_id)) {
      porVeiculo.set(l.veiculo_id, {
        veiculo_id: l.veiculo_id, placa: l.placa, marca_modelo: l.marca_modelo, coordenacao: l.coordenacao, supervisao: l.supervisao,
        hodometro: l.hodometro, celulas: new Map(), resumo: { vencida: 0, proxima: 0, em_dia: 0, sem_historico: 0, sem_hodometro: 0 },
      });
    }
    const v = porVeiculo.get(l.veiculo_id);
    v.celulas.set(l.plano_codigo, l);
    v.resumo[l.status] = (v.resumo[l.status] || 0) + 1;
  }
  const colunas = [...colunasPorCodigo.values()].sort((a, b) => compara(a.categoria_codigo, b.categoria_codigo) || compara(a.nome, b.nome));
  const termo = norm(busca);
  const todos = [...porVeiculo.values()].sort((a, b) => compara(a.placa, b.placa));
  const buscados = todos.filter((v) => !termo || norm([v.placa, v.marca_modelo, v.coordenacao, v.supervisao].join(' ')).includes(termo));
  const veiculos = buscados.filter((v) => veiculoBateFiltro(v.resumo, filtro));
  const contagem = Object.fromEntries(FILTROS_PREVENTIVA.map((f) => [f.id, buscados.filter((v) => veiculoBateFiltro(v.resumo, f.id)).length]));
  return { colunas, veiculos, contagem };
}

// Serviços de um veículo que pedem uma solicitação: vencidos ou próximos, sem outra em andamento.
export function pendentesDoVeiculo(veiculo, tipo = 'servico') {
  return [...veiculo.celulas.values()]
    .filter((c) => ['vencida', 'proxima'].includes(c.status) && !c.em_andamento && (tipo === 'todos' || c.tipo === tipo))
    .sort((a, b) => compara(ORDEM_STATUS[a.status], ORDEM_STATUS[b.status]) || compara(a.categoria_codigo, b.categoria_codigo));
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

export function validarRegistroPreventiva({ data, km, itens = [] }, hojeISO) {
  const erros = [];
  if (!data) erros.push('Informe a data em que o serviço foi feito.');
  else if (hojeISO && data > hojeISO) erros.push('A data do serviço não pode ser futura.');
  const kmNum = km === '' || km == null ? null : Number(km);
  if (kmNum == null || !(kmNum > 0)) erros.push('Informe o km do veículo no dia do serviço.');
  if (!itens.length) erros.push('Marque ao menos um serviço que foi feito.');
  for (const it of itens) {
    const nome = it.nome || 'Serviço';
    if (it.proximo_km != null && it.proximo_km !== '' && !(Number(it.proximo_km) > 0)) erros.push(`Próximo km de "${nome}" deve ser maior que zero.`);
    else if (it.proximo_km != null && it.proximo_km !== '' && kmNum != null && Number(it.proximo_km) <= kmNum) erros.push(`Próximo km de "${nome}" deve ser maior que o km do serviço.`);
    if (it.proxima_data && data && it.proxima_data <= data) erros.push(`Próxima data de "${nome}" deve ser depois da data do serviço.`);
  }
  return erros;
}

// Texto curto da célula da matriz: vence em (data e km) e quanto falta.
const fmtNum = (v) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
export function restanteCelula(l) {
  const partes = [];
  if (l.km_restante != null) partes.push(l.km_restante < 0 ? `${fmtNum(Math.abs(l.km_restante))} km acima` : `faltam ${fmtNum(l.km_restante)} km`);
  if (l.dias_restantes != null) partes.push(l.dias_restantes < 0 ? `${Math.abs(l.dias_restantes)} d atrasado` : l.dias_restantes === 0 ? 'vence hoje' : `${l.dias_restantes} d`);
  return partes.join(' · ');
}
