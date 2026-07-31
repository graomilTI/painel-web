
-- Remetentes
CREATE TABLE IF NOT EXISTS envios_remetentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cpf_cnpj text,
  logradouro text NOT NULL,
  numero text NOT NULL,
  complemento text,
  bairro text NOT NULL,
  cidade text NOT NULL,
  uf char(2) NOT NULL,
  cep text NOT NULL,
  telefone text,
  email text,
  ativo boolean NOT NULL DEFAULT true,
  padrao boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Destinatários
CREATE TABLE IF NOT EXISTS envios_destinatarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cpf_cnpj text,
  logradouro text NOT NULL,
  numero text NOT NULL,
  complemento text,
  bairro text NOT NULL,
  cidade text NOT NULL,
  uf char(2) NOT NULL,
  cep text NOT NULL,
  telefone text,
  email text,
  matricula text,
  origem text DEFAULT 'manual', -- 'manual' | 'colaborador'
  colaborador_id uuid,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Postagens
CREATE TABLE IF NOT EXISTS envios_postagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remetente_id uuid NOT NULL REFERENCES envios_remetentes(id),
  destinatario_id uuid NOT NULL REFERENCES envios_destinatarios(id),
  servico_codigo text NOT NULL, -- 03220=PAC, 03298=SEDEX, 61124=CartaRegAR, 65130=Telegrama
  servico_nome text NOT NULL,
  peso_gramas integer NOT NULL DEFAULT 0,
  formato text NOT NULL DEFAULT 'caixa', -- caixa | rolo | envelope
  altura_cm numeric,
  largura_cm numeric,
  comprimento_cm numeric,
  diametro_cm numeric,
  valor_declarado numeric DEFAULT 0,
  ar_digital boolean NOT NULL DEFAULT true,
  conteudo text,
  numero_objeto text, -- código de rastreio retornado pelo Correios
  id_prepostagem text, -- ID interno do Correios
  status text NOT NULL DEFAULT 'RASCUNHO', -- RASCUNHO | CONFIRMADO | POSTADO | EM_TRANSITO | ENTREGUE | DEVOLVIDO | ERRO
  valor_postagem numeric,
  observacoes text,
  confirmado_em timestamptz,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Rastreamento
CREATE TABLE IF NOT EXISTS envios_rastreamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  postagem_id uuid NOT NULL REFERENCES envios_postagens(id),
  numero_objeto text NOT NULL,
  evento_data timestamptz,
  evento_tipo text,
  evento_descricao text,
  evento_local text,
  raw_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Token cache Correios (para não reautenticar toda chamada)
CREATE TABLE IF NOT EXISTS envios_correios_token_cache (
  id integer PRIMARY KEY DEFAULT 1,
  token text NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE envios_remetentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE envios_destinatarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE envios_postagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE envios_rastreamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE envios_correios_token_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_remetentes" ON envios_remetentes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_destinatarios" ON envios_destinatarios FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_postagens" ON envios_postagens FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all_rastreamento" ON envios_rastreamento FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_role_token_cache" ON envios_correios_token_cache FOR ALL TO service_role USING (true) WITH CHECK (true);
;
