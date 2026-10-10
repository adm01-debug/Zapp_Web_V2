-- 20260830010000_fix_audit_role_changes_add_update_case
-- RECUPERADO do ledger oficial (read-only) em 2026-08-30 — G-12 fase 1.
-- Conteudo = statements exatos registrados em supabase_migrations.schema_migrations
-- (o que efetivamente rodou em producao; substitui placeholders nao-reproduziveis).

-- STEP 2: Fix audit_role_changes() — adiciona ramo UPDATE que estava ausente (F01)
-- O trigger dispara em INSERT/DELETE/UPDATE mas a função só tratava os dois primeiros.
-- Toda promoção a admin feita por create-user (.update({role})) era invisível.
CREATE OR REPLACE FUNCTION public.audit_role_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(), 'role_granted', 'user_roles', NEW.id,
      jsonb_build_object(
        'user_id',    NEW.user_id,
        'role',       NEW.role,
        'granted_by', auth.uid()
      )
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(), 'role_revoked', 'user_roles', OLD.id,
      jsonb_build_object(
        'user_id',    OLD.user_id,
        'role',       OLD.role,
        'revoked_by', auth.uid()
      )
    );
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(), 'role_changed', 'user_roles', NEW.id,
      jsonb_build_object(
        'user_id',    NEW.user_id,
        'old_role',   OLD.role,
        'new_role',   NEW.role,
        'changed_by', auth.uid()
      )
    );
  END IF;
  RETURN NULL;
END;
$$;
