import { supabase } from './supabaseClient.js';
import { getCurrentUser, getUserContext } from './auth.js';
import { getColaboradores } from './colaboradoresCache.js';

const BR = new Intl.NumberFormat('pt-BR');
const PAGE = 1000;
const MAX_PAGES = 40;
const UF_BY_ESTADO = {
  ACRE: 'AC', ALAGOAS: 'AL', AMAPA: 'AP', AMAZONAS: 'AM', BAHIA: 'BA', CEARA: 'CE', DISTRITO: 'DF', 'DISTRITO FEDERAL': 'DF', ESPIRITO: 'ES', 'ESPIRITO SANTO': 'ES', GOIAS: 'GO', MARANHAO: 'MA', 'MATO GROSSO': 'MT', 'MATO GROSSO DO SUL': 'MS', MINAS: 'MG', 'MINAS GERAIS': 'MG', PARA: 'PA', PARAIBA: 'PB', PARANA: 'PR', PERNAMBUCO: 'PE', PIAUI: 'PI', JANEIRO: 'RJ', 'RIO DE JANEIRO': 'RJ', 'RIO GRANDE DO NORTE': 'RN', 'RIO GRANDE DO SUL': 'RS', RONDONIA: 'RO', RORAIMA: 'RR', CATARINA: 'SC', 'SANTA CATARINA': 'SC', PAULO: 'SP', 'SAO PAULO': 'SP', SERGIPE: 'SE', TOCANTINS: 'TO'
};

const state = {
  user: null,
  context: null,
  appUser: null,
  access: { restricted: false, labels: [], tokens: [], ufs: [] },
  rows: [],
  atribuicoes: [],
  colaboradores: [],
  filters: { status: '', busca: '' },
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
  if (typeof value === 'object') return parseList(value.supervisao || value.supervisoes || value.nome || value.name || value.coordenacao || value.regional);
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

function buildTokens(labels) {
  const full = labels.map(norm).filter((item) => item.length >= 3);
  const words = full.flatMap((item) => item.split(/\s+/)).filter((item) => item.length >= 4 && !['GESTOR', 'GERAL', 'SETOR', 'SUPERVISAO', 'REGIONAL', 'COORDENACAO'].includes(item));
  return [...new Set([...full, ...words])];
}

function ufTokens(labels) {
  const out = [];
  labels.map(norm).forEach((label) => {
    Object.entries(UF_BY_ESTADO).forEach(([name, uf]) => {
      if (label === name || label.includes(name) || name.includes(label)) out.push(uf);
    });
    if (/^[A-Z]{2}$/.test(label)) out.push(label);
  });
  return [...new Set(out)];
}

async function expandLabelsWithSupervisoes(labels) {
  const tokens = buildTokens(labels);
  try {
    const { data, error } = await supabase.from('supervisoes').select('*').limit(2000);
    if (error) return labels;
    const extra = [];
    (data || []).forEach((row) => {
      const nome = row.nome || row.supervisao || row.name || row.label || '';
      if (!nome) return;
      const haySemNome = norm(Object.entries(row)
        .filter(([key]) => !['id', 'nome', 'supervisao', 'name', 'label', 'created_at', 'updated_at'].includes(key))
        .map(([, value]) => typeof value === 'object' ? JSON.stringify(value) : value)
        .join(' '));
      if (tokens.some((token) => haySemNome.includes(token) || token.includes(haySemNome))) extra.push(nome);
    });
    return [...new Set([...labels, ...extra])];
  } catch {
    return labels;
  }
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

  let labels = [
    ...parseList(state.appUser?.coordenacao),
    ...parseList(state.appUser?.supervisao),
    ...parseList(state.appUser?.supervisoes),
    ...parseList(state.context?.coordenacao),
    ...parseList(state.context?.supervisao),
    ...parseList(state.context?.supervisoes),
    ...parseList(state.context?.user?.coordenacao),
    ...parseList(state.context?.user?.supervisao),
    ...parseList(state.context?.user?.supervisoes),
  ].filter(Boolean);

  labels = await expandLabelsWithSupervisoes([...new Set(labels)]);
  const setor = norm(state.appUser?.setor || state.context?.setor || state.context?.department?.name || state.context?.department?.code || '');
  const role = norm(state.context?.user?.role || state.context?.perfil_codigo || state.context?.perfil_nome || state.context?.role || '');
  const master = isMasterContext(state.context);
  const restricted = !master && (setor === 'GESTOR' || role === 'GESTOR' || labels.length > 0);
  state.access = { restricted, labels: [...new Set(labels)], tokens: buildTokens(labels), ufs: ufTokens(labels) };
}

function rowAllowed(row) {
  if (!state.access.restricted) return true;
  const hay = norm(`${row?.coordenacao || ''} ${row?.regional || ''} ${row?.supervisao || ''} ${row?.estado || ''} ${row?.uf || ''} ${row?.embarque || ''} ${row?.destino || ''}`);
  const ufRaw = norm(`${row?.uf || ''} ${row?.estado || ''} ${row?.embarque || ''} ${row?.destino || ''}`);
  const byText = state.access.tokens.some((token) => token && (hay.includes(token) || token.includes(hay)));
  const byUf = state.access.ufs.some((uf) => uf && (ufRaw.includes(` ${uf} `) || ufRaw.startsWith(`${uf} `) || ufRaw.includes(`${uf} -`) || ufRaw === uf));
  return byText || byUf;
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
      return !sup && !coord || !cs && !cc || cs.includes(sup) || sup.includes(cs) || cc.includes(coord) || coord.includes(cc) || rowAllowed(c);
    })
    .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
    .slice(0, 300);
  return '<option value="">Selecionar colaborador...</option>' + list.map((c) => {
    const key = colabKey(c);
    return `<option value="${escapeHtml(key)}" ${String(selectedKey || '') === String(key) ? 'selected' : ''}>${escapeHtml(c.nome || c.nome_colaborador || '-')}</option>`;
  }).join('');
}

async function fetchAllOs() {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE;
    const to = from + PAGE - 1;
    const { data, error } = await supabase.from('operacional_os').select('*').range(from, to);
    if (error) throw error;
    const chunk = Array.isArray(data) ? data : [];
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return rows;
}

async function loadRows() {
  renderLoading();
  await resolveAccess();
  const allRows = await fetchAllOs();
  let filtered = state.access.restricted ? allRows.filter(rowAllowed) : allRows;

  // Segurança contra cadastro incompleto: se o login tem regional mas a tabela de supervisões ainda não mapeia os nomes,
  // mantém ao menos as O.S. que tenham UF compatível no embarque/destino. Isso resolve Tocantins/TO sem depender de igualdade exata.
  if (state.access.restricted && filtered.length < allRows.length) {
    const byUf = allRows.filter((row) => state.access.ufs.some((uf) => norm(`${row.uf || ''} ${row.estado || ''} ${row.embarque || ''} ${row.destino || ''}`).includes(uf)));
    if (byUf.length > filtered.length) filtered = byUf;
  }
  state.rows = filtered;

  const ids = state.rows.map((row) => row.id).filter(Boolean);
  state.atribuicoes = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from('operacional_os_colaboradores').select('*').in('os_id', ids.slice(i, i + 200));
    state.atribuicoes.push(...(Array.isArray(data) ? data : []));
  }

  const colabBase = await supabase.from('operacional_colaborador_base').select('*').eq('ativo', true).limit(5000);
  if (!colabBase.error && Array.isArray(colabBase.data) && colabBase.data.length) {
    state.colaboradores = colabBase.data.map((c) => ({ ...c, nome: c.nome || c.nome_colaborador }));
  } else {
    state.colaboradores = (await getColaboradores().catch(() => [])).map((c) => ({ ...c, nome: c.nome || c.nome_colaborador }));
  }
  render();
}

function renderLoading() {
  const root = document.getElementById('pageContent');
  if (root) root.innerHTML = '<section class="card os-mobile-card"><div class="os-mobile-muted">Carregando O.S. da supervisão...</div></section>';
}

function renderOsCard(row) {
  const st = osStatus(row);
  const rem = num(row.remanescente);
  const atr = atribuicao(row);
  const selectedKey = atr?.colaborador_key || '';
  return `<article class="os-mobile-card ${rem === 0 ? 'is-zero' : ''}" data-os-id="${escapeHtml(row.id)}">
    <div class="os-mobile-head">
      <div><div class="os-mobile-num">OS ${escapeHtml(row.numero_os || '-')}</div><div class="os-mobile-date">${brDate(row.data_os)} · ${escapeHtml(row.supervisao || row.coordenacao || '-')}</div></div>
      <span class="os-mobile-status is-${st.toLowerCase()}">${escapeHtml(st)}</span>
    </div>
    <div class="os-mobile-client">${escapeHtml(row.cliente || '-')}</div>
    <div class="os-mobile-route">Emb.: ${escapeHtml(row.embarque || '-')}</div>
    <div class="os-mobile-route">Dest.: ${escapeHtml(row.destino || '-')}</div>
    <div class="os-mobile-metrics"><div><small>Remanescente</small><b>${fmt(rem)}</b></div><div><small>Lote</small><b>${fmt(row.lote)}</b></div><div><small>Embarcado</small><b>${fmt(row.embarcado)}</b></div></div>
    <label class="os-mobile-field"><span>Colaborador indicado</span><select data-mobile-colab>${colabOptions(row, selectedKey)}</select></label>
    <div class="os-mobile-actions"><button type="button" data-mobile-status="AGUARDAR" class="${st === 'AGUARDAR' ? 'active' : ''}">Aguardar</button><button type="button" data-mobile-status="ATENDER" class="${st === 'ATENDER' ? 'active' : ''}">Atender</button><button type="button" data-mobile-status="FINALIZAR" class="danger ${st === 'FINALIZAR' ? 'active' : ''}">Finalizar</button></div>
  </article>`;
}

function render() {
  const root = document.getElementById('pageContent');
  if (!root) return;
  const rows = filteredRows();
  root.innerHTML = `<section class="card os-mobile-toolbar"><div class="os-mobile-title-wrap"><h3>O.S. da supervisão</h3><span>${rows.length}/${state.rows.length}</span></div><div class="os-mobile-access">${escapeHtml(state.access.labels.join(', ') || 'Todas liberadas')}</div><div class="os-mobile-filters"><select id="osMobileStatus"><option value="">Todos os status</option><option value="PENDENTE" ${state.filters.status === 'PENDENTE' ? 'selected' : ''}>Pendente</option><option value="AGUARDAR" ${state.filters.status === 'AGUARDAR' ? 'selected' : ''}>Aguardar</option><option value="ATENDER" ${state.filters.status === 'ATENDER' ? 'selected' : ''}>Atender</option><option value="FINALIZAR" ${state.filters.status === 'FINALIZAR' ? 'selected' : ''}>Finalizar</option></select><input id="osMobileBusca" type="search" value="${escapeHtml(state.filters.busca)}" placeholder="Buscar OS, cliente, destino..." /><button type="button" id="osMobileReload">Atualizar</button></div></section><section class="os-mobile-list">${rows.length ? rows.map(renderOsCard).join('') : '<div class="os-mobile-empty">Nenhuma O.S. encontrada para esta supervisão/filtro.</div>'}</section>`;
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
    patch.status_logistica = null; patch.enviado_logistica_em = null; patch.logistica_solicitado_por = null;
  }
  Object.assign(row, patch); render();
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
  const payload = { os_id: row.id, colaborador_key: key, colaborador_nome: colab.nome || colab.nome_colaborador || 'Colaborador', distancia_km: null, origem_sugestao: 'GESTOR_MOBILE', indicado_por: state.user?.id || null };
  const { data, error } = await supabase.from('operacional_os_colaboradores').upsert(payload, { onConflict: 'os_id,colaborador_key' }).select('*').maybeSingle();
  if (error) return alert(error.message || 'Erro ao indicar colaborador.');
  state.atribuicoes = state.atribuicoes.filter((a) => String(a.os_id) !== String(row.id));
  state.atribuicoes.push(data || payload);
  render();
}

function injectStyles() {
  if (document.getElementById('os-mobile-v2-styles')) return;
  const style = document.createElement('style');
  style.id = 'os-mobile-v2-styles';
  style.textContent = `
    html,body{overflow-x:hidden!important;background:#090914!important}.app-shell{display:block!important;width:100%!important;min-width:0!important}.sidebar{display:none!important}.content-wrap{width:100%!important;max-width:100%!important;margin:0!important;min-width:0!important}.grid-cards,#osStats{display:none!important}.page-main{padding:12px max(10px,env(safe-area-inset-left)) calc(24px + env(safe-area-inset-bottom))!important;width:100%!important;overflow-x:hidden!important}.topbar{position:sticky!important;top:0!important;z-index:60!important;background:rgba(9,9,20,.96)!important;backdrop-filter:blur(16px)!important;padding:12px!important}.topbar h1{font-size:20px!important}.topbar .meta{max-width:54vw!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}#roleBadge{display:none!important}.os-mobile-toolbar,.os-mobile-card{border:1px solid rgba(52,211,153,.13)!important;background:rgba(13,24,18,.72)!important;border-radius:22px!important;padding:14px!important;box-shadow:0 18px 44px rgba(0,0,0,.24)!important}.os-mobile-title-wrap{display:flex;align-items:center;justify-content:space-between;gap:10px}.os-mobile-title-wrap h3{margin:0;font-size:18px;color:#f8fafc}.os-mobile-title-wrap span{color:#86efac;font-weight:950}.os-mobile-access{margin-top:5px;color:#7d8aa3;font-size:12px}.os-mobile-filters{display:grid;gap:9px;margin-top:12px}.os-mobile-filters select,.os-mobile-filters input,.os-mobile-filters button,.os-mobile-field select{width:100%;min-height:46px;border-radius:14px;border:1px solid rgba(52,211,153,.18);background:#0d0d18;color:#e2e2f0;padding:0 12px;color-scheme:dark}.os-mobile-filters button{background:linear-gradient(135deg,#16a34a,#86efac);color:#052e16;font-weight:950}.os-mobile-list{display:grid;gap:11px;margin-top:12px}.os-mobile-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.os-mobile-num{font-size:20px;font-weight:1000;color:#f8fafc;letter-spacing:-.03em}.os-mobile-date,.os-mobile-route,.os-mobile-muted{color:#7d8aa3;font-size:12px;line-height:1.35}.os-mobile-client{font-size:15px;font-weight:950;color:#f8fafc;margin-top:10px}.os-mobile-status{display:inline-flex;border-radius:999px;padding:6px 9px;font-size:10px;font-weight:950;white-space:nowrap;border:1px solid rgba(148,163,184,.25);color:#e2e8f0}.os-mobile-status.is-atender{background:#86efac;color:#052e16;border-color:transparent}.os-mobile-status.is-aguardar{background:#fde68a;color:#713f12;border-color:transparent}.os-mobile-status.is-finalizar{background:rgba(59,130,246,.20);color:#bfdbfe}.os-mobile-card.is-zero{box-shadow:inset 4px 0 0 #facc15,0 18px 44px rgba(0,0,0,.24)!important}.os-mobile-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0}.os-mobile-metrics div{border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.035);border-radius:14px;padding:9px}.os-mobile-metrics small{display:block;color:#7d8aa3;font-size:10px;font-weight:850}.os-mobile-metrics b{display:block;color:#f8fafc;font-size:13px;margin-top:3px;overflow-wrap:anywhere}.os-mobile-field{display:grid;gap:6px}.os-mobile-field span{font-size:10px;font-weight:950;color:#86efac;text-transform:uppercase;letter-spacing:.08em}.os-mobile-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:11px}.os-mobile-actions button{min-height:44px;border-radius:14px;border:1px solid rgba(52,211,153,.22);background:rgba(15,23,42,.72);color:#dcfce7;font-weight:900}.os-mobile-actions button.active{background:linear-gradient(135deg,#16a34a,#86efac);color:#052e16}.os-mobile-actions button.danger.active{background:#bfdbfe;color:#0f172a}.os-mobile-empty{border:1px dashed rgba(52,211,153,.2);border-radius:18px;padding:18px;text-align:center;color:#7d8aa3}
  `;
  document.head.appendChild(style);
}

export async function renderOsMobile(content) {
  injectStyles();
  await loadRows();
}
