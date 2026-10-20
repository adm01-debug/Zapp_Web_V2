
CREATE TABLE public.sla_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  first_response_minutes INTEGER NOT NULL DEFAULT 5,
  resolution_minutes INTEGER NOT NULL DEFAULT 60,
  priority INTEGER NOT NULL DEFAULT 0,
  
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  company TEXT,
  job_title TEXT,
  contact_type TEXT,
  queue_id UUID REFERENCES public.queues(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sla_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view SLA rules"
ON public.sla_rules FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins and supervisors can insert SLA rules"
ON public.sla_rules FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Admins and supervisors can update SLA rules"
ON public.sla_rules FOR UPDATE TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Admins and supervisors can delete SLA rules"
ON public.sla_rules FOR DELETE TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));

CREATE TRIGGER update_sla_rules_updated_at
BEFORE UPDATE ON public.sla_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_sla_rules_contact_id ON public.sla_rules(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX idx_sla_rules_company ON public.sla_rules(company) WHERE company IS NOT NULL;
CREATE INDEX idx_sla_rules_queue_id ON public.sla_rules(queue_id) WHERE queue_id IS NOT NULL;
CREATE INDEX idx_sla_rules_agent_id ON public.sla_rules(agent_id) WHERE agent_id IS NOT NULL;
CREATE INDEX idx_sla_rules_active ON public.sla_rules(is_active) WHERE is_active = true;
