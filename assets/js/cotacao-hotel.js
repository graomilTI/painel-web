// Página pública de cotação (sem login): o hotel recebe o link da Hospedagem, informa as diárias e confirma.
// Fala só com a Edge Function hospedagem-cotacao-publica; o token do link (?t=) é a credencial.
import { CAPACIDADE_QUARTO, FORMAS_PAGAMENTO, TIPOS_QUARTO, estimarTotal, lerValor, soDigitos, tiposNecessarios } from './cotacaoHotelRegras.js';

const FUNCAO_URL = 'https://jbzmcyycanrlnfhedcup.supabase.co/functions/v1/hospedagem-cotacao-publica';
const token = new URLSearchParams(location.search).get('t') || '';
const raiz = document.getElementById('raiz');

const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const money = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brData = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
// Datas "AAAA-MM-DD" (sem hora) não podem passar por Date: o fuso mudaria o dia.
const brDia = (d) => String(d || '').split('-').reverse().join('/');
const GENERO = { MASC: 'masculino', FEM: 'feminino' };

const pedido = { quartos: [], diarias: 0 };
const form = {
  disponivel: null, precos: {}, sem_tipo: new Set(), cafe: null, almoco: null, janta: null, estacionamento: null, checkout: null, emite_nf: null,
  formas: new Set(), atendente_nome: '', atendente_telefone: '', observacoes: '',
};

function mascaraTelefone(v) {
  const d = soDigitos(v).slice(0, 11);
  return d.length > 10 ? d.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3') : d.replace(/^(\d{2})(\d{0,4})(\d{0,4}).*/, (_, a, b, c) => (b ? `(${a}) ${b}${c ? `-${c}` : ''}` : a));
}

function telaMensagem(icone, titulo, texto) {
  raiz.innerHTML = `<div class="centro"><div class="grande">${icone}</div><h2>${esc(titulo)}</h2><p class="muted">${esc(texto)}</p></div>`;
}

async function chamar(metodo, corpo) {
  const url = metodo === 'GET' ? `${FUNCAO_URL}?t=${encodeURIComponent(token)}` : FUNCAO_URL;
  const res = await fetch(url, {
    method: metodo,
    headers: metodo === 'GET' ? {} : { 'Content-Type': 'application/json' },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo),
  });
  const dados = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, dados };
}

const simNao = (nome, valor) => `
  <div class="opcoes">
    <label class="opcao"><input type="radio" name="${nome}" value="sim" ${valor === true ? 'checked' : ''}> Sim</label>
    <label class="opcao"><input type="radio" name="${nome}" value="nao" ${valor === false ? 'checked' : ''}> Não</label>
  </div>`;

// "2 × Duplo masculino" (cada quarto é cotado pela diária do quarto, não por pessoa).
function resumoQuartos() {
  return pedido.quartos.map((q) => `${q.quantidade} × ${TIPOS_QUARTO[q.tipo_quarto] || q.tipo_quarto} ${GENERO[q.genero] || ''}`.trim());
}

function pessoasPor(genero) {
  return pedido.quartos.filter((q) => q.genero === genero).reduce((s, q) => s + Number(q.quantidade || 0) * (CAPACIDADE_QUARTO[q.tipo_quarto] || Number(q.capacidade) || 0), 0);
}

function quartoHtml(tipo) {
  const necessarios = pedido.quartos.filter((q) => q.tipo_quarto === tipo);
  const qtd = necessarios.reduce((s, q) => s + Number(q.quantidade || 0), 0);
  const nao = form.sem_tipo.has(tipo);
  return `<div class="quarto${nao ? ' sem-valor' : ''}" data-tipo="${tipo}">
    <div class="nome"><strong>Quarto ${esc(TIPOS_QUARTO[tipo].toLowerCase())}</strong><small>${qtd} quarto(s) · até ${CAPACIDADE_QUARTO[tipo]} pessoa(s) por quarto</small></div>
    <div class="preco">
      <input type="text" inputmode="decimal" placeholder="R$ 0,00" aria-label="Diária do quarto ${esc(TIPOS_QUARTO[tipo].toLowerCase())}" data-preco value="${esc(form.precos[tipo] ?? '')}" ${nao ? 'disabled' : ''}>
      <span class="muted">por quarto, por diária</span>
      <label class="opcao"><input type="checkbox" data-nao ${nao ? 'checked' : ''}> Não possuo</label>
    </div>
  </div>`;
}

function renderForm(erro = '') {
  const tipos = tiposNecessarios(pedido.quartos);
  raiz.innerHTML = `
    <div class="msg erro" id="erroTopo" ${erro ? '' : 'hidden'}>${esc(erro)}</div>
    <section class="card">
      <div class="card-title">Pedido</div>
      <dl class="pedido">
        <div><dt>Cidade</dt><dd>${esc([pedido.cidade, pedido.uf].filter(Boolean).join('/')) || '—'}</dd></div>
        <div><dt>Pessoas</dt><dd>${pessoasPor('MASC') ? `${pessoasPor('MASC')} masc.` : ''}${pessoasPor('MASC') && pessoasPor('FEM') ? ' · ' : ''}${pessoasPor('FEM') ? `${pessoasPor('FEM')} fem.` : ''}</dd></div>
        <div><dt>Check-in</dt><dd>${esc(brDia(pedido.checkin))}</dd></div>
        <div><dt>Check-out</dt><dd>${esc(brDia(pedido.checkout))} (${esc(pedido.diarias)} diária${Number(pedido.diarias) === 1 ? '' : 's'})</dd></div>
        <div class="largo"><dt>Quartos necessários</dt><dd>${resumoQuartos().map(esc).join('<br>')}</dd></div>
        ${pedido.empresa ? `<div class="largo"><dt>Faturar para</dt><dd>${esc(pedido.empresa)}</dd></div>` : ''}
      </dl>
    </section>
    <section class="card" id="gDisp">
      <div class="card-title">Disponibilidade</div>
      <div class="grupo"><span class="rotulo">O hotel tem vaga para este pedido?</span>${simNao('disp', form.disponivel)}</div>
    </section>
    <div id="blocoSim" ${form.disponivel === true ? '' : 'hidden'}>
      <section class="card" id="gQuartos">
        <div class="card-title">Diárias</div>
        <p class="muted">Informe a diária de cada quarto. Se o hotel não tem o tipo, marque "Não possuo".</p>
        <div id="listaQuartos">${tipos.map(quartoHtml).join('')}</div>
        <div class="total" id="totalEstimado" hidden></div>
      </section>
      <section class="card" style="margin-top:16px">
        <div class="card-title">Incluso na diária</div>
        <div class="grupo" id="gCafe"><span class="rotulo">Café da manhã</span>${simNao('cafe', form.cafe)}</div>
        <div class="grupo" id="gAlmoco"><span class="rotulo">Almoço</span>${simNao('almoco', form.almoco)}</div>
        <div class="grupo" id="gJanta"><span class="rotulo">Janta</span>${simNao('janta', form.janta)}</div>
        <div class="grupo" id="gEstac"><span class="rotulo">Estacionamento</span>${simNao('estac', form.estacionamento)}</div>
      </section>
      <section class="card" style="margin-top:16px">
        <div class="card-title">Pagamento e nota fiscal</div>
        <div class="grupo" id="gCheckout"><span class="rotulo">Aceita pagamento no checkout?</span>${simNao('checkout', form.checkout)}</div>
        <div class="grupo" id="gNf"><span class="rotulo">Emite nota fiscal?</span>${simNao('nf', form.emite_nf)}</div>
        <div class="grupo" id="gFormas"><span class="rotulo">Formas de pagamento aceitas</span>
          <div class="opcoes">${FORMAS_PAGAMENTO.map((f) => `<label class="opcao"><input type="checkbox" data-forma="${esc(f)}" ${form.formas.has(f) ? 'checked' : ''}> ${esc(f)}</label>`).join('')}</div>
        </div>
      </section>
      <section class="card" style="margin-top:16px">
        <div class="card-title">Contato do hotel</div>
        <label class="campo" id="cAtendente">Nome do atendente<input type="text" id="atendente" autocomplete="name" maxlength="120" value="${esc(form.atendente_nome)}"></label>
        <label class="campo" id="cTelefone">Telefone/WhatsApp<input type="text" id="telefone" inputmode="tel" autocomplete="tel" placeholder="(00) 00000-0000" value="${esc(mascaraTelefone(form.atendente_telefone))}"></label>
      </section>
    </div>
    <section class="card" id="cardObs">
      <label class="campo">Observações (opcional)<textarea id="obs" maxlength="500" placeholder="Ex.: vagas só a partir das 14h, política de cancelamento…">${esc(form.observacoes)}</textarea></label>
    </section>
    <div class="isca" aria-hidden="true"><label>Não preencha<input type="text" id="website" tabindex="-1" autocomplete="off"></label></div>
    <div class="acoes"><button class="btn btn-primary" id="btnEnviar" type="button">✔ Enviar cotação</button></div>`;
  atualizarTotal();
  ligarEventos();
}

function precosParaEstimar() {
  const out = {};
  for (const tipo of tiposNecessarios(pedido.quartos)) {
    const v = lerValor(form.precos[tipo]);
    if (!form.sem_tipo.has(tipo) && Number.isFinite(v) && v > 0) out[tipo] = v;
  }
  return out;
}

function atualizarTotal() {
  const box = raiz.querySelector('#totalEstimado');
  if (!box) return;
  const est = estimarTotal(pedido.quartos, precosParaEstimar(), pedido.diarias);
  if (!est.completo) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `Total estimado para ${esc(pedido.diarias)} diária(s): <strong>${money(est.total)}</strong> <span class="muted">(${money(est.porNoite)} por noite)</span>`;
}

function marcarOpcoes(nome, setter) {
  raiz.querySelectorAll(`input[name=${nome}]`).forEach((r) => r.addEventListener('change', () => setter(r.value === 'sim')));
}

function ligarEventos() {
  const q = (s) => raiz.querySelector(s);
  raiz.querySelectorAll('input[name=disp]').forEach((r) => r.addEventListener('change', () => {
    form.disponivel = r.value === 'sim';
    q('#blocoSim').hidden = !form.disponivel;
  }));
  marcarOpcoes('cafe', (v) => { form.cafe = v; });
  marcarOpcoes('almoco', (v) => { form.almoco = v; });
  marcarOpcoes('janta', (v) => { form.janta = v; });
  marcarOpcoes('estac', (v) => { form.estacionamento = v; });
  marcarOpcoes('checkout', (v) => { form.checkout = v; });
  marcarOpcoes('nf', (v) => { form.emite_nf = v; });
  raiz.querySelectorAll('[data-forma]').forEach((c) => c.addEventListener('change', () => { c.checked ? form.formas.add(c.dataset.forma) : form.formas.delete(c.dataset.forma); }));
  q('#atendente').addEventListener('input', (e) => { form.atendente_nome = e.target.value; });
  q('#telefone').addEventListener('input', (e) => { form.atendente_telefone = soDigitos(e.target.value).slice(0, 11); e.target.value = mascaraTelefone(form.atendente_telefone); });
  q('#obs').addEventListener('input', (e) => { form.observacoes = e.target.value; });
  raiz.querySelectorAll('.quarto').forEach((el) => {
    const tipo = el.dataset.tipo;
    el.querySelector('[data-preco]').addEventListener('input', (e) => { form.precos[tipo] = e.target.value; el.classList.remove('erro'); atualizarTotal(); });
    el.querySelector('[data-nao]').addEventListener('change', (e) => {
      e.target.checked ? form.sem_tipo.add(tipo) : form.sem_tipo.delete(tipo);
      const inp = el.querySelector('[data-preco]');
      inp.disabled = e.target.checked;
      if (e.target.checked) { inp.value = ''; form.precos[tipo] = ''; }
      el.classList.toggle('sem-valor', e.target.checked);
      atualizarTotal();
    });
  });
  q('#btnEnviar').addEventListener('click', enviar);
}

function marcarErro(sel, msg) {
  raiz.querySelectorAll('.erro').forEach((e) => e.classList.remove('erro'));
  const el = raiz.querySelector(sel);
  el?.classList.add('erro');
  const topo = raiz.querySelector('#erroTopo');
  topo.textContent = msg; topo.hidden = false;
  (el || topo).scrollIntoView({ behavior: 'smooth', block: 'center' });
  return false;
}

function validar() {
  if (form.disponivel === null) return marcarErro('#gDisp', 'Informe se o hotel tem vaga para este pedido.');
  if (!form.disponivel) return true;
  const tipos = tiposNecessarios(pedido.quartos);
  for (const tipo of tipos) {
    const v = lerValor(form.precos[tipo]);
    if (!form.sem_tipo.has(tipo) && !(Number.isFinite(v) && v > 0)) return marcarErro(`.quarto[data-tipo="${tipo}"]`, `Informe a diária do quarto ${TIPOS_QUARTO[tipo].toLowerCase()} ou marque "Não possuo".`);
  }
  if (tipos.every((t) => form.sem_tipo.has(t))) return marcarErro('#gQuartos', 'Todos os quartos estão como "Não possuo"; escolha "Não" em disponibilidade.');
  if (form.cafe === null) return marcarErro('#gCafe', 'Informe se o café da manhã está incluso.');
  if (form.almoco === null) return marcarErro('#gAlmoco', 'Informe se o almoço está incluso.');
  if (form.janta === null) return marcarErro('#gJanta', 'Informe se a janta está inclusa.');
  if (form.estacionamento === null) return marcarErro('#gEstac', 'Informe se o estacionamento está incluso.');
  if (form.checkout === null) return marcarErro('#gCheckout', 'Informe se aceita pagamento no checkout.');
  if (form.emite_nf === null) return marcarErro('#gNf', 'Informe se o hotel emite nota fiscal.');
  if (!form.formas.size) return marcarErro('#gFormas', 'Selecione ao menos uma forma de pagamento.');
  if (form.atendente_nome.trim().length < 2) return marcarErro('#cAtendente', 'Informe o nome do atendente.');
  if (form.atendente_telefone.length < 10) return marcarErro('#cTelefone', 'Informe o telefone/WhatsApp com DDD.');
  return true;
}

function corpoEnvio() {
  const base = { t: token, disponivel: form.disponivel, observacoes: form.observacoes, website: raiz.querySelector('#website')?.value || '' };
  if (!form.disponivel) return base;
  const precos = {};
  for (const tipo of tiposNecessarios(pedido.quartos)) precos[tipo] = form.sem_tipo.has(tipo) ? null : form.precos[tipo];
  return {
    ...base,
    precos,
    sem_tipo: [...form.sem_tipo],
    cafe_incluso: form.cafe, almoco_incluso: form.almoco, janta_inclusa: form.janta, estacionamento_incluso: form.estacionamento,
    aceita_pagamento_checkout: form.checkout, emite_nf: form.emite_nf, formas_pagamento: [...form.formas],
    atendente_nome: form.atendente_nome, atendente_telefone: form.atendente_telefone,
  };
}

async function enviar() {
  if (!validar()) return;
  const btn = raiz.querySelector('#btnEnviar');
  btn.disabled = true; btn.textContent = 'Enviando…';
  try {
    const { ok, dados } = await chamar('POST', corpoEnvio());
    if (!ok) throw new Error(dados.erro || 'Não foi possível enviar agora.');
    telaMensagem('✅', 'Cotação enviada', dados.atualizada ? 'Sua resposta anterior foi atualizada. Obrigado!' : 'Recebemos sua cotação. Obrigado!');
  } catch (e) {
    btn.disabled = false; btn.textContent = '✔ Enviar cotação';
    const topo = raiz.querySelector('#erroTopo');
    topo.textContent = e.message || 'Falha de conexão. Tente novamente.'; topo.hidden = false;
    topo.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// Se o hotel já respondeu, o formulário volta preenchido para ele corrigir e reenviar.
function aplicarRespostaAnterior(r) {
  if (!r) return;
  form.disponivel = r.disponivel;
  for (const [tipo, valor] of Object.entries(r.precos || {})) {
    if (valor === null) form.sem_tipo.add(tipo);
    else form.precos[tipo] = String(valor).replace('.', ',');
  }
  form.cafe = r.cafe_incluso; form.almoco = r.almoco_incluso; form.janta = r.janta_inclusa; form.estacionamento = r.estacionamento_incluso;
  form.checkout = r.aceita_pagamento_checkout; form.emite_nf = r.emite_nf;
  form.formas = new Set(r.formas_pagamento || []);
  form.atendente_nome = r.atendente_nome || ''; form.atendente_telefone = r.atendente_telefone || ''; form.observacoes = r.observacoes || '';
}

(async function iniciar() {
  if (!token) { telaMensagem('🔗', 'Link inválido', 'Peça um novo link ao setor de Hospedagem.'); return; }
  try {
    const { ok, dados } = await chamar('GET');
    if (!ok) { telaMensagem('⛔', 'Cotação indisponível', dados.erro || 'Peça um novo link ao setor de Hospedagem.'); return; }
    Object.assign(pedido, { cidade: dados.cidade, uf: dados.uf, empresa: dados.empresa, checkin: dados.checkin, checkout: dados.checkout, diarias: Number(dados.diarias) || 0, quartos: dados.quartos || [] });
    document.getElementById('titulo').textContent = dados.hotel_nome || 'Cotação de hospedagem';
    document.getElementById('validade').textContent = `Responder até ${brData(dados.expira_em)}`;
    aplicarRespostaAnterior(dados.resposta_anterior);
    renderForm();
  } catch {
    telaMensagem('⚠️', 'Sem conexão', 'Não foi possível carregar a cotação. Tente novamente em instantes.');
  }
})();
