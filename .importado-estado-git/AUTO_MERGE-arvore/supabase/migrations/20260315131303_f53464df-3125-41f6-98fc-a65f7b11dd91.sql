
-- CSAT satisfaction surveys table
CREATE TABLE public.csat_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE NOT NULL,
  agent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  rating integer NOT NULL,
  feedback text,
  conversation_resolved_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.csat_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view CSAT surveys"
  ON public.csat_surveys FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert CSAT surveys"
  ON public.csat_surveys FOR INSERT TO authenticated
  WITH CHECK (true);

-- Auto-close configuration table
CREATE TABLE public.auto_close_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inactivity_hours integer NOT NULL DEFAULT 24,
  is_enabled boolean NOT NULL DEFAULT false,
  close_message text DEFAULT 'Conversa encerrada automaticamente por inatividade.',
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.auto_close_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view auto-close config"
  ON public.auto_close_config FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage auto-close config"
  ON public.auto_close_config FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Insert default config
INSERT INTO public.auto_close_config (inactivity_hours, is_enabled) VALUES (24, false);

-- Enable realtime for CSAT
ALTER PUBLICATION supabase_realtime ADD TABLE public.csat_surveys;
