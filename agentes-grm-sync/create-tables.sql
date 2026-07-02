-- Tabela: grm_producao_diaria_importacoes
CREATE TABLE IF NOT EXISTS grm_producao_diaria_importacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_sincronizacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  periodo_de DATE,
  periodo_ate DATE,
  funcionario TEXT,
  dia DATE,
  os TEXT,
  producao NUMERIC,
  dados_json JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela: grm_locais_embarque_importacoes
CREATE TABLE IF NOT EXISTS grm_locais_embarque_importacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_sincronizacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  data_solicitacao_de DATE,
  data_solicitacao_ate DATE,
  cliente_nacional TEXT,
  produto TEXT,
  coordenacao TEXT,
  servico TEXT,
  local_tipo_servico TEXT,
  uf TEXT,
  dados_json JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela: grm_resultado_diario_importacoes
CREATE TABLE IF NOT EXISTS grm_resultado_diario_importacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_sincronizacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  data_classificacao_de DATE,
  data_classificacao_ate DATE,
  incluir_valores TEXT,
  cliente_nacional TEXT,
  uf_embarque TEXT,
  uf_destino TEXT,
  produto TEXT,
  coordenacao TEXT,
  resultado NUMERIC,
  dados_json JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela: grm_despesas_importacoes
CREATE TABLE IF NOT EXISTS grm_despesas_importacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_sincronizacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  data_conta_de DATE,
  data_conta_ate DATE,
  coordenacao TEXT,
  supervisao TEXT,
  funcionario TEXT,
  fornecedor TEXT,
  grupo_categoria TEXT,
  categoria TEXT,
  vincular_caixa_operacional TEXT,
  valor NUMERIC,
  dados_json JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela: grm_notas_fiscais_importacoes
CREATE TABLE IF NOT EXISTS grm_notas_fiscais_importacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_sincronizacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  data_nota_de DATE,
  data_nota_ate DATE,
  data_fatura_de DATE,
  data_fatura_ate DATE,
  cliente_nacional TEXT,
  numero_nf TEXT,
  valor_total NUMERIC,
  dados_json JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_grm_producao_diaria_periodo ON grm_producao_diaria_importacoes(periodo_de, periodo_ate);
CREATE INDEX IF NOT EXISTS idx_grm_locais_embarque_data ON grm_locais_embarque_importacoes(data_solicitacao_de, data_solicitacao_ate);
CREATE INDEX IF NOT EXISTS idx_grm_resultado_diario_data ON grm_resultado_diario_importacoes(data_classificacao_de, data_classificacao_ate);
CREATE INDEX IF NOT EXISTS idx_grm_despesas_data ON grm_despesas_importacoes(data_conta_de, data_conta_ate);
CREATE INDEX IF NOT EXISTS idx_grm_notas_fiscais_nota ON grm_notas_fiscais_importacoes(data_nota_de, data_nota_ate);

-- Ativar RLS (Row Level Security) se necessário
ALTER TABLE grm_producao_diaria_importacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE grm_locais_embarque_importacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE grm_resultado_diario_importacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE grm_despesas_importacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE grm_notas_fiscais_importacoes ENABLE ROW LEVEL SECURITY;
