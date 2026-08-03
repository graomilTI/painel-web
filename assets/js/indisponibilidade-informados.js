import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

const TABELA = 'programacao_indisponibilidade_informados';
const state = { ativo: false, rows: [], user: null, busca: '', status: 'PENDENTE' };

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function brDate(value) {
  const [y, m, d] = String(value || '').slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '-';
}

function brDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('pt-BR');
}

function normalizeText(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function tipoLabel(tipo) {
  return ({ ATESTADO: 'Atestado', FALTA: 'Falta', FERIAS: 'Férias', FOLGA: 'Folga' })[tipo] || tipo || '-';
}

function statusPill(status) {
  const cfg = {
    PENDENTE: ['Pendente', '#fde68a', 'rgba(245,158,11,.12)'],
    PROCESSADO: ['Processado', '#bbf7d0', 'rgba(22,101,52,.2)'],
    CANCELADO: ['Cancelado', '#fecaca', 'rgba(127,29,29,.2)'],
  }[status] || [status || '-', '#cbd5e1', 'rgba(100,116,139,.15)'];
  return `<span class="inf-status" style="color:${cfg[1]};background:${cfg[2]}">${esc(cfg[0])}</span>`;
}

function styles() {
  if (document.getElementById('indisponibilidadeInformadosStyles')) return;
  const style = document.createElement('style');
  style.id = 'indisponibilidadeInformadosStyles';
  style.textContent = `
    .inf-tab-badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;margin-left:6px;border-radius:999px;background:#dc2626;color:#fff;font-size:10px;font-weight:900}
    .inf-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:16px}
    .inf-toolbar input,.inf-toolbar select{height:38px;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:11px;padding:0 11px;color-scheme:dark}
    .inf-toolbar input{flex:1 1 240px}.inf-toolbar select{min-width:150px}
    .inf-status{display:inline-flex;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:900;border:1px solid rgba(148,163,184,.18)}
    .inf-actions{display:grid;grid-template-columns:minmax(150px,1fr) 40px 40px;gap:6px;align-items:center;min-width:244px}
    .inf-obs-rh{width:100%;min-width:0;min-height:36px;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:9px;padding:7px 9px;box-sizing:border-box}
    .inf-action-icon{display:inline-grid!important;place-items:center;width:40px!important;min-width:40px!important;height:36px!important;min-height:36px!important;padding:0!important;margin:0!important;border-radius:10px!important;font-size:18px!important;font-weight:950!important;line-height:1!important}
    .inf-action-icon.processar{background:#16d790!important;color:#07251a!important;border:1px solid #16d790!important}
    .inf-action-icon.processar:hover{background:#14c885!important;border-color:#14c885!important}
    .inf-action-icon.cancelar{background:rgba(127,29,29,.24)!important;color:#fca5a5!important;border:1px solid rgba(239,68,68,.34)!important}
    .inf-action-icon.cancelar:hover{background:rgba(153,27,27,.42)!important;border-color:rgba(248,113,113,.56)!important;color:#fecaca!important}
    .inf-action-icon:disabled{opacity:.45!important;cursor:wait!important}
    .inf-origin{font-size:11px;color:var(--muted);margin-top:3px}
    @media(max-width:900px){.inf-actions{grid-template-columns:1fr 40px 40px;min-width:220px}}
  `;
  document.head.appendChild(style);
}

async function currentUser() {
  if (!state.user) state.user = await getCurrentUser().catch(() => null);
  return state.user;
}

function tabsEl() { return document.querySelector('.in-tabs'); }
function areaEl() { return document.querySelector('#inTabContent'); }

async function atualizarBadge() {
  const btn = document.querySelector('[data-informados-tab]');
  if (!btn) return;
  const { count, error } = await supabase.from(TABELA).select('id', { count: 'exact', head: true }).eq('status', 'PENDENTE');
  if (error) {
    console.warn('[Informado] contagem:', error);
    return;
  }
  let badge = btn.querySelector('.inf-tab-badge');
  if (count) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'inf-tab-badge';
      btn.appendChild(badge);
    }
    badge.textContent = String(count);
  } else badge?.remove();
}

function garantirAba() {
  const tabs = tabsEl();
  if (!tabs || tabs.querySelector('[data-informados-tab]')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-secondary';
  btn.dataset.informadosTab = '1';
  btn.textContent = 'Informado';
  tabs.appendChild(btn);
  btn.addEventListener('click', abrirInformados);
  atualizarBadge().catch(() => {});
}

function rowsFiltradas() {
  const busca = normalizeText(state.busca);
  return state.rows.filter((r) => {
    if (state.status && r.status !== state.status) return false;
    if (!busca) return true;
    return normalizeText(`${r.colaborador_nome} ${r.tipo} ${r.observacao} ${r.informado_por_nome} ${r.supervisao}`).includes(busca);
  });
}

function renderTabela() {
  const body = document.querySelector('#infRows');
  if (!body) return;
  const rows = rowsFiltradas();
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="7" class="in-empty">Nenhum registro encontrado.</td></tr>';
    return;
  }
  body.innerHTML = rows.map((r) => `<tr>
    <td><b>${esc(r.colaborador_nome)}</b><div class="inf-origin">${esc(r.cargo || 'Colaborador')} · ${esc(r.supervisao || r.coordenacao || '-')}</div></td>
    <td>${brDate(r.data_referencia)}</td>
    <td><b>${esc(tipoLabel(r.tipo))}</b></td>
    <td>${esc(r.observacao || '-')}</td>
    <td>${esc(r.informado_por_nome || '-')}<div class="inf-origin">${brDateTime(r.informado_em)}</div></td>
    <td>${statusPill(r.status)}</td>
    <td>${r.status === 'PENDENTE' ? `<div class="inf-actions">
      <input class="inf-obs-rh" data-inf-obs="${esc(r.id)}" placeholder="Observação do RH">
      <button class="btn btn-small inf-action-icon processar" data-inf-processar="${esc(r.id)}" type="button" title="Processar" aria-label="Processar">✔</button>
      <button class="btn btn-small inf-action-icon cancelar" data-inf-cancelar="${esc(r.id)}" type="button" title="Cancelar" aria-label="Cancelar">✕</button>
    </div>` : `<span class="inf-origin">${esc(r.processado_por_nome || '-')}<br>${brDateTime(r.processado_em)}</span>`}</td>
  </tr>`).join('');

  body.querySelectorAll('[data-inf-processar]').forEach((btn) => {
    btn.onclick = () => atualizarStatus(btn.dataset.infProcessar, 'PROCESSADO', btn);
  });
  body.querySelectorAll('[data-inf-cancelar]').forEach((btn) => {
    btn.onclick = () => atualizarStatus(btn.dataset.infCancelar, 'CANCELADO', btn);
  });
}

async function loadRows() {
  const { data, error } = await supabase.from(TABELA).select('*').order('informado_em', { ascending: false }).limit(500);
  if (error) throw error;
  state.rows = data || [];
}

async function atualizarStatus(id, status, btn) {
  btn.disabled = true;
  const user = await currentUser();
  const obs = document.querySelector(`[data-inf-obs="${CSS.escape(String(id))}"]`)?.value?.trim() || null;
  const { error } = await supabase.from(TABELA).update({
    status,
    observacao_rh: obs,
    processado_por: user?.id || null,
    processado_por_nome: user?.user_metadata?.nome || user?.email || null,
    processado_em: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) {
    alert(error.message || 'Não foi possível atualizar o registro.');
    btn.disabled = false;
    return;
  }
  await Promise.all([loadRows(), atualizarBadge()]);
  renderTabela();
}

async function renderInformados() {
  const area = areaEl();
  if (!area) return;
  area.innerHTML = '<div class="in-empty mt-16">Carregando informações enviadas pelos gestores...</div>';
  try {
    await loadRows();
    area.innerHTML = `<div class="section-head mt-16"><div><h3>Informado</h3><p class="muted">Atestados, faltas, férias e folgas informados pelos gestores na Programação &gt; Sem O.S.</p></div></div>
      <div class="inf-toolbar">
        <input id="infBusca" type="text" placeholder="Pesquisar colaborador, gestor ou observação...">
        <select id="infStatus"><option value="PENDENTE">Pendentes</option><option value="">Todos</option><option value="PROCESSADO">Processados</option><option value="CANCELADO">Cancelados</option></select>
      </div>
      <div class="in-table-wrap mt-16"><table class="in-table"><thead><tr><th>Colaborador</th><th>Data</th><th>Informação</th><th>Observação</th><th>Informado por</th><th>Situação</th><th>Ações RH</th></tr></thead><tbody id="infRows"></tbody></table></div>`;
    area.querySelector('#infBusca').value = state.busca;
    area.querySelector('#infStatus').value = state.status;
    area.querySelector('#infBusca').oninput = (e) => { state.busca = e.target.value; renderTabela(); };
    area.querySelector('#infStatus').onchange = (e) => { state.status = e.target.value; renderTabela(); };
    renderTabela();
  } catch (error) {
    console.error('[Informado] carregar:', error);
    area.innerHTML = `<div class="in-empty mt-16">Não foi possível carregar a janela Informado: ${esc(error.message || 'erro desconhecido')}</div>`;
  }
}

function abrirInformados() {
  state.ativo = true;
  document.querySelectorAll('[data-in-tab]').forEach((b) => b.classList.remove('active'));
  const btn = document.querySelector('[data-informados-tab]');
  btn?.classList.add('active');
  renderInformados();
}

function boot() {
  styles();
  garantirAba();
  const observer = new MutationObserver(() => {
    garantirAba();
    if (state.ativo) document.querySelector('[data-informados-tab]')?.classList.add('active');
  });
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-in-tab]')) {
      state.ativo = false;
      document.querySelector('[data-informados-tab]')?.classList.remove('active');
    }
  }, true);

  setInterval(() => atualizarBadge().catch(() => {}), 60000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
