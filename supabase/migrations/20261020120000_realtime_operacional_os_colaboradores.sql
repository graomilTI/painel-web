-- Lista de O.S. em tempo real: o painel assina operacional_os (já publicada em
-- 20260703150100) e agora também operacional_os_colaboradores, para que a
-- indicação de colaborador feita por um gestor apareça nas outras telas abertas.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'operacional_os_colaboradores'
  ) then
    alter publication supabase_realtime add table public.operacional_os_colaboradores;
  end if;
end $$;
