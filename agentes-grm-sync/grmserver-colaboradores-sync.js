#!/usr/bin/env node

/**
 * GRM Server Colaboradores Sync
 * Script de sincronização de colaboradores do GRM Server para Supabase
 * Frequência: a cada 5 minutos (via cron ou PM2)
 */

require('dotenv').config();

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

puppeteer.use(StealthPlugin());

// ============================================================================
// CONFIGURAÇÃO E INICIALIZAÇÃO
// ============================================================================

const logger = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ${new Date().toISOString()} - ${msg}`),
};

// Carregar secrets do ambiente
function loadSecrets() {
  const required = [
    'GRMSERVER_USER',
    'GRMSERVER_PASSWORD',
    'SUPABASE_URL',
  ];

  const secrets = {};
  const missing = [];

  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    } else {
      secrets[key] = process.env[key];
    }
  }

  secrets.SUPABASE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_KEY;

  if (!secrets.SUPABASE_KEY) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SERVICE_KEY ou SUPABASE_KEY');
  }

  if (missing.length > 0) {
    throw new Error(
      `Secrets ausentes: ${missing.join(', ')}. Configure as variáveis de ambiente.`
    );
  }

  return secrets;
}

// Diretório temporário para arquivos baixados
function getTempDir() {
  const tempDir = path.join(os.tmpdir(), 'grm-sync');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  return tempDir;
}

function clearTempDir(tempDir) {
  if (!fs.existsSync(tempDir)) return;

  for (const file of fs.readdirSync(tempDir)) {
    const filePath = path.join(tempDir, file);
    try {
      if (fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      logger.warn(`Não foi possível remover temporário ${file}: ${error.message}`);
    }
  }
}

// ============================================================================
// AUTENTICAÇÃO NO GRM SERVER
// ============================================================================

async function loginGrmServer(browser, user, password) {
  logger.info('Iniciando login no GRM Server...');

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);
  page.setDefaultTimeout(60000);

  const debugDir = path.join(__dirname, 'debug-grm');
  if (!fs.existsSync(debugDir)) {
    fs.mkdirSync(debugDir, { recursive: true });
  }

  async function salvarDebug(motivo) {
    try {
      const urlAtual = page.url();
      logger.error(`[DEBUG] Motivo: ${motivo}`);
      logger.error(`[DEBUG] URL atual: ${urlAtual}`);

      await page.screenshot({
        path: path.join(debugDir, 'login-falhou.png'),
        fullPage: true,
      });

      const html = await page.content();
      fs.writeFileSync(path.join(debugDir, 'login-falhou.html'), html);

      const texto = await page.evaluate(() => document.body.innerText || '');
      fs.writeFileSync(path.join(debugDir, 'login-falhou.txt'), texto);

      logger.error(`[DEBUG] Diagnóstico salvo em: ${debugDir}`);
    } catch (e) {
      logger.error(`[DEBUG] Falha ao salvar diagnóstico: ${e.message}`);
    }
  }

  try {
    await page.goto('https://www.grmserver.com.br/login', {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    logger.info('Página de login carregada');

    await page.waitForSelector('input', { visible: true });

    const inputs = await page.$$('input');
    logger.info(`Inputs encontrados na tela de login: ${inputs.length}`);

    let userInput = null;
    let passwordInput = null;

    for (const input of inputs) {
      const info = await page.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return {
          type: (el.getAttribute('type') || '').toLowerCase(),
          name: el.getAttribute('name') || '',
          id: el.id || '',
          placeholder: el.getAttribute('placeholder') || '',
          visible: rect.width > 0 && rect.height > 0,
          disabled: el.disabled,
        };
      }, input);

      if (!info.visible || info.disabled) continue;

      if (info.type === 'password') {
        passwordInput = input;
      } else if (!userInput && ['text', 'email', ''].includes(info.type)) {
        userInput = input;
      }
    }

    if (!userInput) {
      await salvarDebug('Campo de usuário não encontrado');
      throw new Error('Campo de usuário não encontrado');
    }

    if (!passwordInput) {
      await salvarDebug('Campo de senha não encontrado');
      throw new Error('Campo de senha não encontrado');
    }

    await userInput.click({ clickCount: 3 });
    await userInput.type(user, { delay: 20 });

    await passwordInput.click({ clickCount: 3 });
    await passwordInput.type(password, { delay: 20 });

    logger.info('Credenciais preenchidas');

    const clicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));

      const btn =
        document.querySelector('button.submit-btn') ||
        buttons.find((b) => /autenticar|entrar|login|acessar/i.test(b.innerText || ''));

      if (!btn) return false;

      btn.click();
      return true;
    });

    if (!clicked) {
      await salvarDebug('Botão de login não encontrado');
      throw new Error('Botão de login não encontrado');
    }

    logger.info('Botão de login clicado. Aguardando autenticação...');

    let loginSuccess = false;

    for (let i = 0; i < 45; i++) {
      await page.waitForTimeout(1000);

      const currentUrl = page.url();
      const bodyText = await page.evaluate(() => document.body.innerText || '');

      if (!currentUrl.includes('/login')) {
        loginSuccess = true;
        break;
      }

      if (/senha|usuário|usuario|inválido|invalido|incorreto|erro|bloqueado|captcha/i.test(bodyText)) {
        logger.warn(`[DEBUG] Possível mensagem na tela: ${bodyText.substring(0, 500)}`);
      }
    }

    if (!loginSuccess) {
      await salvarDebug('Login não redirecionou após 45 segundos');
      throw new Error('Login falhou: página não redirecionou após 45 segundos');
    }

    logger.success('Login realizado com sucesso');
    return page;
  } catch (error) {
    await salvarDebug(error.message);

    try {
      await page.close();
    } catch (e) {}

    throw new Error(`Erro ao fazer login: ${error.message}`);
  }
}

// ============================================================================
// DOWNLOAD DO ARQUIVO XLS
// ============================================================================

async function downloadColaboradoresXls(page, tempDir) {
  logger.info('Navegando até relatório de colaboradores...');

  try {
    // Aguardar carregamento da página principal após login
    await page.waitForTimeout(2000);

    logger.info('Navegando para team/staff...');
    await page.goto('https://www.grmserver.com.br/adm/team/staff', {
      waitUntil: 'networkidle2',
    });

    // Aguardar um pouco para garantir que a página está completamente carregada
    await page.waitForTimeout(2000);

    // PASSO 1: Clicar em "Filtros"
    logger.info('PASSO 1: Clicando em ".staff-act-filter"...');
    try {
      const filtroBtn = await page.$('.staff-act-filter button');
      if (filtroBtn) {
        await page.evaluate((btn) => btn.click(), filtroBtn);
        await page.waitForTimeout(1500);
        logger.success('Filtros aberto');
      } else {
        logger.warn('Botão filtro não encontrado');
      }
    } catch (e) {
      logger.warn(`Erro ao clicar em Filtros: ${e.message}`);
    }

    // PASSO 2: Limpar o campo "Situação" (deixar null)
    logger.info('PASSO 2: Limpando campo "Situação"...');
    try {
      // Procurar por um elemento que contém "Situação" e depois encontrar o X
      const clearBtns = await page.$$('.v-field__clearable button');

      for (const btn of clearBtns) {
        const parent = await page.evaluate((el) => {
          let p = el;
          while (p && !p.textContent.includes('Situação')) {
            p = p.parentElement;
            if (!p) break;
          }
          return p ? p.textContent.substring(0, 100) : null;
        }, btn);

        if (parent && parent.includes('Situação')) {
          logger.info('Botão de limpeza da Situação encontrado. Clicando...');
          await page.evaluate((b) => b.click(), btn);
          await page.waitForTimeout(800);
          logger.success('Campo "Situação" limpo');
          break;
        }
      }
    } catch (e) {
      logger.warn(`Erro ao limpar Situação: ${e.message}`);
    }

    // PASSO 3: Clicar em "Pesquisar" (lupa)
    logger.info('PASSO 3: Clicando em ".staff-act-search" (Pesquisar)...');
    try {
      const pesquisarBtn = await page.$('.staff-act-search button');
      if (pesquisarBtn) {
        await page.evaluate((btn) => btn.click(), pesquisarBtn);
        await page.waitForTimeout(2000);
        logger.success('Pesquisar (lupa) clicada');
      } else {
        logger.warn('Botão Pesquisar não encontrado');
      }
    } catch (e) {
      logger.warn(`Erro ao clicar em Pesquisar: ${e.message}`);
    }

    // Aguardar a página atualizar com os resultados
    await page.waitForTimeout(2000);
    logger.info('Filtros aplicados. Pronto para download.');

    // Criar cliente para download em diretório específico
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: tempDir,
    });
    await client.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: tempDir,
      eventsEnabled: true,
    });

    logger.info('PASSO 4: Clicando em ".act-staff-xls" (XLS)...');
    try {
      const xlsBtn = await page.$('.act-staff-xls button');
      if (!xlsBtn) {
        throw new Error('Botão XLS não encontrado');
      }

      logger.info('Botão XLS encontrado! Iniciando download...');
      await page.evaluate((btn) => btn.click(), xlsBtn);
    } catch (e) {
      throw new Error(`Erro ao clicar em XLS: ${e.message}`);
    }

    // Aguardar o arquivo ser baixado (máximo 30 segundos)
    const xlsFile = await waitForFileDownload(tempDir, 30000);
    logger.success(`Arquivo XLS baixado: ${xlsFile}`);
    return xlsFile;
  } catch (error) {
    throw new Error(`Erro ao fazer download: ${error.message}`);
  }
}

// Aguardar arquivo ser criado no diretório
async function waitForFileDownload(dir, maxWaitMs) {
  const startTime = Date.now();
  const checkInterval = 500;

  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      let files = [];

      try {
        files = fs
          .readdirSync(dir)
          .filter((name) => !name.endsWith('.crdownload') && !name.endsWith('.tmp'))
          .map((name) => {
            const filePath = path.join(dir, name);
            const stat = fs.statSync(filePath);
            return { name, filePath, mtimeMs: stat.mtimeMs, isFile: stat.isFile() };
          })
          .filter((item) => item.isFile && item.mtimeMs >= startTime - 1500)
          .sort((a, b) => b.mtimeMs - a.mtimeMs);
      } catch (error) {
        logger.warn(`Falha ao verificar download: ${error.message}`);
      }

      if (files.length > 0) {
        clearInterval(timer);

        const downloaded = files[0].filePath;
        if (downloaded.endsWith('.xlsx') || downloaded.endsWith('.xls')) {
          resolve(downloaded);
          return;
        }

        const renamed = `${downloaded}.xlsx`;
        if (fs.existsSync(renamed)) fs.unlinkSync(renamed);
        fs.renameSync(downloaded, renamed);
        resolve(renamed);
        return;
      }

      if (Date.now() - startTime > maxWaitMs) {
        clearInterval(timer);
        reject(new Error('Timeout aguardando download do arquivo novo'));
      }
    }, checkInterval);
  });
}

// ============================================================================
// PARSING DO ARQUIVO XLS
// ============================================================================

function normalizeHeader(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const BANK_EXPENSE_HEADER_ALIASES = [
  'C. Banc. Despesas',
  'C Banc Despesas',
  'C. Banc. Desp.',
  'Conta Bancária Despesas',
  'Conta Bancaria Despesas',
  'Conta de Despesas',
  'Conta para Despesas',
  'Banco de Despesas',
  'Conta Bancária',
  'Conta Bancaria',
  'conta_bancaria_despesas',
  'conta_bancaria',
  'ContaBancaria',
];

function isBankExpenseHeader(header) {
  const normalized = normalizeHeader(header);
  const aliases = BANK_EXPENSE_HEADER_ALIASES.map(normalizeHeader);

  if (aliases.includes(normalized)) return true;

  const hasExpense = normalized.includes('despes');
  const hasBank = normalized.includes('banc') || normalized.includes('conta');
  return hasExpense && hasBank;
}

function getRowValue(row, aliases = [], fuzzyMatcher = null) {
  const keys = Object.keys(row || {});
  const normalizedAliases = new Set(aliases.map(normalizeHeader));

  let key = keys.find((item) => normalizedAliases.has(normalizeHeader(item)));
  if (!key && typeof fuzzyMatcher === 'function') {
    key = keys.find((item) => fuzzyMatcher(item));
  }

  return key ? row[key] : '';
}

function isEmptyValue(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

function isActiveSituation(value) {
  const normalized = normalizeHeader(value);
  return normalized === 'ativo' || normalized === 'ativa' || normalized.includes('em atividade');
}

function mergeDuplicateColaborador(existing, incoming) {
  const existingActive = isActiveSituation(existing.situacao);
  const incomingActive = isActiveSituation(incoming.situacao);

  const preferred = incomingActive && !existingActive
    ? incoming
    : existingActive && !incomingActive
      ? existing
      : incoming;

  const fallback = preferred === incoming ? existing : incoming;
  const merged = { ...fallback, ...preferred };

  for (const key of new Set([...Object.keys(existing), ...Object.keys(incoming)])) {
    if (isEmptyValue(merged[key]) && !isEmptyValue(fallback[key])) {
      merged[key] = fallback[key];
    }
  }

  merged.conta_bancaria_despesas =
    !isEmptyValue(preferred.conta_bancaria_despesas)
      ? preferred.conta_bancaria_despesas
      : fallback.conta_bancaria_despesas || '';

  return merged;
}

function parseColaboradoresXls(filePath) {
  logger.info(`Parseando arquivo XLS: ${filePath}`);

  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      throw new Error('Arquivo XLS vazio ou sem abas');
    }

    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    logger.info(`Total de linhas encontradas: ${rows.length}`);

    const headers = Array.from(
      new Set(rows.slice(0, 20).flatMap((row) => Object.keys(row || {})))
    );
    const bankHeader = headers.find(isBankExpenseHeader);

    logger.info(`[XLS] Cabeçalhos identificados: ${headers.join(' | ') || '(nenhum)'}`);
    if (bankHeader) {
      logger.success(`[BANCO] Coluna de despesas identificada: "${bankHeader}"`);
    } else {
      logger.warn('[BANCO] Nenhuma coluna de conta bancária de despesas foi identificada no XLS.');
    }

    const parsed = rows
      .map((row) => {
        const contaBancariaDespesas = getRowValue(
          row,
          BANK_EXPENSE_HEADER_ALIASES,
          isBankExpenseHeader
        );

        return {
          cpf: normalizeCpf(getRowValue(row, ['CPF', 'Cpf', 'cpf'])),
          nome: normalizeText(getRowValue(row, ['Nome', 'NOME', 'nome'])),
          situacao: normalizeText(getRowValue(row, ['Situação', 'Situacao', 'situacao', 'SITUACAO'])),
          admissao: parseDate(getRowValue(row, ['Admissão', 'Admissao', 'admissao', 'Data de Admissão', 'Data de Admissao'])),
          desligamento: parseDate(getRowValue(row, ['Desligamento', 'desligamento', 'Data de Desligamento'])),
          salario: parseFloat(
            String(getRowValue(row, ['Salário', 'Salario', 'salario', 'SALARIO']) || 0)
              .replace(/[^\d,.-]/g, '')
              .replace(',', '.')
          ) || 0,
          conta_bancaria_despesas: normalizeText(contaBancariaDespesas),
          empresa: normalizeText(getRowValue(row, ['Empresa', 'empresa', 'EMPRESA'])),
          coordenacao: normalizeText(getRowValue(row, ['Coordenação', 'Coordenacao', 'coordenacao', 'COORDENACAO'])),
          supervisao: normalizeText(getRowValue(row, ['Supervisão', 'Supervisao', 'supervisao', 'SUPERVISAO'])),
          tipo: normalizeText(getRowValue(row, ['Tipo', 'tipo', 'TIPO'])),
          cep: normalizeText(getRowValue(row, ['CEP', 'cep', 'Cep'])),
          estado: normalizeText(getRowValue(row, ['Estado', 'estado', 'UF'])),
          cidade: normalizeText(getRowValue(row, ['Cidade', 'cidade', 'CIDADE'])),
          bairro: normalizeText(getRowValue(row, ['Bairro', 'bairro', 'BAIRRO'])),
          endereco: normalizeText(getRowValue(row, ['Endereço', 'Endereco', 'endereco', 'Rua'])),
          complemento: normalizeText(getRowValue(row, ['Complemento', 'complemento', 'numero', 'Número', 'Numero'])),
          data_nascimento: parseDate(getRowValue(row, ['Data de Nascimento', 'data_nascimento', 'Nascimento'])),
          cargo: normalizeText(getRowValue(row, ['Cargo', 'cargo', 'CARGO'])),
          whatsapp: normalizePhone(getRowValue(row, ['WhatsApp', 'Whatsapp', 'whatsapp', 'Celular'])),
          email_pessoal: normalizeEmail(getRowValue(row, ['Email Pessoal', 'E-mail Pessoal', 'email_pessoal'])),
          email_empresa: normalizeEmail(getRowValue(row, ['Email Empresa', 'E-mail Empresa', 'email_empresa', 'Email'])),
          sincronizado_em: new Date().toISOString(),
          metadata: {
            origem: 'grmserver',
            sincronizado_em: new Date().toISOString(),
            coluna_banco_origem: bankHeader || null,
          },
        };
      })
      .filter((col) => col.cpf);

    const byCpf = new Map();
    let duplicates = 0;

    for (const colaborador of parsed) {
      const existing = byCpf.get(colaborador.cpf);
      if (!existing) {
        byCpf.set(colaborador.cpf, colaborador);
        continue;
      }

      duplicates += 1;
      byCpf.set(
        colaborador.cpf,
        mergeDuplicateColaborador(existing, colaborador)
      );
    }

    const colaboradores = Array.from(byCpf.values());
    const comBanco = colaboradores.filter((col) => !isEmptyValue(col.conta_bancaria_despesas));
    const semBanco = colaboradores.filter((col) => isEmptyValue(col.conta_bancaria_despesas));

    logger.info(`[BANCO] XLS consolidado: ${comBanco.length} com conta | ${semBanco.length} sem conta.`);
    if (duplicates) {
      logger.warn(`[CPF] ${duplicates} linha(s) duplicada(s) foram consolidadas antes do upsert.`);
    }
    if (semBanco.length) {
      logger.warn(
        `[BANCO] Amostra sem conta no XLS: ${semBanco.slice(0, 20).map((col) => `${col.nome} (${col.cpf})`).join(', ')}`
      );
    }

    logger.success(`${colaboradores.length} colaboradores únicos processados com sucesso`);
    return colaboradores;
  } catch (error) {
    throw new Error(`Erro ao parsear XLS: ${error.message}`);
  }
}

// Funções auxiliares de normalização
function normalizeText(value) {
  if (!value) return '';
  return String(value).trim();
}

function parseDate(value) {
  if (!value) return null;

  const dateStr = String(value).trim();
  if (!dateStr) return null;

  // Formato brasileiro DD/MM/YYYY (ou DD-MM-YYYY) - o GRM Server exporta assim.
  // new Date(string) assume formato americano MM/DD/YYYY para strings com "/",
  // trocando dia e mês silenciosamente quando o dia é <= 12 (ex.: 02/07/2026 virava 07/02/2026).
  const brMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    const day = Number(d);
    const month = Number(m);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return null;
  }

  // Já em ISO (YYYY-MM-DD) ou outro formato sem ambiguidade de dia/mês.
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  } catch (e) {
    // Ignorar erro
  }

  return null;
}

function normalizePhone(value) {
  if (!value) return '';
  // Manter apenas números
  return String(value).replace(/\D/g, '');
}

function normalizeCpf(value) {
  if (!value) return '';
  // O XLS traz CPF mascarado (XXX.XXX.XXX-XX) para colaboradores ativos e sem
  // máscara para os demais; onConflict é por cpf, então formato inconsistente
  // faz o upsert criar linha duplicada em vez de atualizar a existente.
  return String(value).replace(/\D/g, '');
}

function normalizeEmail(value) {
  if (!value) return '';
  const email = String(value).toLowerCase().trim();
  // Validação básica de email
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return email;
  }
  return '';
}

// ============================================================================
// SUPABASE UPSERT
// ============================================================================

async function loadExistingBankMap(supabase) {
  const map = new Map();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('colaboradores')
      .select('cpf,conta_bancaria_despesas')
      .range(from, from + pageSize - 1);

    if (error) {
      logger.warn(`[BANCO] Não foi possível consultar contas já existentes: ${error.message}`);
      return map;
    }

    const rows = data || [];
    for (const row of rows) {
      const cpf = normalizeCpf(row.cpf);
      const banco = normalizeText(row.conta_bancaria_despesas);
      if (cpf && banco && !map.has(cpf)) {
        map.set(cpf, banco);
      }
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return map;
}


async function cleanupLegacyCpfDuplicates(supabase) {
  logger.info('[CPF] Verificando registros legados com CPF mascarado...');

  const pageSize = 1000;
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('colaboradores')
      .select('cpf,nome,conta_bancaria_despesas')
      .range(from, from + pageSize - 1);

    if (error) {
      logger.warn(`[CPF] Não foi possível consultar duplicidades legadas: ${error.message}`);
      return { checked: 0, removed: 0, candidates: 0 };
    }

    const page = data || [];
    rows.push(...page);

    if (page.length < pageSize) break;
    from += pageSize;
  }

  const normalizedCpfSet = new Set(
    rows
      .map((row) => String(row.cpf || '').trim())
      .filter((rawCpf) => rawCpf === normalizeCpf(rawCpf) && rawCpf.length === 11)
  );

  const staleCpfValues = Array.from(new Set(
    rows
      .map((row) => String(row.cpf || '').trim())
      .filter((rawCpf) => {
        const normalized = normalizeCpf(rawCpf);
        return (
          rawCpf &&
          normalized.length === 11 &&
          rawCpf !== normalized &&
          normalizedCpfSet.has(normalized)
        );
      })
  ));

  if (!staleCpfValues.length) {
    logger.info('[CPF] Nenhuma duplicidade legada com CPF mascarado encontrada.');
    return { checked: rows.length, removed: 0, candidates: 0 };
  }

  let removed = 0;
  const batchSize = 100;

  for (let i = 0; i < staleCpfValues.length; i += batchSize) {
    const batch = staleCpfValues.slice(i, i + batchSize);

    const { error, count } = await supabase
      .from('colaboradores')
      .delete({ count: 'exact' })
      .in('cpf', batch);

    if (error) {
      logger.error(`[CPF] Erro ao remover duplicidades legadas: ${error.message}`);
      continue;
    }

    removed += Number(count || batch.length);
  }

  logger.success(
    `[CPF] Limpeza concluída | Registros verificados: ${rows.length} | ` +
    `CPFs mascarados duplicados: ${staleCpfValues.length} | Removidos: ${removed}`
  );

  return {
    checked: rows.length,
    removed,
    candidates: staleCpfValues.length,
  };
}

async function upsertColaboradores(supabase, colaboradores) {
  logger.info(`Iniciando upsert de ${colaboradores.length} colaboradores...`);

  let synced = 0;
  let errors = 0;
  let preservedBanks = 0;

  const existingBankMap = await loadExistingBankMap(supabase);
  const prepared = colaboradores.map((colaborador) => {
    if (!isEmptyValue(colaborador.conta_bancaria_despesas)) return colaborador;

    const existingBank = existingBankMap.get(normalizeCpf(colaborador.cpf));
    if (!existingBank) return colaborador;

    preservedBanks += 1;
    return {
      ...colaborador,
      conta_bancaria_despesas: existingBank,
      metadata: {
        ...(colaborador.metadata || {}),
        banco_preservado_do_supabase: true,
      },
    };
  });

  const remainingWithoutBank = prepared.filter(
    (col) => isEmptyValue(col.conta_bancaria_despesas)
  );

  logger.info(`[BANCO] ${preservedBanks} conta(s) preservada(s) a partir do Supabase.`);
  logger.info(`[BANCO] ${remainingWithoutBank.length} colaborador(es) continuam sem conta porque não há valor nem no XLS nem no Supabase.`);

  const batchSize = 100;

  for (let i = 0; i < prepared.length; i += batchSize) {
    const batch = prepared.slice(i, i + batchSize);

    try {
      const { error } = await supabase
        .from('colaboradores')
        .upsert(batch, {
          onConflict: 'cpf',
          returning: 'minimal',
        });

      if (error) {
        logger.error(`Erro no upsert do lote ${i / batchSize + 1}: ${error.message}`);
        errors += batch.length;
      } else {
        synced += batch.length;
      }
    } catch (error) {
      logger.error(`Erro ao processar lote ${i / batchSize + 1}: ${error.message}`);
      errors += batch.length;
    }

    logger.info(
      `Progresso: ${Math.min(i + batchSize, prepared.length)}/${prepared.length}`
    );
  }

  logger.success(
    `Upsert concluído | Sincronizados: ${synced} | Erros: ${errors} | Bancos preservados: ${preservedBanks} | Sem banco na origem: ${remainingWithoutBank.length}`
  );

  return {
    synced,
    errors,
    preservedBanks,
    remainingWithoutBank: remainingWithoutBank.length,
  };
}

// ============================================================================
// LIMPEZA
// ============================================================================

async function cleanup(browser, tempDir) {
  logger.info('Iniciando limpeza...');

  try {
    if (browser) {
      await browser.close();
      logger.info('Browser fechado');
    }

    // Limpar arquivos temporários
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        const filePath = path.join(tempDir, file);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      logger.info('Arquivos temporários removidos');
    }
  } catch (error) {
    logger.error(`Erro durante limpeza: ${error.message}`);
  }
}

// ============================================================================
// EXECUÇÃO PRINCIPAL
// ============================================================================

async function main() {
  let browser = null;
  const tempDir = getTempDir();

  try {
    logger.info('=== Iniciando sincronização GRM Server → Supabase ===');
    clearTempDir(tempDir);
    logger.info('Diretório temporário limpo antes do novo download.');

    // 1. Carregar secrets
    const secrets = loadSecrets();
    logger.success('Secrets carregados');

    // 2. Inicializar Supabase
    const supabase = createClient(secrets.SUPABASE_URL, secrets.SUPABASE_KEY, { realtime: { transport: WebSocket } });
    logger.success('Cliente Supabase inicializado');

    // 3. Inicializar Puppeteer
    browser = await puppeteer.launch({
      headless: true,
      dumpio: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--no-zygote',
        '--single-process',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-features=VizDisplayCompositor,AudioServiceOutOfProcess,IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials'
      ],
      defaultViewport: { width: 1920, height: 1440 }
    });
    logger.success('Puppeteer iniciado');

    // 4. Login e download
    const page = await loginGrmServer(
      browser,
      secrets.GRMSERVER_USER,
      secrets.GRMSERVER_PASSWORD
    );

    const xlsFile = await downloadColaboradoresXls(page, tempDir);
    await page.close();

    // 5. Parsear XLS
    const colaboradores = parseColaboradoresXls(xlsFile);

    // 6. Upsert no Supabase
    const result = await upsertColaboradores(supabase, colaboradores);

    // 7. Remover duplicidades legadas criadas antes da normalização do CPF.
    // Mantém somente o registro atual com CPF em 11 dígitos, evitando que o
    // Financeiro encontre uma linha antiga vazia ao cruzar pelo colaborador.
    const cpfCleanup = await cleanupLegacyCpfDuplicates(supabase);
    result.cpfCleanup = cpfCleanup;

    // 8. Log final
    logger.success('=== Sincronização concluída com sucesso ===');
    logger.info(JSON.stringify(result, null, 2));

    return result;
  } catch (error) {
    logger.error(`Erro fatal: ${error.message}`);
    logger.error(error.stack);
    throw error;
  } finally {
    await cleanup(browser, tempDir);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const hardTimeout = setTimeout(() => {
    logger.error('Timeout fatal de 120 segundos. Encerrando processo.');
    process.exit(1);
  }, 120000);

  main()
    .then(() => {
      clearTimeout(hardTimeout);
      process.exit(0);
    })
    .catch(() => {
      clearTimeout(hardTimeout);
      process.exit(1);
    });
}

module.exports = {
  loginGrmServer,
  downloadColaboradoresXls,
  parseColaboradoresXls,
  upsertColaboradores,
  cleanupLegacyCpfDuplicates,
};
