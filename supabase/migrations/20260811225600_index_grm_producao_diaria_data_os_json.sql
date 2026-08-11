-- Otimiza a trava de segurança do agente de lançamento de NHE.
-- A recuperação histórica consulta Produção Diária por Data + O.S. para não
-- tentar lançar NHE quando já existe carga/movimento no mesmo dia.
create index if not exists idx_grm_producao_diaria_data_os_json
on public.grm_producao_diaria_importacoes
using btree ((dados_json->>'Data'), (dados_json->>'O.S.'));
