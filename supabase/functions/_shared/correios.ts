import { createClient } from "jsr:@supabase/supabase-js@2";

const API = "https://api.correios.com.br";
const INTEGRACAO_ID = "613655d3-a1b3-42af-9410-baa72c86e9b4";

export function correiosApi(path: string) {
  return `${API}${path}`;
}

async function secrets(sb: any) {
  const { data } = await sb.from("ti_integracao_segredos").select("chave, valor")
    .eq("integracao_id", INTEGRACAO_ID).eq("ativo", true);
  const result: Record<string, string> = {};
  for (const row of data ?? []) result[String(row.chave).trim()] = String(row.valor ?? "").trim();
  return result;
}

async function getDelegatedAccessKey(scope: TokenScope) {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const sec = await secrets(sb);
  return scope === "cartao"
    ? sec.CORREIOS_CWS_KEY_CARTAO || sec.CORREIOS_CWS_KEY || ""
    : sec.CORREIOS_CWS_KEY || sec.CORREIOS_CWS_KEY_CARTAO || "";
}

type TokenScope = "contrato" | "cartao";

export async function getCorreiosToken(force = false, scope: TokenScope = "contrato") {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const cacheId = scope === "cartao" ? 3 : 1;
  if (!force) {
    const { data } = await sb.from("envios_correios_token_cache").select("token, expires_at").eq("id", cacheId).maybeSingle();
    if (data?.token && new Date(data.expires_at).getTime() > Date.now() + 60_000) return data.token;
  }

  const sec = await secrets(sb);
  const usuario = sec.CORREIOS_API_USERNAME || sec.CORREIOS_USERNAME || sec.CORREIOS_USUARIO || Deno.env.get("CORREIOS_API_USERNAME") || Deno.env.get("CORREIOS_USERNAME") || "";
  const apiSenha = sec.CORREIOS_API_PASSWORD || Deno.env.get("CORREIOS_API_PASSWORD") || "";
  const portalSenha = sec.CORREIOS_PASSWORD || Deno.env.get("CORREIOS_PASSWORD") || "";
  const cartao = sec.CORREIOS_CARTAO || Deno.env.get("CORREIOS_CARTAO") || "";
  const contrato = sec.CORREIOS_CONTRATO || Deno.env.get("CORREIOS_CONTRATO") || "";
  const cnpj = sec.CORREIOS_CNPJ || Deno.env.get("CORREIOS_CNPJ") || "";
  const dr = Number(sec.CORREIOS_DR || Deno.env.get("CORREIOS_DR")) || undefined;
  if (!usuario || (!apiSenha && !portalSenha)) {
    throw new Error("Configure CORREIOS_USERNAME e um código de acesso CWS em TI > Integrações.");
  }

  const contratoAttempts = [
    { path: "/token/v1/autentica/contrato", login: usuario, password: apiSenha, body: { numero: contrato, dr } },
    { path: "/token/v1/autentica", login: usuario, password: apiSenha, body: {} },
    { path: "/token/v1/autentica/contrato", login: cnpj, password: apiSenha, body: { numero: contrato, dr } },
    { path: "/token/v1/autentica/contrato", login: usuario, password: portalSenha, body: { numero: contrato, dr } },
  ];
  const cartaoAttempts = [
    { path: "/token/v1/autentica/cartaopostagem", login: usuario, password: apiSenha, body: { numero: cartao, contrato, dr } },
  ];
  const attempts = (scope === "cartao" ? [...cartaoAttempts, ...contratoAttempts] : [...contratoAttempts, ...cartaoAttempts])
    .filter((attempt) => attempt.login && attempt.password && (attempt.path.includes("cartao") ? cartao : attempt.path.endsWith("/contrato") ? contrato : true));

  const statuses: number[] = [];
  for (const attempt of attempts) {
    const res = await fetch(correiosApi(attempt.path), {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${attempt.login}:${attempt.password}`)}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(attempt.body),
    });
    statuses.push(res.status);
    const text = await res.text();
    let payload: any = null;
    try { payload = JSON.parse(text); } catch { /* tenta a próxima credencial */ }
    if (!res.ok || !payload?.token) continue;
    const expiresAt = payload.expiraEm || payload.expiration || new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();
    await sb.from("envios_correios_token_cache").upsert({ id: cacheId, token: payload.token, expires_at: expiresAt, updated_at: new Date().toISOString() });
    return payload.token as string;
  }
  if (statuses.length && statuses.every((status) => status === 401)) {
    throw new Error("Todas as credenciais cadastradas foram recusadas pelos Correios (HTTP 401). Gere um novo código de acesso no CWS.");
  }
  throw new Error(`Não foi possível autenticar nos Correios (HTTP ${[...new Set(statuses)].join(", ") || "sem resposta"}).`);
}

export async function correiosFetch(path: string, init: RequestInit = {}) {
  const scope: TokenScope = path.startsWith("/prepostagem/") ? "cartao" : "contrato";
  const delegatedKey = await getDelegatedAccessKey(scope);
  let token = delegatedKey || await getCorreiosToken(false, scope);
  for (let attempt = 0; attempt < 3; attempt++) {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    const res = await fetch(correiosApi(path), { ...init, headers });
    if (![401, 403].includes(res.status) || attempt === 2) return res;
    if (attempt === 0 && delegatedKey) token = await getCorreiosToken(false, scope);
    else token = await getCorreiosToken(true, scope);
  }
  throw new Error("Falha inesperada de autenticação nos Correios.");
}
