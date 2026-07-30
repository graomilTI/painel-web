import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

// Chamada pelo cliente (assets/js/programacao.js, saveProgramacao) assim que o
// Gestor clica "Salvar programação" — calcula e publica as rotas do dia pra
// aquela supervisão em operacional_mapa_rotas/operacional_mapa_rotas_paradas,
// consumidas pelo Mapa Operacional (Operacional > Mapa, assets/js/operacional.js).
// Só entra O.S. com status_gestor='ATENDER' (única coisa que o Mapa mostra).
//
// Duas trilhas de rota, por assets/js/programacao-despesas.js:tipo_deslocamento:
// - 'MOTORISTA FROTA'/'CARONA FROTA' -> veículo de frota rastreado (GPS),
//   otimizado multi-parada via VROOM (mesmo modelo de frotas-roteirizar).
// - 'REEMBOLSO KM' -> colaborador com carro próprio, sem veículo compartilhado
//   pra otimizar entre eles: 1 rota individual ponto-a-ponto (origem -> embarque).
// 'NÃO PRECISA'/'UBER/TÁXI' não geram rota (nada a desenhar no mapa).
//
// Origem de cada colaborador: se estiver hospedado (Hotel com reserva
// confirmada, ou Alojamento) na data de referência, usa a coordenada do
// hotel/alojamento em vez da casa (pedido da usuária, 2026-07-30).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const OSRM_BASE = 'https://router.project-osrm.org';
const OSRM_TIMEOUT_MS = 4000;
const OSRM_BUDGET_MS = 40000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function cleanStr(v: unknown): string { return String(v ?? '').trim(); }

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

function normalizeDigits(v: unknown): string { return String(v ?? '').replace(/\D/g, ''); }

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

function todayStr(): string { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); }

async function readBody(req: Request) {
  try { return await req.json(); } catch { return {}; }
}

function splitUfCidadeLocal(text: string) {
  const raw = String(text || '').trim();
  const match = raw.match(/^([A-Z]{2})\s*-\s*([^()]+?)(?:\s*\(([^)]+)\))?\s*$/i);
  if (!match) return { uf: '', cidade: raw, local: '' };
  return { uf: match[1].toUpperCase(), cidade: match[2].trim(), local: (match[3] || '').trim() };
}

type PontoEmbarque = {
  nome_local?: string | null; cidade?: string | null; uf?: string | null;
  supervisao?: string | null; coordenacao?: string | null; tipo_local?: string | null;
  latitude: number | string | null; longitude: number | string | null;
};
type PontoEmbarqueNorm = PontoEmbarque & { _uf: string; _cidade: string; _nome: string; _sup: string; _lat: number; _lng: number };

function precomputePontos(pontos: PontoEmbarque[]): PontoEmbarqueNorm[] {
  const out: PontoEmbarqueNorm[] = [];
  for (const p of pontos) {
    if (!hasGeo(p.latitude, p.longitude)) continue;
    out.push({
      ...p,
      _uf: normalize(p.uf), _cidade: normalize(p.cidade),
      _nome: normalize(p.nome_local || p.tipo_local || ''),
      _sup: normalize(p.supervisao || p.coordenacao || ''),
      _lat: Number(p.latitude), _lng: Number(p.longitude),
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

type Point = { lat: number; lng: number };
let osrmDeadline = 0;
function osrmBudgetOk() { return Date.now() < osrmDeadline; }
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

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
  } catch { return null; }
}

type Pickup = {
  colaborador_nome: string; colaborador_cpf: string; os_id: string; cliente: string | null;
  embarque: string; lat: number; lng: number; origemTipo: 'casa' | 'hotel' | 'alojamento'; ponto: PontoEmbarqueNorm;
};
type Veiculo = { id: string; placa: string; motorista: string | null; lat: number; lng: number };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await readBody(req);
    const dataReferencia = cleanStr((body as any)?.dataReferencia) || todayStr();
    const supervisao = cleanStr((body as any)?.supervisao);
    const programacaoId = cleanStr((body as any)?.programacaoId) || null;
    if (!supervisao) return json({ error: 'supervisao é obrigatória.' }, 400);

    osrmDeadline = Date.now() + OSRM_BUDGET_MS;

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceKey) return json({ error: 'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados.' }, 500);
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    // 1) Só O.S. "Atender" da supervisão, na data de referência.
    const { data: osRows, error: osErr } = await supabase
      .from('operacional_os')
      .select('id, embarque, cliente, supervisao, data_os')
      .eq('status_gestor', 'ATENDER')
      .eq('data_os', dataReferencia)
      .ilike('supervisao', supervisao);
    if (osErr) throw osErr;
    const osById = new Map<string, any>();
    for (const row of (osRows || [])) osById.set(row.id, row);
    const osIds = [...osById.keys()];

    if (!osIds.length) {
      await supabase.from('operacional_mapa_rotas').delete().eq('supervisao', supervisao).eq('data_referencia', dataReferencia);
      return json({ supervisao, data_referencia: dataReferencia, rotas: 0, motivo: 'Nenhuma O.S. Atender para esta supervisão/data.' });
    }

    // 2) Pontos de embarque + vínculo colaborador<->OS
    const { data: pontosRaw, error: pontosErr } = await supabase
      .from('operacional_pontos_embarque')
      .select('nome_local,cidade,uf,supervisao,coordenacao,tipo_local,latitude,longitude')
      .eq('ativo', true);
    if (pontosErr) throw pontosErr;
    const pontos = precomputePontos((pontosRaw || []) as PontoEmbarque[]);

    const { data: vinculosRaw, error: vincErr } = await supabase
      .from('operacional_os_colaboradores')
      .select('os_id,colaborador_key,colaborador_nome,colaborador_cpf,created_at')
      .in('os_id', osIds);
    if (vincErr) throw vincErr;

    const vinculosOrdenados = (vinculosRaw || []).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const vinculoPorColaborador = new Map<string, { os_id: string; colaborador_nome: string; cpf: string }>();
    for (const v of vinculosOrdenados) {
      const cpfDigits = normalizeDigits(v.colaborador_cpf || v.colaborador_key);
      const key = cpfDigits.length === 11 ? cpfDigits : normalize(v.colaborador_key);
      if (!key || vinculoPorColaborador.has(key)) continue;
      vinculoPorColaborador.set(key, { os_id: v.os_id, colaborador_nome: cleanStr(v.colaborador_nome || v.colaborador_key), cpf: cpfDigits.length === 11 ? cpfDigits : '' });
    }
    if (!vinculoPorColaborador.size) {
      await supabase.from('operacional_mapa_rotas').delete().eq('supervisao', supervisao).eq('data_referencia', dataReferencia);
      return json({ supervisao, data_referencia: dataReferencia, rotas: 0, motivo: 'Nenhum colaborador vinculado às O.S. Atender.' });
    }

    const cpfsNecessarios = [...vinculoPorColaborador.values()].map((v) => v.cpf).filter(Boolean);
    const nomesNecessarios = [...vinculoPorColaborador.values()].map((v) => normalize(v.colaborador_nome)).filter(Boolean);

    // 3) tipo_deslocamento (frota / carona / reembolso km) — programacao_deslocamento
    const { data: deslocRaw, error: deslocErr } = await supabase
      .from('programacao_deslocamento')
      .select('colaborador_id,tipo_deslocamento,placa_veiculo')
      .eq('data_referencia', dataReferencia)
      .in('colaborador_id', cpfsNecessarios.length ? cpfsNecessarios : ['__none__']);
    if (deslocErr) throw deslocErr;
    const deslocPorCpf = new Map<string, { tipo: string; placa: string }>();
    for (const d of (deslocRaw || [])) {
      deslocPorCpf.set(normalizeDigits(d.colaborador_id), { tipo: normalize(d.tipo_deslocamento), placa: normalizePlate(d.placa_veiculo) });
    }

    // 4) Endereço de casa (colaboradores + geocode_cache + colaborador_cruzamento)
    const { data: colabsRaw, error: colabErr } = await supabase
      .from('colaboradores').select('nome,cpf,cep,cidade,estado').eq('situacao', 'Ativo').limit(3000);
    if (colabErr) throw colabErr;
    const colabPorNome = new Map<string, any>();
    const colabPorCpf = new Map<string, any>();
    for (const c of (colabsRaw || [])) {
      const info = { cep: cleanStr(c.cep), cidade: cleanStr(c.cidade), estado: cleanStr(c.estado) };
      colabPorNome.set(normalize(c.nome), info);
      const cpfDigits = normalizeDigits(c.cpf);
      if (cpfDigits.length === 11) colabPorCpf.set(cpfDigits, info);
    }
    function resolveColab(v: { cpf: string; colaborador_nome: string }) {
      return (v.cpf && colabPorCpf.get(v.cpf)) || colabPorNome.get(normalize(v.colaborador_nome)) || null;
    }
    const cepsNecessarios = new Set<string>();
    for (const [, v] of vinculoPorColaborador) {
      const cep = normalizeDigits(resolveColab(v)?.cep);
      if (cep.length === 8) cepsNecessarios.add(cep);
    }
    const { data: geoRaw } = await supabase.from('geocode_cache').select('chave,latitude,longitude,status').in('chave', cepsNecessarios.size ? [...cepsNecessarios] : ['__none__']);
    const geoPorCep = new Map<string, Point>();
    for (const g of (geoRaw || [])) if (g.status === 'ok' && hasGeo(g.latitude, g.longitude)) geoPorCep.set(g.chave, { lat: Number(g.latitude), lng: Number(g.longitude) });

    const { data: cruzamentoRaw } = await supabase
      .from('colaborador_cruzamento').select('cpf,nome_chave,latitude,longitude')
      .or(`cpf.in.(${(cpfsNecessarios.length ? cpfsNecessarios : ['__none__']).join(',')}),nome_chave.in.(${(nomesNecessarios.length ? nomesNecessarios : ['__none__']).join(',')})`);
    const geoPorCpfCruz = new Map<string, Point>();
    const geoPorNomeChave = new Map<string, Point>();
    for (const c of (cruzamentoRaw || [])) {
      if (!hasGeo(c.latitude, c.longitude)) continue;
      const geo = { lat: Number(c.latitude), lng: Number(c.longitude) };
      if (c.cpf) geoPorCpfCruz.set(c.cpf, geo);
      if (c.nome_chave) geoPorNomeChave.set(c.nome_chave, geo);
    }
    function enderecoCasa(v: { cpf: string; colaborador_nome: string }): Point | null {
      const colab = resolveColab(v);
      const cep = normalizeDigits(colab?.cep);
      return (cep.length === 8 ? geoPorCep.get(cep) : null) || (v.cpf ? geoPorCpfCruz.get(v.cpf) : null) || geoPorNomeChave.get(normalize(v.colaborador_nome)) || null;
    }

    // 5) Hospedagem ativa na data: Alojamento (programacao_estadia.alojamento_id)
    // e Hotel (hospedagem_solicitacao_colaboradores -> hospedagem_reservas -> hotel_id)
    // sobrepõem o endereço de casa enquanto a estadia estiver ativa.
    const { data: estadiaRaw } = await supabase
      .from('programacao_estadia')
      .select('colaborador_id,tipo_estadia,alojamento_id,checkin,checkout')
      .eq('data_referencia', dataReferencia)
      .in('colaborador_id', cpfsNecessarios.length ? cpfsNecessarios : ['__none__']);
    const alojamentoIdPorCpf = new Map<string, string>();
    for (const e of (estadiaRaw || [])) {
      if (normalize(e.tipo_estadia) !== 'ALOJAMENTO' || !e.alojamento_id) continue;
      if (e.checkin && e.checkin > dataReferencia) continue;
      if (e.checkout && e.checkout <= dataReferencia) continue;
      alojamentoIdPorCpf.set(normalizeDigits(e.colaborador_id), e.alojamento_id);
    }
    const alojamentoIds = [...new Set(alojamentoIdPorCpf.values())];
    const geoPorAlojamento = new Map<string, Point>();
    if (alojamentoIds.length) {
      const { data: alojRaw } = await supabase.from('hospedagem_alojamentos').select('id,latitude,longitude').in('id', alojamentoIds);
      for (const a of (alojRaw || [])) if (hasGeo(a.latitude, a.longitude)) geoPorAlojamento.set(a.id, { lat: Number(a.latitude), lng: Number(a.longitude) });
    }

    const { data: solColabRaw } = await supabase
      .from('hospedagem_solicitacao_colaboradores').select('solicitacao_id,cpf,nome_colaborador')
      .in('cpf', cpfsNecessarios.length ? cpfsNecessarios : ['__none__']);
    const solicitacaoIdsPorCpf = new Map<string, string[]>();
    for (const s of (solColabRaw || [])) {
      const cpf = normalizeDigits(s.cpf);
      if (!cpf) continue;
      const arr = solicitacaoIdsPorCpf.get(cpf) || [];
      arr.push(s.solicitacao_id);
      solicitacaoIdsPorCpf.set(cpf, arr);
    }
    const todasSolicitacoes = [...new Set([...solicitacaoIdsPorCpf.values()].flat())];
    const hotelIdPorSolicitacao = new Map<string, string>();
    if (todasSolicitacoes.length) {
      const { data: reservasRaw } = await supabase
        .from('hospedagem_reservas').select('solicitacao_id,hotel_id,data_checkin,data_checkout,status_hospedagem')
        .in('solicitacao_id', todasSolicitacoes);
      for (const r of (reservasRaw || [])) {
        if (!r.hotel_id) continue;
        if (r.data_checkin && r.data_checkin > dataReferencia) continue;
        if (r.data_checkout && r.data_checkout <= dataReferencia) continue;
        hotelIdPorSolicitacao.set(r.solicitacao_id, r.hotel_id);
      }
    }
    const hotelIdPorCpf = new Map<string, string>();
    for (const [cpf, solIds] of solicitacaoIdsPorCpf) {
      const hotelId = solIds.map((id) => hotelIdPorSolicitacao.get(id)).find(Boolean);
      if (hotelId) hotelIdPorCpf.set(cpf, hotelId);
    }
    const hotelIds = [...new Set(hotelIdPorCpf.values())];
    const geoPorHotel = new Map<string, Point>();
    if (hotelIds.length) {
      const { data: hoteisRaw } = await supabase.from('hospedagem_hoteis').select('id,latitude,longitude').in('id', hotelIds);
      for (const h of (hoteisRaw || [])) if (hasGeo(h.latitude, h.longitude)) geoPorHotel.set(h.id, { lat: Number(h.latitude), lng: Number(h.longitude) });
    }

    function origemColaborador(v: { cpf: string; colaborador_nome: string }): { geo: Point; tipo: 'casa' | 'hotel' | 'alojamento' } | null {
      const hotelId = v.cpf ? hotelIdPorCpf.get(v.cpf) : null;
      if (hotelId) { const geo = geoPorHotel.get(hotelId); if (geo) return { geo, tipo: 'hotel' }; }
      const alojId = v.cpf ? alojamentoIdPorCpf.get(v.cpf) : null;
      if (alojId) { const geo = geoPorAlojamento.get(alojId); if (geo) return { geo, tipo: 'alojamento' }; }
      const casa = enderecoCasa(v);
      if (casa) return { geo: casa, tipo: 'casa' };
      return null;
    }

    // 6) Separa colaboradores por tipo de deslocamento e monta pickups
    const pickupsFrota: Pickup[] = [];
    const pickupsReembolso: Pickup[] = [];
    const semGeocodificacao: any[] = [];
    const semPontoEmbarque: any[] = [];

    for (const [, v] of vinculoPorColaborador) {
      const osRow = osById.get(v.os_id);
      if (!osRow) continue;
      const desloc = deslocPorCpf.get(v.cpf) || null;
      const tipo = desloc?.tipo || '';
      if (tipo !== 'MOTORISTA FROTA' && tipo !== 'CARONA FROTA' && tipo !== 'REEMBOLSO KM') continue; // NÃO PRECISA/UBER: sem rota a desenhar

      const origem = origemColaborador(v);
      if (!origem) { semGeocodificacao.push({ colaborador_nome: v.colaborador_nome, os_id: v.os_id }); continue; }
      const ponto = bestPontoForOs(osRow, pontos);
      if (!ponto) { semPontoEmbarque.push({ colaborador_nome: v.colaborador_nome, os_id: v.os_id, embarque: osRow.embarque }); continue; }

      const pickup: Pickup = {
        colaborador_nome: v.colaborador_nome, colaborador_cpf: v.cpf, os_id: v.os_id,
        cliente: osRow.cliente || null, embarque: osRow.embarque || '',
        lat: origem.geo.lat, lng: origem.geo.lng, origemTipo: origem.tipo, ponto,
      };
      if (tipo === 'REEMBOLSO KM') pickupsReembolso.push(pickup);
      else pickupsFrota.push(pickup);
    }

    const rotasParaGravar: any[] = [];

    // 7) Trilha frota: VROOM multi-veículo (mesmo modelo de frotas-roteirizar)
    if (pickupsFrota.length) {
      const { data: veiculosRaw } = await supabase.from('frotas_veiculos').select('id,placa,motorista_atual,status').eq('status', 'ATIVO');
      const { data: posicoesRaw } = await supabase.from('frotas_posicoes').select('placa,veiculo_id,latitude,longitude,motorista');
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
        veiculos.push({ id: v.id, placa: v.placa, motorista: v.motorista_atual || pos.motorista || null, lat: Number(pos.latitude), lng: Number(pos.longitude) });
      }

      const vroomUrl = Deno.env.get('VROOM_URL') || '';
      const vroomKey = Deno.env.get('VROOM_KEY') || '';
      if (veiculos.length && vroomUrl && vroomKey) {
        const MAX_COLAB = 4;
        const vroomVehicles = veiculos.map((v, i) => ({ id: i, start: [v.lng, v.lat], capacity: [MAX_COLAB] }));
        const vroomShipments = pickupsFrota.map((p, i) => ({ pickup: { id: i * 2, location: [p.lng, p.lat] }, delivery: { id: i * 2 + 1, location: [p.ponto._lng, p.ponto._lat] }, amount: [1] }));
        const vroomRes = await fetch(vroomUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Vroom-Key': vroomKey },
          body: JSON.stringify({ vehicles: vroomVehicles, shipments: vroomShipments, options: { g: true } }),
          signal: AbortSignal.timeout(OSRM_BUDGET_MS),
        });
        if (vroomRes.ok) {
          const vroomData = await vroomRes.json();
          if (vroomData?.code === 0) {
            for (const route of (vroomData.routes || [])) {
              const veiculo = veiculos[route.vehicle];
              if (!veiculo) continue;
              const paradas: any[] = [];
              let prevDist = 0, prevDur = 0, ordem = 0;
              for (const step of (route.steps || [])) {
                const dist = typeof step.distance === 'number' ? step.distance : prevDist;
                const dur = typeof step.duration === 'number' ? step.duration : prevDur;
                if (step.type === 'start') { prevDist = dist; prevDur = dur; continue; }
                const trecho = { distancia_km_trecho: round2((dist - prevDist) / 1000), duracao_min_trecho: round1((dur - prevDur) / 60) };
                prevDist = dist; prevDur = dur;
                if (step.type !== 'pickup' && step.type !== 'delivery') continue;
                const p = pickupsFrota[Math.floor(Number(step.id) / 2)];
                if (!p) continue;
                ordem += 1;
                if (step.type === 'pickup') paradas.push({ ordem, tipo: 'colaborador', os_id: p.os_id, colaborador_nome: p.colaborador_nome, ponto_nome: p.ponto.nome_local || p.ponto.tipo_local || 'Ponto operacional', embarque_texto: p.embarque, lat: p.lat, lng: p.lng, ...trecho });
                else paradas.push({ ordem, tipo: 'embarque', os_id: p.os_id, colaborador_nome: null, ponto_nome: p.ponto.nome_local || p.ponto.tipo_local || 'Ponto operacional', embarque_texto: '', lat: p.ponto._lat, lng: p.ponto._lng, ...trecho });
              }
              // Geometria real (seguindo estrada) pro trajeto completo do veículo — VROOM só
              // devolve distância/duração por trecho, não o desenho da via. Reaproveita o mesmo
              // osrmRoute() da trilha reembolso_km; se o OSRM não responder a tempo (orçamento
              // de 40s da function), o Mapa cai no fallback de linha reta entre os pontos.
              const pontosRotaFrota: Point[] = [{ lat: veiculo.lat, lng: veiculo.lng }, ...paradas.map((p) => ({ lat: p.lat, lng: p.lng }))];
              const rotaInfo = await osrmRoute(pontosRotaFrota);
              if (rotaInfo) await sleep(200);

              rotasParaGravar.push({
                tipo: 'frota', veiculo_id: veiculo.id, placa: veiculo.placa, motorista_nome: veiculo.motorista,
                colaborador_nome: null, colaborador_cpf: null,
                origem_latitude: veiculo.lat, origem_longitude: veiculo.lng, origem_tipo: null,
                km_total_estimado: round2(prevDist / 1000), duracao_estimada_min: round1(prevDur / 60),
                geometria: rotaInfo?.geometry || null, paradas,
              });
            }
          }
        }
      }
    }

    // 8) Trilha reembolso km: 1 rota individual por colaborador (origem já
    // resolvida — casa, hotel ou alojamento — até o ponto de embarque da OS).
    for (const p of pickupsReembolso) {
      const points: Point[] = [{ lat: p.lat, lng: p.lng }, { lat: p.ponto._lat, lng: p.ponto._lng }];
      const routeInfo = await osrmRoute(points);
      if (routeInfo) await sleep(200);
      const km = routeInfo?.distanceKm ?? (haversineKm(p.lat, p.lng, p.ponto._lat, p.ponto._lng) || 0);
      const dur = routeInfo?.durationMin ?? (km / 50) * 60;
      rotasParaGravar.push({
        tipo: 'reembolso_km', veiculo_id: null, placa: null, motorista_nome: p.colaborador_nome,
        colaborador_nome: p.colaborador_nome, colaborador_cpf: p.colaborador_cpf || null,
        origem_latitude: p.lat, origem_longitude: p.lng, origem_tipo: p.origemTipo,
        km_total_estimado: round2(km), duracao_estimada_min: round1(dur),
        geometria: routeInfo?.geometry || null,
        paradas: [{ ordem: 1, tipo: 'embarque', os_id: p.os_id, colaborador_nome: null, ponto_nome: p.ponto.nome_local || p.ponto.tipo_local || 'Ponto operacional', embarque_texto: p.embarque, lat: p.ponto._lat, lng: p.ponto._lng, distancia_km_trecho: round2(km), duracao_min_trecho: round1(dur) }],
      });
    }

    // 9) Publica: substitui as rotas dessa supervisão/data
    const { error: delErr } = await supabase.from('operacional_mapa_rotas').delete().eq('supervisao', supervisao).eq('data_referencia', dataReferencia);
    if (delErr) throw delErr;

    for (const rota of rotasParaGravar) {
      const { data: inserted, error: insErr } = await supabase.from('operacional_mapa_rotas').insert({
        programacao_id: programacaoId, supervisao, data_referencia: dataReferencia,
        tipo: rota.tipo, veiculo_id: rota.veiculo_id, placa: rota.placa, motorista_nome: rota.motorista_nome,
        colaborador_nome: rota.colaborador_nome, colaborador_cpf: rota.colaborador_cpf,
        origem_latitude: rota.origem_latitude, origem_longitude: rota.origem_longitude, origem_tipo: rota.origem_tipo,
        km_total_estimado: rota.km_total_estimado, duracao_estimada_min: rota.duracao_estimada_min,
        geometria: rota.geometria,
      }).select('id').single();
      if (insErr) throw insErr;

      const paradasRows = rota.paradas.map((p: any) => ({
        rota_id: inserted.id, ordem: p.ordem, tipo: p.tipo, os_id: p.os_id, colaborador_nome: p.colaborador_nome,
        ponto_nome: p.ponto_nome, embarque_texto: p.embarque_texto, latitude: p.lat, longitude: p.lng,
        distancia_km_trecho: p.distancia_km_trecho, duracao_min_trecho: p.duracao_min_trecho,
      }));
      if (paradasRows.length) {
        const { error: parErr } = await supabase.from('operacional_mapa_rotas_paradas').insert(paradasRows);
        if (parErr) throw parErr;
      }
    }

    return json({
      supervisao, data_referencia: dataReferencia, rotas: rotasParaGravar.length,
      frota: rotasParaGravar.filter((r) => r.tipo === 'frota').length,
      reembolso_km: rotasParaGravar.filter((r) => r.tipo === 'reembolso_km').length,
      sem_geocodificacao: semGeocodificacao.length,
      sem_ponto_embarque: semPontoEmbarque.length,
    });
  } catch (err) {
    console.error('[operacional-mapa-rotas]', err);
    return json({ error: (err as any)?.message || String(err) }, 500);
  }
});
