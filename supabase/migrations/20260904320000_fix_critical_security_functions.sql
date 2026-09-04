-- CRITICAL SECURITY FIX #1: get_identity_matrix
-- Any authenticated user could call this and get the full user matrix (all emails,
-- roles, permissions, ban status) because SECURITY DEFINER bypassed RLS and there
-- was no role guard. Now restricted to admin/supervisor only.
CREATE OR REPLACE FUNCTION public.get_identity_matrix()
RETURNS TABLE(
  auth_user_id         uuid,
  email                text,
  last_sign_in_at      timestamptz,
  is_banned            boolean,
  profile_id           uuid,
  display_name         text,
  is_active            boolean,
  profile_role_cached  text,
  access_level         text,
  user_roles_list      text,
  effective_permissions text,
  created_at           timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
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
      JOIN public.permissions pm      ON pm.id = rp.permission_id
      WHERE r.user_id = u.id
    )                                                                   AS effective_permissions,
    u.created_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  ORDER BY u.created_at;
END;
$$;

-- CRITICAL SECURITY FIX #2: contacts_count_by_type
-- Ran as SECURITY DEFINER → bypassed RLS on contacts table → any authenticated user
-- could get global aggregate counts across ALL contacts regardless of visibility.
-- Fix: remove SECURITY DEFINER so the function runs as the caller and RLS applies.
CREATE OR REPLACE FUNCTION public.contacts_count_by_type()
RETURNS TABLE(contact_type text, count bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(c.contact_type, 'cliente') AS contact_type, COUNT(*) AS count
  FROM public.contacts c
  GROUP BY COALESCE(c.contact_type, 'cliente');
$$;
