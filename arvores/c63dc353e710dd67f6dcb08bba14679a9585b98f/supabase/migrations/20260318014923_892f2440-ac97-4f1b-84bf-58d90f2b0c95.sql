
-- Create automations table for persistent automation rules
CREATE TABLE public.automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  trigger_type TEXT NOT NULL DEFAULT 'new_message',
  trigger_config JSONB NOT NULL DEFAULT '{}',
  actions JSONB NOT NULL DEFAULT '[]',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_triggered_at TIMESTAMPTZ,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

-- RLS: Authenticated users can read all automations
CREATE POLICY "Authenticated users can read automations"
  ON public.automations FOR SELECT TO authenticated
  USING (true);

-- RLS: Admin/supervisor can insert
CREATE POLICY "Admin/supervisor can create automations"
  ON public.automations FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- RLS: Admin/supervisor can update
CREATE POLICY "Admin/supervisor can update automations"
  ON public.automations FOR UPDATE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- RLS: Admin/supervisor can delete
CREATE POLICY "Admin/supervisor can delete automations"
  ON public.automations FOR DELETE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- Trigger to auto-update updated_at
CREATE TRIGGER update_automations_updated_at
  BEFORE UPDATE ON public.automations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create scheduled_report_configs table if not exists for UI panel
CREATE TABLE IF NOT EXISTS public.scheduled_report_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  report_type TEXT NOT NULL DEFAULT 'dashboard',
  frequency TEXT NOT NULL DEFAULT 'weekly',
  recipients TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sent_at TIMESTAMPTZ,
  next_send_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduled_report_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read report configs"
  ON public.scheduled_report_configs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin/supervisor can manage report configs"
  ON public.scheduled_report_configs FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

CREATE TRIGGER update_scheduled_report_configs_updated_at
  BEFORE UPDATE ON public.scheduled_report_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
