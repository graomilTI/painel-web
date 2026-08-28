'use strict';
const assert = require('assert');
const {
  norm,
  requiredExpenses,
  decide,
  assertDirectExpenseAllowed,
} = require('./grm-sync-despesas-retroativas');

const types = new Map([
  ['ALMOCO', { oexCode: 13, oexName: 'Almoço', oexMaxOperatingFlowValue: 30 }],
  ['CAFE', { oexCode: 14, oexName: 'Café', oexMaxOperatingFlowValue: 10 }],
  ['SALARIO DE INTERMITENTE', { oexCode: 63, oexName: 'Salário de Intermitente' }],
  ['SERVICOS TERCEIRIZADOS', { oexCode: 65, oexName: 'Serviços Terceirizados' }],
]);

assert.equal(norm('Salário de Intermitente'), 'SALARIO DE INTERMITENTE');
assert.deepEqual(requiredExpenses('Efetivo', 100, types).map((x) => x.oexCode), [13]);
assert.deepEqual(requiredExpenses('Intermitente', 105, types).map((x) => [x.oexCode, x.amount]), [[63, 105], [13, 30]]);
assert.deepEqual(requiredExpenses('Diarista', 95, types).map((x) => [x.oexCode, x.amount]), [[65, 95], [13, 30]]);

assert.deepEqual(requiredExpenses('Efetivo', 100, types, { programmed: false }), []);
assert.deepEqual(requiredExpenses('Intermitente', 105, types, { programmed: false }).map((x) => [x.oexCode, x.amount]), [[63, 105]]);
assert.deepEqual(requiredExpenses('Diarista', 95, types, { programmed: false }).map((x) => [x.oexCode, x.amount]), [[65, 95]]);

// Café nunca entra apenas por programação genérica ou por laudo.
for (const contractType of ['Efetivo', 'Intermitente', 'Diarista']) {
  assert.equal(
    requiredExpenses(contractType, 100, types).some((x) => norm(x.oexName) === 'CAFE'),
    false,
  );
}

// Café entra somente quando a autorização operacional já foi validada
// (Programação + login 04h-07h + geofence do ponto).
assert.deepEqual(
  requiredExpenses('Efetivo', 100, types, {
    programmed: true,
    hasLaudo: false,
    cafeAuthorized: true,
  }).map((x) => [x.oexCode, x.amount]),
  [[14, 10]],
);

assert.deepEqual(
  requiredExpenses('Intermitente', 105, types, {
    programmed: true,
    hasLaudo: true,
    cafeAuthorized: true,
  }).map((x) => [x.oexCode, x.amount]),
  [[63, 105], [13, 30], [14, 10]],
);

assert.throws(
  () => assertDirectExpenseAllowed(types.get('CAFE')),
  (error) => error?.code === 'CAFE_SEM_AUTORIZACAO_OPERACIONAL',
);
assert.doesNotThrow(() => assertDirectExpenseAllowed(types.get('CAFE'), { cafeAuthorized: true }));
assert.doesNotThrow(() => assertDirectExpenseAllowed(types.get('ALMOCO')));

assert.equal(decide([{ ofmStatus: 'A' }]).action, 'NONE');
assert.equal(decide([{ ofmStatus: 'P', ofmCode: 2 }]).action, 'APPROVE');
assert.equal(decide([{ ofmStatus: 'N' }]).action, 'CREATE');
assert.equal(decide([]).action, 'CREATE');

console.log('OK: Café exige autorização operacional; demais regras preservadas');
