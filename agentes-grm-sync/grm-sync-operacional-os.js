require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

// Porta pra servidor a lógica que antes só rodava em assets/js/listaOsAgentSync.js
// (disparada no navegador ao abrir "Distribuir O.S.") — sincroniza operacional_os a partir
// dos agentes sync-lista-os (grm_lista_os_importacoes, campos cliente/contrato/lote/
// remanescente), sync-mapa-embarque/sync-distribuicao-os (usados para preencher Supervisão/
// embarcado) e sync-locais-embarque (grm_locais_embarque_importacoes ->
// operacional_pontos_embarque, usado pelo trigger de operacional_os pra resolver a
// localização real das O.S. pelo campo Embarque no formato "UF - Cidade (Local)").
//
// Diferente de Patrimônios/Financeiro, aqui NÃO apagamos tudo antes de regravar:
// operacional_os guarda estado de trabalho do gestor (status_gestor, status_conferencia,
// atribuições de colaborador em operacional_os_colaboradores via FK com CASCADE). Por isso:
//   - upsert por numero_os preservando status_gestor/status_conferencia das O.S. já existentes;
//   - O.S. que não aparecem mais no relatório do agente são removidas do painel (cascade
//     também remove as atribuições delas) — MAS só se o lote novo cobrir pelo menos
//     LIMITE_PROPORCAO_REMOCAO do LOTE ANTERIOR do agente (contarLoteAnteriorListaOs), não do
//     total acumulado em operacional_os; do contrário, um scraping incompleto (GRM parcialmente
//     fora do ar, filtro errado etc.) apagaria O.S. válidas em massa sem ninguém supervisionando
//     (essa versão roda sozinha via agendador, sem o gestor olhando a tela como acontecia na
//     versão original em assets/js/listaOsAgentSync.js).
// `financeiro`, `servico` e `situacao` já vêm do XLS (ver mapListaOsRow) — nenhuma tela do
// painel filtra por eles hoje além de os.js (isOsFechada), que usa situacao + updated_at.

const supabase = createClient(
  process.env.SUPABASE_URL,
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY),
  { realtime: { transport: WebSocket } }
);

const LOTE_MINIMO = 50;
const LOTE_MINIMO_LOCAIS = 10;
const LIMITE_PROPORCAO_REMOCAO = 0.8;

function log(level, msg) {
  console.log(`[${level}] ${new Date().toISOString()} - ${msg}`);
}

function normKey(value) {
  return String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
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
  // .range() para trazer o lote inteiro.
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

// Conta o tamanho do lote de grm_lista_os_importacoes ANTERIOR ao mais recente (mesma
// lógica de janela de 5min do buscarUltimoLote, aplicada ao lote que veio antes dele).
// Usado como referência de cobertura para o guard de remoção — ver contarLoteAnteriorListaOs.
async function contarLoteAnteriorListaOs() {
  const { data: maxRows, error: maxErr } = await supabase
    .from('grm_lista_os_importacoes').select('created_at').order('created_at', { ascending: false }).limit(1);
  if (maxErr) throw maxErr;
  const maxCreatedAt = maxRows?.[0]?.created_at;
  if (!maxCreatedAt) return null;
  const thresholdAtual = new Date(new Date(maxCreatedAt).getTime() - 5 * 60 * 1000).toISOString();

  const { data: prevRows, error: prevErr } = await supabase
    .from('grm_lista_os_importacoes').select('created_at')
    .lt('created_at', thresholdAtual)
    .order('created_at', { ascending: false }).limit(1);
  if (prevErr) throw prevErr;
  const prevCreatedAt = prevRows?.[0]?.created_at;
  if (!prevCreatedAt) return null;
  const prevThreshold = new Date(new Date(prevCreatedAt).getTime() - 5 * 60 * 1000).toISOString();

  const { count, error: countErr } = await supabase
    .from('grm_lista_os_importacoes')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', prevThreshold)
    .lt('created_at', thresholdAtual);
  if (countErr) throw countErr;
  return count ?? null;
}

async function buscarTodasOsExistentes() {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('operacional_os')
      .select('numero_os,data_os,status_gestor,status_conferencia')
      .order('numero_os', { ascending: true })
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
  // GRM passou a exportar essa tela em JSON com prefixo "spl" (splName/splLat/splLon/
  // splCitName/splCitUF) em vez dos cabeçalhos de planilha em português usados antes
  // (05/08 em diante); mantemos os aliases antigos como fallback caso o formato mude de novo.
  const latitude = toGeoNum(getField(d, ['Latitude', 'Lat', 'splLat']));
  const longitude = toGeoNum(getField(d, ['Longitude', 'Long', 'Lng', 'splLon']));
  return {
    tipo_local: toText(getField(d, ['Tipo do Local', 'Tipo Local', 'Tipo', 'sptName'])),
    nome_local: toText(getField(d, ['Local', 'Nome Local', 'Nome do Local', 'Local de Embarque', 'splName'])),
    uf: toText(getField(d, ['UF', 'Estado', 'splCitUF'])),
    cidade: toText(getField(d, ['Cidade', 'Municipio', 'Município', 'splCitName'])),
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
    log('WARN', `[locais-embarque] lote com poucos locais válidos (${locaisMap.size}/${rows.length}); sincronização de pontos ignorada.`);
    return { ignorado: true, linhas: rows.length, validos: locaisMap.size, motivo: 'poucos_validos' };
  }

  // Upsert por chave natural (nome_local, cidade, uf), não por id: fazer update-por-id exigiria
  // primeiro casar cada local novo com um id existente via pontoKey normalizado (acento/caixa
  // insensível), mas a constraint operacional_pontos_embarque_unico é sobre o texto bruto — dois
  // ids diferentes já existentes podem ambos normalizar pro mesmo pontoKey (cadastros antigos
  // meio duplicados) e a tentativa de "renomear" um deles pros novos valores colide com o outro
  // ("duplicate key value violates unique constraint"). Upsert direto pela chave natural evita
  // essa classe de colisão por completo: o Postgres resolve sozinho qual linha já tem aquele
  // nome/cidade/UF exatos, sem precisar adivinhar por id.
  // Ainda existe um segundo índice único (normalizado por maiúscula/trim, ativo=true) além
  // dessa chave natural bruta — dois cadastros antigos meio duplicados podem colidir nele
  // mesmo sem colidir na chave natural. Se o lote inteiro falhar por causa de 1-2 linhas
  // assim, cai pra upsert linha a linha só nesse chunk, pulando (e contando) só as que
  // realmente colidem, em vez de perder o lote inteiro.
  const locais = [...locaisMap.values()];
  let sincronizados = 0;
  let ignoradosPorColisao = 0;
  for (let i = 0; i < locais.length; i += 500) {
    const chunk = locais.slice(i, i + 500);
    const { error } = await supabase
      .from('operacional_pontos_embarque')
      .upsert(chunk, { onConflict: 'nome_local,cidade,uf' });
    if (!error) { sincronizados += chunk.length; continue; }

    log('WARN', `[locais-embarque] chunk falhou (${error.message}); tentando linha a linha...`);
    for (const local of chunk) {
      const { error: rowError } = await supabase
        .from('operacional_pontos_embarque')
        .upsert([local], { onConflict: 'nome_local,cidade,uf' });
      if (rowError) ignoradosPorColisao++;
      else sincronizados++;
    }
  }

  log('SUCCESS', `[locais-embarque] ${sincronizados} pontos georreferenciados sincronizados em operacional_pontos_embarque${ignoradosPorColisao ? ` (${ignoradosPorColisao} ignorados por colisão de cadastro duplicado)` : ''}.`);
  return { ignorado: false, linhas: rows.length, sincronizados, ignoradosPorColisao };
}

// grm_distribuicao_os_importacoes vem com cabeçalhos genéricos (__EMPTY, __EMPTY_1, ...)
// porque o agente não usa a primeira linha da planilha como nome de coluna. A ordem das
// colunas no relatório de Distribuição de OS é fixa: Coordenação, Supervisão, Funcionário,
// Veículo, O.S., Cliente, Produto, Local de Embarque, Local de Destino, Lote, Prod. do Dia,
// Prod. do Dia OS, Prod. da OS, Prod. Remanescente.
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
      log('WARN', `[lista-os] falha ao ler grm_mapa_embarque_importacoes: ${error.message}`);
      return new Map();
    }),
    buscarSupervisaoPorOsDistribuicao().catch((error) => {
      log('WARN', `[lista-os] falha ao ler grm_distribuicao_os_importacoes: ${error.message}`);
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
    situacao: toText(getField(d, ['Situação', 'Situacao'])),
    financeiro: toText(getField(d, ['Financeiro'])),
    servico: toText(getField(d, ['Serviço', 'Servico'])),
    supervisaoPropria: toText(getField(d, ['Supervisão', 'Supervisao'])),
    embarcadoProprio: getField(d, ['Embarcado']) != null ? toNum(getField(d, ['Embarcado'])) : null,
    raw: d,
  };
}

async function sincronizarListaOsDoAgente() {
  const [listaRows, supervisaoMap, locaisResumo] = await Promise.all([
    buscarUltimoLote('grm_lista_os_importacoes', 20000),
    buscarSupervisaoPorOs(),
    sincronizarLocaisEmbarqueDoAgente().catch((error) => {
      log('WARN', `[lista-os] falha ao sincronizar Locais de Embarque: ${error.message}`);
      return { ignorado: true, erro: error?.message };
    }),
  ]);

  if (listaRows.length < LOTE_MINIMO) {
    log('WARN', `[lista-os] lote do agente pequeno demais (${listaRows.length} linhas); sincronização ignorada para não apagar O.S. válidas por engano.`);
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
    // só preserva o trabalho do gestor quando é a mesma ocorrência (data_os igual);
    // O.S. recorrente cuja data_os avançou pra um novo dia entra limpa, como se fosse nova,
    // senão ela fica presa no status_gestor='FINALIZAR' de ontem e some da Programação de hoje.
    const mesmaOcorrencia = existente && existente.data_os === row.data_os;
    return {
      ...row,
      status_gestor: mesmaOcorrencia ? existente.status_gestor : null,
      status_conferencia: mesmaOcorrencia ? existente.status_conferencia : 'PENDENTE',
    };
  });

  // Lote menor que os outros upserts (500) de propósito: cada linha dispara
  // trg_operacional_os_resolver_ponto (consulta operacional_pontos_embarque), e um chunk de
  // 500 nesse trigger já chegou a estourar o statement_timeout do PostgREST/service_role
  // (~8s) em teste real. 150 dá folga confortável mesmo com variação de carga do banco.
  const CHUNK_OS = 150;
  log('INFO', `Iniciando upsert de ${payload.length} O.S. em operacional_os...`);
  for (let i = 0; i < payload.length; i += CHUNK_OS) {
    const chunk = payload.slice(i, i + CHUNK_OS);
    const { error } = await supabase.from('operacional_os').upsert(chunk, { onConflict: 'numero_os' });
    if (error) throw error;
    log('INFO', `Progresso: ${Math.min(i + CHUNK_OS, payload.length)}/${payload.length}`);
  }

  // O.S. que não aparecem mais no relatório do agente saem do painel (cascade remove atribuições)
  // — só se o lote novo cobrir pelo menos LIMITE_PROPORCAO_REMOCAO das O.S. existentes. Essa
  // sincronização agora roda sozinha via agendador (sem gestor olhando a tela), então um
  // scraping incompleto não pode mais apagar O.S. válidas em massa sem ninguém perceber.
  const removidos = existentes
    .map((row) => row.numero_os)
    .filter((numero) => !novosNumeros.has(numero));
  let totalRemovidos = 0;
  if (removidos.length) {
    // A cobertura é medida contra o LOTE ANTERIOR do próprio agente (scrape-a-scrape), não
    // contra existentes.length: esse total acumula O.S. já fechadas que a própria falta de
    // remoção nunca deixa cair, então comparar contra ele cria um piso que a cobertura real
    // (tipicamente ~55-60% do acumulado, mesmo com scraping saudável) nunca alcança — travando
    // a remoção pra sempre e agravando o acúmulo que o guard deveria evitar. Sem lote anterior
    // pra comparar (primeira execução), cai no comportamento antigo como rede de segurança.
    const loteAnterior = await contarLoteAnteriorListaOs().catch((error) => {
      log('WARN', `Não foi possível conferir o lote anterior para validar cobertura: ${error.message}`);
      return null;
    });
    const referencia = loteAnterior && loteAnterior > 0 ? loteAnterior : existentes.length;
    const proporcaoCobertura = referencia > 0 ? novosNumeros.size / referencia : 1;
    if (proporcaoCobertura < LIMITE_PROPORCAO_REMOCAO) {
      log('WARN', `Lote novo cobre só ${novosNumeros.size}/${referencia} (${(proporcaoCobertura * 100).toFixed(1)}%) do lote de referência; pulando remoção automática de ${removidos.length} O.S. ausentes (possível scraping incompleto).`);
    } else {
      for (let i = 0; i < removidos.length; i += 200) {
        const chunk = removidos.slice(i, i + 200);
        const { error } = await supabase.from('operacional_os').delete().in('numero_os', chunk);
        if (error) { log('WARN', `falha ao remover O.S. ausentes do relatório: ${error.message}`); break; }
        totalRemovidos += chunk.length;
      }
    }
  }

  log('SUCCESS', `sincronização concluída: ${payload.length} O.S. atualizadas/inseridas, ${totalRemovidos} removidas (ausentes do relatório do agente), ${locaisResumo?.sincronizados || 0} locais georreferenciados.`);
  return { ignorado: false, atualizadas: payload.length, removidas: totalRemovidos, locais: locaisResumo };
}

async function main() {
  log('INFO', '=== Iniciando sincronização operacional_os (Lista de OS -> painel) ===');
  const resultado = await sincronizarListaOsDoAgente();
  log('INFO', JSON.stringify(resultado));
  log('SUCCESS', 'Sincronização operacional_os concluída!');
}

main().then(() => process.exit(0)).catch((err) => {
  log('ERROR', err.message);
  process.exit(1);
});
setTimeout(() => process.exit(0), 180000);
