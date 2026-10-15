// Programação — cache de cidades, pontos de embarque, UF por supervisão e pendências FOB.
// Extraído de programacao.js em 15/10/2026 (declarações do topo do arquivo e funções de renderContent que não
// dependem do estado da tela). Código movido sem alteração. Ao editar, troque o ?v= deste módulo em TODOS os
// imports (programacao.js e demais módulos programacao-*): o teste tests/programacao-modulos-versao.test.mjs confere.
import { supabase } from './supabaseClient.js';
import { CIDADES_CACHE_KEY, CIDADES_CACHE_TTL_MS, SUPERVISAO_UF_CHAVES, SUPERVISAO_UF_MAP } from './programacao-constantes.js?v=20261015-nucleo1';
import { normalizeText } from './programacao-util.js?v=20261015-nucleo1';

  async function checkFobPendenciasBloqueantes(dataReferencia, supervisao) {
    if (!dataReferencia) return [];
    let query = supabase
      .from('logistica_fob')
      .select('id,data_referencia,numero_os,cliente,supervisao,funcionario,motivo,observacao,status')
      .eq('status', 'PENDENTE')
      .lt('data_referencia', dataReferencia)
      .order('data_referencia', { ascending: false })
      .limit(50);
    if (Array.isArray(supervisao)) {
      if (supervisao.length) query = query.in('supervisao', supervisao);
    } else if (supervisao) {
      query = query.eq('supervisao', supervisao);
    }
    const { data, error } = await query;
    if (error) {
      console.warn('Não foi possível validar pendências de FOB.', error);
      return [];
    }
    return data || [];
  }

  function readCidadesCache() {
    try {
      const raw = localStorage.getItem(CIDADES_CACHE_KEY);
      if (!raw) return null;
      const { ts, data } = JSON.parse(raw);
      if (!ts || Date.now() - ts > CIDADES_CACHE_TTL_MS || !Array.isArray(data) || !data.length) return null;
      return data;
    } catch {
      return null;
    }
  }

  function writeCidadesCache(data) {
    try {
      localStorage.setItem(CIDADES_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
    } catch {
      // localStorage indisponível/cheio — segue sem cache persistente.
    }
  }

  // operacional_pontos_embarque espelha o cadastro do GRM (~10 mil locais ativos) e o PostgREST
  // devolve no máximo 1000 linhas por requisição: pagina por range em vez de um único .limit(8000).
  async function fetchTodosPontosAtivos(colunas) {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('operacional_pontos_embarque')
        .select(colunas)
        .eq('ativo', true)
        .order('id', { ascending: true })
        .range(from, from + 999);
      if (error) return { data: null, error };
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return { data: rows, error: null };
  }

  function cidadeUfFromOs(os) {
    const raw = String(os?.embarque || os?.raw?.Embarque || os?.local_embarque || '').trim();
    if (!raw) return null;
    const semPonto = raw.replace(/\([^()]*\)\s*$/, '').trim();
    const partes = semPonto.split(/\s*-\s*/).map((p) => p.trim()).filter(Boolean);
    if (partes.length >= 2 && /^[A-Z]{2}$/i.test(partes[0])) {
      return { uf: partes[0].toUpperCase(), cidade: partes[1] };
    }
    return { cidade: raw, uf: '' };
  }

  function ufFromSupervisao(supervisao) {
    const norm = normalizeText(supervisao || '');
    if (!norm) return '';
    const chave = SUPERVISAO_UF_CHAVES.find((k) => norm.startsWith(normalizeText(k)));
    return chave ? SUPERVISAO_UF_MAP[chave] : '';
  }

export { checkFobPendenciasBloqueantes, readCidadesCache, writeCidadesCache, fetchTodosPontosAtivos, cidadeUfFromOs, ufFromSupervisao };
