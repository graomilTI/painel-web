import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { searchColaboradores } from './colaboradoresCache.js';

const TABS = [
  { id: 'ferias', label: 'Férias' },
  { id: 'atestados', label: 'Atestados' },
  { id: 'historico', label: 'Histórico' },
];

const STATUS_FERIAS = {
  programada: { label: 'Programada' },
  em_gozo: { label: 'Em gozo' },
  concluida: { label: 'Concluída' },
  cancelada: { label: 'Cancelada' },
};

const STATUS_ATESTADO = {
  lancado: { label: 'Lançado' },
  aprovado: { label: 'Aprovado' },
};

const state = { tab: 'ferias', ferias: [], atestados: [], ctx: null };

const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const brDate = (v) => { const [y, m, d] = String(v || '').slice(0, 10).split('-'); return y && m && d ? `${d}/${m}/${y}` : '-'; };
const diasEntre = (ini, fim) => { const a = new Date(`${ini}T00:00:00`); const b = new Date(`${fim}T00:00:00`); return Math.max(1, Math.round((b - a) / 86400000) + 1); };

function statusPill(status, map) {
  const label = map?.[status]?.label || status || '-';
  const ok = status === 'concluida' || status === 'aprovado';
  const cor = ok ? ['#bbf7d0', 'rgba(22,101,52,.18)'] : (status === 'cancelada' ? ['#fecaca', 'rgba(220,38,38,.12)'] : ['#fde68a', 'rgba(245,158,11,.1)']);
  return `<span style="display:inline-flex;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:800;color:${cor[0]};background:${cor[1]};border:1px solid rgba(148,163,184,.2)">${esc(label)}</span>`;
}

function styles() {
  return `<style>
    .in-tabs{display:flex;gap:8px;flex-wrap:wrap}
    .in-tabs .active{background:#166534!important;color:#fff!important}
    .in-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px}
    .in-table{width:100%;border-collapse:collapse;min-width:640px}
    .in-table th,.in-table td{padding:14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}
    .in-table th{font-size:12px;color:var(--muted);text-transform:uppercase}
    .in-empty{text-align:center;color:var(--muted)}
    .in-modal{position:fixed;inset:0;background:rgba(2,6,23,.75);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}
    .in-modal.open{display:flex}
    .in-modal-card{width:min(640px,100%);max-height:90vh;overflow:auto;background:#15152a;border:1px solid rgba(255,255,255,.06);border-radius:22px;padding:24px;color:#e2e2f0}
    .in-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .in-grid input,.in-grid textarea,.in-grid select{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark}
    .in-full{grid-column:1/-1}
    .in-actions{display:flex;gap:10px;flex-wrap:wrap}
    .in-feedback{font-weight:700;display:block}
    .in-feedback.err{color:#fecaca}
  </style>`;
}

function tabsHtml() {
  return `<div class="in-tabs mt-16">${TABS.map((t) => `<button class="btn btn-secondary${t.id === state.tab ? ' active' : ''}" data-in-tab="${t.id}" type="button">${esc(t.label)}</button>`).join('')}</div>`;
}

async function safe(fn, fallback = []) {
  try { const { data, error } = await fn(); if (error) throw error; return data || fallback; }
  catch (e) { console.warn('[Indisponibilidade]', e); return fallback; }
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

// ---------- Férias ----------

async function loadFerias() {
  state.ferias = await safe(() => supabase.from('rh_ferias').select('*').order('data_inicio', { ascending: false }).limit(200));
  renderFeriasTable();
}

function renderFeriasTable() {
  const body = document.getElementById('inFerBody');
  if (!body) return;
  if (!state.ferias.length) {
    body.innerHTML = `<tr><td colspan="5" class="in-empty">Nenhuma férias programada. Clique em <b>+ Programar Férias</b> para começar.</td></tr>`;
    return;
  }
  body.innerHTML = state.ferias.map((f) => `<tr>
    <td><b>${esc(f.colaborador_nome)}</b></td>
    <td>${brDate(f.data_inicio)} — ${brDate(f.data_fim)}</td>
    <td>${f.dias_direito ?? '-'} dias</td>
    <td>${statusPill(f.status, STATUS_FERIAS)}</td>
    <td><select data-fer-status="${esc(f.id)}">${Object.entries(STATUS_FERIAS).map(([k, v]) => `<option value="${k}" ${k === f.status ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></td>
  </tr>`).join('');
  body.querySelectorAll('[data-fer-status]').forEach((sel) => sel.onchange = async () => {
    await supabase.from('rh_ferias').update({ status: sel.value, updated_at: new Date().toISOString() }).eq('id', sel.dataset.ferStatus);
    await loadFerias();
  });
}

function openNovaFeriasModal() {
  const modal = document.getElementById('inModal');
  let selecionado = null;
  modal.innerHTML = `<div class="in-modal-card">
    <div class="section-head"><div><h3>Programar Férias</h3><p class="muted">Controle de período aquisitivo e concessivo.</p></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="mt-16" style="position:relative">
      <label class="in-full">Colaborador *<input id="ferColabInput" type="text" placeholder="Digite o nome para pesquisar..." autocomplete="off"></label>
      <div id="ferColabSug" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:50;background:#071b13;border:1px solid var(--line);border-radius:14px;padding:6px;max-height:200px;overflow:auto;margin-top:4px"></div>
    </div>
    <div class="in-grid mt-16">
      <label>Período aquisitivo — início<input id="ferAqIni" type="date"></label>
      <label>Período aquisitivo — fim<input id="ferAqFim" type="date"></label>
      <label>Limite do período concessivo<input id="ferConcessivo" type="date"></label>
      <label>Dias de direito<input id="ferDiasDireito" type="number" value="30" min="1" max="30"></label>
      <label>Início do gozo *<input id="ferInicio" type="date"></label>
      <label>Fim do gozo *<input id="ferFim" type="date"></label>
    </div>
    <div class="in-actions mt-16"><button class="btn btn-primary" id="ferSalvar" type="button">Salvar</button><button class="btn btn-secondary" id="ferCancelar" type="button">Cancelar</button></div>
    <span class="in-feedback mt-8" id="ferFeedback"></span>
  </div>`;
  modal.classList.add('open');
  colabAutocomplete(modal, '#ferColabInput', '#ferColabSug', (c) => { selecionado = c; });
  modal.querySelector('#mClose').onclick = () => modal.classList.remove('open');
  modal.querySelector('#ferCancelar').onclick = () => modal.classList.remove('open');
  modal.querySelector('#ferSalvar').onclick = async () => {
    const fb = modal.querySelector('#ferFeedback');
    const nome = selecionado?.nome || modal.querySelector('#ferColabInput').value.trim();
    const inicio = modal.querySelector('#ferInicio').value;
    const fim = modal.querySelector('#ferFim').value;
    if (!nome) { fb.textContent = 'Selecione o colaborador.'; fb.classList.add('err'); return; }
    if (!inicio || !fim) { fb.textContent = 'Informe o início e o fim do gozo de férias.'; fb.classList.add('err'); return; }
    try {
      const payload = {
        colaborador_id: selecionado?.id || null,
        colaborador_nome: nome,
        periodo_aquisitivo_inicio: modal.querySelector('#ferAqIni').value || null,
        periodo_aquisitivo_fim: modal.querySelector('#ferAqFim').value || null,
        periodo_concessivo_limite: modal.querySelector('#ferConcessivo').value || null,
        dias_direito: Number(modal.querySelector('#ferDiasDireito').value || 30),
        data_inicio: inicio,
        data_fim: fim,
        status: 'programada',
        created_by: state.ctx?.user?.id || null,
      };
      const { error } = await supabase.from('rh_ferias').insert(payload);
      if (error) throw error;
      modal.classList.remove('open');
      await loadFerias();
    } catch (e) { fb.textContent = e.message; fb.classList.add('err'); }
  };
}

function renderFeriasTab(area) {
  area.innerHTML = `<div class="section-head mt-16"><div><h3>Férias</h3><p class="muted">Controle e programação de férias por colaborador.</p></div><button class="btn btn-primary" id="inFerNova" type="button">+ Programar Férias</button></div>
  <div class="in-table-wrap mt-16"><table class="in-table"><thead><tr><th>Colaborador</th><th>Período</th><th>Dias</th><th>Status</th><th>Atualizar</th></tr></thead><tbody id="inFerBody"><tr><td colspan="5" class="in-empty">Carregando...</td></tr></tbody></table></div>`;
  area.querySelector('#inFerNova').onclick = openNovaFeriasModal;
  loadFerias();
}

// ---------- Atestados ----------

async function loadAtestados() {
  state.atestados = await safe(() => supabase.from('rh_atestados').select('*').order('data_inicio', { ascending: false }).limit(200));
  renderAtestadosTable();
}

function renderAtestadosTable() {
  const body = document.getElementById('inAteBody');
  if (!body) return;
  if (!state.atestados.length) {
    body.innerHTML = `<tr><td colspan="5" class="in-empty">Nenhum atestado lançado. Clique em <b>+ Lançar Atestado</b> para registrar.</td></tr>`;
    return;
  }
  body.innerHTML = state.atestados.map((a) => `<tr>
    <td><b>${esc(a.colaborador_nome)}</b></td>
    <td>${brDate(a.data_inicio)} — ${brDate(a.data_fim)}</td>
    <td>${a.dias ?? '-'} dias${a.cid ? ` · CID: ${esc(a.cid)}` : ''}</td>
    <td>${statusPill(a.status, STATUS_ATESTADO)}</td>
    <td>${a.status !== 'aprovado' ? `<button class="btn btn-small btn-secondary" data-ate-aprovar="${esc(a.id)}" type="button">Aprovar</button>` : '-'}</td>
  </tr>`).join('');
  body.querySelectorAll('[data-ate-aprovar]').forEach((b) => b.onclick = async () => {
    await supabase.from('rh_atestados').update({ status: 'aprovado', updated_at: new Date().toISOString() }).eq('id', b.dataset.ateAprovar);
    await loadAtestados();
  });
}

function openNovoAtestadoModal() {
  const modal = document.getElementById('inModal');
  let selecionado = null;
  modal.innerHTML = `<div class="in-modal-card">
    <div class="section-head"><div><h3>Lançar Atestado</h3><p class="muted">Controle de atestados médicos.</p></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="mt-16" style="position:relative">
      <label class="in-full">Colaborador *<input id="ateColabInput" type="text" placeholder="Digite o nome para pesquisar..." autocomplete="off"></label>
      <div id="ateColabSug" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:50;background:#071b13;border:1px solid var(--line);border-radius:14px;padding:6px;max-height:200px;overflow:auto;margin-top:4px"></div>
    </div>
    <div class="in-grid mt-16">
      <label>Início *<input id="ateInicio" type="date"></label>
      <label>Fim *<input id="ateFim" type="date"></label>
      <label>CID<input id="ateCid" type="text"></label>
      <label>Médico<input id="ateMedico" type="text"></label>
      <label class="in-full">Link do anexo (opcional)<input id="ateAnexo" type="text" placeholder="URL do arquivo digitalizado"></label>
      <label class="in-full">Observações<textarea id="ateObs" rows="2"></textarea></label>
    </div>
    <div class="in-actions mt-16"><button class="btn btn-primary" id="ateSalvar" type="button">Salvar</button><button class="btn btn-secondary" id="ateCancelar" type="button">Cancelar</button></div>
    <span class="in-feedback mt-8" id="ateFeedback"></span>
  </div>`;
  modal.classList.add('open');
  colabAutocomplete(modal, '#ateColabInput', '#ateColabSug', (c) => { selecionado = c; });
  modal.querySelector('#mClose').onclick = () => modal.classList.remove('open');
  modal.querySelector('#ateCancelar').onclick = () => modal.classList.remove('open');
  modal.querySelector('#ateSalvar').onclick = async () => {
    const fb = modal.querySelector('#ateFeedback');
    const nome = selecionado?.nome || modal.querySelector('#ateColabInput').value.trim();
    const inicio = modal.querySelector('#ateInicio').value;
    const fim = modal.querySelector('#ateFim').value;
    if (!nome) { fb.textContent = 'Selecione o colaborador.'; fb.classList.add('err'); return; }
    if (!inicio || !fim) { fb.textContent = 'Informe o início e o fim do atestado.'; fb.classList.add('err'); return; }
    try {
      const payload = {
        colaborador_id: selecionado?.id || null,
        colaborador_nome: nome,
        data_inicio: inicio,
        data_fim: fim,
        dias: diasEntre(inicio, fim),
        cid: modal.querySelector('#ateCid').value.trim() || null,
        medico: modal.querySelector('#ateMedico').value.trim() || null,
        anexo_url: modal.querySelector('#ateAnexo').value.trim() || null,
        observacoes: modal.querySelector('#ateObs').value.trim() || null,
        status: 'lancado',
        created_by: state.ctx?.user?.id || null,
      };
      const { error } = await supabase.from('rh_atestados').insert(payload);
      if (error) throw error;
      modal.classList.remove('open');
      await loadAtestados();
    } catch (e) { fb.textContent = e.message; fb.classList.add('err'); }
  };
}

function renderAtestadosTab(area) {
  area.innerHTML = `<div class="section-head mt-16"><div><h3>Atestados</h3><p class="muted">Controle de atestados médicos por colaborador.</p></div><button class="btn btn-primary" id="inAteNovo" type="button">+ Lançar Atestado</button></div>
  <div class="in-table-wrap mt-16"><table class="in-table"><thead><tr><th>Colaborador</th><th>Período</th><th>Dias / CID</th><th>Status</th><th></th></tr></thead><tbody id="inAteBody"><tr><td colspan="5" class="in-empty">Carregando...</td></tr></tbody></table></div>`;
  area.querySelector('#inAteNovo').onclick = openNovoAtestadoModal;
  loadAtestados();
}

// ---------- Histórico (une férias + atestados + tabela legada indisponibilidades) ----------

async function renderHistoricoTab(area) {
  area.innerHTML = `<div class="section-head mt-16"><div><h3>Histórico</h3><p class="muted">Todos os lançamentos de férias, atestados e indisponibilidades.</p></div></div>
  <div class="in-table-wrap mt-16"><table class="in-table"><thead><tr><th>Tipo</th><th>Colaborador</th><th>Período</th><th>Detalhe</th></tr></thead><tbody id="inHistBody"><tr><td colspan="4" class="in-empty">Carregando...</td></tr></tbody></table></div>`;
  const [ferias, atestados, legado] = await Promise.all([
    safe(() => supabase.from('rh_ferias').select('*').order('data_inicio', { ascending: false }).limit(200)),
    safe(() => supabase.from('rh_atestados').select('*').order('data_inicio', { ascending: false }).limit(200)),
    safe(() => supabase.from('indisponibilidades').select('*').order('data_inicio', { ascending: false }).limit(200)),
  ]);
  const linhas = [
    ...ferias.map((f) => ({ tipo: 'Férias', nome: f.colaborador_nome, inicio: f.data_inicio, fim: f.data_fim, detalhe: STATUS_FERIAS[f.status]?.label || f.status })),
    ...atestados.map((a) => ({ tipo: 'Atestado', nome: a.colaborador_nome, inicio: a.data_inicio, fim: a.data_fim, detalhe: a.cid || '-' })),
    ...legado.map((l) => ({ tipo: `${esc(l.motivo || 'Indisponibilidade')} (histórico)`, nome: l.colaborador_nome, inicio: l.data_inicio, fim: l.data_fim, detalhe: l.observacoes || '-' })),
  ].sort((x, y) => String(y.inicio || '').localeCompare(String(x.inicio || '')));
  const body = area.querySelector('#inHistBody');
  if (!linhas.length) { body.innerHTML = `<tr><td colspan="4" class="in-empty">Nenhum lançamento encontrado.</td></tr>`; return; }
  body.innerHTML = linhas.map((l) => `<tr><td>${esc(l.tipo)}</td><td><b>${esc(l.nome)}</b></td><td>${brDate(l.inicio)} — ${brDate(l.fim)}</td><td>${esc(l.detalhe)}</td></tr>`).join('');
}

// ---------- Boot ----------

async function renderTab(container) {
  container.querySelectorAll('[data-in-tab]').forEach((b) => b.classList.toggle('active', b.dataset.inTab === state.tab));
  const area = container.querySelector('#inTabContent');
  if (!area) return;
  area.innerHTML = `<div class="in-empty mt-16">Carregando...</div>`;
  if (state.tab === 'ferias') renderFeriasTab(area);
  else if (state.tab === 'atestados') renderAtestadosTab(area);
  else if (state.tab === 'historico') renderHistoricoTab(area);
}

export async function renderContent(content, userContext) {
  state.ctx = userContext;
  content.innerHTML = `${styles()}<section class="hero-card"><div><div class="eyebrow">Recursos Humanos</div><h2>Indisponibilidade</h2><p>Férias, atestados e histórico de indisponibilidades.</p></div><div class="hero-badge-wrap"><span class="hero-badge">RH</span></div></section>
  ${tabsHtml()}
  <div id="inTabContent"></div>
  <div class="in-modal" id="inModal"></div>`;
  content.querySelectorAll('[data-in-tab]').forEach((b) => b.onclick = () => { state.tab = b.dataset.inTab; renderTab(content); });
  await renderTab(content);
}

initProtectedPage('Indisponibilidade', renderContent);
