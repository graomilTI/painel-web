import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const OSRM_BASE = 'https://router.project-osrm.org';
const OSRM_TIMEOUT_MS = 4000;
const OSRM_BUDGET_MS = 45000; // orçamento total de tempo p/ chamadas OSRM nesta execução
const OSRM_TABLE_MAX_POINTS = 100;

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

function normalizePlate(v: unknown): string {
  return cleanStr(v).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

function normalizeCep(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '');
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

function todayStr(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

async function readBody(req: Request) {
  try { return await req.json(); } catch { return {}; }
}

// --- Resolução de coordenadas das OS (portado de assets/js/os.js) ---

function splitUfCidadeLocal(text: string) {
  const raw = String(text || '').trim();
  const match = raw.match(/^([A-Z]{2})\s*-\s*([^()]+?)(?:\s*\(([^)]+)\))?\s*$/i);
  if (!match) return { uf: '', cidade: raw, local: '' };
  return { uf: match[1].toUpperCase(), cidade: match[2].trim(), local: (match[3] || '').trim() };
}

type PontoEmbarque = {
  nome_local?: string | null;
  cidade?: string | null;
  uf?: string | null;
  supervisao?: string | null;
  coordenacao?: string | null;
  tipo_local?: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
};

type PontoEmbarqueNorm = PontoEmbarque & {
  _id: number;
  _uf: string;
  _cidade: string;
  _nome: string;
  _sup: string;
  _lat: number;
  _lng: number;
};

// Pré-normaliza os pontos uma única vez (normalize() é custoso e seria chamado
// O(OS * pontos) vezes se feito dentro do loop de bestPontoForOs).
function precomputePontos(pontos: PontoEmbarque[]): PontoEmbarqueNorm[] {
  const out: PontoEmbarqueNorm[] = [];
  for (const p of pontos) {
    if (!hasGeo(p.latitude, p.longitude)) continue;
    out.push({
      ...p,
      _id: out.length,
      _uf: normalize(p.uf),
      _cidade: normalize(p.cidade),
      _nome: normalize(p.nome_local || p.tipo_local || ''),
      _sup: normalize(p.supervisao || p.coordenacao || ''),
      _lat: Number(p.latitude),
      _lng: Number(p.longitude),
    });
  }
  return out;
}

function bestPontoForOs(row: { embarque?: string | null; cliente?: string | null; supervisao?: string | null }, pontos: PontoEmbarqueNorm[]): PontoEmbarqueNorm | null {
  const parsed = splitUfCidadeLocal(row.embarque || '');
  const uf = normalize(parsed.uf);
  const cidade = normalize(parsed.cidade);
  const local = normalize(parsed.local);
  const cliente = normalize(row.cliente);
  const sup = normalize(row.supervisao);

  let best: { ponto: PontoEmbarqueNorm; score: number } | null = null;
  for (const p of pontos) {
    let score = 0;
    if (uf && p._uf === uf) score += 50;
    if (cidade && (p._cidade === cidade || p._cidade.includes(cidade) || cidade.includes(p._cidade))) score += 80;
    if (local && (p._nome.includes(local) || local.includes(p._nome))) score += 120;
    if (cliente && (p._nome.includes(cliente) || cliente.includes(p._nome))) score += 30;
    if (sup && p._sup && (p._sup.includes(sup) || sup.includes(p._sup))) score += 15;
    if (score >= 120 && (!best || score > best.score)) best = { ponto: p, score };
  }
  return best?.ponto || null;
}

// --- OSRM (rota real de estrada, com fallback haversine) ---

type Point = { lat: number; lng: number };
type Matrix = { distances: number[][]; durations: number[][] };

let osrmDeadline = 0;
function osrmBudgetOk() { return Date.now() < osrmDeadline; }
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function osrmTable(points: Point[]): Promise<Matrix | null> {
  if (points.length < 2 || points.length > OSRM_TABLE_MAX_POINTS || !osrmBudgetOk()) return null;
  try {
    const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
    const url = `${OSRM_BASE}/table/v1/driving/${coords}?annotations=distance,duration`;
    const res = await fetch(url, { signal: AbortSignal.timeout(OSRM_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.code !== 'Ok' || !Array.isArray(data.distances) || !Array.isArray(data.durations)) return null;
    return { distances: data.distances, durations: data.durations };
  } catch {
    return null;
  }
}

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

function buildHaversineMatrix(points: Point[]): Matrix {
  const n = points.length;
  const AVG_SPEED_KMH = 50;
  const distances: number[][] = [];
  const durations: number[][] = [];
  for (let i = 0; i < n; i++) {
    distances.push([]);
    durations.push([]);
    for (let j = 0; j < n; j++) {
      const km = i === j ? 0 : (haversineKm(points[i].lat, points[i].lng, points[j].lat, points[j].lng) || 0);
      distances[i].push(km * 1000);
      durations[i].push((km / AVG_SPEED_KMH) * 3600);
    }
  }
  return { distances, durations };
}

// --- Tipos de domínio ---

// Um "pickup" = um colaborador a buscar no endereço de casa, com o ponto de
// embarque (destino) já resolvido a partir da OS à qual ele está vinculado.
type Pickup = {
  colaborador_nome: string;
  os_id: string;
  cliente: string | null;
  embarque: string;
  lat: number;
  lng: number;
  ponto: PontoEmbarqueNorm;
};

type Veiculo = {
  id: string;
  placa: string;
  motorista: string | null;
  lat: number;
  lng: number;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await readBody(req);
    const dataStr = cleanStr((body as any)?.data) || todayStr();
    // Capacidade fixa: até 4 colaboradores por veículo (5 pessoas com o motorista).
    const MAX_COLAB = Math.max(1, Math.min(4, Number((body as any)?.maxParadas) || 4));
    const publicar = Boolean((body as any)?.publicar);
    const embarquesExtras = Array.isArray((body as any)?.embarquesExtras) ? (body as any).embarquesExtras : [];
    // Filtro opcional: quando informado, restringe a roteirização a essas OS
    // específicas (usado pela Etapa B da Programação, que já filtrou as OS
    // por supervisão/status_gestor=ATENDER antes de chamar esta function).
    const osIds: string[] = Array.isArray((body as any)?.osIds) ? (body as any).osIds.filter((v: unknown) => typeof v === 'string' && v) : [];

    osrmDeadline = Date.now() + OSRM_BUDGET_MS;

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceKey) {
      return json({ error: 'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados na Edge Function.' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1) OS ativas (não finalizadas/devolvidas), ou só as OS indicadas em osIds
    let osQuery = supabase.from('operacional_os').select('id, embarque, cliente, supervisao');
    osQuery = osIds.length
      ? osQuery.in('id', osIds)
      : osQuery.eq('situacao', 'Ativo').or('status_logistica.is.null,status_logistica.not.in.(FINALIZADA,DEVOLVIDA)');
    const { data: osRows, error: osErr } = await osQuery;
    if (osErr) throw osErr;
    const osById = new Map<string, { embarque: string | null; cliente: string | null; supervisao: string | null }>();
    for (const row of (osRows || [])) osById.set(row.id, row as any);

    // 2) Pontos georreferenciados (destinos possíveis)
    const { data: pontosRaw, error: pontosErr } = await supabase
      .from('operacional_pontos_embarque')
      .select('nome_local,cidade,uf,supervisao,coordenacao,tipo_local,latitude,longitude')
      .eq('ativo', true);
    if (pontosErr) throw pontosErr;
    const pontos = precomputePontos((pontosRaw || []) as PontoEmbarque[]);

    // 3) Vínculos colaborador <-> OS ativa, 1 por colaborador (vínculo mais recente)
    let vincQuery = supabase.from('operacional_os_colaboradores').select('os_id,colaborador_key,colaborador_nome,created_at');
    vincQuery = osIds.length ? vincQuery.in('os_id', osIds) : vincQuery.limit(2000);
    const { data: vinculosRaw, error: vincErr } = await vincQuery;
    if (vincErr) throw vincErr;

    const vinculosOrdenados = (vinculosRaw || [])
      .filter((v) => osById.has(v.os_id))
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

    // colaborador_key normalmente é o CPF (não o nome) — ver colabKey() em
    // os-programacao-lite.js e o colaboradorId retornado pela RPC da Etapa B.
    // Guardamos os dois (cpf normalizado e nome) pra poder casar por qualquer
    // um dos dois mais adiante.
    const vinculoPorColaborador = new Map<string, { os_id: string; colaborador_nome: string; cpf: string }>();
    for (const v of vinculosOrdenados) {
      const cpfDigits = normalizeCep(v.colaborador_key);
      const key = cpfDigits.length === 11 ? cpfDigits : normalize(v.colaborador_key);
      if (!key || vinculoPorColaborador.has(key)) continue;
      vinculoPorColaborador.set(key, {
        os_id: v.os_id,
        colaborador_nome: cleanStr(v.colaborador_nome || v.colaborador_key),
        cpf: cpfDigits.length === 11 ? cpfDigits : '',
      });
    }

    // 4) Endereços dos colaboradores ativos + cache de geocodificação por CEP
    const { data: colabsRaw, error: colabErr } = await supabase
      .from('colaboradores')
      .select('nome,cpf,cep,cidade,estado')
      .eq('situacao', 'Ativo')
      .limit(3000);
    if (colabErr) throw colabErr;

    const colabPorNome = new Map<string, { cep: string; cidade: string; estado: string }>();
    const colabPorCpf = new Map<string, { cep: string; cidade: string; estado: string }>();
    for (const c of (colabsRaw || [])) {
      const info = { cep: cleanStr(c.cep), cidade: cleanStr(c.cidade), estado: cleanStr(c.estado) };
      colabPorNome.set(normalize(c.nome), info);
      const cpfDigits = normalizeCep(c.cpf);
      if (cpfDigits.length === 11) colabPorCpf.set(cpfDigits, info);
    }

    function resolveColab(vinculo: { cpf: string; colaborador_nome: string }) {
      return (vinculo.cpf && colabPorCpf.get(vinculo.cpf)) || colabPorNome.get(normalize(vinculo.colaborador_nome)) || null;
    }

    const cepsNecessarios = new Set<string>();
    for (const [, vinculo] of vinculoPorColaborador) {
      const cepNorm = normalizeCep(resolveColab(vinculo)?.cep);
      if (cepNorm.length === 8) cepsNecessarios.add(cepNorm);
    }

    const { data: geoRaw, error: geoErr } = await supabase
      .from('geocode_cache')
      .select('chave,latitude,longitude,status')
      .in('chave', cepsNecessarios.size ? [...cepsNecessarios] : ['__none__']);
    if (geoErr) throw geoErr;

    const geoPorCep = new Map<string, { lat: number; lng: number }>();
    for (const g of (geoRaw || [])) {
      if (g.status === 'ok' && hasGeo(g.latitude, g.longitude)) {
        geoPorCep.set(g.chave, { lat: Number(g.latitude), lng: Number(g.longitude) });
      }
    }

    // 4b) Fallback de geocodificação: colaborador_cruzamento já traz lat/lng
    // pré-computados (vindos de operacional_colaborador_base via pg_cron) —
    // usados quando o CEP do colaborador não tem entrada em geocode_cache.
    // Casa por cpf (mais confiável) e, na falta, por nome_chave.
    const cpfsNecessarios = [...vinculoPorColaborador.values()].map((v) => v.cpf).filter(Boolean);
    const nomesNecessarios = [...vinculoPorColaborador.values()].map((v) => normalize(v.colaborador_nome)).filter(Boolean);
    const { data: cruzamentoRaw, error: cruzErr } = await supabase
      .from('colaborador_cruzamento')
      .select('cpf,nome_chave,latitude,longitude')
      .or(`cpf.in.(${(cpfsNecessarios.length ? cpfsNecessarios : ['__none__']).join(',')}),nome_chave.in.(${(nomesNecessarios.length ? nomesNecessarios : ['__none__']).join(',')})`);
    if (cruzErr) throw cruzErr;
    const geoPorCpfCruz = new Map<string, { lat: number; lng: number }>();
    const geoPorNomeChave = new Map<string, { lat: number; lng: number }>();
    for (const c of (cruzamentoRaw || [])) {
      if (!hasGeo(c.latitude, c.longitude)) continue;
      const geo = { lat: Number(c.latitude), lng: Number(c.longitude) };
      if (c.cpf) geoPorCpfCruz.set(c.cpf, geo);
      if (c.nome_chave) geoPorNomeChave.set(c.nome_chave, geo);
    }

    // 5) Montar pickups: 1 por colaborador, com endereço geocodificado + ponto de
    // embarque (destino) resolvido a partir da OS à qual ele está vinculado.
    const pickups: Pickup[] = [];
    const semCoordenadas: Array<{ os_id: string; embarque: string; cliente: string | null; colaborador_nome: string }> = [];
    const semGeocodificacao: Array<{ colaborador_nome: string; os_id: string; cliente: string | null; cep: string; cidade: string; estado: string }> = [];

    for (const [, vinculo] of vinculoPorColaborador) {
      const osRow = osById.get(vinculo.os_id);
      if (!osRow) continue;

      const colab = resolveColab(vinculo);
      const cepNorm = normalizeCep(colab?.cep);
      const geo = (cepNorm.length === 8 ? geoPorCep.get(cepNorm) : null)
        || (vinculo.cpf ? geoPorCpfCruz.get(vinculo.cpf) : null)
        || geoPorNomeChave.get(normalize(vinculo.colaborador_nome));
      if (!geo) {
        semGeocodificacao.push({
          colaborador_nome: vinculo.colaborador_nome,
          os_id: vinculo.os_id,
          cliente: osRow.cliente || null,
          cep: colab?.cep || '',
          cidade: colab?.cidade || '',
          estado: colab?.estado || '',
        });
        continue;
      }

      const ponto = bestPontoForOs(osRow, pontos);
      if (!ponto) {
        semCoordenadas.push({ os_id: vinculo.os_id, embarque: osRow.embarque || '', cliente: osRow.cliente || null, colaborador_nome: vinculo.colaborador_nome });
        continue;
      }

      pickups.push({
        colaborador_nome: vinculo.colaborador_nome,
        os_id: vinculo.os_id,
        cliente: osRow.cliente || null,
        embarque: osRow.embarque || '',
        lat: geo.lat,
        lng: geo.lng,
        ponto,
      });
    }

    // 6) Veículos ativos com posição conhecida
    const { data: veiculosRaw, error: vErr } = await supabase
      .from('frotas_veiculos')
      .select('id,placa,motorista_atual,status')
      .eq('status', 'ATIVO');
    if (vErr) throw vErr;

    const { data: posicoesRaw, error: pErr } = await supabase
      .from('frotas_posicoes')
      .select('placa,veiculo_id,latitude,longitude,motorista');
    if (pErr) throw pErr;

    const posByVeiculoId = new Map<string, any>();
    const posByPlaca = new Map<string, any>();
    for (const p of (posicoesRaw || [])) {
      if (p.veiculo_id) posByVeiculoId.set(p.veiculo_id, p);
      if (p.placa) posByPlaca.set(normalizePlate(p.placa), p);
    }

    const veiculos: Veiculo[] = [];
    for (const v of (veiculosRaw || [])) {
      const pos = posByVeiculoId.get(v.id) || posByPlaca.get(normalizePlate(v.placa));
      if (!pos || !hasGeo(pos.latitude, pos.longitude)) continue;
      veiculos.push({
        id: v.id,
        placa: v.placa,
        motorista: v.motorista_atual || pos.motorista || null,
        lat: Number(pos.latitude),
        lng: Number(pos.longitude),
      });
    }

    // 7) Roteirização real via VROOM (multi-veículo, pickup-delivery): cada
    // colaborador vira um "shipment" (pickup no endereço dele, delivery no
    // ponto de embarque da OS que ele atende) e o VROOM decide, pra frota
    // inteira de uma vez, quem cada veículo leva e em que ordem — substitui o
    // agrupamento manual por ponto compartilhado + guloso + 2-opt de antes,
    // que só funcionava bem quando todo mundo num veículo ia pro mesmo lugar.
    const vroomUrl = Deno.env.get('VROOM_URL') || '';
    const vroomKey = Deno.env.get('VROOM_KEY') || '';
    if (pickups.length && (!vroomUrl || !vroomKey)) {
      return json({ error: 'VROOM_URL ou VROOM_KEY não configurados na Edge Function.' }, 500);
    }

    const usedVehicleIds = new Set<string>();
    const naoAlocados: Array<{ colaborador_nome: string; os_id: string | null; embarque: string; motivo: string }> = [];
    const rotas: any[] = [];

    if (pickups.length && veiculos.length) {
      const vroomVehicles = veiculos.map((v, i) => ({ id: i, start: [v.lng, v.lat], capacity: [MAX_COLAB] }));
      const vroomShipments = pickups.map((p, i) => ({
        pickup: { id: i * 2, location: [p.lng, p.lat] },
        delivery: { id: i * 2 + 1, location: [p.ponto._lng, p.ponto._lat] },
        amount: [1],
      }));

      const vroomRes = await fetch(vroomUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Vroom-Key': vroomKey },
        body: JSON.stringify({ vehicles: vroomVehicles, shipments: vroomShipments, options: { g: true } }),
        signal: AbortSignal.timeout(OSRM_BUDGET_MS),
      });
      if (!vroomRes.ok) throw new Error(`VROOM respondeu HTTP ${vroomRes.status}`);
      const vroomData = await vroomRes.json();
      if (vroomData?.code !== 0) throw new Error(vroomData?.error || 'VROOM não conseguiu resolver a roteirização.');

      for (const route of (vroomData.routes || [])) {
        const veiculo = veiculos[route.vehicle];
        if (!veiculo) continue;
        usedVehicleIds.add(veiculo.id);

        const paradas: any[] = [];
        let prevDist = 0;
        let prevDur = 0;
        let ordem = 0;
        for (const step of (route.steps || [])) {
          const dist = typeof step.distance === 'number' ? step.distance : prevDist;
          const dur = typeof step.duration === 'number' ? step.duration : prevDur;
          if (step.type === 'start') { prevDist = dist; prevDur = dur; continue; }
          const trecho = { distancia_km_trecho: round2((dist - prevDist) / 1000), duracao_min_trecho: round1((dur - prevDur) / 60) };
          prevDist = dist;
          prevDur = dur;
          if (step.type !== 'pickup' && step.type !== 'delivery') continue;
          const p = pickups[Math.floor(Number(step.id) / 2)];
          if (!p) continue;
          ordem += 1;
          if (step.type === 'pickup') {
            paradas.push({ ordem, tipo: 'colaborador', os_id: p.os_id, colaborador_nome: p.colaborador_nome, ponto_nome: p.ponto.nome_local || p.ponto.tipo_local || 'Ponto operacional', embarque_texto: p.embarque, lat: p.lat, lng: p.lng, ...trecho });
          } else {
            paradas.push({ ordem, tipo: 'embarque', os_id: p.os_id, colaborador_nome: null, ponto_nome: p.ponto.nome_local || p.ponto.tipo_local || 'Ponto operacional', embarque_texto: '', lat: p.ponto._lat, lng: p.ponto._lng, ...trecho });
          }
        }

        rotas.push({
          placa: veiculo.placa,
          veiculo_id: veiculo.id,
          motorista: veiculo.motorista,
          origem: { lat: veiculo.lat, lng: veiculo.lng },
          paradas,
          km_total_estimado: round2(prevDist / 1000),
          duracao_estimada_min: round1(prevDur / 60),
          geometria: null,
          distancia_real: true,
        });
      }

      const semRota = new Set<number>();
      for (const u of (vroomData.unassigned || [])) semRota.add(Math.floor(Number(u.id) / 2));
      for (const idx of semRota) {
        const p = pickups[idx];
        if (p) naoAlocados.push({ colaborador_nome: p.colaborador_nome, os_id: p.os_id, embarque: p.embarque, motivo: 'Não coube na capacidade da frota disponível (VROOM)' });
      }
    } else if (pickups.length) {
      for (const p of pickups) naoAlocados.push({ colaborador_nome: p.colaborador_nome, os_id: p.os_id, embarque: p.embarque, motivo: 'Sem veículo disponível' });
    }

    // 8) Embarques extras (urgentes, manuais): cada um vira uma rota direta do
    // veículo disponível mais próximo até o ponto, sem coleta de colaboradores.
    for (const extra of embarquesExtras) {
      const lat = Number(extra?.latitude);
      const lng = Number(extra?.longitude);
      const nome = cleanStr(extra?.nome) || 'Embarque urgente';
      if (!hasGeo(lat, lng)) continue;

      const disponiveis = veiculos.filter((v) => !usedVehicleIds.has(v.id));
      if (!disponiveis.length) {
        naoAlocados.push({ colaborador_nome: '', os_id: null, embarque: nome, motivo: 'Sem veículo disponível (todos já alocados)' });
        continue;
      }

      const veiculo = disponiveis
        .map((v) => ({ v, dist: haversineKm(v.lat, v.lng, lat, lng) ?? Infinity }))
        .sort((a, b) => a.dist - b.dist)[0].v;
      usedVehicleIds.add(veiculo.id);

      const points: Point[] = [{ lat: veiculo.lat, lng: veiculo.lng }, { lat, lng }];
      let matrix = await osrmTable(points);
      const distanciaReal = !!matrix;
      if (!matrix) matrix = buildHaversineMatrix(points);
      else await sleep(300);

      const routeInfo = distanciaReal ? await osrmRoute(points) : null;
      if (routeInfo) await sleep(300);

      const trecho = { distancia_km_trecho: round2(matrix.distances[0][1] / 1000), duracao_min_trecho: round1(matrix.durations[0][1] / 60) };
      const kmTotal = routeInfo ? routeInfo.distanceKm : trecho.distancia_km_trecho;
      const durTotal = routeInfo ? routeInfo.durationMin : trecho.duracao_min_trecho;

      rotas.push({
        placa: veiculo.placa,
        veiculo_id: veiculo.id,
        motorista: veiculo.motorista,
        origem: { lat: veiculo.lat, lng: veiculo.lng },
        paradas: [{ ordem: 1, tipo: 'embarque', os_id: null, colaborador_nome: null, ponto_nome: nome, embarque_texto: '', lat, lng, ...trecho }],
        km_total_estimado: round2(kmTotal),
        duracao_estimada_min: round1(durTotal),
        geometria: routeInfo?.geometry || null,
        distancia_real: distanciaReal || !!routeInfo,
      });
    }

    // 9) Veículo com rastreador (posição conhecida) mas sem embarque hoje:
    // ainda assim entra em "rotas", como rota vazia (parado/aguardando).
    for (const veiculo of veiculos) {
      if (usedVehicleIds.has(veiculo.id)) continue;
      rotas.push({
        placa: veiculo.placa,
        veiculo_id: veiculo.id,
        motorista: veiculo.motorista,
        origem: { lat: veiculo.lat, lng: veiculo.lng },
        paradas: [],
        km_total_estimado: 0,
        duracao_estimada_min: 0,
        geometria: null,
        distancia_real: false,
      });
    }

    // 10) Publicar rotas (substitui as rotas do dia)
    if (publicar) {
      let userId: string | null = null;
      try {
        const authHeader = req.headers.get('Authorization') || '';
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
        const userClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: userData } = await userClient.auth.getUser();
        userId = userData?.user?.id || null;
      } catch { /* segue sem criado_por */ }

      const nowIso = new Date().toISOString();

      const { error: delErr } = await supabase.from('frotas_rotas').delete().eq('data', dataStr);
      if (delErr) throw delErr;

      for (const rota of rotas) {
        const { data: inserted, error: insErr } = await supabase
          .from('frotas_rotas')
          .insert({
            data: dataStr,
            placa: rota.placa,
            veiculo_id: rota.veiculo_id,
            motorista: rota.motorista,
            status: 'publicada',
            origem_latitude: rota.origem.lat,
            origem_longitude: rota.origem.lng,
            km_total_estimado: rota.km_total_estimado,
            duracao_estimada_min: rota.duracao_estimada_min,
            qtd_paradas: rota.paradas.length,
            geometria: rota.geometria,
            criado_por: userId,
            publicado_em: nowIso,
          })
          .select('id')
          .single();
        if (insErr) throw insErr;

        const paradasRows = rota.paradas.map((p: any) => ({
          rota_id: inserted.id,
          os_id: p.os_id,
          ordem: p.ordem,
          tipo: p.tipo,
          colaborador_nome: p.colaborador_nome,
          ponto_nome: p.ponto_nome,
          embarque_texto: p.embarque_texto,
          latitude: p.lat,
          longitude: p.lng,
          distancia_km_trecho: p.distancia_km_trecho,
          duracao_min_trecho: p.duracao_min_trecho,
        }));
        if (paradasRows.length) {
          const { error: parErr } = await supabase.from('frotas_rotas_paradas').insert(paradasRows);
          if (parErr) throw parErr;
        }
      }
    }

    const naoAlocadosColab = naoAlocados.filter((n) => n.colaborador_nome).length;

    return json({
      data: dataStr,
      rotas,
      naoAlocados,
      semCoordenadas,
      semGeocodificacao,
      totais: {
        embarques: pickups.length,
        alocados: pickups.length - naoAlocadosColab,
        nao_alocados: naoAlocados.length,
        sem_coordenadas: semCoordenadas.length,
        sem_geocodificacao: semGeocodificacao.length,
        veiculos_utilizados: usedVehicleIds.size,
        veiculos_disponiveis: veiculos.length,
        km_total: round2(rotas.reduce((s, r) => s + r.km_total_estimado, 0)),
      },
      publicado: publicar,
    });
  } catch (err) {
    console.error('[frotas-roteirizar]', err);
    return json({ error: (err as any)?.message || String(err) }, 500);
  }
});
