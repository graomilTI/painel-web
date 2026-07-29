// Página "Clientes" da Logística: um único ponto com 3 abas
// (Relatórios | Exportações | BTG), unificando as antigas páginas isoladas
// logistica-relatorios / logistica-exportacoes / btg-logistica (item #78).
//
// Relatórios e Exportações já são abas do módulo monolítico adm-logistica.js
// — reaproveita a mesma técnica de encaminhar clique pro #logTabs oculto já
// usada em logistica-os-entry.js (ver [[painel-web-abertura-os-menu-escondido]]
// e [[painel-web-logistica-os-abas-unificadas]]).
//
// BTG é um módulo estrutural e completamente separado (btg-logistica.js,
// initProtectedPage próprio, sem função de render exportada) — em vez de
// arriscar refatorar 1400+ linhas só pra reaproveitar aqui, a aba BTG carrega
// btg-logistica.html num iframe. O iframe só é criado na primeira vez que a
// aba é aberta e nunca é destruído depois (só escondido via display:none),
// pra não perder o estado/recarregar tudo a cada troca de aba.

const TABS = [
  { key: 'relatorios',   realTab: 'relatorios',   label: 'Relatórios' },
  { key: 'exportacoes',  realTab: 'exportacoes',  label: 'Exportações' },
  { key: 'btg',          realTab: null,           label: 'BTG' },
];

document.documentElement.classList.add('logistica-clientes-page');

const style = document.createElement('style');
style.id = 'logistica-clientes-style';
style.textContent = `
  .logistica-clientes-page #logTabs,
  .logistica-clientes-page #logStats,
  .logistica-clientes-page #logFeedback { display:none!important; }
  .logistica-clientes-page #section-abertura_os,
  .logistica-clientes-page #section-os,
  .logistica-clientes-page #section-fob,
  .logistica-clientes-page #section-finalizacao,
  .logistica-clientes-page #section-ajuste,
  .logistica-clientes-page #section-classificadores,
  .logistica-clientes-page #section-conferencias { display:none!important; }
  /* Aba BTG ativa: esconde as seções do módulo monolítico via classe (não
     inline style) — .log-section.active{display:block} do próprio
     adm-logistica.js tem que continuar funcionando quando o usuário volta
     pra Relatórios/Exportações depois de ter passado pela BTG. */
  .logistica-clientes-page.logistica-clientes-btg-ativa #section-exportacoes,
  .logistica-clientes-page.logistica-clientes-btg-ativa #section-relatorios { display:none!important; }
  .logistica-clientes-page #logisticaClientesHeader { padding:10px 14px!important; }
  .logistica-clientes-page #logisticaClientesHeader .los-bar { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
  .logistica-clientes-page #logisticaClientesHeader .log-tabs { margin:0; }
  .logistica-clientes-page #logisticaBtgFrame { width:100%; height:calc(100vh - 230px); min-height:520px; border:0; border-radius:14px; background:#0d1117; }
`;
document.head.appendChild(style);

let introCard = null;
let btgFrame = null;
let currentKey = null;

function waitFor(selector, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) { resolve(existing); return; }
    const obs = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) { obs.disconnect(); resolve(el); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); reject(new Error(`Tempo esgotado aguardando ${selector}`)); }, timeout);
  });
}

function tabFromHash() {
  const h = String(window.location.hash || '').replace('#', '').toLowerCase();
  const match = TABS.find((t) => t.key === h) || TABS.find((t) => t.realTab && t.realTab.toLowerCase() === h);
  return match?.key || 'relatorios';
}

function ensureBtgFrame() {
  if (btgFrame) return btgFrame;
  const content = document.getElementById('pageContent');
  btgFrame = document.createElement('iframe');
  btgFrame.id = 'logisticaBtgFrame';
  btgFrame.src = './btg-logistica.html';
  btgFrame.style.display = 'none';
  content.appendChild(btgFrame);
  return btgFrame;
}

function activate(key) {
  const target = TABS.find((t) => t.key === key) || TABS[0];
  currentKey = target.key;
  document.querySelectorAll('#logisticaClientesTabs .log-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.key === target.key);
  });

  if (target.key === 'btg') {
    ensureBtgFrame().style.display = '';
    document.documentElement.classList.add('logistica-clientes-btg-ativa');
    if (introCard) introCard.style.display = 'none';
    return;
  }
  document.documentElement.classList.remove('logistica-clientes-btg-ativa');
  if (btgFrame) btgFrame.style.display = 'none';

  const realBtn = document.querySelector(`#logTabs .log-tab[data-tab="${target.realTab}"]`);
  if (realBtn) realBtn.click();
}

async function setup() {
  await waitFor('#logTabs');

  document.title = 'Clientes — Logística';
  const pageTitle = document.getElementById('pageTitle');
  if (pageTitle) pageTitle.textContent = 'Clientes';

  introCard = document.getElementById('logTabs')?.closest('section.card') || null;
  const introHead = introCard?.querySelector(':scope > .section-head');
  if (introHead) introHead.style.display = 'none';
  if (introCard) introCard.style.display = 'none';

  const content = document.getElementById('pageContent');
  const header = document.createElement('section');
  header.className = 'card mt-16';
  header.id = 'logisticaClientesHeader';
  header.innerHTML = `
    <div class="los-bar">
      <div class="log-tabs" id="logisticaClientesTabs">
        ${TABS.map((t) => `<button class="log-tab" data-key="${t.key}" type="button">${t.label}</button>`).join('')}
      </div>
    </div>`;
  content.insertBefore(header, content.firstChild);

  header.querySelector('#logisticaClientesTabs').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-key]');
    if (!btn) return;
    activate(btn.dataset.key);
  });

  activate(tabFromHash());
}

function renderBootError(error) {
  console.error('[logistica-clientes-entry]', error);
  const content = document.getElementById('pageContent');
  if (!content) return;
  content.innerHTML = `
    <section class="card mt-16">
      <div class="log-empty">
        Não foi possível abrir <strong>Clientes</strong>.<br>
        <small>${String(error?.message || error)}</small>
      </div>
    </section>`;
}

import('./adm-logistica.js?v=logistica-admin-isolado-20260723-hashfix1')
  .then(setup)
  .catch(renderBootError);
