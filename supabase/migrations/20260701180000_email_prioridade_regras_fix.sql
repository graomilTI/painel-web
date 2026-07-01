-- As regras novas (QUALIDADE/LOGISTICA) precisam ser checadas ANTES de NOTAS FISCAIS e
-- FINANCEIRO, porque e-mails de embarque/qualidade quase sempre citam nota fiscal ou valor
-- no corpo e estavam sendo roubados pelas regras genéricas antes de chegar na regra certa.
update public.email_regras set prioridade = 6, updated_at = now() where nome = 'Proposta comercial (interno)';
update public.email_regras set prioridade = 8, updated_at = now() where nome = 'Qualidade / carga recusada';
update public.email_regras set prioridade = 9, updated_at = now() where nome = 'Logística / OS / contrato';
update public.email_regras set prioridade = 15, updated_at = now() where nome = 'Notas fiscais e XML';
update public.email_regras set prioridade = 20, updated_at = now() where nome = 'Financeiro / comprovantes';

-- O padrão de assunto mais comum do o9solutions.com ("PROGRAMAÇÃO {código} - Grao1000")
-- não contém "embarque" em lugar nenhum, então nunca batia com as palavras-chave da regra
-- de Logística. Como 100% do histórico desse remetente é conteúdo de logística/frete, uma
-- regra por remetente resolve sem depender de adivinhar todas as variações de assunto.
insert into public.email_regras (nome, prioridade, palavras_chave, remetente_contem, categoria, prioridade_email, precisa_resposta, destino_regional)
values (
  'Logística / O9 Solutions (todo remetente)',
  11,
  array[]::text[],
  'o9solutions.com',
  'LOGÍSTICA',
  'NORMAL',
  false,
  true
)
on conflict do nothing;
