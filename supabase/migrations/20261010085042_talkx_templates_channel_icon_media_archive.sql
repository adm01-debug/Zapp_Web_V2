-- talkx_templates_channel_icon_media_archive
-- Rollback: desfaz a adição das colunas channel, icon, interactive, media_file_name,
-- media_size_bytes, media_width, media_height e archived_at da tabela talkx_templates.
-- Rollback (SQL executável, na ordem):
--   ALTER TABLE public.talkx_templates DROP COLUMN IF EXISTS archived_at;
--   ALTER TABLE public.talkx_templates DROP COLUMN IF EXISTS media_height;
--   ALTER TABLE public.talkx_templates DROP COLUMN IF EXISTS media_width;
--   ALTER TABLE public.talkx_templates DROP COLUMN IF EXISTS media_size_bytes;
--   ALTER TABLE public.talkx_templates DROP COLUMN IF EXISTS media_file_name;
--   ALTER TABLE public.talkx_templates DROP COLUMN IF EXISTS interactive;
--   ALTER TABLE public.talkx_templates DROP COLUMN IF EXISTS icon;
--   ALTER TABLE public.talkx_templates DROP COLUMN IF EXISTS channel;
-- Item N-126 (P3 · banco): templates Talk X sem canal, ícone, metadados de mídia e
-- arquivamento — colunas ausentes que o app precisa para suportar canais, ícones,
-- mídia rica e arquivamento de templates.

ALTER TABLE public.talkx_templates
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp',
  ADD CONSTRAINT talkx_templates_channel_check CHECK (channel = 'whatsapp');

ALTER TABLE public.talkx_templates
  ADD COLUMN IF NOT EXISTS icon text,
  ADD CONSTRAINT talkx_templates_icon_check CHECK (icon IS NULL OR length(icon) <= 16);

ALTER TABLE public.talkx_templates
  ADD COLUMN IF NOT EXISTS interactive jsonb,
  ADD COLUMN IF NOT EXISTS media_file_name text,
  ADD COLUMN IF NOT EXISTS media_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS media_width integer,
  ADD COLUMN IF NOT EXISTS media_height integer,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
