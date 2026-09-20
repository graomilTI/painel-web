import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const equipe = readFileSync(new URL('../assets/js/programacao-equipe.js', import.meta.url), 'utf8');
const drawer = readFileSync(new URL('../assets/js/programacao-lista-drawer.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../programacao.html', import.meta.url), 'utf8');

test('equipe da O.S. cai para a programação mais recente até a data aberta', () => {
  assert.match(equipe, /ordenadas\.find\(\(row\) => String\(row\.data_referencia\)\.slice\(0, 10\) === dataReferencia\)/);
  assert.match(
    equipe,
    /\|\| ordenadas\.find\(\(row\) => String\(row\.data_referencia\)\.slice\(0, 10\) <= dataReferencia\)/,
  );
  assert.doesNotMatch(
    equipe,
    /return ordenadas\.find\(\(row\) => String\(row\.data_referencia\)\.slice\(0, 10\) === dataReferencia\) \|\| null;/,
  );
});

test('drawer usa diretamente a implementação consolidada de programacao-equipe', () => {
  assert.match(drawer, /from '\.\/programacao-equipe\.js\?v=20260920-equipe-contexto1';/);
  assert.doesNotMatch(html, /type="importmap"/);
  assert.match(equipe, /\.from\('programacao_equipe_ultima'\)/);
});
