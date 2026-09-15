import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../assets/js/programacao-despesas.js', import.meta.url), 'utf8');

test('colaborador de O.S. ainda ATENDER de outro dia continua com card na Etapa 3 (O.S. reaproveitada)', () => {
  // Regressão: O.S. que segue ATENDER de um dia pro outro (ex.: 92611/92659,
  // Londrina, 15/09/2026 — relatos de Jean Carlos e outros gestores) fica
  // confirmada só sob o programacao_id de ONTEM. loadEquipeExistente(hoje)
  // não a acha, então o card da Etapa 3 simplesmente não aparecia pra esse
  // colaborador — parecia que ele "não tinha sido salvo", mas na verdade nem
  // tinha card renderizado. loadEquipeReaproveitada() busca qualquer O.S.
  // ainda ATENDER da(s) supervisão(ões) em foco que não apareceu no dia de
  // hoje, e usa a confirmação mais recente de qualquer dia.
  assert.match(source, /export async function loadEquipeReaproveitada\(supervisaoQuery, osIdsDoDia, programacaoIdQuery\)/);
  assert.match(source, /\.from\('operacional_os'\)\.select\('id, supervisao'\)\.eq\('status_gestor', 'ATENDER'\)/);
  assert.match(source, /export async function loadRosterDoDia\(programacaoIdQuery, supervisaoQuery\)/);
  assert.match(
    source,
    /const equipeReaproveitada = await loadEquipeReaproveitada\(supervisaoQuery, osIdsDoDia, programacaoIdQuery\);/,
  );
});

test('todo consumidor de loadRosterDoDia passa supervisaoQuery (senão a O.S. reaproveitada fica sem card de novo)', async () => {
  const { readFile } = await import('node:fs/promises');
  const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const [programacao, pdfFix] = await Promise.all([
    read('assets/js/programacao.js'),
    read('assets/js/programacao-pdf-tipo-fix.js'),
  ]);
  for (const src of [source, programacao, pdfFix]) {
    assert.doesNotMatch(src, /loadRosterDoDia\(programacaoIdQuery\)/);
  }
});
