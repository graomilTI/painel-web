// Frotas · Manutenção › Corretiva: montagem de HTML da tela por etapas (abas com contador, cartões de resumo e um cartão por
// manutenção, com os itens marcáveis e a coluna de ações à direita), no modelo de Compras. Sem acesso ao banco.
import { dinheiro, esc, tabs } from '../core/ui.js';
import { cardFiltro } from './frotas-ui-lista.js?v=20261021-frotas-manut45';
import { camposEditaveis, codigoManutencao, proximoPasso, valorDaManutencao } from './frotas-manutencao-regras.js?v=20261021-frotas-manut45';
import { ETAPAS, acoesDoCard, agruparLinhas, linhasDosItens } from './frotas-manutencao-etapas.js?v=20261021-frotas-manut45';
import { badgeStatus } from './frotas-manutencao-html.js?v=20261021-frotas-manut45';

const svg = (corpo) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${corpo}</svg>`;
export const ICONES = {
  check: svg('<polyline points="20 6 9 17 4 12"/>'),
  x: svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
  tag: svg('<path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.24L4 3a1 1 0 0 0-1 1l.24 5.59a2 2 0 0 0 .59 1.41l9.58 9.59a2 2 0 0 0 2.82 0l4.36-4.36a2 2 0 0 0 0-2.82z"/><circle cx="7.5" cy="7.5" r="1.5"/>'),
  send: svg('<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>'),
  doc: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 11 17 15 13"/>'),
  chave: svg('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4Z"/>'),
  volta: svg('<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>'),
  ver: svg('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
  mais: svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
};

// ---------- casca, abas e resumo ----------
export function htmlCasca() {
  return `<div class="frotas-hub-tabs fm-etapas" data-etapas></div>
  <section class="fm-shell">
    <div class="fm-topo"><div class="fm-head-actions"><button class="fm-btn soft" type="button" data-acao="atualizar">↻ Atualizar</button><button class="fm-btn primary" type="button" data-acao="nova">+ Nova manutenção</button></div></div>
    <div class="fm-kpis" data-kpis></div>
    <div class="fm-card"><div class="fm-body">
      <div class="fm-bar"><div class="fm-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input class="fm-input" placeholder="Buscar por código, placa, serviço, peça, oficina, motorista, categoria..." data-busca></div>
      <span data-chip></span><span class="fm-count" data-contagem>0 manutenção(ões)</span></div>
      <div class="fm-mcs" data-lista></div>
      <div class="fm-nota" data-nota-etapa></div>
    </div></div></section>`;
}

export function htmlEtapas(contagens, ativa) {
  return tabs({
    itens: ETAPAS.map((e) => ({ id: e.id, label: e.rotulo, badge: contagens[e.id] > 0 ? contagens[e.id] : null })),
    ativo: ativa, attr: 'data-etapa',
  });
}

// Cartões de resumo da etapa aberta: filtram (urgentes, parados) e somam o valor.
export function htmlResumo(lista, resumo, orcsPorManut) {
  const urgentes = lista.filter((m) => m.prioridade === 'urgente' || m.prioridade === 'alta').length;
  const parados = lista.filter((m) => m.veiculo_parado).length;
  const valor = lista.reduce((s, m) => s + (valorDaManutencao(m, orcsPorManut.get(m.id) || [])?.valor || 0), 0);
  return cardFiltro({ filtro: 'todos', label: 'Todas da etapa', tone: 'blue', icone: 'total', valor: String(lista.length), ativo: resumo === 'todos' })
    + (urgentes || resumo === 'urgentes' ? cardFiltro({ filtro: 'urgentes', label: 'Urgentes e altas', tone: 'red', icone: 'alerta', valor: String(urgentes), ativo: resumo === 'urgentes' }) : '')
    + (parados || resumo === 'parados' ? cardFiltro({ filtro: 'parados', label: 'Veículo parado', tone: 'amber', icone: 'carro', valor: String(parados), ativo: resumo === 'parados' }) : '')
    + (valor > 0 ? cardFiltro({ label: 'Valor da etapa', tone: 'green', icone: 'dinheiro', valor: dinheiro(valor), dica: 'Soma do valor mais recente de cada manutenção da etapa (final, aprovado ou o menor orçamento)' }) : '');
}

// ---------- itens marcáveis ----------
function htmlLinha(l, { selecionavel, marcada }) {
  const tipo = l.maoDeObra ? 'Mão de obra' : l.tipo === 'servico' ? 'Serviço' : 'Peça';
  const miolo = `<span class="fm-mc-nome">${esc(l.nome)}</span>${l.detalhe ? `<em class="fm-chip-peca">${esc(l.detalhe)}${l.valor != null ? ` · ${esc(dinheiro(l.valor))}` : ''}</em>` : ''}<em class="fm-mc-tipo ${l.tipo}">${esc(tipo)}</em>`;
  return selecionavel
    ? `<label class="fm-mc-linha${marcada ? ' sel' : ''}${l.tipo === 'servico' ? ' servico' : ''}"><input type="checkbox" data-check-linha value="${esc(l.key)}"${marcada ? ' checked' : ''}>${miolo}</label>`
    : `<span class="fm-mc-linha${l.tipo === 'servico' ? ' servico' : ''}">${miolo}</span>`;
}

function htmlItens(m, linhas, { selecionavel, marcadas, editavel }) {
  const adicionar = editavel ? `<button type="button" class="fm-link" data-mc-acao="itens-add" data-id="${esc(m.id)}" title="Abrir a ficha e escolher peças, mão de obra ou digitar o serviço realizado">+ Peças, mão de obra ou serviço</button>` : '';
  if (!linhas.length) {
    return `<div class="fm-mc-itens"><div class="fm-mc-itens-cab"><span class="fm-mm">Nenhum item informado. Informe ao menos um para cotar e aprovar.</span>${adicionar}</div></div>`;
  }
  const noSel = linhas.filter((l) => marcadas.has(l.key)).length;
  const cab = `<div class="fm-mc-itens-cab">${selecionavel
    ? `<label class="fm-mc-todas"><input type="checkbox" data-check-todas data-id="${esc(m.id)}"${noSel === linhas.length ? ' checked' : ''}> <span>Marcar tudo</span></label><span class="fm-mm" data-sel-resumo>${noSel ? `${noSel} de ${linhas.length} marcado(s) para a cotação` : 'Marque o que vai para a cotação; sem marcação segue tudo.'}</span>`
    : `<span class="fm-mm">${linhas.length} item(ns) desta manutenção</span>`}${adicionar}</div>`;
  const grupos = agruparLinhas(linhas).map((g, i) => {
    const marcadasDoGrupo = g.linhas.filter((l) => marcadas.has(l.key)).length;
    const titulo = selecionavel
      ? `<label class="fm-mc-gtit"><input type="checkbox" data-check-grupo${marcadasDoGrupo === g.linhas.length ? ' checked' : ''}><strong>${esc(g.grupo)}</strong></label>`
      : `<div class="fm-mc-gtit"><strong>${esc(g.grupo)}</strong></div>`;
    return `<div class="fm-mc-grupo" data-mc-grupo="${i}">${titulo}<div class="fm-mc-linhas">${g.linhas.map((l) => htmlLinha(l, { selecionavel, marcada: marcadas.has(l.key) })).join('')}</div></div>`;
  }).join('');
  return `<div class="fm-mc-itens">${cab}${grupos}</div>`;
}

// ---------- coluna de ações ----------
function htmlAcoes(m, acoes, aberto) {
  const botoes = acoes.map((a) => {
    const titulo = a.bloqueio ? `${a.titulo} — ${a.bloqueio}` : a.titulo;
    return `<button type="button" class="fm-ic-act tom-${esc(a.id)}" data-mc-acao="${esc(a.id)}" data-id="${esc(m.id)}" title="${esc(titulo)}" aria-label="${esc(a.titulo)}"${a.bloqueio ? ' disabled' : ''}>${ICONES[a.icone] || ICONES.check}</button>`;
  }).join('');
  const ver = `<button type="button" class="fm-ic-act tom-detalhes${aberto ? ' on' : ''}" data-mc-acao="detalhes" data-id="${esc(m.id)}" title="${aberto ? 'Recolher os detalhes' : 'Ver detalhes, orçamentos e notas'}" aria-label="Detalhes" aria-expanded="${aberto}">${ICONES.ver}</button>`;
  return `<div class="fm-mc-acoes" role="group" aria-label="Ações">${botoes}${ver}</div>`;
}

// ---------- cartão de manutenção ----------
export function htmlCard(m, c) {
  const itens = c.itensPorManut.get(m.id) || [];
  const orcs = c.orcsPorManut.get(m.id) || [];
  const notas = c.notasPorManut.get(m.id) || [];
  const linhas = linhasDosItens(itens, c.base);
  const aberto = c.aberto === m.id;
  const selecionavel = c.etapa === 'solicitacoes';
  const passo = proximoPasso(m, { notas });
  const valor = valorDaManutencao(m, orcs);
  const alta = m.prioridade === 'alta' || m.prioridade === 'urgente' ? `<span class="fm-badge ${m.prioridade === 'urgente' ? 'red' : 'amber'}">${m.prioridade === 'urgente' ? 'Urgente' : 'Alta'}</span>` : '';
  const parado = m.veiculo_parado ? '<span class="fm-badge red" title="Veículo parado enquanto a OS estiver em execução">Parado</span>' : '';
  const preventiva = m.natureza === 'preventiva' ? '<span class="fm-badge green">Preventiva</span>' : '';
  const origem = m.dividida_de && c.codigoDe(m.dividida_de) ? `<span class="fm-mm">separada de ${esc(c.codigoDe(m.dividida_de))}</span>` : '';
  const acoes = acoesDoCard(m, { podeAprovar: c.podeAprovar, itens, orcamentos: orcs, notas });
  return `<article class="fm-mc${aberto ? ' aberto' : ''}" data-mc="${esc(m.id)}">
    <div class="fm-mc-corpo">
      <div class="fm-mc-topo" data-abrir="${esc(m.id)}" role="button" tabindex="0" aria-expanded="${aberto}">
        <span class="fm-mc-seta" aria-hidden="true">▸</span>
        <div class="fm-mc-cod"><strong>${esc(codigoManutencao(m))}</strong>${m.os_numero ? `<span class="fm-mm">${esc(m.os_numero)}</span>` : ''}${origem}</div>
        <div class="fm-mc-veic"><strong>${esc(m.__placa || '—')}</strong><span class="fm-mm">${esc(m.__modelo || '')}${m.__coordenacao ? ` · ${esc(m.__coordenacao)}` : ''}</span></div>
        <div class="fm-mc-desc"><span>${esc((m.descricao || '').slice(0, 110))}${(m.descricao || '').length > 110 ? '…' : ''}</span><div class="fm-chips"><span class="fm-badge ${passo.tone}">${esc(passo.rotulo)}</span>${alta}${parado}${preventiva}${m.status === 'em_aprovacao' || m.status === 'reprovada' ? badgeStatus(m.status) : ''}</div></div>
        <div class="fm-mc-val">${valor ? `<strong>${esc(dinheiro(valor.valor))}</strong><span class="fm-mm">${esc(valor.rotulo)}</span>` : '<span class="fm-mm">—</span>'}</div>
        <div class="fm-mc-quando"><strong>${m.solicitado_em ? esc(new Date(m.solicitado_em).toLocaleDateString('pt-BR')) : '—'}</strong><span class="fm-mm">${esc(m.solicitante_nome || '')}</span></div>
      </div>
      ${htmlItens(m, linhas, { selecionavel, marcadas: c.marcadasDe(m.id), editavel: camposEditaveis(m.status).itens })}
      ${aberto ? '<div class="fm-mc-detalhe" id="fmFicha" data-detalhe></div>' : ''}
    </div>
    ${htmlAcoes(m, acoes, aberto)}
  </article>`;
}

export function htmlCards(rows, c) {
  if (!rows.length) {
    const msg = c.etapa === 'solicitacoes' ? 'Nenhuma solicitação aguardando. Use "+ Nova manutenção" para registrar um pedido.' : 'Nenhuma manutenção nesta etapa.';
    return `<div class="fm-empty">${esc(msg)}</div>`;
  }
  return rows.map((m) => htmlCard(m, c)).join('');
}
