// Sincroniza producao_snapshot a partir do agente sync-producao-diaria
// (grm_producao_diaria_importacoes), replicando o mesmo mapeamento de campos
// que assets/js/importarProducao.js já grava na importação manual.
//
// producao_snapshot é a base oficial de "Metas" (ver comentário no topo de
// modules/metas.js: "Produção usada para bater meta = producao_snapshot.tons",
// "Não usar Resultado Diário") — por isso essa conexão é separada da de FOB,
// que usa a mesma tabela de origem mas filtrada só por Serviço=Classificação FOB.
//
// Diferente do upload manual (que só faz insert, um upload = um lote isolado),
// o agente resincroniza ~11.000 linhas a cada ~20min cobrindo várias semanas.
// Para não duplicar a cada ciclo, apagamos o intervalo de datas coberto pelo
// lote atual antes de inserir de novo (mesmo padrão usado em
// replacePainelResultadoDiario no agente de Resultado Diário).
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
  const s = String(value).trim().replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
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
  const { data, error } = await supabase
    .from('grm_producao_diaria_importacoes').select('dados_json').gte('created_at', threshold).limit(limite);
  if (error) throw error;
  return (data || []).map((row) => row.dados_json);
}

let sincronizando = null;

export async function sincronizarProducaoSnapshotDoAgente() {
  if (sincronizando) return sincronizando;
  sincronizando = (async () => {
    try {
      const dadosBrutos = await buscarUltimoLoteAgente(20000);
      if (dadosBrutos.length < LOTE_MINIMO) {
        console.warn(`[producao-snapshot-agente] lote do agente pequeno demais (${dadosBrutos.length} linhas); sincronização ignorada.`);
        return { ignorado: true, linhas: dadosBrutos.length };
      }

      const mapped = dadosBrutos
        .map(mapAgentRow)
        // descarta linhas de rodapé/total ("Serviço":"Total") e linhas sem O.S./data válida
        .filter((row) => row.os && row.data && row.servico !== 'Total');

      if (!mapped.length) {
        console.warn('[producao-snapshot-agente] nenhuma linha válida após filtro; sincronização ignorada.');
        return { ignorado: true, linhas: 0 };
      }

      const datas = mapped.map((row) => row.data).sort();
      const dataMin = datas[0];
      const dataMax = datas[datas.length - 1];

      const { error: delError } = await supabase
        .from('producao_snapshot')
        .delete()
        .gte('data', dataMin)
        .lte('data', dataMax);
      if (delError) throw delError;

      for (let i = 0; i < mapped.length; i += 500) {
        const chunk = mapped.slice(i, i + 500);
        const { error } = await supabase.from('producao_snapshot').insert(chunk);
        if (error) throw error;
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
