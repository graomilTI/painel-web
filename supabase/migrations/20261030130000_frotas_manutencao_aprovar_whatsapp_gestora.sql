-- Frotas · Manutenção: quando a manutenção entra em "À aprovar" (status em_aprovacao), avisa por WhatsApp o(s) contato(s)
-- do setor FROTAS cadastrados em TI > Contatos (compras_notificacoes_config). Soma-se ao aviso do sino/push aos aprovadores
-- (notificar_frotas_manutencao). Mesmo padrão de notificar_logistica_nova_abertura_os (net.http_post -> botconversa-send).
-- Aviso nunca pode impedir a ação do usuário: qualquer erro é engolido.

create or replace function public.notificar_frotas_manutencao_aprovar_whatsapp()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_url text;
  v_key text;
  v_cod text := 'MAN-' || lpad(new.numero::text, 6, '0');
  v_placa text;
  v_resumo text;
  v_qtd integer;
  v_menor record;
  v_mensagem text;
  v_contato record;
begin
  if new.status is distinct from 'em_aprovacao' or new.status is not distinct from old.status then
    return new;
  end if;

  begin
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url' limit 1;
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
    if v_url is null or v_key is null then
      raise warning 'notificar_frotas_manutencao_aprovar_whatsapp: project_url/service_role_key ausentes em vault.decrypted_secrets';
      return new;
    end if;

    select placa into v_placa from public.frotas_veiculos where id = new.veiculo_id;
    v_resumo := concat_ws(' | ', v_placa, nullif(left(coalesce(new.descricao, ''), 90), ''));

    select count(*) into v_qtd from public.frotas_manutencao_orcamentos where manutencao_id = new.id;
    select fornecedor, valor_total into v_menor from public.frotas_manutencao_orcamentos
     where manutencao_id = new.id order by selecionado desc, valor_total asc limit 1;

    v_mensagem := 'Manutenção aguardando aprovação' || chr(10) ||
      v_cod || coalesce(' | ' || nullif(v_resumo, ''), '') || chr(10) ||
      case when v_qtd > 0 then
        v_qtd || ' cotação(ões)' || case when v_menor.valor_total is not null
          then ' — ' || private.frotas_brl(v_menor.valor_total) || coalesce(' (' || v_menor.fornecedor || ')', '') else '' end || chr(10)
        else '' end ||
      'Solicitante: ' || coalesce(new.solicitante_nome, 'não identificado') || chr(10) ||
      'Confira em Frotas > Manutenção > À aprovar';

    for v_contato in
      select telefone, nome from public.compras_notificacoes_config
       where setor = 'FROTAS' and ativo = true and telefone is not null
    loop
      perform net.http_post(
        url := v_url || '/functions/v1/botconversa-send',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
        body := jsonb_build_object('phone', regexp_replace(v_contato.telefone, '\D', '', 'g'), 'message', v_mensagem, 'nome', coalesce(v_contato.nome, '')),
        timeout_milliseconds := 30000
      );
    end loop;
  exception when others then
    raise warning 'notificar_frotas_manutencao_aprovar_whatsapp: %', sqlerrm;
  end;

  return new;
end;
$function$;

revoke all on function public.notificar_frotas_manutencao_aprovar_whatsapp() from public, anon, authenticated;

drop trigger if exists trg_notificar_frotas_manutencao_aprovar_whatsapp on public.frotas_manutencoes;
create trigger trg_notificar_frotas_manutencao_aprovar_whatsapp
  after update of status on public.frotas_manutencoes
  for each row
  execute function public.notificar_frotas_manutencao_aprovar_whatsapp();
