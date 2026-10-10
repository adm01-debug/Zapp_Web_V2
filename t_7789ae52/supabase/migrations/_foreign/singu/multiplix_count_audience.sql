CREATE OR REPLACE FUNCTION public.multiplix_count_audience(p_roles text[] DEFAULT NULL::text[], p_ramo text DEFAULT NULL::text, p_uf text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_scope_permissions text[] DEFAULT ARRAY[]::text[], p_scope_vendedor_email text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean := 'admin' = ANY(p_scope_permissions);
  v_vendedor_user_id integer;
  v_total bigint;
BEGIN
  PERFORM public.multiplix_validate_scope_signature(p_scope_permissions, p_scope_vendedor_email);
  IF NOT v_is_admin AND 'customers_own' = ANY(p_scope_permissions) AND p_scope_vendedor_email IS NOT NULL THEN
    SELECT u.id INTO v_vendedor_user_id
    FROM public.users u
    WHERE lower(u.email) = lower(p_scope_vendedor_email) AND u.is_vendedor = true AND u.is_active = true;
  END IF;

  SELECT count(*) INTO v_total
  FROM public.companies c
  LEFT JOIN public.company_addresses ca ON ca.company_id = c.id AND ca.is_primary = true
  WHERE c.deleted_at IS NULL AND c.status = 'ativo'
    AND (
      v_is_admin
      OR (c.is_supplier AND 'suppliers' = ANY(p_scope_permissions))
      OR (c.is_carrier AND 'carriers' = ANY(p_scope_permissions))
      OR (c.is_customer AND 'customers_all' = ANY(p_scope_permissions))
      OR (c.is_customer AND v_vendedor_user_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.customers cu
            WHERE cu.company_id = c.id AND cu.vendedor_id = v_vendedor_user_id
          ))
    )
    AND (p_roles IS NULL OR cardinality(p_roles) = 0
      OR ('cliente' = ANY(p_roles) AND c.is_customer)
      OR ('fornecedor' = ANY(p_roles) AND c.is_supplier)
      OR ('transportadora' = ANY(p_roles) AND c.is_carrier))
    AND (p_ramo IS NULL
      OR c.ramo_atividade = p_ramo
      OR (p_ramo = 'Não informado' AND (c.ramo_atividade IS NULL OR trim(c.ramo_atividade) = '')))
    AND (p_search IS NULL OR trim(p_search) = '' OR c.search_vector @@ plainto_tsquery('portuguese', p_search))
    AND (p_uf IS NULL OR ca.estado = p_uf);

  RETURN v_total;
END;
$function$
