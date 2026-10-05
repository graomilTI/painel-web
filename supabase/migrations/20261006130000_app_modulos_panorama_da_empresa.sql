-- Usuários e Acessos listava o módulo dashboard_socio como "Dashboard do Sócio", mas o menu e a
-- própria página (dashboard-socio.html) se chamam "Panorama da Empresa". Só o nome de exibição muda:
-- o código (dashboard_socio), a rota, as permissões já concedidas e o agrupamento em DIRETORIA
-- (a tela agrupa pelo código) continuam iguais.
update public.app_modulos
   set nome = 'Panorama da Empresa',
       updated_at = now()
 where codigo = 'dashboard_socio'
   and nome is distinct from 'Panorama da Empresa';
