CREATE OR REPLACE FUNCTION public.is_instance_paused(p_instance text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
     AND NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'sem_permissao_para_consultar_pausa' USING ERRCODE = '42501';
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.instance_pauses p
     WHERE p.instance = btrim(p_instance)
       AND p.resumed_at IS NULL
       AND p.paused_until > now()
  );
END;
$function$
