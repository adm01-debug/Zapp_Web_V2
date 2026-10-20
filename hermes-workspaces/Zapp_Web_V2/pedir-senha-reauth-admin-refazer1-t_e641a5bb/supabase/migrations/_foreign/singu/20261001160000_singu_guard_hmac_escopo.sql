-- F22 (Bloco B): guard de assinatura de escopo nas RPCs de audiencia do Singu.
--
-- ORDEM OBRIGATORIA (a que o dono pediu, e a unica que nao derruba o Multiplix):
--   (1) este arquivo versionado -> (2) deploy da edge multiplix-audience do Zapp
--   ASSINANDO (cabecalhos; a RPC atual ignora cabecalho, entao nada quebra)
--   -> (3) aplicar este arquivo no Singu -> (4) md5 de volta no README.
--
-- NAO aplicar antes do deploy da edge. A partir do momento em que este arquivo
-- entra, escopo sem assinatura valida e recusado com 42501.
--
-- Por que CABECALHO e nao parametro: acrescentar p_scope_hmac/p_scope_exp muda
-- a assinatura da funcao, e o PostgREST casa a chamada pelo conjunto de nomes
-- do corpo — a chamada com um parametro que a funcao nao tem devolve 404
-- PGRST202 (medido). Assim, ou a edge quebrava (404) ou a edge antiga era
-- recusada: nao havia ordem segura. Com cabecalho o acoplamento desaparece.
--
-- Por que nao ha DROP aqui: a assinatura de entrada nao muda, entao
-- CREATE OR REPLACE preserva owner e ACL (medida antes e depois:
-- {postgres=X/postgres,service_role=X/postgres}, anon/authenticated sem
-- EXECUTE). Rollback = reaplicar os espelhos anteriores + dropar a validadora
-- (instrucao no fim do arquivo).
--
-- Validado em transacao com ROLLBACK: sem assinatura recusa, assinatura errada
-- recusa, expirada recusa, assinatura correta aceita e conta igual ao SQL direto.

BEGIN;

CREATE OR REPLACE FUNCTION public.multiplix_validate_scope_signature(
  p_scope_permissions text[],
  p_scope_vendedor_email text
)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- F22: as RPCs de audiencia confiavam no chamador para dizer o proprio escopo.
-- Com a EXTERNAL_SUPABASE_SERVICE_ROLE_KEY (que vive nas edges) qualquer um
-- pedia p_scope_permissions=['admin'] e lia o publico inteiro. Agora o escopo
-- so vale acompanhado de um HMAC-SHA256 que a edge assina com o segredo que
-- existe em apenas dois lugares: a env das edges do Zapp e o vault do Singu
-- (MULTIPLIX_SCOPE_HMAC_SECRET). Contrato v1, identico nos dois lados:
--   payload    = 'v1|<permissoes ordenadas asc, unidas por ",">|<email ou "">|<exp_unix>'
--   assinatura = HMAC-SHA256 hex
-- A assinatura viaja em CABECALHO (x-multiplix-scope-hmac / -exp), nao em
-- parametro: parametro novo muda a assinatura da funcao e o PostgREST passaria
-- a devolver 404 nas chamadas do outro lado (medido: PGRST202).
DECLARE
  v_headers jsonb;
  v_hmac text;
  v_exp bigint;
  v_secret text;
  v_perms text;
  v_payload text;
  v_esperado text;
BEGIN
  -- sem escopo pedido nao ha o que assinar (a RPC devolveria vazio de qualquer forma)
  IF p_scope_permissions IS NULL OR cardinality(p_scope_permissions) = 0 THEN
    RETURN;
  END IF;
  v_headers := coalesce(current_setting('request.headers', true)::jsonb, '{}'::jsonb);
  v_hmac := nullif(v_headers ->> 'x-multiplix-scope-hmac', '');
  v_exp := nullif(v_headers ->> 'x-multiplix-scope-exp', '')::bigint;
  IF v_hmac IS NULL OR v_exp IS NULL THEN
    RAISE EXCEPTION 'escopo sem assinatura: cabecalhos x-multiplix-scope-hmac/x-multiplix-scope-exp ausentes' USING ERRCODE = '42501';
  END IF;
  IF v_exp < (extract(epoch FROM now()))::bigint THEN
    RAISE EXCEPTION 'assinatura de escopo expirada em %', to_timestamp(v_exp) USING ERRCODE = '42501';
  END IF;
  SELECT s.decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets s
  WHERE s.name = 'MULTIPLIX_SCOPE_HMAC_SECRET';
  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE EXCEPTION 'MULTIPLIX_SCOPE_HMAC_SECRET ausente no vault' USING ERRCODE = '42501';
  END IF;
  SELECT string_agg(p, ',' ORDER BY p COLLATE "C") INTO v_perms FROM unnest(p_scope_permissions) AS p;
  v_payload := 'v1|' || coalesce(v_perms, '') || '|' || coalesce(p_scope_vendedor_email, '') || '|' || v_exp::text;
  -- extensions.hmac e nao hmac: no Supabase o pgcrypto vive no schema
  -- 'extensions'. Sem qualificar, o nome nao resolve dentro desta funcao
  -- (SET search_path TO 'public') e o guard cairia com 42883 em TODA chamada.
  v_esperado := encode(extensions.hmac(v_payload, v_secret, 'sha256'), 'hex');
  IF v_esperado IS DISTINCT FROM lower(v_hmac) THEN
    RAISE EXCEPTION 'assinatura de escopo invalida' USING ERRCODE = '42501';
  END IF;
END;
$function$;

-- a validadora e interna: so as RPCs (SECURITY DEFINER) a chamam
REVOKE ALL ON FUNCTION public.multiplix_validate_scope_signature(text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.multiplix_validate_scope_signature(text[], text) FROM anon, authenticated;

-- multiplix_count_audience: uma linha a mais (a assinatura de entrada NAO muda)
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
$function$;

-- multiplix_search_audience: uma linha a mais (a assinatura de entrada NAO muda)
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
  PERFORM public.multiplix_validate_scope_signature(p_scope_permissions, p_scope_vendedor_email);
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
$function$;

-- multiplix_resolve_recipients: uma linha a mais (a assinatura de entrada NAO muda)
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
  PERFORM public.multiplix_validate_scope_signature(p_scope_permissions, p_scope_vendedor_email);
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
$function$;

-- rollback (rodar para desfazer):
--   reaplicar supabase/migrations/_foreign/singu/multiplix_count_audience.sql do commit anterior
--   reaplicar supabase/migrations/_foreign/singu/multiplix_search_audience.sql do commit anterior
--   reaplicar supabase/migrations/_foreign/singu/multiplix_resolve_recipients.sql do commit anterior
--   DROP FUNCTION IF EXISTS public.multiplix_validate_scope_signature(text[], text);

COMMIT;
