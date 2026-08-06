INSERT INTO app_modulos (codigo, nome, categoria, rota, ordem, ativo, descricao) VALUES
  ('contratos', 'Contratos', 'RECURSOS HUMANOS', 'contratos', 504, true, 'Contrato de experiência e rescisões.')
ON CONFLICT (codigo) DO NOTHING;

UPDATE app_modulos SET ativo = false, updated_at = now()
WHERE codigo IN ('contratos_experiencia', 'contratos_rescisoes');

INSERT INTO app_usuario_modulos (usuario_id, modulo_id, ativo, status)
SELECT DISTINCT existentes.usuario_id, novo.id, true, 'ativo'
FROM (
  SELECT DISTINCT um.usuario_id
  FROM app_usuario_modulos um
  JOIN app_modulos m ON m.id = um.modulo_id
  WHERE m.codigo IN ('rh_epi','ferias_atestados','rh_clinicas_sst','contatos_exportacoes')
    AND um.ativo = true
) existentes
CROSS JOIN (SELECT id FROM app_modulos WHERE codigo = 'contratos') novo
ON CONFLICT (usuario_id, modulo_id) DO NOTHING;
;
