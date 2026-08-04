-- Nomes exatos das opções do dropdown do Caixa Operacional no GRM.
-- As duas categorias podem ser abertas com valor inicial zero; o valor será
-- atualizado quando o cálculo ou lançamento financeiro estiver disponível.
update public.grm_despesas_tipos_config
set tipo_grm = case chave
      when 'DESLOCAMENTO_REEMBOLSO_KM' then 'Deslocamento KM'
      when 'EXTRA_LAVANDERIA' then 'Lavanderia'
    end,
    ativo = true,
    observacao = case chave
      when 'DESLOCAMENTO_REEMBOLSO_KM'
        then 'REEMBOLSO KM abre Deslocamento KM, inclusive com valor inicial zero.'
      when 'EXTRA_LAVANDERIA'
        then 'LAVANDERIA abre Lavanderia, inclusive com valor inicial zero.'
    end,
    updated_at = now()
where chave in ('DESLOCAMENTO_REEMBOLSO_KM', 'EXTRA_LAVANDERIA');
