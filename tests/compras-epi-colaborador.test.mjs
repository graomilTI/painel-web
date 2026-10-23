import test from 'node:test';
import assert from 'node:assert/strict';
import { adicionarEpi, agruparPorColaborador, itemEpiParaBanco, chaveColaborador } from '../assets/js/comprasEpiColaborador.js';

// Aba EPI do gestor: o que será comprado para cada colaborador.

const epi = (colaborador_nome, material, quantidade = 1, extra = {}) => ({ colaborador_id: null, colaborador_nome, material, quantidade, unidade: quantidade, ...extra });

test('o mesmo EPI do mesmo colaborador soma a quantidade, sem linha repetida', () => {
  let lista = [];
  lista = adicionarEpi(lista, epi('RAYSSA PRADO', 'CAPACETE'));
  lista = adicionarEpi(lista, epi('RAYSSA PRADO', 'CAPACETE', 2));
  lista = adicionarEpi(lista, epi('rayssa  prado', 'COLETE'));
  assert.equal(lista.length, 2);
  assert.equal(lista[0].quantidade, 3);
  assert.equal(lista[0].unidade, 3);
});

test('tamanho diferente é outra linha; colaborador com id ignora diferença de grafia do nome', () => {
  let lista = [];
  lista = adicionarEpi(lista, epi('ANA', 'BOTINA', 1, { tamanho: '38', colaborador_id: 'k1' }));
  lista = adicionarEpi(lista, epi('ANA S.', 'BOTINA', 1, { tamanho: '39', colaborador_id: 'k1' }));
  lista = adicionarEpi(lista, epi('ANA', 'BOTINA', 1, { tamanho: '38', colaborador_id: 'k1' }));
  assert.equal(lista.length, 2);
  assert.equal(lista.find((i) => i.tamanho === '38').quantidade, 2);
  assert.equal(chaveColaborador(lista[0]), 'k1');
});

test('agrupa por colaborador na ordem em que apareceram', () => {
  const lista = [epi('RAYSSA', 'CAPACETE'), epi('CAIKE', 'COLETE'), epi('RAYSSA', 'OCULOS'), epi('RAYSSA', 'BOTINA', 1, { tamanho: '40' })];
  const grupos = agruparPorColaborador(lista);
  assert.deepEqual(grupos.map((g) => [g.nome, g.itens.map((i) => i.material)]), [['RAYSSA', ['CAPACETE', 'OCULOS', 'BOTINA']], ['CAIKE', ['COLETE']]]);
});

test('linha para o banco leva o colaborador, é EPI e não leva campos de controle', () => {
  const linha = itemEpiParaBanco({ _id: 'x1', ...epi('RAYSSA', 'CAPACETE', 1, { colaborador_id: 'k9', colaborador_tipo: 'Auxiliar' }) });
  assert.equal('_id' in linha, false);
  assert.equal(linha.tipo, 'EPI');
  assert.equal(linha.colaborador_id, 'k9');
  assert.equal(linha.colaborador_nome, 'RAYSSA');
});
