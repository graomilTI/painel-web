#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const target = process.argv[2] || path.join(__dirname, 'grm-sync-reabrir-os.js');
let source = fs.readFileSync(target, 'utf8');

function replaceOnce(before, after, label) {
  if (!source.includes(before)) {
    if (source.includes(after)) {
      console.log(`[patch-v3] ${label}: já aplicado.`);
      return;
    }
    throw new Error(`[patch-v3] ${label}: bloco original não encontrado em ${target}`);
  }
  source = source.replace(before, after);
  console.log(`[patch-v3] ${label}: aplicado.`);
}

replaceOnce(
`async function verifyOpen(page, osNumber) {
  await openServiceOrderPage(page, 'Abertas');
  const result = await searchOs(page, osNumber);
  return result.found;
}
`,
`async function verifyOpen(page, osNumber) {
  // Após clicar em Reabrir, o GRM pode deixar a página em um estado parcial
  // (toolbar/modal/DOM de filtros desmontado). Para validar com segurança,
  // recarrega a rota da Ordem de Serviço do zero antes de aplicar os filtros.
  await page.goto(SERVICE_ORDER_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('input[placeholder="O.S."], input[placeholder="Filtrar Pesquisa"]', { timeout: 90000 });
  await wait(1700);
  await openServiceOrderPage(page, 'Abertas', 'Não Faturadas');
  const result = await searchOs(page, osNumber);
  return result.found;
}
`,
'validação pós-reabertura com reload completo',
);

fs.writeFileSync(target, source, 'utf8');
console.log(`[patch-v3] arquivo atualizado: ${target}`);
