DROP POLICY IF EXISTS "Admins can insert campaigns" ON public.campaigns

CREATE POLICY "Admins can insert campaigns" ON public.campaigns
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()))

DROP POLICY IF EXISTS "Admins can insert chatbot flows" ON public.chatbot_flows

CREATE POLICY "Admins can insert chatbot flows" ON public.chatbot_flows
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()))

DROP POLICY IF EXISTS "Admins can insert campaign contacts" ON public.campaign_contacts

CREATE POLICY "Admins can insert campaign contacts" ON public.campaign_contacts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()))

DROP POLICY IF EXISTS "Admins can insert templates" ON public.whatsapp_templates

CREATE POLICY "Admins can insert templates" ON public.whatsapp_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()))

DROP POLICY IF EXISTS "Admins can insert scheduled reports" ON public.scheduled_reports

CREATE POLICY "Admins can insert scheduled reports" ON public.scheduled_reports
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()))

DROP POLICY IF EXISTS "Admins can view capi events" ON public.meta_capi_events

CREATE POLICY "Admins can view capi events" ON public.meta_capi_events
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))

DROP POLICY IF EXISTS "Admins can view campaign contacts" ON public.campaign_contacts

CREATE POLICY "Admins can view campaign contacts" ON public.campaign_contacts
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))

DROP POLICY IF EXISTS "Admins can insert security alerts" ON public.security_alerts

CREATE POLICY "Admins can insert security alerts" ON public.security_alerts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()))

DROP POLICY IF EXISTS "Admins can insert products" ON public.products

CREATE POLICY "Admins can insert products" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()))

DROP POLICY IF EXISTS "Admins can view scheduled reports" ON public.scheduled_reports

CREATE POLICY "Admins can view scheduled reports" ON public.scheduled_reports
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))

DROP POLICY IF EXISTS "Admins can view followup sequences" ON public.followup_sequences

CREATE POLICY "Admins can view followup sequences" ON public.followup_sequences
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))

DROP POLICY IF EXISTS "Admins can view followup steps" ON public.followup_steps

CREATE POLICY "Admins can view followup steps" ON public.followup_steps
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))

DO $$
DECLARE
  faltando text;
BEGIN
  SELECT string_agg(esperada, ', ') INTO faltando
  FROM (VALUES
    ('campaigns', 'Admins can insert campaigns'),
    ('chatbot_flows', 'Admins can insert chatbot flows'),
    ('campaign_contacts', 'Admins can insert campaign contacts'),
    ('whatsapp_templates', 'Admins can insert templates'),
    ('scheduled_reports', 'Admins can insert scheduled reports'),
    ('meta_capi_events', 'Admins can view capi events'),
    ('campaign_contacts', 'Admins can view campaign contacts'),
    ('security_alerts', 'Admins can insert security alerts'),
    ('products', 'Admins can insert products'),
    ('scheduled_reports', 'Admins can view scheduled reports'),
    ('followup_sequences', 'Admins can view followup sequences'),
    ('followup_steps', 'Admins can view followup steps')
  ) AS e(tabela, esperada)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = e.tabela AND p.policyname = e.esperada
  );
  IF faltando IS NOT NULL THEN
    RAISE EXCEPTION 'policies de admin ausentes apos paridade: %', faltando;
  END IF;
END;
$$
