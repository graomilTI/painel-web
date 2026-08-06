-- Módulo Alojamentos no menu Hospedagem
-- Necessário para aparecer como checkbox separado em Usuários e Acessos.
INSERT INTO app_modulos (codigo, nome, categoria, rota, ordem, ativo)
VALUES ('hotel_alojamentos', 'Alojamentos', 'HOSPEDAGEM', 'adm-hotel#alojamentos', 622, true)
ON CONFLICT (codigo) DO UPDATE
SET nome = EXCLUDED.nome,
    categoria = EXCLUDED.categoria,
    rota = EXCLUDED.rota,
    ordem = EXCLUDED.ordem,
    ativo = true;
