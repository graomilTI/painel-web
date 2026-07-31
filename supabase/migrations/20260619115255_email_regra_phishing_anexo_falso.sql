alter table public.email_regras
  add column if not exists risco text check (risco is null or risco in ('BAIXO', 'MEDIO', 'ALTO', 'CRITICO'));

insert into public.email_regras (nome, prioridade, palavras_chave, remetente_contem, categoria, prioridade_email, precisa_resposta, risco)
values
  ('Phishing: fatura/anexo falso', 5,
   array['aviso documentos em anexo', 'secureserver.net', 'compraspagar'],
   'compraspagar',
   'PHISHING', 'URGENTE', false, 'CRITICO')
on conflict do nothing;;
