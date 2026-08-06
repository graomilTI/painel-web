-- Regras de anexo obrigatório na ação "Saldo" (Gestor > Programação), por
-- cliente. Levantado pela usuária (planilha de clientes que exigem
-- comprovante/print pra autorizar aumento de saldo). AMAGGI passou a exigir
-- anexo em TODAS as regionais, inclusive Goiás -- a exceção da planilha
-- original ("exceto amaggi goias") foi descartada pela usuária em
-- 23/07/2026 ("agora é obrigatório goiás também").
--
-- `aliases`: nomes reais como aparecem em operacional_os.cliente, que usa o
-- padrão "<RAZÃO SOCIAL> - <FILIAL/CIDADE>" (ex.: "CARGILL AGRICOLA - SAPEZAL",
-- "C.VALE - PALOTINA"). O match é por substring normalizada (sem acento,
-- maiúsculas, sem pontuação/espaços) contra `cliente` OU qualquer alias.
--
-- `excecao_origem_igual_cliente`: caso AGROGALAXY -- quando o local de
-- embarque da O.S. contém o próprio nome do cliente (fazenda/origem
-- própria), não exige anexo mesmo com precisa_anexo=true.
create table if not exists public.logistica_clientes_anexo_regras (
  id uuid primary key default gen_random_uuid(),
  cliente text not null,
  aliases text[] not null default '{}',
  precisa_anexo boolean not null default false,
  excecao_origem_igual_cliente boolean not null default false,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint logistica_clientes_anexo_regras_cliente_key unique (cliente)
);
alter table public.logistica_clientes_anexo_regras enable row level security;
drop policy if exists "logistica_clientes_anexo_regras_select" on public.logistica_clientes_anexo_regras;
create policy "logistica_clientes_anexo_regras_select"
  on public.logistica_clientes_anexo_regras
  for select
  to authenticated
  using (true);
drop policy if exists "logistica_clientes_anexo_regras_all" on public.logistica_clientes_anexo_regras;
create policy "logistica_clientes_anexo_regras_all"
  on public.logistica_clientes_anexo_regras
  for all
  to authenticated
  using (true)
  with check (true);
grant select, insert, update, delete on public.logistica_clientes_anexo_regras to authenticated;
insert into public.logistica_clientes_anexo_regras (cliente, aliases, precisa_anexo, excecao_origem_igual_cliente, observacao) values
  ('ALIANÇA AGRICOLA', '{"ALIANCA AGRICOLA"}', false, false, null),
  ('VERDE AGRICOLA', '{}', false, false, null),
  ('FUTURO CEREAIS', '{}', false, false, null),
  ('RFA', '{"R F A CEREALISTA","R.F.A"}', false, false, null),
  ('HOLAMBRA', '{"COOP. AGRO HOLAMBRA","COOP. AGRO. HOLAMBRA"}', false, false, null),
  ('TERRA ROXA', '{}', false, false, null),
  ('OURO SAFRA', '{}', false, false, null),
  ('CJ INTERNACIONAL', '{"CJ INTERNATIONAL"}', false, false, 'Nome real na base é "CJ INTERNATIONAL" (grafia em inglês).'),
  ('CJ SELECTA', '{}', false, false, null),
  ('SIPAL', '{}', false, false, null),
  ('NUTRI', '{}', false, false, 'Sem O.S. na base até 23/07/2026 -- confirmar grafia real quando surgir a 1ª O.S.'),
  ('DREYFUS (LDC)', '{"LOUIS DREYFUS COMPANY BRASIL","LOUIS DREYFUS","LDC"}', true, false, null),
  ('CARGILL', '{}', true, false, null),
  ('VITERRA', '{}', true, false, 'Sem O.S. na base até 23/07/2026 -- confirmar grafia real quando surgir a 1ª O.S.'),
  ('BTG', '{"BTG PACTUAL"}', true, false, null),
  ('SEARA (JBS)', '{"SEARA", "JBS"}', true, false, 'Seara e JBS Aves aparecem como razões sociais distintas na base -- ambas entram na regra.'),
  ('AMAGGI', '{}', true, false, 'Obrigatório em todas as regionais, inclusive Goiás (confirmado pela usuária em 23/07/2026 -- a exceção antiga da planilha não vale mais).'),
  ('AGROGALAXY (AGRO100)', '{"AGROGALAXY", "AGRO100"}', true, true, 'Sem O.S. na base até 23/07/2026 -- confirmar grafia real quando surgir a 1ª O.S. Exceto quando a origem/embarque é a própria fazenda do cliente.'),
  ('BELAGRICOLA', '{}', true, false, null),
  ('INTEGRADA', '{}', true, false, null),
  ('CVALE', '{"C.VALE", "C VALE"}', true, false, null),
  ('BRF', '{}', true, false, null),
  ('COFCO', '{"COFCO INTERNATIONAL"}', true, false, null),
  ('GNOVA', '{}', true, false, null),
  ('FAZENDAO', '{}', true, false, null),
  ('ALPHAGRAIN', '{}', true, false, null)
on conflict (cliente) do nothing;
