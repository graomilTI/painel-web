// worker-api — proxy GAS + integrações administrativas de Usuários e Acessos
// Requer variáveis:
// - GAS_EXEC_URL
// - SUPABASE_URL
// - SUPABASE_ANON_KEY
// - SUPABASE_SERVICE_KEY
//
// Rotas novas:
//  GET  /api/admin/users/profiles
//  GET  /api/admin/users/list
//  GET  /api/admin/users/collaborators?q=...
//  POST /api/admin/users/create
//  POST /api/admin/users/update
//  POST /api/admin/users/toggle-status
//  POST /api/admin/users/reset-password

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
    "access-control-allow-headers": "Content-Type, Authorization, X-Requested-With, Accept",
    "access-control-expose-headers": "content-type",
  };
}

function corsPreflight(request) {
  const reqHeaders = request.headers.get("Access-Control-Request-Headers");
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders("*"),
      "access-control-allow-headers":
        reqHeaders || "Content-Type, Authorization, X-Requested-With, Accept",
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
  out.set("access-control-allow-headers", "Content-Type, Authorization, X-Requested-With, Accept");
  out.set("access-control-expose-headers", "content-type");
  const ct = resp.headers.get("content-type");
  out.set("content-type", ct || "application/json; charset=utf-8");

  return new Response(respBody, { status: resp.status, headers: out });
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function readBodyBuffer(request) {
  if (["GET", "HEAD"].includes(request.method)) return null;
  return await request.clone().arrayBuffer();
}

function decodeBufferToText(buffer) {
  if (!buffer) return "";
  return new TextDecoder("utf-8").decode(buffer);
}

function getServiceKey(env) {
  return env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY || "";
}

function ensureSupabaseEnv(env) {
  if (!env.SUPABASE_URL) throw new Error("SUPABASE_URL não configurada");
  if (!env.SUPABASE_ANON_KEY) throw new Error("SUPABASE_ANON_KEY não configurada");
  if (!getServiceKey(env)) throw new Error("SUPABASE_SERVICE_KEY não configurada");
}

function randomPassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#%!";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

async function supabaseFetch(env, path, init = {}, service = false) {
  ensureSupabaseEnv(env);
  const headers = new Headers(init.headers || {});
  const key = service ? getServiceKey(env) : env.SUPABASE_ANON_KEY;
  headers.set("apikey", key);
  headers.set("authorization", `Bearer ${key}`);
  if (!headers.has("content-type") && init.body) headers.set("content-type", "application/json");

  const res = await fetch(`${env.SUPABASE_URL}${path}`, {
    ...init,
    headers,
  });

  const text = await res.text();
  const data = safeJsonParse(text);

  if (!res.ok) {
    throw new Error(data?.msg || data?.message || data?.error_description || data?.error || text || "Erro Supabase");
  }

  return data ?? text;
}

function getBearerToken(request) {
  const auth = request.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();

  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/sb-[^=]+=([^;]+)/);
  if (match) return decodeURIComponent(match[1]);
  return null;
}

async function getAuthUser(request, env) {
  const token = getBearerToken(request);
  if (!token) return null;

  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) return null;
  return await res.json();
}

async function getAppUserByAuthUserId(authUserId, env) {
  const rows = await supabaseFetch(
    env,
    `/rest/v1/app_usuarios?select=id,auth_user_id,status,perfil_id,nome,email&auth_user_id=eq.${authUserId}&limit=1`,
    { method: "GET" },
    true
  );

  return Array.isArray(rows) ? (rows[0] || null) : null;
}

async function getPerfilById(perfilId, env) {
  const rows = await supabaseFetch(
    env,
    `/rest/v1/app_perfis?select=id,codigo,nome,ativo&id=eq.${perfilId}&limit=1`,
    { method: "GET" },
    true
  );
  return Array.isArray(rows) ? (rows[0] || null) : null;
}

async function getPerfilByCodigo(codigo, env) {
  const rows = await supabaseFetch(
    env,
    `/rest/v1/app_perfis?select=id,codigo,nome,ativo&codigo=eq.${encodeURIComponent(codigo)}&limit=1`,
    { method: "GET" },
    true
  );
  return Array.isArray(rows) ? (rows[0] || null) : null;
}

async function requireMaster(request, env) {
  const authUser = await getAuthUser(request, env);
  if (!authUser?.id) {
    throw new Error("Sessão inválida ou expirada.");
  }

  const appUser = await getAppUserByAuthUserId(authUser.id, env);
  if (!appUser) {
    throw new Error("Usuário sem cadastro em app_usuarios.");
  }

  if (String(appUser.status || "").toLowerCase() !== "ativo") {
    throw new Error("Usuário inativo.");
  }

  const perfil = await getPerfilById(appUser.perfil_id, env);
  if (!perfil || String(perfil.codigo).toLowerCase() !== "master") {
    throw new Error("Acesso restrito ao perfil master.");
  }

  return { authUser, appUser, perfil };
}

async function handleProfiles(request, env) {
  await requireMaster(request, env);
  const rows = await supabaseFetch(
    env,
    `/rest/v1/app_perfis?select=id,codigo,nome,descricao,ativo&ativo=is.true&order=nome.asc`,
    { method: "GET" },
    true
  );

  return json({ ok: true, items: rows });
}

async function handleUsersList(request, env) {
  await requireMaster(request, env);

  const perfis = await supabaseFetch(
    env,
    `/rest/v1/app_perfis?select=id,codigo,nome&order=nome.asc`,
    { method: "GET" },
    true
  );
  const perfilMap = new Map((perfis || []).map((p) => [p.id, p]));

  const users = await supabaseFetch(
    env,
    `/rest/v1/app_usuarios?select=id,auth_user_id,nome,email,telefone,status,perfil_id,empresa,coordenacao,supervisao,colaborador_id,ultimo_login_em,created_at,updated_at&order=created_at.desc`,
    { method: "GET" },
    true
  );

  const items = (users || []).map((u) => ({
    ...u,
    perfil_codigo: perfilMap.get(u.perfil_id)?.codigo || null,
    perfil_nome: perfilMap.get(u.perfil_id)?.nome || null,
  }));

  return json({ ok: true, items });
}

async function getLatestReferencia(env) {
  const rows = await supabaseFetch(
    env,
    `/rest/v1/colaborador_importacoes?select=data_referencia&status=eq.processado&order=data_referencia.desc&limit=1`,
    { method: "GET" },
    true
  );
  return Array.isArray(rows) ? (rows[0]?.data_referencia || null) : null;
}

async function handleCollaborators(request, env) {
  await requireMaster(request, env);

  const url = new URL(request.url);
  const q = String(url.searchParams.get("q") || "").trim();
  const latest = await getLatestReferencia(env);

  if (!latest) return json({ ok: true, items: [] });

  let path = `/rest/v1/colaborador_snapshot?select=id,nome,cpf,email_empresa,email_pessoal,empresa,coordenacao,supervisao,cargo,ativo,data_referencia&data_referencia=eq.${latest}&ativo=is.true&order=nome.asc&limit=20`;

  if (q) {
    const qDigits = q.replace(/\D/g, "");
    const filters = [
      `nome.ilike.*${q}*`,
      `email_empresa.ilike.*${q}*`,
      `email_pessoal.ilike.*${q}*`,
    ];
    if (qDigits) filters.push(`cpf.eq.${qDigits}`);
    path += `&or=(${encodeURIComponent(filters.join(","))})`;
  }

  const rows = await supabaseFetch(env, path, { method: "GET" }, true);

  const items = (rows || []).map((r) => ({
    ...r,
    email: r.email_empresa || r.email_pessoal || null,
  }));

  return json({ ok: true, items });
}

async function handleCreateUser(request, env) {
  await requireMaster(request, env);

  const body = safeJsonParse(decodeBufferToText(await readBodyBuffer(request))) || {};
  const colaboradorId = String(body.colaborador_id || "").trim();
  const perfilCodigo = String(body.perfil_codigo || "").trim();
  const status = String(body.status || "ativo").trim().toLowerCase();
  const senhaTemporaria = String(body.senha_temporaria || "").trim() || randomPassword();

  if (!colaboradorId) return json({ ok: false, error: "Selecione um colaborador." }, 400);
  if (!perfilCodigo) return json({ ok: false, error: "Selecione o perfil." }, 400);

  const perfil = await getPerfilByCodigo(perfilCodigo, env);
  if (!perfil?.id) return json({ ok: false, error: "Perfil não encontrado." }, 400);

  const colaboradorRows = await supabaseFetch(
    env,
    `/rest/v1/colaborador_snapshot?select=id,nome,cpf,email_empresa,email_pessoal,empresa,coordenacao,supervisao,ativo&id=eq.${colaboradorId}&limit=1`,
    { method: "GET" },
    true
  );
  const colaborador = Array.isArray(colaboradorRows) ? (colaboradorRows[0] || null) : null;
  if (!colaborador) return json({ ok: false, error: "Colaborador não encontrado." }, 404);

  const email = colaborador.email_empresa || colaborador.email_pessoal;
  if (!email) return json({ ok: false, error: "Colaborador sem e-mail cadastrado na base." }, 400);

  const existing = await supabaseFetch(
    env,
    `/rest/v1/app_usuarios?select=id,email,colaborador_id&or=(email.eq.${encodeURIComponent(email)},colaborador_id.eq.${colaboradorId})&limit=1`,
    { method: "GET" },
    true
  );
  if (Array.isArray(existing) && existing.length) {
    return json({ ok: false, error: "Este colaborador já possui acesso cadastrado." }, 409);
  }

  const authRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "apikey": getServiceKey(env),
      "authorization": `Bearer ${getServiceKey(env)}`,
    },
    body: JSON.stringify({
      email,
      password: senhaTemporaria,
      email_confirm: true,
      user_metadata: {
        nome: colaborador.nome,
        perfil_codigo: perfil.codigo,
      },
    }),
  });

  const authText = await authRes.text();
  const authPayload = safeJsonParse(authText);
  if (!authRes.ok) {
    return json({ ok: false, error: authPayload?.msg || authPayload?.message || authPayload?.error_description || authPayload?.error || authText }, 400);
  }

  const authUserId = authPayload?.user?.id;
  if (!authUserId) {
    return json({ ok: false, error: "Usuário do Auth não retornado." }, 500);
  }

  await supabaseFetch(
    env,
    `/rest/v1/app_usuarios`,
    {
      method: "POST",
      body: JSON.stringify({
        auth_user_id: authUserId,
        nome: colaborador.nome,
        email,
        telefone: null,
        status,
        perfil_id: perfil.id,
        empresa: colaborador.empresa,
        coordenacao: colaborador.coordenacao,
        supervisao: colaborador.supervisao,
        colaborador_id: colaborador.id,
      }),
    },
    true
  );

  return json({
    ok: true,
    message: "Usuário criado com sucesso.",
    senha_temporaria: senhaTemporaria,
  });
}

async function handleUpdateUser(request, env) {
  await requireMaster(request, env);

  const body = safeJsonParse(decodeBufferToText(await readBodyBuffer(request))) || {};
  const usuarioId = String(body.usuario_id || "").trim();
  const perfilCodigo = String(body.perfil_codigo || "").trim();
  const status = String(body.status || "").trim().toLowerCase();

  if (!usuarioId) return json({ ok: false, error: "Usuário não informado." }, 400);

  const payload = {};
  if (perfilCodigo) {
    const perfil = await getPerfilByCodigo(perfilCodigo, env);
    if (!perfil?.id) return json({ ok: false, error: "Perfil não encontrado." }, 400);
    payload.perfil_id = perfil.id;
  }
  if (status) payload.status = status;

  if (!Object.keys(payload).length) {
    return json({ ok: false, error: "Nenhuma alteração informada." }, 400);
  }

  await supabaseFetch(
    env,
    `/rest/v1/app_usuarios?id=eq.${usuarioId}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(payload),
    },
    true
  );

  return json({ ok: true, message: "Usuário atualizado com sucesso." });
}

async function handleToggleStatus(request, env) {
  await requireMaster(request, env);
  const body = safeJsonParse(decodeBufferToText(await readBodyBuffer(request))) || {};
  const usuarioId = String(body.usuario_id || "").trim();
  const status = String(body.status || "").trim().toLowerCase();

  if (!usuarioId || !status) {
    return json({ ok: false, error: "Usuário e status são obrigatórios." }, 400);
  }

  await supabaseFetch(
    env,
    `/rest/v1/app_usuarios?id=eq.${usuarioId}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status }),
    },
    true
  );

  return json({ ok: true, message: "Status atualizado com sucesso." });
}

async function handleResetPassword(request, env) {
  await requireMaster(request, env);
  const body = safeJsonParse(decodeBufferToText(await readBodyBuffer(request))) || {};
  const usuarioId = String(body.usuario_id || "").trim();
  if (!usuarioId) return json({ ok: false, error: "Usuário não informado." }, 400);

  const rows = await supabaseFetch(
    env,
    `/rest/v1/app_usuarios?select=id,auth_user_id,nome,email&id=eq.${usuarioId}&limit=1`,
    { method: "GET" },
    true
  );
  const usuario = Array.isArray(rows) ? (rows[0] || null) : null;
  if (!usuario?.auth_user_id) return json({ ok: false, error: "Usuário não encontrado." }, 404);

  const novaSenha = randomPassword();

  const authRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${usuario.auth_user_id}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "apikey": getServiceKey(env),
      "authorization": `Bearer ${getServiceKey(env)}`,
    },
    body: JSON.stringify({
      password: novaSenha,
    }),
  });

  const authText = await authRes.text();
  const authPayload = safeJsonParse(authText);
  if (!authRes.ok) {
    return json({ ok: false, error: authPayload?.msg || authPayload?.message || authPayload?.error_description || authPayload?.error || authText }, 400);
  }

  return json({ ok: true, senha_temporaria: novaSenha });
}

// ===== Intercept existente para despesas =====
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

function dmyToIso(dmy) {
  const s = String(dmy || "").trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
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

async function callSupabaseRpc(env, fn, payload) {
  ensureSupabaseEnv(env);
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
    const errMsg =
      parsed?.message ||
      parsed?.error_description ||
      parsed?.error ||
      text ||
      "Erro ao chamar Supabase RPC";
    throw new Error(errMsg);
  }

  return parsed ?? { raw: text };
}

async function tryHandleSupabaseDespesas({ request, env, body }) {
  if (!isSupabaseDespesasSave(body)) return null;

  const root = getPayloadRoot(body);
  const dataRef = normalizeDataRef(root);
  const dataIso = dmyToIso(dataRef);
  const itens = normalizeItens(root);

  if (!dataIso) {
    return json({ ok: false, error: "Data inválida em despesas.salvarProgramacao", recebido: dataRef ?? null }, 400);
  }

  if (!Array.isArray(itens) || !itens.length) {
    return json({ ok: false, error: "Nenhum item enviado em despesas.salvarProgramacao" }, 400);
  }

  const rpcPayload = {
    p_data_referencia: dataIso,
    p_supervisao: normalizeSupervisao(root),
    p_coordenacao: normalizeCoordenacao(root),
    p_solicitante: normalizeSolicitante(body, request),
    p_queue_id: crypto.randomUUID(),
    p_itens: itens,
  };

  const result = await callSupabaseRpc(env, "upsert_programacao_despesas", rpcPayload);

  return json({ ok: true, origem: "supabase", module: "despesas", action: "salvarProgramacao", result });
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
        supabase_anon_ok: Boolean(env.SUPABASE_ANON_KEY),
        supabase_service_ok: Boolean(getServiceKey(env)),
        gas_configurado: Boolean(env.GAS_EXEC_URL),
      });
    }

    // ===== Novas rotas admin/users =====
    try {
      if (path === "/api/admin/users/profiles" && request.method === "GET") {
        return await handleProfiles(request, env);
      }
      if (path === "/api/admin/users/list" && request.method === "GET") {
        return await handleUsersList(request, env);
      }
      if (path === "/api/admin/users/collaborators" && request.method === "GET") {
        return await handleCollaborators(request, env);
      }
      if (path === "/api/admin/users/create" && request.method === "POST") {
        return await handleCreateUser(request, env);
      }
      if (path === "/api/admin/users/update" && request.method === "POST") {
        return await handleUpdateUser(request, env);
      }
      if (path === "/api/admin/users/toggle-status" && request.method === "POST") {
        return await handleToggleStatus(request, env);
      }
      if (path === "/api/admin/users/reset-password" && request.method === "POST") {
        return await handleResetPassword(request, env);
      }
    } catch (err) {
      return json({ ok: false, error: String(err?.message || err || "Erro interno") }, 400);
    }

    // ===== Compatibilidade existente /api e /api/exec =====
    if (
      path === "/api" ||
      path === "/api/" ||
      path === "/api/exec" ||
      path === "/api/exec/"
    ) {
      if (!["GET", "HEAD"].includes(request.method)) {
        const rawBody = await readBodyBuffer(request);
        const textBody = decodeBufferToText(rawBody);
        const parsedBody = safeJsonParse(textBody);

        if (parsedBody && isSupabaseDespesasSave(parsedBody)) {
          try {
            return await tryHandleSupabaseDespesas({ request, env, body: parsedBody });
          } catch (err) {
            return json({
              ok: false,
              origem: "supabase",
              error: String(err?.message || err || "Erro ao salvar no Supabase"),
            }, 500);
          }
        }
      }

      if (!env.GAS_EXEC_URL) {
        return json({ ok: false, error: "GAS_EXEC_URL não configurada" }, 500);
      }

      return proxyToGAS({ request, url, gasUrl: env.GAS_EXEC_URL, addActionFromSubpath: null });
    }

    if (path === "/api/macros" || path.startsWith("/api/macros/")) {
      if (!env.GAS_EXEC_URL) {
        return json({ ok: false, error: "GAS_EXEC_URL não configurada" }, 500);
      }

      const subpath = path.startsWith("/api/macros/")
        ? path.slice("/api/macros/".length)
        : "";

      return proxyToGAS({
        request,
        url,
        gasUrl: env.GAS_EXEC_URL,
        addActionFromSubpath: subpath || null,
      });
    }

    return json({ ok: false, error: "Rota não encontrada", path }, 404);
  },
};
