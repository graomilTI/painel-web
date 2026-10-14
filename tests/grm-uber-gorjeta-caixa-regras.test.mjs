import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const regras = require('../agentes-grm-sync/grm-uber-gorjeta-caixa-regras.js');

// Movimentos como grm-caixa-ui.movimentosCaixaGrm devolve do relatório operatingFlow.
const DESC = 'Gorjeta Uber - 12/05/2026 18:30 - corrida a1b2c3d4';
const adiantamento = { ofmCode: 10, data: '2026-05-12', descricao: DESC, tipoDespesa: 'Adiantamento', valor: 7.5, documento: '', tipo: 'C' };
const despesaMesmaDescricao = { ...adiantamento, ofmCode: 11, tipoDespesa: 'Táxi/Uber', documento: '123', tipo: 'D' };

test('sem Adiantamento com a descrição -> CRIAR', () => {
  assert.equal(regras.avaliarExistenteApi([], DESC, 7.5).acao, 'CRIAR');
  assert.equal(regras.avaliarExistenteApi([{ ...adiantamento, descricao: 'Gorjeta Uber - outra corrida' }], DESC, 7.5).acao, 'CRIAR');
  // Despesa (D) com a mesma descrição não conta como o Adiantamento.
  assert.equal(regras.avaliarExistenteApi([despesaMesmaDescricao], DESC, 7.5).acao, 'CRIAR');
});

test('Adiantamento com a mesma descrição e valor -> JA_EXISTE com o ofmCode (não duplica)', () => {
  const r = regras.avaliarExistenteApi([despesaMesmaDescricao, adiantamento], DESC, 7.5);
  assert.equal(r.acao, 'JA_EXISTE');
  assert.equal(r.row.ofmCode, 10);
  // acento/caixa/pontuação diferentes ainda é a mesma descrição
  assert.equal(regras.avaliarExistenteApi([{ ...adiantamento, descricao: 'GORJETA UBER - 12/05/2026 18:30 - CORRIDA A1B2C3D4' }], DESC, 7.5).acao, 'JA_EXISTE');
  // tolerância de centavos de ponto flutuante
  assert.equal(regras.avaliarExistenteApi([{ ...adiantamento, valor: 7.499999 }], DESC, 7.5).acao, 'JA_EXISTE');
});

test('Adiantamento com a mesma descrição e valor diferente -> DIVERGENTE (decisão humana)', () => {
  const r = regras.avaliarExistenteApi([adiantamento], DESC, 9);
  assert.equal(r.acao, 'DIVERGENTE');
  assert.equal(r.rows.length, 1);
});
