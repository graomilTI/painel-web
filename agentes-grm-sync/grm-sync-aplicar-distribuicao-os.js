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
const LIMIT = Number(process.env.GRM_DISTRIBUICAO_OS_LIMIT || (limitArg ? limitArg.split('=')[1] : 0)) || 0;
const TIMEOUT_MIN = Number(process.env.GRM_DISTRIBUICAO_OS_TIMEOUT_MIN || 120) || 120;

function log(level, msg) {
  console.log(`[${level}] ${new Date().toISOString()} - ${msg}`);
}

function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}
function dateKey(value) { return String(value || '').slice(0, 10); }
function toBrDate(iso) { const [y, m, d] = String(iso).slice(0, 10).split('-'); return y && m && d ? `${d}/${m}/${y}` : null; }
function dataAceitaNoGraint(iso) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() + 3);
  const data = new Date(`${iso}T00:00:00`);
  return !Number.isNaN(data.getTime()) && data >= hoje && data <= limite;
}
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

// --- Coleta e agrupamento das OS pendentes ---
// O agente processa TODAS as supervisões que tenham OS elegível e colaborador
// indicado. A flag supervisoes.distribuicao_os_automatica não é mais um gate.
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
  const atrib = [];
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

  // O Graint mantém as alterações da tela em memória e habilita SALVAR somente
  // depois de uma distribuição. A unidade de processamento é data + supervisão.
  const grupos = new Map();
  let ignoradasSemSupervisao = 0;
  for (const row of rows) {
    const vinculados = atribPorOs.get(String(row.id)) || [];
    if (!vinculados.length) continue; // não há associação para aplicar

    const data = dateKey(row.configurada_em || row.data_os);
    const coord = coordOf(row);
    if (!data || !dataAceitaNoGraint(data)) continue;
    if (!coord) {
      ignoradasSemSupervisao += 1;
      continue;
    }

    const key = `${data}|${normalize(coord)}`;
    if (!grupos.has(key)) grupos.set(key, { data, coordenacao: coord, atribuicoes: [], osIds: new Set() });
    const grupo = grupos.get(key);
    for (const a of vinculados) {
      const nome = a.colaborador_nome || '';
      if (!nome) continue;
      const duplicada = grupo.atribuicoes.some(
        (item) => item.os.id === row.id && normalize(item.colaborador_nome) === normalize(nome)
      );
      if (duplicada) continue;
      grupo.atribuicoes.push({ os: row, colaborador_nome: nome });
      grupo.osIds.add(row.id);
    }
  }

  if (ignoradasSemSupervisao > 0) {
    log('WARN', `${ignoradasSemSupervisao} O.S. ignorada(s) porque não possuem supervisão informada.`);
  }

  return [...grupos.values()]
    .filter((grupo) => grupo.atribuicoes.length > 0)
    .map((grupo) => ({ ...grupo, osIds: [...grupo.osIds] }));
}

// --- Interação com o Graint ---
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
    const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
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
  const seletor = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const input = document.querySelector('#sodDate') || inputs.find((el) => {
      const contexto = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('placeholder') || ''} ${el.closest('.v-input')?.textContent || ''}`;
      return /\bDATA\b/i.test(contexto) || el.type === 'date';
    });
    if (!input) return null;
    if (input.id) return `#${CSS.escape(input.id)}`;
    input.setAttribute('data-agent-date', 'true');
    return 'input[data-agent-date="true"]';
  });

  if (!seletor) {
    const diagnostico = await page.evaluate(() => ({
      url: location.href,
      titulo: document.title,
      texto: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 500),
      inputs: Array.from(document.querySelectorAll('input')).slice(0, 12).map((el) => ({
        id: el.id, type: el.type, placeholder: el.placeholder, ariaLabel: el.getAttribute('aria-label'),
      })),
    }));
    throw new Error(`Campo de Data não encontrado na nova tela de Distribuição de OS: ${JSON.stringify(diagnostico)}`);
  }

  const atual = await page.$eval(seletor, (el) => el.value).catch(() => null);
  if (atual === dataBr) return;
  log('WARN', `Data do Graint (${atual}) difere do grupo (${dataBr}) — ajustando ${seletor}.`);
  const input = await page.$(seletor);
  if (!input) throw new Error('Campo de Data desapareceu antes do preenchimento.');
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

async function obterPopupId(input) {
  return input.evaluate((el) => el.getAttribute('aria-controls') || el.getAttribute('aria-owns') || '');
}

async function esperarOpcaoColaborador(page, popupId, colaboradorNome) {
  await page.waitForFunction((id, nome) => {
    const visivel = (el) => Boolean(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    let root = id ? document.getElementById(id) : null;
    if (!visivel(root)) {
      const candidatos = Array.from(document.querySelectorAll(
        '.v-overlay--active [role="listbox"], .v-overlay-container [role="listbox"], [role="listbox"]'
      )).filter(visivel);
      root = candidatos[candidatos.length - 1] || null;
    }
    if (!root) return false;
    return Array.from(root.querySelectorAll('.v-list-item-title, [role="option"]')).some((el) =>
      visivel(el) && el.textContent.trim().toUpperCase() === nome.trim().toUpperCase()
    );
  }, { timeout: 6000 }, popupId, colaboradorNome);
}

async function listarOpcoesDoPopup(page, popupId) {
  return page.evaluate((id) => {
    const visivel = (el) => Boolean(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    let root = id ? document.getElementById(id) : null;
    if (!visivel(root)) {
      const candidatos = Array.from(document.querySelectorAll(
        '.v-overlay--active [role="listbox"], .v-overlay-container [role="listbox"], [role="listbox"]'
      )).filter(visivel);
      root = candidatos[candidatos.length - 1] || null;
    }
    if (!root) return [];
    return Array.from(root.querySelectorAll('.v-list-item-title, [role="option"]'))
      .filter(visivel)
      .map((el) => el.textContent.trim())
      .filter(Boolean)
      .slice(0, 12);
  }, popupId);
}

async function clicarOpcaoColaborador(page, popupId, colaboradorNome) {
  return page.evaluate((id, nome) => {
    const visivel = (el) => Boolean(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    let root = id ? document.getElementById(id) : null;
    if (!visivel(root)) {
      const candidatos = Array.from(document.querySelectorAll(
        '.v-overlay--active [role="listbox"], .v-overlay-container [role="listbox"], [role="listbox"]'
      )).filter(visivel);
      root = candidatos[candidatos.length - 1] || null;
    }
    if (!root) return false;
    const alvo = nome.trim().toUpperCase();
    const match = Array.from(root.querySelectorAll('.v-list-item-title, [role="option"]'))
      .find((el) => visivel(el) && el.textContent.trim().toUpperCase() === alvo);
    if (!match) return false;
    const clicavel = match.closest('[role="option"], .v-list-item') || match;
    clicavel.click();
    return true;
  }, popupId, colaboradorNome);
}

async function colaboradorJaAssociado(li, colaboradorNome) {
  const alvo = colaboradorNome.trim().toUpperCase();
  return li.evaluate((el, nome) => {
    const chip = Array.from(el.querySelectorAll('.v-chip__content')).some((c) => c.textContent.trim().toUpperCase() === nome);
    const valor = Array.from(el.querySelectorAll('input[role="combobox"]')).some((item) => item.value.trim().toUpperCase() === nome);
    const selecao = Array.from(el.querySelectorAll('.v-select__selection-text, .v-autocomplete__selection-text'))
      .some((item) => item.textContent.trim().toUpperCase() === nome);
    return chip || valor || selecao;
  }, alvo);
}

async function associarColaborador(page, li, colaboradorNome) {
  // Se a OS já está com o mesmo colaborador no Graint, não mexe — evita
  // limpar e reaplicar a mesma associação a cada ciclo (gera ruído no log
  // do GRM e retrabalho sem necessidade). Só limpa/redigita se for outra pessoa.
  if (await colaboradorJaAssociado(li, colaboradorNome)) return;

  await li.click();
  await new Promise((resolve) => setTimeout(resolve, 250));

  const inputs = await li.$$('input[role="combobox"]');
  let input = null;
  for (const candidato of inputs) {
    const caixa = await candidato.boundingBox();
    if (caixa && caixa.width > 0 && caixa.height > 0) { input = candidato; break; }
  }
  if (!input && inputs.length) input = inputs[0];
  if (!input) {
    const diagnostico = await li.evaluate((el) => ({
      texto: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 300),
      inputs: Array.from(el.querySelectorAll('input')).map((item) => ({
        id: item.id, role: item.getAttribute('role'), type: item.type, className: item.className,
      })),
    }));
    throw new Error(`Campo de colaborador não encontrado na linha da OS: ${JSON.stringify(diagnostico)}`);
  }

  const campoVisual = await li.$('.v-autocomplete .v-field, .v-select .v-field');
  if (campoVisual) await campoVisual.evaluate((el) => el.click());
  await input.focus();
  await page.keyboard.down('Control').catch(() => null);
  await page.keyboard.press('A').catch(() => null);
  await page.keyboard.up('Control').catch(() => null);
  await page.keyboard.press('Backspace').catch(() => null);
  await input.type(colaboradorNome, { delay: 30 });

  const popupId = await obterPopupId(input);
  try {
    await esperarOpcaoColaborador(page, popupId, colaboradorNome);
  } catch (_) {
    const disponiveis = await listarOpcoesDoPopup(page, popupId);
    throw new Error(
      `Colaborador "${colaboradorNome}" não encontrado no autocomplete desta OS. `
      + `Opções do autocomplete: ${disponiveis.join(' | ') || 'nenhuma'}.`
    );
  }

  const clicou = await clicarOpcaoColaborador(page, popupId, colaboradorNome);
  if (!clicou) throw new Error(`Não consegui clicar no colaborador "${colaboradorNome}" no autocomplete desta OS.`);
  await page.keyboard.press('Escape').catch(() => null);
  await new Promise((r) => setTimeout(r, 400));

  const chipOk = await li.evaluate((el, nome) => {
    const alvo = nome.trim().toUpperCase();
    const chip = Array.from(el.querySelectorAll('.v-chip__content')).some((c) => c.textContent.trim().toUpperCase() === alvo);
    const valor = Array.from(el.querySelectorAll('input[role="combobox"]')).some((item) => item.value.trim().toUpperCase() === alvo);
    const selecao = Array.from(el.querySelectorAll('.v-select__selection-text, .v-autocomplete__selection-text'))
      .some((item) => item.textContent.trim().toUpperCase() === alvo);
    return chip || valor || selecao;
  }, colaboradorNome);
  if (!chipOk) throw new Error(`Chip de "${colaboradorNome}" não apareceu na OS após seleção.`);
}

async function salvar(page) {
  await page.waitForFunction(() => {
    const normalizar = (valor) => String(valor || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    return [...document.querySelectorAll('button, [role="button"]')].some((el) => {
      const rotulo = normalizar([
        el.textContent, el.getAttribute('aria-label'), el.getAttribute('title'), el.getAttribute('value'),
      ].filter(Boolean).join(' '));
      return el.getClientRects().length > 0 && /(^|\s)SALVAR(\s|$)/.test(rotulo);
    });
  }, { timeout: 6000 }).catch(() => null);

  const resultado = await page.evaluate(() => {
    const normalizar = (valor) => String(valor || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
    const visiveis = [...document.querySelectorAll('button, [role="button"]')]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => ({
        el,
        texto: normalizar(el.textContent),
        rotulo: normalizar([
          el.textContent, el.getAttribute('aria-label'), el.getAttribute('title'), el.getAttribute('value'),
        ].filter(Boolean).join(' ')),
      }));
    const candidato = visiveis.find((item) => item.texto === 'SALVAR')
      || visiveis.find((item) => /(^|\s)SALVAR(\s|$)/.test(item.rotulo));

    if (!candidato) {
      return { ok: false, motivo: 'ausente', botoes: visiveis.map((item) => item.rotulo).filter(Boolean).slice(0, 20) };
    }
    const desabilitado = candidato.el.disabled
      || candidato.el.getAttribute('aria-disabled') === 'true'
      || candidato.el.classList.contains('v-btn--disabled');
    if (desabilitado) return { ok: false, motivo: 'desabilitado', botoes: [candidato.rotulo] };
    candidato.el.click();
    return { ok: true, rotulo: candidato.rotulo };
  });

  if (!resultado.ok) {
    const disponiveis = resultado.botoes?.join(' | ') || 'nenhum';
    throw new Error(`Botão SALVAR ${resultado.motivo === 'desabilitado' ? 'está desabilitado' : 'não encontrado'}. Botões visíveis: ${disponiveis}`);
  }

  await page.waitForFunction(() => {
    const normalizar = (valor) => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const avisos = [...document.querySelectorAll('.v-snackbar, .v-toast, [role="status"], [role="alert"]')]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => normalizar(el.textContent));
    return avisos.some((texto) => texto.includes('REGISTRO ATUALIZADO') || texto.includes('ATUALIZADO COM SUCESSO'));
  }, { timeout: 10000 }).catch(() => {
    throw new Error(`Cliquei em "${resultado.rotulo}", mas não recebi confirmação de salvamento do Graint.`);
  });
}

async function processarSupervisao(page, grupo) {
  const numerosOs = [...new Set(grupo.atribuicoes.map((item) => String(item.os.numero_os)))];
  log('INFO', `Supervisão ${grupo.data} · ${grupo.coordenacao} · ${numerosOs.length} OS · ${grupo.atribuicoes.length} associação(ões)`);

  await ajustarData(page, grupo.data);
  const supervisaoEncontrada = await selecionarSupervisao(page, grupo.coordenacao);
  log('INFO', `Supervisão selecionada no Graint: "${supervisaoEncontrada}"`);
  await clicarAtualizar(page);

  // Aplica toda a distribuição da supervisão antes do único SALVAR da tela. Uma
  // associação com problema (ex.: colaborador não encontrado no Graint pra essa
  // supervisão) não pode travar as demais OS da mesma tela — só ela fica pendente
  // pro próximo ciclo, o resto segue e é salvo normalmente.
  const idsComSucesso = new Set();
  const falhasAssociacao = [];
  for (const atribuicao of grupo.atribuicoes) {
    try {
      const li = await localizarLiDaOs(page, atribuicao.os.numero_os);
      if (!li) throw new Error(`OS ${atribuicao.os.numero_os} não encontrada na lista do Graint para essa Supervisão/Data.`);
      await associarColaborador(page, li, atribuicao.colaborador_nome);
      idsComSucesso.add(atribuicao.os.id);
    } catch (error) {
      falhasAssociacao.push(`OS ${atribuicao.os.numero_os} / ${atribuicao.colaborador_nome}: ${error.message}`);
      log('ERROR', `Associação OS ${atribuicao.os.numero_os} / ${atribuicao.colaborador_nome} falhou: ${error.message}`);
      // Fecha qualquer dropdown/overlay que tenha ficado aberto, senão atrapalha a próxima associação.
      await page.keyboard.press('Escape').catch(() => null);
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  if (!idsComSucesso.size) {
    throw new Error(`Nenhuma associação aplicada nesta supervisão (${falhasAssociacao.length} falha(s)): ${falhasAssociacao.join(' | ')}`);
  }

  if (DRY_RUN) {
    log('INFO', `[DRY-RUN] Supervisão pronta para salvar (${idsComSucesso.size} de ${numerosOs.length} OS, ${grupo.atribuicoes.length - falhasAssociacao.length} de ${grupo.atribuicoes.length} associações) — SALVAR e update no Supabase pulados.`);
    return;
  }

  await salvar(page);

  const now = new Date().toISOString();
  const ids = [...idsComSucesso];
  const { error } = await supabase
    .from('operacional_os')
    .update({ status_conferencia: 'AJUSTADA', conferido_por: null, conferido_em: now, updated_at: now })
    .in('id', ids);
  if (error) throw new Error(`Graint atualizado, mas falhou ao marcar AJUSTADA no Supabase: ${error.message}`);
  log(
    falhasAssociacao.length ? 'WARN' : 'SUCCESS',
    `Supervisão aplicada no Graint e marcada como AJUSTADA (${ids.length} de ${numerosOs.length} OS)`
      + (falhasAssociacao.length ? `; ${falhasAssociacao.length} associação(ões) pendente(s) pro próximo ciclo: ${falhasAssociacao.join(' | ')}` : '') + '.',
  );
}

async function main() {
  let browser;
  let ok = 0;
  let falhas = 0;
  try {
    log('INFO', `=== Aplicar Distribuição de OS no Graint${DRY_RUN ? ' (DRY-RUN)' : ''} ===`);
    log('INFO', `Watchdog global configurado para ${TIMEOUT_MIN} minuto(s).`);
    let grupos = await carregarGruposPendentes();
    log('INFO', `${grupos.length} supervisão(ões)/data pendente(s) com colaborador indicado — sem filtro de habilitação por supervisão.`);

    if (LIMIT > 0 && grupos.length > LIMIT) {
      grupos = grupos.slice(0, LIMIT);
      log('INFO', `GRM_DISTRIBUICAO_OS_LIMIT/LIMIT de teste=${LIMIT} — processando só as primeiras ${grupos.length} supervisão(ões)/data.`);
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

    let filtrosProntos = Boolean(await page.$('#olsCode')) && Boolean(await page.$('#sodDate'));
    if (!filtrosProntos) {
      const botaoFiltro = await page.$('.sOrderDistribution-act-filter button, .v-badge__wrapper button');
      if (botaoFiltro) {
        await botaoFiltro.click();
      } else {
        await page.evaluate(() => {
          const botao = Array.from(document.querySelectorAll('button')).find((el) => {
            const contexto = `${el.textContent || ''} ${el.title || ''} ${el.getAttribute('aria-label') || ''} ${el.className || ''}`;
            return /FILT(RAR|RO)|PESQUISAR|TOGGLESEARCH/i.test(contexto);
          });
          if (botao) botao.click();
        });
      }
      await page.waitForSelector('#olsCode', { timeout: 6000 }).catch(() => null);
      await page.waitForSelector('#sodDate', { timeout: 6000 }).catch(() => null);
      filtrosProntos = Boolean(await page.$('#olsCode')) && Boolean(await page.$('#sodDate'));
    }
    if (!filtrosProntos) {
      throw new Error('Painel de filtros abriu, mas os campos Supervisão (#olsCode) e Data (#sodDate) não ficaram disponíveis.');
    }

    for (const grupo of grupos) {
      try {
        await processarSupervisao(page, grupo);
        ok += 1;
      } catch (error) {
        falhas += 1;
        log('ERROR', `Supervisão ${grupo.data} · ${grupo.coordenacao} falhou: ${error.message}`);
      }
    }

    log('SUCCESS', `Concluído: ${ok} supervisão(ões)/data aplicada(s), ${falhas} falha(s).`);
    if (falhas > 0 && ok === 0) throw new Error('Todas as supervisões falharam.');
  } catch (error) {
    log('ERROR', error.message);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

main().then(() => process.exit(0)).catch(() => process.exit(1));
setTimeout(() => {
  log('ERROR', `Watchdog global atingiu ${TIMEOUT_MIN} minuto(s); encerrando o agente para não bloquear a fila indefinidamente.`);
  process.exit(1);
}, TIMEOUT_MIN * 60 * 1000);
