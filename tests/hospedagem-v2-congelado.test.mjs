import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// O fluxo antigo (v2) da Hospedagem foi congelado em 24/10/2026: a tela mantém só a leitura (lista, detalhes, fluxo por hotel,
// extrato e a fila financeira dos lotes pendentes) e nada novo nasce no v2. Cotar/reservar/estender/check-out/diferença só pela fila v3.

const le = (caminho) => readFileSync(new URL(`../${caminho}`, import.meta.url), 'utf8');

test('o controller não tem mais as ações de escrita do v2', () => {
  const fonte = le('assets/js/adm-hotel.js');
  for (const nome of ['openPicker', 'confirmCotar', 'openReservar', 'confirmReservar', 'openAgrupar', 'agruparReserva', 'openEstender', 'confirmEstender', 'openCheckout', 'confirmCheckout', 'openDiferenca', 'confirmDiferenca', 'useQuote', 'subscribeQuotes']) {
    assert.doesNotMatch(fonte, new RegExp(`\\b${nome}\\b`), `adm-hotel.js ainda tem ${nome}`);
  }
  // O que continua: leitura e a confirmação dos lotes antigos pendentes.
  for (const nome of ['openDetalhes', 'hotelLedger', 'openHotelExtrato', 'loadFinanceiroQueue', 'submitConfirmarPagamento']) assert.match(fonte, new RegExp(`function ${nome}\\b`), `falta ${nome}`);
});

test('o detalhe da solicitação antiga não oferece mais botões de ação', () => {
  const view = le('assets/js/adm-hotel-view.js');
  for (const atributo of ['data-cotar', 'data-agrupar', 'data-reservar', 'data-estender', 'data-checkout', 'data-diferenca', 'data-use-quote']) {
    assert.doesNotMatch(view, new RegExp(atributo), `o view ainda renderiza ${atributo}`);
  }
  for (const nome of ['renderHoteisPicker', 'renderReservarForm', 'renderAgruparPicker', 'renderEstenderForm', 'renderCheckoutForm', 'renderDiferencaForm', 'renderQuartosBox']) {
    assert.doesNotMatch(view, new RegExp(nome), `${nome} deveria ter saído do view`);
  }
});

test('a duplicação de programação não cria mais solicitação de hospedagem v2', () => {
  const sql = le('supabase/migrations/20261024210000_duplicar_programacao_sem_hospedagem_v2.sql');
  assert.doesNotMatch(sql, /hospedagem_solicitacoes|hospedagem_solicitacao_colaboradores/);
  assert.match(sql, /duplicar_programacao_dia_base_20260813/);
  assert.match(sql, /programacao_estadia/, 'as estadias HOTEL continuam sendo copiadas');
});

test('a fila de lotes antigos do ADM não lista pagamentos v3', () => {
  assert.match(le('assets/js/adm-hotel.js'), /\.neq\('origem_tabela', 'hospedagem_pagamentos_v3'\)/);
});
