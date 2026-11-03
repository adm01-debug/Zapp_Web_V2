CREATE OR REPLACE FUNCTION public.resolve_contact_guard_actor()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
  v_claims jsonb;
  v_claim_role text;
  v_database_role text := NULLIF(pg_catalog.current_setting('role', true), '');
BEGIN
  BEGIN
    v_claims := NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'invalid_auth_context' USING ERRCODE = '42501';
  END;

  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    RETURN v_user_id;
  END IF;

  v_claim_role := COALESCE(
    v_claims ->> 'role',
    NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), '')
  );

  -- O bypass exige o JWT E o papel PostgreSQL service_role. Assim, alterar apenas
  -- request.jwt.claims nao transforma uma sessao authenticated em service_role.
  IF v_claim_role = 'service_role' AND v_database_role = 'service_role' THEN
    RETURN NULL;
  END IF;

  -- Jobs internos sem JWT so passam quando a conexao pertence a um superusuario.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles role_row
    WHERE role_row.rolname = SESSION_USER
      AND role_row.rolsuper IS TRUE
  ) THEN
    RETURN NULL;
  END IF;

  RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
END;
$function$
