-- Create contact_notes table for private notes on contacts
CREATE TABLE public.contact_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contact_notes ENABLE ROW LEVEL SECURITY;

-- Users can view notes on contacts they have access to
CREATE POLICY "Users can view notes on accessible contacts"
  ON public.contact_notes
  FOR SELECT
  USING (
    contact_id IN (
      SELECT id FROM public.contacts c
      WHERE c.assigned_to IN (
        SELECT id FROM public.profiles WHERE user_id = auth.uid()
      )
    ) OR is_admin_or_supervisor(auth.uid())
  );

-- Users can insert notes
CREATE POLICY "Authenticated users can insert notes"
  ON public.contact_notes
  FOR INSERT
  WITH CHECK (
    author_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- Users can update their own notes
CREATE POLICY "Users can update their own notes"
  ON public.contact_notes
  FOR UPDATE
  USING (author_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Users can delete their own notes
CREATE POLICY "Users can delete their own notes"
  ON public.contact_notes
  FOR DELETE
  USING (author_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_contact_notes_updated_at
  BEFORE UPDATE ON public.contact_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_contact_notes_contact_id ON public.contact_notes(contact_id);
CREATE INDEX idx_contact_notes_author_id ON public.contact_notes(author_id);