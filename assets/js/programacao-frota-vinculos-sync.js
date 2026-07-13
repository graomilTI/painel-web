import { supabase } from './supabaseClient.js';

// Compatibiliza a sugestão regional com a estrutura usada pelo mapa.
// O mapa pinta O.S./colaboradores de verde e desenha as rotas a partir dos
// vínculos de frota válidos. A tabela aceita somente ATENDIMENTO ou LOGISTICA.
const RELEASE = '20260713-frota-sync2';
const state = { running: false, timer: null, rerun: false };

const text = value => String(value ?? '').trim();
const norm = value => text(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, ' ')
  .trim();
const placa = value => text(value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);

function programacaoIdParaItem(snapshot, item) {
  return snapshot?.programacaoIdParaOs?.(item?.os)
    || item?.programacao_id
    || item?.equipeRows?.[0]?.programacao_id
    || null;
}

function programacaoIds(snapshot) {
  const ids = new Set();
  if (snapshot?.programacaoId) ids.add(text(snapshot.programacaoId));
  for (const item of snapshot?.osComCandidatosAtual || []) {
    const id = programacaoIdParaItem(snapshot, item);
    if (id) ids.add(text(id));
    for (const row of item.equipeRows || []) {
      if (row.programacao_id) ids.add(text(row.programacao_id));
    }
  }
  const map = window.__progGetProgramacaoIdMap?.();
  if (map instanceof Map) {
    for (const id of map.values()) if (id) ids.add(text(id));
  }
  return [...ids].filter(Boolean);
}

function equipeIndex(snapshot) {
  const byProgramColab = new Map();
  for (const item of snapshot?.osComCandidatosAtual || []) {
    const fallbackProgramacaoId = programacaoIdParaItem(snapshot, item);
    for (const row of item.equipeRows || []) {
      if (row.confirmado === false) continue;
      const programacaoId = text(row.programacao_id || fallbackProgramacaoId);
      const colaboradorId = text(row.colaborador_id);
      if (!programacaoId || !colaboradorId || !item?.os?.id) continue;
      const key = `${programacaoId}|${colaboradorId}`;
      if (!byProgramColab.has(key)) {
        byProgramColab.set(key, {
          programacaoId,
          colaboradorId,
          nome: text(row.nome_colaborador),
          osId: text(item.os.id),
          numeroOs: text(item.os.numero_os),
        });
      }
    }
  }
  return byProgramColab;
}

function agrupamentosDeslocamento(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const programacaoId = text(row.programacao_id);
    const pl = placa(row.placa_veiculo);
    const tipo = norm(row.tipo_deslocamento);
    if (!programacaoId || !pl || (tipo !== 'MOTORISTA FROTA' && tipo !== 'CARONA FROTA')) continue;
    const key = `${programacaoId}|${pl}`;
    const group = groups.get(key) || { programacaoId, placa: pl, motoristas: [], passageiros: [] };
    if (tipo === 'MOTORISTA FROTA') group.motoristas.push(row);
    else group.passageiros.push(row);
    groups.set(key, group);
  }
  return groups;
}

function escolherMotorista(group, teamIndex) {
  return group.motoristas.find(row => teamIndex.has(`${group.programacaoId}|${text(row.colaborador_id)}`))
    || group.motoristas[0]
    || null;
}

function montarVinculos(snapshot, deslocamentos) {
  const teamIndex = equipeIndex(snapshot);
  const groups = agrupamentosDeslocamento(deslocamentos);
  const links = [];
  const seen = new Set();

  for (const group of groups.values()) {
    const motorista = escolherMotorista(group, teamIndex);
    if (!motorista) continue;

    const motoristaId = text(motorista.colaborador_id);
    const motoristaNome = text(motorista.nome_colaborador) || 'Motorista';
    const atendimentoMotorista = teamIndex.get(`${group.programacaoId}|${motoristaId}`) || null;
    const tipoAtuacao = atendimentoMotorista ? 'ATENDIMENTO' : 'LOGISTICA';
    const dataReferencia = motorista.data_referencia || snapshot?.dataReferencia || null;

    if (atendimentoMotorista) {
      const chave = `SUGREG|${group.programacaoId}|${motoristaId}|OS|${atendimentoMotorista.osId}`;
      if (!seen.has(chave)) {
        seen.add(chave);
        links.push({
          chave_vinculo: chave,
          programacao_id: group.programacaoId,
          data_referencia: dataReferencia,
          frota_colaborador_id: motoristaId,
          frota_nome: motoristaNome || atendimentoMotorista.nome,
          placa_veiculo: group.placa,
          tipo_atuacao: 'ATENDIMENTO',
          alvo_tipo: 'OS',
          os_id: atendimentoMotorista.osId,
          alvo_colaborador_id: null,
          alvo_colaborador_nome: null,
          updated_at: new Date().toISOString(),
        });
      }
    }

    for (const passageiro of group.passageiros) {
      const passageiroId = text(passageiro.colaborador_id);
      const equipe = teamIndex.get(`${group.programacaoId}|${passageiroId}`);
      if (!passageiroId || !equipe?.osId) continue;
      const chave = `SUGREG|${group.programacaoId}|${motoristaId}|COL|${passageiroId}|${equipe.osId}`;
      if (seen.has(chave)) continue;
      seen.add(chave);
      links.push({
        chave_vinculo: chave,
        programacao_id: group.programacaoId,
        data_referencia: passageiro.data_referencia || dataReferencia,
        frota_colaborador_id: motoristaId,
        frota_nome: motoristaNome,
        placa_veiculo: group.placa,
        tipo_atuacao: tipoAtuacao,
        alvo_tipo: 'COLABORADOR',
        os_id: equipe.osId,
        alvo_colaborador_id: passageiroId,
        alvo_colaborador_nome: text(passageiro.nome_colaborador) || equipe.nome,
        updated_at: new Date().toISOString(),
      });
    }
  }

  return links;
}

function atualizarMensagemSucesso() {
  document.querySelectorAll('.prg-modal.prg-message .prg-title p').forEach((element) => {
    const value = text(element.textContent);
    if (!value.includes('tabela de vínculos de frota retornou erro')) return;
    element.textContent = value.replace(
      'Os deslocamentos foram gravados, mas a tabela de vínculos de frota retornou erro.',
      'As rotas e os vínculos de frota foram atualizados no mapa.',
    );
  });
}

async function forcarAtualizacaoMapa() {
  try {
    await window.__peqbSilentRefresh?.();
  } catch (error) {
    console.warn('[programacao-frota-sync] atualização da equipe:', error);
  }

  const atualizar = () => {
    const button = document.getElementById('pmgAtualizarManual');
    if (button) button.click();
    else Promise.resolve(window.__pmgRenderMapaGestor?.()).catch(() => {});
  };

  atualizar();
  window.setTimeout(atualizar, 350);
  window.setTimeout(atualizar, 900);
}

async function sincronizarVinculos() {
  if (state.running) {
    state.rerun = true;
    return { links: 0, deslocamentos: 0 };
  }

  const snapshot = window.__peqbGetEquipeSnapshot?.();
  const ids = programacaoIds(snapshot);
  if (!snapshot || !ids.length) return { links: 0, deslocamentos: 0 };

  state.running = true;
  try {
    const { data: deslocamentos, error } = await supabase
      .from('programacao_deslocamento')
      .select('programacao_id,data_referencia,colaborador_id,nome_colaborador,tipo_deslocamento,placa_veiculo')
      .in('programacao_id', ids)
      .limit(12000);
    if (error) throw error;

    const links = montarVinculos(snapshot, deslocamentos || []);
    if (!links.length) return { links: 0, deslocamentos: (deslocamentos || []).length };

    const result = await supabase
      .from('programacao_frota_vinculos')
      .upsert(links, { onConflict: 'chave_vinculo' });
    if (result.error) throw result.error;

    atualizarMensagemSucesso();
    await forcarAtualizacaoMapa();
    console.info(`[programacao-frota-sync:${RELEASE}] ${links.length} vínculo(s) sincronizado(s).`);
    return { links: links.length, deslocamentos: (deslocamentos || []).length };
  } catch (error) {
    console.error('[programacao-frota-sync] não foi possível sincronizar vínculos:', error);
    return { links: 0, deslocamentos: 0, error };
  } finally {
    state.running = false;
    if (state.rerun) {
      state.rerun = false;
      window.setTimeout(sincronizarVinculos, 250);
    }
  }
}

function agendar(delay = 500) {
  window.clearTimeout(state.timer);
  state.timer = window.setTimeout(sincronizarVinculos, delay);
}

function boot() {
  // Corrige também sugestões já aplicadas antes desta atualização.
  window.setTimeout(() => agendar(0), 900);
  window.setTimeout(() => agendar(0), 2600);

  document.addEventListener('click', (event) => {
    if (event.target.closest('.prg-overlay [data-apply]')) {
      window.setTimeout(() => agendar(0), 700);
      window.setTimeout(() => agendar(0), 1700);
      window.setTimeout(() => agendar(0), 3200);
    }
    if (event.target.closest('#pmgAtualizarManual') || event.target.closest('#progLoadContext')) {
      window.setTimeout(() => agendar(0), 350);
    }
  }, true);

  const observer = new MutationObserver(() => {
    const success = [...document.querySelectorAll('.prg-modal.prg-message h3')]
      .find(element => norm(element.textContent) === 'SUGESTOES APLICADAS');
    if (!success || success.dataset.frotaSyncHandled === RELEASE) return;
    success.dataset.frotaSyncHandled = RELEASE;
    agendar(120);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

if (!window.__programacaoFrotaVinculosSyncInstalled) {
  window.__programacaoFrotaVinculosSyncInstalled = RELEASE;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}
