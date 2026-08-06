alter table public.compras_itens add column if not exists nf_lembrete_enviado_em timestamptz;

create or replace function public.notificar_nf_pendentes_atrasadas()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_url text;
  v_key text;
  v_total int;
  v_valor numeric;
  v_mais_antiga date;
  v_mensagem text;
  v_ids uuid[];
  v_contato record;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if v_url is null or v_key is null then
    raise warning 'notificar_nf_pendentes_atrasadas: project_url/service_role_key ausentes em vault.decrypted_secrets';
    return;
  end if;

  select array_agg(id), count(*), sum(valor_total), min(comprado_em::date)
    into v_ids, v_total, v_valor, v_mais_antiga
  from public.compras_itens
  where status = 'comprado'
    and nf_url is not null
    and comprovante_url is not null
    and coalesce(nf_lancado, false) = false
    and comprado_em < now() - interval '5 days'
    and (nf_lembrete_enviado_em is null or nf_lembrete_enviado_em < now() - interval '7 days');

  if v_total is null or v_total = 0 then
    return;
  end if;

  v_mensagem := format(
    'Lembrete: Notas Fiscais pendentes de lançamento'||chr(10)||
    '%s nota(s) fiscal(is) aguardando lançamento no painel (aba Pendentes)'||chr(10)||
    'Valor total: R$ %s'||chr(10)||
    'Mais antiga desde: %s',
    v_total, to_char(v_valor, 'FM999G999G990D00'), to_char(v_mais_antiga, 'DD/MM/YYYY')
  );

  for v_contato in
    select telefone, nome from public.compras_notificacoes_config
    where setor = 'NOTAS_FISCAIS' and ativo = true and telefone is not null
  loop
    perform net.http_post(
      url := v_url || '/functions/v1/botconversa-send',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body := jsonb_build_object('phone', regexp_replace(v_contato.telefone, '\D', '', 'g'), 'message', v_mensagem, 'nome', coalesce(v_contato.nome, '')),
      timeout_milliseconds := 30000
    );
  end loop;

  update public.compras_itens set nf_lembrete_enviado_em = now() where id = any(v_ids);
end;
$function$;

select cron.schedule(
  'notificar-nf-pendentes-diario',
  '0 11 * * *',
  $$select public.notificar_nf_pendentes_atrasadas();$$
);;
