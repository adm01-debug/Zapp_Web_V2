-- 20260830030000_audit_role_permissions_trigger
-- RECUPERADO do ledger oficial (read-only) em 2026-08-30 — G-12 fase 1.
-- Conteudo = statements exatos registrados em supabase_migrations.schema_migrations
-- (o que efetivamente rodou em producao; substitui placeholders nao-reproduziveis).

-- STEP 4: Trigger de auditoria em role_permissions
-- Toda alteração na matriz de permissões fica registrada em audit_logs.
CREATE OR REPLACE FUNCTION public.audit_role_permissions_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_perm_name text;
BEGIN
  SELECT name INTO v_perm_name
  FROM public.permissions
  WHERE id = COALESCE(NEW.permission_id, OLD.permission_id);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(), 'permission_granted_to_role', 'role_permissions', NEW.permission_id,
      jsonb_build_object(
        'role',       NEW.role,
        'permission', v_perm_name,
        'granted_by', auth.uid()
      )
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(), 'permission_revoked_from_role', 'role_permissions', OLD.permission_id,
      jsonb_build_object(
        'role',       OLD.role,
        'permission', v_perm_name,
        'revoked_by', auth.uid()
      )
    );
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER audit_role_permissions_changes
AFTER INSERT OR DELETE ON public.role_permissions
FOR EACH ROW EXECUTE FUNCTION public.audit_role_permissions_changes();
