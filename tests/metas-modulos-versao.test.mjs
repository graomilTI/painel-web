import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// O módulo Diretoria > METAS (assets/js/modules/metas.js) foi dividido em módulos metas-*.js (15/10/2026).
// O navegador identifica cada módulo pela URL COMPLETA, com o ?v=, e o service worker serve JS em
// stale-while-revalidate: se um import interno ficar com ?v= diferente dos outros, o usuário pode
// receber dois módulos de versões diferentes ou duas cópias do mesmo módulo. Este teste exige o mesmo
// token em todos os imports internos e no carregador que importa o ponto de entrada.

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFileSync(new URL(caminho, raiz), 'utf8');

const MODULOS_DIVIDIDOS = [
  'metas-util', 'metas-calculo', 'metas-estilos', 'metas-render', 'metas-dados', 'metas-bonus', 'metas-fechamento', 'metas-eventos', 'metas-tela',
];

function tokensInternos() {
  const achados = [];
  for (const nome of ['metas', ...MODULOS_DIVIDIDOS]) {
    const src = ler(`assets/js/modules/${nome}.js`);
    for (const m of src.matchAll(/from '\.\/(metas-[a-z-]+)\.js\?v=([^']+)'/g)) achados.push({ arquivo: nome, alvo: m[1], token: m[2] });
    assert.doesNotMatch(src, /from '\.\/metas-[a-z-]+\.js'/, `${nome} tem import interno sem ?v=`);
  }
  return achados;
}

test('todos os imports internos do módulo Metas usam o mesmo ?v=', () => {
  const achados = tokensInternos();
  assert.ok(achados.length >= 12, `esperava ao menos 12 imports internos, achei ${achados.length}`);
  const tokens = new Set(achados.map((a) => a.token));
  assert.equal(tokens.size, 1, `tokens diferentes: ${[...tokens].join(', ')}`);
});

test('o carregador importa o ponto de entrada com o mesmo ?v= dos imports internos', () => {
  const [token] = new Set(tokensInternos().map((a) => a.token));
  const src = ler('assets/js/metas.js');
  const versoes = [...src.matchAll(/modules\/metas\.js\?v=([^'")]+)/g)].map((m) => m[1]);
  assert.equal(versoes.length, 1, 'assets/js/metas.js deveria importar modules/metas.js com ?v=');
  assert.equal(versoes[0], token);
});

test('cada módulo importado existe', () => {
  const existentes = new Set(readdirSync(new URL('assets/js/modules/', raiz)).map((f) => f.replace(/\.js$/, '')));
  for (const a of tokensInternos()) assert.ok(existentes.has(a.alvo), `${a.arquivo} importa ${a.alvo}, que não existe`);
  for (const nome of MODULOS_DIVIDIDOS) assert.ok(existentes.has(nome), `${nome} não existe`);
});

test('a API pública em window continua publicada pela entrada', () => {
  assert.match(ler('assets/js/modules/metas.js'), /window\.METAS = \{\s*openHome\s*\};/);
});
