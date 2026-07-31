DO $$
DECLARE
  tbl text;
  full_crud_tables text[] := ARRAY[
    -- grupo 1: RLS desabilitado
    'attachments','audit_logs','bot_jobs','bot_queue','botconversa_config','botconversa_contatos',
    'botconversa_fila','botconversa_fluxos','botconversa_jobs','botconversa_logs','botconversa_tags',
    'botconversa_webhook_logs','envios_reversa','envios_telegramas','exportacoes_arquivos','exportacoes_jobs',
    'frotas_rastreadores','grm_despesas_importacoes','grm_locais_embarque_importacoes','grm_notas_fiscais_importacoes',
    'grm_producao_diaria_importacoes','grm_resultado_diario_importacoes','logistica_btg_lista_os','notifications',
    'programacao_despesas','programacao_despesas_hist','programacao_encaminhamentos','programacao_hist',
    'programacoes','programacao',
    -- grupo 2: RLS habilitado sem policy
    'colaboradores_historico','dre_importacoes','dre_lancamentos','financeiro_notas_fiscais_resumo',
    'financeiro_pagamentos_execucoes','financeiro_pagamentos_linhas','frotas_bfleet_condutores_fila','geocode_cache',
    'grm_auditorias_importacoes','grm_contas_pagar_importacoes','grm_contas_receber_importacoes',
    'grm_distribuicao_os_importacoes','grm_lista_os_importacoes','grm_mapa_embarque_importacoes','grm_nhe_importacoes',
    'grm_patrimonios_importacoes','hospedagem_anexos','hospedagem_eventos','logistica_alertas',
    'logistica_relatorios_destinatarios','logistica_relatorios_envios','operacional_colaboradores_base'
  ];
BEGIN
  FOREACH tbl IN ARRAY full_crud_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_select_authenticated', tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', tbl || '_select_authenticated', tbl);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_insert_authenticated', tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (true)', tbl || '_insert_authenticated', tbl);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_update_authenticated', tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', tbl || '_update_authenticated', tbl);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_delete_authenticated', tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (true)', tbl || '_delete_authenticated', tbl);
  END LOOP;
END $$;

-- app_usuario_modulos: tabela de permissoes, somente leitura para authenticated.
-- Escrita deve continuar via service role (backend/admin), nunca via authenticated,
-- para evitar que um usuario altere seus proprios modulos/permissoes.
DROP POLICY IF EXISTS app_usuario_modulos_select_authenticated ON public.app_usuario_modulos;
CREATE POLICY app_usuario_modulos_select_authenticated ON public.app_usuario_modulos FOR SELECT TO authenticated USING (true);
;
