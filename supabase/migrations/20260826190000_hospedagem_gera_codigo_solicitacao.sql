-- hospedagem_solicitacoes.codigo sempre veio null: nenhuma trigger/default nunca gerou esse
-- valor (nem hospedagem_criar_solicitacao nem o insert direto via Programação preenchem),
-- então toda solicitação (as 176 antigas + as novas da tela do Gestor) aparecia com "—" no
-- lugar do código em adm-hotel.html e em "Minhas solicitações". Gera automaticamente daqui
-- pra frente e faz backfill do histórico, na ordem de criação.

create sequence if not exists public.hospedagem_solicitacoes_codigo_seq;

create or replace function public.hospedagem_gerar_codigo_solicitacao()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.codigo is null then
    new.codigo := 'HSP-' || lpad(nextval('public.hospedagem_solicitacoes_codigo_seq')::text, 6, '0');
  end if;
  return new;
end;
$function$;

create trigger trg_hospedagem_gerar_codigo
  before insert on public.hospedagem_solicitacoes
  for each row
  execute function public.hospedagem_gerar_codigo_solicitacao();

-- Backfill do histórico, na ordem de criação. Atribui os números diretamente (não via
-- nextval() por linha, cuja ordem de avaliação não é garantida acompanhar created_at) e só
-- depois avança a sequência pro próximo valor livre, pra trigger continuar sem colidir.
do $$
declare
  v_count bigint;
begin
  with numerado as (
    select id, row_number() over (order by created_at, id) as rn
    from public.hospedagem_solicitacoes
    where codigo is null
  )
  update public.hospedagem_solicitacoes s
  set codigo = 'HSP-' || lpad(n.rn::text, 6, '0')
  from numerado n
  where n.id = s.id;

  select count(*) into v_count from public.hospedagem_solicitacoes where codigo like 'HSP-%';
  if v_count > 0 then
    perform setval('public.hospedagem_solicitacoes_codigo_seq', v_count, true);
  end if;
end $$;

alter table public.hospedagem_solicitacoes
  add constraint hospedagem_solicitacoes_codigo_key unique (codigo);
