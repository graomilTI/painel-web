-- Agendamento da instalação do rastreador: além da data e do local (já existentes), guarda a hora e o técnico.
-- Alimentado pela edição do veículo (Frotas > Cadastros > Veículos) e pela edição do rastreador; a Agenda e o
-- feed .ics leem estas colunas. Mesmo formato de hora_agendada da manutenção (texto HH:MM).
alter table public.frotas_rastreadores
  add column if not exists hora_instalacao text,
  add column if not exists tecnico_instalacao text;
