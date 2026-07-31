
-- Add new columns to contato_cliente_registros
ALTER TABLE contato_cliente_registros
  ADD COLUMN IF NOT EXISTS participantes_cliente jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS participantes_grao1000 jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS anexos jsonb DEFAULT '[]'::jsonb;

-- Create storage bucket for attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contato-cliente-anexos',
  'contato-cliente-anexos',
  true,
  10485760,
  ARRAY['image/jpeg','image/png','image/gif','image/webp','application/pdf']
)
ON CONFLICT (id) DO NOTHING;
;
