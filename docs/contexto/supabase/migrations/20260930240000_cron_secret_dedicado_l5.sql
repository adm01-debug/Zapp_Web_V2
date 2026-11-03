DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'connection_health_check_cron_secret') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'connection_health_check_cron_secret',
      'Credencial de maquina do cron connection-health-check (pg_cron -> edge). Gerada in-db 2026-09-30. NUNCA logar.'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'avatars_refresh_cron_secret') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'avatars_refresh_cron_secret',
      'Credencial de maquina do cron avatars-refresh (pg_cron -> edge). Gerada in-db 2026-09-30. NUNCA logar.'
    );
  END IF;
END $$

CREATE OR REPLACE FUNCTION public.get_connection_health_check_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'connection_health_check_cron_secret'
  LIMIT 1
$$

CREATE OR REPLACE FUNCTION public.get_avatars_refresh_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'avatars_refresh_cron_secret'
  LIMIT 1
$$

REVOKE ALL ON FUNCTION public.get_connection_health_check_cron_secret() FROM PUBLIC, anon, authenticated

REVOKE ALL ON FUNCTION public.get_avatars_refresh_cron_secret() FROM PUBLIC, anon, authenticated

GRANT EXECUTE ON FUNCTION public.get_connection_health_check_cron_secret() TO service_role

GRANT EXECUTE ON FUNCTION public.get_avatars_refresh_cron_secret() TO service_role
