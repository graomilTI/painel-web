import { supabase } from './supabaseClient.js';
import { logActivity } from './activityLogger.js';

const state = {
  running: false,
  queued: false,
  lastKey: '',
  lastAt: 0,
};

const text = value => String(value ?? '').trim();
const plate = value => text(value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);

function snapshotContext() {
  const snapshot = window.__peqbGetEquipeSnapshot?.();
  const items = snapshot?.osComCandidatosAtual || [];
  const programacaoIds = new Set();

  for (const item of items) {
    const programacaoId = snapshot.programacaoIdParaOs?.(item.os)
      || item.programacao_id
      || item.equipeRows?.[0]?.programacao_id;
    if (programacaoId) programacaoIds.add(text(programacaoId));
  }

  return { snapshot, items, programacaoIds: [...programacaoIds] };
}

function semanticKey(row) {
  return [
    text(row.programacao_id),
    text(row.frota_colaborador_id),
    text(row.os_id),
    text(row.alvo_colaborador_id),
  ].join('|');
}

function autoKey(row, colaboradorId) {
  return `AUTO_OS|${text(row.programacao_id)}|${text(row.frota_colaborador_id)}|${text(row.os_id)}|${text(colaboradorId)}`;
}

async function reconcileNow({ force = false } = {}) {
  if (state.running) {
    state.queued = true;
    return;
  }

  const { programacaoIds } = snapshotContext();
  if (!programacaoIds.length) return;

  const key = programacaoIds.slice().sort().join(',');
  if (!force && key === state.lastKey && Date.now() - state.lastAt < 1200) return;

  state.running = true;
  state.lastKey = key;
  state.lastAt = Date.now();

  try {
    const [teamResult, linkResult] = await Promise.all([
      supabase
        .from('programacao_equipe')
        .select('programacao_id,os_id,colaborador_id,nome_colaborador,confirmado')
        .in('programacao_id', programacaoIds)
        .eq('confirmado', true),
      supabase
        .from('programacao_frota_vinculos')
        .select('id,chave_vinculo,programacao_id,data_referencia,frota_colaborador_id,frota_nome,placa_veiculo,tipo_atuacao,alvo_tipo,os_id,alvo_colaborador_id,alvo_colaborador_nome')
        .in('programacao_id', programacaoIds),
    ]);

    if (teamResult.error) throw teamResult.error;
    if (linkResult.error) throw linkResult.error;

    const teamByProgramAndOs = new Map();
    for (const member of teamResult.data || []) {
      const memberKey = `${text(member.programacao_id)}|${text(member.os_id)}`;
      const list = teamByProgramAndOs.get(memberKey) || [];
      list.push(member);
      teamByProgramAndOs.set(memberKey, list);
    }

    const links = linkResult.data || [];
    const osLinks = links.filter(row => text(row.alvo_tipo).toUpperCase() === 'OS');
    const existingSemantic = new Set(
      links
        .filter(row => text(row.alvo_tipo).toUpperCase() === 'COLABORADOR')
        .map(semanticKey),
    );

    const newLinks = [];
    const rides = [];
    const drivers = new Map();

    for (const link of osLinks) {
      const members = teamByProgramAndOs.get(`${text(link.programacao_id)}|${text(link.os_id)}`) || [];
      const driverId = text(link.frota_colaborador_id);
      const vehiclePlate = plate(link.placa_veiculo);

      if (driverId && vehiclePlate) {
        drivers.set(`${text(link.programacao_id)}|${driverId}`, {
          programacao_id: link.programacao_id,
          data_referencia: link.data_referencia || null,
          colaborador_id: driverId,
          nome_colaborador: link.frota_nome || '',
          tipo_deslocamento: 'MOTORISTA FROTA',
          placa_veiculo: vehiclePlate,
          observacao: `Frota ligada à O.S. ${text(link.os_id)}`,
        });
      }

      for (const member of members) {
        const colaboradorId = text(member.colaborador_id);
        if (!colaboradorId || colaboradorId === driverId) continue;

        const candidate = {
          programacao_id: link.programacao_id,
          data_referencia: link.data_referencia || null,
          frota_colaborador_id: link.frota_colaborador_id,
          frota_nome: link.frota_nome || null,
          placa_veiculo: vehiclePlate,
          tipo_atuacao: link.tipo_atuacao || 'LOGISTICA',
          alvo_tipo: 'COLABORADOR',
          os_id: link.os_id,
          alvo_colaborador_id: colaboradorId,
          alvo_colaborador_nome: member.nome_colaborador || null,
        };

        const candidateKey = semanticKey(candidate);
        if (!existingSemantic.has(candidateKey)) {
          existingSemantic.add(candidateKey);
          newLinks.push({
            ...candidate,
            chave_vinculo: autoKey(link, colaboradorId),
          });
        }

        if (vehiclePlate) {
          rides.push({
            programacao_id: link.programacao_id,
            data_referencia: link.data_referencia || null,
            colaborador_id: colaboradorId,
            nome_colaborador: member.nome_colaborador || '',
            tipo_deslocamento: 'CARONA FROTA',
            placa_veiculo: vehiclePlate,
            observacao: `Frota ${link.frota_nome || driverId} ligada automaticamente pela O.S.`,
          });
        }
      }
    }

    if (newLinks.length) {
      const { error } = await supabase
        .from('programacao_frota_vinculos')
        .upsert(newLinks, { onConflict: 'chave_vinculo' });
      if (error) throw error;
    }

    const displacementRows = [...drivers.values(), ...rides];
    if (displacementRows.length) {
      const dedup = new Map();
      for (const row of displacementRows) {
        dedup.set(`${text(row.programacao_id)}|${text(row.colaborador_id)}`, row);
      }
      const { error } = await supabase
        .from('programacao_deslocamento')
        .upsert([...dedup.values()], { onConflict: 'programacao_id,colaborador_id' });
      if (error) throw error;
    }

    if (newLinks.length) {
      logActivity('action', 'frota_os_vincula_colaboradores_automaticamente', 'programacao', {
        programacoes: programacaoIds,
        vinculos_criados: newLinks.length,
        os_ids: [...new Set(newLinks.map(row => row.os_id))],
        colaboradores: newLinks.map(row => row.alvo_colaborador_id),
      });
      window.__pmgRenderMapaGestor?.();
      window.__pgcRefreshDespesas?.();
    }
  } catch (error) {
    console.warn('[programacao-frota-auto-colaborador] reconciliação', error);
  } finally {
    state.running = false;
    if (state.queued) {
      state.queued = false;
      window.setTimeout(() => reconcileNow({ force: true }), 80);
    }
  }
}

function installRefreshHook() {
  const current = window.__peqbSilentRefresh;
  if (typeof current !== 'function' || current.__frotaAutoColaborador) return;

  const wrapped = async (...args) => {
    const result = await current(...args);
    await reconcileNow({ force: true });
    return result;
  };
  wrapped.__frotaAutoColaborador = true;
  wrapped.__original = current;
  window.__peqbSilentRefresh = wrapped;
}

function schedule(delay = 300, force = true) {
  window.setTimeout(() => {
    installRefreshHook();
    reconcileNow({ force });
  }, delay);
}

const hookTimer = window.setInterval(installRefreshHook, 500);
window.setTimeout(() => window.clearInterval(hookTimer), 30000);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => schedule(1400), { once: true });
} else {
  schedule(1400);
}

document.addEventListener('click', event => {
  if (event.target.closest('#progLoadContext')) schedule(1900);
  if (event.target.closest('#progSteps .stepbtn')) schedule(500, false);
}, true);

window.__programacaoFrotaReconciliarOsColaboradores = () => reconcileNow({ force: true });
