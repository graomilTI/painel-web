import { supabase } from './supabaseClient.js';

const RELEASE = '20260714-rotaskm3';
const ROUTE_COLORS = ['#a78bfa', '#f472b6', '#fb923c', '#38bdf8', '#facc15', '#4ade80'];
const CACHE_MS = 30 * 1000;

const state = {
  map: null,
  layer: null,
  layers: [],
  rebuilding: false,
  rerun: false,
  timer: null,
  dataAt: 0,
  cache: null,
  rendererWrapped: null,
  addLayerWrapped: null,
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
const validPoint = point => point && finite(point.lat) && finite(point.lng)
  && Number(point.lat) >= -34.5 && Number(point.lat) <= 6.5
  && Number(point.lng) >= -75.5 && Number(point.lng) <= -28;

function pointOf(row) {
  if (!row) return null;
  const lat = row.lat ?? row.latitude ?? row.colab_lat;
  const lng = row.lng ?? row.longitude ?? row.colab_lng;
  const point = { lat: Number(lat), lng: Number(lng) };
  return validPoint(point) ? point : null;
}

function pointOfItem(item) {
  const source = item?.ponto || item?.os || {};
  return pointOf(source);
}

function collaboratorId(row) {
  return text(row?.colaboradorId || row?.colaborador_id || row?.cpf || row?.id);
}

function collaboratorName(row) {
  return text(row?.nome || row?.nome_colaborador || row?.colaborador_nome || row?.funcionario || row?.motorista_atual || row?.patrimonio_funcionario);
}

function programacaoIdFor(snapshot, item) {
  return text(snapshot?.programacaoIdParaOs?.(item?.os)
    || item?.programacao_id
    || item?.equipeRows?.[0]?.programacao_id);
}

function kmBetween(a, b) {
  if (!validPoint(a) || !validPoint(b)) return Number.POSITIVE_INFINITY;
  const radius = 6371;
  const rad = value => Number(value) * Math.PI / 180;
  const dLat = rad(Number(b.lat) - Number(a.lat));
  const dLng = rad(Number(b.lng) - Number(a.lng));
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function programacaoIds(snapshot) {
  const ids = new Set();
  if (snapshot?.programacaoId) ids.add(text(snapshot.programacaoId));
  for (const item of snapshot?.osComCandidatosAtual || []) {
    const id = programacaoIdFor(snapshot, item);
    if (id) ids.add(id);
    for (const row of item.equipeRows || []) {
      if (row.programacao_id) ids.add(text(row.programacao_id));
    }
  }
  const idMap = window.__progGetProgramacaoIdMap?.();
  if (idMap instanceof Map) {
    for (const id of idMap.values()) if (id) ids.add(text(id));
  }
  return [...ids].filter(Boolean);
}

function addPerson(index, row) {
  const id = collaboratorId(row);
  const name = collaboratorName(row);
  if (!id && !name) return;
  const current = (id && index.byId.get(id)) || (name && index.byName.get(norm(name))) || {};
  const merged = {
    ...current,
    ...row,
    colaboradorId: id || collaboratorId(current),
    nome: name || collaboratorName(current),
  };
  if (merged.colaboradorId) index.byId.set(merged.colaboradorId, merged);
  if (merged.nome) index.byName.set(norm(merged.nome), merged);
}

function buildIndexes(snapshot, coords) {
  const people = { byId: new Map(), byName: new Map() };
  const assignments = new Map();
  const assignmentsById = new Map();

  // Preenche a coordenada de casa de todo mundo que aparece em programacao_deslocamento
  // primeiro — quem também vier no snapshot (candidato/regional/equipe) sobrescreve
  // depois com o que já estava carregado ali, mas ninguém fica sem pickup só por
  // não ser mais candidato de nenhuma O.S. aberta.
  for (const row of coords || []) {
    addPerson(people, { colaboradorId: row.cpf, nome: row.nome, latitude: row.latitude, longitude: row.longitude });
  }

  for (const item of snapshot?.osComCandidatosAtual || []) {
    const programacaoId = programacaoIdFor(snapshot, item);
    for (const row of [...(item.candidatos || []), ...(item.colaboradoresRegional || []), ...(item.equipeRows || [])]) {
      addPerson(people, row);
    }
    for (const row of item.equipeRows || []) {
      if (row.confirmado === false) continue;
      const id = collaboratorId(row);
      const itemProgramacaoId = text(row.programacao_id || programacaoId);
      if (!id || !item?.os?.id) continue;
      const assignment = {
        programacaoId: itemProgramacaoId,
        collaboratorId: id,
        name: collaboratorName(row),
        os: item.os,
        point: pointOfItem(item),
      };
      const key = `${itemProgramacaoId}|${id}`;
      const list = assignments.get(key) || [];
      list.push(assignment);
      assignments.set(key, list);
      const anyList = assignmentsById.get(id) || [];
      anyList.push(assignment);
      assignmentsById.set(id, anyList);
    }
  }

  return { people, assignments, assignmentsById };
}

function resolvePerson(indexes, row) {
  const id = collaboratorId(row);
  const name = collaboratorName(row);
  return (id && indexes.people.byId.get(id))
    || (name && indexes.people.byName.get(norm(name)))
    || row
    || null;
}

function resolveAssignments(indexes, programacaoId, collaboratorIdValue) {
  const exact = indexes.assignments.get(`${text(programacaoId)}|${text(collaboratorIdValue)}`);
  if (exact?.length) return exact;
  return indexes.assignmentsById.get(text(collaboratorIdValue)) || [];
}

function positionByPlate(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const pl = plate(row.placa);
    const point = pointOf(row);
    if (!pl || !point) continue;
    const current = map.get(pl);
    const currentAt = current ? new Date(current.reportado_em || current.atualizado_em || 0).getTime() : 0;
    const nextAt = new Date(row.reportado_em || row.atualizado_em || 0).getTime();
    if (!current || nextAt >= currentAt) map.set(pl, { ...row, ...point, placa: pl });
  }
  return map;
}

async function loadRouteData(snapshot, { force = false } = {}) {
  if (!force && state.cache && Date.now() - state.dataAt < CACHE_MS) return state.cache;
  const ids = programacaoIds(snapshot);
  if (!ids.length) return null;

  try {
    const sync = await supabase.functions.invoke('bfleet-posicoes', {
      body: { origem: 'programacao_rotas_conectadas', release: RELEASE },
    });
    if (sync.error) throw sync.error;
  } catch (error) {
    console.warn('[rotas-conectadas] atualização BFleet:', error);
  }

  const [moves, availability, positions] = await Promise.all([
    supabase
      .from('programacao_deslocamento')
      .select('programacao_id,data_referencia,colaborador_id,nome_colaborador,tipo_deslocamento,placa_veiculo')
      .in('programacao_id', ids)
      .limit(12000),
    supabase
      .from('programacao_colaboradores')
      .select('programacao_id,colaborador_id,disponibilidade')
      .in('programacao_id', ids)
      .limit(12000),
    supabase
      .from('frotas_posicoes')
      .select('placa,veiculo_id,latitude,longitude,endereco,motorista,reportado_em,atualizado_em')
      .limit(12000),
  ]);

  if (moves.error) throw moves.error;
  if (availability.error) console.warn('[rotas-conectadas] disponibilidade:', availability.error);
  if (positions.error) throw positions.error;

  // Motorista/carona (moves) só trazem colaborador_id/nome — a coordenada de
  // casa (pickup) precisa vir daqui, direto do cadastro, porque o snapshot da
  // Etapa 2 só embute lat/lng de quem aparece como candidato/regional de
  // ALGUMA O.S. aberta (RPC top-N). Um confirmado que já não é mais candidato
  // em nenhuma O.S. visível ficava sem coordenada e a rota pulava o embarque
  // dele, indo direto pra O.S. como se não houvesse carona.
  const cpfs = [...new Set((moves.data || []).map(row => text(row.colaborador_id)).filter(Boolean))];
  const coords = cpfs.length
    ? await supabase.from('colaborador_cruzamento').select('cpf,nome,latitude,longitude').in('cpf', cpfs)
    : { data: [] };
  if (coords.error) console.warn('[rotas-conectadas] coordenadas de colaborador:', coords.error);

  const data = {
    moves: moves.data || [],
    availability: availability.data || [],
    positions: positions.data || [],
    coords: coords.data || [],
  };
  state.cache = data;
  state.dataAt = Date.now();
  return data;
}

function groupMoves(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const pl = plate(row.placa_veiculo);
    const type = norm(row.tipo_deslocamento);
    if (!pl || (type !== 'MOTORISTA FROTA' && type !== 'CARONA FROTA')) continue;
    const group = groups.get(pl) || { plate: pl, drivers: [], passengers: [] };
    if (type === 'MOTORISTA FROTA') group.drivers.push(row);
    else group.passengers.push(row);
    groups.set(pl, group);
  }
  return groups;
}

function availabilityIndex(rows) {
  const map = new Map();
  for (const row of rows || []) {
    map.set(`${text(row.programacao_id)}|${text(row.colaborador_id)}`, norm(row.disponibilidade));
  }
  return map;
}

function makeStops(group, origin, indexes, availabilityMap) {
  const pickupById = new Map();
  const dropByOs = new Map();
  const passengers = [];

  for (const row of group.passengers) {
    const id = collaboratorId(row);
    if (!id) continue;
    const person = resolvePerson(indexes, row);
    const home = pointOf(person);
    const assignments = resolveAssignments(indexes, row.programacao_id, id);
    const assignment = assignments.find(item => validPoint(item.point)) || assignments[0] || null;
    if (!assignment?.point) continue;

    passengers.push({ id, name: collaboratorName(person) || collaboratorName(row), home, assignment });
    if (home && !pickupById.has(id)) {
      pickupById.set(id, {
        type: 'pickup',
        key: `PICKUP|${id}`,
        collaboratorId: id,
        name: collaboratorName(person) || collaboratorName(row),
        point: home,
      });
    }

    const osId = text(assignment.os?.id || assignment.os?.numero_os || assignment.point.lat + ',' + assignment.point.lng);
    const drop = dropByOs.get(osId) || {
      type: 'dropoff',
      key: `DROPOFF|${osId}`,
      point: assignment.point,
      os: assignment.os,
      required: new Set(),
      names: [],
    };
    if (home) drop.required.add(id);
    if (!drop.names.includes(passengers[passengers.length - 1].name)) drop.names.push(passengers[passengers.length - 1].name);
    dropByOs.set(osId, drop);
  }

  const driver = group.drivers[0] || null;
  const driverId = collaboratorId(driver);
  const driverAssignments = driverId ? resolveAssignments(indexes, driver?.programacao_id, driverId).filter(item => validPoint(item.point)) : [];
  const driverAvailability = driverId
    ? availabilityMap.get(`${text(driver?.programacao_id)}|${driverId}`) || ''
    : '';

  const logistics = [];
  let atendimento = null;
  if (driverAssignments.length) {
    if (driverAvailability === 'LOGISTICA') {
      driverAssignments.forEach((assignment, index) => logistics.push({
        type: 'logistics',
        key: `LOG|${text(assignment.os?.id) || index}`,
        point: assignment.point,
        os: assignment.os,
      }));
    } else {
      const assignment = driverAssignments[0];
      atendimento = {
        type: 'attendance',
        key: `ATT|${text(assignment.os?.id) || driverId}`,
        point: assignment.point,
        os: assignment.os,
      };
    }
  }

  const pending = [...pickupById.values(), ...dropByOs.values(), ...logistics];
  const picked = new Set();
  const ordered = [];
  let current = origin;

  while (pending.length) {
    const eligible = pending.filter(stop => {
      if (stop.type !== 'dropoff') return true;
      return [...stop.required].every(id => picked.has(id));
    });
    if (!eligible.length) break;
    eligible.sort((a, b) => kmBetween(current, a.point) - kmBetween(current, b.point));
    const next = eligible[0];
    ordered.push(next);
    pending.splice(pending.indexOf(next), 1);
    if (next.type === 'pickup') picked.add(next.collaboratorId);
    current = next.point;
  }

  if (atendimento) ordered.push(atendimento);
  return { driver, passengers, ordered };
}

function routeKm(points) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += kmBetween(points[index - 1], points[index]);
  return total;
}

function tooltipFor(group, plan, position, km) {
  const driverName = collaboratorName(plan.driver) || text(position.motorista) || `Frota ${group.plate}`;
  const steps = plan.ordered.map((stop, index) => {
    if (stop.type === 'pickup') return `${index + 1}. Buscar ${stop.name}`;
    if (stop.type === 'dropoff') return `${index + 1}. Levar ${stop.names.join(', ')} · O.S. ${text(stop.os?.numero_os) || '-'}`;
    if (stop.type === 'logistics') return `${index + 1}. Logística · O.S. ${text(stop.os?.numero_os) || '-'}`;
    return `${index + 1}. Atendimento · O.S. ${text(stop.os?.numero_os) || '-'}`;
  }).join('<br>');
  const address = text(position.endereco);
  const kmLabel = Number.isFinite(km) ? ` · ~${km.toFixed(1)} km no dia` : '';
  return `<b>${driverName}</b> · ${group.plate}${kmLabel}${address ? `<br>BFleet: ${address}` : ''}${steps ? `<br>${steps}` : ''}`;
}

function kmBadge(color, km) {
  return window.L.divIcon({
    className: 'pmg-km-badge',
    html: `<span style="display:inline-block;background:${color};color:#020617;font-weight:900;font-size:10px;padding:1px 6px;border-radius:999px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.5)">~${km.toFixed(1)} km</span>`,
    iconSize: [0, 0],
  });
}

function clearRoutes() {
  for (const layer of state.layers) {
    try { state.map?.removeLayer(layer); } catch { /* camada já removida */ }
  }
  state.layers = [];
  if (state.layer) {
    try { state.layer.clearLayers(); } catch { /* ignora */ }
  }
}

function ensureRouteLayer() {
  if (!state.map || !window.L) return null;
  if (state.layer && state.layer._map === state.map) return state.layer;
  if (state.layer) {
    try { state.map.removeLayer(state.layer); } catch { /* ignora */ }
  }
  state.layer = window.L.layerGroup().addTo(state.map);
  return state.layer;
}

async function rebuildRoutes({ force = false } = {}) {
  if (state.rebuilding) {
    state.rerun = true;
    return;
  }
  const snapshot = window.__peqbGetEquipeSnapshot?.();
  if (!snapshot?.osComCandidatosAtual?.length || !state.map) return;

  state.rebuilding = true;
  try {
    const data = await loadRouteData(snapshot, { force });
    if (!data) return;
    const indexes = buildIndexes(snapshot, data.coords);
    const groups = groupMoves(data.moves);
    const positions = positionByPlate(data.positions);
    const availabilityMap = availabilityIndex(data.availability);
    const layerGroup = ensureRouteLayer();
    if (!layerGroup) return;

    clearRoutes();
    let routeIndex = 0;
    for (const group of groups.values()) {
      const originRow = positions.get(group.plate);
      const origin = pointOf(originRow);
      if (!origin) continue;
      const plan = makeStops(group, origin, indexes, availabilityMap);
      if (!plan.ordered.length) continue;

      const points = [origin, ...plan.ordered.map(stop => stop.point)].filter(validPoint);
      if (points.length < 2) continue;
      const km = routeKm(points);
      const color = ROUTE_COLORS[routeIndex % ROUTE_COLORS.length];
      const line = window.L.polyline(points.map(point => [point.lat, point.lng]), {
        color,
        weight: 4,
        opacity: 0.92,
        dashArray: '6 8',
        lineCap: 'round',
        lineJoin: 'round',
        interactive: true,
      });
      line.__pmgConnectedRoute = RELEASE;
      line.bindTooltip(tooltipFor(group, plan, originRow, km), { className: 'peqb-tt', sticky: true });
      layerGroup.addLayer(line);
      state.layers.push(line);

      const meio = points[Math.floor(points.length / 2)];
      if (meio) {
        const badge = window.L.marker([meio.lat, meio.lng], {
          icon: kmBadge(color, km),
          interactive: false,
          keyboard: false,
        });
        badge.__pmgConnectedRoute = RELEASE;
        layerGroup.addLayer(badge);
        state.layers.push(badge);
      }
      routeIndex += 1;
    }
  } catch (error) {
    console.error('[rotas-conectadas] falha ao desenhar:', error);
  } finally {
    state.rebuilding = false;
    if (state.rerun) {
      state.rerun = false;
      window.setTimeout(() => rebuildRoutes({ force: false }), 120);
    }
  }
}

function scheduleRebuild(delay = 220, options = {}) {
  window.clearTimeout(state.timer);
  state.timer = window.setTimeout(() => rebuildRoutes(options), delay);
}

function isCoreRoute(layer) {
  if (!layer || layer.__pmgConnectedRoute) return false;
  if (typeof layer.getLatLngs !== 'function' || typeof layer.getLatLng === 'function') return false;
  const dash = text(layer.options?.dashArray).replace(/\s+/g, ' ');
  const tooltip = layer.getTooltip?.()?.getContent?.();
  return dash === '2 8' || (typeof tooltip === 'string' && /<b>[\s\S]*?<\/b>/i.test(tooltip));
}

function installLayerPatch() {
  const proto = window.L?.LayerGroup?.prototype;
  if (!proto) return false;
  const current = proto.addLayer;
  if (current.__pmgConnectedRoutes === RELEASE) return true;

  function addLayerConnected(layer) {
    if (this?._map) state.map = this._map;
    if (isCoreRoute(layer)) {
      scheduleRebuild(80);
      return this;
    }
    const result = current.call(this, layer);
    if (layer?.__pmgMeta && !layer.__pmgConnectedRoute) scheduleRebuild(140);
    return result;
  }

  addLayerConnected.__pmgConnectedRoutes = RELEASE;
  addLayerConnected.__programacaoBfleetAuditorPatch = current.__programacaoBfleetAuditorPatch;
  addLayerConnected.__programacaoBfleetStrict = current.__programacaoBfleetStrict;
  addLayerConnected.__original = current;
  proto.addLayer = addLayerConnected;
  state.addLayerWrapped = addLayerConnected;
  return true;
}

function copyFunctionProperties(from, to) {
  for (const key of Object.keys(from || {})) {
    try { to[key] = from[key]; } catch { /* somente leitura */ }
  }
}

function installRendererWrapper() {
  const current = window.__pmgRenderMapaGestor;
  if (typeof current !== 'function') return false;
  if (current.__pmgConnectedRoutes === RELEASE) return true;

  const wrapped = async (...args) => {
    const result = await current(...args);
    installLayerPatch();
    scheduleRebuild(60);
    return result;
  };
  copyFunctionProperties(current, wrapped);
  wrapped.__pmgConnectedRoutes = RELEASE;
  window.__pmgRenderMapaGestor = wrapped;
  state.rendererWrapped = wrapped;
  return true;
}

function boot() {
  const install = () => {
    installLayerPatch();
    installRendererWrapper();
  };
  [0, 80, 250, 700, 1500, 3000, 6000].forEach(delay => window.setTimeout(install, delay));
  const timer = window.setInterval(install, 500);
  window.setTimeout(() => window.clearInterval(timer), 15000);
  window.setTimeout(() => {
    if (document.getElementById('peqbMapEl2')) document.getElementById('pmgAtualizarManual')?.click();
  }, 1200);

  document.addEventListener('click', event => {
    if (event.target.closest('#pmgAtualizarManual')) {
      state.dataAt = 0;
      window.setTimeout(() => scheduleRebuild(0, { force: true }), 420);
    }
    if (event.target.closest('#progLoadContext') || event.target.closest('#progSteps .stepbtn')) {
      state.dataAt = 0;
      window.setTimeout(() => scheduleRebuild(0, { force: true }), 700);
    }
    if (event.target.closest('.prg-overlay [data-apply]')) {
      state.dataAt = 0;
      window.setTimeout(() => scheduleRebuild(0, { force: true }), 1500);
      window.setTimeout(() => scheduleRebuild(0, { force: true }), 3200);
    }
  }, true);

  window.setInterval(() => {
    if (document.visibilityState !== 'visible' || !document.getElementById('peqbMapEl2')) return;
    state.dataAt = 0;
    scheduleRebuild(0, { force: true });
  }, 2 * 60 * 1000);
}

if (!window.__programacaoRotasConectadasInstalled) {
  window.__programacaoRotasConectadasInstalled = RELEASE;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}
