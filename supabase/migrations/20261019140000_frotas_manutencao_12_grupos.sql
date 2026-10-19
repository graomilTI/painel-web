-- Frotas · Manutenção: de 7 grupos + "Outros" para 12 grupos que cobrem os 29 sistemas do guia (continua 20261019130000).
-- Os 7 grupos do PDF ficam (Suspensão ganha Direção; Injeção ganha Escapamento e Diagnóstico) e entram 5 novos:
-- Transmissão e embreagem; Elétrica, bateria e iluminação; Ar-condicionado; Carroceria, vidros e interior; e
-- "Revisão geral e serviços externos" no lugar de "Outros". O item continua gravando a categoria representativa do grupo.

-- ============================================================
-- 1. Grupos (código fixo: o 8 já existia como "Outros")
-- ============================================================
-- ordem = do mais comum no dia a dia da frota para o menos comum
insert into public.frotas_manutencao_grupos (codigo, nome, ordem, categoria_codigo) values
  (7, 'Pneus, alinhamento e balanceamento', 1, 13),
  (2, 'Freios', 2, 9),
  (1, 'Suspensão e direção', 3, 11),
  (6, 'Óleo e filtros', 4, 2),
  (3, 'Motor', 5, 1),
  (4, 'Arrefecimento', 6, 3),
  (5, 'Injeção, escapamento e diagnóstico', 7, 4),
  (9, 'Transmissão e embreagem', 8, 7),
  (10, 'Elétrica, bateria e iluminação', 9, 6),
  (11, 'Ar-condicionado', 10, 16),
  (12, 'Carroceria, vidros e interior', 11, 17),
  (8, 'Revisão geral e serviços externos', 12, 28)
on conflict (codigo) do update
  set nome = excluded.nome, ordem = excluded.ordem, categoria_codigo = excluded.categoria_codigo, ativo = true;

-- ============================================================
-- 2. Os 29 sistemas em 12 grupos
-- ============================================================
update public.frotas_manutencao_categorias set grupo_codigo = case codigo
  when 13 then 7
  when 9 then 2 when 10 then 2
  when 11 then 1 when 12 then 1 when 14 then 1
  when 2 then 6 when 23 then 6
  when 1 then 3 when 5 then 3 when 22 then 3
  when 3 then 4
  when 4 then 5 when 15 then 5 when 24 then 5
  when 7 then 9 when 8 then 9
  when 6 then 10 when 26 then 10 when 19 then 10 when 25 then 10
  when 16 then 11
  when 17 then 12 when 18 then 12 when 20 then 12 when 21 then 12 when 27 then 12
  when 28 then 8 when 29 then 8
  else 8 end;

-- ============================================================
-- 3. Componentes: os já carregados seguem o grupo do seu sistema (a bomba d'água fica no Motor, como no guia)
-- ============================================================
update public.frotas_manutencao_componentes c
   set grupo_codigo = case when c.nome = 'Bomba d''água e válvula termostática' then 3 else cat.grupo_codigo end
  from public.frotas_manutencao_categorias cat
 where cat.codigo = c.categoria_codigo;

-- Novos componentes (derivados das listas de corretiva e preventiva de cada sistema no guia). categoria_codigo é o sistema
-- de origem; grupo_codigo é onde aparece para quem abre a manutenção. Repetir a migration não duplica.
insert into public.frotas_manutencao_componentes (grupo_codigo, categoria_codigo, plano_codigo, nome, ordem) values
  -- Freios (2): pinças e ABS
  (2, 9, null, 'Pinças de freio e cilindros de roda', 7),
  (2, 10, null, 'ABS: sensores de roda e módulo', 8),
  -- Suspensão e direção (1): direção, rolamentos e cubos
  (1, 12, null, 'Terminais e barras de direção', 7),
  (1, 12, null, 'Caixa de direção e bomba hidráulica/elétrica', 8),
  (1, 12, null, 'Mangueiras e fluido da direção', 9),
  (1, 14, null, 'Rolamentos e cubos de roda', 10),
  -- Motor (3)
  (3, 1, null, 'Coxins e suportes do motor', 7),
  -- Injeção, escapamento e diagnóstico (5)
  (5, 15, null, 'Escapamento, silencioso e catalisador', 7),
  (5, 24, null, 'Escaneamento e leitura de falhas', 8),
  -- Transmissão e embreagem (9)
  (9, 7, null, 'Kit de embreagem (disco, platô e rolamento)', 1),
  (9, 7, null, 'Atuador, cilindros e cabo da embreagem', 2),
  (9, 7, null, 'Óleo e fluido do câmbio', 3),
  (9, 7, null, 'Câmbio (reparo, juntas e retentores)', 4),
  (9, 8, null, 'Coifas e juntas homocinéticas', 5),
  (9, 8, null, 'Semi-eixos', 6),
  (9, 8, null, 'Diferencial (reparo e lubrificante)', 7),
  -- Elétrica, bateria e iluminação (10)
  (10, 26, null, 'Bateria', 1),
  (10, 26, null, 'Alternador e regulador de carga', 2),
  (10, 5, null, 'Motor de partida e solenoide', 3),
  (10, 6, null, 'Fusíveis, relés e chicotes', 4),
  (10, 6, null, 'Sensores e módulos elétricos', 5),
  (10, 6, null, 'Buzina e comandos', 6),
  (10, 19, null, 'Lâmpadas', 7),
  (10, 19, null, 'Faróis e lanternas', 8),
  (10, 19, null, 'Setas e luzes de freio e de ré', 9),
  (10, 25, null, 'Acessórios (alarme, câmera, sensores de estacionamento, multimídia)', 10),
  -- Ar-condicionado (11)
  (11, 16, null, 'Compressor', 1),
  (11, 16, null, 'Condensador e evaporador', 2),
  (11, 16, null, 'Gás e vazamentos (recarga)', 3),
  (11, 16, null, 'Ventilador e comandos', 4),
  (11, 16, null, 'Higienização', 5),
  -- Carroceria, vidros e interior (12)
  (12, 17, null, 'Funilaria e pintura', 1),
  (12, 17, null, 'Para-choques e painéis', 2),
  (12, 21, null, 'Portas, dobradiças e fechaduras', 3),
  (12, 21, null, 'Máquina de vidro e trava elétrica', 4),
  (12, 18, null, 'Para-brisa e vidros', 5),
  (12, 18, null, 'Palhetas, esguichos e bomba do lavador', 6),
  (12, 18, null, 'Retrovisores', 7),
  (12, 20, null, 'Bancos, trilhos e forrações', 8),
  (12, 20, null, 'Cintos de segurança', 9),
  (12, 20, null, 'Maçanetas, puxadores e acabamentos internos', 10),
  (12, 27, null, 'Chassi, estrutura e fixações', 11),
  -- Revisão geral e serviços externos (8)
  (8, 28, null, 'Revisão por km ou tempo (plano do fabricante)', 1),
  (8, 28, null, 'Inspeção geral por falha não localizada', 2),
  (8, 29, null, 'Guincho e socorro', 3),
  (8, 29, null, 'Serviço em oficina terceirizada', 4)
on conflict (categoria_codigo, nome) do update set grupo_codigo = excluded.grupo_codigo, ordem = excluded.ordem;
