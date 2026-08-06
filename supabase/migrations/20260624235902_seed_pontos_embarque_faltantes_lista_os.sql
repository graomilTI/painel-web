-- Complementa pontos de embarque que aparecem na Lista de OS e existem na planilha Locais de Serviço.
-- Os registros abaixo têm latitude/longitude válidas no arquivo enviado.
-- Não inclui casos sem cadastro no arquivo nem registros com coordenada inválida/placeholder.

with dados(tipo_local, nome_local, uf, cidade, latitude, longitude) as (
  values
    ('Armazém / Silo', 'INDEPENDÊNCIA  - CARLOS ANTONIO CASALI', 'BA', 'BAIANÓPOLIS', -12.8633501, -44.5415548),
    ('Armazém / Silo', 'ADAL ARMAZENS GERAIS LTDA', 'GO', 'BURITI ALEGRE', -18.1240183, -49.0451786),
    ('Armazém / Silo', 'ARMAZEM ALLIAGRO', 'GO', 'ITAGUARU', -15.7635886, -49.6270841),
    ('Armazém / Silo', 'FAZENDA SANTA LUZIA SITIO MASURA', 'MA', 'BURITICUPU', -4.6663125, -46.1562903),
    ('Armazém / Silo', 'ARMAZÉM GENESAGRO', 'MA', 'GRAJAÚ', -5.9034625, -46.2925156),
    ('Armazém / Silo', 'FAZENDA CHAPADÃO DA SERRA MONTINA', 'MA', 'SAMBAÍBA', -7.7724638, -45.6084925),
    ('Armazém / Silo', 'FAZENDA SINUELO', 'MG', 'LAGAMAR', -18.2905032, -46.8160109),
    ('Armazém / Silo', 'FAZENDA BOM JARDIM E FUNDAO - NOVA AURORA', 'MG', 'RIO PARDO DE MINAS', -18.1671916, -48.447595),
    ('Armazém / Silo', 'SPASSO EMP. E SERV. - SACRAMEN', 'MG', 'SACRAMENTO', -19.6393638, -47.5119884),
    ('Armazém / Silo', 'USINA SANTO ANGELO', 'MG', 'VERÍSSIMO', -19.768645, -48.3501033),
    ('Armazém / Silo', 'ARMAZEM ESTANCIA PAULINHA', 'MS', 'BANDEIRANTES', -19.738817, -54.3478628),
    ('Armazém / Silo', 'AGRICOLA WEBER LTDA', 'MS', 'SETE QUEDAS', -23.9318833, -55.00482),
    ('Armazém / Silo', 'SIPAL INDUSTRIA E COMERCIO LTD', 'MT', 'NORTELÂNDIA', -14.1551606, -56.9313439),
    ('Armazém / Silo', 'FAZENDA PEROBAL 1', 'MT', 'NOVA BANDEIRANTES', -9.5270371, -58.2109481),
    ('Armazém / Silo', 'ARMAZEM ARNALDO RIEGER', 'PR', 'PATO BRAGADO', -24.5978133, -54.2439467),
    ('Armazém / Silo', 'AGRIPAN', 'RS', 'GUABIJU', -28.7495375, -51.9330156),
    ('Armazém / Silo', 'ARMAZEM COPAVEL - PENHA', 'SC', 'PENHA', -24.7503567, -53.2803083),
    ('Armazém / Silo', 'BORACEIA', 'SP', 'HOLAMBRA', -22.1601624, -48.8552982),
    ('Armazém / Silo', 'FAZ GALILÉIA 1', 'TO', 'ALMAS', -11.439284, -47.1212301),
    ('Armazém / Silo', 'FAZENDA BOM RETIRO', 'TO', 'BOM JESUS DO TOCANTINS', -8.9452557, -48.0596721),
    ('Armazém / Silo', 'FAZENDA RISADA', 'TO', 'DARCINÓPOLIS', -6.7766183, -47.8130083)
)
update public.operacional_pontos_embarque p
set
  tipo_local = d.tipo_local,
  latitude = d.latitude,
  longitude = d.longitude,
  origem = 'locais_servico_lista_os',
  ativo = true,
  updated_at = now()
from dados d
where upper(btrim(p.uf)) = upper(btrim(d.uf))
  and upper(btrim(p.cidade)) = upper(btrim(d.cidade))
  and upper(btrim(p.nome_local)) = upper(btrim(d.nome_local));
with dados(tipo_local, nome_local, uf, cidade, latitude, longitude) as (
  values
    ('Armazém / Silo', 'INDEPENDÊNCIA  - CARLOS ANTONIO CASALI', 'BA', 'BAIANÓPOLIS', -12.8633501, -44.5415548),
    ('Armazém / Silo', 'ADAL ARMAZENS GERAIS LTDA', 'GO', 'BURITI ALEGRE', -18.1240183, -49.0451786),
    ('Armazém / Silo', 'ARMAZEM ALLIAGRO', 'GO', 'ITAGUARU', -15.7635886, -49.6270841),
    ('Armazém / Silo', 'FAZENDA SANTA LUZIA SITIO MASURA', 'MA', 'BURITICUPU', -4.6663125, -46.1562903),
    ('Armazém / Silo', 'ARMAZÉM GENESAGRO', 'MA', 'GRAJAÚ', -5.9034625, -46.2925156),
    ('Armazém / Silo', 'FAZENDA CHAPADÃO DA SERRA MONTINA', 'MA', 'SAMBAÍBA', -7.7724638, -45.6084925),
    ('Armazém / Silo', 'FAZENDA SINUELO', 'MG', 'LAGAMAR', -18.2905032, -46.8160109),
    ('Armazém / Silo', 'FAZENDA BOM JARDIM E FUNDAO - NOVA AURORA', 'MG', 'RIO PARDO DE MINAS', -18.1671916, -48.447595),
    ('Armazém / Silo', 'SPASSO EMP. E SERV. - SACRAMEN', 'MG', 'SACRAMENTO', -19.6393638, -47.5119884),
    ('Armazém / Silo', 'USINA SANTO ANGELO', 'MG', 'VERÍSSIMO', -19.768645, -48.3501033),
    ('Armazém / Silo', 'ARMAZEM ESTANCIA PAULINHA', 'MS', 'BANDEIRANTES', -19.738817, -54.3478628),
    ('Armazém / Silo', 'AGRICOLA WEBER LTDA', 'MS', 'SETE QUEDAS', -23.9318833, -55.00482),
    ('Armazém / Silo', 'SIPAL INDUSTRIA E COMERCIO LTD', 'MT', 'NORTELÂNDIA', -14.1551606, -56.9313439),
    ('Armazém / Silo', 'FAZENDA PEROBAL 1', 'MT', 'NOVA BANDEIRANTES', -9.5270371, -58.2109481),
    ('Armazém / Silo', 'ARMAZEM ARNALDO RIEGER', 'PR', 'PATO BRAGADO', -24.5978133, -54.2439467),
    ('Armazém / Silo', 'AGRIPAN', 'RS', 'GUABIJU', -28.7495375, -51.9330156),
    ('Armazém / Silo', 'ARMAZEM COPAVEL - PENHA', 'SC', 'PENHA', -24.7503567, -53.2803083),
    ('Armazém / Silo', 'BORACEIA', 'SP', 'HOLAMBRA', -22.1601624, -48.8552982),
    ('Armazém / Silo', 'FAZ GALILÉIA 1', 'TO', 'ALMAS', -11.439284, -47.1212301),
    ('Armazém / Silo', 'FAZENDA BOM RETIRO', 'TO', 'BOM JESUS DO TOCANTINS', -8.9452557, -48.0596721),
    ('Armazém / Silo', 'FAZENDA RISADA', 'TO', 'DARCINÓPOLIS', -6.7766183, -47.8130083)
)
insert into public.operacional_pontos_embarque (
  tipo_local,
  nome_local,
  uf,
  cidade,
  latitude,
  longitude,
  origem,
  ativo
)
select
  d.tipo_local,
  d.nome_local,
  d.uf,
  d.cidade,
  d.latitude,
  d.longitude,
  'locais_servico_lista_os',
  true
from dados d
where not exists (
  select 1
  from public.operacional_pontos_embarque p
  where upper(btrim(p.uf)) = upper(btrim(d.uf))
    and upper(btrim(p.cidade)) = upper(btrim(d.cidade))
    and upper(btrim(p.nome_local)) = upper(btrim(d.nome_local))
);
