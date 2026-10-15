// Metas — constantes, formatadores e acesso ao Supabase (usado por todas as partes).
// Extraído de modules/metas.js em 15/10/2026 (era um único bloco autoexecutável de ~3.300 linhas).
// O código das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer
// módulo metas-*.js, troque o token ?v=20261015-metas1 em TODOS os imports internos e no carregador
// (assets/js/metas.js): tests/metas-modulos-versao.test.mjs garante que fiquem iguais.

  const MONTHS = [
    { value: 1, label: 'Janeiro' },
    { value: 2, label: 'Fevereiro' },
    { value: 3, label: 'Março' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Maio' },
    { value: 6, label: 'Junho' },
    { value: 7, label: 'Julho' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Setembro' },
    { value: 10, label: 'Outubro' },
    { value: 11, label: 'Novembro' },
    { value: 12, label: 'Dezembro' }
  ];

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function fmtTons(value) {
    const n = Number(value || 0);
    return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} t`;
  }

  function fmtPct(value) {
    const n = Number(value || 0);
    return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  }

  function pctClass(value) {
    const n = Number(value || 0);
    if (n >= 100) return 'good';
    if (n >= 60) return 'warn';
    return 'bad';
  }

  function clampPct(value) {
    return Math.max(0, Math.min(100, Number(value || 0)));
  }

  function getSupabaseClient(api) {
    if (api && typeof api.from === 'function') return api;
    if (api && api.supabase) return api.supabase;
    if (api && api.client) return api.client;
    if (window.supabaseClient) return window.supabaseClient;
    if (window.supabase) return window.supabase;
    if (window.sb) return window.sb;
    return null;
  }

  // `desempate` (coluna única, default 'id') entra no ORDER BY depois de qualquer ordem que o
  // chamador já tenha aplicado: sem ele o Postgres não garante a mesma ordem entre páginas .range()
  // e o resultado sai com linhas repetidas/faltando (ver dre.js). Passe null para tabela sem `id`.
  async function fetchAllRows(queryBuilder, pageSize = 1000, maxRows = 50000, desempate = 'id') {
    const rows = [];
    let from = 0;

    if (desempate && typeof queryBuilder.range === 'function' && typeof queryBuilder.order === 'function') {
      queryBuilder = queryBuilder.order(desempate, { ascending: true });
    }

    while (from < maxRows) {
      const to = from + pageSize - 1;
      const pageBuilder = typeof queryBuilder.range === 'function' ? queryBuilder.range(from, to) : queryBuilder;
      const { data, error } = await pageBuilder;
      if (error) throw error;

      const page = Array.isArray(data) ? data : [];
      rows.push(...page);

      if (page.length < pageSize || typeof queryBuilder.range !== 'function') break;
      from += pageSize;
    }

    return rows;
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.filter(Boolean).map(v => String(v).trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  function getMonthName(mes) {
    const item = MONTHS.find(m => Number(m.value) === Number(mes));
    return item ? item.label : String(mes || '');
  }

  function normalizarTexto(value) {
    return String(value || '')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .toUpperCase();
  }

  function toInputNumber(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n) || n <= 0) return '';
    return String(Math.round(n * 100) / 100);
  }

  function getMonthRange(ano, mes) {
    const start = `${ano}-${String(mes).padStart(2, '0')}-01`;
    const nextDate = new Date(Number(ano), Number(mes), 1);
    const next = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-01`;
    return { start, next };
  }

export { MONTHS, escapeHtml, fmtTons, fmtPct, pctClass, getSupabaseClient, fetchAllRows, uniqueSorted, getMonthName, normalizarTexto, toInputNumber, getMonthRange };
