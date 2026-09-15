import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../assets/js/programacao-despesas.js', import.meta.url), 'utf8');

test('despesa liberada sob outra supervisão não some do card ao colaborador ser escalado a uma O.S.', () => {
  // Regressão: loadCustos()/loadExtras() filtram programacao_alimentacao/
  // estadia/deslocamento/extras por programacao_id da supervisão em foco.
  // Se a despesa foi liberada (ex.: modal "Liberar despesas" de Sem O.S.)
  // sob o programacao_id da supervisão de ORIGEM do colaborador e ele depois
  // é escalado a uma O.S. de OUTRA supervisão, o card renderiza sem achar o
  // registro — reportado pela usuária, 2026-09-15. A view
  // programacao_despesas_os_compartilhadas junta por data_referencia +
  // colaborador_id (não depende do programacao_id bater); usamos ela só pra
  // preencher lacunas, nunca pra sobrescrever o que a consulta direta já achou.
  assert.match(
    source,
    /from\('programacao_despesas_os_compartilhadas'\)\s*\n\s*\.select\('despesa_id,tipo_registro,colaborador_id,detalhes'\)\s*\n\s*\.eq\('data_referencia', dataReferencia\)\s*\n\s*\.in\('colaborador_id', colaboradorIds\)/,
  );
  assert.match(source, /if \(mapa && !mapa\.has\(colabId\)\) mapa\.set\(colabId, row\.detalhes \|\| \{\}\);/);
  assert.match(
    source,
    /await complementarComDespesasCompartilhadas\(custos, extrasPorColab, options\.dataReferencia, colaboradorIds\);/,
  );
});
