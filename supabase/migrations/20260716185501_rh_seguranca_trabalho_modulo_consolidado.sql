INSERT INTO app_modulos (codigo, nome, categoria, rota, ordem, ativo, descricao) VALUES
  ('seguranca_trabalho', 'Segurança do Trabalho', 'RECURSOS HUMANOS', 'seguranca-trabalho', 501, true, 'EPIs e Comunicação de Acidente de Trabalho (CAT).')
ON CONFLICT (codigo) DO NOTHING;

UPDATE app_modulos SET ativo = false, updated_at = now() WHERE codigo = 'seguranca_cat';

INSERT INTO app_usuario_modulos (usuario_id, modulo_id, ativo, status)
SELECT DISTINCT existentes.usuario_id, novo.id, true, 'ativo'
FROM (
  SELECT DISTINCT um.usuario_id
  FROM app_usuario_modulos um
  JOIN app_modulos m ON m.id = um.modulo_id
  WHERE m.codigo IN ('rh_epi','ferias_atestados','rh_clinicas_sst','contatos_exportacoes')
    AND um.ativo = true
) existentes
CROSS JOIN (SELECT id FROM app_modulos WHERE codigo = 'seguranca_trabalho') novo
ON CONFLICT (usuario_id, modulo_id) DO NOTHING;
;
