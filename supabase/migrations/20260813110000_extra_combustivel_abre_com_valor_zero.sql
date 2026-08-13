-- Achado 13/08: uma despesa "Outros" com descrição "Combustível" (colaborador
-- usando veículo particular) foi lançada com valor 0 (o gestor ainda não sabia
-- o valor exato) e sumiu silenciosamente — não foi lançada automaticamente no
-- GRM nem apareceu como pendência manual na Conferência, porque
-- isExtraOutrosNaoMapeado (assets/js/adm-conferencia.js) já considera
-- "combustível" na descrição como mapeado, mas o agente
-- (grm-liberacao-despesas-publicar) só abria a categoria com valor > 0.
--
-- Igual já acontecia com Reembolso KM/Uber/Lavanderia, EXTRA_COMBUSTIVEL passa
-- a abrir a 0 também (fix correspondente na Edge Function
-- grm-liberacao-despesas-publicar, deploy manual — este arquivo documenta e
-- versiona a mudança de dado feita direto no banco).
update public.grm_despesas_tipos_config
set valor_padrao = '0.00',
    observacao = 'Mapeado quando OUTROS possui descrição explícita de combustível. Abre a 0 quando o gestor ainda não informou valor (mesmo padrão de Lavanderia/Reembolso KM/Uber) — complementar com o valor real depois.',
    updated_at = now()
where chave = 'EXTRA_COMBUSTIVEL';
