-- Opcional, mas recomendado se a tabela relatorio_resultado_diario estiver grande.
-- Execute no SQL Editor do Supabase uma única vez.

create index if not exists idx_relatorio_resultado_diario_data
on public.relatorio_resultado_diario (data);
