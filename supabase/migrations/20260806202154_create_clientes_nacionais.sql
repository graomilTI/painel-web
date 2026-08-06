CREATE TABLE public.clientes_nacionais (
  id text PRIMARY KEY,
  grm_id integer NOT NULL UNIQUE,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clientes_nacionais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read clientes_nacionais"
  ON public.clientes_nacionais FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.clientes_nacionais IS 'Roster de Clientes Nacionais do GRM (grmserver.com.br/adm/clients/national), sincronizado manualmente em 06/08. ativo=false = linha bronze no GRM (sem filtro/relatório nativo). Usado por loadAberturaRefs() em logistica.js para esconder inativos do dropdown Contratante/Cliente.';;
