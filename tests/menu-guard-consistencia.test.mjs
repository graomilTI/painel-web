import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// O menu (menuBuilder) decide o que aparece na sidebar e o authGuard decide se o clique abre ou
// redireciona para a primeira página liberada. Quando as duas regras divergem, o item aparece mas
// o clique "cai" em outra tela. Estes testes travam as duas divergências já corrigidas.

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFileSync(new URL(caminho, raiz), 'utf8');

test('Bônus: o menu usa a mesma regra do guard (só a permissão própria)', () => {
  const guard = ler('assets/js/authGuard.js');
  const menu = ler('assets/js/menuBuilder.js');
  assert.match(guard, /itemCode === 'conferencia_bonus'[\s\S]{0,80}allowedCodes\.has\('conferencia_bonus'\)/);
  assert.match(menu, /normalizeCode\(item\?\.code\) === 'conferencia_bonus'[\s\S]{0,80}allowedCodes\.has\('conferencia_bonus'\)/);
});

test('Auditoria do Gestor: item injetado no menu também é liberado pelo guard', () => {
  const guard = ler('assets/js/authGuard.js');
  const menu = ler('assets/js/menuBuilder.js');
  assert.match(menu, /code: 'auditoria_gestor'[\s\S]{0,120}path: 'auditoria'/);
  assert.match(guard, /AUDITORIA_GESTOR_ITEM = \{ code: 'auditoria_gestor'[^}]*path: 'auditoria'/);
  // contexto Gestor e contexto por módulos concatenam o item na lista permitida
  assert.equal((guard.match(/AUDITORIA_GESTOR_ITEM/g) || []).length, 3);
});
