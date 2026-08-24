-- A tabela grm_notas_fiscais_importacoes acumulou ~287 mil linhas: o agente de
-- sync so passou a preencher numero_nf corretamente a partir de ~14/08 (antes
-- disso o upsert onConflict:'numero_nf' nunca deduplicava porque a coluna ficava
-- NULL - e NULL nunca colide com NULL num indice unico). O DRE le essa tabela
-- inteira paginando 1000 em 1000 (ainda tenta cobrir as linhas antigas sem
-- numero_nf via fallback no dados_json), o que hoje vira ~287 requisicoes
-- sequenciais do navegador e trava a tela "Conferindo dados..." por minutos -
-- parecendo um loop infinito.
--
-- RPC devolve a tabela ja deduplicada por (Empresa, N.F.), pegando o registro
-- mais recente de cada uma - mesma chave de dedupe ja usada em
-- resumo_faturamento_notas_periodo (fix do Dashboard do Socio, 29/07). Assim o
-- front paginado vira 1 requisicao so.
create or replace function public.dre_notas_fiscais_deduplicadas()
returns table (
  numero_nf text,
  created_at timestamptz,
  dados_json jsonb
)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select distinct on (dados_json->>'Empresa', dados_json->>'N.F.')
    numero_nf, created_at, dados_json
  from public.grm_notas_fiscais_importacoes
  order by dados_json->>'Empresa', dados_json->>'N.F.', created_at desc;
$$;

grant execute on function public.dre_notas_fiscais_deduplicadas() to anon, authenticated, service_role;
