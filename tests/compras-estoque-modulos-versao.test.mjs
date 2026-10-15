import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// A tela de Estoque (assets/js/compras-estoque.js) era montada por três módulos: o principal e dois que
// remendavam o DOM por MutationObserver (agrupamento e layout). Em 15/10/2026 virou um módulo só. O
// navegador identifica o módulo pela URL COMPLETA, com o ?v=: a página (compras-estoque.html) e o roteador
// (navegação suave) precisam usar o mesmo token, e nada pode continuar apontando para os módulos removidos.

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFileSync(new URL(caminho, raiz), 'utf8');

test('os módulos de remendo do DOM foram removidos e nada aponta para eles', () => {
  for (const nome of ['compras-estoque-agrupamento.js', 'compras-estoque-layout.js']) {
    assert.equal(existsSync(new URL(`assets/js/${nome}`, raiz)), false, `${nome} deveria ter sido removido`);
    for (const arquivo of ['compras-estoque.html', 'assets/js/router.js', 'sw.js']) {
      assert.doesNotMatch(ler(arquivo), new RegExp(nome.replace('.', '\\.')), `${arquivo} ainda referencia ${nome}`);
    }
  }
});

test('a página e o roteador carregam compras-estoque.js com o mesmo ?v=', () => {
  const html = [...ler('compras-estoque.html').matchAll(/assets\/js\/compras-estoque\.js\?v=([^"']+)/g)].map((m) => m[1]);
  const rota = [...ler('assets/js/router.js').matchAll(/import\('\.\/compras-estoque\.js\?v=([^']+)'\)/g)].map((m) => m[1]);
  assert.equal(html.length, 1, 'compras-estoque.html deveria carregar compras-estoque.js com ?v=');
  assert.equal(rota.length, 1, 'router.js deveria importar compras-estoque.js com ?v=');
  assert.equal(html[0], rota[0]);
});

test('a tela não usa mais o resumo nem o cabeçalho de "Gestão de Estoque"', () => {
  const src = ler('assets/js/compras-estoque.js');
  assert.doesNotMatch(src, /Visão Geral|renderVisao|hero-card/);
  assert.match(src, /Saída em lote/);
  assert.match(src, /Baixar XLS/);
});
