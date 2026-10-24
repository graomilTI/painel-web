import test from 'node:test';
import assert from 'node:assert/strict';
import { V3_LABELS, V3_VISUAL, caminhoComprovante, contarPorStatus, elegiveisJuntos, filtrarFila, quartosDaReservaManual, rateioExcedeTotal, sugerirComposicao } from '../assets/js/modules/hospedagem/service.js';

// Regras da fila v3 da Hospedagem (ADM) extraídas de adm-hotel.js em 24/10/2026: o comportamento não pode mudar.

const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const item = (nome, sexo, extra = {}) => ({
  nome_colaborador: nome, sexo, status_item: 'AGUARDANDO', cidade: 'Sorriso', uf: 'MT', supervisao: 'SUP NORTE',
  data_checkin_prevista: '2026-11-03', data_checkout_prevista: '2026-11-06', ...extra,
});

test('fila: cancelados nunca aparecem; o card filtra por status e a busca olha vários campos', () => {
  const itens = [
    item('Ana', 'FEMININO', { codigo_operacional: 'HOUT01', hotel: 'Hotel Girassol', status_item: 'RESERVADO' }),
    item('Bruno', 'MASCULINO', { status_item: 'EM_COTACAO', cidade: 'Cuiabá', supervisao: 'SUP SUL', data_checkin_prevista: '2026-11-10' }),
    item('Caio', 'MASCULINO', { status_item: 'CANCELADO' }),
  ];
  const data = (d) => String(d).split('-').reverse().join('/');
  const nomes = (f) => filtrarFila(itens, f, norm, data).map((i) => i.nome_colaborador);
  assert.deepEqual(nomes({}), ['Ana', 'Bruno']);
  assert.deepEqual(nomes({ status: 'todos' }), ['Ana', 'Bruno']);
  assert.deepEqual(nomes({ status: 'EM_COTACAO' }), ['Bruno']);
  assert.deepEqual(nomes({ busca: 'cuiaba' }), ['Bruno']);
  assert.deepEqual(nomes({ busca: ' AN ' }), ['Ana']);
  assert.deepEqual(nomes({ busca: 'sup sul' }), ['Bruno']);
  assert.deepEqual(nomes({ busca: 'hout01' }), ['Ana']);
  assert.deepEqual(nomes({ busca: 'girassol' }), ['Ana']);
  assert.deepEqual(nomes({ busca: '10/11/2026' }), ['Bruno']);
  assert.deepEqual(nomes({ status: 'RESERVADO', busca: 'bruno' }), []);
  assert.deepEqual(nomes({ busca: 'nada disso' }), []);
});

test('contagem por status para os cards ignora cancelados', () => {
  const itens = [item('A', 'FEMININO'), item('B', 'MASCULINO'), item('C', 'MASCULINO', { status_item: 'RESERVADO' }), item('D', 'MASCULINO', { status_item: 'CANCELADO' })];
  assert.deepEqual(contarPorStatus(itens), { AGUARDANDO: 2, RESERVADO: 1 });
  for (const s of Object.keys(V3_LABELS)) assert.ok(V3_VISUAL[s] && V3_VISUAL[s].tone && V3_VISUAL[s].icone && V3_VISUAL[s].selo, `sem visual para ${s}`);
});

test('o rótulo de cada status da fila existe', () => {
  for (const s of ['AGUARDANDO', 'EM_COTACAO', 'AGUARDANDO_HOTEL', 'RESERVADO', 'ALTERACAO_PENDENTE', 'CHECKOUT_PENDENTE', 'CHECKOUT', 'RECUSADO']) assert.ok(V3_LABELS[s], s);
});

test('só reserva junto quem é da mesma cidade, tem datas sobrepostas e ainda está em aberto', () => {
  const base = item('Ana', 'FEMININO');
  assert.equal(elegiveisJuntos(base, item('Bruno', 'MASCULINO')), true);
  assert.equal(elegiveisJuntos(base, item('Bruno', 'MASCULINO', { status_item: 'EM_COTACAO' })), true);
  assert.equal(elegiveisJuntos(base, item('Bruno', 'MASCULINO', { status_item: 'RESERVADO' })), false);
  assert.equal(elegiveisJuntos(base, item('Bruno', 'MASCULINO', { cidade: 'Cuiabá' })), false);
  assert.equal(elegiveisJuntos(base, item('Bruno', 'MASCULINO', { uf: 'GO' })), false);
  assert.equal(elegiveisJuntos(base, item('Bruno', 'MASCULINO', { data_checkin_prevista: '2026-11-06', data_checkout_prevista: '2026-11-08' })), false); // começa quando o outro sai
  assert.equal(elegiveisJuntos(base, item('Bruno', 'MASCULINO', { data_checkin_prevista: '2026-11-05', data_checkout_prevista: '2026-11-08' })), true);
});

test('quartos da reserva manual: de 4 em 4 e o último triplo quando sobra 1; mesma diária e texto em todos', () => {
  const homens = (n) => Array.from({ length: n }, (_, i) => item(`H${i}`, 'MASCULINO'));
  const caps = (n) => quartosDaReservaManual(homens(n), 100, 'obs').map((q) => q.capacidade);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 9].map(caps), [[1], [2], [3], [4], [3, 2], [4, 2], [3, 4, 2]]);
  const misto = quartosDaReservaManual([...homens(2), item('M', 'FEMININO')], 180, '2 duplos');
  assert.deepEqual(misto, [
    { tipo_quarto: 'DUPLO', quantidade: 1, genero: 'MASC', capacidade: 2, valor_diaria: 180, descricao: '2 duplos' },
    { tipo_quarto: 'INDIVIDUAL', quantidade: 1, genero: 'FEM', capacidade: 1, valor_diaria: 180, descricao: '2 duplos' },
  ]);
  assert.deepEqual(quartosDaReservaManual([], 100, 'x'), []);
});

test('sugestão de composição por sexo', () => {
  assert.equal(sugerirComposicao([item('A', 'MASCULINO')]), '1 quarto individual masculino');
  const seis = Array.from({ length: 6 }, (_, i) => item(`H${i}`, 'MASCULINO'));
  assert.equal(sugerirComposicao([...seis, item('M', 'FEMININO')]), '1 quarto(s) quádruplo(s) + 1 quarto para 2 masculino\n1 quarto individual feminino');
  assert.equal(sugerirComposicao([]), '');
});

test('rateio da despesa extra não pode passar do total', () => {
  assert.equal(rateioExcedeTotal([{ valor: 60 }, { valor: 40 }], 100), false);
  assert.equal(rateioExcedeTotal([{ valor: 60 }, { valor: 40.01 }], 100), true);
  assert.equal(rateioExcedeTotal([], 100), false);
});

test('caminho do comprovante troca caracteres especiais do nome', () => {
  assert.equal(caminhoComprovante('pg1', 'comprovante teste (1).pdf', 'u-1'), 'v3/comprovantes/pg1/u-1-comprovante_teste__1_.pdf');
});
