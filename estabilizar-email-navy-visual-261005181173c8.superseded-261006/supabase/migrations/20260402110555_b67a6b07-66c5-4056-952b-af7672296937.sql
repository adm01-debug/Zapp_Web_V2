
-- Create NPS surveys table
CREATE TABLE public.nps_surveys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.profiles(id),
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 10),
  feedback TEXT,
  survey_type TEXT NOT NULL DEFAULT 'manual' CHECK (survey_type IN ('periodic', 'post_resolution', 'manual')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.nps_surveys ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view NPS surveys"
ON public.nps_surveys FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create NPS surveys"
ON public.nps_surveys FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update NPS surveys"
ON public.nps_surveys FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete NPS surveys"
ON public.nps_surveys FOR DELETE TO authenticated USING (true);

-- Index for performance
CREATE INDEX idx_nps_surveys_contact ON public.nps_surveys(contact_id);
CREATE INDEX idx_nps_surveys_created ON public.nps_surveys(created_at DESC);
