-- Liga um financeiro_pagamentos de COMPRAS aos compras_itens que o compõem
-- (origem_id só guarda 1 id — insuficiente pra lote com vários itens). Usado
-- pra: (a) deduplicar a exibição no Financeiro entre o registro real e a
-- listagem "sintética" derivada direto de compras_itens; (b) propagar a
-- recusa do Financeiro de volta pros itens certos.
alter table public.financeiro_pagamentos add column compras_item_ids uuid[];

-- Status novo: recusa feita pelo Financeiro (distinto de 'recusado', que é
-- recusa do próprio Compras antes de comprar).
alter table public.compras_itens drop constraint if exists compras_itens_status_check;
alter table public.compras_itens add constraint compras_itens_status_check
  check (status in (
    'pendente','em_cotacao','em_analise','pendente_pagamento',
    'aguardando_termo','aguardando_nf','comprado','recusado',
    'concluido','cancelado','recusado_financeiro'
  ));

create or replace function public.sync_compras_solicitacao_status()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_status text;
begin
  select
    case
      when bool_and(status = 'concluido') then 'concluido'
      when bool_and(status = 'comprado') then 'comprado'
      when bool_and(status = 'recusado') then 'recusado'
      when bool_and(status = 'recusado_financeiro') then 'recusado_financeiro'
      when bool_and(status = 'cancelado') then 'cancelado'
      when bool_or(status = 'aguardando_nf') then 'aguardando_nf'
      when bool_or(status = 'aguardando_termo') then 'aguardando_termo'
      when bool_or(status = 'pendente_pagamento') then 'pendente_pagamento'
      when bool_or(status = 'em_analise') then 'em_analise'
      when bool_or(status = 'em_cotacao') then 'em_cotacao'
      else 'pendente'
    end
  into v_status
  from compras_itens
  where solicitacao_id = new.solicitacao_id;

  update compras_solicitacoes
  set status = v_status
  where id = new.solicitacao_id;

  return new;
end;
$function$;

-- compras_solicitacoes.status também precisa aceitar o novo valor (a trigger
-- acima grava lá quando todos os itens da solicitação estão recusado_financeiro).
alter table public.compras_solicitacoes drop constraint if exists compras_solicitacoes_status_check;
alter table public.compras_solicitacoes add constraint compras_solicitacoes_status_check
  check (status in (
    'pendente','em_cotacao','em_analise','pendente_pagamento',
    'aguardando_termo','aguardando_nf','comprado','recusado',
    'concluido','cancelado','aberto','recusado_financeiro'
  ));
