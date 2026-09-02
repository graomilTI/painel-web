#!/usr/bin/env node

/**
 * Sincroniza colaboradores diretamente pela API do GRM.
 *
 * O GRM não expõe webhook; por isso o processo mantém um polling curto. Cada
 * diferença é persistida no Supabase e chega ao painel por Supabase Realtime.
 */

const dotenvResult = require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Alguns servidores legados mantêm `.env` com espaços ao redor do `=`. A
// versão antiga de dotenv instalada no cPanel não normaliza todas essas linhas.
// Reaproveita somente os pares já parseados e corrige o nome da variável, sem
// imprimir ou persistir os valores.
for (const [rawKey, value] of Object.entries(dotenvResult.parsed || {})) {
  const key = rawKey.trim();
  if (key && !process.env[key]) process.env[key] = value;
}

// Fallback para dotenv legado: aceita `CHAVE = valor`, preservando o valor
// integral e removendo apenas aspas externas.
try {
  const envText = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
} catch {
  // requiredEnv produzirá uma mensagem objetiva se o arquivo não existir.
}

const crypto = require('crypto');
const https = require('https');

const GRM_BASE_URL = String(process.env.GRMSERVER_API_URL || 'https://www.grmserver.com.br/api/').replace(/\/?$/, '/');
// agente_id próprio pro heartbeat (não "sync-colaboradores"): esse id tem
// enabled=false em grm_sync_agent_settings (agente antigo pausado), e o
// trigger trg_grm_sync_guard_disabled_agent bloqueia QUALQUER insert em
// grm_sync_jobs pra um agente desativado — inclusive o heartbeat deste
// serviço, que não tem nada a ver com o agente pausado. Um id sem linha em
// grm_sync_agent_settings passa livre pelo trigger (v_enabled fica NULL, não
// "is false"). ti-agentes.js referencia esse id via `aliases`.
const AGENT_ID = 'sync-colaboradores-realtime';
const POLL_INTERVAL_MS = Math.max(2000, Number(process.env.GRM_COLABORADORES_POLL_MS || 5000));
const PAGE_SIZE = 1000;
const MAX_ROWS = 20000;
const GRM_WEB_HEADERS = {
  origin: 'https://www.grmserver.com.br',
  referer: 'https://www.grmserver.com.br/login',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

const TRACKED_FIELDS = [
  'cpf', 'nome', 'situacao', 'admissao', 'desligamento', 'salario',
  'empresa', 'coordenacao', 'supervisao', 'tipo', 'cep', 'estado',
  'cidade', 'bairro', 'endereco', 'complemento', 'data_nascimento',
  'cargo', 'whatsapp', 'email_pessoal', 'email_empresa',
];

const logger = {
  info: (message) => console.log(`[INFO] ${new Date().toISOString()} - ${message}`),
  warn: (message) => console.warn(`[WARN] ${new Date().toISOString()} - ${message}`),
  error: (message) => console.error(`[ERROR] ${new Date().toISOString()} - ${message}`),
};

function requiredEnv(name, alternatives = []) {
  for (const key of [name, ...alternatives]) {
    if (process.env[key]) return process.env[key];
  }
  throw new Error(`Variável obrigatória ausente: ${[name, ...alternatives].join(' ou ')}`);
}

function requestJson(url, method = 'GET', body = null, headers = {}) {
  const parsed = new URL(url);
  const payload = body == null ? '' : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: `${parsed.pathname}${parsed.search}`,
      method,
      timeout: 30000,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let data;
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          reject(new Error(`GRM retornou conteúdo inválido (HTTP ${response.statusCode}).`));
          return;
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error(`GRM respondeu HTTP ${response.statusCode}: ${data.message || 'erro'}`);
          error.statusCode = response.statusCode;
          reject(error);
          return;
        }
        resolve(data);
      });
    });

    request.on('timeout', () => request.destroy(new Error('Timeout ao consultar o GRM.')));
    request.on('error', reject);
    request.end(payload || undefined);
  });
}

function postJson(url, body, headers = {}) {
  return requestJson(url, 'POST', body, headers);
}

function createSupabaseRest(baseUrl, serviceKey) {
  const restUrl = `${String(baseUrl).replace(/\/$/, '')}/rest/v1`;
  const authHeaders = {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
  };

  return {
    async selectAll(table, offset, limit) {
      return requestJson(
        `${restUrl}/${table}?select=*&offset=${offset}&limit=${limit}`,
        'GET',
        null,
        authHeaders,
      );
    },
    async updateById(table, id, body) {
      const rows = await requestJson(
        `${restUrl}/${table}?id=eq.${encodeURIComponent(id)}`,
        'PATCH',
        body,
        { ...authHeaders, prefer: 'return=representation' },
      );
      return rows?.[0] || null;
    },
    async upsertByCpf(body) {
      const rows = await requestJson(
        `${restUrl}/colaboradores?on_conflict=cpf`,
        'POST',
        body,
        { ...authHeaders, prefer: 'resolution=merge-duplicates,return=representation' },
      );
      return rows?.[0] || null;
    },
    async insertChanges(rows) {
      if (!rows.length) return;
      await requestJson(
        `${restUrl}/colaboradores_alteracoes?on_conflict=event_key`,
        'POST',
        rows,
        { ...authHeaders, prefer: 'resolution=ignore-duplicates,return=minimal' },
      );
    },
    async insertJob(payload) {
      const rows = await requestJson(
        `${restUrl}/grm_sync_jobs`,
        'POST',
        payload,
        { ...authHeaders, prefer: 'return=representation' },
      );
      return rows?.[0] || null;
    },
    async updateJob(id, patch) {
      await requestJson(
        `${restUrl}/grm_sync_jobs?id=eq.${encodeURIComponent(id)}`,
        'PATCH',
        patch,
        { ...authHeaders, prefer: 'return=minimal' },
      );
    },
  };
}

function normalizeText(value) {
  return value == null ? '' : String(value).trim();
}

function normalizeCpf(value) {
  return normalizeText(value).replace(/\D/g, '');
}

function normalizePhone(value) {
  return normalizeText(value).replace(/\D/g, '');
}

function normalizeDate(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const br = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : null;
}

function statusLabel(value) {
  return String(value || '').toUpperCase() === 'A' ? 'Ativo' : 'Não Ativo';
}

function staffTypeLabel(value, fallback) {
  const type = String(value || '').toUpperCase();
  if (type === 'D') return 'Diarista';
  if (type === 'I') return 'Intermitente';
  if (type) return 'Efetivo';
  return normalizeText(fallback);
}

function mapStaff(row, synchronizedAt) {
  const salary = Number(row.staSalary || 0);
  return {
    grm_staff_code: Number(row.staCode) || null,
    cpf: normalizeCpf(row.staCPF),
    nome: normalizeText(row.staName),
    situacao: statusLabel(row.staStatus),
    admissao: normalizeDate(row.staAdmissionDate),
    desligamento: normalizeDate(row.staResignationDate),
    salario: Number.isFinite(salary) ? String(salary) : '0',
    empresa: normalizeText(row.scpName),
    coordenacao: normalizeText(row.olcName),
    supervisao: normalizeText(row.olsName),
    tipo: staffTypeLabel(row.staType, row.srtName),
    cep: normalizeText(row.staAddressCEP),
    estado: normalizeText(row.staAbreviation),
    cidade: normalizeText(row.citName || row.staCitName),
    bairro: normalizeText(row.staAddressDistrict),
    endereco: normalizeText(row.staAddress),
    complemento: [row.staAddressNumber, row.staAddressComplement].map(normalizeText).filter(Boolean).join(' - '),
    data_nascimento: normalizeDate(row.staBirthDate),
    cargo: normalizeText(row.stpName),
    whatsapp: normalizePhone(row.staPhoneCompany),
    email_pessoal: normalizeText(row.staEmailPersonal).toLowerCase(),
    email_empresa: normalizeText(row.staEmailCompany).toLowerCase(),
    sincronizado_em: synchronizedAt,
    metadata: {
      origem: 'grm_api_staff_get_records',
      grm_staff_code: Number(row.staCode) || null,
      sincronizado_em: synchronizedAt,
    },
  };
}

function comparable(row) {
  const result = {};
  for (const field of TRACKED_FIELDS) result[field] = row?.[field] ?? null;
  return result;
}

function diffRows(previous, current) {
  const before = comparable(previous || {});
  const after = comparable(current || {});
  const fields = TRACKED_FIELDS.filter((field) => String(before[field] ?? '') !== String(after[field] ?? ''));
  return {
    fields,
    before: Object.fromEntries(fields.map((field) => [field, before[field]])),
    after: Object.fromEntries(fields.map((field) => [field, after[field]])),
  };
}

function eventType(previous, current) {
  if (!previous) return 'CADASTRADO';
  const wasActive = previous.situacao === 'Ativo';
  const isActive = current.situacao === 'Ativo';
  if (wasActive && !isActive) return 'INATIVADO';
  if (!wasActive && isActive) return 'REATIVADO';
  return 'ALTERADO';
}

function eventKey(staffCode, previous, current, diff, detectedAt) {
  const content = JSON.stringify({
    staffCode,
    type: eventType(previous, current),
    before: diff.before,
    after: diff.after,
    detectedAt,
  });
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function login() {
  const userEmail = requiredEnv('GRMSERVER_USER');
  const userPass = requiredEnv('GRMSERVER_PASSWORD');
  const response = await postJson(`${GRM_BASE_URL}user/login`, {
    userEmail,
    userPass,
    loginInfo: {
      ip: '', browser: 'GRM API Agent', browserVersion: '1.0',
      engine: 'Node.js', engineVersion: process.version,
      platform: process.platform, screenSize: '', windowSize: '',
    },
  }, GRM_WEB_HEADERS);
  if (!response.result || !response.token) throw new Error(`Login GRM recusado: ${response.message || 'sem token'}`);
  return response.token;
}

async function fetchStaff(token) {
  const response = await postJson(`${GRM_BASE_URL}staff/getRecords`, {
    staName: '', staCPF: '', staEmail: '', staStatus: '',
  }, { ...GRM_WEB_HEADERS, authorization: `Bearer ${token}` });
  if (!response.result) {
    const error = new Error(`Consulta de colaboradores recusada: ${response.message || 'erro GRM'}`);
    error.requiresLogin = Boolean(response.logoutUser);
    throw error;
  }
  if (!Array.isArray(response.searchData)) throw new Error('Resposta do GRM não contém searchData.');
  return response.searchData;
}

async function fetchAllCurrent(supabase) {
  const rows = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const data = await supabase.selectAll('colaboradores', offset, PAGE_SIZE);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function applyCycle(supabase, rawRows) {
  const synchronizedAt = new Date().toISOString();
  const remoteRows = rawRows.map((row) => mapStaff(row, synchronizedAt)).filter((row) => row.grm_staff_code && row.cpf && row.nome);
  const currentRows = await fetchAllCurrent(supabase);
  const byCode = new Map(currentRows.filter((row) => row.grm_staff_code).map((row) => [Number(row.grm_staff_code), row]));
  const byCpf = new Map(currentRows.filter((row) => row.cpf).map((row) => [normalizeCpf(row.cpf), row]));
  const changes = [];

  for (const remote of remoteRows) {
    const previous = byCode.get(remote.grm_staff_code) || byCpf.get(remote.cpf) || null;
    const diff = diffRows(previous, remote);
    if (previous && diff.fields.length === 0) {
      // Faz a associação inicial com o código imutável do GRM sem criar um
      // evento falso para um cadastro que já existia antes deste agente.
      if (!previous.grm_staff_code) {
        await supabase.updateById('colaboradores', previous.id, {
          grm_staff_code: remote.grm_staff_code,
          sincronizado_em: synchronizedAt,
        });
      }
      continue;
    }

    // Depois que staCode foi associado, ele é a identidade canônica. Assim uma
    // correção de CPF atualiza a mesma pessoa em vez de criar outro cadastro.
    const saved = previous
      ? await supabase.updateById('colaboradores', previous.id, remote)
      : await supabase.upsertByCpf(remote);
    if (!saved?.id) throw new Error(`Falha ao salvar ${remote.nome}: resposta sem id.`);

    changes.push({
      event_key: eventKey(remote.grm_staff_code, previous, remote, diff, synchronizedAt),
      colaborador_id: saved.id,
      grm_staff_code: remote.grm_staff_code,
      cpf: remote.cpf,
      nome: remote.nome,
      tipo_evento: eventType(previous, remote),
      campos_alterados: diff.fields,
      valores_anteriores: diff.before,
      valores_novos: diff.after,
      detectado_em: synchronizedAt,
      metadata: { intervalo_ms: POLL_INTERVAL_MS },
    });
  }

  if (changes.length) {
    await supabase.insertChanges(changes);
  }

  return { remote: remoteRows.length, changed: changes.length };
}

// Este serviço roda fora da fila grm_sync_jobs (nada o invoca via job-worker),
// mas a tela de Agentes (assets/js/ti-agentes.js) lê o último job de lá pra
// status/Última Sync do card. applyCycle só grava em `colaboradores` quando há
// diff real, então um heartbeat baseado no updated_at da própria tabela ficaria
// "Erro" em qualquer janela sem mudanças (madrugada, fim de semana) mesmo com o
// serviço saudável — por isso reporta aqui, direto, independente de diff.
// Mantém UMA linha por ciclo de vida do processo (atualizada a cada ciclo), não
// insere um job novo a cada poll de 5s pra não inflar grm_sync_jobs.
async function reportarInicio(supabase) {
  try {
    const job = await supabase.insertJob({
      agente_id: AGENT_ID,
      status: 'rodando',
      iniciado_em: new Date().toISOString(),
      worker_id: 'realtime-service',
    });
    return job?.id || null;
  } catch (error) {
    logger.warn(`Falha ao registrar job inicial em grm_sync_jobs: ${error.message}`);
    return null;
  }
}

async function reportarCiclo(supabase, jobId, patch) {
  if (!jobId) return;
  try {
    await supabase.updateJob(jobId, patch);
  } catch (error) {
    logger.warn(`Falha ao atualizar job em grm_sync_jobs: ${error.message}`);
  }
}

async function main() {
  const supabase = createSupabaseRest(
    requiredEnv('SUPABASE_URL', ['SB_URL']),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY', ['SUPABASE_SERVICE_KEY', 'SB_SERVICE_KEY', 'SUPABASE_KEY']),
  );
  let token = await login();
  logger.info(`Agente iniciado; intervalo ${POLL_INTERVAL_MS} ms.`);
  const jobId = await reportarInicio(supabase);

  while (true) {
    const startedAt = Date.now();
    try {
      let staff;
      try {
        staff = await fetchStaff(token);
      } catch (error) {
        if (!error.requiresLogin && error.statusCode !== 401) throw error;
        token = await login();
        staff = await fetchStaff(token);
      }
      const result = await applyCycle(supabase, staff);
      if (result.changed) logger.info(`${result.changed} mudança(s) em ${result.remote} colaborador(es).`);
      await reportarCiclo(supabase, jobId, {
        status: 'sucesso',
        finalizado_em: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        erro: null,
        output: { remote: result.remote, changed: result.changed },
      });
    } catch (error) {
      logger.error(error.stack || error.message);
      await reportarCiclo(supabase, jobId, {
        status: 'erro',
        finalizado_em: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        erro: String(error.message || error).slice(0, 4000),
      });
    }
    const remaining = Math.max(250, POLL_INTERVAL_MS - (Date.now() - startedAt));
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

if (require.main === module) {
  main().catch((error) => {
    logger.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = { mapStaff, diffRows, eventType, applyCycle, createSupabaseRest };
