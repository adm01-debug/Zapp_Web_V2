-- Talk X (Campanhas): segmentos, templates, eventos de campanha e campos do
-- wizard/agendamento/supressao. Aditivo; RLS espelha talkx_campaigns
-- (dono = created_by via profiles.id; admin/supervisor le tudo).

CREATE TABLE IF NOT EXISTS public.talkx_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  origin text NOT NULL DEFAULT 'zapp',
  status text NOT NULL DEFAULT 'active',
  is_favorite boolean NOT NULL DEFAULT false,
  rules jsonb NOT NULL DEFAULT '{"groups":[]}'::jsonb,
  estimated_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT talkx_segments_origin_check CHECK (origin IN ('zapp','crm360','custom')),
  CONSTRAINT talkx_segments_status_check CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_talkx_segments_created_by ON public.talkx_segments(created_by);
CREATE TRIGGER update_talkx_segments_updated_at BEFORE UPDATE ON public.talkx_segments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.talkx_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "talkx_segments_select" ON public.talkx_segments FOR SELECT
  USING (created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1) OR public.is_admin_or_supervisor(auth.uid()));
CREATE POLICY "talkx_segments_insert" ON public.talkx_segments FOR INSERT
  WITH CHECK (created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1));
CREATE POLICY "talkx_segments_update" ON public.talkx_segments FOR UPDATE
  USING (created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1) OR public.is_admin_or_supervisor(auth.uid()));
CREATE POLICY "talkx_segments_delete" ON public.talkx_segments FOR DELETE
  USING (created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1) OR public.is_admin_or_supervisor(auth.uid()));

CREATE TABLE IF NOT EXISTS public.talkx_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'geral',
  content text NOT NULL,
  media_url text,
  media_type text,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'approved',
  use_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT talkx_templates_status_check CHECK (status IN ('draft','review','approved')),
  CONSTRAINT talkx_templates_media_type_check CHECK (media_type IS NULL OR media_type IN ('image','video','document','audio'))
);
CREATE INDEX IF NOT EXISTS idx_talkx_templates_created_by ON public.talkx_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_talkx_templates_category ON public.talkx_templates(category);
CREATE TRIGGER update_talkx_templates_updated_at BEFORE UPDATE ON public.talkx_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.talkx_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "talkx_templates_select" ON public.talkx_templates FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "talkx_templates_insert" ON public.talkx_templates FOR INSERT
  WITH CHECK (created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1));
CREATE POLICY "talkx_templates_update" ON public.talkx_templates FOR UPDATE
  USING (created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1) OR public.is_admin_or_supervisor(auth.uid()));
CREATE POLICY "talkx_templates_delete" ON public.talkx_templates FOR DELETE
  USING (created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1) OR public.is_admin_or_supervisor(auth.uid()));

ALTER TABLE public.talkx_campaigns
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS objective text NOT NULL DEFAULT 'engajamento',
  ADD COLUMN IF NOT EXISTS audience_source text NOT NULL DEFAULT 'contacts',
  ADD COLUMN IF NOT EXISTS audience_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS segment_id uuid REFERENCES public.talkx_segments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.talkx_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS send_window_start time,
  ADD COLUMN IF NOT EXISTS send_window_end time,
  ADD COLUMN IF NOT EXISTS business_hours_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS speed_profile text NOT NULL DEFAULT 'moderate',
  ADD COLUMN IF NOT EXISTS paused_at timestamptz;
ALTER TABLE public.talkx_campaigns DROP CONSTRAINT IF EXISTS talkx_campaigns_audience_source_check;
ALTER TABLE public.talkx_campaigns
  ADD CONSTRAINT talkx_campaigns_audience_source_check CHECK (audience_source IN ('contacts','segment','crm360'));
ALTER TABLE public.talkx_campaigns DROP CONSTRAINT IF EXISTS talkx_campaigns_speed_profile_check;
ALTER TABLE public.talkx_campaigns
  ADD CONSTRAINT talkx_campaigns_speed_profile_check CHECK (speed_profile IN ('slow','moderate','fast'));
CREATE INDEX IF NOT EXISTS idx_talkx_campaigns_segment_id ON public.talkx_campaigns(segment_id);
CREATE INDEX IF NOT EXISTS idx_talkx_campaigns_template_id ON public.talkx_campaigns(template_id);
CREATE INDEX IF NOT EXISTS idx_talkx_campaigns_scheduled_at ON public.talkx_campaigns(scheduled_at) WHERE status = 'scheduled';

ALTER TABLE public.talkx_blacklist
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.talkx_campaigns(id) ON DELETE SET NULL;
ALTER TABLE public.talkx_blacklist DROP CONSTRAINT IF EXISTS talkx_blacklist_origin_check;
ALTER TABLE public.talkx_blacklist
  ADD CONSTRAINT talkx_blacklist_origin_check CHECK (origin IN ('manual','optout','system','lgpd','list'));
CREATE INDEX IF NOT EXISTS idx_talkx_blacklist_campaign_id ON public.talkx_blacklist(campaign_id);

CREATE TABLE IF NOT EXISTS public.talkx_campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  message text,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT talkx_campaign_events_type_check CHECK (event_type IN ('created','updated','scheduled','started','paused','resumed','cancelled','completed','note'))
);
CREATE INDEX IF NOT EXISTS idx_talkx_campaign_events_campaign_created ON public.talkx_campaign_events(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_talkx_campaign_events_actor_id ON public.talkx_campaign_events(actor_id);
ALTER TABLE public.talkx_campaign_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "talkx_campaign_events_select" ON public.talkx_campaign_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.talkx_campaigns tc WHERE tc.id = talkx_campaign_events.campaign_id
    AND (tc.created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1) OR public.is_admin_or_supervisor(auth.uid()))));
CREATE POLICY "talkx_campaign_events_insert" ON public.talkx_campaign_events FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.talkx_campaigns tc WHERE tc.id = talkx_campaign_events.campaign_id
    AND (tc.created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1) OR public.is_admin_or_supervisor(auth.uid()))));
