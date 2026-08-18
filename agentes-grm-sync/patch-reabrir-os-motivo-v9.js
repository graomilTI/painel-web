#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const target = process.argv[2] || path.join(__dirname, 'grm-sync-reabrir-os.js');
let source = fs.readFileSync(target, 'utf8');

const before = `async function clickReopenConfirm(page) {
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

const after = `async function clickReopenConfirm(page) {
  const motivo = String(
    process.env.GRM_REABRIR_OS_MOTIVO ||
    'Correção de finalização indevida pelo agente automático.'
  ).trim();
  if (!motivo) throw new Error('GRM_REABRIR_OS_MOTIVO não pode ser vazio.');

  const fillResult = await page.evaluate((reason) => {
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
    if (!modal) return { ok: false, reason: 'modal-nao-encontrado' };

    const fields = Array.from(modal.querySelectorAll('textarea, input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"])'))
      .filter((field) => {
        const rect = field.getBoundingClientRect();
        return rect.width && rect.height && !field.disabled && !field.readOnly;
      });

    const preferred = fields.find((field) => {
      const signal = norm([
        field.getAttribute('placeholder'),
        field.getAttribute('aria-label'),
        field.getAttribute('name'),
        field.id,
        field.closest('.v-input, .v-field, .form-group')?.innerText,
      ].filter(Boolean).join(' '));
      return signal.includes('MOTIVO');
    });

    const field = preferred || (fields.length === 1 ? fields[0] : null);
    if (!field) {
      return {
        ok: false,
        reason: 'campo-motivo-nao-identificado',
        campos_visiveis: fields.map((f) => ({
          tag: f.tagName,
          placeholder: f.getAttribute('placeholder') || '',
          aria: f.getAttribute('aria-label') || '',
          name: f.getAttribute('name') || '',
          id: f.id || '',
        })),
      };
    }

    const setter = Object.getOwnPropertyDescriptor(
      field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value'
    )?.set;
    if (setter) setter.call(field, reason);
    else field.value = reason;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    field.dispatchEvent(new Event('blur', { bubbles: true }));

    return {
      ok: String(field.value || '').trim() === reason,
      reason: String(field.value || '').trim() === reason ? null : 'valor-nao-fixado',
      tag: field.tagName,
      placeholder: field.getAttribute('placeholder') || '',
      length: String(field.value || '').length,
    };
  }, motivo);

  if (!fillResult?.ok) {
    const diagnostic = await findReopenModal(page);
    throw new Error(\`Não foi possível preencher o motivo obrigatório da reabertura: \${JSON.stringify(fillResult)}. Modal: \${JSON.stringify(diagnostic)}\`);
  }
  log('INFO', \`Motivo obrigatório preenchido no diálogo do GRM: "\${motivo}"\`);
  await wait(250);

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
    throw new Error(\`Motivo preenchido, mas nenhum botão afirmativo seguro (SIM/CONFIRMAR/ABRIR/REABRIR) foi identificado. Modal: \${JSON.stringify(diagnostic)}\`);
  }
  await element.click({ delay: 100 });
  await handle.dispose();
  log('INFO', 'Confirmação da abertura acionada após o preenchimento do motivo obrigatório.');
}
`;

if (source.includes(after)) {
  console.log('[patch-v9] motivo obrigatório da reabertura: já aplicado.');
  process.exit(0);
}

if (!source.includes(before)) {
  throw new Error(`[patch-v9] função de confirmação v8 não encontrada em ${target}`);
}

source = source.replace(before, after);
fs.writeFileSync(target, source, 'utf8');
console.log('[patch-v9] motivo obrigatório preenchido antes de CONFIRMAR: aplicado.');
console.log(`[patch-v9] arquivo atualizado: ${target}`);
