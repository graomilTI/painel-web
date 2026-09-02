-- Fase 2 da organização do módulo de Compras: catálogo de materiais versionado
-- em banco (troca o array estático CATALOGO em compras.js), código de
-- identificação por compra (ex. UJUN07), e campos cidade/UF na solicitação do
-- Gestor.

create table public.compras_catalogo (
  id uuid primary key default gen_random_uuid(),
  material text not null,
  tipo text not null check (tipo in ('Uniforme','Patrimonio','EPI','Outros')),
  observacao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index idx_compras_catalogo_material_tipo on public.compras_catalogo (lower(material), tipo);
alter table public.compras_catalogo enable row level security;
create policy authenticated_all_compras_catalogo on public.compras_catalogo
  for all to authenticated using (true) with check (true);

drop trigger if exists trg_compras_catalogo_updated_at on public.compras_catalogo;
create trigger trg_compras_catalogo_updated_at before update on public.compras_catalogo
  for each row execute function set_updated_at();

-- Seed com o array estático que existia até agora em assets/js/compras.js
-- (CELULAR não tinha tipo definido no array original, mas submitItens() já
-- força tipo:'Outros' para celular no fluxo real — seed reflete isso).
insert into public.compras_catalogo (material, tipo) values
  ('ALICATE DE CORTE','Outros'),
  ('BALANÇA DE PRECISÃO','Patrimonio'),
  ('CAIXA DE BOBINAS','Outros'),
  ('CAIXA DE SULFITE A4','Outros'),
  ('CALADOR','Patrimonio'),
  ('CELULAR','Outros'),
  ('ESTILETE','Outros'),
  ('HOMOGENEIZADOR','Patrimonio'),
  ('IMPRESSORA A4','Patrimonio'),
  ('IMPRESSORA TÉRMICA BLUETOOTH','Patrimonio'),
  ('JOGO DE PENEIRAS','Patrimonio'),
  ('LIQUIDIFICADOR','Patrimonio'),
  ('LUMINÁRIA','Patrimonio'),
  ('MICROPIPETA','Patrimonio'),
  ('PENEIRA INDIVIDUAL','Patrimonio'),
  ('QUARTEADOR','Patrimonio'),
  ('CAPACETE','EPI'),
  ('COLETE REFLETIVO','EPI'),
  ('LUVA MULTITATO','EPI'),
  ('PROTETOR AURICULAR','EPI'),
  ('MASCARA PFF2','EPI'),
  ('OCULOS DE PROTEÇÃO','EPI'),
  ('BOTINA','EPI');

-- Cidade/UF na solicitação (Gestor)
alter table public.compras_solicitacoes add column cidade text;
alter table public.compras_solicitacoes add column uf char(2);

-- Código de compra + mensagem de cotação no item
alter table public.compras_itens add column codigo text;
alter table public.compras_itens add column mensagem_cotacao text;

-- Contador atômico por tipo+mês (evita corrida quando dois usuários confirmam
-- compra ao mesmo tempo)
create table public.compras_codigo_contadores (
  tipo text not null,
  ano int not null,
  mes int not null,
  contador int not null default 0,
  primary key (tipo, ano, mes)
);
alter table public.compras_codigo_contadores enable row level security;
create policy authenticated_all_compras_codigo_contadores on public.compras_codigo_contadores
  for all to authenticated using (true) with check (true);

create or replace function public.gerar_codigo_compra(p_tipo text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_letra text;
  v_mes_abrev text;
  v_ano int := extract(year from now())::int;
  v_mes int := extract(month from now())::int;
  v_contador int;
begin
  v_letra := case p_tipo
    when 'Uniforme' then 'U'
    when 'Patrimonio' then 'P'
    when 'EPI' then 'E'
    else 'O'
  end;
  v_mes_abrev := (array['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'])[v_mes];

  insert into compras_codigo_contadores (tipo, ano, mes, contador)
  values (p_tipo, v_ano, v_mes, 1)
  on conflict (tipo, ano, mes) do update set contador = compras_codigo_contadores.contador + 1
  returning contador into v_contador;

  return v_letra || v_mes_abrev || lpad(v_contador::text, 2, '0');
end;
$$;
