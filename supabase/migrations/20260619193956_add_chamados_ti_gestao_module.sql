insert into app_modulos (codigo, nome, rota, categoria)
select 'chamados_ti_gestao', 'Chamados de TI - Gestão', '/painel/chamados-ti', 'TI'
where not exists (select 1 from app_modulos where codigo = 'chamados_ti_gestao');;
