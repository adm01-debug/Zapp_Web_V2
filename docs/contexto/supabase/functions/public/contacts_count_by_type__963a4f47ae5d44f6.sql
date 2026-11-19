CREATE OR REPLACE FUNCTION public.contacts_count_by_type(include_legacy boolean DEFAULT false)
 RETURNS TABLE(contact_type text, count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(c.contact_type, 'cliente') AS contact_type, COUNT(*) AS count
  FROM public.contacts c
  WHERE c.deleted_at IS NULL
    AND (include_legacy OR (c.is_lid_legacy = false AND c.phone ~ '^[0-9]{10,15}$'))
  GROUP BY COALESCE(c.contact_type, 'cliente');
$function$
