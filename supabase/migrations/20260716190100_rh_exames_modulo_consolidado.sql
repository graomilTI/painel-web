INSERT INTO app_modulos (codigo, nome, categoria, rota, ordem, ativo, descricao) VALUES
  ('exames', 'Exames', 'RECURSOS HUMANOS', 'exames', 503, true, 'Encaminhamento admissional, exames periódicos e clínicas SST.')
ON CONFLICT (codigo) DO NOTHING;

UPDATE app_modulos SET ativo = false, updated_at = now()
WHERE codigo IN ('exames_admissional', 'exames_periodico');

INSERT INTO app_usuario_modulos (usuario_id, modulo_id, ativo, status)
SELECT DISTINCT existentes.usuario_id, novo.id, true, 'ativo'
FROM (
  SELECT DISTINCT um.usuario_id
  FROM app_usuario_modulos um
  JOIN app_modulos m ON m.id = um.modulo_id
  WHERE m.codigo IN ('rh_clinicas_sst','rh_epi','ferias_atestados','contatos_exportacoes')
    AND um.ativo = true
) existentes
CROSS JOIN (SELECT id FROM app_modulos WHERE codigo = 'exames') novo
ON CONFLICT (usuario_id, modulo_id) DO NOTHING;
;
