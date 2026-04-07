
// worker-api — proxy GAS + Supabase + Admin Users + User Modules + BotConversa + Histórico Colaboradores + Exportações + Automações + Relatórios
//
// Baseado no seu worker atual com encaixe das rotas novas sem quebrar:
//  - /api/health
//  - /api
//  - /api/exec
//  - /api/macros/*
//  - /api/admin/users/*
//  - /api/relatorios/import/*
//
// Variáveis esperadas:
//  - GAS_EXEC_URL
//  - SUPABASE_URL
//  - SUPABASE_KEY
//  - SUPABASE_SERVICE_KEY
//  - SUPABASE_ANON_KEY
//  - BC_BASE_URL
//  - BC_AUTH_HEADER
//  - BC_API_KEY
//  - BC_WEBHOOK_SECRET
//  - BC_BIRTHDAY_FLOW_ID

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}

function corsHeaders(origin = "*") {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization, X-Requested-With, Accept, X-BC-Secret",
    "access-control-expose-headers": "content-type, content-disposition",
  };
}

function corsPreflight(request) {
  const reqHeaders = request.headers.get("Access-Control-Request-Headers");
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders("*"),
      "access-control-allow-headers":
        reqHeaders || "Content-Type, Authorization, X-Requested-With, Accept, X-BC-Secret",
      "access-control-max-age": "86400",
    },
  });
}

function pickRequestHeaders(request) {
  const h = new Headers();
  const ct = request.headers.get("content-type");
  if (ct) h.set("content-type", ct);
  const accept = request.headers.get("accept");
  if (accept) h.set("accept", accept);
  const auth = request.headers.get("authorization");
  if (auth) h.set("authorization", auth);
  const xrw = request.headers.get("x-requested-with");
  if (xrw) h.set("x-requested-with", xrw);
  return h;
}

async function proxyToGAS({ request, url, gasUrl, addActionFromSubpath }) {
  const gas = new URL(gasUrl);

  for (const [k, v] of url.searchParams.entries()) {
    gas.searchParams.set(k, v);
  }

  if (addActionFromSubpath && request.method === "GET") {
    gas.searchParams.set("action", addActionFromSubpath);
  }

  const headers = pickRequestHeaders(request);
  const isBodyMethod = !["GET", "HEAD"].includes(request.method);
  const body = isBodyMethod ? await request.clone().arrayBuffer() : null;

  const resp = await fetch(gas.toString(), {
    method: request.method,
    headers,
    body: isBodyMethod ? body : null,
    redirect: "follow",
  });

  const respBody = await resp.arrayBuffer();
  const out = new Headers();
  out.set("access-control-allow-origin", "*");
  out.set("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  out.set("access-control-allow-headers", "Content-Type, Authorization, X-Requested-With, Accept, X-BC-Secret");
  out.set("access-control-expose-headers", "content-type, content-disposition");
  out.set("content-type", resp.headers.get("content-type") || "application/json; charset=utf-8");

  return new Response(respBody, { status: resp.status, headers: out });
}

function dmyToIso(dmy) {
  const s = String(dmy || "").trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function safeJsonParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

async function readBodyBuffer(request) {
  if (["GET", "HEAD"].includes(request.method)) return null;
  return await request.clone().arrayBuffer();
}

function decodeBufferToText(buffer) {
  if (!buffer) return "";
  return new TextDecoder("utf-8").decode(buffer);
}

async function readJsonBody(request) {
  const rawBody = await readBodyBuffer(request);
  return safeJsonParse(decodeBufferToText(rawBody));
}

function getPayloadRoot(body) {
  if (!body || typeof body !== "object") return {};
  if (body.payload && typeof body.payload === "object") return body.payload;
  return body;
}

function getModuleAction(body) {
  const root = getPayloadRoot(body);
  return {
    module: String(body?.module || root?.module || "").trim(),
    action: String(body?.action || root?.action || "").trim(),
    root,
  };
}

function isSupabaseDespesasSave(body) {
  const { module, action } = getModuleAction(body);
  return module === "despesas" && action === "salvarProgramacao";
}

function normalizeItens(root) {
  if (Array.isArray(root?.itens)) return root.itens;
  if (Array.isArray(root?.items)) return root.items;
  return [];
}

function normalizeCoordenacao(root) {
  return root?.coord || root?.coordenacao || root?.Coordenação || null;
}

function normalizeSupervisao(root) {
  return root?.supervisao || root?.Supervisão || null;
}

function normalizeDataRef(root) {
  return root?.dataRef || root?.dataReferencia || root?.DataReferencia || root?.data || null;
}

function normalizeSolicitante(body, request) {
  const root = getPayloadRoot(body);
  return (
    root?.solicitante ||
    body?.solicitante ||
    request.headers.get("x-user-name") ||
    request.headers.get("x-user") ||
    "sistema"
  );
}

function getServiceKey(env) {
  return env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY || "";
}

function getAnonKey(env) {
  return env.SUPABASE_ANON_KEY || env.SUPABASE_KEY || "";
}

function requireSupabaseEnv(env) {
  if (!env.SUPABASE_URL) throw new Error("SUPABASE_URL não configurada");
  if (!getServiceKey(env)) throw new Error("SUPABASE_SERVICE_KEY/SUPABASE_KEY não configurada");
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeSupervisoesInput(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(/[\n,;|]+/g)
        .map((v) => v.trim());

  return [...new Set(raw.map((v) => String(v || "").trim()).filter(Boolean))];
}

function serializeSupervisoes(value, fallback = null) {
  const arr = normalizeSupervisoesInput(value);
  return arr.length ? arr.join(" | ") : fallback;
}

function parseStoredSupervisoes(value) {
  return normalizeSupervisoesInput(String(value ?? "").replace(/\s*\|\s*/g, "|"));
}

function normalizeUserStatus(value, fallback = "ativo") {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return fallback;
  if (["ativo", "inativo", "bloqueado", "suspenso"].includes(v)) return v;
  if (v === "true" || v === "1") return "ativo";
  if (v === "false" || v === "0") return "inativo";
  return fallback;
}

function escapeFilterValue(value) {
  return encodeURIComponent(String(value ?? "").trim());
}

function generateTempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function supabaseRpc(env, fn, payload) {
  requireSupabaseEnv(env);
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "apikey": getServiceKey(env),
      "authorization": `Bearer ${getServiceKey(env)}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  const parsed = safeJsonParse(text);
  if (!res.ok) {
    throw new Error(parsed?.message || parsed?.error_description || parsed?.error || text || "Erro ao chamar Supabase RPC");
  }
  return parsed ?? { raw: text };
}

async function supabaseRest(env, path, { method = "GET", service = true, body = null, headers = {} } = {}) {
  requireSupabaseEnv(env);
  const key = service ? getServiceKey(env) : getAnonKey(env);
  if (!key) throw new Error("Chave Supabase não configurada");

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      "apikey": key,
      "authorization": `Bearer ${key}`,
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const parsed = safeJsonParse(text);
  if (!res.ok) throw new Error(parsed?.message || parsed?.error || text || "Erro no Supabase REST");
  return parsed;
}

async function supabaseAuthAdmin(env, path, { method = "GET", body = null, token = null } = {}) {
  requireSupabaseEnv(env);
  const serviceKey = getServiceKey(env);
  const anonKey = getAnonKey(env) || serviceKey;

  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/${path}`, {
    method,
    headers: {
      "apikey": anonKey,
      "authorization": token ? `Bearer ${token}` : `Bearer ${serviceKey}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const parsed = safeJsonParse(text);
  if (!res.ok) {
    throw new Error(parsed?.msg || parsed?.message || parsed?.error_description || parsed?.error || text || "Erro no Auth Admin");
  }
  return parsed ?? {};
}

function getBearerToken(request) {
  const auth = request.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
}

async function getRequesterUser(request, env) {
  const token = getBearerToken(request);
  if (!token) throw new Error("Authorization Bearer token ausente");

  const user = await supabaseAuthAdmin(env, "user", { method: "GET", token });
  if (!user?.id) throw new Error("Usuário autenticado inválido");
  return user;
}

async function requireMaster(request, env) {
  const authUser = await getRequesterUser(request, env);

  const appUsers = await supabaseRest(
    env,
    `app_usuarios?select=id,auth_user_id,perfil_id,status&auth_user_id=eq.${authUser.id}&limit=1`,
    { service: true }
  );

  const appUser = Array.isArray(appUsers) ? appUsers[0] : null;
  if (!appUser) throw new Error("Usuário não encontrado em app_usuarios");
  if (String(appUser.status || "").toLowerCase() !== "ativo") throw new Error("Usuário sem acesso ativo");

  const perfis = await supabaseRest(
    env,
    `app_perfis?select=id,codigo,nome&ativo=is.true&id=eq.${appUser.perfil_id}&limit=1`,
    { service: true }
  );

  const perfil = Array.isArray(perfis) ? perfis[0] : null;
  if (!perfil || perfil.codigo !== "master") throw new Error("Acesso permitido somente para usuário master");

  return { authUser, appUser, perfil };
}

async function tryHandleSupabaseDespesas({ request, env, body }) {
  if (!isSupabaseDespesasSave(body)) return null;

  const root = getPayloadRoot(body);
  const dataIso = dmyToIso(normalizeDataRef(root));
  const itens = normalizeItens(root);

  if (!dataIso) {
    return json({ ok: false, error: "Data inválida em despesas.salvarProgramacao" }, 400);
  }
  if (!Array.isArray(itens) || !itens.length) {
    return json({ ok: false, error: "Nenhum item enviado em despesas.salvarProgramacao" }, 400);
  }

  const result = await supabaseRpc(env, "upsert_programacao_despesas", {
    p_data_referencia: dataIso,
    p_supervisao: normalizeSupervisao(root),
    p_coordenacao: normalizeCoordenacao(root),
    p_solicitante: normalizeSolicitante(body, request),
    p_queue_id: crypto.randomUUID(),
    p_itens: itens,
  });

  return json({
    ok: true,
    origem: "supabase",
    module: "despesas",
    action: "salvarProgramacao",
    result,
  });
}

// BotConversa / Histórico / Exportações
function normalizePhoneBR(raw) {
  const digits = String(raw || "").replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 11) return "55" + digits;
  if (digits.length === 10) return "55" + digits.slice(0, 2) + "9" + digits.slice(2);
  return digits;
}

function splitFullName(nome) {
  const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return { first_name: "Sem", last_name: "Nome" };
  if (partes.length === 1) return { first_name: partes[0], last_name: "." };
  return {
    first_name: partes[0],
    last_name: partes.slice(1).join(" "),
  };
}

function firstNonEmpty(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
}

function mapColaboradorRow(row) {
  return {
    cpf: firstNonEmpty(row, ["CPF", "cpf"]),
    nome: firstNonEmpty(row, ["Nome", "nome"]),
    situacao: firstNonEmpty(row, ["Situação", "Situacao", "situacao"]),
    admissao: firstNonEmpty(row, ["Admissão", "Admissao", "admissao"]),
    desligamento: firstNonEmpty(row, ["Desligamento", "desligamento"]),
    salario: firstNonEmpty(row, ["Salário", "Salario", "salario"]),
    conta_bancaria_despesas: firstNonEmpty(row, ["C. Banc. Despesas", "Conta Bancária Despesas", "conta_bancaria_despesas"]),
    empresa: firstNonEmpty(row, ["Empresa", "empresa"]),
    coordenacao: firstNonEmpty(row, ["Coordenação", "Coordenacao", "coordenacao"]),
    supervisao: firstNonEmpty(row, ["Supervisão", "Supervisao", "supervisao"]),
    tipo: firstNonEmpty(row, ["Tipo", "tipo"]),
    cep: firstNonEmpty(row, ["CEP", "cep"]),
    estado: firstNonEmpty(row, ["Estado", "estado"]),
    cidade: firstNonEmpty(row, ["Cidade", "cidade"]),
    bairro: firstNonEmpty(row, ["Bairro", "bairro"]),
    endereco: firstNonEmpty(row, ["Endereço", "Endereco", "endereco"]),
    complemento: firstNonEmpty(row, ["Complemento", "complemento"]),
    data_nascimento: firstNonEmpty(row, ["Data de Nascimento", "data_nascimento"]),
    cargo: firstNonEmpty(row, ["Cargo", "cargo"]),
    whatsapp: normalizePhoneBR(firstNonEmpty(row, ["Whatsapp", "WhatsApp", "Celular", "Telefone", "whatsapp"])),
    email_pessoal: firstNonEmpty(row, ["E-mail Pessoal", "Email Pessoal", "email_pessoal"]),
    email_empresa: firstNonEmpty(row, ["E-mail da Empresa", "Email da Empresa", "email_empresa"]),
    snapshot_json: row,
  };
}

async function sbInsert(env, table, rows, prefer = "return=representation") {
  return supabaseRest(env, table, {
    method: "POST",
    service: true,
    headers: { Prefer: prefer },
    body: rows,
  });
}

async function sbUpsert(env, table, rows, onConflict) {
  return supabaseRest(env, `${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: "POST",
    service: true,
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: rows,
  });
}

async function sbSelect(env, tableAndQuery) {
  return supabaseRest(env, tableAndQuery, { method: "GET", service: true });
}

function chunkArray(items, size = 100) {
  const out = [];
  for (let i = 0; i < (items || []).length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function sbInsertChunks(env, table, rows, prefer = "return=minimal", chunkSize = 100) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  for (const chunk of chunkArray(list, chunkSize)) {
    if (chunk.length) await sbInsert(env, table, chunk, prefer);
  }
}

async function sbSelectByCpfs(env, table, cpfs, select = "id,cpf") {
  const list = [...new Set((cpfs || []).map(v => String(v || "").trim()).filter(Boolean))];
  if (!list.length) return [];
  const quoted = list.map(v => `"${String(v).replace(/"/g, '\\"')}"`).join(",");
  return await supabaseRest(env, `${table}?select=${encodeURIComponent(select)}&cpf=in.(${quoted})`, { service: true });
}

async function callBotConversaApi(env, endpoint, payload = null, method = "POST") {
  let base = String(env.BC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("BC_BASE_URL não configurado.");
  if (!env.BC_API_KEY) throw new Error("BC_API_KEY não configurado.");

  if (/\/api\/v1$/i.test(base)) {
    base += "/webhook";
  } else if (!/\/api\/v1\/webhook$/i.test(base)) {
    base += "/api/v1/webhook";
  }

  const url = `${base}${String(endpoint || "")}`;

  const res = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      [env.BC_AUTH_HEADER || "API-KEY"]: env.BC_API_KEY,
    },
    body: ["GET", "HEAD"].includes(method) ? undefined : JSON.stringify(payload || {}),
  });

  const text = await res.text();
  return {
    ok: res.ok,
    status: res.status,
    data: safeJsonParse(text) ?? text,
    url,
  };
}

async function findSubscriberIdByPhone(env, telefone) {
  const phone = normalizePhoneBR(telefone);
  if (!phone) return { ok: false, error: "Telefone inválido." };

  const result = await callBotConversaApi(env, `/subscriber/get_by_phone/${phone}/`, null, "GET");
  if (!result.ok) {
    return { ok: false, error: "Contato não encontrado na API do BotConversa.", raw: result };
  }

  const subscriberId =
    result?.data?.id ||
    result?.data?.subscriber?.id ||
    result?.data?.results?.[0]?.id ||
    "";

  if (!subscriberId) {
    return { ok: false, error: "subscriber_id não retornado pela API.", raw: result };
  }

  return { ok: true, subscriberId: String(subscriberId), raw: result };
}

async function logBot(env, row) {
  try {
    await sbInsert(env, "botconversa_logs", [row], "return=minimal");
  } catch (err) {
    console.error("Falha ao gravar botconversa_logs:", err);
  }
}

async function processBotFlow(env, payload) {
  const telefone = normalizePhoneBR(payload?.telefone);
  const flowId = String(payload?.flow_id || payload?.flowId || "").trim();

  if (!telefone) return { ok: false, status: 400, error: "telefone obrigatório" };
  if (!flowId) return { ok: false, status: 400, error: "flow_id obrigatório" };

  const subscriberLookup = await findSubscriberIdByPhone(env, telefone);
  if (!subscriberLookup.ok) {
    await logBot(env, {
      tipo: "flow",
      empresa: payload?.empresa || "",
      nome: payload?.nome || "",
      cpf: payload?.cpf || "",
      telefone,
      flow_id: flowId,
      request_payload: payload,
      response_payload: subscriberLookup.raw?.data || null,
      http_status: subscriberLookup.raw?.status || 404,
      sucesso: false,
      erro: subscriberLookup.error,
      origem: "worker",
    });
    return { ok: false, status: 404, error: subscriberLookup.error };
  }

  const subscriberId = String(subscriberLookup.subscriberId);
  const result = await callBotConversaApi(env, `/subscriber/${subscriberId}/send_flow/`, {
    flow: Number(flowId) || flowId,
  });

  await logBot(env, {
    tipo: "flow",
    empresa: payload?.empresa || "",
    nome: payload?.nome || "",
    cpf: payload?.cpf || "",
    telefone,
    subscriber_id: subscriberId,
    flow_id: flowId,
    request_payload: payload,
    response_payload: result.data,
    http_status: result.status,
    sucesso: result.ok,
    erro: result.ok ? null : "Falha ao enviar flow",
    origem: "worker",
  });

  if (!result.ok) {
    return { ok: false, status: result.status, error: "Falha ao enviar flow", details: result.data };
  }

  return { ok: true, status: 200, data: { subscriber_id: subscriberId, flow_id: flowId, result: result.data } };
}

async function processBotMessage(env, payload) {
  const telefone = normalizePhoneBR(payload?.telefone);
  const mensagem = String(payload?.mensagem || payload?.message || "").trim();

  if (!telefone) return { ok: false, status: 400, error: "telefone obrigatório" };
  if (!mensagem) return { ok: false, status: 400, error: "mensagem obrigatória" };

  const subscriberLookup = await findSubscriberIdByPhone(env, telefone);
  if (!subscriberLookup.ok) {
    await logBot(env, {
      tipo: "message",
      empresa: payload?.empresa || "",
      nome: payload?.nome || "",
      cpf: payload?.cpf || "",
      telefone,
      mensagem,
      request_payload: payload,
      response_payload: subscriberLookup.raw?.data || null,
      http_status: subscriberLookup.raw?.status || 404,
      sucesso: false,
      erro: subscriberLookup.error,
      origem: "worker",
    });
    return { ok: false, status: 404, error: subscriberLookup.error };
  }

  const subscriberId = String(subscriberLookup.subscriberId);
  const result = await callBotConversaApi(env, `/subscriber/${subscriberId}/send_message/`, {
    type: "text",
    value: mensagem,
  });

  await logBot(env, {
    tipo: "message",
    empresa: payload?.empresa || "",
    nome: payload?.nome || "",
    cpf: payload?.cpf || "",
    telefone,
    subscriber_id: subscriberId,
    mensagem,
    request_payload: payload,
    response_payload: result.data,
    http_status: result.status,
    sucesso: result.ok,
    erro: result.ok ? null : "Falha ao enviar mensagem",
    origem: "worker",
  });

  if (!result.ok) {
    return { ok: false, status: result.status, error: "Falha ao enviar mensagem", details: result.data };
  }

  return { ok: true, status: 200, data: { subscriber_id: subscriberId, result: result.data } };
}

async function handleSendFlow(request, env) {
  const result = await processBotFlow(env, await readJsonBody(request) || {});
  return json(result, result.status || (result.ok ? 200 : 400));
}

async function handleSendMessage(request, env) {
  const result = await processBotMessage(env, await readJsonBody(request) || {});
  return json(result, result.status || (result.ok ? 200 : 400));
}

async function handleWebhook(request, env) {
  const secretHeader = request.headers.get("x-bc-secret") || "";
  if (env.BC_WEBHOOK_SECRET && secretHeader !== env.BC_WEBHOOK_SECRET) {
    return json({ ok: false, error: "Webhook secret inválido." }, 401);
  }

  const payload = await readJsonBody(request);
  const headers = {};
  request.headers.forEach((v, k) => (headers[k] = v));

  await sbInsert(env, "botconversa_webhook_logs", [{
    event_name: payload?.event || payload?.type || "unknown",
    payload: payload || {},
    headers,
  }], "return=minimal");

  return json({ ok: true });
}

async function handleHistoricoSnapshot(request, env) {
  await requireMaster(request, env);

  const body = await readJsonBody(request);
  const dataReferencia = body?.data_referencia || new Date().toISOString().slice(0, 10);
  const rows = Array.isArray(body?.data) ? body.data : [];
  if (!rows.length) return json({ ok: false, error: "data vazio" }, 400);

  const mapped = rows.map((row) => ({
    data_referencia: dataReferencia,
    ...mapColaboradorRow(row),
    origem: body?.origem || "painel",
  }));

  await sbUpsert(env, "historico_colaboradores", mapped, "data_referencia,cpf");

  const atuais = mapped.map((r) => {
    const { snapshot_json, ...rest } = r;
    return {
      ...rest,
      metadata: { snapshot_json },
      updated_at: new Date().toISOString(),
    };
  });

  await sbUpsert(env, "colaboradores", atuais, "cpf");

  return json({ ok: true, total: mapped.length, data_referencia: dataReferencia });
}

async function handleHistoricoList(request, env, url) {
  await requireMaster(request, env);

  const data = url.searchParams.get("data");
  const nome = url.searchParams.get("nome");
  const empresa = url.searchParams.get("empresa");
  const limit = Math.min(Number(url.searchParams.get("limit") || 200), 1000);

  const filters = ["select=*"];
  if (data) filters.push(`data_referencia=eq.${encodeURIComponent(data)}`);
  if (nome) filters.push(`nome=ilike.*${encodeURIComponent(nome)}*`);
  if (empresa) filters.push(`empresa=ilike.*${encodeURIComponent(empresa)}*`);
  filters.push("order=data_referencia.desc,nome.asc");
  filters.push(`limit=${limit}`);

  return json({ ok: true, items: await sbSelect(env, `historico_colaboradores?${filters.join("&")}`) });
}

async function handleBotLogs(request, env, url) {
  await requireMaster(request, env);

  const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500);
  const tipo = url.searchParams.get("tipo");
  const sucesso = url.searchParams.get("sucesso");

  const filters = ["select=*"];
  if (tipo) filters.push(`tipo=eq.${encodeURIComponent(tipo)}`);
  if (sucesso === "true" || sucesso === "false") filters.push(`sucesso=eq.${sucesso}`);
  filters.push("order=created_at.desc");
  filters.push(`limit=${limit}`);

  return json({ ok: true, items: await sbSelect(env, `botconversa_logs?${filters.join("&")}`) });
}

async function handleBotQueue(request, env, url) {
  await requireMaster(request, env);

  const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500);
  const status = url.searchParams.get("status");

  const filters = ["select=*"];
  if (status) filters.push(`status=eq.${encodeURIComponent(status)}`);
  filters.push("order=created_at.desc");
  filters.push(`limit=${limit}`);

  return json({ ok: true, items: await sbSelect(env, `botconversa_fila?${filters.join("&")}`) });
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers, rows, delimiter = ",") {
  const bom = "\ufeff";
  const lines = [headers.map(csvEscape).join(delimiter)];
  for (const row of rows) lines.push(row.map(csvEscape).join(delimiter));
  return bom + lines.join("\n");
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toSpreadsheetXml(worksheetName, headers, rows) {
  const headerRow = headers.map((h) => `<Cell><Data ss:Type="String">${xmlEscape(h)}</Data></Cell>`).join("");
  const bodyRows = rows.map((row) => {
    const cells = row.map((value) => `<Cell><Data ss:Type="String">${xmlEscape(value ?? "")}</Data></Cell>`).join("");
    return `<Row>${cells}</Row>`;
  }).join("");

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Worksheet ss:Name="${xmlEscape(worksheetName)}">
  <Table>
   <Row>${headerRow}</Row>
   ${bodyRows}
  </Table>
 </Worksheet>
</Workbook>`;
}

function base64Utf8(text) {
  return btoa(unescape(encodeURIComponent(text)));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function xInsert(env, table, row) {
  const out = await supabaseRest(env, table, {
    method: "POST",
    service: true,
    headers: { Prefer: "return=representation" },
    body: row,
  });
  return Array.isArray(out) ? out[0] : out;
}

async function xPatchById(env, table, id, patch) {
  const out = await supabaseRest(env, `${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    service: true,
    headers: { Prefer: "return=representation" },
    body: patch,
  });
  return Array.isArray(out) ? out[0] : out;
}

function normalizeIsoDate(value) {
  const s = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function distinctLatestByCpf(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const cpf = String(row?.cpf || "").trim();
    if (!cpf) continue;
    const prev = map.get(cpf);
    if (!prev) {
      map.set(cpf, row);
      continue;
    }
    const prevRef = String(prev?.data_referencia || "");
    const currRef = String(row?.data_referencia || "");
    if (currRef > prevRef) map.set(cpf, row);
  }
  return [...map.values()].sort((a, b) => String(a?.nome || "").localeCompare(String(b?.nome || "")));
}

async function getLatestSnapshotReference(env) {
  const rows = await supabaseRest(
    env,
    "colaborador_importacoes?select=data_referencia,status&status=eq.processado&order=data_referencia.desc&limit=1",
    { service: true }
  );
  return Array.isArray(rows) && rows[0]?.data_referencia ? rows[0].data_referencia : null;
}

async function loadColaboradores(env, filtros = {}) {
  const latestReference = await getLatestSnapshotReference(env);
  if (!latestReference) {
    return { rows: [], debug: { latest_reference: null, total_base: 0, total_filtrado: 0, total_distinct: 0 } };
  }

  const parts = [
    "select=cpf,nome,situacao,admissao,desligamento,ativo,empresa,coordenacao,supervisao,tipo,cargo,whatsapp,email_pessoal,email_empresa,cidade,bairro,endereco,complemento,estado,cep,data_nascimento,data_referencia",
    "admissao=not.is.null",
    `data_referencia=lte.${encodeURIComponent(latestReference)}`,
    `limit=${Math.min(Number(filtros.limit || 10000), 10000)}`,
    "order=data_referencia.desc"
  ];

  if (filtros.empresa) parts.push(`empresa=ilike.*${encodeURIComponent(filtros.empresa)}*`);
  if (filtros.nome) parts.push(`nome=ilike.*${encodeURIComponent(filtros.nome)}*`);

  const baseRows = await supabaseRest(env, `colaborador_snapshot?${parts.join("&")}`, { service: true });
  const totalBase = Array.isArray(baseRows) ? baseRows.length : 0;

  const dataInicial = normalizeIsoDate(filtros.data_admissao_inicial);
  const dataFinal = normalizeIsoDate(filtros.data_admissao_final);
  const situacaoFiltro = String(filtros.situacao || "Ativo");

  let filtrados = (baseRows || []).filter((row) => {
    const adm = normalizeIsoDate(row?.admissao);
    if (!adm) return false;
    if (dataInicial && adm < dataInicial) return false;
    if (dataFinal && adm > dataFinal) return false;

    if (situacaoFiltro !== "Todos") {
      if (situacaoFiltro === "Ativo" && row?.ativo !== true) return false;
      if (situacaoFiltro === "Não Ativo" && row?.ativo !== false) return false;
      if (situacaoFiltro !== "Ativo" && situacaoFiltro !== "Não Ativo") {
        if (String(row?.situacao || "") !== situacaoFiltro) return false;
      }
    }
    return true;
  });

  const rows = distinctLatestByCpf(filtrados);

  return {
    rows,
    debug: {
      latest_reference: latestReference,
      total_base: totalBase,
      total_filtrado: filtrados.length,
      total_distinct: rows.length,
      data_inicial: dataInicial,
      data_final: dataFinal,
      situacao: situacaoFiltro
    }
  };
}

const CNPJ_FIXO = "29.666.679/0001-34";

function formatCpf(value) {
  const s = String(value || "").replace(/\D+/g, "");
  if (s.length !== 11) return value || "";
  return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
}

function formatPhoneBr(value) {
  const s = String(value || "").replace(/\D+/g, "");
  const local = s.startsWith("55") ? s.slice(2) : s;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return value || "";
}

function formatDateBr(value) {
  const s = String(value || "").slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return value || "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function mapGoogleContacts(colabs) {
  const headers = ["Name", "Phone 1 - Value", "E-mail 1 - Value", "Organization 1 - Name", "Notes"];
  const rows = colabs.map((c) => {
    const coord = c.coordenacao || c.supervisao || "";
    const displayName = coord ? `${c.nome || ""} (${coord})` : (c.nome || "");
    const notes = [c.cargo || "", c.tipo || ""].filter(Boolean).join(" ");
    return [
      displayName,
      formatPhoneBr(c.whatsapp || ""),
      c.email_empresa || c.email_pessoal || "",
      c.empresa || "",
      notes
    ];
  });
  return { headers, rows, filename: `Contatos_GoogleContacts_${todayIso()}.csv`, delimiter: ";" };
}

function mapCartoes(colabs, tipo) {
  if (tipo === "ifood") {
    const headers = [
      "CNPJ", "Nome", "CPF", "Data de nascimento", "Email", "Celular",
      "Centro de custo", "Grupo de entrega", "Filtro para relatorio de recarga (opcional)",
      "Refeição (Aderente ao PAT) (opcional)", "Alimentação (Aderente ao PAT) (opcional)", "Livre (opcional)"
    ];
    const rows = colabs.map((c) => [
      CNPJ_FIXO, c.nome || "", formatCpf(c.cpf || ""), formatDateBr(c.data_nascimento || ""),
      c.email_empresa || c.email_pessoal || "", formatPhoneBr(c.whatsapp || ""),
      "", "", "", "", "", ""
    ]);
    return {
      headers, rows,
      filename: `Cadastro_Pessoas_Ifood_${todayIso()}.xls`,
      format: "xlsxml",
      worksheetName: "Cadastro Pessoas Ifood"
    };
  }

  const headers = ["Nome completo", "CPF", "Celular", "E-mail", "CNPJ"];
  const rows = colabs.map((c) => [
    c.nome || "", formatCpf(c.cpf || ""), formatPhoneBr(c.whatsapp || ""),
    c.email_empresa || c.email_pessoal || "", CNPJ_FIXO
  ]);
  return {
    headers, rows,
    filename: `Cadastro_Pessoas_Flash_${todayIso()}.xls`,
    format: "xlsxml",
    worksheetName: "Cadastro Pessoas Flash"
  };
}

function mapUber(colabs) {
  const headers = [
    "First Name", "Last Name", "Email Address", "ID (Optional)",
    "Group Name (Optional)", "Reviewer Email (Optional)", "Mobile Country Code", "Mobile Number"
  ];
  const rows = colabs.map((c) => {
    const nome = c.nome || "";
    const partes = nome.trim().split(/\s+/).filter(Boolean);
    let mobile = String(c.whatsapp || "").replace(/\D+/g, "");
    if (mobile.startsWith("55")) mobile = mobile.slice(2);
    return [
      partes[0] || nome,
      partes.slice(1).join(" "),
      c.email_empresa || c.email_pessoal || "",
      String(c.cpf || "").replace(/\D+/g, ""),
      c.empresa || "",
      "",
      "55",
      mobile
    ];
  });
  return { headers, rows, filename: `Cadastro_Uber_${todayIso()}.csv` };
}

async function finalizeExport(env, job, tipo, spec, debug = null) {
  const delimiter = spec.delimiter || ",";
  const content =
    spec.format === "xlsxml"
      ? toSpreadsheetXml(spec.worksheetName || "Planilha", spec.headers, spec.rows)
      : toCsv(spec.headers, spec.rows, delimiter);

  const mimeType =
    spec.format === "xlsxml"
      ? "application/vnd.ms-excel; charset=utf-8"
      : "text/csv; charset=utf-8";

  const contentBase64 = base64Utf8(content);

  const arquivo = await xInsert(env, "exportacoes_arquivos", {
    job_id: job.id,
    tipo,
    filename: spec.filename,
    mime_type: mimeType,
    content_base64: contentBase64,
    bytes_size: new TextEncoder().encode(content).length
  });

  await xPatchById(env, "exportacoes_jobs", job.id, {
    status: "concluido",
    total_registros: spec.rows.length,
    arquivo_id: arquivo.id,
    finished_at: new Date().toISOString()
  });

  return {
    job_id: job.id,
    arquivo_id: arquivo.id,
    filename: arquivo.filename,
    total: spec.rows.length,
    debug
  };
}

async function createExport(request, env, tipo) {
  const auth = await requireMaster(request, env);
  const body = await readJsonBody(request) || {};
  const job = await xInsert(env, "exportacoes_jobs", {
    tipo,
    status: "processando",
    filtros: body,
    created_by: auth.authUser.id
  });

  try {
    const loaded = await loadColaboradores(env, body);
    const colabs = loaded.rows;
    let spec;
    if (tipo === "google_contacts") spec = mapGoogleContacts(colabs);
    if (tipo === "flash") spec = mapCartoes(colabs, "flash");
    if (tipo === "ifood") spec = mapCartoes(colabs, "ifood");
    if (tipo === "uber") spec = mapUber(colabs);

    return json({ ok: true, ...(await finalizeExport(env, job, tipo, spec, loaded.debug)) });
  } catch (err) {
    await xPatchById(env, "exportacoes_jobs", job.id, {
      status: "erro",
      erro: String(err?.message || err),
      finished_at: new Date().toISOString()
    });
    throw err;
  }
}

async function getExportJobs(request, env) {
  await requireMaster(request, env);
  const rows = await supabaseRest(env, "exportacoes_jobs?select=*&order=created_at.desc&limit=100", { service: true });
  return json({ ok: true, items: rows || [] });
}

async function downloadExport(request, env) {
  await requireMaster(request, env);
  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") || "").trim();
  if (!id) return json({ ok: false, error: "id é obrigatório" }, 400);

  const rows = await supabaseRest(env, `exportacoes_arquivos?select=*&id=eq.${encodeURIComponent(id)}&limit=1`, { service: true });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return json({ ok: false, error: "Arquivo não encontrado" }, 404);

  const bytes = Uint8Array.from(atob(row.content_base64), c => c.charCodeAt(0));
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": row.mime_type || "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${row.filename}"`,
      ...corsHeaders(),
    }
  });
}

function buildTags(c) {
  const tags = [];
  if (c.empresa) tags.push(`EMPRESA:${c.empresa}`);
  if (c.cargo) tags.push(`CARGO:${c.cargo}`);
  if (c.cidade) tags.push(`CIDADE:${c.cidade}`);
  return tags;
}

async function createBotJob(request, env, tipo) {
  const auth = await requireMaster(request, env);
  const body = await readJsonBody(request) || {};
  return xInsert(env, "botconversa_jobs", {
    tipo,
    status: "processando",
    filtros: body,
    created_by: auth.authUser.id
  });
}

async function finishBotJob(env, job, patch) {
  return xPatchById(env, "botconversa_jobs", job.id, {
    ...patch,
    finished_at: new Date().toISOString()
  });
}

async function syncSubscribers(request, env) {
  const body = await readJsonBody(request) || {};
  const job = await createBotJob(request, env, "sync_subscribers");

  try {
    const loaded = await loadColaboradores(env, body);
    const todos = Array.isArray(loaded?.rows) ? loaded.rows : [];

    const offset = Math.max(Number(body.offset || 0), 0);
    const maxProcess = Math.max(1, Math.min(Number(body.max_process || 5), 5));
    const colabs = todos.slice(offset, offset + maxProcess);

    let okCount = 0, errCount = 0;

    const cpfs = colabs.map(c => String(c?.cpf || "").trim()).filter(Boolean);
    const contatosExistentes = await sbSelectByCpfs(env, "botconversa_contatos", cpfs, "id,cpf");
    const contatoMap = new Map((contatosExistentes || []).map(r => [String(r.cpf || "").trim(), r]));

    const logsBuffer = [];
    const tagsBuffer = [];
    const contatosInsert = [];
    const contatosPatch = [];

    for (const c of colabs) {
      const telefone = normalizePhoneBR(c?.whatsapp);
      if (!telefone) {
        errCount++;
        logsBuffer.push({
          job_id: job.id,
          tipo: "sync_subscribers",
          nome: c?.nome || "",
          cpf: c?.cpf || "",
          telefone: "",
          empresa: c?.empresa || "",
          subscriber_id: null,
          sucesso: false,
          http_status: 400,
          erro: "Telefone inválido",
          request_payload: c || {},
          response_payload: null
        });
        continue;
      }

      const nomeParts = splitFullName(c?.nome || "");
      const payload = {
        first_name: nomeParts.first_name,
        last_name: nomeParts.last_name,
        phone: telefone
      };
      const bc = await callBotConversaApi(env, "/subscriber/", payload).catch(e => ({ ok:false, status:500, data:String(e) }));
      const subscriberId = bc?.data?.id || bc?.data?.subscriber?.id || "";

      if (bc.ok) okCount++;
      else errCount++;

      const existente = contatoMap.get(String(c?.cpf || "").trim()) || null;
      const contatoPayload = {
        cpf: c?.cpf || null,
        nome: c?.nome || "",
        telefone,
        email: c?.email_empresa || c?.email_pessoal || "",
        empresa: c?.empresa || "",
        ativo: true,
        subscriber_id: subscriberId || null,
        synced_at: new Date().toISOString(),
        metadata: c || {}
      };

      if (existente?.id) {
        contatosPatch.push({ id: existente.id, ...contatoPayload });
      } else {
        contatosInsert.push(contatoPayload);
      }

      const tags = buildTags(c);
      for (const tag of tags) {
        tagsBuffer.push({
          cpf: c?.cpf || null,
          nome: c?.nome || "",
          telefone,
          tag
        });
      }

      logsBuffer.push({
        job_id: job.id,
        tipo: "sync_subscribers",
        nome: c?.nome || "",
        cpf: c?.cpf || "",
        telefone,
        empresa: c?.empresa || "",
        subscriber_id: subscriberId || null,
        sucesso: !!bc.ok,
        http_status: bc.status || null,
        erro: bc.ok ? null : "Falha ao sincronizar subscriber",
        request_payload: payload,
        response_payload: bc.data || null
      });
    }

    for (const row of contatosPatch) {
      const { id, ...patch } = row;
      await xPatchById(env, "botconversa_contatos", id, patch);
    }

    if (contatosInsert.length) {
      await sbInsertChunks(env, "botconversa_contatos", contatosInsert, "return=minimal", 100);
    }

    if (tagsBuffer.length) {
      const contatosSync = await sbSelectByCpfs(env, "botconversa_contatos", cpfs, "id,cpf");
      const contatoIdMap = new Map((contatosSync || []).map(r => [String(r.cpf || "").trim(), r.id]));
      const rows = tagsBuffer
        .map(t => ({
          contato_id: contatoIdMap.get(String(t.cpf || "").trim()) || null,
          tag: t.tag
        }))
        .filter(r => r.contato_id && r.tag);

      if (rows.length) {
        await sbInsertChunks(env, "botconversa_tags", rows, "return=minimal", 100);
      }
    }

    if (logsBuffer.length) {
      await sbInsertChunks(env, "botconversa_logs", logsBuffer, "return=minimal", 100);
    }

    const nextOffset = offset + colabs.length;
    const hasMore = nextOffset < todos.length;

    await finishBotJob(env, job, {
      status: hasMore ? "processando" : "concluido",
      total_processado: colabs.length,
      total_sucesso: okCount,
      total_erro: errCount,
      observacoes: hasMore ? `Continua em offset ${nextOffset}` : null
    });

    return json({
      ok: true,
      total_disponivel: todos.length,
      processados_nesta_execucao: colabs.length,
      sucesso: okCount,
      erro: errCount,
      offset_atual: offset,
      next_offset: nextOffset,
      has_more: hasMore,
      max_process: maxProcess,
      job_id: job.id
    });
  } catch (err) {
    await finishBotJob(env, job, { status: "erro", erro: String(err?.message || err) });
    throw err;
  }
}

async function sendBirthdayFlow(request, env) {
  const body = await readJsonBody(request) || {};
  const job = await createBotJob(request, env, "birthday_flow");

  try {
    const today = body.data || todayIso();
    const mmdd = today.slice(5);
    const loaded = await loadColaboradores(env, body);
    const baseRows = Array.isArray(loaded?.rows) ? loaded.rows : [];
    const colabs = baseRows.filter(c => String(c.data_nascimento || "").slice(5) === mmdd);

    let okCount = 0, errCount = 0;
    for (const c of colabs) {
      const telefone = normalizePhoneBR(c.whatsapp);
      if (!telefone) { errCount++; continue; }

      const lookup = await callBotConversaApi(env, `/subscriber/get_by_phone/${telefone}/`, null, "GET");
      const subscriberId = lookup?.data?.id || lookup?.data?.subscriber?.id || lookup?.data?.results?.[0]?.id || "";
      let flowResp = { ok: false, status: 404, data: "subscriber_id não encontrado" };

      if (subscriberId) {
        flowResp = await callBotConversaApi(env, `/subscriber/${subscriberId}/send_flow/`, {
          flow: Number(env.BC_BIRTHDAY_FLOW_ID || body.flow_id || 0) || String(env.BC_BIRTHDAY_FLOW_ID || body.flow_id || "")
        });
      }

      if (flowResp.ok) okCount++; else errCount++;

      await logBot(env, {
        job_id: job.id,
        tipo: "birthday_flow",
        nome: c.nome || "",
        cpf: c.cpf || "",
        telefone,
        empresa: c.empresa || "",
        subscriber_id: subscriberId || null,
        flow_id: String(env.BC_BIRTHDAY_FLOW_ID || body.flow_id || ""),
        sucesso: !!flowResp.ok,
        http_status: flowResp.status || null,
        erro: flowResp.ok ? null : "Falha no envio do flow de aniversário",
        request_payload: { flow_id: env.BC_BIRTHDAY_FLOW_ID || body.flow_id || "" },
        response_payload: flowResp.data || null
      });
    }

    await finishBotJob(env, job, {
      status: "concluido",
      total_processado: colabs.length,
      total_sucesso: okCount,
      total_erro: errCount
    });

    return json({ ok: true, total: colabs.length, sucesso: okCount, erro: errCount, job_id: job.id });
  } catch (err) {
    await finishBotJob(env, job, { status: "erro", erro: String(err?.message || err) });
    throw err;
  }
}

async function notificarCartoes(request, env) {
  const body = await readJsonBody(request) || {};
  const job = await createBotJob(request, env, "notificar_cartoes");

  try {
    const loaded = await loadColaboradores(env, body);
    const colabs = Array.isArray(loaded?.rows) ? loaded.rows : [];
    let okCount = 0, errCount = 0;

    for (const c of colabs) {
      const telefone = normalizePhoneBR(c.whatsapp);
      if (!telefone) { errCount++; continue; }

      const msg = body.mensagem || `Olá, ${c.nome || ""}! Seu cartão já está disponível.`;
      const lookup = await callBotConversaApi(env, `/subscriber/get_by_phone/${telefone}/`, null, "GET");
      const subscriberId = lookup?.data?.id || lookup?.data?.subscriber?.id || lookup?.data?.results?.[0]?.id || "";
      let sendResp = { ok: false, status: 404, data: "subscriber_id não encontrado" };

      if (subscriberId) {
        sendResp = await callBotConversaApi(env, `/subscriber/${subscriberId}/send_message/`, { type: "text", value: msg });
      }

      if (sendResp.ok) okCount++; else errCount++;

      await logBot(env, {
        job_id: job.id,
        tipo: "notificar_cartoes",
        nome: c.nome || "",
        cpf: c.cpf || "",
        telefone,
        empresa: c.empresa || "",
        subscriber_id: subscriberId || null,
        mensagem: msg,
        sucesso: !!sendResp.ok,
        http_status: sendResp.status || null,
        erro: sendResp.ok ? null : "Falha no envio da notificação",
        request_payload: { mensagem: msg },
        response_payload: sendResp.data || null
      });
    }

    await finishBotJob(env, job, {
      status: "concluido",
      total_processado: colabs.length,
      total_sucesso: okCount,
      total_erro: errCount
    });

    return json({ ok: true, total: colabs.length, sucesso: okCount, erro: errCount, job_id: job.id });
  } catch (err) {
    await finishBotJob(env, job, { status: "erro", erro: String(err?.message || err) });
    throw err;
  }
}

async function getBotJobs(request, env) {
  await requireMaster(request, env);
  const rows = await supabaseRest(env, "botconversa_jobs?select=*&order=created_at.desc&limit=100", { service: true });
  return json({ ok: true, items: rows || [] });
}

async function upsertBotSubscriber(env, contato) {
  const telefone = normalizePhoneBR(contato?.whatsapp || contato?.telefone || "");
  if (!telefone) return { ok: false, error: "Telefone inválido" };

  const nomeParts = splitFullName(contato?.nome || "");
  const createResp = await callBotConversaApi(env, "/subscriber/", {
    first_name: nomeParts.first_name,
    last_name: nomeParts.last_name,
    phone: telefone,
  }).catch(err => ({ ok: false, status: 500, data: String(err) }));

  const createdId =
    createResp?.data?.id ||
    createResp?.data?.subscriber?.id ||
    createResp?.data?.results?.[0]?.id ||
    "";

  if (createdId) {
    return { ok: true, subscriberId: String(createdId), raw: createResp, created: true };
  }

  const lookup = await findSubscriberIdByPhone(env, telefone);
  if (lookup.ok) {
    return { ok: true, subscriberId: String(lookup.subscriberId), raw: lookup.raw, created: false };
  }

  return {
    ok: false,
    error: createResp?.data?.error || createResp?.data?.message || lookup?.error || "Falha ao criar/localizar subscriber",
    raw: createResp
  };
}

async function applySubscriberTags(env, subscriberId, tags = []) {
  const uniqueTags = [...new Set((tags || []).map(v => String(v || "").trim()).filter(Boolean))];
  const results = [];

  for (const tag of uniqueTags) {
    let success = false;
    let lastResult = null;

    const attempts = [
      { endpoint: `/subscriber/${subscriberId}/tag/`, payload: { name: tag }, method: "POST" },
      { endpoint: `/subscriber/${subscriberId}/tags/`, payload: { name: tag }, method: "POST" },
      { endpoint: `/subscriber/${subscriberId}/tags/`, payload: { tag }, method: "POST" },
      { endpoint: `/subscriber/${subscriberId}/tags/`, payload: { label: tag }, method: "POST" },
    ];

    for (const attempt of attempts) {
      const resp = await callBotConversaApi(env, attempt.endpoint, attempt.payload, attempt.method).catch(err => ({
        ok: false,
        status: 500,
        data: String(err)
      }));
      lastResult = resp;
      if (resp.ok) {
        success = true;
        break;
      }
    }

    results.push({ tag, ok: success, raw: lastResult });
  }

  return {
    ok: results.every(r => r.ok),
    results,
  };
}

async function deleteBotSubscriber(env, telefone) {
  const lookup = await findSubscriberIdByPhone(env, telefone);
  if (!lookup.ok) return { ok: true, skipped: true, reason: "subscriber não encontrado" };

  const subscriberId = String(lookup.subscriberId);
  const attempts = [
    { endpoint: `/subscriber/${subscriberId}/`, method: "DELETE" },
    { endpoint: `/subscriber/${subscriberId}`, method: "DELETE" },
    { endpoint: `/subscriber/delete/${subscriberId}/`, method: "POST", payload: {} },
  ];

  for (const attempt of attempts) {
    const resp = await callBotConversaApi(env, attempt.endpoint, attempt.payload || null, attempt.method).catch(err => ({
      ok: false,
      status: 500,
      data: String(err)
    }));
    if (resp.ok) {
      return { ok: true, subscriberId, raw: resp };
    }
  }

  return { ok: false, subscriberId, error: "Falha ao excluir subscriber" };
}

async function startSyncSubscribers(request, env) {
  const body = await readJsonBody(request) || {};
  const mergedFilters = { ...body, situacao: "Todos", limit: 10000 };
  const job = await createBotJob(request, env, "sync_start");

  try {
    const loaded = await loadColaboradores(env, mergedFilters);
    const todos = Array.isArray(loaded?.rows) ? loaded.rows : [];

    const fila = todos.map((c) => ({
      job_id: job.id,
      tipo: c?.ativo === false ? "sync_delete_subscriber" : "sync_upsert_subscriber",
      payload: c,
      status: "pending",
      tentativas: 0,
      max_tentativas: 3,
      erro: null,
    }));

    if (fila.length) {
      await sbInsertChunks(env, "botconversa_fila", fila, "return=minimal", 200);
    }

    await finishBotJob(env, job, {
      status: fila.length ? "processando" : "concluido",
      total_processado: 0,
      total_sucesso: 0,
      total_erro: 0,
      observacoes: `Fila criada com ${fila.length} registros`,
    });

    return json({
      ok: true,
      total_enfileirado: fila.length,
      total_base: todos.length,
      job_id: job.id,
      debug: loaded?.debug || null,
    });
  } catch (err) {
    await finishBotJob(env, job, { status: "erro", erro: String(err?.message || err) });
    throw err;
  }
}

async function processBotQueue(env, { batchSize = 20 } = {}) {
  const itens = await supabaseRest(
    env,
    `botconversa_fila?select=*&status=eq.pending&order=created_at.asc&limit=${Math.min(Math.max(Number(batchSize || 20), 1), 100)}`,
    { service: true }
  );

  const items = Array.isArray(itens) ? itens : [];
  let sucesso = 0;
  let erro = 0;

  for (const item of items) {
    const tentativasAtuais = Number(item?.tentativas || 0);
    const maxTentativas = Number(item?.max_tentativas || 3);
    const c = item?.payload || {};
    const telefone = normalizePhoneBR(c?.whatsapp || c?.telefone || "");
    let subscriberId = null;

    try {
      if (item?.tipo === "sync_delete_subscriber" || c?.ativo === false) {
        if (!telefone) throw new Error("Telefone inválido para exclusão");

        const deleted = await deleteBotSubscriber(env, telefone);
        if (!deleted.ok) throw new Error(deleted.error || "Falha ao excluir subscriber");

        await supabaseRest(env, `botconversa_fila?id=eq.${encodeURIComponent(item.id)}`, {
          method: "PATCH",
          service: true,
          headers: { Prefer: "return=minimal" },
          body: {
            status: "done",
            tentativas: tentativasAtuais + 1,
            erro: null,
          },
        });

        await logBot(env, {
          job_id: item?.job_id || null,
          tipo: "sync_delete_subscriber",
          nome: c?.nome || "",
          cpf: c?.cpf || "",
          telefone,
          empresa: c?.empresa || "",
          subscriber_id: deleted?.subscriberId || null,
          sucesso: true,
          http_status: 200,
          erro: null,
          request_payload: c,
          response_payload: { deleted: true },
        });

        if (c?.cpf) {
          const contatosExistentes = await sbSelectByCpfs(env, "botconversa_contatos", [c.cpf], "id,cpf");
          const existente = Array.isArray(contatosExistentes) ? contatosExistentes[0] : null;
          if (existente?.id) {
            await xPatchById(env, "botconversa_contatos", existente.id, {
              ativo: false,
              synced_at: new Date().toISOString(),
              metadata: c || {},
            });
          }
        }

        sucesso++;
        continue;
      }

      const upsert = await upsertBotSubscriber(env, c);
      if (!upsert.ok || !upsert.subscriberId) {
        throw new Error(upsert.error || "Falha ao criar/localizar subscriber");
      }

      subscriberId = String(upsert.subscriberId);

      const tags = buildTags(c);
      const tagResult = await applySubscriberTags(env, subscriberId, tags);

      const cpfs = c?.cpf ? [String(c.cpf).trim()] : [];
      const contatosExistentes = cpfs.length
        ? await sbSelectByCpfs(env, "botconversa_contatos", cpfs, "id,cpf")
        : [];
      const existente = Array.isArray(contatosExistentes) ? contatosExistentes[0] : null;

      const contatoPayload = {
        cpf: c?.cpf || null,
        nome: c?.nome || "",
        telefone,
        email: c?.email_empresa || c?.email_pessoal || "",
        empresa: c?.empresa || "",
        ativo: true,
        subscriber_id: subscriberId,
        synced_at: new Date().toISOString(),
        metadata: c || {},
      };

      if (existente?.id) {
        await xPatchById(env, "botconversa_contatos", existente.id, contatoPayload);
      } else {
        await sbInsert(env, "botconversa_contatos", [contatoPayload], "return=minimal");
      }

      const contatoSync = cpfs.length
        ? await sbSelectByCpfs(env, "botconversa_contatos", cpfs, "id,cpf")
        : [];
      const contatoId = Array.isArray(contatoSync) && contatoSync[0]?.id ? contatoSync[0].id : null;
      if (contatoId && tags.length) {
        const tagRows = [...new Set(tags)].map(tag => ({ contato_id: contatoId, tag }));
        await sbInsertChunks(env, "botconversa_tags", tagRows, "return=minimal", 100);
      }

      await supabaseRest(env, `botconversa_fila?id=eq.${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        service: true,
        headers: { Prefer: "return=minimal" },
        body: {
          status: tagResult.ok ? "done" : "partial",
          tentativas: tentativasAtuais + 1,
          erro: tagResult.ok ? null : "Subscriber criado, mas houve falha em uma ou mais tags",
        },
      });

      await logBot(env, {
        job_id: item?.job_id || null,
        tipo: "sync_upsert_subscriber",
        nome: c?.nome || "",
        cpf: c?.cpf || "",
        telefone,
        empresa: c?.empresa || "",
        subscriber_id: subscriberId,
        sucesso: true,
        http_status: 200,
        erro: tagResult.ok ? null : "Falha parcial nas tags",
        request_payload: c,
        response_payload: { subscriber_id: subscriberId, tags: tagResult.results || [] },
      });

      sucesso++;
    } catch (err) {
      const novaTentativa = tentativasAtuais + 1;
      const statusFinal = novaTentativa >= maxTentativas ? "error" : "pending";

      await supabaseRest(env, `botconversa_fila?id=eq.${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        service: true,
        headers: { Prefer: "return=minimal" },
        body: {
          status: statusFinal,
          tentativas: novaTentativa,
          erro: String(err?.message || err),
        },
      });

      await logBot(env, {
        job_id: item?.job_id || null,
        tipo: item?.tipo || "sync_queue",
        nome: c?.nome || "",
        cpf: c?.cpf || "",
        telefone,
        empresa: c?.empresa || "",
        subscriber_id: subscriberId,
        sucesso: false,
        http_status: 500,
        erro: String(err?.message || err),
        request_payload: c,
        response_payload: null,
      });

      erro++;
    }
  }

  const jobsAfetados = [...new Set(items.map(i => i?.job_id).filter(Boolean))];
  for (const jobId of jobsAfetados) {
    try {
      const pendentes = await supabaseRest(env, `botconversa_fila?select=id&job_id=eq.${encodeURIComponent(jobId)}&status=in.(pending,partial)&limit=1`, { service: true });
      const erros = await supabaseRest(env, `botconversa_fila?select=id&job_id=eq.${encodeURIComponent(jobId)}&status=eq.error&limit=1`, { service: true });
      const doneCount = await supabaseRest(env, `botconversa_fila?select=id&job_id=eq.${encodeURIComponent(jobId)}&status=eq.done`, { service: true });

      await xPatchById(env, "botconversa_jobs", jobId, {
        status: Array.isArray(pendentes) && pendentes.length ? "processando" : "concluido",
        total_processado: Array.isArray(doneCount) ? doneCount.length : 0,
        total_sucesso: null,
        total_erro: Array.isArray(erros) ? erros.length : 0,
        observacoes: Array.isArray(pendentes) && pendentes.length ? "Fila em processamento" : "Fila finalizada",
        finished_at: Array.isArray(pendentes) && pendentes.length ? null : new Date().toISOString(),
      });
    } catch (_) {}
  }

  return { ok: true, total_lidos: items.length, sucesso, erro };
}

// ==============================
// Relatórios - importação real
// ==============================
const RELATORIO_TIPO_TO_TABLE = {
  "caixa-fornecedor": "relatorios_importacoes",
  "despesas": "relatorios_importacoes",
  "notas-fiscais": "relatorios_importacoes",
  "producao-consolidada": "relatorios_importacoes",
  "resultado-diario-gavilon": "relatorio_resultado_gavilon",
};

function fileSizeMb(size) {
  return Number(((Number(size || 0) / (1024 * 1024)) || 0).toFixed(2));
}

function parseCsvRows(text, delimiter = ",") {
  const lines = String(text || "").replace(/\r/g, "").split("\n").filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };

  const splitLine = (line) => {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const next = line[i + 1];
      if (ch === '"') {
        if (inQuotes && next === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  const headers = splitLine(lines[0]).map((v) => String(v || "").trim());
  const rows = lines.slice(1).map(splitLine).filter((row) => row.some((v) => String(v || "").trim() !== ""));
  return { headers, rows };
}

function toObjectRows(headers, rows) {
  return rows.map((row) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] ?? null;
    });
    return obj;
  });
}

function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function detectDelimiter(text) {
  const sample = String(text || "").split(/\r?\n/).slice(0, 3).join("\n");
  const comma = (sample.match(/,/g) || []).length;
  const semi = (sample.match(/;/g) || []).length;
  const tab = (sample.match(/\t/g) || []).length;
  if (tab > comma && tab > semi) return "\t";
  return semi > comma ? ";" : ",";
}

async function parseUploadedSpreadsheet(file) {
  const name = String(file?.name || "").toLowerCase();
  const text = await file.text();
  const delimiter = detectDelimiter(text);
  const parsed = parseCsvRows(text, delimiter);
  return {
    mode: name.endsWith(".csv") || name.endsWith(".txt") ? "csv" : "text",
    rawText: text,
    headers: parsed.headers,
    rows: toObjectRows(parsed.headers, parsed.rows),
  };
}

function summarizeImport(headers, rows) {
  return {
    total_rows: Array.isArray(rows) ? rows.length : 0,
    headers: headers || [],
  };
}

async function listRelatorioHistory(env, tipo) {
  return await supabaseRest(
    env,
    `relatorios_importacoes?select=*&tipo=eq.${encodeURIComponent(tipo)}&order=created_at.desc&limit=20`,
    { service: true }
  );
}

async function registerRelatorioImport(env, payload) {
  const out = await supabaseRest(env, "relatorios_importacoes", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=representation" },
    body: payload,
  });
  return Array.isArray(out) ? out[0] : out;
}

function mapSimpleReportRows(tipo, parsed, importacaoId, fileName) {
  const headers = parsed.headers || [];
  const objectRows = parsed.rows || [];
  return objectRows.map((row) => ({
    importacao_id: importacaoId,
    tipo,
    file_name: fileName,
    payload: row,
    headers,
  }));
}

// ===== GAVILON
function stripTags(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeGavilonHeader(value) {
  return stripTags(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseBRNumber(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const cleaned = s
    .replace(/R\$\s*/gi, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseInteger(value) {
  const n = parseBRNumber(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function parseBRDate(value) {
  const s = String(value || "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

function extractHtmlTables(html) {
  return [...String(html).matchAll(/<table[\s\S]*?<\/table>/gi)].map(m => m[0]);
}

function extractRows(tableHtml) {
  return [...String(tableHtml).matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(m => m[0]);
}

function extractCells(rowHtml) {
  return [...String(rowHtml).matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m => stripTags(m[1]));
}

function findDataTable(tables) {
  let best = null;
  for (const table of tables) {
    const rows = extractRows(table).map(extractCells).filter(r => r.length);
    if (!rows.length) continue;
    const header = rows[0].map(normalizeGavilonHeader);
    const score = [
      "regiao",
      "n° classif. utilizados",
      "data",
      "os",
      "produto",
      "classificador",
      "cliente",
      "fazenda/armazem",
      "tons classificadas d-1",
      "valor total embarcado"
    ].filter((h) => header.includes(h)).length;

    if (!best || score > best.score) best = { score, rows };
  }
  return best;
}

function mapHeaderIndexes(headerRow) {
  const header = headerRow.map(normalizeGavilonHeader);
  const byName = (names) => {
    for (const name of names) {
      const idx = header.indexOf(normalizeGavilonHeader(name));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  return {
    regiao: byName(["Região", "Regiao"]),
    classif_utilizados: byName(["N° Classif. Utilizados", "Nº Classif. Utilizados", "N. Classif. Utilizados"]),
    data: byName(["Data"]),
    os: byName(["OS"]),
    produto: byName(["Produto"]),
    classificador: byName(["Classificador"]),
    cliente: byName(["Cliente"]),
    fazenda_armazem: byName(["Fazenda/Armazém", "Fazenda/Armazem"]),
    numero_veiculos: byName(["N° Veíc.", "Nº Veíc.", "N° Veic.", "Nº Veic."]),
    tons_classificadas_d1: byName(["Tons Classificadas D-1"]),
    valor_tons: byName(["Valor Tons"]),
    cadencia_tons_dia: byName(["Cadência tons/dia", "Cadencia tons/dia"]),
    total_cadencia: byName(["Total Cadência", "Total Cadencia"]),
    total_embarcado: byName(["Total Embarcado"]),
    valor_total_embarcado: byName(["Valor Total Embarcado"]),
    teste_aflatoxina: byName(["Teste Aflatoxina"]),
    teste: byName(["Teste"]),
    valor_teste: byName(["Valor Teste"]),
    total_embarcado_mais_teste: byName(["Total Embarcado + Teste"]),
    ocorrencia: byName(["Ocorrência", "Ocorrencia"]),
    ocorrencia_gavilon: byName(["Ocorrência Gavilon", "Ocorrencia Gavilon"]),
  };
}

function rowValue(row, idx) {
  if (idx < 0) return null;
  const value = row[idx];
  return value == null ? null : String(value).trim();
}

function normalizeGavilonRecord(row, map, importacaoId, fileName) {
  return {
    importacao_id: importacaoId,
    file_name: fileName || null,
    regiao: rowValue(row, map.regiao),
    classif_utilizados: parseInteger(rowValue(row, map.classif_utilizados)),
    data: parseBRDate(rowValue(row, map.data)),
    os: rowValue(row, map.os),
    produto: rowValue(row, map.produto),
    classificador: rowValue(row, map.classificador),
    cliente: rowValue(row, map.cliente),
    fazenda_armazem: rowValue(row, map.fazenda_armazem),
    numero_veiculos: parseInteger(rowValue(row, map.numero_veiculos)),
    tons_classificadas_d1: parseInteger(rowValue(row, map.tons_classificadas_d1)),
    valor_tons: parseBRNumber(rowValue(row, map.valor_tons)),
    cadencia_tons_dia: parseInteger(rowValue(row, map.cadencia_tons_dia)),
    total_cadencia: parseInteger(rowValue(row, map.total_cadencia)),
    total_embarcado: parseInteger(rowValue(row, map.total_embarcado)),
    valor_total_embarcado: parseBRNumber(rowValue(row, map.valor_total_embarcado)),
    teste_aflatoxina: rowValue(row, map.teste_aflatoxina),
    teste: parseBRNumber(rowValue(row, map.teste)),
    valor_teste: parseBRNumber(rowValue(row, map.valor_teste)),
    total_embarcado_mais_teste: parseBRNumber(rowValue(row, map.total_embarcado_mais_teste)),
    ocorrencia: rowValue(row, map.ocorrencia),
    ocorrencia_gavilon: rowValue(row, map.ocorrencia_gavilon),
  };
}

function isMeaningfulGavilonRecord(rec) {
  return !!(rec.regiao || rec.data || rec.os || rec.classificador || rec.total_embarcado);
}

async function parseGavilonFile(file) {
  const text = await file.text();
  const tables = extractHtmlTables(text);
  if (!tables.length) throw new Error("Nenhuma tabela HTML encontrada no arquivo Gavilon.");

  const best = findDataTable(tables);
  if (!best || !best.rows || best.rows.length < 2) throw new Error("Tabela principal do relatório Gavilon não encontrada.");

  const [headerRow, ...dataRows] = best.rows;
  const headerMap = mapHeaderIndexes(headerRow);

  if (headerMap.regiao < 0 || headerMap.data < 0 || headerMap.classificador < 0) {
    throw new Error("Cabeçalhos esperados do Gavilon não encontrados.");
  }

  return {
    headers: headerRow,
    rows: dataRows,
  };
}

async function handleRelatorioImport(request, env, tipo, action = "import") {
  await requireMaster(request, env);

  const form = await request.formData();
  const file = form.get("file");
  if (!file) return json({ ok: false, error: "Arquivo não enviado." }, 400);

  const fileName = String(file.name || `${tipo}.xlsx`);
  const fileInfo = { file_name: fileName, file_size_mb: fileSizeMb(file.size) };

  if (tipo === "resultado-diario-gavilon") {
    const parsed = await parseGavilonFile(file);
    const summary = { total_rows: parsed.rows.length, headers: parsed.headers };

    if (action === "validate") {
      return json({
        ok: true,
        ...fileInfo,
        ...summary,
        message: "Validação Gavilon concluída.",
      });
    }

    const importacao = await registerRelatorioImport(env, {
      tipo,
      file_name: fileName,
      status: "concluido",
      total_rows: summary.total_rows,
      message: "Importação Gavilon concluída com sucesso."
    });

    const rows = parsed.rows
      .map((row) => normalizeGavilonRecord(row, mapHeaderIndexes(parsed.headers), importacao?.id || null, fileName))
      .filter(isMeaningfulGavilonRecord);

    if (rows.length) {
      await sbInsertChunks(env, "relatorio_resultado_gavilon", rows, "return=minimal", 200);
    }

    return json({
      ok: true,
      ...fileInfo,
      total_rows: rows.length,
      message: "Importação Gavilon concluída com sucesso."
    });
  }

  const parsed = await parseUploadedSpreadsheet(file);
  const summary = summarizeImport(parsed.headers, parsed.rows);

  if (action === "validate") {
    return json({
      ok: true,
      ...fileInfo,
      ...summary,
      message: "Validação concluída."
    });
  }

  await registerRelatorioImport(env, {
    tipo,
    file_name: fileName,
    status: "concluido",
    total_rows: summary.total_rows,
    message: "Arquivo recebido pelo worker."
  });

  return json({
    ok: true,
    ...fileInfo,
    ...summary,
    message: "Importação registrada com sucesso."
  });
}

async function handleRelatorioHistory(request, env, tipo) {
  await requireMaster(request, env);
  const items = await listRelatorioHistory(env, tipo);
  return json({ ok: true, items: items || [] });
}

// ==============================
// Admin Users / Modules
// ==============================
async function handleAdminProfiles(request, env) {
  await requireMaster(request, env);
  return json({
    ok: true,
    items: await supabaseRest(env, `app_perfis?select=id,codigo,nome,descricao,ativo&ativo=is.true&order=nome.asc`, { service: true }),
  });
}

async function handleAdminUsersList(request, env, url) {
  await requireMaster(request, env);

  const q = String(url.searchParams.get("q") || "").trim();
  const perfil = String(url.searchParams.get("perfil") || "").trim();
  const status = String(url.searchParams.get("status") || "").trim();
  const supervisao = String(url.searchParams.get("supervisao") || "").trim();

  const users = await supabaseRest(
    env,
    `app_usuarios?select=id,auth_user_id,nome,email,telefone,status,perfil_id,empresa,coordenacao,supervisao,colaborador_id,ultimo_login_em,created_at,updated_at,setor&order=nome.asc`,
    { service: true }
  );

  const perfis = await supabaseRest(env, `app_perfis?select=id,codigo,nome`, { service: true });
  const perfisMap = new Map((perfis || []).map((p) => [p.id, p]));

  const userIds = (users || []).map((u) => u.id).filter(Boolean);
  let userModules = [];
  if (userIds.length) {
    const inList = userIds.map((id) => `"${id}"`).join(",");
    userModules = await supabaseRest(
      env,
      `app_usuario_modulos?select=usuario_id,modulo_id,app_modulos(id,codigo,nome)&usuario_id=in.(${inList})`,
      { service: true }
    );
  }

  const modulesByUser = new Map();
  for (const row of userModules || []) {
    const uid = row.usuario_id;
    if (!modulesByUser.has(uid)) modulesByUser.set(uid, []);
    modulesByUser.get(uid).push({
      id: row.app_modulos?.id || row.modulo_id,
      codigo: row.app_modulos?.codigo || null,
      nome: row.app_modulos?.nome || null,
    });
  }

  let items = (users || []).map((u) => ({
    ...u,
    supervisoes: parseStoredSupervisoes(u.supervisao),
    perfil_codigo: perfisMap.get(u.perfil_id)?.codigo || null,
    perfil_nome: perfisMap.get(u.perfil_id)?.nome || null,
    modulos: modulesByUser.get(u.id) || [],
  }));

  if (q) {
    const needle = q.toLowerCase();
    items = items.filter((u) =>
      [u.nome, u.email, u.empresa, u.coordenacao, u.supervisao, u.setor]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    );
  }
  if (perfil) items = items.filter((u) => u.perfil_codigo === perfil);
  if (status) items = items.filter((u) => String(u.status || "").toLowerCase() === status.toLowerCase());
  if (supervisao) {
    const needle = supervisao.toLowerCase();
    items = items.filter((u) => (u.supervisoes || []).some((s) => String(s).toLowerCase().includes(needle)));
  }

  return json({ ok: true, items, total: items.length });
}

async function handleAdminCollaborators(request, env, url) {
  await requireMaster(request, env);

  const q = String(url.searchParams.get("q") || "").trim();
  if (!q) return json({ ok: true, items: [] });

  const escaped = q.replace(/[%*,]/g, " ").trim();
  const orExpr = `nome.ilike.*${escaped}*,email_empresa.ilike.*${escaped}*,cpf.ilike.*${escaped}*`;

  const rows = await supabaseRest(
    env,
    `colaborador_snapshot?select=id,nome,cpf,email_empresa,empresa,coordenacao,supervisao,cargo,ativo,data_referencia&ativo=is.true&or=(${encodeURIComponent(orExpr)})&order=data_referencia.desc,nome.asc&limit=20`,
    { service: true }
  );

  const seen = new Set();
  const items = [];
  for (const r of rows || []) {
    const key = [r.email_empresa || "", r.cpf || "", r.nome || ""].join("|").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(r);
  }

  return json({ ok: true, items });
}

async function handleAdminModulosList(request, env) {
  await requireMaster(request, env);
  return json({
    ok: true,
    items: await supabaseRest(
      env,
      `app_modulos?select=id,codigo,nome,categoria,icone,rota,ordem,ativo&ativo=is.true&order=ordem.asc,nome.asc`,
      { service: true }
    ) || [],
  });
}

async function handleAdminUserModulos(request, env, url) {
  await requireMaster(request, env);

  const userId = String(url.searchParams.get("user_id") || "").trim();
  if (!userId) return json({ ok: false, error: "user_id é obrigatório" }, 400);

  const rows = await supabaseRest(
    env,
    `app_usuario_modulos?select=modulo_id&usuario_id=eq.${escapeFilterValue(userId)}`,
    { service: true }
  );

  return json({ ok: true, items: (rows || []).map((r) => r.modulo_id) });
}

async function salvarModulosUsuario(env, usuarioId, modulos = []) {
  const ids = [...new Set(ensureArray(modulos).filter(Boolean))];

  await fetch(`${env.SUPABASE_URL}/rest/v1/app_usuario_modulos?usuario_id=eq.${escapeFilterValue(usuarioId)}`, {
    method: "DELETE",
    headers: {
      "apikey": getServiceKey(env),
      "authorization": `Bearer ${getServiceKey(env)}`,
    },
  });

  if (!ids.length) return;

  await supabaseRest(env, "app_usuario_modulos", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=minimal" },
    body: ids.map((moduloId) => ({ usuario_id: usuarioId, modulo_id: moduloId })),
  });
}

async function handleAdminUsersCreate(request, env) {
  await requireMaster(request, env);
  const body = await readJsonBody(request);

  const perfilCodigo = String(body?.perfil_codigo || "").trim();
  const colaboradorId = String(body?.colaborador_id || "").trim();
  const nomeManual = String(body?.nome || "").trim();
  const emailManual = String(body?.email || "").trim().toLowerCase();
  const setor = String(body?.setor || "").trim() || null;
  const status = normalizeUserStatus(body?.status, "ativo");
  const modulos = ensureArray(body?.modulos);
  const supervisoes = normalizeSupervisoesInput(body?.supervisoes ?? body?.supervisao);

  if (!perfilCodigo) return json({ ok: false, error: "perfil_codigo é obrigatório" }, 400);

  const perfis = await supabaseRest(
    env,
    `app_perfis?select=id,codigo,nome&ativo=is.true&codigo=eq.${encodeURIComponent(perfilCodigo)}&limit=1`,
    { service: true }
  );
  const perfil = Array.isArray(perfis) ? perfis[0] : null;
  if (!perfil) return json({ ok: false, error: "Perfil não encontrado" }, 400);

  let colaborador = null;
  if (colaboradorId) {
    const colaboradores = await supabaseRest(
      env,
      `colaborador_snapshot?select=id,nome,cpf,email_empresa,email_pessoal,empresa,coordenacao,supervisao,ativo&id=eq.${colaboradorId}&limit=1`,
      { service: true }
    );
    colaborador = Array.isArray(colaboradores) ? colaboradores[0] : null;
    if (!colaborador) return json({ ok: false, error: "Colaborador não encontrado" }, 400);
  }

  const nome = String(nomeManual || colaborador?.nome || "").trim();
  const email = String(emailManual || colaborador?.email_empresa || colaborador?.email_pessoal || "").trim().toLowerCase();

  if (!nome) return json({ ok: false, error: "nome é obrigatório" }, 400);
  if (!email) return json({ ok: false, error: "E-mail inválido" }, 400);

  const existing = await supabaseRest(
    env,
    `app_usuarios?select=id,email,colaborador_id&or=(email.eq.${encodeURIComponent(email)}${colaboradorId ? `,colaborador_id.eq.${colaboradorId}` : ""})&limit=1`,
    { service: true }
  );
  if (Array.isArray(existing) && existing.length) {
    return json({ ok: false, error: "Já existe usuário cadastrado para esse colaborador/e-mail" }, 409);
  }

  const tempPassword = String(body?.password || "").trim() || generateTempPassword();

  const authCreated = await supabaseAuthAdmin(env, "admin/users", {
    method: "POST",
    body: {
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { role: perfil.codigo, nome, setor: setor || "", supervisoes },
    },
  });

  const authUserId = authCreated?.user?.id || authCreated?.id;
  if (!authUserId) return json({ ok: false, error: "Falha ao criar usuário no Auth" }, 500);

  const inserted = await supabaseRest(env, "app_usuarios", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=representation" },
    body: {
      auth_user_id: authUserId,
      nome,
      email,
      telefone: null,
      status,
      perfil_id: perfil.id,
      empresa: colaborador?.empresa || null,
      coordenacao: colaborador?.coordenacao || null,
      supervisao: serializeSupervisoes(supervisoes, colaborador?.supervisao || null),
      colaborador_id: colaborador?.id || null,
      setor,
    },
  });

  const appUser = Array.isArray(inserted) ? inserted[0] : inserted;
  if (appUser?.id) await salvarModulosUsuario(env, appUser.id, modulos);

  return json({
    ok: true,
    item: {
      ...appUser,
      supervisoes: parseStoredSupervisoes(appUser?.supervisao),
    },
    temp_password: tempPassword,
    message: "Usuário criado com sucesso"
  });
}

async function handleAdminUsersUpdate(request, env) {
  await requireMaster(request, env);
  const body = await readJsonBody(request);

  const id = String(body?.id || "").trim();
  const perfilCodigo = String(body?.perfil_codigo || "").trim();
  const status = normalizeUserStatus(body?.status, "");
  const nome = String(body?.nome || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const setor = String(body?.setor || "").trim();
  const modulos = ensureArray(body?.modulos);
  const supervisoes = normalizeSupervisoesInput(body?.supervisoes ?? body?.supervisao);
  const password = String(body?.password || "").trim();

  if (!id) return json({ ok: false, error: "id é obrigatório" }, 400);

  const users = await supabaseRest(
    env,
    `app_usuarios?select=id,auth_user_id,perfil_id,status,email,nome,setor,supervisao&id=eq.${id}&limit=1`,
    { service: true }
  );
  const user = Array.isArray(users) ? users[0] : null;
  if (!user) return json({ ok: false, error: "Usuário não encontrado" }, 404);

  const patch = {};
  let perfil = null;

  if (perfilCodigo) {
    const perfis = await supabaseRest(
      env,
      `app_perfis?select=id,codigo&ativo=is.true&codigo=eq.${encodeURIComponent(perfilCodigo)}&limit=1`,
      { service: true }
    );
    perfil = Array.isArray(perfis) ? perfis[0] : null;
    if (!perfil) return json({ ok: false, error: "Perfil não encontrado" }, 400);
    patch.perfil_id = perfil.id;
  }

  if (status) patch.status = status;
  if (nome) patch.nome = nome;
  if (email) patch.email = email;
  if (Object.prototype.hasOwnProperty.call(body || {}, "setor")) patch.setor = setor || null;
  if (Object.prototype.hasOwnProperty.call(body || {}, "supervisoes") || Object.prototype.hasOwnProperty.call(body || {}, "supervisao")) {
    patch.supervisao = serializeSupervisoes(supervisoes, null);
  }

  const updated = Object.keys(patch).length
    ? await supabaseRest(env, `app_usuarios?id=eq.${id}`, {
        method: "PATCH",
        service: true,
        headers: { Prefer: "return=representation" },
        body: patch,
      })
    : [user];

  const updatedUser = Array.isArray(updated) ? updated[0] : updated;

  if (user.auth_user_id) {
    const authBody = {
      user_metadata: {
        role: perfil?.codigo || null,
        nome: updatedUser?.nome || user.nome,
        setor: Object.prototype.hasOwnProperty.call(body || {}, "setor") ? (setor || "") : (user.setor || ""),
        supervisoes:
          (Object.prototype.hasOwnProperty.call(body || {}, "supervisoes") || Object.prototype.hasOwnProperty.call(body || {}, "supervisao"))
            ? supervisoes
            : parseStoredSupervisoes(user.supervisao),
      },
    };
    if (email) authBody.email = email;
    if (password) authBody.password = password;

    if (perfil?.codigo || nome || Object.prototype.hasOwnProperty.call(body || {}, "setor") || email || password) {
      await supabaseAuthAdmin(env, `admin/users/${user.auth_user_id}`, {
        method: "PUT",
        body: authBody,
      });
    }
  }

  if (Array.isArray(body?.modulos)) await salvarModulosUsuario(env, id, modulos);

  return json({
    ok: true,
    item: {
      ...updatedUser,
      supervisoes: parseStoredSupervisoes(updatedUser?.supervisao),
    }
  });
}

async function handleAdminUsersToggleStatus(request, env) {
  await requireMaster(request, env);
  const body = await readJsonBody(request);
  const id = String(body?.id || "").trim();
  if (!id) return json({ ok: false, error: "id é obrigatório" }, 400);

  const users = await supabaseRest(env, `app_usuarios?select=id,status&id=eq.${id}&limit=1`, { service: true });
  const user = Array.isArray(users) ? users[0] : null;
  if (!user) return json({ ok: false, error: "Usuário não encontrado" }, 404);

  const novoStatus = String(user.status || "").toLowerCase() === "ativo" ? "inativo" : "ativo";
  const updated = await supabaseRest(env, `app_usuarios?id=eq.${id}`, {
    method: "PATCH",
    service: true,
    headers: { Prefer: "return=representation" },
    body: { status: novoStatus },
  });

  return json({ ok: true, item: Array.isArray(updated) ? updated[0] : updated });
}

async function handleAdminUsersResetPassword(request, env) {
  await requireMaster(request, env);
  const body = await readJsonBody(request);
  const id = String(body?.id || "").trim();
  if (!id) return json({ ok: false, error: "id é obrigatório" }, 400);

  const users = await supabaseRest(env, `app_usuarios?select=id,auth_user_id,email,nome&id=eq.${id}&limit=1`, { service: true });
  const user = Array.isArray(users) ? users[0] : null;
  if (!user) return json({ ok: false, error: "Usuário não encontrado" }, 404);
  if (!user.auth_user_id) return json({ ok: false, error: "Usuário sem vínculo com Auth" }, 400);

  const tempPassword = String(body?.password || "").trim() || generateTempPassword();
  await supabaseAuthAdmin(env, `admin/users/${user.auth_user_id}`, {
    method: "PUT",
    body: { password: tempPassword, user_metadata: { nome: user.nome } },
  });

  return json({ ok: true, temp_password: tempPassword, message: "Senha temporária redefinida com sucesso" });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      if (path === "/api" || path.startsWith("/api/")) return corsPreflight(request);
      return new Response(null, { status: 204 });
    }

    if (path === "/api/health") {
      return json({
        ok: true,
        worker: "worker-api",
        supabase_url_ok: Boolean(env.SUPABASE_URL),
        supabase_key_ok: Boolean(getServiceKey(env)),
        supabase_anon_ok: Boolean(getAnonKey(env)),
        supabase_configurado: Boolean(env.SUPABASE_URL && getServiceKey(env)),
        gas_configurado: Boolean(env.GAS_EXEC_URL),
        bc_base_url_ok: Boolean(env.BC_BASE_URL),
        bc_api_key_ok: Boolean(env.BC_API_KEY),
        bc_birthday_flow_ok: Boolean(env.BC_BIRTHDAY_FLOW_ID),
      });
    }

    try {
      // BotConversa / histórico
      if (path === "/api/botconversa/send-flow" && request.method === "POST") return await handleSendFlow(request, env);
      if (path === "/api/botconversa/send-message" && request.method === "POST") return await handleSendMessage(request, env);
      if (path === "/api/botconversa/webhook" && request.method === "POST") return await handleWebhook(request, env);
      if (path === "/api/botconversa/logs" && request.method === "GET") return await handleBotLogs(request, env, url);
      if (path === "/api/botconversa/queue" && request.method === "GET") return await handleBotQueue(request, env, url);

      if (path === "/api/admin/colaboradores/snapshot" && request.method === "POST") return await handleHistoricoSnapshot(request, env);
      if (path === "/api/admin/colaboradores/historico" && request.method === "GET") return await handleHistoricoList(request, env, url);

      // Exportações
      if (path === "/api/exportacoes/google-contacts" && request.method === "POST") return await createExport(request, env, "google_contacts");
      if (path === "/api/exportacoes/cartoes/flash" && request.method === "POST") return await createExport(request, env, "flash");
      if (path === "/api/exportacoes/cartoes/ifood" && request.method === "POST") return await createExport(request, env, "ifood");
      if (path === "/api/exportacoes/uber" && request.method === "POST") return await createExport(request, env, "uber");
      if (path === "/api/exportacoes/jobs" && request.method === "GET") return await getExportJobs(request, env);
      if (path === "/api/exportacoes/download" && request.method === "GET") return await downloadExport(request, env);

      // Automações BotConversa
      if (path === "/api/botconversa/sync-start" && request.method === "POST") return await startSyncSubscribers(request, env);
      if (path === "/api/botconversa/process" && request.method === "GET") return json(await processBotQueue(env));
      if (path === "/api/botconversa/sync-subscribers" && request.method === "POST") return await syncSubscribers(request, env);
      if (path === "/api/botconversa/send-birthday-flow" && request.method === "POST") return await sendBirthdayFlow(request, env);
      if (path === "/api/botconversa/notificar-cartoes" && request.method === "POST") return await notificarCartoes(request, env);
      if (path === "/api/botconversa/jobs" && request.method === "GET") return await getBotJobs(request, env);

      // Relatórios
      const relBase = "/api/relatorios/import/";
      if (path.startsWith(relBase)) {
        const sub = path.slice(relBase.length);
        const isHistory = sub.endsWith("/history");
        const isValidate = sub.endsWith("/validate");
        const tipo = isHistory ? sub.replace(/\/history$/, "") : isValidate ? sub.replace(/\/validate$/, "") : sub;

        if (RELATORIO_TIPO_TO_TABLE[tipo]) {
          if (request.method === "GET" && isHistory) return await handleRelatorioHistory(request, env, tipo);
          if (request.method === "POST" && isValidate) return await handleRelatorioImport(request, env, tipo, "validate");
          if (request.method === "POST" && !isHistory && !isValidate) return await handleRelatorioImport(request, env, tipo, "import");
        }
      }

      // Admin users
      if (path === "/api/admin/users/profiles" && request.method === "GET") return await handleAdminProfiles(request, env);
      if (path === "/api/admin/users/list" && request.method === "GET") return await handleAdminUsersList(request, env, url);
      if (path === "/api/admin/users/collaborators" && request.method === "GET") return await handleAdminCollaborators(request, env, url);
      if (path === "/api/admin/users/supervisoes" && request.method === "GET") return await handleAdminSupervisoesList(request, env, url);
      if (path === "/api/admin/users/modulos" && request.method === "GET") return await handleAdminModulosList(request, env);
      if (path === "/api/admin/users/user-modulos" && request.method === "GET") return await handleAdminUserModulos(request, env, url);
      if (path === "/api/admin/users/create" && request.method === "POST") return await handleAdminUsersCreate(request, env);
      if (path === "/api/admin/users/update" && request.method === "POST") return await handleAdminUsersUpdate(request, env);
      if (path === "/api/admin/users/toggle-status" && request.method === "POST") return await handleAdminUsersToggleStatus(request, env);
      if (path === "/api/admin/users/reset-password" && request.method === "POST") return await handleAdminUsersResetPassword(request, env);
    } catch (err) {
      return json({ ok: false, error: String(err?.message || err || "Erro interno no worker") }, 500);
    }

    if (path === "/api" || path === "/api/" || path === "/api/exec" || path === "/api/exec/") {
      if (!["GET", "HEAD"].includes(request.method)) {
        const parsedBody = await readJsonBody(request);
        if (parsedBody && isSupabaseDespesasSave(parsedBody)) {
          try {
            return await tryHandleSupabaseDespesas({ request, env, body: parsedBody });
          } catch (err) {
            return json({ ok: false, origem: "supabase", error: String(err?.message || err || "Erro ao salvar no Supabase") }, 500);
          }
        }
      }

      if (!env.GAS_EXEC_URL) return json({ ok: false, error: "GAS_EXEC_URL não configurada" }, 500);
      return proxyToGAS({ request, url, gasUrl: env.GAS_EXEC_URL, addActionFromSubpath: null });
    }

    if (path === "/api/macros" || path.startsWith("/api/macros/")) {
      if (!env.GAS_EXEC_URL) return json({ ok: false, error: "GAS_EXEC_URL não configurada" }, 500);
      const subpath = path.startsWith("/api/macros/") ? path.slice("/api/macros/".length) : "";
      return proxyToGAS({ request, url, gasUrl: env.GAS_EXEC_URL, addActionFromSubpath: subpath || null });
    }

    return json({ ok: false, error: "Rota não encontrada", path }, 404);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(processBotQueue(env));
  },
};
