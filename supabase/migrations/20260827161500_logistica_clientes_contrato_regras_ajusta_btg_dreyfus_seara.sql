-- Checagem contra O.S. reais dos últimos 30 dias (27/08/2026) pra BTG,
-- SEARA (JBS) e DREYFUS (LDC) -- VITERRA ficou de fora, zero O.S. na base
-- nesse período.
--
--   BTG: 19/21 (90%) batiam com "P" maiúsculo + 5 dígitos + "." + 3
--     dígitos. As 2 exceções: "p40681.000" (P minúsculo) e "P39663.00" (só
--     2 dígitos depois do ponto). Regex passa a aceitar minúscula (validado
--     via flag 'i' no código, ver assets/js/logistica.js) e 2 ou 3 dígitos
--     finais.
--   DREYFUS (LDC): 137/142 (96%) batiam com o formato hifenizado exato. As
--     5 exceções eram "VAGOES"/"SAIDA VAGOES" (placeholder legítimo pra
--     O.S. de saída de vagão, sem contrato) ou o formato + "/ VAGOES"
--     junto. Regex passa a aceitar contrato no formato OU a palavra VAGOES
--     em qualquer lugar do texto.
--   SEARA (JBS): 0/72 batiam -- a planilha tinha 6 dígitos antes do 1º
--     ponto ("128100.01.01"), mas o padrão real é SEMPRE 5 dígitos
--     ("11952.04.01" etc, 69/72 = 96%). As outras 3: 2 são placeholder
--     "SEM CTR" (sem contrato) e 1 é typo (espaço em vez de ponto, não
--     acomodado). Regex corrigido pra 5 dígitos + aceita "SEM CTR".
update public.logistica_clientes_contrato_regras
set regex_formato = '^p[0-9]{5}\.[0-9]{2,3}$',
    observacao = 'Validado contra 30 dias de O.S. reais em 27/08/2026 (19/21 exatas); aceita "p" minúsculo (flag "i" no código) e 2 ou 3 dígitos depois do ponto.'
where cliente = 'BTG';

update public.logistica_clientes_contrato_regras
set regex_formato = '(^[0-9]{2}-[0-9]{4}-[0-9]{4}-[0-9]{4}$)|VAGOES',
    observacao = 'Validado contra 30 dias de O.S. reais em 27/08/2026 (137/142 exatas). "VAGOES"/"SAIDA VAGOES" é placeholder legítimo pra O.S. de saída de vagão sem contrato -- aceito em qualquer lugar do texto (case-insensitive via código).'
where cliente = 'DREYFUS (LDC)';

update public.logistica_clientes_contrato_regras
set regex_formato = '(^[0-9]{5}\.[0-9]{2}\.[0-9]{2}$)|SEM\s*CTR',
    exemplo_formato = '11952.04.01',
    observacao = 'Formato real tem 5 dígitos antes do 1º ponto (planilha original tinha 6, corrigido em 27/08/2026 contra 30 dias de O.S. reais -- 69/72 = 96% exatas). "SEM CTR" é placeholder legítimo aceito (case-insensitive via código).'
where cliente = 'SEARA (JBS)';
