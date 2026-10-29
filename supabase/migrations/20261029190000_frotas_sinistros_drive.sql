-- Frotas > Sinistros: cópia dos arquivos no Google Drive (pasta SINISTROS > "SIN-0001 - PLACA").
-- O painel continua guardando o arquivo no bucket privado frotas-sinistros (cópia de segurança); o envio ao Drive é feito
-- pelo Web App do Apps Script (ação upload_sinistro_arquivo, ver docs/apps-script-upload-sinistro.md) e registrado aqui.

alter table public.frotas_sinistro_anexos
  add column if not exists drive_file_id text,
  add column if not exists drive_url text,
  add column if not exists drive_enviado_em timestamptz;

alter table public.frotas_sinistros
  add column if not exists drive_pasta_id text,
  add column if not exists drive_pasta_nome text,
  add column if not exists drive_pasta_url text;

comment on column public.frotas_sinistro_anexos.drive_file_id is 'Id do arquivo no Drive; nulo = ainda não enviado (só no painel).';
comment on column public.frotas_sinistros.drive_pasta_url is 'Pasta deste sinistro no Drive (criada pelo Apps Script no primeiro envio).';
