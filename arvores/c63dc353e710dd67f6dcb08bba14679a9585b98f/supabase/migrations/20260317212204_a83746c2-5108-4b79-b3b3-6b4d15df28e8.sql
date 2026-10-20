
-- 1. Agent Skills table for Skill-Based Routing
CREATE TABLE public.agent_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  skill_level INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(profile_id, skill_name)
);

ALTER TABLE public.agent_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view skills"
  ON public.agent_skills FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage skills"
  ON public.agent_skills FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- 2. Queue skills requirements
CREATE TABLE public.queue_skill_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID NOT NULL REFERENCES public.queues(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  min_level INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(queue_id, skill_name)
);

ALTER TABLE public.queue_skill_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view queue skills"
  ON public.queue_skill_requirements FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage queue skills"
  ON public.queue_skill_requirements FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- 3. CSAT auto-send config table
CREATE TABLE public.csat_auto_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_enabled BOOLEAN DEFAULT false,
  delay_minutes INTEGER DEFAULT 5,
  message_template TEXT DEFAULT 'Olá {name}! Como foi seu atendimento? Avalie de 1 a 5 ⭐',
  whatsapp_connection_id UUID REFERENCES public.whatsapp_connections(id),
  updated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.csat_auto_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view csat config"
  ON public.csat_auto_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage csat config"
  ON public.csat_auto_config FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- 4. War Room alerts table for persistent alerts with push
CREATE TABLE public.warroom_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL DEFAULT 'warning',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  source TEXT,
  is_read BOOLEAN DEFAULT false,
  dismissed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.warroom_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view alerts"
  ON public.warroom_alerts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can update alerts"
  ON public.warroom_alerts FOR UPDATE TO authenticated USING (true);

CREATE POLICY "System can insert alerts"
  ON public.warroom_alerts FOR INSERT TO authenticated
  WITH CHECK (true);

-- Enable realtime for war room alerts
ALTER PUBLICATION supabase_realtime ADD TABLE public.warroom_alerts;

-- 5. Skill-based routing function
CREATE OR REPLACE FUNCTION public.skill_based_assign(p_queue_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_agent_id UUID;
BEGIN
  SELECT qm.profile_id INTO v_agent_id
  FROM public.queue_members qm
  JOIN public.profiles p ON p.id = qm.profile_id
  WHERE qm.queue_id = p_queue_id
    AND qm.is_active = true
    AND p.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.queue_skill_requirements qsr
      WHERE qsr.queue_id = p_queue_id
      AND NOT EXISTS (
        SELECT 1 FROM public.agent_skills ags
        WHERE ags.profile_id = qm.profile_id
        AND ags.skill_name = qsr.skill_name
        AND ags.skill_level >= qsr.min_level
      )
    )
  ORDER BY (
    SELECT COUNT(*) FROM public.contacts c 
    WHERE c.assigned_to = qm.profile_id
  ) ASC
  LIMIT 1;
  
  IF v_agent_id IS NULL THEN
    SELECT qm.profile_id INTO v_agent_id
    FROM public.queue_members qm
    JOIN public.profiles p ON p.id = qm.profile_id
    WHERE qm.queue_id = p_queue_id
      AND qm.is_active = true
      AND p.is_active = true
    ORDER BY (
      SELECT COUNT(*) FROM public.contacts c 
      WHERE c.assigned_to = qm.profile_id
    ) ASC
    LIMIT 1;
  END IF;
  
  RETURN v_agent_id;
END;
$$;
