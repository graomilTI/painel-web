-- Ajustes de performance apontados pelos advisors do Supabase.

-- 1) Índice duplicado em colaborador_snapshot: idx_colab_snapshot_data e
--    idx_colab_snapshot_data_ref são idênticos (btree data_referencia DESC).
--    Mantém o _data_ref e remove o _data.
drop index if exists public.idx_colab_snapshot_data;
-- 2) RLS de programacao_usuario_supervisoes reavaliava auth.uid() por linha
--    (advisor auth_rls_initplan). Envolver em subselect faz o Postgres avaliar
--    uma vez (initplan) em vez de a cada linha.
alter policy "programacao_usuario_supervisoes_select_self"
  on public.programacao_usuario_supervisoes
  using (auth_user_id = (select auth.uid()));
