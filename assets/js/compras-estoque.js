import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getColaboradores } from './colaboradoresCache.js';
import { mensagemFalhaSalvar } from './rls-sessao-expirada.js';

const XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';
const ABAS = [
  { id: 'inventario', label: 'Inventário' },
  { id: 'entradas', label: 'Entradas' },
  { id: 'saidas', label: 'Saídas' },
  { id: 'alertas', label: 'Alertas' },
  { id: 'historico', label: 'Histórico' },
  { id: 'materiais', label: 'Cadastro' }
];
const CATEGORIAS = ['Uniformes', 'Escritório', 'Brindes', 'Equipamentos', 'Classificação', 'EPI', 'Outros'];
const UNIDADES = ['UN', 'CX', 'PCT', 'KG', 'M', 'RL'];
const LOCAIS = ['Almoxarifado', 'Matriz', 'Sala Técnica', 'Escritório', 'Veículo', 'Operação'];
const MOTIVOS = ['Entrega ao colaborador', 'Reposição', 'Uso operacional', 'Perda', 'Descarte', 'Transferência', 'Manutenção', 'Inventário'];
const DESTINOS = ['Colaborador', 'Coordenação', 'Supervisão', 'Regional', 'Veículo', 'Escritório', 'Operação'];
const TIPOS_MOV = { entrada: 'Entrada', saida: 'Saída', ajuste: 'Ajuste', transferencia: 'Transferência' };

const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const pad = (n) => String(n).padStart(2, '0');
// Data local (Brasília): toISOString() devolve UTC e, depois das 21h, já cairia no dia seguinte.
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const brDate = (v) => { const [y, m, d] = String(v || '').slice(0, 10).split('-'); return y && m && d ? `${d}/${m}/${y}` : '-'; };
const qtd = (v) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const r2 = (v) => Math.round(Number(v || 0) * 100) / 100;
const usuario = () => ctxAtual?.user || {};
const userName = () => usuario().name || usuario().email || 'Usuário logado';

const state = {
  materiais: [],      // cadastros ativos, como estão no banco
  grupos: [],         // cadastros iguais somados (é o que a tela mostra)
  movs: [],
  colaboradores: [],
  tab: 'inventario',
  modoSaida: 'simples',
  aviso: null,
  filtroInv: { busca: '', categoria: '', status: '' },
  filtroHist: { busca: '', tipo: '' },
  lote: null
};
let ctxAtual = null;
let raiz = null;
let colabPorNome = new Map();

async function safe(fn, fallback = []) {
  try {
    const { data, error } = await fn();
    if (error) throw error;
    return data ?? fallback;
  } catch (e) {
    console.warn('[compras-estoque]', e);
    return fallback;
  }
}

function statusMaterial(m) {
  const atual = Number(m.estoque_atual || 0);
  const min = Number(m.estoque_minimo || 0);
  if (atual <= 0) return 'critico';
  if (min > 0 && atual <= min) return 'baixo';
  return 'normal';
}
const statusLabel = (s) => (s === 'critico' ? 'Crítico' : (s === 'baixo' ? 'Baixo' : 'Normal'));
const materialLabel = (m) => `${m.nome || ''}${m.tamanho ? ` (${m.tamanho})` : ''}`;

// ---------- dados ----------

// Mesmo item cadastrado mais de uma vez (nome + categoria + tamanho + unidade + local)
// aparece como um só, com o saldo somado. As baixas saem dos cadastros reais (repartirBaixa).
const chaveMaterial = (m) => [norm(m.nome), norm(m.categoria), norm(m.tamanho), norm(m.unidade || 'UN'), norm(m.local_armazenamento)].join('|');

function agruparMateriais(lista) {
  const grupos = new Map();
  for (const m of lista) {
    const chave = chaveMaterial(m);
    const g = grupos.get(chave);
    if (!g) {
      grupos.set(chave, { ...m, registros: [m] });
      continue;
    }
    g.registros.push(m);
    g.estoque_atual = r2(Number(g.estoque_atual || 0) + Number(m.estoque_atual || 0));
    g.estoque_minimo = Math.max(Number(g.estoque_minimo || 0), Number(m.estoque_minimo || 0));
    g.estoque_maximo = Math.max(Number(g.estoque_maximo || 0), Number(m.estoque_maximo || 0));
    g.codigo_interno = g.codigo_interno || m.codigo_interno;
  }
  return [...grupos.values()].sort((a, b) => materialLabel(a).localeCompare(materialLabel(b), 'pt-BR'));
}

function definirMateriais(lista) {
  state.materiais = (lista || []).filter((m) => m.ativo !== false);
  state.grupos = agruparMateriais(state.materiais);
}

function definirColaboradores(lista) {
  const vistos = new Set();
  state.colaboradores = (lista || []).filter((c) => {
    const chave = norm(c.cpf || c.id || c.nome);
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
  colabPorNome = new Map();
  for (const c of state.colaboradores) if (!colabPorNome.has(norm(c.nome))) colabPorNome.set(norm(c.nome), c);
}

async function loadBase() {
  const [materiais, movs, colabs] = await Promise.all([
    safe(() => supabase.from('compras_estoque_materiais').select('*').order('nome', { ascending: true }).limit(5000)),
    safe(() => supabase.from('compras_estoque_movimentacoes').select('*, compras_estoque_materiais(nome,categoria,tamanho,unidade)').order('created_at', { ascending: false }).limit(300)),
    getColaboradores({ somenteAtivos: true }).catch(() => [])
  ]);
  definirMateriais(materiais);
  state.movs = movs || [];
  definirColaboradores(colabs);
}

// Saldo fresco do banco logo antes de gravar, para não baixar em cima de uma tela desatualizada.
async function atualizarSaldos() {
  const { data, error } = await supabase.from('compras_estoque_materiais').select('*').order('nome', { ascending: true }).limit(5000);
  if (error) throw error;
  definirMateriais(data);
}

const grupoPorId = (id) => state.grupos.find((g) => g.id === id);
const saldosPorRegistro = () => new Map(state.materiais.map((m) => [m.id, r2(m.estoque_atual)]));
const saldoGrupo = (grupo, saldos) => r2(grupo.registros.reduce((s, r) => s + Number(saldos.get(r.id) || 0), 0));

// Reparte uma baixa entre os cadastros do grupo (maior saldo primeiro). Não altera `saldos`.
function repartirBaixa(grupo, quantidade, saldos) {
  let falta = r2(quantidade);
  const partes = [];
  const ordem = [...grupo.registros].sort((a, b) => (saldos.get(b.id) || 0) - (saldos.get(a.id) || 0));
  for (const registro of ordem) {
    if (falta <= 0) break;
    const usa = Math.min(Math.max(0, saldos.get(registro.id) || 0), falta);
    if (usa > 0) {
      partes.push({ registro, quantidade: r2(usa) });
      falta = r2(falta - usa);
    }
  }
  return { partes, falta };
}

// Devolve os saldos já alterados e só então apaga as movimentações: se algum saldo não voltar,
// as movimentações ficam no Histórico explicando a diferença.
async function desfazerMovimentos(inseridas, feitos) {
  try {
    for (const f of feitos) {
      const { error } = await supabase.from('compras_estoque_materiais').update({ estoque_atual: f.antes, updated_at: new Date().toISOString() }).eq('id', f.id);
      if (error) throw error;
    }
    const { error } = await supabase.from('compras_estoque_movimentacoes').delete().in('id', (inseridas || []).map((r) => r.id));
    if (error) throw error;
    return true;
  } catch (e) {
    console.warn('[compras-estoque] falha ao desfazer', e);
    return false;
  }
}

// Grava as movimentações e os novos saldos; se um saldo falhar, desfaz o que já tinha gravado.
async function gravarMovimentos(movs, alteracoes) {
  const { data: inseridas, error } = await supabase.from('compras_estoque_movimentacoes').insert(movs).select('id');
  if (error) throw error;
  const feitos = [];
  for (const [id, { antes, depois }] of alteracoes) {
    const { error: e } = await supabase.from('compras_estoque_materiais').update({ estoque_atual: depois, updated_at: new Date().toISOString() }).eq('id', id);
    if (e) {
      if (!(await desfazerMovimentos(inseridas, feitos))) throw new Error('O saldo não foi atualizado por completo. Confira o Inventário e o Histórico antes de repetir.');
      throw e;
    }
    feitos.push({ id, antes });
  }
}

// ---------- saída (simples e em lote) ----------

const novaLinha = (extra = {}) => ({ colab: '', materialId: '', qtd: 1, ...extra });
const novoLote = (base = {}) => ({ data: hoje(), destino: 'Colaborador', motivo: MOTIVOS[0], obs: '', mostrarErros: false, linhas: [novaLinha()], ...base });

// Valida as linhas e monta as movimentações + saldos novos, sem gravar nada.
function planejarSaida(linhas, { cab, exigirColab }) {
  const saldos = saldosPorRegistro();
  const antes = new Map(saldos);
  const movs = [];
  const erros = new Map();
  const avisos = new Map();
  const vistos = new Set();
  let totalItens = 0;
  let saidas = 0;
  linhas.forEach((l, i) => {
    const falha = (tipo, msg) => erros.set(i, { tipo, msg });
    const nome = String(l.colab || '').trim();
    const col = nome ? colabPorNome.get(norm(nome)) : null;
    if (nome && !col) avisos.set(i, 'Nome fora do cadastro de colaboradores — será gravado como digitado.');
    if (exigirColab && !nome) return falha('campo', 'Informe o colaborador.');
    const grupo = grupoPorId(l.materialId);
    if (!grupo) return falha('campo', 'Selecione o material.');
    const quantidade = r2(l.qtd);
    if (!(quantidade > 0)) return falha('campo', 'Informe uma quantidade maior que zero.');
    const chave = `${norm(nome)}|${grupo.id}`;
    if (nome && vistos.has(chave)) return falha('duplicada', 'Linha repetida (mesmo colaborador e material). Some as quantidades numa linha só.');
    vistos.add(chave);
    const { partes, falta } = repartirBaixa(grupo, quantidade, saldos);
    if (falta > 0) return falha('saldo', `Saldo insuficiente: disponível ${qtd(saldoGrupo(grupo, saldos))} ${grupo.unidade || 'UN'}.`);
    for (const { registro, quantidade: q } of partes) {
      saldos.set(registro.id, r2(saldos.get(registro.id) - q));
      movs.push({
        material_id: registro.id,
        tipo_movimentacao: 'saida',
        quantidade: q,
        data_movimentacao: cab.data || hoje(),
        destino: cab.destino,
        colaborador_id: col?.id || null,
        colaborador_nome: nome || null,
        coordenacao: col?.coordenacao || null,
        supervisao: col?.supervisao || null,
        motivo: cab.motivo,
        observacao: cab.observacao || null,
        usuario_id: usuario().id || null,
        usuario_nome: userName()
      });
    }
    totalItens = r2(totalItens + quantidade);
    saidas += 1;
  });
  const alteracoes = new Map();
  for (const [id, depois] of saldos) if (depois !== antes.get(id)) alteracoes.set(id, { antes: antes.get(id), depois });
  return { movs, alteracoes, erros, avisos, totalItens, saidas };
}

// ---------- tela ----------

function estilos() {
  return `<style>
.stk-tabs{display:flex;gap:2px;overflow-x:auto;border-bottom:1px solid var(--line);margin:0 0 16px}
.stk-tabs .tab-btn{flex:0 0 auto;white-space:nowrap;cursor:pointer}
.stk-badge{display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 5px;margin-left:6px;border-radius:999px;background:rgba(245,158,11,.2);color:#fde68a;font-size:11px;font-weight:900}
.stk-dica{margin:0 0 14px;color:var(--muted);font-size:13px}
.stk-aviso{margin:0 0 14px;padding:10px 14px;border-radius:12px;font-weight:700;font-size:14px}
.stk-aviso.ok{background:rgba(22,101,52,.22);border:1px solid rgba(74,222,128,.3);color:#bbf7d0}
.stk-aviso.err{background:rgba(220,38,38,.14);border:1px solid rgba(220,38,38,.35);color:#fecaca}
.stk input:not([type=checkbox]),.stk select,.stk textarea{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;min-height:44px;color-scheme:dark;font:inherit}
.stk input:focus,.stk select:focus,.stk textarea:focus{outline:none;border-color:rgba(111,208,165,.45);box-shadow:0 0 0 3px rgba(111,208,165,.10)}
.stk-bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
.stk-bar input,.stk-bar select{width:auto}
.stk-bar .stk-grow{flex:1 1 240px;min-width:0}
.stk-bar-fim{margin-left:auto;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.stk-total{color:var(--muted);font-size:13px}
.stk-seg{display:inline-flex;border:1px solid var(--line-2,rgba(111,208,165,.22));border-radius:12px;overflow:hidden;margin-bottom:12px}
.stk-seg button{border:0;background:transparent;color:var(--muted);padding:10px 16px;font-weight:800;cursor:pointer}
.stk-seg button.active{background:rgba(34,197,94,.16);color:#bbf7d0}
.stk-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.stk-field{display:flex;flex-direction:column;gap:6px;min-width:0}
.stk-field label{color:#d8f8e7;font-weight:800;font-size:13px}
.stk-field-full{grid-column:1/-1}
.stk-field-2{grid-column:span 2}
.stk-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.stk-feedback{font-weight:800}
.stk-feedback.err{color:#fecaca}
.stk-feedback.ok{color:#bbf7d0}
.stk-contagem{border:1px solid var(--line);border-radius:14px;padding:0 14px;margin-bottom:12px;background:rgba(13,13,24,.4)}
.stk-contagem>summary{cursor:pointer;padding:12px 0;font-weight:800;color:#d8f8e7}
.stk-contagem[open]>summary{border-bottom:1px solid var(--line);margin-bottom:14px}
.stk-contagem form{padding-bottom:14px}
.stk-dif{font-weight:900}
.stk-table-wrap{overflow:auto;max-height:68vh;border:1px solid var(--line);border-radius:16px;background:rgba(3,20,13,.28)}
.stk-table{width:100%;border-collapse:collapse;min-width:820px}
.stk-table th,.stk-table td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
.stk-table th{position:sticky;top:0;z-index:1;background:#0b1a14;font-size:12px;text-transform:uppercase;color:var(--muted)}
.stk-table tbody tr:hover{background:rgba(111,208,165,.06)}
.stk-table .num{text-align:right;white-space:nowrap}
.stk-table .btn{padding:6px 12px;border-radius:10px;font-size:13px;white-space:nowrap}
.stk-pill{display:inline-flex;padding:5px 9px;border-radius:999px;border:1px solid rgba(148,163,184,.25);font-weight:800;font-size:12px}
.stk-pill.normal{color:#bbf7d0;background:rgba(22,101,52,.18)}
.stk-pill.baixo{color:#fde68a;background:rgba(245,158,11,.12)}
.stk-pill.critico{color:#fecaca;background:rgba(220,38,38,.14)}
.stk-pill.entrada{color:#bbf7d0;background:rgba(22,101,52,.18)}
.stk-pill.saida{color:#fed7aa;background:rgba(234,88,12,.14)}
.stk-pill.ajuste,.stk-pill.transferencia{color:#bfdbfe;background:rgba(59,130,246,.14)}
.stk-merged{display:inline-flex;margin-top:4px;padding:2px 7px;border-radius:999px;background:rgba(111,208,165,.12);color:#bbf7d0;font-size:11px;font-weight:800}
.stk-empty{text-align:center;color:var(--muted)}
.stk-lote-cab,.stk-linha{display:grid;grid-template-columns:minmax(180px,1.2fr) minmax(220px,1.7fr) 110px 40px;gap:8px;align-items:center}
.stk-lote-cab{padding:0 2px 6px;color:var(--muted);font-size:12px;font-weight:800;text-transform:uppercase}
.stk-linha{padding:8px;border:1px solid var(--line);border-radius:14px;margin-bottom:8px;background:rgba(13,13,24,.4)}
.stk-linha.erro{border-color:rgba(220,38,38,.5);background:rgba(220,38,38,.07)}
.stk-cel{min-width:0}
.stk-rm{width:40px;height:40px;border:1px solid rgba(148,163,184,.24);border-radius:10px;background:transparent;color:var(--muted);font-size:18px;cursor:pointer}
.stk-rm:hover:not(:disabled){color:#fecaca;border-color:rgba(220,38,38,.5)}
.stk-rm:disabled{opacity:.35;cursor:not-allowed}
.stk-msg{grid-column:1/-1;font-size:12.5px;font-weight:700;color:#fecaca}
.stk-msg.warn{color:#fde68a}
.stk-msg:empty{display:none}
.stk-lote-rodape{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:14px;padding-top:14px;border-top:1px solid var(--line)}
.stk-lote-rodape .stk-resumo{color:var(--muted);font-size:13px;font-weight:700;margin-right:auto}
@media(max-width:1100px){.stk-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:760px){
  .stk-grid{grid-template-columns:1fr}.stk-grid.stk-grid-cab{grid-template-columns:1fr 1fr}.stk-field-2{grid-column:auto}
  .stk-bar-fim{margin-left:0;width:100%}.stk-bar input,.stk-bar select{width:100%}
  .stk-lote-cab{display:none}
  .stk-linha{grid-template-columns:1fr 40px}
  .stk-linha .stk-cel:nth-child(1),.stk-linha .stk-cel:nth-child(2){grid-column:1/-1}
}
</style>`;
}

function avisoHtml() {
  return state.aviso ? `<div class="stk-aviso ${state.aviso.tipo}" role="status">${esc(state.aviso.texto)}</div>` : '';
}

function render() {
  const alertas = state.grupos.filter((g) => statusMaterial(g) !== 'normal').length;
  raiz.innerHTML = `${estilos()}
  <section class="card stk">
    <div class="stk-tabs" role="tablist">${ABAS.map((a) => `<button type="button" class="tab-btn ${state.tab === a.id ? 'active' : ''}" role="tab" aria-selected="${state.tab === a.id}" data-tab="${a.id}">${a.label}${a.id === 'alertas' && alertas ? `<span class="stk-badge">${alertas}</span>` : ''}</button>`).join('')}</div>
    <div id="stkContent"></div>
  </section>`;
  raiz.querySelectorAll('[data-tab]').forEach((b) => {
    b.onclick = () => { state.tab = b.dataset.tab; state.aviso = null; render(); };
  });
  renderTab();
}

function renderTab() {
  const box = document.getElementById('stkContent');
  if (!box) return;
  ({ inventario: renderInventario, entradas: renderEntradas, saidas: renderSaidas, alertas: renderAlertas, historico: renderHistorico, materiais: renderCadastro }[state.tab] || renderInventario)(box);
}

async function recarregar() {
  await loadBase();
  render();
}

function materialOptions(selecionado = '') {
  return `<option value="">Selecione...</option>${state.grupos.map((g) => `<option value="${esc(g.id)}" ${g.id === selecionado ? 'selected' : ''}>${esc(materialLabel(g))} — ${qtd(g.estoque_atual)} ${esc(g.unidade || 'UN')}</option>`).join('')}`;
}
const datalistColabs = () => `<datalist id="stkColabs">${state.colaboradores.map((c) => `<option value="${esc(c.nome)}"></option>`).join('')}</datalist>`;
const field = (label, id, type, ph = '', req = false, extra = '') => `<div class="stk-field"><label for="${id}">${label}</label><input id="${id}" type="${type}" placeholder="${esc(ph)}" ${req ? 'required' : ''} ${extra}></div>`;
const selectField = (label, id, opts, atual = '') => `<div class="stk-field"><label for="${id}">${label}</label><select id="${id}">${opts.map((o) => `<option value="${esc(o)}" ${o === atual ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`;

function setFb(el, texto, tipo = '') {
  if (!el) return;
  el.textContent = texto;
  el.className = `stk-feedback ${tipo}`.trim();
}

// ---------- Inventário ----------

function inventarioFiltrado() {
  const { busca, categoria, status } = state.filtroInv;
  const q = norm(busca);
  return state.grupos.filter((g) => (!q || norm(`${g.nome} ${g.categoria} ${g.tamanho} ${g.codigo_interno}`).includes(q))
    && (!categoria || g.categoria === categoria)
    && (!status || statusMaterial(g) === status));
}

function tabelaInventario(rows) {
  return `<div class="stk-table-wrap"><table class="stk-table"><thead><tr><th>Material</th><th>Categoria</th><th>Local</th><th class="num">Atual</th><th class="num">Mínimo</th><th>Status</th><th></th></tr></thead><tbody>${rows.length ? rows.map((g) => {
    const s = statusMaterial(g);
    return `<tr><td><b>${esc(materialLabel(g))}</b><br><small class="muted">${esc(g.codigo_interno || 'Sem código')}</small>${g.registros.length > 1 ? `<br><span class="stk-merged">${g.registros.length} cadastros somados</span>` : ''}</td><td>${esc(g.categoria || '-')}</td><td>${esc(g.local_armazenamento || '-')}</td><td class="num">${qtd(g.estoque_atual)} ${esc(g.unidade || 'UN')}</td><td class="num">${qtd(g.estoque_minimo)} ${esc(g.unidade || 'UN')}</td><td><span class="stk-pill ${s}">${statusLabel(s)}</span></td><td><button type="button" class="btn btn-secondary btn-small" data-contar="${esc(g.id)}">Contar</button></td></tr>`;
  }).join('') : '<tr><td colspan="7" class="stk-empty">Nenhum material encontrado.</td></tr>'}</tbody></table></div>`;
}

function renderInventario(box) {
  const f = state.filtroInv;
  const categorias = [...new Set(state.grupos.map((g) => g.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  box.innerHTML = `${avisoHtml()}
  <div class="stk-bar">
    <input class="stk-grow" id="invBusca" type="search" placeholder="Buscar material, categoria ou código..." value="${esc(f.busca)}" aria-label="Buscar material">
    <select id="invCategoria" aria-label="Categoria"><option value="">Todas as categorias</option>${categorias.map((c) => `<option value="${esc(c)}" ${c === f.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <select id="invStatus" aria-label="Status"><option value="">Todos os status</option>${['critico', 'baixo', 'normal'].map((s) => `<option value="${s}" ${s === f.status ? 'selected' : ''}>${statusLabel(s)}</option>`).join('')}</select>
    <div class="stk-bar-fim">
      <span class="stk-total" id="invTotal"></span>
      <button type="button" class="btn btn-secondary" id="invNovo">+ Novo material</button>
      <button type="button" class="btn btn-primary" id="invXls">Baixar XLS</button>
    </div>
  </div>
  <details class="stk-contagem" id="invContagem">
    <summary>Registrar contagem física (ajustar saldo)</summary>
    <form id="stkInvForm" class="stk-grid">
      <div class="stk-field stk-field-2"><label for="invMaterial">Material</label><select id="invMaterial" required>${materialOptions()}</select></div>
      <div class="stk-field"><label for="invContado">Estoque contado</label><input id="invContado" type="number" step="0.01" min="0" required></div>
      <div class="stk-field"><label>Diferença para o sistema</label><div class="stk-dif" id="invDif" style="min-height:44px;display:flex;align-items:center">—</div></div>
      <div class="stk-field stk-field-full"><label for="invMotivo">Motivo do ajuste</label><textarea id="invMotivo" rows="2" required placeholder="Ex: inventário mensal, perda, divergência de lançamento..."></textarea></div>
      <div class="stk-actions stk-field-full"><button class="btn btn-primary" type="submit">Ajustar estoque</button><span id="invFb" class="stk-feedback"></span></div>
    </form>
  </details>
  <div id="invTabela"></div>`;

  const pintarTabela = () => {
    const rows = inventarioFiltrado();
    document.getElementById('invTabela').innerHTML = tabelaInventario(rows);
    document.getElementById('invTotal').textContent = rows.length === state.grupos.length ? `${rows.length} materiais` : `${rows.length} de ${state.grupos.length} materiais`;
  };
  pintarTabela();

  document.getElementById('invBusca').oninput = (e) => { f.busca = e.target.value; pintarTabela(); };
  document.getElementById('invCategoria').onchange = (e) => { f.categoria = e.target.value; pintarTabela(); };
  document.getElementById('invStatus').onchange = (e) => { f.status = e.target.value; pintarTabela(); };
  document.getElementById('invNovo').onclick = () => { state.tab = 'materiais'; state.aviso = null; render(); };
  document.getElementById('invXls').onclick = (e) => baixarXls(e.currentTarget);

  const contagem = document.getElementById('invContagem');
  const selMaterial = document.getElementById('invMaterial');
  const inContado = document.getElementById('invContado');
  const atualizarDif = () => {
    const g = grupoPorId(selMaterial.value);
    const el = document.getElementById('invDif');
    if (!g || inContado.value === '') { el.textContent = '—'; el.style.color = ''; return; }
    const dif = r2(Number(inContado.value) - Number(g.estoque_atual || 0));
    el.textContent = `${dif > 0 ? '+' : ''}${qtd(dif)} ${g.unidade || 'UN'} (sistema: ${qtd(g.estoque_atual)})`;
    el.style.color = dif === 0 ? '#bbf7d0' : '#fde68a';
  };
  selMaterial.onchange = atualizarDif;
  inContado.oninput = atualizarDif;
  document.getElementById('invTabela').onclick = (e) => {
    const btn = e.target.closest('[data-contar]');
    if (!btn) return;
    contagem.open = true;
    selMaterial.value = btn.dataset.contar;
    selMaterial.dispatchEvent(new Event('change', { bubbles: true }));
    contagem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    inContado.focus();
  };
  document.getElementById('stkInvForm').onsubmit = async (ev) => { ev.preventDefault(); await salvarContagem(); };
}

async function baixarXls(btn) {
  const rows = inventarioFiltrado();
  if (!rows.length) { state.aviso = { tipo: 'err', texto: 'Não há materiais para exportar com os filtros atuais.' }; renderTab(); return; }
  btn.disabled = true;
  const rotulo = btn.textContent;
  btn.textContent = 'Gerando...';
  try {
    const XLSX = await import(XLSX_URL);
    const cab = ['Código interno', 'Material', 'Tamanho/Detalhe', 'Categoria', 'Local', 'Unidade', 'Estoque atual', 'Estoque mínimo', 'Estoque máximo', 'Status', 'Contagem física', 'Observação'];
    const dados = rows.map((g) => [g.codigo_interno || '', g.nome || '', g.tamanho || '', g.categoria || '', g.local_armazenamento || '', g.unidade || 'UN', Number(g.estoque_atual || 0), Number(g.estoque_minimo || 0), Number(g.estoque_maximo || 0), statusLabel(statusMaterial(g)), '', '']);
    const ws = XLSX.utils.aoa_to_sheet([cab, ...dados]);
    ws['!cols'] = cab.map((c, i) => ({ wch: Math.min(48, Math.max(c.length, ...dados.map((r) => String(r[i]).length)) + 2) }));
    ws['!autofilter'] = { ref: ws['!ref'] };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventário');
    XLSX.writeFile(wb, `inventario_estoque_${hoje()}.xlsx`);
  } catch (e) {
    console.warn('[compras-estoque] xls', e);
    state.aviso = { tipo: 'err', texto: 'Não foi possível gerar o XLS. Verifique a conexão e tente de novo.' };
    renderTab();
    return;
  } finally {
    btn.disabled = false;
    btn.textContent = rotulo;
  }
}

async function salvarContagem() {
  const fb = document.getElementById('invFb');
  const motivo = document.getElementById('invMotivo').value.trim();
  const contado = r2(document.getElementById('invContado').value);
  const idMaterial = document.getElementById('invMaterial').value;
  if (!grupoPorId(idMaterial) || !motivo) { setFb(fb, 'Selecione o material e informe o motivo.', 'err'); return; }
  setFb(fb, 'Ajustando...');
  let inventarioId = null;
  try {
    await atualizarSaldos();
    const grupo = grupoPorId(idMaterial);
    const sistema = r2(grupo.estoque_atual);
    const dif = r2(contado - sistema);
    const { data: inv, error } = await supabase.from('compras_estoque_inventarios').insert({ material_id: grupo.id, estoque_sistema: sistema, estoque_contado: contado, diferenca: dif, motivo_ajuste: motivo, usuario_id: usuario().id || null, usuario_nome: userName() }).select('id').single();
    if (error) throw error;
    inventarioId = inv?.id;
    if (dif !== 0) {
      const saldos = saldosPorRegistro();
      const antes = new Map(saldos);
      let partes;
      if (dif > 0) {
        partes = [{ registro: grupo.registros[0], quantidade: dif }];
        saldos.set(partes[0].registro.id, r2(saldos.get(partes[0].registro.id) + dif));
      } else {
        const rep = repartirBaixa(grupo, -dif, saldos);
        partes = rep.partes;
        for (const p of partes) saldos.set(p.registro.id, r2(saldos.get(p.registro.id) - p.quantidade));
      }
      const alteracoes = new Map();
      for (const [id, depois] of saldos) if (depois !== antes.get(id)) alteracoes.set(id, { antes: antes.get(id), depois });
      const movs = partes.map((p) => ({ material_id: p.registro.id, tipo_movimentacao: 'ajuste', quantidade: p.quantidade, data_movimentacao: hoje(), motivo: 'Inventário', observacao: `${motivo} (sistema ${qtd(sistema)} → contado ${qtd(contado)})`, usuario_id: usuario().id || null, usuario_nome: userName() }));
      await gravarMovimentos(movs, alteracoes);
    }
    state.aviso = { tipo: 'ok', texto: dif === 0 ? `Contagem de ${materialLabel(grupo)} confere com o sistema.` : `Estoque de ${materialLabel(grupo)} ajustado: ${qtd(sistema)} → ${qtd(contado)}.` };
    await recarregar();
  } catch (e) {
    if (inventarioId) await supabase.from('compras_estoque_inventarios').delete().eq('id', inventarioId);
    setFb(fb, await mensagemFalhaSalvar(e, e?.message || 'Não foi possível ajustar o estoque.'), 'err');
  }
}

// ---------- Entradas ----------

function renderEntradas(box) {
  box.innerHTML = `${avisoHtml()}<p class="stk-dica">Compras, reposições e devoluções aumentam o saldo do material.</p>
  <form id="stkMovForm" class="stk-grid">
    <div class="stk-field stk-field-2"><label for="movMaterial">Material</label><select id="movMaterial" required>${materialOptions()}</select></div>
    ${field('Quantidade', 'movQtd', 'number', '', true, 'min="0.01" step="0.01"')}
    <div class="stk-field"><label for="movData">Data</label><input id="movData" type="date" value="${hoje()}" required></div>
    ${field('Fornecedor', 'movFornecedor', 'text', 'Nome do fornecedor')}
    ${field('Valor unitário', 'movValor', 'number', '', false, 'min="0" step="0.01"')}
    ${field('Nº NF', 'movNf', 'text', 'Opcional')}
    <div class="stk-field stk-field-full"><label for="movObs">Observação</label><textarea id="movObs" rows="2"></textarea></div>
    <div class="stk-actions stk-field-full"><button class="btn btn-primary" type="submit">Salvar entrada</button><span id="movFb" class="stk-feedback"></span></div>
  </form>`;
  document.getElementById('stkMovForm').onsubmit = async (ev) => { ev.preventDefault(); await salvarEntrada(); };
}

async function salvarEntrada() {
  const fb = document.getElementById('movFb');
  const quantidade = r2(document.getElementById('movQtd').value);
  const idMaterial = document.getElementById('movMaterial').value;
  if (!grupoPorId(idMaterial) || !(quantidade > 0)) { setFb(fb, 'Selecione material e quantidade válida.', 'err'); return; }
  setFb(fb, 'Salvando...');
  try {
    await atualizarSaldos();
    const grupo = grupoPorId(idMaterial);
    const registro = grupo.registros[0];
    const antes = r2(registro.estoque_atual);
    const mov = {
      material_id: registro.id,
      tipo_movimentacao: 'entrada',
      quantidade,
      data_movimentacao: document.getElementById('movData').value || hoje(),
      observacao: document.getElementById('movObs').value.trim() || null,
      fornecedor: document.getElementById('movFornecedor').value.trim() || null,
      valor_unitario: Number(document.getElementById('movValor').value || 0) || null,
      numero_nf: document.getElementById('movNf').value.trim() || null,
      usuario_id: usuario().id || null,
      usuario_nome: userName()
    };
    await gravarMovimentos([mov], new Map([[registro.id, { antes, depois: r2(antes + quantidade) }]]));
    state.aviso = { tipo: 'ok', texto: `Entrada registrada: ${qtd(quantidade)} ${grupo.unidade || 'UN'} de ${materialLabel(grupo)}.` };
    await recarregar();
  } catch (e) {
    setFb(fb, await mensagemFalhaSalvar(e, e?.message || 'Não foi possível salvar a entrada.'), 'err');
  }
}

// ---------- Saídas ----------

function renderSaidas(box) {
  const lote = state.modoSaida === 'lote';
  box.innerHTML = `${avisoHtml()}
  <div class="stk-seg" role="group" aria-label="Tipo de saída">
    <button type="button" data-modo="simples" class="${lote ? '' : 'active'}">Saída simples</button>
    <button type="button" data-modo="lote" class="${lote ? 'active' : ''}">Saída em lote</button>
  </div>
  <p class="stk-dica">${lote ? 'Várias saídas de uma vez: vários materiais para o mesmo colaborador, o mesmo material para vários colaboradores, ou os dois.' : 'Baixa de um material para um colaborador, veículo, setor ou uso operacional.'}</p>
  ${lote ? formLote() : formSaidaSimples()}${datalistColabs()}`;
  box.querySelectorAll('[data-modo]').forEach((b) => {
    b.onclick = () => { state.modoSaida = b.dataset.modo; state.aviso = null; renderTab(); };
  });
  if (lote) ligarLote(); else document.getElementById('stkMovForm').onsubmit = async (ev) => { ev.preventDefault(); await salvarSaidaSimples(); };
}

function formSaidaSimples() {
  return `<form id="stkMovForm" class="stk-grid">
    <div class="stk-field stk-field-2"><label for="movMaterial">Material</label><select id="movMaterial" required>${materialOptions()}</select></div>
    ${field('Quantidade', 'movQtd', 'number', '', true, 'min="0.01" step="0.01"')}
    <div class="stk-field"><label for="movData">Data</label><input id="movData" type="date" value="${hoje()}" required></div>
    ${selectField('Destino', 'movDestino', DESTINOS)}
    <div class="stk-field"><label for="movColab">Colaborador/Responsável</label><input id="movColab" list="stkColabs" placeholder="Digite o nome"></div>
    ${selectField('Motivo', 'movMotivo', MOTIVOS)}
    <div class="stk-field stk-field-full"><label for="movObs">Observação</label><textarea id="movObs" rows="2"></textarea></div>
    <div class="stk-actions stk-field-full"><button class="btn btn-primary" type="submit">Salvar saída</button><span id="movFb" class="stk-feedback"></span></div>
  </form>`;
}

async function salvarSaidaSimples() {
  const fb = document.getElementById('movFb');
  const linha = novaLinha({ colab: document.getElementById('movColab').value, materialId: document.getElementById('movMaterial').value, qtd: document.getElementById('movQtd').value });
  const cab = { data: document.getElementById('movData').value, destino: document.getElementById('movDestino').value, motivo: document.getElementById('movMotivo').value, observacao: document.getElementById('movObs').value.trim() };
  if (!grupoPorId(linha.materialId) || !(r2(linha.qtd) > 0)) { setFb(fb, 'Selecione material e quantidade válida.', 'err'); return; }
  setFb(fb, 'Salvando...');
  try {
    await atualizarSaldos();
    const plano = planejarSaida([linha], { cab, exigirColab: false });
    if (plano.erros.size) { setFb(fb, plano.erros.get(0).msg, 'err'); return; }
    await gravarMovimentos(plano.movs, plano.alteracoes);
    const grupo = grupoPorId(linha.materialId);
    state.aviso = { tipo: 'ok', texto: `Saída registrada: ${qtd(plano.totalItens)} ${grupo.unidade || 'UN'} de ${materialLabel(grupo)}${linha.colab.trim() ? ` para ${linha.colab.trim()}` : ''}.` };
    await recarregar();
  } catch (e) {
    setFb(fb, await mensagemFalhaSalvar(e, e?.message || 'Não foi possível salvar a saída.'), 'err');
  }
}

// ----- saída em lote -----

function formLote() {
  const l = state.lote;
  return `<form id="stkLoteForm">
    <div class="stk-grid stk-grid-cab" style="margin-bottom:16px">
      <div class="stk-field"><label for="loteData">Data</label><input id="loteData" type="date" value="${esc(l.data)}" required></div>
      ${selectField('Destino', 'loteDestino', DESTINOS, l.destino)}
      ${selectField('Motivo', 'loteMotivo', MOTIVOS, l.motivo)}
      <div class="stk-field"><label for="loteObs">Observação (vale p/ todas)</label><input id="loteObs" type="text" value="${esc(l.obs)}" placeholder="Opcional"></div>
    </div>
    <div class="stk-lote-cab"><span>Colaborador / responsável</span><span>Material</span><span>Qtd.</span><span></span></div>
    <div id="loteLinhas"></div>
    <div class="stk-actions">
      <button type="button" class="btn btn-secondary" id="loteMaisMaterial" title="Nova linha repetindo o colaborador da última">+ Mais um material <small>(mesmo colaborador)</small></button>
      <button type="button" class="btn btn-secondary" id="loteMaisColab" title="Nova linha repetindo o material e a quantidade da última">+ Mais um colaborador <small>(mesmo material)</small></button>
    </div>
    <div class="stk-lote-rodape">
      <span class="stk-resumo" id="loteResumo"></span>
      <span id="loteFb" class="stk-feedback"></span>
      <button type="submit" class="btn btn-primary" id="loteSalvar">Salvar lote</button>
    </div>
  </form>`;
}

function htmlLinhaLote(l, i, total) {
  return `<div class="stk-linha" data-i="${i}">
    <div class="stk-cel"><input data-f="colab" list="stkColabs" placeholder="Nome do colaborador" aria-label="Colaborador" autocomplete="off" value="${esc(l.colab)}"></div>
    <div class="stk-cel"><select data-f="materialId" aria-label="Material">${materialOptions(l.materialId)}</select></div>
    <div class="stk-cel"><input data-f="qtd" type="number" min="0.01" step="0.01" placeholder="Qtd." aria-label="Quantidade" value="${esc(l.qtd)}"></div>
    <div class="stk-cel"><button type="button" class="stk-rm" data-rm="${i}" title="Remover linha" aria-label="Remover linha" ${total < 2 ? 'disabled' : ''}>×</button></div>
    <small class="stk-msg" data-msg></small>
  </div>`;
}

function pintarLinhasLote() {
  const { linhas } = state.lote;
  document.getElementById('loteLinhas').innerHTML = linhas.map((l, i) => htmlLinhaLote(l, i, linhas.length)).join('');
  atualizarLote();
}

// Código que identifica o lote no Histórico (fica na observação de cada saída gravada).
const gerarTagLote = (l) => `Lote ${l.data.replaceAll('-', '')}-${pad(new Date().getHours())}${pad(new Date().getMinutes())}`;

function cabecalhoLote() {
  const l = state.lote;
  const tag = l.tag || gerarTagLote(l);
  return { data: l.data, destino: l.destino, motivo: l.motivo, observacao: `${tag}${l.obs.trim() ? ` · ${l.obs.trim()}` : ''}`, tag };
}

// Recalcula erros/avisos de cada linha e o resumo, sem redesenhar os campos (não perde o foco).
function atualizarLote() {
  const lote = state.lote;
  const plano = planejarSaida(lote.linhas, { cab: cabecalhoLote(), exigirColab: lote.destino === 'Colaborador' });
  document.querySelectorAll('#loteLinhas .stk-linha').forEach((el) => {
    const i = Number(el.dataset.i);
    const erro = plano.erros.get(i);
    const mostrar = erro && (lote.mostrarErros || erro.tipo !== 'campo');
    const aviso = plano.avisos.get(i);
    const msg = el.querySelector('[data-msg]');
    el.classList.toggle('erro', Boolean(mostrar));
    msg.textContent = mostrar ? erro.msg : (aviso || '');
    msg.classList.toggle('warn', !mostrar && Boolean(aviso));
  });
  const materiais = new Set(lote.linhas.filter((l) => l.materialId).map((l) => l.materialId)).size;
  const resumo = document.getElementById('loteResumo');
  if (resumo) resumo.textContent = `${lote.linhas.length} ${lote.linhas.length === 1 ? 'linha' : 'linhas'} · ${materiais} ${materiais === 1 ? 'material' : 'materiais'}${plano.totalItens ? ` · ${qtd(plano.totalItens)} itens a baixar` : ''}`;
  return plano;
}

// O <select> de material vira combobox pesquisável no próximo frame (searchableSelect.js),
// então espera o campo visível existir antes de focar.
function focarLinhaLote(i, campo, tentativas = 10) {
  setTimeout(() => {
    const cel = document.querySelector(`#loteLinhas .stk-linha[data-i="${i}"] [data-f="${campo}"]`)?.closest('.stk-cel');
    const alvo = cel?.querySelector('.ssel-input') || (campo === 'colab' ? cel?.querySelector('input') : null);
    if (alvo) alvo.focus();
    else if (tentativas > 0) focarLinhaLote(i, campo, tentativas - 1);
    else cel?.querySelector('select')?.focus();
  }, 60);
}

function ligarLote() {
  const lote = state.lote;
  const area = document.getElementById('loteLinhas');
  pintarLinhasLote();

  const lerCabecalho = () => {
    lote.data = document.getElementById('loteData').value;
    lote.destino = document.getElementById('loteDestino').value;
    lote.motivo = document.getElementById('loteMotivo').value;
    lote.obs = document.getElementById('loteObs').value;
    atualizarLote();
  };
  ['loteData', 'loteDestino', 'loteMotivo', 'loteObs'].forEach((id) => { document.getElementById(id).oninput = lerCabecalho; document.getElementById(id).onchange = lerCabecalho; });

  const editou = (e) => {
    const campo = e.target.dataset?.f;
    const linha = e.target.closest('.stk-linha');
    if (!campo || !linha) return;
    lote.linhas[Number(linha.dataset.i)][campo] = e.target.value;
    atualizarLote();
  };
  area.addEventListener('input', editou);
  area.addEventListener('change', editou);
  area.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (!rm || lote.linhas.length < 2) return;
    lote.linhas.splice(Number(rm.dataset.rm), 1);
    pintarLinhasLote();
  });

  document.getElementById('loteMaisMaterial').onclick = () => {
    const ultima = lote.linhas[lote.linhas.length - 1];
    lote.linhas.push(novaLinha({ colab: ultima.colab }));
    pintarLinhasLote();
    focarLinhaLote(lote.linhas.length - 1, 'materialId');
  };
  document.getElementById('loteMaisColab').onclick = () => {
    const ultima = lote.linhas[lote.linhas.length - 1];
    lote.linhas.push(novaLinha({ materialId: ultima.materialId, qtd: ultima.qtd }));
    pintarLinhasLote();
    focarLinhaLote(lote.linhas.length - 1, 'colab');
  };
  document.getElementById('stkLoteForm').onsubmit = async (ev) => { ev.preventDefault(); await salvarLote(); };
}

async function salvarLote() {
  const lote = state.lote;
  const fb = document.getElementById('loteFb');
  const btn = document.getElementById('loteSalvar');
  lote.mostrarErros = true;
  lote.tag = gerarTagLote(lote);
  setFb(fb, 'Conferindo saldos...');
  btn.disabled = true;
  try {
    await atualizarSaldos();
    const cab = cabecalhoLote();
    const plano = atualizarLote();
    if (plano.erros.size) {
      setFb(fb, plano.erros.size === 1 ? 'Corrija a linha destacada.' : `Corrija as ${plano.erros.size} linhas destacadas.`, 'err');
      return;
    }
    const total = plano.saidas;
    if (!window.confirm(`Registrar ${total} ${total === 1 ? 'saída' : 'saídas'} (${qtd(plano.totalItens)} itens) em ${brDate(cab.data)}?\n\nA baixa no estoque é imediata.`)) { setFb(fb, ''); return; }
    setFb(fb, 'Salvando...');
    await gravarMovimentos(plano.movs, plano.alteracoes);
    state.aviso = { tipo: 'ok', texto: `Lote registrado: ${total} ${total === 1 ? 'saída' : 'saídas'}, ${qtd(plano.totalItens)} itens baixados (${cab.tag}).` };
    state.lote = novoLote({ destino: lote.destino, motivo: lote.motivo });
    await recarregar();
  } catch (e) {
    setFb(fb, await mensagemFalhaSalvar(e, e?.message || 'Não foi possível salvar o lote.'), 'err');
  } finally {
    lote.tag = '';
    btn.disabled = false;
  }
}

// ---------- Alertas ----------

function renderAlertas(box) {
  const ordem = { critico: 0, baixo: 1 };
  const alertas = state.grupos.filter((g) => statusMaterial(g) !== 'normal').sort((a, b) => ordem[statusMaterial(a)] - ordem[statusMaterial(b)]);
  box.innerHTML = `${avisoHtml()}<p class="stk-dica">Materiais zerados ou abaixo do estoque mínimo. A solicitação de compra vai direto para o módulo Compras.</p>
  <div class="stk-table-wrap"><table class="stk-table"><thead><tr><th>Material</th><th>Status</th><th class="num">Atual</th><th class="num">Mínimo</th><th class="num">Sugerido</th><th></th></tr></thead><tbody>${alertas.length ? alertas.map((g) => {
    const s = statusMaterial(g);
    const sug = Math.max(1, Number(g.estoque_minimo || 0) - Number(g.estoque_atual || 0));
    return `<tr><td><b>${esc(materialLabel(g))}</b><br><small class="muted">${esc(g.categoria || '')}</small></td><td><span class="stk-pill ${s}">${statusLabel(s)}</span></td><td class="num">${qtd(g.estoque_atual)} ${esc(g.unidade || 'UN')}</td><td class="num">${qtd(g.estoque_minimo)} ${esc(g.unidade || 'UN')}</td><td class="num">${qtd(sug)} ${esc(g.unidade || 'UN')}</td><td><button class="btn btn-small btn-primary" data-solicitar="${esc(g.id)}" type="button">Gerar solicitação</button></td></tr>`;
  }).join('') : '<tr><td colspan="6" class="stk-empty">Nenhum alerta no momento.</td></tr>'}</tbody></table></div>
  <span id="alertFb" class="stk-feedback" style="display:block;margin-top:12px"></span>`;
  box.querySelectorAll('[data-solicitar]').forEach((b) => { b.onclick = () => gerarSolicitacaoCompra(b); });
}

async function gerarSolicitacaoCompra(btn) {
  const g = grupoPorId(btn.dataset.solicitar);
  const fb = document.getElementById('alertFb');
  if (!g) return;
  const sug = Math.max(1, Number(g.estoque_minimo || 0) - Number(g.estoque_atual || 0));
  setFb(fb, 'Gerando solicitação...');
  btn.disabled = true;
  const u = usuario();
  const header = { data_solicitacao: hoje(), solicitante_id: u.id || null, solicitante: userName(), coordenacao: u.coordenacao || u.supervisao || null, tipo_solicitacao: 'estoque', status: 'pendente', observacoes: `Reposição automática do estoque: ${materialLabel(g)}`, created_by: u.id || null };
  const { data: sol, error: e1 } = await supabase.from('compras_solicitacoes').insert(header).select('id').single();
  if (e1) { setFb(fb, e1.message, 'err'); btn.disabled = false; return; }
  const item = { solicitacao_id: sol.id, material: g.nome, tipo: g.categoria || 'Outros', tamanho: g.tamanho || null, quantidade: sug, unidade: sug, status: 'pendente' };
  const { error: e2 } = await supabase.from('compras_itens').insert(item);
  if (e2) { setFb(fb, e2.message, 'err'); btn.disabled = false; return; }
  btn.textContent = 'Solicitação gerada ✓';
  setFb(fb, `Solicitação de compra gerada para ${materialLabel(g)}.`, 'ok');
}

// ---------- Histórico ----------

function movimentacoesFiltradas() {
  const { busca, tipo } = state.filtroHist;
  const q = norm(busca);
  return state.movs.filter((r) => (!tipo || r.tipo_movimentacao === tipo)
    && (!q || norm(`${r.tipo_movimentacao} ${r.motivo} ${r.observacao} ${r.colaborador_nome} ${r.destino} ${r.fornecedor} ${r.numero_nf} ${r.usuario_nome} ${materialLabel(r.compras_estoque_materiais || {})}`).includes(q)));
}

function tabelaHistorico(rows) {
  return `<div class="stk-table-wrap"><table class="stk-table"><thead><tr><th>Data</th><th>Tipo</th><th>Material</th><th class="num">Qtd.</th><th>Responsável/Destino</th><th>Observação</th></tr></thead><tbody>${rows.length ? rows.map((r) => `<tr><td style="white-space:nowrap">${brDate(r.data_movimentacao || r.created_at)}</td><td style="min-width:150px"><span class="stk-pill ${esc(r.tipo_movimentacao)}">${esc(TIPOS_MOV[r.tipo_movimentacao] || r.tipo_movimentacao || '-')}</span>${r.motivo ? `<br><small class="muted">${esc(r.motivo)}</small>` : ''}</td><td>${esc(materialLabel(r.compras_estoque_materiais || {}))}</td><td class="num">${qtd(r.quantidade)}</td><td>${esc(r.colaborador_nome || r.destino || r.fornecedor || '-')}<br><small class="muted">${esc(r.usuario_nome || '')}</small></td><td>${esc(r.observacao || '')}</td></tr>`).join('') : '<tr><td colspan="6" class="stk-empty">Nenhuma movimentação localizada.</td></tr>'}</tbody></table></div>`;
}

function renderHistorico(box) {
  const f = state.filtroHist;
  box.innerHTML = `${avisoHtml()}
  <div class="stk-bar">
    <input class="stk-grow" id="histBusca" type="search" placeholder="Buscar por material, colaborador, motivo, lote..." value="${esc(f.busca)}" aria-label="Buscar no histórico">
    <select id="histTipo" aria-label="Tipo"><option value="">Todos os tipos</option>${Object.entries(TIPOS_MOV).map(([v, l]) => `<option value="${v}" ${v === f.tipo ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <div class="stk-bar-fim"><span class="stk-total" id="histTotal"></span></div>
  </div>
  <div id="histTabela"></div>`;
  const pintar = () => {
    const rows = movimentacoesFiltradas();
    document.getElementById('histTabela').innerHTML = tabelaHistorico(rows);
    document.getElementById('histTotal').textContent = `${rows.length} de ${state.movs.length} movimentações recentes`;
  };
  pintar();
  document.getElementById('histBusca').oninput = (e) => { f.busca = e.target.value; pintar(); };
  document.getElementById('histTipo').onchange = (e) => { f.tipo = e.target.value; pintar(); };
}

// ---------- Cadastro ----------

function renderCadastro(box) {
  box.innerHTML = `${avisoHtml()}<p class="stk-dica">Cadastre o item uma vez; depois use Entradas, Saídas e Inventário. Item igual a um já cadastrado (nome, categoria, tamanho, unidade e local) é somado ao existente.</p>
  <form id="stkMatForm" class="stk-grid">
    ${field('Nome', 'mNome', 'text', 'Ex: Uniforme Polo', true)}
    ${selectField('Categoria', 'mCategoria', CATEGORIAS)}
    ${field('Tamanho/Detalhe', 'mTamanho', 'text', 'Ex: G, GG, 14/64, 2m')}
    ${field('Código interno', 'mCodigo', 'text', 'Opcional')}
    ${selectField('Unidade', 'mUnidade', UNIDADES)}
    ${field('Estoque atual', 'mAtual', 'number', '0', false, 'min="0" step="0.01"')}
    ${field('Estoque mínimo', 'mMin', 'number', '0', false, 'min="0" step="0.01"')}
    ${field('Estoque máximo', 'mMax', 'number', '0', false, 'min="0" step="0.01"')}
    ${selectField('Local', 'mLocal', LOCAIS)}
    <div class="stk-field stk-field-full"><label for="mObs">Observação</label><textarea id="mObs" rows="2"></textarea></div>
    <div class="stk-actions stk-field-full"><button class="btn btn-primary" type="submit">Salvar material</button><span id="mFb" class="stk-feedback"></span></div>
  </form>`;
  document.getElementById('stkMatForm').onsubmit = async (ev) => { ev.preventDefault(); await salvarMaterial(); };
}

async function salvarMaterial() {
  const val = (id) => document.getElementById(id).value;
  const payload = {
    nome: val('mNome').trim().toUpperCase(),
    categoria: val('mCategoria'),
    tamanho: val('mTamanho').trim() || null,
    codigo_interno: val('mCodigo').trim() || null,
    unidade: val('mUnidade'),
    estoque_atual: Number(val('mAtual') || 0),
    estoque_minimo: Number(val('mMin') || 0),
    estoque_maximo: Number(val('mMax') || 0),
    local_armazenamento: val('mLocal'),
    observacao: val('mObs').trim() || null,
    ativo: true
  };
  const fb = document.getElementById('mFb');
  if (!payload.nome) return;
  setFb(fb, 'Salvando...');
  try {
    await atualizarSaldos();
    const existente = state.materiais.find((m) => chaveMaterial(m) === chaveMaterial(payload));
    if (existente) {
      const { error } = await supabase.from('compras_estoque_materiais').update({
        codigo_interno: existente.codigo_interno || payload.codigo_interno,
        estoque_atual: r2(Number(existente.estoque_atual || 0) + payload.estoque_atual),
        estoque_minimo: Math.max(Number(existente.estoque_minimo || 0), payload.estoque_minimo),
        estoque_maximo: Math.max(Number(existente.estoque_maximo || 0), payload.estoque_maximo),
        observacao: payload.observacao || existente.observacao || null,
        updated_at: new Date().toISOString()
      }).eq('id', existente.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('compras_estoque_materiais').insert(payload);
      if (error) throw error;
    }
    state.aviso = { tipo: 'ok', texto: existente ? `${materialLabel(payload)} já existia: saldo somado ao cadastro atual.` : `${materialLabel(payload)} cadastrado.` };
    await recarregar();
  } catch (e) {
    setFb(fb, await mensagemFalhaSalvar(e, e?.message || 'Não foi possível salvar o material.'), 'err');
  }
}

export async function renderContent(content, userContext) {
  ctxAtual = userContext;
  raiz = content;
  if (!state.lote) state.lote = novoLote();
  const hash = (window.location.hash || '').replace('#', '').trim();
  if (ABAS.some((a) => a.id === hash)) state.tab = hash;
  content.innerHTML = `${estilos()}<section class="card stk"><p class="stk-dica" style="margin:0">Carregando estoque...</p></section>`;
  await loadBase();
  render();
}

initProtectedPage('Estoque', renderContent);
