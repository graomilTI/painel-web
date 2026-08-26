import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import {
  esc, brDate, todayIso, colabAutocomplete,
  filtrosHtml, filtrosStyle, bindFiltros, lerFiltros, aplicarFiltros,
  exportCsv, acoesHtml, bindAcoes,
  anexoFieldHtml, resolverAnexo, anexoBtnHtml, bindAnexoButtons,
} from './rhShared.js';

const TABS = [
  { id: 'epis', label: 'EPIs' },
  { id: 'cat', label: 'CAT' },
];

const STATUS_CAT = {
  aberta: { label: 'Aberta' },
  em_analise: { label: 'Em análise' },
  encerrada: { label: 'Encerrada' },
};

const state = { tab: 'epis', cats: [], ctx: null, filtros: null };

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
    .st-table{width:100%;border-collapse:collapse;min-width:720px}
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
    ${filtrosStyle()}
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
    const mod = await import('./epiRh.js?v=20260826-fichas-anteriores');
    area.innerHTML = '';
    await mod.renderContent(area, state.ctx);
  } finally {
    document.documentElement.classList.remove('is-route-transitioning');
  }
}

// ---------- CAT ----------

async function loadCats() {
  state.cats = await safe(() => supabase.from('rh_cat').select('*').order('data_acidente', { ascending: false }).limit(500));
  renderCatsTable();
}

function catsFiltradas() {
  return aplicarFiltros(state.cats, state.filtros, { dataKey: 'data_acidente' });
}

function renderCatsTable() {
  const body = document.getElementById('stCatBody');
  if (!body) return;
  const rows = catsFiltradas();
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="7" class="st-empty">${state.cats.length ? 'Nenhuma CAT no filtro atual.' : 'Nenhuma CAT registrada. Clique em <b>+ Abrir CAT</b> para registrar um acidente.'}</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((c) => `<tr>
    <td><b>${esc(c.colaborador_nome)}</b></td>
    <td>${brDate(c.data_acidente)}</td>
    <td>${esc(c.tipo === 'trajeto' ? 'Trajeto' : 'Típico')}</td>
    <td>${statusPill(c.status, STATUS_CAT)}</td>
    <td><button class="btn btn-small btn-secondary" data-cat-ver="${esc(c.id)}" type="button">Ver</button></td>
    <td>${anexoBtnHtml(c.anexo_url)}</td>
    <td>${acoesHtml(c.id)}</td>
  </tr>`).join('');
  bindAnexoButtons(body);
  body.querySelectorAll('[data-cat-ver]').forEach((b) => b.onclick = () => openCatModal(b.dataset.catVer));
  bindAcoes(body, {
    table: 'rh_cat',
    reload: loadCats,
    descricao: 'esta CAT',
    onEdit: (id) => {
      const row = state.cats.find((c) => String(c.id) === String(id));
      if (row) openNovaCatModal(row);
    },
  });
}

function exportarCats() {
  exportCsv('cat', [
    { key: 'colaborador_nome', label: 'Colaborador' },
    { key: 'data_acidente', label: 'Data do acidente', fmt: brDate },
    { key: 'tipo', label: 'Tipo', fmt: (v) => v === 'trajeto' ? 'Trajeto' : 'Típico' },
    { key: 'cid', label: 'CID' },
    { key: 'afastamento_dias', label: 'Dias de afastamento' },
    { key: 'protocolo', label: 'Protocolo' },
    { key: 'status', label: 'Status', fmt: (v) => STATUS_CAT[v]?.label || v },
    { key: 'descricao', label: 'Descrição' },
  ], catsFiltradas());
}

function openNovaCatModal(row = null) {
  const modal = document.getElementById('stModal');
  let selecionado = null;
  modal.innerHTML = `<div class="st-modal-card">
    <div class="section-head"><div><h3>${row ? 'Editar CAT' : 'Abrir CAT'}</h3><p class="muted">Comunicação de Acidente de Trabalho.</p></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="mt-16" style="position:relative">
      <label class="st-full">Colaborador *<input id="catColabInput" type="text" placeholder="Digite o nome para pesquisar..." autocomplete="off" value="${esc(row?.colaborador_nome || '')}"></label>
      <div id="catColabSug" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:50;background:#071b13;border:1px solid var(--line);border-radius:14px;padding:6px;max-height:200px;overflow:auto;margin-top:4px"></div>
    </div>
    <div class="st-grid mt-16">
      <label>Data do acidente *<input id="catData" type="date" value="${esc(row?.data_acidente ? String(row.data_acidente).slice(0, 10) : todayIso())}"></label>
      <label>Tipo<select id="catTipo"><option value="tipico" ${row?.tipo !== 'trajeto' ? 'selected' : ''}>Típico</option><option value="trajeto" ${row?.tipo === 'trajeto' ? 'selected' : ''}>Trajeto</option></select></label>
      <label>CID<input id="catCid" type="text" value="${esc(row?.cid || '')}"></label>
      <label>Dias de afastamento<input id="catDias" type="number" min="0" value="${esc(row?.afastamento_dias ?? '')}"></label>
      <label class="st-full">Protocolo (se já emitido)<input id="catProtocolo" type="text" value="${esc(row?.protocolo || '')}"></label>
      ${anexoFieldHtml('catAnexo', { label: 'CAT emitida / laudos (PDF/foto)', atual: row?.anexo_url })}
      <label class="st-full">Descrição do acidente<textarea id="catDesc" rows="3">${esc(row?.descricao || '')}</textarea></label>
    </div>
    <div class="st-actions mt-16"><button class="btn btn-primary" id="catSalvar" type="button">Salvar</button><button class="btn btn-secondary" id="catCancelar" type="button">Cancelar</button></div>
    <span class="st-feedback mt-8" id="catFeedback"></span>
  </div>`;
  modal.classList.add('open');
  const input = modal.querySelector('#catColabInput');
  colabAutocomplete(modal, '#catColabInput', '#catColabSug', (c) => { selecionado = c; });
  modal.querySelector('#mClose').onclick = () => modal.classList.remove('open');
  modal.querySelector('#catCancelar').onclick = () => modal.classList.remove('open');
  modal.querySelector('#catSalvar').onclick = async () => {
    const fb = modal.querySelector('#catFeedback');
    const nome = selecionado?.nome || input.value.trim();
    const data = modal.querySelector('#catData').value;
    if (!nome) { fb.textContent = 'Selecione o colaborador.'; fb.classList.add('err'); return; }
    if (!data) { fb.textContent = 'Informe a data do acidente.'; fb.classList.add('err'); return; }
    try {
      const anexo = await resolverAnexo(modal, 'catAnexo', 'cat', row?.anexo_url || null);
      const payload = {
        colaborador_id: selecionado?.id || row?.colaborador_id || null,
        colaborador_nome: nome,
        data_acidente: data,
        tipo: modal.querySelector('#catTipo').value,
        cid: modal.querySelector('#catCid').value.trim() || null,
        afastamento_dias: modal.querySelector('#catDias').value ? Number(modal.querySelector('#catDias').value) : null,
        protocolo: modal.querySelector('#catProtocolo').value.trim() || null,
        descricao: modal.querySelector('#catDesc').value.trim() || null,
        anexo_url: anexo,
      };
      if (row) {
        payload.updated_at = new Date().toISOString();
        const { error } = await supabase.from('rh_cat').update(payload).eq('id', row.id);
        if (error) throw error;
      } else {
        payload.status = 'aberta';
        payload.created_by = state.ctx?.user?.id || null;
        const { error } = await supabase.from('rh_cat').insert(payload);
        if (error) throw error;
      }
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
    ${c.anexo_url ? `<div class="mt-16">${anexoBtnHtml(c.anexo_url)}</div>` : ''}
    <label class="st-full mt-16">Status<select id="catStatusSel">${Object.entries(STATUS_CAT).map(([k, v]) => `<option value="${k}" ${k === c.status ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
    <div class="st-actions mt-16"><button class="btn btn-primary" id="catAtualizarStatus" type="button">Atualizar status</button></div>
    <span class="st-feedback mt-8" id="catModalFb"></span>
  </div>`;
  modal.classList.add('open');
  bindAnexoButtons(modal);
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
  ${filtrosHtml('cat')}
  <div class="st-table-wrap mt-16"><table class="st-table"><thead><tr><th>Colaborador</th><th>Data</th><th>Tipo</th><th>Status</th><th></th><th>Anexo</th><th>Ações</th></tr></thead><tbody id="stCatBody"><tr><td colspan="7" class="st-empty">Carregando...</td></tr></tbody></table></div>`;
  area.querySelector('#stCatNova').onclick = () => openNovaCatModal();
  bindFiltros(area, 'cat', () => { state.filtros = lerFiltros(area, 'cat'); renderCatsTable(); });
  area.querySelector('#catExportar').onclick = exportarCats;
  loadCats();
}

// ---------- Boot ----------

async function renderTab(container) {
  container.querySelectorAll('[data-st-tab]').forEach((b) => b.classList.toggle('active', b.dataset.stTab === state.tab));
  const area = container.querySelector('#stTabContent');
  if (!area) return;
  state.filtros = null;
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
