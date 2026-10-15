import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// O Financeiro (assets/js/financeiro.js) foi dividido em módulos assets/js/modules/financeiro/*.js (15/10/2026): funções de topo, HTML e uma fábrica criarX(ctx) por parte da tela.
// O navegador identifica cada módulo pela URL COMPLETA, com o ?v=, e o service worker serve JS em
// stale-while-revalidate: se um import interno ficar com ?v= diferente dos outros, o usuário pode
// receber dois módulos de versões diferentes ou duas cópias do mesmo módulo. Este teste exige o mesmo
// token em todos os imports internos, no financeiro.js e na página que o carrega.

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFileSync(new URL(caminho, raiz), 'utf8');

const MODULOS = ['util', 'planilhas', 'pagamentos', 'contas', 'html', 'feedback', 'dashboard', 'notas-fiscais', 'setor-pagamentos', 'adiantamentos', 'navegacao', 'fluxo'];

function tokensInternos() {
  const achados = [];
  for (const nome of MODULOS) {
    const src = ler(`assets/js/modules/financeiro/${nome}.js`);
    for (const m of src.matchAll(/from '\.\/([a-z-]+)\.js\?v=([^']+)'/g)) achados.push({ arquivo: nome, alvo: m[1], token: m[2] });
    assert.doesNotMatch(src, /from '\.\/[a-z-]+\.js'/, `${nome} tem import interno sem ?v=`);
  }
  const entrada = ler('assets/js/financeiro.js');
  for (const m of entrada.matchAll(/from '\.\/modules\/financeiro\/([a-z-]+)\.js\?v=([^']+)'/g)) achados.push({ arquivo: 'financeiro', alvo: m[1], token: m[2] });
  assert.doesNotMatch(entrada, /from '\.\/modules\/financeiro\/[a-z-]+\.js'/, 'financeiro.js tem import de módulo sem ?v=');
  return achados;
}

test('todos os imports internos do Financeiro usam o mesmo ?v=', () => {
  const achados = tokensInternos();
  assert.ok(achados.length >= 18, `esperava ao menos 18 imports internos, achei ${achados.length}`);
  const tokens = new Set(achados.map((a) => a.token));
  assert.equal(tokens.size, 1, `tokens diferentes: ${[...tokens].join(', ')}`);
});

test('a página importa financeiro.js com o mesmo ?v= dos imports internos', () => {
  const [token] = new Set(tokensInternos().map((a) => a.token));
  const html = ler('financeiro.html');
  const versoes = [...html.matchAll(/assets\/js\/financeiro\.js\?v=([^"']+)/g)].map((m) => m[1]);
  assert.equal(versoes.length, 1, 'financeiro.html deveria carregar assets/js/financeiro.js com ?v=');
  assert.equal(versoes[0], token);
});

test('cada módulo importado existe', () => {
  const existentes = new Set(readdirSync(new URL('assets/js/modules/financeiro/', raiz)).map((f) => f.replace(/\.js$/, '')));
  for (const a of tokensInternos()) assert.ok(existentes.has(a.alvo), `${a.arquivo} importa ${a.alvo}, que não existe`);
  for (const nome of MODULOS) assert.ok(existentes.has(nome), `${nome} não existe`);
});

test('a entrada continua exportando renderContent e registrando a página', () => {
  const src = ler('assets/js/financeiro.js');
  assert.match(src, /export function renderContent\(content, userContext\)/);
  assert.match(src, /initProtectedPage\('Financeiro', renderContent\);/);
});
