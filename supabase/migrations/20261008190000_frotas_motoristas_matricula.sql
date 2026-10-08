-- Frotas > Motoristas: campo "Matrícula" (texto livre, preenchido no cadastro do motorista).
-- Não é única nem obrigatória: a base de colaboradores do painel não traz matrícula, então
-- quem cadastra o motorista digita.
alter table public.frotas_motoristas
  add column if not exists matricula text;

comment on column public.frotas_motoristas.matricula is 'Matrícula do motorista (digitada no cadastro de Frotas > Motoristas).';
