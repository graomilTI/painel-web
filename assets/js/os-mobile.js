import { supabase } from './supabaseClient.js';
import { getCurrentUser, getUserContext } from './auth.js';
import { getColaboradores } from './colaboradoresCache.js';

const BR = new Intl.NumberFormat('pt-BR');
const PAGE = 1000;
const state = {
  user: null,
  context: null,
  appUser: null,
  access: { restricted: false, coordenacao: '', labels: [], tokens: [] },
  rows: [],
  atribuicoes: [],
  colaboradores: [],
  filters: { status: '', busca: '' },
  loading: false,
};

function norm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function parseList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return [...new Set(value.flatMap(parseList))];
  if (typeof value === 'object') return parseList(value.supervisao || value.supervisoes || value.nome || value.name);
  const text = String(value).trim();
  if (!text) return [];
  try {
    if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('{') && text.endsWith('}'))) return parseList(JSON.parse(text));
  } catch {}
  return [...new Set(text.split(/[,;|\n]+/).map((item) => item.trim()).filter(Boolean))];
}

function num(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function brDate(value) {
  const raw = String(value || '').slice(0, 10);
  const [y, m, d] = raw.split('-');
  return y && m && d ? `${d}/${m}/${y}` : '-';
}

function fmt(value) { return BR.format(num(value)); }

function osStatus(row) {
  const st = norm(row?.status_gestor || '');
  if (!st || (st === 'AGUARDAR' && !row?.configurada_em)) return 'PENDENTE';
  return st;
}

function isMasterContext(context) {
  const role = context?.user?.role || context?.perfil_codigo || context?.perfil_nome || context?.role || '';
  return Boolean(context?.user?.is_master || context?.is_master || norm(role) === 'MASTER');
}

function buildAccess(context, appUser) {
  const labels = [
    ...parseList(appUser?.supervisao),
    ...parseList(appUser?.supervisoes),
    ...parseList(context?.supervisao),
    ...parseList(context?.supervisoes),
    ...parseList(context?.user?.supervisao),
    ...parseList(context?.user?.supervisoes),
  ].filter(Boolean);
  const coordenacao = String(appUser?.coordenacao || context?.coordenacao || context?.user?.coordenacao || '').trim();
  if (coordenacao) labels.push(coordenacao);

  const setor = norm(appUser?.setor || context?.setor || context?.department?.name || context?.department?.code || '');
  const role = norm(context?.user?.role || context?.perfil_codigo || context?.perfil_nome || context?.role || '');
  const master = isMasterContext(context);
  const gestor = setor === 'GESTOR' || role === 'GESTOR';
  const fullTokens = [...new Set(labels.map(norm).filter((item) => item.length >= 4))];
  const wordTokens = fullTokens
    .flatMap((item) => item.split(/\s+/))
    .filter((item) => item.length >= 4 && !['GESTOR', 'GERAL', 'SETOR', 'SUPERVISAO', 'REGIONAL'].includes(item));
  return {
    restricted: !master && (gestor || labels.length > 0),
    coordenacao,
    labels: [...new Set(labels)],
    tokens: [...new Set([...fullTokens, ...wordTokens])],
  };
}

function rowAllowed(row) {
  if (!state.access.restricted) return true;
  const sup = norm(row?.supervisao);
  const coord = norm(row?.coordenacao);
  return state.access.tokens.some((token) => token && (
    sup === token || sup.includes(token) || token.includes(sup) ||
    coord === token || coord.includes(token) || token.includes(coord)
  ));
}

function colabKey(c) {
  return String(c?.colaborador_id || c?.cpf || c?.id || c?.nome || '').replace(/\D/g, '') || String(c?.id || c?.nome || '').trim();
}

function activeColab(c) {
  if (!c || c.ativo === false) return false;
  const sit = norm(c.situacao);
  return !['NAO ATIVO', 'INATIVO', 'DESLIGADO', 'DEMITIDO'].some((s) => sit.includes(s));
}

function filteredRows() {
  const busca = norm(state.filters.busca);
  const status = norm(state.filters.status);
  return [...state.rows]
    .filter((row) => !status || osStatus(row) === status)
    .filter((row) => !busca || norm(`${row.numero_os} ${row.cliente} ${row.embarque} ${row.destino} ${row.contrato} ${row.produto} ${row.supervisao}`).includes(busca))
    .sort((a, b) => String(a.data_os || '').localeCompare(String(b.data_os || '')) || num(b.numero_os) - num(a.numero_os));
}

function atribuicao(row) {
  return state.atribuicoes.find((a) => String(a.os_id) === String(row.id)) || null;
}

function colabOptions(row, selectedKey) {
  const sup = norm(row?.supervisao);
  const coord = norm(row?.coordenacao);
  const list = state.colaboradores
    .filter(activeColab)
    .filter((c) => {
      const cs = norm(c.supervisao || c.regional);
      const cc = norm(c.coordenacao);
      return !sup && !coord || !cs && !cc || cs.includes(sup) || sup.includes(cs) || cc.includes(coord) || coord.includes(cc);
    })
    .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
    .slice(0, 250);
  return '<option value="">Selecionar colaborador...</option>' + list.map((c) => {
    const key = colabKey(c);
    return `<option value="${escapeHtml(key)}" ${String(selectedKey || '') === String(key) ? 'selected' : ''}>${escapeHtml(c.nome || c.nome_colaborador || '-')}</option>`;
  }).join('');
}

async function resolveAccess() {
  state.user = await getCurrentUser().catch(() => null);
  state.context = state.user?.id ? await getUserContext(state.user.id).catch(() => null) : null;
  const { data } = await supabase
    .from('app_usuarios')
    .select('id,nome,email,setor,supervisao,coordenacao,empresa,status')
    .eq('auth_user_id', state.user?.id || '')
    .maybeSingle();
  state.appUser = data || null;
  state.access = buildAccess(state.context, state.appUser);
}

async function fetchOsRows(serverFilter = true) {
  const rows = [];
  for (let page = 0; page < 20; page += 1) {
    const from = page * PAGE;
    const to = from + PAGE - 1;
    let q = supabase.from('operacional_os').select('*').range(from, to);
    if (serverFilter && state.access.restricted && state.access.coordenacao) q = q.ilike('coordenacao', `%${state.access.coordenacao}%`);
    const { data, error } = await q;
    if (error) throw error;
    const chunk = Array.isArray(data) ? data : [];
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return rows;
}

async function loadRows() {
  state.loading = true;
  renderLoading();
  await resolveAccess();

  let rows = await fetchOsRows(true);
  rows = rows.filter(rowAllowed);
  if (state.access.restricted && rows.length <= 2) {
    const fallback = await fetchOsRows(false);
    const filtered = fallback.filter(rowAllowed);
    if (filtered.length > rows.length) rows = filtered;
  }
  state.rows = rows;

  const ids = rows.map((row) => row.id).filter(Boolean);
  state.atribuicoes = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data } = await supabase.from('operacional_os_colaboradores').select('*').in('os_id', chunk);
    state.atribuicoes.push(...(Array.isArray(data) ? data : []));
  }

  const colabBase = await supabase.from('operacional_colaborador_base').select('*').eq('ativo', true).limit(5000);
  if (!colabBase.error && Array.isArray(colabBase.data) && colabBase.data.length) {
    state.colaboradores = colabBase.data.map((c) => ({ ...c, nome: c.nome || c.nome_colaborador }));
  } else {
    state.colaboradores = (await getColaboradores().catch(() => [])).map((c) => ({ ...c, nome: c.nome || c.nome_colaborador }));
  }

  state.loading = false;
  render();
}

function renderLoading() {
  const root = document.getElementById('pageContent');
  if (!root) return;
  root.innerHTML = '<section class="card os-mobile-card"><div class="os-mobile-muted">Carregando O.S. da supervisão...</div></section>';
}

function renderOsCard(row) {
  const st = osStatus(row);
  const rem = num(row.remanescente);
  const atr = atribuicao(row);
  const selectedKey = atr?.colaborador_key || '';
  return `<article class="os-mobile-card ${rem === 0 ? 'is-zero' : ''}" data-os-id="${escapeHtml(row.id)}">
    <div class="os-mobile-head">
      <div>
        <div class="os-mobile-num">OS ${escapeHtml(row.numero_os || '-')}</div>
        <div class="os-mobile-date">${brDate(row.data_os)} · ${escapeHtml(row.supervisao || row.coordenacao || '-')}</div>
      </div>
      <span class="os-mobile-status is-${st.toLowerCase()}">${escapeHtml(st)}</span>
    </div>

    <div class="os-mobile-client">${escapeHtml(row.cliente || '-')}</div>
    <div class="os-mobile-route">Emb.: ${escapeHtml(row.embarque || '-')}</div>
    <div class="os-mobile-route">Dest.: ${escapeHtml(row.destino || '-')}</div>

    <div class="os-mobile-metrics">
      <div><small>Remanescente</small><b>${fmt(rem)}</b></div>
      <div><small>Lote</small><b>${fmt(row.lote)}</b></div>
      <div><small>Embarcado</small><b>${fmt(row.embarcado)}</b></div>
    </div>

    <label class="os-mobile-field">
      <span>Colaborador indicado</span>
      <select data-mobile-colab>${colabOptions(row, selectedKey)}</select>
    </label>

    <div class="os-mobile-actions">
      <button type="button" data-mobile-status="AGUARDAR" class="${st === 'AGUARDAR' ? 'active' : ''}">Aguardar</button>
      <button type="button" data-mobile-status="ATENDER" class="${st === 'ATENDER' ? 'active' : ''}">Atender</button>
      <button type="button" data-mobile-status="FINALIZAR" class="danger ${st === 'FINALIZAR' ? 'active' : ''}">Finalizar</button>
    </div>
  </article>`;
}

function render() {
  const root = document.getElementById('pageContent');
  if (!root) return;
  const rows = filteredRows();
  root.innerHTML = `
    <section class="card os-mobile-toolbar">
      <div class="os-mobile-title-wrap">
        <h3>O.S. da supervisão</h3>
        <span>${rows.length}/${state.rows.length}</span>
      </div>
      <div class="os-mobile-access">${escapeHtml(state.access.labels.join(', ') || 'Todas liberadas')}</div>
      <div class="os-mobile-filters">
        <select id="osMobileStatus">
          <option value="">Todos os status</option>
          <option value="PENDENTE" ${state.filters.status === 'PENDENTE' ? 'selected' : ''}>Pendente</option>
          <option value="AGUARDAR" ${state.filters.status === 'AGUARDAR' ? 'selected' : ''}>Aguardar</option>
          <option value="ATENDER" ${state.filters.status === 'ATENDER' ? 'selected' : ''}>Atender</option>
          <option value="FINALIZAR" ${state.filters.status === 'FINALIZAR' ? 'selected' : ''}>Finalizar</option>
        </select>
        <input id="osMobileBusca" type="search" value="${escapeHtml(state.filters.busca)}" placeholder="Buscar OS, cliente, destino..." />
        <button type="button" id="osMobileReload">Atualizar</button>
      </div>
    </section>
    <section class="os-mobile-list">
      ${rows.length ? rows.map(renderOsCard).join('') : '<div class="os-mobile-empty">Nenhuma O.S. encontrada para esta supervisão/filtro.</div>'}
    </section>`;

  document.getElementById('osMobileStatus')?.addEventListener('change', (event) => { state.filters.status = event.target.value; render(); });
  document.getElementById('osMobileBusca')?.addEventListener('input', (event) => { state.filters.busca = event.target.value; render(); });
  document.getElementById('osMobileReload')?.addEventListener('click', loadRows);
  root.querySelectorAll('[data-mobile-status]').forEach((btn) => btn.addEventListener('click', updateStatus));
  root.querySelectorAll('[data-mobile-colab]').forEach((select) => select.addEventListener('change', updateColaborador));
}

async function updateStatus(event) {
  const card = event.target.closest('[data-os-id]');
  const row = state.rows.find((item) => String(item.id) === String(card?.dataset.osId));
  if (!row) return;
  const nextStatus = event.target.dataset.mobileStatus;
  if (nextStatus === 'ATENDER' && !atribuicao(row)) {
    alert('Selecione um colaborador antes de enviar para Atender/Conferência.');
    return;
  }
  const now = new Date().toISOString();
  const patch = { status_gestor: nextStatus, configurada_em: now, observacao_logistica: null, updated_at: now };
  if (nextStatus === 'FINALIZAR') {
    patch.status_logistica = 'PENDENTE';
    patch.enviado_logistica_em = row.enviado_logistica_em || now;
    patch.logistica_solicitado_por = state.user?.id || null;
  } else {
    patch.status_logistica = null;
    patch.enviado_logistica_em = null;
    patch.logistica_solicitado_por = null;
  }
  Object.assign(row, patch);
  render();
  const { error } = await supabase.from('operacional_os').update(patch).eq('id', row.id);
  if (error) alert(error.message || 'Erro ao atualizar O.S.');
}

async function updateColaborador(event) {
  const card = event.target.closest('[data-os-id]');
  const row = state.rows.find((item) => String(item.id) === String(card?.dataset.osId));
  const key = event.target.value;
  if (!row || !key) return;
  const colab = state.colaboradores.find((c) => String(colabKey(c)) === String(key));
  if (!colab) return;
  const payload = {
    os_id: row.id,
    colaborador_key: key,
    colaborador_nome: colab.nome || colab.nome_colaborador || 'Colaborador',
    distancia_km: null,
    origem_sugestao: 'GESTOR_MOBILE',
    indicado_por: state.user?.id || null,
  };
  const { data, error } = await supabase
    .from('operacional_os_colaboradores')
    .upsert(payload, { onConflict: 'os_id,colaborador_key' })
    .select('*')
    .maybeSingle();
  if (error) {
    alert(error.message || 'Erro ao indicar colaborador.');
    return;
  }
  state.atribuicoes = state.atribuicoes.filter((a) => String(a.os_id) !== String(row.id));
  state.atribuicoes.push(data || payload);
  render();
}

function injectStyles() {
  if (document.getElementById('os-mobile-dedicated-styles')) return;
  const style = document.createElement('style');
  style.id = 'os-mobile-dedicated-styles';
  style.textContent = `
    html,body{overflow-x:hidden!important;background:#090914!important}
    .app-shell{display:block!important;width:100%!important;min-width:0!important}.sidebar{display:none!important}.content-wrap{width:100%!important;max-width:100%!important;margin:0!important;min-width:0!important}.page-main{padding:12px max(10px,env(safe-area-inset-left)) calc(24px + env(safe-area-inset-bottom))!important;width:100%!important;overflow-x:hidden!important}.topbar{position:sticky!important;top:0!important;z-index:60!important;background:rgba(9,9,20,.96)!important;backdrop-filter:blur(16px)!important;padding:12px!important}.topbar h1{font-size:20px!important}.topbar .meta{max-width:54vw!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}#roleBadge{display:none!important}
    .os-mobile-toolbar,.os-mobile-card{border:1px solid rgba(52,211,153,.13)!important;background:rgba(13,24,18,.72)!important;border-radius:22px!important;padding:14px!important;box-shadow:0 18px 44px rgba(0,0,0,.24)!important}.os-mobile-title-wrap{display:flex;align-items:center;justify-content:space-between;gap:10px}.os-mobile-title-wrap h3{margin:0;font-size:18px;color:#f8fafc}.os-mobile-title-wrap span{color:#86efac;font-weight:950}.os-mobile-access{margin-top:5px;color:#7d8aa3;font-size:12px}.os-mobile-filters{display:grid;gap:9px;margin-top:12px}.os-mobile-filters select,.os-mobile-filters input,.os-mobile-filters button,.os-mobile-field select{width:100%;min-height:46px;border-radius:14px;border:1px solid rgba(52,211,153,.18);background:#0d0d18;color:#e2e2f0;padding:0 12px;color-scheme:dark}.os-mobile-filters button{background:linear-gradient(135deg,#16a34a,#86efac);color:#052e16;font-weight:950}.os-mobile-list{display:grid;gap:11px;margin-top:12px}.os-mobile-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.os-mobile-num{font-size:20px;font-weight:1000;color:#f8fafc;letter-spacing:-.03em}.os-mobile-date,.os-mobile-route,.os-mobile-muted{color:#7d8aa3;font-size:12px;line-height:1.35}.os-mobile-client{font-size:15px;font-weight:950;color:#f8fafc;margin-top:10px}.os-mobile-status{display:inline-flex;border-radius:999px;padding:6px 9px;font-size:10px;font-weight:950;white-space:nowrap;border:1px solid rgba(148,163,184,.25);color:#e2e8f0}.os-mobile-status.is-atender{background:#86efac;color:#052e16;border-color:transparent}.os-mobile-status.is-aguardar{background:#fde68a;color:#713f12;border-color:transparent}.os-mobile-status.is-finalizar{background:rgba(59,130,246,.20);color:#bfdbfe}.os-mobile-card.is-zero{box-shadow:inset 4px 0 0 #facc15,0 18px 44px rgba(0,0,0,.24)!important}.os-mobile-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0}.os-mobile-metrics div{border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.035);border-radius:14px;padding:9px}.os-mobile-metrics small{display:block;color:#7d8aa3;font-size:10px;font-weight:850}.os-mobile-metrics b{display:block;color:#f8fafc;font-size:13px;margin-top:3px;overflow-wrap:anywhere}.os-mobile-field{display:grid;gap:6px}.os-mobile-field span{font-size:10px;font-weight:950;color:#86efac;text-transform:uppercase;letter-spacing:.08em}.os-mobile-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:11px}.os-mobile-actions button{min-height:44px;border-radius:14px;border:1px solid rgba(52,211,153,.22);background:rgba(15,23,42,.72);color:#dcfce7;font-weight:900}.os-mobile-actions button.active{background:linear-gradient(135deg,#16a34a,#86efac);color:#052e16}.os-mobile-actions button.danger.active{background:#bfdbfe;color:#0f172a}.os-mobile-empty{border:1px dashed rgba(52,211,153,.2);border-radius:18px;padding:18px;text-align:center;color:#7d8aa3}
  `;
  document.head.appendChild(style);
}

export async function renderOsMobile(content) {
  injectStyles();
  await loadRows();
}
