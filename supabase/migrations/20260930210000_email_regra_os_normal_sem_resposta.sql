-- A regra "Logística / OS / contrato" marcava todo e-mail de ordem de serviço como ALTA +
-- "precisa responder" (~5 mil e-mails, 60% da Central). Esses e-mails são encaminhados ao gestor,
-- não respondidos, e com ALTA em 62% da base os filtros de prioridade não separavam nada.
-- Passa a NORMAL, sem "precisa responder": ALTA/URGENTE ficam para o que a IA ou as palavras
-- de risco apontarem. Vale só para e-mails futuros; não reclassifica os já existentes.
update public.email_regras
   set prioridade_email = 'NORMAL',
       precisa_resposta = false
 where nome = 'Logística / OS / contrato';
