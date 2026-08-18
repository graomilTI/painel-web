#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const target = process.argv[2] || path.join(__dirname, 'grm-sync-reabrir-os.js');
let source = fs.readFileSync(target, 'utf8');

const before = `async function activeTooltipText(page) {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('[role="tooltip"], .v-tooltip, .v-tooltip__content, .v-overlay--active'));
    return nodes
      .map((node) => {
        const rect = node.getBoundingClientRect();
        if (!rect.width || !rect.height) return '';
        return String(node.innerText || node.textContent || '').replace(/\\s+/g, ' ').trim();
      })
      .filter(Boolean)
      .join(' | ');
  });
}

async function findReopenAction(page) {
  const buttons = await visibleToolbarButtons(page);
  const direct = buttons.find((item) =>
    normText(\`${'${item.text} ${item.title} ${item.ariaLabel} ${item.className} ${item.ancestry}'}\`).includes('REABRIR')
  );
  if (direct) return { ...direct, method: 'atributo', tooltip: '' };

  for (const item of buttons) {
    await page.mouse.move(item.x + item.width / 2, item.y + item.height / 2);
    await wait(300);
    const tooltip = await activeTooltipText(page);
    if (normText(tooltip).includes('REABRIR')) {
      return { ...item, method: 'tooltip', tooltip };
    }
  }

  log('ERROR', \`Botões visíveis sem ação Reabrir identificada: \${JSON.stringify(buttons)}\`);
  return null;
}
`;

const after = `async function exactTooltipForButton(page, item) {
  // Afasta o mouse para fechar qualquer tooltip anterior e só então posiciona
  // sobre o botão que está sendo testado. Nunca agrega textos de vários overlays.
  await page.mouse.move(4, 4);
  await wait(180);
  await page.mouse.move(item.x + item.width / 2, item.y + item.height / 2);
  await wait(450);

  return page.evaluate((domIndex) => {
    function norm(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '')
        .replace(/\\s+/g, ' ')
        .trim()
        .toUpperCase();
    }
    function compact(value) {
      return String(value || '').replace(/\\s+/g, ' ').trim();
    }

    const allButtons = Array.from(document.querySelectorAll('button'));
    const button = allButtons[domIndex] || null;
    const candidates = [];

    if (button) {
      const describedBy = String(button.getAttribute('aria-describedby') || '').trim();
      if (describedBy) {
        for (const id of describedBy.split(/\\s+/)) {
          const node = document.getElementById(id);
          if (node) {
            const rect = node.getBoundingClientRect();
            if (rect.width && rect.height) candidates.push(compact(node.innerText || node.textContent || ''));
          }
        }
      }
    }

    const tooltipNodes = Array.from(document.querySelectorAll(
      '[role="tooltip"], .v-tooltip__content, .v-overlay--active .v-overlay__content'
    ));
    for (const node of tooltipNodes) {
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const text = compact(node.innerText || node.textContent || '');
      // Tooltips de ação são curtos. Containers grandes com toda a barra não são aceitos.
      if (!text || text.length > 120 || rect.height > 160 || rect.width > 520) continue;
      candidates.push(text);
    }

    const unique = [...new Set(candidates.filter(Boolean))];
    const exact = unique.find((text) => {
      const normalized = norm(text);
      return normalized === 'REABRIR' || normalized === 'REABRIR OS';
    }) || null;

    return { exact, candidates: unique };
  }, item.domIndex);
}

async function findReopenAction(page) {
  const buttons = await visibleToolbarButtons(page);

  // Aceita atributos somente quando o próprio botão traz um sinal inequívoco.
  const direct = buttons.find((item) => {
    const signals = [item.text, item.title, item.ariaLabel]
      .map((value) => normText(value))
      .filter(Boolean);
    return signals.some((value) => value === 'REABRIR' || value === 'REABRIR OS');
  });
  if (direct) return { ...direct, method: 'atributo-exato', tooltip: direct.title || direct.ariaLabel || direct.text || '' };

  for (const item of buttons) {
    const probe = await exactTooltipForButton(page, item);
    if (probe.exact) {
      return {
        ...item,
        method: 'tooltip-exato',
        tooltip: probe.exact,
        tooltipCandidates: probe.candidates,
      };
    }
  }

  // Sem correspondência exata, a automação deve falhar fechada: jamais escolhe
  // um botão por posição, índice ou por texto agregado de outros tooltips.
  log('ERROR', \`Nenhum botão com tooltip/atributo EXATO Reabrir OS foi identificado. Botões: \${JSON.stringify(buttons)}\`);
  return null;
}
`;

if (source.includes(after)) {
  console.log('[patch-v6] identificação exata do botão Reabrir OS: já aplicada.');
  process.exit(0);
}

if (!source.includes(before)) {
  throw new Error(`[patch-v6] bloco antigo de identificação por tooltip não encontrado em ${target}`);
}

source = source.replace(before, after);
fs.writeFileSync(target, source, 'utf8');
console.log('[patch-v6] identificação exata do botão Reabrir OS: aplicada.');
console.log(`[patch-v6] arquivo atualizado: ${target}`);
