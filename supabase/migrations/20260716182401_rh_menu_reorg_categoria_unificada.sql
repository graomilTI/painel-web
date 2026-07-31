UPDATE app_modulos SET categoria = 'RECURSOS HUMANOS', updated_at = now()
WHERE codigo IN (
  'contatos_exportacoes','rh_epi','rh_clinicas_sst','ferias_atestados',
  'base_colab_consulta','rh_plantao','equipe_admissoes','equipe_integracao','equipe_graint',
  'exames_admissional','exames_periodico','contratos_experiencia','contratos_rescisoes',
  'seguranca_cat','indisponibilidade_historico','cartao_ponto','advertencias','holerite_pagamentos'
);;
