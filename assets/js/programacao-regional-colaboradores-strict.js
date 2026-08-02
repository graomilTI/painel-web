import { supabase } from './supabaseClient.js';

// Programação: a lista de candidatos deve respeitar a supervisão exata do
// colaborador em colaboradores_atuais. Não usamos aproximação por coordenação,
// substring ou tokens, pois isso fazia MT2 - Sul compartilhar pessoas com
// outras regionais e permitia confirmar o mesmo CPF fora da sua regional.

const originalRpc = supabase.rpc.bind(supabase);
const originalFrom = supabase.from.bind(supabase);
const rosterCache = new Map();
const CACHE_MS = 30_000;

function clean(value) {
  return String(value ?? '').trim();
}

function digits(value) {
  return clean(value).replace(/\D/g, '');
}

function norm(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function isActive(row) {
  if (row?.ativo === false) return false;
  if (clean(row?.desligamento)) return false;
  const status = norm(row?.situacao ?? row?.status);
  return ![
    'NAO ATIVO', 'NAO ATIVA', 'INATIVO', 'INATIVA',
    'DESLIGADO', 'DESLIGADA', 'DEMITIDO', 'DEMITIDA',
  ].some((item) => status.includes(item));
}

function selectedSupervisao() {
  const value = clean(document.querySelector('#progSup')?.value);
  if (!value || ['TODAS', 'TODOS', 'GERAL'].includes(norm(value))) return '';
  return value;
}

async function loadExactRoster(supervisao) {
  const target = norm(supervisao);
  if (!target) return { byCpf: new Set(), byName: new Set(), rows: [] };

  const cached = rosterCache.get(target);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const { data, error } = await originalFrom('colaboradores_atuais')
    .select('cpf,nome,cargo,coordenacao,supervisao,situacao,ativo,desligamento')
    .limit(20_000);

  if (error) {
    console.error('[programacao-regional-strict] Falha ao validar regional:', error);
    return { byCpf: new Set(), byName: new Set(), rows: [] };
  }

  const rows = (data || []).filter((row) =>
    isActive(row) && norm(row.supervisao) === target,
  );
  const value = {
    rows,
    byCpf: new Set(rows.map((row) => digits(row.cpf)).filter((cpf) => cpf.length === 11)),
    byName: new Set(rows.map((row) => norm(row.nome)).filter(Boolean)),
  };
  rosterCache.set(target, { at: Date.now(), value });
  return value;
}

function rowBelongsToRoster(row, roster) {
  const cpf = digits(row?.colaborador_id ?? row?.cpf ?? row?.colaborador_cpf);
  if (cpf.length === 11 && roster.byCpf.has(cpf)) return true;
  return roster.byName.has(norm(row?.nome ?? row?.nome_colaborador ?? row?.colaborador_nome));
}

supabase.rpc = async function strictRegionalRpc(fn, args = {}, options) {
  const result = await originalRpc(fn, args, options);
  if (result?.error || !Array.isArray(result?.data)) return result;
  if (!['programacao_colaboradores_supervisao', 'programacao_etapa_b_candidatos'].includes(fn)) {
    return result;
  }

  const supervisao = clean(args?.p_supervisao);
  const roster = await loadExactRoster(supervisao);
  const data = result.data.filter((row) => rowBelongsToRoster(row, roster));

  if (data.length !== result.data.length) {
    console.warn(
      '[programacao-regional-strict] candidatos fora da supervisão removidos',
      { supervisao, recebidos: result.data.length, permitidos: data.length },
    );
  }
  return { ...result, data };
};

function wrapBuilder(builder, context) {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === 'then') {
        return (onFulfilled, onRejected) => Promise.resolve(target)
          .then(async (result) => {
            if (result?.error || !Array.isArray(result?.data)) return result;
            const signature = norm(context.columns).replaceAll(' ', '');
            const isRegionalCandidateQuery = [
              'CPF', 'NOME', 'CARGO', 'COORDENACAO', 'SUPERVISAO',
              'SITUACAO', 'ATIVO', 'DESLIGAMENTO',
            ].every((column) => signature.includes(column));
            if (!isRegionalCandidateQuery) return result;

            const supervisao = selectedSupervisao();
            if (!supervisao) return result;
            const roster = await loadExactRoster(supervisao);
            return {
              ...result,
              data: result.data.filter((row) => rowBelongsToRoster(row, roster)),
            };
          })
          .then(onFulfilled, onRejected);
      }

      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      return (...args) => {
        if (prop === 'select') context.columns = clean(args[0]);
        const next = value.apply(target, args);
        if (next && typeof next === 'object') return wrapBuilder(next, context);
        return next;
      };
    },
  });
}

supabase.from = function strictRegionalFrom(table) {
  const builder = originalFrom(table);
  if (table !== 'colaboradores_atuais') return builder;
  return wrapBuilder(builder, { columns: '' });
};
