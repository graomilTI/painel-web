// Preenche operacional_os.ponto1_latitude/longitude para O.S. cujo embarque
// (texto "UF - Cidade (Local)" vindo do agente grm_lista_os_importacoes) nunca
// teve coordenada resolvida. O backfill original de ponto1_lat/lng foi feito
// uma unica vez via SQL direto contra operacional_pontos_embarque (tabela rasa,
// so cobre locais do relatorio "Locais de Embarque") -- O.S. novas cujo local
// nao esta ali (a maioria: fazendas/armazens especificos) nunca ganhavam
// coordenada. Mesmo padrao de geocode-colaborador-base: Nominatim (1 req/s),
// cache em geocode_cache (tipo 'cidade' -- o check constraint so aceita
// 'cep'/'cidade', a chave prefixada 'os_embarque:' ja evita colisao com as
// chaves de CEP/cidade usadas pela geocodificacao de colaboradores). Tenta
// local+cidade primeiro e cai pra so cidade/UF quando o nome informal da
// fazenda nao resolve no OSM.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_USER_AGENT = 'PainelGrao1000/1.0 (tecnologia@grao1000.com.br)';
const NOMINATIM_DELAY_MS = 1100; // politica de uso do Nominatim: max. 1 req/s
const ERRO_RETRY_DIAS = 7;
const PREFIXO_CHAVE = 'os_embarque:';

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
    .toLowerCase().replace(/[^a-z0-9]+/g, '');
}

type Embarque = { uf: string; cidade: string; local: string };

function splitEmbarque(t: string): Embarque | null {
  const m = String(t || '').match(/^([A-Za-z]{2})\s*-\s*([^()]+?)(?:\s*\(([^)]+)\))?\s*$/);
  if (!m) return null;
  const uf = m[1].toUpperCase();
  const cidade = m[2].trim();
  if (!uf || !cidade) return null;
  return { uf, cidade, local: (m[3] || '').trim() };
}

type GeoResult = { lat: number; lng: number; display: string } | null;

async function nominatimSearch(params: Record<string, string>): Promise<GeoResult> {
  try {
    const qs = new URLSearchParams({ ...params, format: 'jsonv2', limit: '1', countrycodes: 'br' });
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

  try {
    const body = await readBody(req);
    const limite = Math.max(1, Math.min(50, Number((body as any)?.limite) || 25));

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceKey) {
      return json({ error: 'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados na Edge Function.' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1) O.S. sem coordenada, com embarque preenchido e parseável ("UF - Cidade (Local)").
    const { data: pendentesRaw, error: pendErr } = await supabase
      .from('operacional_os')
      .select('embarque')
      .is('ponto1_latitude', null)
      .not('embarque', 'is', null);
    if (pendErr) throw pendErr;

    const porEmbarque = new Map<string, Embarque>();
    (pendentesRaw || []).forEach((r: any) => {
      const texto = String(r.embarque || '').trim();
      if (!texto || porEmbarque.has(texto)) return;
      const parsed = splitEmbarque(texto);
      if (parsed) porEmbarque.set(texto, parsed);
    });

    if (!porEmbarque.size) {
      return json({ pendentes: 0, geocodificados_novo: 0, atualizadas: 0 });
    }

    const chaves = [...porEmbarque.keys()].map((texto) => ({ texto, chave: `${PREFIXO_CHAVE}${normKey(texto)}` }));

    // 2) Cache existente — evita regeocodificar o mesmo local pra cada O.S. que o usa.
    const chaveList = chaves.map((c) => c.chave);
    const { data: cacheRaw, error: cacheErr } = await supabase
      .from('geocode_cache')
      .select('chave,latitude,longitude,endereco_resolvido,status,atualizado_em')
      .in('chave', chaveList.length ? chaveList : ['__none__']);
    if (cacheErr) throw cacheErr;

    const limiteRetryErro = Date.now() - ERRO_RETRY_DIAS * 24 * 60 * 60 * 1000;
    const cacheOk = new Map<string, { lat: number; lng: number; display: string }>();
    const cacheErroRecente = new Set<string>();
    (cacheRaw || []).forEach((c: any) => {
      if (c.status === 'ok' && c.latitude != null && c.longitude != null) {
        cacheOk.set(c.chave, { lat: Number(c.latitude), lng: Number(c.longitude), display: c.endereco_resolvido || '' });
      } else if (c.status === 'erro') {
        const atualizadoEm = c.atualizado_em ? new Date(c.atualizado_em).getTime() : 0;
        if (atualizadoEm > limiteRetryErro) cacheErroRecente.add(c.chave);
      }
    });

    // 3) Geocodifica (até `limite` locais novos, 1 req/s): tenta local+cidade
    // primeiro (nome de fazenda/armazém raramente resolve no OSM) e cai pra
    // só cidade/UF quando falha — melhor um ponto na cidade certa do que nada.
    const pendentesGeo = chaves.filter((c) => !cacheOk.has(c.chave) && !cacheErroRecente.has(c.chave));

    let lastCallAt = 0;
    async function throttledSearch(params: Record<string, string>): Promise<GeoResult> {
      const wait = lastCallAt + NOMINATIM_DELAY_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastCallAt = Date.now();
      return nominatimSearch(params);
    }

    const lote = pendentesGeo.slice(0, limite);
    let geocodificadosNovo = 0;
    for (const { texto, chave } of lote) {
      const parsed = porEmbarque.get(texto)!;
      let resultado: GeoResult = null;
      if (parsed.local) {
        resultado = await throttledSearch({ q: `${parsed.local}, ${parsed.cidade}, ${parsed.uf}, Brasil` });
      }
      if (!resultado) {
        resultado = await throttledSearch({ city: parsed.cidade, state: parsed.uf });
      }
      const row = resultado
        ? { chave, tipo: 'cidade', latitude: resultado.lat, longitude: resultado.lng, endereco_resolvido: resultado.display, status: 'ok', atualizado_em: new Date().toISOString() }
        : { chave, tipo: 'cidade', latitude: null, longitude: null, endereco_resolvido: null, status: 'erro', atualizado_em: new Date().toISOString() };
      const { error: upErr } = await supabase.from('geocode_cache').upsert(row, { onConflict: 'chave' });
      if (upErr) throw upErr;
      if (resultado) { cacheOk.set(chave, resultado); geocodificadosNovo++; }
    }

    // 4) Grava operacional_os pra todo embarque já resolvido (cache antigo + o
    // que acabou de ser geocodificado agora), não só o lote desta execução.
    let atualizadas = 0;
    const falhas: { texto: string; erro: string }[] = [];
    for (const { texto, chave } of chaves) {
      const geo = cacheOk.get(chave);
      if (!geo) continue;
      const { error: updErr, count } = await supabase
        .from('operacional_os')
        .update(
          { ponto1_latitude: geo.lat, ponto1_longitude: geo.lng, ponto1_nome: geo.display || texto, updated_at: new Date().toISOString() },
          { count: 'exact' }
        )
        .eq('embarque', texto)
        .is('ponto1_latitude', null);
      if (updErr) { falhas.push({ texto, erro: updErr.message }); continue; }
      atualizadas += count || 0;
    }

    return json({
      pendentes: porEmbarque.size,
      chaves_pendentes_antes: pendentesGeo.length,
      geocodificados_novo: geocodificadosNovo,
      atualizadas,
      falhas_gravacao: falhas.length,
      falhas_detalhe: falhas.slice(0, 10),
      restantes: Math.max(0, pendentesGeo.length - lote.length),
    });
  } catch (err) {
    console.error('[geocode-operacional-os]', err);
    return json({ error: (err as any)?.message || String(err) }, 500);
  }
});
