'use strict';
// Baixa: campos corrigidos à mão na tela (✎ Editar) e parcela(s) indicadas por
// DOC/pinCode. Rodar: node test-baixa-ajustes-manuais.js
const assert = require('assert');
const { aplicarAjustesManuais, resolverParcelasManuais } = require('./grmserver-baixa-notas-fiscais-api');

// --- campos do comprovante
const lido = () => ({ favorecidoNome: 'VILSON KUHN', valor: 100, dataPagamento: '2026-10-30' });
let p = aplicarAjustesManuais(lido(), { favorecido_nome: ' Vilson Kuhn Ltda ', valor: 2236, data_pagamento: '2026-10-29' });
assert.equal(p.favorecidoNome, 'Vilson Kuhn Ltda');
assert.equal(p.valor, 2236);
assert.equal(p.dataPagamento, '2026-10-29');
// vazio, inválido ou ausente não mexe no que foi lido
p = aplicarAjustesManuais(lido(), { favorecido_nome: '', valor: 'abc', data_pagamento: '29/10/2026', parcelas: ['1'] });
assert.deepEqual({ ...p, ajustes_manuais: undefined }, { ...lido(), ajustes_manuais: undefined });
assert.deepEqual(aplicarAjustesManuais(lido(), null), lido());

// --- parcelas indicadas à mão
const inv = (over) => ({ pinStatus: 'A', scpCode: 4, pinCode: 1, pinInstallmentValue: 100, favoredName: 'VILSON KUHN LTDA', pinDocNumber: 'NF-1', ...over });
const abertas = [
  inv({ pinCode: 501, pinInstallmentValue: 50, pinDocNumber: 'NF-1' }),
  inv({ pinCode: 502, pinInstallmentValue: 370, pinDocNumber: 'NF-2' }),
  inv({ pinCode: 503, pinInstallmentValue: 1816, pinDocNumber: 'NF-3' }),
  inv({ pinCode: 504, pinInstallmentValue: 999, pinDocNumber: 'NF-3', favoredName: 'OUTRO FORNECEDOR' }), // DOC repetido
  inv({ pinCode: 505, pinInstallmentValue: 50, pinDocNumber: 'NF-1', scpCode: 3 }), // outra empresa
];
const ctx = { scpCode: 4 };

// 3 parcelas fecham o valor do comprovante: soma, baixa uma a uma
let r = resolverParcelasManuais(abertas, ['NF-1', 'nf-2', '503'], { ...ctx, valor: 2236 });
assert.equal(r.tipo, 'soma');
assert.deepEqual(r.invoices.map((i) => i.pinCode), [501, 502, 503]);

// uma parcela só, valor igual
r = resolverParcelasManuais(abertas, ['502'], { ...ctx, valor: 370 });
assert.equal(r.tipo, 'exata');

// pinCode vence DOC repetido; mesmo token repetido conta uma vez
r = resolverParcelasManuais(abertas, ['504', '504'], { ...ctx, valor: 999 });
assert.equal(r.tipo, 'exata');
assert.equal(r.invoices.length, 1);

// uma parcela maior que o comprovante: pagamento parcial
r = resolverParcelasManuais(abertas, ['502'], { ...ctx, valor: 300 });
assert.equal(r.tipo, 'parcial');

// DOC repetido na mesma empresa: pede o pinCode
r = resolverParcelasManuais(abertas, ['NF-3'], { ...ctx, valor: 1816 });
assert.match(r.erro, /Informe o pinCode/);

// DOC só existe em outra empresa / não existe
assert.match(resolverParcelasManuais(abertas, ['505'], { ...ctx, valor: 50 }).erro, /não está em aberto/);
assert.match(resolverParcelasManuais(abertas, ['XYZ'], { ...ctx, valor: 50 }).erro, /não está em aberto/);

// valor maior que a parcela (juros?) e soma que não fecha nunca baixam
assert.match(resolverParcelasManuais(abertas, ['502'], { ...ctx, valor: 400 }).erro, /juros\/multa/);
assert.match(resolverParcelasManuais(abertas, ['501', '502'], { ...ctx, valor: 300 }).erro, /soma precisa fechar/);

// nada indicado
assert.equal(resolverParcelasManuais(abertas, [], { ...ctx, valor: 50 }), null);
assert.equal(resolverParcelasManuais(abertas, ['  '], { ...ctx, valor: 50 }), null);

console.log('test-baixa-ajustes-manuais: ok');
