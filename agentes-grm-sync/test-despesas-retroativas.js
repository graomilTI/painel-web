'use strict';
const assert = require('assert');
const {
  norm,
  requiredExpenses,
  decide,
  assertDirectExpenseAllowed,
  pointOffsetFromSaoPauloHours,
  registerDateAtPoint,
} = require('./grm-sync-despesas-retroativas');

const types = new Map([
  ['ALMOCO', { oexCode: 13, oexName: 'Almoço', oexMaxOperatingFlowValue: 30 }],
  ['CAFE', { oexCode: 14, oexName: 'Café', oexMaxOperatingFlowValue: 10 }],
  ['JANTA', { oexCode: 15, oexName: 'Janta', oexMaxOperatingFlowValue: 30 }],
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

// Janta nunca entra apenas porque existe produção/laudo ou programação genérica.
for (const contractType of ['Efetivo', 'Intermitente', 'Diarista']) {
  assert.equal(
    requiredExpenses(contractType, 100, types).some((x) => norm(x.oexName) === 'JANTA'),
    false,
  );
}

// Janta só entra depois que a validação Programação + laudo >= 19h local foi satisfeita.
assert.deepEqual(
  requiredExpenses('Efetivo', 100, types, {
    programmed: true,
    hasLaudo: false,
    jantaAuthorized: true,
  }).map((x) => [x.oexCode, x.amount]),
  [[15, 30]],
);
assert.deepEqual(
  requiredExpenses('Intermitente', 105, types, {
    programmed: true,
    hasLaudo: true,
    jantaAuthorized: true,
  }).map((x) => [x.oexCode, x.amount]),
  [[63, 105], [13, 30], [15, 30]],
);

assert.throws(
  () => assertDirectExpenseAllowed(types.get('CAFE')),
  (error) => error?.code === 'CAFE_SEM_AUTORIZACAO_OPERACIONAL',
);
assert.doesNotThrow(() => assertDirectExpenseAllowed(types.get('CAFE'), { cafeAuthorized: true }));
assert.throws(
  () => assertDirectExpenseAllowed(types.get('JANTA')),
  (error) => error?.code === 'JANTA_SEM_AUTORIZACAO_OPERACIONAL',
);
assert.doesNotThrow(() => assertDirectExpenseAllowed(types.get('JANTA'), { jantaAuthorized: true }));
assert.doesNotThrow(() => assertDirectExpenseAllowed(types.get('ALMOCO')));

// Conversão do horário-base de São Paulo/Brasília para o horário do ponto.
assert.equal(pointOffsetFromSaoPauloHours('PR', 'Cascavel'), 0);
assert.equal(pointOffsetFromSaoPauloHours('MT', 'Alto Taquari'), -1);
assert.equal(pointOffsetFromSaoPauloHours('AC', 'Rio Branco'), -2);
assert.equal(pointOffsetFromSaoPauloHours('AM', 'Tabatinga'), -2);
assert.deepEqual(registerDateAtPoint('2026-09-01 20:15:00', 'MT', 'Alto Taquari'), {
  ymd: '2026-09-01', time: '19:15:00', hour: 19, offsetHours: -1,
});
assert.deepEqual(registerDateAtPoint('2026-09-01 20:15:00', 'PR', 'Cascavel'), {
  ymd: '2026-09-01', time: '20:15:00', hour: 20, offsetHours: 0,
});

assert.equal(decide([{ ofmStatus: 'A' }]).action, 'NONE');
assert.equal(decide([{ ofmStatus: 'P', ofmCode: 2 }]).action, 'APPROVE');
assert.equal(decide([{ ofmStatus: 'N' }]).action, 'CREATE');
assert.equal(decide([]).action, 'CREATE');

console.log('OK: Café e Janta exigem autorizações operacionais específicas; demais regras preservadas');
