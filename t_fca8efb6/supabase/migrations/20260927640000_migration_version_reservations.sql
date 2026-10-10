CREATE TABLE IF NOT EXISTS supabase_migrations.version_reservations (
  version text PRIMARY KEY CHECK (version ~ '^[0-9]{14}$'),
  holder text NOT NULL,
  purpose text,
  reserved_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON supabase_migrations.version_reservations FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION supabase_migrations.reserve_migration_version(p_holder text, p_purpose text DEFAULT NULL)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_next text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('supabase_migrations.reserve_migration_version'));
  SELECT (GREATEST(
    COALESCE((SELECT max(version::bigint) FROM supabase_migrations.schema_migrations), 0),
    COALESCE((SELECT max(version::bigint) FROM supabase_migrations.version_reservations), 0)
  ) + 10000)::text INTO v_next;
  INSERT INTO supabase_migrations.version_reservations (version, holder, purpose)
  VALUES (v_next, p_holder, p_purpose);
  RETURN v_next;
END;
$function$;

REVOKE ALL ON FUNCTION supabase_migrations.reserve_migration_version(text, text) FROM PUBLIC, anon, authenticated, service_role;
