-- P1: Trusted domains — substitui o GUC inatingível por serviço via app_settings
--
-- ALTER DATABASE postgres SET "app.settings.trusted_domains" requer superuser
-- no Supabase (permissão pg_alter_system). Solução equivalente:
--
--   1. Tabela public.app_settings (key/value) — service_role pode ler/escrever
--   2. handle_new_user_role() lê de app_settings primeiro, cai no GUC (se um
--      dia um superuser o configurar), e tem fallback hardcoded como última camada.
--
-- Para mudar o domínio no futuro:
--   UPDATE public.app_settings SET value = 'novo.dominio.com' WHERE key = 'trusted_domains';

-- ─── 1. Tabela ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_settings (
  key        text        PRIMARY KEY,
  value      text        NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_settings_admin_all ON public.app_settings
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = 'admin'
  ));

-- ─── 2. Valor inicial ─────────────────────────────────────────────────────────
INSERT INTO public.app_settings (key, value)
VALUES ('trusted_domains', 'promobrindes.com.br')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- ─── 3. Atualiza handle_new_user_role ─────────────────────────────────────────
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
  v_email_domain := split_part(NEW.email, '@', 2);

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
