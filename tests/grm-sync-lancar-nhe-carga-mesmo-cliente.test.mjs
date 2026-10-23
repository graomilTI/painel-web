import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.SUPABASE_URL ||= 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'teste-chave-local';

const require = createRequire(import.meta.url);
const { calcularPendentes } = require('../agentes-grm-sync/grm-sync-lancar-nhe.js');

// As linhas chegam ao agente com os cabeçalhos já normalizados (normHeader: maiúsculas, sem acento/pontuação).
const EMBARQUE = 'BA - SÃO DESIDÉRIO (FAZENDA CASA REAL)';

function osCadastro(numero, cliente) {
  return {
    numero_os: numero, data_os: '2026-01-01', status_gestor: null, cliente, embarque: EMBARQUE,
    ponto1_nome: 'FAZENDA CASA REAL', ponto1_latitude: -12.3, ponto1_longitude: -44.9,
    servico: 'Classificação FOB', supervisao: 'BAHIA - Geral', situacao: 'Aberta', observacao_logistica: null
  };
}

function movimento(os, cliente, funcionario) {
  return {
    row: {
      OS: os, CLIENTE: cliente, LOCAL: 'FAZENDA CASA REAL', SUPERVISAO: 'BAHIA - Geral',
      'ATUALIZADO POR': funcionario, 'ULTIMA ATUALIZACAO': '21/10/2026 08:37'
    }
  };
}

async function calcular(cadastros, movimentos, producao) {
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(cadastros), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
  try {
    return await calcularPendentes(movimentos, producao, []);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
}

const cargill = osCadastro('96499', 'CARGILL AGRICOLA - BARREIRAS');
const cofco = osCadastro('95849', 'COFCO INTERNATIONAL - LUIS EDUARDO MAGALHAES');

test('carga de OUTRO cliente no mesmo local nao bloqueia o FOB (OS 96499 x 95849, 21/10/2026)', async () => {
  const pendentes = await calcular(
    [cargill, cofco],
    [movimento('96499', cargill.cliente, 'CAUA CANDIDO CABRAL')],
    [{ 'O S': '95849', CARGAS: '8' }]
  );
  assert.deepEqual(pendentes.map((item) => item.os), ['96499']);
});

test('sem carga: 1 FOB por Cliente + local (clientes diferentes no mesmo local lancam cada um o seu)', async () => {
  const cargillIrma = osCadastro('96500', cargill.cliente);
  const pendentes = await calcular(
    [cargill, cargillIrma, cofco],
    [
      movimento('96499', cargill.cliente, 'CAUA CANDIDO CABRAL'),
      movimento('96500', cargill.cliente, 'CAUA CANDIDO CABRAL'),
      movimento('95849', cofco.cliente, 'LUIZA MANUELLEM DOS SANTOS PEREIRA')
    ],
    []
  );
  assert.deepEqual(pendentes.map((item) => item.os).sort(), ['95849', '96499']);
});

test('carga do MESMO cliente no mesmo local continua bloqueando o FOB', async () => {
  const irma = osCadastro('96500', cargill.cliente);
  const pendentes = await calcular(
    [cargill, irma],
    [movimento('96499', cargill.cliente, 'CAUA CANDIDO CABRAL')],
    [{ 'O S': '96500', CARGAS: '8' }]
  );
  assert.deepEqual(pendentes, []);
});
