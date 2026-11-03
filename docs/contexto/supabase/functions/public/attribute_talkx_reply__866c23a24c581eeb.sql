CREATE OR REPLACE FUNCTION public.attribute_talkx_reply(p_contact_id uuid, p_phone text, p_message_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_digits    text;
  v_tail      text;
  v_window    numeric;
  v_cutoff    timestamptz;
  v_recipient_id uuid;
  v_campaign_id  uuid;
  v_contact_id   uuid;
  v_attribution  text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_message_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_reply' USING ERRCODE = '22023';
  END IF;

  -- Telefone normalizado: só o sufixo de 8 dígitos casa (tolera DDI/DDD/9º dígito).
  v_digits := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
  v_tail := CASE WHEN length(v_digits) >= 8 THEN right(v_digits, 8) ELSE NULL END;

  IF p_contact_id IS NULL AND v_tail IS NULL THEN
    RETURN jsonb_build_object('attributed', false, 'attribution', NULL, 'reason', 'no_subject');
  END IF;

  -- reply_window_hours é jsonb; `#>> '{}'` extrai o escalar como TEXTO antes do cast
  -- (NULLIF(jsonb, '') não existe — quebra em runtime, não na criação).
  SELECT COALESCE(NULLIF(value #>> '{}', '')::numeric, 72) INTO v_window
    FROM public.talkx_settings WHERE key = 'reply_window_hours' LIMIT 1;
  IF v_window IS NULL OR v_window <= 0 THEN
    v_window := 72;
  END IF;
  v_cutoff := statement_timestamp() - make_interval(hours => v_window::int);

  -- (1) contato exato; (2) mesmo telefone (cobre contato LID/duplicado com outro
  -- contact_id). Destinatário mais recente dentro da janela, ainda sem resposta.
  SELECT recipient.id, recipient.campaign_id, recipient.contact_id
    INTO v_recipient_id, v_campaign_id, v_contact_id
    FROM public.talkx_recipients AS recipient
    LEFT JOIN public.contacts AS contact ON contact.id = recipient.contact_id
   WHERE recipient.replied_at IS NULL
     AND recipient.sent_at IS NOT NULL
     AND recipient.sent_at >= v_cutoff
     AND (
       (p_contact_id IS NOT NULL AND recipient.contact_id = p_contact_id)
       OR (
         v_tail IS NOT NULL
         AND right(regexp_replace(COALESCE(contact.phone, ''), '\D', '', 'g'), 8) = v_tail
       )
     )
   ORDER BY recipient.sent_at DESC, recipient.id DESC
   LIMIT 1
   FOR UPDATE OF recipient;

  IF v_recipient_id IS NULL THEN
    RETURN jsonb_build_object('attributed', false, 'attribution', NULL, 'reason', 'no_recipient_in_window');
  END IF;

  v_attribution := CASE
    WHEN p_contact_id IS NOT NULL AND v_contact_id = p_contact_id THEN 'contact'
    ELSE 'phone'
  END;

  UPDATE public.talkx_recipients
     SET replied_at = statement_timestamp(),
         reply_message_id = p_message_id,
         updated_at = statement_timestamp()
   WHERE id = v_recipient_id
     AND replied_at IS NULL;

  RETURN jsonb_build_object(
    'attributed', true,
    'attribution', v_attribution,
    'recipient_id', v_recipient_id,
    'campaign_id', v_campaign_id
  );
END;
$function$
