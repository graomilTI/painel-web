-- Limpa do geocode_cache as falhas gravadas enquanto o Nominatim barrava o IP de saída das
-- Edge Functions do Supabase (HTTP 403 "Access denied").
--
-- As funções geocode-operacional-os, geocode-colaboradores e geocode-colaborador-base tratavam
-- qualquer resposta que não fosse 200 como "endereço não encontrado" e gravavam status 'erro'
-- no cache, que só é reavaliado depois de 7 dias. Em produção o último 'ok' dessas famílias é de
-- 23/09/2026 (os_embarque: 23:50 UTC; CEP: 11:14 UTC) e o primeiro 'erro' depois disso, de
-- 24/09 10:50 UTC; sem nenhum 'ok' desde então, todo 'erro' dessa janela é falha do provedor.
--
-- As funções passaram a tratar 403/429/5xx/timeout como falha transitória (não gravam no
-- cache), então esta limpeza é única: apaga só 'erro' de os_embarque:* e de CEP (8 dígitos),
-- a partir de 24/09/2026 00:00 UTC, pra essas localidades serem tentadas de novo.
-- Não toca em 'ok', em 'erro' anterior à janela (falha real) nem em uber_endereco:* (o agente
-- do Uber já distingue falha transitória de "não encontrado").
--
-- Aplicar com `supabase db query --linked -f` (nunca `db push`) DEPOIS do deploy das funções,
-- senão a versão antiga, que roda no pg_cron, grava os erros de novo.
delete from public.geocode_cache
where status = 'erro'
  and atualizado_em >= timestamptz '2026-09-24 00:00:00+00'
  and (left(chave, 12) = 'os_embarque:' or chave ~ '^[0-9]{8}$');
