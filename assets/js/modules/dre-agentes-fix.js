// Ajustes de saneamento para fontes do DRE alimentadas pelos agentes GRM.
// Este arquivo roda depois do módulo principal e envolve o openHome para limpar caches
// antigos e entregar ao DRE somente as fontes oficiais dos agentes para NF, despesas e produção.
(function () {
  const originalDre = window.DRE;
  if (!originalDre || typeof originalDre.openHome !== 'function' || originalDre.openHome.__dreAgentesFix) return;

  const CATEGORY_ALIASES = {
    DESPESASOPERACIONAIS: 'DESPESAS OPERACIONAIS',
    COMBUSTIVEISELUBRIFICANTES: 'COMBUSTIVEIS E LUBRIFICANTES',
    DESPESASCOMVEICULOS: 'DESPESAS COM VEICULOS',
    DESPESASRH: 'DESPESAS RH',
    FOLHADEPAGAMENTO: 'FOLHA DE PAGAMENTO',
    IMPOSTOSSOBREFOLHA: 'IMPOSTOS SOBRE FOLHA',
    DESPESASADMINISTRATIVAS: 'DESPESAS ADMINISTRATIVAS',
    DESPESASCOMERCIAIS: 'DESPESAS COMERCIAIS',
    DESPESASFINANCEIRAS: 'DESPESAS FINANCEIRAS',
    EMPRESTIMOSTERCEIROS: 'EMPRESTIMOS TERCEIROS',
    PATRIMONIO: 'PATRIMONIO',
    // Categoria "IMPOSTOS" (genérica, diferente de "IMPOSTOS SOBRE FOLHA" e de
    // "IMPOSTOS PARCELADOS") passou a existir nas linhas de despesas do GRM em 24/06/2026
    // e não tinha mapeamento - o valor era descartado em silêncio. Entra em DESPESAS
    // FINANCEIRAS por ser imposto não ligado à folha.
    IMPOSTOS: 'DESPESAS FINANCEIRAS'
  };

  const REGIOES_IGNORADAS_DRE = new Set(['NULL', 'AGROTRADER', 'LOG1000', 'PARAGUAI']);
  const DRE_TIPOS_AGENTES_OFICIAIS = new Set(['despesas', 'notas_fiscais', 'resultado-diario']);
  const CAMPOS_VALOR = [
    'Valor Total', 'Valor', 'Valor Pago', 'V. Pago', 'Total Pago', 'Total',
    'valor_total', 'valor', 'valor_pago', 'total'
  ];
  const CAMPOS_GRUPO = [
    'Grupo de Categoria', 'Grupo Categoria', 'Grupo', 'Categoria Grupo', 'Categoria',
    'Grupo da Categoria', 'grupo_categoria', 'grupo', 'categoria_grupo', 'categoria'
  ];
  const CAMPOS_DATA = [
    'Data Conta De', 'Data Conta', 'Data', 'Competência', 'Competencia',
    'data_conta_de', 'data', 'competencia'
  ];
  const CAMPOS_REGIONAL = [
    'Coordenação', 'Coordenacao', 'Regional', 'coordenação', 'coordenacao', 'regional'
  ];
  const CAMPOS_VOLATEIS = new Set([
    'id', 'created_at', 'updated_at', 'sync_job_id', 'job_id', 'importacao_id',
    'createdAt', 'updatedAt', 'processado_em', 'sincronizado_em'
  ]);
  // Campos que aparecem nas linhas de despesas mas nunca são categoria (não devem
  // disparar o aviso de "categoria desconhecida" abaixo).
  const CAMPOS_NAO_CATEGORIA = new Set(
    [...CAMPOS_VALOR, ...CAMPOS_GRUPO, ...CAMPOS_DATA, ...CAMPOS_REGIONAL, ...CAMPOS_VOLATEIS]
      .map(norm)
  );
  const CATEGORIAS_DESCONHECIDAS_AVISADAS = new Set();

  function norm(value) {
    return String(value ?? '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]/g, '');
  }

  function cleanTipo(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/_/g, '-')
      .replace(/\s+/g, '-');
  }

  function normalizeReportTipo(row) {
    const candidates = [
      row?.tipo,
      row?.tipo_relatorio,
      row?.titulo_relatorio,
      row?.nome_arquivo,
      row?.arquivo_nome_original
    ].map(v => String(v || '').trim()).filter(Boolean);

    for (const original of candidates) {
      const t = cleanTipo(original);
      const low = original.toLowerCase();
      if (['despesas', 'relatorio-de-despesas', 'despesas-por-regional'].includes(t)) return 'despesas';
      if (['notas-fiscais', 'nota-fiscal', 'nfs', 'nf', 'nfe', 'nfse', 'faturamento', 'relatorio-de-notas-fiscais'].includes(t)) return 'notas_fiscais';
      if (['resultado-diario', 'resultado-diario-gavilon', 'relatorio-resultado-diario', 'producao', 'producao-consolidada', 'relatorio-de-resultado-diario'].includes(t)) return 'resultado-diario';
      if (/despesas?|despesas?\s*por\s*regional/.test(low)) return 'despesas';
      if (/notas?\s*fiscais?|nfe|nfse|faturamento/.test(low)) return 'notas_fiscais';
      if (/resultado.*diario|diario.*resultado|gavilon|producao|produção/.test(low)) return 'resultado-diario';
    }
    return cleanTipo(candidates[0] || 'outros');
  }

  function filterRelatoriosManuaisDoDre(data) {
    const rows = Array.isArray(data) ? data : [];
    return rows.filter(row => !DRE_TIPOS_AGENTES_OFICIAIS.has(normalizeReportTipo(row)));
  }

  function n(value) {
    if (value == null || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const raw = String(value).replace(/R\$\s*/gi, '').replace(/[^\d,.-]/g, '');
    const parsed = raw.includes(',') && raw.includes('.')
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.replace(',', '.');
    const num = Number.parseFloat(parsed);
    return Number.isFinite(num) ? num : 0;
  }

  function mapReg(value) {
    return String(value ?? '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function pick(obj, fields) {
    for (const field of fields) {
      if (obj && obj[field] != null && obj[field] !== '') return obj[field];
    }
    return null;
  }

  function canonicalCategory(value) {
    const key = norm(value);
    if (!key || key === 'TOTAL' || key === 'TOTALCOLUNAS' || key === 'NAODEFINIDO') return '';
    if (key === 'IMPOSTOSPARCELADOS' || key === 'RETIRADASOCIOS' || key === 'RETIRADASOCIO') return '';
    const categoria = CATEGORY_ALIASES[key] || '';
    // O GRM pode renomear/adicionar uma categoria de despesa sem aviso - sem isso, o
    // valor some do DRE em silêncio (mesma causa raiz do bug de Notas Fiscais, só que
    // aqui é um dicionário fixo em vez de dedupe em SQL). Avisa 1x por chave por sessão.
    if (!categoria && !CAMPOS_NAO_CATEGORIA.has(key) && !CATEGORIAS_DESCONHECIDAS_AVISADAS.has(key)) {
      CATEGORIAS_DESCONHECIDAS_AVISADAS.add(key);
      console.warn(`DRE: categoria de despesa não reconhecida (ignorada no cálculo) - "${value}". Adicione em CATEGORY_ALIASES (dre-agentes-fix.js) se for uma categoria válida.`);
    }
    return categoria;
  }

  function monthStart(value) {
    if (value instanceof Date && !Number.isNaN(value)) {
      return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-01`;
    }
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    let m = raw.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}-01`;
    m = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})$/);
    if (m) return `${m[3]}-${String(Number(m[2])).padStart(2, '0')}-01`;
    m = raw.match(/^(\d{1,2})[\/\-.](20\d{2})$/);
    if (m) return `${m[2]}-${String(Number(m[1])).padStart(2, '0')}-01`;
    const d = new Date(raw);
    return Number.isNaN(d) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }

  function stableJson(value) {
    if (value == null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    return `{${Object.keys(value)
      .filter(key => !CAMPOS_VOLATEIS.has(key))
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }

  function sourceStamp(row) {
    const stamp = Date.parse(row?.created_at || row?.updated_at || row?.sincronizado_em || '') || 0;
    return `${String(stamp).padStart(16, '0')}|${String(row?.id || '')}`;
  }

  function categoryValuesFromColumns(json) {
    const out = {};
    for (const [key, value] of Object.entries(json || {})) {
      const category = canonicalCategory(key);
      if (!category) continue;
      out[category] = (out[category] || 0) + n(value);
    }
    return out;
  }

  function analyticCategoryValue(json) {
    const group = pick(json, CAMPOS_GRUPO);
    const value = pick(json, CAMPOS_VALOR);
    const category = canonicalCategory(group);
    if (!category) return null;
    return { category, value: n(value) };
  }

  function isBetterEntry(next, current) {
    if (!current) return true;
    const nextStamp = sourceStamp(next.row);
    const currentStamp = sourceStamp(current.row);
    if (nextStamp !== currentStamp) return nextStamp > currentStamp;
    return Math.abs(next.total || 0) >= Math.abs(current.total || 0);
  }

  function toNormalizedRow(entry) {
    return {
      ...entry.row,
      coordenacao: entry.reg,
      data_conta_de: entry.month,
      dados_json: entry.values
    };
  }

  function entryUniqueKey(entry) {
    const categories = Object.keys(entry.values || {}).sort().join('|');
    return `${categories.includes('|') ? 'P' : 'C'}|${entry.reg}|${entry.month}|${categories}`;
  }

  function filterAlreadyReturnedSnapshots(entries) {
    if (!window.__dreDespesasSnapshotSeen) window.__dreDespesasSnapshotSeen = new Set();
    const out = [];
    for (const entry of entries) {
      const key = entryUniqueKey(entry);
      if (window.__dreDespesasSnapshotSeen.has(key)) continue;
      window.__dreDespesasSnapshotSeen.add(key);
      out.push(entry);
    }
    return out;
  }

  function normalizeDespesasRows(data) {
    const rows = Array.isArray(data) ? data : [];
    const fullPivotByRegMonth = new Map();
    const categorySnapshotByRegMonthCategory = new Map();
    const analyticRows = [];

    if (!window.__dreDespesasAgentesSeen) window.__dreDespesasAgentesSeen = new Set();
    if (!window.__dreDespesasSnapshotSeen) window.__dreDespesasSnapshotSeen = new Set();

    for (const row of rows) {
      const json = row?.dados_json && typeof row.dados_json === 'object' ? row.dados_json : {};
      const reg = mapReg(row?.coordenacao || pick(json, CAMPOS_REGIONAL));
      if (!reg || REGIOES_IGNORADAS_DRE.has(norm(reg))) continue;

      const month = monthStart(row?.data_conta_de || pick(json, CAMPOS_DATA));
      if (!month) continue;

      const categoryColumns = categoryValuesFromColumns(json);
      const categoryKeys = Object.keys(categoryColumns);

      if (categoryKeys.length > 1) {
        const key = `${reg}|${month}`;
        const total = Object.values(categoryColumns).reduce((acc, value) => acc + Math.abs(n(value)), 0);
        const entry = { row, reg, month, values: categoryColumns, total };
        if (isBetterEntry(entry, fullPivotByRegMonth.get(key))) fullPivotByRegMonth.set(key, entry);
        continue;
      }

      if (categoryKeys.length === 1) {
        const category = categoryKeys[0];
        const values = { [category]: n(categoryColumns[category]) };
        const key = `${reg}|${month}|${category}`;
        const entry = { row, reg, month, values, total: Math.abs(values[category]) };
        if (isBetterEntry(entry, categorySnapshotByRegMonthCategory.get(key))) {
          categorySnapshotByRegMonthCategory.set(key, entry);
        }
        continue;
      }

      const analytic = analyticCategoryValue(json);
      if (!analytic) continue;

      const signature = `${reg}|${month}|${analytic.category}|${stableJson(json)}`;
      if (window.__dreDespesasAgentesSeen.has(signature)) continue;
      window.__dreDespesasAgentesSeen.add(signature);

      analyticRows.push({
        row,
        reg,
        month,
        values: { [analytic.category]: analytic.value },
        total: Math.abs(analytic.value)
      });
    }

    const fullPivotKeys = new Set(fullPivotByRegMonth.keys());
    const categoryEntries = [...categorySnapshotByRegMonthCategory.values()]
      .filter(entry => !fullPivotKeys.has(`${entry.reg}|${entry.month}`));

    const snapshotEntries = filterAlreadyReturnedSnapshots([
      ...fullPivotByRegMonth.values(),
      ...categoryEntries
    ]);

    return [
      ...snapshotEntries,
      ...analyticRows
    ].map(toNormalizedRow);
  }

  function patchResultData(state, result) {
    if (!result || !Array.isArray(result.data)) return result;
    if (state.table === 'grm_despesas_importacoes' && /dados_json/i.test(state.selected || '')) {
      return { ...result, data: normalizeDespesasRows(result.data) };
    }
    if (state.table === 'relatorios_importacoes') {
      return { ...result, data: filterRelatoriosManuaisDoDre(result.data) };
    }
    return result;
  }

  function wrapQueryBuilder(builder, table) {
    const state = { table, selected: '' };
    let inner = builder;
    let proxy;

    proxy = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve, reject) => inner.then((result) => resolve(patchResultData(state, result)), reject);
        }
        if (prop === 'catch') return (...args) => Promise.resolve(proxy).catch(...args);
        if (prop === 'finally') return (...args) => Promise.resolve(proxy).finally(...args);

        const value = inner[prop];
        if (typeof value !== 'function') return value;

        return (...args) => {
          if (prop === 'select') {
            state.selected = String(args[0] || '');
            if (table === 'grm_despesas_importacoes' && /dados_json/i.test(state.selected)) {
              let columns = state.selected;
              if (!/created_at/i.test(columns)) columns += ',created_at';
              if (!/(^|,)\s*id\s*(,|$)/i.test(columns)) columns += ',id';
              inner = value.call(inner, columns, ...args.slice(1));
              if (typeof inner.order === 'function') {
                inner = inner.order('created_at', { ascending: false });
              }
              return proxy;
            }
          }
          inner = value.call(inner, ...args);
          return proxy;
        };
      }
    });

    return proxy;
  }

  function wrapSupabaseForDre(supabase) {
    if (!supabase || supabase.__dreAgentesFix) return supabase;
    const wrapped = new Proxy(supabase, {
      get(target, prop) {
        if (prop !== 'from') return target[prop];
        return (table) => {
          const builder = target.from(table);
          return (table === 'grm_despesas_importacoes' || table === 'relatorios_importacoes')
            ? wrapQueryBuilder(builder, table)
            : builder;
        };
      }
    });
    Object.defineProperty(wrapped, '__dreAgentesFix', { value: true });
    return wrapped;
  }

  function clearDreCaches() {
    try {
      window.__dreDespesasAgentesSeen = new Set();
      window.__dreDespesasSnapshotSeen = new Set();
      for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
        const key = sessionStorage.key(i) || '';
        if (key.startsWith('grao1000:dre-despesas:') || key.startsWith('grao1000:dre-full:')) {
          sessionStorage.removeItem(key);
        }
      }
    } catch (_) {}
  }

  const patchedOpenHome = function patchedOpenHome(container, opts = {}) {
    clearDreCaches();
    const safeSupabase = wrapSupabaseForDre(opts.supabase || opts.api?.supabase);
    return originalDre.openHome(container, {
      ...opts,
      supabase: safeSupabase,
      api: { ...(opts.api || {}), supabase: safeSupabase }
    });
  };
  patchedOpenHome.__dreAgentesFix = true;

  window.DRE = { ...originalDre, openHome: patchedOpenHome };
})();
