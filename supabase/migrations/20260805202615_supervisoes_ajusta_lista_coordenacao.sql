-- Adiciona supervisões novas de Minas Gerais que ainda não existiam no catálogo.
insert into public.supervisoes (nome, ativo)
select v.nome, true
from (values
  ('MINAS GERAIS - Divisa Goiás'),
  ('MINAS GERAIS - Norte'),
  ('MINAS GERAIS - Sul')
) as v(nome)
where not exists (
  select 1 from public.supervisoes s
  where upper(trim(s.nome)) = upper(trim(v.nome))
);

-- Desativa supervisões mortas confirmadas: sem nenhum colaborador ativo vinculado
-- (verificado em colaboradores_atuais antes desta migração) e fora da lista oficial
-- de coordenação/supervisão vigente.
update public.supervisoes
set ativo = false
where upper(trim(nome)) in (
  'AGROTRADER',
  'MATOPIPA - GERAL',
  'MATOPIPA - MA/PI',
  'MATOPIPA - PARA NORTE',
  'MATOPIPA - SUL / TO'
);
;
