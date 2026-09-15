import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../assets/js/programacao-lista-drawer.js', import.meta.url), 'utf8');

test('gaveta da Lista de O.S. não perde o colaborador confirmado de O.S. reaproveitada ao clicar Carregar', () => {
  // Regressão: recarregarEquipeRows() (chamada por carregarLista/"Carregar" e
  // por refreshAposAcao) buscava programacao_equipe só pelo programacao_id de
  // HOJE. Numa O.S. ainda ATENDER de outro dia (ex.: 92659, Londrina — relato
  // do Jean Carlos, 15/09/2026), a confirmação real (JULIO CESAR FERREIRA DE
  // OLIVEIRA) fica sob o programacao_id de ONTEM — a gaveta achava que a O.S.
  // não tinha ninguém confirmado e caía pro estado de "candidato sugerido"
  // (Ademar) a cada clique em Carregar, escondendo quem já estava atendendo
  // de verdade. Mesmo helper loadEquipeReaproveitada já usado pelo card de
  // Despesas (ver tests/programacao-os-reaproveitada-card.test.mjs).
  assert.match(source, /loadEquipeReaproveitada\s*\}\s*from\s*'\.\/programacao-despesas\.js/);
  assert.match(source, /const hoje = await loadEquipeExistente\(programacaoIdQuery\);/);
  assert.match(source, /const osIdsDoDia = new Set\(hoje\.filter/);
  assert.match(
    source,
    /const reaproveitada = await loadEquipeReaproveitada\(supervisaoQuery, osIdsDoDia, programacaoIdQuery\);/,
  );
  assert.match(source, /equipeRowsAtual = \[\.\.\.hoje, \.\.\.reaproveitada\];/);
});
