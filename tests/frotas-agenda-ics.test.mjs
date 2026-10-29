import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendar, dobrar, escapeTexto, eventosDe, utcIcs } from '../supabase/functions/frotas-agenda-ics/ics.js';

// Feed .ics da Agenda de Rastreadores (sincronização com o Google Agenda).

const AGORA = new Date('2026-10-16T15:00:00Z');

test('horário de Brasília (UTC-3) vira UTC no .ics', () => {
  assert.equal(utcIcs('2026-10-20', '14:30'), '20261020T173000Z');
  assert.equal(utcIcs('2026-10-20', '14:30', 60), '20261020T183000Z');
  assert.equal(utcIcs('2026-10-20', '22:00'), '20261021T010000Z'); // vira o dia
  assert.equal(utcIcs('2026-12-31', '23:30', 60), '20270101T033000Z'); // 00:30 de Brasília = 03:30 UTC, virou o ano
});

test('texto é escapado e linha longa é dobrada em 75 octetos sem partir acento', () => {
  assert.equal(escapeTexto('a, b; c\nd\\e'), 'a\\, b\\; c\\nd\\\\e');
  const longa = 'DESCRIPTION:' + 'ç'.repeat(80);
  const partes = dobrar(longa).split('\r\n');
  assert.ok(partes.length > 1);
  for (const [i, p] of partes.entries()) {
    const linha = i === 0 ? p : p.slice(1); // a continuação começa com 1 espaço
    assert.ok(new TextEncoder().encode(p).length <= 75, `linha ${i} passa de 75 octetos`);
    assert.ok(!linha.includes('�'));
  }
  assert.equal(partes.map((p, i) => (i ? p.slice(1) : p)).join(''), longa);
});

test('manutenção com hora vira evento de 1 h; sem hora vira dia inteiro', () => {
  const eventos = eventosDe({
    manutencoes: [
      { id: 'm1', placa: 'ABC1D23', situacao: 'aberta', motivo: 'Fio solto', tecnico_nome: 'Carlos', tecnico_contato: '65999990000', data_agendada: '2026-10-20', hora_agendada: '14:30:00', local_agendado: 'Oficina X, Rua 1', motorista_nome: 'João', local_maps_url: 'https://maps.app.goo.gl/x' },
      { id: 'm2', placa: 'QWE4R56', situacao: 'aberta', data_agendada: '2026-10-21', hora_agendada: '' },
    ],
  });
  const ics = buildCalendar({ eventos, agora: AGORA });
  assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2\.0/);
  assert.match(ics, /DTSTART:20261020T173000Z\r\nDTEND:20261020T183000Z/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261021\r\nDTEND;VALUE=DATE:20261022/);
  assert.match(ics, /SUMMARY:Manutenção rastreador · ABC1D23/);
  assert.match(ics, /LOCATION:Oficina X\\, Rua 1/);
  assert.match(ics, /URL:https:\/\/maps\.app\.goo\.gl\/x/);
  assert.match(ics, /DTSTAMP:20261016T150000Z/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
});

test('canceladas e sem data ficam de fora; concluídas aparecem com ✓', () => {
  const eventos = eventosDe({
    manutencoes: [
      { id: 'a', placa: 'AAA1A11', situacao: 'cancelada', data_agendada: '2026-10-20' },
      { id: 'b', placa: 'BBB2B22', situacao: 'aberta', data_agendada: null },
      { id: 'c', placa: 'CCC3C33', situacao: 'finalizada', data_agendada: '2026-10-18' },
    ],
  });
  assert.equal(eventos.length, 1);
  assert.match(eventos[0].titulo, /^✓ Manutenção rastreador · CCC3C33$/);
});

test('instalação só entra com status agendado/concluído e data; motorista vem do veículo e telefone do cadastro', () => {
  const eventos = eventosDe({
    rastreadores: [
      { id: 'r1', placa: 'ABC-1D23', status: 'agendado', data_instalacao: '2026-10-22', local_instalacao: 'Pátio', cidade: 'Cascavel', estado: 'PR' },
      { id: 'r2', placa: 'XXX1X11', status: 'em_andamento', data_instalacao: '2026-10-22' },
      { id: 'r3', placa: 'YYY1Y11', status: 'agendado', data_instalacao: null },
    ],
    veiculos: [{ placa: 'ABC1D23', motorista_atual: 'João da Silva' }],
    motoristas: [{ nome: 'JOAO DA SILVA', telefone: '(65) 99999-0000' }],
  });
  assert.equal(eventos.length, 1);
  assert.match(eventos[0].descricao, /Motorista: João da Silva · 65999990000/);
  assert.equal(eventos[0].local, 'Pátio · Cascavel/PR');
  assert.match(eventos[0].uid, /^inst-r1@/);
});

test('instalação agendada com hora e técnico vira evento com horário e traz o técnico na descrição', () => {
  const [ev] = eventosDe({
    rastreadores: [{ id: 'r9', placa: 'ABC1D23', status: 'agendado', data_instalacao: '2026-10-22', hora_instalacao: '14:30', tecnico_instalacao: 'Carlos' }],
  });
  assert.equal(ev.hora, '14:30');
  assert.match(ev.descricao, /Técnico: Carlos/);
  const ics = buildCalendar({ eventos: [ev], agora: new Date('2026-10-20T12:00:00Z') });
  assert.match(ics, /DTSTART:20261022T173000Z/);
});

test('eventos saem ordenados por data e hora; UID é estável', () => {
  const m = (id, d, h) => ({ id, placa: 'P' + id, situacao: 'aberta', data_agendada: d, hora_agendada: h });
  const a = eventosDe({ manutencoes: [m('2', '2026-10-21', '09:00'), m('1', '2026-10-20', '15:00'), m('3', '2026-10-20', '08:00')] });
  assert.deepEqual(a.map((e) => e.uid.split('@')[0]), ['manut-3', 'manut-1', 'manut-2']);
  const b = eventosDe({ manutencoes: [m('3', '2026-10-20', '08:00')] });
  assert.equal(b[0].uid, a[0].uid);
});

test('a Edge Function é pública (o Google não faz login) e valida o login só no POST', async () => {
  const { readFileSync } = await import('node:fs');
  const cfg = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
  assert.match(cfg, /\[functions\.frotas-agenda-ics\]\s*\r?\nverify_jwt = false/);
  const src = readFileSync(new URL('../supabase/functions/frotas-agenda-ics/index.ts', import.meta.url), 'utf8');
  assert.match(src, /authorizeRequest\(req, MODULOS\)/);
  assert.match(src, /TOKEN_RE = \/\^\[a-f0-9\]\{48\}\$\//);
  assert.match(src, /banned_until/);
});
