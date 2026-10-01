CREATE OR REPLACE FUNCTION public.multiplix_search_audience(p_roles text[] DEFAULT NULL::text[], p_ramo text DEFAULT NULL::text, p_uf text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_scope_permissions text[] DEFAULT ARRAY[]::text[], p_scope_vendedor_email text DEFAULT NULL::text, p_page integer DEFAULT 0, p_page_size integer DEFAULT 50)
 RETURNS TABLE(company_id uuid, company_name text, ramo_atividade text, uf text, is_customer boolean, is_supplier boolean, is_carrier boolean, destino_e164 text, destino_origem text, motivo_inclusao text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean := 'admin' = ANY(p_scope_permissions);
  v_vendedor_user_id integer;
BEGIN
  IF NOT v_is_admin AND 'customers_own' = ANY(p_scope_permissions) AND p_scope_vendedor_email IS NOT NULL THEN
    SELECT u.id INTO v_vendedor_user_id
    FROM public.users u
    WHERE lower(u.email) = lower(p_scope_vendedor_email) AND u.is_vendedor = true AND u.is_active = true;
  END IF;

  RETURN QUERY
  WITH escopo AS (
    SELECT c.id
    FROM public.companies c
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
  ),
  filtrado AS (
    SELECT c.*
    FROM public.companies c
    JOIN escopo e ON e.id = c.id
    WHERE
      (p_roles IS NULL OR cardinality(p_roles) = 0
        OR ('cliente' = ANY(p_roles) AND c.is_customer)
        OR ('fornecedor' = ANY(p_roles) AND c.is_supplier)
        OR ('transportadora' = ANY(p_roles) AND c.is_carrier))
      AND (p_ramo IS NULL
        OR c.ramo_atividade = p_ramo
        OR (p_ramo = 'Não informado' AND (c.ramo_atividade IS NULL OR trim(c.ramo_atividade) = '')))
      AND (p_search IS NULL OR trim(p_search) = '' OR c.search_vector @@ plainto_tsquery('portuguese', p_search))
  ),
  com_endereco AS (
    SELECT f.*, ca.estado AS uf_primaria
    FROM filtrado f
    LEFT JOIN public.company_addresses ca ON ca.company_id = f.id AND ca.is_primary = true
    WHERE p_uf IS NULL OR ca.estado = p_uf
  ),
  contato_principal AS (
    SELECT DISTINCT ON (ct.company_id) ct.id, ct.company_id, ct.whatsapp
    FROM public.contacts ct
    WHERE ct.deleted_at IS NULL AND ct.is_duplicate = false
    ORDER BY ct.company_id, ct.created_at ASC
  ),
  destino AS (
    SELECT
      ce.*,
      COALESCE(cp.numero_e164::text, cpr.whatsapp, cph.numero_e164::text) AS destino_e164,
      CASE
        WHEN cp.numero_e164 IS NOT NULL OR cpr.whatsapp IS NOT NULL THEN 'contato_pessoa'
        WHEN cph.numero_e164 IS NOT NULL THEN 'telefone_empresa'
        ELSE 'sem_destino'
      END AS destino_origem
    FROM com_endereco ce
    LEFT JOIN contato_principal cpr ON cpr.company_id = ce.id
    LEFT JOIN LATERAL (
      SELECT cp.numero_e164 FROM public.contact_phones cp
      WHERE cp.contact_id = cpr.id AND cp.is_whatsapp = true
      ORDER BY cp.is_primary DESC LIMIT 1
    ) cp ON true
    LEFT JOIN LATERAL (
      SELECT cph.numero_e164 FROM public.company_phones cph
      WHERE cph.company_id = ce.id AND cph.is_whatsapp = true
      ORDER BY cph.is_primary DESC LIMIT 1
    ) cph ON true
  )
  SELECT
    d.id,
    COALESCE(NULLIF(trim(d.name), ''), d.nome_crm),
    COALESCE(NULLIF(trim(d.ramo_atividade), ''), 'Não informado'),
    d.uf_primaria::text,
    d.is_customer, d.is_supplier, d.is_carrier,
    d.destino_e164,
    d.destino_origem,
    CASE
      WHEN v_is_admin THEN 'escopo: admin'
      WHEN d.is_supplier AND 'suppliers' = ANY(p_scope_permissions) THEN 'escopo: fornecedor'
      WHEN d.is_carrier AND 'carriers' = ANY(p_scope_permissions) THEN 'escopo: transportadora'
      WHEN d.is_customer AND 'customers_all' = ANY(p_scope_permissions) THEN 'escopo: cliente (todos)'
      ELSE 'escopo: carteira do vendedor'
    END
  FROM destino d
  ORDER BY d.nome_crm
  OFFSET p_page * p_page_size LIMIT p_page_size;
END;
$function$
