import { supabase } from './supabaseClient.js';

const RELEASE = '20260713-auditor-filtro1';
const state = { ids: new Set(), names: new Set(), loading: null };

const text = value => String(value ?? '').trim();
const norm = value => text(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, ' ')
  .trim();

function idOf(row) {
  return text(row?.colaboradorId || row?.colaborador_id || row?.cpf || row?.id);
}

function nameOf(row) {
  return norm(row?.nome || row?.nome_colaborador || row?.colaborador_nome || row?.funcionario);
}

function auditor(row) {
  if (!row) return false;
  const role = norm([
    row.cargo,
    row.funcao,
    row.funcao_nome,
    row.ocupacao,
    row.tipo_cargo,
    row.descricao_cargo,
  ].filter(Boolean).join(' '));
  const id = idOf(row);
  const name = nameOf(row);
  return /\bAUDITOR(?:A|ES|AS)?\b/.test(role)
    || (id && state.ids.has(id))
    || (name && state.names.has(name));
}

async function loadAuditors() {
  if (state.loading) return state.loading;
  state.loading = (async () => {
    const result = await supabase
      .from('colaborador_cruzamento')
      .select('colaborador_id,cpf,id,nome,colaborador_nome,funcionario,cargo')
      .ilike('cargo', '%AUDITOR%')
      .limit(5000);
    if (result.error) {
      console.warn('[programacao-auditor-filtro] consulta:', result.error);
      return;
    }
    const ids = new Set();
    const names = new Set();
    for (const row of result.data || []) {
      [row.colaborador_id, row.cpf, row.id].map(text).filter(Boolean).forEach(value => ids.add(value));
      [row.nome, row.colaborador_nome, row.funcionario].map(norm).filter(Boolean).forEach(value => names.add(value));
    }
    state.ids = ids;
    state.names = names;
  })().finally(() => { state.loading = null; });
  return state.loading;
}

function filterSnapshot(snapshot) {
  if (!snapshot?.osComCandidatosAtual) return snapshot;
  return {
    ...snapshot,
    osComCandidatosAtual: snapshot.osComCandidatosAtual.map(item => ({
      ...item,
      candidatos: (item.candidatos || []).filter(row => !auditor(row)),
      colaboradoresRegional: (item.colaboradoresRegional || []).filter(row => !auditor(row)),
      equipeRows: (item.equipeRows || []).filter(row => !auditor(row)),
    })),
  };
}

function install() {
  const current = window.__peqbGetEquipeSnapshot;
  if (typeof current !== 'function') return false;
  if (current.__programacaoAuditorFiltro === RELEASE) return true;

  const wrapped = (...args) => filterSnapshot(current(...args));
  wrapped.__programacaoAuditorFiltro = RELEASE;
  wrapped.__programacaoAuditorFiltroOriginal = current;
  window.__peqbGetEquipeSnapshot = wrapped;
  return true;
}

async function boot() {
  await loadAuditors();
  [0, 80, 250, 700, 1500, 3000].forEach(delay => window.setTimeout(install, delay));

  document.addEventListener('click', event => {
    if (event.target.closest('#progLoadContext')
      || event.target.closest('#progSteps .stepbtn')
      || event.target.closest('#peqbVerMapa')) {
      window.setTimeout(install, 100);
    }
  }, true);
}

if (!window.__programacaoAuditorFiltroInstalled) {
  window.__programacaoAuditorFiltroInstalled = RELEASE;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}
