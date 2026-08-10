update public.grm_despesas_tipos_config
set tipo_grm = 'Táxi/Uber',
    valor_padrao = 0.00,
    exibir = true,
    auto = false,
    carga_nhe = true,
    max_mov_dia = 1,
    ativo = true,
    observacao = 'Configuração validada visualmente no GRM em 10/08/2026.'
where chave = 'DESLOCAMENTO_UBER_TAXI';
