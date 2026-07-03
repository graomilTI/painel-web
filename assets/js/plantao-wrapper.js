const PATCH_VERSION = 'plantao-date-labels-2026-07-03-1';

function replaceRegexOrThrow(source, regex, replacement, label) {
  if (!regex.test(source)) throw new Error(`Trecho não localizado: ${label}`);
  return source.replace(regex, replacement);
}

function applyDateLabelsPatch(originalSource) {
  let source = originalSource;

  if (!source.includes('function getPersonDateLabel(person)')) {
    source = replaceRegexOrThrow(
      source,
      /function buildHorario\(row\) \{[\s\S]*?\n\}/,
      (match) => `${match}\n\nfunction getPersonDateLabel(person) {\n  const data = person?.data_plantao || '';\n  if (!data) return '';\n  return `${weekdayBR(data)} • ${formatDateBR(data)}`;\n}\n\nfunction shouldShowPersonDates(pessoas) {\n  const dates = [...new Set((pessoas || []).map((p) => p.data_plantao).filter(Boolean))];\n  return dates.length > 1;\n}`,
      'helpers de data por plantonista'
    );
  }

  if (!source.includes('const showPersonDates = shouldShowPersonDates(pessoas);\n  let h = 20 + 38 + 48 + 11;')) {
    source = replaceRegexOrThrow(
      source,
      /function computeCardH\(pessoas\) \{[\s\S]*?\n\}\n\nfunction drawPersonBlock/,
      `function computeCardH(pessoas) {\n  const showPersonDates = shouldShowPersonDates(pessoas);\n  let h = 20 + 38 + 48 + 11;\n\n  pessoas.forEach((p, i) => {\n    if (showPersonDates && getPersonDateLabel(p)) h += 28;\n    h += 40;\n    if (formatPhone(p.telefone)) h += 30;\n    if (p.email_corporativo) h += 30;\n    if (buildHorario(p)) h += 30;\n    h += 10;\n    if (i < pessoas.length - 1) h += 13;\n  });\n\n  return h + 20;\n}\n\nfunction drawPersonBlock`,
      'altura do card com data individual'
    );
  }

  if (!source.includes('function drawPersonBlock(ctx, x, y, w, person, showDate = false)')) {
    source = replaceRegexOrThrow(
      source,
      /function drawPersonBlock\(ctx, x, y, w, person\) \{[\s\S]*?\n\}\n\nfunction drawSectorCard/,
      `function drawPersonBlock(ctx, x, y, w, person, showDate = false) {\n  const iS = 9;\n  let cy = y;\n  ctx.save();\n\n  if (showDate) {\n    const dateLabel = getPersonDateLabel(person);\n    if (dateLabel) {\n      ctx.font = 'bold 13px Arial';\n      const pillW = Math.min(ctx.measureText(dateLabel).width + 20, w);\n      drawRoundRectFilled(ctx, x, cy, pillW, 23, 999, 'rgba(22,101,52,.24)', 'rgba(111,208,165,.28)', 1);\n      ctx.fillStyle = '#6fd0a5';\n      ctx.textAlign = 'left';\n      ctx.textBaseline = 'middle';\n      ctx.fillText(fitText(ctx, dateLabel, pillW - 20), x + 10, cy + 12);\n      cy += 28;\n    }\n  }\n\n  ctx.font = 'bold 26px Arial';\n  ctx.fillStyle = '#ffffff';\n  ctx.textAlign = 'left';\n  ctx.textBaseline = 'top';\n  ctx.fillText(fitText(ctx, (person.nome || '').toUpperCase(), w), x, cy);\n  cy += 40;\n\n  function infoRow(drawIcon, label, value) {\n    if (!value) return;\n    const mid = cy + 15;\n    drawIcon(ctx, x + iS, mid, iS);\n    ctx.font = '12px Arial';\n    ctx.fillStyle = 'rgba(185,210,195,.52)';\n    ctx.textBaseline = 'top';\n    ctx.fillText(label, x + iS * 2 + 7, cy + 1);\n    ctx.font = '15px Arial';\n    ctx.fillStyle = '#dff5e8';\n    ctx.textBaseline = 'bottom';\n    ctx.fillText(fitText(ctx, value, w - iS * 2 - 9), x + iS * 2 + 7, cy + 29);\n    cy += 30;\n  }\n\n  const phone = formatPhone(person.telefone);\n  const email = person.email_corporativo;\n  const horario = buildHorario(person);\n  if (phone) infoRow(drawPhoneIcon, 'Contato', phone);\n  if (email) infoRow(drawEmailIcon, 'E-mail', email);\n  if (horario) infoRow(drawClockIcon, 'Horário', horario);\n  cy += 10;\n  ctx.restore();\n  return cy - y;\n}\n\nfunction drawSectorCard`,
      'bloco do plantonista com etiqueta de data'
    );
  }

  if (!source.includes('const showPersonDates = shouldShowPersonDates(pessoas);\n\n  drawRoundRectFilled(ctx, x, y, w, cardH')) {
    source = source.replace(
      '  const cardH = computeCardH(pessoas);\n  drawRoundRectFilled(ctx, x, y, w, cardH',
      '  const cardH = computeCardH(pessoas);\n  const showPersonDates = shouldShowPersonDates(pessoas);\n  drawRoundRectFilled(ctx, x, y, w, cardH'
    );
  }

  if (!source.includes('drawPersonBlock(ctx, x + pad, cy, w - pad * 2, person, showPersonDates)')) {
    source = source.replace(
      'const usedH = drawPersonBlock(ctx, x + pad, cy, w - pad * 2, person);',
      'const usedH = drawPersonBlock(ctx, x + pad, cy, w - pad * 2, person, showPersonDates);'
    );
  }

  if (!source.includes('const showPersonDates = shouldShowPersonDates(rows);')) {
    source = source.replace(
      '  const PAD = 56, HEADER_H = 360, FOOTER_H = 90, GAP = 18;\n\n  function personH(p) {',
      '  const PAD = 56, HEADER_H = 360, FOOTER_H = 90, GAP = 18;\n  const showPersonDates = shouldShowPersonDates(rows);\n\n  function personH(p) {'
    );
  }

  if (!source.includes('if (showPersonDates && getPersonDateLabel(p)) h += 40;')) {
    source = replaceRegexOrThrow(
      source,
      /  function personH\(p\) \{\n    let h = 32 \+ 52; \/\/ top-pad \+ name\n    if \(formatPhone\(p\.telefone\)\) h \+= 46;\n    if \(p\.email_corporativo\) h \+= 46;\n    if \(buildHorario\(p\)\) h \+= 46;\n    return h \+ 26; \/\/ bottom-pad\n  \}/,
      `  function personH(p) {\n    let h = 32 + 52; // top-pad + name\n    if (showPersonDates && getPersonDateLabel(p)) h += 40;\n    if (formatPhone(p.telefone)) h += 46;\n    if (p.email_corporativo) h += 46;\n    if (buildHorario(p)) h += 46;\n    return h + 26; // bottom-pad\n  }`,
      'altura do card WhatsApp com data individual'
    );
  }

  if (!source.includes('drawRoundRectFilled(ctx, PAD + 22, iy, pillW, 32')) {
    source = source.replace(
      '    let iy = cy + 32;\n\n    ctx.save();',
      `    let iy = cy + 32;\n\n    if (showPersonDates) {\n      const dateLabel = getPersonDateLabel(person);\n      if (dateLabel) {\n        ctx.save();\n        ctx.font = 'bold 20px Arial';\n        const pillW = Math.min(ctx.measureText(dateLabel).width + 28, cardW - 44);\n        drawRoundRectFilled(ctx, PAD + 22, iy, pillW, 32, 999, 'rgba(22,101,52,.25)', 'rgba(111,208,165,.3)', 1.2);\n        ctx.fillStyle = '#6fd0a5';\n        ctx.textAlign = 'left';\n        ctx.textBaseline = 'middle';\n        ctx.fillText(fitText(ctx, dateLabel, pillW - 28), PAD + 36, iy + 16);\n        ctx.restore();\n        iy += 40;\n      }\n    }\n\n    ctx.save();`
    );
  }

  return source;
}

async function bootPatchedPlantao() {
  const originalModuleUrl = new URL(`./plantao.js?v=${encodeURIComponent(PATCH_VERSION)}`, import.meta.url);

  try {
    const response = await fetch(originalModuleUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    let source = await response.text();
    const baseUrl = new URL('./', import.meta.url);
    source = source
      .replace("from './pageInit.js'", `from '${new URL('pageInit.js', baseUrl).href}'`)
      .replace("from './supabaseClient.js'", `from '${new URL('supabaseClient.js', baseUrl).href}'`);

    const patched = `${applyDateLabelsPatch(source)}\n//# sourceURL=plantao.patched.${PATCH_VERSION}.js`;
    const blobUrl = URL.createObjectURL(new Blob([patched], { type: 'text/javascript' }));

    try {
      await import(blobUrl);
    } finally {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    }
  } catch (error) {
    console.error('[plantao] Não foi possível aplicar o ajuste de datas na arte. Carregando versão original.', error);
    await import('./plantao.js');
  }
}

bootPatchedPlantao();
