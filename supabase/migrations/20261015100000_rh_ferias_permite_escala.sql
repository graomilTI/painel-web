-- Pedido do usuário, 2026-10-15 (RH > Indisponibilidade > Férias): colaborador
-- que "tira" férias mas continua trabalhando precisa poder embarcar em O.S.
-- Até aqui qualquer férias Programada/Em gozo tirava a pessoa da sugestão de
-- candidatos, do roster e do Sem O.S. Agora o lançamento de férias pode ser
-- marcado como "pode ser escalado": as férias continuam registradas pro RH,
-- mas deixam de bloquear a Programação durante o período.
--
-- Quem liberou, por quê e quando ficam gravados (rastreabilidade).

alter table public.rh_ferias add column if not exists permite_escala boolean not null default false;
alter table public.rh_ferias add column if not exists escala_autorizado_por text;
alter table public.rh_ferias add column if not exists escala_motivo text;
alter table public.rh_ferias add column if not exists escala_liberada_em timestamptz;
alter table public.rh_ferias add column if not exists escala_liberada_por uuid;

alter table public.rh_ferias drop constraint if exists rh_ferias_permite_escala_check;
alter table public.rh_ferias add constraint rh_ferias_permite_escala_check
  check (
    not permite_escala
    or (nullif(btrim(escala_autorizado_por), '') is not null and nullif(btrim(escala_motivo), '') is not null)
  );

comment on column public.rh_ferias.permite_escala is
  'true = colaborador pode ser escalado em O.S. durante este período de férias (não bloqueia a Programação)';
