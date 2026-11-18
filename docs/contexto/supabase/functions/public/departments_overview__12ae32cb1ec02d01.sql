CREATE OR REPLACE FUNCTION public.departments_overview()
 RETURNS TABLE(department_id uuid, name text, is_active boolean, member_count bigint, queue_count bigint, conversation_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    d.id,
    d.name,
    d.is_active,
    (SELECT count(*) FROM public.profiles p WHERE p.department_id = d.id),
    (SELECT count(DISTINCT qm.queue_id)
       FROM public.queue_members qm
       JOIN public.profiles p2 ON p2.id = qm.profile_id
      WHERE p2.department_id = d.id
        AND qm.is_active IS NOT FALSE),
    (SELECT count(*) FROM public.team_conversations tc WHERE tc.department_id = d.id)
  FROM public.departments d
  ORDER BY d.name;
END;
$function$
