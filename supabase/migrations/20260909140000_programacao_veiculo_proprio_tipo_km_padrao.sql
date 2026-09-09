alter table public.programacao_veiculo_proprio
  add column if not exists tipo_deslocamento text,
  add column if not exists km numeric(10,2);

comment on column public.programacao_veiculo_proprio.tipo_deslocamento is 'Tipo de deslocamento acordado/padrão do colaborador (fallback quando não vem sincronizado da Programação/GRM).';
comment on column public.programacao_veiculo_proprio.km is 'Km acordado do colaborador (não vem da Programação, é um acordo registrado no painel).';
