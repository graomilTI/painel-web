import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// Alojamentos (Hospedagem > Alojamentos) tinha 7 arquivos soltos em assets/js, carregados por adm-hotel-deferred.js com 6 ?v= diferentes
// (e o mesmo helper com dois tokens, o que carregava duas cópias do módulo). Em 24/10/2026 foram para modules/hospedagem-alojamentos/.
// O navegador identifica cada módulo pela URL COMPLETA, com o ?v=: este teste exige o mesmo token em todo import interno,
// no carregador e na página.

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFileSync(new URL(caminho, raiz), 'utf8');
const MODULOS = readdirSync(new URL('assets/js/modules/hospedagem-alojamentos/', raiz)).filter((n) => n.endsWith('.js')).map((n) => n.slice(0, -3));

test('o módulo de Alojamentos tem todos os arquivos e nenhum ficou solto em assets/js', () => {
  assert.deepEqual(MODULOS.sort(), ['compras', 'controle', 'controle-view', 'hospedados', 'pagamentos', 'separacao-modulos', 'util']);
  const soltos = readdirSync(new URL('assets/js/', raiz)).filter((n) => /^adm-hotel-(alojamentos|hospedados|separacao)/.test(n));
  assert.deepEqual(soltos, []);
});

test('todo import interno de Alojamentos leva o mesmo ?v= do carregador e da página', () => {
  const tokens = new Set();
  for (const m of MODULOS) {
    const src = ler(`assets/js/modules/hospedagem-alojamentos/${m}.js`);
    for (const x of src.matchAll(/from '(\.\/[a-z-]+\.js)(?:\?v=([^']+))?'/g)) {
      assert.ok(x[2], `${m}.js importa ${x[1]} sem ?v=`);
      tokens.add(x[2]);
    }
  }
  const deferred = ler('assets/js/adm-hotel-deferred.js');
  for (const x of deferred.matchAll(/importSafe\('\.\/modules\/hospedagem-alojamentos\/[a-z-]+\.js(?:\?v=([^']+))?'\)/g)) {
    assert.ok(x[1], 'adm-hotel-deferred.js importa módulo sem ?v=');
    tokens.add(x[1]);
  }
  assert.equal(deferred.match(/importSafe\('\.\/modules\/hospedagem-alojamentos\//g).length, 5, 'o carregador importa os 5 módulos que se montam sozinhos');
  const versaoDeferred = deferred.match(/const VERSION = '([^']+)'/)[1];
  const html = ler('adm-hotel.html').match(/adm-hotel-deferred\.js\?v=([^"']+)/)[1];
  tokens.add(versaoDeferred);
  tokens.add(html);
  assert.equal(tokens.size, 1, `tokens diferentes: ${[...tokens].join(', ')}`);
});

test('os módulos não importam nada que sumiu e o CSS é achado pelo caminho novo', () => {
  const util = ler('assets/js/modules/hospedagem-alojamentos/util.js');
  assert.match(util, /'\.\.\/\.\.\/\.\.\/css\/adm-hotel-alojamentos-v2\.css/);
  assert.match(util, /'\.\.\/\.\.\/\.\.\/css\/adm-hotel-alojamentos-lista\.css/);
  for (const m of MODULOS) {
    const src = ler(`assets/js/modules/hospedagem-alojamentos/${m}.js`).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.doesNotMatch(src, /from '\.\/(supabaseClient|sessionStore|rls-sessao-expirada)\.js'/, `${m}.js ainda importa do caminho antigo`);
    assert.doesNotMatch(src, /adm-hotel-alojamentos-v2(-helpers|-view)?.js|adm-hotel-hospedados.js|adm-hotel-separacao-modulos.js/, `${m}.js cita o nome antigo`);
  }
});
