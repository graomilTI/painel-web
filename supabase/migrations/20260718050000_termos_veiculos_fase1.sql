-- Aba Veículos da tela Termos sai do "em desenvolvimento": colunas que faltavam
-- pra seguir o mesmo fluxo da aba Celular (gerar termo -> anexar assinado).
alter table public.termos_veiculos
  add column if not exists colaborador_id uuid,
  add column if not exists termo_url text,
  add column if not exists assinado_em timestamptz;
