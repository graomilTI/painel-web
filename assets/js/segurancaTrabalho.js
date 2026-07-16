import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { searchColaboradores } from './colaboradoresCache.js';

const TABS = [
  { id: 'epis', label: 'EPIs' },
  { id: 'cat', label: 'CAT' },
];

const STATUS_CAT = {
  aberta: { label: 'Aberta' },
  em_analise: { label: 'Em análise' },
  encerrada: { label: 'Encerrada' },
};

const state = { tab: 'epis', cats: [], ctx: null };

const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const brDate = (v) => { const [y, m, d] = String(v || '').slice(0, 10).split('-'); return y && m && d ? `${d}/${m}/${y}` : '-'; };
const today = () => new Date().toISOString().slice(0, 10);

function statusPill(status, map) {
  const label = map?.[status]?.label || status || '-';
  const cor = status === 'encerrada' ? ['#bbf7d0', 'rgba(22,101,52,.18)'] : ['#fde68a', 'rgba(245,158,11,.1)'];
  return `<span style="display:inline-flex;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:800;color:${cor[0]};background:${cor[1]};border:1px solid rgba(148,163,184,.2)">${esc(label)}</span>`;
}

function styles() {
  return `<style>
    .st-tabs{display:flex;gap:8px;flex-wrap:wrap}
    .st-tabs .active{background:#166534!important;color:#fff!important}
    .st-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px}
    .st-table{width:100%;border-collapse:collapse;min-width:640px}
    .st-table th,.st-table td{padding:14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}
    .st-table th{font-size:12px;color:var(--muted);text-transform:uppercase}
    .st-empty{text-align:center;color:var(--muted)}
    .st-modal{position:fixed;inset:0;background:rgba(2,6,23,.75);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}
    .st-modal.open{display:flex}
    .st-modal-card{width:min(640px,100%);max-height:90vh;overflow:auto;background:#15152a;border:1px solid rgba(255,255,255,.06);border-radius:22px;padding:24px;color:#e2e2f0}
    .st-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .st-grid input,.st-grid textarea,.st-grid select{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark}
    .st-full{grid-column:1/-1}
    .st-actions{display:flex;gap:10px;flex-wrap:wrap}
    .st-feedback{font-weight:700;display:block}
    .st-feedback.err{color:#fecaca}
  </style>`;
}

function tabsHtml() {
  return `<div class="st-tabs mt-16">${TABS.map((t) => `<button class="btn btn-secondary${t.id === state.tab ? ' active' : ''}" data-st-tab="${t.id}" type="button">${esc(t.label)}</button>`).join('')}</div>`;
}

async function safe(fn, fallback = []) {
  try { const { data, error } = await fn(); if (error) throw error; return data || fallback; }
  catch (e) { console.warn('[Segurança do Trabalho]', e); return fallback; }
}

// ---------- EPIs (delega para epiRh.js) ----------

async function renderEpisTab(area) {
  area.innerHTML = `<div class="st-empty mt-16">Carregando...</div>`;
  document.documentElement.classList.add('is-route-transitioning');
  try {
    await import('./epiRhPresetPatch.js');
    const mod = await import('./epiRh.js');
    area.innerHTML = '';
    await mod.renderContent(area, state.ctx);
  } finally {
    document.documentElement.classList.remove('is-route-transitioning');
  }
}

// ---------- CAT ----------

async function loadCats() {
  state.cats = await safe(() => supabase.from('rh_cat').select('*').order('data_acidente', { ascending: false }).limit(200));
  renderCatsTable();
}

function renderCatsTable() {
  const body = document.getElementById('stCatBody');
  if (!body) return;
  if (!state.cats.length) {
    body.innerHTML = `<tr><td colspan="5" class="st-empty">Nenhuma CAT registrada. Clique em <b>+ Abrir CAT</b> para registrar um acidente.</td></tr>`;
    return;
  }
  body.innerHTML = state.cats.map((c) => `<tr>
    <td><b>${esc(c.colaborador_nome)}</b></td>
    <td>${brDate(c.data_acidente)}</td>
    <td>${esc(c.tipo === 'trajeto' ? 'Trajeto' : 'Típico')}</td>
    <td>${statusPill(c.status, STATUS_CAT)}</td>
    <td><button class="btn btn-small btn-secondary" data-cat-ver="${esc(c.id)}" type="button">Ver</button></td>
  </tr>`).join('');
  body.querySelectorAll('[data-cat-ver]').forEach((b) => b.onclick = () => openCatModal(b.dataset.catVer));
}

function openNovaCatModal() {
  const modal = document.getElementById('stModal');
  let selecionado = null;
  let debounce = null;
  modal.innerHTML = `<div class="st-modal-card">
    <div class="section-head"><div><h3>Abrir CAT</h3><p class="muted">Comunicação de Acidente de Trabalho.</p></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="mt-16" style="position:relative">
      <label class="st-full">Colaborador *<input id="catColabInput" type="text" placeholder="Digite o nome para pesquisar..." autocomplete="off"></label>
      <div id="catColabSug" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:50;background:#071b13;border:1px solid var(--line);border-radius:14px;padding:6px;max-height:200px;overflow:auto;margin-top:4px"></div>
    </div>
    <div class="st-grid mt-16">
      <label>Data do acidente *<input id="catData" type="date" value="${today()}"></label>
      <label>Tipo<select id="catTipo"><option value="tipico">Típico</option><option value="trajeto">Trajeto</option></select></label>
      <label>CID<input id="catCid" type="text"></label>
      <label>Dias de afastamento<input id="catDias" type="number" min="0"></label>
      <label class="st-full">Protocolo (se já emitido)<input id="catProtocolo" type="text"></label>
      <label class="st-full">Descrição do acidente<textarea id="catDesc" rows="3"></textarea></label>
    </div>
    <div class="st-actions mt-16"><button class="btn btn-primary" id="catSalvar" type="button">Salvar</button><button class="btn btn-secondary" id="catCancelar" type="button">Cancelar</button></div>
    <span class="st-feedback mt-8" id="catFeedback"></span>
  </div>`;
  modal.classList.add('open');
  const input = modal.querySelector('#catColabInput');
  const sug = modal.querySelector('#catColabSug');
  input.addEventListener('input', () => {
    selecionado = null;
    const q = input.value.trim();
    if (q.length < 2) { sug.style.display = 'none'; return; }
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      const lista = await searchColaboradores(q, { limite: 10 });
      if (!lista.length) { sug.style.display = 'none'; return; }
      sug.innerHTML = lista.map((c, idx) => `<button type="button" data-idx="${idx}" style="display:block;width:100%;text-align:left;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:10px;padding:8px;margin-bottom:4px;cursor:pointer">${esc(c.nome)}</button>`).join('');
      sug.style.display = 'block';
      sug.querySelectorAll('button').forEach((b) => b.onmousedown = (ev) => { ev.preventDefault(); selecionado = lista[Number(b.dataset.idx)]; input.value = selecionado.nome; sug.style.display = 'none'; });
    }, 250);
  });
  modal.querySelector('#mClose').onclick = () => modal.classList.remove('open');
  modal.querySelector('#catCancelar').onclick = () => modal.classList.remove('open');
  modal.querySelector('#catSalvar').onclick = async () => {
    const fb = modal.querySelector('#catFeedback');
    const nome = selecionado?.nome || input.value.trim();
    const data = modal.querySelector('#catData').value;
    if (!nome) { fb.textContent = 'Selecione o colaborador.'; fb.classList.add('err'); return; }
    if (!data) { fb.textContent = 'Informe a data do acidente.'; fb.classList.add('err'); return; }
    try {
      const payload = {
        colaborador_id: selecionado?.id || null,
        colaborador_nome: nome,
        data_acidente: data,
        tipo: modal.querySelector('#catTipo').value,
        cid: modal.querySelector('#catCid').value.trim() || null,
        afastamento_dias: modal.querySelector('#catDias').value ? Number(modal.querySelector('#catDias').value) : null,
        protocolo: modal.querySelector('#catProtocolo').value.trim() || null,
        descricao: modal.querySelector('#catDesc').value.trim() || null,
        status: 'aberta',
        created_by: state.ctx?.user?.id || null,
      };
      const { error } = await supabase.from('rh_cat').insert(payload);
      if (error) throw error;
      modal.classList.remove('open');
      await loadCats();
    } catch (e) { fb.textContent = e.message; fb.classList.add('err'); }
  };
}

async function openCatModal(id) {
  const c = state.cats.find((x) => String(x.id) === String(id));
  if (!c) return;
  const modal = document.getElementById('stModal');
  modal.innerHTML = `<div class="st-modal-card">
    <div class="section-head"><div><h3>${esc(c.colaborador_nome)}</h3><p class="muted">${brDate(c.data_acidente)} · ${statusPill(c.status, STATUS_CAT)}</p></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="st-grid mt-16">
      <div><span class="muted">Tipo</span><br><b>${esc(c.tipo === 'trajeto' ? 'Trajeto' : 'Típico')}</b></div>
      <div><span class="muted">CID</span><br><b>${esc(c.cid || '-')}</b></div>
      <div><span class="muted">Dias de afastamento</span><br><b>${c.afastamento_dias ?? '-'}</b></div>
      <div><span class="muted">Protocolo</span><br><b>${esc(c.protocolo || '-')}</b></div>
    </div>
    ${c.descricao ? `<div class="mt-16"><span class="muted">Descrição</span><p>${esc(c.descricao)}</p></div>` : ''}
    <label class="st-full mt-16">Status<select id="catStatusSel">${Object.entries(STATUS_CAT).map(([k, v]) => `<option value="${k}" ${k === c.status ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
    <div class="st-actions mt-16"><button class="btn btn-primary" id="catAtualizarStatus" type="button">Atualizar status</button></div>
    <span class="st-feedback mt-8" id="catModalFb"></span>
  </div>`;
  modal.classList.add('open');
  modal.querySelector('#mClose').onclick = () => modal.classList.remove('open');
  modal.querySelector('#catAtualizarStatus').onclick = async () => {
    const fb = modal.querySelector('#catModalFb');
    try {
      const novoStatus = modal.querySelector('#catStatusSel').value;
      await supabase.from('rh_cat').update({ status: novoStatus, updated_at: new Date().toISOString() }).eq('id', c.id);
      modal.classList.remove('open');
      await loadCats();
    } catch (e) { fb.textContent = e.message; fb.classList.add('err'); }
  };
}

function renderCatTab(area) {
  area.innerHTML = `<div class="section-head mt-16"><div><h3>CAT</h3><p class="muted">Abertura e acompanhamento de Comunicação de Acidente de Trabalho.</p></div><button class="btn btn-primary" id="stCatNova" type="button">+ Abrir CAT</button></div>
  <div class="st-table-wrap mt-16"><table class="st-table"><thead><tr><th>Colaborador</th><th>Data</th><th>Tipo</th><th>Status</th><th></th></tr></thead><tbody id="stCatBody"><tr><td colspan="5" class="st-empty">Carregando...</td></tr></tbody></table></div>`;
  area.querySelector('#stCatNova').onclick = openNovaCatModal;
  loadCats();
}

// ---------- Boot ----------

async function renderTab(container) {
  container.querySelectorAll('[data-st-tab]').forEach((b) => b.classList.toggle('active', b.dataset.stTab === state.tab));
  const area = container.querySelector('#stTabContent');
  if (!area) return;
  area.innerHTML = `<div class="st-empty mt-16">Carregando...</div>`;
  if (state.tab === 'epis') renderEpisTab(area);
  else if (state.tab === 'cat') renderCatTab(area);
}

export async function renderContent(content, userContext) {
  state.ctx = userContext;
  content.innerHTML = `${styles()}<section class="hero-card"><div><div class="eyebrow">Recursos Humanos</div><h2>Segurança do Trabalho</h2><p>EPIs e Comunicação de Acidente de Trabalho (CAT).</p></div><div class="hero-badge-wrap"><span class="hero-badge">RH</span></div></section>
  ${tabsHtml()}
  <div id="stTabContent"></div>
  <div class="st-modal" id="stModal"></div>`;
  content.querySelectorAll('[data-st-tab]').forEach((b) => b.onclick = () => { state.tab = b.dataset.stTab; renderTab(content); });
  await renderTab(content);
}

initProtectedPage('Segurança do Trabalho', renderContent);
