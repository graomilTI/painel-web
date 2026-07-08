import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

type SecretRow = { id?: string; integracao_id?: string; chave: string; valor?: string | null; ativo?: boolean | null };

type QueueRow = {
  id: string;
  veiculo_id: string | null;
  placa: string | null;
  motorista_atual: string | null;
  status: string | null;
  tentativas: number | null;
};

type DriverRow = Record<string, any>;
type LocalMotoristaRow = Record<string, any>;
type ContactFallback = { email: string; telefone: string };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TOKEN_VALIDITY_MS = 6 * 60 * 60 * 1000;
const TOKEN_RENEW_MARGIN_MS = 10 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
}
function cleanStr(v: unknown): string { return String(v ?? '').trim(); }
function onlyDigits(v: unknown): string { return String(v ?? '').replace(/\D/g, ''); }
function normalizeKey(v: unknown): string {
  return cleanStr(v).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
}
function normalizeName(v: unknown): string {
  return cleanStr(v).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function normalizePlate(v: unknown): string { return cleanStr(v).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7); }
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
async function readBody(req: Request) { try { return await req.json(); } catch { return {}; } }

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
  const response = await fetch(`${apiBase}/gettoken`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: formPayload({ apikey: apiKey, token: '', username, password }) });
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
function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
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
      const msg = e?.name === 'AbortError'
        ? `BFleet ${endpoint}: timeout interno de ${timeoutMs}ms`
        : `BFleet ${endpoint}: ${e?.message || String(e)}`;
      last = { ok: false, status: 0, text: msg, parsed: { error: msg, endpoint } };
      if (attempt < 2) await sleep(800);
    } finally {
      clearTimeout(timer);
    }
  }
  return last as { ok: boolean; status: number; text: string; parsed: any };
}
function extractArray(payload: any): any[] {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.result)) return payload.data.result;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload)) return payload;
  return [];
}
function isAuthError(resp: { status: number; parsed: any }) {
  return resp.status === 401 || resp.status === 403 || Number(resp.parsed?.status) === 401 || Number(resp.parsed?.status) === 403 || Number(resp.parsed?.status) === 30400;
}
function isBfleetOk(resp: { ok: boolean; parsed: any }) {
  const apiCode = resp.parsed?.data?.code;
  return resp.ok && Number(resp.parsed?.status) === 200 && apiCode === undefined;
}
function extractDriverId(payload: any): string {
  return cleanStr(payload?.data?.idConductor ?? payload?.data?.id_conductor ?? payload?.data?.id ?? payload?.idConductor ?? payload?.id_conductor ?? payload?.id);
}
async function fetchDrivers(apiBase: string, apiKey: string, token: string) {
  const resp = await bfleetCall(apiBase, 'driverGetAll', { apikey: apiKey, token });
  return { resp, rows: extractArray(resp.parsed) as DriverRow[] };
}
async function fetchVehicles(apiBase: string, apiKey: string, token: string) {
  const resp = await bfleetCall(apiBase, 'vehicleGetAll', { apikey: apiKey, token });
  return { resp, rows: extractArray(resp.parsed) as DriverRow[] };
}
function driverNameKeys(row: DriverRow): string[] {
  const nome = cleanStr(row.nombre);
  const sobrenome = cleanStr(row.apellido);
  const keys = new Set<string>();
  if (nome && sobrenome) { keys.add(normalizeName(`${nome} ${sobrenome}`)); keys.add(normalizeName(`${sobrenome} ${nome}`)); }
  if (nome) keys.add(normalizeName(nome));
  return Array.from(keys).filter(Boolean);
}
function buildDriverIndex(rows: DriverRow[]) {
  const byName = new Map<string, DriverRow>();
  for (const row of rows) {
    for (const key of driverNameKeys(row)) if (!byName.has(key)) byName.set(key, row);
  }
  return byName;
}
function buildLocalMotoristaIndex(rows: LocalMotoristaRow[]) {
  const byName = new Map<string, LocalMotoristaRow>();
  for (const row of rows || []) {
    const key = normalizeName(row.nome);
    if (key && !byName.has(key)) byName.set(key, row);
  }
  return byName;
}
function vehicleIdFromRow(row: DriverRow): string {
  return cleanStr(row.id ?? row.idvehiculo ?? row.id_vehiculo);
}
function vehiclePlateFromRow(row: DriverRow): string {
  return normalizePlate(row.patente ?? row.placa ?? row.nombre);
}
function normalizeGps(v: unknown): string { return onlyDigits(v); }
function uniqueKeys(values: unknown[]): string[] {
  const out = new Set<string>();
  for (const value of values) {
    const clean = cleanStr(value);
    const digits = normalizeGps(value);
    if (clean) out.add(clean);
    if (digits) out.add(digits);
  }
  return Array.from(out).filter(Boolean);
}
function vehicleGpsKeysFromBfleet(row: DriverRow): string[] {
  return uniqueKeys([
    row.idgps, row.idGps, row.idGPS, row.id_gps, row.gps, row.gpsId, row.gps_id,
    row.imei, row.IMEI, row.imeiGps, row.imei_gps, row.idDispositivo, row.id_dispositivo,
    row.dispositivo, row.serial, row.identificador, row.equipo, row.idEquipo, row.id_equipo,
  ]);
}
function painelVehicleGpsKeys(row: Record<string, any> | null | undefined): string[] {
  if (!row) return [];
  return uniqueKeys([
    row.bfleet_idgps, row.bfleet_id_gps, row.idgps, row.id_gps, row.gps,
    row.imei, row.imei_gps, row.rastreador_imei, row.id_rastreador,
  ]);
}
function painelVehicleDirectId(row: Record<string, any> | null | undefined): string {
  if (!row) return '';
  return cleanStr(row.bfleet_id ?? row.bfleet_idvehiculo ?? row.bfleet_id_veiculo ?? row.idvehiculo ?? row.id_vehiculo);
}
function splitDriverName(fullName: unknown) {
  const parts = cleanStr(fullName).replace(/\s+/g, ' ').split(' ').filter(Boolean);
  return { nombre: parts.shift() || '', apellido: parts.join(' ') || '' };
}
function formatDateOnly(value: unknown): string {
  const s = cleanStr(value);
  if (!s) return '';
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return s;
}
function localEmail(local: LocalMotoristaRow | null | undefined, fallback: ContactFallback) {
  return cleanStr(local?.email) || fallback.email || '';
}
function localPhone(local: LocalMotoristaRow | null | undefined, fallback: ContactFallback) {
  return onlyDigits(local?.telefone) || fallback.telefone || '';
}
function localAddress(local: LocalMotoristaRow | null | undefined) {
  return cleanStr(local?.endereco) || 'Não informado';
}
function validateLocalForCreate(local: LocalMotoristaRow | null | undefined, fallback: ContactFallback) {
  const missing: string[] = [];
  if (!local) missing.push('cadastro em frotas_motoristas');
  if (local && !localPhone(local, fallback)) missing.push('telefone');
  if (local && !localEmail(local, fallback)) missing.push('email');
  if (local && !cleanStr(local.cnh_numero)) missing.push('CNH');
  if (local && !cleanStr(local.cnh_validade)) missing.push('validade da CNH');
  return missing;
}
function createDriverPayload(params: { apiKey: string; token: string; local: LocalMotoristaRow; condutorNome: string; vehicleId: string; fallback: ContactFallback }) {
  const names = splitDriverName(params.local.nome || params.condutorNome);
  return {
    apikey: params.apiKey,
    token: params.token,
    nombre: names.nombre,
    apellido: names.apellido,
    telefono: localPhone(params.local, params.fallback),
    licencia: cleanStr(params.local.cnh_numero),
    vigencia: formatDateOnly(params.local.cnh_validade),
    direccion: localAddress(params.local),
    email: localEmail(params.local, params.fallback),
    numero: '',
    alias: cleanStr(params.condutorNome),
    identificador: '',
    cedula: onlyDigits(params.local.cpf),
    idgrupo: cleanStr(params.local.bfleet_idgrupo),
    observaciones: cleanStr(params.local.observacoes),
    idvehiculo: params.vehicleId,
  };
}
function updateDriverPayload(params: { apiKey: string; token: string; driver: DriverRow; local?: LocalMotoristaRow | null; condutorNome: string; vehicleId: string; fallback: ContactFallback }) {
  const names = splitDriverName(params.local?.nome || params.condutorNome || `${params.driver.nombre || ''} ${params.driver.apellido || ''}`);
  return {
    apikey: params.apiKey,
    token: params.token,
    idConductor: cleanStr(params.driver.id ?? params.driver.idConductor ?? params.driver.id_conductor),
    nombre: cleanStr(params.driver.nombre) || names.nombre,
    apellido: cleanStr(params.driver.apellido) || names.apellido,
    telefono: localPhone(params.local, params.fallback) || cleanStr(params.driver.telefono),
    licencia: cleanStr(params.local?.cnh_numero) || cleanStr(params.driver.licencia),
    vigencia: formatDateOnly(params.local?.cnh_validade) || cleanStr(params.driver.vigencia),
    direccion: localAddress(params.local) || cleanStr(params.driver.direccion),
    email: localEmail(params.local, params.fallback) || cleanStr(params.driver.email),
    numero: cleanStr(params.driver.numero),
    alias: cleanStr(params.driver.alias),
    identificador: cleanStr(params.driver.identificador),
    cedula: onlyDigits(params.local?.cpf) || cleanStr(params.driver.cedula),
    idgrupo: cleanStr(params.driver.idgrupo),
    observaciones: cleanStr(params.local?.observacoes) || cleanStr(params.driver.observaciones),
    idvehiculo: params.vehicleId,
  };
}
function safePayload(payload: Record<string, unknown>) {
  const { apikey: _apikey, token: _token, ...payloadSemCredenciais } = payload;
  return payloadSemCredenciais;
}
async function markErro(supabase: any, item: QueueRow, msg: string) {
  await supabase.from('frotas_bfleet_condutores_fila').update({ status: 'ERRO', erro: msg, tentativas: Number(item.tentativas || 0) + 1, updated_at: new Date().toISOString() }).eq('id', item.id);
  if (item.veiculo_id) await supabase.from('frotas_veiculos').update({ bfleet_condutor_status: 'ERRO', bfleet_condutor_erro: msg }).eq('id', item.veiculo_id);
}
async function markOk(supabase: any, item: QueueRow) {
  await supabase.from('frotas_bfleet_condutores_fila').update({ status: 'OK', erro: null, atualizado_em: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', item.id);
  if (item.veiculo_id) await supabase.from('frotas_veiculos').update({ bfleet_condutor_status: 'OK', bfleet_condutor_atualizado_em: new Date().toISOString(), bfleet_condutor_erro: null }).eq('id', item.veiculo_id);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const body = await readBody(req);
    const limit = Math.min(Number(body?.limit || 100), 200);
    const mode = cleanStr(body?.mode || 'pending');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceKey) return json({ error: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados.' }, 500);
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    if (body?.auto_associar_patrimonios !== false) {
      try { await supabase.rpc('sincronizar_frotas_veiculos_patrimonios'); } catch (_) { /* não bloqueia o envio da fila já existente */ }
    }

    const integracao = await getBfleetIntegration(supabase);
    if (!integracao?.id) return json({ error: 'Integração BFLEET_SERVICE24GPS não encontrada em TI > Integrações.' }, 400);
    const secrets = await getIntegrationSecrets(supabase, integracao.id);
    const apiBase = normalizeBaseUrl(pickSecret(secrets, 'API_BASE', 'BFLEET_BASE_URL', 'SERVICE24GPS_BASE') || integracao.base_url || 'https://api.service24gps.com');
    const apiKey = pickSecret(secrets, 'API_KEY', 'BFLEET_API_KEY', 'SERVICE24GPS_APIKEY');
    const username = pickSecret(secrets, 'USERNAME', 'USER', 'BFLEET_USERNAME', 'SERVICE24GPS_USER');
    const password = pickSecret(secrets, 'PASSWORD', 'PASS', 'BFLEET_PASSWORD', 'SERVICE24GPS_PASS');
    if (!apiKey || !username || !password) return json({ error: 'Credenciais BFleet incompletas. Cadastre API_KEY, USERNAME e PASSWORD.' }, 400);

    let token = await getValidToken({ supabase, integracaoId: integracao.id, secrets, apiBase, apiKey, username, password });

    const byPlate = new Map<string, DriverRow>();
    const byGps = new Map<string, DriverRow>();
    const byVehicleId = new Map<string, DriverRow>();
    let vehicleGetAllError = '';
    let driverGetAllError = '';
    let driversByName = new Map<string, DriverRow>();

    const { data: colaboradores } = await supabase.from('colaboradores_atuais').select('nome,email_empresa,email_pessoal,whatsapp');
    const contactByName = new Map<string, ContactFallback>();
    for (const c of (colaboradores || []) as any[]) {
      const key = normalizeName(c.nome);
      if (!key || contactByName.has(key)) continue;
      contactByName.set(key, { email: cleanStr(c.email_empresa) || cleanStr(c.email_pessoal), telefone: onlyDigits(c.whatsapp) });
    }

    const { data: motoristas } = await supabase.from('frotas_motoristas').select('nome,cpf,telefone,email,cnh_numero,cnh_validade,endereco,status,observacoes');
    const motoristasByName = buildLocalMotoristaIndex((motoristas || []) as LocalMotoristaRow[]);

    const placasFiltro = Array.isArray(body?.placas) ? body.placas.map((p: unknown) => normalizePlate(p)).filter(Boolean) : [];
    let q = supabase.from('frotas_bfleet_condutores_fila').select('*').in('status', mode === 'retry_all' ? ['PENDENTE', 'ERRO'] : ['PENDENTE']).order('tentativas', { ascending: true }).order('created_at', { ascending: true }).limit(limit);
    if (placasFiltro.length) q = q.in('placa', placasFiltro);
    const { data: fila, error: filaError } = await q;
    if (filaError) throw filaError;

    const veiculoIds = Array.from(new Set(((fila || []) as QueueRow[]).map((item) => cleanStr(item.veiculo_id)).filter(Boolean)));
    const veiculosPainelById = new Map<string, Record<string, any>>();
    if (veiculoIds.length) {
      const { data: veiculosPainel, error: veiculosPainelError } = await supabase
        .from('frotas_veiculos')
        .select('id,placa,motorista_atual,bfleet_id,bfleet_idgps,bfleet_placa,bfleet_patente,bfleet_confirmado,bfleet_condutor_status,bfleet_condutor_erro')
        .in('id', veiculoIds);
      if (veiculosPainelError) throw veiculosPainelError;
      for (const veiculo of (veiculosPainel || []) as Record<string, any>[]) {
        const id = cleanStr(veiculo.id);
        if (id) veiculosPainelById.set(id, veiculo);
      }
    }

    const precisaVehicleGetAll = ((fila || []) as QueueRow[]).some((item) => {
      const v = item.veiculo_id ? veiculosPainelById.get(cleanStr(item.veiculo_id)) : null;
      return !painelVehicleDirectId(v);
    });

    if (precisaVehicleGetAll) {
      let vehiclesResp = await fetchVehicles(apiBase, apiKey, token);
      if (isAuthError(vehiclesResp.resp)) {
        token = await getValidToken({ supabase, integracaoId: integracao.id, secrets, apiBase, apiKey, username, password, force: true });
        vehiclesResp = await fetchVehicles(apiBase, apiKey, token);
      }
      if (!vehiclesResp.resp.ok && Number(vehiclesResp.resp.parsed?.status) !== 200) {
        vehicleGetAllError = `Falha ao listar veículos BFleet (${vehiclesResp.resp.status}): ${vehiclesResp.resp.text.slice(0, 800)}`;
      } else {
        for (const row of vehiclesResp.rows) {
          const plate = vehiclePlateFromRow(row);
          if (plate && !byPlate.has(plate)) byPlate.set(plate, row);

          const vehicleId = vehicleIdFromRow(row);
          if (vehicleId && !byVehicleId.has(vehicleId)) byVehicleId.set(vehicleId, row);

          for (const gpsKey of vehicleGpsKeysFromBfleet(row)) {
            if (gpsKey && !byGps.has(gpsKey)) byGps.set(gpsKey, row);
          }
        }
      }
    }

    const driversResp = await fetchDrivers(apiBase, apiKey, token);
    if (isAuthError(driversResp.resp)) {
      token = await getValidToken({ supabase, integracaoId: integracao.id, secrets, apiBase, apiKey, username, password, force: true });
      const refreshedDriversResp = await fetchDrivers(apiBase, apiKey, token);
      if (refreshedDriversResp.resp.ok || Number(refreshedDriversResp.resp.parsed?.status) === 200) {
        driversByName = buildDriverIndex(refreshedDriversResp.rows);
      } else {
        driverGetAllError = `Falha ao listar condutores BFleet (${refreshedDriversResp.resp.status}): ${refreshedDriversResp.resp.text.slice(0, 800)}`;
      }
    } else if (driversResp.resp.ok || Number(driversResp.resp.parsed?.status) === 200) {
      driversByName = buildDriverIndex(driversResp.rows);
    } else {
      driverGetAllError = `Falha ao listar condutores BFleet (${driversResp.resp.status}): ${driversResp.resp.text.slice(0, 800)}`;
    }

    let updated = 0, created = 0, errors = 0, skipped = 0;
    const detalhes: any[] = [];
    for (const item of (fila || []) as QueueRow[]) {
      const veiculoPainel = item.veiculo_id ? veiculosPainelById.get(cleanStr(item.veiculo_id)) : null;
      const plate = normalizePlate(item.placa || veiculoPainel?.placa || veiculoPainel?.bfleet_placa || veiculoPainel?.bfleet_patente);
      const condutorNome = cleanStr(item.motorista_atual || veiculoPainel?.motorista_atual);
      const directVehicleId = painelVehicleDirectId(veiculoPainel);

      let matchMode = '';
      let veiculoBf: DriverRow | undefined;

      if (directVehicleId) {
        veiculoBf = byVehicleId.get(directVehicleId) || { id: directVehicleId, idvehiculo: directVehicleId, patente: plate };
        matchMode = byVehicleId.has(directVehicleId) ? 'bfleet_id_vehicleGetAll' : 'bfleet_id_painel';
      }

      if (!veiculoBf) {
        for (const gpsKey of painelVehicleGpsKeys(veiculoPainel)) {
          const found = byGps.get(gpsKey);
          if (found) {
            veiculoBf = found;
            matchMode = 'bfleet_idgps';
            break;
          }
        }
      }

      if (!veiculoBf && plate) {
        veiculoBf = byPlate.get(plate);
        if (veiculoBf) matchMode = 'placa';
      }

      if ((!plate && !directVehicleId) || !condutorNome) {
        skipped++;
        const msg = 'Placa/ID BFleet ou motorista vazio.';
        await markErro(supabase, item, msg);
        detalhes.push({ placa: item.placa, status: 'ERRO', erro: msg });
        continue;
      }
      if (!veiculoBf) {
        skipped++;
        const msg = vehicleGetAllError
          ? `Não localizei o veículo e o vehicleGetAll falhou: ${vehicleGetAllError}`
          : (veiculoPainel?.bfleet_confirmado
            ? 'Veículo confirmado BFleet no painel, mas não localizado por bfleet_id, bfleet_idgps nem placa no vehicleGetAll.'
            : 'Placa não encontrada no vehicleGetAll BFleet e veículo sem BFleet confirmado no painel.');
        await markErro(supabase, item, msg);
        detalhes.push({ placa: item.placa, status: 'ERRO', erro: msg });
        continue;
      }

      const vehicleId = vehicleIdFromRow(veiculoBf) || directVehicleId;
      if (!vehicleId) {
        skipped++;
        const msg = 'Veículo localizado, mas sem idvehiculo BFleet para vincular condutor.';
        await markErro(supabase, item, msg);
        detalhes.push({ placa: item.placa, status: 'ERRO', erro: msg, matchMode });
        continue;
      }
      const nameKey = normalizeName(condutorNome);
      const local = motoristasByName.get(nameKey) || null;
      const fallback = contactByName.get(nameKey) || { email: '', telefone: '' };
      let driver = driversByName.get(nameKey);

      if (!driver) {
        const missing = validateLocalForCreate(local, fallback);
        if (missing.length) {
          errors++;
          const msg = `Motorista "${condutorNome}" não existe no BFleet e não tem dados completos no painel para createDriver: ${missing.join(', ')}.`;
          await markErro(supabase, item, msg);
          detalhes.push({ placa: item.placa, motorista: condutorNome, status: 'ERRO', erro: msg, matchMode });
          continue;
        }
        const createPayload = createDriverPayload({ apiKey, token, local: local as LocalMotoristaRow, condutorNome, vehicleId, fallback });
        let createResp = await bfleetCall(apiBase, 'createDriver', createPayload);
        if (isAuthError(createResp)) {
          token = await getValidToken({ supabase, integracaoId: integracao.id, secrets, apiBase, apiKey, username, password, force: true });
          createResp = await bfleetCall(apiBase, 'createDriver', { ...createPayload, token });
        }
        if (!isBfleetOk(createResp)) {
          errors++;
          const msg = `BFleet createDriver (${createResp.status}): ${createResp.text.slice(0, 500)} | payload: ${JSON.stringify(safePayload(createPayload))}`;
          await markErro(supabase, item, msg);
          detalhes.push({ placa: item.placa, motorista: condutorNome, status: 'ERRO', erro: msg, matchMode });
          continue;
        }
        created++;
        const newId = extractDriverId(createResp.parsed);
        driver = { id: newId, ...createPayload };
        for (const key of driverNameKeys(driver)) if (!driversByName.has(key)) driversByName.set(key, driver);
      }

      const payload = updateDriverPayload({ apiKey, token, driver, local, condutorNome, vehicleId, fallback });
      if (!cleanStr(payload.idConductor)) {
        const refreshed = await fetchDrivers(apiBase, apiKey, token);
        if (refreshed.resp.ok || Number(refreshed.resp.parsed?.status) === 200) {
          const idx = buildDriverIndex(refreshed.rows);
          const refreshedDriver = idx.get(nameKey);
          if (refreshedDriver) Object.assign(payload, updateDriverPayload({ apiKey, token, driver: refreshedDriver, local, condutorNome, vehicleId, fallback }));
        }
      }

      let resp = await bfleetCall(apiBase, 'updateDriver', payload);
      if (isAuthError(resp)) {
        token = await getValidToken({ supabase, integracaoId: integracao.id, secrets, apiBase, apiKey, username, password, force: true });
        resp = await bfleetCall(apiBase, 'updateDriver', { ...payload, token });
      }
      if (isBfleetOk(resp)) {
        updated++;
        await markOk(supabase, item);
        detalhes.push({ placa: item.placa, motorista: condutorNome, status: 'OK', matchMode });
      } else {
        errors++;
        const msg = `BFleet updateDriver (${resp.status}): ${resp.text.slice(0, 500)} | payload: ${JSON.stringify(safePayload(payload))}`;
        await markErro(supabase, item, msg);
        detalhes.push({ placa: item.placa, motorista: condutorNome, status: 'ERRO', erro: msg, matchMode });
      }
    }
    return json({ ok: true, total_fila: (fila || []).length, created, updated, errors, skipped, vehicleGetAllError, driverGetAllError, detalhes });
  } catch (err) {
    const e = err as any;
    return json({ error: e?.message || String(e) }, 500);
  }
});
