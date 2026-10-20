
-- Tabela de campanhas/broadcast
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  message_content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  media_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'completed', 'cancelled', 'paused')),
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_contacts INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  read_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  whatsapp_connection_id UUID REFERENCES public.whatsapp_connections(id),
  created_by UUID REFERENCES public.profiles(id),
  target_type TEXT NOT NULL DEFAULT 'all' CHECK (target_type IN ('all', 'tag', 'queue', 'custom')),
  target_filter JSONB DEFAULT '{}'::jsonb,
  send_interval_seconds INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de destinatários da campanha
CREATE TABLE public.campaign_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  external_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de chatbot flows
CREATE TABLE public.chatbot_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT false,
  trigger_type TEXT NOT NULL DEFAULT 'keyword' CHECK (trigger_type IN ('keyword', 'first_message', 'menu', 'webhook', 'schedule')),
  trigger_value TEXT,
  nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
  edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  variables JSONB DEFAULT '{}'::jsonb,
  whatsapp_connection_id UUID REFERENCES public.whatsapp_connections(id),
  created_by UUID REFERENCES public.profiles(id),
  execution_count INTEGER DEFAULT 0,
  last_executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de execuções de chatbot
CREATE TABLE public.chatbot_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES public.chatbot_flows(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  current_node_id TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'paused', 'cancelled')),
  variables JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_campaigns_status ON public.campaigns(status);
CREATE INDEX idx_campaigns_created_by ON public.campaigns(created_by);
CREATE INDEX idx_campaign_contacts_campaign_id ON public.campaign_contacts(campaign_id);
CREATE INDEX idx_campaign_contacts_status ON public.campaign_contacts(status);
CREATE INDEX idx_chatbot_flows_active ON public.chatbot_flows(is_active);
CREATE INDEX idx_chatbot_executions_flow_id ON public.chatbot_executions(flow_id);
CREATE INDEX idx_chatbot_executions_contact_id ON public.chatbot_executions(contact_id);
CREATE INDEX idx_chatbot_executions_status ON public.chatbot_executions(status);

-- Trigger updated_at
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_chatbot_flows_updated_at BEFORE UPDATE ON public.chatbot_flows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_executions ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Campaigns
CREATE POLICY "Authenticated can view campaigns" ON public.campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage campaigns" ON public.campaigns FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid()));
CREATE POLICY "Authenticated can insert campaigns" ON public.campaigns FOR INSERT TO authenticated WITH CHECK (true);

-- RLS Policies: Campaign Contacts
CREATE POLICY "Authenticated can view campaign contacts" ON public.campaign_contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage campaign contacts" ON public.campaign_contacts FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid()));
CREATE POLICY "Authenticated can insert campaign contacts" ON public.campaign_contacts FOR INSERT TO authenticated WITH CHECK (true);

-- RLS Policies: Chatbot Flows
CREATE POLICY "Authenticated can view chatbot flows" ON public.chatbot_flows FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage chatbot flows" ON public.chatbot_flows FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid()));
CREATE POLICY "Authenticated can insert chatbot flows" ON public.chatbot_flows FOR INSERT TO authenticated WITH CHECK (true);

-- RLS Policies: Chatbot Executions
CREATE POLICY "Authenticated can view chatbot executions" ON public.chatbot_executions FOR SELECT TO authenticated USING (true);
CREATE POLICY "System can manage chatbot executions" ON public.chatbot_executions FOR ALL TO authenticated USING (true);

-- Enable realtime for campaigns
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_contacts;
