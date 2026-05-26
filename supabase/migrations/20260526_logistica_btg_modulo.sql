-- Módulo BTG no menu Logística
INSERT INTO app_modulos (codigo, nome, categoria, rota, ordem, ativo)
VALUES ('logistica_btg', 'BTG', 'LOGÍSTICA', 'btg-logistica', 915, true)
ON CONFLICT (codigo) DO NOTHING;
