#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2] || __dirname);
const workerPath = path.join(root, 'worker', 'grm-sync-job-worker.js');
const schedulerPath = path.join(root, 'worker', 'grm-sync-auto-scheduler.js');

function backup(file) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(file, `${file}.backup-nf-${stamp}`);
}

function patchWorker() {
  let src = fs.readFileSync(workerPath, 'utf8');
  if (src.includes("'sync-lancar-notas-fiscais':")) {
    console.log('[OK] Worker já possui sync-lancar-notas-fiscais.');
    return;
  }
  const marker = "  'sync-abrir-os': 'grm-sync-abrir-os.js',";
  const line = "  'sync-lancar-notas-fiscais': 'grm-sync-lancar-notas-fiscais.js',";
  if (src.includes(marker)) src = src.replace(marker, `${marker}\n${line}`);
  else {
    const end = src.indexOf('\n};', src.indexOf('const SCRIPT_MAP'));
    if (end < 0) throw new Error('Não encontrei o final de SCRIPT_MAP no worker.');
    src = `${src.slice(0, end)}\n${line}${src.slice(end)}`;
  }
  backup(workerPath);
  fs.writeFileSync(workerPath, src, 'utf8');
  console.log('[OK] Worker atualizado.');
}

function patchScheduler() {
  let src = fs.readFileSync(schedulerPath, 'utf8');
  let changed = false;
  if (!src.includes("agente_id: 'sync-lancar-notas-fiscais'")) {
    const marker = 'const AGENTES_DIARIOS = [';
    const block = `const AGENTES_DIARIOS = [\n  {\n    agente_id: 'sync-lancar-notas-fiscais',\n    nome: 'Lançamento de Notas Fiscais no GRM',\n    intervalo_minutos: Number(process.env.GRM_LANCAR_NF_INTERVALO_MINUTOS || 10),\n    ativo: /^(1|true|yes|sim|on)$/i.test(process.env.GRM_LANCAR_NF_AGENDAR || 'false'),\n  },`;
    if (!src.includes(marker)) throw new Error('Não encontrei AGENTES_DIARIOS no scheduler.');
    src = src.replace(marker, block);
    changed = true;
  }
  if (!src.includes('if (agente.ativo === false) continue;')) {
    const marker = '  for (const agente of AGENTES_DIARIOS) {';
    if (!src.includes(marker)) throw new Error('Não encontrei loop de AGENTES_DIARIOS no scheduler.');
    src = src.replace(marker, `${marker}\n    if (agente.ativo === false) continue;`);
    changed = true;
  }
  if (!changed) {
    console.log('[OK] Scheduler já possui o agente e o controle ativo.');
    return;
  }
  backup(schedulerPath);
  fs.writeFileSync(schedulerPath, src, 'utf8');
  console.log('[OK] Scheduler atualizado.');
}

patchWorker();
patchScheduler();
console.log('[CONCLUÍDO] Execute node --check nos três arquivos alterados.');
