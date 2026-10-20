
-- 1. WhatsappQueue N:N junction table
CREATE TABLE IF NOT EXISTS public.whatsapp_connection_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_connection_id uuid NOT NULL REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  queue_id uuid NOT NULL REFERENCES public.queues(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(whatsapp_connection_id, queue_id)
);
ALTER TABLE public.whatsapp_connection_queues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage connection queues" ON public.whatsapp_connection_queues FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid()));
CREATE POLICY "Authenticated can view connection queues" ON public.whatsapp_connection_queues FOR SELECT TO authenticated USING (true);

-- 2. Battery, plugged, retries on whatsapp_connections
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS battery_level integer DEFAULT NULL;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS is_plugged boolean DEFAULT NULL;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0;
ALTER TABLE public.whatsapp_connections ADD COLUMN IF NOT EXISTS max_retries integer DEFAULT 5;

-- 3. is_deleted on messages
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;

-- 4. Global settings table
CREATE TABLE IF NOT EXISTS public.global_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text,
  description text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view global settings" ON public.global_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage global settings" ON public.global_settings FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid()));

-- 5. Force logout - session_invalidated_at on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS session_invalidated_at timestamptz DEFAULT NULL;

-- 6. Insert default global settings
INSERT INTO public.global_settings (key, value, description) VALUES
  ('user_creation', 'enabled', 'Permite criação de novos usuários'),
  ('check_msg_is_group', 'enabled', 'Processa mensagens de grupos'),
  ('auto_reopen_hours', '2', 'Horas para reabertura automática de conversa'),
  ('group_tickets_enabled', 'enabled', 'Habilita tickets para grupos WhatsApp'),
  ('api_token', '', 'Token de autenticação para API pública')
ON CONFLICT (key) DO NOTHING;

-- 7. Updated_at trigger for global_settings
CREATE OR REPLACE FUNCTION update_global_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_global_settings_updated_at
  BEFORE UPDATE ON public.global_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_global_settings_updated_at();
