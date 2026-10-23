import test from 'node:test';
import assert from 'node:assert/strict';
import { itensComDistribuicao } from '../assets/js/comprasDistribuicaoEpi.js';

// Regressão: "Solicitar com esta distribuição" sem distribuir nada duplicava cada EPI (item inteiro + o resto).

let n = 0;
const id = () => `novo${++n}`;
const epi = (_id, material, q) => ({ _id, material, tipo: 'EPI', quantidade: q, unidade: q });

test('EPI sem distribuição entra uma vez só, sem colaborador', () => {
  const itens = [epi('a', 'CAPACETE', 2), epi('b', 'BOTINA', 1), { _id: 'c', material: 'CALADOR', tipo: 'Outros', quantidade: 3, unidade: 3 }];
  const final = itensComDistribuicao(itens, [], id);
  assert.deepEqual(final.map((i) => [i.material, i.quantidade, i.colaborador_nome ?? null]), [['CALADOR', 3, null], ['CAPACETE', 2, null], ['BOTINA', 1, null]]);
});

test('distribuição parcial: um item por colaborador e um com o que sobrou', () => {
  const final = itensComDistribuicao([epi('a', 'MASCARA PFF2', 20)], [
    { epi_id: 'a', colaborador_id: 'k1', colaborador_nome: 'ANA', quantidade: 5 },
    { epi_id: 'a', colaborador_id: 'k2', colaborador_nome: 'BIA', quantidade: 10 },
  ], id);
  assert.deepEqual(final.map((i) => [i.colaborador_nome, i.quantidade]), [['ANA', 5], ['BIA', 10], [null, 5]]);
  assert.equal(final.reduce((s, i) => s + i.quantidade, 0), 20);
});

test('distribuição total não deixa item sobrando', () => {
  const final = itensComDistribuicao([epi('a', 'CAPACETE', 2)], [{ epi_id: 'a', colaborador_id: null, colaborador_nome: 'ANA', quantidade: 2 }], id);
  assert.equal(final.length, 1);
  assert.equal(final[0].colaborador_nome, 'ANA');
});
