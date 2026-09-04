-- 20260830161547_fix_prevent_privilege_escalation_allow_internal_sync
-- RECUPERADO do ledger oficial (read-only) em 2026-08-30 — G-12 fase 1.
-- Conteudo = statements exatos registrados em supabase_migrations.schema_migrations
-- (o que efetivamente rodou em producao; substitui placeholders nao-reproduziveis).

-- Migration: 20260830160000_fix_prevent_privilege_escalation_allow_internal_sync
-- Problema: prevent_profile_privilege_escalation checa is_admin(auth.uid()) mas
--   quando chamada a partir de sync_profile_role_from_user_roles (SECURITY DEFINER),
--   auth.uid() = null → is_admin(null) = false → EXCEPTION bloqueia o sync.
-- Impacto: impossível criar usuários via service_role (user_roles INSERT → sync → blocked).
-- Fix: flag de sessão 'app.internal_role_sync' sinaliza operação interna de sync.

-- Passo 1: prevent_privilege_escalation respeita o flag interno
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
    -- Operação interna de sync (ex: trigger user_roles → profiles): bypass
    IF current_setting('app.internal_role_sync', true) = 'true' THEN
      RETURN NEW;
    END IF;
    IF NOT is_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only administrators can modify role, permissions, or access_level';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Passo 2: sync_profile_role_from_user_roles seta o flag antes do UPDATE
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

  IF v_new_role IS NOT NULL THEN
    -- Sinaliza operação interna para prevent_privilege_escalation
    PERFORM set_config('app.internal_role_sync', 'true', true);

    UPDATE public.profiles
    SET role = v_new_role::text
    WHERE user_id = v_user_id
      AND role IS DISTINCT FROM v_new_role::text;

    -- Reset flag (set_config com local=true já reseta no fim da transação,
    -- mas reset explícito é mais claro e seguro em casos de nested txn)
    PERFORM set_config('app.internal_role_sync', 'false', true);
  END IF;

  RETURN NULL;
END;
$$;

-- Verificação inline: testar que as duas funções existem e são SECURITY DEFINER
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'prevent_profile_privilege_escalation'
      AND prosecdef = true
  ) THEN
    RAISE EXCEPTION 'prevent_profile_privilege_escalation não encontrada ou não é SECURITY DEFINER';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'sync_profile_role_from_user_roles'
      AND prosecdef = true
  ) THEN
    RAISE EXCEPTION 'sync_profile_role_from_user_roles não encontrada ou não é SECURITY DEFINER';
  END IF;
  RAISE NOTICE 'Migration 20260830160000 aplicada e verificada OK';
END;
$$;
