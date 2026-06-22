// Sincroniza operacional_os a partir dos agentes sync-lista-os (grm_lista_os_importacoes,
// campos/cliente/contrato/lote/remanescente) e sync-mapa-embarque (grm_mapa_embarque_importacoes,
// usado só para preencher Supervisão por O.S. — já validado e usado também no FOB automático).
//
// Diferente de Patrimônios/Financeiro, aqui NÃO apagamos tudo antes de regravar: operacional_os
// guarda estado de trabalho do gestor (status_gestor, status_conferencia, atribuições de
// colaborador em operacional_os_colaboradores via FK com CASCADE). Por isso:
//   - upsert por numero_os preservando status_gestor/status_conferencia das O.S. já existentes;
//   - O.S. que não aparecem mais no relatório do agente são removidas do painel (cascade
//     também remove as atribuições delas) — comportamento pedido explicitamente, equivalente
//     ao "substituir a lista anterior" que o upload manual já faz hoje.
// `financeiro`, `servico` e `situacao` não têm fonte automática ainda; ficam null (mesma
// degradação граceful que o upload manual já tolera quando a planilha não tem essas colunas).
import { supabase } from './supabaseClient.js';

const LOTE_MINIMO = 50;

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
      .select('numero_os,status_gestor,status_conferencia')
      .order('numero_os', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return rows;
}

async function buscarSupervisaoPorOs() {
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

function mapListaOsRow(d) {
  const numero_os = normOs(getField(d, ['O.S.', 'OS']));
  return {
    numero_os,
    data_os: brDateToISO(getField(d, ['Data'])),
    cliente: toText(getField(d, ['Cliente'])),
    embarque: toText(getField(d, ['Local de Embarque'])),
    destino: toText(getField(d, ['Destino'])),
    contrato: toText(getField(d, ['Contrato'])),
    produto: toText(getField(d, ['Produto'])),
    lote: toNum(getField(d, ['Lote'])),
    remanescente: toNum(getField(d, ['Remanescente'])),
    raw: d,
  };
}

let sincronizando = null;

export async function sincronizarListaOsDoAgente() {
  if (sincronizando) return sincronizando;
  sincronizando = (async () => {
    try {
      const [listaRows, supervisaoMap] = await Promise.all([
        buscarUltimoLote('grm_lista_os_importacoes', 20000),
        buscarSupervisaoPorOs(),
      ]);

      if (listaRows.length < LOTE_MINIMO) {
        console.warn(`[lista-os-agente] lote do agente pequeno demais (${listaRows.length} linhas); sincronização ignorada para não apagar O.S. válidas por engano.`);
        return { ignorado: true, linhas: listaRows.length };
      }

      const mappedRaw = listaRows.map(mapListaOsRow).filter((row) => row.numero_os);
      const uniqueMap = new Map();
      mappedRaw.forEach((row) => {
        const extra = supervisaoMap.get(row.numero_os);
        uniqueMap.set(row.numero_os, {
          ...row,
          supervisao: extra?.supervisao ?? null,
          embarcado: extra?.embarcado ?? 0,
          situacao: null,
          financeiro: null,
          servico: null,
          arquivo_origem: 'agente:grm_lista_os_importacoes',
          updated_at: new Date().toISOString(),
        });
      });
      const novosNumeros = new Set(uniqueMap.keys());

      const existentes = await buscarTodasOsExistentes();
      const statusExistente = new Map(existentes.map((row) => [row.numero_os, row]));

      const payload = [...uniqueMap.values()].map((row) => {
        const existente = statusExistente.get(row.numero_os);
        return {
          ...row,
          // preserva o trabalho do gestor para O.S. que já existiam; novas entram como antes (null/PENDENTE).
          status_gestor: existente ? existente.status_gestor : null,
          status_conferencia: existente ? existente.status_conferencia : 'PENDENTE',
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
        const { error } = await supabase.from('operacional_os').delete().in('numero_os', chunk);
        if (error) { console.warn('[lista-os-agente] falha ao remover O.S. ausentes do relatório', error); break; }
        totalRemovidos += chunk.length;
      }

      console.info(`[lista-os-agente] sincronização automática: ${payload.length} O.S. atualizadas/inseridas, ${totalRemovidos} removidas (ausentes do relatório do agente).`);
      return { ignorado: false, atualizadas: payload.length, removidas: totalRemovidos };
    } catch (error) {
      console.warn('[lista-os-agente] falha na sincronização automática', error);
      return { ignorado: true, erro: error?.message };
    } finally {
      sincronizando = null;
    }
  })();
  return sincronizando;
}
