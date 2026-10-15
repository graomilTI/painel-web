// Relatórios — importação — leitura de planilhas: cabeçalhos, números, datas e textos (usado por todos os tipos de relatório).
// Extraído de modules/relatorios.js em 15/10/2026 (era um único bloco autoexecutável de ~3.900 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo relatorios-*.js, troque o token ?v=20261015-relatorios1 em TODOS os imports internos e no carregador
// (assets/js/relatorio-importador.js): tests/relatorios-modulos-versao.test.mjs garante que fiquem iguais.

  function loadScript(src, globalName) {
    if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve(globalName ? window[globalName] : true), { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve(globalName ? window[globalName] : true);
      script.onerror = () => reject(new Error('Falha ao carregar biblioteca XLSX.'));
      document.head.appendChild(script);
    });
  }

  async function loadXlsx() {
    return loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', 'XLSX');
  }

  function normalizeHeader(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function isValidDateParts(year, month, day) {
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
    if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }

  function makeIsoDate(year, month, day) {
    if (!isValidDateParts(year, month, day)) return null;
    return `${Number(year)}-${String(Number(month)).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
  }

  function excelSerialToIsoDate(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 1) return null;
    if (window.XLSX?.SSF?.parse_date_code) {
      const parsed = window.XLSX.SSF.parse_date_code(num);
      if (parsed?.y && parsed?.m && parsed?.d) return makeIsoDate(parsed.y, parsed.m, parsed.d);
    }
    // Fallback: serial do Excel/Sheets. Mantém a data correta mesmo se SSF não estiver disponível.
    const utc = Math.round((num - 25569) * 86400 * 1000);
    const d = new Date(utc);
    if (Number.isNaN(d.getTime())) return null;
    return makeIsoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  function toIsoDate(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === 'number') return excelSerialToIsoDate(value);
    const s = String(value || '').trim();
    let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      const year = Number(m[3]);
      // Padrão brasileiro primeiro. Se o mês ficaria inválido, aceita padrão Uber/EUA MM/DD/YYYY.
      if (b <= 12) return makeIsoDate(year, b, a);
      if (a <= 12) return makeIsoDate(year, a, b);
      return null;
    }
    m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (m) return makeIsoDate(m[1], m[2], m[3]);
    m = s.match(/^(\d{1,2})[\/\-.](\d{4})$/);
    if (m) return makeIsoDate(m[2], m[1], 1);
    const MAP = {jan:1,fev:2,feb:2,mar:3,abr:4,apr:4,mai:5,may:5,jun:6,jul:7,ago:8,aug:8,set:9,sep:9,out:10,oct:10,nov:11,dez:12,dec:12};
    m = normalizeHeader(s).match(/^([a-z]{3,})[\/\-. ]+(\d{4})$/);
    if (m && MAP[m[1].slice(0,3)]) return makeIsoDate(m[2], MAP[m[1].slice(0,3)], 1);
    return null;
  }

  function headerKey(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  function headerMatches(cell, expected) {
    const a = headerKey(cell);
    const b = headerKey(expected);
    if (!a || !b) return false;
    return a === b || a.includes(b) || b.includes(a);
  }

  function findHeaderRow(rows, required) {
    let best = 0;
    let score = -1;
    const req = (required || []).map(headerKey).filter(Boolean);
    (rows || []).slice(0, 50).forEach((row, index) => {
      // IMPORTANTE: ignora células vazias. Antes, name.includes('') fazia
      // linhas de observação com colunas vazias serem confundidas com cabeçalho.
      const headers = (row || []).map(headerKey).filter(Boolean);
      const current = req.filter((name) => headers.some((h) => h === name || h.includes(name) || name.includes(h))).length;
      if (current > score) {
        score = current;
        best = index;
      }
    });
    return best;
  }

  function pickValue(row, keys) {
    const normalizedMap = new Map(Object.keys(row || {}).map((key) => [normalizeHeader(key), row[key]]));
    for (const key of keys) {
      const value = normalizedMap.get(normalizeHeader(key));
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return null;
  }

  function normalizeNumberBr(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const raw = String(value).trim().replace(/\s/g, '');
    const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
    const number = Number(normalized.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(number) ? number : null;
  }

  function financeiroHash(parts) {
    const base = (parts || []).map((value) => normalizeHeader(value)).join('|');
    let hash = 0x811c9dc5;
    for (let i = 0; i < base.length; i += 1) {
      hash ^= base.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return `fin_${(hash >>> 0).toString(16)}_${base.length}`;
  }

  function normalizeText(value) {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    return s || null;
  }

  function colaboradorNomeChave(nome) {
    return String(nome || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .toUpperCase();
  }

  function pickHeaderIndex(headers, names) {
    for (const name of names || []) {
      const exact = (headers || []).findIndex((h) => headerKey(h) === headerKey(name));
      if (exact >= 0) return exact;
    }
    for (const name of names || []) {
      const fuzzy = (headers || []).findIndex((h) => headerMatches(h, name));
      if (fuzzy >= 0) return fuzzy;
    }
    return -1;
  }

export { loadXlsx, normalizeHeader, makeIsoDate, toIsoDate, headerKey, headerMatches, findHeaderRow, pickValue, normalizeNumberBr, financeiroHash, normalizeText, colaboradorNomeChave, pickHeaderIndex };
