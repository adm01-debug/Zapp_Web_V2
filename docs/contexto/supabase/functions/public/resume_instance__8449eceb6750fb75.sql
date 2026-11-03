CREATE OR REPLACE FUNCTION public.resume_instance(p_instance text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_profile_id uuid;
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sessao_nao_autenticada' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'somente_staff_retoma_instancia' USING ERRCODE = '42501';
  END IF;

  IF p_instance IS NULL OR btrim(p_instance) = '' THEN
    RAISE EXCEPTION 'instancia_invalida' USING ERRCODE = '22023';
  END IF;

  v_profile_id := public.get_profile_id_for_user(auth.uid());

  UPDATE public.instance_pauses
     SET resumed_at = now(),
         resumed_by = v_profile_id
   WHERE instance = btrim(p_instance)
     AND resumed_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$
