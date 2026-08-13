-- Achado 13/08 (Conferência > Lançar manualmente no GRM): vários lançamentos
-- "Outros" descrevem "Bônus ..." (ex.: "Bônus 60,00 Recebimento da lavoura",
-- "60,00 bônus por administrar e fazer lançamento de 5 embarques") mas o
-- valor real citado no texto nunca foi replicado pro campo Valor — todos
-- ficaram a R$ 0,00. No GRM existe a categoria "Bônus e Premiações" (nome
-- exato confirmado ao vivo no dropdown "Tipo da Despesa" de Caixa
-- Operacional em adm/team/staff).
--
-- Segue o mesmo padrão de EXTRA_COMBUSTIVEL/EXTRA_RECARGA/
-- EXTRA_LAVAGEM_VEICULO: mapeamento por palavra-chave na descrição
-- ("bônus"/"premiação") na Edge Function grm-liberacao-despesas-publicar
-- (deploy manual) + abre a categoria a R$ 0,00 quando o gestor ainda não
-- preencheu o valor, em vez de descartar o lançamento.
insert into public.grm_despesas_tipos_config (
  chave, origem, tipo_grm, valor_padrao, exibir, auto, carga_nhe, max_mov_dia, ativo, observacao
) values (
  'EXTRA_BONUS', 'EXTRA', 'Bônus e Premiações', '0.00', true, false, true, 1, true,
  'Mapeado quando OUTROS possui descrição explícita de "bônus"/"premiação" (nome exato confirmado no dropdown Tipo da Despesa do GRM). Abre a 0 quando o gestor ainda não replicou o valor citado no texto pro campo Valor — mesmo padrão de Lavanderia/Combustível/Recarga/Lavagem de Veículo.'
)
on conflict (chave) do update set
  tipo_grm = excluded.tipo_grm,
  valor_padrao = excluded.valor_padrao,
  ativo = excluded.ativo,
  observacao = excluded.observacao,
  updated_at = now();
