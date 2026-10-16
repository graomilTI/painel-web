import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { __teste } from '../assets/js/modules/frotas-agenda-google.js';

// Agenda de Rastreadores > Sincronizar com Google Agenda (janela do usuário).

test('o botão do Google abre a assinatura com o link webcal codificado', () => {
  const url = __teste.linkGoogleAgenda('webcal://x.supabase.co/functions/v1/frotas-agenda-ics?t=abc');
  assert.equal(url, 'https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2Fx.supabase.co%2Ffunctions%2Fv1%2Ffrotas-agenda-ics%3Ft%3Dabc');
});

test('sem sincronização: explica e oferece ativar; com ela: mostra link, copiar, novo link e parar', () => {
  const inativo = __teste.textoCorpo({ ativo: false });
  assert.match(inativo, /data-gs-ativar/);
  assert.doesNotMatch(inativo, /data-gs-url/);
  const ativo = __teste.textoCorpo({ ativo: true, url: 'https://x.supabase.co/functions/v1/frotas-agenda-ics?t=abc', webcal: 'webcal://x.supabase.co/functions/v1/frotas-agenda-ics?t=abc' });
  assert.match(ativo, /data-gs-url/);
  assert.match(ativo, /data-gs-copiar/);
  assert.match(ativo, /data-gs-novo/);
  assert.match(ativo, /data-gs-parar/);
  assert.match(ativo, /calendar\.google\.com\/calendar\/r\?cid=webcal/);
  assert.match(ativo, /pessoal/);
});

test('o link exibido é escapado (nada de HTML solto)', () => {
  const html = __teste.textoCorpo({ ativo: true, url: 'https://x/?t="><script>', webcal: 'webcal://x/?t=1' });
  assert.doesNotMatch(html, /<script>/);
});

test('a Agenda de Rastreadores tem o botão e carrega a janela sob demanda', () => {
  const src = readFileSync(new URL('../assets/js/modules/frotas-rastreadores.js', import.meta.url), 'utf8');
  assert.match(src, /data-ag-google/);
  assert.match(src, /import\('\.\/frotas-agenda-google\.js\?v=[\w-]+'\)/);
});
