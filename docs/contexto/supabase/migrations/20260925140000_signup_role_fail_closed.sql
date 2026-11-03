CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_trusted_domains text;
  v_email_domain    text;
  v_allowed         boolean := false;
BEGIN
  v_email_domain := split_part(NEW.email, '@', 2);

  -- Default fail-closed: sem override configurado, so' o dominio da empresa
  -- recebe role automaticamente. Override opcional via
  -- app.settings.trusted_domains (lista separada por virgula).
  v_trusted_domains := coalesce(
    nullif(current_setting('app.settings.trusted_domains', true), ''),
    'promobrindes.com.br'
  );

  v_allowed := v_email_domain = ANY (string_to_array(v_trusted_domains, ','));

  IF NOT v_allowed THEN
    -- Dominio nao confiavel: nao concede role. Registra para o admin decidir.
    INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
    VALUES (
      NEW.id,
      'role_auto_provision_denied',
      'auth.users',
      NEW.id,
      jsonb_build_object(
        'email',  NEW.email,
        'domain', v_email_domain,
        'reason', 'domain_not_trusted'
      )
    );
    RETURN NEW;
  END IF;

  -- Provisionar role padrao 'agent'
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
$function$
