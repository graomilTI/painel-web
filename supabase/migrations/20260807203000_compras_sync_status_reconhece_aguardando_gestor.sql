-- Fix: sync_compras_solicitacao_status() (trigger compras_itens_status_sync,
-- criado fora do versionamento junto com compras_itens/compras_solicitacoes)
-- não reconhecia o novo status 'aguardando_gestor' (etapa de aprovação do
-- Gestor para EPI, ver epiRh.js/compras-epi-gestor.js) e caía no ELSE,
-- forçando o header pra 'pendente' assim que o RH inseria os itens — o que
-- quebraria silenciosamente o bucket "Aguardando Gestor" (RH), a aba
-- "Aguardando decisão" (Gestor > Compras > EPI) e o guard de
-- compare-and-swap contra decisão dupla, todos baseados em
-- compras_solicitacoes.status. Descoberto simulando o ciclo via SQL antes
-- do deploy (não havia CREATE TABLE/TRIGGER versionado pra essas tabelas).
--
-- Mudança: adiciona um bool_and no topo do CASE — só se aplica quando TODOS
-- os itens da solicitação ainda estão aguardando o gestor (o mesmo padrão
-- "ALL" já usado pra concluido/comprado/recusado). Resto da função idêntico.
--
-- Aproveitando a mesma cirurgia: 'cancelado' (usado por epiRh.js
-- cancelarSolicitacao) tinha o MESMO bug — também caía no ELSE e forçava
-- 'pendente' no header, quebrando silenciosamente a aba "Cancelados" do RH.
-- Nunca detectado em produção porque nenhuma solicitação de EPI havia sido
-- cancelada até agora (confirmado: 0 linhas com todos os itens 'cancelado').
-- Adicionado bool_and(status = 'cancelado') pelo mesmo motivo.

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
      when bool_and(status = 'aguardando_gestor') then 'aguardando_gestor'
      when bool_and(status = 'concluido') then 'concluido'
      when bool_and(status = 'comprado') then 'comprado'
      when bool_and(status = 'recusado') then 'recusado'
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
