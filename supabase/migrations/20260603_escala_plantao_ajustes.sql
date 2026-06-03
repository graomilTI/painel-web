-- 1. Cadastrar Renata nos contatos (com colaborador_key obrigatório)
INSERT INTO public.rh_plantao_contatos (nome, colaborador_key, setor_preferencial)
VALUES ('RENATA SOUZA MORAIS PERES', 'RENATA SOUZA MORAIS PERES', 'Caixas')
ON CONFLICT DO NOTHING;

-- 2. Atualizar registros RENATA na escala
UPDATE public.rh_plantao_escalas
SET nome = 'RENATA SOUZA MORAIS PERES',
    colaborador_key = 'RENATA SOUZA MORAIS PERES',
    updated_at = now()
WHERE colaborador_key = 'RENATA';

-- 3. Remover MARIA e VER
DELETE FROM public.rh_plantao_escalas
WHERE colaborador_key IN ('MARIA', 'VER');

-- 4. Horários RH: 08:00-12:00 / 13:30-18:00
UPDATE public.rh_plantao_escalas
SET hora_inicio = '08:00', hora_fim = '12:00',
    hora_inicio_2 = '13:30', hora_fim_2 = '18:00', updated_at = now()
WHERE setor = 'RH';

-- 5. Horários Frotas: 08:00-12:00 / 13:30-18:00
UPDATE public.rh_plantao_escalas
SET hora_inicio = '08:00', hora_fim = '12:00',
    hora_inicio_2 = '13:30', hora_fim_2 = '18:00', updated_at = now()
WHERE setor = 'Frotas';

-- 6. Horários Caixas: 08:00-12:00 / 13:30-18:00
UPDATE public.rh_plantao_escalas
SET hora_inicio = '08:00', hora_fim = '12:00',
    hora_inicio_2 = '13:30', hora_fim_2 = '18:00', updated_at = now()
WHERE setor = 'Caixas';

-- 7. Logística Sábado: 07:30-12:00 / 13:00-19:30
UPDATE public.rh_plantao_escalas
SET hora_inicio = '07:30', hora_fim = '12:00',
    hora_inicio_2 = '13:00', hora_fim_2 = '19:30', updated_at = now()
WHERE setor = 'Logística' AND EXTRACT(DOW FROM data_plantao) = 6;

-- 8. Logística Domingo: 08:00-12:00 / 13:00-18:30
UPDATE public.rh_plantao_escalas
SET hora_inicio = '08:00', hora_fim = '12:00',
    hora_inicio_2 = '13:00', hora_fim_2 = '18:30', updated_at = now()
WHERE setor = 'Logística' AND EXTRACT(DOW FROM data_plantao) = 0;
