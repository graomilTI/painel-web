import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import {
  esc, brDate, todayIso, colabAutocomplete,
  filtrosHtml, filtrosStyle, bindFiltros, lerFiltros, aplicarFiltros,
  exportCsv, acoesHtml, bindAcoes,
  anexoFieldHtml, resolverAnexo, anexoBtnHtml, bindAnexoButtons,
} from './rhShared.js';

const TABS = [
  { id: 'indisponiveis', label: 'Indisponíveis' },
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

const state = { tab: 'indisponiveis', indisponiveis: [], ferias: [], atestados: [], ctx: null, filtros: null };

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
    .in-table{width:100%;border-collapse:collapse;min-width:720px}
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
    .inds-modal-card{padding:28px}
    .inds-modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding-bottom:18px;margin-bottom:20px;border-bottom:1px solid rgba(148,163,184,.14)}
    .inds-modal-head h3{margin:0 0 6px;font-size:19px}
    .inds-modal-head p{margin:0;font-size:13px;line-height:1.4}
    .inds-modal-close{flex:0 0 auto;width:34px;height:34px;padding:0;border-radius:11px;font-size:15px;line-height:1;background:rgba(148,163,184,.08)!important;border:1px solid rgba(148,163,184,.18)!important;color:var(--muted)}
    .inds-modal-close:hover{color:#fff;border-color:rgba(248,113,113,.4)!important}
    .in-grid.inds-grid{gap:18px 16px}
    #indsColabInput{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark}
    .inds-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:24px;padding-top:18px;border-top:1px solid rgba(148,163,184,.14)}
    .inds-actions .btn{width:auto;margin-top:0;min-width:120px}
    ${filtrosStyle()}
  </style>`;
}

function tabsHtml() {
  return `<div class="in-tabs mt-16">${TABS.map((t) => `<button class="btn btn-secondary${t.id === state.tab ? ' active' : ''}" data-in-tab="${t.id}" type="button">${esc(t.label)}</button>`).join('')}</div>`;
}

async function safe(fn, fallback = []) {
  try { const { data, error } = await fn(); if (error) throw error; return data || fallback; }
  catch (e) { console.warn('[Indisponibilidade]', e); return fallback; }
}

// ---------- Indisponíveis ----------

async function loadIndisponiveis() {
  state.indisponiveis = await safe(() => supabase.from('indisponibilidades').select('*').order('data_inicio', { ascending: false }).limit(500));
  renderIndisponiveisTable();
}

function indisponiveisFiltrados() {
  const hoje = todayIso();
  const ativos = state.indisponiveis.filter((r) => !r.data_fim || r.data_fim >= hoje);
  return aplicarFiltros(ativos, state.filtros, { dataKey: 'data_inicio' });
}

function renderIndisponiveisTable() {
  const body = document.getElementById('inIndsBody');
  if (!body) return;
  const rows = indisponiveisFiltrados();
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="5" class="in-empty">${state.indisponiveis.length ? 'Nenhum colaborador indisponível no filtro atual.' : 'Nenhum colaborador indisponível. Clique em <b>+ Adicionar Indisponibilidade</b> para registrar.'}</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((r) => `<tr>
    <td><b>${esc(r.colaborador_nome)}</b></td>
    <td>${brDate(r.data_inicio)}</td>
    <td>${brDate(r.data_fim)}</td>
    <td>${esc(r.motivo)}</td>
    <td>${acoesHtml(r.id)}</td>
  </tr>`).join('');
  bindAcoes(body, {
    table: 'indisponibilidades',
    reload: loadIndisponiveis,
    descricao: 'esta indisponibilidade',
    onEdit: (id) => {
      const row = state.indisponiveis.find((r) => String(r.id) === String(id));
      if (row) openIndisponibilidadeModal(row);
    },
  });
}

function exportarIndisponiveis() {
  exportCsv('indisponiveis', [
    { key: 'colaborador_nome', label: 'Colaborador' },
    { key: 'data_inicio', label: 'Início', fmt: brDate },
    { key: 'data_fim', label: 'Fim', fmt: brDate },
    { key: 'motivo', label: 'Motivo' },
  ], indisponiveisFiltrados());
}

function openIndisponibilidadeModal(row = null) {
  const modal = document.getElementById('inModal');
  let selecionado = null;
  const d = (v) => v ? String(v).slice(0, 10) : '';
  modal.innerHTML = `<div class="in-modal-card inds-modal-card">
    <div class="inds-modal-head">
      <div><h3>${row ? 'Editar Indisponibilidade' : 'Adicionar Indisponibilidade'}</h3><p class="muted">Marca o colaborador como indisponível em um período.</p></div>
      <button class="inds-modal-close" id="mClose" type="button" title="Fechar" aria-label="Fechar">✕</button>
    </div>
    <div style="position:relative">
      <label class="in-full">Colaborador *<input id="indsColabInput" type="text" placeholder="Digite o nome para pesquisar..." autocomplete="off" value="${esc(row?.colaborador_nome || '')}"></label>
      <div id="indsColabSug" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:50;background:#071b13;border:1px solid var(--line);border-radius:14px;padding:6px;max-height:200px;overflow:auto;margin-top:4px"></div>
    </div>
    <div class="in-grid inds-grid mt-16">
      <label>Início *<input id="indsInicio" type="date" value="${d(row?.data_inicio)}"></label>
      <label>Fim *<input id="indsFim" type="date" value="${d(row?.data_fim)}"></label>
      <label class="in-full">Motivo *<input id="indsMotivo" type="text" value="${esc(row?.motivo || '')}" placeholder="Ex.: licença, afastamento, folga..."></label>
    </div>
    <div class="inds-actions"><button class="btn btn-secondary" id="indsCancelar" type="button">Cancelar</button><button class="btn btn-primary" id="indsSalvar" type="button">Salvar</button></div>
    <span class="in-feedback mt-8" id="indsFeedback"></span>
  </div>`;
  modal.classList.add('open');
  colabAutocomplete(modal, '#indsColabInput', '#indsColabSug', (c) => { selecionado = c; });
  modal.querySelector('#mClose').onclick = () => modal.classList.remove('open');
  modal.querySelector('#indsCancelar').onclick = () => modal.classList.remove('open');
  modal.querySelector('#indsSalvar').onclick = async () => {
    const fb = modal.querySelector('#indsFeedback');
    fb.className = 'in-feedback mt-8';
    const nome = selecionado?.nome || modal.querySelector('#indsColabInput').value.trim();
    const inicio = modal.querySelector('#indsInicio').value;
    const fim = modal.querySelector('#indsFim').value;
    const motivo = modal.querySelector('#indsMotivo').value.trim();
    if (!nome) { fb.textContent = 'Selecione o colaborador.'; fb.classList.add('err'); return; }
    if (!inicio || !fim) { fb.textContent = 'Informe o início e o fim da indisponibilidade.'; fb.classList.add('err'); return; }
    if (fim < inicio) { fb.textContent = 'O fim não pode ser antes do início.'; fb.classList.add('err'); return; }
    if (!motivo) { fb.textContent = 'Informe o motivo.'; fb.classList.add('err'); return; }
    try {
      const payload = {
        colaborador_nome: nome,
        colaborador_cpf: selecionado?.cpf || row?.colaborador_cpf || null,
        data_inicio: inicio,
        data_fim: fim,
        motivo,
      };
      if (row) {
        const { error } = await supabase.from('indisponibilidades').update(payload).eq('id', row.id);
        if (error) throw error;
      } else {
        payload.created_by = state.ctx?.user?.id || null;
        const { error } = await supabase.from('indisponibilidades').insert(payload);
        if (error) throw error;
      }
      modal.classList.remove('open');
      await loadIndisponiveis();
    } catch (e) { fb.textContent = e.message; fb.classList.add('err'); }
  };
}

function renderIndisponiveisTab(area) {
  area.innerHTML = `<div class="section-head mt-16"><div><h3>Indisponíveis</h3><p class="muted">Colaboradores indisponíveis agora ou em breve.</p></div><button class="btn btn-primary" id="inIndsNovo" type="button">+ Adicionar Indisponibilidade</button></div>
  ${filtrosHtml('inds')}
  <div class="in-table-wrap mt-16"><table class="in-table"><thead><tr><th>Colaborador</th><th>Início</th><th>Fim</th><th>Motivo</th><th>Ações</th></tr></thead><tbody id="inIndsBody"><tr><td colspan="5" class="in-empty">Carregando...</td></tr></tbody></table></div>`;
  area.querySelector('#inIndsNovo').onclick = () => openIndisponibilidadeModal();
  bindFiltros(area, 'inds', () => { state.filtros = lerFiltros(area, 'inds'); renderIndisponiveisTable(); });
  area.querySelector('#indsExportar').onclick = exportarIndisponiveis;
  loadIndisponiveis();
}

// ---------- Férias ----------

async function loadFerias() {
  state.ferias = await safe(() => supabase.from('rh_ferias').select('*').order('data_inicio', { ascending: false }).limit(500));
  renderFeriasTable();
}

function feriasFiltradas() {
  return aplicarFiltros(state.ferias, state.filtros, { dataKey: 'data_inicio' });
}

function renderFeriasTable() {
  const body = document.getElementById('inFerBody');
  if (!body) return;
  const rows = feriasFiltradas();
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6" class="in-empty">${state.ferias.length ? 'Nenhuma férias no filtro atual.' : 'Nenhuma férias programada. Clique em <b>+ Programar Férias</b> para começar.'}</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((f) => `<tr>
    <td><b>${esc(f.colaborador_nome)}</b></td>
    <td>${brDate(f.data_inicio)} — ${brDate(f.data_fim)}</td>
    <td>${f.dias_direito ?? '-'} dias</td>
    <td>${statusPill(f.status, STATUS_FERIAS)}</td>
    <td><select data-fer-status="${esc(f.id)}">${Object.entries(STATUS_FERIAS).map(([k, v]) => `<option value="${k}" ${k === f.status ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></td>
    <td>${acoesHtml(f.id)}</td>
  </tr>`).join('');
  body.querySelectorAll('[data-fer-status]').forEach((sel) => sel.onchange = async () => {
    await supabase.from('rh_ferias').update({ status: sel.value, updated_at: new Date().toISOString() }).eq('id', sel.dataset.ferStatus);
    await loadFerias();
  });
  bindAcoes(body, {
    table: 'rh_ferias',
    reload: loadFerias,
    descricao: 'este período de férias',
    onEdit: (id) => {
      const row = state.ferias.find((r) => String(r.id) === String(id));
      if (row) openFeriasModal(row);
    },
  });
}

function exportarFerias() {
  exportCsv('ferias', [
    { key: 'colaborador_nome', label: 'Colaborador' },
    { key: 'data_inicio', label: 'Início do gozo', fmt: brDate },
    { key: 'data_fim', label: 'Fim do gozo', fmt: brDate },
    { key: 'dias_direito', label: 'Dias de direito' },
    { key: 'periodo_aquisitivo_inicio', label: 'Aquisitivo início', fmt: brDate },
    { key: 'periodo_aquisitivo_fim', label: 'Aquisitivo fim', fmt: brDate },
    { key: 'periodo_concessivo_limite', label: 'Limite concessivo', fmt: brDate },
    { key: 'status', label: 'Status', fmt: (v) => STATUS_FERIAS[v]?.label || v },
  ], feriasFiltradas());
}

function openFeriasModal(row = null) {
  const modal = document.getElementById('inModal');
  let selecionado = null;
  const d = (v) => v ? String(v).slice(0, 10) : '';
  modal.innerHTML = `<div class="in-modal-card">
    <div class="section-head"><div><h3>${row ? 'Editar Férias' : 'Programar Férias'}</h3><p class="muted">Controle de período aquisitivo e concessivo.</p></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="mt-16" style="position:relative">
      <label class="in-full">Colaborador *<input id="ferColabInput" type="text" placeholder="Digite o nome para pesquisar..." autocomplete="off" value="${esc(row?.colaborador_nome || '')}"></label>
      <div id="ferColabSug" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:50;background:#071b13;border:1px solid var(--line);border-radius:14px;padding:6px;max-height:200px;overflow:auto;margin-top:4px"></div>
    </div>
    <div class="in-grid mt-16">
      <label>Período aquisitivo — início<input id="ferAqIni" type="date" value="${d(row?.periodo_aquisitivo_inicio)}"></label>
      <label>Período aquisitivo — fim<input id="ferAqFim" type="date" value="${d(row?.periodo_aquisitivo_fim)}"></label>
      <label>Limite do período concessivo<input id="ferConcessivo" type="date" value="${d(row?.periodo_concessivo_limite)}"></label>
      <label>Dias de direito<input id="ferDiasDireito" type="number" value="${esc(row?.dias_direito ?? 30)}" min="1" max="30"></label>
      <label>Início do gozo *<input id="ferInicio" type="date" value="${d(row?.data_inicio)}"></label>
      <label>Fim do gozo *<input id="ferFim" type="date" value="${d(row?.data_fim)}"></label>
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
        colaborador_id: selecionado?.id || row?.colaborador_id || null,
        colaborador_nome: nome,
        periodo_aquisitivo_inicio: modal.querySelector('#ferAqIni').value || null,
        periodo_aquisitivo_fim: modal.querySelector('#ferAqFim').value || null,
        periodo_concessivo_limite: modal.querySelector('#ferConcessivo').value || null,
        dias_direito: Number(modal.querySelector('#ferDiasDireito').value || 30),
        data_inicio: inicio,
        data_fim: fim,
      };
      if (row) {
        payload.updated_at = new Date().toISOString();
        const { error } = await supabase.from('rh_ferias').update(payload).eq('id', row.id);
        if (error) throw error;
      } else {
        payload.status = 'programada';
        payload.created_by = state.ctx?.user?.id || null;
        const { error } = await supabase.from('rh_ferias').insert(payload);
        if (error) throw error;
      }
      modal.classList.remove('open');
      await loadFerias();
    } catch (e) { fb.textContent = e.message; fb.classList.add('err'); }
  };
}

function renderFeriasTab(area) {
  area.innerHTML = `<div class="section-head mt-16"><div><h3>Férias</h3><p class="muted">Controle e programação de férias por colaborador.</p></div><button class="btn btn-primary" id="inFerNova" type="button">+ Programar Férias</button></div>
  ${filtrosHtml('fer')}
  <div class="in-table-wrap mt-16"><table class="in-table"><thead><tr><th>Colaborador</th><th>Período</th><th>Dias</th><th>Status</th><th>Atualizar</th><th>Ações</th></tr></thead><tbody id="inFerBody"><tr><td colspan="6" class="in-empty">Carregando...</td></tr></tbody></table></div>`;
  area.querySelector('#inFerNova').onclick = () => openFeriasModal();
  bindFiltros(area, 'fer', () => { state.filtros = lerFiltros(area, 'fer'); renderFeriasTable(); });
  area.querySelector('#ferExportar').onclick = exportarFerias;
  loadFerias();
}

// ---------- Atestados ----------

async function loadAtestados() {
  state.atestados = await safe(() => supabase.from('rh_atestados').select('*').order('data_inicio', { ascending: false }).limit(500));
  renderAtestadosTable();
}

function atestadosFiltrados() {
  return aplicarFiltros(state.atestados, state.filtros, { dataKey: 'data_inicio' });
}

function renderAtestadosTable() {
  const body = document.getElementById('inAteBody');
  if (!body) return;
  const rows = atestadosFiltrados();
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="7" class="in-empty">${state.atestados.length ? 'Nenhum atestado no filtro atual.' : 'Nenhum atestado lançado. Clique em <b>+ Lançar Atestado</b> para registrar.'}</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((a) => `<tr>
    <td><b>${esc(a.colaborador_nome)}</b></td>
    <td>${brDate(a.data_inicio)} — ${brDate(a.data_fim)}</td>
    <td>${a.dias ?? '-'} dias${a.cid ? ` · CID: ${esc(a.cid)}` : ''}</td>
    <td>${statusPill(a.status, STATUS_ATESTADO)}</td>
    <td>${a.status !== 'aprovado' ? `<button class="btn btn-small btn-secondary" data-ate-aprovar="${esc(a.id)}" type="button">Aprovar</button>` : '-'}</td>
    <td>${anexoBtnHtml(a.anexo_url)}</td>
    <td>${acoesHtml(a.id)}</td>
  </tr>`).join('');
  bindAnexoButtons(body);
  body.querySelectorAll('[data-ate-aprovar]').forEach((b) => b.onclick = async () => {
    await supabase.from('rh_atestados').update({ status: 'aprovado', updated_at: new Date().toISOString() }).eq('id', b.dataset.ateAprovar);
    await loadAtestados();
  });
  bindAcoes(body, {
    table: 'rh_atestados',
    reload: loadAtestados,
    descricao: 'este atestado',
    onEdit: (id) => {
      const row = state.atestados.find((r) => String(r.id) === String(id));
      if (row) openAtestadoModal(row);
    },
  });
}

function exportarAtestados() {
  exportCsv('atestados', [
    { key: 'colaborador_nome', label: 'Colaborador' },
    { key: 'data_inicio', label: 'Início', fmt: brDate },
    { key: 'data_fim', label: 'Fim', fmt: brDate },
    { key: 'dias', label: 'Dias' },
    { key: 'cid', label: 'CID' },
    { key: 'medico', label: 'Médico' },
    { key: 'status', label: 'Status', fmt: (v) => STATUS_ATESTADO[v]?.label || v },
    { key: 'observacoes', label: 'Observações' },
  ], atestadosFiltrados());
}

function openAtestadoModal(row = null) {
  const modal = document.getElementById('inModal');
  let selecionado = null;
  const d = (v) => v ? String(v).slice(0, 10) : '';
  modal.innerHTML = `<div class="in-modal-card">
    <div class="section-head"><div><h3>${row ? 'Editar Atestado' : 'Lançar Atestado'}</h3><p class="muted">Controle de atestados médicos.</p></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
    <div class="mt-16" style="position:relative">
      <label class="in-full">Colaborador *<input id="ateColabInput" type="text" placeholder="Digite o nome para pesquisar..." autocomplete="off" value="${esc(row?.colaborador_nome || '')}"></label>
      <div id="ateColabSug" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:50;background:#071b13;border:1px solid var(--line);border-radius:14px;padding:6px;max-height:200px;overflow:auto;margin-top:4px"></div>
    </div>
    <div class="in-grid mt-16">
      <label>Início *<input id="ateInicio" type="date" value="${d(row?.data_inicio)}"></label>
      <label>Fim *<input id="ateFim" type="date" value="${d(row?.data_fim)}"></label>
      <label>CID<input id="ateCid" type="text" value="${esc(row?.cid || '')}"></label>
      <label>Médico<input id="ateMedico" type="text" value="${esc(row?.medico || '')}"></label>
      ${anexoFieldHtml('ateAnexo', { label: 'Atestado digitalizado (PDF/foto)', atual: row?.anexo_url })}
      <label class="in-full">Observações<textarea id="ateObs" rows="2">${esc(row?.observacoes || '')}</textarea></label>
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
      const anexo = await resolverAnexo(modal, 'ateAnexo', 'atestados', row?.anexo_url || null);
      const payload = {
        colaborador_id: selecionado?.id || row?.colaborador_id || null,
        colaborador_nome: nome,
        data_inicio: inicio,
        data_fim: fim,
        dias: diasEntre(inicio, fim),
        cid: modal.querySelector('#ateCid').value.trim() || null,
        medico: modal.querySelector('#ateMedico').value.trim() || null,
        anexo_url: anexo,
        observacoes: modal.querySelector('#ateObs').value.trim() || null,
      };
      if (row) {
        payload.updated_at = new Date().toISOString();
        const { error } = await supabase.from('rh_atestados').update(payload).eq('id', row.id);
        if (error) throw error;
      } else {
        payload.status = 'lancado';
        payload.created_by = state.ctx?.user?.id || null;
        const { error } = await supabase.from('rh_atestados').insert(payload);
        if (error) throw error;
      }
      modal.classList.remove('open');
      await loadAtestados();
    } catch (e) { fb.textContent = e.message; fb.classList.add('err'); }
  };
}

function renderAtestadosTab(area) {
  area.innerHTML = `<div class="section-head mt-16"><div><h3>Atestados</h3><p class="muted">Controle de atestados médicos por colaborador.</p></div><button class="btn btn-primary" id="inAteNovo" type="button">+ Lançar Atestado</button></div>
  ${filtrosHtml('ate')}
  <div class="in-table-wrap mt-16"><table class="in-table"><thead><tr><th>Colaborador</th><th>Período</th><th>Dias / CID</th><th>Status</th><th></th><th>Anexo</th><th>Ações</th></tr></thead><tbody id="inAteBody"><tr><td colspan="7" class="in-empty">Carregando...</td></tr></tbody></table></div>`;
  area.querySelector('#inAteNovo').onclick = () => openAtestadoModal();
  bindFiltros(area, 'ate', () => { state.filtros = lerFiltros(area, 'ate'); renderAtestadosTable(); });
  area.querySelector('#ateExportar').onclick = exportarAtestados;
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
  state.filtros = null;
  area.innerHTML = `<div class="in-empty mt-16">Carregando...</div>`;
  if (state.tab === 'indisponiveis') renderIndisponiveisTab(area);
  else if (state.tab === 'ferias') renderFeriasTab(area);
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
