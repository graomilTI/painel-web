import { supabase } from './supabaseClient.js';

const RELEASE = '20260713-bfleet-auditor2';
const POSICAO_CACHE_MS = 90 * 1000;
const REFRESH_INTERVAL_MS = 2 * 60 * 1000;

const state = {
  loading: null,
  loadedAt: 0,
  byPlate: new Map(),
  byVehicleId: new Map(),
  byDriverName: new Map(),
  auditorIds: new Set(),
  auditorNames: new Set(),
  leafletPatched: false,
  rendererWrapped: false,
  refreshTimer: null,
};

const text = value => String(value ?? '').trim();
const norm = value => text(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, ' ')
  .trim();
const plate = value => text(value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
const finite = value => value !== null && value !== '' && Number.isFinite(Number(value));

function collaboratorId(row) {
  return text(row?.colaboradorId || row?.colaborador_id || row?.cpf || row?.id);
}

function collaboratorName(row) {
  return text(row?.nome || row?.nome_colaborador || row?.colaborador_nome || row?.funcionario || row?.motorista_atual || row?.patrimonio_funcionario);
}

function isAuditor(row) {
  if (!row) return false;
  const id = collaboratorId(row);
  const name = norm(collaboratorName(row));
  const role = norm([
    row.cargo,
    row.funcao,
    row.funcao_nome,
    row.ocupacao,
    row.tipo_cargo,
    row.descricao_cargo,
  ].filter(Boolean).join(' '));

  return /\bAUDITOR(?:A|ES|AS)?\b/.test(role)
    || (id && state.auditorIds.has(id))
    || (name && state.auditorNames.has(name));
}

function vehiclePlate(row) {
  return plate(row?.veiculoPlaca || row?.veiculo_placa || row?.placa_veiculo || row?.placa || row?.placa_normalizada || row?.bfleet_placa);
}

function vehicleId(row) {
  return text(row?.veiculoId || row?.veiculo_id || row?.vehicle_id || row?.frota_id);
}

function validPosition(row) {
  return finite(row?.latitude) && finite(row?.longitude)
    && Number(row.latitude) >= -34.5 && Number(row.latitude) <= 6.5
    && Number(row.longitude) >= -75.5 && Number(row.longitude) <= -28;
}

function latestDate(row) {
  const raw = row?.reportado_em || row?.atualizado_em;
  const date = raw ? new Date(raw) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

function preferLatest(current, candidate) {
  if (!current) return candidate;
  return latestDate(candidate) >= latestDate(current) ? candidate : current;
}

async function loadAuditors() {
  const result = await supabase
    .from('colaborador_cruzamento')
    .select('colaborador_id,cpf,id,nome,colaborador_nome,funcionario,cargo')
    .ilike('cargo', '%AUDITOR%')
    .limit(5000);

  if (result.error) {
    console.warn('[programacao-mapa-bfleet] auditoria indisponível:', result.error);
    return;
  }

  const ids = new Set();
  const names = new Set();
  for (const row of result.data || []) {
    [row.colaborador_id, row.cpf, row.id].map(text).filter(Boolean).forEach(id => ids.add(id));
    [row.nome, row.colaborador_nome, row.funcionario].map(norm).filter(Boolean).forEach(name => names.add(name));
  }
  state.auditorIds = ids;
  state.auditorNames = names;
}

async function syncBfleet() {
  try {
    const result = await supabase.functions.invoke('bfleet-posicoes', {
      body: { origem: 'programacao_mapa', release: RELEASE },
    });
    if (result.error) throw result.error;
  } catch (error) {
    // Usa a última posição já salva caso a API esteja temporariamente indisponível.
    console.warn('[programacao-mapa-bfleet] sincronização BFleet:', error);
  }
}

async function loadBfleetPositions() {
  await syncBfleet();

  const [positionsResult, vehiclesResult] = await Promise.all([
    supabase
      .from('frotas_posicoes')
      .select('placa,veiculo_id,latitude,longitude,endereco,motorista,reportado_em,atualizado_em')
      .limit(10000),
    supabase
      .from('frotas_veiculos')
      .select('id,placa,placa_normalizada,motorista_atual,bfleet_condutor,patrimonio_funcionario')
      .limit(10000),
  ]);

  if (positionsResult.error) {
    console.warn('[programacao-mapa-bfleet] posições BFleet indisponíveis:', positionsResult.error);
    return;
  }
  if (vehiclesResult.error) {
    console.warn('[programacao-mapa-bfleet] veículos indisponíveis:', vehiclesResult.error);
  }

  const byPlate = new Map();
  const byVehicleId = new Map();
  const byDriverName = new Map();

  for (const row of positionsResult.data || []) {
    if (!validPosition(row)) continue;
    const normalized = {
      ...row,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      placa: plate(row.placa),
      origem_posicao: 'BFLEET',
    };
    if (normalized.placa) byPlate.set(normalized.placa, preferLatest(byPlate.get(normalized.placa), normalized));
    if (row.veiculo_id) byVehicleId.set(text(row.veiculo_id), preferLatest(byVehicleId.get(text(row.veiculo_id)), normalized));
    if (row.motorista) {
      const key = norm(row.motorista);
      if (key) byDriverName.set(key, preferLatest(byDriverName.get(key), normalized));
    }
  }

  for (const vehicle of vehiclesResult.data || []) {
    const pl = plate(vehicle.placa_normalizada || vehicle.placa);
    const position = byVehicleId.get(text(vehicle.id)) || byPlate.get(pl);
    if (!position) continue;
    if (vehicle.id) byVehicleId.set(text(vehicle.id), position);
    if (pl) byPlate.set(pl, position);
    [vehicle.motorista_atual, vehicle.bfleet_condutor, vehicle.patrimonio_funcionario]
      .map(norm)
      .filter(Boolean)
      .forEach(name => byDriverName.set(name, preferLatest(byDriverName.get(name), position)));
  }

  state.byPlate = byPlate;
  state.byVehicleId = byVehicleId;
  state.byDriverName = byDriverName;
}

async function prepareData({ force = false } = {}) {
  if (!force && state.loadedAt && Date.now() - state.loadedAt < POSICAO_CACHE_MS) return;
  if (state.loading) return state.loading;

  state.loading = Promise.allSettled([loadAuditors(), loadBfleetPositions()])
    .finally(() => {
      state.loadedAt = Date.now();
      state.loading = null;
    });
  return state.loading;
}

function positionFor(row) {
  if (!row) return null;
  const id = vehicleId(row);
  const pl = vehiclePlate(row);
  const name = norm(collaboratorName(row));
  return (id && state.byVehicleId.get(id))
    || (pl && state.byPlate.get(pl))
    || (name && state.byDriverName.get(name))
    || null;
}

function isFleet(row, meta) {
  const type = norm(meta?.tipo);
  return type === 'MOTORISTA'
    || type === 'FROTA'
    || Boolean(vehicleId(row) || vehiclePlate(row));
}

function formatPositionDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function enrichFleetRow(row, position) {
  if (!row || !position) return;
  row.lat = position.latitude;
  row.lng = position.longitude;
  row.latitude = position.latitude;
  row.longitude = position.longitude;
  row.colab_lat = position.latitude;
  row.colab_lng = position.longitude;
  row.endereco = position.endereco || row.endereco || '';
  row.endereco_base = position.endereco || row.endereco_base || row.endereco || '';
  row.origem_posicao = 'BFLEET';
  row.bfleet_reportado_em = position.reportado_em || position.atualizado_em || null;
  if (!row.veiculoPlaca && position.placa) row.veiculoPlaca = position.placa;
  if (!row.veiculo_placa && position.placa) row.veiculo_placa = position.placa;
}

function enrichTooltip(layer, position) {
  if (!layer || layer.__pmgBfleetTooltip === RELEASE) return;
  const tooltip = layer.getTooltip?.();
  const current = tooltip?.getContent?.();
  if (typeof current !== 'string') return;

  const address = text(position.endereco);
  const updated = formatPositionDate(position.reportado_em || position.atualizado_em);
  const details = [
    '<br><b>BFleet</b>',
    address ? ` · ${address}` : '',
    updated ? ` · ${updated}` : '',
  ].join('');
  tooltip.setContent(`${current}${details}`);
  layer.__pmgBfleetTooltip = RELEASE;
}

function htmlText(value) {
  const container = document.createElement('div');
  container.innerHTML = String(value || '');
  return text(container.textContent || container.innerText || '');
}

function routeDriverPosition(layer) {
  const tooltip = layer?.getTooltip?.();
  const content = tooltip?.getContent?.();
  if (typeof content !== 'string') return null;
  const match = content.match(/<b>([\s\S]*?)<\/b>/i);
  const driverName = norm(htmlText(match?.[1] || ''));
  return driverName ? state.byDriverName.get(driverName) || null : null;
}

function connectRouteToBfleet(layer) {
  if (!layer || typeof layer.getLatLngs !== 'function' || typeof layer.setLatLngs !== 'function') return false;
  if (layer.__pmgBfleetRouteConnected === RELEASE) return true;

  const position = routeDriverPosition(layer);
  if (!position) return false;

  const latLngs = layer.getLatLngs();
  if (!Array.isArray(latLngs) || !latLngs.length) return false;

  const origin = window.L.latLng(position.latitude, position.longitude);
  if (Array.isArray(latLngs[0])) {
    const groups = latLngs.map(group => Array.isArray(group) ? group.slice() : group);
    if (!groups[0]?.length) return false;
    groups[0][0] = origin;
    layer.setLatLngs(groups);
  } else {
    const points = latLngs.slice();
    points[0] = origin;
    layer.setLatLngs(points);
  }

  layer.__pmgBfleetRouteConnected = RELEASE;
  return true;
}

async function ensureLeaflet() {
  if (window.L?.LayerGroup) return window.L;

  if (!document.querySelector('link[href*="leaflet.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './assets/vendor/leaflet/leaflet.css';
    document.head.appendChild(link);
  }

  let script = [...document.scripts].find(item => item.src.includes('/leaflet/leaflet.js'));
  if (!script) {
    script = document.createElement('script');
    script.src = './assets/vendor/leaflet/leaflet.js';
    document.head.appendChild(script);
  }

  const startedAt = Date.now();
  while (!window.L?.LayerGroup && Date.now() - startedAt < 7000) {
    await new Promise(resolve => window.setTimeout(resolve, 25));
  }
  return window.L || null;
}

function patchLeaflet() {
  const L = window.L;
  if (!L?.LayerGroup || state.leafletPatched) return false;

  const proto = L.LayerGroup.prototype;
  const originalAddLayer = proto.addLayer;
  if (originalAddLayer.__programacaoBfleetAuditorPatch) {
    state.leafletPatched = true;
    return true;
  }

  function addLayerPatched(layer) {
    const meta = layer?.__pmgMeta;
    const row = meta?.colab;

    if (row && isAuditor(row)) {
      layer.__pmgHiddenAuditor = true;
      return this;
    }

    if (row && isFleet(row, meta)) {
      const position = positionFor(row);
      if (position) {
        enrichFleetRow(row, position);
        if (typeof layer.setLatLng === 'function') {
          layer.setLatLng([position.latitude, position.longitude]);
          layer.__origLatLng = layer.getLatLng?.() || { lat: position.latitude, lng: position.longitude };
        }
        enrichTooltip(layer, position);
      }
    }

    // A rota era calculada com a coordenada residencial antes do marcador ser
    // reposicionado pela BFleet. Corrige o primeiro ponto da linha para a mesma
    // posição usada pelo ícone da frota, evitando a rota "solta" no mapa.
    connectRouteToBfleet(layer);

    return originalAddLayer.call(this, layer);
  }

  addLayerPatched.__programacaoBfleetAuditorPatch = RELEASE;
  addLayerPatched.__original = originalAddLayer;
  proto.addLayer = addLayerPatched;
  state.leafletPatched = true;
  return true;
}

function filterAndEnrich(rows) {
  return (rows || [])
    .filter(row => !isAuditor(row))
    .map(row => {
      const copy = { ...row };
      const position = positionFor(copy);
      if (position && isFleet(copy, null)) enrichFleetRow(copy, position);
      return copy;
    });
}

function filteredSnapshot(snapshot) {
  if (!snapshot?.osComCandidatosAtual) return snapshot;
  return {
    ...snapshot,
    osComCandidatosAtual: snapshot.osComCandidatosAtual.map(item => ({
      ...item,
      candidatos: filterAndEnrich(item.candidatos),
      colaboradoresRegional: filterAndEnrich(item.colaboradoresRegional),
      equipeRows: filterAndEnrich(item.equipeRows),
    })),
  };
}

function copyFunctionProperties(from, to) {
  for (const key of Object.keys(from || {})) {
    try { to[key] = from[key]; } catch { /* propriedade somente leitura */ }
  }
}

function installRendererWrapper() {
  const current = window.__pmgRenderMapaGestor;
  if (typeof current !== 'function') return false;
  if (current.__programacaoBfleetAuditor === RELEASE) {
    state.rendererWrapped = true;
    return true;
  }

  const wrapped = async (...args) => {
    await prepareData();
    await ensureLeaflet();
    patchLeaflet();

    const originalGetter = window.__peqbGetEquipeSnapshot;
    if (typeof originalGetter !== 'function') return current(...args);
    const safeGetter = () => filteredSnapshot(originalGetter());
    window.__peqbGetEquipeSnapshot = safeGetter;
    try {
      return await current(...args);
    } finally {
      if (window.__peqbGetEquipeSnapshot === safeGetter) window.__peqbGetEquipeSnapshot = originalGetter;
    }
  };

  copyFunctionProperties(current, wrapped);
  wrapped.__programacaoBfleetAuditor = RELEASE;
  wrapped.__programacaoBfleetAuditorOriginal = current;
  window.__pmgRenderMapaGestor = wrapped;
  state.rendererWrapped = true;
  return true;
}

function forceMapRefresh() {
  const button = document.getElementById('pmgAtualizarManual');
  if (button) {
    button.click();
    return;
  }
  const renderer = window.__pmgRenderMapaGestor;
  if (typeof renderer === 'function') Promise.resolve(renderer()).catch(() => {});
}

async function refreshAll({ force = false, refreshMap = true } = {}) {
  await prepareData({ force });
  await ensureLeaflet();
  patchLeaflet();
  installRendererWrapper();
  if (refreshMap && document.getElementById('peqbMapEl2')) forceMapRefresh();
}

function boot() {
  const install = () => {
    installRendererWrapper();
    if (window.L) patchLeaflet();
  };

  [0, 80, 250, 700, 1500, 3000].forEach(delay => window.setTimeout(install, delay));
  window.setTimeout(() => refreshAll({ force: true }), 500);

  document.addEventListener('click', event => {
    if (event.target.closest('#progLoadContext')
      || event.target.closest('#progSteps .stepbtn')
      || event.target.closest('#peqbVerMapa')) {
      window.setTimeout(() => refreshAll({ force: false }), 250);
    }
  }, true);

  state.refreshTimer = window.setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    refreshAll({ force: true, refreshMap: Boolean(document.getElementById('peqbMapEl2')) });
  }, REFRESH_INTERVAL_MS);
}

if (!window.__programacaoMapaBfleetAuditorInstalled) {
  window.__programacaoMapaBfleetAuditorInstalled = RELEASE;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}
