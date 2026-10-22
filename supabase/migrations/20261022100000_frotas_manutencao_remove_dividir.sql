-- Frotas · Manutenção: a Corretiva deixou de ter a etapa de Solicitações (quem registra é da equipe de Frotas, então a
-- manutenção nasce em Cotações). A separação dos itens marcados (20261021140000) não é mais usada: sai a função e a coluna.
-- notificar_frotas_manutencao() mantém a trava de flag (inofensiva).
drop function if exists public.frotas_manutencao_dividir(uuid, jsonb);
drop index if exists public.idx_frotas_manutencoes_dividida_de;
alter table public.frotas_manutencoes drop column if exists dividida_de;
