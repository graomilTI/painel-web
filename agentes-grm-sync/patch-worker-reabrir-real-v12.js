#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const target = process.argv[2] || path.join(__dirname, 'worker', 'grm-sync-job-worker.js');
let source = fs.readFileSync(target, 'utf8');

const marker = 'REABRIR_REAL_POR_PAYLOAD_V12';
if (source.includes(marker)) {
  console.log('[patch-v12] worker com modo REAL por payload: já aplicado.');
  process.exit(0);
}

function replaceOnce(before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`[patch-v12] ${label}: bloco não encontrado em ${target}`);
  }
  source = source.replace(before, after);
}

replaceOnce(
  'function runScript(scriptName, jobId) {',
  'function runScript(scriptName, jobId, job = null) {',
  'assinatura runScript',
);

replaceOnce(
`    log(\`Executando \${scriptName}\`);

    const child = spawn(NODE_BIN, [scriptPath], {`,
`    log(\`Executando \${scriptName}\`);

    // ${marker}
    // O .env permanece DRY_RUN=true. Somente um job sync-reabrir-os com
    // payload.mode="real" recebe --real explicitamente. Outros jobs e chamadas
    // sem payload continuam protegidos pelo dry-run global.
    const scriptArgs = [scriptPath];
    const reabrirReal = scriptName === 'grm-sync-reabrir-os.js'
      && String(job?.payload?.mode || '').trim().toLowerCase() === 'real';
    if (reabrirReal) {
      scriptArgs.push('--real');
      log(\`Job \${jobId}: reabertura REAL autorizada por payload.mode=real.\`);
    }

    const child = spawn(NODE_BIN, scriptArgs, {`,
  'argumentos do script',
);

replaceOnce(
  '  const result = await runScript(scriptName, job.id);',
  '  const result = await runScript(scriptName, job.id, job);',
  'passagem do job para runScript',
);

fs.writeFileSync(target, source, 'utf8');
console.log('[patch-v12] worker atualizado: --real somente para sync-reabrir-os com payload.mode=real.');
console.log('[patch-v12] GRM_REABRIR_OS_DRY_RUN pode permanecer true como trava global.');
console.log(`[patch-v12] arquivo atualizado: ${target}`);
