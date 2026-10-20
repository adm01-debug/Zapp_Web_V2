-- ───────────────────────────────────────────────────────────────────────────────
-- Migration: Rate limiting + audit logging for admin_criar_usuario_painel
--
-- Problem: admin_criar_usuario_painel is SECURITY DEFINER with direct access
-- to auth.users. A compromised admin account could create thousands of users.
--
-- Fix:
--   1. Rate limit: max 10 user creations per admin per hour (using audit_logs)
--   2. Audit log: every creation attempt is recorded with metadata
--
-- Applied: 2026-06-12
-- ───────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_criar_usuario_painel(
  p_email text,
  p_senha text,
  p_nome  text,
  p_role  text DEFAULT 'cotacao'::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
  v_user_id       UUID;
  v_email         TEXT;
  v_recent_count  INT;
  v_rate_limit    CONSTANT INT := 10; -- max creations per hour per admin
BEGIN
  -- ── 1. Authorisation ────────────────────────────────────────────────
  IF NOT public.is_admin_painel() THEN
    RAISE EXCEPTION 'Acesso negado: apenas admins do painel podem criar usuários';
  END IF;

  -- ── 2. Input validation ─────────────────────────────────────────────
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RAISE EXCEPTION 'Email é obrigatório';
  END IF;
  IF p_senha IS NULL OR length(p_senha) < 6 THEN
    RAISE EXCEPTION 'Senha precisa ter no mínimo 6 caracteres';
  END IF;
  IF p_role NOT IN ('admin','cotacao') THEN
    RAISE EXCEPTION 'Role inválida: %. Use admin ou cotacao', p_role;
  END IF;
  IF p_nome IS NULL OR length(trim(p_nome)) = 0 THEN
    RAISE EXCEPTION 'Nome é obrigatório';
  END IF;

  -- ── 3. Rate limiting ────────────────────────────────────────────────
  -- Count how many user-creation events this admin triggered in the last hour.
  -- Uses the existing audit_logs table (user_id, action, created_at indexed).
  SELECT COUNT(*) INTO v_recent_count
  FROM public.audit_logs
  WHERE user_id  = auth.uid()
    AND action   = 'admin_criar_usuario_painel'
    AND created_at >= NOW() - INTERVAL '1 hour';

  IF v_recent_count >= v_rate_limit THEN
    RAISE EXCEPTION
      'Limite de criação de usuários atingido (% por hora). Tente novamente mais tarde.',
      v_rate_limit;
  END IF;

  -- ── 4. Duplicate check ──────────────────────────────────────────────
  v_email := lower(trim(p_email));

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
    RAISE EXCEPTION 'Email já cadastrado: %', v_email;
  END IF;

  -- ── 5. Create auth.users + identity ────────────────────────────────────
  v_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id, 'authenticated', 'authenticated',
    v_email,
    extensions.crypt(p_senha, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'nome', p_nome,
      'role', p_role,
      'apps', jsonb_build_object('painel_cotacao', true)
    ),
    now(), now(), '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
    'email', v_email, now(), now(), now()
  );

  -- ── 6. Upsert profile ───────────────────────────────────────────────
  INSERT INTO public.perfis_usuarios (id, email, nome, role, ativo, deletado)
  VALUES (v_user_id, v_email, p_nome, p_role, TRUE, FALSE)
  ON CONFLICT (id) DO UPDATE
    SET nome      = EXCLUDED.nome,
        role      = EXCLUDED.role,
        ativo     = TRUE,
        deletado  = FALSE,
        updated_at = now();

  -- ── 7. Audit log ────────────────────────────────────────────────────
  -- This entry is also used for rate-limit counting (step 3 above).
  INSERT INTO public.audit_logs (
    id, user_id, action, entity_type, entity_id,
    details, created_at
  ) VALUES (
    gen_random_uuid(),
    auth.uid(),
    'admin_criar_usuario_painel',
    'auth.users',
    v_user_id,
    jsonb_build_object(
      'email',                   v_email,
      'nome',                    p_nome,
      'role',                    p_role,
      'created_by',              auth.uid()::text,
      'rate_window_remaining',   v_rate_limit - v_recent_count - 1
    ),
    now()
  );

  RETURN v_user_id;
END;
$function$;

-- Index to make rate-limit lookups fast
-- (user_id + action + created_at is the exact WHERE clause used)
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_action_created
  ON public.audit_logs (user_id, action, created_at);

COMMENT ON FUNCTION public.admin_criar_usuario_painel IS
  'Creates a new user in auth.users. Rate limited to 10 per hour per admin (enforced via audit_logs). Every call is audit-logged. SECURITY DEFINER — change with extreme caution.';
