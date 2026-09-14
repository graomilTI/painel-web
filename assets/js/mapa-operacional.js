import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { toPanelUrl } from './paths.js';

const FLEET_TYPES = new Set(['MOTORISTA FROTA', 'CARONA FROTA']);
const LODGING_TYPES = new Set(['PERNOITE', 'ALOJAMENTO', 'HOTEL']);
const ROUTE_BLOCKERS = new Set(['SEM_ENDERECO_COLABORADOR', 'SEM_ENDERECO_EMBARQUE', 'SEM_HOTEL']);
const SECONDARY_PENDING = new Set(['SEM_RASTREADOR', 'SEM_VALOR_KM']);

let state = {
  date: localIsoDate(),
  raw: null,
  operations: [],
  supervision: '',
  search: '',
};

function localIsoDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function nextIsoDate(iso) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function normalizePlate(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function km(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

function money(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function brDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(iso);
}

function hasCoord(row, latKey = 'latitude', lonKey = 'longitude') {
  const lat = Number(row?.[latKey]);
  const lon = Number(row?.[lonKey]);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
}

function point(row, latKey = 'latitude', lonKey = 'longitude', extra = {}) {
  if (!hasCoord(row, latKey, lonKey)) return null;
  return { lat: Number(row[latKey]), lon: Number(row[lonKey]), ...extra };
}

async function fetchPaged(factory, { pageSize = 1000, maxPages = 30 } = {}) {
  const rows = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await factory().range(from, to);
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

async function selectIn(table, fields, column, values) {
  const clean = [...new Set((values || []).filter(Boolean))];
  if (!clean.length) return [];
  return fetchPaged(() => supabase.from(table).select(fields).in(column, clean));
}

async function loadHotelAssignments(programIds) {
  if (!programIds.length) return new Map();
  const solicitacoes = await selectIn(
    'hospedagem_solicitacoes',
    'id,programacao_id,cidade,uf,status_solicitacao',
    'programacao_id',
    programIds,
  ).catch(() => []);
  const solIds = solicitacoes.map((row) => row.id).filter(Boolean);
  if (!solIds.length) return new Map();

  const itens = await selectIn(
    'hospedagem_solicitacao_colaboradores',
    'id,solicitacao_id,colaborador_id,nome_colaborador,reserva_id,status_item',
    'solicitacao_id',
    solIds,
  ).catch(() => []);
  const reservaIds = [...new Set(itens.map((row) => row.reserva_id).filter(Boolean))];
  const reservas = reservaIds.length
    ? await selectIn(
      'hospedagem_reservas',
      'id,hotel_id,nome_hotel,cidade_hotel,uf_hotel,status_hospedagem',
      'id',
      reservaIds,
    ).catch(() => [])
    : [];
  const hotelIds = [...new Set(reservas.map((row) => row.hotel_id).filter(Boolean))];
  const hoteis = hotelIds.length
    ? await selectIn('hospedagem_hoteis', 'id,nome,endereco,cidade,uf,latitude,longitude', 'id', hotelIds).catch(() => [])
    : [];

  const solById = new Map(solicitacoes.map((row) => [row.id, row]));
  const reservaById = new Map(reservas.map((row) => [row.id, row]));
  const hotelById = new Map(hoteis.map((row) => [row.id, row]));
  const result = new Map();

  itens.forEach((item) => {
    const sol = solById.get(item.solicitacao_id);
    if (!sol?.programacao_id) return;
    const reserva = reservaById.get(item.reserva_id);
    const hotel = reserva?.hotel_id ? hotelById.get(reserva.hotel_id) : null;
    const key = `${sol.programacao_id}|${normalize(item.nome_colaborador)}`;
    result.set(key, {
      solicitacao: sol,
      reserva,
      hotel,
      nome: hotel?.nome || reserva?.nome_hotel || '',
      cidade: hotel?.cidade || reserva?.cidade_hotel || sol.cidade || '',
      uf: hotel?.uf || reserva?.uf_hotel || sol.uf || '',
    });
  });
  return result;
}

async function loadPositions(date, plates) {
  const clean = [...new Set(plates.map(normalizePlate).filter(Boolean))];
  if (!clean.length) return [];
  const start = `${date}T00:00:00-03:00`;
  const end = `${nextIsoDate(date)}T00:00:00-03:00`;
  return fetchPaged(
    () => supabase
      .from('frotas_posicoes_historico')
      .select('placa,veiculo_id,latitude,longitude,velocidade_kmh,motorista,reportado_em')
      .in('placa', clean)
      .gte('reportado_em', start)
      .lt('reportado_em', end)
      .order('reportado_em', { ascending: true }),
    { pageSize: 1000, maxPages: 40 },
  );
}

async function loadRaw(date) {
  const programacoes = await fetchPaged(() => supabase
    .from('programacao_dia')
    .select('id,data_referencia,coordenacao,supervisao,regional,status')
    .eq('data_referencia', date));

  const programIds = programacoes.map((row) => row.id).filter(Boolean);
  if (!programIds.length) {
    return { programacoes, deslocamentos: [], estadias: [], equipe: [], os: [], colaboradores: [], veiculos: [], opRotas: [], frotaRotas: [], alojamentos: [], hotelAssignments: new Map(), positions: [] };
  }

  const [deslocamentos, estadias, equipe, opRotas, colaboradores, veiculos, alojamentos, hotelAssignments] = await Promise.all([
    selectIn('programacao_deslocamento', 'id,programacao_id,data_referencia,colaborador_id,nome_colaborador,tipo_deslocamento,origem,destino,km,valor,observacao,placa_veiculo', 'programacao_id', programIds),
    selectIn('programacao_estadia', 'id,programacao_id,data_referencia,colaborador_id,nome_colaborador,tem_estadia,tipo_estadia,cidade,uf,diarias,checkin,checkout,observacao,alojamento_id,alojamento_nome', 'programacao_id', programIds),
    selectIn('programacao_equipe', 'id,programacao_id,os_id,colaborador_id,nome_colaborador,km_estimado,duracao_min,ordem_rota,confirmado', 'programacao_id', programIds),
    selectIn('operacional_mapa_rotas', 'id,programacao_id,data_referencia,tipo,veiculo_id,placa,motorista_nome,colaborador_nome,colaborador_cpf,origem_latitude,origem_longitude,origem_tipo,km_total_estimado,duracao_estimada_min,geometria', 'programacao_id', programIds).catch(() => []),
    fetchPaged(() => supabase.from('colaborador_cruzamento').select('colaborador_id,nome,nome_chave,supervisao,coordenacao,tipo_contrato,latitude,longitude,endereco_base,veiculo_id,veiculo_placa,salario'), { pageSize: 1000, maxPages: 4 }).catch(() => []),
    fetchPaged(() => supabase.from('frotas_veiculos').select('id,placa,placa_normalizada,nome,marca,modelo,tipo,status,valor_km,rs_km,motorista_atual,bfleet_condutor,possui_rastreador,rastreador_bfleet,bfleet_rastreador,bfleet_confirmado,bfleet_status,bfleet_device_id'), { pageSize: 1000, maxPages: 3 }).catch(() => []),
    fetchPaged(() => supabase.from('hospedagem_alojamentos').select('id,nome,cidade,uf,endereco,latitude,longitude,status'), { pageSize: 1000, maxPages: 3 }).catch(() => []),
    loadHotelAssignments(programIds),
  ]);

  const osIds = [...new Set(equipe.map((row) => row.os_id).filter(Boolean))];
  const os = osIds.length
    ? await selectIn('operacional_os', 'id,numero_os,situacao,data_os,cliente,embarque,destino,supervisao,ponto1_latitude,ponto1_longitude,destino_latitude,destino_longitude,ponto1_nome,ponto_embarque_id,status_gestor', 'id', osIds)
    : [];

  const plates = deslocamentos.map((row) => row.placa_veiculo).filter(Boolean);
  const normalizedPlates = [...new Set(plates.map(normalizePlate).filter(Boolean))];
  const frotaRotas = normalizedPlates.length
    ? await fetchPaged(() => supabase
      .from('frotas_rotas')
      .select('id,data,placa,veiculo_id,motorista,status,origem_latitude,origem_longitude,km_total_estimado,duracao_estimada_min,qtd_paradas,geometria')
      .eq('data', date)
      .in('placa', normalizedPlates), { pageSize: 1000, maxPages: 5 }).catch(() => [])
    : [];

  const positions = await loadPositions(date, normalizedPlates).catch((error) => {
    console.warn('[mapa-operacional] Falha ao carregar trilha BFleet:', error);
    return [];
  });

  return { programacoes, deslocamentos, estadias, equipe, os, colaboradores, veiculos, opRotas, frotaRotas, alojamentos, hotelAssignments, positions };
}

function haversine(a, b) {
  const lat1 = Number(a?.latitude ?? a?.lat);
  const lon1 = Number(a?.longitude ?? a?.lon);
  const lat2 = Number(b?.latitude ?? b?.lat);
  const lon2 = Number(b?.longitude ?? b?.lon);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return 0;
  const R = 6371;
  const toRad = (v) => v * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const aa = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

function gpsDistance(rows) {
  if (!rows || rows.length < 2) return null;
  let total = 0;
  let validSegments = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const distance = haversine(rows[i - 1], rows[i]);
    if (!Number.isFinite(distance) || distance < 0.02 || distance > 350) continue;
    total += distance;
    validSegments += 1;
  }
  return validSegments ? total : null;
}

function groupKey(row) {
  const program = row.programacao_id || 'SEM_PROGRAMACAO';
  const plate = normalizePlate(row.placa_veiculo);
  const type = normalize(row.tipo_deslocamento);
  if (plate) return `${program}|PLACA|${plate}`;
  if (type === 'REEMBOLSO KM') return `${program}|PARTICULAR|${normalize(row.nome_colaborador)}`;
  if (FLEET_TYPES.has(type)) return `${program}|FROTA_SEM_PLACA|${type === 'MOTORISTA FROTA' ? normalize(row.nome_colaborador) : 'CARONAS'}`;
  return `${program}|${type || 'OUTRO'}|${normalize(row.nome_colaborador)}`;
}

function buildOperations(raw) {
  const programById = new Map(raw.programacoes.map((row) => [row.id, row]));
  const osById = new Map(raw.os.map((row) => [row.id, row]));
  const collaboratorByName = new Map();
  raw.colaboradores.forEach((row) => {
    const key = normalize(row.nome);
    if (key && !collaboratorByName.has(key)) collaboratorByName.set(key, row);
    const key2 = normalize(row.nome_chave);
    if (key2 && !collaboratorByName.has(key2)) collaboratorByName.set(key2, row);
  });

  const vehicleByPlate = new Map();
  raw.veiculos.forEach((row) => {
    const keys = [row.placa, row.placa_normalizada].map(normalizePlate).filter(Boolean);
    keys.forEach((key) => {
      if (!vehicleByPlate.has(key)) vehicleByPlate.set(key, row);
    });
  });

  const lodgingByPerson = new Map();
  raw.estadias.forEach((row) => lodgingByPerson.set(`${row.programacao_id}|${normalize(row.nome_colaborador)}`, row));
  const alojById = new Map(raw.alojamentos.map((row) => [row.id, row]));
  const alojByName = new Map(raw.alojamentos.map((row) => [normalize(row.nome), row]));

  const teamByProgram = new Map();
  raw.equipe.forEach((row) => {
    if (!teamByProgram.has(row.programacao_id)) teamByProgram.set(row.programacao_id, []);
    teamByProgram.get(row.programacao_id).push(row);
  });

  const gpsByPlate = new Map();
  raw.positions.forEach((row) => {
    const plate = normalizePlate(row.placa);
    if (!gpsByPlate.has(plate)) gpsByPlate.set(plate, []);
    gpsByPlate.get(plate).push(row);
  });

  const fleetRouteByPlate = new Map();
  raw.frotaRotas.forEach((row) => {
    const plate = normalizePlate(row.placa);
    const current = fleetRouteByPlate.get(plate);
    if (!current || num(row.km_total_estimado) > num(current.km_total_estimado)) fleetRouteByPlate.set(plate, row);
  });

  const opRouteByPerson = new Map();
  raw.opRotas.forEach((row) => {
    const person = normalize(row.colaborador_nome || row.motorista_nome);
    if (!person) return;
    const key = `${row.programacao_id}|${person}`;
    const current = opRouteByPerson.get(key);
    if (!current || num(row.km_total_estimado) > num(current.km_total_estimado)) opRouteByPerson.set(key, row);
  });

  const grouped = new Map();
  raw.deslocamentos.forEach((row) => {
    const key = groupKey(row);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  });

  const operations = [];
  grouped.forEach((moves, key) => {
    const programId = moves[0]?.programacao_id;
    const program = programById.get(programId) || {};
    const plate = normalizePlate(moves.find((row) => normalizePlate(row.placa_veiculo))?.placa_veiculo);
    const vehicle = plate ? vehicleByPlate.get(plate) : null;
    const driverMove = moves.find((row) => normalize(row.tipo_deslocamento) === 'MOTORISTA FROTA') || null;
    const particularMove = moves.find((row) => normalize(row.tipo_deslocamento) === 'REEMBOLSO KM') || null;
    const driverName = driverMove?.nome_colaborador || (plate ? vehicle?.bfleet_condutor || vehicle?.motorista_atual : '') || particularMove?.nome_colaborador || moves[0]?.nome_colaborador || 'Não identificado';
    const participantNames = [...new Set(moves.map((row) => String(row.nome_colaborador || '').trim()).filter(Boolean))];
    const participantNorms = new Set(participantNames.map(normalize));

    const programTeam = teamByProgram.get(programId) || [];
    let team = programTeam.filter((row) => participantNorms.has(normalize(row.nome_colaborador)));
    if (!team.length && participantNames.length === 1) {
      team = programTeam.filter((row) => normalize(row.nome_colaborador) === normalize(participantNames[0]));
    }
    const relatedOs = [...new Map(team.map((row) => [row.os_id, osById.get(row.os_id)]).filter(([, row]) => row)).values()];

    const collaborators = participantNames.map((name) => ({ name, base: collaboratorByName.get(normalize(name)) || null }));
    const lodgings = participantNames.map((name) => {
      const stay = lodgingByPerson.get(`${programId}|${normalize(name)}`) || null;
      if (!stay) return { name, stay: null, destination: null, hotelAssignment: null };
      const type = normalize(stay.tipo_estadia);
      let destination = null;
      let hotelAssignment = null;
      if (type === 'ALOJAMENTO') {
        destination = (stay.alojamento_id && alojById.get(stay.alojamento_id)) || alojByName.get(normalize(stay.alojamento_nome)) || null;
      } else if (type === 'HOTEL') {
        hotelAssignment = raw.hotelAssignments.get(`${programId}|${normalize(name)}`) || null;
        destination = hotelAssignment?.hotel || null;
      }
      return { name, stay, destination, hotelAssignment };
    });

    const hasOvernight = lodgings.some(({ stay }) => LODGING_TYPES.has(normalize(stay?.tipo_estadia)));
    const gps = plate ? (gpsByPlate.get(plate) || []) : [];
    const actualKm = plate ? gpsDistance(gps) : null;

    const fleetRoute = plate ? fleetRouteByPlate.get(plate) : null;
    const personRoute = opRouteByPerson.get(`${programId}|${normalize(driverName)}`) || opRouteByPerson.get(`${programId}|${normalize(particularMove?.nome_colaborador)}`) || null;
    const moveKm = Math.max(...moves.map((row) => num(row.km)).filter((value) => value > 0), 0);
    const plannedKm = num(fleetRoute?.km_total_estimado) > 0
      ? num(fleetRoute.km_total_estimado)
      : num(personRoute?.km_total_estimado) > 0
        ? num(personRoute.km_total_estimado)
        : moveKm > 0 ? moveKm : null;
    const plannedSource = num(fleetRoute?.km_total_estimado) > 0 ? 'Rota Frotas' : num(personRoute?.km_total_estimado) > 0 ? 'Mapa Operacional' : moveKm > 0 ? 'Programação' : 'Não calculado';

    const pending = [];
    if (collaborators.some(({ base }) => !hasCoord(base))) pending.push('SEM_ENDERECO_COLABORADOR');
    if (relatedOs.some((row) => !hasCoord(row, 'ponto1_latitude', 'ponto1_longitude'))) pending.push('SEM_ENDERECO_EMBARQUE');
    if (lodgings.some(({ stay, destination, hotelAssignment }) => {
      const type = normalize(stay?.tipo_estadia);
      if (type === 'HOTEL') return !hotelAssignment?.nome || !hasCoord(destination);
      if (type === 'ALOJAMENTO') return !destination || !hasCoord(destination);
      return false;
    })) pending.push('SEM_HOTEL');

    const hasFleetMovement = moves.some((row) => FLEET_TYPES.has(normalize(row.tipo_deslocamento)));
    const trackerDeclared = Boolean(vehicle?.possui_rastreador || vehicle?.rastreador_bfleet || vehicle?.bfleet_rastreador || vehicle?.bfleet_confirmado || vehicle?.bfleet_device_id);
    if (hasFleetMovement && (!plate || !vehicle || !trackerDeclared || gps.length === 0)) pending.push('SEM_RASTREADOR');

    const isReimbursement = moves.some((row) => normalize(row.tipo_deslocamento) === 'REEMBOLSO KM');
    const explicitRate = (() => {
      const rates = moves.map((row) => num(row.valor) > 0 && num(row.km) > 0 ? num(row.valor) / num(row.km) : 0).filter((value) => value > 0);
      return rates.length ? Math.max(...rates) : 0;
    })();
    const vehicleRate = num(vehicle?.valor_km) || num(vehicle?.rs_km) || 0;
    const rateKm = explicitRate || vehicleRate || null;
    if (isReimbursement && !rateKm) pending.push('SEM_VALOR_KM');

    const blockers = pending.filter((code) => ROUTE_BLOCKERS.has(code));
    const secondary = pending.filter((code) => SECONDARY_PENDING.has(code));
    const routeMissing = plannedKm === null;
    const status = blockers.length ? 'BLOQUEADO' : (secondary.length || routeMissing ? 'INCOMPLETO' : 'OK');
    const reimbursementCost = isReimbursement && rateKm && plannedKm !== null ? plannedKm * rateKm : null;

    const planPoints = [];
    collaborators.forEach(({ name, base }) => {
      const p = point(base, 'latitude', 'longitude', { kind: 'colaborador', label: name });
      if (p) planPoints.push(p);
    });
    relatedOs.forEach((osRow) => {
      const p = point(osRow, 'ponto1_latitude', 'ponto1_longitude', { kind: 'embarque', label: osRow.ponto1_nome || osRow.embarque || `OS ${osRow.numero_os}` });
      if (p) planPoints.push(p);
    });
    lodgings.forEach(({ stay, destination, hotelAssignment }) => {
      if (!stay || !LODGING_TYPES.has(normalize(stay.tipo_estadia))) return;
      const p = point(destination, 'latitude', 'longitude', { kind: 'hospedagem', label: destination?.nome || hotelAssignment?.nome || stay.alojamento_nome || stay.cidade || stay.tipo_estadia });
      if (p) planPoints.push(p);
    });

    operations.push({
      key,
      programId,
      date: program.data_referencia,
      supervision: program.supervisao || '',
      coordination: program.coordenacao || '',
      regional: program.regional || '',
      programStatus: program.status || '',
      plate,
      vehicle,
      driverName,
      moves,
      participantNames,
      collaborators,
      lodgings,
      relatedOs,
      team,
      hasOvernight,
      returnExpected: !hasOvernight,
      gps,
      actualKm,
      plannedKm,
      plannedSource,
      pending: [...new Set(pending)],
      status,
      rateKm,
      reimbursementCost,
      isReimbursement,
      planPoints,
    });
  });

  return operations.sort((a, b) => {
    const statusOrder = { BLOQUEADO: 0, INCOMPLETO: 1, OK: 2 };
    return (statusOrder[a.status] - statusOrder[b.status]) || a.supervision.localeCompare(b.supervision) || a.driverName.localeCompare(b.driverName);
  });
}

function routeSvg(operation) {
  const actualPoints = operation.gps
    .filter((row) => hasCoord(row))
    .map((row) => ({ lat: Number(row.latitude), lon: Number(row.longitude), kind: 'actual' }));
  const sampled = actualPoints.length > 180
    ? actualPoints.filter((_, index) => index % Math.ceil(actualPoints.length / 180) === 0)
    : actualPoints;
  const all = [...sampled, ...operation.planPoints];
  if (all.length < 2) return '<div class="op-empty" style="padding:18px">Sem coordenadas suficientes para desenhar o trajeto.</div>';

  const lats = all.map((p) => p.lat);
  const lons = all.map((p) => p.lon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const latSpan = Math.max(maxLat - minLat, 0.001);
  const lonSpan = Math.max(maxLon - minLon, 0.001);
  const xy = (p) => ({ x: 12 + ((p.lon - minLon) / lonSpan) * 476, y: 138 - ((p.lat - minLat) / latSpan) * 126 });
  const actualPath = sampled.length >= 2 ? sampled.map((p, index) => `${index ? 'L' : 'M'} ${xy(p).x.toFixed(1)} ${xy(p).y.toFixed(1)}`).join(' ') : '';
  const planDots = operation.planPoints.map((p) => {
    const pos = xy(p);
    const title = esc(p.label || p.kind);
    return `<circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="4.2" fill="#ffd56a" stroke="#07110d" stroke-width="2"><title>${title}</title></circle>`;
  }).join('');
  return `<svg class="op-route-plot" viewBox="0 0 500 150" role="img" aria-label="Esboço geográfico do trajeto">${actualPath ? `<path d="${actualPath}" fill="none" stroke="#7ee2b8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>` : ''}${planDots}</svg><div class="op-route-legend"><span><i class="op-dot actual"></i>Trilha GPS</span><span><i class="op-dot plan"></i>Pontos planejados</span><span>Esboço sem mapa-base</span></div>`;
}

function pendingLabel(code) {
  return ({
    SEM_ENDERECO_COLABORADOR: 'Sem endereço do colaborador',
    SEM_ENDERECO_EMBARQUE: 'Sem coordenada do embarque',
    SEM_HOTEL: 'Hospedagem não localizada',
    SEM_RASTREADOR: 'Sem rastreamento BFleet no dia',
    SEM_VALOR_KM: 'Sem valor por km',
  })[code] || code;
}

function statusClass(status) {
  return status === 'BLOQUEADO' ? 'blocked' : status === 'INCOMPLETO' ? 'incomplete' : 'ok';
}

function operationMatches(operation) {
  if (state.supervision && operation.supervision !== state.supervision) return false;
  if (!state.search) return true;
  const haystack = normalize([
    operation.driverName,
    operation.plate,
    operation.supervision,
    operation.coordination,
    ...operation.participantNames,
    ...operation.relatedOs.flatMap((row) => [row.numero_os, row.cliente, row.embarque, row.ponto1_nome]),
  ].join(' '));
  return haystack.includes(normalize(state.search));
}

function summaryHtml(filtered) {
  const blocked = filtered.filter((row) => row.status === 'BLOQUEADO').length;
  const incomplete = filtered.filter((row) => row.status === 'INCOMPLETO').length;
  const ok = filtered.filter((row) => row.status === 'OK').length;
  const fleet = filtered.filter((row) => row.plate).length;
  const realKm = filtered.reduce((sum, row) => sum + (row.actualKm || 0), 0);
  return `<section class="op-summary">
    <div class="op-kpi"><span>Operações</span><strong>${filtered.length}</strong><small>agrupadas por programação/veículo</small></div>
    <div class="op-kpi is-danger"><span>Bloqueadas</span><strong>${blocked}</strong><small>faltam dados para fechar a rota</small></div>
    <div class="op-kpi is-warn"><span>Incompletas</span><strong>${incomplete}</strong><small>custo, rota ou rastreador incompleto</small></div>
    <div class="op-kpi is-ok"><span>OK</span><strong>${ok}</strong><small>sem pendências detectadas</small></div>
    <div class="op-kpi"><span>KM GPS</span><strong>${realKm ? realKm.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—'}</strong><small>${fleet} operações com placa informada</small></div>
  </section>`;
}

function cardHtml(operation) {
  const vehicleName = [operation.vehicle?.marca, operation.vehicle?.modelo].filter(Boolean).join(' ') || operation.vehicle?.nome || 'Veículo não identificado';
  const pending = operation.pending.length
    ? operation.pending.map((code) => `<span class="op-chip ${ROUTE_BLOCKERS.has(code) ? 'danger' : 'warn'}">${esc(pendingLabel(code))}</span>`).join('')
    : '<span class="op-chip driver">Sem pendências</span>';
  const participants = operation.participantNames.map((name) => `<span class="op-chip ${normalize(name) === normalize(operation.driverName) ? 'driver' : ''}">${normalize(name) === normalize(operation.driverName) ? '● ' : ''}${esc(name)}</span>`).join('');
  const osList = operation.relatedOs.length
    ? operation.relatedOs.map((row) => `<div class="op-os"><strong>OS ${esc(row.numero_os || '—')}</strong><span title="${esc(row.embarque || row.ponto1_nome || '')}">${esc(row.ponto1_nome || row.embarque || row.cliente || 'Local não informado')}</span><em>${hasCoord(row, 'ponto1_latitude', 'ponto1_longitude') ? 'geolocalizada' : 'sem coordenada'}</em></div>`).join('')
    : '<div class="op-empty" style="padding:12px">Nenhuma OS associada aos colaboradores deste agrupamento.</div>';
  const stayLabels = operation.lodgings
    .filter(({ stay }) => stay?.tipo_estadia)
    .map(({ name, stay, destination, hotelAssignment }) => {
      const place = destination?.nome || hotelAssignment?.nome || stay.alojamento_nome || [stay.cidade, stay.uf].filter(Boolean).join('/') || '';
      return `<span class="op-chip">${esc(name)} · ${esc(stay.tipo_estadia)}${place ? ` · ${esc(place)}` : ''}</span>`;
    }).join('') || '<span class="op-chip">Sem estadia registrada</span>';
  const routeMissingNote = operation.plannedKm === null ? '<span class="op-chip warn">Rota prevista ainda não calculada</span>' : '';
  const typeSummary = [...new Set(operation.moves.map((row) => row.tipo_deslocamento).filter(Boolean))].join(' · ');

  return `<article class="op-card" data-operation-key="${esc(operation.key)}">
    <div class="op-card-head">
      <div class="op-card-title"><h4>${esc(operation.driverName)}</h4><p>${esc(operation.supervision || 'Supervisão não informada')} · ${esc(typeSummary || 'Deslocamento não informado')}</p></div>
      <span class="op-status ${statusClass(operation.status)}">${operation.status}</span>
    </div>
    <div class="op-card-body">
      <div class="op-facts">
        <div class="op-fact"><span>Veículo</span><strong>${esc(operation.plate || 'SEM PLACA')}</strong></div>
        <div class="op-fact"><span>KM previsto</span><strong>${km(operation.plannedKm)}</strong></div>
        <div class="op-fact"><span>KM real BFleet*</span><strong>${km(operation.actualKm)}</strong></div>
        <div class="op-fact"><span>Custo reembolso</span><strong>${money(operation.reimbursementCost)}</strong></div>
      </div>
      <div><div class="op-section-title">Equipe / caronas</div><div class="op-chips">${participants || '<span class="op-chip">Sem equipe</span>'}</div></div>
      <div><div class="op-section-title">OS e pontos de embarque</div><div class="op-os-list">${osList}</div></div>
      <div><div class="op-section-title">Estadia</div><div class="op-chips">${stayLabels}</div></div>
      <div><div class="op-section-title">Pendências</div><div class="op-chips">${pending}${routeMissingNote}</div></div>
      <div class="op-route-box"><div class="op-route-head"><strong>Previsto × realizado</strong><span>Fonte prevista: ${esc(operation.plannedSource)}</span></div>${routeSvg(operation)}</div>
      <div class="op-note">* KM real BFleet é uma estimativa calculada pela sequência de posições GPS gravadas no dia; não substitui o hodômetro. Retorno esperado: <strong>${operation.returnExpected ? 'sim' : 'não, há pernoite/hospedagem'}</strong>.</div>
    </div>
    <details>
      <summary>Detalhes técnicos</summary>
      <div class="op-detail-grid">
        <div class="op-detail">Programação: <strong>${esc(operation.programId || '—')}</strong></div>
        <div class="op-detail">Data: <strong>${esc(brDate(operation.date))}</strong></div>
        <div class="op-detail">Coordenação: <strong>${esc(operation.coordination || '—')}</strong></div>
        <div class="op-detail">Regional: <strong>${esc(operation.regional || '—')}</strong></div>
        <div class="op-detail">Veículo: <strong>${esc(vehicleName)}</strong></div>
        <div class="op-detail">Pontos BFleet: <strong>${operation.gps.length}</strong></div>
        <div class="op-detail">Valor/km: <strong>${money(operation.rateKm)}</strong></div>
        <div class="op-detail">Status programação: <strong>${esc(operation.programStatus || '—')}</strong></div>
      </div>
    </details>
  </article>`;
}

function renderOperations() {
  const summary = document.getElementById('opSummaryHost');
  const host = document.getElementById('opCards');
  const meta = document.getElementById('opResultMeta');
  if (!summary || !host) return;
  const filtered = state.operations.filter(operationMatches);
  summary.innerHTML = summaryHtml(filtered);
  if (meta) meta.textContent = `${filtered.length} de ${state.operations.length} operações`;
  host.innerHTML = filtered.length ? filtered.map(cardHtml).join('') : '<div class="op-empty" style="grid-column:1/-1">Nenhuma operação encontrada para os filtros informados.</div>';
}

function fillSupervisions() {
  const select = document.getElementById('opSupervision');
  if (!select) return;
  const options = [...new Set(state.operations.map((row) => row.supervision).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  select.innerHTML = `<option value="">Todas as supervisões</option>${options.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join('')}`;
  select.value = state.supervision;
}

async function refresh() {
  const host = document.getElementById('opCards');
  const summary = document.getElementById('opSummaryHost');
  if (host) host.innerHTML = '<div class="op-skeleton"></div><div class="op-skeleton"></div>';
  if (summary) summary.innerHTML = '<div class="op-loading" style="grid-column:1/-1">Consolidando programação, OS, hospedagem, frota e BFleet…</div>';
  try {
    state.raw = await loadRaw(state.date);
    state.operations = buildOperations(state.raw);
    fillSupervisions();
    renderOperations();
  } catch (error) {
    console.error('[mapa-operacional] Falha:', error);
    if (summary) summary.innerHTML = '';
    if (host) host.innerHTML = `<div class="op-error" style="grid-column:1/-1">Não foi possível consolidar o Mapa Operacional: ${esc(error?.message || error)}</div>`;
  }
}

function bindControls() {
  const date = document.getElementById('opDate');
  const supervision = document.getElementById('opSupervision');
  const search = document.getElementById('opSearch');
  const refreshBtn = document.getElementById('opRefresh');
  date?.addEventListener('change', async () => {
    state.date = date.value || localIsoDate();
    state.supervision = '';
    await refresh();
  });
  supervision?.addEventListener('change', () => {
    state.supervision = supervision.value;
    renderOperations();
  });
  let searchTimer;
  search?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = search.value || '';
      renderOperations();
    }, 180);
  });
  refreshBtn?.addEventListener('click', refresh);
}

export async function renderContent(content) {
  content.innerHTML = `<div class="op-page">
    <section class="op-hero">
      <div><h2>Mapa Operacional</h2><p>Consolida programação, equipe, deslocamento, OS, hospedagem e BFleet para mostrar o que foi planejado, o que aconteceu na frota e o que ainda impede fechar a operação.</p></div>
      <a class="btn btn-secondary op-back" href="${esc(toPanelUrl('programacao'))}">← Programação</a>
    </section>
    <section class="op-filters">
      <div class="op-field"><label for="opDate">Data</label><input id="opDate" type="date" value="${esc(state.date)}" /></div>
      <div class="op-field"><label for="opSupervision">Supervisão</label><select id="opSupervision"><option value="">Todas as supervisões</option></select></div>
      <div class="op-field"><label for="opSearch">Buscar</label><input id="opSearch" type="search" placeholder="Motorista, placa, colaborador, OS, cliente…" /></div>
      <button id="opRefresh" type="button" class="btn btn-primary">Atualizar</button>
    </section>
    <div id="opSummaryHost"></div>
    <div class="op-toolbar"><h3>Operações do dia</h3><span id="opResultMeta" class="op-toolbar-meta">Carregando…</span></div>
    <section id="opCards" class="op-grid"><div class="op-skeleton"></div><div class="op-skeleton"></div></section>
  </div>`;
  bindControls();
  await refresh();
}

initProtectedPage('Mapa Operacional', renderContent);