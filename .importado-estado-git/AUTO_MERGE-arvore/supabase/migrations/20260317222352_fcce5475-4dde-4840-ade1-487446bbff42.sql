
-- =====================================================
-- SECURITY HARDENING MIGRATION
-- Fix all critical RLS vulnerabilities
-- =====================================================

-- 1. CRITICAL: user_sessions - restrict INSERT to authenticated + own user_id
DROP POLICY IF EXISTS "System can insert sessions" ON public.user_sessions;
CREATE POLICY "Authenticated can insert own sessions" ON public.user_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Update other user_sessions policies from public to authenticated
DROP POLICY IF EXISTS "Users can view their own sessions" ON public.user_sessions;
CREATE POLICY "Users can view their own sessions" ON public.user_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own sessions" ON public.user_sessions;
CREATE POLICY "Users can update their own sessions" ON public.user_sessions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own sessions" ON public.user_sessions;
CREATE POLICY "Users can delete their own sessions" ON public.user_sessions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 2. CRITICAL: password_reset_requests - restrict INSERT
DROP POLICY IF EXISTS "Anyone can request reset" ON public.password_reset_requests;
CREATE POLICY "Authenticated can request own reset" ON public.password_reset_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Fix other password_reset_requests policies to authenticated
DROP POLICY IF EXISTS "Users can view own reset requests" ON public.password_reset_requests;
CREATE POLICY "Users can view own reset requests" ON public.password_reset_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS "Admins can update reset requests" ON public.password_reset_requests;
CREATE POLICY "Admins can update reset requests" ON public.password_reset_requests
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- 3. CRITICAL: notifications - restrict INSERT to own user_id
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;
CREATE POLICY "Users can insert own notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Fix notifications policies from public to authenticated
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
CREATE POLICY "Users can delete own notifications" ON public.notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 4. webauthn_challenges - fix WITH CHECK to enforce user_id
DROP POLICY IF EXISTS "Users can manage own challenges" ON public.webauthn_challenges;
CREATE POLICY "Users can manage own challenges" ON public.webauthn_challenges
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 5. security_alerts - restrict INSERT to admin/supervisor only
DROP POLICY IF EXISTS "Authenticated can insert security alerts" ON public.security_alerts;
CREATE POLICY "Admins can insert security alerts" ON public.security_alerts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- Fix security_alerts manage policy from public to authenticated
DROP POLICY IF EXISTS "Admins can manage security alerts" ON public.security_alerts;
CREATE POLICY "Admins can manage security alerts" ON public.security_alerts
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- 6. geo_blocking_settings - restrict SELECT to authenticated
DROP POLICY IF EXISTS "Anyone can view geo settings" ON public.geo_blocking_settings;
CREATE POLICY "Authenticated can view geo settings" ON public.geo_blocking_settings
  FOR SELECT TO authenticated
  USING (true);

-- Fix manage policy from public to authenticated
DROP POLICY IF EXISTS "Admins can manage geo settings" ON public.geo_blocking_settings;
CREATE POLICY "Admins can manage geo settings" ON public.geo_blocking_settings
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- 7. login_attempts - add RLS policies (table has RLS enabled but no policies)
CREATE POLICY "Users can view own login attempts" ON public.login_attempts
  FOR SELECT TO authenticated
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- 8. Fix policies using {public} role that should be {authenticated}
-- allowed_countries
DROP POLICY IF EXISTS "Admins can view allowed countries" ON public.allowed_countries;
CREATE POLICY "Admins can view allowed countries" ON public.allowed_countries
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert allowed countries" ON public.allowed_countries;
CREATE POLICY "Admins can insert allowed countries" ON public.allowed_countries
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete allowed countries" ON public.allowed_countries;
CREATE POLICY "Admins can delete allowed countries" ON public.allowed_countries
  FOR DELETE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- blocked_countries
DROP POLICY IF EXISTS "Admins can view blocked countries" ON public.blocked_countries;
CREATE POLICY "Admins can view blocked countries" ON public.blocked_countries
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert blocked countries" ON public.blocked_countries;
CREATE POLICY "Admins can insert blocked countries" ON public.blocked_countries
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete blocked countries" ON public.blocked_countries;
CREATE POLICY "Admins can delete blocked countries" ON public.blocked_countries
  FOR DELETE TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- blocked_ips
DROP POLICY IF EXISTS "Admins can manage blocked IPs" ON public.blocked_ips;
CREATE POLICY "Admins can manage blocked IPs" ON public.blocked_ips
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

-- away_messages
DROP POLICY IF EXISTS "Admins can manage away messages" ON public.away_messages;
CREATE POLICY "Admins can manage away messages" ON public.away_messages
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view away messages" ON public.away_messages;
CREATE POLICY "Authenticated users can view away messages" ON public.away_messages
  FOR SELECT TO authenticated
  USING (true);

-- business_hours
DROP POLICY IF EXISTS "Admins can manage business hours" ON public.business_hours;
CREATE POLICY "Admins can manage business hours" ON public.business_hours
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view business hours" ON public.business_hours;
CREATE POLICY "Authenticated users can view business hours" ON public.business_hours
  FOR SELECT TO authenticated
  USING (true);

-- contact_notes (already has good checks, just fix public → authenticated)
DROP POLICY IF EXISTS "Authenticated users can insert notes" ON public.contact_notes;
CREATE POLICY "Authenticated users can insert notes" ON public.contact_notes
  FOR INSERT TO authenticated
  WITH CHECK (author_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update their own notes" ON public.contact_notes;
CREATE POLICY "Users can update their own notes" ON public.contact_notes
  FOR UPDATE TO authenticated
  USING (author_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete their own notes" ON public.contact_notes;
CREATE POLICY "Users can delete their own notes" ON public.contact_notes
  FOR DELETE TO authenticated
  USING (author_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view notes on accessible contacts" ON public.contact_notes;
CREATE POLICY "Users can view notes on accessible contacts" ON public.contact_notes
  FOR SELECT TO authenticated
  USING (
    contact_id IN (
      SELECT c.id FROM contacts c
      WHERE c.assigned_to IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
    ) OR public.is_admin_or_supervisor(auth.uid())
  );

-- agent_stats (fix public → authenticated)
DROP POLICY IF EXISTS "Users can update their own stats" ON public.agent_stats;
CREATE POLICY "Users can update their own stats" ON public.agent_stats
  FOR UPDATE TO authenticated
  USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- 9. Fix function with mutable search_path
CREATE OR REPLACE FUNCTION public.update_global_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
