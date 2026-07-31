
-- Insere módulo RH EPI
INSERT INTO public.app_modulos (codigo, nome, categoria, icone, rota, ordem, ativo)
VALUES ('rh_epi', 'EPI', 'RECURSOS HUMANOS', 'Shield', 'epi-rh', 55, true)
ON CONFLICT (codigo) DO NOTHING;

-- Insere módulo Termos Celular
INSERT INTO public.app_modulos (codigo, nome, categoria, icone, rota, ordem, ativo)
VALUES ('termos_celular', 'Celular', 'TERMOS', 'FileSignature', 'termos#celular', 205, true)
ON CONFLICT (codigo) DO NOTHING;

-- Insere módulo Termos Veículos
INSERT INTO public.app_modulos (codigo, nome, categoria, icone, rota, ordem, ativo)
VALUES ('termos_veiculos', 'Veículos', 'TERMOS', 'Car', 'termos#veiculos', 206, true)
ON CONFLICT (codigo) DO NOTHING;

-- Adiciona rh_epi aos perfis que já têm ferias_atestados
INSERT INTO public.app_perfil_modulo (perfil_id, modulo_id)
SELECT apm.perfil_id, m.id
FROM public.app_perfil_modulo apm
JOIN public.app_modulos existing ON existing.id = apm.modulo_id AND existing.codigo = 'ferias_atestados'
CROSS JOIN (SELECT id FROM public.app_modulos WHERE codigo = 'rh_epi') m
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_perfil_modulo x
  WHERE x.perfil_id = apm.perfil_id AND x.modulo_id = m.id
);
;
