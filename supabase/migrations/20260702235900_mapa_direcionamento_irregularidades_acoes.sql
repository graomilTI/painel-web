-- Ações da aba Operacional > Mapa de Direcionamento > Irregularidades
-- Botões: Conferir, Dois Embarques, Irregular e Ok.
-- Apenas a ação IRREGULAR gera ocorrência no histórico do colaborador.

DO $$
BEGIN
  IF to_regclass('public.logistica_cargas_irregularidades') IS NOT NULL THEN
    EXECUTE '
      ALTER TABLE public.logistica_cargas_irregularidades
        ADD COLUMN IF NOT EXISTS acao_operacional text,
        ADD COLUMN IF NOT EXISTS conferido_em timestamptz,
        ADD COLUMN IF NOT EXISTS conferido_por uuid,
        ADD COLUMN IF NOT EXISTS conferido_por_nome text,
        ADD COLUMN IF NOT EXISTS observacao_operacional text
    ';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.colaborador_historico_ocorrencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_cpf text,
  colaborador_nome text NOT NULL,
  tipo text NOT NULL,
  titulo text NOT NULL,
  descricao text,
  severidade text NOT NULL DEFAULT 'INFO',
  origem text NOT NULL,
  referencia_id text,
  referencia_tabela text,
  os text,
  cliente text,
  coordenacao text,
  supervisao text,
  data_ocorrencia date,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_por_nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_colab_hist_ocorrencias_colaborador_cpf
  ON public.colaborador_historico_ocorrencias (colaborador_cpf);

CREATE INDEX IF NOT EXISTS idx_colab_hist_ocorrencias_colaborador_nome
  ON public.colaborador_historico_ocorrencias (colaborador_nome);

CREATE INDEX IF NOT EXISTS idx_colab_hist_ocorrencias_data
  ON public.colaborador_historico_ocorrencias (data_ocorrencia DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_colab_hist_ocorrencias_origem
  ON public.colaborador_historico_ocorrencias (origem, referencia_id, tipo);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'colaborador_hist_ocorrencias_ref_unique'
      AND conrelid = 'public.colaborador_historico_ocorrencias'::regclass
  ) THEN
    ALTER TABLE public.colaborador_historico_ocorrencias
      ADD CONSTRAINT colaborador_hist_ocorrencias_ref_unique UNIQUE (origem, referencia_id, tipo);
  END IF;
END $$;

ALTER TABLE public.colaborador_historico_ocorrencias ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'colaborador_historico_ocorrencias'
      AND policyname = 'colab_hist_ocorrencias_select_auth'
  ) THEN
    CREATE POLICY "colab_hist_ocorrencias_select_auth"
      ON public.colaborador_historico_ocorrencias
      FOR SELECT TO authenticated
      USING (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'colaborador_historico_ocorrencias'
      AND policyname = 'colab_hist_ocorrencias_insert_auth'
  ) THEN
    CREATE POLICY "colab_hist_ocorrencias_insert_auth"
      ON public.colaborador_historico_ocorrencias
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'colaborador_historico_ocorrencias'
      AND policyname = 'colab_hist_ocorrencias_update_auth'
  ) THEN
    CREATE POLICY "colab_hist_ocorrencias_update_auth"
      ON public.colaborador_historico_ocorrencias
      FOR UPDATE TO authenticated
      USING (auth.uid() IS NOT NULL)
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.logistica_cargas_irregularidades') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'logistica_cargas_irregularidades'
        AND policyname = 'logistica_cargas_irregularidades_update_auth'
    ) THEN
      CREATE POLICY "logistica_cargas_irregularidades_update_auth"
        ON public.logistica_cargas_irregularidades
        FOR UPDATE TO authenticated
        USING (auth.uid() IS NOT NULL)
        WITH CHECK (auth.uid() IS NOT NULL);
    END IF;
  END IF;
END $$;
