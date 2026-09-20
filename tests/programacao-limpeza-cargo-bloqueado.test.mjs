import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../assets/js/programacao.js', import.meta.url), 'utf8');

test('limpeza de cargo bloqueado (Auditor/Administrativo) remove só o vínculo do colaborador bloqueado', () => {
  // Regressão: antes a exclusão de operacional_os_colaboradores filtrava só
  // por os_id, apagando também colaboradores válidos que dividiam a mesma
  // O.S. com um colaborador de cargo bloqueado (achado: O.S. 92489 perdendo
  // colaborador "Efetivo", 2026-09-14).
  assert.match(source, /osColabPares\s*=\s*rows\s*\n\s*\.filter\(\(r\) => r\.os_id && r\.colaborador_id\)/);
  assert.match(
    source,
    /originalFrom\('operacional_os_colaboradores'\)\s*\n\s*\.delete\(\)\s*\n\s*\.eq\('os_id', p\.osId\)\s*\n\s*\.eq\('colaborador_key', p\.colaboradorId\)/,
  );
  assert.doesNotMatch(source, /originalFrom\('operacional_os_colaboradores'\)\.delete\(\)\.in\('os_id', osIds\)/);
});
