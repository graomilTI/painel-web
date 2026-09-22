import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.SUPABASE_URL ||= 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'teste-chave-local';

const require = createRequire(import.meta.url);
const { selecionarUmPendentePorLocal } = require('../agentes-grm-sync/grm-sync-lancar-nhe.js');

test('mantem somente uma OS quando duas pendencias pertencem ao mesmo local', () => {
  const resultado = selecionarUmPendentePorLocal([
    { os: '92002', funcionario: 'MARIELE', grupoLocal: 'embarque:CEREAIS SUL IND. - BURITIS' },
    { os: '92001', funcionario: 'MARIELE', grupoLocal: 'embarque:CEREAIS SUL IND. - BURITIS' },
  ]);

  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].os, '92001');
  assert.equal('grupoLocal' in resultado[0], false);
});

test('preserva uma pendencia para cada local diferente', () => {
  const resultado = selecionarUmPendentePorLocal([
    { os: '92001', funcionario: 'MARIELE', grupoLocal: 'embarque:LOCAL A' },
    { os: '92002', funcionario: 'MARIELE', grupoLocal: 'embarque:LOCAL B' },
  ]);

  assert.deepEqual(resultado.map((item) => item.os), ['92001', '92002']);
});

test('prioriza no local a OS que possui funcionario para permitir a geofence', () => {
  const resultado = selecionarUmPendentePorLocal([
    { os: '92001', funcionario: '', grupoLocal: 'embarque:LOCAL A' },
    { os: '92002', funcionario: 'MARIELE', grupoLocal: 'embarque:LOCAL A' },
  ]);

  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].os, '92002');
});

