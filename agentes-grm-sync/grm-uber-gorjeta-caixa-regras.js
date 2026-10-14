// @ts-check
'use strict';

/*
 * Regras puras do agente sync-uber-gorjeta-caixa (gorjeta do Uber lançada como Adiantamento
 * no Caixa do colaborador). Separadas do Puppeteer para poderem ser testadas sem abrir o GRM.
 *
 * A conferência é pelo relatório de Caixa da API (grm-caixa-ui.movimentosCaixaGrm), não pela
 * lista da tela: a lista só mostra uma janela de datas, e a data do lançamento é o dia da
 * corrida, que pode ser antiga ou futura em relação a essa janela. Na API, Adiantamento é
 * ofmType 'C' (Tipo da Despesa "Adiantamento").
 */

/** @param {unknown} value */
function norm(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

const mesmoValor = (/** @type {unknown} */ a, /** @type {unknown} */ b) => Math.abs(Number(a || 0) - Number(b || 0)) < 0.005;

/** @param {{ tipo?: string }} movimento */
function ehAdiantamento(movimento) {
  return movimento?.tipo === 'C';
}

/**
 * movimentos: os do colaborador no mês da data do lançamento.
 *   CRIAR      — não há Adiantamento com essa descrição: pode lançar.
 *   JA_EXISTE  — há um com o mesmo valor: só confirma (não duplica).
 *   DIVERGENTE — há Adiantamento com essa descrição e valor diferente: bloqueia (decisão humana).
 * @param {Array<{ descricao?: string, valor?: number, tipo?: string }>} movimentos
 * @param {string} descricao descrição do lançamento (única por gorjeta)
 * @param {number} valor
 */
function avaliarExistenteApi(movimentos, descricao, valor) {
  const alvo = norm(descricao);
  const doTipo = (movimentos || []).filter((m) => ehAdiantamento(m) && norm(m.descricao) === alvo);
  if (!doTipo.length) return { acao: 'CRIAR' };
  const exato = doTipo.find((m) => mesmoValor(m.valor, valor));
  return exato ? { acao: 'JA_EXISTE', row: exato } : { acao: 'DIVERGENTE', rows: doTipo };
}

module.exports = { norm, mesmoValor, ehAdiantamento, avaliarExistenteApi };
