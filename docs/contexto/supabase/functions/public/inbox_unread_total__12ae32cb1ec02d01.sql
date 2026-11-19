CREATE OR REPLACE FUNCTION public.inbox_unread_total()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH candidatos AS MATERIALIZED (
    SELECT DISTINCT m.contact_id
    FROM public.messages AS m
    WHERE m.sender = 'contact'
      AND m.is_read IS NOT TRUE
      AND m.contact_id IS NOT NULL
  )
  SELECT COALESCE(count(*), 0)::bigint
  FROM candidatos AS c
  WHERE public.is_contact_visible_to_user(c.contact_id, auth.uid());
$function$
