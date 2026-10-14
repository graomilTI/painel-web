// @ts-check
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

// ---- Mesma decisão, a partir do relatório de Caixa da API (14/10/2026) ----
// A lista do Caixa na tela só mostra uma janela de datas e esconde a data 15 quando ela ainda
// é futura — a checagem acima ficava cega e a conferência pós-salvar dava falso erro (caso do
// Bônus em 06/10). No relatório reports/finance/operatingFlow (movimentos já normalizados por
// grm-caixa-ui.movimentosCaixaGrm) o tipo vem explícito:
//   ofmType 'C' (Tipo da Despesa "Adiantamento")       -> ADIANTAMENTO
//   ofmType 'D' com Tipo da Despesa = Ajuda de Custo    -> COMPROVANTE
//   qualquer outro (Almoço, Diária...)                  -> null (não é deste agente)

/** @param {{ tipo?: string, tipoDespesa?: string }} movimento */
function movimentoDoRegistroApi(movimento, tipoDespesa = TIPO_DESPESA_PADRAO) {
  if (movimento?.tipo === 'C') return 'ADIANTAMENTO';
  if (movimento?.tipo === 'D' && norm(movimento.tipoDespesa) === norm(tipoDespesa)) return 'COMPROVANTE';
  return null;
}

const mesmoValor = (a, b) => Math.abs(Number(a || 0) - Number(b || 0)) < 0.005;

// movimentos: todos os do colaborador no mês da data de lançamento (a data do item é fixa).
//   CRIAR / JA_EXISTE (com o movimento) / DIVERGENTE (com os do mesmo tipo e descrição).
/**
 * @param {Array<{ descricao?: string, valor?: number, tipo?: string, tipoDespesa?: string }>} movimentos
 * @param {{ movimento: string, valor: number, descricao_grm?: string }} job
 */
function avaliarExistenteApi(movimentos, job, tipoDespesa = TIPO_DESPESA_PADRAO) {
  const descricao = norm(descricaoGrm(job));
  const doMesmoTipo = (movimentos || []).filter((m) => norm(m.descricao) === descricao
    && movimentoDoRegistroApi(m, tipoDespesa) === job.movimento);
  if (!doMesmoTipo.length) return { acao: 'CRIAR' };
  const exato = doMesmoTipo.find((m) => mesmoValor(m.valor, job.valor));
  return exato ? { acao: 'JA_EXISTE', row: exato } : { acao: 'DIVERGENTE', rows: doMesmoTipo };
}

module.exports = {
  movimentoDoRegistroApi,
  avaliarExistenteApi,
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
