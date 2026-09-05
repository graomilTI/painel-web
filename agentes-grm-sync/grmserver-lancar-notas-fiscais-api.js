#!/usr/bin/env node
'use strict';

/**
 * GRM Server - Agente unificado de documentos financeiros (NF + Holerite)
 * migrado de Puppeteer pra API direta do Graint — mesmo tipo de migração já
 * feita em Colaboradores, Patrimônios, Distribuição de O.S. e Liberação de
 * Despesas (ver grmserver-liberacao-despesas-api.js).
 *
 * Origem:
 *   https://grao1000.com.br/painel/upload-notas-fiscais
 *   Supabase Storage: bucket notas-fiscais
 *   Fila: public.grm_nf_lancamentos (status NOVO)
 *
 * Destino: https://www.grmserver.com.br/finance/payInvoice (POST /api/payInvoice/setRecord)
 *
 * A extração de dados (XML/PDF/OCR via Groq), a classificação NF x HOLERITE,
 * as regras de categorização por setor/keyword e o split de holerite em lote
 * são PORTADOS SEM MUDANÇA de grm-sync-lancar-notas-fiscais.js (Puppeteer) —
 * só a parte que fala com o GRM foi trocada (DOM/Puppeteer -> https.request).
 *
 * Contrato da API descoberto e validado ao vivo em 04/09 (ver memória
 * painel-web-lancar-notas-fiscais-api-migracao):
 *   1. user/login -> token JWT (mesmo contrato de grmserver-liberacao-despesas-api.js).
 *   2. sysCompany/getRecords -> scpCode (Empresa) por nome.
 *   3. payInvoiceCategory/getRecords -> picCode (Categoria, nó folha) +
 *      payInvoiceMainCategory (picParent do nó folha = Grupo de Categoria).
 *   4. payInvoiceDocType/getRecords -> pdtCode (Tipo de Documento) por nome.
 *   5. paymentType/getRecords -> patCode (Forma de Pagamento) por nome.
 *   6. coordination/getRecords -> olcCode (Coordenação, rateio "GERAL").
 *   7. staff/getRecords {groupSearch} -> staCode (Funcionário), cascata
 *      matrícula -> nome completo -> nome reduzido (mesma cascata do
 *      selectEmployeeById() do Puppeteer, porque busca por matrícula
 *      isolada já falhava lá também).
 *   8. suppliers/getRecords {groupSearch} -> supCode (Fornecedor), cascata
 *      CNPJ -> nome.
 *   9. payInvoice/setRecord com o payload montado -> {result, recordCode,
 *      isInsert}. NO-OP de update confirmado ao vivo (registro 291,
 *      isInsert:false, zero mudança) — a construção do payload de INSERÇÃO
 *      (isEditRecord "N", sem pinCode) segue o mesmo formato, mas AINDA NÃO
 *      foi confirmada com um lançamento real de teste.
 *
 * ATENÇÃO — anexo do arquivo (payInvoice/uploadFiles) é o único trecho desta
 * migração que NÃO foi capturado ao vivo (o widget de anexo do GRM só
 * associa arquivo a um registro que já tem pinCode, então só dá pra testar
 * depois de criar um lançamento de verdade). uploadAttachment() abaixo é uma
 * implementação best-effort baseada na inspeção estática do bundle do GRM —
 * revisar/validar com o primeiro --real de teste antes de confiar cegamente.
 * Se o anexo falhar, o item fica em ERRO (não LANCADO) com o código do GRM
 * já criado registrado em grm_codigo, pra um humano anexar manualmente sem
 * duplicar o lançamento.
 *
 * Segurança (herdada do agente Puppeteer):
 *   - dry-run por padrão;
 *   - bloqueio por campos obrigatórios (validateData, inalterado);
 *   - deduplicação por fingerprint (inalterado);
 *   - processamento serial;
 *   - código de saída diferente de zero em erro técnico.
 */

require('dotenv').config();

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const childProcess = require('child_process');
const util = require('util');
const { createClient } = require('@supabase/supabase-js');

const execFile = util.promisify(childProcess.execFile);

const GRM_BASE_URL = String(process.env.GRMSERVER_API_URL || 'https://www.grmserver.com.br/api/').replace(/\/?$/, '/');
const TABLE_ITEMS = process.env.GRM_LANCAR_NF_TABLE || 'grm_nf_lancamentos';
const TABLE_RUNS = process.env.GRM_LANCAR_NF_RUNS_TABLE || 'grm_nf_lancamento_execucoes';
const CONFIG_PATH = process.env.GRM_LANCAR_NF_CONFIG || path.join(__dirname, 'config', 'grm-lancar-notas-fiscais.json');
const MAX_PER_RUN = positiveInt(process.env.GRM_LANCAR_NF_MAX_POR_EXECUCAO, 5);
const DEBUG = envBool('GRM_LANCAR_NF_DEBUG', false);
const OCR_PDF_MAX_PAGES = positiveInt(process.env.GRM_LANCAR_NF_OCR_PDF_MAX_PAGINAS, 6);
const GRM_USER = process.env.GRMSERVER_USER || '';
const GRM_PASSWORD = process.env.GRMSERVER_PASSWORD || '';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SB_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SB_SERVICE_KEY || process.env.SUPABASE_KEY || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_OCR_MODEL = process.env.GRM_LANCAR_NF_GROQ_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';

const GRM_WEB_HEADERS = {
  origin: 'https://www.grmserver.com.br',
  referer: 'https://www.grmserver.com.br/login',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

const args = parseArgs(process.argv.slice(2));
const scheduledEnabled = envBool('GRM_LANCAR_NF_AGENDAR', false);
// Fail-safe: se a variável sumir do .env por qualquer motivo, cai em dry-run
// (mesmo comportamento do agente Puppeteer que substitui).
const dryRunEnv = envBool('GRM_LANCAR_NF_DRY_RUN', true);
const DRY_RUN = args.dryRun ? true : (args.real ? false : dryRunEnv);
const LIMIT = args.limit || MAX_PER_RUN;

const PAYROLL_MONTHS = [
  'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO',
];
const PAYROLL_MONTH_NUMBER = {
  JANEIRO: 1, FEVEREIRO: 2, MARCO: 3, ABRIL: 4, MAIO: 5, JUNHO: 6,
  JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12,
};

let config = null;
let supabase = null;
let grmToken = null;
const catalogCache = {};

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
  const out = {
    dryRun: false, real: false, force: false, debug: false, limit: null, uploadId: null, file: null, extractOnly: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--real') out.real = true;
    else if (a === '--force') out.force = true;
    else if (a === '--debug') out.debug = true;
    else if (a === '--extract-only') out.extractOnly = true;
    else if (a === '--limit') out.limit = positiveInt(argv[++i], null);
    else if (a === '--upload-id') out.uploadId = argv[++i] || null;
    else if (a === '--file' || a === '--pdf') out.file = argv[++i] || null;
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

function safe(data) { return Array.isArray(data) ? data : []; }

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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

function sanitizeStorageKey(name) {
  return String(name || 'arquivo')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'arquivo';
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
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function fingerprintOf(data) {
  const value = parseMoney(data.valor_total);
  if (value == null) return null;
  if (data.tipo_documento_fluxo === 'HOLERITE') {
    if (!data.funcionario_registro || !data.competencia_iso) return null;
    return sha256([
      'HOLERITE',
      onlyDigits(data.destinatario_cnpj) || normalizeText(data.empresa),
      String(data.funcionario_registro),
      String(data.competencia_iso),
      value.toFixed(2),
    ].join('|'));
  }
  const cnpj = onlyDigits(data.fornecedor_cnpj);
  const numero = onlyDigits(data.numero_documento || data.numero_nf);
  const emissao = toIsoDate(data.data_conta || data.data_emissao) || '';
  if ((!cnpj && !data.fornecedor) || !numero || !emissao) return null;
  return sha256([cnpj || normalizeText(data.fornecedor), numero, emissao, value.toFixed(2)].join('|'));
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

function loadConfig() {
  config = loadJson(CONFIG_PATH, true);
  if (!config.defaults) config.defaults = {};
  if (!Array.isArray(config.setor_rules)) config.setor_rules = [];
  if (!Array.isArray(config.keyword_rules)) config.keyword_rules = [];
  if (!Array.isArray(config.payment_rules)) config.payment_rules = [];
  if (!Array.isArray(config.empresas)) config.empresas = [];
  if (!config.holerite || typeof config.holerite !== 'object') config.holerite = {};
}

function assertConfig(options = {}) {
  loadConfig();
  if (options.extractOnly) return;
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  if (!GRM_USER || !GRM_PASSWORD) throw new Error('Configure GRMSERVER_USER e GRMSERVER_PASSWORD.');
  if (!GROQ_API_KEY) log('WARN', 'GROQ_API_KEY não configurada: imagens e PDFs escaneados sem texto não poderão ser reconhecidos.');
  if (!config.empresas.length) log('WARN', 'config.empresas está vazio. Documentos sem empresa reconhecida ficarão pendentes.');
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------------------------------------------------------------------------
// HTTP genérico (download/OCR via Groq) — igual ao agente Puppeteer.
function httpRequest(options, body, responseType) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}: ${buffer.toString('utf8').slice(0, 2000)}`));
          return;
        }
        if (responseType === 'buffer') { resolve(buffer); return; }
        const text = buffer.toString('utf8');
        try { resolve(text ? JSON.parse(text) : {}); } catch (_) { resolve(text); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function downloadFromStorage(row, targetPath) {
  const { data, error } = await supabase.storage
    .from(row.storage_bucket || 'notas-fiscais')
    .download(row.storage_path);
  if (error) throw new Error(`Falha ao baixar "${row.storage_path}" do Storage: ${error.message}`);
  const buffer = Buffer.from(await data.arrayBuffer());
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, buffer);
  return targetPath;
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
  return {
    origem_extracao: 'XML_NFE',
    chave_acesso: infNFeMatch ? infNFeMatch[1] : null,
    numero_documento: numero,
    numero_nf: numero,
    data_emissao: toBrDate(dataEmissaoRaw),
    data_conta: toBrDate(dataEmissaoRaw),
    fornecedor: xmlTag(emit, 'xNome') || xmlTag(emit, 'xFant'),
    fornecedor_cnpj: xmlTag(emit, 'CNPJ') || xmlTag(emit, 'CPF'),
    destinatario: xmlTag(dest, 'xNome'),
    destinatario_cnpj: xmlTag(dest, 'CNPJ') || xmlTag(dest, 'CPF'),
    valor_total: parseMoney(xmlTag(total, 'vNF') || xmlTag(total, 'vLiq') || xmlTag(xml, 'vNF')),
    natureza_operacao: xmlTag(ide, 'natOp'),
    parcelas: dups,
    data_vencimento: dups.length === 1 ? dups[0].vencimento : null,
    forma_pagamento_codigo: xmlTag(xmlBlock(xml, 'detPag'), 'tPag') || null,
    tipo_documento: 'DANFe',
    texto_extraido: null,
  };
}

async function commandExists(command) {
  try { await execFile('bash', ['-lc', `command -v ${command}`]); return true; } catch (_) { return false; }
}

async function extractPdfText(pdfPath) {
  if (!await commandExists('pdftotext')) return '';
  try {
    const result = await execFile('pdftotext', ['-layout', '-enc', 'UTF-8', pdfPath, '-'], { maxBuffer: 30 * 1024 * 1024 });
    return String(result.stdout || '').trim();
  } catch (error) {
    log('WARN', `pdftotext falhou para ${path.basename(pdfPath)}: ${error.message}`);
    return '';
  }
}

async function pdfPageCount(pdfPath) {
  try {
    const result = await execFile('pdfinfo', [pdfPath]);
    const match = String(result.stdout || '').match(/^Pages:\s*(\d+)/im);
    return match ? Number(match[1]) : null;
  } catch (_) { return null; }
}

async function extractPdfPageTexts(pdfPath) {
  if (!await commandExists('pdftotext')) return [];
  try {
    const result = await execFile('pdftotext', ['-layout', '-enc', 'UTF-8', pdfPath, '-'], { maxBuffer: 30 * 1024 * 1024 });
    const pages = String(result.stdout || '').split('\f');
    const realCount = await pdfPageCount(pdfPath);
    if (realCount && pages.length === realCount + 1 && !pages[pages.length - 1].trim()) pages.pop();
    return pages;
  } catch (error) {
    log('WARN', `pdftotext (por página) falhou para ${path.basename(pdfPath)}: ${error.message}`);
    return [];
  }
}

async function extractPdfPageRange(pdfPath, from, to, outPath) {
  await execFile('qpdf', ['--empty', '--pages', pdfPath, `${from}-${to}`, '--', outPath]);
  return outPath;
}

async function splitPayrollByEmployee(pdfPath, workDir) {
  const pageTexts = await extractPdfPageTexts(pdfPath);
  if (pageTexts.length < 2) return null;
  const blocks = [];
  for (let i = 0; i < pageTexts.length; i += 1) {
    const employee = payrollEmployees(pageTexts[i])[0] || null;
    if (employee) blocks.push({ employee, from: i + 1, to: i + 1 });
    else if (blocks.length) blocks[blocks.length - 1].to = i + 1;
  }
  if (blocks.length < 2) return null;
  const results = [];
  for (const block of blocks) {
    const outPath = path.join(workDir, `holerite-${sanitizeFileName(block.employee.registration)}.pdf`);
    await extractPdfPageRange(pdfPath, block.from, block.to, outPath);
    results.push({ ...block, filePath: outPath });
  }
  return results;
}

async function uploadToStorage(bucket, storagePath, filePath, contentType) {
  const buffer = fs.readFileSync(filePath);
  const { error } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
    contentType: contentType || 'application/octet-stream', upsert: false,
  });
  if (error) throw new Error(`Falha ao enviar "${storagePath}" pro Storage: ${error.message}`);
}

async function insertQueueItem(payload) {
  const { data, error } = await supabase.from(TABLE_ITEMS).insert(payload).select('id,arquivo_nome').single();
  if (error) throw error;
  return data;
}

async function createSplitPayslipRows(row, split) {
  const created = [];
  for (const block of split) {
    const suffix = sanitizeStorageKey(`${block.employee.registration}-${block.employee.name}`);
    const dir = path.dirname(row.storage_path || '');
    const storagePath = `${dir && dir !== '.' ? `${dir}/` : ''}split-${suffix}-${crypto.randomUUID()}.pdf`;
    const arquivoNome = `HOLERITE ${block.employee.registration} - ${block.employee.name}.pdf`;
    await uploadToStorage(row.storage_bucket || 'notas-fiscais', storagePath, block.filePath, 'application/pdf');
    const inserted = await insertQueueItem({
      storage_bucket: row.storage_bucket || 'notas-fiscais',
      storage_path: storagePath,
      arquivo_nome: arquivoNome,
      arquivo_mime_type: 'application/pdf',
      setor: row.setor || 'RH',
      enviado_por: row.enviado_por || null,
      status: 'NOVO',
      origem_extracao: `SPLIT_DE_${row.id}`,
    });
    created.push(inserted);
  }
  return created;
}

async function groqOcrImage(imagePath) {
  if (!GROQ_API_KEY) throw new Error('Configure GROQ_API_KEY para OCR de imagem/PDF escaneado.');
  const ext = extensionOf(imagePath).replace('.', '') || 'png';
  const mimeType = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[ext] || 'image/png';
  const content = fs.readFileSync(imagePath).toString('base64');
  const prompt = 'Transcreva literalmente todo o texto visível neste documento financeiro, fiscal ou trabalhista (nota fiscal, DANFe, NFS-e, comprovante ou holerite), sem resumir e sem interpretar. Responda apenas com o texto transcrito, sem markdown.';
  const body = JSON.stringify({
    model: GROQ_OCR_MODEL,
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:${mimeType};base64,${content}` } }] }],
    temperature: 0,
    max_tokens: 8192,
  });
  const response = await httpRequest({
    method: 'POST', hostname: 'api.groq.com', path: '/openai/v1/chat/completions',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, body, 'json');
  const text = response?.choices?.[0]?.message?.content || '';
  if (!text) throw new Error(`Groq não retornou texto para ${path.basename(imagePath)}.`);
  return text;
}

async function ocrPdf(pdfPath, workDir) {
  if (!await commandExists('pdftoppm')) throw new Error('PDF sem texto e pdftoppm indisponível. Instale poppler-utils.');
  const prefix = path.join(workDir, 'pagina');
  await execFile('pdftoppm', ['-f', '1', '-l', String(OCR_PDF_MAX_PAGES), '-r', '160', '-png', pdfPath, prefix], { maxBuffer: 30 * 1024 * 1024 });
  const images = fs.readdirSync(workDir).filter((name) => /^pagina-\d+\.png$/i.test(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const texts = [];
  for (const image of images) texts.push(await groqOcrImage(path.join(workDir, image)));
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
  const matches = String(text || '').match(/\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[/]?\d{4}[-\s]?\d{2}\b/g) || [];
  return Array.from(new Set(matches.map(onlyDigits).filter((v) => v.length === 14)));
}

function allCpfs(text) {
  const matches = String(text || '').match(/\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/g) || [];
  return Array.from(new Set(matches.map(onlyDigits).filter((v) => v.length === 11)));
}

function ownDocuments() {
  return new Set((config.empresas || []).map((e) => onlyDigits(e.documento)).filter(Boolean));
}

function resolveEmpresa(documento) {
  const target = onlyDigits(documento || '');
  if (!target) return null;
  const entry = (config.empresas || []).find((e) => onlyDigits(e.documento) === target);
  return entry ? entry.nome : null;
}

function inferPaymentMethod(text) {
  const normalized = normalizeText(text);
  for (const rule of config.payment_rules || []) {
    if ((rule.keywords || []).some((keyword) => normalized.includes(normalizeText(keyword)))) return rule.forma_pagamento;
  }
  if (normalized.includes('PIX')) return 'PIX';
  if (normalized.includes('BOLETO')) return 'Boleto';
  if (normalized.includes('TRANSFERENCIA') || normalized.includes('TED')) return 'Transferência';
  return config.defaults.forma_pagamento || null;
}

function extractFromText(text, mimeOrExt) {
  const raw = String(text || '').replace(/\r/g, '');
  const ownDocs = ownDocuments();
  const documentos = [...allCnpjs(raw), ...allCpfs(raw)];
  const destinatarioDoc = documentos.find((doc) => ownDocs.has(doc)) || null;
  const supplierDoc = documentos.find((doc) => doc !== destinatarioDoc) || documentos[0] || null;
  const numero = firstMatch(raw, [
    /(?:NFS[-\s]?E|NF[-\s]?E|NOTA\s+FISCAL|N[ÚU]MERO\s+DA\s+NOTA|N[ÚU]MERO\s+NF)\s*(?:N[º°.]|NRO\.?|N[ÚU]MERO)?\s*[:#-]?\s*(\d{1,12})/i,
    /(?:N[º°.]|NRO\.?|N[ÚU]MERO)\s*[:#-]\s*(\d{3,12})/i,
  ]);
  const emissao = firstMatch(raw, [/(?:DATA\s+(?:DE\s+)?EMISS[ÃA]O|EMITIDA?\s+EM|DATA\s+DA\s+NOTA)\s*[:\-]?\s*(\d{2}[/-]\d{2}[/-]\d{4})/i]);
  const vencimento = firstMatch(raw, [/(?:DATA\s+(?:DE\s+)?VENCIMENTO|VENCIMENTO|VENC\.)\s*[:\-]?\s*(\d{2}[/-]\d{2}[/-]\d{4})/i]);
  const valorRaw = firstMatch(raw, [
    /(?:VALOR\s+TOTAL\s+DA\s+NOTA|VALOR\s+DA\s+NOTA|VALOR\s+TOTAL|TOTAL\s+A\s+PAGAR)\s*[:\-]?\s*R?\$?\s*([\d.]+,\d{2})/i,
    /(?:VALOR\s+L[IÍ]QUIDO)\s*[:\-]?\s*R?\$?\s*([\d.]+,\d{2})/i,
  ]);
  const fornecedor = firstMatch(raw, [/(?:RAZ[ÃA]O\s+SOCIAL|PRESTADOR(?:A)?\s+DE\s+SERVI[ÇC]OS|EMITENTE|FORNECEDOR)\s*[:\-]?\s*([^\n]{3,100})/i]);
  const isNfse = /NFS[-\s]?E|NOTA\s+FISCAL\s+(?:ELETR[ÔO]NICA\s+)?DE\s+SERVI[ÇC]OS/i.test(raw);
  return {
    origem_extracao: mimeOrExt === '.pdf' ? 'PDF_TEXTO_OU_OCR' : 'IMAGEM_OCR',
    texto_extraido: raw.slice(0, 250000),
    numero_documento: numero,
    numero_nf: numero,
    data_emissao: toBrDate(emissao && emissao.replace(/-/g, '/')),
    data_conta: toBrDate(emissao && emissao.replace(/-/g, '/')),
    data_vencimento: toBrDate(vencimento && vencimento.replace(/-/g, '/')),
    valor_total: parseMoney(valorRaw),
    fornecedor: fornecedor ? fornecedor.replace(/\s{2,}.*/, '').trim() : null,
    fornecedor_cnpj: supplierDoc,
    destinatario_cnpj: destinatarioDoc,
    forma_pagamento: inferPaymentMethod(raw),
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
      text = await ocrPdf(filePath, path.dirname(filePath));
      source = 'PDF_OCR_GROQ';
    }
    const data = extractFromText(text, '.pdf');
    data.origem_extracao = source;
    return data;
  }
  const text = await groqOcrImage(filePath);
  return extractFromText(text, ext);
}

function detectDocumentKind(extracted, row) {
  if (extensionOf(row?.arquivo_nome) === '.xml') return 'NOTA_FISCAL';
  const text = normalizeText([row?.arquivo_nome, extracted?.texto_extraido, extracted?.natureza_operacao].filter(Boolean).join(' '));
  let score = 0;
  if (text.includes('HOLERITE') || text.includes('CONTRACHEQUE') || text.includes('RECIBO DE PAGAMENTO')) score += 4;
  if (text.includes('FOLHA MENSAL')) score += 4;
  if (text.includes('VALOR LIQUIDO')) score += 2;
  if (text.includes('NOME DO FUNCIONARIO')) score += 2;
  if (text.includes('SALARIO BASE')) score += 1;
  if (/\bCBO\b/.test(text)) score += 1;
  if (text.includes('MENSALISTA') || text.includes('INTERMITENTE')) score += 2;
  if (text.includes('DIAS NORMAIS') && (text.includes('I.N.S.S') || /\bINSS\b/.test(text))) score += 1;
  return score >= 6 ? 'HOLERITE' : 'NOTA_FISCAL';
}

function payrollReference(text) {
  const normalized = normalizeText(text);
  const match = normalized.match(/\b(JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\s+DE\s+(20\d{2})\b/);
  if (!match) return null;
  const month = PAYROLL_MONTH_NUMBER[match[1]];
  if (!month) return null;
  return { month, year: Number(match[2]), label: `${PAYROLL_MONTHS[month - 1]} ${match[2]}`, iso: `${match[2]}-${String(month).padStart(2, '0')}-01` };
}

function payrollDate(year, month, day) {
  return {
    iso: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    br: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${String(year).padStart(4, '0')}`,
  };
}

function payrollLastDay(year, month) {
  const date = new Date(Date.UTC(year, month, 0));
  return payrollDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function payrollHolidaySet() {
  const values = Array.isArray(config?.holerite?.feriados) ? config.holerite.feriados : [];
  return new Set(values.map((value) => toIsoDate(value)).filter(Boolean));
}

function payrollFifthBusinessDay(year, month) {
  const saturdayIsBusinessDay = config?.holerite?.sabado_dia_util !== false;
  const holidays = payrollHolidaySet();
  const date = new Date(Date.UTC(year, month, 1));
  let count = 0;
  while (count < 5) {
    const weekDay = date.getUTCDay();
    const current = payrollDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    const business = weekDay !== 0 && (saturdayIsBusinessDay || weekDay !== 6) && !holidays.has(current.iso);
    if (business) count += 1;
    if (count < 5) date.setUTCDate(date.getUTCDate() + 1);
  }
  return payrollDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function payrollEmployees(text) {
  const unique = new Map();
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const patterns = [
    // Holerite individual (não-lote): entre o nome e o CBO pode vir o valor de
    // Referência (ex.: "31,00", dias/horas trabalhados) — achado real
    // processando HOLERITE 1013 - SAMMUEL ARAÚJO SOARES.pdf, arquivo que
    // ficou parado na fila desde 07/08 porque essa variação não batia com
    // nenhum dos dois padrões abaixo (só o formato de lote, sem Referência,
    // batia).
    /^\s*(\d{1,8})\s+([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý .'-]{4,}?)\s+(?:\d{1,3}(?:\.\d{3})*,\d{2}\s+)?(\d{5,7})\s+(\d+)\s+(\d+)\s*$/i,
    /^\s*(\d{1,8})\s{2,}([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý .'-]{4,}?)\s{2,}(\d{5,7})\b/i,
  ];
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (!match) continue;
      const registration = match[1].trim();
      const name = String(match[2]).replace(/\s+/g, ' ').trim();
      if (registration && name) unique.set(registration, { registration, name });
      break;
    }
  }
  if (!unique.size) {
    const fallback = String(text || '').match(/C[oó]digo\s+Nome\s+do\s+Funcion[aá]rio[\s\S]{0,500}?\n\s*(\d{1,8})\s+([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý .'-]{4,}?)\s+(\d{5,7})\s+\d+\s+\d+/i);
    if (fallback) unique.set(fallback[1].trim(), { registration: fallback[1].trim(), name: String(fallback[2]).replace(/\s+/g, ' ').trim() });
  }
  return Array.from(unique.values());
}

function payrollMoneyValues(text) {
  return Array.from(String(text || '').matchAll(/\b\d{1,3}(?:\.\d{3})*,\d{2}\b/g))
    .map((match) => ({ raw: match[0], value: parseMoney(match[0]), index: match.index || 0 }))
    .filter((item) => item.value != null);
}

function payrollNetValue(text, extractedValue) {
  const raw = String(text || '');
  const anchors = [];
  const anchorRegex = /TOTAL\s+DE\s+VENCIMENTOS|VALOR\s+L[IÍ]QUIDO/ig;
  let anchor;
  while ((anchor = anchorRegex.exec(raw))) anchors.push(anchor.index);
  const segments = anchors.map((index) => raw.slice(Math.max(0, index - 200), index + 1800));
  segments.push(raw);
  for (const segment of segments) {
    const values = payrollMoneyValues(segment);
    for (let i = 0; i < values.length; i += 1) {
      for (let j = i + 1; j < Math.min(values.length, i + 8); j += 1) {
        for (let k = j + 1; k < Math.min(values.length, j + 8); k += 1) {
          const gross = values[i].value;
          const discounts = values[j].value;
          const net = values[k].value;
          if (gross > 0 && discounts >= 0 && net > 0 && Math.abs((gross - discounts) - net) <= 0.02) return net;
        }
      }
    }
  }
  const sameLine = raw.match(/VALOR\s+L[IÍ]QUIDO[^\n\d]{0,80}(\d{1,3}(?:\.\d{3})*,\d{2})/i);
  if (sameLine) return parseMoney(sameLine[1]);
  return parseMoney(extractedValue);
}

function deepMerge(base, override) {
  const out = { ...(base || {}) };
  for (const [key, value] of Object.entries(override || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) out[key] = deepMerge(out[key], value);
    else if (value !== undefined && value !== null && value !== '') out[key] = value;
  }
  return out;
}

function applyPayslipRules(extracted, row) {
  const text = String(extracted.texto_extraido || '');
  const reference = payrollReference(text);
  const employees = payrollEmployees(text);
  const employee = employees.length === 1 ? employees[0] : null;
  const normalized = normalizeText(text);
  const intermitente = normalized.includes('INTERMITENTE');
  const mensalista = normalized.includes('MENSALISTA');
  const employmentType = intermitente ? 'Intermitente' : (mensalista ? 'Mensalista' : null);
  const category = intermitente ? 'SALÁRIO DE INTERMITENTE' : (mensalista ? 'SALÁRIO FIXO' : null);
  const accountDate = reference ? payrollLastDay(reference.year, reference.month) : null;
  const dueDate = reference ? payrollFifthBusinessDay(reference.year, reference.month) : null;
  const companyDocument = allCnpjs(text).find((documento) => resolveEmpresa(documento)) || null;
  const companyByName = (config.empresas || []).find((entry) => normalized.includes(normalizeText(entry.nome)))?.nome || null;
  const company = resolveEmpresa(companyDocument) || companyByName || null;
  const value = payrollNetValue(text, extracted.valor_total);
  const documentNumber = employee && reference ? `${employee.registration}-${reference.label}` : null;

  let data = deepMerge(config.defaults, extracted);
  data = deepMerge(data, {
    tipo_documento_fluxo: 'HOLERITE',
    empresa: company,
    destinatario_cnpj: companyDocument,
    tipo_favorecido: 'Funcionário',
    fornecedor: employee?.name || null,
    fornecedor_cnpj: null,
    funcionario_registro: employee?.registration || null,
    funcionario_nome: employee?.name || null,
    funcionarios_encontrados: employees,
    tipo_contrato: employmentType,
    competencia_iso: reference?.iso || null,
    competencia: reference?.label || null,
    data_conta: accountDate?.br || null,
    data_emissao: accountDate?.br || null,
    data_vencimento: dueDate?.br || null,
    valor_total: value,
    grupo_categoria: 'FOLHA DE PAGAMENTO',
    categoria: category,
    intervalo_cobranca: 'Não Parcelar',
    tipo_documento: 'Holerite',
    numero_documento: documentNumber,
    forma_pagamento: 'PIX',
    identificacao: documentNumber ? `HOLERITE ${documentNumber}` : null,
    descricao: null,
    qtd_parcelas: 1,
    parcelas: [],
    rateio: {
      data_participacao: accountDate?.br || null,
      tipo_participacao: 'Funcionário',
      identificacao: employee?.name || null,
      valor: value,
    },
  });
  data.fornecedor_cnpj = null;
  data.valor_total = parseMoney(data.valor_total);
  data.rateio.valor = parseMoney(data.rateio.valor);
  data.numero_documento = String(data.numero_documento || '').trim() || null;
  data.data_conta = toBrDate(data.data_conta);
  data.data_vencimento = toBrDate(data.data_vencimento);
  data.data_emissao = toBrDate(data.data_emissao || data.data_conta);
  data.setor = row.setor || 'RH';
  data.origem_extracao = `${String(data.origem_extracao || 'PDF')}_HOLERITE`;
  data.fingerprint = fingerprintOf(data);
  return data;
}

function applyInvoiceRules(extracted, row) {
  let data = deepMerge(config.defaults, extracted);
  const setorText = normalizeText(row.setor || '');
  const sourceText = normalizeText([extracted.texto_extraido, extracted.natureza_operacao, row.arquivo_nome].filter(Boolean).join(' '));
  for (const rule of config.setor_rules || []) {
    const contains = normalizeText(rule.setor_contains || rule.contains || '');
    if (contains && setorText.includes(contains)) data = deepMerge(data, rule.set || rule);
  }
  for (const rule of config.keyword_rules || []) {
    if ((rule.keywords || []).some((keyword) => sourceText.includes(normalizeText(keyword)))) data = deepMerge(data, rule.set || rule);
  }
  if (!data.data_conta) data.data_conta = data.data_emissao;
  if (!data.data_vencimento && Array.isArray(data.parcelas) && data.parcelas.length === 1) data.data_vencimento = data.parcelas[0].vencimento;
  if (!data.forma_pagamento && extracted.forma_pagamento_codigo) {
    data.forma_pagamento = (config.payment_code_map || {})[String(extracted.forma_pagamento_codigo)] || null;
  }
  data.tipo_documento_fluxo = 'NOTA_FISCAL';
  data.empresa = data.empresa || resolveEmpresa(data.destinatario_cnpj) || null;
  data.tipo_favorecido = data.tipo_favorecido || 'Fornecedor';
  data.intervalo_cobranca = data.intervalo_cobranca || 'Não Parcelar';
  data.tipo_documento = data.tipo_documento || 'DANFe';
  data.identificacao = data.identificacao || `NF ${data.numero_documento || data.numero_nf || stemOf(row.arquivo_nome)} - ${data.fornecedor || 'FORNECEDOR'}`;
  data.descricao = data.descricao || data.natureza_operacao || `Lançamento automático a partir do upload: ${row.arquivo_nome}`;
  data.rateio = deepMerge({
    data_participacao: data.data_conta, tipo_participacao: 'Coordenação', identificacao: 'GERAL', valor: data.valor_total,
  }, data.rateio || {});
  data.rateio.data_participacao = data.rateio.data_participacao || data.data_conta;
  data.rateio.valor = parseMoney(data.rateio.valor == null ? data.valor_total : data.rateio.valor);
  data.valor_total = parseMoney(data.valor_total);
  data.fornecedor_cnpj = onlyDigits(data.fornecedor_cnpj) || null;
  data.numero_documento = String(data.numero_documento || data.numero_nf || '').trim() || null;
  data.data_conta = toBrDate(data.data_conta);
  data.data_vencimento = toBrDate(data.data_vencimento);
  data.data_emissao = toBrDate(data.data_emissao || data.data_conta);
  data.setor = row.setor || null;
  data.fingerprint = fingerprintOf(data);
  return data;
}

function validateData(data) {
  const missing = [];
  const classificationMissing = [];
  if (!data.empresa) missing.push('empresa');
  if (!data.identificacao) missing.push('identificacao');
  if (!data.data_conta) missing.push('data_conta');
  if (!data.fornecedor && !data.fornecedor_cnpj) missing.push('favorecido');
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
  if (data.tipo_documento_fluxo === 'HOLERITE') {
    if (!data.funcionario_registro) missing.push('funcionario_registro');
    if (!data.funcionario_nome) missing.push('funcionario_nome');
    if (!data.competencia_iso) missing.push('competencia');
    if (!data.tipo_contrato) classificationMissing.push('tipo_contrato Mensalista/Intermitente');
    if (Array.isArray(data.funcionarios_encontrados) && data.funcionarios_encontrados.length > 1) missing.push('PDF contém mais de um funcionário; envie um arquivo por funcionário');
  }
  if (Array.isArray(data.parcelas) && data.parcelas.length > 1 && normalizeText(data.intervalo_cobranca) === 'NAO PARCELAR') missing.push('parcelas múltiplas exigem intervalo e quantidade revisados');
  return { missing, classificationMissing, ok: !missing.length && !classificationMissing.length };
}

async function createRun() {
  const payload = { status: 'INICIADO', dry_run: DRY_RUN, iniciado_em: isoNow(), resumo: { limit: LIMIT, upload_id: args.uploadId || null } };
  const { data, error } = await supabase.from(TABLE_RUNS).insert(payload).select('id').single();
  if (error) { log('WARN', `Não consegui criar execução em ${TABLE_RUNS}: ${error.message}`); return null; }
  return data?.id || null;
}

async function finishRun(runId, status, stats, errorMessage) {
  if (!runId) return;
  const { error } = await supabase.from(TABLE_RUNS).update({ status, finalizado_em: isoNow(), resumo: stats, erro: errorMessage || null }).eq('id', runId);
  if (error) log('WARN', `Não consegui finalizar execução: ${error.message}`);
}

async function findLaunchedFingerprint(fingerprint) {
  if (!fingerprint) return null;
  const { data, error } = await supabase.from(TABLE_ITEMS)
    .select('id,arquivo_nome,status,grm_codigo,grm_grupo,lancado_em')
    .eq('fingerprint', fingerprint)
    .in('status', ['LANCADO', 'DRY_RUN_OK'])
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

async function updateItem(id, patch) {
  const { data, error } = await supabase.from(TABLE_ITEMS).update({ updated_at: isoNow(), ...patch }).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Camada nova: GRM via API (substitui inteiramente o Puppeteer). Contrato
// login/postJson idêntico a grmserver-liberacao-despesas-api.js (já validado
// em produção); o resto (catálogos e setRecord de payInvoice) foi descoberto
// e testado nesta migração (ver cabeçalho do arquivo).
function requestJson(url, method, body, headers = {}) {
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
        try { data = raw ? JSON.parse(raw) : {}; }
        catch { reject(new Error(`GRM retornou conteúdo inválido (HTTP ${response.statusCode}).`)); return; }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`GRM respondeu HTTP ${response.statusCode}: ${data.message || 'erro'}`));
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

function postJson(url, body, headers = {}) { return requestJson(url, 'POST', body, headers); }

async function grmLogin() {
  if (!GRM_USER || !GRM_PASSWORD) throw new Error('Credenciais GRMSERVER_USER/GRMSERVER_PASSWORD ausentes.');
  const response = await postJson(`${GRM_BASE_URL}user/login`, {
    userEmail: GRM_USER,
    userPass: GRM_PASSWORD,
    loginInfo: {
      ip: '', browser: 'GRM API Agent', browserVersion: '1.0',
      engine: 'Node.js', engineVersion: process.version, platform: process.platform, screenSize: '', windowSize: '',
    },
  }, GRM_WEB_HEADERS);
  if (!response.result || !response.token) throw new Error(`Login GRM recusado: ${response.message || 'sem token'}`);
  return response.token;
}

function authHeaders() { return { ...GRM_WEB_HEADERS, authorization: `Bearer ${grmToken}` }; }

// Um único retry em 401 (token expirado no meio de um lote longo).
async function apiPost(endpoint, body) {
  if (!grmToken) grmToken = await grmLogin();
  try {
    return await postJson(`${GRM_BASE_URL}${endpoint}`, body, authHeaders());
  } catch (error) {
    if (!/HTTP 401/.test(error.message)) throw error;
    log('WARN', `${endpoint}: token expirado, refazendo login.`);
    grmToken = await grmLogin();
    return postJson(`${GRM_BASE_URL}${endpoint}`, body, authHeaders());
  }
}

async function getCatalog(key, endpoint, body = {}) {
  if (!catalogCache[key]) {
    const response = await apiPost(endpoint, body);
    if (!response.result) throw new Error(`${endpoint} falhou: ${response.message || 'erro'}`);
    catalogCache[key] = safe(response.searchData);
  }
  return catalogCache[key];
}

// scpName no GRM é um apelido curto ("EXCELENCIA", "BV GRAIN", "DOUGLAS
// HENRIQUE MOTA 09987821901"), não a razão social completa que a extração
// devolve em data.empresa ("EXCELENCIA CLASSIFICACOES LTDA") — confirmado
// comparando sysCompany/getRecords ao vivo com config.empresas. Match exato
// primeiro, senão substring nos dois sentidos.
async function resolveEmpresaScpCode(nomeEmpresa) {
  const companies = await getCatalog('sysCompany', 'sysCompany/getRecords');
  const alvo = normalizeText(nomeEmpresa);
  let found = companies.find((c) => normalizeText(c.scpName) === alvo);
  if (!found) {
    found = companies.find((c) => {
      const nome = normalizeText(c.scpName);
      return nome && (alvo.includes(nome) || nome.includes(alvo));
    });
  }
  if (!found) return null;
  return { scpCode: found.scpCode, moreThenOneCompany: companies.length > 1 ? 'S' : 'N' };
}

// payInvoiceMainCategory (Grupo de Categoria) é só o picCode do nó-pai
// (picParent) da categoria-folha — não existe catálogo separado pra grupo,
// confirmado inspecionando payInvoiceCategory/getRecords (picParent:0 =
// grupo, picParent:N = categoria dentro do grupo N).
async function resolveCategoria(categoriaNome) {
  const categorias = await getCatalog('payInvoiceCategory', 'payInvoiceCategory/getRecords');
  const alvo = normalizeText(categoriaNome);
  const leaf = categorias.find((c) => normalizeText(c.picName) === alvo && Number(c.picParent) !== 0);
  if (!leaf) return null;
  return { picCode: leaf.picCode, payInvoiceMainCategory: leaf.picParent };
}

async function resolveTipoDocumento(nome) {
  const tipos = await getCatalog('payInvoiceDocType', 'payInvoiceDocType/getRecords');
  const found = tipos.find((t) => normalizeText(t.pdtName) === normalizeText(nome));
  return found ? found.pdtCode : null;
}

async function resolveFormaPagamento(nome) {
  const formas = await getCatalog('paymentType', 'paymentType/getRecords');
  const found = formas.find((p) => normalizeText(p.patName) === normalizeText(nome));
  return found ? found.patCode : null;
}

async function resolveCoordenacao(nome) {
  const lista = await getCatalog('coordination', 'coordination/getRecords');
  const found = lista.find((c) => normalizeText(c.olcName) === normalizeText(nome)) || lista[0] || null;
  return found ? found.olcCode : null;
}

// Cascata idêntica ao selectEmployeeById() do Puppeteer (matrícula sozinha já
// falhava lá também — o autocomplete do GRM só busca por nome de verdade).
// staStatus SEM filtro (não só "A"): holerite é frequentemente da última
// competência de alguém já desligado (rescisão) — 19 lançamentos reais
// falharam com "não encontrado" só porque o funcionário já estava com
// staStatus 'N' no GRM (achado processando o backlog em produção, 04/09).
async function resolveFuncionario(data) {
  const name = String(data.funcionario_nome || data.fornecedor || '').trim();
  const registration = String(data.funcionario_registro || '').trim();
  const shortName = name.split(/\s+/).slice(0, 2).join(' ');
  const searches = Array.from(new Set([registration, name, shortName].filter(Boolean)));
  for (const search of searches) {
    const response = await apiPost('staff/getRecords', { staName: '', staCPF: '', staEmail: '', staStatus: '', groupSearch: search });
    if (!response.result) continue;
    const rows = safe(response.searchData);
    if (rows.length === 1) return rows[0];
    if (rows.length > 1 && name) {
      const exact = rows.find((r) => normalizeText(r.staName) === normalizeText(name));
      if (exact) return exact;
    }
  }
  return null;
}

async function resolveFornecedor(data) {
  const cnpj = onlyDigits(data.fornecedor_cnpj);
  const nome = String(data.fornecedor || '').trim();
  const searches = Array.from(new Set([cnpj, nome].filter(Boolean)));
  for (const search of searches) {
    const response = await apiPost('suppliers/getRecords', { supName: '', supDocument: '', supStatus: 'A', groupSearch: search });
    if (!response.result) continue;
    const rows = safe(response.searchData);
    if (rows.length === 1) return rows[0];
    if (rows.length > 1 && cnpj) {
      const exact = rows.find((r) => onlyDigits(r.supDocument) === cnpj);
      if (exact) return exact;
    }
  }
  return null;
}

// Resolve todos os códigos GRM necessários pro payload — lança com mensagem
// específica de QUAL cadastro não foi achado (fica em ERRO, não em
// AGUARDANDO_DADOS, porque o dado extraído está ok; o problema é o cadastro
// no GRM não ter um correspondente exato).
async function resolveGrmCodes(data) {
  const empresa = await resolveEmpresaScpCode(data.empresa);
  if (!empresa) throw new Error(`Empresa "${data.empresa}" não encontrada no GRM (sysCompany).`);

  const categoria = await resolveCategoria(data.categoria);
  if (!categoria) throw new Error(`Categoria "${data.categoria}" não encontrada no GRM (payInvoiceCategory).`);

  const pdtCode = await resolveTipoDocumento(data.tipo_documento);
  if (!pdtCode) throw new Error(`Tipo de Documento "${data.tipo_documento}" não encontrado no GRM (payInvoiceDocType).`);

  const patCode = await resolveFormaPagamento(data.forma_pagamento);
  if (!patCode) throw new Error(`Forma de Pagamento "${data.forma_pagamento}" não encontrada no GRM (paymentType).`);

  const isEmployee = normalizeText(data.tipo_favorecido) === 'FUNCIONARIO';
  let staCode = 0;
  let supCode = 0;
  if (isEmployee) {
    const staff = await resolveFuncionario(data);
    if (!staff) throw new Error(`Funcionário "${data.funcionario_nome || data.fornecedor}" não encontrado no GRM (staff).`);
    staCode = staff.staCode;
  } else {
    const supplier = await resolveFornecedor(data);
    if (!supplier) throw new Error(`Fornecedor "${data.fornecedor || data.fornecedor_cnpj}" não encontrado no GRM (suppliers).`);
    supCode = supplier.supCode;
  }

  const tipoParticipacao = normalizeText(data.rateio?.tipo_participacao || '');
  let olcCode = 0;
  if (tipoParticipacao === 'COORDENACAO' || tipoParticipacao === 'SUPERVISAO') {
    olcCode = await resolveCoordenacao(data.rateio.identificacao) || 0;
    if (!olcCode) throw new Error(`Coordenação "${data.rateio.identificacao}" não encontrada no GRM (coordination).`);
  }

  return {
    scpCode: empresa.scpCode,
    moreThenOneCompany: empresa.moreThenOneCompany,
    picCode: categoria.picCode,
    payInvoiceMainCategory: categoria.payInvoiceMainCategory,
    pdtCode,
    patCode,
    isEmployee,
    staCode,
    supCode,
    olcCode,
  };
}

// pipType: Coordenação="C", Supervisão="S", Funcionário="F", Veículo="V"
// (enum fixo do formulário — não vem de nenhum catálogo, confirmado
// inspecionando o componente do GRM).
function buildRateioEntry(data, resolved) {
  const tipo = normalizeText(data.rateio?.tipo_participacao || '');
  const pipType = tipo === 'FUNCIONARIO' ? 'F' : tipo === 'SUPERVISAO' ? 'S' : tipo === 'VEICULO' ? 'V' : 'C';
  const entry = {
    pipStatus: 'A',
    pipDate: data.rateio?.data_participacao || data.data_conta,
    pipType,
    olcCode: 0,
    olsCode: 0,
    staCode: 0,
    vehCode: 0,
    pipValue: data.rateio?.valor,
    pipPercentage: 100,
  };
  if (pipType === 'F') entry.staCode = resolved.staCode;
  else entry.olcCode = resolved.olcCode;
  return entry;
}

function buildPayInvoicePayload(data, resolved) {
  return {
    scpCode: resolved.scpCode,
    pinTitle: data.identificacao,
    typeFavored: resolved.isEmployee ? 'staCode' : 'supCode',
    staCode: resolved.staCode,
    supCode: resolved.supCode,
    picCode: resolved.picCode,
    payInvoiceMainCategory: resolved.payInvoiceMainCategory,
    pinDate: data.data_conta,
    pinDueDate: data.data_vencimento,
    pinInstallmentTotal: 1,
    pinInstallmentNumber: 1,
    pinInstallmentInterval: 'N',
    pinTotalValue: data.valor_total,
    pdtCode: resolved.pdtCode,
    pinDocNumber: data.numero_documento,
    patCode: resolved.patCode,
    pinDescription: data.tipo_documento_fluxo === 'HOLERITE' ? '' : (data.descricao || ''),
    pinStatus: 'A',
    pinDividedProrated: 'N',
    proratedInvoices: [buildRateioEntry(data, resolved)],
    pinInstallment: [{
      pinInstallmentNumber: 1, pinInstallmentValue: data.valor_total, pinDueDate: data.data_vencimento, pinStatus: 'A',
    }],
    isEditRecord: 'N',
    moreThenOneCompany: resolved.moreThenOneCompany,
  };
}

// NÃO VALIDADO AO VIVO — ver aviso no cabeçalho do arquivo. O widget de anexo
// do GRM (payInvoice/uploadFiles) só é acionável com um pinCode já existente,
// então isso só pode ser testado depois de um lançamento real.
async function uploadAttachment(recordCode, filePath, fileName) {
  const boundary = `----grmupload${crypto.randomBytes(16).toString('hex')}`;
  const fileBuffer = fs.readFileSync(filePath);
  const fields = { mainRecord: String(recordCode), fileDir: 'payInvoiceFileDir' };
  const parts = [];
  for (const [key, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));
  }
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${sanitizeFileName(fileName)}"\r\nContent-Type: application/octet-stream\r\n\r\n`));
  parts.push(fileBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  const body = Buffer.concat(parts);

  if (!grmToken) grmToken = await grmLogin();
  const response = await httpRequest({
    method: 'POST', hostname: 'www.grmserver.com.br', path: '/api/payInvoice/uploadFiles',
    headers: {
      ...GRM_WEB_HEADERS, authorization: `Bearer ${grmToken}`,
      'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': body.length,
    },
  }, body, 'json');
  if (!response || response.result === false) throw new Error(`payInvoice/uploadFiles falhou: ${response?.message || 'resposta sem result:true'}`);
  return response;
}

async function submitPayInvoice(data, resolved, filePath, fileName) {
  const payload = buildPayInvoicePayload(data, resolved);
  if (DRY_RUN) {
    log('DEBUG', 'Payload que seria enviado pro payInvoice/setRecord (dry-run):', payload);
    return { dryRun: true, payload };
  }
  const response = await apiPost('payInvoice/setRecord', payload);
  if (!response.result) throw new Error(`payInvoice/setRecord falhou: ${response.message || 'erro'}`);
  const recordCode = response.recordCode;
  try {
    await uploadAttachment(recordCode, filePath, fileName);
  } catch (error) {
    const wrapped = new Error(`Lançado no GRM (código ${recordCode}) mas o anexo falhou — anexar manualmente pelo GRM. Detalhe: ${error.message}`);
    wrapped.grmCodigo = recordCode;
    throw wrapped;
  }
  return { dryRun: false, recordCode, payload };
}

// ---------------------------------------------------------------------------
async function processUpload(row, runId) {
  const tempBase = process.env.TMPDIR || os.tmpdir();
  ensureDir(tempBase);
  const workDir = fs.mkdtempSync(path.join(tempBase, 'grm-fin-'));
  const localPath = path.join(workDir, sanitizeFileName(row.arquivo_nome));
  try {
    await updateItem(row.id, { status: 'PROCESSANDO', execucao_id: runId, tentativas: Number(row.tentativas || 0) + 1, erro: null, processado_em: isoNow() });

    await downloadFromStorage(row, localPath);
    const extracted = await extractFileData(localPath, { name: row.arquivo_nome });
    const documentKind = detectDocumentKind(extracted, row);

    if (documentKind === 'HOLERITE' && extensionOf(row.arquivo_nome) === '.pdf' && payrollEmployees(extracted.texto_extraido || '').length > 1) {
      const split = await splitPayrollByEmployee(localPath, workDir);
      if (split && split.length > 1) {
        const created = await createSplitPayslipRows(row, split);
        await updateItem(row.id, {
          status: 'DIVIDIDO', execucao_id: runId, erro: null, origem_extracao: 'HOLERITE_LOTE',
          extraido_json: { funcionarios_encontrados: split.map((b) => b.employee) },
        });
        log('SUCCESS', `${row.arquivo_nome}: lote com ${split.length} funcionário(s) — dividido em ${created.length} arquivo(s) individuais, ficam pro próximo ciclo.`);
        return 'dividido';
      }
      log('WARN', `${row.arquivo_nome}: ${payrollEmployees(extracted.texto_extraido || '').length} funcionários detectados no texto, mas não foi possível dividir o PDF por página.`);
    }

    const data = documentKind === 'HOLERITE' ? applyPayslipRules(extracted, row) : applyInvoiceRules(extracted, row);
    data.tipo_documento_fluxo = documentKind;
    data.fingerprint = fingerprintOf(data);

    const validation = validateData(data);
    await updateItem(row.id, {
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
      log('WARN', `${row.arquivo_nome}: não será lançado. Pendências: ${[...validation.missing, ...validation.classificationMissing].join(', ')}`);
      return validation.classificationMissing.length ? 'aguardando_classificacao' : 'aguardando_dados';
    }

    const duplicate = await findLaunchedFingerprint(data.fingerprint);
    if (duplicate && duplicate.id !== row.id && !args.force) {
      await updateItem(row.id, { status: 'DUPLICADO', execucao_id: runId, erro: `Fingerprint já processado no arquivo ${duplicate.arquivo_nome || duplicate.id}.` });
      log('WARN', `${row.arquivo_nome}: duplicado de ${duplicate.arquivo_nome || duplicate.id}.`);
      return 'duplicado';
    }

    const documentLabel = documentKind === 'HOLERITE' ? 'Holerite' : 'NF';
    log('INFO', `${row.arquivo_nome}: ${DRY_RUN ? 'resolvendo cadastros no GRM (dry-run)' : 'lançando no GRM'} - ${documentLabel} ${data.numero_documento}, ${data.fornecedor || data.fornecedor_cnpj}, R$ ${formatMoneyInput(data.valor_total)}.`);

    const resolved = await resolveGrmCodes(data);
    const result = await submitPayInvoice(data, resolved, localPath, row.arquivo_nome);

    const finalStatus = DRY_RUN ? 'DRY_RUN_OK' : 'LANCADO';
    await updateItem(row.id, {
      status: finalStatus,
      execucao_id: runId,
      lancado_em: DRY_RUN ? null : isoNow(),
      grm_codigo: result.recordCode ? String(result.recordCode) : null,
      grm_resposta: result,
      erro: null,
    });
    log('SUCCESS', `${row.arquivo_nome}: ${DRY_RUN ? 'payload validado sem enviar' : `lançamento salvo (código ${result.recordCode})`}.`);
    return DRY_RUN ? 'dry_run' : 'lancado';
  } catch (error) {
    await updateItem(row.id, {
      status: 'ERRO',
      execucao_id: runId,
      grm_codigo: error.grmCodigo ? String(error.grmCodigo) : undefined,
      erro: String(error.message || error).slice(0, 4000),
    });
    log('ERROR', `${row.arquivo_nome}: ${error.message}`);
    return 'erro';
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (_) { /* noop */ }
  }
}

async function runExtractOnly(filePath) {
  if (!filePath || !fs.existsSync(filePath)) throw new Error(`Arquivo não encontrado: ${filePath || '(não informado)'}`);
  const tempBase = process.env.TMPDIR || os.tmpdir();
  ensureDir(tempBase);
  const workDir = fs.mkdtempSync(path.join(tempBase, 'grm-extract-'));
  try {
    const localPath = path.join(workDir, sanitizeFileName(path.basename(filePath)));
    fs.copyFileSync(filePath, localPath);
    const row = { arquivo_nome: path.basename(filePath), setor: 'AUTO' };
    const extracted = await extractFileData(localPath, { name: row.arquivo_nome });
    const kind = detectDocumentKind(extracted, row);
    const data = kind === 'HOLERITE' ? applyPayslipRules(extracted, row) : applyInvoiceRules(extracted, row);
    data.tipo_documento_fluxo = kind;
    data.fingerprint = fingerprintOf(data);
    const validation = validateData(data);
    console.log(JSON.stringify({ tipo: kind, dados: data, validacao: validation }, null, 2));
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (_) { /* noop */ }
  }
}

async function main() {
  let runId = null;
  const stats = {
    encontrados: 0, selecionados: 0, lancados: 0, dry_run: 0, aguardando_dados: 0,
    aguardando_classificacao: 0, divididos: 0, duplicados: 0, ignorados: 0, erros: 0,
  };
  try {
    assertConfig({ extractOnly: args.extractOnly });
    if (args.extractOnly) { await runExtractOnly(args.file); return; }
    if (!scheduledEnabled && !args.force && !args.uploadId && !args.real && !args.dryRun) {
      log('INFO', 'GRM_LANCAR_NF_AGENDAR=false: execução automática desativada. Use --force, --dry-run ou --real.');
      return;
    }

    runId = await createRun();
    log('INFO', `=== Agente unificado (API) iniciado (${DRY_RUN ? 'DRY-RUN' : 'REAL'}, limite=${LIMIT}) ===`);

    let query;
    if (args.uploadId) {
      query = supabase.from(TABLE_ITEMS).select('*').eq('id', args.uploadId);
    } else {
      query = supabase.from(TABLE_ITEMS).select('*').order('created_at', { ascending: true }).limit(LIMIT);
      if (!args.force) query = query.eq('status', 'NOVO');
    }
    const { data: rows, error: listError } = await query;
    if (listError) throw listError;
    stats.encontrados = rows.length;
    stats.selecionados = rows.length;

    if (!rows.length) {
      log('INFO', 'Nenhum arquivo novo na fila.');
      await finishRun(runId, 'SUCESSO', stats, null);
      return;
    }

    grmToken = await grmLogin();
    log('SUCCESS', 'Login no GRM ok.');

    for (const row of rows) {
      const result = await processUpload(row, runId);
      if (result === 'lancado') stats.lancados += 1;
      else if (result === 'dry_run') stats.dry_run += 1;
      else if (result === 'aguardando_dados') stats.aguardando_dados += 1;
      else if (result === 'aguardando_classificacao') stats.aguardando_classificacao += 1;
      else if (result === 'dividido') stats.divididos += 1;
      else if (result === 'duplicado') stats.duplicados += 1;
      else if (result === 'erro') stats.erros += 1;
    }

    const status = stats.erros ? 'ERRO_PARCIAL' : 'SUCESSO';
    await finishRun(runId, status, stats, stats.erros ? `${stats.erros} arquivo(s) com erro.` : null);
    log(stats.erros ? 'WARN' : 'SUCCESS', `Concluído: ${safeJson(stats)}`);
    if (stats.erros) process.exitCode = 2;

    if (!args.uploadId && !DRY_RUN) {
      const { count: restantes, error: countError } = await supabase.from(TABLE_ITEMS).select('id', { count: 'exact', head: true }).eq('status', 'NOVO');
      if (!countError && restantes > 0) {
        const { error: enqueueError } = await supabase.from('grm_sync_jobs').insert({
          agente_id: 'sync-lancar-notas-fiscais', status: 'pendente', lane: 'alteracoes', solicitado_por: 'auto-continuacao',
        });
        if (enqueueError) log('WARN', `Falha ao reenfileirar próximo lote: ${enqueueError.message}`);
        else log('INFO', `Reenfileirado: ${restantes} item(ns) ainda pendente(s) na fila.`);
      }
    }
  } catch (error) {
    log('ERROR', `Erro fatal: ${error.stack || error.message}`);
    if (supabase) await finishRun(runId, 'ERRO', stats, String(error.message || error).slice(0, 4000));
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
} else {
  module.exports = {
    resolveGrmCodes, buildPayInvoicePayload, buildRateioEntry, grmLogin, apiPost,
    resolveEmpresaScpCode, resolveCategoria, resolveTipoDocumento, resolveFormaPagamento,
    resolveCoordenacao, resolveFuncionario, resolveFornecedor, loadConfig,
    applyPayslipRules, applyInvoiceRules, extractFromText, detectDocumentKind,
  };
}
