-- Frotas · Rastreadores · Manutenção: status escolhido pelo usuário (Pendente / Motorista OK / Técnico OK / Agendado).
-- Até aqui o status era só derivado dos campos preenchidos; agora é gravado e editável na modal Editar.
-- As manutenções existentes recebem o mesmo status que a tela já mostrava, para nada mudar sozinho.

alter table public.frotas_rastreadores_manutencoes
  add column if not exists status_manut text not null default 'pendente';

update public.frotas_rastreadores_manutencoes
   set status_manut = case
     when data_agendada is not null then 'agendado'
     when nullif(btrim(coalesce(tecnico_nome, '')), '') is not null then 'tecnico'
     when nullif(btrim(coalesce(disponibilidade_motorista, '')), '') is not null then 'motorista'
     else 'pendente'
   end;

alter table public.frotas_rastreadores_manutencoes
  drop constraint if exists frotas_rastr_manut_status_manut_check;
alter table public.frotas_rastreadores_manutencoes
  add constraint frotas_rastr_manut_status_manut_check
  check (status_manut in ('pendente', 'motorista', 'tecnico', 'agendado'));
