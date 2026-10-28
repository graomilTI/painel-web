-- Logs de Usuários: registrar as despesas da Programação que foram INSERIDAS ou
-- REMOVIDAS, com texto legível em metadata.acao_exata (pedido do usuário, 2026-10-28).
--
-- Despesas = programacao_extras, programacao_alimentacao, programacao_deslocamento
-- e programacao_estadia. Só INSERT/DELETE entram aqui (o upsert de tela vira UPDATE
-- quando a linha já existe e não é "despesa nova"). Linhas vazias (sem refeição,
-- "NÃO PRECISA" sem valor, sem estadia) são ignoradas pra não poluir a trilha.
--
-- programacao_extras já tinha a trigger genérica (INSERT/UPDATE/DELETE, texto cru
-- "Criou registro em programacao_extras [uuid]"): ela passa a cobrir só UPDATE e
-- INSERT/DELETE ficam com a trigger nova, pra não duplicar.

CREATE OR REPLACE FUNCTION public.fn_auditar_programacao_despesa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row        jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_uid        uuid := auth.uid();
  v_email      text;
  v_nome       text;
  v_role       text;
  v_origem     text;
  v_headers    jsonb;
  v_ip         text;
  v_user_agent text;
  v_colab      text;
  v_data       text;
  v_categoria  text;
  v_detalhe    text;
  v_verbo      text;
  v_acao_exata text;
  v_refeicoes  text[];
BEGIN
  v_colab := COALESCE(NULLIF(v_row->>'nome_colaborador', ''), v_row->>'colaborador_id', 'colaborador não informado');
  v_data  := CASE WHEN v_row->>'data_referencia' IS NOT NULL
                  THEN to_char((v_row->>'data_referencia')::date, 'DD/MM/YYYY') END;

  IF TG_TABLE_NAME = 'programacao_extras' THEN
    v_categoria := 'despesa extra';
    v_detalhe := concat_ws(' — ',
      COALESCE(NULLIF(v_row->>'tipo_despesa', ''), 'OUTRO'),
      NULLIF(v_row->>'descricao', ''),
      'R$ ' || replace(to_char(COALESCE((v_row->>'valor')::numeric, 0), 'FM999999990.00'), '.', ','));

  ELSIF TG_TABLE_NAME = 'programacao_alimentacao' THEN
    v_refeicoes := array_remove(ARRAY[
      CASE WHEN (v_row->>'cafe')::boolean   THEN 'café'   END,
      CASE WHEN (v_row->>'almoco')::boolean THEN 'almoço' END,
      CASE WHEN (v_row->>'janta')::boolean  THEN 'janta'  END], NULL);
    IF COALESCE(array_length(v_refeicoes, 1), 0) = 0 THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
    v_categoria := 'despesa de alimentação';
    v_detalhe := array_to_string(v_refeicoes, ', ');

  ELSIF TG_TABLE_NAME = 'programacao_deslocamento' THEN
    IF upper(COALESCE(v_row->>'tipo_deslocamento', 'NÃO PRECISA')) IN ('NÃO PRECISA', 'NAO PRECISA')
       AND COALESCE((v_row->>'valor')::numeric, 0) = 0 THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
    v_categoria := 'despesa de deslocamento';
    v_detalhe := concat_ws(' — ',
      v_row->>'tipo_deslocamento',
      NULLIF(concat_ws(' → ', NULLIF(v_row->>'origem', ''), NULLIF(v_row->>'destino', '')), ''),
      CASE WHEN COALESCE((v_row->>'valor')::numeric, 0) > 0
           THEN 'R$ ' || replace(to_char((v_row->>'valor')::numeric, 'FM999999990.00'), '.', ',') END);

  ELSIF TG_TABLE_NAME = 'programacao_estadia' THEN
    IF NOT COALESCE((v_row->>'tem_estadia')::boolean, false)
       AND upper(COALESCE(v_row->>'tipo_estadia', 'NÃO PRECISA')) IN ('NÃO PRECISA', 'NAO PRECISA') THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
    v_categoria := 'despesa de estadia';
    v_detalhe := concat_ws(' — ',
      v_row->>'tipo_estadia',
      NULLIF(concat_ws('/', NULLIF(v_row->>'cidade', ''), NULLIF(v_row->>'uf', '')), ''),
      CASE WHEN COALESCE((v_row->>'diarias')::numeric, 0) > 0
           THEN trim(trailing '.' FROM trim(trailing '0' FROM to_char((v_row->>'diarias')::numeric, 'FM990.00'))) || ' diária(s)' END);

  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_verbo := CASE WHEN TG_OP = 'INSERT' THEN 'Inseriu' ELSE 'Removeu' END;
  v_acao_exata := format('%s %s (%s) de %s%s',
    v_verbo, v_categoria, v_detalhe, v_colab,
    CASE WHEN v_data IS NOT NULL THEN ' em ' || v_data ELSE '' END);

  BEGIN
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_headers := NULL;
  END;
  v_ip := COALESCE(
    nullif(split_part(COALESCE(v_headers->>'x-forwarded-for', ''), ',', 1), ''),
    nullif(v_headers->>'cf-connecting-ip', ''),
    nullif(v_headers->>'x-real-ip', ''));
  v_user_agent := nullif(v_headers->>'user-agent', '');

  IF v_uid IS NOT NULL THEN
    SELECT u.email, au.nome, p.nome
      INTO v_email, v_nome, v_role
    FROM auth.users u
    LEFT JOIN public.app_usuarios au ON au.auth_user_id = u.id
    LEFT JOIN public.app_perfis p ON p.id = au.perfil_id
    WHERE u.id = v_uid;
    v_origem := 'frontend';
  ELSE
    v_nome := 'AUTOMAÇÕES / BACKEND';
    v_role := 'worker';
    v_origem := 'worker';
  END IF;

  INSERT INTO public.app_auditoria (
    usuario_id, usuario_email, modulo, tabela, registro_id, acao,
    valor_anterior, valor_novo, campos_alterados, origem, ip, user_agent, metadata
  ) VALUES (
    v_uid, v_email, 'programacao', TG_TABLE_NAME, v_row->>'id', TG_OP,
    CASE WHEN TG_OP = 'DELETE' THEN v_row END,
    CASE WHEN TG_OP = 'INSERT' THEN v_row END,
    NULL, v_origem, v_ip, v_user_agent,
    jsonb_build_object(
      'acao_exata', v_acao_exata,
      'tipo_evento', CASE WHEN TG_OP = 'INSERT' THEN 'DESPESA_INSERIDA' ELSE 'DESPESA_REMOVIDA' END,
      'categoria_despesa', v_categoria,
      'usuario_nome', v_nome,
      'usuario_role', v_role,
      'colaborador_id', v_row->>'colaborador_id',
      'colaborador_nome', v_colab,
      'data_referencia', v_row->>'data_referencia',
      'programacao_id', v_row->>'programacao_id'
    )
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  -- Auditoria nunca pode derrubar a operação de negócio.
  RAISE WARNING 'fn_auditar_programacao_despesa falhou em %.%: %', TG_TABLE_NAME, TG_OP, SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['programacao_extras', 'programacao_alimentacao', 'programacao_deslocamento', 'programacao_estadia'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS trg_auditoria_despesa ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_auditoria_despesa AFTER INSERT OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.fn_auditar_programacao_despesa()', t);
  END LOOP;

  -- programacao_extras: a trigger genérica passa a cobrir só UPDATE (diff de campos).
  IF to_regclass('public.programacao_extras') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_auditoria ON public.programacao_extras;
    CREATE TRIGGER trg_auditoria AFTER UPDATE ON public.programacao_extras
      FOR EACH ROW EXECUTE FUNCTION public.fn_registrar_auditoria('programacao');
  END IF;
END $$;
