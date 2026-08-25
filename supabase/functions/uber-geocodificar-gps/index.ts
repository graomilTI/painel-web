// Uber Conferência: converte o endereço de partida/destino da corrida em
// coordenadas (Nominatim, mesmo provedor usado em geocode-operacional-os) e,
// tendo a coordenada de partida, chama uber_validar_por_os_laudo() pra
// checar se existe uma O.S. com laudo do colaborador (grm_cargas_importacoes)
// dentro de 2km — só então a corrida é validada automaticamente.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_USER_AGENT = 'PainelGrao1000/1.0 (tecnologia@grao1000.com.br)';
const NOMINATIM_DELAY_MS = 1100;
const ERRO_RETRY_DIAS = 7;
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

type GeoResult = { lat: number; lng: number; display: string } | null;

async function nominatimSearch(endereco: string): Promise<GeoResult> {
  try {
    const qs = new URLSearchParams({ q: `${endereco}, Brasil`, format: 'jsonv2', limit: '1', countrycodes: 'br' });
    const res = await fetch(`${NOMINATIM_BASE}?${qs.toString()}`, {
      headers: { 'User-Agent': NOMINATIM_USER_AGENT, 'Accept-Language': 'pt-BR' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const item = Array.isArray(data) ? data[0] : null;
    if (!item) return null;
    const lat = Number(item.lat);
    const lng = Number(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, display: String(item.display_name || '').trim() };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Use POST.' }, 405);

  try {
    const body = await readBody(req);
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
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
        .order('data_solicitacao_local', { ascending: false })
        .limit(limite);
      if (error) throw error;
      ids = (data || []).map((r: any) => r.id);
    }

    if (!ids.length) return json({ ok: true, total: 0, geocodificados: 0, validados: 0, sem_endereco: 0, resultados: [] });

    const geocodarDestino = ids.length === 1; // no botão GPS de uma linha só; no lote, só partida (mais rápido)
    let lastCallAt = 0;
    async function throttledSearch(endereco: string): Promise<GeoResult> {
      const chave = `${PREFIXO_CHAVE}${normKey(endereco)}`;
      const { data: cache } = await supabase
        .from('geocode_cache')
        .select('latitude,longitude,endereco_resolvido,status,atualizado_em')
        .eq('chave', chave)
        .maybeSingle();
      if (cache?.status === 'ok' && cache.latitude != null && cache.longitude != null) {
        return { lat: Number(cache.latitude), lng: Number(cache.longitude), display: cache.endereco_resolvido || '' };
      }
      if (cache?.status === 'erro') {
        const atualizadoEm = cache.atualizado_em ? new Date(cache.atualizado_em).getTime() : 0;
        if (atualizadoEm > Date.now() - ERRO_RETRY_DIAS * 24 * 60 * 60 * 1000) return null;
      }
      const wait = lastCallAt + NOMINATIM_DELAY_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastCallAt = Date.now();
      const resultado = await nominatimSearch(endereco);
      await supabase.from('geocode_cache').upsert({
        chave, tipo: 'uber_endereco',
        latitude: resultado?.lat ?? null, longitude: resultado?.lng ?? null,
        endereco_resolvido: resultado?.display ?? null,
        status: resultado ? 'ok' : 'erro', atualizado_em: new Date().toISOString(),
      }, { onConflict: 'chave' });
      return resultado;
    }

    const resultados: any[] = [];
    let geocodificados = 0, validados = 0, semEndereco = 0;

    for (const id of ids) {
      const { data: row, error: rowErr } = await supabase
        .from('conferencia_uber_corridas')
        .select('id,endereco_partida,endereco_destino,partida_latitude,partida_longitude')
        .eq('id', id)
        .maybeSingle();
      if (rowErr || !row) { resultados.push({ id, ok: false, error: rowErr?.message || 'Corrida não encontrada.' }); continue; }
      if (!row.endereco_partida) {
        semEndereco++;
        resultados.push({ id, ok: false, error: 'Sem endereço de partida.' });
        continue;
      }

      let partidaGeo: GeoResult = row.partida_latitude != null && row.partida_longitude != null
        ? { lat: Number(row.partida_latitude), lng: Number(row.partida_longitude), display: '' }
        : await throttledSearch(row.endereco_partida);

      const update: Record<string, unknown> = {};
      if (partidaGeo && row.partida_latitude == null) {
        update.partida_latitude = partidaGeo.lat;
        update.partida_longitude = partidaGeo.lng;
      }
      if (geocodarDestino && row.endereco_destino) {
        const destinoGeo = await throttledSearch(row.endereco_destino);
        if (destinoGeo) { update.destino_latitude = destinoGeo.lat; update.destino_longitude = destinoGeo.lng; }
      }

      if (!partidaGeo) {
        update.observacao_validacao = 'Não foi possível localizar o endereço de partida no mapa. Confira o endereço ou valide manualmente.';
      }
      if (Object.keys(update).length) {
        update.updated_at = new Date().toISOString();
        await supabase.from('conferencia_uber_corridas').update(update).eq('id', id);
      }

      if (!partidaGeo) { resultados.push({ id, ok: true, geocodificado: false }); continue; }
      geocodificados++;

      const { data: validacao, error: validaErr } = await supabase.rpc('uber_validar_por_os_laudo', { p_id: id });
      if (validaErr) { resultados.push({ id, ok: false, geocodificado: true, error: validaErr.message }); continue; }
      if (validacao?.validado) validados++;
      resultados.push({ id, ok: true, geocodificado: true, ...validacao });
    }

    return json({ ok: true, total: ids.length, geocodificados, validados, sem_endereco: semEndereco, resultados });
  } catch (err) {
    console.error('[uber-geocodificar-gps]', err);
    return json({ ok: false, error: (err as any)?.message || String(err) }, 500);
  }
});
