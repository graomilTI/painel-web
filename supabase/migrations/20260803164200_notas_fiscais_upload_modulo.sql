-- Registra o submenu "Enviar Notas Fiscais" como permissão independente.
-- Assim ele aparece como checkbox separado em Usuários e Acessos.
INSERT INTO app_modulos (codigo, nome, categoria, rota, ordem, ativo)
SELECT
  'upload_notas_fiscais',
  'Enviar Notas Fiscais',
  'NOTAS FISCAIS',
  'upload-notas-fiscais',
  COALESCE((SELECT ordem + 1 FROM app_modulos WHERE codigo = 'notas_fiscais' LIMIT 1), 1001),
  true
ON CONFLICT (codigo) DO UPDATE
SET nome = EXCLUDED.nome,
    categoria = EXCLUDED.categoria,
    rota = EXCLUDED.rota,
    ordem = EXCLUDED.ordem,
    ativo = true;
