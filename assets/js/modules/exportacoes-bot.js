function xCorsHeaders(origin = "*") {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization, X-Requested-With, Accept, X-BC-Secret",
    "access-control-expose-headers": "content-type, content-disposition",
  };
}

function xJson(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...xCorsHeaders(),
      ...extraHeaders,
    },
  });
}

function xSafeJsonParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function xGetServiceKey(env) { return env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY || ""; }
function xGetAnonKey(env) { return env.SUPABASE_ANON_KEY || env.SUPABASE_KEY || ""; }

async function xReadJsonBody(request) {
  if (["GET", "HEAD"].includes(request.method)) return null;
  const text = await request.text();
  return xSafeJsonParse(text);
}

async function xSupabaseRest(env, path, { method = "GET", service = true, body = null, headers = {} } = {}) {
  const key = service ? xGetServiceKey(env) : xGetAnonKey(env);
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
  const parsed = xSafeJsonParse(text);
  if (!res.ok) throw new Error(parsed?.message || parsed?.error || text || "Erro no Supabase REST");
  return parsed;
}

function xGetBearerToken(request) {
  const auth = request.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
}

async function xRequireMaster(request, env) {
  const token = xGetBearerToken(request);
  if (!token) throw new Error("Authorization Bearer token ausente");

  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    method: "GET",
    headers: {
      "apikey": xGetAnonKey(env) || xGetServiceKey(env),
      "authorization": `Bearer ${token}`,
    },
  });

  const authUser = xSafeJsonParse(await res.text());
  if (!res.ok || !authUser?.id) throw new Error("Usuário autenticado inválido");

  const appUsers = await xSupabaseRest(env, `app_usuarios?select=id,auth_user_id,perfil_id,status&auth_user_id=eq.${authUser.id}&limit=1`);
  const appUser = Array.isArray(appUsers) ? appUsers[0] : null;
  if (!appUser) throw new Error("Usuário não encontrado em app_usuarios");
  if (String(appUser.status || "").toLowerCase() !== "ativo") throw new Error("Usuário sem acesso ativo");

  const perfis = await xSupabaseRest(env, `app_perfis?select=id,codigo&ativo=is.true&id=eq.${appUser.perfil_id}&limit=1`);
  const perfil = Array.isArray(perfis) ? perfis[0] : null;
  if (!perfil || perfil.codigo !== "master") throw new Error("Acesso permitido somente para usuário master");

  return { authUser, appUser, perfil };
}

function xCsvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function xToCsv(headers, rows) {
  const bom = "\ufeff";
  const lines = [headers.map(xCsvEscape).join(",")];
  for (const row of rows) lines.push(row.map(xCsvEscape).join(","));
  return bom + lines.join("\n");
}

function xBase64Utf8(text) {
  return btoa(unescape(encodeURIComponent(text)));
}

function xToday() {
  return new Date().toISOString().slice(0, 10);
}

async function xInsert(env, table, row) {
  const out = await xSupabaseRest(env, table, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: row,
  });
  return Array.isArray(out) ? out[0] : out;
}

async function xPatchById(env, table, id, patch) {
  const out = await xSupabaseRest(env, `${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: patch,
  });
  return Array.isArray(out) ? out[0] : out;
}

async function xGetLatestColabReferenceDate(env) {
  const rows = await xSupabaseRest(
    env,
    "colaborador_importacoes?select=data_referencia,status&status=eq.processado&order=data_referencia.desc&limit=1"
  );
  return Array.isArray(rows) && rows[0]?.data_referencia ? rows[0].data_referencia : null;
}

async function xLoadColaboradores(env, filtros = {}) {
  const latestReference = await xGetLatestColabReferenceDate(env);
  if (!latestReference) return [];

  const parts = [
    "select=*",
    `data_referencia=eq.${encodeURIComponent(latestReference)}`,
    "order=nome.asc",
    `limit=${Math.min(Number(filtros.limit || 5000), 10000)}`
  ];

  if (filtros.empresa) parts.push(`empresa=ilike.*${encodeURIComponent(filtros.empresa)}*`);
  if (filtros.nome) parts.push(`nome=ilike.*${encodeURIComponent(filtros.nome)}*`);
  if (filtros.situacao) {
    if (filtros.situacao !== "Todos") {
      parts.push(`situacao=eq.${encodeURIComponent(filtros.situacao)}`);
    }
  } else {
    parts.push(`situacao=eq.${encodeURIComponent("Ativo")}`);
  }

  if (filtros.data_admissao_inicial) {
    parts.push(`admissao=gte.${encodeURIComponent(filtros.data_admissao_inicial)}`);
  }
  if (filtros.data_admissao_final) {
    parts.push(`admissao=lte.${encodeURIComponent(filtros.data_admissao_final)}`);
  }

  return xSupabaseRest(env, `colaborador_snapshot?${parts.join("&")}`);
}

function mapCartoes(colabs, tipo) {
  const headers = ["Nome completo", "CPF", "Celular", "E-mail", "Empresa", "Cargo"];
  const rows = colabs.map(c => [
    c.nome || "",
    c.cpf || "",
    c.whatsapp || "",
    c.email_empresa || c.email_pessoal || "",
    c.empresa || "",
    c.cargo || ""
  ]);
  return { headers, rows, filename: `${tipo}_${xToday()}.csv` };
}

function mapUber(colabs) {
  const headers = ["first_name", "last_name", "email", "mobile_country_code", "mobile_number", "employee_id", "group"];
  const rows = colabs.map(c => {
    const nome = c.nome || "";
    const partes = nome.trim().split(/\s+/);
    let mobile = String(c.whatsapp || "").replace(/\D+/g, "");
    if (mobile.startsWith("55")) mobile = mobile.slice(2);
    return [
      partes[0] || nome,
      partes.slice(1).join(" "),
      c.email_empresa || c.email_pessoal || "",
      "55",
      mobile,
      c.cpf || "",
      c.empresa || ""
    ];
  });
  return { headers, rows, filename: `uber_empresas_${xToday()}.csv` };
}

async function finalizeExport(env, job, tipo, spec) {
  const csv = xToCsv(spec.headers, spec.rows);
  const contentBase64 = xBase64Utf8(csv);

  const arquivo = await xInsert(env, "exportacoes_arquivos", {
    job_id: job.id,
    tipo,
    filename: spec.filename,
    mime_type: "text/csv; charset=utf-8",
    content_base64: contentBase64,
    bytes_size: new TextEncoder().encode(csv).length
  });

  await xPatchById(env, "exportacoes_jobs", job.id, {
    status: "concluido",
    total_registros: spec.rows.length,
    arquivo_id: arquivo.id,
    finished_at: new Date().toISOString()
  });

  return { job_id: job.id, arquivo_id: arquivo.id, filename: arquivo.filename, total: spec.rows.length };
}

async function createExport(request, env, tipo) {
  const auth = await xRequireMaster(request, env);
  const body = await xReadJsonBody(request) || {};

  const job = await xInsert(env, "exportacoes_jobs", {
    tipo,
    status: "processando",
    filtros: body,
    created_by: auth.authUser.id
  });

  try {
    const colabs = await xLoadColaboradores(env, body);

    let spec;
    if (tipo === "flash") spec = mapCartoes(colabs, "flash");
    if (tipo === "ifood") spec = mapCartoes(colabs, "ifood");
    if (tipo === "uber") spec = mapUber(colabs);

    return xJson({ ok: true, ...(await finalizeExport(env, job, tipo, spec)) });
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
  await xRequireMaster(request, env);
  const rows = await xSupabaseRest(env, "exportacoes_jobs?select=*&order=created_at.desc&limit=100");
  return xJson({ ok: true, items: rows || [] });
}

async function downloadExport(request, env) {
  await xRequireMaster(request, env);

  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") || "").trim();
  if (!id) return xJson({ ok: false, error: "id é obrigatório" }, 400);

  const rows = await xSupabaseRest(env, `exportacoes_arquivos?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return xJson({ ok: false, error: "Arquivo não encontrado" }, 404);

  const bytes = Uint8Array.from(atob(row.content_base64), c => c.charCodeAt(0));
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": row.mime_type || "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${row.filename}"`,
      ...xCorsHeaders(),
    }
  });
}

export async function handleExportacoesBotRoutes(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: xCorsHeaders() });
  }

  try {
    if (path === "/api/exportacoes/cartoes/flash" && request.method === "POST") return await createExport(request, env, "flash");
    if (path === "/api/exportacoes/cartoes/ifood" && request.method === "POST") return await createExport(request, env, "ifood");
    if (path === "/api/exportacoes/uber" && request.method === "POST") return await createExport(request, env, "uber");
    if (path === "/api/exportacoes/jobs" && request.method === "GET") return await getExportJobs(request, env);
    if (path === "/api/exportacoes/download" && request.method === "GET") return await downloadExport(request, env);
    return null;
  } catch (err) {
    return xJson({ ok: false, error: String(err?.message || err) }, 500);
  }
}

export default { handleExportacoesBotRoutes };
