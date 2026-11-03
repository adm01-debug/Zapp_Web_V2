CREATE OR REPLACE FUNCTION public.talkx_recipient_is_suppressed(p_contact_id uuid, p_phone text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.talkx_blacklist AS blacklist
    WHERE blacklist.removed_at IS NULL
      AND (blacklist.expires_at IS NULL OR blacklist.expires_at > statement_timestamp())
      AND (
        blacklist.contact_id = p_contact_id
        OR (
          NULLIF(regexp_replace(COALESCE(blacklist.phone, ''), '\D', '', 'g'), '') IS NOT NULL
          AND regexp_replace(COALESCE(blacklist.phone, ''), '\D', '', 'g') = regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g')
        )
      )
  );
END;
$function$
