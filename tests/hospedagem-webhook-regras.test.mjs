import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  digits, extractCode, flattenValues, hasStructuredQuote, normalizeKey, normalizePhone, parseBoolean, parseLabelledText, parseMoney, pick, quoteFields, quoteSummary, valueFrom,
} from '../supabase/functions/hospedagem-whatsapp-webhook/regras.js';

// Leitura da resposta do hotel no webhook do WhatsApp (movida de index.ts para regras.js em 24/10/2026, sem mudar o comportamento).

test('chaves e telefones', () => {
  assert.equal(normalizeKey(' Valor da Diária (R$) '), 'valor_da_diaria_r');
  assert.equal(normalizeKey(null), '');
  assert.equal(digits('(66) 99999-1111'), '66999991111');
  assert.equal(normalizePhone('(66) 99999-1111'), '5566999991111');
  assert.equal(normalizePhone('5566999991111'), '5566999991111');
  assert.equal(normalizePhone('123'), '123');
  assert.equal(normalizePhone(''), '');
  assert.equal(pick({ a: { b: 'x' } }, ['z.y', 'a.b']), 'x');
  assert.equal(pick({ a: '' }, ['a']), null);
});

test('código da reserva ou da solicitação dentro do texto', () => {
  assert.equal(extractCode('confirmo a reserva hout12, obrigado'), 'HOUT12');
  assert.equal(extractCode('sobre HOSP 0042 ok'), 'HOSP-0042');
  assert.equal(extractCode('sem código'), null);
});

test('sim/não em português, inglês e frases soltas', () => {
  for (const v of ['Sim', 's', 'YES', true, 1, 'Disponível', 'incluído', 'aceita']) assert.equal(parseBoolean(v), true, String(v));
  for (const v of ['não', 'N', 'no', false, 0, 'indisponível', 'sem disponibilidade', 'não aceita']) assert.equal(parseBoolean(v), false, String(v));
  assert.equal(parseBoolean('talvez'), null);
  assert.equal(parseBoolean(''), null);
  assert.equal(parseBoolean('Infelizmente não temos vaga'), false);
  // Quirk herdado do original: o trecho "disponiv" só pega "disponível"; "disponibilidade" solta fica sem resposta.
  assert.equal(parseBoolean('temos disponibilidade'), null);
});

test('valores em reais', () => {
  assert.equal(parseMoney('R$ 1.234,56'), 1234.56);
  assert.equal(parseMoney('180,50'), 180.5);
  assert.equal(parseMoney('180.5'), 180.5);
  assert.equal(parseMoney(95), 95);
  assert.equal(parseMoney('abc'), null);
  assert.equal(parseMoney(''), null);
  assert.equal(parseMoney(Number.NaN), null);
});

test('payload do BotConversa em campos nome/valor e texto rotulado viram a mesma leitura', () => {
  const body = { fields: [{ name: 'Disponibilidade', value: 'Sim' }, { name: 'Valor da diária', value: 'R$ 180,00' }, { key: 'valor_total', value: '540' }], contact: { phone: '66999991111' } };
  const mapa = flattenValues(body);
  assert.equal(mapa.get('disponibilidade'), 'Sim');
  assert.equal(valueFrom(mapa, ['valor_da_diaria']), 'R$ 180,00');
  const campos = quoteFields(body, 'Café da manhã: sim\nEstacionamento = não\nEmite NF - sim\nObservações: chegada após 14h');
  assert.equal(campos.availability, true);
  assert.equal(campos.dailyValue, 180);
  assert.equal(campos.totalValue, 540);
  assert.equal(campos.breakfastIncluded, true);
  assert.equal(campos.parkingIncluded, false);
  assert.equal(campos.emitsInvoice, true);
  assert.equal(campos.notes, 'chegada após 14h');
  assert.equal(hasStructuredQuote(campos), true);
  assert.match(quoteSummary(campos), /Diária: R\$ 180\.00/);
});

test('resposta livre sem campos reconhecidos não conta como cotação estruturada', () => {
  const campos = quoteFields({}, 'oi, tudo bem?');
  assert.equal(hasStructuredQuote(campos), false);
  const saida = new Map();
  parseLabelledText('a: 1', saida);
  assert.equal(saida.size, 0, 'rótulo de 1 letra não vale');
});

test('o index.ts só orquestra: importa as regras e não as redefine', () => {
  const index = readFileSync(new URL('../supabase/functions/hospedagem-whatsapp-webhook/index.ts', import.meta.url), 'utf8');
  assert.match(index, /from "\.\/regras\.js"/);
  for (const nome of ['flattenValues', 'parseBoolean', 'parseMoney', 'quoteFields', 'valueFrom']) assert.doesNotMatch(index, new RegExp(`function ${nome}[(]`), `${nome} voltou para o index.ts`);
});
