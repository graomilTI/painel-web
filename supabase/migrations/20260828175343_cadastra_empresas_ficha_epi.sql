create table if not exists public.rh_empresas (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null,
  cnpj text not null,
  endereco text not null,
  aliases text[] not null default '{}',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rh_empresas_cnpj_key unique (cnpj),
  constraint rh_empresas_razao_social_key unique (razao_social)
);

comment on table public.rh_empresas is
  'Dados das empresas empregadoras usados em documentos do RH, inclusive fichas de EPI.';

alter table public.rh_empresas enable row level security;

drop policy if exists rh_empresas_select_authenticated on public.rh_empresas;
create policy rh_empresas_select_authenticated
  on public.rh_empresas for select to authenticated
  using (ativo = true);

grant select on table public.rh_empresas to authenticated;

insert into public.rh_empresas (razao_social, cnpj, endereco, aliases)
values
  ('GRAOMIL LTDA', '29.666.679/0001-34', 'AV BRASIL, nº 2732, APT 01, SAO CRISTOVAO, Cascavel - PR, CEP 85816-294', array['GRAOMIL', 'GRÃO1000', 'GRAO1000', 'GRÃO 1000', 'GRAO 1000']),
  ('ARAGUAIA MONITORAMENTO AGRICOLA LTDA', '34.562.510/0001-74', 'R ANTONIA FELIZARDA DE OLIVEIRA, nº 55, JARDIM PLANALTO, Confresa - MT, CEP 78562-000', array['ARAGUAIA', 'ARAGUAIA MONITORAMENTO AGRICOLA']),
  ('BOA VENTURA ANALISE E CLASSIFICACAO VEGETAL LTDA', '32.202.416/0001-89', 'R VITORIO BALANI, nº 1086, ZONA 05, Maringá - PR, CEP 87015-310', array['BV GRAIN', 'BOA VENTURA', 'BOA VENTURA ANALISE E CLASSIFICACAO VEGETAL']),
  ('EXCELENCIA CLASSIFICACOES LTDA', '36.514.493/0001-25', 'RUA IRON NASCIMENTO, S/N, QUADRA 31, LOTE 11, RESIDENCIAL CANAA, Rio Verde - GO, CEP 75909-660', array['EXCELENCIA', 'EXCELENCIA CLASSIFICACOES']),
  ('ELIZEU MOTA LTDA', '04.429.697/0001-71', 'TV OSVALDO SILVESTRE MATIAS, nº 36, SAO CRISTOVAO, Cascavel - PR, CEP 85816-200', array['ELIZEU MOTA'])
on conflict (cnpj) do update
set razao_social = excluded.razao_social,
    endereco = excluded.endereco,
    aliases = excluded.aliases,
    ativo = true,
    updated_at = now();

alter table public.compras_itens
  add column if not exists colaborador_empresa text;

comment on column public.compras_itens.colaborador_empresa is
  'Empresa do colaborador no momento da emissão da ficha de EPI.';
