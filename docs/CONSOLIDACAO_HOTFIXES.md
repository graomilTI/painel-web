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
| programacao | programacao.js | (nenhum — os 15 hotfixes que existiam nesta rota foram todos incorporados; `programacao-lista-drawer.js` e `programacao-sem-os.js` continuam como módulos próprios, não hotfixes, importados normalmente) |
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

**17/09/2026 — Lote A de Programação incorporado (baixo risco, 9 arquivos).**
`programacao-supervisoes-cache`, `programacao-ultima-programacao-fix`,
`programacao-kpi-inline-patch`, `programacao-mobile-ui-fix`,
`programacao-pdf-tipo-fix`, `programacao-indisponibilidade-sync`,
`programacao-indisponibilidade-rh-lock`, `programacao-regional-colaboradores-strict`
e `programacao-grm-despesas-sync` foram movidos para dentro de `programacao.js`,
cada um em um bloco `{ ... }` isolado (havia nomes repetidos entre eles —
`boot`, `injetarStyles`, `normalizeText`, `todayIso` — que colidiriam se
concatenados soltos). Nenhum deles importava de outro hotfix, então não fazem
parte da rede de dependências do Lote C. De quebra, a incorporação do
`pdf-tipo-fix` expôs ~240 linhas de código morto em `programacao.js`
(`gerarPdfProgramacao` e seus helpers, nunca executavam porque o hotfix
sequestrava o clique do botão via `stopImmediatePropagation` desde antes) —
removidas no mesmo commit. Falta homologação ao vivo (sem login real
disponível na sessão): reabrir Programação, gerar PDF, compartilhar via
WhatsApp, indisponibilidade do RH nos cards de Sem O.S., e confirmar que a
publicação de despesas pro GRM continua disparando. Restam no router
(`extraModules`) apenas os 6 arquivos do grafo de dependências (Lote B/C):
`programacao-hospedagem-colaboradores-fix`, `programacao-gestor-ajustes`,
`programacao-gestor-filtro-fix`, `programacao-gestor-fluxo-avancado`,
`programacao-lista-drawer-fixo`, `programacao-lista-drawer-ux-hotfix`.

**17/09/2026 — Lote B/C de Programação incorporado (os 6 restantes, grafo de
dependências).** Diferente da suposição inicial deste documento, os hotfixes
não formam uma rede de imports entre si na prática: `renderProgramacaoListaDrawer`
(`programacao-lista-drawer.js`) e `renderProgramacaoSemOs` (`programacao-sem-os.js`)
só eram importados por `gestor-fluxo-avancado.js` — nenhum outro hotfix os
referenciava — e continuam como módulos próprios (não são hotfixes, são
sub-renderers de aba; ficaram de fora da incorporação, `programacao.js` agora
os importa diretamente). `gestor-filtro-fix.js` virou uma única `const
TODAS_SUPERVISOES = '__TODAS__'` no topo do arquivo. A ponte real entre
`gestor-ajustes` e `gestor-fluxo-avancado` é via `window.__pgcProgramacaoReload`
(runtime, não import estático), então independe de ordem textual.

A dependência de ordem que **importava de verdade**: `programacao-supervisoes-cache`,
`programacao-ultima-programacao-fix`, `programacao-hospedagem-colaboradores-fix`
e `programacao-regional-colaboradores-strict` **todos** fazem monkey-patch de
`supabase.from` (encadeando um `originalFrom` sobre o anterior) — descoberta
só nesta rodada, não estava mapeada antes. A ordem relativa original (a mesma
do `router.js`/`programacao.html` de antes) foi preservada no arquivo final:
supervisoes-cache → ultima-programacao-fix → hospedagem-colaboradores-fix →
regional-colaboradores-strict (mais externo). Inverter essa ordem faria o
filtro "match exato de supervisão" do regional aplicar sobre a consulta de
colaboradores elegíveis do hospedagem-colaboradores-fix, que usa um parâmetro
de supervisão próprio (nem sempre igual ao `#progSup` do DOM) — teria mudado
resultado silenciosamente.

Também achado: em `programacao-lista-drawer-ux-hotfix.js`, o handler de clique
em `[data-pld-add-toggle]` (capture, `stopImmediatePropagation`) já sequestra
o clique antes do handler equivalente em `programacao-lista-drawer-fixo.js`
(bubble) rodar — ou seja, a lógica de toggle deste último já era código morto
antes desta consolidação. Não removido nesta rodada (fora do escopo, para não
empilhar duas mudanças de risco no mesmo commit) — candidato pra próxima
limpeza.

Com isso, a rota `programacao` fica sem nenhum hotfix pendente. Falta
homologação ao vivo (sem login real disponível na sessão): abrir Programação,
alternar abas O.S./Sem O.S., editar equipe/despesas no painel lateral em
desktop e mobile, trocar supervisão pelo combo pesquisável, e confirmar que o
embarque continua bloqueando Auditor/Administrativo e priorizando alojamento
por distância.

**20/09/2026 — Consolidação final da entrada da Programação.** Os cinco pontos
que ainda escapavam da lista acima foram removidos da camada de hotfix:
`programacao-equipe-os-atual-fix` foi incorporado diretamente a
`programacao-equipe.js`; persistência de contexto, calendário de duplicação,
visualização de despesas por O.S. e compartilhamento passaram a módulos de
funcionalidade com nomes estáveis, importados por `programacao.js`. O import map
e os scripts adicionais saíram de `programacao.html`, de modo que carga direta
e soft-nav agora executam o mesmo grafo de módulos. O CSS de toolbar também
passou a `programacao-toolbar.css`. A suíte automatizada específica de
Programação terminou com 24/24 testes aprovados; a homologação ao vivo continua
sendo o último critério operacional antes de publicação.

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
