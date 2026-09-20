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
  const source = await read('assets/js/programacao-despesas-os-visual.js');

  assert.match(source, /des\.tipo_deslocamento \|\| TIPO_DESLOC_DEFAULT/);
});

test('carregamento direto e navegação interna usam a versão consolidada', async () => {
  const [programacao, drawer, router, html] = await Promise.all([
    read('assets/js/programacao.js'),
    read('assets/js/programacao-lista-drawer.js'),
    read('assets/js/router.js'),
    read('programacao.html'),
  ]);

  assert.match(programacao, /programacao-despesas\.js\?v=20260917-deslocamento-persistido1/);
  assert.match(programacao, /programacao-despesas-os-visual\.js\?v=20260920-integrado1/);
  assert.match(drawer, /programacao-despesas\.js\?v=20260917-deslocamento-persistido1/);
  assert.match(router, /programacao\.js\?v=20260920-consolidado1/);
  assert.match(html, /programacao\.js\?v=20260920-consolidado1/);
});

test('gaveta da O.S. restaura o deslocamento salvo para o colaborador na data', async () => {
  const [despesas, drawer] = await Promise.all([
    read('assets/js/programacao-despesas.js'),
    read('assets/js/programacao-lista-drawer.js'),
  ]);

  assert.match(despesas, /export async function complementarComDespesasCompartilhadas/);
  assert.match(
    drawer,
    /await complementarComDespesasCompartilhadas\(custos, extrasPorColab, options\.dataReferencia, colaboradorIds\);/,
  );
});
