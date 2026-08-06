-- Atualiza categoria dos módulos de RH existentes para refletir os novos grupos de menu
UPDATE app_modulos SET categoria = 'EQUIPE', updated_at = now() WHERE codigo = 'contatos_exportacoes';
UPDATE app_modulos SET categoria = 'SEGURANÇA DO TRABALHO', updated_at = now() WHERE codigo = 'rh_epi';
UPDATE app_modulos SET categoria = 'EXAMES', updated_at = now() WHERE codigo = 'rh_clinicas_sst';
UPDATE app_modulos SET categoria = 'INDISPONIBILIDADE', updated_at = now() WHERE codigo = 'ferias_atestados';

-- Novos módulos da reorganização de RH (Fase 0 — placeholders + itens migrados sem módulo cadastrado ainda)
INSERT INTO app_modulos (codigo, nome, categoria, rota, ordem, ativo, descricao) VALUES
  ('base_colab_consulta', 'Consultar Base', 'EQUIPE', 'consultar-colaboradores', 501, true, 'Consulta e exportação da base de colaboradores.'),
  ('rh_plantao', 'Plantão', 'PLANTÃO', 'plantao', 502, true, 'Escala de plantão por setor.'),
  ('equipe_admissoes', 'Admissões', 'EQUIPE', 'equipe-admissoes', 503, true, 'Cadastro e acompanhamento do processo de admissão de colaboradores.'),
  ('equipe_integracao', 'Integração de Colaboradores', 'EQUIPE', 'equipe-integracao', 504, true, 'Checklist de integração/onboarding de colaboradores.'),
  ('equipe_graint', 'Cadastro no Graint', 'EQUIPE', 'equipe-graint', 505, true, 'Fila de colaboradores aguardando cadastro manual no Graint.'),
  ('exames_admissional', 'Encaminhamento Admissional', 'EXAMES', 'exames-admissional', 506, true, 'Encaminhamento de colaboradores para exame admissional.'),
  ('exames_periodico', 'Exames Periódicos', 'EXAMES', 'exames-periodico', 507, true, 'Controle de exames periódicos e vencimentos.'),
  ('contratos_experiencia', 'Contrato de Experiência', 'CONTRATOS', 'contratos-experiencia', 508, true, 'Controle de contratos de experiência.'),
  ('contratos_rescisoes', 'Rescisões', 'CONTRATOS', 'contratos-rescisoes', 509, true, 'Controle do processo de rescisão contratual.'),
  ('seguranca_cat', 'CAT', 'SEGURANÇA DO TRABALHO', 'seguranca-cat', 510, true, 'Abertura e acompanhamento de CAT.'),
  ('indisponibilidade_historico', 'Histórico', 'INDISPONIBILIDADE', 'historico-indisponibilidade', 511, true, 'Histórico de férias e atestados.'),
  ('cartao_ponto', 'Cartão Ponto', 'CARTÃO PONTO', 'cartao-ponto', 512, true, 'Controle de cartão ponto.'),
  ('advertencias', 'Advertências', 'ADVERTÊNCIAS', 'advertencias', 513, true, 'Controle de advertências aplicadas a colaboradores.'),
  ('holerite_pagamentos', 'Folha e Holerite', 'HOLERITE E PAGAMENTOS', 'holerite-pagamentos', 514, true, 'Folha de pagamento e holerites.')
ON CONFLICT (codigo) DO NOTHING;

-- Concede acesso aos novos módulos para o mesmo grupo de usuários que já acessa os módulos de RH existentes
INSERT INTO app_usuario_modulos (usuario_id, modulo_id, ativo, status)
SELECT DISTINCT existentes.usuario_id, novos.id, true, 'ativo'
FROM (
  SELECT DISTINCT um.usuario_id
  FROM app_usuario_modulos um
  JOIN app_modulos m ON m.id = um.modulo_id
  WHERE m.codigo IN ('ferias_atestados','rh_epi','rh_clinicas_sst','contatos_exportacoes')
    AND um.ativo = true
) existentes
CROSS JOIN (
  SELECT id FROM app_modulos WHERE codigo IN (
    'base_colab_consulta','rh_plantao','equipe_admissoes','equipe_integracao','equipe_graint',
    'exames_admissional','exames_periodico','contratos_experiencia','contratos_rescisoes',
    'seguranca_cat','indisponibilidade_historico','cartao_ponto','advertencias','holerite_pagamentos'
  )
) novos
ON CONFLICT (usuario_id, modulo_id) DO NOTHING;
;
