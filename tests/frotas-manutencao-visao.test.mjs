import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  COLUNAS, listaPorAtencao, contarSaude, custoDoMes, desdeDaEtapa, diasEntre, diasNaEtapa, entregaAtrasada, eventosDaAgenda, gradeDoMes, listarParados, listarVeiculos,
  montarAlertas, montarProntuario, montarQuadro, naOficina, resumoPreventiva, saudeDoResumo, semPrevisao, somarDias, veiculosDaManutencao, veiculosPorId,
} from '../assets/js/modules/frotas-manutencao-visao-regras.js';

const HOJE = '2026-10-20';
const veiculos = [
  { id: 'v1', placa: 'ABC1D23', marca_modelo: 'Fiat Strada', coordenacao: 'MT', supervisao: 'SORRISO', status: 'ATIVO', motorista_atual: 'Ana', renavam: '111' },
  { id: 'v2', placa: 'RMS1E45', marca_modelo: 'VW Saveiro', coordenacao: 'GO', supervisao: 'RIO VERDE', status: 'ATIVO', motorista_atual: 'Beto', renavam: '222' },
  { id: 'v3', placa: 'XYZ9A87', marca_modelo: 'Fiat Toro', coordenacao: 'MT', supervisao: 'SORRISO', status: 'MANUTENCAO', renavam: '333' },
  { id: 'v4', placa: 'OLD0A00', marca_modelo: 'Fiat Uno', coordenacao: 'MT', supervisao: 'SORRISO', status: 'VENDIDO', renavam: '444' },
];
const mapa = veiculosPorId(veiculos);

const linha = (extra) => ({ id: 'm1', numero: 1, veiculo_id: 'v1', status: 'solicitada', descricao: 'Barulho ao frear', prioridade: 'normal', solicitado_em: '2026-10-15T12:00:00Z', linha_tempo: [], ...extra });
const tempo = (...passos) => passos.map(([para, em]) => ({ para, em }));

test('data de hoje e diferenças de dias seguem o dia civil', () => {
  assert.equal(diasEntre('2026-10-15', '2026-10-20'), 5);
  assert.equal(diasEntre('2026-10-20', '2026-10-15'), -5);
  assert.equal(diasEntre('2026-10-31', '2026-11-01'), 1);
  assert.equal(diasEntre('', '2026-10-01'), null);
  assert.equal(somarDias('2026-10-20', -365), '2025-10-20');
});

test('desde quando está na etapa: último registro da linha do tempo, com reserva nos carimbos', () => {
  const m = linha({ status: 'em_orcamento', linha_tempo: tempo(['solicitada', '2026-10-10T10:00:00Z'], ['em_orcamento', '2026-10-12T10:00:00Z']) });
  assert.equal(desdeDaEtapa(m), '2026-10-12T10:00:00Z');
  // devolvida para orçamento depois de ir à aprovação: vale a última entrada
  const volta = linha({ status: 'em_orcamento', linha_tempo: tempo(['em_orcamento', '2026-10-12T10:00:00Z'], ['em_aprovacao', '2026-10-13T10:00:00Z'], ['em_orcamento', '2026-10-16T10:00:00Z']) });
  assert.equal(desdeDaEtapa(volta), '2026-10-16T10:00:00Z');
  assert.equal(desdeDaEtapa(linha({ status: 'em_execucao', linha_tempo: [], entrada_oficina_em: '2026-10-17T09:00:00Z' })), '2026-10-17T09:00:00Z');
  assert.equal(diasNaEtapa(m, HOJE), 8);
});

test('quadro: reprovada fica em orçamento, ordem por prioridade e depois por tempo parado', () => {
  const lista = [
    linha({ id: 'a', numero: 1, status: 'solicitada', linha_tempo: tempo(['solicitada', '2026-10-19T10:00:00Z']) }),
    linha({ id: 'b', numero: 2, status: 'reprovada', linha_tempo: tempo(['reprovada', '2026-10-10T10:00:00Z']) }),
    linha({ id: 'c', numero: 3, status: 'em_orcamento', prioridade: 'urgente', linha_tempo: tempo(['em_orcamento', '2026-10-18T10:00:00Z']) }),
    linha({ id: 'd', numero: 4, status: 'em_orcamento', linha_tempo: tempo(['em_orcamento', '2026-10-05T10:00:00Z']) }),
    linha({ id: 'e', numero: 5, status: 'concluida' }),
    linha({ id: 'f', numero: 6, status: 'cancelada' }),
  ];
  const q = montarQuadro(lista, mapa, {}, HOJE);
  assert.equal(q.total, 4, 'concluída e cancelada ficam fora');
  assert.deepEqual(q.colunas.map((c) => c.id), COLUNAS.map((c) => c.id));
  const orc = q.colunas.find((c) => c.id === 'em_orcamento');
  assert.deepEqual(orc.itens.map((i) => i.id), ['c', 'd', 'b'], 'urgente primeiro, depois o que espera há mais tempo');
  assert.equal(orc.atrasadas, 2, 'só d (15 dias) e b (10 dias) passaram dos 3 dias da etapa; c entrou há 2');
  assert.equal(q.colunas.find((c) => c.id === 'solicitada').atrasadas, 0);
});

test('quadro: filtros por coordenação, natureza, parados e busca', () => {
  const lista = [
    linha({ id: 'a', veiculo_id: 'v1', natureza: 'corretiva' }),
    linha({ id: 'b', numero: 2, veiculo_id: 'v2', natureza: 'preventiva', descricao: 'Revisão 20.000 km' }),
    linha({ id: 'c', numero: 3, veiculo_id: 'v1', status: 'em_execucao', veiculo_parado: true, entrada_oficina_em: '2026-10-18T10:00:00Z' }),
  ];
  const ids = (f) => montarQuadro(lista, mapa, f, HOJE).colunas.flatMap((c) => c.itens.map((i) => i.id)).sort();
  assert.deepEqual(ids({ coordenacao: 'GO' }), ['b']);
  assert.deepEqual(ids({ supervisao: 'SORRISO' }), ['a', 'c']);
  assert.deepEqual(ids({ natureza: 'preventiva' }), ['b']);
  assert.deepEqual(ids({ so_parados: true }), ['c']);
  assert.deepEqual(ids({ busca: 'revisao 20' }), ['b'], 'busca sem acento');
  assert.deepEqual(ids({ busca: 'rms1e45' }), ['b']);
});

test('parados, entrega atrasada e alertas em ordem de gravidade', () => {
  const lista = [
    linha({ id: 'p1', numero: 1, veiculo_id: 'v1', status: 'em_execucao', veiculo_parado: true, entrada_oficina_em: '2026-10-10T10:00:00Z', previsao_entrega: '2026-10-18', oficina: 'Auto Center' }),
    linha({ id: 'p2', numero: 2, veiculo_id: 'v2', status: 'em_execucao', veiculo_parado: true, entrada_oficina_em: '2026-10-19T10:00:00Z' }),
    linha({ id: 'p3', numero: 3, veiculo_id: 'v3', status: 'em_aprovacao', linha_tempo: tempo(['em_aprovacao', '2026-10-10T10:00:00Z']) }),
    linha({ id: 'p4', numero: 4, veiculo_id: 'v3', status: 'solicitada', prioridade: 'urgente', linha_tempo: tempo(['solicitada', '2026-10-20T08:00:00Z']) }),
  ];
  const parados = listarParados(lista, mapa, HOJE);
  assert.deepEqual(parados.map((p) => p.id), ['p1', 'p2'], 'o mais antigo primeiro');
  assert.equal(parados[0].diasParado, 10);
  assert.equal(parados[0].diasParaEntrega, -2);
  assert.equal(entregaAtrasada(lista[0], HOJE), true);
  assert.equal(entregaAtrasada(lista[1], HOJE), false);
  const al = montarAlertas(lista, mapa, HOJE);
  assert.deepEqual(al.map((a) => a.tipo), ['entrega', 'sem_previsao', 'etapa', 'urgente']);
  assert.match(al[0].titulo, /ABC1D23/);
  assert.match(al[0].detalhe, /2 dia/);
});

test('saúde da preventiva por veículo: o pior estado manda', () => {
  assert.equal(saudeDoResumo({ vencida: 1, proxima: 2, em_dia: 5 }), 'vencida');
  assert.equal(saudeDoResumo({ vencida: 0, proxima: 1, em_dia: 5 }), 'proxima');
  assert.equal(saudeDoResumo({ em_dia: 3, sem_historico: 4 }), 'em_dia');
  assert.equal(saudeDoResumo({ sem_historico: 4 }), 'sem_historico');
  const l = (veiculo_id, status) => ({ veiculo_id, placa: veiculo_id, plano_id: `${veiculo_id}${status}`, tipo: 'servico', status, hodometro: 1000, categoria_codigo: 2, plano_nome: 'x' });
  const por = resumoPreventiva([l('v1', 'vencida'), l('v1', 'em_dia'), l('v2', 'em_dia'), l('v3', 'sem_historico')]);
  assert.deepEqual(contarSaude(por), { vencida: 1, proxima: 0, em_dia: 1, sem_historico: 1 });
  assert.deepEqual(contarSaude(por, new Set(['v1', 'v2'])), { vencida: 1, proxima: 0, em_dia: 1, sem_historico: 0 });
});

test('custo do mês: só concluídas pagas pela empresa com custo, no mês da execução', () => {
  const c = (extra) => linha({ status: 'concluida', responsavel_pagamento: 'empresa', custo: 100, data_execucao: '2026-10-05', ...extra });
  const r = custoDoMes([c({}), c({ id: 'x', custo: 250.5 }), c({ id: 'y', responsavel_pagamento: 'locadora' }), c({ id: 'z', data_execucao: '2026-09-30' }), c({ id: 'w', custo: 0 }), linha({ status: 'em_execucao', custo: 999 })], '2026-10');
  assert.deepEqual(r, { total: 350.5, qtd: 2 });
});

test('calendário do mês: semanas de segunda a domingo', () => {
  const sem = gradeDoMes(2026, 10); // 01/10/2026 é quinta-feira
  assert.ok(sem.every((s) => s.length === 7));
  assert.equal(sem[0][0].iso, '2026-09-28');
  assert.equal(sem[0][3].iso, '2026-10-01');
  assert.equal(sem[0][0].doMes, false);
  assert.equal(sem.at(-1)[6].iso, '2026-11-01');
  assert.equal(sem.flat().filter((d) => d.doMes).length, 31);
});

test('agenda: entrada, entrega prevista/atrasada, concluída e vencimentos da preventiva', () => {
  const lista = [
    linha({ id: 'a', status: 'em_execucao', entrada_oficina_em: '2026-10-18T13:00:00Z', previsao_entrega: '2026-10-22', veiculo_parado: true }),
    linha({ id: 'b', numero: 2, veiculo_id: 'v2', status: 'em_execucao', entrada_oficina_em: '2026-10-10T13:00:00Z', previsao_entrega: '2026-10-15' }),
    linha({ id: 'c', numero: 3, veiculo_id: 'v2', status: 'concluida', data_execucao: '2026-10-12' }),
    linha({ id: 'd', numero: 4, status: 'cancelada', entrada_oficina_em: '2026-10-11T13:00:00Z' }),
  ];
  const prev = [
    { veiculo_id: 'v1', placa: 'ABC1D23', tipo: 'servico', status: 'proxima', vencimento_data: '2026-10-25', plano_nome: 'Troca de óleo', em_andamento: false },
    { veiculo_id: 'v1', placa: 'ABC1D23', tipo: 'verificacao', status: 'proxima', vencimento_data: '2026-10-25', plano_nome: 'Calibragem', em_andamento: false },
    { veiculo_id: 'v2', placa: 'RMS1E45', tipo: 'servico', status: 'vencida', vencimento_data: '2026-10-26', plano_nome: 'Freios', em_andamento: true },
    { veiculo_id: 'v2', placa: 'RMS1E45', tipo: 'servico', status: 'sem_historico', vencimento_data: null, plano_nome: 'Correia', em_andamento: false },
  ];
  const ev = eventosDaAgenda(lista, mapa, prev, { inicio: '2026-10-01', fim: '2026-10-31', hoje: HOJE });
  const tipos = (dia) => (ev.get(dia) || []).map((e) => e.tipo);
  assert.deepEqual(tipos('2026-10-18'), ['entrada']);
  assert.deepEqual(tipos('2026-10-22'), ['entrega']);
  assert.deepEqual(tipos('2026-10-15'), ['atraso']);
  assert.deepEqual(tipos('2026-10-10'), ['entrada']);
  assert.deepEqual(tipos('2026-10-12'), ['concluida']);
  assert.deepEqual(tipos('2026-10-11'), [], 'cancelada não gera entrada');
  assert.deepEqual(tipos('2026-10-25'), ['vence'], 'só o serviço, não a verificação');
  assert.deepEqual(tipos('2026-10-26'), [], 'preventiva já em andamento não aparece');
  const semPrev = eventosDaAgenda([], mapa, prev, { inicio: '2026-10-01', fim: '2026-10-31', hoje: HOJE, incluirPreventivas: false });
  assert.equal(semPrev.size, 0);
  assert.deepEqual(semPrevisao(lista.slice(0, 2).map((m) => ({ ...m })), mapa, HOJE), []);
  assert.deepEqual(semPrevisao([linha({ id: 's', status: 'em_execucao' })], mapa, HOJE).map((c) => c.id), ['s']);
  assert.deepEqual(naOficina(lista, mapa, HOJE).map((c) => c.id), ['b', 'a'], 'previsão mais próxima primeiro');
});

test('veículos: só ativos e em manutenção, um cadastro por RENAVAM', () => {
  const dup = [...veiculos, { id: 'v5', placa: 'ABC1D2A', marca_modelo: '', status: 'ATIVO', renavam: '111' }];
  assert.deepEqual(veiculosDaManutencao(dup).map((v) => v.id), ['v1', 'v2', 'v3']);
});

test('lista de veículos: o pior estado primeiro, filtros e contagens', () => {
  const man = [
    linha({ id: 'a', veiculo_id: 'v2', status: 'em_execucao', veiculo_parado: true, entrada_oficina_em: '2026-10-18T10:00:00Z' }),
    linha({ id: 'b', numero: 2, veiculo_id: 'v3', status: 'solicitada' }),
    linha({ id: 'c', numero: 3, veiculo_id: 'v1', status: 'concluida', responsavel_pagamento: 'empresa', custo: 300, data_execucao: '2026-09-01' }),
  ];
  const l = (veiculo_id, status) => ({ veiculo_id, placa: veiculo_id, plano_id: `${veiculo_id}${status}`, tipo: 'servico', status, hodometro: 1000, categoria_codigo: 2, plano_nome: 'x' });
  const prev = resumoPreventiva([l('v1', 'vencida'), l('v2', 'em_dia')]);
  const r = listarVeiculos(veiculosDaManutencao(veiculos), man, prev, [{ veiculo_id: 'v3' }]);
  assert.deepEqual(r.lista.map((x) => x.veiculo.id), ['v2', 'v3', 'v1'], 'parado, depois com manutenção aberta, depois preventiva vencida');
  assert.deepEqual(r.contagem, { parado: 1, andamento: 2, vencida: 1, proxima: 0, documentos: 1, todos: 3 });
  assert.equal(r.lista.find((x) => x.veiculo.id === 'v1').custo12m, 300);
  assert.deepEqual(listarVeiculos(veiculosDaManutencao(veiculos), man, prev, [], { filtro: 'parado' }).lista.map((x) => x.veiculo.id), ['v2']);
  assert.deepEqual(listarVeiculos(veiculosDaManutencao(veiculos), man, prev, [], { coordenacao: 'GO' }).lista.map((x) => x.veiculo.id), ['v2']);
  assert.deepEqual(listarVeiculos(veiculosDaManutencao(veiculos), man, prev, [], { busca: 'toro' }).lista.map((x) => x.veiculo.id), ['v3']);
});

test('prontuário: abertas, histórico do mais recente ao mais antigo, custo e KPIs do último ano', () => {
  const man = [
    linha({ id: 'a', veiculo_id: 'v1', status: 'em_execucao', veiculo_parado: true }),
    linha({ id: 'h1', numero: 2, veiculo_id: 'v1', status: 'concluida', natureza: 'corretiva', responsavel_pagamento: 'empresa', custo: 400, data_execucao: '2026-08-10' }),
    linha({ id: 'h2', numero: 3, veiculo_id: 'v1', status: 'concluida', natureza: 'preventiva', responsavel_pagamento: 'empresa', custo: 150, data_execucao: '2026-09-20' }),
    linha({ id: 'h3', numero: 4, veiculo_id: 'v1', status: 'concluida', natureza: 'corretiva', responsavel_pagamento: 'locadora', custo: 900, data_execucao: '2026-07-01' }),
    linha({ id: 'h4', numero: 5, veiculo_id: 'v1', status: 'concluida', natureza: 'corretiva', responsavel_pagamento: 'empresa', custo: 700, data_execucao: '2025-01-01' }),
    linha({ id: 'h5', numero: 6, veiculo_id: 'v1', status: 'cancelada', solicitado_em: '2026-06-01T10:00:00Z' }),
    linha({ id: 'o', numero: 7, veiculo_id: 'v2', status: 'solicitada' }),
  ];
  const l = (status, extra = {}) => ({ veiculo_id: 'v1', placa: 'ABC1D23', plano_id: status + (extra.plano_id || ''), tipo: 'servico', status, hodometro: 1000, categoria_codigo: 2, plano_nome: 'x', ...extra });
  const prev = resumoPreventiva([l('vencida'), l('proxima', { plano_id: 'b' }), l('em_dia', { plano_id: 'c' }), l('sem_historico', { plano_id: 'd' })]).get('v1');
  const p = montarProntuario(veiculos[0], man, prev, [{ veiculo_id: 'v1' }, { veiculo_id: 'v2' }], HOJE);
  assert.deepEqual(p.abertas.map((m) => m.id), ['a']);
  assert.equal(p.parada.id, 'a');
  assert.deepEqual(p.historico.map((m) => m.id), ['h2', 'h1', 'h3', 'h5', 'h4'], 'mais recente primeiro; h5 pela data da solicitação');
  assert.deepEqual(p.kpis, { qtdAno: 3, corretivas: 2, preventivas: 1, custoAno: 550, ultima: '2026-09-20' });
  assert.equal(p.servicosAtencao.length, 2);
  assert.equal(p.servicosEmDia, 1);
  assert.equal(p.servicosSemHistorico, 1);
  assert.equal(p.docs.length, 1);
});

test('as abas novas existem no hub, usam o mesmo ?v= e não prendem ouvintes no corpo reaproveitado da aba', () => {
  const hub = readFileSync(new URL('../assets/js/frotas-manutencao-grupo.js', import.meta.url), 'utf8');
  for (const id of ['painel', 'veiculos', 'agenda']) assert.match(hub, new RegExp(`id: '${id}'`));
  assert.ok(hub.indexOf("id: 'painel'") < hub.indexOf("id: 'manutencao'"), 'o Painel abre primeiro');
  for (const f of ['painel', 'agenda']) {
    const src = readFileSync(new URL(`../assets/js/modules/frotas-manutencao-${f}.js`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /container\.addEventListener/, `${f}: ouvintes no container se acumulariam a cada troca de aba`);
  }
});

test('lista do painel: atrasados primeiro, depois prioridade e tempo; etapa restringe', () => {
  const lista = [
    linha({ id: 'a', numero: 1, status: 'solicitada', linha_tempo: tempo(['solicitada', '2026-10-20T08:00:00Z']) }),
    linha({ id: 'b', numero: 2, status: 'em_orcamento', linha_tempo: tempo(['em_orcamento', '2026-10-05T10:00:00Z']) }),
    linha({ id: 'c', numero: 3, status: 'em_orcamento', prioridade: 'urgente', linha_tempo: tempo(['em_orcamento', '2026-10-19T10:00:00Z']) }),
    linha({ id: 'd', numero: 4, status: 'em_execucao', previsao_entrega: '2026-10-10', entrada_oficina_em: '2026-10-09T10:00:00Z', linha_tempo: tempo(['em_execucao', '2026-10-09T10:00:00Z']) }),
  ];
  const q = montarQuadro(lista, mapa, {}, HOJE);
  assert.deepEqual(listaPorAtencao(q).map((c) => c.id), ['d', 'b', 'c', 'a'], 'entrega atrasada, etapa atrasada, urgente, resto');
  assert.deepEqual(listaPorAtencao(q, 'em_orcamento').map((c) => c.id), ['b', 'c']);
});
