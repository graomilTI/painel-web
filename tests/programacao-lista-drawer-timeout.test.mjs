import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../assets/js/programacao-lista-drawer.js', import.meta.url), 'utf8');

test('carregarLista tem limite de tempo e botão Tentar novamente (spinner nunca fica eterno)', () => {
  assert.match(source, /LISTA_TIMEOUT_MS\s*=\s*\d+/);
  assert.match(source, /comLimiteDeTempo\(Promise\.all\(\[/);
  assert.match(source, /data-pld-recarregar-lista/);
  assert.match(source, /closest\('\[data-pld-recarregar-lista\]'\)\)[^\n]*carregarLista\(/);
});

test('carregarLista registra o tempo de cada etapa e ignora carga superada por outra', () => {
  assert.match(source, /medirEtapa\('os'/);
  assert.match(source, /medirEtapa\('equipe'/);
  assert.match(source, /seq !== cargaListaSeq/);
});
