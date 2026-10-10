-- talkx_templates_add_media_type
-- Rollback: desfaz a adição da coluna media_type e da constraint CHECK da tabela talkx_templates.
-- Rollback (SQL executável, na ordem):
--   ALTER TABLE public.talkx_templates DROP CONSTRAINT IF EXISTS talkx_templates_media_type_check;
--   ALTER TABLE public.talkx_templates DROP COLUMN IF EXISTS media_type;
-- Item N-126 (P2 · banco): templates Talk X sem coluna media_type — tipo de mídia (image/video/document/audio) ausente que o app precisa para validar o tipo de arquivo anexado em templates.

ALTER TABLE public.talkx_templates
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD CONSTRAINT talkx_templates_media_type_check CHECK (media_type IS NULL OR media_type IN ('image','video','document','audio'));