alter table public.operacional_mapa_rotas drop constraint operacional_mapa_rotas_tipo_check;
alter table public.operacional_mapa_rotas add constraint operacional_mapa_rotas_tipo_check
  check (tipo = any (array['frota'::text, 'reembolso_km'::text, 'local'::text]));
;
