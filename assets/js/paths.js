export function getPanelBasePath(pathname = window.location.pathname) {
  const clean = String(pathname || '').split('?')[0].split('#')[0].replace(/\/+$/, '');

  const painelMatch = clean.match(/^(.*?)(\/painel)(?:\/.*)?$/i);
  if (painelMatch) return `${painelMatch[1]}${painelMatch[2]}` || '/painel';

  const fileMatch = clean.match(/^(.*)\/[^/]+\.html$/i);
  if (fileMatch) return fileMatch[1] || '';

  const lastSlash = clean.lastIndexOf('/');
  if (lastSlash <= 0) return '';
  return clean.slice(0, lastSlash);
}

export function normalizePanelTarget(target = '') {
  const raw = String(target || '').trim();
  if (!raw || raw === '/') return 'dashboard';
  if (/^(https?:)?\/\//i.test(raw)) return raw;
  return raw
    .replace(/^\/+/, '')
    .replace(/^\.\//, '')
    .replace(/\.html$/i, '')
    .replace(/\/+$/, '');
}

export function toPanelUrl(target = '') {
  const normalized = normalizePanelTarget(target);
  if (/^(https?:)?\/\//i.test(normalized)) return normalized;

  const base = getPanelBasePath();
  const safeTarget = normalized || 'dashboard';

  if (!base) return `./${safeTarget}`.replace(/\/+/g, '/');
  return `${base}/${safeTarget}`.replace(/([^:]\/)\/+/g, '$1');
}

export function getApiBaseUrl(origin = window.location.origin) {
  const normalizedOrigin = String(origin || '').toLowerCase();
  const isPrimaryDomain =
    normalizedOrigin.includes('grao1000.com.br') ||
    normalizedOrigin.includes('www.grao1000.com.br');

  return isPrimaryDomain ? '/api' : 'https://grao1000.com.br/api';
}

export function toApiUrl(path = '') {
  const normalizedPath = String(path || '').replace(/^\/+/, '');
  const apiBase = getApiBaseUrl();
  return `${apiBase}/${normalizedPath}`.replace(/([^:]\/)\/+/g, '$1');
}
