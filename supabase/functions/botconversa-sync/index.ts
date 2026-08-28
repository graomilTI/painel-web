import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

declare const EdgeRuntime: { waitUntil?: (promise: Promise<unknown>) => void } | undefined;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function env(name: string) {
  return Deno.env.get(name) || "";
}

const SUPABASE_URL = env("SUPABASE_URL");
const SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const BOTCONVERSA_BASE = "https://backend.botconversa.com.br/api/v1/webhook";
// A API do BotConversa devolve 429 ("You reach rate limit") com poucas chamadas
// simultâneas — testado em produção com concorrência 4 e ~25% dos contatos
// batiam em rate limit. Concorrência baixa + retry com backoff (abaixo) é o
// que de fato sustenta o throughput sem ficar reprocessando erro.
const SYNC_CONCURRENCY = Math.min(4, Math.max(1, Number(env("BOTCONVERSA_SYNC_CONCURRENCY") || 2) || 2));

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Colab = Record<string, any>;

function onlyDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeText(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

function normalizePhone(raw: unknown) {
  let digits = onlyDigits(raw).replace(/^0+/, "");
  if (!digits) return { e164: "", national: "" };
  let national = digits;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) national = digits.slice(2);
  if (national.length === 10 || national.length === 11) return { e164: `+55${national}`, national };
  return { e164: `+${digits}`, national };
}

function colaboradorAtivo(c: Colab) {
  const situacao = normalizeText(c.situacao);
  if (situacao.includes("nao ativo") || situacao.includes("inativo") || situacao.includes("desligado")) return false;
  if (c.ativo === false) return false;
  return true;
}

function splitName(nome: string | null) {
  const parts = String(nome || "Contato").trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  const first = parts[0] || "Contato";
  const last = parts.slice(1).join(" ") || "-";
  return { first, last };
}

function colaboradorKey(c: Colab) {
  const cpf = onlyDigits(c.cpf);
  if (cpf) return cpf;
  return normalizePhone(c.whatsapp).e164.replace("+", "");
}

// Mesma regra de etiquetas usada no export manual "Users BotConversa"
// (assets/js/modules/contatos.js:mapBotConversaUsers), agora aplicada
// automaticamente via API em vez de depender de upload manual de XLSX.
function computeTags(c: Colab, atrasoSet: Set<string>) {
  const base = [c.empresa, c.coordenacao, c.supervisao, c.tipo, c.cargo, "Colaborador"]
    .filter(Boolean)
    .map((v) => String(v).trim())
    .filter(Boolean);
  if (atrasoSet.has(normalizeText(c.nome))) base.push("Leitura em Atraso");
  return Array.from(new Set(base));
}

function payloadHash(c: Colab, tags: string[]) {
  return JSON.stringify({
    nome: c.nome || "",
    telefone: normalizePhone(c.whatsapp).e164,
    email: c.email_empresa || c.email_pessoal || "",
    empresa: c.empresa || "",
    tags: [...tags].sort(),
  });
}

async function getApiKey() {
  const { data, error } = await admin
    .from("ti_integracao_segredos")
    .select("valor")
    .eq("chave", "BOTCONVERSA_API_KEY")
    .eq("ativo", true)
    .maybeSingle();
  if (error) throw error;
  if (!data?.valor) throw new Error("BOTCONVERSA_API_KEY não configurada em TI > Integrações.");
  return data.valor as string;
}

async function loadActiveColaboradores() {
  const selectCols = "cpf,nome,situacao,empresa,whatsapp,email_pessoal,email_empresa,coordenacao,supervisao,tipo,cargo";
  const pageSize = 1000;
  let from = 0;
  const all: Colab[] = [];
  while (true) {
    const { data, error } = await admin
      .from("colaboradores")
      .select(selectCols)
      .order("nome", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
    if (from > 50000) break;
  }

  const ativos = all.filter(colaboradorAtivo).filter((c: any) => c.nome && c.whatsapp);

  const dedup = new Map<string, Colab>();
  for (const c of ativos) {
    const key = colaboradorKey(c);
    if (key && !dedup.has(key)) dedup.set(key, c);
  }
  return Array.from(dedup.values());
}

// Mesma fonte/limite usados em contatos.js:loadPatrimoniosAtraso (30 dias pra
// coordenação GERAL, 10 dias pras demais) — mantém a tag "Leitura em Atraso"
// consistente entre o export manual e a sync automática.
async function loadPatrimoniosAtraso() {
  const set = new Set<string>();
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await admin
      .from("patrimonios_snapshot")
      .select("funcionario,coordenacao,dias_sem_leitura")
      .range(from, from + pageSize - 1);
    if (error) return set; // tabela pode não existir em todo ambiente; não derruba a sync
    const rows = data || [];
    for (const p of rows) {
      const nome = String(p.funcionario || "").trim();
      const dias = Number(p.dias_sem_leitura || 0);
      const limite = normalizeText(p.coordenacao).toUpperCase() === "GERAL" ? 30 : 10;
      if (nome && dias > limite) set.add(normalizeText(nome));
    }
    if (rows.length < pageSize) break;
    from += pageSize;
    if (from > 100000) break;
  }
  return set;
}

// Carrega de uma vez todos os contatos já mapeados no BotConversa, evitando
// 1 consulta ao banco por colaborador (era um dos motivos da sync antiga travar).
async function loadContatosMap() {
  const map = new Map<string, any>();
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await admin
      .from("botconversa_contatos")
      .select("*")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data || [];
    for (const r of rows) {
      const key = onlyDigits(r.cpf) || onlyDigits(r.telefone);
      if (key) map.set(key, r);
    }
    if (rows.length < pageSize) break;
    from += pageSize;
    if (from > 100000) break;
  }
  return map;
}

// Catálogo de etiquetas existentes no BotConversa (nome normalizado -> id).
// A API não expõe criação de tags (só GET /tags/) — uma etiqueta precisa
// existir manualmente no BotConversa antes de poder ser aplicada via API.
async function loadTagsCatalog(apiKey: string, log: string[]) {
  const map = new Map<string, number>();
  const headers = { "api-key": apiKey, accept: "application/json" };
  const res = await fetch(`${BOTCONVERSA_BASE}/tags/`, { headers });
  const raw = await res.text();
  if (!res.ok) {
    log.push(`GET tags/ -> ${res.status}: ${raw.slice(0, 300)}`);
    return map;
  }
  try {
    const data = JSON.parse(raw);
    const list = Array.isArray(data) ? data : (data?.results || []);
    for (const t of list) {
      if (t?.name && t?.id) map.set(normalizeText(t.name), Number(t.id));
    }
  } catch (_) {
    log.push("parse error on GET tags/ response");
  }
  return map;
}

async function runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function next(): Promise<void> {
    const i = cursor++;
    if (i >= items.length) return;
    results[i] = await worker(items[i]);
    return next();
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, () => next());
  await Promise.all(runners);
  return results;
}

function extractId(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const id = d.id ?? d.subscriber_id ?? (d.data as Record<string, unknown>)?.id ?? (d.subscriber as Record<string, unknown>)?.id;
  return id ? Number(id) : null;
}

// Tenta uma chamada até 4 vezes com backoff crescente quando a API devolve
// 429 (rate limit) — sem isso, qualquer rajada de chamadas simultâneas falha
// em ~25% dos contatos (confirmado em teste real).
async function fetchWithRetry(url: string, init: RequestInit, log: string[], label: string): Promise<{ status: number; raw: string }> {
  const delays = [1500, 3500, 7000];
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    const raw = await res.text();
    if (res.status !== 429 || attempt >= delays.length) return { status: res.status, raw };
    log.push(`${label} -> 429 (tentativa ${attempt + 1}): ${raw.slice(0, 200)}`);
    await sleep(delays[attempt]);
  }
}

// Mesma lógica usada em botconversa-send: busca o subscriber pelo telefone e,
// se não existir, cria. `tel` deve vir só com dígitos (com DDI 55).
async function getSubscriberId(tel: string, nome: string | null, apiKey: string, log: string[]): Promise<number | null> {
  const headers = { "api-key": apiKey, accept: "application/json" };
  const phone = `+${tel}`;

  const { status: getStatus, raw: getRaw } = await fetchWithRetry(`${BOTCONVERSA_BASE}/subscriber/${phone}/`, { headers }, log, `GET subscriber/${phone}`);
  log.push(`GET subscriber/${phone} -> ${getStatus}: ${getRaw.slice(0, 300)}`);

  if (getStatus >= 200 && getStatus < 300) {
    try {
      const id = extractId(JSON.parse(getRaw));
      if (id) return id;
    } catch (_) { log.push("parse error on GET response"); }
  }

  const { first, last } = splitName(nome);
  const body = new FormData();
  body.append("phone", phone);
  body.append("first_name", first);
  body.append("last_name", last);
  const { status: createStatus, raw: createRaw } = await fetchWithRetry(`${BOTCONVERSA_BASE}/subscriber/`, { method: "POST", headers, body }, log, "POST subscriber");
  log.push(`POST subscriber -> ${createStatus}: ${createRaw.slice(0, 300)}`);

  if (createStatus >= 200 && createStatus < 300) {
    try {
      const id = extractId(JSON.parse(createRaw));
      if (id) return id;
    } catch (_) { log.push("parse error on POST response"); }
  }

  return null;
}

// Aplica só a diferença entre as etiquetas do último sync bem-sucedido
// (metadata.tagsAplicadas) e as etiquetas desejadas agora — evita chamadas
// desnecessárias e nunca mexe em etiquetas que não foram criadas por esta
// sync (campanhas, tags manuais etc. ficam intocadas).
async function applyTags(
  subscriberId: number,
  previousAplicadas: string[],
  desired: string[],
  tagsCatalog: Map<string, number>,
  apiKey: string,
  log: string[],
) {
  const headers = { "api-key": apiKey, accept: "application/json" };
  const toAdd = desired.filter((t) => !previousAplicadas.includes(t));
  const toRemove = previousAplicadas.filter((t) => !desired.includes(t));
  const aplicadas = new Set(previousAplicadas.filter((t) => desired.includes(t)));
  const ausentes: string[] = [];

  for (const name of toAdd) {
    const tagId = tagsCatalog.get(normalizeText(name));
    if (!tagId) { ausentes.push(name); continue; }
    const { status, raw } = await fetchWithRetry(
      `${BOTCONVERSA_BASE}/subscriber/${subscriberId}/tags/${tagId}/`,
      { method: "POST", headers },
      log,
      `POST tag "${name}"`,
    );
    if (status >= 200 && status < 300) aplicadas.add(name);
    else log.push(`Falha ao adicionar tag "${name}" (HTTP ${status}): ${raw.slice(0, 200)}`);
  }

  for (const name of toRemove) {
    const tagId = tagsCatalog.get(normalizeText(name));
    if (!tagId) continue; // etiqueta não existe mais no catálogo — nada a remover via API
    const { status, raw } = await fetchWithRetry(
      `${BOTCONVERSA_BASE}/subscriber/${subscriberId}/tags/${tagId}/`,
      { method: "DELETE", headers },
      log,
      `DELETE tag "${name}"`,
    );
    if (!(status >= 200 && status < 300) && status !== 404) {
      log.push(`Falha ao remover tag "${name}" (HTTP ${status}): ${raw.slice(0, 200)}`);
    }
  }

  return {
    aplicadas: Array.from(aplicadas),
    ausentes,
    mudou: toAdd.length > 0 || toRemove.length > 0,
  };
}

async function syncOne(
  c: Colab,
  apiKey: string,
  mapCache: Map<string, any>,
  tagsCatalog: Map<string, number>,
  atrasoSet: Set<string>,
  jobId: string,
  tagsAusentesGlobal: Set<string>,
) {
  const key = colaboradorKey(c);
  const tel = normalizePhone(c.whatsapp).e164.replace("+", "");
  if (!key || !tel) return { action: "ignorado" as const };

  const desiredTags = computeTags(c, atrasoSet);
  const hash = payloadHash(c, desiredTags);
  const existing = mapCache.get(key);
  const previousAplicadas: string[] = Array.isArray(existing?.metadata?.tagsAplicadas) ? existing.metadata.tagsAplicadas : [];
  const previousAusentes: string[] = Array.isArray(existing?.metadata?.tagsAusentes) ? existing.metadata.tagsAusentes : [];
  const hashUnchanged = !!existing?.subscriber_id && existing.metadata?.hash === hash;

  // Sem mudança nos dados/tags desejadas e sem etiqueta pendente de retry: nada a fazer.
  if (hashUnchanged && previousAusentes.length === 0) {
    return { action: "ignorado" as const };
  }

  const log: string[] = [];
  let subscriberId: number | null = existing?.subscriber_id ? Number(existing.subscriber_id) : null;
  if (!subscriberId || !hashUnchanged) {
    subscriberId = await getSubscriberId(tel, c.nome, apiKey, log);
  }

  const cpf = onlyDigits(c.cpf) || null;

  if (!subscriberId) {
    const row = {
      cpf, nome: c.nome || null, telefone: tel,
      email: c.email_empresa || c.email_pessoal || null,
      empresa: c.empresa || null, ativo: true,
      subscriber_id: null,
      synced_at: new Date().toISOString(),
      metadata: { hash, tags: desiredTags, tagsAplicadas: previousAplicadas, tagsAusentes: previousAusentes },
    };
    if (cpf) await admin.from("botconversa_contatos").upsert(row, { onConflict: "cpf" });
    else await admin.from("botconversa_contatos").insert(row);

    await admin.from("botconversa_logs").insert({
      job_id: jobId, tipo: "sync_subscribers", empresa: c.empresa || null, nome: c.nome || null,
      cpf, telefone: tel, subscriber_id: null, sucesso: false,
      erro: "Não foi possível localizar ou criar o contato no BotConversa.",
      origem: "supabase_job", response_payload: { log },
    });
    return { action: "erro" as const };
  }

  const tagResult = await applyTags(subscriberId, previousAplicadas, desiredTags, tagsCatalog, apiKey, log);
  for (const nome of tagResult.ausentes) tagsAusentesGlobal.add(nome);

  const row = {
    cpf, nome: c.nome || null, telefone: tel,
    email: c.email_empresa || c.email_pessoal || null,
    empresa: c.empresa || null, ativo: true,
    subscriber_id: String(subscriberId),
    synced_at: new Date().toISOString(),
    metadata: { hash, tags: desiredTags, tagsAplicadas: tagResult.aplicadas, tagsAusentes: tagResult.ausentes },
  };

  let saved = row;
  if (cpf) {
    const { data, error } = await admin.from("botconversa_contatos").upsert(row, { onConflict: "cpf" }).select("*").single();
    if (error) throw error;
    saved = data;
  } else {
    // Sem CPF não há chave única pra upsert: insere isolado pra não travar o lote.
    const { data, error } = await admin.from("botconversa_contatos").insert(row).select("*").single();
    if (error) throw error;
    saved = data;
  }
  mapCache.set(key, saved);

  const houveAcao = !hashUnchanged || tagResult.mudou;
  await admin.from("botconversa_logs").insert({
    job_id: jobId, tipo: "sync_subscribers", empresa: c.empresa || null, nome: c.nome || null,
    cpf, telefone: tel, subscriber_id: String(subscriberId), sucesso: true, erro: null,
    origem: "supabase_job",
    response_payload: { log, tags_aplicadas: tagResult.aplicadas, tags_ausentes: tagResult.ausentes },
  });

  if (!houveAcao) return { action: "ignorado" as const };
  return { action: existing ? ("atualizado" as const) : ("criado" as const) };
}

async function getRunningJob() {
  const { data, error } = await admin
    .from("botconversa_jobs")
    .select("*")
    .eq("tipo", "sync_subscribers")
    .in("status", ["pendente", "processando"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getJobById(jobId: string) {
  const { data, error } = await admin.from("botconversa_jobs").select("*").eq("id", jobId).maybeSingle();
  if (error) throw error;
  return data;
}

async function updateJob(jobId: string, patch: Record<string, unknown>) {
  const { error } = await admin.from("botconversa_jobs").update(patch).eq("id", jobId);
  if (error) throw error;
}

async function processSyncJob(jobId: string) {
  try {
    const apiKey = await getApiKey();
    await updateJob(jobId, { status: "processando" });

    const tagsCatalogLog: string[] = [];
    const [all, mapCache, tagsCatalog, atrasoSet] = await Promise.all([
      loadActiveColaboradores(),
      loadContatosMap(),
      loadTagsCatalog(apiKey, tagsCatalogLog),
      loadPatrimoniosAtraso(),
    ]);
    const total = all.length;
    const tagsAusentesGlobal = new Set<string>();

    let processado = 0;
    let sucesso = 0;
    let erro = 0;
    const batchSize = 60;

    for (let i = 0; i < total; i += batchSize) {
      const slice = all.slice(i, i + batchSize);
      const results = await runWithConcurrency(slice, SYNC_CONCURRENCY, async (c) => {
        try {
          return await syncOne(c, apiKey, mapCache, tagsCatalog, atrasoSet, jobId, tagsAusentesGlobal);
        } catch (err: any) {
          await admin.from("botconversa_logs").insert({
            job_id: jobId,
            tipo: "sync_subscribers",
            empresa: c.empresa || null,
            nome: c.nome || null,
            cpf: onlyDigits(c.cpf) || null,
            sucesso: false,
            erro: String(err?.message || err).slice(0, 500),
            origem: "supabase_job",
          }).catch(() => null);
          return { action: "erro" as const };
        }
      });

      for (const r of results) {
        if (r.action === "ignorado") continue;
        processado++;
        if (r.action === "erro") erro++;
        else sucesso++;
      }

      await updateJob(jobId, {
        total_processado: processado,
        total_sucesso: sucesso,
        total_erro: erro,
        observacoes: `${Math.min(i + slice.length, total)} de ${total} colaboradores avaliados.`,
      });
    }

    const ausentesResumo = tagsAusentesGlobal.size
      ? ` Etiquetas ausentes no BotConversa (crie-as manualmente para que sejam aplicadas): ${Array.from(tagsAusentesGlobal).join(", ")}.`
      : "";

    await updateJob(jobId, {
      status: erro ? "parcial" : "concluido",
      total_processado: processado,
      total_sucesso: sucesso,
      total_erro: erro,
      finished_at: new Date().toISOString(),
      observacoes: `${total} colaboradores avaliados (${processado} sincronizados, ${total - processado} sem alteração).${ausentesResumo}`,
      erro: erro ? `${erro} contato(s) com erro. Veja botconversa_logs.` : null,
    });
  } catch (err: any) {
    const message = String(err?.message || err).slice(0, 1000);
    await updateJob(jobId, { status: "erro", erro: message, finished_at: new Date().toISOString() }).catch(() => null);
  }
}

function scheduleBackground(jobId: string) {
  const promise = processSyncJob(jobId);
  try {
    const runtime = (globalThis as any).EdgeRuntime || (typeof EdgeRuntime !== "undefined" ? EdgeRuntime : null);
    if (runtime?.waitUntil) runtime.waitUntil(promise);
    else promise.catch((err) => console.error("Background botconversa sync failed", err));
  } catch (_err) {
    promise.catch((err) => console.error("Background botconversa sync failed", err));
  }
}

async function handleStartSync() {
  const running = await getRunningJob();
  if (running) {
    scheduleBackground(running.id);
    return json({ ok: true, started: true, job_id: running.id, status: running.status, reused: true });
  }

  const { data: job, error } = await admin
    .from("botconversa_jobs")
    .insert({ tipo: "sync_subscribers", status: "pendente", total_processado: 0, total_sucesso: 0, total_erro: 0 })
    .select("*")
    .single();
  if (error) throw error;

  scheduleBackground(job.id);
  return json({ ok: true, started: true, job_id: job.id, status: job.status });
}

async function handleJobStatus(body: any) {
  const jobId = String(body?.job_id || "").trim();
  if (jobId) {
    const job = await getJobById(jobId);
    if (!job) return json({ ok: false, error: "Job não encontrado." }, 404);
    return json({ ok: true, job });
  }
  const { data, error } = await admin
    .from("botconversa_jobs")
    .select("*")
    .eq("tipo", "sync_subscribers")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return json({ ok: true, job: data || null });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido." }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "status");
    if (action === "start_sync") return await handleStartSync();
    if (action === "job_status") return await handleJobStatus(body);
    return json({ ok: false, error: "Ação inválida." }, 400);
  } catch (err: any) {
    return json({ ok: false, error: String(err?.message || err) }, 400);
  }
});
