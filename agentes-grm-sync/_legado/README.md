# Legado do servidor

Arquivos que existiam só no servidor de produção (`/home/grao100/painel-scripts/grm-sync/`)
e não estavam no git. Trazidos em 14/10/2026 para não se perderem. **Nada aqui roda.**

- `grm-sync-job-worker-raiz-2026-07.js` — 1ª versão do worker da fila (31/07), solta na raiz
  do servidor. Substituída por `worker/grm-sync-job-worker.js` (é a que o cron executa).

Outros arquivos que estão só no servidor, mas já preservados no git (idênticos, conferido por md5):

- `grm-sync-abrir-os.js` (Puppeteer) — removido de propósito em `1fc5095c` (16/09); a abertura de
  O.S. roda por `grmserver-abrir-os-api.js`. Recuperar: `git show 1fc5095c~1:agentes-grm-sync/grm-sync-abrir-os.js`
- `ecosystem.config.js` (PM2, julho) — removido de propósito em `bac0230d` (23/07), sem uso.
  Recuperar: `git show bac0230d~1:agentes-grm-sync/ecosystem.config.js`
- `grm-sync-compras-match-nf.js` — na branch `feature/compras-nf-auto-match` (não mergeada);
  agente `compras-match-nf` desativado.
