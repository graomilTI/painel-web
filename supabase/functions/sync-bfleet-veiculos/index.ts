import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

type SecretRow = {
  id?: string;
  integracao_id?: string;
  chave: string;
  valor?: string | null;
  ativo?: boolean | null;
};

type VehicleApi = Record<string, any>;

type PanelVehicle = {
  id: string;
  placa: string | null;
  renavam?: string | null;
  empresa?: string | null;
  rastreador_bfleet?: boolean | null;
};

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

// Chave de cruzamento tolerante: a 5ª posição da placa Mercosul (AAA1A23) é uma letra que
// corresponde ao dígito da placa antiga (AAA1023), A=0 ... J=9. Ex.: AXT5G42 <-> AXT5642.
const MERCOSUL_LETTER_TO_DIGIT: Record<string, string> = {
  A: '0', B: '1', C: '2', D: '3', E: '4', F: '5', G: '6', H: '7', I: '8', J: '9',
};

function plateKey(plate: string): string {
  if (plate.length !== 7) return plate;
  const digit = MERCOSUL_LETTER_TO_DIGIT[plate[4]];
  return digit ? plate.slice(0, 4) + digit + plate.slice(5) : plate;
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
    // fallback para bases onde o índice único ainda não existe
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

async function fetchVehicleGetAll(apiBase: string, apiKey: string, token: string) {
  const url = `${apiBase}/vehicleGetAll`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formPayload({ apikey: apiKey, token }),
  });

  const text = await response.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }

  return { ok: response.ok, status: response.status, text, parsed };
}

function extractVehicles(payload: any): VehicleApi[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.vehicles)) return payload.vehicles;
  if (Array.isArray(payload.veiculos)) return payload.veiculos;
  if (Array.isArray(payload.resultado)) return payload.resultado;
  if (payload.data && Array.isArray(payload.data.data)) return payload.data.data;
  return [];
}

function getVehiclePlate(row: VehicleApi): string {
  return normalizePlate(row.patente ?? row.placa ?? row.plate ?? row.license_plate ?? row.matricula ?? row.nome ?? row.nombre);
}

function getTrackerId(row: VehicleApi): string {
  return cleanStr(row.idgps ?? row.gps_id ?? row.id_gps ?? row.device_id ?? row.numero_serie ?? row.serial ?? row.id ?? '');
}

function getVehicleName(row: VehicleApi): string {
  return cleanStr(row.nombre ?? row.nome ?? row.name ?? '');
}

function isValidTracker(v: unknown): boolean {
  const t = cleanStr(v);
  if (!t) return false;
  const low = t.toLowerCase();
  return !(t === '-1' || low === 'null' || low === 'undefined' || low === '0');
}

function publicBfleetRow(row: VehicleApi) {
  return {
    placa: getVehiclePlate(row),
    nome: getVehicleName(row),
    idgps: getTrackerId(row),
    grupo: cleanStr(row.grupo),
    marca: cleanStr(row.marca),
    modelo: cleanStr(row.modelo),
    gatewayip: cleanStr(row.gatewayip),
    condutor: cleanStr(row.conductor ?? row.condutor),
  };
}

async function saveDiagnostics(supabase: any, syncId: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  const payload = rows.map((r) => ({ ...r, sync_id: syncId, created_at: new Date().toISOString() }));
  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await supabase.from('frotas_bfleet_diagnostico').insert(payload.slice(i, i + 500));
    if (error) {
      console.warn('[sync-bfleet-veiculos] falha ao salvar diagnostico', error.message);
      return;
    }
  }
}

async function updateInBatches(supabase: any, ids: string[], patch: Record<string, unknown>, batchSize = 400) {
  for (let i = 0; i < ids.length; i += batchSize) {
    const part = ids.slice(i, i + batchSize);
    const { error } = await supabase.from('frotas_veiculos').update(patch).in('id', part);
    if (error) throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await readBody(req);
    const mode = cleanStr((body as any)?.mode || 'sync');

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

    if (mode === 'drivers') {
      return json({ ok: true, updated: 0, errors: 0, message: 'Atualização de condutores BFleet preparada, mas ainda depende do endpoint de gravação de condutor.' });
    }

    let token = await getValidToken({ supabase, integracaoId: integration.id, secrets, apiBase, apiKey, username, password });
    let vehicleResp = await fetchVehicleGetAll(apiBase, apiKey, token);

    if (vehicleResp.status === 401 || vehicleResp.status === 403 || Number(vehicleResp.parsed?.status) === 401 || Number(vehicleResp.parsed?.status) === 403) {
      token = await getValidToken({ supabase, integracaoId: integration.id, secrets, apiBase, apiKey, username, password, force: true });
      vehicleResp = await fetchVehicleGetAll(apiBase, apiKey, token);
    }

    if (!vehicleResp.ok || Number(vehicleResp.parsed?.status || 200) !== 200) {
      return json({
        error: `Erro ao consultar BFleet/Service24GPS vehicleGetAll (${vehicleResp.status}).`,
        api_status: vehicleResp.parsed?.status,
        sample: vehicleResp.text.slice(0, 900),
      }, 502);
    }

    const bfleetRows = extractVehicles(vehicleResp.parsed);
    const byPlate = new Map<string, VehicleApi>();
    const bfleetSemIdgps: VehicleApi[] = [];
    for (const row of bfleetRows) {
      const plate = getVehiclePlate(row);
      const tracker = getTrackerId(row);
      if (!plate) continue;
      if (isValidTracker(tracker)) byPlate.set(plate, row);
      else bfleetSemIdgps.push(row);
    }

    const { data: panelVehicles, error: pvErr } = await supabase
      .from('frotas_veiculos')
      .select('id,placa,renavam,empresa,rastreador_bfleet');
    if (pvErr) throw pvErr;

    const panel = (panelVehicles || []) as PanelVehicle[];
    const panelByPlate = new Map<string, PanelVehicle>();
    for (const v of panel) {
      const plate = normalizePlate(v.placa);
      if (plate) panelByPlate.set(plate, v);
    }

    // Cruzamento: placa exata primeiro; se não achar, tenta a chave tolerante (6 <-> G etc.),
    // mas só quando for inequívoca (uma única placa de cada lado com aquela chave).
    const bfleetPlatesByKey = new Map<string, string[]>();
    for (const plate of byPlate.keys()) {
      const key = plateKey(plate);
      bfleetPlatesByKey.set(key, [...(bfleetPlatesByKey.get(key) || []), plate]);
    }
    const panelCountByKey = new Map<string, number>();
    for (const plate of panelByPlate.keys()) {
      const key = plateKey(plate);
      panelCountByKey.set(key, (panelCountByKey.get(key) || 0) + 1);
    }

    const resolveBfleetPlate = (panelPlate: string): string | null => {
      if (!panelPlate) return null;
      if (byPlate.has(panelPlate)) return panelPlate;
      const key = plateKey(panelPlate);
      const candidates = bfleetPlatesByKey.get(key) || [];
      if (candidates.length !== 1 || panelCountByKey.get(key) !== 1) return null;
      // Se a placa da BFleet existe exata no painel, ela pertence a outro veículo.
      if (panelByPlate.has(candidates[0])) return null;
      return candidates[0];
    };

    const bfleetPlateByPanelId = new Map<string, string>();
    const matchedBfleetPlates = new Set<string>();
    for (const v of panel) {
      const bfleetPlate = resolveBfleetPlate(normalizePlate(v.placa));
      if (!bfleetPlate) continue;
      bfleetPlateByPanelId.set(v.id, bfleetPlate);
      matchedBfleetPlates.add(bfleetPlate);
    }

    const matchedIds: string[] = [];
    const unmatchedIds: string[] = [];
    let divergencias = 0;

    const bfleetNaoEncontradosNoPainel = Array.from(byPlate.entries())
      .filter(([plate]) => !matchedBfleetPlates.has(plate))
      .map(([, row]) => ({
        ...publicBfleetRow(row),
        motivo: 'Placa retornada pela BFleet não existe igual na tabela frotas_veiculos. Conferir placa, veículo fora da frota oficial, inativo ou cadastro divergente.',
      }))
      .slice(0, 300);

    const painelNaoEncontradosNaBfleet: Array<Record<string, unknown>> = [];

    const nowIso = new Date().toISOString();
    const syncId = crypto.randomUUID();

    // Primeiro marca todos como sem rastreador na base atual; depois sobrescreve os encontrados.
    for (const v of panel) {
      const plate = normalizePlate(v.placa);
      if (plate && bfleetPlateByPanelId.has(v.id)) matchedIds.push(v.id);
      else {
        unmatchedIds.push(v.id);
        painelNaoEncontradosNaBfleet.push({
          placa: plate || cleanStr(v.placa),
          empresa: cleanStr(v.empresa),
          renavam: cleanStr(v.renavam),
          motivo: plate ? 'Placa do painel não apareceu no vehicleGetAll da BFleet. Provável veículo sem rastreador, placa divergente ou equipamento não vinculado.' : 'Veículo do painel sem placa normalizada para cruzamento.',
        });
      }
    }

    const diagnosticoRows = [
      ...bfleetNaoEncontradosNoPainel.map((r) => ({ tipo: 'BFLEET_FORA_DO_PAINEL', placa: r.placa, nome_bfleet: r.nome, idgps: r.idgps, grupo_bfleet: r.grupo, motivo: r.motivo, dados: r })),
      ...painelNaoEncontradosNaBfleet.slice(0, 500).map((r) => ({ tipo: 'PAINEL_SEM_BFLEET', placa: r.placa, empresa: r.empresa, renavam: r.renavam, motivo: r.motivo, dados: r })),
      ...bfleetSemIdgps.slice(0, 200).map((row) => ({ tipo: 'BFLEET_SEM_IDGPS', placa: getVehiclePlate(row), nome_bfleet: getVehicleName(row), idgps: getTrackerId(row), grupo_bfleet: cleanStr(row.grupo), motivo: 'Registro BFleet sem idgps válido; não foi considerado como rastreador ativo.', dados: publicBfleetRow(row) })),
    ];
    await saveDiagnostics(supabase, syncId, diagnosticoRows);

    if (mode === 'diagnostic') {
      return json({
        ok: true,
        mode,
        sync_id: syncId,
        total_bfleet: bfleetRows.length,
        total_com_idgps: byPlate.size,
        matched: matchedIds.length,
        rastreadores: matchedIds.length,
        sem_rastreador: unmatchedIds.length,
        bfleet_nao_encontrados_no_painel: bfleetNaoEncontradosNoPainel,
        painel_nao_encontrados_na_bfleet: painelNaoEncontradosNaBfleet.slice(0, 300),
        bfleet_sem_idgps: bfleetSemIdgps.slice(0, 120).map(publicBfleetRow),
        message: `Diagnóstico BFleet: ${matchedIds.length} placa(s) cruzada(s), ${bfleetNaoEncontradosNoPainel.length} BFleet fora do painel, ${painelNaoEncontradosNaBfleet.length} veículos do painel sem BFleet.`,
      });
    }

    if (unmatchedIds.length) {
      await updateInBatches(supabase, unmatchedIds, {
        rastreador_bfleet: false,
        bfleet_confirmado: false,
        bfleet_status: 'SEM_RASTREADOR',
        bfleet_mensagem: 'Não localizado no vehicleGetAll BFleet/Service24GPS.',
        bfleet_ultima_sync_em: nowIso,
      });
    }

    for (const v of panel) {
      const bfleetPlate = bfleetPlateByPanelId.get(v.id);
      const row = bfleetPlate ? byPlate.get(bfleetPlate) : undefined;
      if (!row) continue;

      const tracker = getTrackerId(row);
      const patch = {
        rastreador_bfleet: true,
        bfleet_confirmado: true,
        bfleet_status: 'COM_RASTREADOR',
        bfleet_placa: bfleetPlate,
        bfleet_mensagem: bfleetPlate === normalizePlate(v.placa)
          ? 'Veículo localizado no BFleet/Service24GPS.'
          : `Veículo localizado no BFleet/Service24GPS com placa equivalente (${bfleetPlate}).`,
        bfleet_idgps: tracker,
        bfleet_nome: getVehicleName(row),
        bfleet_grupo: cleanStr(row.grupo),
        bfleet_gatewayip: cleanStr(row.gatewayip),
        bfleet_condutor: cleanStr(row.conductor ?? row.condutor),
        bfleet_marca: cleanStr(row.marca),
        bfleet_modelo: cleanStr(row.modelo),
        bfleet_ano: cleanStr(row.anio ?? row.ano),
        bfleet_odometro: cleanStr(row.odometro),
        bfleet_raw: row,
        bfleet_ultima_sync_em: nowIso,
      };
      const { error } = await supabase.from('frotas_veiculos').update(patch).eq('id', v.id);
      if (error) throw error;
    }

    const sampleBfleetPlates = Array.from(byPlate.keys()).slice(0, 12);
    const samplePanelPlates = panel.map((v) => normalizePlate(v.placa)).filter(Boolean).slice(0, 12);

    return json({
      ok: true,
      mode,
      apiBase,
      total_bfleet: bfleetRows.length,
      total_com_idgps: byPlate.size,
      rastreadores: matchedIds.length,
      matched: matchedIds.length,
      sem_rastreador: unmatchedIds.length,
      divergencias,
      token_saved: true,
      sync_id: syncId,
      bfleet_fora_do_painel: bfleetNaoEncontradosNoPainel.length,
      painel_sem_bfleet: painelNaoEncontradosNaBfleet.length,
      sample_bfleet_plates: sampleBfleetPlates,
      sample_panel_plates: samplePanelPlates,
      bfleet_nao_encontrados_no_painel: bfleetNaoEncontradosNoPainel.slice(0, 80),
      painel_nao_encontrados_na_bfleet: painelNaoEncontradosNaBfleet.slice(0, 80),
      message: `BFleet sincronizado: ${matchedIds.length} veículo(s) com rastreador de ${bfleetRows.length} registro(s) lido(s).`,
    });
  } catch (err) {
    console.error('[sync-bfleet-veiculos]', err);
    return json({ error: err?.message || String(err) }, 500);
  }
});
