-- Ajustes pontuais encontrados durante a validação cruzada da planilha com a agenda de contatos.
begin;

-- Abreulândia pertence ao TO; o DDD 63 e o contato com o mesmo hotel/telefone confirmam o vínculo.
update public.hospedagem_hoteis
set
  cidade = 'ABREULÂNDIA',
  uf = 'TO',
  whatsapp = case
    when nullif(trim(coalesce(whatsapp, '')), '') is null then '+5563992422132'
    else whatsapp
  end
where lower(trim(coalesce(link_maps, ''))) = lower('https://maps.app.goo.gl/oh7HbfPxR8j7L7Gm6');

-- Correção de grafia da cidade de Cabeceiras/GO.
update public.hospedagem_hoteis
set cidade = 'CABECEIRAS'
where lower(trim(coalesce(link_maps, ''))) = lower('https://maps.app.goo.gl/XXVFFVEAR3AZhCy9A');

-- O cadastro trazia primeiro R$ 134,00 e depois R$ 601,00 para a mesma diária.
-- O segundo valor é um outlier evidente e foi tratado como erro de digitação.
update public.hospedagem_hoteis
set
  valor_diaria_padrao = case when valor_diaria_padrao = 601 then 134 else valor_diaria_padrao end,
  valor_diaria_individual = case when valor_diaria_individual = 601 then 134 else valor_diaria_individual end
where lower(trim(coalesce(link_maps, ''))) = lower('https://maps.app.goo.gl/bkyBrLG1e4swDzNJA')
  and coalesce(observacoes, '') like '%Fonte: bc hoteis.xlsx%';

-- Normaliza eventual cadastro antigo truncado antes do lote que contém o hotel.
update public.hospedagem_hoteis
set cidade = 'PALMEIRAS DE GOIÁS'
where upper(trim(coalesce(uf, ''))) = 'GO'
  and public.hospedagem_normalizar_texto(nome) = public.hospedagem_normalizar_texto('HOTEL AGUA VIRADA')
  and public.hospedagem_normalizar_texto(cidade) in ('palmeirasde', 'palmeirasdegoias');

commit;
