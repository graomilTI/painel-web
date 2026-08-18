create index if not exists idx_grm_lista_os_os_sync
  on public.grm_lista_os_importacoes ((dados_json->>'O.S.'), data_sincronizacao desc);

create index if not exists idx_grm_lista_os_sync
  on public.grm_lista_os_importacoes (data_sincronizacao desc);
