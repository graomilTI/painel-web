// Financeiro: o template de html.js precisa abrir e fechar as mesmas tags. Um </div> sobrando (ou faltando) faz o
// navegador fechar o painel cedo e mostrar o conteúdo de uma aba dentro de outra, sem erro algum no console.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fonte = readFileSync(new URL('../assets/js/modules/financeiro/html.js', import.meta.url), 'utf8');
// só a função htmlFinanceiro(), sem o <style> e sem as expressões ${...}
const corpo = fonte.slice(fonte.indexOf('function htmlFinanceiro()'))
  .replace(/<style>[\s\S]*?<\/style>/g, '')
  .replace(/\$\{[^}]*\}/g, '');

for (const tag of ['div', 'section', 'article', 'header', 'table', 'thead', 'tbody', 'form', 'button', 'select']) {
  test(`<${tag}> abre e fecha o mesmo número de vezes`, () => {
    const abre = (corpo.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length;
    const fecha = (corpo.match(new RegExp(`</${tag}>`, 'g')) || []).length;
    assert.equal(abre, fecha, `<${tag}>: ${abre} aberturas e ${fecha} fechamentos`);
  });
}

test('cada aba é um painel direto do cartão (nenhum painel dentro de outro)', () => {
  const ids = [...corpo.matchAll(/class="fin-panel[^"]*" id="(tab-[a-z-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['tab-dashboard', 'tab-fluxo', 'tab-ajustes', 'tab-despesas', 'tab-pagamentos', 'tab-notas-fiscais']);
});
