import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('registra uma ação nos Logs de Usuários quando a programação é duplicada', async () => {
  const source = await read('assets/js/programacao.js');

  assert.match(source, /if \(copiadas\.length\) \{\s*logActivity\('action', 'programacao_duplicada', 'programacao'/s);
  assert.match(source, /programacao_origem_id: state\.programacaoId/);
  assert.match(source, /data_origem: state\.dataReferencia/);
  assert.match(source, /datas_copiadas: copiadas/);
  assert.match(source, /datas_preservadas: ignoradas/);
  assert.match(source, /copiar_estadias: el\.duplicateCopyStays\.checked/);
});

test('atualiza a versão do módulo para entregar o novo registro sem cache antigo', async () => {
  const router = await read('assets/js/router.js');
  // A versão de programacao.js muda a cada fix subsequente que toca o
  // arquivo (ver também programacao-deslocamento-default.test.mjs) — checa
  // a versão atual, não a original desta feature, pra não travar em cache
  // antigo depois de outro fix legítimo bumpar de novo.
  assert.match(router, /programacao\.js\?v=20260915-despesa-compartilhada1/);
});
