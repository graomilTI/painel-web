create table public.chamados_ti (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  categoria text not null,
  descricao text not null,
  prioridade text not null default 'media' check (prioridade in ('baixa','media','alta','urgente')),
  status text not null default 'aberto' check (status in ('aberto','em_andamento','resolvido','cancelado')),
  solicitante_id uuid not null,
  solicitante_nome text not null,
  responsavel_id uuid,
  responsavel_nome text,
  modulo_relacionado text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolvido_em timestamptz
);

create table public.chamados_ti_comentarios (
  id uuid primary key default gen_random_uuid(),
  chamado_id uuid not null references public.chamados_ti(id) on delete cascade,
  autor_id uuid not null,
  autor_nome text not null,
  mensagem text not null,
  created_at timestamptz not null default now()
);

create index chamados_ti_solicitante_idx on public.chamados_ti(solicitante_id);
create index chamados_ti_status_idx on public.chamados_ti(status);
create index chamados_ti_comentarios_chamado_idx on public.chamados_ti_comentarios(chamado_id);

alter table public.chamados_ti enable row level security;
alter table public.chamados_ti_comentarios enable row level security;

create or replace function public.is_chamados_ti_gestor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from app_usuarios u
    join app_perfis p on p.id = u.perfil_id
    where u.auth_user_id = auth.uid()
      and upper(p.codigo) in ('MASTER', 'ADMIN', 'ADM')
  )
  or exists (
    select 1
    from app_usuario_modulos um
    join app_usuarios u on u.id = um.usuario_id
    join app_modulos m on m.id = um.modulo_id
    where u.auth_user_id = auth.uid()
      and upper(m.codigo) = 'CHAMADOS_TI_GESTAO'
  );
$$;

create policy chamados_ti_select on public.chamados_ti
  for select
  using (solicitante_id = auth.uid() or responsavel_id = auth.uid() or public.is_chamados_ti_gestor());

create policy chamados_ti_insert on public.chamados_ti
  for insert
  with check (solicitante_id = auth.uid());

create policy chamados_ti_update on public.chamados_ti
  for update
  using (solicitante_id = auth.uid() or public.is_chamados_ti_gestor());

create policy chamados_ti_comentarios_select on public.chamados_ti_comentarios
  for select
  using (
    exists (
      select 1 from public.chamados_ti c
      where c.id = chamado_id
        and (c.solicitante_id = auth.uid() or c.responsavel_id = auth.uid() or public.is_chamados_ti_gestor())
    )
  );

create policy chamados_ti_comentarios_insert on public.chamados_ti_comentarios
  for insert
  with check (
    autor_id = auth.uid()
    and exists (
      select 1 from public.chamados_ti c
      where c.id = chamado_id
        and (c.solicitante_id = auth.uid() or c.responsavel_id = auth.uid() or public.is_chamados_ti_gestor())
    )
  );
;
