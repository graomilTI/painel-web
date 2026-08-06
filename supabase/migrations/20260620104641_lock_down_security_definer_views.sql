DO $$
DECLARE
  v text;
  views text[] := ARRAY[
    'colaboradores_atuais','email_accounts_public','financeiro_fluxo_caixa_diario','financeiro_pagamentos_resumo',
    'hospedagem_painel_geral','hospedagem_dashboard_resumo','hospedagem_historico_atual_colaboradores',
    'hospedagem_minhas_solicitacoes','hospedagem_producao_resumo','v_leitura_supervisao','vw_alojamentos_ativos',
    'vw_botconversa_resumo','vw_colaboradores_atuais','vw_colaboradores_historico_ultimo','vw_contexto_usuario',
    'vw_metas_producao_regional','vw_metas_producao_estado','vw_metas_producao_mensal','vw_patrimonios_atual',
    'vw_relatorios_importacoes_ativas','vw_conferencia_uber_corridas','vw_usuario_modulos'
  ];
BEGIN
  FOREACH v IN ARRAY views LOOP
    -- remove qualquer acesso anonimo e qualquer escrita direta (sao views de leitura)
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', v);
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', v);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v);
    -- faz a view respeitar o RLS das tabelas-base em vez de rodar com privilegio do owner
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v);
  END LOOP;
END $$;
;
