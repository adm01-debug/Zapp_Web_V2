-- Create blacklist table for Talk X opt-out
CREATE TABLE public.talkx_blacklist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  reason TEXT DEFAULT 'Solicitação do cliente',
  blocked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(contact_id)
);

-- Enable RLS
ALTER TABLE public.talkx_blacklist ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view blacklist"
  ON public.talkx_blacklist FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can add to blacklist"
  ON public.talkx_blacklist FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can remove from blacklist"
  ON public.talkx_blacklist FOR DELETE TO authenticated USING (true);

-- Index for fast lookups
CREATE INDEX idx_talkx_blacklist_contact ON public.talkx_blacklist(contact_id);