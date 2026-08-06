create table if not exists public.logistica_clientes_nacionais_aliases (
  alias_normalizado text primary key,
  canonical text not null,
  criado_em timestamptz not null default now()
);

comment on table public.logistica_clientes_nacionais_aliases is
  'Mapeia variacoes de nome de cliente nacional (abreviacoes vindas do prefixo de operacional_os.cliente) para o nome canonico usado em relatorio_resultado_diario.cliente_nacional. Usado pra colapsar duplicatas no dropdown Contratante/Cliente da Abertura de O.S.';

alter table public.logistica_clientes_nacionais_aliases enable row level security;

create policy "logistica_clientes_nacionais_aliases_select_auth"
  on public.logistica_clientes_nacionais_aliases for select
  to authenticated
  using (true);

insert into public.logistica_clientes_nacionais_aliases (alias_normalizado, canonical) values
  ('AGRO BRASIL', 'AGRO BRASIL IND. E COM. EXPORTACAO E IMPORTACAO, GRAOS E LOGISTICA LTDA'),
  ('ALIANCA AGRICOLA', 'ALIANCA AGRICOLA DO CERRADO S.A.'),
  ('AMAGGI EXP. E IMP', 'AMAGGI EXPORTACAO E IMPORTACAO LTDA'),
  ('AMAGGI EXP. E IMP.', 'AMAGGI EXPORTACAO E IMPORTACAO LTDA'),
  ('AMAGGI EXP. IMP.', 'AMAGGI EXPORTACAO E IMPORTACAO LTDA'),
  ('AMAGGI EXPORTACAO', 'AMAGGI EXPORTACAO E IMPORTACAO LTDA'),
  ('AMAGGI EXPORTACAO E IMP.', 'AMAGGI EXPORTACAO E IMPORTACAO LTDA'),
  ('BTG PACTUAL COMMODITIES SERTRADING S.A', 'BTG PACTUAL COMMODITIES SERTRADING  S.A.'),
  ('BTG PACTUAL COMMODITIES SERTRADING S.A.', 'BTG PACTUAL COMMODITIES SERTRADING  S.A.'),
  ('C.VALE', 'C.VALE - COOPERATIVA AGROINDUSTRIAL'),
  ('CARAMURU ALIMENTOS', 'CARAMURU ALIMENTOS S/A'),
  ('CARAMURU ALIMENTOS S.A', 'CARAMURU ALIMENTOS S/A'),
  ('CARAMURU ALIMENTOS S.A.', 'CARAMURU ALIMENTOS S/A'),
  ('CARGILL AGRICOLA S A', 'CARGILL AGRICOLA'),
  ('COCARI', 'COCARI COOPERATIVA'),
  ('COFCO INTERNATIONAL', 'COFCO INTERNATIONAL BRASIL S.A.'),
  ('COMERCIO DE CEREAIS YOKOTOBI EIRELI', 'COMERCIO DE CEREAIS YOKOTOBI LTDA'),
  ('COOP. AGRO HOLAMBRA', 'COOPERATIVA AGRO-INDUSTRIAL HOLAMBRA'),
  ('COOP. AGRO. HOLAMBRA', 'COOPERATIVA AGRO-INDUSTRIAL HOLAMBRA'),
  ('COOPERATIVA AGROPECUARIA TERRA VIVA', 'COOPERATIVA AGROPECUARIA TERRA VIVA - COOAVIL'),
  ('DISAM', 'DISAM DISTRIBUIDORA DE INSUMOS AGRICOLAS SUL AMERICA LTDA'),
  ('GNOVA', 'GNOVA GRAINS AGRO LTDA'),
  ('INTEGRADA', 'INTEGRADA COOPERATIVA AGROINDUSTRIAL'),
  ('JOSE A. FURTADO E OUTROS', 'JOSE A. FURTADO E OUTROS - FAZENDA PARACATUBA'),
  ('OURO SAFRA', 'OURO SAFRA INDUSTRIA E COMERCIO LTDA'),
  ('OURO SAFRA S/A', 'OURO SAFRA INDUSTRIA E COMERCIO LTDA'),
  ('OURO SAFRA S/A RS', 'OURO SAFRA INDUSTRIA E COMERCIO LTDA'),
  ('SEARA IND E COM', 'SEARA INDUSTRIA E COMERCIO DE PRODUTOS AGROPECUARIOS LTDA'),
  ('SEMEGRAO COM. AGRI.', 'SEMEGRAO COMERCIAL AGRICOLA LTDA'),
  ('SIPAL IND. E COMERCIO LTDA', 'SIPAL INDUSTRIA E COMERCIO LTDA'),
  ('TRES TENTOS', 'TRES TENTOS AGROINDUSTRIAL S/A'),
  ('TRES TENTOS AGROINDUSTRIAL', 'TRES TENTOS AGROINDUSTRIAL S/A'),
  ('TRESBOMM COM. EXP. DE GRAOS LTDA', 'TRESBOMM COM. EXP. DE GRAOS LTD'),
  ('VERDE AGRICOLA WM LTDA.', 'VERDE AGRICOLA WM LTDA')
on conflict (alias_normalizado) do update set canonical = excluded.canonical;
;
