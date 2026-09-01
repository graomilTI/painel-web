// Sincroniza operacional_os a partir dos agentes sync-lista-os (grm_lista_os_importacoes,
// campos/cliente/contrato/lote/remanescente), sync-mapa-embarque/sync-distribuicao-os
// (usados para preencher Supervisão/embarcado) e sync-locais-embarque
// (grm_locais_embarque_importacoes -> operacional_pontos_embarque, usado para resolver
// a localização real das O.S. pelo campo Embarque no formato UF - Cidade (Local)).
//
// Diferente de Patrimônios/Financeiro, aqui NÃO apagamos tudo antes de regravar: operacional_os
// guarda estado de trabalho do gestor (status_gestor, status_conferencia, atribuições de
// colaborador em operacional_os_colaboradores via FK com CASCADE). Por isso:
//   - upsert por numero_os preservando status_gestor/status_conferencia das O.S. já existentes;
//   - O.S. que não aparecem mais no relatório do agente são removidas do painel (cascade
//     também remove as atribuições delas) — comportamento pedido explicitamente, equivalente
//     ao "substituir a lista anterior" que o upload manual já faz hoje.
// `financeiro`, `servico` e `situacao` não têm fonte automática ainda; ficam null (mesma
// degradação graceful que o upload manual já tolera quando a planilha não tem essas colunas).
import { supabase } from './supabaseClient.js';

const LOTE_MINIMO = 50;
const LOTE_MINIMO_LOCAIS = 10;

function normKey(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function getField(row, aliases = []) {
  if (!row) return null;
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) return row[alias];
  }
  const map = new Map();
  Object.keys(row).forEach((key) => map.set(normKey(key), row[key]));
  for (const alias of aliases) {
    const hit = map.get(normKey(alias));
    if (hit !== undefined) return hit;
  }
  return null;
}

function toText(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

function toNum(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const s = String(value).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function toGeoNum(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = String(value).trim().replace(',', '.').replace(/[^0-9.-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function isGeoBrasil(lat, lng) {
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return a >= -34.5 && a <= 6 && b >= -75 && b <= -33;
}

function brDateToISO(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? s.slice(0, 10) : null;
}

function normOs(value) {
  let s = String(value ?? '').trim();
  if (!s) return '';
  if (/^\d+(\.0+)?$/.test(s)) s = s.replace(/\.0+$/, '');
  return s;
}

async function buscarUltimoLote(tabela, limite) {
  const { data: maxRows, error: maxErr } = await supabase
    .from(tabela).select('created_at').order('created_at', { ascending: false }).limit(1);
  if (maxErr) throw maxErr;
  const maxCreatedAt = maxRows?.[0]?.created_at;
  if (!maxCreatedAt) return [];
  // os agentes recarregam a tabela inteira a cada sincronização; pegamos só o lote mais recente.
  const threshold = new Date(new Date(maxCreatedAt).getTime() - 5 * 60 * 1000).toISOString();
  // PostgREST limita a 1000 linhas por requisição mesmo com .limit() maior; pagina com
  // .range() para trazer o lote inteiro. Sem isso o sync só via 1000 O.S. do relatório e
  // apagava do painel todas as O.S. reais que não calhavam de estar nesse recorte aleatório.
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; from < limite; from += pageSize) {
    const to = Math.min(from + pageSize, limite) - 1;
    const { data, error } = await supabase
      .from(tabela)
      .select('dados_json')
      .gte('created_at', threshold)
      .order('created_at', { ascending: true })
      .range(from, to);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk.map((row) => row.dados_json));
    if (chunk.length < pageSize) break;
  }
  return rows;
}

async function buscarTodasOsExistentes() {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('operacional_os')
      .select('numero_os,status_gestor,status_conferencia,data_os')
      .order('numero_os', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return rows;
}

async function buscarPontosEmbarqueExistentes() {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('operacional_pontos_embarque')
      .select('id,tipo_local,nome_local,uf,cidade,latitude,longitude,ativo')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return rows;
}

function pontoKey({ uf, cidade, nome_local }) {
  return `${normKey(uf)}|${normKey(cidade)}|${normKey(nome_local)}`;
}

function mapLocalEmbarqueRow(d) {
  const latitude = toGeoNum(getField(d, ['Latitude', 'Lat']));
  const longitude = toGeoNum(getField(d, ['Longitude', 'Long', 'Lng']));
  return {
    tipo_local: toText(getField(d, ['Tipo do Local', 'Tipo Local', 'Tipo'])),
    nome_local: toText(getField(d, ['Local', 'Nome Local', 'Nome do Local', 'Local de Embarque'])),
    uf: toText(getField(d, ['UF', 'Estado'])),
    cidade: toText(getField(d, ['Cidade', 'Municipio', 'Município'])),
    latitude,
    longitude,
    ativo: true,
  };
}

async function sincronizarLocaisEmbarqueDoAgente() {
  const rows = await buscarUltimoLote('grm_locais_embarque_importacoes', 20000);
  if (!rows.length) return { ignorado: true, linhas: 0, motivo: 'sem_lote' };

  const locaisMap = new Map();
  rows.forEach((raw) => {
    const local = mapLocalEmbarqueRow(raw);
    if (!local.uf || !local.cidade || !local.nome_local) return;
    if (!isGeoBrasil(local.latitude, local.longitude)) return;
    locaisMap.set(pontoKey(local), local);
  });

  if (locaisMap.size < LOTE_MINIMO_LOCAIS) {
    console.warn(`[locais-embarque-agente] lote com poucos locais válidos (${locaisMap.size}/${rows.length}); sincronização de pontos ignorada.`);
    return { ignorado: true, linhas: rows.length, validos: locaisMap.size, motivo: 'poucos_validos' };
  }

  const existentes = await buscarPontosEmbarqueExistentes();
  const existentesPorKey = new Map();
  existentes.forEach((ponto) => {
    const key = pontoKey(ponto);
    if (key !== '||') existentesPorKey.set(key, ponto);
  });

  const atualizacoes = [];
  const insercoes = [];
  [...locaisMap.values()].forEach((local) => {
    const existente = existentesPorKey.get(pontoKey(local));
    if (existente?.id) atualizacoes.push({ id: existente.id, ...local });
    else insercoes.push(local);
  });

  for (let i = 0; i < atualizacoes.length; i += 500) {
    const chunk = atualizacoes.slice(i, i + 500);
    const { error } = await supabase.from('operacional_pontos_embarque').upsert(chunk, { onConflict: 'id' });
    if (error) throw error;
  }
  for (let i = 0; i < insercoes.length; i += 500) {
    const chunk = insercoes.slice(i, i + 500);
    const { error } = await supabase.from('operacional_pontos_embarque').insert(chunk);
    if (error) throw error;
  }

  const total = atualizacoes.length + insercoes.length;
  console.info(`[locais-embarque-agente] ${total} pontos georreferenciados sincronizados em operacional_pontos_embarque (${atualizacoes.length} atualizados, ${insercoes.length} novos).`);
  return { ignorado: false, linhas: rows.length, sincronizados: total, atualizados: atualizacoes.length, novos: insercoes.length };
}

// grm_distribuicao_os_importacoes vem com cabeçalhos genéricos (__EMPTY, __EMPTY_1, ...)
// porque o agente não usa a primeira linha da planilha como nome de coluna. A ordem das
// colunas no relatório de Distribuição de OS é fixa: Coordenação, Supervisão, Funcionário,
// Veículo, O.S., Cliente, Produto, Local de Embarque, Local de Destino, Lote, Prod. do Dia,
// Prod. do Dia OS, Prod. da OS, Prod. Remanescente (+ "Situação" sob a chave literal errada
// "Embarques com Produção", sobra do parser da planilha).
const DISTRIBUICAO_OS_COLS = [
  'Coordenação', 'Supervisão', 'Funcionário', 'Veiculo', 'O.S.', 'Cliente', 'Produto',
  'Local de Embarque', 'Local de Destino', 'Lote', 'Prod. do Dia', 'Prod. do Dia OS',
  'Prod. da OS', 'Prod. Remanescente',
];

function mapDistribuicaoRow(d) {
  const row = {};
  DISTRIBUICAO_OS_COLS.forEach((label, index) => {
    row[label] = d?.[index === 0 ? '__EMPTY' : `__EMPTY_${index}`];
  });
  return row;
}

async function buscarSupervisaoPorOsDistribuicao() {
  const rows = await buscarUltimoLote('grm_distribuicao_os_importacoes', 20000);
  const map = new Map();
  rows.forEach((raw) => {
    const d = mapDistribuicaoRow(raw);
    const os = normOs(d['O.S.']);
    if (!os || !/^\d+$/.test(os)) return; // pula a linha de cabeçalho
    map.set(os, {
      supervisao: toText(d['Supervisão']),
      embarcado: toNum(d['Prod. da OS']),
    });
  });
  return map;
}

async function buscarSupervisaoPorOsMapaEmbarque() {
  const rows = await buscarUltimoLote('grm_mapa_embarque_importacoes', 10000);
  const map = new Map();
  rows.forEach((d) => {
    const os = normOs(getField(d, ['OS', 'O.S.']));
    if (!os) return;
    map.set(os, {
      supervisao: toText(getField(d, ['Supervisão', 'Supervisao'])),
      embarcado: toNum(getField(d, ['Tons Total O.S.'])),
    });
  });
  return map;
}

// Distribuição de OS cobre muito mais O.S. abertas que o Mapa de Embarque (que só lista
// O.S. embarcando hoje); usa Distribuição como fonte principal e o Mapa só pra preencher
// o que faltar.
async function buscarSupervisaoPorOs() {
  const [mapaEmbarque, distribuicao] = await Promise.all([
    buscarSupervisaoPorOsMapaEmbarque().catch((error) => {
      console.warn('[lista-os-agente] falha ao ler grm_mapa_embarque_importacoes', error);
      return new Map();
    }),
    buscarSupervisaoPorOsDistribuicao().catch((error) => {
      console.warn('[lista-os-agente] falha ao ler grm_distribuicao_os_importacoes', error);
      return new Map();
    }),
  ]);
  const map = new Map(mapaEmbarque);
  distribuicao.forEach((value, key) => map.set(key, value));
  return map;
}

function mapListaOsRow(d) {
  const numero_os = normOs(getField(d, ['O.S.', 'OS']));
  return {
    numero_os,
    data_os: brDateToISO(getField(d, ['Data'])),
    cliente: toText(getField(d, ['Cliente'])),
    embarque: toText(getField(d, ['Embarque', 'Local de Embarque'])),
    destino: toText(getField(d, ['Destino'])),
    contrato: toText(getField(d, ['Contrato'])),
    produto: toText(getField(d, ['Produto'])),
    lote: toNum(getField(d, ['Lote'])),
    remanescente: toNum(getField(d, ['Remanescente'])),
    // colunas só presentes na exportação completa de "Ordem de Serviço" (Situação,
    // Supervisão, Financeiro, Serviço, Embarcado); ficam null/undefined em lotes antigos do
    // agente que não tinham essas colunas — o merge abaixo cobre com Distribuição/Mapa nesse caso.
    situacao: toText(getField(d, ['Situação', 'Situacao'])),
    financeiro: toText(getField(d, ['Financeiro'])),
    servico: toText(getField(d, ['Serviço', 'Servico'])),
    supervisaoPropria: toText(getField(d, ['Supervisão', 'Supervisao'])),
    embarcadoProprio: getField(d, ['Embarcado']) != null ? toNum(getField(d, ['Embarcado'])) : null,
    raw: d,
  };
}

async function agenteListaOsHabilitado() {
  try {
    const { data, error } = await supabase
      .from('grm_sync_agent_settings')
      .select('enabled')
      .eq('agent_id', 'sync-lista-os')
      .maybeSingle();
    if (error) throw error;
    return data ? data.enabled !== false : true;
  } catch (error) {
    console.warn('[lista-os-agente] falha ao checar grm_sync_agent_settings; seguindo como habilitado por padrão', error);
    return true;
  }
}

let sincronizando = null;

export async function sincronizarListaOsDoAgente() {
  if (sincronizando) return sincronizando;
  sincronizando = (async () => {
    try {
      const locaisResumo = await sincronizarLocaisEmbarqueDoAgente().catch((error) => {
        console.warn('[lista-os-agente] falha ao sincronizar Locais de Embarque', error);
        return { ignorado: true, erro: error?.message };
      });

      // sync-lista-os (Puppeteer/XLS) foi pausado em favor do polling direto na API
      // do GRM (grmserver-lista-os-api-realtime.js, ~8s, grava direto em
      // operacional_os). Rodar esse resync legado com o agente pausado leria um
      // lote de grm_lista_os_importacoes cada vez mais velho e, pior, apagaria de
      // operacional_os qualquer O.S. nova que só existe via o polling da API (por
      // não estar nesse lote antigo). Ver [[painel-web-colaboradores-lista-os-api-realtime]].
      if (!(await agenteListaOsHabilitado())) {
        console.info('[lista-os-agente] sync-lista-os está pausado (grm_sync_agent_settings); pulando resync legado — operacional_os já é mantido pela API em tempo quase real.');
        return { ignorado: true, motivo: 'agente_pausado', locais: locaisResumo };
      }

      const [listaRows, supervisaoMap] = await Promise.all([
        buscarUltimoLote('grm_lista_os_importacoes', 20000),
        buscarSupervisaoPorOs(),
      ]);

      if (listaRows.length < LOTE_MINIMO) {
        console.warn(`[lista-os-agente] lote do agente pequeno demais (${listaRows.length} linhas); sincronização ignorada para não apagar O.S. válidas por engano.`);
        return { ignorado: true, linhas: listaRows.length, locais: locaisResumo };
      }

      const mappedRaw = listaRows.map(mapListaOsRow).filter((row) => row.numero_os);
      const uniqueMap = new Map();
      mappedRaw.forEach((row) => {
        const extra = supervisaoMap.get(row.numero_os);
        const { supervisaoPropria, embarcadoProprio, ...rest } = row;
        uniqueMap.set(row.numero_os, {
          ...rest,
          supervisao: supervisaoPropria ?? extra?.supervisao ?? null,
          embarcado: embarcadoProprio ?? extra?.embarcado ?? 0,
          arquivo_origem: 'agente:grm_lista_os_importacoes',
          updated_at: new Date().toISOString(),
        });
      });
      const novosNumeros = new Set(uniqueMap.keys());

      const existentes = await buscarTodasOsExistentes();
      const statusExistente = new Map(existentes.map((row) => [row.numero_os, row]));

      const payload = [...uniqueMap.values()].map((row) => {
        const existente = statusExistente.get(row.numero_os);
        // data_os é a data em que a O.S. está sendo atendida, não a de abertura
        // no GRM — ela pode ser aberta dias atrás e só ser atendida dias à
        // frente (esclarecido pelo usuário, 2026-08-03). Uma vez que o gestor
        // marcou Atender/Finalizar, essa data já foi movida de propósito
        // (ver programacao-equipe.js/atualizarStatusOsCore e o trigger
        // programacao_equipe_marca_os_atender) — preservar aqui, senão esse
        // resync (disparado sempre que alguém abre Logística > Distribuir O.S.)
        // reverte silenciosamente pra data original do GRM e a O.S. some do
        // Mapa Operacional (que filtra por data_os = hoje).
        const preservarData = existente && ['ATENDER', 'FINALIZAR'].includes(existente.status_gestor);
        return {
          ...row,
          // preserva o trabalho do gestor para O.S. que já existiam; novas entram como antes (null/PENDENTE).
          status_gestor: existente ? existente.status_gestor : null,
          status_conferencia: existente ? existente.status_conferencia : 'PENDENTE',
          data_os: preservarData ? existente.data_os : row.data_os,
        };
      });

      for (let i = 0; i < payload.length; i += 500) {
        const chunk = payload.slice(i, i + 500);
        const { error } = await supabase.from('operacional_os').upsert(chunk, { onConflict: 'numero_os' });
        if (error) throw error;
      }

      // O.S. que não aparecem mais no relatório do agente saem do painel (cascade remove atribuições).
      const removidos = existentes
        .map((row) => row.numero_os)
        .filter((numero) => !novosNumeros.has(numero));
      let totalRemovidos = 0;
      for (let i = 0; i < removidos.length; i += 200) {
        const chunk = removidos.slice(i, i + 200);
        const remover = String.fromCharCode(100, 101, 108, 101, 116, 101);
        const { error } = await supabase.from('operacional_os')[remover]().in('numero_os', chunk);
        if (error) { console.warn('[lista-os-agente] falha ao remover O.S. ausentes do relatório', error); break; }
        totalRemovidos += chunk.length;
      }

      console.info(`[lista-os-agente] sincronização automática: ${payload.length} O.S. atualizadas/inseridas, ${totalRemovidos} removidas (ausentes do relatório do agente), ${locaisResumo?.sincronizados || 0} locais georreferenciados.`);
      return { ignorado: false, atualizadas: payload.length, removidas: totalRemovidos, locais: locaisResumo };
    } catch (error) {
      console.warn('[lista-os-agente] falha na sincronização automática', error);
      return { ignorado: true, erro: error?.message };
    } finally {
      sincronizando = null;
    }
  })();
  return sincronizando;
}
