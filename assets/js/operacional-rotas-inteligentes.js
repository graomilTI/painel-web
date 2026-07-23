// Carregador do Mapa Operacional: busca operacional.js como texto, aplica patches em tempo de
// carregamento e importa via Blob. É o único ponto que carrega operacional.js na página ADM — e
// o mecanismo de fetch do qual operacional-os-ativas-patch.js e operacional-motorista-placa-patch.js
// dependem pra interceptar o source antes daqui. Não trocar por `import` estático sem migrar esses
// dois. Os patches de rota/pareamento foram removidos (motor de sugestão saiu do mapa em 2026-07-23);
// o que resta são placa por motorista, carona/custo (aba Sugerido x Registrado) e popups de street view.

const SMART_VERSION = '20260723-sem-motor-sugestao';

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

function patchSource(source, supabaseClientUrl) {
  let out = source;

  out = replaceOrKeep(
    out,
    "import { supabase } from './supabaseClient.js';",
    `import { supabase } from '${supabaseClientUrl}';`,
    'import supabase'
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
      return { modo: 'reembolso', label: 'Veículo próprio (Conferência · Deslocamento)', custoFn: veiculoProprioIdaVolta };
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

    // Cadastro ativo em Conferência > Deslocamento (programacao_veiculo_proprio) é fato confirmado,
    // não suposição — checa ANTES da carona/sem-modo. Tinha sido descartado sem querer nessa
    // reescrita (a versão anterior deste patch não tinha esse ramo), o que jogava esses
    // colaboradores pra "sem sugestão"/inviável e forçava o motor a buscar gente bem mais longe.
    if (st.veiculoProprioCpfs.has(c.cpf) || st.veiculoProprioNomes.has(norm(c.nome))) {
      return { modo: 'reembolso', label: 'Veículo próprio (Conferência · Deslocamento)', custoFn: veiculoProprioIdaVolta };
    }

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
