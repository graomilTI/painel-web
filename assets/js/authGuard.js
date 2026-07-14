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

const LOGISTICA_CODES = new Set([
  'logistica',
  'logistica_adm',
  'logistica_informativos',
  'logistica_finalizacao_os',
  'finalizacao_os',
  'logistica_classificadores',
  'logistica_conferencias',
  'logistica_exportacoes',
  'logistica_relatorios_cliente',
  'logistica_btg',
  'btg_logistica',
  'btg',
]);

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

function hasLogisticaAccess(context) {
  if (context?.user?.is_master) return true;
  const allowedCodes = buildModuleCodeSet(context);
  return [...allowedCodes].some((code) => LOGISTICA_CODES.has(code) || code.startsWith('logistica_'));
}

function itemIsAllowedByModules(item, allowedCodes) {
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

  if (isGestorContext(context)) {
    const allowedSections = new Set(['inicio', 'gestor']);
    return PANEL_MENU
      .filter((section) => allowedSections.has(normalize(section.section)))
      .flatMap((section) => section.items || [])
      .map(permissionRoute)
      .concat(CHAMADOS_TI_ITEM);
  }

  const allowedCodes = buildModuleCodeSet(context);
  const unlockLogistica = hasLogisticaAccess(context);

  return PANEL_MENU.flatMap((section) => {
    const isLogisticaSection = normalize(section.section) === 'logistica';
    return (section.items || []).filter((item) => (
      itemIsAllowedByModules(item, allowedCodes) || (unlockLogistica && isLogisticaSection)
    ));
  })
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

  const [basePath] = normalizedPath.split('#', 2);

  // Qualquer permissão pertencente à família LOGÍSTICA libera o painel inteiro
  // e todas as abas internas. Isso evita o ciclo adm-logistica -> dashboard
  // quando o usuário possui um código específico, mas não LOGISTICA_ADM.
  if (
    hasLogisticaAccess(context) &&
    ['adm-logistica', 'logistica-informativos', 'btg-logistica'].includes(basePath)
  ) {
    return true;
  }

  const allowedPaths = new Set(
    allowedItemsForContext(context).map((item) => normalizePath(item.path)).filter(Boolean)
  );

  if (allowedPaths.has(normalizedPath)) return true;

  // Quando a rota-base está autorizada, o hash representa apenas uma aba
  // interna do mesmo módulo (ex.: financeiro#dashboard ou adm-logistica#fob).
  // Permissões que liberam somente uma aba específica continuam restritas,
  // pois nesse caso allowedPaths não contém a rota-base sem hash.
  const [, hash = ''] = normalizedPath.split('#', 2);
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
