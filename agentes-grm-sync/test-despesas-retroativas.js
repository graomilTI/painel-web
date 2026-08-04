'use strict';
const assert = require('assert');
const { norm, requiredExpenses, decide } = require('./grm-sync-despesas-retroativas');
const types = new Map([
  ['ALMOCO', { oexCode: 13, oexName: 'Almoço', oexMaxOperatingFlowValue: 30 }],
  ['SALARIO DE INTERMITENTE', { oexCode: 63, oexName: 'Salário de Intermitente' }],
  ['SERVICOS TERCEIRIZADOS', { oexCode: 65, oexName: 'Serviços Terceirizados' }],
]);
assert.equal(norm('Salário de Intermitente'), 'SALARIO DE INTERMITENTE');
assert.deepEqual(requiredExpenses('Efetivo', 100, types).map((x) => x.oexCode), [13]);
assert.deepEqual(requiredExpenses('Intermitente', 105, types).map((x) => [x.oexCode, x.amount]), [[63, 105], [13, 30]]);
assert.deepEqual(requiredExpenses('Diarista', 95, types).map((x) => [x.oexCode, x.amount]), [[65, 95], [13, 30]]);
assert.equal(decide([{ ofmStatus: 'A' }]).action, 'NONE');
assert.equal(decide([{ ofmStatus: 'P', ofmCode: 2 }]).action, 'APPROVE');
assert.equal(decide([{ ofmStatus: 'N' }]).action, 'CREATE');
console.log('OK: regras de despesas retroativas');
