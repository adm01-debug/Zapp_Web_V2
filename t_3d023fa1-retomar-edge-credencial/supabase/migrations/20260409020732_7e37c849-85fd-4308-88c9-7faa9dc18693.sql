
-- Contact purchases/proposals history
CREATE TABLE IF NOT EXISTS public.contact_purchases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(12,2),
  currency TEXT DEFAULT 'BRL',
  status TEXT DEFAULT 'pending',
  purchase_type TEXT DEFAULT 'purchase',
  deal_id UUID REFERENCES public.sales_deals(id),
  created_by UUID REFERENCES public.profiles(id),
  purchased_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.contact_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage purchases" ON public.contact_purchases FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE TRIGGER update_contact_purchases_updated_at BEFORE UPDATE ON public.contact_purchases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Training sessions for agents
CREATE TABLE IF NOT EXISTS public.training_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scenario_name TEXT NOT NULL,
  scenario_type TEXT DEFAULT 'general',
  messages JSONB DEFAULT '[]',
  score INTEGER,
  feedback TEXT,
  status TEXT DEFAULT 'in_progress',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own training" ON public.training_sessions FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Crisis room alerts
CREATE TABLE IF NOT EXISTS public.crisis_room_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  severity TEXT NOT NULL DEFAULT 'warning',
  metric_name TEXT NOT NULL,
  metric_value NUMERIC,
  threshold NUMERIC,
  message TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  acknowledged_by UUID REFERENCES public.profiles(id),
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.crisis_room_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view crisis alerts" ON public.crisis_room_alerts FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can manage crisis alerts" ON public.crisis_room_alerts FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Campaign A/B variants
CREATE TABLE IF NOT EXISTS public.campaign_ab_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  variant_name TEXT NOT NULL DEFAULT 'A',
  message_content TEXT NOT NULL,
  media_url TEXT,
  send_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  read_count INTEGER DEFAULT 0,
  response_count INTEGER DEFAULT 0,
  is_winner BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.campaign_ab_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage AB variants" ON public.campaign_ab_variants FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
