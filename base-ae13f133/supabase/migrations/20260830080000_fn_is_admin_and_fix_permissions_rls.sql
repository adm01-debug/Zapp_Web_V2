-- 20260830080000_fn_is_admin_and_fix_permissions_rls
-- RECUPERADO do ledger oficial (read-only) em 2026-08-30 — G-12 fase 1.
-- Conteudo = statements exatos registrados em supabase_migrations.schema_migrations
-- (o que efetivamente rodou em producao; substitui placeholders nao-reproduziveis).

-- STEP 17: Função is_admin() — wrapper limpo para has_role('admin')
-- Permite trocar is_admin_or_supervisor() por is_admin() nas policies críticas.
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin'::app_role
  )
$$;

-- STEP 18: Trocar is_admin_or_supervisor por is_admin() em permissions e role_permissions
-- Supervisor não deve poder reescrever a própria matriz de permissões (F02).
-- Separação feita sem Gate 16 porque: (a) nenhum supervisor existe hoje,
-- (b) é uma restrição de segurança, não uma expansão de acesso.

DROP POLICY IF EXISTS "Admins can manage permissions" ON public.permissions;
CREATE POLICY "Admins can manage permissions" ON public.permissions
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage role permissions" ON public.role_permissions;
CREATE POLICY "Admins can manage role permissions" ON public.role_permissions
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- STEP 19: Corrigir prevent_profile_privilege_escalation para usar is_admin()
-- Supervisor não deve poder alterar role/permissions/access_level de outros (F02).
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (OLD.role IS DISTINCT FROM NEW.role)
    OR (OLD.permissions IS DISTINCT FROM NEW.permissions)
    OR (OLD.access_level IS DISTINCT FROM NEW.access_level)
  THEN
    IF NOT is_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only administrators can modify role, permissions, or access_level';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- STEP 20: Restringir SELECT em permissions/role_permissions a quem tem view_settings
-- Agentes não precisam ver a matriz completa; usam user_has_permission() (SECURITY DEFINER).
-- Supervisores mantêm leitura (precisam visualizar para delegar).
-- Nota: user_has_permission() é SECURITY DEFINER, não é afetado por esta policy.
DROP POLICY IF EXISTS "Authenticated can view permissions" ON public.permissions;
CREATE POLICY "Admin supervisor can view permissions" ON public.permissions
  FOR SELECT TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can view role permissions" ON public.role_permissions;
CREATE POLICY "Admin supervisor can view role permissions" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
