import { toPanelUrl } from './paths.js';
import { PANEL_MENU } from './menuConfig.js';
import { supabase } from './supabaseClient.js';

const MENU_STORAGE_KEY = 'painel_sidebar_open_sections';
const PREFETCHED_URLS = new Set();

function normalizeCode(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isGestorContext(userContext) {
  const role = normalizeCode(userContext?.user?.role || userContext?.perfil_codigo || userContext?.perfil_nome || userContext?.role);
  const department = normalizeCode(userContext?.department?.code || userContext?.department?.name || userContext?.setor);
  return role === 'gestor' || department === 'gestor';
}

function prefetchUrl(url) {
  try {
    const absolute = new URL(url, window.location.href).toString();
    if (PREFETCHED_URLS.has(absolute)) return;
    PREFETCHED_URLS.add(absolute);

    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = absolute;
    link.as = 'document';
    document.head.appendChild(link);
  } catch {}
}

function shouldHandleAsNormalNavigation(event) {
  return !(
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

function loadOpenSections() {
  try {
    const raw = localStorage.getItem(MENU_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveOpenSections(sectionNames) {
  try {
    localStorage.setItem(MENU_STORAGE_KEY, JSON.stringify(sectionNames));
  } catch {}
}


function buildPanelHref(path = '') {
  const target = String(path || '')
    .replace(/^\/+/, '')
    .replace(/\.html$/i, '');

  const host = String(window.location.hostname || '').toLowerCase();
  if (host === 'grao1000.com.br' || host === 'www.grao1000.com.br') {
    return target ? `/painel/${target}`.replace(/([^:]\/)\/+/, '$1') : '/painel';
  }

  return toPanelUrl(target);
}

function normalizePath(value = '') {
  return ('/' + String(value || '').replace(/^\.\//, '').replace(/^\//, '')).replace(/\/+/g, '/');
}

function buildAllowedCodeSet(userContext) {
  const set = new Set();
  for (const mod of userContext?.modules || []) {
    if (mod?.can_view === false) continue;
    const code = normalizeCode(mod?.code);
    if (code) set.add(code);
  }
  return set;
}

function isItemAllowed(item, allowedCodes) {
  const candidates = [item.code, ...(Array.isArray(item.aliases) ? item.aliases : [])]
    .map(normalizeCode)
    .filter(Boolean);
  return candidates.some((code) => allowedCodes.has(code));
}

function ensureOperationalSection(menuSections, userContext) {
  const sections = Array.isArray(menuSections) ? menuSections.map((section) => ({ ...section, items: [...(section.items || [])] })) : [];
  const hasOperational = sections.some((section) => normalizeCode(section.section) === 'operacional');
  if (hasOperational) return sections;

  const operationalItem = {
    code: 'operacional_mapa',
    label: 'Mapa de Direcionamento',
    path: 'adm-operacional',
    aliases: ['OPERACIONAL', 'OPERACIONAL_MAPA', 'MAPA_DIRECIONAMENTO']
  };

  const canShow = Boolean(userContext?.user?.is_master) || isItemAllowed(operationalItem, buildAllowedCodeSet(userContext));
  if (!canShow) return sections;

  const indexRh = sections.findIndex((section) => normalizeCode(section.section) === 'recursos humanos');
  const insertAt = indexRh >= 0 ? indexRh + 1 : sections.length;
  sections.splice(insertAt, 0, { section: 'OPERACIONAL', items: [operationalItem] });
  return sections;
}


const FINANCEIRO_FAILSAFE_ITEMS = [
  {
    code: 'financeiro_fluxo_caixa',
    label: 'Fluxo de Caixa',
    path: 'financeiro',
    aliases: ['FINANCEIRO', 'FLUXO_CAIXA', 'FINANCEIRO_FLUXO_CAIXA']
  },
  {
    code: 'financeiro_despesas',
    label: 'Despesas',
    path: 'financeiro#despesas',
    aliases: ['DESPESAS', 'FINANCEIRO_DESPESAS', 'ADIANTAMENTOS', 'FINANCEIRO_ADIANTAMENTOS', 'ALIMENTACAO', 'ALIMENTAÇÃO', 'FINANCEIRO_ALIMENTACAO', 'DIARIAS', 'DIÁRIAS']
  },
  {
    code: 'financeiro_pagamentos',
    label: 'Pagamentos',
    path: 'financeiro#pagamentos',
    aliases: ['FINANCEIRO', 'PAGAMENTOS', 'FINANCEIRO_PAGAMENTOS']
  }
];

function ensureFinanceiroSection(menuSections, userContext) {
  const sections = Array.isArray(menuSections)
    ? menuSections.map((section) => ({
        ...section,
        items: (section.items || []).filter((item) => {
          const itemCode = normalizeCode(item?.code || item?.label || item?.path);
          const itemLabel = normalizeCode(item?.label || item?.nome || item?.modulo || '');
          const itemPath = normalizeCode(item?.path || item?.rota || '');
          const sectionCode = normalizeCode(section?.section);
          if (sectionCode === 'diretoria' && itemCode === 'financeiro') return false;
          if (sectionCode === 'financeiro') {
            const isOldAdiantamento = itemCode.includes('adiantamento') || itemLabel.includes('adiantamento');
            const isOldAlimentacao = itemCode.includes('alimentacao') || itemLabel.includes('alimentacao');
            const oldPointsToPayments = itemPath.includes('financeiro#pagamentos');
            if ((isOldAdiantamento || isOldAlimentacao) && oldPointsToPayments) return false;
          }
          return true;
        }),
      }))
    : [];

  const allowedCodes = buildAllowedCodeSet(userContext);
  const fallbackItems = Boolean(userContext?.user?.is_master)
    ? FINANCEIRO_FAILSAFE_ITEMS
    : FINANCEIRO_FAILSAFE_ITEMS.filter((item) => isItemAllowed(item, allowedCodes));

  if (!fallbackItems.length) return sections.filter((section) => section.items.length > 0);

  const financeiroIndex = sections.findIndex((section) => normalizeCode(section.section) === 'financeiro');
  if (financeiroIndex >= 0) {
    fallbackItems.forEach((fallbackItem) => {
      const exists = sections[financeiroIndex].items.some((item) => normalizeCode(item.code) === normalizeCode(fallbackItem.code));
      if (!exists) sections[financeiroIndex].items.push(fallbackItem);
    });
    return sections.filter((section) => section.items.length > 0);
  }

  const relatoriosIndex = sections.findIndex((section) => normalizeCode(section.section) === 'relatorios');
  const diretoriaIndex = sections.findIndex((section) => normalizeCode(section.section) === 'diretoria');
  const insertAt = relatoriosIndex >= 0 ? relatoriosIndex + 1 : (diretoriaIndex >= 0 ? diretoriaIndex : sections.length);
  sections.splice(insertAt, 0, { section: 'FINANCEIRO', items: fallbackItems });
  return sections.filter((section) => section.items.length > 0);
}

const FROTAS_FAILSAFE_ITEMS = [
  {
    code: 'frotas_excesso_velocidade',
    label: 'Excesso de Velocidade',
    path: 'frotas',
    aliases: ['FROTAS', 'EXCESSO_VELOCIDADE', 'FROTAS_EXCESSO_VELOCIDADE']
  },
  {
    code: 'frotas_veiculos',
    label: 'Veículos',
    path: 'frotas-veiculos',
    aliases: ['FROTAS_VEICULOS', 'VEICULOS', 'VEÍCULOS', 'FROTA_VEICULOS']
  },
  {
    code: 'frotas_multas',
    label: 'Multas',
    path: 'frotas-multas',
    aliases: ['MULTAS', 'FROTAS_MULTAS']
  },
  {
    code: 'frotas_historico',
    label: 'Histórico',
    path: 'frotas-historico',
    aliases: ['FROTAS_HISTORICO', 'HISTORICO_FROTAS']
  }
];

const TI_FAILSAFE_ITEMS = [
  {
    code: 'ti_integracoes',
    label: 'Integrações',
    path: 'ti-integracoes',
    aliases: ['TI', 'INTEGRACOES', 'TI_INTEGRACOES', 'CONFIG_INTEGRACOES']
  }
];

function ensureTiSection(menuSections, userContext) {
  const sections = Array.isArray(menuSections)
    ? menuSections.map((section) => ({ ...section, items: [...(section.items || [])] }))
    : [];

  const allowedCodes = buildAllowedCodeSet(userContext);
  const fallbackItems = Boolean(userContext?.user?.is_master)
    ? TI_FAILSAFE_ITEMS
    : TI_FAILSAFE_ITEMS.filter((item) => isItemAllowed(item, allowedCodes));

  if (!fallbackItems.length) return sections;

  const tiIndex = sections.findIndex((section) => normalizeCode(section.section) === 'ti');
  if (tiIndex >= 0) {
    fallbackItems.forEach((fallbackItem) => {
      const exists = sections[tiIndex].items.some((item) => normalizeCode(item.code) === normalizeCode(fallbackItem.code));
      if (!exists) sections[tiIndex].items.push(fallbackItem);
    });
    return sections;
  }

  const frotasIndex = sections.findIndex((section) => normalizeCode(section.section) === 'frotas');
  const insertAt = frotasIndex >= 0 ? frotasIndex + 1 : sections.length;
  sections.splice(insertAt, 0, { section: 'TI', items: fallbackItems });
  return sections;
}


function ensureFrotasSection(menuSections, userContext) {
  const sections = Array.isArray(menuSections)
    ? menuSections.map((section) => ({ ...section, items: [...(section.items || [])] }))
    : [];

  const allowedCodes = buildAllowedCodeSet(userContext);
  const fallbackItems = Boolean(userContext?.user?.is_master)
    ? FROTAS_FAILSAFE_ITEMS
    : FROTAS_FAILSAFE_ITEMS.filter((item) => isItemAllowed(item, allowedCodes));

  if (!fallbackItems.length) return sections;

  const frotasIndex = sections.findIndex((section) => normalizeCode(section.section) === 'frotas');
  if (frotasIndex >= 0) {
    fallbackItems.forEach((fallbackItem) => {
      const exists = sections[frotasIndex].items.some((item) => normalizeCode(item.code) === normalizeCode(fallbackItem.code));
      if (!exists) sections[frotasIndex].items.push(fallbackItem);
    });
    return sections;
  }

  const operacionalIndex = sections.findIndex((section) => normalizeCode(section.section) === 'operacional');
  const insertAt = operacionalIndex >= 0 ? operacionalIndex + 1 : sections.length;
  sections.splice(insertAt, 0, { section: 'FROTAS', items: fallbackItems });
  return sections;
}

export function buildAllowedMenu(userContext) {
  if (!userContext) return [];

  if (userContext.user?.is_master) {
    return ensureFinanceiroSection(ensureTiSection(ensureFrotasSection(ensureOperationalSection(PANEL_MENU.map((section) => ({ ...section, items: [...section.items] })), userContext), userContext), userContext), userContext);
  }

  // Regra de segurança visual: perfil/setor GESTOR enxerga somente INÍCIO + GESTOR.
  // Mesmo que algum contexto antigo/cache retorne módulos administrativos, eles não entram no menu.
  if (isGestorContext(userContext)) {
    const allowedSections = new Set(['inicio', 'gestor']);
    return PANEL_MENU
      .filter((section) => allowedSections.has(normalizeCode(section.section)))
      .map((section) => ({ ...section, items: [...section.items] }))
      .filter((section) => section.items.length > 0);
  }

  const allowedCodes = buildAllowedCodeSet(userContext);

  return ensureFinanceiroSection(ensureTiSection(ensureFrotasSection(ensureOperationalSection(PANEL_MENU
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => isItemAllowed(item, allowedCodes)),
    }))
    .filter((section) => section.items.length > 0), userContext), userContext), userContext), userContext);
}

export function flattenAllowedMenu(userContext) {
  return buildAllowedMenu(userContext).flatMap((section) =>
    section.items.map((item) => ({ ...item, section: section.section }))
  );
}


function ensureProgramacaoBlockStyle() {
  if (document.getElementById('programacao-os-block-style')) return;
  const style = document.createElement('style');
  style.id = 'programacao-os-block-style';
  style.textContent = `
    .menu-list a.os-pending-blocked{
      color:#fecaca !important;
      border-color:rgba(239,68,68,.55) !important;
      background:rgba(127,29,29,.28) !important;
      box-shadow:inset 3px 0 0 #ef4444;
    }
    .menu-list a.os-pending-blocked::after{
      content:'OS pendente';
      display:inline-flex;
      margin-left:8px;
      padding:2px 6px;
      border-radius:999px;
      font-size:10px;
      font-weight:900;
      color:#7f1d1d;
      background:#fecaca;
      vertical-align:middle;
    }
  `;
  document.head.appendChild(style);
}

async function markProgramacaoIfOsPending(container, userContext) {
  try {
    const programacaoLink = [...container.querySelectorAll('a')].find((link) => normalizePath(link.getAttribute('href') || '').includes('/programacao'));
    if (!programacaoLink) return;

    const today = new Date().toISOString().slice(0, 10);
    const supervisoes = Array.isArray(userContext?.user?.supervisoes) && userContext.user.supervisoes.length
      ? userContext.user.supervisoes
      : userContext?.user?.supervisao
        ? [userContext.user.supervisao]
        : null;

    let query = supabase
      .from('operacional_os')
      .select('id')
      .eq('status_gestor', 'AGUARDAR')
      .is('configurada_em', null)
      .gte('data_os', today)
      .lte('data_os', today);

    if (supervisoes?.length) {
      query = query.in('supervisao', supervisoes);
    }

    const { data, error } = await query.limit(1);
    if (error || !Array.isArray(data) || !data.length) return;
    ensureProgramacaoBlockStyle();
    programacaoLink.classList.add('os-pending-blocked');
    programacaoLink.title = 'Existem O.S. pendentes. Ajuste o submenu OS antes de acessar Programação.';
    if (!programacaoLink.dataset.osPendingBound) {
      programacaoLink.addEventListener('click', (event) => {
        if (!programacaoLink.classList.contains('os-pending-blocked')) return;
        event.preventDefault();
        alert('Antes de acessar Programação, ajuste as O.S. pendentes no submenu OS.');
        window.location.href = buildPanelHref('os');
      });
      programacaoLink.dataset.osPendingBound = '1';
    }
  } catch (error) {
    console.warn('Não foi possível validar pendências de O.S. para o menu.', error);
  }
}

export function renderMenu(container, menuSections, currentPath = '', userContext = null) {
  if (!container) return;

  container.innerHTML = '';
  const normalizedCurrent = normalizePath(`${currentPath || window.location.pathname}${window.location.hash || ''}`);
  const storedOpenSections = new Set(loadOpenSections());

  menuSections.forEach((section) => {
    const sectionEl = document.createElement('section');
    sectionEl.className = 'menu-section';

    const hasItems = Array.isArray(section.items) && section.items.length > 0;
    const hasActiveItem = (section.items || []).some((item) => {
      const normalizedItemPath = normalizePath(item.path);
      return (
        normalizedCurrent.endsWith(normalizedItemPath) ||
        normalizedCurrent.endsWith('/' + normalizedItemPath.replace(/^\//, '')) ||
        normalizedCurrent.endsWith(normalizedItemPath + '.html')
      );
    });

    const titleBtn = document.createElement('button');
    titleBtn.type = 'button';
    titleBtn.className = 'menu-section-toggle';
    if (hasActiveItem) titleBtn.classList.add('is-active');

    const titleText = document.createElement('span');
    titleText.textContent = section.section;

    const caret = document.createElement('span');
    caret.className = 'menu-section-caret';
    caret.textContent = hasItems ? '▾' : '•';

    titleBtn.appendChild(titleText);
    titleBtn.appendChild(caret);
    sectionEl.appendChild(titleBtn);

    const listWrap = document.createElement('div');
    listWrap.className = 'menu-section-body';

    const isOpen = hasItems && (hasActiveItem || storedOpenSections.has(section.section) || menuSections.length <= 3);

    if (!isOpen) {
      listWrap.hidden = true;
      titleBtn.classList.add('is-collapsed');
    }

    if (hasItems) {
      const list = document.createElement('ul');
      list.className = 'menu-list';

      section.items.forEach((item) => {
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = buildPanelHref(item.path);
        link.textContent = item.label;

        const normalizedItemPath = normalizePath(item.path);
        if (
          normalizedCurrent.endsWith(normalizedItemPath) ||
          normalizedCurrent.endsWith('/' + normalizedItemPath.replace(/^\//, '')) ||
          normalizedCurrent.endsWith(normalizedItemPath + '.html')
        ) {
          link.classList.add('active');
        }

        link.addEventListener('mouseenter', () => prefetchUrl(link.href), { passive: true });
        link.addEventListener('focus', () => prefetchUrl(link.href), { passive: true });
        link.addEventListener('touchstart', () => prefetchUrl(link.href), { passive: true, once: true });
        link.addEventListener('click', (event) => {
          if (!shouldHandleAsNormalNavigation(event)) return;
          document.documentElement.classList.add('is-route-transitioning');
        });

        li.appendChild(link);
        list.appendChild(li);
      });

      listWrap.appendChild(list);

      titleBtn.addEventListener('click', () => {
        const willOpen = listWrap.hidden;
        listWrap.hidden = !willOpen;
        titleBtn.classList.toggle('is-collapsed', !willOpen);

        const openSections = new Set(loadOpenSections());
        if (willOpen) openSections.add(section.section);
        else openSections.delete(section.section);
        saveOpenSections([...openSections]);
      });
    } else {
      const empty = document.createElement('div');
      empty.className = 'menu-empty';
      empty.textContent = 'Em implantação';
      listWrap.appendChild(empty);
    }

    sectionEl.appendChild(listWrap);
    container.appendChild(sectionEl);
  });

  markProgramacaoIfOsPending(container, userContext);
}
