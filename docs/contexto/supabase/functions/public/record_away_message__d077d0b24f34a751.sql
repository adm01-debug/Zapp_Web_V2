CREATE OR REPLACE FUNCTION public.record_away_message(p_contact_id uuid, p_connection_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_contact_id IS NULL OR p_connection_id IS NULL THEN
    RAISE EXCEPTION 'invalid_away_message_record' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.away_message_log (contact_id, whatsapp_connection_id)
  SELECT p_contact_id, p_connection_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.away_message_log AS l
    WHERE l.contact_id = p_contact_id
      AND l.whatsapp_connection_id = p_connection_id
      AND l.sent_at > now() - interval '24 hours'
  )
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$function$
