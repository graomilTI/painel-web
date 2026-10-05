'use strict';

/*
 * Regras puras do agente sync-ajuda-custo-caixa (lançamento de Ajuda de Custo no
 * Caixa do colaborador no GRM). Separadas do Puppeteer pra poderem ser testadas
 * sem abrir o GRM: test-ajuda-custo-caixa.js.
 *
 * Cada ajuda de custo vira DOIS movimentos no Caixa, com a MESMA descrição:
 *   ADIANTAMENTO — entrada do dinheiro entregue ao colaborador (iFood/Flash);
 *   COMPROVANTE  — a despesa que justifica o adiantamento (Tipo da Despesa = Ajuda de Custo).
 * Como a descrição é igual, a checagem de duplicidade não pode olhar só a descrição:
 * olhar só ela faria o Comprovante achar o Adiantamento recém-lançado e "já existir".
 * O que separa os dois na lista do Caixa é a coluna de categoria, que só o Comprovante tem.
 */

const TIPO_DESPESA_PADRAO = 'Ajuda de Custo';
const TIPO_DOCUMENTO_PADRAO = 'Cupom Fiscal';

function norm(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function brMoneyText(value) {
  return Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 'YYYY-MM-DD' (coluna date do Postgres) -> 'DD/MM/YYYY' (campo Data do GRM).
function dataLancamentoBr(job) {
  const m = String(job?.data_lancamento || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) throw new Error(`Data de lançamento inválida: ${job?.data_lancamento}`);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// A RPC já grava a descrição final ("<descrição do RH> - MM/AAAA"); o GRM aceita até 250.
function descricaoGrm(job) {
  const texto = String(job?.descricao_grm || '').trim();
  if (!texto) throw new Error('Lançamento sem descrição para o GRM.');
  return texto.slice(0, 250);
}

function linhaTemValor(row, valor) {
  const esperado = brMoneyText(valor);
  return (row.cells || []).some((cell) => String(cell).includes(esperado)) || String(row.text || '').includes(esperado);
}

// Comprovante tem uma célula exatamente igual ao Tipo da Despesa; Adiantamento não.
function movimentoDaLinha(row, tipoDespesa = TIPO_DESPESA_PADRAO) {
  const categoria = norm(tipoDespesa);
  return (row.cells || []).some((cell) => norm(cell) === categoria) ? 'COMPROVANTE' : 'ADIANTAMENTO';
}

// rows: linhas da lista do Caixa que contêm a descrição do lançamento.
//   CRIAR      — não há movimento deste tipo com essa descrição: pode lançar.
//   JA_EXISTE  — já há movimento do mesmo tipo, com o mesmo valor: só confirma (não duplica).
//   DIVERGENTE — há movimento do mesmo tipo com valor diferente: bloqueia (decisão humana).
function avaliarExistente(rows, job, tipoDespesa = TIPO_DESPESA_PADRAO) {
  const doMesmoTipo = (rows || []).filter((row) => movimentoDaLinha(row, tipoDespesa) === job.movimento);
  if (!doMesmoTipo.length) return { acao: 'CRIAR' };
  const exato = doMesmoTipo.find((row) => linhaTemValor(row, job.valor));
  return exato ? { acao: 'JA_EXISTE', row: exato } : { acao: 'DIVERGENTE', rows: doMesmoTipo };
}

module.exports = {
  TIPO_DESPESA_PADRAO,
  TIPO_DOCUMENTO_PADRAO,
  norm,
  brMoneyText,
  dataLancamentoBr,
  descricaoGrm,
  linhaTemValor,
  movimentoDaLinha,
  avaliarExistente,
};
