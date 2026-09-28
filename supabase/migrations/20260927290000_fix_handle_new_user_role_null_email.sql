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
  v_trusted_domains := coalesce(
    nullif(current_setting('app.settings.trusted_domains', true), ''),
    'promobrindes.com.br'
  );
  v_allowed := coalesce(v_email_domain = ANY (string_to_array(v_trusted_domains, ',')), false);
  IF NOT v_allowed THEN
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
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'agent')
  ON CONFLICT (user_id, role) DO NOTHING;
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
$function$;
COMMENT ON FUNCTION public.handle_new_user_role IS 'Trigger on auth.users INSERT: provisiona role agent para o dominio da empresa (fail-closed). Historico de correcoes: 20260830130000 (auditoria + dominio configuravel), 20260925140000 (fail-closed: v_allowed := false por padrao), 20260927110000 (NULL bypass: email NULL => coalesce garante false, nao agent).'
