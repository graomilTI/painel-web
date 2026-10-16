-- Frotas > Cadastros > Motoristas: situação do Termo de Utilização de Veículos (anexado ou não).
-- O termo assinado vai para a subpasta do condutor no Drive (pasta mãe "CONDUTORES FROTA", a mesma do
-- excesso de velocidade) e o painel guarda só a referência. Aditiva: nada existente muda.
alter table public.frotas_motoristas
  add column if not exists termo_anexado_em timestamptz,
  add column if not exists termo_arquivo_nome text,
  add column if not exists termo_drive_file_id text,
  add column if not exists termo_drive_url text,
  add column if not exists termo_drive_pasta text,
  add column if not exists termo_anexado_por text,
  -- 'painel' = anexado pela tela de Motoristas; 'pasta_termos' = já estava na pasta "1 - TERMOS" do Drive
  add column if not exists termo_origem text;

comment on column public.frotas_motoristas.termo_anexado_em is 'Quando o termo assinado foi anexado (null = sem termo).';
comment on column public.frotas_motoristas.termo_origem is 'painel | pasta_termos (termos antigos da pasta "1 - TERMOS" do Drive).';
