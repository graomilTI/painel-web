-- Frotas · Manutenção › Preventiva: leitura rápida da lista de veículos.
-- A view frotas_manutencao_vencimentos_v tem ~24 linhas por veículo (5.000+ linhas para 200+ veículos) e a API entrega no máximo
-- 1.000 por consulta: eram 6 idas e voltas com ~2,5 MB repetindo placa, modelo e nomes em cada linha. Esta função devolve tudo
-- em UM jsonb compacto (um item por veículo, com os serviços dentro e só o que muda por serviço, sem os campos nulos); os nomes dos serviços e dos
-- sistemas o cliente já tem (planos e categorias do guia). Roda com as permissões de quem chama (security invoker + view invoker).
create or replace function public.frotas_preventiva_painel()
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'v', x.veiculo_id, 'placa', x.placa, 'mm', x.marca_modelo, 'co', x.coordenacao, 'su', x.supervisao, 'km', x.hodometro, 's', x.servicos)
         order by x.placa), '[]'::jsonb)
    from (
      select v.veiculo_id, v.placa, v.marca_modelo, v.coordenacao, v.supervisao, max(v.hodometro) as hodometro,
             jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'p', v.plano_id, 'st', v.status, 'du', v.data_ultima, 'ku', v.km_ultima, 'vk', v.vencimento_km, 'vd', v.vencimento_data,
               'kr', v.km_restante, 'dr', v.dias_restantes, 'ea', v.em_andamento)) order by v.plano_codigo) as servicos
        from public.frotas_manutencao_vencimentos_v v
       group by v.veiculo_id, v.placa, v.marca_modelo, v.coordenacao, v.supervisao
    ) x;
$$;

revoke all on function public.frotas_preventiva_painel() from public;
grant execute on function public.frotas_preventiva_painel() to authenticated;
