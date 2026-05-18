import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const BR = new Intl.NumberFormat('pt-BR');
function fmt(v) { return BR.format(Number(v) || 0); }
function brDate(v) { if (!v) return '-'; const [y,m,d] = String(v).slice(0,10).split('-'); return `${d}/${m}/${y}`; }
function esc(v) { return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); }
function safe(d) { return Array.isArray(d) ? d : []; }
function todayISO() { return new Date().toISOString().slice(0,10); }
function normalizeText(v) { return String(v ?? '').trim().toUpperCase(); }
function dateFromTomorrowLock() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0,10);
}

const TABS = ['os','fob','report','conferir'];
const TAB_LABELS = { os: 'O.S.', fob: 'FOB', report: 'Report', conferir: 'Conferir' };

const state = {
  tab: location.hash.replace('#','') || 'os',
  rows: [],
  fobRows: [],
  colaboradores: [],
  fobLoading: false,
  fobSaving: false,
  fobSearchOs: null,
  fobSearchError: '',
  loading: false
};

initProtectedPage('Logística', async (content) => {
  injectStyles();
  content.innerHTML = `
    <section class="card mt-16">
      <div class="log-tab-bar">${TABS.map(t => `<button class="log-tab ${state.tab===t?'active':''}" data-tab="${t}">${TAB_LABELS[t]}</button>`).join('')}</div>
    </section>
    <div id="logContent"></div>
  `;

  content.querySelector('.log-tab-bar').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    state.tab = btn.dataset.tab;
    location.hash = state.tab;
    content.querySelectorAll('.log-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
    if (state.tab === 'os' && !state.rows.length) await loadOs();
    if (state.tab === 'fob' && !state.fobRows.length) await loadFob();
    render(content);
  });

  content.addEventListener('click', async (e) => {
    const okBtn = e.target.closest('[data-ok-id]');
    if (okBtn) { await handleOk(okBtn.dataset.okId, okBtn.dataset.okType, content); return; }

    if (e.target.closest('#logReload')) { await loadOs(); render(content); return; }
    if (e.target.closest('#fobReload')) { await loadFob(); render(content); return; }
    if (e.target.closest('#fobSearchOsBtn')) { await handleBuscarOsFob(content); return; }
    if (e.target.closest('#fobAddManualBtn')) { await handleAdicionarFobManual(content); return; }

    const validBtn = e.target.closest('[data-fob-action]');
    if (validBtn) {
      await handleValidarFob(validBtn.dataset.fobId, validBtn.dataset.fobAction, content);
      return;
    }
  });

  if (state.tab === 'fob') await loadFob();
  else await loadOs();
  render(content);
});

async function loadOs() {
  state.loading = true;
  const { data } = await supabase
    .from('operacional_os')
    .select('id,numero_os,data_os,cliente,embarque,destino,supervisao,remanescente,lote,embarcado,status_gestor,status_logistica,observacao_logistica')
    .or('status_gestor.eq.FINALIZAR,observacao_logistica.ilike.KG solicitado*,remanescente.eq.0')
    .or('status_logistica.is.null,status_logistica.neq.FINALIZADA')
    .order('data_os', { ascending: false })
    .limit(1000);
  state.rows = safe(data);
  state.loading = false;
}

async function loadFob() {
  state.fobLoading = true;
  state.fobSearchError = '';
  await ensureColaboradores();

  const { data, error } = await supabase
    .from('logistica_fob')
    .select('id,data_referencia,numero_os,cliente,supervisao,funcionario,cidade,local_embarque,motivo,status_comparacao,status,visualizado,tons_movimento,tons_producao,tons_nh,observacao,observacao_gestor,origem,criado_em,validado_em,updated_at')
    .order('data_referencia', { ascending: false })
    .order('criado_em', { ascending: false })
    .limit(1500);

  if (error) {
    console.error(error);
    state.fobRows = [];
    state.fobSearchError = error.message || 'Falha ao carregar FOB.';
  } else {
    state.fobRows = safe(data);
  }
  state.fobLoading = false;
}

async function ensureColaboradores() {
  if (state.colaboradores.length) return;

  const latest = await supabase
    .from('colaborador_snapshot')
    .select('nome,cpf,supervisao,coordenacao,data_referencia')
    .order('data_referencia', { ascending: false })
    .limit(1200);

  if (!latest.error && latest.data?.length) {
    const seen = new Set();
    state.colaboradores = latest.data.filter(c => {
      const key = normalizeText(c.cpf || c.nome);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return;
  }

  const fallback = await supabase
    .from('colaboradores')
    .select('nome,cpf,supervisao,coordenacao')
    .order('nome', { ascending: true })
    .limit(1200);

  state.colaboradores = safe(fallback.data);
}

function render(content) {
  const el = content.querySelector('#logContent');
  if (!el) return;
  if (state.tab === 'os') { el.innerHTML = renderOsTab(); return; }
  if (state.tab === 'fob') { el.innerHTML = renderFobTab(); return; }
  el.innerHTML = `<section class="card mt-16"><div class="log-empty">Módulo <strong>${TAB_LABELS[state.tab]}</strong> em desenvolvimento.</div></section>`;
}

function renderOsTab() {
  if (state.loading) return `<section class="card mt-16"><p class="muted" style="padding:16px">Carregando...</p></section>`;
  if (!state.rows.length) return `<section class="card mt-16"><div class="log-empty">Nenhuma O.S. pendente para a Logística.</div></section>`;

  const kgRows = state.rows.filter(r => String(r.observacao_logistica||'').startsWith('KG solicitado'));
  const finalizarRows = state.rows.filter(r => !String(r.observacao_logistica||'').startsWith('KG solicitado') && String(r.status_gestor||'') === 'FINALIZAR');
  const saldoZeroRows = state.rows.filter(r => !String(r.observacao_logistica||'').startsWith('KG solicitado') && String(r.status_gestor||'') !== 'FINALIZAR' && Number(r.remanescente) === 0);

  return `
    <section class="card mt-16">
      <div class="section-head">
        <div><h3>O.S. para Logística</h3>
          <p class="muted">${finalizarRows.length} para finalizar · ${kgRows.length} aumento de saldo · ${saldoZeroRows.length} saldo zerado</p>
        </div>
        <button class="btn btn-secondary" id="logReload" type="button">Atualizar</button>
      </div>
      <div class="log-table-wrap">
        <table class="log-table">
          <thead><tr>
            <th style="width:10%">O.S.</th>
            <th style="width:32%">Cliente / Rota</th>
            <th style="width:13%">Remanescente</th>
            <th style="width:30%">Solicitação</th>
            <th style="width:15%">Ação</th>
          </tr></thead>
          <tbody>${state.rows.map(rowHtml).join('')}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderFobTab() {
  if (state.fobLoading) return `<section class="card mt-16"><p class="muted" style="padding:16px">Carregando FOB...</p></section>`;

  const pendentes = state.fobRows.filter(r => String(r.status || 'PENDENTE') === 'PENDENTE');
  const naoVisualizados = state.fobRows.filter(r => r.visualizado === false && String(r.status || 'PENDENTE') === 'PENDENTE');
  const validos = state.fobRows.filter(r => String(r.status || '') === 'VALIDO').length;
  const invalidos = state.fobRows.filter(r => String(r.status || '') === 'INVALIDO').length;

  return `
    <section class="card mt-16">
      <div class="section-head">
        <div>
          <h3>FOB do Gestor</h3>
          <p class="muted">Histórico permanente de FOB. Valide todos os pendentes para liberar a programação do dia seguinte.</p>
        </div>
        <button class="btn btn-secondary" id="fobReload" type="button">Atualizar</button>
      </div>

      <div class="fob-kpis">
        <div class="fob-kpi"><strong>${pendentes.length}</strong><span>Pendentes</span></div>
        <div class="fob-kpi gray"><strong>${naoVisualizados.length}</strong><span>Não visualizados</span></div>
        <div class="fob-kpi ok"><strong>${validos}</strong><span>Válidos</span></div>
        <div class="fob-kpi bad"><strong>${invalidos}</strong><span>Inválidos</span></div>
      </div>

      ${state.fobSearchError ? `<div class="log-alert bad">${esc(state.fobSearchError)}</div>` : ''}

      <details class="fob-add" open>
        <summary>+ Adicionar FOB</summary>
        <div class="fob-add-grid">
          <label>O.S.
            <div class="fob-os-line">
              <input id="fobOsInput" class="log-input" type="text" placeholder="Digite a OS" value="${esc(state.fobSearchOs?.numero_os || '')}">
              <button id="fobSearchOsBtn" class="btn btn-secondary" type="button">Buscar OS</button>
            </div>
          </label>
          <label>Data da FOB
            <input id="fobDataInput" class="log-input" type="date" value="${esc(state.fobSearchOs?.data_os || todayISO())}">
          </label>
          <label>Colaborador
            <input id="fobColabInput" class="log-input" list="fobColabList" placeholder="Digite o nome do colaborador">
            <datalist id="fobColabList">${state.colaboradores.map(c => `<option value="${esc(c.nome)}"></option>`).join('')}</datalist>
          </label>
          <label>Motivo
            <textarea id="fobMotivoInput" class="log-input" rows="2" placeholder="Motivo da FOB"></textarea>
          </label>
        </div>
        ${state.fobSearchOs ? renderOsEncontrada(state.fobSearchOs) : `<div class="log-muted-box">Digite a O.S. e clique em <strong>Buscar OS</strong> para puxar cliente, supervisão e local automaticamente.</div>`}
        <button id="fobAddManualBtn" class="log-btn-ok" type="button">Salvar FOB</button>
      </details>

      <div class="fob-list">
        ${state.fobRows.length ? state.fobRows.map(fobRowHtml).join('') : `<div class="log-empty">Nenhum FOB encontrado no histórico.</div>`}
      </div>
    </section>
  `;
}

function renderOsEncontrada(os) {
  return `<div class="fob-os-found">
    <div><small>Cliente</small><strong>${esc(os.cliente || '-')}</strong></div>
    <div><small>Supervisão</small><strong>${esc(os.supervisao || '-')}</strong></div>
    <div><small>Local / embarque</small><strong>${esc(os.embarque || os.local_embarque || '-')}</strong></div>
    <div><small>Destino</small><strong>${esc(os.destino || '-')}</strong></div>
  </div>`;
}

function fobRowHtml(row) {
  const status = String(row.status || 'PENDENTE').toUpperCase();
  const unseen = row.visualizado === false && status === 'PENDENTE';
  const cls = status === 'VALIDO' ? 'valid' : status === 'INVALIDO' ? 'invalid' : unseen ? 'unseen' : 'pending';
  const comp = String(row.status_comparacao || 'PENDENTE').toUpperCase();
  const compLabel = comp === 'OK' ? 'Comparação OK' : comp === 'DOIS EMBARQUES' ? 'Dois embarques' : 'Comparação pendente';
  const statusLabel = status === 'VALIDO' ? 'FOB válida' : status === 'INVALIDO' ? 'FOB inválida' : 'Não validada';

  return `<article class="fob-row ${cls}">
    <div class="fob-cell date"><strong>${brDate(row.data_referencia)}</strong><span>${esc(row.supervisao || '-')}</span></div>
    <div class="fob-cell main"><strong>${esc(row.cliente || '-')}</strong><span>OS: ${esc(row.numero_os || '-')}</span><span>Local: ${esc(row.local_embarque || row.cidade || '-')}</span></div>
    <div class="fob-cell person"><strong>${esc(row.funcionario || '-')}</strong><span>${esc(row.motivo || row.observacao || 'FOB pendente sem confirmação na mesma data')}</span></div>
    <div class="fob-cell status"><span class="log-chip ${comp === 'OK' ? 'ok' : comp === 'DOIS EMBARQUES' ? 'warn' : 'red'}">${compLabel}</span><span class="fob-tons">Mov.: ${fmt(row.tons_movimento)} · Prod.: ${fmt(row.tons_producao)} · NHE: ${fmt(row.tons_nh)}</span></div>
    <div class="fob-cell view"><span class="log-chip ${unseen ? 'gray' : status === 'VALIDO' ? 'ok' : status === 'INVALIDO' ? 'red' : 'warn'}">${unseen ? 'Não visualizado' : statusLabel}</span></div>
    <div class="fob-cell actions">
      <input class="log-input fob-obs" data-fob-obs="${esc(String(row.id))}" placeholder="Observação do gestor" value="${esc(row.observacao_gestor || '')}">
      <button class="fob-icon ok" title="FOB válida" data-fob-id="${esc(String(row.id))}" data-fob-action="VALIDO" type="button">✓</button>
      <button class="fob-icon bad" title="FOB inválida" data-fob-id="${esc(String(row.id))}" data-fob-action="INVALIDO" type="button">×</button>
    </div>
  </article>`;
}

function rowHtml(row) {
  const isKg = String(row.observacao_logistica||'').startsWith('KG solicitado');
  const isFinalizar = !isKg && String(row.status_gestor||'') === 'FINALIZAR';
  const isSaldoZero = !isKg && !isFinalizar && Number(row.remanescente) === 0;
  const type = isKg ? 'kg' : isSaldoZero ? 'saldo_zero' : 'finalizar';
  const badge = isKg
    ? `<span class="log-chip red">↑ KG</span><div class="log-obs">${esc(row.observacao_logistica)}</div>`
    : isSaldoZero
      ? `<span class="log-chip warn">Saldo zerado</span>`
      : `<span class="log-chip blue">$ Finalizar</span>`;
  const rem = Number(row.remanescente);
  return `<tr data-log-row="${esc(String(row.id))}">
    <td><strong>${esc(row.numero_os)}</strong><br><small class="muted">${brDate(row.data_os)}</small><br><small class="muted">${esc(row.supervisao||'-')}</small></td>
    <td><div style="font-weight:850">${esc(row.cliente||'-')}</div><div class="muted" style="font-size:12px;margin-top:3px">Emb.: ${esc(row.embarque||'-')}</div><div class="muted" style="font-size:12px">Dest.: ${esc(row.destino||'-')}</div></td>
    <td><span class="log-chip ${rem<=0?'warn':'ok'}">${fmt(rem)}</span><div class="muted" style="font-size:11px;margin-top:4px">Lote ${fmt(row.lote)}</div></td>
    <td>${badge}</td>
    <td><button class="log-btn-ok" data-ok-id="${esc(String(row.id))}" data-ok-type="${type}" type="button">OK</button></td>
  </tr>`;
}

async function handleBuscarOsFob(content) {
  const os = content.querySelector('#fobOsInput')?.value?.trim();
  if (!os) { alert('Digite a O.S. para buscar.'); return; }
  state.fobSearchError = '';

  const { data, error } = await supabase
    .from('operacional_os')
    .select('id,numero_os,data_os,cliente,embarque,destino,supervisao,remanescente,lote,embarcado')
    .eq('numero_os', os)
    .maybeSingle();

  if (error) {
    state.fobSearchOs = null;
    state.fobSearchError = error.message;
  } else if (!data) {
    state.fobSearchOs = null;
    state.fobSearchError = `O.S. ${os} não encontrada.`;
  } else {
    state.fobSearchOs = data;
  }
  render(content);
}

async function handleAdicionarFobManual(content) {
  if (state.fobSaving) return;

  const numeroOs = content.querySelector('#fobOsInput')?.value?.trim();
  const dataRef = content.querySelector('#fobDataInput')?.value || state.fobSearchOs?.data_os || todayISO();
  const funcionario = content.querySelector('#fobColabInput')?.value?.trim();
  const motivo = content.querySelector('#fobMotivoInput')?.value?.trim();

  if (!numeroOs) { alert('Digite a O.S.'); return; }
  if (!funcionario) { alert('Informe o colaborador.'); return; }
  if (!motivo) { alert('Informe o motivo da FOB.'); return; }

  state.fobSaving = true;
  const os = state.fobSearchOs || {};
  const row = {
    data: dataRef,
    os: numeroOs,
    cliente: os.cliente || null,
    supervisao: os.supervisao || null,
    funcionario,
    cidade: null,
    local: os.embarque || null,
    status: 'PENDENTE',
    motivo,
    observacao: motivo,
    tons_movimento: 0,
    tons_producao: 0,
    tons_nh: 0,
    origem: 'MANUAL_GESTOR',
    raw: { operacional_os: os }
  };

  let error = null;
  const rpc = await supabase.rpc('salvar_logistica_fob_importacao', { p_linhas: [row] });
  if (rpc.error) {
    const direct = await supabase.from('logistica_fob').insert({
      data_referencia: row.data,
      numero_os: row.os,
      cliente: row.cliente,
      supervisao: row.supervisao,
      funcionario: row.funcionario,
      cidade: row.cidade,
      local_embarque: row.local,
      status_comparacao: 'PENDENTE',
      status: 'PENDENTE',
      visualizado: false,
      motivo: row.motivo,
      observacao: row.observacao,
      tons_movimento: 0,
      tons_producao: 0,
      tons_nh: 0,
      origem: 'MANUAL_GESTOR',
      raw: row.raw
    });
    error = direct.error;
  }

  state.fobSaving = false;
  if (error) { alert(error.message); return; }

  state.fobSearchOs = null;
  await loadFob();
  render(content);
}

async function handleValidarFob(id, action, content) {
  const obs = content.querySelector(`[data-fob-obs="${CSS.escape(String(id))}"]`)?.value?.trim() || null;
  const { data: userData } = await supabase.auth.getUser();
  const patch = {
    status: action === 'VALIDO' ? 'VALIDO' : 'INVALIDO',
    visualizado: true,
    observacao_gestor: obs,
    validado_em: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  if (userData?.user?.id) patch.validado_por = userData.user.id;

  const { error } = await supabase.from('logistica_fob').update(patch).eq('id', id);
  if (error) { alert(error.message); return; }

  state.fobRows = state.fobRows.map(r => String(r.id) === String(id) ? { ...r, ...patch } : r);
  render(content);
}

async function handleOk(id, type, content) {
  const row = state.rows.find(r => String(r.id) === String(id));
  if (!row) return;
  const btn = content.querySelector(`[data-ok-id="${id}"]`);
  if (btn) { btn.disabled = true; btn.textContent = '...'; }

  const patch = type === 'kg'
    ? { observacao_logistica: null, updated_at: new Date().toISOString() }
    : { status_gestor: null, status_logistica: 'FINALIZADA', finalizado_em: new Date().toISOString(), updated_at: new Date().toISOString() };

  const { error } = await supabase.from('operacional_os').update(patch).eq('id', id);
  if (error) {
    alert(error.message);
    if (btn) { btn.disabled = false; btn.textContent = 'OK'; }
    return;
  }
  state.rows = state.rows.filter(r => String(r.id) !== String(id));
  render(content);
}

function injectStyles() {
  if (document.getElementById('log-styles')) return;
  const s = document.createElement('style');
  s.id = 'log-styles';
  s.textContent = `
    .log-tab-bar{display:flex;gap:8px;flex-wrap:wrap}
    .log-tab{background:rgba(15,23,42,.6);border:1px solid rgba(52,211,153,.18);color:#6b7280;border-radius:12px;padding:10px 22px;font-weight:900;cursor:pointer;font-size:14px;transition:background .15s}
    .log-tab.active{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16;border-color:transparent}
    .log-tab:hover:not(.active){background:rgba(22,101,52,.15);color:#bbf7d0}
    .log-table-wrap{overflow:auto;border:1px solid rgba(52,211,153,.16);border-radius:18px;background:rgba(2,6,23,.25);margin-top:16px}
    .log-table{width:100%;min-width:720px;border-collapse:separate;border-spacing:0;color:#e2e2f0}
    .log-table th{position:sticky;top:0;background:#07170f;color:#bbf7d0;text-align:left;padding:11px 13px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid rgba(52,211,153,.18);z-index:1}
    .log-table td{padding:11px 13px;border-bottom:1px solid rgba(148,163,184,.1);vertical-align:middle}
    .log-table tr:last-child td{border-bottom:0}
    .log-table tr:hover td{background:rgba(22,101,52,.07)}
    .log-chip{display:inline-flex;align-items:center;border-radius:999px;padding:5px 10px;font-size:12px;font-weight:900;white-space:nowrap}
    .log-chip.ok{background:rgba(22,163,74,.13);color:#bbf7d0;border:1px solid rgba(22,163,74,.2)}
    .log-chip.warn{background:rgba(250,204,21,.14);color:#fde68a;border:1px solid rgba(250,204,21,.2)}
    .log-chip.red{background:rgba(239,68,68,.12);color:#fca5a5;border:1px solid rgba(239,68,68,.2)}
    .log-chip.blue{background:rgba(59,130,246,.12);color:#bfdbfe;border:1px solid rgba(59,130,246,.2)}
    .log-chip.gray{background:rgba(148,163,184,.13);color:#cbd5e1;border:1px solid rgba(148,163,184,.2)}
    .log-obs{font-size:11px;color:#6b7280;margin-top:4px;line-height:1.3}
    .log-btn-ok{background:linear-gradient(135deg,#16a34a,#86efac);color:#052e16;border:0;border-radius:12px;padding:9px 22px;font-weight:950;cursor:pointer;font-size:13px;transition:opacity .15s}
    .log-btn-ok:hover{opacity:.88}
    .log-btn-ok:disabled{opacity:.45;cursor:wait}
    .log-empty{border:1px dashed rgba(148,163,184,.2);border-radius:18px;padding:32px;color:#6b7280;text-align:center}
    .log-input{width:100%;border:1px solid rgba(52,211,153,.16);background:#020617;color:#e5e7eb;border-radius:12px;padding:11px 12px;outline:none;color-scheme:dark}
    .log-input:focus{border-color:rgba(34,197,94,.55);box-shadow:0 0 0 3px rgba(34,197,94,.08)}
    .log-muted-box{border:1px dashed rgba(148,163,184,.18);border-radius:16px;padding:14px;color:#8fa1b5;background:rgba(15,23,42,.28);margin:12px 0}
    .log-alert.bad{border:1px solid rgba(239,68,68,.26);background:rgba(239,68,68,.08);color:#fecaca;border-radius:16px;padding:12px;margin:14px 0}
    .fob-kpis{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr));gap:12px;margin:16px 0}
    .fob-kpi{border:1px solid rgba(52,211,153,.14);background:linear-gradient(180deg,rgba(15,23,42,.45),rgba(2,6,23,.2));border-radius:18px;padding:14px}
    .fob-kpi strong{display:block;font-size:28px;color:#e5e7eb;line-height:1}.fob-kpi span{color:#8fa1b5;font-size:12px;font-weight:800}.fob-kpi.ok strong{color:#86efac}.fob-kpi.bad strong{color:#fca5a5}.fob-kpi.gray strong{color:#cbd5e1}
    .fob-add{border:1px solid rgba(52,211,153,.14);border-radius:18px;background:rgba(2,6,23,.18);padding:14px;margin-bottom:16px}.fob-add summary{cursor:pointer;color:#bbf7d0;font-weight:950}.fob-add-grid{display:grid;grid-template-columns:1.2fr .7fr 1fr 1.5fr;gap:12px;margin:14px 0}.fob-add label{font-size:12px;color:#8fa1b5;font-weight:900}.fob-os-line{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:6px}.fob-add label>.log-input,.fob-add label textarea,.fob-add label input[list]{margin-top:6px}
    .fob-os-found{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr));gap:10px;border:1px solid rgba(34,197,94,.18);background:rgba(22,101,52,.12);border-radius:16px;padding:12px;margin:12px 0}.fob-os-found small{display:block;color:#8fa1b5;font-size:11px}.fob-os-found strong{display:block;color:#e5e7eb;margin-top:3px}
    .fob-list{display:flex;flex-direction:column;gap:10px}.fob-row{display:grid;grid-template-columns:1fr 1.7fr 1.4fr 1.2fr .9fr 1.5fr;gap:12px;align-items:center;border:1px solid rgba(52,211,153,.12);background:rgba(15,23,42,.26);border-radius:18px;padding:14px}.fob-row.unseen{background:linear-gradient(90deg,rgba(148,163,184,.14),rgba(15,23,42,.25));border-color:rgba(148,163,184,.22)}.fob-row.valid{border-color:rgba(34,197,94,.26)}.fob-row.invalid{border-color:rgba(239,68,68,.26)}.fob-cell strong{display:block;color:#e5e7eb;font-weight:950}.fob-cell span{display:block;color:#8fa1b5;font-size:12px;margin-top:3px;line-height:1.35}.fob-cell.status .log-chip,.fob-cell.view .log-chip{display:inline-flex}.fob-tons{font-weight:800}.fob-cell.actions{display:grid;grid-template-columns:1fr 52px 52px;gap:8px}.fob-obs{min-width:170px}.fob-icon{border:0;border-radius:14px;min-height:44px;font-size:22px;font-weight:950;cursor:pointer}.fob-icon.ok{background:linear-gradient(135deg,#16a34a,#34d399);color:#052e16}.fob-icon.bad{background:rgba(127,29,29,.9);color:#fecaca}.fob-icon:hover{opacity:.88}
    @media(max-width:1100px){.fob-kpis,.fob-add-grid,.fob-os-found{grid-template-columns:1fr 1fr}.fob-row{grid-template-columns:1fr}.fob-cell.actions{grid-template-columns:1fr 52px 52px}}
    @media(max-width:680px){.fob-kpis,.fob-add-grid,.fob-os-found{grid-template-columns:1fr}.fob-os-line{grid-template-columns:1fr}.log-tab{flex:1}.fob-cell.actions{grid-template-columns:1fr 48px 48px}}
  `;
  document.head.appendChild(s);
}
