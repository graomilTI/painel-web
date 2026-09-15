import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Programação usa Particular como deslocamento padrão e não oferece a opção não definida', async () => {
  const source = await read('assets/js/programacao-despesas.js');

  assert.match(source, /const TIPO_DESLOC_DEFAULT = 'PARTICULAR\/CARONA CAMINHÃO'/);
  assert.match(source, /const tipoDesl = des\.tipo_deslocamento \|\| TIPO_DESLOC_DEFAULT/);
  assert.doesNotMatch(source, /<option value=""[^>]*>— não definido —<\/option>/);
  assert.match(source, /tipo_deslocamento: card\.querySelector\('\[data-fld="tipo_deslocamento"\]'\)\?\.value \|\| TIPO_DESLOC_DEFAULT/);
});

test('despesa compartilhada vazia também preserva o padrão Particular', async () => {
  const source = await read('assets/js/programacao-despesas-os-visual-fix.js');

  assert.match(source, /des\.tipo_deslocamento \|\| TIPO_DESLOC_DEFAULT/);
});

test('referências da tela usam a versão nova dos módulos de deslocamento/despesas', async () => {
  const [programacao, drawer, fluxo, pdf, router, html] = await Promise.all([
    read('assets/js/programacao.js'),
    read('assets/js/programacao-lista-drawer.js'),
    read('assets/js/programacao-gestor-fluxo-avancado.js'),
    read('assets/js/programacao-pdf-tipo-fix.js'),
    read('assets/js/router.js'),
    read('programacao.html'),
  ]);

  for (const source of [programacao, drawer, fluxo, pdf, router, html]) {
    assert.match(source, /20260915-reaproveitada-card6/);
  }
});
