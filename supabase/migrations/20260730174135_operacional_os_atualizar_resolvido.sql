alter table public.operacional_os
  add column if not exists atualizar_resolvido_tipo text,
  add column if not exists atualizar_resolvido_em timestamptz,
  add column if not exists atualizar_resolvido_por uuid;

comment on column public.operacional_os.atualizar_resolvido_tipo is 'saldo|conferencia|finalizar — marcado pela Logística ADM quando resolve uma solicitação enviada pelo Gestor > Logística > Atualizar; some quando o gestor confirma (OK) e o registro é limpo por completo.';
comment on column public.operacional_os.atualizar_resolvido_em is 'Quando a Logística ADM concluiu a ação — enquanto não nulo, a aba Atualizar do Gestor mostra o item em verde com botão OK até o gestor confirmar.';;
