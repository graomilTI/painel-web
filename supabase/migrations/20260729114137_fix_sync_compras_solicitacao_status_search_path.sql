-- Checklist item #42 ("erro de tabela" em Compras): a trigger
-- sync_compras_solicitacao_status (AFTER INSERT/UPDATE em compras_itens)
-- tinha search_path salvo como uma única string malformada
-- "public, pg_temp" (schema literal inexistente), em vez de duas entradas
-- separadas. Isso fazia qualquer INSERT em compras_itens estourar
-- "relation compras_itens does not exist" dentro da própria trigger,
-- abortando a transação inteira mesmo com a tabela existindo normalmente.
alter function public.sync_compras_solicitacao_status() set search_path = public, pg_temp;;
