// Página pública de cotação (sem login): o fornecedor recebe o link de Compras, preenche e confirma.
// Fala só com a Edge Function compras-cotacao-publica; o token do link (?t=) é a credencial.
import { FORMAS_PAGAMENTO, cnpjValido, lerValor, soDigitos } from './cotacaoFornecedorRegras.js';

const FUNCAO_URL = 'https://jbzmcyycanrlnfhedcup.supabase.co/functions/v1/compras-cotacao-publica';
const token = new URLSearchParams(location.search).get('t') || '';
const raiz = document.getElementById('raiz');

const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const money = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brData = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

const form = {
  cnpj: '', razao_social: '', emite_nf: null, prazo_entrega: '', frete_pagador: null, frete_valor: '', formas: new Set(), tem_desconto: null,
  descontos: [], itens: [], // itens: { id, un, material, detalhe, valor, nao_possuo }
};

function mascaraCnpj(v) {
  const d = soDigitos(v).slice(0, 14);
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
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

// ─── Formulário ────────────────────────────────────────────────────────────────
function itemHtml(it, i) {
  return `<div class="item${it.nao_possuo ? ' sem-valor' : ''}" data-i="${i}">
    <div class="un">${esc(it.un)}</div>
    <div class="mat"><strong>${esc(it.material)}</strong>${it.detalhe ? `<small>${esc(it.detalhe)}</small>` : ''}</div>
    <div class="preco">
      <input type="text" inputmode="decimal" placeholder="R$ 0,00" aria-label="Valor unitário de ${esc(it.material)}" data-valor value="${esc(it.valor)}" ${it.nao_possuo ? 'disabled' : ''}>
      <label class="opcao"><input type="checkbox" data-nao ${it.nao_possuo ? 'checked' : ''}> Não possuo</label>
      <span class="total" data-total></span>
    </div>
  </div>`;
}

function renderForm(erro = '') {
  raiz.innerHTML = `
    <div class="msg erro" id="erroTopo" ${erro ? '' : 'hidden'}>${esc(erro)}</div>
    <section class="card">
      <div class="card-title">Dados da empresa</div>
      <label class="campo" id="cCnpj">CNPJ<input type="text" id="cnpj" inputmode="numeric" autocomplete="off" placeholder="00.000.000/0000-00" value="${esc(mascaraCnpj(form.cnpj))}"></label>
      <label class="campo" id="cRazao">Razão Social<input type="text" id="razao" autocomplete="organization" value="${esc(form.razao_social)}"></label>
      <div class="grupo" id="gNf"><span class="rotulo">Emite nota fiscal?</span>
        <div class="opcoes">
          <label class="opcao"><input type="radio" name="nf" value="sim" ${form.emite_nf === true ? 'checked' : ''}> Sim</label>
          <label class="opcao"><input type="radio" name="nf" value="nao" ${form.emite_nf === false ? 'checked' : ''}> Não</label>
        </div>
      </div>
    </section>
    <section class="card" id="gItens">
      <div class="card-title">Itens</div>
      <p class="muted">Informe o valor unitário de cada item. Se não tiver o material, marque "Não possuo".</p>
      <div id="listaItens">${form.itens.map(itemHtml).join('')}</div>
    </section>
    <section class="card">
      <div class="card-title">Entrega e pagamento</div>
      <label class="campo" id="cPrazo">Prazo de entrega<input type="text" id="prazo" maxlength="300" placeholder="Ex.: 5 dias úteis após o pagamento" value="${esc(form.prazo_entrega)}"></label>
      <div class="grupo" id="gFrete"><span class="rotulo">Quem paga o frete?</span>
        <div class="opcoes">
          <label class="opcao"><input type="radio" name="frete" value="empresa" ${form.frete_pagador === 'empresa' ? 'checked' : ''}> Pago pela empresa (fornecedor)</label>
          <label class="opcao"><input type="radio" name="frete" value="cliente" ${form.frete_pagador === 'cliente' ? 'checked' : ''}> Pago pelo cliente</label>
        </div>
      </div>
      <label class="campo" id="cFrete" ${form.frete_pagador === 'cliente' ? '' : 'hidden'}>Estimativa do valor do frete<input type="text" id="freteValor" inputmode="decimal" placeholder="R$ 0,00" value="${esc(form.frete_valor)}"></label>
      <div class="grupo" id="gFormas"><span class="rotulo">Formas de pagamento</span>
        <div class="opcoes">${FORMAS_PAGAMENTO.map((f) => `<label class="opcao"><input type="checkbox" data-forma="${esc(f)}" ${form.formas.has(f) ? 'checked' : ''}> ${esc(f)}</label>`).join('')}</div>
      </div>
      <div class="grupo" id="gDesc"><span class="rotulo">Possui desconto de acordo com a forma de pagamento?</span>
        <div class="opcoes">
          <label class="opcao"><input type="radio" name="desc" value="sim" ${form.tem_desconto === true ? 'checked' : ''}> Sim</label>
          <label class="opcao"><input type="radio" name="desc" value="nao" ${form.tem_desconto === false ? 'checked' : ''}> Não</label>
        </div>
      </div>
      <div id="descontos"></div>
    </section>
    <div class="isca" aria-hidden="true"><label>Não preencha<input type="text" id="website" tabindex="-1" autocomplete="off"></label></div>
    <div class="acoes"><button class="btn btn-primary" id="btnRevisar" type="button">✔ Confirmar</button></div>`;
  form.itens.forEach((_, i) => atualizarTotal(i));
  renderDescontos();
  ligarEventos();
}

function atualizarTotal(i) {
  const it = form.itens[i];
  const el = raiz.querySelector(`.item[data-i="${i}"] [data-total]`);
  if (!el) return;
  const v = lerValor(it.valor);
  el.textContent = !it.nao_possuo && Number.isFinite(v) && v > 0 ? `Total: ${money(v * it.un)}` : '';
}

function renderDescontos() {
  const box = raiz.querySelector('#descontos');
  if (!box) return;
  if (form.tem_desconto !== true) { box.innerHTML = ''; return; }
  const formas = [...form.formas];
  if (!formas.length) { box.innerHTML = '<p class="muted">Selecione as formas de pagamento acima para informar o desconto de cada uma.</p>'; return; }
  if (!form.descontos.length) form.descontos.push({ forma: formas[0], tipo: 'percentual', valor: '' });
  box.innerHTML = `<div class="grupo" id="gDescLinhas">${form.descontos.map((d, i) => `
    <div class="desc-linha" data-d="${i}">
      <select data-dforma aria-label="Forma de pagamento">${formas.map((f) => `<option ${f === d.forma ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>
      <select data-dtipo aria-label="Tipo de desconto"><option value="percentual" ${d.tipo === 'percentual' ? 'selected' : ''}>%</option><option value="valor" ${d.tipo === 'valor' ? 'selected' : ''}>R$</option></select>
      <input type="text" inputmode="decimal" data-dvalor placeholder="Desconto" aria-label="Valor do desconto" value="${esc(d.valor)}">
      <button class="btn btn-sec btn-mini" data-drem type="button" aria-label="Remover desconto">×</button>
    </div>`).join('')}
    <div><button class="btn btn-sec btn-mini" id="addDesc" type="button">+ Adicionar desconto de outra forma</button></div>
  </div>`;
}

function ligarEventos() {
  const q = (s) => raiz.querySelector(s);
  q('#cnpj').addEventListener('input', (e) => { form.cnpj = soDigitos(e.target.value).slice(0, 14); e.target.value = mascaraCnpj(form.cnpj); });
  q('#cnpj').addEventListener('blur', preencherRazaoPeloCnpj);
  q('#razao').addEventListener('input', (e) => { form.razao_social = e.target.value; });
  q('#prazo').addEventListener('input', (e) => { form.prazo_entrega = e.target.value; });
  raiz.querySelectorAll('input[name=nf]').forEach((r) => r.addEventListener('change', () => { form.emite_nf = r.value === 'sim'; }));
  raiz.querySelectorAll('input[name=frete]').forEach((r) => r.addEventListener('change', () => {
    form.frete_pagador = r.value;
    q('#cFrete').hidden = r.value !== 'cliente';
  }));
  q('#freteValor').addEventListener('input', (e) => { form.frete_valor = e.target.value; });
  raiz.querySelectorAll('input[name=desc]').forEach((r) => r.addEventListener('change', () => { form.tem_desconto = r.value === 'sim'; renderDescontos(); }));
  raiz.querySelectorAll('[data-forma]').forEach((c) => c.addEventListener('change', () => {
    c.checked ? form.formas.add(c.dataset.forma) : form.formas.delete(c.dataset.forma);
    form.descontos = form.descontos.filter((d) => form.formas.has(d.forma));
    renderDescontos();
  }));
  raiz.querySelectorAll('.item').forEach((el) => {
    const i = Number(el.dataset.i);
    el.querySelector('[data-valor]').addEventListener('input', (e) => { form.itens[i].valor = e.target.value; atualizarTotal(i); });
    el.querySelector('[data-nao]').addEventListener('change', (e) => {
      form.itens[i].nao_possuo = e.target.checked;
      if (e.target.checked) form.itens[i].valor = '';
      const inp = el.querySelector('[data-valor]');
      inp.disabled = e.target.checked; if (e.target.checked) inp.value = '';
      el.classList.toggle('sem-valor', e.target.checked);
      atualizarTotal(i);
    });
  });
  q('#descontos').addEventListener('input', (e) => {
    const linha = e.target.closest('[data-d]'); if (!linha) return;
    const d = form.descontos[Number(linha.dataset.d)];
    if (e.target.matches('[data-dvalor]')) d.valor = e.target.value;
  });
  q('#descontos').addEventListener('change', (e) => {
    const linha = e.target.closest('[data-d]'); if (!linha) return;
    const d = form.descontos[Number(linha.dataset.d)];
    if (e.target.matches('[data-dforma]')) d.forma = e.target.value;
    if (e.target.matches('[data-dtipo]')) d.tipo = e.target.value;
  });
  q('#descontos').addEventListener('click', (e) => {
    if (e.target.id === 'addDesc') {
      const usadas = new Set(form.descontos.map((d) => d.forma));
      form.descontos.push({ forma: [...form.formas].find((f) => !usadas.has(f)) || [...form.formas][0], tipo: 'percentual', valor: '' });
      renderDescontos();
    }
    const rem = e.target.closest('[data-drem]');
    if (rem) { form.descontos.splice(Number(rem.closest('[data-d]').dataset.d), 1); renderDescontos(); }
  });
  q('#btnRevisar').addEventListener('click', revisar);
}

// Consulta pública (BrasilAPI) só para poupar digitação; se falhar, o fornecedor digita a razão social.
async function preencherRazaoPeloCnpj() {
  if (!cnpjValido(form.cnpj) || form.razao_social.trim()) return;
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${form.cnpj}`);
    if (!res.ok) return;
    const d = await res.json();
    if (d?.razao_social && !form.razao_social.trim()) {
      form.razao_social = d.razao_social;
      const campo = raiz.querySelector('#razao'); if (campo) campo.value = d.razao_social;
    }
  } catch { /* sem consulta: segue manual */ }
}

// ─── Validação e resumo ────────────────────────────────────────────────────────
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
  if (!cnpjValido(form.cnpj)) return marcarErro('#cCnpj', 'Informe um CNPJ válido.');
  if (form.razao_social.trim().length < 3) return marcarErro('#cRazao', 'Informe a razão social.');
  if (form.emite_nf === null) return marcarErro('#gNf', 'Informe se a empresa emite nota fiscal.');
  for (let i = 0; i < form.itens.length; i++) {
    const it = form.itens[i];
    const v = lerValor(it.valor);
    if (!it.nao_possuo && !(Number.isFinite(v) && v > 0)) return marcarErro(`.item[data-i="${i}"]`, `Informe o valor de "${it.material}" ou marque "Não possuo".`);
  }
  if (form.itens.every((i) => i.nao_possuo)) return marcarErro('#gItens', 'Todos os itens estão como "Não possuo"; não há o que enviar.');
  if (!form.prazo_entrega.trim()) return marcarErro('#cPrazo', 'Informe o prazo de entrega.');
  if (form.frete_pagador === null) return marcarErro('#gFrete', 'Informe quem paga o frete.');
  if (form.frete_pagador === 'cliente' && !(lerValor(form.frete_valor) > 0)) return marcarErro('#cFrete', 'Informe a estimativa do valor do frete.');
  if (!form.formas.size) return marcarErro('#gFormas', 'Selecione ao menos uma forma de pagamento.');
  if (form.tem_desconto === null) return marcarErro('#gDesc', 'Informe se possui desconto por forma de pagamento.');
  if (form.tem_desconto) {
    if (!form.descontos.length) return marcarErro('#gDesc', 'Informe a forma de pagamento e o desconto.');
    for (const d of form.descontos) {
      const v = lerValor(d.valor);
      if (!Number.isFinite(v) || v <= 0 || (d.tipo === 'percentual' && v > 100)) return marcarErro('#gDescLinhas', 'Confira o valor do desconto.');
    }
  }
  return true;
}

function corpoEnvio() {
  return {
    t: token,
    cnpj: form.cnpj,
    razao_social: form.razao_social,
    emite_nf: form.emite_nf,
    prazo_entrega: form.prazo_entrega,
    frete_pagador: form.frete_pagador,
    frete_valor: form.frete_pagador === 'cliente' ? form.frete_valor : null,
    formas_pagamento: [...form.formas],
    tem_desconto: form.tem_desconto,
    descontos: form.tem_desconto ? form.descontos.map((d) => ({ forma: d.forma, tipo: d.tipo, valor: d.valor })) : [],
    itens: form.itens.map((i) => ({ id: i.id, valor: i.nao_possuo ? null : i.valor, nao_possuo: i.nao_possuo })),
    website: raiz.querySelector('#website')?.value || '',
  };
}

function revisar() {
  if (!validar()) return;
  const honeypot = raiz.querySelector('#website')?.value || '';
  const linhas = form.itens.map((i) => {
    const v = lerValor(i.valor);
    return `<tr><td>${esc(i.un)} × ${esc(i.material)}${i.detalhe ? ` <span class="muted">(${esc(i.detalhe)})</span>` : ''}</td><td>${i.nao_possuo ? 'Não possuo' : money(v)}</td></tr>`;
  }).join('');
  const descontos = form.tem_desconto ? form.descontos.map((d) => `${esc(d.forma)}: ${d.tipo === 'percentual' ? `${esc(d.valor)}%` : money(lerValor(d.valor))}`).join('<br>') : 'Não';
  raiz.innerHTML = `
    <div class="msg erro" id="erroTopo" hidden></div>
    <section class="card resumo">
      <div class="card-title">Confira antes de enviar</div>
      <dl>
        <dt>CNPJ</dt><dd>${esc(mascaraCnpj(form.cnpj))}</dd>
        <dt>Razão social</dt><dd>${esc(form.razao_social)}</dd>
        <dt>Emite nota fiscal</dt><dd>${form.emite_nf ? 'Sim' : 'Não'}</dd>
        <dt>Prazo de entrega</dt><dd>${esc(form.prazo_entrega)}</dd>
        <dt>Frete</dt><dd>${form.frete_pagador === 'empresa' ? 'Pago pela empresa (fornecedor)' : `Pago pelo cliente · estimativa ${money(lerValor(form.frete_valor))}`}</dd>
        <dt>Formas de pagamento</dt><dd>${esc([...form.formas].join(', '))}</dd>
        <dt>Desconto por forma de pagamento</dt><dd>${descontos}</dd>
      </dl>
      <table><tbody>${linhas}</tbody></table>
    </section>
    <input type="hidden" id="website" value="${esc(honeypot)}">
    <div class="acoes">
      <button class="btn btn-sec" id="btnVoltar" type="button">Voltar e editar</button>
      <button class="btn btn-primary" id="btnEnviar" type="button">✔ Enviar cotação</button>
    </div>`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  raiz.querySelector('#btnVoltar').onclick = () => renderForm();
  raiz.querySelector('#btnEnviar').onclick = enviar;
}

async function enviar() {
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
  }
}

// ─── Início ────────────────────────────────────────────────────────────────────
(async function iniciar() {
  if (!token) { telaMensagem('🔗', 'Link inválido', 'Peça um novo link ao setor de Compras.'); return; }
  try {
    const { ok, dados } = await chamar('GET');
    if (!ok) { telaMensagem('⛔', 'Cotação indisponível', dados.erro || 'Peça um novo link ao setor de Compras.'); return; }
    form.itens = dados.itens.map((i) => ({ ...i, valor: '', nao_possuo: false }));
    document.getElementById('validade').textContent = `Responder até ${brData(dados.expira_em)}`;
    renderForm();
  } catch {
    telaMensagem('⚠️', 'Sem conexão', 'Não foi possível carregar a cotação. Tente novamente em instantes.');
  }
})();
