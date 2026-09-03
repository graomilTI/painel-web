// Extraído do <script type="module"> inline que vivia em adm-conferencia.html.
// Só rodava em hard refresh: o router.js (navegação SPA/soft-nav) nunca
// reparsa o HTML da página, então esse script embutido nunca executava
// quando o usuário chegava em Conferência pelo menu — só recarregando a
// página inteira. Virou arquivo próprio + entrada em extraModules no
// router.js (mesmo padrão de adm-conferencia-entry.js/-actions-clean.js)
// pra rodar nos dois casos.
import { supabase as raw } from './supabaseClient.js';
import { loadColaboradoresRegional } from './programacao-equipe.js?v=20260730-indisp-legado';

const labels = { SEM_STATUS: 'Pendente', DISPONIVEL: 'Disponível', INATIVAR: 'Inativação solicitada', ATESTADO: 'Atestado', FALTA: 'Falta', FERIAS: 'Férias', FOLGA: 'Folga' };
const statusCodes = ['SEM_STATUS', 'DISPONIVEL', 'INATIVAR', 'ATESTADO', 'FALTA', 'FERIAS', 'FOLGA'];
const state = { rows: [], sort: ['data_referencia', 'desc'], filters: { data: '', regional: '', colaborador: '', status: '' }, token: 0, loading: false, statusHtml: null, statusValue: '' };

const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const idKey = (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length >= 9 ? d : String(v || '').trim(); };
const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const br = (v) => { const p = String(v || '').slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '-'; };
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const active = () => !!document.querySelector('.conf-tab.active[data-tab="disponiveis"]');
const top = () => ({ inicio: document.querySelector('#conf-inicio')?.value || today(), fim: document.querySelector('#conf-fim')?.value || document.querySelector('#conf-inicio')?.value || today(), regional: document.querySelector('#conf-regional')?.value || '', colaborador: document.querySelector('#conf-colaborador')?.value || '', status: document.querySelector('#conf-status')?.value || '' });
const code = (v) => { const s = norm(v).replaceAll(' ', '_'); return statusCodes.includes(s) ? s : (s || 'SEM_STATUS'); };
const statusOptions = (sel = '') => `<option value="">Todos</option>${statusCodes.map((s) => `<option value="${s}" ${s === sel ? 'selected' : ''}>${labels[s]}</option>`).join('')}`;

function styles() {
  if (document.querySelector('#confSemOsStyles')) return;
  const s = document.createElement('style'); s.id = 'confSemOsStyles'; s.textContent = `
    .conf-sem-os{min-width:840px!important}.conf-sem-os thead tr:first-child th{top:0!important;z-index:4!important}
    .conf-sem-os-filter th{top:42px!important;z-index:3!important;padding:7px 10px!important;background:#071913!important;text-transform:none!important;letter-spacing:0!important}
    .conf-sem-os-input{width:100%;height:34px;box-sizing:border-box;border:1px solid rgba(110,231,183,.16);border-radius:8px;background:#06150f;color:#e8f7ef;padding:0 9px;font-size:11.5px;outline:none;color-scheme:dark}
    .conf-sem-os-sort{width:100%;display:inline-flex;align-items:center;gap:7px;border:0;background:transparent;color:inherit;font:inherit;font-weight:900;text-transform:uppercase;letter-spacing:.06em;cursor:pointer;padding:0}
    .conf-sem-os-chip{display:inline-flex;border-radius:999px;padding:6px 9px;border:1px solid rgba(148,163,184,.16);font-size:11px;font-weight:850;white-space:nowrap}
    .conf-sem-os-chip.DISPONIVEL{color:#bfdbfe;background:rgba(59,130,246,.12)}.conf-sem-os-chip.FERIAS{color:#bbf7d0;background:rgba(34,197,94,.12)}
    .conf-sem-os-chip.ATESTADO{color:#fde68a;background:rgba(245,158,11,.10)}.conf-sem-os-chip.FALTA,.conf-sem-os-chip.INATIVAR{color:#fecaca;background:rgba(239,68,68,.10)}
    .conf-sem-os-chip.FOLGA{color:#cbd5e1;background:rgba(148,163,184,.08)}
    .conf-sem-os-chip.SEM_STATUS{color:#fdba74;background:rgba(251,146,60,.12)}
  `; document.head.appendChild(s);
}

function syncStatus() {
  const el = document.querySelector('#conf-status'); if (!el) return;
  if (active()) {
    if (el.dataset.semOs !== '1') { state.statusHtml = el.innerHTML; state.statusValue = el.value; el.innerHTML = statusOptions(); el.value = ''; el.dataset.semOs = '1'; }
  } else if (el.dataset.semOs === '1') {
    el.innerHTML = state.statusHtml || '<option value="">Todos</option>'; el.value = [...el.options].some((o) => o.value === state.statusValue) ? state.statusValue : ''; delete el.dataset.semOs;
  }
}

function lookup(rows) {
  const id = new Map(); const name = new Map();
  for (const r of rows || []) { const p = String(r.programacao_id || ''); const i = idKey(r.colaborador_id); const n = norm(r.nome_colaborador); if (p && i) id.set(`${p}::${i}`, r); if (p && n) name.set(`${p}::${n}`, r); }
  return { id, name };
}
function find(map, p, c) { const i = idKey(c.colaboradorId || c.colaborador_id || c.cpf || c.id); const n = norm(c.nome || c.nome_colaborador); return map.id.get(`${p}::${i}`) || map.name.get(`${p}::${n}`) || null; }

async function load() {
  const f = top(); let ini = f.inicio; let fim = f.fim; if (ini > fim) [ini, fim] = [fim, ini];
  const { data: programas, error } = await raw.from('programacao_dia').select('id,data_referencia,supervisao').gte('data_referencia', ini).lte('data_referencia', fim).limit(5000); if (error) throw error;
  const reg = norm(f.regional); const ps = (programas || []).filter((p) => !reg || norm(p.supervisao) === reg); const ids = ps.map((p) => p.id).filter(Boolean); if (!ids.length) return [];
  const [sitRes, eqRes, inaRes] = await Promise.all([
    raw.from('programacao_colaboradores').select('*').in('programacao_id', ids).limit(10000),
    raw.from('programacao_equipe').select('programacao_id,colaborador_id,nome_colaborador,confirmado').in('programacao_id', ids).limit(10000),
    raw.from('programacao_inativacao_solicitacoes').select('programacao_id,colaborador_id,nome_colaborador,status').in('programacao_id', ids).eq('status', 'PENDENTE').limit(5000),
  ]);
  if (sitRes.error) throw sitRes.error; if (eqRes.error) throw eqRes.error;
  const sit = lookup(sitRes.data || []); const ina = lookup(inaRes.data || []); const byDate = new Map();
  for (const p of ps) { const d = String(p.data_referencia || '').slice(0, 10); if (!byDate.has(d)) byDate.set(d, []); byDate.get(d).push(p); }
  const out = [];
  // O registro feito pelo gestor em "Sem O.S." e a fonte de verdade.
  // Antes, a tela primeiro tentava reconstruir o quadro pelo cadastro
  // atual da regional; se o colaborador nao voltasse nessa consulta
  // (cadastro historico, CPF/supervisao divergente etc.), o motivo salvo
  // existia no banco mas nunca chegava a aba Disponiveis.
  const programaPorId = new Map(ps.map((p) => [String(p.id), p]));
  const vinculadoPorPrograma = new Set((eqRes.data || []).flatMap((r) => {
    const p = String(r.programacao_id || ''); const i = idKey(r.colaborador_id); const n = norm(r.nome_colaborador); const keys = [];
    if (p && i) keys.push(`${p}::ID::${i}`); if (p && n) keys.push(`${p}::NOME::${n}`); return keys;
  }));
  for (const s of (sitRes.data || [])) {
    const p = programaPorId.get(String(s.programacao_id || '')); if (!p) continue;
    const i = idKey(s.colaborador_id); const n = norm(s.nome_colaborador);
    if (vinculadoPorPrograma.has(`${p.id}::ID::${i}`) || vinculadoPorPrograma.has(`${p.id}::NOME::${n}`)) continue;
    const inaRow = find(ina, String(p.id), s); const sc = inaRow ? 'INATIVAR' : code(s.disponibilidade);
    // Sem motivo/situacao registrado pelo gestor em "Sem O.S." (nenhum botao
    // clicado) e uma decisao pendente, nao um residuo pra esconder — deve
    // aparecer como Pendente pra sinalizar que falta o gestor decidir.
    out.push({ data_referencia: String(p.data_referencia || '').slice(0, 10), regional: p.supervisao || s.supervisao || s.coordenacao || '-', colaborador: s.nome_colaborador || '-', status_code: sc, status_label: labels[sc] || String(s.disponibilidade || sc).replaceAll('_', ' '), id: i || n });
  }
  for (const [d, pDia] of byDate) {
    const sups = [...new Set(pDia.map((p) => p.supervisao).filter(Boolean))];
    const candidatos = await loadColaboradoresRegional(sups.length === 1 ? sups[0] : sups); const supSet = new Set(sups.map(norm));
    const equipe = (eqRes.data || []).filter((r) => pDia.some((p) => String(p.id) === String(r.programacao_id)));
    const cIds = new Set(equipe.map((r) => idKey(r.colaborador_id)).filter(Boolean)); const cNames = new Set(equipe.map((r) => norm(r.nome_colaborador)).filter(Boolean));
    const pBySup = new Map(pDia.map((p) => [norm(p.supervisao), p]));
    for (const c of (candidatos || []).filter((c) => supSet.has(norm(c.supervisao)))) {
      const i = idKey(c.colaboradorId || c.colaborador_id || c.cpf || c.id); const n = norm(c.nome || c.nome_colaborador); if (cIds.has(i) || cNames.has(n)) continue;
      const p = pBySup.get(norm(c.supervisao)); if (!p) continue; const s = find(sit, String(p.id), c); const inaRow = find(ina, String(p.id), c); const sc = inaRow ? 'INATIVAR' : code(s?.disponibilidade);
      out.push({ data_referencia: d, regional: p.supervisao || c.supervisao || c.coordenacao || '-', colaborador: c.nome || c.nome_colaborador || '-', status_code: sc, status_label: labels[sc] || String(s?.disponibilidade || sc).replaceAll('_', ' '), id: i || n });
    }
  }
  const dd = new Map(); for (const r of out) { const k = `${r.data_referencia}::${norm(r.regional)}::${r.id}`; const old = dd.get(k); if (!old || old.status_code === 'SEM_STATUS' || r.status_code === 'INATIVAR') dd.set(k, r); } return [...dd.values()];
}

function rows() {
  const f = top(); const lr = norm(state.filters.regional); const lc = norm(state.filters.colaborador); const tr = norm(f.regional); const tc = norm(f.colaborador);
  const a = state.rows.filter((r) => (!tr || norm(r.regional) === tr) && (!tc || norm(r.colaborador).includes(tc)) && (!f.status || r.status_code === f.status) && (!state.filters.data || r.data_referencia === state.filters.data) && (!lr || norm(r.regional).includes(lr)) && (!lc || norm(r.colaborador).includes(lc)) && (!state.filters.status || r.status_code === state.filters.status));
  const [col, dir] = state.sort; const mul = dir === 'desc' ? -1 : 1; return a.sort((x, y) => { const xv = col === 'status' ? x.status_label : x[col]; const yv = col === 'status' ? y.status_label : y[col]; const c = String(xv || '').localeCompare(String(yv || ''), 'pt-BR', { sensitivity: 'base', numeric: true }); return c ? c * mul : String(x.colaborador).localeCompare(String(y.colaborador), 'pt-BR'); });
}
function th(col, label) { const on = state.sort[0] === col; const ic = on ? (state.sort[1] === 'asc' ? '↑' : '↓') : '↕'; return `<button class="conf-sem-os-sort" data-sem-sort="${col}" type="button">${label}<span>${ic}</span></button>`; }
function render(focus = '') {
  if (!active()) return; syncStatus(); styles(); const t = document.querySelector('#conf-table'); if (!t) return; const rr = rows();
  t.innerHTML = `<div class="conf-table-wrap"><table class="conf-table conf-sem-os"><thead><tr><th>${th('data_referencia', 'Data')}</th><th>${th('regional', 'Regional')}</th><th>${th('colaborador', 'Colaborador')}</th><th>${th('status', 'Status')}</th></tr><tr class="conf-sem-os-filter"><th><input class="conf-sem-os-input" type="date" data-sem-filter="data" value="${esc(state.filters.data)}"></th><th><input class="conf-sem-os-input" type="search" data-sem-filter="regional" placeholder="Filtrar regional" value="${esc(state.filters.regional)}"></th><th><input class="conf-sem-os-input" type="search" data-sem-filter="colaborador" placeholder="Filtrar colaborador" value="${esc(state.filters.colaborador)}"></th><th><select class="conf-sem-os-input" data-sem-filter="status">${statusOptions(state.filters.status)}</select></th></tr></thead><tbody>${rr.length ? rr.map((r) => `<tr><td>${br(r.data_referencia)}</td><td><strong>${esc(r.regional)}</strong></td><td><strong>${esc(r.colaborador)}</strong></td><td><span class="conf-sem-os-chip ${esc(r.status_code)}">${esc(r.status_label)}</span></td></tr>`).join('') : '<tr><td class="conf-empty" colspan="4">Nenhum colaborador sem O.S. para os filtros selecionados.</td></tr>'}</tbody></table></div>`;
  if (focus) { const e = t.querySelector(`[data-sem-filter="${focus}"]`); e?.focus(); if (e && typeof e.setSelectionRange === 'function') { try { e.setSelectionRange(e.value.length, e.value.length); } catch { /* input sem seleção de texto (ex.: type=date) */ } } }
}
async function reload() {
  if (!active()) return; const token = ++state.token; state.loading = true; syncStatus(); const t = document.querySelector('#conf-table'); if (t) t.innerHTML = '<div class="conf-empty" style="padding:28px">Carregando colaboradores sem O.S.…</div>';
  try {
    const r = await load(); if (token !== state.token || !active()) return; state.rows = r; render();
  } catch (e) {
    console.error('[conf-sem-os]', e); if (t) t.innerHTML = `<div class="conf-empty" style="padding:28px;color:#fecaca">Não foi possível carregar Sem O.S.: ${esc(e.message || e)}</div>`;
  } finally {
    if (token === state.token) state.loading = false;
  }
}
function exportCsv() {
  const rr = rows(); if (!rr.length) return;
  const lines = [['Data', 'Regional', 'Colaborador', 'Status'], ...rr.map((r) => [br(r.data_referencia), r.regional, r.colaborador, r.status_label])].map((a) => a.map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`).join(';')).join('\n');
  const u = URL.createObjectURL(new Blob([`﻿${lines}`], { type: 'text/csv;charset=utf-8;' })); const a = document.createElement('a'); a.href = u; a.download = 'conferencia-disponiveis.csv'; a.click(); URL.revokeObjectURL(u);
}

let timer; const later = (ms = 20) => { clearTimeout(timer); timer = setTimeout(reload, ms); };
document.addEventListener('click', (e) => {
  const tab = e.target.closest('.conf-tab'); if (tab) { setTimeout(() => { syncStatus(); if (tab.dataset.tab === 'disponiveis') later(0); }, 0); return; }
  if (active() && e.target.closest('#conf-export-csv')) { e.preventDefault(); e.stopImmediatePropagation(); exportCsv(); return; }
  const s = e.target.closest('[data-sem-sort]'); if (active() && s) { e.preventDefault(); e.stopPropagation(); const c = s.dataset.semSort; if (state.sort[0] === c) state.sort[1] = state.sort[1] === 'asc' ? 'desc' : 'asc'; else state.sort = [c, c === 'data_referencia' ? 'desc' : 'asc']; render(); return; }
  if (active() && e.target.closest('#conf-refresh,#conf-clear')) later(80);
}, true);
document.addEventListener('input', (e) => { const f = e.target.closest('[data-sem-filter]'); if (active() && f) { state.filters[f.dataset.semFilter] = f.value; render(f.dataset.semFilter); return; } if (active() && e.target.matches('#conf-colaborador')) render(); }, true);
document.addEventListener('change', (e) => { if (!active()) return; if (e.target.matches('#conf-inicio,#conf-fim,#conf-regional')) later(); else if (e.target.matches('#conf-status')) render(); }, true);
document.addEventListener('submit', (e) => { if (active() && e.target.matches('#conf-filters')) later(80); }, true);
new MutationObserver(() => { syncStatus(); if (active() && !state.loading) { const t = document.querySelector('#conf-table'); if (t && !t.querySelector('.conf-sem-os')) later(30); } }).observe(document.body, { childList: true, subtree: true });
styles();
