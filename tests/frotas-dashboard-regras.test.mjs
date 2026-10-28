import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as R from '../assets/js/modules/frotas-dashboard-regras.js';
import * as H from '../assets/js/modules/frotas-dashboard-html.js';

const HOJE = '2026-10-28';
const veic = (o) => ({ id: o.placa, status: 'ATIVO', ...o });
const todos = R.escopo([], {});

test('períodos: mês contra o mesmo trecho do mês anterior; janelas móveis contra a janela imediatamente anterior', () => {
  assert.deepEqual(R.periodo('mes', HOJE), { id: 'mes', rotulo: 'Este mês', ini: '2026-10-01', fim: HOJE, antIni: '2026-09-01', antFim: '2026-09-28' });
  assert.equal(R.periodo('mes', '2026-03-31').antFim, '2026-02-28', 'mês anterior mais curto: não passa do último dia');
  const ant = R.periodo('mes_anterior', HOJE);
  assert.deepEqual([ant.ini, ant.fim, ant.antIni, ant.antFim], ['2026-09-01', '2026-09-30', '2026-08-01', '2026-08-31']);
  const jan = R.periodo('mes_anterior', '2026-01-15');
  assert.deepEqual([jan.ini, jan.fim, jan.antIni], ['2025-12-01', '2025-12-31', '2025-11-01']);
  const d30 = R.periodo('30d', HOJE);
  assert.deepEqual([d30.ini, d30.fim, d30.antIni, d30.antFim], ['2026-09-29', HOJE, '2026-08-30', '2026-09-28']);
});

test('frota: mesma regra da tela Rastreadores — ativo fora dos removidos; sem rastreador = sem linha no controle ou status sem_rastreador', () => {
  const controle = R.controleRastreio(
    [{ placa: 'AAA0000', status: 'concluido' }, { placa: 'BBB1111', status: 'sem_rastreador' }, { placa: 'CCC2222', status: 'em_andamento' }, { placa: 'EEE4444', status: 'concluido' }],
    [{ placa: 'EEE4444' }],
  );
  const r = R.resumoFrota([
    veic({ placa: 'AAA0A00', patrimonio_coordenacao: 'GOIAS', rastreador_bfleet: false }), // Mercosul = AAA0000: instalado, mesmo sem marca da BFleet
    veic({ placa: 'BBB1111', patrimonio_coordenacao: 'GOIAS', rastreador_bfleet: true }), // marca da BFleet não salva quem está sem_rastreador
    veic({ placa: 'CCC2222', coordenacao: 'BAHIA' }),
    veic({ placa: 'DDD3333' }), // sem linha no controle
    veic({ placa: 'EEE4444' }), // removido da lista de Rastreadores: não conta
    veic({ placa: 'MMM', status: 'EM MANUTENÇÃO' }),
    veic({ placa: 'V1', status: 'Vendido' }),
    veic({ placa: 'V2', status: 'Vendido' }),
    veic({ placa: 'I1', status: 'Inativo' }),
    veic({ placa: 'S1', status: '' }),
  ], controle);
  assert.deepEqual([r.total, r.comRastreador, r.semRastreador, r.manutencao, r.foraOperacao], [10, 2, 2, 1, 4]);
  assert.deepEqual(r.outrosStatus, [['Vendido', 2], ['Inativo', 1], ['Sem status', 1]]);
  assert.deepEqual(r.porCoordenacao, [['GOIAS', 2], ['BAHIA', 1]]);
  assert.equal(R.placaChave('abc-1d23'), 'ABC1323', 'Mercosul vira o formato antigo (D = 3)');
});

test('frota sem o controle de rastreadores carregado: com/sem/leitura ficam nulos (não inventa número pela marca da BFleet)', () => {
  const r = R.resumoFrota([veic({ placa: 'A', rastreador_bfleet: true })], null);
  assert.deepEqual([r.comRastreador, r.semRastreador, r.semLeitura, r.total], [null, null, null, 1]);
});

test('rastreador sem leitura: só entre os com rastreador e com patrimônio; leitura nula conta como atrasada', () => {
  const controle = R.controleRastreio(['A', 'B', 'C', 'D'].map((p) => ({ placa: `${p}${p}${p}0000`, status: 'concluido' })), []);
  const r = R.resumoFrota([
    veic({ placa: 'AAA0000', patrimonio_codigo: '1', patrimonio_dias_sem_leitura: 8 }),
    veic({ placa: 'BBB0000', patrimonio_codigo: '2', patrimonio_dias_sem_leitura: null }),
    veic({ placa: 'CCC0000', patrimonio_codigo: '3', patrimonio_dias_sem_leitura: 7 }),
    veic({ placa: 'DDD0000', patrimonio_dias_sem_leitura: 30 }), // sem patrimônio vinculado
    veic({ placa: 'EEE0000', patrimonio_codigo: '5', patrimonio_dias_sem_leitura: 30 }), // sem rastreador
  ], controle);
  assert.equal(r.semLeitura, 2);
});

test('filtro: coordenação/supervisão do Patrimônios com fallback no cadastro; só entra o que pertence a um veículo do escopo', () => {
  const lista = [
    veic({ placa: 'AAA-1A11', patrimonio_coordenacao: 'GOIAS', patrimonio_supervisao: 'S1', motorista_atual: 'João Silva' }),
    veic({ placa: 'BBB2B22', coordenacao: 'BAHIA', supervisao: 'S2' }),
  ];
  assert.deepEqual(R.opcoesFiltro(lista, 'GOIAS'), { coordenacoes: ['BAHIA', 'GOIAS'], supervisoes: ['S1'] });
  assert.equal(R.dentro(R.escopo(lista, {}), { placa: 'QUALQUER' }), true);
  const go = R.escopo(lista, { coordenacao: 'GOIAS' });
  assert.equal(R.dentro(go, { placa: 'aaa1a11' }), true, 'placa normaliza hífen e caixa');
  assert.equal(R.dentro(go, { placa: 'BBB2B22' }), false);
  assert.equal(R.dentro(go, { id: 'BBB2B22' }), false);
  assert.ok(go.nomes.has('JOAO SILVA'));
});

test('multas: arquivada, paga, cancelada e vencida com condutor ficam fora; sem condutor conta mesmo vencida', () => {
  const base = { motorista: 'Fulano', status_multa: 'A PAGAR', valor_original: 195.23, status_notificacao: 'PENDENTE', data_limite_defesa: '2026-12-01' };
  const r = R.resumoMultas([
    { ...base, placa: 'A' },
    { ...base, placa: 'B', motorista: '', data_limite_defesa: '2026-10-30' },
    { ...base, placa: 'C', arquivada_em: '2026-10-01T00:00:00Z' },
    { ...base, placa: 'D', status_multa: 'PAGA' },
    { ...base, placa: 'E', status_multa: 'Cancelada' },
    { ...base, placa: 'F', status_multa: 'VENCIDA' },
    { ...base, placa: 'G', status_multa: 'VENCIDA', motorista: '' },
    { ...base, placa: 'H', status_notificacao: 'NOTIFICADO', valor_original: 29523 }, // centavos
  ], HOJE, todos);
  assert.equal(r.abertas, 4); // A, B, G, H
  assert.equal(r.semCondutor, 2); // B, G
  assert.equal(r.prazoCurto, 1); // B vence em 2 dias
  assert.equal(r.aNotificar, 1); // só A: H já notificada
  assert.equal(Math.round(r.valor * 100), Math.round((195.23 * 3 + 295.23) * 100));
});

test('multas: prazo muda depois que o condutor é indicado (pagamento em vez de defesa)', () => {
  const m = { motorista: 'Fulano', data_limite_defesa: '2026-10-20', data_vencimento_auto: '2026-12-10' };
  assert.equal(R.vencimentoMulta(m), '2026-12-10');
  assert.equal(R.vencimentoMulta({ ...m, acao_status: 'Identificar condutor' }), '2026-10-20');
  assert.equal(R.vencimentoMulta({ ...m, motorista: '' }), '2026-10-20');
});

test('manutenção: etapas em aberto, urgentes e custo do período contra o anterior (só com veículo do escopo)', () => {
  const per = R.periodo('mes', HOJE);
  const r = R.resumoManutencao({
    abertas: [
      { veiculo_id: 'v1', status: 'solicitada', prioridade: 'urgente' },
      { veiculo_id: 'v1', status: 'em_execucao', prioridade: 'normal' },
      { veiculo_id: 'v2', status: 'em_orcamento', prioridade: 'alta' },
      { veiculo_id: 'v1', status: 'concluida' },
    ],
    concluidas: [
      { veiculo_id: 'v1', custo: 100, data_execucao: '2026-10-05' },
      { veiculo_id: 'v1', custo: '50.5', data_execucao: '2026-09-10' },
      { veiculo_id: 'v2', custo: 999, data_execucao: '2026-10-06' },
    ],
  }, per, R.escopo([{ id: 'v1', placa: 'A', coordenacao: 'X' }, { id: 'v2', placa: 'B', coordenacao: 'Y' }], { coordenacao: 'X' }));
  assert.equal(r.abertas, 2);
  assert.equal(r.etapas.solicitada, 1);
  assert.equal(r.etapas.em_execucao, 1);
  assert.equal(r.urgentes, 1);
  assert.deepEqual(r.atual, { custo: 100, qtd: 1 });
  assert.deepEqual(r.anterior, { custo: 50.5, qtd: 1 });
  assert.deepEqual(R.variacao(100, 50), { delta: 50, pct: 100 });
  assert.equal(R.variacao(5, 0).pct, null);
});

test('vencimentos: conta só serviços (não verificações) e separa os que já têm solicitação em andamento', () => {
  const tipos = new Map([['p1', 'servico'], ['p2', 'servico'], ['p3', 'verificacao']]);
  const painel = [
    { v: 'v1', placa: 'A', s: [{ p: 'p1', st: 'vencida' }, { p: 'p2', st: 'vencida', ea: true }, { p: 'p3', st: 'vencida' }] },
    { v: 'v2', placa: 'B', s: [{ p: 'p1', st: 'proxima' }, { p: 'p2', st: 'em_dia' }] },
  ];
  assert.deepEqual(R.resumoVencimentos(painel, tipos, todos), { vencidos: 2, proximos: 1, semSolicitacao: 1, veiculosVencidos: 1 });
});

test('eventos e reincidentes: período contra o anterior; reincidente = 2+ registros por condutor (ou placa)', () => {
  const per = R.periodo('mes', HOJE);
  const exc = [
    { placa: 'A', data_evento: '2026-10-02', velocidade: 110, patrimonio_funcionario: 'João' },
    { placa: 'A', data_evento: '2026-10-03', velocidade: 130, motorista_planilha: 'JOÃO' },
    { placa: 'B', data_evento: '2026-10-04', velocidade: 99, motorista_planilha: 'Maria' },
    { placa: 'A', data_evento: '2026-09-05', velocidade: 100, patrimonio_funcionario: 'João' },
  ];
  const fora = [{ placa: 'C', data_evento: '2026-10-10' }, { placa: 'C', data_evento: '2026-10-11' }, { placa: 'A', data_evento: '2026-10-12', patrimonio_funcionario: 'João' }];
  assert.deepEqual(R.resumoEventos(exc, per, todos), { atual: 3, anterior: 1 });
  const r = R.reincidentes(exc, fora, per, todos);
  assert.equal(r.length, 2);
  assert.deepEqual([r[0].nome, r[0].total, r[0].excessos, r[0].foraHorario, r[0].maxVel], ['João', 3, 2, 1, 130]);
  assert.deepEqual([r[1].nome, r[1].total], ['C', 2]);
});

test('CNH: vencida, vencendo em 30 dias e sem validade (só motoristas ativos); com filtro vale o condutor do veículo', () => {
  const motoristas = [
    { nome: 'A', status: 'ATIVO', cnh_validade: '2026-10-01' },
    { nome: 'B', status: 'ATIVO', cnh_validade: '2026-11-20' },
    { nome: 'C', status: 'ATIVO', cnh_validade: '2027-05-01' },
    { nome: 'D', status: 'ATIVO', cnh_validade: null },
    { nome: 'E', status: 'INATIVO', cnh_validade: '2020-01-01' },
  ];
  const r = R.resumoCnh(motoristas, HOJE, todos);
  assert.deepEqual([r.vencidas, r.vencendo, r.semValidade], [1, 1, 1]);
  assert.deepEqual(r.proximos.map((p) => [p.nome, p.dias]), [['A', -27], ['B', 23]]);
  const filtrado = R.resumoCnh(motoristas, HOJE, R.escopo([veic({ placa: 'X', coordenacao: 'Z', bfleet_condutor: 'b' })], { coordenacao: 'Z' }));
  assert.deepEqual([filtrado.vencidas, filtrado.vencendo], [0, 1]);
});

test('precisa de ação: o que tem pendência vem primeiro (vermelho antes de âmbar), dado indisponível depois e o que está em dia por último', () => {
  const itens = R.acoes({
    multas: { semCondutor: 0, prazoCurto: 2, aNotificar: 5 },
    excessos: 0,
    manutencao: { urgentes: 1 },
    vencimentos: { semSolicitacao: 3, veiculosVencidos: 2 },
    cnh: null,
    frota: { semLeitura: 0 },
  });
  assert.deepEqual(itens.slice(0, 4).map((i) => i.id), ['multas-prazo', 'planos-vencidos', 'manut-urgentes', 'multas-notificar']);
  assert.deepEqual(itens.slice(0, 4).map((i) => i.tom), ['red', 'red', 'amber', 'amber']);
  const resto = itens.slice(4);
  assert.deepEqual(resto.filter((i) => i.n == null).map((i) => i.id), ['cnh-vencida', 'cnh-vencendo']);
  assert.ok(resto.findIndex((i) => i.n == null) < resto.findIndex((i) => i.n === 0), 'indisponível antes de em dia');
});

test('html: texto vindo do banco é escapado e os links seguem o /painel/ da produção', () => {
  const html = H.blocoConduta({
    excessos: { atual: 1, anterior: 0, variacao: R.variacao(1, 0) }, foraHorario: { atual: 0, anterior: 0, variacao: R.variacao(0, 0) },
    pendentes: 2, estado: 'ok', estadoPendentes: 'ok', periodo: R.periodo('mes', HOJE),
    reinc: [{ nome: '<img src=x onerror=alert(1)>', placas: ['A"B'], excessos: 2, foraHorario: 0, maxVel: 120, total: 2 }],
  });
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
  assert.equal(H.panelUrl('frotas-multas', { hostname: 'grao1000.com.br', pathname: '/painel/frotas-dashboard' }), '/painel/frotas-multas');
  assert.equal(H.panelUrl('frotas-multas', { hostname: 'localhost', pathname: '/frotas-dashboard.html' }), './frotas-multas');
});

test('versão (?v=) igual em todos os imports internos do dashboard, no HTML e no menuConfig', () => {
  const ler = (c) => readFileSync(new URL(`../${c}`, import.meta.url), 'utf8');
  const tokens = new Set();
  for (const f of ['assets/js/frotas-dashboard.js', 'assets/js/modules/frotas-dashboard-dados.js', 'assets/js/modules/frotas-dashboard-html.js']) {
    for (const m of ler(f).matchAll(/from '(?:\.\/|\.\/modules\/)frotas-dashboard-[a-z]+\.js\?v=([^']+)'/g)) tokens.add(m[1]);
  }
  assert.equal(tokens.size, 1, `tokens diferentes: ${[...tokens]}`);
  const [token] = tokens;
  assert.match(ler('frotas-dashboard.html'), new RegExp(`frotas-dashboard\\.css\\?v=${token}`));
  assert.match(ler('frotas-dashboard.html'), new RegExp(`frotas-dashboard\\.js\\?v=${token}`));
  assert.match(ler('assets/js/menuConfig.js'), new RegExp(`frotas-dashboard\\.css\\?v=${token}`));
  assert.doesNotMatch(ler('assets/js/frotas-dashboard.js'), /<style|CSS = `/, 'o CSS do dashboard fica só no arquivo .css');
});
