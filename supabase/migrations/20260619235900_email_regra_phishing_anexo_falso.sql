-- E-mails de phishing usam um botao de "anexo" falso (HTML/CSS) que linka para
-- um host externo em vez de um anexo MIME real, por isso nunca aparecem em
-- email_attachments. A regra abaixo marca esse padrao como risco alto/critico
-- assim que classificado, sem depender de haver anexo de verdade no e-mail.
alter table public.email_regras
  add column if not exists risco text check (risco is null or risco in ('BAIXO', 'MEDIO', 'ALTO', 'CRITICO'));

-- secureserver.net e o link malicioso comum a toda a campanha (faturas falsas,
-- DocuSign falso, Certisign falso, "Reclame Aqui" falso, etc.), por isso e o
-- principal indicador -- nao restringimos por remetente, que muda a cada lote.
insert into public.email_regras (nome, prioridade, palavras_chave, categoria, prioridade_email, precisa_resposta, risco)
values
  ('Phishing: fatura/anexo falso', 5,
   array['secureserver.net', 'class="attachment"', 'compraspagar', 'aviso documentos em anexo'],
   'PHISHING', 'URGENTE', false, 'CRITICO')
on conflict do nothing;
