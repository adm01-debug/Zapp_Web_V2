CREATE OR REPLACE FUNCTION public.resolve_sla_alert(p_event_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_id uuid;
  v_profile_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sessao_nao_autenticada' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'somente_staff_resolve_alerta' USING ERRCODE = '42501';
  END IF;

  v_profile_id := public.get_profile_id_for_user(auth.uid());

  UPDATE public.sla_alert_events e
     SET resolved_at = now(),
         resolved_by = coalesce(v_profile_id, e.resolved_by)
   WHERE e.id = p_event_id
     AND e.resolved_at IS NULL
  RETURNING e.id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'alerta_inexistente_ou_ja_resolvido' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_id;
END;
$function$
