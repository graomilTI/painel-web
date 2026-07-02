# GRM Sync — agentes GRM Server → Supabase

Scripts Node.js/Puppeteer que fazem login no GRM Server (`www.grmserver.com.br`), baixam relatórios em XLS e sincronizam com o Supabase (projeto `painel`, ref `xyzpnuumdqhegxakkyws`). Rodam no cPanel em `/home/grao100/painel-scripts/grm-sync` (este diretório local é o espelho de trabalho).

## Arquitetura

```
grm_sync_jobs (tabela Supabase)
   ↑ cria jobs "pendente"
worker/grm-sync-auto-scheduler.js   — enfileira jobs por agente/frequência, libera jobs travados (> 20min)
   ↓
worker/grm-sync-job-worker.js       — poll a cada 15s (GRM_SYNC_JOB_POLL_MS), pega job "pendente",
                                       spawna o script correspondente (SCRIPT_MAP), grava status/output
   ↓
grm-sync-*.js / grmserver-colaboradores-sync.js  — login Puppeteer no GRM → baixa XLS → parseia → upsert no Supabase
```

Não usa mais PM2 cron nem Edge Functions (arquitetura antiga, abandonada). Tudo passa pela fila `grm_sync_jobs`.

## Agentes ativos (SCRIPT_MAP em worker/grm-sync-job-worker.js)

| agente_id | script | tabela destino |
|---|---|---|
| sync-colaboradores | grmserver-colaboradores-sync.js | colaboradores |
| sync-producao-diaria | grm-sync-producao-diaria.js | grm_producao_diaria_importacoes / producao_snapshot |
| sync-locais-embarque | grm-sync-locais-embarque.js | grm_locais_embarque_importacoes |
| sync-resultado-diario | grm-sync-resultado-diario.js | relatorio_resultado_diario (via staging) |
| sync-despesas | grm-sync-despesas.js | grm_despesas_importacoes |
| sync-notas-fiscais | grm-sync-notas-fiscais.js | grm_notas_fiscais_importacoes |
| sync-mapa-embarque | grm-sync-mapa-embarque.js | grm_mapa_embarque_importacoes |
| sync-patrimonios | grm-sync-patrimonios.js | grm_patrimonios_importacoes |
| sync-contas-pagar | grm-sync-contas-pagar.js | grm_contas_pagar_importacoes |
| sync-contas-receber | grm-sync-contas-receber.js | grm_contas_receber_importacoes |
| sync-auditorias | grm-sync-auditorias.js | grm_auditorias_importacoes |
| sync-nhe | grm-sync-nhe.js | grm_nhe_importacoes |
| sync-lista-os | grm-sync-lista-os.js | grm_lista_os_importacoes |
| sync-distribuicao-os | grm-sync-distribuicao-os.js | grm_distribuicao_os_importacoes |
| sync-btg-relatorios / sync-btg-classificador | grm-sync-btg-classificador.js | colaborador_cruzamento / BTG |
| sync-btg-checkin | grm-sync-btg-checkin.js | logistica_btg_solicitacoes |
| sync-cargas-geofence | grm-sync-cargas-geofence.js | cargas/geofence |

`safe-table-load.js` fornece `replaceTableSafely()` — grava em tabela `_staging` e promove via função SQL transacional, evitando janela de tabela vazia (ver migration `20260630124500_grm_staging_promote_agents.sql` no painel-web). `download-utils.js` tem os helpers de download de XLS compartilhados pelos agentes de relatório.

## Variáveis de ambiente (`.env`)

```
GRMSERVER_USER=...
GRMSERVER_PASSWORD=...
SUPABASE_URL=https://xyzpnuumdqhegxakkyws.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

## Rodar manualmente (debug)

```bash
cd /home/grao100/painel-scripts/grm-sync
node grmserver-colaboradores-sync.js
# ou, se o node do sistema não for compatível:
/opt/cpanel/ea-nodejs16/bin/node grmserver-colaboradores-sync.js
```

Um run saudável demora ~80-120s (login + download + parse + upsert) e imprime `[INFO]`/`[SUCCESS]` a cada etapa. **Se o script terminar em menos de 1s sem nenhum log, o arquivo está quebrado/truncado** — foi exatamente isso que aconteceu com `grmserver-colaboradores-sync.js` entre 29/06 e 02/07: alguém salvou só um trecho do arquivo (a função de login) por cima do script inteiro, e o job continuava marcando "sucesso" em `grm_sync_jobs` porque o processo saía com código 0.

## Verificar se um agente está realmente funcionando

```sql
select agente_id, status, iniciado_em, duration_ms, output->>'stdout' as stdout
from public.grm_sync_jobs
where agente_id = 'sync-colaboradores'
order by created_at desc limit 5;
```

`status = 'sucesso'` **não é suficiente** — confira também `duration_ms` (deve estar na faixa histórica normal do agente, não em milissegundos) e se `stdout` tem o log completo do fluxo (login → download → parse → upsert). Um `sucesso` com stdout vazio e duração < 1s é sinal do mesmo bug de arquivo truncado.

## Deploy de uma correção

1. Editar o script localmente neste diretório.
2. `node --check nome-do-script.js` para validar sintaxe.
3. Subir para o servidor (`scp`/SFTP/cPanel File Manager) em `/home/grao100/painel-scripts/grm-sync/`.
4. Rodar manualmente uma vez (seção acima) e conferir o log completo antes de deixar o worker pegar via fila.
5. Commitar a mudança no git (`painel-web/agentes-grm-sync/...`) — é a única cópia versionada; o disco do servidor não tem histórico.

## Logs

`logs/*.log` — um arquivo por agente + `worker-cron.log`/`auto-scheduler.log`. Cresce sem rotação automática; truncar/arquivar periodicamente se ficar grande.
