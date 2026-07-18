import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import {
  esc, brDate, todayIso, colabAutocomplete,
  filtrosHtml, filtrosStyle, bindFiltros, lerFiltros, aplicarFiltros,
  exportCsv, acoesHtml, bindAcoes,
} from './rhShared.js';

const state = { registros: [], ctx: null, filtros: null, root: null };

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
    .cp-table{width:100%;border-collapse:collapse;min-width:760px}
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
    ${filtrosStyle()}
  </style>`;
}

async function safe(fn, fallback = []) {
  try { const { data, error } = await fn(); if (error) throw error; return data || fallback; }
  catch (e) { console.warn('[Cartão Ponto]', e); return fallback; }
}

async function loadRegistros() {
  state.registros = await safe(() => supabase.from('rh_cartao_ponto').select('*').order('data', { ascending: false }).limit(500));
  renderTable();
}

function registrosFiltrados() {
  return aplicarFiltros(state.registros, state.filtros, { dataKey: 'data' });
}

function renderTable() {
  const body = document.getElementById('cpBody');
  if (!body) return;
  const rows = registrosFiltrados();
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="7" class="cp-empty">${state.registros.length ? 'Nenhum registro no filtro atual.' : 'Nenhum registro de ponto lançado. Clique em <b>+ Lançar Ponto</b> para começar.'}</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((r) => `<tr>
    <td><b>${esc(r.colaborador_nome)}</b></td>
    <td>${brDate(r.data)}</td>
    <td>${esc(r.entrada || '-')}</td>
    <td>${esc(r.saida_almoco || '-')} — ${esc(r.retorno_almoco || '-')}</td>
    <td>${esc(r.saida || '-')}</td>
    <td>${r.horas_trabalhadas != null ? `${r.horas_trabalhadas}h` : '-'}</td>
    <td>${acoesHtml(r.id)}</td>
  </tr>`).join('');
  bindAcoes(body, {
    table: 'rh_cartao_ponto',
    reload: loadRegistros,
    descricao: 'este lançamento de ponto',
    onEdit: (id) => {
      const row = state.registros.find((r) => String(r.id) === String(id));
      if (row) openRegistroModal(row);
    },
  });
}

function exportar() {
  const hhmm = (v) => String(v || '').slice(0, 5);
  exportCsv('cartao-ponto', [
    { key: 'colaborador_nome', label: 'Colaborador' },
    { key: 'data', label: 'Data', fmt: brDate },
    { key: 'entrada', label: 'Entrada', fmt: hhmm },
    { key: 'saida_almoco', label: 'Saída almoço', fmt: hhmm },
    { key: 'retorno_almoco', label: 'Retorno almoço', fmt: hhmm },
    { key: 'saida', label: 'Saída', fmt: hhmm },
    { key: 'horas_trabalhadas', label: 'Horas' },
    { key: 'observacoes', label: 'Observações' },
  ], registrosFiltrados());
}

// row = null (novo) ou o registro sendo editado.
function openRegistroModal(row = null) {
  const modal = document.getElementById('cpModal');
  let selecionado = null;
  const hhmm = (v) => String(v || '').slice(0, 5);
  modal.innerHTML = `<div class="cp-modal-card">
    <div class="section-head"><div><h3>${row ? 'Editar Ponto' : 'Lançar Ponto'}</h3></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="mt-16" style="position:relative">
      <label class="cp-full">Colaborador *<input id="cpColabInput" type="text" placeholder="Digite o nome para pesquisar..." autocomplete="off" value="${esc(row?.colaborador_nome || '')}"></label>
      <div id="cpColabSug" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:50;background:#071b13;border:1px solid var(--line);border-radius:14px;padding:6px;max-height:200px;overflow:auto;margin-top:4px"></div>
    </div>
    <div class="cp-grid mt-16">
      <label>Data *<input id="cpData" type="date" value="${esc(row?.data ? String(row.data).slice(0, 10) : todayIso())}"></label>
      <label>Entrada<input id="cpEntrada" type="time" value="${esc(hhmm(row?.entrada))}"></label>
      <label>Saída almoço<input id="cpSaidaAlmoco" type="time" value="${esc(hhmm(row?.saida_almoco))}"></label>
      <label>Retorno almoço<input id="cpRetornoAlmoco" type="time" value="${esc(hhmm(row?.retorno_almoco))}"></label>
      <label>Saída<input id="cpSaida" type="time" value="${esc(hhmm(row?.saida))}"></label>
      <label class="cp-full">Observações<textarea id="cpObs" rows="2">${esc(row?.observacoes || '')}</textarea></label>
    </div>
    <div class="cp-actions mt-16"><button class="btn btn-primary" id="cpSalvar" type="button">Salvar</button><button class="btn btn-secondary" id="cpCancelar" type="button">Cancelar</button></div>
    <span class="cp-feedback mt-8" id="cpFeedback"></span>
  </div>`;
  modal.classList.add('open');
  const input = modal.querySelector('#cpColabInput');
  colabAutocomplete(modal, '#cpColabInput', '#cpColabSug', (c) => { selecionado = c; });
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
        colaborador_id: selecionado?.id || row?.colaborador_id || null,
        colaborador_nome: nome,
        data,
        entrada,
        saida_almoco: saidaAlmoco,
        retorno_almoco: retornoAlmoco,
        saida,
        horas_trabalhadas: calcularHoras(entrada, saidaAlmoco, retornoAlmoco, saida),
        observacoes: modal.querySelector('#cpObs').value.trim() || null,
      };
      if (row) {
        payload.updated_at = new Date().toISOString();
        const { error } = await supabase.from('rh_cartao_ponto').update(payload).eq('id', row.id);
        if (error) throw error;
      } else {
        payload.created_by = state.ctx?.user?.id || null;
        const { error } = await supabase.from('rh_cartao_ponto').insert(payload);
        if (error) throw error;
      }
      modal.classList.remove('open');
      await loadRegistros();
    } catch (e) { fb.textContent = e.message; fb.classList.add('err'); }
  };
}

export async function renderContent(content, userContext) {
  state.ctx = userContext;
  state.root = content;
  content.innerHTML = `${styles()}<section class="hero-card"><div><div class="eyebrow">Recursos Humanos</div><h2>Cartão Ponto</h2><p>Controle de cartão ponto dos colaboradores.</p></div><div class="hero-badge-wrap"><span class="hero-badge">RH</span></div></section>
  <div class="section-head mt-16"><div><h3>Registros</h3><p class="muted">Lançamentos de entrada, saída e intervalo.</p></div><button class="btn btn-primary" id="cpNovo" type="button">+ Lançar Ponto</button></div>
  ${filtrosHtml('cp')}
  <div class="cp-table-wrap mt-16"><table class="cp-table"><thead><tr><th>Colaborador</th><th>Data</th><th>Entrada</th><th>Almoço</th><th>Saída</th><th>Horas</th><th>Ações</th></tr></thead><tbody id="cpBody"><tr><td colspan="7" class="cp-empty">Carregando...</td></tr></tbody></table></div>
  <div class="cp-modal" id="cpModal"></div>`;
  content.querySelector('#cpNovo').onclick = () => openRegistroModal();
  bindFiltros(content, 'cp', () => { state.filtros = lerFiltros(content, 'cp'); renderTable(); });
  content.querySelector('#cpExportar').onclick = exportar;
  await loadRegistros();
}

initProtectedPage('Cartão Ponto', renderContent);
