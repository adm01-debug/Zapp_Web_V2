CREATE OR REPLACE FUNCTION public.multiplix_list_ufs()
 RETURNS TABLE(uf text, total bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT ca.estado AS uf, count(DISTINCT ca.company_id)::bigint AS total
  FROM public.company_addresses ca
  JOIN public.companies c ON c.id = ca.company_id
  WHERE ca.is_primary = true AND ca.estado IS NOT NULL
    AND c.deleted_at IS NULL AND c.status = 'ativo'
  GROUP BY 1
  ORDER BY total DESC;
$function$
