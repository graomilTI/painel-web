import { supabase } from './supabaseClient.js';
import { logActivity } from './activityLogger.js';

const RELEASE = '20260713-regional3';
const BUTTON_ID = 'pmgSugerirEquipe';
const MAX_CARONAS = 4;
const CASA_RAIO_KM = 120;
const PONTO_RAIO_KM = 220;
const FROTA_PONTO_RAIO_KM = 240;
const state = { running: false, observer: null };

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

function pointOf(row) {
  const lat = row?.lat ?? row?.latitude ?? row?.colab_lat;
  const lng = row?.lng ?? row?.longitude ?? row?.colab_lng;
  return finite(lat) && finite(lng) ? { lat: Number(lat), lng: Number(lng) } : null;
}

function pointOfItem(item) {
  const source = item?.ponto || item?.os || {};
  const lat = source?.lat ?? source?.latitude;
  const lng = source?.lng ?? source?.longitude;
  return finite(lat) && finite(lng) ? { lat: Number(lat), lng: Number(lng) } : null;
}

function kmBetween(a, b) {
  if (!a || !b) return null;
  const radius = 6371;
  const rad = value => Number(value) * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function collaboratorId(row) {
  return text(row?.colaboradorId || cpf(row?.cpf) || row?.colaborador_id || row?.id || row?.nome || row?.nome_colaborador);
}

function collaboratorName(row) {
  return text(row?.nome || row?.nome_colaborador || row?.colaborador_nome || row?.motorista_atual || row?.patrimonio_funcionario);
}

function programIdFor(snapshot, item) {
  return snapshot?.programacaoIdParaOs?.(item?.os)
    || item?.programacao_id
    || item?.equipeRows?.[0]?.programacao_id
    || null;
}

function contractRank(value) {
  const label = norm(value);
  if (label.includes('EFETIVO')) return 0;
  if (label.includes('INTERMITENTE')) return 1;
  if (label.includes('DIARISTA')) return 2;
  return 3;
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
  return mergePerson(index.byId.get(id) || index.byName.get(norm(name)) || {}, row);
}

async function loadDirectory(supervisors, seedRows) {
  const index = { byId: new Map(), byName: new Map(), all: [] };
  seedRows.forEach(row => addPerson(index, row));

  const fieldsFull = 'colaborador_id,cpf,nome,cargo,coordenacao,supervisao,tipo_contrato,latitude,longitude,endereco_base,veiculo_id,veiculo_placa';
  const fieldsSafe = 'colaborador_id,cpf,nome,coordenacao,supervisao,tipo_contrato,latitude,longitude,endereco_base,veiculo_id,veiculo_placa';

  async function queryCross(fields) {
    let query = supabase.from('colaborador_cruzamento').select(fields);
    if (supervisors.length > 1) query = query.in('supervisao', supervisors);
    else if (supervisors.length === 1) query = query.eq('supervisao', supervisors[0]);
    return query.limit(12000);
  }

  let cross = await queryCross(fieldsFull);
  if (cross.error) cross = await queryCross(fieldsSafe);
  if (cross.error) console.warn('[programacao-regional] colaborador_cruzamento', cross.error);
  (cross.data || []).forEach(row => addPerson(index, row));

  let fleetQuery = supabase
    .from('frotas_veiculos')
    .select('id,placa,placa_normalizada,motorista_atual,patrimonio_funcionario,supervisao,coordenacao,status')
    .eq('status', 'ATIVO')
    .not('motorista_atual', 'is', null);
  if (supervisors.length > 1) fleetQuery = fleetQuery.in('supervisao', supervisors);
  else if (supervisors.length === 1) fleetQuery = fleetQuery.eq('supervisao', supervisors[0]);
  const fleet = await fleetQuery.limit(5000);
  if (fleet.error) console.warn('[programacao-regional] frotas_veiculos', fleet.error);
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

  index.all = [...new Map([...index.byId.values()].map(person => [collaboratorId(person), person])).values()];
  return index;
}

function candidateDistance(person, item) {
  if (finite(person.__itemKm)) return Number(person.__itemKm);
  return kmBetween(pointOf(person), pointOfItem(item));
}

function candidateComparator(a, b) {
  const distanceA = finite(a.distance) ? Number(a.distance) : Number.POSITIVE_INFINITY;
  const distanceB = finite(b.distance) ? Number(b.distance) : Number.POSITIVE_INFINITY;
  const bandA = distanceA <= 60 ? 0 : distanceA <= 120 ? 1 : distanceA <= 250 ? 2 : 3;
  const bandB = distanceB <= 60 ? 0 : distanceB <= 120 ? 1 : distanceB <= 250 ? 2 : 3;
  if (bandA !== bandB) return bandA - bandB;
  const contractDiff = contractRank(a.person.tipoLabel || a.person.tipo_contrato)
    - contractRank(b.person.tipoLabel || b.person.tipo_contrato);
  if (contractDiff) return contractDiff;
  return distanceA - distanceB;
}

function buildTeamPlan(snapshot, items, directory) {
  const used = new Set();
  let kept = 0;
  for (const item of items) {
    const rows = (item.equipeRows || []).filter(row => row.confirmado !== false);
    if (rows.length) kept += 1;
    rows.forEach(row => used.add(collaboratorId(row)));
  }

  const targets = items
    .filter(item => !(item.equipeRows || []).some(row => row.confirmado !== false))
    .map(item => {
      const seen = new Set();
      const ranked = [];
      for (const row of [...(item.candidatos || []), ...(item.colaboradoresRegional || [])]) {
        const person = resolvePerson(directory, row);
        const id = collaboratorId(person);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        ranked.push({ person, distance: candidateDistance({ ...person, __itemKm: row.km }, item) });
      }
      ranked.sort(candidateComparator);
      return { item, ranked, viable: ranked.filter(entry => finite(entry.distance) && Number(entry.distance) <= 250).length };
    })
    .sort((a, b) => a.viable - b.viable);

  const suggestions = [];
  const missing = [];
  for (const target of targets) {
    const choice = target.ranked.find(entry => !used.has(collaboratorId(entry.person)));
    if (!choice) {
      missing.push(target.item);
      continue;
    }
    const id = collaboratorId(choice.person);
    used.add(id);
    suggestions.push({
      item: target.item,
      programacaoId: programIdFor(snapshot, target.item),
      person: choice.person,
      distance: choice.distance,
    });
  }
  return { suggestions, missing, kept };
}

function buildMembers(snapshot, items, directory, suggestions) {
  const suggestionByOs = new Map(suggestions.map(entry => [text(entry.item?.os?.id), entry]));
  const seen = new Set();
  const members = [];
  for (const item of items) {
    const programacaoId = programIdFor(snapshot, item);
    for (const row of item.equipeRows || []) {
      if (row.confirmado === false) continue;
      const person = resolvePerson(directory, row);
      const id = collaboratorId(person);
      const key = `${programacaoId}|${id}|${text(item.os?.id)}`;
      if (!id || seen.has(key)) continue;
      seen.add(key);
      members.push({
        programacaoId,
        dataReferencia: snapshot.dataReferencia || todayIso(),
        id,
        nome: collaboratorName(person),
        person,
        os: item.os,
        point: pointOfItem(item),
      });
    }
    const suggestion = suggestionByOs.get(text(item.os?.id));
    if (suggestion) {
      const id = collaboratorId(suggestion.person);
      const key = `${suggestion.programacaoId}|${id}|${text(item.os?.id)}`;
      if (id && !seen.has(key)) {
        seen.add(key);
        members.push({
          programacaoId: suggestion.programacaoId,
          dataReferencia: snapshot.dataReferencia || todayIso(),
          id,
          nome: collaboratorName(suggestion.person),
          person: suggestion.person,
          os: item.os,
          point: pointOfItem(item),
        });
      }
    }
  }
  return members;
}

async function loadExisting(programacaoIds) {
  if (!programacaoIds.length) return { links: [], displacements: [] };
  const [links, displacements] = await Promise.all([
    supabase.from('programacao_frota_vinculos')
      .select('programacao_id,frota_colaborador_id,alvo_tipo,alvo_colaborador_id,placa_veiculo,os_id')
      .in('programacao_id', programacaoIds)
      .limit(12000),
    supabase.from('programacao_deslocamento')
      .select('programacao_id,colaborador_id,tipo_deslocamento,placa_veiculo')
      .in('programacao_id', programacaoIds)
      .limit(12000),
  ]);
  if (links.error) console.warn('[programacao-regional] vínculos existentes', links.error);
  if (displacements.error) console.warn('[programacao-regional] deslocamentos existentes', displacements.error);
  return {
    links: links.error ? [] : (links.data || []),
    displacements: displacements.error ? [] : (displacements.data || []),
  };
}

function proximity(driver, passenger) {
  const driverHome = pointOf(driver.person);
  const passengerHome = pointOf(passenger.person);
  const passengerPoint = passenger.point;
  const driverPoint = driver.point;
  const homeDistance = kmBetween(driverHome, passengerHome);
  const pointDistance = kmBetween(driverPoint || driverHome, passengerPoint);
  const homeToPoint = kmBetween(driverHome, passengerPoint);

  const eligible = (finite(homeDistance) && homeDistance <= CASA_RAIO_KM)
    || (finite(pointDistance) && pointDistance <= PONTO_RAIO_KM)
    || (finite(homeToPoint) && homeToPoint <= FROTA_PONTO_RAIO_KM);
  if (!eligible) return null;

  const values = [
    finite(homeDistance) ? Number(homeDistance) : Number.POSITIVE_INFINITY,
    finite(pointDistance) ? Number(pointDistance) * 0.55 : Number.POSITIVE_INFINITY,
    finite(homeToPoint) ? Number(homeToPoint) * 0.7 : Number.POSITIVE_INFINITY,
  ];
  const score = Math.min(...values);
  const reasons = [];
  if (finite(homeDistance) && homeDistance <= CASA_RAIO_KM) reasons.push('casas próximas');
  if (finite(pointDistance) && pointDistance <= PONTO_RAIO_KM) reasons.push('O.S. próximas');
  if (!reasons.length && finite(homeToPoint) && homeToPoint <= FROTA_PONTO_RAIO_KM) reasons.push('frota próxima da O.S.');
  return { score, homeDistance, pointDistance, homeToPoint, reason: reasons.join(' + ') };
}

function passengersCompatible(a, b) {
  const homeDistance = kmBetween(pointOf(a.person), pointOf(b.person));
  const pointDistance = kmBetween(a.point, b.point);
  return (finite(homeDistance) && homeDistance <= CASA_RAIO_KM)
    || (finite(pointDistance) && pointDistance <= PONTO_RAIO_KM);
}

function buildRidePlan(members, directory, existing) {
  const existingPassengers = new Set();
  const existingCapacity = new Map();
  for (const link of existing.links) {
    if (norm(link.alvo_tipo) !== 'COLABORADOR' || !link.alvo_colaborador_id) continue;
    existingPassengers.add(`${text(link.programacao_id)}|${text(link.alvo_colaborador_id)}`);
    const key = `${text(link.programacao_id)}|${text(link.frota_colaborador_id)}`;
    existingCapacity.set(key, (existingCapacity.get(key) || 0) + 1);
  }
  for (const row of existing.displacements) {
    if (norm(row.tipo_deslocamento) === 'CARONA FROTA') {
      existingPassengers.add(`${text(row.programacao_id)}|${text(row.colaborador_id)}`);
    }
  }

  const memberById = new Map();
  for (const member of members) {
    const list = memberById.get(member.id) || [];
    list.push(member);
    memberById.set(member.id, list);
  }

  const drivers = [];
  for (const person of directory.all) {
    const driverId = collaboratorId(person);
    const vehiclePlate = plate(person.veiculoPlaca || person.veiculo_placa);
    if (!driverId || !vehiclePlate || !pointOf(person)) continue;
    const ownMember = (memberById.get(driverId) || [])[0] || null;
    drivers.push({
      id: driverId,
      nome: collaboratorName(person),
      person,
      plate: vehiclePlate,
      point: ownMember?.point || null,
      os: ownMember?.os || null,
      programacaoId: ownMember?.programacaoId || null,
      mode: ownMember ? 'ATENDIMENTO' : 'LOGISTICA',
    });
  }

  const passengers = members.filter(member => {
    if (plate(member.person.veiculoPlaca || member.person.veiculo_placa)) return false;
    return !existingPassengers.has(`${text(member.programacaoId)}|${member.id}`);
  });

  const unassigned = new Map(passengers.map(passenger => [`${text(passenger.programacaoId)}|${passenger.id}`, passenger]));
  const clusters = [];
  const usedDrivers = new Set();

  while (unassigned.size) {
    let bestCluster = null;

    for (const driver of drivers) {
      if (usedDrivers.has(driver.id)) continue;
      const candidates = [];
      for (const passenger of unassigned.values()) {
        if (driver.id === passenger.id) continue;
        const match = proximity(driver, passenger);
        if (!match) continue;
        candidates.push({ passenger, ...match });
      }
      candidates.sort((a, b) => a.score - b.score);

      const group = [];
      for (const candidate of candidates) {
        const capacityKey = `${text(candidate.passenger.programacaoId)}|${driver.id}`;
        const already = existingCapacity.get(capacityKey) || 0;
        if (group.length + already >= MAX_CARONAS) continue;
        if (group.length && !group.some(item => passengersCompatible(item.passenger, candidate.passenger))) continue;
        group.push(candidate);
        if (group.length >= MAX_CARONAS) break;
      }
      if (!group.length) continue;

      const totalScore = group.reduce((sum, item) => sum + item.score, 0);
      if (!bestCluster
        || group.length > bestCluster.group.length
        || (group.length === bestCluster.group.length && totalScore < bestCluster.totalScore)) {
        bestCluster = { driver, group, totalScore };
      }
    }

    if (!bestCluster) break;
    clusters.push(bestCluster);
    usedDrivers.add(bestCluster.driver.id);
    bestCluster.group.forEach(item => unassigned.delete(`${text(item.passenger.programacaoId)}|${item.passenger.id}`));
  }

  return { clusters, unassigned: [...unassigned.values()] };
}

function modal(teamPlan, ridePlan) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'prg-overlay';
    const teamRows = teamPlan.suggestions.map(entry => {
      const distance = finite(entry.distance) ? `${Number(entry.distance).toFixed(1).replace('.', ',')} km` : 'sem coordenada';
      return `<div class="prg-row"><strong>OS ${esc(entry.item.os?.numero_os || '-')}</strong><span>${esc(collaboratorName(entry.person))}</span><small>${esc(distance)}</small></div>`;
    }).join('');
    const rideRows = ridePlan.clusters.map(cluster => {
      const names = cluster.group.map(item => esc(item.passenger.nome)).join(', ');
      const osList = cluster.group.map(item => esc(item.passenger.os?.numero_os || '-')).join(', ');
      const reasons = [...new Set(cluster.group.map(item => item.reason).filter(Boolean))].join(' / ');
      return `<div class="prg-row prg-ride"><strong>${esc(cluster.driver.plate)}</strong><span>${esc(cluster.driver.nome)} → ${names}</span><small>${cluster.group.length} carona(s) · O.S. ${osList} · ${esc(reasons)}</small></div>`;
    }).join('');

    overlay.innerHTML = `<div class="prg-modal">
      <div class="prg-title"><div><h3>Sugestão regional de equipe e frota</h3><p>Prioriza preencher veículos com até 4 caronas considerando casas próximas, O.S. próximas ou frota próxima do ponto.</p></div><button type="button" data-close>×</button></div>
      <div class="prg-summary">
        <span><b>${teamPlan.suggestions.length}</b>O.S. preenchidas</span>
        <span><b>${ridePlan.clusters.length}</b>frotas usadas</span>
        <span><b>${ridePlan.clusters.reduce((sum, cluster) => sum + cluster.group.length, 0)}</b>caronas</span>
        <span><b>${ridePlan.unassigned.length}</b>sem carona</span>
      </div>
      <div class="prg-list">${teamRows || ''}${rideRows || '<div class="prg-empty">Nenhuma combinação nova de carona encontrada.</div>'}</div>
      <div class="prg-actions"><button type="button" class="peqb-btn" data-cancel>Cancelar</button><button type="button" class="peqb-btn prg-apply" data-apply>Aplicar sugestões</button></div>
    </div>`;
    document.body.appendChild(overlay);
    const close = value => { overlay.remove(); resolve(value); };
    overlay.addEventListener('click', event => { if (event.target === overlay) close(false); });
    overlay.querySelector('[data-close]').addEventListener('click', () => close(false));
    overlay.querySelector('[data-cancel]').addEventListener('click', () => close(false));
    overlay.querySelector('[data-apply]').addEventListener('click', () => close(true));
  });
}

async function applyTeam(snapshot, teamPlan) {
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

  if (!teamRows.length) return;
  const result = await supabase.from('programacao_equipe').upsert(teamRows, { onConflict: 'programacao_id,os_id,colaborador_id' });
  if (result.error) throw result.error;

  const availabilityRows = teamPlan.suggestions.map(entry => ({
    programacao_id: entry.programacaoId,
    colaborador_id: collaboratorId(entry.person),
    nome_colaborador: collaboratorName(entry.person),
    cargo: entry.person.cargo || null,
    coordenacao: entry.person.coordenacao || null,
    supervisao: entry.person.supervisao || entry.item.os?.supervisao || null,
    disponibilidade: 'OK',
  })).filter(row => row.programacao_id && row.colaborador_id);
  const availability = await supabase.from('programacao_colaboradores').upsert(availabilityRows, { onConflict: 'programacao_id,colaborador_id' });
  if (availability.error) throw availability.error;

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
    origem_sugestao: 'PROGRAMACAO_MAPA_SUGERIR_REGIONAL',
  }));
  const operational = await supabase.from('operacional_os_colaboradores').insert(operationalRows);
  if (operational.error) console.warn('[programacao-regional] vínculo operacional', operational.error);
}

async function applyRides(snapshot, ridePlan) {
  const links = [];
  const displacements = new Map();
  const logistics = new Map();

  for (const cluster of ridePlan.clusters) {
    const driver = cluster.driver;
    const programs = new Set(cluster.group.map(item => text(item.passenger.programacaoId)).filter(Boolean));
    if (driver.programacaoId) programs.add(text(driver.programacaoId));

    for (const programacaoId of programs) {
      displacements.set(`${programacaoId}|${driver.id}`, {
        programacao_id: programacaoId,
        data_referencia: snapshot.dataReferencia || todayIso(),
        colaborador_id: driver.id,
        nome_colaborador: driver.nome,
        tipo_deslocamento: 'MOTORISTA FROTA',
        placa_veiculo: driver.plate,
        observacao: `Frota sugerida automaticamente (${driver.mode === 'ATENDIMENTO' ? 'Atendimento + Logística' : 'Logística regional'})`,
      });
      if (driver.mode === 'LOGISTICA') {
        logistics.set(`${programacaoId}|${driver.id}`, {
          programacao_id: programacaoId,
          colaborador_id: driver.id,
          nome_colaborador: driver.nome,
          cargo: driver.person.cargo || null,
          coordenacao: driver.person.coordenacao || null,
          supervisao: driver.person.supervisao || null,
          disponibilidade: 'LOGISTICA',
        });
      }
    }

    if (driver.mode === 'ATENDIMENTO' && driver.os?.id && driver.programacaoId) {
      links.push({
        chave_vinculo: `SUGREG|${driver.programacaoId}|${driver.id}|OS|${driver.os.id}`,
        programacao_id: driver.programacaoId,
        data_referencia: snapshot.dataReferencia || todayIso(),
        frota_colaborador_id: driver.id,
        frota_nome: driver.nome,
        placa_veiculo: driver.plate,
        tipo_atuacao: 'ATENDIMENTO_LOGISTICA',
        alvo_tipo: 'OS',
        os_id: driver.os.id,
        alvo_colaborador_id: null,
        alvo_colaborador_nome: null,
        updated_at: new Date().toISOString(),
      });
    }

    for (const item of cluster.group) {
      const passenger = item.passenger;
      links.push({
        chave_vinculo: `SUGREG|${passenger.programacaoId}|${driver.id}|COL|${passenger.id}|${passenger.os.id}`,
        programacao_id: passenger.programacaoId,
        data_referencia: passenger.dataReferencia || snapshot.dataReferencia || todayIso(),
        frota_colaborador_id: driver.id,
        frota_nome: driver.nome,
        placa_veiculo: driver.plate,
        tipo_atuacao: driver.mode === 'ATENDIMENTO' ? 'ATENDIMENTO_LOGISTICA' : 'LOGISTICA',
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
        observacao: `Carona regional sugerida com ${driver.nome} (${item.reason})`,
      });
    }
  }

  if (logistics.size) {
    const result = await supabase.from('programacao_colaboradores').upsert([...logistics.values()], { onConflict: 'programacao_id,colaborador_id' });
    if (result.error) throw result.error;
  }
  let fleetLinksApplied = true;
  if (links.length) {
    const result = await supabase.from('programacao_frota_vinculos').upsert(links, { onConflict: 'chave_vinculo' });
    if (result.error) {
      fleetLinksApplied = false;
      console.warn('[programacao-regional] programacao_frota_vinculos', result.error);
    }
  }
  if (displacements.size) {
    const result = await supabase.from('programacao_deslocamento').upsert([...displacements.values()], { onConflict: 'programacao_id,colaborador_id' });
    if (result.error) throw result.error;
  }
  return { fleetLinksApplied };
}

function messageModal(title, body) {
  const overlay = document.createElement('div');
  overlay.className = 'prg-overlay';
  overlay.innerHTML = `<div class="prg-modal prg-message"><div class="prg-title"><div><h3>${esc(title)}</h3><p>${esc(body)}</p></div><button type="button" data-close>×</button></div><div class="prg-actions"><button type="button" class="peqb-btn prg-apply" data-ok>OK</button></div></div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  overlay.querySelector('[data-close]').addEventListener('click', close);
  overlay.querySelector('[data-ok]').addEventListener('click', close);
}

async function suggestRegional() {
  if (state.running) return;
  const button = document.getElementById(BUTTON_ID);
  const snapshot = window.__peqbGetEquipeSnapshot?.();
  const items = (snapshot?.osComCandidatosAtual || []).filter(item => item?.os?.id);
  if (!snapshot || !items.length) {
    messageModal('Sugerir', 'Carregue a programação e abra a Etapa 2 antes de sugerir.');
    return;
  }

  state.running = true;
  if (button) {
    button.disabled = true;
    button.textContent = 'SUGERINDO...';
  }

  try {
    const supervisors = [...new Set(items.map(item => text(item.os?.supervisao)).filter(Boolean))];
    const seedRows = items.flatMap(item => [...(item.candidatos || []), ...(item.colaboradoresRegional || []), ...(item.equipeRows || [])]);
    const directory = await loadDirectory(supervisors, seedRows);
    const teamPlan = buildTeamPlan(snapshot, items, directory);
    const members = buildMembers(snapshot, items, directory, teamPlan.suggestions);
    const programacaoIds = [...new Set(members.map(member => text(member.programacaoId)).filter(Boolean))];
    const existing = await loadExisting(programacaoIds);
    const ridePlan = buildRidePlan(members, directory, existing);

    if (!teamPlan.suggestions.length && !ridePlan.clusters.length) {
      messageModal('Sugestão concluída', 'Não há O.S. vazias nem novas combinações regionais de carona disponíveis.');
      return;
    }

    const apply = await modal(teamPlan, ridePlan);
    if (!apply) return;
    if (button) button.textContent = 'APLICANDO...';

    await applyTeam(snapshot, teamPlan);
    const result = await applyRides(snapshot, ridePlan);
    const rides = ridePlan.clusters.reduce((sum, cluster) => sum + cluster.group.length, 0);

    logActivity('action', 'sugestao_automatica_equipe_frota_regional', 'programacao', {
      os_preenchidas: teamPlan.suggestions.length,
      caronas: rides,
      frotas: ridePlan.clusters.map(cluster => ({
        colaborador_id: cluster.driver.id,
        placa: cluster.driver.plate,
        caronas: cluster.group.length,
      })),
      release: RELEASE,
    });

    await window.__peqbSilentRefresh?.();
    await window.__pgcRefreshDespesas?.();
    window.__pmgRenderMapaGestor?.({ force: true });

    const warning = result.fleetLinksApplied ? '' : ' Os deslocamentos foram gravados, mas a tabela de vínculos de frota retornou erro.';
    messageModal('Sugestões aplicadas', `${teamPlan.suggestions.length} O.S. preenchida(s), ${ridePlan.clusters.length} frota(s) utilizada(s) e ${rides} carona(s) sugerida(s).${warning}`);
  } catch (error) {
    console.error('[programacao-regional] sugestão', error);
    messageModal('Não foi possível sugerir', error?.message || 'Erro inesperado ao calcular a organização regional.');
  } finally {
    state.running = false;
    const current = document.getElementById(BUTTON_ID);
    if (current) {
      current.disabled = false;
      current.textContent = 'SUGERIR';
    }
  }
}

function injectStyles() {
  if (document.getElementById('programacaoSugestaoRegionalStyles')) return;
  const style = document.createElement('style');
  style.id = 'programacaoSugestaoRegionalStyles';
  style.textContent = `
    #${BUTTON_ID}{height:32px;box-sizing:border-box;border-color:rgba(56,189,248,.52);background:rgba(14,116,144,.2);color:#d9f3ff;letter-spacing:.04em}
    #${BUTTON_ID}:hover{background:rgba(14,116,144,.34)}
    #${BUTTON_ID}:disabled{opacity:.65;cursor:wait}
    .prg-overlay{position:fixed;inset:0;z-index:10120;background:rgba(2,6,23,.8);display:flex;align-items:center;justify-content:center;padding:18px}
    .prg-modal{width:min(900px,96vw);max-height:88vh;display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(56,189,248,.28);border-radius:18px;background:#071610;box-shadow:0 28px 80px rgba(0,0,0,.5)}
    .prg-modal.prg-message{width:min(470px,94vw)}
    .prg-title{display:flex;justify-content:space-between;gap:14px;padding:18px 20px;border-bottom:1px solid rgba(111,208,165,.14)}
    .prg-title h3{margin:0;color:#f8fafc;font-size:17px}.prg-title p{margin:5px 0 0;color:#9fb7aa;font-size:12px;line-height:1.45}
    .prg-title>button{width:32px;height:32px;border:0;border-radius:9px;background:rgba(148,163,184,.12);color:#cbd5e1;font-size:20px;cursor:pointer}
    .prg-summary{display:grid;grid-template-columns:repeat(4,minmax(110px,1fr));gap:8px;padding:12px 20px;background:rgba(15,23,42,.4)}
    .prg-summary span{padding:9px 10px;border:1px solid rgba(148,163,184,.14);border-radius:10px;color:#9fb7aa;font-size:11px}.prg-summary b{display:block;color:#e0f2fe;font-size:18px}
    .prg-list{overflow:auto;padding:12px 20px;display:flex;flex-direction:column;gap:7px}
    .prg-row{display:grid;grid-template-columns:115px minmax(190px,1fr) minmax(220px,auto);align-items:center;gap:10px;padding:10px 11px;border:1px solid rgba(56,189,248,.17);border-radius:11px;background:rgba(15,23,42,.42)}
    .prg-row strong{color:#bfdbfe;font-size:12px}.prg-row span{color:#f8fafc;font-size:12.5px;font-weight:750}.prg-row small{color:#9fb7aa;font-size:10.5px;text-align:right}
    .prg-row.prg-ride{border-color:rgba(34,197,94,.25);background:rgba(20,83,45,.15)}.prg-row.prg-ride strong{color:#86efac}
    .prg-empty{padding:18px;color:#9fb7aa;text-align:center}
    .prg-actions{display:flex;justify-content:flex-end;gap:8px;padding:14px 20px;border-top:1px solid rgba(111,208,165,.14)}
    .prg-apply{border-color:rgba(34,197,94,.48)!important;background:rgba(22,163,74,.24)!important;color:#dcfce7!important}
    @media(max-width:680px){.prg-summary{grid-template-columns:repeat(2,1fr)}.prg-row{grid-template-columns:1fr}.prg-row small{text-align:left}}
  `;
  document.head.appendChild(style);
}

function installOverride() {
  injectStyles();
  let button = document.getElementById(BUTTON_ID);
  const select = document.getElementById('pmgTipoMapa');
  if (!button && select) {
    button = document.createElement('button');
    button.type = 'button';
    button.id = BUTTON_ID;
    button.className = 'peqb-btn';
    button.textContent = 'SUGERIR';
    select.insertAdjacentElement('afterend', button);
  }
  if (!button || button.dataset.regionalOverride === RELEASE) return;

  const clone = button.cloneNode(true);
  clone.dataset.regionalOverride = RELEASE;
  clone.disabled = false;
  clone.textContent = 'SUGERIR';
  clone.title = 'Sugere equipe e agrupa caronas por casas, O.S. e frota próximas';
  button.replaceWith(clone);
  clone.addEventListener('click', suggestRegional);
}

function scheduleInstall() {
  [0, 80, 300, 800, 1600].forEach(delay => window.setTimeout(installOverride, delay));
}

if (!window.__programacaoSugestaoRegionalInstalled) {
  window.__programacaoSugestaoRegionalInstalled = true;
  state.observer = new MutationObserver(installOverride);
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
