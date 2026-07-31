
-- Logística Reversa: cliente devolve para empresa
CREATE TABLE IF NOT EXISTS envios_reversa (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID REFERENCES envios_destinatarios(id) ON DELETE SET NULL,
  empresa_id UUID REFERENCES envios_remetentes(id) ON DELETE SET NULL,
  servico_codigo TEXT NOT NULL DEFAULT '03312',
  servico_nome TEXT,
  peso_gramas INTEGER DEFAULT 300,
  conteudo TEXT,
  numero_objeto TEXT,
  id_prepostagem TEXT,
  status TEXT NOT NULL DEFAULT 'RASCUNHO',
  valor_postagem NUMERIC(10,2),
  observacoes TEXT,
  confirmado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Telegramas via SMT
CREATE TABLE IF NOT EXISTS envios_telegramas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  remetente_id UUID REFERENCES envios_remetentes(id) ON DELETE SET NULL,
  destinatario_id UUID REFERENCES envios_destinatarios(id) ON DELETE SET NULL,
  dest_nome TEXT,
  dest_cep TEXT,
  dest_logradouro TEXT,
  dest_numero TEXT,
  dest_complemento TEXT,
  dest_bairro TEXT,
  dest_cidade TEXT,
  dest_uf TEXT,
  mensagem TEXT NOT NULL,
  tem_pc BOOLEAN NOT NULL DEFAULT false,
  tem_cc BOOLEAN NOT NULL DEFAULT false,
  agendamento TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'RASCUNHO',
  protocolo TEXT,
  id_telegrama TEXT,
  numero_objeto TEXT,
  valor_postagem NUMERIC(10,2),
  observacoes TEXT,
  confirmado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
;
