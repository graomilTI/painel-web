// Frotas · Manutenção › Nova manutenção: seletor de itens em dois painéis (grupos do guia | itens do grupo) com busca.
// Marcar itens é obrigatório; a seleção vale entre grupos (um item por grupo, com os componentes marcados), sem botão "+".
// Funções puras (grupos, busca, itens) ficam exportadas para teste; o resto monta e liga o seletor dentro de um contêiner.
import { esc } from '../core/ui.js';
import { componentesDoGrupo, norm } from './frotas-manutencao-regras.js?v=20261019-frotas-manut33';

const TIPOS = [{ id: 'servico', label: 'Serviço' }, { id: 'peca', label: 'Peça' }];

// Grupos do guia; sem grupos cadastrados, cai nas categorias (sem lista de componentes, só os itens digitados).
export function gruposDoSeletor(base) {
  if ((base.grupos || []).length) {
    return base.grupos.map((g) => ({ codigo: Number(g.codigo), nome: g.nome, categoria_codigo: Number(g.categoria_codigo) }));
  }
  return (base.categorias || []).filter((c) => c.ativo !== false).map((c) => ({ codigo: Number(c.codigo), nome: c.nome, categoria_codigo: Number(c.codigo) }));
}

const componentesDe = (base, grupo) => ((base.grupos || []).length ? componentesDoGrupo(base.componentes, grupo.codigo) : []);

// Busca em todos os grupos (sem acento, qualquer parte do nome do item ou do grupo).
export function buscarItens(base, termo) {
  const t = norm(termo).trim();
  if (!t) return [];
  const achados = [];
  for (const g of gruposDoSeletor(base)) {
    for (const nome of componentesDe(base, g)) {
      if (norm(nome).includes(t) || norm(g.nome).includes(t)) achados.push({ grupo: g.codigo, grupoNome: g.nome, nome });
    }
  }
  return achados;
}

// Itens da solicitação: um por grupo com algo marcado, na ordem dos grupos.
export function itensDaSelecao(selecao, tipos, grupos) {
  return grupos.filter((g) => (selecao.get(g.codigo) || []).length).map((g) => {
    const nomes = selecao.get(g.codigo);
    return { categoria_codigo: g.categoria_codigo, descricao: nomes.join(', '), tipo_item: tipos.get(g.codigo) || 'servico', componentes: [...nomes] };
  });
}

export function htmlSeletor() {
  return `<div class="fm-pick">
    <input class="fm-input fm-pick-busca" data-pick-busca type="search" placeholder="Buscar item em todos os grupos (ex.: pastilha, bateria, lâmpada)..." autocomplete="off">
    <div class="fm-pick-corpo">
      <nav class="fm-pick-grupos" data-pick-grupos aria-label="Grupos do guia"></nav>
      <section class="fm-pick-painel" data-pick-painel></section>
    </div>
    <div class="fm-pick-resumo" data-pick-resumo></div></div>`;
}

// Liga o seletor dentro de `box` (que recebeu htmlSeletor()). Devolve { ler, qtd }.
export function criarSeletor(box, base, { aoMudar = () => {} } = {}) {
  const grupos = gruposDoSeletor(base);
  const selecao = new Map(); // grupo → nomes marcados (do guia ou digitados)
  const tipos = new Map(); // grupo → 'servico' | 'peca'
  let ativo = grupos[0]?.codigo ?? null;
  let busca = '';
  const nomeGrupo = (cod) => grupos.find((g) => g.codigo === Number(cod))?.nome || '';
  const marcados = (cod) => selecao.get(Number(cod)) || [];
  const total = () => [...selecao.values()].reduce((s, l) => s + l.length, 0);
  const q = (sel) => box.querySelector(sel);

  function alternar(cod, nome, ligado) {
    const lista = [...marcados(cod)];
    const i = lista.indexOf(nome);
    if (ligado && i < 0) lista.push(nome);
    if (!ligado && i >= 0) lista.splice(i, 1);
    if (lista.length) selecao.set(Number(cod), lista); else selecao.delete(Number(cod));
  }

  const linhaItem = (cod, nome, { grupoNome = '' } = {}) => {
    const on = marcados(cod).includes(nome);
    return `<label class="fm-pick-item${on ? ' sel' : ''}"><input type="checkbox" data-pick-comp data-grupo="${cod}" value="${esc(nome)}"${on ? ' checked' : ''}><span>${esc(nome)}${grupoNome ? `<small>${esc(grupoNome)}</small>` : ''}</span></label>`;
  };

  function renderGrupos() {
    q('[data-pick-grupos]').innerHTML = grupos.map((g) => {
      const n = marcados(g.codigo).length;
      return `<button type="button" class="fm-pick-g${g.codigo === ativo && !busca ? ' ativo' : ''}${n ? ' tem' : ''}" data-pick-grupo="${g.codigo}"><span>${esc(g.nome)}</span>${n ? `<b>${n}</b>` : ''}</button>`;
    }).join('');
  }

  function renderPainel() {
    const painel = q('[data-pick-painel]');
    if (busca.trim()) {
      const achados = buscarItens(base, busca);
      painel.innerHTML = `<div class="fm-pick-cab"><strong>Resultado da busca</strong><span class="fm-mm">${achados.length} item(ns)</span></div>`
        + (achados.length
          ? `<div class="fm-pick-lista">${achados.map((a) => linhaItem(a.grupo, a.nome, { grupoNome: a.grupoNome })).join('')}</div>`
          : '<div class="fm-pick-vazio">Nenhum item encontrado. Escolha o grupo e use "Outro item" para digitar.</div>');
      return;
    }
    const g = grupos.find((x) => x.codigo === ativo);
    if (!g) { painel.innerHTML = '<div class="fm-pick-vazio">Nenhum grupo cadastrado.</div>'; return; }
    const doGuia = componentesDe(base, g);
    const digitados = marcados(g.codigo).filter((n) => !doGuia.includes(n));
    const tipo = tipos.get(g.codigo) || 'servico';
    painel.innerHTML = `<div class="fm-pick-cab"><strong>${esc(g.nome)}</strong>
        <span class="fm-pick-tipo" title="Peça ou serviço: define a categoria da nota fiscal no GRM">Tipo:${TIPOS.map((t) => `<label><input type="radio" name="fmPickTipo" data-pick-tipo value="${t.id}"${t.id === tipo ? ' checked' : ''}> ${t.label}</label>`).join('')}</span></div>
      ${doGuia.length || digitados.length ? `<div class="fm-pick-lista">${[...doGuia, ...digitados].map((n) => linhaItem(g.codigo, n)).join('')}</div>` : '<div class="fm-pick-vazio">Este grupo não tem itens do guia: digite abaixo o que será feito.</div>'}
      <div class="fm-pick-outro"><input class="fm-input" data-pick-outro maxlength="80" placeholder="Outro item de ${esc(g.nome)} (digite e tecle Enter)" autocomplete="off"><button type="button" class="fm-btn soft fm-mini" data-pick-add>Adicionar</button></div>`;
  }

  function renderResumo() {
    const com = grupos.filter((g) => marcados(g.codigo).length);
    q('[data-pick-resumo]').innerHTML = com.length
      ? `<span class="fm-comps-t">Itens deste pedido (${total()})</span>${com.map((g) => `<div class="fm-pick-rg"><strong>${esc(g.nome)}</strong>${marcados(g.codigo).map((n) => `<span class="fm-chip-x">${esc(n)}<button type="button" data-pick-remover data-grupo="${g.codigo}" data-nome="${esc(n)}" aria-label="Remover ${esc(n)}">✕</button></span>`).join('')}</div>`).join('')}`
      : '<div class="fm-pick-vazio fm-pick-obrig">Nenhum item marcado. Escolha um grupo à esquerda e marque o que será feito (obrigatório).</div>';
  }

  const tudo = () => { renderGrupos(); renderPainel(); renderResumo(); aoMudar(); };

  box.addEventListener('click', (e) => {
    const g = e.target.closest('[data-pick-grupo]');
    if (g) { ativo = Number(g.dataset.pickGrupo); busca = ''; q('[data-pick-busca]').value = ''; renderGrupos(); renderPainel(); return; }
    const rem = e.target.closest('[data-pick-remover]');
    if (rem) { alternar(rem.dataset.grupo, rem.dataset.nome, false); tudo(); return; }
    if (e.target.closest('[data-pick-add]')) adicionarDigitado();
  });
  box.addEventListener('change', (e) => {
    const c = e.target.closest('[data-pick-comp]');
    if (c) {
      alternar(c.dataset.grupo, c.value, c.checked);
      c.closest('.fm-pick-item')?.classList.toggle('sel', c.checked);
      renderGrupos(); renderResumo(); aoMudar();
      return;
    }
    if (e.target.matches('[data-pick-tipo]') && ativo != null) tipos.set(ativo, e.target.value);
  });
  box.addEventListener('input', (e) => {
    if (e.target.matches('[data-pick-busca]')) { busca = e.target.value; renderGrupos(); renderPainel(); }
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-pick-outro]')) { e.preventDefault(); adicionarDigitado(); }
  });

  function adicionarDigitado() {
    const campo = q('[data-pick-outro]'); if (!campo || ativo == null) return;
    const nome = campo.value.trim();
    if (!nome) return;
    alternar(ativo, nome, true);
    tudo();
    q('[data-pick-outro]')?.focus();
  }

  tudo();
  return { ler: () => itensDaSelecao(selecao, tipos, grupos), qtd: total };
}
