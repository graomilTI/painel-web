# Entrega — Fundação P0 + Módulo Piloto (Notas Fiscais)

Esta entrega implementa a **fundação obrigatória (P0)** definida no plano de reestruturação, seguindo exatamente a ordem de execução da seção 15: inventário técnico → padrão de arquitetura → banco/auditoria → camada de serviços → menu/rotas → design system → logs/monitoramento → primeiro módulo no padrão. O módulo piloto escolhido foi **Notas Fiscais**, que também atende a primeira demanda funcional objetiva do documento (item 6.1: remover o Resumo Financeiro e manter apenas as janelas de NFs PENDENTES e LANÇADOS).

## O que foi entregue

| Item do plano | Entregável | Onde está |
| --- | --- | --- |
| 2.1 Inventário técnico | Documento + 4 matrizes CSV regeneráveis por script | `docs/inventario/` + `scripts/gerar-inventario.mjs` |
| 2.2 Padrão de arquitetura | Documento normativo com estrutura de módulo, camadas e critérios de entrega | `docs/ARQUITETURA.md` |
| 2.3 / 1.5 Banco e auditoria | Tabela `app_auditoria` (RLS + índices), trigger genérica `fn_registrar_auditoria()` com diff automático, helper `fn_habilitar_auditoria()`, view `vw_monitoramento_sync` | `supabase/migrations/20260726120000_fundacao_auditoria.sql` |
| 2.4 Camada de serviços | Wrapper padrão de consultas: filtros, paginação server-side, ordenação, busca, cache invalidável, retry, cancelamento de corrida, mensagens de erro padronizadas (sem fallback para dados demo) | `assets/js/core/supabaseService.js` |
| 2.4 Auditoria frontend | `registrarAuditoria()` para ações que não passam por UPDATE direto | `assets/js/core/audit.js` |
| 2.4 Estado | Mini-store por módulo com subscribe | `assets/js/core/state.js` |
| 2.5 / 1.4 Menu e rotas | Registro central derivado do `menuConfig` (origem única) + validador de duplicidades/aliases | `assets/js/core/routes.js` |
| 2.6 Design system | Componentes reutilizáveis: hero, abas, KPIs, tabela com ordenação/paginação, modal, confirmação, toast, badges, loading/vazio/erro com "tentar novamente", bloqueio de acesso | `assets/js/core/ui.js` + `assets/css/design-system-components.css` |
| 2.7 Logs/monitoramento | Componente `dataStatus` (última atualização, origem, duração, erro) + view SQL de monitoramento dos agentes | `core/ui.js` + migration |
| 6.1 Notas Fiscais | Aba "Resumo Financeiro" removida; módulo refeito no padrão com janelas PENDENTES e LANÇADOS, busca, ordenação, paginação e auditoria do lançamento | `assets/js/modules/notas-fiscais/` |

## Como o módulo piloto ficou

A página de Notas Fiscais agora possui apenas os seletores **Pendentes** e **Lançados** (com contador em cada um), três KPIs (NFs pendentes, total pendente, total lançado), busca com debounce de 300 ms por regional/solicitante/fornecedor/CNPJ/número, ordenação por coluna, paginação, indicador de última atualização e os quatro estados de tela do padrão (carregando, vazio, erro com tentar novamente, ok). O botão "Lançado" abre a confirmação do design system (substituindo o `window.confirm`) e o lançamento grava auditoria em `app_auditoria` — tanto no sucesso quanto na falha. A leitura automática dos dados da NF (XML e OCR) foi preservada integralmente no `service.js`.

O arquivo `assets/js/notas-fiscais.js` foi mantido como ponto de entrada fino (reexporta `renderContent` e chama `initProtectedPage`), então **nada muda** para o `notas-fiscais.html`, para o router de navegação suave nem para as permissões existentes.

## Como publicar

1. **Migration**: aplicar `supabase/migrations/20260726120000_fundacao_auditoria.sql` no projeto Supabase (SQL Editor ou `supabase db push`). A migration é idempotente e não altera nenhuma tabela existente — apenas cria `app_auditoria`, as funções e a view, e anexa a trigger de auditoria em `compras_itens` e `financeiro_pagamentos`.
2. **Frontend**: fazer merge do branch `feat/fundacao-p0` na `main` e push — o GitHub Pages publica automaticamente e o painel avisa os usuários da nova versão pelo `version.json`.

## Como validar (homologação)

1. Abrir **Notas Fiscais** no painel: conferir que não existe mais "Resumo Financeiro" e que as janelas Pendentes/Lançados mostram as mesmas NFs de antes.
2. Consultar uma NF pendente (modal com fornecedor/CNPJ/número lidos do arquivo) e marcá-la como lançada; conferir que ela migra para "Lançados".
3. No Supabase, `select * from app_auditoria order by created_at desc limit 20`: deve haver o registro da ação (`origem = 'frontend'`) e os UPDATEs auditados pela trigger (`origem = 'banco'`), com valor anterior/novo por campo.
4. Rodar `node scripts/gerar-inventario.mjs` e conferir as matrizes atualizadas em `docs/inventario/`.

## Roadmap sugerido (ordem da seção 15 do plano)

Com a fundação pronta, os módulos entram um a um no padrão, cada um com homologação antes do próximo: **Logística** (fase 3 do plano: OS, conferência, informativos, FOB — incorporando os hotfixes ao módulo principal), depois **Programação/O.S** (fase 4), **RH** (fase 5), **Financeiro/NF/Faturamento** (fase 6 — 6.1 já entregue nesta rodada), **Compras/Patrimônios** (fase 7), **Frotas** (fase 8), **Hospedagem** (fase 9) e assim por diante. A lista de hotfixes a incorporar por módulo está em `docs/inventario/hotfixes.csv` e as regras de incorporação no `docs/ARQUITETURA.md`.
