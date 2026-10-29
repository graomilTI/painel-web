-- Checklist do app: placa digitada errada corrigida pela mais parecida do cadastro.
-- O motorista digita a placa no app e erra um caractere (ex.: IIU6H07 em vez de IUU6H07). O sync liga a resposta à placa do
-- cadastro com no máximo 1 caractere de diferença, desde que seja a única; guarda aqui o que foi digitado.

alter table public.frotas_checklist_respostas
  add column if not exists placa_original text,
  add column if not exists placa_aproximada boolean not null default false;

comment on column public.frotas_checklist_respostas.placa_original is
  'Placa como veio do app quando foi corrigida pela mais parecida do cadastro (placa_aproximada = true).';
