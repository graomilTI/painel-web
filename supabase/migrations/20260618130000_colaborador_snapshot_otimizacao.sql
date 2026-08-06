-- Otimização da leitura de colaborador_snapshot
-- Contexto: 50k linhas (4.4k colaboradores x 21 snapshots diários).
-- O painel sempre consome só a foto mais recente, mas vários módulos
-- faziam select('*').limit(5000) sobre a tabela inteira + autocomplete
-- com ilike '%nome%' (seq scan). Era a query #1 em custo do banco.

-- ─── View: apenas a foto mais recente (4.4k linhas em vez de 50k) ─────────────
-- Elimina o padrão de "buscar última data_referencia + filtrar" (query dupla).
create or replace view public.colaboradores_atuais as
select *
from public.colaborador_snapshot
where data_referencia = (select max(data_referencia) from public.colaborador_snapshot);
-- ─── Índice trigram para autocomplete ilike '%nome%' ─────────────────────────
-- O índice btree existente (idx_colab_snapshot_nome) não cobre '%termo%'.
create extension if not exists pg_trgm;
-- NOTA: criado em produção via CREATE INDEX CONCURRENTLY (fora de transação).
-- Mantido aqui sem CONCURRENTLY para reprodutibilidade em ambientes novos.
create index if not exists idx_colab_snapshot_nome_trgm
  on public.colaborador_snapshot using gin (nome gin_trgm_ops);
-- ─── Higiene: índice duplicado de data_referencia ────────────────────────────
-- idx_colab_snapshot_data e idx_colab_snapshot_data_ref são idênticos
-- (ambos btree em data_referencia DESC). Remover um reduz custo de escrita.
-- Aplicar manualmente fora de transação:
--   drop index concurrently if exists public.idx_colab_snapshot_data;;
