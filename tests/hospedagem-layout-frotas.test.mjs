import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A página de Hotéis (Hospedagem ADM) usa o layout padrão das listas do Frotas (24/10/2026): abas sublinhadas, cards que filtram,
// busca com chip, tabela fixa e botões de ícone (patrimonioLayoutFrotas.js). O comportamento das ações não mudou.

const le = (caminho) => readFileSync(new URL(`../${caminho}`, import.meta.url), 'utf8');

test('o controller monta a página no padrão do Frotas', () => {
  const fonte = le('assets/js/adm-hotel.js');
  assert.match(fonte, /from '\.\/patrimonioLayoutFrotas\.js\?v=/);
  assert.match(fonte, /from '\.\/core\/ui\.js'/);
  assert.match(fonte, /class="frotas-hub-tabs"/);
  assert.match(fonte, /frotas-hub-tab-body fm-shell/);
  assert.match(fonte, /injectEstilosFrotas\(\)/);
  for (const aba of ['solicitacoes', 'historico', 'fluxo']) assert.match(fonte, new RegExp(`'${aba}'`));
  // O que saiu do layout antigo: abas em pílula por status, popover de KPI e o hero.
  for (const antigo of ['renderTabsBar', 'openKpi', 'ah-kpi-arrow', 'hero-card']) assert.doesNotMatch(fonte.replace(/renderShellAlojamentos[\s\S]*?\n}/, ''), new RegExp(antigo), `${antigo} voltou`);
});

test('a fila v3 usa cards que filtram, busca com chip, tabela fixa e botões de ícone', () => {
  const fila = le('assets/js/modules/hospedagem/fila-ui.js');
  for (const peca of ['cardFiltro(', 'aoClicarCard(', 'sincronizarCards(', 'iconBtn(', 'class="fm-table"', 'class="fm-search"', 'data-chip']) assert.ok(fila.includes(peca), `fila-ui.js sem ${peca}`);
  // Todas as ações continuam pelos mesmos atributos (o harness e as RPCs dependem deles).
  for (const attr of ['data-v3-cotar', 'data-v3-reservar', 'data-v3-recusar', 'data-v3-extra', 'data-v3-payment']) assert.ok(fila.includes(attr), `perdeu ${attr}`);
  const cot = le('assets/js/modules/hospedagem/cotacao-ui.js');
  for (const attr of ['data-v3-respostas', 'data-v3-pedido-confirmar', 'data-v3-pedido-recusar']) assert.ok(cot.includes(attr), `perdeu ${attr}`);
  assert.doesNotMatch(fila, /ah-v3-item|<select data-v3-filter/);
});

test('histórico do fluxo antigo e fluxo por hotel também no padrão', () => {
  const view = le('assets/js/adm-hotel-view.js');
  for (const peca of ['renderHistorico', 'filtrarHistorico', 'ahHistBusca', 'fm-table', 'cardFiltro(']) assert.ok(view.includes(peca), `view sem ${peca}`);
  assert.doesNotMatch(view, /ah-fluxo-grid|ah-fluxo-card|renderKpiPopover|renderTabsBar/);
});
