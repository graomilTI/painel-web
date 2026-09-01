# Padrão de Arquitetura do Painel — Grão1000

Este documento define o padrão obrigatório para todo desenvolvimento novo e para a incorporação gradual dos módulos existentes (P0, item 2.2 do plano de reestruturação). O padrão foi aplicado primeiro no módulo piloto **Notas Fiscais** (`assets/js/modules/notas-fiscais/`) e deve ser replicado nos demais módulos na ordem definida na seção 15 do plano.

## 1. Estrutura de módulo

Cada módulo vive em `assets/js/modules/<nome-modulo>/` com a seguinte estrutura:

```
assets/js/modules/nome-modulo/
├── index.js        # inicialização, eventos e integração dos componentes
├── state.js        # estado atual da página (createState do core)
├── service.js      # regras de negócio e transformação de dados
├── repository.js   # comunicação direta com Supabase (única camada que importa supabaseClient)
├── validators.js   # validações de entrada
├── components/
│   ├── filters.js
│   ├── table.js
│   ├── drawer.js
│   └── modal.js
└── styles.css      # estilos específicos do módulo
```

É proibido concentrar consulta ao Supabase, regra de negócio, HTML, CSS e eventos no mesmo arquivo. Também é proibido criar novos arquivos `*-fix.js`, `*-patch.js`, `*-layout-v2.js`, `*-runtime-fixes.js` ou `*-ajustes.js`: correções entram no módulo principal, e ao mexer num módulo que já possui hotfixes, o desenvolvedor deve incorporar o comportamento do hotfix ao módulo e remover o arquivo extra (a lista completa está em `docs/inventario/hotfixes.csv`).

## 2. Camadas e responsabilidades

| Camada | Arquivo | Pode importar | Não pode |
| --- | --- | --- | --- |
| Repository | `repository.js` | `core/supabaseService.js` | Tocar em DOM, conter regra de negócio |
| Service | `service.js` | repository, validators | Tocar em DOM, importar supabaseClient |
| State | `state.js` | `core/state.js` | Fazer requisições |
| Components | `components/*.js` | `core/ui.js`, state | Importar supabaseClient ou repository |
| Index | `index.js` | tudo acima + `pageInit.js` | Conter SQL/queries ou HTML extenso |

Os repositórios usam o wrapper `core/supabaseService.js`, que padroniza filtros, paginação, ordenação, cancelamento de requisição, cache com invalidação, retry e mensagens de erro. Nenhuma tela pode cair para dados locais ou demonstrativos quando o Supabase retornar erro: o erro é exibido com o componente `errorState` do design system, com botão de tentar novamente.

## 3. Serviços por domínio

Os serviços de domínio previstos são `programacaoService`, `logisticaService`, `financeiroService`, `notasFiscaisService`, `hospedagemService`, `frotasService` e `rhService`. Cada um nasce quando o respectivo módulo é migrado para o padrão (o piloto criou `modules/notas-fiscais/service.js`). Um serviço nunca é duplicado: se dois módulos precisam da mesma regra, ela vive no serviço do domínio dono do dado.

## 4. Migrations e banco

Toda alteração de banco gera arquivo em `supabase/migrations/` no formato `YYYYMMDDHHMMSS_dominio_descricao.sql`, contendo criação/alteração de tabela, índices, foreign keys, constraints, views, funções, triggers, policies RLS, comentários (`COMMENT ON`) e scripts de correção de dados quando necessários. SQL manual direto em produção é proibido.

Toda tabela operacional deve possuir: chave primária `id uuid default gen_random_uuid()`, `created_at`/`updated_at timestamptz`, `created_by`/`updated_by uuid references auth.users(id)`, foreign keys e constraints explícitas, índices nos campos de filtro e nos relacionamentos, RLS habilitado com policies de leitura/inclusão/alteração/exclusão, e histórico de mudanças via trigger `fn_registrar_auditoria()` (ver migration `20260726120000_fundacao_auditoria.sql`).

Convenções de nomes: tabelas em `snake_case` com prefixo de domínio (`logistica_`, `compras_`, `rh_`, `frotas_`, `financeiro_`, `hospedagem_`, `app_` para infraestrutura); campos de status sempre `status text` com `CHECK` listando os valores em MAIÚSCULAS; datas de negócio como `date`, carimbos como `timestamptz`.

## 5. Auditoria e rastreabilidade

Toda ação relevante registra usuário, módulo, registro afetado, ação, valor anterior, valor novo, data e hora, origem da ação e erro quando houver. Existem dois mecanismos complementares:

1. **Trigger de banco** `fn_registrar_auditoria()` anexável a qualquer tabela (`SELECT fn_habilitar_auditoria('nome_tabela')`), gravando em `app_auditoria` com diff automático de valores.
2. **Cliente** `core/audit.js` (`registrarAuditoria({...})`) para ações que não passam por UPDATE direto (envio de e-mail, geração de arquivo, chamadas a integrações), gravando na mesma tabela com `origem = 'frontend'`.

A tela de Auditoria do sistema consulta `app_auditoria` com filtros por usuário, módulo, ação, registro e período, mostrando a comparação entre valor anterior e novo.

## 6. Menu, rotas e permissões (origem única)

A cadeia canônica é: `app_modulos` (banco) → permissões do usuário (RPC de contexto) → registro de rotas (`core/routes.js`) → `menuConfig.js` → proteção da rota (`authGuard.js`) → permissão das ações. Um módulo novo é criado inserindo o código em `app_modulos`, adicionando uma entrada em `menuConfig.js` com o **mesmo código** e criando a página HTML: sem aliases novos e sem listas de contingência. Os aliases existentes em `menuConfig.js` estão congelados para compatibilidade e devem encolher conforme os códigos do banco forem normalizados (ver `core/routes.js`, que valida duplicidades e expõe o registro central).

## 7. Design system

Os componentes reutilizáveis vivem em `core/ui.js` + `assets/css/design-system-components.css` e cobrem: cabeçalho de página, abas, cards, KPIs, filtros, campos, selects pesquisáveis (`searchableSelect.js` existente), tabelas com paginação e ordenação, modais, drawers, badges/status, upload, preview de documento, confirmação, toast, tela vazia, loading, erro com retry e bloqueio de acesso. O visual mantém dark theme, detalhes em verde, layout compacto, bom contraste e comportamento responsivo. Páginas novas não escrevem `<style>` inline com componentes genéricos: usam o design system e mantêm no `styles.css` do módulo apenas o que for específico.

## 8. Carregamento, estados e performance

Toda tela deve implementar os estados: `loading` (skeleton/spinner do design system), `empty` (tela vazia com orientação), `error` (mensagem + tentar novamente) e `ok`. O componente `dataStatus` exibe última atualização, origem do dado, duração da sincronização e erro da última tentativa. Nenhuma tela pode ficar preta ou vazia sem informar o problema (o watchdog do `pageInit.js` cobre o boot; o design system cobre o conteúdo).

Regras de performance obrigatórias: paginação server-side via `listar()` do `supabaseService`; debounce de 300 ms em buscas; cancelamento de requisições anteriores (AbortController integrado ao wrapper); cache com invalidação explícita por chave; renderização somente da aba ativa (nunca manter tabelas grandes ocultas no DOM); prevenção de boot e listeners duplicados (guard de boot único por módulo em `index.js`).

## 9. Critério de conclusão de entrega

Uma entrega só é concluída quando possui migration versionada, policies RLS, índices necessários, serviço ou repository, validação, tratamento de erro, loading, estado vazio, responsividade, permissão de acesso, auditoria, teste do fluxo principal, teste de regressão, documentação curta e homologação com o setor responsável. O desenvolvimento acontece por entregas pequenas, com commits claros, e homologação antes de avançar para a próxima parte crítica.
