import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

type SecretRow = {
  id?: string;
  integracao_id?: string;
  chave: string;
  valor?: string | null;
  ativo?: boolean | null;
};

type PositionApi = Record<string, any>;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TOKEN_VALIDITY_MS = 6 * 60 * 60 * 1000; // Service24GPS token: tratar como 6h
const TOKEN_RENEW_MARGIN_MS = 10 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function cleanStr(v: unknown): string {
  return String(v ?? '').trim();
}

function normalizeKey(v: unknown): string {
  return cleanStr(v)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizePlate(v: unknown): string {
  return cleanStr(v).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
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

async function readBody(req: Request) {
  try { return await req.json(); } catch { return {}; }
}

function pickSecret(secrets: Map<string, SecretRow>, ...keys: string[]): string {
  for (const key of keys) {
    const row = secrets.get(normalizeKey(key));
    const val = cleanStr(row?.valor);
    if (val) return val;
  }
  return '';
}

async function upsertSecret(supabase: any, integracaoId: string, chave: string, valor: string, descricao: string, sensivel = true) {
  const payload = {
    integracao_id: integracaoId,
    chave: normalizeKey(chave),
    valor,
    descricao,
    sensivel,
    ativo: true,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('ti_integracao_segredos')
    .upsert(payload, { onConflict: 'integracao_id,chave' });

  if (error) {
    const { data: existing } = await supabase
      .from('ti_integracao_segredos')
      .select('id')
      .eq('integracao_id', integracaoId)
      .eq('chave', payload.chave)
      .maybeSingle();

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
  let { data, error } = await supabase
    .from('ti_integracoes')
    .select('*')
    .eq('codigo', 'BFLEET_SERVICE24GPS')
    .eq('ativo', true)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const res = await supabase
    .from('ti_integracoes')
    .select('*')
    .ilike('base_url', '%service24gps%')
    .eq('ativo', true)
    .limit(1)
    .maybeSingle();

  if (res.error) throw res.error;
  return res.data;
}

async function getIntegrationSecrets(supabase: any, integracaoId: string) {
  const { data, error } = await supabase
    .from('ti_integracao_segredos')
    .select('id,integracao_id,chave,valor,ativo')
    .eq('integracao_id', integracaoId)
    .eq('ativo', true);

  if (error) throw error;
  const map = new Map<string, SecretRow>();
  for (const row of (data || []) as SecretRow[]) {
    map.set(normalizeKey(row.chave), row);
  }
  return map;
}

async function requestToken(apiBase: string, apiKey: string, username: string, password: string) {
  const url = `${apiBase}/gettoken`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formPayload({ apikey: apiKey, token: '', username, password }),
  });

  const text = await response.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }

  if (!response.ok || !parsed?.data) {
    throw new Error(`Falha ao gerar token BFleet/Service24GPS (${response.status}): ${text.slice(0, 600)}`);
  }

  return cleanStr(parsed.data);
}

async function getValidToken(params: {
  supabase: any;
  integracaoId: string;
  secrets: Map<string, SecretRow>;
  apiBase: string;
  apiKey: string;
  username: string;
  password: string;
  force?: boolean;
}) {
  const savedToken = pickSecret(params.secrets, 'TOKEN', 'BFLEET_TOKEN', 'SERVICE24GPS_TOKEN');
  const expiresRaw = pickSecret(params.secrets, 'TOKEN_EXPIRES', 'BFLEET_TOKEN_EXPIRES', 'SERVICE24GPS_TOKEN_EXPIRES');
  const expires = Number(expiresRaw || 0);
  const now = Date.now();

  if (!params.force && savedToken && Number.isFinite(expires) && now + TOKEN_RENEW_MARGIN_MS < expires) {
    return savedToken;
  }

  const token = await requestToken(params.apiBase, params.apiKey, params.username, params.password);
  const newExpires = String(Date.now() + TOKEN_VALIDITY_MS);

  await upsertSecret(params.supabase, params.integracaoId, 'TOKEN', token, 'Token BFleet/Service24GPS gerado automaticamente pela Edge Function', true);
  await upsertSecret(params.supabase, params.integracaoId, 'TOKEN_EXPIRES', newExpires, 'Vencimento do TOKEN BFleet em milissegundos (epoch)', false);
  await upsertSecret(params.supabase, params.integracaoId, 'BFLEET_TOKEN', token, 'Token BFleet/Service24GPS gerado automaticamente pela Edge Function', true);
  await upsertSecret(params.supabase, params.integracaoId, 'BFLEET_TOKEN_EXPIRES', newExpires, 'Vencimento do BFLEET_TOKEN em milissegundos (epoch)', false);

  return token;
}

async function fetchPositions(apiBase: string, apiKey: string, token: string) {
  const url = `${apiBase}/getdata`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formPayload({ apikey: apiKey, token, UseUTCDate: '0', sensores: '0' }),
  });

  const text = await response.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }

  return { ok: response.ok, status: response.status, text, parsed };
}

function extractPositions(payload: any): PositionApi[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.resultado)) return payload.resultado;
  if (payload.data && Array.isArray(payload.data.data)) return payload.data.data;
  return [];
}

function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toBool(v: unknown): boolean | null {
  if (v === null || v === undefined || v === '') return null;
  const s = cleanStr(v).toLowerCase();
  if (s === '1' || s === 'true' || s === 'on' || s === 'yes' || s === 'sim') return true;
  if (s === '0' || s === 'false' || s === 'off' || s === 'no' || s === 'nao' || s === 'não') return false;
  return Boolean(v);
}

function parseReportDate(v: unknown): string | null {
  const s = cleanStr(v);
  if (!s) return null;

  // BFleet/Service24GPS retorna ReportDate sem timezone, mas no horário local
  // de Brasília (America/Sao_Paulo, UTC-3, sem horário de verão desde 2019) —
  // confirmado cruzando ReportDate com InsertionDate e o campo "Gmt":"-3" do
  // getdata. Sem o offset explícito, new Date() trata a string como UTC e
  // grava reportado_em ~3h no passado, fazendo todo veículo parecer "sem sinal".

  // formato "YYYY-MM-DD HH:mm:ss" ou "YYYY-MM-DDTHH:mm:ss" (formato real do getdata)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (iso) {
    const [, yyyy, mm, dd, hh, min, sec] = iso;
    const date = new Date(`${yyyy}-${mm}-${dd}T${hh.padStart(2, '0')}:${min}:${(sec || '00')}-03:00`);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  // formato "DD/MM/YYYY HH:mm:ss" ou "DD/MM/YYYY HH:mm" (fallback, caso a API mude)
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (br) {
    const [, dd, mm, yyyy, hh, min, sec] = br;
    const date = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T${hh.padStart(2, '0')}:${min}:${(sec || '00')}-03:00`);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  const direct = new Date(s);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();

  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    await readBody(req);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceKey) {
      return json({ error: 'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados na Edge Function.' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const integration = await getBfleetIntegration(supabase);
    if (!integration?.id) {
      return json({ error: 'Integração BFleet/Service24GPS não encontrada em TI > Integrações. Crie BFLEET_SERVICE24GPS ou informe base_url contendo service24gps.' }, 400);
    }

    const secrets = await getIntegrationSecrets(supabase, integration.id);
    const apiBase = normalizeBaseUrl(
      pickSecret(secrets, 'API_BASE', 'BFLEET_BASE_URL', 'SERVICE24GPS_BASE') || cleanStr(integration.base_url)
    );
    const apiKey = pickSecret(secrets, 'API_KEY', 'BFLEET_API_KEY', 'SERVICE24GPS_APIKEY');
    const username = pickSecret(secrets, 'USERNAME', 'USER', 'BFLEET_USERNAME', 'SERVICE24GPS_USER');
    const password = pickSecret(secrets, 'PASSWORD', 'PASS', 'BFLEET_PASSWORD', 'SERVICE24GPS_PASS');

    if (!apiKey || !username || !password) {
      return json({
        error: 'Credenciais BFleet incompletas. Cadastre em TI > Integrações: API_KEY, USERNAME e PASSWORD.',
        missing: { API_KEY: !apiKey, USERNAME: !username, PASSWORD: !password },
      }, 400);
    }

    let token = await getValidToken({ supabase, integracaoId: integration.id, secrets, apiBase, apiKey, username, password });
    let posResp = await fetchPositions(apiBase, apiKey, token);

    if (posResp.status === 401 || posResp.status === 403 || Number(posResp.parsed?.status) === 401 || Number(posResp.parsed?.status) === 403) {
      token = await getValidToken({ supabase, integracaoId: integration.id, secrets, apiBase, apiKey, username, password, force: true });
      posResp = await fetchPositions(apiBase, apiKey, token);
    }

    if (!posResp.ok || Number(posResp.parsed?.status || 200) !== 200) {
      return json({
        error: `Erro ao consultar BFleet/Service24GPS getdata (${posResp.status}).`,
        api_status: posResp.parsed?.status,
        sample: posResp.text.slice(0, 900),
      }, 502);
    }

    const rows = extractPositions(posResp.parsed);

    const { data: veiculos, error: vErr } = await supabase
      .from('frotas_veiculos')
      .select('id,placa,placa_normalizada,motorista_atual,bfleet_condutor');
    if (vErr) throw vErr;

    const veiculoIdByPlate = new Map<string, string>();
    const veiculoInfoByPlate = new Map<string, { motorista_atual: string; bfleet_condutor: string }>();
    for (const v of (veiculos || []) as Array<{ id: string; placa: string | null; placa_normalizada: string | null; motorista_atual: string | null; bfleet_condutor: string | null }>) {
      const plate = normalizePlate(v.placa_normalizada || v.placa);
      if (!plate) continue;
      veiculoIdByPlate.set(plate, v.id);
      veiculoInfoByPlate.set(plate, {
        motorista_atual: cleanStr(v.motorista_atual),
        bfleet_condutor: cleanStr(v.bfleet_condutor),
      });
    }

    const nowIso = new Date().toISOString();
    const upsertRows: Record<string, unknown>[] = [];
    let semPlaca = 0;

    for (const row of rows) {
      const placa = normalizePlate(row.UnitPlate ?? row.unitplate ?? row.placa ?? row.Placa);
      if (!placa) { semPlaca += 1; continue; }

      const info = veiculoInfoByPlate.get(placa);
      const motoristaBfleet = cleanStr(row.Conductor ?? row.conductor ?? row.motorista);
      const motorista = motoristaBfleet || info?.bfleet_condutor || info?.motorista_atual || '';

      upsertRows.push({
        placa,
        veiculo_id: veiculoIdByPlate.get(placa) || null,
        idgps: cleanStr(row.GpsIdentif ?? row.gpsidentif ?? row.idgps),
        latitude: toNumOrNull(row.Latitude ?? row.latitude),
        longitude: toNumOrNull(row.Longitude ?? row.longitude),
        velocidade_kmh: toNumOrNull(row.GpsSpeed ?? row.gpsspeed ?? row.velocidade),
        direcao: toNumOrNull(row.Direction ?? row.direction ?? row.direcao),
        ignicao: toBool(row.Ignition ?? row.ignition ?? row.ignicao),
        endereco: cleanStr(row.Domicilio ?? row.domicilio ?? row.endereco) || null,
        motorista: motorista || null,
        sinal: cleanStr(row.Senal ?? row.senal ?? row.sinal) || null,
        reportado_em: parseReportDate(row.ReportDate ?? row.reportdate),
        atualizado_em: nowIso,
      });
    }

    let atualizados = 0;
    for (let i = 0; i < upsertRows.length; i += 400) {
      const part = upsertRows.slice(i, i + 400);
      const { error } = await supabase.from('frotas_posicoes').upsert(part, { onConflict: 'placa' });
      if (error) throw error;
      atualizados += part.length;
    }

    return json({
      ok: true,
      total: rows.length,
      atualizados,
      sem_placa: semPlaca,
      gerado_em: nowIso,
    });
  } catch (err) {
    console.error('[bfleet-posicoes]', err);
    return json({ error: err?.message || String(err) }, 500);
  }
});
