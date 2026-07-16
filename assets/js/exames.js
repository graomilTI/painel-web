import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { searchColaboradores } from './colaboradoresCache.js';

const TABS = [
  { id: 'admissional', label: 'Admissional' },
  { id: 'periodico', label: 'Periódico' },
  { id: 'clinicas', label: 'Clínicas SST' },
];

const STATUS_EXAME = {
  agendado: { label: 'Agendado' },
  realizado: { label: 'Realizado' },
  apto: { label: 'Apto' },
  inapto: { label: 'Inapto' },
  vencido: { label: 'Vencido' },
};

const state = { tab: 'admissional', exames: [], ctx: null };

const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const brDate = (v) => { const [y, m, d] = String(v || '').slice(0, 10).split('-'); return y && m && d ? `${d}/${m}/${y}` : '-'; };
const today = () => new Date().toISOString().slice(0, 10);

function statusPill(status) {
  const label = STATUS_EXAME[status]?.label || status || '-';
  const ok = status === 'apto' || status === 'realizado';
  const bad = status === 'inapto' || status === 'vencido';
  const cor = ok ? ['#bbf7d0', 'rgba(22,101,52,.18)'] : bad ? ['#fecaca', 'rgba(220,38,38,.12)'] : ['#fde68a', 'rgba(245,158,11,.1)'];
  return `<span style="display:inline-flex;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:800;color:${cor[0]};background:${cor[1]};border:1px solid rgba(148,163,184,.2)">${esc(label)}</span>`;
}

function styles() {
  return `<style>
    .ex-tabs{display:flex;gap:8px;flex-wrap:wrap}
    .ex-tabs .active{background:#166534!important;color:#fff!important}
    .ex-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px}
    .ex-table{width:100%;border-collapse:collapse;min-width:640px}
    .ex-table th,.ex-table td{padding:14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}
    .ex-table th{font-size:12px;color:var(--muted);text-transform:uppercase}
    .ex-empty{text-align:center;color:var(--muted)}
    .ex-modal{position:fixed;inset:0;background:rgba(2,6,23,.75);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}
    .ex-modal.open{display:flex}
    .ex-modal-card{width:min(640px,100%);max-height:90vh;overflow:auto;background:#15152a;border:1px solid rgba(255,255,255,.06);border-radius:22px;padding:24px;color:#e2e2f0}
    .ex-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .ex-grid input,.ex-grid textarea,.ex-grid select{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark}
    .ex-full{grid-column:1/-1}
    .ex-actions{display:flex;gap:10px;flex-wrap:wrap}
    .ex-feedback{font-weight:700;display:block}
    .ex-feedback.err{color:#fecaca}
  </style>`;
}

function tabsHtml() {
  return `<div class="ex-tabs mt-16">${TABS.map((t) => `<button class="btn btn-secondary${t.id === state.tab ? ' active' : ''}" data-ex-tab="${t.id}" type="button">${esc(t.label)}</button>`).join('')}</div>`;
}

async function safe(fn, fallback = []) {
  try { const { data, error } = await fn(); if (error) throw error; return data || fallback; }
  catch (e) { console.warn('[Exames]', e); return fallback; }
}

function colabAutocomplete(modal, inputSel, sugSel, onPick) {
  const input = modal.querySelector(inputSel);
  const sug = modal.querySelector(sugSel);
  let debounce = null;
  input.addEventListener('input', () => {
    onPick(null);
    const q = input.value.trim();
    if (q.length < 2) { sug.style.display = 'none'; return; }
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      const lista = await searchColaboradores(q, { limite: 10 });
      if (!lista.length) { sug.style.display = 'none'; return; }
      sug.innerHTML = lista.map((c, idx) => `<button type="button" data-idx="${idx}" style="display:block;width:100%;text-align:left;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:10px;padding:8px;margin-bottom:4px;cursor:pointer">${esc(c.nome)}</button>`).join('');
      sug.style.display = 'block';
      sug.querySelectorAll('button').forEach((b) => b.onmousedown = (ev) => { ev.preventDefault(); const c = lista[Number(b.dataset.idx)]; input.value = c.nome; sug.style.display = 'none'; onPick(c); });
    }, 250);
  });
}

// ---------- Admissional / Periódico (mesma tabela rh_exames, filtrada por tipo) ----------

async function loadExames(tipo) {
  state.exames = await safe(() => supabase.from('rh_exames').select('*').eq('tipo', tipo).order('data_agendada', { ascending: false }).limit(200));
}

function renderExamesTable(bodyId) {
  const body = document.getElementById(bodyId);
  if (!body) return;
  if (!state.exames.length) {
    body.innerHTML = `<tr><td colspan="5" class="ex-empty">Nenhum exame encontrado.</td></tr>`;
    return;
  }
  body.innerHTML = state.exames.map((e) => `<tr>
    <td><b>${esc(e.colaborador_nome)}</b></td>
    <td>${esc(e.clinica_nome || '-')}</td>
    <td>${brDate(e.data_agendada)}${e.tipo === 'periodico' && e.data_vencimento ? `<br><small class="muted">Vence: ${brDate(e.data_vencimento)}</small>` : ''}</td>
    <td>${statusPill(e.status)}</td>
    <td><select data-ex-status="${esc(e.id)}">${Object.entries(STATUS_EXAME).map(([k, v]) => `<option value="${k}" ${k === e.status ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></td>
  </tr>`).join('');
  body.querySelectorAll('[data-ex-status]').forEach((sel) => sel.onchange = async () => {
    const patch = { status: sel.value, updated_at: new Date().toISOString() };
    if (sel.value === 'realizado' || sel.value === 'apto' || sel.value === 'inapto') patch.data_realizada = today();
    await supabase.from('rh_exames').update(patch).eq('id', sel.dataset.exStatus);
    await loadExames(state.exames.find((e) => String(e.id) === sel.dataset.exStatus)?.tipo);
    renderExamesTable(bodyId);
  });
}

function openNovoExameModal(tipo, onSaved) {
  const modal = document.getElementById('exModal');
  let selecionado = null;
  const titulo = tipo === 'admissional' ? 'Encaminhar para Exame Admissional' : 'Agendar Exame Periódico';
  modal.innerHTML = `<div class="ex-modal-card">
    <div class="section-head"><div><h3>${esc(titulo)}</h3></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="mt-16" style="position:relative">
      <label class="ex-full">Colaborador *<input id="exColabInput" type="text" placeholder="Digite o nome para pesquisar..." autocomplete="off"></label>
      <div id="exColabSug" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:50;background:#071b13;border:1px solid var(--line);border-radius:14px;padding:6px;max-height:200px;overflow:auto;margin-top:4px"></div>
    </div>
    <div class="ex-grid mt-16">
      <label class="ex-full">Clínica<input id="exClinica" type="text" placeholder="Nome da clínica (ver aba Clínicas SST)"></label>
      <label>Data agendada<input id="exDataAgendada" type="date" value="${today()}"></label>
      ${tipo === 'periodico' ? '<label>Vencimento<input id="exVencimento" type="date"></label>' : ''}
      <label class="ex-full">Observações<textarea id="exObs" rows="2"></textarea></label>
    </div>
    <div class="ex-actions mt-16"><button class="btn btn-primary" id="exSalvar" type="button">Salvar</button><button class="btn btn-secondary" id="exCancelar" type="button">Cancelar</button></div>
    <span class="ex-feedback mt-8" id="exFeedback"></span>
  </div>`;
  modal.classList.add('open');
  colabAutocomplete(modal, '#exColabInput', '#exColabSug', (c) => { selecionado = c; });
  modal.querySelector('#mClose').onclick = () => modal.classList.remove('open');
  modal.querySelector('#exCancelar').onclick = () => modal.classList.remove('open');
  modal.querySelector('#exSalvar').onclick = async () => {
    const fb = modal.querySelector('#exFeedback');
    const nome = selecionado?.nome || modal.querySelector('#exColabInput').value.trim();
    if (!nome) { fb.textContent = 'Selecione o colaborador.'; fb.classList.add('err'); return; }
    try {
      const payload = {
        colaborador_id: selecionado?.id || null,
        colaborador_nome: nome,
        tipo,
        clinica_nome: modal.querySelector('#exClinica').value.trim() || null,
        data_agendada: modal.querySelector('#exDataAgendada').value || null,
        data_vencimento: tipo === 'periodico' ? (modal.querySelector('#exVencimento').value || null) : null,
        observacoes: modal.querySelector('#exObs').value.trim() || null,
        status: 'agendado',
        created_by: state.ctx?.user?.id || null,
      };
      const { error } = await supabase.from('rh_exames').insert(payload);
      if (error) throw error;
      modal.classList.remove('open');
      onSaved();
    } catch (e) { fb.textContent = e.message; fb.classList.add('err'); }
  };
}

function renderExameTab(area, tipo) {
  const titulo = tipo === 'admissional' ? 'Encaminhamento Admissional' : 'Exames Periódicos';
  const desc = tipo === 'admissional' ? 'Encaminhamento de colaboradores para exame admissional.' : 'Controle de exames periódicos e vencimentos.';
  const btnLabel = tipo === 'admissional' ? '+ Encaminhar' : '+ Agendar';
  area.innerHTML = `<div class="section-head mt-16"><div><h3>${esc(titulo)}</h3><p class="muted">${esc(desc)}</p></div><button class="btn btn-primary" id="exNovo" type="button">${esc(btnLabel)}</button></div>
  <div class="ex-table-wrap mt-16"><table class="ex-table"><thead><tr><th>Colaborador</th><th>Clínica</th><th>Data</th><th>Status</th><th>Atualizar</th></tr></thead><tbody id="exBody_${tipo}"><tr><td colspan="5" class="ex-empty">Carregando...</td></tr></tbody></table></div>`;
  const carregar = async () => { await loadExames(tipo); renderExamesTable(`exBody_${tipo}`); };
  area.querySelector('#exNovo').onclick = () => openNovoExameModal(tipo, carregar);
  carregar();
}

// ---------- Clínicas SST (delega para clinicas-sst.js) ----------

async function renderClinicasTab(area) {
  area.innerHTML = `<div class="ex-empty mt-16">Carregando...</div>`;
  document.documentElement.classList.add('is-route-transitioning');
  try {
    const mod = await import('./clinicas-sst.js');
    area.innerHTML = '';
    await mod.renderContent(area);
  } finally {
    document.documentElement.classList.remove('is-route-transitioning');
  }
}

// ---------- Boot ----------

async function renderTab(container) {
  container.querySelectorAll('[data-ex-tab]').forEach((b) => b.classList.toggle('active', b.dataset.exTab === state.tab));
  const area = container.querySelector('#exTabContent');
  if (!area) return;
  area.innerHTML = `<div class="ex-empty mt-16">Carregando...</div>`;
  if (state.tab === 'admissional') renderExameTab(area, 'admissional');
  else if (state.tab === 'periodico') renderExameTab(area, 'periodico');
  else if (state.tab === 'clinicas') renderClinicasTab(area);
}

export async function renderContent(content, userContext) {
  state.ctx = userContext;
  content.innerHTML = `${styles()}<section class="hero-card"><div><div class="eyebrow">Recursos Humanos</div><h2>Exames</h2><p>Encaminhamento admissional, exames periódicos e clínicas de referência.</p></div><div class="hero-badge-wrap"><span class="hero-badge">RH</span></div></section>
  ${tabsHtml()}
  <div id="exTabContent"></div>
  <div class="ex-modal" id="exModal"></div>`;
  content.querySelectorAll('[data-ex-tab]').forEach((b) => b.onclick = () => { state.tab = b.dataset.exTab; renderTab(content); });
  await renderTab(content);
}

initProtectedPage('Exames', renderContent);
