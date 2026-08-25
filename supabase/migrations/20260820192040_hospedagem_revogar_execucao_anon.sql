revoke all on function public.hospedagem_pode_operar(boolean) from anon;
revoke all on function public.hospedagem_pode_financeiro(boolean) from anon;
revoke all on function public.hospedagem_criar_solicitacao(jsonb,jsonb) from anon;
revoke all on function public.hospedagem_cancelar_solicitacao(uuid,text) from anon;
revoke all on function public.hospedagem_realizar_checkout(uuid,jsonb,numeric,jsonb,text) from anon;
revoke all on function public.hospedagem_consumir_creditos(uuid,uuid,numeric) from anon;
revoke all on function public.hospedagem_enviar_lote_financeiro(uuid,uuid) from anon;
revoke all on function public.hospedagem_confirmar_pagamento_lote(uuid,numeric,text) from anon;
