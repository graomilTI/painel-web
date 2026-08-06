-- ============================================================================
-- Migration: reestruturação completa — estruturas de apoio do plano (26/07/2026)
--
-- Cria as tabelas de apoio exigidas pelas seções 3 a 12 do plano de
-- reestruturação que ainda não existem no banco. Todas as instruções são
-- idempotentes (IF NOT EXISTS / DROP POLICY IF EXISTS) e podem ser executadas
-- quantas vezes for necessário sem efeito colateral.
--
-- Padrões aplicados (plano 2.3):
--   • chave primária uuid;
--   • timestamps created_at/updated_at;
--   • responsável pela criação/alteração;
--   • índices nos campos de filtro e relacionamentos;
--   • RLS habilitado com policies para usuários autenticados;
--   • comentários nas tabelas.
-- ============================================================================

-- ── Função utilitária de updated_at ─────────────────────────────────────────
create or replace function public.fn_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
-- ============================================================================
-- 4.3 Conferência de laudos
-- ============================================================================
create table if not exists public.logistica_conferencias (
  id uuid primary key default gen_random_uuid(),
  os_id text not null,
  numero_os text,
  arquivo_url text not null,
  arquivo_nome text,
  versao integer not null default 1,
  usuario text not null,
  data_envio timestamptz not null default now(),
  data_conferencia timestamptz,
  responsavel text,
  status text not null default 'Enviado',
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  criado_por text,
  atualizado_por text
);
comment on table public.logistica_conferencias is 'Laudos enviados pela Programação para conferência da Logística (plano 4.3).';
create index if not exists idx_log_conf_os on public.logistica_conferencias (os_id);
create index if not exists idx_log_conf_status on public.logistica_conferencias (status);
create index if not exists idx_log_conf_data on public.logistica_conferencias (data_envio desc);
alter table public.logistica_conferencias enable row level security;
drop policy if exists p_log_conf_sel on public.logistica_conferencias;
create policy p_log_conf_sel on public.logistica_conferencias for select to authenticated using (true);
drop policy if exists p_log_conf_ins on public.logistica_conferencias;
create policy p_log_conf_ins on public.logistica_conferencias for insert to authenticated with check (true);
drop policy if exists p_log_conf_upd on public.logistica_conferencias;
create policy p_log_conf_upd on public.logistica_conferencias for update to authenticated using (true) with check (true);
drop trigger if exists tg_log_conf_touch on public.logistica_conferencias;
create trigger tg_log_conf_touch before update on public.logistica_conferencias
  for each row execute function public.fn_touch_updated_at();
-- ============================================================================
-- 4.4 Ajuste de saldo + configuração de exceções por cliente (em banco)
-- ============================================================================
create table if not exists public.logistica_ajustes_saldo (
  id uuid primary key default gen_random_uuid(),
  os_id text not null,
  numero_os text,
  cliente text,
  saldo_anterior numeric,
  saldo_solicitado numeric,
  saldo_aprovado numeric,
  motivo text,
  anexo_url text,
  solicitante text,
  responsavel_ajuste text,
  data date not null default current_date,
  status text not null default 'Solicitado',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  criado_por text,
  atualizado_por text
);
comment on table public.logistica_ajustes_saldo is 'Solicitações de ajuste de saldo de OS (plano 4.4).';
create index if not exists idx_log_ajuste_os on public.logistica_ajustes_saldo (os_id);
create index if not exists idx_log_ajuste_status on public.logistica_ajustes_saldo (status);
alter table public.logistica_ajustes_saldo enable row level security;
drop policy if exists p_log_ajuste_sel on public.logistica_ajustes_saldo;
create policy p_log_ajuste_sel on public.logistica_ajustes_saldo for select to authenticated using (true);
drop policy if exists p_log_ajuste_ins on public.logistica_ajustes_saldo;
create policy p_log_ajuste_ins on public.logistica_ajustes_saldo for insert to authenticated with check (true);
drop policy if exists p_log_ajuste_upd on public.logistica_ajustes_saldo;
create policy p_log_ajuste_upd on public.logistica_ajustes_saldo for update to authenticated using (true) with check (true);
drop trigger if exists tg_log_ajuste_touch on public.logistica_ajustes_saldo;
create trigger tg_log_ajuste_touch before update on public.logistica_ajustes_saldo
  for each row execute function public.fn_touch_updated_at();
create table if not exists public.logistica_ajuste_config (
  id uuid primary key default gen_random_uuid(),
  cliente text not null unique,
  anexo_obrigatorio boolean not null default false,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.logistica_ajuste_config is 'Exceções por cliente do ajuste de saldo — mantidas no banco, não no código (plano 4.4).';
alter table public.logistica_ajuste_config enable row level security;
drop policy if exists p_log_ajcfg_sel on public.logistica_ajuste_config;
create policy p_log_ajcfg_sel on public.logistica_ajuste_config for select to authenticated using (true);
drop policy if exists p_log_ajcfg_ins on public.logistica_ajuste_config;
create policy p_log_ajcfg_ins on public.logistica_ajuste_config for insert to authenticated with check (true);
drop policy if exists p_log_ajcfg_upd on public.logistica_ajuste_config;
create policy p_log_ajcfg_upd on public.logistica_ajuste_config for update to authenticated using (true) with check (true);
-- ============================================================================
-- 4.7 Informativos / NHE — registro de parâmetros de cada geração
-- ============================================================================
create table if not exists public.logistica_informativos_geracoes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,                    -- 'Volume de Embarques' | 'NHE'
  periodo_inicio date,
  periodo_fim date,
  minimo_cargas integer,
  gerado_por text,
  origem text not null default 'manual', -- 'manual' | 'automatica'
  parametros jsonb,
  arquivo_url text,
  created_at timestamptz not null default now()
);
comment on table public.logistica_informativos_geracoes is 'Histórico e parâmetros de cada geração de informativo/NHE (plano 4.7).';
create index if not exists idx_log_inf_tipo on public.logistica_informativos_geracoes (tipo, created_at desc);
alter table public.logistica_informativos_geracoes enable row level security;
drop policy if exists p_log_inf_sel on public.logistica_informativos_geracoes;
create policy p_log_inf_sel on public.logistica_informativos_geracoes for select to authenticated using (true);
drop policy if exists p_log_inf_ins on public.logistica_informativos_geracoes;
create policy p_log_inf_ins on public.logistica_informativos_geracoes for insert to authenticated with check (true);
-- ============================================================================
-- 4.8 Classificadores — monitoramento e escalonamento
-- ============================================================================
create table if not exists public.logistica_classificadores_monitor (
  id uuid primary key default gen_random_uuid(),
  os_id text not null,
  numero_os text,
  classificador text,
  ultima_atualizacao timestamptz,
  notificacao_enviada_em timestamptz,
  resposta text,                          -- 'ativo' | 'finalizado' | 'embarque suspenso'
  resposta_em timestamptz,
  atraso_horas numeric,
  situacao text not null default 'Aguardando',
  escalonado boolean not null default false,
  escalonado_para text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.logistica_classificadores_monitor is 'Monitoramento de OS sem atualização por classificador (plano 4.8).';
create index if not exists idx_log_class_os on public.logistica_classificadores_monitor (os_id);
create index if not exists idx_log_class_situacao on public.logistica_classificadores_monitor (situacao);
alter table public.logistica_classificadores_monitor enable row level security;
drop policy if exists p_log_class_sel on public.logistica_classificadores_monitor;
create policy p_log_class_sel on public.logistica_classificadores_monitor for select to authenticated using (true);
drop policy if exists p_log_class_ins on public.logistica_classificadores_monitor;
create policy p_log_class_ins on public.logistica_classificadores_monitor for insert to authenticated with check (true);
drop policy if exists p_log_class_upd on public.logistica_classificadores_monitor;
create policy p_log_class_upd on public.logistica_classificadores_monitor for update to authenticated using (true) with check (true);
drop trigger if exists tg_log_class_touch on public.logistica_classificadores_monitor;
create trigger tg_log_class_touch before update on public.logistica_classificadores_monitor
  for each row execute function public.fn_touch_updated_at();
-- ============================================================================
-- 4.9 Exportações e relatórios ao cliente — histórico com parâmetros
-- ============================================================================
create table if not exists public.logistica_exportacoes_historico (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  parametros jsonb,
  versao integer not null default 1,
  arquivo_url text,
  destinatarios text[],
  enviado_email boolean not null default false,
  enviado_em timestamptz,
  gerado_por text,
  created_at timestamptz not null default now()
);
comment on table public.logistica_exportacoes_historico is 'Histórico de exportações/relatórios enviados ao cliente com parâmetros e destinatários (plano 4.9).';
create index if not exists idx_log_exp_tipo on public.logistica_exportacoes_historico (tipo, created_at desc);
alter table public.logistica_exportacoes_historico enable row level security;
drop policy if exists p_log_exp_sel on public.logistica_exportacoes_historico;
create policy p_log_exp_sel on public.logistica_exportacoes_historico for select to authenticated using (true);
drop policy if exists p_log_exp_ins on public.logistica_exportacoes_historico;
create policy p_log_exp_ins on public.logistica_exportacoes_historico for insert to authenticated with check (true);
-- ============================================================================
-- 5.4 Distribuição de OS — responsável e histórico
-- ============================================================================
create table if not exists public.operacional_os_distribuicao (
  id uuid primary key default gen_random_uuid(),
  os_id text not null,
  numero_os text,
  responsavel_atual text not null,
  distribuido_por text not null,
  motivo text,
  redistribuicao boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.operacional_os_distribuicao is 'Histórico de distribuição/redistribuição de OS (plano 5.4). O responsável atual é o registro mais recente.';
create index if not exists idx_os_dist_os on public.operacional_os_distribuicao (os_id, created_at desc);
alter table public.operacional_os_distribuicao enable row level security;
drop policy if exists p_os_dist_sel on public.operacional_os_distribuicao;
create policy p_os_dist_sel on public.operacional_os_distribuicao for select to authenticated using (true);
drop policy if exists p_os_dist_ins on public.operacional_os_distribuicao;
create policy p_os_dist_ins on public.operacional_os_distribuicao for insert to authenticated with check (true);
-- ============================================================================
-- 5.5 Termos versionados (celular, veículo, patrimônio, equipamentos)
-- ============================================================================
create table if not exists public.termos_documentos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,                     -- 'celular' | 'veiculo' | 'patrimonio' | 'equipamento'
  colaborador_id text,
  colaborador_nome text,
  patrimonio_id text,
  versao integer not null default 1,
  arquivo_url text,
  assinado boolean not null default false,
  assinado_em timestamptz,
  validade date,
  status text not null default 'Ativo',
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  criado_por text
);
comment on table public.termos_documentos is 'Termos versionados de celular, veículo, patrimônio e equipamentos (plano 5.5).';
create index if not exists idx_termos_tipo on public.termos_documentos (tipo, status);
create index if not exists idx_termos_colab on public.termos_documentos (colaborador_id);
alter table public.termos_documentos enable row level security;
drop policy if exists p_termos_sel on public.termos_documentos;
create policy p_termos_sel on public.termos_documentos for select to authenticated using (true);
drop policy if exists p_termos_ins on public.termos_documentos;
create policy p_termos_ins on public.termos_documentos for insert to authenticated with check (true);
drop policy if exists p_termos_upd on public.termos_documentos;
create policy p_termos_upd on public.termos_documentos for update to authenticated using (true) with check (true);
drop trigger if exists tg_termos_touch on public.termos_documentos;
create trigger tg_termos_touch before update on public.termos_documentos
  for each row execute function public.fn_touch_updated_at();
-- ============================================================================
-- 6.2/6.3 Notas Fiscais — fila de OCR, categorização e correções manuais
-- ============================================================================
create table if not exists public.nf_ocr_fila (
  id uuid primary key default gen_random_uuid(),
  nf_id text,
  arquivo_original_url text,
  arquivo_processado_url text,
  versao_ocr text,
  campos_extraidos jsonb,
  confianca numeric,
  erro text,
  status text not null default 'Aguardando',  -- Aguardando | Processando | Extraído | Validado | Erro
  responsavel_revisao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.nf_ocr_fila is 'Fila e resultado de OCR das notas fiscais (plano 6.2).';
create index if not exists idx_nf_ocr_status on public.nf_ocr_fila (status, created_at desc);
alter table public.nf_ocr_fila enable row level security;
drop policy if exists p_nf_ocr_sel on public.nf_ocr_fila;
create policy p_nf_ocr_sel on public.nf_ocr_fila for select to authenticated using (true);
drop policy if exists p_nf_ocr_ins on public.nf_ocr_fila;
create policy p_nf_ocr_ins on public.nf_ocr_fila for insert to authenticated with check (true);
drop policy if exists p_nf_ocr_upd on public.nf_ocr_fila;
create policy p_nf_ocr_upd on public.nf_ocr_fila for update to authenticated using (true) with check (true);
drop trigger if exists tg_nf_ocr_touch on public.nf_ocr_fila;
create trigger tg_nf_ocr_touch before update on public.nf_ocr_fila
  for each row execute function public.fn_touch_updated_at();
create table if not exists public.nf_categorizacao_correcoes (
  id uuid primary key default gen_random_uuid(),
  nf_id text not null,
  categoria_sugerida text,
  categoria_corrigida text not null,
  origem_sugestao text,                   -- 'ia' | 'regra' | 'manual'
  corrigido_por text not null,
  created_at timestamptz not null default now()
);
comment on table public.nf_categorizacao_correcoes is 'Correções manuais de categoria para melhoria da regra/IA (plano 6.3).';
create index if not exists idx_nf_catcor_nf on public.nf_categorizacao_correcoes (nf_id);
alter table public.nf_categorizacao_correcoes enable row level security;
drop policy if exists p_nf_catcor_sel on public.nf_categorizacao_correcoes;
create policy p_nf_catcor_sel on public.nf_categorizacao_correcoes for select to authenticated using (true);
drop policy if exists p_nf_catcor_ins on public.nf_categorizacao_correcoes;
create policy p_nf_catcor_ins on public.nf_categorizacao_correcoes for insert to authenticated with check (true);
-- 6.5 Estorno/reabertura de NF — colunas na tabela existente (se não houver)
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='notas_fiscais') then
    alter table public.notas_fiscais add column if not exists estornada boolean not null default false;
    alter table public.notas_fiscais add column if not exists estorno_justificativa text;
    alter table public.notas_fiscais add column if not exists estorno_por text;
    alter table public.notas_fiscais add column if not exists estorno_em timestamptz;
  end if;
end $$;
-- ============================================================================
-- 7.2 Compras — grupos de compra/pagamento/NF
-- ============================================================================
create table if not exists public.compras_grupos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'grupo_compra',   -- grupo_compra | grupo_pagamento | grupo_nf
  fornecedor text,
  descricao text,
  itens_ids text[] not null default '{}',
  total numeric not null default 0,
  status text not null default 'Aberto',
  nf_id text,
  pagamento_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  criado_por text,
  atualizado_por text
);
comment on table public.compras_grupos is 'Grupos de compra/pagamento/NF: obrigação única para itens agrupados por fornecedor (plano 7.2).';
create index if not exists idx_compras_grupos_status on public.compras_grupos (status);
create index if not exists idx_compras_grupos_forn on public.compras_grupos (fornecedor);
alter table public.compras_grupos enable row level security;
drop policy if exists p_cgrupos_sel on public.compras_grupos;
create policy p_cgrupos_sel on public.compras_grupos for select to authenticated using (true);
drop policy if exists p_cgrupos_ins on public.compras_grupos;
create policy p_cgrupos_ins on public.compras_grupos for insert to authenticated with check (true);
drop policy if exists p_cgrupos_upd on public.compras_grupos;
create policy p_cgrupos_upd on public.compras_grupos for update to authenticated using (true) with check (true);
drop trigger if exists tg_cgrupos_touch on public.compras_grupos;
create trigger tg_cgrupos_touch before update on public.compras_grupos
  for each row execute function public.fn_touch_updated_at();
-- ============================================================================
-- 8. Hospedagem — hotéis, alojamentos e reservas
-- ============================================================================
create table if not exists public.hospedagem_hoteis (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text,
  responsavel text,
  telefone text,
  email text,
  endereco text,
  cidade text,
  estado text,
  latitude numeric,
  longitude numeric,
  forma_pagamento text,
  valor_acordado numeric,
  contrato_url text,
  observacoes text,
  status text not null default 'Ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  criado_por text,
  atualizado_por text
);
comment on table public.hospedagem_hoteis is 'Cadastro de hotéis com geolocalização (plano 8.1).';
create index if not exists idx_hoteis_cidade on public.hospedagem_hoteis (cidade, estado);
create index if not exists idx_hoteis_status on public.hospedagem_hoteis (status);
alter table public.hospedagem_hoteis enable row level security;
drop policy if exists p_hoteis_sel on public.hospedagem_hoteis;
create policy p_hoteis_sel on public.hospedagem_hoteis for select to authenticated using (true);
drop policy if exists p_hoteis_ins on public.hospedagem_hoteis;
create policy p_hoteis_ins on public.hospedagem_hoteis for insert to authenticated with check (true);
drop policy if exists p_hoteis_upd on public.hospedagem_hoteis;
create policy p_hoteis_upd on public.hospedagem_hoteis for update to authenticated using (true) with check (true);
drop trigger if exists tg_hoteis_touch on public.hospedagem_hoteis;
create trigger tg_hoteis_touch before update on public.hospedagem_hoteis
  for each row execute function public.fn_touch_updated_at();
create table if not exists public.hospedagem_alojamentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  responsavel text,
  aluguel numeric,
  agua numeric,
  agua_matricula text,
  luz numeric,
  luz_matricula text,
  internet numeric,
  internet_matricula text,
  gas numeric,
  contrato_url text,
  endereco text,
  cidade text,
  estado text,
  latitude numeric,
  longitude numeric,
  capacidade integer,
  ocupacao integer not null default 0,
  status text not null default 'Ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  criado_por text,
  atualizado_por text
);
comment on table public.hospedagem_alojamentos is 'Cadastro de alojamentos com contas e matrículas (plano 8.2).';
create index if not exists idx_aloja_status on public.hospedagem_alojamentos (status);
alter table public.hospedagem_alojamentos enable row level security;
drop policy if exists p_aloja_sel on public.hospedagem_alojamentos;
create policy p_aloja_sel on public.hospedagem_alojamentos for select to authenticated using (true);
drop policy if exists p_aloja_ins on public.hospedagem_alojamentos;
create policy p_aloja_ins on public.hospedagem_alojamentos for insert to authenticated with check (true);
drop policy if exists p_aloja_upd on public.hospedagem_alojamentos;
create policy p_aloja_upd on public.hospedagem_alojamentos for update to authenticated using (true) with check (true);
drop trigger if exists tg_aloja_touch on public.hospedagem_alojamentos;
create trigger tg_aloja_touch before update on public.hospedagem_alojamentos
  for each row execute function public.fn_touch_updated_at();
create table if not exists public.hospedagem_reservas (
  id uuid primary key default gen_random_uuid(),
  colaborador_id text,
  colaborador_nome text,
  os_id text,
  numero_os text,
  local_tipo text not null default 'hotel',     -- 'hotel' | 'alojamento'
  hotel_id uuid references public.hospedagem_hoteis(id),
  alojamento_id uuid references public.hospedagem_alojamentos(id),
  quarto text,
  checkin date,
  checkout date,
  diarias integer,
  valor numeric,
  extras numeric not null default 0,
  extras_descricao text,
  status text not null default 'Reservada',     -- Reservada | Em andamento | Checkout | Cancelada
  pagamento_status text not null default 'Pendente',
  pagamento_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  criado_por text,
  atualizado_por text
);
comment on table public.hospedagem_reservas is 'Reservas de hotel/alojamento com extras e pagamento (plano 8.3).';
create index if not exists idx_reservas_colab on public.hospedagem_reservas (colaborador_id);
create index if not exists idx_reservas_os on public.hospedagem_reservas (os_id);
create index if not exists idx_reservas_status on public.hospedagem_reservas (status);
create index if not exists idx_reservas_checkin on public.hospedagem_reservas (checkin desc);
alter table public.hospedagem_reservas enable row level security;
drop policy if exists p_reservas_sel on public.hospedagem_reservas;
create policy p_reservas_sel on public.hospedagem_reservas for select to authenticated using (true);
drop policy if exists p_reservas_ins on public.hospedagem_reservas;
create policy p_reservas_ins on public.hospedagem_reservas for insert to authenticated with check (true);
drop policy if exists p_reservas_upd on public.hospedagem_reservas;
create policy p_reservas_upd on public.hospedagem_reservas for update to authenticated using (true) with check (true);
drop trigger if exists tg_reservas_touch on public.hospedagem_reservas;
create trigger tg_reservas_touch before update on public.hospedagem_reservas
  for each row execute function public.fn_touch_updated_at();
-- ============================================================================
-- 9.2 GPS — ocorrências/tratativas
-- ============================================================================
create table if not exists public.frotas_gps_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  placa text not null,
  tipo text not null,                     -- excesso_velocidade | fora_rota | parada_prolongada | sem_programacao | fora_horario | rodagem_desnecessaria
  detalhes jsonb,
  detectada_em timestamptz not null default now(),
  responsavel text,
  justificativa text,
  conclusao text,
  status text not null default 'Aberta',  -- Aberta | Em tratativa | Concluída
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  criado_por text,
  atualizado_por text
);
comment on table public.frotas_gps_ocorrencias is 'Tratativas de ocorrências de GPS (plano 9.2): cada ocorrência tem responsável, justificativa e conclusão.';
create index if not exists idx_gps_occ_placa on public.frotas_gps_ocorrencias (placa, detectada_em desc);
create index if not exists idx_gps_occ_status on public.frotas_gps_ocorrencias (status);
alter table public.frotas_gps_ocorrencias enable row level security;
drop policy if exists p_gpsocc_sel on public.frotas_gps_ocorrencias;
create policy p_gpsocc_sel on public.frotas_gps_ocorrencias for select to authenticated using (true);
drop policy if exists p_gpsocc_ins on public.frotas_gps_ocorrencias;
create policy p_gpsocc_ins on public.frotas_gps_ocorrencias for insert to authenticated with check (true);
drop policy if exists p_gpsocc_upd on public.frotas_gps_ocorrencias;
create policy p_gpsocc_upd on public.frotas_gps_ocorrencias for update to authenticated using (true) with check (true);
drop trigger if exists tg_gpsocc_touch on public.frotas_gps_ocorrencias;
create trigger tg_gpsocc_touch before update on public.frotas_gps_ocorrencias
  for each row execute function public.fn_touch_updated_at();
-- 9.3 Multas — histórico de ações (não sumir registros)
create table if not exists public.frotas_multas_acoes (
  id uuid primary key default gen_random_uuid(),
  multa_id text not null,
  acao text not null,                     -- Motorista | Identificar | Dobrar | OK | Arquivar
  detalhe jsonb,
  usuario text not null,
  created_at timestamptz not null default now()
);
comment on table public.frotas_multas_acoes is 'Histórico de cada ação sobre multas (plano 9.3).';
create index if not exists idx_multas_acoes_multa on public.frotas_multas_acoes (multa_id, created_at desc);
alter table public.frotas_multas_acoes enable row level security;
drop policy if exists p_multacoes_sel on public.frotas_multas_acoes;
create policy p_multacoes_sel on public.frotas_multas_acoes for select to authenticated using (true);
drop policy if exists p_multacoes_ins on public.frotas_multas_acoes;
create policy p_multacoes_ins on public.frotas_multas_acoes for insert to authenticated with check (true);
-- 9.5 Patrimônios — movimentações (responsável calculado pelo histórico)
create table if not exists public.patrimonios_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  patrimonio_id text not null,
  identificacao text,
  categoria text,
  tipo text not null,                     -- entrega | devolucao | transferencia | leitura
  responsavel_novo text,
  responsavel_anterior text,
  regional text,
  supervisao text,
  termo_id uuid references public.termos_documentos(id),
  observacao text,
  usuario text not null,
  created_at timestamptz not null default now()
);
comment on table public.patrimonios_movimentacoes is 'Histórico de movimentações de patrimônio; o responsável atual é derivado do histórico (plano 9.5).';
create index if not exists idx_patmov_pat on public.patrimonios_movimentacoes (patrimonio_id, created_at desc);
alter table public.patrimonios_movimentacoes enable row level security;
drop policy if exists p_patmov_sel on public.patrimonios_movimentacoes;
create policy p_patmov_sel on public.patrimonios_movimentacoes for select to authenticated using (true);
drop policy if exists p_patmov_ins on public.patrimonios_movimentacoes;
create policy p_patmov_ins on public.patrimonios_movimentacoes for insert to authenticated with check (true);
-- View do responsável atual por patrimônio (derivado do histórico)
create or replace view public.vw_patrimonios_responsavel_atual as
select distinct on (patrimonio_id)
  patrimonio_id,
  identificacao,
  categoria,
  responsavel_novo as responsavel_atual,
  regional,
  supervisao,
  created_at as desde
from public.patrimonios_movimentacoes
where tipo in ('entrega', 'transferencia')
order by patrimonio_id, created_at desc;
comment on view public.vw_patrimonios_responsavel_atual is 'Responsável atual de cada patrimônio calculado pelo histórico de movimentações (plano 9.5).';
-- ============================================================================
-- 10.2 RH — checklist de admissão e treinamento por CPF
-- ============================================================================
create table if not exists public.rh_admissao_checklist (
  id uuid primary key default gen_random_uuid(),
  colaborador_id text not null,
  colaborador_nome text,
  cpf text,
  etapa text not null,                    -- documentos | exame | contrato | graint | patrimonio | treinamento | termos
  status text not null default 'Pendente',
  responsavel text,
  concluido_em timestamptz,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.rh_admissao_checklist is 'Checklist de admissão e integração por colaborador (plano 10.2).';
create index if not exists idx_rh_adm_colab on public.rh_admissao_checklist (colaborador_id);
create unique index if not exists uq_rh_adm_colab_etapa on public.rh_admissao_checklist (colaborador_id, etapa);
alter table public.rh_admissao_checklist enable row level security;
drop policy if exists p_rhadm_sel on public.rh_admissao_checklist;
create policy p_rhadm_sel on public.rh_admissao_checklist for select to authenticated using (true);
drop policy if exists p_rhadm_ins on public.rh_admissao_checklist;
create policy p_rhadm_ins on public.rh_admissao_checklist for insert to authenticated with check (true);
drop policy if exists p_rhadm_upd on public.rh_admissao_checklist;
create policy p_rhadm_upd on public.rh_admissao_checklist for update to authenticated using (true) with check (true);
drop trigger if exists tg_rhadm_touch on public.rh_admissao_checklist;
create trigger tg_rhadm_touch before update on public.rh_admissao_checklist
  for each row execute function public.fn_touch_updated_at();
create table if not exists public.rh_treinamento_acessos (
  id uuid primary key default gen_random_uuid(),
  cpf text not null,
  colaborador_nome text,
  material text,
  tipo_material text,                     -- video | powerpoint | documento
  progresso numeric not null default 0,
  concluido boolean not null default false,
  dispositivo text,
  acessado_em timestamptz not null default now(),
  concluido_em timestamptz
);
comment on table public.rh_treinamento_acessos is 'Acessos ao treinamento por CPF: material, progresso, dispositivo e conclusão (plano 10.2).';
create index if not exists idx_rh_trein_cpf on public.rh_treinamento_acessos (cpf, acessado_em desc);
alter table public.rh_treinamento_acessos enable row level security;
drop policy if exists p_rhtrein_sel on public.rh_treinamento_acessos;
create policy p_rhtrein_sel on public.rh_treinamento_acessos for select to authenticated using (true);
drop policy if exists p_rhtrein_ins on public.rh_treinamento_acessos;
create policy p_rhtrein_ins on public.rh_treinamento_acessos for insert to authenticated with check (true);
drop policy if exists p_rhtrein_upd on public.rh_treinamento_acessos;
create policy p_rhtrein_upd on public.rh_treinamento_acessos for update to authenticated using (true) with check (true);
-- 10.3 Exames
create table if not exists public.rh_exames (
  id uuid primary key default gen_random_uuid(),
  colaborador_id text not null,
  colaborador_nome text,
  tipo text not null,                     -- Admissional | Periódico | Demissional
  clinica text,
  data_exame date,
  validade date,
  resultado text,
  apto boolean,
  anexo_url text,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  criado_por text
);
comment on table public.rh_exames is 'Exames admissionais e periódicos com validade, resultado e anexo (plano 10.3).';
create index if not exists idx_rh_exames_colab on public.rh_exames (colaborador_id);
create index if not exists idx_rh_exames_validade on public.rh_exames (validade);
alter table public.rh_exames enable row level security;
drop policy if exists p_rhexames_sel on public.rh_exames;
create policy p_rhexames_sel on public.rh_exames for select to authenticated using (true);
drop policy if exists p_rhexames_ins on public.rh_exames;
create policy p_rhexames_ins on public.rh_exames for insert to authenticated with check (true);
drop policy if exists p_rhexames_upd on public.rh_exames;
create policy p_rhexames_upd on public.rh_exames for update to authenticated using (true) with check (true);
drop trigger if exists tg_rhexames_touch on public.rh_exames;
create trigger tg_rhexames_touch before update on public.rh_exames
  for each row execute function public.fn_touch_updated_at();
-- 10.4 Contratos
create table if not exists public.rh_contratos (
  id uuid primary key default gen_random_uuid(),
  colaborador_id text not null,
  colaborador_nome text,
  tipo text not null,                     -- Experiência | Rescisão
  versao integer not null default 1,
  arquivo_url text,
  assinado boolean not null default false,
  assinado_em timestamptz,
  vencimento date,
  status text not null default 'Vigente',
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  criado_por text
);
comment on table public.rh_contratos is 'Contratos de experiência e rescisões com versões, assinaturas e vencimentos (plano 10.4).';
create index if not exists idx_rh_contratos_colab on public.rh_contratos (colaborador_id);
create index if not exists idx_rh_contratos_venc on public.rh_contratos (vencimento);
alter table public.rh_contratos enable row level security;
drop policy if exists p_rhcontr_sel on public.rh_contratos;
create policy p_rhcontr_sel on public.rh_contratos for select to authenticated using (true);
drop policy if exists p_rhcontr_ins on public.rh_contratos;
create policy p_rhcontr_ins on public.rh_contratos for insert to authenticated with check (true);
drop policy if exists p_rhcontr_upd on public.rh_contratos;
create policy p_rhcontr_upd on public.rh_contratos for update to authenticated using (true) with check (true);
drop trigger if exists tg_rhcontr_touch on public.rh_contratos;
create trigger tg_rhcontr_touch before update on public.rh_contratos
  for each row execute function public.fn_touch_updated_at();
-- 10.5 Segurança do Trabalho: EPI e CAT
create table if not exists public.rh_epi (
  id uuid primary key default gen_random_uuid(),
  colaborador_id text not null,
  colaborador_nome text,
  equipamento text not null,
  ca text,
  entrega date,
  devolucao date,
  assinatura_url text,
  observacao text,
  status text not null default 'Entregue',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  criado_por text
);
comment on table public.rh_epi is 'Entrega e devolução de EPI com assinatura (plano 10.5).';
create index if not exists idx_rh_epi_colab on public.rh_epi (colaborador_id);
alter table public.rh_epi enable row level security;
drop policy if exists p_rhepi_sel on public.rh_epi;
create policy p_rhepi_sel on public.rh_epi for select to authenticated using (true);
drop policy if exists p_rhepi_ins on public.rh_epi;
create policy p_rhepi_ins on public.rh_epi for insert to authenticated with check (true);
drop policy if exists p_rhepi_upd on public.rh_epi;
create policy p_rhepi_upd on public.rh_epi for update to authenticated using (true) with check (true);
drop trigger if exists tg_rhepi_touch on public.rh_epi;
create trigger tg_rhepi_touch before update on public.rh_epi
  for each row execute function public.fn_touch_updated_at();
create table if not exists public.rh_cat (
  id uuid primary key default gen_random_uuid(),
  colaborador_id text not null,
  colaborador_nome text,
  data_ocorrencia date not null,
  descricao text,
  gravidade text,
  anexo_url text,
  status text not null default 'Registrada',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  criado_por text
);
comment on table public.rh_cat is 'Comunicações de Acidente de Trabalho (plano 10.5).';
create index if not exists idx_rh_cat_colab on public.rh_cat (colaborador_id);
alter table public.rh_cat enable row level security;
drop policy if exists p_rhcat_sel on public.rh_cat;
create policy p_rhcat_sel on public.rh_cat for select to authenticated using (true);
drop policy if exists p_rhcat_ins on public.rh_cat;
create policy p_rhcat_ins on public.rh_cat for insert to authenticated with check (true);
drop policy if exists p_rhcat_upd on public.rh_cat;
create policy p_rhcat_upd on public.rh_cat for update to authenticated using (true) with check (true);
drop trigger if exists tg_rhcat_touch on public.rh_cat;
create trigger tg_rhcat_touch before update on public.rh_cat
  for each row execute function public.fn_touch_updated_at();
-- ============================================================================
-- 12.1 Importações — registro padronizado
-- ============================================================================
create table if not exists public.importacoes_registros (
  id uuid primary key default gen_random_uuid(),
  fonte text not null,
  periodo_inicio date,
  periodo_fim date,
  qtd_recebida integer not null default 0,
  qtd_inserida integer not null default 0,
  qtd_atualizada integer not null default 0,
  duplicidades integer not null default 0,
  erros integer not null default 0,
  detalhe_erros jsonb,
  responsavel text,
  arquivo_url text,
  job_id text,
  created_at timestamptz not null default now()
);
comment on table public.importacoes_registros is 'Registro padronizado de cada importação manual ou automática (plano 12.1).';
create index if not exists idx_import_fonte on public.importacoes_registros (fonte, created_at desc);
alter table public.importacoes_registros enable row level security;
drop policy if exists p_import_sel on public.importacoes_registros;
create policy p_import_sel on public.importacoes_registros for select to authenticated using (true);
drop policy if exists p_import_ins on public.importacoes_registros;
create policy p_import_ins on public.importacoes_registros for insert to authenticated with check (true);
-- ============================================================================
-- 12.3 Comercial — propostas com versões
-- ============================================================================
create table if not exists public.comercial_propostas (
  id uuid primary key default gen_random_uuid(),
  cliente text not null,
  produtos jsonb,
  tratamentos jsonb,
  valores jsonb,
  condicoes text,
  vencimento date,
  versao integer not null default 1,
  responsavel text,
  aprovada boolean not null default false,
  aprovada_por text,
  aprovada_em timestamptz,
  arquivo_final_url text,
  status text not null default 'Rascunho',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  criado_por text
);
comment on table public.comercial_propostas is 'Propostas comerciais com versões, aprovação e arquivo final (plano 12.3).';
create index if not exists idx_propostas_cliente on public.comercial_propostas (cliente);
create index if not exists idx_propostas_status on public.comercial_propostas (status);
alter table public.comercial_propostas enable row level security;
drop policy if exists p_propostas_sel on public.comercial_propostas;
create policy p_propostas_sel on public.comercial_propostas for select to authenticated using (true);
drop policy if exists p_propostas_ins on public.comercial_propostas;
create policy p_propostas_ins on public.comercial_propostas for insert to authenticated with check (true);
drop policy if exists p_propostas_upd on public.comercial_propostas;
create policy p_propostas_upd on public.comercial_propostas for update to authenticated using (true) with check (true);
drop trigger if exists tg_propostas_touch on public.comercial_propostas;
create trigger tg_propostas_touch before update on public.comercial_propostas
  for each row execute function public.fn_touch_updated_at();
-- ============================================================================
-- 12.4 Correios — envios e telegramas com rastreio
-- ============================================================================
create table if not exists public.correios_envios (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'Envio',     -- Envio | Telegrama
  destinatario text,
  endereco text,
  codigo_rastreio text,
  comprovante_url text,
  anexos jsonb,
  status text not null default 'Postado',
  historico jsonb not null default '[]'::jsonb,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  criado_por text
);
comment on table public.correios_envios is 'Envios e telegramas dos Correios com rastreio, comprovante e histórico (plano 12.4).';
create index if not exists idx_correios_rastreio on public.correios_envios (codigo_rastreio);
create index if not exists idx_correios_status on public.correios_envios (status);
alter table public.correios_envios enable row level security;
drop policy if exists p_correios_sel on public.correios_envios;
create policy p_correios_sel on public.correios_envios for select to authenticated using (true);
drop policy if exists p_correios_ins on public.correios_envios;
create policy p_correios_ins on public.correios_envios for insert to authenticated with check (true);
drop policy if exists p_correios_upd on public.correios_envios;
create policy p_correios_upd on public.correios_envios for update to authenticated using (true) with check (true);
drop trigger if exists tg_correios_touch on public.correios_envios;
create trigger tg_correios_touch before update on public.correios_envios
  for each row execute function public.fn_touch_updated_at();
-- ============================================================================
-- 11.4 Notificações padronizadas (sem duplicidade)
-- ============================================================================
create table if not exists public.app_notificacoes (
  id uuid primary key default gen_random_uuid(),
  modulo text not null,
  evento text not null,
  chave_dedup text,
  destinatario text,
  titulo text not null,
  mensagem text,
  lida boolean not null default false,
  lida_em timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.app_notificacoes is 'Notificações padronizadas por módulo/evento com deduplicação (plano 11.4).';
create unique index if not exists uq_notif_dedup on public.app_notificacoes (chave_dedup) where chave_dedup is not null;
create index if not exists idx_notif_dest on public.app_notificacoes (destinatario, lida, created_at desc);
alter table public.app_notificacoes enable row level security;
drop policy if exists p_notif_sel on public.app_notificacoes;
create policy p_notif_sel on public.app_notificacoes for select to authenticated using (true);
drop policy if exists p_notif_ins on public.app_notificacoes;
create policy p_notif_ins on public.app_notificacoes for insert to authenticated with check (true);
drop policy if exists p_notif_upd on public.app_notificacoes;
create policy p_notif_upd on public.app_notificacoes for update to authenticated using (true) with check (true);
-- ============================================================================
-- Fim da migration
-- ============================================================================;
