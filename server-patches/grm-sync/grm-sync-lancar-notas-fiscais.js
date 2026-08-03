#!/usr/bin/env node
'use strict';

/**
 * GRM Server - Agente unificado de documentos financeiros
 *
 * Origem:
 *   https://grao1000.com.br/painel/upload-notas-fiscais
 *   Supabase Storage: bucket notas-fiscais
 *   Fila: public.grm_nf_lancamentos (status NOVO)
 *
 * Destino:
 *   https://www.grmserver.com.br/finance/payInvoice
 *
 * O agente reconhece automaticamente:
 *   - HOLERITE: funcionário, competência, valor líquido e tipo de contrato;
 *   - NOTA FISCAL / NFS-e / DANFe / documento financeiro: fluxo fiscal atual.
 *
 * Segurança:
 *   - dry-run por padrão;
 *   - bloqueio por campos obrigatórios;
 *   - deduplicação por fingerprint;
 *   - processamento serial;
 *   - screenshot + HTML em erro;
 *   - código de saída diferente de zero em erro técnico.
 *
 * Revisão 2026-08-03.5:
 *   - seletor explícito do botão .payInvoice-act-add;
 *   - detecção do formulário por campos e botão Salvar;
 *   - anexo compatível com o botão ANEXAR ARQUIVOS e diálogo secundário;
 *   - preenchimento por keyboard.type;
 *   - localização de campos por IDs estáveis do GRM e associação label[for] -> input;
 *   - evita confundir o valor selecionado "Funcionário" do Tipo Favorecido com o campo Funcionário;
 *   - busca de funcionário por matrícula, nome completo e nome reduzido;
 *   - distinção entre o campo Funcionário principal e o campo Funcionário do Rateio.
 */

process.env.HOME = process.env.HOME || '/home/grao100';
process.env.TMP = process.env.TMP || '/home/grao100/chrome-runtime/tmp';
process.env.TEMP = process.env.TEMP || '/home/grao100/chrome-runtime/tmp';
process.env.TMPDIR = process.env.TMPDIR || '/home/grao100/chrome-runtime/tmp';
process.env.XDG_RUNTIME_DIR = process.env.XDG_RUNTIME_DIR || '/home/grao100/chrome-runtime/tmp';
process.env.XDG_CACHE_HOME = process.env.XDG_CACHE_HOME || '/home/grao100/chrome-runtime/cache';
process.env.XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME || '/home/grao100/chrome-runtime/config';
process.env.MALLOC_ARENA_MAX = process.env.MALLOC_ARENA_MAX || '2';

try { require('dotenv').config(); } catch (_) { /* dotenv é opcional no modo --extract-only */ }

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const childProcess = require('child_process');
const util = require('util');
let puppeteer = null;
let createClient = null;

function loadRuntimeDependencies() {
  if (!puppeteer) {
    puppeteer = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteer.use(StealthPlugin());
  }
  if (!createClient) ({ createClient } = require('@supabase/supabase-js'));
}
const execFile = util.promisify(childProcess.execFile);

const GRM_URL = process.env.GRM_LANCAR_NF_URL || 'https://www.grmserver.com.br/finance/payInvoice';
const LOGIN_URL = process.env.GRM_LOGIN_URL || 'https://www.grmserver.com.br/login';
const TABLE_ITEMS = process.env.GRM_LANCAR_NF_TABLE || 'grm_nf_lancamentos';
const TABLE_RUNS = process.env.GRM_LANCAR_NF_RUNS_TABLE || 'grm_nf_lancamento_execucoes';
const CONFIG_PATH = process.env.GRM_LANCAR_NF_CONFIG || path.join(__dirname, 'config', 'grm-lancar-notas-fiscais.json');
const MAX_PER_RUN = positiveInt(process.env.GRM_LANCAR_NF_MAX_POR_EXECUCAO, 5);
const REQUIRE_ATTACHMENT = envBool('GRM_LANCAR_NF_EXIGIR_ANEXO', true);
const DEBUG = envBool('GRM_LANCAR_NF_DEBUG', false);
const DEBUG_DIR = process.env.GRM_LANCAR_NF_DEBUG_DIR || path.join(os.tmpdir(), 'grm-lancar-notas-fiscais-debug');
const OCR_PDF_MAX_PAGES = positiveInt(process.env.GRM_LANCAR_NF_OCR_PDF_MAX_PAGINAS, 6);
const GRM_USER = process.env.GRMSERVER_USER || '';
const GRM_PASSWORD = process.env.GRMSERVER_PASSWORD || '';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SB_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SB_SERVICE_KEY || process.env.SUPABASE_KEY || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_OCR_MODEL = process.env.GRM_LANCAR_NF_GROQ_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';

const args = parseArgs(process.argv.slice(2));
const scheduledEnabled = envBool('GRM_LANCAR_NF_AGENDAR', false);
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

let browserAtual = null;
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
  const out = {
    dryRun: false,
    real: false,
    force: false,
    debug: false,
    limit: null,
    uploadId: null,
    file: null,
    extractOnly: false,
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
  loadRuntimeDependencies();
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  if (!GRM_USER || !GRM_PASSWORD) throw new Error('Configure GRMSERVER_USER e GRMSERVER_PASSWORD.');
  if (!GROQ_API_KEY) log('WARN', 'GROQ_API_KEY não configurada: imagens e PDFs escaneados sem texto não poderão ser reconhecidos.');
  if (!config.empresas.length) log('WARN', 'config.empresas está vazio. Documentos sem empresa reconhecida ficarão pendentes.');
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

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
        if (responseType === 'buffer') {
          resolve(buffer);
          return;
        }
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
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
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
  try {
    await execFile('bash', ['-lc', `command -v ${command}`]);
    return true;
  } catch (_) {
    return false;
  }
}

async function extractPdfText(pdfPath) {
  if (!await commandExists('pdftotext')) return '';
  try {
    const result = await execFile('pdftotext', ['-layout', '-enc', 'UTF-8', pdfPath, '-'], {
      maxBuffer: 30 * 1024 * 1024,
    });
    return String(result.stdout || '').trim();
  } catch (error) {
    log('WARN', `pdftotext falhou para ${path.basename(pdfPath)}: ${error.message}`);
    return '';
  }
}

async function groqOcrImage(imagePath) {
  if (!GROQ_API_KEY) throw new Error('Configure GROQ_API_KEY para OCR de imagem/PDF escaneado.');
  const ext = extensionOf(imagePath).replace('.', '') || 'png';
  const mimeType = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  }[ext] || 'image/png';
  const content = fs.readFileSync(imagePath).toString('base64');
  const prompt = 'Transcreva literalmente todo o texto visível neste documento financeiro, fiscal ou trabalhista (nota fiscal, DANFe, NFS-e, comprovante ou holerite), sem resumir e sem interpretar. Responda apenas com o texto transcrito, sem markdown.';
  const body = JSON.stringify({
    model: GROQ_OCR_MODEL,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${content}` } },
      ],
    }],
    temperature: 0,
    max_tokens: 8192,
  });
  const response = await httpRequest({
    method: 'POST',
    hostname: 'api.groq.com',
    path: '/openai/v1/chat/completions',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  }, body, 'json');
  const text = response?.choices?.[0]?.message?.content || '';
  if (!text) throw new Error(`Groq não retornou texto para ${path.basename(imagePath)}.`);
  return text;
}

async function ocrPdf(pdfPath, workDir) {
  if (!await commandExists('pdftoppm')) throw new Error('PDF sem texto e pdftoppm indisponível. Instale poppler-utils.');
  const prefix = path.join(workDir, 'pagina');
  await execFile('pdftoppm', [
    '-f', '1', '-l', String(OCR_PDF_MAX_PAGES), '-r', '160', '-png', pdfPath, prefix,
  ], { maxBuffer: 30 * 1024 * 1024 });
  const images = fs.readdirSync(workDir)
    .filter((name) => /^pagina-\d+\.png$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
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
  const matches = String(text || '').match(/\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/]?\d{4}[-\s]?\d{2}\b/g) || [];
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
    if ((rule.keywords || []).some((keyword) => normalized.includes(normalizeText(keyword)))) {
      return rule.forma_pagamento;
    }
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
  const emissao = firstMatch(raw, [
    /(?:DATA\s+(?:DE\s+)?EMISS[ÃA]O|EMITIDA?\s+EM|DATA\s+DA\s+NOTA)\s*[:\-]?\s*(\d{2}[\/-]\d{2}[\/-]\d{4})/i,
  ]);
  const vencimento = firstMatch(raw, [
    /(?:DATA\s+(?:DE\s+)?VENCIMENTO|VENCIMENTO|VENC\.)\s*[:\-]?\s*(\d{2}[\/-]\d{2}[\/-]\d{4})/i,
  ]);
  const valorRaw = firstMatch(raw, [
    /(?:VALOR\s+TOTAL\s+DA\s+NOTA|VALOR\s+DA\s+NOTA|VALOR\s+TOTAL|TOTAL\s+A\s+PAGAR)\s*[:\-]?\s*R?\$?\s*([\d.]+,\d{2})/i,
    /(?:VALOR\s+L[IÍ]QUIDO)\s*[:\-]?\s*R?\$?\s*([\d.]+,\d{2})/i,
  ]);
  const fornecedor = firstMatch(raw, [
    /(?:RAZ[ÃA]O\s+SOCIAL|PRESTADOR(?:A)?\s+DE\s+SERVI[ÇC]OS|EMITENTE|FORNECEDOR)\s*[:\-]?\s*([^\n]{3,100})/i,
  ]);
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
  const text = normalizeText([
    row?.arquivo_nome,
    extracted?.texto_extraido,
    extracted?.natureza_operacao,
  ].filter(Boolean).join(' '));
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
  return {
    month,
    year: Number(match[2]),
    label: `${PAYROLL_MONTHS[month - 1]} ${match[2]}`,
    iso: `${match[2]}-${String(month).padStart(2, '0')}-01`,
  };
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
    /^\s*(\d{1,8})\s+([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý .'-]{4,}?)\s+(\d{5,7})\s+(\d+)\s+(\d+)\s*$/i,
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
    if (fallback) {
      unique.set(fallback[1].trim(), {
        registration: fallback[1].trim(),
        name: String(fallback[2]).replace(/\s+/g, ' ').trim(),
      });
    }
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
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      out[key] = deepMerge(out[key], value);
    } else if (value !== undefined && value !== null && value !== '') {
      out[key] = value;
    }
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
  const sourceText = normalizeText([
    extracted.texto_extraido,
    extracted.natureza_operacao,
    row.arquivo_nome,
  ].filter(Boolean).join(' '));
  for (const rule of config.setor_rules || []) {
    const contains = normalizeText(rule.setor_contains || rule.contains || '');
    if (contains && setorText.includes(contains)) data = deepMerge(data, rule.set || rule);
  }
  for (const rule of config.keyword_rules || []) {
    if ((rule.keywords || []).some((keyword) => sourceText.includes(normalizeText(keyword)))) {
      data = deepMerge(data, rule.set || rule);
    }
  }
  if (!data.data_conta) data.data_conta = data.data_emissao;
  if (!data.data_vencimento && Array.isArray(data.parcelas) && data.parcelas.length === 1) {
    data.data_vencimento = data.parcelas[0].vencimento;
  }
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
  if (data.rateio?.valor == null || Math.abs(data.rateio.valor - data.valor_total) > 0.01) {
    missing.push('rateio.valor deve ser igual ao valor_total');
  }
  if (!data.grupo_categoria || /^PREENCHER/i.test(String(data.grupo_categoria))) classificationMissing.push('grupo_categoria');
  if (!data.categoria || /^PREENCHER/i.test(String(data.categoria))) classificationMissing.push('categoria');
  if (data.tipo_documento_fluxo === 'HOLERITE') {
    if (!data.funcionario_registro) missing.push('funcionario_registro');
    if (!data.funcionario_nome) missing.push('funcionario_nome');
    if (!data.competencia_iso) missing.push('competencia');
    if (!data.tipo_contrato) classificationMissing.push('tipo_contrato Mensalista/Intermitente');
    if (Array.isArray(data.funcionarios_encontrados) && data.funcionarios_encontrados.length > 1) {
      missing.push('PDF contém mais de um funcionário; envie um arquivo por funcionário');
    }
  }
  if (Array.isArray(data.parcelas) && data.parcelas.length > 1 && normalizeText(data.intervalo_cobranca) === 'NAO PARCELAR') {
    missing.push('parcelas múltiplas exigem intervalo e quantidade revisados');
  }
  return { missing, classificationMissing, ok: !missing.length && !classificationMissing.length };
}

async function createRun() {
  const payload = {
    status: 'INICIADO',
    dry_run: DRY_RUN,
    iniciado_em: isoNow(),
    resumo: { limit: LIMIT, upload_id: args.uploadId || null },
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
  const { data, error } = await supabase.from(TABLE_ITEMS)
    .update({ updated_at: isoNow(), ...patch })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function loginGrm(page) {
  log('INFO', 'Iniciando login no GRM...');
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  if (!page.url().includes('/login')) {
    log('SUCCESS', 'Sessão do GRM já autenticada.');
    return;
  }
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

async function pageHasDialog(page, title) {
  return page.evaluate((wanted) => {
    const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
    };
    const hasAccountForm = (el) => {
      const text = norm(el.innerText || el.textContent);
      const buttonTexts = Array.from(el.querySelectorAll('button, [role="button"]'))
        .filter(visible)
        .map((button) => norm(button.innerText || button.textContent || button.getAttribute('aria-label')));
      const hasSave = buttonTexts.some((textButton) => textButton === 'SALVAR' || textButton.includes('SALVAR'));
      const formSignals = ['EMPRESA', 'DATA DA CONTA', 'DATA DE VENCIMENTO', 'FAVORECIDO', 'FORNECEDOR', 'FUNCIONARIO']
        .filter((signal) => text.includes(signal)).length;
      return hasSave && formSignals >= 2;
    };
    const overlays = Array.from(document.querySelectorAll('.v-overlay--active, [role="dialog"], .modal.show, .v-dialog'))
      .filter(visible);
    const wantedNorm = norm(wanted);
    return overlays.some((el) => {
      const text = norm(el.innerText || el.textContent);
      if (wantedNorm && text.includes(wantedNorm)) return true;
      return wantedNorm === 'NOVA CONTA' && hasAccountForm(el);
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

  const primarySelector = '.payInvoice-act-add button:not([disabled])';
  const alternativeSelectors = [
    '.payInvoice-act-add',
    'button:has(lord-icon[src*="plus-to-square"])',
    'button:has(lord-icon[src*="plus"])',
  ];

  const clickSelector = async (selector) => {
    const handle = await page.$(selector);
    if (!handle) return false;
    const clickable = await page.evaluate((el) => {
      const target = el.matches('button, [role="button"]') ? el : (el.querySelector('button, [role="button"]') || el);
      const r = target.getBoundingClientRect();
      const st = getComputedStyle(target);
      if (r.width <= 2 || r.height <= 2 || st.display === 'none' || st.visibility === 'hidden') return null;
      target.scrollIntoView({ block: 'center', inline: 'center' });
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, handle);
    if (!clickable) return false;
    await page.mouse.move(2, 2);
    await page.keyboard.press('Escape').catch(() => {});
    await wait(100);
    await page.mouse.click(clickable.x, clickable.y);
    return true;
  };

  let clicked = await clickSelector(primarySelector);
  if (!clicked) {
    for (const selector of alternativeSelectors) {
      if (await clickSelector(selector)) {
        clicked = true;
        break;
      }
    }
  }

  if (!clicked) {
    const diagnostics = await page.evaluate(() => ({
      payInvoiceAdd: document.querySelectorAll('.payInvoice-act-add').length,
      payInvoiceAddButton: document.querySelectorAll('.payInvoice-act-add button').length,
      plusIcons: document.querySelectorAll('lord-icon[src*="plus"], [class*="plus"]').length,
      visibleButtons: Array.from(document.querySelectorAll('button')).filter((el) => {
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return r.width > 2 && r.height > 2 && st.display !== 'none' && st.visibility !== 'hidden';
      }).length,
    }));
    throw new Error(`Botão Adicionar (+) não encontrado em Contas a Pagar. Diagnóstico: ${JSON.stringify(diagnostics)}`);
  }

  const firstWaitStarted = Date.now();
  while (Date.now() - firstWaitStarted < 5000) {
    if (await pageHasDialog(page, 'NOVA CONTA')) return;
    await wait(250);
  }

  log('WARN', 'Primeiro clique no botão Adicionar não abriu o formulário; tentando clique direto no controle do GRM.');
  const forced = await page.evaluate(() => {
    const wrapper = document.querySelector('.payInvoice-act-add');
    const button = wrapper?.querySelector('button:not([disabled])');
    const target = button || wrapper;
    if (!target) return false;
    target.scrollIntoView({ block: 'center', inline: 'center' });
    target.click();
    return true;
  });
  if (!forced) throw new Error('Botão Adicionar (+) desapareceu antes da segunda tentativa.');

  await waitDialog(page, 'NOVA CONTA', 20000);
}

async function locateField(page, label, dialogTitle, options = {}) {
  return page.evaluate((payload) => {
    const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
    const visible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
    };
    const overlays = Array.from(document.querySelectorAll('.v-overlay--active, [role="dialog"], .modal.show, .v-dialog')).filter(visible);
    const hasAccountForm = (el) => {
      const text = norm(el.innerText || el.textContent);
      const buttons = Array.from(el.querySelectorAll('button, [role="button"]')).filter(visible);
      const hasSave = buttons.some((button) => norm(button.innerText || button.textContent || button.getAttribute('aria-label')).includes('SALVAR'));
      const signals = ['EMPRESA', 'DATA DA CONTA', 'DATA DE VENCIMENTO', 'FAVORECIDO', 'FORNECEDOR', 'FUNCIONARIO']
        .filter((signal) => text.includes(signal)).length;
      return hasSave && signals >= 2;
    };
    const reversed = overlays.slice().reverse();
    const scope = reversed.find((el) => norm(el.innerText).includes(norm(payload.dialogTitle)))
      || (norm(payload.dialogTitle) === 'NOVA CONTA' ? reversed.find(hasAccountForm) : null)
      || document;
    const wanted = norm(payload.label);

    const candidates = [];
    const addCandidate = (target, labelEl, source) => {
      if (!target || !visible(target)) return;
      if (!target.matches('input, textarea, [contenteditable="true"], [role="combobox"]')) {
        target = target.querySelector?.('input, textarea, [contenteditable="true"], [role="combobox"]');
      }
      if (!target || !visible(target)) return;
      if (candidates.some((item) => item.target === target)) return;
      candidates.push({
        target,
        labelEl,
        source,
        disabled: Boolean(target.disabled || target.getAttribute('aria-disabled') === 'true'),
      });
    };

    // O GRM utiliza IDs estáveis nos campos principais da Nova Conta.
    // Usar estes IDs antes da busca visual evita falhas quando o Vuetify oculta
    // temporariamente o label flutuante após anexar arquivos ou atualizar o modal.
    const knownFieldIds = {
      EMPRESA: ['scpCode'],
      IDENTIFICACAO: ['pinTitle'],
      'DATA DA CONTA': ['pinDate'],
      'TIPO FAVORECIDO': ['typeFavored'],
      FUNCIONARIO: ['staCode'],
      'GRUPO DE CATEGORIA': ['payInvoiceMainCategory'],
      CATEGORIA: ['picCode'],
      'DATA DE VENCIMENTO': ['pinDueDate'],
      'INTERVALO DE COBRANCA': ['pinInstallmentInterval'],
      'QTD. PARCELAS': ['pinInstallmentTotal'],
      'QTD PARCELAS': ['pinInstallmentTotal'],
      'TIPO DE DOCUMENTO': ['pdtCode'],
      'N. DO DOCUMENTO': ['pinDocNumber'],
      'N DO DOCUMENTO': ['pinDocNumber'],
      'FORMA DE PAGAMENTO': ['patCode'],
      DESCRICAO: ['pinDescription'],
    };

    // Busca direta e relaxada pelos IDs conhecidos. Alguns inputs do Vuetify podem
    // ficar com opacidade/estilo transitório durante a atualização do modal, embora
    // continuem visíveis e interativos. Por isso, nesta etapa não usamos o filtro
    // estrito de opacity aplicado aos fallbacks visuais.
    for (const id of knownFieldIds[wanted] || []) {
      const directCandidates = Array.from(document.querySelectorAll('[id]'))
        .filter((el) => el.id === id);
      const scopedCandidates = Array.from(scope.querySelectorAll('[id]'))
        .filter((el) => el.id === id);
      const ordered = [...scopedCandidates, ...directCandidates]
        .filter((el, index, array) => array.indexOf(el) === index);

      for (const direct of ordered) {
        let target = direct;
        if (!target.matches('input, textarea, [contenteditable="true"], [role="combobox"]')) {
          target = target.querySelector?.('input, textarea, [contenteditable="true"], [role="combobox"]');
        }
        if (!target) continue;

        const disabled = Boolean(target.disabled || target.getAttribute('aria-disabled') === 'true');
        const targetStyle = getComputedStyle(target);
        const targetRect = target.getBoundingClientRect();
        const wrapper = target.closest('.v-field, .v-input, .form-group, .field');
        const wrapperStyle = wrapper ? getComputedStyle(wrapper) : null;
        const wrapperRect = wrapper ? wrapper.getBoundingClientRect() : null;

        const targetUsable = targetRect.width > 1 && targetRect.height > 1
          && targetStyle.display !== 'none' && targetStyle.visibility !== 'hidden';
        const wrapperUsable = wrapperRect && wrapperRect.width > 1 && wrapperRect.height > 1
          && wrapperStyle.display !== 'none' && wrapperStyle.visibility !== 'hidden';

        const clickRect = targetUsable ? targetRect : (wrapperUsable ? wrapperRect : null);
        if (!clickRect) continue;

        target.scrollIntoView({ block: 'center', inline: 'center' });
        return {
          x: clickRect.x + Math.max(10, clickRect.width / 2),
          y: clickRect.y + clickRect.height / 2,
          disabled,
          id: target.id || id,
          source: 'known-id-direct',
          matches: ordered.length,
        };
      }
    }

    // Prioridade adicional: associação semântica label[for] -> input#id. Isso evita confundir
    // o texto selecionado "Funcionário" dentro de "Tipo Favorecido" com o rótulo
    // real do campo Funcionário.
    const labels = Array.from(scope.querySelectorAll('label, .v-label'))
      .filter(visible)
      .filter((el) => norm(el.textContent) === wanted);

    for (const labelEl of labels) {
      const forId = labelEl.getAttribute('for');
      if (forId) {
        const byId = Array.from(scope.querySelectorAll('[id]')).filter((el) => el.id === forId);
        for (const target of byId) addCandidate(target, labelEl, 'label-for');
      }

      let container = labelEl.closest('.v-input, .v-field, .form-group, .field, [class*="input"]');
      if (!container) container = labelEl.parentElement;
      addCandidate(container, labelEl, 'label-container');
    }

    // Fallback estrito por atributos, sem usar div/span com o valor selecionado.
    if (!candidates.length) {
      const attributeNodes = Array.from(scope.querySelectorAll(
        'input[aria-label], textarea[aria-label], [role="combobox"][aria-label], input[placeholder], textarea[placeholder]'
      )).filter(visible);
      for (const target of attributeNodes) {
        const descriptor = norm(
          target.getAttribute('aria-label')
          || target.getAttribute('placeholder')
          || target.getAttribute('name')
          || ''
        );
        if (descriptor === wanted) addCandidate(target, null, 'attribute');
      }
    }

    if (!candidates.length) return null;

    const enabled = candidates.filter((item) => !item.disabled);
    const pool = enabled.length ? enabled : candidates;
    const chosen = payload.occurrence === 'last' ? pool[pool.length - 1] : pool[0];
    const r = chosen.target.getBoundingClientRect();
    return {
      x: r.x + Math.max(10, r.width / 2),
      y: r.y + r.height / 2,
      disabled: chosen.disabled,
      id: chosen.target.id || null,
      source: chosen.source,
      matches: candidates.length,
    };
  }, {
    label,
    dialogTitle,
    occurrence: options.occurrence || 'first',
  });
}

async function waitForInteractiveField(page, label, dialogTitle = 'NOVA CONTA', options = {}) {
  const timeoutMs = Number(options.timeoutMs || 10000);
  const started = Date.now();
  let lastField = null;
  while (Date.now() - started < timeoutMs) {
    lastField = await locateField(page, label, dialogTitle, options);
    if (lastField && !lastField.disabled) return lastField;
    await wait(250);
  }
  if (lastField?.disabled) {
    throw new Error(`Campo "${label}" permaneceu desabilitado por ${timeoutMs}ms.`);
  }
  return null;
}

async function typeField(page, label, value, dialogTitle = 'NOVA CONTA', options = {}) {
  const field = await waitForInteractiveField(page, label, dialogTitle, options);
  if (!field) throw new Error(`Campo "${label}" não encontrado.`);

  // Quando o campo possui ID conhecido, força foco diretamente no input antes do
  // clique por coordenada. Isso contorna estados transitórios do Vuetify em que o
  // input existe no DOM, mas o rótulo/overlay ainda está sendo recalculado.
  if (field.id) {
    await page.evaluate((id) => {
      const candidates = Array.from(document.querySelectorAll('[id]')).filter((el) => el.id === id);
      const target = candidates.find((el) => {
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return r.width > 1 && r.height > 1 && st.display !== 'none' && st.visibility !== 'hidden';
      }) || candidates[0];
      if (!target) return;
      target.scrollIntoView({ block: 'center', inline: 'center' });
      if (typeof target.focus === 'function') target.focus();
    }, field.id);
  }

  await page.mouse.click(field.x, field.y);
  log('DEBUG', `Campo "${label}" localizado via ${field.source || 'fallback'}${field.id ? ` (#${field.id})` : ''}.`);
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(String(value), { delay: 20 });
  await page.keyboard.press('Tab');
  await wait(180);
}

async function selectOptionOpen(page, target, mode = 'contains', minDigits = 8, controlSelector = null) {
  const clicked = await page.evaluate((payload) => {
    const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
    const visible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && st.display !== 'none' && st.visibility !== 'hidden';
    };
    const rawTargets = Array.isArray(payload.target) ? payload.target : [payload.target];
    const targets = rawTargets
      .map((value) => ({
        raw: String(value || ''),
        normalized: norm(value),
        digits: String(value || '').replace(/\D/g, ''),
      }))
      .filter((value) => value.normalized || value.digits);

    const roots = [];
    const addRoot = (el) => {
      if (!el || roots.includes(el)) return;
      roots.push(el);
    };

    if (payload.controlSelector) {
      const control = document.querySelector(payload.controlSelector);
      if (control) {
        const wrapper = control.closest('.v-field,[role="combobox"],.v-input') || control.parentElement;
        const controlsId = control.getAttribute('aria-controls') || wrapper?.getAttribute('aria-controls');
        if (controlsId) addRoot(document.getElementById(controlsId));
      }
    }

    Array.from(document.querySelectorAll(
      '.v-overlay--active, [role="listbox"], .menuable__content__active, .v-overlay__content'
    )).filter(visible).reverse().forEach(addRoot);

    addRoot(document);

    for (const root of roots) {
      const options = Array.from(root.querySelectorAll(
        '[role="option"], .v-list-item, li, [class*="option"]'
      )).filter(visible);

      for (const option of options) {
        const rawText = String(option.innerText || option.textContent || '');
        const text = norm(rawText);
        if (!text) continue;
        const textDigits = rawText.replace(/\D/g, '');

        let match = payload.mode === 'first';
        if (!match) {
          match = targets.some((wanted) => {
            const digitMatch = wanted.digits.length >= payload.minDigits
              && (payload.mode === 'exact' ? textDigits === wanted.digits : textDigits.includes(wanted.digits));
            if (payload.mode === 'exact') return text === wanted.normalized || digitMatch;
            return text === wanted.normalized
              || text.includes(wanted.normalized)
              || wanted.normalized.includes(text)
              || digitMatch;
          });
        }

        if (match) {
          option.scrollIntoView({ block: 'center', inline: 'nearest' });
          const r = option.getBoundingClientRect();
          return {
            x: r.x + r.width / 2,
            y: r.y + r.height / 2,
            text: rawText.trim(),
          };
        }
      }
    }
    return null;
  }, {
    target,
    mode,
    minDigits: Number(minDigits || 8),
    controlSelector,
  });
  if (!clicked) return null;
  await page.mouse.click(clicked.x, clicked.y);
  await wait(550);
  return clicked.text;
}

async function selectField(page, label, target, options = {}) {
  const dialogTitle = options.dialogTitle || 'NOVA CONTA';
  const field = await waitForInteractiveField(page, label, dialogTitle, options);
  if (!field) throw new Error(`Campo de seleção "${label}" não encontrado.`);
  await page.mouse.click(field.x, field.y);
  await wait(500);

  if (options.search !== undefined && options.search !== null && String(options.search).trim()) {
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(String(options.search), { delay: 25 });
    await wait(Number(options.searchWaitMs || 1200));
  }

  const selected = await selectOptionOpen(
    page,
    target,
    options.mode || 'contains',
    options.minDigits || 8
  );
  if (!selected) {
    await page.keyboard.press('Escape');
    const targets = Array.isArray(target) ? target.join(' / ') : target;
    throw new Error(`Opção "${targets}" não encontrada no campo "${label}".`);
  }
  return selected;
}

async function selectEmployeeField(page, data) {
  const name = String(data.funcionario_nome || data.fornecedor || '').trim();
  const registration = String(data.funcionario_registro || '').trim();
  const targets = [name, registration].filter(Boolean);
  const shortName = name.split(/\s+/).slice(0, 2).join(' ');
  const searches = Array.from(new Set([registration, name, shortName].filter(Boolean)));
  let lastError = null;

  for (const search of searches) {
    try {
      const selected = await selectField(page, 'Funcionário', targets, {
        search,
        mode: 'contains',
        minDigits: 3,
        timeoutMs: 12000,
        searchWaitMs: 1500,
        occurrence: 'first',
      });
      log('DEBUG', `Funcionário selecionado no GRM: "${selected}" (busca: "${search}").`);
      return selected;
    } catch (error) {
      lastError = error;
      try { await page.keyboard.press('Escape'); } catch (_) { /* best effort */ }
      await wait(400);
    }
  }

  throw new Error(
    `Funcionário "${name || registration}" não encontrado no GRM após buscas por matrícula e nome`
    + (lastError ? `: ${lastError.message}` : '.')
  );
}

async function clickTextButton(page, text, dialogTitle = 'NOVA CONTA') {
  const point = await page.evaluate((payload) => {
    const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && st.display !== 'none' && st.visibility !== 'hidden';
    };
    const overlays = Array.from(document.querySelectorAll('.v-overlay--active, [role="dialog"], .modal.show, .v-dialog')).filter(visible);
    const hasAccountForm = (el) => {
      const text = norm(el.innerText || el.textContent);
      const buttons = Array.from(el.querySelectorAll('button, [role="button"]')).filter(visible);
      const hasSave = buttons.some((button) => norm(button.innerText || button.textContent || button.getAttribute('aria-label')).includes('SALVAR'));
      const signals = ['EMPRESA', 'DATA DA CONTA', 'DATA DE VENCIMENTO', 'FAVORECIDO', 'FORNECEDOR', 'FUNCIONARIO']
        .filter((signal) => text.includes(signal)).length;
      return hasSave && signals >= 2;
    };
    const reversed = overlays.slice().reverse();
    const scope = reversed.find((el) => norm(el.innerText).includes(norm(payload.dialogTitle)))
      || (norm(payload.dialogTitle) === 'NOVA CONTA' ? reversed.find(hasAccountForm) : null)
      || document;
    const wanted = norm(payload.text);
    const button = Array.from(scope.querySelectorAll('button, [role="button"]')).filter(visible)
      .find((el) => norm(el.innerText || el.textContent) === wanted || norm(el.getAttribute('aria-label')).includes(wanted));
    if (!button) return null;
    const r = button.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, { text, dialogTitle });
  if (!point) throw new Error(`Botão "${text}" não encontrado.`);
  await page.mouse.click(point.x, point.y);
}

async function waitForLastFileInput(page, timeoutMs = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const handles = await page.$$('input[type="file"]');
    if (handles.length) return handles[handles.length - 1];
    await wait(250);
  }
  return null;
}

async function clickAttachmentPickerButton(page) {
  return page.evaluate(() => {
    const norm = (s) => String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
    };
    const hasAccountForm = (el) => {
      const text = norm(el.innerText || el.textContent);
      const hasSave = Array.from(el.querySelectorAll('button, [role="button"]'))
        .filter(visible)
        .some((button) => norm(button.innerText || button.textContent).includes('SALVAR'));
      const signals = ['EMPRESA', 'DATA DA CONTA', 'DATA DE VENCIMENTO', 'FAVORECIDO']
        .filter((signal) => text.includes(signal)).length;
      return hasSave && signals >= 2;
    };
    const overlays = Array.from(document.querySelectorAll('.v-overlay--active, [role="dialog"], .modal.show, .v-dialog'))
      .filter(visible)
      .reverse();
    const attachmentScope = overlays.find((overlay) => !hasAccountForm(overlay)) || overlays[0] || document;
    const preferred = [
      'SELECIONAR ARQUIVO', 'SELECIONAR ARQUIVOS', 'ESCOLHER ARQUIVO', 'ESCOLHER ARQUIVOS',
      'ADICIONAR ARQUIVO', 'ADICIONAR ARQUIVOS', 'PROCURAR ARQUIVO', 'PROCURAR ARQUIVOS',
      'CARREGAR ARQUIVO', 'CARREGAR ARQUIVOS', 'UPLOAD', 'ANEXAR'
    ];
    const buttons = Array.from(attachmentScope.querySelectorAll('button, [role="button"], label'))
      .filter(visible)
      .map((el) => ({ el, text: norm(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title')) }))
      .filter((item) => item.text && item.text !== 'ANEXAR ARQUIVOS');
    let item = null;
    for (const text of preferred) {
      item = buttons.find((candidate) => candidate.text === text || candidate.text.includes(text));
      if (item) break;
    }
    if (!item) return null;
    const r = item.el.getBoundingClientRect();
    item.el.scrollIntoView({ block: 'center', inline: 'center' });
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: item.text };
  });
}

async function confirmAttachmentDialog(page, filePaths) {
  const names = filePaths.map((filePath) => path.basename(filePath));
  await wait(700);
  const action = await page.evaluate((expectedNames) => {
    const norm = (s) => String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
    };
    const hasAccountForm = (el) => {
      const text = norm(el.innerText || el.textContent);
      const hasSave = Array.from(el.querySelectorAll('button, [role="button"]'))
        .filter(visible)
        .some((button) => norm(button.innerText || button.textContent).includes('SALVAR'));
      const signals = ['EMPRESA', 'DATA DA CONTA', 'DATA DE VENCIMENTO', 'FAVORECIDO']
        .filter((signal) => text.includes(signal)).length;
      return hasSave && signals >= 2;
    };
    const overlays = Array.from(document.querySelectorAll('.v-overlay--active, [role="dialog"], .modal.show, .v-dialog'))
      .filter(visible)
      .reverse();
    const nested = overlays.find((overlay) => !hasAccountForm(overlay));
    if (!nested) return { clicked: false, attached: false, reason: 'no-nested-dialog' };
    const nestedText = norm(nested.innerText || nested.textContent);
    const attached = expectedNames.some((name) => nestedText.includes(norm(name)))
      || Array.from(nested.querySelectorAll('input[type="file"]')).some((input) => input.files && input.files.length > 0);
    const preferred = ['ANEXAR', 'ADICIONAR', 'CONFIRMAR', 'CONCLUIR', 'SALVAR', 'OK'];
    const buttons = Array.from(nested.querySelectorAll('button, [role="button"]'))
      .filter(visible)
      .map((el) => ({ el, text: norm(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title')) }))
      .filter((item) => item.text && !item.text.includes('CANCELAR') && !item.text.includes('REMOVER'));
    let item = null;
    for (const text of preferred) {
      item = buttons.find((candidate) => candidate.text === text || candidate.text.startsWith(`${text} `));
      if (item) break;
    }
    if (!item) return { clicked: false, attached, reason: 'no-confirm-button' };
    const r = item.el.getBoundingClientRect();
    item.el.scrollIntoView({ block: 'center', inline: 'center' });
    return { clicked: true, attached, x: r.x + r.width / 2, y: r.y + r.height / 2, text: item.text };
  }, names);
  if (action?.clicked) {
    await page.mouse.click(action.x, action.y);
    await wait(900);
    log('DEBUG', `Anexo confirmado no diálogo secundário pelo botão "${action.text}".`);
  }
  return action;
}

async function attachmentDiagnostics(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && st.display !== 'none' && st.visibility !== 'hidden';
    };
    return {
      fileInputs: document.querySelectorAll('input[type="file"]').length,
      activeDialogs: document.querySelectorAll('.v-overlay--active, [role="dialog"], .v-dialog').length,
      visibleButtons: Array.from(document.querySelectorAll('button, [role="button"]'))
        .filter(visible)
        .map((el) => String(el.innerText || el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(-40),
    };
  });
}

async function attachFiles(page, filePaths) {
  if (!filePaths.length) {
    if (REQUIRE_ATTACHMENT) throw new Error('Nenhum arquivo local disponível para anexar.');
    return;
  }

  // Alguns fluxos antigos já mantêm o input no DOM.
  let input = await waitForLastFileInput(page, 700);
  if (input) {
    await input.uploadFile(...filePaths);
    await wait(900);
    log('DEBUG', `Anexo enviado por input já existente: ${filePaths.map((p) => path.basename(p)).join(', ')}.`);
    return;
  }

  // No GRM atual, o botão ANEXAR ARQUIVOS cria o seletor/modal sob demanda.
  const firstChooserPromise = page.waitForFileChooser({ timeout: 6500 }).catch(() => null);
  await clickTextButton(page, 'ANEXAR ARQUIVOS', 'NOVA CONTA');
  const firstChooser = await firstChooserPromise;

  if (firstChooser) {
    await firstChooser.accept(filePaths);
    await wait(1000);
    await confirmAttachmentDialog(page, filePaths);
    log('DEBUG', `Anexo enviado pelo seletor nativo do botão ANEXAR ARQUIVOS.`);
    return;
  }

  input = await waitForLastFileInput(page, 9000);
  if (input) {
    await input.uploadFile(...filePaths);
    await wait(1000);
    await confirmAttachmentDialog(page, filePaths);
    log('DEBUG', `Anexo enviado pelo input criado após abrir ANEXAR ARQUIVOS.`);
    return;
  }

  // Alguns componentes abrem primeiro um modal e só então exibem um botão para escolher o arquivo.
  const picker = await clickAttachmentPickerButton(page);
  if (picker) {
    const secondChooserPromise = page.waitForFileChooser({ timeout: 6500 }).catch(() => null);
    await page.mouse.click(picker.x, picker.y);
    const secondChooser = await secondChooserPromise;
    if (secondChooser) {
      await secondChooser.accept(filePaths);
      await wait(1000);
      await confirmAttachmentDialog(page, filePaths);
      log('DEBUG', `Anexo enviado pelo botão secundário "${picker.text}".`);
      return;
    }
    input = await waitForLastFileInput(page, 6500);
    if (input) {
      await input.uploadFile(...filePaths);
      await wait(1000);
      await confirmAttachmentDialog(page, filePaths);
      log('DEBUG', `Anexo enviado pelo input aberto pelo botão secundário "${picker.text}".`);
      return;
    }
  }

  const diagnostics = await attachmentDiagnostics(page);
  if (REQUIRE_ATTACHMENT) {
    throw new Error(`Controle de anexo não encontrado após clicar em ANEXAR ARQUIVOS. Diagnóstico: ${JSON.stringify(diagnostics)}`);
  }
  log('WARN', `Anexo ignorado porque o controle não foi encontrado. Diagnóstico: ${JSON.stringify(diagnostics)}`);
}

async function expandRateio(page) {
  const expanded = await page.evaluate(() => {
    const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2 && getComputedStyle(el).display !== 'none';
    };
    const nodes = Array.from(document.querySelectorAll('button, [role="button"], .v-expansion-panel-header, div')).filter(visible);
    const node = nodes.find((el) => norm(el.innerText || el.textContent) === 'RATEIO');
    if (!node) return null;
    const button = node.closest('button, [role="button"], .v-expansion-panel-header') || node;
    const r = button.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!expanded) return false;
  await page.mouse.click(expanded.x, expanded.y);
  await wait(500);
  return true;
}

async function clickRateioPlus(page) {
  const point = await page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2 && getComputedStyle(el).display !== 'none';
    };
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]')).filter(visible);
    let button = buttons.find((el) => {
      const text = `${el.innerText || ''} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''}`.toUpperCase();
      return text.trim() === '+' || text.includes('ADICIONAR RATEIO') || el.querySelector('.mdi-plus, [class*="plus"]');
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

async function markControlInScope(page, payload) {
  const token = `grm-agent-${crypto.randomUUID()}`;
  const result = await page.evaluate(({ token, id, label, scopeKind, occurrence, requireEnabled }) => {
    const norm = (s) => String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
    const visible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 1 && r.height > 1 && st.display !== 'none' && st.visibility !== 'hidden';
    };
    const accountForm = (el) => {
      const text = norm(el.innerText || el.textContent);
      if (!text.includes('EMPRESA') || !text.includes('DATA DA CONTA')) return false;
      if (!text.includes('GRUPO DE CATEGORIA') || !text.includes('FORMA DE PAGAMENTO')) return false;
      return Array.from(el.querySelectorAll('button,[role="button"]'))
        .some((button) => visible(button) && norm(button.innerText || button.textContent).includes('SALVAR'));
    };
    const rateioScope = (root) => {
      const headings = Array.from(root.querySelectorAll('div,span,h1,h2,h3,h4,button,[role="button"]'))
        .filter(visible)
        .filter((el) => norm(el.innerText || el.textContent) === 'RATEIO');
      for (const heading of headings) {
        let node = heading;
        for (let i = 0; i < 10 && node; i += 1, node = node.parentElement) {
          const text = norm(node.innerText || node.textContent);
          if (text.includes('RATEIO') && (text.includes('DATA PARTICIPACAO') || text.includes('TIPO PARTICIPACAO') || text.includes('VALOR'))) {
            return node;
          }
        }
      }
      return null;
    };

    const dialogs = Array.from(document.querySelectorAll('.v-overlay--active,[role="dialog"],.v-dialog,.modal.show'))
      .filter(visible)
      .reverse();
    const account = dialogs.find(accountForm) || Array.from(document.querySelectorAll('body *')).filter(visible).reverse().find(accountForm) || document;
    const scope = scopeKind === 'rateio' ? (rateioScope(account) || account) : account;

    let candidates = [];
    if (id) {
      candidates = Array.from(scope.querySelectorAll('[id]')).filter((el) => el.id === id);
    }
    if (!candidates.length && label) {
      const wanted = norm(label);
      const labels = Array.from(scope.querySelectorAll('label,.v-label'))
        .filter((el) => norm(el.textContent) === wanted);
      for (const labelEl of labels) {
        const forId = labelEl.getAttribute('for');
        if (forId) {
          candidates.push(...Array.from(scope.querySelectorAll('[id]')).filter((el) => el.id === forId));
        }
        let container = labelEl.closest('.v-input,.v-field,.form-group,.field,[class*="input"]') || labelEl.parentElement;
        if (container) candidates.push(container);
      }
    }

    const normalized = [];
    for (let candidate of candidates) {
      if (!candidate.matches('input,textarea,select,[role="combobox"],[contenteditable="true"]')) {
        candidate = candidate.querySelector('input,textarea,select,[role="combobox"],[contenteditable="true"]') || candidate;
      }
      if (!candidate) continue;
      if (normalized.includes(candidate)) continue;
      normalized.push(candidate);
    }

    let usable = normalized.filter((el) => visible(el));
    if (!usable.length) usable = normalized;
    if (requireEnabled) {
      const enabled = usable.filter((el) => !el.disabled && el.getAttribute('aria-disabled') !== 'true');
      if (enabled.length) usable = enabled;
    }
    if (!usable.length) return { ok: false, reason: 'not-found', id, label, scopeKind };

    const target = occurrence === 'last' ? usable[usable.length - 1] : usable[0];
    if (requireEnabled && (target.disabled || target.getAttribute('aria-disabled') === 'true')) {
      return { ok: false, reason: 'disabled', id, label, scopeKind };
    }
    target.setAttribute('data-grm-agent-target', token);
    target.scrollIntoView({ block: 'center', inline: 'center' });
    return {
      ok: true,
      token,
      tag: target.tagName,
      type: target.getAttribute('type'),
      role: target.getAttribute('role'),
      actualId: target.id || null,
      disabled: Boolean(target.disabled || target.getAttribute('aria-disabled') === 'true'),
    };
  }, {
    token,
    id: payload.id || null,
    label: payload.label || null,
    scopeKind: payload.scopeKind || 'account',
    occurrence: payload.occurrence || 'first',
    requireEnabled: payload.requireEnabled !== false,
  });
  if (!result?.ok) return null;
  return { selector: `[data-grm-agent-target="${token}"]`, ...result };
}

async function waitMarkedControl(page, payload, timeoutMs = 12000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await markControlInScope(page, payload);
    if (last) return last;
    await wait(250);
  }
  const name = payload.label || payload.id || 'campo';
  throw new Error(`Campo "${name}" não encontrado ou permaneceu desabilitado por ${timeoutMs}ms.`);
}

async function setMarkedText(page, field, value, label) {
  const expected = String(value == null ? '' : value);
  const changed = await page.evaluate(({ selector, value }) => {
    const el = document.querySelector(selector);
    if (!el) return { ok: false, reason: 'missing' };
    el.scrollIntoView({ block: 'center', inline: 'center' });
    if (typeof el.focus === 'function') el.focus();
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor?.set) descriptor.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return { ok: true, value: el.value };
  }, { selector: field.selector, value: expected });
  if (!changed?.ok) throw new Error(`Não foi possível preencher o campo "${label}".`);
  await wait(220);
  log('DEBUG', `Campo "${label}" preenchido diretamente${field.actualId ? ` (#${field.actualId})` : ''}.`);
}

async function setAccountTextById(page, id, value, label) {
  const field = await waitMarkedControl(page, { id, label, scopeKind: 'account' });
  await setMarkedText(page, field, value, label);
}

async function setScopedTextByLabel(page, label, value, scopeKind = 'rateio', occurrence = 'first') {
  const field = await waitMarkedControl(page, { label, scopeKind, occurrence });
  await setMarkedText(page, field, value, label);
}

async function selectMarkedControl(page, field, target, options = {}) {
  const targets = (Array.isArray(target) ? target : [target])
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const minDigits = Number(options.minDigits || 8);

  const matchesTarget = (candidate) => {
    const normalizedCandidate = normalizeText(candidate);
    const candidateDigits = String(candidate || '').replace(/\D/g, '');
    return targets.some((wanted) => {
      const normalizedWanted = normalizeText(wanted);
      const wantedDigits = String(wanted).replace(/\D/g, '');
      const textMatch = normalizedWanted
        && (normalizedCandidate === normalizedWanted
          || normalizedCandidate.includes(normalizedWanted)
          || normalizedWanted.includes(normalizedCandidate));
      const digitMatch = wantedDigits.length >= minDigits && candidateDigits.includes(wantedDigits);
      return textMatch || digitMatch;
    });
  };

  const readCurrentSelection = async () => page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const wrapper = el.closest('.v-input, .v-field, .form-group, .field') || el.parentElement;
    const selectedNodes = wrapper
      ? Array.from(wrapper.querySelectorAll(
        '.v-autocomplete__selection-text, .v-select__selection-text, .v-chip__content, [class*="selection-text"]'
      ))
      : [];
    const selectedText = selectedNodes
      .map((node) => String(node.innerText || node.textContent || '').trim())
      .filter(Boolean)
      .join(' ');
    const inputValue = String(el.value || el.getAttribute('value') || '').trim();
    return { selectedText, inputValue };
  }, field.selector);

  const currentSelection = await readCurrentSelection();
  if (currentSelection) {
    const candidates = [currentSelection.selectedText, currentSelection.inputValue].filter(Boolean);
    if (candidates.some(matchesTarget)) {
      const current = currentSelection.selectedText || currentSelection.inputValue || targets[0];
      log('DEBUG', `Campo${field.actualId ? ` #${field.actualId}` : ''} já estava selecionado como "${current}".`);
      return current;
    }
  }

  const trigger = await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const wrapper = el.closest('.v-field,[role="combobox"],.v-input') || el.parentElement;
    const icon = wrapper?.querySelector(
      '.v-autocomplete__menu-icon, .v-select__menu-icon, [aria-label="Open"], [title="Open"]'
    );
    const clickTarget = icon || wrapper || el;
    const r = clickTarget.getBoundingClientRect();
    return {
      x: r.x + Math.max(6, r.width / 2),
      y: r.y + Math.max(6, r.height / 2),
    };
  }, field.selector);

  if (!trigger) throw new Error(`Não foi possível abrir o campo${field.actualId ? ` #${field.actualId}` : ''}.`);
  await page.mouse.click(trigger.x, trigger.y);
  await wait(Number(options.openWaitMs || 700));

  if (options.search !== undefined && options.search !== null && String(options.search).trim()) {
    await page.evaluate((selector) => {
      const el = document.querySelector(selector);
      if (el && typeof el.focus === 'function') el.focus();
    }, field.selector);
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(String(options.search), { delay: 25 });
    await wait(Number(options.searchWaitMs || 1500));
  }

  let selected = await selectOptionOpen(
    page,
    target,
    options.mode || 'contains',
    minDigits,
    field.selector
  );

  if (!selected && targets.length) {
    await page.evaluate((selector) => {
      const el = document.querySelector(selector);
      if (!el) return;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      if (typeof el.focus === 'function') el.focus();
      if (typeof el.click === 'function') el.click();
    }, field.selector);
    await wait(250);
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(String(options.search || targets[0]), { delay: 30 });
    await wait(Number(options.searchWaitMs || 1200));
    await page.keyboard.press('ArrowDown');
    await wait(150);
    await page.keyboard.press('Enter');
    await wait(700);

    const afterKeyboard = await readCurrentSelection();
    const afterCandidates = afterKeyboard
      ? [afterKeyboard.selectedText, afterKeyboard.inputValue].filter(Boolean)
      : [];
    if (afterCandidates.some(matchesTarget)) {
      selected = afterKeyboard.selectedText || afterKeyboard.inputValue || targets[0];
      log('DEBUG', `Opção "${selected}" selecionada por teclado${field.actualId ? ` no campo #${field.actualId}` : ''}.`);
    }
  }

  if (!selected) {
    try { await page.keyboard.press('Escape'); } catch (_) { /* noop */ }
    const targetLabel = targets.join(' / ');
    const diagnostics = await page.evaluate((selector) => {
      const el = document.querySelector(selector);
      if (!el) return { fieldMissing: true, options: [] };
      const wrapper = el.closest('.v-field,[role="combobox"],.v-input') || el.parentElement;
      const options = Array.from(document.querySelectorAll('[role="option"],.v-list-item'))
        .map((node) => String(node.innerText || node.textContent || '').trim())
        .filter(Boolean)
        .slice(0, 50);
      return {
        fieldMissing: false,
        expanded: el.getAttribute('aria-expanded') || wrapper?.getAttribute('aria-expanded') || null,
        controls: el.getAttribute('aria-controls') || wrapper?.getAttribute('aria-controls') || null,
        selected: wrapper?.querySelector('.v-autocomplete__selection-text,.v-select__selection-text')?.textContent?.trim() || null,
        options,
      };
    }, field.selector);
    throw new Error(`Opção "${targetLabel}" não encontrada. Diagnóstico: ${JSON.stringify(diagnostics)}`);
  }

  log('DEBUG', `Opção "${selected}" selecionada${field.actualId ? ` no campo #${field.actualId}` : ''}.`);
  return selected;
}

async function selectAccountById(page, id, target, options = {}) {
  const field = await waitMarkedControl(page, {
    id,
    label: options.label || id,
    scopeKind: 'account',
    requireEnabled: true,
  }, Number(options.timeoutMs || 12000));
  return selectMarkedControl(page, field, target, options);
}

async function selectScopedByLabel(page, label, target, options = {}) {
  const field = await waitMarkedControl(page, {
    label,
    scopeKind: options.scopeKind || 'rateio',
    occurrence: options.occurrence || 'first',
    requireEnabled: true,
  }, Number(options.timeoutMs || 12000));
  return selectMarkedControl(page, field, target, options);
}

async function selectEmployeeById(page, data, id = 'staCode', options = {}) {
  const name = String(data.funcionario_nome || data.fornecedor || '').trim();
  const registration = String(data.funcionario_registro || '').trim();
  const shortName = name.split(/\s+/).slice(0, 2).join(' ');
  const targets = [name, registration].filter(Boolean);
  const searches = Array.from(new Set([registration, name, shortName].filter(Boolean)));
  let lastError = null;

  for (const search of searches) {
    try {
      const selected = options.scopeKind === 'rateio'
        ? await selectScopedByLabel(page, 'Funcionário', targets, {
          scopeKind: 'rateio', occurrence: 'last', search, mode: 'contains', minDigits: 3,
          timeoutMs: 15000, searchWaitMs: 1600,
        })
        : await selectAccountById(page, id, targets, {
          label: 'Funcionário', search, mode: 'contains', minDigits: 3,
          timeoutMs: 15000, searchWaitMs: 1600,
        });
      log('DEBUG', `Funcionário selecionado no GRM: "${selected}" (busca: "${search}").`);
      return selected;
    } catch (error) {
      lastError = error;
      try { await page.keyboard.press('Escape'); } catch (_) { /* noop */ }
      await wait(450);
    }
  }
  throw new Error(`Funcionário "${name || registration}" não encontrado no GRM${lastError ? `: ${lastError.message}` : '.'}`);
}

async function fillAndSaveAccount(page, data, attachmentPaths) {
  await clickAddAccount(page);
  await attachFiles(page, attachmentPaths);

  // Campos principais do GRM: seleção determinística dentro do modal Nova Conta.
  await selectAccountById(page, 'scpCode', data.empresa, { label: 'Empresa', mode: 'contains' });
  await setAccountTextById(page, 'pinTitle', data.identificacao, 'Identificação');
  await setAccountTextById(page, 'pinDate', data.data_conta, 'Data da Conta');
  await selectAccountById(page, 'typeFavored', data.tipo_favorecido || 'Fornecedor', {
    label: 'Tipo Favorecido',
    search: data.tipo_favorecido || 'Fornecedor',
    mode: 'contains',
    searchWaitMs: 900,
  });

  const isEmployee = normalizeText(data.tipo_favorecido) === 'FUNCIONARIO';
  if (isEmployee) {
    await selectEmployeeById(page, data, 'staCode');
  } else {
    const favoredSearch = data.fornecedor_cnpj || data.fornecedor;
    await selectAccountById(page, 'supCode', favoredSearch, {
      label: 'Fornecedor', search: favoredSearch, mode: 'contains', minDigits: 8,
      timeoutMs: 15000, searchWaitMs: 1500,
    });
  }

  await selectAccountById(page, 'payInvoiceMainCategory', data.grupo_categoria, {
    label: 'Grupo de Categoria', search: data.grupo_categoria, mode: 'contains', searchWaitMs: 1000,
  });
  await selectAccountById(page, 'picCode', data.categoria, {
    label: 'Categoria', search: data.categoria, mode: 'contains', timeoutMs: 15000, searchWaitMs: 1000,
  });
  await setAccountTextById(page, 'pinDueDate', data.data_vencimento, 'Data de Vencimento');

  // Valor Total possui ID dinâmico no Vuetify; associação label[for] é estável.
  await setScopedTextByLabel(page, 'Valor Total', formatMoneyInput(data.valor_total), 'account');
  await selectAccountById(page, 'pinInstallmentInterval', data.intervalo_cobranca || 'Não Parcelar', {
    label: 'Intervalo de Cobrança', mode: 'contains',
  });
  await selectAccountById(page, 'pdtCode', data.tipo_documento, {
    label: 'Tipo de Documento', search: data.tipo_documento, mode: 'contains', searchWaitMs: 800,
  });
  await setAccountTextById(page, 'pinDocNumber', data.numero_documento, 'N. do Documento');
  await selectAccountById(page, 'patCode', data.forma_pagamento, {
    label: 'Forma de Pagamento', search: data.forma_pagamento, mode: 'contains', searchWaitMs: 800,
  });

  // Holerite: descrição obrigatoriamente em branco conforme regra validada.
  if (data.tipo_documento_fluxo === 'HOLERITE') {
    await setAccountTextById(page, 'pinDescription', '', 'Descrição');
  } else if (data.descricao) {
    await setAccountTextById(page, 'pinDescription', data.descricao, 'Descrição');
  }

  // Rateio: só aplicável quando o formulário atual expõe a seção "Rateio"
  // (nem todo Tipo Favorecido a exibe dentro do Nova Conta nesta instância do GRM).
  const rateioDisponivel = await expandRateio(page);
  if (rateioDisponivel) {
    await setScopedTextByLabel(page, 'Data Participação', data.rateio.data_participacao, 'rateio');
    await selectScopedByLabel(page, 'Tipo Participação', data.rateio.tipo_participacao, {
      scopeKind: 'rateio', mode: 'contains',
    });
    if (normalizeText(data.rateio.tipo_participacao) === 'FUNCIONARIO') {
      await selectEmployeeById(page, data, null, { scopeKind: 'rateio' });
    } else {
      await selectScopedByLabel(page, data.rateio.tipo_participacao, data.rateio.identificacao, {
        scopeKind: 'rateio', occurrence: 'last', search: data.rateio.identificacao,
        mode: 'contains', timeoutMs: 15000, searchWaitMs: 1400,
      });
    }
    await setScopedTextByLabel(page, 'Valor', formatMoneyInput(data.rateio.valor), 'rateio', 'last');
    await clickRateioPlus(page);
  } else {
    log('DEBUG', 'Seção "Rateio" não encontrada neste formulário — etapa ignorada.');
  }

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
    if (alert && /ERRO|OBRIGAT|INVALID|N[ÃA]O FOI POSS[IÍ]VEL/i.test(normalizeText(alert))) {
      throw new Error(`GRM recusou o lançamento: ${alert}`);
    }
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
    headless: process.env.GRM_HEADLESS === 'false' ? false : 'new',
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

async function processUpload(page, row, runId) {
  const tempBase = process.env.TMPDIR || os.tmpdir();
  ensureDir(tempBase);
  const workDir = fs.mkdtempSync(path.join(tempBase, 'grm-fin-'));
  const localPath = path.join(workDir, sanitizeFileName(row.arquivo_nome));
  try {
    await updateItem(row.id, {
      status: 'PROCESSANDO',
      execucao_id: runId,
      tentativas: Number(row.tentativas || 0) + 1,
      erro: null,
      processado_em: isoNow(),
    });

    await downloadFromStorage(row, localPath);
    const extracted = await extractFileData(localPath, { name: row.arquivo_nome });
    const documentKind = detectDocumentKind(extracted, row);
    const data = documentKind === 'HOLERITE'
      ? applyPayslipRules(extracted, row)
      : applyInvoiceRules(extracted, row);
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
      await updateItem(row.id, {
        status: 'DUPLICADO',
        execucao_id: runId,
        erro: `Fingerprint já processado no arquivo ${duplicate.arquivo_nome || duplicate.id}.`,
      });
      log('WARN', `${row.arquivo_nome}: duplicado de ${duplicate.arquivo_nome || duplicate.id}.`);
      return 'duplicado';
    }

    const documentLabel = documentKind === 'HOLERITE' ? 'Holerite' : 'NF';
    log('INFO', `${row.arquivo_nome}: ${DRY_RUN ? 'validando no GRM (dry-run)' : 'lançando no GRM'} - ${documentLabel} ${data.numero_documento}, ${data.fornecedor || data.fornecedor_cnpj}, R$ ${formatMoneyInput(data.valor_total)}.`);
    const result = await fillAndSaveAccount(page, data, [localPath]);
    const finalStatus = DRY_RUN ? 'DRY_RUN_OK' : 'LANCADO';
    await updateItem(row.id, {
      status: finalStatus,
      execucao_id: runId,
      lancado_em: DRY_RUN ? null : isoNow(),
      grm_resposta: result,
      erro: null,
    });
    log('SUCCESS', `${row.arquivo_nome}: ${DRY_RUN ? 'formulário validado sem salvar' : 'lançamento salvo'}.`);
    return DRY_RUN ? 'dry_run' : 'lancado';
  } catch (error) {
    if (page) {
      await saveDebug(page, `erro-${row.id}-${row.arquivo_nome}`);
      await closeDialogBestEffort(page);
    }
    await updateItem(row.id, {
      status: 'ERRO',
      execucao_id: runId,
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
    encontrados: 0,
    selecionados: 0,
    lancados: 0,
    dry_run: 0,
    aguardando_dados: 0,
    aguardando_classificacao: 0,
    duplicados: 0,
    ignorados: 0,
    erros: 0,
  };
  try {
    assertConfig({ extractOnly: args.extractOnly });
    if (args.extractOnly) {
      await runExtractOnly(args.file);
      return;
    }
    if (!scheduledEnabled && !args.force && !args.uploadId && !args.real && !args.dryRun) {
      log('INFO', 'GRM_LANCAR_NF_AGENDAR=false: execução automática desativada. Use --force, --dry-run ou --real.');
      return;
    }

    runId = await createRun();
    log('INFO', `=== Agente unificado iniciado (${DRY_RUN ? 'DRY-RUN' : 'REAL'}, limite=${LIMIT}) ===`);

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

    const browser = await launchBrowserIfNeeded();
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(60000);
    page.on('console', (msg) => {
      if (DEBUG || args.debug) log('BROWSER', `${msg.type()}: ${msg.text()}`);
    });
    await loginGrm(page);

    for (const row of rows) {
      const result = await processUpload(page, row, runId);
      if (result === 'lancado') stats.lancados += 1;
      else if (result === 'dry_run') stats.dry_run += 1;
      else if (result === 'aguardando_dados') stats.aguardando_dados += 1;
      else if (result === 'aguardando_classificacao') stats.aguardando_classificacao += 1;
      else if (result === 'duplicado') stats.duplicados += 1;
      else if (result === 'erro') stats.erros += 1;
    }

    const status = stats.erros ? 'ERRO_PARCIAL' : 'SUCESSO';
    await finishRun(runId, status, stats, stats.erros ? `${stats.erros} arquivo(s) com erro.` : null);
    log(stats.erros ? 'WARN' : 'SUCCESS', `Concluído: ${safeJson(stats)}`);
    if (stats.erros) process.exitCode = 2;
  } catch (error) {
    log('ERROR', `Erro fatal: ${error.stack || error.message}`);
    if (supabase) await finishRun(runId, 'ERRO', stats, String(error.message || error).slice(0, 4000));
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
