import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../assets/js/programacao-despesas.js', import.meta.url), 'utf8');

test('confirmação de O.S. reaproveitada é gravada de verdade para hoje, não só exibida', () => {
  // Regressão do fix anterior (55e0b8a9/b91a83bc): loadEquipeReaproveitada()
  // devolvia a confirmação de ONTEM só pra exibição, então uma despesa nova
  // (ex.: Almoço marcado hoje) era salva com data_referencia=hoje mas
  // programacao_id=ontem — e a publicação pro GRM (grm-liberacao-despesas-
  // publicar) só olha o programacao_id de HOJE, então a despesa nunca saía
  // da fila (achado 15/09/2026, Kawan Egon, O.S. 92489). Agora, quando existe
  // programacao_id de hoje pra supervisão da O.S., a confirmação é
  // upsertada de verdade pra hoje — toda escrita nova usa o id certo.
  assert.match(source, /const programacaoIdHojePorSupervisao = new Map\(\);/);
  assert.match(source, /if \(programacaoIdHoje && String\(programacaoIdHoje\) !== String\(row\.programacao_id\)\)/);
  assert.match(
    source,
    /\.from\('programacao_equipe'\)\s*\n\s*\.upsert\(paraLevarPraHoje, \{ onConflict: 'programacao_id,os_id,colaborador_id' \}\)/,
  );
});
