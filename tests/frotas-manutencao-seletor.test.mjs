import test from 'node:test';
import assert from 'node:assert/strict';
import { gruposDoSeletor, htmlSeletor, itensDaSelecao } from '../assets/js/modules/frotas-manutencao-seletor.js';
import { MAO_DE_OBRA } from '../assets/js/modules/frotas-manutencao-regras.js';

// Seletor de itens da "Nova manutenção": grupos do guia + itens de cada grupo, uma janela por vez (grade de grupos → itens do grupo).

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

test('o esqueleto do seletor tem a grade de grupos e a janela do grupo, sem busca (o resumo fica na coluna da tela)', () => {
  const html = htmlSeletor();
  for (const marca of ['data-pick-grupos', 'data-pick-abertos']) assert.match(html, new RegExp(marca));
  assert.doesNotMatch(html, /data-pick-busca|data-pick-painel/);
  assert.doesNotMatch(html, /data-pick-resumo/);
});

test('grupos viram quadrados que trocam a grade pela janela do grupo (Voltar), com a caixa de grupo todo', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../assets/js/modules/frotas-manutencao-seletor.js', import.meta.url), 'utf8');
  assert.match(src, /data-pick-gr=/);
  assert.match(src, /data-pick-voltar/, 'a janela do grupo tem Voltar');
  assert.doesNotMatch(src, /abertos\.(add|has)/, 'um grupo por vez, não vários empilhados');
  assert.match(src, /<input type="checkbox" data-pick-todos data-grupo=/, 'a caixa do grupo fica no quadrado e na janela');
  assert.match(src, /marcarGrupo\(todos\.dataset\.grupo, todos\.checked\)/);
  assert.match(src, /ck\.indeterminate/, 'grupo com parte marcada fica no meio');
  assert.doesNotMatch(src, /fm-pick-g"|data-pick-grupos"\s*aria-label="Grupos do guia"><\/nav>/, 'a lista de grupos em dois painéis saiu');
});
