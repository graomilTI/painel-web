-- Registro de logins e acessos dos usuários no painel
CREATE TABLE IF NOT EXISTS app_logs_usuarios (
  id            uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id    uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  usuario_nome  text,
  usuario_email text,
  usuario_role  text,
  tipo          text          NOT NULL CHECK (tipo IN ('login', 'logout', 'page_access', 'action')),
  modulo        text,
  acao          text          NOT NULL,
  detalhes      jsonb,
  user_agent    text,
  created_at    timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_logs_usuario_id  ON app_logs_usuarios (usuario_id);
CREATE INDEX IF NOT EXISTS idx_logs_created_at  ON app_logs_usuarios (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_tipo        ON app_logs_usuarios (tipo);
ALTER TABLE app_logs_usuarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "logs_insert_auth" ON app_logs_usuarios
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "logs_select_auth" ON app_logs_usuarios
  FOR SELECT TO authenticated
  USING (true);
