import { initProtectedPage } from './pageInit.js';
import { getSession } from './auth.js';
import { supabase } from './supabaseClient.js';
import { anexarLaudoComGeolocalizacao } from './laudoUpload.js';
import { registrarSaldoKg, anexarAnexoSaldo, precisaAnexoSaldo, ensureRegrasAnexoSaldo, atualizarStatusOsCore } from './programacao-equipe.js';

const BR = new Intl.NumberFormat('pt-BR');
function fmt(v) { return BR.format(Number(v) || 0); }
function brDate(v) { if (!v) return '-'; const [y,m,d] = String(v).slice(0,10).split('-'); return `${d}/${m}/${y}`; }
function esc(v) { return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); }
function safe(d) { return Array.isArray(d) ? d : []; }
function normalizeText(v) { return String(v ?? '').trim().toUpperCase(); }
function chaveContrato(v) { return String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase(); }
function dateFromTomorrowLock() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0,10);
}

const TABS = ['abrir_os', 'atualizar'];
const TAB_LABELS = { abrir_os: 'Abrir OS', atualizar: 'Atualizar' };
const ACAO_LABELS = { conferencia: 'Conferir', saldo: 'Saldo', finalizar: 'Finalizar' };

const OS_STATUS_LABELS = { PENDENTE: 'Pendente', AGUARDAR: 'Aguardar', ATENDER: 'Atender', FINALIZAR: 'Finalizar' };

// Testes exigidos na abertura variam por produto (regra passada pela
// operação 03/08): Milho/Sorgo pedem intensidade do teste de Aflatoxina;
// Soja pode pedir Intacta e/ou GMO Free (independentes); Trigo pede
// Vomitoxina. As chaves aqui (ex.: AFLATOXINA_QUALITATIVO) são o vocabulário
// usado em logistica_abertura_os.testes.opcoes e em grm-sync-abrir-os.js.
const CATALOGO_PRODUTOS = {
  MILHO: { label: 'Milho', tipos: ['Exportação', 'Tipo Exportação'], testes: [
    { key: 'AFLATOXINA_QUALITATIVO', label: 'Teste Aflatoxina — Qualitativo' },
    { key: 'AFLATOXINA_QUANTITATIVO', label: 'Teste Aflatoxina — Quantitativo' },
  ] },
  TRIGUILHO: { label: 'Triguilho', tipos: ['Não Definido'], testes: [] },
  SORGO: { label: 'Sorgo', tipos: ['Não Definido'], testes: [
    { key: 'AFLATOXINA_QUALITATIVO', label: 'Teste Aflatoxina — Qualitativo' },
    { key: 'AFLATOXINA_QUANTITATIVO', label: 'Teste Aflatoxina — Quantitativo' },
  ] },
  SOJA: { label: 'Soja', tipos: ['Participante', 'Declarada Intacta', 'Não Definido', 'Convencional', 'Intacta Positivo', 'Intacta Negativo'], testes: [
    { key: 'INTACTA', label: 'Teste Intacta' },
    { key: 'GMO_FREE', label: 'Teste GMO Free' },
  ] },
  CANOLA: { label: 'Canola', tipos: ['Não Definido'], testes: [] },
  FARELO_POLPA_CITRICA: { label: 'Farelo de Polpa Cítrica', tipos: ['Não Definido'], testes: [] },
  ARROZ_CASCA_NATURAL_TIPO_1: { label: 'Arroz em Casca Natural Tipo 1', tipos: ['Não Definido'], testes: [] },
  MILHETO: { label: 'Milheto', tipos: ['Não Definido'], testes: [] },
  TRITICALE: { label: 'Triticale', tipos: ['Não Definido'], testes: [] },
  TRIGO: { label: 'Trigo', tipos: ['Não Definido'], testes: [
    { key: 'VOMITOXINA', label: 'Teste Vomitoxina' },
  ] },
};

function categoriaProduto(valor) {
  const t = normalizeText(valor);
  if (!t) return null;
  return Object.entries(CATALOGO_PRODUTOS).find(([, config]) => normalizeText(config.label) === t)?.[0] || null;
}

const state = {
  tab: (() => { const h = location.hash.replace('#',''); return TABS.includes(h) ? h : 'abrir_os'; })(),
  rows: [],
  allOs: [],
  allOsFilter: 'TODAS',
  allOsLoading: false,
  aberturaRows: [],
  aberturaRefs: { clientes: [], filiaisPorCliente: {}, armazens: [], destinos: [], locaisDestino: [], regionais: [] },
  aberturaLoading: false,
  aberturaSaving: false,
  aberturaProdutoAtual: '',
  aberturaTestesSelecionados: [],
  osRegional: [],
  osRegionalLoading: false,
  loading: false,
  atualizarAberto: {}, // { [osId]: 'conferencia'|'saldo'|'finalizar' } — ação em edição no momento
  atualizarFiltros: { os: '', cliente: '', cidade: '', local: '' }
};

function getUserField(ctx, ...paths) {
  for (const path of paths) {
    const parts = path.split('.');
    let cur = ctx;
    for (const part of parts) cur = cur?.[part];
    if (cur !== undefined && cur !== null && String(cur).trim() !== '') return cur;
  }
  return null;
}

function getMinhasRegionais(ctx) {
  const raw = getUserField(ctx, 'supervisao', 'user.supervisao', 'coordenacao', 'user.coordenacao') || '';
  return [...new Set(String(raw).split(/[,;|\n]+/).map((s) => normalizeText(s)).filter(Boolean))];
}

const REGIONAL_TABS = ['atualizar'];

export async function renderContent(content, userContext) {
  injectStyles();
  state.ctx = userContext;
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
    if (REGIONAL_TABS.includes(state.tab) && !state.osRegional.length) {
      await Promise.all([loadOsRegional(state.ctx), ensureRegrasAnexoSaldo()]);
    }
    render(content);
  });

  content.addEventListener('click', async (e) => {
    const okBtn = e.target.closest('[data-ok-id]');
    if (okBtn) { await handleOk(okBtn.dataset.okId, okBtn.dataset.okType, content); return; }
    const rejectBtn = e.target.closest('[data-x-id]');
    if (rejectBtn) { await handleReject(rejectBtn.dataset.xId, rejectBtn.dataset.xType, content); return; }

    const osStatusBtn = e.target.closest('[data-os-status][data-os-id]');
    if (osStatusBtn) { await handleOsStatusChange(osStatusBtn.dataset.osId, osStatusBtn.dataset.osStatus, content); return; }

    const osFilterBtn = e.target.closest('[data-os-filter]');
    if (osFilterBtn) { state.allOsFilter = osFilterBtn.dataset.osFilter; render(content); return; }

    if (e.target.closest('#logReload')) { await Promise.all([loadOs(), loadAllOs()]); render(content); return; }
    if (e.target.closest('#abrirOsSalvarBtn')) { await handleSalvarAberturaOs(content); return; }

    const confBtn = e.target.closest('[data-conf-send]');
    if (confBtn) { await handleEnviarConferencia(confBtn.dataset.confSend, content); return; }

    const ajusteBtn = e.target.closest('[data-ajuste-send]');
    if (ajusteBtn) { await handleEnviarAjuste(ajusteBtn.dataset.ajusteSend, content); return; }

    const finalBtn = e.target.closest('[data-final-send]');
    if (finalBtn) { await handleEnviarFinalizacao(finalBtn.dataset.finalSend, content); return; }

    const atzToggle = e.target.closest('[data-atualizar-toggle]');
    if (atzToggle) {
      const id = atzToggle.dataset.atualizarToggle;
      const tipo = atzToggle.dataset.atualizarTipo;
      state.atualizarAberto[id] = state.atualizarAberto[id] === tipo ? null : tipo;
      render(content);
      return;
    }

    const atzOk = e.target.closest('[data-atualizar-ok]');
    if (atzOk) { await handleAtualizarOk(atzOk.dataset.atualizarOk, content); return; }

    if (e.target.closest('#atualizarReload')) { await loadOsRegional(state.ctx); render(content); return; }
  });

  content.addEventListener('input', (e) => {
    const map = { 'atz-f-os': 'os', 'atz-f-cliente': 'cliente', 'atz-f-cidade': 'cidade', 'atz-f-local': 'local' };
    const chave = map[e.target.id];
    if (chave) {
      state.atualizarFiltros[chave] = e.target.value;
      render(content);
      const campo = content.querySelector(`#${e.target.id}`);
      if (campo) { campo.focus(); const len = campo.value.length; campo.setSelectionRange(len, len); }
      return;
    }

    if (e.target.id === 'osProduto') {
      state.aberturaProdutoAtual = e.target.value;
      const categoria = categoriaProduto(e.target.value);
      const chaves = categoria ? CATALOGO_PRODUTOS[categoria].testes.map(o => o.key) : [];
      state.aberturaTestesSelecionados = state.aberturaTestesSelecionados.filter(k => chaves.includes(k));
      const tipo = content.querySelector('#osTipoProduto');
      if (tipo) tipo.innerHTML = `<option value="">${categoria ? 'Selecione' : 'Selecione o produto primeiro'}</option>${(CATALOGO_PRODUTOS[categoria]?.tipos || []).map(v => `<option>${esc(v)}</option>`).join('')}`;
      const testes = content.querySelector('#abrirOsTestesContainer');
      if (testes) testes.innerHTML = renderTestesBlock();
    }
  });

  content.addEventListener('change', (e) => {
    if (e.target.id === 'osContratante') {
      const cliente = normalizeText(e.target.value);
      const filiais = state.aberturaRefs.filiaisPorCliente[cliente] || [];
      const select = content.querySelector('#osFilialPagadora');
      if (select) {
        select.innerHTML = `<option value="">${cliente ? (filiais.length ? 'Selecione' : 'Nenhum Cliente Final associado') : 'Selecione o cliente primeiro'}</option>${filiais.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}`;
        select.disabled = !filiais.length;
      }
      aplicarRegraContratoNoCampo(content, e.target.value);
      return;
    }
    const chk = e.target.closest('[data-teste-key]');
    if (!chk) return;
    const key = chk.dataset.testeKey;
    state.aberturaTestesSelecionados = chk.checked
      ? [...new Set([...state.aberturaTestesSelecionados, key])]
      : state.aberturaTestesSelecionados.filter(k => k !== key);
  });

  if (state.tab === 'abrir_os') await loadAberturaOs();
  if (REGIONAL_TABS.includes(state.tab)) await Promise.all([loadOsRegional(state.ctx), ensureRegrasAnexoSaldo()]);
  render(content);
}

initProtectedPage('Logística', renderContent);

async function loadOs() {
  state.loading = true;
  const { data } = await supabase
    .from('operacional_os')
    .select('id,numero_os,data_os,cliente,embarque,destino,supervisao,remanescente,lote,embarcado,status_gestor,status_logistica,observacao_logistica')
    .or('status_gestor.eq.FINALIZAR,observacao_logistica.ilike.KG solicitado*')
    .or('status_logistica.is.null,status_logistica.eq.PENDENTE')
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

async function loadAberturaRefs() {
  const refs = { clientes: [], filiaisPorCliente: {}, armazens: [], destinos: [], locaisDestino: [], regionais: [] };

  const [prod, os, sup, nacInativos, aliases, contratoRegras] = await Promise.all([
    supabase.from('relatorio_resultado_diario').select('cliente_nacional,cliente_regional,cliente_final,local_embarque,destino').limit(5000),
    supabase.from('operacional_os').select('cliente,embarque,destino,supervisao').limit(5000),
    supabase.from('supervisoes').select('nome').eq('ativo', true).order('nome', { ascending: true }).limit(1000),
    supabase.from('clientes_nacionais').select('nome').eq('ativo', false).limit(1000),
    supabase.from('logistica_clientes_nacionais_aliases').select('alias_normalizado,canonical').limit(1000),
    supabase.from('logistica_clientes_contrato_regras').select('cliente,aliases,tipo,regex_formato,exemplo_formato,rotulo_campo').limit(200),
  ]);
  // Padrão/obrigatoriedade do número de contrato por cliente (planilha da
  // usuária, 27/08) — mesmo esquema de match de precisaAnexoSaldo() em
  // programacao-equipe.js: substring normalizada (sem acento/pontuação/
  // espaço) em ambas direções contra `cliente` OU qualquer `aliases`.
  state.aberturaContratoRegras = safe(contratoRegras.data).map(r => ({
    ...r,
    chaves: [r.cliente, ...(r.aliases || [])].map(chaveContrato).filter(Boolean),
  }));
  // Clientes Nacionais inativos no GRM (roster sincronizado manualmente em
  // clientes_nacionais) não devem aparecer no Contratante/Cliente da Abertura.
  const clientesInativos = new Set(safe(nacInativos.data).map(r => normalizeText(r.nome)));

  // Nomes de cliente nacional chegam com variações (abreviações digitadas
  // diferente no GRM ao longo do tempo p/ o mesmo cliente); essa tabela
  // colapsa essas variações no nome canônico antes de alimentar o dropdown.
  const aliasMap = new Map(safe(aliases.data).map(a => [normalizeText(a.alias_normalizado), a.canonical]));
  const canonicalizeCliente = (v) => {
    const txt = String(v ?? '').trim();
    if (!txt) return txt;
    return aliasMap.get(normalizeText(txt)) || txt;
  };

  const add = (arr, v) => {
    const txt = String(v ?? '').trim();
    if (!txt) return;
    if (!arr.some(x => normalizeText(x) === normalizeText(txt))) arr.push(txt);
  };
  // operacional_os.cliente guarda "RAZÃO SOCIAL - FILIAL" junto (padrão já
  // visto em outras telas deste painel) — só o prefixo é o Cliente Nacional;
  // o sufixo (quando existe) é a Filial Pagadora, aproveitado também.
  const splitClienteFilial = (v) => {
    const txt = String(v ?? '').trim();
    const idx = txt.indexOf(' - ');
    return idx < 0 ? { nacional: txt, filial: '' } : { nacional: txt.slice(0, idx).trim(), filial: txt.slice(idx + 3).trim() };
  };

  safe(prod.data).forEach(r => {
    // cliente_nacional é o único que deve alimentar "Contratante/Cliente" —
    // cliente_regional (ex.: "AMAGGI EXP. E IMP. - GO") é o cliente nacional
    // com a regional/filial já embutida no nome, não um cliente à parte.
    const clienteNacional = canonicalizeCliente(r.cliente_nacional);
    add(refs.clientes, clienteNacional);
    const clienteKey = normalizeText(clienteNacional);
    if (clienteKey) {
      refs.filiaisPorCliente[clienteKey] ||= [];
      add(refs.filiaisPorCliente[clienteKey], r.cliente_final);
    }
    add(refs.armazens, r.local_embarque);
    add(refs.locaisDestino, r.destino);
  });
  safe(os.data).forEach(r => {
    const { nacional, filial } = splitClienteFilial(r.cliente);
    add(refs.clientes, canonicalizeCliente(nacional));
    add(refs.armazens, r.embarque);
    add(refs.locaisDestino, r.destino);
    add(refs.regionais, r.supervisao);
  });
  safe(sup.data).forEach(r => add(refs.regionais, r.nome));

  refs.clientes = refs.clientes.filter(c => !clientesInativos.has(normalizeText(c)));

  ['clientes', 'armazens', 'destinos', 'locaisDestino', 'regionais'].forEach(k => refs[k].sort((a,b)=>String(a).localeCompare(String(b),'pt-BR')));
  Object.values(refs.filiaisPorCliente).forEach(list => list.sort((a,b)=>String(a).localeCompare(String(b),'pt-BR')));
  state.aberturaRefs = refs;
}

// Regra de padrão/obrigatoriedade do número de contrato pro cliente
// selecionado (ou null se não há regra cadastrada -- comportamento padrão:
// campo obrigatório, sem formato fixo).
function contratoRegraPara(clienteNome) {
  const chave = chaveContrato(clienteNome);
  if (!chave) return null;
  const regras = state.aberturaContratoRegras || [];
  return regras.find(r => r.chaves.some(c => c && (chave.includes(c) || c.includes(chave)))) || null;
}

// Aplica a regra de contrato do cliente selecionado no campo "Número
// contrato": rótulo, placeholder e obrigatoriedade mudam conforme o tipo
// ('formato' trava o valor de exemplo como placeholder; 'nao_obrigatorio'
// tira o *; 'obrigatorio' pode trocar o rótulo pra refletir o que o cliente
// realmente pede, ex.: "Pedido de compra").
function aplicarRegraContratoNoCampo(content, clienteNome) {
  const label = content.querySelector('#osNumeroContratoLabel');
  const input = content.querySelector('#osNumeroContrato');
  if (!label || !input) return;
  const regra = contratoRegraPara(clienteNome);
  const rotuloBase = (regra?.rotulo_campo) || 'Número contrato *';
  label.textContent = regra?.tipo === 'nao_obrigatorio' ? rotuloBase.replace(/\s*\*\s*$/, '') : rotuloBase;
  input.placeholder = regra?.tipo === 'formato' ? `Formato: ${regra.exemplo_formato}` : 'Aceita letras, números e símbolos';
  input.dataset.regraTipo = regra?.tipo || '';
  input.dataset.regraRegex = regra?.regex_formato || '';
  input.dataset.regraExemplo = regra?.exemplo_formato || '';
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

// OS da regional do gestor, base compartilhada pela aba "Atualizar" (Conferir/
// Saldo/Finalizar reunidos numa lista só). Últimos 90 dias, filtrado por
// supervisão/coordenação do usuário (mesmo padrão de getMinhasRegionais em
// hospedagem.js); sem regional cadastrada, mostra tudo (fallback).
async function loadOsRegional(ctx) {
  state.osRegionalLoading = true;
  const cutoff = (() => { const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().slice(0,10); })();
  const { data, error } = await supabase
    .from('operacional_os')
    .select('id,numero_os,data_os,cliente,embarque,destino,supervisao,remanescente,lote,status_gestor,status_logistica,observacao_logistica,atualizar_resolvido_tipo,atualizar_resolvido_em')
    .gte('data_os', cutoff)
    .order('data_os', { ascending: false })
    .limit(500);

  if (error) {
    console.error(error);
    state.osRegional = [];
    state.osRegionalLoading = false;
    return;
  }

  const rows = safe(data);
  const minhasRegionais = getMinhasRegionais(ctx);
  state.osRegional = minhasRegionais.length
    ? rows.filter((r) => {
        const reg = normalizeText(r.supervisao);
        return minhasRegionais.some((m) => reg.includes(m) || m.includes(reg));
      })
    : rows;
  state.osRegionalLoading = false;
}

function render(content) {
  const el = content.querySelector('#logContent');
  if (!el) return;
  if (state.tab === 'os') { el.innerHTML = renderOsTab(); return; }
  if (state.tab === 'abrir_os') { el.innerHTML = renderAbrirOsTab(); return; }
  if (state.tab === 'atualizar') { el.innerHTML = renderAtualizarTab(); return; }
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
    <section class="card mt-16 log-finalizacao-card">
      <div class="section-head log-finalizacao-head">
        <div><h3>Finalização</h3><p class="muted">Solicitações enviadas pela Programação para decisão da Logística.</p></div>
        <div class="log-finalizacao-kpis" aria-label="Resumo da fila">
          <span><strong>${logQueue.length}</strong> aguardando</span>
          ${kgRows.length ? `<span class="saldo"><strong>${kgRows.length}</strong> saldo</span>` : ''}
        </div>
      </div>
      <div class="log-table-wrap">
        <table class="log-table log-finalizacao-table">
          <thead><tr>
            <th>O.S. / Regional</th><th>Cliente</th><th>Rota</th><th>Volume</th><th>Decisão</th>
          </tr></thead>
          <tbody>${state.rows.map(rowHtml).join('')}</tbody>
        </table>
      </div>
    </section>` : ''}
  `;
}


function renderTestesBlock() {
  const categoria = categoriaProduto(state.aberturaProdutoAtual);
  const opcoes = categoria ? CATALOGO_PRODUTOS[categoria].testes : null;
  if (!opcoes?.length) return '';
  return `
    <div class="abrir-os-testes mt-16">
      <span class="abrir-os-testes-label">Testes <small>(opcional — selecione quantos precisar)</small></span>
      <div class="abrir-os-testes-opcoes">
        ${opcoes.map(o => `<label class="abrir-os-teste-chip"><input type="checkbox" data-teste-key="${esc(o.key)}" ${state.aberturaTestesSelecionados.includes(o.key) ? 'checked' : ''}> ${esc(o.label)}</label>`).join('')}
      </div>
    </div>`;
}

function renderAbrirOsTab() {
  if (state.aberturaLoading) return `<section class="card mt-16"><p class="muted" style="padding:16px">Carregando abertura de O.S...</p></section>`;

  const opts = (arr) => arr.map(v => `<option value="${esc(v)}"></option>`).join('');
  const pendentes = state.aberturaRows.filter(r => String(r.status || 'PENDENTE') === 'PENDENTE').length;
  const cadastradas = state.aberturaRows.filter(r => String(r.status || '') === 'CADASTRADO').length;

  return `
    <section class="card mt-16">
      <div class="section-head" style="margin-bottom:10px">
        <h3 style="margin:0">Abrir OS</h3>
        <button class="btn btn-secondary" id="abrirOsReload" type="button" onclick="location.reload()">↻ Atualizar</button>
      </div>

      <div class="fob-kpis">
        <div class="fob-kpi"><strong>${pendentes}</strong><span>Aguardando ADM</span></div>
        <div class="fob-kpi ok"><strong>${cadastradas}</strong><span>Cadastradas</span></div>
      </div>

      <datalist id="abrirOsArmazens">${state.aberturaRefs.armazens.map(v => `<option value="${esc(v)}"></option>`).join('')}</datalist>
      <datalist id="abrirOsLocaisDestino">${state.aberturaRefs.locaisDestino.map(v => `<option value="${esc(v)}"></option>`).join('')}</datalist>

      <div class="abrir-os-card">
        <h4>Dados da solicitação</h4>
        <div class="abrir-os-grid">
          <label>Contratante / Cliente *<select id="osContratante" class="log-input"><option value="">Selecione</option>${state.aberturaRefs.clientes.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select></label>
          <label>Filial pagadora *<select id="osFilialPagadora" class="log-input" disabled><option value="">Selecione o cliente primeiro</option></select></label>
          <label>Produtor<input id="osProdutor" class="log-input" placeholder="Opcional"></label>
          <label>Armazém de embarque *<input id="osArmazemEmbarque" class="log-input" list="abrirOsArmazens" placeholder="Armazém/local de embarque"></label>
          <label>Cidade de embarque *<input id="osCidadeEmbarque" class="log-input" placeholder="Cidade-UF"></label>
          <label>Cidade destino *<input id="osCidadeDestino" class="log-input" placeholder="Cidade-UF"></label>
          <label>Local de destino *<input id="osLocalDestino" class="log-input" list="abrirOsLocaisDestino" placeholder="Local de destino"></label>
          <label><span id="osNumeroContratoLabel">Número contrato *</span><input id="osNumeroContrato" class="log-input" placeholder="Aceita letras, números e símbolos"></label>
          <label>Produto *<select id="osProduto" class="log-input"><option value="">Selecione</option>${Object.values(CATALOGO_PRODUTOS).map(p => `<option value="${esc(p.label)}" ${p.label === state.aberturaProdutoAtual ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select></label>
          <label>Tipo de produto *
            <select id="osTipoProduto" class="log-input">
              <option value="">${state.aberturaProdutoAtual ? 'Selecione' : 'Selecione o produto primeiro'}</option>
              ${(CATALOGO_PRODUTOS[categoriaProduto(state.aberturaProdutoAtual)]?.tipos || []).map(tipo => `<option>${esc(tipo)}</option>`).join('')}
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
          <label>Supervisão *<select id="osRegional" class="log-input"><option value="">Selecione</option>${state.aberturaRefs.regionais.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}</select></label>
          <label>Troca de notas *
            <select id="osTrocaNotas" class="log-input"><option value="">Selecione</option><option value="SIM">Sim</option><option value="NAO">Não</option></select>
          </label>
        </div>
        <div id="abrirOsTestesContainer">${renderTestesBlock()}</div>
        <div class="mt-16"><button id="abrirOsSalvarBtn" class="log-btn-ok" type="button">Confirmar e enviar para Logística ADM</button></div>
      </div>

      <div class="mt-16">
        <h4 class="log-subtitle">Minhas solicitações</h4>
        ${renderAberturaOsHistorico()}
      </div>
    </section>
  `;
}

function testesResumo(testes) {
  const categoria = testes?.categoria;
  const opcoes = Array.isArray(testes?.opcoes) ? testes.opcoes : [];
  if (!categoria || !opcoes.length) return '';
  const catalogo = CATALOGO_PRODUTOS[categoria]?.testes || [];
  const labels = opcoes.map(key => catalogo.find(o => o.key === key)?.label || key);
  return `<br><small class="muted">Testes: ${esc(labels.join(', '))}</small>`;
}

function renderAberturaOsHistorico() {
  if (!state.aberturaRows.length) return `<div class="log-empty">Nenhuma solicitação de abertura de O.S. encontrada.</div>`;
  return `<div class="log-table-wrap"><table class="log-table"><thead><tr><th>Data</th><th>Cliente / contrato</th><th>Origem / destino</th><th>Produto</th><th>Status</th></tr></thead><tbody>${state.aberturaRows.map(r => `
    <tr>
      <td data-label="Data">${brDate(r.created_at)}<br><small class="muted">Regional: ${esc(r.regional || '-')}</small></td>
      <td data-label="Cliente / contrato"><strong>${esc(r.contratante_cliente || '-')}</strong><br><small class="muted">Filial: ${esc(r.filial_pagadora || '-')}</small><br><small class="muted">Contrato: ${esc(r.numero_contrato || '-')}</small></td>
      <td data-label="Origem / destino"><strong>${esc(r.armazem_embarque || '-')}</strong><br><small class="muted">${esc(r.cidade_embarque || '-')} → ${esc(r.cidade_destino || '-')}</small><br><small class="muted">Destino: ${esc(r.local_destino || '-')}</small></td>
      <td data-label="Produto">${esc(r.produto || '-')}<br><small class="muted">${esc(r.tipo_produto || '-')} · ${fmt(r.volume_inicial)} tons</small><br><small class="muted">${esc(r.servico || '-')}</small>${testesResumo(r.testes)}</td>
      <td data-label="Status"><span class="log-chip ${String(r.status)==='CADASTRADO'?'ok':String(r.status)==='RECUSADO'?'red':'warn'}">${String(r.status)==='CADASTRADO' ? `OS ${esc(r.numero_os_cadastrada || '')}` : esc(r.status || 'PENDENTE')}</span>${r.observacao_adm ? `<div class="log-obs">${esc(r.observacao_adm)}</div>` : ''}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function osRegionalHead() {
  if (state.osRegionalLoading) return `<p class="muted" style="padding:16px">Carregando O.S. da regional...</p>`;
  return '';
}

function osCellHtml(row) {
  return `<td data-label="O.S."><strong>${esc(row.numero_os)}</strong><br><small class="muted">${brDate(row.data_os)}</small><br><small class="muted">${esc(row.supervisao||'-')}</small></td>
    <td data-label="Cliente / Rota"><strong>${esc(row.cliente||'-')}</strong><div class="muted" style="font-size:11px;margin-top:2px">Emb.: ${esc(row.embarque||'-')} → ${esc(row.destino||'-')}</div></td>
    <td data-label="Remanescente"><span class="log-chip ${Number(row.remanescente)<=0?'warn':'ok'}">${fmt(row.remanescente)}</span></td>`;
}

// Substitui as antigas 3 abas separadas (Conferência / Ajuste de saldo /
// Finalizar) — mesma base de dados (state.osRegional) e mesmas ações de envio
// (handleEnviarConferencia/handleEnviarAjuste/handleEnviarFinalizacao), só que
// numa lista única com filtro e 3 botões de ação por linha. Ver [[painel-web-logistica-atualizar-unificada]].
function filtrarOsRegional() {
  const f = state.atualizarFiltros;
  const norm = (v) => normalizeText(v);
  return state.osRegional.filter((row) => {
    if (f.os && !norm(row.numero_os).includes(norm(f.os))) return false;
    if (f.cliente && !norm(row.cliente).includes(norm(f.cliente))) return false;
    if (f.cidade && !norm(row.embarque).includes(norm(f.cidade)) && !norm(row.destino).includes(norm(f.cidade))) return false;
    if (f.local && !norm(row.embarque).includes(norm(f.local)) && !norm(row.destino).includes(norm(f.local))) return false;
    return true;
  });
}

function acaoPainelHtml(row) {
  const id = esc(row.id);
  const aberta = state.atualizarAberto[row.id];

  if (aberta === 'conferencia') {
    return `<div class="atz-painel">
      <input type="file" id="conf-file-${id}" class="log-file-input" accept="image/*,.pdf,.xlsx,.xls,.csv" multiple>
      <button type="button" class="log-btn-ok mt-8" data-conf-send="${id}">Enviar</button>
    </div>`;
  }
  if (aberta === 'saldo') {
    const regra = precisaAnexoSaldo(row);
    return `<div class="atz-painel atz-painel-saldo">
      <input type="number" min="1" id="ajuste-kg-${id}" class="log-input" placeholder="KG">
      <input type="file" id="ajuste-file-${id}" class="log-file-input" accept="image/*,.pdf" multiple>
      <small class="${regra.precisaAnexo ? 'log-anexo-required' : 'muted'}">${regra.precisaAnexo ? `Cliente ${esc(regra.cliente || row.cliente || '')} exige anexo` : 'Anexo opcional'}</small>
      <button type="button" class="log-btn-ok mt-8" data-ajuste-send="${id}">Enviar</button>
    </div>`;
  }
  if (aberta === 'finalizar') {
    return `<div class="atz-painel">
      <input type="file" id="final-file-${id}" class="log-file-input" accept="image/*,.pdf,.xlsx,.xls,.csv" multiple>
      <button type="button" class="log-btn-ok mt-8" data-final-send="${id}">Enviar</button>
    </div>`;
  }
  return '';
}

function renderAtualizarTab() {
  const loading = osRegionalHead();
  if (loading) return `<section class="card mt-16">${loading}</section>`;

  const rows = filtrarOsRegional();
  const f = state.atualizarFiltros;

  return `
    <section class="card mt-16">
      <div class="section-head">
        <div><h3>Atualizar</h3><p class="muted">O.S. abertas da sua supervisão — conferir, solicitar saldo ou finalizar num só lugar.</p></div>
        <button class="btn btn-secondary" id="atualizarReload" type="button">↻ Atualizar</button>
      </div>
      <div class="atz-filtros">
        <input class="log-input" id="atz-f-os" placeholder="O.S." value="${esc(f.os)}">
        <input class="log-input" id="atz-f-cliente" placeholder="Cliente" value="${esc(f.cliente)}">
        <input class="log-input" id="atz-f-cidade" placeholder="Cidade" value="${esc(f.cidade)}">
        <input class="log-input" id="atz-f-local" placeholder="Local" value="${esc(f.local)}">
      </div>
      <div class="log-table-wrap">
        <table class="log-table">
          <thead><tr><th>O.S.</th><th>Cliente / Rota</th><th>Remanescente</th><th>Ações</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map((row) => {
              const id = esc(row.id);
              const resolvidoTipo = row.atualizar_resolvido_tipo;
              const resolvidoEm = row.atualizar_resolvido_em;

              if (resolvidoEm) {
                return `<tr data-os-row="${id}">
                  ${osCellHtml(row)}
                  <td colspan="2">
                    <div class="atz-resolvido">
                      <span class="log-chip ok atz-resolvido-chip">✔ ${esc(ACAO_LABELS[resolvidoTipo] || 'Solicitação')} concluído pela Logística</span>
                      <button type="button" class="log-btn-ok" data-atualizar-ok="${id}">OK</button>
                    </div>
                  </td>
                </tr>`;
              }

              const laudoEnviado = String(row.observacao_logistica||'').startsWith('LAUDO:');
              const saldoEnviado = String(row.observacao_logistica||'').startsWith('KG solicitado');
              const finalizada = row.status_logistica === 'FINALIZADA';
              const finalizarEnviado = !finalizada && row.status_gestor === 'FINALIZAR';

              const acaoBtn = (tipo, label, enviado) => {
                const aberta = state.atualizarAberto[row.id] === tipo;
                const cls = ['atz-acao-btn'];
                if (aberta) cls.push('open');
                if (enviado) cls.push('sent');
                return `<button type="button" class="${cls.join(' ')}" data-atualizar-toggle="${id}" data-atualizar-tipo="${tipo}">${enviado ? '✔ ' : ''}${label}</button>`;
              };

              return `<tr data-os-row="${id}">
                ${osCellHtml(row)}
                <td>
                  <div class="atz-acoes">
                    ${acaoBtn('conferencia', 'Conferir', laudoEnviado)}
                    ${acaoBtn('saldo', 'Saldo', saldoEnviado)}
                    ${acaoBtn('finalizar', 'Finalizar', finalizada || finalizarEnviado)}
                  </div>
                  ${acaoPainelHtml(row)}
                </td>
              </tr>`;
            }).join('') : `<tr><td class="log-empty" colspan="4" style="text-align:center;padding:24px">Nenhuma O.S. encontrada para este filtro.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function rowHtml(row) {
  const isKg = String(row.observacao_logistica||'').startsWith('KG solicitado');
  const type = isKg ? 'kg' : 'finalizar';
  const rem = Number(row.remanescente);
  return `<tr data-log-row="${esc(String(row.id))}" class="${isKg ? 'is-saldo' : 'is-finalizacao'}">
    <td data-label="O.S. / Regional"><div class="log-os-primary"><strong>${esc(row.numero_os)}</strong><span>${brDate(row.data_os)}</span></div><small class="muted">${esc(row.supervisao||'-')}</small></td>
    <td data-label="Cliente"><div class="log-cliente-name">${esc(row.cliente||'-')}</div><span class="log-request-tag ${isKg ? 'saldo' : ''}">${isKg ? 'Ajuste de saldo' : 'Finalizar OS'}</span></td>
    <td data-label="Rota"><div class="log-route"><span><b>Emb.</b> ${esc(row.embarque||'-')}</span><i aria-hidden="true">→</i><span><b>Dest.</b> ${esc(row.destino||'-')}</span></div></td>
    <td data-label="Volume"><div class="log-volume"><strong>${fmt(rem)}</strong><span>remanescente</span><small>Lote ${fmt(row.lote)}</small></div></td>
    <td data-label="Decisão"><div class="log-decision-actions"><button class="log-decision-btn approve" data-ok-id="${esc(String(row.id))}" data-ok-type="${type}" type="button" aria-label="Aprovar solicitação" title="Aprovar">✓</button><button class="log-decision-btn reject" data-x-id="${esc(String(row.id))}" data-x-type="${type}" type="button" aria-label="Recusar solicitação" title="Recusar">×</button></div></td>
  </tr>`;
}


function valById(content, id) { return content.querySelector(`#${id}`)?.value?.trim() || ''; }
function parseNum(v) { return Number(String(v ?? '').replace(/\./g,'').replace(',','.')) || 0; }

function buildTestesPayload(produto) {
  const categoria = categoriaProduto(produto);
  if (!categoria) return {};
  return { categoria, opcoes: [...state.aberturaTestesSelecionados] };
}

async function handleSalvarAberturaOs(content) {
  if (state.aberturaSaving) return;
  const produto = valById(content, 'osProduto');
  const session = await getSession().catch(() => null);
  const apelido = session?.user?.user_metadata?.apelido;
  const solicitanteNome = (apelido && String(apelido).trim()) || state.ctx?.user?.name || null;
  const solicitanteId = state.ctx?.user?.id || session?.user?.id || null;
  const payload = {
    solicitante_id: solicitanteId,
    solicitante_nome: solicitanteNome,
    contratante_cliente: valById(content, 'osContratante'),
    filial_pagadora: valById(content, 'osFilialPagadora'),
    produtor: valById(content, 'osProdutor') || null,
    armazem_embarque: valById(content, 'osArmazemEmbarque'),
    cidade_embarque: valById(content, 'osCidadeEmbarque'),
    cidade_destino: valById(content, 'osCidadeDestino'),
    local_destino: valById(content, 'osLocalDestino'),
    numero_contrato: valById(content, 'osNumeroContrato'),
    produto,
    tipo_produto: valById(content, 'osTipoProduto'),
    volume_inicial: parseNum(valById(content, 'osVolumeInicial')),
    regional: valById(content, 'osRegional'),
    troca_notas: valById(content, 'osTrocaNotas'),
    servico: valById(content, 'osServico'),
    testes: buildTestesPayload(produto),
    status: 'PENDENTE',
    raw: {}
  };

  // Padrão/obrigatoriedade do número de contrato varia por cliente (ver
  // aplicarRegraContratoNoCampo) — recalculado aqui pra validar no envio
  // mesmo que o usuário nunca tenha disparado o evento 'change' do select.
  const contratoRegra = contratoRegraPara(payload.contratante_cliente);
  const contratoRotulo = (contratoRegra?.rotulo_campo || 'Número contrato').replace(/\s*\*\s*$/, '');

  const obrigatorios = [
    ['Contratante/Cliente', payload.contratante_cliente], ['Filial pagadora', payload.filial_pagadora],
    ['Armazém de embarque', payload.armazem_embarque], ['Cidade de embarque', payload.cidade_embarque],
    ['Cidade destino', payload.cidade_destino], ['Local de destino', payload.local_destino],
    ['Produto', payload.produto], ['Tipo de produto', payload.tipo_produto],
    ['Volume inicial', payload.volume_inicial], ['Regional', payload.regional], ['Troca de notas', payload.troca_notas],
    ['Serviço', payload.servico]
  ];
  if (contratoRegra?.tipo !== 'nao_obrigatorio') obrigatorios.push([contratoRotulo, payload.numero_contrato]);
  const faltando = obrigatorios.filter(([,v]) => !v || Number(v) === 0 && typeof v === 'number').map(([k]) => k);
  if (faltando.length) { alert(`Preencha os campos obrigatórios: ${faltando.join(', ')}`); return; }

  if (contratoRegra?.tipo === 'formato' && payload.numero_contrato) {
    if (!new RegExp(contratoRegra.regex_formato, 'i').test(payload.numero_contrato)) {
      alert(`${contratoRotulo} do cliente ${payload.contratante_cliente} deve seguir o formato: ${contratoRegra.exemplo_formato}`);
      return;
    }
  }

  state.aberturaSaving = true;
  const { error } = await supabase.from('logistica_abertura_os').insert(payload);
  state.aberturaSaving = false;
  if (error) { alert(`${error.message}. Rode o SQL de abertura de OS no Supabase.`); return; }
  state.aberturaProdutoAtual = '';
  state.aberturaTestesSelecionados = [];
  await loadAberturaOs();
  render(content);
  alert('Solicitação enviada para a Logística ADM.');
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

  const request = type === 'kg'
    ? supabase.from('operacional_os').update({ observacao_logistica: null, updated_at: new Date().toISOString() }).eq('id', id)
    : supabase.rpc('decidir_finalizacao_os_logistica', { p_os_id: id, p_aprovar: true });
  const { error } = await request;
  if (error) {
    alert(error.message);
    if (btn) { btn.disabled = false; btn.textContent = '✓'; }
    return;
  }
  state.rows = state.rows.filter(r => String(r.id) !== String(id));
  render(content);
}

async function handleReject(id, type, content) {
  const row = state.rows.find(r => String(r.id) === String(id));
  if (!row) return;
  const btn = content.querySelector(`[data-x-id="${id}"]`);
  if (btn) btn.disabled = true;
  const request = type === 'kg'
    ? supabase.from('operacional_os').update({ observacao_logistica: null, updated_at: new Date().toISOString() }).eq('id', id)
    : supabase.rpc('decidir_finalizacao_os_logistica', { p_os_id: id, p_aprovar: false });
  const { error } = await request;
  if (error) {
    alert(error.message);
    if (btn) btn.disabled = false;
    return;
  }
  state.rows = state.rows.filter(r => String(r.id) !== String(id));
  render(content);
}

function currentUsuario() {
  const u = state.ctx?.user || {};
  return { id: u.id || null, nome: u.name || u.email || null };
}

// Upload de anexo pra Finalizar: mesmo bucket/tabela de auditoria usados por
// anexarLaudoComGeolocalizacao (laudoUpload.js), mas SEM tocar em
// operacional_os.observacao_logistica -- esse campo já é dono do prefixo
// "LAUDO:" (Conferência) e "KG solicitado" (Ajuste de saldo); finalizar usa
// status_gestor/status_logistica (via atualizarStatusOsCore) pra não colidir.
async function uploadAnexoLogistica(osId, files, origem) {
  const usuario = currentUsuario();
  const urls = [];
  for (const file of files) {
    const path = `${osId}/${origem}_${Date.now()}_${(file.name || 'anexo').replace(/\s+/g, '_')}`;
    const { data: up, error: upErr } = await supabase.storage.from('os-laudos').upload(path, file, { upsert: true });
    if (upErr) throw upErr;
    const { data: urlData } = supabase.storage.from('os-laudos').getPublicUrl(up.path);
    urls.push(urlData.publicUrl);
  }
  const { error } = await supabase.from('operacional_laudos').insert({
    os_id: osId,
    arquivos_urls: urls,
    origem,
    enviado_por: usuario.id,
    enviado_por_nome: usuario.nome,
  });
  if (error) throw error;
  return urls;
}

async function handleEnviarConferencia(osId, content) {
  const fileInput = content.querySelector(`#conf-file-${CSS.escape(String(osId))}`);
  const files = [...(fileInput?.files || [])];
  if (!files.length) { alert('Anexe o relatório de correção antes de enviar.'); return; }

  const btn = content.querySelector(`[data-conf-send="${osId}"]`);
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
  try {
    await anexarLaudoComGeolocalizacao(osId, files, { origem: 'logistica_gestor_conferencia', usuario: currentUsuario() });
    state.atualizarAberto[osId] = null;
    await loadOsRegional(state.ctx);
    render(content);
  } catch (error) {
    alert(error.message || 'Erro ao enviar o relatório.');
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar'; }
  }
}

async function handleEnviarAjuste(osId, content) {
  const row = state.osRegional.find((r) => String(r.id) === String(osId));
  if (!row) return;

  const kgInput = content.querySelector(`#ajuste-kg-${CSS.escape(String(osId))}`);
  const kg = Number(kgInput?.value || 0);
  if (!kg || kg <= 0) { alert('Informe a quantidade de KG.'); return; }

  const regra = precisaAnexoSaldo(row);
  const fileInput = content.querySelector(`#ajuste-file-${CSS.escape(String(osId))}`);
  const files = [...(fileInput?.files || [])];
  if (regra.precisaAnexo && !files.length) { alert(`Cliente ${regra.cliente || row.cliente || ''} exige anexo para liberar o saldo.`); return; }

  const btn = content.querySelector(`[data-ajuste-send="${osId}"]`);
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
  try {
    if (files.length) await anexarAnexoSaldo(osId, files, { usuario: currentUsuario() });
    await registrarSaldoKg(osId, kg);
    state.atualizarAberto[osId] = null;
    await loadOsRegional(state.ctx);
    render(content);
  } catch (error) {
    alert(error.message || 'Erro ao solicitar ajuste de saldo.');
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar'; }
  }
}

async function handleEnviarFinalizacao(osId, content) {
  const row = state.osRegional.find((r) => String(r.id) === String(osId));
  if (!row) return;

  const fileInput = content.querySelector(`#final-file-${CSS.escape(String(osId))}`);
  const files = [...(fileInput?.files || [])];
  if (!files.length) { alert('Anexe o relatório de correção antes de enviar.'); return; }

  const btn = content.querySelector(`[data-final-send="${osId}"]`);
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
  try {
    await uploadAnexoLogistica(osId, files, 'logistica_gestor_finalizacao');
    await atualizarStatusOsCore(row, 'FINALIZAR', state.ctx?.user?.id || null);
    state.atualizarAberto[osId] = null;
    await loadOsRegional(state.ctx);
    render(content);
  } catch (error) {
    alert(error.message || 'Erro ao enviar para finalização.');
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar'; }
  }
}

// A Logística ADM já resolveu (marcou atualizar_resolvido_*, ver adm-logistica.js) --
// aqui o Gestor só confirma que viu, limpando o sinal. O trabalho operacional em si
// (observacao_logistica/status_gestor/status_logistica) já foi feito pela ADM.
async function handleAtualizarOk(osId, content) {
  const btn = content.querySelector(`[data-atualizar-ok="${osId}"]`);
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  const { error } = await supabase.from('operacional_os').update({
    atualizar_resolvido_tipo: null,
    atualizar_resolvido_em: null,
    atualizar_resolvido_por: null,
    updated_at: new Date().toISOString(),
  }).eq('id', osId);
  if (error) {
    alert(error.message);
    if (btn) { btn.disabled = false; btn.textContent = 'OK'; }
    return;
  }
  const row = state.osRegional.find((r) => String(r.id) === String(osId));
  if (row) { row.atualizar_resolvido_tipo = null; row.atualizar_resolvido_em = null; row.atualizar_resolvido_por = null; }
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
    .log-input{width:100%;box-sizing:border-box;min-height:40px;border:1px solid var(--line-2);background:#0a1e17;color:var(--text);border-radius:11px;padding:9px 11px;outline:none;color-scheme:dark;font-size:14px}
    select.log-input{appearance:none;-webkit-appearance:none;-moz-appearance:none;padding-right:36px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='M5 7.5L10 12.5L15 7.5' stroke='%236fd0a5' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;background-size:14px}
    .log-input:focus{border-color:var(--green-2);outline:2px solid rgba(111,208,165,.16)}
    .log-file-input{display:block;font-size:12px;color:#8fa1b5;max-width:260px}
    .log-anexo-required{display:block;color:#fde68a;font-weight:800;margin-top:2px}
    .mt-8{margin-top:8px}
    .log-muted-box{border:1px dashed rgba(148,163,184,.18);border-radius:16px;padding:14px;color:#8fa1b5;background:rgba(15,23,42,.28);margin:12px 0}
    .log-alert.bad{border:1px solid rgba(239,68,68,.26);background:rgba(239,68,68,.08);color:#fecaca;border-radius:16px;padding:12px;margin:14px 0}
    .fob-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:0 0 12px}
    .fob-kpi{border:1px solid rgba(52,211,153,.14);background:rgba(2,6,23,.3);border-radius:13px;padding:9px 13px}
    .fob-kpi strong{display:block;font-size:20px;color:#e5e7eb;line-height:1.1}.fob-kpi span{color:#8fa1b5;font-size:11px;font-weight:800}.fob-kpi.ok strong{color:#86efac}.fob-kpi.bad strong{color:#fca5a5}.fob-kpi.gray strong{color:#cbd5e1}
    .fob-add{border:1px solid rgba(52,211,153,.14);border-radius:18px;background:rgba(2,6,23,.18);padding:14px;margin-bottom:16px}.fob-add summary{cursor:pointer;color:#bbf7d0;font-weight:950}.fob-add-grid{display:grid;grid-template-columns:1.2fr .7fr 1fr 1.5fr;gap:12px;margin:14px 0}.fob-add label{font-size:12px;color:#8fa1b5;font-weight:900}.fob-os-line{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:6px}.fob-add label>.log-input,.fob-add label textarea,.fob-add label input[list]{margin-top:6px}
    .fob-os-found{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr));gap:10px;border:1px solid rgba(34,197,94,.18);background:rgba(22,101,52,.12);border-radius:16px;padding:12px;margin:12px 0}.fob-os-found small{display:block;color:#8fa1b5;font-size:11px}.fob-os-found strong{display:block;color:#e5e7eb;margin-top:3px}
    .abrir-os-card{border:1px solid rgba(52,211,153,.14);border-radius:16px;background:rgba(2,6,23,.18);padding:14px;margin-top:14px}.abrir-os-card h4{margin:0 0 10px;color:#bbf7d0;font-size:14px}.abrir-os-grid{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:10px}.abrir-os-grid label{font-size:11px;color:#8fa1b5;font-weight:800}.abrir-os-grid .log-input{margin-top:4px}.abrir-os-testes{border:1px solid rgba(250,204,21,.28);border-radius:12px;background:rgba(113,63,18,.12);padding:10px 12px}.abrir-os-testes-label{display:block;font-size:11px;color:#fde68a;font-weight:800;margin-bottom:8px}.abrir-os-testes-opcoes{display:flex;flex-wrap:wrap;gap:8px}.abrir-os-teste-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#e5e7eb;background:rgba(15,23,42,.4);border:1px solid rgba(250,204,21,.2);border-radius:999px;padding:6px 12px;cursor:pointer}.abrir-os-teste-chip input{accent-color:#facc15}.log-subtitle{color:#bbf7d0;margin:0 0 12px;font-weight:950}
    .fob-list{display:flex;flex-direction:column;gap:10px}.fob-row{display:grid;grid-template-columns:1fr 1.7fr 1.4fr 1.2fr .9fr 1.5fr;gap:12px;align-items:center;border:1px solid rgba(52,211,153,.12);background:rgba(15,23,42,.26);border-radius:18px;padding:14px}.fob-row.unseen{background:linear-gradient(90deg,rgba(148,163,184,.14),rgba(15,23,42,.25));border-color:rgba(148,163,184,.22)}.fob-row.valid{border-color:rgba(34,197,94,.26)}.fob-row.invalid{border-color:rgba(239,68,68,.26)}.fob-cell strong{display:block;color:#e5e7eb;font-weight:950}.fob-cell span{display:block;color:#8fa1b5;font-size:12px;margin-top:3px;line-height:1.35}.fob-cell.status .log-chip,.fob-cell.view .log-chip{display:inline-flex}.fob-tons{font-weight:800}.fob-cell.actions{display:grid;grid-template-columns:1fr 52px 52px;gap:8px}.fob-obs{min-width:170px}.fob-icon{border:0;border-radius:14px;min-height:44px;font-size:22px;font-weight:950;cursor:pointer}.fob-icon.ok{background:linear-gradient(135deg,#16a34a,#34d399);color:#052e16}.fob-icon.bad{background:rgba(127,29,29,.9);color:#fecaca}.fob-icon:hover{opacity:.88}
    .log-os-filter-bar{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.log-os-filter-btn{border:1px solid rgba(52,211,153,.18);background:rgba(15,23,42,.5);color:#8fa1b5;border-radius:10px;padding:7px 14px;font-size:12px;font-weight:900;cursor:pointer}.log-os-filter-btn.active{background:rgba(22,101,52,.32);border-color:rgba(34,197,94,.4);color:#bbf7d0}.log-os-count{display:inline-flex;align-items:center;justify-content:center;background:rgba(148,163,184,.14);border-radius:999px;padding:2px 7px;font-size:11px;margin-left:4px}
    .atz-filtros{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;margin:14px 0}
    .atz-acoes{display:flex;gap:6px;flex-wrap:wrap}
    .atz-acao-btn{border:1px solid rgba(52,211,153,.22);background:rgba(15,23,42,.6);color:#8fa1b5;border-radius:10px;padding:7px 12px;font-size:12px;font-weight:900;cursor:pointer;white-space:nowrap}
    .atz-acao-btn:hover{background:rgba(22,101,52,.16);color:#bbf7d0}
    .atz-acao-btn.open{background:rgba(59,130,246,.2);border-color:rgba(96,165,250,.45);color:#bfdbfe}
    .atz-acao-btn.sent{background:rgba(22,163,74,.18);border-color:rgba(34,197,94,.4);color:#bbf7d0}
    .atz-painel{margin-top:10px;padding:10px;border:1px dashed rgba(96,165,250,.3);border-radius:12px;background:rgba(15,23,42,.35);display:flex;flex-wrap:wrap;align-items:center;gap:8px}
    .atz-painel-saldo input[type=number]{max-width:110px}
    .atz-resolvido{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .atz-resolvido-chip{background:rgba(22,163,74,.28)!important;border-color:rgba(34,197,94,.6)!important;color:#dcfce7!important;font-weight:950;animation:atzResolvidoPulse 1.4s ease infinite}
    @keyframes atzResolvidoPulse{50%{box-shadow:0 0 0 4px rgba(34,197,94,.16)}}
    .log-os-actions{display:flex;gap:6px}.log-os-status-btn{display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(52,211,153,.2);background:rgba(15,23,42,.6);color:#8fa1b5;border-radius:10px;width:36px;height:36px;cursor:pointer;transition:background .15s}.log-os-status-btn.yellow.active,.log-os-status-btn.yellow:hover{background:rgba(250,204,21,.18);border-color:rgba(250,204,21,.35);color:#fde68a}.log-os-status-btn.blue.active,.log-os-status-btn.blue:hover{background:rgba(59,130,246,.18);border-color:rgba(96,165,250,.35);color:#bfdbfe}.log-os-status-btn.green.active,.log-os-status-btn.green:hover{background:rgba(22,163,74,.22);border-color:rgba(34,197,94,.4);color:#bbf7d0}
    @media(max-width:1100px){.abrir-os-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.fob-kpis,.fob-add-grid,.fob-os-found{grid-template-columns:1fr 1fr}.fob-row{grid-template-columns:1fr}.fob-cell.actions{grid-template-columns:1fr 52px 52px}}
    @media(max-width:820px){.abrir-os-grid{grid-template-columns:1fr 1fr}}
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
