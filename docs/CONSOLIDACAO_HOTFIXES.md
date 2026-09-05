# Roteiro de incorporação dos hotfixes vivos (diretriz 1.1)

Este documento registra, arquivo por arquivo, o plano de incorporação dos patches
que hoje são carregados junto com os módulos principais. A regra do projeto é
clara: nenhum hotfix novo será criado, e os existentes serão absorvidos pelo
módulo principal **mediante homologação**, porque vários deles alteram fluxo de
gestor em produção e uma concatenação cega poderia quebrar o que funciona.

## Por que não foi feito em um único passo

Os patches de Programação e Logística não são scripts independentes: eles se
importam entre si com versões fixadas em querystring (por exemplo,
`programacao-gestor-fluxo-avancado.js` importa `programacao-sem-os.js?v=20260723-fix3`
e `programacao-lista-drawer.js?v=20260723-anexo-saldo1`), sobrescrevem funções
uns dos outros e dependem da ordem exata de carregamento definida no
`router.js`. Incorporá-los ao arquivo principal muda a ordem de avaliação de
módulos ES e o escopo de variáveis, o que exige reteste humano dos fluxos de
programação de equipe, despesas, drawer de lista e ajustes de gestor antes de ir
para produção. Por isso a incorporação foi organizada em lotes homologáveis, e
não em um big-bang.

## Estado atual (o que o router carrega hoje)

| Página | Arquivo principal | Patches carregados em ordem |
|---|---|---|
| programacao | programacao.js (112 KB) | supervisoes-cache, ultima-programacao-fix, hospedagem-colaboradores-fix, gestor-ajustes, kpi-inline-patch, gestor-filtro-fix, mobile-ui-fix, gestor-fluxo-avancado, lista-drawer-fixo, lista-drawer-ux-hotfix |
| emails | emails.js | emails-secure-account, emails-layout |
| financeiro | financeiro.js | financeiro-access, financeiro-local-date |
| dashboard | dashboard.js | dashboardProducaoHistoryLink, dashboard-regional-map |
| compras-estoque | compras-estoque.js | pwa-register, compras-estoque-agrupamento, compras-estoque-layout |
| uber | uber.js | modules/uber-despesas-sync |
| epi-rh | epiRh.js | epiRhPresetPatch |
| admin-usuarios | admin-usuarios.js | admin-usuarios-create-password |

Os nove hotfixes **mortos** (não referenciados por nenhuma página) já foram
removidos do repositório na fundação P0.

**05/09/2026 — `emails-layout-v3.js` + `emails-layout-v4.js` fundidos em
`assets/js/emails-layout.js`.** As duas camadas rodavam ao mesmo tempo (v4
nunca foi adicionada ao `router.js`, só ao `emails.html` — dependendo de como
o usuário chegava na tela, uma ou as duas rodavam), cada uma injetando seu
próprio header "Caixa de Entrada" — causa da duplicação visual reportada pela
usuária. A fusão elimina esse drift, mas ainda é um patch carregado por cima
de `emails.js` (não incorporado ao módulo principal) — validado apenas com
fixture estático (sem login real disponível na sessão); falta homologação ao
vivo antes de considerar o item 100% fechado.

## Lotes de incorporação propostos (cada lote = 1 commit + homologação)

**Lote A — baixo risco (patches sem dependência cruzada):**
`programacao-supervisoes-cache`, `programacao-ultima-programacao-fix`,
`programacao-kpi-inline-patch`, `programacao-mobile-ui-fix`,
`financeiro-local-date`, `dashboardProducaoHistoryLink`. Cada um só importa o
`supabaseClient` e registra listeners próprios; podem ser copiados para o final
do módulo principal correspondente preservando o conteúdo integral, seguidos da
remoção do arquivo e da entrada em `extraModules`.

**Lote B — risco médio (dependência simples):**
`programacao-hospedagem-colaboradores-fix`, `programacao-gestor-ajustes`
(importa `TODAS_SUPERVISOES` de gestor-filtro-fix), `emails-secure-account`,
`emails-layout-v2`, `compras-estoque-agrupamento`, `compras-estoque-layout`.
Incorporar após o Lote A, mantendo `gestor-filtro-fix` como fonte do símbolo
exportado até o Lote C.

**Lote C — risco alto (rede de imports com versão fixada):**
`programacao-gestor-filtro-fix`, `programacao-gestor-fluxo-avancado`,
`programacao-lista-drawer.js`, `programacao-lista-drawer-fixo`,
`programacao-lista-drawer-ux-hotfix`, `programacao-sem-os.js`. Estes formam um
grafo de dependências e sobrescrevem `renderProgramacaoListaDrawer`; a
incorporação exige colapsar o grafo em um único módulo e retestar: filtro de
supervisões do gestor, fluxo avançado de programação, drawer da lista (fixo e
UX) e programação sem OS.

**Critério de conclusão por lote (seção 14 do plano):** funcional em produção,
sem erro de console, com auditoria registrando as ações e com o arquivo antigo
removido do repositório e do `router.js` no mesmo commit.
