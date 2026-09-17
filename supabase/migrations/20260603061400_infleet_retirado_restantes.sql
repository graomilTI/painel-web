-- Insere veículos ativos que ainda não têm registro em frotas_rastreadores
-- Não estão na planilha G1000 ativos → RETIRADO
INSERT INTO public.frotas_rastreadores (placa, veiculo_id, infleet, status, contato)
SELECT
  v.placa,
  v.id,
  'RETIRADO',
  'sem_rastreador',
  v.motorista_atual
FROM public.frotas_veiculos v
WHERE v.status = 'ATIVO'
  AND NOT EXISTS (
    SELECT 1 FROM public.frotas_rastreadores r WHERE r.placa = v.placa
  );
