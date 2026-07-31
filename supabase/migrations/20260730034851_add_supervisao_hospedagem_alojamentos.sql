
alter table hospedagem_alojamentos add column if not exists supervisao text;
create index if not exists idx_hospedagem_alojamentos_supervisao on hospedagem_alojamentos (supervisao);
;
