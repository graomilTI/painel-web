// Ajustes de saneamento para fontes do DRE alimentadas pelos agentes GRM.
// Este arquivo roda depois do módulo principal e envolve o openHome para limpar caches
// antigos e entregar ao DRE despesas do agente já normalizadas/deduplicadas.
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
    PATRIMONIO: 'PATRIMONIO'
  };

  const REGIOES_IGNORADAS_DRE = new Set(['NULL', 'AGROTRADER', 'LOG1000', 'PARAGUAI']);
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
    'createdAt', 'updatedAt'
  ]);

  function norm(value) {
    return String(value ?? '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]/g, '');
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
    return CATEGORY_ALIASES[key] || '';
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

  function extractCategoryValues(json) {
    const out = {};
    for (const [key, value] of Object.entries(json || {})) {
      const category = canonicalCategory(key);
      if (!category) continue;
      out[category] = (out[category] || 0) + n(value);
    }

    // Caso o agente grave linhas analíticas do GRM em vez de pivot mensal,
    // converte Grupo/Categoria + Valor para o mesmo formato da planilha pivotada.
    if (!Object.keys(out).length) {
      const group = pick(json, CAMPOS_GRUPO);
      const value = pick(json, CAMPOS_VALOR);
      const category = canonicalCategory(group);
      if (category) out[category] = n(value);
    }

    return out;
  }

  function normalizeDespesasRows(data) {
    const rows = Array.isArray(data) ? data : [];
    const normalized = [];

    if (!window.__dreDespesasAgentesSeen) window.__dreDespesasAgentesSeen = new Set();

    for (const row of rows) {
      const json = row?.dados_json && typeof row.dados_json === 'object' ? row.dados_json : {};
      const reg = mapReg(row?.coordenacao || pick(json, CAMPOS_REGIONAL));
      if (!reg || REGIOES_IGNORADAS_DRE.has(norm(reg))) continue;

      const month = monthStart(row?.data_conta_de || pick(json, CAMPOS_DATA));
      if (!month) continue;

      const values = extractCategoryValues(json);
      if (!Object.keys(values).length) continue;

      const signature = `${reg}|${month}|${stableJson(values)}|${stableJson(json)}`;
      if (window.__dreDespesasAgentesSeen.has(signature)) continue;
      window.__dreDespesasAgentesSeen.add(signature);

      normalized.push({
        ...row,
        coordenacao: reg,
        data_conta_de: month,
        dados_json: values
      });
    }

    return normalized;
  }

  function shouldPatchDespesasResult(state) {
    return state.table === 'grm_despesas_importacoes' && /dados_json/i.test(state.selected || '');
  }

  function wrapQueryBuilder(builder, table) {
    const state = { table, selected: '' };
    let inner = builder;
    let proxy;

    proxy = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve, reject) => inner.then((result) => {
            if (shouldPatchDespesasResult(state) && result && Array.isArray(result.data)) {
              resolve({ ...result, data: normalizeDespesasRows(result.data) });
              return;
            }
            resolve(result);
          }, reject);
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
    return new Proxy(supabase, {
      get(target, prop) {
        if (prop !== 'from') return target[prop];
        return (table) => {
          const builder = target.from(table);
          return table === 'grm_despesas_importacoes'
            ? wrapQueryBuilder(builder, table)
            : builder;
        };
      }
    });
  }

  function clearDreCaches() {
    try {
      window.__dreDespesasAgentesSeen = new Set();
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
