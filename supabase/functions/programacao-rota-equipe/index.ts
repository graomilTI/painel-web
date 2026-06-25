import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const OSRM_BASE = 'https://router.project-osrm.org';
const OSRM_TIMEOUT_MS = 4000;
const OSRM_BUDGET_MS = 30000;
const OSRM_MAX_PARES = 40; // limite de pares colaborador<->OS por chamada, p/ caber no orçamento

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function cleanStr(v: unknown): string {
  return String(v ?? '').trim();
}

function hasGeo(lat: unknown, lng: unknown): boolean {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number | null {
  const lat1 = Number(aLat), lon1 = Number(aLng), lat2 = Number(bLat), lon2 = Number(bLng);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s1 + s2), Math.sqrt(1 - s1 - s2));
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round1(n: number): number { return Math.round(n * 10) / 10; }

async function readBody(req: Request) {
  try { return await req.json(); } catch { return {}; }
}

let osrmDeadline = 0;
function osrmBudgetOk() { return Date.now() < osrmDeadline; }
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

type Point = { lat: number; lng: number };

async function osrmRoute(points: Point[]): Promise<{ distanceKm: number; durationMin: number; geometry: unknown } | null> {
  if (points.length < 2 || !osrmBudgetOk()) return null;
  try {
    const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
    const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(OSRM_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = await res.json();
    const route = data?.routes?.[0];
    if (data?.code !== 'Ok' || !route) return null;
    return { distanceKm: route.distance / 1000, durationMin: route.duration / 60, geometry: route.geometry || null };
  } catch {
    return null;
  }
}

// Trecho casa do colaborador -> ponto de embarque da OS. Sem atribuição de
// veículo (isso é decidido depois, na etapa C/Logística): cada colaborador
// confirmado para uma OS soma seu próprio trecho até o ponto.
//
// origem_lat/origem_lng vêm já resolvidos pelo front-end (que casa o
// colaborador com operacional_colaborador_base por CPF, igual a
// findOperacionalColab() em programacao.js) — o vínculo colaborador_id usado
// nas tabelas de programação (colaborador_snapshot.id) não corresponde ao
// colaborador_id de operacional_colaborador_base, então não dá para resolver
// a casa do colaborador aqui só com o id.
type ParEntrada = { os_id: string; colaborador_id: string; origem_lat: number; origem_lng: number };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await readBody(req);
    const pares: ParEntrada[] = Array.isArray((body as any)?.pares) ? (body as any).pares : [];
    if (!pares.length) return json({ rotas: [], porOs: {} });
    if (pares.length > OSRM_MAX_PARES) {
      return json({ error: `Máximo de ${OSRM_MAX_PARES} pares por chamada.` }, 400);
    }

    osrmDeadline = Date.now() + OSRM_BUDGET_MS;

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceKey) {
      return json({ error: 'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados na Edge Function.' }, 500);
    }
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const osIds = [...new Set(pares.map((p) => cleanStr(p.os_id)).filter(Boolean))];

    const { data: osRows, error: osErr } = await supabase
      .from('operacional_os')
      .select('id, embarque, ponto_embarque_id, ponto1_latitude, ponto1_longitude')
      .in('id', osIds.length ? osIds : ['__none__']);
    if (osErr) throw osErr;

    const pontoIds = [...new Set((osRows || []).map((o) => o.ponto_embarque_id).filter(Boolean))];
    const { data: pontosRows, error: pontosErr } = await supabase
      .from('operacional_pontos_embarque')
      .select('id, nome_local, latitude, longitude')
      .in('id', pontoIds.length ? pontoIds : ['__none__']);
    if (pontosErr) throw pontosErr;
    const pontoPorId = new Map((pontosRows || []).map((p) => [p.id, p]));

    const osPorId = new Map<string, { lat: number; lng: number; nome: string } | null>();
    for (const os of (osRows || [])) {
      if (hasGeo(os.ponto1_latitude, os.ponto1_longitude)) {
        osPorId.set(os.id, { lat: Number(os.ponto1_latitude), lng: Number(os.ponto1_longitude), nome: os.embarque || 'Ponto da O.S.' });
        continue;
      }
      const ponto = os.ponto_embarque_id ? pontoPorId.get(os.ponto_embarque_id) : null;
      if (ponto && hasGeo(ponto.latitude, ponto.longitude)) {
        osPorId.set(os.id, { lat: Number(ponto.latitude), lng: Number(ponto.longitude), nome: ponto.nome_local || os.embarque || 'Ponto de embarque' });
      } else {
        osPorId.set(os.id, null);
      }
    }

    const rotas: Array<{
      os_id: string;
      colaborador_id: string;
      km: number | null;
      duracao_min: number | null;
      geometria: unknown;
      distancia_real: boolean;
      motivo_sem_rota?: string;
    }> = [];

    for (const par of pares) {
      const destino = osPorId.get(par.os_id);
      const origem = hasGeo(par.origem_lat, par.origem_lng)
        ? { lat: Number(par.origem_lat), lng: Number(par.origem_lng) }
        : null;
      if (!destino) {
        rotas.push({ os_id: par.os_id, colaborador_id: par.colaborador_id, km: null, duracao_min: null, geometria: null, distancia_real: false, motivo_sem_rota: 'OS sem ponto de embarque georreferenciado.' });
        continue;
      }
      if (!origem) {
        rotas.push({ os_id: par.os_id, colaborador_id: par.colaborador_id, km: null, duracao_min: null, geometria: null, distancia_real: false, motivo_sem_rota: 'Colaborador sem coordenadas de casa/base.' });
        continue;
      }

      const points: Point[] = [origem, destino];
      const routeInfo = await osrmRoute(points);
      if (routeInfo) await sleep(250);

      if (routeInfo) {
        rotas.push({ os_id: par.os_id, colaborador_id: par.colaborador_id, km: round2(routeInfo.distanceKm), duracao_min: round1(routeInfo.durationMin), geometria: routeInfo.geometry, distancia_real: true });
      } else {
        const km = haversineKm(origem.lat, origem.lng, destino.lat, destino.lng);
        rotas.push({
          os_id: par.os_id,
          colaborador_id: par.colaborador_id,
          km: km != null ? round2(km) : null,
          duracao_min: km != null ? round1((km / 50) * 60) : null,
          geometria: { type: 'LineString', coordinates: [[origem.lng, origem.lat], [destino.lng, destino.lat]] },
          distancia_real: false,
        });
      }
    }

    const porOs: Record<string, { km_total: number; duracao_total_min: number }> = {};
    for (const r of rotas) {
      if (r.km == null) continue;
      if (!porOs[r.os_id]) porOs[r.os_id] = { km_total: 0, duracao_total_min: 0 };
      porOs[r.os_id].km_total = round2(porOs[r.os_id].km_total + r.km);
      porOs[r.os_id].duracao_total_min = round1(porOs[r.os_id].duracao_total_min + (r.duracao_min || 0));
    }

    return json({ rotas, porOs });
  } catch (err) {
    console.error('[programacao-rota-equipe]', err);
    return json({ error: (err as any)?.message || String(err) }, 500);
  }
});
