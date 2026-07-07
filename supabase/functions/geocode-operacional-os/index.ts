// Preenche operacional_os.ponto1_latitude/longitude para O.S. cujo embarque
// (texto "UF - Cidade (Local)" vindo do agente grm_lista_os_importacoes) ainda
// não tem coordenada nenhuma.
//
// O casamento contra operacional_pontos_embarque (armazém/fazenda real, cadastro
// "Locais de Serviço") não é mais feito aqui — é responsabilidade do trigger
// trg_operacional_os_resolver_ponto (ver migration
// 20260706213240_consolida_matching_embarque_os.sql), que roda no INSERT/UPDATE
// de operacional_os e já grava ponto_embarque_id + ponto1_latitude/longitude/nome.
// Esta function só cuida do que sobra: O.S. sem nenhum ponto cadastrado batendo,
// via Nominatim (OpenStreetMap), tentando local+cidade primeiro — nome informal
// de fazenda/armazém quase nunca resolve — e caindo pra só cidade/UF quando falha.
// Marcado como aproximado (operacional.js detecta pelo formato do ponto1_nome:
// sem "·" = aproximado, com "·" = local real vindo do trigger).
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

    // O.S. sem coordenada nenhuma ainda (o trigger de operacional_os já resolveu
    // tudo que casava com operacional_pontos_embarque; o que sobra aqui não tem
    // local cadastrado, só resta tentar o Nominatim).
    const { data: todasRaw, error: todasErr } = await supabase
      .from('operacional_os')
      .select('embarque')
      .not('embarque', 'is', null)
      .is('ponto1_latitude', null);
    if (todasErr) throw todasErr;

    const porEmbarque = new Map<string, Embarque>();
    (todasRaw || []).forEach((r: any) => {
      const texto = String(r.embarque || '').trim();
      if (!texto || porEmbarque.has(texto)) return;
      const parsed = splitEmbarque(texto);
      if (parsed) porEmbarque.set(texto, parsed);
    });

    if (!porEmbarque.size) {
      return json({ pendentes: 0, geocodificados_nominatim: 0, atualizadas: 0 });
    }

    const chaves = [...porEmbarque.keys()].map((texto) => ({ texto, chave: `${PREFIXO_CHAVE}${normKey(texto)}` }));

    // Cache existente (Nominatim) — evita regeocodificar o mesmo local pra cada O.S. que o usa.
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

    // Nominatim pro que sobrou (até `limite` locais novos, 1 req/s): tenta local+cidade
    // primeiro e cai pra só cidade/UF quando falha — melhor um ponto na cidade certa do que nada.
    const pendentesGeo = chaves.filter((c) => !cacheOk.has(c.chave) && !cacheErroRecente.has(c.chave));
    let lastCallAt = 0;
    async function throttledSearch(params: Record<string, string>): Promise<GeoResult> {
      const wait = lastCallAt + NOMINATIM_DELAY_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastCallAt = Date.now();
      return nominatimSearch(params);
    }

    const lote = pendentesGeo.slice(0, limite);
    let geocodificadosNominatim = 0;
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
      if (resultado) { cacheOk.set(chave, resultado); geocodificadosNominatim++; }
    }

    // Grava operacional_os pra todo embarque já resolvido via cache (cache antigo + o que
    // acabou de ser geocodificado agora), não só o lote desta execução.
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
        .eq('embarque', texto);
      if (updErr) { falhas.push({ texto, erro: updErr.message }); continue; }
      atualizadas += count || 0;
    }

    return json({
      pendentes: porEmbarque.size,
      chaves_pendentes_nominatim_antes: pendentesGeo.length,
      geocodificados_nominatim: geocodificadosNominatim,
      atualizadas,
      falhas_gravacao: falhas.length,
      falhas_detalhe: falhas.slice(0, 10),
      restantes_nominatim: Math.max(0, pendentesGeo.length - lote.length),
    });
  } catch (err) {
    console.error('[geocode-operacional-os]', err);
    return json({ error: (err as any)?.message || String(err) }, 500);
  }
});
