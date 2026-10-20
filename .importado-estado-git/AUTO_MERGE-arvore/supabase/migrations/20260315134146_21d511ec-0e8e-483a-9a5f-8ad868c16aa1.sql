-- FIX #1: Prevent users from escalating privileges via profiles.role column
-- Create a trigger that prevents non-admins from changing their own role
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- If role is being changed, only allow admins/supervisors
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
      -- Silently revert the role change
      NEW.role := OLD.role;
    END IF;
  END IF;
  
  -- Also prevent non-admins from changing access_level and permissions
  IF OLD.access_level IS DISTINCT FROM NEW.access_level THEN
    IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
      NEW.access_level := OLD.access_level;
    END IF;
  END IF;
  
  IF OLD.permissions IS DISTINCT FROM NEW.permissions THEN
    IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
      NEW.permissions := OLD.permissions;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_role_escalation_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_escalation();

-- FIX #3: Replace permissive auto_close_config ALL policy with admin-only
DROP POLICY IF EXISTS "Authenticated users can manage auto-close config" ON public.auto_close_config;

CREATE POLICY "Admins can manage auto-close config"
  ON public.auto_close_config
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));