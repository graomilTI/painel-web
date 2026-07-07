// Patch de carregamento do operacional.js.
// Regra atual do agente Lista de OS:
// - toda OS retornada recebe ultima_atualizacao;
// - OS ausente da sincronizacao completa vira Finalizada.
// Portanto, no operacional, só entram OS abertas e carimbadas pelo agente.

const PATCH_FLAG = '__grao1000_operacional_os_ativas_patch__';

function shouldPatchOperacional(url) {
  try {
    const u = new URL(String(url), location.href);
    return /\/assets\/js\/operacional\.js$/i.test(u.pathname) || /\/operacional\.js$/i.test(u.pathname);
  } catch (_) {
    return String(url || '').includes('operacional.js');
  }
}

function replaceOrWarn(source, search, replacement, label) {
  if (!source.includes(search)) {
    console.warn(`[operacional-os-ativas] Trecho não encontrado: ${label}`);
    return source;
  }
  return source.replace(search, replacement);
}

function patchOperacionalSource(source) {
  let out = source;

  out = replaceOrWarn(
    out,
    `  function osAberta(o) {
    const s = norm(\`${'${o.situacao || \'\'} ${o.status || \'\'} ${o.status_logistica || \'\'} ${o.status_gestor || \'\'}'}\`);
    return !['FINALIZAD', 'FINALIZAR', 'DEVOLVID', 'CANCELAD', 'CONCLUID', 'ENCERRAD', 'ARQUIVAD', 'INATIV'].some(x => s.includes(x));
  }`,
    `  function osAberta(o) {
    if (norm(o.situacao) !== 'ABERTA') return false;
    if (!o.ultima_atualizacao) return false;
    return true;
  }`,
    'osAberta'
  );

  out = replaceOrWarn(
    out,
    `    const osRaw = await sel('operacional_os', '*', q => q.order('created_at', { ascending: false }));
    const pontosPorChave = new Map();`,
    `    const osRaw = await sel('operacional_os', '*', q => q
      .eq('situacao', 'Aberta')
      .not('ultima_atualizacao', 'is', null)
      .order('created_at', { ascending: false })
    );
    const pontosPorChave = new Map();`,
    'loadOsEPontos origem'
  );

  return out;
}

if (!window[PATCH_FLAG]) {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async function patchedFetch(input, init) {
    const response = await originalFetch(input, init);
    const url = typeof input === 'string' || input instanceof URL ? input : input?.url;

    if (!shouldPatchOperacional(url) || !response.ok) return response;

    const source = await response.text();
    const patched = patchOperacionalSource(source);

    return new Response(patched, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };

  Object.defineProperty(window, PATCH_FLAG, { value: true });
}
