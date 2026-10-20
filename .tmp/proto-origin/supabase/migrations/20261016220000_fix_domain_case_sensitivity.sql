-- P1: Corrige comparação de domínio case-sensitive em handle_new_user_role()
--
-- Antes:  v_email_domain := split_part(NEW.email, '@', 2);
-- Depois: v_email_domain := lower(split_part(NEW.email, '@', 2));
--
-- O Supabase Auth normaliza emails para lowercase, então na prática isso
-- não ocorre em produção, mas endereça a invariante corretamente.
-- Também garante que o valor gravado em audit_logs seja sempre lowercase.

CREATE OR REPLACE FUNCTION public.handle_new_user_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_trusted_domains text;
  v_email_domain    text;
  v_allowed         boolean := false;
BEGIN
  -- lower() garante comparação case-insensitive independente de como o email
  -- chega. O Supabase Auth já normaliza para lowercase, mas é boa prática.
  v_email_domain := lower(split_part(NEW.email, '@', 2));

  SELECT value INTO v_trusted_domains
  FROM public.app_settings
  WHERE key = 'trusted_domains';

  v_trusted_domains := coalesce(
    nullif(v_trusted_domains, ''),
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
