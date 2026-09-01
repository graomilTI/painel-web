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
  const user = process.env.GRMSERVER_USER;
  const password = process.env.GRMSERVER_PASSWORD;
  if (!user || !password) throw new Error('Credenciais GRMSERVER_USER/GRMSERVER_PASSWORD ausentes.');

  await page.goto('https://www.grmserver.com.br/login', { waitUntil: 'networkidle2', timeout: 60000 });

  // Os IDs input-v-* são gerados pelo Vuetify e mudam entre versões; localiza
  // os controles pelas características estáveis do formulário.
  try {
    await page.waitForFunction(() => {
      const visible = (element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
      };
      const inputs = [...document.querySelectorAll('input')].filter(visible);
      return inputs.some((input) => input.type === 'password')
        && inputs.some((input) => !['password', 'hidden', 'submit', 'button'].includes(input.type));
    }, { timeout: 30000 });
  } catch (error) {
    const diagnostico = await page.evaluate(() => ({
      titulo: document.title,
      inputs: [...document.querySelectorAll('input')].map((input) => ({
        type: input.type, name: input.name, id: input.id, autocomplete: input.autocomplete,
      })),
    })).catch(() => ({ titulo: '', inputs: [] }));
    throw new Error(`Formulário de login do Graint não apareceu. URL=${page.url()} título=${JSON.stringify(diagnostico.titulo)} inputs=${JSON.stringify(diagnostico.inputs)}`);
  }

  const campos = await page.$$('input');
  let passwordInput = null;
  let userInput = null;
  for (const campo of campos) {
    const info = await campo.evaluate((input) => {
      const style = window.getComputedStyle(input);
      const rect = input.getBoundingClientRect();
      return {
        visible: style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0,
        type: input.type, name: input.name, id: input.id, autocomplete: input.autocomplete,
      };
    });
    if (!info.visible) continue;
    if (info.type === 'password') passwordInput ||= campo;
    else if (!['hidden', 'submit', 'button'].includes(info.type)) {
      const identidade = `${info.name} ${info.id} ${info.autocomplete}`.toLowerCase();
      if (!userInput || /user|email|login|usuario|username/.test(identidade)) userInput = campo;
    }
  }
  if (!userInput || !passwordInput) throw new Error(`Não foi possível identificar os campos de login do Graint. URL=${page.url()}`);

  await userInput.click({ clickCount: 3 });
  await userInput.type(user);
  await passwordInput.click({ clickCount: 3 });
  await passwordInput.type(password);

  const submit = await page.$('button.submit-btn, button[type="submit"], input[type="submit"]');
  if (!submit) throw new Error(`Botão de entrada do Graint não encontrado. URL=${page.url()}`);
  await Promise.allSettled([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
    submit.click(),
  ]);
  await page.waitForFunction(() => !/\/login\/?(?:[?#].*)?$/.test(window.location.href), { timeout: 30000 })
    .catch(() => { throw new Error(`Login do Graint não foi concluído; a página permaneceu em ${page.url()}.`); });
}

// --- Coleta e agrupamento das OS pendentes ---
// O agente processa TODAS as supervisões que tenham OS elegível, em dois sentidos:
//   - aplicar: colaborador indicado no painel, ainda não refletido no Graint;
//   - limpar: OS que já tinha sido aplicada (AJUSTADA) e teve a indicação de
//     colaborador removida no painel depois — o Graint precisa refletir essa
//     remoção também, senão fica com gente associada que o painel não mostra mais.
// A flag supervisoes.distribuicao_os_automatica não é mais um gate.
async function carregarGruposPendentes() {
  const { data: osRows, error: osError } = await supabase
    .from('operacional_os')
    .select('*')
    .eq('status_gestor', 'ATENDER')
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
    const precisaAplicar = vinculados.length > 0 && row.status_conferencia !== 'AJUSTADA';
    const precisaLimpar = vinculados.length === 0 && row.status_conferencia === 'AJUSTADA';
    if (!precisaAplicar && !precisaLimpar) continue;

    // data_os é a data em que a O.S. está sendo atendida (o que o Graint precisa
    // saber); configurada_em é só "quando o gestor mexeu pela 1ª vez no status" e
    // fica travado em O.S. remanescentes reaproveitadas em vários dias seguintes
    // — priorizá-lo aqui fazia a janela de 3 dias excluir essas O.S. pra sempre,
    // mesmo com data_os e colaborador corretos (achado em produção 01/09, O.S. 90497).
    const data = dateKey(row.data_os || row.configurada_em);
    const coord = coordOf(row);
    if (!data || !dataAceitaNoGraint(data)) continue;
    if (!coord) {
      ignoradasSemSupervisao += 1;
      continue;
    }

    const key = `${data}|${normalize(coord)}`;
    if (!grupos.has(key)) grupos.set(key, { data, coordenacao: coord, atribuicoes: [], remocoes: [], osIds: new Set() });
    const grupo = grupos.get(key);

    if (precisaAplicar) {
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
    } else {
      grupo.remocoes.push({ os: row });
      grupo.osIds.add(row.id);
    }
  }

  if (ignoradasSemSupervisao > 0) {
    log('WARN', `${ignoradasSemSupervisao} O.S. ignorada(s) porque não possuem supervisão informada.`);
  }

  return [...grupos.values()]
    .filter((grupo) => grupo.atribuicoes.length > 0 || grupo.remocoes.length > 0)
    .map((grupo) => ({ ...grupo, osIds: [...grupo.osIds] }));
}

// --- Interação com o Graint ---
async function selecionarSupervisao(page, coordenacao) {
  const alvo = normalize(coordenacao);
  const input = await page.$('#olsCode');
  if (!input) throw new Error('Campo de Supervisão (#olsCode) não encontrado na página.');

  await input.focus();
  await page.keyboard.down('Control').catch(() => null);
  await page.keyboard.press('A').catch(() => null);
  await page.keyboard.up('Control').catch(() => null);
  await page.keyboard.press('Backspace').catch(() => null);
  await input.type(coordenacao, { delay: 30 });

  // No Vuetify o menu do autocomplete é teleportado para um overlay fora do
  // campo. Procurar somente .v-list-item-title no fluxo normal pode enxergar o
  // texto na tela e ainda assim não localizar a opção correta pelo DOM.
  const popupId = await obterPopupId(input);
  const localizarRoot = `
    const visivel = (el) => Boolean(
      el && el.getClientRects().length
      && getComputedStyle(el).visibility !== 'hidden'
      && getComputedStyle(el).display !== 'none'
    );
    let root = id ? document.getElementById(id) : null;
    if (!visivel(root)) {
      const candidatos = Array.from(document.querySelectorAll(
        '.v-overlay--active [role="listbox"], .v-overlay--active .v-list, '
        + '.v-overlay-container [role="listbox"], .v-overlay-container .v-list, [role="listbox"]'
      )).filter(visivel);
      root = candidatos[candidatos.length - 1] || null;
    }
  `;

  try {
    await page.waitForFunction(new Function('id', 'alvo', `
      ${localizarRoot}
      if (!root) return false;
      const norm = (s) => String(s || '').normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '').toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ').trim();
      const opcoes = Array.from(root.querySelectorAll('.v-list-item-title, [role="option"]')).filter(visivel);
      return opcoes.some((el) => norm(el.textContent) === alvo)
        || opcoes.some((el) => {
          const texto = norm(el.textContent);
          return texto && (texto.includes(alvo) || alvo.includes(texto));
        });
    `), { timeout: 8000 }, popupId, alvo);
  } catch (_) {
    const disponiveis = await page.evaluate(new Function('id', `
      ${localizarRoot}
      if (!root) return [];
      return Array.from(root.querySelectorAll('.v-list-item-title, [role="option"]'))
        .filter(visivel)
        .map((el) => (el.textContent || '').trim())
        .filter(Boolean)
        .slice(0, 20);
    `), popupId).catch(() => []);
    throw new Error(
      `Supervisão "${coordenacao}" não encontrada no autocomplete do Graint. `
      + `Opções apresentadas: ${disponiveis.join(' | ') || 'nenhuma'}.`
    );
  }

  const achou = await page.evaluate(new Function('id', 'alvo', `
    ${localizarRoot}
    if (!root) return null;
    const norm = (s) => String(s || '').normalize('NFD')
      .replace(/[\\u0300-\\u036f]/g, '').toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ').trim();
    const opcoes = Array.from(root.querySelectorAll('.v-list-item-title, [role="option"]')).filter(visivel);
    const match = opcoes.find((el) => norm(el.textContent) === alvo)
      || opcoes.find((el) => {
        const texto = norm(el.textContent);
        return texto && (texto.includes(alvo) || alvo.includes(texto));
      });
    if (!match) return null;
    const texto = (match.textContent || '').trim();
    const clicavel = match.closest('[role="option"], .v-list-item') || match;
    clicavel.scrollIntoView({ block: 'nearest' });
    clicavel.click();
    return texto;
  `), popupId, alvo);

  if (!achou) throw new Error(`Não consegui clicar na supervisão "${coordenacao}" no autocomplete do Graint.`);

  await new Promise((r) => setTimeout(r, 500));
  const confirmacao = await page.evaluate((alvoEsperado) => {
    const norm = (s) => String(s || '').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ').trim();
    const campo = document.querySelector('#olsCode');
    const host = campo?.closest('.v-input, .v-autocomplete, .v-select') || campo?.parentElement;
    const valores = [
      campo?.value,
      ...(host ? Array.from(host.querySelectorAll('.v-select__selection-text, .v-autocomplete__selection-text, .v-chip__content'))
        .map((el) => el.textContent) : []),
    ].filter(Boolean);
    return { ok: valores.some((valor) => norm(valor) === alvoEsperado), valores };
  }, alvo);

  if (!confirmacao.ok) {
    throw new Error(
      `Cliquei na supervisão "${achou}", mas o campo não confirmou a seleção. `
      + `Valor(es) após o clique: ${confirmacao.valores.join(' | ') || 'vazio'}.`
    );
  }

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
  if (await colaboradorJaAssociado(li, colaboradorNome)) return { alterado: false };

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
  return { alterado: true };
}

async function limparColaborador(page, li) {
  const temValor = await li.evaluate((el) => {
    const chip = el.querySelector('.v-chip__content');
    const combo = el.querySelector('input[role="combobox"]');
    const selecao = el.querySelector('.v-select__selection-text, .v-autocomplete__selection-text');
    return Boolean(chip || selecao || (combo && combo.value.trim()));
  });
  if (!temValor) return { alterado: false };

  await li.click();
  await new Promise((resolve) => setTimeout(resolve, 250));

  // Vuetify expõe um botão nativo de limpar em campos "clearable" em algumas
  // versões do tema; usa se existir, senão limpa via teclado (mesmo padrão de
  // associarColaborador: focar, selecionar tudo, apagar).
  const limpouPeloBotao = await li.evaluate((el) => {
    const botao = el.querySelector(
      '.v-field__clearable button, .v-input__icon--clear button, button[aria-label="clear icon"], .mdi-close-circle'
    );
    if (botao) { botao.click(); return true; }
    return false;
  });

  if (!limpouPeloBotao) {
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
      throw new Error(`Campo de colaborador não encontrado na linha da OS pra limpar: ${JSON.stringify(diagnostico)}`);
    }

    const campoVisual = await li.$('.v-autocomplete .v-field, .v-select .v-field');
    if (campoVisual) await campoVisual.evaluate((el) => el.click());
    await input.focus();
    await page.keyboard.down('Control').catch(() => null);
    await page.keyboard.press('A').catch(() => null);
    await page.keyboard.up('Control').catch(() => null);
    await page.keyboard.press('Backspace').catch(() => null);
    await page.keyboard.press('Backspace').catch(() => null);
  }

  await page.keyboard.press('Escape').catch(() => null);
  await new Promise((r) => setTimeout(r, 400));

  const aindaTemValor = await li.evaluate((el) => {
    const chip = el.querySelector('.v-chip__content');
    const combo = el.querySelector('input[role="combobox"]');
    const selecao = el.querySelector('.v-select__selection-text, .v-autocomplete__selection-text');
    return Boolean(chip || selecao || (combo && combo.value.trim()));
  });
  if (aindaTemValor) throw new Error('Não consegui limpar o colaborador desta OS no Graint (campo continua preenchido após a tentativa).');

  return { alterado: true };
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
  const numerosOsAplicar = [...new Set(grupo.atribuicoes.map((item) => String(item.os.numero_os)))];
  const numerosOsLimpar = [...new Set(grupo.remocoes.map((item) => String(item.os.numero_os)))];
  log(
    'INFO',
    `Supervisão ${grupo.data} · ${grupo.coordenacao} · ${numerosOsAplicar.length} OS a aplicar `
      + `(${grupo.atribuicoes.length} associação(ões)) · ${numerosOsLimpar.length} OS a limpar`,
  );

  await ajustarData(page, grupo.data);
  const supervisaoEncontrada = await selecionarSupervisao(page, grupo.coordenacao);
  log('INFO', `Supervisão selecionada no Graint: "${supervisaoEncontrada}"`);
  await clicarAtualizar(page);

  // Aplica toda a distribuição da supervisão antes do único SALVAR da tela. Uma
  // associação ou limpeza com problema (ex.: colaborador não encontrado no Graint
  // pra essa supervisão) não pode travar as demais OS da mesma tela — só ela fica
  // pendente pro próximo ciclo, o resto segue e é salvo normalmente.
  const idsComSucesso = new Set();
  const idsComFalha = new Set();
  const falhas = [];
  let mudancasAplicadas = 0;
  for (const atribuicao of grupo.atribuicoes) {
    try {
      const li = await localizarLiDaOs(page, atribuicao.os.numero_os);
      if (!li) throw new Error(`OS ${atribuicao.os.numero_os} não encontrada na lista do Graint para essa Supervisão/Data.`);
      const resultado = await associarColaborador(page, li, atribuicao.colaborador_nome);
      if (resultado.alterado) mudancasAplicadas += 1;
      idsComSucesso.add(atribuicao.os.id);
    } catch (error) {
      idsComFalha.add(atribuicao.os.id);
      falhas.push(`OS ${atribuicao.os.numero_os} / associar ${atribuicao.colaborador_nome}: ${error.message}`);
      log('ERROR', `Associação OS ${atribuicao.os.numero_os} / ${atribuicao.colaborador_nome} falhou: ${error.message}`);
      // Fecha qualquer dropdown/overlay que tenha ficado aberto, senão atrapalha a próxima associação.
      await page.keyboard.press('Escape').catch(() => null);
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  // OS que já tinham sido aplicadas (AJUSTADA) e ficaram sem colaborador indicado
  // no painel — precisa limpar a associação no Graint pra ele continuar refletindo
  // o painel também nesse sentido (não só adicionar, também remover).
  const idsLimpezaComSucesso = new Set();
  const idsLimpezaComFalha = new Set();
  for (const remocao of grupo.remocoes) {
    try {
      const li = await localizarLiDaOs(page, remocao.os.numero_os);
      if (!li) throw new Error(`OS ${remocao.os.numero_os} não encontrada na lista do Graint para essa Supervisão/Data.`);
      const resultado = await limparColaborador(page, li);
      if (resultado.alterado) mudancasAplicadas += 1;
      idsLimpezaComSucesso.add(remocao.os.id);
    } catch (error) {
      idsLimpezaComFalha.add(remocao.os.id);
      falhas.push(`OS ${remocao.os.numero_os} / limpar: ${error.message}`);
      log('ERROR', `Limpeza OS ${remocao.os.numero_os} falhou: ${error.message}`);
      await page.keyboard.press('Escape').catch(() => null);
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  // Uma OS pode ter mais de um colaborador. Ela só pode ser marcada como
  // AJUSTADA quando todas as associações dela foram confirmadas nesta rodada.
  const idsConfirmados = new Set([...idsComSucesso].filter((id) => !idsComFalha.has(id)));
  const idsLimpezaConfirmados = new Set([...idsLimpezaComSucesso].filter((id) => !idsLimpezaComFalha.has(id)));
  if (!idsConfirmados.size && !idsLimpezaConfirmados.size) {
    throw new Error(`Nenhuma alteração aplicada nesta supervisão (${falhas.length} falha(s)): ${falhas.join(' | ')}`);
  }

  if (DRY_RUN) {
    log(
      'INFO',
      `[DRY-RUN] Supervisão conferida (${idsConfirmados.size} de ${numerosOsAplicar.length} OS aplicada(s), `
        + `${idsLimpezaConfirmados.size} de ${numerosOsLimpar.length} OS limpa(s), ${mudancasAplicadas} mudança(s)) `
        + '— SALVAR e update no Supabase pulados.',
    );
    return;
  }

  if (mudancasAplicadas > 0) {
    await salvar(page);
  } else {
    // Quando tudo já está correto (aplicado ou limpo), o Graint não habilita
    // SALVAR porque não há alteração pendente. Esse é um estado sincronizado,
    // não uma falha; basta encerrar a pendência local.
    log('INFO', 'Todas as OS já estavam corretas no Graint; salvamento não necessário.');
  }

  const now = new Date().toISOString();
  if (idsConfirmados.size) {
    const { error } = await supabase
      .from('operacional_os')
      .update({ status_conferencia: 'AJUSTADA', conferido_por: null, conferido_em: now, updated_at: now })
      .in('id', [...idsConfirmados]);
    if (error) throw new Error(`Graint atualizado, mas falhou ao marcar AJUSTADA no Supabase: ${error.message}`);
  }
  if (idsLimpezaConfirmados.size) {
    // Volta pra PENDENTE (não AJUSTADA): o Graint agora reflete "sem colaborador",
    // igual ao painel. Se alguém indicar um novo colaborador depois, o fluxo normal
    // de aplicação processa de novo.
    const { error } = await supabase
      .from('operacional_os')
      .update({ status_conferencia: 'PENDENTE', conferido_por: null, conferido_em: now, updated_at: now })
      .in('id', [...idsLimpezaConfirmados]);
    if (error) throw new Error(`Graint limpo, mas falhou ao voltar status para PENDENTE no Supabase: ${error.message}`);
  }

  log(
    falhas.length ? 'WARN' : 'SUCCESS',
    `Supervisão processada: ${idsConfirmados.size} de ${numerosOsAplicar.length} OS aplicada(s), `
      + `${idsLimpezaConfirmados.size} de ${numerosOsLimpar.length} OS limpa(s)`
      + (falhas.length ? `; ${falhas.length} pendência(s) pro próximo ciclo: ${falhas.join(' | ')}` : '') + '.',
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
    const totalAplicar = grupos.reduce((soma, g) => soma + g.atribuicoes.length, 0);
    const totalLimpar = grupos.reduce((soma, g) => soma + g.remocoes.length, 0);
    log(
      'INFO',
      `${grupos.length} supervisão(ões)/data pendente(s): ${totalAplicar} associação(ões) a aplicar, `
        + `${totalLimpar} OS a limpar — todas as regionais, sem filtro de habilitação por supervisão.`,
    );

    if (LIMIT > 0 && grupos.length > LIMIT) {
      grupos = grupos.slice(0, LIMIT);
      log('INFO', `GRM_DISTRIBUICAO_OS_LIMIT/LIMIT de teste=${LIMIT} — processando só as primeiras ${grupos.length} supervisão(ões)/data.`);
    }
    if (!grupos.length) { log('SUCCESS', 'Nada a fazer.'); return; }

    const headless = process.env.HEADLESS === 'false' ? false : 'new';
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

    // Instrumentação temporária pra descobrir o endpoint de escrita da
    // Distribuição de OS (investigação 01/09, mesmo método usado pra
    // descobrir serviceOrder/getRecords). Só ativa com CAPTURE_NET=true.
    if (process.env.CAPTURE_NET === 'true') {
      page.on('request', (req) => {
        const method = req.method();
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && /\/api\//.test(req.url())) {
          log('CAPTURE', `REQ ${method} ${req.url()} :: ${req.postData() || ''}`);
        }
      });
      page.on('response', async (res) => {
        const req = res.request();
        const method = req.method();
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && /\/api\//.test(req.url())) {
          let body = '';
          try { body = (await res.text()).slice(0, 2000); } catch (_) { /* corpo binário/streaming */ }
          log('CAPTURE', `RES ${res.status()} ${req.url()} :: ${body}`);
        }
      });
    }

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
