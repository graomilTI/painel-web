export function getPanelBasePath(pathname = window.location.pathname) {
  const clean = String(pathname || '').split('?')[0].split('#')[0];

  const painelMatch = clean.match(/^(.*?)(\/painel)(?:\/.*)?$/i);
  if (painelMatch) return `${painelMatch[1]}${painelMatch[2]}`;

  const lastSlash = clean.lastIndexOf('/');
  if (lastSlash <= 0) return '';
  return clean.slice(0, lastSlash);
}

export function toPanelUrl(target = '') {
  const normalized = String(target || '').replace(/^\/+/, '');
  const base = getPanelBasePath();

  if (!base) return `./${normalized}`.replace(/\/+/g, '/');

  return `${base}/${normalized}`.replace(/\/+/g, '/');
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
