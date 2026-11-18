CREATE OR REPLACE FUNCTION public.enforce_contacts_consent_status_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.consent_status IS NOT DISTINCT FROM OLD.consent_status THEN RETURN NEW; END IF;
  IF COALESCE(auth.role(),'') IN ('service_role','') OR COALESCE(public.has_role(auth.uid(),'admin'),false) THEN RETURN NEW; END IF;
  INSERT INTO public.audit_logs (user_id,action,entity_type,entity_id,details)
  VALUES (auth.uid(),'contact_consent_status_change_denied','contacts',OLD.id,jsonb_build_object('contact_id',OLD.id,'from',OLD.consent_status,'to',NEW.consent_status));
  NEW.consent_status := OLD.consent_status;
  RETURN NEW;
END;
$function$
