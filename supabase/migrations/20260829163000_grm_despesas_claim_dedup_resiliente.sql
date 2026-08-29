-- Incidente real em 2026-08-29 (cpf 07464868129): a Edge Function de
-- publicação insere uma linha PENDENTE nova sempre que não enxerga, no
-- momento da consulta, nenhuma linha "viva" (PENDENTE/PROCESSANDO, ou ERRO
-- com tentativas < max_tentativas) com o mesmo cpf+data+hash_desejado. Essa
-- checagem (liveHashesByCpf em grm-liberacao-despesas-publicar/index.ts) tem
-- uma janela de corrida: se o worker marca uma linha ERRO retentável bem
-- perto da consulta da Edge Function, as duas passam a existir ao mesmo
-- tempo com o mesmo hash. O índice único parcial
-- grm_despesas_fila_pendente_hash_uidx só rejeita a segunda linha quando ela
-- tenta virar PENDENTE/PROCESSANDO -- ou seja, o próprio INSERT da Edge
-- Function passa (a outra linha ainda estava ERRO, fora do índice), mas a
-- colisão real só estoura depois, quando claim_next_grm_despesa_fila()
-- promove a linha ERRO retentável para PROCESSANDO enquanto a linha PENDENTE
-- duplicada já ocupa a mesma chave. Antes esse erro (23505) subia até
-- main().catch() e derrubava o agente inteiro, travando também as demais
-- linhas da fila do dia (72 PENDENTE acumuladas até a correção).
--
-- Em vez de depender só da checagem da Edge Function (que nunca fecha 100%
-- a corrida entre dois processos), o claim passa a tratar a colisão como
-- esperada: se a promoção para PROCESSANDO colidir com outra linha viva já
-- na mesma chave cpf+data_referencia+hash_desejado, marca a linha perdedora
-- como IGNORADO_VERSAO_SUPERADA (duplicata) e tenta a próxima candidata, em
-- vez de propagar a exceção.

create or replace function public.claim_next_grm_despesa_fila(
  p_excluir_ids uuid[] default '{}'::uuid[]
)
returns public.grm_despesas_fila
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.grm_despesas_fila;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_excluidos uuid[] := coalesce(p_excluir_ids, '{}'::uuid[]);
  v_tentativa int := 0;
begin
  perform pg_advisory_xact_lock(hashtext('claim_next_grm_despesa_fila'));

  update public.grm_despesas_fila
     set status = 'ERRO',
         ultimo_erro = coalesce(ultimo_erro, 'Processamento anterior excedeu 20 minutos.'),
         locked_at = null
   where status = 'PROCESSANDO'
     and locked_at < now() - interval '20 minutes';

  loop
    v_tentativa := v_tentativa + 1;
    exit when v_tentativa > 20;

    select *
      into v_row
      from public.grm_despesas_fila
     where data_referencia <= v_hoje
       and (
         status = 'PENDENTE'
         or (status = 'ERRO' and tentativas < max_tentativas)
       )
       and not (id = any(v_excluidos))
     order by data_referencia asc, created_at asc
     for update skip locked
     limit 1;

    if v_row.id is null then
      return null;
    end if;

    begin
      update public.grm_despesas_fila
         set status = 'PROCESSANDO',
             tentativas = tentativas + 1,
             locked_at = now(),
             ultimo_erro = null
       where id = v_row.id
       returning * into v_row;

      update public.grm_despesas_estado_colaborador
         set status_aplicacao = 'PROCESSANDO'
       where cpf = v_row.cpf
         and data_referencia = v_row.data_referencia
         and hash_desejado = v_row.hash_desejado;

      return v_row;
    exception when unique_violation then
      update public.grm_despesas_fila
         set status = 'IGNORADO_VERSAO_SUPERADA',
             locked_at = null,
             finalizado_em = now(),
             ultimo_erro = 'Duplicata: outra linha viva já ocupava cpf+data_referencia+hash_desejado.'
       where id = v_row.id;

      v_excluidos := v_excluidos || v_row.id;
    end;
  end loop;

  return null;
end;
$$;

revoke all on function public.claim_next_grm_despesa_fila(uuid[]) from public;
grant execute on function public.claim_next_grm_despesa_fila(uuid[]) to service_role;
