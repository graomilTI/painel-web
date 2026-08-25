// Padroniza <select> com muitas opções: transforma em combobox pesquisável
// (digita e filtra), mantendo o <select> original funcionando por trás —
// mesmo value, mesmo evento "change" — para não quebrar os módulos que já
// leem/escutam esses selects. Selects pequenos (poucas opções) não são
// tocados: continuam como <select> nativo.
//
// Também estiliza <input list="..."> (texto livre + sugestão): o <datalist>
// nativo do navegador não é estilizável e aparece como popup branco fora do
// padrão visual da tela (reportado 04/08). Mostra as mesmas sugestões numa
// lista com a cara do painel, mas sem travar o campo só nelas — digitar um
// valor novo continua funcionando normalmente.
//
// Roda automaticamente em qualquer página que passe por pageInit.js
// (initProtectedPage), via MutationObserver no body — não precisa importar
// manualmente em cada módulo.

const THRESHOLD = 12;
const FLAG = 'sselBound';

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
}

function injectStyle() {
  if (document.getElementById('searchableSelectStyle')) return;
  const style = document.createElement('style');
  style.id = 'searchableSelectStyle';
  style.textContent = `
    .ssel-wrap{position:relative;width:100%}
    .ssel-input{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:12px;font:inherit;cursor:pointer}
    .ssel-wrap.is-disabled .ssel-input{opacity:.55;cursor:not-allowed;pointer-events:none}
    /* position:fixed (não absolute) e anexada em document.body de propósito:
       .card (container universal do painel) tem "overflow:hidden" pra recortar
       um brilho decorativo (::after) — isso corta QUALQUER filho absolutamente
       posicionado que precise "vazar" pra fora da card, inclusive esta lista.
       Fixed+body escapa desse recorte sem mexer no CSS global do .card (que
       outras telas dependem pro efeito visual). Posição calculada em JS
       (posicionarLista) a partir do input; z-index bem alto pra ficar acima
       de qualquer card/stacking context comum — mas 9999 não bastava pra
       selects DENTRO de modal (vários modais no painel usam z-index de
       10010 a 100000, ex. adm-hotel-alojamentos-pagamentos.js,
       financeiro-adiantamentos-lote.js), então a lista renderizava
       corretamente no DOM só que atrás do próprio modal, invisível pro
       usuário (achado 30/07 ao adicionar o campo Supervisão no cadastro de
       Alojamentos). 200000 fica acima de todo z-index já usado no projeto. */
    .ssel-list{position:fixed;max-height:260px;overflow-y:auto;background:#0d0d18;border:1px solid rgba(45,212,160,.28);border-radius:12px;z-index:200000;box-shadow:0 12px 32px rgba(0,0,0,.5)}
    .ssel-item{padding:9px 14px;font-size:13px;color:#e2e2f0;cursor:pointer}
    .ssel-item:hover,.ssel-item.is-active,.ssel-item.is-keyboard{background:rgba(45,212,160,.14);color:#fff}
    .ssel-empty{padding:10px 14px;font-size:13px;color:#7d8aa3;text-align:center}
    /* input[list] continua editável livremente — cursor de texto, não de
       "abrir dropdown" como o combobox do <select> (que só permite escolher). */
    .ssel-input-freetext{cursor:text}
  `;
  document.head.appendChild(style);
}

function buildCombobox(select) {
  if (!select || select.dataset[FLAG] === '1') return;
  if (select.multiple) return;
  // select com o atributo "hidden" foi marcado assim de propósito pela tela
  // que o criou (ex.: #resHotel em adm-hotel.js, um <select> só interno pra
  // calcular diária, nunca deveria aparecer pro usuário) — respeitar isso e
  // não desenhar um combobox visível por cima. Reportado 19/08: virava um
  // segundo campo "Selecionar hotel" fantasma ao lado do campo de texto real.
  if (select.hidden) return;
  // Alguns fluxos precisam da lista customizada mesmo com poucas opções para
  // não abrir o picker nativo de tela cheia no celular.
  const forced = select.hasAttribute('data-searchable-select');
  if (!forced && select.options.length <= THRESHOLD) return;

  select.dataset[FLAG] = '1';
  injectStyle();

  const wrap = document.createElement('div');
  wrap.className = 'ssel-wrap';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = `${select.className || ''} ssel-input`.trim();
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = 'Digite para buscar...';

  const list = document.createElement('div');
  list.className = 'ssel-list';
  list.hidden = true;

  select.insertAdjacentElement('afterend', wrap);
  wrap.appendChild(input);
  // A lista é anexada em document.body (não em wrap) — ver comentário em
  // injectStyle sobre o overflow:hidden do .card cortando conteúdo absoluto.
  document.body.appendChild(list);
  select.style.display = 'none';

  function syncDisabled() {
    wrap.classList.toggle('is-disabled', select.disabled);
  }

  function syncInputFromSelect() {
    const opt = select.options[select.selectedIndex];
    input.value = opt ? opt.textContent : '';
    syncDisabled();
  }

  function posicionarLista() {
    const r = input.getBoundingClientRect();
    list.style.left = `${r.left}px`;
    list.style.top = `${r.bottom + 4}px`;
    list.style.width = `${r.width}px`;
  }

  function fecharAoRolar(event) {
    // A própria .ssel-list tem overflow-y:auto — rolar o mouse sobre as opções
    // dispara "scroll" nela, que também chega aqui (listener em capture no
    // window). Isso não invalida a posição calculada (o input não se moveu),
    // então não deve fechar (reportado 2026-07-23: lista fechava ao rolar).
    if (event.target === list || (event.target instanceof Node && list.contains(event.target))) return;
    closeList();
  }

  function renderList(query = '') {
    const q = normalize(query);
    const matches = [...select.options].filter((opt) => !q || normalize(opt.textContent).includes(q)).slice(0, 200);

    list.innerHTML = matches.length
      ? matches.map((opt) => `<div class="ssel-item${opt.value === select.value ? ' is-active' : ''}" data-value="${opt.value}">${opt.textContent}</div>`).join('')
      : '<div class="ssel-empty">Nenhum resultado encontrado.</div>';
    posicionarLista();
    list.hidden = false;
    // Rolar a página (não a própria lista) invalidaria a posição calculada —
    // mais simples e robusto fechar do que reposicionar em tempo real.
    window.addEventListener('scroll', fecharAoRolar, { capture: true, passive: true });
    window.addEventListener('resize', fecharAoRolar, { passive: true });
  }

  function closeList() {
    list.hidden = true;
    window.removeEventListener('scroll', fecharAoRolar, { capture: true });
    window.removeEventListener('resize', fecharAoRolar);
  }

  function selectValue(value) {
    if (select.value === value) { closeList(); syncInputFromSelect(); return; }
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    syncInputFromSelect();
    closeList();
  }

  input.addEventListener('focus', () => { if (select.disabled) return; input.select(); renderList(''); });
  input.addEventListener('input', () => renderList(input.value));
  input.addEventListener('blur', () => setTimeout(() => { closeList(); syncInputFromSelect(); }, 150));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { closeList(); syncInputFromSelect(); input.blur(); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') return;
    event.preventDefault();
    const items = [...list.querySelectorAll('.ssel-item')];
    if (!items.length) return;
    const activeIndex = items.findIndex((item) => item.classList.contains('is-keyboard'));
    if (event.key === 'Enter') {
      const target = items[activeIndex] || items[0];
      if (target) selectValue(target.dataset.value);
      return;
    }
    items.forEach((item) => item.classList.remove('is-keyboard'));
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = ((activeIndex === -1 ? (delta === 1 ? -1 : 0) : activeIndex) + delta + items.length) % items.length;
    items[nextIndex].classList.add('is-keyboard');
    items[nextIndex].scrollIntoView({ block: 'nearest' });
  });

  list.addEventListener('mousedown', (event) => {
    const item = event.target.closest('.ssel-item');
    if (!item) return;
    event.preventDefault();
    selectValue(item.dataset.value);
  });

  // Vários módulos repopulam o <select> (innerHTML novo, value setado por
  // código) depois de carregar dados — refletimos isso no combobox.
  new MutationObserver(syncInputFromSelect).observe(select, {
    childList: true,
    attributes: true,
    attributeFilter: ['disabled'],
  });
  // select.value = x setado por código sem alterar as <option> não dispara
  // o MutationObserver acima; código que faz isso costuma também disparar
  // "change" manualmente — cobrimos esse caminho aqui.
  select.addEventListener('change', syncInputFromSelect);

  syncInputFromSelect();
  // A lista vive em document.body, fora de onde o <select> original está —
  // em páginas com navegação suave (router.js troca #pageContent sem reload),
  // o <select> some do DOM mas a lista ficaria órfã em body pra sempre.
  // Registrada aqui pra cleanupOrphans() (chamada a cada scan()) remover
  // quando o select desconectar.
  activeCombos.push({ select, wrap, list, closeList });
}

function buildFreeTextCombobox(input) {
  if (!input || input.dataset[FLAG] === '1') return;
  const listId = input.getAttribute('list');
  if (!listId) return;
  const datalist = document.getElementById(listId);
  if (!datalist) return;

  input.dataset[FLAG] = '1';
  injectStyle();
  // Tira o "list" pra suprimir o popup nativo do navegador — as opções
  // continuam vindo do próprio <datalist>, só a lista visível é outra.
  input.removeAttribute('list');
  input.autocomplete = 'off';
  input.classList.add('ssel-input', 'ssel-input-freetext');

  const list = document.createElement('div');
  list.className = 'ssel-list';
  list.hidden = true;
  document.body.appendChild(list);

  function options() {
    return [...datalist.querySelectorAll('option')];
  }

  function posicionarLista() {
    const r = input.getBoundingClientRect();
    list.style.left = `${r.left}px`;
    list.style.top = `${r.bottom + 4}px`;
    list.style.width = `${r.width}px`;
  }

  function fecharAoRolar(event) {
    if (event.target === list || (event.target instanceof Node && list.contains(event.target))) return;
    closeList();
  }

  function renderList(query = '') {
    const q = normalize(query);
    const matches = options().filter((opt) => opt.value && (!q || normalize(opt.value).includes(q))).slice(0, 200);
    if (!matches.length) { closeList(); return; }
    list.innerHTML = matches
      .map((opt) => `<div class="ssel-item" data-value="${opt.value.replace(/"/g, '&quot;')}">${opt.value}</div>`)
      .join('');
    posicionarLista();
    list.hidden = false;
    window.addEventListener('scroll', fecharAoRolar, { capture: true, passive: true });
    window.addEventListener('resize', fecharAoRolar, { passive: true });
  }

  function closeList() {
    list.hidden = true;
    window.removeEventListener('scroll', fecharAoRolar, { capture: true });
    window.removeEventListener('resize', fecharAoRolar);
  }

  function chooseValue(value) {
    input.value = value;
    // Sintéticos: setar .value por código não dispara os eventos nativos —
    // outros módulos (ex. handleSalvarAberturaOs) leem o valor só na hora
    // de salvar, mas o upload por IA depende de "input"/"change" pra
    // atualizar o estado (ex. bloco de Testes reagindo ao Produto).
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    closeList();
  }

  input.addEventListener('focus', () => renderList(input.value));
  input.addEventListener('input', () => renderList(input.value));
  input.addEventListener('blur', () => setTimeout(closeList, 150));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { closeList(); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') return;
    const items = [...list.querySelectorAll('.ssel-item')];
    if (!items.length) return;
    const activeIndex = items.findIndex((item) => item.classList.contains('is-keyboard'));
    if (event.key === 'Enter') {
      // Sem nenhuma sugestão navegada via teclado, deixa o Enter seguir
      // normal (ex.: o botão de salvar do formulário) em vez de forçar a
      // primeira opção — aqui o texto livre é uma opção válida também.
      if (activeIndex === -1) return;
      event.preventDefault();
      chooseValue(items[activeIndex].dataset.value);
      return;
    }
    event.preventDefault();
    items.forEach((item) => item.classList.remove('is-keyboard'));
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = ((activeIndex === -1 ? (delta === 1 ? -1 : 0) : activeIndex) + delta + items.length) % items.length;
    items[nextIndex].classList.add('is-keyboard');
    items[nextIndex].scrollIntoView({ block: 'nearest' });
  });

  list.addEventListener('mousedown', (event) => {
    const item = event.target.closest('.ssel-item');
    if (!item) return;
    event.preventDefault();
    chooseValue(item.dataset.value);
  });

  activeCombos.push({ select: input, wrap: null, list, closeList });
}

const activeCombos = [];
function cleanupOrphans() {
  for (let i = activeCombos.length - 1; i >= 0; i -= 1) {
    const combo = activeCombos[i];
    if (combo.select.isConnected) continue;
    combo.closeList();
    combo.list.remove();
    combo.wrap?.remove();
    activeCombos.splice(i, 1);
  }
}

function scan(root) {
  cleanupOrphans();
  if (!root) return;
  if (root.matches?.('select')) buildCombobox(root);
  root.querySelectorAll?.('select').forEach(buildCombobox);
  if (root.matches?.('input[list]')) buildFreeTextCombobox(root);
  root.querySelectorAll?.('input[list]').forEach(buildFreeTextCombobox);
}

let scheduled = false;
function scheduleScan() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    scan(document.body);
  });
}

new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true });
window.addEventListener('load', scheduleScan);
scheduleScan();
