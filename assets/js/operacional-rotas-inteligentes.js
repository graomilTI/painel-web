// Runtime do Mapa Operacional com rotas mais inteligentes.
// Mantém o arquivo operacional.js original como base, mas aplica ajustes em tempo de carregamento
// para evitar rotas em estrela/zigue-zague, preencher carona/placa e filtrar OS por sugestão.

const SMART_VERSION = '20260703-rota-estendida-sutil';

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

  function drawFallbackRouteGroup(L, grupo, selected, estendida) {
    if (!grupo.length) return null;
    const inicio = [lat(grupo[0].colab), lng(grupo[0].colab)];
    const pontos = grupo.map(r => [r.ponto.lat, r.ponto.lng]);
    // Rota estendida só ganha traço grosso/opaco quando destacada de propósito (clique numa OS/
    // colaborador daquela rota, ou filtro "Rota estendida" ativo nos KPIs) — fora isso, fica fina
    // igual às rotas normais não selecionadas, só na cor laranja pra identificar sem poluir o mapa.
    const destaque = selected || (estendida && st.kpiFiltro === 'rota-estendida');
    return L.polyline([inicio, ...pontos], {
      color: estendida ? '#f97316' : (selected ? '#facc15' : '#60a5fa'),
      weight: destaque ? 4 : 1.5,
      opacity: destaque ? .9 : (estendida ? .35 : .16),
      dashArray: '5 8',
    }).addTo(st.routeLayer);
  }

  async function drawAllRoutes(root, base, token, bounds) {
    if (!st.map || !window.L || !st.routeLayer) return;
    const L = window.L;
    const selecionada = st.rotas.find(x => x.id === st.rota) || base[0];
    const colabSelecionadoId = selecionada?.colab?.id;
    st.rotaSelecionadaReal = null;
    updateRotaRealStatus(root);
    checarAlternativa(root);
    const validas = base.filter(r => geo(r.colab) && r.ponto.temCoord);
    const grupos = agruparRotasPorColaborador(validas);
    const fallbackPorColab = new Map();

    grupos.forEach(grupo => {
      if (!grupo.length) return;
      const selected = grupo[0].colab.id === colabSelecionadoId;
      const estendida = grupo.some(r => r.rotaEstendida);
      if (selected || estendida) fallbackPorColab.set(grupo[0].colab.id, drawFallbackRouteGroup(L, grupo, selected, estendida));
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
          const estendida = grupo.some(r => r.rotaEstendida);
          const destaque = sel || (estendida && st.kpiFiltro === 'rota-estendida');
          const cor = estendida ? '#f97316' : (sel ? '#facc15' : '#22c55e');
          // Some o pontilhado assim que a rota real chega — senão as duas ficam sobrepostas
          // no mapa pro resto do carregamento (parecia um bug de rota errada).
          const fallback = fallbackPorColab.get(grupo[0].colab.id);
          if (fallback) {
            st.routeLayer.removeLayer(fallback);
            fallbackPorColab.delete(grupo[0].colab.id);
          }
          L.polyline(real.coords, { color: cor, weight: destaque ? 4 : 2, opacity: destaque ? .95 : (estendida ? .5 : .32) }).addTo(st.routeLayer);
          if (sel && Number.isFinite(real.distanciaKm)) {
            let retaTotal = 0;
            for (let i = 1; i < pontos.length; i++) {
              const d = km(pontos[i - 1].lat, pontos[i - 1].lng, pontos[i].lat, pontos[i].lng);
              if (Number.isFinite(d)) retaTotal += d;
            }
            st.rotaSelecionadaReal = { distanciaKm: real.distanciaKm, duracaoMin: real.duracaoMin, distanciaRetaKm: retaTotal, paradas: grupo.length };
            updateRotaRealStatus(root);
          }
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

  out = replaceOrKeep(out, 'const DIST_TOLERANCIA_EMPATE_KM = 20;', 'const DIST_TOLERANCIA_EMPATE_KM = 8;', 'tolerância empate');

  out = replaceOrKeep(
    out,
    "estado: '', ponto: '', rota: '', mostrarRota: true, tab: 'mapa', mapaBase: 'escuro',",
    "estado: '', ponto: '', filtroOs: 'com-sugestao', rota: '', mostrarRota: true, tab: 'mapa', mapaBase: 'escuro',",
    'estado filtro de OS'
  );

  out = replaceOrKeep(
    out,
    '.mo-filter{display:grid;grid-template-columns:180px 1fr;gap:8px}',
    '.mo-filter{display:grid;grid-template-columns:180px minmax(220px,1fr) 190px;gap:8px}',
    'layout filtro OS'
  );

  out = replaceOrKeep(
    out,
    "    const nomesFrotaSet = new Set();\n    const posicaoPorNome = new Map();\n    const nomeOriginalPorNome = new Map();",
    "    const nomesFrotaSet = new Set();\n    const posicaoPorNome = new Map();\n    const placaPorNome = new Map();\n    const nomeOriginalPorNome = new Map();",
    'mapa placa por motorista'
  );

  out = replaceOrKeep(
    out,
    "      const pos = veiculoKeys(v).map(k => posPorChave.get(k)).find(Boolean);\n      if (pos && !posicaoPorNome.has(key)) posicaoPorNome.set(key, pos);",
    "      const placa = v.placa || v.placa_normalizada || v.bfleet_placa || v.bfleet_patente || '';\n      if (placa && !placaPorNome.has(key)) placaPorNome.set(key, placa);\n      const pos = veiculoKeys(v).map(k => posPorChave.get(k)).find(Boolean);\n      if (pos && !posicaoPorNome.has(key)) posicaoPorNome.set(key, { ...pos, placa: pos.placa || placa });",
    'placa leitura patrimônio'
  );

  out = replaceOrKeep(
    out,
    "    posicoes.forEach(p => { const key = norm(p.motorista); if (p.motorista && nomesFrotaSet.has(key) && !posicaoPorNome.has(key)) posicaoPorNome.set(key, p); });",
    "    posicoes.forEach(p => { const key = norm(p.motorista); if (!p.motorista || !nomesFrotaSet.has(key)) return; if (p.placa && !placaPorNome.has(key)) placaPorNome.set(key, p.placa); if (!posicaoPorNome.has(key)) posicaoPorNome.set(key, { ...p, placa: p.placa || placaPorNome.get(key) || '' }); });",
    'placa posição GPS'
  );

  out = replaceOrKeep(
    out,
    "    return { nomesFrotaSet, posicaoPorNome, nomeOriginalPorNome, veiculos: veiculosMapa };",
    "    return { nomesFrotaSet, posicaoPorNome, placaPorNome, nomeOriginalPorNome, veiculos: veiculosMapa };",
    'retorno placa por motorista'
  );

  out = replaceOrKeep(
    out,
    "    st.posicaoPorNome = frotaAtual.posicaoPorNome;",
    "    st.posicaoPorNome = frotaAtual.posicaoPorNome;\n    st.placaPorNome = frotaAtual.placaPorNome || new Map();",
    'estado placa por motorista'
  );

  out = replaceOrKeep(
    out,
    "      if (destino) trajetos.push({ aLat, aLng, bLat: destino.lat, bLng: destino.lng });",
    "      if (destino) trajetos.push({ aLat, aLng, bLat: destino.lat, bLng: destino.lng, motorista: c.nome, placa: st.placaPorNome?.get(norm(c.nome)) || posAtual?.placa || '' });",
    'trajeto frota com placa'
  );

  out = replaceOrKeep(
    out,
    `  // Carona só conta como custo zero se o ponto estiver a até 5km do trajeto de algum motorista
  // de frota até o embarque mais próximo dele — senão vira "carona fantasma" sem motorista real por perto.
  // Resultado só depende do ponto (nunca do colaborador/OS) — cacheado por ponto.__key pelo mesmo
  // motivo do hospedagemCache/candidatosProximosCache: sem isso, build() varria st.frotaTrajetos
  // (amostragem de 12 pontos por trajeto) pra cada par OS×colaborador.
  function caronaDisponivelPara(ponto) {
    if (!ponto.temCoord || !st.frotaTrajetos?.length) return false;
    if (st.caronaInfoCache.has(ponto.__key)) return !!st.caronaInfoCache.get(ponto.__key);
    const disponivel = st.frotaTrajetos.some(t => distPontoTrajeto(ponto, t) <= RAIO_CARONA_KM);
    st.caronaInfoCache.set(ponto.__key, disponivel);
    return disponivel;
  }`,
    `  // Carona só conta como custo zero se o ponto estiver a até 5km do trajeto de algum motorista
  // de frota até o embarque mais próximo dele — senão vira "carona fantasma" sem motorista real por perto.
  // Resultado só depende do ponto (nunca do colaborador/OS) — cacheado por ponto.__key pelo mesmo
  // motivo do hospedagemCache/candidatosProximosCache: sem isso, build() varria st.frotaTrajetos
  // (amostragem de 12 pontos por trajeto) pra cada par OS×colaborador.
  function caronaInfoPara(ponto) {
    if (!ponto.temCoord || !st.frotaTrajetos?.length) return null;
    if (st.caronaInfoCache.has(ponto.__key)) return st.caronaInfoCache.get(ponto.__key);
    let melhor = null;
    for (const t of st.frotaTrajetos) {
      const d = distPontoTrajeto(ponto, t);
      if (d <= RAIO_CARONA_KM && (!melhor || d < melhor.distKm)) melhor = { ...t, distKm: d };
    }
    st.caronaInfoCache.set(ponto.__key, melhor);
    return melhor;
  }`,
    'carona com placa'
  );

  out = replaceOrKeep(
    out,
    `    const habitual = st.modoHabitualPorCpf.get(c.cpf) || st.modoHabitualPorNome.get(norm(c.nome));
    if (habitual?.tipo === 'MOTORISTA FROTA') return { modo: 'reembolso', label: 'Motorista de frota (sem leitura recente — veículo da empresa)', custoFn: combustivelIdaVolta };
    if (habitual?.tipo === 'CARONA FROTA' && caronaDisponivelPara(ponto)) return { modo: 'carona', label: 'Carona com frota', custo: 0 };
    if (habitual?.tipo === 'NAO PRECISA') return { modo: 'local', label: 'Já está no local', custo: 0 };
    if (habitual?.tipo === 'REEMBOLSO KM') return { modo: 'reembolso', label: 'Veículo próprio', custoFn: combustivelIdaVolta };
    if (habitual?.tipo === 'UBER TAXI' || habitual?.tipo === 'UBER/TAXI') return { modo: 'uber', label: 'Uber/táxi', custoFn: uberOuCarroIdaVolta };

    if (st.veiculoProprioCpfs.has(c.cpf) || st.veiculoProprioNomes.has(norm(c.nome))) {
      return { modo: 'reembolso', label: 'Veículo próprio (estimado)', custoFn: combustivelIdaVolta, estimado: true };
    }
    // Sem modo habitual registrado nem veículo próprio marcado (61% dos classificadores ativos —
    // achado ao investigar um custo "exorbitante" pra uma rota curta): a suposição de Uber/táxi
    // aqui era um chute muito mais caro (~10x por km) que a realidade — Uber praticamente não
    // opera entre cidades pequenas do interior. Reembolso por km (veículo próprio) é a suposição
    // mais realista quando não se sabe o meio de transporte; Uber só quando é o modo REGISTRADO.
    return { modo: 'reembolso', label: 'Veículo próprio (estimado)', custoFn: combustivelIdaVolta, estimado: true };`,
    `    const habitual = st.modoHabitualPorCpf.get(c.cpf) || st.modoHabitualPorNome.get(norm(c.nome));
    // "MOTORISTA FROTA" só é um modo legítimo quando o colaborador tem veículo confirmado agora
    // (ramo st.nomesFrotaSet acima, com leitura de patrimônio recente) — chegar aqui já significa
    // que isso é falso. Um "MOTORISTA FROTA" habitual sem veículo confirmado não é motorista de
    // fato hoje (só um registro histórico da Programação, possivelmente desatualizado); cai no
    // mesmo tratamento de veículo próprio/reembolso que qualquer outro colaborador sem frota.
    if (habitual?.tipo === 'NAO PRECISA') return { modo: 'local', label: 'Já está no local', custo: 0 };
    if (habitual?.tipo === 'REEMBOLSO KM') return { modo: 'reembolso', label: 'Veículo próprio', custoFn: combustivelIdaVolta };
    if (habitual?.tipo === 'UBER TAXI' || habitual?.tipo === 'UBER/TAXI') return { modo: 'uber', label: 'Uber/táxi', custoFn: uberOuCarroIdaVolta };

    const carona = caronaInfoPara(ponto);
    if (carona) {
      const placa = carona.placa ? placaNorm(carona.placa) : 'placa não localizada';
      return { modo: 'carona', label: \`CARONA · \${placa}\`, custo: 0, placaCarona: placa, motoristaCarona: carona.motorista || '' };
    }

    return { modo: 'sem-modo', label: 'Sem deslocamento cadastrado', custo: Infinity, semSugestao: true };`,
    'modo colaborador carona e veículo próprio'
  );

  out = replaceOrKeep(
    out,
    'const hospedar = hospedagem && hospedagem.custoDia < custoDeslocamento;',
    'const hospedar = !modoInfo.semSugestao && hospedagem && hospedagem.custoDia < custoDeslocamento;',
    'hospedagem sem deslocamento'
  );

  out = replaceOrKeep(
    out,
    'const inviavel = !hospedar && custoDeslocamento > 0 && distReal > DIST_MAX_DESLOCAMENTO_DIARIO_KM;',
    'const inviavel = modoInfo.semSugestao || (!hospedar && custoDeslocamento > 0 && distReal > DIST_MAX_DESLOCAMENTO_DIARIO_KM);',
    'inviável sem deslocamento'
  );

  out = replaceOrKeep(
    out,
    '  function passaFiltroPonto(p) { if (!p) return false; if (st.estado && p.uf !== st.estado) return false; if (st.ponto && p.__key !== st.ponto) return false; return true; }',
    `  function pontoTemSugestao(p) { return !!p && st.rotas.some(r => r.ponto?.__key === p.__key); }
  function pontoSemSugestao(p) { return !!p && st.semAssociacao.some(r => r.ponto?.__key === p.__key); }
  function pontoTemSemSaldo(p) { return !!p && st.osTodas.some(o => o.__pontoKey === p.__key && Number(o.__saldo) <= 0); }
  function passaFiltroPonto(p) {
    if (!p) return false;
    if (st.estado && p.uf !== st.estado) return false;
    if (st.ponto && p.__key !== st.ponto) return false;
    if (st.filtroOs === 'com-sugestao' && !pontoTemSugestao(p)) return false;
    if (st.filtroOs === 'sem-sugestao' && !pontoSemSugestao(p)) return false;
    if (st.filtroOs === 'sem-saldo' && !pontoTemSemSaldo(p)) return false;
    return true;
  }`,
    'filtro por sugestão'
  );

  out = replaceOrKeep(
    out,
    "root.querySelector('[data-ponto]')?.addEventListener('change', e => { st.ponto = e.target.value; st.rota = ''; render(root, true); });",
    "root.querySelector('[data-ponto]')?.addEventListener('change', e => { st.ponto = e.target.value; st.rota = ''; render(root, true); });\n    root.querySelector('[data-filtro-os]')?.addEventListener('change', e => { st.filtroOs = e.target.value || 'com-sugestao'; st.ponto = ''; st.rota = ''; render(root, true); });",
    'bind filtro OS'
  );

  out = replaceOrKeep(
    out,
    `<select class="mo-select" data-ponto><option value="">Todos os pontos com OS aberta</option>\${pontosFiltrados.map(p => \`<option value="\${esc(p.__key)}" \${st.ponto === p.__key ? 'selected' : ''}>\${esc(p.cidade || p.nome_local)}/\${esc(p.uf)} · \${esc(p.nome_local || 'Ponto')}</option>\`).join('')}</select></div>`,
    `<select class="mo-select" data-ponto><option value="">Todos os pontos com OS aberta</option>\${pontosFiltrados.map(p => \`<option value="\${esc(p.__key)}" \${st.ponto === p.__key ? 'selected' : ''}>\${esc(p.cidade || p.nome_local)}/\${esc(p.uf)} · \${esc(p.nome_local || 'Ponto')}</option>\`).join('')}</select><select class="mo-select" data-filtro-os><option value="com-sugestao" \${st.filtroOs === 'com-sugestao' ? 'selected' : ''}>OS com sugestão</option><option value="sem-sugestao" \${st.filtroOs === 'sem-sugestao' ? 'selected' : ''}>OS sem sugestão</option><option value="sem-saldo" \${st.filtroOs === 'sem-saldo' ? 'selected' : ''}>OS sem saldo</option></select></div>`,
    'select filtro OS'
  );

  out = replaceOrKeep(
    out,
    'for (const r of st.rotas) {',
    'for (const r of rows().base) {',
    'tabela inferior filtrada'
  );

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
