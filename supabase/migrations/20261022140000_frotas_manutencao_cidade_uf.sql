-- Frotas · Manutenção: onde a manutenção acontece (UF + cidade, da relação do IBGE, como na abertura de OS).
-- Preenchida na "Nova manutenção"; aparece na lista da Corretiva (coluna Cidade/UF) e na busca.
alter table public.frotas_manutencoes
  add column if not exists uf text check (uf is null or uf ~ '^[A-Z]{2}$'),
  add column if not exists cidade text;

comment on column public.frotas_manutencoes.uf is 'UF da cidade onde a manutenção é feita (sigla, 2 letras).';
comment on column public.frotas_manutencoes.cidade is 'Cidade (município do IBGE) onde a manutenção é feita.';
