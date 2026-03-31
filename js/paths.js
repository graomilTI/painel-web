export function getPanelBasePath(pathname = window.location.pathname) {
  const clean = String(pathname || '').split('?')[0].split('#')[0];
  const match = clean.match(/^(.*?)(\/painel)(?:\/.*)?$/i);
  return match ? `${match[1]}${match[2]}` : '';
}

export function toPanelUrl(target = '') {
  const base = getPanelBasePath();
  const normalized = String(target || '').replace(/^\/+/, '');
  return `${base}/${normalized}`.replace(/\/+/g, '/');
}
