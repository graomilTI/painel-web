INSERT INTO app_modulos (codigo, nome, categoria, rota, ordem, ativo, descricao) VALUES
  ('indisponibilidade', 'Indisponibilidade', 'RECURSOS HUMANOS', 'indisponibilidade', 502, true, 'Férias, atestados e histórico de indisponibilidades.')
ON CONFLICT (codigo) DO NOTHING;

UPDATE app_modulos SET ativo = false, updated_at = now()
WHERE codigo IN ('indisponibilidade_historico');

UPDATE app_modulos SET categoria = 'RECURSOS HUMANOS', rota = 'indisponibilidade', nome = 'Indisponibilidade', updated_at = now()
WHERE codigo = 'ferias_atestados';

INSERT INTO app_usuario_modulos (usuario_id, modulo_id, ativo, status)
SELECT DISTINCT existentes.usuario_id, novo.id, true, 'ativo'
FROM (
  SELECT DISTINCT um.usuario_id
  FROM app_usuario_modulos um
  JOIN app_modulos m ON m.id = um.modulo_id
  WHERE m.codigo IN ('ferias_atestados','rh_epi','rh_clinicas_sst','contatos_exportacoes')
    AND um.ativo = true
) existentes
CROSS JOIN (SELECT id FROM app_modulos WHERE codigo = 'indisponibilidade') novo
ON CONFLICT (usuario_id, modulo_id) DO NOTHING;
;
