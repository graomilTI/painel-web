alter table public.programacao_equipe
  add column if not exists duracao_min numeric,
  add column if not exists rota_geometria jsonb,
  add column if not exists rota_calculada_em timestamptz;;
