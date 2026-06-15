with candidatos as (
  select
    p.*,
    public.frotas_placa_chave_mercosul(
      coalesce(
        (regexp_match(
          upper(coalesce(p.identificacao, '')),
          '([A-Z]{3}[- ]?[0-9][A-Z0-9][0-9]{2})'
        ))[1],
        ''
      )
    ) as placa_chave
  from public.patrimonios_snapshot p
),
patrimonio_mais_recente as (
  select distinct on (placa_chave)
    placa_chave,
    patrimonio_codigo,
    ultima_leitura,
    dias_sem_leitura,
    funcionario,
    coordenacao,
    supervisao
  from candidatos
  where length(placa_chave) = 7
  order by
    placa_chave,
    data_upload desc nulls last,
    ultima_leitura desc nulls last
)
update public.frotas_veiculos v
   set patrimonio_codigo = p.patrimonio_codigo,
       patrimonio_ultima_leitura = p.ultima_leitura,
       patrimonio_dias_sem_leitura = p.dias_sem_leitura,
       patrimonio_funcionario = p.funcionario,
       patrimonio_coordenacao = p.coordenacao,
       patrimonio_supervisao = p.supervisao,
       motorista_atual = coalesce(nullif(trim(p.funcionario), ''), v.motorista_atual),
       coordenacao = coalesce(nullif(trim(p.coordenacao), ''), v.coordenacao),
       supervisao = coalesce(nullif(trim(p.supervisao), ''), v.supervisao)
  from patrimonio_mais_recente p
 where public.frotas_placa_chave_mercosul(v.placa) = p.placa_chave;
