// Baixa de NF: o pagamento "parcial confiável" não pode escolher parcela por palpite.
// Caso real 29/10/2026 (PETECK, comprovante R$ 755,00): em aberto havia 655,00 + 100,00
// (soma exata) e o DOC 851 de R$ 1.173,00; o agente baixou o 851 como parcial.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'x';
const agente = require('../agentes-grm-sync/grmserver-baixa-notas-fiscais-api.js');

const inv = (pinCode, doc, valor, venc, extra = {}) => ({
  scpCode: 1, pinCode, pinDocNumber: doc, pinInstallmentValue: valor, pinDueDate: venc, patCode: 3,
  favoredName: 'PETECK COMERCIO E SERVICOS LTDA', favoredDocument: '02.532.610/0001-61', ...extra,
});
const comprovante = {
  scpCode: 1, valor: 755, favorecidoNome: 'PETECK COMERCIO E SERVICOS LTD',
  favorecidoDocumento: '02.532.610/0001-61', dataPagamento: '2026-10-29',
};

test('soma exata 655 + 100 é achada antes de qualquer parcial', () => {
  const abertas = [inv('1', '851', 1173, '2026-11-20'), inv('2', '7665', 655, '2026-10-29'), inv('3', '747', 100, '2026-10-29')];
  const soma = agente.findSomaParcelasMatch(abertas, comprovante);
  assert.equal(soma.status, 'unica');
  assert.deepEqual(soma.invoices.map((i) => i.pinDocNumber).sort(), ['747', '7665']);
});

test('fornecedor com 2+ parcelas abertas não vira parcial pela "mais recente"', () => {
  const abertas = [inv('1', '851', 1173, '2026-11-20'), inv('2', '7665', 655, '2026-10-29')];
  assert.equal(agente.findFallbackPartialMatch(abertas, comprovante), null);
});

test('fornecedor com UMA parcela aberta ainda aceita parcial', () => {
  const abertas = [inv('1', '851', 1173, '2026-11-20')];
  assert.equal(agente.findFallbackPartialMatch(abertas, comprovante)?.pinCode, '1');
});

test('pessoa física mantém o desempate por vencimento mais recente', () => {
  const pf = (pinCode, venc) => inv(pinCode, `H-${pinCode}`, 1000, venc, { favoredName: 'JOAO DA SILVA', favoredDocument: '' });
  const r = agente.findFallbackPartialMatch([pf('1', '2026-08-06'), pf('2', '2026-09-05')],
    { scpCode: 1, valor: 990, favorecidoNome: 'JOAO DA SILVA', favorecidoDocumento: '123.456.789-00' });
  assert.equal(r?.pinCode, '2');
});
