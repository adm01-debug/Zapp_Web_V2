
-- Omnichannel support: Add channel type to existing tables
-- This allows the same messaging infrastructure to handle multiple channels

-- Create channels enum
CREATE TYPE public.channel_type AS ENUM ('whatsapp', 'instagram', 'telegram', 'messenger', 'webchat', 'email');

-- Create omnichannel connections table
CREATE TABLE public.channel_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_type public.channel_type NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected',
  config jsonb DEFAULT '{}'::jsonb,
  credentials jsonb DEFAULT '{}'::jsonb,
  webhook_url text,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- For WhatsApp, links to existing whatsapp_connections
  whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id),
  -- Channel-specific IDs
  external_account_id text,
  external_page_id text
);

ALTER TABLE public.channel_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view channels"
ON public.channel_connections FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage channels"
ON public.channel_connections FOR ALL TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()))
WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- Add channel_type to messages for tracking source
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS channel_type text DEFAULT 'whatsapp';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS channel_connection_id uuid REFERENCES public.channel_connections(id);

-- Add channel_type to contacts
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS channel_type text DEFAULT 'whatsapp';
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS channel_connection_id uuid REFERENCES public.channel_connections(id);

-- Create channel message routing table
CREATE TABLE public.channel_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_type public.channel_type NOT NULL,
  channel_connection_id uuid REFERENCES public.channel_connections(id),
  queue_id uuid REFERENCES public.queues(id),
  priority integer DEFAULT 0,
  conditions jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.channel_routing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage routing rules"
ON public.channel_routing_rules FOR ALL TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()))
WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Authenticated can view routing rules"
ON public.channel_routing_rules FOR SELECT TO authenticated USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_channel_connections_updated_at
  BEFORE UPDATE ON public.channel_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
