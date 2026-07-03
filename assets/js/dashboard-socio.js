import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/dashboard-socio.js';

function normalizarChaveDashboardSocio(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

function valorRawDashboardSocio(row, aliases) {
  const source = row?.dados_json || row?.raw || row || {};
  const keys = Object.keys(source);

  for (const alias of aliases) {
    const expected = normalizarChaveDashboardSocio(alias);
    const key = keys.find((candidate) => normalizarChaveDashboardSocio(candidate) === expected);
    if (key && source[key] != null && String(source[key]).trim() !== '') return source[key];
  }

  return null;
}

function numeroBrDashboardSocio(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value ?? '').trim();
  if (!text) return 0;
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text;
  const parsed = Number(normalized.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dataIsoDashboardSocio(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;

  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    const [, dd, mm, yyyy] = br;
    return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];

  return null;
}

function normalizarLinhaNotaFiscalDashboardSocio(row) {
  if (!row || typeof row !== 'object') return row;

  const valorNF = valorRawDashboardSocio(row, [
    'Valor da N.F.',
    'Valor da NF',
    'Valor N.F.',
    'Valor NF',
    'Valor Total',
    'Valor da Nota',
    'Valor Bruto'
  ]);

  const dataFatura = dataIsoDashboardSocio(valorRawDashboardSocio(row, [
    'Data da Fatura',
    'Data Fatura',
    'Data N.F.',
    'Data NF',
    'Data Nota',
    'Emissão NF',
    'Emissao NF'
  ]));

  const valorTotalNormalizado = row.valor_total != null
    ? row.valor_total
    : numeroBrDashboardSocio(valorNF);

  return {
    ...row,
    valor_total: valorTotalNormalizado,
    data_fatura_de: dataFatura || row.data_fatura_de,
    data_fatura_ate: dataFatura || row.data_fatura_ate,
    data_nota_de: dataFatura || row.data_nota_de,
    data_nota_ate: dataFatura || row.data_nota_ate
  };
}

function normalizarRespostaNotasDashboardSocio(response) {
  if (!response || !Array.isArray(response.data)) return response;

  return {
    ...response,
    data: response.data.map(normalizarLinhaNotaFiscalDashboardSocio)
  };
}

function wrapQueryNotasDashboardSocio(query) {
  if (!query || typeof query !== 'object') return query;

  return new Proxy(query, {
    get(target, prop, receiver) {
      if (prop === 'then') {
        return (onFulfilled, onRejected) => target.then(
          (response) => {
            const normalizada = normalizarRespostaNotasDashboardSocio(response);
            return typeof onFulfilled === 'function' ? onFulfilled(normalizada) : normalizada;
          },
          onRejected
        );
      }

      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;

      return (...args) => {
        const result = value.apply(target, args);
        return result && typeof result === 'object' ? wrapQueryNotasDashboardSocio(result) : result;
      };
    }
  });
}

function criarSupabaseDashboardSocio(baseSupabase) {
  return new Proxy(baseSupabase, {
    get(target, prop, receiver) {
      if (prop !== 'from') return Reflect.get(target, prop, receiver);

      return (tableName) => {
        const query = target.from(tableName);
        if (tableName === 'grm_notas_fiscais_importacoes') {
          return wrapQueryNotasDashboardSocio(query);
        }
        return query;
      };
    }
  });
}

export function renderContent(content, ctx) {
  if (!window.DASHBOARD_SOCIO || typeof window.DASHBOARD_SOCIO.openHome !== 'function') {
    content.innerHTML = '<div class="card"><strong>Erro ao carregar o Dashboard do Sócio.</strong><br>O módulo window.DASHBOARD_SOCIO.openHome não foi encontrado.</div>';
    return;
  }

  const supabaseDashboardSocio = criarSupabaseDashboardSocio(supabase);

  window.DASHBOARD_SOCIO.openHome(content, {
    supabase: supabaseDashboardSocio,
    api: { supabase: supabaseDashboardSocio },
    auth: ctx,
    user: ctx?.user || null,
    onBack: () => {
      window.location.href = './dashboard.html';
    }
  });
}

initProtectedPage('Dashboard do Sócio', renderContent);
