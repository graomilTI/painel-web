export function getPanelBasePath(pathname = window.location.pathname) {
  const clean = String(pathname || '').split('?')[0].split('#')[0];
  const origin = String(window.location.origin || '').toLowerCase();
  const isPrimaryDomain =
    origin.includes('grao1000.com.br') ||
    origin.includes('www.grao1000.com.br');

  const painelMatch = clean.match(/^(.*?)(\/painel)(?:\/.*)?$/i);
  if (painelMatch) return `${painelMatch[1]}${painelMatch[2]}`;

  // Produção: todas as páginas do painel precisam permanecer abaixo de /painel.
  // Evita navegação acidental para /frotas-veiculos, /frotas-multas etc. no domínio raiz,
  // que cai no roteamento do site/host e gera Cloudflare 522.
  if (isPrimaryDomain) return '/painel';

  const lastSlash = clean.lastIndexOf('/');
  if (lastSlash <= 0) return '';
  return clean.slice(0, lastSlash);
}

export function toPanelUrl(target = '') {
  const normalized = String(target || '')
    .replace(/^\/+/, '')
    .replace(/\.html$/i, '');

  const base = getPanelBasePath();

  if (!normalized) return base || './';

  if (!base) return `./${normalized}`;

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
