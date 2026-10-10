-- contact_notes_audio_url
-- Rollback: remove a coluna de áudio das notas (nenhuma função/índice envolvido).
-- Rollback (SQL executável, na ordem):
--   alter table public.contact_notes drop column if exists audio_url;
--
-- Notas de voz: guarda a referência (URL pública/locator) do objeto de áudio no
-- bucket de mídia já usado pelas mensagens (`whatsapp-media`). Notas de texto ficam
-- com `NULL`, então a UI decide entre player e texto só pela presença da coluna.
-- Nullable de propósito: nenhuma nota existente muda de comportamento.
ALTER TABLE public.contact_notes
  ADD COLUMN IF NOT EXISTS audio_url text;

COMMENT ON COLUMN public.contact_notes.audio_url IS
  'URL do objeto de áudio (bucket whatsapp-media) quando a nota é uma nota de voz; NULL em notas de texto.';
