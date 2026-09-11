-- Pedido do usuário, 2026-09-11: toda vez que o Gestor solicita abertura de
-- O.S. (logistica_abertura_os, status inicial sempre PENDENTE — ver
-- handleSalvarAberturaOsInterno em assets/js/logistica.js), notificar o
-- responsável da Logística por abertura de O.S. via WhatsApp. Mesmo padrão
-- de notificar_rh_atestado_lancado (net.http_post -> botconversa-send,
-- contato em compras_notificacoes_config). Setor usado: 'OS' — já existe
-- como opção em TI > Contatos ("OS — Operacional / Ordem de Serviço") e já
-- tem um contato ativo cadastrado (VINICIOS DALLAGNOL BUZINARO); 'LOGISTICA'
-- existe como setor também mas hoje não tem nenhum contato ativo, então
-- notificaria ninguém.

create or replace function public.notificar_logistica_nova_abertura_os()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_url text;
  v_key text;
  v_mensagem text;
  v_contato record;
begin
  if new.status <> 'PENDENTE' then
    return new;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if v_url is null or v_key is null then
    raise warning 'notificar_logistica_nova_abertura_os: project_url/service_role_key ausentes em vault.decrypted_secrets';
    return new;
  end if;

  v_mensagem := format(
    'Nova solicitação de Abertura de O.S.'||chr(10)||
    'Cliente: %s'||chr(10)||
    'Embarque: %s'||chr(10)||
    'Destino: %s'||chr(10)||
    'Produto: %s (%s ton)'||chr(10)||
    'Regional: %s'||chr(10)||
    'Solicitante: %s'||chr(10)||
    'Confira em Logística ADM > Abertura de O.S.',
    new.contratante_cliente,
    new.armazem_embarque,
    new.local_destino,
    new.produto,
    coalesce(new.volume_inicial::text, '-'),
    new.regional,
    coalesce(new.solicitante_nome, 'não identificado')
  );

  for v_contato in
    select telefone, nome from public.compras_notificacoes_config
    where setor = 'OS' and ativo = true and telefone is not null
  loop
    perform net.http_post(
      url := v_url || '/functions/v1/botconversa-send',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body := jsonb_build_object('phone', regexp_replace(v_contato.telefone, '\D', '', 'g'), 'message', v_mensagem, 'nome', coalesce(v_contato.nome, '')),
      timeout_milliseconds := 30000
    );
  end loop;

  return new;
end;
$function$;

drop trigger if exists trg_notificar_logistica_nova_abertura_os on public.logistica_abertura_os;
create trigger trg_notificar_logistica_nova_abertura_os
  after insert on public.logistica_abertura_os
  for each row
  execute function public.notificar_logistica_nova_abertura_os();
