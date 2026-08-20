import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getColaboradores } from './colaboradoresCache.js';

const BR_UFS = [
  ['AC', 'Acre'], ['AL', 'Alagoas'], ['AP', 'Amapá'], ['AM', 'Amazonas'], ['BA', 'Bahia'],
  ['CE', 'Ceará'], ['DF', 'Distrito Federal'], ['ES', 'Espírito Santo'], ['GO', 'Goiás'],
  ['MA', 'Maranhão'], ['MT', 'Mato Grosso'], ['MS', 'Mato Grosso do Sul'], ['MG', 'Minas Gerais'],
  ['PA', 'Pará'], ['PB', 'Paraíba'], ['PR', 'Paraná'], ['PE', 'Pernambuco'], ['PI', 'Piauí'],
  ['RJ', 'Rio de Janeiro'], ['RN', 'Rio Grande do Norte'], ['RS', 'Rio Grande do Sul'],
  ['RO', 'Rondônia'], ['RR', 'Roraima'], ['SC', 'Santa Catarina'], ['SP', 'São Paulo'],
  ['SE', 'Sergipe'], ['TO', 'Tocantins'],
];

// Mesma chave/cache usada em programacao.js — municípios não mudam, cache de 30 dias
// compartilhado entre as páginas evita repetir ~5.500 linhas do IBGE.
const CIDADES_CACHE_KEY = 'grm:cidades_ibge:v1';
const CIDADES_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function readCidadesCache() {
  try {
    const raw = localStorage.getItem(CIDADES_CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (!ts || Date.now() - ts > CIDADES_CACHE_TTL_MS || !Array.isArray(data) || !data.length) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCidadesCache(data) {
  try {
    localStorage.setItem(CIDADES_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}

async function loadCidadesBrasil() {
  const cached = readCidadesCache();
  if (cached) return cached;
  try {
    const resp = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome');
    const data = await resp.json();
    const cidades = (Array.isArray(data) ? data : []).map((m) => ({
      nome: m.nome,
      uf: m.microrregiao?.mesorregiao?.UF?.sigla || '',
    })).filter((m) => m.nome && m.uf);
    writeCidadesCache(cidades);
    return cidades;
  } catch (error) {
    console.warn('[hospedagem] Não foi possível carregar cidades do IBGE.', error);
    return [];
  }
}

async function loadClientesRef() {
  const nomes = new Set();
  const add = (v) => {
    const txt = String(v ?? '').trim();
    if (txt) nomes.add(txt);
  };
  try {
    const [prod, os] = await Promise.all([
      supabase.from('relatorio_resultado_diario').select('cliente_nacional').limit(5000),
      supabase.from('operacional_os').select('cliente').limit(5000),
    ]);
    (prod.data || []).forEach((r) => add(r.cliente_nacional));
    (os.data || []).forEach((r) => add(r.cliente));
  } catch (error) {
    console.warn('[hospedagem] Não foi possível carregar clientes.', error);
  }
  return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

const STATUS_SOLICITACAO = {
  SOLICITADA: 'Solicitada',
  EM_ANALISE: 'Em análise',
  EM_COTACAO: 'Em cotação',
  RESERVADA: 'Reservada',
  CANCELADA: 'Cancelada',
  CONCLUIDA: 'Concluída',
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function brDate(value) {
  if (!value) return '-';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(value);
}

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function diffDays(start, end) {
  if (!start || !end) return 1;
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  const diff = Math.round((b - a) / 86400000);
  return Math.max(1, diff || 1);
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// Cabeçalhos ordenáveis (mesmo padrão de adm-conferencia.js: botão dentro do
// <th>, seta indicando coluna/direção ativa, alterna asc/desc no clique).
function sortIcon(sortState, kind, column) {
  const current = sortState[kind];
  if (current.column !== column) return '<span class="hosp-sort-icon">↕</span>';
  return `<span class="hosp-sort-icon active">${current.direction === 'asc' ? '↑' : '↓'}</span>`;
}

function sortableTh(sortState, kind, column, label) {
  return `<th><button class="hosp-sort-btn" type="button" data-sort-kind="${esc(kind)}" data-sort-column="${esc(column)}">${esc(label)} ${sortIcon(sortState, kind, column)}</button></th>`;
}

function sortRows(sortState, kind, rows, getValue) {
  const { column, direction } = sortState[kind] || {};
  if (!column) return rows;
  const factor = direction === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = getValue(a, column);
    const bv = getValue(b, column);
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
    return normalizeText(String(av ?? '')).localeCompare(normalizeText(String(bv ?? '')), 'pt-BR', { numeric: true }) * factor;
  });
}

function minhasTheadHtml(state) {
  return [
    sortableTh(state.sort, 'minhas', 'codigo', 'Código'),
    sortableTh(state.sort, 'minhas', 'colaboradores', 'Colaboradores'),
    sortableTh(state.sort, 'minhas', 'cidade', 'Cidade'),
    sortableTh(state.sort, 'minhas', 'embarque', 'Embarque'),
    sortableTh(state.sort, 'minhas', 'periodo', 'Período'),
    sortableTh(state.sort, 'minhas', 'hotel', 'Hotel'),
    sortableTh(state.sort, 'minhas', 'status', 'Status'),
    '<th>Ações</th>',
  ].join('');
}

function minhasSortValue(row, column) {
  switch (column) {
    case 'codigo': return row.codigo || '';
    case 'colaboradores': return row.colaboradores || '';
    case 'cidade': return [row.cidade, row.uf].filter(Boolean).join('/');
    case 'embarque': return row.local_embarque || '';
    case 'periodo': return row.data_checkin_prevista || '';
    case 'hotel': return row.hotel || '';
    case 'status': return STATUS_SOLICITACAO[row.status_solicitacao] || row.status_solicitacao || '';
    default: return '';
  }
}

function alojTheadHtml(state) {
  return [
    sortableTh(state.sort, 'alojamento', 'alojamento', 'Alojamento'),
    sortableTh(state.sort, 'alojamento', 'colaborador', 'Colaborador'),
    sortableTh(state.sort, 'alojamento', 'desde', 'Entrada'),
    sortableTh(state.sort, 'alojamento', 'saida', 'Saída'),
    '<th>Ações</th>',
  ].join('');
}

function getUserField(ctx, ...paths) {
  for (const path of paths) {
    const parts = path.split('.');
    let cur = ctx;
    for (const part of parts) cur = cur?.[part];
    if (cur !== undefined && cur !== null && String(cur).trim() !== '') return cur;
  }
  return null;
}

function colaboradorKey(row = {}) {
  const cpf = String(row.cpf || '').replace(/\D/g, '');
  return cpf || normalizeText(row.nome) || String(row.id || '').trim();
}

function deduplicateColaboradores(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const key = colaboradorKey(row);
    if (key && !map.has(key)) map.set(key, row);
  }
  return [...map.values()];
}

function injectStyles() {
  if (document.getElementById('hospedagemGestorStyles')) return;
  const style = document.createElement('style');
  style.id = 'hospedagemGestorStyles';
  style.textContent = `
    .hosp-workspace{border:1px solid var(--line);border-radius:18px;overflow:hidden;background:rgba(3,18,12,.72);min-height:calc(100vh - 150px)}
    .hosp-workspace-head{height:42px;display:flex;align-items:center;padding:0 18px;border-bottom:1px solid var(--line);color:var(--green-2);font-size:10px;font-weight:900;letter-spacing:.17em;text-transform:uppercase;background:rgba(7,28,18,.78);border-top-left-radius:17px;border-top-right-radius:17px}
    .hosp-workspace-head::before{content:'▣';font-size:13px;margin-right:10px;color:#22c55e}
    .hosp-workspace-body{display:grid;grid-template-columns:minmax(320px,360px) minmax(0,1fr);min-height:calc(100vh - 193px)}
    .hosp-form-pane{border-right:1px solid var(--line);background:rgba(5,25,16,.78);min-width:0;display:flex;flex-direction:column}
    .hosp-form-intro{padding:17px 19px;border-bottom:1px solid var(--line)}
    .hosp-form-intro h2{margin:0;color:#f0fff7;font-size:15px;font-weight:900}
    .hosp-form-intro p{margin:5px 0 0;color:#6fa589;font-size:12px}
    .hosp-form{padding:0 19px 18px;display:flex;flex-direction:column;min-height:0}
    .hosp-grp{padding:17px 0;border-bottom:1px solid rgba(34,197,94,.16)}
    .hosp-grp:last-of-type{border-bottom:0}
    .hosp-grp-h{display:flex;align-items:center;gap:8px;margin:0 0 12px;color:#31d57a;font-size:9.5px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}
    .hosp-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:9px}
    .hosp-field{display:flex;flex-direction:column;gap:5px;min-width:0}
    .hosp-field.full{grid-column:1/-1}.hosp-field.col-3{grid-column:span 3}.hosp-field.col-4{grid-column:span 4}.hosp-field.col-5{grid-column:span 5}.hosp-field.col-6{grid-column:span 6}.hosp-field.col-7{grid-column:span 7}.hosp-field.col-8{grid-column:span 8}.hosp-field.col-9{grid-column:span 9}
    .hosp-field label{font-size:10.5px;color:#67a383;font-weight:750}
    .hosp-field input,.hosp-field textarea,.hosp-field select,.hosp-colab-row input{width:100%;min-height:36px;border:1px solid rgba(34,197,94,.23);background:#092117;color:#eafff3;border-radius:10px;padding:8px 10px;outline:none;color-scheme:dark;font-size:12.5px;box-sizing:border-box}
    .hosp-field input:focus,.hosp-field textarea:focus,.hosp-field select:focus,.hosp-colab-row input:focus{border-color:#2dd778;box-shadow:0 0 0 1px rgba(45,215,120,.15)}
    .hosp-field textarea{min-height:76px;resize:vertical}
    .hosp-diarias-badge{display:inline-flex;align-items:center;margin-left:auto;border:1px solid rgba(34,197,94,.35);background:rgba(22,101,52,.15);color:#7bf2ad;padding:4px 10px;border-radius:999px;font-size:9.5px;font-weight:850;letter-spacing:0;text-transform:none;white-space:nowrap}
    .hosp-colab-box{display:flex;flex-direction:column;gap:8px}
    .hosp-colab-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:7px;align-items:center}
    .hosp-colab-type{display:none;align-items:center;min-height:34px;border:1px solid rgba(34,197,94,.22);background:rgba(22,101,52,.14);color:#9df2bd;padding:0 9px;border-radius:10px;font-size:10.5px;white-space:nowrap}
    .hosp-colab-type.show{display:flex}
    .hosp-remove{width:36px!important;height:36px!important;min-width:36px!important;margin:0!important;padding:0!important;border-radius:10px!important;border:1px solid rgba(239,68,68,.25)!important;background:transparent!important;color:#d58b8b!important}
    .hosp-remove:hover{border-color:rgba(248,113,113,.55)!important;color:#fecaca!important}
    .hosp-add-colab{width:auto;align-self:flex-start;margin-top:8px;border:0;background:transparent;color:#2cdb79;padding:4px 0;cursor:pointer;font-weight:800;font-size:11.5px}
    .hosp-add-colab:hover{color:#86efac}
    .hosp-colab-hint{margin-top:10px;color:#4d8065;font-size:10.5px;font-style:italic;line-height:1.45}
    .hosp-ac{position:relative;width:100%}
    .hosp-ac-list{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#092117;border:1px solid rgba(45,215,120,.35);overflow:hidden;z-index:80;max-height:230px;overflow-y:auto;box-shadow:0 14px 35px rgba(0,0,0,.5)}
    .hosp-ac-item{padding:9px 11px;cursor:pointer;font-size:12px;color:#eafff3;border-bottom:1px solid rgba(255,255,255,.05)}
    .hosp-ac-item:last-child{border-bottom:0}.hosp-ac-item:hover{background:rgba(45,215,120,.12)}
    .hosp-ac-item small{display:block;color:#6c9e82;font-size:10px;margin-top:2px}.hosp-ac-empty{padding:10px 11px;font-size:11.5px;color:#6c9e82;text-align:center}
    .hosp-form-actions{display:flex;align-items:center;gap:10px;margin-top:auto;padding:15px 0 0;border-top:1px solid rgba(34,197,94,.18);flex-wrap:wrap}
    .hosp-form-actions .btn{width:auto!important;margin:0!important;border-radius:12px!important;min-height:38px;padding:0 14px;font-size:11.5px}
    .hosp-submit{background:rgba(22,101,52,.2)!important;border-color:rgba(45,215,120,.35)!important;color:#77eda8!important}
    .hosp-feedback{flex:1 1 100%;color:#6c9e82;font-size:11.5px}.hosp-feedback.ok{color:#86efac}.hosp-feedback.err{color:#fecaca}
    .hosp-list-pane{min-width:0;display:flex;flex-direction:column;background:rgba(3,20,12,.62);padding:16px 18px 18px;gap:14px}
    .hosp-list-head{min-height:auto;display:flex;align-items:stretch;justify-content:space-between;border-bottom:0;gap:12px;flex-wrap:wrap}
    .hosp-stats{display:flex;align-items:stretch;min-width:0;gap:10px;flex-wrap:wrap}
    /* Chips individuais arredondados (mesmo padrão de .conf-card em
       adm-conferencia.js) em vez da faixa com divisores retos — pedido da
       usuária pra "a tela em si" não ficar quadrada mesmo com os botões já
       arredondados. */
    .hosp-stat{min-width:110px;padding:12px 18px;border:1px solid rgba(34,197,94,.16);border-radius:14px;background:rgba(8,22,17,.6);display:flex;flex-direction:column;justify-content:center}
    .hosp-stat span{font-size:8.5px;color:#4f9670;text-transform:uppercase;letter-spacing:.18em;font-weight:800}.hosp-stat strong{font-size:24px;color:#eafff3;margin-top:7px;font-weight:500;line-height:1}
    .hosp-refresh-wrap{display:flex;align-items:center}.hosp-refresh{width:auto!important;margin:0!important;border-radius:12px!important;background:transparent!important;color:#65ad82!important;border-color:rgba(34,197,94,.25)!important;font-size:11px!important;padding:8px 13px!important}
    .hosp-table-wrap{overflow:auto;flex:1;min-height:320px;border:1px solid var(--line);border-radius:16px;background:rgba(8,22,17,.4)}
    .hosp-table{width:100%;border-collapse:collapse;min-width:880px}
    .hosp-table th,.hosp-table td{padding:14px 16px;border-bottom:1px solid rgba(34,197,94,.14);text-align:left;vertical-align:top;font-size:12px}
    .hosp-table th{position:sticky;top:0;z-index:2;background:#082117;color:#4f9670;font-size:8.5px;text-transform:uppercase;letter-spacing:.18em;font-weight:850}
    .hosp-sort-btn{width:100%;display:inline-flex;align-items:center;gap:6px;border:0;background:transparent;color:#4f9670;font:inherit;text-transform:uppercase;letter-spacing:.18em;text-align:left;cursor:pointer;padding:0}
    .hosp-sort-btn:hover{color:#7bf2ad}.hosp-sort-icon{font-size:12px;opacity:.55}.hosp-sort-icon.active{opacity:1;color:#2dd778}
    .hosp-table th:first-child{border-top-left-radius:15px}.hosp-table th:last-child{border-top-right-radius:15px}
    .hosp-table tr:last-child td{border-bottom:0}
    .hosp-table tr:hover td{background:rgba(45,215,120,.035)}
    .hosp-table td{color:#e9fff2}.hosp-help{font-size:10px;color:#4b996d}.hosp-empty{padding:24px!important;color:#5c8d70!important;text-align:center}
    .hosp-status{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;border:1px solid rgba(34,197,94,.24);font-size:10px;font-weight:750;white-space:nowrap}
    .hosp-status::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor}
    .hosp-status.solicitada{color:#48e78d;background:rgba(22,101,52,.18)}
    .hosp-status.em_analise,.hosp-status.em_cotacao{color:#facc15;background:rgba(161,98,7,.17);border-color:rgba(250,204,21,.3)}
    .hosp-status.reservada,.hosp-status.concluida{color:#32df79;background:rgba(22,101,52,.23)}
    .hosp-status.cancelada{color:#f87171;background:rgba(127,29,29,.17);border-color:rgba(248,113,113,.28)}
    .hosp-alert{border:1px solid rgba(245,158,11,.24);background:rgba(245,158,11,.08);color:#fde68a;border-radius:12px;padding:9px 10px;margin-top:9px;font-size:11.5px}
    .hosp-row-actions{display:flex;flex-direction:column;gap:5px;min-width:104px}
    .hosp-row-actions button{border:1px solid rgba(34,197,94,.25);background:transparent;color:#65ad82;padding:5px 8px;font-size:10.5px;font-weight:750;cursor:pointer;text-align:left;white-space:nowrap}
    .hosp-row-actions button:hover{border-color:rgba(45,215,120,.55);color:#9df2bd}
    .hosp-row-actions button[data-act="cancelar"]{border-color:rgba(239,68,68,.22);color:#d58b8b}
    .hosp-row-actions button[data-act="cancelar"]:hover{border-color:rgba(248,113,113,.5);color:#fecaca}
    .hosp-row-actions button:disabled{opacity:.4;cursor:not-allowed}
    @media(max-width:1180px){.hosp-workspace-body{grid-template-columns:1fr}.hosp-form-pane{border-right:0;border-bottom:1px solid var(--line)}.hosp-form{max-width:none}.hosp-list-pane{min-height:520px}}
    @media(max-width:700px){.hosp-grid{grid-template-columns:1fr 1fr}.hosp-grid .hosp-field{grid-column:1/-1}.hosp-field.col-3,.hosp-field.col-4,.hosp-field.col-5,.hosp-field.col-6,.hosp-field.col-7,.hosp-field.col-8,.hosp-field.col-9{grid-column:span 1}.hosp-list-head{flex-direction:column}.hosp-stats{width:100%}.hosp-stat{flex:1;min-width:0}.hosp-refresh-wrap{padding:10px 14px}.hosp-colab-row{grid-template-columns:minmax(0,1fr) auto}.hosp-colab-type{grid-column:1/-1;grid-row:2}}

    /* Tab bar padronizada com as etapas de Gestor > Programação (mesmas
       classes .steps-wrap/.stepbtn/.stepbtn-letter, estilizadas por
       programacao-redesign.css agora também linkado aqui) — pedido da
       usuária pra deixar Hospedagem/Alojamento com a mesma cara. */
    .hosp-tabs-bar{margin-bottom:14px}
    .hosp-tab-panel[hidden]{display:none}

    .hospA-addbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
    .hospA-addbar select{height:38px;min-width:220px;border:1px solid rgba(45,215,120,.3);background:#092117;color:#eafff3;border-radius:11px;padding:0 10px;color-scheme:dark;font-size:12.5px}
    .hospA-addbar .btn{width:auto!important;min-height:38px!important;margin:0!important;padding:0 16px;font-size:12.5px}
    .hospA-add-feedback{font-size:11px;color:#6c9e82;margin:-4px 0 12px}.hospA-add-feedback.err{color:#fecaca}.hospA-add-feedback.ok{color:#86efac}
    .hospA-search{flex:1 1 220px;min-width:180px;height:38px;border:1px solid var(--line-2);background:#092117;color:#eafff3;border-radius:11px;padding:0 12px;color-scheme:dark;box-sizing:border-box}
    .hospA-ac{position:relative;flex:1 1 240px;min-width:220px}
    .hospA-ac input{width:100%;height:38px;border:1px solid rgba(45,215,120,.3);background:#092117;color:#eafff3;border-radius:11px;padding:0 10px;color-scheme:dark;font-size:12.5px;box-sizing:border-box}
    .hospA-ac-list{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#092117;border:1px solid rgba(45,215,120,.35);overflow:hidden;z-index:20;max-height:200px;overflow-y:auto;border-radius:9px;box-shadow:0 14px 35px rgba(0,0,0,.5)}
    .hospA-ac-item{padding:8px 10px;cursor:pointer;font-size:12px;color:#eafff3;border-bottom:1px solid rgba(255,255,255,.05)}
    .hospA-ac-item:last-child{border-bottom:0}.hospA-ac-item:hover{background:rgba(45,215,120,.12)}
    .hospA-ac-item small{display:block;color:#6c9e82;font-size:10px;margin-top:2px}
    .hospA-ac-empty{padding:8px 10px;font-size:11.5px;color:#6c9e82;text-align:center}
    .hospA-encerrar{border:0;background:transparent;color:#d58b8b;font-size:11px;font-weight:800;cursor:pointer;padding:2px 6px;white-space:nowrap}
    .hospA-encerrar:hover{color:#fecaca}
    .hospA-modebar{display:flex;gap:8px;margin-bottom:12px}
    .hospA-mode-btn{border:1px solid rgba(34,197,94,.22);background:transparent;color:#65ad82;padding:7px 13px;border-radius:10px;font-size:11.5px;font-weight:800;cursor:pointer}
    .hospA-mode-btn:hover{border-color:rgba(45,215,120,.5);color:#9df2bd}
    .hospA-mode-btn.active{background:rgba(22,101,52,.2);border-color:rgba(45,215,120,.4);color:#7bf2ad}
    .hospA-saida-atual{color:#4f9670;font-style:italic}
  `;
  document.head.appendChild(style);
}

export function renderContent(content, userContext) {
  injectStyles();
  const state = {
    solicitacoes: [],
    colaboradores: [],
    totalAtivos: 0,
    totalDisponiveis: 0,
    cidades: [],
    clientes: [],
    alojamentos: [],
    ocupantes: [],
    ocupantesHistorico: [],
    hospAModo: 'atual',
    hospAHistoricoCarregado: false,
    sort: {
      minhas: { column: '', direction: 'asc' },
      alojamento: { column: '', direction: 'asc' },
    },
  };

  content.innerHTML = `
    <div class="hosp-tabs-bar steps-wrap prog-steps-compact">
      <button class="hosp-tab-btn stepbtn active" type="button" data-hosp-tab="hotel"><span class="stepbtn-letter">1</span><span class="stepbtn-label"> · Hotel</span></button>
      <button class="hosp-tab-btn stepbtn" type="button" data-hosp-tab="alojamento"><span class="stepbtn-letter">2</span><span class="stepbtn-label"> · Alojamento</span></button>
    </div>
    <div id="hospPanelHotel" class="hosp-tab-panel active">
    <section class="hosp-workspace">
      <header class="hosp-workspace-head">Setor de hotéis</header>
      <div class="hosp-workspace-body">
        <aside class="hosp-form-pane">
          <div class="hosp-form-intro">
            <h2>Nova solicitação</h2>
            <p>Preencha os dados da hospedagem</p>
          </div>

          <form id="hospForm" class="hosp-form">
            <div class="hosp-grp">
              <div class="hosp-grp-h">⌖ Onde e para quem</div>
              <div class="hosp-grid">
                <div class="hosp-field col-4"><label for="uf">UF *</label>
                  <select id="uf" required><option value="">Selecione</option>${BR_UFS.map(([sigla, nome]) => `<option value="${sigla}">${sigla} — ${esc(nome)}</option>`).join('')}</select>
                </div>
                <div class="hosp-field col-8"><label for="cidade">Cidade *</label>
                  <select id="cidade" required disabled><option value="">Selecione a UF primeiro</option></select>
                </div>
                <div class="hosp-field full"><label for="cliente">Cliente *</label>
                  <select id="cliente" required><option value="">Carregando clientes...</option></select>
                  <input id="clienteManual" style="display:none;margin-top:6px" placeholder="Digite o nome do cliente" />
                </div>
                <div class="hosp-field full"><label for="localEmbarque">Local de embarque *</label><input id="localEmbarque" required placeholder="Ex.: Fazenda Nova Prata" /></div>
                <div class="hosp-field full"><label for="linkLocal">Localização (link)</label><input id="linkLocal" placeholder="Google Maps ou referência" /></div>
              </div>
            </div>

            <div class="hosp-grp">
              <div class="hosp-grp-h">▣ Período <span class="hosp-diarias-badge" id="diariasLabel">1 diária</span></div>
              <div class="hosp-grid">
                <div class="hosp-field col-6"><label for="checkin">Check-in *</label><input id="checkin" type="date" required /></div>
                <div class="hosp-field col-6"><label for="checkout">Check-out *</label><input id="checkout" type="date" required /></div>
                <div class="hosp-field full"><label for="horario">Previsão de chegada</label><input id="horario" type="time" /></div>
              </div>
            </div>

            <div class="hosp-grp">
              <div class="hosp-grp-h">♧ Colaboradores</div>
              <div class="hosp-colab-box" id="colabBox"></div>
              <button class="hosp-add-colab" type="button" id="addColabBtn">＋ Adicionar colaborador</button>
              <div class="hosp-colab-hint" id="colabBaseInfo">Carregando colaboradores ativos...</div>
              <div class="hosp-alert" id="colabFallback" style="display:none;">Não foi possível consultar a base de colaboradores agora. Você pode digitar os nomes manualmente.</div>
            </div>

            <div class="hosp-grp">
              <div class="hosp-grp-h">▤ Observações</div>
              <div class="hosp-field full"><textarea id="obs" placeholder="Ex.: chegará ~17h, priorizar hotel próximo ao embarque, observações sobre quartos..."></textarea></div>
            </div>

            <div class="hosp-form-actions">
              <button class="btn hosp-submit" type="submit" id="submitBtn">Enviar solicitação</button>
              <button class="btn btn-secondary" type="button" id="clearBtn">Limpar</button>
              <span class="hosp-feedback" id="feedback"></span>
            </div>
          </form>
        </aside>

        <section class="hosp-list-pane">
          <div class="hosp-list-head">
            <div class="hosp-stats">
              <div class="hosp-stat"><span>Total</span><strong id="statTotal">0</strong></div>
              <div class="hosp-stat"><span>Em andamento</span><strong id="statOpen">0</strong></div>
              <div class="hosp-stat"><span>Reservadas</span><strong id="statReserved">0</strong></div>
            </div>
            <div class="hosp-refresh-wrap"><button class="btn btn-secondary hosp-refresh" type="button" id="refreshBtn">↻ Atualizar</button></div>
          </div>

          <div class="hosp-table-wrap">
            <table class="hosp-table">
              <thead><tr id="minhasTheadRow">${minhasTheadHtml(state)}</tr></thead>
              <tbody id="minhasTbody"><tr><td colspan="8" class="hosp-empty">Carregando...</td></tr></tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
    </div>

    <div id="hospPanelAlojamento" class="hosp-tab-panel" hidden>
      <section class="hosp-workspace">
        <header class="hosp-workspace-head">Alojamentos da sua regional</header>
        <div style="padding:18px">
          <div class="hospA-addbar">
            <select id="hospAAlojSelect"><option value="">Selecione o alojamento...</option></select>
            <div class="hospA-ac">
              <input type="text" id="hospABuscaColab" placeholder="Nome do colaborador..." autocomplete="off" spellcheck="false" />
              <div class="hospA-ac-list" hidden></div>
            </div>
            <button type="button" class="btn hosp-submit" id="hospAAddBtn">＋ Adicionar</button>
            <input type="search" id="hospABusca" class="hospA-search" placeholder="Buscar alojamento ou colaborador..." />
          </div>
          <div class="hospA-add-feedback" id="hospAAddFeedback"></div>

          <div class="hospA-modebar">
            <button type="button" class="hospA-mode-btn active" data-hosp-a-mode="atual">Hospedados agora</button>
            <button type="button" class="hospA-mode-btn" data-hosp-a-mode="historico">Histórico (entradas e saídas)</button>
          </div>

          <div class="hosp-table-wrap">
            <table class="hosp-table">
              <thead><tr id="hospATheadRow">${alojTheadHtml(state)}</tr></thead>
              <tbody id="hospATbody"><tr><td colspan="5" class="hosp-empty">Carregando...</td></tr></tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  `;

  const form = document.getElementById('hospForm');
  const feedback = document.getElementById('feedback');
  const colabBox = document.getElementById('colabBox');
  const checkin = document.getElementById('checkin');
  const checkout = document.getElementById('checkout');
  const diariasLabel = document.getElementById('diariasLabel');
  const colabBaseInfo = document.getElementById('colabBaseInfo');
  const ufSelect = document.getElementById('uf');
  const cidadeSelect = document.getElementById('cidade');
  const clienteSelect = document.getElementById('cliente');
  const clienteManual = document.getElementById('clienteManual');

  function setFeedback(msg, type = '') {
    feedback.textContent = msg || '';
    feedback.className = `hosp-feedback ${type}`.trim();
  }

  function addDaysISO(iso, days) {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function updateDiarias() {
    const n = diffDays(checkin.value, checkout.value);
    diariasLabel.textContent = `${n} diária${n === 1 ? '' : 's'}`;
  }

  // #12/#13: checkin não pode ser retroativo; checkout não pode passar de checkin + 7 dias.
  function updateDataLimits() {
    const hoje = todayISO();
    checkin.min = hoje;
    if (checkin.value && checkin.value < hoje) checkin.value = hoje;

    const minCheckout = checkin.value || hoje;
    checkout.min = minCheckout;
    checkout.max = addDaysISO(minCheckout, 7);
    if (checkout.value && (checkout.value < checkout.min || checkout.value > checkout.max)) {
      checkout.value = checkout.min > checkout.max ? checkout.max : checkout.min;
    }
  }

  function populateCidades(uf) {
    if (!uf) {
      cidadeSelect.innerHTML = '<option value="">Selecione a UF primeiro</option>';
      cidadeSelect.disabled = true;
      return;
    }
    const doUf = state.cidades.filter((c) => c.uf === uf).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    cidadeSelect.innerHTML = doUf.length
      ? `<option value="">Selecione</option>${doUf.map((c) => `<option value="${esc(c.nome)}">${esc(c.nome)}</option>`).join('')}`
      : '<option value="">Nenhuma cidade encontrada</option>';
    cidadeSelect.disabled = !doUf.length;
  }

  function buscarColaboradores(query) {
    const q = normalizeText(query);
    if (!q) return [];
    return state.colaboradores
      .filter((c) => normalizeText(c.nome).includes(q))
      .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
      .slice(0, 15);
  }

  function addColabRow(value = '', tipo = '') {
    const id = `colab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const wrap = document.createElement('div');
    wrap.className = 'hosp-colab-row';
    wrap.innerHTML = `
      <div class="hosp-ac">
        <input id="${id}" class="colabNome hosp-ac-input" autocomplete="off" spellcheck="false" required value="${esc(value)}" placeholder="Nome do colaborador..." />
        <div class="hosp-ac-list" hidden></div>
      </div>
      <input class="colabTipo" type="hidden" value="${esc(tipo)}" />
      <span class="hosp-colab-type ${tipo ? 'show' : ''}">${esc(tipo || 'Tipo automático')}</span>
      <button class="btn btn-secondary hosp-remove" type="button" title="Remover colaborador" aria-label="Remover">×</button>
    `;

    const removeBtn = wrap.querySelector('.hosp-remove');
    const nomeInput = wrap.querySelector('.colabNome');
    const tipoInput = wrap.querySelector('.colabTipo');
    const tipoBadge = wrap.querySelector('.hosp-colab-type');
    const acList = wrap.querySelector('.hosp-ac-list');
    let matches = [];

    removeBtn.addEventListener('click', () => {
      if (colabBox.children.length <= 1) return;
      wrap.remove();
    });

    function renderSuggestions() {
      matches = buscarColaboradores(nomeInput.value);
      if (!nomeInput.value.trim()) {
        acList.hidden = true;
        acList.innerHTML = '';
        tipoInput.value = '';
        tipoBadge.textContent = 'Tipo automático';
        tipoBadge.classList.remove('show');
        return;
      }
      acList.innerHTML = matches.length
        ? matches.map((c, i) => `<div class="hosp-ac-item" data-idx="${i}">${esc(c.nome)}<small>${esc([c.tipo, c.supervisao].filter(Boolean).join(' · '))}</small></div>`).join('')
        : '<div class="hosp-ac-empty">Nenhum colaborador ativo encontrado</div>';
      acList.hidden = false;
    }

    nomeInput.addEventListener('input', () => {
      tipoInput.value = '';
      tipoBadge.textContent = 'Tipo automático';
      tipoBadge.classList.remove('show');
      renderSuggestions();
    });
    nomeInput.addEventListener('focus', () => { if (nomeInput.value.trim()) renderSuggestions(); });
    nomeInput.addEventListener('blur', () => { setTimeout(() => { acList.hidden = true; }, 180); });
    acList.addEventListener('click', (event) => {
      const item = event.target.closest('.hosp-ac-item');
      if (!item) return;
      const selected = matches[Number(item.dataset.idx)];
      if (!selected) return;
      nomeInput.value = selected.nome;
      tipoInput.value = selected.tipo || '';
      tipoBadge.textContent = selected.tipo || 'Tipo não informado';
      tipoBadge.classList.add('show');
      acList.hidden = true;
    });

    colabBox.appendChild(wrap);
  }

  function resetForm() {
    form.reset();
    checkin.value = todayISO();
    checkout.value = addDaysISO(checkin.value, 1);
    updateDataLimits();
    populateCidades('');
    clienteManual.style.display = 'none';
    clienteManual.value = '';
    colabBox.innerHTML = '';
    addColabRow();
    updateDiarias();
    setFeedback('');
  }

  function getClienteValue() {
    return clienteManual.style.display !== 'none' ? clienteManual.value.trim() : clienteSelect.value.trim();
  }

  function getColaboradoresPayload() {
    return Array.from(colabBox.querySelectorAll('.hosp-colab-row')).map((row) => {
      const nome = row.querySelector('.colabNome').value.trim();
      const tipoAutomatico = row.querySelector('.colabTipo').value.trim();
      const found = state.colaboradores.find((c) => normalizeText(c.nome) === normalizeText(nome));
      return {
        colaborador_id: found?.id || null,
        nome_colaborador: nome,
        cpf: found?.cpf || null,
        tipo_colaborador: found?.tipo || tipoAutomatico || null,
        empresa: found?.empresa || getUserField(userContext, 'empresa', 'user.empresa') || null,
        coordenacao: found?.coordenacao || getUserField(userContext, 'coordenacao', 'user.coordenacao') || null,
        supervisao: found?.supervisao || getUserField(userContext, 'supervisao', 'user.supervisao') || null,
        status_colaborador: 'ATIVO',
      };
    }).filter((c) => c.nome_colaborador);
  }

  function parseSupervisaoList(value) {
    const text = String(value || '').trim();
    if (!text) return [];
    return [...new Set(text.split(/[,;|\n]+/).map((s) => s.trim()).filter(Boolean))];
  }

  function getMinhasRegionais() {
    const raw = getUserField(userContext, 'supervisao', 'user.supervisao');
    return [...new Set(parseSupervisaoList(raw).map(normalizeText))];
  }

  async function loadColaboradores() {
    try {
      const ativos = deduplicateColaboradores(await getColaboradores({ force: true, somenteAtivos: true }));
      const minhasRegionais = getMinhasRegionais();
      const disponiveis = minhasRegionais.length
        ? ativos.filter((row) => minhasRegionais.includes(normalizeText(row.supervisao)))
        : ativos;

      state.totalAtivos = ativos.length;
      state.totalDisponiveis = disponiveis.length;
      state.colaboradores = disponiveis.map((row) => ({
        id: row.id,
        nome: row.nome,
        cpf: row.cpf,
        tipo: row.tipo,
        empresa: row.empresa,
        coordenacao: row.coordenacao,
        supervisao: row.supervisao,
      }));

      colabBaseInfo.textContent = minhasRegionais.length
        ? `${state.totalAtivos} colaboradores ativos na base · ${state.totalDisponiveis} disponíveis na sua regional. O tipo é preenchido automaticamente.`
        : `${state.totalAtivos} colaboradores ativos disponíveis. O tipo é preenchido automaticamente.`;
    } catch (error) {
      console.error('[hospedagem] Falha ao carregar colaboradores:', error);
      document.getElementById('colabFallback').style.display = 'block';
      colabBaseInfo.textContent = 'Tipo do colaborador preenchido automaticamente quando encontrado na base.';
      state.colaboradores = [];
    }
  }

  async function submitSolicitacao(event) {
    event.preventDefault();
    setFeedback('Enviando solicitação...');
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;

    const colaboradores = getColaboradoresPayload();
    if (!colaboradores.length) {
      setFeedback('Informe ao menos um colaborador.', 'err');
      btn.disabled = false;
      return;
    }

    if (!getClienteValue()) {
      setFeedback('Selecione o cliente.', 'err');
      btn.disabled = false;
      return;
    }

    if (checkin.value < todayISO()) {
      setFeedback('A data de check-in não pode ser anterior a hoje.', 'err');
      btn.disabled = false;
      return;
    }

    if (checkout.value > addDaysISO(checkin.value, 7)) {
      setFeedback('A data de check-out não pode passar de 7 dias após o check-in.', 'err');
      btn.disabled = false;
      return;
    }

    const payload = {
      data_solicitacao: new Date().toISOString().slice(0, 10),
      solicitante_id: userContext?.user?.id || null,
      solicitante_nome: userContext?.user?.name || null,
      solicitante_email: userContext?.user?.email || null,
      empresa: getUserField(userContext, 'empresa', 'user.empresa') || null,
      coordenacao: getUserField(userContext, 'coordenacao', 'user.coordenacao') || null,
      supervisao: getUserField(userContext, 'supervisao', 'user.supervisao') || null,
      regional: getUserField(userContext, 'regional', 'user.regional') || getUserField(userContext, 'supervisao', 'user.supervisao') || null,
      cidade: cidadeSelect.value.trim(),
      uf: ufSelect.value.trim().toUpperCase() || null,
      cliente: getClienteValue() || null,
      local_embarque: document.getElementById('localEmbarque').value.trim(),
      link_local_embarque: document.getElementById('linkLocal').value.trim() || null,
      data_checkin_prevista: checkin.value,
      data_checkout_prevista: checkout.value,
      horario_chegada_previsto: document.getElementById('horario').value || null,
      quantidade_diarias_prevista: diffDays(checkin.value, checkout.value),
      observacao_gestor: document.getElementById('obs').value.trim() || null,
      status_solicitacao: 'SOLICITADA',
    };

    const { data, error } = await supabase.rpc('hospedagem_criar_solicitacao', {
      p_solicitacao: payload,
      p_colaboradores: colaboradores,
    });

    if (error) {
      setFeedback(error.message || 'Erro ao criar solicitação.', 'err');
      btn.disabled = false;
      return;
    }

    resetForm();
    setFeedback(`Solicitação ${data.codigo || ''} enviada com sucesso.`, 'ok');
    await loadSolicitacoes(false);
    btn.disabled = false;
  }

  async function loadSolicitacoes(showLoading = true) {
    const tbody = document.getElementById('minhasTbody');
    if (showLoading) tbody.innerHTML = '<tr><td colspan="8" class="hosp-empty">Carregando...</td></tr>';

    let query = supabase
      .from('hospedagem_minhas_solicitacoes')
      .select('*')
      .order('data_solicitacao', { ascending: false });
    if (userContext?.user?.id) query = query.eq('solicitante_id', userContext.user.id);

    const { data, error } = await query;
    if (error) {
      tbody.innerHTML = `<tr><td colspan="8" class="hosp-empty">${esc(error.message)}</td></tr>`;
      return;
    }

    state.solicitacoes = data || [];
    document.getElementById('statTotal').textContent = state.solicitacoes.length;
    document.getElementById('statOpen').textContent = state.solicitacoes.filter((row) => ['SOLICITADA', 'EM_ANALISE', 'EM_COTACAO'].includes(row.status_solicitacao)).length;
    document.getElementById('statReserved').textContent = state.solicitacoes.filter((row) => row.status_solicitacao === 'RESERVADA').length;

    renderMinhasTbody();
  }

  function renderMinhasTbody() {
    const tbody = document.getElementById('minhasTbody');
    if (!tbody) return;
    if (!state.solicitacoes.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="hosp-empty">Nenhuma solicitação encontrada.</td></tr>';
      return;
    }

    const rows = sortRows(state.sort, 'minhas', state.solicitacoes, minhasSortValue);
    tbody.innerHTML = rows.map((row) => {
      const encerrada = ['CANCELADA', 'CONCLUIDA'].includes(row.status_solicitacao);
      return `
      <tr>
        <td><strong>${esc(row.codigo || '-')}</strong><br><span class="hosp-help">${brDate(row.data_solicitacao)}</span></td>
        <td>${esc(row.colaboradores || '-')}</td>
        <td>${esc([row.cidade, row.uf].filter(Boolean).join('/'))}</td>
        <td>${esc(row.local_embarque || '-')}</td>
        <td>${brDate(row.data_checkin_prevista)} até ${brDate(row.data_checkout_prevista)}<br><span class="hosp-help">${esc(row.quantidade_diarias_prevista || '-')} diária(s)</span></td>
        <td>${esc(row.hotel || '-')}</td>
        <td><span class="hosp-status ${esc(String(row.status_solicitacao || '').toLowerCase())}">${esc(STATUS_SOLICITACAO[row.status_solicitacao] || row.status_solicitacao || '-')}</span></td>
        <td>
          <div class="hosp-row-actions">
            <button type="button" data-act="estender" data-id="${esc(row.solicitacao_id)}" data-checkout="${esc(row.data_checkout_prevista || '')}" ${encerrada ? 'disabled' : ''}>Estender</button>
            <button type="button" data-act="checkout" data-id="${esc(row.solicitacao_id)}" ${encerrada ? 'disabled' : ''}>Checkout</button>
            <button type="button" data-act="cancelar" data-id="${esc(row.solicitacao_id)}" ${encerrada ? 'disabled' : ''}>Cancelar</button>
          </div>
        </td>
      </tr>
    `;
    }).join('');
  }

  async function registrarEvento(solicitacaoId, tipoEvento, descricao, statusAnterior, statusNovo) {
    await supabase.from('hospedagem_eventos').insert({
      solicitacao_id: solicitacaoId,
      usuario_id: userContext?.user?.id || null,
      usuario_nome: userContext?.user?.name || null,
      tipo_evento: tipoEvento,
      descricao,
      status_anterior: statusAnterior || null,
      status_novo: statusNovo || null,
    });
  }

  async function acaoEstender(id, checkoutAtual) {
    const base = checkoutAtual || todayISO();
    const sugestao = addDaysISO(base, 1);
    const novaData = window.prompt('Nova data de check-out (AAAA-MM-DD):', sugestao);
    if (!novaData) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(novaData) || novaData <= base) {
      window.alert('Data inválida — precisa ser uma data no formato AAAA-MM-DD, posterior ao check-out atual.');
      return;
    }
    const { error } = await supabase
      .from('hospedagem_solicitacoes')
      .update({ data_checkout_prevista: novaData, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { window.alert(`Erro ao estender: ${error.message}`); return; }
    await registrarEvento(id, 'CHECKOUT_ESTENDIDO', `Check-out estendido para ${brDate(novaData)}.`, null, null);
    await loadSolicitacoes(false);
  }

  async function acaoCheckout(id) {
    if (!window.confirm('Confirmar checkout desta hospedagem?')) return;
    const { error } = await supabase
      .from('hospedagem_solicitacoes')
      .update({ status_solicitacao: 'CONCLUIDA', updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { window.alert(`Erro ao confirmar checkout: ${error.message}`); return; }
    await registrarEvento(id, 'CHECKOUT_REALIZADO', 'Checkout confirmado pelo gestor.', null, 'CONCLUIDA');
    await loadSolicitacoes(false);
  }

  async function acaoCancelar(id) {
    const motivo = window.prompt('Motivo do cancelamento (opcional):', '') || null;
    if (!window.confirm('Confirmar cancelamento desta hospedagem?')) return;
    const { error } = await supabase.rpc('hospedagem_cancelar_solicitacao', {
      p_solicitacao_id: id,
      p_motivo: motivo,
    });
    if (error) { window.alert(`Erro ao cancelar: ${error.message}`); return; }
    await loadSolicitacoes(false);
  }

  document.getElementById('addColabBtn').addEventListener('click', () => addColabRow());
  document.getElementById('clearBtn').addEventListener('click', resetForm);
  document.getElementById('refreshBtn').addEventListener('click', () => loadSolicitacoes());
  document.getElementById('minhasTheadRow').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-sort-column]');
    if (!btn) return;
    const kind = btn.dataset.sortKind;
    const column = btn.dataset.sortColumn;
    const current = state.sort[kind];
    state.sort[kind] = { column, direction: current.column === column && current.direction === 'asc' ? 'desc' : 'asc' };
    document.getElementById('minhasTheadRow').innerHTML = minhasTheadHtml(state);
    renderMinhasTbody();
  });
  document.getElementById('minhasTbody').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    const { act, id, checkout: checkoutAtual } = btn.dataset;
    if (act === 'estender') acaoEstender(id, checkoutAtual);
    else if (act === 'checkout') acaoCheckout(id);
    else if (act === 'cancelar') acaoCancelar(id);
  });
  checkin.addEventListener('change', () => { updateDataLimits(); updateDiarias(); });
  checkout.addEventListener('change', () => { updateDataLimits(); updateDiarias(); });
  ufSelect.addEventListener('change', () => populateCidades(ufSelect.value));
  form.addEventListener('submit', submitSolicitacao);

  async function loadCidadesEClientes() {
    const [cidades, clientes] = await Promise.all([loadCidadesBrasil(), loadClientesRef()]);
    state.cidades = cidades;
    state.clientes = clientes;

    if (clientes.length) {
      clienteSelect.innerHTML = `<option value="">Selecione o cliente</option>${clientes.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}`;
    } else {
      clienteSelect.innerHTML = '<option value="">Não foi possível carregar a lista</option>';
      clienteSelect.disabled = true;
      clienteManual.style.display = 'block';
    }

    if (ufSelect.value) populateCidades(ufSelect.value);
  }

  // --- Aba Alojamento: alojamentos da regional do gestor, hóspedes atuais
  // (mesma leitura que Hospedagem > Alojamentos > Hospedados usa: estadia
  // aberta em programacao_estadia com tipo_estadia=alojamento) + adicionar
  // colaborador direto, sem depender de uma Programação em andamento.
  document.querySelectorAll('.hosp-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.hospTab;
      document.querySelectorAll('.hosp-tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      document.getElementById('hospPanelHotel').toggleAttribute('hidden', tab !== 'hotel');
      document.getElementById('hospPanelAlojamento').toggleAttribute('hidden', tab !== 'alojamento');
    });
  });

  function alojamentoOcupanteFiltro(row, hoje) {
    if (normalizeText(row.tipo_estadia) !== 'alojamento') return false;
    if (row.tem_estadia === false) return false;
    if (!row.alojamento_id) return false;
    const referencia = row.data_referencia || row.checkin || '';
    const checkout = row.checkout || '';
    return referencia <= hoje && (!checkout || checkout >= hoje);
  }

  // state.ocupantes é uma lista achatada (1 linha por hóspede, não mais
  // agrupada em card por alojamento) — cada linha carrega o nome do
  // alojamento e a data de check-in, pra caber numa tabela em vez de blocos
  // (pedido do usuário, 2026-07-30: precisa mostrar colaborador + data).
  async function carregarOcupantesAlojamentos() {
    const hoje = todayISO();
    const ids = state.alojamentos.map((a) => a.id);
    state.ocupantes = [];
    if (!ids.length) return;
    const [atual, legado] = await Promise.all([
      supabase.from('programacao_estadia').select('id,colaborador_id,nome_colaborador,alojamento_id,checkin,checkout,data_referencia,tipo_estadia,tem_estadia').eq('data_referencia', hoje).in('alojamento_id', ids),
      supabase.from('programacao_estadia').select('id,colaborador_id,nome_colaborador,alojamento_id,checkin,checkout,data_referencia,tipo_estadia,tem_estadia').is('data_referencia', null).in('alojamento_id', ids),
    ]);
    const alojPorId = new Map(state.alojamentos.map((a) => [String(a.id), a]));
    const rows = [...(atual.data || []), ...(legado.data || [])].filter((row) => alojamentoOcupanteFiltro(row, hoje));
    state.ocupantes = rows.map((row) => {
      const aloj = alojPorId.get(String(row.alojamento_id));
      return {
        id: row.id,
        nome: row.nome_colaborador || 'Colaborador',
        checkin: row.checkin || row.data_referencia || null,
        alojamentoId: row.alojamento_id,
        alojamentoNome: aloj?.nome || 'Alojamento',
      };
    }).sort((a, b) => a.alojamentoNome.localeCompare(b.alojamentoNome, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  const HOSP_A_HISTORICO_DIAS = 180;

  // Histórico (entradas e saídas): diferente de carregarOcupantesAlojamentos
  // (que só traz quem está hospedado hoje), aqui buscamos todos os registros
  // de programacao_estadia da regional, sem filtrar por data ativa — tanto os
  // "legado" (criados pelo botão Adicionar/Encerrar desta página, sem
  // data_referencia, com checkin/checkout abertos) quanto os "snapshot"
  // diários gerados pela Programação (data_referencia por dia). Um snapshot
  // de um dia passado é tratado como uma entrada encerrada naquele mesmo dia.
  async function carregarHistoricoOcupantesAlojamentos() {
    const hoje = todayISO();
    const desde = addDaysISO(hoje, -HOSP_A_HISTORICO_DIAS);
    const ids = state.alojamentos.map((a) => a.id);
    state.ocupantesHistorico = [];
    state.hospAHistoricoCarregado = false;
    if (!ids.length) { state.hospAHistoricoCarregado = true; return; }

    const [legado, snapshots] = await Promise.all([
      supabase.from('programacao_estadia').select('id,colaborador_id,nome_colaborador,alojamento_id,checkin,checkout,data_referencia,tipo_estadia,tem_estadia').is('data_referencia', null).in('alojamento_id', ids),
      supabase.from('programacao_estadia').select('id,colaborador_id,nome_colaborador,alojamento_id,checkin,checkout,data_referencia,tipo_estadia,tem_estadia').gte('data_referencia', desde).in('alojamento_id', ids),
    ]);

    const alojPorId = new Map(state.alojamentos.map((a) => [String(a.id), a]));
    const rows = [...(legado.data || []), ...(snapshots.data || [])].filter((row) => {
      if (normalizeText(row.tipo_estadia) !== 'alojamento') return false;
      if (row.tem_estadia === false) return false;
      return !!row.alojamento_id;
    });

    state.ocupantesHistorico = rows.map((row) => {
      const aloj = alojPorId.get(String(row.alojamento_id));
      const checkout = row.checkout || (row.data_referencia && row.data_referencia < hoje ? row.data_referencia : null);
      return {
        id: row.id,
        nome: row.nome_colaborador || 'Colaborador',
        checkin: row.checkin || row.data_referencia || null,
        checkout,
        alojamentoId: row.alojamento_id,
        alojamentoNome: aloj?.nome || 'Alojamento',
      };
    }).sort((a, b) => (b.checkin || '').localeCompare(a.checkin || ''));

    state.hospAHistoricoCarregado = true;
  }

  function renderAlojamentoSelect() {
    const select = document.getElementById('hospAAlojSelect');
    if (!select) return;
    const atual = select.value;
    select.innerHTML = `<option value="">Selecione o alojamento...</option>${state.alojamentos
      .map((a) => `<option value="${esc(a.id)}">${esc(a.nome)}${a.cidade ? ` — ${esc(a.cidade)}/${esc(a.uf || '')}` : ''}</option>`)
      .join('')}`;
    if (atual) select.value = atual;
  }

  function renderAlojamentos() {
    const tbody = document.getElementById('hospATbody');
    if (!tbody) return;
    const historico = state.hospAModo === 'historico';
    const origem = historico ? state.ocupantesHistorico : state.ocupantes;
    const busca = normalizeText(document.getElementById('hospABusca')?.value || '');
    const filtrados = !busca ? origem : origem.filter((o) => normalizeText(`${o.alojamentoNome} ${o.nome}`).includes(busca));

    if (!state.alojamentos.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="hosp-empty">Nenhum alojamento cadastrado na sua regional ainda. Fale com o time de Hospedagem para vincular um alojamento à sua supervisão.</td></tr>';
      return;
    }
    if (historico && !state.hospAHistoricoCarregado) {
      tbody.innerHTML = '<tr><td colspan="5" class="hosp-empty">Carregando histórico...</td></tr>';
      return;
    }
    if (!filtrados.length) {
      const vazio = busca
        ? 'Nenhum alojamento ou colaborador encontrado para essa busca.'
        : (historico ? 'Nenhuma entrada registrada nos últimos meses.' : 'Nenhum colaborador hospedado no momento.');
      tbody.innerHTML = `<tr><td colspan="5" class="hosp-empty">${vazio}</td></tr>`;
      return;
    }

    const ordenados = sortRows(state.sort, 'alojamento', filtrados, (o, column) => {
      if (column === 'alojamento') return o.alojamentoNome || '';
      if (column === 'colaborador') return o.nome || '';
      if (column === 'desde') return o.checkin || '';
      if (column === 'saida') return o.checkout || '';
      return '';
    });

    tbody.innerHTML = ordenados.map((o) => `
      <tr>
        <td>${esc(o.alojamentoNome)}</td>
        <td>${esc(o.nome)}</td>
        <td>${brDate(o.checkin)}</td>
        <td>${o.checkout ? brDate(o.checkout) : '<span class="hospA-saida-atual">Hospedado atualmente</span>'}</td>
        <td><div class="hosp-row-actions">${o.checkout ? '' : `<button type="button" class="hospA-encerrar" data-encerrar-estadia="${esc(o.id)}">Encerrar</button>`}</div></td>
      </tr>
    `).join('');
  }

  async function carregarAlojamentosRegional() {
    const tbody = document.getElementById('hospATbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="hosp-empty">Carregando...</td></tr>';
    const minhasRegionais = getMinhasRegionais();
    const { data, error } = await supabase
      .from('hospedagem_alojamentos')
      .select('*')
      .neq('status', 'INATIVO')
      .order('cidade', { ascending: true })
      .order('nome', { ascending: true });
    if (error) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="hosp-empty">Não foi possível carregar: ${esc(error.message)}</td></tr>`;
      return;
    }
    const todos = data || [];
    const supervisoesDoAlojamento = (alojamento) => [...new Set([
      ...(Array.isArray(alojamento.supervisoes) ? alojamento.supervisoes : []),
      alojamento.supervisao,
    ].map(normalizeText).filter(Boolean))];
    state.alojamentos = minhasRegionais.length
      ? todos.filter((alojamento) => supervisoesDoAlojamento(alojamento).some((supervisao) => minhasRegionais.includes(supervisao)))
      : todos;
    renderAlojamentoSelect();
    await carregarOcupantesAlojamentos();
    renderAlojamentos();
  }

  const alojColabInput = document.getElementById('hospABuscaColab');
  const alojAcList = alojColabInput.nextElementSibling;
  const alojAddFeedback = document.getElementById('hospAAddFeedback');

  function setAlojFeedback(msg, type = '') {
    alojAddFeedback.textContent = msg || '';
    alojAddFeedback.className = `hospA-add-feedback ${type}`.trim();
  }

  alojColabInput.addEventListener('input', () => {
    delete alojColabInput.dataset.selectedId;
    const matches = buscarColaboradores(alojColabInput.value);
    if (!alojColabInput.value.trim()) { alojAcList.hidden = true; alojAcList.innerHTML = ''; return; }
    alojAcList.innerHTML = matches.length
      ? matches.map((c, i) => `<div class="hospA-ac-item" data-idx="${i}">${esc(c.nome)}<small>${esc([c.tipo, c.supervisao].filter(Boolean).join(' · '))}</small></div>`).join('')
      : '<div class="hospA-ac-empty">Nenhum colaborador ativo encontrado</div>';
    alojAcList.hidden = false;
  });
  alojColabInput.addEventListener('focus', () => { if (alojColabInput.value.trim()) alojColabInput.dispatchEvent(new Event('input')); });
  alojColabInput.addEventListener('blur', () => setTimeout(() => { alojAcList.hidden = true; }, 180));
  alojAcList.addEventListener('mousedown', (event) => {
    const item = event.target.closest('.hospA-ac-item');
    if (!item || item.dataset.idx == null) return;
    const matches = buscarColaboradores(alojColabInput.value);
    const selected = matches[Number(item.dataset.idx)];
    if (selected) alojColabInput.value = selected.nome;
    alojAcList.hidden = true;
  });

  document.getElementById('hospAAddBtn').addEventListener('click', async () => {
    const alojId = document.getElementById('hospAAlojSelect').value;
    if (!alojId) { setAlojFeedback('Selecione o alojamento.', 'err'); return; }
    const nome = alojColabInput.value.trim();
    if (!nome) { setAlojFeedback('Digite o nome do colaborador.', 'err'); return; }
    const found = state.colaboradores.find((c) => normalizeText(c.nome) === normalizeText(nome));
    if (!found) { setAlojFeedback('Selecione um colaborador da lista de sugestões.', 'err'); return; }
    const aloj = state.alojamentos.find((a) => String(a.id) === String(alojId));
    if (!aloj) { setAlojFeedback('Alojamento inválido.', 'err'); return; }
    await adicionarColaboradorAlojamento(aloj, found);
  });

  document.getElementById('hospATheadRow').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-sort-column]');
    if (!btn) return;
    const kind = btn.dataset.sortKind;
    const column = btn.dataset.sortColumn;
    const current = state.sort[kind];
    state.sort[kind] = { column, direction: current.column === column && current.direction === 'asc' ? 'desc' : 'asc' };
    document.getElementById('hospATheadRow').innerHTML = alojTheadHtml(state);
    renderAlojamentos();
  });
  document.getElementById('hospATbody').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-encerrar-estadia]');
    if (!btn) return;
    if (!window.confirm('Confirmar o encerramento desta estadia?')) return;
    encerrarEstadiaAlojamento(btn.dataset.encerrarEstadia);
  });

  async function adicionarColaboradorAlojamento(aloj, colaborador) {
    const addBtn = document.getElementById('hospAAddBtn');
    addBtn.disabled = true;
    setAlojFeedback('Adicionando...');

    const cpf = colaborador.cpf ? String(colaborador.cpf).replace(/\D/g, '') : '';
    const colaboradorId = cpf || normalizeText(colaborador.nome) || colaborador.nome;
    const hoje = todayISO();
    const payload = {
      colaborador_id: colaboradorId,
      nome_colaborador: colaborador.nome,
      tem_estadia: true,
      tipo_estadia: 'ALOJAMENTO',
      diarias: 1,
      checkin: hoje,
      checkout: null,
      data_referencia: null,
      alojamento_id: aloj.id,
      alojamento_nome: aloj.nome,
      cidade: aloj.cidade || null,
      uf: aloj.uf || null,
    };

    const { error } = await supabase.from('programacao_estadia').insert(payload);
    addBtn.disabled = false;
    if (error) {
      setAlojFeedback(error.message || 'Não foi possível adicionar.', 'err');
      return;
    }
    alojColabInput.value = '';
    document.getElementById('hospAAlojSelect').value = '';
    setAlojFeedback(`${colaborador.nome} adicionado a ${aloj.nome}.`, 'ok');
    state.hospAHistoricoCarregado = false;
    await carregarOcupantesAlojamentos();
    if (state.hospAModo === 'historico') await carregarHistoricoOcupantesAlojamentos();
    renderAlojamentos();
  }

  async function encerrarEstadiaAlojamento(estadiaId) {
    const { error } = await supabase
      .from('programacao_estadia')
      .update({ checkout: addDaysISO(todayISO(), -1) })
      .eq('id', estadiaId);
    if (error) { window.alert(`Erro ao encerrar estadia: ${error.message}`); return; }
    state.hospAHistoricoCarregado = false;
    await carregarOcupantesAlojamentos();
    if (state.hospAModo === 'historico') await carregarHistoricoOcupantesAlojamentos();
    renderAlojamentos();
  }

  document.getElementById('hospABusca').addEventListener('input', renderAlojamentos);

  document.querySelector('.hospA-modebar')?.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-hosp-a-mode]');
    if (!btn) return;
    const modo = btn.dataset.hospAMode;
    if (modo === state.hospAModo) return;
    state.hospAModo = modo;
    document.querySelectorAll('.hospA-mode-btn').forEach((b) => b.classList.toggle('active', b === btn));
    if (modo === 'historico' && !state.hospAHistoricoCarregado) {
      renderAlojamentos();
      await carregarHistoricoOcupantesAlojamentos();
    }
    renderAlojamentos();
  });

  (async function boot() {
    await loadColaboradores();
    resetForm();
    await loadSolicitacoes(false);
    await loadCidadesEClientes();
    await carregarAlojamentosRegional();
  })();
}

initProtectedPage('Hospedagem', renderContent);
