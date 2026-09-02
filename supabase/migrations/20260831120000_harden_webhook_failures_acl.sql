-- Restringe a dead-letter queue de webhooks a service_role.
--
-- A policy original foi criada sem clausula TO e, portanto, aplicava-se a
-- PUBLIC. Combinada aos default grants do schema, isso concedia acesso efetivo
-- a anon e authenticated sobre payloads e mensagens de erro.

ALTER TABLE public.webhook_failures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full" ON public.webhook_failures;

CREATE POLICY "service_role_full"
  ON public.webhook_failures
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- REVOKE no nivel da tabela nao remove grants feitos diretamente em colunas.
-- Remova qualquer ACL de coluna preexistente, inclusive de roles adicionais,
-- antes de estabelecer o contrato minimo no nivel da tabela.
DO $revoke_webhook_failures_column_acl$
DECLARE
  acl_entry record;
  grantee_sql text;
BEGIN
  FOR acl_entry IN
    SELECT DISTINCT
      attribute.attname,
      exploded.grantee,
      exploded.privilege_type,
      grantee.rolname
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_attribute attribute
      ON attribute.attrelid = relation.oid
     AND attribute.attnum > 0
     AND NOT attribute.attisdropped
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) exploded
    LEFT JOIN pg_catalog.pg_roles grantee
      ON grantee.oid = exploded.grantee
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'webhook_failures'
      AND relation.relkind IN ('r', 'p')
  LOOP
    IF acl_entry.privilege_type NOT IN ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES') THEN
      RAISE EXCEPTION 'privilegio de coluna inesperado em webhook_failures: %',
        acl_entry.privilege_type;
    END IF;

    IF acl_entry.grantee = 0 THEN
      grantee_sql := 'PUBLIC';
    ELSIF acl_entry.rolname IS NOT NULL THEN
      grantee_sql := pg_catalog.quote_ident(acl_entry.rolname);
    ELSE
      RAISE EXCEPTION 'grantee de coluna desconhecido em webhook_failures: oid=%',
        acl_entry.grantee;
    END IF;

    EXECUTE pg_catalog.format(
      'REVOKE %s (%I) ON TABLE public.webhook_failures FROM %s CASCADE',
      acl_entry.privilege_type,
      acl_entry.attname,
      grantee_sql
    );
  END LOOP;
END
$revoke_webhook_failures_column_acl$;

REVOKE ALL PRIVILEGES ON TABLE public.webhook_failures FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.webhook_failures FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.webhook_failures TO service_role;
