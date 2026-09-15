import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const equipe = readFileSync(new URL('../assets/js/programacao-equipe.js', import.meta.url), 'utf8');
const despesas = readFileSync(new URL('../assets/js/programacao-despesas.js', import.meta.url), 'utf8');
const drawer = readFileSync(new URL('../assets/js/programacao-lista-drawer.js', import.meta.url), 'utf8');

test('remover colaborador mantém tombstone confirmado=false para a O.S. não ser restaurada no refresh', () => {
  const remover = equipe.slice(equipe.indexOf('export async function removerConfirmacao'), equipe.indexOf('\n}', equipe.indexOf('export async function removerConfirmacao')) + 2);
  assert.match(remover, /\.update\(\{ confirmado: false \}\)/);
  assert.match(remover, /\.eq\('id', equipeRowId\)\s*\n\s*\.select\('id'\)/);
  assert.doesNotMatch(remover, /\.delete\(\)\.eq\('id', equipeRowId\)/);
});

test('tombstone do dia bloqueia reaproveitamento da confirmação anterior', () => {
  assert.match(despesas, /const osIdsDoDia = new Set\(equipeRows\.filter\(\(r\) => r\.os_id\)/);
  assert.match(drawer, /const osIdsDoDia = new Set\(hoje\.filter\(\(r\) => r\.os_id\)/);
  assert.doesNotMatch(drawer, /hoje\.filter\(\(r\) => r\.confirmado && r\.os_id\)/);
});

test('remover de uma O.S. preserva disponibilidade quando colaborador segue confirmado em outra', () => {
  assert.match(equipe, /\.eq\('programacao_id', programacaoIdEfetivo\)[\s\S]*?\.eq\('confirmado', true\)[\s\S]*?\.neq\('id', equipeRowId\)/);
  assert.match(equipe, /if \(!outrasOs\?\.length\) \{[\s\S]*?disponibilidade: 'SEM EMBARQUE'/);
});
