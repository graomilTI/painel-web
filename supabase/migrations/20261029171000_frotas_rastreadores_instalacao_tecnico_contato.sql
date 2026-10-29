-- Telefone do técnico que fará a instalação do rastreador (junto de tecnico_instalacao).
alter table public.frotas_rastreadores
  add column if not exists tecnico_contato_instalacao text;
