
-- WhatsApp Templates table
CREATE TABLE public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'utility',
  language TEXT NOT NULL DEFAULT 'pt_BR',
  content TEXT NOT NULL,
  header_text TEXT,
  footer_text TEXT,
  buttons JSONB DEFAULT '[]'::jsonb,
  variables TEXT[] DEFAULT '{}'::text[],
  status TEXT NOT NULL DEFAULT 'draft',
  whatsapp_connection_id UUID REFERENCES public.whatsapp_connections(id),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view templates" ON public.whatsapp_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage templates" ON public.whatsapp_templates
  FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Authenticated can insert templates" ON public.whatsapp_templates
  FOR INSERT TO authenticated WITH CHECK (true);

-- Scheduled Reports table
CREATE TABLE public.scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  report_type TEXT NOT NULL DEFAULT 'dashboard_summary',
  frequency TEXT NOT NULL DEFAULT 'weekly',
  recipients TEXT[] NOT NULL DEFAULT '{}'::text[],
  format TEXT NOT NULL DEFAULT 'pdf',
  is_active BOOLEAN DEFAULT true,
  next_send_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view scheduled reports" ON public.scheduled_reports
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage scheduled reports" ON public.scheduled_reports
  FOR ALL TO authenticated USING (is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Authenticated can insert scheduled reports" ON public.scheduled_reports
  FOR INSERT TO authenticated WITH CHECK (true);

-- Updated_at triggers
CREATE TRIGGER update_whatsapp_templates_updated_at
  BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scheduled_reports_updated_at
  BEFORE UPDATE ON public.scheduled_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
