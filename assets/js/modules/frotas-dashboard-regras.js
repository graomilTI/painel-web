// Frotas › Dashboard: regras de cálculo (puras, sem DOM nem Supabase) — testadas em tests/frotas-dashboard-regras.test.mjs.
// As telas de destino (Multas, Manutenção, Notificação…) têm as suas próprias regras; aqui só se reproduz o necessário para contar
// o que pede ação, mantendo o mesmo critério delas (ex.: multa arquivada ou paga não conta; o prazo muda depois do condutor indicado).

export const LIMITE_GPS_DIAS = 7;
export const AVISO_CNH_DIAS = 30;
export const AVISO_MULTA_DIAS = 7;
export const LIMITE_CHECKLIST_DIAS = 30; // mesmo limite da aba Checklist (Cadastros): vencido = último checklist há mais de 30 dias
export const MESES_CUSTO = 6;
export const FECHADAS = ['concluida', 'cancelada', 'reprovada'];
export const ETAPAS_MANUTENCAO = [
  ['solicitada', 'Solicitada'],
  ['em_orcamento', 'Em cotação'],
  ['em_aprovacao', 'Em aprovação'],
  ['aprovada', 'Aprovada'],
  ['em_execucao', 'Em execução'],
];

export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
export const placaNorm = (p) => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// Mesma chave da tela Rastreadores: placa antiga (AAA0000) e Mercosul (AAA0A00) são o mesmo veículo (4º caractere letra A–J = dígito 0–9).
export function placaChave(p) {
  const x = String(p ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '').slice(0, 7);
  if (x.length !== 7) return x;
  const d = 'ABCDEFGHIJ'.indexOf(x[4]);
  return d >= 0 ? `${x.slice(0, 4)}${d}${x.slice(5)}` : x;
}
const primeiro = (...vals) => vals.find((v) => v !== undefined && v !== null && String(v).trim() !== '');

/* ── Datas (yyyy-mm-dd, fuso de Brasília) ── */
export function hojeISO(agora = new Date()) {
  return agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}
export function addDias(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function diasEntre(a, b) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
}
function inicioMes(ano, mes) {
  const d = new Date(Date.UTC(ano, mes - 1, 1, 12));
  return d.toISOString().slice(0, 10);
}
const fimMes = (iso) => addDias(inicioMes(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) + 1), -1);
export function dataISO(v) {
  const s = String(v ?? '').trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : '';
}

export const PERIODOS = [
  { id: 'mes', rotulo: 'Este mês' },
  { id: 'mes_anterior', rotulo: 'Mês anterior' },
  { id: '30d', rotulo: 'Últimos 30 dias' },
  { id: '90d', rotulo: 'Últimos 90 dias' },
];

// Período escolhido e o período de comparação (mês contra mês até o mesmo dia; janelas móveis contra a janela imediatamente anterior).
export function periodo(id, hoje) {
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const rotulo = (PERIODOS.find((p) => p.id === id) || PERIODOS[0]).rotulo;
  if (id === 'mes_anterior') {
    const ini = inicioMes(ano, mes - 1);
    const antIni = inicioMes(ano, mes - 2);
    return { id, rotulo, ini, fim: fimMes(ini), antIni, antFim: fimMes(antIni) };
  }
  if (id === '30d' || id === '90d') {
    const dias = id === '30d' ? 30 : 90;
    const ini = addDias(hoje, -(dias - 1));
    const antFim = addDias(ini, -1);
    return { id, rotulo, ini, fim: hoje, antIni: addDias(antFim, -(dias - 1)), antFim };
  }
  const ini = inicioMes(ano, mes);
  const antIni = inicioMes(ano, mes - 1);
  const decorridos = diasEntre(ini, hoje);
  const antFim = addDias(antIni, decorridos);
  const ultimo = fimMes(antIni);
  return { id: 'mes', rotulo, ini, fim: hoje, antIni, antFim: antFim > ultimo ? ultimo : antFim };
}

const noIntervalo = (iso, ini, fim) => Boolean(iso) && iso >= ini && iso <= fim;

// Variação em relação ao período anterior: { delta, pct } (pct nulo quando o anterior é zero).
export function variacao(atual, anterior) {
  const delta = (atual || 0) - (anterior || 0);
  return { delta, pct: anterior ? Math.round((delta / anterior) * 100) : null };
}

/* ── Frota ── */
export const temRastreador = (v) => Boolean(v?.possui_rastreador || v?.bfleet_rastreador || v?.rastreador_bfleet);
export const coordenacaoDe = (v) => String(primeiro(v?.patrimonio_coordenacao, v?.coordenacao) ?? '').trim();
export const supervisaoDe = (v) => String(primeiro(v?.patrimonio_supervisao, v?.supervisao) ?? '').trim();

export function opcoesFiltro(veiculos, coordenacao = '') {
  const coords = new Set();
  const sups = new Set();
  for (const v of veiculos || []) {
    const c = coordenacaoDe(v);
    const s = supervisaoDe(v);
    if (c) coords.add(c);
    if (s && (!coordenacao || c === coordenacao)) sups.add(s);
  }
  const ordenar = (set) => [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return { coordenacoes: ordenar(coords), supervisoes: ordenar(sups) };
}

// Veículos dentro do filtro e os identificadores que ligam as outras tabelas a eles (id, placa e nome de condutor).
export function escopo(veiculos, filtro = {}) {
  const coordenacao = filtro.coordenacao || '';
  const supervisao = filtro.supervisao || '';
  const ativo = Boolean(coordenacao || supervisao);
  const lista = (veiculos || []).filter((v) => (!coordenacao || coordenacaoDe(v) === coordenacao) && (!supervisao || supervisaoDe(v) === supervisao));
  const ids = new Set();
  const placas = new Set();
  const nomes = new Set();
  for (const v of lista) {
    if (v.id) ids.add(v.id);
    if (v.placa) placas.add(placaNorm(v.placa));
    for (const n of [v.motorista_atual, v.bfleet_condutor, v.patrimonio_funcionario, v.condutor_patrimonio]) {
      if (norm(n)) nomes.add(norm(n));
    }
  }
  return { ativo, veiculos: lista, ids, placas, nomes };
}
// Sem filtro tudo conta; com filtro só o que pertence a um veículo do escopo.
export function dentro(esc, { id, placa } = {}) {
  if (!esc?.ativo) return true;
  return (id != null && esc.ids.has(id)) || (placa != null && esc.placas.has(placaNorm(placa)));
}

// Controle de instalação (tabela frotas_rastreadores) e removidos da lista de Rastreadores, indexados pela chave canônica da placa.
export function controleRastreio(rastreadores, removidos) {
  return {
    status: new Map((rastreadores || []).map((r) => [placaChave(r.placa), String(r.status || '')])),
    removidos: new Set((removidos || []).map((r) => placaChave(r.placa))),
  };
}

// Mesma regra da tela Rastreadores: veículo ATIVO que não foi removido da lista; "sem rastreador" = sem linha no controle de
// instalação ou com status sem_rastreador. Sem o controle carregado (null), com/sem/leitura ficam nulos em vez de inventar um número.
export function resumoFrota(veiculos, controle = null) {
  let comRastreador = controle ? 0 : null;
  let semRastreador = controle ? 0 : null;
  let manutencao = 0;
  let semLeitura = controle ? 0 : null;
  const outros = {};
  const porCoordenacao = {};
  for (const v of veiculos || []) {
    const st = norm(v.status);
    if (st === 'ATIVO') {
      if (controle) {
        const chave = placaChave(v.placa);
        if (!controle.removidos.has(chave)) {
          const sem = !controle.status.has(chave) || controle.status.get(chave) === 'sem_rastreador';
          if (sem) {
            semRastreador += 1;
          } else {
            comRastreador += 1;
            const dias = v.patrimonio_dias_sem_leitura;
            // Leitura nula = patrimônio nunca lido (pior caso), mesmo critério do dashboard geral; sem patrimônio vinculado não há o que ler.
            if (v.patrimonio_codigo && (dias == null || Number(dias) > LIMITE_GPS_DIAS)) semLeitura += 1;
          }
        }
      }
    } else if (st.includes('MANUT')) {
      manutencao += 1;
    } else {
      const rotulo = String(v.status || '').trim() || 'Sem status';
      outros[rotulo] = (outros[rotulo] || 0) + 1;
    }
    const coord = coordenacaoDe(v);
    if (coord) porCoordenacao[coord] = (porCoordenacao[coord] || 0) + 1;
  }
  const outrosStatus = Object.entries(outros).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
  return {
    total: (veiculos || []).length,
    comRastreador,
    semRastreador,
    manutencao,
    foraOperacao: outrosStatus.reduce((s, [, n]) => s + n, 0),
    outrosStatus,
    semLeitura,
    porCoordenacao: Object.entries(porCoordenacao).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')),
  };
}

/* ── Manutenção ── */
// vencimentos: itens da RPC frotas_preventiva_painel (v, s:[{p,st,ea}]); planosTipo: Map(plano_id → 'servico'|'verificacao').
export function resumoVencimentos(painel, planosTipo, esc) {
  let vencidos = 0;
  let proximos = 0;
  let semSolicitacao = 0;
  const veiculosVencidos = new Set();
  for (const v of painel || []) {
    if (!dentro(esc, { id: v.v, placa: v.placa })) continue;
    for (const s of v.s || []) {
      if (planosTipo.get(s.p) !== 'servico') continue;
      if (s.st === 'vencida') {
        vencidos += 1;
        veiculosVencidos.add(v.v);
        if (!s.ea) semSolicitacao += 1;
      } else if (s.st === 'proxima') {
        proximos += 1;
      }
    }
  }
  return { vencidos, proximos, semSolicitacao, veiculosVencidos: veiculosVencidos.size };
}

export function resumoManutencao({ abertas = [], concluidas = [] } = {}, per, esc) {
  const etapas = Object.fromEntries(ETAPAS_MANUTENCAO.map(([id]) => [id, 0]));
  let urgentes = 0;
  let total = 0;
  for (const m of abertas) {
    if (FECHADAS.includes(m.status) || !dentro(esc, { id: m.veiculo_id })) continue;
    total += 1;
    if (m.status in etapas) etapas[m.status] += 1;
    if (m.prioridade === 'alta' || m.prioridade === 'urgente') urgentes += 1;
  }
  const soma = (ini, fim) => {
    let custo = 0;
    let qtd = 0;
    for (const m of concluidas) {
      if (!noIntervalo(dataISO(m.data_execucao), ini, fim) || !dentro(esc, { id: m.veiculo_id })) continue;
      custo += Number(m.custo || 0);
      qtd += 1;
    }
    return { custo, qtd };
  };
  return { abertas: total, etapas, urgentes, atual: soma(per.ini, per.fim), anterior: soma(per.antIni, per.antFim) };
}

// Custo das manutenções concluídas e pagas pela empresa, mês a mês (do mais antigo ao mês corrente), para o gráfico de evolução.
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export function inicioJanelaCusto(hoje, meses = MESES_CUSTO) {
  return inicioMes(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)) - (meses - 1));
}
export function custoMensal(concluidas, hoje, esc, meses = MESES_CUSTO) {
  const lista = [];
  for (let i = meses - 1; i >= 0; i -= 1) {
    const ini = inicioMes(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)) - i);
    lista.push({ chave: ini.slice(0, 7), rotulo: MESES_ABREV[Number(ini.slice(5, 7)) - 1], custo: 0, qtd: 0 });
  }
  const porChave = new Map(lista.map((m) => [m.chave, m]));
  for (const m of concluidas || []) {
    const mes = porChave.get(dataISO(m.data_execucao).slice(0, 7));
    if (!mes || !dentro(esc, { id: m.veiculo_id })) continue;
    mes.custo += Number(m.custo || 0);
    mes.qtd += 1;
  }
  return lista;
}

/* ── Multas (mesmo critério da tela de Multas) ── */
const isIdentificar = (m) => Boolean(m.identificar_solicitado_em || m.condutor_identificado_em || norm(m.acao_status).includes('IDENTIFIC'));
export function valorMulta(v) {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return 0;
  return Number.isInteger(n) && Math.abs(n) >= 1000 ? n / 100 : n; // a API do GRM às vezes entrega em centavos
}
// Enquanto o condutor não foi indicado vale o prazo de indicação/defesa; depois, o de pagamento.
export function vencimentoMulta(m) {
  const indicacao = dataISO(m.data_limite_defesa);
  const pagamento = dataISO(primeiro(m.data_vencimento_auto, m.data_limite_pagto, m.data_vencimento));
  const indicado = Boolean(String(m.motorista || '').trim()) && !isIdentificar(m);
  return (indicado ? pagamento || indicacao : indicacao || pagamento) || '';
}
function tipoMulta(m, hoje) {
  const st = norm(primeiro(m.status_multa, m.situacao, m.status, 'A PAGAR'));
  if (/\bPAG[AO]\b/.test(st) || st.includes('BAIX') || st.includes('QUIT')) return 'paga';
  if (st.includes('CANCEL')) return 'cancelada';
  if (st.includes('VENC')) return 'vencida';
  const v = vencimentoMulta(m);
  return v && v < hoje ? 'vencida' : 'aberta';
}
export function resumoMultas(multas, hoje, esc) {
  let abertas = 0;
  let semCondutor = 0;
  let prazoCurto = 0;
  let aNotificar = 0;
  let valor = 0;
  const limite = addDias(hoje, AVISO_MULTA_DIAS);
  // Quando vence o que está em aberto: atrasadas e blocos de 7 dias a partir de hoje (o último junta tudo que vem depois).
  const prazos = [['Atrasada', 0], ['Até 7 dias', 0], ['8 a 14', 0], ['15 a 21', 0], ['Depois', 0]].map(([rotulo]) => ({ rotulo, qtd: 0 }));
  for (const m of multas || []) {
    if (m.arquivada_em || m.ok_em || !dentro(esc, { placa: m.placa })) continue;
    const tipo = tipoMulta(m, hoje);
    if (tipo === 'paga' || tipo === 'cancelada') continue;
    const comCondutor = Boolean(String(m.motorista || '').trim());
    // Vencida com condutor já está resolvida no fluxo da tela; sem condutor ainda falta identificar quem dirigia.
    if (tipo === 'vencida' && comCondutor) continue;
    abertas += 1;
    valor += valorMulta(m.valor_original);
    if (!comCondutor) semCondutor += 1;
    else if (norm(m.status_notificacao || 'PENDENTE') === 'PENDENTE') aNotificar += 1;
    const venc = vencimentoMulta(m);
    if (venc && venc >= hoje && venc <= limite) prazoCurto += 1;
    if (venc) prazos[venc < hoje ? 0 : Math.min(4, 1 + Math.floor(Math.max(0, diasEntre(hoje, venc) - 1) / 7))].qtd += 1;
  }
  return { abertas, semCondutor, prazoCurto, aNotificar, notificadas: abertas - semCondutor - aNotificar, valor, prazos };
}

/* ── Conduta: excesso de velocidade e fora do horário ── */
const nomeEvento = (r) => String(primeiro(r.patrimonio_funcionario, r.motorista_planilha) ?? '').trim();
export function resumoEventos(rows, per, esc) {
  let atual = 0;
  let anterior = 0;
  for (const r of rows || []) {
    const d = dataISO(r.data_evento);
    if (!dentro(esc, { placa: r.placa })) continue;
    if (noIntervalo(d, per.ini, per.fim)) atual += 1;
    else if (noIntervalo(d, per.antIni, per.antFim)) anterior += 1;
  }
  return { atual, anterior };
}
export function excessosPendentes(rows, esc) {
  return (rows || []).filter((r) => dentro(esc, { placa: r.placa })).length;
}
// Quem mais aparece no período (condutor; sem nome cai na placa). Só entra quem tem 2 ou mais registros.
export function reincidentes(excessos, foraHorario, per, esc, topo = 5) {
  const mapa = new Map();
  const somar = (rows, campo) => {
    for (const r of rows || []) {
      if (!noIntervalo(dataISO(r.data_evento), per.ini, per.fim) || !dentro(esc, { placa: r.placa })) continue;
      const nome = nomeEvento(r);
      const chave = nome ? norm(nome) : `PLACA:${placaNorm(r.placa)}`;
      const item = mapa.get(chave) || { nome: nome || placaNorm(r.placa), placas: new Set(), excessos: 0, foraHorario: 0, maxVel: 0 };
      item.placas.add(placaNorm(r.placa));
      item[campo] += 1;
      if (campo === 'excessos') item.maxVel = Math.max(item.maxVel, Number(r.velocidade) || 0);
      mapa.set(chave, item);
    }
  };
  somar(excessos, 'excessos');
  somar(foraHorario, 'foraHorario');
  return [...mapa.values()]
    .map((i) => ({ ...i, placas: [...i.placas], total: i.excessos + i.foraHorario }))
    .filter((i) => i.total >= 2)
    .sort((a, b) => b.total - a.total || b.excessos - a.excessos || a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, topo);
}

// Excessos e fora do horário por bloco de 7 dias a partir do início do período (o último bloco pode ser mais curto).
export function ocorrenciasPorSemana(excessos, foraHorario, per, esc) {
  const blocos = [];
  for (let ini = per.ini; ini <= per.fim; ini = addDias(ini, 7)) {
    const fim = addDias(ini, 6) > per.fim ? per.fim : addDias(ini, 6);
    blocos.push({ ini, fim, rotulo: `${ini.slice(8, 10)}/${ini.slice(5, 7)}`, excessos: 0, foraHorario: 0 });
  }
  const somar = (rows, campo) => {
    for (const r of rows || []) {
      const d = dataISO(r.data_evento);
      if (!noIntervalo(d, per.ini, per.fim) || !dentro(esc, { placa: r.placa })) continue;
      const b = blocos[Math.floor(diasEntre(per.ini, d) / 7)];
      if (b) b[campo] += 1;
    }
  };
  somar(excessos, 'excessos');
  somar(foraHorario, 'foraHorario');
  return blocos;
}

/* ── Habilitação (CNH) ── */
export function resumoCnh(motoristas, hoje, esc, aviso = AVISO_CNH_DIAS) {
  const limite = addDias(hoje, aviso);
  const lista = [];
  let vencidas = 0;
  let vencendo = 0;
  let semValidade = 0;
  let emDia = 0;
  for (const m of motoristas || []) {
    if (norm(m.status) !== 'ATIVO') continue;
    // O cadastro de motorista não tem veículo: com filtro, vale quem aparece como condutor de um veículo do escopo.
    if (esc?.ativo && !esc.nomes.has(norm(m.nome))) continue;
    const validade = dataISO(m.cnh_validade);
    if (!validade) { semValidade += 1; continue; }
    if (validade < hoje) vencidas += 1;
    else if (validade <= limite) vencendo += 1;
    else { emDia += 1; continue; }
    lista.push({ nome: m.nome, validade, dias: diasEntre(hoje, validade) });
  }
  lista.sort((a, b) => a.validade.localeCompare(b.validade) || a.nome.localeCompare(b.nome, 'pt-BR'));
  return { vencidas, vencendo, semValidade, emDia, proximos: lista.slice(0, 6) };
}

/* ── Sinistros (mesmas etapas e prazo da tela Sinistros) ── */
export const ETAPAS_SINISTRO = [
  ['preparando', 'Preparando documentos'],
  ['solicitado', 'Solicitado à corretora'],
  ['aberto', 'Aberto na seguradora'],
  ['reparo', 'Em reparo'],
];
export function resumoSinistros(sinistros, per, hoje, esc) {
  const etapas = Object.fromEntries(ETAPAS_SINISTRO.map(([id]) => [id, 0]));
  let andamento = 0;
  let prazoVencido = 0;
  let prazoHoje = 0;
  let feridos = 0;
  let novos = 0;
  let novosAnterior = 0;
  const atencao = [];
  for (const s of sinistros || []) {
    if (!dentro(esc, { id: s.veiculo_id, placa: s.placa })) continue;
    const criado = dataISO(s.created_at);
    if (noIntervalo(criado, per.ini, per.fim)) novos += 1;
    else if (noIntervalo(criado, per.antIni, per.antFim)) novosAnterior += 1;
    if (!(s.etapa in etapas)) continue; // concluído/cancelado saem do andamento
    andamento += 1;
    etapas[s.etapa] += 1;
    if (s.houve_ferido) feridos += 1;
    const prazo = dataISO(s.proxima_acao_em);
    const situacao = !prazo ? null : prazo < hoje ? 'vencido' : prazo === hoje ? 'hoje' : null;
    if (situacao === 'vencido') prazoVencido += 1;
    if (situacao === 'hoje') prazoHoje += 1;
    if (situacao) atencao.push({ numero: s.numero, placa: s.placa, etapa: s.etapa, acao: s.proxima_acao || '', prazo, situacao, dias: diasEntre(prazo, hoje) });
  }
  atencao.sort((a, b) => a.prazo.localeCompare(b.prazo) || Number(a.numero) - Number(b.numero));
  return { andamento, etapas, prazoVencido, prazoHoje, comPrazo: prazoVencido + prazoHoje, feridos, novos, novosAnterior, atencao: atencao.slice(0, 4) };
}

/* ── Checklists (mesma regra da aba Checklist: o mais recente da placa define; vencido = há mais de 30 dias) ── */
export function resumoChecklists(registros, hoje, esc, limite = LIMITE_CHECKLIST_DIAS) {
  const ultimo = new Map(); // placa normalizada → data (ISO) do checklist mais recente
  for (const r of registros || []) {
    if (!dentro(esc, { id: r.veiculo_id, placa: r.placa })) continue;
    const placa = placaNorm(r.placa);
    const data = dataISO(r.data_execucao);
    if (!placa || !data) continue;
    if (!ultimo.has(placa) || data > ultimo.get(placa)) ultimo.set(placa, data);
  }
  let emDia = 0;
  const vencidos = [];
  for (const [placa, data] of ultimo) {
    const dias = Math.max(0, diasEntre(data, hoje));
    if (dias > limite) vencidos.push({ placa, data, dias }); else emDia += 1;
  }
  vencidos.sort((a, b) => a.data.localeCompare(b.data) || a.placa.localeCompare(b.placa));
  // Ativos do escopo que nunca fizeram checklist (informativo: o app é novo e nem todos têm registro).
  const semChecklist = (esc?.veiculos || []).filter((v) => norm(v.status) === 'ATIVO' && !ultimo.has(placaNorm(v.placa))).length;
  return { comChecklist: ultimo.size, emDia, vencidos: vencidos.length, semChecklist, piores: vencidos.slice(0, 5) };
}

/* ── "Precisa de ação" ── */
// Cada item: { id, tom: 'red'|'amber', n, titulo, detalhe, destino }. n = null quando o dado não pôde ser lido.
export function acoes({ multas, excessos, manutencao, vencimentos, cnh, frota, sinistros, checklists } = {}) {
  const itens = [
    { id: 'multas-sem-condutor', tom: 'red', n: multas?.semCondutor ?? null, titulo: 'Multas sem condutor', detalhe: 'Identificar quem dirigia', destino: 'frotas-multas' },
    { id: 'multas-prazo', tom: 'red', n: multas?.prazoCurto ?? null, titulo: `Multas com prazo em ${AVISO_MULTA_DIAS} dias`, detalhe: 'Defesa, indicação ou pagamento', destino: 'frotas-multas' },
    { id: 'planos-vencidos', tom: 'red', n: vencimentos?.semSolicitacao ?? null, titulo: 'Serviços vencidos sem solicitação', detalhe: vencimentos ? `Em ${vencimentos.veiculosVencidos} veículo(s)` : '', destino: 'frotas-manutencao-grupo' },
    { id: 'cnh-vencida', tom: 'red', n: cnh?.vencidas ?? null, titulo: 'CNH vencida', detalhe: 'Motoristas ativos', destino: 'frotas-motoristas' },
    { id: 'sinistros-prazo', tom: 'red', n: sinistros?.comPrazo ?? null, titulo: 'Sinistros com prazo vencido ou hoje', detalhe: 'Próximo passo atrasado ou para hoje', destino: 'frotas-sinistros' },
    { id: 'manut-urgentes', tom: 'amber', n: manutencao?.urgentes ?? null, titulo: 'Manutenção urgente aberta', detalhe: 'Prioridade alta ou urgente', destino: 'frotas-manutencao-grupo' },
    { id: 'multas-notificar', tom: 'amber', n: multas?.aNotificar ?? null, titulo: 'Condutor a notificar (multas)', detalhe: 'Multa com condutor, sem notificação', destino: 'frotas-multas' },
    { id: 'excessos-notificar', tom: 'amber', n: excessos ?? null, titulo: 'Excessos de velocidade a notificar', detalhe: 'Pendentes na Notificação', destino: 'frotas' },
    { id: 'cnh-vencendo', tom: 'amber', n: cnh?.vencendo ?? null, titulo: `CNH vence em ${AVISO_CNH_DIAS} dias`, detalhe: 'Motoristas ativos', destino: 'frotas-motoristas' },
    { id: 'checklist-vencido', tom: 'amber', n: checklists?.vencidos ?? null, titulo: `Checklist vencido (+${LIMITE_CHECKLIST_DIAS} dias)`, detalhe: 'Placas sem checklist recente', destino: 'frotas-cadastros' },
    { id: 'gps-sem-leitura', tom: 'amber', n: frota?.semLeitura ?? null, titulo: `Rastreador sem leitura há +${LIMITE_GPS_DIAS} dias`, detalhe: 'Veículos ativos com rastreador', destino: 'frotas-rastreadores' },
  ];
  const peso = (i) => (i.n == null ? 1 : i.n > 0 ? 0 : 2);
  return itens
    .map((i, ordem) => ({ ...i, ordem }))
    .sort((a, b) => peso(a) - peso(b) || a.ordem - b.ordem)
    .map(({ ordem, ...i }) => i);
}
