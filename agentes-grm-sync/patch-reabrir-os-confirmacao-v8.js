#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const target = process.argv[2] || path.join(__dirname, 'grm-sync-reabrir-os.js');
let source = fs.readFileSync(target, 'utf8');

const before = `async function findReopenModal(page) {
  return page.evaluate(() => {
    function norm(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .replace(/\\s+/g, ' ')
        .trim()
        .toUpperCase();
    }
    const roots = Array.from(document.querySelectorAll('.v-overlay--active, [role="dialog"]')).reverse();
    const modal = roots.find((root) => norm(root.innerText || root.textContent || '').includes('REABRIR'));
    if (!modal) return null;
    return {
      text: String(modal.innerText || modal.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 1200),
      buttons: Array.from(modal.querySelectorAll('button')).map((button) => ({
        text: String(button.innerText || button.textContent || '').replace(/\\s+/g, ' ').trim(),
        disabled: Boolean(button.disabled || button.getAttribute('aria-disabled') === 'true'),
      })),
    };
  });
}

async function clickReopenConfirm(page) {
  const handle = await page.evaluateHandle(() => {
    function norm(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .replace(/\\s+/g, ' ')
        .trim()
        .toUpperCase();
    }
    const roots = Array.from(document.querySelectorAll('.v-overlay--active, [role="dialog"]')).reverse();
    const modal = roots.find((root) => norm(root.innerText || root.textContent || '').includes('REABRIR'));
    if (!modal) return false;
    return Array.from(modal.querySelectorAll('button')).find((button) => {
      const text = norm(button.innerText || button.textContent || '');
      const rect = button.getBoundingClientRect();
      const enabled = !button.disabled && button.getAttribute('aria-disabled') !== 'true';
      return enabled && rect.width && rect.height && (text === 'REABRIR' || text.includes('REABRIR OS'));
    }) || false;
  });
  const element = handle.asElement();
  if (!element) {
    await handle.dispose();
    const diagnostic = await findReopenModal(page);
    throw new Error(\`Modal de reabertura aberto, mas botão REABRIR não foi identificado. Modal: \${JSON.stringify(diagnostic)}\`);
  }
  await element.click({ delay: 100 });
  await handle.dispose();
}
`;

const after = `async function findReopenModal(page) {
  return page.evaluate(() => {
    function norm(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .replace(/\\s+/g, ' ')
        .trim()
        .toUpperCase();
    }
    function isReopenConfirmation(text) {
      const value = norm(text);
      return value.includes('DESEJA REALMENTE ABRIR A ORDEM DE SERVICO') ||
        value.includes('DESEJA REALMENTE REABRIR A ORDEM DE SERVICO') ||
        value.includes('REABRIR');
    }

    const roots = Array.from(document.querySelectorAll(
      '.v-overlay--active, [role="dialog"], .v-dialog, .swal2-popup'
    )).reverse();
    const modal = roots.find((root) => isReopenConfirmation(root.innerText || root.textContent || ''));
    if (!modal) return null;
    return {
      text: String(modal.innerText || modal.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 1200),
      buttons: Array.from(modal.querySelectorAll('button')).map((button) => ({
        text: String(button.innerText || button.textContent || '').replace(/\\s+/g, ' ').trim(),
        disabled: Boolean(button.disabled || button.getAttribute('aria-disabled') === 'true'),
      })),
    };
  });
}

async function clickReopenConfirm(page) {
  const handle = await page.evaluateHandle(() => {
    function norm(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .replace(/\\s+/g, ' ')
        .trim()
        .toUpperCase();
    }
    function isReopenConfirmation(text) {
      const value = norm(text);
      return value.includes('DESEJA REALMENTE ABRIR A ORDEM DE SERVICO') ||
        value.includes('DESEJA REALMENTE REABRIR A ORDEM DE SERVICO') ||
        value.includes('REABRIR');
    }

    const roots = Array.from(document.querySelectorAll(
      '.v-overlay--active, [role="dialog"], .v-dialog, .swal2-popup'
    )).reverse();
    const modal = roots.find((root) => isReopenConfirmation(root.innerText || root.textContent || ''));
    if (!modal) return false;

    const affirmative = new Set(['SIM', 'CONFIRMAR', 'ABRIR', 'REABRIR', 'REABRIR OS']);
    const buttons = Array.from(modal.querySelectorAll('button')).filter((button) => {
      const rect = button.getBoundingClientRect();
      return rect.width && rect.height && !button.disabled && button.getAttribute('aria-disabled') !== 'true';
    });

    return buttons.find((button) => affirmative.has(norm(button.innerText || button.textContent || ''))) || false;
  });
  const element = handle.asElement();
  if (!element) {
    await handle.dispose();
    const diagnostic = await findReopenModal(page);
    throw new Error(\`Confirmação de abertura detectada, mas nenhum botão afirmativo seguro (SIM/CONFIRMAR/ABRIR/REABRIR) foi identificado. Modal: \${JSON.stringify(diagnostic)}\`);
  }
  await element.click({ delay: 100 });
  await handle.dispose();
  log('INFO', 'Confirmação da abertura acionada dentro do diálogo do GRM.');
}
`;

if (source.includes(after)) {
  console.log('[patch-v8] confirmação "Deseja realmente abrir" já suportada.');
  process.exit(0);
}

if (!source.includes(before)) {
  throw new Error(`[patch-v8] bloco antigo de modal/confirmação não encontrado em ${target}`);
}

source = source.replace(before, after);
fs.writeFileSync(target, source, 'utf8');
console.log('[patch-v8] confirmação "Deseja realmente abrir a Ordem de Serviço?" aplicada.');
console.log(`[patch-v8] arquivo atualizado: ${target}`);
