
-- =====================================================
-- PHASE 6: Fix privilege escalation and data exposure
-- =====================================================

-- 1. FIX PRIVILEGE ESCALATION: Replace inline profiles.role checks with is_admin_or_supervisor()
DROP POLICY IF EXISTS "Users can view their assigned contacts" ON public.contacts;
CREATE POLICY "Users can view their assigned contacts" ON public.contacts
  FOR SELECT TO authenticated
  USING (
    assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

DROP POLICY IF EXISTS "Users can update their assigned contacts" ON public.contacts;
CREATE POLICY "Users can update their assigned contacts" ON public.contacts
  FOR UPDATE TO authenticated
  USING (
    assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can manage wallet rules" ON public.client_wallet_rules;
CREATE POLICY "Admins can manage wallet rules" ON public.client_wallet_rules
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- 2. PROFILES: Restrict SELECT - agents see limited data, admins see all
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- 3. WHISPER_MESSAGES: Only sender, target, or admin can read
DROP POLICY IF EXISTS "Authenticated can view whisper messages" ON public.whisper_messages;
CREATE POLICY "Users can view own whisper messages" ON public.whisper_messages
  FOR SELECT TO authenticated
  USING (
    sender_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR target_agent_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- 4. WHATSAPP_CONNECTIONS: Admin/supervisor only
DROP POLICY IF EXISTS "Authenticated users can view connections" ON public.whatsapp_connections;
CREATE POLICY "Admins can view whatsapp connections" ON public.whatsapp_connections
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- 5. PAYMENT_LINKS: Only creator or admin
DROP POLICY IF EXISTS "Authenticated can view payment links" ON public.payment_links;
CREATE POLICY "Users can view own payment links" ON public.payment_links
  FOR SELECT TO authenticated
  USING (
    created_by IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- 6. ENTITY_VERSIONS: Admin/supervisor only
DROP POLICY IF EXISTS "Authenticated can view versions" ON public.entity_versions;
CREATE POLICY "Admins can view entity versions" ON public.entity_versions
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- 7. GLOBAL_SETTINGS: Admin/supervisor only
DROP POLICY IF EXISTS "Anyone can view global settings" ON public.global_settings;
CREATE POLICY "Admins can view global settings" ON public.global_settings
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- 8. CALLS: Only agent's own calls or admin
DROP POLICY IF EXISTS "Users can view calls" ON public.calls;
CREATE POLICY "Users can view own calls" ON public.calls
  FOR SELECT TO authenticated
  USING (
    agent_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- 9. CSAT_SURVEYS: Only agent's own surveys or admin
DROP POLICY IF EXISTS "Authenticated users can view CSAT surveys" ON public.csat_surveys;
CREATE POLICY "Users can view own CSAT surveys" ON public.csat_surveys
  FOR SELECT TO authenticated
  USING (
    agent_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- 10. SCHEDULED_REPORTS: Admin/supervisor only
DROP POLICY IF EXISTS "Authenticated users can view scheduled reports" ON public.scheduled_reports;
CREATE POLICY "Admins can view scheduled reports" ON public.scheduled_reports
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- 11. USER_ROLES: Own row or admin
DROP POLICY IF EXISTS "Users can view all roles" ON public.user_roles;
CREATE POLICY "Users can view own role" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()));

-- 12. FIX REMAINING INSERT WITH CHECK(true)
-- ai_conversation_tags - restrict to contacts assigned to user
DROP POLICY IF EXISTS "Authenticated can insert ai tags" ON public.ai_conversation_tags;
CREATE POLICY "Users can insert ai tags for assigned contacts" ON public.ai_conversation_tags
  FOR INSERT TO authenticated
  WITH CHECK (
    contact_id IN (
      SELECT c.id FROM contacts c
      WHERE c.assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    ) OR public.is_admin_or_supervisor(auth.uid())
  );

-- contact_custom_fields - restrict to assigned contacts
DROP POLICY IF EXISTS "Authenticated can insert custom fields" ON public.contact_custom_fields;
CREATE POLICY "Users can insert custom fields for assigned contacts" ON public.contact_custom_fields
  FOR INSERT TO authenticated
  WITH CHECK (
    contact_id IN (
      SELECT c.id FROM contacts c
      WHERE c.assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    ) OR public.is_admin_or_supervisor(auth.uid())
  );

-- contact_tags - restrict to assigned contacts
DROP POLICY IF EXISTS "Authenticated can insert contact tags" ON public.contact_tags;
CREATE POLICY "Users can insert tags for assigned contacts" ON public.contact_tags
  FOR INSERT TO authenticated
  WITH CHECK (
    contact_id IN (
      SELECT c.id FROM contacts c
      WHERE c.assigned_to IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    ) OR public.is_admin_or_supervisor(auth.uid())
  );

-- contacts INSERT - keep open for agents (CRM requirement, no ownership column at creation)
-- This is the ONLY remaining WITH CHECK(true) - intentional for CRM
