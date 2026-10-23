// Financeiro > Cotações.
//
// Pedidos de aprovação de cotação que Compras envia (botão "Solicitar aprovação" em Compras > Cotações). Um pedido por
// gestor (solicitante), com código (ex.: COUT23 = Compras + OUTubro + 23º do mês), data, solicitante e as ações:
//  - visualizar: abre o material solicitado e o valor cotado por fornecedor (as respostas dos links de cotação);
//  - aprovar: o Financeiro escolhe o fornecedor (um dos que responderam ou outro, informado à mão) e os itens voltam
//    para Compras > Cotações, prontos para comprar dele;
//  - recusar: pede o motivo e os itens vão para Recusados.
// Aprovar/recusar rodam no banco (RPC compras_decidir_aprovacao), junto com o status dos itens.
import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { injectEstilosFrotas, ICON as FM_ICON, cardFiltro, iconBtn } from './patrimonioLayoutFrotas.js?v=20261019-ordenar';
import {
  carregarCotacoesDosItens, montarPropostas, descreverDescontos, descreverFrete, descreverContato, formatarCnpj, REGIMES,
} from './admComprasCotacao.js?v=20261023-cotacao-link11';

const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const money = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-');
const dataHora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '-');

const SVG = {
  ver: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  aprovar: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
  recusar: '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
};
const STATUS = {
  pendente: { rotulo: 'Pendentes', badge: 'warn', texto: 'Pendente' },
  aprovada: { rotulo: 'Aprovadas', badge: 'ok', texto: 'Aprovada' },
  recusada: { rotulo: 'Recusadas', badge: 'err', texto: 'Recusada' },
};
const CARDS = [['pendente', 'Pendentes', 'amber', 'relogio'], ['aprovada', 'Aprovadas', 'green', 'ok'], ['recusada', 'Recusadas', 'red', 'erro']];

const state = { ctx: null, rows: [], filtro: 'pendente', busca: '', carregando: false };

function aviso(msg, erro = false) {
  const el = document.getElementById('fcAviso');
  if (el) { el.textContent = msg || ''; el.classList.toggle('erro', !!erro); }
}

async function carregar() {
  state.carregando = true; renderTabela();
  const { data, error } = await supabase.from('compras_aprovacoes')
    .select('*, compras_aprovacao_itens(compra_item_id)').order('created_at', { ascending: false }).limit(400);
  state.carregando = false;
  if (error) { state.rows = []; aviso(`Não foi possível carregar: ${error.message}`, true); }
  else state.rows = data || [];
  renderTabela();
}

function visiveis() {
  const q = norm(state.busca);
  return state.rows.filter((r) => r.status === state.filtro)
    .filter((r) => !q || norm(`${r.codigo} ${r.solicitante} ${r.solicitado_por_nome || ''}`).includes(q));
}

function renderTabela() {
  const cont = { pendente: 0, aprovada: 0, recusada: 0 };
  state.rows.forEach((r) => { if (cont[r.status] !== undefined) cont[r.status]++; });
  const kpis = document.getElementById('fcKpis');
  if (kpis) kpis.innerHTML = CARDS.map(([k, label, tone, icone]) => cardFiltro({ filtro: k, label, tone, icone, valor: String(cont[k]), atributo: 'data-fc-filtro', ativo: state.filtro === k })).join('');
  const lista = visiveis();
  const cnt = document.getElementById('fcCount'); if (cnt) cnt.textContent = `${lista.length} cotação(ões)`;
  const body = document.getElementById('fcBody'); if (!body) return;
  if (state.carregando && !state.rows.length) { body.innerHTML = '<tr><td colspan="4" class="fm-empty">Carregando…</td></tr>'; return; }
  if (!lista.length) { body.innerHTML = `<tr><td colspan="4" class="fm-empty">${state.busca ? 'Nenhuma cotação encontrada para a busca.' : `Nenhuma cotação ${STATUS[state.filtro].rotulo.toLowerCase()}.`}</td></tr>`; return; }
  body.innerHTML = lista.map((r) => `<tr>
    <td data-label="Código"><b class="fc-codigo">${esc(r.codigo)}</b>${r.status !== 'pendente' ? ` <span class="fm-badge ${STATUS[r.status].badge}">${STATUS[r.status].texto}</span>` : ''}</td>
    <td data-label="Data">${dataBr(r.created_at)}</td>
    <td data-label="Solicitante">${esc(r.solicitante)}<br><small class="fc-sub">${(r.compras_aprovacao_itens || []).length} ${(r.compras_aprovacao_itens || []).length === 1 ? 'material' : 'materiais'}</small></td>
    <td data-label="Ações"><div class="fm-actions">${iconBtn('data-fc-ver', r.id, '', 'Visualizar', SVG.ver)}${r.status === 'pendente'
      ? `${iconBtn('data-fc-aprovar', r.id, 'termo', 'Aprovar (escolher o fornecedor)', SVG.aprovar)}${iconBtn('data-fc-recusar', r.id, 'danger', 'Recusar', SVG.recusar)}` : ''}</div></td>
  </tr>`).join('');
}

// ─── Visualizar: material solicitado × valor cotado por fornecedor ───────────────────────────────
function fecharModal() { document.getElementById('fcModal')?.remove(); }
function abrirModal(html) {
  fecharModal();
  const el = document.createElement('div');
  el.id = 'fcModal'; el.className = 'fm-modal-backdrop';
  el.innerHTML = `<div class="fm-modal fc-modal" role="dialog" aria-modal="true">${html}</div>`;
  el.addEventListener('mousedown', (e) => { if (e.target === el) fecharModal(); });
  document.body.appendChild(el);
  return el;
}

async function carregarDetalhe(aprov) {
  const ids = (aprov.compras_aprovacao_itens || []).map((x) => x.compra_item_id);
  const { data: itens, error } = await supabase.from('compras_itens').select('*, compras_solicitacoes(*)').in('id', ids);
  if (error) throw error;
  const ordenados = ids.map((id) => (itens || []).find((i) => String(i.id) === String(id))).filter(Boolean);
  const info = await carregarCotacoesDosItens(supabase, ids);
  return { itens: ordenados, propostas: montarPropostas(ordenados, info) };
}

const OUTRO = '__outro';
const blocoOutro = () => `<div class="fc-outro"><label class="fc-radio"><input type="radio" name="fcForn" value="${OUTRO}"> Outro fornecedor (informar)</label>
  <div class="fc-outro-campos" id="fcOutroCampos" hidden>
    <div class="fm-field"><label for="fcOutroNome">Fornecedor</label><input class="fm-input" id="fcOutroNome" maxlength="160" placeholder="Nome / razão social"></div>
    <div class="fm-field"><label for="fcOutroCnpj">CNPJ (opcional)</label><input class="fm-input" id="fcOutroCnpj" maxlength="18" placeholder="00.000.000/0000-00"></div>
    <div class="fm-field"><label for="fcOutroValor">Valor aprovado (opcional)</label><input class="fm-input" id="fcOutroValor" inputmode="decimal" placeholder="R$ 0,00"></div>
  </div></div>`;
const lerValor = (v) => { const n = Number(String(v || '').replace(/^R\$\s*/, '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null; };

function celulaValor(p, r) {
  const v = p.valores[String(r.id)];
  const q = Number(r.quantidade || r.unidade || 1);
  if (v === undefined) return '<span class="fc-sub">não consultado</span>';
  if (v === null) return '<span class="fc-sub">Não possuo</span>';
  return `${money(v)}<br><small class="fc-sub">${q} × = ${money(v * q)}</small>`;
}

function tabelaComparacao(itens, propostas, { escolher = false, escolhidoCnpj = '' } = {}) {
  if (!propostas.length) return '<p class="fc-sub">Nenhum fornecedor respondeu a esta cotação.</p>';
  const melhor = Math.min(...propostas.filter((p) => p.completo).map((p) => p.totalComFrete), Infinity);
  const linha = (rotulo, fn, cls = '') => `<tr class="${cls}"><td>${rotulo}</td>${propostas.map((p) => `<td data-fc-col="${esc(p.cnpj)}" class="${p.cnpj === escolhidoCnpj ? 'escolhido' : ''}">${fn(p)}</td>`).join('')}</tr>`;
  return `<div class="fm-table-wrap"><table class="fm-table fc-comp">
    <thead><tr><th>Material solicitado</th>${propostas.map((p) => `<th data-fc-col="${esc(p.cnpj)}" class="${p.cnpj === escolhidoCnpj ? 'escolhido' : ''}">${esc(p.razao_social)}<br><small>${esc(formatarCnpj(p.cnpj))}</small>${p.cnpj === escolhidoCnpj ? '<br><small class="fc-ok">Fornecedor escolhido</small>' : ''}${escolher ? `<br><label class="fc-radio fc-radio-th"><input type="radio" name="fcForn" value="${esc(p.cnpj)}"> Escolher</label>` : ''}</th>`).join('')}</tr></thead>
    <tbody>
      ${itens.map((r) => `<tr><td><b>${esc(r.quantidade || r.unidade || 1)}x ${esc(r.material)}</b>${r.tamanho ? `<br><small class="fc-sub">Tam: ${esc(r.tamanho)}</small>` : ''}${r.colaborador_nome ? `<br><small class="fc-sub">${esc(r.colaborador_nome)}</small>` : ''}</td>${propostas.map((p) => `<td data-fc-col="${esc(p.cnpj)}" class="${p.cnpj === escolhidoCnpj ? 'escolhido' : ''}">${celulaValor(p, r)}</td>`).join('')}</tr>`).join('')}
      ${linha(`Total dos itens${propostas.some((p) => !p.completo) ? ' (só os cotados)' : ''}`, (p) => `<b>${money(p.total)}</b>${p.completo ? '' : `<br><small class="fc-sub">cobre ${p.cobertos} de ${itens.length}</small>`}`, 'fc-total')}
      ${linha('Frete', (p) => esc(descreverFrete(p)))}
      <tr class="fc-total"><td>Total + frete estimado</td>${propostas.map((p) => `<td data-fc-col="${esc(p.cnpj)}" class="${p.cnpj === escolhidoCnpj ? 'escolhido' : ''} ${p.completo && p.totalComFrete === melhor ? 'melhor' : ''}"><b>${money(p.totalComFrete)}</b>${p.completo && p.totalComFrete === melhor ? '<br><small>menor custo</small>' : ''}</td>`).join('')}</tr>
      ${linha('Emite nota fiscal', (p) => (p.emite_nf ? 'Sim' : 'Não'))}
      ${linha('Regime tributário', (p) => esc(REGIMES[p.regime_tributario] || '-'))}
      ${linha('Prazo de entrega', (p) => esc(p.prazo_entrega || '-'))}
      ${linha('Formas de pagamento', (p) => esc(p.formas_pagamento.join(', ') || '-'))}
      ${linha('Desconto por forma', (p) => esc(descreverDescontos(p)))}
      ${linha('Atendente / WhatsApp', (p) => esc(descreverContato(p)))}
    </tbody></table></div>`;
}

// Marca a coluna do fornecedor escolhido e mostra os campos de "outro fornecedor".
function ligarEscolha(modal, propostas) {
  modal.querySelectorAll('input[name="fcForn"]').forEach((r) => r.addEventListener('change', () => {
    modal.querySelectorAll('[data-fc-col]').forEach((c) => c.classList.toggle('escolhido', c.dataset.fcCol === r.value && r.checked));
    const campos = modal.querySelector('#fcOutroCampos'); if (campos) campos.hidden = r.value !== OUTRO;
    modal.querySelector('#fcEscolhaErro').textContent = '';
    if (r.value === OUTRO) modal.querySelector('#fcOutroNome')?.focus();
  }));
}

// Lê a escolha: um fornecedor que respondeu (valor = total + frete estimado) ou outro informado à mão.
function lerEscolha(modal, propostas) {
  const marcado = modal.querySelector('input[name="fcForn"]:checked');
  if (!marcado) return { erro: 'Escolha o fornecedor antes de aprovar.' };
  if (marcado.value === OUTRO) {
    const nome = modal.querySelector('#fcOutroNome').value.trim();
    if (nome.length < 2) return { erro: 'Informe o nome do fornecedor escolhido.' };
    return { nome, cnpj: modal.querySelector('#fcOutroCnpj').value.trim() || null, valor: lerValor(modal.querySelector('#fcOutroValor').value) };
  }
  const p = propostas.find((x) => x.cnpj === marcado.value);
  return p ? { nome: p.razao_social, cnpj: p.cnpj, valor: p.totalComFrete } : { erro: 'Fornecedor não encontrado.' };
}

async function visualizar(id) {
  const aprov = state.rows.find((r) => String(r.id) === String(id)); if (!aprov) return;
  const modal = abrirModal(`<div class="fm-modal-head"><div><h3>Cotação ${esc(aprov.codigo)}</h3><p>Carregando…</p></div><button class="fm-btn ghost" data-fc-fechar type="button">Fechar</button></div>`);
  modal.querySelector('[data-fc-fechar]').onclick = fecharModal;
  try {
    const { itens, propostas } = await carregarDetalhe(aprov);
    const st = STATUS[aprov.status];
    modal.querySelector('.fm-modal').innerHTML = `
      <div class="fm-modal-head"><div><h3>Cotação ${esc(aprov.codigo)} <span class="fm-badge ${st.badge}">${st.texto}</span></h3>
        <p>Solicitante: <b>${esc(aprov.solicitante)}</b> · Pedida em ${dataHora(aprov.created_at)}${aprov.solicitado_por_nome ? ` por ${esc(aprov.solicitado_por_nome)}${aprov.setor_solicitante ? ` (${esc(aprov.setor_solicitante)})` : ''}` : ''}
        ${aprov.decidido_em ? `<br>${aprov.status === 'aprovada' ? 'Aprovada' : 'Recusada'} em ${dataHora(aprov.decidido_em)}${aprov.decidido_por ? ` por ${esc(aprov.decidido_por)}` : ''}${aprov.motivo_recusa ? ` — ${esc(aprov.motivo_recusa)}` : ''}` : ''}</p></div>
        <button class="fm-btn ghost" data-fc-fechar type="button">Fechar</button></div>
      <div class="fm-modal-body">
        ${aprov.status === 'aprovada' ? `<p class="fc-escolhido-txt">Fornecedor escolhido: <b>${esc(aprov.fornecedor_nome || '-')}</b>${aprov.fornecedor_cnpj ? ` · ${esc(formatarCnpj(aprov.fornecedor_cnpj))}` : ''}${aprov.valor_aprovado != null ? ` · valor aprovado <b>${money(aprov.valor_aprovado)}</b>` : ''}</p>` : ''}
        ${aprov.status === 'pendente' ? '<p class="fc-sub">Compare os valores e marque o fornecedor escolhido para aprovar. Se for outro, use "Outro fornecedor".</p>' : ''}
        ${tabelaComparacao(itens, propostas, { escolher: aprov.status === 'pendente', escolhidoCnpj: aprov.status === 'aprovada' ? (aprov.fornecedor_cnpj || '') : '' })}
        ${aprov.status === 'pendente' ? blocoOutro() : ''}
        <div class="fm-erro" id="fcEscolhaErro"></div>
      </div>
      ${aprov.status === 'pendente' ? `<div class="fm-modal-foot"><button class="fm-btn soft" data-fc-recusar-modal type="button">Recusar</button><button class="fm-btn primary" data-fc-aprovar-modal type="button">Aprovar</button></div>` : ''}`;
    modal.querySelector('[data-fc-fechar]').onclick = fecharModal;
    ligarEscolha(modal, propostas);
    modal.querySelector('[data-fc-aprovar-modal]')?.addEventListener('click', () => aprovar(aprov.id, modal, propostas));
    modal.querySelector('[data-fc-recusar-modal]')?.addEventListener('click', () => recusar(aprov.id));
  } catch (e) {
    modal.querySelector('.fm-modal-head p').textContent = `Não foi possível carregar: ${e.message}`;
  }
}

// ─── Decisão ────────────────────────────────────────────────────────────────────────────────────
function nomeLogado() { const u = state.ctx?.user || {}; return u.name || u.email || null; }

async function decidir(id, aprovar, motivo = null, escolha = null) {
  const { error } = await supabase.rpc('compras_decidir_aprovacao', {
    p_id: id, p_aprovar: aprovar, p_motivo: motivo, p_nome: nomeLogado(),
    p_fornecedor_nome: escolha?.nome ?? null, p_fornecedor_cnpj: escolha?.cnpj ?? null, p_valor: escolha?.valor ?? null,
  });
  if (error) throw error;
  fecharModal();
  aviso(aprovar ? `Cotação aprovada com ${escolha.nome}. Os itens voltaram para Compras, prontos para comprar.` : 'Cotação recusada. Os itens foram para Recusados em Compras.');
  await carregar();
}

// Aprovar exige escolher o fornecedor: da lista, abre a cotação para escolher; dentro da cotação, confirma.
async function aprovar(id, modal = null, propostas = []) {
  const aprov = state.rows.find((r) => String(r.id) === String(id)); if (!aprov) return;
  if (!modal) { await visualizar(id); return; }
  const escolha = lerEscolha(modal, propostas);
  if (escolha.erro) { modal.querySelector('#fcEscolhaErro').textContent = escolha.erro; return; }
  if (!confirm(`Aprovar a cotação ${aprov.codigo} (${aprov.solicitante}) com ${escolha.nome}${escolha.valor ? ` por ${money(escolha.valor)}` : ''}?`)) return;
  try { await decidir(id, true, null, escolha); } catch (e) { modal.querySelector('#fcEscolhaErro').textContent = e.message; }
}

function recusar(id) {
  const aprov = state.rows.find((r) => String(r.id) === String(id)); if (!aprov) return;
  const modal = abrirModal(`<div class="fm-modal-head"><div><h3>Recusar cotação ${esc(aprov.codigo)}</h3><p>${esc(aprov.solicitante)} · informe o motivo; ele aparece para Compras.</p></div><button class="fm-btn ghost" data-fc-fechar type="button">Cancelar</button></div>
    <div class="fm-modal-body"><div class="fm-field"><label for="fcMotivo">Motivo da recusa</label><textarea id="fcMotivo" maxlength="400" placeholder="Ex.: valor acima do orçamento"></textarea></div><div class="fm-erro" id="fcMotivoErro"></div></div>
    <div class="fm-modal-foot"><button class="fm-btn primary" id="fcConfirmarRecusa" type="button">Confirmar recusa</button></div>`);
  modal.querySelector('[data-fc-fechar]').onclick = fecharModal;
  const campo = modal.querySelector('#fcMotivo'); campo.focus();
  modal.querySelector('#fcConfirmarRecusa').onclick = async (ev) => {
    const motivo = campo.value.trim();
    if (!motivo) { modal.querySelector('#fcMotivoErro').textContent = 'Informe o motivo da recusa.'; return; }
    ev.currentTarget.disabled = true;
    try { await decidir(id, false, motivo); }
    catch (e) { ev.currentTarget.disabled = false; modal.querySelector('#fcMotivoErro').textContent = e.message; }
  };
}

// ─── Tela ───────────────────────────────────────────────────────────────────────────────────────
function styles() {
  return `<style>
.fc-codigo{letter-spacing:.04em;color:#bbf7d0}.fc-sub{color:#94a3b8;font-size:12px}
.fc-table{min-width:0}.fc-aviso:empty{display:none}
.fc-aviso{display:block;min-height:18px;margin:0 0 10px;font-weight:700;color:#bbf7d0}.fc-aviso.erro{color:#fecaca}
.fc-comp td.escolhido,.fc-comp th.escolhido{background:rgba(34,197,94,.16)}.fc-ok{color:#86efac;font-weight:800}.fc-escolhido-txt{margin:0 0 12px;color:#bbf7d0}
.fc-radio{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-weight:800;color:#e2e8f0}.fc-radio input{width:17px;height:17px;accent-color:#22c55e}.fc-radio-th{margin-top:8px;text-transform:none;letter-spacing:0;font-size:13px}.fc-escolha td{border-top:2px solid rgba(148,163,184,.25)}
.fc-outro{margin-top:14px;padding:12px 14px;border:1px dashed rgba(148,163,184,.3);border-radius:14px}.fc-outro-campos{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;margin-top:12px}.fc-outro-campos[hidden]{display:none}
@media(max-width:760px){.fc-outro-campos{grid-template-columns:1fr}}
.fc-modal{width:min(1100px,96vw)}.fc-comp th,.fc-comp td{vertical-align:top}.fc-comp{min-width:640px}.fc-comp td.melhor{background:rgba(34,197,94,.14)}.fc-total td{border-top:2px solid rgba(148,163,184,.25)}
.fc-modal .fm-modal-foot{display:flex;gap:10px;justify-content:flex-end;padding:16px 20px;border-top:1px solid rgba(148,163,184,.16)}
/* Cartões quadrados, em fila, com o Atualizar na mesma linha (sem cabeçalho: o título já está no topo da página) */
.fc-kpi-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 16px}
.fc-kpis{display:flex;gap:12px;flex-wrap:wrap}
.fc-kpis .fm-kcard{width:148px;min-height:112px;flex-direction:column;align-items:flex-start;justify-content:center;gap:10px;padding:14px 16px}
.fc-table td[data-label="Ações"]{width:1%;white-space:nowrap}
@media(max-width:760px){.fc-kpis{gap:8px;flex:1 1 100%}.fc-kpis .fm-kcard{width:calc(33.33% - 6px);min-height:96px;padding:10px 12px}.fc-kpis .fm-kcard-ic{display:none}.fc-table{min-width:0}}
</style>`;
}

export async function renderContent(content, ctx) {
  state.ctx = ctx;
  injectEstilosFrotas();
  content.innerHTML = `${styles()}<div class="fm-shell">
    <div class="fc-kpi-row"><div class="fc-kpis" id="fcKpis"></div><button class="fm-btn soft" id="fcAtualizar" type="button">↻ Atualizar</button></div>
    <div class="fm-card"><div class="fm-body">
      <span class="fc-aviso" id="fcAviso"></span>
      <div class="fm-bar"><div class="fm-search">${FM_ICON.busca}<input class="fm-input" id="fcBusca" placeholder="Buscar por código ou solicitante..." autocomplete="off"></div><span class="fm-count" id="fcCount"></span></div>
      <div class="fm-table-wrap"><table class="fm-table fc-table"><thead><tr><th>Código</th><th>Data</th><th>Solicitante</th><th>Ações</th></tr></thead><tbody id="fcBody"></tbody></table></div>
    </div></div></div>`;
  content.querySelector('#fcAtualizar').onclick = () => { aviso(''); carregar(); };
  content.querySelector('#fcBusca').oninput = (e) => { state.busca = e.target.value; renderTabela(); };
  content.querySelector('#fcKpis').onclick = (e) => { const b = e.target.closest('[data-fc-filtro]'); if (!b) return; state.filtro = b.dataset.fcFiltro; renderTabela(); };
  content.querySelector('#fcBody').onclick = (e) => {
    const ver = e.target.closest('[data-fc-ver]'); const ap = e.target.closest('[data-fc-aprovar]'); const re = e.target.closest('[data-fc-recusar]');
    if (ver) visualizar(ver.dataset.fcVer);
    else if (ap) aprovar(ap.dataset.fcAprovar);
    else if (re) recusar(re.dataset.fcRecusar);
  };
  await carregar();
}

initProtectedPage('Cotações', renderContent);
