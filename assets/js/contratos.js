import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import {
  esc, brDate, todayIso, colabAutocomplete,
  filtrosHtml, filtrosStyle, bindFiltros, lerFiltros, aplicarFiltros,
  exportCsv, acoesHtml, bindAcoes,
  anexoFieldHtml, resolverAnexo, anexoBtnHtml, bindAnexoButtons,
} from './rhShared.js';

const TABS = [
  { id: 'experiencia', label: 'Contrato de Experiência' },
  { id: 'rescisoes', label: 'Rescisões' },
];

const STATUS_EXPERIENCIA = {
  em_experiencia: { label: 'Em experiência' },
  prorrogado: { label: 'Prorrogado' },
  efetivado: { label: 'Efetivado' },
  desligado: { label: 'Desligado' },
};

const TIPOS_RESCISAO = {
  dispensa_sem_justa_causa: 'Dispensa sem justa causa',
  dispensa_com_justa_causa: 'Dispensa com justa causa',
  pedido_demissao: 'Pedido de demissão',
  acordo: 'Acordo (art. 484-A)',
  termino_contrato: 'Término de contrato',
};

const STATUS_RESCISAO = {
  em_andamento: { label: 'Em andamento' },
  concluida: { label: 'Concluída' },
};

const state = { tab: 'experiencia', experiencias: [], rescisoes: [], ctx: null, filtros: null };

const money = (v) => v == null ? '-' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function statusPill(status, map) {
  const label = map?.[status]?.label || status || '-';
  const ok = status === 'efetivado' || status === 'concluida';
  const bad = status === 'desligado';
  const cor = ok ? ['#bbf7d0', 'rgba(22,101,52,.18)'] : bad ? ['#fecaca', 'rgba(220,38,38,.12)'] : ['#fde68a', 'rgba(245,158,11,.1)'];
  return `<span style="display:inline-flex;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:800;color:${cor[0]};background:${cor[1]};border:1px solid rgba(148,163,184,.2)">${esc(label)}</span>`;
}

function styles() {
  return `<style>
    .ct-tabs{display:flex;gap:8px;flex-wrap:wrap}
    .ct-tabs .active{background:#166534!important;color:#fff!important}
    .ct-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px}
    .ct-table{width:100%;border-collapse:collapse;min-width:720px}
    .ct-table th,.ct-table td{padding:14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}
    .ct-table th{font-size:12px;color:var(--muted);text-transform:uppercase}
    .ct-empty{text-align:center;color:var(--muted)}
    .ct-modal{position:fixed;inset:0;background:rgba(2,6,23,.75);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}
    .ct-modal.open{display:flex}
    .ct-modal-card{width:min(640px,100%);max-height:90vh;overflow:auto;background:#15152a;border:1px solid rgba(255,255,255,.06);border-radius:22px;padding:24px;color:#e2e2f0}
    .ct-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .ct-grid input,.ct-grid textarea,.ct-grid select{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark}
    .ct-full{grid-column:1/-1}
    .ct-actions{display:flex;gap:10px;flex-wrap:wrap}
    .ct-feedback{font-weight:700;display:block}
    .ct-feedback.err{color:#fecaca}
    ${filtrosStyle()}
  </style>`;
}

function tabsHtml() {
  return `<div class="ct-tabs mt-16">${TABS.map((t) => `<button class="btn btn-secondary${t.id === state.tab ? ' active' : ''}" data-ct-tab="${t.id}" type="button">${esc(t.label)}</button>`).join('')}</div>`;
}

async function safe(fn, fallback = []) {
  try { const { data, error } = await fn(); if (error) throw error; return data || fallback; }
  catch (e) { console.warn('[Contratos]', e); return fallback; }
}

// ---------- Contrato de Experiência ----------

async function loadExperiencias() {
  state.experiencias = await safe(() => supabase.from('rh_contratos_experiencia').select('*').order('data_fim_experiencia', { ascending: true }).limit(500));
  renderExperienciasTable();
}

function experienciasFiltradas() {
  return aplicarFiltros(state.experiencias, state.filtros, { dataKey: 'data_inicio' });
}

function renderExperienciasTable() {
  const body = document.getElementById('ctExpBody');
  if (!body) return;
  const rows = experienciasFiltradas();
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6" class="ct-empty">${state.experiencias.length ? 'Nenhum contrato no filtro atual.' : 'Nenhum contrato de experiência em acompanhamento.'}</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((c) => `<tr>
    <td><b>${esc(c.colaborador_nome)}</b></td>
    <td>${brDate(c.data_inicio)}</td>
    <td>${brDate(c.prorrogado ? c.data_fim_prorrogacao : c.data_fim_experiencia)}${c.prorrogado ? ' <small class="muted">(prorrogado)</small>' : ''}</td>
    <td>${statusPill(c.status, STATUS_EXPERIENCIA)}</td>
    <td><select data-exp-status="${esc(c.id)}">${Object.entries(STATUS_EXPERIENCIA).map(([k, v]) => `<option value="${k}" ${k === c.status ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></td>
    <td>${acoesHtml(c.id)}</td>
  </tr>`).join('');
  body.querySelectorAll('[data-exp-status]').forEach((sel) => sel.onchange = async () => {
    const patch = { status: sel.value, updated_at: new Date().toISOString() };
    if (sel.value === 'efetivado') patch.data_efetivacao = todayIso();
    if (sel.value === 'prorrogado') patch.prorrogado = true;
    await supabase.from('rh_contratos_experiencia').update(patch).eq('id', sel.dataset.expStatus);
    await loadExperiencias();
  });
  bindAcoes(body, {
    table: 'rh_contratos_experiencia',
    reload: loadExperiencias,
    descricao: 'este contrato de experiência',
    onEdit: (id) => {
      const row = state.experiencias.find((r) => String(r.id) === String(id));
      if (row) openExperienciaModal(row);
    },
  });
}

function exportarExperiencias() {
  exportCsv('contratos-experiencia', [
    { key: 'colaborador_nome', label: 'Colaborador' },
    { key: 'data_inicio', label: 'Início', fmt: brDate },
    { key: 'data_fim_experiencia', label: 'Fim 1º período', fmt: brDate },
    { key: 'prorrogado', label: 'Prorrogado', fmt: (v) => v ? 'Sim' : 'Não' },
    { key: 'data_fim_prorrogacao', label: 'Fim prorrogação', fmt: brDate },
    { key: 'data_efetivacao', label: 'Efetivação', fmt: brDate },
    { key: 'status', label: 'Status', fmt: (v) => STATUS_EXPERIENCIA[v]?.label || v },
  ], experienciasFiltradas());
}

function openExperienciaModal(row = null) {
  const modal = document.getElementById('ctModal');
  let selecionado = null;
  const d = (v) => v ? String(v).slice(0, 10) : '';
  modal.innerHTML = `<div class="ct-modal-card">
    <div class="section-head"><div><h3>${row ? 'Editar Contrato de Experiência' : 'Novo Contrato de Experiência'}</h3></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="mt-16" style="position:relative">
      <label class="ct-full">Colaborador *<input id="expColabInput" type="text" placeholder="Digite o nome para pesquisar..." autocomplete="off" value="${esc(row?.colaborador_nome || '')}"></label>
      <div id="expColabSug" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:50;background:#071b13;border:1px solid var(--line);border-radius:14px;padding:6px;max-height:200px;overflow:auto;margin-top:4px"></div>
    </div>
    <div class="ct-grid mt-16">
      <label>Início do contrato *<input id="expInicio" type="date" value="${d(row?.data_inicio)}"></label>
      <label>Fim do 1º período (45 dias) *<input id="expFim" type="date" value="${d(row?.data_fim_experiencia)}"></label>
      <label>Fim da prorrogação (se houver)<input id="expFimProrrog" type="date" value="${d(row?.data_fim_prorrogacao)}"></label>
      <label class="ct-full">Observações<textarea id="expObs" rows="2">${esc(row?.observacoes || '')}</textarea></label>
    </div>
    <div class="ct-actions mt-16"><button class="btn btn-primary" id="expSalvar" type="button">Salvar</button><button class="btn btn-secondary" id="expCancelar" type="button">Cancelar</button></div>
    <span class="ct-feedback mt-8" id="expFeedback"></span>
  </div>`;
  modal.classList.add('open');
  colabAutocomplete(modal, '#expColabInput', '#expColabSug', (c) => { selecionado = c; });
  modal.querySelector('#mClose').onclick = () => modal.classList.remove('open');
  modal.querySelector('#expCancelar').onclick = () => modal.classList.remove('open');
  modal.querySelector('#expSalvar').onclick = async () => {
    const fb = modal.querySelector('#expFeedback');
    const nome = selecionado?.nome || modal.querySelector('#expColabInput').value.trim();
    const inicio = modal.querySelector('#expInicio').value;
    const fim = modal.querySelector('#expFim').value;
    if (!nome) { fb.textContent = 'Selecione o colaborador.'; fb.classList.add('err'); return; }
    if (!inicio || !fim) { fb.textContent = 'Informe o início e o fim do 1º período.'; fb.classList.add('err'); return; }
    try {
      const fimProrrog = modal.querySelector('#expFimProrrog').value || null;
      const payload = {
        colaborador_id: selecionado?.id || row?.colaborador_id || null,
        colaborador_nome: nome,
        data_inicio: inicio,
        data_fim_experiencia: fim,
        data_fim_prorrogacao: fimProrrog,
        prorrogado: Boolean(fimProrrog) || row?.prorrogado || false,
        observacoes: modal.querySelector('#expObs').value.trim() || null,
      };
      if (row) {
        payload.updated_at = new Date().toISOString();
        const { error } = await supabase.from('rh_contratos_experiencia').update(payload).eq('id', row.id);
        if (error) throw error;
      } else {
        payload.status = 'em_experiencia';
        payload.created_by = state.ctx?.user?.id || null;
        const { error } = await supabase.from('rh_contratos_experiencia').insert(payload);
        if (error) throw error;
      }
      modal.classList.remove('open');
      await loadExperiencias();
    } catch (e) { fb.textContent = e.message; fb.classList.add('err'); }
  };
}

async function renderExperienciaTab(area) {
  area.innerHTML = `<div class="section-head mt-16"><div><h3>Contrato de Experiência</h3><p class="muted">Controle de prazos e prorrogação de contratos de experiência.</p></div><button class="btn btn-primary" id="ctExpNovo" type="button">+ Novo Contrato</button></div>
  ${filtrosHtml('exp')}
  <div class="ct-table-wrap mt-16"><table class="ct-table"><thead><tr><th>Colaborador</th><th>Início</th><th>Vencimento</th><th>Status</th><th>Atualizar</th><th>Ações</th></tr></thead><tbody id="ctExpBody"><tr><td colspan="6" class="ct-empty">Carregando...</td></tr></tbody></table></div>`;
  area.querySelector('#ctExpNovo').onclick = () => openExperienciaModal();
  bindFiltros(area, 'exp', () => { state.filtros = lerFiltros(area, 'exp'); renderExperienciasTable(); });
  area.querySelector('#expExportar').onclick = exportarExperiencias;
  await loadExperiencias();
}

// ---------- Rescisões ----------

async function loadRescisoes() {
  state.rescisoes = await safe(() => supabase.from('rh_rescisoes').select('*').order('data_desligamento', { ascending: false }).limit(500));
  renderRescisoesTable();
}

function rescisoesFiltradas() {
  return aplicarFiltros(state.rescisoes, state.filtros, { dataKey: 'data_desligamento' });
}

function renderRescisoesTable() {
  const body = document.getElementById('ctResBody');
  if (!body) return;
  const rows = rescisoesFiltradas();
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="7" class="ct-empty">${state.rescisoes.length ? 'Nenhuma rescisão no filtro atual.' : 'Nenhuma rescisão em andamento.'}</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((r) => `<tr>
    <td><b>${esc(r.colaborador_nome)}</b></td>
    <td>${brDate(r.data_desligamento)}</td>
    <td>${esc(TIPOS_RESCISAO[r.tipo] || r.tipo)}</td>
    <td>${money(r.valor_total)}</td>
    <td>${statusPill(r.status, STATUS_RESCISAO)}${r.status !== 'concluida' ? ` <button class="btn btn-small btn-secondary" data-res-concluir="${esc(r.id)}" type="button">Concluir</button>` : ''}</td>
    <td>${anexoBtnHtml(r.documentos_url)}</td>
    <td>${acoesHtml(r.id)}</td>
  </tr>`).join('');
  bindAnexoButtons(body);
  body.querySelectorAll('[data-res-concluir]').forEach((b) => b.onclick = async () => {
    await supabase.from('rh_rescisoes').update({ status: 'concluida', updated_at: new Date().toISOString() }).eq('id', b.dataset.resConcluir);
    await loadRescisoes();
  });
  bindAcoes(body, {
    table: 'rh_rescisoes',
    reload: loadRescisoes,
    descricao: 'esta rescisão',
    onEdit: (id) => {
      const row = state.rescisoes.find((r) => String(r.id) === String(id));
      if (row) openRescisaoModal(row);
    },
  });
}

function exportarRescisoes() {
  exportCsv('rescisoes', [
    { key: 'colaborador_nome', label: 'Colaborador' },
    { key: 'data_desligamento', label: 'Desligamento', fmt: brDate },
    { key: 'tipo', label: 'Tipo', fmt: (v) => TIPOS_RESCISAO[v] || v },
    { key: 'valor_total', label: 'Verbas (R$)', fmt: (v) => v == null ? '' : String(v).replace('.', ',') },
    { key: 'status', label: 'Status', fmt: (v) => STATUS_RESCISAO[v]?.label || v },
    { key: 'observacoes', label: 'Motivo / observações' },
  ], rescisoesFiltradas());
}

function openRescisaoModal(row = null) {
  const modal = document.getElementById('ctModal');
  let selecionado = null;
  modal.innerHTML = `<div class="ct-modal-card">
    <div class="section-head"><div><h3>${row ? 'Editar Rescisão' : 'Nova Rescisão'}</h3></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="mt-16" style="position:relative">
      <label class="ct-full">Colaborador *<input id="resColabInput" type="text" placeholder="Digite o nome para pesquisar..." autocomplete="off" value="${esc(row?.colaborador_nome || '')}"></label>
      <div id="resColabSug" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:50;background:#071b13;border:1px solid var(--line);border-radius:14px;padding:6px;max-height:200px;overflow:auto;margin-top:4px"></div>
    </div>
    <div class="ct-grid mt-16">
      <label>Data do desligamento *<input id="resData" type="date" value="${esc(row?.data_desligamento ? String(row.data_desligamento).slice(0, 10) : todayIso())}"></label>
      <label>Tipo<select id="resTipo">${Object.entries(TIPOS_RESCISAO).map(([k, v]) => `<option value="${k}" ${row?.tipo === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
      <label>Valor total das verbas (R$)<input id="resValor" type="number" step="0.01" min="0" value="${esc(row?.valor_total ?? '')}"></label>
      ${anexoFieldHtml('resDocs', { label: 'Documentos da rescisão (PDF)', atual: row?.documentos_url })}
      <label class="ct-full">Motivo / observações<textarea id="resMotivo" rows="2">${esc(row?.observacoes || '')}</textarea></label>
    </div>
    <div class="ct-actions mt-16"><button class="btn btn-primary" id="resSalvar" type="button">Salvar</button><button class="btn btn-secondary" id="resCancelar" type="button">Cancelar</button></div>
    <span class="ct-feedback mt-8" id="resFeedback"></span>
  </div>`;
  modal.classList.add('open');
  colabAutocomplete(modal, '#resColabInput', '#resColabSug', (c) => { selecionado = c; });
  modal.querySelector('#mClose').onclick = () => modal.classList.remove('open');
  modal.querySelector('#resCancelar').onclick = () => modal.classList.remove('open');
  modal.querySelector('#resSalvar').onclick = async () => {
    const fb = modal.querySelector('#resFeedback');
    const nome = selecionado?.nome || modal.querySelector('#resColabInput').value.trim();
    const data = modal.querySelector('#resData').value;
    if (!nome) { fb.textContent = 'Selecione o colaborador.'; fb.classList.add('err'); return; }
    if (!data) { fb.textContent = 'Informe a data do desligamento.'; fb.classList.add('err'); return; }
    try {
      const docs = await resolverAnexo(modal, 'resDocs', 'rescisoes', row?.documentos_url || null);
      const payload = {
        colaborador_id: selecionado?.id || row?.colaborador_id || null,
        colaborador_nome: nome,
        data_desligamento: data,
        tipo: modal.querySelector('#resTipo').value,
        valor_total: modal.querySelector('#resValor').value ? Number(modal.querySelector('#resValor').value) : null,
        documentos_url: docs,
        observacoes: modal.querySelector('#resMotivo').value.trim() || null,
      };
      if (row) {
        payload.updated_at = new Date().toISOString();
        const { error } = await supabase.from('rh_rescisoes').update(payload).eq('id', row.id);
        if (error) throw error;
      } else {
        payload.status = 'em_andamento';
        payload.created_by = state.ctx?.user?.id || null;
        const { error } = await supabase.from('rh_rescisoes').insert(payload);
        if (error) throw error;
      }
      modal.classList.remove('open');
      await loadRescisoes();
    } catch (e) { fb.textContent = e.message; fb.classList.add('err'); }
  };
}

async function renderRescisoesTab(area) {
  area.innerHTML = `<div class="section-head mt-16"><div><h3>Rescisões</h3><p class="muted">Controle do processo de rescisão contratual dos colaboradores.</p></div><button class="btn btn-primary" id="ctResNova" type="button">+ Nova Rescisão</button></div>
  ${filtrosHtml('res')}
  <div class="ct-table-wrap mt-16"><table class="ct-table"><thead><tr><th>Colaborador</th><th>Desligamento</th><th>Tipo</th><th>Verbas</th><th>Status</th><th>Docs</th><th>Ações</th></tr></thead><tbody id="ctResBody"><tr><td colspan="7" class="ct-empty">Carregando...</td></tr></tbody></table></div>`;
  area.querySelector('#ctResNova').onclick = () => openRescisaoModal();
  bindFiltros(area, 'res', () => { state.filtros = lerFiltros(area, 'res'); renderRescisoesTable(); });
  area.querySelector('#resExportar').onclick = exportarRescisoes;
  await loadRescisoes();
}

// ---------- Boot ----------

async function renderTab(container) {
  container.querySelectorAll('[data-ct-tab]').forEach((b) => b.classList.toggle('active', b.dataset.ctTab === state.tab));
  const area = container.querySelector('#ctTabContent');
  if (!area) return;
  state.filtros = null;
  area.innerHTML = `<div class="ct-empty mt-16">Carregando...</div>`;
  if (state.tab === 'experiencia') renderExperienciaTab(area);
  else if (state.tab === 'rescisoes') renderRescisoesTab(area);
}

export async function renderContent(content, userContext) {
  state.ctx = userContext;
  content.innerHTML = `${styles()}<section class="hero-card"><div><div class="eyebrow">Recursos Humanos</div><h2>Contratos</h2><p>Contrato de experiência e rescisões.</p></div><div class="hero-badge-wrap"><span class="hero-badge">RH</span></div></section>
  ${tabsHtml()}
  <div id="ctTabContent"></div>
  <div class="ct-modal" id="ctModal"></div>`;
  content.querySelectorAll('[data-ct-tab]').forEach((b) => b.onclick = () => { state.tab = b.dataset.ctTab; renderTab(content); });
  await renderTab(content);
}

initProtectedPage('Contratos', renderContent);
