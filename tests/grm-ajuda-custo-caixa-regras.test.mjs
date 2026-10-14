import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const regras = require('../agentes-grm-sync/grm-ajuda-custo-caixa-regras.js');

test('regras de tela da ajuda de custo (test-ajuda-custo-caixa.js, agora também no CI)', () => {
  // O script antigo roda os asserts ao ser carregado e imprime "ok".
  require('../agentes-grm-sync/test-ajuda-custo-caixa.js');
});

// Movimentos como grm-caixa-ui.movimentosCaixaGrm devolve do relatório operatingFlow.
const DESC = 'Auxílio moradia - 10/2026';
const adiantamento = { ofmCode: 1, data: '2026-10-15', descricao: DESC, tipoDespesa: 'Adiantamento', valor: 1234.5, documento: '', tipo: 'C' };
const comprovante = { ofmCode: 2, data: '2026-10-15', descricao: DESC, tipoDespesa: 'Ajuda de Custo', valor: 1234.5, documento: '0', tipo: 'D' };
const almocoMesmaDescricao = { ofmCode: 3, data: '2026-10-15', descricao: DESC, tipoDespesa: 'Almoço', valor: 1234.5, documento: '000', tipo: 'D' };
const job = (movimento, valor = 1234.5) => ({ movimento, valor, descricao_grm: DESC });

test('movimentoDoRegistroApi: C = Adiantamento, D + Ajuda de Custo = Comprovante, resto não é do agente', () => {
  assert.equal(regras.movimentoDoRegistroApi(adiantamento), 'ADIANTAMENTO');
  assert.equal(regras.movimentoDoRegistroApi(comprovante), 'COMPROVANTE');
  assert.equal(regras.movimentoDoRegistroApi({ ...comprovante, tipoDespesa: 'Ajuda de Custo ' }), 'COMPROVANTE');
  assert.equal(regras.movimentoDoRegistroApi(almocoMesmaDescricao), null);
});

test('avaliarExistenteApi: sem movimento do tipo -> CRIAR', () => {
  assert.equal(regras.avaliarExistenteApi([], job('ADIANTAMENTO')).acao, 'CRIAR');
  // Comprovante não pode "achar" o Adiantamento recém-lançado com a mesma descrição.
  assert.equal(regras.avaliarExistenteApi([adiantamento], job('COMPROVANTE')).acao, 'CRIAR');
  assert.equal(regras.avaliarExistenteApi([comprovante], job('ADIANTAMENTO')).acao, 'CRIAR');
  assert.equal(regras.avaliarExistenteApi([almocoMesmaDescricao], job('COMPROVANTE')).acao, 'CRIAR');
  assert.equal(regras.avaliarExistenteApi([{ ...adiantamento, descricao: 'Outra coisa - 10/2026' }], job('ADIANTAMENTO')).acao, 'CRIAR');
});

test('avaliarExistenteApi: mesmo tipo, descrição e valor -> JA_EXISTE (não duplica)', () => {
  const a = regras.avaliarExistenteApi([adiantamento, comprovante], job('ADIANTAMENTO'));
  assert.equal(a.acao, 'JA_EXISTE');
  assert.equal(a.row.ofmCode, 1);
  const c = regras.avaliarExistenteApi([adiantamento, comprovante], job('COMPROVANTE'));
  assert.equal(c.acao, 'JA_EXISTE');
  assert.equal(c.row.ofmCode, 2);
  // descrição com acento/caixa diferente ainda é a mesma
  assert.equal(regras.avaliarExistenteApi([{ ...adiantamento, descricao: 'AUXILIO MORADIA - 10/2026' }], job('ADIANTAMENTO')).acao, 'JA_EXISTE');
});

test('avaliarExistenteApi: mesmo tipo e descrição com valor diferente -> DIVERGENTE (decisão humana)', () => {
  const r = regras.avaliarExistenteApi([adiantamento], job('ADIANTAMENTO', 999));
  assert.equal(r.acao, 'DIVERGENTE');
  assert.equal(r.rows.length, 1);
});
