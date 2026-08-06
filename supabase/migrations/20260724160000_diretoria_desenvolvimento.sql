-- Acompanhamento dos desenvolvimentos do painel pela Diretoria.

CREATE TABLE IF NOT EXISTS public.diretoria_desenvolvimento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  modulo text NOT NULL,
  submenu text,
  tipo text NOT NULL DEFAULT 'MELHORIA'
    CHECK (tipo IN ('NOVO_MODULO', 'NOVA_TELA', 'MELHORIA', 'CORRECAO', 'INTEGRACAO', 'AUTOMACAO')),
  status text NOT NULL DEFAULT 'PLANEJAMENTO'
    CHECK (status IN ('PLANEJAMENTO', 'BACKEND', 'INTEGRACAO', 'FRONTEND', 'VALIDACAO', 'AGUARDANDO', 'CONCLUIDO', 'PAUSADO')),
  prioridade text NOT NULL DEFAULT 'MEDIA'
    CHECK (prioridade IN ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA')),
  progresso smallint NOT NULL DEFAULT 0 CHECK (progresso BETWEEN 0 AND 100),
  responsavel text,
  descricao text NOT NULL,
  proxima_etapa text,
  impedimentos text,
  data_inicio date,
  previsao_conclusao date,
  data_conclusao date,
  ordem integer NOT NULL DEFAULT 100,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.diretoria_desenvolvimento_atualizacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  desenvolvimento_id uuid NOT NULL REFERENCES public.diretoria_desenvolvimento(id) ON DELETE CASCADE,
  progresso_anterior smallint CHECK (progresso_anterior IS NULL OR progresso_anterior BETWEEN 0 AND 100),
  progresso_novo smallint CHECK (progresso_novo IS NULL OR progresso_novo BETWEEN 0 AND 100),
  status_anterior text,
  status_novo text,
  descricao text NOT NULL,
  autor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  autor_nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_diretoria_dev_status
  ON public.diretoria_desenvolvimento (status, prioridade, ativo);
CREATE INDEX IF NOT EXISTS idx_diretoria_dev_updated
  ON public.diretoria_desenvolvimento (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_diretoria_dev_atualizacoes_item
  ON public.diretoria_desenvolvimento_atualizacoes (desenvolvimento_id, created_at DESC);
CREATE OR REPLACE FUNCTION public.diretoria_desenvolvimento_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  IF NEW.status = 'CONCLUIDO' AND NEW.progresso < 100 THEN
    NEW.progresso = 100;
  END IF;
  IF NEW.status = 'CONCLUIDO' AND NEW.data_conclusao IS NULL THEN
    NEW.data_conclusao = CURRENT_DATE;
  END IF;
  IF NEW.status <> 'CONCLUIDO' THEN
    NEW.data_conclusao = NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_diretoria_desenvolvimento_updated_at
  ON public.diretoria_desenvolvimento;
CREATE TRIGGER trg_diretoria_desenvolvimento_updated_at
BEFORE UPDATE ON public.diretoria_desenvolvimento
FOR EACH ROW EXECUTE FUNCTION public.diretoria_desenvolvimento_set_updated_at();
ALTER TABLE public.diretoria_desenvolvimento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diretoria_desenvolvimento_atualizacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS diretoria_desenvolvimento_select_auth ON public.diretoria_desenvolvimento;
CREATE POLICY diretoria_desenvolvimento_select_auth
  ON public.diretoria_desenvolvimento
  FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS diretoria_desenvolvimento_insert_auth ON public.diretoria_desenvolvimento;
CREATE POLICY diretoria_desenvolvimento_insert_auth
  ON public.diretoria_desenvolvimento
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS diretoria_desenvolvimento_update_auth ON public.diretoria_desenvolvimento;
CREATE POLICY diretoria_desenvolvimento_update_auth
  ON public.diretoria_desenvolvimento
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS diretoria_desenvolvimento_delete_auth ON public.diretoria_desenvolvimento;
CREATE POLICY diretoria_desenvolvimento_delete_auth
  ON public.diretoria_desenvolvimento
  FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS diretoria_desenvolvimento_updates_select_auth ON public.diretoria_desenvolvimento_atualizacoes;
CREATE POLICY diretoria_desenvolvimento_updates_select_auth
  ON public.diretoria_desenvolvimento_atualizacoes
  FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS diretoria_desenvolvimento_updates_insert_auth ON public.diretoria_desenvolvimento_atualizacoes;
CREATE POLICY diretoria_desenvolvimento_updates_insert_auth
  ON public.diretoria_desenvolvimento_atualizacoes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diretoria_desenvolvimento TO authenticated;
GRANT SELECT, INSERT ON public.diretoria_desenvolvimento_atualizacoes TO authenticated;
COMMENT ON TABLE public.diretoria_desenvolvimento IS
  'Projetos, módulos, telas, integrações e melhorias em desenvolvimento no painel.';
COMMENT ON TABLE public.diretoria_desenvolvimento_atualizacoes IS
  'Linha do tempo de progresso dos itens acompanhados pela Diretoria.';
