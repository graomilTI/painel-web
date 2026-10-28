// Frotas › Dashboard: leitura dos dados. Cada função devolve só as colunas que o dashboard usa (a API entrega no máximo 1.000 linhas
// por consulta, então tudo é paginado) e a tela trata cada bloco de forma independente: um que falhe ou demore não derruba os outros.
import { FECHADAS } from './frotas-dashboard-regras.js?v=20261028-dash2';

const PAGINA = 1000;

// Promise.race com limite de tempo: a consulta continua no servidor, mas o bloco deixa de ficar eternamente em "carregando".
export function comTimeout(promessa, ms = 25000, rotulo = 'consulta') {
  let timer;
  const limite = new Promise((_, rejeitar) => {
    timer = setTimeout(() => rejeitar(new Error(`${rotulo}: sem resposta em ${Math.round(ms / 1000)} s`)), ms);
  });
  return Promise.race([Promise.resolve(promessa), limite]).finally(() => clearTimeout(timer));
}

// construir(): query nova a cada página (o builder do supabase-js não pode ser reaproveitado depois de executado).
async function paginar(construir, { maxPaginas = 10 } = {}) {
  const linhas = [];
  for (let p = 0; p < maxPaginas; p += 1) {
    const { data, error } = await construir().range(p * PAGINA, (p + 1) * PAGINA - 1);
    if (error) throw error;
    const lote = data || [];
    linhas.push(...lote);
    if (lote.length < PAGINA) return { linhas, truncado: false };
  }
  return { linhas, truncado: true };
}

export async function carregarVeiculos(sb) {
  const { linhas } = await paginar(() => sb.from('frotas_veiculos')
    .select('id,placa,status,possui_rastreador,bfleet_rastreador,rastreador_bfleet,patrimonio_coordenacao,patrimonio_supervisao,coordenacao,supervisao,motorista_atual,bfleet_condutor,patrimonio_funcionario,condutor_patrimonio,patrimonio_codigo,patrimonio_dias_sem_leitura')
    .order('id', { ascending: true }));
  return linhas;
}

// Multas ainda não arquivadas (as arquivadas/OK já saíram do fluxo da tela de Multas).
export async function carregarMultas(sb) {
  const { linhas } = await paginar(() => sb.from('frotas_multas')
    .select('id,placa,motorista,status_multa,situacao,valor_original,status_notificacao,acao_status,identificar_solicitado_em,condutor_identificado_em,data_limite_defesa,data_vencimento_auto,data_limite_pagto,data_vencimento,arquivada_em,ok_em')
    .is('arquivada_em', null).is('ok_em', null)
    .order('id', { ascending: true }));
  return linhas;
}

// Excessos de velocidade que ainda aguardam notificação ao condutor (mesmos status da aba Notificação).
export async function carregarExcessosPendentes(sb) {
  const { linhas, truncado } = await paginar(() => sb.from('frotas_excesso_velocidade')
    .select('id,placa').in('status_notificacao', ['PENDENTE', 'GERADA']).order('id', { ascending: true }), { maxPaginas: 6 });
  return { linhas, truncado };
}

// Eventos (excesso de velocidade ou fora do horário) entre duas datas, para contar o período e o anterior e achar reincidentes.
export async function carregarEventos(sb, tabela, ini, fim) {
  const colunas = tabela === 'frotas_excesso_velocidade'
    ? 'id,placa,data_evento,velocidade,patrimonio_funcionario,motorista_planilha'
    : 'id,placa,data_evento,patrimonio_funcionario,motorista_planilha';
  const { linhas, truncado } = await paginar(() => sb.from(tabela).select(colunas)
    .gte('data_evento', ini).lte('data_evento', fim).order('id', { ascending: true }), { maxPaginas: 8 });
  return { linhas, truncado };
}

export async function carregarMotoristas(sb) {
  const { linhas } = await paginar(() => sb.from('frotas_motoristas').select('id,nome,status,cnh_validade').order('id', { ascending: true }));
  return linhas;
}

// Manutenções em aberto (qualquer data) e as concluídas e pagas pela empresa no intervalo (mesma regra da aba Custos).
export async function carregarManutencoes(sb, ini, fim) {
  const [abertas, concluidas] = await Promise.all([
    paginar(() => sb.from('frotas_manutencoes').select('id,veiculo_id,status,prioridade')
      .not('status', 'in', `(${FECHADAS.join(',')})`).order('id', { ascending: true })),
    paginar(() => sb.from('frotas_manutencoes').select('id,veiculo_id,custo,data_execucao')
      .eq('status', 'concluida').eq('responsavel_pagamento', 'empresa')
      .gte('data_execucao', ini).lte('data_execucao', fim).order('id', { ascending: true })),
  ]);
  return { abertas: abertas.linhas, concluidas: concluidas.linhas };
}

// Vencimentos do guia de manutenção. Usa a mesma função da aba Preventiva (um jsonb por veículo): a view por trás dela tem
// milhares de linhas e consultá-la direto (como o dashboard fazia) estourava o tempo.
export async function carregarVencimentos(sb) {
  const [painel, planos] = await Promise.all([
    sb.rpc('frotas_preventiva_painel'),
    paginar(() => sb.from('frotas_manutencao_planos').select('id,tipo').eq('ativo', true).order('id', { ascending: true })),
  ]);
  if (painel.error) throw painel.error;
  return { painel: Array.isArray(painel.data) ? painel.data : [], planosTipo: new Map(planos.linhas.map((p) => [p.id, p.tipo])) };
}
