// Frotas · Manutenção › HTML: peças comuns (listas de opções, itens do guia, selo de status, erros).
import { esc } from '../core/ui.js';
import { descreverIntervalo, grupoDaCategoria, itensDoGrupo, planosDaCategoria, statusInfo, tipoDoComponente } from './frotas-manutencao-regras.js?v=20261029-frotas-inst81';

export const TIPOS_ITEM = [{ id: 'servico', label: 'Serviço' }, { id: 'peca', label: 'Peça' }];

const fmtKm = (v) => (v == null || v === '' ? '—' : `${Number(v).toLocaleString('pt-BR')} km`);

// Data no horário local (o banco guarda timestamptz em UTC; perto da meia-noite o dia mudaria).
export const hojeISO = () => new Date().toISOString().slice(0, 10);

export function opcoes(lista, selecionado, { vazio = null, valor = 'id', rotulo = 'label' } = {}) {
  const base = vazio == null ? '' : `<option value="">${esc(vazio)}</option>`;
  return base + lista.map((o) => `<option value="${esc(o[valor])}"${String(o[valor]) === String(selecionado ?? '') ? ' selected' : ''}>${esc(o[rotulo])}</option>`).join('');
}

// Grupos do guia (Suspensão, Freios, Motor...). Sem grupos cadastrados, cai nas categorias (sistemas) como antes.
export function opcoesGrupos(base, selecionado, vazio = 'Selecione...') {
  const lista = (base.grupos || []).length
    ? base.grupos.map((g) => ({ valor: g.codigo, rotulo: g.nome }))
    : base.categorias.filter((c) => c.ativo !== false).map((c) => ({ valor: c.codigo, rotulo: `${String(c.codigo).padStart(2, '0')} · ${c.nome}` }));
  return `<option value="">${esc(vazio)}</option>` + lista.map((o) => `<option value="${o.valor}"${Number(selecionado) === Number(o.valor) ? ' selected' : ''}>${esc(o.rotulo)}</option>`).join('');
}

// Valor do seletor de um item: o grupo da categoria gravada (ou ela mesma, se não há grupos).
export const grupoDoItem = (base, categoria) => ((base.grupos || []).length ? grupoDaCategoria(base.categorias, categoria) : categoria);

export function opcoesPlanos(planos, categoria, selecionado) {
  const lista = categoria ? planosDaCategoria(planos, categoria) : [];
  return '<option value="">— nenhum —</option>' + lista.map((p) =>
    `<option value="${esc(p.id)}"${p.id === selecionado ? ' selected' : ''}>${esc(p.nome)} (${esc(descreverIntervalo(p))})</option>`).join('');
}

// Itens do guia dentro do serviço: uma caixa por componente/peça da categoria (marcados = nomes já escolhidos).
export function htmlComponentes(nomes, marcados = [], { titulo = 'Itens do guia', servicos = new Set() } = {}) {
  if (!nomes.length) return '';
  return `<div class="fm-comps"><span class="fm-comps-t">${esc(titulo)}</span>${nomes.map((n) => `<label class="fm-comp${servicos.has(n) ? ' servico' : ''}"><input type="checkbox" data-comp value="${esc(n)}"${marcados.includes(n) ? ' checked' : ''}> ${esc(n)}${servicos.has(n) ? ' <em class="fm-pick-tag">serviço</em>' : ''}</label>`).join('')}</div>`;
}

// Itens do grupo para marcar na ficha: peças do guia, serviços do guia e Mão de obra (com a etiqueta "serviço" onde for o caso).
export function htmlItensDoGrupo(base, grupo, marcados = []) {
  const nomes = itensDoGrupo(base.componentes, grupo, marcados);
  const servicos = new Set(nomes.filter((n) => tipoDoComponente(base.componentes, grupo, n) === 'servico'));
  return htmlComponentes(nomes, marcados, { servicos });
}

export function badgeStatus(status) {
  const s = statusInfo(status);
  return `<span class="fm-badge ${s.tone}">${esc(s.label)}</span>`;
}

export function htmlErros(erros) {
  return erros.length ? `<ul class="fm-erros">${erros.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : '';
}
