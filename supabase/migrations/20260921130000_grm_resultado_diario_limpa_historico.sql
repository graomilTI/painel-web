-- Custo do Supabase dobrou em 09/2026: grm_resultado_diario_importacoes chegou
-- a ~20 GB (~13 milhões de linhas). O agente grm-sync-resultado-diario.js
-- rodava de hora em hora e INSERIA o resultado inteiro da janela a cada
-- execução (o upsert onConflict:'id' nunca casava porque os registros não
-- têm id), sem nunca apagar os snapshots anteriores. Nada no painel lê esse
-- histórico (só heartbeat/contador em agentUpdateStatus.js e ti-agentes.js) —
-- o dado de verdade está em relatorio_resultado_diario.
--
-- O agente já foi corrigido (removeSnapshotsAnteriores) e só impede novo
-- crescimento. Esta migration limpa o que já existe: mantém somente o ÚLTIMO
-- snapshot de cada janela (data_classificacao_de/ate) e descarta o resto.
--
-- Como funciona (uma transação):
--  1. LOCK ... SHARE ROW EXCLUSIVE: bloqueia só escritas. SELECT/count do
--     painel continuam funcionando. O INSERT do agente espera o fim da
--     migration; o agente sai por timeout (300s) e a esteira roda de novo na
--     hora seguinte — rodar logo depois da execução horária do agente (minuto
--     ~10 a ~40 de cada hora) evita perder ciclo.
--  2. Copia para uma tabela temporária as linhas do último snapshot de cada
--     janela. Um snapshot é gravado em poucos ms, então "último snapshot" =
--     linhas com data_sincronizacao >= max(janela) - 5 min. (Duas execuções
--     manuais a menos de 5 min uma da outra manteriam os dois snapshots —
--     inofensivo.)
--  3. Guardas: aborta (e faz rollback) se algo parecer errado.
--  4. TRUNCATE + reinsere. TRUNCATE devolve o espaço em disco na hora, sem
--     precisar de VACUUM FULL. Não há FK, trigger nem publication nessa tabela.
--
-- Custo: duas leituras completas da tabela (sem índice em data_sincronizacao),
-- alguns minutos. statement_timeout do papel é 2 min, por isso é zerado só
-- dentro da transação. Rodar por conexão que aguente a duração (SQL editor
-- ou `supabase db push`, não por chamada HTTP curta).
--
-- Irreversível depois do COMMIT (exceto por backup). Idempotente: rodar de
-- novo só mantém de novo o último snapshot por janela.

begin;

set local statement_timeout = 0;
set local lock_timeout = '30s';

lock table public.grm_resultado_diario_importacoes in share row exclusive mode;

create temp table _rd_janelas on commit drop as
select
  data_classificacao_de  as de,
  data_classificacao_ate as ate,
  max(data_sincronizacao) as ultimo
from public.grm_resultado_diario_importacoes
group by 1, 2;

do $$
declare
  v_janelas int;
  v_nulas   int;
begin
  select count(*), count(*) filter (where de is null or ate is null or ultimo is null)
    into v_janelas, v_nulas
    from _rd_janelas;

  if v_janelas = 0 then
    raise exception 'Tabela vazia ou sem janelas: nada a limpar, abortando.';
  end if;
  -- Igualdade simples na junção abaixo não casa NULL; se existir linha sem
  -- janela/carimbo ela seria descartada, então não segue.
  if v_nulas > 0 then
    raise exception 'Existem % janela(s) com data_classificacao_de/ate ou data_sincronizacao nulos: revisar antes de limpar.', v_nulas;
  end if;
end $$;

create temp table _rd_manter on commit drop as
select t.*
from public.grm_resultado_diario_importacoes t
join _rd_janelas j
  on t.data_classificacao_de  = j.de
 and t.data_classificacao_ate = j.ate
where t.data_sincronizacao >= j.ultimo - interval '5 minutes';

do $$
declare
  v_janelas        int;
  v_janelas_manter int;
  v_manter         bigint;
begin
  select count(*) into v_janelas from _rd_janelas;
  select count(*), count(distinct (data_classificacao_de, data_classificacao_ate))
    into v_manter, v_janelas_manter
    from _rd_manter;

  if v_manter = 0 or v_janelas_manter <> v_janelas then
    raise exception 'Guarda falhou: % janelas na tabela, % com snapshot a manter (% linhas). Abortando sem apagar nada.',
      v_janelas, v_janelas_manter, v_manter;
  end if;

  raise notice 'Mantendo % linhas de % janelas.', v_manter, v_janelas;
end $$;

truncate table public.grm_resultado_diario_importacoes;

insert into public.grm_resultado_diario_importacoes
select * from _rd_manter;

analyze public.grm_resultado_diario_importacoes;

commit;
