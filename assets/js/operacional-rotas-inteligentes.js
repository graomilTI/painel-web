// Runtime do Mapa Operacional com rotas mais inteligentes.
// Mantém o arquivo operacional.js original como base, mas aplica ajustes em tempo de carregamento
// para evitar rotas em estrela/zigue-zague e para abrir visualização street-level gratuita.

const SMART_VERSION = '20260702-rotas-inteligentes';

function replaceOrKeep(source, search, replacement, label) {
  if (!source.includes(search)) {
    console.warn(`[rotas-inteligentes] Trecho não encontrado: ${label}`);
    return source;
  }
  return source.replace(search, replacement);
}

function injectAfter(source, search, insertion, label) {
  if (!source.includes(search)) {
    console.warn(`[rotas-inteligentes] Ponto de injeção não encontrado: ${label}`);
    return source;
  }
  return source.replace(search, `${search}\n${insertion}`);
}

function patchDrawAllRoutes(source) {
  const start = source.indexOf('  async function drawAllRoutes(root, base, token, bounds) {');
  const end = source.indexOf('  function updateRouteStatus(root, text) {', start);
  if (start < 0 || end < 0) {
    console.warn('[rotas-inteligentes] Não foi possível substituir drawAllRoutes.');
    return source;
  }

  const replacement = `  function ordenarRotasSequenciais(rotas) {
    if (!rotas?.length) return [];
    const pendentes = [...rotas];
    const ordenadas = [];
    let atual = { lat: lat(rotas[0].colab), lng: lng(rotas[0].colab) };
    while (pendentes.length) {
      let melhorIdx = 0, melhorDist = Infinity;
      for (let i = 0; i < pendentes.length; i++) {
        const p = pendentes[i].ponto;
        const d = km(atual.lat, atual.lng, p.lat, p.lng) ?? Infinity;
        if (d < melhorDist) { melhorDist = d; melhorIdx = i; }
      }
      const proxima = pendentes.splice(melhorIdx, 1)[0];
      ordenadas.push(proxima);
      atual = { lat: proxima.ponto.lat, lng: proxima.ponto.lng };
    }
    return ordenadas;
  }

  function agruparRotasPorColaborador(rotas) {
    const porColab = new Map();
    for (const r of rotas) {
      const key = r.colab.id;
      if (!porColab.has(key)) porColab.set(key, []);
      porColab.get(key).push(r);
    }
    return [...porColab.values()].map(grupo => ordenarRotasSequenciais(grupo));
  }

  function drawFallbackRouteGroup(L, grupo, selected) {
    if (!grupo.length) return null;
    const inicio = [lat(grupo[0].colab), lng(grupo[0].colab)];
    const pontos = grupo.map(r => [r.ponto.lat, r.ponto.lng]);
    return L.polyline([inicio, ...pontos], {
      color: selected ? '#facc15' : '#60a5fa',
      weight: selected ? 4 : 1.5,
      opacity: selected ? .9 : .16,
      dashArray: '5 8',
    }).addTo(st.routeLayer);
  }

  async function drawAllRoutes(root, base, token, bounds) {
    if (!st.map || !window.L || !st.routeLayer) return;
    const L = window.L;
    const selecionada = st.rotas.find(x => x.id === st.rota) || base[0];
    const colabSelecionadoId = selecionada?.colab?.id;
    const validas = base.filter(r => geo(r.colab) && r.ponto.temCoord);
    const grupos = agruparRotasPorColaborador(validas);

    grupos.forEach(grupo => {
      if (!grupo.length) return;
      const selected = grupo[0].colab.id === colabSelecionadoId;
      if (selected) drawFallbackRouteGroup(L, grupo, true);
      bounds.push([lat(grupo[0].colab), lng(grupo[0].colab)]);
      grupo.forEach(r => bounds.push([r.ponto.lat, r.ponto.lng]));
    });

    updateRouteStatus(root, \`Rotas inteligentes: desenhando \${grupos.length} grupo(s) / \${validas.length} OS...\`);

    const ordenados = [...grupos].sort((a, b) => (b[0]?.colab.id === colabSelecionadoId ? 1 : 0) - (a[0]?.colab.id === colabSelecionadoId ? 1 : 0));
    const fila = ordenados.slice(0, ROTAS_REAIS_LIMITE);
    let done = 0, realOk = 0;

    async function worker() {
      while (fila.length && token === st.drawToken) {
        const grupo = fila.shift();
        if (!grupo?.length) continue;
        const pontos = [{ lat: lat(grupo[0].colab), lng: lng(grupo[0].colab) }, ...grupo.map(r => ({ lat: r.ponto.lat, lng: r.ponto.lng }))];
        const real = await rotaReal(pontos);
        if (token !== st.drawToken || !st.routeLayer) return;
        done++;
        if (real?.coords?.length) {
          realOk++;
          const sel = grupo[0].colab.id === colabSelecionadoId;
          L.polyline(real.coords, { color: sel ? '#facc15' : '#22c55e', weight: sel ? 4 : 2, opacity: sel ? .95 : .32 }).addTo(st.routeLayer);
        }
        updateRouteStatus(root, \`Rotas inteligentes: \${done}/\${Math.min(grupos.length, ROTAS_REAIS_LIMITE)} grupos carregados · \${validas.length} OS\${grupos.length > ROTAS_REAIS_LIMITE ? \` · limite \${ROTAS_REAIS_LIMITE}/\${grupos.length}\` : ''}\`);
      }
    }

    await Promise.all(Array.from({ length: Math.min(ROTAS_REAIS_SIMULTANEAS, fila.length) }, worker));
    if (token === st.drawToken) updateRouteStatus(root, \`Rotas inteligentes: \${grupos.length} grupo(s) · \${validas.length} OS · \${realOk} rotas reais carregadas\${grupos.length > ROTAS_REAIS_LIMITE ? ' · use filtro de estado/ponto para carregar as demais' : ''}\`);
  }

`;

  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

function patchSource(source, supabaseClientUrl) {
  let out = source;

  out = replaceOrKeep(
    out,
    "import { supabase } from './supabaseClient.js';",
    `import { supabase } from '${supabaseClientUrl}';`,
    'import supabase'
  );

  out = replaceOrKeep(out, 'const RAIO_REPETIR_COLAB_KM = 100;', 'const RAIO_REPETIR_COLAB_KM = 45;', 'raio repetir colaborador');
  out = replaceOrKeep(out, 'const DIST_TOLERANCIA_EMPATE_KM = 20;', 'const DIST_TOLERANCIA_EMPATE_KM = 8;', 'tolerância empate');
  out = replaceOrKeep(out, 'const MAX_OS_POR_COLABORADOR = 10;', 'const MAX_OS_POR_COLABORADOR = 4;\n  const DIST_MAX_ENTRE_PARADAS_ROTA_KM = 40;\n  const DESVIO_MAX_ROTA_KM = 45;', 'limites de rota');

  out = injectAfter(
    out,
    '  function osPorPonto(ponto) { return st.osTodas.filter(o => o.__pontoKey === ponto.__key); }',
    `
  function streetViewLinks(latitude, longitude) {
    const la = Number(latitude), lo = Number(longitude);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return '';
    const mapillary = \`https://www.mapillary.com/app/?lat=\${la}&lng=\${lo}&z=17\`;
    const kartaview = \`https://kartaview.org/map/@\${la},\${lo},17z\`;
    const osm = \`https://www.openstreetmap.org/?mlat=\${la}&mlon=\${lo}#map=17/\${la}/\${lo}\`;
    return \`<br><span style="display:inline-flex;gap:6px;flex-wrap:wrap;margin-top:6px"><a href="\${mapillary}" target="_blank" rel="noopener" style="color:#22c55e;font-weight:900">Mapillary</a><a href="\${kartaview}" target="_blank" rel="noopener" style="color:#22c55e;font-weight:900">KartaView</a><a href="\${osm}" target="_blank" rel="noopener" style="color:#93c5fd;font-weight:900">OSM</a></span>\`;
  }

  function pontoPopup(p, titulo, qtd) {
    const local = [p.nome_local, p.cidade, p.uf].filter(Boolean).join(' · ');
    return \`<strong>\${esc(titulo)}</strong><br>\${esc(local)}<br>\${qtd} OS\${streetViewLinks(p.lat, p.lng)}\`;
  }
`,
    'street viewer helpers'
  );

  out = replaceOrKeep(
    out,
    'return melhorInsercaoRota(c, usados, ponto).custo <= RAIO_REPETIR_COLAB_KM;',
    `const insercao = melhorInsercaoRota(c, usados, ponto);
    const distParadaMaisProxima = Math.min(...usados.map(u => distEntrePontos(u.ponto, ponto)).filter(Number.isFinite));
    if (!Number.isFinite(distParadaMaisProxima)) return false;
    if (distParadaMaisProxima > DIST_MAX_ENTRE_PARADAS_ROTA_KM) return false;
    return insercao.custo <= DESVIO_MAX_ROTA_KM;`,
    'regra podeUsarColaborador'
  );

  out = replaceOrKeep(
    out,
    `const avaliacao = avaliarCandidato(c, ponto, dist, os.__saldo);
          return { c, dist: avaliacao.distReal, avaliacao, saldoAtual: saldoAcumulado(c, usos) };`,
    `const avaliacao = avaliarCandidato(c, ponto, dist, os.__saldo);
          const rotaAtual = usos.get(c.id) || [];
          const insercao = melhorInsercaoRota(c, rotaAtual, ponto);
          const distParadaMaisProxima = rotaAtual.length ? Math.min(...rotaAtual.map(u => distEntrePontos(u.ponto, ponto)).filter(Number.isFinite)) : 0;
          const penalidadeRota = rotaAtual.length
            ? insercao.custo + Math.max(0, distParadaMaisProxima - 25) * 4 + rotaAtual.length * 6
            : 0;
          return { c, dist: avaliacao.distReal, avaliacao, saldoAtual: saldoAcumulado(c, usos), penalidadeRota, score: avaliacao.distReal + penalidadeRota };`,
    'score inteligente'
  );

  out = replaceOrKeep(
    out,
    `if (Math.abs(a.dist - b.dist) > DIST_TOLERANCIA_EMPATE_KM) return a.dist - b.dist;
          return a.saldoAtual - b.saldoAtual || a.avaliacao.custoDia - b.avaliacao.custoDia || a.dist - b.dist;`,
    `if (Math.abs(a.score - b.score) > DIST_TOLERANCIA_EMPATE_KM) return a.score - b.score;
          return a.saldoAtual - b.saldoAtual || a.avaliacao.custoDia - b.avaliacao.custoDia || a.dist - b.dist;`,
    'ordenação inteligente'
  );

  out = replaceOrKeep(
    out,
    "L.marker([i.lat_lancamento, i.lng_lancamento], { icon: iconIrreg() }).bindTooltip(irregTooltip(i)).addTo(st.layer);",
    "L.marker([i.lat_lancamento, i.lng_lancamento], { icon: iconIrreg() }).bindTooltip(irregTooltip(i)).bindPopup(`${irregTooltip(i)}${streetViewLinks(i.lat_lancamento, i.lng_lancamento)}`).addTo(st.layer);",
    'popup irregularidade'
  );

  out = replaceOrKeep(
    out,
    "L.marker([p.lat, p.lng], { icon: icon('os-ok', sel, p.aproximado) }).bindTooltip(`OS com saldo · ${esc(p.nome_local)} · ${esc(p.cidade)}/${esc(p.uf)} · ${comSaldo} OS${aviso}`).addTo(st.layer);",
    "L.marker([p.lat, p.lng], { icon: icon('os-ok', sel, p.aproximado) }).bindTooltip(`OS com saldo · ${esc(p.nome_local)} · ${esc(p.cidade)}/${esc(p.uf)} · ${comSaldo} OS${aviso}`).bindPopup(pontoPopup(p, 'OS com saldo', comSaldo)).addTo(st.layer);",
    'popup OS com saldo'
  );

  out = replaceOrKeep(
    out,
    "L.marker([p.lat, p.lng], { icon: icon('os-zero', sel, p.aproximado) }).bindTooltip(`OS sem saldo · ${esc(p.nome_local)} · ${esc(p.cidade)}/${esc(p.uf)} · ${semSaldo} OS${aviso}`).addTo(st.layer);",
    "L.marker([p.lat, p.lng], { icon: icon('os-zero', sel, p.aproximado) }).bindTooltip(`OS sem saldo · ${esc(p.nome_local)} · ${esc(p.cidade)}/${esc(p.uf)} · ${semSaldo} OS${aviso}`).bindPopup(pontoPopup(p, 'OS sem saldo', semSaldo)).addTo(st.layer);",
    'popup OS sem saldo'
  );

  out = patchDrawAllRoutes(out);

  out = replaceOrKeep(
    out,
    'window.OPERACIONAL = { openHome };',
    `window.OPERACIONAL = { openHome, smartRoutes: true, smartVersion: '${SMART_VERSION}' };`,
    'exposição OPERACIONAL'
  );

  return out;
}

async function loadSmartOperational() {
  try {
    const sourceUrl = new URL(`./operacional.js?v=${SMART_VERSION}`, import.meta.url);
    const supabaseClientUrl = new URL('./supabaseClient.js', import.meta.url).href;
    const response = await fetch(sourceUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const source = await response.text();
    const patched = patchSource(source, supabaseClientUrl);
    const blob = new Blob([`${patched}\n//# sourceURL=/painel/assets/js/operacional-smart-inline.js?v=${SMART_VERSION}`], { type: 'text/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    try {
      await import(blobUrl);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  } catch (error) {
    console.error('[rotas-inteligentes] Falha ao carregar versão inteligente. Usando módulo original.', error);
    await import(`./operacional.js?v=${SMART_VERSION}`);
  }
}

await loadSmartOperational();
