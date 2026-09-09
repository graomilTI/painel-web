-- Pedido do usuário, 2026-09-09 (RH > Indisponibilidade > Atestados):
-- aceitar atestado de meio período (manhã/tarde), não só dia todo. Sem
-- coluna nova a UI não tinha onde guardar essa distinção.

alter table public.rh_atestados add column if not exists periodo text not null default 'integral';

alter table public.rh_atestados drop constraint if exists rh_atestados_periodo_check;
alter table public.rh_atestados add constraint rh_atestados_periodo_check
  check (periodo in ('integral', 'manha', 'tarde'));

update public.rh_atestados set periodo = 'integral' where periodo is null;
