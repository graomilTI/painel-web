import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const caixaUi = require('../agentes-grm-sync/grm-caixa-ui.js');

const AGENTES_CAIXA = [
  'grm-sync-bonus-caixa.js',
  'grm-sync-bonus-desconto-caixa.js',
  'grm-sync-ajuda-custo-caixa.js',
  'grm-sync-uber-gorjeta-caixa.js',
  'grm-sync-frotas-fora-horario-caixa.js',
];

const COMPARTILHADAS = [
  'log', 'sleep', 'digits', 'norm', 'nameKey', 'ensureDir', 'setSearchCpf', 'clickStaffSearch',
  'waitStaffCpfRow', 'setStaffSituation', 'inspectExpenseDescriptions', 'typeField',
  'parseBrowserNumber', 'closeDialogs', 'screenshot', 'launchBrowser', 'login', 'openStaffPage',
];

test('grm-caixa-ui exporta todas as funções compartilhadas', () => {
  for (const nome of ['configurar', ...COMPARTILHADAS]) {
    assert.equal(typeof caixaUi[nome], 'function', `${nome} deveria ser exportada`);
  }
});

test('nenhum agente do Caixa volta a declarar uma cópia local das funções compartilhadas', () => {
  // Eram 5 cópias idênticas; uma correção de tela tinha que ser repetida em todas.
  for (const arquivo of AGENTES_CAIXA) {
    const src = readFileSync(new URL(`../agentes-grm-sync/${arquivo}`, import.meta.url), 'utf8');
    assert.match(src, /require\('\.\/grm-caixa-ui'\)/, `${arquivo} deve importar grm-caixa-ui`);
    for (const nome of COMPARTILHADAS) {
      assert.doesNotMatch(src, new RegExp(`^(async )?function ${nome}\\(`, 'm'), `${arquivo} redeclara ${nome}`);
    }
  }
});

// Etapa 2 (14/10/2026): fluxo de tela do lançamento + conferência pela API. Por enquanto só o
// agente de Bônus usa as versões do módulo; os outros migram um por vez.
const FLUXO_LANCAMENTO = ['brMoneyText', 'selectExactStaffRow', 'clickCash', 'openEmployee', 'clickAddExpense', 'markField', 'chooseMovementType', 'saveExpense', 'movimentosCaixaGrm'];
const AGENTES_FLUXO_DO_MODULO = ['grm-sync-bonus-caixa.js'];

test('agentes migrados usam o fluxo de lançamento do módulo, sem cópia local', () => {
  for (const nome of FLUXO_LANCAMENTO) assert.equal(typeof caixaUi[nome], 'function', `${nome} deveria ser exportada`);
  for (const arquivo of AGENTES_FLUXO_DO_MODULO) {
    const src = readFileSync(new URL(`../agentes-grm-sync/${arquivo}`, import.meta.url), 'utf8');
    for (const nome of FLUXO_LANCAMENTO) {
      assert.doesNotMatch(src, new RegExp(`^(async )?function ${nome}\\(`, 'm'), `${arquivo} redeclara ${nome}`);
    }
  }
});

test('agentes que lançam no dia 15 conferem e checam duplicidade pela API, não pela tabela da tela', () => {
  // A tabela do modal Caixa Operacional esconde datas futuras: o Bônus (dia 15) virava falso ERRO
  // e a trava contra duplicidade ficava cega (caso de 06/10/2026). Ajuda de custo também usa dia 15;
  // a gorjeta Uber usa o dia da corrida (pode ser antigo).
  for (const arquivo of ['grm-sync-bonus-caixa.js', 'grm-sync-ajuda-custo-caixa.js', 'grm-sync-uber-gorjeta-caixa.js']) {
    const src = readFileSync(new URL(`../agentes-grm-sync/${arquivo}`, import.meta.url), 'utf8');
    assert.match(src, /movimentosCaixaGrm\(/, `${arquivo} deve consultar a API`);
    assert.doesNotMatch(src, /inspectExpenseDescriptions\(page/, `${arquivo} ainda confere pela tela`);
  }
});

test('mesesDoPeriodo quebra o período em meses inteiros (a API recusa mais de 1 mês)', () => {
  assert.deepEqual(caixaUi.mesesDoPeriodo('2026-10-01', '2026-10-15'), [['01/10/2026', '31/10/2026']]);
  assert.deepEqual(caixaUi.mesesDoPeriodo('2026-08-01', '2026-10-15'), [
    ['01/08/2026', '31/08/2026'], ['01/09/2026', '30/09/2026'], ['01/10/2026', '31/10/2026'],
  ]);
  assert.deepEqual(caixaUi.mesesDoPeriodo('2026-12-01', '2027-02-15'), [
    ['01/12/2026', '31/12/2026'], ['01/01/2027', '31/01/2027'], ['01/02/2027', '28/02/2027'],
  ]);
  assert.throws(() => caixaUi.mesesDoPeriodo('lixo', '2026-10-01'), /Período inválido/);
});

test('configurar exige a pasta de screenshots', () => {
  assert.throws(() => caixaUi.configurar({}), /screenshotDir/);
});

test('norm, digits e nameKey normalizam como os agentes esperam', () => {
  assert.equal(caixaUi.norm('  Bônus  e Premiações '), 'BONUS E PREMIACOES');
  assert.equal(caixaUi.digits('123.456.789-09'), '12345678909');
  assert.equal(caixaUi.nameKey('João da Silva'), 'JOAODASILVA');
});

test('parseBrowserNumber lê valores no formato brasileiro e no formato da tela', () => {
  assert.equal(caixaUi.parseBrowserNumber('R$ 1.234,56'), 1234.56);
  assert.equal(caixaUi.parseBrowserNumber('147.06'), 147.06);
  assert.equal(caixaUi.parseBrowserNumber(''), 0);
  assert.equal(caixaUi.parseBrowserNumber('abc'), 0);
});
