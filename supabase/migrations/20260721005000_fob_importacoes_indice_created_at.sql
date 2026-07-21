-- Índices de created_at que faltavam em grm_producao_diaria_importacoes (7,8M
-- linhas) e grm_nhe_importacoes — grm_mapa_embarque_importacoes já tinha
-- (idx_grm_mapa_embarque_importacoes_created_at). A ausência desses dois é o
-- motivo pelo qual o código do FOB (logistica-fob-page-v9.js) historicamente
-- evitava "order by created_at" (dava statement timeout) e usava um hack por
-- `id` que se provou incorreto (id é uuid v4 aleatório, sem relação com
-- tempo — ver migração fob_lote_recente_fix_e_producao_vencedor).
--
-- NOTA DE APLICAÇÃO: em produção estes índices foram criados via
-- `CREATE INDEX CONCURRENTLY` (fora de transação, direto via execute_sql) pra
-- não bloquear escritas na tabela de 7,8M linhas enquanto o índice é
-- construído. Esta migração usa a forma normal (sem CONCURRENTLY) porque o
-- runner de migração aplica dentro de uma transação, onde CONCURRENTLY não é
-- permitido — aceitável para ambientes novos/menores (dev, restore), onde o
-- lock breve durante a criação não é um problema real.
create index if not exists idx_grm_producao_diaria_importacoes_created_at
  on public.grm_producao_diaria_importacoes using btree (created_at desc);

create index if not exists idx_grm_nhe_importacoes_created_at
  on public.grm_nhe_importacoes using btree (created_at desc);
