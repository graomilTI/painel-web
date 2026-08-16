const VERSION = '20260816-hoteis-todos1';

const $ = (selector, root = document) => root.querySelector(selector);

function ensureTodosButton() {
  const panel = $('#hospRdHoteis');
  if (!panel) return;
  const group = panel.querySelector('.hosp-rd-toolbar-left');
  if (!group || group.querySelector('[data-hosp-rd-hotel-filter="todos"]')) return;

  const firstFilter = group.querySelector('[data-hosp-rd-hotel-filter]');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hosp-rd-btn';
  button.dataset.hospRdHotelFilter = 'todos';
  button.textContent = 'Todos';
  group.insertBefore(button, firstFilter || group.firstChild);
}

function scheduleEnsure() {
  setTimeout(ensureTodosButton, 40);
  setTimeout(ensureTodosButton, 180);
}

function bind(root) {
  if (!root || root.dataset.hospTodosBound === '1') return;
  root.dataset.hospTodosBound = '1';

  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-hosp-rd-tab="hoteis"]') ||
        event.target.closest('[data-hosp-rd-hotel-filter]') ||
        event.target.closest('[data-hosp-rd-action="refresh"]')) {
      scheduleEnsure();
    }
  });

  root.addEventListener('input', (event) => {
    if (event.target.matches('[data-hosp-rd-search="hoteis"]')) scheduleEnsure();
  });

  scheduleEnsure();
}

function init() {
  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    const root = $('#hospRedesignRoot');
    if (root) {
      clearInterval(timer);
      bind(root);
    }
    if (tries > 120) clearInterval(timer);
  }, 100);
  console.info(`[adm-hotel-filtro-todos] ${VERSION}`);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
