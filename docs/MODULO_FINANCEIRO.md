# Módulo Financeiro — Mapeamento das funções em uso

Levantamento do que existe **hoje em produção** sob o guarda-chuva "financeiro": telas, tabelas, agentes GRM e onde cada função vive no menu. Não altera código nem menu — é a base para uma reestruturação futura, se e quando for decidido fazer uma. Gerado em 09/09/2026 a partir do código (`menuConfig.js`, `docs/inventario/*.csv`, `agentes-grm-sync/`).

## 1. O que existe hoje é fragmentado em 4+ seções de menu diferentes

Não existe uma seção única "Financeiro". As funções financeiras estão espalhadas assim em `assets/js/menuConfig.js`:

| Seção do menu | Itens financeiros dentro dela |
| --- | --- |
| **FINANCEIRO** | Fluxo de Caixa, Pagamentos, Adiantamentos, Alimentação, Hospedagem (financeiro) |
| **NOTAS FISCAIS** | Painel de Notas Fiscais, Enviar Notas Fiscais |
| **FATURAMENTO** | Painel de Faturamento (Painel do Dia / Agenda / Faturas / Documentos / Clientes e Tarifas) |
| **COMPRAS** | Painel de Compras, Estoque |
| **DIRETORIA** | DRE |
| **RECURSOS HUMANOS** | Folha e Holerite |
| **RELATÓRIOS** | Importar Relatórios (hub genérico que também serve Despesas, Notas Fiscais, Serviços Faturados, Caixa Fornecedor, Resultado Diário) |

Além disso, "Hospedagem" tem uma sub-área financeira própria dentro de `adm-hotel.html` (`hospedagem_financeiro`, pagamentos de alojamento), e "Compras" tem sua ponte de pagamento com `financeiro_pagamentos`.

## 2. Telas por função

### 2.1 Financeiro (`financeiro.html`)
Página única com várias sub-rotas por hash (`#pagamentos`, `#despesas?modo=adiantamentos`, `#despesas?modo=almoco`), carregada por 6 scripts empilhados:

- `financeiro-access.js` — controle de acesso por aba
- `financeiro.js` — Fluxo de Caixa, Pagamentos, Contas a Pagar/Receber (núcleo)
- `financeiro-adiantamentos-lote.js` — pagamento em lote de adiantamentos
- `financeiro-refeicoes-unicas.js` / `financeiro-refeicoes-arquivos.js` / `financeiro-refeicoes-refresh.js` — Alimentação (3 arquivos separados para a mesma função)
- `financeiro-alojamentos-faturas.js` — faturas de hospedagem dentro do financeiro

Tabelas usadas: `financeiro_fluxo_caixa_diario`, `financeiro_saldos_dia`, `financeiro_provisoes`, `financeiro_contas_pagar`, `financeiro_contas_receber`, `financeiro_pagamentos` (+ `_execucoes`, `_linhas`), `financeiro_adiantamentos_decisoes`, `financeiro_alimentacao_colaboradores`, `financeiro_notas_fiscais_resumo`, além de ler `grm_adiantamentos_importacoes`, `grm_notas_fiscais_importacoes`, `programacao_dia`, `programacao_equipe`, `colaboradores`, `compras_itens`, `rh_epi_registros`.

### 2.2 Notas Fiscais (`notas-fiscais.html`, `upload-notas-fiscais.html`)
Único módulo já migrado para o padrão de arquitetura em camadas (`assets/js/modules/notas-fiscais/{index,state,service,repository,validators,baixas}.js` + `components/`) — é o piloto citado em `docs/ARQUITETURA.md`. Consome `financeiro_notas_fiscais_resumo`, `financeiro_pagamentos`, `compras_itens`. "Lançar" enfileira lançamento de verdade no GRM via agente (ver 3.2).

### 2.3 Faturamento (`faturamento.html`)
1197 linhas num único arquivo (não migrado para o padrão em camadas). 5 abas: Painel do Dia, Agenda, Faturas, Documentos, Clientes e Tarifas. Tabelas: `faturamento_faturas`, `faturamento_clientes`, `faturamento_documentos`, `faturamento_tarifas`, `faturamento_agenda` — família de tabelas própria, sem prefixo `financeiro_`, sem sobreposição direta com o restante do financeiro além do controle de acesso por setor (`SETORES_FATURAMENTO = ['fatur', 'financ']`).

### 2.4 Compras (`compras.html`, `adm-compras.html`, `compras-estoque.html`)
Fluxo de solicitação → cotação → aprovação → boleto/nota. Tabelas: `compras_solicitacoes`, `compras_itens`, `compras_cotacoes`, `compras_notificacoes_config`, `compras_patrimonios_cadastro`, `compras_estoque_inventarios/materiais/movimentacoes`. Ponte com financeiro via `financeiro_pagamentos` (boleto exige NF anexada e vai direto para Notas Fiscais — ver [[painel-web-compras-boleto-nf-notas-fiscais-direto]]).

### 2.5 Hospedagem — financeiro (`adm-hotel.html#financeiro`)
Sub-aba dentro do módulo de Hotéis: `hospedagem_financeiro`, `hospedagem_custos_extras`, `hospedagem_documentos`, pagamentos de alojamento (`adm-hotel-alojamentos-pagamentos.js`) escrevendo em `financeiro_pagamentos`.

### 2.6 Folha e Holerite (`holerite-pagamentos.html`, RH)
Tabela própria `rh_folha` (+ `rh_empresas`). "Nova Folha" virou lote na fila de Notas Fiscais (`grm_nf_lancamentos`) — ver [[painel-web-nova-folha-lote-notas-fiscais]]. Vive em RECURSOS HUMANOS, não em FINANCEIRO, apesar de gerar lançamento financeiro.

### 2.7 DRE (`dre.html` → `modules/dre.js`, 1452 linhas + `modules/dre-agentes-fix.js`, 349 linhas de saneamento por cima)
Consolida `grm_despesas_importacoes`, `relatorio_resultado_diario`, `historico_colaboradores`, `relatorios_importacoes` numa demonstração de resultado. O "fix" por cima normaliza categorias de despesa que vêm inconsistentes do GRM (ex.: `DESPESASFINANCEIRAS` → `DESPESAS FINANCEIRAS`) — candidato a ser incorporado ao módulo principal (mesmo padrão de dívida técnica descrito em `docs/ARQUITETURA.md` §1).

### 2.8 Relatórios financeiros avulsos (menu RELATÓRIOS > Importar Relatórios)
`relatorio-despesas.html`, `relatorio-notas-fiscais.html`, `relatorio-servicos-faturados.html`, `relatorio-caixa-fornecedor.html`, `relatorio-resultado-diario.html` são todos a mesma casca (`relatorio-importador.js` → `window.RELATORIOS.openHome`), diferenciados por rota — não são módulos financeiros próprios, é um hub de import genérico reaproveitado.

## 3. Alimentação de dados: agentes GRM → Supabase

Nenhuma tela financeira digita dado "do zero" para o GRM — tudo nasce de sincronização automática (fila `grm_sync_jobs`, cron 1 min + auto-scheduler 5 min, arquitetura completa em `agentes-grm-sync/README.md`) ou é lançado de volta no GRM por um agente de escrita.

### 3.1 Agentes de leitura (GRM → Supabase, "lane fixed", 100% seguros em paralelo)

| Agente | Tabela destino | Alimenta a tela |
| --- | --- | --- |
| sync-despesas | `grm_despesas_importacoes` | DRE, Financeiro |
| sync-notas-fiscais | `grm_notas_fiscais_importacoes` | Notas Fiscais, Financeiro |
| sync-contas-pagar | `grm_contas_pagar_importacoes` | Financeiro (Contas a Pagar) |
| sync-contas-receber | `grm_contas_receber_importacoes` | Financeiro (Contas a Receber), Dashboard do Sócio |
| sync-adiantamentos | `grm_adiantamentos_importacoes` (upsert `ofr_code`) | Financeiro (Adiantamentos) |
| sync-nhe | `grm_nhe_importacoes` | NHE (lançamento automático) |
| sync-resultado-diario | `relatorio_resultado_diario` (via staging) | DRE, Conferência |

### 3.2 Agentes de escrita (Supabase/painel → GRM, com lock dedicado)

| Agente | Lane | Escreve | Observação |
| --- | --- | --- | --- |
| sync-liberacao-despesas | `despesas_distribuicao` | `grm_despesas_fila`, `grm_despesas_estado_colaborador` | Único agente com lock real (`claim_next_grm_despesa_fila()` + advisory lock) — libera despesa direto no GRM |
| sync-lancar-nhe | `alteracoes` | `logistica_nhe_lancamentos_auto/_execucoes` | Lança NHE automático por geofence de login (< 2km) |
| Lançar Notas Fiscais / Holerite (`grmserver-lancar-notas-fiscais-api.js`) | fila de Notas Fiscais | `grm_nf_lancamentos` | Migrado de Puppeteer para API; usado tanto por "Lançar" em Compras quanto por "Nova Folha" do RH |
| sync-despesas-retroativas | `alteracoes` | `grm_despesas_retroativas_auditoria` + GRM Caixa Operacional | Script pontual, sem passar por Programação |

Todos os agentes financeiros de leitura gravam por `upsert` com chave de conflito própria (idempotentes); nenhum deles compartilha tabela de escrita com outro agente do domínio financeiro, então não há colisão conhecida entre eles (diferente de `sync-lista-os`/`sync-auditorias`, que são os pontos frágeis do sistema como um todo).

## 4. Tabelas Supabase por família

| Família de tabela | Prefixo | Domínio |
| --- | --- | --- |
| Fluxo de caixa / pagamentos / contas | `financeiro_*` (11 tabelas) | Núcleo do módulo Financeiro |
| Faturamento a clientes | `faturamento_*` (5 tabelas) | Isolado do resto do financeiro |
| Compras / estoque | `compras_*` | Origem de solicitação de pagamento |
| Hospedagem | `hospedagem_*` (subconjunto financeiro: `hospedagem_financeiro`, `hospedagem_custos_extras`) | Ponte com Financeiro via `financeiro_pagamentos` |
| Folha | `rh_folha`, `rh_empresas` | RH, mas gera lançamento financeiro |
| Importação bruta do GRM | `grm_*_importacoes`, `grm_despesas_fila`, `grm_nf_lancamentos` | Camada de staging alimentada pelos agentes (seção 3) |

Matriz completa de tabelas × arquivo que as usa: `docs/inventario/tabelas-supabase.csv`. Matriz completa de módulo × rota × tabelas × integrações: `docs/inventario/matriz-modulos.csv`.

## 5. Pontos de atenção (sem mudar nada agora)

1. **Fragmentação de menu**: 4 seções de topo (FINANCEIRO, NOTAS FISCAIS, FATURAMENTO, COMPRAS) + 2 itens fora (DRE em DIRETORIA, Folha em RH) para o que é, na prática, um único domínio de negócio. Nenhuma tem uma visão consolidada de "quanto a empresa deve, quanto vai receber, quanto já pagou hoje" num único lugar.
2. **`financeiro.html` é uma página monolítica com 6 scripts empilhados** para abas diferentes (Fluxo de Caixa, Pagamentos, Adiantamentos em lote, Alimentação em 3 arquivos, Alojamentos/Faturas) — nenhuma delas segue o padrão de camadas de `docs/ARQUITETURA.md`; só Notas Fiscais foi migrada até agora.
3. **`faturamento.html` (1197 linhas) e `modules/dre.js` (1452 linhas)** são os maiores arquivos do domínio e também não seguem o padrão em camadas.
4. **`dre-agentes-fix.js`** é um hotfix vivo (349 linhas) por cima do DRE — normaliza categoria de despesa que já deveria vir correta do agente `sync-despesas`; é candidato natural a virar parte do módulo principal na próxima migração do DRE.
5. **Faturamento usa tabelas `faturamento_*` isoladas**, sem prefixo `financeiro_` e sem RPC própria — hoje só se conecta ao resto do financeiro por controle de acesso de setor, não por dado compartilhado.
6. **Folha e Holerite (RH) e Hospedagem (financeiro da hospedagem)** geram lançamento financeiro real mas vivem fora da seção FINANCEIRO do menu — quem só tem acesso a "Financeiro" não vê essas origens de despesa sem navegar para RH ou Hotéis.

## 6. Próximo passo (se decidido)

Este documento é só o mapeamento. Uma reestruturação de menu (unificar as 4+ seções numa só "Financeiro" com submenus) ou uma migração de `financeiro.html`/`faturamento.html`/`dre.js` para o padrão em camadas são esforços separados — cada um merece seu próprio plano e validação, já que mexem em código usado em produção e em códigos de permissão que afetam vários usuários.
