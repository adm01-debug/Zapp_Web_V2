-- 20261126234500_paridade_policies_admin_prod
-- Paridade de RLS entre o replay das migrations e o banco de producao.
--
-- Causa: o gerador de artefatos derivados (branch automation/types-sync) faz dump do banco
-- REAL para supabase/schema-manifest.json, e src/lib/__tests__/rlsSchemaGuard.test.ts exige
-- que os nomes de policy resolvidos das migrations sejam iguais aos do banco real. O dump de
-- producao (tnnnlkbymytvtqngbbqh) mostrou 12 policies criadas por migrations antigas que NAO
-- existem em producao (drift real, medido em 2026-11-26 com pg_policies):
--   campaigns            "Admins can insert campaigns"
--   chatbot_flows        "Admins can insert chatbot flows"
--   campaign_contacts    "Admins can insert campaign contacts" / "Admins can view campaign contacts"
--   whatsapp_templates   "Admins can insert templates"
--   scheduled_reports    "Admins can insert scheduled reports" / "Admins can view scheduled reports"
--   meta_capi_events     "Admins can view capi events"
--   security_alerts      "Admins can insert security alerts"
--   products             "Admins can insert products"
--   followup_sequences   "Admins can view followup sequences"
--   followup_steps       "Admins can view followup steps"
--
-- Efeito comportamental: ZERO. Cada tabela acima ja tem uma policy FOR ALL para o papel
-- authenticated com a MESMA condicao (public.is_admin_or_supervisor(auth.uid())), que concede
-- INSERT/SELECT identicos; as policies repostas sao redundantes por construcao (verificado em
-- pg_policies: e a unica policy por tabela que cobre escrita/leitura de admin).
-- O que muda: producao volta a ser igual ao replay das migrations, o guarda de RLS do
-- automatizado deixa de acusar divergencia e os artefatos derivados podem ser regerados.
-- Reversao (se algum dia preciso): DROP POLICY das 12 - todas restritas a admin/supervisor.
--
-- Idempotente: DROP POLICY IF EXISTS antes de cada CREATE.

-- campaigns
DROP POLICY IF EXISTS "Admins can insert campaigns" ON public.campaigns;
CREATE POLICY "Admins can insert campaigns" ON public.campaigns
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- chatbot_flows
DROP POLICY IF EXISTS "Admins can insert chatbot flows" ON public.chatbot_flows;
CREATE POLICY "Admins can insert chatbot flows" ON public.chatbot_flows
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- campaign_contacts
DROP POLICY IF EXISTS "Admins can insert campaign contacts" ON public.campaign_contacts;
CREATE POLICY "Admins can insert campaign contacts" ON public.campaign_contacts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- whatsapp_templates
DROP POLICY IF EXISTS "Admins can insert templates" ON public.whatsapp_templates;
CREATE POLICY "Admins can insert templates" ON public.whatsapp_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- scheduled_reports
DROP POLICY IF EXISTS "Admins can insert scheduled reports" ON public.scheduled_reports;
CREATE POLICY "Admins can insert scheduled reports" ON public.scheduled_reports
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- meta_capi_events
DROP POLICY IF EXISTS "Admins can view capi events" ON public.meta_capi_events;
CREATE POLICY "Admins can view capi events" ON public.meta_capi_events
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- campaign_contacts
DROP POLICY IF EXISTS "Admins can view campaign contacts" ON public.campaign_contacts;
CREATE POLICY "Admins can view campaign contacts" ON public.campaign_contacts
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- security_alerts
DROP POLICY IF EXISTS "Admins can insert security alerts" ON public.security_alerts;
CREATE POLICY "Admins can insert security alerts" ON public.security_alerts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- products
DROP POLICY IF EXISTS "Admins can insert products" ON public.products;
CREATE POLICY "Admins can insert products" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- scheduled_reports
DROP POLICY IF EXISTS "Admins can view scheduled reports" ON public.scheduled_reports;
CREATE POLICY "Admins can view scheduled reports" ON public.scheduled_reports
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- followup_sequences
DROP POLICY IF EXISTS "Admins can view followup sequences" ON public.followup_sequences;
CREATE POLICY "Admins can view followup sequences" ON public.followup_sequences
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- followup_steps
DROP POLICY IF EXISTS "Admins can view followup steps" ON public.followup_steps;
CREATE POLICY "Admins can view followup steps" ON public.followup_steps
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- Verificacao embutida: falha o replay se alguma das 12 nao ficou registrada.
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
$$;
