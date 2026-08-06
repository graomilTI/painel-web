-- O dropdown do GRM usa este nome exato. O valor anterior ("Recarga")
-- fazia o agente interromper a aplicação com CATEGORIA_NAO_MAPEADA.
update public.grm_despesas_tipos_config
set
  tipo_grm = 'Recarga de celular',
  updated_at = now()
where chave = 'EXTRA_RECARGA'
  and tipo_grm is distinct from 'Recarga de celular';
