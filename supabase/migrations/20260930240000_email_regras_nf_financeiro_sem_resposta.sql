-- Mesmo raciocínio da regra de OS (20260930210000): e-mails de nota fiscal/XML e de financeiro
-- (boletos, comprovantes) são conferidos internamente/encaminhados, não respondidos um a um.
-- Com "precisa responder" ligado todos entravam como RESPONDER e inflavam a fila de pendentes.
-- Vale só para e-mails futuros; a prioridade (NORMAL) não muda.
update public.email_regras
   set precisa_resposta = false
 where nome in ('Notas fiscais e XML', 'Financeiro / comprovantes');
