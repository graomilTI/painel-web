alter table public.logistica_relatorios_destinatarios
  add column if not exists grupo text;

comment on column public.logistica_relatorios_destinatarios.grupo is
  'Subgrupo de envio dentro do mesmo cliente (ex.: COFCO manda 3 e-mails separados: GERAL/PR/MT, um por grupo). NULL = cliente manda 1 e-mail só pra todos os ativos.';;
