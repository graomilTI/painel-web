-- ============================================================================
-- FUNDAÇÃO P0 — Auditoria genérica e rastreabilidade (plano seções 1.5 e 2.3)
--
-- Cria a tabela app_auditoria (usuário, módulo, registro afetado, ação,
-- valor anterior, valor novo, data/hora, origem e erro), uma função de
-- trigger genérica com diff automático e um helper para habilitar a
-- auditoria em qualquer tabela com um único comando.
-- ============================================================================

-- ── Tabela central de auditoria ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_auditoria (
  id             uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  usuario_email  text,
  modulo         text        NOT NULL,
  tabela         text,
  registro_id    text,
  acao           text        NOT NULL CHECK (acao IN ('INSERT','UPDATE','DELETE','ACTION')),
  valor_anterior jsonb,
  valor_novo     jsonb,
  campos_alterados text[],
  origem         text        NOT NULL DEFAULT 'banco' CHECK (origem IN ('banco','frontend','worker','edge_function','agente')),
  erro           text,
  ip             text,
  user_agent     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE app_auditoria IS
  'Auditoria central do painel: toda ação relevante registra usuário, módulo, registro afetado, ação, valor anterior/novo, data e hora, origem e erro (plano de reestruturação, seção 1.5).';
COMMENT ON COLUMN app_auditoria.campos_alterados IS 'Nomes dos campos que mudaram em UPDATEs (diff calculado pela trigger).';
COMMENT ON COLUMN app_auditoria.origem IS 'De onde partiu a ação: trigger de banco, frontend, worker da VPS, edge function ou agente GRM.';

CREATE INDEX IF NOT EXISTS idx_app_auditoria_created_at  ON app_auditoria (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_auditoria_usuario     ON app_auditoria (usuario_id);
CREATE INDEX IF NOT EXISTS idx_app_auditoria_modulo      ON app_auditoria (modulo);
CREATE INDEX IF NOT EXISTS idx_app_auditoria_tabela_reg  ON app_auditoria (tabela, registro_id);
CREATE INDEX IF NOT EXISTS idx_app_auditoria_acao        ON app_auditoria (acao);

ALTER TABLE app_auditoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auditoria_select_auth" ON app_auditoria;
CREATE POLICY "auditoria_select_auth" ON app_auditoria
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auditoria_insert_auth" ON app_auditoria;
CREATE POLICY "auditoria_insert_auth" ON app_auditoria
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- Auditoria é imutável: sem policies de UPDATE/DELETE para authenticated.

-- ── Função de trigger genérica com diff automático ──────────────────────────
CREATE OR REPLACE FUNCTION fn_registrar_auditoria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old      jsonb;
  v_new      jsonb;
  v_campos   text[];
  v_registro text;
  v_modulo   text;
BEGIN
  v_modulo := COALESCE(TG_ARGV[0], TG_TABLE_NAME);

  IF TG_OP = 'INSERT' THEN
    v_new      := to_jsonb(NEW);
    v_registro := COALESCE(v_new->>'id', NULL);
  ELSIF TG_OP = 'UPDATE' THEN
    v_old      := to_jsonb(OLD);
    v_new      := to_jsonb(NEW);
    v_registro := COALESCE(v_new->>'id', v_old->>'id');
    SELECT COALESCE(array_agg(key), '{}') INTO v_campos
    FROM jsonb_each(v_new) AS n(key, value)
    WHERE v_old->key IS DISTINCT FROM value
      AND key NOT IN ('updated_at', 'created_at');
    -- UPDATE sem mudança real (ex.: touch de updated_at) não gera ruído.
    IF v_campos = '{}' THEN
      RETURN NEW;
    END IF;
    -- Guarda apenas os campos que mudaram, não a linha inteira.
    SELECT jsonb_object_agg(key, v_old->key), jsonb_object_agg(key, v_new->key)
      INTO v_old, v_new
    FROM unnest(v_campos) AS key;
  ELSE
    v_old      := to_jsonb(OLD);
    v_registro := COALESCE(v_old->>'id', NULL);
  END IF;

  INSERT INTO app_auditoria (
    usuario_id, usuario_email, modulo, tabela, registro_id,
    acao, valor_anterior, valor_novo, campos_alterados, origem
  ) VALUES (
    auth.uid(),
    COALESCE(auth.jwt()->>'email', NULL),
    v_modulo,
    TG_TABLE_NAME,
    v_registro,
    TG_OP,
    v_old,
    v_new,
    v_campos,
    'banco'
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  -- Auditoria nunca pode derrubar a operação de negócio.
  RAISE WARNING 'fn_registrar_auditoria falhou em %.%: %', TG_TABLE_NAME, TG_OP, SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION fn_registrar_auditoria() IS
  'Trigger genérica de auditoria: grava INSERT/UPDATE/DELETE em app_auditoria com diff dos campos alterados. Uso: SELECT fn_habilitar_auditoria(''tabela'', ''modulo'').';

-- ── Helper para habilitar auditoria em uma tabela ───────────────────────────
CREATE OR REPLACE FUNCTION fn_habilitar_auditoria(p_tabela text, p_modulo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS trg_auditoria ON %I', p_tabela);
  EXECUTE format(
    'CREATE TRIGGER trg_auditoria
       AFTER INSERT OR UPDATE OR DELETE ON %I
       FOR EACH ROW EXECUTE FUNCTION fn_registrar_auditoria(%L)',
    p_tabela, COALESCE(p_modulo, p_tabela)
  );
END;
$$;

COMMENT ON FUNCTION fn_habilitar_auditoria(text, text) IS
  'Anexa a trigger de auditoria genérica à tabela informada. Ex.: SELECT fn_habilitar_auditoria(''compras_itens'', ''compras'').';

-- ── Piloto: habilita auditoria no domínio de Notas Fiscais/Compras ──────────
-- (módulo piloto da fundação; demais tabelas entram conforme cada módulo for
--  migrado para o padrão, evitando big-bang)
DO $$
BEGIN
  IF to_regclass('public.compras_itens') IS NOT NULL THEN
    PERFORM fn_habilitar_auditoria('compras_itens', 'notas-fiscais');
  END IF;
  IF to_regclass('public.financeiro_pagamentos') IS NOT NULL THEN
    PERFORM fn_habilitar_auditoria('financeiro_pagamentos', 'financeiro');
  END IF;
END $$;

-- ── Visão de monitoramento de sincronizações (plano seção 2.7) ─────────────
-- Última execução por agente/job para alimentar o componente dataStatus.
DO $$
BEGIN
  IF to_regclass('public.grm_sync_jobs') IS NOT NULL THEN
    EXECUTE $view$
      CREATE OR REPLACE VIEW vw_monitoramento_sync AS
      SELECT
        j.agente_id                                            AS agente,
        max(j.created_at)                                      AS ultima_criacao,
        max(j.finalizado_em)                                   AS ultima_finalizacao,
        (array_agg(j.status ORDER BY j.created_at DESC))[1]    AS ultimo_status,
        (array_agg(j.erro   ORDER BY j.created_at DESC))[1]    AS ultimo_erro,
        avg(EXTRACT(EPOCH FROM (j.finalizado_em - j.iniciado_em)))
          FILTER (WHERE j.finalizado_em IS NOT NULL)           AS duracao_media_segundos
      FROM grm_sync_jobs j
      GROUP BY j.agente_id
    $view$;
    EXECUTE 'COMMENT ON VIEW vw_monitoramento_sync IS ''Resumo por agente para telas de monitoramento: última execução, status, erro e duração média (plano seção 2.7).''';
  END IF;
END $$;


