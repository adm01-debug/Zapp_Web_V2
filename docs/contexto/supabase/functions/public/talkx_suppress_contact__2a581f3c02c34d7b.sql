CREATE OR REPLACE FUNCTION public.talkx_suppress_contact(p_contact_id uuid, p_phone text, p_reason text, p_reason_code text, p_origin text, p_source_message_id uuid, p_campaign_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
  v_campaign_id uuid := p_campaign_id;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF v_campaign_id IS NULL AND p_origin = 'auto_optout' AND p_contact_id IS NOT NULL THEN
    SELECT r.campaign_id INTO v_campaign_id
      FROM public.talkx_recipients AS r
     WHERE r.contact_id = p_contact_id AND r.sent_at IS NOT NULL
     ORDER BY r.sent_at DESC, r.id DESC LIMIT 1;
  END IF;
  UPDATE public.talkx_blacklist AS b
     SET removed_at = statement_timestamp()
   WHERE b.removed_at IS NULL AND b.expires_at IS NOT NULL
     AND b.expires_at <= statement_timestamp()
     AND ((p_contact_id IS NOT NULL AND b.contact_id = p_contact_id)
       OR (p_phone IS NOT NULL AND b.phone = p_phone));
  INSERT INTO public.talkx_blacklist
    (contact_id, phone, reason, reason_code, origin, source_message_id, campaign_id)
  VALUES
    (p_contact_id, p_phone, p_reason, p_reason_code, p_origin, p_source_message_id, v_campaign_id)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;
  IF p_origin = 'auto_optout' AND p_contact_id IS NOT NULL THEN
    UPDATE public.contacts AS c
       SET consent_status = 'revoked', updated_at = statement_timestamp()
     WHERE c.id = p_contact_id AND c.consent_status IS DISTINCT FROM 'revoked';
  END IF;
  RETURN v_id;
END;
$function$
