CREATE OR REPLACE FUNCTION public.get_my_protection_policy()
 RETURNS TABLE(bloquear_copia boolean, bloquear_impressao boolean, marca_dagua boolean, mascarar_contato boolean, limite_fichas_hora integer, origem text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_role public.app_role;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'get_my_protection_policy: usuario nao autenticado'
      USING ERRCODE = '42501';
  END IF;

  -- Papel do usuario; com mais de um papel vale o de maior privilegio (ordem do enum).
  SELECT ur.role INTO v_role
    FROM public.user_roles ur
   WHERE ur.user_id = v_uid
   ORDER BY ur.role
   LIMIT 1;

  RETURN QUERY
  SELECT COALESCE(rp.bloquear_copia,     gp.bloquear_copia,     true),
         COALESCE(rp.bloquear_impressao, gp.bloquear_impressao, true),
         COALESCE(rp.marca_dagua,        gp.marca_dagua,        true),
         COALESCE(rp.mascarar_contato,   gp.mascarar_contato,   true),
         COALESCE(rp.limite_fichas_hora, gp.limite_fichas_hora, 100),
         CASE WHEN rp.id IS NOT NULL THEN 'papel'
              WHEN gp.id IS NOT NULL THEN 'global'
              ELSE 'padrao' END
    FROM (SELECT 1) AS d
    LEFT JOIN public.contact_protection_policy rp ON rp.scope_role = v_role
    LEFT JOIN public.contact_protection_policy gp ON gp.scope_role IS NULL;
END
$function$
