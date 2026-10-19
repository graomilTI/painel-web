-- Frotas · Manutenção: os 29 sistemas do guia passam a se agrupar em 7 grupos de "Componentes e Peças" (mais "Outros")
-- para quem abre a manutenção. O item continua gravando uma categoria (sistema): a representativa do grupo escolhido,
-- ou a própria categoria quando o item vem do plano da Preventiva. Custos, NF no GRM e vencimentos não mudam.
--   * frotas_manutencao_grupos: Suspensão, Freios, Motor, Arrefecimento, Injeção, Óleo e filtros, Pneus, Outros;
--   * frotas_manutencao_categorias.grupo_codigo: a que grupo cada um dos 29 sistemas pertence;
--   * frotas_manutencao_componentes.grupo_codigo: a que grupo cada componente pertence (lista do guia).

-- ============================================================
-- 1. Grupos
-- ============================================================
create table if not exists public.frotas_manutencao_grupos (
  codigo smallint primary key,
  nome text not null,
  ordem smallint not null default 0,
  -- Categoria (sistema) gravada no item quando a pessoa escolhe este grupo.
  categoria_codigo smallint not null references public.frotas_manutencao_categorias(codigo),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.frotas_manutencao_grupos is
  'Grupos de componentes e peças do guia (Suspensão, Freios, Motor...). categoria_codigo é o sistema gravado no item ao escolher o grupo.';

drop trigger if exists trg_frotas_manut_grupos_updated on public.frotas_manutencao_grupos;
create trigger trg_frotas_manut_grupos_updated
  before update on public.frotas_manutencao_grupos
  for each row execute function public.set_updated_at();

alter table public.frotas_manutencao_grupos enable row level security;

drop policy if exists frotas_manut_grupos_select on public.frotas_manutencao_grupos;
create policy frotas_manut_grupos_select on public.frotas_manutencao_grupos
  for select to authenticated using (true);

drop policy if exists frotas_manut_grupos_write on public.frotas_manutencao_grupos;
create policy frotas_manut_grupos_write on public.frotas_manutencao_grupos
  for all to authenticated
  using (public.painel_has_module(array['frotas_manutencao'], true))
  with check (public.painel_has_module(array['frotas_manutencao'], true));

insert into public.frotas_manutencao_grupos (codigo, nome, ordem, categoria_codigo) values
  (1, 'Suspensão', 1, 11),
  (2, 'Freios', 2, 9),
  (3, 'Motor', 3, 1),
  (4, 'Arrefecimento', 4, 3),
  (5, 'Injeção', 5, 4),
  (6, 'Óleo e filtros', 6, 2),
  (7, 'Pneus, alinhamento e balanceamento', 7, 13),
  (8, 'Outros', 8, 28)
on conflict (codigo) do update set nome = excluded.nome, ordem = excluded.ordem, categoria_codigo = excluded.categoria_codigo;

-- ============================================================
-- 2. Cada sistema do guia pertence a um grupo (o que o guia não detalha cai em "Outros")
-- ============================================================
alter table public.frotas_manutencao_categorias
  add column if not exists grupo_codigo smallint references public.frotas_manutencao_grupos(codigo);

update public.frotas_manutencao_categorias set grupo_codigo = case codigo
  when 11 then 1
  when 9 then 2
  when 1 then 3 when 5 then 3 when 22 then 3
  when 3 then 4
  when 4 then 5
  when 2 then 6 when 23 then 6
  when 13 then 7
  else 8 end;

comment on column public.frotas_manutencao_categorias.grupo_codigo is
  'Grupo de componentes e peças em que o sistema aparece para quem abre a manutenção.';

-- ============================================================
-- 3. Componentes por grupo
-- ============================================================
alter table public.frotas_manutencao_componentes
  add column if not exists grupo_codigo smallint references public.frotas_manutencao_grupos(codigo);

-- No guia, "Bomba d'água e válvula termostática" é item do Motor; a válvula também segue em Arrefecimento (serviço da Preventiva).
update public.frotas_manutencao_componentes
   set nome = 'Bomba d''água e válvula termostática'
 where categoria_codigo = 3 and nome = 'Bomba d''água';

update public.frotas_manutencao_componentes c
   set grupo_codigo = case
     when c.nome = 'Bomba d''água e válvula termostática' then 3
     else cat.grupo_codigo end
  from public.frotas_manutencao_categorias cat
 where cat.codigo = c.categoria_codigo;

alter table public.frotas_manutencao_componentes alter column grupo_codigo set not null;

create index if not exists idx_frotas_manut_comp_grupo on public.frotas_manutencao_componentes (grupo_codigo, ordem);

-- Ordem dentro de cada grupo, como no guia (os grupos Motor, Arrefecimento e Óleo e filtros juntam mais de um sistema).
update public.frotas_manutencao_componentes set ordem = case nome
  when 'Correia dentada (ou corrente de comando) e tensor' then 1
  when 'Correias auxiliares (alternador/direção)' then 2
  when 'Velas de ignição e cabos de vela (ou bobinas)' then 3
  when 'Juntas do motor (cabeçote, tampa de válvulas, cárter)' then 4
  when 'Retentores e anéis de vedação' then 5
  when 'Bomba d''água e válvula termostática' then 6
  when 'Radiador e tampa do radiador' then 1
  when 'Aditivo para radiador (etilenoglicol / fluido orgânico)' then 2
  when 'Água desmineralizada' then 3
  when 'Mangueiras superior e inferior do radiador' then 4
  when 'Válvula termostática' then 5
  when 'Eletroventilador (ventoinha) e sensor de temperatura' then 6
  when 'Óleo lubrificante do motor (5W30, 10W40, sintético/mineral)' then 1
  when 'Filtro de óleo do motor' then 2
  when 'Filtro de ar do motor' then 3
  when 'Filtro de combustível' then 4
  when 'Filtro de cabine / ar-condicionado (antipólen)' then 5
  else ordem end
 where grupo_codigo in (3, 4, 6);
