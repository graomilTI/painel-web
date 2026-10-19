import test from 'node:test';
import assert from 'node:assert/strict';
import { buscarItens, gruposDoSeletor, htmlSeletor, itensDaSelecao } from '../assets/js/modules/frotas-manutencao-seletor.js';
import { MAO_DE_OBRA } from '../assets/js/modules/frotas-manutencao-regras.js';

// Seletor de itens da "Nova manutenção": grupos do guia + itens de cada grupo, com busca em todos os grupos.

const base = {
  grupos: [
    { codigo: 2, nome: 'Freios', categoria_codigo: 9 },
    { codigo: 9, nome: 'Transmissão e embreagem', categoria_codigo: 7 },
    { codigo: 8, nome: 'Revisão geral e serviços externos', categoria_codigo: 28 },
  ],
  categorias: [{ codigo: 9, nome: 'Freios', ativo: true }, { codigo: 7, nome: 'Transmissão', ativo: true }],
  componentes: [
    { grupo_codigo: 2, nome: 'Pastilhas de freio', ordem: 1 },
    { grupo_codigo: 2, nome: 'Discos de freio', ordem: 2 },
    { grupo_codigo: 9, nome: 'Kit de embreagem (disco, platô e rolamento)', ordem: 1 },
    { grupo_codigo: 9, nome: 'Óleo e fluido do câmbio', ordem: 3 },
  ],
};

test('grupos do seletor: os do guia; sem grupos cadastrados, cai nas categorias', () => {
  assert.deepEqual(gruposDoSeletor(base).map((g) => g.nome), ['Freios', 'Transmissão e embreagem', 'Revisão geral e serviços externos']);
  assert.deepEqual(gruposDoSeletor({ categorias: base.categorias }).map((g) => [g.codigo, g.categoria_codigo]), [[9, 9], [7, 7]]);
});

test('busca acha o item em qualquer grupo, sem acento, e pelo nome do grupo', () => {
  assert.deepEqual(buscarItens(base, 'pastilha').map((a) => [a.grupoNome, a.nome]), [['Freios', 'Pastilhas de freio']]);
  assert.deepEqual(buscarItens(base, 'OLEO').map((a) => a.nome), ['Óleo e fluido do câmbio']);
  assert.equal(buscarItens(base, 'disco').length, 2, 'disco de freio e disco da embreagem');
  assert.deepEqual(buscarItens(base, 'embreagem').map((a) => a.grupo), [9, 9], 'pelo grupo traz todos os itens dele');
  assert.deepEqual(buscarItens(base, '  '), []);
  assert.deepEqual(buscarItens(base, 'xyz'), []);
});

test('itens da seleção: peças e serviço (Mão de obra) saem separados, na ordem dos grupos, com a categoria do grupo', () => {
  const grupos = gruposDoSeletor(base);
  const selecao = new Map([[9, ['Kit de embreagem (disco, platô e rolamento)', MAO_DE_OBRA]], [2, ['Pastilhas de freio', 'Discos de freio']]]);
  const tipoDe = (cod, nome) => (nome === MAO_DE_OBRA ? 'servico' : 'peca');
  assert.deepEqual(itensDaSelecao(selecao, grupos, tipoDe), [
    { categoria_codigo: 9, descricao: 'Pastilhas de freio, Discos de freio', tipo_item: 'peca', componentes: ['Pastilhas de freio', 'Discos de freio'] },
    { categoria_codigo: 7, descricao: 'Kit de embreagem (disco, platô e rolamento)', tipo_item: 'peca', componentes: ['Kit de embreagem (disco, platô e rolamento)'] },
    { categoria_codigo: 7, descricao: 'Mão de obra', tipo_item: 'servico', componentes: ['Mão de obra'] },
  ]);
  assert.deepEqual(itensDaSelecao(new Map(), grupos, tipoDe), [], 'nada marcado = nenhum item (a tela não deixa registrar)');
});

test('a busca acha Mão de obra pelo nome, mas ela não aparece nas buscas por peça ou grupo', () => {
  assert.deepEqual(buscarItens(base, 'mão de obra').map((a) => a.nome), [MAO_DE_OBRA, MAO_DE_OBRA, MAO_DE_OBRA]);
  assert.ok(!buscarItens(base, 'freio').some((a) => a.nome === MAO_DE_OBRA));
});

test('o esqueleto do seletor tem busca, lista de grupos e painel (o resumo fica na coluna da tela)', () => {
  const html = htmlSeletor();
  for (const marca of ['data-pick-busca', 'data-pick-grupos', 'data-pick-painel']) assert.match(html, new RegExp(marca));
  assert.doesNotMatch(html, /data-pick-resumo/);
});
