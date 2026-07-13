import { supabase } from './supabaseClient.js';
import { logActivity } from './activityLogger.js';

const norm = value => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, ' ')
  .trim();

const state = {
  installed: false,
  recentTeamWrite: null,
  repairing: false,
};

const originalFrom = supabase.from.bind(supabase);

function oneRow(payload) {
  if (Array.isArray(payload)) return payload.length === 1 ? payload[0] : null;
  return payload && typeof payload === 'object' ? payload : null;
}

function driverNameFromObservation(observation) {
  const text = String(observation || '').trim();
  const match = /^Motorista vinculado na programa(?:ç|c)(?:ã|a)o:\s*(.+)$/i.exec(text);
  return match?.[1]?.trim() || '';
}

async function keepDriverAsLogisticsOnly({ team, ride }) {
  if (!team || !ride) return false;
  if (String(team.programacao_id) !== String(ride.programacao_id)) return false;
  if (String(team.colaborador_id) === String(ride.colaborador_id)) return false;

  const expectedName = driverNameFromObservation(ride.observacao);
  if (expectedName && norm(expectedName) !== norm(team.nome_colaborador)) return false;

  const { data: availabilityRows, error: availabilityError } = await originalFrom('programacao_colaboradores')
    .select('colaborador_id,disponibilidade')
    .eq('programacao_id', team.programacao_id)
    .eq('colaborador_id', team.colaborador_id)
    .limit(1);
  if (availabilityError) throw availabilityError;
  if (norm(availabilityRows?.[0]?.disponibilidade) !== 'LOGISTICA') return false;

  const { error: teamError } = await originalFrom('programacao_equipe')
    .delete()
    .eq('programacao_id', team.programacao_id)
    .eq('os_id', team.os_id)
    .eq('colaborador_id', team.colaborador_id);
  if (teamError) throw teamError;

  const { error: operationalError } = await originalFrom('operacional_os_colaboradores')
    .delete()
    .eq('os_id', team.os_id)
    .eq('colaborador_key', team.colaborador_id);
  if (operationalError) throw operationalError;

  const plate = String(ride.placa_veiculo || '').trim();
  if (plate) {
    const { error: displacementError } = await originalFrom('programacao_deslocamento').upsert({
      programacao_id: team.programacao_id,
      data_referencia: ride.data_referencia || new Date().toISOString().slice(0, 10),
      colaborador_id: team.colaborador_id,
      tipo_deslocamento: 'MOTORISTA FROTA',
      placa_veiculo: plate,
      observacao: `Condutor de logística para o colaborador ${ride.colaborador_id}`,
    }, { onConflict: 'programacao_id,colaborador_id' });
    if (displacementError) throw displacementError;
  }

  logActivity('action', 'corrige_vinculo_condutor_logistica', 'programacao', {
    programacao_id: team.programacao_id,
    os_id: team.os_id,
    motorista_id: team.colaborador_id,
    motorista_nome: team.nome_colaborador,
    colaborador_id: ride.colaborador_id,
    placa: plate || null,
  });

  return true;
}

function installWriteGuard() {
  if (state.installed) return;
  state.installed = true;

  const patchedFrom = function patchedFrom(table) {
    const builder = originalFrom(table);
    if (!builder || typeof builder.upsert !== 'function') return builder;

    const rawUpsert = builder.upsert.bind(builder);
    builder.upsert = function patchedUpsert(payload, options) {
      const row = oneRow(payload);

      if (table === 'programacao_equipe' && row?.programacao_id && row?.os_id && row?.colaborador_id) {
        state.recentTeamWrite = {
          ...row,
          capturedAt: Date.now(),
        };
        return rawUpsert(payload, options);
      }

      const isRideLink = table === 'programacao_deslocamento'
        && norm(row?.tipo_deslocamento) === 'CARONA FROTA'
        && row?.programacao_id
        && row?.colaborador_id;

      if (!isRideLink) return rawUpsert(payload, options);

      const result = rawUpsert(payload, options);
      return Promise.resolve(result).then(async response => {
        if (response?.error) return response;

        const team = state.recentTeamWrite;
        state.recentTeamWrite = null;
        if (!team || Date.now() - team.capturedAt > 12000) return response;

        try {
          await keepDriverAsLogisticsOnly({ team, ride: row });
        } catch (error) {
          console.warn('[programacao-logistica-vinculo-fix] correção após vínculo', error);
        }
        return response;
      });
    };

    return builder;
  };

  try {
    supabase.from = patchedFrom;
  } catch {
    Object.defineProperty(supabase, 'from', {
      configurable: true,
      writable: true,
      value: patchedFrom,
    });
  }
}

function currentSnapshot() {
  return window.__peqbGetEquipeSnapshot?.() || null;
}

function currentProgramIds(snapshot) {
  const ids = new Set();
  for (const item of snapshot?.osComCandidatosAtual || []) {
    const id = snapshot.programacaoIdParaOs?.(item.os)
      || item.programacao_id
      || item.equipeRows?.[0]?.programacao_id;
    if (id) ids.add(String(id));
  }
  return [...ids];
}

async function repairExistingLinks() {
  if (state.repairing) return;
  const snapshot = currentSnapshot();
  const programIds = currentProgramIds(snapshot);
  if (!snapshot || !programIds.length) return;

  state.repairing = true;
  try {
    const [{ data: availabilityRows, error: availabilityError }, { data: rideRows, error: rideError }] = await Promise.all([
      originalFrom('programacao_colaboradores')
        .select('programacao_id,colaborador_id,nome_colaborador,disponibilidade')
        .in('programacao_id', programIds),
      originalFrom('programacao_deslocamento')
        .select('programacao_id,data_referencia,colaborador_id,tipo_deslocamento,placa_veiculo,observacao')
        .in('programacao_id', programIds),
    ]);
    if (availabilityError) throw availabilityError;
    if (rideError) throw rideError;

    const logisticsByProgramAndName = new Map();
    for (const row of availabilityRows || []) {
      if (norm(row.disponibilidade) !== 'LOGISTICA') continue;
      logisticsByProgramAndName.set(`${row.programacao_id}|${norm(row.nome_colaborador)}`, row);
    }

    let repaired = false;
    for (const ride of rideRows || []) {
      if (norm(ride.tipo_deslocamento) !== 'CARONA FROTA') continue;
      const driverName = driverNameFromObservation(ride.observacao);
      if (!driverName) continue;

      const driver = logisticsByProgramAndName.get(`${ride.programacao_id}|${norm(driverName)}`);
      if (!driver) continue;

      const item = (snapshot.osComCandidatosAtual || []).find(entry => {
        const programId = snapshot.programacaoIdParaOs?.(entry.os)
          || entry.programacao_id
          || entry.equipeRows?.[0]?.programacao_id;
        return String(programId || '') === String(ride.programacao_id)
          && (entry.equipeRows || []).some(member => String(member.colaborador_id) === String(ride.colaborador_id));
      });
      if (!item?.os?.id) continue;

      const driverTeamRow = (item.equipeRows || []).find(member => String(member.colaborador_id) === String(driver.colaborador_id));
      if (!driverTeamRow) continue;

      repaired = await keepDriverAsLogisticsOnly({
        team: {
          programacao_id: ride.programacao_id,
          os_id: item.os.id,
          colaborador_id: driver.colaborador_id,
          nome_colaborador: driver.nome_colaborador,
        },
        ride,
      }) || repaired;
    }

    if (repaired) {
      await window.__peqbSilentRefresh?.();
      await window.__pgcRefreshDespesas?.();
      window.__pmgRenderMapaGestor?.();
    }
  } catch (error) {
    console.warn('[programacao-logistica-vinculo-fix] reparo de vínculos existentes', error);
  } finally {
    state.repairing = false;
  }
}

function scheduleRepair(delay = 300) {
  window.setTimeout(() => repairExistingLinks(), delay);
}

installWriteGuard();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => scheduleRepair(1200), { once: true });
} else {
  scheduleRepair(1200);
}

document.addEventListener('click', event => {
  if (event.target.closest('#progLoadContext')) scheduleRepair(1800);
}, true);
