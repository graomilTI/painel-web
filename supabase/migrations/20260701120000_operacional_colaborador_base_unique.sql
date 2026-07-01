-- Permite upsert por colaborador_id na função geocode-colaborador-base (que
-- preenche endereço/coordenada de colaboradores criados depois do import
-- único que originalmente populou esta tabela). Sem constraint única, o
-- onConflict:'colaborador_id' falha.
alter table public.operacional_colaborador_base
  add constraint operacional_colaborador_base_colaborador_id_key unique (colaborador_id);
