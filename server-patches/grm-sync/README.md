# Patches dos agentes GRM

Este diretório contém arquivos auxiliares para corrigir os agentes que rodam no servidor WHM/cPanel em:

```bash
/home/grao100/painel-scripts/grm-sync
```

## Problema corrigido

Alguns agentes faziam carga destrutiva direta na tabela final:

```js
await supabase.from('relatorio_resultado_diario').delete().neq('id', '');
await supabase.from('relatorio_resultado_diario').insert(rows);
```

Durante esse intervalo, o painel podia consultar a tabela vazia ou parcialmente carregada.

## Fluxo novo

O agente deve gravar primeiro na tabela staging e promover apenas no final:

1. `grm_limpar_staging('tabela_final')`
2. `insert` em `tabela_final_staging`
3. `grm_promover_staging('tabela_final', minimo_de_linhas)`

A promoção roda dentro de uma função SQL transacional. O painel não enxerga a tabela final vazia no meio da sincronização.

## Migration necessária

Aplicar no Supabase:

```text
supabase/migrations/20260630124500_grm_staging_promote_agents.sql
```

## Instalação do helper no servidor

No servidor:

```bash
cd /home/grao100/painel-scripts/grm-sync
cp safe-table-load.js safe-table-load.js.bkp-$(date +%F-%H%M) 2>/dev/null || true
```

Depois copiar o arquivo deste repositório:

```text
server-patches/grm-sync/safe-table-load.js
```

para:

```text
/home/grao100/painel-scripts/grm-sync/safe-table-load.js
```

## Alteração padrão em cada agente

Adicionar perto dos `require`:

```js
const { replaceTableSafely } = require('./safe-table-load');
```

Trocar o bloco antigo de delete/truncate + insert por:

```js
await replaceTableSafely(supabase, 'relatorio_resultado_diario', rows, {
  minRows: 1,
  chunkSize: 500,
  logger: console,
});
```

Para produção snapshot:

```js
await replaceTableSafely(supabase, 'producao_snapshot', rows, {
  minRows: 1,
  chunkSize: 500,
  logger: console,
});
```

Para cruzamento de colaboradores:

```js
await replaceTableSafely(supabase, 'colaborador_cruzamento', rows, {
  minRows: 1,
  chunkSize: 500,
  logger: console,
});
```

Para solicitações BTG:

```js
await replaceTableSafely(supabase, 'logistica_btg_solicitacoes', rows, {
  minRows: 1,
  chunkSize: 500,
  logger: console,
});
```

## Ordem recomendada

1. Aplicar a migration no Supabase.
2. Copiar `safe-table-load.js` para o servidor.
3. Corrigir primeiro `grm-sync-resultado-diario.js`.
4. Rodar o job manual uma vez.
5. Conferir status:

```sql
select * from public.grm_staging_status();
```

6. Corrigir `grm-sync-producao-diaria.js`.
7. Corrigir `grmserver-colaboradores-sync.js` / cruzamento.
8. Corrigir BTG.

## Comando de teste do agente

```bash
cd /home/grao100/painel-scripts/grm-sync
/home/grao100/bin/node grm-sync-resultado-diario.js
```

ou, se estiver usando o Node do cPanel:

```bash
/opt/cpanel/ea-nodejs16/bin/node grm-sync-resultado-diario.js
```

## Verificação rápida no Supabase

```sql
select * from public.grm_staging_status();

select
  relname as tabela,
  n_live_tup as linhas_estimadas,
  n_dead_tup as linhas_mortas,
  last_autovacuum,
  last_autoanalyze
from pg_stat_user_tables
where relname in (
  'relatorio_resultado_diario',
  'producao_snapshot',
  'colaborador_cruzamento',
  'logistica_btg_solicitacoes'
)
order by relname;
```
