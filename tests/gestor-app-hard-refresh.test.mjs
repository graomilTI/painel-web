import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../assets/js/gestor-app.js', import.meta.url), 'utf8');

test('icone Atualizar do App Gestor forca hard refresh (desregistra SW e limpa Cache Storage)', () => {
  // Antes o botão #refreshBtn só limpava o cache de DADOS (localStorage) e
  // recarregava os dados em memória — service-worker.js serve JS/CSS/HTML
  // pelo Cache Storage dele (estratégia "cached || network": responde o
  // cache na hora, só atualiza em segundo plano), então o app continuava
  // rodando o bundle antigo mesmo depois de clicar em Atualizar, até um
  // Ctrl+Shift+R manual. hardRefreshApp() desregistra o service worker e
  // apaga todas as entradas do Cache Storage antes de recarregar a página.
  assert.match(source, /async function hardRefreshApp\(\)/);
  assert.match(source, /navigator\.serviceWorker\.getRegistrations\(\)/);
  assert.match(source, /registro\.unregister\(\)/);
  assert.match(source, /caches\.keys\(\)/);
  assert.match(source, /caches\.delete\(chave\)/);
  assert.match(source, /window\.location\.reload\(\)/);
  assert.match(
    source,
    /document\.getElementById\('refreshBtn'\)\?\.addEventListener\('click', async \(\) => \{\s*showToast\('Atualizando\.\.\.'\);\s*await hardRefreshApp\(\);\s*\}\);/,
  );
});
