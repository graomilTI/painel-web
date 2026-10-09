-- Frotas > Ocorrências > Multas: Notificar (WhatsApp), Gerar termo, Agrupar e Anexos.
--
-- Notificar reaproveita as colunas que já existiam em frotas_multas
-- (status_notificacao, mensagem_gerada, notificado_em/por/por_nome,
-- condutor_notificado_em); nada novo é necessário para ele.
--
-- Agrupar: multas do mesmo condutor compartilham o mesmo grupo_id (NULL = multa
-- avulsa). O termo de desconto em folha e o dossiê de anexos valem para o grupo.
--
-- Anexos: o auto de infração é anexado por multa; o termo assinado vale para o
-- dossiê (grupo_id, ou o id da própria multa quando avulsa). Com os dois
-- presentes o painel junta tudo num único PDF ("consolidado") e guarda no bucket
-- privado frotas-multas, na pasta do motorista.

alter table public.frotas_multas
  add column if not exists grupo_id uuid,
  add column if not exists termo_gerado_em timestamptz,
  add column if not exists termo_gerado_por_nome text;

comment on column public.frotas_multas.grupo_id is
  'Agrupa multas do mesmo condutor para um único termo de desconto em folha. NULL = avulsa.';
comment on column public.frotas_multas.termo_gerado_em is
  'Última vez que o termo de autorização de desconto em folha foi gerado no painel.';

create index if not exists idx_frotas_multas_grupo_id
  on public.frotas_multas (grupo_id) where grupo_id is not null;

create table if not exists public.frotas_multas_anexos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('auto_infracao', 'termo_assinado', 'consolidado')),
  -- auto_infracao: pertence a uma multa. termo_assinado/consolidado: pertencem ao dossiê.
  multa_id uuid references public.frotas_multas (id) on delete cascade,
  dossie_id uuid,
  storage_bucket text not null default 'frotas-multas',
  storage_path text not null,
  nome_arquivo text,
  mime_type text,
  tamanho_bytes bigint,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  criado_por_nome text,
  constraint frotas_multas_anexos_dono_ck check (
    (tipo = 'auto_infracao' and multa_id is not null)
    or (tipo <> 'auto_infracao' and dossie_id is not null)
  )
);

comment on table public.frotas_multas_anexos is
  'Anexos do fluxo de multas: auto de infração (por multa), termo assinado e PDF consolidado (por dossiê).';

create unique index if not exists uq_frotas_multas_anexos_auto
  on public.frotas_multas_anexos (multa_id) where tipo = 'auto_infracao';
create unique index if not exists uq_frotas_multas_anexos_dossie
  on public.frotas_multas_anexos (dossie_id, tipo) where tipo in ('termo_assinado', 'consolidado');
create index if not exists idx_frotas_multas_anexos_dossie
  on public.frotas_multas_anexos (dossie_id) where dossie_id is not null;

alter table public.frotas_multas_anexos enable row level security;

drop policy if exists frotas_multas_anexos_sel on public.frotas_multas_anexos;
create policy frotas_multas_anexos_sel on public.frotas_multas_anexos
  for select to authenticated using (true);
drop policy if exists frotas_multas_anexos_ins on public.frotas_multas_anexos;
create policy frotas_multas_anexos_ins on public.frotas_multas_anexos
  for insert to authenticated with check (true);
drop policy if exists frotas_multas_anexos_upd on public.frotas_multas_anexos;
create policy frotas_multas_anexos_upd on public.frotas_multas_anexos
  for update to authenticated using (true) with check (true);
drop policy if exists frotas_multas_anexos_del on public.frotas_multas_anexos;
create policy frotas_multas_anexos_del on public.frotas_multas_anexos
  for delete to authenticated using (true);

-- Bucket privado (documentos de pessoa física): o front abre via createSignedUrl.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'frotas-multas', 'frotas-multas', false, 26214400,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;

drop policy if exists "frotas_multas_insert_authenticated" on storage.objects;
create policy "frotas_multas_insert_authenticated"
on storage.objects for insert
to authenticated
with check (bucket_id = 'frotas-multas');

drop policy if exists "frotas_multas_select_authenticated" on storage.objects;
create policy "frotas_multas_select_authenticated"
on storage.objects for select
to authenticated
using (bucket_id = 'frotas-multas');

drop policy if exists "frotas_multas_update_authenticated" on storage.objects;
create policy "frotas_multas_update_authenticated"
on storage.objects for update
to authenticated
using (bucket_id = 'frotas-multas')
with check (bucket_id = 'frotas-multas');

drop policy if exists "frotas_multas_delete_authenticated" on storage.objects;
create policy "frotas_multas_delete_authenticated"
on storage.objects for delete
to authenticated
using (bucket_id = 'frotas-multas');
