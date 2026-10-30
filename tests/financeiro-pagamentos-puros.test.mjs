// Financeiro > Pagamentos: funções puras extraídas de setor-pagamentos.js (30/10/2026).
// Os valores esperados do PIX foram gerados pelo código ANTES da extração: a mudança de arquivo não pode alterar o payload.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// util.js importa o XLSX de um CDN (https), que o Node não carrega: troca só esse import por um stub vazio.
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    if (specifier.startsWith('https://')) return { url: 'stub:' + specifier, shortCircuit: true };
    return next(specifier, context);
  }
  export async function load(url, context, next) {
    if (url.startsWith('stub:')) return { format: 'module', source: 'export const utils = {}; export const read = () => ({}); export const writeFile = () => {};', shortCircuit: true };
    return next(url, context);
  }
`));

const raiz = new URL('../assets/js/modules/financeiro/', import.meta.url).href;
const { gerarPayloadPix } = await import(raiz + 'pix.js?v=20261030-fin17');
const { getGestorCoordenacao, codigoPagamento, isLinkDados } = await import(raiz + 'conteudo-pagamento.js?v=20261030-fin17');
const { compraItemToPagamento, groupCompraPagamentos, idsItensCompra } = await import(raiz + 'compras-pagamento.js?v=20261030-fin17');

test('payload PIX idêntico ao anterior à extração', () => {
  assert.equal(gerarPayloadPix('chave@exemplo.com', { valor: '150.5', nome: 'Fornecedor João LTDA', cidade: 'SAO PAULO' }),
    '00020101021226390014BR.GOV.BCB.PIX0117chave@exemplo.com5204000053039865406150.505802BR5920Fornecedor Jo o LTDA6009SAO PAULO62070503***6304CBE5');
  assert.equal(gerarPayloadPix('12345678900'),
    '00020101021226330014BR.GOV.BCB.PIX0111123456789005204000053039865802BR5913Pagamento PIX6006BRASIL62070503***63041F49');
  assert.equal(gerarPayloadPix('+5511999999999', { valor: 10, nome: 'A', cidade: 'BRASIL' }),
    '00020101021226360014BR.GOV.BCB.PIX0114+5511999999999520400005303986540510.005802BR5901A6006BRASIL62070503***6304147F');
});

test('gestor e coordenação vêm das colunas ou do texto da descrição', () => {
  assert.deepEqual(getGestorCoordenacao({ gestor: 'Ana', coordenacao: 'Sul' }), { gestor: 'Ana', coordenacao: 'Sul' });
  assert.deepEqual(getGestorCoordenacao({ descricao: 'Gestor: Bia\nCoordenação: Norte' }), { gestor: 'Bia', coordenacao: 'Norte' });
  assert.deepEqual(getGestorCoordenacao({}), { gestor: '', coordenacao: '' });
});

test('código do pagamento: linha derivada de compra usa _codigo_pagamento', () => {
  assert.equal(codigoPagamento({ id: 'compra_1', codigo: 'ITEM', _codigo_pagamento: 'PAG-2610-001' }), 'PAG-2610-001');
  assert.equal(codigoPagamento({ id: 'x', codigo: 'PAG-2610-002' }), 'PAG-2610-002');
  assert.equal(isLinkDados('https://a.com/x'), true);
  assert.equal(isLinkDados('chave pix 123'), false);
});

test('itens de Compras com mesma forma/dados/gestor/status viram um único pagamento somado', () => {
  const sol = { solicitante: 'Ana', coordenacao: 'Sul', data_solicitacao: '2026-10-01' };
  const base = { forma_pagamento: 'PIX', dados_pagamento: 'k1', status: 'pendente_pagamento', compras_solicitacoes: sol };
  const rows = [
    { ...base, id: 'a', material: 'Bota', quantidade: 2, valor_total: 100, codigo_pagamento: 'PAG-1' },
    { ...base, id: 'b', material: 'Luva', quantidade: 1, valor_total: 50.5, codigo_pagamento: 'PAG-2' },
    { ...base, id: 'c', material: 'Capa', quantidade: 1, valor_total: 10, dados_pagamento: 'k2' },
  ];
  const grupos = groupCompraPagamentos(rows);
  assert.equal(grupos.length, 2);
  const g = grupos.find((x) => x._compra_item_ids.length === 2);
  assert.equal(g.valor, 150.5);
  assert.equal(g._codigo_pagamento, 'PAG-1 / PAG-2');
  assert.deepEqual(idsItensCompra(g), ['a', 'b']);
  assert.equal(compraItemToPagamento(rows[0]).id, 'compra_a');
});
