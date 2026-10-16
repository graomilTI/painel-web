import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aoClicarCard, cardFiltro, iconBtn, ligarCards, sincronizarCards, tabelaCss } from '../assets/js/modules/frotas-ui-lista.js';

// Layout novo das listas do Frotas: cards de resumo clicáveis (filtro), busca com chip, tabela com cabeçalho fixo.

const ler = (c) => readFileSync(new URL(`../${c}`, import.meta.url), 'utf8');
const MODULOS = ['motoristas', 'manutencao', 'troca-oleo', 'checklists', 'multas', 'veiculos', 'rastreadores'];

test('card clicável: botão com a chave do filtro e o atributo pedido; sem filtro vira card informativo', () => {
  const html = cardFiltro({ filtro: 'vencida', label: 'Vencidas', tone: 'red', icone: 'alerta', kpi: 'data-kpi-vencidas', valor: '7' });
  assert.match(html, /<button type="button" class="fm-kcard tone-red" data-filtro="vencida"/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /<strong data-kpi-vencidas>7<\/strong>/);
  const legado = cardFiltro({ atributo: 'data-kpi-filter', filtro: 'todos', label: 'Total', ativo: true });
  assert.match(legado, /data-kpi-filter="todos"/);
  assert.match(legado, /class="fm-kcard tone-blue active"/);
  assert.match(legado, /aria-pressed="true"/);
  const info = cardFiltro({ label: 'Valor', icone: 'dinheiro', kpi: 'data-kpi-valor', valor: 'R$ 0,00' });
  assert.match(info, /^<div class="fm-kcard info/);
  assert.doesNotMatch(info, /data-filtro/);
});

test('rótulo e dica são escapados (nada de HTML solto vindo de texto)', () => {
  const html = cardFiltro({ filtro: 'x', label: '<b>"A"</b>', dica: "d'ica" });
  assert.doesNotMatch(html, /<b>/);
  assert.match(html, /&lt;b&gt;/);
});

function containerFalso() {
  const ouvintes = new Set();
  return {
    ouvintes,
    addEventListener: (_t, fn) => ouvintes.add(fn),
    removeEventListener: (_t, fn) => ouvintes.delete(fn),
    querySelectorAll: () => [],
    querySelector: () => null,
    clicar(alvo) { for (const fn of [...ouvintes]) fn({ target: alvo }); },
  };
}
const alvoCard = (filtro) => ({ closest: (sel) => (sel === '[data-filtro]' ? { dataset: { filtro } } : null) });
const alvoLimpar = { closest: (sel) => (sel === '[data-limpar-filtro]' ? {} : null) };

test('montar a aba de novo não acumula ouvintes (senão o clique ligaria e desligaria o filtro)', () => {
  const c = containerFalso();
  let estado = 'todos';
  for (let i = 0; i < 3; i++) ligarCards(c, { obter: () => estado, definir: (f) => { estado = f; }, aoMudar: () => {} });
  assert.equal(c.ouvintes.size, 1);
  c.clicar(alvoCard('vencida'));
  assert.equal(estado, 'vencida');
});

test('clicar de novo no mesmo card (ou no ✕ do chip) volta para "todos"', () => {
  const c = containerFalso();
  let estado = 'todos'; let render = 0;
  ligarCards(c, { obter: () => estado, definir: (f) => { estado = f; }, aoMudar: () => { render++; } });
  c.clicar(alvoCard('falha')); assert.equal(estado, 'falha');
  c.clicar(alvoCard('aprovado')); assert.equal(estado, 'aprovado');
  c.clicar(alvoCard('aprovado')); assert.equal(estado, 'todos');
  c.clicar(alvoCard('falha')); c.clicar(alvoLimpar); assert.equal(estado, 'todos');
  assert.equal(render, 5);
});

test('aoClicarCard ignora cliques fora dos cards', () => {
  const c = containerFalso(); let chamou = false;
  aoClicarCard(c, () => { chamou = true; });
  c.clicar({ closest: () => null });
  assert.equal(chamou, false);
});

test('sincronizarCards marca o card ativo e mostra o chip só quando há filtro', () => {
  const cards = [{ dataset: { filtro: 'todos' }, setAttribute(k, v) { this[k] = v; } }, { dataset: { filtro: 'sem_termo', rotulo: 'Sem termo' }, setAttribute(k, v) { this[k] = v; } }];
  const chip = { innerHTML: '' };
  const c = { querySelectorAll: () => cards, querySelector: (sel) => (sel === '[data-chip]' ? chip : sel === '[data-filtro="sem_termo"]' ? cards[1] : null) };
  sincronizarCards(c, 'sem_termo');
  assert.equal(cards[1]['aria-pressed'], 'true');
  assert.equal(cards[0]['aria-pressed'], 'false');
  assert.match(chip.innerHTML, /Filtro: Sem termo/);
  sincronizarCards(c, 'todos');
  assert.equal(chip.innerHTML, '');
});

test('botão de ícone tem título e rótulo acessível', () => {
  const html = iconBtn('data-edit', 'abc', '', 'Editar', 'editar');
  assert.match(html, /title="Editar" aria-label="Editar"/);
  assert.match(html, /<svg/);
  assert.match(tabelaCss('fv'), /\.fv-table th\{position:sticky/);
});

test('todas as listas usam o módulo de layout e têm cards no lugar do grid antigo', () => {
  for (const nome of MODULOS) {
    const src = ler(`assets/js/modules/frotas-${nome}.js`);
    assert.match(src, /from '\.\/frotas-ui-lista\.js\?v=/, `${nome} deveria importar frotas-ui-lista`);
    assert.match(src, /ESTILOS_LISTA/, `${nome} deveria injetar ESTILOS_LISTA`);
    assert.doesNotMatch(src, /class="(?:fm|fv)-grid"/, `${nome} ainda tem o grid de KPIs antigo`);
  }
  for (const nome of ['manutencao', 'troca-oleo', 'checklists']) {
    const src = ler(`assets/js/modules/frotas-${nome}.js`);
    assert.match(src, /ligarCards\(container/);
    assert.match(src, /state\.filtro && state\.filtro !== 'todos'/);
  }
});

test('o ?v= dos módulos de lista é o mesmo em todos os imports e carregadores', () => {
  const arquivos = [
    'assets/js/frotas-cadastros.js', 'assets/js/frotas-manutencao-grupo.js', 'assets/js/frotas-ocorrencias.js', 'assets/js/frotas-multas.js',
    'assets/js/router.js', ...MODULOS.map((m) => `assets/js/modules/frotas-${m}.js`),
    'frotas-cadastros.html', 'frotas-manutencao-grupo.html', 'frotas-ocorrencias.html', 'frotas-multas.html',
  ];
  const nomes = ['frotas-ui-lista', 'frotas-cadastros', 'frotas-manutencao-grupo', 'frotas-ocorrencias', 'frotas-multas', 'frotas-multas-fluxo', ...MODULOS.map((m) => `frotas-${m}`), 'frotas-motoristas-termo', 'frotas-termo-pdf', 'frotas-termo-veiculos'];
  const re = new RegExp(`(?:${nomes.join('|')})\\.js\\?v=([\\w-]+)`, 'g');
  const tokens = new Set();
  for (const f of arquivos) for (const m of ler(f).matchAll(re)) tokens.add(m[1]);
  assert.equal(tokens.size, 1, `tokens diferentes: ${[...tokens].join(', ')}`);
});
