CREATE OR REPLACE FUNCTION public.multiplix_list_ramos()
 RETURNS TABLE(ramo_atividade text, total bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(NULLIF(trim(c.ramo_atividade), ''), 'Não informado') AS ramo_atividade,
         count(*)::bigint AS total
  FROM public.companies c
  WHERE c.deleted_at IS NULL AND c.status = 'ativo'
  GROUP BY 1
  ORDER BY total DESC;
$function$
