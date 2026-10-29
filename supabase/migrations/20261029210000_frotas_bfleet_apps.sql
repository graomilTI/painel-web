-- Frotas · Cadastros · Motoristas: celulares que já instalaram o app da BFleet/RedGPS.
--
-- A API da RedGPS não lista os celulares (getDevices/getUsers dão 403; vehicleGetAll só traz os veículos), mas o relatório
-- programado "Equipamentos sem relatório" (OnReports, id 98247) lista todos os equipamentos, inclusive os celulares do app:
-- o "Equipo" do celular é um ID de 16 caracteres hexadecimais (Android ID) e o "Activo" é o nome que a pessoa usou no app.
-- A Edge Function sync-bfleet-app-motoristas lê esse relatório e grava aqui; a tela de Motoristas casa pelo NOME COMPLETO.
-- Nada é apagado: quem instalou o app continua marcado mesmo que o celular fique um tempo sem reportar.
-- Horários em Brasília, sem fuso (como no restante de Frotas).

create table if not exists public.frotas_bfleet_apps (
  equipo text primary key,
  ativo text not null,
  ultimo_reporte timestamp,
  ultima_conexao timestamp,
  atraso text,
  primeiro_visto_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.frotas_bfleet_apps is
  'Celulares com o app da BFleet (ID Android de 16 hex), lidos do relatório "Equipamentos sem relatório". "ativo" = nome informado no app; a tela de Motoristas casa pelo nome completo.';

alter table public.frotas_bfleet_apps enable row level security;

drop policy if exists frotas_bfleet_apps_authenticated_select on public.frotas_bfleet_apps;
create policy frotas_bfleet_apps_authenticated_select
  on public.frotas_bfleet_apps
  for select to authenticated
  using ((select public.frotas_usuario_tem_acesso()));

revoke all on public.frotas_bfleet_apps from anon, authenticated;
grant select on public.frotas_bfleet_apps to authenticated;
grant all on public.frotas_bfleet_apps to service_role;

-- Agenda: de 2 em 2 horas (UTC; Brasília = UTC-3). Quem instala o app aparece no relatório na primeira conexão.
select cron.unschedule('sync-bfleet-app-motoristas')
where exists (select 1 from cron.job where jobname = 'sync-bfleet-app-motoristas');

select cron.schedule(
  'sync-bfleet-app-motoristas',
  '15 */2 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1)
      || '/functions/v1/sync-bfleet-app-motoristas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := jsonb_build_object('scheduled', true, 'source', 'pg_cron'),
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);
