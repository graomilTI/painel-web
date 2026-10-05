'use strict';

/*
 * Travas compartilhadas pelos agentes que RECUSAM despesas do Caixa Operacional do GRM:
 *   - sync-despesas-retroativas (pendências "órfãs" que sobram depois da aprovada)
 *   - sync-despesas-duplicadas  (duplicadas no mesmo dia / data citada na observação)
 *
 * Recusar é a parte que tira dinheiro do colaborador, então só se recusa o que é mesmo
 * cópia do lançamento que fica. Ficam pendentes para revisão humana (nunca recusadas):
 *   - observação que cita outra despesa ("janta", "km rodado"...): lançada na categoria errada;
 *   - observação que cita outra pessoa ("Almoço do Bruno, funcionário em treinamento");
 *   - observação de extra (Salário Família, complemento, diferença de valor...);
 *   - valor MAIOR que o do lançamento que ficaria (a recusa deixaria o colaborador com menos).
 * Auditoria de 04/10/2026: sem essas travas o bot recusou um Almoço de R$ 30 mantendo o de R$ 3,
 * a Diária de R$ 105 que o próprio colaborador disse ser a certa, almoço/janta digitados como
 * Salário de Intermitente, "km rodado" e despesas de terceiros.
 */

const norm = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

const addDias = (iso, n) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);

// ---- data citada na observação --------------------------------------------------
// Devolve a data (ISO) citada na observação ou null. Só vale entre 45 dias antes e 7 dias
// depois da data do lançamento. Mesma regra dos scripts pontuais de 01/10.
const DATE_RE = /(?<!\d)(\d{1,2})\s*([/.-])\s*(\d{1,2})(?:\s*[/.-]?\s*(\d{4}|\d{2}))?(?!\d)/g;
function dateFromObs(obs, ofmIso) {
  const text = String(obs || '');
  const [y0, m0] = ofmIso.split('-').map(Number);
  const valid = (y, m, d) => {
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCMonth() !== m - 1) return null;
    const iso = dt.toISOString().slice(0, 10);
    const dias = (Date.parse(ofmIso) - Date.parse(iso)) / 86400000;
    return dias >= -7 && dias <= 45 ? iso : null;
  };
  for (const m of text.matchAll(DATE_RE)) {
    if (m[2] === '.' && m[4] === undefined) continue; // "5.5 litros" não é data
    const r = valid(y0, Number(m[3]), Number(m[1]));
    if (r) return r;
  }
  const dia = text.match(/\bdia\s+(\d{1,2})(?!\d|\s*[/.-]\s*\d)/i);
  if (dia) {
    const d = Number(dia[1]);
    const r = valid(y0, m0, d) || valid(m0 === 1 ? y0 - 1 : y0, m0 === 1 ? 12 : m0 - 1, d);
    if (r) return r;
  }
  const t = norm(text);
  if (/\bANTEONTEM\b/.test(t)) return addDias(ofmIso, -2);
  if (/\bONTEM\b/.test(t)) return addDias(ofmIso, -1);
  return null;
}

// ---- classificação das despesas ---------------------------------------------------
// Grupo de duplicidade: Salário de Intermitente e Serviços Terceirizados (> 45) são a
// mesma Diária; Serviços Terceirizados <= 45 é Almoço lançado errado. Devolve null pra
// despesas que os agentes não tratam.
function grupoDespesa(row) {
  const c = norm(row?.oexName);
  if (c === 'SERVICOS TERCEIRIZADOS') return Number(row.ofmValue) <= 45 ? 'ALMOCO' : 'DIARIA';
  if (c === 'SALARIO DE INTERMITENTE') return 'DIARIA';
  if (c === 'ALMOCO' || c === 'CAFE' || c === 'JANTA' || c === 'PERNOITE') return c;
  return null;
}

// O colaborador às vezes lança na despesa errada e diz a certa na observação (ex.:
// Pernoite com obs "janta", Salário de Intermitente com obs "almoço", "km rodado"). Esse
// lançamento não é duplicata da despesa em que foi lançado — não se recusa.
const PALAVRAS_CATEGORIA = [
  ['CAFE', /\bCAFE\b/], ['ALMOCO', /\bALMOCO\b/], ['JANTA', /\bJA[JN]TAR?\b/],
  ['PERNOITE', /\bPERNOITE\b/], ['DIARIA', /\bDIARIA\b/],
  ['KM', /\bKM\b|\bQUILOMETR/], ['COMBUSTIVEL', /\bCOMBUSTIVEL\b|\bABASTEC/], ['PEDAGIO', /\bPEDAGIO\b/],
];
function categoriaDivergente(row) {
  const texto = norm(row.ofmDescription);
  const citadas = PALAVRAS_CATEGORIA.filter(([, re]) => re.test(texto)).map(([nome]) => nome);
  return citadas.length > 0 && !citadas.includes(grupoDespesa(row)) ? citadas : null;
}

// Observação que mostra que o lançamento NÃO repete o outro do dia: é de outra pessoa
// ("Almoço do Bruno, funcionário em treinamento") ou é um extra (Salário Família, complemento,
// diferença de valor). Devolve o motivo ou null.
const TERCEIRO_RE = /\b(FUNCIONARIO|ESTAGIARIO|TREINAMENTO|TREINANDO|AJUDANTE|ACOMPANHANTE|VISITANTE|EQUIPE)\b/;
const DE_OUTRA_PESSOA_RE = /\b(ALMOCO|JANTA|JANTAR|CAFE|DIARIA|PERNOITE)\s+(DO|DA|DOS|DAS)\s+(?!DIA\b|DATA\b|MANHA\b|TARDE\b|NOITE\b|FAZENDA\b|FAZ\b|FZ\b|FZD\b|CLIENTE\b|EMPRESA\b|ARMAZEM\b|LOCAL\b|VIAGEM\b|SEMANA\b|MES\b)[A-Z]{3,}/;
const EXTRA_RE = /\b(SALARIO FAMILIA|SAL FAM|COMPLEMENT\w*|COMPLETAR|DIFERENCA|AJUSTE|ADICIONAL|REEMBOLSO|BONUS|ACERTO)\b/;
function observacaoNaoRepete(row) {
  const texto = norm(row.ofmDescription);
  if (!texto) return null;
  if (TERCEIRO_RE.test(texto) || DE_OUTRA_PESSOA_RE.test(texto)) return 'observacao_cita_outra_pessoa';
  if (EXTRA_RE.test(texto)) return 'observacao_de_extra';
  return null;
}

// Valor MAIOR que o do lançamento que ficaria: recusar deixaria o colaborador com menos do
// que pediu (ex.: Almoço R$ 3 aprovado x Almoço R$ 30 pendente) — decisão humana.
const valorMaiorQueMantido = (row, mantido) => Number(row?.ofmValue) > Number(mantido?.ofmValue) + 0.005;

// Motivo para NÃO recusar `row` como cópia de `mantido` (ou null = pode recusar).
// `comData`: também barra observação que cita outra data (o agente retroativo não olha a data
// da observação; o de duplicadas trata essa data à parte e passa false).
function motivoParaManterPendente(row, mantido, { comData = false } = {}) {
  if (categoriaDivergente(row)) return 'observacao_cita_outra_despesa';
  const naoRepete = observacaoNaoRepete(row);
  if (naoRepete) return naoRepete;
  if (comData) {
    const iso = String(row.ofmDate || '').slice(0, 10);
    const citada = iso ? dateFromObs(row.ofmDescription, iso) : null;
    if (citada && citada !== iso) return 'observacao_cita_outra_data';
  }
  if (mantido && valorMaiorQueMantido(row, mantido)) return 'valor_maior_que_o_mantido';
  return null;
}

module.exports = {
  norm,
  addDias,
  dateFromObs,
  grupoDespesa,
  categoriaDivergente,
  observacaoNaoRepete,
  valorMaiorQueMantido,
  motivoParaManterPendente,
};
