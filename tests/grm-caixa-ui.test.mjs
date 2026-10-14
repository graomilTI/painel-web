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
