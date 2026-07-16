import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { searchColaboradores } from './colaboradoresCache.js';

const TIPOS = { verbal: 'Verbal', escrita: 'Escrita', suspensao: 'Suspensão' };
const state = { advertencias: [], ctx: null };

const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const brDate = (v) => { const [y, m, d] = String(v || '').slice(0, 10).split('-'); return y && m && d ? `${d}/${m}/${y}` : '-'; };
const today = () => new Date().toISOString().slice(0, 10);

function tipoPill(tipo) {
  const cor = tipo === 'suspensao' ? ['#fecaca', 'rgba(220,38,38,.12)'] : tipo === 'escrita' ? ['#fde68a', 'rgba(245,158,11,.1)'] : ['#93c5fd', 'rgba(59,130,246,.12)'];
  return `<span style="display:inline-flex;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:800;color:${cor[0]};background:${cor[1]};border:1px solid rgba(148,163,184,.2)">${esc(TIPOS[tipo] || tipo)}</span>`;
}

function styles() {
  return `<style>
    .av-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px}
    .av-table{width:100%;border-collapse:collapse;min-width:640px}
    .av-table th,.av-table td{padding:14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}
    .av-table th{font-size:12px;color:var(--muted);text-transform:uppercase}
    .av-empty{text-align:center;color:var(--muted)}
    .av-modal{position:fixed;inset:0;background:rgba(2,6,23,.75);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}
    .av-modal.open{display:flex}
    .av-modal-card{width:min(560px,100%);max-height:90vh;overflow:auto;background:#15152a;border:1px solid rgba(255,255,255,.06);border-radius:22px;padding:24px;color:#e2e2f0}
    .av-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .av-grid input,.av-grid textarea,.av-grid select{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark}
    .av-full{grid-column:1/-1}
    .av-actions{display:flex;gap:10px;flex-wrap:wrap}
    .av-feedback{font-weight:700;display:block}
    .av-feedback.err{color:#fecaca}
  </style>`;
}

async function safe(fn, fallback = []) {
  try { const { data, error } = await fn(); if (error) throw error; return data || fallback; }
  catch (e) { console.warn('[Advertências]', e); return fallback; }
}

async function loadAdvertencias() {
  state.advertencias = await safe(() => supabase.from('rh_advertencias').select('*').order('data', { ascending: false }).limit(200));
  renderTable();
}

function renderTable() {
  const body = document.getElementById('avBody');
  if (!body) return;
  if (!state.advertencias.length) {
    body.innerHTML = `<tr><td colspan="4" class="av-empty">Nenhuma advertência registrada.</td></tr>`;
    return;
  }
  body.innerHTML = state.advertencias.map((a) => `<tr>
    <td><b>${esc(a.colaborador_nome)}</b></td>
    <td>${brDate(a.data)}</td>
    <td>${tipoPill(a.tipo)}</td>
    <td>${esc(a.motivo)}</td>
  </tr>`).join('');
}

function openNovaAdvertenciaModal() {
  const modal = document.getElementById('avModal');
  let selecionado = null;
  let debounce = null;
  modal.innerHTML = `<div class="av-modal-card">
    <div class="section-head"><div><h3>Registrar Advertência</h3></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="mt-16" style="position:relative">
      <label class="av-full">Colaborador *<input id="avColabInput" type="text" placeholder="Digite o nome para pesquisar..." autocomplete="off"></label>
      <div id="avColabSug" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:50;background:#071b13;border:1px solid var(--line);border-radius:14px;padding:6px;max-height:200px;overflow:auto;margin-top:4px"></div>
    </div>
    <div class="av-grid mt-16">
      <label>Data *<input id="avData" type="date" value="${today()}"></label>
      <label>Tipo<select id="avTipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
      <label class="av-full">Motivo *<input id="avMotivo" type="text"></label>
      <label class="av-full">Descrição<textarea id="avDesc" rows="2"></textarea></label>
      <label>Aplicada por<input id="avAplicadaPor" type="text"></label>
      <label>Link do documento (opcional)<input id="avAnexo" type="text"></label>
    </div>
    <div class="av-actions mt-16"><button class="btn btn-primary" id="avSalvar" type="button">Salvar</button><button class="btn btn-secondary" id="avCancelar" type="button">Cancelar</button></div>
    <span class="av-feedback mt-8" id="avFeedback"></span>
  </div>`;
  modal.classList.add('open');
  const input = modal.querySelector('#avColabInput');
  const sug = modal.querySelector('#avColabSug');
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
  modal.querySelector('#avCancelar').onclick = () => modal.classList.remove('open');
  modal.querySelector('#avSalvar').onclick = async () => {
    const fb = modal.querySelector('#avFeedback');
    const nome = selecionado?.nome || input.value.trim();
    const data = modal.querySelector('#avData').value;
    const motivo = modal.querySelector('#avMotivo').value.trim();
    if (!nome) { fb.textContent = 'Selecione o colaborador.'; fb.classList.add('err'); return; }
    if (!data || !motivo) { fb.textContent = 'Informe a data e o motivo.'; fb.classList.add('err'); return; }
    try {
      const payload = {
        colaborador_id: selecionado?.id || null,
        colaborador_nome: nome,
        data,
        tipo: modal.querySelector('#avTipo').value,
        motivo,
        descricao: modal.querySelector('#avDesc').value.trim() || null,
        aplicada_por: modal.querySelector('#avAplicadaPor').value.trim() || null,
        anexo_url: modal.querySelector('#avAnexo').value.trim() || null,
        status: 'registrada',
        created_by: state.ctx?.user?.id || null,
      };
      const { error } = await supabase.from('rh_advertencias').insert(payload);
      if (error) throw error;
      modal.classList.remove('open');
      await loadAdvertencias();
    } catch (e) { fb.textContent = e.message; fb.classList.add('err'); }
  };
}

export async function renderContent(content, userContext) {
  state.ctx = userContext;
  content.innerHTML = `${styles()}<section class="hero-card"><div><div class="eyebrow">Recursos Humanos</div><h2>Advertências</h2><p>Controle de advertências aplicadas aos colaboradores.</p></div><div class="hero-badge-wrap"><span class="hero-badge">RH</span></div></section>
  <div class="section-head mt-16"><div><h3>Advertências</h3><p class="muted">Histórico de advertências registradas.</p></div><button class="btn btn-primary" id="avNova" type="button">+ Registrar Advertência</button></div>
  <div class="av-table-wrap mt-16"><table class="av-table"><thead><tr><th>Colaborador</th><th>Data</th><th>Tipo</th><th>Motivo</th></tr></thead><tbody id="avBody"><tr><td colspan="4" class="av-empty">Carregando...</td></tr></tbody></table></div>
  <div class="av-modal" id="avModal"></div>`;
  content.querySelector('#avNova').onclick = openNovaAdvertenciaModal;
  await loadAdvertencias();
}

initProtectedPage('Advertências', renderContent);
