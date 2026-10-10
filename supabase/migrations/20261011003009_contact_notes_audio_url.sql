-- Rollback: ALTER TABLE public.contact_notes DROP COLUMN IF EXISTS audio_url;

-- Notas de áudio: guarda a referência (URL pública/locator) do objeto de áudio
-- no bucket de mídia já usado pelas mensagens. Nulo para notas de texto.
ALTER TABLE public.contact_notes
  ADD COLUMN IF NOT EXISTS audio_url text;

COMMENT ON COLUMN public.contact_notes.audio_url IS
  'URL do objeto de áudio (bucket de mídia) da nota de voz; NULL para notas de texto.';
