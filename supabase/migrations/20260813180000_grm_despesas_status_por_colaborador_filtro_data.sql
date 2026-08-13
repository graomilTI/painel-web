-- A função original devolvia TODO o histórico de grm_despesas_estado_colaborador
-- (todas as datas) para cada CPF pedido, sem filtro por data. Com ~244
-- colaboradores confirmados hoje e várias linhas históricas por CPF, o total
-- de linhas facilmente passa de 1000 (limite padrão do PostgREST/Supabase),
-- e o retorno da RPC vinha TRUNCADO sem aviso — colaboradores cuja linha de
-- hoje não coubesse no corte de 1000 simplesmente sumiam do resultado.
-- O painel de Conferência então mostrava "Não processado" mesmo para quem já
-- estava APLICADO no banco (confirmado: Adriano da Silva Nunes, CPF
-- 01007331151, 2026-08-13 — status real APLICADO, ausente da resposta da RPC
-- pro lote de 244 colaboradores por causa do truncamento).
-- Adiciona filtro opcional de data (compatível com chamadas antigas sem esse
-- parâmetro) pra manter o resultado pequeno o bastante pra nunca estourar o
-- limite de linhas.
CREATE OR REPLACE FUNCTION public.grm_despesas_status_por_colaborador(
  p_colaborador_ids text[],
  p_data_min date DEFAULT NULL,
  p_data_max date DEFAULT NULL
)
 RETURNS TABLE(colaborador_id text, data_referencia date, status_aplicacao text, aplicado_em timestamp with time zone, houve_alteracao boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    estado.cpf as colaborador_id,
    estado.data_referencia,
    estado.status_aplicacao,
    estado.aplicado_em,
    case
      when fila.status in ('APLICADO', 'LIMPO')
        then (fila.diagnostico ->> 'changed')::boolean
      else null
    end as houve_alteracao
  from public.grm_despesas_estado_colaborador estado
  left join lateral (
    select f.status, f.diagnostico
    from public.grm_despesas_fila f
    where f.cpf = estado.cpf
      and f.data_referencia = estado.data_referencia
    order by f.created_at desc
    limit 1
  ) fila on true
  where estado.cpf = any(p_colaborador_ids)
    and (p_data_min is null or estado.data_referencia >= p_data_min)
    and (p_data_max is null or estado.data_referencia <= p_data_max);
$function$;
