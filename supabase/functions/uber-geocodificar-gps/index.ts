// Uber Conferência: converte o endereço de partida/destino da corrida em
// coordenadas (Nominatim, mesmo provedor usado em geocode-operacional-os) e,
// tendo a coordenada de partida, chama uber_validar_por_os_laudo() pra
// checar se existe uma O.S. com laudo do colaborador (grm_cargas_importacoes)
// dentro de 2km — só então a corrida é validada automaticamente.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { authorizeRequest } from '../_shared/authorization.ts';
import { normKey } from './endereco.ts';
import { geocodificarEndereco, type GeoSearch } from './geocodificar.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const NOMINATIM_USER_AGENT = 'PainelGrao1000/1.0 (tecnologia@grao1000.com.br)';
const NOMINATIM_DELAY_MS = 1100;
const ERRO_RETRY_HORAS = 24;
const PREFIXO_CHAVE = 'uber_endereco:';
// Edge Function tem tempo limite: pára de pegar corridas novas antes dele e
// devolve `restantes` pro painel chamar de novo.
const ORCAMENTO_MS = 90_000;
const MENSAGEM_FALHA: Record<string, string> = {
  endereco_incompleto: 'O endereço de partida não tem rua nem bairro (só cidade/CEP), então não dá pra localizar no mapa. Valide manualmente.',
  provedor_indisponivel: 'Serviço de mapas indisponível agora. Tente converter o GPS de novo mais tarde.',
  endereco_nao_localizado: 'Não foi possível localizar o endereço de partida no mapa. Confira o endereço ou valide manualmente.',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function readBody(req: Request) {
  try { return await req.json(); } catch { return {}; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Use POST.' }, 405);

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const isServiceRequest = serviceKey && req.headers.get('Authorization') === `Bearer ${serviceKey}`;
  if (!isServiceRequest) {
    const authorization = await authorizeRequest(
      req,
      ['CONFERENCIA_UBER', 'UBER'],
      { requireEdit: true },
    );
    if (!authorization.ok) {
      return json({ ok: false, error: authorization.error }, authorization.status);
    }
  }

  try {
    const body = await readBody(req);
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    if (!supabaseUrl || !serviceKey) {
      return json({ ok: false, error: 'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados.' }, 500);
    }
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const inicio = Date.now();
    let ids: string[] = [];
    if (Array.isArray((body as any)?.ids)) {
      ids = (body as any).ids.map(String).filter(Boolean);
    } else if ((body as any)?.id) {
      ids = [String((body as any).id)];
    } else if ((body as any)?.modo === 'pendentes') {
      const limite = Math.max(1, Math.min(30, Number((body as any)?.limite) || 10));
      // `antes_de`: o painel repete a chamada até acabar; corridas já tentadas
      // nesta rodada (updated_at novo) ficam de fora e o laço termina.
      const antesDe = String((body as any)?.antes_de || '');
      let query = supabase
        .from('conferencia_uber_corridas')
        .select('id')
        .in('status_validacao', ['PENDENTE', 'ATENCAO', 'ATENÇÃO'])
        .is('partida_latitude', null)
        .not('endereco_partida', 'is', null);
      if (antesDe && !Number.isNaN(Date.parse(antesDe))) query = query.lt('updated_at', antesDe);
      // Falhas recentes vão para o fim da fila, evitando que as mesmas
      // corridas bloqueiem para sempre a conversão das demais.
      const { data, error } = await query.order('updated_at', { ascending: true }).limit(limite);
      if (error) throw error;
      ids = (data || []).map((r: any) => r.id);
    }

    if (!ids.length) return json({ ok: true, total: 0, geocodificados: 0, validados: 0, sem_endereco: 0, restantes: 0, resultados: [] });

    const geocodarDestino = ids.length === 1; // no botão GPS de uma linha só; no lote, só partida (mais rápido)
    let lastCallAt = 0;
    async function throttledSearch(endereco: string): Promise<GeoSearch> {
      const chave = `${PREFIXO_CHAVE}${normKey(endereco)}`;
      const { data: cache, error: cacheReadError } = await supabase
        .from('geocode_cache')
        .select('latitude,longitude,endereco_resolvido,status,atualizado_em')
        .eq('chave', chave)
        .maybeSingle();
      if (cacheReadError) console.warn('[uber-geocodificar-gps] Falha ao ler cache:', cacheReadError.message);
      if (cache?.status === 'ok' && cache.latitude != null && cache.longitude != null) {
        return {
          result: {
            lat: Number(cache.latitude),
            lng: Number(cache.longitude),
            display: cache.endereco_resolvido || '',
            query: 'cache',
            provider: 'cache',
            precisao: 'endereco',
          },
          error: null,
          definitive: true,
        };
      }
      if (cache?.status === 'erro') {
        const atualizadoEm = cache.atualizado_em ? new Date(cache.atualizado_em).getTime() : 0;
        if (atualizadoEm > Date.now() - ERRO_RETRY_HORAS * 60 * 60 * 1000) {
          return { result: null, error: null, definitive: true };
        }
      }

      const busca = await geocodificarEndereco(endereco, {
        aguardar: async () => {
          const wait = lastCallAt + NOMINATIM_DELAY_MS - Date.now();
          if (wait > 0) await sleep(wait);
          lastCallAt = Date.now();
        },
        userAgent: NOMINATIM_USER_AGENT,
        email: 'tecnologia@grao1000.com.br',
      });
      const { result, error: lastError, definitive } = busca;

      // geocode_cache mantém um CHECK legado com apenas "cep" e "cidade".
      // A chave prefixada identifica endereços Uber sem quebrar consumidores antigos.
      // Falhas transitórias não são cacheadas como endereço inexistente.
      const shouldCache = Boolean(result) || (definitive && !lastError);
      if (shouldCache) {
        const { error: cacheWriteError } = await supabase.from('geocode_cache').upsert({
          chave,
          tipo: 'cidade',
          latitude: result?.lat ?? null,
          longitude: result?.lng ?? null,
          endereco_resolvido: result?.display ?? null,
          status: result ? 'ok' : 'erro',
          atualizado_em: new Date().toISOString(),
        }, { onConflict: 'chave' });
        if (cacheWriteError) console.warn('[uber-geocodificar-gps] Falha ao gravar cache:', cacheWriteError.message);
      }

      return busca;
    }

    const resultados: any[] = [];
    let geocodificados = 0, validados = 0, semEndereco = 0, restantes = 0;

    for (const id of ids) {
      if (ids.length > 1 && Date.now() - inicio > ORCAMENTO_MS) { restantes++; continue; }
      const { data: row, error: rowErr } = await supabase
        .from('conferencia_uber_corridas')
        .select('id,endereco_partida,endereco_destino,partida_latitude,partida_longitude,destino_latitude,destino_longitude,observacao_validacao')
        .eq('id', id)
        .maybeSingle();
      if (rowErr || !row) { resultados.push({ id, ok: false, error: rowErr?.message || 'Corrida não encontrada.' }); continue; }
      if (!row.endereco_partida) {
        semEndereco++;
        resultados.push({ id, ok: false, error: 'Sem endereço de partida.' });
        continue;
      }

      const partidaSearch: GeoSearch = row.partida_latitude != null && row.partida_longitude != null
        ? {
          result: {
            lat: Number(row.partida_latitude),
            lng: Number(row.partida_longitude),
            display: '',
            query: 'banco',
            provider: 'banco',
            precisao: 'endereco',
          },
          error: null,
          definitive: true,
        }
        : await throttledSearch(row.endereco_partida);
      const partidaGeo = partidaSearch.result;

      const update: Record<string, unknown> = {};
      if (partidaGeo && row.partida_latitude == null) {
        update.partida_latitude = partidaGeo.lat;
        update.partida_longitude = partidaGeo.lng;
      }
      if (geocodarDestino && row.endereco_destino && (row.destino_latitude == null || row.destino_longitude == null)) {
        const destinoGeo = (await throttledSearch(row.endereco_destino)).result;
        if (destinoGeo) { update.destino_latitude = destinoGeo.lat; update.destino_longitude = destinoGeo.lng; }
      }

      const motivoFalha = partidaSearch.motivo === 'endereco_incompleto'
        ? 'endereco_incompleto'
        : partidaSearch.error ? 'provedor_indisponivel' : 'endereco_nao_localizado';
      if (!partidaGeo) {
        update.observacao_validacao = MENSAGEM_FALHA[motivoFalha];
      } else if (String(row.observacao_validacao || '').startsWith('Não foi possível localizar')) {
        update.observacao_validacao = null; // aviso de tentativa anterior que não vale mais
      }
      if (Object.keys(update).length) {
        update.updated_at = new Date().toISOString();
        const { error: updateError } = await supabase.from('conferencia_uber_corridas').update(update).eq('id', id);
        if (updateError) {
          resultados.push({ id, ok: false, error: `Falha ao salvar coordenadas: ${updateError.message}` });
          continue;
        }
      }

      if (!partidaGeo) {
        resultados.push({
          id,
          ok: true,
          geocodificado: false,
          motivo: motivoFalha,
          detalhe: partidaSearch.error,
        });
        continue;
      }
      geocodificados++;

      const { data: validacao, error: validaErr } = await supabase.rpc('uber_validar_por_os_laudo', { p_id: id });
      if (validaErr) { resultados.push({ id, ok: false, geocodificado: true, error: validaErr.message }); continue; }
      if (validacao?.validado) validados++;
      resultados.push({
        id,
        ok: true,
        geocodificado: true,
        partida_latitude: partidaGeo.lat,
        partida_longitude: partidaGeo.lng,
        consulta: partidaGeo.query,
        provedor: partidaGeo.provider,
        precisao: partidaGeo.precisao,
        ...validacao,
      });
    }

    return json({ ok: true, total: ids.length, geocodificados, validados, sem_endereco: semEndereco, restantes, corte: String((body as any)?.antes_de || '') || new Date(inicio).toISOString(), resultados });
  } catch (err) {
    console.error('[uber-geocodificar-gps]', err);
    return json({ ok: false, error: (err as any)?.message || String(err) }, 500);
  }
});
