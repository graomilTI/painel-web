import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Regras da NF de manutenção de frota no agente de lançamento (módulo puro; o agente roda no servidor, fora do git).
const require = createRequire(import.meta.url);
const { applyFrotasRules, descricaoFrotas, isFrotasRow } = require('../agentes-grm-sync/grm-nf-frotas-regras.js');

const ctx = { numero: 7, os_numero: 'OS-000007', placa: 'ABC1D23', oficina: 'Auto Center Sorriso', descricao: 'Freio com ruído', coordenacao: 'MATO GROSSO' };

test('só o setor FROTAS usa as regras de manutenção', () => {
  assert.equal(isFrotasRow({ setor: 'FROTAS' }), true);
  assert.equal(isFrotasRow({ setor: 'COMPRAS' }), false);
  assert.equal(isFrotasRow(undefined), false);
});

test('rateio pela coordenação do veículo, com GERAL de reserva e o mesmo valor da NF', () => {
  const data = applyFrotasRules({ valor_total: 1750.5, rateio: { data_participacao: '16/10/2026', identificacao: 'GERAL', valor: 1750.5 } }, ctx);
  assert.equal(data.rateio.tipo_participacao, 'Coordenação');
  assert.equal(data.rateio.identificacao, 'MATO GROSSO');
  assert.equal(data.rateio.identificacao_fallback, 'GERAL');
  assert.equal(data.rateio.valor, 1750.5);
  assert.equal(data.rateio.data_participacao, '16/10/2026');
  assert.equal(data.grupo_categoria, 'DESPESAS COM VEICULOS');
  assert.equal(data.descricao, descricaoFrotas(ctx));
});

test('veículo sem coordenação cai em GERAL com aviso', () => {
  const data = applyFrotasRules({ valor_total: 99 }, { ...ctx, coordenacao: ' ' });
  assert.equal(data.rateio.identificacao, 'GERAL');
  assert.match(data.frotas.avisos[0], /sem coordenação/);
});

test('o agente chama as regras de Frotas antes dos ajustes manuais', async () => {
  const { readFileSync } = await import('node:fs');
  const fonte = readFileSync(new URL('../agentes-grm-sync/grmserver-lancar-notas-fiscais-api.js', import.meta.url), 'utf8');
  const posRegras = fonte.indexOf('applyFrotasRules(data, ctxFrotas');
  const posAjustes = fonte.indexOf('applyManualOverrides(data, row.ajustes_manuais)');
  assert.ok(posRegras > 0 && posAjustes > posRegras, 'applyFrotasRules deve rodar antes de applyManualOverrides');
  assert.match(fonte, /\.eq\('nf_lancamento_id', row\.id\)/);
});
