-- Adiciona coluna 'risco' para marcar emails perigosos (vírus, anexos suspeitos, etc)
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS risco TEXT DEFAULT 'BAIXO' CHECK (risco IN ('BAIXO', 'MEDIO', 'ALTO', 'CRITICO'));

-- Atualiza emails com anexos perigosos para CRITICO
UPDATE email_messages SET risco = 'CRITICO'
WHERE id IN (
  SELECT DISTINCT email_id FROM email_attachments
  WHERE (interpretacao_status = 'ERRO' AND mime_type IN ('application/x-msdownload', 'application/x-executable', 'application/x-msdos-program'))
    OR nome_arquivo ~* '\.(exe|com|bat|cmd|msi|scr|vbs|js|jar|zip|rar|7z|dmg|pkg|run|sh|bin|dll|sys|drv)$'
);

CREATE INDEX IF NOT EXISTS email_messages_risco_idx ON email_messages(risco);
