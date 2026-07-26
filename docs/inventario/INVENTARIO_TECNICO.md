# Inventário Técnico do Painel — Grão1000

Documento gerado como primeiro item da fundação (P0, item 2.1 do plano de reestruturação). Os números abaixo refletem o estado do branch `main` em 26/07/2026 e são regeneráveis a qualquer momento com `node scripts/gerar-inventario.mjs`, que produz as matrizes detalhadas em CSV nesta mesma pasta.

## Visão geral

| Dimensão | Quantidade | Detalhe |
| --- | --- | --- |
| Páginas HTML (rotas) | 99 | Uma página por rota, montadas sobre `pageInit.js` + `layout.js` |
| Arquivos JavaScript em `assets/js` | 244 | Inclui 43 hotfixes/patches a incorporar nos módulos principais |
| Arquivos CSS | 17 | `styles.css` global + design system + CSS por módulo |
| Migrations Supabase | 153 | Em `supabase/migrations`, nomeadas por data |
| Edge Functions | 21 | Ver lista abaixo |
| Tabelas Supabase referenciadas no frontend | 162 | Matriz completa em `tabelas-supabase.csv` |
| RPCs referenciadas no frontend | 15 | Matriz completa em `rpcs.csv` |
| Workers na VPS | 3 | `email-worker` (cron a cada 3 min), `grm-sync` (fila `grm_sync_jobs`, cron 1 min + auto-scheduler 5 min), `uber-sftp-sync` (@reboot) |

## Arquivos gerados

A matriz principal exigida pelo plano (Módulo × Rota × Arquivo principal × Arquivos complementares × Tabelas × RPCs × Integrações) está em **`matriz-modulos.csv`**. As demais visões estão em **`tabelas-supabase.csv`** (cada tabela e onde é usada), **`rpcs.csv`** (cada RPC e onde é usada) e **`hotfixes.csv`** (cada hotfix, tamanho e módulo principal sugerido para incorporação).

## Edge Functions (Supabase)

`bfleet-posicoes`, `botconversa-send`, `correios-prepostagem`, `correios-smt-auth`, `correios-telegrama`, `email-account-save`, `enviar-relatorio-cliente`, `frotas-roteirizar`, `geocode-colaborador-base`, `geocode-colaboradores`, `geocode-operacional-os`, `gerar-proposta`, `hospedagem-whatsapp-webhook`, `ocr-comprovante`, `ocr-documento`, `ocr-documento-local`, `programacao-rota-equipe`, `sync-bfleet`, `sync-multas-detran`, `sync-veiculos-detran`, `update-bfleet-condutores`.

## Integrações externas

| Integração | Uso | Credencial |
| --- | --- | --- |
| GRM Server (grmserver.com.br) | Extração de dados operacionais via agentes (sem API oficial) | Conta administrativa, usada apenas nos workers |
| Bfleet / RedGPS | Rastreamento de veículos (posições, condutores) | Chave de API em Edge Function / worker (não exposta no frontend) |
| Botconversa | Notificações WhatsApp | Chave de API em Edge Function |
| Detran | Multas e veículos (planilha + sync) | Edge Functions `sync-multas-detran`, `sync-veiculos-detran` |
| Correios | Pré-postagem e telegrama | Edge Functions dedicadas |
| Google Drive | Recebimento de XML/NF/comprovantes | Agente GRM v2 |
| OCR (Tesseract no navegador, PaddleOCR na VPS) | Leitura de NF e comprovantes | Worker local + Edge Functions |

## Fluxo de deploy

O frontend é publicado por push na branch `main`, que dispara o workflow `.github/workflows/pages.yml` (GitHub Pages, branch `gh-pages`) e é servido em `grao1000.com.br/painel` através de Worker/Proxy Cloudflare. Os workers Node rodam na VPS `server.grao1000.com.br` sob o usuário `grao100`, agendados por cron. O arquivo `version.json` é regravado a cada deploy e o frontend faz poll dele para avisar sobre nova versão.

## Pontos de atenção mapeados (alimentam as fases seguintes)

O levantamento confirma os problemas descritos no plano de reestruturação: existem 43 arquivos de hotfix/patch carregados por cima dos módulos principais (a Programação sozinha carrega 12 scripts extras), consultas `supabase.from(...)` espalhadas por funções de renderização em praticamente todos os módulos, ausência de tabela de auditoria genérica com valor anterior/novo (existe apenas `app_logs_usuarios`, focada em login/acesso), e menu com dezenas de aliases de contingência em `menuConfig.js`. Esses pontos são endereçados pelos itens 2.2 a 2.7 da fundação, começando pelo módulo piloto de Notas Fiscais.
