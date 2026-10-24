-- 1. Make audio-messages bucket private
UPDATE storage.buckets SET public = false WHERE id = 'audio-messages';

-- 2. Audit trigger on user_roles for privilege escalation detection
CREATE OR REPLACE FUNCTION public.audit_role_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'role_deleted',
      'user_roles',
      OLD.id::text,
      jsonb_build_object('user_id', OLD.user_id, 'role', OLD.role)
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'role_updated',
      'user_roles',
      NEW.id::text,
      jsonb_build_object(
        'user_id', NEW.user_id,
        'old_role', OLD.role,
        'new_role', NEW.role
      )
    );
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(),
      'role_created',
      'user_roles',
      NEW.id::text,
      jsonb_build_object('user_id', NEW.user_id, 'role', NEW.role)
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER audit_user_role_changes
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.audit_role_changes();