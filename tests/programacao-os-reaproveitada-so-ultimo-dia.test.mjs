import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../assets/js/programacao-despesas.js', import.meta.url), 'utf8');

test('loadEquipeReaproveitada traz só a confirmação mais recente por O.S., não o histórico inteiro', () => {
  // Regressão do próprio fix anterior: loadEquipeReaproveitada() buscava
  // TODO confirmado=true pra os_id sem filtrar por dia, então uma O.S.
  // reaproveitada por semanas (ex.: 61744 — 30 programações distintas, 166
  // linhas confirmadas, 11 colaboradores diferentes ao longo do tempo)
  // aparecia "lotada" com todo mundo que já passou por ela algum dia (achado
  // 15/09/2026, logo depois do fix anterior ir ao ar). Só o programacao_id
  // mais recentemente atualizado por os_id deve sobrar — o resto do
  // histórico é descartado.
  assert.match(source, /const programacaoIdVencedorPorOs = new Map\(\);/);
  assert.match(
    source,
    /if \(!programacaoIdVencedorPorOs\.has\(osId\)\) programacaoIdVencedorPorOs\.set\(osId, String\(row\.programacao_id\)\);/,
  );
  assert.match(
    source,
    /const ultimasConfirmacoes = \(data \|\| \[\]\)\.filter\(\(row\) => programacaoIdVencedorPorOs\.get\(String\(row\.os_id\)\) === String\(row\.programacao_id\)\);/,
  );
});
