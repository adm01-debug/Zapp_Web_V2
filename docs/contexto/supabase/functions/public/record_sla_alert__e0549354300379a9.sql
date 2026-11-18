CREATE OR REPLACE FUNCTION public.record_sla_alert(p_contact_id uuid, p_alert_type text, p_severity text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_queue_id uuid;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'sessao_nao_autenticada' USING ERRCODE = '42501';
  END IF;

  IF p_alert_type IS NULL OR p_alert_type NOT IN ('first_response', 'resolution') THEN
    RAISE EXCEPTION 'alert_type_invalido' USING ERRCODE = '22023';
  END IF;

  IF p_severity IS NULL OR p_severity NOT IN ('warning', 'breached') THEN
    RAISE EXCEPTION 'severity_invalida' USING ERRCODE = '22023';
  END IF;

  SELECT c.queue_id INTO v_queue_id
    FROM public.contacts c
   WHERE c.id = p_contact_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'contato_inexistente' USING ERRCODE = '23503';
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT (
       public.is_admin_or_supervisor(auth.uid())
       OR public.is_contact_visible_to_user(p_contact_id, auth.uid())
     ) THEN
    RAISE EXCEPTION 'sem_permissao_para_o_contato' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.sla_alert_events (contact_id, alert_type, severity, queue_id)
  VALUES (p_contact_id, p_alert_type, p_severity, v_queue_id)
  ON CONFLICT (contact_id, alert_type, severity) WHERE resolved_at IS NULL
  DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT e.id INTO v_id
      FROM public.sla_alert_events e
     WHERE e.contact_id = p_contact_id
       AND e.alert_type = p_alert_type
       AND e.severity = p_severity
       AND e.resolved_at IS NULL;
  END IF;

  RETURN v_id;
END;
$function$
