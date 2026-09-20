import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../assets/js/programacao.js', import.meta.url), 'utf8');

test('liberação de despesas publica em poucos segundos de inatividade, não mais em 5 minutos', () => {
  // Pedido do usuário (15/09/2026): reduzir a latência de "despesa marcada
  // no painel" -> "chega no GRM" sem tocar nas proteções contra concorrência
  // já existentes (fila versionada por hash + claim atômico no worker,
  // guard de publishing simultâneo, dedup de 15s por contexto+motivo). Só o
  // timer de inatividade no navegador mudou.
  assert.match(source, /const IDLE_MS = 4000;/);
  assert.doesNotMatch(source, /const IDLE_MS = 5 \* 60 \* 1000;/);

  // O reason enviado à Edge Function continua o mesmo valor aceito por
  // VALID_REASONS ali (evita precisar redeploy da function só por causa do
  // texto do motivo).
  assert.match(source, /publishVersion\('INATIVIDADE_5_MIN', \{ settleMs: SETTLE_MS \}\)/);

  // As proteções contra concorrência já existentes não foram tocadas.
  assert.match(source, /if \(publishing\) return null;/);
  assert.match(source, /Date\.now\(\) - lastPublishedAt < 15000/);
});
