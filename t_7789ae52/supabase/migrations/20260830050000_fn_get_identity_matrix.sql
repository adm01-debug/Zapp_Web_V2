-- 20260830050000_fn_get_identity_matrix
-- RECUPERADO do ledger oficial (read-only) em 2026-08-30 — G-12 fase 1.
-- Conteudo = statements exatos registrados em supabase_migrations.schema_migrations
-- (o que efetivamente rodou em producao; substitui placeholders nao-reproduziveis).

-- STEP 7: Função v_identity_matrix — fonte única de verdade da identidade dos usuários.
-- SECURITY DEFINER para acessar auth.users (schema restrito).
-- Callable apenas por service_role (via edge function de admin) e postgres.
CREATE OR REPLACE FUNCTION public.get_identity_matrix()
RETURNS TABLE (
  auth_user_id          uuid,
  email                 text,
  last_sign_in_at       timestamptz,
  is_banned             boolean,
  profile_id            uuid,
  display_name          text,
  is_active             boolean,
  profile_role_cached   text,
  access_level          text,
  user_roles_list       text,
  effective_permissions text,
  created_at            timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    u.id                                                                AS auth_user_id,
    u.email,
    u.last_sign_in_at,
    (u.banned_until IS NOT NULL)                                        AS is_banned,
    p.id                                                                AS profile_id,
    p.name                                                              AS display_name,
    p.is_active,
    p.role                                                              AS profile_role_cached,
    p.access_level,
    (
      SELECT string_agg(r.role::text, ',' ORDER BY r.role::text)
      FROM public.user_roles r WHERE r.user_id = u.id
    )                                                                   AS user_roles_list,
    (
      SELECT string_agg(pm.name, ',' ORDER BY pm.name)
      FROM public.user_roles r
      JOIN public.role_permissions rp ON rp.role = r.role
      JOIN public.permissions pm ON pm.id = rp.permission_id
      WHERE r.user_id = u.id
    )                                                                   AS effective_permissions,
    u.created_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  ORDER BY u.created_at
$$;

-- Acesso restrito: somente service_role e postgres (edge functions de admin)
REVOKE ALL ON FUNCTION public.get_identity_matrix() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_identity_matrix() TO service_role;
