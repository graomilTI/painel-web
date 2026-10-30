import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Menu Financeiro: rótulos iguais às abas da tela e nenhum item repetido para a mesma aba.
const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFileSync(new URL(caminho, raiz), 'utf8');

test('Adiantamentos abre a aba #despesas sem parâmetro que ninguém lê', () => {
  const config = ler('assets/js/menuConfig.js');
  assert.match(config, /"financeiro_adiantamentos", "Adiantamentos", "financeiro#despesas"/);
  assert.doesNotMatch(config, /modo=adiantamentos/);
});

test('a aba da tela se chama Adiantamentos, como no menu', () => {
  const html = ler('assets/js/modules/financeiro/html.js');
  assert.match(html, /data-tab="despesas" type="button">Adiantamentos<\/button>/);
});

test('item de segurança do menu não duplica o Adiantamentos do cadastro', () => {
  const menu = ler('assets/js/menuBuilder.js');
  assert.match(menu, /code: 'financeiro_despesas',\s*label: 'Adiantamentos'/);
  assert.match(menu, /mesmoDestino/);
  assert.match(menu, /split\('\?'\)\[0\] === fallbackItem\.path/);
});

test('Cotações tem o título certo no HTML estático', () => {
  assert.match(ler('financeiro-cotacoes.html'), /<h1 id="pageTitle">Cotações<\/h1>/);
});
