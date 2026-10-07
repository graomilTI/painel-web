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

`grm-sync-job-worker.js --once` roda a cada minuto (pega no máximo 1 job pendente e sai); `grm-sync-auto-scheduler.js` roda a cada 5 minutos (enfileira jobs novos e libera jobs travados).

**⚠️ `/home/grao100/bin/node` (usado acima e nos exemplos de "rodar manualmente" abaixo) está quebrado/desatualizado** — falha com `ReferenceError: Headers is not defined` ao importar `@supabase/supabase-js` (não tem fetch/Headers nativo, achado ao vivo 17/09). O Node real usado em produção é `/opt/node22/bin/node` — é o que o `crontab -l` de verdade usa pra todo o worker V2 de 9 lanes (`GRM_SYNC_NODE_BIN=/opt/node22/bin/node`, ver seção "Concorrência entre agentes" abaixo). Pra rodar qualquer script manualmente (debug, dry-run, deploy), use `/opt/node22/bin/node`, não `/home/grao100/bin/node`.

## Agentes ativos (SCRIPT_MAP em worker/grm-sync-job-worker.js)

| agente_id | script | tabela destino |
|---|---|---|
| sync-colaboradores | grmserver-colaboradores-sync.js | colaboradores |
| sync-producao-diaria | grm-sync-producao-diaria.js | grm_producao_diaria_importacoes / producao_snapshot |
| sync-locais-embarque | grm-sync-locais-embarque.js | grm_locais_embarque_importacoes |
| sync-resultado-diario | grm-sync-resultado-diario.js | relatorio_resultado_diario (via staging) |
| sync-resultado-diario-reconciliacao | grm-sync-resultado-diario-reconciliacao.js | relatorio_resultado_diario (via staging, 75 dias em blocos de 7) |
| sync-despesas | grm-sync-despesas.js | grm_despesas_importacoes |
| sync-notas-fiscais | grm-sync-notas-fiscais.js | grm_notas_fiscais_importacoes |
| sync-notas-fiscais-reconciliacao | grmserver-notas-fiscais-reconciliacao-api.js | grm_notas_fiscais_importacoes |
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
| sync-despesas-duplicadas | grm-sync-despesas-duplicadas.js | GRM Caixa Operacional + grm_despesas_retroativas_auditoria |
| sync-aprovar-pendencias | grm-sync-aprovar-pendencias.js | GRM Caixa Operacional + grm_despesas_retroativas_auditoria |
| sync-uber-gorjeta-caixa | grm-sync-uber-gorjeta-caixa.js | GRM Caixa Operacional (Adiantamento) + uber_gorjeta_caixa_lancamentos |
| sync-uber-geocodificar | grm-sync-uber-geocodificar.js | conferencia_uber_corridas (GPS) + uber_gps_fila |

`sync-despesas-retroativas` também aprova **Pernoite** lançado pelo colaborador (só aprova pendência existente, nunca cria) quando: o gestor programou Pernoite pra ele na data (`programacao_estadia`) **e** o colaborador tem produção/laudo (`producao_snapshot`) ou NHE (`grm_nhe_importacoes`) na data **e** não há lançamento ativo (P/A) de Café, Almoço ou Janta no dia. Caso contrário grava `PERNOITE_BLOQUEADO` na auditoria com o motivo (`sem_pernoite_na_programacao` / `sem_producao_ou_nhe_no_dia` / `refeicao_lancada_no_dia`).

`sync-uber-geocodificar` (06/10/2026) converte o endereço das corridas Uber em GPS **no servidor**, porque o OpenStreetMap (Nominatim) devolve 403 ao IP das Edge Functions do Supabase (o IP deste servidor é aceito). Os botões "GPS" e "Converter GPS pendentes" da tela Uber chamam a RPC `uber_gps_solicitar`, que enfileira em `uber_gps_fila` e cria o job; o agente converte (Nominatim -> Photon, mesmo código de `supabase/functions/uber-geocodificar-gps/`, copiado para `uber-geocodificar/` no servidor — Node 22 importa .ts), grava as coordenadas, roda `uber_validar_por_os_laudo` (valida sozinho se há O.S. com laudo a até 2 km) e marca cada linha da fila (`OK`/`NAO_LOCALIZADO`/`ERRO`). Trabalha até 7 min por job e agenda continuação se sobrar fila. Lane `entrada_financeiro_b`, sem mutex, não precisa do token do GRM. Teste sem gravar: `GRM_UBER_GEOCODIFICAR_DRY_RUN=true`. **No servidor os módulos ficam em `uber-geocodificar/` junto de um `package.json` com `{"type": "module"}` (a pasta do agente é CommonJS e sem isso o Node 22 recusa os `import` dos `.ts`). Ao mudar `endereco.ts`/`geocodificar.ts` no repositório, copiar os dois arquivos também para essa pasta.** A Edge Function `uber-geocodificar-gps` continua publicada mas a tela não a usa mais. **Automático:** o gatilho `uber_gps_enfileirar_importacao` (migration `20261006230000`) enfileira, assim que a importação diária do Uber (SFTP ~05h) ou a sincronização pela API insere uma corrida pendente sem coordenada de partida, e já pede o job — converte partida **e** destino e roda a validação por O.S. com laudo, sem clique. Não pega gorjeta nem corrida que já chegou validada/no caixa.

`sync-uber-gorjeta-caixa` (06/10/2026) lança a gorjeta do Uber como **Adiantamento** no Caixa do colaborador, sozinho e no valor integral. A importação diária do Uber (SFTP) traz cada gorjeta como linha `GORJETA` (`external_id` `<corrida>:TIP:<instante>`) em `conferencia_uber_corridas`; o gatilho `uber_gorjeta_enfileirar_caixa` a coloca em `uber_gorjeta_caixa_lancamentos` e cria o job. Data do Adiantamento = dia da corrida; descrição única `Gorjeta Uber - dd/mm/aaaa hh:mm - corrida xxxxxxxx` (a trava de duplicidade confere a descrição no Caixa). As 74 gorjetas anteriores a 06/10 entraram como `CANCELADO` e não são lançadas (a chave única em `external_id` também impede reimportação de enfileirá-las). Colaborador resolvido por e-mail (pessoal/empresa) **e** nome; se apontam para cadastros diferentes, ou nenhum casa, o lançamento vai para `ERRO` (nunca chuta). Painel Uber mostra o estado de cada gorjeta e o botão **Reenviar ao Caixa** (RPC `uber_gorjeta_reenviar_caixa`, que também religa o agente se houver `PENDENTE` parada, ex.: token diário do GRM vencido na hora da importação). Teste sem lançar: `GRM_UBER_GORJETA_CAIXA_DRY_RUN=true` (não cria job de continuação).

`sync-despesas-duplicadas` (02/10/2026) é o auxiliar do retroativas: varre as pendências do Caixa dos últimos 10 dias (Almoço, Café, Janta, Pernoite e Diária = Salário de Intermitente + Serviços Terceirizados; Serv. Terceirizados <= R$ 45 conta como Almoço). Data efetiva = data citada na observação ou a do lançamento. (1) Sem data na observação e já existe outro lançamento ativo (P/A) do colaborador+despesa na data: recusa com "lançamento duplicado". (2) Observação com data diferente: se já existe lançamento na data da observação, recusa como "Duplicata"; se não existe e está nas regras (Almoço/Diária/Pernoite = Embarque SIM na data por produção/laudo/NHE; Pernoite sem Café/Almoço/Janta no dia; Janta = laudo >= 19h local; Café = laudo < 07h local), corrige a data (cria na data da observação, aprova e recusa o original com "data corrigida"); fora das regras fica pendente. Entre vários lançamentos do mesmo grupo sobrevive o aprovado, senão o lançado direto na data, senão o de menor ofmCode. Se a observação cita OUTRA despesa (ex.: Pernoite com obs "janta"), o agente não mexe (lançamento na categoria errada, revisão humana). Data da observação > 20 dias do lançamento ou no futuro: não mexe. Auditoria na mesma tabela do retroativas (`diagnostico.agente = 'sync-despesas-duplicadas'`): recusas entram como `REPROVE`, correção de data como `CREATE` (conta no custo aprovado da Produtividade, na data certa). `--dry-run` simula sem escrever no GRM. Nasce com `interval_minutes = 0` (só job manual) em `grm_sync_agent_settings`, fila `saida_financeiro`, `mutex_group = staff_grm`; depois de conferir o dry-run, ligar em TI > Agentes (ex.: 60 min). Testes: `node test-despesas-duplicadas.js`.

**Tipo de despesa incorreto (regra de 05/10/2026):** toda despesa deve ser lançada no campo correspondente. O `sync-despesas-duplicadas` recusa **na hora** a pendência de Café, Almoço, Janta, Pernoite ou Diária cuja observação diga que é de OUTRA despesa (campo Almoço com "janta dia tal") com o motivo exato `Tipo de despesa incorreto. lançar despesa no campo correspondente` (`tipoIncorretoNaObs` em `grm-despesas-guardas.js`; auditoria `REPROVE` com `diagnostico.motivo` e `tipo_citado`). Exceções para não recusar lançamento certo: Pernoite aceita "diária" (diária do hotel) e "café da manhã" incluso; Serviços Terceirizados <= R$ 45 não entra; km/combustível/pedágio na observação só seguram a pendência (aparecem em descrição de local).

`sync-aprovar-pendencias` (05/10/2026) é o segundo auxiliar do retroativas: a cada 60 min varre as pendências do Caixa dos últimos 10 dias (até ontem) e **aprova** as de Café, Almoço, Janta, Pernoite e **Diária** (Salário de Intermitente / Serviços Terceirizados > R$ 45) que cumprem as regras de 01/10 (Almoço/Diária/Pernoite: movimento no dia — produção, laudo ou NHE; Janta: laudo a partir das 19h local; Café: laudo antes das 07h local; Pernoite: sem Café/Almoço/Janta ativo no dia). O retroativas só aprova o que está na Programação do Painel e só olha D-1, então o que o colaborador lança fora da Programação ficava parado. Só aprova no valor padrão (Café R$ 10; Almoço, Janta e Pernoite R$ 30; Diária = salário do cadastro, com o tipo combinando com o vínculo: Salário de Intermitente só para Intermitente a partir da admissão, Serviços Terceirizados só para Diarista ou Intermitente antes da admissão) e **não** aprova observação que cita outra despesa/pessoa/data (essa é do `sync-despesas-duplicadas`), extra (Salário Família...) nem duplicata (outro lançamento ativo da mesma despesa na mesma **data efetiva** — a citada na observação, como no `sync-despesas-duplicadas`) — fica pendente. Auditoria em `grm_despesas_retroativas_auditoria` (`acao='APPROVE'`, `diagnostico.agente='sync-aprovar-pendencias'`). Código em `grm-despesas-evidencia.js` (evidência) e `grm-despesas-guardas.js` (travas compartilhadas com o duplicadas e o retroativas). Teste: `node test-aprovar-pendencias.js`.

`aplicar-distribuicao-os` é o único agente de escrita (os demais só leem do GRM e gravam no Supabase): ele lê `operacional_os`/`operacional_os_colaboradores` (grupos pendentes de conferência que já têm colaborador indicado em Conferência → Distribuir O.S.), replica a associação dentro do Graint (Supervisão → Atualizar → associar colaborador → SALVAR) e só marca `status_conferencia='AJUSTADA'` no Supabase se o Graint confirmar o salvamento. Se um grupo falhar em qualquer etapa, ele é pulado (sem marcar AJUSTADA) e reprocessado no próximo ciclo — não há coluna de idempotência extra, o filtro `status_conferencia != 'AJUSTADA'` já cobre isso. Suporta `--dry-run` (ou `DRY_RUN=true`) pra simular sem clicar em SALVAR nem gravar no Supabase, e `HEADLESS=false` pra rodar com o Chrome visível.

`safe-table-load.js` fornece `replaceTableSafely()` — grava em tabela `_staging` e promove via função SQL transacional, evitando janela de tabela vazia (ver migration `20260630124500_grm_staging_promote_agents.sql` no painel-web). `download-utils.js` tem os helpers de download de XLS compartilhados pelos agentes de relatório.

### `grm-sync-classificacao-ourosafra.js` (novo, 28/08 — em cron desde 28/08, fila 06 · Saída OS a cada 10min)

Segundo agente de escrita do repo, e o primeiro que grava fora do GRM: casa placas "Aguardando Classificação" no painel Ouro Safra (`app.ourosafra.com.br/app/cdci`) com a classificação já feita no GRM (`report/classification/loads`, filtro Cliente Nacional = OURO SAFRA INDUSTRIA E COMERCIO LTDA), preenche os 3 itens (Impureza/Umidade/Avariados) na Ouro Safra, baixa o laudo em PDF da O.S. correspondente no GRM (`operation/serviceOrder` → Cargas → Imprimir Laudo) e anexa de volta na Ouro Safra. Fluxo validado manualmente ao vivo (placa BDP-1G46 / O.S. 90493, 27/08/2026); os seletores usam texto/posição estrutural (não IDs fixos) porque a Ouro Safra é Radzen/Blazor Server com IDs gerados por sessão.

Precisa de `OUROSAFRA_USER`/`OUROSAFRA_PASSWORD` no `.env` (ver `.env.example`) e de uma tabela de auditoria `ouro_safra_classificacao_execucoes` no Supabase (migration `20260828130000_ouro_safra_classificacao_execucoes.sql`, aplicada). Segue o mesmo padrão de segurança do `aplicar-distribuicao-os`: `--dry-run`/`DRY_RUN=true` casa a placa e calcula os valores mas não preenche nem anexa nada; `HEADLESS=false` roda com o Chrome visível. Placa sem correspondência no GRM é pulada silenciosamente (tenta de novo no próximo ciclo).

**⚠️ Selectors não 100% exercitados:** os seletores do modal "Cargas" do GRM e do fluxo de preencher/anexar na Ouro Safra são best-effort — nunca rodaram contra uma placa real via Puppeteer (só manualmente no navegador, 27/08). O agente já está em produção no cron (ver abaixo) porque até agora toda execução real encontrou 0 placas pendentes — o trecho de preencher/baixar/anexar ainda não foi exercitado de verdade. Na primeira vez que aparecer uma placa em "Aguardando Classificação", acompanhar a execução ao vivo (log em `grm_sync_jobs`/`ouro_safra_classificacao_execucoes`) e, se algo quebrar no meio, rodar `HEADLESS=false` local pra depurar antes do próximo ciclo de 10min tentar de novo.

**Estado em produção (28/08/2026):** `sync-classificacao-ourosafra` está no `SCRIPT_MAP` (deployado no servidor antes de estar no git — corrigido aqui) e associado, via `grm_sync_agent_settings`, à fila `saida_os` ("06 · Saída OS") com `interval_minutes=10`, `enabled=true` — o scheduler (`ensure_grm_scheduled_agents()`) já vinha rodando o agente a cada ~30min desde ~15:10 UTC (antes na fila `entrada_cadastros_operacao`, herdada de um valor default); 5 execuções reais até agora, todas `sucesso` com 0 placas pendentes, nenhuma linha ainda em `ouro_safra_classificacao_execucoes`. KPI de acompanhamento em TI > Agentes (aba Saída) lê direto dessa tabela + do último job em `grm_sync_jobs`.

### `grmserver-notas-fiscais-reconciliacao-api.js` (novo, 17/09 — em cron desde 17/09, mesma lane `entrada_financeiro_a` do agente rápido, `interval_minutes=1440`)

Reconciliação diária de Notas Fiscais: mesma tabela e mesmo `onConflict` (`empresa,fatura`) do agente rápido `sync-notas-fiscais` (janela de 30 dias), mas com janela mínima de 400 dias (`GRM_NOTAS_RECONCILIACAO_DIAS`). Achado 17/09 comparando o DRE (`assets/js/modules/dre.js`) com o Relatório de Notas Fiscais oficial da GRM: sobravam de 2 a 7 notas por mês (~R$4-33 mil) que nunca chegavam a sincronizar. Causa mais provável: nota lançada atrasada na GRM (Data N.F. de um dia, cadastrada no sistema só semanas depois) "perde o trem" da janela rolante de 30 dias antes mesmo de existir no GRM. Rodando 1x/dia com janela mínima de 400 dias, a nota atrasada tem várias chances de ser pega antes de sair também dessa janela maior.

Reaproveita `login`/`fetchReportData`/`upsertData` exportados por `grmserver-notas-fiscais-api.js` (só passa um `daysBack` maior) — não duplica a lógica de fetch/parse/upsert. Registrado em `grm_sync_agent_settings` na mesma lane do agente rápido (migration `20260917000000_grm_notas_fiscais_reconciliacao_agent_settings.sql`); como o worker de cada lane só roda 1 job por vez, os dois agentes nunca disputam a API do GRM em paralelo, só se revezam na fila.

Isso corrige nota **faltando** na sincronização. Não corrige diferença de **duplicação** (isso já foi corrigido separadamente trocando a chave de dedupe das RPCs `dre_notas_fiscais_deduplicadas()`/`resumo_faturamento_notas_periodo()` de `(empresa, fatura)` para `fatura`, migration `20260916180000_dre_notas_fiscais_dedupe_por_fatura_global.sql`).

## Variáveis de ambiente (`.env`)

```
GRMSERVER_USER=...
GRMSERVER_PASSWORD=...
OUROSAFRA_USER=...
OUROSAFRA_PASSWORD=...
SUPABASE_URL=https://jbzmcyycanrlnfhedcup.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
# Opcional: latência de detecção do cadastro de colaboradores (mínimo 2000 ms)
GRM_COLABORADORES_POLL_MS=5000
# Opcional: janela do agente rápido de Notas Fiscais (dias)
GRM_NOTAS_DIAS=30
# Opcional: janela da reconciliação diária de Notas Fiscais (dias)
GRM_NOTAS_RECONCILIACAO_DIAS=400
```

## Colaboradores pela API (quase em tempo real)

`grmserver-colaboradores-api-realtime.js` substitui, somente para o cadastro de
colaboradores, o fluxo navegador → XLS. Ele autentica em `user/login`, consulta
`staff/getRecords` continuamente, grava apenas diferenças em `colaboradores` e
mantém o journal `colaboradores_alteracoes` com cadastro, alteração, inativação
e reativação. As duas tabelas são publicadas no Supabase Realtime; a página
`consultar-colaboradores.html` se atualiza sem recarregar o navegador.

O GRM não oferece webhook. Portanto, a latência é o intervalo de polling mais o
tempo da requisição (5 segundos por padrão), não zero absoluto. Execute este
script como serviço persistente e mantenha o sincronizador XLS antigo disponível
para rollback, mas não rode os dois como fonte principal ao mesmo tempo.

```bash
cd /home/grao100/painel-scripts/grm-sync
GRM_COLABORADORES_POLL_MS=5000 /opt/node22/bin/node grmserver-colaboradores-api-realtime.js
```

Antes de iniciar o serviço, aplique a migration
`20260901000805_grm_colaboradores_realtime_auditoria.sql`. O primeiro ciclo
associa os registros existentes ao `staCode` do GRM; somente diferenças reais
são incluídas no journal.

## Produção Diária pela API (janela recente, sem Puppeteer)

`grmserver-producao-diaria-api-realtime.js` substitui, para a janela recente
(hoje/ontem por padrão), o fluxo Puppeteer de `grm-sync-producao-diaria.js`.
O script antigo já buscava os dados por `fetch` dentro da página (não pelo
XLS) — só o login exigia navegador. Aqui o login também é POST direto em
`user/login`, então o processo roda sem abrir Chrome/Puppeteer e pode ficar
de pé como serviço com polling curto (`GRM_PRODUCAO_DIARIA_POLL_MS`, padrão
60000ms), em vez de rodar 1x a cada ciclo da esteira de agentes.

Grava direto em `producao_snapshot` via `replaceTablePeriodSafely()`
(staging + `grm_promover_staging_periodo()`), que só substitui as datas
presentes na consulta — histórico fora da janela fica intacto. Não escreve
mais em `grm_producao_diaria_importacoes` (tabela de arquivo do fluxo XLS
antigo); segue a mesma simplificação já aplicada em `grmserver-lista-os-api-
realtime.js`.

**Duas janelas no mesmo loop:** além do polling rápido (hoje/ontem), o
processo faz uma sincronização completa (mesma janela de 30 dias do agente
Puppeteer antigo) a cada `GRM_PRODUCAO_DIARIA_FULL_SYNC_MS` (padrão 30min,
rodando também logo no boot). Necessário porque o "Meta Mensal" do dashboard
do Gestor (`assets/js/dashboard.js`) soma `producao_snapshot` do **mês
inteiro**, não só dos últimos 2 dias — sem a sync completa periódica,
qualquer correção retroativa do GRM num dia já fora da janela rápida nunca
chegaria ao painel.

Variáveis opcionais:

```
GRM_PRODUCAO_DIARIA_POLL_MS=60000            # intervalo do loop rápido (mínimo 15000)
GRM_PRODUCAO_DIARIA_DAYS_BACK=2              # janela rápida (hoje + N-1 anteriores)
GRM_PRODUCAO_DIARIA_MIN_ROWS=20              # guarda contra promover a janela rápida vazia/parcial
GRM_PRODUCAO_DIARIA_FULL_SYNC_MS=1800000     # intervalo da sync completa (mínimo 300000)
GRM_PRODUCAO_DIARIA_FULL_SYNC_DAYS_BACK=30   # janela da sync completa
GRM_PRODUCAO_DIARIA_FULL_SYNC_MIN_ROWS=1000  # guarda contra promover a sync completa vazia/parcial
```

`assets/js/producaoSnapshotAgentSync.js` (resync legado disparado pelo
dashboard a partir de `grm_producao_diaria_importacoes`) ganhou o mesmo guard
de `agenteListaOsHabilitado()`/`listaOsAgentSync.js`: pula sozinho quando
`sync-producao-diaria` está `enabled=false`, para não sobrescrever
`producao_snapshot` com o lote cada vez mais velho que ficaria parado desde a
pausa do agente antigo.

```bash
cd /home/grao100/painel-scripts/grm-sync
/opt/node22/bin/node grmserver-producao-diaria-api-realtime.js
```

`grm-sync-producao-diaria.js` (Puppeteer, janela de 30 dias) continua no
`SCRIPT_MAP`/esteira para a sincronização histórica completa e como rollback;
ao promover este agente para produção, pausar `sync-producao-diaria` em
`grm_sync_agent_settings` (não em `worker/grm-sync-fixed-agents.js`, que é
código morto — ver [[painel-web-grm-sync-agent-settings-fonte-real]]) para
evitar os dois escrevendo em `producao_snapshot` ao mesmo tempo. Para rodar
persistente, seguir o mesmo padrão systemd dos dois agentes acima
(`Restart=always`), inclusive para o caso de faltar acesso root na sessão
(cron+flock+nohup como fallback temporário, ver `loginctl enable-linger`
em [[painel-web-agentes-grm-sync-deploy-cpanel]]).

## Resultado Diário pela API (janela de 7 dias, sem Puppeteer)

`grm-sync-resultado-diario.js` já buscava os dados por `fetch` dentro da
página (`fetchReportApi`, não pelo XLS — o fluxo de download/parse de XLS
ficou como código morto, nunca chamado por `main()`); só o login exigia
Puppeteer. Login virou POST direto em `user/login` (mesmo padrão dos agentes
acima), então o script roda sem abrir Chrome. Continua como job pontual na
esteira (`SCRIPT_MAP`, lane `fixed`) — não virou serviço contínuo, só ficou
mais rápido.

Janela default reduzida de 30 dias (`monthsBack:1`) para 7
(`GRM_RESULTADO_DIARIO_DAYS_BACK`). `MIN_ROWS` (guarda contra promover
staging vazia/parcial) escalado junto, de 1000 para 200 — mantido em 1000 ele
abortaria toda promoção de uma janela 4x menor.

```
GRM_RESULTADO_DIARIO_DAYS_BACK=7     # janela de consulta (hoje + N-1 anteriores)
GRM_RESULTADO_DIARIO_MIN_ROWS=200    # guarda contra promover a janela vazia/parcial
```

Continua gravando nas duas tabelas de sempre: `grm_resultado_diario_importacoes`
(snapshot bruto por janela: cada execução insere o resultado e, com o insert
completo, apaga os snapshots anteriores da mesma janela `de/ate` — antes era
append puro e a tabela chegou a ~20 GB, ver `removeSnapshotsAnteriores`) e
`relatorio_resultado_diario` (via staging, `replaceTablePeriodSafely` — só
substitui as datas presentes na janela consultada, histórico mais antigo
fica intacto). Para reprocessar um período fora da janela de 7 dias, rodar
manualmente com `GRM_RESULTADO_DIARIO_DAYS_BACK` maior.

## Abertura de O.S. pela API (sem Puppeteer)

`grmserver-abrir-os-api.js` substitui `grm-sync-abrir-os.js` (Puppeteer) no
`SCRIPT_MAP` de `sync-abrir-os` desde 12/09. Mesmo contrato de dados
(`logistica_abertura_os` status `APROVADO` → `PROCESSANDO` → `CADASTRADO`/`ERRO`,
mais `grm_abertura_os_execucoes`) e mesmo modo de execução do worker (roda sem
args, processa todas as solicitações `APROVADO` a cada chamada) — por isso a
troca no `SCRIPT_MAP` foi só apontar o nome do script.

Login e toda a cadeia de resolução de códigos (Cliente Nacional → Regional →
Final, ponto de embarque → cidade/local/supervisão, produto/tipo/serviço,
destino, itens de classificação) são feitos por POST direto nos endpoints do
GRM (`user/login`, `client/*/getForSelect`, `address/getCities`,
`servicePlaces/getRecords`, `supervision/getSupervisionByCitAndSPlaceType`,
`product/*`, etc. — ver comentário no topo do arquivo pra cadeia completa), e
a criação em si é um único `POST serviceOrder/setRecord`, que já devolve o
número da O.S. (`recordCode`) na resposta — elimina a classe de bugs de
"captura de número errado por colisão" que o Puppeteer tinha (ver
`painel-web-abertura-os-numero-captura-errada-colisao` na memória).

**Trade-off aceito:** essa versão pula toda a validação client-side que o
formulário do GRM fazia no navegador — se algum campo for mal resolvido (ex.:
fuzzy match errado de Cliente Regional/Final, ponto de embarque não
encontrado em `operacional_pontos_embarque`), a O.S. pode ser criada errada
sem nenhum aviso visual. `avisarCampoSuspeito()` registra esses casos em
`erro_agente`/no log da execução quando dá pra detectar (ex.: nenhuma opção
bateu e caiu no fallback "1ª disponível"), mas não cobre tudo. Rodar
`node grmserver-abrir-os-api.js --test-payload <id>` compara o payload
montado com o que foi salvo de verdade numa solicitação já `CADASTRADO`, sem
tocar em status/execuções — útil pra conferir a cadeia de resolução depois de
qualquer mudança. `grm-sync-abrir-os.js` (Puppeteer) foi removido em 15/09
depois de 3 dias validado em produção sem incidente — usar `git log` /
`git show` pra recuperar o arquivo se precisar reverter.

```bash
cd /home/grao100/painel-scripts/grm-sync
/opt/node22/bin/node grmserver-abrir-os-api.js --dry-run   # monta payload de todas APROVADO, não envia ao GRM
/opt/node22/bin/node grmserver-abrir-os-api.js --test-payload <id>  # só imprime o payload de uma solicitação
```

## Lançamento automático de NHE (`sync-lancar-nhe`)

`grm-sync-lancar-nhe.js` (Puppeteer, lane `saida_logistica`, `mutex_group` `nhe_grm`) lança no GRM as NHE
("Falta de Caminhão") das O.S. de FOB/CIF que ficaram sem carga no dia anterior. Grava o resultado por O.S. em
`logistica_nhe_lancamentos_auto` (upsert `chave_unica` = `data|os`) e o resumo de cada execução em
`logistica_nhe_lancamentos_execucoes`.

**Fluxo de uma execução**

1. **Disparo diário:** um job `pendente` é criado uma vez por dia por `pg_cron` (migration
   `20260805111600_cron_sync_lancar_nhe_02h.sql`; nos jobs de produção aparece por volta das 06:00 UTC = 03h Brasília)
   e o worker da lane `saida_logistica` o pega em ~1-2 min. Trata a data de **ontem**.
2. **Cálculo dos pendentes:** recalcula a regra do FOB para a data e cruza O.S. sem carga real no mesmo local de
   embarque com o login do colaborador (`grm_login_movimentos_importacoes`). Também repesca pendências dos últimos
   `NHE_LANCAMENTO_REPROCESSAR_DIAS` dias (padrão 3) com status `SEM_LOGIN`, `FORA_DO_RAIO`, `ERRO`,
   `SEM_FUNCIONARIO` ou `LOTE_EXCEDIDO`. `SEM_COORDENADA_OS` tem janela própria de
   `NHE_LANCAMENTO_REPROCESSAR_SEM_COORDENADA_DIAS` dias (padrão 14), porque o ponto de embarque pode demorar a ganhar
   coordenada no cadastro do GRM (O.S. 94005: 28/09–02/10 sem coordenada, ponto só entrou em 06/10).
3. **Elegibilidade:** colaborador a até `NHE_LANCAMENTO_RAIO_M` (2000 m) do ponto da O.S. Fora do raio, lança no nome do
   gestor da regional (`viaGestor`). Sem login, sem coordenada da O.S. ou sem gestor → fica como pendência manual.
   Um grupo Cliente + ponto de embarque só recebe uma NHE **por dia** (a chave inclui a data; antes a 2ª data
   pendente da mesma O.S. era barrada como `MESMO_PONTO_AGRUPADO` "contra si mesma" e nunca lançada — 94005 em
   05/10 e 94517 em 06/10, 07/10/2026). Linhas assim, já gravadas, são repescadas.
4. **Lote de no máximo 8 lançamentos por execução** (`NHE_LANCAMENTO_LOTE`, teto 8; cada lançamento leva ~35-50 s no
   navegador e o watchdog do worker é de 12 min). Os candidatos cortados são gravados como `LOTE_EXCEDIDO`.
5. **Continuação encadeada:** se sobraram candidatos e o lote andou (`loteProgresso > 0`), o script insere em
   `grm_sync_jobs` um job `sync-lancar-nhe` com `payload = {"continuacao": true}` (só se não houver outro `pendente`).
   O worker o pega ~4 min depois e repete o ciclo até esvaziar. Um dia grande (ex.: 28/09/2026 com 28 candidatas) leva
   4 jobs seguidos.
6. **Refresh do relatório:** após lançar, enfileira `sync-nhe` para atualizar `grm_nhe_importacoes`.

**Pontos de falha conhecidos (e o que já cobre)**

- **502/503/504 do Supabase:** um 502 na gravação de `LOTE_EXCEDIDO` derrubou uma continuação em 29/09/2026 e deixou 20
  O.S. paradas até o dia seguinte (a cadeia só é reenfileirada no fim do script). Agora o cliente Supabase tenta de novo
  (`NHE_LANCAMENTO_SUPABASE_TENTATIVAS`, padrão 4, espera crescente), devolve erro curto em vez do HTML do Cloudflare, e o
  `catch` de `main()` reenfileira a continuação se houve progresso ou o erro foi instabilidade do Supabase.
- **Lista de Supervisão vazia** após escolher a Coordenação no modal (intermitente, ~4 em 770 lançamentos): o script
  reabre o campo até 3 vezes (fecha só o menu aberto — Escape sem menu fecharia o modal).
- Erros de tela do GRM sem tratamento próprio (ex.: ação "+NHE" indisponível para a conta de automação, funcionário
  não encontrado na lista) caem em `ERRO` e são repescados no dia seguinte.

**Diagnóstico**

```sql
-- execuções e continuações do dia (stdout completo do script em output->>'stdout')
select id, status, payload, iniciado_em, finalizado_em, erro, output->>'stdout' as stdout
from public.grm_sync_jobs
where agente_id = 'sync-lancar-nhe'
order by solicitado_em desc limit 10;

-- situação por O.S. da data de referência
select numero_os, status, erro, lancado_em
from public.logistica_nhe_lancamentos_auto
where data_referencia = '2026-09-28' order by status, numero_os;
```

- Resumo final de cada execução: linha `Concluído: {"pendentes":…,"candidatos":…,"sucesso":…,"erro":…}` no log/stdout.
- Um job de continuação que falha cedo pode não aparecer em `logs/worker-saida-logistica.log`; o stdout fica na coluna
  `output` do job.
- **Retomar manualmente** (lança NHE de verdade no GRM): confirmar que não há job `pendente`/`rodando` e inserir
  `{agente_id: 'sync-lancar-nhe', status: 'pendente', payload: {continuacao: true}}` em `grm_sync_jobs`.
- Modo avulso (não passa pela fila): `node grm-sync-lancar-nhe.js --os <número> --data AAAA-MM-DD [--dry-run] [--debug] [--forcar] [--gestor "NOME"]`.
  Com `--os` + `--data`, reabre também linha já gravada como `DRY_RUN_OK`, `FORA_DO_RAIO`, `SEM_LOGIN`,
  `SEM_FUNCIONARIO` ou `ERRO` (as travas reais são revalidadas). `--gestor` só vale quando o colaborador está fora do
  raio: lança em nome desse colaborador ativo (qualquer cargo) em vez do Supervisor/Coordenador da regional — usado
  quando a regional não tem gestor ativo cadastrado (91497, "PARA - Norte", 07/10/2026, Suporte Maria Eduarda).

## Rodar manualmente (debug)

```bash
cd /home/grao100/painel-scripts/grm-sync
/opt/node22/bin/node grmserver-colaboradores-sync.js
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

> **Nota (atualizado 11/09, conferido ao vivo via `crontab -l` no servidor):** a seção "Arquitetura" acima descreve uma versão anterior do worker (poll único a cada 15s, 1 job por vez). O esquema de 3 lanes que sucedeu aquilo (`fixed_a`/`fixed_b`/`fixed_c` + `alteracoes` + `despesas_distribuicao`) também já foi substituído: desde **2026-08-18** roda a **V2 de lanes**, ativada pelo flag `.grm-sync-v2-enabled` no servidor (8 lanes originalmente, **9 desde 11/09** — ver abaixo). A fila continua na mesma função Postgres `claim_next_grm_sync_job(p_lane, p_worker_id)` (`pg_advisory_xact_lock(872634503)` + `SELECT ... FOR UPDATE SKIP LOCKED`), consumida por `worker/grm-sync-job-worker.js --once --lane=<lane> --worker-id=<id>` via `worker/crontab-v2-8-lanes.txt` (1 processo cron por lane, 1x/min, `flock -n`, cada um só roda se o flag V2 existir). Lease/heartbeat libera job travado sem heartbeat há 10-20min. A alocação de cada agente por lane não é fixa em código — fica em `public.grm_sync_agent_settings` (coluna `queue_lane`, editável pela tela TI > Agentes). Esta seção documenta o estado encontrado nessa data — reconferir a tabela (não só este README) se voltar a mexer na fila.

**Capacidade concorrente por lane (9 lanes, 1 worker cada = máximo 9 agentes rodando ao mesmo tempo — `grm_sync_runtime_policy.max_workers=9`):**

| Lane | Agentes (`enabled=true` em `grm_sync_agent_settings`) |
|---|---|
| `entrada_os` | sync-nhe |
| `entrada_producao` | sync-classificacao-ourosafra, sync-resultado-diario, sync-resultado-diario-reconciliacao |
| `entrada_financeiro_a` | compras-match-nf, sync-adiantamentos, sync-auditorias, sync-contas-pagar, sync-notas-fiscais, sync-notas-fiscais-reconciliacao |
| `entrada_financeiro_b` | sync-contas-receber, sync-despesas |
| `entrada_cadastros_operacao` | sync-login-alimentacao, botconversa-sync, sync-btg-classificador, sync-btg-relatorios, sync-cargas-geofence, sync-clientes, sync-locais-embarque, sync-mapa-embarque, sync-patrimonios |
| `saida_os` | sync-reabrir-os |
| `saida_abertura_os` | sync-abrir-os (fila exclusiva desde 11/09 — antes dividia `saida_os` com sync-reabrir-os, pedido do usuário depois de ver o abrir-os esperar reabertura de O.S. terminar) |
| `saida_financeiro` | sync-bonus-caixa, sync-lancar-notas-fiscais, sync-liberacao-despesas, sync-bonus-desconto-caixa, sync-uber-gorjeta-caixa, sync-despesas-retroativas |
| `saida_logistica` | aplicar-distribuicao-os, sync-lancar-nhe, sync-btg-checkin |

Desabilitados no momento (`enabled=false`, ficam na tabela mas o worker pula): sync-operacional-os, sync-colaboradores, sync-distribuicao-os, sync-lista-os, sync-producao-diaria, sync-finalizar-os. `sync-baixa-notas-fiscais` não entra nessa tabela — roda só por disparo manual/auto-continuação (ver comentário no topo de `grmserver-baixa-notas-fiscais-api.js`).

**Importante:** separar a lane NÃO tornou sync-abrir-os totalmente independente — ele continua no `mutex_group='os_grm'` (junto com sync-reabrir-os, sync-finalizar-os, sync-lista-os), de propósito, pra não reabrir o bug antigo de "captura de número de O.S. errada por colisão entre clientes" (2 scripts de O.S. mexendo na mesma tela ao mesmo tempo). Ou seja: abrir-os agora tem sua própria posição na fila (não compete mais por ordem de chegada com reabrir-os dentro de `saida_os`), mas ainda espera se reabrir-os/finalizar-os/lista-os estiver rodando nesse instante — decisão deliberada do usuário ao ser avisado do trade-off.

`mutex_group` (não confundir com lane) impede que agentes do mesmo grupo rodem ao mesmo tempo mesmo em lanes diferentes: `staff_grm` (sync-bonus-caixa, sync-liberacao-despesas, sync-bonus-desconto-caixa, sync-uber-gorjeta-caixa, sync-despesas-retroativas, sync-despesas-duplicadas, sync-aprovar-pendencias, sync-colaboradores), `financeiro_grm` (sync-lancar-notas-fiscais), `nhe_grm` (sync-nhe, sync-lancar-nhe), `os_grm` (sync-abrir-os, sync-reabrir-os, sync-finalizar-os, sync-lista-os), `distribuicao_os_grm` (aplicar-distribuicao-os, sync-distribuicao-os).

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
