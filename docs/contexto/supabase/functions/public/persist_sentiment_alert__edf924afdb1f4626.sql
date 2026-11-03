CREATE OR REPLACE FUNCTION public.persist_sentiment_alert(p_analysis_id uuid, p_contact_id uuid, p_recipient_user_id uuid, p_notification_title text, p_notification_message text, p_details jsonb)
 RETURNS TABLE(notification_created boolean, audit_created boolean, duplicate boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_notification_created boolean := false;
  v_audit_created boolean := false;
  v_row_count integer := 0;
  v_existing_notification record;
  v_existing_audit record;
BEGIN
  IF p_details IS NULL OR p_details->>'analysis_id' IS DISTINCT FROM p_analysis_id::text THEN
    RAISE EXCEPTION 'sentiment alert details do not match analysis' USING ERRCODE = '22023';
  END IF;
  IF p_recipient_user_id IS NOT NULL
    AND (nullif(btrim(p_notification_title), '') IS NULL
      OR nullif(btrim(p_notification_message), '') IS NULL) THEN
    RAISE EXCEPTION 'sentiment notification title and message are required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.audit_logs (
    id, action, entity_type, entity_id, user_id, details
  ) VALUES (
    p_analysis_id, 'sentiment_alert', 'contact', p_contact_id,
    p_recipient_user_id, p_details
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING true INTO v_audit_created;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_audit_created := v_row_count = 1;

  IF NOT v_audit_created THEN
    SELECT a.action, a.entity_type, a.entity_id, a.user_id, a.details
      INTO v_existing_audit
    FROM public.audit_logs AS a
    WHERE a.id = p_analysis_id;
    IF NOT FOUND
      OR v_existing_audit.action IS DISTINCT FROM 'sentiment_alert'
      OR v_existing_audit.entity_type IS DISTINCT FROM 'contact'
      OR v_existing_audit.entity_id IS DISTINCT FROM p_contact_id
      OR v_existing_audit.user_id IS DISTINCT FROM p_recipient_user_id
      OR v_existing_audit.details->>'analysis_id' IS DISTINCT FROM p_analysis_id::text THEN
      RAISE EXCEPTION 'sentiment audit identity conflict' USING ERRCODE = '23505';
    END IF;
  END IF;

  IF p_recipient_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (id, user_id, title, message, type, metadata)
    VALUES (
      p_analysis_id, p_recipient_user_id, p_notification_title,
      p_notification_message, 'sentiment_alert', p_details
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING true INTO v_notification_created;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_notification_created := v_row_count = 1;

    IF NOT v_notification_created THEN
      SELECT n.user_id, n.type, n.metadata INTO v_existing_notification
      FROM public.notifications AS n
      WHERE n.id = p_analysis_id;
      IF NOT FOUND
        OR v_existing_notification.user_id IS DISTINCT FROM p_recipient_user_id
        OR v_existing_notification.type IS DISTINCT FROM 'sentiment_alert'
        OR v_existing_notification.metadata->>'analysis_id' IS DISTINCT FROM p_analysis_id::text THEN
        RAISE EXCEPTION 'sentiment notification identity conflict' USING ERRCODE = '23505';
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT
    v_notification_created,
    v_audit_created,
    NOT v_audit_created OR (p_recipient_user_id IS NOT NULL AND NOT v_notification_created);
END;
$function$
