import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isDesiredStateApplied,
  shouldClearOperationalRules,
} from '../supabase/functions/_shared/grm-liberacao-policy.ts';

test('preserva colaborador autorizado hoje', () => {
  const autorizados = new Set(['06333911909']);
  assert.equal(shouldClearOperationalRules('06333911909', autorizados), false);
});

test('preserva colaborador com programação futura na janela ativa', () => {
  const autorizados = new Set(['06333911909']);
  assert.equal(shouldClearOperationalRules('06333911909', autorizados), false);
});

test('limpa somente CPF ausente de toda a janela ativa', () => {
  const autorizados = new Set(['11111111111']);
  assert.equal(shouldClearOperationalRules('06333911909', autorizados), true);
});

test('não gera limpeza para CPF inválido', () => {
  assert.equal(shouldClearOperationalRules('', new Set()), false);
});

test('não considera LIMPO como conclusão de APLICAR mesmo com hash igual', () => {
  assert.equal(isDesiredStateApplied('APLICAR', 'hash-almoco', 'hash-almoco', 'LIMPO'), false);
});

test('considera APLICADO como conclusão de APLICAR', () => {
  assert.equal(isDesiredStateApplied('APLICAR', 'hash-almoco', 'hash-almoco', 'APLICADO'), true);
});

test('considera LIMPO como conclusão de LIMPAR', () => {
  assert.equal(isDesiredStateApplied('LIMPAR', 'hash-limpar', 'hash-limpar', 'LIMPO'), true);
});
