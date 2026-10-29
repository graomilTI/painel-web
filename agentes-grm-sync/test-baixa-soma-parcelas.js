'use strict';
// Comprovante de fornecedor (CNPJ) que paga a SOMA de 2+ parcelas em aberto: só baixa sozinho com UMA combinação.
process.env.GRM_BAIXA_NF_DRY_RUN = 'true';
const assert = require('assert');
const { findSomaParcelasMatch, descreverSomaParcelas } = require('./grmserver-baixa-notas-fiscais-api.js');

const CNPJ = '00.207.169/0001-17';
const NOME = 'COMERCIO DE PNEUS E PECAS JCFS';
let seq = 1000;
const parcela = (valor, extra = {}) => ({
  pinCode: ++seq, patCode: 7, scpCode: 5, favoredName: NOME, favoredDocument: '00207169000117',
  pinInstallmentValue: valor, pinDocNumber: String(seq), pinStatus: 'A', ...extra,
});
const base = { scpCode: 5, favorecidoNome: NOME, favorecidoDocumento: CNPJ };

// 1) combinação única de 3 parcelas entre várias
{
  const abertas = [parcela(115), parcela(50.5), parcela(643), parcela(837.36), parcela(615), parcela(100.01), parcela(0.99)];
  const r = findSomaParcelasMatch(abertas, { ...base, valor: 643 + 837.36 + 115 });
  assert.equal(r.status, 'unica');
  assert.deepEqual(r.invoices.map((i) => i.pinInstallmentValue).sort((a, b) => a - b), [115, 643, 837.36]);
}

// 2) duas combinações possíveis (parcelas de valor igual) -> ambígua
{
  const abertas = [parcela(50), parcela(50), parcela(100.36)];
  const r = findSomaParcelasMatch(abertas, { ...base, valor: 150.36 });
  assert.equal(r.status, 'ambigua');
  assert.match(descreverSomaParcelas(r, 150.36), /Mais de uma combinação/);
}

// 3) nenhuma combinação fecha
{
  const abertas = [parcela(115), parcela(50), parcela(643)];
  const r = findSomaParcelasMatch(abertas, { ...base, valor: 1595.36 });
  assert.equal(r.status, 'nenhuma');
  assert.match(descreverSomaParcelas(r, 1595.36), /também não fecha R\$ 1\.595,36/);
}

// 4) só fornecedor com CNPJ: pessoa física (CPF) não entra
assert.equal(findSomaParcelasMatch([parcela(100), parcela(50)], { ...base, favorecidoDocumento: '123.456.789-09', valor: 150 }), null);

// 5) outra empresa pagadora / CNPJ diferente no GRM / nome diferente ficam de fora
{
  const abertas = [
    parcela(100), parcela(50, { scpCode: 9 }), parcela(50, { favoredDocument: '11222333000144' }),
    parcela(50, { favoredName: 'OUTRO FORNECEDOR LTDA' }),
  ];
  assert.equal(findSomaParcelasMatch(abertas, { ...base, valor: 150 }), null, 'sobra 1 parcela só: não se aplica');
}

// 6) muitas parcelas (53) não travam e achar uma combinação única continua funcionando
{
  const abertas = [];
  for (let i = 0; i < 50; i += 1) abertas.push(parcela(50)); // iguais: nunca únicas
  abertas.push(parcela(115), parcela(643.36), parcela(837));
  const t0 = Date.now();
  const r = findSomaParcelasMatch(abertas, { ...base, valor: 115 + 643.36 + 837 });
  assert.equal(r.status, 'unica');
  assert.ok(Date.now() - t0 < 3000, 'busca rápida');
  // mas qualquer valor que dependa das parcelas de R$ 50 repetidas é ambíguo
  assert.equal(findSomaParcelasMatch(abertas, { ...base, valor: 115 + 100 }).status, 'ambigua');
}

// 7) parcela maior que o comprovante é ignorada
{
  const r = findSomaParcelasMatch([parcela(5000), parcela(60), parcela(40)], { ...base, valor: 100 });
  assert.equal(r.status, 'unica');
  assert.equal(r.invoices.length, 2);
}

console.log('test-baixa-soma-parcelas: OK');
