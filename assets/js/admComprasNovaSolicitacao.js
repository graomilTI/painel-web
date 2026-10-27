// Nova solicitação de compra feita pela própria Compras (ADM). Espelha o formulário do gestor:
// uma aba por tipo (Material, Uniforme, EPI, Alojamento), cada uma com os campos e o registro do seu procedimento.
import { adicionarEpi, agruparPorColaborador, itemEpiParaBanco } from './comprasEpiColaborador.js?v=20261023-epi1';

const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export const TIPOS = [
  { modo: 'itens', rotulo: 'Material', tipoSolicitacao: 'itens' },
  { modo: 'uniformes', rotulo: 'Uniforme', tipoSolicitacao: 'uniformes' },
  { modo: 'epi', rotulo: 'EPI', tipoSolicitacao: 'EPI' },
  { modo: 'alojamento', rotulo: 'Alojamento', tipoSolicitacao: 'Alojamento' }
];
export const UNIFORME_TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'EXG'];
export const UNIFORME_CORES = ['Verde', 'Cinza'];

// ─── Regras puras (testadas) ──────────────────────────────────────────────────
// EPI e Alojamento têm aba própria: Material não enxerga esses itens.
export const TIPOS_COM_ABA_PROPRIA = ['epi', 'alojamento'];
export const catalogoMaterial = (cat) => cat.filter((c) => !TIPOS_COM_ABA_PROPRIA.includes(norm(c.tipo)));
export const catalogoDoTipo = (cat, tipo) => cat.filter((c) => norm(c.tipo) === tipo);
export function abaDoItem(cat, valor) {
  const k = norm(valor);
  const outro = cat.find((i) => TIPOS_COM_ABA_PROPRIA.includes(norm(i.tipo)) && norm(i.material) === k);
  return outro ? (norm(outro.tipo) === 'epi' ? 'EPI' : 'Alojamento') : null;
}
export const precisaDetalhe = (material) => ['botina', 'peneira individual'].includes(norm(material));
export const ehCelular = (material) => norm(material) === 'celular';
export const chaveColaborador = (c) => String(c?.cpf || c?.documento || c?.id || norm(c?.nome || '')).trim();
export function dedupeColaboradores(lista) {
  const mapa = new Map();
  for (const c of lista || []) { const k = chaveColaborador(c); if (k && !mapa.has(k)) mapa.set(k, c); }
  return [...mapa.values()].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
}
// Colaboradores da mesma supervisão do solicitante (sem supervisão cadastrada, usa a coordenação).
export function colaboradoresDaSupervisao(colaboradores, solicitante) {
  const usaSup = Boolean(norm(solicitante?.supervisao));
  const escopo = norm(usaSup ? solicitante.supervisao : solicitante?.coordenacao);
  if (!escopo) return [];
  return dedupeColaboradores(colaboradores.filter((c) => norm(usaSup ? c.supervisao : c.coordenacao) === escopo));
}
export function itemUniforme({ colab, cor, tamanho, qtd }) {
  const q = Math.min(2, Math.max(1, Number(qtd || 1)));
  return { unidade: q, quantidade: q, material: 'UNIFORME', tipo: 'Uniforme', tamanho: tamanho || 'M', colaborador_id: colab?.id || null, colaborador_nome: colab?.nome || '', colaborador_tipo: colab?.tipo || colab?.cargo || '', uniforme_cor: cor || 'Verde' };
}
export function itemAlojamento({ material, qtd, detalhe }) {
  const q = Math.max(1, Math.floor(Number(qtd || 1)));
  return { unidade: q, quantidade: q, material: String(material || '').trim().toUpperCase(), tipo: 'Alojamento', tamanho: detalhe || null };
}
export const observacoesAlojamento = (destino) => `Alojamento: ${String(destino || '').trim()}`;
export function entregaDoPedido(entrega, endereco) {
  if (!entrega) throw new Error('Informe se a compra é para retirada ou entrega.');
  if (entrega === 'retirada') return { entrega_tipo: 'retirada', entrega_endereco: null };
  if (!String(endereco || '').trim()) throw new Error('Informe o endereço de entrega.');
  return { entrega_tipo: 'entrega', entrega_endereco: endereco.trim() };
}

const CSS = `
.ns-card{max-height:calc(100vh - 40px);overflow:auto}
.ns-kicker{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#4ade80}
.ns-card .section-head h3{margin:2px 0 0}
.ns-card label{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--muted);min-width:0}
.ns-card input,.ns-card select{width:100%;box-sizing:border-box;height:38px;padding:8px 10px;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;color-scheme:dark;font:inherit}
.ns-card .btn{min-height:42px;white-space:nowrap}
.ns-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.ns-tab.active{background:rgba(34,197,94,.18);border-color:rgba(74,222,128,.5);color:#bbf7d0}
.ns-sec{margin-top:18px}
.ns-sec-title{display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#bbf7d0}
.ns-sec-title span{width:20px;height:20px;border-radius:50%;background:rgba(34,197,94,.2);display:inline-flex;align-items:center;justify-content:center;font-size:11px}
.ns-linha{display:grid;gap:12px;align-items:end}
.ns-pedido{grid-template-columns:minmax(0,2.2fr) minmax(0,1.4fr) 150px 84px minmax(0,1.6fr)}
.ns-entrega{grid-template-columns:240px minmax(0,1fr);margin-top:12px}
.ns-add{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap}
.ns-add>label{flex:1 1 160px}.ns-add>.ns-un{flex:0 0 78px}.ns-add>.ns-grow{flex:2 1 240px}
.ns-add+.ns-add{margin-top:10px}
.ns-aviso{margin:0 0 12px;padding:10px 12px;border:1px solid rgba(74,222,128,.25);border-radius:12px;background:rgba(34,197,94,.06);font-size:13px;color:#cbd5e1}
.ns-panel[hidden]{display:none}
.ns-lista-head{display:flex;justify-content:space-between;align-items:center;margin:14px 0 8px;font-size:13px}.ns-lista-head span{color:var(--muted)}
.ns-card .adm-cmp-table{min-width:0}
.ns-card .adm-cmp-table td select,.ns-card .adm-cmp-table td input{height:32px;padding:4px 8px}
.ns-grupo td{background:rgba(34,197,94,.06);font-size:13px}.ns-grupo small{color:var(--muted);margin:0 8px}.ns-grupo span{float:right;color:var(--muted);font-size:12px}
.ns-card .cot-colab-wrap{position:relative}
@media(max-width:900px){.ns-pedido,.ns-entrega{grid-template-columns:1fr}.ns-add>label,.ns-add>.ns-un,.ns-add>.ns-grow{flex:1 1 100%}}
`;

function htmlBase({ catalogo, ufs, hoje }) {
  const mat = catalogoMaterial(catalogo);
  const aloj = catalogoDoTipo(catalogo, 'alojamento');
  const epi = catalogoDoTipo(catalogo, 'epi');
  const tabelaVazia = (id, cab) => `<div class="adm-cmp-table-wrap"><table class="adm-cmp-table"><thead><tr>${cab.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody id="${id}"></tbody></table></div>`;
  return `<style>${CSS}</style><div class="adm-cmp-modal-card adm-cmp-modal-wide ns-card">
  <div class="section-head"><div><div class="ns-kicker">Compras</div><h3>Nova solicitação de compra</h3></div><button class="btn btn-secondary" id="mClose" type="button">Fechar</button></div>
  <div class="ns-tabs">${TIPOS.map((t, i) => `<button class="btn btn-secondary ns-tab${i === 0 ? ' active' : ''}" data-ns-modo="${t.modo}" type="button">${t.rotulo}</button>`).join('')}</div>
  <section class="ns-sec"><div class="ns-sec-title"><span>1</span>Dados do pedido</div>
    <div class="ns-linha ns-pedido">
      <label>Solicitante<div class="cot-colab-wrap"><input id="nsSolicitante" placeholder="Digite o nome na equipe" autocomplete="off"><div class="cot-colab-sug" id="nsSolicitanteSug"></div></div></label>
      <label>Supervisão<input id="nsCoordenacao" placeholder="Automático"></label>
      <label>Data<input id="nsData" type="date" value="${hoje}" min="${hoje}"></label>
      <label>UF<select id="nsUf"><option value="">—</option>${ufs.map((x) => `<option value="${x}">${x}</option>`).join('')}</select></label>
      <label>Cidade<select id="nsCidade" disabled><option value="">Escolha a UF</option></select></label>
    </div>
    <div class="ns-linha ns-entrega" id="nsEntregaBox">
      <label>Retirada ou entrega?<select id="nsEntrega"><option value="">Selecione</option><option value="retirada">Retirada</option><option value="entrega">Entrega</option></select></label>
      <label id="nsEntregaEndWrap" hidden>Endereço de entrega<input id="nsEntregaEnd" maxlength="200" placeholder="Rua, número, bairro e cidade" autocomplete="off"></label>
    </div>
  </section>
  <section class="ns-sec"><div class="ns-sec-title"><span>2</span>Itens do pedido</div>
    <div class="ns-panel" data-ns-panel="itens">
      <div class="ns-add">
        <label class="ns-un">Un.<input id="nsMatQtd" type="number" min="1" step="1" value="1" inputmode="numeric"></label>
        <label class="ns-grow">Item<input id="nsMatItem" list="nsMatLista" placeholder="Digite ou escolha do catálogo" autocomplete="off"></label>
        <label id="nsMatTamWrap" hidden>Tamanho/detalhe<input id="nsMatTam" placeholder="Informe o tamanho/detalhe"></label>
        <button class="btn btn-secondary" id="nsMatAdd" type="button">+ Adicionar à lista</button>
      </div>
      <div class="ns-add" id="nsCelWrap" hidden>
        <label class="ns-grow">Colaborador que receberá o celular<div class="cot-colab-wrap"><input id="nsCelColab" placeholder="Digite o nome" autocomplete="off"><div class="cot-colab-sug" id="nsCelSug"></div></div></label>
        <label>Desconto em folha<select id="nsCelMetodo"><option value="a_vista">À vista</option><option value="parcelado">Parcelado</option></select></label>
        <label id="nsCelParcWrap" hidden>Parcelas (máx. 5x)<select id="nsCelParc">${[2, 3, 4, 5].map((n) => `<option value="${n}">${n}x</option>`).join('')}</select></label>
      </div>
      <datalist id="nsMatLista">${mat.map((c) => `<option value="${esc(c.material)}"></option>`).join('')}</datalist>
      <div class="ns-lista-head"><b>Lista do pedido</b><span id="nsMatCount">0 itens</span></div>
      ${tabelaVazia('nsMatBody', ['Un.', 'Item', 'Detalhe', ''])}
    </div>
    <div class="ns-panel" data-ns-panel="uniformes" hidden>
      <div class="ns-add">
        <label class="ns-grow">Nome<div class="cot-colab-wrap"><input id="nsUniColab" placeholder="Digite o nome" autocomplete="off"><div class="cot-colab-sug" id="nsUniSug"></div></div></label>
        <label>Tamanho<select id="nsUniTam">${UNIFORME_TAMANHOS.map((t) => `<option${t === 'M' ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>Cor<select id="nsUniCor">${UNIFORME_CORES.map((c) => `<option>${c}</option>`).join('')}</select></label>
        <button class="btn btn-secondary" id="nsUniAdd" type="button">Adicionar à lista</button>
        <button class="btn btn-secondary" id="nsUniTodos" type="button">Adicionar todos da supervisão</button>
      </div>
      <div class="ns-lista-head"><b>Colaboradores</b><span id="nsUniCount">0</span></div>
      ${tabelaVazia('nsUniBody', ['Colaborador', 'Função/tipo', 'Cor', 'Tamanho', 'Un. (máx 2)', ''])}
    </div>
    <div class="ns-panel" data-ns-panel="epi" hidden>
      <p class="ns-aviso"><b>EPI por colaborador.</b> Informe o colaborador e o que será comprado para ele. Para outro colaborador, é só trocar o nome e continuar adicionando.</p>
      <div class="ns-add">
        <label class="ns-grow">Colaborador<div class="cot-colab-wrap"><input id="nsEpiColab" placeholder="Digite o nome do colaborador" autocomplete="off"><div class="cot-colab-sug" id="nsEpiSug"></div></div></label>
      </div>
      <div class="ns-add">
        <label class="ns-un">Un.<input id="nsEpiQtd" type="number" min="1" step="1" value="1" inputmode="numeric"></label>
        <label class="ns-grow">EPI<input id="nsEpiItem" list="nsEpiLista" placeholder="Ex.: capacete, colete, botina..." autocomplete="off"></label>
        <label>Tamanho/detalhe<input id="nsEpiTam" maxlength="60" placeholder="Opcional"></label>
        <button class="btn btn-secondary" id="nsEpiAdd" type="button">Adicionar EPI</button>
      </div>
      <datalist id="nsEpiLista">${epi.map((c) => `<option value="${esc(c.material)}"></option>`).join('')}</datalist>
      <div class="ns-lista-head"><b>EPIs do pedido</b><span id="nsEpiCount">0 itens</span></div>
      ${tabelaVazia('nsEpiBody', ['Un.', 'EPI', 'Tamanho/detalhe', ''])}
    </div>
    <div class="ns-panel" data-ns-panel="alojamento" hidden>
      <p class="ns-aviso"><b>Compras para alojamento.</b> Beliches, camas, enxoval, prateleiras e demais itens seguem para Hospedagem &gt; Alojamentos. Cidade e UF do alojamento são obrigatórias.</p>
      <div class="ns-add"><label class="ns-grow">Alojamento ou local de destino *<input id="nsAlojDestino" maxlength="140" placeholder="Ex.: Alojamento Rondonópolis Centro"></label></div>
      <div class="ns-add">
        <label class="ns-un">Un.<input id="nsAlojQtd" type="number" min="1" step="1" value="1" inputmode="numeric"></label>
        <label class="ns-grow">Item<select id="nsAlojItem"><option value="">Selecione</option>${aloj.map((c) => `<option value="${esc(c.material)}">${esc(c.material)}</option>`).join('')}<option value="OUTRO">Outro item...</option></select></label>
        <label id="nsAlojOutroWrap" hidden>Nome do item<input id="nsAlojOutro" maxlength="120" placeholder="Nome do item"></label>
        <label>Medida / especificação<input id="nsAlojDetalhe" maxlength="120" placeholder="Ex.: solteiro, 90 cm, cor branca"></label>
        <button class="btn btn-secondary" id="nsAlojAdd" type="button">Adicionar item</button>
      </div>
      <div class="ns-lista-head"><b>Itens do alojamento</b><span id="nsAlojCount">0 itens</span></div>
      ${tabelaVazia('nsAlojBody', ['Un.', 'Item', 'Especificação', ''])}
    </div>
  </section>
  <div class="adm-cmp-actions mt-16"><button class="btn btn-primary" id="nsSalvar" type="button">Criar solicitação</button><span class="adm-cmp-feedback" id="nsFeedback"></span></div>
  </div>`;
}

const contar = (n, un = ['item', 'itens']) => `${n} ${n === 1 ? un[0] : un[1]}`;

// ctx: { supabase, modal, catalogo, colaboradores, user, ufs, cidadesDaUf, icons, aoCriar }
export function abrirNovaSolicitacao(ctx) {
  const { supabase, modal, user = {}, ufs, cidadesDaUf, icons } = ctx;
  const catalogo = ctx.catalogo.filter((c) => c.ativo !== false);
  const colaboradores = dedupeColaboradores(ctx.colaboradores);
  const hoje = hojeLocal();
  const estado = { modo: 'itens', itens: [], uniformes: [], epiItens: [], alojItens: [] };
  const novoId = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`;

  modal.innerHTML = htmlBase({ catalogo, ufs, hoje });
  modal.classList.add('open');
  const $ = (id) => modal.querySelector(`#${id}`);
  const fb = (m, err = true) => { const el = $('nsFeedback'); el.textContent = m || ''; el.classList.toggle('err', err); };
  const btnRemover = (attr, valor) => `<button class="adm-cmp-icon-btn" ${attr}="${esc(valor)}" type="button" title="Remover" aria-label="Remover" data-row-action="recusar">${icons.x}</button>`;
  const vazio = (cols, txt) => `<tr><td colspan="${cols}" class="adm-cmp-empty">${txt}</td></tr>`;

  $('mClose').onclick = () => modal.classList.remove('open');

  // ── busca de colaborador (nome na equipe) ──
  const porChave = (k) => colaboradores.find((c) => chaveColaborador(c) === k);
  function ligarBusca(input, box, aoEscolher) {
    input.addEventListener('input', () => {
      delete input.dataset.colabId;
      const q = norm(input.value);
      if (q.length < 2) { box.innerHTML = ''; return; }
      const lista = colaboradores.filter((c) => norm(c.nome).includes(q)).slice(0, 8);
      box.innerHTML = lista.map((c) => `<button type="button" data-cid="${esc(chaveColaborador(c))}">${esc(c.nome)} <small>${esc(c.cargo || c.tipo || c.supervisao || '')}</small></button>`).join('') || '<button type="button" disabled>Nome não encontrado na equipe</button>';
      box.querySelectorAll('[data-cid]').forEach((b) => { b.onmousedown = (ev) => { ev.preventDefault(); const c = porChave(b.dataset.cid); if (!c) return; input.value = c.nome; input.dataset.colabId = b.dataset.cid; box.innerHTML = ''; aoEscolher?.(c); }; });
    });
    input.addEventListener('blur', () => setTimeout(() => { box.innerHTML = ''; }, 160));
  }
  const colabDoCampo = (input) => {
    const c = porChave(input.dataset.colabId || '');
    if (c) return c;
    const nome = input.value.trim();
    if (!nome) return null;
    return colaboradores.find((x) => norm(x.nome) === norm(nome)) || { id: null, nome };
  };

  // ── solicitante, UF/cidade, entrega ──
  const inpSol = $('nsSolicitante');
  ligarBusca(inpSol, $('nsSolicitanteSug'), (c) => { $('nsCoordenacao').value = c.coordenacao || c.supervisao || ''; });
  inpSol.addEventListener('change', () => { const c = colaboradores.find((x) => norm(x.nome) === norm(inpSol.value)); if (c) $('nsCoordenacao').value = c.coordenacao || c.supervisao || ''; });
  const solicitante = () => { const c = colabDoCampo(inpSol); return c?.id ? c : null; };
  $('nsUf').onchange = () => {
    const uf = $('nsUf').value;
    const sel = $('nsCidade');
    sel.disabled = !uf;
    sel.innerHTML = `<option value="">${uf ? 'Selecione' : 'Escolha a UF'}</option>${cidadesDaUf(uf).map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}`;
  };
  $('nsEntrega').onchange = () => { $('nsEntregaEndWrap').hidden = $('nsEntrega').value !== 'entrega'; if ($('nsEntrega').value === 'entrega') $('nsEntregaEnd').focus(); };

  // ── abas ──
  modal.querySelectorAll('[data-ns-modo]').forEach((b) => { b.onclick = () => {
    estado.modo = b.dataset.nsModo; fb('');
    modal.querySelectorAll('[data-ns-modo]').forEach((x) => x.classList.toggle('active', x === b));
    modal.querySelectorAll('[data-ns-panel]').forEach((p) => { p.hidden = p.dataset.nsPanel !== estado.modo; });
    $('nsEntregaBox').hidden = estado.modo === 'alojamento';
  }; });

  // ── Material ──
  const matInput = $('nsMatItem');
  const achaMaterial = (v) => catalogoMaterial(catalogo).find((c) => norm(c.material) === norm(v));
  function sincronizaMaterial() {
    const nome = achaMaterial(matInput.value)?.material || matInput.value;
    const precisa = precisaDetalhe(nome);
    $('nsMatTamWrap').hidden = !precisa;
    if (!precisa) $('nsMatTam').value = '';
    $('nsCelWrap').hidden = !ehCelular(nome);
  }
  matInput.addEventListener('input', sincronizaMaterial);
  ligarBusca($('nsCelColab'), $('nsCelSug'));
  $('nsCelMetodo').onchange = () => { $('nsCelParcWrap').hidden = $('nsCelMetodo').value !== 'parcelado'; };
  function renderMaterial() {
    $('nsMatCount').textContent = contar(estado.itens.length);
    $('nsMatBody').innerHTML = estado.itens.length ? estado.itens.map((i) => `<tr><td>${esc(i.quantidade)}</td><td>${esc(i.material)}${i.colaborador_nome ? `<br><small class="muted">${esc(i.colaborador_nome)} · ${i._metodo === 'parcelado' ? `${i._parcelas}x` : 'À vista'}</small>` : ''}</td><td>${esc(i.tamanho || '-')}</td><td>${btnRemover('data-del-mat', i._id)}</td></tr>`).join('') : vazio(4, 'Nenhum item adicionado.');
    $('nsMatBody').querySelectorAll('[data-del-mat]').forEach((b) => { b.onclick = () => { estado.itens = estado.itens.filter((i) => i._id !== b.dataset.delMat); renderMaterial(); }; });
  }
  function adicionarMaterial() {
    const raw = matInput.value.trim();
    if (!raw) return fb('Informe o material.');
    const outra = abaDoItem(catalogo, raw);
    if (outra) return fb(`${raw.toUpperCase()} é item de ${outra}. Use a aba ${outra}.`);
    const achado = achaMaterial(raw);
    const material = achado?.material || raw.toUpperCase();
    const tamanho = $('nsMatTam').value.trim() || null;
    if (achado && precisaDetalhe(material) && !tamanho) return fb('Informe o tamanho/detalhe antes de adicionar.');
    const qtd = Math.max(1, Math.floor(Number($('nsMatQtd').value || 1)));
    const item = { _id: novoId(), unidade: qtd, quantidade: qtd, material, tipo: achado?.tipo || 'Outros', tamanho };
    if (ehCelular(material)) {
      const colab = colabDoCampo($('nsCelColab'));
      if (!colab) return fb('Informe o colaborador que receberá o celular.');
      const parcelado = $('nsCelMetodo').value === 'parcelado';
      Object.assign(item, { tipo: 'Outros', colaborador_id: colab.id || null, colaborador_nome: colab.nome, _metodo: parcelado ? 'parcelado' : 'a_vista', _parcelas: parcelado ? Number($('nsCelParc').value || 2) : 1 });
      $('nsCelColab').value = ''; delete $('nsCelColab').dataset.colabId;
    }
    estado.itens.push(item);
    matInput.value = ''; $('nsMatQtd').value = 1; sincronizaMaterial(); fb('');
    renderMaterial(); matInput.focus();
  }
  $('nsMatAdd').onclick = adicionarMaterial;
  matInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); adicionarMaterial(); } });

  // ── Uniforme ──
  const uniInput = $('nsUniColab');
  ligarBusca(uniInput, $('nsUniSug'));
  function renderUniformes() {
    $('nsUniCount').textContent = contar(estado.uniformes.length, ['colaborador', 'colaboradores']);
    const opts = (lista, v) => lista.map((x) => `<option${x === v ? ' selected' : ''}>${x}</option>`).join('');
    $('nsUniBody').innerHTML = estado.uniformes.length ? estado.uniformes.map((u) => `<tr data-uni="${esc(u.key)}"><td><b>${esc(u.colab.nome)}</b></td><td>${esc(u.colab.cargo || u.colab.tipo || '-')}</td><td><select data-uni-cor>${opts(UNIFORME_CORES, u.cor)}</select></td><td><select data-uni-tam>${opts(UNIFORME_TAMANHOS, u.tam)}</select></td><td><input data-uni-qtd type="number" min="1" max="2" value="${u.qtd}"></td><td>${btnRemover('data-del-uni', u.key)}</td></tr>`).join('') : vazio(6, 'Nenhum colaborador adicionado.');
    $('nsUniBody').querySelectorAll('[data-del-uni]').forEach((b) => { b.onclick = () => { estado.uniformes = estado.uniformes.filter((u) => u.key !== b.dataset.delUni); renderUniformes(); }; });
  }
  $('nsUniBody').addEventListener('change', (ev) => {
    const tr = ev.target.closest('[data-uni]'); const u = tr && estado.uniformes.find((x) => x.key === tr.dataset.uni); if (!u) return;
    if (ev.target.matches('[data-uni-cor]')) u.cor = ev.target.value;
    if (ev.target.matches('[data-uni-tam]')) u.tam = ev.target.value;
    if (ev.target.matches('[data-uni-qtd]')) { u.qtd = Math.min(2, Math.max(1, Number(ev.target.value || 1))); ev.target.value = u.qtd; }
  });
  $('nsUniAdd').onclick = () => {
    const colab = colabDoCampo(uniInput);
    if (!colab?.id) return fb('Selecione um colaborador da equipe pelo nome antes de adicionar.');
    const key = chaveColaborador(colab);
    estado.uniformes = estado.uniformes.filter((u) => u.key !== key);
    estado.uniformes.push({ key, colab, cor: $('nsUniCor').value, tam: $('nsUniTam').value, qtd: 1 });
    uniInput.value = ''; delete uniInput.dataset.colabId; fb(''); renderUniformes();
  };
  $('nsUniTodos').onclick = () => {
    const sol = solicitante();
    if (!sol) return fb('Escolha o solicitante: os uniformes são da supervisão dele.');
    const base = colaboradoresDaSupervisao(colaboradores, sol);
    if (!base.length) return fb('Nenhum colaborador ativo encontrado para a supervisão do solicitante.');
    estado.uniformes = base.map((c) => ({ key: chaveColaborador(c), colab: c, cor: 'Verde', tam: 'M', qtd: 1 }));
    fb(`${base.length} colaborador(es) da supervisão adicionados.`, false); renderUniformes();
  };

  // ── EPI ──
  const epiColab = $('nsEpiColab');
  ligarBusca(epiColab, $('nsEpiSug'), () => $('nsEpiItem').focus());
  const achaEpi = (v) => catalogoDoTipo(catalogo, 'epi').find((c) => norm(c.material) === norm(v));
  $('nsEpiItem').addEventListener('input', () => { const f = achaEpi($('nsEpiItem').value); $('nsEpiTam').placeholder = f && precisaDetalhe(f.material) ? 'Tamanho (obrigatório)' : 'Opcional'; });
  function renderEpi() {
    $('nsEpiCount').textContent = contar(estado.epiItens.length);
    $('nsEpiBody').innerHTML = estado.epiItens.length ? agruparPorColaborador(estado.epiItens).map((g) => `<tr class="ns-grupo"><td colspan="4"><b>${esc(g.nome)}</b>${g.tipo ? `<small>${esc(g.tipo)}</small>` : ''}<span>${contar(g.itens.length, ['EPI', 'EPIs'])}</span></td></tr>${g.itens.map((i) => `<tr><td>${esc(i.quantidade)}</td><td>${esc(i.material)}</td><td>${esc(i.tamanho || '-')}</td><td>${btnRemover('data-del-epi', i._id)}</td></tr>`).join('')}`).join('') : vazio(4, 'Nenhum EPI adicionado. Informe o colaborador, escolha o EPI e clique em <b>Adicionar EPI</b>.');
    $('nsEpiBody').querySelectorAll('[data-del-epi]').forEach((b) => { b.onclick = () => { estado.epiItens = estado.epiItens.filter((i) => i._id !== b.dataset.delEpi); renderEpi(); }; });
  }
  function adicionarEpiAoPedido() {
    const colab = colabDoCampo(epiColab);
    if (!colab) return fb('Informe o colaborador antes de adicionar o EPI.');
    const raw = $('nsEpiItem').value.trim();
    if (!raw) return fb('Informe o EPI que será comprado para o colaborador.');
    const achado = achaEpi(raw);
    const tamanho = $('nsEpiTam').value.trim() || null;
    if (achado && precisaDetalhe(achado.material) && !tamanho) return fb('Informe o tamanho antes de adicionar.');
    const qtd = Math.max(1, Math.floor(Number($('nsEpiQtd').value || 1)));
    estado.epiItens = adicionarEpi(estado.epiItens, { _id: novoId(), unidade: qtd, quantidade: qtd, material: achado?.material || raw.toUpperCase(), tipo: 'EPI', tamanho, colaborador_id: colab.id || null, colaborador_nome: colab.nome, colaborador_tipo: colab.tipo || colab.cargo || '' });
    $('nsEpiItem').value = ''; $('nsEpiTam').value = ''; $('nsEpiQtd').value = 1; fb(''); renderEpi(); $('nsEpiItem').focus();
  }
  $('nsEpiAdd').onclick = adicionarEpiAoPedido;

  // ── Alojamento ──
  const syncOutro = () => { const outro = $('nsAlojItem').value === 'OUTRO'; $('nsAlojOutroWrap').hidden = !outro; if (!outro) $('nsAlojOutro').value = ''; };
  $('nsAlojItem').onchange = syncOutro;
  function renderAloj() {
    $('nsAlojCount').textContent = contar(estado.alojItens.length);
    $('nsAlojBody').innerHTML = estado.alojItens.length ? estado.alojItens.map((i) => `<tr><td>${esc(i.quantidade)}</td><td>${esc(i.material)}</td><td>${esc(i.tamanho || '—')}</td><td>${btnRemover('data-del-aloj', i._id)}</td></tr>`).join('') : vazio(4, 'Nenhum item de alojamento adicionado.');
    $('nsAlojBody').querySelectorAll('[data-del-aloj]').forEach((b) => { b.onclick = () => { estado.alojItens = estado.alojItens.filter((i) => i._id !== b.dataset.delAloj); renderAloj(); }; });
  }
  $('nsAlojAdd').onclick = () => {
    const sel = $('nsAlojItem').value;
    const material = (sel === 'OUTRO' ? $('nsAlojOutro').value : sel).trim();
    if (!material) return fb('Selecione ou informe o item de alojamento.');
    estado.alojItens.push({ _id: novoId(), ...itemAlojamento({ material, qtd: $('nsAlojQtd').value, detalhe: $('nsAlojDetalhe').value.trim() }) });
    $('nsAlojItem').value = ''; $('nsAlojQtd').value = 1; $('nsAlojDetalhe').value = ''; syncOutro(); fb(''); renderAloj();
  };

  // ── salvar ──
  function itensDoModo() {
    switch (estado.modo) {
      case 'itens':
        if (matInput.value.trim()) throw new Error('Há um material digitado que ainda não foi adicionado. Clique em "+ Adicionar à lista".');
        return estado.itens;
      case 'uniformes':
        if (uniInput.value.trim()) throw new Error('Há um colaborador digitado que ainda não foi adicionado.');
        return estado.uniformes.map((u) => itemUniforme({ colab: u.colab, cor: u.cor, tamanho: u.tam, qtd: u.qtd }));
      case 'epi':
        if ($('nsEpiItem').value.trim()) throw new Error('Há um EPI digitado que ainda não foi adicionado. Clique em "Adicionar EPI".');
        return estado.epiItens.map(itemEpiParaBanco);
      default:
        if ($('nsAlojItem').value) throw new Error('Há um item de alojamento selecionado que ainda não foi adicionado.');
        return estado.alojItens.map(({ _id, ...i }) => i);
    }
  }
  $('nsSalvar').onclick = async (ev) => {
    const btn = ev.currentTarget;
    const tipo = TIPOS.find((t) => t.modo === estado.modo);
    try {
      const itens = itensDoModo();
      if (!itens.length) throw new Error('Adicione pelo menos um item.');
      const sol = solicitante();
      if (!sol) throw new Error('Escolha o solicitante na lista da equipe (digite o nome e selecione).');
      const data = $('nsData').value || hoje;
      if (data < hoje) throw new Error('A data da solicitação não pode ser anterior à data atual.');
      const uf = $('nsUf').value || null;
      const cidade = $('nsCidade').value.trim() || null;
      const header = { data_solicitacao: data, solicitante_id: user.id || null, solicitante: sol.nome, coordenacao: $('nsCoordenacao').value.trim() || null, tipo_solicitacao: tipo.tipoSolicitacao, status: 'pendente', cidade, uf, created_by: user.id || null };
      if (estado.modo === 'alojamento') {
        const destino = $('nsAlojDestino').value.trim();
        if (!destino) throw new Error('Informe o alojamento ou local de destino.');
        if (!cidade || !uf) throw new Error('Informe a cidade e a UF do alojamento.');
        header.observacoes = observacoesAlojamento(destino);
      } else {
        Object.assign(header, entregaDoPedido($('nsEntrega').value, $('nsEntregaEnd').value));
      }
      btn.disabled = true; fb('Salvando...', false);
      const { data: sols, error } = await supabase.from('compras_solicitacoes').insert(header).select('id').single();
      if (error) throw error;
      const linhas = itens.map(({ _id, _metodo, _parcelas, ...i }) => ({ ...i, solicitacao_id: sols.id, status: 'pendente' }));
      const { data: inseridos, error: itemErr } = await supabase.from('compras_itens').insert(linhas).select('id');
      if (itemErr) { await supabase.from('compras_solicitacoes').delete().eq('id', sols.id); throw itemErr; }
      let aviso = '';
      if (estado.modo === 'itens') {
        const termos = itens.map((orig, idx) => ({ orig, ins: inseridos?.[idx] })).filter(({ orig, ins }) => ehCelular(orig.material) && ins)
          .map(({ orig, ins }) => ({ compra_item_id: ins.id, colaborador_id: orig.colaborador_id || null, colaborador_nome: orig.colaborador_nome || null, metodo_pagamento: orig._metodo || 'a_vista', parcelas: orig._parcelas || 1, status: 'aguardando_termo', created_at: new Date().toISOString() }));
        if (termos.length) { const { error: tErr } = await supabase.from('termos_celular').insert(termos); if (tErr) { console.warn(tErr); aviso = ' Atenção: não foi possível registrar o termo do celular.'; } }
      }
      modal.classList.remove('open');
      await ctx.aoCriar({ qtd: itens.length, rotulo: tipo.rotulo, aviso });
    } catch (e) { console.warn(e); fb(e.message || 'Não foi possível criar a solicitação.'); btn.disabled = false; }
  };

  renderMaterial(); renderUniformes(); renderEpi(); renderAloj();
}
