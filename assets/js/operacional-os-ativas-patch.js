// Patch de carregamento do operacional.js.
// Regra: o mapa/programação operacional só deve considerar OS que ainda vieram
// na última Lista de OS do agente. Se a OS não veio mais do agente, ela some.

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
    `  function osAberta(o, osAtuaisSet = null) {
    if (norm(o.situacao) !== 'ABERTA') return false;

    // A Lista de OS do agente é a fonte real do que ainda existe no sistema.
    // Se a OS não veio na última lista, não entra no mapa/programação.
    if (osAtuaisSet && osAtuaisSet.size) {
      const numero = String(o.numero_os ?? '').trim();
      if (!numero || !osAtuaisSet.has(numero)) return false;
    }

    return true;
  }`,
    'osAberta'
  );

  out = replaceOrWarn(
    out,
    `    const osRaw = await sel('operacional_os', '*', q => q.order('created_at', { ascending: false }));
    const pontosPorChave = new Map();`,
    `    const [osRaw, listaOsRaw] = await Promise.all([
      sel('operacional_os', '*', q => q.eq('situacao', 'Aberta').order('created_at', { ascending: false })),
      sel('logistica_btg_lista_os', 'numero_os', q => q.not('numero_os', 'is', null), 20000),
    ]);

    const osAtuaisSet = new Set(
      (listaOsRaw || [])
        .map(r => String(r.numero_os ?? '').trim())
        .filter(Boolean)
    );

    const pontosPorChave = new Map();`,
    'loadOsEPontos origem'
  );

  out = replaceOrWarn(
    out,
    `    const abertas = osRaw.filter(osAberta).map(o => {`,
    `    const abertas = osRaw.filter(o => osAberta(o, osAtuaisSet)).map(o => {`,
    'loadOsEPontos filtro agente'
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
