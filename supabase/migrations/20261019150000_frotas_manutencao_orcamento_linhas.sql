-- Frotas · Manutenção: linhas do orçamento por item (marca/observação e valor de cada peça ou serviço).
-- Ex.: Kit de embreagem (LUK) 754,80 · Cabo da embreagem (Cabovel) 175,40 · Óleo 75W80 (Petronas) 83,80 = 1.014,00.
-- A tela soma as linhas em "Peças" e no total; o banco guarda as linhas para mostrar na ficha e comparar orçamentos.
alter table public.frotas_manutencao_orcamentos
  add column if not exists linhas jsonb not null default '[]'::jsonb
    check (jsonb_typeof(linhas) = 'array');

comment on column public.frotas_manutencao_orcamentos.linhas is
  'Linhas do orçamento: [{nome, detalhe, valor}], um por peça/serviço (detalhe = marca ou observação). A soma vai em valor_pecas.';
