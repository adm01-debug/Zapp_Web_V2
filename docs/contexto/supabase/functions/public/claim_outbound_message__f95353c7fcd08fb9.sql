CREATE OR REPLACE FUNCTION public.claim_outbound_message(p_message_id uuid, p_agent_id uuid, p_worker text, p_lease_seconds integer DEFAULT 90)
 RETURNS TABLE(message_id uuid, client_message_id uuid, contact_id uuid, agent_id uuid, content text, message_type text, media_url text, caption text, media_filename text, media_mimetype text, reply_to_id uuid, reply_external_id text, whatsapp_connection_id uuid, whatsapp_instance_name text, contact_phone text, claim_token uuid, claim_expires_at timestamp with time zone, delivery_attempt_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_message_id IS NULL OR p_agent_id IS NULL
     OR p_worker IS NULL OR p_worker !~ '^[A-Za-z0-9._:@/-]{1,100}$'
     OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 300 THEN
    RAISE EXCEPTION 'invalid_delivery_claim' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidate AS (
    SELECT message.id, connection.id AS resolved_connection_id
    FROM public.messages AS message
    LEFT JOIN public.contacts AS contact ON contact.id = message.contact_id
    LEFT JOIN public.whatsapp_groups AS grp ON grp.id = message.whatsapp_group_id
    JOIN public.whatsapp_connections AS connection
      ON connection.id = COALESCE(
        message.whatsapp_connection_id, contact.whatsapp_connection_id,
        grp.whatsapp_connection_id
      )
     AND connection.status = 'connected'
     AND NULLIF(connection.instance_id, '') IS NOT NULL
    WHERE message.id = p_message_id
      AND message.agent_id = p_agent_id
      AND message.sender = 'agent'
      AND message.status = 'sending'
      AND message.external_id IS NULL
      AND message.client_message_id IS NOT NULL
      AND (
        (message.contact_id IS NOT NULL
          AND regexp_replace(contact.phone, '\D', '', 'g') ~ '^[0-9]{8,15}$')
        OR (message.whatsapp_group_id IS NOT NULL
          AND grp.group_id ~ '^[0-9][0-9-]*@g[.]us$')
      )
      AND (message.delivery_claim_token IS NULL
        OR message.delivery_claim_expires_at <= statement_timestamp())
      -- PD-79: POST já iniciado = resultado ambíguo (pode ter chegado ao
      -- provedor). NÃO reivindica, haja ou não lease/expiração: um
      -- fail_outbound_message(retryable) limpa token e expiração mas deixa o
      -- carimbo, e a linha voltaria a ser reivindicável (reenvio cego). Sem reenvio
      -- automático: a linha fica em 'sending' até resolução explícita
      -- (fail_outbound_message com o token do lease que carimbou, ou complete).
      AND message.delivery_post_started_at IS NULL
    FOR UPDATE OF message SKIP LOCKED
  ), claimed AS (
    UPDATE public.messages AS message
    SET delivery_claim_token = gen_random_uuid(),
        delivery_claimed_at = statement_timestamp(),
        delivery_claim_expires_at = statement_timestamp()
          + make_interval(secs => p_lease_seconds),
        delivery_claimed_by = p_worker,
        delivery_attempt_count = message.delivery_attempt_count + 1,
        whatsapp_connection_id = candidate.resolved_connection_id,
        updated_at = statement_timestamp()
    FROM candidate
    WHERE message.id = candidate.id
    RETURNING message.*
  )
  SELECT claimed.id, claimed.client_message_id, claimed.contact_id,
         claimed.agent_id, claimed.content, claimed.message_type,
         claimed.media_url, claimed.caption, claimed.media_filename,
         claimed.media_mimetype, claimed.reply_to_id, reply.external_id,
         claimed.whatsapp_connection_id, connection.instance_id,
         CASE
           WHEN claimed.contact_id IS NOT NULL
             THEN regexp_replace(contact.phone, '\D', '', 'g')
           ELSE grp.group_id
         END,
         claimed.delivery_claim_token,
         claimed.delivery_claim_expires_at, claimed.delivery_attempt_count
  FROM claimed
  LEFT JOIN public.contacts AS contact ON contact.id = claimed.contact_id
  LEFT JOIN public.whatsapp_groups AS grp ON grp.id = claimed.whatsapp_group_id
  JOIN public.whatsapp_connections AS connection
    ON connection.id = claimed.whatsapp_connection_id
  LEFT JOIN public.messages AS reply ON reply.id = claimed.reply_to_id;
END;
$function$
