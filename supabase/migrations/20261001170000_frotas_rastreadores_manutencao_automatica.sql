-- Manda para Manutenção (etapa Disponibilidade com o motorista) todo veículo ATIVO cujo
-- rastreador está há 3+ dias sem reportar posição (frotas_posicoes.reportado_em, BFleet).
--
-- Regras:
--   - só rastreadores "Instalado" (concluido), veículo ATIVO, fora de REMOVIDOS e sem manutenção aberta;
--   - a posição precisa ter sido atualizada pela sync da BFleet nas últimas 24h; se a sync parar,
--     reportado_em fica velho para todos e isso NÃO pode virar manutenção em massa;
--   - não reabre em loop: manutenção cancelada só volta a ser aberta depois de um novo reporte
--     seguido de nova queda; manutenção concluída dá 3 dias para o rastreador voltar a reportar.
-- Roda de hora em hora via pg_cron.

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
  drop table if exists _alvos;
  return 'enviadas para manutenção: ' || v_qtd;
end;
$$;

revoke all on function public.frotas_rastreadores_manutencao_automatica() from public, anon, authenticated;

select cron.schedule('frotas-rastreadores-manutencao-automatica-1h', '10 * * * *',
  $cron$select public.frotas_rastreadores_manutencao_automatica();$cron$);
