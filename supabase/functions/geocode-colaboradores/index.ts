import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_USER_AGENT = 'PainelGrao1000/1.0 (tecnologia@grao1000.com.br)';
const NOMINATIM_DELAY_MS = 1100; // política de uso do Nominatim: máx. 1 req/s
const ERRO_RETRY_DIAS = 7;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function cleanStr(v: unknown): string {
  return String(v ?? '').trim();
}

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function normalizeCep(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '');
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function readBody(req: Request) {
  try { return await req.json(); } catch { return {}; }
}

type GeoResult = { lat: number; lng: number; display: string } | null;

async function nominatimSearch(params: Record<string, string>): Promise<GeoResult> {
  try {
    const qs = new URLSearchParams({ ...params, country: 'Brazil', format: 'jsonv2', limit: '1' });
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
    return { lat, lng, display: cleanStr(item.display_name) };
  } catch {
    return null;
  }
}

function formatCepBR(cep8: string): string {
  return `${cep8.slice(0, 5)}-${cep8.slice(5)}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await readBody(req);
    const limite = Math.max(1, Math.min(50, Number((body as any)?.limite) || 20));

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceKey) {
      return json({ error: 'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados na Edge Function.' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1) OS ativas (não finalizadas/devolvidas)
    const { data: osRows, error: osErr } = await supabase
      .from('operacional_os')
      .select('id')
      .eq('situacao', 'Ativo')
      .or('status_logistica.is.null,status_logistica.not.in.(FINALIZADA,DEVOLVIDA)');
    if (osErr) throw osErr;
    const osAtivasIds = new Set((osRows || []).map((r) => r.id));

    // 2) Vínculos colaborador <-> OS
    const { data: vinculosRaw, error: vincErr } = await supabase
      .from('operacional_os_colaboradores')
      .select('os_id,colaborador_key,created_at')
      .limit(2000);
    if (vincErr) throw vincErr;

    const vinculosOrdenados = (vinculosRaw || [])
      .filter((v) => osAtivasIds.has(v.os_id))
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

    const colaboradorKeys = new Map<string, string>(); // normalize(nome) -> colaborador_key original
    for (const v of vinculosOrdenados) {
      const key = normalize(v.colaborador_key);
      if (!key || colaboradorKeys.has(key)) continue;
      colaboradorKeys.set(key, cleanStr(v.colaborador_key));
    }

    // 3) Endereços dos colaboradores (situação Ativo)
    const { data: colabsRaw, error: colabErr } = await supabase
      .from('colaboradores')
      .select('nome,cep,cidade,estado')
      .eq('situacao', 'Ativo')
      .limit(3000);
    if (colabErr) throw colabErr;

    const colabPorNome = new Map<string, { cep: string; cidade: string; estado: string }>();
    for (const c of (colabsRaw || [])) {
      colabPorNome.set(normalize(c.nome), { cep: cleanStr(c.cep), cidade: cleanStr(c.cidade), estado: cleanStr(c.estado) });
    }

    // 4) CEPs distintos a geocodificar
    const cepInfo = new Map<string, { cidade: string; estado: string }>();
    for (const nomeKey of colaboradorKeys.keys()) {
      const colab = colabPorNome.get(nomeKey);
      if (!colab) continue;
      const cep = normalizeCep(colab.cep);
      if (cep.length !== 8) continue;
      if (!cepInfo.has(cep)) cepInfo.set(cep, { cidade: colab.cidade, estado: colab.estado });
    }

    const todosCeps = [...cepInfo.keys()];

    // 5) O que já está no cache (ok, ou erro recente)
    const { data: cacheRaw, error: cacheErr } = await supabase
      .from('geocode_cache')
      .select('chave,status,atualizado_em')
      .in('chave', todosCeps.length ? todosCeps : ['__none__']);
    if (cacheErr) throw cacheErr;

    const limiteRetryErro = Date.now() - ERRO_RETRY_DIAS * 24 * 60 * 60 * 1000;
    const jaResolvidos = new Set<string>();
    for (const c of (cacheRaw || [])) {
      if (c.status === 'ok') { jaResolvidos.add(c.chave); continue; }
      const atualizadoEm = c.atualizado_em ? new Date(c.atualizado_em).getTime() : 0;
      if (atualizadoEm > limiteRetryErro) jaResolvidos.add(c.chave);
    }

    const pendentes = todosCeps.filter((cep) => !jaResolvidos.has(cep));

    // 6) Geocodificar até `limite` CEPs pendentes (1 req/s, política do Nominatim)
    let lastCallAt = 0;
    async function throttledSearch(params: Record<string, string>): Promise<GeoResult> {
      const wait = lastCallAt + NOMINATIM_DELAY_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastCallAt = Date.now();
      return nominatimSearch(params);
    }

    const lote = pendentes.slice(0, limite);
    let ok = 0;
    let erro = 0;

    for (const cep of lote) {
      const info = cepInfo.get(cep)!;
      let resultado = await throttledSearch({ postalcode: formatCepBR(cep) });
      let tipo: 'cep' | 'cidade' = 'cep';

      if (!resultado && info.cidade && info.estado) {
        resultado = await throttledSearch({ city: info.cidade, state: info.estado });
        tipo = 'cidade';
      }

      const row = resultado
        ? { chave: cep, tipo, latitude: resultado.lat, longitude: resultado.lng, endereco_resolvido: resultado.display, status: 'ok', atualizado_em: new Date().toISOString() }
        : { chave: cep, tipo: 'cep', latitude: null, longitude: null, endereco_resolvido: null, status: 'erro', atualizado_em: new Date().toISOString() };

      const { error: upErr } = await supabase.from('geocode_cache').upsert(row, { onConflict: 'chave' });
      if (upErr) throw upErr;

      if (resultado) ok++; else erro++;
    }

    return json({
      processados: lote.length,
      ok,
      erro,
      restantes: Math.max(0, pendentes.length - lote.length),
      total_ceps: todosCeps.length,
    });
  } catch (err) {
    console.error('[geocode-colaboradores]', err);
    return json({ error: (err as any)?.message || String(err) }, 500);
  }
});
