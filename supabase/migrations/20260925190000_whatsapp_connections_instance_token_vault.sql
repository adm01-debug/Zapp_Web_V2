-- Reconciliacao (2026-09-25): DDL ja aplicado ao vivo em producao (registro
-- 20260925190000 em supabase_migrations.schema_migrations) antes de existir
-- arquivo de migration versionado. Corpo SQL abaixo e copia exata das 7
-- statements do ledger (nao alterado) — canonicamente identico ao que ja
-- roda no banco oficial.

ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS instance_token_secret_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_connections_instance_id_key
  ON public.whatsapp_connections (instance_id)
  WHERE instance_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_connections_one_default
  ON public.whatsapp_connections (is_default)
  WHERE is_default;

CREATE OR REPLACE FUNCTION public.get_instance_token(p_instance_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $function$
DECLARE
  v_secret_id uuid;
  v_token text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  SELECT instance_token_secret_id INTO v_secret_id
  FROM public.whatsapp_connections
  WHERE instance_id = p_instance_id;

  IF v_secret_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets
  WHERE id = v_secret_id;

  RETURN v_token;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_instance_token(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_instance_token(p_connection_id uuid, p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $function$
DECLARE
  v_existing uuid;
  v_secret_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_connection_id IS NULL OR p_token IS NULL OR p_token = '' THEN
    RAISE EXCEPTION 'invalid_instance_token' USING ERRCODE = '22023';
  END IF;

  SELECT instance_token_secret_id INTO v_existing
  FROM public.whatsapp_connections
  WHERE id = p_connection_id;

  IF v_existing IS NULL THEN
    v_secret_id := vault.create_secret(p_token, 'whatsapp_instance_token:' || p_connection_id::text);
    UPDATE public.whatsapp_connections
    SET instance_token_secret_id = v_secret_id
    WHERE id = p_connection_id;
  ELSE
    PERFORM vault.update_secret(v_existing, p_token);
    v_secret_id := v_existing;
  END IF;

  RETURN v_secret_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_instance_token(uuid, text) FROM PUBLIC, anon, authenticated;
