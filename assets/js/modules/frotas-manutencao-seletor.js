// Frotas · Manutenção › Nova manutenção: seletor de itens em dois painéis (grupos do guia | itens do grupo) com busca.
// Marcar itens é obrigatório; a seleção vale entre grupos, sem botão "+". Os itens do guia são PEÇAS (produtos) e alguns são
// SERVIÇOS; "Mão de obra" aparece em todos os grupos como serviço. Quem abre o pedido não escolhe peça ou serviço: o tipo vem do
// item (só o "Outro item" digitado pergunta). Funções puras (grupos, busca, itens) ficam exportadas para teste.
import { dinheiro, esc } from '../core/ui.js';
import { MAO_DE_OBRA, itensDoGrupo, itensPorTipo, norm, pecaEscolhida, tipoDoComponente } from './frotas-manutencao-regras.js?v=20261021-frotas-manut45';

// Grupos do guia; sem grupos cadastrados, cai nas categorias (sem lista de componentes, só os itens digitados).
export function gruposDoSeletor(base) {
  if ((base.grupos || []).length) {
    return base.grupos.map((g) => ({ codigo: Number(g.codigo), nome: g.nome, categoria_codigo: Number(g.categoria_codigo) }));
  }
  return (base.categorias || []).filter((c) => c.ativo !== false).map((c) => ({ codigo: Number(c.codigo), nome: c.nome, categoria_codigo: Number(c.codigo) }));
}

const temGrupos = (base) => (base.grupos || []).length > 0;
const itensDe = (base, grupo, marcados = []) => (temGrupos(base) ? itensDoGrupo(base.componentes, grupo.codigo, marcados) : [MAO_DE_OBRA, ...marcados.filter((n) => n !== MAO_DE_OBRA)]);

// Busca em todos os grupos (sem acento, qualquer parte do nome do item ou do grupo). "Mão de obra" só aparece se for pesquisada.
export function buscarItens(base, termo) {
  const t = norm(termo).trim();
  if (!t) return [];
  const achados = [];
  for (const g of gruposDoSeletor(base)) {
    for (const nome of itensDe(base, g)) {
      if (norm(nome).includes(t) || (nome !== MAO_DE_OBRA && norm(g.nome).includes(t))) achados.push({ grupo: g.codigo, grupoNome: g.nome, nome });
    }
  }
  return achados;
}

// Itens da solicitação: por grupo, um de peças e um de serviço (Mão de obra), na ordem dos grupos. `tipoDe(grupo, nome)` diz o tipo.
export function itensDaSelecao(selecao, grupos, tipoDe = () => 'peca', pecaDe = () => null) {
  return grupos.flatMap((g) => itensPorTipo(g.categoria_codigo, selecao.get(g.codigo) || [], (nome) => tipoDe(g.codigo, nome), (nome) => pecaDe(g.codigo, nome)));
}

// Texto curto de uma peça já usada: "LUK · R$ 754,80".
export const rotuloPeca = (p) => `${p.detalhe}${p.ultimo_valor != null ? ` · ${dinheiro(p.ultimo_valor)}` : ''}`;

export function htmlSeletor() {
  return `<div class="fm-pick">
    <input class="fm-input fm-pick-busca" data-pick-busca type="search" placeholder="Buscar item em todos os grupos (ex.: pastilha, bateria, lâmpada)..." autocomplete="off">
    <div class="fm-pick-grade" data-pick-grupos aria-label="Grupos do guia"></div>
    <div class="fm-pick-abertos" data-pick-abertos></div>
    <section class="fm-pick-painel" data-pick-painel hidden></section>
  </div>`;
}

// Liga o seletor dentro de `box` (que recebeu htmlSeletor()). Os grupos do guia formam uma grade de 4 colunas (12 grupos = 4x3);
// cada quadrado abre os itens abaixo da grade e tem uma caixa na ponta para marcar o grupo todo; os itens marcados aparecem contados no cabeçalho. O resumo dos itens marcados fica onde a
// tela quiser (`resumo`, um elemento com data-pick-resumo; sem ele, procura dentro de `box`). Devolve { ler, qtd, ... }.
// `estado` (opcional) guarda a seleção e os grupos abertos fora da tela: quem redesenha a página (a ficha) passa o mesmo objeto
// e não perde o que foi marcado.
export function criarSeletor(box, base, { aoMudar = () => {}, resumo = null, estado = {} } = {}) {
  const grupos = gruposDoSeletor(base);
  const selecao = (estado.selecao ||= new Map()); // grupo → nomes marcados (do guia, Mão de obra ou digitados)
  const digitados = (estado.digitados ||= new Map()); // nome digitado à mão → 'peca' | 'servico'
  const escolhas = (estado.escolhas ||= new Map()); // "grupo|item" → peça específica escolhida ({ id, detalhe, ultimo_valor })
  const abertos = (estado.abertos ||= new Set()); // grupos abertos
  let busca = '';
  let pecasDoModelo = new Map(); // item do guia → peças já usadas no modelo do veículo
  let rotuloDoModelo = '';
  const chave = (cod, nome) => `${Number(cod)}|${nome}`;
  const marcados = (cod) => selecao.get(Number(cod)) || [];
  const total = () => [...selecao.values()].reduce((s, l) => s + l.length, 0);
  const q = (sel) => box.querySelector(sel);
  const resumoEl = resumo || box.querySelector('[data-pick-resumo]');
  const tipoDe = (cod, nome) => (temGrupos(base)
    ? tipoDoComponente(base.componentes, cod, nome, digitados)
    : (nome === MAO_DE_OBRA ? 'servico' : digitados.get(nome) || 'peca'));

  function alternar(cod, nome, ligado) {
    const lista = [...marcados(cod)];
    const i = lista.indexOf(nome);
    if (ligado && i < 0) lista.push(nome);
    if (!ligado && i >= 0) { lista.splice(i, 1); escolhas.delete(chave(cod, nome)); }
    if (lista.length) selecao.set(Number(cod), lista); else selecao.delete(Number(cod));
  }

  const linhaItem = (cod, nome, { grupoNome = '' } = {}) => {
    const on = marcados(cod).includes(nome);
    const servico = tipoDe(cod, nome) === 'servico';
    const label = `<label class="fm-pick-item${on ? ' sel' : ''}${servico ? ' servico' : ''}"><input type="checkbox" data-pick-comp data-grupo="${cod}" value="${esc(nome)}"${on ? ' checked' : ''}><span>${esc(nome)}${grupoNome ? `<small>${esc(grupoNome)}</small>` : ''}</span>${servico ? '<em class="fm-pick-tag">serviço</em>' : ''}</label>`;
    const usadas = pecasDoModelo.get(nome) || [];
    if (!usadas.length) return label;
    const escolhida = escolhas.get(chave(cod, nome));
    return `<div class="fm-pick-cel">${label}<div class="fm-pick-pecas" title="Peças já usadas neste modelo (clique para escolher)">${usadas.map((p, i) => `<button type="button" class="fm-pick-peca${escolhida?.id === p.id ? ' on' : ''}" data-pick-peca data-grupo="${cod}" data-nome="${esc(nome)}" data-i="${i}">${esc(rotuloPeca(p))}</button>`).join('')}</div></div>`;
  };

  // Itens de um grupo na tela: o que o guia lista, Mão de obra e o que foi digitado.
  const nomesDoGrupo = (g) => itensDe(base, g, marcados(g.codigo));

  // Grupo = um quadrado da grade (nome, quantos marcados e a caixa de "grupo todo"); abrir mostra os itens abaixo da grade.
  function htmlGrupo(g) {
    const aberto = abertos.has(g.codigo);
    const n = marcados(g.codigo).length;
    return `<div class="fm-pick-gr${aberto ? ' aberto' : ''}${n ? ' tem' : ''}" data-pick-gr="${g.codigo}">
      <button type="button" class="fm-pick-gt" data-pick-grupo="${g.codigo}" aria-expanded="${aberto}" title="${aberto ? 'Fechar' : 'Abrir'} ${esc(g.nome)}"><strong>${esc(g.nome)}</strong><b data-pick-cont>${n ? `${n} marcado(s)` : ''}</b></button>
      <label class="fm-pick-gck" title="Marcar ou desmarcar o grupo todo"><input type="checkbox" data-pick-todos data-grupo="${g.codigo}" aria-label="Grupo todo: ${esc(g.nome)}"></label>
    </div>`;
  }

  function htmlPainelGrupo(g) {
    return `<section class="fm-pick-gc" data-pick-gc="${g.codigo}"><div class="fm-pick-gc-cab"><strong>${esc(g.nome)}</strong><span class="fm-mm">${rotuloDoModelo && pecasDoModelo.size ? `Peças já usadas no ${esc(rotuloDoModelo)} aparecem sob o item` : 'Peças do guia e mão de obra'}</span><button type="button" class="fm-link" data-pick-grupo="${g.codigo}">Fechar</button></div>
      <div class="fm-pick-lista">${nomesDoGrupo(g).map((nome) => linhaItem(g.codigo, nome)).join('')}</div>
      <div class="fm-pick-outro"><input class="fm-input" data-pick-outro data-grupo="${g.codigo}" maxlength="80" placeholder="Serviço realizado ou outro item de ${esc(g.nome)} (digite e tecle Enter)" autocomplete="off">
        <select class="fm-select" data-pick-outro-tipo aria-label="Tipo do item digitado"><option value="servico">Serviço</option><option value="peca">Peça</option></select>
        <button type="button" class="fm-btn soft fm-mini" data-pick-add data-grupo="${g.codigo}">Adicionar</button></div></section>`;
  }

  // Contador, destaque e caixa do grupo (marcada, vazia ou no meio) sem redesenhar a lista.
  function sincronizarGrupo(cod) {
    const sec = q(`[data-pick-gr="${Number(cod)}"]`); const g = grupos.find((x) => x.codigo === Number(cod));
    if (!sec || !g) return;
    const n = marcados(cod).length; const nomes = nomesDoGrupo(g);
    const certos = nomes.filter((nome) => marcados(cod).includes(nome)).length;
    sec.classList.toggle('tem', n > 0);
    sec.querySelector('[data-pick-cont]').textContent = n ? `${n} marcado(s)` : '';
    const ck = sec.querySelector('[data-pick-todos]');
    ck.checked = nomes.length > 0 && certos === nomes.length;
    ck.indeterminate = certos > 0 && certos < nomes.length;
  }

  function renderGrupos() {
    const acc = q('[data-pick-grupos]');
    const buscando = !!busca.trim();
    acc.hidden = buscando;
    acc.innerHTML = grupos.length ? grupos.map(htmlGrupo).join('') : '<div class="fm-pick-vazio">Nenhum grupo cadastrado.</div>';
    const abertosEl = q('[data-pick-abertos]');
    abertosEl.hidden = buscando;
    abertosEl.innerHTML = grupos.filter((g) => abertos.has(g.codigo)).map(htmlPainelGrupo).join('');
    grupos.forEach((g) => sincronizarGrupo(g.codigo));
  }

  function renderPainel() {
    const painel = q('[data-pick-painel]');
    const buscando = !!busca.trim();
    painel.hidden = !buscando;
    if (!buscando) { painel.innerHTML = ''; return; }
    const achados = buscarItens(base, busca);
    painel.innerHTML = `<div class="fm-pick-cab"><strong>Resultado da busca</strong><span class="fm-mm">${achados.length} item(ns)</span></div>`
      + (achados.length
        ? `<div class="fm-pick-lista">${achados.map((a) => linhaItem(a.grupo, a.nome, { grupoNome: a.grupoNome })).join('')}</div>`
        : '<div class="fm-pick-vazio">Nenhum item encontrado. Abra o grupo e use o campo de serviço realizado para digitar.</div>');
  }

  function renderResumo() {
    if (!resumoEl) return;
    const com = grupos.filter((g) => marcados(g.codigo).length);
    resumoEl.innerHTML = com.length
      ? `<span class="fm-comps-t">Itens deste pedido (${total()})</span>${com.map((g) => `<div class="fm-pick-rg"><strong>${esc(g.nome)}</strong>${marcados(g.codigo).map((n) => `<span class="fm-chip-x${tipoDe(g.codigo, n) === 'servico' ? ' servico' : ''}">${esc(n)}${escolhas.get(chave(g.codigo, n)) ? ` <em class="fm-chip-peca">${esc(escolhas.get(chave(g.codigo, n)).detalhe)}</em>` : ''}<button type="button" data-pick-remover data-grupo="${g.codigo}" data-nome="${esc(n)}" aria-label="Remover ${esc(n)}">✕</button></span>`).join('')}</div>`).join('')}`
      : '<div class="fm-pick-vazio fm-pick-obrig">Nenhum item marcado. Abra um grupo e marque o que será feito (obrigatório).</div>';
  }

  const tudo = () => { renderGrupos(); renderPainel(); renderResumo(); aoMudar(); };

  box.addEventListener('click', (e) => {
    const g = e.target.closest('[data-pick-grupo]');
    if (g) {
      const cod = Number(g.dataset.pickGrupo);
      if (abertos.has(cod)) abertos.delete(cod); else abertos.add(cod);
      renderGrupos();
      q(`[data-pick-gr="${cod}"] [data-pick-grupo]`)?.focus();
      if (abertos.has(cod)) q(`[data-pick-gc="${cod}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    const add = e.target.closest('[data-pick-add]');
    if (add) { adicionarDigitado(add.dataset.grupo); return; }
    const pc = e.target.closest('[data-pick-peca]');
    if (pc) {
      const lista = pecasDoModelo.get(pc.dataset.nome) || []; const peca = lista[Number(pc.dataset.i)]; if (!peca) return;
      const k = chave(pc.dataset.grupo, pc.dataset.nome);
      if (escolhas.get(k)?.id === peca.id) escolhas.delete(k);
      else { escolhas.set(k, peca); if (!marcados(pc.dataset.grupo).includes(pc.dataset.nome)) alternar(pc.dataset.grupo, pc.dataset.nome, true); }
      tudo();
    }
  });
  resumoEl?.addEventListener('click', (e) => {
    const rem = e.target.closest('[data-pick-remover]');
    if (rem) { alternar(rem.dataset.grupo, rem.dataset.nome, false); tudo(); }
  });
  box.addEventListener('change', (e) => {
    const todos = e.target.closest('[data-pick-todos]');
    if (todos) { marcarGrupo(todos.dataset.grupo, todos.checked); return; }
    const c = e.target.closest('[data-pick-comp]');
    if (c) {
      alternar(c.dataset.grupo, c.value, c.checked);
      c.closest('.fm-pick-item')?.classList.toggle('sel', c.checked);
      sincronizarGrupo(c.dataset.grupo); renderResumo(); aoMudar();
    }
  });
  box.addEventListener('input', (e) => {
    if (e.target.matches('[data-pick-busca]')) { busca = e.target.value; renderGrupos(); renderPainel(); }
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-pick-outro]')) { e.preventDefault(); adicionarDigitado(e.target.dataset.grupo); }
  });

  // Caixa do cabeçalho: marca todos os itens do grupo (ou desmarca todos).
  function marcarGrupo(cod, ligar) {
    const g = grupos.find((x) => x.codigo === Number(cod)); if (!g) return;
    for (const nome of nomesDoGrupo(g)) alternar(g.codigo, nome, ligar);
    tudo();
  }

  function adicionarDigitado(cod) {
    const sec = q(`[data-pick-gc="${Number(cod)}"]`); const campo = sec?.querySelector('[data-pick-outro]'); if (!campo) return;
    const nome = campo.value.trim();
    if (!nome) return;
    if (nome !== MAO_DE_OBRA) digitados.set(nome, sec.querySelector('[data-pick-outro-tipo]')?.value === 'servico' ? 'servico' : 'peca');
    alternar(cod, nome, true);
    tudo();
    q(`[data-pick-gc="${Number(cod)}"] [data-pick-outro]`)?.focus();
  }

  tudo();
  return {
    ler: () => itensDaSelecao(selecao, grupos, tipoDe, (cod, nome) => (escolhas.get(chave(cod, nome)) ? pecaEscolhida(escolhas.get(chave(cod, nome))) : null)),
    qtd: total,
    // Para quem sugere itens (a descrição do problema): marcar um item, abrir um grupo e saber o que já está marcado.
    marcar(cod, nome) { alternar(cod, nome, true); tudo(); },
    irPara(cod) {
      abertos.add(Number(cod)); busca = ''; q('[data-pick-busca]').value = ''; renderGrupos(); renderPainel();
      q(`[data-pick-gc="${Number(cod)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
    estaMarcado: (cod, nome) => marcados(cod).includes(nome),
    // Troca as peças sugeridas (o veículo mudou): descarta escolhas de peças que não são do novo modelo.
    setPecas(mapa, rotulo = '') {
      pecasDoModelo = mapa || new Map(); rotuloDoModelo = rotulo;
      for (const [k, p] of [...escolhas]) { const nome = k.slice(k.indexOf('|') + 1); if (!(pecasDoModelo.get(nome) || []).some((x) => x.id === p.id)) escolhas.delete(k); }
      renderGrupos(); renderPainel(); renderResumo();
    },
  };
}
