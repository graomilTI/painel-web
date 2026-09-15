import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { toPanelUrl } from './paths.js';

const FLEET_TYPES = new Set(['MOTORISTA FROTA', 'CARONA FROTA']);
const LODGING_TYPES = new Set(['PERNOITE', 'ALOJAMENTO', 'HOTEL']);
const NO_ROUTE_TYPE = 'NÃO PRECISA';
const ROUTE_BLOCKERS = new Set([
  'SEM_DESLOCAMENTO',
  'SEM_MOTORISTA_PROGRAMADO',
  'PLACA_FORA_SUPERVISAO',
  'SEM_ENDERECO_COLABORADOR',
  'SEM_ENDERECO_EMBARQUE',
  'SEM_HOTEL',
]);
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
  const result = new Map();
  if (!programIds.length) return result;
  const solicitacoes = await selectIn(
    'hospedagem_solicitacoes',
    'id,programacao_id,cidade,uf,status_solicitacao',
    'programacao_id',
    programIds,
  ).catch(() => []);
  const solIds = solicitacoes.map((row) => row.id).filter(Boolean);
  if (!solIds.length) return result;
  const itens = await selectIn(
    'hospedagem_solicitacao_colaboradores',
    'solicitacao_id,colaborador_id,nome_colaborador,reserva_id,status_item',
    'solicitacao_id',
    solIds,
  ).catch(() => []);
  const reservaIds = [...new Set(itens.map((row) => row.reserva_id).filter(Boolean))];
  const reservas = reservaIds.length
    ? await selectIn('hospedagem_reservas', 'id,hotel_id,nome_hotel,cidade_hotel,uf_hotel,status_hospedagem', 'id', reservaIds).catch(() => [])
    : [];
  const hotelIds = [...new Set(reservas.map((row) => row.hotel_id).filter(Boolean))];
  const hoteis = hotelIds.length
    ? await selectIn('hospedagem_hoteis', 'id,nome,endereco,cidade,uf,latitude,longitude', 'id', hotelIds).catch(() => [])
    : [];
  const solById = new Map(solicitacoes.map((row) => [row.id, row]));
  const reservaById = new Map(reservas.map((row) => [row.id, row]));
  const hotelById = new Map(hoteis.map((row) => [row.id, row]));
  for (const item of itens) {
    const sol = solById.get(item.solicitacao_id);
    if (!sol?.programacao_id) continue;
    const reserva = reservaById.get(item.reserva_id);
    const hotel = reserva?.hotel_id ? hotelById.get(reserva.hotel_id) : null;
    result.set(`${sol.programacao_id}|${normalize(item.nome_colaborador)}`, {
      solicitacao: sol,
      reserva,
      hotel,
      nome: hotel?.nome || reserva?.nome_hotel || '',
      cidade: hotel?.cidade || reserva?.cidade_hotel || sol.cidade || '',
      uf: hotel?.uf || reserva?.uf_hotel || sol.uf || '',
    });
  }
  return result;
}

async function loadPositions(date, plates) {
  const clean = [...new Set(plates.map(normalizePlate).filter(Boolean))];
  if (!clean.length) return [];
  const start = `${date}T00:00:00-03:00`;
  const end = `${nextIsoDate(date)}T00:00:00-03:00`;
  return fetchPaged(() => supabase
    .from('frotas_posicoes_historico')
    .select('placa,veiculo_id,latitude,longitude,velocidade_kmh,motorista,reportado_em')
    .in('placa', clean)
    .gte('reportado_em', start)
    .lt('reportado_em', end)
    .order('reportado_em', { ascending: true }), { pageSize: 1000, maxPages: 50 });
}

async function loadRaw(date) {
  const programacoes = await fetchPaged(() => supabase
    .from('programacao_dia')
    .select('id,data_referencia,coordenacao,supervisao,regional,status,updated_at')
    .eq('data_referencia', date));
  const programIds = programacoes.map((row) => row.id).filter(Boolean);
  if (!programIds.length) {
    return {
      programacoes, programados: [], deslocamentos: [], estadias: [], equipe: [], os: [], colaboradores: [],
      veiculos: [], patrimonios: [], alojamentos: [], hotelAssignments: new Map(), positions: [],
    };
  }

  const [programados, deslocamentos, estadias, equipe, colaboradores, veiculos, patrimonios, alojamentos, hotelAssignments] = await Promise.all([
    selectIn('programacao_colaboradores', 'id,programacao_id,data_referencia,colaborador_id,nome_colaborador,cargo,coordenacao,supervisao,disponibilidade,observacao,placa_veiculo,updated_at', 'programacao_id', programIds),
    selectIn('programacao_deslocamento', 'id,programacao_id,data_referencia,colaborador_id,nome_colaborador,tipo_deslocamento,origem,destino,km,valor,observacao,placa_veiculo,updated_at', 'programacao_id', programIds),
    selectIn('programacao_estadia', 'id,programacao_id,data_referencia,colaborador_id,nome_colaborador,tem_estadia,tipo_estadia,cidade,uf,diarias,checkin,checkout,observacao,alojamento_id,alojamento_nome,updated_at', 'programacao_id', programIds),
    selectIn('programacao_equipe', 'id,programacao_id,os_id,colaborador_id,nome_colaborador,km_estimado,duracao_min,ordem_rota,confirmado,rota_geometria,rota_calculada_em,updated_at', 'programacao_id', programIds),
    fetchPaged(() => supabase.from('colaborador_cruzamento').select('colaborador_id,nome,nome_chave,supervisao,coordenacao,tipo_contrato,latitude,longitude,endereco_base,veiculo_id,veiculo_placa,salario'), { pageSize: 1000, maxPages: 4 }).catch(() => []),
    fetchPaged(() => supabase.from('frotas_veiculos').select('id,placa,placa_normalizada,nome,marca,modelo,tipo,status,valor_km,rs_km,motorista_atual,bfleet_condutor,possui_rastreador,rastreador_bfleet,bfleet_rastreador,bfleet_confirmado,bfleet_status,bfleet_device_id'), { pageSize: 1000, maxPages: 3 }).catch(() => []),
    fetchPaged(() => supabase.from('vw_patrimonios_atual').select('patrimonio_codigo,supervisao,funcionario,identificacao,categoria,marca,modelo,situacao').eq('categoria', 'VEICULOS'), { pageSize: 1000, maxPages: 3 }).catch(() => []),
    fetchPaged(() => supabase.from('hospedagem_alojamentos').select('id,nome,cidade,uf,endereco,latitude,longitude,status'), { pageSize: 1000, maxPages: 3 }).catch(() => []),
    loadHotelAssignments(programIds),
  ]);

  const osIds = [...new Set(equipe.map((row) => row.os_id).filter(Boolean))];
  const os = osIds.length
    ? await selectIn('operacional_os', 'id,numero_os,situacao,data_os,cliente,embarque,destino,supervisao,ponto1_latitude,ponto1_longitude,destino_latitude,destino_longitude,ponto1_nome,ponto_embarque_id,status_gestor', 'id', osIds)
    : [];

  const plates = [...deslocamentos.map((row) => row.placa_veiculo), ...programados.map((row) => row.placa_veiculo)].filter(Boolean);
  const positions = await loadPositions(date, plates).catch((error) => {
    console.warn('[mapa-operacional] Falha ao carregar trilha BFleet:', error);
    return [];
  });

  return { programacoes, programados, deslocamentos, estadias, equipe, os, colaboradores, veiculos, patrimonios, alojamentos, hotelAssignments, positions };
}

function haversine(a, b) {
  const lat1 = Number(a?.latitude ?? a?.lat), lon1 = Number(a?.longitude ?? a?.lon);
  const lat2 = Number(b?.latitude ?? b?.lat), lon2 = Number(b?.longitude ?? b?.lon);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return 0;
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}

function gpsDistance(rows) {
  if (!rows || rows.length < 2) return null;
  let total = 0, valid = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const distance = haversine(rows[i - 1], rows[i]);
    if (!Number.isFinite(distance) || distance < 0.02 || distance > 350) continue;
    total += distance;
    valid += 1;
  }
  return valid ? total : null;
}

function rowIdentity(row) {
  return String(row?.colaborador_id || '') || normalize(row?.nome_colaborador);
}

function buildOperations(raw) {
  const programById = new Map(raw.programacoes.map((row) => [row.id, row]));
  const osById = new Map(raw.os.map((row) => [row.id, row]));
  const programmedByKey = new Map();
  for (const row of raw.programados) programmedByKey.set(`${row.programacao_id}|${rowIdentity(row)}`, row);

  const collaboratorByName = new Map();
  for (const row of raw.colaboradores) {
    for (const value of [row.nome, row.nome_chave]) {
      const key = normalize(value);
      if (key && !collaboratorByName.has(key)) collaboratorByName.set(key, row);
    }
  }

  const vehicleByPlate = new Map();
  for (const row of raw.veiculos) {
    for (const value of [row.placa, row.placa_normalizada]) {
      const key = normalizePlate(value);
      if (key && !vehicleByPlate.has(key)) vehicleByPlate.set(key, row);
    }
  }

  const patrimonioBySupPlate = new Map();
  for (const row of raw.patrimonios) {
    const placa = normalizePlate(row.identificacao);
    const sup = normalize(row.supervisao);
    if (!placa || !sup) continue;
    patrimonioBySupPlate.set(`${sup}|${placa}`, row);
  }

  const lodgingByPerson = new Map();
  for (const row of raw.estadias) lodgingByPerson.set(`${row.programacao_id}|${rowIdentity(row)}`, row);
  const alojById = new Map(raw.alojamentos.map((row) => [row.id, row]));
  const alojByName = new Map(raw.alojamentos.map((row) => [normalize(row.nome), row]));

  const teamByProgram = new Map();
  for (const row of raw.equipe) {
    if (!teamByProgram.has(row.programacao_id)) teamByProgram.set(row.programacao_id, []);
    teamByProgram.get(row.programacao_id).push(row);
  }

  const gpsByPlate = new Map();
  for (const row of raw.positions) {
    const p = normalizePlate(row.placa);
    if (!gpsByPlate.has(p)) gpsByPlate.set(p, []);
    gpsByPlate.get(p).push(row);
  }

  const movesByProgramPerson = new Map();
  for (const move of raw.deslocamentos) movesByProgramPerson.set(`${move.programacao_id}|${rowIdentity(move)}`, move);

  const groups = new Map();
  const add = (key, move) => {
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(move);
  };

  for (const move of raw.deslocamentos) {
    const type = normalize(move.tipo_deslocamento);
    if (!type || type === NO_ROUTE_TYPE) continue;
    const plate = normalizePlate(move.placa_veiculo);
    if (plate && FLEET_TYPES.has(type)) add(`${move.programacao_id}|PLACA|${plate}`, move);
    else add(`${move.programacao_id}|${type}|${rowIdentity(move)}`, move);
  }

  for (const programmed of raw.programados) {
    const pid = programmed.programacao_id;
    const key = `${pid}|${rowIdentity(programmed)}`;
    const teamRows = (teamByProgram.get(pid) || []).filter((r) => rowIdentity(r) === rowIdentity(programmed));
    const move = movesByProgramPerson.get(key);
    const availability = normalize(programmed.disponibilidade);
    const isOperational = teamRows.length > 0 || availability === 'LOGISTICA' || availability === 'DESLOCAMENTO';
    if (!isOperational) continue;

    if (!move && availability === 'LOGISTICA' && normalizePlate(programmed.placa_veiculo)) {
      add(`${pid}|PLACA|${normalizePlate(programmed.placa_veiculo)}`, {
        programacao_id: pid,
        colaborador_id: programmed.colaborador_id,
        nome_colaborador: programmed.nome_colaborador,
        tipo_deslocamento: 'MOTORISTA FROTA',
        placa_veiculo: programmed.placa_veiculo,
        origem: '', destino: '', km: null, valor: null, observacao: 'Origem: Programação · Logística',
        __synthetic: true,
      });
      continue;
    }

    if (!move) {
      add(`${pid}|SEM_DESLOCAMENTO|${rowIdentity(programmed)}`, {
        programacao_id: pid,
        colaborador_id: programmed.colaborador_id,
        nome_colaborador: programmed.nome_colaborador,
        tipo_deslocamento: 'SEM DESLOCAMENTO REGISTRADO',
        placa_veiculo: '', origem: '', destino: '', km: null, valor: null,
        observacao: 'Colaborador consta na Programação/OS, mas não possui deslocamento registrado.',
        __synthetic: true,
      });
    }
  }

  const operations = [];
  for (const [key, moves] of groups) {
    const programId = moves[0]?.programacao_id;
    const program = programById.get(programId) || {};
    const supervision = program.supervisao || '';
    const plate = normalizePlate(moves.find((row) => normalizePlate(row.placa_veiculo))?.placa_veiculo);
    const vehicle = plate ? vehicleByPlate.get(plate) : null;
    const patrimonio = plate ? patrimonioBySupPlate.get(`${normalize(supervision)}|${plate}`) : null;
    const driverMove = moves.find((row) => normalize(row.tipo_deslocamento) === 'MOTORISTA FROTA') || null;
    const particularMove = moves.find((row) => normalize(row.tipo_deslocamento) === 'REEMBOLSO KM') || null;
    const missingMove = moves.some((row) => normalize(row.tipo_deslocamento) === 'SEM DESLOCAMENTO REGISTRADO');
    const driverName = driverMove?.nome_colaborador || particularMove?.nome_colaborador || moves[0]?.nome_colaborador || 'Não identificado';
    const participantNames = [...new Set(moves.map((row) => String(row.nome_colaborador || '').trim()).filter(Boolean))];
    const participantNorms = new Set(participantNames.map(normalize));

    const programTeam = teamByProgram.get(programId) || [];
    const team = programTeam.filter((row) => participantNorms.has(normalize(row.nome_colaborador)));
    const relatedOs = [...new Map(team.map((row) => [row.os_id, osById.get(row.os_id)]).filter(([, row]) => row)).values()];

    const collaborators = participantNames.map((name) => ({ name, base: collaboratorByName.get(normalize(name)) || null }));
    const programmedRows = participantNames.map((name) => {
      const match = raw.programados.find((row) => row.programacao_id === programId && normalize(row.nome_colaborador) === normalize(name));
      return match || null;
    }).filter(Boolean);

    const lodgings = participantNames.map((name) => {
      const prog = programmedRows.find((row) => normalize(row.nome_colaborador) === normalize(name));
      const identity = prog ? rowIdentity(prog) : normalize(name);
      const stay = lodgingByPerson.get(`${programId}|${identity}`) || raw.estadias.find((row) => row.programacao_id === programId && normalize(row.nome_colaborador) === normalize(name)) || null;
      if (!stay) return { name, stay: null, destination: null, hotelAssignment: null };
      const type = normalize(stay.tipo_estadia);
      let destination = null, hotelAssignment = null;
      if (type === 'ALOJAMENTO') destination = (stay.alojamento_id && alojById.get(stay.alojamento_id)) || alojByName.get(normalize(stay.alojamento_nome)) || null;
      if (type === 'HOTEL') {
        hotelAssignment = raw.hotelAssignments.get(`${programId}|${normalize(name)}`) || null;
        destination = hotelAssignment?.hotel || null;
      }
      return { name, stay, destination, hotelAssignment };
    });

    const hasOvernight = lodgings.some(({ stay }) => LODGING_TYPES.has(normalize(stay?.tipo_estadia)));
    const gps = plate ? (gpsByPlate.get(plate) || []) : [];
    const actualKm = plate ? gpsDistance(gps) : null;

    // A partir desta versão, o KM previsto exibido no card vem exclusivamente
    // do que foi registrado na Programação. Rota de Frota ou mapa antigo não
    // podem substituir a programação vigente.
    const moveKms = moves.map((row) => num(row.km)).filter((value) => value > 0);
    const plannedKm = moveKms.length ? Math.max(...moveKms) : null;
    const plannedSource = plannedKm !== null ? 'Programação' : 'Programação · aguardando cálculo da rota autorizada';

    const pending = [];
    if (missingMove) pending.push('SEM_DESLOCAMENTO');
    if (plate && FLEET_TYPES.has(normalize(moves[0]?.tipo_deslocamento)) && !driverMove) pending.push('SEM_MOTORISTA_PROGRAMADO');
    if (plate && (!patrimonio || normalize(patrimonio.situacao) !== 'ATIVO')) pending.push('PLACA_FORA_SUPERVISAO');
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
    const rates = moves.map((row) => num(row.valor) > 0 && num(row.km) > 0 ? num(row.valor) / num(row.km) : 0).filter((value) => value > 0);
    const explicitRate = rates.length ? Math.max(...rates) : 0;
    const vehicleRate = num(vehicle?.valor_km) || num(vehicle?.rs_km) || 0;
    const rateKm = explicitRate || vehicleRate || null;
    if (isReimbursement && !rateKm) pending.push('SEM_VALOR_KM');

    const blockers = pending.filter((code) => ROUTE_BLOCKERS.has(code));
    const secondary = pending.filter((code) => SECONDARY_PENDING.has(code));
    const noRouteNeeded = moves.every((row) => normalize(row.tipo_deslocamento) === normalize(NO_ROUTE_TYPE));
    const routeMissing = !noRouteNeeded && plannedKm === null && !plate;
    const status = blockers.length ? 'BLOQUEADO' : (secondary.length || routeMissing ? 'INCOMPLETO' : 'OK');
    const reimbursementCost = isReimbursement && rateKm && plannedKm !== null ? plannedKm * rateKm : null;

    const planPoints = [];
    for (const { name, base } of collaborators) {
      const p = point(base, 'latitude', 'longitude', { kind: 'colaborador', label: name });
      if (p) planPoints.push(p);
    }
    for (const osRow of relatedOs) {
      const p = point(osRow, 'ponto1_latitude', 'ponto1_longitude', { kind: 'embarque', label: osRow.ponto1_nome || osRow.embarque || `OS ${osRow.numero_os}` });
      if (p) planPoints.push(p);
    }
    for (const { stay, destination, hotelAssignment } of lodgings) {
      if (!stay || !LODGING_TYPES.has(normalize(stay.tipo_estadia))) continue;
      const p = point(destination, 'latitude', 'longitude', { kind: 'hospedagem', label: destination?.nome || hotelAssignment?.nome || stay.alojamento_nome || stay.cidade || stay.tipo_estadia });
      if (p) planPoints.push(p);
    }

    operations.push({
      key, programId, date: program.data_referencia, supervision,
      coordination: program.coordenacao || '', regional: program.regional || '', programStatus: program.status || '',
      plate, vehicle, patrimonio, driverName, moves, participantNames, programmedRows, collaborators, lodgings,
      relatedOs, team, hasOvernight, returnExpected: !hasOvernight, gps, actualKm, plannedKm, plannedSource,
      pending: [...new Set(pending)], status, rateKm, reimbursementCost, isReimbursement, planPoints,
    });
  }

  return operations.sort((a, b) => {
    const order = { BLOQUEADO: 0, INCOMPLETO: 1, OK: 2 };
    return (order[a.status] - order[b.status]) || a.supervision.localeCompare(b.supervision) || a.driverName.localeCompare(b.driverName);
  });
}

function routeSvg(operation) {
  const actualPoints = operation.gps.filter((row) => hasCoord(row)).map((row) => ({ lat: Number(row.latitude), lon: Number(row.longitude), kind: 'actual' }));
  const sampled = actualPoints.length > 180 ? actualPoints.filter((_, i) => i % Math.ceil(actualPoints.length / 180) === 0) : actualPoints;
  const all = [...sampled, ...operation.planPoints];
  if (all.length < 2) return '<div class="op-empty" style="padding:18px">Sem coordenadas suficientes para desenhar o trajeto.</div>';
  const lats = all.map((p) => p.lat), lons = all.map((p) => p.lon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const latSpan = Math.max(maxLat - minLat, 0.001), lonSpan = Math.max(maxLon - minLon, 0.001);
  const xy = (p) => ({ x: 12 + ((p.lon - minLon) / lonSpan) * 476, y: 138 - ((p.lat - minLat) / latSpan) * 126 });
  const actualPath = sampled.length >= 2 ? sampled.map((p, i) => `${i ? 'L' : 'M'} ${xy(p).x.toFixed(1)} ${xy(p).y.toFixed(1)}`).join(' ') : '';
  const planDots = operation.planPoints.map((p) => {
    const pos = xy(p);
    return `<circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="4.2" fill="#ffd56a" stroke="#07110d" stroke-width="2"><title>${esc(p.label || p.kind)}</title></circle>`;
  }).join('');
  return `<svg class="op-route-plot" viewBox="0 0 500 150" role="img" aria-label="Esboço geográfico do trajeto">${actualPath ? `<path d="${actualPath}" fill="none" stroke="#7ee2b8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>` : ''}${planDots}</svg><div class="op-route-legend"><span><i class="op-dot actual"></i>Trilha GPS</span><span><i class="op-dot plan"></i>Pontos da Programação</span><span>Esboço sem mapa-base</span></div>`;
}

function pendingLabel(code) {
  return ({
    SEM_DESLOCAMENTO: 'Sem deslocamento registrado na Programação',
    SEM_MOTORISTA_PROGRAMADO: 'Sem MOTORISTA FROTA na Programação',
    PLACA_FORA_SUPERVISAO: 'Placa não está Ativa nesta supervisão em Patrimônios',
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
    operation.driverName, operation.plate, operation.supervision, operation.coordination,
    ...operation.participantNames,
    ...operation.relatedOs.flatMap((row) => [row.numero_os, row.cliente, row.embarque, row.ponto1_nome]),
  ].join(' '));
  return haystack.includes(normalize(state.search));
}

function programmingCoverage() {
  const programmed = state.raw?.programados || [];
  const team = state.raw?.equipe || [];
  const moves = state.raw?.deslocamentos || [];
  const teamKeys = new Set(team.map((r) => `${r.programacao_id}|${rowIdentity(r)}`));
  const moveKeys = new Set(moves.filter((r) => normalize(r.tipo_deslocamento) && normalize(r.tipo_deslocamento) !== normalize(NO_ROUTE_TYPE)).map((r) => `${r.programacao_id}|${rowIdentity(r)}`));
  const inOs = [...new Set(teamKeys)].length;
  const noMoveInOs = [...teamKeys].filter((key) => !moveKeys.has(key)).length;
  return { total: programmed.length, inOs, noMoveInOs, moves: moveKeys.size, programs: state.raw?.programacoes?.length || 0 };
}

function summaryHtml(filtered) {
  const coverage = programmingCoverage();
  const blocked = filtered.filter((row) => row.status === 'BLOQUEADO').length;
  const incomplete = filtered.filter((row) => row.status === 'INCOMPLETO').length;
  const ok = filtered.filter((row) => row.status === 'OK').length;
  const realKm = filtered.reduce((sum, row) => sum + (row.actualKm || 0), 0);
  return `<section class="op-summary">
    <div class="op-kpi"><span>Programações</span><strong>${coverage.programs}</strong><small>${coverage.total} colaboradores na programação</small></div>
    <div class="op-kpi"><span>Em OS</span><strong>${coverage.inOs}</strong><small>colaboradores associados a ponto de embarque</small></div>
    <div class="op-kpi is-danger"><span>Sem deslocamento</span><strong>${coverage.noMoveInOs}</strong><small>em OS, mas sem transporte registrado</small></div>
    <div class="op-kpi is-danger"><span>Bloqueadas</span><strong>${blocked}</strong><small>divergem ou faltam dados da Programação</small></div>
    <div class="op-kpi is-warn"><span>Incompletas</span><strong>${incomplete}</strong><small>rastreador, custo ou rota pendente</small></div>
    <div class="op-kpi is-ok"><span>OK</span><strong>${ok}</strong><small>coerentes com a Programação</small></div>
    <div class="op-kpi"><span>KM GPS</span><strong>${realKm ? realKm.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—'}</strong><small>BFleet realizado, não altera o planejado</small></div>
  </section>`;
}

function cardHtml(operation) {
  const vehicleName = [operation.patrimonio?.marca || operation.vehicle?.marca, operation.patrimonio?.modelo || operation.vehicle?.modelo].filter(Boolean).join(' ') || operation.vehicle?.nome || 'Veículo não identificado';
  const pending = operation.pending.length
    ? operation.pending.map((code) => `<span class="op-chip ${ROUTE_BLOCKERS.has(code) ? 'danger' : 'warn'}">${esc(pendingLabel(code))}</span>`).join('')
    : '<span class="op-chip driver">Sem pendências</span>';
  const participants = operation.participantNames.map((name) => `<span class="op-chip ${normalize(name) === normalize(operation.driverName) ? 'driver' : ''}">${normalize(name) === normalize(operation.driverName) ? '● ' : ''}${esc(name)}</span>`).join('');
  const osList = operation.relatedOs.length
    ? operation.relatedOs.map((row) => `<div class="op-os"><strong>OS ${esc(row.numero_os || '—')}</strong><span title="${esc(row.embarque || row.ponto1_nome || '')}">${esc(row.ponto1_nome || row.embarque || row.cliente || 'Local não informado')}</span><em>${hasCoord(row, 'ponto1_latitude', 'ponto1_longitude') ? 'geolocalizada' : 'sem coordenada'}</em></div>`).join('')
    : '<div class="op-empty" style="padding:12px">Nenhuma OS associada a este agrupamento na Programação.</div>';
  const stayLabels = operation.lodgings.filter(({ stay }) => stay?.tipo_estadia).map(({ name, stay, destination, hotelAssignment }) => {
    const place = destination?.nome || hotelAssignment?.nome || stay.alojamento_nome || [stay.cidade, stay.uf].filter(Boolean).join('/') || '';
    return `<span class="op-chip">${esc(name)} · ${esc(stay.tipo_estadia)}${place ? ` · ${esc(place)}` : ''}</span>`;
  }).join('') || '<span class="op-chip">Sem estadia registrada</span>';
  const availability = operation.programmedRows.map((row) => `<span class="op-chip">${esc(row.nome_colaborador)} · ${esc(row.disponibilidade || 'OK')}</span>`).join('');
  const routeMissingNote = operation.plannedKm === null && operation.plate ? '<span class="op-chip warn">KM previsto será calculado pela rota autorizada da Programação</span>' : '';
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
      <div><div class="op-section-title">Programação / disponibilidade</div><div class="op-chips">${availability || '<span class="op-chip">Sem linha em programacao_colaboradores</span>'}</div></div>
      <div><div class="op-section-title">Equipe / caronas</div><div class="op-chips">${participants || '<span class="op-chip">Sem equipe</span>'}</div></div>
      <div><div class="op-section-title">OS e pontos de embarque</div><div class="op-os-list">${osList}</div></div>
      <div><div class="op-section-title">Estadia</div><div class="op-chips">${stayLabels}</div></div>
      <div><div class="op-section-title">Pendências</div><div class="op-chips">${pending}${routeMissingNote}</div></div>
      <div class="op-route-box"><div class="op-route-head"><strong>Programado × realizado</strong><span>Fonte planejada: ${esc(operation.plannedSource)}</span></div>${routeSvg(operation)}</div>
      <div class="op-note">A Programação é a fonte de verdade. O BFleet aparece apenas como realizado para auditoria e não substitui motorista, placa, carona, OS ou estadia programados. * KM BFleet é estimado pela trilha GPS.</div>
    </div>
    <details>
      <summary>Detalhes técnicos</summary>
      <div class="op-detail-grid">
        <div class="op-detail">Programação: <strong>${esc(operation.programId || '—')}</strong></div>
        <div class="op-detail">Data: <strong>${esc(brDate(operation.date))}</strong></div>
        <div class="op-detail">Coordenação: <strong>${esc(operation.coordination || '—')}</strong></div>
        <div class="op-detail">Regional: <strong>${esc(operation.regional || '—')}</strong></div>
        <div class="op-detail">Veículo: <strong>${esc(vehicleName)}</strong></div>
        <div class="op-detail">Patrimônio supervisão: <strong>${esc(operation.patrimonio?.supervisao || 'não localizado')}</strong></div>
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
  if (meta) meta.textContent = `${filtered.length} de ${state.operations.length} operações derivadas da Programação`;
  host.innerHTML = filtered.length ? filtered.map(cardHtml).join('') : '<div class="op-empty" style="grid-column:1/-1">Nenhuma operação encontrada para os filtros informados.</div>';
}

function fillSupervisions() {
  const select = document.getElementById('opSupervision');
  if (!select) return;
  const options = [...new Set((state.raw?.programacoes || []).map((row) => row.supervisao).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  select.innerHTML = `<option value="">Todas as supervisões</option>${options.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join('')}`;
  select.value = state.supervision;
}

async function refresh() {
  const host = document.getElementById('opCards');
  const summary = document.getElementById('opSummaryHost');
  if (host) host.innerHTML = '<div class="op-skeleton"></div><div class="op-skeleton"></div>';
  if (summary) summary.innerHTML = '<div class="op-loading" style="grid-column:1/-1">Lendo a Programação do dia e cruzando OS, hospedagem, Patrimônios e BFleet…</div>';
  try {
    state.raw = await loadRaw(state.date);
    state.operations = buildOperations(state.raw);
    fillSupervisions();
    renderOperations();
    window.dispatchEvent(new CustomEvent('mapa-operacional:programacao-rendered', { detail: { date: state.date, operations: state.operations.length } }));
  } catch (error) {
    console.error('[mapa-operacional-programacao] Falha:', error);
    if (summary) summary.innerHTML = '';
    if (host) host.innerHTML = `<div class="op-error" style="grid-column:1/-1">Não foi possível refletir a Programação no Mapa Operacional: ${esc(error?.message || error)}</div>`;
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
  let timer;
  search?.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.search = search.value || '';
      renderOperations();
    }, 180);
  });
  refreshBtn?.addEventListener('click', refresh);
}

export async function renderContent(content) {
  content.innerHTML = `<div class="op-page">
    <section class="op-hero">
      <div><h2>Mapa Operacional</h2><p>Espelho da Programação do dia. Motorista, placa, caronas, OS, ponto de embarque e estadia vêm da Programação; Patrimônios valida a placa e o BFleet mostra apenas o realizado.</p></div>
      <a class="btn btn-secondary op-back" href="${esc(toPanelUrl('programacao'))}">← Programação</a>
    </section>
    <section class="op-filters">
      <div class="op-field"><label for="opDate">Data</label><input id="opDate" type="date" value="${esc(state.date)}" /></div>
      <div class="op-field"><label for="opSupervision">Supervisão</label><select id="opSupervision"><option value="">Todas as supervisões</option></select></div>
      <div class="op-field"><label for="opSearch">Buscar</label><input id="opSearch" type="search" placeholder="Motorista, placa, colaborador, OS, cliente…" /></div>
      <button id="opRefresh" type="button" class="btn btn-primary">Atualizar</button>
    </section>
    <div id="opSummaryHost"></div>
    <div class="op-toolbar"><h3>Operações da Programação</h3><span id="opResultMeta" class="op-toolbar-meta">Carregando…</span></div>
    <section id="opCards" class="op-grid"><div class="op-skeleton"></div><div class="op-skeleton"></div></section>
  </div>`;
  bindControls();
  await refresh();
}

initProtectedPage('Mapa Operacional', renderContent);
