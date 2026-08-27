-- Padrão/obrigatoriedade do número de contrato na Abertura de O.S., por
-- cliente (planilha da usuária, 27/08/2026 -- mesma lista de clientes já
-- usada em logistica_clientes_anexo_regras, ver 20260723150000).
--
-- `tipo`:
--   'formato'        -> precisa bater com `regex_formato` (bloqueia envio se não bater)
--   'obrigatorio'     -> só precisa estar preenchido; `rotulo_campo` pode trocar o
--                        rótulo do campo pra refletir o que o cliente realmente
--                        pede (ex.: "Pedido de compra" em vez de "Número contrato")
--   'nao_obrigatorio' -> campo fica opcional pra esse cliente
--
-- Mesmo esquema de match de logistica_clientes_anexo_regras: substring
-- normalizada (sem acento/pontuação/espaço, maiúsculas) em ambas direções
-- contra `cliente` OU qualquer `aliases`.
--
-- `regex_formato` inferido de UM exemplo por cliente na planilha. Pra
-- clientes com separadores (hífen, ponto, prefixo de letra) o formato
-- completo foi mantido -- é claramente uma convenção de numeração fixa.
-- Pra clientes com só dígitos sem separador (CARGILL, AMAGGI, AGROGALAXY),
-- optei por exigir "somente dígitos" sem fixar a quantidade, já que 1
-- exemplo não é base suficiente pra garantir tamanho fixo -- ver observacao.
--
-- NUTRI ficou de fora: o cadastro do GRM tem 5 empresas diferentes
-- ("NUTRI AGROINDUSTRIA", "NUTRITEC", "NUTRIMILHO", "NUTRITIVA",
-- "FRONTEIRA (NUTRIEN)") e não dá pra saber qual a planilha quis dizer.
create table if not exists public.logistica_clientes_contrato_regras (
  id uuid primary key default gen_random_uuid(),
  cliente text not null,
  aliases text[] not null default '{}',
  tipo text not null check (tipo in ('formato','obrigatorio','nao_obrigatorio')),
  regex_formato text,
  exemplo_formato text,
  rotulo_campo text,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint logistica_clientes_contrato_regras_cliente_key unique (cliente)
);
alter table public.logistica_clientes_contrato_regras enable row level security;
drop policy if exists "logistica_clientes_contrato_regras_select" on public.logistica_clientes_contrato_regras;
create policy "logistica_clientes_contrato_regras_select"
  on public.logistica_clientes_contrato_regras
  for select
  to authenticated
  using (true);
drop policy if exists "logistica_clientes_contrato_regras_all" on public.logistica_clientes_contrato_regras;
create policy "logistica_clientes_contrato_regras_all"
  on public.logistica_clientes_contrato_regras
  for all
  to authenticated
  using (true)
  with check (true);
grant select, insert, update, delete on public.logistica_clientes_contrato_regras to authenticated;

insert into public.logistica_clientes_contrato_regras
  (cliente, aliases, tipo, regex_formato, exemplo_formato, rotulo_campo, observacao) values
  ('DREYFUS (LDC)', '{"LOUIS DREYFUS COMPANY BRASIL","LOUIS DREYFUS","LDC"}', 'formato', '^\d{2}-\d{4}-\d{4}-\d{4}$', '01-0018-2025-0015', null, 'Formato com hifens.'),
  ('CARGILL', '{}', 'formato', '^\d+$', '3402150015', null, 'Somente números (padrão observado na planilha: 10 dígitos, não travado por tamanho fixo).'),
  ('VITERRA', '{}', 'formato', '^\d{2}-\d{3}$', '79-215', null, null),
  ('BTG', '{"BTG PACTUAL"}', 'formato', '^P\d{5}\.\d{3}$', 'P31700.000', null, null),
  ('SEARA (JBS)', '{"SEARA","JBS"}', 'formato', '^\d{6}\.\d{2}\.\d{2}$', '128100.01.01', null, 'Seara e JBS Aves aparecem como razões sociais distintas na base -- ambas entram na regra.'),
  ('AMAGGI', '{}', 'formato', '^\d+$', '20014510054', null, 'Somente números (padrão observado na planilha: 11 dígitos, não travado por tamanho fixo).'),
  ('AGROGALAXY (AGRO100)', '{"AGROGALAXY","AGRO100"}', 'formato', '^\d+$', '8645', null, 'Somente números.'),
  ('ALIANÇA AGRICOLA', '{"ALIANCA AGRICOLA"}', 'nao_obrigatorio', null, null, null, null),
  ('BELAGRICOLA', '{}', 'obrigatorio', null, null, 'Liberação PDF (identificação) *', 'Exige liberação em PDF -- sem padrão de número definido; usar o campo pra registrar o identificador/código da liberação.'),
  ('VERDE AGRICOLA', '{}', 'nao_obrigatorio', null, null, null, null),
  ('FUTURO CEREAIS', '{}', 'nao_obrigatorio', null, null, null, null),
  ('RFA', '{"R F A CEREALISTA","R.F.A"}', 'nao_obrigatorio', null, null, null, null),
  ('HOLAMBRA', '{"COOP. AGRO HOLAMBRA","COOP. AGRO. HOLAMBRA"}', 'nao_obrigatorio', null, null, null, null),
  ('TERRA ROXA', '{}', 'nao_obrigatorio', null, null, null, null),
  ('OURO SAFRA', '{}', 'nao_obrigatorio', null, null, null, null),
  ('CJ INTERNACIONAL', '{"CJ INTERNATIONAL"}', 'nao_obrigatorio', null, null, null, 'Nome real na base é "CJ INTERNATIONAL" (grafia em inglês).'),
  ('CJ SELECTA', '{}', 'nao_obrigatorio', null, null, null, null),
  ('SIPAL', '{}', 'obrigatorio', null, null, 'Pedido de compra *', 'Obrigatório informar o número do pedido de compra.'),
  ('INTEGRADA', '{}', 'obrigatorio', null, null, 'Número do pedido *', 'Obrigatório informar o número do pedido.'),
  ('CVALE', '{"C.VALE","C VALE"}', 'obrigatorio', null, null, null, null),
  ('BRF', '{}', 'obrigatorio', null, null, null, null),
  ('COFCO', '{"COFCO INTERNATIONAL"}', 'obrigatorio', null, null, null, null),
  ('GNOVA', '{}', 'obrigatorio', null, null, null, null),
  ('FAZENDAO', '{}', 'nao_obrigatorio', null, null, null, null),
  ('ALPHAGRAIN', '{}', 'nao_obrigatorio', null, null, null, null)
on conflict (cliente) do nothing;
