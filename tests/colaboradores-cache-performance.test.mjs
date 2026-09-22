import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../assets/js/colaboradoresCache.js', import.meta.url), 'utf8');
const consultaSource = readFileSync(new URL('../assets/js/consultarColaboradores.js', import.meta.url), 'utf8');

test('cache de colaboradores nao assina tabela de alta frequencia', () => {
  assert.match(source, /sessionStorage\.getItem\(CACHE_KEY\)/);
  assert.match(source, /sessionStorage\.setItem\(CACHE_KEY/);
  assert.doesNotMatch(source, /\.channel\(['"]colaboradores-cache-invalidacao['"]\)/);
  assert.doesNotMatch(source, /postgres_changes[\s\S]{0,160}table:\s*['"]colaboradores['"]/);
});

test('consulta ao vivo acompanha apenas o journal de alteracoes', () => {
  assert.match(consultaSource, /table:\s*['"]colaboradores_alteracoes['"]/);
  assert.doesNotMatch(consultaSource, /table:\s*['"]colaboradores['"]/);
});

test('invalidacao explicita cruza abas sem persistir os dados pessoais fora da sessao', () => {
  assert.match(source, /localStorage\.setItem\(INVALIDATION_KEY, String\(Date\.now\(\)\)\)/);
  assert.match(source, /ts < invalidatedAt/);
  assert.doesNotMatch(source, /localStorage\.setItem\(CACHE_KEY/);
  assert.match(source, /sessionStorage\.removeItem\(PREVIOUS_CACHE_KEY\)/);
  assert.match(source, /sessionStorage\.removeItem\(LEGACY_CACHE_KEY\)/);
});
