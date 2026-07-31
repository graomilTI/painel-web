
UPDATE public.app_perfil_modulo
SET pode_ver = true, pode_criar = true, pode_editar = true
WHERE modulo_id = (SELECT id FROM public.app_modulos WHERE codigo = 'rh_epi');
;
