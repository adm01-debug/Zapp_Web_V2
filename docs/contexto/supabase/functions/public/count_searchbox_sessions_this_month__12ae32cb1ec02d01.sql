CREATE OR REPLACE FUNCTION public.count_searchbox_sessions_this_month()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.secd_caller_ok(NULL, false) THEN
    RAISE EXCEPTION 'count_searchbox_sessions_this_month: chamador sem sessao de usuario'
      USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT count(*)::integer
    FROM public.audit_logs
    WHERE action = 'searchbox_session'
      AND created_at >= date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
  );
END;
$function$
