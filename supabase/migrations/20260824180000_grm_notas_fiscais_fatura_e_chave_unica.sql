-- Descoberta 24/08: "N.F." (numero_nf) NAO e o identificador unico de linha do
-- relatorio GRM de Notas Fiscais - uma mesma N.F. pode agrupar varias "Faturas"
-- (cargas/carregamentos distintos, cada um com seu proprio Valor Bruto e Tons).
-- Confirmado com dados reais: NF 10847 da GRAOMIL tem 8 Faturas diferentes por
-- baixo. O indice unico em numero_nf forcava o upsert do agente a manter so 1
-- fatura por N.F., descartando as demais silenciosamente - root cause de um
-- buraco de ~R$9,36 milhoes (23,6% da receita) entre jan-ago/2026, confirmado
-- batendo exatamente com os relatorios reais do GRM ao trocar a chave de dedupe
-- de (Empresa, N.F.) para (Empresa, Fatura).
alter table public.grm_notas_fiscais_importacoes
  add column if not exists fatura text;

update public.grm_notas_fiscais_importacoes
set fatura = dados_json->>'Fatura'
where fatura is null and dados_json->>'Fatura' is not null;

-- Limpa ~100 grupos de (Empresa,Fatura) duplicados (re-sincronizacoes do mesmo
-- dado, 98% com o mesmo Valor Bruto) antes de criar o indice unico. Mantem
-- sempre a linha mais recente por created_at - mesma politica ja usada no
-- resto do codigo (dre.js, RPCs de notas fiscais).
delete from public.grm_notas_fiscais_importacoes t
using (
  select id,
    row_number() over (
      partition by (dados_json->>'Empresa'), fatura
      order by created_at desc
    ) as rn
  from public.grm_notas_fiscais_importacoes
  where fatura is not null
) dup
where t.id = dup.id and dup.rn > 1;

drop index if exists public.grm_notas_fiscais_importacoes_numero_nf_uidx;

create unique index if not exists grm_notas_fiscais_importacoes_empresa_fatura_uidx
  on public.grm_notas_fiscais_importacoes ((dados_json->>'Empresa'), fatura);

create index if not exists idx_grm_notas_fiscais_numero_nf
  on public.grm_notas_fiscais_importacoes (numero_nf);
