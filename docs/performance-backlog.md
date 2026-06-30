# Backlog de performance — Supabase Advisors

Gerado em **2026-06-29** a partir dos *Database Advisors* do Supabase
(projeto `xyzpnuumdqhegxakkyws`). É um backlog de manutenção do banco — **não
bloqueia nada hoje**, mas vale atacar aos poucos.

> **Como regenerar:** Supabase Dashboard → *Advisors* → *Performance* / *Security*,
> ou via MCP `get_advisors`. Recontagem antes de mexer é recomendada (a lista muda
> conforme uso e migrações).

## Resumo (snapshot 2026-06-29)

| Categoria | Nível | Qtd | Risco de corrigir |
|---|---|---|---|
| `unused_index` (índices sem uso) | INFO | 272 | Médio — confirmar que não são de query sazonal antes de dropar |
| `multiple_permissive_policies` | WARN | 74 | Médio/Alto — exige revisar a lógica de cada policy |
| `unindexed_foreign_keys` | INFO | 64 | Baixo — criar índice é seguro |
| `duplicate_index` | WARN | 33 → **32** | Baixo — dropar o redundante |
| `auth_rls_initplan` | WARN | 6 → **5** | Baixo — `auth.uid()` → `(select auth.uid())` |
| `no_primary_key` | INFO | 1 | Baixo — é tabela de backup |
| `auth_db_connections_absolute` | INFO | 1 | Config de pool, não schema |

## Já resolvido nesta sessão (2026-06-29)

- ✅ **Índice duplicado** em `colaborador_snapshot` (`idx_colab_snapshot_data` removido; mantido `_data_ref`).
- ✅ **RLS initplan** em `programacao_usuario_supervisoes` (`auth.uid()` → `(select auth.uid())`).
- ✅ **Segurança**: revogado `EXECUTE` público da RPC `programacao_colaboradores_supervisao` (só `authenticated`).

---

## 1. `auth_rls_initplan` (WARN) — 5 restantes · risco baixo

Policies que reavaliam `auth.uid()`/`current_setting()` **por linha**. Envolver em
subselect faz o Postgres avaliar **uma vez**: `using (col = (select auth.uid()))`.

- `chamados_ti` → `chamados_ti_select`, `chamados_ti_insert`, `chamados_ti_update`
- `chamados_ti_comentarios` → `chamados_ti_comentarios_select`, `chamados_ti_comentarios_insert`

Padrão: `alter policy "<nome>" on public.<tabela> using ((select auth.uid()) = <coluna>);`
(e `with check` para insert/update, conforme a policy).

## 2. `duplicate_index` (WARN) — 32 restantes · risco baixo

Índices idênticos na mesma tabela; dropar o redundante economiza escrita e storage.

> ⚠️ **Cuidado**: quando um do par é uma **constraint única** (nome geralmente
> `*_key`, ou `*_uidx`/`*_unique` que respaldam uma constraint), **mantenha a
> constraint** e drope o índice "solto". Nesses casos `DROP INDEX` no índice de
> constraint falha — use `ALTER TABLE ... DROP CONSTRAINT` só se for de fato
> redundante. Verifique com:
> `select conname from pg_constraint where conindid = '<indice>'::regclass;`

| Tabela | Índices idênticos |
|---|---|
| app_usuario_modulos | app_usuario_modulos_modulo_id_idx, idx_app_usuario_modulos_modulo |
| app_usuario_modulos | app_usuario_modulos_usuario_id_idx, idx_app_usuario_modulos_usuario |
| app_usuarios | app_usuarios_perfil_id_idx, idx_app_usuarios_perfil_id |
| colaborador_importacoes | idx_colab_importacoes_data, idx_colaborador_importacoes_data_ref |
| colaboradores | idx_colaboradores_nome, ix_colaboradores_nome |
| compras_itens | idx_compras_itens_solicitacao, idx_compras_itens_solicitacao_id |
| conferencia_uber_corridas | conferencia_uber_import_hash_unique, ux_conferencia_uber_import_hash |
| financeiro_pagamentos | financeiro_pagamentos_created_idx, idx_financeiro_pagamentos_created_at |
| financeiro_pagamentos | financeiro_pagamentos_status_idx, idx_financeiro_pagamentos_status |
| frotas_excesso_velocidade | idx_frotas_excesso_placa, idx_frotas_excesso_velocidade_placa |
| frotas_excesso_velocidade | frotas_excesso_velocidade_import_hash_key, ux_frotas_excesso_velocidade_import_hash |
| frotas_multas | idx_frotas_multas_data, idx_frotas_multas_data_infracao |
| frotas_multas | frotas_multas_placa_idx, idx_frotas_multas_placa |
| frotas_multas | idx_frotas_multas_status, idx_frotas_multas_status_multa |
| frotas_veiculos | idx_frotas_veiculos_placa, idx_frotas_veiculos_placa_bfleet |
| frotas_veiculos | idx_frotas_veiculos_bfleet_rastreador, idx_frotas_veiculos_rastreador_bfleet |
| frotas_veiculos | frotas_veiculos_placa_key, ux_frotas_veiculos_placa |
| historico_colaboradores | ux_hist_colab, ux_historico_colaboradores_data_cpf |
| hospedagem_historico_colaboradores | hospedagem_historico_colaboradores_unique_hash_key, uq_hospedagem_historico_colaboradores_hash |
| operacional_colaborador_base | idx_operacional_colaborador_ativo, idx_operacional_colaborador_base_ativo |
| operacional_colaborador_base | idx_operacional_colaborador_base_cidade_uf, idx_operacional_colaborador_cidade_uf |
| operacional_os | operacional_os_numero_os_key, operacional_os_numero_os_uidx |
| operacional_os_colaboradores | idx_operacional_os_colab_os_id, idx_operacional_os_colaboradores_os, idx_operacional_os_colaboradores_os_id (3 iguais) |
| operacional_os_colaboradores | operacional_os_colab_os_key_uidx, operacional_os_colaboradores_os_id_colaborador_key_key |
| operacional_pontos_embarque | idx_operacional_pontos_embarque_coord, idx_operacional_pontos_embarque_coordenacao |
| patrimonios_historico_leituras | idx_patrimonios_hist_codigo, patrimonios_historico_leituras_codigo_idx |
| patrimonios_snapshot | patrimonios_snapshot_patrimonio_codigo_uidx, uq_patrimonios_snapshot_patrimonio_codigo |
| programacao_colaboradores | idx_prog_colab_programacao, idx_programacao_colaboradores_programacao |
| programacao_deslocamento | idx_programacao_deslocamento_placa, idx_programacao_deslocamento_placa_veiculo |
| programacao_extras | idx_prog_extras_programacao, idx_programacao_extras_programacao |
| programacao_itens | programacao_itens_contexto_id_colaborador_cpf_key, ux_programacao_itens_contexto_cpf |
| ti_integracao_segredos | ti_integracao_segredos_integracao_chave_uidx, ti_integracao_segredos_integracao_id_chave_key |

## 3. `unindexed_foreign_keys` (INFO) — 64 · risco baixo

FKs sem índice → joins/deletes na tabela pai varrem a filha. Criar índice é seguro.
Top tabelas: `hospedagem_anexos` (4), `conferencia_despesas`, `email_historico`,
`email_outbox`, `envios_postagens`, `envios_reversa`, `envios_telegramas`,
`frotas_rotas`, `hospedagem_eventos`, `hospedagem_reservas`, `logistica_fob`,
`operacional_simulacoes` (2 cada)…

Lista completa ao vivo:
```sql
-- FKs sem índice de cobertura
select conrelid::regclass as tabela, conname, pg_get_constraintdef(oid)
from pg_constraint c
where contype='f'
  and not exists (
    select 1 from pg_index i
    where i.indrelid = c.conrelid and (c.conkey <@ i.indkey)
  )
order by 1;
```

## 4. `unused_index` (INFO) — 272 · risco MÉDIO

Índices sem uso registrado (`pg_stat_user_indexes.idx_scan = 0`). **Não dropar em
massa**: alguns são de relatórios mensais/sazonais ou recém-criados. Validar caso a
caso e só então dropar. Top tabelas: `frotas_multas` (14), `frotas_veiculos` (14),
`historico_colaboradores` (8), `financeiro_pagamentos` (7),
`frotas_excesso_velocidade` (7), `relatorios_importacoes` (7)…

```sql
select schemaname, relname as tabela, indexrelname as indice, idx_scan,
       pg_size_pretty(pg_relation_size(indexrelid)) as tamanho
from pg_stat_user_indexes
where idx_scan = 0 and schemaname='public'
order by pg_relation_size(indexrelid) desc;
```

## 5. `multiple_permissive_policies` (WARN) — 74 · risco MÉDIO/ALTO

Várias policies *permissivas* para o mesmo papel/ação → o Postgres avalia **todas**
(OR) a cada linha. Consolidar em uma policy por ação melhora a performance, mas
**muda a lógica de acesso** — revisar com cuidado e testar RLS. Top tabelas:
`compras_solicitacoes`, `financeiro_pagamentos`, `frotas_veiculos`,
`historico_colaboradores`, `hospedagem_hoteis`, `hospedagem_solicitacao_colaboradores`,
`hospedagem_solicitacoes`, `operacional_auditoria_colaborador`,
`operacional_colaborador_base`, `operacional_passagens_cache` (4 cada)…

## 6. `no_primary_key` (INFO) — 1 · risco baixo

- `grm_despesas_importacoes_backup_20260624` — tabela de **backup** datada. Provavelmente
  pode ser **dropada** quando não for mais necessária (confirmar antes).

---

## Ordem sugerida de ataque

1. **Rápido e seguro** (1 migração): `auth_rls_initplan` (5) + `duplicate_index` dos
   pares "soltos" (não-constraint). Ganho imediato, risco mínimo.
2. **Seguro, incremental**: `unindexed_foreign_keys` (criar índices nas FKs mais
   usadas em joins/deletes — frotas/hospedagem/envios primeiro).
3. **Com análise**: `unused_index` — revisar `idx_scan` ao longo de algumas semanas
   antes de dropar (cuidado com relatórios sazonais).
4. **Com revisão de segurança**: `multiple_permissive_policies` — consolidar policies
   por tabela, testando o acesso de cada papel.
5. **Limpeza**: dropar a tabela de backup `grm_despesas_importacoes_backup_20260624`
   se já não for usada.

## Itens de segurança conhecidos (à parte)

- A RPC antiga `programacao_etapa_b_candidatos` ainda concede `EXECUTE` a `anon`
  (mesma classe de advisor já corrigida na RPC nova). Avaliar revogar para
  `authenticated` apenas.
