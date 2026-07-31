
-- ============================================================
-- Tabela principal de notificações de eventos
-- ============================================================
CREATE TABLE IF NOT EXISTS painel_notificacoes (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo                    TEXT NOT NULL,
  titulo                  TEXT NOT NULL,
  descricao               TEXT,
  prioridade              TEXT NOT NULL DEFAULT 'normal',
  icone                   TEXT NOT NULL DEFAULT 'bell',
  modulo_url              TEXT,

  -- Destinatário (pelo menos um dos três deve ser preenchido)
  destinatario_perfil     TEXT,         -- 'GESTOR' | 'MASTER' | código do perfil
  destinatario_modulo     TEXT,         -- código do módulo (ex: 'conferencia', 'compras_adm')
  destinatario_usuario_id UUID,         -- UUID do auth.users (usuário específico)
  supervisao              TEXT,         -- filtra por supervisão/regional do gestor

  -- Referência ao registro de origem
  referencia_tabela       TEXT,
  referencia_id           TEXT,

  -- Dedup para notificações automáticas
  chave_dedup             TEXT UNIQUE,

  -- Ciclo de vida
  gerado_por_usuario_id   UUID,
  arquivada               BOOLEAN NOT NULL DEFAULT false,
  arquivada_em            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta                    JSONB
);

CREATE INDEX IF NOT EXISTS idx_painel_notif_perfil     ON painel_notificacoes(destinatario_perfil);
CREATE INDEX IF NOT EXISTS idx_painel_notif_modulo     ON painel_notificacoes(destinatario_modulo);
CREATE INDEX IF NOT EXISTS idx_painel_notif_usuario    ON painel_notificacoes(destinatario_usuario_id);
CREATE INDEX IF NOT EXISTS idx_painel_notif_supervisao ON painel_notificacoes(supervisao);
CREATE INDEX IF NOT EXISTS idx_painel_notif_created    ON painel_notificacoes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_painel_notif_arquivada  ON painel_notificacoes(arquivada);

ALTER TABLE painel_notificacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_select_authenticated" ON painel_notificacoes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "notif_insert_authenticated" ON painel_notificacoes
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "notif_update_authenticated" ON painel_notificacoes
  FOR UPDATE TO authenticated USING (true);

-- ============================================================
-- Rastreamento individual por usuário (leitura / execução)
-- ============================================================
CREATE TABLE IF NOT EXISTS painel_notificacoes_usuarios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notificacao_id  UUID NOT NULL REFERENCES painel_notificacoes(id) ON DELETE CASCADE,
  usuario_id      UUID NOT NULL,         -- auth.users.id
  usuario_nome    TEXT,
  lida_em         TIMESTAMPTZ,
  executada_em    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(notificacao_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_notif_usr_usuario    ON painel_notificacoes_usuarios(usuario_id);
CREATE INDEX IF NOT EXISTS idx_notif_usr_notificacao ON painel_notificacoes_usuarios(notificacao_id);

ALTER TABLE painel_notificacoes_usuarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_usr_select" ON painel_notificacoes_usuarios
  FOR SELECT TO authenticated USING (usuario_id = auth.uid());

CREATE POLICY "notif_usr_insert" ON painel_notificacoes_usuarios
  FOR INSERT TO authenticated WITH CHECK (usuario_id = auth.uid());

CREATE POLICY "notif_usr_update" ON painel_notificacoes_usuarios
  FOR UPDATE TO authenticated USING (usuario_id = auth.uid());

-- Master pode ver todos os registros de leitura
CREATE POLICY "notif_usr_master_select" ON painel_notificacoes_usuarios
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_usuarios u
      JOIN app_perfis p ON p.id = u.perfil_id
      WHERE u.auth_user_id = auth.uid()
        AND upper(p.codigo) = 'MASTER'
    )
  );

-- ============================================================
-- Despesas lançadas pela Conferência para validação
-- ============================================================
CREATE TABLE IF NOT EXISTS conferencia_despesas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_referencia     DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo_despesa        TEXT NOT NULL,
  valor               NUMERIC(14,2) NOT NULL DEFAULT 0,
  descricao           TEXT,
  setor_destino       TEXT NOT NULL,     -- modulo que será notificado
  programacao_id      UUID REFERENCES programacao_dia(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'pendente',  -- pendente | conferido | recusado
  criado_por          UUID,              -- auth.users.id
  criado_por_nome     TEXT,
  conferido_por       UUID,
  conferido_em        TIMESTAMPTZ,
  notificacao_id      UUID REFERENCES painel_notificacoes(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conf_desp_status  ON conferencia_despesas(status);
CREATE INDEX IF NOT EXISTS idx_conf_desp_setor   ON conferencia_despesas(setor_destino);
CREATE INDEX IF NOT EXISTS idx_conf_desp_created ON conferencia_despesas(created_at DESC);

ALTER TABLE conferencia_despesas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conf_desp_select" ON conferencia_despesas
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "conf_desp_insert" ON conferencia_despesas
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "conf_desp_update" ON conferencia_despesas
  FOR UPDATE TO authenticated USING (true);
;
