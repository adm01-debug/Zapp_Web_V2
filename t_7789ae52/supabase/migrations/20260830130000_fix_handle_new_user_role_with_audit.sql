-- 20260830130000_fix_handle_new_user_role_with_audit
-- RECUPERADO do ledger oficial (read-only) em 2026-08-30 — G-12 fase 1.
-- Conteudo = statements exatos registrados em supabase_migrations.schema_migrations
-- (o que efetivamente rodou em producao; substitui placeholders nao-reproduziveis).

-- STEP 47: Melhorar handle_new_user_role com auditoria automática e domínio configurável
-- F09: todo insert em auth.users virava agent sem registro. Agora:
-- (1) domínio de email configurável via app.settings.trusted_domains (default: sem restrição)
-- (2) evento de auto-provisionamento registrado em audit_logs
-- (3) domínios de serviço (supabase internos) excluídos
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_trusted_domains text;
  v_email_domain    text;
  v_allowed         boolean := true;
BEGIN
  -- Extrair domínio do email
  v_email_domain := split_part(NEW.email, '@', 2);

  -- Verificar domínios confiáveis se configurados
  -- Configurar com: ALTER DATABASE postgres SET app.settings.trusted_domains='promobrindes.com.br,gmail.com';
  BEGIN
    v_trusted_domains := current_setting('app.settings.trusted_domains', true);
    IF v_trusted_domains IS NOT NULL AND v_trusted_domains <> '' THEN
      v_allowed := v_email_domain = ANY (string_to_array(v_trusted_domains, ','));
    END IF;
  EXCEPTION WHEN others THEN
    -- Configuração não existe: permite todos (backward compat)
    v_allowed := true;
  END;

  IF NOT v_allowed THEN
    -- Não conceder role: usuário de domínio não confiável
    RETURN NEW;
  END IF;

  -- Provisionar role padrão 'agent'
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'agent')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Registrar auto-provisionamento
  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
  VALUES (
    NEW.id,
    'role_auto_provisioned',
    'auth.users',
    NEW.id,
    jsonb_build_object(
      'email',  NEW.email,
      'domain', v_email_domain,
      'role',   'agent'
    )
  );

  RETURN NEW;
END;
$$;
