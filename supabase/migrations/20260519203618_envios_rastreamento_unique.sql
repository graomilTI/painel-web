
ALTER TABLE envios_rastreamento 
  ADD CONSTRAINT envios_rastreamento_unique UNIQUE (postagem_id, evento_data, evento_tipo);
;
