
-- Fix CRITICAL: Remove OR true from profiles SELECT
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

-- Fix CRITICAL: Prevent privilege escalation via profile UPDATE
-- Add trigger to block role/permissions/access_level changes by non-admins
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If role, permissions, or access_level are being changed
  IF (OLD.role IS DISTINCT FROM NEW.role) OR 
     (OLD.permissions IS DISTINCT FROM NEW.permissions) OR 
     (OLD.access_level IS DISTINCT FROM NEW.access_level) THEN
    -- Only allow if user is admin or supervisor
    IF NOT is_admin_or_supervisor(auth.uid()) THEN
      RAISE EXCEPTION 'Only administrators can modify role, permissions, or access_level';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_privilege_escalation ON public.profiles;
CREATE TRIGGER prevent_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- Fix: conversation_sla SELECT - restrict to assigned contacts or admin
DROP POLICY IF EXISTS "Authenticated can view conversation sla" ON public.conversation_sla;
DROP POLICY IF EXISTS "Authenticated users can view SLA data" ON public.conversation_sla;
CREATE POLICY "Authenticated users can view SLA data" ON public.conversation_sla
  FOR SELECT TO authenticated
  USING (
    contact_id IN (
      SELECT c.id FROM contacts c 
      WHERE c.assigned_to IN (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid())
    )
    OR is_admin_or_supervisor(auth.uid())
  );

-- Fix: rate_limit_configs SELECT - admin/supervisor only
DROP POLICY IF EXISTS "Authenticated can view rate limit configs" ON public.rate_limit_configs;
DROP POLICY IF EXISTS "Authenticated users can read rate limit configs" ON public.rate_limit_configs;
CREATE POLICY "Admins can read rate limit configs" ON public.rate_limit_configs
  FOR SELECT TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
