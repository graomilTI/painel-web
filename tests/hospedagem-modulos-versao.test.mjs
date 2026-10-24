import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// A fila v3 da Hospedagem (adm-hotel.js) foi dividida em assets/js/modules/hospedagem/*.js (24/10/2026).
// O navegador identifica cada módulo pela URL COMPLETA, com o ?v=, e o service worker serve JS em stale-while-revalidate:
// se um import interno ficar com ?v= diferente, o usuário pode receber duas cópias do mesmo módulo ou versões misturadas.
// Este teste exige o mesmo token em todo import interno, na página que carrega o adm-hotel.js e no CSS da tela.

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFileSync(new URL(caminho, raiz), 'utf8');
const MODULOS = readdirSync(new URL('assets/js/modules/hospedagem/', raiz)).filter((n) => n.endsWith('.js')).map((n) => n.slice(0, -3));
const ARQUIVOS = [['assets/js/adm-hotel.js', 'adm-hotel'], ...MODULOS.map((m) => [`assets/js/modules/hospedagem/${m}.js`, m])];

// Imports que pertencem ao módulo: os de ./modules/hospedagem/ (a partir do adm-hotel.js), os vizinhos (./x.js dentro de modules/hospedagem/)
// e a regra compartilhada com a página pública do hotel.
function importsInternos() {
  const achados = [];
  for (const [arquivo, nome] of ARQUIVOS) {
    const src = ler(arquivo);
    for (const m of src.matchAll(/from '(\.[^']*\.js)(?:\?v=([^']+))?'/g)) {
      const alvo = m[1];
      const interno = alvo.includes('modules/hospedagem/') || (nome !== 'adm-hotel' && /^\.\/[a-z-]+\.js$/.test(alvo)) || alvo.endsWith('cotacaoHotelRegras.js');
      if (interno) achados.push({ arquivo: nome, alvo, token: m[2] });
    }
  }
  return achados;
}

test('o módulo de Hospedagem tem todos os arquivos esperados', () => {
  for (const m of ['cotacao', 'cotacao-ui', 'fila-ui', 'pagamento-ui', 'repository', 'reserva-ui', 'service', 'ui-comum']) assert.ok(MODULOS.includes(m), `falta modules/hospedagem/${m}.js`);
});

test('todo import interno da Hospedagem tem ?v= e é o mesmo em todos', () => {
  const achados = importsInternos();
  assert.ok(achados.length >= 13, `esperava ao menos 13 imports internos, achei ${achados.length}`);
  assert.deepEqual(achados.filter((a) => !a.token), [], 'imports internos sem ?v=');
  const tokens = new Set(achados.map((a) => a.token));
  assert.equal(tokens.size, 1, `tokens diferentes: ${[...tokens].join(', ')}`);
});

test('a página e o CSS usam o mesmo ?v= dos imports internos', () => {
  const [token] = new Set(importsInternos().map((a) => a.token));
  const html = [...ler('adm-hotel.html').matchAll(/assets\/js\/adm-hotel\.js\?v=([^"']+)/g)].map((m) => m[1]);
  assert.deepEqual(html, [token], 'adm-hotel.html deveria carregar adm-hotel.js com o mesmo ?v=');
  assert.match(ler('assets/js/adm-hotel-helpers.js'), new RegExp(`adm-hotel\\.css\\?v=${token}`), 'o CSS da tela precisa do mesmo ?v= (mudou o CSS, muda o token)');
});

test('os módulos não falam com o Supabase direto: só o repositório', () => {
  for (const m of MODULOS.filter((n) => n !== 'repository')) {
    assert.doesNotMatch(ler(`assets/js/modules/hospedagem/${m}.js`).replace(/\/\/.*$/gm, ''), /supabase\.(from|rpc|storage|functions)/, `${m}.js chama o Supabase direto`);
  }
});

test('a fila v3 não usa window.prompt nem <style> inline', () => {
  for (const m of MODULOS) {
    const src = ler(`assets/js/modules/hospedagem/${m}.js`).replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(src, /window\.prompt|[^.\w]prompt\(/, `${m}.js usa prompt`);
    assert.doesNotMatch(src, /<style>/, `${m}.js injeta <style>`);
  }
});
