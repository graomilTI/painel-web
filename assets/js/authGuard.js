import { getSession, getUserContext, signOut } from './auth.js';
import { saveUserContext, clearUserContext } from './sessionStore.js';
import { toPanelUrl } from './paths.js';
import { PANEL_MENU } from './menuConfig.js';
import { logActivity } from './activityLogger.js';

// Guarda contra loop de redirecionamento login<->dashboard: se o contexto do
// usuário falhar repetidas vezes num curto intervalo (ex: instabilidade da
// RPC logo após login), a sessão em si continua válida e login.js manda de
// volta pra cá — sem isso, vira um ping-pong infinito que trava a aba.
const BOUNCE_KEY = 'grao1000:auth-bounce-guard';
const BOUNCE_WINDOW_MS = 10000;
const BOUNCE_LIMIT = 2;

function registerBounceAndCheckLoop() {
  let entry = null;
  try { entry = JSON.parse(sessionStorage.getItem(BOUNCE_KEY) || 'null'); } catch { entry = null; }
  const now = Date.now();
  entry = (!entry || now - entry.ts > BOUNCE_WINDOW_MS) ? { count: 1, ts: now } : { count: entry.count + 1, ts: now };
  try { sessionStorage.setItem(BOUNCE_KEY, JSON.stringify(entry)); } catch {}
  return entry.count > BOUNCE_LIMIT;
}

function clearBounceGuard() {
  try { sessionStorage.removeItem(BOUNCE_KEY); } catch {}
}

function normalize(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function normalizePath(value = '') {
  const raw = String(value || '').split('?')[0].trim();
  const [pathname, hash = ''] = raw.split('#', 2);
  const cleanPath = pathname
    .replace(/^\/+/, '')
    .replace(/\.html$/i, '')
    .trim();
  const cleanHash = normalize(hash).replace(/[^a-z0-9_-]/g, '');
  return cleanHash ? `${cleanPath}#${cleanHash}` : cleanPath;
}

export function getCurrentPanelPath() {
  const clean = normalizePath(window.location.pathname);
  const parts = clean.split('/').filter(Boolean);
  const painelIndex = parts.findIndex((part) => normalize(part) === 'painel');
  const last = painelIndex >= 0 ? parts[painelIndex + 1] : parts[parts.length - 1];
  return normalizePath(`${last || 'dashboard'}${window.location.hash || ''}`);
}

function isGestorContext(context) {
  const role = normalize(context?.user?.role || context?.perfil_codigo || context?.perfil_nome || context?.role);
  const department = normalize(context?.department?.code || context?.department?.name || context?.setor);
  return role === 'gestor' || department === 'gestor';
}

function buildModuleCodeSet(context) {
  const set = new Set();
  for (const mod of context?.modules || []) {
    if (mod?.can_view === false) continue;
    const code = normalize(mod?.code || mod?.codigo);
    if (code) set.add(code);
  }
  return set;
}

function itemIsAllowedByModules(item, allowedCodes) {
  const itemCode = normalize(item?.code);

  // Bônus é uma permissão financeira/operacional sensível e precisa ser
  // liberado individualmente em Usuários e Acessos. Os aliases legados de
  // Conferência não podem abrir essa tela nem exibir o submenu.
  if (itemCode === 'conferencia_bonus') {
    return allowedCodes.has('conferencia_bonus');
  }

  const candidates = [item.code, ...(Array.isArray(item.aliases) ? item.aliases : [])]
    .map(normalize)
    .filter(Boolean);
  return candidates.some((code) => allowedCodes.has(code));
}

function permissionRoute(item) {
  const code = normalize(item?.code);
  if (['financeiro_adiantamentos', 'financeiro_alimentacao', 'financeiro_despesas'].includes(code)) {
    return { ...item, path: 'financeiro#despesas' };
  }
  return item;
}

const CHAMADOS_TI_ITEM = { code: 'chamados_ti', label: 'Chamados de TI', path: 'chamados-ti', aliases: ['CHAMADOS_TI', 'TI_CHAMADOS', 'HELPDESK', 'SUPORTE_TI'] };

export function allowedItemsForContext(context) {
  if (context?.user?.is_master) {
    return PANEL_MENU.flatMap((section) => section.items || []).map(permissionRoute).concat(CHAMADOS_TI_ITEM);
  }

  // O módulo /painel/logistica pertence ao fluxo do Gestor. Ele não depende das
  // permissões administrativas da seção LOGÍSTICA e continua disponível apenas
  // no contexto Gestor.
  if (isGestorContext(context)) {
    const allowedSections = new Set(['inicio', 'gestor']);
    return PANEL_MENU
      .filter((section) => allowedSections.has(normalize(section.section)))
      .flatMap((section) => section.items || [])
      .map(permissionRoute)
      .concat(CHAMADOS_TI_ITEM);
  }

  const allowedCodes = buildModuleCodeSet(context);

  // Cada submenu administrativo da Logística possui rota e módulo próprios.
  // LOGISTICA_ADM/LOGISTICA continuam como aliases amplos nos itens do menu,
  // enquanto códigos específicos liberam somente a página correspondente.
  return PANEL_MENU
    .flatMap((section) => section.items || [])
    .filter((item) => itemIsAllowedByModules(item, allowedCodes))
    .map(permissionRoute)
    .concat(CHAMADOS_TI_ITEM);
}

export function getFirstAllowedPath(context) {
  const items = allowedItemsForContext(context);
  const preferred = items.find((item) => normalizePath(item.path) === 'programacao') || items[0];
  return preferred?.path || 'dashboard';
}

export function canOpenPath(context, path) {
  if (context?.user?.is_master) return true;

  const normalizedPath = normalizePath(path);
  if (!normalizedPath || normalizedPath === 'login') return true;

  const allowedPaths = new Set(
    allowedItemsForContext(context).map((item) => normalizePath(item.path)).filter(Boolean)
  );

  if (allowedPaths.has(normalizedPath)) return true;

  // O hash nas novas páginas da Logística apenas fixa a tela interna carregada
  // pelo entrypoint. A permissão continua vinculada à rota-base do submenu.
  const [basePath, hash = ''] = normalizedPath.split('#', 2);
  if (hash && allowedPaths.has(basePath)) return true;

  return false;
}

function userCanOpenCurrentPage(context) {
  return canOpenPath(context, getCurrentPanelPath());
}

export async function requireAuth() {
  const session = await getSession();
  if (!session?.user) {
    clearUserContext();
    window.location.replace(toPanelUrl('login.html'));
    return null;
  }

  let context = null;
  try {
    context = await getUserContext(session.user.id);
    saveUserContext(context);
    clearBounceGuard();
  } catch (error) {
    clearUserContext();
    console.error('Erro ao carregar permissões do usuário:', error);
    if (registerBounceAndCheckLoop()) {
      console.error('[authGuard] loop de redirecionamento detectado — encerrando sessão.');
      try { await signOut(); } catch {}
      clearBounceGuard();
      window.location.replace(`${toPanelUrl('login.html')}?erro=sessao`);
      return null;
    }
    window.location.replace(toPanelUrl('login.html'));
    return null;
  }

  if (!context?.user?.active) {
    clearUserContext();
    window.location.replace(toPanelUrl('login.html'));
    return null;
  }

  if (!userCanOpenCurrentPage(context)) {
    window.location.replace(toPanelUrl(getFirstAllowedPath(context)));
    return null;
  }

  const pagina = getCurrentPanelPath();
  logActivity('page_access', `Acessou: ${pagina}`, pagina, null);

  return context;
}
