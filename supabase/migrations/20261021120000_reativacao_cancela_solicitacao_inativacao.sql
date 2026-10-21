-- Reativação cancela a solicitação de inativação pendente.
--
-- Pedido do gestor em Programação > Sem O.S. fica PENDENTE até o RH tratar. Se o
-- colaborador é inativado no GRM e depois reativado, a solicitação continuava
-- PENDENTE e mantinha a pessoa na aba Desligados (Relatórios de Patrimônios) sem
-- nenhum botão para tirá-la. Agora a transição não ativo -> Ativo em
-- colaboradores cancela as solicitações pendentes dessa pessoa (casadas pelo CPF).
-- Quem nunca saiu de Ativo desde o pedido não passa por esta transição e segue pendente.
CREATE OR REPLACE FUNCTION public.colaboradores_registra_mudanca_situacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_ativo_anterior boolean;
  v_ativo_novo boolean;
  v_cpf text;
begin
  -- Só interessa uma transição real ativo<->inativo (mesmo critério usado em
  -- todo o resto do fluxo Uber: só a string 'Ativo' conta como ativo).
  v_ativo_anterior := (old.situacao = 'Ativo');
  v_ativo_novo := (new.situacao = 'Ativo');

  if v_ativo_anterior is distinct from v_ativo_novo and new.cpf is not null then
    insert into public.colaboradores_status_historico (
      colaborador_id, cpf, nome, situacao_anterior, situacao_nova,
      ativo_anterior, ativo_novo, data_efetiva, detectado_em, fonte, metadata
    ) values (
      new.id, new.cpf, coalesce(nullif(trim(new.nome), ''), 'COLABORADOR'),
      old.situacao, new.situacao, v_ativo_anterior, v_ativo_novo,
      (now() at time zone 'America/Sao_Paulo')::date, now(),
      'trigger_colaboradores_situacao',
      jsonb_build_object('origem_trigger', true)
    )
    -- mesmo índice único da tabela (uq_colab_status_hist_estado): se algum
    -- worker já gravou o mesmo evento manualmente no mesmo dia, ignora em
    -- vez de duplicar ou falhar a transação que disparou o trigger.
    on conflict (cpf, ativo_novo, data_efetiva, coalesce(situacao_nova, ''::text)) do nothing;

    -- Reativação: o pedido de inativação pendente perdeu o sentido.
    if v_ativo_novo and v_ativo_anterior is not true then
      v_cpf := nullif(regexp_replace(coalesce(new.cpf, ''), '\D', '', 'g'), '');
      if v_cpf is not null then
        update public.programacao_inativacao_solicitacoes
           set status = 'CANCELADA',
               processado_em = now(),
               processado_por_nome = 'Sistema (reativação)',
               observacao_rh = 'Colaborador reativado; solicitação de inativação cancelada automaticamente.'
         where status = 'PENDENTE'
           and regexp_replace(coalesce(colaborador_id, ''), '\D', '', 'g') = v_cpf;
      end if;
    end if;
  end if;

  return new;
end;
$function$;
