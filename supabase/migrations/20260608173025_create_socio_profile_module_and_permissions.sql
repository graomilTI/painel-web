
-- 1) Novo perfil "Sócio"
INSERT INTO app_perfis (codigo, nome, descricao, ativo)
VALUES ('socio', 'Sócio', 'Acesso executivo amplo para sócios/proprietários: visão geral, financeiro/DRE, metas e desempenho', true)
ON CONFLICT (codigo) DO NOTHING;

-- 2) Novo módulo "Dashboard do Sócio"
INSERT INTO app_modulos (codigo, nome, categoria, icone, rota, ordem, ativo)
VALUES ('dashboard_socio', 'Dashboard do Sócio', 'DIRETORIA', 'crown', '/diretoria/dashboard-socio', 5, true)
ON CONFLICT (codigo) DO NOTHING;

-- 3) Conceder visualização ao perfil "socio" nos módulos aprovados
INSERT INTO app_perfil_modulo (perfil_id, modulo_id, pode_ver, pode_criar, pode_editar, pode_excluir, pode_aprovar)
SELECT p.id, m.id, true, false, false, false, false
FROM app_perfis p
JOIN app_modulos m ON m.codigo IN (
  'dashboard_socio',
  'diretoria_dre',
  'diretoria_metas',
  'diretoria_desempenho',
  'financeiro',
  'financeiro_fluxo_caixa',
  'contato_cliente'
)
WHERE p.codigo = 'socio'
ON CONFLICT (perfil_id, modulo_id) DO UPDATE SET pode_ver = true;
;
