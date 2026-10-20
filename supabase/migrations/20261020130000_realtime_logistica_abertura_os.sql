-- A aba Abertura da Logística > O.S. assina logistica_abertura_os desde
-- logistica-abertura-os-workflow.js, mas a tabela nunca entrou na publicação
-- supabase_realtime — o canal ficava mudo e a lista só mudava ao recarregar.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'logistica_abertura_os'
  ) then
    alter publication supabase_realtime add table public.logistica_abertura_os;
  end if;
end $$;
