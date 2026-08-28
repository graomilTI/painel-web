-- O upsert do agente (supabase-js) so aceita onConflict com nomes de coluna
-- reais, nao expressoes - o indice unico expression-based ((dados_json->>'Empresa'), fatura)
-- criado na migration anterior nao da pra usar em upsert(..., {onConflict:'empresa,fatura'}).
-- Adiciona coluna empresa de verdade e troca o indice unico pra usar colunas reais.
alter table public.grm_notas_fiscais_importacoes
  add column if not exists empresa text;

update public.grm_notas_fiscais_importacoes
set empresa = dados_json->>'Empresa'
where empresa is null and dados_json->>'Empresa' is not null;

drop index if exists public.grm_notas_fiscais_importacoes_empresa_fatura_uidx;

create unique index if not exists grm_notas_fiscais_importacoes_empresa_fatura_uidx
  on public.grm_notas_fiscais_importacoes (empresa, fatura);
