import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

// Tela: Conferência · Deslocamento
// Aba 1 — Conferência de km: lê os deslocamentos sincronizados da programação
//         (programacao_deslocamento, alimentada pelo fluxo GRM/Programação),
//         permite conferir/lançar km por colaborador e calcula o valor de
//         reembolso com base na tarifa R$/km de cada colaborador.
// Aba 2 — Resumo: o mesmo período agrupado por colaborador, com cada data em
//         que ele teve deslocamento lançado (conforme a Programação).
// Aba 3 — Configuração (programacao_veiculo_proprio): quem usa veículo
//         próprio (REEMBOLSO KM) — fallback das caronas — e a tarifa R$/km
//         de cada um (não é universal, cada colaborador tem a sua).

const STYLE_ID = 'conf-desloc-styles';
const DEFAULT_TARIFA = 1.2; // usado só quando o colaborador ainda não tem tarifa configurada

let elRoot = null;
let abaAtiva = 'km';

// ------ estado compartilhado (período) ------
let deslocs = [];        // linhas de programacao_deslocamento no período
let kmDe = '';
let kmAte = '';

// ------ estado aba Conferência de km ------
let filtroTipo = 'TODOS';
let filtroBusca = '';

// ------ estado aba Resumo ------
let resumoBusca = '';

// ------ estado aba Configuração ------
let baseColabs = [];     // { chave, nome, nomeNorm, supervisao }
let lista = [];          // linhas de programacao_veiculo_proprio (colaborador_id, nome, ativo, tarifa_km)
let estimativaPorColaborador = new Map(); // chave -> média mensal (R$) dos últimos 3 meses
let tarifaPorChave = new Map();
let tarifaPorNome = new Map();

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
    .cd-topo{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}
    .cd-topo h3{margin:0 0 2px;font-size:18px;color:#f8fafc}
    .cd-topo p{margin:0;font-size:12.5px;color:#9fb7aa;line-height:1.45;max-width:640px}
    .cd-tabs{display:flex;gap:6px;background:rgba(8,22,17,.72);border:1px solid rgba(111,208,165,.16);border-radius:12px;padding:4px}
    .cd-tab{background:none;border:1px solid transparent;color:#9fb7aa;font-size:13px;font-weight:800;padding:8px 16px;border-radius:9px;cursor:pointer;white-space:nowrap}
    .cd-tab.on{background:rgba(63,168,120,.22);color:#dcfce7;border-color:rgba(134,239,172,.35)}
    .cd-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin-bottom:12px}
    .cd-kpi{background:rgba(8,22,17,.72);border:1px solid rgba(111,208,165,.16);border-radius:12px;padding:10px 14px;display:flex;flex-direction:column;gap:2px}
    .cd-kpi small{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#6fd0a5}
    .cd-kpi b{font-size:19px;color:#f8fafc;font-variant-numeric:tabular-nums}
    .cd-kpi span{font-size:11px;color:#8ba79a}
    .cd-card{background:rgba(8,22,17,.72);border:1px solid rgba(111,208,165,.16);border-radius:16px;padding:14px 16px;margin-bottom:14px}
    .cd-filtros{display:grid;grid-template-columns:150px 150px 200px minmax(200px,1fr);gap:8px;align-items:end}
    @media (max-width:960px){.cd-filtros{grid-template-columns:1fr 1fr}}
    .cd-lbl{font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#6fd0a5;margin-bottom:4px;display:block}
    .cd-input,.cd-area,.cd-select{width:100%;box-sizing:border-box;background:#06130e;color:#eef7f2;border:1px solid rgba(111,208,165,.3);border-radius:10px;padding:9px 11px;font-size:13.5px;font-family:inherit;outline:none}
    .cd-input:focus,.cd-area:focus,.cd-select:focus{border-color:#6fd0a5}
    .cd-area{min-height:84px;resize:vertical}
    .cd-btn{background:rgba(63,168,120,.16);border:1px solid rgba(134,239,172,.4);color:#dcfce7;border-radius:10px;padding:9px 14px;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap}
    .cd-btn:hover{background:rgba(63,168,120,.3)}
    .cd-btn:disabled{opacity:.6;cursor:not-allowed}
    .cd-btn.ghost{background:none;border-color:rgba(148,163,184,.35);color:#cbd5e1}
    .cd-table-wrap{overflow:auto;max-height:60vh;border-radius:12px}
    .cd-table{width:100%;border-collapse:separate;border-spacing:0 5px}
    .cd-table th{position:sticky;top:0;z-index:5;background:#0a1d15;font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#6fd0a5;text-align:left;padding:8px 10px;border-bottom:1px solid rgba(111,208,165,.25)}
    .cd-table td{background:rgba(13,32,24,.6);border-top:1px solid rgba(111,208,165,.12);border-bottom:1px solid rgba(111,208,165,.12);padding:8px 10px;font-size:13px;color:#eef7f2;vertical-align:middle}
    .cd-table td:first-child{border-left:1px solid rgba(111,208,165,.12);border-radius:10px 0 0 10px}
    .cd-table td:last-child{border-right:1px solid rgba(111,208,165,.12);border-radius:0 10px 10px 0}
    .cd-table td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
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
    .cd-rel-table{width:100%;border-collapse:separate;border-spacing:0 6px;margin-top:4px}
    .cd-rel-table th{text-align:left;padding:0 11px 4px;font-size:10.5px;color:#6fa589;text-transform:uppercase;letter-spacing:.04em;font-weight:750}
    .cd-rel-table th.num{text-align:right}
    .cd-rel-table td{background:rgba(13,32,24,.6);border-top:1px solid rgba(111,208,165,.12);border-bottom:1px solid rgba(111,208,165,.12);padding:9px 11px;font-size:13px;color:#eef7f2}
    .cd-rel-table td:first-child{border-left:1px solid rgba(111,208,165,.12);border-radius:10px 0 0 10px;font-weight:700}
    .cd-rel-table td:last-child{border-right:1px solid rgba(111,208,165,.12);border-radius:0 10px 10px 0;text-align:right;white-space:nowrap}
    .cd-pill{font-size:11px;font-weight:800;padding:3px 9px;border-radius:999px;cursor:pointer;border:1px solid transparent}
    .cd-pill.on{background:rgba(63,168,120,.18);color:#86efac;border-color:rgba(134,239,172,.4)}
    .cd-pill.off{background:rgba(148,163,184,.14);color:#cbd5e1}
    .cd-del{background:none;border:0;color:#f87171;font-size:13px;font-weight:800;cursor:pointer;margin-left:10px}
    .cd-msg{font-size:12.5px;color:#9fb7aa;margin-top:8px;line-height:1.5}
    .cd-empty{padding:16px;border:1px dashed rgba(111,208,165,.22);border-radius:12px;color:#8ba79a;font-size:13px;text-align:center}
    .cd-grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}
    @media (max-width:900px){.cd-grid2{grid-template-columns:1fr}}
    .cd-resumo-group{background:rgba(8,22,17,.72);border:1px solid rgba(111,208,165,.16);border-radius:14px;padding:12px 14px;margin-bottom:10px}
    .cd-resumo-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px}
    .cd-resumo-head h4{margin:0;font-size:14.5px;color:#f8fafc}
    .cd-resumo-stats{display:flex;gap:14px;font-size:12px;color:#9fb7aa}
    .cd-resumo-stats b{color:#6fd0a5}
    .cd-resumo-rows{display:flex;flex-direction:column;gap:5px}
    .cd-resumo-row{display:grid;grid-template-columns:78px 1fr auto auto auto;gap:10px;align-items:center;padding:7px 9px;background:rgba(13,32,24,.55);border:1px solid rgba(111,208,165,.1);border-radius:9px;font-size:12.5px}
    @media (max-width:760px){.cd-resumo-row{grid-template-columns:1fr 1fr;grid-template-areas:"data tipo" "trajeto trajeto" "km valor"}}
    .cd-resumo-row .rr-data{white-space:nowrap;color:#cbd5e1;font-weight:700}
    .cd-resumo-row .rr-trajeto{color:#9fb7aa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .cd-resumo-row .rr-km{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
    .cd-resumo-row .rr-valor{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:800;color:#fde68a}
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

function renderKpis() {
  const box = elRoot.querySelector('#cdKpis');
  if (!box) return;
  const rows = deslocsFiltrados();
  const kmTotal = rows.reduce((s, d) => s + Number(d.km || 0), 0);
  const reemb = rows.filter((d) => norm(d.tipo_deslocamento).includes('REEMBOLSO'));
  const valorReemb = reemb.reduce((s, d) => s + valorLinha(d), 0);
  const colabs = new Set(rows.map((d) => d.colaborador_id || d.nome_colaborador)).size;
  const naRelacao = lista.filter((l) => l.ativo).length;
  box.innerHTML = `
    <div class="cd-kpi"><small>Registros no período</small><b>${rows.length}</b><span>${colabs} colaborador(es)</span></div>
    <div class="cd-kpi"><small>Km total</small><b>${numKm(kmTotal)} km</b><span>todos os tipos</span></div>
    <div class="cd-kpi"><small>Reembolso km</small><b>${reemb.length}</b><span>deslocamentos a reembolsar</span></div>
    <div class="cd-kpi"><small>Valor a reembolsar</small><b>${moeda(valorReemb)}</b><span>tarifa por colaborador</span></div>
    <div class="cd-kpi"><small>Veículo próprio</small><b>${naRelacao}</b><span>ativos na configuração</span></div>
  `;
}

/* ========================== ABA 1 · CONFERÊNCIA DE KM ========================== */

function deslocsFiltrados() {
  const busca = norm(filtroBusca);
  return deslocs.filter((d) => {
    if (filtroTipo !== 'TODOS' && norm(d.tipo_deslocamento) !== norm(filtroTipo)) return false;
    if (busca && !norm(d.nome_colaborador).includes(busca) && !norm(d.placa_veiculo).includes(busca)) return false;
    return true;
  });
}

function renderTabelaKm() {
  const box = elRoot.querySelector('#cdKmTabela');
  if (!box) return;
  const rows = deslocsFiltrados();
  if (!rows.length) {
    box.innerHTML = '<div class="cd-empty">Nenhum deslocamento sincronizado para o período/filtros selecionados. Os dados chegam aqui pela Etapa de Deslocamento da Programação (sincronização GRM).</div>';
    return;
  }
  box.innerHTML = `
    <div class="cd-table-wrap">
      <table class="cd-table">
        <thead>
          <tr>
            <th>Data</th><th>Colaborador</th><th>Tipo</th><th>Placa</th><th>Trajeto</th>
            <th style="text-align:right">Km</th><th style="text-align:right">Valor (R$)</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((d) => {
            const val = valorLinha(d);
            const trajeto = [d.origem, d.destino].filter(Boolean).join(' → ') || '—';
            return `
              <tr data-id="${esc(d.id)}">
                <td style="white-space:nowrap">${dataBr(d.data_referencia)}</td>
                <td>${esc(d.nome_colaborador || d.colaborador_id)}${d.observacao ? `<div class="cd-sub">${esc(d.observacao)}</div>` : ''}</td>
                <td><span class="cd-badge ${tipoClasse(d.tipo_deslocamento)}">${esc(d.tipo_deslocamento || '—')}</span></td>
                <td>${esc(d.placa_veiculo || '—')}</td>
                <td>${esc(trajeto)}</td>
                <td class="num"><input class="cd-km-input" data-km type="number" min="0" step="0.1" value="${Number(d.km || 0)}" /></td>
                <td class="num"><span class="cd-valor ${val > 0 ? '' : 'zero'}" data-valor>${moeda(val)}</span></td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div class="cd-msg">Edite o km diretamente na tabela e pressione Enter (ou clique fora do campo) para salvar. Para deslocamentos do tipo <b>REEMBOLSO KM</b>, o valor é recalculado automaticamente pela tarifa configurada para aquele colaborador (aba Configuração).</div>
  `;
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
  renderKpis();
}

function wireAbaKm() {
  const de = elRoot.querySelector('#cdDe');
  const ate = elRoot.querySelector('#cdAte');
  const tipo = elRoot.querySelector('#cdTipo');
  const busca = elRoot.querySelector('#cdBusca');
  const aplicar = elRoot.querySelector('#cdAplicar');

  const recarregar = async () => {
    kmDe = de.value; kmAte = ate.value;
    aplicar.disabled = true; aplicar.textContent = 'Carregando...';
    await loadDeslocs();
    aplicar.disabled = false; aplicar.textContent = 'Aplicar período';
    renderKpis(); renderTabelaKm();
  };
  aplicar.addEventListener('click', recarregar);
  de.addEventListener('change', recarregar);
  ate.addEventListener('change', recarregar);

  tipo.addEventListener('change', () => { filtroTipo = tipo.value; renderKpis(); renderTabelaKm(); });
  busca.addEventListener('input', () => { filtroBusca = busca.value; renderKpis(); renderTabelaKm(); });

  const tabela = elRoot.querySelector('#cdKmTabela');
  tabela.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-km]')) { e.preventDefault(); e.target.blur(); }
  });
  tabela.addEventListener('focusout', (e) => {
    if (!e.target.matches('[data-km]')) return;
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const d = deslocs.find((x) => String(x.id) === String(tr.dataset.id));
    if (d && Number(e.target.value) === Number(d.km || 0)) return; // sem mudança
    salvarKm(tr.dataset.id, e.target.value, e.target, tr);
  });
}

/* ========================== ABA 2 · RESUMO ========================== */

function resumoAgrupado() {
  const busca = norm(resumoBusca);
  const porColab = new Map(); // chave -> { nome, itens: [] }
  for (const d of deslocs) {
    const nome = d.nome_colaborador || d.colaborador_id || 'Sem nome';
    if (busca && !norm(nome).includes(busca)) continue;
    const chave = d.colaborador_id || nome;
    if (!porColab.has(chave)) porColab.set(chave, { nome, itens: [] });
    porColab.get(chave).itens.push(d);
  }
  const grupos = [...porColab.values()];
  grupos.forEach((g) => g.itens.sort((a, b) => String(b.data_referencia).localeCompare(String(a.data_referencia))));
  grupos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return grupos;
}

function renderResumo() {
  const box = elRoot.querySelector('#cdResumoLista');
  if (!box) return;
  const grupos = resumoAgrupado();
  if (!grupos.length) {
    box.innerHTML = '<div class="cd-empty">Nenhum deslocamento sincronizado para o período/busca selecionados.</div>';
    return;
  }
  box.innerHTML = grupos.map((g) => {
    const kmTotal = g.itens.reduce((s, d) => s + Number(d.km || 0), 0);
    const valorTotal = g.itens.reduce((s, d) => s + valorLinha(d), 0);
    return `
      <div class="cd-resumo-group">
        <div class="cd-resumo-head">
          <h4>${esc(g.nome)}</h4>
          <div class="cd-resumo-stats">
            <span><b>${g.itens.length}</b> data(s)</span>
            <span><b>${numKm(kmTotal)}</b> km</span>
            <span><b>${moeda(valorTotal)}</b></span>
          </div>
        </div>
        <div class="cd-resumo-rows">
          ${g.itens.map((d) => {
            const val = valorLinha(d);
            const trajeto = [d.origem, d.destino].filter(Boolean).join(' → ') || '—';
            return `
              <div class="cd-resumo-row">
                <span class="rr-data">${dataBr(d.data_referencia)}</span>
                <span class="rr-trajeto" title="${esc(trajeto)}">${esc(trajeto)}${d.placa_veiculo ? ` · ${esc(d.placa_veiculo)}` : ''}</span>
                <span class="cd-badge ${tipoClasse(d.tipo_deslocamento)}">${esc(d.tipo_deslocamento || '—')}</span>
                <span class="rr-km">${numKm(d.km)} km</span>
                <span class="rr-valor">${moeda(val)}</span>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }).join('');
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
    renderKpis(); renderResumo();
  };
  aplicar.addEventListener('click', recarregar);
  de.addEventListener('change', recarregar);
  ate.addEventListener('change', recarregar);

  busca.addEventListener('input', () => { resumoBusca = busca.value; renderResumo(); });
}

/* ========================== ABA 3 · CONFIGURAÇÃO ========================== */

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
// do filtro de período selecionado nas abas Conferência de km / Resumo.
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
  if (!lista.length) { box.innerHTML = '<div class="cd-empty">Nenhum colaborador cadastrado ainda. Adicione ao lado.</div>'; return; }
  box.innerHTML = `<table class="cd-rel-table"><thead><tr><th>Colaborador</th><th>Estimativa mensal</th><th class="num">Tarifa R$/km</th><th>Status</th><th></th></tr></thead><tbody>${lista.map((l) => {
    const estimativa = estimativaPorColaborador.get(l.colaborador_id);
    return `
    <tr data-id="${esc(l.id)}">
      <td>${esc(l.nome || l.colaborador_id)}</td>
      <td>${estimativa != null ? `${moeda(estimativa)}/mês` : '—'}</td>
      <td class="num"><input class="cd-tarifa-input" data-tarifa type="number" min="0" step="0.01" value="${Number(l.tarifa_km || DEFAULT_TARIFA)}" /></td>
      <td><span class="cd-pill ${l.ativo ? 'on' : 'off'}" data-toggle>${l.ativo ? 'Ativo' : 'Inativo'}</span></td>
      <td><button class="cd-del" data-del>remover</button></td>
    </tr>`;
  }).join('')}</tbody></table>`;
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
  renderKpis();
  if (msgEl) {
    msgEl.innerHTML = `Adicionados: <b style="color:#86efac">${unicos.length}</b>.` +
      (naoAchados.length ? ` Não encontrados (confira o nome): ${naoAchados.map(esc).join(', ')}` : '');
  }
}

function wireSearch() {
  const input = elRoot.querySelector('#cdSearch');
  const dd = elRoot.querySelector('#cdDropdown');
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
    if (!it) return;
    dd.hidden = true; input.value = '';
    try {
      await addEntry(it.dataset.chave, it.dataset.nome);
      await loadLista();
      renderLista();
      renderKpis();
    } catch (err) { alert(err.message || 'Não foi possível adicionar.'); }
  });
}

function wireLista() {
  const box = elRoot.querySelector('#cdLista');
  if (!box) return;
  box.addEventListener('click', async (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const id = tr.dataset.id;
    if (e.target.closest('[data-del]')) {
      if (!confirm('Remover este colaborador da configuração?')) return;
      const { error } = await supabase.from('programacao_veiculo_proprio').delete().eq('id', id);
      if (error) { alert(error.message); return; }
      await loadLista(); renderLista(); renderKpis();
    } else if (e.target.closest('[data-toggle]')) {
      const atual = lista.find((l) => String(l.id) === String(id));
      const { error } = await supabase.from('programacao_veiculo_proprio').update({ ativo: !atual?.ativo, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) { alert(error.message); return; }
      await loadLista(); renderLista(); renderKpis();
    }
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-tarifa]')) { e.preventDefault(); e.target.blur(); }
  });
  box.addEventListener('focusout', (e) => {
    if (!e.target.matches('[data-tarifa]')) return;
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const l = lista.find((x) => String(x.id) === String(tr.dataset.id));
    if (l && Number(e.target.value) === Number(l.tarifa_km || DEFAULT_TARIFA)) return; // sem mudança
    salvarTarifaColaborador(tr.dataset.id, e.target.value, e.target);
  });
}

/* ========================== RENDER GERAL ========================== */

function htmlAbaKm() {
  return `
    <div class="cd-card">
      <div class="cd-filtros">
        <div>
          <label class="cd-lbl">De</label>
          <input class="cd-input" id="cdDe" type="date" value="${esc(kmDe)}" />
        </div>
        <div>
          <label class="cd-lbl">Até</label>
          <input class="cd-input" id="cdAte" type="date" value="${esc(kmAte)}" />
        </div>
        <div>
          <label class="cd-lbl">Tipo de deslocamento</label>
          <select class="cd-select" id="cdTipo">
            <option value="TODOS">Todos os tipos</option>
            ${TIPOS.map((t) => `<option value="${esc(t)}" ${filtroTipo === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="cd-lbl">Buscar colaborador / placa</label>
          <input class="cd-input" id="cdBusca" type="text" placeholder="Nome ou placa..." value="${esc(filtroBusca)}" />
        </div>
      </div>
      <div class="cd-row-actions">
        <button class="cd-btn ghost" id="cdAplicar" type="button">Aplicar período</button>
        <span class="cd-sub">Os deslocamentos são gravados pela Programação (sincronização GRM) — aqui você confere, ajusta o km e apura o valor de reembolso.</span>
      </div>
    </div>
    <div id="cdKmTabela"><div class="cd-empty">Carregando deslocamentos...</div></div>
  `;
}

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
        <span class="cd-sub">Todos os deslocamentos do período, agrupados por colaborador, com cada data conforme lançado na Programação.</span>
      </div>
    </div>
    <div id="cdResumoLista"><div class="cd-empty">Carregando resumo...</div></div>
  `;
}

function htmlAbaConfig() {
  return `
    <div class="cd-grid2">
      <div class="cd-card">
        <label class="cd-lbl">Adicionar colaborador</label>
        <div class="cd-search" id="cdSearchWrap">
          <input class="cd-input" id="cdSearch" type="text" placeholder="Buscar pelo nome..." autocomplete="off" spellcheck="false" />
          <div class="cd-dd" id="cdDropdown" hidden></div>
        </div>
        <label class="cd-lbl" style="margin-top:14px">Ou colar lista de nomes (um por linha)</label>
        <textarea class="cd-area" id="cdBulk" placeholder="João da Silva&#10;Maria Souza&#10;..."></textarea>
        <div class="cd-row-actions">
          <button class="cd-btn" id="cdBulkBtn" type="button">Adicionar lista</button>
        </div>
        <div class="cd-msg" id="cdBulkMsg"></div>
        <div class="cd-msg">Quem está cadastrado aqui, quando <b>não pega carona</b> na programação, vai de <b>carro próprio</b> (reembolso pela tarifa R$/km dele). Quem não está vai de <b>Uber/Táxi</b>. Usado pela sugestão de caronas na Etapa 1 da Programação.</div>
      </div>
      <div class="cd-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <label class="cd-lbl" style="margin:0">Colaboradores cadastrados</label>
          <span class="cd-count" id="cdCount"></span>
        </div>
        <div id="cdLista" style="max-height:56vh;overflow:auto"><div class="cd-empty">Carregando...</div></div>
        <div class="cd-msg">A tarifa R$/km não é única para todos — edite o valor de cada colaborador diretamente na tabela e pressione Enter (ou clique fora do campo) para salvar.</div>
      </div>
    </div>
  `;
}

function renderAba() {
  const body = elRoot.querySelector('#cdBody');
  elRoot.querySelectorAll('.cd-tab').forEach((b) => b.classList.toggle('on', b.dataset.aba === abaAtiva));
  if (abaAtiva === 'km') {
    body.innerHTML = htmlAbaKm();
    wireAbaKm();
    renderKpis();
    renderTabelaKm();
  } else if (abaAtiva === 'resumo') {
    body.innerHTML = htmlAbaResumo();
    wireAbaResumo();
    renderKpis();
    renderResumo();
  } else {
    body.innerHTML = htmlAbaConfig();
    wireSearch();
    wireLista();
    renderLista();
    renderKpis();
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
      <div class="cd-topo">
        <div>
          <h3>Conferência · Deslocamento</h3>
          <p>Km rodado por colaborador conforme a sincronização da Programação (GRM), apuração do reembolso por km e configuração de quem usa veículo próprio.</p>
        </div>
        <div class="cd-tabs">
          <button class="cd-tab on" data-aba="km" type="button">Conferência de km</button>
          <button class="cd-tab" data-aba="resumo" type="button">Resumo</button>
          <button class="cd-tab" data-aba="config" type="button">Configuração</button>
        </div>
      </div>
      <div class="cd-kpis" id="cdKpis"></div>
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
