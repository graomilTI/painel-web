-- Adiciona campo de supervisão/regional ao cadastro de alojamentos.
-- Sem isso não havia nenhum vínculo entre um alojamento e a regional do
-- gestor que deveria vê-lo/gerenciá-lo na nova aba Alojamento de
-- Gestor > Hospedagem (só existia cidade/UF).
alter table hospedagem_alojamentos add column if not exists supervisao text;
create index if not exists idx_hospedagem_alojamentos_supervisao on hospedagem_alojamentos (supervisao);
