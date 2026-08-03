-- Colaborador confirmado numa O.S. Atender que não precisa de deslocamento
-- (a pé, já está no local, ou a Etapa D ainda não foi preenchida) ficava
-- totalmente fora do Mapa Operacional — a Edge Function operacional-mapa-rotas
-- só gravava pickup pra quem tinha tipo_deslocamento MOTORISTA FROTA/CARONA
-- FROTA/REEMBOLSO KM. Pedido do usuário (2026-08-03): mostrar a localização
-- do colaborador mesmo sem rota, usando o endereço de casa/hotel/alojamento já
-- geocodificado. 'local' é só um marcador (sem rota/paradas).

alter table public.operacional_mapa_rotas drop constraint operacional_mapa_rotas_tipo_check;
alter table public.operacional_mapa_rotas add constraint operacional_mapa_rotas_tipo_check
  check (tipo = any (array['frota'::text, 'reembolso_km'::text, 'local'::text]));
