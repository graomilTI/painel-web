-- Camada de segurança extra: até aqui, só quem escrevia em
-- colaboradores.situacao sabia (por convenção, não por garantia do banco)
-- que também precisava gravar em colaboradores_status_historico — a única
-- fonte que alimenta a remoção automática de acesso no Uber
-- (trg_uber_fila_remocao_status_colaborador). O worker
-- grmserver-colaboradores-api-realtime.js foi corrigido pra fazer isso, mas
-- se amanhã surgir outro caminho de escrita (novo agente de sync, edição
-- manual, correção via SQL) e ele esquecer desse passo, o mesmo buraco se
-- repete. Este trigger fecha essa lacuna de vez: captura QUALQUER mudança de
-- situacao em colaboradores, não importa quem escreveu.
CREATE OR REPLACE FUNCTION public.colaboradores_registra_mudanca_situacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_ativo_anterior boolean;
  v_ativo_novo boolean;
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
  end if;

  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_colaboradores_registra_mudanca_situacao ON public.colaboradores;

CREATE TRIGGER trg_colaboradores_registra_mudanca_situacao
AFTER UPDATE OF situacao ON public.colaboradores
FOR EACH ROW
WHEN (old.situacao IS DISTINCT FROM new.situacao)
EXECUTE FUNCTION public.colaboradores_registra_mudanca_situacao();
