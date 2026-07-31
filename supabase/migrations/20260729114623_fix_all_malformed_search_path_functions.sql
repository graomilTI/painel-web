-- Mesmo bug do fix anterior (sync_compras_solicitacao_status), encontrado em
-- outras 39 funções: search_path salvo como string única malformada
-- "public, pg_temp" (schema literal inexistente) em vez de duas entradas
-- separadas. Provavelmente de um script de hardening de segurança rodado
-- durante a migração pro banco BR. Corrige todas com o mesmo padrão seguro.
alter function public._normalizar_texto_g1000(valor text) set search_path = public, pg_temp;
alter function public._somente_digitos_g1000(valor text) set search_path = public, pg_temp;
alter function public.auto_validar_uber_por_laudo(p_inicio date, p_fim date) set search_path = public, pg_temp;
alter function public.conf_distancia_km(lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric) set search_path = public, pg_temp;
alter function public.conf_norm_txt(value text) set search_path = public, pg_temp;
alter function public.extrair_placa_texto(p_texto text) set search_path = public, pg_temp;
alter function public.frotas_touch_updated_at() set search_path = public, pg_temp;
alter function public.hospedagem_importar_diarias_json(p_linhas jsonb, p_importado_por uuid) set search_path = public, pg_temp;
alter function public.hospedagem_json_get(p_obj jsonb, p_aliases text[]) set search_path = public, pg_temp;
alter function public.hospedagem_json_norm(p_val text) set search_path = public, pg_temp;
alter function public.hospedagem_json_texto(p_linha jsonb, p_chaves text[]) set search_path = public, pg_temp;
alter function public.hospedagem_norm_texto(p_texto text) set search_path = public, pg_temp;
alter function public.hospedagem_parse_money(p_val text) set search_path = public, pg_temp;
alter function public.hospedagem_split_cidade_uf(p_cidade text, OUT cidade text, OUT uf text) set search_path = public, pg_temp;
alter function public.hospedagem_to_numeric(p_texto text) set search_path = public, pg_temp;
alter function public.hospedagem_uf_valida(p_uf text) set search_path = public, pg_temp;
alter function public.normalize(value text) set search_path = public, pg_temp;
alter function public.operacional_auditoria_set_updated_at() set search_path = public, pg_temp;
alter function public.operacional_colaborador_base_set_updated_at() set search_path = public, pg_temp;
alter function public.operacional_distancia_km(lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric) set search_path = public, pg_temp;
alter function public.operacional_pontos_set_updated_at() set search_path = public, pg_temp;
alter function public.operacional_ranking_embarque(p_embarque_id uuid) set search_path = public, pg_temp;
alter function public.rh_colaborador_na_data(p_data date, p_nome text, p_cpf text) set search_path = public, pg_temp;
alter function public.rh_snapshot_na_data(p_data date) set search_path = public, pg_temp;
alter function public.rpc_upsert_usuario(p_nome text, p_email text, p_telefone text, p_status text, p_perfil_codigo text) set search_path = public, pg_temp;
alter function public.salvar_programacao(p_data date, p_coordenacao text, p_supervisao text, p_solicitante text, p_itens jsonb) set search_path = public, pg_temp;
alter function public.set_current_timestamp_updated_at() set search_path = public, pg_temp;
alter function public.set_financeiro_pagamentos_updated_at() set search_path = public, pg_temp;
alter function public.set_grm_sync_jobs_updated_at() set search_path = public, pg_temp;
alter function public.set_updated_at_colaboradores_historico() set search_path = public, pg_temp;
alter function public.set_updated_at_frotas_multas() set search_path = public, pg_temp;
alter function public.set_updated_at_generic() set search_path = public, pg_temp;
alter function public.set_updated_at_logistica_abertura_os() set search_path = public, pg_temp;
alter function public.set_updated_at_logistica_fob() set search_path = public, pg_temp;
alter function public.set_updated_at_relatorios_importacoes() set search_path = public, pg_temp;
alter function public.touch_profile_updated_at() set search_path = public, pg_temp;
alter function public.touch_programacao_itens_updated_at() set search_path = public, pg_temp;
alter function public.touch_updated_at() set search_path = public, pg_temp;
alter function public.upsert_programacao_despesas(p_data_referencia date, p_supervisao text, p_coordenacao text, p_solicitante text, p_queue_id text, p_itens jsonb) set search_path = public, pg_temp;;
