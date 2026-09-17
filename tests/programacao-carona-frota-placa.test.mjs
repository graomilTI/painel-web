import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Carona - Frota usa a placa ativa da supervisão sem exigir outro Motorista Frota', async () => {
  const source = await read('assets/js/programacao-carona-motorista.js');

  assert.match(source, /ensureVehicleSelect\(tr, displacementRows, 'Carona - Frota'\)/);
  assert.match(source, /Agora selecione a placa ATIVA da supervisão para confirmar Carona - Frota/);
  assert.doesNotMatch(source, /Defina primeiro um MOTORISTA FROTA/);
  assert.doesNotMatch(source, /driverOptions|hasDriverForRow|driversByProgram/);
});

test('trigger valida Patrimônios, mas não procura linha separada de Motorista Frota', async () => {
  const migration = await read('supabase/migrations/20260917144205_programacao_carona_frota_definida_por_placa.sql');

  assert.match(migration, /v_tipo in \('MOTORISTA FROTA', 'CARONA FROTA'\)/);
  assert.match(migration, /from public\.vw_patrimonios_atual p/);
  assert.doesNotMatch(migration, /if v_tipo = 'CARONA FROTA'/);
  assert.doesNotMatch(migration, /from public\.programacao_deslocamento [dm]/);
});

test('Programação carrega a versão corrigida do seletor de placa', async () => {
  const html = await read('programacao.html');
  assert.match(html, /programacao-carona-motorista\.js\?v=20260917-v6-carona-por-placa/);
});
