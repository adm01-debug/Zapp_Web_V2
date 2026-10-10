-- Notas categorizadas para a aba Notas do inbox (note | fact | objection | promise).
-- Pendências usam conversation_tasks; Resumo comercial usa contacts.notes.
ALTER TABLE public.contact_notes
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'note',
  ADD COLUMN IF NOT EXISTS is_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS due_date timestamptz;
ALTER TABLE public.contact_notes DROP CONSTRAINT IF EXISTS contact_notes_category_check;
ALTER TABLE public.contact_notes
  ADD CONSTRAINT contact_notes_category_check CHECK (category IN ('note','fact','objection','promise'));
CREATE INDEX IF NOT EXISTS idx_contact_notes_contact_category ON public.contact_notes (contact_id, category);
