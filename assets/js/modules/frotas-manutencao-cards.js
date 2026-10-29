// Frotas · Manutenção › Corretiva: montagem de HTML da tela por etapas (cartões de etapa com contador e um cartão por
// manutenção, com os itens marcáveis e a coluna de ações à direita), no modelo de Compras. Sem acesso ao banco.
import { esc } from '../core/ui.js';
import { cardFiltro } from './frotas-ui-lista.js?v=20261029-frotas-manut50';
import { codigoManutencao } from './frotas-manutencao-regras.js?v=20261029-frotas-manut50';
import { rotuloCidadeUf } from './frotas-manutencao-cidades.js?v=20261029-frotas-manut50';
import { COLUNAS, ETAPAS, acoesDoCard } from './frotas-manutencao-etapas.js?v=20261029-frotas-manut50';

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
  atualizar: svg('<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>'),
};

// ---------- casca e etapas ----------
// Atualizar e Nova manutenção, só com ícone. No painel de Frotas ficam na linha das abas (à direita); sem essa linha (tela avulsa),
// vão numa barra no alto da própria tela.
export function htmlBotoesTopo() {
  return `<button class="fm-hub-btn" type="button" data-acao="atualizar" title="Atualizar" aria-label="Atualizar">${ICONES.atualizar}</button><button class="fm-hub-btn primary" type="button" data-acao="nova" title="Nova manutenção" aria-label="Nova manutenção">${ICONES.mais}</button>`;
}

export function htmlCasca({ comTopo = true } = {}) {
  return `<section class="fm-shell">
    ${comTopo ? `<div class="fm-topo"><div class="fm-head-actions">${htmlBotoesTopo()}</div></div>` : ''}
    <div class="fm-kpis fm-etapas" data-etapas></div>
    <div class="fm-card"><div class="fm-body">
      <div class="fm-bar"><div class="fm-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input class="fm-input" placeholder="Buscar por código, placa, serviço, peça, oficina, motorista, categoria..." data-busca></div>
      <span class="fm-count" data-contagem>0 manutenção(ões)</span></div>
      <div class="fm-mcs" data-lista></div>
      <div class="fm-nota" data-nota-etapa></div>
    </div></div></section>`;
}

// Uma etapa por cartão (como os cartões-filtro de Compras): o número é a quantidade e o clique troca a lista abaixo.
const VISUAL_ETAPA = {
  cotacoes: ['purple', 'dinheiro'], andamento: ['amber', 'ferramenta'],
  apagar: ['red', 'relogio'], nf: ['blue', 'anexo'], concluido: ['green', 'ok'], canceladas: ['red', 'erro'],
};

export function htmlEtapas(contagens, ativa) {
  return ETAPAS.map((e) => cardFiltro({
    filtro: e.id, label: e.rotulo, tone: VISUAL_ETAPA[e.id][0], icone: VISUAL_ETAPA[e.id][1],
    valor: String(contagens[e.id] || 0), dica: e.dica, ativo: e.id === ativa,
  })).join('');
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

// ---------- cabeçalho ordenável ----------
// Clicar numa coluna ordena por ela; clicar de novo inverte (▲ crescente, ▼ decrescente).
export function htmlCabecalho(ordem) {
  const colunas = COLUNAS.map((c) => {
    const ativa = ordem?.coluna === c.id;
    const seta = ativa ? (ordem.sentido === 'desc' ? '▼' : '▲') : '';
    return `<button type="button" class="fm-mc-cab-col${ativa ? ' ativa' : ''}" data-ordenar="${c.id}" aria-sort="${ativa ? (ordem.sentido === 'desc' ? 'descending' : 'ascending') : 'none'}" title="Ordenar por ${esc(c.rotulo)}">${esc(c.rotulo)}<span aria-hidden="true">${seta}</span></button>`;
  }).join('');
  return `<div class="fm-mc-cab" role="row"><span></span>${colunas}<span></span></div>`;
}

const dataCurta = (ts) => (ts ? new Date(ts).toLocaleDateString('pt-BR') : '—');
const hojeISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const dataDia = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');

// ---------- cartão de manutenção ----------
export function htmlCard(m, c) {
  const itens = c.itensPorManut.get(m.id) || [];
  const orcs = c.orcsPorManut.get(m.id) || [];
  const notas = c.notasPorManut.get(m.id) || [];
  const aberto = c.aberto === m.id;
  const acoes = acoesDoCard(m, { podeAprovar: c.podeAprovar, itens, orcamentos: orcs, notas });
  return `<article class="fm-mc${aberto ? ' aberto' : ''}" data-mc="${esc(m.id)}">
    <div class="fm-mc-corpo">
      <div class="fm-mc-topo" data-abrir="${esc(m.id)}" role="button" tabindex="0" aria-expanded="${aberto}" title="${esc([m.__modelo, m.descricao].filter(Boolean).join(' · '))}">
        <span class="fm-mc-seta" aria-hidden="true">▸</span>
        <div class="fm-mc-cel" data-rot="Código"><strong>${esc(codigoManutencao(m))}</strong>${m.os_numero ? `<span class="fm-mm">${esc(m.os_numero)}</span>` : ''}</div>
        <div class="fm-mc-cel" data-rot="Placa"><strong>${esc(m.__placa || '—')}</strong></div>
        <div class="fm-mc-cel" data-rot="Responsável">${esc(m.solicitante_nome || '—')}</div>
        <div class="fm-mc-cel" data-rot="Cidade/UF">${esc(rotuloCidadeUf(m) || '—')}</div>
        <div class="fm-mc-cel" data-rot="Entrada">${esc(dataCurta(m.solicitado_em))}</div>
        <div class="fm-mc-cel${m.previsao_entrega && m.previsao_entrega < hojeISO() && !['concluida', 'cancelada'].includes(m.status) ? ' fm-atraso' : ''}" data-rot="Previsão">${esc(dataDia(m.previsao_entrega))}</div>
        ${htmlAcoes(m, acoes, aberto)}
      </div>
      ${aberto ? '<div class="fm-mc-detalhe" id="fmFicha" data-detalhe></div>' : ''}
    </div>
  </article>`;
}

export function htmlCards(rows, c) {
  if (!rows.length) {
    const msg = c.etapa === 'cotacoes' ? 'Nenhuma manutenção em cotação. Use "+ Nova manutenção" para registrar uma.' : 'Nenhuma manutenção nesta etapa.';
    return `<div class="fm-empty">${esc(msg)}</div>`;
  }
  return `${htmlCabecalho(c.ordem)}${rows.map((m) => htmlCard(m, c)).join('')}`;
}
