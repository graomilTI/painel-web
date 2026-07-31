# Agente de liberação de despesas no GRM

Sincroniza a programação versionada do gestor com **Regras de Caixa Operacional** em:

```text
https://www.grmserver.com.br/adm/team/staff
```

O agente pesquisa o funcionário por **CPF**, substitui somente as linhas de Caixa Operacional e não altera permissões gerais, cadastro, histórico financeiro, check-in/check-out ou acesso a módulos.

## Regras funcionais implementadas

- Uma O.S. com status `ATENDER` precisa possuir colaborador associado.
- Somente colaboradores ativos são processados.
- Colaborador com O.S. `ATENDER` recebe exatamente as regras versionadas da Programação.
- Colaborador ativo sem nenhuma O.S. `ATENDER` de hoje em diante recebe ação `LIMPAR`.
- Antes de limpar, o backend consulta todas as regionais. Se o CPF estiver atendendo em outra regional, a regra é preservada.
- O gestor publica apenas as programações que a RLS permite visualizar.
- A fila é versionada por CPF e hash. Uma versão antiga é encerrada como `IGNORADO_VERSAO_SUPERADA`.
- Máximo de três tentativas por alteração.
- Um erro técnico faz o script sair com código diferente de zero; o worker não mostra falso sucesso.
- Em erro, uma screenshot é salva mesmo com debug desligado.

## Gatilhos no painel

O arquivo `assets/js/programacao-grm-despesas-sync.js` publica uma versão:

1. após cinco minutos sem alteração;
2. ao clicar em **Salvar programação**;
3. ao trocar de supervisão/data ou navegar para outra tela;
4. ao fechar a aba/janela, usando `fetch(..., { keepalive: true })`.

A Edge Function espera um curto intervalo antes de ler o banco nos gatilhos de saída, permitindo que os autosaves já existentes terminem.

## Tabelas

A migration cria:

- `grm_despesas_tipos_config`: nome exato e limite de cada categoria no GRM;
- `grm_despesas_versoes`: versões fechadas por regional/data/gestor;
- `grm_despesas_estado_colaborador`: estado desejado e último hash aplicado por CPF;
- `grm_despesas_fila`: ações `APLICAR` e `LIMPAR`, tentativas, diagnóstico e screenshot.

Também cria a RPC atômica:

```sql
select * from public.claim_next_grm_despesa_fila();
```

## Configuração obrigatória das categorias

O painel atualmente registra seleção de Café/Almoço/Janta, mas nem todas as telas guardam um valor monetário. Por segurança, a sincronização não inventa limites.

A migration ativa inicialmente apenas o exemplo confirmado nas telas fornecidas:

```text
Almoço = R$ 30,00
Exibir = sim
AUTO = não
Carga/NHE = sim
Máx. Mov./Dia = 1
```

Antes de ativar outros tipos, revise:

```sql
select *
from public.grm_despesas_tipos_config
order by origem, chave;
```

Depois ajuste `tipo_grm`, `valor_padrao` e `ativo=true`. Se o gestor selecionar uma despesa ainda não configurada, a Edge Function bloqueia a publicação inteira daquela regional; ela nunca faz uma substituição parcial.

## Implantação

### 1. Banco

Aplique:

```text
supabase/migrations/20260731153000_grm_liberacao_despesas.sql
```

### 2. Edge Function

Implante:

```text
supabase/functions/grm-liberacao-despesas-publicar/index.ts
```

A função usa JWT do gestor para ler `programacao_dia` e service role somente para montar a fila.

### 3. VPS

Copie para:

```text
/home/grao100/painel-scripts/grm-sync/grm-sync-liberacao-despesas.js
```

Atualize também:

```text
/home/grao100/painel-scripts/grm-sync/worker/grm-sync-job-worker.js
```

Permissões sugeridas:

```bash
chown grao100:grao100 \
  /home/grao100/painel-scripts/grm-sync/grm-sync-liberacao-despesas.js \
  /home/grao100/painel-scripts/grm-sync/worker/grm-sync-job-worker.js

chmod 750 \
  /home/grao100/painel-scripts/grm-sync/grm-sync-liberacao-despesas.js \
  /home/grao100/painel-scripts/grm-sync/worker/grm-sync-job-worker.js
```

### 4. Primeiro teste — somente leitura

No `.env`:

```dotenv
GRM_LIBERACAO_DESPESAS_DRY_RUN=true
GRM_LIBERACAO_DESPESAS_MAX_POR_EXECUCAO=1
GRM_LIBERACAO_DESPESAS_DEBUG=true
```

Valide sintaxe:

```bash
cd /home/grao100/painel-scripts/grm-sync
/home/grao100/bin/node --check grm-sync-liberacao-despesas.js
/home/grao100/bin/node --check worker/grm-sync-job-worker.js
```

Execute:

```bash
runuser -u grao100 -- bash -c '
  cd /home/grao100/painel-scripts/grm-sync &&
  /home/grao100/bin/node grm-sync-liberacao-despesas.js
'
```

O `DRY_RUN` abre o funcionário, expande Caixa Operacional, lê as regras e grava o diagnóstico na fila. Ele não clica em excluir, adicionar ou salvar.

### 5. Teste real supervisionado

Depois de confirmar pelo log que:

- o CPF correto foi localizado;
- a seção correta foi aberta;
- as regras atuais foram lidas corretamente;
- os nomes configurados existem no dropdown do GRM;

altere:

```dotenv
GRM_LIBERACAO_DESPESAS_DRY_RUN=false
GRM_LIBERACAO_DESPESAS_MAX_POR_EXECUCAO=1
```

Teste primeiro um único CPF. O agente salva, reabre o funcionário e compara o conteúdo confirmado com o hash desejado.

## Diagnóstico

Fila:

```sql
select
  created_at,
  regional,
  nome,
  cpf,
  acao,
  status,
  tentativas,
  ultimo_erro,
  diagnostico,
  screenshot_path
from public.grm_despesas_fila
order by created_at desc;
```

Estado atual:

```sql
select
  nome,
  cpf,
  regional_origem,
  deve_liberar,
  status_aplicacao,
  hash_desejado,
  hash_aplicado,
  aplicado_em
from public.grm_despesas_estado_colaborador
order by updated_at desc;
```
