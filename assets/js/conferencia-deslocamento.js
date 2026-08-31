import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

// Tela: Conferência · Deslocamento
// Aba 1 — Resumo: deslocamentos sincronizados da programação
//         (programacao_deslocamento, alimentada pelo fluxo GRM/Programação),
//         agrupados por colaborador (um <details> por pessoa — o próprio
//         nome é o "dropdown"), com cada data dentro. Km continua editável
//         por linha e o valor recalcula pela tarifa do colaborador. Os
//         cards do topo (contagem por tipo) funcionam como filtro clicável,
//         no mesmo padrão do "Retorno do GRM" em Conferência.
// Aba 2 — Configuração (programacao_veiculo_proprio): quem usa veículo
//         próprio (REEMBOLSO KM) — fallback das caronas — e a tarifa R$/km
//         de cada um (não é universal, cada colaborador tem a sua).

const STYLE_ID = 'conf-desloc-styles';
const DEFAULT_TARIFA = 1.2; // usado só quando o colaborador ainda não tem tarifa configurada

let elRoot = null;
let abaAtiva = 'resumo';

// ------ estado compartilhado (período) ------
let deslocs = [];        // linhas de programacao_deslocamento no período
let kmDe = '';
let kmAte = '';

// ------ estado aba Resumo ------
let resumoBusca = '';
let resumoFiltroTipo = null; // null = sem filtro (todos); senão, um valor de TIPOS

// ------ estado aba Configuração ------
let baseColabs = [];     // { chave, nome, nomeNorm, supervisao }
let lista = [];          // linhas de programacao_veiculo_proprio (colaborador_id, nome, ativo, tarifa_km)
let estimativaPorColaborador = new Map(); // chave -> média mensal (R$) dos últimos 3 meses
let tarifaPorChave = new Map();
let tarifaPorNome = new Map();
let cfgBulkAberto = false;

const TIPOS = ['REEMBOLSO KM', 'MOTORISTA FROTA', 'CARONA FROTA', 'UBER/TÁXI', 'ÔNIBUS', 'NÃO PRECISA', 'OUTRO'];

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim().replace(/\s+/g, ' ');
}
function chaveDe(cpf, nome) {
  const c = String(cpf || '').replace(/\D/g, '');
  return c || String(nome || '').trim();
}
function esc(s) {
  return String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
function moeda(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function numKm(v) {
  return Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}
function dataBr(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
function isoHoje(offsetDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  return d.toISOString().slice(0, 10);
}
function tipoClasse(t) {
  const n = norm(t);
  if (n.includes('REEMBOLSO')) return 'reemb';
  if (n.includes('MOTORISTA')) return 'motorista';
  if (n.includes('CARONA')) return 'carona';
  if (n.includes('UBER') || n.includes('TAXI')) return 'uber';
  if (n.includes('ONIBUS')) return 'onibus';
  if (n.includes('NAO PRECISA')) return 'nao';
  return 'outro';
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = `
    .cd-wrap{max-width:1180px}
    .cd-tabs{display:flex;gap:6px;background:rgba(8,22,17,.72);border:1px solid rgba(111,208,165,.16);border-radius:12px;padding:4px;margin-bottom:14px}
    .cd-tab{background:none;border:1px solid transparent;color:#9fb7aa;font-size:13px;font-weight:800;padding:8px 16px;border-radius:9px;cursor:pointer;white-space:nowrap}
    .cd-tab.on{background:rgba(63,168,120,.22);color:#dcfce7;border-color:rgba(134,239,172,.35)}
    .cd-card{background:rgba(8,22,17,.72);border:1px solid rgba(111,208,165,.16);border-radius:16px;padding:14px 16px;margin-bottom:14px}
    .cd-filtros{display:grid;grid-template-columns:150px 150px minmax(200px,1fr);gap:8px;align-items:end}
    .cd-filtros.cd-filtros-cfg{grid-template-columns:minmax(220px,1fr) auto}
    @media (max-width:760px){.cd-filtros{grid-template-columns:1fr 1fr}.cd-filtros.cd-filtros-cfg{grid-template-columns:1fr}}
    .cd-lbl{font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#6fd0a5;margin-bottom:4px;display:block}
    .cd-input,.cd-area,.cd-select{width:100%;box-sizing:border-box;background:#06130e;color:#eef7f2;border:1px solid rgba(111,208,165,.3);border-radius:10px;padding:9px 11px;font-size:13.5px;font-family:inherit;outline:none}
    .cd-input:focus,.cd-area:focus,.cd-select:focus{border-color:#6fd0a5}
    .cd-area{min-height:84px;resize:vertical}
    .cd-btn{background:rgba(63,168,120,.16);border:1px solid rgba(134,239,172,.4);color:#dcfce7;border-radius:10px;padding:9px 14px;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap}
    .cd-btn:hover{background:rgba(63,168,120,.3)}
    .cd-btn:disabled{opacity:.6;cursor:not-allowed}
    .cd-btn.ghost{background:none;border-color:rgba(148,163,184,.35);color:#cbd5e1}
    .cd-badge{display:inline-block;font-size:10.5px;font-weight:800;letter-spacing:.03em;padding:3px 9px;border-radius:999px;border:1px solid transparent;white-space:nowrap}
    .cd-badge.reemb{background:rgba(250,204,21,.14);color:#fde68a;border-color:rgba(250,204,21,.35)}
    .cd-badge.motorista{background:rgba(96,165,250,.14);color:#bfdbfe;border-color:rgba(96,165,250,.3)}
    .cd-badge.carona{background:rgba(63,168,120,.18);color:#86efac;border-color:rgba(134,239,172,.35)}
    .cd-badge.uber{background:rgba(192,132,252,.14);color:#e9d5ff;border-color:rgba(192,132,252,.3)}
    .cd-badge.onibus{background:rgba(45,212,191,.14);color:#99f6e4;border-color:rgba(45,212,191,.3)}
    .cd-badge.nao{background:rgba(148,163,184,.14);color:#cbd5e1;border-color:rgba(148,163,184,.25)}
    .cd-badge.outro{background:rgba(251,146,60,.14);color:#fed7aa;border-color:rgba(251,146,60,.3)}
    .cd-km-input{width:84px;background:#06130e;color:#eef7f2;border:1px solid rgba(111,208,165,.3);border-radius:8px;padding:6px 8px;font-size:13px;text-align:right;outline:none;font-variant-numeric:tabular-nums}
    .cd-km-input:focus{border-color:#6fd0a5}
    .cd-km-input.salvo{border-color:#86efac;box-shadow:0 0 0 2px rgba(134,239,172,.2)}
    .cd-tarifa-input{width:76px;background:#06130e;color:#eef7f2;border:1px solid rgba(111,208,165,.3);border-radius:8px;padding:6px 8px;font-size:13px;text-align:right;outline:none;font-variant-numeric:tabular-nums}
    .cd-tarifa-input:focus{border-color:#6fd0a5}
    .cd-tarifa-input.salvo{border-color:#86efac;box-shadow:0 0 0 2px rgba(134,239,172,.2)}
    .cd-valor{font-weight:800;color:#fde68a}
    .cd-valor.zero{color:#64748b;font-weight:600}
    .cd-sub{font-size:11px;color:#8ba79a}
    .cd-search{position:relative}
    .cd-dd{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:30;background:#0c1f17;border:1px solid rgba(111,208,165,.3);border-radius:10px;max-height:280px;overflow:auto;box-shadow:0 14px 38px rgba(0,0,0,.5)}
    .cd-dd[hidden]{display:none}
    .cd-dd-item{padding:9px 12px;cursor:pointer;font-size:13.5px;color:#eef7f2;border-bottom:1px solid rgba(111,208,165,.08)}
    .cd-dd-item:hover{background:rgba(63,168,120,.18)}
    .cd-dd-item small{color:#8ba79a}
    .cd-dd-empty{padding:10px 12px;font-size:13px;color:#8ba79a;font-style:italic}
    .cd-row-actions{display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap}
    .cd-count{font-size:12.5px;color:#9fb7aa}
    .cd-count b{color:#6fd0a5}
    .cd-pill{font-size:11px;font-weight:800;padding:3px 9px;border-radius:999px;cursor:pointer;border:1px solid transparent}
    .cd-pill.on{background:rgba(63,168,120,.18);color:#86efac;border-color:rgba(134,239,172,.4)}
    .cd-pill.off{background:rgba(148,163,184,.14);color:#cbd5e1}
    .cd-del{background:none;border:0;color:#f87171;font-size:13px;font-weight:800;cursor:pointer;margin-left:10px}
    .cd-msg{font-size:12.5px;color:#9fb7aa;margin-top:8px;line-height:1.5}
    .cd-empty{padding:16px;border:1px dashed rgba(111,208,165,.22);border-radius:12px;color:#8ba79a;font-size:13px;text-align:center}

    /* ---- barra de tipos = filtro clicável (padrão "Retorno do GRM") ---- */
    .cd-overview{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap;margin:0 0 14px;padding:12px 14px;border:1px solid rgba(111,208,165,.16);border-radius:14px;background:rgba(4,28,20,.72)}
    .cd-overview-title{display:flex;flex-direction:column;gap:2px;min-width:max-content}
    .cd-overview-title strong{color:#edf9f3;font-size:12px}
    .cd-overview-title span{color:#789487;font-size:10px}
    .cd-overview-items{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap}
    .cd-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid rgba(148,163,184,.18);border-radius:999px;background:rgba(15,23,42,.28);color:#afbeb7;font-size:10.5px;font-weight:800;white-space:nowrap;font-family:inherit;cursor:pointer;transition:transform .12s ease,background .12s ease}
    .cd-chip:hover{background:rgba(15,23,42,.5);transform:translateY(-1px)}
    .cd-chip.active{background:rgba(255,255,255,.13);box-shadow:0 0 0 1px currentColor inset}
    .cd-chip i{width:7px;height:7px;border-radius:50%;background:#94a3b8;box-shadow:0 0 8px rgba(148,163,184,.35)}
    .cd-chip b{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:rgba(255,255,255,.08);color:inherit;font-size:10px}
    .cd-chip.reemb{color:#fde68a;border-color:rgba(250,204,21,.22)}.cd-chip.reemb i{background:#facc15;box-shadow:0 0 9px rgba(250,204,21,.5)}
    .cd-chip.motorista{color:#bfdbfe;border-color:rgba(96,165,250,.22)}.cd-chip.motorista i{background:#60a5fa;box-shadow:0 0 9px rgba(96,165,250,.5)}
    .cd-chip.carona{color:#86efac;border-color:rgba(134,239,172,.22)}.cd-chip.carona i{background:#34d399;box-shadow:0 0 9px rgba(52,211,153,.5)}
    .cd-chip.uber{color:#e9d5ff;border-color:rgba(192,132,252,.22)}.cd-chip.uber i{background:#c084fc;box-shadow:0 0 9px rgba(192,132,252,.5)}
    .cd-chip.onibus{color:#99f6e4;border-color:rgba(45,212,191,.22)}.cd-chip.onibus i{background:#2dd4bf;box-shadow:0 0 9px rgba(45,212,191,.5)}
    .cd-chip.nao{color:#cbd5e1;border-color:rgba(148,163,184,.22)}.cd-chip.nao i{background:#94a3b8;box-shadow:0 0 8px rgba(148,163,184,.4)}
    .cd-chip.outro{color:#fed7aa;border-color:rgba(251,146,60,.22)}.cd-chip.outro i{background:#fb923c;box-shadow:0 0 9px rgba(251,146,60,.5)}
    .cd-chip-clear{display:inline-flex;align-items:center;gap:4px;padding:5px 9px;border:1px solid rgba(248,113,113,.22);border-radius:999px;background:rgba(239,68,68,.08);color:#ff9d9d;font-size:10.5px;font-weight:800;font-family:inherit;cursor:pointer;white-space:nowrap}
    .cd-chip-clear:hover{background:rgba(239,68,68,.16)}
    @media (max-width:760px){.cd-overview{flex-direction:column;align-items:flex-start}.cd-overview-items{justify-content:flex-start}}

    /* ---- Resumo: um <details> por colaborador, nome = dropdown ---- */
    .cd-resumo-group{background:rgba(8,22,17,.72);border:1px solid rgba(111,208,165,.16);border-radius:14px;padding:2px 14px;margin-bottom:10px}
    .cd-resumo-group[open]{padding-bottom:12px}
    .cd-resumo-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:12px 0;cursor:pointer;list-style:none}
    .cd-resumo-head::-webkit-details-marker{display:none}
    .cd-resumo-head-left{display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0}
    .cd-resumo-chevron{width:9px;height:9px;border-right:2px solid #6fd0a5;border-bottom:2px solid #6fd0a5;transform:rotate(-45deg);transition:transform .15s ease;flex:none}
    details[open] .cd-resumo-chevron{transform:rotate(45deg)}
    .cd-resumo-nome{margin:0;font-size:14.5px;color:#f8fafc;font-weight:800}
    .cd-resumo-moda{font-size:11px;color:#9fb7aa}
    .cd-resumo-moda b{color:#6fd0a5}
    .cd-resumo-stats{display:flex;gap:14px;font-size:12px;color:#9fb7aa;white-space:nowrap}
    .cd-resumo-stats b{color:#6fd0a5}
    .cd-resumo-rows{display:flex;flex-direction:column;gap:5px;padding-top:2px}
    .cd-resumo-row{display:grid;grid-template-columns:78px 1fr auto auto auto;gap:10px;align-items:center;padding:7px 9px;background:rgba(13,32,24,.55);border:1px solid rgba(111,208,165,.1);border-radius:9px;font-size:12.5px}
    @media (max-width:760px){.cd-resumo-row{grid-template-columns:1fr 1fr}}
    .cd-resumo-row .rr-data{white-space:nowrap;color:#cbd5e1;font-weight:700}
    .cd-resumo-row .rr-trajeto{color:#9fb7aa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

    /* ---- Configuração: linha cheia por colaborador ---- */
    .cd-cfg-row{background:rgba(8,22,17,.72);border:1px solid rgba(111,208,165,.16);border-radius:14px;padding:12px 14px;margin-bottom:8px}
    .cd-cfg-nome{font-size:14.5px;font-weight:800;color:#f8fafc;margin-bottom:8px}
    .cd-cfg-meta{display:flex;align-items:center;gap:16px;flex-wrap:wrap;font-size:12.5px;color:#9fb7aa}
    .cd-cfg-meta b{color:#6fd0a5}
    .cd-cfg-tarifa{display:flex;align-items:center;gap:6px}
  `;
  document.head.appendChild(st);
}

/* ========================== DADOS COMPARTILHADOS ========================== */

async function loadDeslocs() {
  let q = supabase
    .from('programacao_deslocamento')
    .select('id,data_referencia,colaborador_id,nome_colaborador,tipo_deslocamento,origem,destino,km,valor,placa_veiculo,observacao')
    .order('data_referencia', { ascending: false })
    .order('nome_colaborador')
    .limit(3000);
  if (kmDe) q = q.gte('data_referencia', kmDe);
  if (kmAte) q = q.lte('data_referencia', kmAte);
  const { data, error } = await q;
  if (error) { console.warn('[conf-desloc] km', error); deslocs = []; return; }
  deslocs = data || [];
}

function montarTarifas() {
  tarifaPorChave = new Map(lista.map((l) => [String(l.colaborador_id), Number(l.tarifa_km) || DEFAULT_TARIFA]));
  tarifaPorNome = new Map(lista.map((l) => [norm(l.nome), Number(l.tarifa_km) || DEFAULT_TARIFA]));
}

function tarifaDe(d) {
  return tarifaPorChave.get(String(d.colaborador_id))
    ?? tarifaPorNome.get(norm(d.nome_colaborador))
    ?? DEFAULT_TARIFA;
}

function valorLinha(d) {
  const v = Number(d.valor || 0);
  if (v > 0) return v;
  if (norm(d.tipo_deslocamento).includes('REEMBOLSO')) return Number(d.km || 0) * tarifaDe(d);
  return 0;
}

/* ========================== ABA 1 · RESUMO ========================== */

function resumoPorBusca() {
  const busca = norm(resumoBusca);
  if (!busca) return deslocs;
  return deslocs.filter((d) => norm(d.nome_colaborador || d.colaborador_id).includes(busca));
}

function resumoFiltrados() {
  const rows = resumoPorBusca();
  if (!resumoFiltroTipo) return rows;
  return rows.filter((d) => norm(d.tipo_deslocamento) === norm(resumoFiltroTipo));
}

function modaTipoPorColaborador() {
  const contagens = new Map(); // chave -> Map(tipo -> n)
  for (const d of deslocs) {
    const chave = d.colaborador_id || d.nome_colaborador;
    const tipo = d.tipo_deslocamento || 'NÃO PRECISA';
    if (!chave) continue;
    if (!contagens.has(chave)) contagens.set(chave, new Map());
    const m = contagens.get(chave);
    m.set(tipo, (m.get(tipo) || 0) + 1);
  }
  const moda = new Map();
  for (const [chave, m] of contagens.entries()) {
    let melhorTipo = null; let melhorN = -1;
    for (const [tipo, n] of m.entries()) { if (n > melhorN) { melhorTipo = tipo; melhorN = n; } }
    moda.set(chave, { tipo: melhorTipo, n: melhorN });
  }
  return moda;
}

function renderOverviewResumo() {
  const box = elRoot.querySelector('#cdOverview');
  if (!box) return;
  const base = resumoPorBusca();
  const total = base.length;
  const counts = new Map(TIPOS.map((t) => [t, 0]));
  base.forEach((d) => {
    const t = TIPOS.find((x) => norm(x) === norm(d.tipo_deslocamento));
    if (t) counts.set(t, (counts.get(t) || 0) + 1);
  });
  box.innerHTML = `
    <div class="cd-overview-title">
      <strong>Tipos de deslocamento</strong>
      <span>Clique num tipo pra filtrar a lista abaixo.</span>
    </div>
    <div class="cd-overview-items">
      <button type="button" class="cd-chip${!resumoFiltroTipo ? ' active' : ''}" data-chip="TODOS"><i style="background:#6fd0a5;box-shadow:0 0 9px rgba(111,208,165,.5)"></i>Todos<b>${total}</b></button>
      ${TIPOS.map((t) => `
        <button type="button" class="cd-chip ${tipoClasse(t)}${resumoFiltroTipo === t ? ' active' : ''}" data-chip="${esc(t)}" title="${resumoFiltroTipo === t ? 'Clique pra remover o filtro' : `Filtrar por: ${esc(t)}`}">
          <i></i>${esc(t)}<b>${counts.get(t) || 0}</b>
        </button>
      `).join('')}
      ${resumoFiltroTipo ? '<button type="button" class="cd-chip-clear" data-chip-clear>Limpar filtro ✕</button>' : ''}
    </div>
  `;
}

function resumoAgrupado() {
  const moda = modaTipoPorColaborador();
  const porColab = new Map(); // chave -> { nome, itens: [] }
  for (const d of resumoFiltrados()) {
    const nome = d.nome_colaborador || d.colaborador_id || 'Sem nome';
    const chave = d.colaborador_id || nome;
    if (!porColab.has(chave)) porColab.set(chave, { chave, nome, itens: [] });
    porColab.get(chave).itens.push(d);
  }
  const grupos = [...porColab.values()];
  grupos.forEach((g) => {
    g.itens.sort((a, b) => String(b.data_referencia).localeCompare(String(a.data_referencia)));
    g.moda = moda.get(g.chave) || null;
  });
  grupos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return grupos;
}

function renderResumo() {
  const box = elRoot.querySelector('#cdResumoLista');
  if (!box) return;
  const grupos = resumoAgrupado();
  if (!grupos.length) {
    box.innerHTML = '<div class="cd-empty">Nenhum deslocamento sincronizado para o período/filtros selecionados. Os dados chegam aqui pela Etapa de Deslocamento da Programação (sincronização GRM).</div>';
    return;
  }
  box.innerHTML = grupos.map((g) => {
    const kmTotal = g.itens.reduce((s, d) => s + Number(d.km || 0), 0);
    const valorTotal = g.itens.reduce((s, d) => s + valorLinha(d), 0);
    return `
      <details class="cd-resumo-group">
        <summary class="cd-resumo-head">
          <div class="cd-resumo-head-left">
            <span class="cd-resumo-chevron"></span>
            <span class="cd-resumo-nome">${esc(g.nome)}</span>
            ${g.moda ? `<span class="cd-resumo-moda">Mais usado: <b>${esc(g.moda.tipo)}</b> (${g.moda.n}x)</span>` : ''}
          </div>
          <div class="cd-resumo-stats">
            <span><b>${g.itens.length}</b> data(s)</span>
            <span><b>${numKm(kmTotal)}</b> km</span>
            <span><b>${moeda(valorTotal)}</b></span>
          </div>
        </summary>
        <div class="cd-resumo-rows">
          ${g.itens.map((d) => {
            const val = valorLinha(d);
            const trajeto = [d.origem, d.destino].filter(Boolean).join(' → ') || '—';
            return `
              <div class="cd-resumo-row" data-id="${esc(d.id)}">
                <span class="rr-data">${dataBr(d.data_referencia)}</span>
                <span class="rr-trajeto" title="${esc(trajeto)}">${esc(trajeto)}${d.placa_veiculo ? ` · ${esc(d.placa_veiculo)}` : ''}</span>
                <span class="cd-badge ${tipoClasse(d.tipo_deslocamento)}">${esc(d.tipo_deslocamento || '—')}</span>
                <input class="cd-km-input" data-km type="number" min="0" step="0.1" value="${Number(d.km || 0)}" />
                <span class="cd-valor ${val > 0 ? '' : 'zero'}" data-valor>${moeda(val)}</span>
              </div>`;
          }).join('')}
        </div>
      </details>`;
  }).join('');
}

async function salvarKm(id, kmNovo, inputEl, rowEl) {
  const d = deslocs.find((x) => String(x.id) === String(id));
  if (!d) return;
  const km = Number(kmNovo);
  if (!Number.isFinite(km) || km < 0) { inputEl.value = Number(d.km || 0); return; }
  const isReemb = norm(d.tipo_deslocamento).includes('REEMBOLSO');
  const valor = isReemb ? Number((km * tarifaDe(d)).toFixed(2)) : Number(d.valor || 0);
  const { error } = await supabase
    .from('programacao_deslocamento')
    .update({ km, valor, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { alert(error.message || 'Não foi possível salvar o km.'); inputEl.value = Number(d.km || 0); return; }
  d.km = km; d.valor = valor;
  const spanValor = rowEl.querySelector('[data-valor]');
  const val = valorLinha(d);
  if (spanValor) {
    spanValor.textContent = moeda(val);
    spanValor.classList.toggle('zero', !(val > 0));
  }
  inputEl.classList.add('salvo');
  setTimeout(() => inputEl.classList.remove('salvo'), 1200);
}

function wireAbaResumo() {
  const de = elRoot.querySelector('#cdResumoDe');
  const ate = elRoot.querySelector('#cdResumoAte');
  const busca = elRoot.querySelector('#cdResumoBusca');
  const aplicar = elRoot.querySelector('#cdResumoAplicar');

  const recarregar = async () => {
    kmDe = de.value; kmAte = ate.value;
    aplicar.disabled = true; aplicar.textContent = 'Carregando...';
    await loadDeslocs();
    aplicar.disabled = false; aplicar.textContent = 'Aplicar período';
    renderOverviewResumo(); renderResumo();
  };
  aplicar.addEventListener('click', recarregar);
  de.addEventListener('change', recarregar);
  ate.addEventListener('change', recarregar);

  busca.addEventListener('input', () => { resumoBusca = busca.value; renderOverviewResumo(); renderResumo(); });

  const overview = elRoot.querySelector('#cdOverview');
  overview.addEventListener('click', (e) => {
    if (e.target.closest('[data-chip-clear]')) { resumoFiltroTipo = null; renderOverviewResumo(); renderResumo(); return; }
    const chip = e.target.closest('[data-chip]');
    if (!chip) return;
    const tipo = chip.dataset.chip;
    resumoFiltroTipo = (tipo === 'TODOS' || resumoFiltroTipo === tipo) ? null : tipo;
    renderOverviewResumo(); renderResumo();
  });

  const lista = elRoot.querySelector('#cdResumoLista');
  lista.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-km]')) { e.preventDefault(); e.target.blur(); }
  });
  lista.addEventListener('focusout', (e) => {
    if (!e.target.matches('[data-km]')) return;
    const row = e.target.closest('.cd-resumo-row[data-id]');
    if (!row) return;
    const d = deslocs.find((x) => String(x.id) === String(row.dataset.id));
    if (d && Number(e.target.value) === Number(d.km || 0)) return; // sem mudança
    salvarKm(row.dataset.id, e.target.value, e.target, row);
  });
}

/* ========================== ABA 2 · CONFIGURAÇÃO ========================== */

async function loadBase() {
  const { data, error } = await supabase
    .from('operacional_colaborador_base')
    .select('cpf,nome,supervisao')
    .eq('ativo', true)
    .order('nome')
    .limit(2000);
  if (error) { console.warn('[conf-desloc] base', error); return; }
  baseColabs = (data || []).map((r) => ({
    chave: chaveDe(r.cpf, r.nome),
    nome: r.nome || '',
    nomeNorm: norm(r.nome),
    supervisao: r.supervisao || '',
  }));
}

async function loadLista() {
  const { data, error } = await supabase
    .from('programacao_veiculo_proprio')
    .select('*')
    .order('nome');
  if (error) { console.warn('[conf-desloc] lista', error); lista = []; return; }
  lista = data || [];
  montarTarifas();
}

// #35: colaborador desligado (inativo em operacional_colaborador_base) sai
// automaticamente da configuração (baseColabs só traz os ativos, usado
// pra busca/adição), então checamos o status real de cada um já presente na
// lista contra a base completa antes de decidir remover.
async function limparInativosDaLista() {
  if (!lista.length) return;
  const { data, error } = await supabase
    .from('operacional_colaborador_base')
    .select('cpf,nome,ativo')
    .limit(5000);
  if (error) { console.warn('[conf-desloc] checar inativos', error); return; }

  const statusPorChave = new Map((data || []).map((r) => [chaveDe(r.cpf, r.nome), !!r.ativo]));
  const paraRemover = lista.filter((l) => statusPorChave.get(l.colaborador_id) === false);
  if (!paraRemover.length) return;

  const { error: delErr } = await supabase
    .from('programacao_veiculo_proprio')
    .delete()
    .in('id', paraRemover.map((l) => l.id));
  if (delErr) { console.warn('[conf-desloc] remover inativos', delErr); return; }

  const idsRemovidos = new Set(paraRemover.map((l) => l.id));
  lista = lista.filter((l) => !idsRemovidos.has(l.id));
  montarTarifas();
}

// #36: estimativa mensal de consumo por colaborador, baseada na média dos
// últimos 3 meses de deslocamento (programacao_deslocamento), independente
// do filtro de período selecionado na aba Resumo.
async function loadEstimativaConsumo() {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 3, 1).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('programacao_deslocamento')
    .select('data_referencia,colaborador_id,nome_colaborador,tipo_deslocamento,km,valor')
    .gte('data_referencia', inicio)
    .limit(20000);
  if (error) { console.warn('[conf-desloc] estimativa', error); estimativaPorColaborador = new Map(); return; }

  const porColabMes = new Map();
  for (const d of (data || [])) {
    const chave = d.colaborador_id || d.nome_colaborador;
    const mes = String(d.data_referencia || '').slice(0, 7);
    if (!chave || !mes) continue;
    if (!porColabMes.has(chave)) porColabMes.set(chave, new Map());
    const meses = porColabMes.get(chave);
    meses.set(mes, (meses.get(mes) || 0) + valorLinha(d));
  }

  estimativaPorColaborador = new Map();
  for (const [chave, meses] of porColabMes.entries()) {
    const totais = [...meses.values()];
    const media = totais.reduce((s, v) => s + v, 0) / totais.length;
    estimativaPorColaborador.set(chave, media);
  }
}

async function addEntry(chave, nome) {
  if (!chave) return;
  const { error } = await supabase
    .from('programacao_veiculo_proprio')
    .upsert({ colaborador_id: chave, nome: nome || null, ativo: true }, { onConflict: 'colaborador_id' });
  if (error) throw error;
}

async function salvarTarifaColaborador(id, valor, inputEl) {
  const l = lista.find((x) => String(x.id) === String(id));
  if (!l) return;
  const v = Number(String(valor).replace(',', '.'));
  if (!Number.isFinite(v) || v <= 0) { inputEl.value = Number(l.tarifa_km || DEFAULT_TARIFA); return; }
  const { error } = await supabase
    .from('programacao_veiculo_proprio')
    .update({ tarifa_km: v, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { alert(error.message || 'Não foi possível salvar a tarifa.'); inputEl.value = Number(l.tarifa_km || DEFAULT_TARIFA); return; }
  l.tarifa_km = v;
  montarTarifas();
  inputEl.classList.add('salvo');
  setTimeout(() => inputEl.classList.remove('salvo'), 1200);
}

function renderLista() {
  const box = elRoot.querySelector('#cdLista');
  const cnt = elRoot.querySelector('#cdCount');
  if (!box) return;
  const ativos = lista.filter((l) => l.ativo).length;
  if (cnt) cnt.innerHTML = `<b>${ativos}</b> ativo(s) · ${lista.length} no total`;
  if (!lista.length) { box.innerHTML = '<div class="cd-empty">Nenhum colaborador cadastrado ainda. Use a busca acima pra adicionar.</div>'; return; }
  box.innerHTML = lista.map((l) => {
    const estimativa = estimativaPorColaborador.get(l.colaborador_id);
    return `
    <div class="cd-cfg-row" data-id="${esc(l.id)}">
      <div class="cd-cfg-nome">${esc(l.nome || l.colaborador_id)}</div>
      <div class="cd-cfg-meta">
        <span>Estimativa mensal: <b>${estimativa != null ? `${moeda(estimativa)}/mês` : '—'}</b></span>
        <label class="cd-cfg-tarifa">Tarifa R$/km <input class="cd-tarifa-input" data-tarifa type="number" min="0" step="0.01" value="${Number(l.tarifa_km || DEFAULT_TARIFA)}" /></label>
        <span class="cd-pill ${l.ativo ? 'on' : 'off'}" data-toggle>${l.ativo ? 'Ativo' : 'Inativo'}</span>
        <button class="cd-del" data-del>remover</button>
      </div>
    </div>`;
  }).join('');
}

async function bulkAdd(text, msgEl) {
  const linhas = String(text || '').split(/[\n;]+/).map((s) => s.trim()).filter(Boolean);
  if (!linhas.length) return;
  const porNome = new Map();
  baseColabs.forEach((c) => { if (!porNome.has(c.nomeNorm)) porNome.set(c.nomeNorm, c); });
  const achados = [];
  const naoAchados = [];
  linhas.forEach((linha) => {
    const c = porNome.get(norm(linha));
    if (c) achados.push(c); else naoAchados.push(linha);
  });
  // dedup por chave
  const vistos = new Set();
  const unicos = achados.filter((c) => (vistos.has(c.chave) ? false : vistos.add(c.chave)));
  if (unicos.length) {
    const payload = unicos.map((c) => ({ colaborador_id: c.chave, nome: c.nome, ativo: true }));
    const { error } = await supabase.from('programacao_veiculo_proprio').upsert(payload, { onConflict: 'colaborador_id' });
    if (error) throw error;
  }
  await loadLista();
  renderLista();
  if (msgEl) {
    msgEl.innerHTML = `Adicionados: <b style="color:#86efac">${unicos.length}</b>.` +
      (naoAchados.length ? ` Não encontrados (confira o nome): ${naoAchados.map(esc).join(', ')}` : '');
  }
}

function achaColabPorNomeExato(texto) {
  const alvo = norm(texto);
  if (!alvo) return null;
  return baseColabs.find((c) => c.nomeNorm === alvo) || null;
}

function wireSearch() {
  const input = elRoot.querySelector('#cdSearch');
  const dd = elRoot.querySelector('#cdDropdown');
  const addBtn = elRoot.querySelector('#cdAddBtn');
  if (!input || !dd) return;
  const render = () => {
    const term = norm(input.value);
    if (term.length < 2) { dd.hidden = true; return; }
    const jaTem = new Set(lista.map((l) => String(l.colaborador_id)));
    const res = baseColabs.filter((c) => c.nomeNorm.includes(term)).slice(0, 12);
    if (!res.length) { dd.innerHTML = '<div class="cd-dd-empty">Nenhum colaborador encontrado.</div>'; dd.hidden = false; return; }
    dd.innerHTML = res.map((c) => `<div class="cd-dd-item" data-chave="${esc(c.chave)}" data-nome="${esc(c.nome)}">${esc(c.nome)} ${jaTem.has(c.chave) ? '<small>· já cadastrado</small>' : `<small>· ${esc(c.supervisao)}</small>`}</div>`).join('');
    dd.hidden = false;
  };
  input.addEventListener('input', render);
  input.addEventListener('focus', render);
  document.addEventListener('click', (e) => {
    const wrap = elRoot.querySelector('#cdSearchWrap');
    if (wrap && !wrap.contains(e.target)) dd.hidden = true;
  });
  dd.addEventListener('click', async (e) => {
    const it = e.target.closest('.cd-dd-item');
    if (!it || !it.dataset.chave) return;
    dd.hidden = true; input.value = '';
    try {
      await addEntry(it.dataset.chave, it.dataset.nome);
      await loadLista();
      renderLista();
    } catch (err) { alert(err.message || 'Não foi possível adicionar.'); }
  });
  addBtn.addEventListener('click', async () => {
    const c = achaColabPorNomeExato(input.value);
    if (!c) { alert('Não encontrei esse colaborador. Escolha um nome da lista de sugestões.'); return; }
    addBtn.disabled = true;
    try {
      await addEntry(c.chave, c.nome);
      await loadLista();
      renderLista();
      input.value = ''; dd.hidden = true;
    } catch (err) { alert(err.message || 'Não foi possível adicionar.'); }
    finally { addBtn.disabled = false; }
  });
}

function wireLista() {
  const box = elRoot.querySelector('#cdLista');
  if (!box) return;
  box.addEventListener('click', async (e) => {
    const row = e.target.closest('.cd-cfg-row[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    if (e.target.closest('[data-del]')) {
      if (!confirm('Remover este colaborador da configuração?')) return;
      const { error } = await supabase.from('programacao_veiculo_proprio').delete().eq('id', id);
      if (error) { alert(error.message); return; }
      await loadLista(); renderLista();
    } else if (e.target.closest('[data-toggle]')) {
      const atual = lista.find((l) => String(l.id) === String(id));
      const { error } = await supabase.from('programacao_veiculo_proprio').update({ ativo: !atual?.ativo, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) { alert(error.message); return; }
      await loadLista(); renderLista();
    }
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-tarifa]')) { e.preventDefault(); e.target.blur(); }
  });
  box.addEventListener('focusout', (e) => {
    if (!e.target.matches('[data-tarifa]')) return;
    const row = e.target.closest('.cd-cfg-row[data-id]');
    if (!row) return;
    const l = lista.find((x) => String(x.id) === String(row.dataset.id));
    if (l && Number(e.target.value) === Number(l.tarifa_km || DEFAULT_TARIFA)) return; // sem mudança
    salvarTarifaColaborador(row.dataset.id, e.target.value, e.target);
  });
}

/* ========================== RENDER GERAL ========================== */

function htmlAbaResumo() {
  return `
    <div class="cd-card">
      <div class="cd-filtros">
        <div>
          <label class="cd-lbl">De</label>
          <input class="cd-input" id="cdResumoDe" type="date" value="${esc(kmDe)}" />
        </div>
        <div>
          <label class="cd-lbl">Até</label>
          <input class="cd-input" id="cdResumoAte" type="date" value="${esc(kmAte)}" />
        </div>
        <div>
          <label class="cd-lbl">Buscar colaborador</label>
          <input class="cd-input" id="cdResumoBusca" type="text" placeholder="Nome do colaborador..." value="${esc(resumoBusca)}" />
        </div>
      </div>
      <div class="cd-row-actions">
        <button class="cd-btn ghost" id="cdResumoAplicar" type="button">Aplicar período</button>
        <span class="cd-sub">Deslocamentos gravados pela Programação (sincronização GRM), agrupados por colaborador — clique no nome pra abrir as datas.</span>
      </div>
    </div>
    <div class="cd-overview" id="cdOverview"></div>
    <div id="cdResumoLista"><div class="cd-empty">Carregando resumo...</div></div>
  `;
}

function htmlAbaConfig() {
  return `
    <div class="cd-card">
      <div class="cd-filtros cd-filtros-cfg">
        <div class="cd-search" id="cdSearchWrap">
          <label class="cd-lbl">Buscar / adicionar colaborador</label>
          <input class="cd-input" id="cdSearch" type="text" placeholder="Nome do colaborador..." autocomplete="off" spellcheck="false" />
          <div class="cd-dd" id="cdDropdown" hidden></div>
        </div>
        <div>
          <label class="cd-lbl">&nbsp;</label>
          <button class="cd-btn" id="cdAddBtn" type="button">Adicionar</button>
        </div>
      </div>
      <div class="cd-row-actions">
        <button class="cd-btn ghost" id="cdBulkToggle" type="button">${cfgBulkAberto ? 'Ocultar' : 'Colar lista de nomes'}</button>
        <span class="cd-count" id="cdCount"></span>
      </div>
      <div id="cdBulkWrap" ${cfgBulkAberto ? '' : 'hidden'}>
        <label class="cd-lbl" style="margin-top:10px">Colar lista de nomes (um por linha)</label>
        <textarea class="cd-area" id="cdBulk" placeholder="João da Silva&#10;Maria Souza&#10;..."></textarea>
        <div class="cd-row-actions"><button class="cd-btn" id="cdBulkBtn" type="button">Adicionar lista</button></div>
        <div class="cd-msg" id="cdBulkMsg"></div>
      </div>
      <div class="cd-msg">Quem está cadastrado aqui, quando <b>não pega carona</b> na programação, vai de <b>carro próprio</b> (reembolso pela tarifa R$/km dele). Quem não está vai de <b>Uber/Táxi</b>. Usado pela sugestão de caronas na Etapa 1 da Programação. A tarifa não é única para todos — edite o valor de cada colaborador direto na linha dele.</div>
    </div>
    <div id="cdLista"><div class="cd-empty">Carregando...</div></div>
  `;
}

function renderAba() {
  const body = elRoot.querySelector('#cdBody');
  elRoot.querySelectorAll('.cd-tab').forEach((b) => b.classList.toggle('on', b.dataset.aba === abaAtiva));
  if (abaAtiva === 'resumo') {
    body.innerHTML = htmlAbaResumo();
    wireAbaResumo();
    renderOverviewResumo();
    renderResumo();
  } else {
    body.innerHTML = htmlAbaConfig();
    wireSearch();
    wireLista();
    renderLista();
    const bulkToggle = elRoot.querySelector('#cdBulkToggle');
    bulkToggle.addEventListener('click', () => {
      cfgBulkAberto = !cfgBulkAberto;
      elRoot.querySelector('#cdBulkWrap').hidden = !cfgBulkAberto;
      bulkToggle.textContent = cfgBulkAberto ? 'Ocultar' : 'Colar lista de nomes';
    });
    const bulkBtn = elRoot.querySelector('#cdBulkBtn');
    bulkBtn.addEventListener('click', async () => {
      bulkBtn.disabled = true;
      try {
        await bulkAdd(elRoot.querySelector('#cdBulk').value, elRoot.querySelector('#cdBulkMsg'));
        elRoot.querySelector('#cdBulk').value = '';
      } catch (err) { alert(err.message || 'Erro ao adicionar a lista.'); }
      finally { bulkBtn.disabled = false; }
    });
  }
}

export function renderContent(content) {
  injectStyles();
  elRoot = content;

  // período padrão: mês corrente
  const hoje = new Date();
  kmDe = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
  kmAte = isoHoje();

  content.innerHTML = `
    <div class="cd-wrap">
      <div class="cd-tabs">
        <button class="cd-tab on" data-aba="resumo" type="button">Resumo</button>
        <button class="cd-tab" data-aba="config" type="button">Configuração</button>
      </div>
      <div id="cdBody"></div>
    </div>
  `;

  content.querySelector('.cd-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.cd-tab');
    if (!btn || btn.dataset.aba === abaAtiva) return;
    abaAtiva = btn.dataset.aba;
    renderAba();
  });

  Promise.all([loadDeslocs(), loadBase(), loadLista()]).then(async () => {
    await limparInativosDaLista();
    await loadEstimativaConsumo();
    renderAba();
  });
}

initProtectedPage('Conferência · Deslocamento', renderContent);
