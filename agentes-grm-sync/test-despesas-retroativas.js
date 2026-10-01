'use strict';
const assert = require('assert');
const {
  norm,
  requiredExpenses,
  decide,
  decidePernoite,
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

// Despesas-base continuam exigindo produção/laudo.
assert.deepEqual(requiredExpenses('Efetivo', 100, types), []);
assert.deepEqual(
  requiredExpenses('Intermitente', 105, types).map((x) => [x.oexCode, x.amount]),
  [[63, 105]],
);
assert.deepEqual(
  requiredExpenses('Diarista', 95, types).map((x) => [x.oexCode, x.amount]),
  [[65, 95]],
);

// Almoço exige explicitamente Almoço=SIM na programação de alimentação.
assert.deepEqual(
  requiredExpenses('Efetivo', 100, types, {
    programmed: true,
    almocoProgrammed: true,
    hasLaudo: true,
  }).map((x) => [x.oexCode, x.amount]),
  [[13, 30]],
);
assert.deepEqual(
  requiredExpenses('Intermitente', 105, types, {
    programmed: true,
    almocoProgrammed: true,
    hasLaudo: true,
  }).map((x) => [x.oexCode, x.amount]),
  [[63, 105], [13, 30]],
);
assert.deepEqual(
  requiredExpenses('Diarista', 95, types, {
    programmed: true,
    almocoProgrammed: true,
    hasLaudo: true,
  }).map((x) => [x.oexCode, x.amount]),
  [[65, 95], [13, 30]],
);
assert.deepEqual(
  requiredExpenses('Efetivo', 100, types, {
    programmed: true,
    almocoProgrammed: false,
    hasLaudo: true,
  }),
  [],
);
assert.deepEqual(
  requiredExpenses('Efetivo', 100, types, {
    programmed: true,
    almocoProgrammed: true,
    hasLaudo: false,
  }),
  [],
);

// Café nunca entra apenas por programação genérica ou por laudo.
for (const contractType of ['Efetivo', 'Intermitente', 'Diarista']) {
  assert.equal(
    requiredExpenses(contractType, 100, types).some((x) => norm(x.oexName) === 'CAFE'),
    false,
  );
}
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
    almocoProgrammed: true,
    hasLaudo: true,
    cafeAuthorized: true,
  }).map((x) => [x.oexCode, x.amount]),
  [[63, 105], [13, 30], [14, 10]],
);

// Janta só entra após Programação + laudo >= 19h local.
for (const contractType of ['Efetivo', 'Intermitente', 'Diarista']) {
  assert.equal(
    requiredExpenses(contractType, 100, types).some((x) => norm(x.oexName) === 'JANTA'),
    false,
  );
}
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
    almocoProgrammed: true,
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

console.log('OK: Almoço exige programação específica; Café e Janta mantêm autorizações operacionais próprias');

// Pernoite: aprova só a pendência lançada pelo colaborador, se programado e sem refeição no dia.
const mov = (oexName, ofmStatus, ofmCode) => ({ ofmType: 'D', oexName, ofmStatus, ofmCode });
assert.equal(decidePernoite([mov('Almoço', 'P', 1)], { programado: true }), null);
assert.equal(decidePernoite([mov('Pernoite', 'A', 1)], { programado: true }), null);
assert.equal(decidePernoite([mov('Pernoite', 'N', 1)], { programado: true }), null);
assert.equal(decidePernoite([mov('Pernoite', 'P', 1)], { programado: false }).motivo, 'sem_pernoite_na_programacao');
assert.equal(decidePernoite([mov('Pernoite', 'P', 1)], { programado: true }).action, 'APPROVE');
for (const refeicao of ['Café', 'Almoço', 'Janta']) {
  for (const status of ['P', 'A']) {
    assert.equal(
      decidePernoite([mov('Pernoite', 'P', 1), mov(refeicao, status, 2)], { programado: true }).action,
      'PERNOITE_BLOQUEADO',
      `${refeicao} ${status} deve bloquear o Pernoite`,
    );
  }
}
// Refeição recusada (N) não conta como lançamento.
assert.equal(
  decidePernoite([mov('Pernoite', 'P', 1), mov('Almoço', 'N', 2)], { programado: true }).action,
  'APPROVE',
);
// Pernoite duplicado: aprova o primeiro e devolve o resto como órfão; com um já aprovado, NONE.
const dup = decidePernoite([mov('Pernoite', 'P', 5), mov('Pernoite', 'P', 3)], { programado: true });
assert.equal(dup.row.ofmCode, 3);
assert.equal(dup.orphans.length, 1);
assert.equal(decidePernoite([mov('Pernoite', 'A', 1), mov('Pernoite', 'P', 2)], { programado: true }).action, 'NONE');

console.log('OK: Pernoite só aprova com programação do gestor e sem Café/Almoço/Janta no dia');
