import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanText(value: unknown): string { return String(value ?? "").trim(); }
function onlyDigits(value: unknown): string { return cleanText(value).replace(/\D/g, ""); }
function onlyPlate(value: unknown): string { return cleanText(value).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7); }
function normalizeKey(value: unknown): string { return cleanText(value).toUpperCase().replace(/\s+/g, "_"); }
function normalizeBaseUrl(value: string): string { return value.replace(/\/+$/, ""); }
function getProp(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

async function loadTiSecrets(supabase: ReturnType<typeof createClient>) {
  const out: Record<string, string> = {};
  const sources = [
    { table: "ti_integracao_segredos", keyCols: ["chave", "key", "nome", "name"], valueCols: ["valor", "value", "segredo", "secret", "token", "conteudo"] },
    { table: "ti_integracoes_segredos", keyCols: ["chave", "key", "nome", "name"], valueCols: ["valor", "value", "segredo", "secret", "token", "conteudo"] },
    { table: "ti_integracoes_tokens", keyCols: ["chave", "key", "nome", "name"], valueCols: ["valor", "value", "segredo", "secret", "token", "conteudo"] },
    { table: "ti_integracoes", keyCols: ["codigo", "code", "chave", "key", "nome", "name"], valueCols: ["url_base", "base_url", "valor", "value"] },
  ];

  for (const source of sources) {
    const { data, error } = await supabase.from(source.table).select("*").limit(1000);
    if (error || !Array.isArray(data)) continue;
    for (const row of data as Record<string, unknown>[]) {
      const key = normalizeKey(getProp(row, source.keyCols));
      const value = getProp(row, source.valueCols);
      if (key && value) out[key] = value;
      const codigo = normalizeKey(getProp(row, ["codigo", "code"]));
      const urlBase = getProp(row, ["url_base", "base_url"]);
      const authUrl = getProp(row, ["url_autenticacao", "auth_url", "token_url"]);
      if (codigo.includes("DETRAN") && urlBase && !out.DETRAN_BASE) out.DETRAN_BASE = urlBase;
      if (codigo.includes("DETRAN") && authUrl && !out.DETRAN_TOKEN_URL) out.DETRAN_TOKEN_URL = authUrl;
    }
  }
  return out;
}

type DetranCredential = { suffix: string; empresa: string; cnpj: string; clientId: string; clientSecret: string };
function buildCredentialList(secrets: Record<string, string>): DetranCredential[] {
  const ids: Record<string, string> = {};
  const secretsBySuffix: Record<string, string> = {};
  for (const [key, value] of Object.entries(secrets)) {
    const idMatch = key.match(/^(CLIENT_ID|CLIENTE_ID)_(\d+)$/);
    if (idMatch) ids[idMatch[2]] = value;
    const secretMatch = key.match(/^CLIENT_SECRET_(\d+)$/);
    if (secretMatch) secretsBySuffix[secretMatch[1]] = value;
  }
  const companyBySuffix: Record<string, { empresa: string; cnpj: string }> = {
    "04": { empresa: "ELIZEU MOTA", cnpj: "04.429.697/0001-71" },
    "29": { empresa: "Grão 1000 LTDA", cnpj: "29.666.679/0001-34" },
    "35": { empresa: "CAR1000 LTDA", cnpj: "35.134.829/0001-61" },
  };
  return Object.keys(ids).sort().map((suffix) => ({
    suffix,
    empresa: secrets[`EMPRESA_${suffix}`] || companyBySuffix[suffix]?.empresa || `Empresa ${suffix}`,
    cnpj: secrets[`CNPJ_${suffix}`] || companyBySuffix[suffix]?.cnpj || "",
    clientId: ids[suffix],
    clientSecret: secretsBySuffix[suffix] || "",
  })).filter((cred) => Boolean(cred.clientId && cred.clientSecret));
}

async function requestToken(baseUrl: string, tokenUrl: string, cred: DetranCredential, scope: string) {
  const url = tokenUrl || `${baseUrl}/api/v1/token`;
  const basic = btoa(`${cred.clientId}:${cred.clientSecret}`);
  const attempts = [
    { headers: { Authorization: `Basic ${basic}` }, body: new URLSearchParams({ grant_type: "client_credentials", scope }) },
    { headers: {}, body: new URLSearchParams({ grant_type: "client_credentials", client_id: cred.clientId, client_secret: cred.clientSecret, scope }) },
    { headers: {}, body: new URLSearchParams({ grant_type: "client_credentials", client_id: cred.clientId, client_secret: cred.clientSecret }) },
  ];
  let lastText = ""; let lastStatus = 0;
  for (const a of attempts) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", ...a.headers }, body: a.body });
    lastStatus = res.status; lastText = await res.text();
    if (res.ok) {
      const payload = lastText ? JSON.parse(lastText) : {};
      const token = payload?.access_token || payload?.token || payload?.jwt || payload?.Token || payload?.TOKEN;
      if (token) return String(token);
      throw new Error(`Token DETRAN sem access_token para ${cred.empresa}. Retorno: ${lastText.slice(0, 300)}`);
    }
  }
  throw new Error(`Falha ao gerar token DETRAN para ${cred.empresa} (${lastStatus}): ${lastText.slice(0, 500)}`);
}

async function detranGetJson(baseUrl: string, token: string, consumerId: string, path: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, consumerId, "x-consumer-id": consumerId, Accept: "application/json" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`DETRAN ${path} (${res.status}): ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

function pick(obj: any, keys: string[], fallback = "") {
  for (const key of keys) {
    const parts = key.split(".");
    let cur = obj;
    for (const part of parts) cur = cur?.[part];
    if (cur !== undefined && cur !== null && String(cur).trim() !== "") return cur;
  }
  return fallback;
}
function toNumber(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const hasDecimal = /[,.]\d{1,2}$/.test(raw);
  const s = raw.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (!hasDecimal && Number.isInteger(n) && Math.abs(n) >= 1000) return n / 100;
  return n;
}

function moneyFromDetran(value: unknown): number | null {
  return toNumber(value);
}
function toDate(value: unknown): string | null {
  const s = cleanText(value);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const ymd = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  return null;
}
function extractMultas(payload: any): any[] {
  if (!payload) return [];
  if (Array.isArray(payload.resultado)) return payload.resultado;
  if (Array.isArray(payload.itens)) return payload.itens;
  if (Array.isArray(payload.lista)) return payload.lista;
  if (Array.isArray(payload.multas)) return payload.multas;
  if (Array.isArray(payload.content)) return payload.content;
  if (Array.isArray(payload)) return payload;
  return [payload];
}
function buildMultaKey(renavam: string, m: any) {
  const idAuto = cleanText(pick(m, ["autoOriginal_idAuto", "api_autoOriginal_idAuto", "api_idAuto", "idAuto"]));
  if (idAuto) return `${renavam}|ID:${idAuto}`;
  const codOrgao = cleanText(pick(m, ["api_codOrgaoAutuador", "codOrgaoAutuador", "autoOriginal_codOrgaoAutuador"]));
  const codAuto = cleanText(pick(m, ["api_codAuto", "codAuto", "autoOriginal_codAuto", "autoCalculo"]));
  const numAuto = cleanText(pick(m, ["api_numAutoInfracao", "numAutoInfracao", "numAutoInfracaoOriginal", "numAutoInfracaoSE"]));
  const dataInf = cleanText(pick(m, ["api_dataInfracao", "dataInfracao"]));
  const horaInf = cleanText(pick(m, ["api_horaInfracao", "horaInfracao"]));
  return `${renavam}|OA:${codOrgao || "0"}|CA:${codAuto}|NA:${numAuto}|DI:${dataInf}|HI:${horaInf}`;
}
function mapMulta(m: any, v: any, cred?: DetranCredential) {
  const codAuto = cleanText(pick(m, ["api_codAuto", "codAuto", "autoOriginal_codAuto", "autoCalculo"]));
  const codOrgao = cleanText(pick(m, ["api_codOrgaoAutuador", "codOrgaoAutuador", "autoOriginal_codOrgaoAutuador"]));
  const numAuto = cleanText(pick(m, ["api_numAutoInfracao", "numAutoInfracao", "numAutoInfracaoOriginal", "numAutoInfracaoSE"]));
  const descricao = cleanText(pick(m, ["api_descrInfracao", "descrInfracao", "descricao"]));
  const dataLimiteDefesa = toDate(pick(m, ["api_dataLimiteDefesa", "dataLimiteDefesa"]));
  const dataVencimentoAuto = toDate(pick(m, ["dataVencimentoAuto", "api_dataVencimentoAuto"]));
  const dataLimitePagto = toDate(pick(m, ["dataLimitePagto", "api_dataLimitePagto"]));
  const dataLimiteJari = toDate(pick(m, ["dataLimiteJari", "api_dataLimiteJari"]));
  const dataLimiteCetran = toDate(pick(m, ["dataLimiteCetran", "api_dataLimiteCetran"]));
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00").getTime();
  const vencRefDate = dataVencimentoAuto || dataLimiteDefesa;
  const vencida = vencRefDate ? new Date(`${vencRefDate}T00:00:00`).getTime() < today : false;
  const renavam = cleanText(v.renavam);
  const placa = onlyPlate(pick(m, ["api_placa", "placa"], v.placa));
  return {
    multa_key: buildMultaKey(renavam, m),
    veiculo_id: v.id || null,
    placa,
    renavam,
    empresa: v.empresa || cred?.empresa || null,
    cnpj: v.cnpj || cred?.cnpj || null,
    orgao_autuador: cleanText(pick(m, ["api_nomeOrgaoAutuador", "nomeOrgaoAutuador"])),
    orgao_competente: cleanText(pick(m, ["api_nomeOrgaoCompetente", "nomeOrgaoCompetente"])),
    data_infracao: toDate(pick(m, ["api_dataInfracao", "dataInfracao"])),
    hora_infracao: cleanText(pick(m, ["api_horaInfracao", "horaInfracao"])),
    local: cleanText(pick(m, ["api_localInfracao", "localInfracao", "local"])),
    descricao,
    valor_original: moneyFromDetran(pick(m, ["api_valorOriginal", "valorOriginal", "valor", "api_valor", "valorMulta", "valorTotal"])),
    numero_auto_infracao: numAuto,
    auto: [codAuto, numAuto].filter(Boolean).join(" / ") || null,
    cod_auto: codAuto || null,
    cod_orgao: codOrgao || null,
    data_limite_defesa: dataLimiteDefesa,
    data_vencimento_auto: dataVencimentoAuto,
    data_limite_pagto: dataLimitePagto,
    data_limite_jari: dataLimiteJari,
    data_limite_cetran: dataLimiteCetran,
    status_multa: vencida ? "VENCIDA" : "A PAGAR",
    situacao: vencida ? "VENCIDA" : "A PAGAR",
    motorista: v.motorista_atual || null,
    origem: "DETRAN",
    ultima_consulta_em: new Date().toISOString(),
    raw: m,
  };
}
function suffixForVehicle(v: any): string {
  const cnpj = onlyDigits(v?.cnpj);
  const empresa = normalizeKey(v?.empresa);
  if (cnpj.startsWith("04429697") || empresa.includes("ELIZEU")) return "04";
  if (cnpj.startsWith("29666679") || empresa.includes("GRAO") || empresa.includes("GRÃO")) return "29";
  if (cnpj.startsWith("35134829") || empresa.includes("CAR1000")) return "35";
  return "";
}
async function upsertMulta(supabase: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const key = String(payload.multa_key || "");
  if (!key) return "skipped";
  const existing = await supabase.from("frotas_multas").select("id").eq("multa_key", key).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.id) {
    const { error } = await supabase.from("frotas_multas").update(payload).eq("id", existing.data.id);
    if (error) throw error;
    return "updated";
  }
  const { error } = await supabase.from("frotas_multas").insert(payload);
  if (error) throw error;
  return "inserted";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente na Edge Function.");
    const supabase = createClient(supabaseUrl, serviceKey);
    const secrets = await loadTiSecrets(supabase);
    const baseUrl = normalizeBaseUrl(secrets.DETRAN_BASE || secrets.DETRAN_BASE_URL || "https://detranfrotistaapi.paas.pr.gov.br");
    const tokenUrl = secrets.DETRAN_TOKEN_URL || "https://auth-cs.identidadedigital.pr.gov.br/centralautenticacao/api/v1/token/jwt";
    const consumerId = secrets.CONSUMER_ID || secrets.DETRAN_CONSUMER_ID || "DETRANFROTISTAAPI";
    const scope = secrets.DETRAN_SCOPE || "frotista.api";
    const credentials = buildCredentialList(secrets);
    if (!credentials.length) throw new Error("Nenhuma credencial DETRAN encontrada em TI > Integrações.");

    const requestedLimit = Number(body?.limit || 15);
    const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 15, 25));
    const offset = Math.max(0, Number(body?.offset || 0));

    let totalDisponivel: number | null = null;
    let query = supabase
      .from("frotas_veiculos")
      .select("*", { count: "exact" })
      .not("renavam", "is", null)
      .neq("renavam", "0")
      .order("placa", { ascending: true });

    if (body?.veiculo_id) {
      query = query.eq("id", body.veiculo_id);
    } else if (body?.placa) {
      query = query.eq("placa", onlyPlate(body.placa));
    } else {
      query = query.range(offset, offset + limit - 1);
    }

    const { data: veiculos, error: veiculosError, count } = await query;
    totalDisponivel = count ?? null;
    if (veiculosError) throw veiculosError;
    if (!Array.isArray(veiculos) || !veiculos.length) {
      return json({
        ok: true,
        total_veiculos: 0,
        total_disponivel: totalDisponivel || 0,
        offset,
        limit,
        next_offset: offset,
        has_more: false,
        total_multas: 0,
        inserted: 0,
        updated: 0,
        summary: []
      });
    }

    const credBySuffix = Object.fromEntries(credentials.map(c => [c.suffix, c]));
    const tokenBySuffix: Record<string, string> = {};
    const summary: any[] = [];
    let totalMultas = 0, inserted = 0, updated = 0, errors = 0;

    for (const v of veiculos) {
      const suffix = suffixForVehicle(v) || credentials[0].suffix;
      const cred = credBySuffix[suffix] || credentials[0];
      if (!tokenBySuffix[cred.suffix]) tokenBySuffix[cred.suffix] = await requestToken(baseUrl, tokenUrl, cred, scope);
      const renavam = onlyDigits(v.renavam);
      if (!renavam) continue;
      try {
        const payload = await detranGetJson(baseUrl, tokenBySuffix[cred.suffix], consumerId, `/api/v1/consulta/multas-a-pagar/${renavam}`);
        const multas = extractMultas(payload);
        totalMultas += multas.length;
        let vi = 0, vu = 0;
        for (const m of multas) {
          const mapped = mapMulta(m, v, cred);
          const result = await upsertMulta(supabase, mapped);
          if (result === "inserted") { inserted++; vi++; }
          if (result === "updated") { updated++; vu++; }
        }
        await supabase.from("frotas_veiculos").update({ multas_ultima_consulta_em: new Date().toISOString(), multas_status: "OK" }).eq("id", v.id);
        summary.push({ placa: v.placa, renavam, empresa: v.empresa || cred.empresa, multas: multas.length, inserted: vi, updated: vu });
      } catch (err) {
        errors++;
        await supabase.from("frotas_veiculos").update({ multas_ultima_consulta_em: new Date().toISOString(), multas_status: "ERRO", multas_mensagem: err?.message || "Erro" }).eq("id", v.id);
        summary.push({ placa: v.placa, renavam, empresa: v.empresa || cred.empresa, error: err?.message || "Erro" });
      }
    }

    await supabase.from("frotas_sync_logs").insert({ tipo: "MULTAS", status: errors ? "CONCLUIDO_COM_ERROS" : "CONCLUIDO", resumo: { total_veiculos: veiculos.length, total_multas: totalMultas, inserted, updated, errors, summary: summary.slice(0, 50) } }).then(()=>{});

    const nextOffset = offset + veiculos.length;
    const hasMore = Boolean(totalDisponivel !== null && nextOffset < totalDisponivel && !body?.veiculo_id && !body?.placa);

    return json({
      ok: true,
      total_veiculos: veiculos.length,
      total_disponivel: totalDisponivel ?? veiculos.length,
      offset,
      limit,
      next_offset: nextOffset,
      has_more: hasMore,
      total_multas: totalMultas,
      inserted,
      updated,
      errors,
      summary
    });
  } catch (error) {
    return json({ ok: false, error: error?.message || "Erro interno" }, 500);
  }
});
