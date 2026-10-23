-- Contato do atendente e regime tributário do fornecedor na resposta da cotação.
-- O índice por CNPJ serve ao preenchimento automático (razão social e regime) quando o fornecedor volta a cotar.
alter table public.compras_cotacao_respostas
  add column if not exists regime_tributario text check (regime_tributario in ('simples_nacional', 'lucro_presumido', 'lucro_real')),
  add column if not exists atendente_nome text,
  add column if not exists atendente_telefone text;

create index if not exists idx_compras_cotacao_respostas_cnpj on public.compras_cotacao_respostas (cnpj, atualizado_em desc);
