-- Adiciona admissao, desligamento, complemento, data_nascimento à view.
-- Motivo: vários consumidores que ainda liam colaborador_snapshot direto
-- (consultarColaboradores.js, modules/contatos.js, modules/exportacoes-bot.js,
-- programacao*.js) precisam dessas colunas, e devem ler da VIEW (não da tabela
-- colaboradores crua) porque só a view normaliza o cpf mascarado dos ~731
-- registros "Ativo" ainda não resincronizados desde o fix no script de sync.
-- Nenhuma coluna nova aqui é mais sensível do que o que authenticated já
-- enxerga direto em public.colaboradores (mesma RLS, select true).
create or replace view public.colaboradores_atuais as
select
  id,
  nome,
  regexp_replace(coalesce(cpf, ''), '\D', '', 'g') as cpf,
  tipo,
  cargo,
  supervisao,
  coordenacao,
  empresa,
  situacao,
  (situacao = 'Ativo') as ativo,
  current_date as data_referencia,
  whatsapp,
  email_pessoal,
  email_empresa,
  endereco,
  bairro,
  cidade,
  estado,
  cep,
  admissao,
  desligamento,
  complemento,
  data_nascimento
from public.colaboradores;
