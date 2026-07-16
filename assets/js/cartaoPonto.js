import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { searchColaboradores } from './colaboradoresCache.js';

const state = { registros: [], ctx: null };

const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const brDate = (v) => { const [y, m, d] = String(v || '').slice(0, 10).split('-'); return y && m && d ? `${d}/${m}/${y}` : '-'; };
const today = () => new Date().toISOString().slice(0, 10);

function calcularHoras(entrada, saidaAlmoco, retornoAlmoco, saida) {
  if (!entrada || !saida) return null;
  const paraMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  let total = paraMin(saida) - paraMin(entrada);
  if (saidaAlmoco && retornoAlmoco) total -= (paraMin(retornoAlmoco) - paraMin(saidaAlmoco));
  return total > 0 ? Math.round((total / 60) * 100) / 100 : null;
}

function styles() {
  return `<style>
    .cp-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px}
    .cp-table{width:100%;border-collapse:collapse;min-width:720px}
    .cp-table th,.cp-table td{padding:14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}
    .cp-table th{font-size:12px;color:var(--muted);text-transform:uppercase}
    .cp-empty{text-align:center;color:var(--muted)}
    .cp-modal{position:fixed;inset:0;background:rgba(2,6,23,.75);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}
    .cp-modal.open{display:flex}
    .cp-modal-card{width:min(560px,100%);max-height:90vh;overflow:auto;background:#15152a;border:1px solid rgba(255,255,255,.06);border-radius:22px;padding:24px;color:#e2e2f0}
    .cp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .cp-grid input,.cp-grid textarea{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark}
    .cp-full{grid-column:1/-1}
    .cp-actions{display:flex;gap:10px;flex-wrap:wrap}
    .cp-feedback{font-weight:700;display:block}
    .cp-feedback.err{color:#fecaca}
  </style>`;
}

async function safe(fn, fallback = []) {
  try { const { data, error } = await fn(); if (error) throw error; return data || fallback; }
  catch (e) { console.warn('[Cartão Ponto]', e); return fallback; }
}

async function loadRegistros() {
  state.registros = await safe(() => supabase.from('rh_cartao_ponto').select('*').order('data', { ascending: false }).limit(200));
  renderTable();
}

function renderTable() {
  const body = document.getElementById('cpBody');
  if (!body) return;
  if (!state.registros.length) {
    body.innerHTML = `<tr><td colspan="6" class="cp-empty">Nenhum registro de ponto lançado. Clique em <b>+ Lançar Ponto</b> para começar.</td></tr>`;
    return;
  }
  body.innerHTML = state.registros.map((r) => `<tr>
    <td><b>${esc(r.colaborador_nome)}</b></td>
    <td>${brDate(r.data)}</td>
    <td>${esc(r.entrada || '-')}</td>
    <td>${esc(r.saida_almoco || '-')} — ${esc(r.retorno_almoco || '-')}</td>
    <td>${esc(r.saida || '-')}</td>
    <td>${r.horas_trabalhadas != null ? `${r.horas_trabalhadas}h` : '-'}</td>
  </tr>`).join('');
}

function openNovoRegistroModal() {
  const modal = document.getElementById('cpModal');
  let selecionado = null;
  let debounce = null;
  modal.innerHTML = `<div class="cp-modal-card">
    <div class="section-head"><div><h3>Lançar Ponto</h3></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="mt-16" style="position:relative">
      <label class="cp-full">Colaborador *<input id="cpColabInput" type="text" placeholder="Digite o nome para pesquisar..." autocomplete="off"></label>
      <div id="cpColabSug" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:50;background:#071b13;border:1px solid var(--line);border-radius:14px;padding:6px;max-height:200px;overflow:auto;margin-top:4px"></div>
    </div>
    <div class="cp-grid mt-16">
      <label>Data *<input id="cpData" type="date" value="${today()}"></label>
      <label>Entrada<input id="cpEntrada" type="time"></label>
      <label>Saída almoço<input id="cpSaidaAlmoco" type="time"></label>
      <label>Retorno almoço<input id="cpRetornoAlmoco" type="time"></label>
      <label>Saída<input id="cpSaida" type="time"></label>
      <label class="cp-full">Observações<textarea id="cpObs" rows="2"></textarea></label>
    </div>
    <div class="cp-actions mt-16"><button class="btn btn-primary" id="cpSalvar" type="button">Salvar</button><button class="btn btn-secondary" id="cpCancelar" type="button">Cancelar</button></div>
    <span class="cp-feedback mt-8" id="cpFeedback"></span>
  </div>`;
  modal.classList.add('open');
  const input = modal.querySelector('#cpColabInput');
  const sug = modal.querySelector('#cpColabSug');
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
  modal.querySelector('#cpCancelar').onclick = () => modal.classList.remove('open');
  modal.querySelector('#cpSalvar').onclick = async () => {
    const fb = modal.querySelector('#cpFeedback');
    const nome = selecionado?.nome || input.value.trim();
    const data = modal.querySelector('#cpData').value;
    if (!nome) { fb.textContent = 'Selecione o colaborador.'; fb.classList.add('err'); return; }
    if (!data) { fb.textContent = 'Informe a data.'; fb.classList.add('err'); return; }
    try {
      const entrada = modal.querySelector('#cpEntrada').value || null;
      const saidaAlmoco = modal.querySelector('#cpSaidaAlmoco').value || null;
      const retornoAlmoco = modal.querySelector('#cpRetornoAlmoco').value || null;
      const saida = modal.querySelector('#cpSaida').value || null;
      const payload = {
        colaborador_id: selecionado?.id || null,
        colaborador_nome: nome,
        data,
        entrada,
        saida_almoco: saidaAlmoco,
        retorno_almoco: retornoAlmoco,
        saida,
        horas_trabalhadas: calcularHoras(entrada, saidaAlmoco, retornoAlmoco, saida),
        observacoes: modal.querySelector('#cpObs').value.trim() || null,
        created_by: state.ctx?.user?.id || null,
      };
      const { error } = await supabase.from('rh_cartao_ponto').insert(payload);
      if (error) throw error;
      modal.classList.remove('open');
      await loadRegistros();
    } catch (e) { fb.textContent = e.message; fb.classList.add('err'); }
  };
}

export async function renderContent(content, userContext) {
  state.ctx = userContext;
  content.innerHTML = `${styles()}<section class="hero-card"><div><div class="eyebrow">Recursos Humanos</div><h2>Cartão Ponto</h2><p>Controle de cartão ponto dos colaboradores.</p></div><div class="hero-badge-wrap"><span class="hero-badge">RH</span></div></section>
  <div class="section-head mt-16"><div><h3>Registros</h3><p class="muted">Lançamentos de entrada, saída e intervalo.</p></div><button class="btn btn-primary" id="cpNovo" type="button">+ Lançar Ponto</button></div>
  <div class="cp-table-wrap mt-16"><table class="cp-table"><thead><tr><th>Colaborador</th><th>Data</th><th>Entrada</th><th>Almoço</th><th>Saída</th><th>Horas</th></tr></thead><tbody id="cpBody"><tr><td colspan="6" class="cp-empty">Carregando...</td></tr></tbody></table></div>
  <div class="cp-modal" id="cpModal"></div>`;
  content.querySelector('#cpNovo').onclick = openNovoRegistroModal;
  await loadRegistros();
}

initProtectedPage('Cartão Ponto', renderContent);
