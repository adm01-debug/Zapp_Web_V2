
-- =====================================================
-- PHASE 5: Tighten remaining INSERT WITH CHECK(true)
-- =====================================================

-- messages - agent_id must be the authenticated user's profile
DROP POLICY IF EXISTS "Authenticated users can insert messages" ON public.messages;
CREATE POLICY "Users can insert messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    agent_id IS NULL 
    OR agent_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- contacts - any authenticated agent can create contacts (CRM requirement)
-- Keep as is but ensure authenticated role (already is)

-- tags - restrict to admin or use created_by
DROP POLICY IF EXISTS "Authenticated users can insert tags" ON public.tags;
CREATE POLICY "Users can insert tags" ON public.tags
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by IS NULL
    OR created_by IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- conversation_analyses - analyzed_by must be current user
DROP POLICY IF EXISTS "Authenticated users can insert analyses" ON public.conversation_analyses;
CREATE POLICY "Users can insert own analyses" ON public.conversation_analyses
  FOR INSERT TO authenticated
  WITH CHECK (
    analyzed_by IS NULL
    OR analyzed_by IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- csat_surveys - agent_id must be current user
DROP POLICY IF EXISTS "Authenticated users can insert CSAT surveys" ON public.csat_surveys;
CREATE POLICY "Users can insert CSAT surveys" ON public.csat_surveys
  FOR INSERT TO authenticated
  WITH CHECK (
    agent_id IS NULL
    OR agent_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- whisper_messages - sender must be current user
DROP POLICY IF EXISTS "Authenticated can insert whisper messages" ON public.whisper_messages;
CREATE POLICY "Users can insert own whisper messages" ON public.whisper_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- sales_deals - assigned_to check
DROP POLICY IF EXISTS "Authenticated can insert deals" ON public.sales_deals;
CREATE POLICY "Users can insert deals" ON public.sales_deals
  FOR INSERT TO authenticated
  WITH CHECK (
    assigned_to IS NULL
    OR assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- conversation_sla - restrict to admin/supervisor
DROP POLICY IF EXISTS "Authenticated users can insert SLA" ON public.conversation_sla;
CREATE POLICY "Admins can insert SLA" ON public.conversation_sla
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- ai_conversation_tags - no ownership column, keep authenticated (system data)
-- contact_custom_fields - no ownership column, keep authenticated (agent work)
-- contact_tags - no ownership column, keep authenticated (agent work)
-- contacts - no strict ownership, any agent can create (CRM requirement)
