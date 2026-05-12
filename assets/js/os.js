import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getCurrentUser, getUserContext } from './auth.js';

const BR = new Intl.NumberFormat('pt-BR');
const KM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const STATUS_OPTIONS = ['AGUARDAR', 'ATENDER', 'FINALIZAR'];
const LIMITE_UM_CLASSIFICADOR = 555000;
const LIMITE_COMPARTILHAR = 300000;
const LIMITE_BLOQUEIO_COMPARTILHAMENTO = 500000;
const RAIO_COMPARTILHAR_KM = 20;

const state = {
  user: null,
  context: null,
  access: { restricted: false, allowedSupervisoes: [] },
  os: [],
  colaboradores: [],
  atribuicoes: [],
  filters: { supervisao: '', status: '', busca: '' },
  sort: { field: 'numero_os', dir: 'desc' },
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
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
  const clean = String(value ?? '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmtTon(value) {
  return `${BR.format(num(value))}`;
}

function brDate(value) {
  if (!value) return '-';
  const raw = String(value).slice(0, 10);
  const [y, m, d] = raw.split('-');
  return y && m && d ? `${d}/${m}/${y}` : escapeHtml(value);
}

function first(value, fallback = '-') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function safeArray(data) { return Array.isArray(data) ? data : []; }

function haversineKm(aLat, aLng, bLat, bLng) {
  const lat1 = Number(aLat), lon1 = Number(aLng), lat2 = Number(bLat), lon2 = Number(bLng);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s1 + s2), Math.sqrt(1 - s1 - s2));
}


function hasGeo(lat, lng) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

function sameDay(a, b) {
  return String(a || '').slice(0, 10) === String(b || '').slice(0, 10);
}

function osById(id) {
  return state.os.find((row) => String(row.id) === String(id));
}

function assignedKeysForOs(osId) {
  return new Set(atribuicoesDaOs(osId).map((a) => String(a.colaborador_key || '').trim()).filter(Boolean));
}

function colaboradorBloqueadoEmOsGrande(row, colaboradorKey) {
  const key = String(colaboradorKey || '').trim();
  if (!key) return false;
  return state.atribuicoes.some((atr) => {
    if (String(atr.os_id) === String(row.id)) return false;
    if (String(atr.colaborador_key || '').trim() !== key) return false;
    const other = osById(atr.os_id);
    if (!other) return false;
    if (!sameDay(other.data_os, row.data_os)) return false;
    if (normalize(other.status_gestor || 'AGUARDAR') === 'FINALIZAR') return false;
    return num(other.remanescente) > LIMITE_BLOQUEIO_COMPARTILHAMENTO;
  });
}

function canShareSmallOs(row, other) {
  if (!row || !other) return false;
  if (num(row.remanescente) > LIMITE_COMPARTILHAR || num(other.remanescente) > LIMITE_COMPARTILHAR) return false;
  if (!hasGeo(row.ponto1_latitude, row.ponto1_longitude) || !hasGeo(other.ponto1_latitude, other.ponto1_longitude)) return false;
  const dist = haversineKm(row.ponto1_latitude, row.ponto1_longitude, other.ponto1_latitude, other.ponto1_longitude);
  return dist != null && dist <= RAIO_COMPARTILHAR_KM;
}

function onlyActiveColab(c) {
  if (!c || c.ativo === false) return false;
  const sit = normalize(c.situacao);
  return !['NAO ATIVO', 'INATIVO', 'DESLIGADO', 'DEMITIDO'].some((status) => sit.includes(status));
}

function colabKey(c) {
  return String(c.colaborador_id || c.cpf || c.id || c.nome || '').replace(/\D/g, '') || String(c.id || c.nome || '').trim();
}

function getOsKey(row) { return String(row.id || row.numero_os || ''); }

async function resolveAccess() {
  state.user = await getCurrentUser();
  try { state.context = await getUserContext(state.user?.id); } catch { state.context = null; }
  let appUser = null;
  try {
    const { data } = await supabase
      .from('app_usuarios')
      .select('id,nome,email,setor,supervisao,coordenacao,empresa,status')
      .eq('auth_user_id', state.user?.id)
      .maybeSingle();
    appUser = data || null;
  } catch {}

  const role = state.context?.user?.role || state.context?.perfil_codigo || state.context?.perfil_nome || state.context?.role || '';
  const setor = appUser?.setor || state.context?.setor || state.context?.department?.name || '';
  const isMaster = Boolean(state.context?.user?.is_master || state.context?.is_master || normalize(role) === 'MASTER');
  const isGestor = normalize(role) === 'GESTOR' || normalize(setor) === 'GESTOR' || normalize(state.context?.department?.code) === 'GESTOR';
  const allowedSupervisoes = [
    ...parseList(appUser?.supervisao),
    ...parseList(state.context?.supervisao),
    ...parseList(state.context?.supervisoes),
    ...parseList(state.context?.user?.supervisao),
    ...parseList(state.context?.user?.supervisoes),
  ];
  state.access = { restricted: !isMaster && isGestor, allowedSupervisoes: [...new Set(allowedSupervisoes)] };
}

function isAllowedSupervisao(supervisao) {
  if (!state.access.restricted) return true;
  const key = normalize(supervisao);
  return state.access.allowedSupervisoes.some((sup) => normalize(sup) === key || key.includes(normalize(sup)) || normalize(sup).includes(key));
}

function injectStyles() {
  if (document.getElementById('os-styles')) return;
  const style = document.createElement('style');
  style.id = 'os-styles';
  style.textContent = `
    .os-grid{display:grid;grid-template-columns:repeat(4,minmax(160px,1fr));gap:12px}.os-grid .field-span-2{grid-column:span 2}
    .os-table-wrap{overflow:auto;border:1px solid rgba(52,211,153,.16);border-radius:18px;background:rgba(2,6,23,.25)}
    .os-table{width:100%;min-width:1180px;border-collapse:separate;border-spacing:0;color:#e5e7eb}.os-table th{position:sticky;top:0;background:#07170f;color:#bbf7d0;text-align:left;padding:12px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid rgba(52,211,153,.18);z-index:1}.os-table th[data-sort]{cursor:pointer;user-select:none}.os-table th[data-sort]:hover{color:#fff;background:#0b2116}.os-table td{padding:11px 12px;border-bottom:1px solid rgba(148,163,184,.12);vertical-align:top;background:rgba(15,23,42,.24)}
    .os-table tr:hover td{background:rgba(22,101,52,.1)}.os-title{font-weight:900;color:#f8fafc;font-size:15px;line-height:1.25}.os-num{font-size:15px;font-weight:950}.os-meta{font-size:12px;color:#94a3b8;margin-top:4px}.os-actions{display:flex;gap:7px;flex-wrap:wrap}.os-btn{border:1px solid rgba(52,211,153,.22);background:rgba(15,23,42,.72);color:#dcfce7;border-radius:999px;padding:8px 11px;font-weight:900;cursor:pointer}.os-btn.active{background:linear-gradient(135deg,#16a34a,#86efac);color:#052e16}.os-btn.warn.active{background:#fde68a;color:#713f12}.os-btn.danger.active{background:#fecaca;color:#7f1d1d}.os-chip{display:inline-flex;align-items:center;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:900;border:1px solid rgba(148,163,184,.18);white-space:nowrap}.os-chip.ok{background:rgba(22,163,74,.13);color:#bbf7d0}.os-chip.warn{background:rgba(250,204,21,.14);color:#fde68a}.os-chip.info{background:rgba(59,130,246,.13);color:#bfdbfe}.os-chip.danger{background:rgba(239,68,68,.12);color:#fecaca}.os-zero{box-shadow:inset 4px 0 0 #facc15}.os-sug{border:1px solid rgba(52,211,153,.18);background:rgba(22,101,52,.12);border-radius:14px;padding:10px}.os-sug strong{color:#f8fafc}.os-sug .muted{font-size:12px}.os-select{width:100%;min-height:40px;border-radius:12px;border:1px solid rgba(52,211,153,.18);background:#0f172a;color:#e5e7eb;color-scheme:dark;padding:9px}.os-mini{font-size:12px;color:#a7f3d0}.os-warn-text{font-size:12px;color:#fde68a;margin-top:7px}.os-empty{border:1px dashed rgba(148,163,184,.2);border-radius:18px;padding:18px;color:#94a3b8;background:rgba(15,23,42,.16)}
    @media(max-width:900px){.os-grid{grid-template-columns:1fr}.os-grid .field-span-2{grid-column:span 1}}
  `;
  document.head.appendChild(style);
}

initProtectedPage('OS', async (content) => {
  injectStyles();
  content.innerHTML = `
    <section class="card mt-16">
      <div class="section-head"><div><h3>Ordens de Serviço da regional</h3><p class="muted">O gestor visualiza somente as O.S. liberadas para sua supervisão/regional e define se vai atender, finalizar ou aguardar.</p></div></div>
      <div class="filters-grid os-grid">
        <div class="field"><label>Supervisão</label><select id="osSupervisao" class="os-select"></select></div>
        <div class="field"><label>Status gestor</label><select id="osStatus" class="os-select"><option value="">Todos</option><option value="ATENDER">Atender</option><option value="AGUARDAR">Aguardar</option><option value="FINALIZAR">Finalizar</option></select></div>
        <div class="field field-span-2"><label>Buscar</label><input id="osBusca" class="os-select" type="text" placeholder="O.S., cliente, embarque, destino..." /></div>
      </div>
      <div class="feedback mt-16" id="osFeedback">Carregando...</div>
    </section>
    <section class="grid-cards mt-16" id="osStats"></section>
    <section class="card mt-16"><div class="section-head"><div><h3>Lista de O.S.</h3><p class="muted">A sugestão de colaborador usa a menor distância disponível do mapa operacional/base de colaboradores.</p></div><button class="btn btn-secondary" id="osReload">Atualizar</button></div><div id="osList"></div></section>
  `;

  const el = {
    supervisao: document.getElementById('osSupervisao'), status: document.getElementById('osStatus'), busca: document.getElementById('osBusca'),
    feedback: document.getElementById('osFeedback'), list: document.getElementById('osList'), stats: document.getElementById('osStats'), reload: document.getElementById('osReload'),
  };

  await resolveAccess();
  bind();
  await loadAll();

  function bind() {
    el.supervisao.addEventListener('change', () => { state.filters.supervisao = el.supervisao.value; render(); });
    el.status.addEventListener('change', () => { state.filters.status = el.status.value; render(); });
    el.busca.addEventListener('input', () => { state.filters.busca = el.busca.value.trim(); render(); });
    el.reload.addEventListener('click', loadAll);
    el.list.addEventListener('click', onListClick);
    el.list.addEventListener('change', onListChange);
  }

  async function loadAll() {
    el.feedback.textContent = 'Carregando O.S. e colaboradores...';
    try {
      await Promise.all([loadOs(), loadColaboradores()]);
      fillSupervisoes();
      render();
      el.feedback.textContent = `Carregado: ${state.os.length} O.S.`;
    } catch (error) {
      console.error(error);
      el.feedback.textContent = error.message || 'Erro ao carregar O.S.';
    }
  }

  async function loadOs() {
    let query = supabase.from('operacional_os').select('*').order('data_os', { ascending: false }).order('numero_os', { ascending: false }).limit(2000);
    const { data, error } = await query;
    if (error) throw error;
    state.os = safeArray(data).filter((row) => isAllowedSupervisao(row.supervisao));
    const ids = state.os.map((row) => row.id).filter(Boolean);
    if (!ids.length) { state.atribuicoes = []; return; }
    const atr = await supabase.from('operacional_os_colaboradores').select('*').in('os_id', ids);
    if (atr.error) throw atr.error;
    state.atribuicoes = safeArray(atr.data);
  }

  async function loadColaboradores() {
    let rows = [];
    try {
      const { data, error } = await supabase.from('operacional_colaborador_base').select('*').eq('ativo', true).limit(5000);
      if (!error) rows = data || [];
    } catch {}
    if (!rows.length) {
      const latest = await supabase.from('colaborador_snapshot').select('data_referencia').order('data_referencia', { ascending: false }).limit(1);
      const dt = latest.data?.[0]?.data_referencia;
      let q = supabase.from('colaborador_snapshot').select('*').limit(5000);
      if (dt) q = q.eq('data_referencia', dt);
      const { data, error } = await q;
      if (error) throw error;
      rows = data || [];
    }
    state.colaboradores = rows.filter(onlyActiveColab).filter((c) => !state.access.restricted || isAllowedSupervisao(c.supervisao || c.regional));
  }

  function fillSupervisoes() {
    const sups = [...new Set(state.os.map((row) => row.supervisao).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    el.supervisao.innerHTML = '<option value="">Todas liberadas</option>' + sups.map((sup) => `<option value="${escapeHtml(sup)}">${escapeHtml(sup)}</option>`).join('');
    if (state.access.restricted && sups.length === 1) {
      el.supervisao.value = sups[0];
      state.filters.supervisao = sups[0];
    }
  }

  function filteredOs() {
    const sup = normalize(state.filters.supervisao);
    const status = normalize(state.filters.status);
    const busca = normalize(state.filters.busca);
    const rows = state.os.filter((row) => {
      if (sup && normalize(row.supervisao) !== sup) return false;
      if (status && normalize(row.status_gestor || 'AGUARDAR') !== status) return false;
      const hay = normalize(`${row.numero_os} ${row.cliente} ${row.embarque} ${row.destino} ${row.contrato} ${row.produto}`);
      return !busca || hay.includes(busca);
    });
    return sortRows(rows);
  }

  function sortRows(rows) {
    const { field, dir } = state.sort || { field: 'numero_os', dir: 'desc' };
    const factor = dir === 'asc' ? 1 : -1;
    const copy = [...rows];
    copy.sort((a, b) => {
      let av;
      let bv;
      if (field === 'cliente') {
        av = normalize(a.cliente || '');
        bv = normalize(b.cliente || '');
        return av.localeCompare(bv, 'pt-BR') * factor;
      }
      if (field === 'remanescente') {
        av = num(a.remanescente);
        bv = num(b.remanescente);
      } else {
        av = num(a.numero_os);
        bv = num(b.numero_os);
      }
      if (av === bv) return String(a.cliente || '').localeCompare(String(b.cliente || ''), 'pt-BR');
      return (av - bv) * factor;
    });
    return copy;
  }

  function sortLabel(field) {
    if (state.sort?.field !== field) return '↕';
    return state.sort.dir === 'asc' ? '↑' : '↓';
  }


  function atribuicoesDaOs(osId) {
    return state.atribuicoes.filter((a) => String(a.os_id) === String(osId));
  }

  function sugestoesParaOs(row) {
    const supKey = normalize(row.supervisao);
    const osTemCoordenada = hasGeo(row.ponto1_latitude, row.ponto1_longitude);
    const jaIndicadosNaOs = assignedKeysForOs(row.id);
    const cols = state.colaboradores.filter((c) => {
      const key = colabKey(c);
      if (key && colaboradorBloqueadoEmOsGrande(row, key) && !jaIndicadosNaOs.has(key)) return false;
      const colSup = normalize(c.supervisao || c.regional);
      return !supKey || colSup.includes(supKey) || supKey.includes(colSup);
    });
    return cols.map((c) => {
      const dist = osTemCoordenada && hasGeo(c.latitude, c.longitude)
        ? haversineKm(row.ponto1_latitude, row.ponto1_longitude, c.latitude, c.longitude)
        : null;
      return { ...c, distancia_km: dist, os_tem_coordenada: osTemCoordenada };
    }).sort((a, b) => {
      const aHas = a.distancia_km != null;
      const bHas = b.distancia_km != null;
      if (aHas !== bHas) return aHas ? -1 : 1;
      if (aHas && bHas && a.distancia_km !== b.distancia_km) return a.distancia_km - b.distancia_km;
      return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
    }).slice(0, 8);
  }


  function statusClass(row) {
    const st = normalize(row.status_gestor || 'AGUARDAR');
    if (st === 'ATENDER') return 'ok';
    if (st === 'FINALIZAR') return 'danger';
    return 'warn';
  }

  function renderStats(rows = filteredOs()) {
    const atender = rows.filter((r) => normalize(r.status_gestor) === 'ATENDER').length;
    const zero = rows.filter((r) => num(r.remanescente) === 0).length;
    const ate555 = rows.filter((r) => num(r.remanescente) > 0 && num(r.remanescente) <= LIMITE_UM_CLASSIFICADOR).length;
    el.stats.innerHTML = `
      <article class="card"><h3>Total O.S.</h3><p class="metric">${rows.length}</p><p class="muted">Dentro do filtro atual.</p></article>
      <article class="card"><h3>Para atender</h3><p class="metric">${atender}</p><p class="muted">Vai para Conferência.</p></article>
      <article class="card"><h3>Remanescente zero</h3><p class="metric">${zero}</p><p class="muted">Destacadas em amarelo.</p></article>
      <article class="card"><h3>Até 555.000</h3><p class="metric">${ate555}</p><p class="muted">Indicação padrão: 1 classificador.</p></article>
    `;
  }

  function render() {
    const rows = filteredOs();
    renderStats(rows);
    if (!rows.length) {
      el.list.innerHTML = '<div class="os-empty">Nenhuma O.S. encontrada para o filtro atual.</div>';
      return;
    }
    el.list.innerHTML = `<div class="os-table-wrap"><table class="os-table"><thead><tr><th data-sort="numero_os">O.S. ${sortLabel('numero_os')}</th><th data-sort="cliente">Cliente / rota ${sortLabel('cliente')}</th><th data-sort="remanescente">Remanescente ${sortLabel('remanescente')}</th><th>Sugestão operacional</th><th>Indicação</th><th>Ação gestor</th></tr></thead><tbody>${rows.map(rowHtml).join('')}</tbody></table></div>`;
  }

  function rowHtml(row) {
    const rem = num(row.remanescente);
    const zero = rem === 0;
    const sugestoes = sugestoesParaOs(row);
    const principal = sugestoes[0];
    const atr = atribuicoesDaOs(row.id);
    const maxPadrao = rem > 0 && rem <= LIMITE_UM_CLASSIFICADOR ? 1 : Math.max(1, atr.length || 1);
    const permitirMais = Boolean(row.permitir_mais_classificadores) || atr.length > maxPadrao;
    const status = normalize(row.status_gestor || 'AGUARDAR') || 'AGUARDAR';
    const compartilhavel = rem > 0 && rem <= LIMITE_COMPARTILHAR;
    return `<tr data-os-id="${escapeHtml(row.id)}" class="${zero ? 'os-zero' : ''}">
      <td><div class="os-title os-num">${escapeHtml(row.numero_os)}</div><div class="os-meta">${brDate(row.data_os)} • ${escapeHtml(first(row.servico))}</div><div class="os-meta">${escapeHtml(first(row.supervisao))}</div>${zero ? '<div class="os-warn-text">Remanescente zerado</div>' : ''}</td>
      <td><div class="os-title">${escapeHtml(first(row.cliente))}</div><div class="os-meta">Embarque: ${escapeHtml(first(row.embarque))}</div><div class="os-meta">Destino: ${escapeHtml(first(row.destino))}</div><div class="os-meta">Contrato ${escapeHtml(first(row.contrato))} • ${escapeHtml(first(row.produto))}</div></td>
      <td><span class="os-chip ${zero ? 'warn' : rem <= LIMITE_UM_CLASSIFICADOR ? 'info' : 'ok'}">${fmtTon(rem)}</span><div class="os-meta">Lote: ${fmtTon(row.lote)} • Embarcado: ${fmtTon(row.embarcado)}</div>${compartilhavel ? `<div class="os-warn-text">Pode reaproveitar colaborador em outra O.S. até ${RAIO_COMPARTILHAR_KM} km do ponto 1.</div>` : ''}</td>
      <td>${principal ? `<div class="os-sug"><strong>${escapeHtml(principal.nome || principal.nome_colaborador || 'Colaborador')}</strong><div class="muted">${principal.distancia_km == null ? 'Sem distância calculada' : `${KM.format(principal.distancia_km)} km do ponto 1`}</div><div class="os-mini">${principal.distancia_km == null ? 'Sem distância calculada: ponto de embarque ou colaborador sem latitude/longitude.' : 'Primeiro da listagem operacional por menor distância.'}</div></div>` : '<span class="muted">Sem colaborador disponível para sugestão.</span>'}</td>
      <td>
        <select class="os-select" data-assign>
          <option value="">${atr.length ? 'Adicionar outro colaborador' : 'Selecionar colaborador'}</option>
          ${sugestoes.map((c, index) => `<option value="${escapeHtml(colabKey(c))}" data-nome="${escapeHtml(c.nome || c.nome_colaborador || '')}" data-dist="${escapeHtml(c.distancia_km ?? '')}">${index === 0 ? '⭐ ' : ''}${escapeHtml(c.nome || c.nome_colaborador || '')}${c.distancia_km == null ? '' : ` • ${KM.format(c.distancia_km)} km`}</option>`).join('')}
        </select>
        <div class="os-meta" style="margin-top:8px">${atr.length ? atr.map((a) => `<span class="os-chip ok">${escapeHtml(a.colaborador_nome)} <button class="os-btn" style="padding:2px 6px;margin-left:5px" data-remove-colab="${escapeHtml(a.id)}">×</button></span>`).join(' ') : `Padrão sugerido: ${maxPadrao} classificador${maxPadrao > 1 ? 'es' : ''}.`}</div>
        ${rem > 0 && rem <= LIMITE_UM_CLASSIFICADOR ? `<label class="os-mini" style="display:block;margin-top:9px"><input type="checkbox" data-allow-more ${permitirMais ? 'checked' : ''}/> permitir 2 ou mais colaboradores</label>` : ''}
      </td>
      <td><div class="os-actions">${STATUS_OPTIONS.map((opt) => `<button class="os-btn ${opt === 'AGUARDAR' ? 'warn' : opt === 'FINALIZAR' ? 'danger' : ''} ${status === opt ? 'active' : ''}" data-status="${opt}">${opt === 'AGUARDAR' ? 'Aguardar' : opt === 'ATENDER' ? 'Atender' : 'Finalizar'}</button>`).join('')}</div><div style="margin-top:10px"><span class="os-chip ${statusClass(row)}">${escapeHtml(status)}</span></div></td>
    </tr>`;
  }

  async function onListClick(event) {
    const sortTh = event.target.closest('[data-sort]');
    if (sortTh) {
      const field = sortTh.dataset.sort;
      const current = state.sort || { field: 'numero_os', dir: 'desc' };
      state.sort = {
        field,
        dir: current.field === field && current.dir === 'desc' ? 'asc' : 'desc',
      };
      render();
      return;
    }

    const statusBtn = event.target.closest('[data-status]');
    if (statusBtn) {
      const tr = statusBtn.closest('[data-os-id]');
      const row = state.os.find((o) => String(o.id) === String(tr.dataset.osId));
      const nextStatus = statusBtn.dataset.status;
      if (nextStatus === 'ATENDER') {
        const ok = await garantirColaboradorAntesDeAtender(row);
        if (!ok) return;
      }
      await updateOs(tr.dataset.osId, { status_gestor: nextStatus, configurada_em: new Date().toISOString() });
      return;
    }
    const removeBtn = event.target.closest('[data-remove-colab]');
    if (removeBtn) {
      const { error } = await supabase.from('operacional_os_colaboradores').delete().eq('id', removeBtn.dataset.removeColab);
      if (error) return alert(error.message);
      await loadOs(); render();
    }
  }

  async function garantirColaboradorAntesDeAtender(row) {
    if (!row) return false;
    const current = atribuicoesDaOs(row.id);
    if (current.length > 0) return true;
    const sugestao = sugestoesParaOs(row)[0];
    if (!sugestao) {
      alert('Não é possível enviar esta O.S. para Conferência sem colaborador. Cadastre coordenadas/base operacional ou selecione um colaborador antes de marcar Atender.');
      return false;
    }
    const payload = {
      os_id: row.id,
      colaborador_key: colabKey(sugestao),
      colaborador_nome: sugestao.nome || sugestao.nome_colaborador || 'Colaborador sugerido',
      distancia_km: sugestao.distancia_km == null ? null : Number(sugestao.distancia_km),
      origem_sugestao: sugestao.distancia_km == null ? 'SUGESTAO_SEM_DISTANCIA' : 'DISTANCIA_OPERACIONAL',
      indicado_por: state.user?.id || null,
    };
    const { error } = await supabase.from('operacional_os_colaboradores').upsert(payload, { onConflict: 'os_id,colaborador_key' });
    if (error) {
      alert(error.message || 'Não foi possível confirmar o colaborador sugerido.');
      return false;
    }
    await loadOs();
    return true;
  }


  async function onListChange(event) {
    const tr = event.target.closest('[data-os-id]');
    if (!tr) return;
    if (event.target.matches('[data-allow-more]')) {
      await updateOs(tr.dataset.osId, { permitir_mais_classificadores: event.target.checked, configurada_em: new Date().toISOString() });
      return;
    }
    if (event.target.matches('[data-assign]') && event.target.value) {
      const row = state.os.find((o) => String(o.id) === String(tr.dataset.osId));
      const selected = event.target.selectedOptions[0];
      const current = atribuicoesDaOs(row.id);
      const rem = num(row.remanescente);
      const allowMore = Boolean(row.permitir_mais_classificadores) || rem > LIMITE_UM_CLASSIFICADOR;
      if (rem > 0 && rem <= LIMITE_UM_CLASSIFICADOR && current.length >= 1 && !allowMore) {
        alert('Esta O.S. tem até 555.000 de remanescente. O padrão é 1 classificador. Marque a opção para permitir 2 ou mais colaboradores.');
        event.target.value = '';
        return;
      }
      const payload = {
        os_id: row.id,
        colaborador_key: event.target.value,
        colaborador_nome: selected.dataset.nome || selected.textContent,
        distancia_km: selected.dataset.dist ? Number(selected.dataset.dist) : null,
        origem_sugestao: selected.dataset.dist ? 'DISTANCIA_OPERACIONAL' : 'LISTAGEM_OPERACIONAL',
        indicado_por: state.user?.id || null,
      };
      const { error } = await supabase.from('operacional_os_colaboradores').upsert(payload, { onConflict: 'os_id,colaborador_key' });
      if (error) return alert(error.message);
      await updateOs(row.id, { configurada_em: new Date().toISOString() }, true);
      await loadOs(); render();
    }
  }

  async function updateOs(id, payload, silent = false) {
    const { error } = await supabase.from('operacional_os').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) return alert(error.message);
    const row = state.os.find((o) => String(o.id) === String(id));
    if (row) Object.assign(row, payload, { updated_at: new Date().toISOString() });
    if (!silent) render();
  }
});
