#!/usr/bin/env node
'use strict';

/*
 * GRM Server - Lançamento automático de Notas Fiscais / Contas a Pagar
 *
 * Origem: pasta do Google Drive.
 * Destino: https://www.grmserver.com.br/finance/payInvoice
 *
 * Segurança operacional:
 * - dry-run por padrão;
 * - valida todos os campos antes de abrir o GRM;
 * - não relança o mesmo arquivo do Drive;
 * - não relança a mesma NF pelo fingerprint CNPJ+número+data+valor;
 * - registra execução, extração, erros e código retornado pelo GRM no Supabase;
 * - arquivos sem categoria, vencimento ou forma de pagamento ficam pendentes.
 */

process.env.HOME = process.env.HOME || '/home/grao100';
process.env.TMP = process.env.TMP || '/home/grao100/chrome-runtime/tmp';
process.env.TEMP = process.env.TEMP || '/home/grao100/chrome-runtime/tmp';
process.env.TMPDIR = process.env.TMPDIR || '/home/grao100/chrome-runtime/tmp';
process.env.XDG_RUNTIME_DIR = process.env.XDG_RUNTIME_DIR || '/home/grao100/chrome-runtime/tmp';
process.env.XDG_CACHE_HOME = process.env.XDG_CACHE_HOME || '/home/grao100/chrome-runtime/cache';
process.env.MALLOC_ARENA_MAX = process.env.MALLOC_ARENA_MAX || '2';

require('dotenv').config();

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const querystring = require('querystring');
const childProcess = require('child_process');
const util = require('util');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createClient } = require('@supabase/supabase-js');

puppeteer.use(StealthPlugin());

const execFile = util.promisify(childProcess.execFile);

const GRM_URL = 'https://www.grmserver.com.br/finance/payInvoice';
const LOGIN_URL = 'https://www.grmserver.com.br/login';
const TABLE_ITEMS = process.env.GRM_LANCAR_NF_TABLE || 'grm_nf_lancamentos';
const TABLE_RUNS = process.env.GRM_LANCAR_NF_RUNS_TABLE || 'grm_nf_lancamento_execucoes';
const DEFAULT_FOLDER_ID = '1j6Yem3_fr2FWO0s7SiUWj9N1_CQeKut5e';
const FOLDER_ID = process.env.GRM_LANCAR_NF_FOLDER_ID || DEFAULT_FOLDER_ID;
const CONFIG_PATH = process.env.GRM_LANCAR_NF_CONFIG || path.join(__dirname, 'config', 'grm-lancar-notas-fiscais.json');
const CREDENTIALS_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, 'google-service-account.json');
const MAX_PER_RUN = positiveInt(process.env.GRM_LANCAR_NF_MAX_POR_EXECUCAO, 5);
const RECURSIVE = envBool('GRM_LANCAR_NF_RECURSIVE', true);
const REQUIRE_ATTACHMENT = envBool('GRM_LANCAR_NF_EXIGIR_ANEXO', true);
const MOVE_AFTER_SUCCESS = envBool('GRM_LANCAR_NF_MOVER_APOS_SUCESSO', false);
const SUCCESS_FOLDER_ID = process.env.GRM_LANCAR_NF_PASTA_LANCADOS_ID || '';
const DEBUG = envBool('GRM_LANCAR_NF_DEBUG', false);
const DEBUG_DIR = process.env.GRM_LANCAR_NF_DEBUG_DIR || path.join(os.tmpdir(), 'grm-lancar-notas-fiscais-debug');
const OCR_PDF_MAX_PAGES = positiveInt(process.env.GRM_LANCAR_NF_OCR_PDF_MAX_PAGINAS, 4);
const GRM_USER = process.env.GRMSERVER_USER || '';
const GRM_PASSWORD = process.env.GRMSERVER_PASSWORD || '';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SB_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SB_SERVICE_KEY || process.env.SUPABASE_KEY || '';

const args = parseArgs(process.argv.slice(2));
const scheduledEnabled = envBool('GRM_LANCAR_NF_AGENDAR', false);
const dryRunEnv = envBool('GRM_LANCAR_NF_DRY_RUN', true);
const DRY_RUN = args.dryRun ? true : (args.real ? false : dryRunEnv);
const LIMIT = args.limit || MAX_PER_RUN;

let browserAtual = null;
let googleTokenCache = null;
let config = null;
let supabase = null;

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function envBool(name, fallback) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  return /^(1|true|yes|sim|on)$/i.test(String(value));
}

function parseArgs(argv) {
  const out = { dryRun: false, real: false, force: false, debug: false, limit: null, fileId: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--real') out.real = true;
    else if (a === '--force') out.force = true;
    else if (a === '--debug') out.debug = true;
    else if (a === '--limit') out.limit = positiveInt(argv[++i], null);
    else if (a === '--file-id') out.fileId = argv[++i] || null;
  }
  return out;
}

function log(level, message, extra) {
  const suffix = extra === undefined ? '' : ` ${safeJson(extra)}`;
  console.log(`[${level}] ${new Date().toISOString()} - ${message}${suffix}`);
}

function safeJson(value) {
  try { return JSON.stringify(value); } catch (_) { return String(value); }
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function sanitizeFileName(name) {
  return String(name || 'arquivo')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || 'arquivo';
}

function extensionOf(name) {
  return path.extname(String(name || '')).toLowerCase();
}

function stemOf(name) {
  return path.basename(String(name || ''), path.extname(String(name || ''))).trim();
}

function isoNow() {
  return new Date().toISOString();
}

function toBrDate(value) {
  if (!value) return null;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(String(value))) return String(value);
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function toIsoDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const m = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseMoney(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let s = String(value).replace(/[^\d,.-]/g, '').trim();
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function formatMoneyInput(value) {
  const n = parseMoney(value);
  if (n == null) return '';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fingerprintOf(data) {
  const cnpj = onlyDigits(data.fornecedor_cnpj);
  const numero = onlyDigits(data.numero_documento || data.numero_nf);
  const emissao = toIsoDate(data.data_conta || data.data_emissao) || '';
  const valor = parseMoney(data.valor_total);
  if ((!cnpj && !data.fornecedor) || !numero || !emissao || valor == null) return null;
  return sha256([cnpj || normalizeText(data.fornecedor), numero, emissao, valor.toFixed(2)].join('|'));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadJson(filePath, required) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (required) throw new Error(`Não consegui ler JSON ${filePath}: ${error.message}`);
    return null;
  }
}

function assertConfig() {
  if (!FOLDER_ID) throw new Error('Configure GRM_LANCAR_NF_FOLDER_ID.');
  if (!fs.existsSync(CREDENTIALS_PATH)) throw new Error(`Credencial Google não encontrada: ${CREDENTIALS_PATH}`);
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  if (!GRM_USER || !GRM_PASSWORD) throw new Error('Configure GRMSERVER_USER e GRMSERVER_PASSWORD.');
  config = loadJson(CONFIG_PATH, true);
  if (!config.defaults) config.defaults = {};
  if (!Array.isArray(config.folder_rules)) config.folder_rules = [];
  if (!Array.isArray(config.keyword_rules)) config.keyword_rules = [];
  if (!Array.isArray(config.payment_rules)) config.payment_rules = [];
  if (!Array.isArray(config.empresas)) config.empresas = [];
  if (!config.empresas.length) log('WARN', 'config.empresas está vazio: nenhuma nota será lançada até haver ao menos 1 empresa cadastrada (cnpj/cpf -> nome exato no GRM).');
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function base64url(value) {
  return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function httpRequest(options, body, responseType) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}: ${buffer.toString('utf8').slice(0, 2000)}`));
        }
        if (responseType === 'buffer') return resolve(buffer);
        const text = buffer.toString('utf8');
        try { return resolve(text ? JSON.parse(text) : {}); }
        catch (_) { return resolve(text); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getGoogleAccessToken() {
  if (googleTokenCache && Date.now() < googleTokenCache.expiresAt - 60000) return googleTokenCache.token;
  const sa = loadJson(CREDENTIALS_PATH, true);
  if (!sa.client_email || !sa.private_key) throw new Error('JSON da conta de serviço Google inválido: client_email/private_key ausentes.');
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/cloud-platform',
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }));
  const unsigned = `${header}.${payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(sa.private_key).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const assertion = `${unsigned}.${signature}`;
  const form = querystring.stringify({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  const tokenUrl = new URL(sa.token_uri || 'https://oauth2.googleapis.com/token');
  const response = await httpRequest({
    method: 'POST',
    hostname: tokenUrl.hostname,
    path: tokenUrl.pathname,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(form),
    },
  }, form, 'json');
  if (!response.access_token) throw new Error(`Google OAuth não retornou access_token: ${safeJson(response)}`);
  googleTokenCache = { token: response.access_token, expiresAt: Date.now() + Number(response.expires_in || 3600) * 1000 };
  return googleTokenCache.token;
}

async function googleApiJson(hostname, apiPath, method, payload) {
  const token = await getGoogleAccessToken();
  const body = payload == null ? null : JSON.stringify(payload);
  return httpRequest({
    method: method || 'GET',
    hostname,
    path: apiPath,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
    },
  }, body, 'json');
}

async function listDriveChildren(folderId) {
  const files = [];
  let pageToken = '';
  do {
    const q = `'${String(folderId).replace(/'/g, "\\'")}' in parents and trashed=false`;
    const params = new URLSearchParams({
      q,
      pageSize: '1000',
      orderBy: 'name_natural',
      fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,createdTime,parents,md5Checksum,webViewLink)',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await googleApiJson('www.googleapis.com', `/drive/v3/files?${params.toString()}`, 'GET');
    files.push(...(response.files || []));
    pageToken = response.nextPageToken || '';
  } while (pageToken);
  return files;
}

async function listDriveFilesRecursive(folderId, folderPath) {
  const children = await listDriveChildren(folderId);
  const out = [];
  for (const item of children) {
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      if (RECURSIVE) out.push(...await listDriveFilesRecursive(item.id, `${folderPath}/${item.name}`));
      continue;
    }
    out.push({ ...item, folderId, folderPath });
  }
  return out;
}

async function downloadDriveFile(file, targetPath) {
  const token = await getGoogleAccessToken();
  const apiPath = `/drive/v3/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`;
  const buffer = await httpRequest({
    method: 'GET', hostname: 'www.googleapis.com', path: apiPath,
    headers: { Authorization: `Bearer ${token}` },
  }, null, 'buffer');
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, buffer);
  return targetPath;
}

async function moveDriveFile(fileId, sourceFolderId, destinationFolderId) {
  if (!destinationFolderId) return;
  const params = new URLSearchParams({
    addParents: destinationFolderId,
    removeParents: sourceFolderId || '',
    supportsAllDrives: 'true',
    fields: 'id,parents',
  });
  await googleApiJson('www.googleapis.com', `/drive/v3/files/${encodeURIComponent(fileId)}?${params.toString()}`, 'PATCH', {});
}

function supportedPrimary(file) {
  const ext = extensionOf(file.name);
  return ['.xml', '.pdf', '.png', '.jpg', '.jpeg', '.webp'].includes(ext);
}

function groupDriveFiles(files) {
  const sidecars = new Map();
  const groups = new Map();
  for (const file of files) {
    const ext = extensionOf(file.name);
    const key = `${file.folderId}|${normalizeText(stemOf(file.name))}`;
    if (ext === '.json') sidecars.set(key, file);
  }
  for (const file of files.filter(supportedPrimary)) {
    const key = `${file.folderId}|${normalizeText(stemOf(file.name))}`;
    if (!groups.has(key)) groups.set(key, { key, files: [], sidecar: sidecars.get(key) || null });
    groups.get(key).files.push(file);
  }
  const priority = { '.xml': 1, '.pdf': 2, '.png': 3, '.jpg': 3, '.jpeg': 3, '.webp': 3 };
  return Array.from(groups.values()).map((group) => {
    group.files.sort((a, b) => (priority[extensionOf(a.name)] || 99) - (priority[extensionOf(b.name)] || 99));
    group.primary = group.files[0];
    return group;
  });
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
}

function xmlBlock(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = String(xml).match(re);
  return m ? m[1] : '';
}

function xmlTag(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = String(xml).match(re);
  return m ? decodeXml(m[1].replace(/<[^>]+>/g, '')) : null;
}

function xmlTags(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'ig');
  const out = [];
  let m;
  while ((m = re.exec(String(xml)))) out.push(m[1]);
  return out;
}

function extractNfeXml(xml) {
  const emit = xmlBlock(xml, 'emit');
  const dest = xmlBlock(xml, 'dest');
  const ide = xmlBlock(xml, 'ide');
  const total = xmlBlock(xml, 'ICMSTot') || xmlBlock(xml, 'ISSQNtot') || xmlBlock(xml, 'total');
  const cobr = xmlBlock(xml, 'cobr');
  const infNFeMatch = String(xml).match(/<infNFe[^>]+Id=["']NFe(\d{44})["']/i);
  const dups = xmlTags(cobr || xml, 'dup').map((dup) => ({
    numero: xmlTag(dup, 'nDup'),
    vencimento: toBrDate(xmlTag(dup, 'dVenc')),
    valor: parseMoney(xmlTag(dup, 'vDup')),
  })).filter((dup) => dup.vencimento || dup.valor != null);
  const dataEmissaoRaw = xmlTag(ide, 'dhEmi') || xmlTag(ide, 'dEmi') || xmlTag(xml, 'dhEmi') || xmlTag(xml, 'dEmi');
  const numero = xmlTag(ide, 'nNF') || xmlTag(xml, 'nNF') || xmlTag(xml, 'numero');
  const fornecedorCnpj = xmlTag(emit, 'CNPJ') || xmlTag(emit, 'CPF');
  const fornecedor = xmlTag(emit, 'xNome') || xmlTag(emit, 'xFant');
  const valor = parseMoney(xmlTag(total, 'vNF') || xmlTag(total, 'vLiq') || xmlTag(xml, 'vNF'));
  return {
    origem_extracao: 'XML_NFE',
    chave_acesso: infNFeMatch ? infNFeMatch[1] : null,
    numero_documento: numero,
    numero_nf: numero,
    data_emissao: toBrDate(dataEmissaoRaw),
    data_conta: toBrDate(dataEmissaoRaw),
    fornecedor,
    fornecedor_cnpj: fornecedorCnpj,
    destinatario: xmlTag(dest, 'xNome'),
    destinatario_cnpj: xmlTag(dest, 'CNPJ') || xmlTag(dest, 'CPF'),
    valor_total: valor,
    natureza_operacao: xmlTag(ide, 'natOp'),
    parcelas: dups,
    data_vencimento: dups.length === 1 ? dups[0].vencimento : null,
    forma_pagamento_codigo: xmlTag(xmlBlock(xml, 'detPag'), 'tPag') || null,
    tipo_documento: 'DANFe',
    texto_extraido: null,
  };
}

async function commandExists(command) {
  try { await execFile('bash', ['-lc', `command -v ${command}`]); return true; }
  catch (_) { return false; }
}

async function extractPdfText(pdfPath) {
  if (!await commandExists('pdftotext')) return '';
  try {
    const result = await execFile('pdftotext', ['-layout', '-enc', 'UTF-8', pdfPath, '-'], { maxBuffer: 20 * 1024 * 1024 });
    return String(result.stdout || '').trim();
  } catch (error) {
    log('WARN', `pdftotext falhou para ${path.basename(pdfPath)}: ${error.message}`);
    return '';
  }
}

async function visionOcrImage(imagePath) {
  const content = fs.readFileSync(imagePath).toString('base64');
  const response = await googleApiJson('vision.googleapis.com', '/v1/images:annotate', 'POST', {
    requests: [{ image: { content }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }] }],
  });
  const item = response.responses && response.responses[0];
  if (item && item.error) throw new Error(`Google Vision: ${item.error.message || safeJson(item.error)}`);
  return item?.fullTextAnnotation?.text || item?.textAnnotations?.[0]?.description || '';
}

async function visionOcrPdf(pdfPath, workDir) {
  if (!await commandExists('pdftoppm')) throw new Error('PDF sem texto e comando pdftoppm indisponível. Instale poppler-utils.');
  const prefix = path.join(workDir, 'pagina');
  await execFile('pdftoppm', ['-f', '1', '-l', String(OCR_PDF_MAX_PAGES), '-r', '160', '-png', pdfPath, prefix], { maxBuffer: 20 * 1024 * 1024 });
  const images = fs.readdirSync(workDir)
    .filter((name) => /^pagina-\d+\.png$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const texts = [];
  for (const image of images) texts.push(await visionOcrImage(path.join(workDir, image)));
  return texts.join('\n\n');
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern);
    if (match && match[1]) return match[1].trim();
  }
  return null;
}

function allCnpjs(text) {
  const matches = String(text || '').match(/\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/]?\d{4}[-\s]?\d{2}\b/g) || [];
  return Array.from(new Set(matches.map(onlyDigits).filter((v) => v.length === 14)));
}

function allCpfs(text) {
  const matches = String(text || '').match(/\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/g) || [];
  return Array.from(new Set(matches.map(onlyDigits).filter((v) => v.length === 11)));
}

// CNPJ ou CPF do "Empresa" que recebeu a nota (não do fornecedor) — decidido pelo
// documento gravado no próprio arquivo, nunca fixo, porque o GRM tem 6 empresas
// diferentes (GRAOMIL LTDA, BV GRAIN, EXCELENCIA, CAR1000, ELIZEU MOTA, DOUGLAS
// HENRIQUE MOTA) e lançar sob a empresa errada é um erro contábil real.
function ownDocumentos() {
  return new Set((config.empresas || []).map((e) => onlyDigits(e.documento)).filter(Boolean));
}

function resolveEmpresa(documento) {
  const alvo = onlyDigits(documento || '');
  if (!alvo) return null;
  const entry = (config.empresas || []).find((e) => onlyDigits(e.documento) === alvo);
  return entry ? entry.nome : null;
}

function inferPaymentMethod(text) {
  const normalized = normalizeText(text);
  for (const rule of config.payment_rules || []) {
    const keywords = rule.keywords || [];
    if (keywords.some((keyword) => normalized.includes(normalizeText(keyword)))) return rule.forma_pagamento;
  }
  if (normalized.includes('PIX')) return 'PIX';
  if (normalized.includes('BOLETO')) return 'Boleto';
  if (normalized.includes('TRANSFERENCIA') || normalized.includes('TED') || normalized.includes('DOC BANCARIO')) return 'Transferência';
  return config.defaults.forma_pagamento || null;
}

function extractFromText(text, mimeOrExt) {
  const normalizedText = String(text || '').replace(/\r/g, '');
  const ownDocs = ownDocumentos();
  const documentos = [...allCnpjs(normalizedText), ...allCpfs(normalizedText)];
  const destinatarioDoc = documentos.find((doc) => ownDocs.has(doc)) || null;
  const supplierCnpj = documentos.find((doc) => doc !== destinatarioDoc) || documentos[0] || null;
  const numero = firstMatch(normalizedText, [
    /(?:NFS[-\s]?E|NF[-\s]?E|NOTA\s+FISCAL|N[ÚU]MERO\s+DA\s+NOTA|N[ÚU]MERO\s+NF)\s*(?:N[º°.]|NRO\.?|N[ÚU]MERO)?\s*[:#-]?\s*(\d{1,12})/i,
    /(?:N[º°.]|NRO\.?|N[ÚU]MERO)\s*[:#-]\s*(\d{3,12})/i,
  ]);
  const emissao = firstMatch(normalizedText, [
    /(?:DATA\s+(?:DE\s+)?EMISS[ÃA]O|EMITIDA?\s+EM|DATA\s+DA\s+NOTA)\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i,
    /(?:DATA\s+(?:DE\s+)?EMISS[ÃA]O|EMITIDA?\s+EM)\s*[:\-]?\s*(\d{2}-\d{2}-\d{4})/i,
  ]);
  const vencimento = firstMatch(normalizedText, [
    /(?:DATA\s+(?:DE\s+)?VENCIMENTO|VENCIMENTO|VENC\.)\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i,
    /(?:DATA\s+(?:DE\s+)?VENCIMENTO|VENCIMENTO|VENC\.)\s*[:\-]?\s*(\d{2}-\d{2}-\d{4})/i,
  ]);
  const valorRaw = firstMatch(normalizedText, [
    /(?:VALOR\s+TOTAL\s+DA\s+NOTA|VALOR\s+DA\s+NOTA|VALOR\s+TOTAL|TOTAL\s+A\s+PAGAR)\s*[:\-]?\s*R?\$?\s*([\d.]+,\d{2})/i,
    /(?:VALOR\s+L[IÍ]QUIDO)\s*[:\-]?\s*R?\$?\s*([\d.]+,\d{2})/i,
  ]);
  const fornecedor = firstMatch(normalizedText, [
    /(?:RAZ[ÃA]O\s+SOCIAL|PRESTADOR(?:A)?\s+DE\s+SERVI[ÇC]OS|EMITENTE|FORNECEDOR)\s*[:\-]?\s*([^\n]{3,100})/i,
  ]);
  const isNfse = /NFS[-\s]?E|NOTA\s+FISCAL\s+(?:ELETR[ÔO]NICA\s+)?DE\s+SERVI[ÇC]OS/i.test(normalizedText);
  const chave = firstMatch(normalizedText, [/(?:CHAVE\s+DE\s+ACESSO)?\s*([0-9][0-9.\s]{42,60}[0-9])/i]);
  return {
    origem_extracao: mimeOrExt === '.pdf' ? 'PDF_TEXTO_OU_OCR' : 'IMAGEM_OCR',
    texto_extraido: normalizedText.slice(0, 200000),
    chave_acesso: chave ? onlyDigits(chave).slice(0, 44) : null,
    numero_documento: numero,
    numero_nf: numero,
    data_emissao: toBrDate(emissao && emissao.replace(/-/g, '/')),
    data_conta: toBrDate(emissao && emissao.replace(/-/g, '/')),
    data_vencimento: toBrDate(vencimento && vencimento.replace(/-/g, '/')),
    valor_total: parseMoney(valorRaw),
    fornecedor: fornecedor ? fornecedor.replace(/\s{2,}.*/, '').trim() : null,
    fornecedor_cnpj: supplierCnpj,
    destinatario_cnpj: destinatarioDoc,
    forma_pagamento: inferPaymentMethod(normalizedText),
    tipo_documento: isNfse ? 'NFS-e' : 'DANFe',
    parcelas: [],
  };
}

async function extractFileData(filePath, file) {
  const ext = extensionOf(file.name);
  if (ext === '.xml') return extractNfeXml(fs.readFileSync(filePath, 'utf8'));
  if (ext === '.pdf') {
    let text = await extractPdfText(filePath);
    let source = 'PDF_TEXTO';
    if (normalizeText(text).length < 120) {
      text = await visionOcrPdf(filePath, path.dirname(filePath));
      source = 'PDF_OCR_VISION';
    }
    const data = extractFromText(text, '.pdf');
    data.origem_extracao = source;
    return data;
  }
  const text = await visionOcrImage(filePath);
  return extractFromText(text, ext);
}

function deepMerge(base, override) {
  const out = { ...(base || {}) };
  for (const [key, value] of Object.entries(override || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) out[key] = deepMerge(out[key], value);
    else if (value !== undefined && value !== null && value !== '') out[key] = value;
  }
  return out;
}

function applyRules(extracted, group, sidecar) {
  let data = deepMerge(config.defaults, extracted);
  const folderText = normalizeText(group.primary.folderPath || '');
  const sourceText = normalizeText([extracted.texto_extraido, extracted.natureza_operacao, group.primary.name].filter(Boolean).join(' '));
  for (const rule of config.folder_rules || []) {
    const contains = normalizeText(rule.folder_contains || rule.contains || '');
    if (contains && folderText.includes(contains)) data = deepMerge(data, rule.set || rule);
  }
  for (const rule of config.keyword_rules || []) {
    const keywords = rule.keywords || [];
    if (keywords.some((keyword) => sourceText.includes(normalizeText(keyword)))) data = deepMerge(data, rule.set || rule);
  }
  data = deepMerge(data, sidecar || {});
  if (!data.data_conta) data.data_conta = data.data_emissao;
  if (!data.data_vencimento && Array.isArray(data.parcelas) && data.parcelas.length === 1) data.data_vencimento = data.parcelas[0].vencimento;
  if (!data.forma_pagamento && extracted.forma_pagamento_codigo) {
    const codeMap = config.payment_code_map || {};
    data.forma_pagamento = codeMap[String(extracted.forma_pagamento_codigo)] || null;
  }
  // Empresa é decidida pelo CNPJ/CPF do destinatário lido do próprio documento
  // (nunca por um padrão fixo) — o GRM tem 6 empresas diferentes cadastradas.
  data.empresa = data.empresa || resolveEmpresa(data.destinatario_cnpj) || null;
  data.tipo_favorecido = data.tipo_favorecido || 'Fornecedor';
  data.intervalo_cobranca = data.intervalo_cobranca || 'Não Parcelar';
  data.tipo_documento = data.tipo_documento || 'DANFe';
  data.identificacao = data.identificacao || `NF ${data.numero_documento || data.numero_nf || stemOf(group.primary.name)} - ${data.fornecedor || 'FORNECEDOR'}`;
  data.descricao = data.descricao || data.natureza_operacao || `Lançamento automático a partir do Google Drive: ${group.primary.name}`;
  data.rateio = deepMerge({
    data_participacao: data.data_conta,
    tipo_participacao: 'Coordenação',
    identificacao: 'GERAL',
    valor: data.valor_total,
  }, data.rateio || {});
  data.rateio.data_participacao = data.rateio.data_participacao || data.data_conta;
  data.rateio.valor = parseMoney(data.rateio.valor == null ? data.valor_total : data.rateio.valor);
  data.valor_total = parseMoney(data.valor_total);
  data.fornecedor_cnpj = onlyDigits(data.fornecedor_cnpj) || null;
  data.numero_documento = String(data.numero_documento || data.numero_nf || '').trim() || null;
  data.data_conta = toBrDate(data.data_conta);
  data.data_vencimento = toBrDate(data.data_vencimento);
  data.data_emissao = toBrDate(data.data_emissao || data.data_conta);
  data.fingerprint = fingerprintOf(data);
  data.folder_path = group.primary.folderPath;
  return data;
}

function validateData(data) {
  const missing = [];
  const classificationMissing = [];
  if (!data.empresa) missing.push('empresa');
  if (!data.identificacao) missing.push('identificacao');
  if (!data.data_conta) missing.push('data_conta');
  if (!data.fornecedor && !data.fornecedor_cnpj) missing.push('fornecedor/fornecedor_cnpj');
  if (!data.data_vencimento) missing.push('data_vencimento');
  if (data.valor_total == null || data.valor_total <= 0) missing.push('valor_total');
  if (!data.numero_documento) missing.push('numero_documento');
  if (!data.tipo_documento) missing.push('tipo_documento');
  if (!data.forma_pagamento) missing.push('forma_pagamento');
  if (!data.rateio?.data_participacao) missing.push('rateio.data_participacao');
  if (!data.rateio?.tipo_participacao) missing.push('rateio.tipo_participacao');
  if (!data.rateio?.identificacao) missing.push('rateio.identificacao');
  if (data.rateio?.valor == null || Math.abs(data.rateio.valor - data.valor_total) > 0.01) missing.push('rateio.valor deve ser igual ao valor_total');
  if (!data.grupo_categoria || /^PREENCHER/i.test(String(data.grupo_categoria))) classificationMissing.push('grupo_categoria');
  if (!data.categoria || /^PREENCHER/i.test(String(data.categoria))) classificationMissing.push('categoria');
  if (Array.isArray(data.parcelas) && data.parcelas.length > 1 && normalizeText(data.intervalo_cobranca) === 'NAO PARCELAR') {
    missing.push('parcelas múltiplas exigem configuração de intervalo/qtd ou sidecar revisado');
  }
  return { missing, classificationMissing, ok: !missing.length && !classificationMissing.length };
}

async function createRun() {
  const payload = {
    status: 'INICIADO',
    dry_run: DRY_RUN,
    folder_id: FOLDER_ID,
    iniciado_em: isoNow(),
    resumo: { limit: LIMIT, recursive: RECURSIVE, file_id: args.fileId || null },
  };
  const { data, error } = await supabase.from(TABLE_RUNS).insert(payload).select('id').single();
  if (error) {
    log('WARN', `Não consegui criar execução em ${TABLE_RUNS}: ${error.message}`);
    return null;
  }
  return data?.id || null;
}

async function finishRun(runId, status, stats, errorMessage) {
  if (!runId) return;
  const { error } = await supabase.from(TABLE_RUNS).update({
    status,
    finalizado_em: isoNow(),
    resumo: stats,
    erro: errorMessage || null,
  }).eq('id', runId);
  if (error) log('WARN', `Não consegui finalizar execução: ${error.message}`);
}

async function getItemByDriveId(driveFileId) {
  const { data, error } = await supabase.from(TABLE_ITEMS).select('*').eq('drive_file_id', driveFileId).maybeSingle();
  if (error) throw error;
  return data;
}

async function findLaunchedFingerprint(fingerprint) {
  if (!fingerprint) return null;
  const { data, error } = await supabase.from(TABLE_ITEMS)
    .select('id,drive_file_id,arquivo_nome,status,grm_codigo,grm_grupo,lancado_em')
    .eq('fingerprint', fingerprint)
    .in('status', ['LANCADO', 'DRY_RUN_OK'])
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

async function upsertItem(group, patch) {
  const primary = group.primary;
  const existing = await getItemByDriveId(primary.id);
  const payload = {
    drive_file_id: primary.id,
    drive_folder_id: primary.folderId,
    drive_web_view_link: primary.webViewLink || null,
    arquivo_nome: primary.name,
    arquivo_mime_type: primary.mimeType || null,
    arquivo_md5: primary.md5Checksum || null,
    arquivo_modificado_em: primary.modifiedTime || null,
    pasta_caminho: primary.folderPath || null,
    tentativas: Number(existing?.tentativas || 0),
    updated_at: isoNow(),
    ...patch,
  };
  const { data, error } = await supabase.from(TABLE_ITEMS).upsert(payload, { onConflict: 'drive_file_id' }).select('*').single();
  if (error) throw error;
  return data;
}

async function incrementAttempt(group, patch) {
  const existing = await getItemByDriveId(group.primary.id);
  return upsertItem(group, { tentativas: Number(existing?.tentativas || 0) + 1, ...patch });
}

async function loginGrm(page) {
  log('INFO', 'Iniciando login no GRM...');
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('input#input-v-2', { timeout: 30000 });
  await clearAndTypeSelector(page, 'input#input-v-2', GRM_USER);
  await clearAndTypeSelector(page, 'input#input-v-5', GRM_PASSWORD);
  await page.click('button.submit-btn');
  for (let i = 0; i < 45; i += 1) {
    await wait(1000);
    if (!page.url().includes('/login')) {
      log('SUCCESS', 'Login realizado.');
      return;
    }
  }
  throw new Error('Login falhou: a página permaneceu em /login após 45 segundos.');
}

async function clearAndTypeSelector(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 30000 });
  await page.focus(selector);
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await page.type(selector, String(value), { delay: 15 });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pageHasDialog(page, title) {
  return page.evaluate((wanted) => {
    const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
    return Array.from(document.querySelectorAll('.v-overlay--active, [role="dialog"], .modal.show'))
      .some((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && norm(el.innerText).includes(norm(wanted));
      });
  }, title);
}

async function waitDialog(page, title, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await pageHasDialog(page, title)) return;
    await wait(250);
  }
  throw new Error(`Modal "${title}" não abriu em ${timeoutMs / 1000}s.`);
}

async function clickAddAccount(page) {
  await page.goto(GRM_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await wait(1800);
  const point = await page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const candidates = Array.from(document.querySelectorAll('button, [role="button"]')).filter(visible);
    const direct = candidates.find((el) => {
      const text = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''} ${el.innerText || ''}`.toUpperCase();
      return text.includes('ADICIONAR') || el.querySelector('.mdi-plus, [class*="plus"]');
    });
    const button = direct || candidates.slice().sort((a, b) => b.getBoundingClientRect().x - a.getBoundingClientRect().x)[0];
    if (!button) return null;
    const r = button.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!point) throw new Error('Botão Adicionar (+) não encontrado em Contas a Pagar.');
  await page.mouse.click(point.x, point.y);
  await waitDialog(page, 'NOVA CONTA', 15000);
}

async function locateField(page, label, dialogTitle) {
  return page.evaluate((payload) => {
    const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && st.display !== 'none' && st.visibility !== 'hidden';
    };
    const overlays = Array.from(document.querySelectorAll('.v-overlay--active, [role="dialog"], .modal.show')).filter(visible);
    const scope = overlays.reverse().find((el) => norm(el.innerText).includes(norm(payload.dialogTitle))) || document;
    const wanted = norm(payload.label);
    const textNodes = Array.from(scope.querySelectorAll('label, .v-label, [class*="label"], span, div')).filter(visible);
    let labelEl = textNodes.find((el) => norm(el.textContent) === wanted);
    if (!labelEl) labelEl = textNodes.find((el) => norm(el.textContent).startsWith(wanted));
    if (!labelEl) return null;
    let field = labelEl;
    for (let i = 0; i < 7 && field; i += 1, field = field.parentElement) {
      const input = field.querySelector && field.querySelector('input, textarea, [contenteditable="true"]');
      const combobox = field.matches?.('[role="combobox"]') ? field : field.querySelector?.('[role="combobox"]');
      if (input || combobox) {
        const target = input || combobox;
        const r = target.getBoundingClientRect();
        return { x: r.x + Math.max(10, r.width / 2), y: r.y + r.height / 2, tag: target.tagName, type: target.getAttribute('type') || '', readonly: !!target.readOnly };
      }
    }
    const r = labelEl.getBoundingClientRect();
    return { x: r.x + Math.max(10, r.width / 2), y: r.y + Math.max(10, r.height + 15), tag: labelEl.tagName, type: '', readonly: false };
  }, { label, dialogTitle });
}

async function typeField(page, label, value, dialogTitle) {
  const field = await locateField(page, label, dialogTitle || 'NOVA CONTA');
  if (!field) throw new Error(`Campo "${label}" não encontrado.`);
  await page.mouse.click(field.x, field.y);
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await page.type(String(value), { delay: 20 });
  await page.keyboard.press('Tab');
  await wait(180);
}

async function selectOptionOpen(page, target, mode) {
  const clicked = await page.evaluate((payload) => {
    const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && st.display !== 'none' && st.visibility !== 'hidden';
    };
    const wanted = norm(payload.target);
    const overlays = Array.from(document.querySelectorAll('.v-overlay--active, [role="listbox"], .menuable__content__active')).filter(visible).reverse();
    for (const overlay of overlays) {
      const options = Array.from(overlay.querySelectorAll('[role="option"], .v-list-item, li, [class*="option"]')).filter(visible);
      for (const option of options) {
        const text = norm(option.innerText || option.textContent);
        if (!text) continue;
        const wantedDigits = String(payload.target || '').replace(/\D/g, '');
        const textDigits = String(option.innerText || option.textContent || '').replace(/\D/g, '');
        let match = false;
        if (payload.mode === 'exact') match = text === wanted || (wantedDigits.length >= 8 && textDigits === wantedDigits);
        else if (payload.mode === 'first') match = true;
        else match = text.includes(wanted) || wanted.includes(text) || (wantedDigits.length >= 8 && textDigits.includes(wantedDigits));
        if (match) {
          const r = option.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: (option.innerText || option.textContent || '').trim() };
        }
      }
    }
    return null;
  }, { target, mode: mode || 'contains' });
  if (!clicked) return null;
  await page.mouse.click(clicked.x, clicked.y);
  await wait(350);
  return clicked.text;
}

async function selectField(page, label, target, options) {
  const opts = options || {};
  const field = await locateField(page, label, opts.dialogTitle || 'NOVA CONTA');
  if (!field) throw new Error(`Campo de seleção "${label}" não encontrado.`);
  await page.mouse.click(field.x, field.y);
  await wait(450);
  if (opts.search) {
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.type(String(opts.search), { delay: 25 });
    await wait(900);
  }
  const selected = await selectOptionOpen(page, target, opts.mode || 'contains');
  if (!selected) {
    await page.keyboard.press('Escape');
    throw new Error(`Opção "${target}" não encontrada no campo "${label}".`);
  }
  return selected;
}

async function clickTextButton(page, text, dialogTitle) {
  const point = await page.evaluate((payload) => {
    const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && st.display !== 'none' && st.visibility !== 'hidden';
    };
    const overlays = Array.from(document.querySelectorAll('.v-overlay--active, [role="dialog"], .modal.show')).filter(visible);
    const scope = overlays.reverse().find((el) => norm(el.innerText).includes(norm(payload.dialogTitle))) || document;
    const wanted = norm(payload.text);
    const button = Array.from(scope.querySelectorAll('button, [role="button"]')).filter(visible)
      .find((el) => norm(el.innerText || el.textContent) === wanted || norm(el.getAttribute('aria-label')).includes(wanted));
    if (!button) return null;
    const r = button.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, { text, dialogTitle: dialogTitle || 'NOVA CONTA' });
  if (!point) throw new Error(`Botão "${text}" não encontrado.`);
  await page.mouse.click(point.x, point.y);
}

async function attachFiles(page, filePaths) {
  if (!filePaths.length) {
    if (REQUIRE_ATTACHMENT) throw new Error('Nenhum arquivo local disponível para anexar.');
    return;
  }
  try {
    const chooserPromise = page.waitForFileChooser({ timeout: 6000 });
    await clickTextButton(page, 'ANEXAR ARQUIVOS', 'NOVA CONTA');
    const chooser = await chooserPromise;
    await chooser.accept(filePaths);
    await wait(1000);
  } catch (error) {
    const input = await page.$('input[type="file"]');
    if (!input) {
      if (REQUIRE_ATTACHMENT) throw new Error(`Falha ao anexar arquivo: ${error.message}`);
      log('WARN', `Anexo ignorado: ${error.message}`);
      return;
    }
    await input.uploadFile(...filePaths);
    await wait(1000);
  }
}

async function expandRateio(page) {
  const field = await page.evaluate(() => {
    const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && st.display !== 'none' && st.visibility !== 'hidden';
    };
    const dialogs = Array.from(document.querySelectorAll('.v-overlay--active, [role="dialog"], .modal.show')).filter(visible);
    const dialog = dialogs.reverse().find((el) => norm(el.innerText).includes('NOVA CONTA'));
    if (!dialog) return null;
    if (norm(dialog.innerText).includes('DATA PARTICIPACAO') && norm(dialog.innerText).includes('TIPO PARTICIPACAO')) return { already: true };
    const label = Array.from(dialog.querySelectorAll('div, span, button')).filter(visible).find((el) => norm(el.textContent) === 'RATEIO');
    if (!label) return null;
    let target = label;
    for (let i = 0; i < 4 && target.parentElement; i += 1) {
      if (target.parentElement.getBoundingClientRect().width > 300) { target = target.parentElement; break; }
      target = target.parentElement;
    }
    const r = target.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + Math.min(r.height / 2, 30), already: false };
  });
  if (!field) throw new Error('Seção Rateio não encontrada.');
  if (!field.already) {
    await page.mouse.click(field.x, field.y);
    await wait(500);
  }
}

async function clickRateioPlus(page) {
  const point = await page.evaluate(() => {
    const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && st.display !== 'none' && st.visibility !== 'hidden';
    };
    const dialogs = Array.from(document.querySelectorAll('.v-overlay--active, [role="dialog"], .modal.show')).filter(visible);
    const dialog = dialogs.reverse().find((el) => norm(el.innerText).includes('NOVA CONTA'));
    if (!dialog) return null;
    const labels = Array.from(dialog.querySelectorAll('div, section')).filter(visible);
    const section = labels.find((el) => norm(el.innerText).includes('DATA PARTICIPACAO') && norm(el.innerText).includes('TIPO PARTICIPACAO') && el.getBoundingClientRect().height < 500);
    const scope = section || dialog;
    const buttons = Array.from(scope.querySelectorAll('button, [role="button"]')).filter(visible);
    let button = buttons.find((el) => {
      const text = norm(`${el.innerText || ''} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''}`);
      return text === '+' || text.includes('ADICIONAR') || !!el.querySelector('.mdi-plus, [class*="plus"]');
    });
    if (!button && buttons.length) button = buttons.slice().sort((a, b) => b.getBoundingClientRect().x - a.getBoundingClientRect().x)[0];
    if (!button) return null;
    const r = button.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!point) throw new Error('Botão + do Rateio não encontrado.');
  await page.mouse.click(point.x, point.y);
  await wait(700);
}

async function readGrmAlert(page) {
  return page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('[role="alert"], .v-snackbar, .toast, .swal2-container'));
    return els.map((el) => (el.innerText || '').trim()).filter(Boolean).join(' | ').slice(0, 2000);
  });
}

async function saveDebug(page, name) {
  try {
    ensureDir(DEBUG_DIR);
    const base = `${new Date().toISOString().replace(/[:.]/g, '-')}-${sanitizeFileName(name)}`;
    await page.screenshot({ path: path.join(DEBUG_DIR, `${base}.png`), fullPage: false });
    fs.writeFileSync(path.join(DEBUG_DIR, `${base}.html`), await page.content(), 'utf8');
    log('DEBUG', `Diagnóstico salvo em ${DEBUG_DIR}/${base}.[png|html]`);
  } catch (error) {
    log('WARN', `Falha ao salvar diagnóstico: ${error.message}`);
  }
}

async function closeDialogBestEffort(page) {
  try {
    await page.keyboard.press('Escape');
    await wait(300);
    if (await pageHasDialog(page, 'NOVA CONTA')) await clickTextButton(page, 'CANCELAR', 'NOVA CONTA');
    await wait(400);
  } catch (_) { /* best effort */ }
}

async function fillAndSaveAccount(page, data, attachmentPaths) {
  await clickAddAccount(page);
  await attachFiles(page, attachmentPaths);

  await selectField(page, 'Empresa', data.empresa, { mode: 'contains' });
  await typeField(page, 'Identificação', data.identificacao);
  await typeField(page, 'Data da Conta', data.data_conta);
  await selectField(page, 'Tipo Favorecido', data.tipo_favorecido || 'Fornecedor', { mode: 'contains' });

  const supplierSearch = data.fornecedor_cnpj || data.fornecedor;
  const supplierTarget = data.fornecedor_cnpj || data.fornecedor;
  await selectField(page, 'Fornecedor', supplierTarget, { search: supplierSearch, mode: 'contains' });
  await selectField(page, 'Grupo de Categoria', data.grupo_categoria, { mode: 'contains' });
  await selectField(page, 'Categoria', data.categoria, { mode: 'contains' });

  await typeField(page, 'Data de Vencimento', data.data_vencimento);
  await typeField(page, 'Valor Total', formatMoneyInput(data.valor_total));
  await selectField(page, 'Intervalo de Cobrança', data.intervalo_cobranca || 'Não Parcelar', { mode: 'contains' });
  if (normalizeText(data.intervalo_cobranca) !== 'NAO PARCELAR' && data.qtd_parcelas) await typeField(page, 'Qtd. Parcelas', String(data.qtd_parcelas));
  await selectField(page, 'Tipo de Documento', data.tipo_documento, { mode: 'contains' });
  await typeField(page, 'N. do Documento', data.numero_documento);
  await selectField(page, 'Forma de Pagamento', data.forma_pagamento, { mode: 'contains' });
  if (data.descricao) await typeField(page, 'Descrição', data.descricao);

  await expandRateio(page);
  await typeField(page, 'Data Participação', data.rateio.data_participacao);
  await selectField(page, 'Tipo Participação', data.rateio.tipo_participacao, { mode: 'contains' });
  await selectField(page, data.rateio.tipo_participacao, data.rateio.identificacao, { search: data.rateio.identificacao, mode: 'contains' });
  await typeField(page, 'Valor', formatMoneyInput(data.rateio.valor));
  await clickRateioPlus(page);

  if (DRY_RUN) {
    if (DEBUG || args.debug) await saveDebug(page, `dry-run-${data.numero_documento}`);
    await clickTextButton(page, 'CANCELAR', 'NOVA CONTA');
    await wait(500);
    return { dryRun: true, alert: null };
  }

  await clickTextButton(page, 'SALVAR', 'NOVA CONTA');
  const started = Date.now();
  while (Date.now() - started < 45000) {
    const alert = await readGrmAlert(page);
    if (alert && /ERRO|OBRIGAT|INVALID|N[ÃA]O FOI POSS[IÍ]VEL/i.test(normalizeText(alert))) throw new Error(`GRM recusou o lançamento: ${alert}`);
    if (!await pageHasDialog(page, 'NOVA CONTA')) {
      await wait(1200);
      return { dryRun: false, alert: alert || null };
    }
    await wait(500);
  }
  const alert = await readGrmAlert(page);
  throw new Error(`O modal Nova Conta não fechou após salvar.${alert ? ` Mensagem: ${alert}` : ''}`);
}

async function launchBrowserIfNeeded() {
  if (browserAtual) return browserAtual;
  browserAtual = await puppeteer.launch({
    headless: process.env.GRM_HEADLESS === 'false' ? false : true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    dumpio: envBool('GRM_PUPPETEER_DUMPIO', false),
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
      '--disable-software-rasterizer', '--disable-extensions', '--disable-background-networking',
      '--disable-default-apps', '--disable-sync', '--metrics-recording-only', '--mute-audio',
      '--no-first-run', '--no-default-browser-check', '--disable-site-isolation-trials',
      '--disable-features=VizDisplayCompositor,AudioServiceOutOfProcess,IsolateOrigins,site-per-process',
    ],
    defaultViewport: { width: 1600, height: 950 },
  });
  return browserAtual;
}

async function processGroup(page, group, runId) {
  const primary = group.primary;
  const existing = await getItemByDriveId(primary.id);
  if (existing?.status === 'LANCADO' && !args.force) {
    log('INFO', `${primary.name}: já lançado, ignorando.`);
    return 'ignorado';
  }

  const workDir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'grm-nf-'));
  const localPaths = [];
  try {
    await incrementAttempt(group, { status: 'PROCESSANDO', execucao_id: runId, erro: null, processado_em: isoNow() });
    let extracted = null;
    for (const file of group.files) {
      const localPath = path.join(workDir, sanitizeFileName(file.name));
      await downloadDriveFile(file, localPath);
      localPaths.push(localPath);
      if (!extracted) {
        try { extracted = await extractFileData(localPath, file); }
        catch (error) { log('WARN', `${file.name}: extração falhou (${error.message}); tentando o próximo arquivo do grupo.`); }
      }
    }
    if (!extracted) throw new Error('Nenhum arquivo do grupo pôde ser interpretado.');

    let sidecar = null;
    if (group.sidecar) {
      const sidecarPath = path.join(workDir, sanitizeFileName(group.sidecar.name));
      await downloadDriveFile(group.sidecar, sidecarPath);
      sidecar = loadJson(sidecarPath, true);
    }

    const data = applyRules(extracted, group, sidecar);
    const validation = validateData(data);
    await upsertItem(group, {
      status: validation.ok ? 'VALIDADO' : (validation.classificationMissing.length ? 'AGUARDANDO_CLASSIFICACAO' : 'AGUARDANDO_DADOS'),
      execucao_id: runId,
      fingerprint: data.fingerprint,
      fornecedor_cnpj: data.fornecedor_cnpj,
      fornecedor_nome: data.fornecedor || null,
      numero_documento: data.numero_documento,
      data_emissao: toIsoDate(data.data_emissao),
      data_vencimento: toIsoDate(data.data_vencimento),
      valor_total: data.valor_total,
      grupo_categoria: data.grupo_categoria || null,
      categoria: data.categoria || null,
      forma_pagamento: data.forma_pagamento || null,
      origem_extracao: data.origem_extracao || null,
      extraido_json: data,
      validacao_erros: [...validation.missing, ...validation.classificationMissing],
      erro: validation.ok ? null : `Campos pendentes: ${[...validation.missing, ...validation.classificationMissing].join(', ')}`,
    });

    if (!validation.ok) {
      log('WARN', `${primary.name}: não será lançado. Pendências: ${[...validation.missing, ...validation.classificationMissing].join(', ')}`);
      return validation.classificationMissing.length ? 'aguardando_classificacao' : 'aguardando_dados';
    }

    const duplicate = await findLaunchedFingerprint(data.fingerprint);
    if (duplicate && duplicate.drive_file_id !== primary.id && !args.force) {
      await upsertItem(group, {
        status: 'DUPLICADO',
        execucao_id: runId,
        erro: `Fingerprint já processado no arquivo ${duplicate.arquivo_nome || duplicate.drive_file_id}.`,
      });
      log('WARN', `${primary.name}: duplicado de ${duplicate.arquivo_nome || duplicate.drive_file_id}.`);
      return 'duplicado';
    }

    log('INFO', `${primary.name}: ${DRY_RUN ? 'validando no GRM (dry-run)' : 'lançando no GRM'} - NF ${data.numero_documento}, ${data.fornecedor || data.fornecedor_cnpj}, R$ ${formatMoneyInput(data.valor_total)}.`);
    const result = await fillAndSaveAccount(page, data, localPaths);
    const finalStatus = DRY_RUN ? 'DRY_RUN_OK' : 'LANCADO';
    await upsertItem(group, {
      status: finalStatus,
      execucao_id: runId,
      lancado_em: DRY_RUN ? null : isoNow(),
      grm_resposta: result,
      erro: null,
    });

    if (!DRY_RUN && MOVE_AFTER_SUCCESS && SUCCESS_FOLDER_ID) {
      for (const file of group.files) await moveDriveFile(file.id, file.folderId, SUCCESS_FOLDER_ID);
      if (group.sidecar) await moveDriveFile(group.sidecar.id, group.sidecar.folderId, SUCCESS_FOLDER_ID);
    }

    log('SUCCESS', `${primary.name}: ${DRY_RUN ? 'formulário validado sem salvar' : 'lançamento salvo'}.`);
    return DRY_RUN ? 'dry_run' : 'lancado';
  } catch (error) {
    if (page) {
      await saveDebug(page, `erro-${primary.id}-${primary.name}`);
      await closeDialogBestEffort(page);
    }
    await upsertItem(group, { status: 'ERRO', execucao_id: runId, erro: String(error.message || error).slice(0, 4000) });
    log('ERROR', `${primary.name}: ${error.message}`);
    return 'erro';
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (_) { /* noop */ }
  }
}

async function main() {
  let runId = null;
  const stats = { encontrados: 0, selecionados: 0, lancados: 0, dry_run: 0, aguardando_dados: 0, aguardando_classificacao: 0, duplicados: 0, ignorados: 0, erros: 0 };
  try {
    assertConfig();
    if (!scheduledEnabled && !args.force && !args.fileId && !args.real && !args.dryRun) {
      log('INFO', 'GRM_LANCAR_NF_AGENDAR=false: execução automática desativada. Use --force/--dry-run/--real para teste manual.');
      return;
    }
    runId = await createRun();
    log('INFO', `=== Agente de lançamento de NF iniciado (${DRY_RUN ? 'DRY-RUN' : 'REAL'}, limite=${LIMIT}) ===`);
    log('INFO', `Pasta Drive: ${FOLDER_ID}`);

    let files = await listDriveFilesRecursive(FOLDER_ID, 'ORIGEM');
    if (args.fileId) files = files.filter((file) => file.id === args.fileId);
    const groups = groupDriveFiles(files);
    stats.encontrados = groups.length;

    const selected = [];
    for (const group of groups) {
      const existing = await getItemByDriveId(group.primary.id);
      if (existing?.status === 'LANCADO' && !args.force) {
        stats.ignorados += 1;
        continue;
      }
      selected.push(group);
      if (selected.length >= LIMIT) break;
    }
    stats.selecionados = selected.length;

    if (!selected.length) {
      log('INFO', 'Nenhum arquivo novo elegível na pasta.');
      await finishRun(runId, 'SUCESSO', stats, null);
      return;
    }

    const browser = await launchBrowserIfNeeded();
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(60000);
    page.on('console', (msg) => {
      if (DEBUG || args.debug) log('BROWSER', `${msg.type()}: ${msg.text()}`);
    });
    await loginGrm(page);

    for (const group of selected) {
      const result = await processGroup(page, group, runId);
      if (result === 'lancado') stats.lancados += 1;
      else if (result === 'dry_run') stats.dry_run += 1;
      else if (result === 'aguardando_dados') stats.aguardando_dados += 1;
      else if (result === 'aguardando_classificacao') stats.aguardando_classificacao += 1;
      else if (result === 'duplicado') stats.duplicados += 1;
      else if (result === 'ignorado') stats.ignorados += 1;
      else if (result === 'erro') stats.erros += 1;
    }

    const status = stats.erros ? 'ERRO_PARCIAL' : 'SUCESSO';
    await finishRun(runId, status, stats, stats.erros ? `${stats.erros} arquivo(s) com erro.` : null);
    log(stats.erros ? 'WARN' : 'SUCCESS', `Concluído: ${safeJson(stats)}`);
    if (stats.erros) process.exitCode = 2;
  } catch (error) {
    log('ERROR', `Erro fatal: ${error.stack || error.message}`);
    await finishRun(runId, 'ERRO', stats, String(error.message || error).slice(0, 4000));
    process.exitCode = 1;
  } finally {
    if (browserAtual) {
      try { await browserAtual.close(); } catch (_) { /* noop */ }
      browserAtual = null;
    }
  }
}

process.on('SIGINT', async () => {
  if (browserAtual) try { await browserAtual.close(); } catch (_) { /* noop */ }
  process.exit(130);
});
process.on('SIGTERM', async () => {
  if (browserAtual) try { await browserAtual.close(); } catch (_) { /* noop */ }
  process.exit(143);
});

main();
