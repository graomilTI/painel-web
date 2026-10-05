// Uber Conferência: converte o endereço de partida/destino da corrida em
// coordenadas (Nominatim, mesmo provedor usado em geocode-operacional-os) e,
// tendo a coordenada de partida, chama uber_validar_por_os_laudo() pra
// checar se existe uma O.S. com laudo do colaborador (grm_cargas_importacoes)
// dentro de 2km — só então a corrida é validada automaticamente.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { authorizeRequest } from '../_shared/authorization.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const PHOTON_BASE = 'https://photon.komoot.io/api/';
const NOMINATIM_USER_AGENT = 'PainelGrao1000/1.0 (tecnologia@grao1000.com.br)';
const NOMINATIM_DELAY_MS = 1100;
const ERRO_RETRY_HORAS = 24;
const PREFIXO_CHAVE = 'uber_endereco:';

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

function normKey(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

type GeoResult = { lat: number; lng: number; display: string; query: string; provider: string };
type GeoSearch = { result: GeoResult | null; error: string | null; definitive: boolean };

function normalizarEndereco(endereco: string): string {
  return endereco
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/(?:,\s*Brasil\s*)+$/i, ', Brasil')
    .trim();
}

function candidatosEndereco(endereco: string): string[] {
  const completo = normalizarEndereco(endereco);
  const semPais = completo.replace(/,\s*Brasil$/i, '').trim();
  const cep = semPais.match(/\b\d{5}-?\d{3}\b/)?.[0] || '';
  const partes = semPais.split(',').map((parte) => parte.trim()).filter(Boolean);
  const cidadeUf = partes.find((parte) => /-\s*[A-Z]{2}\s*$/i.test(parte) && !/\d{5}-?\d{3}/.test(parte)) || '';
  const numero = partes[1]?.match(/^\d+[A-Za-z]?\b/)?.[0] || '';
  const rua = [partes[0]?.replace(/\s+-\s+.*$/, '').trim(), numero].filter(Boolean).join(', ');
  const candidatos = [
    completo,
    [rua, cidadeUf, cep, 'Brasil'].filter(Boolean).join(', '),
    [cep, cidadeUf, 'Brasil'].filter(Boolean).join(', '),
    [rua, cidadeUf, 'Brasil'].filter(Boolean).join(', '),
  ];
  return [...new Set(candidatos.map(normalizarEndereco).filter((item) => item.length > 8))];
}

function tokensRelevantes(value: unknown): string[] {
  const ignorados = new Set(['rua', 'r', 'avenida', 'av', 'rodovia', 'rod', 'estrada', 'de', 'da', 'do', 'das', 'dos']);
  return normKey(value).split(' ').filter((token) => token.length >= 3 && !ignorados.has(token));
}

function photonCompativel(endereco: string, properties: Record<string, unknown>): boolean {
  const semPais = normalizarEndereco(endereco).replace(/,\s*Brasil$/i, '');
  const partes = semPais.split(',').map((parte) => parte.trim()).filter(Boolean);
  const ruaEsperada = partes[0] || '';
  const cidadeUf = partes.find((parte) => /-\s*[A-Z]{2}\s*$/i.test(parte) && !/\d{5}-?\d{3}/.test(parte)) || '';
  const cidadeEsperada = cidadeUf.replace(/\s*-\s*[A-Z]{2}\b.*$/i, '').trim();
  const textoLocal = [properties.name, properties.street].filter(Boolean).join(' ');
  const textoCidade = [properties.city, properties.locality, properties.county].filter(Boolean).join(' ');
  const ruaTokens = tokensRelevantes(ruaEsperada);
  const localTokens = new Set(tokensRelevantes(textoLocal));
  const acertosRua = ruaTokens.filter((token) => localTokens.has(token)).length;
  const ruaCompativel = !ruaTokens.length || acertosRua / ruaTokens.length >= 0.5;
  const cidadeCompativel = !cidadeEsperada || normKey(textoCidade).includes(normKey(cidadeEsperada));
  const pais = normKey(properties.countrycode || properties.country);
  return ruaCompativel && cidadeCompativel && (!pais || pais === 'br' || pais === 'brasil' || pais === 'brazil');
}

async function nominatimSearch(query: string): Promise<GeoSearch> {
  try {
    const qs = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: '1',
      countrycodes: 'br',
      email: 'tecnologia@grao1000.com.br',
    });
    const res = await fetch(`${NOMINATIM_BASE}?${qs.toString()}`, {
      headers: { 'User-Agent': NOMINATIM_USER_AGENT, 'Accept-Language': 'pt-BR' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      return {
        result: null,
        error: `Nominatim HTTP ${res.status}`,
        definitive: false,
      };
    }
    const data = await res.json();
    const item = Array.isArray(data) ? data[0] : null;
    if (!item) return { result: null, error: null, definitive: true };
    const lat = Number(item.lat);
    const lng = Number(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { result: null, error: 'Resposta do Nominatim sem coordenadas válidas.', definitive: false };
    }
    return {
      result: { lat, lng, display: String(item.display_name || '').trim(), query, provider: 'nominatim' },
      error: null,
      definitive: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { result: null, error: `Falha ao consultar Nominatim: ${message}`, definitive: false };
  }
}

async function photonSearch(query: string, enderecoOriginal: string): Promise<GeoSearch> {
  try {
    const qs = new URLSearchParams({ q: query, limit: '5' });
    const res = await fetch(`${PHOTON_BASE}?${qs.toString()}`, {
      headers: { 'User-Agent': NOMINATIM_USER_AGENT, 'Accept-Language': 'pt-BR' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      return { result: null, error: `Photon HTTP ${res.status}`, definitive: false };
    }
    const data = await res.json();
    const features = Array.isArray(data?.features) ? data.features : [];
    const feature = features.find((item: any) =>
      Array.isArray(item?.geometry?.coordinates)
      && photonCompativel(enderecoOriginal, item?.properties || {})
    );
    if (!feature) return { result: null, error: null, definitive: true };
    const lng = Number(feature.geometry.coordinates[0]);
    const lat = Number(feature.geometry.coordinates[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { result: null, error: 'Resposta do Photon sem coordenadas válidas.', definitive: false };
    }
    const properties = feature.properties || {};
    const display = [
      properties.name,
      properties.street,
      properties.city,
      properties.state,
      properties.postcode,
      properties.country,
    ].filter(Boolean).filter((item, index, all) => all.indexOf(item) === index).join(', ');
    return {
      result: { lat, lng, display, query, provider: 'photon' },
      error: null,
      definitive: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { result: null, error: `Falha ao consultar Photon: ${message}`, definitive: false };
  }
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

    let ids: string[] = [];
    if (Array.isArray((body as any)?.ids)) {
      ids = (body as any).ids.map(String).filter(Boolean);
    } else if ((body as any)?.id) {
      ids = [String((body as any).id)];
    } else if ((body as any)?.modo === 'pendentes') {
      const limite = Math.max(1, Math.min(30, Number((body as any)?.limite) || 10));
      const { data, error } = await supabase
        .from('conferencia_uber_corridas')
        .select('id')
        .in('status_validacao', ['PENDENTE', 'ATENCAO', 'ATENÇÃO'])
        .is('partida_latitude', null)
        .not('endereco_partida', 'is', null)
        // Falhas recentes vão para o fim da fila, evitando que as mesmas
        // corridas bloqueiem para sempre a conversão das demais.
        .order('updated_at', { ascending: true })
        .limit(limite);
      if (error) throw error;
      ids = (data || []).map((r: any) => r.id);
    }

    if (!ids.length) return json({ ok: true, total: 0, geocodificados: 0, validados: 0, sem_endereco: 0, resultados: [] });

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

      let result: GeoResult | null = null;
      let lastError: string | null = null;
      let definitive = true;
      const candidatos = candidatosEndereco(endereco);
      for (const candidato of candidatos) {
        const wait = lastCallAt + NOMINATIM_DELAY_MS - Date.now();
        if (wait > 0) await sleep(wait);
        lastCallAt = Date.now();
        const tentativa = await nominatimSearch(candidato);
        if (tentativa.result) {
          result = tentativa.result;
          lastError = null;
          break;
        }
        if (tentativa.error) lastError = tentativa.error;
        if (!tentativa.definitive) {
          definitive = false;
          break;
        }
      }

      if (!result) {
        definitive = true;
        for (const candidato of candidatos) {
          const wait = lastCallAt + NOMINATIM_DELAY_MS - Date.now();
          if (wait > 0) await sleep(wait);
          lastCallAt = Date.now();
          const tentativa = await photonSearch(candidato, endereco);
          if (tentativa.result) {
            result = tentativa.result;
            lastError = null;
            break;
          }
          if (tentativa.error) {
            lastError = tentativa.error;
            definitive = false;
            break;
          }
          lastError = null;
        }
      }

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

      return { result, error: lastError, definitive };
    }

    const resultados: any[] = [];
    let geocodificados = 0, validados = 0, semEndereco = 0;

    for (const id of ids) {
      const { data: row, error: rowErr } = await supabase
        .from('conferencia_uber_corridas')
        .select('id,endereco_partida,endereco_destino,partida_latitude,partida_longitude,destino_latitude,destino_longitude')
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

      if (!partidaGeo) {
        update.observacao_validacao = 'Não foi possível localizar o endereço de partida no mapa. Confira o endereço ou valide manualmente.';
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
          motivo: partidaSearch.error ? 'provedor_indisponivel' : 'endereco_nao_localizado',
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
        ...validacao,
      });
    }

    return json({ ok: true, total: ids.length, geocodificados, validados, sem_endereco: semEndereco, resultados });
  } catch (err) {
    console.error('[uber-geocodificar-gps]', err);
    return json({ ok: false, error: (err as any)?.message || String(err) }, 500);
  }
});
