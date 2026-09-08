#!/usr/bin/env node
'use strict';

/**
 * GRM Server - Agente de baixa de pagamentos (holerite/NF) a partir de
 * comprovantes bancários (PIX/TED), via API direta do Graint — mesmo tipo
 * de migração já feito em grmserver-lancar-notas-fiscais-api.js (que só
 * ABRE o lançamento em "Contas a Pagar"; este agente faz o passo seguinte,
 * marcar como pago).
 *
 * Origem:
 *   Financeiro (painel) anexa os comprovantes em lote -> Supabase Storage
 *   (bucket notas-fiscais) -> fila public.grm_nf_baixas (status NOVO).
 *
 * Destino: https://www.grmserver.com.br/finance/payInvoice
 *   (POST /api/payInvoice/payment)
 *
 * Contrato descoberto e validado ao vivo em 08/09, só com leituras (login
 * de serviço já usado pelos outros agentes + inspeção do bundle público
 * `PayInvoice-*.js` da própria tela de Contas a Pagar do GRM, componente
 * `ClosePayment`) — nenhuma escrita foi feita em produção durante a
 * descoberta. Ver detalhes no plano radiant-leaping-clarke.md:
 *   1. user/login -> token JWT (idêntico aos demais agentes).
 *   2. payInvoice/getRecords {pinStatus:'A', moreThenOneCompany:'S'} ->
 *      lista de parcelas em aberto (mesma chamada de grmserver-contas-pagar-api.js),
 *      usada aqui pra achar o candidato certo por empresa (scpCode) + valor
 *      exato + nome do favorecido.
 *   3. payInvoice/payment (multipart, arquivo em "ppyPaidDocLinkNew") com
 *      {ppyMovBancDescription, patCode, baccCode, ppyPaidDate, paymentInfo:
 *      JSON.stringify([{pinCode, ppyPaidTax:0, ppyPaidDiscount:0,
 *      ppyPaidValue, pinPaymentType:'N'}]), pinPaymentType:'N',
 *      withDiscount:'N'} -> {result:true}. Confirmado comparando parcelas
 *      reais pinStatus 'A' vs 'P' (baixa de holerite só mexe em pinStatus,
 *      pinPaidValue, pinTotalPaidValue e ppyPaidDate — os campos de conta
 *      do destinatário ficam vazios nesse tipo de lançamento, é assim que
 *      o financeiro já opera manualmente hoje).
 *
 * baccCode/scpCode das 5 contas pagadoras (Araguaia/BV Grain/Excelência/
 * Grão1000/Graomil) ficam no config (não banco, muda raríssimo) — ver
 * config/grm-baixa-notas-fiscais.json.
 *
 * Segurança (mesmo padrão dos demais agentes de escrita):
 *   - dry-run por padrão;
 *   - deduplicação por fingerprint (hash do próprio arquivo);
 *   - match ambíguo (0 ou 2+ candidatos) NUNCA baixa sozinho — vai pra
 *     AGUARDANDO_REVISAO, só um humano confirma pela tela;
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
const TABLE_ITEMS = process.env.GRM_BAIXA_NF_TABLE || 'grm_nf_baixas';
const TABLE_RUNS = process.env.GRM_BAIXA_NF_RUNS_TABLE || 'grm_nf_baixa_execucoes';
const CONFIG_PATH = process.env.GRM_BAIXA_NF_CONFIG || path.join(__dirname, 'config', 'grm-baixa-notas-fiscais.json');
const MAX_PER_RUN = positiveInt(process.env.GRM_BAIXA_NF_MAX_POR_EXECUCAO, 20);
const GRM_USER = process.env.GRMSERVER_USER || '';
const GRM_PASSWORD = process.env.GRMSERVER_PASSWORD || '';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SB_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SB_SERVICE_KEY || process.env.SUPABASE_KEY || '';

const GRM_WEB_HEADERS = {
  origin: 'https://www.grmserver.com.br',
  referer: 'https://www.grmserver.com.br/login',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

const args = parseArgs(process.argv.slice(2));
const scheduledEnabled = envBool('GRM_BAIXA_NF_AGENDAR', false);
// Fail-safe: se a variável sumir do .env por qualquer motivo, cai em dry-run.
const dryRunEnv = envBool('GRM_BAIXA_NF_DRY_RUN', true);
const DRY_RUN = args.dryRun ? true : (args.real ? false : dryRunEnv);
const LIMIT = args.limit || MAX_PER_RUN;

let config = null;
let supabase = null;
let grmToken = null;
let openInvoicesCache = null;

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
  const out = { dryRun: false, real: false, force: false, limit: null, id: null, extractOnly: false, file: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--real') out.real = true;
    else if (a === '--force') out.force = true;
    else if (a === '--extract-only') out.extractOnly = true;
    else if (a === '--limit') out.limit = positiveInt(argv[++i], null);
    else if (a === '--id') out.id = argv[++i] || null;
    else if (a === '--file' || a === '--pdf') out.file = argv[++i] || null;
  }
  return out;
}

function log(level, message, extra) {
  const suffix = extra === undefined ? '' : ` ${safeJson(extra)}`;
  console.log(`[${level}] ${new Date().toISOString()} - ${message}${suffix}`);
}

function safeJson(value) { try { return JSON.stringify(value); } catch (_) { return String(value); } }
function safe(data) { return Array.isArray(data) ? data : []; }

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function onlyDigits(value) { return String(value || '').replace(/\D/g, ''); }

function sanitizeFileName(name) {
  return String(name || 'arquivo')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || 'arquivo';
}

function isoNow() { return new Date().toISOString(); }

function toIsoFromBR(value) {
  const m = String(value || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function parseMoneyBR(value) {
  if (value == null || value === '') return null;
  let s = String(value).replace(/[^\d,.-]/g, '').trim();
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function formatMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(value);
}

function sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }

function match(text, regex) {
  const m = String(text || '').match(regex);
  return m ? m[1].trim() : null;
}

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

function loadJson(filePath, required) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (error) {
    if (required) throw new Error(`Não consegui ler JSON ${filePath}: ${error.message}`);
    return null;
  }
}

function loadConfig() {
  config = loadJson(CONFIG_PATH, true);
  if (!Array.isArray(config.contas_pagadoras)) config.contas_pagadoras = [];
}

function assertConfig(options = {}) {
  loadConfig();
  if (options.extractOnly) return;
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  if (!GRM_USER || !GRM_PASSWORD) throw new Error('Configure GRMSERVER_USER e GRMSERVER_PASSWORD.');
  if (!config.contas_pagadoras.length) log('WARN', 'config.contas_pagadoras está vazio. Nenhum comprovante vai casar com empresa nenhuma.');
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

// ---------------------------------------------------------------------------
// HTTP genérico — mesmo padrão de grmserver-lancar-notas-fiscais-api.js.
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

function requestJson(url, method, body, headers = {}) {
  const parsed = new URL(url);
  const payload = body == null ? '' : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: parsed.protocol, hostname: parsed.hostname, port: parsed.port || 443,
      path: `${parsed.pathname}${parsed.search}`, method, timeout: 30000,
      headers: {
        accept: 'application/json', 'content-type': 'application/json',
        ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}), ...headers,
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

async function downloadFromStorage(row, targetPath) {
  const { data, error } = await supabase.storage
    .from(row.storage_bucket || 'notas-fiscais')
    .download(row.storage_path);
  if (error) throw new Error(`Falha ao baixar "${row.storage_path}" do Storage: ${error.message}`);
  const buffer = Buffer.from(await data.arrayBuffer());
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, buffer);
  return buffer;
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

// Mesmo padrão de grmserver-lancar-notas-fiscais-api.js (extractPdfPageTexts):
// pdftotext -layout separa páginas por form-feed ('\f'); descarta a página
// vazia final que sobra quando o total bate com pdfinfo.
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

// Tenta reconhecer 1 página como comprovante completo (mesma lógica de
// detectTemplate/parse usada pro arquivo inteiro, aplicada a um trecho).
function parsePageAsComprovante(pageText) {
  const template = detectTemplate(pageText);
  if (!template) return null;
  const parsed = template.parse(pageText);
  if (!parsed.valor || !parsed.dataPagamento || !parsed.favorecidoNome) return null;
  return { template, parsed };
}

// Comprovantes bancários às vezes chegam como um único PDF com 1 página por
// pagamento (o extrato "cru" antes de qualquer separação manual) — ex.:
// "Banco Itaú - Comprovante de Transferência" repetido dezenas de vezes.
// Detecta isso achando 2+ páginas que sozinhas já são um comprovante válido
// e completo (valor+data+favorecido), separa cada uma com qpdf e cria 1
// linha nova por página; a linha original vira DIVIDIDO (nunca processada
// como se fosse ela mesma 1 comprovante).
async function splitComprovanteBatch(row, localPath, workDir) {
  const pageCount = await pdfPageCount(localPath);
  if (!pageCount || pageCount < 2) return null;
  const pageTexts = await extractPdfPageTexts(localPath);
  if (pageTexts.length < 2) return null;

  const blocks = [];
  for (let i = 0; i < pageTexts.length; i += 1) {
    const found = parsePageAsComprovante(pageTexts[i]);
    if (found) blocks.push({ page: i + 1, ...found });
  }
  if (blocks.length < 2) return null;

  const created = [];
  for (const block of blocks) {
    const suffix = sanitizeFileName(`pag${block.page}-${block.parsed.favorecidoNome}`);
    const outPath = path.join(workDir, `split-${suffix}.pdf`);
    await extractPdfPageRange(localPath, block.page, block.page, outPath);
    const dir = path.dirname(row.storage_path || '');
    const storagePath = `${dir && dir !== '.' ? `${dir}/` : ''}split-${suffix}-${crypto.randomUUID()}.pdf`;
    const arquivoNome = `${stemOf(row.arquivo_nome)} - pág ${block.page} - ${block.parsed.favorecidoNome}.pdf`;
    await uploadToStorage(row.storage_bucket || 'notas-fiscais', storagePath, outPath, 'application/pdf');
    const inserted = await insertQueueItem({
      storage_bucket: row.storage_bucket || 'notas-fiscais',
      storage_path: storagePath,
      arquivo_nome: arquivoNome,
      arquivo_mime_type: 'application/pdf',
      enviado_por: row.enviado_por || null,
      status: 'NOVO',
    });
    created.push(inserted);
  }
  return created;
}

function stemOf(name) {
  return path.basename(String(name || ''), path.extname(String(name || ''))).trim() || 'comprovante';
}

// ---------------------------------------------------------------------------
// Reconhecimento de template do comprovante e extração dos campos.
// Todos os 5 formatos de exemplo (Sicredi Pix, Itaú/Sispag Pix por chave,
// Caixa Pix "app", Itaú Sispag conta-corrente->conta-corrente) são texto
// puro (sem OCR necessário) — confirmado lendo os PDFs de exemplo em 08/09.
const TEMPLATES = [
  {
    id: 'SICREDI_PIX',
    banco: 'Sicredi',
    detect: (t) => /Comprovante de Pagamento Pix/i.test(t) && /Cooperativa e conta origem/i.test(t),
    parse: (t) => {
      const origem = String(t).match(/Cooperativa e conta origem:\s*(\d+)\s*\/\s*(\d+)\s*-\s*(\d+)/i);
      return {
        valor: parseMoneyBR(match(t, /Valor:\s*R\$\s*([\d.,]+)/i)),
        dataPagamento: toIsoFromBR(match(t, /Realizado em:\s*(\d{2}\/\d{2}\/\d{4})/i)),
        favorecidoNome: match(t, /Nome do destinat[aá]rio:\s*(.+)/i),
        favorecidoDocumento: match(t, /CPF do destinat[aá]rio:\s*(.+)/i),
        cnpjPagador: match(t, /CNPJ do pagador:\s*([\d.\/-]+)/i),
        agencia: origem ? origem[1] : null,
        conta: origem ? `${origem[2]}${origem[3]}` : null,
      };
    },
  },
  {
    id: 'ITAU_SISPAG_PIX',
    banco: 'Itaú (Sispag)',
    detect: (t) => /dados do pagador/i.test(t) && /dados do recebedor/i.test(t) && /ag[eê]ncia\/conta/i.test(t),
    parse: (t) => {
      const contaOrigem = String(t).match(/ag[eê]ncia\/conta:\s*(\d+)\s*\/\s*(\d+)\s*-\s*(\d+)/i);
      return {
        valor: parseMoneyBR(match(t, /valor:\s*R\$\s*([\d.,]+)/i)),
        dataPagamento: toIsoFromBR(match(t, /data da transfer[eê]ncia:\s*(\d{2}\/\d{2}\/\d{4})/i)),
        favorecidoNome: match(t, /nome do recebedor:\s*(.+)/i),
        favorecidoDocumento: match(t, /CPF \/ CNPJ do recebedor:\s*(.+)/i),
        cnpjPagador: match(t, /CPF \/ CNPJ do pagador:\s*([\d.\/-]+)/i),
        agencia: contaOrigem ? contaOrigem[1] : null,
        conta: contaOrigem ? `${contaOrigem[2]}${contaOrigem[3]}` : null,
      };
    },
  },
  {
    // Card do app Caixa: o pdftotext -layout embaralha a ordem visual de
    // label/valor (Nome/CPF/Instituição ficam desalinhados uma linha do
    // valor correspondente, artefato de coluna). Em vez de tentar casar
    // "label perto do valor", usa âncoras de formato inconfundível (CPF
    // mascarado, CNPJ, R$, data+hora) que não mudam de posição relativa —
    // o nome do favorecido é tudo que sobra antes do CPF mascarado, dentro
    // do bloco "Recebedor".
    id: 'CAIXA_PIX_APP',
    banco: 'Caixa (Pix)',
    detect: (t) => /Comprovante de Pix/i.test(t) && /Pix enviado/i.test(t),
    parse: (t) => {
      const recebedorBlock = (String(t).match(/Recebedor([\s\S]*?)Pagador/i) || [])[1] || '';
      const pagadorBlock = (String(t).match(/Pagador([\s\S]*?)Dados da transa[cç][aã]o/i) || [])[1] || '';
      const cpfMatch = recebedorBlock.match(/\*\*\*\.\d{3}\.\d{3}-\*\*/);
      let favorecidoNome = null;
      if (cpfMatch) {
        const antes = recebedorBlock.slice(0, cpfMatch.index)
          .replace(/\bNome\b/gi, '').replace(/\bCPF\b/gi, '').replace(/\bInstitui[cç][aã]o\b/gi, '');
        // Nome longo quebra em 2+ linhas antes do CPF mascarado (ex.: "Andre
        // Gabriel Cardoso da" + "Silva") — junta todas, não só a última.
        const linhas = antes.split('\n').map((l) => l.trim()).filter(Boolean);
        favorecidoNome = linhas.length ? linhas.join(' ') : null;
      }
      return {
        valor: parseMoneyBR(match(t, /R\$\s*([\d.,]+)/i)),
        dataPagamento: toIsoFromBR(match(t, /(\d{2}\/\d{2}\/\d{4}),\s*\d{2}:\d{2}:\d{2}/i)),
        favorecidoNome,
        favorecidoDocumento: cpfMatch ? cpfMatch[0] : null,
        cnpjPagador: match(pagadorBlock, /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/),
        agencia: null,
        conta: null,
      };
    },
  },
  {
    // Comprovante TEV (Transferência Entre Contas) da Caixa — modelo
    // diferente do Pix acima, sem CNPJ nenhum impresso; a identificação da
    // conta pagadora vem da linha "Conta de débito 4379 | 1292 | ...",
    // estável entre comprovantes (confirmado em 3 exemplos de EXCELENCIA).
    id: 'CAIXA_TEV',
    banco: 'Caixa (TEV)',
    detect: (t) => /Comprovante TEV/i.test(t),
    parse: (t) => {
      const debito = String(t).match(/Conta de d[eé]bito\s*\n?\s*(\d+)\s*\|/i);
      return {
        valor: parseMoneyBR(match(t, /R\$\s*([\d.,]+)/i)),
        dataPagamento: toIsoFromBR(match(t, /Data de d[eé]bito\s*\n?\s*(\d{2}\/\d{2}\/\d{4})/i)),
        favorecidoNome: match(t, /Nome do destinat[aá]rio\s*\n\s*(.+)/i),
        favorecidoDocumento: null,
        cnpjPagador: null,
        agencia: debito ? debito[1] : null,
        conta: null,
      };
    },
  },
  {
    // "...de conta corrente para conta corrente" (maioria) OU "...para
    // conta poupança" (destinatário com conta poupança) — só a conta
    // DEBITADA (a nossa, pagadora) importa pra resolver empresa, e essa é
    // sempre corrente nos dois casos.
    id: 'ITAU_TED_INTERNO',
    banco: 'Itaú (Sispag, conta corrente)',
    detect: (t) => /Comprovante de Transfer[eê]ncia\s*\n\s*de conta corrente para conta/i.test(t),
    parse: (t) => {
      const debitBlock = (String(t).match(/Dados da conta debitada:([\s\S]*?)Dados da conta creditada:/i) || [])[1] || '';
      const creditBlock = (String(t).match(/Dados da conta creditada:([\s\S]*)/i) || [])[1] || '';
      const contaOrigem = debitBlock.match(/Ag[eê]ncia:\s*(\d+)\s*Conta corrente:\s*(\d+)\s*-\s*(\d+)/i);
      return {
        valor: parseMoneyBR(match(creditBlock, /Valor:\s*R\$\s*([\d.,]+)/i)),
        dataPagamento: toIsoFromBR(match(t, /Transfer[eê]ncia efetuada em\s*(\d{2}\/\d{2}\/\d{4})/i)),
        favorecidoNome: match(creditBlock, /Nome:\s*(.+)/i),
        favorecidoDocumento: null,
        cnpjPagador: null,
        agencia: contaOrigem ? contaOrigem[1] : null,
        conta: contaOrigem ? `${contaOrigem[2]}${contaOrigem[3]}` : null,
      };
    },
  },
  {
    // App novo do Itaú ("Comprovante de transferência" / "Dados de quem
    // está pagando" / "Dados de quem está recebendo") — layout mais limpo
    // que o ITAU_SISPAG_PIX antigo, usado em parte dos Pix de GRAOMIL.
    // O nome do favorecido às vezes já sai TRUNCADO no próprio comprovante
    // (confirmado: "ANDREZZA THAIS DE ABREU VENDRUSCOLO" virou "...VENDRU"
    // na impressão do banco) — por isso o matching por prefixo em
    // findCandidates() é necessário, não só cautela por nome de arquivo.
    id: 'ITAU_TRANSFERENCIA_APP',
    banco: 'Itaú (app)',
    detect: (t) => /Comprovante de transfer[eê]ncia/i.test(t) && /Dados de quem est[aá] pagando/i.test(t) && /Dados de quem est[aá] recebendo/i.test(t),
    parse: (t) => {
      const recebendoBlock = (String(t).match(/Dados de quem est[aá] recebendo([\s\S]*?)Dados da transa[cç][aã]o/i) || [])[1] || '';
      const contaOrigem = String(t).match(/Ag[eê]ncia e conta\s+(\d+)\/(\d+)-(\d+)/i);
      return {
        valor: parseMoneyBR(match(t, /Valor\s+R\$\s*([\d.,]+)/i)),
        dataPagamento: toIsoFromBR(match(t, /Data da transfer[eê]ncia\s+(\d{2}\/\d{2}\/\d{4})/i)),
        favorecidoNome: match(recebendoBlock, /Nome\s+(.+)/i),
        favorecidoDocumento: match(recebendoBlock, /CPF ou CNPJ\s+([\d.*-]+)/i),
        cnpjPagador: match(String(t).match(/Dados de quem est[aá] pagando([\s\S]*?)Dados de quem est[aá] recebendo/i)?.[1] || '', /CPF ou CNPJ\s+([\d.\/-]+)/i),
        agencia: contaOrigem ? contaOrigem[1] : null,
        conta: contaOrigem ? `${contaOrigem[2]}${contaOrigem[3]}` : null,
      };
    },
  },
];

function detectTemplate(texto) {
  return TEMPLATES.find((t) => t.detect(texto)) || null;
}

function resolveContaPagadora(parsed) {
  const contasConfig = config.contas_pagadoras || [];
  if (parsed.agencia && parsed.conta) {
    const agenciaDigits = onlyDigits(parsed.agencia);
    const contaDigits = onlyDigits(parsed.conta);
    const found = contasConfig.find((c) => c.match.agencia && c.match.conta
      && onlyDigits(c.match.agencia) === agenciaDigits && onlyDigits(c.match.conta) === contaDigits);
    if (found) return found;
  }
  // Sem a conta completa (ex.: comprovante TEV da Caixa, que só imprime a
  // agência na linha "Conta de débito") — casa só pela agência.
  if (parsed.agencia && !parsed.conta) {
    const agenciaDigits = onlyDigits(parsed.agencia);
    const found = contasConfig.find((c) => c.match.agencia && onlyDigits(c.match.agencia) === agenciaDigits);
    if (found) return found;
  }
  if (parsed.cnpjPagador) {
    const cnpjDigits = onlyDigits(parsed.cnpjPagador);
    const found = contasConfig.find((c) => c.match.cnpj && onlyDigits(c.match.cnpj) === cnpjDigits);
    if (found) return found;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Matching contra o GRM: 1 chamada por execução (cacheada), filtrada em
// memória por empresa (scpCode) + valor exato (tolerância de 1 centavo) +
// nome do favorecido (igual ou prefixo, pra tolerar pequenas divergências
// de acentuação/abreviação — o texto do comprovante normalmente já traz o
// nome completo, não truncado).
async function getOpenInvoicesCache() {
  if (!openInvoicesCache) {
    const response = await apiPost('payInvoice/getRecords', { pinStatus: 'A', moreThenOneCompany: 'S' });
    if (!response.result) throw new Error(`payInvoice/getRecords falhou: ${response.message || 'erro'}`);
    openInvoicesCache = safe(response.searchData);
    log('INFO', `Cache de parcelas em aberto no GRM: ${openInvoicesCache.length} registro(s).`);
  }
  return openInvoicesCache;
}

function findCandidates(openInvoices, { scpCode, valor, favorecidoNome }) {
  const alvoNome = normalizeText(favorecidoNome);
  const alvoCentavos = Math.round(Number(valor) * 100);
  return openInvoices.filter((inv) => {
    if (Number(inv.scpCode) !== Number(scpCode)) return false;
    if (Math.round(Number(inv.pinInstallmentValue) * 100) !== alvoCentavos) return false;
    const nomeInv = normalizeText(inv.favoredName);
    if (!nomeInv || !alvoNome) return false;
    return nomeInv === alvoNome || nomeInv.startsWith(alvoNome) || alvoNome.startsWith(nomeInv);
  });
}

async function findGrmNfLancamentoId(pinCode) {
  const { data, error } = await supabase.from('grm_nf_lancamentos').select('id').eq('grm_codigo', String(pinCode)).limit(1).maybeSingle();
  if (error) { log('WARN', `Não consegui buscar grm_nf_lancamentos pra pinCode ${pinCode}: ${error.message}`); return null; }
  return data?.id || null;
}

// ---------------------------------------------------------------------------
function buildPaymentPayload(resolved) {
  return {
    ppyMovBancDescription: `Pagamento ${resolved.favorecidoNome}. Doc ${resolved.pinDocNumber || resolved.pinCode}. Conta: ${resolved.pinCode}`,
    patCode: resolved.patCode,
    baccCode: resolved.baccCode,
    ppyPaidDate: resolved.dataPagamento,
    baccCodePaied: null,
    ppyAgencyPaied: null,
    ppyAccountPaied: null,
    ppyPaidDocLink: '',
    paymentInfo: JSON.stringify([{
      pinCode: Number(resolved.pinCode), ppyPaidTax: 0, ppyPaidDiscount: 0,
      ppyPaidValue: resolved.valor, pinPaymentType: 'N',
    }]),
    pinPaymentType: 'N',
    withDiscount: 'N',
  };
}

// multipart/form-data com todos os campos do payload + o comprovante em
// "ppyPaidDocLinkNew" (mesmo campo usado pelo componente ClosePayment da
// tela do GRM quando não há storage em nuvem configurado — ver cabeçalho).
async function submitPayInvoicePayment(payload, filePath, fileName) {
  const boundary = `----grmpayment${crypto.randomBytes(16).toString('hex')}`;
  const fileBuffer = fs.readFileSync(filePath);
  const parts = [];
  for (const [key, value] of Object.entries(payload)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value == null ? '' : value}\r\n`));
  }
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="ppyPaidDocLinkNew"; filename="${sanitizeFileName(fileName)}"\r\nContent-Type: application/pdf\r\n\r\n`));
  parts.push(fileBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  const body = Buffer.concat(parts);

  if (!grmToken) grmToken = await grmLogin();
  const response = await httpRequest({
    method: 'POST', hostname: 'www.grmserver.com.br', path: '/api/payInvoice/payment',
    headers: {
      ...GRM_WEB_HEADERS, authorization: `Bearer ${grmToken}`,
      'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': body.length,
    },
  }, body, 'json');
  if (!response || response.result === false) throw new Error(`payInvoice/payment falhou: ${response?.message || 'resposta sem result:true'}`);
  return response;
}

// ---------------------------------------------------------------------------
async function createRun() {
  const payload = { status: 'INICIADO', dry_run: DRY_RUN, iniciado_em: isoNow(), resumo: { limit: LIMIT, id: args.id || null } };
  const { data, error } = await supabase.from(TABLE_RUNS).insert(payload).select('id').single();
  if (error) { log('WARN', `Não consegui criar execução em ${TABLE_RUNS}: ${error.message}`); return null; }
  return data?.id || null;
}

async function finishRun(runId, status, stats, errorMessage) {
  if (!runId) return;
  const { error } = await supabase.from(TABLE_RUNS).update({ status, finalizado_em: isoNow(), resumo: stats, erro: errorMessage || null }).eq('id', runId);
  if (error) log('WARN', `Não consegui finalizar execução: ${error.message}`);
}

async function updateItem(id, patch) {
  const { data, error } = await supabase.from(TABLE_ITEMS).update({ updated_at: isoNow(), ...patch }).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

async function findDuplicateFingerprint(fingerprint, excludeId) {
  if (!fingerprint) return null;
  const { data, error } = await supabase.from(TABLE_ITEMS)
    .select('id,arquivo_nome,status')
    .eq('fingerprint', fingerprint)
    .in('status', ['VALIDADO', 'AGUARDANDO_REVISAO', 'BAIXADO'])
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) throw error;
  return (data || []).find((r) => r.id !== excludeId) || null;
}

async function marcarErro(id, runId, mensagem, extraido) {
  await updateItem(id, { status: 'ERRO', execucao_id: runId, erro: mensagem.slice(0, 4000), ...(extraido ? { extraido_json: extraido } : {}) });
}

// ---------------------------------------------------------------------------
async function processBaixa(row, runId) {
  const tempBase = process.env.TMPDIR || os.tmpdir();
  ensureDir(tempBase);
  const workDir = fs.mkdtempSync(path.join(tempBase, 'grm-baixa-'));
  const localPath = path.join(workDir, sanitizeFileName(row.arquivo_nome));
  try {
    await updateItem(row.id, { status: 'PROCESSANDO', execucao_id: runId, tentativas: Number(row.tentativas || 0) + 1, erro: null, processado_em: isoNow() });
    const buffer = await downloadFromStorage(row, localPath);

    let resolved;
    if (row.status === 'VALIDADO' && row.pin_code) {
      // Já casado antes (automático numa execução anterior, ou confirmado
      // manualmente na tela) — só falta submeter a baixa no GRM.
      resolved = {
        pinCode: row.pin_code, baccCode: row.bacc_code, patCode: row.pat_code,
        favorecidoNome: row.favorecido_nome, valor: Number(row.valor), dataPagamento: row.data_pagamento,
        pinDocNumber: row.extraido_json?.pinDocNumber || null,
      };
    } else {
      const divididos = await splitComprovanteBatch(row, localPath, workDir);
      if (divididos) {
        await updateItem(row.id, {
          status: 'DIVIDIDO', execucao_id: runId, erro: null,
          extraido_json: { paginas: divididos.length, arquivos_gerados: divididos.map((d) => d.arquivo_nome) },
        });
        log('SUCCESS', `${row.arquivo_nome}: lote com ${divididos.length} comprovante(s) — dividido em ${divididos.length} arquivo(s) individuais, ficam pro próximo ciclo.`);
        return 'dividido';
      }

      const fingerprint = sha256(buffer);
      const duplicado = await findDuplicateFingerprint(fingerprint, row.id);
      if (duplicado && !args.force) {
        await updateItem(row.id, { status: 'DUPLICADO', execucao_id: runId, fingerprint, erro: `Duplicado de ${duplicado.arquivo_nome || duplicado.id}.` });
        log('WARN', `${row.arquivo_nome}: duplicado de ${duplicado.arquivo_nome || duplicado.id}.`);
        return 'duplicado';
      }

      const texto = await extractPdfText(localPath);
      const template = detectTemplate(texto);
      if (!template) {
        await marcarErro(row.id, runId, 'Modelo de comprovante não reconhecido (nenhum template bateu).', { texto_extraido: texto.slice(0, 4000) });
        return 'erro';
      }
      const parsed = template.parse(texto);
      if (!parsed.valor || !parsed.dataPagamento || !parsed.favorecidoNome) {
        await marcarErro(row.id, runId, `Não consegui extrair valor/data/favorecido do comprovante (template ${template.id}).`, parsed);
        return 'erro';
      }

      const conta = resolveContaPagadora(parsed);
      if (!conta) {
        await marcarErro(row.id, runId, `Conta pagadora não mapeada em ${path.basename(CONFIG_PATH)} (agência/conta: ${parsed.agencia || '?'}/${parsed.conta || '?'}, CNPJ: ${parsed.cnpjPagador || '?'}).`, parsed);
        return 'erro';
      }

      const baseUpdate = {
        fingerprint,
        favorecido_nome: parsed.favorecidoNome,
        favorecido_documento: parsed.favorecidoDocumento,
        valor: parsed.valor,
        data_pagamento: parsed.dataPagamento,
        banco_pagador: template.banco,
        agencia_conta_pagador: parsed.agencia ? `${parsed.agencia}/${parsed.conta}` : null,
        empresa_detectada: conta.empresa,
        bacc_code: conta.baccCode,
        extraido_json: parsed,
        execucao_id: runId,
      };

      const openInvoices = await getOpenInvoicesCache();
      const candidatos = findCandidates(openInvoices, { scpCode: conta.scpCode, valor: parsed.valor, favorecidoNome: parsed.favorecidoNome });

      if (candidatos.length !== 1) {
        await updateItem(row.id, {
          ...baseUpdate,
          status: 'AGUARDANDO_REVISAO',
          candidatos_json: candidatos.map((c) => ({
            pinCode: c.pinCode, favoredName: c.favoredName, valor: c.pinInstallmentValue,
            scpName: c.scpName, pinDocNumber: c.pinDocNumber, pinDueDate: c.pinDueDate, patCode: c.patCode,
          })),
          erro: candidatos.length === 0
            ? 'Nenhum lançamento aberto no GRM bate com empresa + valor + nome do favorecido.'
            : `${candidatos.length} lançamentos abertos batem com empresa + valor — escolha manualmente qual é o certo.`,
        });
        log('WARN', `${row.arquivo_nome}: ${candidatos.length} candidato(s) — foi pra AGUARDANDO_REVISAO.`);
        return 'aguardando_revisao';
      }

      const candidato = candidatos[0];
      const grmNfLancamentoId = await findGrmNfLancamentoId(candidato.pinCode);
      resolved = {
        pinCode: String(candidato.pinCode), baccCode: conta.baccCode, patCode: candidato.patCode,
        favorecidoNome: parsed.favorecidoNome, valor: parsed.valor, dataPagamento: parsed.dataPagamento,
        pinDocNumber: candidato.pinDocNumber,
      };
      await updateItem(row.id, {
        ...baseUpdate,
        status: 'VALIDADO',
        pat_code: candidato.patCode,
        pin_code: resolved.pinCode,
        grm_nf_lancamento_id: grmNfLancamentoId,
        candidatos_json: [],
        erro: null,
      });
    }

    log('INFO', `${row.arquivo_nome}: ${DRY_RUN ? 'validando payload de baixa (dry-run)' : 'dando baixa no GRM'} - pinCode ${resolved.pinCode}, R$ ${formatMoney(resolved.valor)}, pago em ${resolved.dataPagamento}.`);
    const payload = buildPaymentPayload(resolved);

    if (DRY_RUN) {
      log('DEBUG', 'Payload que seria enviado pro payInvoice/payment (dry-run):', payload);
      await updateItem(row.id, { status: 'DRY_RUN_OK', execucao_id: runId, grm_resposta: { dryRun: true, payload }, erro: null });
      return 'dry_run';
    }

    const response = await submitPayInvoicePayment(payload, localPath, row.arquivo_nome);
    await updateItem(row.id, { status: 'BAIXADO', execucao_id: runId, grm_resposta: response, baixado_em: isoNow(), erro: null });
    log('SUCCESS', `${row.arquivo_nome}: baixa registrada no GRM (pinCode ${resolved.pinCode}).`);
    return 'baixado';
  } catch (error) {
    await updateItem(row.id, { status: 'ERRO', execucao_id: runId, erro: String(error.message || error).slice(0, 4000) });
    log('ERROR', `${row.arquivo_nome}: ${error.message}`);
    return 'erro';
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (_) { /* noop */ }
  }
}

async function runExtractOnly(filePath) {
  if (!filePath || !fs.existsSync(filePath)) throw new Error(`Arquivo não encontrado: ${filePath || '(não informado)'}`);
  const texto = await extractPdfText(filePath);
  const template = detectTemplate(texto);
  const parsed = template ? template.parse(texto) : null;
  const conta = parsed ? resolveContaPagadora(parsed) : null;
  console.log(JSON.stringify({ template: template?.id || null, extraido: parsed, conta_resolvida: conta }, null, 2));
}

async function main() {
  let runId = null;
  const stats = { encontrados: 0, baixados: 0, dry_run: 0, aguardando_revisao: 0, divididos: 0, duplicados: 0, erros: 0 };
  try {
    assertConfig({ extractOnly: args.extractOnly });
    if (args.extractOnly) { await runExtractOnly(args.file); return; }
    if (!scheduledEnabled && !args.force && !args.id && !args.real && !args.dryRun) {
      log('INFO', 'GRM_BAIXA_NF_AGENDAR=false: execução automática desativada. Use --force, --dry-run ou --real.');
      return;
    }

    runId = await createRun();
    log('INFO', `=== Agente de baixa de NF/Holerite (API) iniciado (${DRY_RUN ? 'DRY-RUN' : 'REAL'}, limite=${LIMIT}) ===`);

    let query;
    if (args.id) {
      query = supabase.from(TABLE_ITEMS).select('*').eq('id', args.id);
    } else {
      query = supabase.from(TABLE_ITEMS).select('*').order('created_at', { ascending: true }).limit(LIMIT);
      if (!args.force) query = query.in('status', ['NOVO', 'VALIDADO']);
    }
    const { data: rows, error: listError } = await query;
    if (listError) throw listError;
    stats.encontrados = rows.length;

    if (!rows.length) {
      log('INFO', 'Nenhum comprovante novo na fila.');
      await finishRun(runId, 'SUCESSO', stats, null);
      return;
    }

    grmToken = await grmLogin();
    log('SUCCESS', 'Login no GRM ok.');

    for (const row of rows) {
      const result = await processBaixa(row, runId);
      if (result === 'baixado') stats.baixados += 1;
      else if (result === 'dry_run') stats.dry_run += 1;
      else if (result === 'aguardando_revisao') stats.aguardando_revisao += 1;
      else if (result === 'dividido') stats.divididos += 1;
      else if (result === 'duplicado') stats.duplicados += 1;
      else if (result === 'erro') stats.erros += 1;
    }

    const status = stats.erros ? 'ERRO_PARCIAL' : 'SUCESSO';
    await finishRun(runId, status, stats, stats.erros ? `${stats.erros} comprovante(s) com erro.` : null);
    log(stats.erros ? 'WARN' : 'SUCCESS', `Concluído: ${safeJson(stats)}`);
    if (stats.erros) process.exitCode = 2;

    if (!args.id && !DRY_RUN) {
      const { count: restantes, error: countError } = await supabase.from(TABLE_ITEMS).select('id', { count: 'exact', head: true }).in('status', ['NOVO', 'VALIDADO']);
      if (!countError && restantes > 0) {
        const { error: enqueueError } = await supabase.from('grm_sync_jobs').insert({
          agente_id: 'sync-baixa-notas-fiscais', status: 'pendente', lane: 'alteracoes', solicitado_por: 'auto-continuacao',
        });
        if (enqueueError) log('WARN', `Falha ao reenfileirar próximo lote: ${enqueueError.message}`);
        else log('INFO', `Reenfileirado: ${restantes} item(ns) ainda pendente(s)/validado(s) na fila.`);
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
    detectTemplate, resolveContaPagadora, findCandidates, buildPaymentPayload,
    parseMoneyBR, toIsoFromBR, normalizeText, loadConfig, grmLogin, apiPost,
  };
}
