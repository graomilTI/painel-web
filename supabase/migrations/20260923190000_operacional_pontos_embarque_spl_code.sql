-- Código do Local de Serviço no GRM (servicePlaces/getRecords -> splCode).
-- O agente grmserver-locais-embarque-api.js passa a espelhar o cadastro do GRM em
-- operacional_pontos_embarque e casa por splCode (estável) em vez de só por
-- nome+cidade+UF (que muda quando o cadastro é renomeado e colide em locais homônimos).
-- Índice único parcial: linhas antigas (sem código) continuam válidas até serem adotadas.
alter table public.operacional_pontos_embarque
  add column if not exists spl_code integer;

create unique index if not exists operacional_pontos_embarque_spl_code_uidx
  on public.operacional_pontos_embarque (spl_code)
  where spl_code is not null;
