// Confere, no envio da abertura de O.S., se a Supervisão escolhida bate com a que o cadastro interno
// (operacional_pontos_embarque) tem pro local de embarque; se não bate, o formulário pede confirmação.
// O agente abre a O.S. exatamente na supervisão da solicitação, então um erro aqui vira O.S. na
// regional errada (94523 Buri, 94879/94881 Diamantino).
import { supabase } from './supabaseClient.js';
import { locaisDaCidade, chaveLocal } from './logistica-locais-servico.js?v=20260924-novo3';
import { avaliarSupervisao } from './logistica-supervisao-embarque-regra.js';

const cache = new Map();

// ilike sem curingas: % e _ do nome viram literais.
function literalIlike(value) {
  return String(value ?? '').trim().replace(/[\\%_]/g, '\\$&');
}

async function pontosDaCidade(uf, cidade) {
  const key = `${String(uf).toUpperCase()}|${chaveLocal(cidade)}`;
  if (cache.has(key)) return cache.get(key);
  const { data, error } = await supabase
    .from('operacional_pontos_embarque')
    .select('nome_local,tipo_local,supervisao')
    .ilike('uf', literalIlike(uf))
    .ilike('cidade', literalIlike(cidade))
    .limit(2000);
  if (error) throw error;
  const rows = data || [];
  cache.set(key, rows);
  return rows;
}

// { ok:true } quando bate ou não há como afirmar (cadastro sem supervisão, falha de consulta);
// { ok:false, motivo } quando o cadastro indica outra supervisão (o chamador pergunta se segue mesmo assim).
export async function validarSupervisaoEmbarque({ uf, cidade, nome, regional }) {
  if (!uf || !cidade || !nome || !regional) return { ok: true, ignorada: true };
  try {
    const pontos = await pontosDaCidade(uf, cidade);
    const alvo = chaveLocal(nome);
    // Local fora do cadastro interno: o tipo vem do espelho do GRM, pra poder herdar a supervisão da cidade.
    let tipoFallback = null;
    if (!pontos.some((p) => chaveLocal(p.nome_local) === alvo)) {
      const locais = await locaisDaCidade(uf, cidade).catch(() => []);
      tipoFallback = locais.find((l) => l.nome_norm === alvo)?.tipo_local || null;
    }
    return avaliarSupervisao({ pontos, nome, tipoFallback, regional, cidade, uf });
  } catch (error) {
    console.warn('[supervisao-embarque] não foi possível validar a supervisão (seguindo sem bloquear):', error?.message || error);
    return { ok: true, ignorada: true };
  }
}
