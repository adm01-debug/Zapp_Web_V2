CREATE OR REPLACE FUNCTION public.retry_talkx_recipients(
  p_campaign_id   uuid,
  p_recipient_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor       uuid;
  v_campaign    public.talkx_campaigns%ROWTYPE;
  v_pedidos     integer;
  v_pedidos_nulos integer;
  v_validos     integer;
  v_failed      integer;
  v_skipped     integer;
  v_reopened    boolean := false;
  v_message     jsonb;
  rec           record;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT profile.id INTO v_actor
    FROM public.profiles profile
   WHERE profile.user_id = auth.uid()
     AND profile.is_active = true
   LIMIT 1
   FOR SHARE;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'active_profile_not_found' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(public.is_admin_or_supervisor(auth.uid()), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'talkx_retry_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_campaign_id IS NULL
     OR p_recipient_ids IS NULL
     OR array_length(p_recipient_ids, 1) IS NULL
     OR array_length(p_recipient_ids, 1) > 500 THEN
    RAISE EXCEPTION 'invalid_talkx_retry_request' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_campaign
    FROM public.talkx_campaigns AS campaign
   WHERE campaign.id = p_campaign_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_campaign_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- Retry manual so faz sentido em campanha que ja rodou. Rascunho/agendada nunca
  -- enviou; cancelada e terminal.
  IF v_campaign.status NOT IN ('sending', 'paused', 'completed') THEN
    RAISE EXCEPTION 'talkx_campaign_not_retryable_from_%', v_campaign.status USING ERRCODE = '55000';
  END IF;

  -- Conjunto PEDIDO: ids distintos do array. Nulo nao e destinatario.
  -- (Antes, este trecho contava LINHAS: id inexistente nao entrava na conta e o
  --  lote vazio passava; id de outra campanha entrava no total.)
  SELECT count(DISTINCT pedido.id), count(*) FILTER (WHERE pedido.id IS NULL)
    INTO v_pedidos, v_pedidos_nulos
    FROM unnest(p_recipient_ids) AS pedido(id);
  IF v_pedidos_nulos > 0 THEN
    RAISE EXCEPTION 'invalid_talkx_retry_request' USING ERRCODE = '22023';
  END IF;

  -- Conjunto ENCONTRADO na campanha. Todo id pedido precisa existir AQUI:
  -- fail-closed, tudo-ou-nada.
  SELECT count(DISTINCT recipient.id)
    INTO v_validos
    FROM public.talkx_recipients AS recipient
   WHERE recipient.campaign_id = p_campaign_id
     AND recipient.id = ANY(p_recipient_ids);
  IF v_validos <> v_pedidos THEN
    RAISE EXCEPTION 'talkx_retry_recipient_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Valida cada destinatario ANTES de escrever qualquer linha.
  FOR rec IN
    SELECT recipient.id, recipient.status, recipient.manual_retry_count, recipient.contact_id
      FROM public.talkx_recipients AS recipient
     WHERE recipient.campaign_id = p_campaign_id
       AND recipient.id = ANY(p_recipient_ids)
     FOR UPDATE
  LOOP
    IF rec.status NOT IN ('failed', 'skipped') THEN
      RAISE EXCEPTION 'talkx_retry_recipient_not_terminal' USING ERRCODE = '55000';
    END IF;
    IF rec.manual_retry_count >= 3 THEN
      RAISE EXCEPTION 'talkx_retry_limit_reached' USING ERRCODE = '55000';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.contacts AS contact
       WHERE contact.id = rec.contact_id
         AND contact.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'talkx_retry_recipient_ineligible' USING ERRCODE = '55000';
    END IF;
    IF EXISTS (
      SELECT 1
        FROM public.talkx_blacklist AS blacklist
        LEFT JOIN public.contacts AS contact ON contact.id = rec.contact_id
       WHERE blacklist.removed_at IS NULL
         AND (blacklist.expires_at IS NULL OR blacklist.expires_at > statement_timestamp())
         AND (
           blacklist.contact_id = rec.contact_id
           OR (
             NULLIF(regexp_replace(COALESCE(blacklist.phone, ''), '\D', '', 'g'), '') IS NOT NULL
             AND contact.id IS NOT NULL
             AND regexp_replace(COALESCE(blacklist.phone, ''), '\D', '', 'g') = regexp_replace(COALESCE(contact.phone, ''), '\D', '', 'g')
           )
         )
    ) THEN
      RAISE EXCEPTION 'talkx_retry_recipient_suppressed' USING ERRCODE = '55000';
    END IF;
  END LOOP;

  SELECT count(*) FILTER (WHERE recipient.status = 'failed'),
         count(*) FILTER (WHERE recipient.status = 'skipped')
    INTO v_failed, v_skipped
    FROM public.talkx_recipients AS recipient
   WHERE recipient.campaign_id = p_campaign_id
     AND recipient.id = ANY(p_recipient_ids);

  UPDATE public.talkx_recipients AS recipient
     SET status                    = 'pending',
         retry_after               = statement_timestamp(),
         manual_retry_count        = recipient.manual_retry_count + 1,
         error_message             = NULL,
         provider_dispatch_started_at = NULL,
         delivery_claim_token      = NULL,
         delivery_claimed_at       = NULL,
         delivery_claim_expires_at = NULL,
         delivery_claimed_by       = NULL,
         updated_at                = statement_timestamp()
   WHERE recipient.campaign_id = p_campaign_id
     AND recipient.id = ANY(p_recipient_ids);

  v_reopened := (v_campaign.status = 'completed');

  -- Fuga transacional do guard para ajustar contadores e reabrir a campanha.
  PERFORM set_config('app.talkx_retry_write', 'on', true);
  UPDATE public.talkx_campaigns AS campaign
     SET failed_count  = GREATEST(campaign.failed_count - v_failed, 0),
         skipped_count = GREATEST(campaign.skipped_count - v_skipped, 0),
         status        = CASE WHEN campaign.status = 'completed' THEN 'sending' ELSE campaign.status END,
         completed_at  = CASE WHEN campaign.status = 'completed' THEN NULL ELSE campaign.completed_at END,
         updated_at    = statement_timestamp()
   WHERE campaign.id = p_campaign_id;

  v_message := jsonb_build_object(
    'action', 'retry_talkx_recipients',
    'count', v_failed + v_skipped,
    'failed', v_failed,
    'skipped', v_skipped,
    'reopened', v_reopened,
    'recipient_ids', to_jsonb(p_recipient_ids)
  );

  INSERT INTO public.talkx_campaign_events (campaign_id, event_type, message, actor_id)
  VALUES (p_campaign_id, 'note', v_message::text, v_actor);

  IF v_reopened THEN
    INSERT INTO public.talkx_campaign_events (campaign_id, event_type, message, actor_id)
    VALUES (p_campaign_id, 'resumed', NULL, v_actor);
  END IF;

  RETURN v_message;
END;
$function$;
