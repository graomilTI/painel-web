// Hotfix 2026-09-14: ao abrir uma O.S. pela busca remota, a implementação
// original de loadEquipeDaOsPorId() traz todo o histórico de programacao_equipe
// daquela O.S. Isso faz o drawer renderizar o mesmo colaborador várias vezes e
// também contamina a lógica de inclusão/remoção com vínculos de dias antigos.
//
// Este módulo reexporta toda a API original e substitui somente essa leitura.
// O histórico continua intacto no banco; retornamos apenas a programação
// pertinente ao contexto de data aberto no painel (ou a mais recente anterior).

import { supabase } from './supabaseClient.js';
import { loadEquipeDaOsPorId as loadEquipeDaOsPorIdOriginal } from './programacao-equipe.js?v=20260914-equipe-os-busca-remota-fix-base';

export * from './programacao-equipe.js?v=20260914-equipe-os-busca-remota-fix-base';

function dataReferenciaDoContexto() {
  try {
    if (typeof window !== 'undefined' && typeof window.__progGetDataReferencia === 'function') {
      const valor = String(window.__progGetDataReferencia() || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
    }
    if (typeof document !== 'undefined') {
      const valor = String(document.getElementById('progDataRef')?.value || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
    }
  } catch (_) {}
  return '';
}

function timestamp(row) {
  return Date.parse(row?.updated_at || row?.created_at || '') || 0;
}

function escolherProgramacao(programacoes, dataReferencia) {
  const validas = (programacoes || []).filter((p) => p?.id && /^\d{4}-\d{2}-\d{2}$/.test(String(p.data_referencia || '').slice(0, 10)));
  if (!validas.length) return null;

  const ordenadas = [...validas].sort((a, b) => {
    const dataA = String(a.data_referencia).slice(0, 10);
    const dataB = String(b.data_referencia).slice(0, 10);
    if (dataA !== dataB) return dataB.localeCompare(dataA);
    const tsDiff = timestamp(b) - timestamp(a);
    if (tsDiff) return tsDiff;
    return String(b.id).localeCompare(String(a.id));
  });

  if (!dataReferencia) return ordenadas[0];

  // Prioridade: a própria data aberta. Se a O.S. não tem vínculo exatamente
  // nela (caso comum ao pesquisar uma O.S. antiga enquanto se está em hoje),
  // usa a programação mais recente até a data aberta e nunca "puxa" o futuro.
  return ordenadas.find((p) => String(p.data_referencia).slice(0, 10) <= dataReferencia) || ordenadas[0];
}

export async function loadEquipeDaOsPorId(osId) {
  if (!osId) return [];

  try {
    // A view já elimina snapshots concorrentes da mesma O.S./data e preserva
    // somente a programação vencedora daquele dia. Ainda podem existir vários
    // dias históricos; abaixo selecionamos apenas um deles para o drawer.
    const { data: rows, error } = await supabase
      .from('programacao_equipe_ultima')
      .select('*')
      .eq('os_id', osId);
    if (error) throw error;
    if (!rows?.length) return [];

    const programacaoIds = [...new Set(rows.map((r) => r.programacao_id).filter(Boolean))];
    if (!programacaoIds.length) return [];

    const { data: programacoes, error: progError } = await supabase
      .from('programacao_dia_ultima')
      .select('id,data_referencia,created_at,updated_at')
      .in('id', programacaoIds);
    if (progError) throw progError;

    const escolhida = escolherProgramacao(programacoes, dataReferenciaDoContexto());
    if (!escolhida) return [];

    return rows.filter((r) => String(r.programacao_id) === String(escolhida.id));
  } catch (error) {
    // Mantém a tela funcional mesmo se a view estiver temporariamente
    // indisponível; o fallback é a implementação anterior, com aviso no console.
    console.warn('[programacao] falha ao filtrar equipe atual da O.S.; usando leitura legada.', error);
    return loadEquipeDaOsPorIdOriginal(osId);
  }
}
