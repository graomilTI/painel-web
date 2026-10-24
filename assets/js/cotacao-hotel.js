// Página pública de cotação (sem login): o hotel recebe o link da Hospedagem, informa empresa, endereço, diárias e o que está incluso.
// Fala só com a Edge Function hospedagem-cotacao-publica; o token do link (?t=) é a credencial.
import {
  CAPACIDADE_QUARTO, EXTRAS_OUTROS, FORMAS_PAGAMENTO, REGIMES, TIPOS_QUARTO, UFS, cnpjValido, estimarTotal, lerValor, soDigitos, tiposNecessarios,
} from './cotacaoHotelRegras.js?v=20261024-cotacao-hotel2';

const FUNCAO_URL = 'https://jbzmcyycanrlnfhedcup.supabase.co/functions/v1/hospedagem-cotacao-publica';
const token = new URLSearchParams(location.search).get('t') || '';
const raiz = document.getElementById('raiz');

const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const money = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brData = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
// Datas "AAAA-MM-DD" (sem hora) não podem passar por Date: o fuso mudaria o dia.
const brDia = (d) => String(d || '').split('-').reverse().join('/');
const GENERO = { MASC: 'masculino', FEM: 'feminino' };
// Café, almoço, janta e estacionamento têm coluna própria no banco; os demais vêm de EXTRAS_OUTROS.
const EXTRAS_BASE = { cafe: 'Café da manhã', almoco: 'Almoço', janta: 'Janta', estacionamento: 'Estacionamento' };

const pedido = { quartos: [], diarias: 0 };
const form = {
  disponivel: null, cnpj: '', razao_social: '', regime: '', emite_nf: null, atendente_nome: '', atendente_telefone: '',
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
  precos: {}, sem_tipo: new Set(), extras: new Set(), extras_texto: '', checkout: null, formas: new Set(), observacoes: '',
};
// Campo do formulário → seletor na tela (para preencher sozinho pelo CNPJ e pelo CEP).
const CAMPOS_TELA = {
  razao_social: '#razao', regime: '#regime', cep: '#cep', logradouro: '#logradouro', numero: '#numero', complemento: '#complemento', bairro: '#bairro', cidade: '#cidade', uf: '#uf',
};

function mascaraTelefone(v) {
  const d = soDigitos(v).slice(0, 11);
  return d.length > 10 ? d.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3') : d.replace(/^(\d{2})(\d{0,4})(\d{0,4}).*/, (_, a, b, c) => (b ? `(${a}) ${b}${c ? `-${c}` : ''}` : a));
}

function mascaraCnpj(v) {
  const d = soDigitos(v).slice(0, 14);
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
}

const mascaraCep = (v) => soDigitos(v).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');

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

// Os quatro tipos aparecem sempre. Os que o pedido usa são obrigatórios (diária ou "Não possuo"); os outros são opcionais.
function quartoHtml(tipo) {
  const qtd = pedido.quartos.filter((q) => q.tipo_quarto === tipo).reduce((s, q) => s + Number(q.quantidade || 0), 0);
  const usado = qtd > 0;
  const nao = usado && form.sem_tipo.has(tipo);
  return `<div class="quarto${nao ? ' sem-valor' : ''}" data-tipo="${tipo}" data-usado="${usado ? '1' : '0'}">
    <div class="nome"><strong>Quarto ${esc(TIPOS_QUARTO[tipo].toLowerCase())}</strong><small>${usado ? `${qtd} quarto(s) neste pedido` : 'Não usado neste pedido · opcional'} · até ${CAPACIDADE_QUARTO[tipo]} pessoa(s) por quarto</small></div>
    <div class="preco">
      <input type="text" inputmode="decimal" placeholder="R$ 0,00" aria-label="Diária do quarto ${esc(TIPOS_QUARTO[tipo].toLowerCase())}" data-preco value="${esc(form.precos[tipo] ?? '')}" ${nao ? 'disabled' : ''}>
      <span class="muted">por quarto, por diária</span>
      ${usado ? `<label class="opcao"><input type="checkbox" data-nao ${nao ? 'checked' : ''}> Não possuo</label>` : ''}
    </div>
  </div>`;
}

const extraHtml = (chave, rotulo) => `<label class="opcao"><input type="checkbox" data-extra="${esc(chave)}" ${form.extras.has(chave) ? 'checked' : ''}> ${esc(rotulo)}</label>`;

function renderForm(erro = '') {
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
      <section class="card">
        <div class="card-title">Dados da empresa</div>
        <label class="campo" id="cCnpj">CNPJ<input type="text" id="cnpj" inputmode="numeric" autocomplete="off" placeholder="00.000.000/0000-00" value="${esc(mascaraCnpj(form.cnpj))}"></label>
        <small class="muted" id="dicaCnpj" hidden></small>
        <label class="campo" id="cRazao">Razão Social<input type="text" id="razao" autocomplete="organization" maxlength="200" value="${esc(form.razao_social)}"></label>
        <label class="campo" id="cRegime">Regime tributário
          <select id="regime"><option value="">Selecione…</option>${Object.entries(REGIMES).map(([v, n]) => `<option value="${v}" ${form.regime === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
        </label>
        <div class="grupo" id="gNf"><span class="rotulo">Emite nota fiscal?</span>${simNao('nf', form.emite_nf)}</div>
        <label class="campo" id="cAtendente">Nome do atendente<input type="text" id="atendente" autocomplete="name" maxlength="120" value="${esc(form.atendente_nome)}"></label>
        <label class="campo" id="cTelefone">Telefone/WhatsApp<input type="text" id="telefone" inputmode="tel" autocomplete="tel" placeholder="(00) 00000-0000" value="${esc(mascaraTelefone(form.atendente_telefone))}"></label>
      </section>
      <section class="card" style="margin-top:16px" id="gEndereco">
        <div class="card-title">Endereço do hotel</div>
        <label class="campo" id="cCep">CEP<input type="text" id="cep" inputmode="numeric" autocomplete="postal-code" placeholder="00000-000" value="${esc(mascaraCep(form.cep))}"></label>
        <small class="muted" id="dicaCep" hidden></small>
        <label class="campo" id="cLogradouro">Rua / avenida<input type="text" id="logradouro" autocomplete="address-line1" maxlength="160" value="${esc(form.logradouro)}"></label>
        <div class="duo">
          <label class="campo" id="cNumero">Número<input type="text" id="numero" maxlength="20" placeholder="S/N se não tiver" value="${esc(form.numero)}"></label>
          <label class="campo" id="cComplemento">Complemento (opcional)<input type="text" id="complemento" maxlength="80" value="${esc(form.complemento)}"></label>
        </div>
        <label class="campo" id="cBairro">Bairro<input type="text" id="bairro" maxlength="80" value="${esc(form.bairro)}"></label>
        <div class="duo duo-uf">
          <label class="campo" id="cCidade">Cidade<input type="text" id="cidade" maxlength="80" value="${esc(form.cidade)}"></label>
          <label class="campo" id="cUf">UF
            <select id="uf"><option value="">—</option>${UFS.map((u) => `<option ${form.uf === u ? 'selected' : ''}>${u}</option>`).join('')}</select>
          </label>
        </div>
      </section>
      <section class="card" id="gQuartos" style="margin-top:16px">
        <div class="card-title">Cotação das diárias</div>
        <p class="muted">Informe a diária de cada tipo de quarto. Nos tipos deste pedido, se o hotel não tem, marque "Não possuo"; os demais são opcionais.</p>
        <div id="listaQuartos">${Object.keys(TIPOS_QUARTO).map(quartoHtml).join('')}</div>
        <div class="total" id="totalEstimado" hidden></div>
      </section>
      <section class="card" style="margin-top:16px">
        <div class="card-title">Extras inclusos na diária</div>
        <p class="muted">Marque tudo o que já está incluso no valor da diária.</p>
        <div class="opcoes" id="gExtras">${Object.entries(EXTRAS_BASE).map(([k, n]) => extraHtml(k, n)).join('')}${Object.entries(EXTRAS_OUTROS).map(([k, n]) => extraHtml(k, n)).join('')}</div>
        <label class="campo">Outros itens inclusos (opcional)<input type="text" id="extrasTexto" maxlength="120" placeholder="Ex.: transfer, tomada USB, cozinha compartilhada" value="${esc(form.extras_texto)}"></label>
      </section>
      <section class="card" style="margin-top:16px">
        <div class="card-title">Pagamento</div>
        <div class="grupo" id="gCheckout"><span class="rotulo">Aceita pagamento no checkout?</span>${simNao('checkout', form.checkout)}</div>
        <div class="grupo" id="gFormas"><span class="rotulo">Formas de pagamento aceitas</span>
          <div class="opcoes">${FORMAS_PAGAMENTO.map((f) => `<label class="opcao"><input type="checkbox" data-forma="${esc(f)}" ${form.formas.has(f) ? 'checked' : ''}> ${esc(f)}</label>`).join('')}</div>
        </div>
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

// ─── Preenchimento automático (CNPJ e CEP): nunca sobrescreve o que o hotel já digitou ─────────────────────────────
const preenchidoAuto = {};

function aplicarAuto(campo, valor) {
  const v = String(valor ?? '').trim();
  if (!v) return;
  if (form[campo] && form[campo] !== preenchidoAuto[campo]) return;
  form[campo] = v;
  preenchidoAuto[campo] = v;
  const el = raiz.querySelector(CAMPOS_TELA[campo]);
  if (el) el.value = campo === 'cep' ? mascaraCep(v) : v;
}

async function consultar(url) {
  try {
    const res = await fetch(url);
    return res.ok ? await res.json() : null;
  } catch {
    return null; // sem consulta: segue manual
  }
}

let ultimoCnpj = '';
async function preencherPeloCnpj() {
  if (!cnpjValido(form.cnpj) || form.cnpj === ultimoCnpj) return;
  const cnpj = form.cnpj;
  ultimoCnpj = cnpj;
  const d = await consultar(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
  if (!d || cnpj !== form.cnpj) return;
  aplicarAuto('razao_social', d.razao_social);
  aplicarAuto('cep', soDigitos(d.cep));
  aplicarAuto('logradouro', [d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(' '));
  aplicarAuto('numero', d.numero);
  aplicarAuto('complemento', d.complemento);
  aplicarAuto('bairro', d.bairro);
  aplicarAuto('cidade', d.municipio);
  aplicarAuto('uf', d.uf);
  const dica = raiz.querySelector('#dicaCnpj');
  if (dica && d.razao_social) { dica.textContent = 'Razão social e endereço preenchidos pela Receita. Confira se estão corretos.'; dica.hidden = false; }
}

let ultimoCep = '';
async function preencherPeloCep() {
  if (form.cep.length !== 8 || form.cep === ultimoCep) return;
  const cep = form.cep;
  ultimoCep = cep;
  const d = await consultar(`https://brasilapi.com.br/api/cep/v1/${cep}`);
  if (!d || cep !== form.cep) return;
  aplicarAuto('logradouro', d.street);
  aplicarAuto('bairro', d.neighborhood);
  aplicarAuto('cidade', d.city);
  aplicarAuto('uf', d.state);
  const dica = raiz.querySelector('#dicaCep');
  if (dica && d.street) { dica.textContent = 'Endereço preenchido pelo CEP. Informe o número e confira o restante.'; dica.hidden = false; }
}

function ligarEventos() {
  const q = (s) => raiz.querySelector(s);
  raiz.querySelectorAll('input[name=disp]').forEach((r) => r.addEventListener('change', () => {
    form.disponivel = r.value === 'sim';
    q('#blocoSim').hidden = !form.disponivel;
  }));
  marcarOpcoes('checkout', (v) => { form.checkout = v; });
  marcarOpcoes('nf', (v) => { form.emite_nf = v; });
  raiz.querySelectorAll('[data-forma]').forEach((c) => c.addEventListener('change', () => { c.checked ? form.formas.add(c.dataset.forma) : form.formas.delete(c.dataset.forma); }));
  raiz.querySelectorAll('[data-extra]').forEach((c) => c.addEventListener('change', () => { c.checked ? form.extras.add(c.dataset.extra) : form.extras.delete(c.dataset.extra); }));
  q('#extrasTexto').addEventListener('input', (e) => { form.extras_texto = e.target.value; });

  q('#cnpj').addEventListener('input', (e) => { form.cnpj = soDigitos(e.target.value).slice(0, 14); e.target.value = mascaraCnpj(form.cnpj); preencherPeloCnpj(); });
  q('#razao').addEventListener('input', (e) => { form.razao_social = e.target.value; });
  q('#regime').addEventListener('change', (e) => { form.regime = e.target.value; });
  q('#atendente').addEventListener('input', (e) => { form.atendente_nome = e.target.value; });
  q('#telefone').addEventListener('input', (e) => { form.atendente_telefone = soDigitos(e.target.value).slice(0, 11); e.target.value = mascaraTelefone(form.atendente_telefone); });
  q('#cep').addEventListener('input', (e) => { form.cep = soDigitos(e.target.value).slice(0, 8); e.target.value = mascaraCep(form.cep); preencherPeloCep(); });
  for (const campo of ['logradouro', 'numero', 'complemento', 'bairro', 'cidade']) q(`#${campo}`).addEventListener('input', (e) => { form[campo] = e.target.value; });
  q('#uf').addEventListener('change', (e) => { form.uf = e.target.value; });
  q('#obs').addEventListener('input', (e) => { form.observacoes = e.target.value; });

  raiz.querySelectorAll('.quarto').forEach((el) => {
    const tipo = el.dataset.tipo;
    el.querySelector('[data-preco]').addEventListener('input', (e) => { form.precos[tipo] = e.target.value; el.classList.remove('erro'); atualizarTotal(); });
    el.querySelector('[data-nao]')?.addEventListener('change', (e) => {
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
  if (!cnpjValido(form.cnpj)) return marcarErro('#cCnpj', 'Informe um CNPJ válido.');
  if (form.razao_social.trim().length < 3) return marcarErro('#cRazao', 'Informe a razão social.');
  if (!form.regime) return marcarErro('#cRegime', 'Selecione o regime tributário.');
  if (form.emite_nf === null) return marcarErro('#gNf', 'Informe se o hotel emite nota fiscal.');
  if (form.atendente_nome.trim().length < 2) return marcarErro('#cAtendente', 'Informe o nome do atendente.');
  if (form.atendente_telefone.length < 10) return marcarErro('#cTelefone', 'Informe o telefone/WhatsApp com DDD.');
  if (form.cep.length !== 8) return marcarErro('#cCep', 'Informe o CEP do hotel.');
  if (form.logradouro.trim().length < 3) return marcarErro('#cLogradouro', 'Informe a rua/avenida do hotel.');
  if (!form.numero.trim()) return marcarErro('#cNumero', 'Informe o número (ou S/N).');
  if (form.bairro.trim().length < 2) return marcarErro('#cBairro', 'Informe o bairro do hotel.');
  if (form.cidade.trim().length < 2) return marcarErro('#cCidade', 'Informe a cidade do hotel.');
  if (!form.uf) return marcarErro('#cUf', 'Informe a UF do hotel.');
  const usados = tiposNecessarios(pedido.quartos);
  for (const tipo of Object.keys(TIPOS_QUARTO)) {
    const texto = String(form.precos[tipo] ?? '').trim();
    const v = lerValor(texto);
    if (usados.includes(tipo)) {
      if (!form.sem_tipo.has(tipo) && !(Number.isFinite(v) && v > 0)) return marcarErro(`.quarto[data-tipo="${tipo}"]`, `Informe a diária do quarto ${TIPOS_QUARTO[tipo].toLowerCase()} ou marque "Não possuo".`);
    } else if (texto && !(Number.isFinite(v) && v > 0)) {
      return marcarErro(`.quarto[data-tipo="${tipo}"]`, `Diária inválida para o quarto ${TIPOS_QUARTO[tipo].toLowerCase()}.`);
    }
  }
  if (usados.every((t) => form.sem_tipo.has(t))) return marcarErro('#gQuartos', 'Todos os quartos pedidos estão como "Não possuo"; escolha "Não" em disponibilidade.');
  if (form.checkout === null) return marcarErro('#gCheckout', 'Informe se aceita pagamento no checkout.');
  if (!form.formas.size) return marcarErro('#gFormas', 'Selecione ao menos uma forma de pagamento.');
  return true;
}

function corpoEnvio() {
  const base = { t: token, disponivel: form.disponivel, observacoes: form.observacoes, website: raiz.querySelector('#website')?.value || '' };
  if (!form.disponivel) return base;
  const precos = {};
  for (const tipo of Object.keys(TIPOS_QUARTO)) precos[tipo] = form.sem_tipo.has(tipo) ? null : form.precos[tipo];
  return {
    ...base,
    cnpj: form.cnpj, razao_social: form.razao_social, regime_tributario: form.regime, emite_nf: form.emite_nf,
    atendente_nome: form.atendente_nome, atendente_telefone: form.atendente_telefone,
    endereco: { cep: form.cep, logradouro: form.logradouro, numero: form.numero, complemento: form.complemento, bairro: form.bairro, cidade: form.cidade, uf: form.uf },
    precos,
    sem_tipo: [...form.sem_tipo],
    cafe_incluso: form.extras.has('cafe'), almoco_incluso: form.extras.has('almoco'), janta_inclusa: form.extras.has('janta'), estacionamento_incluso: form.extras.has('estacionamento'),
    extras_outros: [...form.extras].filter((k) => Object.hasOwn(EXTRAS_OUTROS, k)), extras_outros_texto: form.extras_texto,
    aceita_pagamento_checkout: form.checkout, formas_pagamento: [...form.formas],
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

function aplicarEndereco(e) {
  if (!e) return;
  for (const campo of ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf']) form[campo] = e[campo] ?? '';
}

// Cadastro do hotel (ou resposta de uma cotação anterior): o formulário abre com os dados da empresa e do endereço preenchidos.
function aplicarCadastro(c) {
  if (!c) return;
  form.cnpj = soDigitos(c.cnpj);
  form.razao_social = c.razao_social || '';
  form.regime = c.regime_tributario || '';
  form.emite_nf = typeof c.emite_nf === 'boolean' ? c.emite_nf : null;
  form.atendente_nome = c.atendente_nome || '';
  form.atendente_telefone = c.atendente_telefone || '';
  aplicarEndereco(c.endereco);
}

// Se o hotel já respondeu este link, o formulário volta preenchido para ele corrigir e reenviar.
function aplicarRespostaAnterior(r) {
  if (!r) return;
  form.disponivel = r.disponivel;
  for (const [tipo, valor] of Object.entries(r.precos || {})) {
    if (valor === null) form.sem_tipo.add(tipo);
    else form.precos[tipo] = String(valor).replace('.', ',');
  }
  if (r.cafe_incluso) form.extras.add('cafe');
  if (r.almoco_incluso) form.extras.add('almoco');
  if (r.janta_inclusa) form.extras.add('janta');
  if (r.estacionamento_incluso) form.extras.add('estacionamento');
  (r.extras_outros || []).forEach((k) => form.extras.add(k));
  form.extras_texto = r.extras_outros_texto || '';
  form.checkout = r.aceita_pagamento_checkout;
  form.formas = new Set(r.formas_pagamento || []);
  form.observacoes = r.observacoes || '';
  if (r.empresa) {
    form.cnpj = soDigitos(r.empresa.cnpj); form.razao_social = r.empresa.razao_social || ''; form.regime = r.empresa.regime_tributario || '';
  }
  if (typeof r.emite_nf === 'boolean') form.emite_nf = r.emite_nf;
  form.atendente_nome = r.atendente_nome || form.atendente_nome; form.atendente_telefone = r.atendente_telefone || form.atendente_telefone;
  aplicarEndereco(r.endereco);
}

(async function iniciar() {
  if (!token) { telaMensagem('🔗', 'Link inválido', 'Peça um novo link ao setor de Hospedagem.'); return; }
  try {
    const { ok, dados } = await chamar('GET');
    if (!ok) { telaMensagem('⛔', 'Cotação indisponível', dados.erro || 'Peça um novo link ao setor de Hospedagem.'); return; }
    Object.assign(pedido, { cidade: dados.cidade, uf: dados.uf, empresa: dados.empresa, checkin: dados.checkin, checkout: dados.checkout, diarias: Number(dados.diarias) || 0, quartos: dados.quartos || [] });
    document.getElementById('titulo').textContent = dados.hotel_nome || 'Cotação de hospedagem';
    document.getElementById('validade').textContent = `Responder até ${brData(dados.expira_em)}`;
    aplicarCadastro(dados.cadastro);
    aplicarRespostaAnterior(dados.resposta_anterior);
    renderForm();
  } catch {
    telaMensagem('⚠️', 'Sem conexão', 'Não foi possível carregar a cotação. Tente novamente em instantes.');
  }
})();
