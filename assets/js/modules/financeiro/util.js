// Financeiro — estado da tela, formatadores, datas, números e hashes (usado por todas as partes).
// Extraído de assets/js/financeiro.js em 15/10/2026 (arquivo de ~2.800 linhas). O código das funções e constantes
// foi movido sem alteração. Para publicar uma mudança em qualquer módulo de assets/js/modules/financeiro/, troque o
// token ?v=20261030-fin15 em TODOS os imports internos e nos carregadores (assets/js/financeiro.js, financeiro.html):
// tests/financeiro-modulos-versao.test.mjs garante que fiquem iguais.
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';

async function safe(fn, fallback = []) {
  try {
    const { data, error } = await fn();
    if (error) throw error;
    return data || fallback;
  } catch (e) {
    console.warn(e);
    return fallback;
  }
}

const state = {
  fluxo: [],
  receber: [],
  pagar: [],
  financeiroPagamentos: [],
  pagamentosSetorFilter: 'todos',
  currentDate: new Date().toISOString().slice(0, 10),
  filters: {
    inicio: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
    fim: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  },
  detSort: { col: null, dir: 1 },
  detFilter: { tipo: '', situacao: '', favorecido: '', doc: '' },
  adiantSort: { col: null, dir: 1 },
  notasFiscais: [],
  notasFiscaisLoaded: false,
  notasFiscaisFiltro: { cliente: '', situacao: '' }
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function brDate(value) {
  if (!value) return '-';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(value);
}

function brDateTime(value) {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value || '-');
  return dt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function isMissingColumnError(error) {
  const msg = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return error?.code === 'PGRST204' || msg.includes('schema cache') || msg.includes('could not find') || msg.includes('column');
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value)
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDateISO(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed || !parsed.y || !parsed.m || !parsed.d) return null;
    if (parsed.y < 2020 || parsed.y > 2100) return null;
    return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const br = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (br) {
    let [, d, m, y] = br;
    if (y.length === 2) y = `20${y}`;
    const year = Number(y);
    if (year < 2020 || year > 2100) return null;
    return `${String(year).padStart(4, '0')}-${String(Number(m)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`;
  }
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  const year = dt.getFullYear();
  if (year < 2020 || year > 2100) return null;
  return dt.toISOString().slice(0, 10);
}

function hashText(value) {
  let hash = 0;
  const text = normalize(value);
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return `fin_${Math.abs(hash)}_${text.length}`;
}

function pick(row, map, key) {
  const aliases = map[key] || [key];
  const rowKeys = Object.keys(row || {});
  const found = rowKeys.find((rk) => aliases.some((alias) => normalize(rk) === normalize(alias)));
  return found ? row[found] : null;
}

function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizeName(value) {
  return normalize(value).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function dateRangeLabel(inicio, fim) {
  if (!inicio && !fim) return 'período não informado';
  if (inicio === fim) return brDate(inicio);
  return `${brDate(inicio)} a ${brDate(fim)}`;
}

function compactDate(value) {
  return String(value || '').replace(/\D/g, '');
}

function parseDateLoose(value) {
  return toDateISO(value);
}

function formatDateForXlsx(value) {
  return value ? brDate(value) : '';
}

function getAny(row, names = []) {
  const keys = Object.keys(row || {});
  for (const name of names) {
    const found = keys.find((key) => normalize(key) === normalize(name));
    if (found) return row[found];
  }
  return null;
}

function roundNumber(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export { safe, state, esc, normalize, money, brDate, isMissingColumnError, toNumber, toDateISO, hashText, pick, onlyDigits, dateRangeLabel, compactDate, formatDateForXlsx, roundNumber };
