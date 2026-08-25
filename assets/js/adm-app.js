import './pwa-register.js';
import { getSession, getUserContext, signOut } from './auth.js';
import { saveUserContext, clearUserContext } from './sessionStore.js';
import { toPanelUrl } from './paths.js';

const root = document.getElementById('admApp');
let deferredInstallPrompt = null;

const MOBILE_ADM_ITEMS = [
  { code: 'compras_estoque', title: 'Estoque', group: 'Compras', description: 'Entradas, saídas, inventário, alertas e histórico de materiais.', path: 'compras-estoque', aliases: ['COMPRAS_ESTOQUE', 'ESTOQUE', 'ALMOXARIFADO', 'COMPRAS_ADM'], priority: true },
  { code: 'compras_adm', title: 'Compras', group: 'Compras', description: 'Solicitações, aprovações e acompanhamento do módulo de compras.', path: 'adm-compras', aliases: ['COMPRAS_ADM'] },
  { code: 'logistica_adm', title: 'Logística', group: 'Logística', description: 'Painel administrativo de logística, finalizações e validações.', path: 'adm-logistica', aliases: ['LOGISTICA_ADM', 'LOGISTICA'] },
  { code: 'logistica_informativos', title: 'Informativos', group: 'Logística', description: 'Comunicados e avisos operacionais para a equipe.', path: 'logistica-informativos', aliases: ['LOGISTICA_INFORMATIVOS', 'LOGISTICA_ADM', 'LOGISTICA'] },
  { code: 'patrimonio', title: 'Patrimônios', group: 'Patrimônios', description: 'Consulta e controle administrativo de patrimônios.', path: 'adm-patrimonio', aliases: ['PATRIMONIO_ADM'] },
  { code: 'hotel', title: 'Hotéis', group: 'Hospedagem', description: 'Reservas, hospedagens e acompanhamento de hotéis.', path: 'adm-hotel#hoteis', aliases: ['ADM_HOTEL', 'HOTEL'] },
  { code: 'hotel_alojamentos', title: 'Alojamentos', group: 'Hospedagem', description: 'Controle de alojamentos e ocupações.', path: 'adm-hotel#alojamentos', aliases: ['ADM_HOTEL', 'HOTEL'] },
  { code: 'financeiro_hospedagem', title: 'Hospedagem', group: 'Financeiro', description: 'Confirmação de pagamento dos lotes de check-out de hospedagem.', path: 'adm-hotel#financeiro', aliases: ['FINANCEIRO_HOSPEDAGEM'] },
  { code: 'rh_plantao', title: 'Plantão', group: 'RH', description: 'Escalas de plantão por setor e data.', path: 'plantao', aliases: ['RH_PLANTAO', 'PLANTAO'] },
  { code: 'frotas_multas', title: 'Multas', group: 'Frotas', description: 'Acompanhamento de multas, ações e pendências.', path: 'frotas-multas', aliases: ['MULTAS', 'FROTAS_MULTAS'] },
  { code: 'frotas_rastreadores', title: 'Rastreadores', group: 'Frotas', description: 'Instalações, remoções e histórico de rastreadores.', path: 'frotas-rastreadores', aliases: ['FROTAS_RASTREADORES', 'RASTREADORES'] },
  { code: 'admin_auditoria', title: 'Auditoria', group: 'Auditoria', description: 'Solicitações, agrupamentos e histórico de auditorias.', path: 'admin-auditoria', aliases: ['ADMIN_AUDITORIA'] },
  { code: 'usuarios_acessos', title: 'Usuários', group: 'Diretoria', description: 'Usuários, permissões e acessos do painel.', path: 'admin-usuarios', aliases: ['ADMIN_USUARIOS', 'USUARIOS_E_ACESSOS'] }
];

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalize(value = '') {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function moduleCodeSet(userContext) {
  const set = new Set();
  for (const mod of userContext?.modules || []) {
    if (mod?.can_view === false) continue;
    const code = normalize(mod?.code || mod?.codigo);
    if (code) set.add(code);
  }
  return set;
}

function isAllowed(item, userContext) {
  if (userContext?.user?.is_master) return true;
  const allowedCodes = moduleCodeSet(userContext);
  const candidates = [item.code, ...(item.aliases || [])].map(normalize).filter(Boolean);
  return candidates.some((candidate) => allowedCodes.has(candidate));
}

function userName(userContext) {
  return userContext?.user?.name || userContext?.user?.email || 'Usuário';
}

function initials(name = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return (parts[0]?.[0] || 'A').toUpperCase();
}

function installStateText() {
  const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true;
  return standalone ? 'Instalado' : 'Pronto para instalar';
}

async function loadUserContext() {
  const session = await getSession();
  if (!session?.user) {
    clearUserContext();
    window.location.replace(toPanelUrl('login.html'));
    return null;
  }

  try {
    const context = await getUserContext(session.user.id);
    if (!context?.user?.active) {
      clearUserContext();
      window.location.replace(toPanelUrl('login.html'));
      return null;
    }
    saveUserContext(context);
    return context;
  } catch (error) {
    clearUserContext();
    console.error('[adm-app] permissões', error);
    window.location.replace(toPanelUrl('login.html'));
    return null;
  }
}

function setupInstallButton() {
  const button = document.getElementById('admInstallBtn');
  if (!button) return;

  button.textContent = installStateText();
  button.disabled = !deferredInstallPrompt;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    button.disabled = false;
    button.textContent = 'Instalar app';
  });

  button.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => null);
    deferredInstallPrompt = null;
    button.disabled = true;
    button.textContent = installStateText();
  });
}

function renderCards(items) {
  if (!items.length) return '<div class="adm-empty">Nenhuma função encontrada para sua busca ou permissão.</div>';
  return items.map((item) => `
    <a class="adm-card ${item.priority ? 'is-priority' : ''}" href="${toPanelUrl(item.path)}">
      <span class="adm-card-group">${esc(item.group)}</span>
      <strong>${esc(item.title)}</strong>
      <small>${esc(item.description)}</small>
      <span class="adm-card-action">Abrir</span>
    </a>`).join('');
}

function setupSearch(cards) {
  const input = document.getElementById('admSearch');
  const list = document.getElementById('admCards');
  if (!input || !list) return;
  input.addEventListener('input', () => {
    const query = normalize(input.value);
    const filtered = cards.filter((item) => normalize(`${item.title} ${item.group} ${item.description}`).includes(query));
    list.innerHTML = renderCards(filtered);
  });
}

function setOnlineState() {
  const badge = document.getElementById('admNetwork');
  if (!badge) return;
  const online = navigator.onLine;
  badge.textContent = online ? 'Online' : 'Sem conexão';
  badge.classList.toggle('is-offline', !online);
}

async function handleSignOut() {
  const button = document.getElementById('admSignOut');
  if (button) {
    button.disabled = true;
    button.textContent = 'Saindo...';
  }
  try {
    await signOut();
  } finally {
    window.location.replace(toPanelUrl('login.html'));
  }
}

function render(userContext) {
  const name = userName(userContext);
  const items = MOBILE_ADM_ITEMS.filter((item) => isAllowed(item, userContext));
  const priorityItems = items.filter((item) => item.priority).length;

  root.className = 'adm-app';
  root.innerHTML = `
    <header class="adm-header">
      <div class="adm-user">
        <div class="adm-avatar">${esc(initials(name))}</div>
        <div><span>App ADM</span><strong>${esc(name)}</strong></div>
      </div>
      <button class="adm-ghost" id="admSignOut" type="button">Sair</button>
    </header>

    <main class="adm-main">
      <section class="adm-hero">
        <span class="adm-eyebrow">Menu administrativo mobile</span>
        <h1>Funções ADM no celular</h1>
        <p>Use os atalhos abaixo para acessar as rotinas liberadas para o seu usuário. Estoque já está preparado para uso mobile.</p>
        <div class="adm-status-row">
          <span class="adm-status" id="admNetwork">Online</span>
          <span class="adm-status">${items.length} funções</span>
          <span class="adm-status">${priorityItems ? 'Estoque mobile' : 'Permissões aplicadas'}</span>
        </div>
      </section>

      <section class="adm-tools">
        <button class="adm-install" id="admInstallBtn" type="button">Pronto para instalar</button>
        <a class="adm-install" href="${toPanelUrl('dashboard')}">Painel completo</a>
      </section>

      <label class="adm-search"><span>Buscar função</span><input id="admSearch" type="search" placeholder="Ex: estoque, multas, logística..." autocomplete="off" /></label>

      <section class="adm-section">
        <div class="adm-section-title"><h2>Atalhos ADM</h2><small>Somente o que seu perfil pode acessar.</small></div>
        <div class="adm-cards" id="admCards">${renderCards(items)}</div>
      </section>
    </main>`;

  document.getElementById('admSignOut')?.addEventListener('click', handleSignOut);
  setupInstallButton();
  setupSearch(items);
  setOnlineState();
  window.addEventListener('online', setOnlineState);
  window.addEventListener('offline', setOnlineState);
}

async function boot() {
  try {
    const userContext = await loadUserContext();
    if (!userContext) return;
    render(userContext);
  } catch (error) {
    console.error('[adm-app]', error);
    root.className = 'adm-app';
    root.innerHTML = `
      <main class="adm-main">
        <section class="adm-hero">
          <span class="adm-eyebrow">App ADM</span>
          <h1>Não foi possível carregar</h1>
          <p>${esc(error?.message || 'Tente entrar novamente no painel.')}</p>
          <a class="adm-install" href="${toPanelUrl('login.html')}">Ir para login</a>
        </section>
      </main>`;
  }
}

boot();
