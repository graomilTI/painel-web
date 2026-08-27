-- Complementa a tabela logistica_clientes_nacionais_aliases (criada em
-- 20260806173913) com variações de cliente nacional encontradas numa
-- varredura completa dos nomes distintos de relatorio_resultado_diario e
-- operacional_os.cliente que ainda não tinham alias cadastrado.
insert into public.logistica_clientes_nacionais_aliases (alias_normalizado, canonical) values
  ('COOP AGRO HOLAMBRA', 'COOPERATIVA AGRO-INDUSTRIAL HOLAMBRA'),
  ('SIPAL INDUSTRIA', 'SIPAL INDUSTRIA E COMERCIO LTDA'),
  ('COFCO INTERNATIONAL BRASIL S.A', 'COFCO INTERNATIONAL BRASIL S.A.'),
  ('BTG PACTUAL COMMODITIES SERTRADING  S.A.', 'BTG PACTUAL COMMODITIES SERTRADING S.A.')
on conflict (alias_normalizado) do update set canonical = excluded.canonical;

-- Corrige o canônico do grupo BTG: o cadastro oficial do GRM
-- (public.clientes_nacionais) usa espaço simples, mas os aliases existentes
-- apontavam pra uma variante com espaço duplo.
update public.logistica_clientes_nacionais_aliases
set canonical = 'BTG PACTUAL COMMODITIES SERTRADING S.A.'
where alias_normalizado in ('BTG PACTUAL COMMODITIES SERTRADING S.A', 'BTG PACTUAL COMMODITIES SERTRADING S.A.');
