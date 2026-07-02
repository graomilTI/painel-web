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
  const checkInterval = 500; // ms

  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      const files = fs
        .readdirSync(dir)
        .filter((f) => !f.endsWith('.crdownload') && !f.endsWith('.tmp'));

      if (files.length > 0) {
        clearInterval(timer);
        const downloaded = path.join(dir, files[0]);
        const renamed = path.join(dir, `${files[0]}.xlsx`);
        if (!downloaded.endsWith('.xlsx') && !downloaded.endsWith('.xls')) {
          fs.renameSync(downloaded, renamed);
          resolve(renamed);
        } else {
          resolve(downloaded);
        }
      }

      if (Date.now() - startTime > maxWaitMs) {
        clearInterval(timer);
        reject(new Error('Timeout aguardando download do arquivo'));
      }
    }, checkInterval);
  });
}

// ============================================================================
// PARSING DO ARQUIVO XLS
// ============================================================================

function parseColaboradoresXls(filePath) {
  logger.info(`Parseando arquivo XLS: ${filePath}`);

  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      throw new Error('Arquivo XLS vazio ou sem abas');
    }

    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet);

    logger.info(`Total de linhas encontradas: ${rows.length}`);

    // Mapear colunas do XLS para estrutura da tabela Supabase
    // Ajuste os nomes das colunas conforme o arquivo real
    const colaboradores = rows
      .map((row) => {
        // Limpar e normalizar dados
        return {
          cpf: normalizeText(row['CPF'] || row['cpf'] || row['Cpf'] || ''),
          nome: normalizeText(row['Nome'] || row['NOME'] || row['nome'] || ''),
          situacao: normalizeText(
            row['Situação'] || row['situacao'] || row['SITUACAO'] || ''
          ),
          admissao: parseDate(row['Admissão'] || row['admissao'] || row['Data de Admissão']),
          desligamento: parseDate(
            row['Desligamento'] || row['desligamento'] || row['Data de Desligamento']
          ),
          salario: parseFloat(
            String(row['Salário'] || row['salario'] || row['SALARIO'] || 0).replace(/[^\d,.-]/g, '').replace(',', '.')
          ) || 0,
          conta_bancaria_despesas: normalizeText(
            row['Conta Bancária'] || row['conta_bancaria' ] || row['ContaBancaria'] || ''
          ),
          empresa: normalizeText(row['Empresa'] || row['empresa'] || row['EMPRESA'] || ''),
          coordenacao: normalizeText(
            row['Coordenação'] || row['coordenacao'] || row['COORDENACAO'] || ''
          ),
          supervisao: normalizeText(
            row['Supervisão'] || row['supervisao'] || row['SUPERVISAO'] || ''
          ),
          tipo: normalizeText(row['Tipo'] || row['tipo'] || row['TIPO'] || ''),
          cep: normalizeText(row['CEP'] || row['cep'] || row['Cep'] || ''),
          estado: normalizeText(row['Estado'] || row['estado'] || row['UF'] || ''),
          cidade: normalizeText(row['Cidade'] || row['cidade'] || row['CIDADE'] || ''),
          bairro: normalizeText(row['Bairro'] || row['bairro'] || row['BAIRRO'] || ''),
          endereco: normalizeText(row['Endereço'] || row['endereco'] || row['Rua'] || ''),
          complemento: normalizeText(
            row['Complemento'] || row['complemento'] || row['numero'] || ''
          ),
          data_nascimento: parseDate(
            row['Data de Nascimento'] || row['data_nascimento'] || row['Nascimento']
          ),
          cargo: normalizeText(row['Cargo'] || row['cargo'] || row['CARGO'] || ''),
          whatsapp: normalizePhone(row['WhatsApp'] || row['whatsapp'] || row['Celular'] || ''),
          email_pessoal: normalizeEmail(row['Email Pessoal'] || row['email_pessoal'] || ''),
          email_empresa: normalizeEmail(
            row['Email Empresa'] || row['email_empresa'] || row['Email'] || ''
          ),
          metadata: {
            origem: 'grmserver',
            sincronizado_em: new Date().toISOString(),
          },
        };
      })
      .filter((col) => col.cpf); // Filtrar registros sem CPF

    logger.success(`${colaboradores.length} colaboradores processados com sucesso`);
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

async function upsertColaboradores(supabase, colaboradores) {
  logger.info(`Iniciando upsert de ${colaboradores.length} colaboradores...`);

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  // Processar em lotes para evitar timeout
  const batchSize = 100;

  for (let i = 0; i < colaboradores.length; i += batchSize) {
    const batch = colaboradores.slice(i, i + batchSize);

    try {
      // Usar upsert do Supabase por CPF
      const { data, error } = await supabase
        .from('colaboradores')
        .upsert(batch, {
          onConflict: 'cpf', // Usar CPF como chave de conflito
          returning: 'minimal', // Não retornar dados para economizar banda
        });

      if (error) {
        logger.error(`Erro no upsert do lote ${i / batchSize + 1}: ${error.message}`);
        errors += batch.length;
      } else {
        // Contar inserts vs updates consultando registros
        for (const col of batch) {
          const { data: existing } = await supabase
            .from('colaboradores')
            .select('id')
            .eq('cpf', col.cpf)
            .single();

          if (existing) {
            updated++;
          } else {
            inserted++;
          }
        }
      }
    } catch (error) {
      logger.error(`Erro ao processar lote ${i / batchSize + 1}: ${error.message}`);
      errors += batch.length;
    }

    logger.info(
      `Progresso: ${Math.min(i + batchSize, colaboradores.length)}/${colaboradores.length}`
    );
  }

  logger.success(
    `Upsert concluído | Inseridos: ${inserted} | Atualizados: ${updated} | Erros: ${errors}`
  );

  return { inserted, updated, errors };
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

    // 7. Log final
    logger.success('=== Sincronização concluída com sucesso ===');
    logger.info(JSON.stringify(result, null, 2));

    // Retornar resultado para logging externo (PM2, etc)
    process.exit(0);
  } catch (error) {
    logger.error(`Erro fatal: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
  } finally {
    await cleanup(browser, tempDir);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  main().then(() => process.exit(0));
  setTimeout(() => process.exit(0), 120000);
}

module.exports = {
  loginGrmServer,
  downloadColaboradoresXls,
  parseColaboradoresXls,
  upsertColaboradores,
};
