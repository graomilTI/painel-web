// Sincroniza producao_snapshot a partir do agente sync-producao-diaria
// (grm_producao_diaria_importacoes), replicando o mesmo mapeamento de campos
// que assets/js/importarProducao.js já grava na importação manual.
//
// producao_snapshot alimenta o "Meta Mensal" do dashboard do Gestor
// (assets/js/dashboard.js, soma o mês inteiro) — por isso essa conexão é
// separada da de FOB, que usa a mesma tabela de origem mas filtrada só por
// Serviço=Classificação FOB.
//
// sync-producao-diaria (Puppeteer/XLS, agente que alimentava
// grm_producao_diaria_importacoes) foi pausado em 01/09 em favor do polling
// direto na API do GRM (grmserver-producao-diaria-api-realtime.js), que grava
// direto em producao_snapshot (janela rápida de 2 dias + sync completa
// periódica do mês, ver comentário no topo daquele arquivo). Com o agente
// antigo pausado, grm_producao_diaria_importacoes para de crescer — rodar
// este resync legado leria sempre o mesmo lote cada vez mais velho e
// sobrescreveria com dado desatualizado o que a API em tempo quase real já
// mantém fresco. Ver agenteProducaoDiariaHabilitado() abaixo (mesmo padrão
// de listaOsAgentSync.js/agenteListaOsHabilitado()).
//
// Diferente do upload manual (que só faz insert, um upload = um lote isolado),
// o agente resincroniza ~11.000 linhas a cada ~20min cobrindo várias semanas.
// Para não duplicar a cada ciclo, substituímos o intervalo de datas coberto
// pelo lote atual em uma única transação no banco. Assim nenhuma leitura do
// dashboard enxerga o período entre o delete e o fim dos inserts.
import { supabase } from './supabaseClient.js';

const LOTE_MINIMO = 1000;

function toText(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  // O agente já envia números como string em formato padrão ("698.3600"), não
  // no formato brasileiro. Só reinterpretar '.' como separador de milhar quando
  // houver vírgula decimal explícita (ex.: "1.234,56") — do contrário o ponto
  // decimal é removido e o valor é inflado (bug 05/08: tons virava 10000x maior).
  let s = String(value).trim();
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  s = s.replace(/[^\d.-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function brDateToISO(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? s.slice(0, 10) : null;
}

function mapAgentRow(d) {
  const data = brDateToISO(d?.Data);
  const os = toText(d?.['O.S.']);
  return {
    data_referencia: data,
    coordenacao: toText(d?.Coordenação),
    supervisao: toText(d?.Supervisão),
    funcionario: toText(d?.Funcionário),
    tipo: toText(d?.Tipo),
    data,
    os,
    cliente: toText(d?.Cliente),
    servico: toText(d?.Serviço),
    cidade: toText(d?.Cidade),
    local_embarque: toText(d?.['Local de Embarque']),
    checkin: toText(d?.['Check-in']),
    checkout: toText(d?.['Check-out']),
    cargas: toNumber(d?.Cargas),
    tons: toNumber(d?.Tons),
  };
}

async function buscarUltimoLoteAgente(limite) {
  const { data: maxRows, error: maxErr } = await supabase
    .from('grm_producao_diaria_importacoes').select('created_at').order('created_at', { ascending: false }).limit(1);
  if (maxErr) throw maxErr;
  const maxCreatedAt = maxRows?.[0]?.created_at;
  if (!maxCreatedAt) return [];
  // o agente recarrega a tabela inteira a cada sincronização; pegamos só o lote mais recente.
  const threshold = new Date(new Date(maxCreatedAt).getTime() - 5 * 60 * 1000).toISOString();
  // PostgREST limita a 1000 linhas por requisição mesmo com .limit() maior; pagina com
  // .range() para trazer o lote inteiro (sem isso o sync sempre pegava só os 1000 primeiros).
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; from < limite; from += pageSize) {
    const to = Math.min(from + pageSize, limite) - 1;
    const { data, error } = await supabase
      .from('grm_producao_diaria_importacoes')
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

async function agenteProducaoDiariaHabilitado() {
  try {
    const { data, error } = await supabase
      .from('grm_sync_agent_settings')
      .select('enabled')
      .eq('agent_id', 'sync-producao-diaria')
      .maybeSingle();
    if (error) throw error;
    return data ? data.enabled !== false : true;
  } catch (error) {
    console.warn('[producao-snapshot-agente] falha ao checar grm_sync_agent_settings; seguindo como habilitado por padrão', error);
    return true;
  }
}

let sincronizando = null;

export async function sincronizarProducaoSnapshotDoAgente() {
  if (sincronizando) return sincronizando;
  sincronizando = (async () => {
    try {
      if (!(await agenteProducaoDiariaHabilitado())) {
        console.info('[producao-snapshot-agente] sync-producao-diaria está pausado (grm_sync_agent_settings); pulando resync legado — producao_snapshot já é mantido pela API em tempo quase real.');
        return { ignorado: true, motivo: 'agente_pausado' };
      }

      const dadosBrutos = await buscarUltimoLoteAgente(20000);
      if (dadosBrutos.length < LOTE_MINIMO) {
        console.warn(`[producao-snapshot-agente] lote do agente pequeno demais (${dadosBrutos.length} linhas); sincronização ignorada.`);
        return { ignorado: true, linhas: dadosBrutos.length };
      }

      const rawMapped = dadosBrutos
        .map(mapAgentRow)
        // descarta linhas de rodapé/total ("Serviço":"Total") e linhas sem O.S./data válida
        .filter((row) => row.os && row.data && row.servico !== 'Total');

      // De-duplica por chave de negócio: a janela de 5 min pode capturar dois ciclos
      // consecutivos do agente, o que dobraria os dados antes do delete+insert.
      const seen = new Set();
      const mapped = rawMapped.filter((row) => {
        const key = `${row.data}|${row.os}|${row.funcionario}|${row.servico}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      if (!mapped.length) {
        console.warn('[producao-snapshot-agente] nenhuma linha válida após filtro; sincronização ignorada.');
        return { ignorado: true, linhas: 0 };
      }

      const datas = mapped.map((row) => row.data).sort();
      const dataMin = datas[0];
      const dataMax = datas[datas.length - 1];

      const { data: totalInserido, error } = await supabase.rpc('substituir_producao_snapshot_periodo', {
        p_data_ini: dataMin,
        p_data_fim: dataMax,
        p_linhas: mapped,
      });
      if (error) throw error;
      if (Number(totalInserido) !== mapped.length) {
        throw new Error(`Substituição incompleta: ${totalInserido}/${mapped.length} linhas.`);
      }

      console.info(`[producao-snapshot-agente] sincronização automática: ${mapped.length} linhas (${dataMin} a ${dataMax}).`);
      return { ignorado: false, linhas: mapped.length, dataMin, dataMax };
    } catch (error) {
      console.warn('[producao-snapshot-agente] falha na sincronização automática', error);
      return { ignorado: true, erro: error?.message };
    } finally {
      sincronizando = null;
    }
  })();
  return sincronizando;
}
