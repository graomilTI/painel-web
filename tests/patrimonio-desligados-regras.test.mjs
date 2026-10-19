// Aba Desligados (Patrimônios): prazo de 10 dias a partir do desligamento, datas em Brasília.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRAZO_RECOLHIMENTO_DIAS, chaveNome, diaBrasilia, diasParaPrazo, estadoPrazo, formatarDia, hojeBrasilia, somarDias,
} from '../assets/js/patrimonioDesligadosRegras.js';

test('prazo é de 10 dias e atravessa mês/ano', () => {
  assert.equal(PRAZO_RECOLHIMENTO_DIAS, 10);
  assert.equal(somarDias('2026-10-19', 10), '2026-10-29');
  assert.equal(somarDias('2026-12-25', 10), '2027-01-04');
  assert.equal(somarDias('2028-02-25', 10), '2028-03-06');
});

test('estadoPrazo: no prazo, urgente, vence hoje e vencido', () => {
  const hoje = '2026-10-19';
  assert.deepEqual(estadoPrazo('2026-10-29', hoje), { classe: 'ok', texto: 'Faltam 10 dias', vencido: false });
  assert.equal(estadoPrazo('2026-10-22', hoje).classe, 'urgente');
  assert.equal(estadoPrazo('2026-10-20', hoje).texto, 'Faltam 1 dia');
  assert.deepEqual(estadoPrazo('2026-10-19', hoje), { classe: 'hoje', texto: 'Vence hoje', vencido: false });
  assert.deepEqual(estadoPrazo('2026-10-18', hoje), { classe: 'vencido', texto: 'Vencido há 1 dia', vencido: true });
  assert.equal(estadoPrazo('2026-10-09', hoje).texto, 'Vencido há 10 dias');
  assert.equal(diasParaPrazo('2026-10-29', hoje), 10);
});

test('desligado em 09/10 vence em 19/10 (último dia ainda dentro do prazo)', () => {
  const prazo = somarDias('2026-10-09', PRAZO_RECOLHIMENTO_DIAS);
  assert.equal(prazo, '2026-10-19');
  assert.equal(estadoPrazo(prazo, '2026-10-19').vencido, false);
  assert.equal(estadoPrazo(prazo, '2026-10-20').vencido, true);
});

test('dia em Brasília: 01h UTC ainda é o dia anterior', () => {
  assert.equal(diaBrasilia('2026-10-20T01:30:00Z'), '2026-10-19');
  assert.equal(hojeBrasilia(new Date('2026-10-20T02:59:00Z')), '2026-10-19');
  assert.equal(hojeBrasilia(new Date('2026-10-20T03:00:00Z')), '2026-10-20');
});

test('formatarDia e chaveNome', () => {
  assert.equal(formatarDia('2026-10-07'), '07/10/2026');
  assert.equal(formatarDia(''), '-');
  assert.equal(chaveNome('  JOÃO  da  Silva '), 'joao da silva');
});
