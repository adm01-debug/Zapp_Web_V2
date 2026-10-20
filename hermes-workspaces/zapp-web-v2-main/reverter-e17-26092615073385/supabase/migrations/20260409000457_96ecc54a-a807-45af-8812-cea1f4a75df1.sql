-- Talk X: Marketing humanizado com simulação de digitação
CREATE TABLE public.talkx_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  message_template TEXT NOT NULL,
  variables_config JSONB NOT NULL DEFAULT '["nome","apelido","empresa","saudacao"]'::jsonb,
  typing_delay_min INTEGER NOT NULL DEFAULT 1500,
  typing_delay_max INTEGER NOT NULL DEFAULT 4000,
  send_interval_min INTEGER NOT NULL DEFAULT 5000,
  send_interval_max INTEGER NOT NULL DEFAULT 15000,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sending','paused','completed','cancelled')),
  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  whatsapp_connection_id UUID REFERENCES public.whatsapp_connections(id),
  created_by UUID REFERENCES public.profiles(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.talkx_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  personalized_message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','delivered','failed','skipped')),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, contact_id)
);

-- Indexes
CREATE INDEX idx_talkx_campaigns_status ON public.talkx_campaigns(status);
CREATE INDEX idx_talkx_campaigns_created_by ON public.talkx_campaigns(created_by);
CREATE INDEX idx_talkx_recipients_campaign ON public.talkx_recipients(campaign_id);
CREATE INDEX idx_talkx_recipients_status ON public.talkx_recipients(status);

-- RLS
ALTER TABLE public.talkx_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talkx_recipients ENABLE ROW LEVEL SECURITY;

-- Campaigns policies
CREATE POLICY "Users can view own campaigns"
  ON public.talkx_campaigns FOR SELECT TO authenticated
  USING (created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1));

CREATE POLICY "Admins can view all campaigns"
  ON public.talkx_campaigns FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Users can create campaigns"
  ON public.talkx_campaigns FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1));

CREATE POLICY "Users can update own campaigns"
  ON public.talkx_campaigns FOR UPDATE TO authenticated
  USING (created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1));

CREATE POLICY "Users can delete own draft campaigns"
  ON public.talkx_campaigns FOR DELETE TO authenticated
  USING (created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1) AND status = 'draft');

-- Recipients policies
CREATE POLICY "Users can view recipients of own campaigns"
  ON public.talkx_recipients FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.talkx_campaigns tc
    WHERE tc.id = campaign_id
    AND (tc.created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
         OR public.is_admin_or_supervisor(auth.uid()))
  ));

CREATE POLICY "Users can insert recipients to own campaigns"
  ON public.talkx_recipients FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.talkx_campaigns tc
    WHERE tc.id = campaign_id
    AND tc.created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
  ));

CREATE POLICY "Users can update recipients of own campaigns"
  ON public.talkx_recipients FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.talkx_campaigns tc
    WHERE tc.id = campaign_id
    AND tc.created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
  ));

CREATE POLICY "Users can delete recipients of own campaigns"
  ON public.talkx_recipients FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.talkx_campaigns tc
    WHERE tc.id = campaign_id
    AND tc.created_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    AND tc.status = 'draft'
  ));

-- Triggers
CREATE TRIGGER update_talkx_campaigns_updated_at
  BEFORE UPDATE ON public.talkx_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_talkx_recipients_updated_at
  BEFORE UPDATE ON public.talkx_recipients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.talkx_campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.talkx_recipients;