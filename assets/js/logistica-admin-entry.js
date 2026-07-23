const body = document.body;
const tab = String(body?.dataset?.logisticaTab || 'os').trim().toLowerCase();
const title = String(body?.dataset?.logisticaTitle || 'Logística').trim();

const validTabs = new Set([
  'os',
  'abertura_os',
  'fob',
  'finalizacao',
  'classificadores',
  'conferencias',
  'exportacoes',
  'relatorios',
]);

if (!validTabs.has(tab)) {
  throw new Error(`Aba administrativa da Logística inválida: ${tab}`);
}

function lockRouteHash() {
  const expected = `#${tab}`;
  if (window.location.hash !== expected) {
    history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}${expected}`);
  }
}

function applyPageIdentity() {
  // Guard obrigatório: setar document.title substitui o nó de texto do <title>,
  // o que conta como mutação childList dentro de documentElement -- sem o
  // "!==" abaixo, o MutationObserver reagia à própria escrita e reentrava em
  // applyPageIdentity() indefinidamente (loop síncrono, trava a aba, tela
  // preta, sem nenhum erro no console porque nada lança exceção).
  const fullTitle = `${title} — Logística`;
  if (document.title !== fullTitle) document.title = fullTitle;
  const pageTitle = document.getElementById('pageTitle');
  if (pageTitle && pageTitle.textContent !== title) pageTitle.textContent = title;

  const tabs = document.getElementById('logTabs');
  if (tabs) tabs.setAttribute('aria-hidden', 'true');
}

function renderBootError(error) {
  console.error('[logistica-admin-entry]', error);
  const content = document.getElementById('pageContent');
  if (!content) return;
  content.innerHTML = `
    <section class="card mt-16">
      <div class="log-empty">
        Não foi possível abrir <strong>${title}</strong>.<br>
        <small>${String(error?.message || error)}</small>
      </div>
    </section>
  `;
}

lockRouteHash();
window.addEventListener('hashchange', lockRouteHash);

document.documentElement.classList.add('logistica-admin-isolated');

const style = document.createElement('style');
style.id = 'logistica-admin-isolated-style';
style.textContent = `
  .logistica-admin-isolated #logTabs{display:none!important}
  .logistica-admin-isolated .log-section{display:none!important}
  .logistica-admin-isolated #section-${tab}{display:block!important}
`;
document.head.appendChild(style);

const observer = new MutationObserver(applyPageIdentity);
observer.observe(document.documentElement, { childList: true, subtree: true });
applyPageIdentity();

import('./adm-logistica.js?v=logistica-admin-isolado-20260723-hashfix1')
  .then(() => applyPageIdentity())
  .catch(renderBootError);
