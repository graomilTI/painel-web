require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
puppeteer.use(StealthPlugin());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  { realtime: { transport: WebSocket } }
);

const SO_ORDER_DISTRIBUTION_URL = 'https://www.grmserver.com.br/operation/sOrderDistribution';
const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = Number(process.env.LIMIT || (limitArg ? limitArg.split('=')[1] : 0)) || 0;

function log(level, msg) {
  console.log(`[${level}] ${new Date().toISOString()} - ${msg}`);
}

function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}
function dateKey(value) { return String(value || '').slice(0, 10); }
function toBrDate(iso) { const [y, m, d] = String(iso).slice(0, 10).split('-'); return y && m && d ? `${d}/${m}/${y}` : null; }
function coordOf(row) { return row.coordenacao || row.coordenacao_os || row.regional || row.supervisao || ''; }
function safe(data) { return Array.isArray(data) ? data : []; }

async function login(page) {
  await page.goto('https://www.grmserver.com.br/login', { waitUntil: 'networkidle2' });
  await page.type('input#input-v-2', process.env.GRMSERVER_USER);
  await page.type('input#input-v-5', process.env.GRMSERVER_PASSWORD);
  await Promise.all([
    page.click('button.submit-btn'),
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
  ]);
}

// --- Coleta e agrupamento das OS pendentes (mesma lógica de assets/js/distribuir-os.js) ---
async function carregarGruposPendentes() {
  const { data: osRows, error: osError } = await supabase
    .from('operacional_os')
    .select('*')
    .eq('status_gestor', 'ATENDER')
    .neq('status_conferencia', 'AJUSTADA')
    .limit(3000);
  if (osError) throw new Error(`Falha ao consultar operacional_os: ${osError.message}`);

  const rows = safe(osRows);
  const ids = rows.map((r) => r.id).filter(Boolean);
  let atrib = [];
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase.from('operacional_os_colaboradores').select('*').in('os_id', chunk);
    if (error) throw new Error(`Falha ao consultar operacional_os_colaboradores: ${error.message}`);
    atrib.push(...safe(data));
  }
  const atribPorOs = new Map();
  for (const a of atrib) {
    const list = atribPorOs.get(String(a.os_id)) || [];
    list.push(a);
    atribPorOs.set(String(a.os_id), list);
  }

  const grupos = new Map();
  for (const row of rows) {
    const vinculados = atribPorOs.get(String(row.id)) || [];
    if (!vinculados.length) continue; // sem colaborador indicado — precisa triagem manual, não é alvo deste agente
    const data = dateKey(row.configurada_em || row.data_os);
    const coord = coordOf(row);
    if (!data || !coord) continue;
    for (const a of vinculados) {
      const nome = a.colaborador_nome || '';
      if (!nome) continue;
      const key = `${data}|${normalize(nome)}|${normalize(coord)}`;
      if (!grupos.has(key)) grupos.set(key, { data, coordenacao: coord, colaborador_nome: nome, os: [] });
      grupos.get(key).os.push(row);
    }
  }
  return [...grupos.values()];
}

// --- Interação com o Graint ---
// O campo rotulado "Supervisão" na tela é o input #olsCode (combobox de busca),
// não o botão #staff-filter (esse é o filtro de status dos funcionários: Todos/Disponíveis/Alocados/...).
async function selecionarSupervisao(page, coordenacao) {
  const alvo = normalize(coordenacao);
  const input = await page.$('#olsCode');
  if (!input) throw new Error('Campo de Supervisão (#olsCode) não encontrado na página.');
  await input.click({ clickCount: 3 });
  await page.keyboard.press('Backspace').catch(() => {});
  await input.type(coordenacao, { delay: 30 });
  await page.waitForFunction(() => {
    return Array.from(document.querySelectorAll('.v-list-item-title')).some((el) => el.offsetParent !== null);
  }, { timeout: 6000 }).catch(() => {});
  const achou = await page.evaluate((alvo) => {
    const items = Array.from(document.querySelectorAll('.v-list-item-title')).filter((el) => el.offsetParent !== null);
    const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    const match = items.find((el) => {
      const t = norm(el.textContent);
      return t.includes(alvo) || alvo.includes(t);
    });
    if (match) { match.click(); return match.textContent.trim(); }
    return null;
  }, alvo);
  if (!achou) throw new Error(`Supervisão "${coordenacao}" não encontrada no campo do Graint.`);
  await new Promise((r) => setTimeout(r, 300));
  return achou;
}

async function ajustarData(page, dataIso) {
  const dataBr = toBrDate(dataIso);
  if (!dataBr) return;
  const atual = await page.$eval('#sodDate', (el) => el.value).catch(() => null);
  if (atual === dataBr) return;
  log('WARN', `Data do Graint (${atual}) difere do grupo (${dataBr}) — ajustando #sodDate.`);
  const input = await page.$('#sodDate');
  await input.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await input.type(dataBr, { delay: 40 });
  await page.keyboard.press('Tab');
}

async function clicarAtualizar(page) {
  await page.click('.sOrderDistribution-act-update button');
  await new Promise((r) => setTimeout(r, 2500));
  await page.waitForSelector('.os-info', { timeout: 15000 });
}

async function localizarLiDaOs(page, numeroOs) {
  const xpath = `//li[.//div[contains(@class,"os-info")]//span[@class="input default" and normalize-space(text())="${numeroOs}"]]`;
  const [li] = await page.$x(xpath);
  return li || null;
}

async function associarColaborador(page, li, colaboradorNome) {
  const input = await li.$('input[role="combobox"]');
  if (!input) throw new Error('Campo de colaborador não encontrado na linha da OS.');
  await input.click();
  await input.type(colaboradorNome, { delay: 30 });
  await page.waitForFunction((nome) => {
    return Array.from(document.querySelectorAll('.v-list-item-title')).some((el) => el.offsetParent !== null && el.textContent.trim().toUpperCase() === nome.toUpperCase());
  }, { timeout: 6000 }, colaboradorNome).catch(() => { throw new Error(`Colaborador "${colaboradorNome}" não encontrado na lista do Graint.`); });

  const clicou = await page.evaluate((nome) => {
    const items = Array.from(document.querySelectorAll('.v-list-item-title')).filter((el) => el.offsetParent !== null);
    const match = items.find((el) => el.textContent.trim().toUpperCase() === nome.toUpperCase());
    if (match) { match.click(); return true; }
    return false;
  }, colaboradorNome);
  if (!clicou) throw new Error(`Não consegui clicar no colaborador "${colaboradorNome}" no Graint.`);
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 400));

  const chipOk = await li.evaluate((el, nome) => {
    return Array.from(el.querySelectorAll('.v-chip__content')).some((c) => c.textContent.trim().toUpperCase() === nome.toUpperCase());
  }, colaboradorNome);
  if (!chipOk) throw new Error(`Chip de "${colaboradorNome}" não apareceu na OS após seleção.`);
}

async function salvar(page) {
  const [btn] = await page.$x('//button[.//span[normalize-space(text())="SALVAR"]]');
  if (!btn) throw new Error('Botão SALVAR não encontrado.');
  const disabled = await page.evaluate((el) => el.disabled, btn);
  if (disabled) { log('WARN', 'Botão SALVAR está desabilitado — nada pendente para salvar (nenhuma mudança detectada).'); return; }
  await btn.click();
  await page.waitForFunction(() => {
    const toast = document.body.textContent || '';
    return toast.includes('Registro atualizado');
  }, { timeout: 10000 }).catch(() => { throw new Error('Não recebi confirmação de salvamento do Graint (toast "Registro atualizado" não apareceu).'); });
}

// --- Grupo a grupo ---
async function processarGrupo(page, grupo) {
  const numerosOs = grupo.os.map((o) => String(o.numero_os));
  log('INFO', `Grupo ${grupo.data} · ${grupo.coordenacao} · ${grupo.colaborador_nome} · OS: ${numerosOs.join(', ')}`);

  await ajustarData(page, grupo.data);
  const supervisaoEncontrada = await selecionarSupervisao(page, grupo.coordenacao);
  log('INFO', `Supervisão selecionada no Graint: "${supervisaoEncontrada}"`);
  await clicarAtualizar(page);

  for (const os of grupo.os) {
    const li = await localizarLiDaOs(page, os.numero_os);
    if (!li) throw new Error(`OS ${os.numero_os} não encontrada na lista do Graint para essa Supervisão/Data.`);
    await associarColaborador(page, li, grupo.colaborador_nome);
  }

  if (DRY_RUN) {
    log('INFO', `[DRY-RUN] Grupo pronto para salvar (${numerosOs.length} OS) — SALVAR e update no Supabase pulados.`);
    return;
  }

  await salvar(page);

  const now = new Date().toISOString();
  const ids = grupo.os.map((o) => o.id);
  const { error } = await supabase
    .from('operacional_os')
    .update({ status_conferencia: 'AJUSTADA', conferido_por: null, conferido_em: now, updated_at: now })
    .in('id', ids);
  if (error) throw new Error(`Graint atualizado, mas falhou ao marcar AJUSTADA no Supabase: ${error.message}`);
  log('SUCCESS', `Grupo aplicado no Graint e marcado como AJUSTADA (${ids.length} OS).`);
}

async function main() {
  let browser;
  let ok = 0;
  let falhas = 0;
  try {
    log('INFO', `=== Aplicar Distribuição de OS no Graint${DRY_RUN ? ' (DRY-RUN)' : ''} ===`);
    let grupos = await carregarGruposPendentes();
    log('INFO', `${grupos.length} grupo(s) pendente(s) com colaborador indicado.`);
    if (LIMIT > 0 && grupos.length > LIMIT) {
      grupos = grupos.slice(0, LIMIT);
      log('INFO', `LIMIT=${LIMIT} — processando só os primeiros ${grupos.length} grupo(s) (uso de teste).`);
    }
    if (!grupos.length) { log('SUCCESS', 'Nada a fazer.'); return; }

    const headless = process.env.HEADLESS === 'false' ? false : true;
    const args = headless
      ? [
          '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
          '--disable-software-rasterizer', '--no-zygote', '--single-process', '--disable-extensions',
          '--disable-background-networking', '--disable-default-apps', '--disable-sync',
          '--metrics-recording-only', '--mute-audio', '--no-first-run', '--no-default-browser-check',
        ]
      : ['--no-sandbox', '--window-size=1600,1000'];
    browser = await puppeteer.launch({
      headless,
      dumpio: true,
      args,
      defaultViewport: headless ? { width: 1920, height: 1440 } : null,
    });
    const page = await browser.newPage();
    if (headless) await page.setViewport({ width: 1920, height: 1440 });
    await login(page);
    await page.goto(SO_ORDER_DISTRIBUTION_URL, { waitUntil: 'networkidle2' });

    for (const grupo of grupos) {
      try {
        await processarGrupo(page, grupo);
        ok += 1;
      } catch (error) {
        falhas += 1;
        log('ERROR', `Grupo ${grupo.data} · ${grupo.coordenacao} · ${grupo.colaborador_nome} falhou: ${error.message}`);
      }
    }
    log('SUCCESS', `Concluído: ${ok} grupo(s) aplicado(s), ${falhas} falha(s).`);
    if (falhas > 0 && ok === 0) throw new Error('Todos os grupos falharam.');
  } catch (error) {
    log('ERROR', error.message);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

main().then(() => process.exit(0)).catch(() => process.exit(1));
setTimeout(() => process.exit(1), 15 * 60 * 1000);
