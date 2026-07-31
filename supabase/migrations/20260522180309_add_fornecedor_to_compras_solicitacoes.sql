ALTER TABLE compras_solicitacoes
  ADD COLUMN IF NOT EXISTS fornecedor text,
  ADD COLUMN IF NOT EXISTS telefone_fornecedor text;;
