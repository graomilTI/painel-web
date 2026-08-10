import { supabase } from './supabaseClient.js';

const state = {
  people: new Map(),
  panelRows: new Map(),
  history: [],
  historyError: '',
  sort: { field: 'data', direction: 'desc' },
  mounted: false,
  loading: false,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');
const norm = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, ' ')
  .trim()
  .toUpperCase();
const brDate = (value) => {
  if (!value) return '-';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(value);
};
const money = (value) => Number(value || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function injectStyles() {
  if ($('#hospV2HistoryStyles')) return;
  const style = document.createElement('style');
  style.id = 'hospV2HistoryStyles';
  style.textContent = `
    .hosp-v2-people{display:block;margin-top:9px;color:#d8eee3;font-size:11.5px;line-height:1.35}
    .hosp-v2-people-names{display:inline;min-width:0}
    .hosp-v2-person{display:inline;max-width:100%;padding:0;border:0;border-radius:0;background:transparent;color:inherit;font-weight:800;white-space:normal}
    .hosp-v2-history-list{display:grid;gap:8px;margin-top:14px}
    .hosp-v2-history-head{display:grid;grid-template-columns:minmax(190px,.9fr) minmax(270px,1.35fr) minmax(190px,.8fr) minmax(190px,.8fr);padding:0 10px;color:#91a89e}.hosp-v2-history-sort{display:flex;align-items:center;gap:6px;padding:7px 9px;border:0;border-radius:7px;background:transparent;color:inherit;font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.08em;cursor:pointer;text-align:left}.hosp-v2-history-sort:hover,.hosp-v2-history-sort.active{color:#86efac;background:rgba(74,222,128,.07)}
    #tab-historico .adm-hosp-table-wrap{display:none!important}
    .hosp-v2-history-row{position:relative;display:grid;grid-template-columns:minmax(190px,.9fr) minmax(270px,1.35fr) minmax(190px,.8fr) minmax(190px,.8fr);overflow:hidden;border:1px solid rgba(34,197,94,.28);border-radius:15px;background:linear-gradient(100deg,rgba(5,27,20,.98),rgba(2,16,12,.98));box-shadow:0 10px 28px rgba(0,0,0,.18);transition:.16s ease}
    .hosp-v2-history-row::before{content:"";position:absolute;left:4px;top:24px;width:3px;height:28px;border-radius:999px;background:#4ade80;box-shadow:0 0 14px rgba(74,222,128,.6)}
    .hosp-v2-history-row:hover{border-color:rgba(74,222,128,.7);box-shadow:0 0 0 1px rgba(74,222,128,.12),0 16px 36px rgba(0,0,0,.25)}
    .hosp-v2-history-cell{min-width:0;padding:14px 15px;border-right:1px solid rgba(74,222,128,.11)}
    .hosp-v2-history-cell:last-child{border-right:0}
    .hosp-v2-history-date{font-size:14px;font-weight:950;color:#f3fff8}
    .hosp-v2-history-name{margin-top:6px;color:#dfffea;font-size:12.5px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .hosp-v2-history-title{color:#effff5;font-size:12.5px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .hosp-v2-history-sub{display:block;margin-top:5px;color:#8ba59a;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .hosp-v2-history-meta{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px;color:#b7ccc2;font-size:11px}
    .hosp-v2-history-pill{display:inline-flex;align-items:center;margin-top:7px;padding:5px 9px;border-radius:999px;border:1px solid rgba(74,222,128,.25);background:rgba(22,101,52,.2);color:#a7f3c0;font-size:10px;font-weight:950;text-transform:uppercase}
    .hosp-v2-history-pill.warn{color:#fde68a;background:rgba(146,89,5,.16);border-color:rgba(245,158,11,.3)}
    .hosp-v2-history-pill.finance{color:#ddd6fe;background:rgba(91,33,182,.16);border-color:rgba(167,139,250,.28)}
    .hosp-v2-history-value{font-size:15px;font-weight:950;color:#5df294}
    .hosp-v2-history-empty{padding:34px;border:1px dashed rgba(74,222,128,.22);border-radius:15px;text-align:center;color:#8aa49a;background:rgba(3,20,15,.45)}
    @media(max-width:1100px){.hosp-v2-history-row{grid-template-columns:1fr 1fr}.hosp-v2-history-cell:nth-child(2){border-right:0}.hosp-v2-history-cell:nth-child(-n+2){border-bottom:1px solid rgba(74,222,128,.11)}}
    @media(max-width:700px){.hosp-v2-history-row{grid-template-columns:1fr}.hosp-v2-history-cell{border-right:0;border-bottom:1px solid rgba(74,222,128,.11)}.hosp-v2-history-cell:last-child{border-bottom:0}.hosp-v2-people{display:block}.hosp-v2-people-label{display:block;margin-bottom:5px}}
  `;
  document.head.appendChild(style);
}

function personName(person) {
  return String(
    person?.nome_colaborador ||
    person?.colaborador_nome ||
    person?.nome ||
    person?.colaborador ||
    '',
  ).trim();
}

function parseNames(value) {
  if (Array.isArray(value)) return value.map((item) => personName(item) || String(item || '').trim()).filter(Boolean);
  return String(value || '')
    .split(/\n|;|\s+\|\s+|,(?=\s*[A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ])/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function uniqueNames(names) {
  const seen = new Set();
  return names.filter((name) => {
    const key = norm(name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function namesForRequest(id) {
  const key = String(id || '');
  const direct = uniqueNames((state.people.get(key) || []).map(personName).filter(Boolean));
  if (direct.length) return direct;
  const row = state.panelRows.get(key) || {};
  return uniqueNames(parseNames(
    row.colaboradores ||
    row.nomes_colaboradores ||
    row.colaborador ||
    row.nome_colaborador ||
    '',
  ));
}

function ensureHistoryMount() {
  const panel = $('#tab-historico');
  const card = panel?.querySelector('.card');
  if (!card) return false;
  let root = $('#hospV2Historico');
  if (!root) {
    root = document.createElement('div');
    root.id = 'hospV2Historico';
    root.className = 'hosp-v2-history-list';
    const table = card.querySelector('.adm-hosp-table-wrap');
    if (table) table.insertAdjacentElement('afterend', root);
    else card.appendChild(root);
  }
  return true;
}

function historyStatus(row) {
  const value = String(row.status_hospedagem || row.status_planilha || '').trim();
  const key = norm(value);
  if (key.includes('CHECKOUT') || key.includes('CONCLUID') || key.includes('FINALIZ')) return { label: value || 'Concluído', cls: '' };
  if (key.includes('PEND') || key.includes('AGUARD') || key.includes('RESERV')) return { label: value || 'Pendente', cls: 'warn' };
  if (key.includes('PAG') || key.includes('FINANCE')) return { label: value || 'Financeiro', cls: 'finance' };
  return { label: value || 'Hospedagem', cls: '' };
}

function renderHistory() {
  if (!ensureHistoryMount()) return;
  const root = $('#hospV2Historico');
  const count = $('#cntHistorico');
  if (count) count.textContent = String(state.history.length);

  if (state.historyError) {
    root.innerHTML = `<div class="hosp-v2-history-empty">${esc(state.historyError)}</div>`;
    return;
  }

  const query = norm($('#historicoSearch')?.value || '');
  let rows = state.history;
  if (query) {
    rows = rows.filter((row) => norm([
      row.colaborador, row.hotel, row.cidade, row.uf, row.regional,
      row.status_planilha, row.status_hospedagem, row.tipo_quarto,
      row.situacao_pagamento, row.cliente, row.nfs,
    ].filter(Boolean).join(' ')).includes(query));
  }
  const sortValue=(row) => state.sort.field==='hotel'?row.hotel||'':state.sort.field==='quarto'?row.tipo_quarto||'':state.sort.field==='valor'?Number(row.valor_diaria||0):row.data||'';
  const direction=state.sort.direction==='asc'?1:-1;
  rows=[...rows].sort((a,b) => typeof sortValue(a)==='number'?(sortValue(a)-sortValue(b))*direction:String(sortValue(a)).localeCompare(String(sortValue(b)),'pt-BR',{numeric:true,sensitivity:'base'})*direction).slice(0,250);

  if (!rows.length) {
    root.innerHTML = '<div class="hosp-v2-history-empty">Nenhum histórico de hospedagem localizado.</div>';
    return;
  }

  const historyHeader=(field,label) => `<button type="button" class="hosp-v2-history-sort ${state.sort.field===field?'active':''}" data-history-sort="${field}">${label}${state.sort.field===field?` ${state.sort.direction==='asc'?'↑':'↓'}`:''}</button>`;
  root.innerHTML = `<div class="hosp-v2-history-head">${historyHeader('data','Data / Colaborador')}${historyHeader('hotel','Hotel / Cidade')}${historyHeader('quarto','Quarto / Status')}${historyHeader('valor','Valor / Pagamento')}</div>`+rows.map((row) => {
    const status = historyStatus(row);
    const local = [row.cidade, row.uf].filter(Boolean).join('/');
    return `<article class="hosp-v2-history-row">
      <div class="hosp-v2-history-cell">
        <div class="hosp-v2-history-date">${brDate(row.data)}</div>
        <div class="hosp-v2-history-name" title="${esc(row.colaborador || '-')}">${esc(row.colaborador || '-')}</div>
        <span class="hosp-v2-history-sub">${esc(row.regional || 'Regional não informada')}</span>
      </div>
      <div class="hosp-v2-history-cell">
        <div class="hosp-v2-history-title" title="${esc(row.hotel || '-')}">${esc(row.hotel || 'Hotel não informado')}</div>
        <span class="hosp-v2-history-sub">${esc(local || row.localizacao || '-')}</span>
        <div class="hosp-v2-history-meta">
          ${row.cliente ? `<span>Cliente: <b>${esc(row.cliente)}</b></span>` : ''}
          ${row.local_embarque ? `<span>Embarque: <b>${esc(row.local_embarque)}</b></span>` : ''}
        </div>
      </div>
      <div class="hosp-v2-history-cell">
        <div class="hosp-v2-history-title">${esc(row.tipo_quarto || 'Quarto não informado')}</div>
        <span class="hosp-v2-history-pill ${status.cls}">${esc(status.label)}</span>
        ${row.observacao ? `<span class="hosp-v2-history-sub" title="${esc(row.observacao)}">${esc(row.observacao)}</span>` : ''}
      </div>
      <div class="hosp-v2-history-cell">
        <div class="hosp-v2-history-value">${row.valor_diaria != null ? money(row.valor_diaria) : 'Valor não informado'}</div>
        <span class="hosp-v2-history-sub">${esc(row.situacao_pagamento || 'Pagamento não informado')}</span>
        ${row.saldo != null ? `<span class="hosp-v2-history-sub">Saldo: ${money(row.saldo)}</span>` : ''}
        ${row.nfs ? `<span class="hosp-v2-history-sub">NFS-e: ${esc(row.nfs)}</span>` : ''}
      </div>
    </article>`;
  }).join('');
}

function decorateCards() {
  ['#hospV2Solicitadas', '#hospV2Andamento', '#hospV2Concluidos'].forEach((selector) => {
    $$('.hosp-v2-row', $(selector) || document.createElement('div')).forEach((card) => {
      const action = card.querySelector('[data-v2-action][data-id]');
      const id = action?.dataset.id;
      if (!id) return;
      const names = namesForRequest(id);
      let people = card.querySelector('.hosp-v2-people');
      if (!names.length) {
        people?.remove();
        return;
      }
      if (!people) {
        people = document.createElement('div');
        people.className = 'hosp-v2-people';
        const middleCell = card.querySelectorAll('.hosp-v2-cell')[1];
        const payCondition = middleCell?.querySelector('.hosp-v2-paycond');
        if (payCondition) payCondition.insertAdjacentElement('beforebegin', people);
        else middleCell?.appendChild(people);
      }
      people.innerHTML = `<span class="hosp-v2-people-names">${names.map((name) => `<span class="hosp-v2-person" title="${esc(name)}">${esc(name)}</span>`).join(', ')}</span>`;
    });
  });
}

async function loadData() {
  if (state.loading) return;
  state.loading = true;
  try {
    const [peopleRes, rowsRes, historyRes] = await Promise.all([
      supabase.from('hospedagem_solicitacao_colaboradores').select('*'),
      supabase.from('hospedagem_painel_geral').select('*'),
      supabase.from('hospedagem_historico_colaboradores').select('*').order('data', { ascending: false }).limit(5000),
    ]);

    state.people.clear();
    if (!peopleRes.error) {
      (peopleRes.data || []).forEach((person) => {
        const key = String(person.solicitacao_id || '');
        if (!key) return;
        if (!state.people.has(key)) state.people.set(key, []);
        state.people.get(key).push(person);
      });
    }

    state.panelRows.clear();
    if (!rowsRes.error) {
      (rowsRes.data || []).forEach((row) => state.panelRows.set(String(row.solicitacao_id || ''), row));
    }

    state.historyError = historyRes.error ? historyRes.error.message : '';
    state.history = historyRes.data || [];
    decorateCards();
    renderHistory();
  } catch (error) {
    console.error('[hosp-v2-history]', error);
    state.historyError = error?.message || String(error);
    renderHistory();
  } finally {
    state.loading = false;
  }
}

function bindEvents() {
  if (document.body.dataset.hospV2HistoryBound === '1') return;
  document.body.dataset.hospV2HistoryBound = '1';

  document.addEventListener('input', (event) => {
    if (event.target?.id === 'historicoSearch') renderHistory();
  });
  document.addEventListener('click', (event) => {
    const sort=event.target?.closest('[data-history-sort]');
    if(sort){const field=sort.dataset.historySort;state.sort={field,direction:state.sort.field===field&&state.sort.direction==='asc'?'desc':'asc'};renderHistory();return;}
    if (event.target?.closest('#refreshHistorico')) setTimeout(loadData, 60);
    if (event.target?.closest('.adm-hosp-tab[data-tab="historico"]')) setTimeout(renderHistory, 80);
  });
}

function boot() {
  injectStyles();
  bindEvents();
  const content = $('#pageContent');
  if (!content) return;

  let timer;
  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (ensureHistoryMount()) {
        if (!state.mounted) {
          state.mounted = true;
          loadData();
        } else {
          decorateCards();
        }
      }
    }, 120);
  };

  new MutationObserver(refresh).observe(content, { childList: true, subtree: true });
  refresh();
}

boot();
