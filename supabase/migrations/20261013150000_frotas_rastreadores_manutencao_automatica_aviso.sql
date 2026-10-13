-- Aviso-resumo no sininho quando a rotina automática manda rastreadores para Manutenção
-- (sem conexão há 3+ dias). Um aviso por execução horária que abrir manutenções, nunca um por placa.
-- Vai para quem tem o módulo Rastreadores, como os avisos das ações feitas no painel.
-- A regra de seleção e o restante da função são os mesmos da migration 20261001170000.

create or replace function public.frotas_rastreadores_manutencao_automatica()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_qtd integer;
begin
  create temp table _alvos on commit drop as
  select distinct on (v.id)
    v.id as veiculo_id,
    upper(regexp_replace(v.placa, '[^A-Za-z0-9]', '', 'g')) as placa,
    r.placa as placa_rastreador,
    r.status as status_atual,
    p.reportado_em,
    floor(extract(epoch from (now() - p.reportado_em)) / 86400)::int as dias
  from public.frotas_posicoes p
  join public.frotas_veiculos v
    on v.id = p.veiculo_id
    or upper(regexp_replace(v.placa, '[^A-Za-z0-9]', '', 'g')) = upper(regexp_replace(p.placa, '[^A-Za-z0-9]', '', 'g'))
  join public.frotas_rastreadores r
    on upper(regexp_replace(r.placa, '[^A-Za-z0-9]', '', 'g')) = upper(regexp_replace(v.placa, '[^A-Za-z0-9]', '', 'g'))
  left join lateral (
    select m.situacao, m.encerrada_em
    from public.frotas_rastreadores_manutencoes m
    where m.placa = upper(regexp_replace(v.placa, '[^A-Za-z0-9]', '', 'g'))
      and m.situacao in ('finalizada', 'cancelada')
    order by m.encerrada_em desc nulls last
    limit 1
  ) ult on true
  where v.status = 'ATIVO'
    and r.status = 'concluido'
    and p.reportado_em <= now() - interval '3 days'
    and p.atualizado_em >= now() - interval '24 hours'
    and not exists (
      select 1 from public.frotas_rastreadores_removidos rem
      where upper(regexp_replace(rem.placa, '[^A-Za-z0-9]', '', 'g')) = upper(regexp_replace(v.placa, '[^A-Za-z0-9]', '', 'g'))
    )
    and not exists (
      select 1 from public.frotas_rastreadores_manutencoes m
      where m.placa = upper(regexp_replace(v.placa, '[^A-Za-z0-9]', '', 'g')) and m.situacao = 'aberta'
    )
    and (
      ult.situacao is null
      or (ult.situacao = 'cancelada' and p.reportado_em > coalesce(ult.encerrada_em, '-infinity'))
      or (ult.situacao = 'finalizada' and coalesce(ult.encerrada_em, '-infinity') <= now() - interval '3 days')
    )
  order by v.id, p.reportado_em desc;

  insert into public.frotas_rastreadores_manutencoes (placa, veiculo_id, motivo, status_anterior, aberta_por_nome, linha_tempo)
  select placa, veiculo_id,
    'Sem conexão do rastreador há ' || dias || ' dias (último reporte em ' || to_char(reportado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ')',
    status_atual,
    'Automático (sem conexão há 3+ dias)',
    jsonb_build_array(jsonb_build_object('evento', 'Enviada para manutenção: sem conexão do rastreador há 3+ dias', 'em', now(), 'por', 'Automático'))
  from _alvos;

  update public.frotas_rastreadores r
     set status = 'manutencao'
    from _alvos a
   where r.placa = a.placa_rastreador;

  select count(*) into v_qtd from _alvos;

  -- Aviso-resumo: lista as 8 placas há mais tempo sem sinal e conta o restante.
  if v_qtd > 0 then
    insert into public.painel_notificacoes
      (tipo, titulo, descricao, prioridade, icone, modulo_url, destinatario_modulo, referencia_tabela, meta)
    select
      'frotas_rastreador_manutencao_auto',
      case when v_qtd = 1 then '1 rastreador enviado para manutenção automaticamente'
           else v_qtd || ' rastreadores enviados para manutenção automaticamente' end,
      'Sem conexão há 3+ dias: ' || string_agg(t.placa || ' (' || t.dias || 'd)', ', ' order by t.dias desc, t.placa)
        || case when v_qtd > 8 then ' e mais ' || (v_qtd - 8) else '' end,
      'atencao',
      'wrench',
      'frotas-cadastros?aba=rastreadores&filtro=manutencao',
      'frotas_rastreadores',
      'frotas_rastreadores_manutencoes',
      jsonb_build_object('automatica', true, 'quantidade', v_qtd)
    from (select placa, dias from _alvos order by dias desc, placa limit 8) t;
  end if;

  drop table if exists _alvos;
  return 'enviadas para manutenção: ' || v_qtd;
end;
$$;

revoke all on function public.frotas_rastreadores_manutencao_automatica() from public, anon, authenticated;
