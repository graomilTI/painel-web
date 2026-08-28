#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const target = process.argv[2] || path.join(__dirname, 'grm-sync-reabrir-os.js');
let source = fs.readFileSync(target, 'utf8');

function replaceOnce(before, after, label) {
  if (!source.includes(before)) {
    if (source.includes(after)) {
      console.log(`[patch] ${label}: já aplicado.`);
      return;
    }
    throw new Error(`[patch] ${label}: bloco original não encontrado em ${target}`);
  }
  source = source.replace(before, after);
  console.log(`[patch] ${label}: aplicado.`);
}

replaceOnce(
`async function selectOpenOption(page, target) {
  await wait(450);
  return page.evaluate((wantedText) => {
    function norm(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .replace(/\\s+/g, ' ')
        .trim()
        .toUpperCase();
    }
    const wanted = norm(wantedText);
    const overlays = Array.from(document.querySelectorAll('.v-overlay--active'));
    for (let i = overlays.length - 1; i >= 0; i -= 1) {
      const options = Array.from(overlays[i].querySelectorAll('[role="option"], .v-list-item'));
      const option = options.find((item) => {
        const text = norm(item.innerText || item.textContent || '');
        return text === wanted || text.includes(wanted) || wanted.includes(text);
      });
      if (option) {
        option.click();
        return String(option.innerText || option.textContent || '').trim();
      }
    }
    return null;
  }, target);
}
`,
`async function selectOpenOption(page, target) {
  await wait(450);
  return page.evaluate((wantedText) => {
    function norm(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .replace(/\\s+/g, ' ')
        .trim()
        .toUpperCase();
    }
    const wanted = norm(wantedText);
    const overlays = Array.from(document.querySelectorAll('.v-overlay--active'));
    for (let i = overlays.length - 1; i >= 0; i -= 1) {
      const options = Array.from(overlays[i].querySelectorAll('[role="option"], .v-list-item'));
      const exact = options.find((item) => norm(item.innerText || item.textContent || '') === wanted);
      const partial = options.find((item) => {
        const text = norm(item.innerText || item.textContent || '');
        return text.includes(wanted) || wanted.includes(text);
      });
      const option = exact || partial;
      if (option) {
        option.click();
        return String(option.innerText || option.textContent || '').trim();
      }
    }
    return null;
  }, target);
}

async function listFilterOptions(page, label) {
  await ensureFiltersVisible(page);
  const opened = await clickFieldByLabel(page, label);
  if (!opened) return [];
  await wait(450);
  const options = await page.evaluate(() => {
    const overlays = Array.from(document.querySelectorAll('.v-overlay--active'));
    const overlay = overlays[overlays.length - 1];
    if (!overlay) return [];
    return Array.from(overlay.querySelectorAll('[role="option"], .v-list-item'))
      .map((item) => String(item.innerText || item.textContent || '').replace(/\\s+/g, ' ').trim())
      .filter(Boolean);
  });
  await page.keyboard.press('Escape').catch(() => {});
  await wait(250);
  return [...new Set(options)];
}
`,
'seleção exata de opções e diagnóstico financeiro',
);

replaceOnce(
`async function openServiceOrderPage(page, situation) {
  if (!page.url().includes('/operation/serviceOrder')) {
    await page.goto(SERVICE_ORDER_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  }
  await page.waitForSelector('input[placeholder="O.S."], input[placeholder="Filtrar Pesquisa"]', { timeout: 90000 });
  await wait(1700);
  await ensureFilter(page, 'Situação', situation);
  try {
    await ensureFilter(page, 'Financeiro', 'Não Faturadas');
  } catch (error) {
    log('WARN', \`Não foi possível fixar Financeiro=Não Faturadas: \${error.message}\`);
  }
  await clickSearch(page);
  await wait(1500);
}
`,
`async function openServiceOrderPage(page, situation, financial = 'Não Faturadas') {
  if (!page.url().includes('/operation/serviceOrder')) {
    await page.goto(SERVICE_ORDER_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  }
  await page.waitForSelector('input[placeholder="O.S."], input[placeholder="Filtrar Pesquisa"]', { timeout: 90000 });
  await wait(1700);
  await ensureFilter(page, 'Situação', situation);
  if (financial) {
    await ensureFilter(page, 'Financeiro', financial);
  }
  await clickSearch(page);
  await wait(1500);
}
`,
'filtro financeiro parametrizado',
);

replaceOnce(
`async function processItem(page, item, config) {
  await openServiceOrderPage(page, 'Abertas');
  if ((await searchOs(page, item.os)).found) {
    return { status: 'JA_REABERTA', details: { motivo: 'A O.S. já aparece em Abertas no GRM.' } };
  }

  await openServiceOrderPage(page, 'Finalizadas');
  const closed = await searchOs(page, item.os);
  if (!closed.found) {
    throw new Error('A O.S. não aparece nem em Abertas nem em Finalizadas/Não Faturadas. Reabertura automática bloqueada.');
  }
`,
`async function processItem(page, item, config) {
  await openServiceOrderPage(page, 'Abertas', 'Não Faturadas');
  if ((await searchOs(page, item.os)).found) {
    return { status: 'JA_REABERTA', details: { motivo: 'A O.S. já aparece em Abertas no GRM.' } };
  }

  await openServiceOrderPage(page, 'Finalizadas', 'Não Faturadas');
  let closed = await searchOs(page, item.os);
  if (!closed.found) {
    let financialOptions = [];
    try {
      financialOptions = await listFilterOptions(page, 'Financeiro');
      log('INFO', \`Opções do filtro Financeiro: \${financialOptions.join(' | ') || '(nenhuma)'}\`);
    } catch (error) {
      log('WARN', \`Não foi possível listar opções do Financeiro: \${error.message}\`);
    }

    try {
      await openServiceOrderPage(page, 'Finalizadas', 'Faturadas');
      const billed = await searchOs(page, item.os);
      if (billed.found) {
        return {
          status: 'REVISAO_MANUAL',
          details: {
            motivo: 'A O.S. está em Finalizadas/Faturadas. Reabertura automática bloqueada para proteger reflexos financeiros.',
            financeiro: 'Faturadas',
            row: billed.rowText || null,
            financial_options: financialOptions,
          },
        };
      }
    } catch (error) {
      log('WARN', \`Busca em Finalizadas/Faturadas não pôde ser concluída: \${error.message}\`);
    }

    return {
      status: 'REVISAO_MANUAL',
      details: {
        motivo: 'A O.S. não foi localizada em Abertas/Não Faturadas nem em Finalizadas/Não Faturadas e também não foi confirmada em Finalizadas/Faturadas.',
        financial_options: financialOptions,
      },
    };
  }
`,
'busca segura em finalizadas faturadas',
);

replaceOnce(
`    await finishQueueItem(item, result.status, null, result.status === 'JA_REABERTA'
      ? 'O.S. já estava aberta no GRM no momento da execução.'
      : 'Reaberta automaticamente para corrigir finalização indevida do agente.');
`,
`    const queueObservation = result.status === 'JA_REABERTA'
      ? 'O.S. já estava aberta no GRM no momento da execução.'
      : result.status === 'REVISAO_MANUAL'
        ? String(result.details?.motivo || 'O.S. separada para revisão manual; nenhuma reabertura foi executada.')
        : 'Reaberta automaticamente para corrigir finalização indevida do agente.';
    await finishQueueItem(item, result.status, null, queueObservation);
`,
'observação de revisão manual',
);

fs.writeFileSync(target, source, 'utf8');
console.log(`[patch] arquivo atualizado: ${target}`);
