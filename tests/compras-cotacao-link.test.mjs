import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cnpjValido, lerValor, validarResposta, situacaoDoLink } from '../supabase/functions/compras-cotacao-publica/regras.js';
import { montarPropostas, situacaoDoItem, urlDoLink, linkAberto, descreverContato, formatarTelefone, validarMesmaCidade, chaveGrupoPedido } from '../assets/js/admComprasCotacao.js';

// Cotação por link: o fornecedor responde sem login e Compras compara as propostas no painel.

test('a página pública usa uma cópia idêntica das regras da Edge Function', () => {
  const a = readFileSync(new URL('../supabase/functions/compras-cotacao-publica/regras.js', import.meta.url), 'utf8');
  const b = readFileSync(new URL('../assets/js/cotacaoFornecedorRegras.js', import.meta.url), 'utf8');
  assert.equal(a, b);
});

test('CNPJ: dígitos verificadores e máscara', () => {
  assert.equal(cnpjValido('11.222.333/0001-81'), true);
  assert.equal(cnpjValido('11222333000181'), true);
  assert.equal(cnpjValido('11.222.333/0001-82'), false);
  assert.equal(cnpjValido('00000000000000'), false);
  assert.equal(cnpjValido('123'), false);
});

test('valor aceita vírgula, ponto e milhar', () => {
  assert.equal(lerValor('12,50'), 12.5);
  assert.equal(lerValor('12.50'), 12.5);
  assert.equal(lerValor('R$ 1.234,56'), 1234.56);
  assert.ok(Number.isNaN(lerValor('abc')));
  assert.ok(Number.isNaN(lerValor('')));
});

const IDS = ['i1', 'i2'];
const base = () => ({
  cnpj: '11.222.333/0001-81', razao_social: 'Fornecedor X Ltda', regime_tributario: 'simples_nacional',
  atendente_nome: '  Maria   Souza ', atendente_telefone: '(65) 99999-8888', emite_nf: true, prazo_entrega: '5 dias úteis',
  itens: [{ id: 'i1', valor: '10,50' }, { id: 'i2', valor: null, nao_possuo: true }],
  frete_pagador: 'cliente', frete_valor: '80,50',
  formas_pagamento: ['PIX', 'Boleto'], tem_desconto: true, descontos: [{ forma: 'PIX', tipo: 'percentual', valor: '5' }],
});

test('resposta válida é normalizada', () => {
  const { dados, erro } = validarResposta(base(), IDS);
  assert.equal(erro, undefined);
  assert.equal(dados.cnpj, '11222333000181');
  assert.deepEqual(dados.itens, [{ id: 'i1', valor_unitario: 10.5 }, { id: 'i2', valor_unitario: null }]);
  assert.deepEqual(dados.descontos, [{ forma: 'PIX', tipo: 'percentual', valor: 5 }]);
  assert.equal(dados.regime_tributario, 'simples_nacional');
  assert.equal(dados.atendente_nome, 'Maria Souza');
  assert.equal(dados.atendente_telefone, '65999998888');
  assert.equal(dados.frete_pagador, 'cliente');
  assert.equal(dados.frete_valor, 80.5);
});

test('regime tributário e contato do atendente são obrigatórios', () => {
  const com = (mudar) => validarResposta({ ...base(), ...mudar }, IDS);
  for (const regime of ['simples_nacional', 'lucro_presumido', 'lucro_real']) assert.equal(com({ regime_tributario: regime }).erro, undefined);
  assert.match(com({ regime_tributario: '' }).erro, /regime/);
  assert.match(com({ regime_tributario: 'mei' }).erro, /regime/);
  assert.match(com({ regime_tributario: 'toString' }).erro, /regime/);
  assert.match(com({ atendente_nome: ' ' }).erro, /atendente/);
  assert.match(com({ atendente_telefone: '123' }).erro, /telefone/);
  assert.equal(com({ atendente_telefone: '+55 (65) 3333-4444' }).dados.atendente_telefone, '6533334444');
  assert.equal(com({ atendente_telefone: '55991234567' }).dados.atendente_telefone, '55991234567'); // DDD 55 (RS), não é prefixo do país
});

test('frete: pago pela empresa não leva valor; pago pelo cliente exige estimativa', () => {
  const empresa = validarResposta({ ...base(), frete_pagador: 'empresa', frete_valor: '99' }, IDS);
  assert.equal(empresa.dados.frete_valor, null);
  const com = (mudar) => validarResposta({ ...base(), ...mudar }, IDS).erro;
  assert.match(com({ frete_pagador: undefined }), /frete/);
  assert.match(com({ frete_pagador: 'outro' }), /frete/);
  assert.match(com({ frete_pagador: 'cliente', frete_valor: '' }), /estimativa/);
  assert.match(com({ frete_pagador: 'cliente', frete_valor: '0' }), /estimativa/);
});

test('resposta inválida é recusada com mensagem', () => {
  const com = (mudar) => validarResposta({ ...base(), ...mudar }, IDS).erro;
  assert.match(com({ cnpj: '11222333000182' }), /CNPJ/);
  assert.match(com({ razao_social: ' ' }), /razão social/);
  assert.match(com({ emite_nf: undefined }), /nota fiscal/);
  assert.match(com({ prazo_entrega: '' }), /prazo/);
  assert.match(com({ formas_pagamento: [] }), /forma de pagamento/);
  assert.match(com({ formas_pagamento: ['Cheque'] }), /inválida/);
  assert.match(com({ itens: [{ id: 'i1', valor: '5' }] }), /todos os itens/);
  assert.match(com({ itens: [{ id: 'i1', valor: '5' }, { id: 'outro', valor: '5' }] }), /Item inválido/);
  assert.match(com({ itens: [{ id: 'i1', valor: '' }, { id: 'i2', valor: '3' }] }), /Não possuo/);
  assert.match(com({ itens: [{ id: 'i1', valor: '-3' }, { id: 'i2', valor: '3' }] }), /inválido/);
  assert.match(com({ itens: [{ id: 'i1', valor: null, nao_possuo: true }, { id: 'i2', valor: null, nao_possuo: true }] }), /todos os itens/);
  assert.match(com({ tem_desconto: true, descontos: [] }), /desconto/);
  assert.match(com({ descontos: [{ forma: 'Dinheiro', tipo: 'percentual', valor: '5' }] }), /selecionada/);
  assert.match(com({ descontos: [{ forma: 'PIX', tipo: 'percentual', valor: '150' }] }), /Desconto inválido/);
});

test('sem desconto, a lista de descontos é ignorada', () => {
  const { dados } = validarResposta({ ...base(), tem_desconto: false, descontos: [{ forma: 'PIX', tipo: 'valor', valor: '9' }] }, IDS);
  assert.deepEqual(dados.descontos, []);
});

test('link só aceita resposta aberto e dentro da validade', () => {
  const agora = new Date('2026-10-23T12:00:00Z');
  assert.equal(situacaoDoLink(null, agora), 'invalido');
  assert.equal(situacaoDoLink({ status: 'encerrada', expira_em: '2026-11-01T00:00:00Z' }, agora), 'encerrada');
  assert.equal(situacaoDoLink({ status: 'aberta', expira_em: '2026-10-23T11:00:00Z' }, agora), 'expirada');
  assert.equal(situacaoDoLink({ status: 'aberta', expira_em: '2026-10-30T12:00:00Z' }, agora), 'aberta');
  assert.equal(linkAberto({ status: 'aberta', expira_em: '2026-10-30T12:00:00Z' }, agora), true);
});

test('URL do link usa o domínio oficial do painel', () => {
  assert.equal(urlDoLink('abc', 'https://grao1000.com.br'), 'https://grao1000.com.br/painel/cotacao-fornecedor?t=abc');
  assert.equal(urlDoLink('abc', 'https://www.grao1000.com.br'), 'https://grao1000.com.br/painel/cotacao-fornecedor?t=abc');
  assert.equal(urlDoLink('abc', 'http://localhost:3000'), 'http://localhost:3000/painel/cotacao-fornecedor?t=abc');
});

// ── Comparação no painel ──
const itens = [{ id: 'i1', quantidade: 10 }, { id: 'i2', quantidade: 2 }];
const resp = (cnpj, razao, quando, valores, extra = {}) => ({
  id: `${cnpj}${quando}`, cotacao_id: 'c1', cnpj, razao_social: razao, emite_nf: true, prazo_entrega: '3 dias', formas_pagamento: ['PIX'],
  tem_desconto: false, descontos: [], atualizado_em: quando,
  compras_cotacao_resposta_itens: Object.entries(valores).map(([compra_item_id, valor_unitario]) => ({ compra_item_id, valor_unitario })), ...extra,
});
const info = (respostas) => ({
  porItem: new Map([['i1', ['c1']], ['i2', ['c1']]]),
  cotacoes: new Map([['c1', { id: 'c1', status: 'aberta', expira_em: '2999-01-01T00:00:00Z' }]]),
  respostas,
});

test('propostas: o frete do cliente entra no custo e muda a ordem', () => {
  const p = montarPropostas(itens, info([
    resp('1', 'Barato com frete caro', '2026-10-20', { i1: 10, i2: 4 }, { frete_pagador: 'cliente', frete_valor: '50' }),
    resp('2', 'Mais caro, frete incluso', '2026-10-20', { i1: 11, i2: 4 }, { frete_pagador: 'empresa', frete_valor: null }),
  ]));
  assert.deepEqual(p.map((x) => x.razao_social), ['Mais caro, frete incluso', 'Barato com frete caro']);
  assert.equal(p[0].totalComFrete, 118);
  assert.equal(p[1].totalComFrete, 158);
});

test('propostas: quem cobre tudo vem primeiro, do menor total para o maior', () => {
  const p = montarPropostas(itens, info([
    resp('1', 'Caro', '2026-10-20', { i1: 12, i2: 5 }),
    resp('2', 'Parcial barato', '2026-10-20', { i1: 1, i2: null }),
    resp('3', 'Barato', '2026-10-20', { i1: 10, i2: 4 }),
  ]));
  assert.deepEqual(p.map((x) => x.razao_social), ['Barato', 'Caro', 'Parcial barato']);
  assert.equal(p[0].total, 108);
  assert.equal(p[0].completo, true);
  assert.equal(p[2].cobertos, 1);
  assert.equal(p[2].completo, false);
  assert.equal(p[2].valores.i2, null);
});

test('propostas: o mesmo CNPJ em dois links vale pela resposta mais recente de cada item', () => {
  const p = montarPropostas(itens, info([
    resp('1', 'F', '2026-10-20', { i1: 20, i2: 9 }),
    resp('1', 'F', '2026-10-22', { i1: 15 }),
  ]));
  assert.equal(p.length, 1);
  assert.equal(p[0].valores.i1, 15);
  assert.equal(p[0].valores.i2, 9);
  assert.equal(p[0].total, 168);
});

test('propostas: fornecedor que só respondeu outros itens não aparece', () => {
  const p = montarPropostas([{ id: 'i1', quantidade: 1 }], info([resp('1', 'F', '2026-10-20', { i2: 4 })]));
  assert.equal(p.length, 0);
});

test('situação do item no card de Cotações', () => {
  assert.equal(situacaoDoItem('i1', info([]), new Date('2026-10-23')).codigo, 'enviado');
  assert.equal(situacaoDoItem('x', info([])).codigo, 'sem');
  const com = info([resp('1', 'F', '2026-10-20', { i1: 10 }), resp('2', 'G', '2026-10-20', { i1: null })]);
  assert.deepEqual(situacaoDoItem('i1', com), { codigo: 'respostas', texto: '1 resposta' });
  const encerrado = info([]);
  encerrado.cotacoes.set('c1', { id: 'c1', status: 'encerrada', expira_em: '2999-01-01T00:00:00Z' });
  assert.equal(situacaoDoItem('i1', encerrado).codigo, 'encerrado');
});

test('contato do atendente formatado para o painel', () => {
  assert.equal(formatarTelefone('65999998888'), '(65) 99999-8888');
  assert.equal(formatarTelefone('6533334444'), '(65) 3333-4444');
  assert.equal(descreverContato({ atendente_nome: 'Maria', atendente_telefone: '65999998888' }), 'Maria · (65) 99999-8888');
  assert.equal(descreverContato({}), '-');
});

// ── Unir pedidos: mesmo gestor + mesma cidade ──
const pedido = (id, solicitante, cidade, uf) => ({ id, compras_solicitacoes: { solicitante, cidade, uf } });

test('pedidos do mesmo gestor e da mesma cidade formam um card só (sem cidade também)', () => {
  assert.equal(chaveGrupoPedido(pedido('1', 'MARCOS ROSA', 'Maringá', 'PR')), chaveGrupoPedido(pedido('2', 'marcos  rosa', 'MARINGA', 'pr')));
  assert.equal(chaveGrupoPedido(pedido('1', 'MARCOS ROSA', null, null)), chaveGrupoPedido(pedido('2', 'MARCOS ROSA', '', '')));
  assert.notEqual(chaveGrupoPedido(pedido('1', 'MARCOS ROSA', 'Maringá', 'PR')), chaveGrupoPedido(pedido('2', 'MARCOS ROSA', 'Sorriso', 'MT')));
  assert.notEqual(chaveGrupoPedido(pedido('1', 'MARCOS ROSA', null, null)), chaveGrupoPedido(pedido('2', 'MARCOS ROSA', 'Maringá', 'PR')));
  assert.notEqual(chaveGrupoPedido(pedido('1', 'ANA', 'Maringá', 'PR')), chaveGrupoPedido(pedido('2', 'MARCOS ROSA', 'Maringá', 'PR')));
  assert.equal(chaveGrupoPedido(pedido('7', '', 'Maringá', 'PR')), 'solo:7');
});

test('cotar ou comprar juntos não une cidades diferentes', () => {
  assert.equal(validarMesmaCidade([pedido('1', 'A', 'Maringá', 'PR'), pedido('2', 'B', 'maringa', 'PR')]), null);
  assert.equal(validarMesmaCidade([pedido('1', 'A', null, null), pedido('2', 'A', '', '')]), null);
  assert.equal(validarMesmaCidade([]), null);
  assert.match(validarMesmaCidade([pedido('1', 'A', 'Maringá', 'PR'), pedido('2', 'A', 'Sorriso', 'MT')]), /cidades diferentes \(Maringá\/PR, Sorriso\/MT\)/);
  assert.match(validarMesmaCidade([pedido('1', 'A', 'Maringá', 'PR'), pedido('2', 'A', null, null)]), /sem cidade/);
  assert.match(validarMesmaCidade([pedido('1', 'A', 'Santa Helena', 'PR'), pedido('2', 'A', 'Santa Helena', 'GO')]), /cidades diferentes/);
});
