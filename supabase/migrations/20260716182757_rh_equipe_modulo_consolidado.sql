INSERT INTO app_modulos (codigo, nome, categoria, rota, ordem, ativo, descricao) VALUES
  ('equipe', 'Equipe', 'RECURSOS HUMANOS', 'equipe', 500, true, 'Admissões, integração, cadastro no Graint, consulta de base e contatos.')
ON CONFLICT (codigo) DO NOTHING;

-- Módulos de páginas placeholder substituídas pela página consolidada "Equipe" com abas
UPDATE app_modulos SET ativo = false, updated_at = now()
WHERE codigo IN ('equipe_admissoes', 'equipe_integracao', 'equipe_graint');

INSERT INTO app_usuario_modulos (usuario_id, modulo_id, ativo, status)
SELECT DISTINCT existentes.usuario_id, novo.id, true, 'ativo'
FROM (
  SELECT DISTINCT um.usuario_id
  FROM app_usuario_modulos um
  JOIN app_modulos m ON m.id = um.modulo_id
  WHERE m.codigo IN ('ferias_atestados','rh_epi','rh_clinicas_sst','contatos_exportacoes')
    AND um.ativo = true
) existentes
CROSS JOIN (SELECT id FROM app_modulos WHERE codigo = 'equipe') novo
ON CONFLICT (usuario_id, modulo_id) DO NOTHING;
;
