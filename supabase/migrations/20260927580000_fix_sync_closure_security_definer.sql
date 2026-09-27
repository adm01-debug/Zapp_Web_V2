CREATE OR REPLACE FUNCTION public.sync_contact_status_on_closure()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  UPDATE public.contacts
  SET conversation_status = 'resolved'
  WHERE id = NEW.contact_id
    AND conversation_status IS DISTINCT FROM 'resolved';
  RETURN NEW;
END;
$function$;
