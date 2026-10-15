// Financeiro — leitura e geração de planilhas (XLSX/CSV).
// Extraído de assets/js/financeiro.js em 15/10/2026 (arquivo de ~2.800 linhas). O código das funções e constantes
// foi movido sem alteração. Para publicar uma mudança em qualquer módulo de assets/js/modules/financeiro/, troque o
// token ?v=20261015-fin2 em TODOS os imports internos e nos carregadores (assets/js/financeiro.js, financeiro.html):
// tests/financeiro-modulos-versao.test.mjs garante que fiquem iguais.
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';
import { normalize } from './util.js?v=20261015-fin2';

function rowToObjectsFromMatrix(matrix) {
  const rows = matrix || [];
  const headerCandidates = [
    'situacao', 'data', 'conta', 'funcionario', 'cpf', 'data de nascimento', 'valor', 'descricao',
    'categoria', 'status', 'data de solicitacao', 'coordenacao', 'supervisao', 'fornecedor', 'cidade',
    'codigo', 'fatura', 'cliente', 'vencimento', 'valor pago', 'favorecido', 'doc'
  ];

  let headerIndex = 0;
  let bestScore = -1;
  rows.slice(0, 15).forEach((row, idx) => {
    const normalizedCells = (row || []).map((cell) => normalize(cell));
    const score = normalizedCells.filter((cell) => headerCandidates.includes(cell)).length;
    if (score > bestScore) {
      bestScore = score;
      headerIndex = idx;
    }
  });

  const headers = (rows[headerIndex] || []).map((header, idx) => String(header || `Coluna ${idx + 1}`).trim() || `Coluna ${idx + 1}`);
  return rows.slice(headerIndex + 1).map((row) => {
    const obj = {};
    headers.forEach((header, idx) => { obj[header] = row?.[idx] ?? ''; });
    return obj;
  }).filter((row) => Object.values(row).some((value) => String(value ?? '').trim() !== ''));
}

function readWorkbookRows(file) {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const firstSheet = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheet];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
    return rowToObjectsFromMatrix(matrix);
  });
}

function worksheetFromObjects(rows, columns) {
  const data = [columns.map((c) => c.label)];
  rows.forEach((row) => data.push(columns.map((c) => c.format ? c.format(row[c.key], row) : row[c.key])));
  return XLSX.utils.aoa_to_sheet(data);
}

function downloadWorkbook(filename, sheets) {
  const wb = XLSX.utils.book_new();
  sheets.forEach((sheet) => {
    XLSX.utils.book_append_sheet(wb, sheet.ws, sheet.name.slice(0, 31));
  });
  XLSX.writeFile(wb, filename);
}

function downloadCsv(filename, rows, columns) {
  const sep = ';';
  const escCsv = (value) => {
    const text = String(value ?? '');
    return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.map((c) => escCsv(c.label)).join(sep)];
  rows.forEach((row) => lines.push(columns.map((c) => escCsv(c.format ? c.format(row[c.key], row) : row[c.key])).join(sep)));
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export { readWorkbookRows, worksheetFromObjects, downloadWorkbook, downloadCsv };
