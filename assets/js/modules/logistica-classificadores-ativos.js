import { supabase } from '../supabaseClient.js';

const PATCH_FLAG = '__logisticaClassificadoresAtivosPatch';
const ACTIVE_NAMES = new Set();
let activeNamesLoaded = false;

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toUpperCase();
}

function rowName(row = {}) {
  return row.colaborador_nome || row.nome || row.funcionario || row.classificador || row.colaborador || row.nome_colaborador || '';
}

function rowStatus(row = {}) {
  return normalize(row.status_colaborador || row.status_funcionario || row.situacao_colaborador || row.situacao || row.status || row.ativo);
}

function isActiveStatus(status) {
  if (!status) return true;
  if (['TRUE', 'SIM', 'S', '1', 'ATIVO', 'ATIVA', 'ACTIVE'].includes(status)) return true;
  if (
    status.includes('INATIVO') ||
    status.includes('INATIVA') ||
    status.includes('DESLIG') ||
    status.includes('DEMIT') ||
    status.includes('RESCIND') ||
    status.includes('ENCERR') ||
    status.includes('SUSPENS') ||
    status.includes('AFAST')
  ) return false;
  return true;
}

function isActiveClassifier(row = {}) {
  const status = rowStatus(row);
  if (!isActiveStatus(status)) return false;

  const name = normalize(rowName(row));
  if (activeNamesLoaded && ACTIVE_NAMES.size && name) {
    return ACTIVE_NAMES.has(name);
  }
  return true;
}

async function loadActiveNames() {
  const candidates = [
    { table: 'colaboradores', nameFields: ['nome', 'colaborador', 'funcionario'], statusFields: ['status', 'situacao'] },
    { table: 'historico_colaboradores', nameFields: ['nome', 'colaborador', 'funcionario'], statusFields: ['situacao', 'status'] },
  ];

  for (const cfg of candidates) {
    try {
      const { data, error } = await supabase.from(cfg.table).select('*').limit(50000);
      if (error || !Array.isArray(data) || !data.length) continue;

      data.forEach((row) => {
        const name = normalize(cfg.nameFields.map((field) => row?.[field]).find(Boolean));
        const status = normalize(cfg.statusFields.map((field) => row?.[field]).find(Boolean));
        if (name && isActiveStatus(status) && (status.includes('ATIVO') || status === 'TRUE' || status === 'SIM' || status === '1')) {
          ACTIVE_NAMES.add(name);
        }
      });

      if (ACTIVE_NAMES.size) break;
    } catch (error) {
      console.info(`[Logística] Base ${cfg.table} não disponível para filtro de classificadores ativos:`, error?.message || error);
    }
  }

  activeNamesLoaded = true;
}

const activeNamesPromise = loadActiveNames();

function filterResponse(response) {
  if (!response || !Array.isArray(response.data)) return response;
  return {
    ...response,
    data: response.data.filter(isActiveClassifier),
  };
}

function wrapBuilder(builder, tableName) {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      if (prop === 'then' && tableName === 'operacional_os_colaboradores') {
        return (resolve, reject) => target.then(async (response) => {
          await activeNamesPromise;
          return resolve(filterResponse(response));
        }, reject);
      }

      if (typeof value === 'function') {
        return (...args) => {
          const result = value.apply(target, args);
          return result && typeof result === 'object' ? wrapBuilder(result, tableName) : result;
        };
      }

      return value;
    },
  });
}

if (!supabase[PATCH_FLAG]) {
  const originalFrom = supabase.from.bind(supabase);
  supabase.from = function patchedFrom(tableName) {
    const builder = originalFrom(tableName);
    return String(tableName) === 'operacional_os_colaboradores'
      ? wrapBuilder(builder, tableName)
      : builder;
  };
  supabase[PATCH_FLAG] = true;
}
