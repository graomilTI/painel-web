import { supabase } from './supabaseClient.js';
import { logActivity } from './activityLogger.js';

const RELEASE = '20260713-limpar1';
const BUTTON_ID = 'pmgLimparConciliacoes';

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
const esc = value => text(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function unique(values) {
  return [...new Set((values || []).map(text).filter(Boolean))];
}

function snapshotContext() {
  const snapshot = window.__peqbGetEquipeSnapshot?.();
  const items = (snapshot?.osComCandidatosAtual || []).filter(item => item?.os?.id);
  const programacaoIds = new Set();
  const osIds = new Set();
  const teamRows = [];

  for (const item of items) {
    const programacaoId = snapshot?.programacaoIdParaOs?.(item.os)
      || item.programacao_id
      || item.equipeRows?.[0]?.programacao_id;
    if (programacaoId) programacaoIds.add(text(programacaoId));
    if (item.os?.id) osIds.add(text(item.os.id));
    for (const row of item.equipeRows || []) teamRows.push(row);
  }

  const directId = window.__progGetProgramacaoId?.();
  if (directId) programacaoIds.add(text(directId));
  const map = window.__progGetProgramacaoIdMap?.();
  if (map instanceof Map) {
    for (const value of map.values()) if (value) programacaoIds.add(text(value));
  }

  return {
    snapshot,
    items,
    teamRows,
    programacaoIds: [...programacaoIds],
    osIds: [...osIds],
  };
}

function contextLabel() {
  const select = document.getElementById('progSup');
  return text(select?.selectedOptions?.[0]?.textContent || select?.value || 'programação atual');
}

function injectStyles() {
  if (document.getElementById('programacaoLimparConciliacoesStyles')) return;
  const style = document.createElement('style');
  style.id = 'programacaoLimparConciliacoesStyles';
  style.textContent = `
    #${BUTTON_ID}{height:32px;box-sizing:border-box;border-color:rgba(248,113,113,.44);background:rgba(127,29,29,.18);color:#fecaca;letter-spacing:.04em}
    #${BUTTON_ID}:hover{border-color:rgba(248,113,113,.66);background:rgba(127,29,29,.32);color:#fee2e2}
    #${BUTTON_ID}:disabled{opacity:.62;cursor:wait}
    .pcl-overlay{position:fixed;inset:0;z-index:10090;background:rgba(2,6,23,.8);display:flex;align-items:center;justify-content:center;padding:18px}
    .pcl-modal{width:min(470px,94vw);overflow:hidden;border:1px solid rgba(248,113,113,.28);border-radius:18px;background:#071610;box-shadow:0 28px 80px rgba(0,0,0,.52)}
    .pcl-head{display:flex;justify-content:space-between;gap:14px;padding:18px 20px;border-bottom:1px solid rgba(248,113,113,.14)}
    .pcl-head h3{margin:0;color:#f8fafc;font-size:17px}.pcl-head p{margin:6px 0 0;color:#b7c9bf;font-size:12px;line-height:1.5}
    .pcl-head>button{width:32px;height:32px;border:0;border-radius:9px;background:rgba(148,163,184,.12);color:#cbd5e1;font-size:20px;cursor:pointer}
    .pcl-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:13px 20px;background:rgba(15,23,42,.38)}
    .pcl-summary span{padding:9px 8px;border:1px solid rgba(248,113,113,.13);border-radius:10px;color:#9fb7aa;font-size:10.5px;text-align:center}.pcl-summary b{display:block;color:#fecaca;font-size:18px;margin-bottom:2px}
    .pcl-actions{display:flex;justify-content:flex-end;gap:8px;padding:14px 20px;border-top:1px solid rgba(111,208,165,.12)}
    .pcl-cancel{border-color:rgba(148,163,184,.24)!important;color:#cbd5e1!important}
    .pcl-confirm{border-color:rgba(248,113,113,.5)!important;background:rgba(185,28,28,.3)!important;color:#fee2e2!important}
    @media(max-width:520px){.pcl-summary{grid-template-columns:1fr}.pcl-actions{flex-direction:column-reverse}.pcl-actions button{width:100%}}
  `;
  document.head.appendChild(style);
}

function setButtonBusy(busy) {
  const button = document.getElementById(BUTTON_ID);
  if (!button) return;
  button.disabled = !!busy;
  button.textContent = busy ? 'LIMPANDO...' : 'LIMPAR';
}

function setMapMessage(message = '') {
  const target = document.getElementById('pmgMsg');
  if (target) target.textContent = message;
}

function modal({ title, message, counts = null, confirmLabel = '' }) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'pcl-overlay';
    const summary = counts ? `<div class="pcl-summary">
      <span><b>${Number(counts.team || 0)}</b>Equipe/O.S.</span>
      <span><b>${Number(counts.fleet || 0)}</b>Frota</span>
      <span><b>${Number(counts.displacements || 0)}</b>Deslocamentos</span>
    </div>` : '';
    overlay.innerHTML = `<div class="pcl-modal">
      <div class="pcl-head"><div><h3>${esc(title)}</h3><p>${esc(message)}</p></div><button type="button" data-close>×</button></div>
      ${summary}
      <div class="pcl-actions">
        ${confirmLabel ? '<button type="button" class="peqb-btn pcl-cancel" data-cancel>Cancelar</button>' : ''}
        <button type="button" class="peqb-btn ${confirmLabel ? 'pcl-confirm' : ''}" data-confirm>${esc(confirmLabel || 'OK')}</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    const close = value => { overlay.remove(); resolve(value); };
    overlay.addEventListener('click', event => { if (event.target === overlay) close(false); });
    overlay.querySelector('[data-close]')?.addEventListener('click', () => close(false));
    overlay.querySelector('[data-cancel]')?.addEventListener('click', () => close(false));
    overlay.querySelector('[data-confirm]')?.addEventListener('click', () => close(true));
  });
}

function isFleetDisplacement(row) {
  const type = norm(row?.tipo_deslocamento);
  const observation = norm(row?.observacao);
  return type === 'CARONA FROTA'
    || type === 'MOTORISTA FROTA'
    || observation.includes('CARONA SUGERIDA')
    || observation.includes('FROTA LIGADA')
    || observation.includes('MOTORISTA VINCULADO NA PROGRAMACAO');
}

async function readCurrentLinks(context) {
  const { programacaoIds, osIds } = context;
  const teamPromise = programacaoIds.length && osIds.length
    ? supabase
      .from('programacao_equipe')
      .select('id,programacao_id,os_id,colaborador_id,nome_colaborador')
      .in('programacao_id', programacaoIds)
      .in('os_id', osIds)
      .limit(12000)
    : Promise.resolve({ data: [], error: null });

  const fleetPromise = programacaoIds.length
    ? supabase
      .from('programacao_frota_vinculos')
      .select('id,programacao_id,os_id,frota_colaborador_id,alvo_colaborador_id')
      .in('programacao_id', programacaoIds)
      .limit(12000)
    : Promise.resolve({ data: [], error: null });

  const displacementPromise = programacaoIds.length
    ? supabase
      .from('programacao_deslocamento')
      .select('id,programacao_id,colaborador_id,tipo_deslocamento,placa_veiculo,observacao')
      .in('programacao_id', programacaoIds)
      .limit(12000)
    : Promise.resolve({ data: [], error: null });

  const operationalPromise = osIds.length
    ? supabase
      .from('operacional_os_colaboradores')
      .select('id,os_id,colaborador_key')
      .in('os_id', osIds)
      .limit(12000)
    : Promise.resolve({ data: [], error: null });

  const [team, fleet, displacements, operational] = await Promise.all([
    teamPromise,
    fleetPromise,
    displacementPromise,
    operationalPromise,
  ]);

  if (team.error) throw team.error;
  if (displacements.error) throw displacements.error;
  if (operational.error) throw operational.error;
  if (fleet.error) console.warn('[programacao-limpar] programacao_frota_vinculos', fleet.error);

  return {
    team: team.data || [],
    fleet: fleet.error ? [] : (fleet.data || []),
    displacements: (displacements.data || []).filter(isFleetDisplacement),
    operational: operational.data || [],
    fleetTableAvailable: !fleet.error,
  };
}

async function deleteByIds(table, ids) {
  const values = unique(ids);
  if (!values.length) return;
  const { error } = await supabase.from(table).delete().in('id', values);
  if (error) throw error;
}

async function clearLinks(context, links) {
  const collaboratorIds = unique([
    ...links.team.map(row => row.colaborador_id),
    ...links.fleet.map(row => row.frota_colaborador_id),
    ...links.fleet.map(row => row.alvo_colaborador_id),
    ...links.displacements.map(row => row.colaborador_id),
    ...links.operational.map(row => row.colaborador_key),
  ]);

  await deleteByIds('programacao_equipe', links.team.map(row => row.id));
  await deleteByIds('operacional_os_colaboradores', links.operational.map(row => row.id));
  if (links.fleetTableAvailable) await deleteByIds('programacao_frota_vinculos', links.fleet.map(row => row.id));
  await deleteByIds('programacao_deslocamento', links.displacements.map(row => row.id));

  if (context.programacaoIds.length && collaboratorIds.length) {
    const { error } = await supabase
      .from('programacao_colaboradores')
      .update({ disponibilidade: 'SEM EMBARQUE', placa_veiculo: null })
      .in('programacao_id', context.programacaoIds)
      .in('colaborador_id', collaboratorIds);
    if (error) throw error;
  }

  return collaboratorIds;
}

async function refreshAfterClear() {
  await window.__peqbSilentRefresh?.();
  await window.__pgcRefreshDespesas?.();
  await Promise.resolve(window.__pmgRenderMapaGestor?.({ force: true }));
}

async function clearCurrentConciliations() {
  if (state.running) return;
  const button = document.getElementById(BUTTON_ID);
  const context = snapshotContext();

  if (!context.programacaoIds.length || !context.osIds.length) {
    await modal({
      title: 'Limpar conciliações',
      message: 'Carregue a programação e abra a Etapa 2 antes de limpar.',
    });
    return;
  }

  state.running = true;
  setButtonBusy(true);
  setMapMessage('Lendo conciliações atuais...');

  try {
    const links = await readCurrentLinks(context);
    const total = links.team.length + links.fleet.length + links.displacements.length + links.operational.length;
    if (!total) {
      setMapMessage('Nenhuma conciliação encontrada.');
      await modal({
        title: 'Nada para limpar',
        message: 'Não existem vínculos de colaborador, O.S. ou frota no contexto carregado.',
      });
      return;
    }

    const confirmed = await modal({
      title: 'Limpar conciliações do mapa?',
      message: `Serão removidos os vínculos de colaborador, O.S. e frota de ${contextLabel()}. Esta ação não exclui as O.S. nem os colaboradores.`,
      counts: {
        team: Math.max(links.team.length, links.operational.length),
        fleet: links.fleet.length,
        displacements: links.displacements.length,
      },
      confirmLabel: 'LIMPAR AGORA',
    });
    if (!confirmed) {
      setMapMessage('');
      return;
    }

    setMapMessage('Apagando conciliações...');
    const collaboratorIds = await clearLinks(context, links);

    logActivity('action', 'programacao_mapa_limpar_conciliacoes', 'programacao', {
      programacao_ids: context.programacaoIds,
      os_ids: context.osIds,
      colaboradores: collaboratorIds,
      equipe_removida: links.team.length,
      vinculos_operacionais_removidos: links.operational.length,
      vinculos_frota_removidos: links.fleet.length,
      deslocamentos_frota_removidos: links.displacements.length,
      release: RELEASE,
    });

    setMapMessage('Atualizando mapa...');
    await refreshAfterClear();
    setMapMessage('Conciliações removidas.');
    window.setTimeout(() => setMapMessage(''), 2200);

    await modal({
      title: 'Conciliações removidas',
      message: 'Os vínculos de colaborador, O.S. e frota foram apagados do contexto atual.',
    });
  } catch (error) {
    console.error('[programacao-limpar] limpar conciliações', error);
    setMapMessage('');
    await modal({
      title: 'Não foi possível limpar',
      message: error?.message || 'Ocorreu um erro ao apagar as conciliações.',
    });
  } finally {
    state.running = false;
    setButtonBusy(false);
    if (button && !button.isConnected) installButton();
  }
}

function installButton() {
  injectStyles();
  if (document.getElementById(BUTTON_ID)) return;
  const suggest = document.getElementById('pmgSugerirEquipe');
  const refresh = document.getElementById('pmgAtualizarManual');
  const select = document.getElementById('pmgTipoMapa');
  const anchor = suggest || select;
  if (!anchor && !refresh) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'peqb-btn';
  button.id = BUTTON_ID;
  button.textContent = 'LIMPAR';
  button.title = 'Apaga as conciliações de colaborador, O.S. e frota da programação carregada';
  button.addEventListener('click', clearCurrentConciliations);

  if (suggest) suggest.insertAdjacentElement('afterend', button);
  else if (refresh) refresh.insertAdjacentElement('beforebegin', button);
  else anchor.insertAdjacentElement('afterend', button);
}

function scheduleInstall() {
  window.setTimeout(installButton, 80);
  window.setTimeout(installButton, 500);
  window.setTimeout(installButton, 1400);
}

if (!window.__programacaoLimparConciliacoesInstalled) {
  window.__programacaoLimparConciliacoesInstalled = true;
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
