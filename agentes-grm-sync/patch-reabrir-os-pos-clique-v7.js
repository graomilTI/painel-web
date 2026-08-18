#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const target = process.argv[2] || path.join(__dirname, 'grm-sync-reabrir-os.js');
let source = fs.readFileSync(target, 'utf8');

const before = `  await page.mouse.click(action.x + action.width / 2, action.y + action.height / 2);
  await wait(800);

  const modal = await findReopenModal(page);
  if (modal) {
    log('INFO', \`Modal de reabertura detectado: \${modal.text}\`);
    await clickReopenConfirm(page);
    await waitModalClosed(page, 45000);
  } else {
    log('INFO', 'Ação Reabrir não exibiu modal; verificando diretamente o estado da O.S.');
  }

  const opened = await verifyOpen(page, item.os);
  if (!opened) {
    throw new Error('A ação de reabertura foi acionada, mas a O.S. não apareceu em Abertas na validação final.');
  }

  return { status: 'REABERTA', details: { action_method: action.method, modal: modal || null } };
`;

const after = `  // A partir daqui a execução é REAL. O botão já foi identificado por atributo/tooltip
  // exato. Evita clique por coordenada (que pode ser interceptado pelo overlay do tooltip)
  // e aciona diretamente o MESMO elemento DOM previamente identificado.
  const actionResponses = [];
  const onActionResponse = async (response) => {
    try {
      const request = response.request();
      const method = String(request.method() || '').toUpperCase();
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;

      let pathname = response.url();
      try { pathname = new URL(response.url()).pathname; } catch (_) {}

      let message = null;
      try {
        const contentType = String(response.headers()['content-type'] || '').toLowerCase();
        if (contentType.includes('application/json')) {
          const body = await response.json();
          const candidate = body && (body.message ?? body.error ?? body.detail ?? body.msg ?? body.mensagem);
          if (candidate != null) {
            message = typeof candidate === 'string'
              ? candidate.slice(0, 700)
              : JSON.stringify(candidate).slice(0, 700);
          }
        }
      } catch (_) {}

      actionResponses.push({ method, status: response.status(), path: pathname, message });
    } catch (_) {}
  };
  page.on('response', onActionResponse);

  const clickResult = await page.evaluate((domIndex) => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const button = buttons[domIndex] || null;
    if (!button) return { ok: false, reason: 'botao-dom-nao-encontrado' };
    const rect = button.getBoundingClientRect();
    const disabled = Boolean(
      button.disabled ||
      button.getAttribute('aria-disabled') === 'true' ||
      button.classList.contains('v-btn--disabled')
    );
    if (disabled) return { ok: false, reason: 'botao-desabilitado' };
    if (!rect.width || !rect.height) return { ok: false, reason: 'botao-nao-visivel' };
    button.click();
    return {
      ok: true,
      text: String(button.innerText || button.textContent || '').replace(/\\s+/g, ' ').trim(),
      title: button.getAttribute('title') || '',
      ariaLabel: button.getAttribute('aria-label') || '',
    };
  }, action.domIndex);

  if (!clickResult?.ok) {
    page.off('response', onActionResponse);
    throw new Error(\`Não foi possível acionar o botão Reabrir OS identificado: \${clickResult?.reason || 'motivo desconhecido'}.\`);
  }
  log('INFO', \`Clique DOM executado no botão Reabrir OS identificado (método: \${action.method}).\`);
  await wait(1200);

  const modal = await findReopenModal(page);
  if (modal) {
    log('INFO', \`Modal de reabertura detectado: \${modal.text}\`);
    await clickReopenConfirm(page);
    await waitModalClosed(page, 45000);
    await wait(1000);
  } else {
    log('INFO', 'Ação Reabrir não exibiu modal; coletando retorno do GRM antes da validação.');
  }

  // Captura somente mensagens visíveis de feedback; não coleta conteúdo da tabela inteira.
  const pageFeedback = await page.evaluate(() => {
    const selectors = [
      '.v-snackbar', '.v-alert', '[role="alert"]', '.swal2-popup',
      '.iziToast', '.toast', '.notification', '.notyf__toast'
    ];
    const items = [];
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        const rect = node.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        const text = String(node.innerText || node.textContent || '').replace(/\\s+/g, ' ').trim();
        if (text) items.push(text.slice(0, 800));
      }
    }
    return [...new Set(items)];
  });

  await wait(900);
  page.off('response', onActionResponse);
  if (pageFeedback.length) log('INFO', \`Feedback do GRM após Reabrir: \${JSON.stringify(pageFeedback)}\`);
  if (actionResponses.length) log('INFO', \`Respostas HTTP da ação Reabrir: \${JSON.stringify(actionResponses)}\`);

  const opened = await verifyOpen(page, item.os);
  if (opened) {
    return {
      status: 'REABERTA',
      details: {
        action_method: action.method,
        click_method: 'dom-button-exato',
        modal: modal || null,
        feedback: pageFeedback,
        action_responses: actionResponses,
      },
    };
  }

  // Se não abriu, nunca tenta clicar de novo nesta execução. Confere se permaneceu
  // Finalizada/Não Faturada e isola o caso para revisão, preservando o diagnóstico.
  let stillFinalized = null;
  try {
    await openServiceOrderPage(page, 'Finalizadas', 'Não Faturadas');
    stillFinalized = await searchOs(page, item.os);
  } catch (error) {
    log('WARN', \`Não foi possível reconferir Finalizadas após o clique: \${error.message}\`);
  }

  return {
    status: 'REVISAO_MANUAL',
    details: {
      motivo: stillFinalized?.found
        ? 'O botão Reabrir OS foi acionado, mas o GRM manteve a O.S. em Finalizadas/Não Faturadas. Nenhuma nova tentativa automática deve ser feita sem analisar o retorno do GRM.'
        : 'O botão Reabrir OS foi acionado, mas a O.S. não apareceu em Abertas na validação final. Nenhuma nova tentativa automática deve ser feita sem analisar o retorno do GRM.',
      action_method: action.method,
      click_method: 'dom-button-exato',
      modal: modal || null,
      feedback: pageFeedback,
      action_responses: actionResponses,
      permaneceu_finalizada_nao_faturada: Boolean(stillFinalized?.found),
      row_finalizada: stillFinalized?.rowText || null,
    },
  };
`;

if (source.includes(after)) {
  console.log('[patch-v7] clique DOM exato e diagnóstico pós-clique: já aplicado.');
  process.exit(0);
}

if (!source.includes(before)) {
  throw new Error(`[patch-v7] bloco pós-clique original não encontrado em ${target}`);
}

source = source.replace(before, after);
fs.writeFileSync(target, source, 'utf8');
console.log('[patch-v7] clique DOM exato e diagnóstico pós-clique: aplicado.');
console.log(`[patch-v7] arquivo atualizado: ${target}`);
