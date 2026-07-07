-- As tabelas de staging dos agentes grm-sync (dump bruto, insert-only, nunca limpas)
-- cresceram muito (grm_lista_os_importacoes sozinha já tinha 917 mil linhas) e só tinham
-- índice em id. buscarUltimoLote() (usado por vários agentes/sincronizações, ver
-- grm-sync-operacional-os.js e assets/js/listaOsAgentSync.js) faz
-- "ORDER BY created_at DESC LIMIT 1" seguido de "WHERE created_at >= X ORDER BY created_at"
-- — sem índice isso vira table scan + sort completo, estourando o statement_timeout do
-- PostgREST/service_role assim que a tabela passa de algumas centenas de milhares de linhas.
create index if not exists idx_grm_lista_os_importacoes_created_at on public.grm_lista_os_importacoes (created_at);
create index if not exists idx_grm_distribuicao_os_importacoes_created_at on public.grm_distribuicao_os_importacoes (created_at);
create index if not exists idx_grm_mapa_embarque_importacoes_created_at on public.grm_mapa_embarque_importacoes (created_at);
create index if not exists idx_grm_locais_embarque_importacoes_created_at on public.grm_locais_embarque_importacoes (created_at);
