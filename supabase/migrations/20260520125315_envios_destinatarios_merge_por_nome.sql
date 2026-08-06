
-- 1. Remove duplicatas mantendo 1 por nome: preferência planilha > colaborador > manual, depois maior id
DELETE FROM envios_destinatarios
WHERE id NOT IN (
  SELECT DISTINCT ON (nome) id
  FROM envios_destinatarios
  ORDER BY nome,
    CASE origem WHEN 'planilha' THEN 0 WHEN 'colaborador' THEN 1 ELSE 2 END,
    id DESC
);

-- 2. Troca constraint para UNIQUE (nome)
ALTER TABLE envios_destinatarios
  DROP CONSTRAINT envios_destinatarios_nome_origem_unique;

ALTER TABLE envios_destinatarios
  ADD CONSTRAINT envios_destinatarios_nome_unique UNIQUE (nome);
;
