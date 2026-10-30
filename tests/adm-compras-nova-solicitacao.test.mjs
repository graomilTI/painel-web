import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catalogoMaterial, catalogoDoTipo, abaDoItem, precisaDetalhe, colaboradoresDaSupervisao, itemUniforme, adicionarUniforme, itemAlojamento, entregaDoPedido, observacoesAlojamento, TIPOS } from '../assets/js/admComprasNovaSolicitacao.js';

const cat = [
  { material: 'LUVA', tipo: 'Material' },
  { material: 'CAPA DE CHUVA', tipo: 'EPI' },
  { material: 'BELICHE', tipo: 'Alojamento' }
];

test('a nova solicitação da Compras tem as mesmas quatro abas do gestor, com o tipo gravado igual', () => {
  assert.deepEqual(TIPOS.map((t) => t.tipoSolicitacao), ['itens', 'uniformes', 'EPI', 'Alojamento']);
});

test('Material não enxerga EPI nem Alojamento; cada aba usa só o seu tipo', () => {
  assert.deepEqual(catalogoMaterial(cat).map((c) => c.material), ['LUVA']);
  assert.deepEqual(catalogoDoTipo(cat, 'epi').map((c) => c.material), ['CAPA DE CHUVA']);
  assert.deepEqual(catalogoDoTipo(cat, 'alojamento').map((c) => c.material), ['BELICHE']);
  assert.equal(abaDoItem(cat, 'capa de chuva'), 'EPI');
  assert.equal(abaDoItem(cat, 'Beliche'), 'Alojamento');
  assert.equal(abaDoItem(cat, 'LUVA'), null);
});

test('botina e peneira individual exigem tamanho/detalhe', () => {
  assert.ok(precisaDetalhe('Botina'));
  assert.ok(precisaDetalhe('PENEIRA INDIVIDUAL'));
  assert.ok(!precisaDetalhe('LUVA'));
});

test('"adicionar todos" pega a supervisão do solicitante, sem repetir colaborador', () => {
  const colabs = [
    { id: 1, nome: 'B', cpf: '2', supervisao: 'Sup A' },
    { id: 2, nome: 'A', cpf: '1', supervisao: 'sup a' },
    { id: 3, nome: 'C', cpf: '3', supervisao: 'Sup B' },
    { id: 4, nome: 'A', cpf: '1', supervisao: 'Sup A' }
  ];
  assert.deepEqual(colaboradoresDaSupervisao(colabs, { supervisao: 'SUP A' }).map((c) => c.nome), ['A', 'B']);
  assert.deepEqual(colaboradoresDaSupervisao(colabs, {}), []);
});

test('uniforme: máximo de 2 por colaborador e cor gravada em uniforme_cor', () => {
  const i = itemUniforme({ colab: { id: 7, nome: 'Ana', cargo: 'Op' }, cor: 'Cinza', tamanho: 'G', qtd: 9 });
  assert.equal(i.quantidade, 2);
  assert.equal(i.material, 'UNIFORME');
  assert.equal(i.tipo, 'Uniforme');
  assert.equal(i.uniforme_cor, 'Cinza');
  assert.equal(i.colaborador_id, 7);
});

test('alojamento: item em maiúsculas, tipo Alojamento e destino nas observações', () => {
  assert.deepEqual(itemAlojamento({ material: 'cama', qtd: 3, detalhe: '' }), { unidade: 3, quantidade: 3, material: 'CAMA', tipo: 'Alojamento', tamanho: null });
  assert.equal(observacoesAlojamento(' Centro '), 'Alojamento: Centro');
});

test('retirada/entrega é obrigatória e entrega pede endereço', () => {
  assert.throws(() => entregaDoPedido('', ''), /retirada ou entrega/);
  assert.throws(() => entregaDoPedido('entrega', ' '), /endereço/);
  assert.deepEqual(entregaDoPedido('retirada', 'x'), { entrega_tipo: 'retirada', entrega_endereco: null });
  assert.deepEqual(entregaDoPedido('entrega', ' Rua A '), { entrega_tipo: 'entrega', entrega_endereco: 'Rua A' });
});

test('a página ADM usa o módulo novo e a versão do HTML acompanha', () => {
  const js = readFileSync(new URL('../assets/js/adm-compras.js', import.meta.url), 'utf8');
  assert.match(js, /abrirNovaSolicitacao\(\{/);
  assert.match(js, /admComprasNovaSolicitacao\.js\?v=20261030-uni-multi1/);
});

test('uniforme: mesmo colaborador pode ter linhas com tamanhos diferentes; igual soma na linha', () => {
  const lista = [];
  const tania = { id: 5, nome: 'Tania', cpf: '111' };
  adicionarUniforme(lista, { colab: tania, cor: 'Verde', tam: 'P' });
  adicionarUniforme(lista, { colab: tania, cor: 'Verde', tam: 'M' });
  assert.equal(lista.length, 2);
  assert.notEqual(lista[0].key, lista[1].key);
  adicionarUniforme(lista, { colab: tania, cor: 'Verde', tam: 'M' });
  assert.equal(lista.length, 2);
  assert.equal(lista[1].qtd, 2);
  adicionarUniforme(lista, { colab: tania, cor: 'Verde', tam: 'M' });
  assert.equal(lista[1].qtd, 2);
});
