-- BDI5F76 consta na planilha G1000 ativos mas não existe em frotas_veiculos
INSERT INTO public.frotas_rastreadores (placa, infleet, status)
VALUES ('BDI5F76', 'PENDENTE', 'sem_rastreador')
ON CONFLICT (placa) DO UPDATE SET infleet = 'PENDENTE', updated_at = now();
