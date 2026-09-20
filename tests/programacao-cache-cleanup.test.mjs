import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const arquivosLegados = [
  'assets/js/programacao-compartilhar-os-fix.js',
  'assets/js/programacao-despesas-os-visual-fix.js',
  'assets/js/programacao-duplicar-hoje-fix.js',
  'assets/js/programacao-equipe-os-atual-fix.js',
  'assets/js/programacao-persistencia-contexto-fix.js',
  'assets/js/programacao-runtime-fixes.js',
  'assets/css/programacao-kpi-inline-patch.css',
];

test('artefato da Programação não contém os fixes substituídos', () => {
  for (const path of arquivosLegados) {
    assert.equal(existsSync(new URL(path, root)), false, `${path} não deve voltar ao deploy`);
  }
});

test('Programação carrega por uma única entrada consolidada', () => {
  const html = read('programacao.html');
  const scripts = [...html.matchAll(/<script\s+type="module"\s+src="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(scripts, ['./assets/js/programacao.js?v=20260920-consolidado1']);
  assert.doesNotMatch(html, /(?:fix|hotfix|patch)\.js/i);
});

test('service worker invalida o cache anterior à consolidação', () => {
  assert.match(read('sw.js'), /const CACHE_NAME = 'g1000-painel-pwa-v17'/);
  assert.match(read('assets/js/pwa-register.js'), /20260920-programacao-consolidada-v17/);
  assert.match(read('assets/js/pageInit.js'), /pwa-register\.js\?v=20260920-cache-v17/);
});
