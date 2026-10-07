import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.SUPABASE_URL ||= 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'teste-chave-local';

const require = createRequire(import.meta.url);
const {
  agruparCandidatosPorPontoEDia,
  agrupadoComElaMesma,
  colaboradorOriginalDaLinha,
  filtrarPendenciasAnteriores,
  parseArgs,
} = require('../agentes-grm-sync/grm-sync-lancar-nhe.js');

const osCoord = { embarque: 'BA - LUÍS EDUARDO MAGALHÃES (FAZENDA SANTA IZABEL)', cliente: 'COFCO' };
const cand = (os, data, extra = {}) => ({ os, data, cliente: 'COFCO', osCoord, ...extra });

test('duas datas da MESMA OS no mesmo local nao se agrupam (94005 em 03/10 e 05/10)', () => {
  const { unicos, agrupados } = agruparCandidatosPorPontoEDia([
    cand('94005', '2026-10-03'),
    cand('94005', '2026-10-05'),
  ]);
  assert.deepEqual(unicos.map((c) => `${c.data}|${c.os}`), ['2026-10-03|94005', '2026-10-05|94005']);
  assert.equal(agrupados.length, 0);
});

test('OS irmas no mesmo local e no MESMO dia continuam agrupadas em uma so NHE', () => {
  const { unicos, agrupados } = agruparCandidatosPorPontoEDia([
    cand('92001', '2026-10-05'),
    cand('92002', '2026-10-05'),
  ]);
  assert.deepEqual(unicos.map((c) => c.os), ['92001']);
  assert.equal(agrupados.length, 1);
  assert.equal(agrupados[0].candidato.os, '92002');
  assert.equal(agrupados[0].representante, '92001');
});

test('OS irma em outro dia nao e barrada pela representante do dia anterior', () => {
  const { unicos } = agruparCandidatosPorPontoEDia([
    cand('92001', '2026-10-03'),
    cand('92002', '2026-10-05'),
  ]);
  assert.equal(unicos.length, 2);
});

test('candidato sem cliente/embarque nunca e agrupado', () => {
  const sem = (os) => ({ os, data: '2026-10-05', osCoord: {} });
  const { unicos, agrupados } = agruparCandidatosPorPontoEDia([sem('1'), sem('2')]);
  assert.equal(unicos.length, 2);
  assert.equal(agrupados.length, 0);
});

test('agrupadoComElaMesma so vale para MESMO_PONTO_AGRUPADO apontando para a propria OS', () => {
  const linha = (status, os, com) => ({ status, numero_os: os, raw: { agrupado_com_os: com } });
  assert.equal(agrupadoComElaMesma(linha('MESMO_PONTO_AGRUPADO', '94005', '94005')), true);
  assert.equal(agrupadoComElaMesma(linha('MESMO_PONTO_AGRUPADO', '92002', '92001')), false);
  assert.equal(agrupadoComElaMesma(linha('SUCESSO', '94005', '94005')), false);
  assert.equal(agrupadoComElaMesma({ status: 'MESMO_PONTO_AGRUPADO', numero_os: '1', raw: null }), false);
});

test('colaborador original: raw, depois colaborador_chave nas agrupadas, depois funcionario', () => {
  assert.equal(colaboradorOriginalDaLinha({ status: 'SEM_LOGIN', funcionario: 'A', raw: { colaborador_original: 'B' } }), 'B');
  assert.equal(colaboradorOriginalDaLinha({ status: 'MESMO_PONTO_AGRUPADO', funcionario: 'GESTOR', colaborador_chave: 'REGIVAN', raw: { agrupado_com_os: '94005' } }), 'REGIVAN');
  assert.equal(colaboradorOriginalDaLinha({ status: 'SEM_LOGIN', funcionario: 'A', colaborador_chave: 'X', raw: null }), 'A');
});

test('janela da repescagem: SEM_COORDENADA_OS usa a maior, demais status a padrao', () => {
  // referencia 06/10, padrao 3 dias (03/10), sem coordenada 14 dias (22/09)
  const rows = [
    { status: 'SEM_COORDENADA_OS', data_referencia: '2026-09-28', numero_os: '94005' },
    { status: 'SEM_COORDENADA_OS', data_referencia: '2026-09-21', numero_os: '1' },
    { status: 'SEM_LOGIN', data_referencia: '2026-09-28', numero_os: '2' },
    { status: 'SEM_LOGIN', data_referencia: '2026-10-03', numero_os: '3' },
    { status: 'ERRO', data_referencia: '2026-10-05', numero_os: '4' },
  ];
  const mantidas = filtrarPendenciasAnteriores(rows, '2026-10-03', '2026-09-22').map((r) => r.numero_os);
  assert.deepEqual(mantidas, ['94005', '3', '4']);
});

test('repescagem so reaproveita MESMO_PONTO_AGRUPADO quando agrupada contra si mesma', () => {
  const rows = [
    { status: 'MESMO_PONTO_AGRUPADO', data_referencia: '2026-10-05', numero_os: '94005', raw: { agrupado_com_os: '94005' } },
    { status: 'MESMO_PONTO_AGRUPADO', data_referencia: '2026-10-05', numero_os: '92002', raw: { agrupado_com_os: '92001' } },
  ];
  const mantidas = filtrarPendenciasAnteriores(rows, '2026-10-03', '2026-09-22').map((r) => r.numero_os);
  assert.deepEqual(mantidas, ['94005']);
});

test('--gestor e lido junto de --os/--data (recuperacao manual com gestor informado)', () => {
  const args = parseArgs(['--os', '91497', '--data', '2026-09-07', '--gestor', 'MARIA EDUARDA SOUSA SILVA']);
  assert.equal(args.os, '91497');
  assert.equal(args.data, '2026-09-07');
  assert.equal(args.gestor, 'MARIA EDUARDA SOUSA SILVA');
  assert.equal(parseArgs(['--os', '1']).gestor, undefined);
});
