-- talkx_retry_lote_ids_inexistentes
-- Rollback: recriar public.retry_talkx_recipients(uuid, uuid[]) com o corpo vivo de
--   20261003222707_talkx_retry_resolve.sql (validacao por CONTAGEM DE LINHAS: v_found = count(*)
--   e v_valid = count(*) FILTER (WHERE campaign_id = p_campaign_id), comparados com "<>").
--
-- marcador interno (o teste de banco procura por ele; sobrevive ao rename do --nova):
--   talkx_retry_ids_inexistentes
--
-- #123 / R3-DELTA-004 (P2) — retry manual em lote aceita IDs inexistentes e pode
-- reabrir campanha sem destinatario.
--
-- Defeito: o corpo de 20261003222707 valida o lote comparando LINHAS encontradas
-- com linhas encontradas NA campanha:
--
--     SELECT count(*), count(*) FILTER (WHERE recipient.campaign_id = p_campaign_id)
--       INTO v_found, v_valid
--       FROM public.talkx_recipients AS recipient
--      WHERE recipient.id = ANY(p_recipient_ids);
--     IF v_found <> v_valid THEN ... not_found ...
--
-- Um id que NAO existe nao entra em nenhuma das duas contagens, entao um lote
-- inteiramente inexistente passa pelo "0 = 0". O laco de validacao nao itera, o
-- UPDATE dos destinatarios nao toca nenhuma linha e, se a campanha estava
-- 'completed', ela e reaberta para 'sending' (completed_at zerado + evento
-- 'resumed') SEM nenhum destinatario elegivel — o tick seguinte nao tem o que
-- enviar e a campanha fica presa em 'sending'. Um lote MISTO (id valido +
-- inexistente) tambem passava, retentando so a parte valida (envio parcial).
-- Id de OUTRA campanha entrava na contagem de linhas e escapava do mesmo jeito.
--
-- Correcao: comparar o conjunto PEDIDO (ids distintos, nao nulos, do array) com o
-- conjunto ENCONTRADO na campanha (ids distintos que existem nela). Tudo-ou-nada,
-- fail-closed, sem mudar a assinatura nem o nome do erro devolvido
-- ('talkx_retry_recipient_not_found', P0002). Com isso o lote aceito sempre tem
-- pelo menos um destinatario, entao a reabertura de campanha nunca mais fica sem
-- pendente; que o array (1..500 ids) nao seja vazio ja e garantido acima.
-- Id nulo dentro do array tambem nao e um destinatario pedido: recusado como
-- 'invalid_talkx_retry_request' (22023), o mesmo erro do array vazio/maior que 500.

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
