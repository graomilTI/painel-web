import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filtrarAlojamentos } from '../assets/js/modules/hospedagem-alojamentos/controle-view.js';

// Alojamentos (Hospedagem ADM) no layout das listas do Frotas (24/10/2026): abas sublinhadas no topo da página, cards que filtram,
// busca com chip e tabela fixa em Alojamentos, Pagamentos, Compras e Hospedados. As ações e as consultas ao banco não mudaram.

const le = (caminho) => readFileSync(new URL(`../${caminho}`, import.meta.url), 'utf8');
const modulo = (nome) => le(`assets/js/modules/hospedagem-alojamentos/${nome}.js`);

test('a casca usa as abas do padrão e não tem mais o cabeçalho grande nem a aba única', () => {
  const view = le('assets/js/adm-hotel-view.js');
  const casca = view.slice(view.indexOf('export function renderShellAlojamentos'), view.indexOf('// ─── Histórico'));
  assert.match(casca, /frotas-hub-tabs" id="alojTabs"/);
  assert.match(casca, /id="tab-alojamentos"/);
  assert.doesNotMatch(casca, /hero-card|adm-hosp-tabs/);
  assert.match(le('assets/js/adm-hotel.js'), /injectEstilosFrotas\(\);\s+content\.innerHTML = renderShellAlojamentos\(\)/);
});

test('cada aba monta cards que filtram, busca com chip e tabela fixa', () => {
  for (const [nome, painel] of [['controle-view', 'alojCadPanel'], ['pagamentos', 'alojPayPanel'], ['compras', 'alojBuyPanel']]) {
    const src = modulo(nome);
    assert.ok(src.includes('cardFiltro('), `${nome} sem cards`);
    assert.ok(src.includes('data-chip'), `${nome} sem chip`);
    assert.ok(src.includes(painel), `${nome} sem o painel ${painel}`);
  }
  for (const nome of ['controle-view', 'pagamentos']) assert.ok(modulo(nome).includes('class="fm-table"'), `${nome} sem tabela fixa`);
  assert.match(modulo('controle'), /aoClicarCard\(document\.getElementById\('alojCadPanel'\)/);
  assert.match(modulo('pagamentos'), /aoClicarCard\(\$\('#alojPayPanel'\)/);
  assert.match(modulo('compras'), /aoClicarCard\(\$\('#alojBuyPanel'\)/);
});

test('as abas dos módulos entram em #alojTabs como ds-tab e a separação antiga saiu', () => {
  assert.match(modulo('pagamentos'), /\(document\.getElementById\('alojTabs'\) \|\| shell\)\.insertAdjacentHTML\('afterbegin', navHtml\(\)\)/);
  assert.match(modulo('hospedados'), /querySelector\('#alojTabs \.ds-tabs'\)/);
  assert.match(modulo('hospedados'), /class="ds-tab"/);
  assert.match(modulo('compras'), /#alojTabs \.ds-tabs/);
  assert.doesNotMatch(le('assets/js/adm-hotel-deferred.js'), /separacao/);
});

test('cada modo esconde o cadastro por #alojCadPanel e o Hospedados fecha o painel de Compras', () => {
  assert.match(modulo('pagamentos'), /aloj-pay-mode>#alojCadPanel,\.aloj-v2-shell\.aloj-buy-mode>#alojCadPanel\{display:none!important\}/);
  assert.match(modulo('hospedados'), /aloj-hosp-mode>#alojCadPanel\{display:none!important\}/);
  assert.match(modulo('hospedados'), /classList\.remove\('aloj-pay-mode', 'aloj-buy-mode'\)/);
});

test('o filtro do cadastro combina card e busca', () => {
  const linhas = [
    { nome: 'Casa Girassol', cidade: 'Sorriso', uf: 'MT', status: 'ATIVO', contrato_fim: '' },
    { nome: 'Pousada Velha', cidade: 'Nova Mutum', uf: 'MT', status: 'INATIVO', contrato_fim: '' },
    { nome: 'Alojamento Cerrado', cidade: 'Lucas', uf: 'MT', status: 'ATIVO', responsavel: 'Paulo', contrato_fim: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10) },
  ];
  const nomes = (f) => filtrarAlojamentos(linhas, f).map((l) => l.nome);
  assert.deepEqual(nomes({}), ['Casa Girassol', 'Pousada Velha', 'Alojamento Cerrado']);
  assert.deepEqual(nomes({ filtro: 'ATIVO' }), ['Casa Girassol', 'Alojamento Cerrado']);
  assert.deepEqual(nomes({ filtro: 'INATIVO' }), ['Pousada Velha']);
  assert.deepEqual(nomes({ filtro: 'contrato' }), ['Alojamento Cerrado']);
  assert.deepEqual(nomes({ query: 'paulo' }), ['Alojamento Cerrado']);
  assert.deepEqual(nomes({ query: 'MUTUM', filtro: 'ATIVO' }), []);
});
