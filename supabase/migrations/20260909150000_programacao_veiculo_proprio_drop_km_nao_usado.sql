-- A coluna km (adicionada em 20260909140000) não era usada em nenhum cálculo
-- (nem no fallback da Edge Function operacional-mapa-rotas, que só lê
-- tipo_deslocamento) e o usuário pediu pra simplificar a linha de
-- Conferência > Deslocamento > Configuração pra Colaborador/Tipo/Tarifa R$/km.
alter table public.programacao_veiculo_proprio drop column if exists km;
