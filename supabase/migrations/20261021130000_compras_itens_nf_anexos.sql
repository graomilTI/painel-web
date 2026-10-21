-- Compras: mais de um arquivo na NF. O primeiro arquivo continua em nf_url (é o que a fila do GRM, a aba de
-- Notas Fiscais e o agrupamento por NF usam); os demais ficam aqui, como lista de { url, nome }.
-- Não dispara o gatilho de lançamento no GRM (ele só olha status, nf_url e comprovante_url).

alter table public.compras_itens
  add column if not exists nf_anexos jsonb not null default '[]'::jsonb;

alter table public.compras_itens drop constraint if exists compras_itens_nf_anexos_array_check;
alter table public.compras_itens
  add constraint compras_itens_nf_anexos_array_check check (jsonb_typeof(nf_anexos) = 'array');
