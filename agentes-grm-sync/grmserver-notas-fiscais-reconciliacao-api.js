#!/usr/bin/env node

/**
 * Reconciliação de Notas Fiscais: re-sincroniza uma janela bem mais larga
 * (padrão mínimo de 400 dias) do que o agente rápido (grmserver-notas-fiscais-api.js,
 * 30 dias). Achado 17/09 comparando o DRE com o Relatório de Notas Fiscais
 * oficial da GRM: sobravam algumas notas por mês (2 a 7, ~R$4-33 mil) que
 * nunca chegavam a sincronizar - a hipótese mais provável é nota lançada
 * atrasada na GRM (Data N.F. de um dia, mas só cadastrada no sistema semanas
 * depois), que "perde o trem" da janela rolante de 30 dias antes mesmo de
 * existir na GRM. Rodando 1x/dia com uma janela mínima de 400 dias, qualquer nota
 * atrasada tem várias chances de ser pega antes de sair da janela também
 * dessa reconciliação. Reaproveita login/fetch/upsert do agente rápido -
 * mesma tabela, mesmo onConflict (empresa,fatura); só muda o daysBack.
 */

require('dotenv').config();
const { login, fetchReportDataRange, upsertDataRange } = require('./grmserver-notas-fiscais-api');

const diasConfigurados = Number(process.env.GRM_NOTAS_RECONCILIACAO_DIAS || 400);
const DIAS_RECONCILIACAO = Number.isFinite(diasConfigurados) ? Math.max(400, diasConfigurados) : 400;
const COMPETENCIA = String(process.env.GRM_NOTAS_COMPETENCIA || '').trim();
const faturaLookbackConfigurado = Number(process.env.GRM_NOTAS_FATURA_LOOKBACK_MESES || 24);
const FATURA_LOOKBACK_MESES = Number.isFinite(faturaLookbackConfigurado) ? Math.max(1, faturaLookbackConfigurado) : 24;
const faturaLookaheadConfigurado = Number(process.env.GRM_NOTAS_FATURA_LOOKAHEAD_MESES || 6);
const FATURA_LOOKAHEAD_MESES = Number.isFinite(faturaLookaheadConfigurado) ? Math.max(0, faturaLookaheadConfigurado) : 6;
const FATURA_CHUNK_MESES = 9;

function log(level, msg) { console.log(`[${level}] ${new Date().toISOString()} - ${msg}`); }

function formatBrDate(date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function parseCompetencia(value) {
  const m = /^(20\d{2})-(0[1-9]|1[0-2])$/.exec(String(value || '').trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, 1, 12, 0, 0, 0);
}

function splitInvoiceRange(start, end, chunkMonths = FATURA_CHUNK_MESES) {
  const chunks = [];
  let cursor = new Date(start);

  while (cursor <= end) {
    let chunkEnd = new Date(cursor.getFullYear(), cursor.getMonth() + chunkMonths, 0, 12, 0, 0, 0);
    if (chunkEnd > end) chunkEnd = new Date(end);
    chunks.push({ from: formatBrDate(cursor), to: formatBrDate(chunkEnd) });
    cursor = new Date(chunkEnd.getFullYear(), chunkEnd.getMonth() + 1, 1, 12, 0, 0, 0);
  }

  return chunks;
}

function buildMonthRanges(daysBack) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  const competenciaDate = parseCompetencia(COMPETENCIA);
  if (COMPETENCIA && !competenciaDate) {
    throw new Error('GRM_NOTAS_COMPETENCIA inválida. Use YYYY-MM, por exemplo 2026-01.');
  }

  const start = competenciaDate || (() => {
    const d = new Date(today);
    d.setDate(d.getDate() - daysBack);
    d.setDate(1);
    return d;
  })();

  const ranges = [];
  let cursor = new Date(start);

  while (cursor <= today) {
    const noteStart = new Date(cursor);
    let noteEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 12, 0, 0, 0);
    if (noteEnd > today) noteEnd = new Date(today);

    // Procura faturamentos muito anteriores OU posteriores à competência da NF
    // sem ultrapassar o limite aceito pela API. Ex.: NF em 01/2026 com Fatura
    // em 27/03/2025, ou NF em 08/2026 com Fatura em 23/09/2026. A Data da
    // Fatura é dividida em blocos de no máximo 9 meses, mantendo a Data N.F. fixa.
    const invoiceStart = new Date(
      noteStart.getFullYear(),
      noteStart.getMonth() - FATURA_LOOKBACK_MESES,
      1, 12, 0, 0, 0
    );
    const invoiceEnd = new Date(
      noteStart.getFullYear(),
      noteStart.getMonth() + FATURA_LOOKAHEAD_MESES + 1,
      0, 12, 0, 0, 0
    );
    const invoiceChunks = splitInvoiceRange(invoiceStart, invoiceEnd);

    ranges.push({
      note: { from: formatBrDate(noteStart), to: formatBrDate(noteEnd) },
      invoiceStart: formatBrDate(invoiceStart),
      invoiceEnd: formatBrDate(invoiceEnd),
      invoiceChunks,
    });

    if (competenciaDate) break;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1, 12, 0, 0, 0);
  }

  return ranges;
}

async function main() {
  const escopo = COMPETENCIA ? `competência ${COMPETENCIA}` : `${DIAS_RECONCILIACAO} dias`;
  log('INFO', `=== Notas Fiscais - Reconciliação (${escopo}, faturas ${FATURA_LOOKBACK_MESES} meses antes até ${FATURA_LOOKAHEAD_MESES} meses depois) ===`);
  const token = await login();
  const ranges = buildMonthRanges(DIAS_RECONCILIACAO);

  for (let i = 0; i < ranges.length; i += 1) {
    const { note, invoiceStart, invoiceEnd, invoiceChunks } = ranges[i];
    log('INFO', `Competência ${i + 1}/${ranges.length}: NF ${note.from} até ${note.to} | Fatura ${invoiceStart} até ${invoiceEnd} em ${invoiceChunks.length} bloco(s)`);

    const merged = new Map();
    for (let j = 0; j < invoiceChunks.length; j += 1) {
      const invoice = invoiceChunks[j];
      log('INFO', `  Bloco fatura ${j + 1}/${invoiceChunks.length}: ${invoice.from} até ${invoice.to}`);
      const data = await fetchReportDataRange(token, note, invoice);
      for (const row of data) {
        const empresa = String(row['Empresa'] || '').trim();
        const fatura = String(row['Fatura'] ?? '').trim();
        const key = empresa && fatura ? `${empresa}|${fatura}` : JSON.stringify(row);
        merged.set(key, row);
      }
    }

    const data = [...merged.values()];
    log('INFO', `Competência consolidada: ${data.length} registro(s) únicos.`);
    await upsertDataRange(
      data,
      note,
      { from: invoiceStart, to: invoiceEnd },
      { cleanup: false }
    );
  }

  log('SUCCESS', `Reconciliação de Notas Fiscais concluída em ${ranges.length} competência(s)!`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((error) => {
    log('ERROR', error.stack || error.message);
    process.exit(1);
  });
  // A reconciliação consulta competência por competência e pode dividir a Data
  // da Fatura em vários blocos; o timeout cobre as consultas sequenciais.
  setTimeout(() => process.exit(1), 600000);
}
