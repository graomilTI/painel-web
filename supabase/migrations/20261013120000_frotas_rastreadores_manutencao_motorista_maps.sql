-- Frotas · Rastreadores · Manutenção:
--  - motorista_nome / motorista_contato: motorista escolhido para esta manutenção. Só existe quando
--    difere do motorista do veículo (frotas_veiculos.motorista_atual vem da sync de patrimônios e não é alterado aqui);
--  - local_maps_url: link do Google Maps do local do agendamento, pra equipe acompanhar a localização.

alter table public.frotas_rastreadores_manutencoes
  add column if not exists motorista_nome text,
  add column if not exists motorista_contato text,
  add column if not exists local_maps_url text;
