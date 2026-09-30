-- Arquivamento em bloco (decisão de 30/09/2026): e-mails da Central (escopo CENTRAL) ainda
-- pendentes (NOVO/PENDENTE/RESPONDER) recebidos há mais de 30 dias. Nada é apagado. Cada e-mail
-- ganha uma linha em email_historico com o status anterior, o que permite reverter:
--   update email_messages m set status = (h.detalhes->>'status_anterior')
--     from email_historico h
--    where h.email_id = m.id and h.detalhes->>'motivo' = 'passivo +30 dias 30/09/2026' and m.status = 'ARQUIVADO';
with alvo as (
  select m.id, m.status
    from public.email_messages m
    join public.email_accounts a on a.id = m.account_id
   where a.escopo = 'CENTRAL'
     and m.status in ('NOVO', 'PENDENTE', 'RESPONDER')
     and m.data_recebimento < now() - interval '30 days'
), upd as (
  update public.email_messages m
     set status = 'ARQUIVADO', updated_at = now()
    from alvo
   where m.id = alvo.id
  returning m.id, alvo.status as anterior
)
insert into public.email_historico (email_id, usuario_nome, acao, detalhes)
select id, 'Arquivamento em bloco (TI)', 'ATUALIZACAO_MANUAL',
       jsonb_build_object('status', 'ARQUIVADO', 'status_anterior', anterior, 'lote', true, 'motivo', 'passivo +30 dias 30/09/2026')
  from upd;
