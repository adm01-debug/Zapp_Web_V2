CREATE OR REPLACE FUNCTION public.multiplix_resolve_recipients(p_company_ids uuid[] DEFAULT ARRAY[]::uuid[], p_contact_ids uuid[] DEFAULT ARRAY[]::uuid[], p_scope_permissions text[] DEFAULT ARRAY[]::text[], p_scope_vendedor_email text DEFAULT NULL::text)
 RETURNS TABLE(company_id uuid, contact_id uuid, company_name text, destino_e164 text, destino_origem text, elegibilidade text, empresa_papeis text[], last_interaction_at timestamp with time zone)
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
  WITH alvo AS (
    SELECT DISTINCT c.id AS company_id
    FROM public.companies c
    WHERE c.id = ANY(p_company_ids)
    UNION
    SELECT DISTINCT ct.company_id
    FROM public.contacts ct
    WHERE ct.id = ANY(p_contact_ids) AND ct.company_id IS NOT NULL
  ),
  avaliado AS (
    SELECT
      c.id AS company_id,
      COALESCE(NULLIF(trim(c.name), ''), c.nome_crm) AS company_name,
      c.is_supplier,
      c.is_carrier,
      c.is_customer,
      (c.deleted_at IS NULL AND c.status = 'ativo') AS ativa,
      (
        v_is_admin
        OR (c.is_supplier AND 'suppliers' = ANY(p_scope_permissions))
        OR (c.is_carrier AND 'carriers' = ANY(p_scope_permissions))
        OR (c.is_customer AND 'customers_all' = ANY(p_scope_permissions))
        OR (c.is_customer AND v_vendedor_user_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.customers cu
              WHERE cu.company_id = c.id AND cu.vendedor_id = v_vendedor_user_id
            ))
      ) AS no_escopo
    FROM public.companies c
    JOIN alvo a ON a.company_id = c.id
  ),
  contato_escolhido AS (
    SELECT
      av.company_id,
      COALESCE(
        (SELECT ct.id FROM public.contacts ct WHERE ct.id = ANY(p_contact_ids) AND ct.company_id = av.company_id AND ct.deleted_at IS NULL AND ct.is_duplicate = false LIMIT 1),
        (SELECT ct.id FROM public.contacts ct WHERE ct.company_id = av.company_id AND ct.deleted_at IS NULL AND ct.is_duplicate = false ORDER BY ct.created_at ASC LIMIT 1)
      ) AS contact_id
    FROM avaliado av
  ),
  destino AS (
    SELECT
      av.company_id, av.company_name, av.ativa, av.no_escopo,
      av.is_supplier, av.is_carrier, av.is_customer,
      ce.contact_id,
      ct.whatsapp AS contato_whatsapp,
      COALESCE(cp.numero_e164::text, ct.whatsapp, cph.numero_e164::text) AS destino_e164,
      CASE
        WHEN cp.numero_e164 IS NOT NULL OR ct.whatsapp IS NOT NULL THEN 'contato_pessoa'
        WHEN cph.numero_e164 IS NOT NULL THEN 'telefone_empresa'
        ELSE 'sem_destino'
      END AS destino_origem,
      COALESCE(
        ct.last_interaction_at,
        (SELECT max(i.data_interacao) FROM public.interactions i WHERE i.contact_id = ct.id)
      ) AS last_interaction_at
    FROM avaliado av
    JOIN contato_escolhido ce ON ce.company_id = av.company_id
    LEFT JOIN public.contacts ct ON ct.id = ce.contact_id
    LEFT JOIN LATERAL (
      SELECT cp.numero_e164 FROM public.contact_phones cp
      WHERE cp.contact_id = ct.id AND cp.is_whatsapp = true
      ORDER BY cp.is_primary DESC LIMIT 1
    ) cp ON true
    LEFT JOIN LATERAL (
      SELECT cph.numero_e164 FROM public.company_phones cph
      WHERE cph.company_id = av.company_id AND cph.is_whatsapp = true
        AND (av.is_supplier OR av.is_carrier)   -- E014: telefone da empresa só vale para B2B
      ORDER BY cph.is_primary DESC LIMIT 1
    ) cph ON true
  )
  SELECT
    d.company_id, d.contact_id, d.company_name,
    CASE WHEN d.no_escopo AND d.ativa THEN d.destino_e164 ELSE NULL END,
    CASE WHEN d.no_escopo AND d.ativa THEN d.destino_origem ELSE NULL END,
    CASE
      WHEN NOT d.ativa THEN 'destino_invalido'
      WHEN NOT d.no_escopo THEN 'fora_do_escopo'
      WHEN d.destino_e164 IS NULL THEN 'destino_invalido'
      ELSE 'apto'
    END,
    ARRAY(
      SELECT v.papel FROM (VALUES
        ('supplier', d.is_supplier),
        ('carrier',  d.is_carrier),
        ('customer', d.is_customer)
      ) AS v(papel, ativo) WHERE v.ativo
    ) AS empresa_papeis,
    d.last_interaction_at
  FROM destino d;
END;
$function$
