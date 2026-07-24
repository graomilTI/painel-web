import { supabase } from './supabaseClient.js';
import { getColaboradores } from './colaboradoresCache.js';

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function colaboradorKey(row = {}) {
  const cpf = String(row.cpf || '').replace(/\D/g, '');
  return cpf || normalizeText(row.nome) || String(row.id || '').trim();
}

function activeStatus(row = {}) {
  if (row.ativo === false || row.ativo === 0) return false;
  if (row.ativo === true || row.ativo === 1) return !String(row.desligamento || '').trim();

  const ativoText = normalizeText(row.ativo);
  if (['FALSE', '0', 'NAO', 'N'].includes(ativoText)) return false;
  if (['TRUE', '1', 'SIM', 'S'].includes(ativoText)) return !String(row.desligamento || '').trim();
  if (String(row.desligamento || '').trim()) return false;

  const situation = normalizeText(row.situacao || row.status);
  return ![
    'INATIV',
    'DESLIG',
    'DEMIT',
    'CANCEL',
    'RESCIND',
    'EXCLUID',
    'AFASTADO DEFINITIVO',
  ].some((token) => situation.includes(token));
}

function rowReference(row = {}) {
  const value = String(row.data_referencia || row.updated_at || row.created_at || '').trim();
  return value ? Date.parse(value) || 0 : 0;
}

function deduplicateLatest(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    const key = colaboradorKey(row);
    if (!key) return;
    const current = map.get(key);
    if (!current || rowReference(row) >= rowReference(current)) map.set(key, row);
  });
  return [...map.values()];
}

async function paginatedSelect(table, columns) {
  const rows = [];
  const pageSize = 1000;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order('nome', { ascending: true })
      .range(start, start + pageSize - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function fetchActiveCollaborators() {
  try {
    const rows = await paginatedSelect(
      'colaboradores_atuais',
      'id,nome,cpf,tipo,supervisao,coordenacao,empresa,situacao,ativo,desligamento,data_referencia',
    );
    return deduplicateLatest(rows).filter(activeStatus);
  } catch (error) {
    console.warn('[hospedagem-ativos] colaboradores_atuais indisponível; usando cache compartilhado.', error);
    const rows = await getColaboradores({ force: true });
    return deduplicateLatest(rows).filter(activeStatus);
  }
}

let activeCollaborators = [];
let activeNames = new Set();
let activeTotal = null;
let loadError = null;
let observer = null;

function countText() {
  if (loadError) return 'Não foi possível atualizar a quantidade de colaboradores ativos.';
  if (activeTotal == null) return 'Atualizando quantidade de colaboradores ativos...';
  if (activeTotal === 1) return '1 colaborador ativo disponível em todas as regionais.';
  return `${activeTotal} colaboradores ativos disponíveis em todas as regionais.`;
}

function findExistingCountBanner(panel) {
  const candidates = [...panel.querySelectorAll('.hosp-alert, [id*="colab" i], [class*="colab" i]')];
  return candidates.find((element) => {
    const text = normalizeText(element.textContent);
    return text.includes('COLABORADOR') && text.includes('ATIVO') && text.includes('REGION');
  }) || null;
}

function ensureCountBanner() {
  const panel = document.getElementById('panel-solicitar');
  const fallback = document.getElementById('colabFallback');
  if (!panel || !fallback) return null;

  let banner = document.getElementById('hospColaboradoresAtivos');
  const legacyBanner = findExistingCountBanner(panel);

  if (!banner && legacyBanner) banner = legacyBanner;
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'hosp-alert';
    fallback.insertAdjacentElement('afterend', banner);
  }

  banner.id = 'hospColaboradoresAtivos';
  banner.style.display = 'block';
  banner.style.borderColor = 'rgba(34, 197, 94, .35)';
  banner.style.background = 'rgba(22, 101, 52, .18)';
  banner.style.color = '#bbf7d0';
  banner.style.marginTop = '10px';

  const expected = countText();
  if (banner.textContent !== expected) banner.textContent = expected;

  [...panel.querySelectorAll('.hosp-alert, [id*="colab" i], [class*="colab" i]')]
    .filter((element) => element !== banner)
    .filter((element) => {
      const text = normalizeText(element.textContent);
      return text.includes('COLABORADOR') && text.includes('ATIVO') && text.includes('REGION');
    })
    .forEach((element) => { element.style.display = 'none'; });

  return banner;
}

function suggestionName(item) {
  const firstTextNode = [...item.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
  return String(firstTextNode?.textContent || item.firstChild?.textContent || '').trim();
}

function filterSuggestionList(list) {
  if (!list || activeTotal == null) return;
  const items = [...list.querySelectorAll('.hosp-ac-item')];
  if (!items.length) return;

  items.forEach((item) => {
    const name = normalizeText(suggestionName(item));
    if (!activeNames.has(name)) item.remove();
  });

  if (!list.querySelector('.hosp-ac-item')) {
    list.innerHTML = '<div class="hosp-ac-empty">Nenhum colaborador ativo encontrado</div>';
  }
}

function filterAllSuggestionLists(root = document) {
  root.querySelectorAll?.('.hosp-ac-list').forEach(filterSuggestionList);
}

function refreshUi() {
  ensureCountBanner();
  filterAllSuggestionLists();
}

async function loadActiveCollaborators() {
  try {
    activeCollaborators = await fetchActiveCollaborators();
    activeNames = new Set(activeCollaborators.map((row) => normalizeText(row.nome)).filter(Boolean));
    activeTotal = activeCollaborators.length;
    loadError = null;
  } catch (error) {
    console.error('[hospedagem-ativos] Falha ao carregar colaboradores ativos:', error);
    activeCollaborators = [];
    activeNames = new Set();
    activeTotal = null;
    loadError = error;
  }
  refreshUi();
}

function startObserver() {
  if (observer) return;
  observer = new MutationObserver((mutations) => {
    let shouldRefreshBanner = false;
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches?.('.hosp-ac-list')) filterSuggestionList(node);
          filterAllSuggestionLists(node);
          if (node.id === 'panel-solicitar' || node.querySelector?.('#panel-solicitar')) shouldRefreshBanner = true;
        });
      }
      if (mutation.type === 'characterData') shouldRefreshBanner = true;
    });
    if (shouldRefreshBanner || !document.getElementById('hospColaboradoresAtivos')) ensureCountBanner();
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

function boot() {
  startObserver();
  ensureCountBanner();
  document.addEventListener('input', (event) => {
    if (!event.target.closest?.('.hosp-ac-input')) return;
    queueMicrotask(() => filterSuggestionList(event.target.closest('.hosp-ac')?.querySelector('.hosp-ac-list')));
  });
  document.addEventListener('focusin', (event) => {
    if (!event.target.closest?.('.hosp-ac-input')) return;
    setTimeout(() => filterSuggestionList(event.target.closest('.hosp-ac')?.querySelector('.hosp-ac-list')), 0);
  });
  void loadActiveCollaborators();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
