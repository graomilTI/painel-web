import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('filtros de regional/categoria/prioridade vão pro banco (não filtram só as linhas carregadas)', async () => {
  const src = await read('assets/js/emails.js');
  assert.match(src, /function emailQuery\(/);
  assert.match(src, /q = q\.in\('prioridade'/);
  assert.match(src, /q = q\.in\('categoria'/);
  assert.match(src, /REGIONAL_PATTERNS/);
  // o submit lê os selects criados pelo emails-layout.js
  assert.match(src, /getElementById\('emV3Regional'\)/);
  const layout = await read('assets/js/emails-layout.js');
  assert.doesNotMatch(layout, /texto\.includes\(a\)/, 'layout não deve mais filtrar por texto das linhas');
  assert.match(layout, /requestSubmit/);
});

test('regional cobre as grafias reais do banco (Maringa e Terminais, SP - Avaré, MT1 - Geral...)', async () => {
  const src = await read('assets/js/emails.js');
  const block = src.match(/const REGIONAL_PATTERNS = (\{[\s\S]*?\n\});/)[1];
  const patterns = new Function(`return ${block}`)();
  const like = (p, v) => new RegExp('^' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 'i').test(v);
  const casa = (opcao, valor) => patterns[opcao].some((p) => like(p, valor));
  assert.equal(casa('PR MARINGA', 'Maringa e Terminais'), true);
  assert.equal(casa('PR MARINGA', 'PR MARINGA'), true);
  assert.equal(casa('SAO PAULO', 'SP - Avaré'), true);
  assert.equal(casa('MATO GROSSO MT1', 'MATO GROSSO MT1 - Sinop'), true);
  assert.equal(casa('MATO GROSSO MT1', 'MATO GROSSO MT2 - Sul'), false);
  assert.equal(casa('PARAGUAI', 'PARA'), false);
  assert.equal(casa('GOIAS', 'GOIAS 1 - Rio Verde'), true);
});

test('rótulo de categoria entende LOGISTICA/NOTAS_FISCAIS como o banco grava', async () => {
  const src = await read('assets/js/emails.js');
  const key = new Function('value', `return ${src.match(/function categoriaKey\(value\) \{\s*return ([^;]+);/)[1]};`);
  assert.equal(key('LOGÍSTICA'), key('LOGISTICA'));
  assert.equal(key('NOTAS_FISCAIS'), key('NOTAS FISCAIS'));
});

test('triagem em lote: seleção, todo o filtro com teto, histórico por e-mail e desfazer', async () => {
  const src = await read('assets/js/emails.js');
  assert.match(src, /const BULK_MAX = 2000/);
  assert.match(src, /async function bulkApply\(/);
  assert.match(src, /async function bulkUndo\(/);
  assert.match(src, /from\('email_historico'\)\.insert\(chunk\.map/);
  assert.match(src, /em-bulkbar \[hidden\]\{display:none!important\}/, 'atributo hidden precisa vencer o display:flex da barra');
  assert.match(src, /Carregar mais/);
});

test('resolver/arquivar abre o próximo e-mail e há atalhos J/K/E/Y/X que ignoram campos de texto', async () => {
  const src = await read('assets/js/emails.js');
  assert.match(src, /async function applyStatusAction\(/);
  assert.match(src, /await selectEmail\(neighbor\.id\)/);
  assert.match(src, /input:not\(\.em-rowcheck\),textarea,select/);
});

test('modo foco não reescreve o DOM ocioso (isso travava o debounce do emails-layout.js)', async () => {
  const focus = await read('assets/js/emails-focus.js');
  assert.match(focus, /b\.textContent!==tx\(a\)/);
  assert.match(focus, /c\.dataset\.k==='__vazio'/);
});
