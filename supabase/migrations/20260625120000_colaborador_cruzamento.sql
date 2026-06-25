-- Cruzamento colaborador <-> veículo/endereço/auditoria, recalculado no
-- banco (pg_cron) em vez de refeito no navegador a cada carregamento da
-- Programação (causava travamento: .find() colaborador x veículo no JS).

create extension if not exists unaccent;

create table if not exists public.colaborador_cruzamento (
  colaborador_id uuid primary key references public.colaboradores(id) on delete cascade,
  cpf text,
  nome text,
  nome_chave text,
  supervisao text,
  coordenacao text,
  tipo_contrato text,
  latitude numeric,
  longitude numeric,
  endereco_base text,
  veiculo_id uuid references public.frotas_veiculos(id) on delete set null,
  veiculo_placa text,
  auditorias_180d_qtd integer not null default 0,
  auditorias_180d_peso numeric not null default 0,
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_colaborador_cruzamento_cpf on public.colaborador_cruzamento (cpf);
create index if not exists idx_colaborador_cruzamento_nome_chave on public.colaborador_cruzamento (nome_chave);
create index if not exists idx_colaborador_cruzamento_supervisao on public.colaborador_cruzamento (supervisao);
create index if not exists idx_colaborador_cruzamento_veiculo on public.colaborador_cruzamento (veiculo_id);

alter table public.colaborador_cruzamento enable row level security;
drop policy if exists colaborador_cruzamento_select_auth on public.colaborador_cruzamento;
create policy colaborador_cruzamento_select_auth on public.colaborador_cruzamento
  for select to authenticated using (true);

create or replace function public.refresh_colaborador_cruzamento()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  truncate table public.colaborador_cruzamento;

  with veic_norm as (
    select
      v.id,
      v.placa,
      v.updated_at,
      trim(regexp_replace(upper(unaccent(coalesce(
        nullif(trim(v.motorista_atual), ''),
        nullif(trim(v.patrimonio_funcionario), ''),
        nullif(trim(v.bfleet_condutor), ''),
        nullif(trim(v.condutor_patrimonio), '')
      ))), '[^A-Z0-9]+', ' ', 'g')) as nome_chave
    from public.frotas_veiculos v
    where v.status = 'ATIVO'
  ),
  veic_best as (
    select distinct on (nome_chave) nome_chave, id, placa
    from veic_norm
    where nome_chave <> ''
    order by nome_chave, updated_at desc
  ),
  base_norm as (
    select
      regexp_replace(coalesce(b.cpf, ''), '\D', '', 'g') as cpf_norm,
      b.latitude,
      b.longitude,
      b.endereco_base
    from public.operacional_colaborador_base b
    where b.ativo is true
      and regexp_replace(coalesce(b.cpf, ''), '\D', '', 'g') <> ''
  ),
  base_best as (
    select distinct on (cpf_norm) cpf_norm, latitude, longitude, endereco_base
    from base_norm
    order by cpf_norm
  ),
  aud_agg as (
    select
      a.nome_chave,
      count(*)::int as qtd,
      sum(1 + abs(coalesce(a.score_impacto, 0)))::numeric as peso
    from public.operacional_auditoria_colaborador a
    where a.data_evento >= (current_date - 180)
    group by a.nome_chave
  )
  insert into public.colaborador_cruzamento (
    colaborador_id, cpf, nome, nome_chave, supervisao, coordenacao, tipo_contrato,
    latitude, longitude, endereco_base, veiculo_id, veiculo_placa,
    auditorias_180d_qtd, auditorias_180d_peso, atualizado_em
  )
  select
    c.id,
    regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g'),
    c.nome,
    trim(regexp_replace(upper(unaccent(coalesce(c.nome, ''))), '[^A-Z0-9]+', ' ', 'g')) as nome_chave,
    c.supervisao,
    c.coordenacao,
    c.tipo,
    bb.latitude,
    bb.longitude,
    bb.endereco_base,
    vb.id,
    vb.placa,
    coalesce(aa.qtd, 0),
    coalesce(aa.peso, 0),
    now()
  from public.colaboradores c
  left join base_best bb on bb.cpf_norm = regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g') and bb.cpf_norm <> ''
  left join veic_best vb on vb.nome_chave = trim(regexp_replace(upper(unaccent(coalesce(c.nome, ''))), '[^A-Z0-9]+', ' ', 'g')) and vb.nome_chave <> ''
  left join aud_agg aa on aa.nome_chave = trim(regexp_replace(upper(unaccent(coalesce(c.nome, ''))), '[^A-Z0-9]+', ' ', 'g'))
  where upper(coalesce(c.situacao, '')) not in ('NAO ATIVO', 'NAO ATIVA', 'INATIVO', 'INATIVA', 'DESLIGADO', 'DESLIGADA', 'DEMITIDO', 'DEMITIDA')
    and coalesce(c.desligamento, '') = '';
end;
$$;

select cron.unschedule('refresh-colaborador-cruzamento') where exists (select 1 from cron.job where jobname = 'refresh-colaborador-cruzamento');

select cron.schedule(
  'refresh-colaborador-cruzamento', '*/30 * * * *',
  $$select public.refresh_colaborador_cruzamento()$$
);
