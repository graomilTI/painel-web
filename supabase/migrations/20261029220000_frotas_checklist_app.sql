-- Frotas · Manutenção · Checklist: respostas do app da BFleet/RedGPS (formulário "Checklist" / Inspeção pré-operacional).
--
-- Os motoristas preenchem o checklist no app (OnForms, formulário 7294): placa, odômetro, limpeza, motor, óleo, para-brisas,
-- freios, pneus, ferramentas, fotos externas, condição geral e assinatura. A API onforms/getAnswersForms devolve as respostas
-- com as fotos como links e as perguntas só como código (ex.: multimedia-1772732829805); frotas_checklist_perguntas guarda o
-- rótulo de cada código (versão 5 do formulário, conferida contra o Excel que a plataforma gera).
-- A Edge Function sync-bfleet-checklists grava as respostas aqui; a tela do Checklist as mostra com as fotos.
-- Horários em Brasília, sem fuso (como no restante de Frotas). As fotos ficam na BFleet: aqui só os links.

create table if not exists public.frotas_checklist_perguntas (
  form_id text not null,
  componente text not null,
  rotulo text not null,
  tipo text not null check (tipo in ('texto', 'foto', 'assinatura')),
  ordem integer not null,
  ativo boolean not null default true,
  primary key (form_id, componente)
);

comment on table public.frotas_checklist_perguntas is
  'Rótulo de cada pergunta do formulário de checklist da BFleet (a API só devolve o código do componente). Se o formulário mudar, ajuste aqui; componente desconhecido aparece na tela com o código.';

alter table public.frotas_checklist_perguntas enable row level security;
drop policy if exists frotas_checklist_perguntas_authenticated_select on public.frotas_checklist_perguntas;
create policy frotas_checklist_perguntas_authenticated_select
  on public.frotas_checklist_perguntas
  for select to authenticated
  using ((select public.frotas_usuario_tem_acesso()));
revoke all on public.frotas_checklist_perguntas from anon, authenticated;
grant select on public.frotas_checklist_perguntas to authenticated;
grant all on public.frotas_checklist_perguntas to service_role;

insert into public.frotas_checklist_perguntas (form_id, componente, rotulo, tipo, ordem) values
  ('7294', 'textarea-1772732797515', 'Placa', 'texto', 1),
  ('7294', 'multimedia-1772732829805', 'Medição do odômetro', 'foto', 2),
  ('7294', 'multimedia-1772732897731', 'Limpeza do interior', 'foto', 3),
  ('7294', 'multimedia-1772732932732', 'Interior do porta-malas', 'foto', 4),
  ('7294', 'multimedia-1772732983676', 'Motor', 'foto', 5),
  ('7294', 'multimedia-1772733000692', 'Troca do óleo', 'foto', 6),
  ('7294', 'multimedia-1772733047460', 'Para-brisas e limpadores', 'foto', 7),
  ('7294', 'textarea-1772733120695', 'Freios', 'texto', 8),
  ('7294', 'multimedia-1772733232341', 'Pneu dianteiro lado motorista', 'foto', 9),
  ('7294', 'multimedia-1772733282556', 'Pneu dianteiro lado passageiro', 'foto', 10),
  ('7294', 'multimedia-1772733325989', 'Pneu traseiro lado motorista', 'foto', 11),
  ('7294', 'multimedia-1772733393621', 'Pneu traseiro lado passageiro', 'foto', 12),
  ('7294', 'multimedia-1772733668762', 'Chave de roda', 'foto', 13),
  ('7294', 'multimedia-1772733695724', 'Macaco', 'foto', 14),
  ('7294', 'multimedia-1772733715596', 'Foto externa lateral direita', 'foto', 15),
  ('7294', 'multimedia-1772733752782', 'Foto externa lateral esquerda', 'foto', 16),
  ('7294', 'multimedia-1772733805413', 'Foto frontal do veículo', 'foto', 17),
  ('7294', 'multimedia-1772733844997', 'Foto traseira do veículo', 'foto', 18),
  ('7294', 'textarea-1772733931206', 'Condição geral do veículo', 'texto', 19),
  ('7294', 'jSignature-1772734030420', 'Assinatura', 'assinatura', 20)
on conflict (form_id, componente) do nothing;

create table if not exists public.frotas_checklist_respostas (
  id uuid primary key default gen_random_uuid(),
  resposta_id text not null unique,
  form_id text,
  folio text,
  placa text,
  placa_digitada text,
  veiculo_id uuid references public.frotas_veiculos(id) on delete set null,
  motorista text,
  data_execucao date not null,
  hora_execucao time,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  itens jsonb not null default '[]'::jsonb,
  total_fotos integer not null default 0,
  tem_assinatura boolean not null default false,
  recebido_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.frotas_checklist_respostas is
  'Respostas do checklist preenchido no app da BFleet (OnForms). itens = [{componente, rotulo, tipo, ordem, valor | urls[]}] já na ordem do formulário. Fotos: só os links.';

create index if not exists frotas_checklist_respostas_data_idx on public.frotas_checklist_respostas (data_execucao desc, hora_execucao desc);
create index if not exists frotas_checklist_respostas_placa_idx on public.frotas_checklist_respostas (placa, data_execucao desc);
create index if not exists frotas_checklist_respostas_veiculo_idx on public.frotas_checklist_respostas (veiculo_id);

alter table public.frotas_checklist_respostas enable row level security;
drop policy if exists frotas_checklist_respostas_authenticated_select on public.frotas_checklist_respostas;
create policy frotas_checklist_respostas_authenticated_select
  on public.frotas_checklist_respostas
  for select to authenticated
  using ((select public.frotas_usuario_tem_acesso()));
revoke all on public.frotas_checklist_respostas from anon, authenticated;
grant select on public.frotas_checklist_respostas to authenticated;
grant all on public.frotas_checklist_respostas to service_role;

-- Agenda: de 30 em 30 minutos (a janela do sync cobre os últimos dias; reenviar a mesma resposta só atualiza).
select cron.unschedule('sync-bfleet-checklists')
where exists (select 1 from cron.job where jobname = 'sync-bfleet-checklists');

select cron.schedule(
  'sync-bfleet-checklists',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1)
      || '/functions/v1/sync-bfleet-checklists',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := jsonb_build_object('scheduled', true, 'source', 'pg_cron'),
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);
