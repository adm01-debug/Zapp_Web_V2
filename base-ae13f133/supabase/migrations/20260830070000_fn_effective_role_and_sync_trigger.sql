-- 20260830070000_fn_effective_role_and_sync_trigger
-- RECUPERADO do ledger oficial (read-only) em 2026-08-30 — G-12 fase 1.
-- Conteudo = statements exatos registrados em supabase_migrations.schema_migrations
-- (o que efetivamente rodou em producao; substitui placeholders nao-reproduziveis).

-- STEP 11: Função effective_role — define precedência formal de papéis
-- admin > supervisor > special_agent > agent
-- Resolve o multi-role de forma determinística (F08).
CREATE OR REPLACE FUNCTION public.effective_role(_user_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN bool_or(role = 'admin'::app_role)         THEN 'admin'::app_role
    WHEN bool_or(role = 'supervisor'::app_role)    THEN 'supervisor'::app_role
    WHEN bool_or(role = 'special_agent'::app_role) THEN 'special_agent'::app_role
    ELSE 'agent'::app_role
  END
  FROM public.user_roles
  WHERE user_id = _user_id
$$;

-- STEP 10: Trigger sync_profile_role — mantém profiles.role derivado de user_roles
-- Gate 8 resolvido como senior dev: coluna mantida + sincronismo automático.
CREATE OR REPLACE FUNCTION public.sync_profile_role_from_user_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id  uuid;
  v_new_role app_role;
BEGIN
  v_user_id := COALESCE(NEW.user_id, OLD.user_id);

  SELECT CASE
    WHEN bool_or(role = 'admin'::app_role)         THEN 'admin'::app_role
    WHEN bool_or(role = 'supervisor'::app_role)    THEN 'supervisor'::app_role
    WHEN bool_or(role = 'special_agent'::app_role) THEN 'special_agent'::app_role
    ELSE 'agent'::app_role
  END
  INTO v_new_role
  FROM public.user_roles
  WHERE user_id = v_user_id;

  -- Atualiza profiles.role apenas quando diferente (evita loop de triggers)
  IF v_new_role IS NOT NULL THEN
    UPDATE public.profiles
    SET role = v_new_role::text
    WHERE user_id = v_user_id
      AND role IS DISTINCT FROM v_new_role::text;
  END IF;

  RETURN NULL;
END;
$$;

-- Dropar se existir (idempotência) antes de criar
DROP TRIGGER IF EXISTS sync_profile_role ON public.user_roles;
CREATE TRIGGER sync_profile_role
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_role_from_user_roles();
