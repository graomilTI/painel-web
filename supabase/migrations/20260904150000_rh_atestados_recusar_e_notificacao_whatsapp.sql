-- Pedido do usuário, 2026-09-04 (RH > Indisponibilidade > Atestados):
-- 1) todo atestado lançado (RH ou Programação > Sem O.S.) notifica o setor
--    RH via WhatsApp (mesmo padrão de notificar_nf_pendentes_atrasadas:
--    net.http_post -> botconversa-send, contatos em compras_notificacoes_config
--    com setor='RH', que já existia como opção no cadastro de TI > Contatos
--    mas nunca tinha um evento real disparando pra ela).
-- 2) botão Recusar (atestado inválido) ao lado do Aprovar -> guarda o motivo.

alter table public.rh_atestados add column if not exists motivo_recusa text;
alter table public.rh_atestados add column if not exists recusado_por text;

create or replace function public.notificar_rh_atestado_lancado()
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
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if v_url is null or v_key is null then
    raise warning 'notificar_rh_atestado_lancado: project_url/service_role_key ausentes em vault.decrypted_secrets';
    return new;
  end if;

  v_mensagem := format(
    'Novo atestado lançado'||chr(10)||
    'Colaborador: %s'||chr(10)||
    'Período: %s a %s (%s dia(s))'||chr(10)||
    '%s'||
    'Confira em RH > Indisponibilidade > Atestados.',
    new.colaborador_nome,
    to_char(new.data_inicio, 'DD/MM/YYYY'),
    to_char(new.data_fim, 'DD/MM/YYYY'),
    coalesce(new.dias, (new.data_fim - new.data_inicio + 1)),
    case when new.cid is not null and trim(new.cid) <> '' then 'CID: ' || new.cid || chr(10) else '' end
  );

  for v_contato in
    select telefone, nome from public.compras_notificacoes_config
    where setor = 'RH' and ativo = true and telefone is not null
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

drop trigger if exists trg_notificar_rh_atestado_lancado on public.rh_atestados;
create trigger trg_notificar_rh_atestado_lancado
  after insert on public.rh_atestados
  for each row
  execute function public.notificar_rh_atestado_lancado();
