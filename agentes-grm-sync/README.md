# GRM Sync — agentes GRM Server → Supabase

Scripts Node.js/Puppeteer que fazem login no GRM Server (`www.grmserver.com.br`), baixam relatórios em XLS (ou chamam a API interna direto) e sincronizam com o Supabase (projeto `painel-web` BR, ref `jbzmcyycanrlnfhedcup`). Rodam no cPanel em `/home/grao100/painel-scripts/grm-sync` (este diretório local é o espelho de trabalho).

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

Não usa mais Docker, PM2 nem Edge Functions (arquiteturas antigas, abandonadas — a versão Docker foi desativada em 2026-06-29). Tudo passa pela fila `grm_sync_jobs`, disparada por cron puro (crontab do usuário `grao100`, sem PM2 instalado no servidor):

```cron
* * * * *   cd /home/grao100/painel-scripts/grm-sync && HOME=/home/grao100 TMPDIR=/home/grao100/tmp TMP=/home/grao100/tmp TEMP=/home/grao100/tmp PATH=/home/grao100/bin:/opt/cpanel/ea-nodejs10/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin /home/grao100/bin/node worker/grm-sync-job-worker.js --once >> logs/worker-cron.log 2>&1
*/5 * * * * cd /home/grao100/painel-scripts/grm-sync && HOME=/home/grao100 TMPDIR=/home/grao100/tmp TMP=/home/grao100/tmp TEMP=/home/grao100/tmp PATH=/home/grao100/bin:/opt/cpanel/ea-nodejs10/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin /home/grao100/bin/node worker/grm-sync-auto-scheduler.js >> logs/auto-scheduler.log 2>&1
```

`grm-sync-job-worker.js --once` roda a cada minuto (pega no máximo 1 job pendente e sai); `grm-sync-auto-scheduler.js` roda a cada 5 minutos (enfileira jobs novos e libera jobs travados). Node real: `/home/grao100/bin/node`.

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
| aplicar-distribuicao-os | grm-sync-aplicar-distribuicao-os.js | operacional_os (write-back) |
| sync-btg-relatorios / sync-btg-classificador | grm-sync-btg-classificador.js | colaborador_cruzamento / BTG |
| sync-btg-checkin | grm-sync-btg-checkin.js | logistica_btg_solicitacoes |
| sync-cargas-geofence | grm-sync-cargas-geofence.js | cargas/geofence |
| sync-adiantamentos | grm-sync-adiantamentos.js | grm_adiantamentos_importacoes |
| sync-despesas-retroativas | grm-sync-despesas-retroativas.js | GRM Caixa Operacional + grm_despesas_retroativas_auditoria |

`aplicar-distribuicao-os` é o único agente de escrita (os demais só leem do GRM e gravam no Supabase): ele lê `operacional_os`/`operacional_os_colaboradores` (grupos pendentes de conferência que já têm colaborador indicado em Conferência → Distribuir O.S.), replica a associação dentro do Graint (Supervisão → Atualizar → associar colaborador → SALVAR) e só marca `status_conferencia='AJUSTADA'` no Supabase se o Graint confirmar o salvamento. Se um grupo falhar em qualquer etapa, ele é pulado (sem marcar AJUSTADA) e reprocessado no próximo ciclo — não há coluna de idempotência extra, o filtro `status_conferencia != 'AJUSTADA'` já cobre isso. Suporta `--dry-run` (ou `DRY_RUN=true`) pra simular sem clicar em SALVAR nem gravar no Supabase, e `HEADLESS=false` pra rodar com o Chrome visível.

`safe-table-load.js` fornece `replaceTableSafely()` — grava em tabela `_staging` e promove via função SQL transacional, evitando janela de tabela vazia (ver migration `20260630124500_grm_staging_promote_agents.sql` no painel-web). `download-utils.js` tem os helpers de download de XLS compartilhados pelos agentes de relatório.

### `grm-sync-classificacao-ourosafra.js` (novo, 28/08 — ainda NÃO está no SCRIPT_MAP/cron)

Segundo agente de escrita do repo, e o primeiro que grava fora do GRM: casa placas "Aguardando Classificação" no painel Ouro Safra (`app.ourosafra.com.br/app/cdci`) com a classificação já feita no GRM (`report/classification/loads`, filtro Cliente Nacional = OURO SAFRA INDUSTRIA E COMERCIO LTDA), preenche os 3 itens (Impureza/Umidade/Avariados) na Ouro Safra, baixa o laudo em PDF da O.S. correspondente no GRM (`operation/serviceOrder` → Cargas → Imprimir Laudo) e anexa de volta na Ouro Safra. Fluxo validado manualmente ao vivo (placa BDP-1G46 / O.S. 90493, 27/08/2026); os seletores usam texto/posição estrutural (não IDs fixos) porque a Ouro Safra é Radzen/Blazor Server com IDs gerados por sessão.

Precisa de `OUROSAFRA_USER`/`OUROSAFRA_PASSWORD` no `.env` (ver `.env.example`) e de uma tabela de auditoria `ouro_safra_classificacao_execucoes` no Supabase (migration `20260828130000_ouro_safra_classificacao_execucoes.sql`, aplicada). Segue o mesmo padrão de segurança do `aplicar-distribuicao-os`: `--dry-run`/`DRY_RUN=true` casa a placa e calcula os valores mas não preenche nem anexa nada; `HEADLESS=false` roda com o Chrome visível. Placa sem correspondência no GRM é pulada silenciosamente (tenta de novo no próximo ciclo). **Antes de colocar no cron:** rodar algumas vezes com `--dry-run` e depois com `HEADLESS=false` supervisionado — os seletores do modal "Cargas" do GRM e do combo "Cliente Nacional" (searchableSelect) são best-effort e não foram exercitados via este script ainda.

**Verificação 28/08/2026 (`DRY_RUN=true` local):** login OK no Ouro Safra e no GRM, `listarAgendamentosPendentes()` rodou sem erro e corretamente reportou 0 placas em "Aguardando Classificação" no momento do teste (script sai limpo, sem exceção). Como não havia placa pendente, o restante do fluxo (`buscarClassificacaoGRM` → preencher itens → baixar/anexar laudo) não foi exercitado nesta rodada — só tinha sido testado manualmente no navegador (ver notas de 27-28/08 acima). Rodar de novo com `--dry-run` assim que houver placa em "Aguardando Classificação" pra validar o casamento com o GRM ponta a ponta. KPI de acompanhamento adicionado em TI > Agentes (aba Saída), lendo direto de `ouro_safra_classificacao_execucoes` — como o agente ainda não está no `SCRIPT_MAP`/cron, não há linhas em `grm_sync_jobs` pra ele, então o card mostra "Aguardando" até a 1ª execução real gravar uma linha na tabela de auditoria.

## Variáveis de ambiente (`.env`)

```
GRMSERVER_USER=...
GRMSERVER_PASSWORD=...
OUROSAFRA_USER=...
OUROSAFRA_PASSWORD=...
SUPABASE_URL=https://jbzmcyycanrlnfhedcup.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

## Rodar manualmente (debug)

```bash
cd /home/grao100/painel-scripts/grm-sync
/home/grao100/bin/node grmserver-colaboradores-sync.js
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

## Concorrência entre agentes — conflitos de banco (mapeamento 2026-08-12)

> **Nota:** a seção "Arquitetura" acima descreve uma versão anterior do worker (poll único a cada 15s, 1 job por vez). Desde então o sistema evoluiu para uma **fila em 3 lanes** controlada pela função Postgres `claim_next_grm_sync_job(p_lane, p_worker_id)` (`pg_advisory_xact_lock(872634503)` + `SELECT ... FOR UPDATE SKIP LOCKED`, migrations `20260805130142_grm_sync_three_lanes.sql` e `20260807191805_adiciona_lane_despesas_distribuicao.sql`), consumida por `worker/grm-sync-job-worker.js --once --lane=<lane> --worker-id=<id>` via `worker/crontab-three-lanes.txt` (4 processos cron, 1x/min, `flock -n`). Lease/heartbeat libera job travado sem heartbeat há 10-20min. A lane `fixed` também deixou de ser round-robin contínuo puro em 2026-08-11 (PR #132): agora é `fixed_a`/`fixed_b`, cada agente com intervalo configurável (ver tela TI > Agentes). Esta seção documenta o estado encontrado nessa data — reconferir se voltar a mexer na fila.

**Capacidade concorrente por lane:**

| Lane | Cap. simultânea | Agentes |
|---|---|---|
| `fixed` | 2 | esteira de 19 agentes (`worker/grm-sync-fixed-agents.js`): sync-colaboradores, sync-lista-os, sync-patrimonios, sync-nhe, sync-operacional-os, sync-distribuicao-os, sync-producao-diaria, sync-locais-embarque, sync-resultado-diario, sync-despesas, sync-notas-fiscais, sync-mapa-embarque, sync-contas-pagar, sync-contas-receber, sync-auditorias, sync-cargas-geofence, sync-btg-relatorios, sync-adiantamentos, botconversa-sync (+ sync-login-alimentacao, fora da esteira mas com prioridade na mesma lane) |
| `alteracoes` | 1 | sync-lancar-nhe, sync-finalizar-os, sync-abrir-os, sync-despesas-retroativas, sync-btg-checkin, sync-btg-devolver-classificador |
| `despesas_distribuicao` | 1 | sync-liberacao-despesas, aplicar-distribuicao-os |

Total: no máximo **4 agentes rodando ao mesmo tempo** no sistema inteiro.

**Tabelas escritas por agente e mecanismo de lock:**

| Agente | Escreve (principal) | Lock/idempotência |
|---|---|---|
| sync-colaboradores | `colaboradores`, `colaboradores_status_historico` | nenhum próprio (via `grmserver-colaboradores-sync-snapshot.js`) |
| sync-lista-os | `grm_lista_os_importacoes` (**insert puro, sem onConflict**) | **nenhum** — não idempotente a reprocessamento paralelo |
| sync-patrimonios | `frotas_veiculos`, `patrimonios_importacoes` | nenhum |
| sync-nhe | `grm_nhe_importacoes` (upsert `id`) | onConflict |
| sync-operacional-os | `operacional_os` (upsert `numero_os` + delete guardado), `operacional_pontos_embarque` | onConflict; lê `grm_lista_os_importacoes` (dependência lógica do #2) |
| sync-distribuicao-os | `grm_distribuicao_os_importacoes` (upsert `id`) | onConflict |
| sync-producao-diaria | `producao_snapshot` (via staging) | staging/promote (`safe-table-load.js`) |
| sync-locais-embarque | `grm_locais_embarque_importacoes` (upsert `id`) | onConflict |
| sync-resultado-diario | `relatorio_resultado_diario` (via staging) | staging/promote |
| sync-despesas | `grm_despesas_importacoes` (upsert `id`) | onConflict |
| sync-notas-fiscais | `grm_notas_fiscais_importacoes` (upsert `numero_nf`) | onConflict |
| sync-mapa-embarque | `grm_mapa_embarque_importacoes` (upsert `id`) | onConflict |
| sync-contas-pagar | `grm_contas_pagar_importacoes` (upsert `id`) | onConflict |
| sync-contas-receber | `grm_contas_receber_importacoes` (upsert `id`) | onConflict |
| sync-auditorias | `grm_auditorias_importacoes` (**insert + delete de sobra, não é upsert**) | **nenhum** — não idempotente a reprocessamento paralelo |
| sync-cargas-geofence | `logistica_cargas_monitor_execucoes`, `grm_cargas_importacoes` (upsert `chave_unica`), `logistica_cargas_irregularidades` (upsert `chave_unica`) | onConflict; lê `operacional_os`, `grm_lista_os_importacoes`, `grm_distribuicao_os_importacoes` (dependência lógica) |
| sync-btg-relatorios/classificador | `logistica_btg_solicitacoes` (via staging) | staging/promote |
| sync-adiantamentos | `grm_adiantamentos_importacoes` (upsert `ofr_code`) | onConflict |
| botconversa-sync | nenhuma direta (dispara Edge Function) | — |
| sync-login-alimentacao | `grm_login_movimentos_importacoes` (upsert `chave_unica`), `financeiro_alimentacao_colaboradores` (upsert `chave_unica`), `grm_login_alimentacao_execucoes` | onConflict; lê `operacional_os` |
| sync-lancar-nhe | `logistica_nhe_lancamentos_auto` (upsert `chave_unica`), `logistica_nhe_lancamentos_execucoes` | onConflict; lê `operacional_os`, `colaboradores` |
| sync-finalizar-os | `operacional_os` (update), `logistica_alertas`, `grm_finalizacao_os_execucoes/resultados` | — |
| sync-abrir-os | `logistica_abertura_os` (update status), `grm_abertura_os_execucoes` | filtro por status |
| sync-despesas-retroativas | `grm_despesas_retroativas_auditoria` + GRM externo | — |
| sync-btg-checkin / sync-btg-devolver-classificador | nenhuma no Supabase (Edge Function / portal externo) | — |
| **sync-liberacao-despesas** | `grm_despesas_fila`, `grm_despesas_estado_colaborador` | **sim** — `claim_next_grm_despesa_fila()`, `pg_advisory_xact_lock` + `FOR UPDATE SKIP LOCKED` (único agente com lock real) |
| aplicar-distribuicao-os | `operacional_os` (update `status_conferencia`) + GRM externo | filtro `status_conferencia != 'AJUSTADA'` (idempotência, não lock) |

**Riscos identificados:**

1. **Alto:** `sync-lista-os` e `sync-auditorias` não são idempotentes (insert sem `onConflict`/delete de sobra, sem lock). Se o mesmo `agente_id` for enfileirado 2x em paralelo (ex.: botão "Executar Agora" da UI + esteira ao mesmo tempo), duplica ou corrompe linhas. Ponto mais frágil do desenho atual.
2. **Médio:** `operacional_os` é tocada por agentes de lanes diferentes sem lock compartilhado (`sync-operacional-os` no `fixed`; `sync-finalizar-os`, `sync-lancar-nhe`, `aplicar-distribuicao-os`, `sync-login-alimentacao` nas outras lanes). Upsert por `numero_os` é seguro linha a linha, mas leitura concorrente pode pegar um estado transitório (baixo risco de corrupção real).
3. **Baixo:** agentes de staging (`sync-producao-diaria`, `sync-resultado-diario`, `sync-btg-relatorios`) usam tabelas `_staging` próprias — só colidiriam se o **mesmo** agente rodasse 2x em paralelo (evitado pela capacidade da lane, mas sem lock explícito além do `safe-table-load.js`).
4. **Dependência de ordem sem lock:** `sync-lista-os` → `sync-operacional-os` (lê `grm_lista_os_importacoes`) e `sync-lista-os`/`sync-distribuicao-os` → `sync-cargas-geofence` (lookup de local da O.S.) — garantido só pela posição na esteira, não reforçado por lock.

**Combinações seguras para rodar 100% simultâneas** (tabelas de escrita totalmente distintas, upsert por chave própria): `sync-despesas`, `sync-notas-fiscais`, `sync-mapa-embarque`, `sync-contas-pagar`, `sync-contas-receber`, `sync-nhe`, `sync-distribuicao-os`, `sync-locais-embarque`, `sync-adiantamentos`, `sync-patrimonios`, `botconversa-sync`, `sync-btg-checkin`, `sync-btg-devolver-classificador`, `sync-liberacao-despesas`, `sync-abrir-os`.
