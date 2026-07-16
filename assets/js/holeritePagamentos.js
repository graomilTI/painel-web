import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { searchColaboradores } from './colaboradoresCache.js';

const STATUS_FOLHA = {
  gerada: { label: 'Gerada' },
  paga: { label: 'Paga' },
};

const state = { folhas: [], ctx: null };

const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const money = (v) => v == null ? '-' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function statusPill(status) {
  const label = STATUS_FOLHA[status]?.label || status || '-';
  const cor = status === 'paga' ? ['#bbf7d0', 'rgba(22,101,52,.18)'] : ['#fde68a', 'rgba(245,158,11,.1)'];
  return `<span style="display:inline-flex;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:800;color:${cor[0]};background:${cor[1]};border:1px solid rgba(148,163,184,.2)">${esc(label)}</span>`;
}

function styles() {
  return `<style>
    .hp-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px}
    .hp-table{width:100%;border-collapse:collapse;min-width:640px}
    .hp-table th,.hp-table td{padding:14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}
    .hp-table th{font-size:12px;color:var(--muted);text-transform:uppercase}
    .hp-empty{text-align:center;color:var(--muted)}
    .hp-modal{position:fixed;inset:0;background:rgba(2,6,23,.75);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}
    .hp-modal.open{display:flex}
    .hp-modal-card{width:min(560px,100%);max-height:90vh;overflow:auto;background:#15152a;border:1px solid rgba(255,255,255,.06);border-radius:22px;padding:24px;color:#e2e2f0}
    .hp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .hp-grid input,.hp-grid textarea{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark}
    .hp-full{grid-column:1/-1}
    .hp-actions{display:flex;gap:10px;flex-wrap:wrap}
    .hp-feedback{font-weight:700;display:block}
    .hp-feedback.err{color:#fecaca}
  </style>`;
}

async function safe(fn, fallback = []) {
  try { const { data, error } = await fn(); if (error) throw error; return data || fallback; }
  catch (e) { console.warn('[Holerite e Pagamentos]', e); return fallback; }
}

async function loadFolhas() {
  state.folhas = await safe(() => supabase.from('rh_folha').select('*').order('competencia', { ascending: false }).limit(200));
  renderTable();
}

function renderTable() {
  const body = document.getElementById('hpBody');
  if (!body) return;
  if (!state.folhas.length) {
    body.innerHTML = `<tr><td colspan="6" class="hp-empty">Nenhuma folha lançada. Clique em <b>+ Nova Folha</b> para começar.</td></tr>`;
    return;
  }
  body.innerHTML = state.folhas.map((f) => `<tr>
    <td><b>${esc(f.colaborador_nome)}</b></td>
    <td>${esc(f.competencia)}</td>
    <td>${money(f.valor_bruto)}</td>
    <td>${money(f.valor_liquido)}</td>
    <td>${f.arquivo_url ? `<a class="epi-link" href="${esc(f.arquivo_url)}" target="_blank" rel="noopener">Ver holerite</a>` : '-'}</td>
    <td>${statusPill(f.status)}${f.status !== 'paga' ? ` <button class="btn btn-small btn-secondary" data-hp-pagar="${esc(f.id)}" type="button">Marcar paga</button>` : ''}</td>
  </tr>`).join('');
  body.querySelectorAll('[data-hp-pagar]').forEach((b) => b.onclick = async () => {
    await supabase.from('rh_folha').update({ status: 'paga', updated_at: new Date().toISOString() }).eq('id', b.dataset.hpPagar);
    await loadFolhas();
  });
}

function openNovaFolhaModal() {
  const modal = document.getElementById('hpModal');
  let selecionado = null;
  let debounce = null;
  modal.innerHTML = `<div class="hp-modal-card">
    <div class="section-head"><div><h3>Nova Folha</h3></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="mt-16" style="position:relative">
      <label class="hp-full">Colaborador *<input id="hpColabInput" type="text" placeholder="Digite o nome para pesquisar..." autocomplete="off"></label>
      <div id="hpColabSug" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:50;background:#071b13;border:1px solid var(--line);border-radius:14px;padding:6px;max-height:200px;overflow:auto;margin-top:4px"></div>
    </div>
    <div class="hp-grid mt-16">
      <label>Competência (MM/AAAA) *<input id="hpCompetencia" type="text" placeholder="07/2026"></label>
      <label>Valor bruto (R$)<input id="hpBruto" type="number" step="0.01" min="0"></label>
      <label>Valor líquido (R$)<input id="hpLiquido" type="number" step="0.01" min="0"></label>
      <label class="hp-full">Link do holerite (opcional)<input id="hpArquivo" type="text"></label>
    </div>
    <div class="hp-actions mt-16"><button class="btn btn-primary" id="hpSalvar" type="button">Salvar</button><button class="btn btn-secondary" id="hpCancelar" type="button">Cancelar</button></div>
    <span class="hp-feedback mt-8" id="hpFeedback"></span>
  </div>`;
  modal.classList.add('open');
  const input = modal.querySelector('#hpColabInput');
  const sug = modal.querySelector('#hpColabSug');
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
  modal.querySelector('#hpCancelar').onclick = () => modal.classList.remove('open');
  modal.querySelector('#hpSalvar').onclick = async () => {
    const fb = modal.querySelector('#hpFeedback');
    const nome = selecionado?.nome || input.value.trim();
    const competencia = modal.querySelector('#hpCompetencia').value.trim();
    if (!nome) { fb.textContent = 'Selecione o colaborador.'; fb.classList.add('err'); return; }
    if (!competencia) { fb.textContent = 'Informe a competência (mês/ano).'; fb.classList.add('err'); return; }
    try {
      const payload = {
        colaborador_id: selecionado?.id || null,
        colaborador_nome: nome,
        competencia,
        valor_bruto: modal.querySelector('#hpBruto').value ? Number(modal.querySelector('#hpBruto').value) : null,
        valor_liquido: modal.querySelector('#hpLiquido').value ? Number(modal.querySelector('#hpLiquido').value) : null,
        arquivo_url: modal.querySelector('#hpArquivo').value.trim() || null,
        status: 'gerada',
        created_by: state.ctx?.user?.id || null,
      };
      const { error } = await supabase.from('rh_folha').insert(payload);
      if (error) throw error;
      modal.classList.remove('open');
      await loadFolhas();
    } catch (e) { fb.textContent = e.message; fb.classList.add('err'); }
  };
}

export async function renderContent(content, userContext) {
  state.ctx = userContext;
  content.innerHTML = `${styles()}<section class="hero-card"><div><div class="eyebrow">Recursos Humanos</div><h2>Folha e Holerite</h2><p>Folha de pagamento e holerites dos colaboradores.</p></div><div class="hero-badge-wrap"><span class="hero-badge">RH</span></div></section>
  <div class="section-head mt-16"><div><h3>Folhas lançadas</h3><p class="muted">Uma linha por colaborador/competência.</p></div><button class="btn btn-primary" id="hpNova" type="button">+ Nova Folha</button></div>
  <div class="hp-table-wrap mt-16"><table class="hp-table"><thead><tr><th>Colaborador</th><th>Competência</th><th>Bruto</th><th>Líquido</th><th>Holerite</th><th>Status</th></tr></thead><tbody id="hpBody"><tr><td colspan="6" class="hp-empty">Carregando...</td></tr></tbody></table></div>
  <div class="hp-modal" id="hpModal"></div>`;
  content.querySelector('#hpNova').onclick = openNovaFolhaModal;
  await loadFolhas();
}

initProtectedPage('Folha e Holerite', renderContent);
