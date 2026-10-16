-- Frotas · Manutenção: fluxo completo (solicitação -> orçamento -> aprovação -> OS -> conclusão)
-- classificado pelo "Guia de Classificação — Manutenção de Frota":
--   * categoria = ONDE o serviço foi feito (29 sistemas do veículo);
--   * natureza  = POR QUE foi feito (preventiva ou corretiva);
--   * planos    = intervalos de troca/verificação do guia, que geram os vencimentos por veículo.
--
-- Reaproveita public.frotas_manutencoes (estava vazia em produção em 16/10/2026) e acrescenta:
--   frotas_manutencao_categorias, frotas_manutencao_planos, frotas_manutencao_itens,
--   frotas_manutencao_orcamentos e a view frotas_manutencao_vencimentos_v.
-- A tela atual continua funcionando: as colunas novas são opcionais e a linha nasce como 'solicitada'.
-- frotas_trocas_oleo (vazia) não é tocada aqui: troca de óleo passa a ser o plano 'oleo_motor'.

-- ============================================================
-- 1. Categorias do guia (referência)
-- ============================================================
create table if not exists public.frotas_manutencao_categorias (
  codigo smallint primary key check (codigo between 1 and 99),
  nome text not null,
  exemplos_preventiva text,
  exemplos_corretiva text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_frotas_manut_categorias_updated on public.frotas_manutencao_categorias;
create trigger trg_frotas_manut_categorias_updated
  before update on public.frotas_manutencao_categorias
  for each row execute function public.set_updated_at();

insert into public.frotas_manutencao_categorias (codigo, nome, exemplos_preventiva, exemplos_corretiva) values
(1,  'Motor e componentes internos',
  'Troca de óleo do motor; substituição do filtro de óleo; inspeção de vazamentos; verificação de ruídos, correias e suportes conforme plano.',
  'Diagnóstico de falha mecânica; reparo de vazamentos; troca de juntas, retentores, coxins ou componentes internos; reparo de cabeçote ou motor.'),
(2,  'Sistema de lubrificação',
  'Troca de óleo e filtro no intervalo indicado; inspeção do nível, pressão e possíveis vazamentos.',
  'Reparo de vazamento; substituição de bomba de óleo, pescador, sensor/interruptor de pressão ou cárter danificado.'),
(3,  'Arrefecimento / refrigeração do motor',
  'Inspeção do nível e estado do líquido; verificação de mangueiras, radiador, tampa, reservatório e funcionamento da ventoinha; troca do fluido conforme fabricante.',
  'Reparo de superaquecimento ou vazamento; substituição de radiador, bomba d''água, válvula termostática, mangueira, reservatório ou ventoinha.'),
(4,  'Alimentação de combustível e injeção eletrônica',
  'Inspeção do sistema; troca de filtro quando aplicável; leitura de parâmetros e limpeza apenas quando indicada por diagnóstico ou plano técnico.',
  'Diagnóstico de falhas; reparo/substituição de bicos injetores, bomba, regulador, sensores, corpo de borboleta, flauta, tubulações ou módulo relacionado.'),
(5,  'Ignição e partida do motor',
  'Inspeção de velas, cabos e bobinas conforme plano; teste do sistema de partida.',
  'Reparo de falha de ignição ou dificuldade de partida; substituição de velas, bobinas, cabos, motor de partida, solenoide ou componentes relacionados.'),
(6,  'Sistema elétrico e eletrônico',
  'Teste de bateria e carga; inspeção de terminais, fusíveis, relés, aterramentos, chicotes, conectores e iluminação.',
  'Reparo de curto-circuito, falha de carga ou circuito; substituição/reparo de alternador, bateria, fusíveis, relés, chicotes, sensores, módulos ou comandos elétricos.'),
(7,  'Transmissão, embreagem e câmbio',
  'Inspeção de vazamentos, folgas e funcionamento; verificação/troca de fluido conforme fabricante; inspeção do sistema de embreagem.',
  'Reparo de patinação, ruídos, dificuldade de engate ou vazamentos; substituição de embreagem, atuadores, cilindros, juntas, componentes do câmbio ou transmissão automática.'),
(8,  'Diferencial, semi-eixos e juntas homocinéticas',
  'Inspeção de coifas, folgas, ruídos e vazamentos; verificação do lubrificante quando aplicável.',
  'Substituição de coifas, juntas homocinéticas, semi-eixos, rolamentos ou reparo de diferencial.'),
(9,  'Freios',
  'Inspeção de pastilhas, lonas, discos, tambores, fluido, mangueiras, tubulações, pinças e freio de estacionamento; troca conforme desgaste/plano.',
  'Reparo de perda de eficiência, ruídos ou vazamentos; substituição de pastilhas, lonas, discos, tambores, cilindros, pinças, servo-freio, cilindro mestre ou tubulações.'),
(10, 'ABS / controle de estabilidade',
  'Inspeção de avisos no painel e verificação eletrônica conforme plano de manutenção.',
  'Diagnóstico de falha e reparo de sensores de roda, chicotes, unidade hidráulica, módulo ABS/ESC ou componentes relacionados.'),
(11, 'Suspensão',
  'Inspeção de amortecedores, molas, buchas, pivôs, bieletas, bandejas, batentes, coxins e folgas.',
  'Substituição de componentes desgastados ou danificados; reparo de ruídos, folgas, instabilidade ou vazamentos em amortecedores.'),
(12, 'Direção',
  'Inspeção de terminais, barras, coifas, caixa de direção, folgas e fluido quando aplicável; verificação do alinhamento quando necessário.',
  'Reparo de folgas, ruídos, vazamentos ou direção pesada; substituição/reparo de caixa, bomba hidráulica, mangueiras, terminais, barras ou coluna.'),
(13, 'Rodas, pneus e alinhamento',
  'Calibragem; rodízio; inspeção de desgaste, cortes, bolhas e profundidade dos sulcos; balanceamento e alinhamento conforme necessidade.',
  'Reparo permitido de pneu; substituição de pneu, roda ou válvula danificada; correção de vibração, empeno ou desalinhamento decorrente de avaria.'),
(14, 'Rolamentos, cubos e cubos de roda',
  'Inspeção de ruídos, folgas e aquecimento anormal.',
  'Substituição de rolamentos, cubos ou componentes danificados.'),
(15, 'Escapamento e controle de emissões',
  'Inspeção de fixações, corrosão, vazamentos e estado dos componentes.',
  'Reparo/substituição de escapamento, silencioso, catalisador, sondas e sensores relacionados, conforme diagnóstico.'),
(16, 'Ar-condicionado e ventilação interna',
  'Inspeção de funcionamento; substituição do filtro de cabine conforme plano; higienização quando necessária.',
  'Diagnóstico de falha de refrigeração, vazamento ou ruído; reparo de compressor, condensador, evaporador, ventilador, tubulações, sensores ou comandos.'),
(17, 'Carroceria, lataria e pintura',
  'Inspeção visual de corrosão, vedação, fixações e danos na carroceria.',
  'Funilaria, pintura, reparo de amassados, corrosão, para-choques, painéis, portas e outros componentes externos.'),
(18, 'Vidros, espelhos, limpadores e lavadores',
  'Inspeção de palhetas, esguichos, reservatório, espelhos e funcionamento dos comandos.',
  'Substituição de para-brisa, vidros, espelhos, palhetas, motor do limpador, bomba do lavador ou mecanismos.'),
(19, 'Iluminação e sinalização',
  'Conferência de faróis, lanternas, luzes de freio, setas, luz de ré e iluminação da placa.',
  'Substituição/reparo de lâmpadas, faróis, lanternas, soquetes, comandos ou circuitos.'),
(20, 'Interior, bancos, cintos e acabamentos',
  'Inspeção de cintos, travas, bancos, fixações e itens de segurança.',
  'Reparo de bancos, trilhos, cintos, fivelas, forrações, maçanetas, puxadores e acabamentos internos.'),
(21, 'Portas, fechaduras, vidros elétricos e travas',
  'Teste de travas, fechaduras, mecanismos e comandos.',
  'Reparo de máquina de vidro, motor, fechadura, atuador, trava elétrica, dobradiças ou chicotes.'),
(22, 'Correias, tensores e sincronismo',
  'Inspeção e substituição de correias, tensores e componentes do sincronismo conforme intervalo do fabricante.',
  'Reparo de falhas ou danos em correias, tensores, polias e componentes associados; avaliar danos secundários ao motor.'),
(23, 'Filtros e serviços periódicos',
  'Substituição programada dos filtros de ar do motor, cabine, combustível e óleo, conforme o veículo e o plano do fabricante.',
  'Substituição por obstrução, contaminação, dano ou falha identificada em diagnóstico.'),
(24, 'Sistema de escaneamento e diagnóstico',
  'Leitura de parâmetros e verificações eletrônicas previstas no plano de manutenção.',
  'Escaneamento para investigar luz de avaria, falha de funcionamento, códigos de defeito e validação do reparo.'),
(25, 'Acessórios e equipamentos',
  'Inspeção de alarmes, câmera, sensores de estacionamento, rastreador e acessórios instalados.',
  'Reparo/substituição de alarmes, sensores, câmera, rastreador, multimídia ou acessórios, conforme escopo da frota.'),
(26, 'Bateria e sistema de carga',
  'Teste de estado da bateria, terminais e tensão de carga; limpeza e fixação quando necessário.',
  'Substituição de bateria defeituosa; reparo de alternador, regulador, cabos, terminais ou circuito de carga.'),
(27, 'Chassi, estrutura e fixações',
  'Inspeção visual de fixações, corrosão, proteções inferiores e danos aparentes.',
  'Reparo estrutural ou substituição de suportes e fixações danificadas, com avaliação técnica adequada.'),
(28, 'Revisão geral / inspeção multissistemas',
  'Revisão por tempo ou quilometragem com checagem dos sistemas definidos no plano do fabricante.',
  'Inspeção geral motivada por falha não localizada inicialmente; cada reparo identificado deve, sempre que possível, ser lançado também na categoria específica correspondente.'),
-- O PDF do guia traz só o texto preventivo da categoria 29 (o corretivo ficou de fora da página).
(29, 'Serviços externos e socorro',
  'Inspeções programadas em oficina terceirizada e serviços previstos no plano da frota.',
  null)
on conflict (codigo) do update set
  nome = excluded.nome,
  exemplos_preventiva = excluded.exemplos_preventiva,
  exemplos_corretiva = coalesce(excluded.exemplos_corretiva, public.frotas_manutencao_categorias.exemplos_corretiva);

-- ============================================================
-- 2. Planos de manutenção (intervalos do guia)
-- ============================================================
-- veiculo_id nulo = plano padrão da frota; preenchido = exceção daquele veículo (manual do fabricante).
-- O plano do veículo com o mesmo código substitui o padrão (ativo=false desliga o item para o veículo).
-- Intervalos com faixa no guia (ex.: 5.000 a 10.000 km): intervalo_* é o usado no cálculo (o menor,
-- mais conservador) e intervalo_*_max guarda o limite superior só como referência.
create table if not exists public.frotas_manutencao_planos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  nome text not null,
  categoria_codigo smallint not null references public.frotas_manutencao_categorias(codigo),
  tipo text not null default 'servico' check (tipo in ('servico', 'verificacao')),
  veiculo_id uuid references public.frotas_veiculos(id) on delete cascade,
  intervalo_km numeric check (intervalo_km > 0),
  intervalo_km_max numeric,
  intervalo_meses integer check (intervalo_meses > 0),
  intervalo_meses_max integer,
  intervalo_dias integer check (intervalo_dias > 0),
  antecedencia_km numeric not null default 1000,
  antecedencia_dias integer not null default 15,
  observacao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint frotas_manut_planos_tem_intervalo
    check (intervalo_km is not null or intervalo_meses is not null or intervalo_dias is not null)
);

create unique index if not exists uq_frotas_manut_planos_codigo
  on public.frotas_manutencao_planos (codigo, coalesce(veiculo_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists idx_frotas_manut_planos_categoria on public.frotas_manutencao_planos (categoria_codigo);

drop trigger if exists trg_frotas_manut_planos_updated on public.frotas_manutencao_planos;
create trigger trg_frotas_manut_planos_updated
  before update on public.frotas_manutencao_planos
  for each row execute function public.set_updated_at();

insert into public.frotas_manutencao_planos
  (codigo, nome, categoria_codigo, tipo, intervalo_km, intervalo_km_max, intervalo_meses, intervalo_meses_max, intervalo_dias, antecedencia_km, antecedencia_dias, observacao)
select v.* from (values
  -- Suspensão
  ('suspensao_inspecao',  'Inspeção da suspensão',                    11::smallint, 'verificacao', 10000::numeric, null::numeric, 12, null::int, null::int, 1000::numeric, 15, 'A cada 10.000 km ou 1 ano (o que ocorrer primeiro).'),
  ('amortecedores',       'Troca de amortecedores',                   11, 'servico',     40000, 60000, null, null, null, 2000, 30, 'Troca preventiva entre 40.000 e 60.000 km, ou ao notar folgas, ruídos e vazamentos. Buchas, pivôs e bieletas: troca conforme desgaste identificado nas revisões.'),
  -- Freios
  ('freios_inspecao',     'Inspeção dos freios',                      9,  'verificacao', 10000, null,  6,    null, null, 1000, 15, 'A cada 10.000 km ou 6 meses.'),
  ('pastilhas_freio',     'Troca de pastilhas de freio',              9,  'servico',     20000, 40000, null, null, null, 2000, 30, 'Duram em média de 20.000 a 40.000 km (varia muito com o uso urbano/estrada).'),
  ('discos_freio',        'Troca de discos de freio',                 9,  'servico',     40000, 80000, null, null, null, 2000, 30, 'Geralmente a cada 2 trocas de pastilhas, ou ao atingir a espessura mínima indicada pelo fabricante.'),
  ('fluido_freio',        'Troca do fluido de freio',                 9,  'servico',     20000, null,  12,   null, null, 1000, 15, 'Troca completa a cada 1 ano ou 20.000 km (DOT 4 / DOT 5.1): absorve umidade e perde eficiência.'),
  -- Motor, ignição e correias
  ('motor_inspecao',      'Inspeção do motor',                        1,  'verificacao', 10000, null,  12,   null, null, 1000, 15, 'A cada 10.000 km ou 1 ano.'),
  ('correia_dentada',     'Troca de correia dentada e tensor',        22, 'servico',     40000, 60000, 36,   60,   null, 2000, 60, 'Entre 40.000 e 60.000 km ou a cada 3 a 5 anos. Se romper, causa severos danos ao motor.'),
  ('velas_ignicao',       'Troca de velas de ignição',                5,  'servico',     20000, 50000, null, null, null, 2000, 30, 'Entre 20.000 e 50.000 km; velas de Iridium podem durar até 80.000 km.'),
  ('correias_auxiliares', 'Troca de correias auxiliares',             22, 'servico',     40000, null,  36,   null, null, 2000, 60, 'A cada 40.000 km ou 3 anos (alternador/direção).'),
  -- Arrefecimento
  ('arref_nivel',         'Verificação do nível do arrefecimento',    3,  'verificacao', null,  null,  1,    null, null, 1000, 5,  'Nível do reservatório checado mensalmente, com o motor frio.'),
  ('arref_inspecao',      'Inspeção completa do arrefecimento',       3,  'verificacao', 10000, null,  12,   null, null, 1000, 15, 'A cada 10.000 km ou 1 ano.'),
  ('arref_aditivo',       'Limpeza do sistema e troca do aditivo',    3,  'servico',     30000, null,  24,   null, null, 1000, 30, 'A cada 30.000 km ou 2 anos (evita oxidação, corrosão e superaquecimento).'),
  ('arref_termostato_mangueiras', 'Troca da válvula termostática e mangueiras', 3, 'servico', 60000, 80000, null, null, null, 2000, 30, 'Substituição preventiva entre 60.000 e 80.000 km, ou ao apresentar ressecamento/falhas.'),
  -- Injeção
  ('injecao_scanner',     'Escaneamento da injeção',                  24, 'verificacao', 10000, null,  12,   null, null, 1000, 15, 'A cada 10.000 km ou 1 ano (scanner na revisão), ou imediatamente se a luz de injeção acender no painel.'),
  ('injecao_limpeza',     'Limpeza de bicos injetores e corpo de borboleta (TBI)', 4, 'servico', 20000, 30000, null, null, null, 2000, 30, 'Recomendada a cada 20.000 a 30.000 km, ou se houver oscilação na marcha lenta e falhas na aceleração.'),
  -- Óleo e filtros
  ('oleo_nivel',          'Verificação do nível do óleo',             2,  'verificacao', null,  null,  null, null, 15,   1000, 3,  'Checar o nível na vareta a cada 15 dias ou antes de viagens longas.'),
  ('oleo_motor',          'Troca de óleo e filtro de óleo do motor',  2,  'servico',     5000,  10000, 6,    12,   null, 500,  15, 'A cada 5.000 a 10.000 km ou 6 a 12 meses, seguindo rigorosamente a especificação do manual do proprietário.'),
  ('filtro_combustivel',  'Troca do filtro de combustível',           23, 'servico',     10000, null,  12,   null, null, 1000, 15, 'A cada 10.000 km ou 1 ano.'),
  ('filtro_ar_motor',     'Troca do filtro de ar do motor',           23, 'servico',     10000, null,  null, null, null, 1000, 15, 'A cada 10.000 km (menor intervalo se rodar em estradas de terra).'),
  ('filtro_cabine',       'Troca do filtro de cabine (ar-condicionado)', 23, 'servico',  10000, null,  12,   null, null, 1000, 15, 'A cada 10.000 km ou 1 ano (ou se notar mau cheiro/perda de eficiência do ar).'),
  -- Pneus
  ('pneus_calibragem',    'Calibragem dos pneus',                     13, 'verificacao', null,  null,  null, null, 15,   1000, 3,  'A cada 15 dias, sempre com os pneus frios, e antes de pegar estrada.'),
  ('pneus_alinhamento_balanceamento', 'Alinhamento, balanceamento e rodízio', 13, 'servico', 10000, null, null, null, null, 1000, 15, 'A cada 10.000 km, após forte impacto em buracos ou ao trocar os pneus.'),
  ('pneus_troca',         'Troca dos pneus',                          13, 'servico',     null,  null,  60,   72,   null, 1000, 60, 'Quando a profundidade dos sulcos atingir 1,6 mm (indicador TWI) ou, no máximo, 5 a 6 anos de fabricação (mesmo com pouca rodagem, pelo ressecamento da borracha).')
) as v(codigo, nome, categoria_codigo, tipo, intervalo_km, intervalo_km_max, intervalo_meses, intervalo_meses_max, intervalo_dias, antecedencia_km, antecedencia_dias, observacao)
where not exists (
  select 1 from public.frotas_manutencao_planos p where p.codigo = v.codigo and p.veiculo_id is null
);

-- ============================================================
-- 3. frotas_manutencoes: colunas do fluxo
-- ============================================================
create sequence if not exists public.frotas_manutencoes_numero_seq;

alter table public.frotas_manutencoes
  add column if not exists numero bigint not null default nextval('public.frotas_manutencoes_numero_seq'),
  add column if not exists status text not null default 'solicitada'
    check (status in ('solicitada','em_orcamento','em_aprovacao','aprovada','em_execucao','concluida','reprovada','cancelada')),
  add column if not exists natureza text check (natureza in ('preventiva','corretiva')),
  add column if not exists prioridade text not null default 'normal' check (prioridade in ('baixa','normal','alta','urgente')),
  add column if not exists veiculo_parado boolean not null default false,
  add column if not exists origem text not null default 'manual' check (origem in ('manual','plano','checklist','ocorrencia','motorista')),
  add column if not exists km_solicitacao numeric,
  add column if not exists diagnostico text,
  add column if not exists sem_orcamento boolean not null default false,
  add column if not exists solicitado_em timestamptz not null default now(),
  add column if not exists solicitado_por uuid,
  add column if not exists solicitante_nome text,
  add column if not exists valor_aprovado numeric,
  add column if not exists aprovado_em timestamptz,
  add column if not exists aprovado_por uuid,
  add column if not exists aprovado_por_nome text,
  add column if not exists os_numero text,
  add column if not exists os_emitida_em timestamptz,
  add column if not exists concluida_em timestamptz,
  add column if not exists concluida_por_nome text,
  add column if not exists motivo_status text,
  add column if not exists linha_tempo jsonb not null default '[]'::jsonb;

alter sequence public.frotas_manutencoes_numero_seq owned by public.frotas_manutencoes.numero;
create unique index if not exists uq_frotas_manutencoes_numero on public.frotas_manutencoes (numero);
create index if not exists idx_frotas_manutencoes_status on public.frotas_manutencoes (status, solicitado_em desc);

-- data_execucao passa a ser a data em que o serviço foi realmente feito (preenchida na conclusão).
alter table public.frotas_manutencoes alter column data_execucao drop not null;
alter table public.frotas_manutencoes alter column data_execucao drop default;

comment on column public.frotas_manutencoes.natureza is 'Por que foi feito: preventiva ou corretiva. Obrigatória a partir da aprovação; cada item pode ter a sua (revisão geral com reparos).';
comment on column public.frotas_manutencoes.custo is 'Custo FINAL real, preenchido na conclusão. Valores de orçamento ficam em frotas_manutencao_orcamentos.';
comment on column public.frotas_manutencoes.data_execucao is 'Data em que o serviço foi realizado (preenchida na conclusão).';

-- ============================================================
-- 4. Itens (uma ordem pode tocar várias categorias)
-- ============================================================
create table if not exists public.frotas_manutencao_itens (
  id uuid primary key default gen_random_uuid(),
  manutencao_id uuid not null references public.frotas_manutencoes(id) on delete cascade,
  categoria_codigo smallint not null references public.frotas_manutencao_categorias(codigo),
  natureza text check (natureza in ('preventiva','corretiva')),
  tipo_item text not null default 'servico' check (tipo_item in ('servico','peca')),
  descricao text not null,
  plano_id uuid references public.frotas_manutencao_planos(id) on delete set null,
  quantidade numeric not null default 1 check (quantidade > 0),
  valor numeric check (valor >= 0),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_frotas_manut_itens_manut on public.frotas_manutencao_itens (manutencao_id);
create index if not exists idx_frotas_manut_itens_plano on public.frotas_manutencao_itens (plano_id) where plano_id is not null;
create index if not exists idx_frotas_manut_itens_categoria on public.frotas_manutencao_itens (categoria_codigo);

drop trigger if exists trg_frotas_manut_itens_updated on public.frotas_manutencao_itens;
create trigger trg_frotas_manut_itens_updated
  before update on public.frotas_manutencao_itens
  for each row execute function public.set_updated_at();

comment on column public.frotas_manutencao_itens.natureza is 'Se nulo, vale a natureza da manutenção.';
comment on column public.frotas_manutencao_itens.plano_id is 'Plano do guia atendido por este item: ao concluir, zera o vencimento daquele plano para o veículo.';

-- ============================================================
-- 5. Orçamentos
-- ============================================================
create table if not exists public.frotas_manutencao_orcamentos (
  id uuid primary key default gen_random_uuid(),
  manutencao_id uuid not null references public.frotas_manutencoes(id) on delete cascade,
  fornecedor text not null,
  fornecedor_contato text,
  valor_pecas numeric check (valor_pecas >= 0),
  valor_mao_obra numeric check (valor_mao_obra >= 0),
  valor_total numeric not null check (valor_total >= 0),
  prazo_dias integer check (prazo_dias >= 0),
  validade date,
  condicoes_pagamento text,
  garantia text,
  anexo_url text,
  observacoes text,
  selecionado boolean not null default false,
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_frotas_manut_orc_manut on public.frotas_manutencao_orcamentos (manutencao_id);
-- Um único orçamento escolhido por manutenção.
create unique index if not exists uq_frotas_manut_orc_selecionado
  on public.frotas_manutencao_orcamentos (manutencao_id) where selecionado;

drop trigger if exists trg_frotas_manut_orc_updated on public.frotas_manutencao_orcamentos;
create trigger trg_frotas_manut_orc_updated
  before update on public.frotas_manutencao_orcamentos
  for each row execute function public.set_updated_at();

-- ============================================================
-- 6. Regras do fluxo (um só lugar, vale para qualquer escritor)
-- ============================================================
create or replace function public.frotas_manutencao_ator_nome()
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    nullif(public.painel_current_context() #>> '{user,nome}', ''),
    nullif(public.painel_current_context() #>> '{user,email}', ''),
    'Sistema'
  );
$$;

create or replace function public.frotas_manutencoes_fluxo()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_nome text := public.frotas_manutencao_ator_nome();
  v_usuario boolean := auth.uid() is not null;  -- service role / migrations não passam pelas travas de permissão
  v_validos text[];
  v_orc record;
  v_qtd_itens integer;
begin
  if tg_op = 'INSERT' then
    if v_usuario and new.status <> 'solicitada' then
      raise exception 'Toda manutenção nasce como solicitada.' using errcode = 'check_violation';
    end if;
    new.solicitado_por := coalesce(new.solicitado_por, auth.uid());
    new.solicitante_nome := coalesce(nullif(new.solicitante_nome, ''), v_nome);
    new.solicitado_em := coalesce(new.solicitado_em, now());
    new.linha_tempo := jsonb_build_array(jsonb_build_object(
      'em', now(), 'de', null, 'para', new.status, 'por', v_nome, 'nota', null));
    return new;
  end if;

  -- UPDATE: o cliente não reescreve carimbos do fluxo.
  if v_usuario then
    new.numero := old.numero;
    new.solicitado_em := old.solicitado_em;
    new.solicitado_por := old.solicitado_por;
    new.solicitante_nome := old.solicitante_nome;
    new.aprovado_em := old.aprovado_em;
    new.aprovado_por := old.aprovado_por;
    new.aprovado_por_nome := old.aprovado_por_nome;
    new.valor_aprovado := old.valor_aprovado;
    new.os_emitida_em := old.os_emitida_em;
    new.concluida_em := old.concluida_em;
    new.concluida_por_nome := old.concluida_por_nome;
    new.linha_tempo := old.linha_tempo;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  v_validos := case old.status
    when 'solicitada'    then array['em_orcamento','aprovada','cancelada']
    when 'em_orcamento'  then array['em_aprovacao','aprovada','cancelada']
    when 'em_aprovacao'  then array['aprovada','reprovada','em_orcamento','cancelada']
    when 'reprovada'     then array['em_orcamento','cancelada']
    when 'aprovada'      then array['em_execucao','cancelada']
    when 'em_execucao'   then array['concluida','cancelada']
    else array[]::text[]
  end;
  if not (new.status = any (v_validos)) then
    raise exception 'Não é possível mover a manutenção de "%" para "%".', old.status, new.status
      using errcode = 'check_violation';
  end if;

  select count(*) into v_qtd_itens from public.frotas_manutencao_itens where manutencao_id = new.id;

  if new.status = 'em_aprovacao' then
    if not exists (select 1 from public.frotas_manutencao_orcamentos where manutencao_id = new.id) then
      raise exception 'Cadastre ao menos um orçamento antes de enviar para aprovação.' using errcode = 'check_violation';
    end if;
  end if;

  if new.status = 'aprovada' then
    if v_usuario and not public.painel_has_module(array['frotas_manutencao'], true) then
      raise exception 'Sem permissão para aprovar manutenção.' using errcode = 'insufficient_privilege';
    end if;
    if new.natureza is null then
      raise exception 'Informe a natureza (preventiva ou corretiva) antes de aprovar.' using errcode = 'check_violation';
    end if;
    if v_qtd_itens = 0 then
      raise exception 'Informe ao menos um item (categoria do guia) antes de aprovar.' using errcode = 'check_violation';
    end if;
    select * into v_orc from public.frotas_manutencao_orcamentos
      where manutencao_id = new.id and selecionado limit 1;
    if found then
      new.valor_aprovado := v_orc.valor_total;
      new.oficina := coalesce(nullif(new.oficina, ''), v_orc.fornecedor);
    elsif new.sem_orcamento and new.valor_aprovado is not null then
      null; -- aprovada sem orçamento, com valor estimado informado por quem aprova
    elsif new.sem_orcamento then
      raise exception 'Aprovação sem orçamento exige o valor estimado aprovado.' using errcode = 'check_violation';
    else
      raise exception 'Selecione o orçamento aprovado (ou marque "sem orçamento" e informe o valor).' using errcode = 'check_violation';
    end if;
    new.aprovado_em := now();
    new.aprovado_por := auth.uid();
    new.aprovado_por_nome := v_nome;
  end if;

  if new.status = 'reprovada' then
    if v_usuario and not public.painel_has_module(array['frotas_manutencao'], true) then
      raise exception 'Sem permissão para reprovar manutenção.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  if new.status in ('reprovada','cancelada') and nullif(btrim(coalesce(new.motivo_status, '')), '') is null then
    raise exception 'Informe o motivo.' using errcode = 'check_violation';
  end if;

  if new.status = 'em_execucao' then
    new.os_numero := coalesce(nullif(btrim(coalesce(new.os_numero, '')), ''), 'OS-' || lpad(new.numero::text, 6, '0'));
    new.os_emitida_em := now();
  end if;

  if new.status = 'concluida' then
    if new.data_execucao is null or new.km_execucao is null or new.custo is null then
      raise exception 'Para concluir informe data, km e custo final.' using errcode = 'check_violation';
    end if;
    new.concluida_em := now();
    new.concluida_por_nome := v_nome;
  end if;

  new.linha_tempo := coalesce(old.linha_tempo, '[]'::jsonb) || jsonb_build_object(
    'em', now(), 'de', old.status, 'para', new.status, 'por', v_nome,
    'nota', case when new.status in ('reprovada','cancelada') then new.motivo_status else null end);
  if new.status not in ('reprovada','cancelada') then
    new.motivo_status := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_frotas_manutencoes_fluxo on public.frotas_manutencoes;
create trigger trg_frotas_manutencoes_fluxo
  before insert or update on public.frotas_manutencoes
  for each row execute function public.frotas_manutencoes_fluxo();

-- Orçamento: um só selecionado por manutenção; travado depois da aprovação.
create or replace function public.frotas_manutencao_orcamentos_regras()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_manut uuid := coalesce(new.manutencao_id, old.manutencao_id);
  v_status text;
begin
  select status into v_status from public.frotas_manutencoes where id = v_manut;
  if v_status in ('aprovada','em_execucao','concluida','cancelada') and auth.uid() is not null then
    raise exception 'Orçamentos não podem mais ser alterados (manutenção %).', v_status using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if new.selecionado then
    update public.frotas_manutencao_orcamentos
       set selecionado = false
     where manutencao_id = new.manutencao_id and id <> new.id and selecionado;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_frotas_manut_orc_regras on public.frotas_manutencao_orcamentos;
create trigger trg_frotas_manut_orc_regras
  before insert or update or delete on public.frotas_manutencao_orcamentos
  for each row execute function public.frotas_manutencao_orcamentos_regras();

-- Itens: editáveis até concluir/cancelar (achados extras na oficina entram durante a execução).
create or replace function public.frotas_manutencao_itens_regras()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status from public.frotas_manutencoes
   where id = coalesce(new.manutencao_id, old.manutencao_id);
  if v_status in ('concluida','cancelada') and auth.uid() is not null then
    raise exception 'Manutenção % não aceita mais alteração de itens.', v_status using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_frotas_manut_itens_regras on public.frotas_manutencao_itens;
create trigger trg_frotas_manut_itens_regras
  before insert or update or delete on public.frotas_manutencao_itens
  for each row execute function public.frotas_manutencao_itens_regras();

-- ============================================================
-- 7. Vencimentos por veículo × plano
-- ============================================================
-- Base do cálculo: última manutenção CONCLUÍDA com item ligado ao plano (casado pelo código do plano,
-- então a exceção de um veículo herda o histórico do padrão). Sem histórico = 'sem_historico'.
create or replace view public.frotas_manutencao_vencimentos_v
with (security_invoker = true) as
with hoje as (
  select (now() at time zone 'America/Sao_Paulo')::date as d
),
alvo as (
  select p.id as plano_id, p.codigo, p.nome as plano_nome, p.categoria_codigo, p.tipo,
         p.intervalo_km, p.intervalo_meses, p.intervalo_dias, p.antecedencia_km, p.antecedencia_dias,
         v.id as veiculo_id, v.placa, v.marca_modelo, v.coordenacao, v.supervisao,
         nullif(v.hodometro, 0) as hodometro
    from public.frotas_manutencao_planos p
    join public.frotas_veiculos v on (p.veiculo_id is null or p.veiculo_id = v.id)
   where p.ativo
     and upper(coalesce(v.status, 'ATIVO')) = 'ATIVO'
     and not (p.veiculo_id is null and exists (
           select 1 from public.frotas_manutencao_planos o where o.codigo = p.codigo and o.veiculo_id = v.id))
),
ultima as (
  select m.veiculo_id, pl.codigo,
         max(m.data_execucao) as data_ultima,
         (array_agg(m.km_execucao order by m.data_execucao desc, m.concluida_em desc nulls last))[1] as km_ultima
    from public.frotas_manutencoes m
    join public.frotas_manutencao_itens i on i.manutencao_id = m.id
    join public.frotas_manutencao_planos pl on pl.id = i.plano_id
   where m.status = 'concluida'
   group by m.veiculo_id, pl.codigo
),
aberta as (
  select m.veiculo_id, pl.codigo, count(distinct m.id) as qtd
    from public.frotas_manutencoes m
    join public.frotas_manutencao_itens i on i.manutencao_id = m.id
    join public.frotas_manutencao_planos pl on pl.id = i.plano_id
   where m.status not in ('concluida','cancelada','reprovada')
   group by m.veiculo_id, pl.codigo
),
calc as (
  select a.*, u.data_ultima, u.km_ultima, coalesce(ab.qtd, 0) > 0 as em_andamento,
         case when a.intervalo_km is not null and u.km_ultima is not null then u.km_ultima + a.intervalo_km end as vencimento_km,
         case when u.data_ultima is not null and (a.intervalo_meses is not null or a.intervalo_dias is not null)
              then (u.data_ultima + make_interval(months => coalesce(a.intervalo_meses, 0), days => coalesce(a.intervalo_dias, 0)))::date end as vencimento_data
    from alvo a
    left join ultima u on u.veiculo_id = a.veiculo_id and u.codigo = a.codigo
    left join aberta ab on ab.veiculo_id = a.veiculo_id and ab.codigo = a.codigo
)
select c.veiculo_id, c.placa, c.marca_modelo, c.coordenacao, c.supervisao,
       c.plano_id, c.codigo as plano_codigo, c.plano_nome, c.tipo,
       c.categoria_codigo, cat.nome as categoria_nome,
       c.data_ultima, c.km_ultima, c.hodometro,
       c.vencimento_km, c.vencimento_data,
       case when c.vencimento_km is not null and c.hodometro is not null then c.vencimento_km - c.hodometro end as km_restante,
       case when c.vencimento_data is not null then c.vencimento_data - h.d end as dias_restantes,
       c.em_andamento,
       case
         when c.data_ultima is null then 'sem_historico'
         when (c.vencimento_km is not null and c.hodometro is not null and c.hodometro > c.vencimento_km)
           or (c.vencimento_data is not null and c.vencimento_data < h.d) then 'vencida'
         when (c.vencimento_km is not null and c.hodometro is not null and c.hodometro >= c.vencimento_km - c.antecedencia_km)
           or (c.vencimento_data is not null and c.vencimento_data - c.antecedencia_dias <= h.d) then 'proxima'
         when c.vencimento_data is null and c.vencimento_km is not null and c.hodometro is null then 'sem_hodometro'
         else 'em_dia'
       end as status
  from calc c
  cross join hoje h
  join public.frotas_manutencao_categorias cat on cat.codigo = c.categoria_codigo;

comment on view public.frotas_manutencao_vencimentos_v is
  'Vencimento de cada plano do guia por veículo ativo: última execução concluída + intervalo, contra hodômetro e data de hoje (Brasília).';

-- ============================================================
-- 8. RLS (segue o acesso ao menu Manutenção, como nos rastreadores)
-- ============================================================
alter table public.frotas_manutencao_categorias enable row level security;
alter table public.frotas_manutencao_planos enable row level security;
alter table public.frotas_manutencao_itens enable row level security;
alter table public.frotas_manutencao_orcamentos enable row level security;

-- Referência (categorias e planos): todo mundo com o menu lê; só quem edita no módulo muda os planos.
drop policy if exists frotas_manut_categorias_select on public.frotas_manutencao_categorias;
create policy frotas_manut_categorias_select on public.frotas_manutencao_categorias
  for select to authenticated
  using (public.painel_has_module(array['frotas_manutencao','frotas_troca_oleo','frotas','dashboard_socio'], false));

drop policy if exists frotas_manut_categorias_write on public.frotas_manutencao_categorias;
create policy frotas_manut_categorias_write on public.frotas_manutencao_categorias
  for all to authenticated
  using (public.painel_has_module(array['frotas_manutencao'], true))
  with check (public.painel_has_module(array['frotas_manutencao'], true));

drop policy if exists frotas_manut_planos_select on public.frotas_manutencao_planos;
create policy frotas_manut_planos_select on public.frotas_manutencao_planos
  for select to authenticated
  using (public.painel_has_module(array['frotas_manutencao','frotas_troca_oleo','frotas','dashboard_socio'], false));

drop policy if exists frotas_manut_planos_write on public.frotas_manutencao_planos;
create policy frotas_manut_planos_write on public.frotas_manutencao_planos
  for all to authenticated
  using (public.painel_has_module(array['frotas_manutencao'], true))
  with check (public.painel_has_module(array['frotas_manutencao'], true));

-- Operação (manutenções, itens, orçamentos): quem tem o menu opera; aprovar/reprovar exige "pode editar"
-- (travado no trigger frotas_manutencoes_fluxo). O dashboard do sócio só lê (custos do mês).
drop policy if exists frotas_manutencoes_authenticated on public.frotas_manutencoes;
drop policy if exists frotas_manutencoes_select on public.frotas_manutencoes;
create policy frotas_manutencoes_select on public.frotas_manutencoes
  for select to authenticated
  using (public.painel_has_module(array['frotas_manutencao','frotas_troca_oleo','frotas','dashboard_socio'], false));

drop policy if exists frotas_manutencoes_write on public.frotas_manutencoes;
create policy frotas_manutencoes_write on public.frotas_manutencoes
  for all to authenticated
  using (public.painel_has_module(array['frotas_manutencao'], false))
  with check (public.painel_has_module(array['frotas_manutencao'], false));

drop policy if exists frotas_manut_itens_select on public.frotas_manutencao_itens;
create policy frotas_manut_itens_select on public.frotas_manutencao_itens
  for select to authenticated
  using (public.painel_has_module(array['frotas_manutencao','frotas','dashboard_socio'], false));

drop policy if exists frotas_manut_itens_write on public.frotas_manutencao_itens;
create policy frotas_manut_itens_write on public.frotas_manutencao_itens
  for all to authenticated
  using (public.painel_has_module(array['frotas_manutencao'], false))
  with check (public.painel_has_module(array['frotas_manutencao'], false));

drop policy if exists frotas_manut_orc_select on public.frotas_manutencao_orcamentos;
create policy frotas_manut_orc_select on public.frotas_manutencao_orcamentos
  for select to authenticated
  using (public.painel_has_module(array['frotas_manutencao'], false));

drop policy if exists frotas_manut_orc_write on public.frotas_manutencao_orcamentos;
create policy frotas_manut_orc_write on public.frotas_manutencao_orcamentos
  for all to authenticated
  using (public.painel_has_module(array['frotas_manutencao'], false))
  with check (public.painel_has_module(array['frotas_manutencao'], false));
