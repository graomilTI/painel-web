-- Frotas > Multas > Anexos: o PDF único (termo assinado + autos) também é enviado à pasta do
-- condutor no Drive (a mesma de excesso de velocidade, via Apps Script). Estas colunas guardam
-- o resultado do envio; o arquivo continua no bucket frotas-multas como cópia de segurança.
alter table public.frotas_multas_anexos
  add column if not exists drive_file_id text,
  add column if not exists drive_url text,
  add column if not exists drive_pasta text,
  add column if not exists drive_enviado_em timestamptz;

comment on column public.frotas_multas_anexos.drive_pasta is
  'Nome da subpasta do condutor onde o arquivo foi salvo no Drive (pasta mãe CONDUTORES FROTA).';
