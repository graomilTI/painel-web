import { supabase } from './supabaseClient.js';
import { logActivity } from './activityLogger.js';

const RELEASE = '20260713-sugerir1';
const MAX_CARONAS = 4;
const DESVIO_CARONA_KM = 5;
const LOGISTICA_RAIO_COLETA_KM = 15;
const LOGISTICA_ROTA_MAX_KM = 140;

const state = {
  running: false,
  observer: null,
};

const text = value => String(value ?? '').trim();
const norm = value => text(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, ' ')
  .trim();
const cpf = value => text(value).replace(/\D/g, '');
const plate = value => text(value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
const finite = value => value !== null && value !== '' && Number.isFinite(Number(value));
const esc = value => text(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function hasGeo(row) {
  return finite(row?.lat ?? row?.latitude) && finite(row?.lng ?? row?.longitude);
}

function pointOf(row) {
  if (!hasGeo(row)) return null;
  return {
    lat: Number(row.lat ?? row.latitude),
    lng: Number(row.lng ?? row.longitude),
  };
}

function kmBetween(a, b) {
  if (!a || !b || !finite(a.lat) || !finite(a.lng) || !finite(b.lat) || !finite(b.lng)) return null;
  const radius = 6371;
  const rad = degrees => Number(degrees) * Math.PI / 180;
  const dLat = rad(Number(b.lat) - Number(a.lat));
  const dLng = rad(Number(b.lng) - Number(a.lng));
  const value = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.asin(Math.min(1, Math.sqrt(value)));
}

function contractRank(value) {
  const label = norm(value);
  if (label.includes('EFETIVO')) return 0;
  if (label.includes('INTERMITENTE')) return 1;
  if (label.includes('DIARISTA')) return 2;
  return 3;
}

function contractLabel(value) {
  const rank = contractRank(value);
  return rank === 0 ? 'Efetivo' : rank === 1 ? 'Intermitente' : rank === 2 ? 'Diarista' : 'Não informado';
}

function routeBand(distance) {
  if (!finite(distance)) return 4;
  const km = Number(distance);
  if (km <= 60) return 0;
  if (km <= 120) return 1;
  if (km <= 400) return 2;
  return 3;
}

function programIdFor(snapshot, item) {
  return snapshot?.programacaoIdParaOs?.(item?.os)
    || item?.programacao_id
    || item?.equipeRows?.[0]?.programacao_id
    || null;
}

function collaboratorId(row) {
  return text(row?.colaboradorId || cpf(row?.cpf) || row?.colaborador_id || row?.id || row?.nome || row?.nome_colaborador);
}

function collaboratorName(row) {
  return text(row?.nome || row?.nome_colaborador || row?.colaborador_nome || row?.motorista_atual || row?.patrimonio_funcionario);
}

function mergePerson(base = {}, extra = {}) {
  return {
    ...base,
    ...extra,
    colaboradorId: collaboratorId(extra) || collaboratorId(base),
    nome: collaboratorName(extra) || collaboratorName(base),
    tipoLabel: extra.tipoLabel || extra.tipo_contrato || base.tipoLabel || base.tipo_contrato || '',
    tipo_contrato: extra.tipo_contrato || extra.tipoLabel || base.tipo_contrato || base.tipoLabel || '',
    cargo: extra.cargo || base.cargo || null,
    coordenacao: extra.coordenacao || base.coordenacao || null,
    supervisao: extra.supervisao || base.supervisao || null,
    lat: extra.lat ?? extra.latitude ?? extra.colab_lat ?? base.lat ?? base.latitude ?? base.colab_lat ?? null,
    lng: extra.lng ?? extra.longitude ?? extra.colab_lng ?? base.lng ?? base.longitude ?? base.colab_lng ?? null,
    endereco: extra.endereco || extra.endereco_base || base.endereco || base.endereco_base || '',
    veiculoId: extra.veiculoId || extra.veiculo_id || base.veiculoId || base.veiculo_id || null,
    veiculoPlaca: extra.veiculoPlaca || extra.veiculo_placa || extra.placa_veiculo || base.veiculoPlaca || base.veiculo_placa || base.placa_veiculo || '',
  };
}

function addPerson(index, row) {
  const id = collaboratorId(row);
  const name = collaboratorName(row);
  if (!id || !name) return;
  const current = index.byId.get(id) || index.byName.get(norm(name)) || {};
  const merged = mergePerson(current, { ...row, colaboradorId: id, nome: name });
  index.byId.set(id, merged);
  index.byName.set(norm(name), merged);
}

function resolvePerson(index, row) {
  const id = collaboratorId(row);
  const name = collaboratorName(row);
  const enriched = index.byId.get(id) || index.byName.get(norm(name)) || {};
  return mergePerson(enriched, row);
}

async function loadDirectory(supervisors, seedRows) {
  const index = { byId: new Map(), byName: new Map(), all: [] };
  seedRows.forEach(row => addPerson(index, row));

  const fieldsFull = 'colaborador_id,cpf,nome,cargo,coordenacao,supervisao,tipo_contrato,latitude,longitude,endereco_base,veiculo_id,veiculo_placa';
  const fieldsSafe = 'colaborador_id,cpf,nome,coordenacao,supervisao,tipo_contrato,latitude,longitude,endereco_base,veiculo_id,veiculo_placa';

  async function queryCross(fields) {
    if (!supervisors.length) return { data: [], error: null };
    let query = supabase.from('colaborador_cruzamento').select(fields);
    query = supervisors.length > 1 ? query.in('supervisao', supervisors) : query.eq('supervisao', supervisors[0]);
    return query.limit(12000);
  }

  let cross = await queryCross(fieldsFull);
  if (cross.error) cross = await queryCross(fieldsSafe);
  if (cross.error) console.warn('[programacao-sugerir] colaborador_cruzamento', cross.error);
  (cross.data || []).forEach(row => addPerson(index, row));

  if (supervisors.length) {
    let fleetQuery = supabase
      .from('frotas_veiculos')
      .select('id,placa,placa_normalizada,motorista_atual,patrimonio_funcionario,supervisao,coordenacao,status')
      .eq('status', 'ATIVO')
      .not('motorista_atual', 'is', null);
    fleetQuery = supervisors.length > 1 ? fleetQuery.in('supervisao', supervisors) : fleetQuery.eq('supervisao', supervisors[0]);
    const fleet = await fleetQuery.limit(5000);
    if (fleet.error) console.warn('[programacao-sugerir] frotas_veiculos', fleet.error);
    for (const vehicle of fleet.data || []) {
      const name = collaboratorName(vehicle);
      const current = index.byName.get(norm(name));
      if (!current) continue;
      addPerson(index, {
        ...current,
        veiculo_id: vehicle.id,
        veiculo_placa: vehicle.placa || vehicle.placa_normalizada,
        supervisao: vehicle.supervisao || current.supervisao,
        coordenacao: vehicle.coordenacao || current.coordenacao,
      });
    }
  }

  index.all = [...new Set(index.byId.values())];
  return index;
}

function candidateDistance(candidate, item) {
  if (finite(candidate.__itemKm)) return Number(candidate.__itemKm);
  const home = pointOf(candidate);
  const target = item?.ponto && finite(item.ponto.lat) && finite(item.ponto.lng)
    ? { lat: Number(item.ponto.lat), lng: Number(item.ponto.lng) }
    : null;
  return kmBetween(home, target);
}

function candidateComparator(a, b) {
  const bandDiff = routeBand(a.distance) - routeBand(b.distance);
  if (bandDiff) return bandDiff;
  const contractDiff = contractRank(a.person.tipoLabel || a.person.tipo_contrato) - contractRank(b.person.tipoLabel || b.person.tipo_contrato);
  if (contractDiff) return contractDiff;
  const distanceA = finite(a.distance) ? Number(a.distance) : Number.POSITIVE_INFINITY;
  const distanceB = finite(b.distance) ? Number(b.distance) : Number.POSITIVE_INFINITY;
  if (distanceA !== distanceB) return distanceA - distanceB;
  return (Number(b.person.score) || 0) - (Number(a.person.score) || 0);
}

function candidatesForItem(item, directory) {
  const seen = new Set();
  const result = [];
  const source = [...(item.candidatos || []), ...(item.colaboradoresRegional || [])];
  for (const row of source) {
    const person = resolvePerson(directory, row);
    const id = collaboratorId(person);
    const nameKey = norm(collaboratorName(person));
    const key = id || nameKey;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const distance = candidateDistance({ ...person, __itemKm: row.km }, item);
    result.push({ person, distance });
  }
  return result.sort(candidateComparator);
}

function buildTeamSuggestions(snapshot, items, directory) {
  const usedIds = new Set();
  const usedNames = new Set();
  let kept = 0;

  for (const item of items) {
    const rows = (item.equipeRows || []).filter(row => row.confirmado !== false);
    if (rows.length) kept += 1;
    for (const row of rows) {
      const id = collaboratorId(row);
      if (id) usedIds.add(id);
      const name = norm(collaboratorName(row));
      if (name) usedNames.add(name);
    }
  }

  const targets = items
    .filter(item => !(item.equipeRows || []).some(row => row.confirmado !== false))
    .map(item => {
      const ranked = candidatesForItem(item, directory);
      return {
        item,
        ranked,
        viable: ranked.filter(entry => finite(entry.distance) && Number(entry.distance) <= 120).length,
      };
    })
    .sort((a, b) => a.viable - b.viable
      || (Number(b.item?.os?.remanescente) || 0) - (Number(a.item?.os?.remanescente) || 0));

  const suggestions = [];
  const missing = [];

  for (const target of targets) {
    const choice = target.ranked.find(entry => {
      const id = collaboratorId(entry.person);
      const name = norm(collaboratorName(entry.person));
      return id && name && !usedIds.has(id) && !usedNames.has(name);
    });
    if (!choice) {
      missing.push(target.item);
      continue;
    }
    const id = collaboratorId(choice.person);
    usedIds.add(id);
    usedNames.add(norm(collaboratorName(choice.person)));
    suggestions.push({
      item: target.item,
      programacaoId: programIdFor(snapshot, target.item),
      person: choice.person,
      distance: choice.distance,
    });
  }

  return { suggestions, missing, kept };
}

function memberKey(member) {
  return `${text(member.programacaoId)}|${text(member.id)}|${text(member.os?.id)}`;
}

function buildMembers(snapshot, items, directory, suggestions) {
  const result = [];
  const seen = new Set();
  const suggestionByOs = new Map(suggestions.map(entry => [text(entry.item?.os?.id), entry]));

  for (const item of items) {
    const programacaoId = programIdFor(snapshot, item);
    for (const row of item.equipeRows || []) {
      if (row.confirmado === false) continue;
      const person = resolvePerson(directory, row);
      const member = {
        programacaoId,
        dataReferencia: snapshot.dataReferencia || todayIso(),
        id: collaboratorId(person),
        nome: collaboratorName(person),
        person,
        os: item.os,
        point: item.ponto,
        existing: true,
      };
      const key = memberKey(member);
      if (member.id && !seen.has(key)) {
        seen.add(key);
        result.push(member);
      }
    }

    const suggestion = suggestionByOs.get(text(item.os?.id));
    if (suggestion) {
      const member = {
        programacaoId: suggestion.programacaoId,
        dataReferencia: snapshot.dataReferencia || todayIso(),
        id: collaboratorId(suggestion.person),
        nome: collaboratorName(suggestion.person),
        person: suggestion.person,
        os: item.os,
        point: item.ponto,
        existing: false,
      };
      const key = memberKey(member);
      if (member.id && !seen.has(key)) {
        seen.add(key);
        result.push(member);
      }
    }
  }
  return result;
}

function greedyRoute(driver, passengers) {
  const origin = pointOf(driver.person);
  if (!origin) return { total: Number.POSITIVE_INFINITY, order: [] };
  const stops = [];
  for (const passenger of passengers) {
    const pickup = pointOf(passenger.person);
    const dropoff = passenger.point && finite(passenger.point.lat) && finite(passenger.point.lng)
      ? { lat: Number(passenger.point.lat), lng: Number(passenger.point.lng) }
      : null;
    if (!pickup || !dropoff) return { total: Number.POSITIVE_INFINITY, order: [] };
    stops.push({ type: 'pickup', passenger, coord: pickup });
    stops.push({ type: 'dropoff', passenger, coord: dropoff });
  }

  const final = driver.mode === 'ATENDIMENTO' && driver.point && finite(driver.point.lat) && finite(driver.point.lng)
    ? { lat: Number(driver.point.lat), lng: Number(driver.point.lng) }
    : null;
  const picked = new Set();
  const order = [];
  let current = origin;
  let total = 0;
  const pending = stops.slice();

  while (pending.length) {
    const available = pending.filter(stop => stop.type !== 'dropoff' || picked.has(stop.passenger.id));
    if (!available.length) return { total: Number.POSITIVE_INFINITY, order: [] };
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const stop of available) {
      const distance = kmBetween(current, stop.coord);
      if (finite(distance) && Number(distance) < bestDistance) {
        best = stop;
        bestDistance = Number(distance);
      }
    }
    if (!best) return { total: Number.POSITIVE_INFINITY, order: [] };
    total += bestDistance;
    current = best.coord;
    order.push(best);
    pending.splice(pending.indexOf(best), 1);
    if (best.type === 'pickup') picked.add(best.passenger.id);
  }

  if (final) {
    const distance = kmBetween(current, final);
    if (!finite(distance)) return { total: Number.POSITIVE_INFINITY, order: [] };
    total += Number(distance);
    order.push({ type: 'atendimento', coord: final, os: driver.os });
  }
  return { total, order };
}

async function loadExistingTransport(programacaoIds) {
  if (!programacaoIds.length) return { links: [], displacement: [] };
  const [linksResult, displacementResult] = await Promise.all([
    supabase
      .from('programacao_frota_vinculos')
      .select('programacao_id,frota_colaborador_id,frota_nome,placa_veiculo,tipo_atuacao,alvo_tipo,os_id,alvo_colaborador_id')
      .in('programacao_id', programacaoIds),
    supabase
      .from('programacao_deslocamento')
      .select('programacao_id,colaborador_id,tipo_deslocamento,placa_veiculo')
      .in('programacao_id', programacaoIds),
  ]);

  if (linksResult.error) console.warn('[programacao-sugerir] vínculos existentes', linksResult.error);
  if (displacementResult.error) console.warn('[programacao-sugerir] deslocamentos existentes', displacementResult.error);
  return {
    links: linksResult.data || [],
    displacement: displacementResult.data || [],
  };
}

function buildTransportPlan(members, directory, existingTransport) {
  const existingPassenger = new Set();
  const existingDriverLinks = new Map();
  for (const link of existingTransport.links || []) {
    const pid = text(link.programacao_id);
    const driverId = text(link.frota_colaborador_id);
    if (norm(link.alvo_tipo) === 'COLABORADOR' && link.alvo_colaborador_id) {
      existingPassenger.add(`${pid}|${text(link.alvo_colaborador_id)}`);
    }
    if (driverId) {
      const key = `${pid}|${driverId}`;
      const list = existingDriverLinks.get(key) || [];
      list.push(link);
      existingDriverLinks.set(key, list);
    }
  }
  for (const row of existingTransport.displacement || []) {
    if (norm(row.tipo_deslocamento) === 'CARONA FROTA') {
      existingPassenger.add(`${text(row.programacao_id)}|${text(row.colaborador_id)}`);
    }
  }

  const memberIds = new Set(members.map(member => `${text(member.programacaoId)}|${member.id}`));
  const drivers = [];
  const driverMap = new Map();

  for (const member of members) {
    const vehiclePlate = plate(member.person.veiculoPlaca || member.person.veiculo_placa);
    if (!vehiclePlate || !pointOf(member.person)) continue;
    const key = `${text(member.programacaoId)}|${member.id}`;
    const driver = {
      key,
      programacaoId: member.programacaoId,
      dataReferencia: member.dataReferencia,
      id: member.id,
      nome: member.nome,
      person: member.person,
      plate: vehiclePlate,
      mode: 'ATENDIMENTO',
      os: member.os,
      point: member.point,
      passengers: [],
      existingLinks: existingDriverLinks.get(key) || [],
    };
    drivers.push(driver);
    driverMap.set(key, driver);
  }

  // Mantém caronas manuais na conta da capacidade e da rota antes de sugerir novas.
  for (const link of existingTransport.links || []) {
    if (norm(link.alvo_tipo) !== 'COLABORADOR' || !link.alvo_colaborador_id) continue;
    const driver = driverMap.get(`${text(link.programacao_id)}|${text(link.frota_colaborador_id)}`);
    const passenger = members.find(member => text(member.programacaoId) === text(link.programacao_id)
      && member.id === text(link.alvo_colaborador_id));
    if (driver && passenger && !driver.passengers.some(item => item.id === passenger.id)) driver.passengers.push(passenger);
  }

  const logisticsCandidates = directory.all.filter(person => {
    const vehiclePlate = plate(person.veiculoPlaca || person.veiculo_placa);
    return vehiclePlate && pointOf(person);
  });

  const passengers = members
    .filter(member => {
      if (plate(member.person.veiculoPlaca || member.person.veiculo_placa)) return false;
      return !existingPassenger.has(`${text(member.programacaoId)}|${member.id}`);
    })
    .map(member => {
      const feasibleAttending = drivers.filter(driver => {
        if (text(driver.programacaoId) !== text(member.programacaoId) || driver.passengers.length >= MAX_CARONAS) return false;
        const before = greedyRoute(driver, driver.passengers).total;
        const after = greedyRoute(driver, [...driver.passengers, member]).total;
        return finite(before) && finite(after) && Number(after) - Number(before) <= DESVIO_CARONA_KM;
      }).length;
      return { member, feasibleAttending };
    })
    .sort((a, b) => a.feasibleAttending - b.feasibleAttending
      || (kmBetween(pointOf(b.member.person), b.member.point) || 0) - (kmBetween(pointOf(a.member.person), a.member.point) || 0));

  const assignments = [];

  for (const passengerEntry of passengers) {
    const passenger = passengerEntry.member;
    let best = null;

    for (const driver of drivers) {
      if (text(driver.programacaoId) !== text(passenger.programacaoId) || driver.id === passenger.id || driver.passengers.length >= MAX_CARONAS) continue;
      const before = greedyRoute(driver, driver.passengers).total;
      const after = greedyRoute(driver, [...driver.passengers, passenger]).total;
      if (!finite(before) || !finite(after)) continue;
      const incremental = Number(after) - Number(before);
      if (incremental > DESVIO_CARONA_KM) continue;
      const score = incremental + (driver.mode === 'ATENDIMENTO' ? 0 : 8);
      if (!best || score < best.score) best = { driver, score, incremental };
    }

    if (!best) {
      // Frota dedicada de logística: somente quando o condutor está perto da casa
      // e o roteiro completo continua curto o bastante para fazer sentido.
      for (const person of logisticsCandidates) {
        const driverId = collaboratorId(person);
        if (!driverId || memberIds.has(`${text(passenger.programacaoId)}|${driverId}`)) continue;
        const home = pointOf(person);
        const passengerHome = pointOf(passenger.person);
        const pickupDistance = kmBetween(home, passengerHome);
        if (!finite(pickupDistance) || Number(pickupDistance) > LOGISTICA_RAIO_COLETA_KM) continue;

        const key = `${text(passenger.programacaoId)}|${driverId}`;
        let driver = driverMap.get(key);
        if (!driver) {
          driver = {
            key,
            programacaoId: passenger.programacaoId,
            dataReferencia: passenger.dataReferencia,
            id: driverId,
            nome: collaboratorName(person),
            person,
            plate: plate(person.veiculoPlaca || person.veiculo_placa),
            mode: 'LOGISTICA',
            os: null,
            point: null,
            passengers: [],
            existingLinks: [],
          };
        }
        if (driver.passengers.length >= MAX_CARONAS) continue;
        const before = driver.passengers.length ? greedyRoute(driver, driver.passengers).total : 0;
        const after = greedyRoute(driver, [...driver.passengers, passenger]).total;
        if (!finite(after) || Number(after) > LOGISTICA_ROTA_MAX_KM) continue;
        const incremental = Number(after) - Number(before);
        const score = incremental + 20;
        if (!best || score < best.score) best = { driver, score, incremental, newLogistics: !driverMap.has(key) };
      }
    }

    if (!best) continue;
    if (best.newLogistics) {
      drivers.push(best.driver);
      driverMap.set(best.driver.key, best.driver);
    }
    best.driver.passengers.push(passenger);
    assignments.push({ driver: best.driver, passenger, incremental: best.incremental });
  }

  return {
    drivers: drivers.filter(driver => driver.mode === 'ATENDIMENTO' || driver.passengers.length),
    assignments,
  };
}

function previewModal(teamPlan, transportPlan) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'psg-overlay';
    const teamRows = teamPlan.suggestions.map(entry => {
      const distance = finite(entry.distance) ? `${Number(entry.distance).toFixed(1).replace('.', ',')} km` : 'sem coordenada';
      return `<div class="psg-row"><strong>OS ${esc(entry.item.os?.numero_os || '-')}</strong><span>${esc(collaboratorName(entry.person))}</span><small>${esc(contractLabel(entry.person.tipoLabel || entry.person.tipo_contrato))} · ${distance}</small></div>`;
    }).join('');
    const rideRows = transportPlan.assignments.map(entry => `<div class="psg-row psg-ride"><strong>${esc(entry.driver.plate)}</strong><span>${esc(entry.driver.nome)} → ${esc(entry.passenger.nome)}</span><small>Carona · OS ${esc(entry.passenger.os?.numero_os || '-')} · desvio +${Number(entry.incremental || 0).toFixed(1).replace('.', ',')} km</small></div>`).join('');

    overlay.innerHTML = `<div class="psg-modal">
      <div class="psg-title"><div><h3>Sugestão de equipe e frota</h3><p>Rota viável primeiro; dentro da mesma faixa: Efetivo → Intermitente → Diarista.</p></div><button type="button" data-close aria-label="Fechar">×</button></div>
      <div class="psg-summary"><span><b>${teamPlan.suggestions.length}</b> O.S. preenchidas</span><span><b>${teamPlan.kept}</b> mantidas</span><span><b>${transportPlan.assignments.length}</b> caronas</span><span><b>${teamPlan.missing.length}</b> sem candidato</span></div>
      <div class="psg-list">${teamRows || '<div class="psg-empty">Nenhuma O.S. vazia para preencher.</div>'}${rideRows}</div>
      <div class="psg-actions"><button type="button" class="peqb-btn" data-cancel>Cancelar</button><button type="button" class="peqb-btn psg-apply" data-apply>Aplicar sugestões</button></div>
    </div>`;
    document.body.appendChild(overlay);
    const close = value => { overlay.remove(); resolve(value); };
    overlay.addEventListener('click', event => { if (event.target === overlay) close(false); });
    overlay.querySelector('[data-close]').addEventListener('click', () => close(false));
    overlay.querySelector('[data-cancel]').addEventListener('click', () => close(false));
    overlay.querySelector('[data-apply]').addEventListener('click', () => close(true));
  });
}

async function applySuggestions(snapshot, teamPlan, transportPlan) {
  const teamRows = teamPlan.suggestions.map(entry => ({
    programacao_id: entry.programacaoId,
    os_id: entry.item.os.id,
    colaborador_id: collaboratorId(entry.person),
    nome_colaborador: collaboratorName(entry.person),
    score: Number(entry.person.score) || 0,
    score_contrato: Number(entry.person.scoreContrato || entry.person.score_contrato) || 0,
    score_distancia: Number(entry.person.scoreDistancia || entry.person.score_distancia) || 0,
    score_auditoria: Number(entry.person.scoreAuditoria || entry.person.score_auditoria) || 0,
    km_estimado: finite(entry.distance) ? Number(entry.distance) : null,
    confirmado: true,
  })).filter(row => row.programacao_id && row.os_id && row.colaborador_id);

  if (teamRows.length) {
    const teamResult = await supabase.from('programacao_equipe').upsert(teamRows, { onConflict: 'programacao_id,os_id,colaborador_id' });
    if (teamResult.error) throw teamResult.error;

    const availabilityRows = teamPlan.suggestions.map(entry => ({
      programacao_id: entry.programacaoId,
      colaborador_id: collaboratorId(entry.person),
      nome_colaborador: collaboratorName(entry.person),
      cargo: entry.person.cargo || null,
      coordenacao: entry.person.coordenacao || null,
      supervisao: entry.person.supervisao || entry.item.os?.supervisao || null,
      disponibilidade: 'OK',
    })).filter(row => row.programacao_id && row.colaborador_id);
    const availabilityResult = await supabase.from('programacao_colaboradores').upsert(availabilityRows, { onConflict: 'programacao_id,colaborador_id' });
    if (availabilityResult.error) throw availabilityResult.error;

    for (const entry of teamPlan.suggestions) {
      const id = collaboratorId(entry.person);
      await supabase.from('operacional_os_colaboradores').delete().eq('os_id', entry.item.os.id).eq('colaborador_key', id);
    }
    const operationalRows = teamPlan.suggestions.map(entry => ({
      os_id: entry.item.os.id,
      colaborador_key: collaboratorId(entry.person),
      colaborador_nome: collaboratorName(entry.person),
      colaborador_cpf: /^\d+$/.test(collaboratorId(entry.person)) ? collaboratorId(entry.person) : null,
      distancia_km: finite(entry.distance) ? Number(entry.distance) : null,
      origem_sugestao: 'PROGRAMACAO_MAPA_SUGERIR',
    }));
    const operationalResult = await supabase.from('operacional_os_colaboradores').insert(operationalRows);
    if (operationalResult.error) console.warn('[programacao-sugerir] vínculo operacional', operationalResult.error);
  }

  const links = [];
  const displacements = new Map();
  const logisticsAvailability = new Map();

  for (const driver of transportPlan.drivers) {
    if (!driver.plate || !driver.programacaoId) continue;
    displacements.set(`${driver.programacaoId}|${driver.id}`, {
      programacao_id: driver.programacaoId,
      data_referencia: driver.dataReferencia || snapshot.dataReferencia || todayIso(),
      colaborador_id: driver.id,
      nome_colaborador: driver.nome,
      tipo_deslocamento: 'MOTORISTA FROTA',
      placa_veiculo: driver.plate,
      observacao: `Frota sugerida automaticamente (${driver.mode === 'ATENDIMENTO' ? 'Atendimento' : 'Logística'})`,
    });

    if (driver.mode === 'ATENDIMENTO' && driver.os?.id) {
      links.push({
        chave_vinculo: `SUG|${driver.programacaoId}|${driver.id}|OS|${driver.os.id}`,
        programacao_id: driver.programacaoId,
        data_referencia: driver.dataReferencia || snapshot.dataReferencia || todayIso(),
        frota_colaborador_id: driver.id,
        frota_nome: driver.nome,
        placa_veiculo: driver.plate,
        tipo_atuacao: 'ATENDIMENTO',
        alvo_tipo: 'OS',
        os_id: driver.os.id,
        alvo_colaborador_id: null,
        alvo_colaborador_nome: null,
        updated_at: new Date().toISOString(),
      });
    } else if (driver.mode === 'LOGISTICA') {
      logisticsAvailability.set(`${driver.programacaoId}|${driver.id}`, {
        programacao_id: driver.programacaoId,
        colaborador_id: driver.id,
        nome_colaborador: driver.nome,
        cargo: driver.person.cargo || null,
        coordenacao: driver.person.coordenacao || null,
        supervisao: driver.person.supervisao || null,
        disponibilidade: 'LOGISTICA',
      });
    }
  }

  for (const assignment of transportPlan.assignments) {
    const { driver, passenger } = assignment;
    links.push({
      chave_vinculo: `SUG|${driver.programacaoId}|${driver.id}|COL|${passenger.id}|${passenger.os.id}`,
      programacao_id: driver.programacaoId,
      data_referencia: driver.dataReferencia || snapshot.dataReferencia || todayIso(),
      frota_colaborador_id: driver.id,
      frota_nome: driver.nome,
      placa_veiculo: driver.plate,
      tipo_atuacao: driver.mode,
      alvo_tipo: 'COLABORADOR',
      os_id: passenger.os.id,
      alvo_colaborador_id: passenger.id,
      alvo_colaborador_nome: passenger.nome,
      updated_at: new Date().toISOString(),
    });
    displacements.set(`${passenger.programacaoId}|${passenger.id}`, {
      programacao_id: passenger.programacaoId,
      data_referencia: passenger.dataReferencia || snapshot.dataReferencia || todayIso(),
      colaborador_id: passenger.id,
      nome_colaborador: passenger.nome,
      tipo_deslocamento: 'CARONA FROTA',
      placa_veiculo: driver.plate,
      observacao: `Carona sugerida com ${driver.nome}`,
    });
  }

  if (logisticsAvailability.size) {
    const result = await supabase.from('programacao_colaboradores').upsert([...logisticsAvailability.values()], { onConflict: 'programacao_id,colaborador_id' });
    if (result.error) throw result.error;
  }

  let fleetLinksApplied = false;
  if (links.length) {
    const result = await supabase.from('programacao_frota_vinculos').upsert(links, { onConflict: 'chave_vinculo' });
    if (result.error) {
      console.warn('[programacao-sugerir] programacao_frota_vinculos', result.error);
    } else {
      fleetLinksApplied = true;
    }
  }

  if (displacements.size) {
    const result = await supabase.from('programacao_deslocamento').upsert([...displacements.values()], { onConflict: 'programacao_id,colaborador_id' });
    if (result.error) throw result.error;
  }

  logActivity('action', 'sugestao_automatica_equipe_frota', 'programacao', {
    os_preenchidas: teamRows.length,
    colaboradores: teamRows.map(row => row.colaborador_id),
    caronas: transportPlan.assignments.length,
    frotas: transportPlan.drivers.map(driver => ({ colaborador_id: driver.id, placa: driver.plate, modo: driver.mode })),
    vinculos_frota_aplicados: fleetLinksApplied,
    release: RELEASE,
  });

  await window.__peqbSilentRefresh?.();
  await window.__programacaoFrotaReconciliarOsColaboradores?.();
  await window.__pgcRefreshDespesas?.();
  window.__pmgRenderMapaGestor?.();
  return { fleetLinksApplied };
}

function messageModal(title, body) {
  const overlay = document.createElement('div');
  overlay.className = 'psg-overlay';
  overlay.innerHTML = `<div class="psg-modal psg-message"><div class="psg-title"><div><h3>${esc(title)}</h3><p>${esc(body)}</p></div><button type="button" data-close>×</button></div><div class="psg-actions"><button type="button" class="peqb-btn psg-apply" data-ok>OK</button></div></div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  overlay.querySelector('[data-close]').addEventListener('click', close);
  overlay.querySelector('[data-ok]').addEventListener('click', close);
}

async function suggest() {
  if (state.running) return;
  const button = document.getElementById('pmgSugerirEquipe');
  const snapshot = window.__peqbGetEquipeSnapshot?.();
  const items = (snapshot?.osComCandidatosAtual || []).filter(item => item?.os?.id);
  if (!snapshot || !items.length) {
    messageModal('Sugerir', 'Carregue a programação e abra a Etapa 2 antes de sugerir.');
    return;
  }

  state.running = true;
  if (button) {
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    button.textContent = 'SUGERINDO...';
  }

  try {
    const supervisors = [...new Set(items.map(item => text(item.os?.supervisao)).filter(Boolean))];
    const seedRows = items.flatMap(item => [...(item.candidatos || []), ...(item.colaboradoresRegional || []), ...(item.equipeRows || [])]);
    const directory = await loadDirectory(supervisors, seedRows);
    const teamPlan = buildTeamSuggestions(snapshot, items, directory);
    const members = buildMembers(snapshot, items, directory, teamPlan.suggestions);
    const programacaoIds = [...new Set(members.map(member => text(member.programacaoId)).filter(Boolean))];
    const existingTransport = await loadExistingTransport(programacaoIds);
    const transportPlan = buildTransportPlan(members, directory, existingTransport);

    if (!teamPlan.suggestions.length && !transportPlan.assignments.length) {
      messageModal('Sugestão concluída', 'Todas as O.S. já possuem equipe ou não há combinação nova de frota/carona dentro da rota viável.');
      return;
    }

    const apply = await previewModal(teamPlan, transportPlan);
    if (!apply) return;
    if (button) button.textContent = 'APLICANDO...';
    const result = await applySuggestions(snapshot, teamPlan, transportPlan);
    const warning = result.fleetLinksApplied || !transportPlan.assignments.length
      ? ''
      : ' A equipe foi aplicada, mas os vínculos de frota precisam da migration programacao_frota_vinculos no Supabase.';
    messageModal('Sugestões aplicadas', `${teamPlan.suggestions.length} O.S. preenchida(s) e ${transportPlan.assignments.length} carona(s) sugerida(s).${warning}`);
  } catch (error) {
    console.error('[programacao-sugerir] sugestão', error);
    messageModal('Não foi possível sugerir', error?.message || 'Erro inesperado ao calcular a equipe.');
  } finally {
    state.running = false;
    if (button) {
      button.disabled = false;
      button.textContent = button.dataset.originalText || 'SUGERIR';
    }
  }
}

function injectStyles() {
  if (document.getElementById('programacaoSugerirStyles')) return;
  const style = document.createElement('style');
  style.id = 'programacaoSugerirStyles';
  style.textContent = `
    #pmgSugerirEquipe{height:32px;box-sizing:border-box;border-color:rgba(56,189,248,.52);background:rgba(14,116,144,.2);color:#d9f3ff;letter-spacing:.04em}
    #pmgSugerirEquipe:hover{background:rgba(14,116,144,.34)}
    #pmgSugerirEquipe:disabled{opacity:.65;cursor:wait}
    .psg-overlay{position:fixed;inset:0;z-index:10080;background:rgba(2,6,23,.78);display:flex;align-items:center;justify-content:center;padding:18px}
    .psg-modal{width:min(760px,96vw);max-height:88vh;display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(56,189,248,.28);border-radius:18px;background:#071610;box-shadow:0 28px 80px rgba(0,0,0,.48)}
    .psg-modal.psg-message{width:min(460px,94vw)}
    .psg-title{display:flex;justify-content:space-between;gap:14px;padding:18px 20px;border-bottom:1px solid rgba(111,208,165,.14)}
    .psg-title h3{margin:0;color:#f8fafc;font-size:17px}.psg-title p{margin:5px 0 0;color:#9fb7aa;font-size:12px;line-height:1.45}
    .psg-title>button{width:32px;height:32px;border:0;border-radius:9px;background:rgba(148,163,184,.12);color:#cbd5e1;font-size:20px;cursor:pointer}
    .psg-summary{display:grid;grid-template-columns:repeat(4,minmax(110px,1fr));gap:8px;padding:12px 20px;background:rgba(15,23,42,.4)}
    .psg-summary span{padding:9px 10px;border:1px solid rgba(148,163,184,.14);border-radius:10px;color:#9fb7aa;font-size:11px}.psg-summary b{display:block;color:#e0f2fe;font-size:18px}
    .psg-list{overflow:auto;padding:12px 20px;display:flex;flex-direction:column;gap:7px}
    .psg-row{display:grid;grid-template-columns:110px minmax(170px,1fr) minmax(170px,auto);align-items:center;gap:10px;padding:9px 11px;border:1px solid rgba(56,189,248,.17);border-radius:11px;background:rgba(15,23,42,.42)}
    .psg-row strong{color:#bfdbfe;font-size:12px}.psg-row span{color:#f8fafc;font-size:12.5px;font-weight:750}.psg-row small{color:#9fb7aa;font-size:10.5px;text-align:right}
    .psg-row.psg-ride{border-color:rgba(34,197,94,.22);background:rgba(20,83,45,.14)}.psg-row.psg-ride strong{color:#86efac}
    .psg-empty{padding:18px;color:#9fb7aa;text-align:center}
    .psg-actions{display:flex;justify-content:flex-end;gap:8px;padding:14px 20px;border-top:1px solid rgba(111,208,165,.14)}
    .psg-apply{border-color:rgba(34,197,94,.48)!important;background:rgba(22,163,74,.24)!important;color:#dcfce7!important}
    @media(max-width:680px){.psg-summary{grid-template-columns:repeat(2,1fr)}.psg-row{grid-template-columns:1fr}.psg-row small{text-align:left}}
  `;
  document.head.appendChild(style);
}

function installButton() {
  injectStyles();
  const select = document.getElementById('pmgTipoMapa');
  if (!select || document.getElementById('pmgSugerirEquipe')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'peqb-btn';
  button.id = 'pmgSugerirEquipe';
  button.textContent = 'SUGERIR';
  button.title = 'Sugere colaboradores por rota e contrato e monta frota/carona viável';
  select.insertAdjacentElement('afterend', button);
  button.addEventListener('click', suggest);
}

function scheduleInstall() {
  window.setTimeout(installButton, 80);
  window.setTimeout(installButton, 500);
  window.setTimeout(installButton, 1400);
}

if (!window.__programacaoSugerirEquipeInstalled) {
  window.__programacaoSugerirEquipeInstalled = true;
  state.observer = new MutationObserver(installButton);
  state.observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleInstall, { once: true });
  } else {
    scheduleInstall();
  }
  document.addEventListener('click', event => {
    if (event.target.closest('#progLoadContext') || event.target.closest('#progSteps .stepbtn')) scheduleInstall();
  }, true);
}
