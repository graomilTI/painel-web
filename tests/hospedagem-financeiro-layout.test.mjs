import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filtrarFinanceiro, renderFinanceiroCorpo } from '../assets/js/adm-hotel-view.js';

// Confirmação de Pagamento (lotes antigos de check-out) no layout das listas do Frotas (24/10/2026): cards que filtram, busca com chip
// e tabela fixa. A confirmação do lote usa os mesmos atributos e a mesma RPC de antes.

const le = (caminho) => readFileSync(new URL(`../${caminho}`, import.meta.url), 'utf8');

const itens = [
  { id: 'a', status: 'PENDENTE', favorecido_nome: 'Hotel Girassol', descricao: 'Hospedagem HAGO01', valor: 450, competencia: '2026-08-01', hospedagem_checkout_lote_id: 'l1' },
  { id: 'b', status: 'EM_ANALISE', favorecido_nome: 'Pousada do Vale', descricao: 'Hospedagem HAGO02', valor: 85, competencia: '2026-08-01', hospedagem_checkout_lote_id: null },
];

test('o filtro combina a situação do card e a busca (hotel, descrição, competência)', () => {
  const ids = (f) => filtrarFinanceiro(itens, f).map((i) => i.id);
  assert.deepEqual(ids({}), ['a', 'b']);
  assert.deepEqual(ids({ filtro: 'PENDENTE' }), ['a']);
  assert.deepEqual(ids({ filtro: 'EM_ANALISE' }), ['b']);
  assert.deepEqual(ids({ busca: 'girassol' }), ['a']);
  assert.deepEqual(ids({ busca: 'HAGO02' }), ['b']);
  assert.deepEqual(ids({ busca: '01/08/2026' }), ['a', 'b']);
  assert.deepEqual(ids({ filtro: 'PENDENTE', busca: 'vale' }), []);
});

test('lote vinculado tem valor pago, comprovante e botão; sem lote só avisa onde confirmar', () => {
  const html = renderFinanceiroCorpo(itens);
  assert.match(html, /data-fin-field="valorPago" data-fin-id="l1" value="450"/);
  assert.match(html, /data-fin-field="comprovante" data-fin-id="l1"/);
  assert.match(html, /data-confirmar-pagamento="l1"/);
  assert.equal((html.match(/data-confirmar-pagamento/g) || []).length, 1, 'sem lote não há botão');
  assert.match(html, /Sem lote de check-out vinculado/);
  assert.match(renderFinanceiroCorpo([]), /fm-empty/);
});

test('o controller monta a fila no padrão e confirma pelo mesmo caminho', () => {
  const fonte = le('assets/js/adm-hotel.js');
  assert.match(fonte, /injectEstilosFrotas\(\);\s+contentEl\.innerHTML = renderFinanceiroShell\(\)/);
  assert.match(fonte, /aoClicarCard\(board, \(card, limpar\) => \{\s+financeiro\.filtro/);
  assert.match(fonte, /hospedagem_confirmar_pagamento_lote/);
  const view = le('assets/js/adm-hotel-view.js');
  assert.match(view, /id="ahFinBusca"/);
  assert.match(view, /class="fm-table"/);
  assert.doesNotMatch(view, /ah-quote-row[\s\S]{0,400}data-confirmar-pagamento="\$\{esc\(it\./, 'o cartão antigo da fila saiu');
});
