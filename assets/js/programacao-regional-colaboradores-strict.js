import { supabase } from './supabaseClient.js';

// Programação: mantém a RPC oficial como fonte principal e completa a lista
// com colaboradores_atuais respeitando a hierarquia da regional.
//
// Exemplo:
//   programação: MATO GROSSO MT2 - Sul
//   coordenação: MATO GROSSO MT2
//
// São aceitos:
// - supervisão exatamente MATO GROSSO MT2 - Sul;
// - cadastro legado sem subdivisão, com supervisão/coordenação MATO GROSSO MT2.
//
// Não são aceitos colaboradores explicitamente vinculados a outra subdivisão,
// como MATO GROSSO MT2 - Leste. Isso evita misturar regionais sem reduzir a
// lista somente aos poucos cadastros que já receberam o sufixo novo.

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

function regionalBase(value) {
  const raw = clean(value);
  if (!raw) return '';
  return clean(raw.split(/\s+[-–—|/]\s+/)[0] || raw);
}

function hasSubdivision(value) {
  return /\s+[-–—|/]\s+/.test(clean(value));
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

function belongsToRegional(row, supervisao) {
  if (!isActive(row)) return false;

  const target = norm(supervisao);
  const base = norm(regionalBase(supervisao));
  const rowSupervisaoRaw = clean(row?.supervisao);
  const rowSupervisao = norm(rowSupervisaoRaw);
  const rowCoordenacao = norm(row?.coordenacao);

  if (!target) return false;

  // Cadastro já atualizado com a subdivisão exata.
  if (rowSupervisao === target) return true;

  // Uma subdivisão explícita diferente nunca pode entrar por coincidência da
  // coordenação. Ex.: "MT2 - Leste" não aparece em "MT2 - Sul".
  if (rowSupervisaoRaw && hasSubdivision(rowSupervisaoRaw)) return false;

  // Compatibilidade com cadastros ainda vinculados apenas à coordenação/base.
  return !!base && rowCoordenacao === base && (!rowSupervisao || rowSupervisao === base);
}

async function loadRegionalRoster(supervisao) {
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

  const rows = (data || []).filter((row) => belongsToRegional(row, supervisao));
  const value = {
    rows,
    byCpf: new Set(rows.map((row) => digits(row.cpf)).filter((cpf) => cpf.length === 11)),
    byName: new Set(rows.map((row) => norm(row.nome)).filter(Boolean)),
  };

  console.info('[programacao-regional-strict] colaboradores liberados', {
    supervisao,
    base: regionalBase(supervisao),
    quantidade: rows.length,
  });

  rosterCache.set(target, { at: Date.now(), value });
  return value;
}

function rowBelongsToRoster(row, roster) {
  const cpf = digits(row?.colaborador_id ?? row?.cpf ?? row?.colaborador_cpf);
  if (cpf.length === 11 && roster.byCpf.has(cpf)) return true;
  return roster.byName.has(norm(row?.nome ?? row?.nome_colaborador ?? row?.colaborador_nome));
}

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
            const roster = await loadRegionalRoster(supervisao);
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