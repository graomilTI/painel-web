-- Snapshot do schema REAL do banco de produção (projeto jbzmcyycanrlnfhedcup),
-- gerado por introspecção via SQL (pg_catalog/information_schema), não é um
-- pg_dump byte-a-byte. Motivo: `supabase db dump`/`db pull` exigem Docker
-- Desktop, indisponível nesta máquina.
--
-- Este arquivo é só REFERÊNCIA para leitura/debug — não participa do fluxo
-- de `supabase migration`/`db push`. O histórico de migrations locais
-- (supabase/migrations/) está bem atrás do que foi de fato aplicado no banco
-- (deploys diretos via SSH/dashboard), ver memória
-- painel-web-grm-despesas-race-ativacao-lock.md para o achado original.
--
-- Gerado em: 2026-08-28
--
-- Conteúdo: extensions, tabelas (329), functions (233), views (39),
-- triggers (~108), cron jobs (29), indexes não ligados a PK/UNIQUE (628),
-- RLS policies (722). Cada bloco veio de uma query de introspecção contra
-- pg_catalog/information_schema, validada por contagem exata contra o banco.
--
-- Para atualizar: reexecutar as queries em cada seção contra o projeto
-- jbzmcyycanrlnfhedcup (MCP execute_sql) e substituir o bloco correspondente.

-- ============================================================
-- TABELAS
-- ============================================================

CREATE TABLE public.alojamentos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cidade text,
  uf text,
  endereco text,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT alojamentos_pkey PRIMARY KEY (id)
);

CREATE TABLE public.app_auditoria (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  usuario_id uuid,
  usuario_email text,
  modulo text NOT NULL,
  tabela text,
  registro_id text,
  acao text NOT NULL,
  valor_anterior jsonb,
  valor_novo jsonb,
  campos_alterados text[],
  origem text NOT NULL DEFAULT 'banco'::text,
  erro text,
  ip text,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT app_auditoria_acao_check CHECK ((acao = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text, 'ACTION'::text]))),
  CONSTRAINT app_auditoria_origem_check CHECK ((origem = ANY (ARRAY['banco'::text, 'frontend'::text, 'worker'::text, 'edge_function'::text, 'agente'::text]))),
  CONSTRAINT app_auditoria_pkey PRIMARY KEY (id),
  CONSTRAINT app_auditoria_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE public.app_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  usuario_id uuid,
  acao text NOT NULL,
  modulo text,
  detalhes jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT app_logs_pkey PRIMARY KEY (id),
  CONSTRAINT app_logs_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES app_usuarios(id) ON DELETE SET NULL
);

CREATE TABLE public.app_logs_usuarios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  usuario_id uuid,
  usuario_nome text,
  usuario_email text,
  usuario_role text,
  tipo text NOT NULL,
  modulo text,
  acao text NOT NULL,
  detalhes jsonb,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT app_logs_usuarios_tipo_check CHECK ((tipo = ANY (ARRAY['login'::text, 'logout'::text, 'page_access'::text, 'action'::text]))),
  CONSTRAINT app_logs_usuarios_pkey PRIMARY KEY (id),
  CONSTRAINT app_logs_usuarios_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE public.app_modulos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  nome text NOT NULL,
  categoria text,
  icone text,
  rota text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  descricao text,
  CONSTRAINT app_modulos_codigo_key UNIQUE (codigo),
  CONSTRAINT app_modulos_pkey PRIMARY KEY (id)
);

CREATE TABLE public.app_notificacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  modulo text NOT NULL,
  evento text NOT NULL,
  chave_dedup text,
  destinatario text,
  titulo text NOT NULL,
  mensagem text,
  lida boolean NOT NULL DEFAULT false,
  lida_em timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT app_notificacoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.app_perfil_modulo (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  perfil_id uuid NOT NULL,
  modulo_id uuid NOT NULL,
  pode_ver boolean NOT NULL DEFAULT false,
  pode_criar boolean NOT NULL DEFAULT false,
  pode_editar boolean NOT NULL DEFAULT false,
  pode_excluir boolean NOT NULL DEFAULT false,
  pode_aprovar boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT app_perfil_modulo_pkey PRIMARY KEY (id),
  CONSTRAINT uq_app_perfil_modulo UNIQUE (perfil_id, modulo_id),
  CONSTRAINT app_perfil_modulo_modulo_id_fkey FOREIGN KEY (modulo_id) REFERENCES app_modulos(id) ON DELETE CASCADE,
  CONSTRAINT app_perfil_modulo_perfil_id_fkey FOREIGN KEY (perfil_id) REFERENCES app_perfis(id) ON DELETE CASCADE
);

CREATE TABLE public.app_perfis (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  nome text NOT NULL,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT app_perfis_codigo_key UNIQUE (codigo),
  CONSTRAINT app_perfis_pkey PRIMARY KEY (id)
);

CREATE TABLE public.app_usuario_modulos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  modulo_id uuid NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  ativo boolean DEFAULT true,
  status text DEFAULT 'ativo'::text,
  created_by uuid,
  updated_by uuid,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT app_usuario_modulos_pkey PRIMARY KEY (id),
  CONSTRAINT app_usuario_modulos_usuario_id_modulo_id_key UNIQUE (usuario_id, modulo_id),
  CONSTRAINT app_usuario_modulos_modulo_id_fkey FOREIGN KEY (modulo_id) REFERENCES app_modulos(id) ON DELETE CASCADE,
  CONSTRAINT app_usuario_modulos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES app_usuarios(id) ON DELETE CASCADE
);

CREATE TABLE public.app_usuarios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  auth_user_id uuid,
  nome text NOT NULL,
  email text NOT NULL,
  telefone text,
  status text NOT NULL DEFAULT 'ativo'::text,
  perfil_id uuid,
  empresa text,
  coordenacao text,
  supervisao text,
  colaborador_id text,
  ultimo_login_em timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  setor text,
  ativo boolean DEFAULT true,
  CONSTRAINT app_usuarios_auth_user_id_key UNIQUE (auth_user_id),
  CONSTRAINT app_usuarios_email_key UNIQUE (email),
  CONSTRAINT app_usuarios_pkey PRIMARY KEY (id),
  CONSTRAINT app_usuarios_perfil_id_fkey FOREIGN KEY (perfil_id) REFERENCES app_perfis(id)
);

CREATE TABLE public.attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  referencia_tipo text NOT NULL,
  referencia_id uuid NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT attachments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id)
);

CREATE TABLE public.auditoria_agrupamentos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  auditor text,
  pix text,
  quantidade integer NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'AGRUPADO'::text,
  auditoria_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  pagamento_id uuid,
  CONSTRAINT auditoria_agrupamentos_pkey PRIMARY KEY (id)
);

CREATE TABLE public.auditoria_solicitacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  origem text NOT NULL DEFAULT 'EXTERNA'::text,
  status text NOT NULL DEFAULT 'ABERTA'::text,
  placa text,
  data_classificacao date,
  cliente text,
  os text,
  data_auditoria date,
  classificador text,
  perdera_bonus boolean NOT NULL DEFAULT false,
  classificacao_origem text,
  motivo_recusa text,
  resultado_auditoria text,
  observacao text,
  auditor text,
  auditor_colaborador boolean NOT NULL DEFAULT false,
  valor numeric(14,2) NOT NULL DEFAULT 0,
  pix text,
  gestor_id uuid,
  gestor text,
  coordenacao text,
  supervisao text,
  origem_detalhe jsonb,
  pagamento_solicitado boolean NOT NULL DEFAULT false,
  pagamento_id uuid,
  agrupamento_id uuid,
  ok_em timestamp with time zone,
  CONSTRAINT auditoria_solicitacoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.bonus_auditoria_inaptos (
  id bigint NOT NULL,
  competencia date NOT NULL,
  colaborador_nome text NOT NULL,
  nome_normalizado text NOT NULL,
  arquivo_nome text,
  importado_por uuid,
  importado_em timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bonus_auditoria_competencia_primeiro_dia_chk CHECK ((competencia = (date_trunc('month'::text, (competencia)::timestamp with time zone))::date)),
  CONSTRAINT bonus_auditoria_inaptos_pkey PRIMARY KEY (id),
  CONSTRAINT bonus_auditoria_competencia_nome_uk UNIQUE (competencia, nome_normalizado)
);

CREATE TABLE public.bonus_caixa_lancamentos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  competencia date NOT NULL,
  colaborador_nome text NOT NULL,
  nome_normalizado text NOT NULL,
  tons numeric NOT NULL DEFAULT 0,
  valor numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDENTE'::text,
  tentativas integer NOT NULL DEFAULT 0,
  ultimo_erro text,
  grm_retorno jsonb,
  solicitado_por uuid,
  solicitado_em timestamp with time zone NOT NULL DEFAULT now(),
  iniciado_em timestamp with time zone,
  processado_em timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bonus_caixa_lancamentos_status_check CHECK ((status = ANY (ARRAY['PENDENTE'::text, 'PROCESSANDO'::text, 'LANCADO'::text, 'ERRO'::text, 'CANCELADO'::text]))),
  CONSTRAINT bonus_caixa_competencia_primeiro_dia CHECK ((competencia = (date_trunc('month'::text, (competencia)::timestamp with time zone))::date)),
  CONSTRAINT bonus_caixa_lancamentos_pkey PRIMARY KEY (id),
  CONSTRAINT bonus_caixa_lancamentos_un UNIQUE (competencia, nome_normalizado)
);

CREATE TABLE public.bonus_competencias_fechadas (
  competencia date NOT NULL,
  fechado_em timestamp with time zone NOT NULL DEFAULT now(),
  fechado_por uuid,
  origem text NOT NULL DEFAULT 'fechamento'::text,
  observacao text,
  snapshot_qtd integer NOT NULL DEFAULT 0,
  snapshot_valor_apto numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bonus_competencia_primeiro_dia CHECK ((competencia = (date_trunc('month'::text, (competencia)::timestamp with time zone))::date)),
  CONSTRAINT bonus_competencias_fechadas_pkey PRIMARY KEY (competencia)
);

CREATE TABLE public.bonus_producao_cache (
  competencia date NOT NULL,
  colaborador text NOT NULL,
  nome_normalizado text NOT NULL,
  tons numeric NOT NULL DEFAULT 0,
  valor numeric NOT NULL DEFAULT 0,
  status text NOT NULL,
  motivo text,
  patrimonio_dias integer,
  inapto_auditoria boolean NOT NULL DEFAULT false,
  atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bonus_producao_cache_pkey PRIMARY KEY (competencia, nome_normalizado)
);

CREATE TABLE public.bonus_producao_cache_meta (
  competencia date NOT NULL,
  atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bonus_producao_cache_meta_pkey PRIMARY KEY (competencia)
);

CREATE TABLE public.bonus_producao_fechada (
  competencia date NOT NULL,
  colaborador text NOT NULL,
  nome_normalizado text NOT NULL,
  tons numeric NOT NULL DEFAULT 0,
  valor numeric NOT NULL DEFAULT 0,
  status text NOT NULL,
  motivo text,
  patrimonio_dias integer,
  inapto_auditoria boolean NOT NULL DEFAULT false,
  fonte_snapshot text NOT NULL DEFAULT 'fechamento'::text,
  status_lancamento_snapshot text,
  fechado_em timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bonus_producao_fechada_comp_primeiro_dia CHECK ((competencia = (date_trunc('month'::text, (competencia)::timestamp with time zone))::date)),
  CONSTRAINT bonus_producao_fechada_status_check CHECK ((status = ANY (ARRAY['Apto'::text, 'Inapto'::text]))),
  CONSTRAINT bonus_producao_fechada_pkey PRIMARY KEY (competencia, nome_normalizado)
);

CREATE TABLE public.bot_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tipo text,
  status text,
  total integer,
  processado integer DEFAULT 0,
  sucesso integer DEFAULT 0,
  erro integer DEFAULT 0,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone,
  CONSTRAINT bot_jobs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.bot_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tipo text,
  payload jsonb,
  status text DEFAULT 'pending'::text,
  tentativas integer DEFAULT 0,
  max_tentativas integer DEFAULT 3,
  erro text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone,
  CONSTRAINT bot_queue_pkey PRIMARY KEY (id)
);

CREATE TABLE public.botconversa_config (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  empresa text,
  chave text NOT NULL,
  valor text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT botconversa_config_pkey PRIMARY KEY (id)
);

CREATE TABLE public.botconversa_contatos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cpf text,
  nome text,
  telefone text,
  email text,
  empresa text,
  ativo boolean NOT NULL DEFAULT true,
  subscriber_id text,
  synced_at timestamp with time zone,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT botconversa_contatos_pkey PRIMARY KEY (id)
);

CREATE TABLE public.botconversa_fila (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  empresa text,
  nome text,
  cpf text,
  telefone text NOT NULL,
  subscriber_id text,
  flow_id text,
  mensagem text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pendente'::text,
  tentativas integer NOT NULL DEFAULT 0,
  ultima_tentativa_at timestamp with time zone,
  processado_at timestamp with time zone,
  erro text,
  origem text DEFAULT 'painel'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT botconversa_fila_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'processando'::text, 'enviado'::text, 'erro'::text, 'cancelado'::text]))),
  CONSTRAINT botconversa_fila_tipo_check CHECK ((tipo = ANY (ARRAY['flow'::text, 'message'::text]))),
  CONSTRAINT botconversa_fila_pkey PRIMARY KEY (id)
);

CREATE TABLE public.botconversa_fluxos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  empresa text NOT NULL,
  nome text NOT NULL,
  flow_id text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT botconversa_fluxos_empresa_nome_key UNIQUE (empresa, nome),
  CONSTRAINT botconversa_fluxos_pkey PRIMARY KEY (id)
);

CREATE TABLE public.botconversa_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  status text NOT NULL DEFAULT 'processando'::text,
  filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_processado integer NOT NULL DEFAULT 0,
  total_sucesso integer NOT NULL DEFAULT 0,
  total_erro integer NOT NULL DEFAULT 0,
  erro text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  finished_at timestamp with time zone,
  observacoes text,
  CONSTRAINT botconversa_jobs_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'processando'::text, 'concluido'::text, 'erro'::text, 'parcial'::text]))),
  CONSTRAINT botconversa_jobs_tipo_check CHECK ((tipo = ANY (ARRAY['sync_subscribers'::text, 'birthday_flow'::text, 'notificar_cartoes'::text]))),
  CONSTRAINT botconversa_jobs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.botconversa_logs (
  id bigint NOT NULL DEFAULT nextval('botconversa_logs_id_seq'::regclass),
  fila_id uuid,
  tipo text,
  empresa text,
  nome text,
  cpf text,
  telefone text,
  subscriber_id text,
  flow_id text,
  mensagem text,
  request_payload jsonb,
  response_payload jsonb,
  http_status integer,
  sucesso boolean NOT NULL DEFAULT false,
  erro text,
  origem text DEFAULT 'painel'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  job_id uuid,
  CONSTRAINT botconversa_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.botconversa_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  contato_id uuid,
  tag text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT botconversa_tags_pkey PRIMARY KEY (id),
  CONSTRAINT botconversa_tags_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES botconversa_contatos(id) ON DELETE CASCADE
);

CREATE TABLE public.botconversa_webhook_logs (
  id bigint NOT NULL DEFAULT nextval('botconversa_webhook_logs_id_seq'::regclass),
  event_name text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  headers jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT botconversa_webhook_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.chamados_ti (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  categoria text NOT NULL,
  descricao text NOT NULL,
  prioridade text NOT NULL DEFAULT 'media'::text,
  status text NOT NULL DEFAULT 'aberto'::text,
  solicitante_id uuid NOT NULL,
  solicitante_nome text NOT NULL,
  responsavel_id uuid,
  responsavel_nome text,
  modulo_relacionado text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  resolvido_em timestamp with time zone,
  CONSTRAINT chamados_ti_prioridade_check CHECK ((prioridade = ANY (ARRAY['baixa'::text, 'media'::text, 'alta'::text, 'urgente'::text]))),
  CONSTRAINT chamados_ti_status_check CHECK ((status = ANY (ARRAY['aberto'::text, 'em_andamento'::text, 'resolvido'::text, 'cancelado'::text]))),
  CONSTRAINT chamados_ti_pkey PRIMARY KEY (id)
);

CREATE TABLE public.chamados_ti_comentarios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  chamado_id uuid NOT NULL,
  autor_id uuid NOT NULL,
  autor_nome text NOT NULL,
  mensagem text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chamados_ti_comentarios_pkey PRIMARY KEY (id),
  CONSTRAINT chamados_ti_comentarios_chamado_id_fkey FOREIGN KEY (chamado_id) REFERENCES chamados_ti(id) ON DELETE CASCADE
);

CREATE TABLE public.clientes_nacionais (
  id text NOT NULL,
  grm_id integer NOT NULL,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT clientes_nacionais_pkey PRIMARY KEY (id),
  CONSTRAINT clientes_nacionais_grm_id_key UNIQUE (grm_id)
);

CREATE TABLE public.colaborador_cruzamento (
  colaborador_id uuid NOT NULL,
  cpf text,
  nome text,
  nome_chave text,
  supervisao text,
  coordenacao text,
  tipo_contrato text,
  latitude numeric,
  longitude numeric,
  endereco_base text,
  veiculo_id uuid,
  veiculo_placa text,
  auditorias_180d_qtd integer NOT NULL DEFAULT 0,
  auditorias_180d_peso numeric NOT NULL DEFAULT 0,
  atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
  salario numeric,
  CONSTRAINT colaborador_cruzamento_pkey PRIMARY KEY (colaborador_id),
  CONSTRAINT colaborador_cruzamento_colaborador_id_fkey FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE,
  CONSTRAINT colaborador_cruzamento_veiculo_id_fkey FOREIGN KEY (veiculo_id) REFERENCES frotas_veiculos(id) ON DELETE SET NULL
);

CREATE TABLE public.colaborador_cruzamento_staging (
  colaborador_id uuid NOT NULL,
  cpf text,
  nome text,
  nome_chave text,
  supervisao text,
  coordenacao text,
  tipo_contrato text,
  latitude numeric,
  longitude numeric,
  endereco_base text,
  veiculo_id uuid,
  veiculo_placa text,
  auditorias_180d_qtd integer NOT NULL DEFAULT 0,
  auditorias_180d_peso numeric NOT NULL DEFAULT 0,
  atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
  salario numeric
);

CREATE TABLE public.colaborador_importacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_referencia date NOT NULL,
  arquivo_nome text,
  origem text NOT NULL DEFAULT 'upload_manual'::text,
  importado_por uuid,
  status text NOT NULL DEFAULT 'processado'::text,
  total_linhas integer NOT NULL DEFAULT 0,
  observacoes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT colaborador_importacoes_pkey PRIMARY KEY (id),
  CONSTRAINT colaborador_importacoes_importado_por_fkey FOREIGN KEY (importado_por) REFERENCES profiles(id)
);

CREATE TABLE public.colaborador_snapshot (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  importacao_id uuid NOT NULL,
  data_referencia date NOT NULL,
  cpf text,
  nome text NOT NULL,
  situacao text,
  admissao date,
  desligamento date,
  salario numeric(14,2),
  conta_bancaria text,
  empresa text,
  coordenacao text,
  supervisao text,
  tipo text,
  cep text,
  estado text,
  cidade text,
  bairro text,
  endereco text,
  complemento text,
  data_nascimento date,
  cargo text,
  whatsapp text,
  email_pessoal text,
  email_empresa text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  email text,
  setor text,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT colaborador_snapshot_pkey PRIMARY KEY (id),
  CONSTRAINT colaborador_snapshot_importacao_id_fkey FOREIGN KEY (importacao_id) REFERENCES colaborador_importacoes(id) ON DELETE CASCADE
);

CREATE TABLE public.colaboradores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cpf text,
  nome text NOT NULL,
  situacao text,
  admissao text,
  desligamento text,
  salario text,
  conta_bancaria_despesas text,
  empresa text,
  coordenacao text,
  supervisao text,
  tipo text,
  cep text,
  estado text,
  cidade text,
  bairro text,
  endereco text,
  complemento text,
  data_nascimento text,
  cargo text,
  whatsapp text,
  email_pessoal text,
  email_empresa text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  sincronizado_em timestamp with time zone,
  CONSTRAINT colaboradores_cpf_key UNIQUE (cpf),
  CONSTRAINT colaboradores_pkey PRIMARY KEY (id)
);

CREATE TABLE public.colaboradores_historico (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  importacao_id uuid,
  data_referencia date NOT NULL,
  cpf text,
  nome text NOT NULL,
  nome_normalizado text DEFAULT _normalizar_texto_g1000(nome),
  chave_colaborador text DEFAULT COALESCE(_somente_digitos_g1000(cpf), _normalizar_texto_g1000(nome)),
  situacao text,
  ativo boolean NOT NULL DEFAULT true,
  admissao date,
  desligamento date,
  salario numeric,
  conta_bancaria text,
  empresa text,
  coordenacao text,
  supervisao text,
  tipo text,
  cep text,
  estado text,
  cidade text,
  bairro text,
  endereco text,
  complemento text,
  data_nascimento date,
  cargo text,
  whatsapp text,
  email_pessoal text,
  email_empresa text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT colaboradores_historico_nome_chk CHECK ((length(TRIM(BOTH FROM nome)) > 0)),
  CONSTRAINT colaboradores_historico_pkey PRIMARY KEY (id)
);

CREATE TABLE public.colaboradores_status_historico (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  colaborador_id uuid,
  cpf text NOT NULL,
  nome text NOT NULL,
  situacao_anterior text,
  situacao_nova text NOT NULL,
  ativo_anterior boolean,
  ativo_novo boolean NOT NULL,
  data_efetiva date NOT NULL,
  detectado_em timestamp with time zone NOT NULL DEFAULT now(),
  fonte text NOT NULL DEFAULT 'grmserver_relatorio_colaboradores'::text,
  relatorio_referencia timestamp with time zone,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT colaboradores_status_historico_pkey PRIMARY KEY (id)
);

CREATE TABLE public.comercial_propostas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente text NOT NULL,
  produtos jsonb,
  tratamentos jsonb,
  valores jsonb,
  condicoes text,
  vencimento date,
  versao integer NOT NULL DEFAULT 1,
  responsavel text,
  aprovada boolean NOT NULL DEFAULT false,
  aprovada_por text,
  aprovada_em timestamp with time zone,
  arquivo_final_url text,
  status text NOT NULL DEFAULT 'Rascunho'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  criado_por text,
  CONSTRAINT comercial_propostas_pkey PRIMARY KEY (id)
);

CREATE TABLE public.compras_cotacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  titulo text,
  status text NOT NULL DEFAULT 'em_cotacao'::text,
  itens_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  fornecedor text,
  valor_total numeric,
  forma_pagamento text,
  dados_pagamento text,
  boleto_url text,
  chave_pix text,
  link_pagamento text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT compras_cotacoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.compras_estoque_config (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT compras_estoque_config_pkey PRIMARY KEY (id),
  CONSTRAINT compras_estoque_config_tipo_nome_key UNIQUE (tipo, nome)
);

CREATE TABLE public.compras_estoque_inventarios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL,
  estoque_sistema numeric(12,2) NOT NULL DEFAULT 0,
  estoque_contado numeric(12,2) NOT NULL DEFAULT 0,
  diferenca numeric(12,2) NOT NULL DEFAULT 0,
  motivo_ajuste text NOT NULL,
  usuario_id uuid,
  usuario_nome text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT compras_estoque_inventarios_pkey PRIMARY KEY (id),
  CONSTRAINT compras_estoque_inventarios_material_id_fkey FOREIGN KEY (material_id) REFERENCES compras_estoque_materiais(id) ON DELETE RESTRICT
);

CREATE TABLE public.compras_estoque_materiais (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  categoria text NOT NULL DEFAULT 'Outros'::text,
  tamanho text,
  codigo_interno text,
  unidade text NOT NULL DEFAULT 'UN'::text,
  estoque_atual numeric(12,2) NOT NULL DEFAULT 0,
  estoque_minimo numeric(12,2) NOT NULL DEFAULT 0,
  estoque_maximo numeric(12,2) NOT NULL DEFAULT 0,
  local_armazenamento text,
  observacao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT compras_estoque_materiais_pkey PRIMARY KEY (id)
);

CREATE TABLE public.compras_estoque_movimentacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL,
  tipo_movimentacao text NOT NULL,
  quantidade numeric(12,2) NOT NULL,
  data_movimentacao date NOT NULL DEFAULT CURRENT_DATE,
  fornecedor text,
  valor_unitario numeric(12,2),
  numero_nf text,
  destino text,
  colaborador_id text,
  colaborador_nome text,
  coordenacao text,
  supervisao text,
  motivo text,
  observacao text,
  usuario_id uuid,
  usuario_nome text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT compras_estoque_movimentacoes_quantidade_check CHECK ((quantidade >= (0)::numeric)),
  CONSTRAINT compras_estoque_movimentacoes_tipo_movimentacao_check CHECK ((tipo_movimentacao = ANY (ARRAY['entrada'::text, 'saida'::text, 'ajuste'::text, 'transferencia'::text]))),
  CONSTRAINT compras_estoque_movimentacoes_pkey PRIMARY KEY (id),
  CONSTRAINT compras_estoque_movimentacoes_material_id_fkey FOREIGN KEY (material_id) REFERENCES compras_estoque_materiais(id) ON DELETE RESTRICT
);

CREATE TABLE public.compras_grupos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT 'grupo_compra'::text,
  fornecedor text,
  descricao text,
  itens_ids text[] NOT NULL DEFAULT '{}'::text[],
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Aberto'::text,
  nf_id text,
  pagamento_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  criado_por text,
  atualizado_por text,
  CONSTRAINT compras_grupos_pkey PRIMARY KEY (id)
);

CREATE TABLE public.compras_itens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL,
  unidade numeric NOT NULL DEFAULT 1,
  quantidade numeric NOT NULL DEFAULT 1,
  material text NOT NULL,
  tipo text,
  tamanho text,
  colaborador_id text,
  colaborador_nome text,
  colaborador_tipo text,
  uniforme_cor text,
  status text NOT NULL DEFAULT 'pendente'::text,
  valor_unitario numeric,
  valor_total numeric,
  forma_pagamento text,
  dados_pagamento text,
  boleto_url text,
  chave_pix text,
  link_pagamento text,
  comprovante_url text,
  nf_url text,
  marca text,
  mensagem_aprovacao text,
  aprovado_por text,
  aprovado_em timestamp with time zone,
  recusado_por text,
  motivo_recusa text,
  comprado_em timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  nf_lancado boolean NOT NULL DEFAULT false,
  nf_lancado_em timestamp with time zone,
  regional text,
  colaborador_cpf text,
  colaborador_rg text,
  colaborador_data_nascimento date,
  colaborador_funcao text,
  colaborador_cargo text,
  colaborador_setor text,
  colaborador_supervisao text,
  colaborador_coordenacao text,
  colaborador_data_admissao date,
  ca text,
  fornecedor text,
  nf_lembrete_enviado_em timestamp with time zone,
  CONSTRAINT compras_itens_pkey PRIMARY KEY (id),
  CONSTRAINT compras_itens_solicitacao_id_fkey FOREIGN KEY (solicitacao_id) REFERENCES compras_solicitacoes(id) ON DELETE CASCADE
);

CREATE TABLE public.compras_notificacoes_config (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  setor text NOT NULL,
  nome text NOT NULL,
  telefone text NOT NULL,
  cpf text,
  empresa text DEFAULT 'Grao 1000'::text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT compras_notificacoes_config_pkey PRIMARY KEY (id)
);

CREATE TABLE public.compras_patrimonios_cadastro (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  compra_item_id uuid,
  numero_patrimonio text,
  material text,
  marca text,
  coordenacao text,
  observacao text,
  status text NOT NULL DEFAULT 'aguardando_numero'::text,
  informado_em timestamp with time zone,
  conferido_em timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT compras_patrimonios_cadastro_pkey PRIMARY KEY (id),
  CONSTRAINT compras_patrimonios_cadastro_compra_item_id_fkey FOREIGN KEY (compra_item_id) REFERENCES compras_itens(id) ON DELETE SET NULL
);

CREATE TABLE public.compras_solicitacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_solicitacao date NOT NULL,
  solicitante text,
  item text,
  quantidade numeric(14,2),
  prioridade text DEFAULT 'normal'::text,
  status text NOT NULL DEFAULT 'aberto'::text,
  observacoes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  coordenacao text,
  solicitante_id uuid,
  tipo_solicitacao text,
  fornecedor text,
  telefone_fornecedor text,
  updated_at timestamp with time zone DEFAULT now(),
  supervisao text,
  colaborador_id text,
  colaborador_nome text,
  CONSTRAINT compras_solicitacoes_pkey PRIMARY KEY (id),
  CONSTRAINT compras_solicitacoes_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE public.conferencia_descontos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_referencia date,
  nome text,
  colaborador text DEFAULT nome,
  regional text,
  coordenacao text,
  supervisao text,
  un integer DEFAULT 0,
  quantidade integer DEFAULT un,
  prazo_devolucao date,
  prazo date DEFAULT prazo_devolucao,
  situacao text DEFAULT 'PENDENTE'::text,
  status text DEFAULT 'PENDENTE'::text,
  observacoes text,
  observacao text DEFAULT observacoes,
  valor numeric(14,2) DEFAULT 0,
  origem text DEFAULT 'PATRIMONIO_DESLIGADOS'::text,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT conferencia_descontos_pkey PRIMARY KEY (id)
);

CREATE TABLE public.conferencia_despesas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_referencia date NOT NULL DEFAULT CURRENT_DATE,
  tipo_despesa text NOT NULL,
  valor numeric(14,2) NOT NULL DEFAULT 0,
  descricao text,
  setor_destino text NOT NULL,
  programacao_id uuid,
  status text NOT NULL DEFAULT 'pendente'::text,
  criado_por uuid,
  criado_por_nome text,
  conferido_por uuid,
  conferido_em timestamp with time zone,
  notificacao_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT conferencia_despesas_pkey PRIMARY KEY (id),
  CONSTRAINT conferencia_despesas_notificacao_id_fkey FOREIGN KEY (notificacao_id) REFERENCES painel_notificacoes(id) ON DELETE SET NULL,
  CONSTRAINT conferencia_despesas_programacao_id_fkey FOREIGN KEY (programacao_id) REFERENCES programacao_dia(id) ON DELETE SET NULL
);

CREATE TABLE public.conferencia_geocoding_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  address_key text NOT NULL,
  endereco_original text NOT NULL,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  display_name text,
  provider text NOT NULL DEFAULT 'nominatim'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT conferencia_geocoding_cache_address_key_key UNIQUE (address_key),
  CONSTRAINT conferencia_geocoding_cache_pkey PRIMARY KEY (id)
);

CREATE TABLE public.conferencia_localizacao_colaboradores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_referencia date NOT NULL,
  colaborador_key text NOT NULL,
  nome_colaborador text,
  os_id uuid,
  numero_os text,
  cliente text,
  supervisao text,
  coordenacao text,
  colaborador_latitude numeric,
  colaborador_longitude numeric,
  os_ponto_nome text,
  os_latitude numeric,
  os_longitude numeric,
  ponto_embarque_id uuid,
  ponto_embarque_nome text,
  ponto_embarque_latitude numeric,
  ponto_embarque_longitude numeric,
  distancia_km numeric,
  atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
  login_latitude double precision,
  login_longitude double precision,
  login_hora time without time zone,
  login_distancia_km numeric,
  CONSTRAINT conferencia_localizacao_colaboradores_pkey PRIMARY KEY (id),
  CONSTRAINT conferencia_localizacao_colab_data_referencia_colaborador_k_key UNIQUE (data_referencia, colaborador_key, os_id),
  CONSTRAINT conferencia_localizacao_colaboradores_os_id_fkey FOREIGN KEY (os_id) REFERENCES operacional_os(id) ON DELETE CASCADE,
  CONSTRAINT conferencia_localizacao_colaboradores_ponto_embarque_id_fkey FOREIGN KEY (ponto_embarque_id) REFERENCES operacional_pontos_embarque(id) ON DELETE SET NULL
);

CREATE TABLE public.conferencia_uber_corridas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_hora_transacao_utc timestamp with time zone,
  hora_solicitacao_utc text,
  data_solicitacao_local date,
  hora_solicitacao_local text,
  data_chegada_utc date,
  hora_chegada_utc text,
  data_chegada_local date,
  hora_chegada_local text,
  nome text,
  coord text,
  supervisao text,
  grupo text,
  servico text,
  programa text,
  cidade text,
  pais text,
  distancia_mi numeric,
  duracao_min numeric,
  endereco_partida text,
  endereco_destino text,
  detalhamento_despesa text,
  preco_liquido numeric DEFAULT 0,
  partida_latitude numeric,
  partida_longitude numeric,
  destino_latitude numeric,
  destino_longitude numeric,
  status_validacao text NOT NULL DEFAULT 'ATENCAO'::text,
  classificacao_manual text,
  observacao_validacao text,
  validado_por uuid,
  validado_por_nome text,
  validado_em timestamp with time zone,
  importacao_id uuid,
  arquivo_nome text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  import_hash text,
  arquivo_origem text,
  external_id text,
  nome_colaborador text,
  valor numeric,
  observacao text,
  motivo_validacao text,
  origem text,
  raw jsonb,
  centro_custo text,
  distancia_km numeric,
  email text,
  matricula text,
  regional text,
  metodo_pagamento text,
  finalidade text,
  CONSTRAINT conferencia_uber_corridas_pkey PRIMARY KEY (id),
  CONSTRAINT conferencia_uber_external_id_unique UNIQUE (external_id),
  CONSTRAINT conferencia_uber_import_hash_unique UNIQUE (import_hash),
  CONSTRAINT conferencia_uber_corridas_classificacao_manual_check CHECK (((classificacao_manual IS NULL) OR (classificacao_manual = ANY (ARRAY['ATENCAO'::text, 'VALIDADA'::text, 'CAIXA_COLABORADOR'::text, 'GORJETA'::text])))),
  CONSTRAINT conferencia_uber_corridas_status_validacao_check CHECK (((status_validacao IS NULL) OR (status_validacao = ANY (ARRAY['PENDENTE'::text, 'VALIDADO'::text, 'CAIXA'::text, 'ATENCAO'::text, 'ATENÇÃO'::text, 'REVISAR'::text, 'IGNORADO'::text, 'GORJETA'::text]))))
);

CREATE TABLE public.contato_cliente_registros (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_contato date NOT NULL,
  cliente text,
  contato text,
  assunto text,
  retorno_previsto date,
  status text NOT NULL DEFAULT 'aberto'::text,
  observacoes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  participantes_cliente jsonb DEFAULT '[]'::jsonb,
  participantes_grao1000 jsonb DEFAULT '[]'::jsonb,
  anexos jsonb DEFAULT '[]'::jsonb,
  CONSTRAINT contato_cliente_registros_pkey PRIMARY KEY (id),
  CONSTRAINT contato_cliente_registros_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE public.correios_envios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT 'Envio'::text,
  destinatario text,
  endereco text,
  codigo_rastreio text,
  comprovante_url text,
  anexos jsonb,
  status text NOT NULL DEFAULT 'Postado'::text,
  historico jsonb NOT NULL DEFAULT '[]'::jsonb,
  observacao text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  criado_por text,
  CONSTRAINT correios_envios_pkey PRIMARY KEY (id)
);

CREATE TABLE public.dashboard_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  modulo text NOT NULL,
  referencia text NOT NULL,
  escopo text NOT NULL DEFAULT 'geral'::text,
  ano integer,
  mes integer,
  dados_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  hash_origem text,
  origem_importacao text,
  atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
  atualizado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT dashboard_cache_modulo_referencia_key UNIQUE (modulo, referencia),
  CONSTRAINT dashboard_cache_pkey PRIMARY KEY (id)
);

CREATE TABLE public.departments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT departments_code_key UNIQUE (code),
  CONSTRAINT departments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.deslocamento_config (
  chave text NOT NULL,
  valor jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT deslocamento_config_pkey PRIMARY KEY (chave)
);

CREATE TABLE public.diretoria_desenvolvimento (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  modulo text NOT NULL,
  submenu text,
  tipo text NOT NULL DEFAULT 'MELHORIA'::text,
  status text NOT NULL DEFAULT 'PLANEJAMENTO'::text,
  prioridade text NOT NULL DEFAULT 'MEDIA'::text,
  progresso smallint NOT NULL DEFAULT 0,
  responsavel text,
  descricao text NOT NULL,
  proxima_etapa text,
  impedimentos text,
  data_inicio date,
  previsao_conclusao date,
  data_conclusao date,
  ordem integer NOT NULL DEFAULT 100,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_by_name text,
  updated_by uuid,
  updated_by_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT diretoria_desenvolvimento_tipo_check CHECK ((tipo = ANY (ARRAY['NOVO_MODULO'::text, 'NOVA_TELA'::text, 'MELHORIA'::text, 'CORRECAO'::text, 'INTEGRACAO'::text, 'AUTOMACAO'::text]))),
  CONSTRAINT diretoria_desenvolvimento_status_check CHECK ((status = ANY (ARRAY['PLANEJAMENTO'::text, 'BACKEND'::text, 'INTEGRACAO'::text, 'FRONTEND'::text, 'VALIDACAO'::text, 'AGUARDANDO'::text, 'CONCLUIDO'::text, 'PAUSADO'::text]))),
  CONSTRAINT diretoria_desenvolvimento_prioridade_check CHECK ((prioridade = ANY (ARRAY['BAIXA'::text, 'MEDIA'::text, 'ALTA'::text, 'CRITICA'::text]))),
  CONSTRAINT diretoria_desenvolvimento_progresso_check CHECK (((progresso >= 0) AND (progresso <= 100))),
  CONSTRAINT diretoria_desenvolvimento_pkey PRIMARY KEY (id),
  CONSTRAINT diretoria_desenvolvimento_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT diretoria_desenvolvimento_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE public.diretoria_desenvolvimento_atualizacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  desenvolvimento_id uuid NOT NULL,
  progresso_anterior smallint,
  progresso_novo smallint,
  status_anterior text,
  status_novo text,
  descricao text NOT NULL,
  autor_id uuid,
  autor_nome text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT diretoria_desenvolvimento_atualizacoes_progresso_anterior_check CHECK (((progresso_anterior IS NULL) OR ((progresso_anterior >= 0) AND (progresso_anterior <= 100)))),
  CONSTRAINT diretoria_desenvolvimento_atualizacoes_progresso_novo_check CHECK (((progresso_novo IS NULL) OR ((progresso_novo >= 0) AND (progresso_novo <= 100)))),
  CONSTRAINT diretoria_desenvolvimento_atualizacoes_pkey PRIMARY KEY (id),
  CONSTRAINT diretoria_desenvolvimento_atualizacoes_desenvolvimento_id_fkey FOREIGN KEY (desenvolvimento_id) REFERENCES diretoria_desenvolvimento(id) ON DELETE CASCADE,
  CONSTRAINT diretoria_desenvolvimento_atualizacoes_autor_id_fkey FOREIGN KEY (autor_id) REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE public.dre_despesas_mensal (
  id bigint NOT NULL DEFAULT nextval('dre_despesas_mensal_id_seq'::regclass),
  ano integer NOT NULL,
  mes integer NOT NULL,
  coordenacao text NOT NULL,
  total_coordenacao numeric(14,2),
  total_geral numeric(14,2),
  total_todas_regionais numeric(14,2),
  rateio numeric(14,2),
  total_com_rateio numeric(14,2),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT dre_despesas_mensal_ano_mes_coordenacao_key UNIQUE (ano, mes, coordenacao),
  CONSTRAINT dre_despesas_mensal_pkey PRIMARY KEY (id)
);

CREATE TABLE public.dre_importacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ano integer NOT NULL,
  origem text DEFAULT 'painel'::text,
  status text NOT NULL DEFAULT 'processado'::text,
  total_linhas integer DEFAULT 0,
  observacoes text,
  criado_por uuid,
  criado_por_nome text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT dre_importacoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.dre_lancamentos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  importacao_id uuid,
  ano integer NOT NULL,
  mes integer NOT NULL,
  mes_nome text NOT NULL,
  regional text NOT NULL,
  tipo_dre text NOT NULL DEFAULT 'regional'::text,
  indicador text NOT NULL,
  valor numeric DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT dre_lancamentos_mes_check CHECK (((mes >= 1) AND (mes <= 12))),
  CONSTRAINT dre_lancamentos_pkey PRIMARY KEY (id),
  CONSTRAINT dre_lancamentos_importacao_id_fkey FOREIGN KEY (importacao_id) REFERENCES dre_importacoes(id) ON DELETE CASCADE
);

CREATE TABLE public.efetivos_sem_producao (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_referencia date,
  colaborador text,
  coordenacao text,
  supervisao text,
  cargo text,
  tipo text,
  motivo text,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT efetivos_sem_producao_pkey PRIMARY KEY (id)
);

CREATE TABLE public.email_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text NOT NULL,
  provider text NOT NULL DEFAULT 'CPANEL'::text,
  imap_host text NOT NULL DEFAULT 'mail.grao1000.com.br'::text,
  imap_port integer NOT NULL DEFAULT 993,
  imap_secure boolean NOT NULL DEFAULT true,
  smtp_host text NOT NULL DEFAULT 'mail.grao1000.com.br'::text,
  smtp_port integer NOT NULL DEFAULT 465,
  smtp_secure boolean NOT NULL DEFAULT true,
  username text NOT NULL,
  password_cipher text NOT NULL,
  pasta_entrada text NOT NULL DEFAULT 'INBOX'::text,
  pasta_processados text,
  ativo boolean NOT NULL DEFAULT true,
  auto_responder boolean NOT NULL DEFAULT false,
  limite_por_sync integer NOT NULL DEFAULT 30,
  ultima_uid bigint DEFAULT 0,
  ultima_sync_em timestamp with time zone,
  ultima_sync_status text,
  ultima_sync_erro text,
  criado_por uuid,
  criado_por_nome text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT email_accounts_email_key UNIQUE (email),
  CONSTRAINT email_accounts_pkey PRIMARY KEY (id)
);

CREATE TABLE public.email_attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email_id uuid NOT NULL,
  nome_arquivo text NOT NULL,
  mime_type text,
  tamanho_bytes bigint,
  storage_bucket text NOT NULL DEFAULT 'email-anexos'::text,
  storage_path text,
  content_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  tipo_arquivo text,
  file_name text,
  dados_extraidos jsonb NOT NULL DEFAULT '{}'::jsonb,
  interpretacao_status text,
  interpretado_em timestamp with time zone,
  CONSTRAINT email_attachments_pkey PRIMARY KEY (id),
  CONSTRAINT email_attachments_email_id_fkey FOREIGN KEY (email_id) REFERENCES email_messages(id) ON DELETE CASCADE
);

CREATE TABLE public.email_gestores_regionais (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  regional text NOT NULL,
  gestor_nome text NOT NULL,
  gestor_email text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT email_gestores_regionais_pkey PRIMARY KEY (id),
  CONSTRAINT email_gestores_regionais_regional_key UNIQUE (regional)
);

CREATE TABLE public.email_historico (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email_id uuid,
  outbox_id uuid,
  usuario_id uuid,
  usuario_nome text,
  acao text NOT NULL,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT email_historico_pkey PRIMARY KEY (id),
  CONSTRAINT email_historico_email_id_fkey FOREIGN KEY (email_id) REFERENCES email_messages(id) ON DELETE CASCADE,
  CONSTRAINT email_historico_outbox_id_fkey FOREIGN KEY (outbox_id) REFERENCES email_outbox(id) ON DELETE SET NULL
);

CREATE TABLE public.email_mailbox_states (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  mailbox_path text NOT NULL,
  uid_validity text,
  ultima_uid bigint NOT NULL DEFAULT 0,
  ultima_sync_em timestamp with time zone,
  ultima_sync_status text,
  ultima_sync_erro text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT email_mailbox_states_account_id_mailbox_path_key UNIQUE (account_id, mailbox_path),
  CONSTRAINT email_mailbox_states_pkey PRIMARY KEY (id),
  CONSTRAINT email_mailbox_states_account_id_fkey FOREIGN KEY (account_id) REFERENCES email_accounts(id) ON DELETE CASCADE
);

CREATE TABLE public.email_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  uid bigint,
  message_id text NOT NULL,
  in_reply_to text,
  references_header text,
  remetente_nome text,
  remetente_email text,
  destinatario text,
  cc text,
  assunto text,
  corpo_texto text,
  corpo_html text,
  data_recebimento timestamp with time zone,
  regional text,
  categoria text,
  prioridade text NOT NULL DEFAULT 'NORMAL'::text,
  resumo_ia text,
  dados_detectados jsonb NOT NULL DEFAULT '{}'::jsonb,
  precisa_resposta boolean NOT NULL DEFAULT false,
  resposta_sugerida text,
  status text NOT NULL DEFAULT 'NOVO'::text,
  responsavel_id uuid,
  responsavel_nome text,
  classificado_por text DEFAULT 'worker'::text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  message_uid bigint,
  remetente text,
  risco text DEFAULT 'BAIXO'::text,
  encaminhar_sugerido_para text,
  encaminhar_sugerido_cc text,
  os_sugestao_aguardar jsonb,
  CONSTRAINT email_messages_prioridade_check CHECK ((prioridade = ANY (ARRAY['BAIXA'::text, 'NORMAL'::text, 'ALTA'::text, 'URGENTE'::text]))),
  CONSTRAINT email_messages_risco_check CHECK ((risco = ANY (ARRAY['BAIXO'::text, 'MEDIO'::text, 'ALTO'::text, 'CRITICO'::text]))),
  CONSTRAINT email_messages_status_check CHECK ((status = ANY (ARRAY['NOVO'::text, 'PENDENTE'::text, 'RESPONDER'::text, 'RESPONDIDO'::text, 'RESOLVIDO'::text, 'ARQUIVADO'::text, 'IGNORADO'::text, 'ERRO'::text, 'SPAM'::text]))),
  CONSTRAINT email_messages_account_id_message_id_key UNIQUE (account_id, message_id),
  CONSTRAINT email_messages_pkey PRIMARY KEY (id),
  CONSTRAINT email_messages_account_id_fkey FOREIGN KEY (account_id) REFERENCES email_accounts(id) ON DELETE CASCADE
);

CREATE TABLE public.email_outbox (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email_id uuid,
  account_id uuid NOT NULL,
  para text NOT NULL,
  cc text,
  bcc text,
  assunto text NOT NULL,
  corpo text NOT NULL,
  status text NOT NULL DEFAULT 'PENDENTE'::text,
  aprovado_por uuid,
  aprovado_por_nome text,
  aprovado_em timestamp with time zone,
  enviado_em timestamp with time zone,
  smtp_message_id text,
  erro text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  tipo text NOT NULL DEFAULT 'RESPOSTA'::text,
  CONSTRAINT email_outbox_status_check CHECK ((status = ANY (ARRAY['RASCUNHO'::text, 'PENDENTE'::text, 'ENVIANDO'::text, 'ENVIADO'::text, 'ERRO'::text, 'CANCELADO'::text]))),
  CONSTRAINT email_outbox_tipo_check CHECK ((tipo = ANY (ARRAY['RESPOSTA'::text, 'ENCAMINHAMENTO'::text]))),
  CONSTRAINT email_outbox_pkey PRIMARY KEY (id),
  CONSTRAINT email_outbox_account_id_fkey FOREIGN KEY (account_id) REFERENCES email_accounts(id) ON DELETE CASCADE,
  CONSTRAINT email_outbox_email_id_fkey FOREIGN KEY (email_id) REFERENCES email_messages(id) ON DELETE SET NULL
);

CREATE TABLE public.email_regras (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  prioridade integer NOT NULL DEFAULT 100,
  palavras_chave text[] NOT NULL DEFAULT '{}'::text[],
  remetente_contem text,
  assunto_contem text,
  regional text,
  categoria text,
  prioridade_email text,
  precisa_resposta boolean,
  resposta_modelo text,
  auto_responder boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  risco text,
  destino_regional boolean NOT NULL DEFAULT false,
  destino_fixo_email text,
  cc_fixo_email text,
  CONSTRAINT email_regras_prioridade_email_check CHECK (((prioridade_email IS NULL) OR (prioridade_email = ANY (ARRAY['BAIXA'::text, 'NORMAL'::text, 'ALTA'::text, 'URGENTE'::text])))),
  CONSTRAINT email_regras_risco_check CHECK (((risco IS NULL) OR (risco = ANY (ARRAY['BAIXO'::text, 'MEDIO'::text, 'ALTO'::text, 'CRITICO'::text])))),
  CONSTRAINT email_regras_pkey PRIMARY KEY (id)
);

CREATE TABLE public.envios_correios_token_cache (
  id integer NOT NULL DEFAULT 1,
  token text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT envios_correios_token_cache_pkey PRIMARY KEY (id)
);

CREATE TABLE public.envios_destinatarios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cpf_cnpj text,
  logradouro text NOT NULL,
  numero text NOT NULL,
  complemento text,
  bairro text NOT NULL,
  cidade text NOT NULL,
  uf character(2) NOT NULL,
  cep text NOT NULL,
  telefone text,
  email text,
  matricula text,
  origem text DEFAULT 'manual'::text,
  colaborador_id uuid,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT envios_destinatarios_nome_unique UNIQUE (nome),
  CONSTRAINT envios_destinatarios_pkey PRIMARY KEY (id)
);

CREATE TABLE public.envios_postagens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  remetente_id uuid NOT NULL,
  destinatario_id uuid NOT NULL,
  servico_codigo text NOT NULL,
  servico_nome text NOT NULL,
  peso_gramas integer NOT NULL DEFAULT 0,
  formato text NOT NULL DEFAULT 'caixa'::text,
  altura_cm numeric,
  largura_cm numeric,
  comprimento_cm numeric,
  diametro_cm numeric,
  valor_declarado numeric DEFAULT 0,
  ar_digital boolean NOT NULL DEFAULT true,
  conteudo text,
  numero_objeto text,
  id_prepostagem text,
  status text NOT NULL DEFAULT 'RASCUNHO'::text,
  valor_postagem numeric,
  observacoes text,
  confirmado_em timestamp with time zone,
  created_by text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT envios_postagens_pkey PRIMARY KEY (id),
  CONSTRAINT envios_postagens_destinatario_id_fkey FOREIGN KEY (destinatario_id) REFERENCES envios_destinatarios(id),
  CONSTRAINT envios_postagens_remetente_id_fkey FOREIGN KEY (remetente_id) REFERENCES envios_remetentes(id)
);

CREATE TABLE public.envios_rastreamento (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  postagem_id uuid NOT NULL,
  numero_objeto text NOT NULL,
  evento_data timestamp with time zone,
  evento_tipo text,
  evento_descricao text,
  evento_local text,
  raw_json jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT envios_rastreamento_pkey PRIMARY KEY (id),
  CONSTRAINT envios_rastreamento_unique UNIQUE (postagem_id, evento_data, evento_tipo),
  CONSTRAINT envios_rastreamento_postagem_id_fkey FOREIGN KEY (postagem_id) REFERENCES envios_postagens(id)
);

CREATE TABLE public.envios_remetentes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cpf_cnpj text,
  logradouro text NOT NULL,
  numero text NOT NULL,
  complemento text,
  bairro text NOT NULL,
  cidade text NOT NULL,
  uf character(2) NOT NULL,
  cep text NOT NULL,
  telefone text,
  email text,
  ativo boolean NOT NULL DEFAULT true,
  padrao boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT envios_remetentes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.envios_reversa (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid,
  empresa_id uuid,
  servico_codigo text NOT NULL DEFAULT '03312'::text,
  servico_nome text,
  peso_gramas integer DEFAULT 300,
  conteudo text,
  numero_objeto text,
  id_prepostagem text,
  status text NOT NULL DEFAULT 'RASCUNHO'::text,
  valor_postagem numeric(10,2),
  observacoes text,
  confirmado_em timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT envios_reversa_pkey PRIMARY KEY (id),
  CONSTRAINT envios_reversa_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES envios_destinatarios(id) ON DELETE SET NULL,
  CONSTRAINT envios_reversa_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES envios_remetentes(id) ON DELETE SET NULL
);

CREATE TABLE public.envios_telegramas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  remetente_id uuid,
  destinatario_id uuid,
  dest_nome text,
  dest_cep text,
  dest_logradouro text,
  dest_numero text,
  dest_complemento text,
  dest_bairro text,
  dest_cidade text,
  dest_uf text,
  mensagem text NOT NULL,
  tem_pc boolean NOT NULL DEFAULT false,
  tem_cc boolean NOT NULL DEFAULT false,
  agendamento timestamp with time zone,
  status text NOT NULL DEFAULT 'RASCUNHO'::text,
  protocolo text,
  id_telegrama text,
  numero_objeto text,
  valor_postagem numeric(10,2),
  observacoes text,
  confirmado_em timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  clinica_sst_id uuid,
  CONSTRAINT envios_telegramas_pkey PRIMARY KEY (id),
  CONSTRAINT envios_telegramas_clinica_sst_id_fkey FOREIGN KEY (clinica_sst_id) REFERENCES rh_clinicas_sst(id) ON DELETE SET NULL,
  CONSTRAINT envios_telegramas_destinatario_id_fkey FOREIGN KEY (destinatario_id) REFERENCES envios_destinatarios(id) ON DELETE SET NULL,
  CONSTRAINT envios_telegramas_remetente_id_fkey FOREIGN KEY (remetente_id) REFERENCES envios_remetentes(id) ON DELETE SET NULL
);

CREATE TABLE public.equipe_administracao_usuarios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  setor text NOT NULL,
  usuario_id uuid NOT NULL,
  funcao text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT equipe_administracao_setor_not_blank CHECK ((btrim(setor) <> ''::text)),
  CONSTRAINT equipe_administracao_funcao_not_blank CHECK ((btrim(funcao) <> ''::text)),
  CONSTRAINT equipe_administracao_usuarios_pkey PRIMARY KEY (id),
  CONSTRAINT equipe_administracao_usuarios_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES app_usuarios(id) ON DELETE CASCADE
);

CREATE TABLE public.equipe_gestores_regionais (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  regional text NOT NULL,
  supervisor_usuario_id uuid,
  suporte_usuario_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT equipe_gestores_regionais_regional_not_blank CHECK ((btrim(regional) <> ''::text)),
  CONSTRAINT equipe_gestores_regionais_responsavel_check CHECK (((supervisor_usuario_id IS NOT NULL) OR (suporte_usuario_id IS NOT NULL))),
  CONSTRAINT equipe_gestores_regionais_pkey PRIMARY KEY (id),
  CONSTRAINT equipe_gestores_regionais_supervisor_usuario_id_fkey FOREIGN KEY (supervisor_usuario_id) REFERENCES app_usuarios(id) ON DELETE SET NULL,
  CONSTRAINT equipe_gestores_regionais_suporte_usuario_id_fkey FOREIGN KEY (suporte_usuario_id) REFERENCES app_usuarios(id) ON DELETE SET NULL
);

CREATE TABLE public.excecoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  motivo text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT excecoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.exportacoes_arquivos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_id uuid,
  tipo text NOT NULL,
  filename text NOT NULL,
  mime_type text NOT NULL DEFAULT 'text/csv; charset=utf-8'::text,
  content_base64 text NOT NULL,
  bytes_size integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT exportacoes_arquivos_pkey PRIMARY KEY (id),
  CONSTRAINT exportacoes_arquivos_job_id_fkey FOREIGN KEY (job_id) REFERENCES exportacoes_jobs(id) ON DELETE CASCADE
);

CREATE TABLE public.exportacoes_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  status text NOT NULL DEFAULT 'processando'::text,
  filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_registros integer NOT NULL DEFAULT 0,
  arquivo_id uuid,
  erro text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  finished_at timestamp with time zone,
  CONSTRAINT exportacoes_jobs_status_check CHECK ((status = ANY (ARRAY['processando'::text, 'concluido'::text, 'erro'::text]))),
  CONSTRAINT exportacoes_jobs_tipo_check CHECK ((tipo = ANY (ARRAY['google_contacts'::text, 'flash'::text, 'ifood'::text, 'uber'::text]))),
  CONSTRAINT exportacoes_jobs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.faturamento_agenda (
  id text NOT NULL,
  cliente_id text,
  cliente_nome text NOT NULL,
  periodicidade text DEFAULT 'Mensal'::text,
  dia_referencia text,
  proximo_envio date,
  responsavel_id text,
  responsavel_nome text,
  canal_envio text DEFAULT 'E-mail'::text,
  observacoes text,
  ativo boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT faturamento_agenda_pkey PRIMARY KEY (id)
);

CREATE TABLE public.faturamento_clientes (
  id text NOT NULL,
  nome text NOT NULL,
  cnpj text,
  email_financeiro text,
  whatsapp text,
  periodicidade text DEFAULT 'Mensal'::text,
  prazo_retorno_dias integer DEFAULT 2,
  prazo_pagamento_dias integer DEFAULT 7,
  status text DEFAULT 'Ativo'::text,
  observacoes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT faturamento_clientes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.faturamento_documentos (
  id text NOT NULL,
  fatura_id text,
  cliente_nome text,
  tipo text NOT NULL,
  numero text,
  status text DEFAULT 'A emitir'::text,
  vencimento date,
  enviado_em timestamp with time zone,
  observacoes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT faturamento_documentos_pkey PRIMARY KEY (id)
);

CREATE TABLE public.faturamento_faturas (
  id text NOT NULL,
  codigo text,
  cliente_id text,
  cliente_nome text,
  periodicidade text,
  periodo text,
  valor_bruto numeric DEFAULT 0,
  descontos numeric DEFAULT 0,
  valor_liquido numeric DEFAULT 0,
  prazo_envio date,
  prazo_retorno date,
  status text DEFAULT 'Sem responsável'::text,
  prioridade text DEFAULT 'Normal'::text,
  responsavel_id text,
  responsavel_nome text,
  distribuido_por_nome text,
  distribuido_em timestamp with time zone,
  canal_envio text,
  ultimo_retorno_em timestamp with time zone,
  proxima_cobranca_em date,
  divergencia text,
  observacoes text,
  os_abertas integer DEFAULT 0,
  os_sem_movimento integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT faturamento_faturas_pkey PRIMARY KEY (id)
);

CREATE TABLE public.faturamento_tarifas (
  id text NOT NULL,
  cliente_id text,
  cliente_nome text,
  servico text NOT NULL,
  unidade text,
  valor numeric DEFAULT 0,
  vigencia date,
  status text DEFAULT 'Ativa'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT faturamento_tarifas_pkey PRIMARY KEY (id)
);

CREATE TABLE public.financeiro_adiantamentos_decisoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ofr_code integer NOT NULL,
  status text NOT NULL DEFAULT 'pendente'::text,
  motivo_recusa text,
  decidido_por text,
  decidido_em timestamp with time zone,
  execucao_id uuid,
  pago_em timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT financeiro_adiantamentos_decisoes_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'ok'::text, 'recusado'::text, 'pago'::text]))),
  CONSTRAINT financeiro_adiantamentos_decisoes_pkey PRIMARY KEY (id),
  CONSTRAINT financeiro_adiantamentos_decisoes_ofr_code_key UNIQUE (ofr_code),
  CONSTRAINT financeiro_adiantamentos_decisoes_ofr_code_fkey FOREIGN KEY (ofr_code) REFERENCES grm_adiantamentos_importacoes(ofr_code) ON DELETE CASCADE,
  CONSTRAINT financeiro_adiantamentos_decisoes_execucao_id_fkey FOREIGN KEY (execucao_id) REFERENCES financeiro_pagamentos_execucoes(id)
);

CREATE TABLE public.financeiro_alimentacao_colaboradores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  chave_unica text NOT NULL,
  data_ref date NOT NULL,
  colaborador_chave text NOT NULL,
  codigo_colaborador text,
  cpf text,
  colaborador text NOT NULL,
  coordenacao text,
  supervisao text,
  hora_identificada time without time zone NOT NULL,
  latitude_colaborador double precision NOT NULL,
  longitude_colaborador double precision NOT NULL,
  precisao_m numeric(12,2),
  local_fonte_tabela text,
  local_fonte_id text,
  local_nome text NOT NULL,
  local_cidade text,
  local_uf text,
  local_latitude double precision NOT NULL,
  local_longitude double precision NOT NULL,
  distancia_m integer NOT NULL,
  raio_m integer NOT NULL DEFAULT 1000,
  pontos_na_janela integer NOT NULL DEFAULT 1,
  pontos_dentro_raio integer NOT NULL DEFAULT 1,
  tipo_beneficio text NOT NULL DEFAULT 'ALIMENTACAO'::text,
  valor numeric(12,2),
  status text NOT NULL DEFAULT 'PENDENTE'::text,
  ativo boolean NOT NULL DEFAULT true,
  origem text NOT NULL DEFAULT 'grm_relatorio_login'::text,
  origem_chave_login text,
  observacao text,
  processado_por uuid,
  processado_em timestamp with time zone,
  ultima_verificacao_em timestamp with time zone NOT NULL DEFAULT now(),
  dados_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT financeiro_alimentacao_status_check CHECK ((status = ANY (ARRAY['PENDENTE'::text, 'APROVADO'::text, 'LANCADO'::text, 'IGNORADO'::text, 'CANCELADO'::text]))),
  CONSTRAINT financeiro_alimentacao_distancia_check CHECK ((distancia_m >= 0)),
  CONSTRAINT financeiro_alimentacao_raio_check CHECK ((raio_m > 0)),
  CONSTRAINT financeiro_alimentacao_lat_colab_check CHECK (((latitude_colaborador >= ('-90'::integer)::double precision) AND (latitude_colaborador <= (90)::double precision))),
  CONSTRAINT financeiro_alimentacao_lng_colab_check CHECK (((longitude_colaborador >= ('-180'::integer)::double precision) AND (longitude_colaborador <= (180)::double precision))),
  CONSTRAINT financeiro_alimentacao_lat_local_check CHECK (((local_latitude >= ('-90'::integer)::double precision) AND (local_latitude <= (90)::double precision))),
  CONSTRAINT financeiro_alimentacao_lng_local_check CHECK (((local_longitude >= ('-180'::integer)::double precision) AND (local_longitude <= (180)::double precision))),
  CONSTRAINT financeiro_alimentacao_colaboradores_pkey PRIMARY KEY (id),
  CONSTRAINT financeiro_alimentacao_colaboradores_chave_unica_key UNIQUE (chave_unica)
);

CREATE TABLE public.financeiro_contas_pagar (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  unique_hash text NOT NULL,
  empresa text,
  situacao text,
  cod_grupo text,
  data_lancamento date,
  coordenacao text,
  supervisao text,
  favorecido text,
  cnpj_cpf text,
  identificacao text,
  categoria text,
  doc text,
  vencimento date,
  parcela text,
  valor_pago numeric(14,2) NOT NULL DEFAULT 0,
  valor numeric(14,2) NOT NULL DEFAULT 0,
  usuario text,
  data_cadastro date,
  arquivo_origem text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  importado_em timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT financeiro_contas_pagar_pkey PRIMARY KEY (id),
  CONSTRAINT financeiro_contas_pagar_unique_hash_key UNIQUE (unique_hash)
);

CREATE TABLE public.financeiro_contas_receber (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  unique_hash text NOT NULL,
  situacao text,
  codigo text,
  fatura text,
  cliente text,
  conta text,
  emissao_nf date,
  vencimento date,
  recebimento date,
  numero_nf text,
  valor numeric(14,2) NOT NULL DEFAULT 0,
  desconto numeric(14,2) NOT NULL DEFAULT 0,
  juros numeric(14,2) NOT NULL DEFAULT 0,
  valor_pago numeric(14,2) NOT NULL DEFAULT 0,
  arquivo_origem text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  importado_em timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT financeiro_contas_receber_pkey PRIMARY KEY (id),
  CONSTRAINT financeiro_contas_receber_unique_hash_key UNIQUE (unique_hash)
);

CREATE TABLE public.financeiro_notas_fiscais_resumo (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  pagamento_execucao_id uuid,
  data_pagamento date NOT NULL,
  regional text NOT NULL,
  destino text NOT NULL,
  valor_total numeric NOT NULL DEFAULT 0,
  quantidade integer NOT NULL DEFAULT 0,
  modulo_origem text NOT NULL DEFAULT 'FINANCEIRO'::text,
  CONSTRAINT financeiro_notas_fiscais_resu_data_pagamento_regional_desti_key UNIQUE (data_pagamento, regional, destino, modulo_origem),
  CONSTRAINT financeiro_notas_fiscais_resumo_pkey PRIMARY KEY (id),
  CONSTRAINT financeiro_notas_fiscais_resumo_pagamento_execucao_id_fkey FOREIGN KEY (pagamento_execucao_id) REFERENCES financeiro_pagamentos_execucoes(id) ON DELETE SET NULL
);

CREATE TABLE public.financeiro_pagamentos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  origem_setor text NOT NULL,
  origem_tabela text NOT NULL DEFAULT 'manual'::text,
  origem_id uuid,
  origem_codigo text,
  competencia date,
  descricao text NOT NULL,
  favorecido_nome text,
  favorecido_documento text,
  banco text,
  agencia text,
  conta text,
  chave_pix text,
  forma_pagamento text NOT NULL DEFAULT 'PIX'::text,
  valor numeric(14,2) NOT NULL DEFAULT 0,
  data_vencimento date,
  data_pagamento date,
  status text NOT NULL DEFAULT 'PENDENTE'::text,
  prioridade text NOT NULL DEFAULT 'NORMAL'::text,
  nf_status text NOT NULL DEFAULT 'NAO_INFORMADA'::text,
  nf_numero text,
  nf_url text,
  comprovante_url text,
  observacoes text,
  solicitado_por uuid,
  solicitado_por_nome text,
  atualizado_por uuid,
  atualizado_por_nome text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  fornecedor text,
  contato text,
  origem text,
  setor text,
  conteudo text,
  favorecido text,
  dados_pagamento text,
  boleto_url text,
  link_pagamento text,
  vencimento date,
  data_solicitacao timestamp with time zone DEFAULT now(),
  solicitado_em timestamp with time zone,
  pago_em timestamp with time zone,
  observacao text,
  pix text,
  gestor text,
  coordenacao text,
  hospedagem_checkout_lote_id uuid,
  CONSTRAINT financeiro_pagamentos_forma_pagamento_check CHECK ((forma_pagamento = ANY (ARRAY['PIX'::text, 'BOLETO'::text, 'TRANSFERENCIA'::text, 'CARTAO'::text, 'OUTRO'::text]))),
  CONSTRAINT financeiro_pagamentos_nf_status_check CHECK ((nf_status = ANY (ARRAY['NAO_INFORMADA'::text, 'AGUARDANDO_NF'::text, 'NF_RECEBIDA'::text, 'LANCADA'::text, 'DISPENSADA'::text]))),
  CONSTRAINT financeiro_pagamentos_origem_setor_check CHECK ((origem_setor = ANY (ARRAY['RH'::text, 'FROTAS'::text, 'HOSPEDAGEM'::text, 'COMPRAS'::text]))),
  CONSTRAINT financeiro_pagamentos_prioridade_check CHECK ((prioridade = ANY (ARRAY['BAIXA'::text, 'NORMAL'::text, 'ALTA'::text]))),
  CONSTRAINT financeiro_pagamentos_status_check CHECK ((status = ANY (ARRAY['PENDENTE'::text, 'EM_ANALISE'::text, 'APROVADO'::text, 'AGENDADO'::text, 'PAGO'::text, 'RECUSADO'::text, 'CANCELADO'::text]))),
  CONSTRAINT financeiro_pagamentos_pkey PRIMARY KEY (id),
  CONSTRAINT financeiro_pagamentos_checkout_lote_fk FOREIGN KEY (hospedagem_checkout_lote_id) REFERENCES hospedagem_checkout_lotes(id) ON DELETE RESTRICT
);

CREATE TABLE public.financeiro_pagamentos_execucoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  tipo text,
  periodo text,
  status text NOT NULL DEFAULT 'PROCESSANDO'::text,
  total_valor numeric NOT NULL DEFAULT 0,
  total_linhas integer NOT NULL DEFAULT 0,
  responsavel text,
  api_retorno jsonb,
  CONSTRAINT financeiro_pagamentos_execucoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.financeiro_pagamentos_historico (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pagamento_id uuid NOT NULL,
  status_anterior text,
  status_novo text,
  observacao text,
  usuario_id uuid,
  usuario_nome text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT financeiro_pagamentos_historico_pkey PRIMARY KEY (id),
  CONSTRAINT financeiro_pagamentos_historico_pagamento_id_fkey FOREIGN KEY (pagamento_id) REFERENCES financeiro_pagamentos(id) ON DELETE CASCADE
);

CREATE TABLE public.financeiro_pagamentos_linhas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  execucao_id uuid,
  unique_hash text NOT NULL,
  data date,
  funcionario text,
  cpf text,
  destino text,
  tipo text,
  valor numeric NOT NULL DEFAULT 0,
  composicao text,
  coordenacao text,
  supervisao text,
  banco text,
  observacao text,
  status text NOT NULL DEFAULT 'OK'::text,
  pago_em timestamp with time zone,
  api_retorno jsonb,
  CONSTRAINT financeiro_pagamentos_linhas_status_check CHECK ((status = ANY (ARRAY['OK'::text, 'PENDENTE'::text, 'PAGO'::text, 'ERRO'::text]))),
  CONSTRAINT financeiro_pagamentos_linhas_pkey PRIMARY KEY (id),
  CONSTRAINT financeiro_pagamentos_linhas_unique_hash_key UNIQUE (unique_hash),
  CONSTRAINT financeiro_pagamentos_linhas_execucao_id_fkey FOREIGN KEY (execucao_id) REFERENCES financeiro_pagamentos_execucoes(id) ON DELETE SET NULL
);

CREATE TABLE public.financeiro_provisoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data date NOT NULL,
  descricao text,
  valor_automatico numeric(14,2) NOT NULL DEFAULT 0,
  ajuste_manual numeric(14,2) NOT NULL DEFAULT 0,
  valor_final numeric(14,2) DEFAULT (COALESCE(valor_automatico, (0)::numeric) + COALESCE(ajuste_manual, (0)::numeric)),
  observacoes text,
  responsavel text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT financeiro_provisoes_data_key UNIQUE (data),
  CONSTRAINT financeiro_provisoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.financeiro_saldos_dia (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data date NOT NULL,
  saldo_dia numeric(14,2) NOT NULL DEFAULT 0,
  observacoes text,
  responsavel text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT financeiro_saldos_dia_data_key UNIQUE (data),
  CONSTRAINT financeiro_saldos_dia_pkey PRIMARY KEY (id)
);

CREATE TABLE public.frota_solicitacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  origem text NOT NULL DEFAULT 'PROGRAMACAO'::text,
  tipo text NOT NULL,
  status text NOT NULL DEFAULT 'ABERTA'::text,
  colaborador_id text,
  colaborador_nome text,
  descricao text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT frota_solicitacoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.frotas_bfleet_condutores_fila (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  veiculo_id uuid,
  placa text,
  motorista_atual text,
  patrimonio_codigo text,
  status text NOT NULL DEFAULT 'PENDENTE'::text,
  tentativas integer NOT NULL DEFAULT 0,
  erro text,
  atualizado_em timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT frotas_bfleet_condutores_fila_pkey PRIMARY KEY (id)
);

CREATE TABLE public.frotas_bfleet_diagnostico (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sync_id uuid NOT NULL,
  tipo text NOT NULL,
  placa text,
  nome_bfleet text,
  idgps text,
  grupo_bfleet text,
  empresa text,
  renavam text,
  motivo text,
  dados jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT frotas_bfleet_diagnostico_pkey PRIMARY KEY (id)
);

CREATE TABLE public.frotas_bfleet_sincronizacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  total_bfleet integer DEFAULT 0,
  rastreadores integer DEFAULT 0,
  divergencias integer DEFAULT 0,
  payload jsonb,
  CONSTRAINT frotas_bfleet_sincronizacoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.frotas_bfleet_sync_logs (
  id bigint NOT NULL DEFAULT nextval('frotas_bfleet_sync_logs_id_seq'::regclass),
  created_at timestamp with time zone DEFAULT now(),
  placa text,
  veiculo_id uuid,
  acao text,
  status text,
  mensagem text,
  payload jsonb,
  resposta jsonb,
  CONSTRAINT frotas_bfleet_sync_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.frotas_checklists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  veiculo_id uuid NOT NULL,
  data_execucao date NOT NULL DEFAULT CURRENT_DATE,
  km_execucao numeric,
  responsavel text,
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  aprovado boolean,
  proxima_data date,
  anexo_url text,
  observacoes text,
  criado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT frotas_checklists_pkey PRIMARY KEY (id),
  CONSTRAINT frotas_checklists_veiculo_id_fkey FOREIGN KEY (veiculo_id) REFERENCES frotas_veiculos(id) ON DELETE CASCADE,
  CONSTRAINT frotas_checklists_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id)
);

CREATE TABLE public.frotas_detran_config (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  empresa text,
  cnpj text,
  chave_nome text NOT NULL,
  chave_valor text,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT frotas_detran_config_pkey PRIMARY KEY (id)
);

CREATE TABLE public.frotas_excesso_velocidade (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_evento date NOT NULL,
  hora_evento text,
  alerta text DEFAULT 'Excesso de velocidade'::text,
  ativo_rastreador text,
  placa text NOT NULL,
  motorista_planilha text,
  velocidade numeric NOT NULL,
  endereco text,
  latitude numeric,
  longitude numeric,
  mapa_url text,
  arquivo_nome text,
  origem text NOT NULL DEFAULT 'importar_relatorios'::text,
  import_hash text NOT NULL,
  patrimonio_id uuid,
  patrimonio_codigo text,
  patrimonio_funcionario text,
  patrimonio_identificacao text,
  coordenacao text,
  supervisao text,
  status_cruzamento text NOT NULL DEFAULT 'PENDENTE_CONFERENCIA'::text,
  status_notificacao text NOT NULL DEFAULT 'PENDENTE'::text,
  mensagem_gerada text,
  notificado_em timestamp with time zone,
  notificado_por uuid,
  notificado_por_nome text,
  observacoes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  bfleet_report_id text,
  raw jsonb,
  bfleet_vehicle_id text,
  bfleet_ativo_nome text,
  CONSTRAINT frotas_excesso_velocidade_status_cruzamento_check CHECK ((status_cruzamento = ANY (ARRAY['MOTORISTA_IDENTIFICADO'::text, 'PENDENTE_CONFERENCIA'::text]))),
  CONSTRAINT frotas_excesso_velocidade_status_notificacao_check CHECK ((status_notificacao = ANY (ARRAY['PENDENTE'::text, 'GERADA'::text, 'NOTIFICADO'::text, 'CANCELADO'::text]))),
  CONSTRAINT frotas_excesso_velocidade_import_hash_key UNIQUE (import_hash),
  CONSTRAINT frotas_excesso_velocidade_pkey PRIMARY KEY (id)
);

CREATE TABLE public.frotas_fora_horario (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_evento date NOT NULL,
  hora_evento text,
  alerta text DEFAULT 'Fora do horário'::text,
  ativo_rastreador text,
  placa text NOT NULL,
  motorista_planilha text,
  endereco text,
  latitude numeric,
  longitude numeric,
  mapa_url text,
  arquivo_nome text,
  origem text NOT NULL DEFAULT 'bfleet_api'::text,
  import_hash text NOT NULL,
  patrimonio_id uuid,
  patrimonio_codigo text,
  patrimonio_funcionario text,
  patrimonio_identificacao text,
  coordenacao text,
  supervisao text,
  status_cruzamento text NOT NULL DEFAULT 'PENDENTE_CONFERENCIA'::text,
  observacoes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  bfleet_report_id text,
  bfleet_vehicle_id text,
  bfleet_ativo_nome text,
  raw jsonb,
  CONSTRAINT frotas_fora_horario_pkey PRIMARY KEY (id),
  CONSTRAINT frotas_fora_horario_import_hash_key UNIQUE (import_hash)
);

CREATE TABLE public.frotas_gps_ocorrencias (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  placa text NOT NULL,
  tipo text NOT NULL,
  detalhes jsonb,
  detectada_em timestamp with time zone NOT NULL DEFAULT now(),
  responsavel text,
  justificativa text,
  conclusao text,
  status text NOT NULL DEFAULT 'Aberta'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  criado_por text,
  atualizado_por text,
  CONSTRAINT frotas_gps_ocorrencias_pkey PRIMARY KEY (id)
);

CREATE TABLE public.frotas_manutencoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  veiculo_id uuid NOT NULL,
  tipo_servico text,
  descricao text,
  oficina text,
  data_execucao date NOT NULL DEFAULT CURRENT_DATE,
  km_execucao numeric,
  custo numeric,
  proxima_data date,
  proxima_km numeric,
  anexo_url text,
  observacoes text,
  criado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT frotas_manutencoes_pkey PRIMARY KEY (id),
  CONSTRAINT frotas_manutencoes_veiculo_id_fkey FOREIGN KEY (veiculo_id) REFERENCES frotas_veiculos(id) ON DELETE CASCADE,
  CONSTRAINT frotas_manutencoes_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id)
);

CREATE TABLE public.frotas_motoristas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cpf text,
  telefone text,
  email text,
  cnh_numero text,
  cnh_validade date,
  endereco text,
  status text NOT NULL DEFAULT 'ATIVO'::text,
  origem text NOT NULL DEFAULT 'manual'::text,
  colaborador_nome text,
  bfleet_conductor_id text,
  bfleet_sync_status text,
  bfleet_sync_erro text,
  bfleet_ultima_sync_em timestamp with time zone,
  observacoes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT frotas_motoristas_pkey PRIMARY KEY (id)
);

CREATE TABLE public.frotas_multas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  orgao_autuador text,
  orgao_competente text,
  empresa text,
  renavam text,
  placa text NOT NULL,
  data_infracao date,
  hora text,
  local text,
  descricao text,
  valor_original numeric DEFAULT 0,
  numero_auto_infracao text,
  data_limite_defesa date,
  motorista text,
  situacao text,
  auto text,
  key text,
  cod_auto text,
  cod_orgao text,
  parcelas text,
  status_multa text NOT NULL DEFAULT 'A PAGAR'::text,
  origem text NOT NULL DEFAULT 'painel'::text,
  pode_indicar_condutor text,
  indicar_condutor_msg text,
  respondido_em timestamp with time zone,
  status_notificacao text NOT NULL DEFAULT 'PENDENTE'::text,
  mensagem_gerada text,
  notificado_em timestamp with time zone,
  notificado_por uuid,
  notificado_por_nome text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  import_hash text,
  criado_por uuid,
  criado_por_nome text,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
  multa_key text,
  veiculo_id uuid,
  cnpj text,
  hora_infracao text,
  arquivo_pdf_url text,
  guia_url text,
  ultima_consulta_em timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  acao_status text,
  condutor_identificado_em timestamp with time zone,
  condutor_notificado_em timestamp with time zone,
  multa_indicada_em timestamp with time zone,
  multa_dobrada_em timestamp with time zone,
  observacoes_operacionais text,
  data_vencimento date,
  data_vencimento_auto date,
  data_limite_pagto date,
  data_limite_jari date,
  data_limite_cetran date,
  arquivada_em timestamp with time zone,
  arquivada_por uuid,
  motivo_arquivamento text,
  ok_em timestamp with time zone,
  ok_por uuid,
  ok_observacao text,
  motorista_em timestamp with time zone,
  motorista_por uuid,
  motorista_nome text,
  motorista_cpf text,
  identificada_em timestamp with time zone,
  identificada_por uuid,
  identificada_obs text,
  dobrada_em timestamp with time zone,
  dobrada_por uuid,
  dobrada_obs text,
  motorista_definido_em timestamp with time zone,
  dobrar_solicitado_em timestamp with time zone,
  identificar_solicitado_em timestamp with time zone,
  CONSTRAINT frotas_multas_pkey PRIMARY KEY (id)
);

CREATE TABLE public.frotas_multas_acoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  multa_id text NOT NULL,
  acao text NOT NULL,
  detalhe jsonb,
  usuario text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT frotas_multas_acoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.frotas_multas_arquivos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  multa_id uuid,
  chave_tecnica text,
  linha_multas integer,
  placa text,
  cod_auto text,
  cod_orgao text,
  status text,
  descricao text,
  data_infracao date,
  guia_data_vencimento_grd date,
  guia_valor_grd numeric,
  guia_codigo_barras_grd text,
  guia_pix_copia_cola text,
  arquivo_pdf_nome text,
  arquivo_pdf_id text,
  arquivo_pdf_url text,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  erro text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT frotas_multas_arquivos_pkey PRIMARY KEY (id),
  CONSTRAINT frotas_multas_arquivos_multa_id_fkey FOREIGN KEY (multa_id) REFERENCES frotas_multas(id) ON DELETE SET NULL
);

CREATE TABLE public.frotas_multas_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  multa_id uuid,
  key_multa text,
  telefone text,
  subscriber_id text,
  acao text,
  status text,
  detalhe text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT frotas_multas_logs_pkey PRIMARY KEY (id),
  CONSTRAINT frotas_multas_logs_multa_id_fkey FOREIGN KEY (multa_id) REFERENCES frotas_multas(id) ON DELETE SET NULL
);

CREATE TABLE public.frotas_posicoes (
  placa text NOT NULL,
  veiculo_id uuid,
  idgps text,
  latitude numeric,
  longitude numeric,
  velocidade_kmh numeric,
  direcao numeric,
  ignicao boolean,
  endereco text,
  motorista text,
  sinal text,
  reportado_em timestamp with time zone,
  atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT frotas_posicoes_pkey PRIMARY KEY (placa),
  CONSTRAINT frotas_posicoes_veiculo_id_fkey FOREIGN KEY (veiculo_id) REFERENCES frotas_veiculos(id) ON DELETE SET NULL
);

CREATE TABLE public.frotas_posicoes_historico (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  placa text NOT NULL,
  veiculo_id uuid,
  latitude numeric,
  longitude numeric,
  velocidade_kmh numeric,
  motorista text,
  reportado_em timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT frotas_posicoes_historico_pkey PRIMARY KEY (id)
);

CREATE TABLE public.frotas_print_ocr_execucoes (
  id bigint NOT NULL,
  arquivo_id text,
  arquivo_nome text NOT NULL,
  arquivo_url text,
  data_notificacao date,
  placa_ocr text,
  motorista_ocr text,
  registros_ocr jsonb NOT NULL DEFAULT '[]'::jsonb,
  resposta_ocr jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PENDENTE_CONFERENCIA'::text,
  motivo text,
  ids_correspondentes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ids_arquivados jsonb NOT NULL DEFAULT '[]'::jsonb,
  candidatos_ambiguos jsonb NOT NULL DEFAULT '[]'::jsonb,
  criado_por uuid,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  processado_em timestamp with time zone,
  CONSTRAINT frotas_print_ocr_status_check CHECK ((status = ANY (ARRAY['PENDENTE_CONFERENCIA'::text, 'AMBIGUO'::text, 'CONCILIADO'::text, 'ARQUIVADO'::text, 'CONFLITO_CONCORRENCIA'::text, 'ERRO'::text]))),
  CONSTRAINT frotas_print_ocr_execucoes_pkey PRIMARY KEY (id),
  CONSTRAINT frotas_print_ocr_execucoes_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE public.frotas_rastreadores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  veiculo_id uuid,
  placa text NOT NULL,
  estado text,
  cidade text,
  local_instalacao text,
  imei text,
  data_envio date,
  previsao_chegada date,
  cod_rastreio text,
  status text NOT NULL DEFAULT 'sem_rastreador'::text,
  data_instalacao date,
  nao_atendido boolean NOT NULL DEFAULT false,
  contato text,
  observacoes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  contrato integer,
  contrato_assinado boolean,
  agendamentos_frustrados integer DEFAULT 0,
  termo_assinado text,
  infleet text,
  responsavel text,
  CONSTRAINT frotas_rastreadores_infleet_check CHECK ((infleet = ANY (ARRAY['PENDENTE'::text, 'RETIRADO'::text]))),
  CONSTRAINT frotas_rastreadores_responsavel_check CHECK ((responsavel = ANY (ARRAY['Anderson'::text, 'Cleverson'::text]))),
  CONSTRAINT frotas_rastreadores_status_check CHECK ((status = ANY (ARRAY['sem_rastreador'::text, 'em_andamento'::text, 'concluido'::text, 'aguardando_motorista'::text, 'agendado'::text]))),
  CONSTRAINT frotas_rastreadores_pkey PRIMARY KEY (id),
  CONSTRAINT frotas_rastreadores_placa_key UNIQUE (placa),
  CONSTRAINT frotas_rastreadores_veiculo_id_fkey FOREIGN KEY (veiculo_id) REFERENCES frotas_veiculos(id) ON DELETE SET NULL
);

CREATE TABLE public.frotas_rastreadores_removidos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  placa text NOT NULL,
  veiculo_id uuid,
  rastreador_id uuid,
  motivo_remocao text NOT NULL,
  removido_por uuid,
  removido_por_nome text,
  removido_em timestamp with time zone NOT NULL DEFAULT now(),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT frotas_rastreadores_removidos_pkey PRIMARY KEY (id),
  CONSTRAINT frotas_rastreadores_removidos_placa_key UNIQUE (placa),
  CONSTRAINT frotas_rastreadores_removidos_veiculo_id_fkey FOREIGN KEY (veiculo_id) REFERENCES frotas_veiculos(id) ON DELETE SET NULL
);

CREATE TABLE public.frotas_rotas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data date NOT NULL,
  placa text NOT NULL,
  veiculo_id uuid,
  motorista text,
  status text NOT NULL DEFAULT 'planejada'::text,
  origem_latitude numeric,
  origem_longitude numeric,
  km_total_estimado numeric,
  duracao_estimada_min numeric,
  qtd_paradas integer NOT NULL DEFAULT 0,
  geometria jsonb,
  criado_por uuid,
  publicado_em timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT frotas_rotas_status_check CHECK ((status = ANY (ARRAY['planejada'::text, 'publicada'::text, 'concluida'::text, 'cancelada'::text]))),
  CONSTRAINT frotas_rotas_pkey PRIMARY KEY (id),
  CONSTRAINT frotas_rotas_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id),
  CONSTRAINT frotas_rotas_veiculo_id_fkey FOREIGN KEY (veiculo_id) REFERENCES frotas_veiculos(id) ON DELETE SET NULL
);

CREATE TABLE public.frotas_rotas_paradas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rota_id uuid NOT NULL,
  os_id uuid,
  ordem integer NOT NULL,
  ponto_nome text,
  embarque_texto text,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  distancia_km_trecho numeric,
  duracao_min_trecho numeric,
  status text NOT NULL DEFAULT 'pendente'::text,
  concluido_em timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  tipo text NOT NULL DEFAULT 'embarque'::text,
  colaborador_nome text,
  CONSTRAINT frotas_rotas_paradas_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'concluido'::text, 'pulado'::text]))),
  CONSTRAINT frotas_rotas_paradas_tipo_check CHECK ((tipo = ANY (ARRAY['colaborador'::text, 'embarque'::text]))),
  CONSTRAINT frotas_rotas_paradas_pkey PRIMARY KEY (id),
  CONSTRAINT frotas_rotas_paradas_os_id_fkey FOREIGN KEY (os_id) REFERENCES operacional_os(id) ON DELETE SET NULL,
  CONSTRAINT frotas_rotas_paradas_rota_id_fkey FOREIGN KEY (rota_id) REFERENCES frotas_rotas(id) ON DELETE CASCADE
);

CREATE TABLE public.frotas_sync_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  status text NOT NULL,
  resumo jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT frotas_sync_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.frotas_trocas_oleo (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  veiculo_id uuid NOT NULL,
  tipo_oleo text,
  data_execucao date NOT NULL DEFAULT CURRENT_DATE,
  km_execucao numeric,
  custo numeric,
  proxima_data date,
  proxima_km numeric,
  anexo_url text,
  observacoes text,
  criado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT frotas_trocas_oleo_pkey PRIMARY KEY (id),
  CONSTRAINT frotas_trocas_oleo_veiculo_id_fkey FOREIGN KEY (veiculo_id) REFERENCES frotas_veiculos(id) ON DELETE CASCADE,
  CONSTRAINT frotas_trocas_oleo_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id)
);

CREATE TABLE public.frotas_veiculos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  placa text NOT NULL,
  renavam text,
  nome text,
  empresa text,
  cnpj text,
  marca text,
  modelo text,
  cor text,
  ano integer,
  tipo text,
  coordenacao text,
  supervisao text,
  motorista_atual text,
  hodometro numeric DEFAULT 0,
  valor_mensal numeric DEFAULT 0,
  dia_vencimento integer,
  valor_km numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'ATIVO'::text,
  detran_confirmado boolean NOT NULL DEFAULT false,
  detran_status text NOT NULL DEFAULT 'PENDENTE'::text,
  detran_mensagem text,
  detran_ultima_consulta_em timestamp with time zone,
  detran_raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  origem_importacao text NOT NULL DEFAULT 'painel'::text,
  arquivo_nome text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  import_hash text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  chassi text,
  municipio_uf text,
  situacao_detran text,
  detran_token_key text,
  marca_modelo text,
  situacao_veiculo text,
  rs_km numeric,
  observacoes text,
  ano_fabricacao integer,
  ano_modelo integer,
  tipo_veiculo text,
  especie text,
  combustivel text,
  origem text,
  multas_ultima_consulta_em timestamp with time zone,
  multas_status text,
  multas_mensagem text,
  bfleet_id text,
  bfleet_idgps text,
  bfleet_condutor text,
  bfleet_condutor_id text,
  bfleet_grupo text,
  possui_rastreador boolean DEFAULT false,
  condutor_patrimonio text,
  condutor_divergente boolean DEFAULT false,
  bfleet_sync_at timestamp with time zone,
  bfleet_raw jsonb,
  rastreador_bfleet boolean DEFAULT false,
  bfleet_rastreador boolean DEFAULT false,
  bfleet_confirmado boolean DEFAULT false,
  bfleet_device_id text,
  bfleet_status text,
  bfleet_divergencia boolean DEFAULT false,
  bfleet_mensagem text,
  bfleet_ultima_sincronizacao_em timestamp with time zone,
  bfleet_ultima_sync_em timestamp with time zone,
  bfleet_nome text,
  bfleet_gatewayip text,
  bfleet_marca text,
  bfleet_modelo text,
  bfleet_ano text,
  bfleet_odometro text,
  patrimonio_codigo text,
  patrimonio_identificacao text,
  patrimonio_funcionario text,
  patrimonio_coordenacao text,
  patrimonio_supervisao text,
  patrimonio_ultima_leitura timestamp without time zone,
  patrimonio_dias_sem_leitura integer,
  patrimonio_importacao_id text,
  patrimonio_data_upload timestamp with time zone,
  patrimonio_sync_em timestamp with time zone,
  bfleet_condutor_status text,
  bfleet_condutor_atualizado_em timestamp with time zone,
  bfleet_condutor_erro text,
  bfleet_vehicle_id text,
  bfleet_patente text,
  bfleet_ativo_nome text,
  rastreador_origem text,
  placa_normalizada text,
  bfleet_placa text,
  CONSTRAINT frotas_veiculos_pkey PRIMARY KEY (id),
  CONSTRAINT frotas_veiculos_placa_key UNIQUE (placa)
);

CREATE TABLE public.frotas_veiculos_historico (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  veiculo_id uuid NOT NULL,
  motorista text,
  data_inicio timestamp with time zone NOT NULL DEFAULT now(),
  data_fim timestamp with time zone,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT frotas_veiculos_historico_pkey PRIMARY KEY (id),
  CONSTRAINT frotas_veiculos_historico_veiculo_id_fkey FOREIGN KEY (veiculo_id) REFERENCES frotas_veiculos(id) ON DELETE CASCADE
);

CREATE TABLE public.geocode_cache (
  chave text NOT NULL,
  tipo text NOT NULL,
  latitude numeric,
  longitude numeric,
  endereco_resolvido text,
  status text NOT NULL DEFAULT 'ok'::text,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT geocode_cache_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'erro'::text]))),
  CONSTRAINT geocode_cache_tipo_check CHECK ((tipo = ANY (ARRAY['cep'::text, 'cidade'::text]))),
  CONSTRAINT geocode_cache_pkey PRIMARY KEY (chave)
);

CREATE TABLE public.google_contacts_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  google_email text,
  google_sub text,
  access_token_enc text,
  refresh_token_enc text,
  expires_at timestamp with time zone,
  scope text,
  contact_group_resource_name text,
  contact_group_etag text,
  active boolean NOT NULL DEFAULT true,
  last_sync_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT google_contacts_connections_pkey PRIMARY KEY (id),
  CONSTRAINT google_contacts_connections_user_id_key UNIQUE (user_id),
  CONSTRAINT google_contacts_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE public.google_contacts_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tipo text NOT NULL DEFAULT 'sync'::text,
  status text NOT NULL DEFAULT 'pendente'::text,
  cursor integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  batch_size integer NOT NULL DEFAULT 80,
  cleanup_old boolean NOT NULL DEFAULT true,
  progresso integer NOT NULL DEFAULT 0,
  criados integer NOT NULL DEFAULT 0,
  atualizados integer NOT NULL DEFAULT 0,
  recriados integer NOT NULL DEFAULT 0,
  ignorados integer NOT NULL DEFAULT 0,
  erros integer NOT NULL DEFAULT 0,
  removidos integer NOT NULL DEFAULT 0,
  erro text,
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT google_contacts_jobs_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'processando'::text, 'concluido'::text, 'parcial'::text, 'erro'::text, 'cancelado'::text]))),
  CONSTRAINT google_contacts_jobs_tipo_check CHECK ((tipo = ANY (ARRAY['sync'::text, 'cleanup'::text]))),
  CONSTRAINT google_contacts_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT google_contacts_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE public.google_contacts_logs (
  id bigint NOT NULL,
  user_id uuid,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT google_contacts_logs_pkey PRIMARY KEY (id),
  CONSTRAINT google_contacts_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE public.google_contacts_map (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  colaborador_key text NOT NULL,
  cpf text,
  nome text,
  telefone text,
  email text,
  resource_name text,
  etag text,
  status text NOT NULL DEFAULT 'ativo'::text,
  last_payload_hash text,
  last_sync_at timestamp with time zone,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT google_contacts_map_status_check CHECK ((status = ANY (ARRAY['ativo'::text, 'excluido'::text, 'erro'::text]))),
  CONSTRAINT google_contacts_map_pkey PRIMARY KEY (id),
  CONSTRAINT google_contacts_map_user_id_colaborador_key_key UNIQUE (user_id, colaborador_key),
  CONSTRAINT google_contacts_map_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE public.google_contacts_oauth_states (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  state text NOT NULL,
  user_id uuid NOT NULL,
  redirect_to text,
  expires_at timestamp with time zone NOT NULL,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT google_contacts_oauth_states_pkey PRIMARY KEY (id),
  CONSTRAINT google_contacts_oauth_states_state_key UNIQUE (state),
  CONSTRAINT google_contacts_oauth_states_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE public.google_contacts_sync_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pendente'::text,
  cursor integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  batch_size integer NOT NULL DEFAULT 80,
  cleanup_old boolean NOT NULL DEFAULT true,
  resumo jsonb NOT NULL DEFAULT jsonb_build_object('criados', 0, 'atualizados', 0, 'recriados', 0, 'ignorados', 0, 'erros', 0, 'removidos', 0),
  error text,
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT google_contacts_sync_jobs_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'processando'::text, 'concluido'::text, 'erro'::text, 'cancelado'::text]))),
  CONSTRAINT google_contacts_sync_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT google_contacts_sync_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE public.grm_abertura_os_execucoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  abertura_os_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'INICIADA'::text,
  dry_run boolean NOT NULL DEFAULT false,
  numero_os text,
  mensagem text,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  iniciado_em timestamp with time zone NOT NULL DEFAULT now(),
  finalizado_em timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT grm_abertura_os_execucoes_pkey PRIMARY KEY (id),
  CONSTRAINT grm_abertura_os_execucoes_abertura_os_id_fkey FOREIGN KEY (abertura_os_id) REFERENCES logistica_abertura_os(id) ON DELETE CASCADE
);

CREATE TABLE public.grm_adiantamentos_importacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ofr_code integer NOT NULL,
  ofr_status text,
  data_solicitacao date,
  data_registro timestamp with time zone,
  colaborador text,
  cpf text,
  coordenacao text,
  supervisao text,
  conta text,
  valor numeric,
  saldo numeric,
  embarque date,
  leitura_mais_antiga date,
  descricao text,
  dados_json jsonb,
  data_sincronizacao timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  pendente_no_grm boolean NOT NULL DEFAULT true,
  saiu_pendente_em timestamp with time zone,
  CONSTRAINT grm_adiantamentos_importacoes_pkey PRIMARY KEY (id),
  CONSTRAINT grm_adiantamentos_importacoes_ofr_code_key UNIQUE (ofr_code)
);

CREATE TABLE public.grm_auditorias_importacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_sincronizacao timestamp with time zone DEFAULT now(),
  dados_json jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  sincronizado_em timestamp with time zone,
  CONSTRAINT grm_auditorias_importacoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.grm_cargas_importacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  chave_unica text NOT NULL,
  data_classificacao date,
  os text,
  cliente text,
  coordenacao text,
  supervisao text,
  colaborador text,
  placa text,
  laudo text,
  nota_fiscal text,
  lat_lancamento double precision,
  lng_lancamento double precision,
  dados_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  sincronizado_em timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT grm_cargas_importacoes_chave_unica_key UNIQUE (chave_unica),
  CONSTRAINT grm_cargas_importacoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.grm_contas_pagar_importacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_sincronizacao timestamp with time zone DEFAULT now(),
  dados_json jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  sincronizado_em timestamp with time zone,
  CONSTRAINT grm_contas_pagar_importacoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.grm_contas_receber_importacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_sincronizacao timestamp with time zone DEFAULT now(),
  dados_json jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  sincronizado_em timestamp with time zone,
  CONSTRAINT grm_contas_receber_importacoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.grm_despesas_estado_colaborador (
  cpf text NOT NULL,
  colaborador_id text,
  nome text NOT NULL,
  regional_origem text,
  versao_desejada_id uuid,
  hash_desejado text,
  regras_desejadas jsonb NOT NULL DEFAULT '[]'::jsonb,
  deve_liberar boolean NOT NULL DEFAULT false,
  hash_aplicado text,
  status_aplicacao text NOT NULL DEFAULT 'PENDENTE'::text,
  aplicado_em timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  data_referencia date NOT NULL,
  CONSTRAINT grm_despesas_estado_colaborador_cpf_check CHECK ((cpf ~ '^\d{11}$'::text)),
  CONSTRAINT grm_despesas_estado_colaborador_status_aplicacao_check CHECK ((status_aplicacao = ANY (ARRAY['PENDENTE'::text, 'PROCESSANDO'::text, 'APLICADO'::text, 'LIMPO'::text, 'DIVERGENTE'::text, 'ERRO'::text]))),
  CONSTRAINT grm_despesas_estado_colaborador_versao_desejada_id_fkey FOREIGN KEY (versao_desejada_id) REFERENCES grm_despesas_versoes(id) ON DELETE SET NULL,
  CONSTRAINT grm_despesas_estado_colaborador_pkey PRIMARY KEY (cpf, data_referencia)
);

CREATE TABLE public.grm_despesas_fila (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  versao_id uuid NOT NULL,
  programacao_id text,
  data_referencia date NOT NULL,
  regional text NOT NULL,
  colaborador_id text,
  nome text NOT NULL,
  cpf text NOT NULL,
  acao text NOT NULL,
  regras jsonb NOT NULL DEFAULT '[]'::jsonb,
  hash_desejado text NOT NULL,
  status text NOT NULL DEFAULT 'PENDENTE'::text,
  tentativas integer NOT NULL DEFAULT 0,
  max_tentativas integer NOT NULL DEFAULT 5,
  ultimo_erro text,
  diagnostico jsonb NOT NULL DEFAULT '{}'::jsonb,
  screenshot_path text,
  locked_at timestamp with time zone,
  finalizado_em timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT grm_despesas_fila_cpf_check CHECK ((cpf ~ '^\d{11}$'::text)),
  CONSTRAINT grm_despesas_fila_acao_check CHECK ((acao = ANY (ARRAY['APLICAR'::text, 'LIMPAR'::text]))),
  CONSTRAINT grm_despesas_fila_max_tentativas_check CHECK ((max_tentativas > 0)),
  CONSTRAINT grm_despesas_fila_pkey PRIMARY KEY (id),
  CONSTRAINT grm_despesas_fila_versao_id_fkey FOREIGN KEY (versao_id) REFERENCES grm_despesas_versoes(id) ON DELETE CASCADE,
  CONSTRAINT grm_despesas_fila_status_check CHECK ((status = ANY (ARRAY['AGENDADO'::text, 'PENDENTE'::text, 'PROCESSANDO'::text, 'APLICADO'::text, 'LIMPO'::text, 'ERRO'::text, 'DIVERGENTE'::text, 'IGNORADO_VERSAO_SUPERADA'::text, 'EXPIRADO'::text, 'CANCELADO'::text])))
);

CREATE TABLE public.grm_despesas_importacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_sincronizacao timestamp with time zone DEFAULT now(),
  data_conta_de date,
  data_conta_ate date,
  coordenacao text,
  supervisao text,
  funcionario text,
  fornecedor text,
  grupo_categoria text,
  categoria text,
  vincular_caixa_operacional text,
  valor numeric,
  dados_json jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  sincronizado_em timestamp with time zone,
  CONSTRAINT grm_despesas_importacoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.grm_despesas_importacoes_backup_20260624 (
  id uuid,
  data_sincronizacao timestamp with time zone,
  data_conta_de date,
  data_conta_ate date,
  coordenacao text,
  supervisao text,
  funcionario text,
  fornecedor text,
  grupo_categoria text,
  categoria text,
  vincular_caixa_operacional text,
  valor numeric,
  dados_json jsonb,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  sincronizado_em timestamp with time zone
);

CREATE TABLE public.grm_despesas_retroativas_auditoria (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_referencia date NOT NULL,
  cpf text NOT NULL,
  colaborador text NOT NULL,
  sta_code bigint NOT NULL,
  tipo_contrato text NOT NULL,
  tipo_despesa text NOT NULL,
  oex_code bigint NOT NULL,
  valor numeric(12,2) NOT NULL,
  acao text NOT NULL,
  ofm_code bigint,
  dry_run boolean NOT NULL DEFAULT false,
  sucesso boolean NOT NULL DEFAULT false,
  erro text,
  diagnostico jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT grm_despesas_retroativas_auditoria_acao_check CHECK ((acao = ANY (ARRAY['NONE'::text, 'APPROVE'::text, 'CREATE'::text, 'REPROVE'::text, 'ADIADO'::text, 'SKIP_DUPLICADO'::text]))),
  CONSTRAINT grm_despesas_retroativas_auditoria_pkey PRIMARY KEY (id)
);

CREATE TABLE public.grm_despesas_tipos_config (
  chave text NOT NULL,
  origem text NOT NULL,
  tipo_grm text NOT NULL,
  valor_padrao numeric(12,2),
  exibir boolean NOT NULL DEFAULT true,
  auto boolean NOT NULL DEFAULT false,
  carga_nhe boolean NOT NULL DEFAULT true,
  max_mov_dia integer NOT NULL DEFAULT 1,
  ativo boolean NOT NULL DEFAULT false,
  observacao text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT grm_despesas_tipos_config_max_mov_dia_check CHECK ((max_mov_dia >= 0)),
  CONSTRAINT grm_despesas_tipos_config_pkey PRIMARY KEY (chave),
  CONSTRAINT grm_despesas_tipos_config_origem_check CHECK ((origem = ANY (ARRAY['ALIMENTACAO'::text, 'DESLOCAMENTO'::text, 'EXTRA'::text, 'VINCULO'::text])))
);

CREATE TABLE public.grm_despesas_versoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sequencia bigint NOT NULL,
  gestor_id uuid,
  regional text NOT NULL,
  data_referencia date NOT NULL,
  motivo text NOT NULL,
  programacao_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  resumo jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT grm_despesas_versoes_motivo_check CHECK ((motivo = ANY (ARRAY['INATIVIDADE_5_MIN'::text, 'TROCA_DE_TELA'::text, 'FECHAMENTO_JANELA'::text, 'SALVAR_MANUAL'::text, 'RECONCILIACAO'::text]))),
  CONSTRAINT grm_despesas_versoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.grm_distribuicao_os_importacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_sincronizacao timestamp with time zone DEFAULT now(),
  dados_json jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  sincronizado_em timestamp with time zone,
  CONSTRAINT grm_distribuicao_os_importacoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.grm_finalizacao_os_execucoes (
  id bigint NOT NULL,
  iniciado_em timestamp with time zone NOT NULL DEFAULT now(),
  finalizado_em timestamp with time zone,
  status text NOT NULL DEFAULT 'INICIADO'::text,
  remanescente_min numeric(18,3) NOT NULL DEFAULT 0,
  remanescente_max numeric(18,3) NOT NULL DEFAULT 30,
  limite_execucao integer,
  dry_run boolean NOT NULL DEFAULT false,
  total_exportadas integer NOT NULL DEFAULT 0,
  total_candidatas integer NOT NULL DEFAULT 0,
  total_processadas integer NOT NULL DEFAULT 0,
  total_sucesso integer NOT NULL DEFAULT 0,
  total_dry_run integer NOT NULL DEFAULT 0,
  total_ignoradas integer NOT NULL DEFAULT 0,
  total_erros integer NOT NULL DEFAULT 0,
  erro text,
  detalhes jsonb,
  CONSTRAINT grm_finalizacao_os_execucoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.grm_finalizacao_os_resultados (
  id bigint NOT NULL,
  execucao_id bigint NOT NULL,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  os text NOT NULL,
  remanescente_exportado numeric(18,3),
  remanescente_tela numeric(18,3),
  status text NOT NULL,
  erro text,
  detalhes jsonb,
  CONSTRAINT grm_finalizacao_os_resultados_pkey PRIMARY KEY (id),
  CONSTRAINT grm_finalizacao_os_resultados_execucao_id_fkey FOREIGN KEY (execucao_id) REFERENCES grm_finalizacao_os_execucoes(id) ON DELETE CASCADE
);

CREATE TABLE public.grm_holerite_lancamentos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  chave_idempotencia text NOT NULL,
  empresa text NOT NULL,
  referencia date NOT NULL,
  data_conta date NOT NULL,
  data_vencimento date NOT NULL,
  registro_funcionario text NOT NULL,
  funcionario text NOT NULL,
  tipo_vinculo text NOT NULL,
  grupo_categoria text NOT NULL DEFAULT 'FOLHA DE PAGAMENTO'::text,
  categoria text NOT NULL,
  valor_liquido numeric(14,2) NOT NULL,
  numero_documento text NOT NULL,
  arquivo_origem text,
  pagina_origem integer,
  status text NOT NULL DEFAULT 'processando'::text,
  tentativas integer NOT NULL DEFAULT 0,
  erro text,
  grm_url text,
  job_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processado_em timestamp with time zone,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT grm_holerite_lancamentos_valor_liquido_check CHECK ((valor_liquido >= (0)::numeric)),
  CONSTRAINT grm_holerite_lancamentos_status_check CHECK ((status = ANY (ARRAY['processando'::text, 'simulacao'::text, 'sucesso'::text, 'erro'::text, 'ignorado'::text]))),
  CONSTRAINT grm_holerite_lancamentos_pkey PRIMARY KEY (id),
  CONSTRAINT grm_holerite_lancamentos_chave_idempotencia_key UNIQUE (chave_idempotencia)
);

CREATE TABLE public.grm_lista_os_importacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_sincronizacao timestamp with time zone DEFAULT now(),
  dados_json jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  sincronizado_em timestamp with time zone,
  CONSTRAINT grm_lista_os_importacoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.grm_locais_embarque_importacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_sincronizacao timestamp with time zone DEFAULT now(),
  data_solicitacao_de date,
  data_solicitacao_ate date,
  cliente_nacional text,
  produto text,
  coordenacao text,
  servico text,
  local_tipo_servico text,
  uf text,
  dados_json jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  sincronizado_em timestamp with time zone,
  CONSTRAINT grm_locais_embarque_importacoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.grm_login_alimentacao_execucoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_de date NOT NULL,
  data_ate date NOT NULL,
  status text NOT NULL DEFAULT 'INICIADO'::text,
  iniciado_em timestamp with time zone NOT NULL DEFAULT now(),
  finalizado_em timestamp with time zone,
  total_relatorio integer,
  total_movimentos integer,
  total_locais integer,
  total_elegiveis integer,
  erro text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT grm_login_execucoes_status_check CHECK ((status = ANY (ARRAY['INICIADO'::text, 'SUCESSO'::text, 'ERRO'::text]))),
  CONSTRAINT grm_login_alimentacao_execucoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.grm_login_movimentos_importacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  chave_unica text NOT NULL,
  data_movimento date NOT NULL,
  hora_movimento time without time zone,
  colaborador_chave text NOT NULL,
  codigo_colaborador text,
  cpf text,
  colaborador text,
  coordenacao text,
  supervisao text,
  uf_embarque text,
  cidade_embarque text,
  local_servico text,
  possui_movimento boolean NOT NULL DEFAULT true,
  tipo_movimento text,
  latitude double precision,
  longitude double precision,
  precisao_m numeric(12,2),
  dispositivo text,
  dados_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  sincronizado_em timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT grm_login_latitude_valida CHECK (((latitude IS NULL) OR ((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision)))),
  CONSTRAINT grm_login_longitude_valida CHECK (((longitude IS NULL) OR ((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision)))),
  CONSTRAINT grm_login_movimentos_importacoes_pkey PRIMARY KEY (id),
  CONSTRAINT grm_login_movimentos_importacoes_chave_unica_key UNIQUE (chave_unica)
);

CREATE TABLE public.grm_mapa_embarque_importacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_sincronizacao timestamp with time zone DEFAULT now(),
  dados_json jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  sincronizado_em timestamp with time zone,
  CONSTRAINT grm_mapa_embarque_importacoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.grm_nf_lancamento_execucoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'INICIADO'::text,
  dry_run boolean NOT NULL DEFAULT true,
  iniciado_em timestamp with time zone NOT NULL DEFAULT now(),
  finalizado_em timestamp with time zone,
  resumo jsonb NOT NULL DEFAULT '{}'::jsonb,
  erro text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT grm_nf_lancamento_execucoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.grm_nf_lancamentos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  execucao_id uuid,
  storage_bucket text NOT NULL DEFAULT 'notas-fiscais'::text,
  storage_path text NOT NULL,
  arquivo_nome text NOT NULL,
  arquivo_mime_type text,
  setor text,
  enviado_por uuid,
  fingerprint text,
  status text NOT NULL DEFAULT 'NOVO'::text,
  tentativas integer NOT NULL DEFAULT 0,
  fornecedor_cnpj text,
  fornecedor_nome text,
  numero_documento text,
  data_emissao date,
  data_vencimento date,
  valor_total numeric(18,2),
  grupo_categoria text,
  categoria text,
  forma_pagamento text,
  origem_extracao text,
  extraido_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  validacao_erros jsonb NOT NULL DEFAULT '[]'::jsonb,
  grm_codigo text,
  grm_grupo text,
  grm_resposta jsonb,
  processado_em timestamp with time zone,
  lancado_em timestamp with time zone,
  erro text,
  rh_folha_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT grm_nf_lancamentos_pkey PRIMARY KEY (id),
  CONSTRAINT grm_nf_lancamentos_storage_path_key UNIQUE (storage_path),
  CONSTRAINT grm_nf_lancamentos_execucao_id_fkey FOREIGN KEY (execucao_id) REFERENCES grm_nf_lancamento_execucoes(id) ON DELETE SET NULL,
  CONSTRAINT grm_nf_lancamentos_enviado_por_fkey FOREIGN KEY (enviado_por) REFERENCES auth.users(id),
  CONSTRAINT grm_nf_lancamentos_rh_folha_id_fkey FOREIGN KEY (rh_folha_id) REFERENCES rh_folha(id) ON DELETE SET NULL
);

CREATE TABLE public.grm_nhe_importacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_sincronizacao timestamp with time zone DEFAULT now(),
  dados_json jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  sincronizado_em timestamp with time zone,
  CONSTRAINT grm_nhe_importacoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.grm_notas_fiscais_importacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_sincronizacao timestamp with time zone DEFAULT now(),
  data_nota_de date,
  data_nota_ate date,
  data_fatura_de date,
  data_fatura_ate date,
  cliente_nacional text,
  numero_nf text,
  valor_total numeric,
  dados_json jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  sincronizado_em timestamp with time zone,
  data_nota_real date,
  valor_nota_real numeric,
  fatura text,
  empresa text,
  CONSTRAINT grm_notas_fiscais_importacoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.grm_notas_fiscais_importacoes_backup_20260824 (
  id uuid,
  data_sincronizacao timestamp with time zone,
  data_nota_de date,
  data_nota_ate date,
  data_fatura_de date,
  data_fatura_ate date,
  cliente_nacional text,
  numero_nf text,
  valor_total numeric,
  dados_json jsonb,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  sincronizado_em timestamp with time zone,
  data_nota_real date,
  valor_nota_real numeric
);

CREATE TABLE public.grm_patrimonios_importacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_sincronizacao timestamp with time zone DEFAULT now(),
  dados_json jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  sincronizado_em timestamp with time zone,
  CONSTRAINT grm_patrimonios_importacoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.grm_producao_diaria_importacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_sincronizacao timestamp with time zone DEFAULT now(),
  periodo_de date,
  periodo_ate date,
  funcionario text,
  dia date,
  os text,
  producao numeric,
  dados_json jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  sincronizado_em timestamp with time zone,
  CONSTRAINT grm_producao_diaria_importacoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.grm_reabertura_os_execucoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  fila_id uuid,
  os text NOT NULL,
  iniciado_em timestamp with time zone NOT NULL DEFAULT now(),
  finalizado_em timestamp with time zone,
  dry_run boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'INICIADO'::text,
  erro text,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT grm_reabertura_os_execucoes_pkey PRIMARY KEY (id),
  CONSTRAINT grm_reabertura_os_execucoes_fila_id_fkey FOREIGN KEY (fila_id) REFERENCES grm_reabertura_os_fila(id) ON DELETE SET NULL
);

CREATE TABLE public.grm_reabertura_os_fila (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  os text NOT NULL,
  resultado_fechamento_id bigint,
  fechamento_em timestamp with time zone NOT NULL,
  fechamento_data date NOT NULL,
  criterio_fechamento text,
  servico text,
  remanescente numeric,
  data_os date,
  ultimo_embarque date,
  ultimo_fob date,
  dias_sem_embarque integer,
  dias_sem_fob integer,
  motivos text[] NOT NULL DEFAULT '{}'::text[],
  prioridade smallint NOT NULL DEFAULT 2,
  status text NOT NULL DEFAULT 'PENDENTE_REABERTURA'::text,
  snapshot_lista_os_em timestamp with time zone,
  regra_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  observacao text,
  tentativas integer NOT NULL DEFAULT 0,
  reaberto_em timestamp with time zone,
  erro text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT grm_reabertura_os_fila_prioridade_check CHECK (((prioridade >= 1) AND (prioridade <= 3))),
  CONSTRAINT grm_reabertura_os_fila_pkey PRIMARY KEY (id),
  CONSTRAINT grm_reabertura_os_fila_os_key UNIQUE (os),
  CONSTRAINT grm_reabertura_os_fila_resultado_fechamento_id_fkey FOREIGN KEY (resultado_fechamento_id) REFERENCES grm_finalizacao_os_resultados(id) ON DELETE SET NULL,
  CONSTRAINT grm_reabertura_os_fila_status_check CHECK ((status = ANY (ARRAY['PENDENTE_REABERTURA'::text, 'EM_REABERTURA'::text, 'REABERTA'::text, 'IGNORADA'::text, 'ERRO'::text, 'RESOLVIDA_SEM_REABERTURA'::text, 'REVISAO_MANUAL'::text])))
);

CREATE TABLE public.grm_resultado_diario_importacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_sincronizacao timestamp with time zone DEFAULT now(),
  data_classificacao_de date,
  data_classificacao_ate date,
  incluir_valores text,
  cliente_nacional text,
  uf_embarque text,
  uf_destino text,
  produto text,
  coordenacao text,
  resultado numeric,
  dados_json jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  sincronizado_em timestamp with time zone,
  CONSTRAINT grm_resultado_diario_importacoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.grm_sync_agent_settings (
  agent_id text NOT NULL,
  queue_lane text NOT NULL,
  interval_minutes integer NOT NULL DEFAULT 60,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid,
  target_lane text,
  direction text,
  resource_class text,
  priority smallint NOT NULL DEFAULT 50,
  max_runtime_minutes smallint NOT NULL DEFAULT 20,
  depends_on jsonb NOT NULL DEFAULT '[]'::jsonb,
  mutex_group text,
  legacy_lane_before_v2 text,
  CONSTRAINT grm_sync_agent_settings_interval_minutes_check CHECK (((interval_minutes >= 0) AND (interval_minutes <= 10080))),
  CONSTRAINT grm_sync_agent_settings_pkey PRIMARY KEY (agent_id),
  CONSTRAINT grm_sync_agent_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id),
  CONSTRAINT grm_sync_agent_settings_target_lane_fkey FOREIGN KEY (target_lane) REFERENCES grm_sync_lanes(lane),
  CONSTRAINT grm_sync_agent_settings_direction_check_v2 CHECK (((direction IS NULL) OR (direction = ANY (ARRAY['entrada'::text, 'saida'::text, 'derivacao'::text])))),
  CONSTRAINT grm_sync_agent_settings_resource_class_check CHECK (((resource_class IS NULL) OR (resource_class = ANY (ARRAY['light'::text, 'medium'::text, 'heavy'::text])))),
  CONSTRAINT grm_sync_agent_settings_priority_check CHECK (((priority >= 1) AND (priority <= 100))),
  CONSTRAINT grm_sync_agent_settings_runtime_check CHECK (((max_runtime_minutes >= 1) AND (max_runtime_minutes <= 240))),
  CONSTRAINT grm_sync_agent_settings_depends_on_check CHECK ((jsonb_typeof(depends_on) = 'array'::text)),
  CONSTRAINT grm_sync_agent_settings_queue_lane_check CHECK ((queue_lane = ANY (ARRAY['fixed_a'::text, 'fixed_b'::text, 'fixed_c'::text, 'alteracoes'::text, 'despesas_distribuicao'::text, 'entrada_os'::text, 'entrada_producao'::text, 'entrada_financeiro_a'::text, 'entrada_financeiro_b'::text, 'entrada_cadastros_operacao'::text, 'saida_os'::text, 'saida_logistica'::text, 'saida_financeiro'::text])))
);

CREATE TABLE public.grm_sync_cutover_history (
  id bigint NOT NULL,
  action text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT grm_sync_cutover_history_action_check CHECK ((action = ANY (ARRAY['activate_v2'::text, 'rollback_v1'::text]))),
  CONSTRAINT grm_sync_cutover_history_pkey PRIMARY KEY (id)
);

CREATE TABLE public.grm_sync_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  agente_id text NOT NULL,
  status text NOT NULL DEFAULT 'pendente'::text,
  solicitado_por text,
  solicitado_em timestamp with time zone NOT NULL DEFAULT now(),
  iniciado_em timestamp with time zone,
  finalizado_em timestamp with time zone,
  duration_ms integer,
  output jsonb,
  erro text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  payload jsonb,
  lane text,
  pipeline_seq bigint,
  worker_id text,
  heartbeat_at timestamp with time zone,
  lease_expires_at timestamp with time zone,
  tentativas integer NOT NULL DEFAULT 0,
  memory_peak_mb numeric(10,2),
  vps_memory_peak_mb numeric(12,2),
  vps_memory_total_mb numeric(12,2),
  vps_disk_used_mb numeric(14,2),
  vps_disk_total_mb numeric(14,2),
  CONSTRAINT grm_sync_jobs_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'rodando'::text, 'sucesso'::text, 'erro'::text, 'cancelado'::text]))),
  CONSTRAINT grm_sync_jobs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.grm_sync_lanes (
  lane text NOT NULL,
  label text NOT NULL,
  direction text NOT NULL,
  sort_order smallint NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  max_concurrency smallint NOT NULL DEFAULT 1,
  legacy_lane text,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT grm_sync_lanes_direction_check CHECK ((direction = ANY (ARRAY['entrada'::text, 'saida'::text, 'derivacao'::text]))),
  CONSTRAINT grm_sync_lanes_max_concurrency_check CHECK (((max_concurrency >= 1) AND (max_concurrency <= 8))),
  CONSTRAINT grm_sync_lanes_legacy_lane_check CHECK (((legacy_lane IS NULL) OR (legacy_lane = ANY (ARRAY['fixed_a'::text, 'fixed_b'::text, 'fixed_c'::text, 'alteracoes'::text, 'despesas_distribuicao'::text])))),
  CONSTRAINT grm_sync_lanes_pkey PRIMARY KEY (lane)
);

CREATE TABLE public.grm_sync_runtime_policy (
  id smallint NOT NULL,
  max_workers smallint NOT NULL DEFAULT 8,
  max_heavy_concurrent smallint NOT NULL DEFAULT 4,
  min_free_memory_mb integer NOT NULL DEFAULT 2500,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  active_version smallint NOT NULL DEFAULT 1,
  cutover_at timestamp with time zone,
  CONSTRAINT grm_sync_runtime_policy_max_workers_check CHECK (((max_workers >= 1) AND (max_workers <= 32))),
  CONSTRAINT grm_sync_runtime_policy_max_heavy_concurrent_check CHECK (((max_heavy_concurrent >= 1) AND (max_heavy_concurrent <= 16))),
  CONSTRAINT grm_sync_runtime_policy_min_free_memory_mb_check CHECK ((min_free_memory_mb >= 512)),
  CONSTRAINT grm_sync_runtime_policy_singleton CHECK ((id = 1)),
  CONSTRAINT grm_sync_runtime_policy_pkey PRIMARY KEY (id),
  CONSTRAINT grm_sync_runtime_policy_version_check CHECK ((active_version = ANY (ARRAY[1, 2])))
);

CREATE TABLE public.historico_colaboradores (
  id bigint NOT NULL DEFAULT nextval('historico_colaboradores_id_seq'::regclass),
  data_referencia date NOT NULL,
  cpf text,
  nome text,
  situacao text,
  admissao text,
  desligamento text,
  salario text,
  conta_bancaria_despesas text,
  empresa text,
  coordenacao text,
  supervisao text,
  tipo text,
  cep text,
  estado text,
  cidade text,
  bairro text,
  endereco text,
  complemento text,
  data_nascimento text,
  cargo text,
  whatsapp text,
  email_pessoal text,
  email_empresa text,
  origem text DEFAULT 'planilha_dados'::text,
  snapshot_json jsonb,
  created_at timestamp with time zone DEFAULT now(),
  importacao_id uuid,
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT historico_colaboradores_pkey PRIMARY KEY (id)
);

CREATE TABLE public.hospedagem_adiantamento_movimentos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  adiantamento_id uuid NOT NULL,
  reserva_id uuid,
  tipo text NOT NULL,
  valor numeric(14,2) NOT NULL,
  observacoes text,
  criado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT hospedagem_adiantamento_movimentos_tipo_check CHECK ((tipo = ANY (ARRAY['CREDITO'::text, 'DEBITO'::text, 'ESTORNO'::text]))),
  CONSTRAINT hospedagem_adiantamento_movimentos_valor_check CHECK ((valor > (0)::numeric)),
  CONSTRAINT hospedagem_adiantamento_movimentos_pkey PRIMARY KEY (id),
  CONSTRAINT hospedagem_adiantamento_movimentos_adiantamento_id_fkey FOREIGN KEY (adiantamento_id) REFERENCES hospedagem_adiantamentos(id) ON DELETE RESTRICT,
  CONSTRAINT hospedagem_adiantamento_movimentos_reserva_id_fkey FOREIGN KEY (reserva_id) REFERENCES hospedagem_reservas(id)
);

CREATE TABLE public.hospedagem_adiantamentos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL,
  reserva_origem_id uuid,
  valor_creditado numeric(14,2) NOT NULL,
  saldo numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'DISPONIVEL'::text,
  observacoes text,
  criado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT hospedagem_adiantamentos_valor_creditado_check CHECK ((valor_creditado > (0)::numeric)),
  CONSTRAINT hospedagem_adiantamentos_saldo_check CHECK ((saldo >= (0)::numeric)),
  CONSTRAINT hospedagem_adiantamentos_status_check CHECK ((status = ANY (ARRAY['DISPONIVEL'::text, 'UTILIZADO'::text, 'CANCELADO'::text]))),
  CONSTRAINT hospedagem_adiantamentos_pkey PRIMARY KEY (id),
  CONSTRAINT hospedagem_adiantamentos_hotel_id_fkey FOREIGN KEY (hotel_id) REFERENCES hospedagem_hoteis(id),
  CONSTRAINT hospedagem_adiantamentos_reserva_origem_id_fkey FOREIGN KEY (reserva_origem_id) REFERENCES hospedagem_reservas(id)
);

CREATE TABLE public.hospedagem_alojamentos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'CASA'::text,
  cidade text NOT NULL,
  uf text NOT NULL,
  endereco text,
  capacidade integer,
  quartos integer,
  responsavel text,
  contato text,
  status text NOT NULL DEFAULT 'ATIVO'::text,
  prioridade text NOT NULL DEFAULT 'NORMAL'::text,
  valor_aluguel numeric(14,2),
  agua text,
  energia text,
  internet text,
  empresa_internet text,
  vencimento_aluguel integer,
  vencimento_agua integer,
  vencimento_energia integer,
  vencimento_internet integer,
  anexo_url text,
  descricao_fatura text,
  observacoes text,
  criado_por uuid,
  atualizado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  contrato_url text,
  contrato_inicio date,
  contrato_fim date,
  endereco_logradouro text,
  endereco_numero text,
  endereco_complemento text,
  bairro text,
  cep text,
  referencia text,
  link_localizacao text,
  agua_inclusa boolean,
  agua_matricula text,
  energia_inclusa boolean,
  energia_matricula text,
  internet_inclusa boolean,
  internet_matricula text,
  gas_forma_pagamento text,
  anotacoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  latitude numeric,
  longitude numeric,
  supervisao text,
  supervisoes text[] NOT NULL DEFAULT '{}'::text[],
  CONSTRAINT hospedagem_alojamentos_prioridade_chk CHECK ((prioridade = ANY (ARRAY['NORMAL'::text, 'PREFERENCIAL'::text, 'EVITAR'::text]))),
  CONSTRAINT hospedagem_alojamentos_status_chk CHECK ((status = ANY (ARRAY['ATIVO'::text, 'INATIVO'::text, 'BLOQUEADO'::text]))),
  CONSTRAINT hospedagem_alojamentos_tipo_chk CHECK ((tipo = ANY (ARRAY['CASA'::text, 'APARTAMENTO'::text, 'POUSADA'::text, 'ESCRITORIO'::text, 'OUTRO'::text]))),
  CONSTRAINT hospedagem_alojamentos_uf_chk CHECK ((char_length(uf) = 2)),
  CONSTRAINT hospedagem_alojamentos_venc_agua_chk CHECK (((vencimento_agua IS NULL) OR ((vencimento_agua >= 1) AND (vencimento_agua <= 31)))),
  CONSTRAINT hospedagem_alojamentos_venc_aluguel_chk CHECK (((vencimento_aluguel IS NULL) OR ((vencimento_aluguel >= 1) AND (vencimento_aluguel <= 31)))),
  CONSTRAINT hospedagem_alojamentos_venc_energia_chk CHECK (((vencimento_energia IS NULL) OR ((vencimento_energia >= 1) AND (vencimento_energia <= 31)))),
  CONSTRAINT hospedagem_alojamentos_venc_internet_chk CHECK (((vencimento_internet IS NULL) OR ((vencimento_internet >= 1) AND (vencimento_internet <= 31)))),
  CONSTRAINT hospedagem_alojamentos_pkey PRIMARY KEY (id)
);

CREATE TABLE public.hospedagem_anexos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  solicitacao_id uuid,
  reserva_id uuid,
  financeiro_id uuid,
  nota_id uuid,
  tipo_anexo text NOT NULL,
  nome_arquivo text,
  url_arquivo text NOT NULL,
  mime_type text,
  tamanho_bytes bigint,
  enviado_por uuid,
  enviado_por_nome text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT hospedagem_anexos_pkey PRIMARY KEY (id),
  CONSTRAINT hospedagem_anexos_financeiro_id_fkey FOREIGN KEY (financeiro_id) REFERENCES hospedagem_financeiro(id) ON DELETE CASCADE,
  CONSTRAINT hospedagem_anexos_nota_id_fkey FOREIGN KEY (nota_id) REFERENCES hospedagem_notas(id) ON DELETE CASCADE,
  CONSTRAINT hospedagem_anexos_reserva_id_fkey FOREIGN KEY (reserva_id) REFERENCES hospedagem_reservas(id) ON DELETE CASCADE,
  CONSTRAINT hospedagem_anexos_solicitacao_id_fkey FOREIGN KEY (solicitacao_id) REFERENCES hospedagem_solicitacoes(id) ON DELETE CASCADE
);

CREATE TABLE public.hospedagem_checkout_lote_colaboradores (
  lote_id uuid NOT NULL,
  reserva_colaborador_id uuid,
  nome_colaborador text NOT NULL,
  solicitacao_colaborador_id uuid,
  CONSTRAINT hospedagem_checkout_lote_colaboradores_pkey PRIMARY KEY (lote_id, nome_colaborador),
  CONSTRAINT hospedagem_checkout_lote_colaboradores_lote_id_fkey FOREIGN KEY (lote_id) REFERENCES hospedagem_checkout_lotes(id) ON DELETE CASCADE,
  CONSTRAINT hospedagem_checkout_lote_colab_solicitacao_fk FOREIGN KEY (solicitacao_colaborador_id) REFERENCES hospedagem_solicitacao_colaboradores(id) ON DELETE RESTRICT
);

CREATE TABLE public.hospedagem_checkout_lotes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  reserva_id uuid NOT NULL,
  hotel_id uuid,
  data_checkout date NOT NULL DEFAULT CURRENT_DATE,
  valor_diarias numeric(12,2) NOT NULL DEFAULT 0,
  valor_extras numeric(12,2) NOT NULL DEFAULT 0,
  valor_total numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDENTE'::text,
  observacoes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT hospedagem_checkout_lotes_status_check CHECK ((status = ANY (ARRAY['PENDENTE'::text, 'PARCIAL'::text, 'PAGO'::text, 'CANCELADO'::text]))),
  CONSTRAINT hospedagem_checkout_lotes_pkey PRIMARY KEY (id),
  CONSTRAINT hospedagem_checkout_lotes_reserva_id_fkey FOREIGN KEY (reserva_id) REFERENCES hospedagem_reservas(id) ON DELETE CASCADE,
  CONSTRAINT hospedagem_checkout_lotes_hotel_id_fkey FOREIGN KEY (hotel_id) REFERENCES hospedagem_hoteis(id) ON DELETE SET NULL
);

CREATE TABLE public.hospedagem_cotacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL,
  hotel_id uuid NOT NULL,
  hotel_nome text,
  status text NOT NULL DEFAULT 'PENDENTE'::text,
  quantidade_pessoas integer,
  quantidade_quartos integer,
  composicao_quartos text,
  diarias_previstas numeric(10,2),
  valor_diaria numeric(14,2),
  valor_total numeric(14,2),
  disponibilidade boolean,
  aceita_pagamento_checkout boolean,
  cafe_incluso boolean,
  estacionamento_incluso boolean,
  observacoes text,
  mensagem_enviada text,
  resposta_texto text,
  resposta_dados jsonb,
  resposta_flow_id text,
  erro_envio text,
  enviado_em timestamp with time zone,
  respondido_em timestamp with time zone,
  selecionada boolean NOT NULL DEFAULT false,
  selecionada_em timestamp with time zone,
  criado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT hospedagem_cotacoes_pkey PRIMARY KEY (id),
  CONSTRAINT hospedagem_cotacoes_solicitacao_id_hotel_id_key UNIQUE (solicitacao_id, hotel_id)
);

CREATE TABLE public.hospedagem_custos_extras (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL,
  reserva_id uuid,
  tipo text NOT NULL DEFAULT 'OUTROS'::text,
  descricao text NOT NULL,
  quantidade numeric(12,2) NOT NULL DEFAULT 1,
  valor_unitario numeric(14,2) NOT NULL DEFAULT 0,
  valor_total numeric(14,2) NOT NULL DEFAULT 0,
  data_custo date NOT NULL DEFAULT CURRENT_DATE,
  autorizado_por uuid,
  autorizado_por_nome text,
  anexo_url text,
  observacoes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  enviar_conferencia boolean NOT NULL DEFAULT false,
  status_conferencia text NOT NULL DEFAULT 'NAO_ENVIADO'::text,
  CONSTRAINT hospedagem_custos_extras_pkey PRIMARY KEY (id)
);

CREATE TABLE public.hospedagem_diferencas_colaborador (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  reserva_id uuid NOT NULL,
  solicitacao_colaborador_id uuid NOT NULL,
  valor numeric(12,2) NOT NULL,
  observacoes text,
  criado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT hospedagem_diferencas_colaborador_valor_check CHECK ((valor > (0)::numeric)),
  CONSTRAINT hospedagem_diferencas_colaborador_pkey PRIMARY KEY (id),
  CONSTRAINT hospedagem_diferencas_colaborador_reserva_id_fkey FOREIGN KEY (reserva_id) REFERENCES hospedagem_reservas(id) ON DELETE CASCADE,
  CONSTRAINT hospedagem_diferencas_colaborad_solicitacao_colaborador_id_fkey FOREIGN KEY (solicitacao_colaborador_id) REFERENCES hospedagem_solicitacao_colaboradores(id) ON DELETE CASCADE
);

CREATE TABLE public.hospedagem_documentos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL,
  reserva_id uuid,
  tipo text NOT NULL DEFAULT 'OUTRO'::text,
  arquivo_url text NOT NULL,
  nome_arquivo text,
  mime_type text,
  origem text NOT NULL DEFAULT 'PAINEL'::text,
  status text NOT NULL DEFAULT 'ANEXADO'::text,
  external_message_id text,
  botconversa_destinatario text,
  botconversa_enviado_em timestamp with time zone,
  recebido_em timestamp with time zone,
  observacoes text,
  criado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT hospedagem_documentos_pkey PRIMARY KEY (id)
);

CREATE TABLE public.hospedagem_eventos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  solicitacao_id uuid,
  reserva_id uuid,
  usuario_id uuid,
  usuario_nome text,
  tipo_evento text NOT NULL,
  descricao text,
  status_anterior text,
  status_novo text,
  payload jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT hospedagem_eventos_pkey PRIMARY KEY (id),
  CONSTRAINT hospedagem_eventos_reserva_id_fkey FOREIGN KEY (reserva_id) REFERENCES hospedagem_reservas(id) ON DELETE CASCADE,
  CONSTRAINT hospedagem_eventos_solicitacao_id_fkey FOREIGN KEY (solicitacao_id) REFERENCES hospedagem_solicitacoes(id) ON DELETE CASCADE
);

CREATE TABLE public.hospedagem_financeiro (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  reserva_id uuid NOT NULL,
  valor_total numeric(12,2) NOT NULL DEFAULT 0,
  forma_pagamento text,
  status_financeiro text DEFAULT 'NAO_INICIADO'::text,
  data_vencimento date,
  data_pagamento date,
  responsavel_pagamento text,
  responsavel_pagamento_id uuid,
  enviado_financeiro_em timestamp with time zone,
  pago_em timestamp with time zone,
  comprovante_pagamento_url text,
  observacao_financeiro text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  origem_pagamento text,
  condicao_pagamento text,
  valor_pago numeric(14,2),
  saldo numeric(14,2),
  comprovante_url text,
  comprovante_enviado_em timestamp with time zone,
  valor_original numeric(14,2),
  pagamento_parcial boolean NOT NULL DEFAULT false,
  taxa_bancaria numeric(14,2) NOT NULL DEFAULT 0,
  valor_comprovante numeric(14,2),
  classificacao_pagamento text,
  adiantamento_gerado numeric(14,2) NOT NULL DEFAULT 0,
  CONSTRAINT hospedagem_financeiro_pkey PRIMARY KEY (id),
  CONSTRAINT hospedagem_financeiro_reserva_id_fkey FOREIGN KEY (reserva_id) REFERENCES hospedagem_reservas(id) ON DELETE CASCADE
);

CREATE TABLE public.hospedagem_historico_colaboradores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  unique_hash text NOT NULL,
  data date NOT NULL,
  regional text,
  cidade text,
  uf text,
  colaborador text NOT NULL,
  status_planilha text,
  status_hospedagem text NOT NULL DEFAULT 'HOSPEDADO'::text,
  hotel text NOT NULL,
  localizacao text,
  tipo_quarto text,
  valor_diaria numeric,
  local_embarque text,
  cliente text,
  saldo numeric,
  situacao_pagamento text,
  nfs text,
  observacao text,
  arquivo_origem text,
  aba_origem text,
  linha_origem integer,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT hospedagem_historico_colaboradores_pkey PRIMARY KEY (id),
  CONSTRAINT hospedagem_historico_colaboradores_unique_hash_key UNIQUE (unique_hash)
);

CREATE TABLE public.hospedagem_hoteis (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  razao_social text,
  cnpj_cpf text,
  cidade text NOT NULL,
  uf text NOT NULL,
  endereco text,
  bairro text,
  cep text,
  latitude numeric(12,8),
  longitude numeric(12,8),
  link_maps text,
  telefone text,
  whatsapp text,
  email text,
  chave_pix text,
  banco text,
  agencia text,
  conta text,
  tipo_conta text,
  favorecido text,
  valor_diaria_padrao numeric(12,2),
  valor_diaria_individual numeric(12,2),
  valor_diaria_duplo numeric(12,2),
  valor_diaria_triplo numeric(12,2),
  inclui_cafe boolean DEFAULT false,
  inclui_almoco boolean DEFAULT false,
  inclui_janta boolean DEFAULT false,
  estacionamento boolean DEFAULT false,
  prioridade text DEFAULT 'NORMAL'::text,
  status text DEFAULT 'ATIVO'::text,
  avaliacao_interna numeric(3,1),
  observacoes text,
  criado_por uuid,
  atualizado_por uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  grupo_origem text,
  icone_origem text,
  origem_importacao text,
  chave_importacao text,
  ultima_importacao_em timestamp with time zone,
  valor_diaria_quadruplo numeric,
  emite_nota_fiscal boolean NOT NULL DEFAULT true,
  aceita_pagamento_checkout boolean,
  condicao_pagamento_padrao text,
  recebe_cotacao boolean NOT NULL DEFAULT true,
  whatsapp_validado boolean NOT NULL DEFAULT false,
  pix_chave text,
  email_financeiro text,
  CONSTRAINT hospedagem_hoteis_pkey PRIMARY KEY (id)
);

CREATE TABLE public.hospedagem_mensagens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL,
  reserva_id uuid,
  hotel_id uuid,
  direcao text NOT NULL DEFAULT 'SAIDA'::text,
  tipo text NOT NULL DEFAULT 'OUTRO'::text,
  canal text NOT NULL DEFAULT 'BOTCONVERSA'::text,
  remetente text,
  destinatario text,
  conteudo text,
  arquivo_url text,
  external_message_id text,
  status text NOT NULL DEFAULT 'PENDENTE'::text,
  erro text,
  enviado_em timestamp with time zone,
  recebido_em timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT hospedagem_mensagens_pkey PRIMARY KEY (id)
);

CREATE TABLE public.hospedagem_notas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  reserva_id uuid NOT NULL,
  tipo_nota text DEFAULT 'NFSE'::text,
  numero_nf text,
  chave_acesso text,
  valor_nf numeric(12,2),
  data_emissao date,
  status_nota text DEFAULT 'NAO_SOLICITADA'::text,
  nf_solicitada_em timestamp with time zone,
  nf_recebida_em timestamp with time zone,
  enviado_lancamento_em timestamp with time zone,
  lancado_em timestamp with time zone,
  nota_url text,
  xml_url text,
  comprovante_url text,
  observacao text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT hospedagem_notas_pkey PRIMARY KEY (id),
  CONSTRAINT hospedagem_notas_reserva_id_fkey FOREIGN KEY (reserva_id) REFERENCES hospedagem_reservas(id) ON DELETE CASCADE
);

CREATE TABLE public.hospedagem_producao_diarias (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data date NOT NULL,
  regional text,
  cidade text,
  funcionario text NOT NULL,
  status text,
  hotel text NOT NULL,
  localizacao text,
  tipo_diaria text,
  valor_diaria numeric(10,2),
  local_trabalho text,
  cliente text,
  saldo numeric(10,2),
  situacao_pgto text,
  nfs text,
  observacao text,
  importado_por uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT hospedagem_producao_diarias_pkey PRIMARY KEY (id),
  CONSTRAINT hospedagem_producao_diarias_importado_por_fkey FOREIGN KEY (importado_por) REFERENCES auth.users(id)
);

CREATE TABLE public.hospedagem_reserva_colaboradores (
  reserva_id uuid NOT NULL,
  solicitacao_colaborador_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'HOSPEDADO'::text,
  checkout_em timestamp with time zone,
  checkout_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  reserva_quarto_id uuid,
  CONSTRAINT hospedagem_reserva_colaboradores_status_check CHECK ((status = ANY (ARRAY['HOSPEDADO'::text, 'CHECKOUT'::text, 'CANCELADO'::text]))),
  CONSTRAINT hospedagem_reserva_colaboradores_pkey PRIMARY KEY (reserva_id, solicitacao_colaborador_id),
  CONSTRAINT hospedagem_reserva_colaboradores_reserva_id_fkey FOREIGN KEY (reserva_id) REFERENCES hospedagem_reservas(id) ON DELETE CASCADE,
  CONSTRAINT hospedagem_reserva_colaboradore_solicitacao_colaborador_id_fkey FOREIGN KEY (solicitacao_colaborador_id) REFERENCES hospedagem_solicitacao_colaboradores(id) ON DELETE CASCADE,
  CONSTRAINT hospedagem_reserva_colaboradores_reserva_quarto_id_fkey FOREIGN KEY (reserva_quarto_id) REFERENCES hospedagem_reserva_quartos(id) ON DELETE SET NULL
);

CREATE TABLE public.hospedagem_reserva_quartos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  reserva_id uuid NOT NULL,
  quantidade integer NOT NULL DEFAULT 1,
  tipo_quarto text NOT NULL DEFAULT 'INDIVIDUAL'::text,
  genero text,
  valor_diaria numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT hospedagem_reserva_quartos_quantidade_check CHECK ((quantidade > 0)),
  CONSTRAINT hospedagem_reserva_quartos_tipo_quarto_check CHECK ((tipo_quarto = ANY (ARRAY['INDIVIDUAL'::text, 'DUPLO'::text, 'TRIPLO'::text, 'QUADRUPLO'::text]))),
  CONSTRAINT hospedagem_reserva_quartos_genero_check CHECK ((genero = ANY (ARRAY['MASC'::text, 'FEM'::text, 'MISTO'::text]))),
  CONSTRAINT hospedagem_reserva_quartos_pkey PRIMARY KEY (id),
  CONSTRAINT hospedagem_reserva_quartos_reserva_id_fkey FOREIGN KEY (reserva_id) REFERENCES hospedagem_reservas(id) ON DELETE CASCADE
);

CREATE TABLE public.hospedagem_reserva_solicitacoes (
  reserva_id uuid NOT NULL,
  solicitacao_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT hospedagem_reserva_solicitacoes_pkey PRIMARY KEY (reserva_id, solicitacao_id),
  CONSTRAINT hospedagem_reserva_solicitacoes_solicitacao_id_key UNIQUE (solicitacao_id),
  CONSTRAINT hospedagem_reserva_solicitacoes_reserva_id_fkey FOREIGN KEY (reserva_id) REFERENCES hospedagem_reservas(id) ON DELETE CASCADE,
  CONSTRAINT hospedagem_reserva_solicitacoes_solicitacao_id_fkey FOREIGN KEY (solicitacao_id) REFERENCES hospedagem_solicitacoes(id) ON DELETE CASCADE
);

CREATE TABLE public.hospedagem_reservas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL,
  hotel_id uuid,
  nome_hotel text,
  cidade_hotel text,
  uf_hotel text,
  valor_diaria numeric(12,2) NOT NULL DEFAULT 0,
  quantidade_diarias integer NOT NULL DEFAULT 1,
  quantidade_quartos integer DEFAULT 1,
  tipo_quarto text DEFAULT 'INDIVIDUAL'::text,
  valor_total_previsto numeric(12,2),
  valor_total_final numeric(12,2),
  data_checkin date NOT NULL,
  data_checkout date NOT NULL,
  horario_chegada time without time zone,
  inclui_cafe boolean DEFAULT false,
  inclui_almoco boolean DEFAULT false,
  inclui_janta boolean DEFAULT false,
  estacionamento boolean DEFAULT false,
  confirmado_com text,
  contato_confirmacao text,
  codigo_reserva_hotel text,
  link_reserva text,
  comprovante_reserva_url text,
  status_hospedagem text DEFAULT 'CHECKIN_PREVISTO'::text,
  observacao_hospedagem text,
  criado_por uuid,
  atualizado_por uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT hospedagem_reservas_pkey PRIMARY KEY (id),
  CONSTRAINT hospedagem_reservas_hotel_id_fkey FOREIGN KEY (hotel_id) REFERENCES hospedagem_hoteis(id) ON DELETE SET NULL,
  CONSTRAINT hospedagem_reservas_solicitacao_id_fkey FOREIGN KEY (solicitacao_id) REFERENCES hospedagem_solicitacoes(id) ON DELETE CASCADE
);

CREATE TABLE public.hospedagem_solicitacao_colaboradores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL,
  colaborador_id uuid,
  nome_colaborador text NOT NULL,
  cpf text,
  tipo_colaborador text,
  empresa text,
  coordenacao text,
  supervisao text,
  status_colaborador text DEFAULT 'ATIVO'::text,
  observacoes text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT hospedagem_solicitacao_colaboradores_pkey PRIMARY KEY (id),
  CONSTRAINT hospedagem_solicitacao_colaboradores_solicitacao_id_fkey FOREIGN KEY (solicitacao_id) REFERENCES hospedagem_solicitacoes(id) ON DELETE CASCADE
);

CREATE TABLE public.hospedagem_solicitacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_solicitacao date NOT NULL,
  colaborador text,
  cidade text,
  checkin date,
  checkout date,
  hotel_sugerido text,
  status text NOT NULL DEFAULT 'aberto'::text,
  observacoes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  codigo text,
  solicitante_nome text,
  solicitante_email text,
  empresa text,
  coordenacao text,
  supervisao text,
  regional text,
  cliente text,
  endereco_embarque text,
  latitude_embarque numeric(12,8),
  longitude_embarque numeric(12,8),
  observacao_interna text,
  cancelado_em timestamp with time zone,
  cancelado_por uuid,
  motivo_cancelamento text,
  solicitante_id uuid,
  uf text,
  local_embarque text,
  link_local_embarque text,
  data_checkin_prevista date,
  data_checkout_prevista date,
  horario_chegada_previsto time without time zone,
  quantidade_diarias_prevista integer,
  saldo_informado numeric(12,2),
  observacao_gestor text,
  status_solicitacao text DEFAULT 'SOLICITADA'::text,
  updated_at timestamp with time zone DEFAULT now(),
  programacao_id uuid,
  preferencia_hospedagem text,
  CONSTRAINT hospedagem_solicitacoes_pkey PRIMARY KEY (id),
  CONSTRAINT hospedagem_solicitacoes_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT hospedagem_solicitacoes_programacao_id_fkey FOREIGN KEY (programacao_id) REFERENCES programacao_dia(id) ON DELETE SET NULL,
  CONSTRAINT hospedagem_solicitacoes_preferencia_check CHECK (((preferencia_hospedagem IS NULL) OR (preferencia_hospedagem = ANY (ARRAY['HOTEL'::text, 'ALOJAMENTO'::text, 'SEM_PREFERENCIA'::text])))),
  CONSTRAINT hospedagem_solicitacoes_codigo_key UNIQUE (codigo)
);

CREATE TABLE public.importacoes_registros (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  fonte text NOT NULL,
  periodo_inicio date,
  periodo_fim date,
  qtd_recebida integer NOT NULL DEFAULT 0,
  qtd_inserida integer NOT NULL DEFAULT 0,
  qtd_atualizada integer NOT NULL DEFAULT 0,
  duplicidades integer NOT NULL DEFAULT 0,
  erros integer NOT NULL DEFAULT 0,
  detalhe_erros jsonb,
  responsavel text,
  arquivo_url text,
  job_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT importacoes_registros_pkey PRIMARY KEY (id)
);

CREATE TABLE public.indisponibilidades (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  colaborador_nome text NOT NULL,
  colaborador_cpf text,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  motivo text NOT NULL,
  observacoes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT indisponibilidades_pkey PRIMARY KEY (id),
  CONSTRAINT indisponibilidades_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE public.logistica_abertura_os (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  contratante_cliente text NOT NULL,
  filial_pagadora text NOT NULL,
  produtor text,
  armazem_embarque text NOT NULL,
  cidade_embarque text NOT NULL,
  cidade_destino text NOT NULL,
  local_destino text NOT NULL,
  numero_contrato text NOT NULL,
  produto text NOT NULL,
  tipo_produto text NOT NULL,
  volume_inicial numeric NOT NULL DEFAULT 0,
  regional text NOT NULL,
  troca_notas text NOT NULL,
  status text NOT NULL DEFAULT 'PENDENTE'::text,
  numero_os_cadastrada text,
  observacao_adm text,
  cadastrado_por uuid,
  cadastrado_em timestamp with time zone,
  solicitante_id uuid DEFAULT auth.uid(),
  solicitante_nome text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  servico text,
  aprovado_por uuid,
  aprovado_em timestamp with time zone,
  decidido_por uuid,
  decidido_em timestamp with time zone,
  agente_job_id uuid,
  processamento_iniciado_em timestamp with time zone,
  processamento_finalizado_em timestamp with time zone,
  erro_agente text,
  tentativas_agente integer NOT NULL DEFAULT 0,
  testes jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT logistica_abertura_os_servico_check CHECK ((servico = ANY (ARRAY['FOB'::text, 'CIF'::text, 'AUDITORIA'::text, 'CLASSIFICAÇÃO TRANSB. SAÍDA'::text, 'ACOMPANHAMENTO DE EMBARQUE'::text, 'CLASSIFICAÇÃO TRANSB. ENTRADA'::text]))),
  CONSTRAINT logistica_abertura_os_troca_notas_check CHECK (((troca_notas IS NULL) OR (troca_notas = ANY (ARRAY['SIM'::text, 'NAO'::text])))),
  CONSTRAINT logistica_abertura_os_volume_check CHECK (((volume_inicial IS NULL) OR (volume_inicial > (0)::numeric))),
  CONSTRAINT logistica_abertura_os_volume_inicial_check CHECK ((volume_inicial > (0)::numeric)),
  CONSTRAINT logistica_abertura_os_pkey PRIMARY KEY (id),
  CONSTRAINT logistica_abertura_os_cadastrado_por_fkey FOREIGN KEY (cadastrado_por) REFERENCES auth.users(id),
  CONSTRAINT logistica_abertura_os_solicitante_id_fkey FOREIGN KEY (solicitante_id) REFERENCES auth.users(id),
  CONSTRAINT logistica_abertura_os_status_check CHECK ((status = ANY (ARRAY['PENDENTE'::text, 'APROVADO'::text, 'PROCESSANDO'::text, 'CORRIGIR'::text, 'RECUSADO'::text, 'CADASTRADO'::text, 'ERRO'::text])))
);

CREATE TABLE public.logistica_ajuste_config (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente text NOT NULL,
  anexo_obrigatorio boolean NOT NULL DEFAULT false,
  observacao text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT logistica_ajuste_config_pkey PRIMARY KEY (id),
  CONSTRAINT logistica_ajuste_config_cliente_key UNIQUE (cliente)
);

CREATE TABLE public.logistica_ajustes_saldo (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  os_id text NOT NULL,
  numero_os text,
  cliente text,
  saldo_anterior numeric,
  saldo_solicitado numeric,
  saldo_aprovado numeric,
  motivo text,
  anexo_url text,
  solicitante text,
  responsavel_ajuste text,
  data date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'Solicitado'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  criado_por text,
  atualizado_por text,
  CONSTRAINT logistica_ajustes_saldo_pkey PRIMARY KEY (id)
);

CREATE TABLE public.logistica_alertas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  os_id uuid,
  os text,
  tipo text NOT NULL DEFAULT 'OS_ATRASADA'::text,
  status text NOT NULL DEFAULT 'PENDENTE'::text,
  resposta text,
  classificador text,
  telefone text,
  cliente text,
  local text,
  coordenacao text,
  ultima_atualizacao timestamp with time zone,
  atraso_horas numeric,
  mensagem text,
  payload jsonb,
  criado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT logistica_alertas_pkey PRIMARY KEY (id)
);

CREATE TABLE public.logistica_btg_ajustes (
  id bigint NOT NULL DEFAULT nextval('logistica_btg_ajustes_id_seq'::regclass),
  row_key text NOT NULL,
  status text NOT NULL DEFAULT 'AJUSTADO'::text,
  observacao text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT logistica_btg_ajustes_pkey PRIMARY KEY (id),
  CONSTRAINT logistica_btg_ajustes_row_key_key UNIQUE (row_key)
);

CREATE TABLE public.logistica_btg_distribuicao (
  id bigint NOT NULL DEFAULT nextval('logistica_btg_distribuicao_id_seq'::regclass),
  numero_os text,
  colaborador text,
  supervisao text,
  lote numeric DEFAULT 0,
  remanescente numeric DEFAULT 0,
  updated_at timestamp with time zone DEFAULT now(),
  contrato text,
  financeiro text,
  prod_dia_os text,
  CONSTRAINT logistica_btg_distribuicao_pkey PRIMARY KEY (id)
);

CREATE TABLE public.logistica_btg_lista_os (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  numero_os text,
  contrato text,
  situacao text,
  financeiro text,
  supervisao text,
  lote numeric,
  remanescente numeric,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT logistica_btg_lista_os_pkey PRIMARY KEY (id)
);

CREATE TABLE public.logistica_btg_solicitacoes (
  id bigint NOT NULL DEFAULT nextval('logistica_btg_solicitacoes_id_seq'::regclass),
  contrato_original text,
  contrato_status text,
  numero_os_relatorio text,
  tipo_solicitacao text,
  cliente text,
  commodity text,
  quantidade numeric DEFAULT 0,
  aba text,
  linha integer,
  raw jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  checkin_diario text,
  CONSTRAINT logistica_btg_solicitacoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.logistica_btg_solicitacoes_staging (
  id bigint NOT NULL DEFAULT nextval('logistica_btg_solicitacoes_id_seq'::regclass),
  contrato_original text,
  contrato_status text,
  numero_os_relatorio text,
  tipo_solicitacao text,
  cliente text,
  commodity text,
  quantidade numeric DEFAULT 0,
  aba text,
  linha integer,
  raw jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  checkin_diario text
);

CREATE TABLE public.logistica_cargas_irregularidades (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  chave_unica text NOT NULL,
  data_classificacao date NOT NULL,
  hora_cadastro time without time zone,
  os text NOT NULL,
  cliente text,
  coordenacao text,
  supervisao text,
  colaborador text,
  placa text,
  laudo text,
  nota_fiscal text,
  produto text,
  tons numeric,
  lat_lancamento double precision NOT NULL,
  lng_lancamento double precision NOT NULL,
  lat_os double precision,
  lng_os double precision,
  distancia_m integer,
  raio_m integer NOT NULL DEFAULT 2000,
  status text NOT NULL DEFAULT 'ABERTA'::text,
  origem text NOT NULL DEFAULT 'grm_relatorio_cargas'::text,
  observacao text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  detectado_em timestamp with time zone NOT NULL DEFAULT now(),
  ultima_verificacao_em timestamp with time zone NOT NULL DEFAULT now(),
  resolvido_em timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT logistica_cargas_irregularidades_chave_unica_key UNIQUE (chave_unica),
  CONSTRAINT logistica_cargas_irregularidades_pkey PRIMARY KEY (id)
);

CREATE TABLE public.logistica_cargas_monitor_execucoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_ref date NOT NULL,
  status text NOT NULL DEFAULT 'INICIADO'::text,
  iniciado_em timestamp with time zone NOT NULL DEFAULT now(),
  finalizado_em timestamp with time zone,
  total_linhas integer NOT NULL DEFAULT 0,
  total_com_coordenada integer NOT NULL DEFAULT 0,
  total_sem_referencia_os integer NOT NULL DEFAULT 0,
  total_irregularidades integer NOT NULL DEFAULT 0,
  erro text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT logistica_cargas_monitor_execucoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.logistica_classificadores_monitor (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  os_id text NOT NULL,
  numero_os text,
  classificador text,
  ultima_atualizacao timestamp with time zone,
  notificacao_enviada_em timestamp with time zone,
  resposta text,
  resposta_em timestamp with time zone,
  atraso_horas numeric,
  situacao text NOT NULL DEFAULT 'Aguardando'::text,
  escalonado boolean NOT NULL DEFAULT false,
  escalonado_para text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT logistica_classificadores_monitor_pkey PRIMARY KEY (id)
);

CREATE TABLE public.logistica_clientes_anexo_regras (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}'::text[],
  precisa_anexo boolean NOT NULL DEFAULT false,
  excecao_origem_igual_cliente boolean NOT NULL DEFAULT false,
  observacao text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT logistica_clientes_anexo_regras_pkey PRIMARY KEY (id),
  CONSTRAINT logistica_clientes_anexo_regras_cliente_key UNIQUE (cliente)
);

CREATE TABLE public.logistica_clientes_contrato_regras (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}'::text[],
  tipo text NOT NULL,
  regex_formato text,
  exemplo_formato text,
  rotulo_campo text,
  observacao text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT logistica_clientes_contrato_regras_tipo_check CHECK ((tipo = ANY (ARRAY['formato'::text, 'obrigatorio'::text, 'nao_obrigatorio'::text]))),
  CONSTRAINT logistica_clientes_contrato_regras_pkey PRIMARY KEY (id),
  CONSTRAINT logistica_clientes_contrato_regras_cliente_key UNIQUE (cliente)
);

CREATE TABLE public.logistica_clientes_nacionais_aliases (
  alias_normalizado text NOT NULL,
  canonical text NOT NULL,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT logistica_clientes_nacionais_aliases_pkey PRIMARY KEY (alias_normalizado)
);

CREATE TABLE public.logistica_conferencias (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  os_id text NOT NULL,
  numero_os text,
  arquivo_url text NOT NULL,
  arquivo_nome text,
  versao integer NOT NULL DEFAULT 1,
  usuario text NOT NULL,
  data_envio timestamp with time zone NOT NULL DEFAULT now(),
  data_conferencia timestamp with time zone,
  responsavel text,
  status text NOT NULL DEFAULT 'Enviado'::text,
  observacao text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  criado_por text,
  atualizado_por text,
  CONSTRAINT logistica_conferencias_pkey PRIMARY KEY (id)
);

CREATE TABLE public.logistica_exportacoes_historico (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  parametros jsonb,
  versao integer NOT NULL DEFAULT 1,
  arquivo_url text,
  destinatarios text[],
  enviado_email boolean NOT NULL DEFAULT false,
  enviado_em timestamp with time zone,
  gerado_por text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT logistica_exportacoes_historico_pkey PRIMARY KEY (id)
);

CREATE TABLE public.logistica_fob (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_referencia date NOT NULL,
  numero_os text,
  cliente text,
  supervisao text,
  tons_movimento numeric(12,2) NOT NULL DEFAULT 0,
  tons_producao numeric(12,2) NOT NULL DEFAULT 0,
  tons_nh numeric(12,2) NOT NULL DEFAULT 0,
  observacao text,
  status text NOT NULL DEFAULT 'PENDENTE'::text,
  observacao_gestor text,
  criado_por uuid,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  validado_por uuid,
  validado_em timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  funcionario text,
  cidade text,
  local_embarque text,
  status_comparacao text NOT NULL DEFAULT 'PENDENTE'::text,
  origem text NOT NULL DEFAULT 'PAINEL'::text,
  import_hash text,
  arquivo_movimentacao text,
  arquivo_producao text,
  arquivo_nhe text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  motivo text,
  visualizado boolean NOT NULL DEFAULT false,
  CONSTRAINT logistica_fob_status_check CHECK ((status = ANY (ARRAY['PENDENTE'::text, 'VALIDO'::text, 'INVALIDO'::text]))),
  CONSTRAINT logistica_fob_status_comparacao_check CHECK ((status_comparacao = ANY (ARRAY['PENDENTE'::text, 'OK'::text, 'DOIS EMBARQUES'::text]))),
  CONSTRAINT logistica_fob_pkey PRIMARY KEY (id),
  CONSTRAINT logistica_fob_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id),
  CONSTRAINT logistica_fob_validado_por_fkey FOREIGN KEY (validado_por) REFERENCES auth.users(id)
);

CREATE TABLE public.logistica_informativos_geracoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  periodo_inicio date,
  periodo_fim date,
  minimo_cargas integer,
  gerado_por text,
  origem text NOT NULL DEFAULT 'manual'::text,
  parametros jsonb,
  arquivo_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT logistica_informativos_geracoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.logistica_nhe_lancamentos_auto (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  chave_unica text NOT NULL,
  data_referencia date NOT NULL,
  numero_os text NOT NULL,
  cliente text,
  supervisao text,
  coordenacao text,
  funcionario text,
  colaborador_chave text,
  distancia_m numeric,
  raio_m numeric,
  motivo text,
  observacao text,
  status text NOT NULL DEFAULT 'PENDENTE'::text,
  erro text,
  tentativas integer NOT NULL DEFAULT 0,
  lancado_em timestamp with time zone,
  raw jsonb,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT logistica_nhe_lancamentos_auto_pkey PRIMARY KEY (id),
  CONSTRAINT logistica_nhe_lancamentos_auto_chave_unica_key UNIQUE (chave_unica)
);

CREATE TABLE public.logistica_nhe_lancamentos_execucoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_referencia date,
  status text NOT NULL DEFAULT 'INICIADO'::text,
  total_pendentes integer,
  total_candidatos integer,
  total_sucesso integer,
  total_erro integer,
  total_sem_login integer,
  total_fora_do_raio integer,
  total_sem_coordenada_os integer,
  erro text,
  raw jsonb,
  iniciado_em timestamp with time zone NOT NULL DEFAULT now(),
  finalizado_em timestamp with time zone,
  CONSTRAINT logistica_nhe_lancamentos_execucoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.logistica_ocr_jobs (
  id bigint NOT NULL,
  request_user_id uuid NOT NULL,
  os_id text,
  numero_os text,
  document_url text NOT NULL,
  file_type text NOT NULL,
  instruction text,
  status text NOT NULL DEFAULT 'PENDENTE'::text,
  priority integer NOT NULL DEFAULT 100,
  progress smallint NOT NULL DEFAULT 0,
  page_current integer,
  page_total integer,
  attempts integer NOT NULL DEFAULT 0,
  worker_id text,
  locked_at timestamp with time zone,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  result jsonb,
  raw_text text,
  raw_ocr jsonb,
  error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + '30 days'::interval),
  document_type text NOT NULL DEFAULT 'cargas'::text,
  CONSTRAINT logistica_ocr_jobs_file_type_check CHECK ((file_type = ANY (ARRAY['jpg'::text, 'jpeg'::text, 'png'::text, 'gif'::text, 'webp'::text, 'pdf'::text]))),
  CONSTRAINT logistica_ocr_jobs_status_check CHECK ((status = ANY (ARRAY['PENDENTE'::text, 'PROCESSANDO'::text, 'CONCLUIDO'::text, 'ERRO'::text, 'CANCELADO'::text]))),
  CONSTRAINT logistica_ocr_jobs_progress_check CHECK (((progress >= 0) AND (progress <= 100))),
  CONSTRAINT logistica_ocr_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT logistica_ocr_jobs_document_type_check CHECK ((document_type = ANY (ARRAY['cargas'::text, 'texto_livre'::text])))
);

CREATE TABLE public.logistica_ocr_workers (
  worker_id text NOT NULL,
  hostname text,
  version text,
  status text NOT NULL DEFAULT 'ONLINE'::text,
  current_job_id bigint,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT logistica_ocr_workers_status_check CHECK ((status = ANY (ARRAY['ONLINE'::text, 'PROCESSANDO'::text, 'ERRO'::text, 'PARADO'::text]))),
  CONSTRAINT logistica_ocr_workers_pkey PRIMARY KEY (worker_id)
);

CREATE TABLE public.logistica_pre_conferencia_os (
  id bigint NOT NULL,
  os_id text NOT NULL,
  numero_os text NOT NULL,
  laudo_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  cargas_sistema jsonb NOT NULL DEFAULT '[]'::jsonb,
  cargas_ocr jsonb NOT NULL DEFAULT '[]'::jsonb,
  resultado jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'PRE_CONFERIDA'::text,
  criado_por uuid,
  atualizado_por uuid,
  confirmado_por uuid,
  confirmado_em timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT logistica_pre_conferencia_os_status_check CHECK ((status = ANY (ARRAY['PRE_CONFERIDA'::text, 'CONFIRMADA'::text]))),
  CONSTRAINT logistica_pre_conferencia_os_pkey PRIMARY KEY (id),
  CONSTRAINT logistica_pre_conferencia_os_os_id_key UNIQUE (os_id)
);

CREATE TABLE public.logistica_relatorios_destinatarios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente text NOT NULL DEFAULT 'TODOS'::text,
  email text NOT NULL,
  nome text,
  tipo text NOT NULL DEFAULT 'TO'::text,
  ativo boolean NOT NULL DEFAULT true,
  origem text NOT NULL DEFAULT 'PAINEL'::text,
  atualizado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  grupo text,
  CONSTRAINT logistica_relatorios_destinatarios_tipo_check CHECK ((tipo = ANY (ARRAY['TO'::text, 'CC'::text]))),
  CONSTRAINT logistica_relatorios_destinatarios_cliente_email_uk UNIQUE (cliente, email),
  CONSTRAINT logistica_relatorios_destinatarios_pkey PRIMARY KEY (id)
);

CREATE TABLE public.logistica_relatorios_envios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente text NOT NULL,
  data_inicial date,
  data_final date,
  formato text NOT NULL DEFAULT 'CSV'::text,
  destinatarios text[] NOT NULL DEFAULT '{}'::text[],
  assunto text,
  mensagem text,
  status text NOT NULL DEFAULT 'PENDENTE'::text,
  erro text,
  total_linhas integer NOT NULL DEFAULT 0,
  total_cargas numeric NOT NULL DEFAULT 0,
  total_toneladas numeric NOT NULL DEFAULT 0,
  total_embarcado numeric NOT NULL DEFAULT 0,
  arquivo_nome text,
  enviado_por uuid,
  enviado_em timestamp with time zone,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  destinatarios_cc text[] NOT NULL DEFAULT '{}'::text[],
  CONSTRAINT logistica_relatorios_envios_pkey PRIMARY KEY (id)
);

CREATE TABLE public.logistica_solicitacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_solicitacao date NOT NULL,
  colaborador text,
  origem text,
  destino text,
  tipo_deslocamento text,
  status text NOT NULL DEFAULT 'aberto'::text,
  observacoes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT logistica_solicitacoes_pkey PRIMARY KEY (id),
  CONSTRAINT logistica_solicitacoes_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE public.mapa_embarque_alertas_atualizacao (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  os text NOT NULL,
  data_mapa date NOT NULL,
  informativo_em timestamp with time zone NOT NULL,
  colaborador_nome text NOT NULL,
  colaborador_cpf text,
  telefone text,
  status text NOT NULL DEFAULT 'pendente'::text,
  alertado_em timestamp with time zone,
  respondido_em timestamp with time zone,
  resposta text,
  silenciado_em timestamp with time zone,
  silenciado_data date,
  external_message_id text,
  ultimo_erro text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  cliente text,
  agendado_para timestamp with time zone,
  CONSTRAINT mapa_embarque_alertas_atualizacao_pkey PRIMARY KEY (id),
  CONSTRAINT mapa_embarque_alertas_atualizacao_os_informativo_em_key UNIQUE (os, informativo_em),
  CONSTRAINT mapa_embarque_alertas_atualizacao_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'agendado'::text, 'alertado'::text, 'respondido'::text, 'encerrado'::text, 'sem_contato'::text, 'erro'::text])))
);

CREATE TABLE public.metas_auditoria (
  id bigint NOT NULL,
  ano integer NOT NULL,
  mes integer NOT NULL,
  regional text NOT NULL,
  valor_auditoria numeric NOT NULL DEFAULT 0,
  total_embarcado numeric NOT NULL DEFAULT 0,
  percentual_limite numeric NOT NULL,
  apto boolean NOT NULL DEFAULT true,
  nome_arquivo text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT metas_auditoria_ano_check CHECK (((ano >= 2000) AND (ano <= 2100))),
  CONSTRAINT metas_auditoria_mes_check CHECK (((mes >= 1) AND (mes <= 12))),
  CONSTRAINT metas_auditoria_percentual_limite_check CHECK (((percentual_limite >= (0)::numeric) AND (percentual_limite <= (100)::numeric))),
  CONSTRAINT metas_auditoria_pkey PRIMARY KEY (id),
  CONSTRAINT metas_auditoria_ano_mes_regional_key UNIQUE (ano, mes, regional)
);

CREATE TABLE public.metas_custo_regional (
  id bigint NOT NULL DEFAULT nextval('metas_custo_regional_id_seq'::regclass),
  ano integer NOT NULL,
  mes integer NOT NULL,
  coordenacao text NOT NULL,
  despesa numeric(14,2),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT metas_custo_regional_ano_mes_coordenacao_key UNIQUE (ano, mes, coordenacao),
  CONSTRAINT metas_custo_regional_pkey PRIMARY KEY (id)
);

CREATE TABLE public.metas_gestores (
  id bigint NOT NULL DEFAULT nextval('metas_gestores_id_seq'::regclass),
  coordenacao text NOT NULL,
  gestor text NOT NULL,
  supervisao text,
  salario numeric(14,2),
  grat40 numeric(14,2),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT metas_gestores_pkey PRIMARY KEY (id)
);

CREATE TABLE public.metas_producao (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ano integer NOT NULL,
  mes integer NOT NULL,
  estado text NOT NULL,
  regional text NOT NULL,
  meta_tons numeric(14,2) NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  fechado boolean NOT NULL DEFAULT false,
  fechado_em timestamp with time zone,
  status_fechamento text,
  produzido_fechamento numeric DEFAULT 0,
  percentual_fechamento numeric DEFAULT 0,
  gestor text,
  salario numeric(14,2),
  bonus_percentual_minimo numeric(8,4),
  bonus_producao numeric(14,2),
  qualifica_bonus boolean DEFAULT false,
  bonus_custo numeric(14,2),
  bonus_leitura numeric(14,2),
  bonus_total numeric(14,2),
  CONSTRAINT metas_producao_mes_check CHECK (((mes >= 1) AND (mes <= 12))),
  CONSTRAINT metas_producao_status_fechamento_check CHECK (((status_fechamento IS NULL) OR (status_fechamento = ANY (ARRAY['ATINGIU'::text, 'NAO_ATINGIU'::text])))),
  CONSTRAINT metas_producao_ano_mes_regional_key UNIQUE (ano, mes, regional),
  CONSTRAINT metas_producao_pkey PRIMARY KEY (id)
);

CREATE TABLE public.modules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  area text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT modules_code_key UNIQUE (code),
  CONSTRAINT modules_pkey PRIMARY KEY (id)
);

CREATE TABLE public.nf_categorizacao_correcoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nf_id text NOT NULL,
  categoria_sugerida text,
  categoria_corrigida text NOT NULL,
  origem_sugestao text,
  corrigido_por text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT nf_categorizacao_correcoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.nf_ocr_fila (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nf_id text,
  arquivo_original_url text,
  arquivo_processado_url text,
  versao_ocr text,
  campos_extraidos jsonb,
  confianca numeric,
  erro text,
  status text NOT NULL DEFAULT 'Aguardando'::text,
  responsavel_revisao text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT nf_ocr_fila_pkey PRIMARY KEY (id)
);

CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  setor_destino text,
  modulo_destino text NOT NULL,
  titulo text NOT NULL,
  mensagem text,
  referencia_tipo text,
  referencia_id uuid,
  status text NOT NULL DEFAULT 'nao_lida'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  read_at timestamp with time zone,
  CONSTRAINT notifications_pkey PRIMARY KEY (id)
);

CREATE TABLE public.operacional_auditoria_colaborador (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  colaborador_id uuid,
  nome_colaborador text NOT NULL,
  data_evento date,
  tipo_evento text,
  severidade text DEFAULT 'baixa'::text,
  score_impacto numeric(8,2) DEFAULT 0,
  descricao text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  import_hash text NOT NULL,
  nome_chave text,
  tipo_funcionario text,
  data_classificacao date,
  referencia text,
  uf_destino character(2),
  cidade_destino text,
  destino text,
  placa text,
  os text,
  contrato text,
  nf text,
  produto text,
  servico text,
  peso_kg numeric(14,3),
  cliente_nacional text,
  cliente_regional text,
  cliente_final text,
  estado_embarque character(2),
  cidade_embarque text,
  local_embarque text,
  coordenacao text,
  supervisao text,
  auditor text,
  motivo_recusa text,
  resultado_origem text,
  resultado_recusa text,
  resultado_auditoria text,
  resultado text,
  diferenca numeric(12,4),
  desconto_kg numeric(14,3) DEFAULT 0,
  origem text DEFAULT 'upload_xlsx'::text,
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT operacional_auditoria_colaborador_severidade_check CHECK ((severidade = ANY (ARRAY['baixa'::text, 'media'::text, 'alta'::text, 'critica'::text]))),
  CONSTRAINT operacional_auditoria_colaborador_pkey PRIMARY KEY (id)
);

CREATE TABLE public.operacional_colaborador_base (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  colaborador_id uuid,
  nome text NOT NULL,
  cpf text,
  tipo_mao_obra text DEFAULT 'efetivo'::text,
  empresa text,
  coordenacao text,
  supervisao text,
  cidade_base text,
  uf_base character(2),
  endereco_base text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  valor_diaria numeric(12,2) DEFAULT 0,
  valor_alimentacao numeric(12,2) DEFAULT 30,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  nome_chave text,
  telefone text,
  email text,
  rua text,
  bairro text,
  pais text DEFAULT 'Brasil'::text,
  origem text NOT NULL DEFAULT 'upload_xlsx'::text,
  bfleet_lugar_id text,
  bfleet_lugar_nome text,
  bfleet_lugar_hash text,
  bfleet_lugar_sync_status text,
  bfleet_lugar_sync_error text,
  bfleet_lugar_sync_em timestamp with time zone,
  bfleet_lugar_payload jsonb,
  CONSTRAINT operacional_colaborador_base_tipo_mao_obra_check CHECK (((tipo_mao_obra IS NULL) OR (tipo_mao_obra = ANY (ARRAY['efetivo'::text, 'diarista'::text])))),
  CONSTRAINT operacional_colaborador_base_colaborador_id_key UNIQUE (colaborador_id),
  CONSTRAINT operacional_colaborador_base_pkey PRIMARY KEY (id)
);

CREATE TABLE public.operacional_colaboradores_base (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  colaborador_id uuid,
  nome text NOT NULL,
  tipo text NOT NULL,
  regional text,
  cidade text,
  uf character(2),
  endereco text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  valor_diaria numeric(12,2) DEFAULT 0,
  ativo boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT operacional_colaboradores_base_tipo_check CHECK ((tipo = ANY (ARRAY['Efetivo'::text, 'Diarista'::text]))),
  CONSTRAINT operacional_colaboradores_base_pkey PRIMARY KEY (id)
);

CREATE TABLE public.operacional_embarques (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_embarque date NOT NULL,
  cliente text,
  cidade text NOT NULL,
  uf character(2) NOT NULL,
  local_embarque text,
  volume_ton numeric(12,3) DEFAULT 0,
  qtd_colaboradores integer DEFAULT 1,
  latitude numeric(10,7),
  longitude numeric(10,7),
  status text NOT NULL DEFAULT 'aberto'::text,
  observacoes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT operacional_embarques_status_check CHECK ((status = ANY (ARRAY['aberto'::text, 'simulado'::text, 'direcionado'::text, 'cancelado'::text, 'concluido'::text]))),
  CONSTRAINT operacional_embarques_pkey PRIMARY KEY (id)
);

CREATE TABLE public.operacional_hoteis (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cidade text NOT NULL,
  uf character(2) NOT NULL,
  endereco text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  diaria_individual numeric(12,2),
  diaria_duplo numeric(12,2),
  diaria_triplo numeric(12,2),
  diaria_quadruplo numeric(12,2),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT operacional_hoteis_pkey PRIMARY KEY (id)
);

CREATE TABLE public.operacional_laudos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  os_id uuid NOT NULL,
  numero_os text,
  cliente text,
  supervisao text,
  coordenacao text,
  colaborador_key text,
  colaborador_nome text,
  arquivos_urls text[] NOT NULL DEFAULT '{}'::text[],
  origem text NOT NULL DEFAULT 'desconhecida'::text,
  geo_capturada boolean NOT NULL DEFAULT false,
  geo_latitude numeric,
  geo_longitude numeric,
  geo_precisao_m numeric,
  colaborador_latitude numeric,
  colaborador_longitude numeric,
  os_latitude numeric,
  os_longitude numeric,
  distancia_casa_km numeric,
  distancia_os_km numeric,
  avaliado boolean NOT NULL DEFAULT false,
  suspeito boolean NOT NULL DEFAULT false,
  enviado_por uuid,
  enviado_por_nome text,
  enviado_em timestamp with time zone NOT NULL DEFAULT now(),
  revisado_em timestamp with time zone,
  revisado_por uuid,
  revisado_por_nome text,
  observacao_revisao text,
  CONSTRAINT operacional_laudos_pkey PRIMARY KEY (id),
  CONSTRAINT operacional_laudos_os_id_fkey FOREIGN KEY (os_id) REFERENCES operacional_os(id) ON DELETE CASCADE
);

CREATE TABLE public.operacional_mapa_rotas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  programacao_id uuid,
  supervisao text NOT NULL,
  data_referencia date NOT NULL,
  tipo text NOT NULL,
  veiculo_id uuid,
  placa text,
  motorista_nome text,
  colaborador_nome text,
  colaborador_cpf text,
  origem_latitude numeric,
  origem_longitude numeric,
  origem_tipo text,
  km_total_estimado numeric NOT NULL DEFAULT 0,
  duracao_estimada_min numeric NOT NULL DEFAULT 0,
  geometria jsonb,
  gerado_em timestamp with time zone NOT NULL DEFAULT now(),
  gerado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT operacional_mapa_rotas_origem_tipo_check CHECK (((origem_tipo = ANY (ARRAY['casa'::text, 'hotel'::text, 'alojamento'::text])) OR (origem_tipo IS NULL))),
  CONSTRAINT operacional_mapa_rotas_pkey PRIMARY KEY (id),
  CONSTRAINT operacional_mapa_rotas_tipo_check CHECK ((tipo = ANY (ARRAY['frota'::text, 'reembolso_km'::text, 'local'::text])))
);

CREATE TABLE public.operacional_mapa_rotas_paradas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rota_id uuid NOT NULL,
  ordem integer NOT NULL,
  tipo text NOT NULL,
  os_id uuid,
  colaborador_nome text,
  ponto_nome text,
  embarque_texto text,
  latitude numeric,
  longitude numeric,
  distancia_km_trecho numeric,
  duracao_min_trecho numeric,
  CONSTRAINT operacional_mapa_rotas_paradas_tipo_check CHECK ((tipo = ANY (ARRAY['colaborador'::text, 'embarque'::text]))),
  CONSTRAINT operacional_mapa_rotas_paradas_pkey PRIMARY KEY (id),
  CONSTRAINT operacional_mapa_rotas_paradas_rota_id_fkey FOREIGN KEY (rota_id) REFERENCES operacional_mapa_rotas(id) ON DELETE CASCADE
);

CREATE TABLE public.operacional_os (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  numero_os text NOT NULL,
  situacao text,
  financeiro text,
  data_os date,
  servico text,
  cliente text,
  embarque text,
  destino text,
  supervisao text,
  contrato text,
  produto text,
  lote numeric NOT NULL DEFAULT 0,
  embarcado numeric NOT NULL DEFAULT 0,
  remanescente numeric NOT NULL DEFAULT 0,
  ponto1_latitude numeric,
  ponto1_longitude numeric,
  destino_latitude numeric,
  destino_longitude numeric,
  status_gestor text DEFAULT 'AGUARDAR'::text,
  status_conferencia text NOT NULL DEFAULT 'PENDENTE'::text,
  permitir_mais_classificadores boolean NOT NULL DEFAULT false,
  configurada_em timestamp with time zone,
  observacao_gestor text,
  observacao_conferencia text,
  conferido_por uuid,
  conferido_em timestamp with time zone,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  arquivo_origem text,
  status_logistica text,
  enviado_logistica_em timestamp with time zone,
  logistica_solicitado_por uuid,
  logistica_responsavel_id uuid,
  logistica_assumido_em timestamp with time zone,
  observacao_logistica text,
  finalizado_por uuid,
  finalizado_em timestamp with time zone,
  logistica_devolvido_em timestamp with time zone,
  ultima_atualizacao timestamp with time zone,
  ponto1_nome text,
  ponto_embarque_id uuid,
  ultima_sync_os_em timestamp with time zone,
  ultima_sync_batch_id uuid,
  atualizar_resolvido_tipo text,
  atualizar_resolvido_em timestamp with time zone,
  atualizar_resolvido_por uuid,
  CONSTRAINT operacional_os_status_gestor_check CHECK ((status_gestor = ANY (ARRAY['AGUARDAR'::text, 'ATENDER'::text, 'FINALIZAR'::text, 'AJUSTAR'::text]))),
  CONSTRAINT operacional_os_numero_os_key UNIQUE (numero_os),
  CONSTRAINT operacional_os_pkey PRIMARY KEY (id),
  CONSTRAINT operacional_os_ponto_embarque_id_fkey FOREIGN KEY (ponto_embarque_id) REFERENCES operacional_pontos_embarque(id) ON DELETE SET NULL,
  CONSTRAINT operacional_os_status_conferencia_check CHECK ((status_conferencia = ANY (ARRAY['PENDENTE'::text, 'DISTRIBUIDA'::text, 'AJUSTAR'::text, 'CONCLUIDA'::text, 'AJUSTADA'::text])))
);

CREATE TABLE public.operacional_os_colaboradores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  os_id uuid NOT NULL,
  colaborador_key text NOT NULL,
  colaborador_nome text NOT NULL,
  colaborador_cpf text,
  distancia_km numeric,
  origem_sugestao text,
  indicado_por uuid,
  observacao text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT operacional_os_colaboradores_os_id_colaborador_key_key UNIQUE (os_id, colaborador_key),
  CONSTRAINT operacional_os_colaboradores_pkey PRIMARY KEY (id),
  CONSTRAINT operacional_os_colaboradores_os_id_fkey FOREIGN KEY (os_id) REFERENCES operacional_os(id) ON DELETE CASCADE
);

CREATE TABLE public.operacional_os_distribuicao (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  os_id text NOT NULL,
  numero_os text,
  responsavel_atual text NOT NULL,
  distribuido_por text NOT NULL,
  motivo text,
  redistribuicao boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT operacional_os_distribuicao_pkey PRIMARY KEY (id)
);

CREATE TABLE public.operacional_passagens_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  origem_cidade text NOT NULL,
  origem_uf character(2) NOT NULL,
  destino_cidade text NOT NULL,
  destino_uf character(2) NOT NULL,
  valor_estimado numeric(12,2) NOT NULL DEFAULT 0,
  empresa text,
  fonte text,
  data_cotacao date NOT NULL DEFAULT CURRENT_DATE,
  validade_ate date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT operacional_passagens_cache_origem_cidade_origem_uf_destino_key UNIQUE (origem_cidade, origem_uf, destino_cidade, destino_uf, data_cotacao),
  CONSTRAINT operacional_passagens_cache_pkey PRIMARY KEY (id)
);

CREATE TABLE public.operacional_pontos_embarque (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tipo_local text,
  nome_local text NOT NULL,
  uf text NOT NULL,
  cidade text NOT NULL,
  latitude numeric(10,7),
  longitude numeric(10,7),
  supervisao text,
  coordenacao text,
  origem text NOT NULL DEFAULT 'upload_xlsx'::text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  embarque_label text DEFAULT (((((COALESCE(uf, ''::text) || ' - '::text) || COALESCE(cidade, ''::text)) || ' ('::text) || COALESCE(nome_local, ''::text)) || ')'::text),
  CONSTRAINT operacional_pontos_embarque_pkey PRIMARY KEY (id),
  CONSTRAINT operacional_pontos_embarque_unico UNIQUE (nome_local, cidade, uf)
);

CREATE TABLE public.operacional_simulacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  embarque_id uuid,
  colaborador_base_id uuid,
  hotel_id uuid,
  distancia_km numeric(12,2),
  hotel_distancia_km numeric(12,2),
  valor_passagem numeric(12,2) DEFAULT 0,
  valor_hotel numeric(12,2) DEFAULT 0,
  valor_mao_obra numeric(12,2) DEFAULT 0,
  valor_alimentacao numeric(12,2) DEFAULT 0,
  custo_total numeric(12,2) DEFAULT 0,
  score_auditoria numeric(12,2) DEFAULT 100,
  score_final numeric(12,2) DEFAULT 0,
  classificacao text,
  detalhes jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT operacional_simulacoes_pkey PRIMARY KEY (id),
  CONSTRAINT operacional_simulacoes_colaborador_base_id_fkey FOREIGN KEY (colaborador_base_id) REFERENCES operacional_colaborador_base(id) ON DELETE SET NULL,
  CONSTRAINT operacional_simulacoes_embarque_id_fkey FOREIGN KEY (embarque_id) REFERENCES operacional_embarques(id) ON DELETE CASCADE,
  CONSTRAINT operacional_simulacoes_hotel_id_fkey FOREIGN KEY (hotel_id) REFERENCES operacional_hoteis(id) ON DELETE SET NULL
);

CREATE TABLE public.ouro_safra_classificacao_execucoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  agendamento_id text,
  placa text,
  os_grm text,
  umidade numeric,
  impureza numeric,
  avariados numeric,
  status text NOT NULL,
  erro text,
  duracao_ms integer,
  iniciado_em timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ouro_safra_classificacao_execucoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.painel_notificacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  titulo text NOT NULL,
  descricao text,
  prioridade text NOT NULL DEFAULT 'normal'::text,
  icone text NOT NULL DEFAULT 'bell'::text,
  modulo_url text,
  destinatario_perfil text,
  destinatario_modulo text,
  destinatario_usuario_id uuid,
  supervisao text,
  referencia_tabela text,
  referencia_id text,
  chave_dedup text,
  gerado_por_usuario_id uuid,
  arquivada boolean NOT NULL DEFAULT false,
  arquivada_em timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  meta jsonb,
  CONSTRAINT painel_notificacoes_chave_dedup_key UNIQUE (chave_dedup),
  CONSTRAINT painel_notificacoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.painel_notificacoes_usuarios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  notificacao_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  usuario_nome text,
  lida_em timestamp with time zone,
  executada_em timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT painel_notificacoes_usuarios_notificacao_id_usuario_id_key UNIQUE (notificacao_id, usuario_id),
  CONSTRAINT painel_notificacoes_usuarios_pkey PRIMARY KEY (id),
  CONSTRAINT painel_notificacoes_usuarios_notificacao_id_fkey FOREIGN KEY (notificacao_id) REFERENCES painel_notificacoes(id) ON DELETE CASCADE
);

CREATE TABLE public.patrimonio_solicitacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_solicitacao date NOT NULL,
  colaborador text,
  item text,
  acao text,
  patrimonio_tag text,
  status text NOT NULL DEFAULT 'aberto'::text,
  observacoes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT patrimonio_solicitacoes_pkey PRIMARY KEY (id),
  CONSTRAINT patrimonio_solicitacoes_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE public.patrimonios_historico (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  importacao_id uuid NOT NULL,
  patrimonio_codigo text NOT NULL,
  coordenacao text,
  supervisao text,
  funcionario text,
  identificacao text,
  categoria text,
  marca text,
  modelo text,
  data_aquisicao timestamp with time zone,
  data_registro timestamp with time zone,
  situacao text,
  ultima_leitura timestamp with time zone,
  dias_sem_leitura integer,
  hash_linha text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT patrimonios_historico_pkey PRIMARY KEY (id),
  CONSTRAINT patrimonios_historico_importacao_id_fkey FOREIGN KEY (importacao_id) REFERENCES patrimonios_importacoes(id) ON DELETE CASCADE
);

CREATE TABLE public.patrimonios_historico_leituras (
  id bigint NOT NULL DEFAULT nextval('patrimonios_historico_leituras_id_seq'::regclass),
  importacao_id uuid,
  data_upload timestamp with time zone NOT NULL DEFAULT now(),
  importado_em timestamp with time zone NOT NULL DEFAULT now(),
  patrimonio_codigo text NOT NULL,
  coordenacao text,
  supervisao text,
  funcionario text,
  identificacao text,
  categoria text,
  marca text,
  modelo text,
  data_aquisicao timestamp without time zone,
  data_registro timestamp without time zone,
  situacao text,
  ultima_leitura timestamp without time zone,
  dias_sem_leitura integer,
  hash_linha text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT patrimonios_historico_leitura_importacao_id_patrimonio_codi_key UNIQUE (importacao_id, patrimonio_codigo),
  CONSTRAINT patrimonios_historico_leituras_pkey PRIMARY KEY (id),
  CONSTRAINT patrimonios_historico_leituras_importacao_id_fkey FOREIGN KEY (importacao_id) REFERENCES patrimonios_importacoes(id) ON DELETE SET NULL
);

CREATE TABLE public.patrimonios_importacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome_arquivo text NOT NULL,
  origem text DEFAULT 'upload_manual'::text,
  total_linhas integer NOT NULL DEFAULT 0,
  total_importadas integer NOT NULL DEFAULT 0,
  total_erros integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'processando'::text,
  observacoes text,
  criado_por uuid,
  criado_por_nome text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  data_upload timestamp with time zone DEFAULT now(),
  CONSTRAINT patrimonios_importacoes_status_check CHECK ((status = ANY (ARRAY['processando'::text, 'concluido'::text, 'concluido_parcial'::text, 'erro'::text]))),
  CONSTRAINT patrimonios_importacoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.patrimonios_movimentacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  patrimonio_id text NOT NULL,
  identificacao text,
  categoria text,
  tipo text NOT NULL,
  responsavel_novo text,
  responsavel_anterior text,
  regional text,
  supervisao text,
  termo_id uuid,
  observacao text,
  usuario text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT patrimonios_movimentacoes_pkey PRIMARY KEY (id),
  CONSTRAINT patrimonios_movimentacoes_termo_id_fkey FOREIGN KEY (termo_id) REFERENCES termos_documentos(id)
);

CREATE TABLE public.patrimonios_snapshot (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  importacao_id uuid NOT NULL,
  patrimonio_codigo text NOT NULL,
  coordenacao text,
  supervisao text,
  funcionario text,
  identificacao text,
  categoria text,
  marca text,
  modelo text,
  data_aquisicao timestamp with time zone,
  data_registro timestamp with time zone,
  situacao text,
  ultima_leitura timestamp with time zone,
  dias_sem_leitura integer,
  hash_linha text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  data_upload timestamp with time zone,
  importado_em timestamp with time zone,
  CONSTRAINT patrimonios_snapshot_pkey PRIMARY KEY (id),
  CONSTRAINT patrimonios_snapshot_importacao_id_fkey FOREIGN KEY (importacao_id) REFERENCES patrimonios_importacoes(id) ON DELETE CASCADE
);

CREATE TABLE public.producao_importacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_referencia date NOT NULL,
  arquivo_nome text,
  origem text,
  status text DEFAULT 'processando'::text,
  total_linhas integer DEFAULT 0,
  importado_por uuid,
  observacoes text,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT producao_importacoes_pkey PRIMARY KEY (id),
  CONSTRAINT producao_importacoes_importado_por_fkey FOREIGN KEY (importado_por) REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE public.producao_snapshot (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  importacao_id uuid,
  data_referencia date NOT NULL,
  coordenacao text,
  supervisao text,
  funcionario text,
  tipo text,
  data date,
  os text,
  cliente text,
  servico text,
  cidade text,
  local_embarque text,
  checkin text,
  checkout text,
  cargas numeric,
  tons numeric,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT producao_snapshot_pkey PRIMARY KEY (id),
  CONSTRAINT producao_snapshot_importacao_id_fkey FOREIGN KEY (importacao_id) REFERENCES producao_importacoes(id) ON DELETE CASCADE
);

CREATE TABLE public.producao_snapshot_staging (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  importacao_id uuid,
  data_referencia date NOT NULL,
  coordenacao text,
  supervisao text,
  funcionario text,
  tipo text,
  data date,
  os text,
  cliente text,
  servico text,
  cidade text,
  local_embarque text,
  checkin text,
  checkout text,
  cargas numeric,
  tons numeric,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  full_name text NOT NULL,
  email text,
  username text,
  department_id uuid,
  role text NOT NULL DEFAULT 'user'::text,
  is_master boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  can_manage_users boolean NOT NULL DEFAULT false,
  can_manage_modules boolean NOT NULL DEFAULT false,
  can_view_all_departments boolean NOT NULL DEFAULT false,
  can_manage_settings boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_username_key UNIQUE (username),
  CONSTRAINT profiles_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE public.programacao (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data date NOT NULL,
  descricao text,
  cliente text,
  local text,
  responsavel text,
  status text DEFAULT 'pendente'::text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT programacao_pkey PRIMARY KEY (id),
  CONSTRAINT programacao_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id)
);

CREATE TABLE public.programacao_alimentacao (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  programacao_id uuid,
  data_referencia date,
  colaborador_id text NOT NULL,
  nome_colaborador text,
  cafe boolean NOT NULL DEFAULT false,
  almoco boolean NOT NULL DEFAULT true,
  janta boolean NOT NULL DEFAULT false,
  observacao text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT programacao_alimentacao_pkey PRIMARY KEY (id),
  CONSTRAINT programacao_alimentacao_programacao_id_colaborador_id_key UNIQUE (programacao_id, colaborador_id),
  CONSTRAINT programacao_alimentacao_programacao_id_fkey FOREIGN KEY (programacao_id) REFERENCES programacao_dia(id) ON DELETE CASCADE
);

CREATE TABLE public.programacao_colaborador (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_referencia date NOT NULL DEFAULT CURRENT_DATE,
  colaborador_id text NOT NULL,
  nome text NOT NULL,
  status text NOT NULL,
  cafe boolean NOT NULL DEFAULT false,
  almoco boolean NOT NULL DEFAULT false,
  janta boolean NOT NULL DEFAULT false,
  transporte text,
  estadia text,
  cidade_uf text,
  alojamento_id uuid,
  checkin date,
  checkout date,
  chegada time without time zone,
  recarga numeric(12,2),
  lavagem numeric(12,2),
  manutencao_solicitada boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chk_programacao_alojamento_obrigatorio CHECK (((estadia <> 'ALOJAMENTO'::text) OR (alojamento_id IS NOT NULL))),
  CONSTRAINT chk_programacao_checkout_maior CHECK (((checkin IS NULL) OR (checkout IS NULL) OR (checkout >= checkin))),
  CONSTRAINT chk_programacao_estadia CHECK (((estadia IS NULL) OR (estadia = ANY (ARRAY['CASA'::text, 'PERNOITE'::text, 'ALOJAMENTO'::text, 'HOTEL'::text])))),
  CONSTRAINT chk_programacao_hotel_obrigatorios CHECK (((estadia <> 'HOTEL'::text) OR ((cidade_uf IS NOT NULL) AND (btrim(cidade_uf) <> ''::text) AND (checkin IS NOT NULL) AND (checkout IS NOT NULL) AND (chegada IS NOT NULL)))),
  CONSTRAINT chk_programacao_status CHECK ((status = ANY (ARRAY['DISPONÍVEL'::text, 'ATESTADO'::text, 'FÉRIAS'::text, 'FOLGA'::text, 'FALTA'::text, 'TRANSFERIR'::text, 'INATIVO'::text]))),
  CONSTRAINT chk_programacao_transporte CHECK (((transporte IS NULL) OR (transporte = ANY (ARRAY['MOTORISTA FROTA'::text, 'CARONA FROTA'::text, 'UBER/TÁXI'::text, 'REEMBOLSO KM'::text])))),
  CONSTRAINT programacao_colaborador_pkey PRIMARY KEY (id),
  CONSTRAINT uq_programacao_colaborador UNIQUE (data_referencia, colaborador_id),
  CONSTRAINT programacao_colaborador_alojamento_id_fkey FOREIGN KEY (alojamento_id) REFERENCES alojamentos(id)
);

CREATE TABLE public.programacao_colaboradores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  programacao_id uuid,
  data_referencia date,
  colaborador_id text NOT NULL,
  nome_colaborador text,
  cargo text,
  coordenacao text,
  supervisao text,
  disponibilidade text NOT NULL DEFAULT 'OK'::text,
  observacao text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  placa_veiculo text,
  CONSTRAINT programacao_colaboradores_pkey PRIMARY KEY (id),
  CONSTRAINT programacao_colaboradores_programacao_id_colaborador_id_key UNIQUE (programacao_id, colaborador_id),
  CONSTRAINT programacao_colaboradores_programacao_id_fkey FOREIGN KEY (programacao_id) REFERENCES programacao_dia(id) ON DELETE CASCADE
);

CREATE TABLE public.programacao_conferencia_status (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  programacao_id uuid NOT NULL,
  colaborador_id text NOT NULL,
  nome_colaborador text,
  data_referencia date,
  coordenacao text,
  supervisao text,
  status_conferencia text NOT NULL DEFAULT 'PENDENTE'::text,
  observacao_conferencia text,
  conferido_em timestamp with time zone,
  conferido_por uuid,
  conferido_por_nome text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT programacao_conferencia_status_status_check CHECK ((status_conferencia = ANY (ARRAY['PENDENTE'::text, 'EM_ANALISE'::text, 'CONFERIDO'::text, 'PENDENCIA'::text, 'CANCELADO'::text]))),
  CONSTRAINT programacao_conferencia_status_pkey PRIMARY KEY (id),
  CONSTRAINT programacao_conferencia_status_unq UNIQUE (programacao_id, colaborador_id),
  CONSTRAINT programacao_conferencia_status_programacao_id_fkey FOREIGN KEY (programacao_id) REFERENCES programacao_dia(id) ON DELETE CASCADE
);

CREATE TABLE public.programacao_contextos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_referencia date NOT NULL,
  supervisao text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT programacao_contextos_data_referencia_supervisao_key UNIQUE (data_referencia, supervisao),
  CONSTRAINT programacao_contextos_pkey PRIMARY KEY (id),
  CONSTRAINT programacao_contextos_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE public.programacao_deslocamento (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  programacao_id uuid,
  data_referencia date,
  colaborador_id text NOT NULL,
  nome_colaborador text,
  tipo_deslocamento text NOT NULL DEFAULT 'NÃO PRECISA'::text,
  origem text,
  destino text,
  km numeric(12,2) NOT NULL DEFAULT 0,
  valor numeric(12,2) NOT NULL DEFAULT 0,
  observacao text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  placa_veiculo text,
  CONSTRAINT programacao_deslocamento_pkey PRIMARY KEY (id),
  CONSTRAINT programacao_deslocamento_programacao_id_colaborador_id_key UNIQUE (programacao_id, colaborador_id),
  CONSTRAINT programacao_deslocamento_programacao_id_fkey FOREIGN KEY (programacao_id) REFERENCES programacao_dia(id) ON DELETE CASCADE
);

CREATE TABLE public.programacao_despesas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_referencia date NOT NULL,
  coordenacao text,
  supervisao text,
  colaborador text NOT NULL,
  disponibilidade_status text,
  disponibilidade_obs text,
  estadia_tipo text,
  estadia_obs text,
  hotel_dias integer DEFAULT 0,
  hotel_chegada text,
  cafe_valor boolean DEFAULT false,
  almoco_valor boolean DEFAULT false,
  janta_valor boolean DEFAULT false,
  deslocamento_tipo text,
  deslocamento_obs text,
  extras_recarga_valor numeric(12,2) DEFAULT 0,
  extras_passagem_valor numeric(12,2) DEFAULT 0,
  extras_lavagem_valor numeric(12,2) DEFAULT 0,
  manut_veic text,
  extras_obs text,
  origem text DEFAULT 'painel'::text,
  queue_id text,
  solicitante text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  status_conferencia text NOT NULL DEFAULT 'PENDENTE'::text,
  observacao_conferencia text,
  conferido_em timestamp with time zone,
  conferido_por uuid,
  conferido_por_nome text,
  CONSTRAINT programacao_despesas_status_conferencia_check CHECK ((status_conferencia = ANY (ARRAY['PENDENTE'::text, 'EM_ANALISE'::text, 'CONFERIDO'::text, 'PENDENCIA'::text, 'CANCELADO'::text]))),
  CONSTRAINT programacao_despesas_pkey PRIMARY KEY (id)
);

CREATE TABLE public.programacao_despesas_dedup_archive (
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  payload jsonb NOT NULL,
  reason text NOT NULL DEFAULT 'DUPLICADO_COLABORADOR_DIA'::text,
  archived_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT programacao_despesas_dedup_archive_pkey PRIMARY KEY (source_table, source_id)
);

CREATE TABLE public.programacao_despesas_hist (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  programacao_despesa_id uuid,
  acao text,
  chave text,
  queue_id text,
  solicitante text,
  antes jsonb,
  depois jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT programacao_despesas_hist_pkey PRIMARY KEY (id)
);

CREATE TABLE public.programacao_dia (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_referencia date NOT NULL,
  coordenacao text,
  supervisao text,
  regional text,
  status text NOT NULL DEFAULT 'rascunho'::text,
  criado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT programacao_dia_pkey PRIMARY KEY (id)
);

CREATE TABLE public.programacao_distribuicao_agendada (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  supervisao text NOT NULL,
  data_referencia date NOT NULL,
  programacao_id uuid,
  processado boolean NOT NULL DEFAULT false,
  processado_em timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT programacao_distribuicao_agendada_pkey PRIMARY KEY (id),
  CONSTRAINT programacao_distribuicao_agendad_supervisao_data_referencia_key UNIQUE (supervisao, data_referencia),
  CONSTRAINT programacao_distribuicao_agendada_programacao_id_fkey FOREIGN KEY (programacao_id) REFERENCES programacao_dia(id) ON DELETE CASCADE
);

CREATE TABLE public.programacao_encaminhamentos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  programacao_id uuid NOT NULL,
  programacao_item_id uuid NOT NULL,
  setor_destino text NOT NULL,
  modulo_destino text NOT NULL,
  motivo text,
  status text NOT NULL DEFAULT 'pendente'::text,
  solicitado_em timestamp with time zone NOT NULL DEFAULT now(),
  processado_em timestamp with time zone,
  observacoes text,
  CONSTRAINT programacao_encaminhamentos_pkey PRIMARY KEY (id),
  CONSTRAINT programacao_encaminhamentos_programacao_id_fkey FOREIGN KEY (programacao_id) REFERENCES programacoes(id) ON DELETE CASCADE
);

CREATE TABLE public.programacao_equipe (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  programacao_id uuid NOT NULL,
  os_id uuid NOT NULL,
  colaborador_id text NOT NULL,
  nome_colaborador text,
  score numeric,
  score_contrato numeric,
  score_distancia numeric,
  score_auditoria numeric,
  km_estimado numeric,
  confirmado boolean NOT NULL DEFAULT false,
  ordem_rota integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  duracao_min numeric,
  rota_geometria jsonb,
  rota_calculada_em timestamp with time zone,
  CONSTRAINT programacao_equipe_pkey PRIMARY KEY (id),
  CONSTRAINT programacao_equipe_programacao_id_os_id_colaborador_id_key UNIQUE (programacao_id, os_id, colaborador_id),
  CONSTRAINT programacao_equipe_os_id_fkey FOREIGN KEY (os_id) REFERENCES operacional_os(id) ON DELETE CASCADE,
  CONSTRAINT programacao_equipe_programacao_id_fkey FOREIGN KEY (programacao_id) REFERENCES programacao_dia(id) ON DELETE CASCADE
);

CREATE TABLE public.programacao_estadia (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  programacao_id uuid,
  data_referencia date,
  colaborador_id text NOT NULL,
  nome_colaborador text,
  tem_estadia boolean NOT NULL DEFAULT false,
  tipo_estadia text NOT NULL DEFAULT 'NÃO PRECISA'::text,
  cidade text,
  uf text,
  diarias numeric(10,2) NOT NULL DEFAULT 0,
  checkin date,
  checkout date,
  observacao text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  alojamento_id uuid,
  alojamento_nome text,
  CONSTRAINT programacao_estadia_pkey PRIMARY KEY (id),
  CONSTRAINT programacao_estadia_programacao_id_colaborador_id_key UNIQUE (programacao_id, colaborador_id),
  CONSTRAINT programacao_estadia_alojamento_id_fkey FOREIGN KEY (alojamento_id) REFERENCES hospedagem_alojamentos(id) ON DELETE SET NULL,
  CONSTRAINT programacao_estadia_programacao_id_fkey FOREIGN KEY (programacao_id) REFERENCES programacao_dia(id) ON DELETE CASCADE
);

CREATE TABLE public.programacao_extras (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  programacao_id uuid,
  data_referencia date,
  colaborador_id text NOT NULL,
  nome_colaborador text,
  tipo_despesa text NOT NULL DEFAULT 'OUTRO'::text,
  descricao text,
  valor numeric(12,2) NOT NULL DEFAULT 0,
  observacao text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT programacao_extras_pkey PRIMARY KEY (id),
  CONSTRAINT programacao_extras_programacao_id_fkey FOREIGN KEY (programacao_id) REFERENCES programacao_dia(id) ON DELETE CASCADE
);

CREATE TABLE public.programacao_frota_vinculos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  chave_vinculo text NOT NULL,
  programacao_id uuid NOT NULL,
  data_referencia date,
  frota_colaborador_id text NOT NULL,
  frota_nome text,
  placa_veiculo text NOT NULL,
  tipo_atuacao text NOT NULL,
  alvo_tipo text NOT NULL,
  os_id uuid NOT NULL,
  alvo_colaborador_id text,
  alvo_colaborador_nome text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT programacao_frota_vinculos_tipo_atuacao_check CHECK ((tipo_atuacao = ANY (ARRAY['ATENDIMENTO'::text, 'LOGISTICA'::text]))),
  CONSTRAINT programacao_frota_vinculos_alvo_tipo_check CHECK ((alvo_tipo = ANY (ARRAY['OS'::text, 'COLABORADOR'::text]))),
  CONSTRAINT programacao_frota_vinculos_alvo_ck CHECK ((((alvo_tipo = 'OS'::text) AND (alvo_colaborador_id IS NULL)) OR ((alvo_tipo = 'COLABORADOR'::text) AND (alvo_colaborador_id IS NOT NULL)))),
  CONSTRAINT programacao_frota_vinculos_pkey PRIMARY KEY (id),
  CONSTRAINT programacao_frota_vinculos_chave_vinculo_key UNIQUE (chave_vinculo),
  CONSTRAINT programacao_frota_vinculos_os_id_fkey FOREIGN KEY (os_id) REFERENCES operacional_os(id) ON DELETE CASCADE
);

CREATE TABLE public.programacao_hist (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  programacao_id uuid,
  programacao_item_id uuid,
  entidade_tipo text NOT NULL,
  acao text NOT NULL,
  chave text,
  queue_id text,
  solicitante_nome text,
  solicitante_user_id uuid,
  antes jsonb,
  depois jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT programacao_hist_pkey PRIMARY KEY (id),
  CONSTRAINT programacao_hist_programacao_id_fkey FOREIGN KEY (programacao_id) REFERENCES programacoes(id) ON DELETE CASCADE
);

CREATE TABLE public.programacao_inativacao_solicitacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  colaborador_id text NOT NULL,
  nome_colaborador text NOT NULL,
  cargo text,
  coordenacao text,
  supervisao text,
  motivo text NOT NULL,
  data_referencia date,
  programacao_id uuid,
  status text NOT NULL DEFAULT 'PENDENTE'::text,
  solicitado_por uuid,
  solicitado_por_nome text,
  solicitado_em timestamp with time zone NOT NULL DEFAULT now(),
  processado_por uuid,
  processado_por_nome text,
  processado_em timestamp with time zone,
  observacao_rh text,
  CONSTRAINT programacao_inativacao_solicitacoes_status_check CHECK ((status = ANY (ARRAY['PENDENTE'::text, 'PROCESSADA'::text, 'CANCELADA'::text]))),
  CONSTRAINT programacao_inativacao_solicitacoes_pkey PRIMARY KEY (id),
  CONSTRAINT programacao_inativacao_solicitacoes_programacao_id_fkey FOREIGN KEY (programacao_id) REFERENCES programacao_dia(id) ON DELETE SET NULL
);

CREATE TABLE public.programacao_indisponibilidade_informados (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  programacao_id text,
  colaborador_id text NOT NULL,
  colaborador_cpf text,
  colaborador_nome text NOT NULL,
  cargo text,
  coordenacao text,
  supervisao text,
  data_referencia date NOT NULL,
  tipo text NOT NULL,
  observacao text,
  origem text NOT NULL DEFAULT 'PROGRAMACAO_SEM_OS'::text,
  status text NOT NULL DEFAULT 'PENDENTE'::text,
  informado_por uuid,
  informado_por_nome text,
  informado_em timestamp with time zone NOT NULL DEFAULT now(),
  processado_por uuid,
  processado_por_nome text,
  processado_em timestamp with time zone,
  observacao_rh text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT programacao_indisponibilidade_informados_tipo_check CHECK ((tipo = ANY (ARRAY['ATESTADO'::text, 'FALTA'::text, 'FERIAS'::text, 'FOLGA'::text]))),
  CONSTRAINT programacao_indisponibilidade_informados_status_check CHECK ((status = ANY (ARRAY['PENDENTE'::text, 'PROCESSADO'::text, 'CANCELADO'::text]))),
  CONSTRAINT programacao_indisponibilidade_informados_pkey PRIMARY KEY (id),
  CONSTRAINT programacao_indisponibilidade_informados_dia_colaborador_key UNIQUE (data_referencia, colaborador_id)
);

CREATE TABLE public.programacao_itens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  contexto_id uuid NOT NULL,
  colaborador_nome text NOT NULL,
  colaborador_cpf text NOT NULL,
  disponibilidade_marcado boolean NOT NULL DEFAULT false,
  disponibilidade_obs text,
  estadia_necessaria boolean NOT NULL DEFAULT false,
  estadia_local text,
  estadia_checkin date,
  estadia_checkout date,
  estadia_obs text,
  alimentacao_necessaria boolean NOT NULL DEFAULT false,
  alimentacao_tipo text,
  alimentacao_obs text,
  deslocamento_necessario boolean NOT NULL DEFAULT false,
  deslocamento_origem text,
  deslocamento_destino text,
  deslocamento_tipo text,
  deslocamento_obs text,
  extras_necessario boolean NOT NULL DEFAULT false,
  extras_tipo text,
  extras_obs text,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT programacao_itens_contexto_id_colaborador_cpf_key UNIQUE (contexto_id, colaborador_cpf),
  CONSTRAINT programacao_itens_pkey PRIMARY KEY (id),
  CONSTRAINT programacao_itens_contexto_id_fkey FOREIGN KEY (contexto_id) REFERENCES programacao_contextos(id) ON DELETE CASCADE,
  CONSTRAINT programacao_itens_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE public.programacao_recusas_respostas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conferencia_status_id uuid NOT NULL,
  programacao_id uuid NOT NULL,
  colaborador_id text NOT NULL,
  data_referencia date,
  resposta text NOT NULL,
  motivo text,
  anexos_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  respondido_por uuid,
  respondido_por_nome text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT programacao_recusas_respostas_resposta_check CHECK ((resposta = ANY (ARRAY['ACEITO'::text, 'CONTESTADO'::text]))),
  CONSTRAINT programacao_recusas_respostas_pkey PRIMARY KEY (id),
  CONSTRAINT programacao_recusas_respostas_conferencia_status_id_key UNIQUE (conferencia_status_id),
  CONSTRAINT programacao_recusas_respostas_conferencia_status_id_fkey FOREIGN KEY (conferencia_status_id) REFERENCES programacao_conferencia_status(id) ON DELETE CASCADE
);

CREATE TABLE public.programacao_usuario_supervisoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  app_usuario_id uuid,
  auth_user_id uuid,
  supervisao text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT programacao_usuario_supervisoes_usuario_check CHECK (((app_usuario_id IS NOT NULL) OR (auth_user_id IS NOT NULL))),
  CONSTRAINT programacao_usuario_supervisoes_pkey PRIMARY KEY (id),
  CONSTRAINT programacao_usuario_supervisoes_app_usuario_id_fkey FOREIGN KEY (app_usuario_id) REFERENCES app_usuarios(id) ON DELETE CASCADE,
  CONSTRAINT programacao_usuario_supervisoes_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE public.programacao_veiculo_proprio (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  colaborador_id text NOT NULL,
  nome text,
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  criado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  tarifa_km numeric(12,2) NOT NULL DEFAULT 1.20,
  CONSTRAINT programacao_veiculo_proprio_colaborador_id_key UNIQUE (colaborador_id),
  CONSTRAINT programacao_veiculo_proprio_pkey PRIMARY KEY (id)
);

CREATE TABLE public.programacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_referencia date NOT NULL,
  coordenacao text,
  supervisao text,
  solicitante_nome text,
  solicitante_user_id uuid,
  origem text NOT NULL DEFAULT 'painel'::text,
  status text NOT NULL DEFAULT 'rascunho'::text,
  observacoes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT programacoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.propostas_comerciais (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  numero text NOT NULL,
  cliente text NOT NULL,
  status text NOT NULL DEFAULT 'rascunho'::text,
  tipo_modelo text NOT NULL DEFAULT 'padrao'::text,
  modelo_doc_id text NOT NULL DEFAULT '1oXtCy8kAs9hfivR62JYKknjw7s0VKGeLvRkhSCN0Vzg'::text,
  pasta_destino_id text NOT NULL DEFAULT '13oHU_dFWBVe9h-YRk-ZmPTb1VoEWx0Pt'::text,
  link_proposta text,
  nome_contato text,
  email_contato text,
  whatsapp_contato text,
  data_aceite_proposta date,
  link_contrato text,
  estados text,
  data_proposta date DEFAULT CURRENT_DATE,
  prazo_inicial date,
  prazo_final date,
  prazo_fatura text,
  prazo_pgto text,
  solicitante text,
  cargo text,
  telefone text,
  email text,
  tn text,
  cad text,
  aud text,
  quality text,
  intacta text,
  lacrar text,
  cif text,
  fob text,
  m_8h text,
  m_12h text,
  add_sup text,
  add_claf text,
  t_gmos text,
  t_gmoc text,
  t_aflas text,
  t_aflac text,
  t_don text,
  campos jsonb NOT NULL DEFAULT '{}'::jsonb,
  observacao text,
  formato_ultima_geracao text,
  arquivo_drive_id text,
  arquivo_drive_nome text,
  gerada_em timestamp with time zone,
  created_by uuid,
  created_by_nome text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT propostas_comerciais_status_check CHECK ((status = ANY (ARRAY['rascunho'::text, 'gerada'::text, 'enviada'::text, 'aceita'::text, 'contrato'::text, 'recusada'::text]))),
  CONSTRAINT propostas_comerciais_pkey PRIMARY KEY (id)
);

CREATE TABLE public.propostas_gestores_regionais (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  regional text NOT NULL,
  supervisor text NOT NULL,
  contato text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT propostas_gestores_regionais_pkey PRIMARY KEY (id),
  CONSTRAINT propostas_gestores_regionais_unique UNIQUE (regional, supervisor, contato)
);

CREATE TABLE public.relatorio_resultado_diario (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  importacao_id uuid,
  file_name text,
  os text,
  contrato text,
  produto text,
  data date,
  funcionario text,
  coordenacao text,
  supervisao text,
  cliente_nacional text,
  cliente_regional text,
  cliente_final text,
  local_embarque text,
  destino text,
  cargas numeric DEFAULT 0,
  toneladas numeric DEFAULT 0,
  valor_ton numeric DEFAULT 0,
  cadencia numeric DEFAULT 0,
  tons_cadencia numeric DEFAULT 0,
  embarcado numeric DEFAULT 0,
  valor_embarcado numeric DEFAULT 0,
  valor_afla numeric DEFAULT 0,
  total_afla numeric DEFAULT 0,
  valor_vomitoxina numeric DEFAULT 0,
  total_vomitoxina numeric DEFAULT 0,
  valor_falling_number numeric DEFAULT 0,
  total_falling_number numeric DEFAULT 0,
  valor_intacta numeric DEFAULT 0,
  total_intacta numeric DEFAULT 0,
  valor_gmo numeric DEFAULT 0,
  total_gmo numeric DEFAULT 0,
  total_embarcado_mais_teste numeric DEFAULT 0,
  remanescente numeric DEFAULT 0,
  motivo_nhe text,
  observacoes_nhe text,
  situacao text,
  observacoes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT relatorio_resultado_diario_pkey PRIMARY KEY (id)
);

CREATE TABLE public.relatorio_resultado_diario_staging (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  importacao_id uuid,
  file_name text,
  os text,
  contrato text,
  produto text,
  data date,
  funcionario text,
  coordenacao text,
  supervisao text,
  cliente_nacional text,
  cliente_regional text,
  cliente_final text,
  local_embarque text,
  destino text,
  cargas numeric DEFAULT 0,
  toneladas numeric DEFAULT 0,
  valor_ton numeric DEFAULT 0,
  cadencia numeric DEFAULT 0,
  tons_cadencia numeric DEFAULT 0,
  embarcado numeric DEFAULT 0,
  valor_embarcado numeric DEFAULT 0,
  valor_afla numeric DEFAULT 0,
  total_afla numeric DEFAULT 0,
  valor_vomitoxina numeric DEFAULT 0,
  total_vomitoxina numeric DEFAULT 0,
  valor_falling_number numeric DEFAULT 0,
  total_falling_number numeric DEFAULT 0,
  valor_intacta numeric DEFAULT 0,
  total_intacta numeric DEFAULT 0,
  valor_gmo numeric DEFAULT 0,
  total_gmo numeric DEFAULT 0,
  total_embarcado_mais_teste numeric DEFAULT 0,
  remanescente numeric DEFAULT 0,
  motivo_nhe text,
  observacoes_nhe text,
  situacao text,
  observacoes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.relatorio_resultado_gavilon (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  importacao_id uuid,
  file_name text,
  regiao text,
  classif_utilizados integer,
  data date,
  os text,
  produto text,
  classificador text,
  cliente text,
  fazenda_armazem text,
  numero_veiculos integer,
  tons_classificadas_d1 integer,
  valor_tons numeric(14,2),
  cadencia_tons_dia integer,
  total_cadencia integer,
  total_embarcado integer,
  valor_total_embarcado numeric(14,2),
  teste_aflatoxina text,
  teste numeric(14,2),
  valor_teste numeric(14,2),
  total_embarcado_mais_teste numeric(14,2),
  ocorrencia text,
  ocorrencia_gavilon text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT relatorio_resultado_gavilon_pkey PRIMARY KEY (id)
);

CREATE TABLE public.relatorios_importacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tipo_relatorio text NOT NULL,
  titulo_relatorio text NOT NULL,
  arquivo_nome_original text NOT NULL,
  arquivo_nome_storage text,
  storage_bucket text NOT NULL DEFAULT 'relatorios-uploads'::text,
  storage_path text NOT NULL,
  tamanho_bytes bigint,
  mime_type text,
  status text NOT NULL DEFAULT 'enviado'::text,
  observacoes text,
  importado_por uuid,
  importado_por_nome text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  nome_arquivo text NOT NULL,
  tipo text NOT NULL DEFAULT 'outros'::text,
  path text NOT NULL,
  url text,
  usuario_id uuid,
  usuario_nome text,
  usuario_email text,
  periodo_inicio date,
  periodo_fim date,
  modo_importacao text NOT NULL DEFAULT 'append'::text,
  substitui_importacoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_periodo_registros integer,
  fingerprint text,
  CONSTRAINT relatorios_importacoes_modo_importacao_check CHECK ((modo_importacao = ANY (ARRAY['auto'::text, 'append'::text, 'replace'::text]))),
  CONSTRAINT relatorios_importacoes_pkey PRIMARY KEY (id),
  CONSTRAINT relatorios_importacoes_storage_path_key UNIQUE (storage_path)
);

CREATE TABLE public.rh_admissao_checklist (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  colaborador_id text NOT NULL,
  colaborador_nome text,
  cpf text,
  etapa text NOT NULL,
  status text NOT NULL DEFAULT 'Pendente'::text,
  responsavel text,
  concluido_em timestamp with time zone,
  observacao text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT rh_admissao_checklist_pkey PRIMARY KEY (id)
);

CREATE TABLE public.rh_admissoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cpf text,
  data_nascimento date,
  cargo text,
  empresa text,
  coordenacao text,
  supervisao text,
  data_admissao_prevista date,
  telefone text,
  email text,
  status text NOT NULL DEFAULT 'documentos_pendentes'::text,
  colaborador_id uuid,
  observacoes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT rh_admissoes_pkey PRIMARY KEY (id),
  CONSTRAINT rh_admissoes_colaborador_id_fkey FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
);

CREATE TABLE public.rh_advertencias (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  colaborador_id uuid,
  colaborador_nome text NOT NULL,
  data date NOT NULL,
  tipo text NOT NULL DEFAULT 'verbal'::text,
  motivo text NOT NULL,
  descricao text,
  anexo_url text,
  aplicada_por text,
  status text NOT NULL DEFAULT 'registrada'::text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT rh_advertencias_pkey PRIMARY KEY (id),
  CONSTRAINT rh_advertencias_colaborador_id_fkey FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
);

CREATE TABLE public.rh_atestados (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  colaborador_id uuid,
  colaborador_nome text NOT NULL,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  dias integer,
  cid text,
  medico text,
  anexo_url text,
  observacoes text,
  status text NOT NULL DEFAULT 'lancado'::text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT rh_atestados_pkey PRIMARY KEY (id),
  CONSTRAINT rh_atestados_colaborador_id_fkey FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
);

CREATE TABLE public.rh_cartao_ponto (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  colaborador_id uuid,
  colaborador_nome text NOT NULL,
  data date NOT NULL,
  entrada time without time zone,
  saida_almoco time without time zone,
  retorno_almoco time without time zone,
  saida time without time zone,
  horas_trabalhadas numeric,
  observacoes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT rh_cartao_ponto_pkey PRIMARY KEY (id),
  CONSTRAINT rh_cartao_ponto_colaborador_id_fkey FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
);

CREATE TABLE public.rh_cat (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  colaborador_id uuid,
  colaborador_nome text NOT NULL,
  data_acidente date NOT NULL,
  tipo text NOT NULL DEFAULT 'tipico'::text,
  descricao text,
  cid text,
  afastamento_dias integer,
  protocolo text,
  anexo_url text,
  status text NOT NULL DEFAULT 'aberta'::text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT rh_cat_pkey PRIMARY KEY (id),
  CONSTRAINT rh_cat_colaborador_id_fkey FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
);

CREATE TABLE public.rh_clinicas_sst (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  estado text,
  cidade text,
  nome text NOT NULL,
  telefone text,
  celular text,
  endereco text,
  cep text,
  dados_medico text,
  email text,
  observacoes text,
  chave_pix text,
  exames text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT rh_clinicas_sst_nome_cidade_estado_key UNIQUE (nome, cidade, estado),
  CONSTRAINT rh_clinicas_sst_pkey PRIMARY KEY (id)
);

CREATE TABLE public.rh_contratos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  colaborador_id text NOT NULL,
  colaborador_nome text,
  tipo text NOT NULL,
  versao integer NOT NULL DEFAULT 1,
  arquivo_url text,
  assinado boolean NOT NULL DEFAULT false,
  assinado_em timestamp with time zone,
  vencimento date,
  status text NOT NULL DEFAULT 'Vigente'::text,
  observacao text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  criado_por text,
  CONSTRAINT rh_contratos_pkey PRIMARY KEY (id)
);

CREATE TABLE public.rh_contratos_experiencia (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  colaborador_id uuid,
  colaborador_nome text NOT NULL,
  data_inicio date NOT NULL,
  data_fim_experiencia date NOT NULL,
  prorrogado boolean NOT NULL DEFAULT false,
  data_fim_prorrogacao date,
  data_efetivacao date,
  status text NOT NULL DEFAULT 'em_experiencia'::text,
  observacoes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT rh_contratos_experiencia_pkey PRIMARY KEY (id),
  CONSTRAINT rh_contratos_experiencia_colaborador_id_fkey FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
);

CREATE TABLE public.rh_documentos_registro (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  admissao_id uuid NOT NULL,
  tipo_documento text NOT NULL,
  status text NOT NULL DEFAULT 'solicitado'::text,
  arquivo_url text,
  observacoes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT rh_documentos_registro_pkey PRIMARY KEY (id),
  CONSTRAINT rh_documentos_registro_admissao_id_fkey FOREIGN KEY (admissao_id) REFERENCES rh_admissoes(id) ON DELETE CASCADE
);

CREATE TABLE public.rh_epi (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  colaborador_id text NOT NULL,
  colaborador_nome text,
  equipamento text NOT NULL,
  ca text,
  entrega date,
  devolucao date,
  assinatura_url text,
  observacao text,
  status text NOT NULL DEFAULT 'Entregue'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  criado_por text,
  CONSTRAINT rh_epi_pkey PRIMARY KEY (id)
);

CREATE TABLE public.rh_epi_registros (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  colaborador_id text,
  colaborador_nome text NOT NULL,
  epi text NOT NULL,
  ca text,
  quantidade numeric NOT NULL DEFAULT 1,
  tamanho text,
  data_entrega date,
  status text NOT NULL DEFAULT 'pendente'::text,
  observacao text,
  anexo_url text,
  confirmado_em timestamp with time zone,
  compra_item_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  regional text,
  CONSTRAINT rh_epi_registros_pkey PRIMARY KEY (id)
);

CREATE TABLE public.rh_exames (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  colaborador_id uuid,
  colaborador_nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'admissional'::text,
  clinica_id uuid,
  clinica_nome text,
  data_agendada date,
  data_realizada date,
  data_vencimento date,
  resultado text,
  status text NOT NULL DEFAULT 'agendado'::text,
  anexo_url text,
  observacoes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT rh_exames_pkey PRIMARY KEY (id),
  CONSTRAINT rh_exames_colaborador_id_fkey FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id),
  CONSTRAINT rh_exames_clinica_id_fkey FOREIGN KEY (clinica_id) REFERENCES rh_clinicas_sst(id)
);

CREATE TABLE public.rh_ferias (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  colaborador_id uuid,
  colaborador_nome text NOT NULL,
  periodo_aquisitivo_inicio date,
  periodo_aquisitivo_fim date,
  periodo_concessivo_limite date,
  dias_direito integer NOT NULL DEFAULT 30,
  dias_gozados integer,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  status text NOT NULL DEFAULT 'programada'::text,
  observacoes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT rh_ferias_pkey PRIMARY KEY (id),
  CONSTRAINT rh_ferias_colaborador_id_fkey FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
);

CREATE TABLE public.rh_folha (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  colaborador_id uuid,
  colaborador_nome text,
  competencia text,
  valor_bruto numeric,
  valor_liquido numeric,
  proventos jsonb NOT NULL DEFAULT '[]'::jsonb,
  descontos jsonb NOT NULL DEFAULT '[]'::jsonb,
  arquivo_url text,
  status text NOT NULL DEFAULT 'gerada'::text,
  empresa text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT rh_folha_pkey PRIMARY KEY (id),
  CONSTRAINT rh_folha_colaborador_id_fkey FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
);

CREATE TABLE public.rh_integracao (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  colaborador_id uuid,
  colaborador_nome text NOT NULL,
  admissao_id uuid,
  etapas jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'em_andamento'::text,
  responsavel text,
  data_inicio date DEFAULT CURRENT_DATE,
  data_conclusao date,
  observacoes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT rh_integracao_pkey PRIMARY KEY (id),
  CONSTRAINT rh_integracao_colaborador_id_fkey FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id),
  CONSTRAINT rh_integracao_admissao_id_fkey FOREIGN KEY (admissao_id) REFERENCES rh_admissoes(id)
);

CREATE TABLE public.rh_plantao_contatos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  colaborador_key text NOT NULL,
  cpf text,
  nome text NOT NULL,
  telefone text,
  email_corporativo text,
  setor_preferencial text,
  origem text NOT NULL DEFAULT 'painel'::text,
  atualizado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT rh_plantao_contatos_colaborador_key_key UNIQUE (colaborador_key),
  CONSTRAINT rh_plantao_contatos_pkey PRIMARY KEY (id)
);

CREATE TABLE public.rh_plantao_escalas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data_plantao date NOT NULL,
  evento text,
  setor text NOT NULL,
  colaborador_key text NOT NULL,
  cpf text,
  nome text NOT NULL,
  telefone text,
  email_corporativo text,
  hora_inicio time without time zone,
  hora_fim time without time zone,
  hora_inicio_2 time without time zone,
  hora_fim_2 time without time zone,
  observacoes text,
  ordem integer NOT NULL DEFAULT 1,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  apelido text,
  CONSTRAINT rh_plantao_escalas_pkey PRIMARY KEY (id)
);

CREATE TABLE public.rh_plantao_modelos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome_modelo text NOT NULL DEFAULT 'Padrão'::text,
  setor text NOT NULL,
  colaborador_key text NOT NULL,
  cpf text,
  nome text NOT NULL,
  telefone text,
  email_corporativo text,
  hora_inicio time without time zone,
  hora_fim time without time zone,
  hora_inicio_2 time without time zone,
  hora_fim_2 time without time zone,
  dias_semana integer[] NOT NULL DEFAULT ARRAY[6, 0],
  ordem integer NOT NULL DEFAULT 1,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  apelido text,
  CONSTRAINT rh_plantao_modelos_pkey PRIMARY KEY (id)
);

CREATE TABLE public.rh_plantao_setor_config (
  setor text NOT NULL,
  hora_inicio time without time zone NOT NULL DEFAULT '08:00:00'::time without time zone,
  hora_fim time without time zone NOT NULL DEFAULT '12:00:00'::time without time zone,
  hora_inicio_2 time without time zone,
  hora_fim_2 time without time zone,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT rh_plantao_setor_config_setor_not_blank CHECK ((btrim(setor) <> ''::text)),
  CONSTRAINT rh_plantao_setor_config_intervalo_1 CHECK ((hora_inicio < hora_fim)),
  CONSTRAINT rh_plantao_setor_config_intervalo_2 CHECK ((((hora_inicio_2 IS NULL) AND (hora_fim_2 IS NULL)) OR ((hora_inicio_2 IS NOT NULL) AND (hora_fim_2 IS NOT NULL) AND (hora_inicio_2 < hora_fim_2)))),
  CONSTRAINT rh_plantao_setor_config_pkey PRIMARY KEY (setor)
);

CREATE TABLE public.rh_plantao_setor_editores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  setor text NOT NULL,
  app_usuario_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT rh_plantao_setor_editores_pkey PRIMARY KEY (id),
  CONSTRAINT rh_plantao_setor_editores_unique UNIQUE (setor, app_usuario_id),
  CONSTRAINT rh_plantao_setor_editores_setor_fkey FOREIGN KEY (setor) REFERENCES rh_plantao_setor_config(setor) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT rh_plantao_setor_editores_app_usuario_id_fkey FOREIGN KEY (app_usuario_id) REFERENCES app_usuarios(id) ON DELETE CASCADE,
  CONSTRAINT rh_plantao_setor_editores_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE public.rh_plantao_setores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 999,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT rh_plantao_setores_nome_key UNIQUE (nome),
  CONSTRAINT rh_plantao_setores_pkey PRIMARY KEY (id)
);

CREATE TABLE public.rh_rescisoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  colaborador_id uuid,
  colaborador_nome text NOT NULL,
  data_desligamento date NOT NULL,
  tipo text NOT NULL DEFAULT 'dispensa_sem_justa_causa'::text,
  motivo text,
  valor_total numeric,
  documentos_url text,
  status text NOT NULL DEFAULT 'em_andamento'::text,
  observacoes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT rh_rescisoes_pkey PRIMARY KEY (id),
  CONSTRAINT rh_rescisoes_colaborador_id_fkey FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id)
);

CREATE TABLE public.rh_treinamento_acessos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cpf text NOT NULL,
  colaborador_nome text,
  material text,
  tipo_material text,
  progresso numeric NOT NULL DEFAULT 0,
  concluido boolean NOT NULL DEFAULT false,
  dispositivo text,
  acessado_em timestamp with time zone NOT NULL DEFAULT now(),
  concluido_em timestamp with time zone,
  CONSTRAINT rh_treinamento_acessos_pkey PRIMARY KEY (id)
);

CREATE TABLE public.supervisoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  distribuicao_os_automatica boolean NOT NULL DEFAULT false,
  CONSTRAINT supervisoes_nome_key UNIQUE (nome),
  CONSTRAINT supervisoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.termos_celular (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  compra_item_id uuid,
  colaborador_id uuid,
  colaborador_nome text,
  metodo_pagamento text,
  parcelas integer DEFAULT 1,
  valor numeric(12,2),
  status text NOT NULL DEFAULT 'aguardando_termo'::text,
  termo_url text,
  observacao text,
  created_at timestamp with time zone DEFAULT now(),
  confirmado_em timestamp with time zone,
  CONSTRAINT termos_celular_pkey PRIMARY KEY (id),
  CONSTRAINT termos_celular_compra_item_id_fkey FOREIGN KEY (compra_item_id) REFERENCES compras_itens(id) ON DELETE SET NULL
);

CREATE TABLE public.termos_documentos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  colaborador_id text,
  colaborador_nome text,
  patrimonio_id text,
  versao integer NOT NULL DEFAULT 1,
  arquivo_url text,
  assinado boolean NOT NULL DEFAULT false,
  assinado_em timestamp with time zone,
  validade date,
  status text NOT NULL DEFAULT 'Ativo'::text,
  observacao text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  criado_por text,
  CONSTRAINT termos_documentos_pkey PRIMARY KEY (id)
);

CREATE TABLE public.termos_veiculos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  colaborador_nome text,
  veiculo text,
  placa text,
  status text NOT NULL DEFAULT 'pendente'::text,
  observacao text,
  created_at timestamp with time zone DEFAULT now(),
  colaborador_id uuid,
  termo_url text,
  assinado_em timestamp with time zone,
  CONSTRAINT termos_veiculos_pkey PRIMARY KEY (id)
);

CREATE TABLE public.ti_integracao_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  integracao_id uuid,
  acao text NOT NULL,
  status text NOT NULL DEFAULT 'INFO'::text,
  mensagem text,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  usuario_id uuid,
  usuario_nome text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ti_integracao_logs_pkey PRIMARY KEY (id),
  CONSTRAINT ti_integracao_logs_integracao_id_fkey FOREIGN KEY (integracao_id) REFERENCES ti_integracoes(id) ON DELETE SET NULL
);

CREATE TABLE public.ti_integracao_segredos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  integracao_id uuid NOT NULL,
  chave text NOT NULL,
  valor text NOT NULL,
  descricao text,
  sensivel boolean NOT NULL DEFAULT true,
  ativo boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_por uuid,
  atualizado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ti_integracao_segredos_integracao_id_chave_key UNIQUE (integracao_id, chave),
  CONSTRAINT ti_integracao_segredos_pkey PRIMARY KEY (id),
  CONSTRAINT ti_integracao_segredos_integracao_id_fkey FOREIGN KEY (integracao_id) REFERENCES ti_integracoes(id) ON DELETE CASCADE
);

CREATE TABLE public.ti_integracoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  nome text NOT NULL,
  categoria text NOT NULL DEFAULT 'GERAL'::text,
  ambiente text NOT NULL DEFAULT 'PRODUCAO'::text,
  base_url text,
  auth_url text,
  ativo boolean NOT NULL DEFAULT true,
  observacoes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_por uuid,
  atualizado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ti_integracoes_ambiente_check CHECK ((ambiente = ANY (ARRAY['PRODUCAO'::text, 'HOMOLOGACAO'::text, 'TESTE'::text]))),
  CONSTRAINT ti_integracoes_codigo_key UNIQUE (codigo),
  CONSTRAINT ti_integracoes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.uber_colaboradores_adicao_fila (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL,
  nome text NOT NULL,
  email text,
  status text NOT NULL DEFAULT 'pendente'::text,
  detectado_em timestamp with time zone NOT NULL DEFAULT now(),
  fonte text NOT NULL DEFAULT 'reconciliacao_colaboradores_ativos'::text,
  tentativas integer NOT NULL DEFAULT 0,
  ultimo_erro text,
  arquivo_remoto text,
  enviado_em timestamp with time zone,
  cancelado_em timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT uber_colaboradores_adicao_fila_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'processando'::text, 'enviado'::text, 'sem_email'::text, 'erro'::text, 'cancelado'::text]))),
  CONSTRAINT uber_colaboradores_adicao_fila_pkey PRIMARY KEY (id),
  CONSTRAINT uber_colaboradores_adicao_fila_colaborador_id_fkey FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE
);

CREATE TABLE public.uber_colaboradores_equipe_estado (
  colaborador_id uuid NOT NULL,
  ativo_observado boolean NOT NULL,
  nome text NOT NULL,
  email text,
  inicializado_em timestamp with time zone NOT NULL DEFAULT now(),
  ultima_mudanca_em timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT uber_colaboradores_equipe_estado_pkey PRIMARY KEY (colaborador_id),
  CONSTRAINT uber_colaboradores_equipe_estado_colaborador_id_fkey FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE
);

CREATE TABLE public.uber_colaboradores_remocao_fila (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  status_historico_id uuid,
  colaborador_id uuid NOT NULL,
  nome text NOT NULL,
  email text,
  status text NOT NULL DEFAULT 'pendente'::text,
  detectado_em timestamp with time zone NOT NULL DEFAULT now(),
  fonte text,
  tentativas integer NOT NULL DEFAULT 0,
  ultimo_erro text,
  arquivo_remoto text,
  enviado_em timestamp with time zone,
  cancelado_em timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT uber_colaboradores_remocao_fila_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'processando'::text, 'enviado'::text, 'sem_email'::text, 'erro'::text, 'cancelado'::text]))),
  CONSTRAINT uber_colaboradores_remocao_fila_pkey PRIMARY KEY (id),
  CONSTRAINT uber_colaboradores_remocao_fila_status_historico_id_key UNIQUE (status_historico_id),
  CONSTRAINT uber_colaboradores_remocao_fila_status_historico_id_fkey FOREIGN KEY (status_historico_id) REFERENCES colaboradores_status_historico(id) ON DELETE SET NULL
);

CREATE TABLE public.user_modules (
  user_id uuid NOT NULL,
  module_code text NOT NULL,
  can_view boolean NOT NULL DEFAULT true,
  can_edit boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_modules_pkey PRIMARY KEY (user_id, module_code),
  CONSTRAINT user_modules_module_code_fkey FOREIGN KEY (module_code) REFERENCES modules(code) ON DELETE CASCADE,
  CONSTRAINT user_modules_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- ============================================================
-- FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public._normalizar_texto_g1000(valor text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select nullif(
    regexp_replace(
      lower(
        translate(
          coalesce(valor, ''),
          'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
          'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
        )
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    ),
    ''
  );
$function$
;

CREATE OR REPLACE FUNCTION public._somente_digitos_g1000(valor text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select nullif(regexp_replace(coalesce(valor, ''), '\\D', '', 'g'), '');
$function$
;

CREATE OR REPLACE FUNCTION public.activate_grm_sync_8_lanes_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_running integer := 0;
  v_missing integer := 0;
  v_settings integer := 0;
  v_jobs integer := 0;
  v_version smallint := 1;
  v_result jsonb;
begin
  perform pg_advisory_xact_lock(872634503);
  perform pg_advisory_xact_lock(872634504);
  lock table public.grm_sync_jobs in share row exclusive mode;
  lock table public.grm_sync_agent_settings in share row exclusive mode;

  select coalesce(active_version,1)
    into v_version
  from public.grm_sync_runtime_policy
  where id=1
  for update;

  if coalesce(v_version,1)=2 then
    return jsonb_build_object(
      'ok',true,
      'already_active',true,
      'active_version',2,
      'cutover_at',(select cutover_at from public.grm_sync_runtime_policy where id=1)
    );
  end if;

  select count(*) into v_running
  from public.grm_sync_jobs
  where status='rodando';

  if v_running > 0 then
    raise exception 'Cutover bloqueado: existem % job(s) rodando. Pare os workers antigos e tente novamente.',v_running;
  end if;

  select count(*) into v_missing
  from public.grm_sync_agent_settings
  where target_lane is null;

  if v_missing > 0 then
    raise exception 'Cutover bloqueado: % agente(s) sem target_lane.',v_missing;
  end if;

  update public.grm_sync_agent_settings
     set legacy_lane_before_v2=queue_lane
   where legacy_lane_before_v2 is null;

  update public.grm_sync_runtime_policy
     set active_version=2,
         cutover_at=now(),
         updated_at=now()
   where id=1;

  update public.grm_sync_agent_settings
     set queue_lane=target_lane,
         updated_at=now()
   where target_lane is not null
     and queue_lane is distinct from target_lane;
  get diagnostics v_settings=row_count;

  update public.grm_sync_jobs j
     set lane=public.grm_sync_target_lane_for_agent(j.agente_id)
   where j.status='pendente'
     and public.grm_sync_target_lane_for_agent(j.agente_id) is not null
     and j.lane is distinct from public.grm_sync_target_lane_for_agent(j.agente_id);
  get diagnostics v_jobs=row_count;

  v_result := jsonb_build_object(
    'ok',true,
    'already_active',false,
    'active_version',2,
    'settings_migrated',v_settings,
    'pending_jobs_migrated',v_jobs,
    'cutover_at',(select cutover_at from public.grm_sync_runtime_policy where id=1)
  );

  insert into public.grm_sync_cutover_history(action,details)
  values ('activate_v2',v_result);

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.agenda_distribuicao_os_novo_dia()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.supervisao is not null
     and new.data_referencia > (now() at time zone 'America/Sao_Paulo')::date
  then
    insert into public.programacao_distribuicao_agendada (supervisao, data_referencia, programacao_id)
    values (new.supervisao, new.data_referencia, new.id)
    on conflict (supervisao, data_referencia)
    do update set
      programacao_id = excluded.programacao_id,
      processado = false,
      processado_em = null,
      created_at = now();
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.app_usuarios_sync_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text;
begin
  select codigo into v_role from public.app_perfis where id = new.perfil_id;

  insert into public.profiles (id, full_name, email, role, active)
  values (
    coalesce(new.auth_user_id, new.id),
    new.nome,
    new.email,
    coalesce(v_role, 'user'),
    lower(coalesce(new.status, '')) = 'ativo'
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    role = excluded.role,
    active = excluded.active,
    updated_at = now();

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ativar_grm_despesas_do_dia()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_hoje date := public.grm_hoje_sao_paulo();
  v_version record;
  v_expirados integer := 0;
  v_superados integer := 0;
  v_limpesas integer := 0;
  v_ativados integer := 0;
  v_pendentes integer := 0;
  v_job_criado boolean := false;
  v_count integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('ativar_grm_despesas_do_dia'));

  -- Nunca execute automaticamente uma programação cuja data já passou.
  update public.grm_despesas_fila
  set
    status = 'EXPIRADO',
    locked_at = null,
    finalizado_em = coalesce(finalizado_em, now()),
    ultimo_erro = coalesce(
      ultimo_erro,
      'Não executado: a data de referência já foi encerrada.'
    )
  where data_referencia < v_hoje
    and status in ('AGENDADO', 'PENDENTE', 'ERRO');

  get diagnostics v_expirados = row_count;

  -- Para cada regional, apenas a versão mais recente publicada para hoje vale.
  for v_version in
    select distinct on (upper(trim(v.regional)))
      v.id,
      v.regional,
      v.programacao_ids,
      v.created_at
    from public.grm_despesas_versoes v
    where v.data_referencia = v_hoje
    order by
      upper(trim(v.regional)),
      v.created_at desc,
      v.id desc
  loop
    update public.grm_despesas_fila f
    set
      status = 'IGNORADO_VERSAO_SUPERADA',
      locked_at = null,
      finalizado_em = coalesce(f.finalizado_em, now()),
      diagnostico = coalesce(f.diagnostico, '{}'::jsonb)
        || jsonb_build_object(
          'motivo', 'Versão futura substituída antes da data de execução.',
          'versao_valida', v_version.id,
          'ativado_em', now()
        )
    where f.data_referencia = v_hoje
      and upper(trim(f.regional)) = upper(trim(v_version.regional))
      and f.versao_id <> v_version.id
      and f.status = 'AGENDADO';

    get diagnostics v_count = row_count;
    v_superados := v_superados + v_count;

    -- Se o agente deixou regras ativas no dia anterior e o colaborador não
    -- aparece na versão de hoje, gera uma limpeza para hoje. Uma programação
    -- futura não impede essa limpeza.
    insert into public.grm_despesas_fila (
      versao_id,
      programacao_id,
      data_referencia,
      regional,
      colaborador_id,
      nome,
      cpf,
      acao,
      regras,
      hash_desejado,
      status,
      tentativas,
      max_tentativas,
      diagnostico
    )
    select
      v_version.id,
      nullif(v_version.programacao_ids ->> 0, '')::uuid,
      v_hoje,
      v_version.regional,
      s.colaborador_id,
      s.nome,
      s.cpf,
      'LIMPAR',
      '[]'::jsonb,
      md5(
        s.cpf
        || '|LIMPAR|'
        || v_hoje::text
        || '|'
        || v_version.id::text
      ),
      'PENDENTE',
      0,
      3,
      jsonb_build_object(
        'gerado_por', 'ativar_grm_despesas_do_dia',
        'motivo', 'Sem programação confirmada nesta regional na data corrente.'
      )
    from public.grm_despesas_estado_colaborador s
    where upper(trim(coalesce(s.regional_origem, '')))
          = upper(trim(v_version.regional))
      and s.status_aplicacao = 'APLICADO'
      and s.hash_aplicado is not null
      and not exists (
        select 1
        from public.grm_despesas_fila q
        where q.versao_id = v_version.id
          and q.cpf = s.cpf
      )
    on conflict do nothing;

    get diagnostics v_count = row_count;
    v_limpesas := v_limpesas + v_count;

    -- Promove a versão válida de hoje.
    update public.grm_despesas_fila f
    set
      status = 'PENDENTE',
      locked_at = null,
      finalizado_em = null,
      ultimo_erro = null,
      diagnostico = coalesce(f.diagnostico, '{}'::jsonb)
        || jsonb_build_object(
          'ativado_em', now(),
          'data_execucao', v_hoje
        )
    where f.versao_id = v_version.id
      and f.data_referencia = v_hoje
      and f.status = 'AGENDADO';

    get diagnostics v_count = row_count;
    v_ativados := v_ativados + v_count;

    -- Somente agora a versão do dia passa a ser o estado desejado do CPF.
    insert into public.grm_despesas_estado_colaborador (
      cpf,
      colaborador_id,
      nome,
      regional_origem,
      versao_desejada_id,
      hash_desejado,
      regras_desejadas,
      deve_liberar,
      status_aplicacao
    )
    select distinct on (f.cpf)
      f.cpf,
      f.colaborador_id,
      f.nome,
      f.regional,
      f.versao_id,
      f.hash_desejado,
      f.regras,
      f.acao = 'APLICAR',
      'PENDENTE'
    from public.grm_despesas_fila f
    where f.versao_id = v_version.id
      and f.data_referencia = v_hoje
      and f.status in ('PENDENTE', 'ERRO')
    order by f.cpf, f.created_at desc, f.id desc
    on conflict (cpf) do update
    set
      colaborador_id = excluded.colaborador_id,
      nome = excluded.nome,
      regional_origem = excluded.regional_origem,
      versao_desejada_id = excluded.versao_desejada_id,
      hash_desejado = excluded.hash_desejado,
      regras_desejadas = excluded.regras_desejadas,
      deve_liberar = excluded.deve_liberar,
      status_aplicacao = excluded.status_aplicacao;
  end loop;

  select count(*)
  into v_pendentes
  from public.grm_despesas_fila f
  where f.data_referencia = v_hoje
    and (
      f.status = 'PENDENTE'
      or (
        f.status = 'ERRO'
        and coalesce(f.tentativas, 0) < coalesce(f.max_tentativas, 3)
      )
    );

  if v_pendentes > 0
    and not exists (
      select 1
      from public.grm_sync_jobs j
      where j.agente_id = 'sync-liberacao-despesas'
        and j.status in ('pendente', 'rodando')
    )
  then
    insert into public.grm_sync_jobs (
      agente_id,
      status
    )
    values (
      'sync-liberacao-despesas',
      'pendente'
    );

    v_job_criado := true;
  end if;

  return jsonb_build_object(
    'hoje_sao_paulo', v_hoje,
    'expirados', v_expirados,
    'versoes_superadas', v_superados,
    'limpezas_geradas', v_limpesas,
    'agendados_ativados', v_ativados,
    'pendentes_do_dia', v_pendentes,
    'job_criado', v_job_criado
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_validar_uber_por_laudo(p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_atualizados integer;
BEGIN
  UPDATE conferencia_uber_corridas u
  SET
    status_validacao   = 'VALIDADA',
    classificacao_manual = 'VALIDADA',
    motivo_validacao   = 'Validação automática: laudo de produção encontrado para a data.',
    validado_em        = now(),
    updated_at         = now()
  WHERE
    (p_inicio IS NULL OR u.data_solicitacao_local >= p_inicio)
    AND (p_fim IS NULL OR u.data_solicitacao_local <= p_fim)
    AND u.status_validacao IN ('PENDENTE', 'ATENCAO')
    AND u.classificacao_manual IS NULL
    AND (u.nome_colaborador IS NOT NULL OR u.nome IS NOT NULL)
    AND EXISTS (
      SELECT 1 FROM relatorio_resultado_diario r
      WHERE r.data = u.data_solicitacao_local
        AND (
          lower(r.funcionario) LIKE '%' || lower(COALESCE(u.nome_colaborador, u.nome, '')) || '%'
          OR lower(COALESCE(u.nome_colaborador, u.nome, '')) LIKE '%' || lower(r.funcionario) || '%'
        )
    );

  GET DIAGNOSTICS v_atualizados = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'validados', v_atualizados);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bonus_bloquear_mutacao_snapshot_fechado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_comp date;
begin
  v_comp := case when tg_op = 'DELETE' then old.competencia else new.competencia end;
  if exists (select 1 from public.bonus_competencias_fechadas f where f.competencia=v_comp) then
    raise exception 'SNAPSHOT_FECHADO: competência % está congelada e não pode ser alterada.', v_comp
      using errcode='P0001';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bonus_caixa_validar_processamento_atual()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status text;
  v_tons numeric;
  v_valor numeric;
begin
  if new.status is distinct from 'PROCESSANDO' then
    return new;
  end if;

  if old.status = 'PROCESSANDO' then
    return new;
  end if;

  select p.status, p.tons, p.valor
    into v_status, v_tons, v_valor
  from public.bonus_producao_competencia(new.competencia) p
  where public.bonus_normalizar_nome(p.colaborador) = new.nome_normalizado
  limit 1;

  if not found or v_status is distinct from 'Apto' then
    raise exception using
      errcode = 'P0001',
      message = format(
        'BONUS_NAO_APTO: %s não possui bônus Apto na fotografia válida da competência %s.',
        new.colaborador_nome,
        new.competencia
      );
  end if;

  if abs(coalesce(new.tons, 0) - coalesce(v_tons, 0)) > 0.001
     or abs(coalesce(new.valor, 0) - coalesce(v_valor, 0)) > 0.001 then
    raise exception using
      errcode = 'P0001',
      message = format(
        'VALOR_DESATUALIZADO: %s está na fila com %.2f t / R$ %.2f, mas a fotografia válida é %.2f t / R$ %.2f.',
        new.colaborador_nome,
        coalesce(new.tons, 0),
        coalesce(new.valor, 0),
        coalesce(v_tons, 0),
        coalesce(v_valor, 0)
      );
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bonus_competencia_fechada(p_competencia date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.bonus_competencias_fechadas f
    where f.competencia = date_trunc('month', coalesce(p_competencia, current_date))::date
  );
$function$
;

CREATE OR REPLACE FUNCTION public.bonus_normalizar_nome(p_nome text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  select regexp_replace(
    translate(
      upper(trim(coalesce(p_nome, ''))),
      'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ',
      'AAAAAEEEEIIIIOOOOOUUUUCN'
    ),
    '[^A-Z0-9]+',
    '',
    'g'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.bonus_producao_cache_refresh(p_competencia date, p_force boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_comp date := date_trunc('month',coalesce(p_competencia,current_date))::date;
  v_atualizado timestamptz;
begin
  -- Competências fechadas são imutáveis. O cache operacional deixa de ser
  -- recalculado para elas; a leitura passa a vir de bonus_producao_fechada.
  if public.bonus_competencia_fechada(v_comp) then
    return;
  end if;

  select atualizado_em into v_atualizado
  from public.bonus_producao_cache_meta
  where competencia=v_comp;

  if not p_force and v_atualizado is not null and v_atualizado >= now()-interval '2 minutes' then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('bonus_producao_cache:'||v_comp::text));

  select atualizado_em into v_atualizado
  from public.bonus_producao_cache_meta
  where competencia=v_comp;

  if not p_force and v_atualizado is not null and v_atualizado >= now()-interval '2 minutes' then
    return;
  end if;

  delete from public.bonus_producao_cache where competencia=v_comp;

  insert into public.bonus_producao_cache (
    competencia,colaborador,nome_normalizado,tons,valor,status,motivo,patrimonio_dias,inapto_auditoria,atualizado_em
  )
  select
    v_comp,
    c.colaborador,
    public.bonus_normalizar_nome(c.colaborador),
    c.tons,c.valor,c.status,c.motivo,c.patrimonio_dias,c.inapto_auditoria,now()
  from public.bonus_producao_competencia_calcular(v_comp) c;

  insert into public.bonus_producao_cache_meta(competencia,atualizado_em)
  values(v_comp,now())
  on conflict(competencia) do update set atualizado_em=excluded.atualizado_em;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bonus_producao_competencia(p_competencia date)
 RETURNS TABLE(colaborador text, tons numeric, valor numeric, status text, motivo text, patrimonio_dias integer, inapto_auditoria boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_comp date := date_trunc('month',coalesce(p_competencia,current_date))::date;
begin
  if public.bonus_competencia_fechada(v_comp) then
    return query
    select f.colaborador,f.tons,f.valor,f.status,f.motivo,f.patrimonio_dias,f.inapto_auditoria
    from public.bonus_producao_fechada f
    where f.competencia=v_comp
    order by f.colaborador;
    return;
  end if;

  perform public.bonus_producao_cache_refresh(v_comp,false);
  return query
  select c.colaborador,c.tons,c.valor,c.status,c.motivo,c.patrimonio_dias,c.inapto_auditoria
  from public.bonus_producao_cache c
  where c.competencia=v_comp
  order by c.colaborador;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bonus_producao_competencia_calcular(p_competencia date)
 RETURNS TABLE(colaborador text, tons numeric, valor numeric, status text, motivo text, patrimonio_dias integer, inapto_auditoria boolean)
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  with parametros as (
    select
      date_trunc('month', coalesce(p_competencia, current_date))::date as inicio,
      (date_trunc('month', coalesce(p_competencia, current_date)) + interval '1 month')::date as fim
  ),
  producao_raw as (
    select trim(ps.funcionario) as colaborador_raw,
           sum(coalesce(ps.tons,0))::numeric as tons
    from public.producao_snapshot ps
    cross join parametros p
    where ps.data >= p.inicio
      and ps.data < p.fim
      and ps.servico = 'Classificação FOB'
      and nullif(trim(ps.funcionario),'') is not null
    group by trim(ps.funcionario)
  ),
  producao as (
    select public.bonus_normalizar_nome(pr.colaborador_raw) as nome_key,
           min(pr.colaborador_raw) as colaborador,
           sum(pr.tons)::numeric as tons
    from producao_raw pr
    where public.bonus_normalizar_nome(pr.colaborador_raw) <> ''
    group by public.bonus_normalizar_nome(pr.colaborador_raw)
  ),
  patrimonio_raw as (
    select trim(pat.funcionario) as funcionario_raw,
           max(pat.dias_sem_leitura) as max_dias
    from public.patrimonios_snapshot pat
    where nullif(trim(pat.funcionario),'') is not null
    group by trim(pat.funcionario)
  ),
  patrimonio as (
    select public.bonus_normalizar_nome(pr.funcionario_raw) as nome_key,
           max(pr.max_dias) as max_dias
    from patrimonio_raw pr
    where public.bonus_normalizar_nome(pr.funcionario_raw) <> ''
    group by public.bonus_normalizar_nome(pr.funcionario_raw)
  ),
  auditoria as (
    select bai.nome_normalizado as nome_key
    from public.bonus_auditoria_inaptos bai
    cross join parametros p
    where bai.competencia = p.inicio
  )
  select
    prod.colaborador,
    round(prod.tons,2) as tons,
    round(prod.tons*0.03,2) as valor,
    case when aud.nome_key is not null or coalesce(pat.max_dias,0)>10 then 'Inapto' else 'Apto' end as status,
    concat_ws(
      ' · ',
      case when aud.nome_key is not null then 'Auditoria' end,
      case when coalesce(pat.max_dias,0)>10 then 'Patrimônio: '||pat.max_dias||' dias sem leitura' end
    ) as motivo,
    pat.max_dias as patrimonio_dias,
    (aud.nome_key is not null) as inapto_auditoria
  from producao prod
  left join patrimonio pat on pat.nome_key=prod.nome_key
  left join auditoria aud on aud.nome_key=prod.nome_key
  order by prod.colaborador;
$function$
;

CREATE OR REPLACE FUNCTION public.bonus_solicitar_lancamento_caixa(p_competencia date, p_colaboradores text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_comp date := date_trunc('month', p_competencia)::date;
  v_enfileirados integer := 0;
  v_ja_lancados integer := 0;
  v_ja_pendentes integer := 0;
  v_rejeitados integer := 0;
  v_rejeicoes jsonb := '[]'::jsonb;
  v_job_id uuid;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  if not public.bonus_usuario_tem_acesso() then
    raise exception 'Usuário sem permissão para lançar Bônus';
  end if;

  if p_colaboradores is null or coalesce(array_length(p_colaboradores, 1), 0) = 0 then
    raise exception 'Selecione ao menos um colaborador';
  end if;

  if v_comp is null then
    raise exception 'Competência inválida';
  end if;

  -- Em competência fechada, a fila histórica é a autorização financeira.
  -- Só ERRO pode ser reaberto e sempre com os mesmos tons/valor já aprovados.
  -- CANCELADO não é reaberto e nomes sem histórico jamais viram nova obrigação.
  if public.bonus_competencia_fechada(v_comp) then
    drop table if exists pg_temp.bonus_lote_fechado_tmp;
    create temporary table bonus_lote_fechado_tmp on commit drop as
    with solicitados as (
      select distinct on (public.bonus_normalizar_nome(btrim(x)))
        btrim(x) as input_nome,
        public.bonus_normalizar_nome(btrim(x)) as nome_key
      from unnest(p_colaboradores) as u(x)
      where btrim(coalesce(x, '')) <> ''
        and public.bonus_normalizar_nome(btrim(x)) <> ''
      order by public.bonus_normalizar_nome(btrim(x)), btrim(x)
    )
    select
      s.input_nome,
      s.nome_key,
      f.colaborador,
      f.tons as snapshot_tons,
      f.valor as snapshot_valor,
      f.status as snapshot_status,
      f.motivo,
      l.id as lancamento_id,
      upper(l.status) as lancamento_status,
      l.tons as lancamento_tons,
      l.valor as lancamento_valor
    from solicitados s
    left join public.bonus_producao_fechada f
      on f.competencia=v_comp and f.nome_normalizado=s.nome_key
    left join public.bonus_caixa_lancamentos l
      on l.competencia=v_comp and l.nome_normalizado=s.nome_key;

    select
      count(*) filter (
        where colaborador is not null
          and snapshot_status='Apto'
          and coalesce(snapshot_valor,0)>0
          and lancamento_status='LANCADO'
      )::integer,
      count(*) filter (
        where colaborador is not null
          and snapshot_status='Apto'
          and coalesce(snapshot_valor,0)>0
          and lancamento_status in ('PENDENTE','PROCESSANDO')
      )::integer,
      count(*) filter (
        where colaborador is null
           or snapshot_status is distinct from 'Apto'
           or coalesce(snapshot_valor,0)<=0
           or lancamento_id is null
           or lancamento_status='CANCELADO'
           or lancamento_status not in ('LANCADO','PENDENTE','PROCESSANDO','ERRO','CANCELADO')
           or (
             lancamento_status='ERRO' and (
               abs(coalesce(lancamento_tons,0)-coalesce(snapshot_tons,0))>0.001
               or abs(coalesce(lancamento_valor,0)-coalesce(snapshot_valor,0))>0.001
             )
           )
      )::integer,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'colaborador', coalesce(colaborador,input_nome),
            'motivo', case
              when colaborador is null then 'Colaborador não consta na fotografia fechada'
              when snapshot_status is distinct from 'Apto' then coalesce(nullif(motivo,''),'Colaborador inapto na fotografia fechada')
              when coalesce(snapshot_valor,0)<=0 then 'Bônus R$ 0,00 - sem lançamento financeiro'
              when lancamento_id is null then 'Competência fechada: colaborador não fazia parte do lote aprovado para o Caixa'
              when lancamento_status='CANCELADO' then 'Lançamento cancelado na competência fechada; reabertura exige revisão administrativa'
              when lancamento_status='ERRO' and (
                abs(coalesce(lancamento_tons,0)-coalesce(snapshot_tons,0))>0.001
                or abs(coalesce(lancamento_valor,0)-coalesce(snapshot_valor,0))>0.001
              ) then 'Divergência entre fila histórica e fotografia fechada; revisão manual obrigatória'
              else 'Não elegível para lançamento em competência fechada'
            end
          )
        ) filter (
          where colaborador is null
             or snapshot_status is distinct from 'Apto'
             or coalesce(snapshot_valor,0)<=0
             or lancamento_id is null
             or lancamento_status='CANCELADO'
             or lancamento_status not in ('LANCADO','PENDENTE','PROCESSANDO','ERRO','CANCELADO')
             or (
               lancamento_status='ERRO' and (
                 abs(coalesce(lancamento_tons,0)-coalesce(snapshot_tons,0))>0.001
                 or abs(coalesce(lancamento_valor,0)-coalesce(snapshot_valor,0))>0.001
               )
             )
        ),
        '[]'::jsonb
      )
    into v_ja_lancados, v_ja_pendentes, v_rejeitados, v_rejeicoes
    from bonus_lote_fechado_tmp;

    update public.bonus_caixa_lancamentos l
       set status='PENDENTE',
           tentativas=0,
           ultimo_erro=null,
           grm_retorno=null,
           solicitado_por=v_uid,
           solicitado_em=now(),
           iniciado_em=null,
           processado_em=null,
           updated_at=now()
      from bonus_lote_fechado_tmp t
     where l.id=t.lancamento_id
       and t.lancamento_status='ERRO'
       and t.snapshot_status='Apto'
       and coalesce(t.snapshot_valor,0)>0
       and abs(coalesce(t.lancamento_tons,0)-coalesce(t.snapshot_tons,0))<=0.001
       and abs(coalesce(t.lancamento_valor,0)-coalesce(t.snapshot_valor,0))<=0.001;

    get diagnostics v_enfileirados = row_count;

    if v_enfileirados > 0 and not exists (
      select 1 from public.grm_sync_jobs
      where agente_id='sync-bonus-caixa'
        and status in ('pendente','rodando','processando')
    ) then
      insert into public.grm_sync_jobs (agente_id,status,solicitado_por,payload)
      values (
        'sync-bonus-caixa','pendente',v_uid::text,
        jsonb_build_object('competencia',v_comp,'origem','conferencia_bonus_fechado_retry','quantidade',v_enfileirados)
      ) returning id into v_job_id;
    end if;

    return jsonb_build_object(
      'competencia',v_comp,
      'competencia_fechada',true,
      'enfileirados',v_enfileirados,
      'ja_lancados',v_ja_lancados,
      'ja_pendentes',v_ja_pendentes,
      'rejeitados',v_rejeitados,
      'rejeicoes',v_rejeicoes,
      'job_id',v_job_id
    );
  end if;

  drop table if exists pg_temp.bonus_lote_tmp;
  create temporary table bonus_lote_tmp on commit drop as
  with solicitados as (
    select distinct on (public.bonus_normalizar_nome(btrim(x)))
      btrim(x) as input_nome,
      public.bonus_normalizar_nome(btrim(x)) as nome_key
    from unnest(p_colaboradores) as u(x)
    where btrim(coalesce(x, '')) <> ''
      and public.bonus_normalizar_nome(btrim(x)) <> ''
    order by public.bonus_normalizar_nome(btrim(x)), btrim(x)
  ),
  producao as materialized (
    select
      b.colaborador,
      public.bonus_normalizar_nome(b.colaborador) as nome_key,
      b.tons,
      b.valor,
      b.status,
      b.motivo
    from public.bonus_producao_competencia(v_comp) b
  )
  select
    s.input_nome,
    s.nome_key,
    p.colaborador,
    p.tons,
    p.valor,
    p.status as producao_status,
    p.motivo,
    upper(l.status) as lancamento_status
  from solicitados s
  left join producao p on p.nome_key = s.nome_key
  left join public.bonus_caixa_lancamentos l
    on l.competencia = v_comp
   and l.nome_normalizado = s.nome_key;

  select
    count(*) filter (
      where colaborador is null
         or producao_status is distinct from 'Apto'
         or coalesce(valor, 0) <= 0
    )::integer,
    count(*) filter (
      where colaborador is not null
        and producao_status = 'Apto'
        and coalesce(valor,0) > 0
        and lancamento_status = 'LANCADO'
    )::integer,
    count(*) filter (
      where colaborador is not null
        and producao_status = 'Apto'
        and coalesce(valor,0) > 0
        and lancamento_status in ('PENDENTE', 'PROCESSANDO')
    )::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'colaborador', coalesce(colaborador, input_nome),
          'motivo', case
            when colaborador is null then 'Sem produção na competência'
            when producao_status is distinct from 'Apto' then coalesce(nullif(motivo,''), 'Colaborador inapto')
            when coalesce(valor,0) <= 0 then 'Bônus R$ 0,00 - sem lançamento financeiro'
            else 'Não elegível para lançamento'
          end
        )
      ) filter (
        where colaborador is null
           or producao_status is distinct from 'Apto'
           or coalesce(valor,0) <= 0
      ),
      '[]'::jsonb
    )
  into v_rejeitados, v_ja_lancados, v_ja_pendentes, v_rejeicoes
  from bonus_lote_tmp;

  insert into public.bonus_caixa_lancamentos (
    competencia, colaborador_nome, nome_normalizado, tons, valor, status,
    tentativas, ultimo_erro, grm_retorno, solicitado_por, solicitado_em,
    iniciado_em, processado_em, updated_at
  )
  select
    v_comp, t.colaborador, t.nome_key, t.tons, t.valor, 'PENDENTE',
    0, null, null, v_uid, now(), null, null, now()
  from bonus_lote_tmp t
  where t.colaborador is not null
    and t.producao_status = 'Apto'
    and coalesce(t.valor,0) > 0
    and coalesce(t.lancamento_status, '') not in ('LANCADO', 'PENDENTE', 'PROCESSANDO')
  on conflict (competencia, nome_normalizado) do update set
    colaborador_nome = excluded.colaborador_nome,
    tons = excluded.tons,
    valor = excluded.valor,
    status = 'PENDENTE',
    tentativas = 0,
    ultimo_erro = null,
    grm_retorno = null,
    solicitado_por = excluded.solicitado_por,
    solicitado_em = now(),
    iniciado_em = null,
    processado_em = null,
    updated_at = now()
  where upper(public.bonus_caixa_lancamentos.status) not in ('LANCADO', 'PENDENTE', 'PROCESSANDO');

  get diagnostics v_enfileirados = row_count;

  if v_enfileirados > 0 and not exists (
    select 1
    from public.grm_sync_jobs
    where agente_id = 'sync-bonus-caixa'
      and status in ('pendente', 'rodando', 'processando')
  ) then
    insert into public.grm_sync_jobs (agente_id, status, solicitado_por, payload)
    values (
      'sync-bonus-caixa',
      'pendente',
      v_uid::text,
      jsonb_build_object('competencia', v_comp, 'origem', 'conferencia_bonus', 'quantidade', v_enfileirados)
    ) returning id into v_job_id;
  end if;

  return jsonb_build_object(
    'competencia', v_comp,
    'competencia_fechada',false,
    'enfileirados', v_enfileirados,
    'ja_lancados', v_ja_lancados,
    'ja_pendentes', v_ja_pendentes,
    'rejeitados', v_rejeitados,
    'rejeicoes', v_rejeicoes,
    'job_id', v_job_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bonus_substituir_auditoria(p_competencia date, p_nomes text[], p_arquivo_nome text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_competencia date;
  v_total integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if not public.bonus_usuario_tem_acesso() then
    raise exception 'Usuário sem permissão para administrar o Bônus';
  end if;

  if p_competencia is null then
    raise exception 'Competência obrigatória';
  end if;

  v_competencia := date_trunc('month', p_competencia)::date;

  if public.bonus_competencia_fechada(v_competencia) then
    raise exception 'COMPETENCIA_FECHADA: a auditoria de % está congelada e não pode ser substituída.', v_competencia
      using errcode='P0001';
  end if;

  delete from public.bonus_auditoria_inaptos
  where competencia = v_competencia;

  insert into public.bonus_auditoria_inaptos (
    competencia,
    colaborador_nome,
    nome_normalizado,
    arquivo_nome,
    importado_por
  )
  select
    v_competencia,
    min(trim(nome)) as colaborador_nome,
    public.bonus_normalizar_nome(nome) as nome_normalizado,
    nullif(trim(p_arquivo_nome), ''),
    auth.uid()
  from unnest(coalesce(p_nomes, array[]::text[])) as t(nome)
  where nullif(trim(nome), '') is not null
    and public.bonus_normalizar_nome(nome) <> ''
  group by public.bonus_normalizar_nome(nome)
  on conflict (competencia, nome_normalizado)
  do update set
    colaborador_nome = excluded.colaborador_nome,
    arquivo_nome = excluded.arquivo_nome,
    importado_por = excluded.importado_por,
    importado_em = now();

  get diagnostics v_total = row_count;
  return v_total;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bonus_usuario_tem_acesso()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  select exists (
    select 1
    from public.app_usuarios u
    left join public.app_perfis p on p.id = u.perfil_id
    where (
      u.auth_user_id = auth.uid()
      or lower(u.email) = lower(coalesce(auth.email(), ''))
    )
      and lower(coalesce(u.status, '')) = 'ativo'
      and (
        lower(coalesce(p.codigo, '')) = 'master'
        or exists (
          select 1
          from public.app_usuario_modulos um
          join public.app_modulos m on m.id = um.modulo_id
          where um.usuario_id = u.id
            and um.ativo = true
            and lower(coalesce(um.status, 'ativo')) = 'ativo'
            and m.ativo = true
            and lower(m.codigo) = 'conferencia_bonus'
        )
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.claim_logistica_ocr_job(p_worker_id text)
 RETURNS SETOF logistica_ocr_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_job_id bigint;
begin
  select j.id
    into v_job_id
  from public.logistica_ocr_jobs j
  where j.attempts < 3
    and (
      j.status = 'PENDENTE'
      or (j.status = 'PROCESSANDO' and j.locked_at < now() - interval '20 minutes')
    )
  order by j.priority desc, j.created_at asc
  for update skip locked
  limit 1;

  if v_job_id is null then
    return;
  end if;

  update public.logistica_ocr_jobs
     set status = 'PROCESSANDO',
         worker_id = p_worker_id,
         attempts = attempts + 1,
         progress = greatest(progress, 1),
         locked_at = now(),
         started_at = coalesce(started_at, now()),
         error = null,
         updated_at = now()
   where id = v_job_id;

  return query
    select * from public.logistica_ocr_jobs where id = v_job_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_next_grm_despesa_fila(p_excluir_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS grm_despesas_fila
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.grm_despesas_fila;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  perform pg_advisory_xact_lock(hashtext('claim_next_grm_despesa_fila'));

  update public.grm_despesas_fila
     set status = 'ERRO',
         ultimo_erro = coalesce(ultimo_erro, 'Processamento anterior excedeu 20 minutos.'),
         locked_at = null
   where status = 'PROCESSANDO'
     and locked_at < now() - interval '20 minutes';

  select *
    into v_row
    from public.grm_despesas_fila
   where data_referencia <= v_hoje
     and (
       status = 'PENDENTE'
       or (status = 'ERRO' and tentativas < max_tentativas)
     )
     and not (id = any(coalesce(p_excluir_ids, '{}'::uuid[])))
   order by data_referencia asc, created_at asc
   for update skip locked
   limit 1;

  if v_row.id is null then
    return null;
  end if;

  update public.grm_despesas_fila
     set status = 'PROCESSANDO',
         tentativas = tentativas + 1,
         locked_at = now(),
         ultimo_erro = null
   where id = v_row.id
   returning * into v_row;

  update public.grm_despesas_estado_colaborador
     set status_aplicacao = 'PROCESSANDO'
   where cpf = v_row.cpf
     and data_referencia = v_row.data_referencia
     and hash_desejado = v_row.hash_desejado;

  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_next_grm_reabertura_os(p_os text DEFAULT NULL::text, p_prioridade_max smallint DEFAULT 2)
 RETURNS grm_reabertura_os_fila
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.grm_reabertura_os_fila;
  v_enabled boolean;
begin
  select enabled into v_enabled
  from public.grm_sync_agent_settings
  where agent_id='sync-reabrir-os';

  if coalesce(v_enabled,false) is not true then
    raise exception 'sync-reabrir-os está desativado.' using errcode='P0001';
  end if;

  perform pg_advisory_xact_lock(872634504);

  select * into v_row
  from public.grm_reabertura_os_fila f
  where f.status='PENDENTE_REABERTURA'
    and coalesce(f.remanescente,0) > 30
    and f.dias_sem_embarque is not null
    and f.dias_sem_embarque < 10
    and (p_os is null or f.os = regexp_replace(coalesce(p_os,''),'[^0-9]','','g'))
    and (p_os is not null or f.prioridade <= greatest(1,least(coalesce(p_prioridade_max,2),2)))
  order by f.prioridade asc, abs(coalesce(f.remanescente,0)) desc, f.fechamento_em asc
  for update skip locked
  limit 1;

  if v_row.id is null then
    return null;
  end if;

  update public.grm_reabertura_os_fila
  set status='EM_REABERTURA',
      tentativas=tentativas+1,
      erro=null,
      updated_at=now()
  where id=v_row.id
  returning * into v_row;

  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_next_grm_sync_job(p_lane text, p_worker_id text)
 RETURNS grm_sync_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_job public.grm_sync_jobs;
  v_max_workers integer := 8;
  v_max_heavy integer := 4;
  v_running integer := 0;
  v_running_heavy integer := 0;
begin
  if p_lane not in (
    'fixed_a','fixed_b','fixed_c','alteracoes','despesas_distribuicao',
    'entrada_os','entrada_producao','entrada_financeiro_a','entrada_financeiro_b',
    'entrada_cadastros_operacao','saida_os','saida_logistica','saida_financeiro'
  ) then
    raise exception 'Lane inválida: %',p_lane;
  end if;

  perform pg_advisory_xact_lock(872634503);

  update public.grm_sync_jobs
     set status='erro',
         finalizado_em=now(),
         erro='Lease do worker expirou sem heartbeat; job liberado automaticamente.'
   where status='rodando'
     and coalesce(lease_expires_at,iniciado_em+interval '20 minutes')<now();

  if exists(select 1 from public.grm_sync_jobs where status='rodando' and lane=p_lane) then
    return null;
  end if;

  select coalesce(max_workers,8),coalesce(max_heavy_concurrent,4)
    into v_max_workers,v_max_heavy
  from public.grm_sync_runtime_policy
  where id=1;

  select count(*) into v_running
  from public.grm_sync_jobs
  where status='rodando';

  if v_running >= v_max_workers then
    return null;
  end if;

  select count(*) into v_running_heavy
  from public.grm_sync_jobs r
  left join public.grm_sync_agent_settings rs on rs.agent_id=r.agente_id
  where r.status='rodando'
    and coalesce(rs.resource_class,'medium')='heavy';

  select j.* into v_job
  from public.grm_sync_jobs j
  left join public.grm_sync_agent_settings s on s.agent_id=j.agente_id
  where j.status='pendente'
    and j.lane=p_lane
    and (
      coalesce(s.resource_class,'medium') <> 'heavy'
      or v_running_heavy < v_max_heavy
    )
    and (
      s.mutex_group is null
      or not exists (
        select 1
        from public.grm_sync_jobs r
        join public.grm_sync_agent_settings rs on rs.agent_id=r.agente_id
        where r.status='rodando'
          and rs.mutex_group=s.mutex_group
      )
    )
  order by coalesce(s.priority,50) desc,
           j.pipeline_seq nulls first,
           j.created_at
  for update of j skip locked
  limit 1;

  if v_job.id is null then return null; end if;

  update public.grm_sync_jobs
     set status='rodando',
         iniciado_em=now(),
         erro=null,
         worker_id=p_worker_id,
         heartbeat_at=now(),
         lease_expires_at=now()+interval '10 minutes',
         tentativas=tentativas+1
   where id=v_job.id
  returning * into v_job;

  return v_job;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.colaboradores_preserva_conta_bancaria()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if coalesce(new.conta_bancaria_despesas, '') = '' and coalesce(old.conta_bancaria_despesas, '') <> '' then
    new.conta_bancaria_despesas := old.conta_bancaria_despesas;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.conf_distancia_km(lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
    when lat1 is null or lon1 is null or lat2 is null or lon2 is null then null
    else round((6371 * 2 * asin(sqrt(
      power(sin(radians((lat2::float8 - lat1::float8) / 2)), 2) +
      cos(radians(lat1::float8)) * cos(radians(lat2::float8)) *
      power(sin(radians((lon2::float8 - lon1::float8) / 2)), 2)
    )))::numeric, 3)
  end
$function$
;

CREATE OR REPLACE FUNCTION public.conf_norm_txt(value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select upper(regexp_replace(translate(coalesce(value,''),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
    'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'), '[^A-Z0-9]+', ' ', 'g'))
$function$
;

CREATE OR REPLACE FUNCTION public.cron_trigger_sync_multas_detran_full()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_total integer;
  v_limit integer := 25;
  v_offset integer := 0;
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if v_url is null or v_key is null then
    raise warning 'cron_trigger_sync_multas_detran_full: project_url/service_role_key ausentes em vault.decrypted_secrets';
    return;
  end if;

  select count(*) into v_total from public.frotas_veiculos where renavam is not null and renavam <> '0';

  while v_offset < v_total loop
    perform net.http_post(
      url := v_url || '/functions/v1/sync-multas-detran',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body := jsonb_build_object('mode', 'all', 'offset', v_offset, 'limit', v_limit),
      timeout_milliseconds := 120000
    );
    v_offset := v_offset + v_limit;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.decidir_abertura_os(p_id uuid, p_acao text, p_observacao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_acao text := upper(trim(coalesce(p_acao, '')));
  v_status_atual text;
  v_job_id uuid;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  if v_acao not in ('OK', 'CORRIGIR', 'RECUSAR') then
    raise exception 'Ação inválida. Use OK, CORRIGIR ou RECUSAR.';
  end if;

  if v_acao in ('CORRIGIR', 'RECUSAR')
     and nullif(trim(coalesce(p_observacao, '')), '') is null then
    raise exception 'Informe o motivo para corrigir ou recusar.';
  end if;

  select status
    into v_status_atual
    from public.logistica_abertura_os
   where id = p_id
   for update;

  if not found then
    raise exception 'Solicitação de abertura não encontrada.';
  end if;

  if v_acao = 'OK' then
    if v_status_atual not in ('PENDENTE', 'ERRO') then
      raise exception 'A solicitação não pode ser aprovada no status atual: %', v_status_atual;
    end if;

    update public.logistica_abertura_os
       set status = 'APROVADO',
           observacao_adm = nullif(trim(coalesce(p_observacao, '')), ''),
           aprovado_por = v_uid,
           aprovado_em = now(),
           decidido_por = v_uid,
           decidido_em = now(),
           processamento_iniciado_em = null,
           processamento_finalizado_em = null,
           erro_agente = null,
           updated_at = now()
     where id = p_id;

    insert into public.grm_sync_jobs (agente_id, status)
    values ('sync-abrir-os', 'pendente')
    returning id into v_job_id;

    update public.logistica_abertura_os
       set agente_job_id = v_job_id,
           updated_at = now()
     where id = p_id;

    return jsonb_build_object(
      'ok', true,
      'acao', 'OK',
      'status', 'APROVADO',
      'job_id', v_job_id,
      'abertura_os_id', p_id
    );
  end if;

  if v_status_atual not in ('PENDENTE', 'ERRO', 'APROVADO') then
    raise exception 'A solicitação não pode receber esta decisão no status atual: %', v_status_atual;
  end if;

  update public.logistica_abertura_os
     set status = case when v_acao = 'CORRIGIR' then 'CORRIGIR' else 'RECUSADO' end,
         observacao_adm = trim(p_observacao),
         decidido_por = v_uid,
         decidido_em = now(),
         aprovado_por = null,
         aprovado_em = null,
         agente_job_id = null,
         processamento_iniciado_em = null,
         processamento_finalizado_em = null,
         erro_agente = null,
         updated_at = now()
   where id = p_id;

  return jsonb_build_object(
    'ok', true,
    'acao', v_acao,
    'status', case when v_acao = 'CORRIGIR' then 'CORRIGIR' else 'RECUSADO' end,
    'abertura_os_id', p_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.diretoria_desenvolvimento_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  IF NEW.status = 'CONCLUIDO' AND NEW.progresso < 100 THEN
    NEW.progresso = 100;
  END IF;
  IF NEW.status = 'CONCLUIDO' AND NEW.data_conclusao IS NULL THEN
    NEW.data_conclusao = CURRENT_DATE;
  END IF;
  IF NEW.status <> 'CONCLUIDO' THEN
    NEW.data_conclusao = NULL;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.dre_notas_fiscais_deduplicadas()
 RETURNS TABLE(numero_nf text, created_at timestamp with time zone, dados_json jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select distinct on (empresa, fatura)
    numero_nf, created_at, dados_json
  from public.grm_notas_fiscais_importacoes
  where fatura is not null
  order by empresa, fatura, created_at desc;
$function$
;

CREATE OR REPLACE FUNCTION public.duplicar_programacao_dia(p_programacao_id uuid, p_datas date[], p_copiar_estadias boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_resultado jsonb;
  v_origem public.programacao_dia%rowtype;
  v_data date;
  v_destino_id uuid;
begin
  select * into v_origem
  from public.programacao_dia
  where id = p_programacao_id;

  if not found then
    raise exception 'Programação de origem não encontrada.' using errcode = 'P0002';
  end if;

  if to_regprocedure('public.duplicar_programacao_dia_base_20260817(uuid,date[],boolean)') is not null then
    v_resultado := public.duplicar_programacao_dia_base_20260817(
      p_programacao_id,
      p_datas,
      p_copiar_estadias
    );
  else
    v_resultado := public.duplicar_programacao_dia_base_20260813(
      p_programacao_id,
      p_datas
    );
  end if;

  for v_data in
    select value::date
    from jsonb_array_elements_text(coalesce(v_resultado -> 'copiadas', '[]'::jsonb))
  loop
    select id into v_destino_id
    from public.programacao_dia
    where data_referencia = v_data
      and supervisao is not distinct from v_origem.supervisao
    order by created_at desc, id desc
    limit 1;

    if v_destino_id is null then
      raise exception 'Destino da duplicação não foi localizado para %.', v_data;
    end if;

    update public.programacao_colaboradores destino
    set data_referencia = v_data,
        nome_colaborador = origem.nome_colaborador,
        cargo = origem.cargo,
        coordenacao = origem.coordenacao,
        supervisao = origem.supervisao,
        disponibilidade = origem.disponibilidade,
        observacao = origem.observacao,
        placa_veiculo = origem.placa_veiculo
    from public.programacao_colaboradores origem
    where origem.programacao_id = p_programacao_id
      and destino.programacao_id = v_destino_id
      and destino.colaborador_id = origem.colaborador_id;

    -- Reconciliação defensiva da equipe por O.S. A função-base já deveria
    -- copiar estes vínculos, mas alguns destinos ficavam apenas com o roster
    -- de colaboradores e nenhuma linha em programacao_equipe. Esta etapa é
    -- idempotente e repõe somente os pares que estiverem faltando.
    insert into public.programacao_equipe (
      programacao_id, os_id, colaborador_id, nome_colaborador, score,
      score_contrato, score_distancia, score_auditoria, km_estimado, confirmado,
      ordem_rota, duracao_min, rota_geometria, rota_calculada_em
    )
    select
      v_destino_id, origem.os_id, origem.colaborador_id, origem.nome_colaborador,
      origem.score, origem.score_contrato, origem.score_distancia,
      origem.score_auditoria, origem.km_estimado, origem.confirmado,
      origem.ordem_rota, origem.duracao_min, null, null
    from public.programacao_equipe origem
    where origem.programacao_id = p_programacao_id
    on conflict (programacao_id, os_id, colaborador_id) do nothing;

    update public.programacao_dia
    set updated_at = clock_timestamp()
    where id = v_destino_id;
  end loop;

  return v_resultado;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.duplicar_programacao_dia_base_20260813(p_programacao_id uuid, p_datas date[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_origem public.programacao_dia%rowtype;
  v_data date;
  v_destino_id uuid;
  v_copiadas date[] := '{}';
  v_ignoradas date[] := '{}';
  v_datas date[];
  v_delta integer;
  v_tem_conteudo boolean;
  v_grupo record;
  v_nova_solicitacao_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'É necessário estar autenticado para duplicar uma programação.' using errcode = '42501';
  end if;

  select * into v_origem
  from public.programacao_dia
  where id = p_programacao_id;

  if not found then
    raise exception 'Programação de origem não encontrada.' using errcode = 'P0002';
  end if;

  if v_origem.supervisao is null or not exists (
    select 1
    from public.programacao_listar_supervisoes() permitida
    where upper(trim(permitida.nome)) = upper(trim(v_origem.supervisao))
  ) then
    raise exception 'Você não tem acesso à supervisão desta programação.' using errcode = '42501';
  end if;

  select coalesce(array_agg(data order by data), '{}') into v_datas
  from (select distinct unnest(coalesce(p_datas, '{}')) as data) escolhidas
  where data is not null and data <> v_origem.data_referencia;

  if coalesce(array_length(v_datas, 1), 0) = 0 then
    raise exception 'Selecione ao menos uma data diferente da data de origem.';
  end if;
  if array_length(v_datas, 1) > 5 then
    raise exception 'Selecione no máximo 5 datas.';
  end if;

  foreach v_data in array v_datas loop
    perform pg_advisory_xact_lock(hashtextextended(coalesce(v_origem.supervisao, '') || '|' || v_data::text, 0));

    select id into v_destino_id
    from public.programacao_dia
    where data_referencia = v_data
      and supervisao is not distinct from v_origem.supervisao
    order by created_at desc
    limit 1;

    if v_destino_id is not null then
      -- `programacao_colaboradores` sozinho NÃO conta como "conteúdo real":
      -- é o roster shell que o simples "Carregar" já cria automaticamente.
      -- Só bloqueia a duplicação se já existir equipe/estadia/alimentação/
      -- deslocamento/despesa/frota de verdade nesse destino.
      select exists(select 1 from public.programacao_equipe where programacao_id = v_destino_id)
        or exists(select 1 from public.programacao_estadia where programacao_id = v_destino_id)
        or exists(select 1 from public.programacao_alimentacao where programacao_id = v_destino_id)
        or exists(select 1 from public.programacao_deslocamento where programacao_id = v_destino_id)
        or exists(select 1 from public.programacao_extras where programacao_id = v_destino_id)
        or exists(select 1 from public.programacao_frota_vinculos where programacao_id = v_destino_id)
      into v_tem_conteudo;

      if v_tem_conteudo then
        v_ignoradas := array_append(v_ignoradas, v_data);
        continue;
      end if;
    else
      insert into public.programacao_dia (
        data_referencia, coordenacao, supervisao, regional, status, criado_por
      ) values (
        v_data, v_origem.coordenacao, v_origem.supervisao, v_origem.regional, 'rascunho', (select auth.uid())
      ) returning id into v_destino_id;
    end if;

    v_delta := v_data - v_origem.data_referencia;

    insert into public.programacao_colaboradores (
      programacao_id, data_referencia, colaborador_id, nome_colaborador, cargo,
      coordenacao, supervisao, disponibilidade, observacao, placa_veiculo
    )
    select v_destino_id, v_data, colaborador_id, nome_colaborador, cargo,
      coordenacao, supervisao, disponibilidade, observacao, placa_veiculo
    from public.programacao_colaboradores
    where programacao_id = p_programacao_id
    on conflict (programacao_id, colaborador_id) do nothing;

    insert into public.programacao_equipe (
      programacao_id, os_id, colaborador_id, nome_colaborador, score,
      score_contrato, score_distancia, score_auditoria, km_estimado, confirmado,
      ordem_rota, duracao_min, rota_geometria, rota_calculada_em
    )
    select v_destino_id, os_id, colaborador_id, nome_colaborador, score,
      score_contrato, score_distancia, score_auditoria, km_estimado, confirmado,
      ordem_rota, duracao_min, null, null
    from public.programacao_equipe
    where programacao_id = p_programacao_id;

    insert into public.programacao_estadia (
      programacao_id, data_referencia, colaborador_id, nome_colaborador, tem_estadia,
      tipo_estadia, cidade, uf, diarias, checkin, checkout, observacao,
      alojamento_id, alojamento_nome
    )
    select v_destino_id, v_data, colaborador_id, nome_colaborador, tem_estadia,
      tipo_estadia, cidade, uf, diarias,
      case when checkin is null then null else checkin + v_delta end,
      case when checkout is null then null else checkout + v_delta end,
      observacao, alojamento_id, alojamento_nome
    from public.programacao_estadia
    where programacao_id = p_programacao_id;

    -- Cria a solicitação de hospedagem para as estadias HOTEL recém-copiadas.
    for v_grupo in (
      with candidatos as (
        select pe.nome_colaborador, trim(pe.cidade) as cidade, pe.uf, pe.checkin, pe.checkout
        from public.programacao_estadia pe
        where pe.programacao_id = v_destino_id
          and pe.tipo_estadia = 'HOTEL'
          and pe.checkin is not null
          and pe.checkout is not null
      ),
      matches as (
        select distinct on (c.nome_colaborador, c.checkin)
          c.nome_colaborador, c.checkin, hr.solicitacao_id as reserva_solicitacao_id
        from candidatos c
        join public.hospedagem_solicitacao_colaboradores hc on hc.nome_colaborador = c.nome_colaborador
        join public.hospedagem_reservas hr on hr.solicitacao_id = hc.solicitacao_id
        where hr.status_hospedagem in ('CHECKIN_PREVISTO', 'HOSPEDADO')
          and upper(trim(hr.cidade_hotel)) = upper(c.cidade)
          and (nullif(trim(hr.uf_hotel),'') is null or nullif(trim(c.uf),'') is null or upper(trim(hr.uf_hotel)) = upper(trim(c.uf)))
          and hr.data_checkout between c.checkin - 1 and c.checkin
        order by c.nome_colaborador, c.checkin, hr.data_checkout desc
      )
      select c.cidade, c.uf, c.checkin, c.checkout, m.reserva_solicitacao_id,
        min(c.nome_colaborador) as primeiro_colaborador
      from candidatos c
      left join matches m on m.nome_colaborador = c.nome_colaborador and m.checkin = c.checkin
      group by c.cidade, c.uf, c.checkin, c.checkout, m.reserva_solicitacao_id
    ) loop
      insert into public.hospedagem_solicitacoes (
        programacao_id, data_solicitacao, solicitante_id, solicitante_nome, solicitante_email,
        coordenacao, supervisao, regional, cidade, uf,
        data_checkin_prevista, data_checkout_prevista, quantidade_diarias_prevista,
        observacao_gestor, status_solicitacao
      ) values (
        v_destino_id, v_grupo.checkin, (select auth.uid()),
        (select nome from public.app_usuarios where auth_user_id = (select auth.uid()) limit 1),
        (select email from public.app_usuarios where auth_user_id = (select auth.uid()) limit 1),
        v_origem.coordenacao, v_origem.supervisao, v_origem.regional, v_grupo.cidade, v_grupo.uf,
        v_grupo.checkin, v_grupo.checkout, (v_grupo.checkout - v_grupo.checkin),
        'Solicitação automática via Programação — ' || v_grupo.primeiro_colaborador
          || '. (Duplicada automaticamente a partir da programação de ' || to_char(v_origem.data_referencia, 'DD/MM/YYYY') || '.)',
        'SOLICITADA'
      ) returning id into v_nova_solicitacao_id;

      insert into public.hospedagem_solicitacao_colaboradores (solicitacao_id, nome_colaborador, supervisao, status_colaborador)
      select v_nova_solicitacao_id, pe.nome_colaborador, v_origem.supervisao, 'ATIVO'
      from public.programacao_estadia pe
      left join (
        select distinct on (hc.nome_colaborador, pe2.checkin)
          hc.nome_colaborador, pe2.checkin, hr.solicitacao_id as reserva_solicitacao_id
        from public.programacao_estadia pe2
        join public.hospedagem_solicitacao_colaboradores hc on hc.nome_colaborador = pe2.nome_colaborador
        join public.hospedagem_reservas hr on hr.solicitacao_id = hc.solicitacao_id
        where pe2.programacao_id = v_destino_id
          and pe2.tipo_estadia = 'HOTEL'
          and hr.status_hospedagem in ('CHECKIN_PREVISTO', 'HOSPEDADO')
          and upper(trim(hr.cidade_hotel)) = upper(trim(pe2.cidade))
          and (nullif(trim(hr.uf_hotel),'') is null or nullif(trim(pe2.uf),'') is null or upper(trim(hr.uf_hotel)) = upper(trim(pe2.uf)))
          and hr.data_checkout between pe2.checkin - 1 and pe2.checkin
        order by hc.nome_colaborador, pe2.checkin, hr.data_checkout desc
      ) pm on pm.nome_colaborador = pe.nome_colaborador and pm.checkin = pe.checkin
      where pe.programacao_id = v_destino_id
        and pe.tipo_estadia = 'HOTEL'
        and trim(pe.cidade) = v_grupo.cidade
        and pe.checkin = v_grupo.checkin
        and pe.checkout = v_grupo.checkout
        and pm.reserva_solicitacao_id is not distinct from v_grupo.reserva_solicitacao_id;
    end loop;

    insert into public.programacao_alimentacao (
      programacao_id, data_referencia, colaborador_id, nome_colaborador,
      cafe, almoco, janta, observacao
    )
    select v_destino_id, v_data, colaborador_id, nome_colaborador,
      cafe, almoco, janta, observacao
    from public.programacao_alimentacao
    where programacao_id = p_programacao_id;

    insert into public.programacao_deslocamento (
      programacao_id, data_referencia, colaborador_id, nome_colaborador,
      tipo_deslocamento, origem, destino, km, valor, observacao, placa_veiculo
    )
    select v_destino_id, v_data, colaborador_id, nome_colaborador,
      tipo_deslocamento, origem, destino, km, valor, observacao, placa_veiculo
    from public.programacao_deslocamento
    where programacao_id = p_programacao_id;

    insert into public.programacao_extras (
      programacao_id, data_referencia, colaborador_id, nome_colaborador,
      tipo_despesa, descricao, valor, observacao
    )
    select v_destino_id, v_data, colaborador_id, nome_colaborador,
      tipo_despesa, descricao, valor, observacao
    from public.programacao_extras
    where programacao_id = p_programacao_id;

    insert into public.programacao_frota_vinculos (
      chave_vinculo, programacao_id, data_referencia, frota_colaborador_id,
      frota_nome, placa_veiculo, tipo_atuacao, alvo_tipo, os_id,
      alvo_colaborador_id, alvo_colaborador_nome
    )
    select v_destino_id::text || ':' || id::text, v_destino_id, v_data,
      frota_colaborador_id, frota_nome, placa_veiculo, tipo_atuacao, alvo_tipo,
      os_id, alvo_colaborador_id, alvo_colaborador_nome
    from public.programacao_frota_vinculos
    where programacao_id = p_programacao_id;

    v_copiadas := array_append(v_copiadas, v_data);
  end loop;

  return jsonb_build_object('copiadas', to_jsonb(v_copiadas), 'ignoradas', to_jsonb(v_ignoradas));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enqueue_bfleet_condutor_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(new.motorista_atual, '') = '' then
    return new;
  end if;

  if tg_op = 'INSERT' or coalesce(old.motorista_atual, '') is distinct from coalesce(new.motorista_atual, '') then
    insert into public.frotas_bfleet_condutores_fila (
      veiculo_id,
      placa,
      motorista_atual,
      patrimonio_codigo,
      status,
      erro,
      updated_at
    ) values (
      new.id,
      new.placa,
      new.motorista_atual,
      coalesce(new.patrimonio_codigo::text, null),
      'PENDENTE',
      null,
      now()
    );

    update public.frotas_veiculos
       set bfleet_condutor_status = 'PENDENTE',
           bfleet_condutor_erro = null
     where id = new.id;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enqueue_grm_reabertura_os()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_enabled boolean;
  v_pending integer;
  v_job uuid;
begin
  select enabled into v_enabled
  from public.grm_sync_agent_settings
  where agent_id='sync-reabrir-os';

  if coalesce(v_enabled,false) is not true then
    return jsonb_build_object('ok',false,'motivo','AGENTE_DESATIVADO');
  end if;

  select count(*) into v_pending
  from public.grm_reabertura_os_fila
  where status='PENDENTE_REABERTURA'
    and coalesce(remanescente,0) > 30
    and dias_sem_embarque is not null
    and dias_sem_embarque < 10;

  if v_pending=0 then
    return jsonb_build_object(
      'ok',true,
      'enfileirado',false,
      'pendentes',0,
      'regra','FINALIZADAS_NAO_FATURADAS_REMANESCENTE_GT_30_DIAS_SEM_EMBARQUE_LT_10'
    );
  end if;

  if exists(
    select 1
    from public.grm_sync_jobs
    where agente_id='sync-reabrir-os'
      and status in ('pendente','rodando')
  ) then
    return jsonb_build_object(
      'ok',true,
      'enfileirado',false,
      'pendentes',v_pending,
      'motivo','JOB_JA_ABERTO',
      'regra','FINALIZADAS_NAO_FATURADAS_REMANESCENTE_GT_30_DIAS_SEM_EMBARQUE_LT_10'
    );
  end if;

  insert into public.grm_sync_jobs(agente_id,status)
  values ('sync-reabrir-os','pendente')
  returning id into v_job;

  return jsonb_build_object(
    'ok',true,
    'enfileirado',true,
    'job_id',v_job,
    'pendentes',v_pending,
    'regra','FINALIZADAS_NAO_FATURADAS_REMANESCENTE_GT_30_DIAS_SEM_EMBARQUE_LT_10'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enqueue_grm_reabertura_os_real(p_quantidade integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_enabled boolean;
  v_pending integer;
  v_qtd integer;
  v_inserted integer := 0;
begin
  select enabled into v_enabled
  from public.grm_sync_agent_settings
  where agent_id='sync-reabrir-os';

  if coalesce(v_enabled,false) is not true then
    return jsonb_build_object('ok',false,'motivo','AGENTE_DESATIVADO');
  end if;

  if exists (
    select 1
    from public.grm_sync_jobs
    where agente_id='sync-reabrir-os'
      and status in ('pendente','rodando')
  ) then
    return jsonb_build_object('ok',false,'motivo','JOB_REABERTURA_JA_ABERTO');
  end if;

  select count(*) into v_pending
  from public.grm_reabertura_os_fila
  where status='PENDENTE_REABERTURA'
    and coalesce(remanescente,0) > 30
    and dias_sem_embarque is not null
    and dias_sem_embarque < 10;

  if v_pending = 0 then
    return jsonb_build_object('ok',true,'enfileirados',0,'pendentes',0);
  end if;

  v_qtd := case
    when p_quantidade is null then v_pending
    else least(v_pending, greatest(1, least(p_quantidade, 500)))
  end;

  insert into public.grm_sync_jobs(
    agente_id,
    status,
    solicitado_por,
    payload
  )
  select
    'sync-reabrir-os',
    'pendente',
    'reabertura-os-real-v12',
    jsonb_build_object('mode','real')
  from generate_series(1, v_qtd);

  get diagnostics v_inserted = row_count;

  return jsonb_build_object(
    'ok',true,
    'modo','real_por_payload',
    'enfileirados',v_inserted,
    'pendentes_no_momento',v_pending,
    'regra','FINALIZADAS_NAO_FATURADAS_REMANESCENTE_GT_30_DIAS_SEM_EMBARQUE_LT_10'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enqueue_grm_sync_job_internal(p_agent_id text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_job_id uuid;
  v_enabled boolean;
  v_lane text;
begin
  if nullif(btrim(p_agent_id), '') is null then
    raise exception 'agent_id obrigatório';
  end if;

  perform pg_advisory_xact_lock(872634503);

  select s.enabled, public.grm_sync_lane_for_agent(s.agent_id)
    into v_enabled, v_lane
  from public.grm_sync_agent_settings s
  where s.agent_id = p_agent_id;

  if not found then
    raise exception 'Agente não configurado em grm_sync_agent_settings: %', p_agent_id;
  end if;

  if coalesce(v_enabled, false) is not true then
    return null;
  end if;

  select j.id
    into v_job_id
  from public.grm_sync_jobs j
  where j.agente_id = p_agent_id
    and j.status in ('pendente','rodando')
  order by case when j.status = 'rodando' then 0 else 1 end,
           j.created_at asc
  limit 1;

  if v_job_id is not null then
    return v_job_id;
  end if;

  insert into public.grm_sync_jobs (
    agente_id,
    status,
    lane,
    pipeline_seq,
    payload
  ) values (
    p_agent_id,
    'pendente',
    v_lane,
    nextval('public.grm_fixed_pipeline_seq'),
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_job_id;

  return v_job_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enqueue_grm_sync_queue(p_agent_ids text[])
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_agent_id text;
  v_created integer := 0;
  v_allowed constant text[] := array[
    'sync-colaboradores','sync-lista-os','sync-patrimonios','sync-nhe',
    'sync-operacional-os','sync-distribuicao-os','sync-producao-diaria',
    'sync-locais-embarque','sync-resultado-diario','sync-despesas',
    'sync-notas-fiscais','sync-mapa-embarque','sync-contas-pagar',
    'sync-contas-receber','sync-auditorias','sync-cargas-geofence',
    'sync-btg-relatorios','sync-adiantamentos','botconversa-sync'
  ];
begin
  if coalesce(array_length(p_agent_ids, 1), 0) = 0 then return 0; end if;
  if not public.painel_has_module(array['TI_AGENTES', 'TI'], true) then
    raise exception 'Você não tem permissão para abrir uma fila.' using errcode = '42501';
  end if;
  if array_length(p_agent_ids, 1) > 50 then
    raise exception 'Uma nova fila pode conter no máximo 50 agentes.';
  end if;

  perform pg_advisory_xact_lock(872634503);

  foreach v_agent_id in array p_agent_ids loop
    if not (v_agent_id = any(v_allowed)) then
      raise exception 'Agente não permitido na esteira fixa: %', v_agent_id;
    end if;
    insert into public.grm_sync_jobs (agente_id, status, lane, pipeline_seq)
    values (
      v_agent_id,
      'pendente',
      public.grm_sync_lane_for_agent(v_agent_id),
      nextval('public.grm_fixed_pipeline_seq')
    );
    v_created := v_created + 1;
  end loop;
  return v_created;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enqueue_next_grm_fixed_job()
 RETURNS grm_sync_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_job public.grm_sync_jobs;
begin
  perform public.ensure_grm_scheduled_agents();
  select * into v_job
  from public.grm_sync_jobs
  where status = 'pendente' and lane in ('fixed_a','fixed_b','fixed_c')
  order by pipeline_seq
  limit 1;
  return v_job;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_grm_fixed_pipeline_capacity()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ begin return public.ensure_grm_scheduled_agents(); end; $function$
;

CREATE OR REPLACE FUNCTION public.ensure_grm_scheduled_agents()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_created integer := 0;
begin
  perform pg_advisory_xact_lock(872634504);
  insert into public.grm_sync_jobs (agente_id,status,lane,pipeline_seq)
  select settings.agent_id, 'pendente', settings.queue_lane, nextval('public.grm_fixed_pipeline_seq')
  from public.grm_sync_agent_settings settings
  where settings.enabled and settings.interval_minutes > 0
    and not exists (select 1 from public.grm_sync_jobs open_job where open_job.agente_id=settings.agent_id and open_job.status in ('pendente','rodando'))
    and coalesce((select max(coalesce(done.finalizado_em,done.created_at)) from public.grm_sync_jobs done where done.agente_id=settings.agent_id and done.status in ('sucesso','erro','parcial')), '-infinity'::timestamptz)
        <= now() - make_interval(mins => settings.interval_minutes);
  get diagnostics v_created = row_count;
  return v_created;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.equipe_estrutura_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.equipe_listar_usuarios()
 RETURNS TABLE(id uuid, nome text, email text, setor text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select u.id, u.nome, u.email, u.setor
  from public.app_usuarios u
  where auth.uid() is not null
    and public.painel_has_module(array['equipe'], false)
    and lower(coalesce(u.status, 'ativo')) = 'ativo'
  order by u.nome nulls last, u.email;
$function$
;

CREATE OR REPLACE FUNCTION public.extrair_placa_texto(p_texto text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select nullif(substring(upper(coalesce(p_texto, '')) from '([A-Z]{3}[0-9][A-Z0-9][0-9]{2})'), '');
$function$
;

CREATE OR REPLACE FUNCTION public.faturamento_sync_grm(p_dias integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_importadas integer := 0;
  v_atualizadas integer := 0;
  v_baixadas integer := 0;
  v_clientes integer := 0;
begin
  -- Snapshot deduplicado das sincronizações recentes do GRM
  create temp table _grm_snap on commit drop as
  select distinct on ((dados_json->>'rinCode'))
         (dados_json->>'rinCode')                          as rin_code,
         (dados_json->>'bilCode')                          as bil_code,
         (dados_json->>'biiNumber')                        as bii_number,
         (dados_json->>'cliCode')                          as cli_code,
         coalesce(dados_json->>'cliName','(sem cliente)')  as cli_name,
         coalesce((dados_json->>'rinTotalValue')::numeric, (dados_json->>'rinValue')::numeric, 0) as valor,
         coalesce((dados_json->>'rinDiscount')::numeric,0) + coalesce((dados_json->>'rinDiscountGranted')::numeric,0) as descontos,
         nullif(dados_json->>'rinDueDate','')::date        as vencimento,
         nullif(substring(dados_json->>'biiDate',1,10),'')::date as emissao,
         dados_json->>'rinStatus'                          as rin_status,
         nullif(substring(dados_json->>'rinPaidDate',1,10),'')::date as pago_em,
         coalesce(dados_json->'biiFile'->0->>'biiFile','') as arquivo_pdf,
         data_sincronizacao
  from grm_contas_receber_importacoes
  where data_sincronizacao > now() - make_interval(days => greatest(p_dias,1))
  order by (dados_json->>'rinCode'), data_sincronizacao desc;

  -- 2a) Upsert de clientes vindos do GRM
  insert into faturamento_clientes (id, nome, periodicidade, status, observacoes, created_at, updated_at)
  select distinct on (cli_code) 'grm-cli-'||cli_code, cli_name, 'Mensal', 'Ativo', 'Importado automaticamente do GRM', now(), now()
  from _grm_snap
  where cli_code is not null
  order by cli_code, data_sincronizacao desc
  on conflict (id) do update set nome = excluded.nome, updated_at = now();
  get diagnostics v_clientes = row_count;

  -- 2b) Insere faturas em aberto que ainda não existem no painel
  insert into faturamento_faturas (
    id, codigo, cliente_id, cliente_nome, periodicidade, periodo,
    valor_bruto, descontos, valor_liquido, prazo_envio, prazo_retorno,
    status, prioridade, canal_envio, observacoes, created_at, updated_at
  )
  select
    'grm-'||s.rin_code,
    'GRM-'||coalesce(s.bil_code, s.rin_code),
    'grm-cli-'||coalesce(s.cli_code,'0'),
    s.cli_name,
    'Mensal',
    coalesce(to_char(s.emissao,'TMMonth/YYYY'), to_char(now(),'TMMonth/YYYY')),
    s.valor,
    s.descontos,
    greatest(s.valor - s.descontos, 0),
    coalesce(s.emissao, current_date),
    coalesce(s.vencimento, current_date + 2),
    'Sem responsável',
    case when s.vencimento is not null and s.vencimento < current_date then 'Urgente' else 'Normal' end,
    '',
    trim(concat_ws(' · ',
      'Conta GRM '||s.rin_code,
      case when s.bii_number is not null and s.bii_number <> '' then 'NF '||s.bii_number end,
      case when s.arquivo_pdf <> '' then s.arquivo_pdf end
    )),
    now(), now()
  from _grm_snap s
  where s.rin_status = 'A'
  on conflict (id) do nothing;
  get diagnostics v_importadas = row_count;

  -- 2c) Atualiza valores/vencimentos das faturas GRM ainda abertas
  update faturamento_faturas f
  set valor_bruto = s.valor,
      descontos = s.descontos,
      valor_liquido = greatest(s.valor - s.descontos, 0),
      prazo_retorno = coalesce(s.vencimento, f.prazo_retorno),
      cliente_nome = s.cli_name,
      updated_at = now()
  from _grm_snap s
  where f.id = 'grm-'||s.rin_code
    and s.rin_status = 'A'
    and f.status not in ('Finalizada','Cancelada')
    and (f.valor_bruto is distinct from s.valor
      or f.descontos is distinct from s.descontos
      or f.prazo_retorno is distinct from s.vencimento
      or f.cliente_nome is distinct from s.cli_name);
  get diagnostics v_atualizadas = row_count;

  -- 2d) Baixa automática: fatura paga/baixada no GRM sai da rotina
  update faturamento_faturas f
  set status = 'Finalizada',
      observacoes = trim(both ' ·' from coalesce(f.observacoes,'')) ||
                    ' · Baixada no GRM em '||coalesce(to_char(s.pago_em,'DD/MM/YYYY'), to_char(now(),'DD/MM/YYYY')),
      ultimo_retorno_em = coalesce(s.pago_em::timestamptz, now()),
      updated_at = now()
  from _grm_snap s
  where f.id = 'grm-'||s.rin_code
    and s.rin_status = 'P'
    and f.status not in ('Finalizada','Cancelada');
  get diagnostics v_baixadas = row_count;

  return jsonb_build_object(
    'ok', true,
    'janela_dias', p_dias,
    'faturas_importadas', v_importadas,
    'faturas_atualizadas', v_atualizadas,
    'faturas_baixadas', v_baixadas,
    'clientes_upsert', v_clientes,
    'executado_em', now()
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finalizar_grm_reabertura_os(p_fila_id uuid, p_status text, p_erro text DEFAULT NULL::text, p_observacao text DEFAULT NULL::text)
 RETURNS grm_reabertura_os_fila
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.grm_reabertura_os_fila;
  v_requested text := upper(trim(coalesce(p_status,'')));
  v_status text;
begin
  v_status := case v_requested
    when 'JA_REABERTA' then 'REABERTA'
    when 'ERRO_REABERTURA' then 'ERRO'
    when 'PROCESSANDO' then 'EM_REABERTURA'
    else v_requested
  end;

  if v_status not in ('PENDENTE_REABERTURA','EM_REABERTURA','REABERTA','IGNORADA','ERRO','RESOLVIDA_SEM_REABERTURA','REVISAO_MANUAL') then
    raise exception 'Status inválido para reabertura: %', p_status;
  end if;

  update public.grm_reabertura_os_fila
  set status=v_status,
      erro=nullif(p_erro,''),
      observacao=coalesce(nullif(p_observacao,''),observacao),
      reaberto_em=case when v_status='REABERTA' then coalesce(reaberto_em,now()) else reaberto_em end,
      updated_at=now()
  where id=p_fila_id
  returning * into v_row;

  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_habilitar_auditoria(p_tabela text, p_modulo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS trg_auditoria ON %I', p_tabela);
  EXECUTE format(
    'CREATE TRIGGER trg_auditoria
       AFTER INSERT OR UPDATE OR DELETE ON %I
       FOR EACH ROW EXECUTE FUNCTION fn_registrar_auditoria(%L)',
    p_tabela, COALESCE(p_modulo, p_tabela)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_registrar_auditoria()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old      jsonb;
  v_new      jsonb;
  v_campos   text[];
  v_registro text;
  v_modulo   text;
BEGIN
  v_modulo := COALESCE(TG_ARGV[0], TG_TABLE_NAME);

  IF TG_OP = 'INSERT' THEN
    v_new      := to_jsonb(NEW);
    v_registro := COALESCE(v_new->>'id', NULL);
  ELSIF TG_OP = 'UPDATE' THEN
    v_old      := to_jsonb(OLD);
    v_new      := to_jsonb(NEW);
    v_registro := COALESCE(v_new->>'id', v_old->>'id');
    SELECT COALESCE(array_agg(key), '{}') INTO v_campos
    FROM jsonb_each(v_new) AS n(key, value)
    WHERE v_old->key IS DISTINCT FROM value
      AND key NOT IN ('updated_at', 'created_at');
    -- UPDATE sem mudança real (ex.: touch de updated_at) não gera ruído.
    IF v_campos = '{}' THEN
      RETURN NEW;
    END IF;
    -- Guarda apenas os campos que mudaram, não a linha inteira.
    SELECT jsonb_object_agg(key, v_old->key), jsonb_object_agg(key, v_new->key)
      INTO v_old, v_new
    FROM unnest(v_campos) AS key;
  ELSE
    v_old      := to_jsonb(OLD);
    v_registro := COALESCE(v_old->>'id', NULL);
  END IF;

  INSERT INTO app_auditoria (
    usuario_id, usuario_email, modulo, tabela, registro_id,
    acao, valor_anterior, valor_novo, campos_alterados, origem
  ) VALUES (
    auth.uid(),
    COALESCE(auth.jwt()->>'email', NULL),
    v_modulo,
    TG_TABLE_NAME,
    v_registro,
    TG_OP,
    v_old,
    v_new,
    v_campos,
    'banco'
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  -- Auditoria nunca pode derrubar a operação de negócio.
  RAISE WARNING 'fn_registrar_auditoria falhou em %.%: %', TG_TABLE_NAME, TG_OP, SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fob_lote_recente(p_table text, p_dias integer DEFAULT 3)
 RETURNS TABLE(id uuid, dados_json jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_table text;
begin
  -- Só movimentação/NHE (volume pequeno o bastante pra baixar a janela
  -- inteira). Produção usa fob_producao_lote_vencedor (ver abaixo).
  v_table := case p_table
    when 'grm_mapa_embarque_importacoes' then p_table
    when 'grm_nhe_importacoes'           then p_table
    else null
  end;
  if v_table is null then
    raise exception 'Tabela nao permitida no fob_lote_recente: %', p_table;
  end if;

  p_dias := greatest(1, least(coalesce(p_dias, 3), 30));

  return query execute format($f$
    select t.id, t.dados_json, t.created_at
    from public.%I t
    where t.created_at >= now() - make_interval(days => $1)
    order by t.created_at desc
  $f$, v_table)
  using p_dias;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fob_producao_lote_vencedor(p_referencia_ddmmyyyy text, p_dias integer DEFAULT 3, p_gap_minutos integer DEFAULT 20)
 RETURNS TABLE(id uuid, dados_json jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lote_inicio timestamptz;
  v_lote_fim    timestamptz;
  v_referencia  date;
begin
  p_dias := greatest(1, least(coalesce(p_dias, 3), 14));
  p_gap_minutos := greatest(5, least(coalesce(p_gap_minutos, 20), 180));
  v_referencia := to_date(p_referencia_ddmmyyyy, 'DD/MM/YYYY');

  with linhas as (
    select
      t.created_at as ca,
      (case
        when t.dados_json->>'Data' ~ '^\d{4}-\d{2}-\d{2}$' then (t.dados_json->>'Data')::date
        when t.dados_json->>'Data' ~ '^\d{1,2}/\d{1,2}/\d{4}$' then to_date(t.dados_json->>'Data', 'DD/MM/YYYY')
        else null
      end = v_referencia) as bate
    from public.grm_producao_diaria_importacoes t
    where t.created_at >= now() - make_interval(days => p_dias)
  ),
  marcado as (
    select ca, bate, lag(ca) over (order by ca) as anterior
    from linhas
  ),
  ilhas as (
    select *,
      sum(case when anterior is null or ca - anterior > make_interval(mins => p_gap_minutos) then 1 else 0 end)
        over (order by ca) as lote_id
    from marcado
  )
  select min(ca), max(ca)
  into v_lote_inicio, v_lote_fim
  from ilhas
  group by lote_id
  having count(*) filter (where bate) > 0
  order by count(*) filter (where bate) desc, max(ca) desc
  limit 1;

  if v_lote_inicio is null then
    return;
  end if;

  return query
    select t.id, t.dados_json, t.created_at
    from public.grm_producao_diaria_importacoes t
    where t.created_at >= v_lote_inicio and t.created_at <= v_lote_fim
    order by t.id desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.frotas_motorista_em_data(p_veiculo_id uuid, p_data date)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(
    (
      select h.motorista
      from public.frotas_veiculos_historico h
      where h.veiculo_id = p_veiculo_id
        and h.data_inicio <= (p_data + interval '1 day')
        and (h.data_fim is null or h.data_fim > p_data::timestamptz)
      order by h.data_inicio desc
      limit 1
    ),
    (select v.motorista_atual from public.frotas_veiculos v where v.id = p_veiculo_id)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.frotas_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.geocode_colaborador_base_pendentes()
 RETURNS TABLE(colaborador_id uuid, cpf text, nome text, nome_chave text, cep text, cidade text, estado text, endereco text, bairro text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ativos as (
    select
      c.id, regexp_replace(coalesce(c.cpf,''), '\D', '', 'g') as cpf_norm,
      c.nome, c.cep, c.cidade, c.estado, c.endereco, c.bairro,
      upper(regexp_replace(translate(coalesce(c.nome, ''), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ', 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'), '[^A-Za-z0-9]+', ' ', 'g')) as nc
    from public.colaboradores c
    where upper(translate(coalesce(c.situacao, ''), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ', 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')) not in ('NAO ATIVO', 'NAO ATIVA', 'INATIVO', 'INATIVA', 'DESLIGADO', 'DESLIGADA', 'DEMITIDO', 'DEMITIDA')
      and coalesce(c.desligamento, '') = ''
      and regexp_replace(coalesce(c.cpf,''), '\D', '', 'g') <> ''
  ),
  sem_base as (
    select a.* from ativos a
    where not exists (
      select 1 from public.operacional_colaborador_base b
      where b.ativo is true and regexp_replace(coalesce(b.cpf,''), '\D', '', 'g') = a.cpf_norm
    )
    and a.nc <> ''
    and not exists (
      select 1 from public.operacional_colaborador_base b2
      where b2.nome_chave = a.nc and b2.ativo is true
    )
  ),
  com_dado_geo as (
    select * from sem_base
    where length(regexp_replace(coalesce(cep,''), '\D', '', 'g')) = 8
       or (coalesce(cidade,'') <> '' and coalesce(estado,'') <> '')
  ),
  dedup as (
    select distinct on (nc) *
    from com_dado_geo
    order by nc
  )
  select id, cpf_norm, nome, nc, cep, cidade, estado, endereco, bairro
  from dedup;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_context(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with u as (
    select
      p.id,
      p.full_name,
      p.email,
      p.role,
      p.active,
      p.is_master,
      d.id as department_id,
      d.name as department_name
    from public.profiles p
    left join public.departments d on d.id = p.department_id
    where p.id = p_user_id
  ),
  mods as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'code', m.code,
          'name', m.name,
          'can_view', coalesce(um.can_view, false),
          'can_edit', coalesce(um.can_edit, false)
        )
        order by m.name
      ),
      '[]'::jsonb
    ) as modules
    from public.modules m
    left join public.user_modules um
      on um.module_code = m.code
     and um.user_id = p_user_id
  )
  select jsonb_build_object(
    'user', jsonb_build_object(
      'id', u.id,
      'name', coalesce(u.full_name, u.email, 'Usuário'),
      'email', u.email,
      'role', coalesce(u.role, 'user'),
      'active', coalesce(u.active, false),
      'is_master', coalesce(u.is_master, false)
    ),
    'department', case
      when u.department_id is null then null
      else jsonb_build_object('id', u.department_id, 'name', u.department_name)
    end,
    'modules', mods.modules
  )
  from u cross join mods;
$function$
;

CREATE OR REPLACE FUNCTION public.gin_extract_query_trgm(text, internal, smallint, internal, internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_extract_query_trgm$function$
;

CREATE OR REPLACE FUNCTION public.gin_extract_value_trgm(text, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_extract_value_trgm$function$
;

CREATE OR REPLACE FUNCTION public.gin_trgm_consistent(internal, smallint, text, integer, internal, internal, internal, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_trgm_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gin_trgm_triconsistent(internal, smallint, text, integer, internal, internal, internal)
 RETURNS "char"
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_trgm_triconsistent$function$
;

CREATE OR REPLACE FUNCTION public.grm_cafe_login_valido(p_data date, p_programacao_id text, p_versao_id uuid, p_colaborador_id text, p_cpf text, p_nome text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with prog_ids as (
  select nullif(trim(p_programacao_id), '')::uuid as id
  where nullif(trim(p_programacao_id), '') is not null
    and trim(p_programacao_id) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  union
  select pid::uuid
  from public.grm_despesas_versoes v,
       jsonb_array_elements_text(coalesce(v.programacao_ids, '[]'::jsonb)) pid
  where v.id = p_versao_id
    and pid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
),
ident as (
  select
    regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g') as cpf,
    upper(unaccent(regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g'))) as nome,
    coalesce(p_colaborador_id, '') as colaborador_id
),
cafe_programado as (
  select 1
  from public.programacao_alimentacao pa
  join prog_ids pi on pi.id = pa.programacao_id
  cross join ident i
  where pa.data_referencia = p_data
    and pa.cafe is true
    and (
      pa.colaborador_id = i.colaborador_id
      or (
        length(i.cpf) = 11
        and regexp_replace(coalesce(pa.colaborador_id, ''), '\D', '', 'g') = i.cpf
      )
      or upper(unaccent(regexp_replace(trim(coalesce(pa.nome_colaborador, '')), '\s+', ' ', 'g'))) = i.nome
    )
  limit 1
),
pontos as (
  select distinct
    peq.programacao_id,
    peq.os_id,
    coalesce(pe.latitude, o.ponto1_latitude)::double precision as ponto_lat,
    coalesce(pe.longitude, o.ponto1_longitude)::double precision as ponto_lon,
    upper(coalesce(nullif(pe.uf, ''), nullif(substring(trim(coalesce(o.embarque, '')) from '^([A-Za-z]{2})'), ''))) as ponto_uf
  from public.programacao_equipe peq
  join prog_ids pi on pi.id = peq.programacao_id
  join public.operacional_os o on o.id = peq.os_id
  left join public.operacional_pontos_embarque pe on pe.id = o.ponto_embarque_id
  cross join ident i
  where peq.confirmado is true
    and peq.os_id is not null
    and coalesce(pe.latitude, o.ponto1_latitude) is not null
    and coalesce(pe.longitude, o.ponto1_longitude) is not null
    and (
      peq.colaborador_id = i.colaborador_id
      or (
        length(i.cpf) = 11
        and regexp_replace(coalesce(peq.colaborador_id, ''), '\D', '', 'g') = i.cpf
      )
      or upper(unaccent(regexp_replace(trim(coalesce(peq.nome_colaborador, '')), '\s+', ' ', 'g'))) = i.nome
    )
),
logins as (
  select l.*
  from public.grm_login_movimentos_importacoes l
  cross join ident i
  where l.data_movimento = p_data
    and l.latitude is not null
    and l.longitude is not null
    and (
      (length(i.cpf) = 11 and regexp_replace(coalesce(l.cpf, ''), '\D', '', 'g') = i.cpf)
      or upper(unaccent(regexp_replace(trim(coalesce(l.colaborador, '')), '\s+', ' ', 'g'))) = i.nome
    )
),
validos as (
  select 1
  from pontos p
  join logins l on true
  where
    case
      when coalesce(nullif(p.ponto_uf, ''), upper(coalesce(l.uf_embarque, ''))) in ('MT','MS','RO')
        then (l.hora_movimento - interval '1 hour')::time
      else l.hora_movimento
    end >= time '04:00:00'
    and case
      when coalesce(nullif(p.ponto_uf, ''), upper(coalesce(l.uf_embarque, ''))) in ('MT','MS','RO')
        then (l.hora_movimento - interval '1 hour')::time
      else l.hora_movimento
    end < time '07:00:00'
    and (
      6371 * 2 * asin(sqrt(
        power(sin(radians((p.ponto_lat - l.latitude::double precision) / 2)), 2)
        + cos(radians(l.latitude::double precision)) * cos(radians(p.ponto_lat))
        * power(sin(radians((p.ponto_lon - l.longitude::double precision) / 2)), 2)
      ))
    ) <= 1.0
  limit 1
)
select exists(select 1 from cafe_programado)
   and exists(select 1 from validos);
$function$
;

CREATE OR REPLACE FUNCTION public.grm_create_staging_table(p_table text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_allowed text[] := array[
    'relatorio_resultado_diario',
    'producao_snapshot',
    'colaborador_cruzamento',
    'logistica_btg_solicitacoes'
  ];
  v_staging text := p_table || '_staging';
begin
  if not p_table = any(v_allowed) then
    raise exception 'Tabela % não autorizada para staging GRM', p_table;
  end if;

  if to_regclass(format('public.%I', p_table)) is null then
    raise exception 'Tabela final public.% não existe', p_table;
  end if;

  if to_regclass(format('public.%I', v_staging)) is null then
    execute format(
      'create table public.%I (like public.%I including defaults including generated including identity)',
      v_staging,
      p_table
    );
  end if;

  execute format('alter table public.%I enable row level security', v_staging);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.grm_despesas_estado_guard_programacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.versao_desejada_id is not null and new.data_referencia is not null then
    new.regras_desejadas := public.grm_filtrar_regras_programacao(
      new.versao_desejada_id,
      new.data_referencia,
      new.colaborador_id,
      new.nome,
      new.regras_desejadas
    );

    if jsonb_array_length(coalesce(new.regras_desejadas, '[]'::jsonb)) = 0 then
      new.deve_liberar := false;
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.grm_despesas_fila_guard_programacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.acao = 'APLICAR' then
    new.regras := public.grm_filtrar_regras_programacao(
      new.versao_id,
      new.data_referencia,
      new.colaborador_id,
      new.nome,
      new.regras
    );

    if jsonb_array_length(coalesce(new.regras, '[]'::jsonb)) = 0 then
      new.acao := 'LIMPAR';
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.grm_despesas_status_por_colaborador(p_colaborador_ids text[])
 RETURNS TABLE(colaborador_id text, data_referencia date, status_aplicacao text, aplicado_em timestamp with time zone, houve_alteracao boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    estado.cpf as colaborador_id,
    estado.data_referencia,
    estado.status_aplicacao,
    estado.aplicado_em,
    case
      when fila.status in ('APLICADO', 'LIMPO')
        then (fila.diagnostico ->> 'changed')::boolean
      else null
    end as houve_alteracao
  from public.grm_despesas_estado_colaborador estado
  left join lateral (
    select f.status, f.diagnostico
    from public.grm_despesas_fila f
    where f.cpf = estado.cpf
      and f.data_referencia = estado.data_referencia
    order by f.created_at desc
    limit 1
  ) fila on true
  where estado.cpf = any(p_colaborador_ids);
$function$
;

CREATE OR REPLACE FUNCTION public.grm_despesas_status_por_colaborador(p_colaborador_ids text[], p_data_min date DEFAULT NULL::date, p_data_max date DEFAULT NULL::date)
 RETURNS TABLE(colaborador_id text, data_referencia date, status_aplicacao text, aplicado_em timestamp with time zone, houve_alteracao boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    estado.cpf as colaborador_id,
    estado.data_referencia,
    estado.status_aplicacao,
    estado.aplicado_em,
    case
      when fila.status in ('APLICADO', 'LIMPO')
        then (fila.diagnostico ->> 'changed')::boolean
      else null
    end as houve_alteracao
  from public.grm_despesas_estado_colaborador estado
  left join lateral (
    select f.status, f.diagnostico
    from public.grm_despesas_fila f
    where f.cpf = estado.cpf
      and f.data_referencia = estado.data_referencia
    order by f.created_at desc
    limit 1
  ) fila on true
  where estado.cpf = any(p_colaborador_ids)
    and (p_data_min is null or estado.data_referencia >= p_data_min)
    and (p_data_max is null or estado.data_referencia <= p_data_max);
$function$
;

CREATE OR REPLACE FUNCTION public.grm_despesas_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.grm_diaria_programacao_valida(p_data date, p_colaborador_id text, p_nome text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.programacao_equipe pe
    join public.programacao_dia pd on pd.id = pe.programacao_id
    where pd.data_referencia = p_data
      and pe.confirmado = true
      and pe.os_id is not null
      and (
        (nullif(trim(coalesce(p_colaborador_id, '')), '') is not null
          and trim(coalesce(pe.colaborador_id, '')) = trim(p_colaborador_id))
        or upper(unaccent(trim(coalesce(pe.nome_colaborador, ''))))
          = upper(unaccent(trim(coalesce(p_nome, ''))))
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.grm_filtrar_regras_programacao(p_versao_id uuid, p_data date, p_colaborador_id text, p_nome text, p_regras jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_programacao_ids text[];
  v_nome text := upper(unaccent(trim(coalesce(p_nome, ''))));
  v_na_programacao boolean := false;
  v_em_os boolean := false;
  v_almoco_programado boolean := true;
begin
  select array_agg(x.value)
    into v_programacao_ids
  from public.grm_despesas_versoes v
  cross join lateral jsonb_array_elements_text(coalesce(v.programacao_ids, '[]'::jsonb)) x(value)
  where v.id = p_versao_id;

  if coalesce(array_length(v_programacao_ids, 1), 0) = 0 then
    return coalesce(p_regras, '[]'::jsonb);
  end if;

  select exists (
    select 1
    from public.programacao_colaboradores pc
    where pc.programacao_id::text = any(v_programacao_ids)
      and pc.data_referencia = p_data
      and (
        (nullif(trim(coalesce(p_colaborador_id, '')), '') is not null
          and trim(coalesce(pc.colaborador_id, '')) = trim(p_colaborador_id))
        or upper(unaccent(trim(coalesce(pc.nome_colaborador, '')))) = v_nome
      )
  ) into v_na_programacao;

  select exists (
    select 1
    from public.programacao_equipe pe
    where pe.programacao_id::text = any(v_programacao_ids)
      and pe.confirmado = true
      and (
        (nullif(trim(coalesce(p_colaborador_id, '')), '') is not null
          and trim(coalesce(pe.colaborador_id, '')) = trim(p_colaborador_id))
        or upper(unaccent(trim(coalesce(pe.nome_colaborador, '')))) = v_nome
      )
  ) into v_em_os;

  select not exists (
    select 1
    from public.programacao_alimentacao pa
    where pa.programacao_id::text = any(v_programacao_ids)
      and pa.data_referencia = p_data
      and pa.almoco = false
      and (
        (nullif(trim(coalesce(p_colaborador_id, '')), '') is not null
          and trim(coalesce(pa.colaborador_id, '')) = trim(p_colaborador_id))
        or upper(unaccent(trim(coalesce(pa.nome_colaborador, '')))) = v_nome
      )
  ) into v_almoco_programado;

  return coalesce((
    select jsonb_agg(t.rule order by t.ord)
    from jsonb_array_elements(coalesce(p_regras, '[]'::jsonb)) with ordinality as t(rule, ord)
    where case
      when upper(unaccent(trim(coalesce(t.rule->>'tipo_despesa', '')))) = 'ALMOCO'
        then v_na_programacao and v_almoco_programado
      when upper(unaccent(trim(coalesce(t.rule->>'tipo_despesa', '')))) in (
        'SALARIO DE INTERMITENTE',
        'SERVICOS TERCEIRIZADOS'
      )
        then v_em_os
      else true
    end
  ), '[]'::jsonb);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.grm_fixed_agent_for_seq(p_seq bigint)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select (array[
    'sync-colaboradores',
    'sync-lista-os',
    'sync-patrimonios',
    'sync-nhe',
    'sync-operacional-os',
    'sync-distribuicao-os',
    'sync-producao-diaria',
    'sync-locais-embarque',
    'sync-resultado-diario',
    'sync-despesas',
    'sync-notas-fiscais',
    'sync-mapa-embarque',
    'sync-contas-pagar',
    'sync-contas-receber',
    'sync-auditorias',
    'sync-cargas-geofence',
    'sync-btg-relatorios',
    'sync-adiantamentos',
    'botconversa-sync'
  ])[((p_seq - 1) % 19) + 1];
$function$
;

CREATE OR REPLACE FUNCTION public.grm_hoje_sao_paulo()
 RETURNS date
 LANGUAGE sql
 STABLE
AS $function$
  select (now() at time zone 'America/Sao_Paulo')::date;
$function$
;

CREATE OR REPLACE FUNCTION public.grm_limpar_staging(p_table text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_allowed text[] := array[
    'relatorio_resultado_diario',
    'producao_snapshot',
    'colaborador_cruzamento',
    'logistica_btg_solicitacoes'
  ];
  v_staging text := p_table || '_staging';
begin
  if not p_table = any(v_allowed) then
    raise exception 'Tabela % não autorizada para staging GRM', p_table;
  end if;

  if to_regclass(format('public.%I', v_staging)) is null then
    perform public.grm_create_staging_table(p_table);
  end if;

  execute format('truncate table public.%I', v_staging);

  return jsonb_build_object(
    'ok', true,
    'table', p_table,
    'staging_table', v_staging,
    'action', 'truncate_staging'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.grm_promover_staging(p_table text, p_min_rows bigint DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_allowed text[] := array[
    'relatorio_resultado_diario',
    'producao_snapshot',
    'colaborador_cruzamento',
    'logistica_btg_solicitacoes'
  ];
  v_staging text := p_table || '_staging';
  v_count bigint;
begin
  if not p_table = any(v_allowed) then
    raise exception 'Tabela % não autorizada para promoção GRM', p_table;
  end if;

  if to_regclass(format('public.%I', p_table)) is null then
    raise exception 'Tabela final public.% não existe', p_table;
  end if;

  if to_regclass(format('public.%I', v_staging)) is null then
    raise exception 'Tabela staging public.% não existe', v_staging;
  end if;

  execute format('select count(*) from public.%I', v_staging) into v_count;

  if v_count < coalesce(p_min_rows, 1) then
    raise exception 'Carga staging de % abortada: % linhas, mínimo exigido %', p_table, v_count, p_min_rows;
  end if;

  execute format('truncate table public.%I', p_table);
  execute format('insert into public.%I select * from public.%I', p_table, v_staging);
  execute format('truncate table public.%I', v_staging);

  return jsonb_build_object(
    'ok', true,
    'table', p_table,
    'promoted_rows', v_count,
    'action', 'promote_staging'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.grm_promover_staging_periodo(p_table text, p_date_column text, p_min_rows bigint DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_allowed_table text[] := array[
    'relatorio_resultado_diario',
    'producao_snapshot'
  ];
  v_allowed_date_column text[] := array[
    'data',
    'data_referencia'
  ];
  v_staging text := p_table || '_staging';
  v_count bigint;
  v_min_date date;
  v_max_date date;
  v_deleted bigint;
begin
  if not p_table = any(v_allowed_table) then
    raise exception 'Tabela % não autorizada para promoção por período GRM', p_table;
  end if;

  if not p_date_column = any(v_allowed_date_column) then
    raise exception 'Coluna de data % não autorizada para promoção por período GRM', p_date_column;
  end if;

  if to_regclass(format('public.%I', p_table)) is null then
    raise exception 'Tabela final public.% não existe', p_table;
  end if;

  if to_regclass(format('public.%I', v_staging)) is null then
    raise exception 'Tabela staging public.% não existe', v_staging;
  end if;

  execute format(
    'select count(*), min(%I)::date, max(%I)::date from public.%I',
    p_date_column,
    p_date_column,
    v_staging
  ) into v_count, v_min_date, v_max_date;

  if v_count < coalesce(p_min_rows, 1) then
    raise exception 'Carga staging de % abortada: % linhas, mínimo exigido %', p_table, v_count, p_min_rows;
  end if;

  if v_min_date is null or v_max_date is null then
    raise exception 'Carga staging de % abortada: coluna % sem período válido', p_table, p_date_column;
  end if;

  execute format(
    'delete from public.%I where %I::date between $1 and $2',
    p_table,
    p_date_column
  ) using v_min_date, v_max_date;

  get diagnostics v_deleted = row_count;

  execute format('insert into public.%I select * from public.%I', p_table, v_staging);
  execute format('truncate table public.%I', v_staging);

  return jsonb_build_object(
    'ok', true,
    'table', p_table,
    'date_column', p_date_column,
    'period_start', v_min_date,
    'period_end', v_max_date,
    'deleted_rows', v_deleted,
    'promoted_rows', v_count,
    'action', 'promote_staging_by_period'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.grm_staging_status()
 RETURNS TABLE(tabela text, tabela_final_existe boolean, tabela_staging_existe boolean, linhas_final bigint, linhas_staging bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_table text;
  v_final_count bigint;
  v_staging_count bigint;
begin
  foreach v_table in array array[
    'relatorio_resultado_diario',
    'producao_snapshot',
    'colaborador_cruzamento',
    'logistica_btg_solicitacoes'
  ] loop
    v_final_count := null;
    v_staging_count := null;

    if to_regclass(format('public.%I', v_table)) is not null then
      execute format('select count(*) from public.%I', v_table) into v_final_count;
    end if;

    if to_regclass(format('public.%I', v_table || '_staging')) is not null then
      execute format('select count(*) from public.%I', v_table || '_staging') into v_staging_count;
    end if;

    tabela := v_table;
    tabela_final_existe := to_regclass(format('public.%I', v_table)) is not null;
    tabela_staging_existe := to_regclass(format('public.%I', v_table || '_staging')) is not null;
    linhas_final := v_final_count;
    linhas_staging := v_staging_count;
    return next;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.grm_sync_assign_lane()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_version smallint := 1;
begin
  select coalesce(active_version,1)
    into v_version
  from public.grm_sync_runtime_policy
  where id=1;

  if coalesce(v_version,1) >= 2 then
    new.lane := public.grm_sync_lane_for_agent(new.agente_id);
  elsif new.lane is null then
    new.lane := public.grm_sync_lane_for_agent(new.agente_id);
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.grm_sync_cancel_pending_on_disable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if old.enabled is distinct from false and new.enabled is false then
    update public.grm_sync_jobs
       set status = 'erro',
           erro = coalesce(erro, '') || case when coalesce(erro, '') = '' then '' else E'\n' end ||
                  'Cancelado automaticamente: agente desativado em grm_sync_agent_settings.',
           finalizado_em = coalesce(finalizado_em, now())
     where agente_id = new.agent_id
       and status = 'pendente';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.grm_sync_guard_disabled_agent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_enabled boolean;
begin
  select s.enabled
    into v_enabled
  from public.grm_sync_agent_settings s
  where s.agent_id = new.agente_id;

  if v_enabled is false then
    raise exception 'Agente % está desativado em grm_sync_agent_settings; job bloqueado.', new.agente_id
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.grm_sync_lane_for_agent(p_agent_id text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_version smallint := 1;
  v_lane text;
begin
  select coalesce(active_version,1) into v_version
  from public.grm_sync_runtime_policy
  where id=1;

  if coalesce(v_version,1) >= 2 then
    select coalesce(s.target_lane,s.queue_lane) into v_lane
    from public.grm_sync_agent_settings s
    where s.agent_id=p_agent_id;

    return coalesce(v_lane,
      case
        when p_agent_id in ('sync-lista-os','sync-nhe','sync-distribuicao-os') then 'entrada_os'
        when p_agent_id in ('sync-producao-diaria','sync-resultado-diario') then 'entrada_producao'
        when p_agent_id in ('sync-contas-pagar','sync-notas-fiscais','sync-adiantamentos','sync-auditorias') then 'entrada_financeiro_a'
        when p_agent_id in ('sync-contas-receber','sync-despesas') then 'entrada_financeiro_b'
        when p_agent_id in ('sync-colaboradores','sync-patrimonios','sync-locais-embarque','sync-mapa-embarque','sync-cargas-geofence','sync-btg-relatorios','sync-btg-classificador','sync-login-alimentacao','botconversa-sync','sync-operacional-os') then 'entrada_cadastros_operacao'
        when p_agent_id in ('sync-abrir-os','sync-finalizar-os','sync-reabrir-os') then 'saida_os'
        when p_agent_id in ('aplicar-distribuicao-os','sync-lancar-nhe','sync-btg-checkin','sync-btg-devolver-classificador') then 'saida_logistica'
        when p_agent_id in ('sync-liberacao-despesas','sync-despesas-retroativas','sync-bonus-caixa','sync-lancar-notas-fiscais') then 'saida_financeiro'
        else 'entrada_cadastros_operacao'
      end
    );
  end if;

  select s.queue_lane into v_lane
  from public.grm_sync_agent_settings s
  where s.agent_id=p_agent_id;

  return coalesce(v_lane,
    case
      when p_agent_id in ('aplicar-distribuicao-os','sync-liberacao-despesas') then 'despesas_distribuicao'
      when p_agent_id in ('sync-lancar-nhe','sync-finalizar-os','sync-abrir-os','sync-reabrir-os','sync-despesas-retroativas','sync-btg-checkin','sync-btg-devolver-classificador','sync-lancar-notas-fiscais') then 'alteracoes'
      else 'fixed_a'
    end
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.grm_sync_target_lane_for_agent(p_agent_id text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select target_lane from public.grm_sync_agent_settings where agent_id=p_agent_id),
    case
      when p_agent_id in ('sync-lista-os','sync-nhe','sync-distribuicao-os') then 'entrada_os'
      when p_agent_id in ('sync-producao-diaria','sync-resultado-diario') then 'entrada_producao'
      when p_agent_id in ('sync-contas-pagar','sync-notas-fiscais','sync-adiantamentos','sync-auditorias') then 'entrada_financeiro_a'
      when p_agent_id in ('sync-contas-receber','sync-despesas') then 'entrada_financeiro_b'
      when p_agent_id in ('sync-colaboradores','sync-patrimonios','sync-locais-embarque','sync-mapa-embarque','sync-cargas-geofence','sync-btg-relatorios','sync-login-alimentacao','botconversa-sync','sync-operacional-os') then 'entrada_cadastros_operacao'
      when p_agent_id in ('sync-abrir-os','sync-finalizar-os','sync-reabrir-os') then 'saida_os'
      when p_agent_id in ('aplicar-distribuicao-os','sync-lancar-nhe','sync-btg-checkin','sync-btg-devolver-classificador') then 'saida_logistica'
      when p_agent_id in ('sync-liberacao-despesas','sync-despesas-retroativas','sync-bonus-caixa','sync-lancar-notas-fiscais') then 'saida_financeiro'
      else null
    end
  );
$function$
;

CREATE OR REPLACE FUNCTION public.grm_ultima_movimentacao_os(p_oss text[])
 RETURNS TABLE(numero_os text, ultima_movimentacao timestamp with time zone, total_cargas bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- Segurança operacional: inatividade no Relatório de Cargas não é mais
  -- critério de finalização de O.S. O agente pode finalizar automaticamente
  -- somente por Remanescente = 0,00; com saldo, somente após aprovação
  -- explícita da Logística. Mantemos a assinatura do RPC para compatibilidade
  -- com versões antigas do agente, mas não devolvemos elegibilidade por tempo.
  select null::text, null::timestamptz, null::bigint
  where false;
$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_compress$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_consistent(internal, text, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_decompress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_decompress$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_distance(internal, text, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_distance$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_in(cstring)
 RETURNS gtrgm
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_in$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_options(internal)
 RETURNS void
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE
AS '$libdir/pg_trgm', $function$gtrgm_options$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_out(gtrgm)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_out$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_penalty$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_picksplit$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_same(gtrgm, gtrgm, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_same$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_union(internal, internal)
 RETURNS gtrgm
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_union$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(public.profiles.full_name, excluded.full_name),
      updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_aplicar_alerta_nf_financeiro()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_emite_nota boolean;
  v_alerta constant text := '⚠ HOTEL NÃO EMITE NOTA FISCAL';
begin
  if upper(coalesce(new.origem_setor, '')) <> 'HOSPEDAGEM'
     or upper(coalesce(new.origem_tabela, '')) <> 'HOSPEDAGEM_RESERVAS'
     or new.origem_id is null then
    return new;
  end if;

  select coalesce(h.emite_nota_fiscal, true)
    into v_emite_nota
  from public.hospedagem_reservas r
  left join public.hospedagem_hoteis h on h.id = r.hotel_id
  where r.id = new.origem_id
  limit 1;

  if coalesce(v_emite_nota, true) = false then
    if coalesce(new.descricao, '') !~ '^⚠' then
      new.descricao := '⚠ ' || coalesce(new.descricao, 'Hospedagem');
    end if;
    if position(v_alerta in coalesce(new.observacoes, '')) = 0 then
      new.observacoes := concat_ws(E'\n', v_alerta, nullif(new.observacoes, ''));
    end if;
  else
    new.descricao := nullif(regexp_replace(coalesce(new.descricao, ''), '^⚠\s*', ''), '');
    new.observacoes := nullif(trim(both E'\n' from replace(coalesce(new.observacoes, ''), v_alerta, '')), '');
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_arquivar_reserva_cancelada()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_reason text;
begin
  if new.status_hospedagem = 'CANCELADA'
     and old.status_hospedagem is distinct from 'CANCELADA' then
    v_reason := case
      when position('Cancelamento:' in coalesce(new.observacao_hospedagem, '')) > 0
        then nullif(btrim(split_part(new.observacao_hospedagem, 'Cancelamento:', 2)), '')
      else null
    end;

    update public.hospedagem_solicitacoes s
       set status_solicitacao = 'CANCELADA',
           motivo_cancelamento = coalesce(nullif(btrim(s.motivo_cancelamento), ''), v_reason, 'Reserva cancelada'),
           cancelado_em = coalesce(s.cancelado_em, now()),
           cancelado_por = coalesce(s.cancelado_por, auth.uid()),
           updated_at = now()
     where s.id = new.solicitacao_id
        or s.id in (
          select hrs.solicitacao_id
            from public.hospedagem_reserva_solicitacoes hrs
           where hrs.reserva_id = new.id
        );
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_cancelar_solicitacao(p_solicitacao_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_solicitacao public.hospedagem_solicitacoes%rowtype;
  v_reserva record;
  v_nova_principal uuid;
  v_canceladas int := 0;
  v_reapontadas int := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticacao obrigatoria' using errcode='42501';
  end if;
  p_motivo := coalesce(nullif(btrim(p_motivo),''),'Sem motivo informado');

  select * into v_solicitacao
  from public.hospedagem_solicitacoes where id=p_solicitacao_id for update;
  if not found then raise exception 'Solicitacao nao encontrada'; end if;
  if not public.hospedagem_pode_operar(true)
     and v_solicitacao.created_by is distinct from (select auth.uid())
     and v_solicitacao.solicitante_id is distinct from (select auth.uid()) then
    raise exception 'Sem permissao para cancelar esta solicitacao' using errcode='42501';
  end if;

  update public.hospedagem_solicitacoes
  set status_solicitacao='CANCELADA',cancelado_em=now(),cancelado_por=(select auth.uid()),
      motivo_cancelamento=btrim(p_motivo),updated_at=now()
  where id=p_solicitacao_id;

  for v_reserva in
    select distinct r.id,r.solicitacao_id
    from public.hospedagem_reservas r
    left join public.hospedagem_reserva_solicitacoes rs on rs.reserva_id=r.id
    where r.solicitacao_id=p_solicitacao_id or rs.solicitacao_id=p_solicitacao_id
    for update of r
  loop
    select rs.solicitacao_id into v_nova_principal
    from public.hospedagem_reserva_solicitacoes rs
    join public.hospedagem_solicitacoes s on s.id=rs.solicitacao_id
    where rs.reserva_id=v_reserva.id and rs.solicitacao_id<>p_solicitacao_id
      and s.status_solicitacao<>'CANCELADA'
    order by rs.created_at,rs.solicitacao_id limit 1;

    if v_nova_principal is null then
      update public.hospedagem_reservas
      set status_hospedagem='CANCELADA',updated_at=now(),
          observacao_hospedagem=concat_ws(E'\n',nullif(observacao_hospedagem,''),'Cancelada: '||btrim(p_motivo))
      where id=v_reserva.id and status_hospedagem<>'CANCELADA';
      v_canceladas := v_canceladas+1;
    elsif v_reserva.solicitacao_id=p_solicitacao_id then
      update public.hospedagem_reservas set solicitacao_id=v_nova_principal,updated_at=now()
      where id=v_reserva.id;
      v_reapontadas := v_reapontadas+1;
    end if;
  end loop;

  insert into public.hospedagem_eventos
    (solicitacao_id,usuario_id,tipo_evento,descricao,status_anterior,status_novo)
  values(p_solicitacao_id,(select auth.uid()),'CANCELADA','Solicitacao cancelada: '||btrim(p_motivo),v_solicitacao.status_solicitacao,'CANCELADA');

  return jsonb_build_object('solicitacao_id',p_solicitacao_id,'reservas_canceladas',v_canceladas,'reservas_reapontadas',v_reapontadas);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_carregar_painel_v2()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.data_solicitacao desc)
      from public.hospedagem_painel_geral x
    ), '[]'::jsonb),
    'hotels', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.cidade asc nulls last, x.nome asc)
      from public.hospedagem_hoteis x
    ), '[]'::jsonb),
    'people', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at asc)
      from public.hospedagem_solicitacao_colaboradores x
    ), '[]'::jsonb),
    'assignments', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at asc)
      from public.hospedagem_reserva_colaboradores x
    ), '[]'::jsonb),
    'links', coalesce((
      select jsonb_agg(to_jsonb(x))
      from public.hospedagem_reserva_solicitacoes x
    ), '[]'::jsonb),
    'extras', coalesce((
      select jsonb_agg(to_jsonb(x))
      from public.hospedagem_custos_extras x
    ), '[]'::jsonb),
    'finance', coalesce((
      select jsonb_agg(to_jsonb(x))
      from public.hospedagem_financeiro x
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(to_jsonb(x))
      from public.hospedagem_documentos x
    ), '[]'::jsonb),
    'advances', coalesce((
      select jsonb_agg(to_jsonb(x))
      from public.hospedagem_adiantamentos x
    ), '[]'::jsonb),
    'advanceMoves', coalesce((
      select jsonb_agg(to_jsonb(x))
      from public.hospedagem_adiantamento_movimentos x
    ), '[]'::jsonb),
    'checkoutLots', coalesce((
      select jsonb_agg(to_jsonb(x))
      from public.hospedagem_checkout_lotes x
    ), '[]'::jsonb),
    'checkoutPeople', coalesce((
      select jsonb_agg(to_jsonb(x))
      from public.hospedagem_checkout_lote_colaboradores x
    ), '[]'::jsonb),
    'quotes', coalesce((
      select jsonb_agg(to_jsonb(x))
      from public.hospedagem_cotacoes x
    ), '[]'::jsonb)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_conciliar_hotel(p_nome text, p_cidade text, p_uf text, p_link_maps text, p_whatsapp text, p_endereco text, p_valor_padrao numeric, p_valor_individual numeric, p_valor_duplo numeric, p_valor_triplo numeric, p_valor_quadruplo numeric, p_prioridade text, p_observacoes text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_id text;
begin
  select h.id::text
    into v_id
  from public.hospedagem_hoteis h
  where
    (
      nullif(trim(p_link_maps), '') is not null
      and lower(trim(coalesce(h.link_maps, ''))) = lower(trim(p_link_maps))
    )
    or
    (
      upper(trim(coalesce(h.uf, ''))) = upper(trim(p_uf))
      and public.hospedagem_normalizar_texto(h.cidade)
        = public.hospedagem_normalizar_texto(p_cidade)
      and public.hospedagem_normalizar_texto(
        regexp_replace(coalesce(h.nome, ''), '\s*\([^)]*\)\s*', ' ', 'g')
      ) = public.hospedagem_normalizar_texto(p_nome)
    )
    or
    (
      nullif(public.hospedagem_normalizar_telefone(p_whatsapp), '') is not null
      and public.hospedagem_normalizar_telefone(h.whatsapp)
        = public.hospedagem_normalizar_telefone(p_whatsapp)
      and upper(trim(coalesce(h.uf, ''))) = upper(trim(p_uf))
      and public.hospedagem_normalizar_texto(h.cidade)
        = public.hospedagem_normalizar_texto(p_cidade)
    )
  order by
    case
      when nullif(trim(p_link_maps), '') is not null
       and lower(trim(coalesce(h.link_maps, ''))) = lower(trim(p_link_maps))
      then 0
      when nullif(public.hospedagem_normalizar_telefone(p_whatsapp), '') is not null
       and public.hospedagem_normalizar_telefone(h.whatsapp)
         = public.hospedagem_normalizar_telefone(p_whatsapp)
      then 1
      else 2
    end,
    h.id::text
  limit 1;

  if v_id is null then
    insert into public.hospedagem_hoteis (
      nome, cidade, uf, link_maps, whatsapp, endereco,
      valor_diaria_padrao, valor_diaria_individual, valor_diaria_duplo,
      valor_diaria_triplo, valor_diaria_quadruplo,
      status, prioridade, observacoes
    )
    values (
      p_nome, p_cidade, upper(p_uf), nullif(trim(p_link_maps), ''),
      nullif(trim(p_whatsapp), ''), nullif(trim(p_endereco), ''),
      p_valor_padrao, p_valor_individual, p_valor_duplo,
      p_valor_triplo, p_valor_quadruplo,
      'ATIVO', coalesce(nullif(trim(p_prioridade), ''), 'NORMAL'),
      nullif(trim(p_observacoes), '')
    )
    returning id::text into v_id;
  else
    update public.hospedagem_hoteis h
    set
      link_maps = case
        when nullif(trim(coalesce(h.link_maps, '')), '') is null
        then nullif(trim(p_link_maps), '') else h.link_maps end,
      whatsapp = case
        when nullif(trim(coalesce(h.whatsapp, '')), '') is null
        then nullif(trim(p_whatsapp), '') else h.whatsapp end,
      endereco = case
        when nullif(trim(coalesce(h.endereco, '')), '') is null
        then nullif(trim(p_endereco), '') else h.endereco end,
      valor_diaria_padrao = case
        when coalesce(h.valor_diaria_padrao, 0) <= 0 then p_valor_padrao
        else h.valor_diaria_padrao end,
      valor_diaria_individual = case
        when coalesce(h.valor_diaria_individual, 0) <= 0 then p_valor_individual
        else h.valor_diaria_individual end,
      valor_diaria_duplo = case
        when coalesce(h.valor_diaria_duplo, 0) <= 0 then p_valor_duplo
        else h.valor_diaria_duplo end,
      valor_diaria_triplo = case
        when coalesce(h.valor_diaria_triplo, 0) <= 0 then p_valor_triplo
        else h.valor_diaria_triplo end,
      valor_diaria_quadruplo = case
        when coalesce(h.valor_diaria_quadruplo, 0) <= 0 then p_valor_quadruplo
        else h.valor_diaria_quadruplo end,
      status = coalesce(nullif(trim(h.status), ''), 'ATIVO'),
      prioridade = case
        when upper(coalesce(p_prioridade, '')) = 'EVITAR' then 'EVITAR'
        else coalesce(nullif(trim(h.prioridade), ''), 'NORMAL') end,
      observacoes = case
        when nullif(trim(coalesce(p_observacoes, '')), '') is null then h.observacoes
        when nullif(trim(coalesce(h.observacoes, '')), '') is null then p_observacoes
        when position('Fonte: bc hoteis.xlsx' in h.observacoes) > 0 then h.observacoes
        else h.observacoes || E'\n' || p_observacoes end
    where h.id::text = v_id;
  end if;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_conciliar_hotel(p_nome text, p_cidade text, p_uf text, p_link_maps text, p_whatsapp text, p_endereco text, p_valor_padrao numeric, p_valor_individual numeric, p_valor_duplo numeric, p_valor_triplo numeric, p_valor_quadruplo text, p_prioridade text, p_observacoes text)
 RETURNS text
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  select public.hospedagem_conciliar_hotel(
    p_nome,
    p_cidade,
    p_uf,
    p_link_maps,
    p_whatsapp,
    p_endereco,
    p_valor_padrao,
    p_valor_individual,
    p_valor_duplo,
    p_valor_triplo,
    nullif(trim(p_valor_quadruplo), '')::numeric,
    p_prioridade,
    p_observacoes
  );
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_confirmar_pagamento_lote(p_lote_id uuid, p_valor_pago numeric, p_comprovante_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_lote public.hospedagem_checkout_lotes%rowtype;
  v_devido numeric;
  v_excedente numeric := 0;
  v_adiantamento_id uuid;
  v_total_pago numeric;
  v_total_reserva numeric;
  v_status text;
begin
  if not public.hospedagem_pode_financeiro(true) then
    raise exception 'Sem permissao para confirmar pagamento' using errcode='42501';
  end if;
  if coalesce(p_valor_pago,0) < 0 then raise exception 'Valor pago invalido'; end if;

  select * into v_lote from public.hospedagem_checkout_lotes where id=p_lote_id for update;
  if not found or v_lote.status='CANCELADO' then raise exception 'Lote inexistente ou cancelado'; end if;

  select valor into v_devido from public.financeiro_pagamentos
  where hospedagem_checkout_lote_id=p_lote_id for update;
  if not found then raise exception 'Lote ainda nao foi enviado ao Financeiro'; end if;
  v_excedente := greatest(p_valor_pago-v_devido,0);

  update public.financeiro_pagamentos
  set status=case when p_valor_pago >= v_devido then 'PAGO' else 'EM_ANALISE' end,
      data_pagamento=case when p_valor_pago >= v_devido then current_date else data_pagamento end,
      pago_em=case when p_valor_pago >= v_devido then now() else pago_em end,
      comprovante_url=coalesce(p_comprovante_url,comprovante_url),
      atualizado_por=(select auth.uid()),updated_at=now()
  where hospedagem_checkout_lote_id=p_lote_id;

  update public.hospedagem_checkout_lotes
  set status=case when p_valor_pago >= v_devido then 'PAGO' when p_valor_pago>0 then 'PARCIAL' else 'PENDENTE' end,
      updated_at=now()
  where id=p_lote_id;

  select coalesce(sum(case when fp.status='PAGO' then cl.valor_total else 0 end),0),
         coalesce(sum(cl.valor_total),0)
  into v_total_pago,v_total_reserva
  from public.hospedagem_checkout_lotes cl
  left join public.financeiro_pagamentos fp on fp.hospedagem_checkout_lote_id=cl.id
  where cl.reserva_id=v_lote.reserva_id and cl.status<>'CANCELADO';

  v_status := case when v_total_reserva>0 and v_total_pago>=v_total_reserva then 'PAGO'
                   when v_total_pago>0 then 'PARCIAL' else 'ENVIADO_AO_FINANCEIRO' end;
  update public.hospedagem_financeiro
  set valor_pago=v_total_pago,saldo=greatest(v_total_reserva-v_total_pago,0),
      status_financeiro=v_status,
      data_pagamento=case when v_status='PAGO' then current_date else data_pagamento end,
      pago_em=case when v_status='PAGO' then now() else pago_em end,
      comprovante_url=coalesce(p_comprovante_url,comprovante_url),updated_at=now()
  where reserva_id=v_lote.reserva_id;

  if v_excedente>0 and v_lote.hotel_id is not null then
    insert into public.hospedagem_adiantamentos
      (hotel_id,reserva_origem_id,valor_creditado,saldo,status,observacoes,criado_por)
    values (v_lote.hotel_id,v_lote.reserva_id,v_excedente,v_excedente,'DISPONIVEL',
            'Credito gerado por comprovante superior ao valor devido',(select auth.uid()))
    returning id into v_adiantamento_id;
    insert into public.hospedagem_adiantamento_movimentos
      (adiantamento_id,reserva_id,tipo,valor,observacoes,criado_por)
    values (v_adiantamento_id,v_lote.reserva_id,'CREDITO',v_excedente,'Adiantamento recebido',(select auth.uid()));
  end if;

  return jsonb_build_object('status',v_status,'valor_pago',v_total_pago,'saldo',greatest(v_total_reserva-v_total_pago,0),'adiantamento_gerado',v_excedente);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_consumir_creditos(p_hotel_id uuid, p_reserva_id uuid, p_limite numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_restante numeric := greatest(coalesce(p_limite,0),0);
  v_usado numeric := 0;
  v_uso numeric;
  r record;
begin
  if not public.hospedagem_pode_operar(true) then
    raise exception 'Sem permissao para operar creditos de hospedagem' using errcode='42501';
  end if;
  if v_restante = 0 then return 0; end if;

  for r in
    select id, saldo from public.hospedagem_adiantamentos
    where hotel_id=p_hotel_id and status='DISPONIVEL' and saldo>0
    order by created_at, id
    for update
  loop
    exit when v_restante <= 0;
    v_uso := least(r.saldo, v_restante);
    update public.hospedagem_adiantamentos
      set saldo=saldo-v_uso,
          status=case when saldo-v_uso <= 0 then 'UTILIZADO' else 'DISPONIVEL' end,
          updated_at=now()
      where id=r.id;
    insert into public.hospedagem_adiantamento_movimentos
      (adiantamento_id,reserva_id,tipo,valor,observacoes,criado_por)
    values (r.id,p_reserva_id,'DEBITO',v_uso,'Credito aplicado a hospedagem',(select auth.uid()));
    v_usado := v_usado + v_uso;
    v_restante := v_restante - v_uso;
  end loop;
  return v_usado;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_criar_solicitacao(p_solicitacao jsonb, p_colaboradores jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_codigo text;
  c jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Autenticacao obrigatoria' using errcode='42501'; end if;
  if jsonb_typeof(coalesce(p_colaboradores,'[]'::jsonb))<>'array'
     or jsonb_array_length(coalesce(p_colaboradores,'[]'::jsonb))=0 then
    raise exception 'Informe ao menos um colaborador';
  end if;
  if nullif(btrim(p_solicitacao->>'cidade'),'') is null then raise exception 'Informe a cidade'; end if;
  if nullif(p_solicitacao->>'data_checkin_prevista','')::date < current_date then raise exception 'Check-in anterior a hoje'; end if;
  if nullif(p_solicitacao->>'data_checkout_prevista','')::date <= nullif(p_solicitacao->>'data_checkin_prevista','')::date then
    raise exception 'Periodo de hospedagem invalido';
  end if;

  insert into public.hospedagem_solicitacoes(
    data_solicitacao,created_by,solicitante_id,solicitante_nome,solicitante_email,
    empresa,coordenacao,supervisao,regional,cidade,uf,cliente,local_embarque,
    link_local_embarque,data_checkin_prevista,data_checkout_prevista,
    horario_chegada_previsto,quantidade_diarias_prevista,observacao_gestor,status_solicitacao,
    preferencia_hospedagem
  ) values (
    coalesce(nullif(p_solicitacao->>'data_solicitacao','')::date,current_date),(select auth.uid()),(select auth.uid()),
    nullif(p_solicitacao->>'solicitante_nome',''),nullif(p_solicitacao->>'solicitante_email',''),
    nullif(p_solicitacao->>'empresa',''),nullif(p_solicitacao->>'coordenacao',''),nullif(p_solicitacao->>'supervisao',''),
    nullif(p_solicitacao->>'regional',''),btrim(p_solicitacao->>'cidade'),upper(nullif(p_solicitacao->>'uf','')),
    nullif(p_solicitacao->>'cliente',''),nullif(p_solicitacao->>'local_embarque',''),nullif(p_solicitacao->>'link_local_embarque',''),
    nullif(p_solicitacao->>'data_checkin_prevista','')::date,nullif(p_solicitacao->>'data_checkout_prevista','')::date,
    nullif(p_solicitacao->>'horario_chegada_previsto','')::time,
    nullif(p_solicitacao->>'quantidade_diarias_prevista','')::integer,nullif(p_solicitacao->>'observacao_gestor',''),'SOLICITADA',
    nullif(p_solicitacao->>'preferencia_hospedagem','')
  ) returning id,codigo into v_id,v_codigo;

  for c in select value from jsonb_array_elements(p_colaboradores) loop
    if nullif(btrim(c->>'nome_colaborador'),'') is null then raise exception 'Colaborador sem nome'; end if;
    insert into public.hospedagem_solicitacao_colaboradores(
      solicitacao_id,colaborador_id,nome_colaborador,cpf,tipo_colaborador,empresa,
      coordenacao,supervisao,status_colaborador,observacoes
    ) values (
      v_id,nullif(c->>'colaborador_id','')::uuid,btrim(c->>'nome_colaborador'),nullif(c->>'cpf',''),
      nullif(c->>'tipo_colaborador',''),nullif(c->>'empresa',''),nullif(c->>'coordenacao',''),
      nullif(c->>'supervisao',''),coalesce(nullif(c->>'status_colaborador',''),'ATIVO'),nullif(c->>'observacoes','')
    );
  end loop;

  insert into public.hospedagem_eventos
    (solicitacao_id,usuario_id,tipo_evento,descricao,status_novo)
  values(v_id,(select auth.uid()),'SOLICITACAO_CRIADA','Solicitacao criada pelo gestor.','SOLICITADA');
  return jsonb_build_object('id',v_id,'codigo',v_codigo);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_criar_solicitacao_manual(p_colaborador_ids uuid[], p_cidade text, p_uf text, p_checkin date, p_checkout date, p_horario_chegada time without time zone DEFAULT NULL::time without time zone, p_observacao text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_solicitacao_id uuid;
  v_usuario_nome text;
  v_usuario_email text;
  v_empresa text;
  v_coordenacao text;
  v_supervisao text;
  v_colaboradores text;
  v_ids uuid[];
  v_total integer;
  v_esperado integer;
  v_dup text;
begin
  if v_uid is null or not public.hospedagem_pode_criar_solicitacao_manual() then
    raise exception 'Apenas o ADM do setor de Hotéis pode criar solicitações manuais.' using errcode = '42501';
  end if;

  if p_colaborador_ids is null or cardinality(p_colaborador_ids) = 0 then
    raise exception 'Selecione ao menos um colaborador.';
  end if;
  if nullif(btrim(p_cidade), '') is null then
    raise exception 'Informe a cidade.';
  end if;
  if length(btrim(coalesce(p_uf, ''))) <> 2 then
    raise exception 'Informe uma UF válida.';
  end if;
  if p_checkin is null or p_checkout is null then
    raise exception 'Informe as datas de entrada e saída.';
  end if;
  if p_checkout < p_checkin then
    raise exception 'A data de saída não pode ser anterior à entrada.';
  end if;

  select au.nome, au.email
    into v_usuario_nome, v_usuario_email
    from public.app_usuarios au
   where au.auth_user_id = v_uid
     and coalesce(au.ativo, true) = true
   order by au.updated_at desc nulls last
   limit 1;

  select array_agg(c.id order by c.nome),
         count(*)::integer,
         string_agg(distinct c.nome, ', ' order by c.nome),
         string_agg(distinct nullif(btrim(c.empresa), ''), ' | ' order by nullif(btrim(c.empresa), '')) filter (where nullif(btrim(c.empresa), '') is not null),
         string_agg(distinct nullif(btrim(c.coordenacao), ''), ' | ' order by nullif(btrim(c.coordenacao), '')) filter (where nullif(btrim(c.coordenacao), '') is not null),
         string_agg(distinct nullif(btrim(c.supervisao), ''), ' | ' order by nullif(btrim(c.supervisao), '')) filter (where nullif(btrim(c.supervisao), '') is not null)
    into v_ids, v_total, v_colaboradores, v_empresa, v_coordenacao, v_supervisao
    from public.colaboradores c
   where c.id = any(p_colaborador_ids)
     and lower(btrim(coalesce(c.situacao, ''))) = 'ativo';

  select count(distinct x)::integer into v_esperado from unnest(p_colaborador_ids) x;
  if v_total <> v_esperado then
    raise exception 'Um ou mais colaboradores selecionados não estão ativos ou não foram encontrados.';
  end if;

  select c.nome
    into v_dup
    from public.hospedagem_solicitacoes s
    join public.hospedagem_solicitacao_colaboradores sc on sc.solicitacao_id = s.id
    join public.colaboradores c on c.id = sc.colaborador_id
   where sc.colaborador_id = any(v_ids)
     and upper(coalesce(s.status_solicitacao, '')) in ('SOLICITADA','EM_ANALISE','EM_COTACAO','RESERVADA')
     and upper(btrim(coalesce(s.cidade, ''))) = upper(btrim(p_cidade))
     and upper(btrim(coalesce(s.uf, ''))) = upper(btrim(p_uf))
     and s.data_checkin_prevista = p_checkin
     and s.data_checkout_prevista = p_checkout
   limit 1;

  if v_dup is not null then
    raise exception 'Já existe solicitação ativa com o mesmo período e destino para %.', v_dup;
  end if;

  insert into public.hospedagem_solicitacoes (
    data_solicitacao,
    colaborador,
    cidade,
    uf,
    checkin,
    checkout,
    status,
    observacoes,
    created_by,
    solicitante_id,
    solicitante_nome,
    solicitante_email,
    empresa,
    coordenacao,
    supervisao,
    data_checkin_prevista,
    data_checkout_prevista,
    horario_chegada_previsto,
    quantidade_diarias_prevista,
    observacao_gestor,
    observacao_interna,
    status_solicitacao
  ) values (
    (now() at time zone 'America/Sao_Paulo')::date,
    v_colaboradores,
    btrim(p_cidade),
    upper(btrim(p_uf)),
    p_checkin,
    p_checkout,
    'aberto',
    nullif(btrim(p_observacao), ''),
    v_uid,
    v_uid,
    coalesce(nullif(btrim(v_usuario_nome), ''), v_usuario_email, 'ADM Hotéis'),
    v_usuario_email,
    v_empresa,
    v_coordenacao,
    v_supervisao,
    p_checkin,
    p_checkout,
    p_horario_chegada,
    greatest(1, p_checkout - p_checkin),
    nullif(btrim(p_observacao), ''),
    'Solicitação manual criada pelo ADM do setor de Hotéis.',
    'SOLICITADA'
  ) returning id into v_solicitacao_id;

  insert into public.hospedagem_solicitacao_colaboradores (
    solicitacao_id,
    colaborador_id,
    nome_colaborador,
    cpf,
    tipo_colaborador,
    empresa,
    coordenacao,
    supervisao,
    status_colaborador,
    observacoes
  )
  select v_solicitacao_id,
         c.id,
         c.nome,
         c.cpf,
         c.tipo,
         c.empresa,
         c.coordenacao,
         c.supervisao,
         'ATIVO',
         nullif(btrim(p_observacao), '')
    from public.colaboradores c
   where c.id = any(v_ids);

  insert into public.hospedagem_eventos (
    solicitacao_id,
    usuario_id,
    usuario_nome,
    tipo_evento,
    descricao,
    status_novo,
    payload
  ) values (
    v_solicitacao_id,
    v_uid,
    coalesce(nullif(btrim(v_usuario_nome), ''), v_usuario_email, 'ADM Hotéis'),
    'SOLICITACAO_CRIADA_MANUAL',
    'Solicitação criada manualmente pelo ADM do setor de Hotéis.',
    'SOLICITADA',
    jsonb_build_object(
      'origem', 'ADM_HOTEIS',
      'cidade', btrim(p_cidade),
      'uf', upper(btrim(p_uf)),
      'checkin', p_checkin,
      'checkout', p_checkout,
      'colaborador_ids', to_jsonb(v_ids)
    )
  );

  return v_solicitacao_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_enviar_lote_financeiro(p_reserva_id uuid, p_lote_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_reserva public.hospedagem_reservas%rowtype;
  v_lote public.hospedagem_checkout_lotes%rowtype;
  v_hotel public.hospedagem_hoteis%rowtype;
  v_pagamento_id uuid;
  v_credito numeric := 0;
  v_devido numeric;
begin
  if not public.hospedagem_pode_operar(true) then
    raise exception 'Sem permissao para enviar hospedagem ao Financeiro' using errcode='42501';
  end if;

  select * into v_reserva from public.hospedagem_reservas where id=p_reserva_id for update;
  if not found or v_reserva.status_hospedagem='CANCELADA' then
    raise exception 'Reserva inexistente ou cancelada';
  end if;

  if p_lote_id is null then
    select * into v_lote from public.hospedagem_checkout_lotes
    where reserva_id=p_reserva_id and status in ('PENDENTE','PARCIAL')
    order by created_at desc limit 1 for update;
  else
    select * into v_lote from public.hospedagem_checkout_lotes
    where id=p_lote_id and reserva_id=p_reserva_id for update;
  end if;
  if not found then raise exception 'Lote de checkout pendente nao encontrado'; end if;

  select * into v_hotel from public.hospedagem_hoteis where id=v_reserva.hotel_id;
  v_credito := public.hospedagem_consumir_creditos(v_reserva.hotel_id,p_reserva_id,v_lote.valor_total);
  v_devido := greatest(v_lote.valor_total-v_credito,0);

  insert into public.financeiro_pagamentos (
    origem_setor,origem_tabela,origem_id,hospedagem_checkout_lote_id,
    origem_codigo,competencia,descricao,favorecido_nome,forma_pagamento,
    valor,status,prioridade,observacoes,solicitado_por,atualizado_por
  ) values (
    'HOSPEDAGEM','hospedagem_checkout_lotes',v_lote.id,v_lote.id,
    v_lote.id::text,coalesce(v_reserva.data_checkin,current_date),
    format('Hospedagem %s - %s/%s',coalesce(v_hotel.nome,v_reserva.nome_hotel,'Hotel'),coalesce(v_reserva.cidade_hotel,''),coalesce(v_reserva.uf_hotel,'')),
    coalesce(v_hotel.razao_social,v_hotel.nome,v_reserva.nome_hotel,'Hotel'),'PIX',
    v_devido,'PENDENTE','NORMAL',
    case when v_credito>0 then format('Credito de R$ %s aplicado antes do envio.',v_credito) end,
    (select auth.uid()),(select auth.uid())
  )
  on conflict (hospedagem_checkout_lote_id) where hospedagem_checkout_lote_id is not null
  do update set valor=excluded.valor,descricao=excluded.descricao,observacoes=excluded.observacoes,
                atualizado_por=(select auth.uid()),updated_at=now()
  returning id into v_pagamento_id;

  insert into public.hospedagem_financeiro
    (reserva_id,valor_original,valor_total,valor_pago,saldo,status_financeiro,enviado_financeiro_em,origem_pagamento)
  values (p_reserva_id,v_lote.valor_total,v_lote.valor_total,0,v_devido,'ENVIADO_AO_FINANCEIRO',now(),'CHECKOUT_LOTE')
  on conflict (reserva_id) do update
    set valor_original=excluded.valor_original,valor_total=excluded.valor_total,
        saldo=excluded.saldo,status_financeiro=excluded.status_financeiro,
        enviado_financeiro_em=excluded.enviado_financeiro_em,origem_pagamento=excluded.origem_pagamento,
        updated_at=now();

  return v_pagamento_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_gerar_codigo_solicitacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.codigo is null then
    new.codigo := 'HSP-' || lpad(nextval('public.hospedagem_solicitacoes_codigo_seq')::text, 6, '0');
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_importar_diarias_json(p_linhas jsonb, p_importado_por uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total     INT := 0;
  v_ok        INT := 0;
  v_ignorados INT := 0;
  v_linha     JSONB;
BEGIN
  FOR v_linha IN SELECT jsonb_array_elements(p_linhas) LOOP
    v_total := v_total + 1;
    BEGIN
      IF (v_linha->>'data') IS NULL
         OR trim(v_linha->>'funcionario') = ''
         OR trim(v_linha->>'hotel')       = '' THEN
        v_ignorados := v_ignorados + 1;
        CONTINUE;
      END IF;

      INSERT INTO hospedagem_producao_diarias (
        data, regional, cidade, funcionario, status, hotel, localizacao,
        tipo_diaria, valor_diaria, local_trabalho, cliente, saldo,
        situacao_pgto, nfs, observacao, importado_por
      ) VALUES (
        (v_linha->>'data')::DATE,
        nullif(trim(v_linha->>'regional'),           ''),
        nullif(trim(v_linha->>'cidade'),             ''),
        trim(v_linha->>'funcionario'),
        nullif(upper(trim(v_linha->>'status')),      ''),
        trim(v_linha->>'hotel'),
        nullif(trim(v_linha->>'localizacao'),        ''),
        nullif(upper(trim(v_linha->>'tipo_diaria')), ''),
        hospedagem_parse_money(v_linha->>'valor_diaria'),
        nullif(trim(v_linha->>'local_trabalho'),     ''),
        nullif(trim(v_linha->>'cliente'),            ''),
        hospedagem_parse_money(v_linha->>'saldo'),
        nullif(trim(v_linha->>'situacao_pgto'),      ''),
        nullif(trim(v_linha->>'nfs'),                ''),
        nullif(trim(v_linha->>'observacao'),         ''),
        p_importado_por
      )
      ON CONFLICT (data, lower(trim(funcionario)), lower(trim(hotel)))
      DO UPDATE SET
        regional       = EXCLUDED.regional,
        cidade         = EXCLUDED.cidade,
        status         = EXCLUDED.status,
        localizacao    = EXCLUDED.localizacao,
        tipo_diaria    = EXCLUDED.tipo_diaria,
        valor_diaria   = EXCLUDED.valor_diaria,
        local_trabalho = EXCLUDED.local_trabalho,
        cliente        = EXCLUDED.cliente,
        saldo          = EXCLUDED.saldo,
        situacao_pgto  = EXCLUDED.situacao_pgto,
        nfs            = EXCLUDED.nfs,
        observacao     = EXCLUDED.observacao,
        importado_por  = EXCLUDED.importado_por;

      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      v_ignorados := v_ignorados + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'total_linhas', v_total,
    'inseridos',    v_ok,
    'ignorados',    v_ignorados
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_importar_hoteis_json(p_linhas jsonb)
 RETURNS TABLE(total_linhas integer, inseridos integer, atualizados integer, ignorados integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r jsonb;
  v_total int := 0;
  v_inseridos int := 0;
  v_atualizados int := 0;
  v_ignorados int := 0;

  v_id uuid;
  v_hotel_raw text;
  v_nome text;
  v_cidade_raw text;
  v_cidade text;
  v_uf text;
  v_diaria_raw text;
  v_diaria numeric;
  v_diaria_individual_raw text;
  v_diaria_duplo_raw text;
  v_diaria_triplo_raw text;
  v_diaria_quadruplo_raw text;
  v_diaria_individual numeric;
  v_diaria_duplo numeric;
  v_diaria_triplo numeric;
  v_diaria_quadruplo numeric;
  v_maps text;
  v_whatsapp text;
  v_cnpj text;
  v_endereco text;
  v_obs text;
  v_status text;
  v_prioridade text;
  v_tmp record;
  v_linhas text[];
begin
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then
    total_linhas := 0;
    inseridos := 0;
    atualizados := 0;
    ignorados := 0;
    return next;
    return;
  end if;

  for r in select value from jsonb_array_elements(p_linhas) loop
    v_total := v_total + 1;

    v_hotel_raw := public.hospedagem_json_get(r, array['HOTEL','NOME HOTEL','NOME DO HOTEL','HOSPEDAGEM']);
    v_cidade_raw := public.hospedagem_json_get(r, array['CIDADE','MUNICIPIO','MUNICÍPIO']);
    v_uf := upper(public.hospedagem_json_get(r, array['UF','ESTADO']));
    v_diaria_raw := public.hospedagem_json_get(r, array['VALOR','VALOR DIÁRIA','VALOR DIARIA','DIÁRIA','DIARIA','R$ POR DIA','R POR DIA','VLR DÍARIA','VLR DIARIA','VALOR DIARIO','DIARIA PADRAO','DIÁRIA PADRÃO']);
    v_diaria_individual_raw := public.hospedagem_json_get(r, array['INDIVIDUAL','DIARIA INDIVIDUAL','DIÁRIA INDIVIDUAL','VALOR INDIVIDUAL','VLR INDIVIDUAL','SINGLE']);
    v_diaria_duplo_raw := public.hospedagem_json_get(r, array['DUPLO','DIARIA DUPLO','DIÁRIA DUPLO','VALOR DUPLO','VLR DUPLO','CASAL','DOUBLE']);
    v_diaria_triplo_raw := public.hospedagem_json_get(r, array['TRIPLO','DIARIA TRIPLO','DIÁRIA TRIPLO','VALOR TRIPLO','VLR TRIPLO']);
    v_diaria_quadruplo_raw := public.hospedagem_json_get(r, array['QUADRUPLO','QUÁDRUPLO','QUARTO QUADRUPLO','DIARIA QUADRUPLO','DIÁRIA QUÁDRUPLO','DIÁRIA QUADRUPLO','VALOR QUADRUPLO','VLR QUADRUPLO']);
    v_maps := public.hospedagem_json_get(r, array['LOCALIZAÇÃO','LOCALIZACAO','LINK GOOGLE MAPS','GOOGLE MAPS','MAPS','LINK MAPS']);
    v_whatsapp := public.hospedagem_json_get(r, array['WHATSAPP','TELEFONE','CONTATO','CELULAR']);
    v_cnpj := public.hospedagem_json_get(r, array['CNPJ/CPF','CNPJ CPF','CNPJ','CPF']);
    v_endereco := public.hospedagem_json_get(r, array['ENDEREÇO','ENDERECO','LOCAL','LOCAL DE EMBARQUE']);
    v_status := upper(coalesce(public.hospedagem_json_get(r, array['STATUS']), 'ATIVO'));
    v_prioridade := upper(coalesce(public.hospedagem_json_get(r, array['PRIORIDADE']), 'NORMAL'));

    if coalesce(v_hotel_raw, '') = '' then
      v_ignorados := v_ignorados + 1;
      continue;
    end if;

    v_linhas := regexp_split_to_array(v_hotel_raw, E'\n+');
    v_nome := nullif(btrim(regexp_replace(coalesce(v_linhas[1], v_hotel_raw), '\s*[-–—]+\s*$', '', 'g')), '');

    if coalesce(v_cidade_raw, '') = '' and array_length(v_linhas, 1) >= 2 then
      v_cidade_raw := nullif(btrim(v_linhas[2]), '');
    end if;

    select * into v_tmp from public.hospedagem_split_cidade_uf(v_cidade_raw);
    v_cidade := v_tmp.cidade;

    -- Prioridade: usa a coluna UF quando existir; senão extrai da cidade.
    if not public.hospedagem_uf_valida(v_uf) then
      v_uf := v_tmp.uf;
    end if;

    -- Segunda tentativa usando texto do hotel.
    if not public.hospedagem_uf_valida(v_uf) then
      select * into v_tmp from public.hospedagem_split_cidade_uf(v_hotel_raw);
      v_uf := v_tmp.uf;
      if coalesce(v_cidade, '') = '' then
        v_cidade := v_tmp.cidade;
      end if;
    end if;

    v_diaria := public.hospedagem_parse_money(v_diaria_raw);
    v_diaria_individual := public.hospedagem_parse_money(coalesce(v_diaria_individual_raw, v_diaria_raw));
    v_diaria_duplo := public.hospedagem_parse_money(v_diaria_duplo_raw);
    v_diaria_triplo := public.hospedagem_parse_money(v_diaria_triplo_raw);
    v_diaria_quadruplo := public.hospedagem_parse_money(v_diaria_quadruplo_raw);

    if coalesce(v_nome, '') = '' or coalesce(v_cidade, '') = '' or not public.hospedagem_uf_valida(v_uf) then
      v_ignorados := v_ignorados + 1;
      continue;
    end if;

    v_obs := concat_ws(' | ',
      case when v_diaria_raw is not null and v_diaria is not null and v_diaria_raw !~ '^\s*\d+([\.,]\d+)?\s*$' then 'Diária original: ' || v_diaria_raw end,
      case when public.hospedagem_json_get(r, array['OBSERVAÇÕES','OBSERVACOES','OBSERVAÇÃO','OBSERVACAO']) is not null then public.hospedagem_json_get(r, array['OBSERVAÇÕES','OBSERVACOES','OBSERVAÇÃO','OBSERVACAO']) end
    );

    -- MATCH FORTE: hotel + cidade + UF.
    select h.id into v_id
    from public.hospedagem_hoteis h
    where public.hospedagem_json_norm(h.nome) = public.hospedagem_json_norm(v_nome)
      and public.hospedagem_json_norm(coalesce(h.cidade, '')) = public.hospedagem_json_norm(coalesce(v_cidade, ''))
      and upper(coalesce(h.uf, '')) = upper(coalesce(v_uf, ''))
    order by h.id
    limit 1;

    -- MATCH DE SEGURANÇA: quando a cidade antiga estava com acento/espaço diferente,
    -- ainda atualiza pelo nome+UF para evitar cair em ignorado.
    if v_id is null then
      select h.id into v_id
      from public.hospedagem_hoteis h
      where public.hospedagem_json_norm(h.nome) = public.hospedagem_json_norm(v_nome)
        and upper(coalesce(h.uf, '')) = upper(coalesce(v_uf, ''))
      order by h.id
      limit 1;
    end if;

    if v_id is null then
      insert into public.hospedagem_hoteis (
        nome, cidade, uf, valor_diaria_padrao,
        valor_diaria_individual, valor_diaria_duplo, valor_diaria_triplo, valor_diaria_quadruplo,
        whatsapp, cnpj_cpf, endereco, link_maps,
        status, prioridade, observacoes
      ) values (
        v_nome,
        v_cidade,
        upper(v_uf),
        coalesce(v_diaria_individual, v_diaria),
        coalesce(v_diaria_individual, v_diaria),
        v_diaria_duplo,
        v_diaria_triplo,
        v_diaria_quadruplo,
        nullif(v_whatsapp, ''),
        nullif(v_cnpj, ''),
        nullif(v_endereco, ''),
        nullif(v_maps, ''),
        coalesce(nullif(v_status, ''), 'ATIVO'),
        coalesce(nullif(v_prioridade, ''), 'NORMAL'),
        nullif(v_obs, '')
      );

      v_inseridos := v_inseridos + 1;
    else
      update public.hospedagem_hoteis
      set
        nome = coalesce(v_nome, nome),
        cidade = coalesce(v_cidade, cidade),
        uf = upper(coalesce(v_uf, uf)),
        valor_diaria_padrao = coalesce(v_diaria_individual, v_diaria, valor_diaria_padrao),
        valor_diaria_individual = coalesce(v_diaria_individual, v_diaria, valor_diaria_individual, valor_diaria_padrao),
        valor_diaria_duplo = coalesce(v_diaria_duplo, valor_diaria_duplo),
        valor_diaria_triplo = coalesce(v_diaria_triplo, valor_diaria_triplo),
        valor_diaria_quadruplo = coalesce(v_diaria_quadruplo, valor_diaria_quadruplo),
        whatsapp = coalesce(nullif(v_whatsapp, ''), whatsapp),
        cnpj_cpf = coalesce(nullif(v_cnpj, ''), cnpj_cpf),
        endereco = coalesce(nullif(v_endereco, ''), endereco),
        link_maps = coalesce(nullif(v_maps, ''), link_maps),
        status = coalesce(nullif(v_status, ''), status, 'ATIVO'),
        prioridade = coalesce(nullif(v_prioridade, ''), prioridade, 'NORMAL'),
        observacoes = nullif(concat_ws(E'\n', nullif(observacoes, ''), nullif(v_obs, '')), ''),
        updated_at = case when exists (
          select 1
          from information_schema.columns c
          where c.table_schema = 'public'
            and c.table_name = 'hospedagem_hoteis'
            and c.column_name = 'updated_at'
        ) then now() else updated_at end
      where id = v_id;

      v_atualizados := v_atualizados + 1;
    end if;
  end loop;

  total_linhas := v_total;
  inseridos := v_inseridos;
  atualizados := v_atualizados;
  ignorados := v_ignorados;
  return next;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_json_get(p_obj jsonb, p_aliases text[])
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  k text;
  v text;
  a text;
begin
  if p_obj is null then
    return null;
  end if;

  for k, v in select key, value from jsonb_each_text(p_obj) loop
    foreach a in array p_aliases loop
      if public.hospedagem_json_norm(k) = public.hospedagem_json_norm(a) then
        v := nullif(btrim(regexp_replace(coalesce(v, ''), '\s+', ' ', 'g')), '');
        return v;
      end if;
    end loop;
  end loop;

  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_json_norm(p_val text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select regexp_replace(
           translate(lower(coalesce(p_val, '')),
             'áàãâäéèêëíìîïóòõôöúùûüçñÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ',
             'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn'
           ),
           '[^a-z0-9]+', '', 'g'
         );
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_json_texto(p_linha jsonb, p_chaves text[])
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  k text;
  v text;
begin
  foreach k in array p_chaves loop
    v := p_linha ->> k;

    if v is not null and trim(v) <> '' then
      return trim(v);
    end if;
  end loop;

  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_listar_hoteis()
 RETURNS SETOF hospedagem_hoteis
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select *
  from public.hospedagem_hoteis
  order by cidade asc nulls last, nome asc nulls last;
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_norm_texto(p_texto text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select nullif(
    regexp_replace(
      upper(trim(coalesce(p_texto, ''))),
      '\s+',
      ' ',
      'g'
    ),
    ''
  );
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_normalizar_telefone(valor text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$
  select regexp_replace(coalesce(valor, ''), '[^0-9]+', '', 'g');
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_normalizar_texto(valor text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$
  select regexp_replace(
    translate(
      lower(coalesce(valor, '')),
      'áàãâäéèêëíìîïóòõôöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'
    ),
    '[^a-z0-9]+',
    '',
    'g'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_parse_money(p_val text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  raw text := coalesce(p_val, '');
  m text;
  normalized text;
begin
  if btrim(raw) = '' then
    return null;
  end if;

  -- Pega o primeiro valor monetário encontrado.
  m := substring(raw from '(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+(?:\.\d{1,2})?)');

  if m is null then
    return null;
  end if;

  if position(',' in m) > 0 then
    normalized := replace(replace(m, '.', ''), ',', '.');
  else
    normalized := m;
  end if;

  return normalized::numeric;
exception when others then
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_pode_criar_solicitacao_manual()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
      from public.app_usuarios au
      left join public.profiles p on p.id = auth.uid()
     where au.auth_user_id = auth.uid()
       and coalesce(au.ativo, true) = true
       and (
         lower(btrim(coalesce(p.role, ''))) = 'master'
         or coalesce(p.is_master, false)
         or (
           lower(btrim(coalesce(au.setor, ''))) in ('hotéis', 'hoteis')
           and lower(btrim(coalesce(p.role, ''))) = 'adm'
         )
       )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_pode_financeiro(p_editar boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.painel_has_module(
    array['financeiro_pagamentos','pagamentos','financeiro'],
    p_editar
  );
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_pode_operar(p_editar boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.painel_has_module(
    array['hotel','hotel_alojamentos','adm_hotel','hospedagem'],
    p_editar
  );
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_preencher_identidade_colaborador()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_cpf text;
  v_ids integer;
  v_cpfs integer;
begin
  if nullif(trim(new.nome_colaborador), '') is null then
    return new;
  end if;

  if new.colaborador_id is null or nullif(trim(coalesce(new.cpf, '')), '') is null then
    select
      count(distinct h.colaborador_id) filter (where h.colaborador_id is not null),
      min(h.colaborador_id::text) filter (where h.colaborador_id is not null)::uuid,
      count(distinct h.cpf) filter (where nullif(trim(coalesce(h.cpf, '')), '') is not null),
      min(h.cpf) filter (where nullif(trim(coalesce(h.cpf, '')), '') is not null)
    into v_ids, v_id, v_cpfs, v_cpf
    from public.hospedagem_solicitacao_colaboradores h
    where upper(trim(h.nome_colaborador)) = upper(trim(new.nome_colaborador))
      and (new.id is null or h.id <> new.id);

    if new.colaborador_id is null and v_ids = 1 then
      new.colaborador_id := v_id;
    end if;
    if nullif(trim(coalesce(new.cpf, '')), '') is null and v_cpfs = 1 then
      new.cpf := v_cpf;
    end if;
  end if;

  if new.colaborador_id is null or nullif(trim(coalesce(new.cpf, '')), '') is null then
    select
      count(distinct c.id),
      min(c.id::text)::uuid,
      count(distinct c.cpf) filter (where nullif(trim(coalesce(c.cpf, '')), '') is not null),
      min(c.cpf) filter (where nullif(trim(coalesce(c.cpf, '')), '') is not null)
    into v_ids, v_id, v_cpfs, v_cpf
    from public.colaboradores c
    where upper(trim(c.nome)) = upper(trim(new.nome_colaborador));

    if new.colaborador_id is null and v_ids = 1 then
      new.colaborador_id := v_id;
    end if;
    if nullif(trim(coalesce(new.cpf, '')), '') is null and v_cpfs = 1 then
      new.cpf := v_cpf;
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_realizar_checkout(p_reserva_id uuid, p_colaboradores jsonb, p_valor_diarias numeric, p_extras jsonb DEFAULT '[]'::jsonb, p_observacoes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_reserva public.hospedagem_reservas%rowtype;
  v_lote_id uuid;
  v_valor_extras numeric := 0;
  v_total numeric;
  v_selecionados int;
  v_ativos int;
  v_item jsonb;
  v_colaborador_id uuid;
  v_nome text;
begin
  if not public.hospedagem_pode_operar(true) then
    raise exception 'Sem permissao para realizar checkout' using errcode='42501';
  end if;
  if jsonb_typeof(coalesce(p_colaboradores,'[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_colaboradores,'[]'::jsonb))=0 then
    raise exception 'Selecione ao menos um colaborador';
  end if;
  if coalesce(p_valor_diarias,0) < 0 then raise exception 'Valor de diarias invalido'; end if;

  select * into v_reserva from public.hospedagem_reservas where id=p_reserva_id for update;
  if not found or v_reserva.status_hospedagem in ('CANCELADA','CHECKOUT_REALIZADO') then
    raise exception 'Reserva inexistente ou encerrada';
  end if;

  select coalesce(sum(
    case when lower(coalesce(x->>'tipo','adicional'))='desconto'
         then -abs(coalesce((x->>'valor')::numeric,0))
         else abs(coalesce((x->>'valor')::numeric,0)) end
  ),0) into v_valor_extras
  from jsonb_array_elements(coalesce(p_extras,'[]'::jsonb)) x;
  v_total := greatest(coalesce(p_valor_diarias,0)+v_valor_extras,0);

  insert into public.hospedagem_checkout_lotes
    (reserva_id,hotel_id,data_checkout,valor_diarias,valor_extras,valor_total,status,observacoes)
  values (p_reserva_id,v_reserva.hotel_id,current_date,p_valor_diarias,v_valor_extras,v_total,'PENDENTE',nullif(btrim(p_observacoes),''))
  returning id into v_lote_id;

  for v_item in select value from jsonb_array_elements(p_colaboradores) loop
    v_colaborador_id := nullif(v_item->>'solicitacao_colaborador_id','')::uuid;
    v_nome := coalesce(nullif(btrim(v_item->>'nome_colaborador'),''),'Nao informado');
    if v_colaborador_id is null or not exists (
      select 1 from public.hospedagem_reserva_colaboradores rc
      where rc.reserva_id=p_reserva_id and rc.solicitacao_colaborador_id=v_colaborador_id
    ) then
      raise exception 'Colaborador % nao pertence a reserva', v_nome;
    end if;
    insert into public.hospedagem_checkout_lote_colaboradores
      (lote_id,reserva_colaborador_id,solicitacao_colaborador_id,nome_colaborador)
    values (v_lote_id,v_colaborador_id,v_colaborador_id,v_nome);
    update public.hospedagem_reserva_colaboradores
    set status='CHECKOUT',checkout_em=now(),checkout_por=(select auth.uid()),updated_at=now()
    where reserva_id=p_reserva_id and solicitacao_colaborador_id=v_colaborador_id;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_extras,'[]'::jsonb)) loop
    if coalesce(abs((v_item->>'valor')::numeric),0)>0 then
      insert into public.hospedagem_custos_extras
        (solicitacao_id,reserva_id,tipo,descricao,quantidade,valor_unitario,valor_total)
      values (
        v_reserva.solicitacao_id,p_reserva_id,
        case when lower(coalesce(v_item->>'tipo',''))='desconto' then 'DESCONTO' else 'OUTROS' end,
        coalesce(nullif(btrim(v_item->>'descricao'),''),'Ajuste de checkout'),1,
        abs((v_item->>'valor')::numeric),abs((v_item->>'valor')::numeric)
      );
    end if;
  end loop;

  select count(*) into v_selecionados
  from public.hospedagem_reserva_colaboradores
  where reserva_id=p_reserva_id and status='CHECKOUT';
  select count(*) into v_ativos
  from public.hospedagem_reserva_colaboradores
  where reserva_id=p_reserva_id and status='HOSPEDADO';

  update public.hospedagem_reservas
  set status_hospedagem=case when v_ativos=0 then 'CHECKOUT_REALIZADO' else 'HOSPEDADO' end,
      valor_total_final=(select coalesce(sum(valor_total),0) from public.hospedagem_checkout_lotes where reserva_id=p_reserva_id and status<>'CANCELADO'),
      atualizado_por=(select auth.uid()),updated_at=now()
  where id=p_reserva_id;

  perform public.hospedagem_enviar_lote_financeiro(p_reserva_id,v_lote_id);
  return v_lote_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_refresh_supervisao_solicitacao(p_solicitacao_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_supervisao text;
begin
  select string_agg(distinct nullif(btrim(sc.supervisao), ''), ' | ' order by nullif(btrim(sc.supervisao), ''))
    into v_supervisao
    from public.hospedagem_solicitacao_colaboradores sc
   where sc.solicitacao_id = p_solicitacao_id
     and nullif(btrim(sc.supervisao), '') is not null;

  update public.hospedagem_solicitacoes
     set supervisao = v_supervisao
   where id = p_solicitacao_id
     and supervisao is distinct from v_supervisao;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_sincronizar_alerta_nf_existente()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_alerta constant text := '⚠ HOTEL NÃO EMITE NOTA FISCAL';
begin
  if new.emite_nota_fiscal = false then
    update public.financeiro_pagamentos fp
       set descricao = case
             when coalesce(fp.descricao, '') ~ '^⚠' then fp.descricao
             else '⚠ ' || coalesce(fp.descricao, 'Hospedagem')
           end,
           observacoes = case
             when position(v_alerta in coalesce(fp.observacoes, '')) > 0 then fp.observacoes
             else concat_ws(E'\n', v_alerta, nullif(fp.observacoes, ''))
           end
     where upper(coalesce(fp.origem_setor, '')) = 'HOSPEDAGEM'
       and upper(coalesce(fp.origem_tabela, '')) = 'HOSPEDAGEM_RESERVAS'
       and fp.origem_id in (
         select r.id from public.hospedagem_reservas r where r.hotel_id = new.id
       );
  else
    update public.financeiro_pagamentos fp
       set descricao = nullif(regexp_replace(coalesce(fp.descricao, ''), '^⚠\s*', ''), ''),
           observacoes = nullif(trim(both E'\n' from replace(coalesce(fp.observacoes, ''), v_alerta, '')), '')
     where upper(coalesce(fp.origem_setor, '')) = 'HOSPEDAGEM'
       and upper(coalesce(fp.origem_tabela, '')) = 'HOSPEDAGEM_RESERVAS'
       and fp.origem_id in (
         select r.id from public.hospedagem_reservas r where r.hotel_id = new.id
       );
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_sincronizar_status_legado()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.status := lower(coalesce(new.status_solicitacao, 'SOLICITADA'));
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_split_cidade_uf(p_cidade text, OUT cidade text, OUT uf text)
 RETURNS record
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  s text := btrim(regexp_replace(coalesce(p_cidade, ''), '\s+', ' ', 'g'));
  estados text[] := array['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
  sigla text;
begin
  cidade := null;
  uf := null;

  if s = '' then
    return;
  end if;

  foreach sigla in array estados loop
    if upper(s) ~ ('(^|[^A-Z])' || sigla || '$') then
      uf := sigla;
      cidade := nullif(btrim(regexp_replace(s, ('[/\s\-–—]*(\(?' || sigla || '\)?)$'), '', 'i')), '');
      return;
    end if;
  end loop;

  cidade := s;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_stamp_cancelamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status_solicitacao = 'CANCELADA'
     and old.status_solicitacao is distinct from 'CANCELADA' then
    new.cancelado_em := coalesce(new.cancelado_em, now());
    new.cancelado_por := coalesce(new.cancelado_por, auth.uid());
    new.updated_at := now();
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_sync_supervisao_colaborador()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_supervisao text;
begin
  if new.colaborador_id is not null then
    select c.supervisao
      into v_supervisao
      from public.colaboradores c
     where c.id = new.colaborador_id
     limit 1;

    if found then
      new.supervisao := v_supervisao;
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_sync_supervisao_solicitacao_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'DELETE' then
    perform public.hospedagem_refresh_supervisao_solicitacao(old.solicitacao_id);
    return old;
  end if;

  perform public.hospedagem_refresh_supervisao_solicitacao(new.solicitacao_id);

  if tg_op = 'UPDATE' and old.solicitacao_id is distinct from new.solicitacao_id then
    perform public.hospedagem_refresh_supervisao_solicitacao(old.solicitacao_id);
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_to_numeric(p_texto text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v text;
begin
  if p_texto is null or trim(p_texto) = '' then
    return null;
  end if;

  v := trim(p_texto);
  v := replace(v, ',', '.');
  v := regexp_replace(v, '[^0-9\.\-]', '', 'g');

  if v = '' or v = '-' then
    return null;
  end if;

  return v::numeric;
exception
  when others then
    return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.hospedagem_uf_valida(p_uf text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select upper(coalesce(p_uf, '')) = any(array['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']);
$function$
;

CREATE OR REPLACE FUNCTION public.invalidar_dashboard_cache_segmentado(p_origem text DEFAULT 'importar_relatorios'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count integer := 0;
begin
  delete from public.dashboard_cache
   where modulo in ('dashboard', 'gestor_app');
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_chamados_ti_gestor()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from app_usuarios u
    join app_perfis p on p.id = u.perfil_id
    where u.auth_user_id = auth.uid()
      and upper(p.codigo) in ('MASTER', 'ADMIN', 'ADM')
  )
  or exists (
    select 1
    from app_usuario_modulos um
    join app_usuarios u on u.id = um.usuario_id
    join app_modulos m on m.id = um.modulo_id
    where u.auth_user_id = auth.uid()
      and upper(m.codigo) = 'CHAMADOS_TI_GESTAO'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.limpar_patrimonios_snapshot()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  truncate table public.patrimonios_snapshot;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.match_ponto_embarque(p_embarque text, p_cliente text, p_supervisao text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_uf text;
  v_cidade text;
  v_local text;
  v_uf_key text;
  v_cidade_key text;
  v_local_key text;
  v_ponto_id uuid;
  v_quantidade integer;
begin
  select parsed.uf, parsed.cidade, parsed.local
    into v_uf, v_cidade, v_local
  from public.parse_embarque(p_embarque) parsed;

  if v_uf is null and v_cidade is null then
    return null;
  end if;

  v_uf_key := public.normalizar_chave_local(v_uf);
  v_cidade_key := public.normalizar_chave_local(v_cidade);
  v_local_key := public.normalizar_chave_local(v_local);

  -- Regra principal: UF + cidade + nome COMPLETO do local.
  if v_uf_key <> '' and v_cidade_key <> '' and v_local_key <> '' then
    select p.id
      into v_ponto_id
    from public.operacional_pontos_embarque p
    where p.ativo is true
      and p.latitude is not null
      and p.longitude is not null
      and public.normalizar_chave_local(p.uf) = v_uf_key
      and public.normalizar_chave_local(p.cidade) = v_cidade_key
      and public.normalizar_chave_local(p.nome_local) = v_local_key
    order by p.updated_at desc nulls last, p.id
    limit 1;

    if found then
      return v_ponto_id;
    end if;
  end if;

  -- Só usa cidade + local quando a fonte realmente não trouxe UF e existe um
  -- único cadastro possível. Com UF informada, não há aproximação automática.
  if v_uf_key = '' and v_cidade_key <> '' and v_local_key <> '' then
    select
      (array_agg(p.id order by p.updated_at desc nulls last, p.id))[1],
      count(*)
      into v_ponto_id, v_quantidade
    from public.operacional_pontos_embarque p
    where p.ativo is true
      and p.latitude is not null
      and p.longitude is not null
      and public.normalizar_chave_local(p.cidade) = v_cidade_key
      and public.normalizar_chave_local(p.nome_local) = v_local_key;

    if v_quantidade = 1 then
      return v_ponto_id;
    end if;
  end if;

  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.nhe_existe_movimento_real(p_data text, p_os text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.grm_producao_diaria_importacoes g
    where (g.dados_json->>'Data') = p_data
      and (g.dados_json->>'O.S.') = p_os
    limit 1
  );
$function$
;

CREATE OR REPLACE FUNCTION public.nhe_existe_nhe_real(p_data text, p_os text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.grm_nhe_importacoes g
    where (g.dados_json->>'lnsDate') = p_data
      and (g.dados_json->>'sorCode') = p_os
    limit 1
  );
$function$
;

CREATE OR REPLACE FUNCTION public.norm_txt(v text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select regexp_replace(
    lower(
      translate(
        coalesce(v, ''),
        'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
        'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
      )
    ),
    '[^a-z0-9]+',
    '',
    'g'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.normalizar_chave_local(txt text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select regexp_replace(
    upper(
      translate(
        coalesce(txt, ''),
        'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
        'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
      )
    ),
    '[^A-Z0-9]+',
    '',
    'g'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.normalizar_embarque_texto(txt text)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select unaccent(upper(coalesce(txt, '')));
$function$
;

CREATE OR REPLACE FUNCTION public.normalizar_producao_snapshot_tons()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.tons is not null
     and new.cargas is not null
     and new.cargas > 0
     and new.tons / new.cargas >= 1000
     and (new.tons / 10000.0) / new.cargas between 0.1 and 100
  then
    new.tons := new.tons / 10000.0;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public."normalize"(value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select lower(trim(coalesce(value,'')))
$function$
;

CREATE OR REPLACE FUNCTION public.notificar_nf_pendentes_atrasadas()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_url text;
  v_key text;
  v_total int;
  v_valor numeric;
  v_mais_antiga date;
  v_mensagem text;
  v_ids uuid[];
  v_contato record;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if v_url is null or v_key is null then
    raise warning 'notificar_nf_pendentes_atrasadas: project_url/service_role_key ausentes em vault.decrypted_secrets';
    return;
  end if;

  select array_agg(id), count(*), sum(valor_total), min(comprado_em::date)
    into v_ids, v_total, v_valor, v_mais_antiga
  from public.compras_itens
  where status = 'comprado'
    and nf_url is not null
    and comprovante_url is not null
    and coalesce(nf_lancado, false) = false
    and comprado_em < now() - interval '5 days'
    and (nf_lembrete_enviado_em is null or nf_lembrete_enviado_em < now() - interval '7 days');

  if v_total is null or v_total = 0 then
    return;
  end if;

  v_mensagem := format(
    'Lembrete: Notas Fiscais pendentes de lançamento'||chr(10)||
    '%s nota(s) fiscal(is) aguardando lançamento no painel (aba Pendentes)'||chr(10)||
    'Valor total: R$ %s'||chr(10)||
    'Mais antiga desde: %s',
    v_total, to_char(v_valor, 'FM999G999G990D00'), to_char(v_mais_antiga, 'DD/MM/YYYY')
  );

  for v_contato in
    select telefone, nome from public.compras_notificacoes_config
    where setor = 'NOTAS_FISCAIS' and ativo = true and telefone is not null
  loop
    perform net.http_post(
      url := v_url || '/functions/v1/botconversa-send',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body := jsonb_build_object('phone', regexp_replace(v_contato.telefone, '\D', '', 'g'), 'message', v_mensagem, 'nome', coalesce(v_contato.nome, '')),
      timeout_milliseconds := 30000
    );
  end loop;

  update public.compras_itens set nf_lembrete_enviado_em = now() where id = any(v_ids);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.operacional_auditoria_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  if new.nome_chave is null or trim(new.nome_chave) = '' then
    new.nome_chave := upper(regexp_replace(translate(coalesce(new.nome_colaborador, ''), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ', 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'), '[^A-Za-z0-9]+', ' ', 'g'));
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.operacional_colaborador_base_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  if new.nome_chave is null or trim(new.nome_chave) = '' then
    new.nome_chave := upper(regexp_replace(translate(coalesce(new.nome, ''), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ', 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'), '[^A-Za-z0-9]+', ' ', 'g'));
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.operacional_distancia_km(lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
    when lat1 is null or lon1 is null or lat2 is null or lon2 is null then null
    else round((st_distance(
      st_setsrid(st_makepoint(lon1::float8, lat1::float8), 4326)::geography,
      st_setsrid(st_makepoint(lon2::float8, lat2::float8), 4326)::geography
    ) / 1000)::numeric, 2)
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.operacional_laudos_calcular_suspeita()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_raio_os_km numeric := 1.0;
  v_raio_casa_km numeric := 1.0;
  v_cpf_norm text;
begin
  select os.numero_os, os.cliente, os.supervisao, os.ponto1_latitude, os.ponto1_longitude
    into new.numero_os, new.cliente, new.supervisao, new.os_latitude, new.os_longitude
  from public.operacional_os os
  where os.id = new.os_id;

  select ac.colaborador_key, coalesce(ac.colaborador_nome, ac.colaborador_key),
    coalesce(nullif(regexp_replace(coalesce(ac.colaborador_cpf, ''), '\D', '', 'g'), ''),
              regexp_replace(coalesce(ac.colaborador_key, ''), '\D', '', 'g'))
    into new.colaborador_key, new.colaborador_nome, v_cpf_norm
  from public.operacional_os_colaboradores ac
  where ac.os_id = new.os_id
  order by ac.created_at desc nulls last
  limit 1;

  if v_cpf_norm is not null and v_cpf_norm <> '' then
    select cz.latitude, cz.longitude, cz.coordenacao
      into new.colaborador_latitude, new.colaborador_longitude, new.coordenacao
    from public.colaborador_cruzamento cz
    where cz.cpf = v_cpf_norm
    order by cz.atualizado_em desc
    limit 1;
  end if;

  if new.geo_latitude is not null and new.os_latitude is not null and new.os_longitude is not null then
    new.distancia_os_km := 2 * 6371 * asin(sqrt(
      sin(radians(new.os_latitude - new.geo_latitude) / 2) ^ 2 +
      cos(radians(new.geo_latitude)) * cos(radians(new.os_latitude)) * sin(radians(new.os_longitude - new.geo_longitude) / 2) ^ 2
    ));
  end if;

  if new.geo_latitude is not null and new.colaborador_latitude is not null and new.colaborador_longitude is not null then
    new.distancia_casa_km := 2 * 6371 * asin(sqrt(
      sin(radians(new.colaborador_latitude - new.geo_latitude) / 2) ^ 2 +
      cos(radians(new.geo_latitude)) * cos(radians(new.colaborador_latitude)) * sin(radians(new.colaborador_longitude - new.geo_longitude) / 2) ^ 2
    ));
  end if;

  new.avaliado := new.geo_latitude is not null and (new.os_latitude is not null or new.colaborador_latitude is not null);
  new.suspeito := new.avaliado
    and not (
      (new.distancia_os_km is not null and new.distancia_os_km <= v_raio_os_km)
      or (new.distancia_casa_km is not null and new.distancia_casa_km <= v_raio_casa_km)
    );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.operacional_os_limpar_vinculos_sem_atendimento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status_gestor = 'AGUARDAR' then
    delete from public.operacional_os_colaboradores
    where os_id = new.id;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.operacional_os_preservar_status_programacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status_gestor is null
     and old.status_gestor in ('ATENDER', 'AGUARDAR')
     and exists (
       select 1
       from public.programacao_equipe e
       join public.programacao_dia p on p.id = e.programacao_id
       where e.os_id = old.id
         and e.confirmado is true
         and p.data_referencia >= current_date
     ) then
    new.status_gestor := old.status_gestor;
    new.configurada_em := coalesce(new.configurada_em, old.configurada_em);
    new.data_os := coalesce(new.data_os, old.data_os);
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.operacional_pontos_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.operacional_ranking_embarque(p_embarque_id uuid)
 RETURNS TABLE(colaborador_base_id uuid, nome text, tipo_mao_obra text, cidade_base text, uf_base character, distancia_km numeric, hotel_id uuid, hotel_nome text, hotel_diaria numeric, hotel_distancia_km numeric, valor_passagem numeric, valor_mao_obra numeric, valor_alimentacao numeric, custo_total numeric, score_auditoria numeric, score_final numeric, classificacao text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_emb public.operacional_embarques%rowtype;
begin
  select * into v_emb from public.operacional_embarques where id = p_embarque_id;

  if not found then
    raise exception 'Embarque não encontrado: %', p_embarque_id;
  end if;

  return query
  with base as (
    select
      c.id as colaborador_base_id,
      c.nome,
      c.tipo_mao_obra,
      c.cidade_base,
      c.uf_base,
      c.valor_diaria,
      c.valor_alimentacao,
      public.operacional_distancia_km(c.latitude, c.longitude, v_emb.latitude, v_emb.longitude) as distancia_km,
      coalesce((
        select p.valor_estimado
        from public.operacional_passagens_cache p
        where upper(p.origem_cidade) = upper(c.cidade_base)
          and upper(p.origem_uf) = upper(c.uf_base)
          and upper(p.destino_cidade) = upper(v_emb.cidade)
          and upper(p.destino_uf) = upper(v_emb.uf)
          and (p.validade_ate is null or p.validade_ate >= current_date)
        order by p.data_cotacao desc
        limit 1
      ), 0) as valor_passagem,
      greatest(0, 100 - coalesce((
        select sum(a.score_impacto)
        from public.operacional_auditoria_colaborador a
        where (a.colaborador_id = c.colaborador_id and c.colaborador_id is not null)
           or upper(a.nome_colaborador) = upper(c.nome)
      ), 0)) as score_auditoria
    from public.operacional_colaborador_base c
    where c.ativo = true
  ), hotel_proximo as (
    select distinct on (b.colaborador_base_id)
      b.colaborador_base_id,
      h.id as hotel_id,
      h.nome as hotel_nome,
      coalesce(h.diaria_individual, h.diaria_duplo, h.diaria_triplo, h.diaria_quadruplo, 0) as hotel_diaria,
      public.operacional_distancia_km(h.latitude, h.longitude, v_emb.latitude, v_emb.longitude) as hotel_distancia_km
    from base b
    left join public.operacional_hoteis h
      on h.ativo = true
     and upper(h.cidade) = upper(v_emb.cidade)
     and upper(h.uf) = upper(v_emb.uf)
    order by b.colaborador_base_id,
      public.operacional_distancia_km(h.latitude, h.longitude, v_emb.latitude, v_emb.longitude) nulls last,
      coalesce(h.diaria_individual, h.diaria_duplo, h.diaria_triplo, h.diaria_quadruplo, 999999)
  ), calculo as (
    select
      b.colaborador_base_id,
      b.nome,
      b.tipo_mao_obra,
      b.cidade_base,
      b.uf_base,
      b.distancia_km,
      h.hotel_id,
      h.hotel_nome,
      coalesce(h.hotel_diaria, 0) as hotel_diaria,
      h.hotel_distancia_km,
      b.valor_passagem,
      case when b.tipo_mao_obra = 'diarista' then coalesce(b.valor_diaria,0) else 0 end as valor_mao_obra,
      coalesce(b.valor_alimentacao,30) as valor_alimentacao,
      (
        coalesce(b.valor_passagem,0) +
        coalesce(h.hotel_diaria,0) +
        case when b.tipo_mao_obra = 'diarista' then coalesce(b.valor_diaria,0) else 0 end +
        coalesce(b.valor_alimentacao,30)
      ) as custo_total,
      b.score_auditoria
    from base b
    left join hotel_proximo h on h.colaborador_base_id = b.colaborador_base_id
  )
  select
    c.colaborador_base_id,
    c.nome,
    c.tipo_mao_obra,
    c.cidade_base,
    c.uf_base,
    c.distancia_km,
    c.hotel_id,
    c.hotel_nome,
    c.hotel_diaria,
    c.hotel_distancia_km,
    c.valor_passagem,
    c.valor_mao_obra,
    c.valor_alimentacao,
    c.custo_total,
    c.score_auditoria,
    round((
      c.score_auditoria
      - coalesce(c.custo_total,0) / 20
      - coalesce(c.distancia_km,0) / 10
      + case when v_emb.volume_ton >= 1000 and c.score_auditoria >= 85 then 15 else 0 end
      + case when c.tipo_mao_obra = 'efetivo' then 10 else 0 end
    )::numeric, 2) as score_final,
    case
      when (
        c.score_auditoria - coalesce(c.custo_total,0) / 20 - coalesce(c.distancia_km,0) / 10
      ) >= 80 then 'recomendado'
      when (
        c.score_auditoria - coalesce(c.custo_total,0) / 20 - coalesce(c.distancia_km,0) / 10
      ) >= 55 then 'avaliar'
      else 'nao_recomendado'
    end as classificacao
  from calculo c
  order by score_final desc, custo_total asc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.painel_current_context()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ctx jsonb;
begin
  select to_jsonb(public.rpc_get_user_context()) into ctx;
  return coalesce(ctx, '{}'::jsonb);
exception when others then
  return '{}'::jsonb;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.painel_has_module(module_codes text[], require_edit boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ctx as (
    select public.painel_current_context() as value
  ), modules as (
    select module
    from ctx,
    lateral jsonb_array_elements(coalesce(value -> 'modules', '[]'::jsonb)) as module
  )
  select public.painel_is_master() or exists (
    select 1
    from modules
    where lower(coalesce(module ->> 'code', module ->> 'codigo', '')) = any (
      select lower(code) from unnest(module_codes) as code
    )
      and lower(coalesce(module ->> 'can_view', module ->> 'pode_ver', 'true')) in ('true', 't', '1', 'yes', 'sim')
      and (
        not require_edit
        or lower(coalesce(module ->> 'can_edit', module ->> 'pode_editar', 'false')) in ('true', 't', '1', 'yes', 'sim')
        or lower(coalesce(module ->> 'can_create', module ->> 'pode_criar', 'false')) in ('true', 't', '1', 'yes', 'sim')
        or lower(coalesce(module ->> 'can_approve', module ->> 'pode_aprovar', 'false')) in ('true', 't', '1', 'yes', 'sim')
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.painel_is_master()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select lower(coalesce(public.painel_current_context() #>> '{user,is_master}', 'false')) in ('true', 't', '1', 'yes', 'sim')
      or lower(coalesce(public.painel_current_context() #>> '{user,role}', '')) = 'master';
$function$
;

CREATE OR REPLACE FUNCTION public.parse_embarque(txt text)
 RETURNS TABLE(uf text, cidade text, local text)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_raw text := btrim(coalesce(txt, ''));
  v_prefixo text[];
  v_partes text[];
  v_restante text;
  v_abre_parenteses integer;
begin
  v_prefixo := regexp_match(v_raw, '^([A-Za-z]{2})\s*-\s*(.*)$');

  if v_prefixo is null then
    return query select null::text, null::text, null::text;
    return;
  end if;

  v_restante := btrim(v_prefixo[2]);
  v_abre_parenteses := strpos(v_restante, '(');

  -- Usa o primeiro "(" e o último ")", preservando parênteses que façam parte
  -- do nome do local, por exemplo: MOAGEIRA IRATI CEREAIS S/A (MATRIZ).
  if v_abre_parenteses > 0 and right(v_restante, 1) = ')' then
    return query
      select
        upper(v_prefixo[1]),
        btrim(substring(v_restante from 1 for v_abre_parenteses - 1)),
        btrim(substring(
          v_restante
          from v_abre_parenteses + 1
          for char_length(v_restante) - v_abre_parenteses - 1
        ));
    return;
  end if;

  -- Compatibilidade com fontes que enviam "UF - Cidade - Local".
  v_partes := regexp_match(v_restante, '^(.*?)\s+-\s+(.+)$');
  if v_partes is not null then
    return query
      select upper(v_prefixo[1]), btrim(v_partes[1]), btrim(v_partes[2]);
    return;
  end if;

  return query select upper(v_prefixo[1]), v_restante, ''::text;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.processar_cargas_geofence(p_data date)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  insert into public.logistica_cargas_irregularidades (
    data_ref,
    os,
    cliente,
    coordenacao,
    supervisao,
    colaborador,
    placa,
    nota_fiscal,
    lat_lancamento,
    lng_lancamento,
    lat_os,
    lng_os,
    distancia_metros,
    status,
    criado_em,
    dados_json
  )
  select
    c.data_classificacao::date as data_ref,
    c.os,
    c.cliente,
    c.coordenacao,
    c.supervisao,
    c.colaborador,
    c.placa,
    c.nota_fiscal,
    c.lat_lancamento,
    c.lng_lancamento,
    o.ponto1_latitude,
    o.ponto1_longitude,
    (
      6371000 * 2 * asin(
        sqrt(
          power(sin(radians((o.ponto1_latitude - c.lat_lancamento) / 2)), 2)
          +
          cos(radians(c.lat_lancamento))
          * cos(radians(o.ponto1_latitude))
          * power(sin(radians((o.ponto1_longitude - c.lng_lancamento) / 2)), 2)
        )
      )
    ) as distancia_metros,
    'ABERTA',
    now(),
    c.dados_json
  from public.grm_cargas_importacoes c
  join public.operacional_os o
    on regexp_replace(c.os::text, '\D', '', 'g')
     = regexp_replace(o.numero_os::text, '\D', '', 'g')
  where c.data_classificacao::date = p_data
    and c.lat_lancamento is not null
    and c.lng_lancamento is not null
    and o.ponto1_latitude is not null
    and o.ponto1_longitude is not null
    and (
      6371000 * 2 * asin(
        sqrt(
          power(sin(radians((o.ponto1_latitude - c.lat_lancamento) / 2)), 2)
          +
          cos(radians(c.lat_lancamento))
          * cos(radians(o.ponto1_latitude))
          * power(sin(radians((o.ponto1_longitude - c.lng_lancamento) / 2)), 2)
        )
      )
    ) > 2000
  on conflict do nothing;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.processar_cargas_geofence(p_data date, p_raio_m integer DEFAULT 2000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_total_linhas integer := 0;
  v_total_com_coordenada integer := 0;
  v_total_sem_referencia_os integer := 0;
  v_total_irregularidades integer := 0;
begin
  select count(*)
    into v_total_linhas
  from public.grm_cargas_importacoes c
  where c.data_classificacao = p_data;

  select count(*)
    into v_total_com_coordenada
  from public.grm_cargas_importacoes c
  where c.data_classificacao = p_data
    and c.lat_lancamento is not null
    and c.lng_lancamento is not null;

  with cargas as (
    select
      c.*,
      regexp_replace(coalesce(c.os::text, ''), '\D', '', 'g') as os_norm
    from public.grm_cargas_importacoes c
    where c.data_classificacao = p_data
      and c.lat_lancamento is not null
      and c.lng_lancamento is not null
  ),
  os_ref as (
    select distinct on (x.os_norm)
      x.os_norm,
      x.numero_os,
      x.ponto1_latitude::double precision as lat_os,
      x.ponto1_longitude::double precision as lng_os,
      x.embarque,
      x.ponto1_nome
    from (
      select
        regexp_replace(coalesce(o.numero_os::text, ''), '\D', '', 'g') as os_norm,
        o.numero_os,
        o.ponto1_latitude,
        o.ponto1_longitude,
        o.embarque,
        o.ponto1_nome
      from public.operacional_os o
      where o.ponto1_latitude is not null
        and o.ponto1_longitude is not null
    ) x
    where x.os_norm <> ''
    order by x.os_norm, x.numero_os
  ),
  joined as (
    select c.*, o.lat_os, o.lng_os
    from cargas c
    left join os_ref o on c.os_norm = o.os_norm
  )
  select count(*)
    into v_total_sem_referencia_os
  from joined
  where lat_os is null or lng_os is null;

  with cargas as (
    select
      c.*,
      regexp_replace(coalesce(c.os::text, ''), '\D', '', 'g') as os_norm
    from public.grm_cargas_importacoes c
    where c.data_classificacao = p_data
      and c.lat_lancamento is not null
      and c.lng_lancamento is not null
  ),
  os_ref as (
    select distinct on (x.os_norm)
      x.os_norm,
      x.numero_os,
      x.ponto1_latitude::double precision as lat_os,
      x.ponto1_longitude::double precision as lng_os,
      x.embarque,
      x.ponto1_nome
    from (
      select
        regexp_replace(coalesce(o.numero_os::text, ''), '\D', '', 'g') as os_norm,
        o.numero_os,
        o.ponto1_latitude,
        o.ponto1_longitude,
        o.embarque,
        o.ponto1_nome
      from public.operacional_os o
      where o.ponto1_latitude is not null
        and o.ponto1_longitude is not null
    ) x
    where x.os_norm <> ''
    order by x.os_norm, x.numero_os
  ),
  joined as (
    select
      c.*,
      o.lat_os,
      o.lng_os,
      o.embarque,
      o.ponto1_nome
    from cargas c
    join os_ref o on c.os_norm = o.os_norm
  ),
  calc_base as (
    select
      j.*,
      (
        power(sin(radians((j.lat_os - j.lat_lancamento) / 2)), 2)
        +
        cos(radians(j.lat_lancamento))
        * cos(radians(j.lat_os))
        * power(sin(radians((j.lng_os - j.lng_lancamento) / 2)), 2)
      ) as hav_a
    from joined j
  ),
  calc as (
    select
      cb.*,
      round(
        (
          6371000 * 2 * asin(
            sqrt(least(1, greatest(0, cb.hav_a)))
          )
        )::numeric
      )::integer as distancia_m
    from calc_base cb
  ),
  irreg as (
    select *
    from calc
    where distancia_m > p_raio_m
  )
  select count(*)
    into v_total_irregularidades
  from irreg;

  with cargas as (
    select
      c.*,
      regexp_replace(coalesce(c.os::text, ''), '\D', '', 'g') as os_norm
    from public.grm_cargas_importacoes c
    where c.data_classificacao = p_data
      and c.lat_lancamento is not null
      and c.lng_lancamento is not null
  ),
  os_ref as (
    select distinct on (x.os_norm)
      x.os_norm,
      x.numero_os,
      x.ponto1_latitude::double precision as lat_os,
      x.ponto1_longitude::double precision as lng_os,
      x.embarque,
      x.ponto1_nome
    from (
      select
        regexp_replace(coalesce(o.numero_os::text, ''), '\D', '', 'g') as os_norm,
        o.numero_os,
        o.ponto1_latitude,
        o.ponto1_longitude,
        o.embarque,
        o.ponto1_nome
      from public.operacional_os o
      where o.ponto1_latitude is not null
        and o.ponto1_longitude is not null
    ) x
    where x.os_norm <> ''
    order by x.os_norm, x.numero_os
  ),
  joined as (
    select
      c.*,
      o.lat_os,
      o.lng_os,
      o.embarque,
      o.ponto1_nome
    from cargas c
    join os_ref o on c.os_norm = o.os_norm
  ),
  calc_base as (
    select
      j.*,
      (
        power(sin(radians((j.lat_os - j.lat_lancamento) / 2)), 2)
        +
        cos(radians(j.lat_lancamento))
        * cos(radians(j.lat_os))
        * power(sin(radians((j.lng_os - j.lng_lancamento) / 2)), 2)
      ) as hav_a
    from joined j
  ),
  calc as (
    select
      cb.*,
      round(
        (
          6371000 * 2 * asin(
            sqrt(least(1, greatest(0, cb.hav_a)))
          )
        )::numeric
      )::integer as distancia_m
    from calc_base cb
  ),
  irreg as (
    select *
    from calc
    where distancia_m > p_raio_m
  )
  insert into public.logistica_cargas_irregularidades (
    chave_unica,
    data_classificacao,
    os,
    cliente,
    coordenacao,
    supervisao,
    colaborador,
    placa,
    laudo,
    nota_fiscal,
    produto,
    tons,
    lat_lancamento,
    lng_lancamento,
    lat_os,
    lng_os,
    distancia_m,
    raio_m,
    status,
    origem,
    observacao,
    raw,
    ultima_verificacao_em
  )
  select
    i.chave_unica,
    i.data_classificacao,
    i.os,
    i.cliente,
    i.coordenacao,
    i.supervisao,
    i.colaborador,
    i.placa,
    i.laudo,
    i.nota_fiscal,
    coalesce(i.dados_json->>'Produto', i.dados_json->>'produto') as produto,
    null::numeric as tons,
    i.lat_lancamento,
    i.lng_lancamento,
    i.lat_os,
    i.lng_os,
    i.distancia_m,
    p_raio_m,
    'ABERTA',
    'grm_relatorio_cargas',
    'Carga lançada fora do raio de ' || p_raio_m || 'm do local da O.S.',
    jsonb_build_object(
      'carga', i.dados_json,
      'os_ref', jsonb_build_object(
        'tabela', 'operacional_os',
        'numero_os', i.os,
        'embarque', i.embarque,
        'ponto1_nome', i.ponto1_nome
      )
    ),
    now()
  from irreg i
  on conflict (chave_unica) do update set
    cliente = excluded.cliente,
    coordenacao = excluded.coordenacao,
    supervisao = excluded.supervisao,
    colaborador = excluded.colaborador,
    placa = excluded.placa,
    laudo = excluded.laudo,
    nota_fiscal = excluded.nota_fiscal,
    produto = excluded.produto,
    tons = excluded.tons,
    lat_lancamento = excluded.lat_lancamento,
    lng_lancamento = excluded.lng_lancamento,
    lat_os = excluded.lat_os,
    lng_os = excluded.lng_os,
    distancia_m = excluded.distancia_m,
    raio_m = excluded.raio_m,
    observacao = excluded.observacao,
    raw = excluded.raw,
    ultima_verificacao_em = now(),
    updated_at = now();

  return jsonb_build_object(
    'data_ref', p_data,
    'raio_m', p_raio_m,
    'total_linhas', v_total_linhas,
    'total_com_coordenada', v_total_com_coordenada,
    'total_sem_referencia_os', v_total_sem_referencia_os,
    'total_irregularidades', v_total_irregularidades,
    'processado_em', now()
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.programacao_caronas_dados(p_programacao_id uuid)
 RETURNS TABLE(colaborador_id text, nome text, lat numeric, lng numeric, tem_frota boolean, veiculo_placa text, os_id uuid, numero_os text, cliente text, ponto_id uuid, embarque_label text, emb_lat numeric, emb_lng numeric, veiculo_proprio boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with cz_best as (
    select distinct on (cpf) cpf, latitude, longitude, veiculo_id, veiculo_placa
    from colaborador_cruzamento
    where cpf <> ''
    order by cpf, atualizado_em desc
  )
  select
    e.colaborador_id,
    e.nome_colaborador as nome,
    cz.latitude as lat,
    cz.longitude as lng,
    (cz.veiculo_id is not null) as tem_frota,
    cz.veiculo_placa,
    e.os_id,
    o.numero_os,
    o.cliente,
    o.ponto_embarque_id as ponto_id,
    p.embarque_label,
    p.latitude as emb_lat,
    p.longitude as emb_lng,
    exists (
      select 1 from programacao_veiculo_proprio vp
      where vp.ativo and (
        vp.colaborador_id = e.colaborador_id
        or unaccent(upper(btrim(coalesce(vp.nome, '')))) = unaccent(upper(btrim(coalesce(e.nome_colaborador, ''))))
      )
    ) as veiculo_proprio
  from programacao_equipe e
  join operacional_os o on o.id = e.os_id
  left join operacional_pontos_embarque p on p.id = o.ponto_embarque_id
  left join cz_best cz
    on cz.cpf = regexp_replace(coalesce(e.colaborador_id, ''), '\D', '', 'g')
   and regexp_replace(coalesce(e.colaborador_id, ''), '\D', '', 'g') <> ''
  where e.programacao_id = p_programacao_id and e.confirmado = true;
$function$
;

CREATE OR REPLACE FUNCTION public.programacao_colaboradores_supervisao(p_supervisao text)
 RETURNS TABLE(colaborador_id text, nome text, cargo text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with base as (
    select distinct on (coalesce(nullif(regexp_replace(coalesce(cs.cpf, ''), '\D', '', 'g'), ''), cs.nome))
      coalesce(nullif(regexp_replace(coalesce(cs.cpf, ''), '\D', '', 'g'), ''), cs.nome) as colaborador_id,
      cs.nome,
      cs.cargo
    from colaboradores_atuais cs
    where cs.supervisao = p_supervisao
      and cs.ativo is distinct from false
      and cs.desligamento is null
      and upper(coalesce(cs.situacao, '')) not in ('NAO ATIVO','NAO ATIVA','INATIVO','INATIVA','DESLIGADO','DESLIGADA','DEMITIDO','DEMITIDA')
    order by coalesce(nullif(regexp_replace(coalesce(cs.cpf, ''), '\D', '', 'g'), ''), cs.nome)
  )
  select colaborador_id, nome, cargo
  from base
  order by nome;
$function$
;

CREATE OR REPLACE FUNCTION public.programacao_despesa_compartilhar_por_dia()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  programacao_existente uuid;
begin
  if new.data_referencia is null or nullif(btrim(new.colaborador_id), '') is null then
    return new;
  end if;

  execute format(
    'select programacao_id
       from public.%I
      where data_referencia = $1
        and colaborador_id = $2
        and id is distinct from $3
      order by updated_at desc nulls last,
               created_at desc nulls last,
               id
      limit 1',
    tg_table_name
  )
  into programacao_existente
  using new.data_referencia, new.colaborador_id, new.id;

  if programacao_existente is not null then
    new.programacao_id := programacao_existente;
  end if;

  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION public.programacao_dia_sincroniza_os_atender()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.data_referencia is not distinct from old.data_referencia then
    return new;
  end if;

  update public.operacional_os o
     set status_gestor = 'ATENDER',
         data_os = new.data_referencia,
         configurada_em = coalesce(o.configurada_em, now()),
         updated_at = now()
    from public.programacao_equipe e
   where e.programacao_id = new.id
     and e.confirmado is true
     and e.os_id = o.id
     and coalesce(o.status_gestor, '') <> 'FINALIZAR';

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.programacao_equipe_marca_os_atender()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_data_referencia date;
begin
  if new.confirmado is distinct from true or new.os_id is null then
    return new;
  end if;

  select data_referencia into v_data_referencia
  from public.programacao_dia
  where id = new.programacao_id;

  if v_data_referencia is null then
    return new;
  end if;

  update public.operacional_os
  set status_gestor = 'ATENDER',
      data_os = v_data_referencia,
      configurada_em = coalesce(configurada_em, now()),
      updated_at = now()
  where id = new.os_id
    and coalesce(status_gestor, '') <> 'FINALIZAR';

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.programacao_equipe_validar_regional()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_data date;
  v_coordenacao_programacao text;
  v_supervisao_programacao text;
  v_base_programacao text;
  v_cpf text := regexp_replace(coalesce(new.colaborador_id, ''), '\D', '', 'g');
  v_nome text := upper(trim(coalesce(new.nome_colaborador, '')));
  v_pertence boolean := false;
  v_supervisoes_cadastro text;
begin
  if new.confirmado is distinct from true or new.os_id is null then
    return new;
  end if;

  select
    p.data_referencia,
    nullif(trim(p.coordenacao), ''),
    nullif(trim(p.supervisao), '')
  into
    v_data,
    v_coordenacao_programacao,
    v_supervisao_programacao
  from public.programacao_dia p
  where p.id = new.programacao_id;

  if v_data is null or coalesce(v_supervisao_programacao, '') = '' then
    raise exception 'Programação sem data ou supervisão válida.';
  end if;

  v_base_programacao := upper(trim(coalesce(
    v_coordenacao_programacao,
    split_part(v_supervisao_programacao, ' - ', 1),
    v_supervisao_programacao
  )));

  select
    coalesce(bool_or(
      upper(trim(coalesce(c.supervisao, ''))) = upper(trim(v_supervisao_programacao))
      or (
        upper(trim(coalesce(c.coordenacao, ''))) = v_base_programacao
        and (
          coalesce(trim(c.supervisao), '') = ''
          or upper(trim(c.supervisao)) = v_base_programacao
          or upper(trim(c.supervisao)) = upper(trim(coalesce(c.coordenacao, '')))
        )
      )
    ), false),
    string_agg(distinct nullif(trim(c.supervisao), ''), ', ' order by nullif(trim(c.supervisao), ''))
  into
    v_pertence,
    v_supervisoes_cadastro
  from public.colaboradores_atuais c
  where c.ativo is distinct from false
    and coalesce(c.desligamento::text, '') = ''
    and upper(coalesce(c.situacao::text, '')) not in (
      'NAO ATIVO', 'NAO ATIVA', 'INATIVO', 'INATIVA',
      'DESLIGADO', 'DESLIGADA', 'DEMITIDO', 'DEMITIDA'
    )
    and (
      (length(v_cpf) = 11 and regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g') = v_cpf)
      or (length(v_cpf) <> 11 and v_nome <> '' and upper(trim(c.nome)) = v_nome)
    );

  if not v_pertence then
    raise exception 'Colaborador % não pertence à regional %. Supervisão cadastrada: %.',
      coalesce(new.nome_colaborador, new.colaborador_id),
      v_supervisao_programacao,
      coalesce(v_supervisoes_cadastro, 'não localizada');
  end if;

  -- O mesmo colaborador pode atender várias O.S. da mesma programação, mas
  -- não pode permanecer confirmado em supervisões diferentes na mesma data.
  if exists (
    select 1
    from public.programacao_equipe e
    join public.programacao_dia p on p.id = e.programacao_id
    where e.confirmado = true
      and e.os_id is not null
      and p.data_referencia = v_data
      and upper(trim(coalesce(p.supervisao, ''))) <> upper(trim(v_supervisao_programacao))
      and e.id is distinct from new.id
      and (
        (length(v_cpf) = 11 and regexp_replace(coalesce(e.colaborador_id, ''), '\D', '', 'g') = v_cpf)
        or (length(v_cpf) <> 11 and v_nome <> '' and upper(trim(e.nome_colaborador)) = v_nome)
      )
  ) then
    raise exception 'Colaborador % já está confirmado em outra regional em %.',
      coalesce(new.nome_colaborador, new.colaborador_id), v_data;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.programacao_etapa_b_candidatos(p_supervisao text, p_excluir_colaborador_ids text[], p_os jsonb)
 RETURNS TABLE(os_id uuid, colaborador_id text, nome text, cargo text, coordenacao text, supervisao text, tipo_contrato text, km numeric, auditorias_qtd integer, auditorias_peso numeric, veiculo_id uuid, veiculo_placa text, colab_lat numeric, colab_lng numeric, custo_total numeric, score numeric, score_contrato numeric, score_distancia numeric, score_auditoria numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with colab as (
  select distinct on (coalesce(nullif(regexp_replace(coalesce(cs.cpf, ''), '\D', '', 'g'), ''), cs.nome))
    coalesce(nullif(regexp_replace(coalesce(cs.cpf, ''), '\D', '', 'g'), ''), cs.nome) as colaborador_key,
    regexp_replace(coalesce(cs.cpf, ''), '\D', '', 'g') as cpf_norm,
    cs.nome, cs.cargo, cs.coordenacao, cs.supervisao
  from colaboradores_atuais cs
  where cs.supervisao = p_supervisao
    and cs.ativo is distinct from false
    and cs.desligamento is null
    and upper(coalesce(cs.situacao, '')) not in ('NAO ATIVO', 'NAO ATIVA', 'INATIVO', 'INATIVA', 'DESLIGADO', 'DESLIGADA', 'DEMITIDO', 'DEMITIDA')
  order by coalesce(nullif(regexp_replace(coalesce(cs.cpf, ''), '\D', '', 'g'), ''), cs.nome)
),
elegiveis as (
  select c.* from colab c
  where not (c.colaborador_key = any(coalesce(p_excluir_colaborador_ids, array[]::text[])))
),
osinfo as (
  select
    (item->>'os_id')::uuid as os_id,
    (item->>'lat')::numeric as lat,
    (item->>'lng')::numeric as lng
  from jsonb_array_elements(p_os) item
),
cz_best as (
  select distinct on (cpf) cpf, tipo_contrato, latitude, longitude, auditorias_180d_qtd, auditorias_180d_peso, veiculo_id, veiculo_placa, salario
  from colaborador_cruzamento
  where cpf <> ''
  order by cpf, atualizado_em desc
),
pares as (
  select
    o.os_id,
    e.colaborador_key,
    e.nome,
    e.cargo,
    e.coordenacao,
    e.supervisao,
    cz.tipo_contrato,
    cz.auditorias_180d_qtd,
    cz.auditorias_180d_peso,
    cz.veiculo_id,
    cz.veiculo_placa,
    cz.latitude as colab_lat,
    cz.longitude as colab_lng,
    cz.salario,
    case
      when o.lat is not null and o.lng is not null and cz.latitude is not null and cz.longitude is not null then
        2 * 6371 * asin(sqrt(
          sin(radians(cz.latitude - o.lat) / 2) ^ 2 +
          cos(radians(o.lat)) * cos(radians(cz.latitude)) * sin(radians(cz.longitude - o.lng) / 2) ^ 2
        ))
      else null
    end as km
  from osinfo o
  cross join elegiveis e
  left join cz_best cz
    on cz.cpf = e.cpf_norm and e.cpf_norm <> ''
),
custos as (
  select
    p.*,
    case
      when p.km is null then null
      else
        (case when upper(coalesce(p.tipo_contrato, '')) like '%EFETIVO%' then 0 else coalesce(p.salario, 0) end)
        + (p.km * 2 / 10.0) * 7.0
    end as custo_total
  from pares p
),
ranqueado as (
  select
    c.*,
    rank() over (partition by c.os_id order by c.km asc nulls last) as km_rank,
    count(*) filter (where c.km is not null) over (partition by c.os_id) as km_total,
    rank() over (partition by c.os_id order by (case when c.auditorias_180d_qtd > 0 then c.auditorias_180d_peso end) desc nulls last) as aud_rank,
    count(*) filter (where c.auditorias_180d_qtd > 0) over (partition by c.os_id) as aud_total,
    rank() over (partition by c.os_id order by c.custo_total asc nulls last) as custo_rank,
    count(*) filter (where c.custo_total is not null) over (partition by c.os_id) as custo_count
  from custos c
),
final as (
  select
    r.os_id,
    r.colaborador_key as colaborador_id,
    r.nome,
    r.cargo,
    r.coordenacao,
    r.supervisao,
    r.tipo_contrato,
    round(r.km::numeric, 1) as km,
    r.auditorias_180d_qtd as auditorias_qtd,
    r.auditorias_180d_peso as auditorias_peso,
    r.veiculo_id,
    r.veiculo_placa,
    r.colab_lat,
    r.colab_lng,
    round(r.custo_total::numeric, 2) as custo_total,
    case
      when r.custo_total is null then 0
      when r.custo_count <= 1 then 1
      else 1 - (r.custo_rank - 1)::numeric / (r.custo_count - 1)
    end as score_contrato,
    case
      when r.km is null then 0
      when r.km_total <= 1 then 1
      else 1 - (r.km_rank - 1)::numeric / (r.km_total - 1)
    end as score_distancia,
    case
      when r.auditorias_180d_qtd is null or r.auditorias_180d_qtd <= 0 then 0
      when r.aud_total <= 1 then 1
      else 1 - (r.aud_rank - 1)::numeric / (r.aud_total - 1)
    end as score_auditoria
  from ranqueado r
),
scored as (
  select
    f.os_id, f.colaborador_id, f.nome, f.cargo, f.coordenacao, f.supervisao, f.tipo_contrato,
    f.km, f.auditorias_qtd, f.auditorias_peso, f.veiculo_id, f.veiculo_placa, f.colab_lat, f.colab_lng, f.custo_total,
    (0.5 * f.score_contrato + 0.3 * f.score_distancia + 0.2 * f.score_auditoria) as score,
    f.score_contrato, f.score_distancia, f.score_auditoria
  from final f
),
top8 as (
  select s.*, row_number() over (partition by s.os_id order by s.score desc, s.km asc nulls last) as rn
  from scored s
)
select os_id, colaborador_id, nome, cargo, coordenacao, supervisao, tipo_contrato,
       km, auditorias_qtd, auditorias_peso, veiculo_id, veiculo_placa, colab_lat, colab_lng, custo_total,
       score, score_contrato, score_distancia, score_auditoria
from top8
where rn <= 8
order by os_id, score desc, km asc nulls last
;
$function$
;

CREATE OR REPLACE FUNCTION public.programacao_listar_supervisoes()
 RETURNS TABLE(nome text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_auth uuid := auth.uid();
  v_app_id uuid;
  v_setor text;
  v_supervisao text;
  v_is_admin boolean := false;
begin
  select
    u.id,
    coalesce(u.setor, ''),
    coalesce(u.supervisao, '')
  into v_app_id, v_setor, v_supervisao
  from public.app_usuarios u
  where u.auth_user_id = v_auth
  limit 1;

  v_is_admin := upper(v_setor) like '%MASTER%'
    or upper(v_setor) like '%ADMIN%'
    or upper(v_setor) like '%DIRETOR%'
    or upper(v_setor) like '%TI%';

  if v_is_admin then
    return query
      select distinct trim(s.nome)::text
      from public.supervisoes s
      where coalesce(s.ativo, true) = true
        and trim(s.nome) <> ''
      order by 1;
    return;
  end if;

  -- Usuário restrito: somente supervisões explicitamente liberadas.
  -- Fontes válidas:
  --   1) programacao_usuario_supervisoes;
  --   2) lista gravada em app_usuarios.supervisao.
  -- Coordenação, setor ou regional NÃO ampliam o acesso automaticamente.
  return query
    select distinct q.nome
    from (
      select trim(s.nome)::text as nome
      from public.programacao_usuario_supervisoes r
      join public.supervisoes s
        on upper(trim(s.nome)) = upper(trim(r.supervisao))
       and coalesce(s.ativo, true) = true
      where r.ativo = true
        and trim(r.supervisao) <> ''
        and (
          (r.auth_user_id is not null and r.auth_user_id = v_auth)
          or (r.app_usuario_id is not null and r.app_usuario_id = v_app_id)
        )

      union

      select trim(s.nome)::text as nome
      from regexp_split_to_table(coalesce(v_supervisao, ''), '[,;|\n]+') sup
      join public.supervisoes s
        on upper(trim(s.nome)) = upper(trim(sup))
       and coalesce(s.ativo, true) = true
      where trim(sup) <> ''
    ) q
    where q.nome is not null and trim(q.nome) <> ''
    order by 1;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.programacao_supervisoes_com_os_acionavel(p_supervisoes text[])
 RETURNS TABLE(supervisao text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select distinct os.supervisao
  from public.operacional_os os
  where os.supervisao = any(p_supervisoes)
    and (
      os.status_gestor is null
      or os.status_gestor in ('PENDENTE', 'ATENDER')
    );
$function$
;

CREATE OR REPLACE FUNCTION public.programacao_usuario_supervisoes_touch()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.proteger_atualizacoes_manuais_frotas_multas()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_sync_detran boolean := false;
begin
  v_sync_detran :=
       new.ultima_consulta_em is distinct from old.ultima_consulta_em
    or new.raw is distinct from old.raw
    or (
      new.origem is distinct from old.origem
      and upper(coalesce(new.origem, '')) = 'DETRAN'
    );

  if v_sync_detran then
    -- Workflow e auditoria operacional pertencem ao painel.
    new.acao_status := old.acao_status;
    new.condutor_identificado_em := old.condutor_identificado_em;
    new.condutor_notificado_em := old.condutor_notificado_em;
    new.multa_indicada_em := old.multa_indicada_em;
    new.multa_dobrada_em := old.multa_dobrada_em;
    new.observacoes_operacionais := old.observacoes_operacionais;
    new.arquivada_em := old.arquivada_em;
    new.arquivada_por := old.arquivada_por;
    new.motivo_arquivamento := old.motivo_arquivamento;
    new.ok_em := old.ok_em;
    new.ok_por := old.ok_por;
    new.ok_observacao := old.ok_observacao;
    new.motorista_em := old.motorista_em;
    new.motorista_por := old.motorista_por;
    new.motorista_nome := old.motorista_nome;
    new.motorista_cpf := old.motorista_cpf;
    new.identificada_em := old.identificada_em;
    new.identificada_por := old.identificada_por;
    new.identificada_obs := old.identificada_obs;
    new.dobrada_em := old.dobrada_em;
    new.dobrada_por := old.dobrada_por;
    new.dobrada_obs := old.dobrada_obs;
    new.motorista_definido_em := old.motorista_definido_em;
    new.dobrar_solicitado_em := old.dobrar_solicitado_em;
    new.identificar_solicitado_em := old.identificar_solicitado_em;

    -- Havendo ação manual, status_multa é o status efetivo do painel.
    -- A situação original do DETRAN continua atualizando em situacao.
    if nullif(trim(coalesce(old.acao_status, '')), '') is not null then
      new.status_multa := old.status_multa;
    end if;
  else
    -- Alteração feita pelo painel: a ação operacional assume precedência.
    if new.acao_status is distinct from old.acao_status then
      if nullif(trim(coalesce(new.acao_status, '')), '') is not null then
        new.status_multa := new.acao_status;
      elsif nullif(trim(coalesce(new.situacao, '')), '') is not null then
        new.status_multa := new.situacao;
      end if;
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.proteger_atualizacoes_manuais_frotas_veiculos()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_sync_detran boolean;
  v_sync_bfleet boolean;
begin
  -- Integrações externas devem atualizar seus próprios campos, sem reverter
  -- informações operacionais que já existem no cadastro do painel.
  v_sync_detran :=
       new.detran_ultima_consulta_em is distinct from old.detran_ultima_consulta_em
    or new.detran_raw is distinct from old.detran_raw
    or new.detran_status is distinct from old.detran_status
    or new.detran_confirmado is distinct from old.detran_confirmado;

  v_sync_bfleet :=
       new.bfleet_ultima_sync_em is distinct from old.bfleet_ultima_sync_em
    or new.bfleet_ultima_sincronizacao_em is distinct from old.bfleet_ultima_sincronizacao_em
    or new.bfleet_sync_at is distinct from old.bfleet_sync_at
    or new.bfleet_raw is distinct from old.bfleet_raw
    or new.bfleet_status is distinct from old.bfleet_status
    or new.rastreador_bfleet is distinct from old.rastreador_bfleet
    or new.bfleet_confirmado is distinct from old.bfleet_confirmado;

  if v_sync_detran or v_sync_bfleet then
    new.placa := old.placa;
    new.renavam := old.renavam;
    new.nome := old.nome;
    new.empresa := old.empresa;
    new.cnpj := old.cnpj;
    new.marca := old.marca;
    new.modelo := old.modelo;
    new.cor := old.cor;
    new.ano := old.ano;
    new.tipo := old.tipo;
    new.coordenacao := old.coordenacao;
    new.supervisao := old.supervisao;
    new.motorista_atual := old.motorista_atual;
    new.hodometro := old.hodometro;
    new.valor_mensal := old.valor_mensal;
    new.dia_vencimento := old.dia_vencimento;
    new.valor_km := old.valor_km;
    new.status := old.status;
    new.observacoes := old.observacoes;
    new.origem_importacao := old.origem_importacao;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reenviar_abertura_os_corrigida(p_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_status text;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  select status
    into v_status
    from public.logistica_abertura_os
   where id = p_id
   for update;

  if not found then
    raise exception 'Solicitação não encontrada.';
  end if;

  if v_status <> 'CORRIGIR' then
    raise exception 'Somente solicitações em CORRIGIR podem ser reenviadas.';
  end if;

  update public.logistica_abertura_os
     set contratante_cliente = coalesce(nullif(trim(p_payload->>'contratante_cliente'), ''), contratante_cliente),
         filial_pagadora = coalesce(nullif(trim(p_payload->>'filial_pagadora'), ''), filial_pagadora),
         produtor = nullif(trim(p_payload->>'produtor'), ''),
         armazem_embarque = coalesce(nullif(trim(p_payload->>'armazem_embarque'), ''), armazem_embarque),
         cidade_embarque = coalesce(nullif(trim(p_payload->>'cidade_embarque'), ''), cidade_embarque),
         cidade_destino = coalesce(nullif(trim(p_payload->>'cidade_destino'), ''), cidade_destino),
         local_destino = coalesce(nullif(trim(p_payload->>'local_destino'), ''), local_destino),
         numero_contrato = coalesce(nullif(trim(p_payload->>'numero_contrato'), ''), numero_contrato),
         produto = coalesce(nullif(trim(p_payload->>'produto'), ''), produto),
         tipo_produto = coalesce(nullif(trim(p_payload->>'tipo_produto'), ''), tipo_produto),
         volume_inicial = coalesce(nullif(p_payload->>'volume_inicial', '')::numeric, volume_inicial),
         regional = coalesce(nullif(trim(p_payload->>'regional'), ''), regional),
         troca_notas = coalesce(nullif(trim(p_payload->>'troca_notas'), ''), troca_notas),
         servico = coalesce(nullif(trim(p_payload->>'servico'), ''), servico),
         testes = coalesce(p_payload->'testes', testes),
         status = 'PENDENTE',
         observacao_adm = null,
         decidido_por = null,
         decidido_em = null,
         aprovado_por = null,
         aprovado_em = null,
         agente_job_id = null,
         erro_agente = null,
         updated_at = now()
   where id = p_id;

  return jsonb_build_object('ok', true, 'status', 'PENDENTE', 'abertura_os_id', p_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_colaborador_cruzamento()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  truncate table public.colaborador_cruzamento;

  with veic_norm as (
    select
      v.id,
      v.placa,
      v.updated_at,
      trim(regexp_replace(upper(unaccent(coalesce(
        nullif(trim(v.motorista_atual), ''),
        nullif(trim(v.patrimonio_funcionario), ''),
        nullif(trim(v.bfleet_condutor), ''),
        nullif(trim(v.condutor_patrimonio), '')
      ))), '[^A-Z0-9]+', ' ', 'g')) as nome_chave
    from public.frotas_veiculos v
    where v.status = 'ATIVO'
  ),
  veic_best as (
    select distinct on (nome_chave) nome_chave, id, placa
    from veic_norm
    where nome_chave <> ''
    order by nome_chave, updated_at desc
  ),
  base_norm as (
    select
      regexp_replace(coalesce(b.cpf, ''), '\D', '', 'g') as cpf_norm,
      b.latitude,
      b.longitude,
      b.endereco_base
    from public.operacional_colaborador_base b
    where b.ativo is true
      and regexp_replace(coalesce(b.cpf, ''), '\D', '', 'g') <> ''
  ),
  base_best as (
    select distinct on (cpf_norm) cpf_norm, latitude, longitude, endereco_base
    from base_norm
    order by cpf_norm
  ),
  aud_agg as (
    select
      a.nome_chave,
      count(*)::int as qtd,
      sum(1 + abs(coalesce(a.score_impacto, 0)))::numeric as peso
    from public.operacional_auditoria_colaborador a
    where a.data_evento >= (current_date - 180)
    group by a.nome_chave
  )
  insert into public.colaborador_cruzamento (
    colaborador_id, cpf, nome, nome_chave, supervisao, coordenacao, tipo_contrato,
    latitude, longitude, endereco_base, veiculo_id, veiculo_placa,
    auditorias_180d_qtd, auditorias_180d_peso, salario, atualizado_em
  )
  select
    c.id,
    regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g'),
    c.nome,
    trim(regexp_replace(upper(unaccent(coalesce(c.nome, ''))), '[^A-Z0-9]+', ' ', 'g')) as nome_chave,
    c.supervisao,
    c.coordenacao,
    c.tipo,
    bb.latitude,
    bb.longitude,
    bb.endereco_base,
    vb.id,
    vb.placa,
    coalesce(aa.qtd, 0),
    coalesce(aa.peso, 0),
    nullif(trim(c.salario), '')::numeric,
    now()
  from public.colaboradores c
  left join base_best bb on bb.cpf_norm = regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g') and bb.cpf_norm <> ''
  left join veic_best vb on vb.nome_chave = trim(regexp_replace(upper(unaccent(coalesce(c.nome, ''))), '[^A-Z0-9]+', ' ', 'g')) and vb.nome_chave <> ''
  left join aud_agg aa on aa.nome_chave = trim(regexp_replace(upper(unaccent(coalesce(c.nome, ''))), '[^A-Z0-9]+', ' ', 'g'))
  where upper(unaccent(coalesce(c.situacao, ''))) not in ('NAO ATIVO', 'NAO ATIVA', 'INATIVO', 'INATIVA', 'DESLIGADO', 'DESLIGADA', 'DEMITIDO', 'DEMITIDA')
    and coalesce(c.desligamento, '') = '';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_grm_reabertura_os_fila()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_inseridas integer := 0;
  v_pendentes integer := 0;
  v_resolvidas integer := 0;
  v_snapshot timestamptz;
begin
  select max(data_sincronizacao) into v_snapshot from public.grm_lista_os_importacoes;

  drop table if exists pg_temp.tmp_grm_reabertura_candidates;

  create temporary table tmp_grm_reabertura_candidates on commit drop as
  with bad_seed as (
    select distinct regexp_replace(trim(os),'[^0-9]','','g') as os
    from public.grm_finalizacao_os_resultados
    where status='SUCESSO'
      and detalhes->>'criterio_finalizacao'='SEM_MOVIMENTO_5_DIAS'
      and coalesce(remanescente_tela,remanescente_exportado)>0
  ),
  last_close as (
    select distinct on (regexp_replace(trim(r.os),'[^0-9]','','g'))
      regexp_replace(trim(r.os),'[^0-9]','','g') as os,
      r.id as resultado_id,
      r.criado_em as fechamento_em,
      (r.criado_em at time zone 'America/Sao_Paulo')::date as fechamento_data,
      coalesce(r.remanescente_tela, r.remanescente_exportado) as remanescente,
      r.detalhes->>'criterio_finalizacao' as criterio,
      r.detalhes->>'servico_grm' as servico
    from public.grm_finalizacao_os_resultados r
    join bad_seed b on b.os=regexp_replace(trim(r.os),'[^0-9]','','g')
    where r.status='SUCESSO'
    order by regexp_replace(trim(r.os),'[^0-9]','','g'), r.criado_em desc, r.id desc
  ),
  hist as (
    select distinct on (g.dados_json->>'O.S.')
      g.dados_json->>'O.S.' as os,
      case
        when coalesce(g.dados_json->>'Data','') ~ '^\d{1,2}/\d{1,2}/\d{4}$' then to_date(g.dados_json->>'Data','DD/MM/YYYY')
        when coalesce(g.dados_json->>'Data','') ~ '^\d{4}-\d{2}-\d{2}$' then (g.dados_json->>'Data')::date
        else null
      end as data_os
    from public.grm_lista_os_importacoes g
    join bad_seed b on b.os=g.dados_json->>'O.S.'
    order by g.dados_json->>'O.S.', g.data_sincronizacao desc
  ),
  current_open as (
    select distinct g.dados_json->>'O.S.' as os
    from public.grm_lista_os_importacoes g
    where g.data_sincronizacao=v_snapshot
  ),
  evaluated as (
    select lc.*, h.data_os,
      emb.ultimo_embarque,
      nhe.ultimo_nhe,
      pnhe.prod_nhe_recente,
      case
        when emb.ultimo_embarque is not null then lc.fechamento_data-emb.ultimo_embarque
        when h.data_os is not null then lc.fechamento_data-h.data_os
        else null
      end as dias_sem_embarque,
      case
        when pnhe.prod_nhe_recente is not null then lc.fechamento_data-pnhe.prod_nhe_recente
        when nhe.ultimo_nhe is not null then lc.fechamento_data-nhe.ultimo_nhe
        when h.data_os is not null then lc.fechamento_data-h.data_os
        else null
      end as dias_sem_fob,
      upper(translate(trim(coalesce(lc.servico,'')),'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç','AAAAEEIOOOUCaaaaeeiooouc'))='CLASSIFICACAO FOB' as servico_ok,
      lc.remanescente between 0 and 30 as saldo_ok,
      case when emb.ultimo_embarque is not null then lc.fechamento_data-emb.ultimo_embarque >= 6
           else h.data_os is not null and lc.fechamento_data-h.data_os >= 6 end as embarque_ok,
      case
        when pnhe.prod_nhe_recente is not null then false
        when nhe.ultimo_nhe is not null then lc.fechamento_data-nhe.ultimo_nhe >= 6
        else h.data_os is not null and lc.fechamento_data-h.data_os >= 6
      end as fob_ok
    from last_close lc
    left join hist h using(os)
    left join lateral (
      select max(c.data_classificacao) as ultimo_embarque
      from public.grm_cargas_importacoes c
      where regexp_replace(regexp_replace(trim(coalesce(c.os,'')), '\.0+$','','g'),'[^0-9]','','g')=lc.os
        and c.data_classificacao<=lc.fechamento_data
    ) emb on true
    left join lateral (
      select max((n.dados_json->>'lnsDate')::date) as ultimo_nhe
      from public.grm_nhe_importacoes n
      where n.dados_json->>'sorCode'=lc.os
        and coalesce(n.dados_json->>'lnsDate','') ~ '^\d{4}-\d{2}-\d{2}$'
        and (n.dados_json->>'lnsDate')::date<=lc.fechamento_data
    ) nhe on true
    left join lateral (
      select max(d)::date as prod_nhe_recente
      from generate_series(lc.fechamento_data-5, lc.fechamento_data, interval '1 day') gs(d)
      where exists (
        select 1
        from public.grm_producao_diaria_importacoes p
        where p.dados_json->>'Data'=to_char(d,'YYYY-MM-DD')
          and p.dados_json->>'O.S.'=lc.os
          and upper(trim(coalesce(p.dados_json->>'Cargas','')))='NHE'
        limit 1
      )
    ) pnhe on true
  )
  select e.os, e.resultado_id, e.fechamento_em, e.fechamento_data,
    e.criterio, e.servico, e.remanescente, e.data_os,
    e.ultimo_embarque,
    greatest(e.ultimo_nhe, e.prod_nhe_recente) as ultimo_fob,
    e.dias_sem_embarque, e.dias_sem_fob,
    array_remove(array[
      case when not e.servico_ok then 'SERVICO_NAO_FOB' end,
      case when not e.saldo_ok then 'REMANESCENTE_FORA_0_30' end,
      case when not e.embarque_ok then 'EMBARQUE_MENOS_6_DIAS' end,
      case when not e.fob_ok then 'FOB_MENOS_6_DIAS' end
    ], null) as motivos,
    case
      when not e.servico_ok or abs(coalesce(e.remanescente,0)) > 1000 then 1
      when not e.saldo_ok or not e.embarque_ok or not e.fob_ok then 2
      else 3
    end::smallint as prioridade
  from evaluated e
  left join current_open co using(os)
  where co.os is null
    and e.criterio is distinct from 'APROVADA_LOGISTICA'
    and not (e.servico_ok and e.saldo_ok and e.embarque_ok and e.fob_ok);

  insert into public.grm_reabertura_os_fila (
    os, resultado_fechamento_id, fechamento_em, fechamento_data,
    criterio_fechamento, servico, remanescente, data_os,
    ultimo_embarque, ultimo_fob, dias_sem_embarque, dias_sem_fob,
    motivos, prioridade, status, snapshot_lista_os_em, regra_snapshot,
    observacao, updated_at
  )
  select
    c.os, c.resultado_id, c.fechamento_em, c.fechamento_data,
    c.criterio, c.servico, c.remanescente, c.data_os,
    c.ultimo_embarque, c.ultimo_fob, c.dias_sem_embarque, c.dias_sem_fob,
    c.motivos, c.prioridade, 'PENDENTE_REABERTURA', v_snapshot,
    jsonb_build_object(
      'servico','Classificação FOB',
      'dias_sem_embarque_min',6,
      'dias_sem_fob_min',6,
      'remanescente_min',0,
      'remanescente_max',30,
      'fonte_embarque','grm_cargas_importacoes',
      'fonte_fob',jsonb_build_array('grm_nhe_importacoes','grm_producao_diaria_importacoes:Cargas=NHE')
    ),
    'Reabertura preparada por correção de finalização automática indevida.',
    now()
  from pg_temp.tmp_grm_reabertura_candidates c
  on conflict (os) do update set
    resultado_fechamento_id=excluded.resultado_fechamento_id,
    fechamento_em=excluded.fechamento_em,
    fechamento_data=excluded.fechamento_data,
    criterio_fechamento=excluded.criterio_fechamento,
    servico=excluded.servico,
    remanescente=excluded.remanescente,
    data_os=excluded.data_os,
    ultimo_embarque=excluded.ultimo_embarque,
    ultimo_fob=excluded.ultimo_fob,
    dias_sem_embarque=excluded.dias_sem_embarque,
    dias_sem_fob=excluded.dias_sem_fob,
    motivos=excluded.motivos,
    prioridade=excluded.prioridade,
    snapshot_lista_os_em=excluded.snapshot_lista_os_em,
    regra_snapshot=excluded.regra_snapshot,
    status=case
      when public.grm_reabertura_os_fila.status in ('REABERTA','IGNORADA') then public.grm_reabertura_os_fila.status
      else 'PENDENTE_REABERTURA'
    end,
    updated_at=now();
  get diagnostics v_inseridas = row_count;

  update public.grm_reabertura_os_fila q
  set status='RESOLVIDA_SEM_REABERTURA',
      observacao=coalesce(q.observacao,'') || E'\nRemovida automaticamente da fila após nova validação/snapshot.',
      updated_at=now()
  where q.status='PENDENTE_REABERTURA'
    and not exists (
      select 1 from pg_temp.tmp_grm_reabertura_candidates c where c.os=q.os
    );
  get diagnostics v_resolvidas = row_count;

  select count(*) into v_pendentes
  from public.grm_reabertura_os_fila
  where status='PENDENTE_REABERTURA';

  return jsonb_build_object(
    'ok',true,
    'snapshot_lista_os_em',v_snapshot,
    'itens_atualizados',v_inseridas,
    'pendentes_reabertura',v_pendentes,
    'resolvidas_sem_reabertura',v_resolvidas
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.registrar_localizacao_diaria_colaboradores(p_data date DEFAULT CURRENT_DATE)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  with cz_best as (
    select distinct on (cpf) cpf, nome, coordenacao, latitude, longitude
    from public.colaborador_cruzamento
    where cpf <> ''
    order by cpf, atualizado_em desc
  )
  insert into public.conferencia_localizacao_colaboradores (
    data_referencia, colaborador_key, nome_colaborador, os_id, numero_os, cliente, supervisao, coordenacao,
    colaborador_latitude, colaborador_longitude,
    os_ponto_nome, os_latitude, os_longitude,
    ponto_embarque_id, ponto_embarque_nome, ponto_embarque_latitude, ponto_embarque_longitude,
    login_latitude, login_longitude, login_hora, login_distancia_km,
    distancia_km, atualizado_em
  )
  select
    p_data,
    ac.colaborador_key,
    coalesce(cz.nome, ac.colaborador_nome),
    os.id,
    os.numero_os,
    os.cliente,
    os.supervisao,
    cz.coordenacao,
    cz.latitude,
    cz.longitude,
    os.ponto1_nome,
    os.ponto1_latitude,
    os.ponto1_longitude,
    nearest.id,
    nearest.embarque_label,
    nearest.latitude,
    nearest.longitude,
    login.latitude,
    login.longitude,
    login.hora_movimento,
    round(login.km::numeric, 1),
    round(nearest.km::numeric, 1),
    now()
  from public.operacional_os_colaboradores ac
  join public.operacional_os os on os.id = ac.os_id and os.data_os = p_data
  join lateral (
    select coalesce(
      nullif(regexp_replace(coalesce(ac.colaborador_cpf, ''), '\D', '', 'g'), ''),
      regexp_replace(coalesce(ac.colaborador_key, ''), '\D', '', 'g')
    ) as cpf_norm
  ) ackey on true
  join cz_best cz on cz.cpf = ackey.cpf_norm and cz.latitude is not null and cz.longitude is not null
  cross join lateral (
    select p.id, p.embarque_label, p.latitude, p.longitude,
      2 * 6371 * asin(sqrt(
        sin(radians(p.latitude - cz.latitude) / 2) ^ 2 +
        cos(radians(cz.latitude)) * cos(radians(p.latitude)) * sin(radians(p.longitude - cz.longitude) / 2) ^ 2
      )) as km
    from public.operacional_pontos_embarque p
    where p.ativo is true and p.latitude is not null and p.longitude is not null
    order by km asc
    limit 1
  ) nearest
  left join lateral (
    select l.latitude, l.longitude, l.hora_movimento,
      2 * 6371 * asin(sqrt(
        sin(radians(l.latitude - os.ponto1_latitude) / 2) ^ 2 +
        cos(radians(os.ponto1_latitude)) * cos(radians(l.latitude)) * sin(radians(l.longitude - os.ponto1_longitude) / 2) ^ 2
      )) as km
    from public.grm_login_movimentos_importacoes l
    where os.ponto1_latitude is not null
      and os.ponto1_longitude is not null
      and l.data_movimento = p_data
      and l.latitude is not null
      and l.longitude is not null
      and unaccent(upper(btrim(coalesce(l.colaborador, '')))) = unaccent(upper(btrim(coalesce(cz.nome, ac.colaborador_nome, ''))))
    order by km asc
    limit 1
  ) login on true
  on conflict (data_referencia, colaborador_key, os_id) do update set
    nome_colaborador = excluded.nome_colaborador,
    numero_os = excluded.numero_os,
    cliente = excluded.cliente,
    supervisao = excluded.supervisao,
    coordenacao = excluded.coordenacao,
    colaborador_latitude = excluded.colaborador_latitude,
    colaborador_longitude = excluded.colaborador_longitude,
    os_ponto_nome = excluded.os_ponto_nome,
    os_latitude = excluded.os_latitude,
    os_longitude = excluded.os_longitude,
    ponto_embarque_id = excluded.ponto_embarque_id,
    ponto_embarque_nome = excluded.ponto_embarque_nome,
    ponto_embarque_latitude = excluded.ponto_embarque_latitude,
    ponto_embarque_longitude = excluded.ponto_embarque_longitude,
    login_latitude = excluded.login_latitude,
    login_longitude = excluded.login_longitude,
    login_hora = excluded.login_hora,
    login_distancia_km = excluded.login_distancia_km,
    distancia_km = excluded.distancia_km,
    atualizado_em = now();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.registrar_troca_motorista_veiculo()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if coalesce(new.motorista_atual, '') is distinct from coalesce(old.motorista_atual, '') then
    update public.frotas_veiculos_historico
       set data_fim = now()
     where veiculo_id = new.id
       and data_fim is null;

    if new.motorista_atual is not null and trim(new.motorista_atual) <> '' then
      insert into public.frotas_veiculos_historico (veiculo_id, motorista, data_inicio)
      values (new.id, new.motorista_atual, now());
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reorder_grm_sync_queue(p_job_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_job_id uuid;
  v_lane text;
begin
  if coalesce(array_length(p_job_ids, 1), 0) = 0 then return; end if;
  if not public.painel_has_module(array['TI_AGENTES', 'TI'], true) then
    raise exception 'Você não tem permissão para reorganizar a fila.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(872634503);
  select min(job.lane) into v_lane
  from unnest(p_job_ids) requested(id)
  join public.grm_sync_jobs job on job.id = requested.id;

  if v_lane is null or exists (
    select 1 from unnest(p_job_ids) requested(id)
    left join public.grm_sync_jobs job on job.id = requested.id
    where job.id is null or job.status <> 'pendente' or job.lane is distinct from v_lane
  ) then
    raise exception 'A fila mudou enquanto era reorganizada. Atualize a tela e tente novamente.';
  end if;

  foreach v_job_id in array p_job_ids loop
    update public.grm_sync_jobs
       set pipeline_seq = nextval('public.grm_fixed_pipeline_seq')
     where id = v_job_id and status = 'pendente' and lane = v_lane;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resumo_faturamento_notas_periodo(p_inicio date, p_fim date)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(sum(valor_nota_real), 0)
  from (
    select distinct on (empresa, fatura) valor_nota_real
    from public.grm_notas_fiscais_importacoes
    where data_nota_real >= p_inicio and data_nota_real < p_fim and fatura is not null
    order by empresa, fatura, created_at desc
  ) unicas;
$function$
;

CREATE OR REPLACE FUNCTION public.rh_colaborador_na_data(p_data date, p_nome text DEFAULT NULL::text, p_cpf text DEFAULT NULL::text)
 RETURNS SETOF colaboradores_historico
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select h.*
  from public.colaboradores_historico h
  where h.data_referencia <= p_data
    and (
      (public._somente_digitos_g1000(p_cpf) is not null and public._somente_digitos_g1000(h.cpf) = public._somente_digitos_g1000(p_cpf))
      or
      (public._normalizar_texto_g1000(p_nome) is not null and h.nome_normalizado = public._normalizar_texto_g1000(p_nome))
    )
  order by h.data_referencia desc
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.rh_gerar_alertas_vencimento()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_aso_marcados int := 0;
  v_ins int := 0;
  v_total int := 0;
begin
  -- 1) ASO com validade passada vira status 'vencido'
  update rh_exames
     set status = 'vencido', updated_at = now()
   where tipo = 'periodico'
     and data_vencimento is not null
     and data_vencimento < current_date
     and status in ('agendado', 'realizado', 'apto');
  get diagnostics v_aso_marcados = row_count;

  -- 2) Experiência vencendo em até 10 dias
  insert into painel_notificacoes
    (tipo, titulo, descricao, prioridade, icone, modulo_url, destinatario_modulo,
     referencia_tabela, referencia_id, chave_dedup)
  select 'rh_experiencia_vencendo',
         'Experiência vence em ' || (c.fim - current_date) || ' dia(s)',
         c.colaborador_nome || ' — fim do contrato de experiência em '
           || to_char(c.fim, 'DD/MM/YYYY') || '. Decidir efetivação, prorrogação ou desligamento.',
         'atencao', 'calendar-clock', 'contratos', 'contratos',
         'rh_contratos_experiencia', c.id::text,
         'rh_exp_venc:' || c.id || ':' || c.fim
    from (
      select id, colaborador_nome,
             case when prorrogado and data_fim_prorrogacao is not null
                  then data_fim_prorrogacao else data_fim_experiencia end as fim
        from rh_contratos_experiencia
       where status in ('em_experiencia', 'prorrogado')
    ) c
   where c.fim is not null
     and c.fim >= current_date
     and c.fim <= current_date + 10
     and not exists (select 1 from painel_notificacoes p
                      where p.chave_dedup = 'rh_exp_venc:' || c.id || ':' || c.fim);
  get diagnostics v_ins = row_count; v_total := v_total + v_ins;

  -- 3) Experiência já vencida sem decisão
  insert into painel_notificacoes
    (tipo, titulo, descricao, prioridade, icone, modulo_url, destinatario_modulo,
     referencia_tabela, referencia_id, chave_dedup)
  select 'rh_experiencia_vencida',
         'Contrato de experiência VENCIDO',
         c.colaborador_nome || ' — contrato de experiência venceu em '
           || to_char(c.fim, 'DD/MM/YYYY') || ' sem decisão registrada.',
         'urgente', 'calendar-clock', 'contratos', 'contratos',
         'rh_contratos_experiencia', c.id::text,
         'rh_exp_vencido:' || c.id || ':' || c.fim
    from (
      select id, colaborador_nome,
             case when prorrogado and data_fim_prorrogacao is not null
                  then data_fim_prorrogacao else data_fim_experiencia end as fim
        from rh_contratos_experiencia
       where status in ('em_experiencia', 'prorrogado')
    ) c
   where c.fim is not null
     and c.fim < current_date
     and not exists (select 1 from painel_notificacoes p
                      where p.chave_dedup = 'rh_exp_vencido:' || c.id || ':' || c.fim);
  get diagnostics v_ins = row_count; v_total := v_total + v_ins;

  -- 4) ASO vencendo em até 30 dias
  insert into painel_notificacoes
    (tipo, titulo, descricao, prioridade, icone, modulo_url, destinatario_modulo,
     referencia_tabela, referencia_id, chave_dedup)
  select 'rh_aso_vencendo',
         'ASO vence em ' || (e.data_vencimento - current_date) || ' dia(s)',
         e.colaborador_nome || ' — exame periódico vence em '
           || to_char(e.data_vencimento, 'DD/MM/YYYY') || '. Agendar renovação.',
         'atencao', 'calendar-clock', 'exames', 'exames',
         'rh_exames', e.id::text,
         'rh_aso_venc:' || e.id || ':' || e.data_vencimento
    from rh_exames e
   where e.tipo = 'periodico'
     and e.data_vencimento is not null
     and e.data_vencimento >= current_date
     and e.data_vencimento <= current_date + 30
     and e.status in ('agendado', 'realizado', 'apto')
     and not exists (select 1 from painel_notificacoes p
                      where p.chave_dedup = 'rh_aso_venc:' || e.id || ':' || e.data_vencimento);
  get diagnostics v_ins = row_count; v_total := v_total + v_ins;

  -- 5) ASO vencido
  insert into painel_notificacoes
    (tipo, titulo, descricao, prioridade, icone, modulo_url, destinatario_modulo,
     referencia_tabela, referencia_id, chave_dedup)
  select 'rh_aso_vencido',
         'ASO VENCIDO',
         e.colaborador_nome || ' — exame periódico venceu em '
           || to_char(e.data_vencimento, 'DD/MM/YYYY') || '. Colaborador sem ASO válido.',
         'urgente', 'calendar-clock', 'exames', 'exames',
         'rh_exames', e.id::text,
         'rh_aso_vencido:' || e.id || ':' || e.data_vencimento
    from rh_exames e
   where e.tipo = 'periodico'
     and e.data_vencimento is not null
     and e.status = 'vencido'
     and not exists (select 1 from painel_notificacoes p
                      where p.chave_dedup = 'rh_aso_vencido:' || e.id || ':' || e.data_vencimento);
  get diagnostics v_ins = row_count; v_total := v_total + v_ins;

  return jsonb_build_object('aso_marcados_vencidos', v_aso_marcados, 'notificacoes_criadas', v_total);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rh_plantao_pode_editar_setor(p_setor text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select auth.uid() is not null and (
    public.painel_is_master()
    or exists (
      select 1
      from public.rh_plantao_setor_editores e
      join public.app_usuarios u on u.id = e.app_usuario_id
      where u.auth_user_id = auth.uid()
        and lower(btrim(e.setor)) = lower(btrim(p_setor))
        and lower(coalesce(u.status, 'ativo')) = 'ativo'
    )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.rh_plantao_setores_acesso()
 RETURNS TABLE(setor text, hora_inicio time without time zone, hora_fim time without time zone, hora_inicio_2 time without time zone, hora_fim_2 time without time zone, pode_editar boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.setor, c.hora_inicio, c.hora_fim, c.hora_inicio_2, c.hora_fim_2,
         public.rh_plantao_pode_editar_setor(c.setor)
  from public.rh_plantao_setor_config c
  where auth.uid() is not null
    and c.ativo
    and public.painel_has_module(array['equipe', 'rh_plantao'], false)
  order by c.setor;
$function$
;

CREATE OR REPLACE FUNCTION public.rh_plantao_validar_editor_setor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_setor text := case when tg_op = 'DELETE' then old.setor else new.setor end;
begin
  -- Processos internos/serviço não possuem auth.uid() e mantêm compatibilidade.
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if not public.rh_plantao_pode_editar_setor(v_setor) then
    raise exception 'Você não possui permissão para editar o plantão do setor %.', v_setor
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rh_snapshot_na_data(p_data date)
 RETURNS SETOF colaboradores_historico
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select h.*
  from public.colaboradores_historico h
  where h.data_referencia = (
    select max(h2.data_referencia)
    from public.colaboradores_historico h2
    where h2.data_referencia <= p_data
  );
$function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rollback_grm_sync_8_lanes_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_running integer := 0;
  v_settings integer := 0;
  v_jobs integer := 0;
  v_version smallint := 1;
  v_result jsonb;
begin
  perform pg_advisory_xact_lock(872634503);
  perform pg_advisory_xact_lock(872634504);
  lock table public.grm_sync_jobs in share row exclusive mode;
  lock table public.grm_sync_agent_settings in share row exclusive mode;

  select coalesce(active_version,1)
    into v_version
  from public.grm_sync_runtime_policy
  where id=1
  for update;

  if coalesce(v_version,1)=1 then
    return jsonb_build_object(
      'ok',true,
      'already_legacy',true,
      'active_version',1
    );
  end if;

  select count(*) into v_running
  from public.grm_sync_jobs
  where status='rodando';

  if v_running > 0 then
    raise exception 'Rollback bloqueado: existem % job(s) rodando. Pare os workers V2 e tente novamente.',v_running;
  end if;

  update public.grm_sync_runtime_policy
     set active_version=1,
         updated_at=now()
   where id=1;

  update public.grm_sync_agent_settings s
     set queue_lane=coalesce(
           s.legacy_lane_before_v2,
           (select l.legacy_lane from public.grm_sync_lanes l where l.lane=s.target_lane),
           'fixed_a'
         ),
         updated_at=now()
   where s.queue_lane is distinct from coalesce(
           s.legacy_lane_before_v2,
           (select l.legacy_lane from public.grm_sync_lanes l where l.lane=s.target_lane),
           'fixed_a'
         );
  get diagnostics v_settings=row_count;

  update public.grm_sync_jobs j
     set lane=coalesce(
       (select s.queue_lane from public.grm_sync_agent_settings s where s.agent_id=j.agente_id),
       case
         when j.agente_id in ('aplicar-distribuicao-os','sync-liberacao-despesas') then 'despesas_distribuicao'
         when j.agente_id in ('sync-lancar-nhe','sync-finalizar-os','sync-abrir-os','sync-reabrir-os','sync-despesas-retroativas','sync-btg-checkin','sync-btg-devolver-classificador','sync-lancar-notas-fiscais') then 'alteracoes'
         else 'fixed_a'
       end
     )
   where j.status='pendente';
  get diagnostics v_jobs=row_count;

  v_result := jsonb_build_object(
    'ok',true,
    'already_legacy',false,
    'active_version',1,
    'settings_restored',v_settings,
    'pending_jobs_restored',v_jobs,
    'rolled_back_at',now()
  );

  insert into public.grm_sync_cutover_history(action,details)
  values ('rollback_v1',v_result);

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_get_user_context()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
with usuario as (
  select
    u.id,
    u.auth_user_id,
    u.nome,
    u.email,
    u.status,
    u.setor,
    u.empresa,
    u.coordenacao,
    u.supervisao,
    u.perfil_id,
    p.codigo as perfil_codigo,
    p.nome as perfil_nome
  from public.app_usuarios u
  left join public.app_perfis p on p.id = u.perfil_id
  where u.auth_user_id = auth.uid()
     or lower(u.email) = lower(coalesce(auth.email(), ''))
  limit 1
),
modulos_usuario as (
  select
    m.id,
    m.codigo,
    m.nome,
    m.categoria,
    m.icone,
    m.rota,
    m.ordem,
    true as pode_ver,
    false as pode_criar,
    false as pode_editar,
    false as pode_excluir,
    false as pode_aprovar
  from usuario u
  join public.app_usuario_modulos um on um.usuario_id = u.id
  join public.app_modulos m on m.id = um.modulo_id
  where m.ativo = true
),
modulos_perfil as (
  select
    m.id,
    m.codigo,
    m.nome,
    m.categoria,
    m.icone,
    m.rota,
    m.ordem,
    pm.pode_ver,
    pm.pode_criar,
    pm.pode_editar,
    pm.pode_excluir,
    pm.pode_aprovar
  from usuario u
  join public.app_perfil_modulo pm on pm.perfil_id = u.perfil_id
  join public.app_modulos m on m.id = pm.modulo_id
  where m.ativo = true
    and pm.pode_ver = true
),
modulos_master as (
  select
    m.id,
    m.codigo,
    m.nome,
    m.categoria,
    m.icone,
    m.rota,
    m.ordem,
    true as pode_ver,
    true as pode_criar,
    true as pode_editar,
    true as pode_excluir,
    true as pode_aprovar
  from public.app_modulos m
  where m.ativo = true
),
modulos_base as (
  -- Se houver módulos liberados diretamente no usuário, eles prevalecem.
  -- Se não houver, usa os módulos do perfil.
  select * from modulos_master where exists (select 1 from usuario where lower(coalesce(perfil_codigo, '')) = 'master')
  union all
  select * from modulos_usuario where not exists (select 1 from usuario where lower(coalesce(perfil_codigo, '')) = 'master')
  union all
  select * from modulos_perfil
  where not exists (select 1 from usuario where lower(coalesce(perfil_codigo, '')) = 'master')
    and not exists (select 1 from modulos_usuario)
),
modulos_final as (
  select distinct on (codigo)
    codigo,
    nome,
    rota,
    icone,
    categoria,
    ordem,
    pode_ver,
    pode_criar,
    pode_editar,
    pode_excluir,
    pode_aprovar
  from modulos_base
  order by codigo, ordem
)
select jsonb_build_object(
  'user', jsonb_build_object(
    'id', coalesce(u.auth_user_id, u.id),
    'app_usuario_id', u.id,
    'name', u.nome,
    'email', u.email,
    'role', coalesce(u.perfil_codigo, u.perfil_nome, 'usuario'),
    'status', u.status,
    'active', lower(coalesce(u.status, '')) = 'ativo',
    'is_master', lower(coalesce(u.perfil_codigo, '')) = 'master'
  ),
  'department', jsonb_build_object(
    'name', coalesce(u.setor, u.perfil_nome),
    'code', lower(coalesce(u.setor, u.perfil_codigo, ''))
  ),
  'empresa', u.empresa,
  'coordenacao', u.coordenacao,
  'supervisao', u.supervisao,
  'modules', coalesce((
    select jsonb_agg(jsonb_build_object(
      'code', mf.codigo,
      'name', mf.nome,
      'route', mf.rota,
      'icon', mf.icone,
      'category', mf.categoria,
      'order', mf.ordem,
      'can_view', mf.pode_ver,
      'can_create', mf.pode_criar,
      'can_edit', mf.pode_editar,
      'can_delete', mf.pode_excluir,
      'can_approve', mf.pode_aprovar
    ) order by mf.ordem, mf.nome)
    from modulos_final mf
  ), '[]'::jsonb)
)
from usuario u;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_registrar_log(p_acao text, p_modulo text DEFAULT NULL::text, p_detalhes jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_auth_user_id uuid;
  v_usuario_id uuid;
begin
  v_auth_user_id := auth.uid();

  select u.id
    into v_usuario_id
  from public.app_usuarios u
  where u.auth_user_id = v_auth_user_id
  limit 1;

  insert into public.app_logs (
    usuario_id,
    acao,
    modulo,
    detalhes
  )
  values (
    v_usuario_id,
    p_acao,
    p_modulo,
    p_detalhes
  );

  return jsonb_build_object('ok', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_upsert_usuario(p_nome text, p_email text, p_telefone text, p_status text, p_perfil_codigo text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_perfil_id uuid;
  v_user_id uuid;
begin

  -- pega o perfil
  select id into v_perfil_id
  from public.app_perfis
  where codigo = p_perfil_codigo
  limit 1;

  if v_perfil_id is null then
    raise exception 'Perfil não encontrado';
  end if;

  -- upsert por email
  insert into public.app_usuarios (
    nome,
    email,
    telefone,
    status,
    perfil_id
  )
  values (
    p_nome,
    p_email,
    p_telefone,
    p_status,
    v_perfil_id
  )
  on conflict (email)
  do update set
    nome = excluded.nome,
    telefone = excluded.telefone,
    status = excluded.status,
    perfil_id = excluded.perfil_id
  returning id into v_user_id;

  return json_build_object(
    'ok', true,
    'user_id', v_user_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.salvar_logistica_fob_importacao(p_linhas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_total integer := 0;
begin
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'O parâmetro p_linhas precisa ser um array JSON.';
  end if;

  with linhas as (
    select
      nullif(x->>'data', '')::date as data_referencia,
      nullif(coalesce(x->>'os', x->>'numero_os'), '') as numero_os,
      nullif(x->>'cliente', '') as cliente,
      nullif(x->>'supervisao', '') as supervisao,
      nullif(x->>'funcionario', '') as funcionario,
      nullif(x->>'cidade', '') as cidade,
      nullif(coalesce(x->>'local', x->>'local_embarque'), '') as local_embarque,
      coalesce(nullif(x->>'status', ''), 'PENDENTE') as status_comparacao,
      nullif(x->>'motivo', '') as motivo,
      nullif(x->>'observacao', '') as observacao,
      coalesce(nullif(x->>'tons_movimento', '')::numeric, 0) as tons_movimento,
      coalesce(nullif(x->>'tons_producao', '')::numeric, 0) as tons_producao,
      coalesce(nullif(x->>'tons_nh', '')::numeric, 0) as tons_nh,
      nullif(x->>'arquivo_movimentacao', '') as arquivo_movimentacao,
      nullif(x->>'arquivo_producao', '') as arquivo_producao,
      nullif(x->>'arquivo_nhe', '') as arquivo_nhe,
      coalesce(nullif(x->>'origem', ''), 'IMPORTACAO_FOB') as origem,
      x as raw
    from jsonb_array_elements(p_linhas) x
  ),
  normalizadas as (
    select
      *,
      md5(
        coalesce(data_referencia::text, '') || '|' ||
        upper(trim(coalesce(numero_os, ''))) || '|' ||
        upper(trim(coalesce(supervisao, ''))) || '|' ||
        upper(trim(coalesce(cliente, ''))) || '|' ||
        upper(trim(coalesce(funcionario, ''))) || '|' ||
        upper(trim(coalesce(local_embarque, ''))) || '|' ||
        upper(trim(coalesce(origem, 'IMPORTACAO_FOB')))
      ) as import_hash
    from linhas
    where data_referencia is not null
      and numero_os is not null
      and status_comparacao in ('PENDENTE', 'OK', 'DOIS EMBARQUES')
  ),
  upserted as (
    insert into public.logistica_fob (
      data_referencia,
      numero_os,
      cliente,
      supervisao,
      funcionario,
      cidade,
      local_embarque,
      motivo,
      status_comparacao,
      status,
      visualizado,
      tons_movimento,
      tons_producao,
      tons_nh,
      observacao,
      origem,
      import_hash,
      arquivo_movimentacao,
      arquivo_producao,
      arquivo_nhe,
      raw,
      criado_por
    )
    select
      data_referencia,
      numero_os,
      cliente,
      supervisao,
      funcionario,
      cidade,
      local_embarque,
      motivo,
      status_comparacao,
      'PENDENTE',
      false,
      tons_movimento,
      tons_producao,
      tons_nh,
      observacao,
      origem,
      import_hash,
      arquivo_movimentacao,
      arquivo_producao,
      arquivo_nhe,
      raw,
      auth.uid()
    from normalizadas
    on conflict (import_hash)
    where import_hash is not null
    do update set
      cliente = excluded.cliente,
      supervisao = excluded.supervisao,
      funcionario = coalesce(excluded.funcionario, public.logistica_fob.funcionario),
      cidade = excluded.cidade,
      local_embarque = excluded.local_embarque,
      motivo = coalesce(excluded.motivo, public.logistica_fob.motivo),
      status_comparacao = excluded.status_comparacao,
      tons_movimento = excluded.tons_movimento,
      tons_producao = excluded.tons_producao,
      tons_nh = excluded.tons_nh,
      observacao = excluded.observacao,
      arquivo_movimentacao = excluded.arquivo_movimentacao,
      arquivo_producao = excluded.arquivo_producao,
      arquivo_nhe = excluded.arquivo_nhe,
      raw = excluded.raw,
      -- Se a nova importação mudou o resultado da comparação, volta para validação do gestor.
      status = case
        when public.logistica_fob.status_comparacao is distinct from excluded.status_comparacao then 'PENDENTE'
        else public.logistica_fob.status
      end,
      visualizado = case
        when public.logistica_fob.status_comparacao is distinct from excluded.status_comparacao then false
        else public.logistica_fob.visualizado
      end,
      updated_at = now()
    returning id
  )
  select count(*) into v_total from upserted;

  return jsonb_build_object('ok', true, 'total_salvo', v_total);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.salvar_programacao(p_data date, p_coordenacao text, p_supervisao text, p_solicitante text, p_itens jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_programacao_id uuid;
  v_item jsonb;
  v_item_id uuid;
begin

  -- 1. cria programação
  insert into public.programacoes (
    data_referencia,
    coordenacao,
    supervisao,
    solicitante_nome,
    status
  )
  values (
    p_data,
    p_coordenacao,
    p_supervisao,
    p_solicitante,
    'salva'
  )
  returning id into v_programacao_id;

  -- 2. loop itens
  for v_item in select * from jsonb_array_elements(p_itens)
  loop

    insert into public.programacao_itens (
      programacao_id,
      colaborador_nome,
      disponibilidade_status,
      estadia_tipo,
      hotel_dias,
      hotel_chegada,
      cafe_marcado,
      almoco_marcado,
      janta_marcado,
      deslocamento_tipo,
      extras_recarga_valor,
      precisa_hospedagem,
      precisa_conferencia
    )
    values (
      v_programacao_id,
      v_item->>'colaborador_nome',
      v_item->>'disponibilidade_status',
      v_item->>'estadia_tipo',
      (v_item->>'hotel_dias')::int,
      (v_item->>'hotel_chegada')::time,
      (v_item->>'cafe_marcado')::boolean,
      (v_item->>'almoco_marcado')::boolean,
      (v_item->>'janta_marcado')::boolean,
      v_item->>'deslocamento_tipo',
      (v_item->>'extras_recarga_valor')::numeric,
      case when v_item->>'estadia_tipo' is not null then true else false end,
      true
    )
    returning id into v_item_id;

    -- 3. encaminhamento conferência
    insert into public.programacao_encaminhamentos (
      programacao_id,
      programacao_item_id,
      setor_destino,
      modulo_destino,
      status
    )
    values (
      v_programacao_id,
      v_item_id,
      'Conferencia',
      'conferencia',
      'pendente'
    );

    -- 4. encaminhamento hospedagem (se tiver estadia)
    if (v_item->>'estadia_tipo') is not null then
      insert into public.programacao_encaminhamentos (
        programacao_id,
        programacao_item_id,
        setor_destino,
        modulo_destino,
        status
      )
      values (
        v_programacao_id,
        v_item_id,
        'Hospedagem',
        'hotel',
        'pendente'
      );
    end if;

  end loop;

  return v_programacao_id;

end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_financeiro_pagamentos_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_grm_sync_jobs_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_limit(real)
 RETURNS real
 LANGUAGE c
 STRICT
AS '$libdir/pg_trgm', $function$set_limit$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at_colaboradores_historico()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at_frotas_multas()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.atualizado_em = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at_generic()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at_logistica_abertura_os()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at_logistica_fob()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at_relatorios_importacoes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.show_limit()
 RETURNS real
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$show_limit$function$
;

CREATE OR REPLACE FUNCTION public.show_trgm(text)
 RETURNS text[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$show_trgm$function$
;

CREATE OR REPLACE FUNCTION public.similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity$function$
;

CREATE OR REPLACE FUNCTION public.similarity_dist(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity_dist$function$
;

CREATE OR REPLACE FUNCTION public.similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity_op$function$
;

CREATE OR REPLACE FUNCTION public.sincronizar_alias_bfleet_vehicle_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if nullif(trim(new.bfleet_vehicle_id), '') is not null then
    new.bfleet_id := trim(new.bfleet_vehicle_id);
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sincronizar_frotas_veiculos_patrimonios()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_total_snapshot integer := 0;
  v_total_atualizados integer := 0;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Usuario nao autenticado.' using errcode = '42501';
  end if;

  select count(*)
    into v_total_snapshot
    from public.patrimonios_snapshot;

  if v_total_snapshot = 0 then
    return jsonb_build_object(
      'veiculos_atualizados', 0,
      'patrimonios_processados', 0
    );
  end if;

  -- Limpa somente o retrato corrente. condutor_patrimonio fica preservado aqui
  -- para sabermos qual era o ultimo condutor que alimentava motorista_atual.
  update public.frotas_veiculos
     set patrimonio_codigo = null,
         patrimonio_ultima_leitura = null,
         patrimonio_dias_sem_leitura = null,
         patrimonio_funcionario = null,
         patrimonio_coordenacao = null,
         patrimonio_supervisao = null,
         condutor_divergente = false
   where patrimonio_codigo is not null
      or patrimonio_ultima_leitura is not null
      or patrimonio_dias_sem_leitura is not null
      or patrimonio_funcionario is not null
      or patrimonio_coordenacao is not null
      or patrimonio_supervisao is not null
      or condutor_divergente is true;

  with candidatos as (
    select
      p.*,
      regexp_replace(
        coalesce(
          (regexp_match(
            upper(coalesce(p.identificacao, '')),
            '([A-Z]{3}[- ]?[0-9][A-Z0-9][0-9]{2})'
          ))[1],
          ''
        ),
        '[^A-Z0-9]',
        '',
        'g'
      ) as placa_normalizada
    from public.patrimonios_snapshot p
  ),
  patrimonio_mais_recente as (
    select distinct on (placa_normalizada)
      placa_normalizada,
      patrimonio_codigo,
      ultima_leitura,
      dias_sem_leitura,
      funcionario,
      coordenacao,
      supervisao
    from candidatos
    where length(placa_normalizada) = 7
    order by
      placa_normalizada,
      data_upload desc nulls last,
      ultima_leitura desc nulls last
  ),
  atualizados as (
    update public.frotas_veiculos v
       set patrimonio_codigo = p.patrimonio_codigo,
           patrimonio_ultima_leitura = p.ultima_leitura,
           patrimonio_dias_sem_leitura = p.dias_sem_leitura,
           patrimonio_funcionario = nullif(trim(p.funcionario), ''),
           patrimonio_coordenacao = p.coordenacao,
           patrimonio_supervisao = p.supervisao,
           -- Se estava vazio ou acompanhava o ultimo condutor do Patrimonio,
           -- passa a acompanhar o condutor atual. Se divergiu manualmente,
           -- a edicao manual continua prevalecendo.
           motorista_atual = case
             when nullif(trim(p.funcionario), '') is null then v.motorista_atual
             when nullif(trim(v.motorista_atual), '') is null then nullif(trim(p.funcionario), '')
             when nullif(trim(v.condutor_patrimonio), '') is not null
              and upper(regexp_replace(unaccent(trim(v.motorista_atual)), '\s+', ' ', 'g'))
                  = upper(regexp_replace(unaccent(trim(v.condutor_patrimonio)), '\s+', ' ', 'g'))
               then nullif(trim(p.funcionario), '')
             else v.motorista_atual
           end,
           condutor_patrimonio = nullif(trim(p.funcionario), ''),
           coordenacao = coalesce(nullif(trim(v.coordenacao), ''), nullif(trim(p.coordenacao), ''), v.coordenacao),
           supervisao = coalesce(nullif(trim(v.supervisao), ''), nullif(trim(p.supervisao), ''), v.supervisao)
      from patrimonio_mais_recente p
     where regexp_replace(upper(coalesce(v.placa, '')), '[^A-Z0-9]', '', 'g') = p.placa_normalizada
    returning v.id
  )
  select count(*)
    into v_total_atualizados
    from atualizados;

  -- Marca divergencia apenas quando existe um condutor corrente no Patrimonio.
  update public.frotas_veiculos
     set condutor_divergente = (
       nullif(trim(patrimonio_funcionario), '') is not null
       and nullif(trim(motorista_atual), '') is not null
       and upper(regexp_replace(unaccent(trim(motorista_atual)), '\s+', ' ', 'g'))
           <> upper(regexp_replace(unaccent(trim(patrimonio_funcionario)), '\s+', ' ', 'g'))
     )
   where patrimonio_codigo is not null
      or patrimonio_funcionario is not null;

  return jsonb_build_object(
    'veiculos_atualizados', v_total_atualizados,
    'patrimonios_processados', v_total_snapshot
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sincronizar_operacional_os_da_lista_grm(p_data date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '60s'
AS $function$
declare
  v_os_cargas integer := 0;
  v_os_lista integer := 0;
  v_com_ponto integer := 0;
  v_sem_ponto integer := 0;
  v_atualizadas integer := 0;
begin
  drop table if exists tmp_cargas_os;
  drop table if exists tmp_os_lista_grm;

  create temp table tmp_cargas_os on commit drop as
  select distinct regexp_replace(coalesce(os::text, ''), '\D', '', 'g') as os_norm
  from public.grm_cargas_importacoes
  where data_classificacao = p_data
    and coalesce(os::text, '') <> '';

  select count(*) into v_os_cargas
  from tmp_cargas_os;

  create temp table tmp_os_lista_grm on commit drop as
  with base as (
    select distinct on (regexp_replace(coalesce(l.dados_json->>'O.S.', ''), '\D', '', 'g'))
      regexp_replace(coalesce(l.dados_json->>'O.S.', ''), '\D', '', 'g') as os_norm,
      (l.dados_json->>'O.S.')::text as numero_os,
      l.dados_json,
      l.data_sincronizacao,
      l.created_at,
      l.updated_at
    from public.grm_lista_os_importacoes l
    join tmp_cargas_os c
      on c.os_norm = regexp_replace(coalesce(l.dados_json->>'O.S.', ''), '\D', '', 'g')
    where coalesce(l.dados_json->>'O.S.', '') <> ''
    order by
      regexp_replace(coalesce(l.dados_json->>'O.S.', ''), '\D', '', 'g'),
      l.data_sincronizacao desc nulls last,
      l.updated_at desc nulls last,
      l.created_at desc nulls last
  ),
  mapeada as (
    select
      b.os_norm,
      b.numero_os,
      b.dados_json,

      case
        when nullif(b.dados_json->>'Data', '') ~ '^\d{2}/\d{2}/\d{4}$'
        then to_date(b.dados_json->>'Data', 'DD/MM/YYYY')
        else null
      end as data_os,

      coalesce(
        nullif(b.dados_json->>'Cliente_2', ''),
        nullif(b.dados_json->>'Cliente_1', ''),
        nullif(b.dados_json->>'Cliente', '')
      ) as cliente,

      trim(
        coalesce(b.dados_json->>'UF', '') || ' - ' ||
        coalesce(b.dados_json->>'Cidade de Emb.', '') || ' (' ||
        coalesce(b.dados_json->>'Local de Embarque', '') || ')'
      ) as embarque,

      trim(
        coalesce(b.dados_json->>'UF Destino', '') || ' - ' ||
        coalesce(b.dados_json->>'Cidade', '') || ' (' ||
        coalesce(b.dados_json->>'Destino', '') || ')'
      ) as destino,

      b.dados_json->>'Produto' as produto,
      b.dados_json->>'Contrato' as contrato,

      b.dados_json->>'UF' as uf_embarque,
      b.dados_json->>'Cidade de Emb.' as cidade_embarque,
      b.dados_json->>'Local de Embarque' as local_embarque,

      public.norm_txt(b.dados_json->>'UF') as uf_norm,
      public.norm_txt(b.dados_json->>'Cidade de Emb.') as cidade_norm,
      public.norm_txt(b.dados_json->>'Local de Embarque') as local_norm,
      public.norm_txt(
        coalesce(b.dados_json->>'UF', '') || ' - ' ||
        coalesce(b.dados_json->>'Cidade de Emb.', '') || ' (' ||
        coalesce(b.dados_json->>'Local de Embarque', '') || ')'
      ) as label_norm
    from base b
  ),
  pontos as (
    select
      p.id,
      p.nome_local,
      p.uf,
      p.cidade,
      p.latitude,
      p.longitude,
      p.embarque_label,
      public.norm_txt(p.uf) as uf_norm,
      public.norm_txt(p.cidade) as cidade_norm,
      public.norm_txt(p.nome_local) as nome_norm,
      public.norm_txt(p.embarque_label) as label_norm,
      p.updated_at,
      p.created_at
    from public.operacional_pontos_embarque p
    where p.latitude is not null
      and p.longitude is not null
      and coalesce(p.ativo, true) = true
  )
  select distinct on (m.os_norm)
    m.*,
    p.id as ponto_embarque_id,
    p.nome_local as ponto1_nome,
    p.latitude as ponto1_latitude,
    p.longitude as ponto1_longitude,
    p.embarque_label as ponto1_label
  from mapeada m
  left join pontos p
    on p.uf_norm = m.uf_norm
   and p.cidade_norm = m.cidade_norm
   and (
        p.nome_norm = m.local_norm
     or p.label_norm = m.label_norm
     or p.label_norm = public.norm_txt(m.uf_embarque || ' - ' || m.cidade_embarque || ' (' || m.local_embarque || ')')
     or (
          length(m.local_norm) >= 10
          and (
               p.nome_norm like '%' || m.local_norm || '%'
            or m.local_norm like '%' || p.nome_norm || '%'
            or p.label_norm like '%' || m.local_norm || '%'
          )
        )
   )
  order by
    m.os_norm,
    case
      when p.nome_norm = m.local_norm then 0
      when p.label_norm = m.label_norm then 1
      when p.label_norm = public.norm_txt(m.uf_embarque || ' - ' || m.cidade_embarque || ' (' || m.local_embarque || ')') then 2
      when p.id is not null then 3
      else 9
    end,
    p.updated_at desc nulls last,
    p.created_at desc nulls last;

  select count(*) into v_os_lista
  from tmp_os_lista_grm;

  select count(*) into v_com_ponto
  from tmp_os_lista_grm
  where ponto1_latitude is not null
    and ponto1_longitude is not null;

  select count(*) into v_sem_ponto
  from tmp_os_lista_grm
  where ponto1_latitude is null
     or ponto1_longitude is null;

  update public.operacional_os o
     set
       data_os = coalesce(t.data_os, o.data_os),
       cliente = coalesce(t.cliente, o.cliente),
       embarque = coalesce(t.embarque, o.embarque),
       destino = coalesce(t.destino, o.destino),
       produto = coalesce(t.produto, o.produto),
       contrato = coalesce(t.contrato, o.contrato),
       ponto1_latitude = coalesce(t.ponto1_latitude, o.ponto1_latitude),
       ponto1_longitude = coalesce(t.ponto1_longitude, o.ponto1_longitude),
       ponto1_nome = coalesce(t.ponto1_nome, o.ponto1_nome),
       ponto_embarque_id = coalesce(t.ponto_embarque_id, o.ponto_embarque_id),
       raw = t.dados_json,
       arquivo_origem = 'agente:grm_lista_os_importacoes',
       updated_at = now()
    from tmp_os_lista_grm t
   where regexp_replace(coalesce(o.numero_os::text, ''), '\D', '', 'g') = t.os_norm;

  get diagnostics v_atualizadas = row_count;

  return jsonb_build_object(
    'data_ref', p_data,
    'os_distintas_nas_cargas', v_os_cargas,
    'os_encontradas_na_lista_grm', v_os_lista,
    'os_com_ponto_encontrado', v_com_ponto,
    'os_sem_ponto_encontrado', v_sem_ponto,
    'operacional_os_atualizadas', v_atualizadas,
    'processado_em', now()
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.solicitar_aplicar_distribuicao_os(p_motivo text DEFAULT 'distribuir_os'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_pendencias integer := 0;
  v_job_existente uuid;
  v_novo_job uuid;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  select count(*)::integer
    into v_pendencias
  from public.operacional_os os
  where os.status_gestor = 'ATENDER'
    and coalesce(os.status_conferencia, '') <> 'AJUSTADA'
    and exists (
      select 1 from public.operacional_os_colaboradores oc where oc.os_id = os.id
    )
    and exists (
      select 1 from public.supervisoes s
      where s.distribuicao_os_automatica = true
        and s.nome = os.supervisao
    );

  if v_pendencias = 0 then
    return jsonb_build_object(
      'ok', true,
      'enfileirado', false,
      'job_existente', false,
      'pendencias', 0,
      'motivo', coalesce(p_motivo, 'distribuir_os')
    );
  end if;

  select id
    into v_job_existente
  from public.grm_sync_jobs
  where agente_id = 'aplicar-distribuicao-os'
    and status in ('pendente', 'rodando')
  order by created_at desc
  limit 1;

  if v_job_existente is not null then
    return jsonb_build_object(
      'ok', true,
      'enfileirado', false,
      'job_existente', true,
      'job_id', v_job_existente,
      'pendencias', v_pendencias,
      'motivo', coalesce(p_motivo, 'distribuir_os')
    );
  end if;

  insert into public.grm_sync_jobs (agente_id, status)
  values ('aplicar-distribuicao-os', 'pendente')
  returning id into v_novo_job;

  return jsonb_build_object(
    'ok', true,
    'enfileirado', true,
    'job_existente', false,
    'job_id', v_novo_job,
    'pendencias', v_pendencias,
    'motivo', coalesce(p_motivo, 'distribuir_os')
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.solicitar_finalizacao_os_gestor(p_motivo text DEFAULT 'programacao'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_pendencias integer := 0;
  v_job_existente uuid;
  v_novo_job uuid;
  v_data_operacional date := (now() at time zone 'America/Sao_Paulo')::date;
  v_agente_habilitado boolean := true;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  select coalesce(s.enabled, true)
    into v_agente_habilitado
  from public.grm_sync_agent_settings s
  where s.agent_id = 'sync-finalizar-os';

  if coalesce(v_agente_habilitado, true) = false then
    return jsonb_build_object(
      'ok', true,
      'enfileirado', false,
      'job_existente', false,
      'agente_habilitado', false,
      'pendencias', 0,
      'data_operacional', v_data_operacional,
      'motivo', coalesce(p_motivo, 'programacao'),
      'bloqueio', 'Agente de finalização temporariamente desabilitado por segurança.'
    );
  end if;

  select count(*)::integer
    into v_pendencias
  from public.operacional_os
  where status_gestor = 'FINALIZAR'
    and coalesce(status_logistica, 'PENDENTE') = 'PENDENTE'
    and enviado_logistica_em is not null
    and (enviado_logistica_em at time zone 'America/Sao_Paulo')::date = v_data_operacional;

  if v_pendencias = 0 then
    return jsonb_build_object(
      'ok', true,
      'enfileirado', false,
      'job_existente', false,
      'agente_habilitado', true,
      'pendencias', 0,
      'data_operacional', v_data_operacional,
      'motivo', coalesce(p_motivo, 'programacao')
    );
  end if;

  select id
    into v_job_existente
  from public.grm_sync_jobs
  where agente_id = 'sync-finalizar-os'
    and status in ('pendente', 'rodando')
  order by created_at desc
  limit 1;

  if v_job_existente is not null then
    return jsonb_build_object(
      'ok', true,
      'enfileirado', false,
      'job_existente', true,
      'agente_habilitado', true,
      'job_id', v_job_existente,
      'pendencias', v_pendencias,
      'data_operacional', v_data_operacional,
      'motivo', coalesce(p_motivo, 'programacao')
    );
  end if;

  insert into public.grm_sync_jobs (agente_id, status)
  values ('sync-finalizar-os', 'pendente')
  returning id into v_novo_job;

  return jsonb_build_object(
    'ok', true,
    'enfileirado', true,
    'job_existente', false,
    'agente_habilitado', true,
    'job_id', v_novo_job,
    'pendencias', v_pendencias,
    'data_operacional', v_data_operacional,
    'motivo', coalesce(p_motivo, 'programacao')
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity$function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity_commutator_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_commutator_op$function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity_dist_commutator_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_dist_commutator_op$function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity_dist_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_dist_op$function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_op$function$
;

CREATE OR REPLACE FUNCTION public.sync_compras_solicitacao_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_status text;
begin
  select
    case
      when bool_and(status = 'aguardando_gestor') then 'aguardando_gestor'
      when bool_and(status = 'concluido') then 'concluido'
      when bool_and(status = 'comprado') then 'comprado'
      when bool_and(status = 'recusado') then 'recusado'
      when bool_and(status = 'cancelado') then 'cancelado'
      when bool_or(status = 'aguardando_nf') then 'aguardando_nf'
      when bool_or(status = 'aguardando_termo') then 'aguardando_termo'
      when bool_or(status = 'pendente_pagamento') then 'pendente_pagamento'
      when bool_or(status = 'em_analise') then 'em_analise'
      when bool_or(status = 'em_cotacao') then 'em_cotacao'
      else 'pendente'
    end
  into v_status
  from compras_itens
  where solicitacao_id = new.solicitacao_id;

  update compras_solicitacoes
  set status = v_status
  where id = new.solicitacao_id;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_profile_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_programacao_itens_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_operacional_os_resolver_ponto()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_ponto record;
begin
  if new.embarque is null or btrim(new.embarque) = '' then
    new.ponto_embarque_id := null;
    new.ponto1_latitude := null;
    new.ponto1_longitude := null;
    new.ponto1_nome := null;
    return new;
  end if;

  select p.id, p.nome_local, p.cidade, p.uf, p.latitude, p.longitude
    into v_ponto
  from public.operacional_pontos_embarque p
  where p.id = public.match_ponto_embarque(new.embarque, new.cliente, new.supervisao);

  if v_ponto.id is null then
    new.ponto_embarque_id := null;
    new.ponto1_latitude := null;
    new.ponto1_longitude := null;
    new.ponto1_nome := null;
    return new;
  end if;

  new.ponto_embarque_id := v_ponto.id;
  new.ponto1_latitude := v_ponto.latitude;
  new.ponto1_longitude := v_ponto.longitude;
  new.ponto1_nome := v_ponto.nome_local || ' · ' || coalesce(v_ponto.cidade, '') || '/' || coalesce(v_ponto.uf, '');
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.uber_claim_removal_batch(p_limit integer DEFAULT 10)
 RETURNS SETOF uber_colaboradores_remocao_fila
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Recupera itens que possam ter ficado presos por timeout/restart da função.
  update public.uber_colaboradores_remocao_fila
     set status = 'pendente',
         ultimo_erro = coalesce(ultimo_erro, 'Processamento anterior interrompido; item devolvido à fila.'),
         updated_at = now()
   where status = 'processando'
     and updated_at < now() - interval '30 minutes';

  return query
  with picked as (
    select q.id
    from public.uber_colaboradores_remocao_fila q
    where q.status in ('pendente','erro','sem_email')
    order by q.detectado_em asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 25))
  ), claimed as (
    update public.uber_colaboradores_remocao_fila q
       set status = 'processando',
           tentativas = q.tentativas + 1,
           updated_at = now()
      from picked p
     where q.id = p.id
    returning q.*
  )
  select * from claimed;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.uber_fila_remocao_por_status_colaborador()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email text;
  v_ultima_reativacao timestamptz;
  v_status text;
begin
  -- Se voltou a ser ativo antes do envio, cancela qualquer remoção ainda não enviada.
  if new.ativo_novo is true then
    update public.uber_colaboradores_remocao_fila
       set status = 'cancelado',
           cancelado_em = now(),
           ultimo_erro = null,
           updated_at = now()
     where colaborador_id = new.colaborador_id
       and status in ('pendente','processando','sem_email','erro');
    return new;
  end if;

  if coalesce(new.ativo_anterior, false) is not true or coalesce(new.ativo_novo, true) is not false then
    return new;
  end if;

  -- Regra principal: só remove do Uber se o colaborador realmente não estiver mais ativo na base atual.
  if exists (
    select 1
    from public.colaboradores_atuais ca
    where ca.id = new.colaborador_id
      and ca.ativo is true
  ) then
    return new;
  end if;

  -- Evita repetir a mesma remoção em relatórios sucessivos de "ausente".
  select max(h.detectado_em)
    into v_ultima_reativacao
  from public.colaboradores_status_historico h
  where h.colaborador_id = new.colaborador_id
    and h.ativo_novo is true
    and h.detectado_em < new.detectado_em;

  if exists (
    select 1
    from public.uber_colaboradores_remocao_fila q
    where q.colaborador_id = new.colaborador_id
      and q.status in ('pendente','processando','enviado','sem_email','erro')
      and q.detectado_em > coalesce(v_ultima_reativacao, '-infinity'::timestamptz)
  ) then
    return new;
  end if;

  v_email := public.uber_resolve_email_remocao(new.colaborador_id, new.nome);
  v_status := case when v_email is null then 'sem_email' else 'pendente' end;

  insert into public.uber_colaboradores_remocao_fila (
    status_historico_id,
    colaborador_id,
    nome,
    email,
    status,
    detectado_em,
    fonte
  ) values (
    new.id,
    new.colaborador_id,
    coalesce(nullif(trim(new.nome),''), 'COLABORADOR'),
    v_email,
    v_status,
    coalesce(new.detectado_em, now()),
    new.fonte
  )
  on conflict (status_historico_id) do nothing;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.uber_normaliza_nome(p_nome text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select upper(regexp_replace(unaccent(coalesce(p_nome,'')), '[^A-Za-z0-9]+', ' ', 'g'));
$function$
;

CREATE OR REPLACE FUNCTION public.uber_reconciliar_colaboradores_ativos()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inseridos integer := 0;
begin
  -- Se deixou de ser ativo antes do envio ao Uber, cancela a inclusão pendente.
  update public.uber_colaboradores_adicao_fila q
     set status = 'cancelado',
         cancelado_em = now(),
         ultimo_erro = null,
         updated_at = now()
   where q.status in ('pendente','processando','sem_email','erro')
     and not exists (
       select 1
       from public.colaboradores_atuais ca
       where ca.id = q.colaborador_id
         and ca.ativo is true
     );

  -- Novo cadastro ou reativação: aparece ativo agora, mas não era ativo no último estado observado.
  with candidatos as (
    select
      ca.id as colaborador_id,
      ca.nome,
      lower(coalesce(nullif(trim(ca.email_empresa),''), nullif(trim(ca.email_pessoal),''))) as email
    from public.colaboradores_atuais ca
    left join public.uber_colaboradores_equipe_estado s on s.colaborador_id = ca.id
    where ca.ativo is true
      and (s.colaborador_id is null or s.ativo_observado is false)
  ), inseridos as (
    insert into public.uber_colaboradores_adicao_fila (
      colaborador_id, nome, email, status, detectado_em, fonte
    )
    select
      c.colaborador_id,
      c.nome,
      c.email,
      case when c.email is null then 'sem_email' else 'pendente' end,
      now(),
      case
        when exists (
          select 1 from public.uber_colaboradores_equipe_estado s
          where s.colaborador_id = c.colaborador_id
        ) then 'reativacao_colaborador'
        else 'novo_colaborador_ativo'
      end
    from candidatos c
    where not exists (
      select 1
      from public.uber_colaboradores_adicao_fila q
      where q.colaborador_id = c.colaborador_id
        and q.status in ('pendente','processando','sem_email','erro')
    )
    returning 1
  )
  select count(*) into v_inseridos from inseridos;

  -- Se o e-mail apareceu depois, libera novamente a fila sem_email.
  update public.uber_colaboradores_adicao_fila q
     set email = lower(coalesce(nullif(trim(ca.email_empresa),''), nullif(trim(ca.email_pessoal),''))),
         status = 'pendente',
         ultimo_erro = null,
         updated_at = now()
    from public.colaboradores_atuais ca
   where q.colaborador_id = ca.id
     and ca.ativo is true
     and q.status = 'sem_email'
     and coalesce(nullif(trim(ca.email_empresa),''), nullif(trim(ca.email_pessoal),'')) is not null;

  -- Atualiza o snapshot de estado depois de detectar as transições.
  insert into public.uber_colaboradores_equipe_estado (
    colaborador_id, ativo_observado, nome, email, inicializado_em, ultima_mudanca_em, updated_at
  )
  select
    ca.id,
    ca.ativo is true,
    ca.nome,
    lower(coalesce(nullif(trim(ca.email_empresa),''), nullif(trim(ca.email_pessoal),''))),
    now(), now(), now()
  from public.colaboradores_atuais ca
  on conflict (colaborador_id) do update
    set ativo_observado = excluded.ativo_observado,
        nome = excluded.nome,
        email = excluded.email,
        ultima_mudanca_em = case
          when public.uber_colaboradores_equipe_estado.ativo_observado is distinct from excluded.ativo_observado
          then now()
          else public.uber_colaboradores_equipe_estado.ultima_mudanca_em
        end,
        updated_at = now();

  return v_inseridos;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.uber_reconciliar_colaboradores_inativos()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inseridos integer := 0;
begin
  -- Se o colaborador voltou à lista ativa antes do envio, cancela a remoção pendente.
  update public.uber_colaboradores_remocao_fila q
     set status = 'cancelado',
         cancelado_em = now(),
         ultimo_erro = null,
         updated_at = now()
   where q.status in ('pendente','processando','sem_email','erro')
     and exists (
       select 1
       from public.colaboradores_atuais ca
       where ca.id = q.colaborador_id
         and ca.ativo is true
     );

  with latest_inactive as (
    select distinct on (h.colaborador_id)
      h.id as status_historico_id,
      h.colaborador_id,
      h.nome,
      h.detectado_em,
      h.fonte
    from public.colaboradores_status_historico h
    where h.ativo_novo is false
    order by h.colaborador_id, h.detectado_em desc
  ), candidates as (
    select li.*,
           public.uber_resolve_email_remocao(li.colaborador_id, li.nome) as email
    from latest_inactive li
    where not exists (
      select 1
      from public.colaboradores_atuais ca
      where ca.id = li.colaborador_id
        and ca.ativo is true
    )
      and not exists (
        select 1
        from public.colaboradores_status_historico hr
        where hr.colaborador_id = li.colaborador_id
          and hr.ativo_novo is true
          and hr.detectado_em > li.detectado_em
      )
      and not exists (
        select 1
        from public.uber_colaboradores_remocao_fila q
        where q.colaborador_id = li.colaborador_id
          and q.status in ('pendente','processando','enviado','sem_email','erro')
          and q.detectado_em >= li.detectado_em
      )
  )
  insert into public.uber_colaboradores_remocao_fila (
    status_historico_id,
    colaborador_id,
    nome,
    email,
    status,
    detectado_em,
    fonte
  )
  select
    c.status_historico_id,
    c.colaborador_id,
    coalesce(nullif(trim(c.nome), ''), 'COLABORADOR'),
    c.email,
    case when c.email is null or position('@' in c.email) = 0 then 'sem_email' else 'pendente' end,
    coalesce(c.detectado_em, now()),
    coalesce(c.fonte, 'reconciliacao_lista_ativos')
  from candidates c
  on conflict (status_historico_id) do nothing;

  get diagnostics v_inseridos = row_count;
  return v_inseridos;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.uber_resolve_email_remocao(p_colaborador_id uuid, p_nome text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email text;
begin
  select coalesce(nullif(trim(c.email_empresa),''), nullif(trim(c.email_pessoal),''))
    into v_email
  from public.colaboradores c
  where c.id = p_colaborador_id
  limit 1;

  if v_email is not null then
    return lower(v_email);
  end if;

  select lower(nullif(trim(u.email),''))
    into v_email
  from public.conferencia_uber_corridas u
  where nullif(trim(u.email),'') is not null
    and public.uber_normaliza_nome(coalesce(u.nome_colaborador, u.nome)) = public.uber_normaliza_nome(p_nome)
  order by u.data_solicitacao_local desc nulls last, u.updated_at desc nulls last
  limit 1;

  return v_email;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.uber_validar_por_os_laudo(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_row conferencia_uber_corridas%rowtype;
  v_match record;
  v_raio_m constant numeric := 2000;
begin
  select * into v_row from conferencia_uber_corridas where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Corrida não encontrada.');
  end if;

  if v_row.partida_latitude is null or v_row.partida_longitude is null then
    return jsonb_build_object('ok', false, 'error', 'Corrida sem coordenadas de partida.');
  end if;

  if v_row.status_validacao not in ('PENDENTE', 'ATENCAO', 'ATENÇÃO') then
    return jsonb_build_object('ok', true, 'validado', false, 'motivo', 'ja_classificada');
  end if;

  select
    g.os,
    g.colaborador,
    g.laudo,
    2 * 6371000 * asin(sqrt(
      power(sin(radians(g.lat_lancamento - v_row.partida_latitude) / 2), 2) +
      cos(radians(v_row.partida_latitude)) * cos(radians(g.lat_lancamento)) *
      power(sin(radians(g.lng_lancamento - v_row.partida_longitude) / 2), 2)
    )) as distancia_m
  into v_match
  from grm_cargas_importacoes g
  where g.data_classificacao = v_row.data_solicitacao_local
    and g.lat_lancamento is not null
    and g.lng_lancamento is not null
    and coalesce(g.laudo, '') <> ''
    and (
      lower(g.colaborador) like '%' || lower(coalesce(v_row.nome_colaborador, v_row.nome, '')) || '%'
      or lower(coalesce(v_row.nome_colaborador, v_row.nome, '')) like '%' || lower(g.colaborador) || '%'
    )
  order by distancia_m asc
  limit 1;

  if v_match.os is null then
    update conferencia_uber_corridas
    set observacao_validacao = 'Nenhuma O.S. com laudo do colaborador encontrada na data da corrida.',
        updated_at = now()
    where id = p_id;
    return jsonb_build_object('ok', true, 'validado', false, 'motivo', 'sem_correspondencia');
  end if;

  if v_match.distancia_m > v_raio_m then
    update conferencia_uber_corridas
    set observacao_validacao = format(
          'O.S. %s tem laudo do colaborador na data, mas a %s km da partida (fora do raio de 2km).',
          v_match.os, round((v_match.distancia_m / 1000)::numeric, 1)
        ),
        updated_at = now()
    where id = p_id;
    return jsonb_build_object('ok', true, 'validado', false, 'motivo', 'fora_do_raio', 'os', v_match.os, 'distancia_m', v_match.distancia_m);
  end if;

  update conferencia_uber_corridas
  set status_validacao = 'VALIDADO',
      classificacao_manual = 'VALIDADA',
      motivo_validacao = format('Validação automática: O.S. %s com laudo do colaborador a %s m da partida.', v_match.os, round(v_match.distancia_m)),
      observacao_validacao = null,
      validado_em = now(),
      updated_at = now()
  where id = p_id;

  return jsonb_build_object('ok', true, 'validado', true, 'os', v_match.os, 'distancia_m', v_match.distancia_m);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.unaccent(regdictionary, text)
 RETURNS text
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/unaccent', $function$unaccent_dict$function$
;

CREATE OR REPLACE FUNCTION public.unaccent(text)
 RETURNS text
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/unaccent', $function$unaccent_dict$function$
;

CREATE OR REPLACE FUNCTION public.unaccent_init(internal)
 RETURNS internal
 LANGUAGE c
 PARALLEL SAFE
AS '$libdir/unaccent', $function$unaccent_init$function$
;

CREATE OR REPLACE FUNCTION public.unaccent_lexize(internal, internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 PARALLEL SAFE
AS '$libdir/unaccent', $function$unaccent_lexize$function$
;

CREATE OR REPLACE FUNCTION public.update_grm_sync_agent_setting(p_agent_id text, p_queue_lane text, p_interval_minutes integer)
 RETURNS grm_sync_agent_settings
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_row public.grm_sync_agent_settings;
  v_version smallint := 1;
begin
  if not public.painel_has_module(array['TI_AGENTES','TI'], true) then
    raise exception 'Você não tem permissão para editar agentes.' using errcode='42501';
  end if;

  select coalesce(active_version,1) into v_version
  from public.grm_sync_runtime_policy where id=1;

  if coalesce(v_version,1) >= 2 then
    if p_queue_lane not in (
      'entrada_os','entrada_producao','entrada_financeiro_a','entrada_financeiro_b',
      'entrada_cadastros_operacao','saida_os','saida_logistica','saida_financeiro'
    ) then
      raise exception 'Fila inválida para arquitetura V2.';
    end if;
  else
    if p_queue_lane not in ('fixed_a','fixed_b','fixed_c','alteracoes','despesas_distribuicao') then
      raise exception 'Fila inválida para arquitetura atual.';
    end if;
  end if;

  if p_interval_minutes < 0 or p_interval_minutes > 10080 then
    raise exception 'Intervalo deve ficar entre 0 e 10080 minutos.';
  end if;

  update public.grm_sync_agent_settings
     set queue_lane=p_queue_lane,
         target_lane=case when coalesce(v_version,1)>=2 then p_queue_lane else target_lane end,
         interval_minutes=p_interval_minutes,
         updated_at=now(),
         updated_by=(select auth.uid())
   where agent_id=p_agent_id
  returning * into v_row;

  if v_row.agent_id is null then
    raise exception 'Agente não configurado: %',p_agent_id;
  end if;

  update public.grm_sync_jobs
     set lane=p_queue_lane
   where agente_id=p_agent_id and status='pendente';

  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_programacao_despesas(p_data_referencia date, p_supervisao text, p_coordenacao text, p_solicitante text, p_queue_id text, p_itens jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_item jsonb;
  v_id uuid;
  v_old jsonb;
  v_colaborador text;
  v_inserts int := 0;
  v_updates int := 0;
begin
  for v_item in
    select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb))
  loop

    v_colaborador := trim(coalesce(v_item->>'Colaborador', ''));

    if v_colaborador = '' then
      continue;
    end if;

    select id, to_jsonb(t)
    into v_id, v_old
    from public.programacao_despesas t
    where t.data_referencia = p_data_referencia
      and upper(t.colaborador) = upper(v_colaborador)
    limit 1;

    if v_id is null then
      insert into public.programacao_despesas (
        data_referencia,
        coordenacao,
        supervisao,
        colaborador,
        disponibilidade_status,
        disponibilidade_obs,
        estadia_tipo,
        estadia_obs,
        hotel_dias,
        hotel_chegada,
        cafe_valor,
        almoco_valor,
        janta_valor,
        deslocamento_tipo,
        deslocamento_obs,
        extras_recarga_valor,
        extras_passagem_valor,
        extras_lavagem_valor,
        manut_veic,
        extras_obs,
        queue_id,
        solicitante
      )
      values (
        p_data_referencia,
        coalesce(v_item->>'Coordenação', p_coordenacao),
        coalesce(v_item->>'Supervisão', p_supervisao),
        v_colaborador,
        v_item->>'Disponibilidade_Status',
        v_item->>'Disponibilidade_Obs',
        v_item->>'Estadia_Tipo',
        v_item->>'Estadia_Obs',
        coalesce(nullif(v_item->>'Hotel_Dias','')::int, 0),
        v_item->>'Hotel_Chegada',
        coalesce(nullif(v_item->>'Cafe_Valor','')::int, 0) <> 0,
        coalesce(nullif(v_item->>'Almoco_Valor','')::int, 0) <> 0,
        coalesce(nullif(v_item->>'Janta_Valor','')::int, 0) <> 0,
        v_item->>'Deslocamento_Tipo',
        v_item->>'Deslocamento_Obs',
        coalesce(nullif(v_item->>'Extras_Recarga_Valor','')::numeric, 0),
        coalesce(nullif(v_item->>'Extras_Passagem_Valor','')::numeric, 0),
        coalesce(nullif(v_item->>'Extras_Lavagem_Valor','')::numeric, 0),
        v_item->>'Manut_veic',
        v_item->>'Extras_Obs',
        p_queue_id,
        p_solicitante
      )
      returning id into v_id;

      insert into public.programacao_despesas_hist (
        programacao_despesa_id,
        acao,
        solicitante,
        depois
      )
      values (
        v_id,
        'INSERT',
        p_solicitante,
        (select to_jsonb(t) from public.programacao_despesas t where t.id = v_id)
      );

      v_inserts := v_inserts + 1;

    else
      update public.programacao_despesas
      set
        coordenacao = coalesce(v_item->>'Coordenação', p_coordenacao),
        supervisao = coalesce(v_item->>'Supervisão', p_supervisao),
        disponibilidade_status = v_item->>'Disponibilidade_Status',
        disponibilidade_obs = v_item->>'Disponibilidade_Obs',
        estadia_tipo = v_item->>'Estadia_Tipo',
        estadia_obs = v_item->>'Estadia_Obs',
        hotel_dias = coalesce(nullif(v_item->>'Hotel_Dias','')::int, 0),
        hotel_chegada = v_item->>'Hotel_Chegada',
        cafe_valor = coalesce(nullif(v_item->>'Cafe_Valor','')::int, 0) <> 0,
        almoco_valor = coalesce(nullif(v_item->>'Almoco_Valor','')::int, 0) <> 0,
        janta_valor = coalesce(nullif(v_item->>'Janta_Valor','')::int, 0) <> 0,
        deslocamento_tipo = v_item->>'Deslocamento_Tipo',
        deslocamento_obs = v_item->>'Deslocamento_Obs',
        extras_recarga_valor = coalesce(nullif(v_item->>'Extras_Recarga_Valor','')::numeric, 0),
        extras_passagem_valor = coalesce(nullif(v_item->>'Extras_Passagem_Valor','')::numeric, 0),
        extras_lavagem_valor = coalesce(nullif(v_item->>'Extras_Lavagem_Valor','')::numeric, 0),
        manut_veic = v_item->>'Manut_veic',
        extras_obs = v_item->>'Extras_Obs',
        queue_id = p_queue_id,
        solicitante = p_solicitante
      where id = v_id;

      insert into public.programacao_despesas_hist (
        programacao_despesa_id,
        acao,
        solicitante,
        antes,
        depois
      )
      values (
        v_id,
        'UPDATE',
        p_solicitante,
        v_old,
        (select to_jsonb(t) from public.programacao_despesas t where t.id = v_id)
      );

      v_updates := v_updates + 1;
    end if;

  end loop;

  return jsonb_build_object(
    'ok', true,
    'inserts', v_inserts,
    'updates', v_updates
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity_commutator_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_commutator_op$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity_dist_commutator_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_dist_commutator_op$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity_dist_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_dist_op$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_op$function$
;

-- ============================================================
-- VIEWS
-- ============================================================

CREATE OR REPLACE VIEW public.central_alertas_operacionais AS
 SELECT 'LAUDO_FORA_LOCAL'::text AS tipo_alerta,
    id,
    os_id,
    numero_os,
    cliente,
    supervisao,
    coordenacao,
    colaborador_key,
    colaborador_nome,
    suspeito,
    avaliado,
    enviado_em,
    revisado_em,
    revisado_por,
    revisado_por_nome
   FROM operacional_laudos;

CREATE OR REPLACE VIEW public.colaboradores_atuais AS
 SELECT id,
    nome,
    regexp_replace(COALESCE(cpf, ''::text), '\D'::text, ''::text, 'g'::text) AS cpf,
    tipo,
    cargo,
    supervisao,
    coordenacao,
    empresa,
    situacao,
    situacao = 'Ativo'::text AS ativo,
    CURRENT_DATE AS data_referencia,
    whatsapp,
    email_pessoal,
    email_empresa,
    endereco,
    bairro,
    cidade,
    estado,
    cep,
    admissao,
    desligamento,
    complemento,
    data_nascimento
   FROM colaboradores;

CREATE OR REPLACE VIEW public.email_accounts_public AS
 SELECT id,
    nome,
    email,
    provider,
    imap_host,
    imap_port,
    imap_secure,
    smtp_host,
    smtp_port,
    smtp_secure,
    username,
    pasta_entrada,
    pasta_processados,
    ativo,
    auto_responder,
    limite_por_sync,
    ultima_uid,
    ultima_sync_em,
    ultima_sync_status,
    ultima_sync_erro,
    criado_por,
    criado_por_nome,
    created_at,
    updated_at
   FROM email_accounts;

CREATE OR REPLACE VIEW public.financeiro_fluxo_caixa_diario AS
 WITH dias AS (
         SELECT generate_series(CURRENT_DATE - '120 days'::interval, CURRENT_DATE + '180 days'::interval, '1 day'::interval)::date AS data
        ), receber AS (
         SELECT financeiro_contas_receber.vencimento AS data,
            sum(GREATEST(COALESCE(financeiro_contas_receber.valor, 0::numeric) - COALESCE(financeiro_contas_receber.valor_pago, 0::numeric), 0::numeric)) AS total_receber
           FROM financeiro_contas_receber
          WHERE financeiro_contas_receber.vencimento IS NOT NULL AND (public."normalize"(COALESCE(financeiro_contas_receber.situacao, ''::text)) <> ALL (ARRAY['recebida'::text, 'recebido'::text, 'paga'::text, 'pago'::text]))
          GROUP BY financeiro_contas_receber.vencimento
        ), pagar AS (
         SELECT financeiro_contas_pagar.vencimento AS data,
            sum(GREATEST(COALESCE(financeiro_contas_pagar.valor, 0::numeric) - COALESCE(financeiro_contas_pagar.valor_pago, 0::numeric), 0::numeric)) AS total_pagar
           FROM financeiro_contas_pagar
          WHERE financeiro_contas_pagar.vencimento IS NOT NULL AND (public."normalize"(COALESCE(financeiro_contas_pagar.situacao, ''::text)) <> ALL (ARRAY['paga'::text, 'pago'::text, 'recebida'::text, 'recebido'::text]))
          GROUP BY financeiro_contas_pagar.vencimento
        ), provisoes AS (
         SELECT financeiro_provisoes.data,
            sum(financeiro_provisoes.valor_final) AS total_provisao
           FROM financeiro_provisoes
          GROUP BY financeiro_provisoes.data
        )
 SELECT d.data,
    COALESCE(s.saldo_dia, 0::numeric) AS saldo_dia,
    COALESCE(r.total_receber, 0::numeric) AS contas_receber,
    COALESCE(p.total_pagar, 0::numeric) AS contas_pagar,
    COALESCE(pr.total_provisao, 0::numeric) AS provisoes_dia,
    COALESCE(s.saldo_dia, 0::numeric) + COALESCE(r.total_receber, 0::numeric) - COALESCE(p.total_pagar, 0::numeric) - COALESCE(pr.total_provisao, 0::numeric) AS saldo_projetado,
        CASE
            WHEN (COALESCE(s.saldo_dia, 0::numeric) + COALESCE(r.total_receber, 0::numeric) - COALESCE(p.total_pagar, 0::numeric) - COALESCE(pr.total_provisao, 0::numeric)) < 0::numeric THEN 'ATENÇÃO'::text
            ELSE 'OK'::text
        END AS status
   FROM dias d
     LEFT JOIN financeiro_saldos_dia s ON s.data = d.data
     LEFT JOIN receber r ON r.data = d.data
     LEFT JOIN pagar p ON p.data = d.data
     LEFT JOIN provisoes pr ON pr.data = d.data;

CREATE OR REPLACE VIEW public.financeiro_pagamentos_resumo AS
 SELECT count(*) FILTER (WHERE status = ANY (ARRAY['PENDENTE'::text, 'EM_ANALISE'::text])) AS pendentes,
    count(*) FILTER (WHERE status = ANY (ARRAY['APROVADO'::text, 'AGENDADO'::text])) AS aprovados_agendados,
    count(*) FILTER (WHERE status = 'PAGO'::text) AS pagos,
    COALESCE(sum(valor) FILTER (WHERE status = ANY (ARRAY['PENDENTE'::text, 'EM_ANALISE'::text, 'APROVADO'::text, 'AGENDADO'::text])), 0::numeric) AS total_aberto,
    COALESCE(sum(valor) FILTER (WHERE status = 'PAGO'::text), 0::numeric) AS total_pago
   FROM financeiro_pagamentos;

CREATE OR REPLACE VIEW public.grm_sync_agent_architecture_v2 AS
 SELECT s.agent_id,
    s.enabled,
    s.queue_lane AS current_lane,
    s.legacy_lane_before_v2,
    s.target_lane,
    l.label AS target_lane_label,
    s.direction,
    s.resource_class,
    s.priority,
    s.max_runtime_minutes,
    s.depends_on,
    s.mutex_group,
    s.interval_minutes,
    l.legacy_lane,
    s.updated_at
   FROM grm_sync_agent_settings s
     LEFT JOIN grm_sync_lanes l ON l.lane = s.target_lane;

CREATE OR REPLACE VIEW public.grm_sync_cutover_readiness_v2 AS
 SELECT active_version,
    max_workers,
    max_heavy_concurrent,
    min_free_memory_mb,
    cutover_at,
    (( SELECT count(*) AS count
           FROM grm_sync_jobs
          WHERE grm_sync_jobs.status = 'rodando'::text))::integer AS running_jobs,
    (( SELECT count(*) AS count
           FROM grm_sync_jobs
          WHERE grm_sync_jobs.status = 'pendente'::text))::integer AS pending_jobs,
    (( SELECT count(*) AS count
           FROM grm_sync_agent_settings
          WHERE grm_sync_agent_settings.target_lane IS NULL))::integer AS agents_without_target_lane,
    (( SELECT count(*) AS count
           FROM grm_sync_agent_settings
          WHERE grm_sync_agent_settings.enabled))::integer AS enabled_agents,
    (( SELECT count(*) AS count
           FROM grm_sync_lanes
          WHERE grm_sync_lanes.enabled))::integer AS enabled_target_lanes
   FROM grm_sync_runtime_policy p
  WHERE id = 1;

CREATE OR REPLACE VIEW public.hospedagem_canceladas AS
 SELECT s.id AS solicitacao_id,
    COALESCE(NULLIF(btrim(s.codigo), ''::text), 'SOL-'::text || upper("left"(s.id::text, 8))) AS solicitacao,
    s.data_solicitacao AS data,
    COALESCE(s.quantidade_diarias_prevista,
        CASE
            WHEN s.data_checkin_prevista IS NOT NULL AND s.data_checkout_prevista IS NOT NULL THEN GREATEST(1, s.data_checkout_prevista - s.data_checkin_prevista)
            ELSE 1
        END) AS dias,
    COALESCE(string_agg(DISTINCT sc.nome_colaborador, ', '::text ORDER BY sc.nome_colaborador) FILTER (WHERE sc.nome_colaborador IS NOT NULL AND btrim(sc.nome_colaborador) <> ''::text), NULLIF(btrim(s.colaborador), ''::text), '-'::text) AS colaboradores,
    s.cidade,
    s.uf,
    s.supervisao,
    s.solicitante_nome AS solicitante,
    COALESCE(NULLIF(btrim(au.nome), ''::text), NULLIF(btrim(p.full_name), ''::text), NULLIF(btrim(au.email), ''::text), NULLIF(btrim(p.email), ''::text),
        CASE
            WHEN s.cancelado_por IS NULL THEN 'Não identificado (registro antigo)'::text
            ELSE 'Usuário não identificado'::text
        END) AS cancelado_por,
    s.cancelado_em,
    s.motivo_cancelamento
   FROM hospedagem_solicitacoes s
     LEFT JOIN hospedagem_solicitacao_colaboradores sc ON sc.solicitacao_id = s.id
     LEFT JOIN LATERAL ( SELECT u.nome,
            u.email
           FROM app_usuarios u
          WHERE u.auth_user_id = s.cancelado_por
          ORDER BY u.updated_at DESC NULLS LAST, u.created_at DESC
         LIMIT 1) au ON true
     LEFT JOIN profiles p ON p.id = s.cancelado_por
  WHERE s.status_solicitacao = 'CANCELADA'::text
  GROUP BY s.id, s.codigo, s.data_solicitacao, s.quantidade_diarias_prevista, s.data_checkin_prevista, s.data_checkout_prevista, s.colaborador, s.cidade, s.uf, s.supervisao, s.solicitante_nome, au.nome, au.email, p.full_name, p.email, s.cancelado_por, s.cancelado_em, s.motivo_cancelamento;

CREATE OR REPLACE VIEW public.hospedagem_dashboard_resumo AS
 SELECT count(*) FILTER (WHERE status_solicitacao = ANY (ARRAY['SOLICITADA'::text, 'EM_ANALISE'::text, 'EM_COTACAO'::text])) AS solicitacoes_abertas,
    count(*) FILTER (WHERE checkout_hoje = true) AS checkouts_hoje,
    count(*) FILTER (WHERE checkout_vencido = true) AS checkouts_vencidos,
    count(*) FILTER (WHERE pendencia_financeira = true) AS pendencias_financeiras,
    count(*) FILTER (WHERE pendencia_nf = true) AS pendencias_nf,
    count(*) FILTER (WHERE status_solicitacao = 'RESERVADA'::text) AS reservas_ativas,
    count(*) FILTER (WHERE status_solicitacao = 'CONCLUIDA'::text) AS concluidas
   FROM hospedagem_painel_geral;

CREATE OR REPLACE VIEW public.hospedagem_documentos_pendentes_lancamento AS
 SELECT d.id,
    d.solicitacao_id,
    d.reserva_id,
    d.tipo,
    d.arquivo_url,
    d.nome_arquivo,
    d.mime_type,
    d.origem,
    d.status,
    d.external_message_id,
    d.botconversa_destinatario,
    d.botconversa_enviado_em,
    d.recebido_em,
    d.observacoes,
    d.criado_por,
    d.created_at,
    d.updated_at,
    s.codigo,
    s.cidade,
    s.uf,
    s.cliente
   FROM hospedagem_documentos d
     LEFT JOIN hospedagem_solicitacoes s ON s.id = d.solicitacao_id
  WHERE upper(d.tipo) = 'NFSE'::text AND (upper(d.status) <> ALL (ARRAY['LANCADO'::text, 'DISPENSADO'::text]));

CREATE OR REPLACE VIEW public.hospedagem_historico_atual_colaboradores AS
 SELECT id,
    unique_hash,
    data,
    regional,
    cidade,
    uf,
    colaborador,
    status_planilha,
    status_hospedagem,
    hotel,
    localizacao,
    tipo_quarto,
    valor_diaria,
    local_embarque,
    cliente,
    saldo,
    situacao_pagamento,
    nfs,
    observacao,
    arquivo_origem,
    aba_origem,
    linha_origem,
    raw,
    created_at,
    updated_at,
    rn
   FROM ( SELECT h.id,
            h.unique_hash,
            h.data,
            h.regional,
            h.cidade,
            h.uf,
            h.colaborador,
            h.status_planilha,
            h.status_hospedagem,
            h.hotel,
            h.localizacao,
            h.tipo_quarto,
            h.valor_diaria,
            h.local_embarque,
            h.cliente,
            h.saldo,
            h.situacao_pagamento,
            h.nfs,
            h.observacao,
            h.arquivo_origem,
            h.aba_origem,
            h.linha_origem,
            h.raw,
            h.created_at,
            h.updated_at,
            row_number() OVER (PARTITION BY (upper(TRIM(BOTH FROM COALESCE(h.colaborador, ''::text)))) ORDER BY h.data DESC, h.updated_at DESC) AS rn
           FROM hospedagem_historico_colaboradores h) base
  WHERE rn = 1;

CREATE OR REPLACE VIEW public.hospedagem_minhas_solicitacoes AS
 SELECT solicitacao_id,
    codigo,
    data_solicitacao,
    solicitante_id,
    solicitante_nome,
    empresa,
    coordenacao,
    supervisao,
    cidade,
    uf,
    cliente,
    local_embarque,
    data_checkin_prevista,
    data_checkout_prevista,
    horario_chegada_previsto,
    quantidade_diarias_prevista,
    status_solicitacao,
    hotel,
    data_checkin,
    data_checkout,
    status_hospedagem,
    colaboradores,
    total_colaboradores,
    checkout_hoje,
    checkout_vencido,
    preferencia_hospedagem,
    observacao_gestor
   FROM hospedagem_painel_geral;

CREATE OR REPLACE VIEW public.hospedagem_painel_geral AS
 SELECT s.id AS solicitacao_id,
    s.codigo,
    s.created_at AS data_solicitacao,
    s.solicitante_id,
    s.solicitante_nome,
    s.empresa,
    s.coordenacao,
    s.supervisao,
    s.regional,
    COALESCE(NULLIF(TRIM(BOTH FROM r.cidade_hotel), ''::text), s.cidade) AS cidade,
    COALESCE(NULLIF(TRIM(BOTH FROM r.uf_hotel), ''::text), s.uf) AS uf,
    s.cliente,
    s.local_embarque,
    s.link_local_embarque,
    s.data_checkin_prevista,
    s.data_checkout_prevista,
    s.horario_chegada_previsto,
    s.quantidade_diarias_prevista,
    s.saldo_informado,
    s.status_solicitacao,
    r.id AS reserva_id,
    r.hotel_id,
    COALESCE(r.nome_hotel, h.nome) AS hotel,
    r.valor_diaria,
    r.quantidade_diarias,
    r.quantidade_quartos,
    r.valor_total_previsto,
    r.valor_total_final,
    r.data_checkin,
    r.data_checkout,
    r.status_hospedagem,
    f.id AS financeiro_id,
    f.valor_total AS valor_financeiro,
    f.status_financeiro,
    f.data_vencimento,
    f.data_pagamento,
    f.comprovante_pagamento_url,
    n.id AS nota_id,
    n.tipo_nota,
    n.numero_nf,
    n.valor_nf,
    n.status_nota,
    n.nota_url,
    n.xml_url,
    ( SELECT string_agg(c.nome_colaborador, ', '::text ORDER BY c.nome_colaborador) AS string_agg
           FROM hospedagem_solicitacao_colaboradores c
          WHERE c.solicitacao_id = s.id) AS colaboradores,
    ( SELECT count(*) AS count
           FROM hospedagem_solicitacao_colaboradores c
          WHERE c.solicitacao_id = s.id) AS total_colaboradores,
        CASE
            WHEN r.data_checkout = CURRENT_DATE AND (r.status_hospedagem <> ALL (ARRAY['CHECKOUT_REALIZADO'::text, 'CANCELADA'::text])) THEN true
            ELSE false
        END AS checkout_hoje,
        CASE
            WHEN r.data_checkout < CURRENT_DATE AND (r.status_hospedagem <> ALL (ARRAY['CHECKOUT_REALIZADO'::text, 'CANCELADA'::text])) THEN true
            ELSE false
        END AS checkout_vencido,
        CASE
            WHEN f.status_financeiro = ANY (ARRAY['AGUARDANDO_PAGAMENTO'::text, 'ENVIADO_AO_FINANCEIRO'::text]) THEN true
            ELSE false
        END AS pendencia_financeira,
        CASE
            WHEN n.status_nota = 'AGUARDANDO_NF'::text THEN true
            ELSE false
        END AS pendencia_nf,
    s.preferencia_hospedagem,
    s.observacao_gestor
   FROM hospedagem_solicitacoes s
     LEFT JOIN hospedagem_reservas r ON r.solicitacao_id = s.id
     LEFT JOIN hospedagem_hoteis h ON h.id = r.hotel_id
     LEFT JOIN hospedagem_financeiro f ON f.reserva_id = r.id
     LEFT JOIN hospedagem_notas n ON n.reserva_id = r.id;

CREATE OR REPLACE VIEW public.hospedagem_producao_resumo AS
 SELECT count(*) FILTER (WHERE upper(TRIM(BOTH FROM status)) = 'STAY'::text) AS hospedados,
    count(*) FILTER (WHERE upper(TRIM(BOTH FROM status)) = 'CHECKOUT'::text) AS checkouts,
    count(DISTINCT lower(TRIM(BOTH FROM hotel))) FILTER (WHERE upper(TRIM(BOTH FROM status)) = 'STAY'::text) AS hoteis_ativos,
    COALESCE(sum(valor_diaria) FILTER (WHERE upper(TRIM(BOTH FROM status)) = 'STAY'::text), 0::numeric) AS total_diarias_stay,
    COALESCE(sum(valor_diaria), 0::numeric) AS total_diarias_geral,
    max(data) AS ultima_data
   FROM hospedagem_producao_diarias;

CREATE OR REPLACE VIEW public.programacao_alimentacao_ultima AS
 SELECT a.id,
    a.programacao_id,
    a.data_referencia,
    a.colaborador_id,
    a.nome_colaborador,
    a.cafe,
    a.almoco,
    a.janta,
    a.observacao,
    a.created_at,
    a.updated_at
   FROM programacao_alimentacao a
     JOIN programacao_dia_ultima pd ON pd.id = a.programacao_id;

CREATE OR REPLACE VIEW public.programacao_colaboradores_ultima AS
 SELECT c.id,
    c.programacao_id,
    c.data_referencia,
    c.colaborador_id,
    c.nome_colaborador,
    c.cargo,
    c.coordenacao,
    c.supervisao,
    c.disponibilidade,
    c.observacao,
    c.created_at,
    c.updated_at,
    c.placa_veiculo
   FROM programacao_colaboradores c
     JOIN programacao_dia_ultima pd ON pd.id = c.programacao_id;

CREATE OR REPLACE VIEW public.programacao_deslocamento_ultima AS
 SELECT d.id,
    d.programacao_id,
    d.data_referencia,
    d.colaborador_id,
    d.nome_colaborador,
    d.tipo_deslocamento,
    d.origem,
    d.destino,
    d.km,
    d.valor,
    d.observacao,
    d.created_at,
    d.updated_at,
    d.placa_veiculo
   FROM programacao_deslocamento d
     JOIN programacao_dia_ultima pd ON pd.id = d.programacao_id;

CREATE OR REPLACE VIEW public.programacao_despesas_os_compartilhadas AS
 WITH os_dia AS (
         SELECT DISTINCT pe.programacao_id,
            pe.os_id,
            pe.colaborador_id,
            pd.data_referencia
           FROM programacao_equipe pe
             JOIN programacao_dia pd ON pd.id = pe.programacao_id
          WHERE pe.confirmado = true AND pe.os_id IS NOT NULL
        ), despesas AS (
         SELECT a.id AS despesa_id,
            'ALIMENTACAO'::text AS tipo_registro,
            a.programacao_id AS programacao_origem_id,
            a.data_referencia,
            a.colaborador_id,
            a.nome_colaborador,
            to_jsonb(a.*) AS detalhes
           FROM programacao_alimentacao a
        UNION ALL
         SELECT e.id,
            'ESTADIA'::text AS text,
            e.programacao_id,
            e.data_referencia,
            e.colaborador_id,
            e.nome_colaborador,
            to_jsonb(e.*) AS to_jsonb
           FROM programacao_estadia e
        UNION ALL
         SELECT d_1.id,
            'DESLOCAMENTO'::text AS text,
            d_1.programacao_id,
            d_1.data_referencia,
            d_1.colaborador_id,
            d_1.nome_colaborador,
            to_jsonb(d_1.*) AS to_jsonb
           FROM programacao_deslocamento d_1
        UNION ALL
         SELECT x.id,
            'EXTRA'::text AS text,
            x.programacao_id,
            x.data_referencia,
            x.colaborador_id,
            x.nome_colaborador,
            to_jsonb(x.*) AS to_jsonb
           FROM programacao_extras x
        )
 SELECT d.despesa_id,
    d.tipo_registro,
    d.data_referencia,
    d.colaborador_id,
    d.nome_colaborador,
    d.programacao_origem_id,
    o.programacao_id AS programacao_exibicao_id,
    o.os_id,
    d.detalhes
   FROM despesas d
     JOIN os_dia o ON o.data_referencia = d.data_referencia AND o.colaborador_id = d.colaborador_id;

CREATE OR REPLACE VIEW public.programacao_dia_ultima AS
 WITH ranked AS (
         SELECT pd_1.id,
            row_number() OVER (PARTITION BY pd_1.data_referencia, (upper(TRIM(BOTH FROM COALESCE(pd_1.supervisao, ''::text)))) ORDER BY (COALESCE(pd_1.updated_at, pd_1.created_at, '1970-01-01 00:00:00'::timestamp without time zone::timestamp with time zone)) DESC, pd_1.created_at DESC, pd_1.id DESC) AS rn
           FROM programacao_dia pd_1
        )
 SELECT pd.id,
    pd.data_referencia,
    pd.coordenacao,
    pd.supervisao,
    pd.regional,
    pd.status,
    pd.criado_por,
    pd.created_at,
    pd.updated_at
   FROM programacao_dia pd
     JOIN ranked r ON r.id = pd.id
  WHERE r.rn = 1;

CREATE OR REPLACE VIEW public.programacao_equipe_colaborador_ultima AS
 WITH ranked AS (
         SELECT e_1.id,
            row_number() OVER (PARTITION BY e_1.programacao_id, e_1.colaborador_id ORDER BY e_1.created_at DESC, e_1.id DESC) AS rn
           FROM programacao_equipe e_1
             JOIN programacao_dia_ultima pd ON pd.id = e_1.programacao_id
          WHERE e_1.confirmado IS TRUE
        )
 SELECT e.id,
    e.programacao_id,
    e.os_id,
    e.colaborador_id,
    e.nome_colaborador,
    e.score,
    e.score_contrato,
    e.score_distancia,
    e.score_auditoria,
    e.km_estimado,
    e.confirmado,
    e.ordem_rota,
    e.created_at,
    e.updated_at
   FROM programacao_equipe e
     JOIN ranked r ON r.id = e.id
  WHERE r.rn = 1;

CREATE OR REPLACE VIEW public.programacao_equipe_ultima AS
 SELECT e.id,
    e.programacao_id,
    e.os_id,
    e.colaborador_id,
    e.nome_colaborador,
    e.score,
    e.score_contrato,
    e.score_distancia,
    e.score_auditoria,
    e.km_estimado,
    e.confirmado,
    e.ordem_rota,
    e.created_at,
    e.updated_at
   FROM programacao_equipe e
     JOIN programacao_dia_ultima pd ON pd.id = e.programacao_id;

CREATE OR REPLACE VIEW public.programacao_estadia_ultima AS
 SELECT e.id,
    e.programacao_id,
    e.data_referencia,
    e.colaborador_id,
    e.nome_colaborador,
    e.tem_estadia,
    e.tipo_estadia,
    e.cidade,
    e.uf,
    e.diarias,
    e.checkin,
    e.checkout,
    e.observacao,
    e.created_at,
    e.updated_at,
    e.alojamento_id,
    e.alojamento_nome
   FROM programacao_estadia e
     JOIN programacao_dia_ultima pd ON pd.id = e.programacao_id;

CREATE OR REPLACE VIEW public.programacao_extras_ultima AS
 SELECT x.id,
    x.programacao_id,
    x.data_referencia,
    x.colaborador_id,
    x.nome_colaborador,
    x.tipo_despesa,
    x.descricao,
    x.valor,
    x.observacao,
    x.created_at,
    x.updated_at
   FROM programacao_extras x
     JOIN programacao_dia_ultima pd ON pd.id = x.programacao_id;

CREATE OR REPLACE VIEW public.v_leitura_supervisao AS
 WITH latest AS (
         SELECT max(patrimonios_historico_leituras.data_upload) AS max_dt
           FROM patrimonios_historico_leituras
        )
 SELECT phl.coordenacao,
    phl.supervisao,
    count(*) FILTER (WHERE phl.situacao = 'Ativo'::text) AS total_ativos,
    count(*) FILTER (WHERE phl.situacao = 'Ativo'::text AND phl.dias_sem_leitura <= 30) AS lidos_30d,
    round(100.0 * count(*) FILTER (WHERE phl.situacao = 'Ativo'::text AND phl.dias_sem_leitura <= 30)::numeric / NULLIF(count(*) FILTER (WHERE phl.situacao = 'Ativo'::text), 0)::numeric, 2) AS leitura_pct,
    latest.max_dt AS data_referencia
   FROM patrimonios_historico_leituras phl
     CROSS JOIN latest
  WHERE phl.data_upload = latest.max_dt
  GROUP BY phl.coordenacao, phl.supervisao, latest.max_dt;

CREATE OR REPLACE VIEW public.vw_alojamentos_ativos AS
 SELECT id,
    nome,
    COALESCE(cidade, ''::text) ||
        CASE
            WHEN uf IS NOT NULL AND uf <> ''::text THEN '/'::text || uf
            ELSE ''::text
        END AS cidade_uf,
    ativo
   FROM alojamentos a
  WHERE ativo = true
  ORDER BY nome;

CREATE OR REPLACE VIEW public.vw_botconversa_resumo AS
 SELECT ( SELECT count(*) AS count
           FROM botconversa_fila
          WHERE botconversa_fila.status = 'pendente'::text) AS pendentes,
    ( SELECT count(*) AS count
           FROM botconversa_fila
          WHERE botconversa_fila.status = 'enviado'::text) AS enviados,
    ( SELECT count(*) AS count
           FROM botconversa_fila
          WHERE botconversa_fila.status = 'erro'::text) AS erros,
    ( SELECT max(botconversa_logs.created_at) AS max
           FROM botconversa_logs) AS ultimo_envio,
    ( SELECT max(historico_colaboradores.data_referencia) AS max
           FROM historico_colaboradores) AS ultima_data_snapshot;

CREATE OR REPLACE VIEW public.vw_colaboradores_atuais AS
 SELECT id,
    NULL::uuid AS importacao_id,
    CURRENT_DATE AS data_referencia,
    regexp_replace(COALESCE(cpf, ''::text), '\D'::text, ''::text, 'g'::text) AS cpf,
    nome,
    situacao,
        CASE
            WHEN COALESCE(admissao, ''::text) ~ '^\d{4}-\d{2}-\d{2}'::text THEN "left"(admissao, 10)::date
            WHEN COALESCE(admissao, ''::text) ~ '^\d{2}/\d{2}/\d{4}$'::text THEN to_date(admissao, 'DD/MM/YYYY'::text)
            ELSE NULL::date
        END AS admissao,
        CASE
            WHEN COALESCE(desligamento, ''::text) ~ '^\d{4}-\d{2}-\d{2}'::text THEN "left"(desligamento, 10)::date
            WHEN COALESCE(desligamento, ''::text) ~ '^\d{2}/\d{2}/\d{4}$'::text THEN to_date(desligamento, 'DD/MM/YYYY'::text)
            ELSE NULL::date
        END AS desligamento,
        CASE
            WHEN COALESCE(salario, ''::text) ~ '^\s*-?\d+(?:[\.,]\d+)?\s*$'::text THEN replace(TRIM(BOTH FROM salario), ','::text, '.'::text)::numeric
            ELSE NULL::numeric
        END::numeric(14,2) AS salario,
    conta_bancaria_despesas AS conta_bancaria,
    empresa,
    coordenacao,
    supervisao,
    tipo,
    cep,
    estado,
    cidade,
    bairro,
    endereco,
    complemento,
        CASE
            WHEN COALESCE(data_nascimento, ''::text) ~ '^\d{4}-\d{2}-\d{2}'::text THEN "left"(data_nascimento, 10)::date
            WHEN COALESCE(data_nascimento, ''::text) ~ '^\d{2}/\d{2}/\d{4}$'::text THEN to_date(data_nascimento, 'DD/MM/YYYY'::text)
            ELSE NULL::date
        END AS data_nascimento,
    cargo,
    whatsapp,
    email_pessoal,
    email_empresa,
    situacao = 'Ativo'::text AS ativo,
    COALESCE(updated_at, created_at, now()) AS created_at
   FROM colaboradores c
  ORDER BY (
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM bonus_caixa_lancamentos l
              WHERE l.nome_normalizado = bonus_normalizar_nome(c.nome) AND (l.status = ANY (ARRAY['PENDENTE'::text, 'PROCESSANDO'::text])))) THEN 0
            ELSE 1
        END), nome;

CREATE OR REPLACE VIEW public.vw_colaboradores_historico_ultimo AS
 SELECT id,
    importacao_id,
    data_referencia,
    cpf,
    nome,
    nome_normalizado,
    chave_colaborador,
    situacao,
    ativo,
    admissao,
    desligamento,
    salario,
    conta_bancaria,
    empresa,
    coordenacao,
    supervisao,
    tipo,
    cep,
    estado,
    cidade,
    bairro,
    endereco,
    complemento,
    data_nascimento,
    cargo,
    whatsapp,
    email_pessoal,
    email_empresa,
    payload,
    created_at,
    updated_at
   FROM colaboradores_historico h
  WHERE data_referencia = (( SELECT max(h2.data_referencia) AS max
           FROM colaboradores_historico h2));

CREATE OR REPLACE VIEW public.vw_conferencia_uber_corridas AS
 SELECT u.id,
    u.data_hora_transacao_utc,
    u.hora_solicitacao_utc,
    u.data_solicitacao_local,
    u.hora_solicitacao_local,
    u.data_chegada_local,
    u.hora_chegada_local,
    u.nome,
    COALESCE(cb.nome, u.nome) AS nome_colaborador,
    u.coord AS coordenacao,
    u.supervisao,
    u.grupo,
    u.servico,
    u.programa,
    u.cidade,
    u.pais,
    u.distancia_mi,
    round(COALESCE(u.distancia_mi, 0::numeric) * 1.60934, 2) AS distancia_km,
    u.duracao_min,
    u.endereco_partida,
    u.endereco_destino,
    u.detalhamento_despesa,
    u.preco_liquido AS valor,
    u.partida_latitude,
    u.partida_longitude,
    u.destino_latitude,
    u.destino_longitude,
    cb.id AS colaborador_base_id,
    cb.cidade_base,
    cb.uf_base,
    cb.endereco_base,
    cb.latitude AS casa_latitude,
    cb.longitude AS casa_longitude,
    conf_distancia_km(u.partida_latitude, u.partida_longitude, cb.latitude, cb.longitude) AS distancia_partida_casa_km,
    conf_distancia_km(u.destino_latitude, u.destino_longitude, cb.latitude, cb.longitude) AS distancia_destino_casa_km,
    pe_partida.nome_local AS ponto_partida_mais_proximo,
    pe_destino.nome_local AS ponto_destino_mais_proximo,
    pe_partida.distancia_km AS distancia_partida_embarque_km,
    pe_destino.distancia_km AS distancia_destino_embarque_km,
    LEAST(COALESCE(conf_distancia_km(u.partida_latitude, u.partida_longitude, cb.latitude, cb.longitude), 999999::numeric), COALESCE(conf_distancia_km(u.destino_latitude, u.destino_longitude, cb.latitude, cb.longitude), 999999::numeric)) AS menor_distancia_casa_km,
    LEAST(COALESCE(pe_partida.distancia_km, 999999::numeric), COALESCE(pe_destino.distancia_km, 999999::numeric)) AS menor_distancia_embarque_km,
    COALESCE(u.classificacao_manual,
        CASE
            WHEN conf_norm_txt(u.detalhamento_despesa) ~~ '%PESSOAL%'::text THEN 'ATENCAO'::text
            WHEN u.partida_latitude IS NULL OR u.partida_longitude IS NULL OR u.destino_latitude IS NULL OR u.destino_longitude IS NULL THEN 'ATENCAO'::text
            WHEN cb.id IS NULL THEN 'ATENCAO'::text
            WHEN cb.latitude IS NULL OR cb.longitude IS NULL THEN 'ATENCAO'::text
            WHEN LEAST(COALESCE(conf_distancia_km(u.partida_latitude, u.partida_longitude, cb.latitude, cb.longitude), 999999::numeric), COALESCE(conf_distancia_km(u.destino_latitude, u.destino_longitude, cb.latitude, cb.longitude), 999999::numeric)) <= 2::numeric AND LEAST(COALESCE(pe_partida.distancia_km, 999999::numeric), COALESCE(pe_destino.distancia_km, 999999::numeric)) <= 2::numeric THEN 'VALIDADA'::text
            ELSE 'CAIXA_COLABORADOR'::text
        END) AS classificacao,
    COALESCE(u.observacao_validacao,
        CASE
            WHEN u.classificacao_manual IS NOT NULL THEN 'Classificação manual informada pelo usuário.'::text
            WHEN conf_norm_txt(u.detalhamento_despesa) ~~ '%PESSOAL%'::text THEN 'Atenção: observação/detalhamento contém "Pessoal". Conferir antes de validar a corrida.'::text
            WHEN u.partida_latitude IS NULL OR u.partida_longitude IS NULL OR u.destino_latitude IS NULL OR u.destino_longitude IS NULL THEN 'Endereço ainda não convertido em GPS. Clique em GPS ou Converter GPS pendentes para validar o raio de 2 km.'::text
            WHEN cb.id IS NULL THEN 'Atenção: colaborador não localizado na base operacional pelo nome.'::text
            WHEN cb.latitude IS NULL OR cb.longitude IS NULL THEN 'Atenção: casa do colaborador sem latitude/longitude cadastrada.'::text
            WHEN LEAST(COALESCE(conf_distancia_km(u.partida_latitude, u.partida_longitude, cb.latitude, cb.longitude), 999999::numeric), COALESCE(conf_distancia_km(u.destino_latitude, u.destino_longitude, cb.latitude, cb.longitude), 999999::numeric)) <= 2::numeric AND LEAST(COALESCE(pe_partida.distancia_km, 999999::numeric), COALESCE(pe_destino.distancia_km, 999999::numeric)) <= 2::numeric THEN 'Corrida validada: origem/destino dentro do raio de 2 km da casa do colaborador e de um ponto de embarque.'::text
            ELSE 'Fora da regra: origem/destino não cruza casa do colaborador e ponto de embarque em até 2 km. Conferir e lançar no caixa do colaborador se aplicável.'::text
        END) AS motivo_validacao,
    u.status_validacao,
    u.classificacao_manual,
    u.validado_em,
    u.created_at
   FROM conferencia_uber_corridas u
     LEFT JOIN LATERAL ( SELECT c.id,
            c.nome,
            c.cidade_base,
            c.uf_base,
            c.endereco_base,
            c.latitude,
            c.longitude
           FROM operacional_colaborador_base c
          WHERE c.ativo IS TRUE AND (conf_norm_txt(c.nome) = conf_norm_txt(u.nome) OR conf_norm_txt(c.nome_chave) = conf_norm_txt(u.nome))
          ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC
         LIMIT 1) cb ON true
     LEFT JOIN LATERAL ( SELECT p.nome_local,
            round((st_distance(st_setsrid(st_makepoint(p.longitude::double precision, p.latitude::double precision), 4326)::geography, st_setsrid(st_makepoint(u.partida_longitude::double precision, u.partida_latitude::double precision), 4326)::geography) / 1000.0::double precision)::numeric, 6) AS distancia_km
           FROM operacional_pontos_embarque p
          WHERE p.ativo IS TRUE AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL AND u.partida_latitude IS NOT NULL AND u.partida_longitude IS NOT NULL
          ORDER BY (st_setsrid(st_makepoint(p.longitude::double precision, p.latitude::double precision), 4326)::geography <-> st_setsrid(st_makepoint(u.partida_longitude::double precision, u.partida_latitude::double precision), 4326)::geography)
         LIMIT 1) pe_partida ON true
     LEFT JOIN LATERAL ( SELECT p.nome_local,
            round((st_distance(st_setsrid(st_makepoint(p.longitude::double precision, p.latitude::double precision), 4326)::geography, st_setsrid(st_makepoint(u.destino_longitude::double precision, u.destino_latitude::double precision), 4326)::geography) / 1000.0::double precision)::numeric, 6) AS distancia_km
           FROM operacional_pontos_embarque p
          WHERE p.ativo IS TRUE AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL AND u.destino_latitude IS NOT NULL AND u.destino_longitude IS NOT NULL
          ORDER BY (st_setsrid(st_makepoint(p.longitude::double precision, p.latitude::double precision), 4326)::geography <-> st_setsrid(st_makepoint(u.destino_longitude::double precision, u.destino_latitude::double precision), 4326)::geography)
         LIMIT 1) pe_destino ON true;

CREATE OR REPLACE VIEW public.vw_contexto_usuario AS
 SELECT u.id AS usuario_id,
    u.auth_user_id,
    u.nome AS usuario_nome,
    u.email AS usuario_email,
    u.telefone,
    u.status AS usuario_status,
    u.empresa,
    u.coordenacao,
    u.supervisao,
    u.colaborador_id,
    p.id AS perfil_id,
    p.codigo AS perfil_codigo,
    p.nome AS perfil_nome,
    m.id AS modulo_id,
    m.codigo AS modulo_codigo,
    m.nome AS modulo_nome,
    m.categoria AS modulo_categoria,
    m.icone AS modulo_icone,
    m.rota AS modulo_rota,
    m.ordem AS modulo_ordem,
    pm.pode_ver,
    pm.pode_criar,
    pm.pode_editar,
    pm.pode_excluir,
    pm.pode_aprovar
   FROM app_usuarios u
     LEFT JOIN app_perfis p ON p.id = u.perfil_id
     LEFT JOIN app_perfil_modulo pm ON pm.perfil_id = p.id
     LEFT JOIN app_modulos m ON m.id = pm.modulo_id
  WHERE COALESCE(u.status, 'ativo'::text) = 'ativo'::text AND COALESCE(p.ativo, true) = true AND COALESCE(m.ativo, true) = true AND COALESCE(pm.pode_ver, false) = true;

CREATE OR REPLACE VIEW public.vw_financeiro_alimentacao_pendentes AS
 SELECT id,
    data_ref,
    colaborador_chave,
    codigo_colaborador,
    cpf,
    colaborador,
    coordenacao,
    supervisao,
    hora_identificada,
    local_nome,
    local_cidade,
    local_uf,
    distancia_m,
    raio_m,
    pontos_na_janela,
    pontos_dentro_raio,
    valor,
    status,
    origem,
    ultima_verificacao_em,
    created_at,
    updated_at
   FROM financeiro_alimentacao_colaboradores
  WHERE ativo = true AND status = 'PENDENTE'::text;

CREATE OR REPLACE VIEW public.vw_metas_producao_estado AS
 SELECT ano,
    mes,
    estado,
    sum(meta_tons)::numeric(14,2) AS meta_tons,
    sum(produzido_tons)::numeric(14,2) AS produzido_tons,
    sum(restante_tons)::numeric(14,2) AS restante_tons,
        CASE
            WHEN sum(meta_tons) > 0::numeric THEN round(sum(produzido_tons) / sum(meta_tons) * 100::numeric, 2)
            ELSE 0::numeric
        END::numeric(14,2) AS percentual_atingido
   FROM vw_metas_producao_regional
  GROUP BY ano, mes, estado;

CREATE OR REPLACE VIEW public.vw_metas_producao_mensal AS
 SELECT ano,
    mes,
    sum(meta_tons)::numeric(14,2) AS meta_total_tons,
    sum(produzido_tons)::numeric(14,2) AS produzido_total_tons,
    sum(restante_tons)::numeric(14,2) AS restante_total_tons,
        CASE
            WHEN sum(meta_tons) > 0::numeric THEN round(sum(produzido_tons) / sum(meta_tons) * 100::numeric, 2)
            ELSE 0::numeric
        END::numeric(14,2) AS percentual_atingido
   FROM vw_metas_producao_regional
  GROUP BY ano, mes;

CREATE OR REPLACE VIEW public.vw_metas_producao_regional AS
 SELECT m.ano,
    m.mes,
    m.estado,
    m.regional,
    m.meta_tons,
    COALESCE(sum(p.toneladas), 0::numeric)::numeric(14,2) AS produzido_tons,
    GREATEST(m.meta_tons - COALESCE(sum(p.toneladas), 0::numeric), 0::numeric)::numeric(14,2) AS restante_tons,
        CASE
            WHEN m.meta_tons > 0::numeric THEN round(COALESCE(sum(p.toneladas), 0::numeric) / m.meta_tons * 100::numeric, 2)
            ELSE 0::numeric
        END::numeric(14,2) AS percentual_atingido
   FROM metas_producao m
     LEFT JOIN relatorio_resultado_diario p ON upper(TRIM(BOTH FROM p.coordenacao)) = upper(TRIM(BOTH FROM m.regional)) AND EXTRACT(year FROM p.data)::integer = m.ano AND EXTRACT(month FROM p.data)::integer = m.mes
  WHERE m.ativo = true
  GROUP BY m.ano, m.mes, m.estado, m.regional, m.meta_tons;

CREATE OR REPLACE VIEW public.vw_monitoramento_sync AS
 SELECT agente_id AS agente,
    max(created_at) AS ultima_criacao,
    max(finalizado_em) AS ultima_finalizacao,
    (array_agg(status ORDER BY created_at DESC))[1] AS ultimo_status,
    (array_agg(erro ORDER BY created_at DESC))[1] AS ultimo_erro,
    avg(EXTRACT(epoch FROM finalizado_em - iniciado_em)) FILTER (WHERE finalizado_em IS NOT NULL) AS duracao_media_segundos
   FROM grm_sync_jobs j
  GROUP BY agente_id;

CREATE OR REPLACE VIEW public.vw_patrimonios_atual AS
 SELECT ps.id,
    ps.importacao_id,
    pi.nome_arquivo,
    pi.created_at AS importado_em,
    ps.patrimonio_codigo,
    ps.coordenacao,
    ps.supervisao,
    ps.funcionario,
    ps.identificacao,
    ps.categoria,
    ps.marca,
    ps.modelo,
    ps.data_aquisicao,
    ps.data_registro,
    ps.situacao,
    ps.ultima_leitura,
    ps.dias_sem_leitura,
    ps.created_at,
    ps.updated_at
   FROM patrimonios_snapshot ps
     LEFT JOIN patrimonios_importacoes pi ON pi.id = ps.importacao_id;

CREATE OR REPLACE VIEW public.vw_patrimonios_responsavel_atual AS
 SELECT DISTINCT ON (patrimonio_id) patrimonio_id,
    identificacao,
    categoria,
    responsavel_novo AS responsavel_atual,
    regional,
    supervisao,
    created_at AS desde
   FROM patrimonios_movimentacoes
  WHERE tipo = ANY (ARRAY['entrega'::text, 'transferencia'::text])
  ORDER BY patrimonio_id, created_at DESC;

CREATE OR REPLACE VIEW public.vw_relatorios_importacoes_ativas AS
 SELECT id,
    tipo_relatorio,
    titulo_relatorio,
    arquivo_nome_original,
    arquivo_nome_storage,
    storage_bucket,
    storage_path,
    tamanho_bytes,
    mime_type,
    status,
    observacoes,
    importado_por,
    importado_por_nome,
    created_at,
    updated_at,
    nome_arquivo,
    tipo,
    path,
    url,
    usuario_id,
    usuario_nome,
    usuario_email,
    periodo_inicio,
    periodo_fim,
    modo_importacao,
    substitui_importacoes,
    total_periodo_registros,
    fingerprint
   FROM relatorios_importacoes
  WHERE COALESCE(status, ''::text) <> 'substituido'::text;

CREATE OR REPLACE VIEW public.vw_usuario_modulos AS
 SELECT u.id AS usuario_id,
    u.nome,
    u.email,
    u.setor,
    m.id AS modulo_id,
    m.codigo,
    m.nome AS modulo_nome
   FROM app_usuarios u
     LEFT JOIN app_usuario_modulos um ON um.usuario_id = u.id
     LEFT JOIN app_modulos m ON m.id = um.modulo_id;

-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE TRIGGER trg_alojamentos_updated_at BEFORE UPDATE ON public.alojamentos FOR EACH ROW EXECUTE FUNCTION set_current_timestamp_updated_at();

CREATE TRIGGER trg_app_modulos_updated_at BEFORE UPDATE ON public.app_modulos FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_app_perfil_modulo_updated_at BEFORE UPDATE ON public.app_perfil_modulo FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_app_perfis_updated_at BEFORE UPDATE ON public.app_perfis FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_app_usuario_modulos_updated_at BEFORE UPDATE ON public.app_usuario_modulos FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_app_usuarios_sync_profile AFTER INSERT OR UPDATE ON public.app_usuarios FOR EACH ROW EXECUTE FUNCTION app_usuarios_sync_profile();

CREATE TRIGGER trg_app_usuarios_updated_at BEFORE UPDATE ON public.app_usuarios FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_bonus_caixa_validar_processamento_atual BEFORE UPDATE OF status ON public.bonus_caixa_lancamentos FOR EACH ROW WHEN (((new.status = 'PROCESSANDO'::text) AND (old.status IS DISTINCT FROM 'PROCESSANDO'::text))) EXECUTE FUNCTION bonus_caixa_validar_processamento_atual();

CREATE TRIGGER trg_bonus_bloquear_mutacao_snapshot_fechado BEFORE INSERT OR DELETE OR UPDATE ON public.bonus_producao_fechada FOR EACH ROW EXECUTE FUNCTION bonus_bloquear_mutacao_snapshot_fechado();

CREATE TRIGGER trg_botconversa_config_updated_at BEFORE UPDATE ON public.botconversa_config FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_botconversa_contatos_updated_at BEFORE UPDATE ON public.botconversa_contatos FOR EACH ROW EXECUTE FUNCTION set_updated_at_generic();

CREATE TRIGGER trg_botconversa_fluxos_updated_at BEFORE UPDATE ON public.botconversa_fluxos FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_colaboradores_preserva_conta_bancaria BEFORE UPDATE ON public.colaboradores FOR EACH ROW EXECUTE FUNCTION colaboradores_preserva_conta_bancaria();

CREATE TRIGGER trg_colaboradores_updated_at BEFORE UPDATE ON public.colaboradores FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_colaboradores_historico_updated_at BEFORE UPDATE ON public.colaboradores_historico FOR EACH ROW EXECUTE FUNCTION set_updated_at_colaboradores_historico();

CREATE TRIGGER trg_uber_fila_remocao_status_colaborador AFTER INSERT ON public.colaboradores_status_historico FOR EACH ROW EXECUTE FUNCTION uber_fila_remocao_por_status_colaborador();

CREATE TRIGGER tg_propostas_touch BEFORE UPDATE ON public.comercial_propostas FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE TRIGGER trg_compras_cotacoes_updated_at BEFORE UPDATE ON public.compras_cotacoes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_compras_estoque_materiais_updated_at BEFORE UPDATE ON public.compras_estoque_materiais FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER tg_cgrupos_touch BEFORE UPDATE ON public.compras_grupos FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE TRIGGER compras_itens_status_sync AFTER INSERT OR UPDATE OF status ON public.compras_itens FOR EACH ROW WHEN ((new.solicitacao_id IS NOT NULL)) EXECUTE FUNCTION sync_compras_solicitacao_status();

CREATE TRIGGER trg_auditoria AFTER INSERT OR DELETE OR UPDATE ON public.compras_itens FOR EACH ROW EXECUTE FUNCTION fn_registrar_auditoria('notas-fiscais');

CREATE TRIGGER trg_compras_itens_updated_at BEFORE UPDATE ON public.compras_itens FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_compras_patrimonios_updated_at BEFORE UPDATE ON public.compras_patrimonios_cadastro FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_compras_solicitacoes_updated_at BEFORE UPDATE ON public.compras_solicitacoes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER tg_correios_touch BEFORE UPDATE ON public.correios_envios FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE TRIGGER trg_diretoria_desenvolvimento_updated_at BEFORE UPDATE ON public.diretoria_desenvolvimento FOR EACH ROW EXECUTE FUNCTION diretoria_desenvolvimento_set_updated_at();

CREATE TRIGGER equipe_administracao_usuarios_touch BEFORE UPDATE ON public.equipe_administracao_usuarios FOR EACH ROW EXECUTE FUNCTION equipe_estrutura_touch();

CREATE TRIGGER equipe_gestores_regionais_touch BEFORE UPDATE ON public.equipe_gestores_regionais FOR EACH ROW EXECUTE FUNCTION equipe_estrutura_touch();

CREATE TRIGGER trg_auditoria AFTER INSERT OR DELETE OR UPDATE ON public.financeiro_pagamentos FOR EACH ROW EXECUTE FUNCTION fn_registrar_auditoria('financeiro');

CREATE TRIGGER trg_financeiro_pagamentos_alerta_hotel_nf BEFORE INSERT OR UPDATE OF origem_setor, origem_tabela, origem_id, descricao, observacoes ON public.financeiro_pagamentos FOR EACH ROW EXECUTE FUNCTION hospedagem_aplicar_alerta_nf_financeiro();

CREATE TRIGGER trg_financeiro_pagamentos_updated_at BEFORE UPDATE ON public.financeiro_pagamentos FOR EACH ROW EXECUTE FUNCTION set_financeiro_pagamentos_updated_at();

CREATE TRIGGER trg_frota_solicitacoes_updated_at BEFORE UPDATE ON public.frota_solicitacoes FOR EACH ROW EXECUTE FUNCTION set_current_timestamp_updated_at();

CREATE TRIGGER trg_frotas_checklists_updated_at BEFORE UPDATE ON public.frotas_checklists FOR EACH ROW EXECUTE FUNCTION set_updated_at_generic();

CREATE TRIGGER trg_frotas_excesso_touch BEFORE UPDATE ON public.frotas_excesso_velocidade FOR EACH ROW EXECUTE FUNCTION frotas_touch_updated_at();

CREATE TRIGGER tg_gpsocc_touch BEFORE UPDATE ON public.frotas_gps_ocorrencias FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE TRIGGER trg_frotas_manutencoes_updated_at BEFORE UPDATE ON public.frotas_manutencoes FOR EACH ROW EXECUTE FUNCTION set_updated_at_generic();

CREATE TRIGGER trg_frotas_multas_updated_at BEFORE UPDATE ON public.frotas_multas FOR EACH ROW EXECUTE FUNCTION set_updated_at_frotas_multas();

CREATE TRIGGER trg_proteger_atualizacoes_manuais_frotas_multas BEFORE UPDATE ON public.frotas_multas FOR EACH ROW EXECUTE FUNCTION proteger_atualizacoes_manuais_frotas_multas();

CREATE TRIGGER trg_frotas_rastreadores_updated BEFORE UPDATE ON public.frotas_rastreadores FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_frotas_rastreadores_removidos_updated BEFORE UPDATE ON public.frotas_rastreadores_removidos FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_frotas_rotas_updated BEFORE UPDATE ON public.frotas_rotas FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_frotas_trocas_oleo_updated_at BEFORE UPDATE ON public.frotas_trocas_oleo FOR EACH ROW EXECUTE FUNCTION set_updated_at_generic();

CREATE TRIGGER trg_enqueue_bfleet_condutor_update AFTER INSERT OR UPDATE OF motorista_atual ON public.frotas_veiculos FOR EACH ROW EXECUTE FUNCTION private.enqueue_bfleet_condutor_update();

CREATE TRIGGER trg_frotas_veiculos_motorista_historico AFTER UPDATE ON public.frotas_veiculos FOR EACH ROW EXECUTE FUNCTION registrar_troca_motorista_veiculo();

CREATE TRIGGER trg_proteger_atualizacoes_manuais_frotas_veiculos BEFORE UPDATE ON public.frotas_veiculos FOR EACH ROW EXECUTE FUNCTION proteger_atualizacoes_manuais_frotas_veiculos();

CREATE TRIGGER trg_sincronizar_alias_bfleet_vehicle_id BEFORE INSERT OR UPDATE OF bfleet_vehicle_id ON public.frotas_veiculos FOR EACH ROW EXECUTE FUNCTION sincronizar_alias_bfleet_vehicle_id();

CREATE TRIGGER trg_google_contacts_sync_jobs_updated_at BEFORE UPDATE ON public.google_contacts_sync_jobs FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_grm_cargas_importacoes_updated_at BEFORE UPDATE ON public.grm_cargas_importacoes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER grm_despesas_estado_touch BEFORE UPDATE ON public.grm_despesas_estado_colaborador FOR EACH ROW EXECUTE FUNCTION grm_despesas_touch_updated_at();

CREATE TRIGGER trg_grm_despesas_estado_guard_programacao BEFORE INSERT OR UPDATE OF regras_desejadas, versao_desejada_id, data_referencia, colaborador_id, nome, deve_liberar ON public.grm_despesas_estado_colaborador FOR EACH ROW EXECUTE FUNCTION grm_despesas_estado_guard_programacao();

CREATE TRIGGER grm_despesas_fila_touch BEFORE UPDATE ON public.grm_despesas_fila FOR EACH ROW EXECUTE FUNCTION grm_despesas_touch_updated_at();

CREATE TRIGGER trg_grm_despesas_fila_guard_programacao BEFORE INSERT OR UPDATE OF regras, versao_id, data_referencia, colaborador_id, nome, acao ON public.grm_despesas_fila FOR EACH ROW EXECUTE FUNCTION grm_despesas_fila_guard_programacao();

CREATE TRIGGER grm_despesas_tipos_config_touch BEFORE UPDATE ON public.grm_despesas_tipos_config FOR EACH ROW EXECUTE FUNCTION grm_despesas_touch_updated_at();

CREATE TRIGGER trg_grm_sync_cancel_pending_on_disable AFTER UPDATE OF enabled ON public.grm_sync_agent_settings FOR EACH ROW EXECUTE FUNCTION grm_sync_cancel_pending_on_disable();

CREATE TRIGGER trg_grm_sync_assign_lane BEFORE INSERT OR UPDATE OF agente_id, lane ON public.grm_sync_jobs FOR EACH ROW EXECUTE FUNCTION grm_sync_assign_lane();

CREATE TRIGGER trg_grm_sync_guard_disabled_agent BEFORE INSERT OR UPDATE OF agente_id ON public.grm_sync_jobs FOR EACH ROW EXECUTE FUNCTION grm_sync_guard_disabled_agent();

CREATE TRIGGER trg_grm_sync_jobs_updated_at BEFORE UPDATE ON public.grm_sync_jobs FOR EACH ROW EXECUTE FUNCTION set_grm_sync_jobs_updated_at();

CREATE TRIGGER trg_hospedagem_alojamentos_updated_at BEFORE UPDATE ON public.hospedagem_alojamentos FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_hosp_cotacoes_updated_at BEFORE UPDATE ON public.hospedagem_cotacoes FOR EACH ROW EXECUTE FUNCTION hospedagem_touch_updated_at();

CREATE TRIGGER trg_hosp_extras_updated_at BEFORE UPDATE ON public.hospedagem_custos_extras FOR EACH ROW EXECUTE FUNCTION hospedagem_touch_updated_at();

CREATE TRIGGER trg_hosp_docs_updated_at BEFORE UPDATE ON public.hospedagem_documentos FOR EACH ROW EXECUTE FUNCTION hospedagem_touch_updated_at();

CREATE TRIGGER trg_hospedagem_hotel_sync_alerta_nf AFTER UPDATE OF emite_nota_fiscal ON public.hospedagem_hoteis FOR EACH ROW WHEN ((old.emite_nota_fiscal IS DISTINCT FROM new.emite_nota_fiscal)) EXECUTE FUNCTION hospedagem_sincronizar_alerta_nf_existente();

CREATE TRIGGER trg_hosp_reserva_quartos_updated_at BEFORE UPDATE ON public.hospedagem_reserva_quartos FOR EACH ROW EXECUTE FUNCTION hospedagem_touch_updated_at();

CREATE TRIGGER trg_hospedagem_arquivar_reserva_cancelada AFTER UPDATE OF status_hospedagem ON public.hospedagem_reservas FOR EACH ROW EXECUTE FUNCTION hospedagem_arquivar_reserva_cancelada();

CREATE TRIGGER trg_hospedagem_preencher_identidade_colaborador BEFORE INSERT OR UPDATE OF nome_colaborador, colaborador_id, cpf ON public.hospedagem_solicitacao_colaboradores FOR EACH ROW EXECUTE FUNCTION hospedagem_preencher_identidade_colaborador();

CREATE TRIGGER trg_hospedagem_sync_supervisao_colaborador BEFORE INSERT OR UPDATE OF colaborador_id, supervisao ON public.hospedagem_solicitacao_colaboradores FOR EACH ROW EXECUTE FUNCTION hospedagem_sync_supervisao_colaborador();

CREATE TRIGGER trg_hospedagem_sync_supervisao_solicitacao AFTER INSERT OR DELETE OR UPDATE OF solicitacao_id, colaborador_id, supervisao ON public.hospedagem_solicitacao_colaboradores FOR EACH ROW EXECUTE FUNCTION hospedagem_sync_supervisao_solicitacao_trigger();

CREATE TRIGGER trg_hospedagem_gerar_codigo BEFORE INSERT ON public.hospedagem_solicitacoes FOR EACH ROW EXECUTE FUNCTION hospedagem_gerar_codigo_solicitacao();

CREATE TRIGGER trg_hospedagem_sincronizar_status_legado BEFORE INSERT OR UPDATE OF status_solicitacao ON public.hospedagem_solicitacoes FOR EACH ROW EXECUTE FUNCTION hospedagem_sincronizar_status_legado();

CREATE TRIGGER trg_hospedagem_stamp_cancelamento BEFORE UPDATE OF status_solicitacao ON public.hospedagem_solicitacoes FOR EACH ROW EXECUTE FUNCTION hospedagem_stamp_cancelamento();

CREATE TRIGGER trg_set_updated_at_logistica_abertura_os BEFORE UPDATE ON public.logistica_abertura_os FOR EACH ROW EXECUTE FUNCTION set_updated_at_logistica_abertura_os();

CREATE TRIGGER tg_log_ajuste_touch BEFORE UPDATE ON public.logistica_ajustes_saldo FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE TRIGGER trg_logistica_cargas_irreg_updated_at BEFORE UPDATE ON public.logistica_cargas_irregularidades FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER tg_log_class_touch BEFORE UPDATE ON public.logistica_classificadores_monitor FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE TRIGGER tg_log_conf_touch BEFORE UPDATE ON public.logistica_conferencias FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE TRIGGER trg_set_updated_at_logistica_fob BEFORE UPDATE ON public.logistica_fob FOR EACH ROW EXECUTE FUNCTION set_updated_at_logistica_fob();

CREATE TRIGGER tg_nf_ocr_touch BEFORE UPDATE ON public.nf_ocr_fila FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE TRIGGER trg_operacional_auditoria_updated_at BEFORE INSERT OR UPDATE ON public.operacional_auditoria_colaborador FOR EACH ROW EXECUTE FUNCTION operacional_auditoria_set_updated_at();

CREATE TRIGGER trg_operacional_colaborador_base_updated_at BEFORE INSERT OR UPDATE ON public.operacional_colaborador_base FOR EACH ROW EXECUTE FUNCTION operacional_colaborador_base_set_updated_at();

CREATE TRIGGER trg_operacional_laudos_suspeita BEFORE INSERT ON public.operacional_laudos FOR EACH ROW EXECUTE FUNCTION operacional_laudos_calcular_suspeita();

CREATE TRIGGER operacional_os_limpar_vinculos_sem_atendimento_trg AFTER UPDATE OF status_gestor ON public.operacional_os FOR EACH ROW EXECUTE FUNCTION operacional_os_limpar_vinculos_sem_atendimento();

CREATE TRIGGER operacional_os_preservar_status_programacao_trg BEFORE UPDATE OF status_gestor ON public.operacional_os FOR EACH ROW EXECUTE FUNCTION operacional_os_preservar_status_programacao();

CREATE TRIGGER trg_operacional_os_resolver_ponto BEFORE INSERT OR UPDATE OF embarque, cliente, supervisao ON public.operacional_os FOR EACH ROW EXECUTE FUNCTION trg_operacional_os_resolver_ponto();

CREATE TRIGGER trg_operacional_pontos_updated_at BEFORE UPDATE ON public.operacional_pontos_embarque FOR EACH ROW EXECUTE FUNCTION operacional_pontos_set_updated_at();

CREATE TRIGGER trg_patrimonios_importacoes_updated_at BEFORE UPDATE ON public.patrimonios_importacoes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_patrimonios_snapshot_updated_at BEFORE UPDATE ON public.patrimonios_snapshot FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_normalizar_producao_snapshot_tons BEFORE INSERT OR UPDATE OF tons, cargas ON public.producao_snapshot FOR EACH ROW EXECUTE FUNCTION normalizar_producao_snapshot_tons();

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION touch_profile_updated_at();

CREATE TRIGGER trg_programacao_alimentacao_compartilhar_dia BEFORE INSERT OR UPDATE ON public.programacao_alimentacao FOR EACH ROW EXECUTE FUNCTION programacao_despesa_compartilhar_por_dia();

CREATE TRIGGER trg_programacao_colaborador_updated_at BEFORE UPDATE ON public.programacao_colaborador FOR EACH ROW EXECUTE FUNCTION set_current_timestamp_updated_at();

CREATE TRIGGER trg_programacao_deslocamento_compartilhar_dia BEFORE INSERT OR UPDATE ON public.programacao_deslocamento FOR EACH ROW EXECUTE FUNCTION programacao_despesa_compartilhar_por_dia();

CREATE TRIGGER programacao_dia_sincroniza_os_atender_trg AFTER UPDATE OF data_referencia ON public.programacao_dia FOR EACH ROW EXECUTE FUNCTION programacao_dia_sincroniza_os_atender();

CREATE TRIGGER trg_agenda_distribuicao_os_novo_dia AFTER INSERT ON public.programacao_dia FOR EACH ROW EXECUTE FUNCTION agenda_distribuicao_os_novo_dia();

CREATE TRIGGER programacao_equipe_marca_os_atender_trg AFTER INSERT OR UPDATE OF confirmado, os_id ON public.programacao_equipe FOR EACH ROW EXECUTE FUNCTION programacao_equipe_marca_os_atender();

CREATE TRIGGER programacao_equipe_validar_regional_trg BEFORE INSERT OR UPDATE OF programacao_id, colaborador_id, nome_colaborador, confirmado, os_id ON public.programacao_equipe FOR EACH ROW EXECUTE FUNCTION programacao_equipe_validar_regional();

CREATE TRIGGER trg_programacao_equipe_updated BEFORE UPDATE ON public.programacao_equipe FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_programacao_estadia_compartilhar_dia BEFORE INSERT OR UPDATE ON public.programacao_estadia FOR EACH ROW EXECUTE FUNCTION programacao_despesa_compartilhar_por_dia();

CREATE TRIGGER trg_programacao_itens_updated_at BEFORE UPDATE ON public.programacao_itens FOR EACH ROW EXECUTE FUNCTION touch_programacao_itens_updated_at();

CREATE TRIGGER trg_programacao_usuario_supervisoes_touch BEFORE UPDATE ON public.programacao_usuario_supervisoes FOR EACH ROW EXECUTE FUNCTION programacao_usuario_supervisoes_touch();

CREATE TRIGGER trg_propostas_comerciais_updated_at BEFORE UPDATE ON public.propostas_comerciais FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_relatorios_importacoes_updated_at BEFORE UPDATE ON public.relatorios_importacoes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER tg_rhadm_touch BEFORE UPDATE ON public.rh_admissao_checklist FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE TRIGGER tg_rhcontr_touch BEFORE UPDATE ON public.rh_contratos FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE TRIGGER tg_rhepi_touch BEFORE UPDATE ON public.rh_epi FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE TRIGGER rh_plantao_escalas_validar_editor BEFORE INSERT OR DELETE OR UPDATE ON public.rh_plantao_escalas FOR EACH ROW EXECUTE FUNCTION rh_plantao_validar_editor_setor();

CREATE TRIGGER rh_plantao_modelos_validar_editor BEFORE INSERT OR DELETE OR UPDATE ON public.rh_plantao_modelos FOR EACH ROW EXECUTE FUNCTION rh_plantao_validar_editor_setor();

CREATE TRIGGER tg_termos_touch BEFORE UPDATE ON public.termos_documentos FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ============================================================
-- CRON JOBS (pg_cron) — schedule() reconstructed from cron.job
-- ============================================================

-- job 2 (active=t)
select cron.schedule('limpar-btg-sb-diario', '59 2 * * *', 'DELETE FROM public.logistica_btg_solicitacoes WHERE tipo_solicitacao = ''SB''');

-- job 4 (active=t)
select cron.schedule('botconversa-aniversario-diario', '7 11 * * *', '
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = ''project_url'' limit 1) || ''/functions/v1/botconversa-aniversario'',
    headers := jsonb_build_object(
      ''Content-Type'', ''application/json'',
      ''Authorization'', ''Bearer '' || (select decrypted_secret from vault.decrypted_secrets where name = ''service_role_key'' limit 1)
    ),
    body := jsonb_build_object(''action'',''run_now''),
    timeout_milliseconds := 300000
  ) as request_id;
');

-- job 5 (active=t)
select cron.schedule('refresh-colaborador-cruzamento-30min', '*/30 * * * *', 'select public.refresh_colaborador_cruzamento()');

-- job 6 (active=t)
select cron.schedule('geocode-colaborador-base-2min', '*/2 * * * *', '
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = ''project_url'' limit 1) || ''/functions/v1/geocode-colaborador-base'',
    headers := jsonb_build_object(
      ''Content-Type'', ''application/json'',
      ''Authorization'', ''Bearer '' || (select decrypted_secret from vault.decrypted_secrets where name = ''service_role_key'' limit 1)
    ),
    body := jsonb_build_object(''limite'', 25),
    timeout_milliseconds := 60000
  ) as request_id;
');

-- job 7 (active=t)
select cron.schedule('geocode-operacional-os-10min', '*/10 * * * *', '
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = ''project_url'' limit 1) || ''/functions/v1/geocode-operacional-os'',
    headers := jsonb_build_object(
      ''Content-Type'', ''application/json'',
      ''Authorization'', ''Bearer '' || (select decrypted_secret from vault.decrypted_secrets where name = ''service_role_key'' limit 1)
    ),
    body := jsonb_build_object(''limite'', 25),
    timeout_milliseconds := 60000
  ) as request_id;
');

-- job 9 (active=t)
select cron.schedule('update-bfleet-condutores-5min', '*/5 * * * *', '
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = ''project_url'' limit 1) || ''/functions/v1/update-bfleet-condutores'',
    headers := jsonb_build_object(
      ''Content-Type'', ''application/json'',
      ''Authorization'', ''Bearer '' || (select decrypted_secret from vault.decrypted_secrets where name = ''service_role_key'' limit 1)
    ),
    body := jsonb_build_object(''mode'', ''pending'', ''limit'', 100),
    timeout_milliseconds := 60000
  ) as request_id;
');

-- job 10 (active=t)
select cron.schedule('sync-detran-multas-diario', '20 9 * * *', 'select public.cron_trigger_sync_multas_detran_full()');

-- job 11 (active=t)
select cron.schedule('sync-login-alimentacao-11h', '*/5 14 * * *', '
    INSERT INTO public.grm_sync_jobs (agente_id, status)
    SELECT ''sync-login-alimentacao'', ''pendente''
    WHERE NOT EXISTS (
      SELECT 1 FROM public.grm_sync_jobs
      WHERE agente_id = ''sync-login-alimentacao'' AND status IN (''pendente'',''rodando'')
    );
  ');

-- job 12 (active=t)
select cron.schedule('sync-login-alimentacao-12h', '0,5,10,15,20,25,30 15 * * *', '
    INSERT INTO public.grm_sync_jobs (agente_id, status)
    SELECT ''sync-login-alimentacao'', ''pendente''
    WHERE NOT EXISTS (
      SELECT 1 FROM public.grm_sync_jobs
      WHERE agente_id = ''sync-login-alimentacao'' AND status IN (''pendente'',''rodando'')
    );
  ');

-- job 13 (active=t)
select cron.schedule('sync-login-alimentacao-06h', '*/5 9 * * *', '
    INSERT INTO public.grm_sync_jobs (agente_id, status)
    SELECT ''sync-login-alimentacao'', ''pendente''
    WHERE NOT EXISTS (
      SELECT 1 FROM public.grm_sync_jobs
      WHERE agente_id = ''sync-login-alimentacao'' AND status IN (''pendente'',''rodando'')
    );
  ');

-- job 14 (active=t)
select cron.schedule('sync-login-alimentacao-07h', '0,5,10,15,20,25,30 10 * * *', '
    INSERT INTO public.grm_sync_jobs (agente_id, status)
    SELECT ''sync-login-alimentacao'', ''pendente''
    WHERE NOT EXISTS (
      SELECT 1 FROM public.grm_sync_jobs
      WHERE agente_id = ''sync-login-alimentacao'' AND status IN (''pendente'',''rodando'')
    );
  ');

-- job 15 (active=t)
select cron.schedule('sync-login-alimentacao-19h', '*/5 22 * * *', '
    INSERT INTO public.grm_sync_jobs (agente_id, status)
    SELECT ''sync-login-alimentacao'', ''pendente''
    WHERE NOT EXISTS (
      SELECT 1 FROM public.grm_sync_jobs
      WHERE agente_id = ''sync-login-alimentacao'' AND status IN (''pendente'',''rodando'')
    );
  ');

-- job 16 (active=t)
select cron.schedule('sync-login-alimentacao-20h', '0,5,10,15,20,25,30 23 * * *', '
    INSERT INTO public.grm_sync_jobs (agente_id, status)
    SELECT ''sync-login-alimentacao'', ''pendente''
    WHERE NOT EXISTS (
      SELECT 1 FROM public.grm_sync_jobs
      WHERE agente_id = ''sync-login-alimentacao'' AND status IN (''pendente'',''rodando'')
    );
  ');

-- job 17 (active=t)
select cron.schedule('sync-login-alimentacao-continuo', '*/15 * * * *', '
    INSERT INTO public.grm_sync_jobs (agente_id, status)
    SELECT ''sync-login-alimentacao'', ''pendente''
    WHERE NOT EXISTS (
      SELECT 1 FROM public.grm_sync_jobs
      WHERE agente_id = ''sync-login-alimentacao'' AND status IN (''pendente'',''rodando'')
    );
  ');

-- job 18 (active=t)
select cron.schedule('registrar-localizacao-diaria-colaboradores', '0 23 * * *', 'select public.registrar_localizacao_diaria_colaboradores(current_date)');

-- job 19 (active=t)
select cron.schedule('rh-alertas-vencimento-diario', '0 10 * * *', 'select public.rh_gerar_alertas_vencimento()');

-- job 21 (active=t)
select cron.schedule('sync-veiculos-detran-diario', '5 9 * * *', '
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = ''project_url'' limit 1) || ''/functions/v1/sync-veiculos-detran'',
    headers := jsonb_build_object(
      ''Content-Type'', ''application/json'',
      ''Authorization'', ''Bearer '' || (select decrypted_secret from vault.decrypted_secrets where name = ''service_role_key'' limit 1)
    ),
    body := jsonb_build_object(''mode'', ''all'', ''origem'', ''cron''),
    timeout_milliseconds := 300000
  ) as request_id;
  ');

-- job 22 (active=t)
select cron.schedule('sync-bfleet-veiculos-15min', '*/15 * * * *', '
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = ''project_url'' limit 1) || ''/functions/v1/sync-bfleet-veiculos'',
    headers := jsonb_build_object(
      ''Content-Type'', ''application/json'',
      ''Authorization'', ''Bearer '' || (select decrypted_secret from vault.decrypted_secrets where name = ''service_role_key'' limit 1)
    ),
    body := jsonb_build_object(''mode'', ''sync'', ''origem'', ''cron''),
    timeout_milliseconds := 120000
  ) as request_id;
  ');

-- job 23 (active=t)
select cron.schedule('notificar-nf-pendentes-diario', '0 11 * * *', 'select public.notificar_nf_pendentes_atrasadas();');

-- job 28 (active=t)
select cron.schedule('sync-lancar-nhe-03h', '0 6 * * *', '
    INSERT INTO public.grm_sync_jobs (agente_id, status)
    SELECT ''sync-lancar-nhe'', ''pendente''
    WHERE NOT EXISTS (
      SELECT 1 FROM public.grm_sync_jobs
      WHERE agente_id = ''sync-lancar-nhe'' AND status IN (''pendente'',''rodando'')
    );
  ');

-- job 29 (active=t)
select cron.schedule('grm-liberacao-despesas-01h', '0 4 * * *', '
    insert into public.grm_sync_jobs (agente_id, status)
    select ''sync-liberacao-despesas'', ''pendente''
    where exists (
      select 1
      from public.grm_despesas_fila
      where data_referencia <= (now() at time zone ''America/Sao_Paulo'')::date
        and (
          status = ''PENDENTE''
          or (status = ''ERRO'' and tentativas < max_tentativas)
        )
    )
    and not exists (
      select 1
      from public.grm_sync_jobs
      where agente_id = ''sync-liberacao-despesas''
        and status in (''pendente'', ''rodando'')
    );
  ');

-- job 30 (active=t)
select cron.schedule('sync-bfleet-excesso-velocidade-diario', '0 7 * * *', '
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = ''project_url'' limit 1)
      || ''/functions/v1/sync-bfleet-excesso-velocidade'',
    headers := jsonb_build_object(
      ''Content-Type'', ''application/json'',
      ''Authorization'', ''Bearer '' || (select decrypted_secret from vault.decrypted_secrets where name = ''service_role_key'' limit 1)
    ),
    body := jsonb_build_object(
      ''scheduled'', true,
      ''source'', ''pg_cron'',
      ''forceRefreshToken'', true,
      ''preferWebReport'', true,
      ''rangeTimeVal'', ''yesterday''
    ),
    timeout_milliseconds := 120000
  ) as request_id;
  ');

-- job 31 (active=t)
select cron.schedule('sync-bfleet-fora-horario-diario', '0 7 * * *', '
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = ''project_url'' limit 1)
      || ''/functions/v1/sync-bfleet-fora-horario'',
    headers := jsonb_build_object(
      ''Content-Type'', ''application/json'',
      ''Authorization'', ''Bearer '' || (select decrypted_secret from vault.decrypted_secrets where name = ''service_role_key'' limit 1)
    ),
    body := jsonb_build_object(
      ''scheduled'', true,
      ''source'', ''pg_cron'',
      ''preferWebReport'', true,
      ''rangeTimeVal'', ''yesterday''
    ),
    timeout_milliseconds := 120000
  ) as request_id;
  ');

-- job 33 (active=t)
select cron.schedule('grm-despesas-reconciliacao-10min', '*/10 * * * *', '
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = ''project_url'' limit 1)
      || ''/functions/v1/grm-liberacao-despesas-publicar'',
    headers := jsonb_build_object(
      ''Content-Type'', ''application/json'',
      ''Authorization'', ''Bearer '' || (select decrypted_secret from vault.decrypted_secrets where name = ''service_role_key'' limit 1)
    ),
    body := jsonb_build_object(
      ''programacaoIds'', (
        select coalesce(jsonb_agg(id), ''[]''::jsonb)
        from public.programacao_dia
        where data_referencia >= (now() at time zone ''America/Sao_Paulo'')::date
      ),
      ''motivo'', ''RECONCILIACAO''
    ),
    timeout_milliseconds := 120000
  ) as request_id
  where exists (
    select 1 from public.programacao_dia
    where data_referencia >= (now() at time zone ''America/Sao_Paulo'')::date
  );
  ');

-- job 34 (active=t)
select cron.schedule('aplicar-distribuicao-os-agendada-02h', '0 5 * * *', '
    with pendencias as (
      select pda.id
      from public.programacao_distribuicao_agendada pda
      join public.supervisoes s on s.nome = pda.supervisao
      where pda.processado = false
        and s.distribuicao_os_automatica = true
    )
    insert into public.grm_sync_jobs (agente_id, status)
    select ''aplicar-distribuicao-os'', ''pendente''
    where exists (select 1 from pendencias)
      and not exists (
        select 1 from public.grm_sync_jobs
        where agente_id = ''aplicar-distribuicao-os'' and status in (''pendente'', ''rodando'')
      );

    update public.programacao_distribuicao_agendada pda
    set processado = true, processado_em = now()
    from public.supervisoes s
    where s.nome = pda.supervisao
      and s.distribuicao_os_automatica = true
      and pda.processado = false;
  ');

-- job 35 (active=f)
select cron.schedule('mapa-embarque-alertas-despachar-1min', '* * * * *', '
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = ''project_url'') || ''/functions/v1/mapa-embarque-alertas'',
      headers := jsonb_build_object(
        ''Content-Type'', ''application/json'',
        ''Authorization'', ''Bearer '' || (select decrypted_secret from vault.decrypted_secrets where name = ''service_role_key'')
      ),
      body := ''{"action":"dispatch"}''::jsonb
    );
  ');

-- job 36 (active=f)
select cron.schedule('mapa-embarque-alertas-varrer-30min', '*/30 * * * *', '
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = ''project_url'') || ''/functions/v1/mapa-embarque-alertas'',
      headers := jsonb_build_object(
        ''Content-Type'', ''application/json'',
        ''Authorization'', ''Bearer '' || (select decrypted_secret from vault.decrypted_secrets where name = ''service_role_key'')
      ),
      body := ''{"action":"scan"}''::jsonb
    );
  ');

-- job 48 (active=t)
select cron.schedule('sync-uber-corridas-15min', '*/15 * * * *', '
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = ''project_url'' limit 1)
        || ''/functions/v1/sync-uber-corridas'',
      headers := jsonb_build_object(
        ''Content-Type'', ''application/json'',
        ''Authorization'', ''Bearer '' || (select decrypted_secret from vault.decrypted_secrets where name = ''service_role_key'' limit 1)
      ),
      body := jsonb_build_object(
        ''data_inicial'', (((now() at time zone ''America/Sao_Paulo'')::date - 3)::date)::text,
        ''data_final'', ((now() at time zone ''America/Sao_Paulo'')::date)::text,
        ''origem'', ''pg_cron''
      ),
      timeout_milliseconds := 120000
    ) as request_id;
  ');

-- job 49 (active=t)
select cron.schedule('sync-uber-equipe-15min', '*/15 * * * *', '
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = ''project_url'' limit 1)
        || ''/functions/v1/sync-uber-equipe'',
      headers := jsonb_build_object(
        ''Content-Type'', ''application/json'',
        ''Authorization'', ''Bearer '' || (select decrypted_secret from vault.decrypted_secrets where name = ''service_role_key'' limit 1)
      ),
      body := jsonb_build_object(
        ''origem'', ''pg_cron'',
        ''limit'', 10
      ),
      timeout_milliseconds := 120000
    ) as request_id;
  ');

-- ============================================================
-- INDEXES (excluindo os que já apoiam PK/UNIQUE constraints,
-- esses já aparecem na seção TABELAS)
-- ============================================================

CREATE INDEX idx_alojamentos_ativo ON public.alojamentos USING btree (ativo);
CREATE INDEX idx_alojamentos_nome ON public.alojamentos USING btree (nome);
CREATE INDEX idx_app_auditoria_acao ON public.app_auditoria USING btree (acao);
CREATE INDEX idx_app_auditoria_created_at ON public.app_auditoria USING btree (created_at DESC);
CREATE INDEX idx_app_auditoria_modulo ON public.app_auditoria USING btree (modulo);
CREATE INDEX idx_app_auditoria_tabela_reg ON public.app_auditoria USING btree (tabela, registro_id);
CREATE INDEX idx_app_auditoria_usuario ON public.app_auditoria USING btree (usuario_id);
CREATE INDEX idx_app_logs_created_at ON public.app_logs USING btree (created_at DESC);
CREATE INDEX idx_app_logs_usuario_id ON public.app_logs USING btree (usuario_id);
CREATE INDEX idx_logs_created_at ON public.app_logs_usuarios USING btree (created_at DESC);
CREATE INDEX idx_logs_tipo ON public.app_logs_usuarios USING btree (tipo);
CREATE INDEX idx_logs_usuario_id ON public.app_logs_usuarios USING btree (usuario_id);
CREATE INDEX app_modulos_codigo_idx ON public.app_modulos USING btree (codigo) WHERE (codigo IS NOT NULL);
CREATE INDEX idx_notif_dest ON public.app_notificacoes USING btree (destinatario, lida, created_at DESC);
CREATE UNIQUE INDEX uq_notif_dedup ON public.app_notificacoes USING btree (chave_dedup) WHERE (chave_dedup IS NOT NULL);
CREATE INDEX idx_app_perfil_modulo_modulo ON public.app_perfil_modulo USING btree (modulo_id);
CREATE INDEX idx_app_perfil_modulo_perfil ON public.app_perfil_modulo USING btree (perfil_id);
CREATE INDEX app_perfis_codigo_idx ON public.app_perfis USING btree (codigo) WHERE (codigo IS NOT NULL);
CREATE INDEX app_usuario_modulos_modulo_id_idx ON public.app_usuario_modulos USING btree (modulo_id);
CREATE INDEX app_usuario_modulos_usuario_id_idx ON public.app_usuario_modulos USING btree (usuario_id);
CREATE INDEX app_usuario_modulos_usuario_modulo_idx ON public.app_usuario_modulos USING btree (usuario_id, modulo_id);
CREATE INDEX idx_app_usuario_modulos_modulo ON public.app_usuario_modulos USING btree (modulo_id);
CREATE INDEX idx_app_usuario_modulos_usuario ON public.app_usuario_modulos USING btree (usuario_id);
CREATE INDEX app_usuarios_email_idx ON public.app_usuarios USING btree (lower(email)) WHERE (email IS NOT NULL);
CREATE INDEX app_usuarios_perfil_id_idx ON public.app_usuarios USING btree (perfil_id);
CREATE INDEX app_usuarios_status_idx ON public.app_usuarios USING btree (status);
CREATE INDEX idx_app_usuarios_auth_user_id ON public.app_usuarios USING btree (auth_user_id);
CREATE INDEX idx_app_usuarios_email ON public.app_usuarios USING btree (email);
CREATE INDEX idx_app_usuarios_perfil_id ON public.app_usuarios USING btree (perfil_id);
CREATE INDEX idx_auditoria_agrupamentos_auditor ON public.auditoria_agrupamentos USING btree (auditor);
CREATE INDEX idx_auditoria_agrupamentos_status ON public.auditoria_agrupamentos USING btree (status);
CREATE INDEX idx_auditoria_solicitacoes_auditor ON public.auditoria_solicitacoes USING btree (auditor);
CREATE INDEX idx_auditoria_solicitacoes_data ON public.auditoria_solicitacoes USING btree (data_auditoria);
CREATE INDEX idx_auditoria_solicitacoes_placa_data ON public.auditoria_solicitacoes USING btree (placa, data_classificacao);
CREATE INDEX idx_auditoria_solicitacoes_status ON public.auditoria_solicitacoes USING btree (status);
CREATE INDEX bonus_auditoria_competencia_idx ON public.bonus_auditoria_inaptos USING btree (competencia);
CREATE INDEX bonus_caixa_status_idx ON public.bonus_caixa_lancamentos USING btree (status, solicitado_em);
CREATE INDEX bonus_caixa_status_nome_idx ON public.bonus_caixa_lancamentos USING btree (status, nome_normalizado);
CREATE INDEX bonus_producao_cache_status_idx ON public.bonus_producao_cache USING btree (competencia, status, valor);
CREATE INDEX bonus_producao_fechada_status_idx ON public.bonus_producao_fechada USING btree (competencia, status, valor);
CREATE INDEX ix_botconversa_config_empresa ON public.botconversa_config USING btree (empresa, ativo);
CREATE UNIQUE INDEX ux_botconversa_contatos_cpf ON public.botconversa_contatos USING btree (cpf);
CREATE INDEX ix_botconversa_fila_status ON public.botconversa_fila USING btree (status, created_at);
CREATE INDEX ix_botconversa_fila_telefone ON public.botconversa_fila USING btree (telefone);
CREATE INDEX ix_botconversa_fluxos_empresa ON public.botconversa_fluxos USING btree (empresa, ativo);
CREATE INDEX ix_botconversa_logs_created_at ON public.botconversa_logs USING btree (created_at DESC);
CREATE INDEX ix_botconversa_logs_telefone ON public.botconversa_logs USING btree (telefone);
CREATE INDEX chamados_ti_solicitante_idx ON public.chamados_ti USING btree (solicitante_id);
CREATE INDEX chamados_ti_status_idx ON public.chamados_ti USING btree (status);
CREATE INDEX chamados_ti_comentarios_chamado_idx ON public.chamados_ti_comentarios USING btree (chamado_id);
CREATE INDEX idx_colaborador_cruzamento_cpf ON public.colaborador_cruzamento USING btree (cpf);
CREATE INDEX idx_colaborador_cruzamento_nome_chave ON public.colaborador_cruzamento USING btree (nome_chave);
CREATE INDEX idx_colaborador_cruzamento_supervisao ON public.colaborador_cruzamento USING btree (supervisao);
CREATE INDEX idx_colaborador_cruzamento_veiculo ON public.colaborador_cruzamento USING btree (veiculo_id);
CREATE INDEX idx_colab_importacoes_data ON public.colaborador_importacoes USING btree (data_referencia DESC);
CREATE INDEX idx_colaborador_importacoes_data_ref ON public.colaborador_importacoes USING btree (data_referencia DESC);
CREATE INDEX idx_colab_snapshot_coordenacao ON public.colaborador_snapshot USING btree (coordenacao);
CREATE INDEX idx_colab_snapshot_cpf ON public.colaborador_snapshot USING btree (cpf);
CREATE INDEX idx_colab_snapshot_data_ref ON public.colaborador_snapshot USING btree (data_referencia DESC);
CREATE INDEX idx_colab_snapshot_importacao ON public.colaborador_snapshot USING btree (importacao_id);
CREATE INDEX idx_colab_snapshot_nome ON public.colaborador_snapshot USING btree (nome);
CREATE INDEX idx_colab_snapshot_nome_trgm ON public.colaborador_snapshot USING gin (nome gin_trgm_ops);
CREATE INDEX idx_colab_snapshot_supervisao ON public.colaborador_snapshot USING btree (supervisao);
CREATE INDEX colaboradores_cpf_digitos_idx ON public.colaboradores USING btree (regexp_replace(COALESCE(cpf, ''::text), '\D'::text, ''::text, 'g'::text)) WHERE (NULLIF(regexp_replace(COALESCE(cpf, ''::text), '\D'::text, ''::text, 'g'::text), ''::text) IS NOT NULL);
CREATE INDEX colaboradores_nome_bonus_key_idx ON public.colaboradores USING btree (bonus_normalizar_nome(nome)) WHERE (bonus_normalizar_nome(nome) <> ''::text);
CREATE INDEX idx_colaboradores_cpf ON public.colaboradores USING btree (cpf);
CREATE INDEX idx_colaboradores_nome ON public.colaboradores USING btree (nome);
CREATE INDEX ix_colaboradores_empresa ON public.colaboradores USING btree (empresa);
CREATE INDEX ix_colaboradores_nome ON public.colaboradores USING btree (nome);
CREATE INDEX ix_colaboradores_whatsapp ON public.colaboradores USING btree (whatsapp);
CREATE INDEX ix_colaboradores_historico_cpf ON public.colaboradores_historico USING btree (cpf);
CREATE INDEX ix_colaboradores_historico_data ON public.colaboradores_historico USING btree (data_referencia DESC);
CREATE INDEX ix_colaboradores_historico_nome_norm ON public.colaboradores_historico USING btree (nome_normalizado);
CREATE UNIQUE INDEX ux_colaboradores_historico_data_chave ON public.colaboradores_historico USING btree (data_referencia, chave_colaborador);
CREATE INDEX idx_colab_status_hist_ativo_data ON public.colaboradores_status_historico USING btree (ativo_novo, data_efetiva DESC);
CREATE INDEX idx_colab_status_hist_cpf_data ON public.colaboradores_status_historico USING btree (cpf, data_efetiva DESC, detectado_em DESC);
CREATE INDEX idx_colab_status_hist_nome_data ON public.colaboradores_status_historico USING btree (nome, data_efetiva DESC, detectado_em DESC);
CREATE UNIQUE INDEX uq_colab_status_hist_estado ON public.colaboradores_status_historico USING btree (cpf, ativo_novo, data_efetiva, COALESCE(situacao_nova, ''::text));
CREATE INDEX idx_propostas_cliente ON public.comercial_propostas USING btree (cliente);
CREATE INDEX idx_propostas_status ON public.comercial_propostas USING btree (status);
CREATE INDEX idx_compras_estoque_materiais_categoria ON public.compras_estoque_materiais USING btree (categoria);
CREATE INDEX idx_compras_estoque_materiais_status ON public.compras_estoque_materiais USING btree (ativo, estoque_atual, estoque_minimo);
CREATE INDEX idx_compras_estoque_mov_data ON public.compras_estoque_movimentacoes USING btree (data_movimentacao DESC);
CREATE INDEX idx_compras_estoque_mov_material ON public.compras_estoque_movimentacoes USING btree (material_id);
CREATE INDEX idx_compras_grupos_forn ON public.compras_grupos USING btree (fornecedor);
CREATE INDEX idx_compras_grupos_status ON public.compras_grupos USING btree (status);
CREATE INDEX idx_compras_itens_colaborador_nome ON public.compras_itens USING btree (colaborador_nome);
CREATE INDEX idx_compras_itens_colaborador_supervisao ON public.compras_itens USING btree (colaborador_supervisao);
CREATE INDEX idx_compras_itens_solicitacao ON public.compras_itens USING btree (solicitacao_id);
CREATE INDEX idx_compras_itens_solicitacao_id ON public.compras_itens USING btree (solicitacao_id);
CREATE INDEX idx_compras_itens_status ON public.compras_itens USING btree (status);
CREATE INDEX idx_compras_notif_setor ON public.compras_notificacoes_config USING btree (setor, ativo);
CREATE INDEX idx_compras_patrimonios_status ON public.compras_patrimonios_cadastro USING btree (status);
CREATE INDEX idx_compras_solicitacoes_data ON public.compras_solicitacoes USING btree (data_solicitacao DESC);
CREATE INDEX idx_compras_solicitacoes_status ON public.compras_solicitacoes USING btree (status);
CREATE INDEX idx_compras_solicitacoes_tipo_status ON public.compras_solicitacoes USING btree (tipo_solicitacao, status);
CREATE INDEX idx_conferencia_descontos_data ON public.conferencia_descontos USING btree (data_referencia DESC);
CREATE INDEX idx_conferencia_descontos_nome ON public.conferencia_descontos USING btree (nome);
CREATE INDEX idx_conferencia_descontos_status ON public.conferencia_descontos USING btree (status);
CREATE INDEX idx_conf_desp_created ON public.conferencia_despesas USING btree (created_at DESC);
CREATE INDEX idx_conf_desp_setor ON public.conferencia_despesas USING btree (setor_destino);
CREATE INDEX idx_conf_desp_status ON public.conferencia_despesas USING btree (status);
CREATE INDEX idx_conferencia_localizacao_colaborador ON public.conferencia_localizacao_colaboradores USING btree (colaborador_key);
CREATE INDEX idx_conferencia_localizacao_data ON public.conferencia_localizacao_colaboradores USING btree (data_referencia);
CREATE INDEX idx_conferencia_localizacao_os ON public.conferencia_localizacao_colaboradores USING btree (os_id);
CREATE INDEX idx_conf_uber_data ON public.conferencia_uber_corridas USING btree (data_solicitacao_local DESC);
CREATE INDEX idx_conf_uber_nome ON public.conferencia_uber_corridas USING btree (conf_norm_txt(nome));
CREATE INDEX idx_conf_uber_status ON public.conferencia_uber_corridas USING btree (status_validacao);
CREATE INDEX idx_conf_uber_supervisao ON public.conferencia_uber_corridas USING btree (supervisao);
CREATE UNIQUE INDEX uq_conferencia_uber_corridas_external_id ON public.conferencia_uber_corridas USING btree (external_id) WHERE (external_id IS NOT NULL);
CREATE UNIQUE INDEX uq_conferencia_uber_corridas_import_hash ON public.conferencia_uber_corridas USING btree (import_hash) WHERE (import_hash IS NOT NULL);
CREATE UNIQUE INDEX ux_conferencia_uber_import_hash ON public.conferencia_uber_corridas USING btree (import_hash);
CREATE INDEX idx_contato_cliente_data ON public.contato_cliente_registros USING btree (data_contato DESC);
CREATE INDEX idx_correios_rastreio ON public.correios_envios USING btree (codigo_rastreio);
CREATE INDEX idx_correios_status ON public.correios_envios USING btree (status);
CREATE INDEX idx_dashboard_cache_lookup ON public.dashboard_cache USING btree (modulo, referencia);
CREATE INDEX idx_dashboard_cache_periodo ON public.dashboard_cache USING btree (modulo, ano, mes, escopo);
CREATE INDEX idx_diretoria_dev_status ON public.diretoria_desenvolvimento USING btree (status, prioridade, ativo);
CREATE INDEX idx_diretoria_dev_updated ON public.diretoria_desenvolvimento USING btree (updated_at DESC);
CREATE INDEX idx_diretoria_dev_atualizacoes_item ON public.diretoria_desenvolvimento_atualizacoes USING btree (desenvolvimento_id, created_at DESC);
CREATE INDEX idx_dre_lancamentos_ano ON public.dre_lancamentos USING btree (ano);
CREATE INDEX idx_dre_lancamentos_ano_regional ON public.dre_lancamentos USING btree (ano, regional);
CREATE INDEX idx_dre_lancamentos_indicador ON public.dre_lancamentos USING btree (indicador);
CREATE INDEX idx_dre_lancamentos_regional ON public.dre_lancamentos USING btree (regional);
CREATE INDEX idx_efetivos_sem_producao_data ON public.efetivos_sem_producao USING btree (data_referencia DESC);
CREATE INDEX idx_email_mailbox_states_account ON public.email_mailbox_states USING btree (account_id);
CREATE INDEX idx_email_messages_account_uid ON public.email_messages USING btree (account_id, uid DESC);
CREATE INDEX idx_email_messages_data ON public.email_messages USING btree (data_recebimento DESC);
CREATE INDEX idx_email_messages_regional_categoria ON public.email_messages USING btree (regional, categoria);
CREATE INDEX idx_email_messages_status ON public.email_messages USING btree (status);
CREATE INDEX idx_email_outbox_status ON public.email_outbox USING btree (status, created_at);
CREATE INDEX envios_telegramas_clinica_sst_idx ON public.envios_telegramas USING btree (clinica_sst_id);
CREATE UNIQUE INDEX equipe_administracao_setor_usuario_uidx ON public.equipe_administracao_usuarios USING btree (lower(btrim(setor)), usuario_id);
CREATE INDEX equipe_administracao_usuario_idx ON public.equipe_administracao_usuarios USING btree (usuario_id);
CREATE UNIQUE INDEX equipe_gestores_regionais_regional_uidx ON public.equipe_gestores_regionais USING btree (lower(btrim(regional)));
CREATE INDEX equipe_gestores_regionais_supervisor_idx ON public.equipe_gestores_regionais USING btree (supervisor_usuario_id) WHERE (supervisor_usuario_id IS NOT NULL);
CREATE INDEX equipe_gestores_regionais_suporte_idx ON public.equipe_gestores_regionais USING btree (suporte_usuario_id) WHERE (suporte_usuario_id IS NOT NULL);
CREATE INDEX idx_faturamento_documentos_status ON public.faturamento_documentos USING btree (status);
CREATE INDEX idx_faturamento_faturas_prazo ON public.faturamento_faturas USING btree (prazo_envio);
CREATE INDEX idx_faturamento_faturas_responsavel ON public.faturamento_faturas USING btree (responsavel_id);
CREATE INDEX idx_faturamento_faturas_status ON public.faturamento_faturas USING btree (status);
CREATE INDEX idx_financeiro_adiantamentos_decisoes_status ON public.financeiro_adiantamentos_decisoes USING btree (status);
CREATE INDEX idx_financeiro_alimentacao_colaborador ON public.financeiro_alimentacao_colaboradores USING btree (colaborador_chave, data_ref);
CREATE INDEX idx_financeiro_alimentacao_data_status ON public.financeiro_alimentacao_colaboradores USING btree (data_ref, status, ativo);
CREATE INDEX idx_financeiro_alimentacao_pendentes ON public.financeiro_alimentacao_colaboradores USING btree (data_ref, colaborador) WHERE ((ativo = true) AND (status = 'PENDENTE'::text));
CREATE INDEX idx_fin_pagar_situacao ON public.financeiro_contas_pagar USING btree (situacao);
CREATE INDEX idx_fin_pagar_vencimento ON public.financeiro_contas_pagar USING btree (vencimento);
CREATE INDEX idx_fin_receber_situacao ON public.financeiro_contas_receber USING btree (situacao);
CREATE INDEX idx_fin_receber_vencimento ON public.financeiro_contas_receber USING btree (vencimento);
CREATE INDEX idx_fin_nf_data ON public.financeiro_notas_fiscais_resumo USING btree (data_pagamento);
CREATE INDEX idx_fin_nf_regional ON public.financeiro_notas_fiscais_resumo USING btree (regional);
CREATE UNIQUE INDEX financeiro_pagamentos_checkout_lote_uidx ON public.financeiro_pagamentos USING btree (hospedagem_checkout_lote_id) WHERE (hospedagem_checkout_lote_id IS NOT NULL);
CREATE INDEX financeiro_pagamentos_created_idx ON public.financeiro_pagamentos USING btree (created_at DESC);
CREATE INDEX financeiro_pagamentos_hospedagem_reserva_idx ON public.financeiro_pagamentos USING btree (origem_id) WHERE (origem_setor = 'HOSPEDAGEM'::text);
CREATE UNIQUE INDEX financeiro_pagamentos_origem_uidx ON public.financeiro_pagamentos USING btree (origem_tabela, origem_id) WHERE (origem_id IS NOT NULL);
CREATE UNIQUE INDEX financeiro_pagamentos_origem_unique ON public.financeiro_pagamentos USING btree (origem_tabela, origem_id);
CREATE INDEX financeiro_pagamentos_setor_idx ON public.financeiro_pagamentos USING btree (origem_setor);
CREATE INDEX financeiro_pagamentos_status_idx ON public.financeiro_pagamentos USING btree (status);
CREATE INDEX financeiro_pagamentos_venc_idx ON public.financeiro_pagamentos USING btree (data_vencimento);
CREATE INDEX idx_financeiro_pagamentos_created_at ON public.financeiro_pagamentos USING btree (created_at DESC);
CREATE INDEX idx_financeiro_pagamentos_origem ON public.financeiro_pagamentos USING btree (origem);
CREATE INDEX idx_financeiro_pagamentos_status ON public.financeiro_pagamentos USING btree (status);
CREATE INDEX idx_fin_pag_linhas_cpf ON public.financeiro_pagamentos_linhas USING btree (cpf);
CREATE INDEX idx_fin_pag_linhas_data ON public.financeiro_pagamentos_linhas USING btree (data);
CREATE INDEX idx_fin_pag_linhas_status ON public.financeiro_pagamentos_linhas USING btree (status);
CREATE INDEX idx_fin_provisoes_data ON public.financeiro_provisoes USING btree (data);
CREATE INDEX idx_frota_solicitacoes_status ON public.frota_solicitacoes USING btree (status);
CREATE INDEX idx_frota_solicitacoes_tipo ON public.frota_solicitacoes USING btree (tipo);
CREATE INDEX idx_frotas_bfleet_condutores_fila_pendentes ON public.frotas_bfleet_condutores_fila USING btree (tentativas, created_at) WHERE (status = 'PENDENTE'::text);
CREATE INDEX idx_frotas_bfleet_condutores_fila_placa ON public.frotas_bfleet_condutores_fila USING btree (placa);
CREATE INDEX idx_frotas_bfleet_condutores_fila_status ON public.frotas_bfleet_condutores_fila USING btree (status, created_at);
CREATE UNIQUE INDEX idx_frotas_bfleet_condutores_fila_veiculo ON public.frotas_bfleet_condutores_fila USING btree (veiculo_id);
CREATE INDEX idx_frotas_bfleet_diagnostico_created_at ON public.frotas_bfleet_diagnostico USING btree (created_at DESC);
CREATE INDEX idx_frotas_bfleet_diagnostico_placa ON public.frotas_bfleet_diagnostico USING btree (placa);
CREATE INDEX idx_frotas_bfleet_diagnostico_sync_id ON public.frotas_bfleet_diagnostico USING btree (sync_id);
CREATE INDEX idx_frotas_bfleet_diagnostico_tipo ON public.frotas_bfleet_diagnostico USING btree (tipo);
CREATE INDEX idx_frotas_checklists_veiculo ON public.frotas_checklists USING btree (veiculo_id);
CREATE UNIQUE INDEX frotas_detran_config_empresa_chave_uidx ON public.frotas_detran_config USING btree (COALESCE(empresa, ''::text), chave_nome);
CREATE INDEX idx_frotas_excesso_bfleet_origem ON public.frotas_excesso_velocidade USING btree (origem, bfleet_report_id);
CREATE INDEX idx_frotas_excesso_motorista ON public.frotas_excesso_velocidade USING btree (patrimonio_funcionario);
CREATE INDEX idx_frotas_excesso_placa ON public.frotas_excesso_velocidade USING btree (placa);
CREATE INDEX idx_frotas_excesso_status ON public.frotas_excesso_velocidade USING btree (status_notificacao, data_evento DESC);
CREATE INDEX idx_frotas_excesso_velocidade_bfleet_vehicle_id ON public.frotas_excesso_velocidade USING btree (bfleet_vehicle_id);
CREATE INDEX idx_frotas_excesso_velocidade_data ON public.frotas_excesso_velocidade USING btree (data_evento);
CREATE INDEX idx_frotas_excesso_velocidade_placa ON public.frotas_excesso_velocidade USING btree (placa);
CREATE INDEX idx_frotas_excesso_velocidade_status_notificacao ON public.frotas_excesso_velocidade USING btree (status_notificacao);
CREATE UNIQUE INDEX ux_frotas_excesso_velocidade_import_hash ON public.frotas_excesso_velocidade USING btree (import_hash);
CREATE INDEX frotas_fora_horario_data_evento_idx ON public.frotas_fora_horario USING btree (data_evento DESC);
CREATE INDEX frotas_fora_horario_placa_idx ON public.frotas_fora_horario USING btree (placa);
CREATE INDEX idx_gps_occ_placa ON public.frotas_gps_ocorrencias USING btree (placa, detectada_em DESC);
CREATE INDEX idx_gps_occ_status ON public.frotas_gps_ocorrencias USING btree (status);
CREATE INDEX idx_frotas_manutencoes_veiculo ON public.frotas_manutencoes USING btree (veiculo_id);
CREATE INDEX idx_frotas_motoristas_cpf ON public.frotas_motoristas USING btree (cpf);
CREATE INDEX idx_frotas_motoristas_nome ON public.frotas_motoristas USING btree (nome);
CREATE INDEX idx_frotas_motoristas_status ON public.frotas_motoristas USING btree (status);
CREATE INDEX frotas_multas_data_infracao_idx ON public.frotas_multas USING btree (data_infracao DESC);
CREATE UNIQUE INDEX frotas_multas_import_hash_uidx ON public.frotas_multas USING btree (import_hash) WHERE ((import_hash IS NOT NULL) AND (import_hash <> ''::text));
CREATE UNIQUE INDEX frotas_multas_key_uidx ON public.frotas_multas USING btree (key) WHERE ((key IS NOT NULL) AND (key <> ''::text));
CREATE INDEX frotas_multas_motorista_idx ON public.frotas_multas USING btree (motorista);
CREATE INDEX frotas_multas_placa_idx ON public.frotas_multas USING btree (placa);
CREATE INDEX frotas_multas_status_idx ON public.frotas_multas USING btree (status_multa, situacao, status_notificacao);
CREATE INDEX idx_frotas_multas_acao_status ON public.frotas_multas USING btree (acao_status);
CREATE INDEX idx_frotas_multas_data ON public.frotas_multas USING btree (data_infracao);
CREATE INDEX idx_frotas_multas_data_infracao ON public.frotas_multas USING btree (data_infracao);
CREATE INDEX idx_frotas_multas_data_vencimento ON public.frotas_multas USING btree (data_vencimento);
CREATE INDEX idx_frotas_multas_data_vencimento_auto ON public.frotas_multas USING btree (data_vencimento_auto);
CREATE INDEX idx_frotas_multas_empresa ON public.frotas_multas USING btree (empresa);
CREATE INDEX idx_frotas_multas_placa ON public.frotas_multas USING btree (placa);
CREATE INDEX idx_frotas_multas_renavam ON public.frotas_multas USING btree (renavam);
CREATE INDEX idx_frotas_multas_status ON public.frotas_multas USING btree (status_multa);
CREATE INDEX idx_frotas_multas_status_multa ON public.frotas_multas USING btree (status_multa);
CREATE UNIQUE INDEX ux_frotas_multas_key ON public.frotas_multas USING btree (multa_key);
CREATE INDEX idx_multas_acoes_multa ON public.frotas_multas_acoes USING btree (multa_id, created_at DESC);
CREATE UNIQUE INDEX frotas_multas_arquivos_chave_uidx ON public.frotas_multas_arquivos USING btree (chave_tecnica) WHERE ((chave_tecnica IS NOT NULL) AND (chave_tecnica <> ''::text));
CREATE INDEX frotas_multas_arquivos_criado_idx ON public.frotas_multas_arquivos USING btree (criado_em DESC);
CREATE INDEX frotas_multas_arquivos_placa_idx ON public.frotas_multas_arquivos USING btree (placa);
CREATE INDEX frotas_multas_logs_key_idx ON public.frotas_multas_logs USING btree (key_multa);
CREATE INDEX frotas_multas_logs_multa_idx ON public.frotas_multas_logs USING btree (multa_id, criado_em DESC);
CREATE INDEX idx_frotas_posicoes_veiculo ON public.frotas_posicoes USING btree (veiculo_id);
CREATE INDEX idx_frotas_posicoes_historico_placa_data ON public.frotas_posicoes_historico USING btree (placa, reportado_em);
CREATE INDEX idx_frotas_posicoes_historico_reportado ON public.frotas_posicoes_historico USING btree (reportado_em);
CREATE INDEX frotas_print_ocr_arquivo_id_idx ON public.frotas_print_ocr_execucoes USING btree (arquivo_id) WHERE (arquivo_id IS NOT NULL);
CREATE INDEX frotas_print_ocr_pendentes_idx ON public.frotas_print_ocr_execucoes USING btree (criado_em DESC) WHERE (status = ANY (ARRAY['PENDENTE_CONFERENCIA'::text, 'AMBIGUO'::text, 'CONFLITO_CONCORRENCIA'::text]));
CREATE INDEX idx_frotas_rastreadores_contrato ON public.frotas_rastreadores USING btree (contrato);
CREATE INDEX idx_frotas_rastreadores_placa ON public.frotas_rastreadores USING btree (placa);
CREATE INDEX idx_frotas_rastreadores_responsavel ON public.frotas_rastreadores USING btree (responsavel);
CREATE INDEX idx_frotas_rastreadores_status ON public.frotas_rastreadores USING btree (status);
CREATE INDEX idx_frotas_rastreadores_veiculo ON public.frotas_rastreadores USING btree (veiculo_id);
CREATE INDEX idx_frotas_rastreadores_removidos_placa ON public.frotas_rastreadores_removidos USING btree (placa);
CREATE INDEX idx_frotas_rastreadores_removidos_removido_em ON public.frotas_rastreadores_removidos USING btree (removido_em DESC);
CREATE INDEX idx_frotas_rotas_data_placa ON public.frotas_rotas USING btree (data, placa);
CREATE INDEX idx_frotas_rotas_paradas_os ON public.frotas_rotas_paradas USING btree (os_id);
CREATE INDEX idx_frotas_rotas_paradas_rota ON public.frotas_rotas_paradas USING btree (rota_id);
CREATE INDEX idx_frotas_trocas_oleo_veiculo ON public.frotas_trocas_oleo USING btree (veiculo_id);
CREATE UNIQUE INDEX frotas_veiculos_placa_uidx ON public.frotas_veiculos USING btree (placa) WHERE ((placa IS NOT NULL) AND (placa <> ''::text));
CREATE INDEX idx_frotas_veiculos_bfleet_id ON public.frotas_veiculos USING btree (bfleet_id);
CREATE INDEX idx_frotas_veiculos_bfleet_idgps ON public.frotas_veiculos USING btree (bfleet_idgps);
CREATE INDEX idx_frotas_veiculos_bfleet_rastreador ON public.frotas_veiculos USING btree (rastreador_bfleet);
CREATE INDEX idx_frotas_veiculos_bfleet_status ON public.frotas_veiculos USING btree (bfleet_status);
CREATE INDEX idx_frotas_veiculos_bfleet_vehicle_id ON public.frotas_veiculos USING btree (bfleet_vehicle_id);
CREATE INDEX idx_frotas_veiculos_chassi ON public.frotas_veiculos USING btree (chassi);
CREATE INDEX idx_frotas_veiculos_condutor_divergente ON public.frotas_veiculos USING btree (condutor_divergente);
CREATE INDEX idx_frotas_veiculos_detran_status ON public.frotas_veiculos USING btree (detran_status);
CREATE INDEX idx_frotas_veiculos_detran_token_key ON public.frotas_veiculos USING btree (detran_token_key);
CREATE INDEX idx_frotas_veiculos_origem ON public.frotas_veiculos USING btree (origem);
CREATE INDEX idx_frotas_veiculos_placa ON public.frotas_veiculos USING btree (placa);
CREATE INDEX idx_frotas_veiculos_placa_bfleet ON public.frotas_veiculos USING btree (placa);
CREATE INDEX idx_frotas_veiculos_placa_norm ON public.frotas_veiculos USING btree (regexp_replace(upper(COALESCE(placa, ''::text)), '[^A-Z0-9]'::text, ''::text, 'g'::text));
CREATE INDEX idx_frotas_veiculos_placa_normalizada ON public.frotas_veiculos USING btree (placa_normalizada);
CREATE INDEX idx_frotas_veiculos_rastreador ON public.frotas_veiculos USING btree (possui_rastreador);
CREATE INDEX idx_frotas_veiculos_rastreador_bfleet ON public.frotas_veiculos USING btree (rastreador_bfleet);
CREATE INDEX idx_frotas_veiculos_renavam ON public.frotas_veiculos USING btree (renavam);
CREATE UNIQUE INDEX ux_frotas_veiculos_placa ON public.frotas_veiculos USING btree (placa);
CREATE INDEX idx_frotas_veiculos_historico_veiculo ON public.frotas_veiculos_historico USING btree (veiculo_id, data_inicio DESC);
CREATE INDEX idx_google_contacts_jobs_user_status ON public.google_contacts_jobs USING btree (user_id, status, created_at DESC);
CREATE INDEX idx_google_contacts_map_user_status ON public.google_contacts_map USING btree (user_id, status);
CREATE INDEX idx_google_contacts_oauth_state_expires ON public.google_contacts_oauth_states USING btree (state, expires_at);
CREATE INDEX google_contacts_sync_jobs_user_created_idx ON public.google_contacts_sync_jobs USING btree (user_id, created_at DESC);
CREATE INDEX idx_grm_abertura_os_execucoes_solicitacao ON public.grm_abertura_os_execucoes USING btree (abertura_os_id, created_at DESC);
CREATE INDEX idx_grm_adiantamentos_importacoes_status ON public.grm_adiantamentos_importacoes USING btree (ofr_status);
CREATE INDEX idx_grm_adiantamentos_pendente_no_grm ON public.grm_adiantamentos_importacoes USING btree (pendente_no_grm);
CREATE INDEX idx_grm_cargas_importacoes_data ON public.grm_cargas_importacoes USING btree (data_classificacao DESC);
CREATE INDEX idx_grm_cargas_importacoes_os ON public.grm_cargas_importacoes USING btree (os);
CREATE INDEX idx_grm_cargas_os_normalizada_movimento ON public.grm_cargas_importacoes USING btree (regexp_replace(regexp_replace(TRIM(BOTH FROM os), '\.0+$'::text, ''::text, 'g'::text), '[^0-9]'::text, ''::text, 'g'::text), data_classificacao DESC) WHERE ((os IS NOT NULL) AND (data_classificacao IS NOT NULL));
CREATE INDEX grm_despesas_estado_data_status_idx ON public.grm_despesas_estado_colaborador USING btree (data_referencia, status_aplicacao);
CREATE INDEX grm_despesas_estado_versao_idx ON public.grm_despesas_estado_colaborador USING btree (versao_desejada_id);
CREATE INDEX grm_despesas_fila_cpf_idx ON public.grm_despesas_fila USING btree (cpf, created_at DESC);
CREATE UNIQUE INDEX grm_despesas_fila_pendente_hash_uidx ON public.grm_despesas_fila USING btree (cpf, data_referencia, hash_desejado) WHERE (status = ANY (ARRAY['PENDENTE'::text, 'PROCESSANDO'::text]));
CREATE INDEX grm_despesas_fila_status_idx ON public.grm_despesas_fila USING btree (status, created_at);
CREATE INDEX grm_despesas_fila_versao_idx ON public.grm_despesas_fila USING btree (versao_id);
CREATE INDEX idx_grm_despesas_data ON public.grm_despesas_importacoes USING btree (data_conta_de, data_conta_ate);
CREATE INDEX grm_despesas_retroativas_auditoria_data_cpf_idx ON public.grm_despesas_retroativas_auditoria USING btree (data_referencia DESC, cpf);
CREATE INDEX grm_despesas_versoes_regional_data_idx ON public.grm_despesas_versoes USING btree (regional, data_referencia, created_at DESC);
CREATE INDEX idx_grm_distribuicao_os_importacoes_created_at ON public.grm_distribuicao_os_importacoes USING btree (created_at);
CREATE INDEX idx_grm_finalizacao_os_execucoes_inicio ON public.grm_finalizacao_os_execucoes USING btree (iniciado_em DESC);
CREATE INDEX idx_grm_finalizacao_os_resultados_execucao ON public.grm_finalizacao_os_resultados USING btree (execucao_id);
CREATE INDEX idx_grm_finalizacao_os_resultados_os ON public.grm_finalizacao_os_resultados USING btree (os, criado_em DESC);
CREATE INDEX idx_grm_holerite_lancamentos_funcionario ON public.grm_holerite_lancamentos USING btree (registro_funcionario, referencia DESC);
CREATE INDEX idx_grm_holerite_lancamentos_referencia ON public.grm_holerite_lancamentos USING btree (referencia DESC);
CREATE INDEX idx_grm_holerite_lancamentos_status ON public.grm_holerite_lancamentos USING btree (status, atualizado_em DESC);
CREATE INDEX idx_grm_lista_os_importacoes_created_at ON public.grm_lista_os_importacoes USING btree (created_at);
CREATE INDEX idx_grm_lista_os_os_sync ON public.grm_lista_os_importacoes USING btree (((dados_json ->> 'O.S.'::text)), data_sincronizacao DESC);
CREATE INDEX idx_grm_lista_os_sync ON public.grm_lista_os_importacoes USING btree (data_sincronizacao DESC);
CREATE INDEX idx_grm_locais_embarque_data ON public.grm_locais_embarque_importacoes USING btree (data_solicitacao_de, data_solicitacao_ate);
CREATE INDEX idx_grm_locais_embarque_importacoes_created_at ON public.grm_locais_embarque_importacoes USING btree (created_at);
CREATE INDEX idx_grm_login_execucoes_iniciado ON public.grm_login_alimentacao_execucoes USING btree (iniciado_em DESC);
CREATE INDEX idx_grm_login_movimentos_colaborador ON public.grm_login_movimentos_importacoes USING btree (colaborador_chave, data_movimento);
CREATE INDEX idx_grm_login_movimentos_data_hora ON public.grm_login_movimentos_importacoes USING btree (data_movimento, hora_movimento);
CREATE INDEX idx_grm_login_movimentos_localizacao ON public.grm_login_movimentos_importacoes USING btree (latitude, longitude) WHERE ((latitude IS NOT NULL) AND (longitude IS NOT NULL));
CREATE INDEX idx_grm_mapa_embarque_importacoes_created_at ON public.grm_mapa_embarque_importacoes USING btree (created_at);
CREATE INDEX grm_nf_lancamentos_documento_idx ON public.grm_nf_lancamentos USING btree (fornecedor_cnpj, numero_documento, data_emissao);
CREATE INDEX grm_nf_lancamentos_fingerprint_idx ON public.grm_nf_lancamentos USING btree (fingerprint) WHERE (fingerprint IS NOT NULL);
CREATE INDEX grm_nf_lancamentos_status_idx ON public.grm_nf_lancamentos USING btree (status, updated_at DESC);
CREATE INDEX grm_nf_lancamentos_rh_folha_id_idx ON public.grm_nf_lancamentos USING btree (rh_folha_id) WHERE (rh_folha_id IS NOT NULL);
CREATE INDEX idx_grm_nhe_data_os_json ON public.grm_nhe_importacoes USING btree (((dados_json ->> 'lnsDate'::text)), ((dados_json ->> 'sorCode'::text)));
CREATE INDEX idx_grm_nhe_importacoes_created_at ON public.grm_nhe_importacoes USING btree (created_at DESC);
CREATE UNIQUE INDEX grm_notas_fiscais_importacoes_empresa_fatura_uidx ON public.grm_notas_fiscais_importacoes USING btree (empresa, fatura);
CREATE INDEX idx_grm_notas_fiscais_data_nota_real ON public.grm_notas_fiscais_importacoes USING btree (data_nota_real);
CREATE INDEX idx_grm_notas_fiscais_nota ON public.grm_notas_fiscais_importacoes USING btree (data_nota_de, data_nota_ate);
CREATE INDEX idx_grm_notas_fiscais_numero_nf ON public.grm_notas_fiscais_importacoes USING btree (numero_nf);
CREATE INDEX idx_grm_producao_diaria_data_os_json ON public.grm_producao_diaria_importacoes USING btree (((dados_json ->> 'Data'::text)), ((dados_json ->> 'O.S.'::text)));
CREATE INDEX idx_grm_producao_diaria_importacoes_created_at ON public.grm_producao_diaria_importacoes USING btree (created_at DESC);
CREATE INDEX idx_grm_producao_diaria_periodo ON public.grm_producao_diaria_importacoes USING btree (periodo_de, periodo_ate);
CREATE INDEX idx_grm_reabertura_exec_os ON public.grm_reabertura_os_execucoes USING btree (os, iniciado_em DESC);
CREATE INDEX idx_grm_reabertura_exec_status ON public.grm_reabertura_os_execucoes USING btree (status, iniciado_em DESC);
CREATE INDEX idx_grm_reabertura_os_fila_status_prioridade ON public.grm_reabertura_os_fila USING btree (status, prioridade, remanescente DESC NULLS LAST);
CREATE INDEX idx_grm_resultado_diario_data ON public.grm_resultado_diario_importacoes USING btree (data_classificacao_de, data_classificacao_ate);
CREATE INDEX idx_grm_sync_agent_settings_mutex ON public.grm_sync_agent_settings USING btree (mutex_group) WHERE (mutex_group IS NOT NULL);
CREATE INDEX idx_grm_sync_agent_settings_target_lane ON public.grm_sync_agent_settings USING btree (target_lane, enabled, priority DESC);
CREATE INDEX idx_grm_sync_jobs_agente_created ON public.grm_sync_jobs USING btree (agente_id, created_at DESC);
CREATE INDEX idx_grm_sync_jobs_lane_status_order ON public.grm_sync_jobs USING btree (lane, status, pipeline_seq, created_at);
CREATE INDEX idx_grm_sync_jobs_running_lease ON public.grm_sync_jobs USING btree (lane, lease_expires_at) WHERE (status = 'rodando'::text);
CREATE INDEX idx_grm_sync_jobs_status_created ON public.grm_sync_jobs USING btree (status, created_at);
CREATE INDEX historico_colaboradores_cargo_idx ON public.historico_colaboradores USING btree (cargo);
CREATE INDEX historico_colaboradores_coord_idx ON public.historico_colaboradores USING btree (coordenacao);
CREATE INDEX historico_colaboradores_cpf_idx ON public.historico_colaboradores USING btree (cpf);
CREATE INDEX historico_colaboradores_data_idx ON public.historico_colaboradores USING btree (data_referencia);
CREATE INDEX idx_historico_colaboradores_dre_coord_data ON public.historico_colaboradores USING btree (coordenacao, data_referencia);
CREATE INDEX idx_historico_colaboradores_dre_data_origem ON public.historico_colaboradores USING btree (data_referencia, origem);
CREATE INDEX ix_historico_colaboradores_data ON public.historico_colaboradores USING btree (data_referencia DESC);
CREATE INDEX ix_historico_colaboradores_empresa ON public.historico_colaboradores USING btree (empresa);
CREATE INDEX ix_historico_colaboradores_nome ON public.historico_colaboradores USING btree (nome);
CREATE UNIQUE INDEX ux_hist_colab ON public.historico_colaboradores USING btree (data_referencia, cpf);
CREATE UNIQUE INDEX ux_historico_colaboradores_data_cpf ON public.historico_colaboradores USING btree (data_referencia, cpf);
CREATE INDEX idx_hosp_adiantamento_mov_reserva ON public.hospedagem_adiantamento_movimentos USING btree (reserva_id, created_at DESC);
CREATE INDEX idx_hosp_adiantamentos_hotel_disponivel ON public.hospedagem_adiantamentos USING btree (hotel_id, created_at) WHERE ((status = 'DISPONIVEL'::text) AND (saldo > (0)::numeric));
CREATE INDEX idx_hospedagem_alojamentos_cidade_uf ON public.hospedagem_alojamentos USING btree (cidade, uf);
CREATE INDEX idx_hospedagem_alojamentos_status ON public.hospedagem_alojamentos USING btree (status);
CREATE INDEX idx_hospedagem_alojamentos_supervisao ON public.hospedagem_alojamentos USING btree (supervisao);
CREATE INDEX idx_hospedagem_alojamentos_supervisoes_gin ON public.hospedagem_alojamentos USING gin (supervisoes);
CREATE UNIQUE INDEX hospedagem_checkout_lote_colab_id_uidx ON public.hospedagem_checkout_lote_colaboradores USING btree (lote_id, solicitacao_colaborador_id) WHERE (solicitacao_colaborador_id IS NOT NULL);
CREATE INDEX idx_hosp_checkout_lotes_hotel_status ON public.hospedagem_checkout_lotes USING btree (hotel_id, status, data_checkout);
CREATE INDEX idx_hosp_cotacoes_hotel ON public.hospedagem_cotacoes USING btree (hotel_id);
CREATE INDEX idx_hosp_cotacoes_solicitacao ON public.hospedagem_cotacoes USING btree (solicitacao_id);
CREATE INDEX idx_hosp_cotacoes_status ON public.hospedagem_cotacoes USING btree (status);
CREATE INDEX idx_hosp_extras_reserva ON public.hospedagem_custos_extras USING btree (reserva_id);
CREATE INDEX idx_hosp_extras_solicitacao ON public.hospedagem_custos_extras USING btree (solicitacao_id);
CREATE INDEX idx_hosp_diferencas_colaborador ON public.hospedagem_diferencas_colaborador USING btree (solicitacao_colaborador_id);
CREATE INDEX idx_hosp_diferencas_reserva ON public.hospedagem_diferencas_colaborador USING btree (reserva_id);
CREATE UNIQUE INDEX hospedagem_documentos_external_message_uidx ON public.hospedagem_documentos USING btree (external_message_id) WHERE (external_message_id IS NOT NULL);
CREATE UNIQUE INDEX hospedagem_documentos_reserva_tipo_arquivo_uidx ON public.hospedagem_documentos USING btree (reserva_id, tipo, arquivo_url) WHERE ((reserva_id IS NOT NULL) AND (arquivo_url IS NOT NULL));
CREATE UNIQUE INDEX idx_hosp_docs_external_unique ON public.hospedagem_documentos USING btree (external_message_id) WHERE (external_message_id IS NOT NULL);
CREATE INDEX idx_hosp_docs_reserva ON public.hospedagem_documentos USING btree (reserva_id);
CREATE INDEX idx_hosp_docs_solicitacao ON public.hospedagem_documentos USING btree (solicitacao_id);
CREATE INDEX idx_hosp_docs_tipo ON public.hospedagem_documentos USING btree (tipo);
CREATE UNIQUE INDEX hospedagem_financeiro_reserva_uidx ON public.hospedagem_financeiro USING btree (reserva_id);
CREATE INDEX idx_hospedagem_historico_colaborador ON public.hospedagem_historico_colaboradores USING btree (colaborador);
CREATE INDEX idx_hospedagem_historico_data ON public.hospedagem_historico_colaboradores USING btree (data DESC);
CREATE INDEX idx_hospedagem_historico_hotel ON public.hospedagem_historico_colaboradores USING btree (hotel);
CREATE INDEX idx_hospedagem_historico_regional ON public.hospedagem_historico_colaboradores USING btree (regional);
CREATE INDEX idx_hospedagem_historico_status ON public.hospedagem_historico_colaboradores USING btree (status_hospedagem);
CREATE UNIQUE INDEX uq_hospedagem_historico_colaboradores_hash ON public.hospedagem_historico_colaboradores USING btree (unique_hash);
CREATE UNIQUE INDEX idx_hospedagem_hoteis_chave_importacao ON public.hospedagem_hoteis USING btree (chave_importacao) WHERE (chave_importacao IS NOT NULL);
CREATE INDEX idx_hospedagem_hoteis_cidade_nome ON public.hospedagem_hoteis USING btree (cidade, nome);
CREATE UNIQUE INDEX idx_hosp_msg_external_unique ON public.hospedagem_mensagens USING btree (external_message_id) WHERE (external_message_id IS NOT NULL);
CREATE INDEX idx_hosp_msg_hotel ON public.hospedagem_mensagens USING btree (hotel_id);
CREATE INDEX idx_hosp_msg_solicitacao ON public.hospedagem_mensagens USING btree (solicitacao_id);
CREATE INDEX idx_hospedagem_notas_reserva_id ON public.hospedagem_notas USING btree (reserva_id);
CREATE UNIQUE INDEX hospedagem_producao_diarias_uq ON public.hospedagem_producao_diarias USING btree (data, lower(TRIM(BOTH FROM funcionario)), lower(TRIM(BOTH FROM hotel)));
CREATE INDEX idx_hosp_reserva_colab_quarto ON public.hospedagem_reserva_colaboradores USING btree (reserva_quarto_id);
CREATE INDEX idx_hosp_reserva_colab_status ON public.hospedagem_reserva_colaboradores USING btree (reserva_id, status);
CREATE INDEX idx_hosp_reserva_quartos_reserva ON public.hospedagem_reserva_quartos USING btree (reserva_id);
CREATE INDEX idx_hosp_reserva_solicitacoes_solicitacao ON public.hospedagem_reserva_solicitacoes USING btree (solicitacao_id);
CREATE INDEX idx_hospedagem_reservas_solicitacao_id ON public.hospedagem_reservas USING btree (solicitacao_id);
CREATE INDEX idx_hospedagem_solicitacao_colab_solicitacao_id ON public.hospedagem_solicitacao_colaboradores USING btree (solicitacao_id);
CREATE INDEX idx_hosp_solicitacoes_programacao_periodo ON public.hospedagem_solicitacoes USING btree (programacao_id, data_checkin_prevista, data_checkout_prevista) WHERE (programacao_id IS NOT NULL);
CREATE UNIQUE INDEX idx_hospedagem_solicitacoes_codigo_unique ON public.hospedagem_solicitacoes USING btree (codigo) WHERE (codigo IS NOT NULL);
CREATE INDEX idx_hospedagem_solicitacoes_created_at ON public.hospedagem_solicitacoes USING btree (created_at DESC);
CREATE INDEX idx_hospedagem_solicitacoes_data ON public.hospedagem_solicitacoes USING btree (data_solicitacao DESC);
CREATE INDEX idx_import_fonte ON public.importacoes_registros USING btree (fonte, created_at DESC);
CREATE INDEX idx_indisponibilidades_periodo ON public.indisponibilidades USING btree (data_inicio DESC, data_fim DESC);
CREATE INDEX idx_logistica_abertura_os_status_created ON public.logistica_abertura_os USING btree (status, created_at);
CREATE INDEX logistica_abertura_os_created_idx ON public.logistica_abertura_os USING btree (created_at DESC);
CREATE INDEX logistica_abertura_os_numero_os_idx ON public.logistica_abertura_os USING btree (numero_os_cadastrada);
CREATE INDEX logistica_abertura_os_regional_idx ON public.logistica_abertura_os USING btree (regional);
CREATE INDEX logistica_abertura_os_solicitante_idx ON public.logistica_abertura_os USING btree (solicitante_id);
CREATE INDEX logistica_abertura_os_status_idx ON public.logistica_abertura_os USING btree (status);
CREATE INDEX idx_log_ajuste_os ON public.logistica_ajustes_saldo USING btree (os_id);
CREATE INDEX idx_log_ajuste_status ON public.logistica_ajustes_saldo USING btree (status);
CREATE INDEX idx_logistica_alertas_created_at ON public.logistica_alertas USING btree (created_at DESC);
CREATE INDEX idx_logistica_alertas_os ON public.logistica_alertas USING btree (os);
CREATE INDEX idx_logistica_alertas_os_id ON public.logistica_alertas USING btree (os_id);
CREATE INDEX idx_logistica_alertas_tipo_status ON public.logistica_alertas USING btree (tipo, status);
CREATE INDEX idx_logistica_btg_distribuicao_os ON public.logistica_btg_distribuicao USING btree (numero_os);
CREATE INDEX idx_btg_lista_os_contrato ON public.logistica_btg_lista_os USING btree (contrato);
CREATE INDEX idx_btg_lista_os_numero_os ON public.logistica_btg_lista_os USING btree (numero_os);
CREATE INDEX idx_logistica_btg_solicitacoes_contrato ON public.logistica_btg_solicitacoes USING btree (contrato_original);
CREATE UNIQUE INDEX idx_logistica_cargas_irreg_chave ON public.logistica_cargas_irregularidades USING btree (chave_unica);
CREATE INDEX idx_logistica_cargas_irreg_colaborador ON public.logistica_cargas_irregularidades USING btree (colaborador);
CREATE INDEX idx_logistica_cargas_irreg_data ON public.logistica_cargas_irregularidades USING btree (data_classificacao DESC);
CREATE INDEX idx_logistica_cargas_irreg_os ON public.logistica_cargas_irregularidades USING btree (os);
CREATE INDEX idx_logistica_cargas_irreg_status ON public.logistica_cargas_irregularidades USING btree (status);
CREATE INDEX idx_logistica_cargas_monitor_data ON public.logistica_cargas_monitor_execucoes USING btree (data_ref DESC, iniciado_em DESC);
CREATE INDEX idx_log_class_os ON public.logistica_classificadores_monitor USING btree (os_id);
CREATE INDEX idx_log_class_situacao ON public.logistica_classificadores_monitor USING btree (situacao);
CREATE INDEX idx_log_conf_data ON public.logistica_conferencias USING btree (data_envio DESC);
CREATE INDEX idx_log_conf_os ON public.logistica_conferencias USING btree (os_id);
CREATE INDEX idx_log_conf_status ON public.logistica_conferencias USING btree (status);
CREATE INDEX idx_log_exp_tipo ON public.logistica_exportacoes_historico USING btree (tipo, created_at DESC);
CREATE INDEX logistica_fob_data_idx ON public.logistica_fob USING btree (data_referencia DESC);
CREATE UNIQUE INDEX logistica_fob_import_hash_uidx ON public.logistica_fob USING btree (import_hash) WHERE (import_hash IS NOT NULL);
CREATE INDEX logistica_fob_numero_os_idx ON public.logistica_fob USING btree (numero_os);
CREATE INDEX logistica_fob_pendentes_programacao_idx ON public.logistica_fob USING btree (data_referencia, supervisao, status) WHERE (status = 'PENDENTE'::text);
CREATE INDEX logistica_fob_status_comparacao_idx ON public.logistica_fob USING btree (status_comparacao);
CREATE INDEX logistica_fob_status_idx ON public.logistica_fob USING btree (status);
CREATE INDEX logistica_fob_supervisao_idx ON public.logistica_fob USING btree (supervisao);
CREATE INDEX idx_log_inf_tipo ON public.logistica_informativos_geracoes USING btree (tipo, created_at DESC);
CREATE INDEX idx_logistica_nhe_lancamentos_auto_data ON public.logistica_nhe_lancamentos_auto USING btree (data_referencia);
CREATE INDEX idx_logistica_nhe_lancamentos_auto_status ON public.logistica_nhe_lancamentos_auto USING btree (status);
CREATE INDEX logistica_ocr_jobs_expiry_idx ON public.logistica_ocr_jobs USING btree (expires_at);
CREATE INDEX logistica_ocr_jobs_os_idx ON public.logistica_ocr_jobs USING btree (numero_os, created_at DESC);
CREATE INDEX logistica_ocr_jobs_queue_idx ON public.logistica_ocr_jobs USING btree (status, priority DESC, created_at);
CREATE INDEX logistica_ocr_jobs_user_idx ON public.logistica_ocr_jobs USING btree (request_user_id, created_at DESC);
CREATE INDEX logistica_ocr_workers_last_seen_idx ON public.logistica_ocr_workers USING btree (last_seen DESC);
CREATE INDEX logistica_pre_conferencia_os_numero_idx ON public.logistica_pre_conferencia_os USING btree (numero_os);
CREATE INDEX logistica_pre_conferencia_os_status_idx ON public.logistica_pre_conferencia_os USING btree (status, updated_at DESC);
CREATE INDEX idx_logistica_rel_dest_ativo ON public.logistica_relatorios_destinatarios USING btree (ativo);
CREATE INDEX idx_logistica_rel_dest_cliente ON public.logistica_relatorios_destinatarios USING btree (cliente);
CREATE INDEX idx_logistica_rel_dest_email ON public.logistica_relatorios_destinatarios USING btree (email);
CREATE INDEX idx_logistica_relatorios_cliente ON public.logistica_relatorios_envios USING btree (cliente);
CREATE INDEX idx_logistica_relatorios_created ON public.logistica_relatorios_envios USING btree (created_at DESC);
CREATE INDEX idx_logistica_relatorios_periodo ON public.logistica_relatorios_envios USING btree (data_inicial, data_final);
CREATE INDEX idx_logistica_relatorios_status ON public.logistica_relatorios_envios USING btree (status);
CREATE INDEX idx_logistica_solicitacoes_data ON public.logistica_solicitacoes USING btree (data_solicitacao DESC);
CREATE INDEX idx_mapa_embarque_alertas_fila ON public.mapa_embarque_alertas_atualizacao USING btree (agendado_para, created_at) WHERE (status = 'agendado'::text);
CREATE INDEX idx_mapa_embarque_alertas_os_encerrado ON public.mapa_embarque_alertas_atualizacao USING btree (os, silenciado_data DESC) WHERE (status = 'encerrado'::text);
CREATE INDEX idx_mapa_embarque_alertas_telefone_status ON public.mapa_embarque_alertas_atualizacao USING btree (telefone, status, alertado_em DESC) WHERE (telefone IS NOT NULL);
CREATE INDEX idx_metas_producao_ref ON public.metas_producao USING btree (ano, mes);
CREATE INDEX idx_metas_producao_regional ON public.metas_producao USING btree (regional);
CREATE UNIQUE INDEX metas_producao_ano_mes_regional_uidx ON public.metas_producao USING btree (ano, mes, upper(TRIM(BOTH FROM regional)));
CREATE INDEX idx_nf_catcor_nf ON public.nf_categorizacao_correcoes USING btree (nf_id);
CREATE INDEX idx_nf_ocr_status ON public.nf_ocr_fila USING btree (status, created_at DESC);
CREATE INDEX idx_operacional_auditoria_colaborador ON public.operacional_auditoria_colaborador USING btree (colaborador_id);
CREATE INDEX idx_operacional_auditoria_data ON public.operacional_auditoria_colaborador USING btree (data_evento DESC);
CREATE INDEX idx_operacional_auditoria_nome ON public.operacional_auditoria_colaborador USING gin (to_tsvector('portuguese'::regconfig, COALESCE(nome_colaborador, ''::text)));
CREATE INDEX idx_operacional_auditoria_nome_chave ON public.operacional_auditoria_colaborador USING btree (nome_chave);
CREATE INDEX idx_operacional_auditoria_resultado ON public.operacional_auditoria_colaborador USING btree (resultado);
CREATE UNIQUE INDEX operacional_auditoria_colaborador_import_hash_key ON public.operacional_auditoria_colaborador USING btree (import_hash);
CREATE INDEX idx_operacional_colaborador_ativo ON public.operacional_colaborador_base USING btree (ativo);
CREATE INDEX idx_operacional_colaborador_base_ativo ON public.operacional_colaborador_base USING btree (ativo);
CREATE INDEX idx_operacional_colaborador_base_bfleet_lugar_id ON public.operacional_colaborador_base USING btree (bfleet_lugar_id) WHERE (bfleet_lugar_id IS NOT NULL);
CREATE INDEX idx_operacional_colaborador_base_bfleet_sync_status ON public.operacional_colaborador_base USING btree (bfleet_lugar_sync_status);
CREATE INDEX idx_operacional_colaborador_base_cidade_uf ON public.operacional_colaborador_base USING btree (cidade_base, uf_base);
CREATE INDEX idx_operacional_colaborador_base_conf_nome_ativo ON public.operacional_colaborador_base USING btree (conf_norm_txt(nome)) WHERE (ativo IS TRUE);
CREATE INDEX idx_operacional_colaborador_base_conf_nome_chave_ativo ON public.operacional_colaborador_base USING btree (conf_norm_txt(nome_chave)) WHERE (ativo IS TRUE);
CREATE INDEX idx_operacional_colaborador_base_nome ON public.operacional_colaborador_base USING btree (nome);
CREATE INDEX idx_operacional_colaborador_base_supervisao ON public.operacional_colaborador_base USING btree (supervisao);
CREATE INDEX idx_operacional_colaborador_base_supervisao_ativo ON public.operacional_colaborador_base USING btree (supervisao, ativo);
CREATE INDEX idx_operacional_colaborador_cidade_uf ON public.operacional_colaborador_base USING btree (cidade_base, uf_base);
CREATE INDEX idx_operacional_colaborador_nome ON public.operacional_colaborador_base USING gin (to_tsvector('portuguese'::regconfig, COALESCE(nome, ''::text)));
CREATE UNIQUE INDEX uq_operacional_colaborador_base_nome_chave ON public.operacional_colaborador_base USING btree (nome_chave);
CREATE INDEX idx_operacional_embarques_cidade_uf ON public.operacional_embarques USING btree (cidade, uf);
CREATE INDEX idx_operacional_embarques_data ON public.operacional_embarques USING btree (data_embarque);
CREATE INDEX idx_operacional_hoteis_ativo ON public.operacional_hoteis USING btree (ativo);
CREATE INDEX idx_operacional_hoteis_cidade_uf ON public.operacional_hoteis USING btree (cidade, uf);
CREATE INDEX idx_operacional_laudos_enviado_em ON public.operacional_laudos USING btree (enviado_em DESC);
CREATE INDEX idx_operacional_laudos_os ON public.operacional_laudos USING btree (os_id);
CREATE INDEX idx_operacional_laudos_suspeito ON public.operacional_laudos USING btree (suspeito);
CREATE INDEX idx_operacional_mapa_rotas_data ON public.operacional_mapa_rotas USING btree (data_referencia);
CREATE INDEX idx_operacional_mapa_rotas_programacao ON public.operacional_mapa_rotas USING btree (programacao_id);
CREATE INDEX idx_operacional_mapa_rotas_sup_data ON public.operacional_mapa_rotas USING btree (supervisao, data_referencia);
CREATE INDEX idx_operacional_mapa_rotas_paradas_rota ON public.operacional_mapa_rotas_paradas USING btree (rota_id);
CREATE INDEX idx_operacional_os_data_os ON public.operacional_os USING btree (data_os DESC);
CREATE INDEX idx_operacional_os_finalizar_data_envio ON public.operacional_os USING btree (enviado_logistica_em) WHERE (status_gestor = 'FINALIZAR'::text);
CREATE INDEX idx_operacional_os_logistica_data ON public.operacional_os USING btree (data_os, status_logistica);
CREATE INDEX idx_operacional_os_numero_os ON public.operacional_os USING btree (numero_os);
CREATE INDEX idx_operacional_os_ponto_embarque ON public.operacional_os USING btree (ponto_embarque_id);
CREATE INDEX idx_operacional_os_programacao_acionaveis ON public.operacional_os USING btree (supervisao, id) WHERE ((status_gestor IS NULL) OR (status_gestor = ANY (ARRAY['PENDENTE'::text, 'AGUARDAR'::text, 'ATENDER'::text])));
CREATE INDEX idx_operacional_os_programacao_finalizadas ON public.operacional_os USING btree (supervisao, configurada_em, id) WHERE (status_gestor = 'FINALIZAR'::text);
CREATE INDEX idx_operacional_os_remanescente ON public.operacional_os USING btree (remanescente);
CREATE INDEX idx_operacional_os_status_conferencia ON public.operacional_os USING btree (status_conferencia);
CREATE INDEX idx_operacional_os_status_gestor ON public.operacional_os USING btree (status_gestor);
CREATE INDEX idx_operacional_os_status_gestor_logistica ON public.operacional_os USING btree (status_gestor, status_logistica);
CREATE INDEX idx_operacional_os_status_logistica ON public.operacional_os USING btree (status_logistica);
CREATE INDEX idx_operacional_os_supervisao ON public.operacional_os USING btree (supervisao);
CREATE INDEX idx_operacional_os_supervisao_data ON public.operacional_os USING btree (supervisao, data_os DESC);
CREATE INDEX idx_operacional_os_supervisao_status_data ON public.operacional_os USING btree (supervisao, status_gestor, data_os DESC);
CREATE UNIQUE INDEX operacional_os_numero_os_uidx ON public.operacional_os USING btree (numero_os);
CREATE INDEX idx_operacional_os_colab_os_id ON public.operacional_os_colaboradores USING btree (os_id);
CREATE INDEX idx_operacional_os_colaboradores_key ON public.operacional_os_colaboradores USING btree (colaborador_key);
CREATE INDEX idx_operacional_os_colaboradores_os ON public.operacional_os_colaboradores USING btree (os_id);
CREATE INDEX idx_operacional_os_colaboradores_os_id ON public.operacional_os_colaboradores USING btree (os_id);
CREATE UNIQUE INDEX operacional_os_colab_os_key_uidx ON public.operacional_os_colaboradores USING btree (os_id, colaborador_key);
CREATE INDEX idx_os_dist_os ON public.operacional_os_distribuicao USING btree (os_id, created_at DESC);
CREATE INDEX idx_operacional_passagens_rota ON public.operacional_passagens_cache USING btree (origem_cidade, origem_uf, destino_cidade, destino_uf);
CREATE INDEX idx_operacional_pontos_embarque_ativo ON public.operacional_pontos_embarque USING btree (ativo);
CREATE INDEX idx_operacional_pontos_embarque_cidade_uf ON public.operacional_pontos_embarque USING btree (cidade, uf);
CREATE INDEX idx_operacional_pontos_embarque_coord ON public.operacional_pontos_embarque USING btree (coordenacao);
CREATE INDEX idx_operacional_pontos_embarque_coordenacao ON public.operacional_pontos_embarque USING btree (coordenacao);
CREATE INDEX idx_operacional_pontos_embarque_geog_ativo ON public.operacional_pontos_embarque USING gist (((st_setsrid(st_makepoint((longitude)::double precision, (latitude)::double precision), 4326))::geography)) WHERE ((ativo IS TRUE) AND (latitude IS NOT NULL) AND (longitude IS NOT NULL));
CREATE INDEX idx_operacional_pontos_embarque_supervisao ON public.operacional_pontos_embarque USING btree (supervisao);
CREATE INDEX idx_pontos_embarque_match_cidade_local ON public.operacional_pontos_embarque USING btree (normalizar_chave_local(cidade), normalizar_chave_local(nome_local)) WHERE ((ativo IS TRUE) AND (latitude IS NOT NULL) AND (longitude IS NOT NULL));
CREATE INDEX idx_pontos_embarque_match_exato ON public.operacional_pontos_embarque USING btree (normalizar_chave_local(uf), normalizar_chave_local(cidade), normalizar_chave_local(nome_local)) WHERE ((ativo IS TRUE) AND (latitude IS NOT NULL) AND (longitude IS NOT NULL));
CREATE UNIQUE INDEX operacional_pontos_embarque_uf_cidade_local_uidx ON public.operacional_pontos_embarque USING btree (upper(btrim(uf)), upper(btrim(cidade)), upper(btrim(nome_local))) WHERE (ativo = true);
CREATE INDEX idx_operacional_simulacoes_embarque ON public.operacional_simulacoes USING btree (embarque_id);
CREATE INDEX idx_ouro_safra_classificacao_execucoes_iniciado_em ON public.ouro_safra_classificacao_execucoes USING btree (iniciado_em DESC);
CREATE INDEX idx_ouro_safra_classificacao_execucoes_status ON public.ouro_safra_classificacao_execucoes USING btree (status);
CREATE INDEX idx_painel_notif_arquivada ON public.painel_notificacoes USING btree (arquivada);
CREATE INDEX idx_painel_notif_created ON public.painel_notificacoes USING btree (created_at DESC);
CREATE INDEX idx_painel_notif_modulo ON public.painel_notificacoes USING btree (destinatario_modulo);
CREATE INDEX idx_painel_notif_perfil ON public.painel_notificacoes USING btree (destinatario_perfil);
CREATE INDEX idx_painel_notif_supervisao ON public.painel_notificacoes USING btree (supervisao);
CREATE INDEX idx_painel_notif_usuario ON public.painel_notificacoes USING btree (destinatario_usuario_id);
CREATE INDEX idx_notif_usr_notificacao ON public.painel_notificacoes_usuarios USING btree (notificacao_id);
CREATE INDEX idx_notif_usr_usuario ON public.painel_notificacoes_usuarios USING btree (usuario_id);
CREATE INDEX idx_patrimonio_solicitacoes_data ON public.patrimonio_solicitacoes USING btree (data_solicitacao DESC);
CREATE INDEX idx_patrimonios_historico_importacao_id ON public.patrimonios_historico USING btree (importacao_id);
CREATE INDEX idx_patrimonios_historico_patrimonio_codigo ON public.patrimonios_historico USING btree (patrimonio_codigo);
CREATE INDEX idx_patrimonios_hist_codigo ON public.patrimonios_historico_leituras USING btree (patrimonio_codigo);
CREATE INDEX idx_patrimonios_hist_coord_sup ON public.patrimonios_historico_leituras USING btree (coordenacao, supervisao);
CREATE INDEX idx_patrimonios_hist_upload ON public.patrimonios_historico_leituras USING btree (data_upload DESC);
CREATE INDEX patrimonios_historico_leituras_codigo_idx ON public.patrimonios_historico_leituras USING btree (patrimonio_codigo);
CREATE INDEX patrimonios_historico_leituras_data_upload_idx ON public.patrimonios_historico_leituras USING btree (data_upload);
CREATE INDEX patrimonios_historico_leituras_funcionario_idx ON public.patrimonios_historico_leituras USING btree (funcionario);
CREATE INDEX patrimonios_historico_leituras_identificacao_idx ON public.patrimonios_historico_leituras USING btree (identificacao);
CREATE INDEX idx_patrimonios_importacoes_created_at ON public.patrimonios_importacoes USING btree (created_at DESC);
CREATE INDEX idx_patrimonios_importacoes_status ON public.patrimonios_importacoes USING btree (status);
CREATE INDEX idx_patmov_pat ON public.patrimonios_movimentacoes USING btree (patrimonio_id, created_at DESC);
CREATE INDEX idx_patrimonios_snapshot_categoria_situacao ON public.patrimonios_snapshot USING btree (categoria, situacao);
CREATE INDEX idx_patrimonios_snapshot_coordenacao ON public.patrimonios_snapshot USING btree (coordenacao);
CREATE INDEX idx_patrimonios_snapshot_dias_sem_leitura ON public.patrimonios_snapshot USING btree (dias_sem_leitura);
CREATE INDEX idx_patrimonios_snapshot_funcionario ON public.patrimonios_snapshot USING btree (funcionario);
CREATE INDEX idx_patrimonios_snapshot_importacao_id ON public.patrimonios_snapshot USING btree (importacao_id);
CREATE INDEX idx_patrimonios_snapshot_patrimonio_codigo ON public.patrimonios_snapshot USING btree (patrimonio_codigo);
CREATE INDEX idx_patrimonios_snapshot_situacao ON public.patrimonios_snapshot USING btree (situacao);
CREATE INDEX idx_patrimonios_snapshot_supervisao ON public.patrimonios_snapshot USING btree (supervisao);
CREATE UNIQUE INDEX patrimonios_snapshot_patrimonio_codigo_uidx ON public.patrimonios_snapshot USING btree (patrimonio_codigo);
CREATE UNIQUE INDEX uq_patrimonios_snapshot_patrimonio_codigo ON public.patrimonios_snapshot USING btree (patrimonio_codigo);
CREATE INDEX idx_producao_importacoes_data_ref ON public.producao_importacoes USING btree (data_referencia DESC);
CREATE INDEX idx_producao_snapshot_data_ref ON public.producao_snapshot USING btree (data_referencia DESC);
CREATE INDEX idx_producao_snapshot_funcionario ON public.producao_snapshot USING btree (funcionario);
CREATE INDEX producao_snapshot_bonus_fob_data_func_idx ON public.producao_snapshot USING btree (data, funcionario) INCLUDE (tons) WHERE (servico = 'Classificação FOB'::text);
CREATE INDEX idx_programacao_alimentacao_programacao ON public.programacao_alimentacao USING btree (programacao_id);
CREATE UNIQUE INDEX programacao_alimentacao_colaborador_dia_uidx ON public.programacao_alimentacao USING btree (data_referencia, colaborador_id);
CREATE INDEX idx_programacao_colaborador_colaborador ON public.programacao_colaborador USING btree (colaborador_id);
CREATE INDEX idx_programacao_colaborador_data ON public.programacao_colaborador USING btree (data_referencia);
CREATE INDEX idx_prog_colab_programacao ON public.programacao_colaboradores USING btree (programacao_id);
CREATE INDEX idx_programacao_colaboradores_programacao ON public.programacao_colaboradores USING btree (programacao_id);
CREATE INDEX idx_prog_conf_status_data ON public.programacao_conferencia_status USING btree (data_referencia DESC);
CREATE INDEX idx_prog_conf_status_programacao ON public.programacao_conferencia_status USING btree (programacao_id);
CREATE INDEX idx_prog_conf_status_status ON public.programacao_conferencia_status USING btree (status_conferencia);
CREATE INDEX idx_prog_conf_status_supervisao ON public.programacao_conferencia_status USING btree (supervisao);
CREATE INDEX idx_programacao_contextos_data_sup ON public.programacao_contextos USING btree (data_referencia DESC, supervisao);
CREATE INDEX idx_programacao_deslocamento_placa ON public.programacao_deslocamento USING btree (placa_veiculo);
CREATE INDEX idx_programacao_deslocamento_placa_veiculo ON public.programacao_deslocamento USING btree (placa_veiculo);
CREATE INDEX idx_programacao_deslocamento_programacao ON public.programacao_deslocamento USING btree (programacao_id);
CREATE UNIQUE INDEX programacao_deslocamento_colaborador_dia_uidx ON public.programacao_deslocamento USING btree (data_referencia, colaborador_id);
CREATE INDEX idx_programacao_despesas_conferencia_data ON public.programacao_despesas USING btree (data_referencia DESC);
CREATE INDEX idx_programacao_despesas_conferencia_status ON public.programacao_despesas USING btree (status_conferencia);
CREATE INDEX idx_programacao_despesas_conferencia_supervisao ON public.programacao_despesas USING btree (supervisao);
CREATE INDEX idx_programacao_despesas_data ON public.programacao_despesas USING btree (data_referencia);
CREATE UNIQUE INDEX uq_programacao_despesas_data_colaborador ON public.programacao_despesas USING btree (data_referencia, upper(colaborador));
CREATE INDEX idx_programacao_dia_data ON public.programacao_dia USING btree (data_referencia);
CREATE INDEX idx_programacao_dia_data_supervisao ON public.programacao_dia USING btree (data_referencia DESC, supervisao);
CREATE INDEX idx_programacao_dia_supervisao ON public.programacao_dia USING btree (supervisao);
CREATE UNIQUE INDEX uq_programacao_dia_contexto ON public.programacao_dia USING btree (data_referencia, COALESCE(supervisao, ''::text), COALESCE(coordenacao, ''::text));
CREATE INDEX idx_programacao_equipe_colaborador ON public.programacao_equipe USING btree (programacao_id, colaborador_id);
CREATE INDEX idx_programacao_equipe_os ON public.programacao_equipe USING btree (os_id);
CREATE INDEX idx_programacao_equipe_programacao ON public.programacao_equipe USING btree (programacao_id);
CREATE INDEX idx_programacao_estadia_alojamento_id ON public.programacao_estadia USING btree (alojamento_id);
CREATE INDEX idx_programacao_estadia_programacao ON public.programacao_estadia USING btree (programacao_id);
CREATE UNIQUE INDEX programacao_estadia_colaborador_dia_uidx ON public.programacao_estadia USING btree (data_referencia, colaborador_id);
CREATE INDEX idx_prog_extras_programacao ON public.programacao_extras USING btree (programacao_id);
CREATE INDEX idx_programacao_extras_programacao ON public.programacao_extras USING btree (programacao_id);
CREATE INDEX programacao_frota_vinculos_alvo_idx ON public.programacao_frota_vinculos USING btree (programacao_id, alvo_colaborador_id) WHERE (alvo_colaborador_id IS NOT NULL);
CREATE INDEX programacao_frota_vinculos_frota_idx ON public.programacao_frota_vinculos USING btree (programacao_id, frota_colaborador_id);
CREATE INDEX programacao_frota_vinculos_os_idx ON public.programacao_frota_vinculos USING btree (os_id);
CREATE INDEX programacao_frota_vinculos_programacao_idx ON public.programacao_frota_vinculos USING btree (programacao_id);
CREATE INDEX idx_programacao_inativacao_colaborador ON public.programacao_inativacao_solicitacoes USING btree (colaborador_id);
CREATE INDEX idx_programacao_inativacao_status ON public.programacao_inativacao_solicitacoes USING btree (status);
CREATE INDEX idx_prog_indisp_informados_data ON public.programacao_indisponibilidade_informados USING btree (data_referencia DESC);
CREATE INDEX idx_prog_indisp_informados_status ON public.programacao_indisponibilidade_informados USING btree (status, informado_em DESC);
CREATE INDEX idx_programacao_itens_contexto ON public.programacao_itens USING btree (contexto_id);
CREATE INDEX idx_programacao_itens_cpf ON public.programacao_itens USING btree (colaborador_cpf);
CREATE UNIQUE INDEX ux_programacao_itens_contexto_cpf ON public.programacao_itens USING btree (contexto_id, colaborador_cpf);
CREATE INDEX programacao_usuario_supervisoes_app_idx ON public.programacao_usuario_supervisoes USING btree (app_usuario_id) WHERE (ativo = true);
CREATE UNIQUE INDEX programacao_usuario_supervisoes_app_sup_uidx ON public.programacao_usuario_supervisoes USING btree (app_usuario_id, upper(TRIM(BOTH FROM supervisao))) WHERE (app_usuario_id IS NOT NULL);
CREATE INDEX programacao_usuario_supervisoes_auth_idx ON public.programacao_usuario_supervisoes USING btree (auth_user_id) WHERE (ativo = true);
CREATE UNIQUE INDEX programacao_usuario_supervisoes_auth_sup_uidx ON public.programacao_usuario_supervisoes USING btree (auth_user_id, upper(TRIM(BOTH FROM supervisao))) WHERE (auth_user_id IS NOT NULL);
CREATE INDEX idx_propostas_comerciais_cliente ON public.propostas_comerciais USING gin (to_tsvector('portuguese'::regconfig, COALESCE(cliente, ''::text)));
CREATE INDEX idx_propostas_comerciais_created_at ON public.propostas_comerciais USING btree (created_at DESC);
CREATE INDEX idx_propostas_comerciais_numero ON public.propostas_comerciais USING btree (numero);
CREATE INDEX idx_propostas_comerciais_status ON public.propostas_comerciais USING btree (status);
CREATE INDEX propostas_gestores_regionais_ativo_ordem_idx ON public.propostas_gestores_regionais USING btree (ativo, ordem, regional);
CREATE INDEX idx_relatorio_resultado_diario_coord ON public.relatorio_resultado_diario USING btree (coordenacao);
CREATE INDEX idx_relatorio_resultado_diario_data ON public.relatorio_resultado_diario USING btree (data);
CREATE INDEX idx_relatorio_resultado_diario_dre_data_coord_func ON public.relatorio_resultado_diario USING btree (data, coordenacao, funcionario);
CREATE INDEX idx_relatorio_resultado_diario_importacao ON public.relatorio_resultado_diario USING btree (importacao_id);
CREATE INDEX idx_relatorio_resultado_diario_supervisao ON public.relatorio_resultado_diario USING btree (supervisao);
CREATE INDEX idx_rel_gavilon_classificador ON public.relatorio_resultado_gavilon USING btree (classificador);
CREATE INDEX idx_rel_gavilon_data ON public.relatorio_resultado_gavilon USING btree (data);
CREATE INDEX idx_rel_gavilon_importacao ON public.relatorio_resultado_gavilon USING btree (importacao_id);
CREATE INDEX idx_rel_gavilon_os ON public.relatorio_resultado_gavilon USING btree (os);
CREATE INDEX idx_relatorios_importacoes_created_at ON public.relatorios_importacoes USING btree (created_at DESC);
CREATE INDEX idx_relatorios_importacoes_modo ON public.relatorios_importacoes USING btree (modo_importacao);
CREATE INDEX idx_relatorios_importacoes_nome_arquivo ON public.relatorios_importacoes USING btree (nome_arquivo);
CREATE INDEX idx_relatorios_importacoes_status ON public.relatorios_importacoes USING btree (status);
CREATE INDEX idx_relatorios_importacoes_tipo ON public.relatorios_importacoes USING btree (tipo);
CREATE INDEX idx_relatorios_importacoes_tipo_created_at ON public.relatorios_importacoes USING btree (tipo_relatorio, created_at DESC);
CREATE INDEX idx_relatorios_importacoes_tipo_periodo ON public.relatorios_importacoes USING btree (tipo, periodo_inicio, periodo_fim) WHERE (status <> 'substituido'::text);
CREATE INDEX idx_relatorios_importacoes_tipo_status ON public.relatorios_importacoes USING btree (tipo, status, created_at DESC);
CREATE INDEX idx_relatorios_importacoes_usuario_id ON public.relatorios_importacoes USING btree (usuario_id);
CREATE INDEX idx_rh_adm_colab ON public.rh_admissao_checklist USING btree (colaborador_id);
CREATE UNIQUE INDEX uq_rh_adm_colab_etapa ON public.rh_admissao_checklist USING btree (colaborador_id, etapa);
CREATE INDEX rh_clinicas_sst_ativo_idx ON public.rh_clinicas_sst USING btree (ativo);
CREATE INDEX rh_clinicas_sst_cidade_idx ON public.rh_clinicas_sst USING btree (cidade);
CREATE INDEX rh_clinicas_sst_estado_idx ON public.rh_clinicas_sst USING btree (estado);
CREATE INDEX rh_clinicas_sst_nome_idx ON public.rh_clinicas_sst USING btree (nome);
CREATE INDEX idx_rh_contratos_colab ON public.rh_contratos USING btree (colaborador_id);
CREATE INDEX idx_rh_contratos_venc ON public.rh_contratos USING btree (vencimento);
CREATE INDEX idx_rh_epi_colab ON public.rh_epi USING btree (colaborador_id);
CREATE INDEX idx_rh_plantao_escalas_colaborador ON public.rh_plantao_escalas USING btree (colaborador_key);
CREATE INDEX idx_rh_plantao_escalas_data ON public.rh_plantao_escalas USING btree (data_plantao);
CREATE INDEX idx_rh_plantao_escalas_data_setor ON public.rh_plantao_escalas USING btree (data_plantao, setor);
CREATE INDEX idx_rh_plantao_escalas_setor ON public.rh_plantao_escalas USING btree (setor);
CREATE INDEX idx_rh_plantao_modelos_nome ON public.rh_plantao_modelos USING btree (nome_modelo);
CREATE INDEX rh_plantao_setor_editores_usuario_idx ON public.rh_plantao_setor_editores USING btree (app_usuario_id, setor);
CREATE INDEX idx_rh_trein_cpf ON public.rh_treinamento_acessos USING btree (cpf, acessado_em DESC);
CREATE INDEX idx_supervisoes_ativo ON public.supervisoes USING btree (ativo, nome);
CREATE INDEX idx_termos_colab ON public.termos_documentos USING btree (colaborador_id);
CREATE INDEX idx_termos_tipo ON public.termos_documentos USING btree (tipo, status);
CREATE INDEX idx_ti_integracao_segredos_integracao ON public.ti_integracao_segredos USING btree (integracao_id);
CREATE UNIQUE INDEX ti_integracao_segredos_integracao_chave_uidx ON public.ti_integracao_segredos USING btree (integracao_id, chave);
CREATE INDEX idx_ti_integracoes_categoria ON public.ti_integracoes USING btree (categoria);
CREATE INDEX idx_ti_integracoes_codigo ON public.ti_integracoes USING btree (codigo);
CREATE INDEX idx_uber_adicao_fila_status ON public.uber_colaboradores_adicao_fila USING btree (status, detectado_em);
CREATE UNIQUE INDEX uq_uber_adicao_fila_aberta_colaborador ON public.uber_colaboradores_adicao_fila USING btree (colaborador_id) WHERE (status = ANY (ARRAY['pendente'::text, 'processando'::text, 'sem_email'::text, 'erro'::text]));
CREATE INDEX idx_uber_remocao_fila_colaborador ON public.uber_colaboradores_remocao_fila USING btree (colaborador_id, detectado_em DESC);
CREATE INDEX idx_uber_remocao_fila_status ON public.uber_colaboradores_remocao_fila USING btree (status, created_at);

-- ============================================================
-- RLS POLICIES
-- ============================================================

CREATE POLICY alojamentos_select_authenticated ON public.alojamentos AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY auditoria_insert_auth ON public.app_auditoria AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() IS NOT NULL));

CREATE POLICY auditoria_select_auth ON public.app_auditoria AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY app_logs_insert_self ON public.app_logs AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((usuario_id IN ( SELECT u.id
   FROM app_usuarios u
  WHERE (u.auth_user_id = ( SELECT auth.uid() AS uid)))) OR (usuario_id IS NULL)));

CREATE POLICY app_logs_select_self ON public.app_logs AS PERMISSIVE FOR SELECT TO authenticated
  USING ((usuario_id IN ( SELECT u.id
   FROM app_usuarios u
  WHERE (u.auth_user_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY logs_insert_auth ON public.app_logs_usuarios AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));

CREATE POLICY logs_select_auth ON public.app_logs_usuarios AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY app_modulos_select_authenticated ON public.app_modulos AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY p_notif_ins ON public.app_notificacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY p_notif_sel ON public.app_notificacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY p_notif_upd ON public.app_notificacoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY app_perfil_modulo_select_authenticated ON public.app_perfil_modulo AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY app_perfis_select_authenticated ON public.app_perfis AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY app_usuario_modulos_select_authenticated ON public.app_usuario_modulos AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "admin pode tudo" ON public.app_usuarios AS PERMISSIVE FOR ALL TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY app_usuarios_select_self ON public.app_usuarios AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT auth.uid() AS uid) = auth_user_id));

CREATE POLICY app_usuarios_update_self ON public.app_usuarios AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT auth.uid() AS uid) = auth_user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = auth_user_id));

CREATE POLICY attachments_delete_authenticated ON public.attachments AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY attachments_insert_authenticated ON public.attachments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY attachments_select_authenticated ON public.attachments AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY attachments_update_authenticated ON public.attachments AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY audit_logs_delete_authenticated ON public.audit_logs AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY audit_logs_insert_authenticated ON public.audit_logs AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY audit_logs_select_authenticated ON public.audit_logs AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY audit_logs_update_authenticated ON public.audit_logs AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY auditoria_agrupamentos_authenticated_all ON public.auditoria_agrupamentos AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY auditoria_solicitacoes_authenticated_all ON public.auditoria_solicitacoes AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY bonus_auditoria_authenticated ON public.bonus_auditoria_inaptos AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY bonus_caixa_select_autorizado ON public.bonus_caixa_lancamentos AS PERMISSIVE FOR SELECT TO authenticated
  USING (bonus_usuario_tem_acesso());

CREATE POLICY bot_jobs_delete_authenticated ON public.bot_jobs AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY bot_jobs_insert_authenticated ON public.bot_jobs AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY bot_jobs_select_authenticated ON public.bot_jobs AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY bot_jobs_update_authenticated ON public.bot_jobs AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY bot_queue_delete_authenticated ON public.bot_queue AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY bot_queue_insert_authenticated ON public.bot_queue AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY bot_queue_select_authenticated ON public.bot_queue AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY bot_queue_update_authenticated ON public.bot_queue AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY botconversa_config_delete_authenticated ON public.botconversa_config AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY botconversa_config_insert_authenticated ON public.botconversa_config AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY botconversa_config_select_authenticated ON public.botconversa_config AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY botconversa_config_update_authenticated ON public.botconversa_config AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY botconversa_contatos_delete_authenticated ON public.botconversa_contatos AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY botconversa_contatos_insert_authenticated ON public.botconversa_contatos AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY botconversa_contatos_select_authenticated ON public.botconversa_contatos AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY botconversa_contatos_update_authenticated ON public.botconversa_contatos AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY botconversa_fila_delete_authenticated ON public.botconversa_fila AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY botconversa_fila_insert_authenticated ON public.botconversa_fila AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY botconversa_fila_select_authenticated ON public.botconversa_fila AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY botconversa_fila_update_authenticated ON public.botconversa_fila AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY botconversa_fluxos_delete_authenticated ON public.botconversa_fluxos AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY botconversa_fluxos_insert_authenticated ON public.botconversa_fluxos AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY botconversa_fluxos_select_authenticated ON public.botconversa_fluxos AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY botconversa_fluxos_update_authenticated ON public.botconversa_fluxos AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY botconversa_jobs_delete_authenticated ON public.botconversa_jobs AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY botconversa_jobs_insert_authenticated ON public.botconversa_jobs AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY botconversa_jobs_select_authenticated ON public.botconversa_jobs AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY botconversa_jobs_update_authenticated ON public.botconversa_jobs AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY botconversa_logs_delete_authenticated ON public.botconversa_logs AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY botconversa_logs_insert_authenticated ON public.botconversa_logs AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY botconversa_logs_select_authenticated ON public.botconversa_logs AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY botconversa_logs_update_authenticated ON public.botconversa_logs AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY botconversa_tags_delete_authenticated ON public.botconversa_tags AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY botconversa_tags_insert_authenticated ON public.botconversa_tags AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY botconversa_tags_select_authenticated ON public.botconversa_tags AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY botconversa_tags_update_authenticated ON public.botconversa_tags AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY botconversa_webhook_logs_delete_authenticated ON public.botconversa_webhook_logs AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY botconversa_webhook_logs_insert_authenticated ON public.botconversa_webhook_logs AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY botconversa_webhook_logs_select_authenticated ON public.botconversa_webhook_logs AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY botconversa_webhook_logs_update_authenticated ON public.botconversa_webhook_logs AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY chamados_ti_insert ON public.chamados_ti AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((solicitante_id = auth.uid()));

CREATE POLICY chamados_ti_select ON public.chamados_ti AS PERMISSIVE FOR SELECT TO public
  USING (((solicitante_id = auth.uid()) OR (responsavel_id = auth.uid()) OR is_chamados_ti_gestor()));

CREATE POLICY chamados_ti_update ON public.chamados_ti AS PERMISSIVE FOR UPDATE TO public
  USING (((solicitante_id = auth.uid()) OR is_chamados_ti_gestor()));

CREATE POLICY chamados_ti_comentarios_insert ON public.chamados_ti_comentarios AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((autor_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM chamados_ti c
  WHERE ((c.id = chamados_ti_comentarios.chamado_id) AND ((c.solicitante_id = auth.uid()) OR (c.responsavel_id = auth.uid()) OR is_chamados_ti_gestor()))))));

CREATE POLICY chamados_ti_comentarios_select ON public.chamados_ti_comentarios AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM chamados_ti c
  WHERE ((c.id = chamados_ti_comentarios.chamado_id) AND ((c.solicitante_id = auth.uid()) OR (c.responsavel_id = auth.uid()) OR is_chamados_ti_gestor())))));

CREATE POLICY "Authenticated users can read clientes_nacionais" ON public.clientes_nacionais AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY colaborador_cruzamento_select_auth ON public.colaborador_cruzamento AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated insert colaborador_importacoes" ON public.colaborador_importacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) = importado_por));

CREATE POLICY "authenticated read colaborador_importacoes" ON public.colaborador_importacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated update colaborador_importacoes" ON public.colaborador_importacoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated insert colaborador_snapshot" ON public.colaborador_snapshot AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated read colaborador_snapshot" ON public.colaborador_snapshot AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY colaboradores_insert_authenticated ON public.colaboradores AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY colaboradores_select_authenticated ON public.colaboradores AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY colaboradores_update_authenticated ON public.colaboradores AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY colaboradores_historico_delete_authenticated ON public.colaboradores_historico AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY colaboradores_historico_insert_authenticated ON public.colaboradores_historico AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY colaboradores_historico_select_authenticated ON public.colaboradores_historico AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY colaboradores_historico_update_authenticated ON public.colaboradores_historico AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY colaboradores_status_historico_select ON public.colaboradores_status_historico AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY p_propostas_ins ON public.comercial_propostas AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY p_propostas_sel ON public.comercial_propostas AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY p_propostas_upd ON public.comercial_propostas AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY authenticated_all_compras_cotacoes ON public.compras_cotacoes AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY compras_estoque_config_auth_all ON public.compras_estoque_config AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY compras_estoque_inventarios_auth_all ON public.compras_estoque_inventarios AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY compras_estoque_materiais_auth_all ON public.compras_estoque_materiais AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY compras_estoque_movimentacoes_auth_all ON public.compras_estoque_movimentacoes AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY p_cgrupos_ins ON public.compras_grupos AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY p_cgrupos_sel ON public.compras_grupos AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY p_cgrupos_upd ON public.compras_grupos AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY authenticated_all_compras_itens ON public.compras_itens AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY authenticated_all_compras_notif ON public.compras_notificacoes_config AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY authenticated_all_compras_patrimonios ON public.compras_patrimonios_cadastro AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated delete compras_solicitacoes" ON public.compras_solicitacoes AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY "authenticated insert compras_solicitacoes" ON public.compras_solicitacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((( SELECT auth.uid() AS uid) = created_by) OR (created_by IS NULL)));

CREATE POLICY "authenticated read compras_solicitacoes" ON public.compras_solicitacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated update compras_solicitacoes" ON public.compras_solicitacoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY authenticated_all_compras_solicitacoes ON public.compras_solicitacoes AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY conferencia_descontos_authenticated_all ON public.conferencia_descontos AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY conf_desp_insert ON public.conferencia_despesas AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY conf_desp_select ON public.conferencia_despesas AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY conf_desp_update ON public.conferencia_despesas AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY conferencia_geocoding_cache_insert ON public.conferencia_geocoding_cache AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY conferencia_geocoding_cache_select ON public.conferencia_geocoding_cache AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY conferencia_geocoding_cache_update ON public.conferencia_geocoding_cache AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY conferencia_localizacao_select_auth ON public.conferencia_localizacao_colaboradores AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY conferencia_uber_insert ON public.conferencia_uber_corridas AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY conferencia_uber_insert_authenticated ON public.conferencia_uber_corridas AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY conferencia_uber_select ON public.conferencia_uber_corridas AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY conferencia_uber_update ON public.conferencia_uber_corridas AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated delete contato_cliente_registros" ON public.contato_cliente_registros AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY "authenticated insert contato_cliente_registros" ON public.contato_cliente_registros AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((( SELECT auth.uid() AS uid) = created_by) OR (created_by IS NULL)));

CREATE POLICY "authenticated read contato_cliente_registros" ON public.contato_cliente_registros AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated update contato_cliente_registros" ON public.contato_cliente_registros AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY p_correios_ins ON public.correios_envios AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY p_correios_sel ON public.correios_envios AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY p_correios_upd ON public.correios_envios AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY dashboard_cache_select_authenticated ON public.dashboard_cache AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY dashboard_cache_write_authenticated ON public.dashboard_cache AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated read departments" ON public.departments AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY deslocamento_config_insert ON public.deslocamento_config AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY deslocamento_config_select ON public.deslocamento_config AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY deslocamento_config_update ON public.deslocamento_config AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY diretoria_desenvolvimento_delete_auth ON public.diretoria_desenvolvimento AS PERMISSIVE FOR DELETE TO authenticated
  USING ((auth.uid() IS NOT NULL));

CREATE POLICY diretoria_desenvolvimento_insert_auth ON public.diretoria_desenvolvimento AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() IS NOT NULL));

CREATE POLICY diretoria_desenvolvimento_select_auth ON public.diretoria_desenvolvimento AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY diretoria_desenvolvimento_update_auth ON public.diretoria_desenvolvimento AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK ((auth.uid() IS NOT NULL));

CREATE POLICY diretoria_desenvolvimento_updates_insert_auth ON public.diretoria_desenvolvimento_atualizacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() IS NOT NULL));

CREATE POLICY diretoria_desenvolvimento_updates_select_auth ON public.diretoria_desenvolvimento_atualizacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY desp_modify ON public.dre_despesas_mensal AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY desp_select ON public.dre_despesas_mensal AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY dre_importacoes_delete_authenticated ON public.dre_importacoes AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY dre_importacoes_insert_authenticated ON public.dre_importacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY dre_importacoes_select_authenticated ON public.dre_importacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY dre_importacoes_update_authenticated ON public.dre_importacoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY dre_lancamentos_delete_authenticated ON public.dre_lancamentos AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY dre_lancamentos_insert_authenticated ON public.dre_lancamentos AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY dre_lancamentos_select_authenticated ON public.dre_lancamentos AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY dre_lancamentos_update_authenticated ON public.dre_lancamentos AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated delete efetivos_sem_producao" ON public.efetivos_sem_producao AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY "authenticated insert efetivos_sem_producao" ON public.efetivos_sem_producao AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated read efetivos_sem_producao" ON public.efetivos_sem_producao AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "liberado geral" ON public.efetivos_sem_producao AS PERMISSIVE FOR ALL TO public
  USING (true);

CREATE POLICY email_accounts_auth ON public.email_accounts AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY email_attachments_auth ON public.email_attachments AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY email_gestores_regionais_delete ON public.email_gestores_regionais AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY email_gestores_regionais_insert ON public.email_gestores_regionais AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY email_gestores_regionais_select ON public.email_gestores_regionais AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY email_gestores_regionais_update ON public.email_gestores_regionais AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY email_historico_auth ON public.email_historico AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY email_mailbox_states_auth ON public.email_mailbox_states AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY email_messages_auth ON public.email_messages AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY email_outbox_auth ON public.email_outbox AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY email_regras_auth ON public.email_regras AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_role_token_cache ON public.envios_correios_token_cache AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY authenticated_all_destinatarios ON public.envios_destinatarios AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY authenticated_all_postagens ON public.envios_postagens AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY authenticated_all_rastreamento ON public.envios_rastreamento AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY authenticated_all_remetentes ON public.envios_remetentes AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY envios_reversa_delete_authenticated ON public.envios_reversa AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY envios_reversa_insert_authenticated ON public.envios_reversa AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY envios_reversa_select_authenticated ON public.envios_reversa AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY envios_reversa_update_authenticated ON public.envios_reversa AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY envios_telegramas_delete_authenticated ON public.envios_telegramas AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY envios_telegramas_insert_authenticated ON public.envios_telegramas AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY envios_telegramas_select_authenticated ON public.envios_telegramas AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY envios_telegramas_update_authenticated ON public.envios_telegramas AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY equipe_administracao_delete_authorized ON public.equipe_administracao_usuarios AS PERMISSIVE FOR DELETE TO authenticated
  USING (painel_has_module(ARRAY['equipe'::text], true));

CREATE POLICY equipe_administracao_insert_authorized ON public.equipe_administracao_usuarios AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (painel_has_module(ARRAY['equipe'::text], true));

CREATE POLICY equipe_administracao_select_authorized ON public.equipe_administracao_usuarios AS PERMISSIVE FOR SELECT TO authenticated
  USING (painel_has_module(ARRAY['equipe'::text], false));

CREATE POLICY equipe_administracao_update_authorized ON public.equipe_administracao_usuarios AS PERMISSIVE FOR UPDATE TO authenticated
  USING (painel_has_module(ARRAY['equipe'::text], true))
  WITH CHECK (painel_has_module(ARRAY['equipe'::text], true));

CREATE POLICY equipe_gestores_regionais_delete_authorized ON public.equipe_gestores_regionais AS PERMISSIVE FOR DELETE TO authenticated
  USING (painel_has_module(ARRAY['equipe'::text], true));

CREATE POLICY equipe_gestores_regionais_insert_authorized ON public.equipe_gestores_regionais AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (painel_has_module(ARRAY['equipe'::text], true));

CREATE POLICY equipe_gestores_regionais_select_authorized ON public.equipe_gestores_regionais AS PERMISSIVE FOR SELECT TO authenticated
  USING (painel_has_module(ARRAY['equipe'::text], false));

CREATE POLICY equipe_gestores_regionais_update_authorized ON public.equipe_gestores_regionais AS PERMISSIVE FOR UPDATE TO authenticated
  USING (painel_has_module(ARRAY['equipe'::text], true))
  WITH CHECK (painel_has_module(ARRAY['equipe'::text], true));

CREATE POLICY "authenticated read excecoes" ON public.excecoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY exportacoes_arquivos_delete_authenticated ON public.exportacoes_arquivos AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY exportacoes_arquivos_insert_authenticated ON public.exportacoes_arquivos AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY exportacoes_arquivos_select_authenticated ON public.exportacoes_arquivos AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY exportacoes_arquivos_update_authenticated ON public.exportacoes_arquivos AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY exportacoes_jobs_delete_authenticated ON public.exportacoes_jobs AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY exportacoes_jobs_insert_authenticated ON public.exportacoes_jobs AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY exportacoes_jobs_select_authenticated ON public.exportacoes_jobs AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY exportacoes_jobs_update_authenticated ON public.exportacoes_jobs AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY faturamento_agenda_all ON public.faturamento_agenda AS PERMISSIVE FOR ALL TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY faturamento_clientes_authenticated_all ON public.faturamento_clientes AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY faturamento_documentos_authenticated_all ON public.faturamento_documentos AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY faturamento_faturas_authenticated_all ON public.faturamento_faturas AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY faturamento_tarifas_authenticated_all ON public.faturamento_tarifas AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY financeiro_adiantamentos_decisoes_delete_authenticated ON public.financeiro_adiantamentos_decisoes AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY financeiro_adiantamentos_decisoes_insert_authenticated ON public.financeiro_adiantamentos_decisoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY financeiro_adiantamentos_decisoes_select_authenticated ON public.financeiro_adiantamentos_decisoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY financeiro_adiantamentos_decisoes_update_authenticated ON public.financeiro_adiantamentos_decisoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can read meal eligibility" ON public.financeiro_alimentacao_colaboradores AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY financeiro_alimentacao_colaboradores_delete_authenticated ON public.financeiro_alimentacao_colaboradores AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY financeiro_alimentacao_colaboradores_insert_authenticated ON public.financeiro_alimentacao_colaboradores AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY financeiro_alimentacao_colaboradores_update_authenticated ON public.financeiro_alimentacao_colaboradores AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY financeiro_pagar_authenticated_all ON public.financeiro_contas_pagar AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY financeiro_receber_authenticated_all ON public.financeiro_contas_receber AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY financeiro_notas_fiscais_resumo_delete_authenticated ON public.financeiro_notas_fiscais_resumo AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY financeiro_notas_fiscais_resumo_insert_authenticated ON public.financeiro_notas_fiscais_resumo AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY financeiro_notas_fiscais_resumo_select_authenticated ON public.financeiro_notas_fiscais_resumo AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY financeiro_notas_fiscais_resumo_update_authenticated ON public.financeiro_notas_fiscais_resumo AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY financeiro_pagamentos_delete_financeiro ON public.financeiro_pagamentos AS PERMISSIVE FOR DELETE TO authenticated
  USING (hospedagem_pode_financeiro(true));

CREATE POLICY financeiro_pagamentos_insert_authorized ON public.financeiro_pagamentos AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((hospedagem_pode_financeiro(true) OR ((origem_setor = 'HOSPEDAGEM'::text) AND hospedagem_pode_operar(true))));

CREATE POLICY financeiro_pagamentos_select_authorized ON public.financeiro_pagamentos AS PERMISSIVE FOR SELECT TO authenticated
  USING ((hospedagem_pode_financeiro(false) OR ((origem_setor = 'HOSPEDAGEM'::text) AND hospedagem_pode_operar(false))));

CREATE POLICY financeiro_pagamentos_update_authorized ON public.financeiro_pagamentos AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((hospedagem_pode_financeiro(true) OR ((origem_setor = 'HOSPEDAGEM'::text) AND hospedagem_pode_operar(true))))
  WITH CHECK ((hospedagem_pode_financeiro(true) OR ((origem_setor = 'HOSPEDAGEM'::text) AND hospedagem_pode_operar(true))));

CREATE POLICY financeiro_pagamentos_execucoes_delete_authenticated ON public.financeiro_pagamentos_execucoes AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY financeiro_pagamentos_execucoes_insert_authenticated ON public.financeiro_pagamentos_execucoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY financeiro_pagamentos_execucoes_select_authenticated ON public.financeiro_pagamentos_execucoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY financeiro_pagamentos_execucoes_update_authenticated ON public.financeiro_pagamentos_execucoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY app_authenticated_all_financeiro_pagamentos_historico ON public.financeiro_pagamentos_historico AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY financeiro_pagamentos_historico_insert_auth ON public.financeiro_pagamentos_historico AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY financeiro_pagamentos_historico_select_auth ON public.financeiro_pagamentos_historico AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY financeiro_pagamentos_linhas_delete_authenticated ON public.financeiro_pagamentos_linhas AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY financeiro_pagamentos_linhas_insert_authenticated ON public.financeiro_pagamentos_linhas AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY financeiro_pagamentos_linhas_select_authenticated ON public.financeiro_pagamentos_linhas AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY financeiro_pagamentos_linhas_update_authenticated ON public.financeiro_pagamentos_linhas AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY financeiro_provisoes_authenticated_all ON public.financeiro_provisoes AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY financeiro_saldos_authenticated_all ON public.financeiro_saldos_dia AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY frota_insert_authenticated ON public.frota_solicitacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY frota_select_authenticated ON public.frota_solicitacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY frotas_bfleet_condutores_fila_delete_authenticated ON public.frotas_bfleet_condutores_fila AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY frotas_bfleet_condutores_fila_insert_authenticated ON public.frotas_bfleet_condutores_fila AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY frotas_bfleet_condutores_fila_select_authenticated ON public.frotas_bfleet_condutores_fila AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY frotas_bfleet_condutores_fila_update_authenticated ON public.frotas_bfleet_condutores_fila AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY frotas_bfleet_diagnostico_select_auth ON public.frotas_bfleet_diagnostico AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY frotas_bfleet_sincronizacoes_select_authenticated ON public.frotas_bfleet_sincronizacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY frotas_bfleet_sync_logs_select_authenticated ON public.frotas_bfleet_sync_logs AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY frotas_checklists_authenticated ON public.frotas_checklists AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY frotas_detran_config_auth_all ON public.frotas_detran_config AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY frotas_excesso_velocidade_authenticated_insert ON public.frotas_excesso_velocidade AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY frotas_excesso_velocidade_authenticated_select ON public.frotas_excesso_velocidade AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY frotas_excesso_velocidade_authenticated_update ON public.frotas_excesso_velocidade AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY frotas_fora_horario_authenticated_insert ON public.frotas_fora_horario AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY frotas_fora_horario_authenticated_select ON public.frotas_fora_horario AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY frotas_fora_horario_authenticated_update ON public.frotas_fora_horario AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY p_gpsocc_ins ON public.frotas_gps_ocorrencias AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY p_gpsocc_sel ON public.frotas_gps_ocorrencias AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY p_gpsocc_upd ON public.frotas_gps_ocorrencias AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY frotas_manutencoes_authenticated ON public.frotas_manutencoes AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY frotas_motoristas_delete_auth ON public.frotas_motoristas AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT auth.uid() AS uid) IS NOT NULL));

CREATE POLICY frotas_motoristas_insert_auth ON public.frotas_motoristas AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));

CREATE POLICY frotas_motoristas_select_auth ON public.frotas_motoristas AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY frotas_motoristas_update_auth ON public.frotas_motoristas AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT auth.uid() AS uid) IS NOT NULL));

CREATE POLICY frotas_multas_auth_all ON public.frotas_multas AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY frotas_multas_insert_auth ON public.frotas_multas AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY frotas_multas_select_auth ON public.frotas_multas AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY frotas_multas_update_auth ON public.frotas_multas AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY p_multacoes_ins ON public.frotas_multas_acoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY p_multacoes_sel ON public.frotas_multas_acoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY frotas_multas_arquivos_auth_all ON public.frotas_multas_arquivos AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY frotas_multas_logs_auth_all ON public.frotas_multas_logs AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY frotas_posicoes_auth_all ON public.frotas_posicoes AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY posicoes_historico_select_auth ON public.frotas_posicoes_historico AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY posicoes_historico_write_auth ON public.frotas_posicoes_historico AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY frotas_print_ocr_insert ON public.frotas_print_ocr_execucoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((painel_has_module(ARRAY['frotas'::text, 'frotas_excesso_velocidade'::text, 'frotas_veiculos'::text, 'frotas_rastreadores'::text], true) AND ((criado_por IS NULL) OR (criado_por = ( SELECT auth.uid() AS uid)))));

CREATE POLICY frotas_print_ocr_select ON public.frotas_print_ocr_execucoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (painel_has_module(ARRAY['frotas'::text, 'frotas_excesso_velocidade'::text, 'frotas_veiculos'::text, 'frotas_rastreadores'::text], false));

CREATE POLICY frotas_print_ocr_update ON public.frotas_print_ocr_execucoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (painel_has_module(ARRAY['frotas'::text, 'frotas_excesso_velocidade'::text, 'frotas_veiculos'::text, 'frotas_rastreadores'::text], true))
  WITH CHECK (painel_has_module(ARRAY['frotas'::text, 'frotas_excesso_velocidade'::text, 'frotas_veiculos'::text, 'frotas_rastreadores'::text], true));

CREATE POLICY frotas_rastreadores_delete_authenticated ON public.frotas_rastreadores AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY frotas_rastreadores_insert_authenticated ON public.frotas_rastreadores AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY frotas_rastreadores_select_authenticated ON public.frotas_rastreadores AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY frotas_rastreadores_update_authenticated ON public.frotas_rastreadores AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Permitir atualizar frotas_rastreadores_removidos" ON public.frotas_rastreadores_removidos AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Permitir deletar frotas_rastreadores_removidos" ON public.frotas_rastreadores_removidos AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY "Permitir inserir frotas_rastreadores_removidos" ON public.frotas_rastreadores_removidos AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Permitir leitura frotas_rastreadores_removidos" ON public.frotas_rastreadores_removidos AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY frotas_rotas_auth_all ON public.frotas_rotas AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY frotas_rotas_paradas_auth_all ON public.frotas_rotas_paradas AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY frotas_sync_logs_select_auth ON public.frotas_sync_logs AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY frotas_trocas_oleo_authenticated ON public.frotas_trocas_oleo AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY frotas_veiculos_delete_auth ON public.frotas_veiculos AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY frotas_veiculos_delete_authenticated ON public.frotas_veiculos AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT auth.uid() AS uid) IS NOT NULL));

CREATE POLICY frotas_veiculos_insert_auth ON public.frotas_veiculos AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY frotas_veiculos_insert_authenticated ON public.frotas_veiculos AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));

CREATE POLICY frotas_veiculos_select_auth ON public.frotas_veiculos AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY frotas_veiculos_select_authenticated ON public.frotas_veiculos AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY frotas_veiculos_update_auth ON public.frotas_veiculos AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY frotas_veiculos_update_authenticated ON public.frotas_veiculos AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT auth.uid() AS uid) IS NOT NULL))
  WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));

CREATE POLICY frotas_veiculos_historico_auth_all ON public.frotas_veiculos_historico AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY geocode_cache_delete_authenticated ON public.geocode_cache AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY geocode_cache_insert_authenticated ON public.geocode_cache AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY geocode_cache_select_authenticated ON public.geocode_cache AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY geocode_cache_update_authenticated ON public.geocode_cache AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY google_contacts_connections_select_own ON public.google_contacts_connections AS PERMISSIVE FOR SELECT TO public
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY google_contacts_jobs_select_own ON public.google_contacts_jobs AS PERMISSIVE FOR SELECT TO public
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY google_contacts_logs_select_own ON public.google_contacts_logs AS PERMISSIVE FOR SELECT TO public
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY google_contacts_map_select_own ON public.google_contacts_map AS PERMISSIVE FOR SELECT TO public
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY google_contacts_sync_jobs_insert_own ON public.google_contacts_sync_jobs AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY google_contacts_sync_jobs_select_own ON public.google_contacts_sync_jobs AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY google_contacts_sync_jobs_update_own ON public.google_contacts_sync_jobs AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY grm_abertura_os_execucoes_select_authenticated ON public.grm_abertura_os_execucoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY grm_adiantamentos_importacoes_delete_authenticated ON public.grm_adiantamentos_importacoes AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY grm_adiantamentos_importacoes_insert_authenticated ON public.grm_adiantamentos_importacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY grm_adiantamentos_importacoes_select_authenticated ON public.grm_adiantamentos_importacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY grm_adiantamentos_importacoes_update_authenticated ON public.grm_adiantamentos_importacoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY grm_auditorias_importacoes_delete_authenticated ON public.grm_auditorias_importacoes AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY grm_auditorias_importacoes_insert_authenticated ON public.grm_auditorias_importacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY grm_auditorias_importacoes_select_authenticated ON public.grm_auditorias_importacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY grm_auditorias_importacoes_update_authenticated ON public.grm_auditorias_importacoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY grm_cargas_importacoes_select_authenticated ON public.grm_cargas_importacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY grm_contas_pagar_importacoes_delete_authenticated ON public.grm_contas_pagar_importacoes AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY grm_contas_pagar_importacoes_insert_authenticated ON public.grm_contas_pagar_importacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY grm_contas_pagar_importacoes_select_authenticated ON public.grm_contas_pagar_importacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY grm_contas_pagar_importacoes_update_authenticated ON public.grm_contas_pagar_importacoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY grm_contas_receber_importacoes_delete_authenticated ON public.grm_contas_receber_importacoes AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY grm_contas_receber_importacoes_insert_authenticated ON public.grm_contas_receber_importacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY grm_contas_receber_importacoes_select_authenticated ON public.grm_contas_receber_importacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY grm_contas_receber_importacoes_update_authenticated ON public.grm_contas_receber_importacoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY grm_despesas_importacoes_delete_authenticated ON public.grm_despesas_importacoes AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY grm_despesas_importacoes_insert_authenticated ON public.grm_despesas_importacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY grm_despesas_importacoes_select_authenticated ON public.grm_despesas_importacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY grm_despesas_importacoes_update_authenticated ON public.grm_despesas_importacoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY grm_distribuicao_os_importacoes_delete_authenticated ON public.grm_distribuicao_os_importacoes AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY grm_distribuicao_os_importacoes_insert_authenticated ON public.grm_distribuicao_os_importacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY grm_distribuicao_os_importacoes_select_authenticated ON public.grm_distribuicao_os_importacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY grm_distribuicao_os_importacoes_update_authenticated ON public.grm_distribuicao_os_importacoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY grm_lista_os_importacoes_delete_authenticated ON public.grm_lista_os_importacoes AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY grm_lista_os_importacoes_insert_authenticated ON public.grm_lista_os_importacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY grm_lista_os_importacoes_select_authenticated ON public.grm_lista_os_importacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY grm_lista_os_importacoes_update_authenticated ON public.grm_lista_os_importacoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY grm_locais_embarque_importacoes_delete_authenticated ON public.grm_locais_embarque_importacoes AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY grm_locais_embarque_importacoes_insert_authenticated ON public.grm_locais_embarque_importacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY grm_locais_embarque_importacoes_select_authenticated ON public.grm_locais_embarque_importacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY grm_locais_embarque_importacoes_update_authenticated ON public.grm_locais_embarque_importacoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can read login agent runs" ON public.grm_login_alimentacao_execucoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated can read GRM login movements" ON public.grm_login_movimentos_importacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY grm_mapa_embarque_importacoes_delete_authenticated ON public.grm_mapa_embarque_importacoes AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY grm_mapa_embarque_importacoes_insert_authenticated ON public.grm_mapa_embarque_importacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY grm_mapa_embarque_importacoes_select_authenticated ON public.grm_mapa_embarque_importacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY grm_mapa_embarque_importacoes_update_authenticated ON public.grm_mapa_embarque_importacoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Leitura autenticada execucoes NF" ON public.grm_nf_lancamento_execucoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Cancelar lancamento NF" ON public.grm_nf_lancamentos AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((status <> ALL (ARRAY['LANCADO'::text, 'CANCELADO'::text])))
  WITH CHECK ((status = 'CANCELADO'::text));

CREATE POLICY "Leitura autenticada lancamentos NF" ON public.grm_nf_lancamentos AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Relancar lancamento NF com erro" ON public.grm_nf_lancamentos AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((status = 'ERRO'::text))
  WITH CHECK ((status = 'NOVO'::text));

CREATE POLICY "Upload autenticado lancamentos NF" ON public.grm_nf_lancamentos AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((enviado_por = auth.uid()));

CREATE POLICY grm_nhe_importacoes_delete_authenticated ON public.grm_nhe_importacoes AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY grm_nhe_importacoes_insert_authenticated ON public.grm_nhe_importacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY grm_nhe_importacoes_select_authenticated ON public.grm_nhe_importacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY grm_nhe_importacoes_update_authenticated ON public.grm_nhe_importacoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY grm_notas_fiscais_importacoes_delete_authenticated ON public.grm_notas_fiscais_importacoes AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY grm_notas_fiscais_importacoes_insert_authenticated ON public.grm_notas_fiscais_importacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY grm_notas_fiscais_importacoes_select_authenticated ON public.grm_notas_fiscais_importacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY grm_notas_fiscais_importacoes_update_authenticated ON public.grm_notas_fiscais_importacoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY grm_patrimonios_importacoes_delete_authenticated ON public.grm_patrimonios_importacoes AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY grm_patrimonios_importacoes_insert_authenticated ON public.grm_patrimonios_importacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY grm_patrimonios_importacoes_select_authenticated ON public.grm_patrimonios_importacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY grm_patrimonios_importacoes_update_authenticated ON public.grm_patrimonios_importacoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY grm_producao_diaria_importacoes_delete_authenticated ON public.grm_producao_diaria_importacoes AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY grm_producao_diaria_importacoes_insert_authenticated ON public.grm_producao_diaria_importacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY grm_producao_diaria_importacoes_select_authenticated ON public.grm_producao_diaria_importacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY grm_producao_diaria_importacoes_update_authenticated ON public.grm_producao_diaria_importacoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY grm_resultado_diario_importacoes_delete_authenticated ON public.grm_resultado_diario_importacoes AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY grm_resultado_diario_importacoes_insert_authenticated ON public.grm_resultado_diario_importacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY grm_resultado_diario_importacoes_select_authenticated ON public.grm_resultado_diario_importacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY grm_resultado_diario_importacoes_update_authenticated ON public.grm_resultado_diario_importacoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY grm_sync_agent_settings_select_ti ON public.grm_sync_agent_settings AS PERMISSIVE FOR SELECT TO authenticated
  USING (painel_has_module(ARRAY['TI_AGENTES'::text, 'TI'::text], false));

CREATE POLICY grm_sync_agent_settings_update_ti ON public.grm_sync_agent_settings AS PERMISSIVE FOR UPDATE TO authenticated
  USING (painel_has_module(ARRAY['TI_AGENTES'::text, 'TI'::text], true))
  WITH CHECK (painel_has_module(ARRAY['TI_AGENTES'::text, 'TI'::text], true));

CREATE POLICY grm_sync_jobs_insert_authenticated ON public.grm_sync_jobs AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY grm_sync_jobs_select_authenticated ON public.grm_sync_jobs AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY grm_sync_lanes_select_ti ON public.grm_sync_lanes AS PERMISSIVE FOR SELECT TO authenticated
  USING (painel_has_module(ARRAY['TI_AGENTES'::text, 'TI'::text], false));

CREATE POLICY grm_sync_runtime_policy_select_ti ON public.grm_sync_runtime_policy AS PERMISSIVE FOR SELECT TO authenticated
  USING (painel_has_module(ARRAY['TI_AGENTES'::text, 'TI'::text], false));

CREATE POLICY historico_colaboradores_authenticated_all ON public.historico_colaboradores AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY historico_colaboradores_delete_authenticated ON public.historico_colaboradores AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY historico_colaboradores_insert_authenticated ON public.historico_colaboradores AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY historico_colaboradores_select_authenticated ON public.historico_colaboradores AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY historico_colaboradores_update_authenticated ON public.historico_colaboradores AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY hospedagem_adiantamento_movimentos_select_authorized ON public.hospedagem_adiantamento_movimentos AS PERMISSIVE FOR SELECT TO authenticated
  USING ((hospedagem_pode_operar(false) OR hospedagem_pode_financeiro(false)));

CREATE POLICY hospedagem_adiantamento_movimentos_write_financeiro ON public.hospedagem_adiantamento_movimentos AS PERMISSIVE FOR ALL TO authenticated
  USING (hospedagem_pode_financeiro(true))
  WITH CHECK (hospedagem_pode_financeiro(true));

CREATE POLICY hospedagem_adiantamento_movimentos_write_hotel ON public.hospedagem_adiantamento_movimentos AS PERMISSIVE FOR ALL TO authenticated
  USING (hospedagem_pode_operar(true))
  WITH CHECK (hospedagem_pode_operar(true));

CREATE POLICY hospedagem_adiantamentos_select_authorized ON public.hospedagem_adiantamentos AS PERMISSIVE FOR SELECT TO authenticated
  USING ((hospedagem_pode_operar(false) OR hospedagem_pode_financeiro(false)));

CREATE POLICY hospedagem_adiantamentos_write_financeiro ON public.hospedagem_adiantamentos AS PERMISSIVE FOR ALL TO authenticated
  USING (hospedagem_pode_financeiro(true))
  WITH CHECK (hospedagem_pode_financeiro(true));

CREATE POLICY hospedagem_adiantamentos_write_hotel ON public.hospedagem_adiantamentos AS PERMISSIVE FOR ALL TO authenticated
  USING (hospedagem_pode_operar(true))
  WITH CHECK (hospedagem_pode_operar(true));

CREATE POLICY hospedagem_alojamentos_select_authorized ON public.hospedagem_alojamentos AS PERMISSIVE FOR SELECT TO authenticated
  USING ((hospedagem_pode_operar(false) OR hospedagem_pode_financeiro(false)));

CREATE POLICY hospedagem_alojamentos_write_authorized ON public.hospedagem_alojamentos AS PERMISSIVE FOR ALL TO authenticated
  USING (hospedagem_pode_operar(true))
  WITH CHECK (hospedagem_pode_operar(true));

CREATE POLICY hospedagem_anexos_select_authorized ON public.hospedagem_anexos AS PERMISSIVE FOR SELECT TO authenticated
  USING ((hospedagem_pode_operar(false) OR hospedagem_pode_financeiro(false)));

CREATE POLICY hospedagem_anexos_write_authorized ON public.hospedagem_anexos AS PERMISSIVE FOR ALL TO authenticated
  USING (hospedagem_pode_operar(true))
  WITH CHECK (hospedagem_pode_operar(true));

CREATE POLICY hospedagem_checkout_lote_colaboradores_select_authorized ON public.hospedagem_checkout_lote_colaboradores AS PERMISSIVE FOR SELECT TO authenticated
  USING ((hospedagem_pode_operar(false) OR hospedagem_pode_financeiro(false)));

CREATE POLICY hospedagem_checkout_lote_colaboradores_write_hotel ON public.hospedagem_checkout_lote_colaboradores AS PERMISSIVE FOR ALL TO authenticated
  USING (hospedagem_pode_operar(true))
  WITH CHECK (hospedagem_pode_operar(true));

CREATE POLICY hospedagem_checkout_lotes_select_authorized ON public.hospedagem_checkout_lotes AS PERMISSIVE FOR SELECT TO authenticated
  USING ((hospedagem_pode_operar(false) OR hospedagem_pode_financeiro(false)));

CREATE POLICY hospedagem_checkout_lotes_write_financeiro ON public.hospedagem_checkout_lotes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (hospedagem_pode_financeiro(true))
  WITH CHECK (hospedagem_pode_financeiro(true));

CREATE POLICY hospedagem_checkout_lotes_write_hotel ON public.hospedagem_checkout_lotes AS PERMISSIVE FOR ALL TO authenticated
  USING (hospedagem_pode_operar(true))
  WITH CHECK (hospedagem_pode_operar(true));

CREATE POLICY hospedagem_cotacoes_select_authorized ON public.hospedagem_cotacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING ((hospedagem_pode_operar(false) OR hospedagem_pode_financeiro(false)));

CREATE POLICY hospedagem_cotacoes_write_hotel ON public.hospedagem_cotacoes AS PERMISSIVE FOR ALL TO authenticated
  USING (hospedagem_pode_operar(true))
  WITH CHECK (hospedagem_pode_operar(true));

CREATE POLICY hospedagem_custos_extras_select_authorized ON public.hospedagem_custos_extras AS PERMISSIVE FOR SELECT TO authenticated
  USING ((hospedagem_pode_operar(false) OR hospedagem_pode_financeiro(false)));

CREATE POLICY hospedagem_custos_extras_write_hotel ON public.hospedagem_custos_extras AS PERMISSIVE FOR ALL TO authenticated
  USING (hospedagem_pode_operar(true))
  WITH CHECK (hospedagem_pode_operar(true));

CREATE POLICY hospedagem_diferencas_colaborador_select_authorized ON public.hospedagem_diferencas_colaborador AS PERMISSIVE FOR SELECT TO authenticated
  USING ((hospedagem_pode_operar(false) OR hospedagem_pode_financeiro(false)));

CREATE POLICY hospedagem_diferencas_colaborador_write_hotel ON public.hospedagem_diferencas_colaborador AS PERMISSIVE FOR ALL TO authenticated
  USING (hospedagem_pode_operar(true))
  WITH CHECK (hospedagem_pode_operar(true));

CREATE POLICY hospedagem_documentos_select_authorized ON public.hospedagem_documentos AS PERMISSIVE FOR SELECT TO authenticated
  USING ((hospedagem_pode_operar(false) OR hospedagem_pode_financeiro(false)));

CREATE POLICY hospedagem_documentos_write_hotel ON public.hospedagem_documentos AS PERMISSIVE FOR ALL TO authenticated
  USING (hospedagem_pode_operar(true))
  WITH CHECK (hospedagem_pode_operar(true));

CREATE POLICY hospedagem_eventos_insert_own ON public.hospedagem_eventos AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM hospedagem_solicitacoes s
  WHERE ((s.id = hospedagem_eventos.solicitacao_id) AND ((s.created_by = ( SELECT auth.uid() AS uid)) OR (s.solicitante_id = ( SELECT auth.uid() AS uid)))))));

CREATE POLICY hospedagem_eventos_select_authorized ON public.hospedagem_eventos AS PERMISSIVE FOR SELECT TO authenticated
  USING ((hospedagem_pode_operar(false) OR hospedagem_pode_financeiro(false)));

CREATE POLICY hospedagem_eventos_write_hotel ON public.hospedagem_eventos AS PERMISSIVE FOR ALL TO authenticated
  USING (hospedagem_pode_operar(true))
  WITH CHECK (hospedagem_pode_operar(true));

CREATE POLICY hospedagem_financeiro_select_authorized ON public.hospedagem_financeiro AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT hospedagem_pode_operar(false) AS hospedagem_pode_operar) OR ( SELECT hospedagem_pode_financeiro(false) AS hospedagem_pode_financeiro)));

CREATE POLICY hospedagem_financeiro_write_financeiro ON public.hospedagem_financeiro AS PERMISSIVE FOR UPDATE TO authenticated
  USING (( SELECT hospedagem_pode_financeiro(true) AS hospedagem_pode_financeiro))
  WITH CHECK (( SELECT hospedagem_pode_financeiro(true) AS hospedagem_pode_financeiro));

CREATE POLICY hospedagem_financeiro_write_hotel ON public.hospedagem_financeiro AS PERMISSIVE FOR ALL TO authenticated
  USING (( SELECT hospedagem_pode_operar(true) AS hospedagem_pode_operar))
  WITH CHECK (( SELECT hospedagem_pode_operar(true) AS hospedagem_pode_operar));

CREATE POLICY hospedagem_historico_colaboradores_select_authorized ON public.hospedagem_historico_colaboradores AS PERMISSIVE FOR SELECT TO authenticated
  USING ((hospedagem_pode_operar(false) OR hospedagem_pode_financeiro(false)));

CREATE POLICY hospedagem_historico_colaboradores_write_authorized ON public.hospedagem_historico_colaboradores AS PERMISSIVE FOR ALL TO authenticated
  USING (hospedagem_pode_operar(true))
  WITH CHECK (hospedagem_pode_operar(true));

CREATE POLICY hospedagem_hoteis_select_authorized ON public.hospedagem_hoteis AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT hospedagem_pode_operar(false) AS hospedagem_pode_operar) OR ( SELECT hospedagem_pode_financeiro(false) AS hospedagem_pode_financeiro)));

CREATE POLICY hospedagem_hoteis_write_hotel ON public.hospedagem_hoteis AS PERMISSIVE FOR ALL TO authenticated
  USING (( SELECT hospedagem_pode_operar(true) AS hospedagem_pode_operar))
  WITH CHECK (( SELECT hospedagem_pode_operar(true) AS hospedagem_pode_operar));

CREATE POLICY hospedagem_mensagens_select_authorized ON public.hospedagem_mensagens AS PERMISSIVE FOR SELECT TO authenticated
  USING ((hospedagem_pode_operar(false) OR hospedagem_pode_financeiro(false)));

CREATE POLICY hospedagem_mensagens_write_hotel ON public.hospedagem_mensagens AS PERMISSIVE FOR ALL TO authenticated
  USING (hospedagem_pode_operar(true))
  WITH CHECK (hospedagem_pode_operar(true));

CREATE POLICY hospedagem_notas_select_authorized ON public.hospedagem_notas AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT hospedagem_pode_operar(false) AS hospedagem_pode_operar) OR ( SELECT hospedagem_pode_financeiro(false) AS hospedagem_pode_financeiro)));

CREATE POLICY hospedagem_notas_write_authorized ON public.hospedagem_notas AS PERMISSIVE FOR ALL TO authenticated
  USING (( SELECT hospedagem_pode_operar(true) AS hospedagem_pode_operar))
  WITH CHECK (( SELECT hospedagem_pode_operar(true) AS hospedagem_pode_operar));

CREATE POLICY hospedagem_producao_diarias_select_authorized ON public.hospedagem_producao_diarias AS PERMISSIVE FOR SELECT TO authenticated
  USING ((hospedagem_pode_operar(false) OR hospedagem_pode_financeiro(false)));

CREATE POLICY hospedagem_producao_diarias_write_authorized ON public.hospedagem_producao_diarias AS PERMISSIVE FOR ALL TO authenticated
  USING (hospedagem_pode_operar(true))
  WITH CHECK (hospedagem_pode_operar(true));

CREATE POLICY hospedagem_reserva_colaboradores_select_authorized ON public.hospedagem_reserva_colaboradores AS PERMISSIVE FOR SELECT TO authenticated
  USING ((hospedagem_pode_operar(false) OR hospedagem_pode_financeiro(false)));

CREATE POLICY hospedagem_reserva_colaboradores_write_hotel ON public.hospedagem_reserva_colaboradores AS PERMISSIVE FOR ALL TO authenticated
  USING (hospedagem_pode_operar(true))
  WITH CHECK (hospedagem_pode_operar(true));

CREATE POLICY hospedagem_reserva_quartos_select_authorized ON public.hospedagem_reserva_quartos AS PERMISSIVE FOR SELECT TO authenticated
  USING ((hospedagem_pode_operar(false) OR hospedagem_pode_financeiro(false)));

CREATE POLICY hospedagem_reserva_quartos_write_hotel ON public.hospedagem_reserva_quartos AS PERMISSIVE FOR ALL TO authenticated
  USING (hospedagem_pode_operar(true))
  WITH CHECK (hospedagem_pode_operar(true));

CREATE POLICY hospedagem_reserva_solicitacoes_select_authorized ON public.hospedagem_reserva_solicitacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING ((hospedagem_pode_operar(false) OR hospedagem_pode_financeiro(false)));

CREATE POLICY hospedagem_reserva_solicitacoes_write_hotel ON public.hospedagem_reserva_solicitacoes AS PERMISSIVE FOR ALL TO authenticated
  USING (hospedagem_pode_operar(true))
  WITH CHECK (hospedagem_pode_operar(true));

CREATE POLICY hospedagem_reservas_select_authorized ON public.hospedagem_reservas AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT hospedagem_pode_operar(false) AS hospedagem_pode_operar) OR ( SELECT hospedagem_pode_financeiro(false) AS hospedagem_pode_financeiro)));

CREATE POLICY hospedagem_reservas_write_hotel ON public.hospedagem_reservas AS PERMISSIVE FOR ALL TO authenticated
  USING (( SELECT hospedagem_pode_operar(true) AS hospedagem_pode_operar))
  WITH CHECK (( SELECT hospedagem_pode_operar(true) AS hospedagem_pode_operar));

CREATE POLICY hospedagem_colaboradores_select_authorized ON public.hospedagem_solicitacao_colaboradores AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT hospedagem_pode_operar(false) AS hospedagem_pode_operar) OR (EXISTS ( SELECT 1
   FROM hospedagem_solicitacoes s
  WHERE ((s.id = hospedagem_solicitacao_colaboradores.solicitacao_id) AND ((s.created_by = ( SELECT auth.uid() AS uid)) OR (s.solicitante_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY hospedagem_colaboradores_write_authorized ON public.hospedagem_solicitacao_colaboradores AS PERMISSIVE FOR ALL TO authenticated
  USING ((( SELECT hospedagem_pode_operar(true) AS hospedagem_pode_operar) OR (EXISTS ( SELECT 1
   FROM hospedagem_solicitacoes s
  WHERE ((s.id = hospedagem_solicitacao_colaboradores.solicitacao_id) AND ((s.created_by = ( SELECT auth.uid() AS uid)) OR (s.solicitante_id = ( SELECT auth.uid() AS uid))))))))
  WITH CHECK ((( SELECT hospedagem_pode_operar(true) AS hospedagem_pode_operar) OR (EXISTS ( SELECT 1
   FROM hospedagem_solicitacoes s
  WHERE ((s.id = hospedagem_solicitacao_colaboradores.solicitacao_id) AND ((s.created_by = ( SELECT auth.uid() AS uid)) OR (s.solicitante_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY hospedagem_solicitacoes_insert_own ON public.hospedagem_solicitacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT hospedagem_pode_operar(true) AS hospedagem_pode_operar) OR (COALESCE(created_by, solicitante_id) = ( SELECT auth.uid() AS uid))));

CREATE POLICY hospedagem_solicitacoes_select_authorized ON public.hospedagem_solicitacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT hospedagem_pode_operar(false) AS hospedagem_pode_operar) OR (created_by = ( SELECT auth.uid() AS uid)) OR (solicitante_id = ( SELECT auth.uid() AS uid))));

CREATE POLICY hospedagem_solicitacoes_update_authorized ON public.hospedagem_solicitacoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT hospedagem_pode_operar(true) AS hospedagem_pode_operar) OR (created_by = ( SELECT auth.uid() AS uid)) OR (solicitante_id = ( SELECT auth.uid() AS uid))))
  WITH CHECK ((( SELECT hospedagem_pode_operar(true) AS hospedagem_pode_operar) OR (created_by = ( SELECT auth.uid() AS uid)) OR (solicitante_id = ( SELECT auth.uid() AS uid))));

CREATE POLICY p_import_ins ON public.importacoes_registros AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY p_import_sel ON public.importacoes_registros AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated insert indisponibilidades" ON public.indisponibilidades AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) = created_by));

CREATE POLICY "authenticated read indisponibilidades" ON public.indisponibilidades AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "liberado geral indisponibilidades" ON public.indisponibilidades AS PERMISSIVE FOR ALL TO public
  USING (true);

CREATE POLICY abertura_os_authenticated_all ON public.logistica_abertura_os AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY p_log_ajcfg_ins ON public.logistica_ajuste_config AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY p_log_ajcfg_sel ON public.logistica_ajuste_config AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY p_log_ajcfg_upd ON public.logistica_ajuste_config AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY p_log_ajuste_ins ON public.logistica_ajustes_saldo AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY p_log_ajuste_sel ON public.logistica_ajustes_saldo AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY p_log_ajuste_upd ON public.logistica_ajustes_saldo AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY logistica_alertas_delete_authenticated ON public.logistica_alertas AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY logistica_alertas_insert_authenticated ON public.logistica_alertas AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY logistica_alertas_select_authenticated ON public.logistica_alertas AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY logistica_alertas_update_authenticated ON public.logistica_alertas AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY btg_ajustes_insert ON public.logistica_btg_ajustes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY btg_ajustes_select ON public.logistica_btg_ajustes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY btg_ajustes_update ON public.logistica_btg_ajustes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY btg_distribuicao_delete ON public.logistica_btg_distribuicao AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY btg_distribuicao_insert ON public.logistica_btg_distribuicao AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY btg_distribuicao_select ON public.logistica_btg_distribuicao AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY btg_distribuicao_update ON public.logistica_btg_distribuicao AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY logistica_btg_lista_os_delete_authenticated ON public.logistica_btg_lista_os AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY logistica_btg_lista_os_insert_authenticated ON public.logistica_btg_lista_os AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY logistica_btg_lista_os_select_authenticated ON public.logistica_btg_lista_os AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY logistica_btg_lista_os_update_authenticated ON public.logistica_btg_lista_os AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY btg_solicitacoes_delete ON public.logistica_btg_solicitacoes AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY btg_solicitacoes_insert ON public.logistica_btg_solicitacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY btg_solicitacoes_select ON public.logistica_btg_solicitacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY btg_solicitacoes_update ON public.logistica_btg_solicitacoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY logistica_cargas_irreg_select_authenticated ON public.logistica_cargas_irregularidades AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY logistica_cargas_exec_select_authenticated ON public.logistica_cargas_monitor_execucoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY p_log_class_ins ON public.logistica_classificadores_monitor AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY p_log_class_sel ON public.logistica_classificadores_monitor AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY p_log_class_upd ON public.logistica_classificadores_monitor AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY logistica_clientes_anexo_regras_all ON public.logistica_clientes_anexo_regras AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY logistica_clientes_anexo_regras_select ON public.logistica_clientes_anexo_regras AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY logistica_clientes_contrato_regras_all ON public.logistica_clientes_contrato_regras AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY logistica_clientes_contrato_regras_select ON public.logistica_clientes_contrato_regras AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY logistica_clientes_nacionais_aliases_select_auth ON public.logistica_clientes_nacionais_aliases AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY p_log_conf_ins ON public.logistica_conferencias AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY p_log_conf_sel ON public.logistica_conferencias AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY p_log_conf_upd ON public.logistica_conferencias AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY p_log_exp_ins ON public.logistica_exportacoes_historico AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY p_log_exp_sel ON public.logistica_exportacoes_historico AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY fob_authenticated_all ON public.logistica_fob AS PERMISSIVE FOR ALL TO public
  USING ((( SELECT auth.role() AS role) = 'authenticated'::text))
  WITH CHECK ((( SELECT auth.role() AS role) = 'authenticated'::text));

CREATE POLICY p_log_inf_ins ON public.logistica_informativos_geracoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY p_log_inf_sel ON public.logistica_informativos_geracoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY logistica_nhe_lancamentos_auto_select_authenticated ON public.logistica_nhe_lancamentos_auto AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY logistica_nhe_lancamentos_execucoes_select_authenticated ON public.logistica_nhe_lancamentos_execucoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY logistica_ocr_jobs_select_own ON public.logistica_ocr_jobs AS PERMISSIVE FOR SELECT TO authenticated
  USING ((auth.uid() = request_user_id));

CREATE POLICY logistica_ocr_workers_select ON public.logistica_ocr_workers AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY logistica_pre_conferencia_insert ON public.logistica_pre_conferencia_os AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((auth.uid() = criado_por) OR (criado_por IS NULL)));

CREATE POLICY logistica_pre_conferencia_select ON public.logistica_pre_conferencia_os AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY logistica_pre_conferencia_update ON public.logistica_pre_conferencia_os AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (((auth.uid() = atualizado_por) OR (atualizado_por IS NULL)));

CREATE POLICY logistica_relatorios_destinatarios_delete_authenticated ON public.logistica_relatorios_destinatarios AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY logistica_relatorios_destinatarios_insert_authenticated ON public.logistica_relatorios_destinatarios AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY logistica_relatorios_destinatarios_select_authenticated ON public.logistica_relatorios_destinatarios AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY logistica_relatorios_destinatarios_update_authenticated ON public.logistica_relatorios_destinatarios AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY logistica_relatorios_envios_delete_authenticated ON public.logistica_relatorios_envios AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY logistica_relatorios_envios_insert_authenticated ON public.logistica_relatorios_envios AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY logistica_relatorios_envios_select_authenticated ON public.logistica_relatorios_envios AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY logistica_relatorios_envios_update_authenticated ON public.logistica_relatorios_envios AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated delete logistica_solicitacoes" ON public.logistica_solicitacoes AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY "authenticated insert logistica_solicitacoes" ON public.logistica_solicitacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((( SELECT auth.uid() AS uid) = created_by) OR (created_by IS NULL)));

CREATE POLICY "authenticated read logistica_solicitacoes" ON public.logistica_solicitacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated update logistica_solicitacoes" ON public.logistica_solicitacoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY metas_auditoria_insert_authenticated ON public.metas_auditoria AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY metas_auditoria_select_authenticated ON public.metas_auditoria AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY metas_auditoria_update_authenticated ON public.metas_auditoria AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY custo_modify ON public.metas_custo_regional AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY custo_select ON public.metas_custo_regional AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY gestores_modify ON public.metas_gestores AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY gestores_select ON public.metas_gestores AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY authenticated_all_metas_producao ON public.metas_producao AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated read modules" ON public.modules AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY p_nf_catcor_ins ON public.nf_categorizacao_correcoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY p_nf_catcor_sel ON public.nf_categorizacao_correcoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY p_nf_ocr_ins ON public.nf_ocr_fila AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY p_nf_ocr_sel ON public.nf_ocr_fila AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY p_nf_ocr_upd ON public.nf_ocr_fila AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY notifications_delete_authenticated ON public.notifications AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY notifications_insert_authenticated ON public.notifications AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY notifications_select_authenticated ON public.notifications AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY notifications_update_authenticated ON public.notifications AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY operacional_auditoria_auth_all ON public.operacional_auditoria_colaborador AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY operacional_auditoria_colaborador_auth_all ON public.operacional_auditoria_colaborador AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY operacional_colaborador_auth_all ON public.operacional_colaborador_base AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY operacional_colaborador_base_auth_all ON public.operacional_colaborador_base AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY operacional_colaboradores_base_delete_authenticated ON public.operacional_colaboradores_base AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY operacional_colaboradores_base_insert_authenticated ON public.operacional_colaboradores_base AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY operacional_colaboradores_base_select_authenticated ON public.operacional_colaboradores_base AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY operacional_colaboradores_base_update_authenticated ON public.operacional_colaboradores_base AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY operacional_embarques_auth_all ON public.operacional_embarques AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY operacional_hoteis_auth_all ON public.operacional_hoteis AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY operacional_laudos_insert_auth ON public.operacional_laudos AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY operacional_laudos_select_auth ON public.operacional_laudos AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY operacional_laudos_update_auth ON public.operacional_laudos AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY mapa_rotas_select_auth ON public.operacional_mapa_rotas AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY mapa_rotas_write_auth ON public.operacional_mapa_rotas AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY mapa_rotas_paradas_select_auth ON public.operacional_mapa_rotas_paradas AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY mapa_rotas_paradas_write_auth ON public.operacional_mapa_rotas_paradas AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY operacional_os_delete_authenticated ON public.operacional_os AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY operacional_os_insert_authenticated ON public.operacional_os AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY operacional_os_select_authenticated ON public.operacional_os AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY operacional_os_update_authenticated ON public.operacional_os AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY operacional_os_colaboradores_delete_authenticated ON public.operacional_os_colaboradores AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY operacional_os_colaboradores_insert_authenticated ON public.operacional_os_colaboradores AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY operacional_os_colaboradores_select_authenticated ON public.operacional_os_colaboradores AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY operacional_os_colaboradores_update_authenticated ON public.operacional_os_colaboradores AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY p_os_dist_ins ON public.operacional_os_distribuicao AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY p_os_dist_sel ON public.operacional_os_distribuicao AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY operacional_passagens_auth_all ON public.operacional_passagens_cache AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY operacional_passagens_cache_auth_all ON public.operacional_passagens_cache AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY operacional_pontos_embarque_auth_all ON public.operacional_pontos_embarque AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY operacional_simulacoes_auth_all ON public.operacional_simulacoes AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY ouro_safra_classificacao_execucoes_select_authenticated ON public.ouro_safra_classificacao_execucoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY notif_insert_authenticated ON public.painel_notificacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY notif_select_authenticated ON public.painel_notificacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY notif_update_authenticated ON public.painel_notificacoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY notif_usr_insert ON public.painel_notificacoes_usuarios AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((usuario_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY notif_usr_master_select ON public.painel_notificacoes_usuarios AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (app_usuarios u
     JOIN app_perfis p ON ((p.id = u.perfil_id)))
  WHERE ((u.auth_user_id = ( SELECT auth.uid() AS uid)) AND (upper(p.codigo) = 'MASTER'::text)))));

CREATE POLICY notif_usr_select ON public.painel_notificacoes_usuarios AS PERMISSIVE FOR SELECT TO authenticated
  USING ((usuario_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY notif_usr_update ON public.painel_notificacoes_usuarios AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((usuario_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "authenticated delete patrimonio_solicitacoes" ON public.patrimonio_solicitacoes AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY "authenticated insert patrimonio_solicitacoes" ON public.patrimonio_solicitacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((( SELECT auth.uid() AS uid) = created_by) OR (created_by IS NULL)));

CREATE POLICY "authenticated read patrimonio_solicitacoes" ON public.patrimonio_solicitacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated update patrimonio_solicitacoes" ON public.patrimonio_solicitacoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY patrimonios_historico_insert_authenticated ON public.patrimonios_historico AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY patrimonios_historico_select_authenticated ON public.patrimonios_historico AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY patrimonios_historico_insert_authenticated ON public.patrimonios_historico_leituras AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY patrimonios_historico_leituras_authenticated_all ON public.patrimonios_historico_leituras AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY patrimonios_historico_select_authenticated ON public.patrimonios_historico_leituras AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY patrimonios_historico_update_authenticated ON public.patrimonios_historico_leituras AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY patrimonios_importacoes_insert_authenticated ON public.patrimonios_importacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY patrimonios_importacoes_select_authenticated ON public.patrimonios_importacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY patrimonios_importacoes_update_authenticated ON public.patrimonios_importacoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY p_patmov_ins ON public.patrimonios_movimentacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY p_patmov_sel ON public.patrimonios_movimentacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY patrimonios_snapshot_insert_authenticated ON public.patrimonios_snapshot AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY patrimonios_snapshot_select_authenticated ON public.patrimonios_snapshot AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY patrimonios_snapshot_update_authenticated ON public.patrimonios_snapshot AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated insert producao_importacoes" ON public.producao_importacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) = importado_por));

CREATE POLICY "authenticated read producao_importacoes" ON public.producao_importacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated update producao_importacoes" ON public.producao_importacoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "liberado geral" ON public.producao_importacoes AS PERMISSIVE FOR ALL TO public
  USING (true);

CREATE POLICY "authenticated insert producao_snapshot" ON public.producao_snapshot AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated read producao_snapshot" ON public.producao_snapshot AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "liberado geral" ON public.producao_snapshot AS PERMISSIVE FOR ALL TO public
  USING (true);

CREATE POLICY "users read own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT auth.uid() AS uid) = id));

CREATE POLICY "users update own profile basic" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT auth.uid() AS uid) = id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = id));

CREATE POLICY programacao_delete_authenticated ON public.programacao AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY programacao_insert_authenticated ON public.programacao AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY programacao_select_authenticated ON public.programacao AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY programacao_update_authenticated ON public.programacao AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY programacao_alimentacao_auth_all ON public.programacao_alimentacao AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY programacao_insert_authenticated ON public.programacao_colaborador AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY programacao_select_authenticated ON public.programacao_colaborador AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY programacao_update_authenticated ON public.programacao_colaborador AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY programacao_colaboradores_auth_all ON public.programacao_colaboradores AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY programacao_conferencia_status_delete_authenticated ON public.programacao_conferencia_status AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT auth.uid() AS uid) IS NOT NULL));

CREATE POLICY programacao_conferencia_status_insert_authenticated ON public.programacao_conferencia_status AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));

CREATE POLICY programacao_conferencia_status_select_authenticated ON public.programacao_conferencia_status AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT auth.uid() AS uid) IS NOT NULL));

CREATE POLICY programacao_conferencia_status_update_authenticated ON public.programacao_conferencia_status AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT auth.uid() AS uid) IS NOT NULL))
  WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));

CREATE POLICY "authenticated insert programacao_contextos" ON public.programacao_contextos AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((( SELECT auth.uid() AS uid) = created_by) OR (created_by IS NULL)));

CREATE POLICY "authenticated read programacao_contextos" ON public.programacao_contextos AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated update programacao_contextos" ON public.programacao_contextos AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY programacao_deslocamento_auth_all ON public.programacao_deslocamento AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY programacao_despesas_delete_authenticated ON public.programacao_despesas AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY programacao_despesas_insert_authenticated ON public.programacao_despesas AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY programacao_despesas_select_authenticated ON public.programacao_despesas AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY programacao_despesas_update_authenticated ON public.programacao_despesas AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY programacao_despesas_hist_delete_authenticated ON public.programacao_despesas_hist AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY programacao_despesas_hist_insert_authenticated ON public.programacao_despesas_hist AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY programacao_despesas_hist_select_authenticated ON public.programacao_despesas_hist AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY programacao_despesas_hist_update_authenticated ON public.programacao_despesas_hist AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY programacao_dia_auth_all ON public.programacao_dia AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY programacao_distribuicao_agendada_select_authenticated ON public.programacao_distribuicao_agendada AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY programacao_encaminhamentos_delete_authenticated ON public.programacao_encaminhamentos AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY programacao_encaminhamentos_insert_authenticated ON public.programacao_encaminhamentos AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY programacao_encaminhamentos_select_authenticated ON public.programacao_encaminhamentos AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY programacao_encaminhamentos_update_authenticated ON public.programacao_encaminhamentos AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY programacao_equipe_auth_all ON public.programacao_equipe AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY programacao_estadia_auth_all ON public.programacao_estadia AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY programacao_extras_auth_all ON public.programacao_extras AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY programacao_frota_vinculos_rw ON public.programacao_frota_vinculos AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY programacao_hist_delete_authenticated ON public.programacao_hist AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY programacao_hist_insert_authenticated ON public.programacao_hist AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY programacao_hist_select_authenticated ON public.programacao_hist AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY programacao_hist_update_authenticated ON public.programacao_hist AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY programacao_inativacao_solicitacoes_auth_all ON public.programacao_inativacao_solicitacoes AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY programacao_indisponibilidade_informados_authenticated_all ON public.programacao_indisponibilidade_informados AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated delete programacao_itens" ON public.programacao_itens AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY "authenticated insert programacao_itens" ON public.programacao_itens AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated read programacao_itens" ON public.programacao_itens AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated update programacao_itens" ON public.programacao_itens AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY recusas_respostas_select_auth ON public.programacao_recusas_respostas AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY recusas_respostas_write_auth ON public.programacao_recusas_respostas AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY programacao_usuario_supervisoes_select_self ON public.programacao_usuario_supervisoes AS PERMISSIVE FOR SELECT TO authenticated
  USING ((auth_user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY programacao_veiculo_proprio_rw ON public.programacao_veiculo_proprio AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY programacoes_delete_authenticated ON public.programacoes AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY programacoes_insert_authenticated ON public.programacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY programacoes_select_authenticated ON public.programacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY programacoes_update_authenticated ON public.programacoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY propostas_comerciais_auth_all ON public.propostas_comerciais AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY propostas_gestores_regionais_delete ON public.propostas_gestores_regionais AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY propostas_gestores_regionais_insert ON public.propostas_gestores_regionais AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY propostas_gestores_regionais_select ON public.propostas_gestores_regionais AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY propostas_gestores_regionais_update ON public.propostas_gestores_regionais AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY resultado_diario_delete_authenticated ON public.relatorio_resultado_diario AS PERMISSIVE FOR DELETE TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (COALESCE(p.active, true) = true)))) OR (EXISTS ( SELECT 1
   FROM app_usuarios u
  WHERE ((u.auth_user_id = ( SELECT auth.uid() AS uid)) AND (COALESCE(u.status, 'ativo'::text) = 'ativo'::text))))));

CREATE POLICY resultado_diario_insert_authenticated ON public.relatorio_resultado_diario AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (COALESCE(p.active, true) = true)))) OR (EXISTS ( SELECT 1
   FROM app_usuarios u
  WHERE ((u.auth_user_id = ( SELECT auth.uid() AS uid)) AND (COALESCE(u.status, 'ativo'::text) = 'ativo'::text))))));

CREATE POLICY resultado_diario_select_authenticated ON public.relatorio_resultado_diario AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (COALESCE(p.active, true) = true)))) OR (EXISTS ( SELECT 1
   FROM app_usuarios u
  WHERE ((u.auth_user_id = ( SELECT auth.uid() AS uid)) AND (COALESCE(u.status, 'ativo'::text) = 'ativo'::text))))));

CREATE POLICY resultado_diario_update_authenticated ON public.relatorio_resultado_diario AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (COALESCE(p.active, true) = true)))) OR (EXISTS ( SELECT 1
   FROM app_usuarios u
  WHERE ((u.auth_user_id = ( SELECT auth.uid() AS uid)) AND (COALESCE(u.status, 'ativo'::text) = 'ativo'::text))))))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (COALESCE(p.active, true) = true)))) OR (EXISTS ( SELECT 1
   FROM app_usuarios u
  WHERE ((u.auth_user_id = ( SELECT auth.uid() AS uid)) AND (COALESCE(u.status, 'ativo'::text) = 'ativo'::text))))));

CREATE POLICY relatorio_gavilon_insert_authenticated ON public.relatorio_resultado_gavilon AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY relatorio_gavilon_insert_service_only ON public.relatorio_resultado_gavilon AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY relatorio_gavilon_select_authenticated ON public.relatorio_resultado_gavilon AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY relatorios_importacoes_delete_authenticated ON public.relatorios_importacoes AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);

CREATE POLICY relatorios_importacoes_insert_authenticated ON public.relatorios_importacoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY relatorios_importacoes_select_authenticated ON public.relatorios_importacoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY relatorios_importacoes_update_authenticated ON public.relatorios_importacoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY p_rhadm_ins ON public.rh_admissao_checklist AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY p_rhadm_sel ON public.rh_admissao_checklist AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY p_rhadm_upd ON public.rh_admissao_checklist AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY authenticated_read_rh_admissoes ON public.rh_admissoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY authenticated_write_rh_admissoes ON public.rh_admissoes AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY authenticated_read_rh_advertencias ON public.rh_advertencias AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY authenticated_write_rh_advertencias ON public.rh_advertencias AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY authenticated_read_rh_atestados ON public.rh_atestados AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY authenticated_write_rh_atestados ON public.rh_atestados AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY authenticated_read_rh_cartao_ponto ON public.rh_cartao_ponto AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY authenticated_write_rh_cartao_ponto ON public.rh_cartao_ponto AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY authenticated_read_rh_cat ON public.rh_cat AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY authenticated_write_rh_cat ON public.rh_cat AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY clinicas_sst_delete ON public.rh_clinicas_sst AS PERMISSIVE FOR DELETE TO public
  USING (true);

CREATE POLICY clinicas_sst_insert ON public.rh_clinicas_sst AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (true);

CREATE POLICY clinicas_sst_select ON public.rh_clinicas_sst AS PERMISSIVE FOR SELECT TO public
  USING (true);

CREATE POLICY clinicas_sst_update ON public.rh_clinicas_sst AS PERMISSIVE FOR UPDATE TO public
  USING (true);

CREATE POLICY p_rhcontr_ins ON public.rh_contratos AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY p_rhcontr_sel ON public.rh_contratos AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY p_rhcontr_upd ON public.rh_contratos AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY authenticated_read_rh_contratos_experiencia ON public.rh_contratos_experiencia AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY authenticated_write_rh_contratos_experiencia ON public.rh_contratos_experiencia AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY authenticated_read_rh_documentos_registro ON public.rh_documentos_registro AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY authenticated_write_rh_documentos_registro ON public.rh_documentos_registro AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY p_rhepi_ins ON public.rh_epi AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY p_rhepi_sel ON public.rh_epi AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY p_rhepi_upd ON public.rh_epi AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY authenticated_read_epi ON public.rh_epi_registros AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY authenticated_write_epi ON public.rh_epi_registros AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY authenticated_read_rh_exames ON public.rh_exames AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY authenticated_write_rh_exames ON public.rh_exames AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY authenticated_read_rh_ferias ON public.rh_ferias AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY authenticated_write_rh_ferias ON public.rh_ferias AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY authenticated_read_rh_folha ON public.rh_folha AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY authenticated_write_rh_folha ON public.rh_folha AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY authenticated_read_rh_integracao ON public.rh_integracao AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY authenticated_write_rh_integracao ON public.rh_integracao AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY rh_plantao_contatos_select_auth ON public.rh_plantao_contatos AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY rh_plantao_contatos_write_auth ON public.rh_plantao_contatos AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY rh_plantao_escalas_select_auth ON public.rh_plantao_escalas AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY rh_plantao_escalas_write_auth ON public.rh_plantao_escalas AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY rh_plantao_modelos_select_auth ON public.rh_plantao_modelos AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY rh_plantao_modelos_write_auth ON public.rh_plantao_modelos AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY rh_plantao_setor_config_delete_master ON public.rh_plantao_setor_config AS PERMISSIVE FOR DELETE TO authenticated
  USING (painel_is_master());

CREATE POLICY rh_plantao_setor_config_insert_master ON public.rh_plantao_setor_config AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (painel_is_master());

CREATE POLICY rh_plantao_setor_config_select ON public.rh_plantao_setor_config AS PERMISSIVE FOR SELECT TO authenticated
  USING (painel_has_module(ARRAY['equipe'::text, 'rh_plantao'::text], false));

CREATE POLICY rh_plantao_setor_config_update_editor ON public.rh_plantao_setor_config AS PERMISSIVE FOR UPDATE TO authenticated
  USING (rh_plantao_pode_editar_setor(setor))
  WITH CHECK (rh_plantao_pode_editar_setor(setor));

CREATE POLICY rh_plantao_setor_editores_delete_master ON public.rh_plantao_setor_editores AS PERMISSIVE FOR DELETE TO authenticated
  USING (painel_is_master());

CREATE POLICY rh_plantao_setor_editores_insert_master ON public.rh_plantao_setor_editores AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (painel_is_master());

CREATE POLICY rh_plantao_setor_editores_select ON public.rh_plantao_setor_editores AS PERMISSIVE FOR SELECT TO authenticated
  USING (painel_has_module(ARRAY['equipe'::text, 'rh_plantao'::text], false));

CREATE POLICY rh_plantao_setores_select_auth ON public.rh_plantao_setores AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY rh_plantao_setores_write_auth ON public.rh_plantao_setores AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY authenticated_read_rh_rescisoes ON public.rh_rescisoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY authenticated_write_rh_rescisoes ON public.rh_rescisoes AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY p_rhtrein_ins ON public.rh_treinamento_acessos AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY p_rhtrein_sel ON public.rh_treinamento_acessos AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY p_rhtrein_upd ON public.rh_treinamento_acessos AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated insert supervisoes" ON public.supervisoes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated read supervisoes" ON public.supervisoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated update supervisoes" ON public.supervisoes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY authed_termos_celular ON public.termos_celular AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY p_termos_ins ON public.termos_documentos AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY p_termos_sel ON public.termos_documentos AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY p_termos_upd ON public.termos_documentos AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY authed_termos_veiculos ON public.termos_veiculos AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY ti_logs_master_select ON public.ti_integracao_logs AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.is_master = true) OR (p.can_manage_settings = true) OR (lower(COALESCE(p.role, ''::text)) = ANY (ARRAY['admin'::text, 'master'::text])))))));

CREATE POLICY ti_logs_master_write ON public.ti_integracao_logs AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.is_master = true) OR (p.can_manage_settings = true) OR (lower(COALESCE(p.role, ''::text)) = ANY (ARRAY['admin'::text, 'master'::text])))))));

CREATE POLICY ti_segredos_master_select ON public.ti_integracao_segredos AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.is_master = true) OR (p.can_manage_settings = true) OR (lower(COALESCE(p.role, ''::text)) = ANY (ARRAY['admin'::text, 'master'::text])))))));

CREATE POLICY ti_segredos_master_write ON public.ti_integracao_segredos AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.is_master = true) OR (p.can_manage_settings = true) OR (lower(COALESCE(p.role, ''::text)) = ANY (ARRAY['admin'::text, 'master'::text])))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.is_master = true) OR (p.can_manage_settings = true) OR (lower(COALESCE(p.role, ''::text)) = ANY (ARRAY['admin'::text, 'master'::text])))))));

CREATE POLICY ti_integracoes_master_select ON public.ti_integracoes AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.is_master = true) OR (p.can_manage_settings = true) OR (lower(COALESCE(p.role, ''::text)) = ANY (ARRAY['admin'::text, 'master'::text])))))));

CREATE POLICY ti_integracoes_master_write ON public.ti_integracoes AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.is_master = true) OR (p.can_manage_settings = true) OR (lower(COALESCE(p.role, ''::text)) = ANY (ARRAY['admin'::text, 'master'::text])))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.is_master = true) OR (p.can_manage_settings = true) OR (lower(COALESCE(p.role, ''::text)) = ANY (ARRAY['admin'::text, 'master'::text])))))));

CREATE POLICY "authenticated read user_modules" ON public.user_modules AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));
