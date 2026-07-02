/**
 * Funções auxiliares e testes para debugging do script
 */

require('dotenv').config();

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * Teste de login - abrir navegador e permitir inspeção manual
 */
async function testLogin(user, password) {
  console.log('[TEST] Iniciando teste de login...');

  const browser = await puppeteer.launch({
    headless: false, // Modo visible para debugging
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();

  try {
    await page.goto('https://www.grmserver.com.br/login', {
      waitUntil: 'networkidle2',
    });

    console.log('[TEST] Página de login carregada');
    console.log('[TEST] Pressione ENTER para continuar (esperar 30 segundos)...');

    // Tirar screenshot antes de fazer login
    await page.screenshot({ path: 'login-page.png' });
    console.log('[TEST] Screenshot salvo: login-page.png');

    // Aguardar input do usuário
    await page.waitForTimeout(5000);

    // Preencher credenciais
    await page.type('input[name="username"]', user);
    await page.type('input[name="password"]', password);

    // Screenshot com formulário preenchido
    await page.screenshot({ path: 'login-filled.png' });
    console.log('[TEST] Screenshot salvo: login-filled.png');

    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
    ]);

    console.log('[TEST] Login bem-sucedido!');

    // Screenshot após login
    await page.screenshot({ path: 'after-login.png' });
    console.log('[TEST] Screenshot salvo: after-login.png');

    // Listar todos os links e botões para ajudar a encontrar relatório
    console.log('\n[TEST] Links encontrados:');
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).map((a) => ({
        text: a.textContent.trim(),
        href: a.href,
      }));
    });
    links.forEach((link) => console.log(`  - ${link.text}: ${link.href}`));

    console.log('\n[TEST] Botões encontrados:');
    const buttons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).map((btn) => ({
        text: btn.textContent.trim(),
        class: btn.className,
        title: btn.title,
      }));
    });
    buttons.forEach((btn) => console.log(`  - ${btn.text} (${btn.class})`));

    // Aguardar inspeção manual do usuário
    console.log('\n[TEST] Navegador permanecerá aberto por 60 segundos para inspeção...');
    await page.waitForTimeout(60000);

    console.log('[TEST] Teste concluído');
  } catch (error) {
    console.error('[ERROR]', error.message);
  } finally {
    await browser.close();
  }
}

/**
 * Teste de download - navegar até relatório e fazer download
 */
async function testDownload(user, password, outputDir = './downloads') {
  console.log('[TEST] Iniciando teste de download...');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();

  try {
    // Login
    await page.goto('https://www.grmserver.com.br/login', {
      waitUntil: 'networkidle2',
    });

    await page.type('input[name="username"]', user);
    await page.type('input[name="password"]', password);

    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
    ]);

    console.log('[TEST] Login bem-sucedido');

    // Configurar download
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: path.resolve(outputDir),
    });

    // Tentar acessar página de colaboradores
    console.log('[TEST] Navegando até página de colaboradores...');
    try {
      await page.goto('https://www.grmserver.com.br/relatorios/colaboradores', {
        waitUntil: 'networkidle2',
      });
    } catch (e) {
      console.log('[TEST] URL direta falhou, procurando link...');
    }

    // Screenshot para ver qual é o botão de download
    await page.screenshot({ path: 'colaboradores-page.png' });
    console.log('[TEST] Screenshot salvo: colaboradores-page.png');

    // Listar botões de download
    console.log('\n[TEST] Procurando botões de download...');
    const downloadButtons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button, a')).map((el) => ({
        tag: el.tagName,
        text: el.textContent.trim(),
        class: el.className,
        href: el.href || el.getAttribute('onclick') || 'N/A',
      }));
    });

    downloadButtons
      .filter((btn) => btn.text.toLowerCase().includes('download') || btn.text.toLowerCase().includes('excel'))
      .forEach((btn) => console.log(`  - [${btn.tag}] ${btn.text}`));

    console.log('\n[TEST] Aguardando 30 segundos para inspeção manual...');
    await page.waitForTimeout(30000);

    // Tentar clicar em botão com "download" ou "excel"
    const dlBtn = await page.$('button:has-text("download"), button:has-text("excel"), a[href*=".xlsx"]');
    if (dlBtn) {
      console.log('[TEST] Clicando em botão de download...');
      await dlBtn.click();

      // Aguardar arquivo
      console.log('[TEST] Aguardando download...');
      await page.waitForTimeout(5000);

      const files = fs.readdirSync(outputDir);
      console.log(`[TEST] Arquivos em ${outputDir}:`, files);
    }

    console.log('[TEST] Teste de download concluído');
  } catch (error) {
    console.error('[ERROR]', error.message);
  } finally {
    await browser.close();
  }
}

/**
 * Listar seletores disponíveis na página
 */
async function listPageSelectors(user, password) {
  console.log('[TEST] Analisando página para extrair seletores...');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();

  try {
    // Login
    await page.goto('https://www.grmserver.com.br/login', {
      waitUntil: 'networkidle2',
    });

    await page.type('input[name="username"]', user);
    await page.type('input[name="password"]', password);

    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
    ]);

    // Tentar acessar relatório
    try {
      await page.goto('https://www.grmserver.com.br/relatorios/colaboradores', {
        waitUntil: 'networkidle2',
      });
    } catch (e) {
      console.log('[WARN] Não conseguiu acessar URL direta');
    }

    // Extrair HTML para análise
    const html = await page.content();
    fs.writeFileSync('page-source.html', html);
    console.log('[TEST] HTML da página salvo em: page-source.html');

    // Extrair IDs e classes de botões
    const selectors = await page.evaluate(() => {
      const result = {
        forms: [],
        buttons: [],
        links: [],
        inputs: [],
      };

      // Forms
      document.querySelectorAll('form').forEach((el) => {
        result.forms.push({
          id: el.id,
          class: el.className,
          action: el.action,
        });
      });

      // Buttons
      document.querySelectorAll('button').forEach((el) => {
        result.buttons.push({
          id: el.id,
          class: el.className,
          text: el.textContent.substring(0, 50),
          type: el.type,
        });
      });

      // Links
      document.querySelectorAll('a').forEach((el) => {
        result.links.push({
          id: el.id,
          class: el.className,
          href: el.href,
          text: el.textContent.substring(0, 30),
        });
      });

      // Inputs
      document.querySelectorAll('input').forEach((el) => {
        result.inputs.push({
          name: el.name,
          type: el.type,
          id: el.id,
          class: el.className,
        });
      });

      return result;
    });

    console.log('\n[TEST] SELETORES ENCONTRADOS:\n');
    console.log('Forms:', JSON.stringify(selectors.forms, null, 2));
    console.log('\nButtons:', JSON.stringify(selectors.buttons, null, 2));
    console.log('\nLinks:', JSON.stringify(selectors.links, null, 2));
    console.log('\nInputs:', JSON.stringify(selectors.inputs, null, 2));

    // Salvar em JSON para referência
    fs.writeFileSync('page-selectors.json', JSON.stringify(selectors, null, 2));
    console.log('[TEST] Seletores salvos em: page-selectors.json');
  } catch (error) {
    console.error('[ERROR]', error.message);
  } finally {
    await browser.close();
  }
}

/**
 * Teste de parsing de XLS
 */
function testXlsParsing(filePath) {
  console.log(`[TEST] Parseando arquivo: ${filePath}`);

  try {
    const XLSX = require('xlsx');
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet);

    console.log(`[TEST] Total de linhas: ${rows.length}`);
    console.log(`[TEST] Colunas encontradas:`);

    if (rows.length > 0) {
      Object.keys(rows[0]).forEach((col) => {
        console.log(`  - ${col}`);
      });

      console.log(`\n[TEST] Primeiro registro:`);
      console.log(JSON.stringify(rows[0], null, 2));
    }

    // Salvar amostra em JSON
    fs.writeFileSync('xls-sample.json', JSON.stringify(rows.slice(0, 5), null, 2));
    console.log('[TEST] Amostra salva em: xls-sample.json');
  } catch (error) {
    console.error('[ERROR]', error.message);
  }
}

// ============================================================================
// EXPORTAR FUNÇÕES PARA USO
// ============================================================================

if (require.main === module) {
  // Permitir execução via CLI
  const command = process.argv[2];
  const user = process.env.GRMSERVER_USER;
  const password = process.env.GRMSERVER_PASSWORD;

  if (!user || !password) {
    console.error('Erro: Defina GRMSERVER_USER e GRMSERVER_PASSWORD');
    process.exit(1);
  }

  switch (command) {
    case 'login':
      testLogin(user, password).catch(console.error);
      break;

    case 'download':
      testDownload(user, password).catch(console.error);
      break;

    case 'selectors':
      listPageSelectors(user, password).catch(console.error);
      break;

    case 'parse':
      if (!process.argv[3]) {
        console.error('Uso: node helpers.js parse <caminho-do-arquivo.xlsx>');
        process.exit(1);
      }
      testXlsParsing(process.argv[3]);
      break;

    default:
      console.log(`
Uso: node grmserver-colaboradores-sync-helpers.js <comando>

Comandos:
  login      - Teste interativo de login (headless: false)
  download   - Teste de navegação e download
  selectors  - Analisar página e extrair seletores CSS
  parse      - Parsear arquivo XLS e exibir estrutura

Exemplos:
  node grmserver-colaboradores-sync-helpers.js login
  node grmserver-colaboradores-sync-helpers.js selectors
  node grmserver-colaboradores-sync-helpers.js parse ./colaboradores.xlsx
      `);
      break;
  }
}

module.exports = {
  testLogin,
  testDownload,
  listPageSelectors,
  testXlsParsing,
};
