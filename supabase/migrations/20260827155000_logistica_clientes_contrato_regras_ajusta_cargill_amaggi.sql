-- A regra 'formato' de CARGILL e AMAGGI foi seedada em
-- 20260827150500 a partir de 1 exemplo por cliente numa planilha.
-- Checagem contra as O.S. reais dos últimos 30 dias (27/08/2026) mostrou
-- que o exemplo não é representativo:
--   AMAGGI: 0% das 20 O.S. com contrato eram só dígitos (o padrão real
--     dominante -- 70% -- é hifenizado, tipo "26-01-004-0312-1", com
--     quantidade de dígitos variável; resto é multi-contrato "/" ou
--     placeholder "auditoria").
--   CARGILL: só 55% das 144 O.S. batem com dígitos puros -- 31% têm letra
--     no final (ex. "1394304673A"), 6% são multi-contrato "/", 1% é
--     placeholder "SEM CTR".
-- Travar um regex nesses dois bloquearia solicitações reais e válidas.
-- Volta pra 'obrigatorio' (só exige preenchido, sem validar formato).
update public.logistica_clientes_contrato_regras
set tipo = 'obrigatorio', regex_formato = null, exemplo_formato = null,
    observacao = 'Formato de contrato variado na prática (checado nos últimos 30 dias de O.S. reais em 27/08/2026) -- não dá pra travar um padrão único sem bloquear solicitações válidas. Campo só obrigatório, sem validação de formato.'
where cliente in ('CARGILL', 'AMAGGI');
