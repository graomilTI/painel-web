import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getColaboradores } from './colaboradoresCache.js';

const BR = new Intl.NumberFormat('pt-BR');
function fmt(v) { return BR.format(Number(v) || 0); }
function brDate(v) { if (!v) return '-'; const [y,m,d] = String(v).slice(0,10).split('-'); return `${d}/${m}/${y}`; }
function esc(v) { return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); }
function safe(d) { return Array.isArray(d) ? d : []; }
function todayISO() { return new Date().toISOString().slice(0,10); }
function normalizeText(v) { return String(v ?? '').trim().toUpperCase(); }
function dateFromTomorrowLock() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0,10);
}

const TABS = ['abrir_os','fob','report','conferir'];
const TAB_LABELS = { abrir_os: 'Abrir OS', fob: 'FOB', report: 'Report', conferir: 'Conferir' };

const OS_STATUS_LABELS = { PENDENTE: 'Pendente', AGUARDAR: 'Aguardar', ATENDER: 'Atender', FINALIZAR: 'Finalizar' };

const state = {
  tab: (() => { const h = location.hash.replace('#',''); return ['abrir_os','fob','report','conferir'].includes(h) ? h : 'abrir_os'; })(),
  rows: [],
  allOs: [],
  allOsFilter: 'TODAS',
  allOsLoading: false,
  fobRows: [],
  aberturaRows: [],
  aberturaRefs: { clientes: [], filiais: [], armazens: [], destinos: [], locaisDestino: [], regionais: [] },
  aberturaLoading: false,
  aberturaSaving: false,
  colaboradores: [],
  fobLoading: false,
  fobSaving: false,
  fobSearchOs: null,
  fobSearchError: '',
  loading: false
};

initProtectedPage('Logística', async (content) => {
  injectStyles();
  content.innerHTML = `
    <section class="card mt-16">
      <div class="log-tab-bar">${TABS.map(t => `<button class="log-tab ${state.tab===t?'active':''}" data-tab="${t}">${TAB_LABELS[t]}</button>`).join('')}</div>
    </section>
    <div id="logContent"></div>
  `;

  content.querySelector('.log-tab-bar').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    state.tab = btn.dataset.tab;
    location.hash = state.tab;
    content.querySelectorAll('.log-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
    if (state.tab === 'os' && !state.rows.length) await Promise.all([loadOs(), loadAllOs()]);
    if (state.tab === 'abrir_os' && !state.aberturaRows.length) await loadAberturaOs();
    if (state.tab === 'fob' && !state.fobRows.length) await loadFob();
    render(content);
  });

  content.addEventListener('click', async (e) => {
    const okBtn = e.target.closest('[data-ok-id]');
    if (okBtn) { await handleOk(okBtn.dataset.okId, okBtn.dataset.okType, content); return; }

    const osStatusBtn = e.target.closest('[data-os-status][data-os-id]');
    if (osStatusBtn) { await handleOsStatusChange(osStatusBtn.dataset.osId, osStatusBtn.dataset.osStatus, content); return; }

    const osFilterBtn = e.target.closest('[data-os-filter]');
    if (osFilterBtn) { state.allOsFilter = osFilterBtn.dataset.osFilter; render(content); return; }

    if (e.target.closest('#logReload')) { await Promise.all([loadOs(), loadAllOs()]); render(content); return; }
    if (e.target.closest('#fobReload')) { await loadFob(); render(content); return; }
    if (e.target.closest('#fobSearchOsBtn')) { await handleBuscarOsFob(content); return; }
    if (e.target.closest('#fobAddManualBtn')) { await handleAdicionarFobManual(content); return; }
    if (e.target.closest('#abrirOsSalvarBtn')) { await handleSalvarAberturaOs(content); return; }

    const validBtn = e.target.closest('[data-fob-action]');
    if (validBtn) {
      await handleValidarFob(validBtn.dataset.fobId, validBtn.dataset.fobAction, content);
      return;
    }
  });

  if (state.tab === 'fob') await loadFob();
  else if (state.tab === 'abrir_os') await loadAberturaOs();
  render(content);
});

async function loadOs() {
  state.loading = true;
  const { data } = await supabase
    .from('operacional_os')
    .select('id,numero_os,data_os,cliente,embarque,destino,supervisao,remanescente,lote,embarcado,status_gestor,status_logistica,observacao_logistica')
    .or('status_gestor.eq.FINALIZAR,observacao_logistica.ilike.KG solicitado*,remanescente.eq.0')
    .or('status_logistica.is.null,status_logistica.neq.FINALIZADA')
    .order('data_os', { ascending: false })
    .limit(1000);
  state.rows = safe(data);
  state.loading = false;
}

async function loadAllOs() {
  state.allOsLoading = true;
  const cutoff = (() => { const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().slice(0,10); })();
  const { data } = await supabase
    .from('operacional_os')
    .select('id,numero_os,data_os,cliente,embarque,destino,supervisao,remanescente,lote,embarcado,status_gestor,status_logistica')
    .gte('data_os', cutoff)
    .not('status_logistica', 'eq', 'FINALIZADA')
    .order('data_os', { ascending: false })
    .limit(500);
  state.allOs = safe(data);
  state.allOsLoading = false;
}

async function loadFob() {
  state.fobLoading = true;
  state.fobSearchError = '';
  await ensureColaboradores();

  const { data, error } = await supabase
    .from('logistica_fob')
    .select('id,data_referencia,numero_os,cliente,supervisao,funcionario,cidade,local_embarque,motivo,status_comparacao,status,visualizado,tons_movimento,tons_producao,tons_nh,observacao,observacao_gestor,origem,criado_em,validado_em,updated_at')
    .order('data_referencia', { ascending: false })
    .order('criado_em', { ascending: false })
    .limit(1500);

  if (error) {
    console.error(error);
    state.fobRows = [];
    state.fobSearchError = error.message || 'Falha ao carregar FOB.';
  } else {
    state.fobRows = safe(data);
  }
  state.fobLoading = false;
}


async function loadAberturaRefs() {
  const refs = { clientes: [], filiais: [], armazens: [], destinos: [], locaisDestino: [], regionais: [] };

  const [prod, os, sup] = await Promise.all([
    supabase.from('relatorio_resultado_diario').select('cliente_nacional,cliente_regional,cliente_final,local_embarque,destino').limit(5000),
    supabase.from('operacional_os').select('cliente,embarque,destino,supervisao').limit(5000),
    supabase.from('supervisoes').select('nome').eq('ativo', true).order('nome', { ascending: true }).limit(1000),
  ]);

  const add = (arr, v) => {
    const txt = String(v ?? '').trim();
    if (!txt) return;
    if (!arr.some(x => normalizeText(x) === normalizeText(txt))) arr.push(txt);
  };

  safe(prod.data).forEach(r => {
    add(refs.clientes, r.cliente_nacional);
    add(refs.clientes, r.cliente_regional);
    add(refs.filiais, r.cliente_final);
    add(refs.armazens, r.local_embarque);
    add(refs.locaisDestino, r.destino);
  });
  safe(os.data).forEach(r => {
    add(refs.clientes, r.cliente);
    add(refs.armazens, r.embarque);
    add(refs.locaisDestino, r.destino);
    add(refs.regionais, r.supervisao);
  });
  safe(sup.data).forEach(r => add(refs.regionais, r.nome));

  Object.keys(refs).forEach(k => refs[k].sort((a,b)=>String(a).localeCompare(String(b),'pt-BR')));
  state.aberturaRefs = refs;
}

async function loadAberturaOs() {
  state.aberturaLoading = true;
  await loadAberturaRefs();
  const { data, error } = await supabase
    .from('logistica_abertura_os')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error(error);
    state.aberturaRows = [];
  } else {
    state.aberturaRows = safe(data);
  }
  state.aberturaLoading = false;
}

const COLAB_SS_KEY = 'grao1000:logistica-colab:v1';

async function ensureColaboradores() {
  if (state.colaboradores.length) return;

  try {
    const raw = sessionStorage.getItem(COLAB_SS_KEY);
    if (raw) {
      const { data } = JSON.parse(raw);
      if (Array.isArray(data) && data.length) { state.colaboradores = data; return; }
    }
  } catch {}

  try {
    const colabs = await getColaboradores({ somenteAtivos: true }); // cache compartilhado
    if (colabs.length) {
      const seen = new Set();
      state.colaboradores = colabs.filter(c => {
        const key = normalizeText(c.cpf || c.nome);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      try { sessionStorage.setItem(COLAB_SS_KEY, JSON.stringify({ data: state.colaboradores })); } catch {}
      return;
    }
  } catch {}

  const fallback = await supabase
    .from('colaboradores')
    .select('nome,cpf,supervisao,coordenacao')
    .order('nome', { ascending: true })
    .limit(1200);

  state.colaboradores = safe(fallback.data);
  if (state.colaboradores.length) {
    try { sessionStorage.setItem(COLAB_SS_KEY, JSON.stringify({ data: state.colaboradores })); } catch {}
  }
}

function render(content) {
  const el = content.querySelector('#logContent');
  if (!el) return;
  if (state.tab === 'os') { el.innerHTML = renderOsTab(); return; }
  if (state.tab === 'abrir_os') { el.innerHTML = renderAbrirOsTab(); return; }
  if (state.tab === 'fob') { el.innerHTML = renderFobTab(); return; }
  el.innerHTML = `<section class="card mt-16"><div class="log-empty">Módulo <strong>${TAB_LABELS[state.tab]}</strong> em desenvolvimento.</div></section>`;
}

function renderOsTab() {
  const loading = state.loading || state.allOsLoading;
  if (loading) return `<section class="card mt-16"><p class="muted" style="padding:16px">Carregando...</p></section>`;

  const allFiltered = (() => {
    const f = state.allOsFilter;
    if (f === 'TODAS') return state.allOs;
    if (f === 'PENDENTE') return state.allOs.filter(r => !r.status_gestor);
    return state.allOs.filter(r => String(r.status_gestor || '') === f);
  })();

  const counts = {
    TODAS: state.allOs.length,
    PENDENTE: state.allOs.filter(r => !r.status_gestor).length,
    AGUARDAR: state.allOs.filter(r => r.status_gestor === 'AGUARDAR').length,
    ATENDER: state.allOs.filter(r => r.status_gestor === 'ATENDER').length,
    FINALIZAR: state.allOs.filter(r => r.status_gestor === 'FINALIZAR').length,
  };

  const kgRows = state.rows.filter(r => String(r.observacao_logistica||'').startsWith('KG solicitado'));
  const logQueue = state.rows.filter(r => !String(r.observacao_logistica||'').startsWith('KG solicitado'));

  const ICO_AGUARDAR = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
  const ICO_ATENDER = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
  const ICO_FINALIZAR = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

  const statusBtn = (id, status, ico, cls, active) =>
    `<button class="log-os-status-btn ${cls}${active ? ' active' : ''}" data-os-id="${esc(String(id))}" data-os-status="${status}" type="button" title="${OS_STATUS_LABELS[status]}">${ico}</button>`;

  const osRow = (r) => {
    const st = r.status_gestor || null;
    const rem = Number(r.remanescente);
    const zero = rem === 0;
    return `<tr>
      <td data-label="O.S."><strong>${esc(r.numero_os)}</strong><br><small class="muted">${brDate(r.data_os)}</small><br><small class="muted">${esc(r.supervisao||'-')}</small></td>
      <td data-label="Cliente / Rota"><strong>${esc(r.cliente||'-')}</strong><div class="muted" style="font-size:11px;margin-top:2px">Emb: ${esc(r.embarque||'-')} → ${esc(r.destino||'-')}</div></td>
      <td data-label="Remanescente"><span class="log-chip ${rem<=0?'warn':'ok'}">${fmt(rem)}</span></td>
      <td data-label="Status"><span class="log-chip ${!st?'gray':st==='AGUARDAR'?'warn':st==='ATENDER'?'blue':st==='FINALIZAR'?'ok':'gray'}">${OS_STATUS_LABELS[st||'PENDENTE']||st||'Pendente'}</span></td>
      <td data-label="Ação">
        <div class="log-os-actions">
          ${zero
            ? statusBtn(r.id,'FINALIZAR',ICO_FINALIZAR,'green',st==='FINALIZAR')
            : `${statusBtn(r.id,'AGUARDAR',ICO_AGUARDAR,'yellow',st==='AGUARDAR')}${statusBtn(r.id,'ATENDER',ICO_ATENDER,'blue',st==='ATENDER')}${statusBtn(r.id,'FINALIZAR',ICO_FINALIZAR,'green',st==='FINALIZAR')}`}
        </div>
      </td>
    </tr>`;
  };

  const FILTERS = ['TODAS','PENDENTE','AGUARDAR','ATENDER','FINALIZAR'];
  const filterBar = `<div class="log-os-filter-bar">${FILTERS.map(f =>
    `<button class="log-os-filter-btn${state.allOsFilter===f?' active':''}" data-os-filter="${f}" type="button">${f==='TODAS'?'Todas':OS_STATUS_LABELS[f]} <span class="log-os-count">${counts[f]}</span></button>`
  ).join('')}</div>`;

  return `
    <section class="card mt-16">
      <div class="section-head">
        <div><h3>Distribuição de O.S.</h3><p class="muted">Gerencie o status das ordens de serviço ativas.</p></div>
        <button class="btn btn-secondary" id="logReload" type="button">↻ Atualizar</button>
      </div>
      ${filterBar}
      <div class="log-table-wrap">
        <table class="log-table">
          <thead><tr><th>O.S.</th><th>Cliente / Rota</th><th>Remanescente</th><th>Status</th><th>Ação</th></tr></thead>
          <tbody>
            ${allFiltered.length
              ? allFiltered.map(osRow).join('')
              : `<tr><td class="log-empty" colspan="5" style="text-align:center;padding:24px">Nenhuma O.S. encontrada para este filtro.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>

    ${(kgRows.length || logQueue.length) ? `
    <section class="card mt-16">
      <div class="section-head">
        <div><h3>Fila Logística</h3><p class="muted">${logQueue.length} para concluir · ${kgRows.length} aumento de saldo</p></div>
      </div>
      <div class="log-table-wrap">
        <table class="log-table">
          <thead><tr>
            <th>O.S.</th><th>Cliente / Rota</th><th>Remanescente</th><th>Solicitação</th><th>Ação</th>
          </tr></thead>
          <tbody>${state.rows.map(rowHtml).join('')}</tbody>
        </table>
      </div>
    </section>` : ''}
  `;
}


function renderAbrirOsTab() {
  if (state.aberturaLoading) return `<section class="card mt-16"><p class="muted" style="padding:16px">Carregando abertura de O.S...</p></section>`;

  const opts = (arr) => arr.map(v => `<option value="${esc(v)}"></option>`).join('');
  const pendentes = state.aberturaRows.filter(r => String(r.status || 'PENDENTE') === 'PENDENTE').length;
  const cadastradas = state.aberturaRows.filter(r => String(r.status || '') === 'CADASTRADO').length;

  return `
    <section class="card mt-16">
      <div class="section-head">
        <div>
          <h3>Abrir OS</h3>
          <p class="muted">Solicite a abertura de uma nova O.S. para a Logística ADM cadastrar e devolver o número da O.S.</p>
        </div>
        <button class="btn btn-secondary" id="abrirOsReload" type="button" onclick="location.reload()">↻ Atualizar</button>
      </div>

      <div class="fob-kpis">
        <div class="fob-kpi"><strong>${pendentes}</strong><span>Aguardando ADM</span></div>
        <div class="fob-kpi ok"><strong>${cadastradas}</strong><span>Cadastradas</span></div>
      </div>

      <datalist id="abrirOsClientes">${opts(state.aberturaRefs.clientes)}</datalist>
      <datalist id="abrirOsFiliais">${opts(state.aberturaRefs.filiais)}</datalist>
      <datalist id="abrirOsArmazens">${opts(state.aberturaRefs.armazens)}</datalist>
      <datalist id="abrirOsLocaisDestino">${opts(state.aberturaRefs.locaisDestino)}</datalist>
      <datalist id="abrirOsRegionais">${opts(state.aberturaRefs.regionais)}</datalist>
      <datalist id="abrirOsProdutos"><option value="Soja"></option><option value="Trigo"></option><option value="Milho"></option><option value="Sorgo"></option></datalist>

      <div class="abrir-os-card">
        <h4>Dados da solicitação</h4>
        <div class="abrir-os-grid">
          <label>Contratante / Cliente *<input id="osContratante" class="log-input" list="abrirOsClientes" placeholder="Digite o cliente"></label>
          <label>Filial pagadora *<input id="osFilialPagadora" class="log-input" list="abrirOsFiliais" placeholder="Cliente final / filial"></label>
          <label>Produtor<input id="osProdutor" class="log-input" placeholder="Opcional"></label>
          <label>Armazém de embarque *<input id="osArmazemEmbarque" class="log-input" list="abrirOsArmazens" placeholder="Armazém/local de embarque"></label>
          <label>Cidade de embarque *<input id="osCidadeEmbarque" class="log-input" placeholder="Cidade-UF"></label>
          <label>Cidade destino *<input id="osCidadeDestino" class="log-input" placeholder="Cidade-UF"></label>
          <label>Local de destino *<input id="osLocalDestino" class="log-input" list="abrirOsLocaisDestino" placeholder="Local de destino"></label>
          <label>Número contrato *<input id="osNumeroContrato" class="log-input" placeholder="Aceita letras, números e símbolos"></label>
          <label>Produto *<input id="osProduto" class="log-input" list="abrirOsProdutos" placeholder="Soja, trigo, milho, sorgo..."></label>
          <label>Tipo de produto *
            <select id="osTipoProduto" class="log-input">
              <option value="">Selecione</option>
              <option>Aflatoxina Negativo</option><option>Convencional</option><option>Declarado Intacta</option><option>Intacta Negativo</option><option>Intacta Positivo</option><option>Não Definido</option><option>OS com teste</option><option>Participante</option><option>Transgênico</option>
            </select>
          </label>
          <label>Serviço *
            <select id="osServico" class="log-input">
              <option value="">Selecione</option>
              <option value="FOB">FOB</option>
              <option value="CIF">CIF</option>
              <option value="AUDITORIA">AUDITORIA</option>
              <option value="CLASSIFICAÇÃO TRANSB. SAÍDA">CLASSIFICAÇÃO TRANSB. SAÍDA</option>
              <option value="ACOMPANHAMENTO DE EMBARQUE">ACOMPANHAMENTO DE EMBARQUE</option>
              <option value="CLASSIFICAÇÃO TRANSB. ENTRADA">CLASSIFICAÇÃO TRANSB. ENTRADA</option>
            </select>
          </label>
          <label>Volume inicial (Tons) *<input id="osVolumeInicial" class="log-input" type="number" step="0.001" min="0" placeholder="0,000"></label>
          <label>Regional *<input id="osRegional" class="log-input" list="abrirOsRegionais" placeholder="Supervisão"></label>
          <label>Troca de notas *
            <select id="osTrocaNotas" class="log-input"><option value="">Selecione</option><option value="SIM">Sim</option><option value="NAO">Não</option></select>
          </label>
        </div>
        <div class="mt-16"><button id="abrirOsSalvarBtn" class="log-btn-ok" type="button">Confirmar e enviar para Logística ADM</button></div>
      </div>

      <div class="mt-16">
        <h4 class="log-subtitle">Minhas solicitações</h4>
        ${renderAberturaOsHistorico()}
      </div>
    </section>
  `;
}

function renderAberturaOsHistorico() {
  if (!state.aberturaRows.length) return `<div class="log-empty">Nenhuma solicitação de abertura de O.S. encontrada.</div>`;
  return `<div class="log-table-wrap"><table class="log-table"><thead><tr><th>Data</th><th>Cliente / contrato</th><th>Origem / destino</th><th>Produto</th><th>Status</th></tr></thead><tbody>${state.aberturaRows.map(r => `
    <tr>
      <td data-label="Data">${brDate(r.created_at)}<br><small class="muted">Regional: ${esc(r.regional || '-')}</small></td>
      <td data-label="Cliente / contrato"><strong>${esc(r.contratante_cliente || '-')}</strong><br><small class="muted">Filial: ${esc(r.filial_pagadora || '-')}</small><br><small class="muted">Contrato: ${esc(r.numero_contrato || '-')}</small></td>
      <td data-label="Origem / destino"><strong>${esc(r.armazem_embarque || '-')}</strong><br><small class="muted">${esc(r.cidade_embarque || '-')} → ${esc(r.cidade_destino || '-')}</small><br><small class="muted">Destino: ${esc(r.local_destino || '-')}</small></td>
      <td data-label="Produto">${esc(r.produto || '-')}<br><small class="muted">${esc(r.tipo_produto || '-')} · ${fmt(r.volume_inicial)} tons</small><br><small class="muted">${esc(r.servico || '-')}</small></td>
      <td data-label="Status"><span class="log-chip ${String(r.status)==='CADASTRADO'?'ok':String(r.status)==='RECUSADO'?'red':'warn'}">${String(r.status)==='CADASTRADO' ? `OS ${esc(r.numero_os_cadastrada || '')}` : esc(r.status || 'PENDENTE')}</span>${r.observacao_adm ? `<div class="log-obs">${esc(r.observacao_adm)}</div>` : ''}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function renderFobTab() {
  if (state.fobLoading) return `<section class="card mt-16"><p class="muted" style="padding:16px">Carregando FOB...</p></section>`;

  const pendentes = state.fobRows.filter(r => String(r.status || 'PENDENTE') === 'PENDENTE');
  const naoVisualizados = state.fobRows.filter(r => r.visualizado === false && String(r.status || 'PENDENTE') === 'PENDENTE');
  const validos = state.fobRows.filter(r => String(r.status || '') === 'VALIDO').length;
  const invalidos = state.fobRows.filter(r => String(r.status || '') === 'INVALIDO').length;

  return `
    <section class="card mt-16">
      <div class="section-head">
        <div>
          <h3>FOB do Gestor</h3>
          <p class="muted">Histórico permanente de FOB. Valide todos os pendentes para liberar a programação do dia seguinte.</p>
        </div>
        <button class="btn btn-secondary" id="fobReload" type="button">↻ Atualizar</button>
      </div>

      <div class="fob-kpis">
        <div class="fob-kpi"><strong>${pendentes.length}</strong><span>Pendentes</span></div>
        <div class="fob-kpi gray"><strong>${naoVisualizados.length}</strong><span>Não visualizados</span></div>
        <div class="fob-kpi ok"><strong>${validos}</strong><span>Válidos</span></div>
        <div class="fob-kpi bad"><strong>${invalidos}</strong><span>Inválidos</span></div>
      </div>

      ${state.fobSearchError ? `<div class="log-alert bad">${esc(state.fobSearchError)}</div>` : ''}

      <details class="fob-add" open>
        <summary>+ Adicionar FOB</summary>
        <div class="fob-add-grid">
          <label>O.S.
            <div class="fob-os-line">
              <input id="fobOsInput" class="log-input" type="text" placeholder="Digite a OS" value="${esc(state.fobSearchOs?.numero_os || '')}">
              <button id="fobSearchOsBtn" class="btn btn-secondary" type="button">Buscar OS</button>
            </div>
          </label>
          <label>Data da FOB
            <input id="fobDataInput" class="log-input" type="date" value="${esc(state.fobSearchOs?.data_os || todayISO())}">
          </label>
          <label>Colaborador
            <input id="fobColabInput" class="log-input" list="fobColabList" placeholder="Digite o nome do colaborador">
            <datalist id="fobColabList">${state.colaboradores.map(c => `<option value="${esc(c.nome)}"></option>`).join('')}</datalist>
          </label>
          <label>Motivo
            <textarea id="fobMotivoInput" class="log-input" rows="2" placeholder="Motivo da FOB"></textarea>
          </label>
        </div>
        ${state.fobSearchOs ? renderOsEncontrada(state.fobSearchOs) : `<div class="log-muted-box">Digite a O.S. e clique em <strong>Buscar OS</strong> para puxar cliente, supervisão e local automaticamente.</div>`}
        <button id="fobAddManualBtn" class="log-btn-ok" type="button">Salvar FOB</button>
      </details>

      <div class="fob-list">
        ${state.fobRows.length ? state.fobRows.map(fobRowHtml).join('') : `<div class="log-empty">Nenhum FOB encontrado no histórico.</div>`}
      </div>
    </section>
  `;
}

function renderOsEncontrada(os) {
  return `<div class="fob-os-found">
    <div><small>Cliente</small><strong>${esc(os.cliente || '-')}</strong></div>
    <div><small>Supervisão</small><strong>${esc(os.supervisao || '-')}</strong></div>
    <div><small>Local / embarque</small><strong>${esc(os.embarque || os.local_embarque || '-')}</strong></div>
    <div><small>Destino</small><strong>${esc(os.destino || '-')}</strong></div>
  </div>`;
}

function fobRowHtml(row) {
  const status = String(row.status || 'PENDENTE').toUpperCase();
  const unseen = row.visualizado === false && status === 'PENDENTE';
  const cls = status === 'VALIDO' ? 'valid' : status === 'INVALIDO' ? 'invalid' : unseen ? 'unseen' : 'pending';
  const comp = String(row.status_comparacao || 'PENDENTE').toUpperCase();
  const compLabel = comp === 'OK' ? 'Comparação OK' : comp === 'DOIS EMBARQUES' ? 'Dois embarques' : 'Comparação pendente';
  const statusLabel = status === 'VALIDO' ? 'FOB válida' : status === 'INVALIDO' ? 'FOB inválida' : 'Não validada';

  return `<article class="fob-row ${cls}">
    <div class="fob-cell date"><strong>${brDate(row.data_referencia)}</strong><span>${esc(row.supervisao || '-')}</span></div>
    <div class="fob-cell main"><strong>${esc(row.cliente || '-')}</strong><span>OS: ${esc(row.numero_os || '-')}</span><span>Local: ${esc(row.local_embarque || row.cidade || '-')}</span></div>
    <div class="fob-cell person"><strong>${esc(row.funcionario || '-')}</strong><span>${esc(row.motivo || row.observacao || 'FOB pendente sem confirmação na mesma data')}</span></div>
    <div class="fob-cell status"><span class="log-chip ${comp === 'OK' ? 'ok' : comp === 'DOIS EMBARQUES' ? 'warn' : 'red'}">${compLabel}</span><span class="fob-tons">Mov.: ${fmt(row.tons_movimento)} · Prod.: ${fmt(row.tons_producao)} · NHE: ${fmt(row.tons_nh)}</span></div>
    <div class="fob-cell view"><span class="log-chip ${unseen ? 'gray' : status === 'VALIDO' ? 'ok' : status === 'INVALIDO' ? 'red' : 'warn'}">${unseen ? 'Não visualizado' : statusLabel}</span></div>
    <div class="fob-cell actions">
      <input class="log-input fob-obs" data-fob-obs="${esc(String(row.id))}" placeholder="Observação do gestor" value="${esc(row.observacao_gestor || '')}">
      <button class="fob-icon ok" title="FOB válida" data-fob-id="${esc(String(row.id))}" data-fob-action="VALIDO" type="button">✓</button>
      <button class="fob-icon bad" title="FOB inválida" data-fob-id="${esc(String(row.id))}" data-fob-action="INVALIDO" type="button">×</button>
    </div>
  </article>`;
}

function rowHtml(row) {
  const isKg = String(row.observacao_logistica||'').startsWith('KG solicitado');
  const isFinalizar = !isKg && String(row.status_gestor||'') === 'FINALIZAR';
  const isSaldoZero = !isKg && !isFinalizar && Number(row.remanescente) === 0;
  const type = isKg ? 'kg' : isSaldoZero ? 'saldo_zero' : 'finalizar';
  const badge = isKg
    ? `<span class="log-chip red">↑ KG</span><div class="log-obs">${esc(row.observacao_logistica)}</div>`
    : isSaldoZero
      ? `<span class="log-chip warn">Saldo zerado</span>`
      : `<span class="log-chip blue">$ Finalizar</span>`;
  const rem = Number(row.remanescente);
  return `<tr data-log-row="${esc(String(row.id))}">
    <td data-label="O.S."><strong>${esc(row.numero_os)}</strong><br><small class="muted">${brDate(row.data_os)}</small><br><small class="muted">${esc(row.supervisao||'-')}</small></td>
    <td data-label="Cliente / Rota"><div style="font-weight:850">${esc(row.cliente||'-')}</div><div class="muted" style="font-size:12px;margin-top:3px">Emb.: ${esc(row.embarque||'-')}</div><div class="muted" style="font-size:12px">Dest.: ${esc(row.destino||'-')}</div></td>
    <td data-label="Remanescente"><span class="log-chip ${rem<=0?'warn':'ok'}">${fmt(rem)}</span><div class="muted" style="font-size:11px;margin-top:4px">Lote ${fmt(row.lote)}</div></td>
    <td data-label="Solicitação">${badge}</td>
    <td data-label="Ação"><button class="log-btn-ok" data-ok-id="${esc(String(row.id))}" data-ok-type="${type}" type="button">OK</button></td>
  </tr>`;
}


function valById(content, id) { return content.querySelector(`#${id}`)?.value?.trim() || ''; }
function parseNum(v) { return Number(String(v ?? '').replace(/\./g,'').replace(',','.')) || 0; }

async function handleSalvarAberturaOs(content) {
  if (state.aberturaSaving) return;
  const payload = {
    contratante_cliente: valById(content, 'osContratante'),
    filial_pagadora: valById(content, 'osFilialPagadora'),
    produtor: valById(content, 'osProdutor') || null,
    armazem_embarque: valById(content, 'osArmazemEmbarque'),
    cidade_embarque: valById(content, 'osCidadeEmbarque'),
    cidade_destino: valById(content, 'osCidadeDestino'),
    local_destino: valById(content, 'osLocalDestino'),
    numero_contrato: valById(content, 'osNumeroContrato'),
    produto: valById(content, 'osProduto'),
    tipo_produto: valById(content, 'osTipoProduto'),
    volume_inicial: parseNum(valById(content, 'osVolumeInicial')),
    regional: valById(content, 'osRegional'),
    troca_notas: valById(content, 'osTrocaNotas'),
    servico: valById(content, 'osServico'),
    status: 'PENDENTE',
    raw: {}
  };

  const obrigatorios = [
    ['Contratante/Cliente', payload.contratante_cliente], ['Filial pagadora', payload.filial_pagadora],
    ['Armazém de embarque', payload.armazem_embarque], ['Cidade de embarque', payload.cidade_embarque],
    ['Cidade destino', payload.cidade_destino], ['Local de destino', payload.local_destino],
    ['Número contrato', payload.numero_contrato], ['Produto', payload.produto], ['Tipo de produto', payload.tipo_produto],
    ['Volume inicial', payload.volume_inicial], ['Regional', payload.regional], ['Troca de notas', payload.troca_notas],
    ['Serviço', payload.servico]
  ];
  const faltando = obrigatorios.filter(([,v]) => !v || Number(v) === 0 && typeof v === 'number').map(([k]) => k);
  if (faltando.length) { alert(`Preencha os campos obrigatórios: ${faltando.join(', ')}`); return; }

  state.aberturaSaving = true;
  const { error } = await supabase.from('logistica_abertura_os').insert(payload);
  state.aberturaSaving = false;
  if (error) { alert(`${error.message}. Rode o SQL de abertura de OS no Supabase.`); return; }
  await loadAberturaOs();
  render(content);
  alert('Solicitação enviada para a Logística ADM.');
}

async function handleBuscarOsFob(content) {
  const os = content.querySelector('#fobOsInput')?.value?.trim();
  if (!os) { alert('Digite a O.S. para buscar.'); return; }
  state.fobSearchError = '';

  const { data, error } = await supabase
    .from('operacional_os')
    .select('id,numero_os,data_os,cliente,embarque,destino,supervisao,remanescente,lote,embarcado')
    .eq('numero_os', os)
    .maybeSingle();

  if (error) {
    state.fobSearchOs = null;
    state.fobSearchError = error.message;
  } else if (!data) {
    state.fobSearchOs = null;
    state.fobSearchError = `O.S. ${os} não encontrada.`;
  } else {
    state.fobSearchOs = data;
  }
  render(content);
}

async function handleAdicionarFobManual(content) {
  if (state.fobSaving) return;

  const numeroOs = content.querySelector('#fobOsInput')?.value?.trim();
  const dataRef = content.querySelector('#fobDataInput')?.value || state.fobSearchOs?.data_os || todayISO();
  const funcionario = content.querySelector('#fobColabInput')?.value?.trim();
  const motivo = content.querySelector('#fobMotivoInput')?.value?.trim();

  if (!numeroOs) { alert('Digite a O.S.'); return; }
  if (!funcionario) { alert('Informe o colaborador.'); return; }
  if (!motivo) { alert('Informe o motivo da FOB.'); return; }

  state.fobSaving = true;
  const os = state.fobSearchOs || {};
  const row = {
    data: dataRef,
    os: numeroOs,
    cliente: os.cliente || null,
    supervisao: os.supervisao || null,
    funcionario,
    cidade: null,
    local: os.embarque || null,
    status: 'PENDENTE',
    motivo,
    observacao: motivo,
    tons_movimento: 0,
    tons_producao: 0,
    tons_nh: 0,
    origem: 'MANUAL_GESTOR',
    raw: { operacional_os: os }
  };

  let error = null;
  const rpc = await supabase.rpc('salvar_logistica_fob_importacao', { p_linhas: [row] });
  if (rpc.error) {
    const direct = await supabase.from('logistica_fob').insert({
      data_referencia: row.data,
      numero_os: row.os,
      cliente: row.cliente,
      supervisao: row.supervisao,
      funcionario: row.funcionario,
      cidade: row.cidade,
      local_embarque: row.local,
      status_comparacao: 'PENDENTE',
      status: 'PENDENTE',
      visualizado: false,
      motivo: row.motivo,
      observacao: row.observacao,
      tons_movimento: 0,
      tons_producao: 0,
      tons_nh: 0,
      origem: 'MANUAL_GESTOR',
      raw: row.raw
    });
    error = direct.error;
  }

  state.fobSaving = false;
  if (error) { alert(error.message); return; }

  state.fobSearchOs = null;
  await loadFob();
  render(content);
}

async function handleValidarFob(id, action, content) {
  const obs = content.querySelector(`[data-fob-obs="${CSS.escape(String(id))}"]`)?.value?.trim() || null;
  const { data: userData } = await supabase.auth.getUser();
  const patch = {
    status: action === 'VALIDO' ? 'VALIDO' : 'INVALIDO',
    visualizado: true,
    observacao_gestor: obs,
    validado_em: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  if (userData?.user?.id) patch.validado_por = userData.user.id;

  const { error } = await supabase.from('logistica_fob').update(patch).eq('id', id);
  if (error) { alert(error.message); return; }

  state.fobRows = state.fobRows.map(r => String(r.id) === String(id) ? { ...r, ...patch } : r);
  render(content);
}

async function handleOsStatusChange(id, newStatus, content) {
  const row = state.allOs.find(r => String(r.id) === String(id));
  if (!row) return;
  const currentStatus = row.status_gestor || null;
  const patch = currentStatus === newStatus
    ? { status_gestor: null, updated_at: new Date().toISOString() }
    : { status_gestor: newStatus, updated_at: new Date().toISOString() };

  const { error } = await supabase.from('operacional_os').update(patch).eq('id', id);
  if (error) { alert(error.message); return; }
  Object.assign(row, patch);

  if (newStatus === 'FINALIZAR' && patch.status_gestor === 'FINALIZAR') {
    if (!state.rows.find(r => String(r.id) === String(id))) await loadOs();
  } else if (patch.status_gestor === null) {
    state.rows = state.rows.filter(r => String(r.id) !== String(id));
  }

  render(content);
}

async function handleOk(id, type, content) {
  const row = state.rows.find(r => String(r.id) === String(id));
  if (!row) return;
  const btn = content.querySelector(`[data-ok-id="${id}"]`);
  if (btn) { btn.disabled = true; btn.textContent = '...'; }

  const patch = type === 'kg'
    ? { observacao_logistica: null, updated_at: new Date().toISOString() }
    : { status_gestor: null, status_logistica: 'FINALIZADA', finalizado_em: new Date().toISOString(), updated_at: new Date().toISOString() };

  const { error } = await supabase.from('operacional_os').update(patch).eq('id', id);
  if (error) {
    alert(error.message);
    if (btn) { btn.disabled = false; btn.textContent = 'OK'; }
    return;
  }
  state.rows = state.rows.filter(r => String(r.id) !== String(id));
  render(content);
}

function injectStyles() {
  if (document.getElementById('log-styles')) return;
  const s = document.createElement('style');
  s.id = 'log-styles';
  s.textContent = `
    .log-tab-bar{display:flex;gap:8px;flex-wrap:wrap}
    .log-tab{background:rgba(15,23,42,.6);border:1px solid rgba(52,211,153,.18);color:#6b7280;border-radius:12px;padding:10px 22px;font-weight:900;cursor:pointer;font-size:14px;transition:background .15s}
    .log-tab.active{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16;border-color:transparent}
    .log-tab:hover:not(.active){background:rgba(22,101,52,.15);color:#bbf7d0}
    .log-table-wrap{overflow:auto;border:1px solid rgba(52,211,153,.16);border-radius:18px;background:rgba(2,6,23,.25);margin-top:16px}
    .log-table{width:100%;min-width:720px;border-collapse:separate;border-spacing:0;color:#e2e2f0}
    .log-table th{position:sticky;top:0;background:#07170f;color:#bbf7d0;text-align:left;padding:11px 13px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid rgba(52,211,153,.18);z-index:1}
    .log-table td{padding:11px 13px;border-bottom:1px solid rgba(148,163,184,.1);vertical-align:middle}
    .log-table tr:last-child td{border-bottom:0}
    .log-table tr:hover td{background:rgba(22,101,52,.07)}
    .log-chip{display:inline-flex;align-items:center;border-radius:999px;padding:5px 10px;font-size:12px;font-weight:900;white-space:nowrap}
    .log-chip.ok{background:rgba(22,163,74,.13);color:#bbf7d0;border:1px solid rgba(22,163,74,.2)}
    .log-chip.warn{background:rgba(250,204,21,.14);color:#fde68a;border:1px solid rgba(250,204,21,.2)}
    .log-chip.red{background:rgba(239,68,68,.12);color:#fca5a5;border:1px solid rgba(239,68,68,.2)}
    .log-chip.blue{background:rgba(59,130,246,.12);color:#bfdbfe;border:1px solid rgba(59,130,246,.2)}
    .log-chip.gray{background:rgba(148,163,184,.13);color:#cbd5e1;border:1px solid rgba(148,163,184,.2)}
    .log-obs{font-size:11px;color:#6b7280;margin-top:4px;line-height:1.3}
    .log-btn-ok{background:linear-gradient(135deg,#16a34a,#86efac);color:#052e16;border:0;border-radius:12px;padding:9px 22px;font-weight:950;cursor:pointer;font-size:13px;transition:opacity .15s}
    .log-btn-ok:hover{opacity:.88}
    .log-btn-ok:disabled{opacity:.45;cursor:wait}
    .log-empty{border:1px dashed rgba(148,163,184,.2);border-radius:18px;padding:32px;color:#6b7280;text-align:center}
    .log-input{width:100%;border:1px solid rgba(52,211,153,.16);background:#020617;color:#e5e7eb;border-radius:12px;padding:11px 12px;outline:none;color-scheme:dark}
    .log-input:focus{border-color:rgba(34,197,94,.55);box-shadow:0 0 0 3px rgba(34,197,94,.08)}
    .log-muted-box{border:1px dashed rgba(148,163,184,.18);border-radius:16px;padding:14px;color:#8fa1b5;background:rgba(15,23,42,.28);margin:12px 0}
    .log-alert.bad{border:1px solid rgba(239,68,68,.26);background:rgba(239,68,68,.08);color:#fecaca;border-radius:16px;padding:12px;margin:14px 0}
    .fob-kpis{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr));gap:12px;margin:16px 0}
    .fob-kpi{border:1px solid rgba(52,211,153,.14);background:linear-gradient(180deg,rgba(15,23,42,.45),rgba(2,6,23,.2));border-radius:18px;padding:14px}
    .fob-kpi strong{display:block;font-size:28px;color:#e5e7eb;line-height:1}.fob-kpi span{color:#8fa1b5;font-size:12px;font-weight:800}.fob-kpi.ok strong{color:#86efac}.fob-kpi.bad strong{color:#fca5a5}.fob-kpi.gray strong{color:#cbd5e1}
    .fob-add{border:1px solid rgba(52,211,153,.14);border-radius:18px;background:rgba(2,6,23,.18);padding:14px;margin-bottom:16px}.fob-add summary{cursor:pointer;color:#bbf7d0;font-weight:950}.fob-add-grid{display:grid;grid-template-columns:1.2fr .7fr 1fr 1.5fr;gap:12px;margin:14px 0}.fob-add label{font-size:12px;color:#8fa1b5;font-weight:900}.fob-os-line{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:6px}.fob-add label>.log-input,.fob-add label textarea,.fob-add label input[list]{margin-top:6px}
    .fob-os-found{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr));gap:10px;border:1px solid rgba(34,197,94,.18);background:rgba(22,101,52,.12);border-radius:16px;padding:12px;margin:12px 0}.fob-os-found small{display:block;color:#8fa1b5;font-size:11px}.fob-os-found strong{display:block;color:#e5e7eb;margin-top:3px}
    .abrir-os-card{border:1px solid rgba(52,211,153,.14);border-radius:18px;background:rgba(2,6,23,.18);padding:16px;margin-top:16px}.abrir-os-card h4{margin:0 0 14px;color:#bbf7d0}.abrir-os-grid{display:grid;grid-template-columns:repeat(3,minmax(180px,1fr));gap:12px}.abrir-os-grid label{font-size:12px;color:#8fa1b5;font-weight:900}.abrir-os-grid .log-input{margin-top:6px}.log-subtitle{color:#bbf7d0;margin:0 0 12px;font-weight:950}
    .fob-list{display:flex;flex-direction:column;gap:10px}.fob-row{display:grid;grid-template-columns:1fr 1.7fr 1.4fr 1.2fr .9fr 1.5fr;gap:12px;align-items:center;border:1px solid rgba(52,211,153,.12);background:rgba(15,23,42,.26);border-radius:18px;padding:14px}.fob-row.unseen{background:linear-gradient(90deg,rgba(148,163,184,.14),rgba(15,23,42,.25));border-color:rgba(148,163,184,.22)}.fob-row.valid{border-color:rgba(34,197,94,.26)}.fob-row.invalid{border-color:rgba(239,68,68,.26)}.fob-cell strong{display:block;color:#e5e7eb;font-weight:950}.fob-cell span{display:block;color:#8fa1b5;font-size:12px;margin-top:3px;line-height:1.35}.fob-cell.status .log-chip,.fob-cell.view .log-chip{display:inline-flex}.fob-tons{font-weight:800}.fob-cell.actions{display:grid;grid-template-columns:1fr 52px 52px;gap:8px}.fob-obs{min-width:170px}.fob-icon{border:0;border-radius:14px;min-height:44px;font-size:22px;font-weight:950;cursor:pointer}.fob-icon.ok{background:linear-gradient(135deg,#16a34a,#34d399);color:#052e16}.fob-icon.bad{background:rgba(127,29,29,.9);color:#fecaca}.fob-icon:hover{opacity:.88}
    .log-os-filter-bar{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.log-os-filter-btn{border:1px solid rgba(52,211,153,.18);background:rgba(15,23,42,.5);color:#8fa1b5;border-radius:10px;padding:7px 14px;font-size:12px;font-weight:900;cursor:pointer}.log-os-filter-btn.active{background:rgba(22,101,52,.32);border-color:rgba(34,197,94,.4);color:#bbf7d0}.log-os-count{display:inline-flex;align-items:center;justify-content:center;background:rgba(148,163,184,.14);border-radius:999px;padding:2px 7px;font-size:11px;margin-left:4px}
    .log-os-actions{display:flex;gap:6px}.log-os-status-btn{display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(52,211,153,.2);background:rgba(15,23,42,.6);color:#8fa1b5;border-radius:10px;width:36px;height:36px;cursor:pointer;transition:background .15s}.log-os-status-btn.yellow.active,.log-os-status-btn.yellow:hover{background:rgba(250,204,21,.18);border-color:rgba(250,204,21,.35);color:#fde68a}.log-os-status-btn.blue.active,.log-os-status-btn.blue:hover{background:rgba(59,130,246,.18);border-color:rgba(96,165,250,.35);color:#bfdbfe}.log-os-status-btn.green.active,.log-os-status-btn.green:hover{background:rgba(22,163,74,.22);border-color:rgba(34,197,94,.4);color:#bbf7d0}
    @media(max-width:1100px){.abrir-os-grid{grid-template-columns:1fr 1fr}.fob-kpis,.fob-add-grid,.fob-os-found{grid-template-columns:1fr 1fr}.fob-row{grid-template-columns:1fr}.fob-cell.actions{grid-template-columns:1fr 52px 52px}}
    @media(max-width:680px){.abrir-os-grid{grid-template-columns:1fr}.fob-kpis,.fob-add-grid,.fob-os-found{grid-template-columns:1fr}.fob-os-line{grid-template-columns:1fr}.log-tab{flex:1}.fob-cell.actions{grid-template-columns:1fr 48px 48px}}
    @media(max-width:720px){
      .log-table-wrap{overflow:visible;border:0;background:transparent;margin-top:12px}
      .log-table{min-width:0;width:100%}
      .log-table thead{display:none}
      .log-table,.log-table tbody,.log-table tr,.log-table td{display:block;width:100%}
      .log-table tr{margin-bottom:12px;border:1px solid rgba(52,211,153,.16);border-radius:18px;overflow:hidden;background:rgba(2,6,23,.25)}
      .log-table tr:last-child{margin-bottom:0}
      .log-table td{padding:10px 13px;border-bottom:1px solid rgba(148,163,184,.1)}
      .log-table td:last-child{border-bottom:0}
      .log-table td[data-label]::before{content:attr(data-label);display:block;font-size:10px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;margin-bottom:5px}
      .log-os-actions{flex-wrap:wrap}
    }
  `;
  document.head.appendChild(s);
}
