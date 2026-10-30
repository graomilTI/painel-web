-- Frotas · Checklist: coluna "Status" com a situação da corretiva pedida pelo checklist.
-- Quem só tem Cadastros (Checklists / Veículos) não lê frotas_manutencoes; esta função devolve só o necessário para a
-- sinalização: por veículo, a corretiva de origem 'checklist' em aberto (ou encerrada há até 15 dias).
-- Aberta primeiro; entre as abertas (ou entre as encerradas), a mais recente.

create or replace function public.frotas_checklist_manutencao_status(p_veiculos uuid[])
returns table (
  veiculo_id uuid,
  manutencao_id uuid,
  numero bigint,
  status text,
  solicitado_em timestamptz,
  previsao_entrega date,
  motivo_status text,
  atualizado_em timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (m.veiculo_id)
         m.veiculo_id, m.id, m.numero, m.status, m.solicitado_em, m.previsao_entrega, m.motivo_status,
         coalesce(m.concluida_em, m.updated_at)
    from public.frotas_manutencoes m
   where public.painel_has_module(array['frotas_manutencao', 'manutencao', 'frotas_checklists', 'checklists', 'frotas_veiculos', 'veiculos', 'veículos', 'frota_veiculos'], false)
     and m.veiculo_id = any (coalesce(p_veiculos, '{}'::uuid[]))
     and m.origem = 'checklist'
     and (m.status not in ('concluida', 'cancelada')
          or coalesce(m.concluida_em, m.updated_at) > now() - interval '15 days')
   order by m.veiculo_id,
            (m.status in ('concluida', 'cancelada')) asc,
            m.solicitado_em desc,
            m.id;
$$;

revoke all on function public.frotas_checklist_manutencao_status(uuid[]) from public, anon;
grant execute on function public.frotas_checklist_manutencao_status(uuid[]) to authenticated;
