CREATE OR REPLACE FUNCTION public.talkx_block_recipient(p_recipient_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor       uuid;
  v_campaign_id uuid;
  v_contact_id  uuid;
  v_phone       text;
  v_id          uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT profile.id INTO v_actor
  FROM public.profiles AS profile
  WHERE profile.user_id = auth.uid() AND profile.is_active = true
  LIMIT 1;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;

  IF coalesce(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_block_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_recipient_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_block_request' USING ERRCODE = '22023';
  END IF;

  -- Telefone: só dígitos e no formato 10-15 dígitos (mesma regra do gatilho
  -- trg_talkx_blacklist_audit, que NÃO existe em todo banco). Fora disso grava phone NULL
  -- e o bloqueio vale só pelo contact_id.
  SELECT recipient.campaign_id, recipient.contact_id,
         CASE WHEN regexp_replace(coalesce(contact.phone, ''), '\D', '', 'g') ~ '^[0-9]{10,15}$'
              THEN regexp_replace(contact.phone, '\D', '', 'g') END
    INTO v_campaign_id, v_contact_id, v_phone
  FROM public.talkx_recipients AS recipient
  LEFT JOIN public.contacts AS contact ON contact.id = recipient.contact_id
  WHERE recipient.id = p_recipient_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_block_recipient_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.talkx_blacklist AS b
     SET removed_at = statement_timestamp()
   WHERE b.removed_at IS NULL
     AND b.expires_at IS NOT NULL
     AND b.expires_at <= statement_timestamp()
     AND (b.contact_id = v_contact_id OR (v_phone IS NOT NULL AND b.phone = v_phone));

  INSERT INTO public.talkx_blacklist
    (contact_id, phone, reason, reason_code, origin, campaign_id, blocked_by)
  VALUES
    (v_contact_id, v_phone, 'Bloqueado manualmente pelo gestor', 'manual', 'manual', v_campaign_id, v_actor)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$

COMMENT ON FUNCTION public.talkx_block_recipient(uuid) IS
  'Talk X: bloqueio manual de destinatário pelo gestor (admin/supervisor). Dados vêm do destinatário no servidor; origin/reason_code manual; não altera consentimento. Retorna id da supressão ou NULL se já bloqueado.'

REVOKE ALL ON FUNCTION public.talkx_block_recipient(uuid) FROM PUBLIC, anon, service_role

GRANT EXECUTE ON FUNCTION public.talkx_block_recipient(uuid) TO authenticated
