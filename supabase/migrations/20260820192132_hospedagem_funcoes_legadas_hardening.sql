-- Fecha RPCs legadas anonimas e fixa search_path contra object shadowing.
do $$
declare f record; v_authenticated_tinha_acesso boolean;
begin
  for f in
    select p.oid::regprocedure assinatura
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'hospedagem_%'
  loop
    v_authenticated_tinha_acesso := has_function_privilege('authenticated',f.assinatura,'execute');
    execute format('revoke all on function %s from anon',f.assinatura);
    execute format('revoke all on function %s from public',f.assinatura);
    execute format('alter function %s set search_path=public',f.assinatura);
    if v_authenticated_tinha_acesso then
      execute format('grant execute on function %s to authenticated',f.assinatura);
    end if;
  end loop;
end $$;

-- Reestabelece somente as APIs que o frontend autenticado utiliza. As funcoes
-- de trigger continuam sem EXECUTE direto para authenticated.
grant execute on function public.hospedagem_pode_operar(boolean) to authenticated;
grant execute on function public.hospedagem_pode_financeiro(boolean) to authenticated;
grant execute on function public.hospedagem_criar_solicitacao(jsonb,jsonb) to authenticated;
grant execute on function public.hospedagem_cancelar_solicitacao(uuid,text) to authenticated;
grant execute on function public.hospedagem_realizar_checkout(uuid,jsonb,numeric,jsonb,text) to authenticated;
grant execute on function public.hospedagem_consumir_creditos(uuid,uuid,numeric) to authenticated;
grant execute on function public.hospedagem_enviar_lote_financeiro(uuid,uuid) to authenticated;
grant execute on function public.hospedagem_confirmar_pagamento_lote(uuid,numeric,text) to authenticated;
