import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../assets/js/programacao-despesas.js', import.meta.url), 'utf8');

test('confirmação reaproveitada reancora despesas já salvas com a data de hoje no programacao_id antigo', () => {
  assert.match(source, /async function reancorarDespesasJaLancadas\(movimentos\)/);
  assert.match(source, /reancoragens\.push\(\{ origemId: row\.programacao_id, destinoId: programacaoIdHoje, colaboradorId: row\.colaborador_id \}\)/);
  assert.match(source, /await reancorarDespesasJaLancadas\(reancoragens\)/);

  for (const tabela of ['programacao_alimentacao', 'programacao_estadia', 'programacao_deslocamento']) {
    assert.match(source, new RegExp(`['"]${tabela}['"]`));
  }
  assert.match(source, /from\('programacao_extras'\)[\s\S]*?\.update\(\{ programacao_id: grupo\.destinoId \}\)[\s\S]*?\.eq\('data_referencia', grupo\.dataReferencia\)/);
});

test('reancoragem protege linha que já existe no destino das tabelas com chave única', () => {
  assert.match(source, /const jaNoDestino = new Set/);
  assert.match(source, /const idsSemColisao = colaboradorIds\.filter\(\(id\) => !jaNoDestino\.has\(id\)\)/);
  assert.match(source, /\.in\('colaborador_id', idsSemColisao\)/);
});
