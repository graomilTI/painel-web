// Preenche operacional_colaborador_base (endereço/coordenada usado pela
// Programação via colaborador_cruzamento) para colaboradores ativos que ainda
// não têm linha lá. Antes, essa tabela só tinha os 530 registros de um import
// único ("importar_relatorios_endereco_colaborador") — colaboradores criados
// depois nunca ganhavam endereço/coordenada. Reaproveita o mesmo padrão de
// geocodificação por CEP (Nominatim, 1 req/s) da função geocode-colaboradores,
// só que grava em operacional_colaborador_base (não em geocode_cache) e cobre
// TODOS os colaboradores ativos, não só os vinculados a O.S. ativa.
//
// A lista de pendentes (já deduplicada por nome_chave e já filtrada contra
// colisão com linhas existentes) vem da RPC geocode_colaborador_base_pendentes
// — deixar o Postgres calcular nome_chave evita reimplementar a normalização
// do trigger operacional_colaborador_base_set_updated_at() em JS (tentativa
// anterior divergiu em casos de borda e gerava duplicate key).
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
const ORIGEM = 'geocode_auto_colaboradores';
const BFLEET_PREFIX = 'G1000 COLAB';
const TOKEN_VALIDITY_MS = 55 * 60 * 1000;
const TOKEN_RENEW_MARGIN_MS = 5 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function cleanStr(v: unknown): string {
  return String(v ?? '').trim();
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
type SecretRow = { id?: string; integracao_id?: string; chave: string; valor: string; ativo?: boolean };

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

type Pendente = { colaborador_id: string; cpf: string; nome: string; nome_chave: string; cep: string; cidade: string; estado: string; endereco: string; bairro: string };
type BaseColaborador = {
  colaborador_id: string;
  nome: string;
  cpf: string | null;
  cidade_base: string | null;
  uf_base: string | null;
  endereco_base: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  ativo: boolean | null;
  bfleet_lugar_id?: string | null;
  bfleet_lugar_nome?: string | null;
  bfleet_lugar_hash?: string | null;
};

function normalizeKey(key: string): string {
  return cleanStr(key).toUpperCase().replace(/[^A-Z0-9_]+/g, '_');
}

function normalizeName(v: unknown): string {
  return cleanStr(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

function normalizeBaseUrl(base: string): string {
  let b = cleanStr(base).replace(/\/+$/, '');
  if (!b) return 'https://api.service24gps.com/api/v1';
  if (!/\/api\/v1$/i.test(b)) b = `${b}/api/v1`;
  return b.replace(/\/+$/, '');
}

function formPayload(payload: Record<string, unknown>) {
  const p = new URLSearchParams();
  Object.entries(payload).forEach(([k, v]) => p.append(k, String(v ?? '')));
  return p;
}

function pickSecret(secrets: Map<string, SecretRow>, ...keys: string[]): string {
  for (const key of keys) {
    const row = secrets.get(normalizeKey(key));
    const val = cleanStr(row?.valor);
    if (val) return val;
  }
  return '';
}

function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function validLatLng(lat: unknown, lng: unknown): boolean {
  const la = toNumOrNull(lat), lo = toNumOrNull(lng);
  return la !== null && lo !== null && la >= -34 && la <= 6 && lo >= -75 && lo <= -30;
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function upsertSecret(supabase: any, integracaoId: string, chave: string, valor: string, descricao: string, sensivel = true) {
  const payload = { integracao_id: integracaoId, chave: normalizeKey(chave), valor, descricao, sensivel, ativo: true, updated_at: new Date().toISOString() };
  const { error } = await supabase.from('ti_integracao_segredos').upsert(payload, { onConflict: 'integracao_id,chave' });
  if (error) {
    const { data: existing } = await supabase.from('ti_integracao_segredos').select('id').eq('integracao_id', integracaoId).eq('chave', payload.chave).maybeSingle();
    if (existing?.id) {
      const upd = await supabase.from('ti_integracao_segredos').update(payload).eq('id', existing.id);
      if (upd.error) throw upd.error;
    } else {
      const ins = await supabase.from('ti_integracao_segredos').insert(payload);
      if (ins.error) throw ins.error;
    }
  }
}

async function getBfleetIntegration(supabase: any) {
  let { data, error } = await supabase.from('ti_integracoes').select('*').eq('codigo', 'BFLEET_SERVICE24GPS').eq('ativo', true).maybeSingle();
  if (error) throw error;
  if (data) return data;
  const res = await supabase.from('ti_integracoes').select('*').ilike('base_url', '%service24gps%').eq('ativo', true).limit(1).maybeSingle();
  if (res.error) throw res.error;
  return res.data;
}

async function getIntegrationSecrets(supabase: any, integracaoId: string) {
  const { data, error } = await supabase.from('ti_integracao_segredos').select('id,integracao_id,chave,valor,ativo').eq('integracao_id', integracaoId).eq('ativo', true);
  if (error) throw error;
  const map = new Map<string, SecretRow>();
  for (const row of (data || []) as SecretRow[]) map.set(normalizeKey(row.chave), row);
  return map;
}

async function requestToken(apiBase: string, apiKey: string, username: string, password: string) {
  const response = await fetch(`${apiBase}/gettoken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formPayload({ apikey: apiKey, token: '', username, password }),
  });
  const text = await response.text();
  let parsed: any; try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  if (!response.ok || !parsed?.data) throw new Error(`Falha ao gerar token BFleet/Service24GPS (${response.status}): ${text.slice(0, 600)}`);
  return cleanStr(parsed.data);
}

async function getValidToken(params: { supabase: any; integracaoId: string; secrets: Map<string, SecretRow>; apiBase: string; apiKey: string; username: string; password: string; force?: boolean }) {
  const savedToken = pickSecret(params.secrets, 'TOKEN', 'BFLEET_TOKEN', 'SERVICE24GPS_TOKEN');
  const expires = Number(pickSecret(params.secrets, 'TOKEN_EXPIRES', 'BFLEET_TOKEN_EXPIRES', 'SERVICE24GPS_TOKEN_EXPIRES') || 0);
  if (!params.force && savedToken && Number.isFinite(expires) && Date.now() + TOKEN_RENEW_MARGIN_MS < expires) return savedToken;
  const token = await requestToken(params.apiBase, params.apiKey, params.username, params.password);
  const newExpires = String(Date.now() + TOKEN_VALIDITY_MS);
  await upsertSecret(params.supabase, params.integracaoId, 'TOKEN', token, 'Token BFleet/Service24GPS gerado automaticamente pela Edge Function', true);
  await upsertSecret(params.supabase, params.integracaoId, 'TOKEN_EXPIRES', newExpires, 'Vencimento do TOKEN BFleet em milissegundos (epoch)', false);
  await upsertSecret(params.supabase, params.integracaoId, 'BFLEET_TOKEN', token, 'Token BFleet/Service24GPS gerado automaticamente pela Edge Function', true);
  await upsertSecret(params.supabase, params.integracaoId, 'BFLEET_TOKEN_EXPIRES', newExpires, 'Vencimento do BFLEET_TOKEN em milissegundos (epoch)', false);
  return token;
}

async function bfleetCall(apiBase: string, endpoint: string, payload: Record<string, unknown>, timeoutMs = 25000) {
  let last: { ok: boolean; status: number; text: string; parsed: any } | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${apiBase}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formPayload(payload),
        signal: controller.signal,
      });
      const text = await response.text();
      let parsed: any; try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
      return { ok: response.ok, status: response.status, text, parsed };
    } catch (err) {
      const e = err as any;
      const msg = e?.name === 'AbortError' ? `BFleet ${endpoint}: timeout interno de ${timeoutMs}ms` : `BFleet ${endpoint}: ${e?.message || String(e)}`;
      last = { ok: false, status: 0, text: msg, parsed: { error: msg, endpoint } };
      if (attempt < 2) await sleep(800);
    } finally {
      clearTimeout(timer);
    }
  }
  return last as { ok: boolean; status: number; text: string; parsed: any };
}

function isAuthError(resp: { status: number; parsed: any }) {
  return resp.status === 401 || resp.status === 403 || Number(resp.parsed?.status) === 401 || Number(resp.parsed?.status) === 403 || Number(resp.parsed?.status) === 30400;
}

function isBfleetOk(resp: { ok: boolean; parsed: any }) {
  const apiCode = resp.parsed?.data?.code;
  return resp.ok && Number(resp.parsed?.status) === 200 && apiCode === undefined;
}

function extractPlaces(payload: any): any[] {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.result)) return payload.data.result;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload)) return payload;
  return [];
}

function placeId(row: any): string {
  return cleanStr(row?.idLugar ?? row?.idlugar ?? row?.id_lugar ?? row?.id);
}

function placeName(row: any): string {
  return cleanStr(row?.nombre ?? row?.nome ?? row?.name);
}

function localPlaceName(row: BaseColaborador): string {
  const id = cleanStr(row.colaborador_id).slice(0, 8).toUpperCase();
  const nome = cleanStr(row.nome).replace(/\s+/g, ' ').slice(0, 74);
  return `${BFLEET_PREFIX} ${id} - ${nome}`;
}

function buildPlacePayload(row: BaseColaborador, icono: string) {
  const lat = toNumOrNull(row.latitude);
  const lng = toNumOrNull(row.longitude);
  return {
    nombre: localPlaceName(row),
    direccion: cleanStr(row.endereco_base) || `${cleanStr(row.cidade_base)} ${cleanStr(row.uf_base)}`.trim() || cleanStr(row.nome),
    latitud: lat,
    longitud: lng,
    descripcion: `Colaborador ${cleanStr(row.nome)}${cleanStr(row.cpf) ? ` | CPF ${cleanStr(row.cpf)}` : ''}`,
    telefono: '',
    email: '',
    solo_mi_usuario: '0',
    icono,
  };
}

async function fetchPlaces(apiBase: string, apiKey: string, token: string) {
  const resp = await bfleetCall(apiBase, 'getPlaces', { apikey: apiKey, token });
  return { resp, rows: extractPlaces(resp.parsed) };
}

async function syncBfleetPlaces(supabase: any, body: any) {
  if (body?.bfleet_lugares === false) return { habilitado: false, motivo: 'desativado_no_payload' };
  const integracao = await getBfleetIntegration(supabase);
  if (!integracao?.id) return { habilitado: false, motivo: 'integracao_bfleet_nao_configurada' };
  const secrets = await getIntegrationSecrets(supabase, integracao.id);
  const apiBase = normalizeBaseUrl(cleanStr(integracao.base_url) || pickSecret(secrets, 'BASE_URL', 'API_BASE', 'BFLEET_BASE_URL'));
  const apiKey = pickSecret(secrets, 'APIKEY', 'API_KEY', 'BFLEET_APIKEY', 'SERVICE24GPS_APIKEY');
  const username = pickSecret(secrets, 'USERNAME', 'USER', 'BFLEET_USERNAME', 'SERVICE24GPS_USERNAME');
  const password = pickSecret(secrets, 'PASSWORD', 'PASS', 'BFLEET_PASSWORD', 'SERVICE24GPS_PASSWORD');
  if (!apiKey || !username || !password) return { habilitado: false, motivo: 'credenciais_bfleet_incompletas' };

  let token = await getValidToken({ supabase, integracaoId: integracao.id, secrets, apiBase, apiKey, username, password });
  let placesResp = await fetchPlaces(apiBase, apiKey, token);
  if (isAuthError(placesResp.resp)) {
    token = await getValidToken({ supabase, integracaoId: integracao.id, secrets, apiBase, apiKey, username, password, force: true });
    placesResp = await fetchPlaces(apiBase, apiKey, token);
  }
  if (!isBfleetOk(placesResp.resp)) throw new Error(`BFleet getPlaces: ${placesResp.resp.text.slice(0, 600)}`);

  const byId = new Map<string, any>();
  const byName = new Map<string, any>();
  for (const place of placesResp.rows) {
    const id = placeId(place);
    const name = normalizeName(placeName(place));
    if (id) byId.set(id, place);
    if (name && !byName.has(name)) byName.set(name, place);
  }

  const limite = Math.max(1, Math.min(500, Number(body?.bfleet_limite) || 150));
  const icono = cleanStr(body?.bfleet_icono) || '/images/Lugares/new_596_office_building.png';
  const { data: ativos, error: ativosErr } = await supabase
    .from('operacional_colaborador_base')
    .select('colaborador_id,nome,cpf,cidade_base,uf_base,endereco_base,latitude,longitude,ativo,bfleet_lugar_id,bfleet_lugar_nome,bfleet_lugar_hash')
    .eq('ativo', true)
    .not('endereco_base', 'is', null)
    .limit(limite);
  if (ativosErr) throw ativosErr;

  let criados = 0, atualizados = 0, semCoordenada = 0, semMudanca = 0, falhas = 0;
  const falhasDetalhe: any[] = [];
  for (const row of ((ativos || []) as BaseColaborador[])) {
    if (!validLatLng(row.latitude, row.longitude)) {
      semCoordenada++;
      continue;
    }
    const payload = buildPlacePayload(row, icono);
    const hash = await sha256(JSON.stringify(payload));
    const existing = (row.bfleet_lugar_id && byId.get(row.bfleet_lugar_id)) || byName.get(normalizeName(payload.nombre));
    const idExistente = existing ? placeId(existing) : '';
    if (idExistente && row.bfleet_lugar_hash === hash && row.bfleet_lugar_id === idExistente) {
      semMudanca++;
      continue;
    }

    const endpoint = idExistente ? 'updatePlace' : 'createPlace';
    const reqPayload = idExistente
      ? { apikey: apiKey, token, idLugar: idExistente, ...payload }
      : { apikey: apiKey, token, ...payload };
    const resp = await bfleetCall(apiBase, endpoint, reqPayload);
    if (!isBfleetOk(resp)) {
      falhas++;
      falhasDetalhe.push({ colaborador_id: row.colaborador_id, nome: row.nome, endpoint, erro: resp.text.slice(0, 400) });
      await supabase.from('operacional_colaborador_base').update({
        bfleet_lugar_sync_status: 'ERRO',
        bfleet_lugar_sync_error: resp.text.slice(0, 1000),
        bfleet_lugar_sync_em: new Date().toISOString(),
      }).eq('colaborador_id', row.colaborador_id);
      continue;
    }

    const idLugar = idExistente || cleanStr(resp.parsed?.data?.idLugar ?? resp.parsed?.data?.id_lugar ?? resp.parsed?.data?.id ?? resp.parsed?.data);
    await supabase.from('operacional_colaborador_base').update({
      bfleet_lugar_id: idLugar || null,
      bfleet_lugar_nome: payload.nombre,
      bfleet_lugar_hash: hash,
      bfleet_lugar_payload: payload,
      bfleet_lugar_sync_status: idExistente ? 'ATUALIZADO' : 'CRIADO',
      bfleet_lugar_sync_error: null,
      bfleet_lugar_sync_em: new Date().toISOString(),
    }).eq('colaborador_id', row.colaborador_id);
    if (idExistente) atualizados++; else criados++;
  }

  const { data: limparRows, error: limparErr } = await supabase
    .from('operacional_colaborador_base')
    .select('colaborador_id,nome,bfleet_lugar_id')
    .not('bfleet_lugar_id', 'is', null)
    .or('ativo.is.false,endereco_base.is.null,latitude.is.null,longitude.is.null')
    .limit(200);
  if (limparErr) throw limparErr;
  let removidos = 0;
  for (const row of (limparRows || []) as any[]) {
    const idLugar = cleanStr(row.bfleet_lugar_id);
    if (!idLugar) continue;
    const resp = await bfleetCall(apiBase, 'deletePlace', { apikey: apiKey, token, idLugar });
    if (isBfleetOk(resp)) {
      removidos++;
      await supabase.from('operacional_colaborador_base').update({
        bfleet_lugar_id: null,
        bfleet_lugar_nome: null,
        bfleet_lugar_hash: null,
        bfleet_lugar_payload: null,
        bfleet_lugar_sync_status: 'REMOVIDO',
        bfleet_lugar_sync_error: null,
        bfleet_lugar_sync_em: new Date().toISOString(),
      }).eq('colaborador_id', row.colaborador_id);
    }
  }

  const atualizadosCoord = await refreshCoordsFromBfleet(supabase, apiBase, apiKey, token);
  return { habilitado: true, criados, atualizados, removidos, sem_coordenada: semCoordenada, sem_mudanca: semMudanca, falhas, falhas_detalhe: falhasDetalhe.slice(0, 10), coordenadas_retornadas: atualizadosCoord };
}

async function safeSyncBfleetPlaces(supabase: any, body: any) {
  try {
    return await syncBfleetPlaces(supabase, body);
  } catch (err) {
    console.error('[geocode-colaborador-base] bfleet lugares', err);
    return { habilitado: true, erro: (err as any)?.message || String(err) };
  }
}

async function refreshCoordsFromBfleet(supabase: any, apiBase: string, apiKey: string, token: string) {
  const placesResp = await fetchPlaces(apiBase, apiKey, token);
  if (!isBfleetOk(placesResp.resp)) return 0;
  const byId = new Map<string, any>();
  for (const p of placesResp.rows) {
    const id = placeId(p);
    if (id) byId.set(id, p);
  }
  const { data, error } = await supabase
    .from('operacional_colaborador_base')
    .select('colaborador_id,bfleet_lugar_id')
    .not('bfleet_lugar_id', 'is', null)
    .limit(1000);
  if (error) throw error;
  let atualizados = 0;
  for (const row of (data || []) as any[]) {
    const p = byId.get(cleanStr(row.bfleet_lugar_id));
    const lat = toNumOrNull(p?.latitud ?? p?.latitude ?? p?.lat);
    const lng = toNumOrNull(p?.longitud ?? p?.longitude ?? p?.lng ?? p?.lon);
    if (!validLatLng(lat, lng)) continue;
    const upd = await supabase.from('operacional_colaborador_base').update({ latitude: lat, longitude: lng }).eq('colaborador_id', row.colaborador_id);
    if (!upd.error) atualizados++;
  }
  return atualizados;
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

    // 1) Pendentes já deduplicados/filtrados pelo banco (ver RPC).
    const { data: pendentesRaw, error: pendErr } = await supabase.rpc('geocode_colaborador_base_pendentes');
    if (pendErr) throw pendErr;
    const faltantes: Pendente[] = ((pendentesRaw || []) as any[]).map((r) => ({
      colaborador_id: r.colaborador_id, cpf: r.cpf, nome: r.nome, nome_chave: r.nome_chave,
      cep: normalizeCep(r.cep), cidade: cleanStr(r.cidade), estado: cleanStr(r.estado),
      endereco: cleanStr(r.endereco), bairro: cleanStr(r.bairro),
    }));
    if (!faltantes.length) {
      const bfleet_lugares = await safeSyncBfleetPlaces(supabase, body);
      return json({ faltantes: 0, geocodificados_novo: 0, gravados: 0, bfleet_lugares });
    }

    // 2) Cache existente (por CEP) — evita regeocodificar quem já foi resolvido
    // para outro colaborador com o mesmo CEP.
    const chavesNecessarias = [...new Set(faltantes.map((c) => (c.cep.length === 8 ? c.cep : `cidade:${c.cidade}|${c.estado}`)))];
    const cepKeys = chavesNecessarias.filter((k) => !k.startsWith('cidade:'));
    const { data: cacheRaw, error: cacheErr } = await supabase
      .from('geocode_cache')
      .select('chave,tipo,latitude,longitude,endereco_resolvido,status,atualizado_em')
      .in('chave', cepKeys.length ? cepKeys : ['__none__']);
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

    // 3) Geocodifica (até `limite` chaves novas, 1 req/s) as que faltam no cache.
    const pendentes = chavesNecessarias.filter((k) => {
      const chaveCep = k.startsWith('cidade:') ? null : k;
      return chaveCep ? (!cacheOk.has(chaveCep) && !cacheErroRecente.has(chaveCep)) : true; // cidade: sempre tenta (não tem cache dedicado)
    });

    let lastCallAt = 0;
    async function throttledSearch(params: Record<string, string>): Promise<GeoResult> {
      const wait = lastCallAt + NOMINATIM_DELAY_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastCallAt = Date.now();
      return nominatimSearch(params);
    }

    const lote = pendentes.slice(0, limite);
    let geocodificadosNovo = 0;
    for (const chave of lote) {
      if (chave.startsWith('cidade:')) {
        const [cidade, estado] = chave.slice(7).split('|');
        const resultado = await throttledSearch({ city: cidade, state: estado });
        if (resultado) {
          cacheOk.set(chave, resultado);
          geocodificadosNovo++;
        }
        continue;
      }
      const info = faltantes.find((c) => c.cep === chave);
      let resultado = await throttledSearch({ postalcode: formatCepBR(chave) });
      let tipo: 'cep' | 'cidade' = 'cep';
      if (!resultado && info?.cidade && info?.estado) {
        resultado = await throttledSearch({ city: info.cidade, state: info.estado });
        tipo = 'cidade';
      }
      const row = resultado
        ? { chave, tipo, latitude: resultado.lat, longitude: resultado.lng, endereco_resolvido: resultado.display, status: 'ok', atualizado_em: new Date().toISOString() }
        : { chave, tipo: 'cep', latitude: null, longitude: null, endereco_resolvido: null, status: 'erro', atualizado_em: new Date().toISOString() };
      const { error: upErr } = await supabase.from('geocode_cache').upsert(row, { onConflict: 'chave' });
      if (upErr) throw upErr;
      if (resultado) { cacheOk.set(chave, resultado); geocodificadosNovo++; }
    }

    // 4) Grava operacional_colaborador_base para os faltantes cuja chave já
    // está resolvida (cache antigo + o que acabou de ser geocodificado nesta
    // execução) — não só o lote geocodificado agora. nome_chave já veio
    // deduplicado da RPC, então não deve colidir; mesmo assim grava em lotes
    // pequenos para uma linha problemática não travar as demais.
    const linhas = faltantes
      .map((c) => {
        const chave = c.cep.length === 8 ? c.cep : `cidade:${c.cidade}|${c.estado}`;
        const geo = cacheOk.get(chave);
        if (!geo) return null;
        return {
          colaborador_id: c.colaborador_id,
          nome: c.nome,
          nome_chave: c.nome_chave,
          cpf: c.cpf,
          cidade_base: c.cidade || null,
          uf_base: (c.estado || '').slice(0, 2) || null,
          endereco_base: [c.endereco, c.bairro, c.cidade, c.estado].filter(Boolean).join(', ') || geo.display || null,
          latitude: geo.lat,
          longitude: geo.lng,
          ativo: true,
          origem: ORIGEM,
        };
      })
      .filter(Boolean) as any[];

    let gravados = 0;
    const falhas: { colaborador_id: string; nome: string; erro: string }[] = [];
    const TAM_LOTE_GRAVACAO = 20;
    for (let i = 0; i < linhas.length; i += TAM_LOTE_GRAVACAO) {
      const chunk = linhas.slice(i, i + TAM_LOTE_GRAVACAO);
      const { error: insErr } = await supabase.from('operacional_colaborador_base').upsert(chunk, { onConflict: 'colaborador_id' });
      if (insErr) {
        for (const row of chunk) falhas.push({ colaborador_id: row.colaborador_id, nome: row.nome, erro: insErr.message });
      } else {
        gravados += chunk.length;
      }
    }

    const bfleet_lugares = await safeSyncBfleetPlaces(supabase, body);

    return json({
      faltantes: faltantes.length,
      chaves_pendentes_antes: pendentes.length,
      geocodificados_novo: geocodificadosNovo,
      gravados,
      falhas_gravacao: falhas.length,
      falhas_detalhe: falhas.slice(0, 10),
      restantes: Math.max(0, pendentes.length - lote.length),
      bfleet_lugares,
    });
  } catch (err) {
    console.error('[geocode-colaborador-base]', err);
    return json({ error: (err as any)?.message || String(err) }, 500);
  }
});
