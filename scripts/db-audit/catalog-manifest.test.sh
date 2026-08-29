#!/usr/bin/env bash
set -euo pipefail

POSTGRES_IMAGE="${CATALOG_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
CONTAINER="zapp-v2-catalog-manifest-test-$$"
TMP_DIR="$(mktemp -d /tmp/zapp-v2-catalog-manifest-test.XXXXXX)"

cleanup() {
  case "$CONTAINER" in
    zapp-v2-catalog-manifest-test-[0-9]*)
      docker rm -f -- "$CONTAINER" >/dev/null 2>&1 || true
      ;;
  esac
  case "$TMP_DIR" in
    /tmp/zapp-v2-catalog-manifest-test.*)
      rm -rf -- "$TMP_DIR"
      ;;
  esac
}
trap cleanup EXIT

docker run --rm -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=test-only "$POSTGRES_IMAGE" >/dev/null

ready=false
for _attempt in $(seq 1 60); do
  # A imagem oficial aceita conexoes em um servidor temporario durante initdb.
  # Aguarde o marcador que separa esse processo do servidor PostgreSQL final.
  if docker logs "$CONTAINER" 2>&1 |
      grep -Fq 'PostgreSQL init process complete; ready for start up.' &&
    docker exec "$CONTAINER" \
      psql -X -At -v ON_ERROR_STOP=1 -U postgres -d postgres -c 'SELECT 1' \
        >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [ "$ready" != true ]; then
  echo "PostgreSQL de teste nao ficou pronto em 60 segundos." >&2
  exit 1
fi

docker exec -i "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
CREATE ROLE authenticated;
CREATE DATABASE db_a;
CREATE DATABASE db_b;
SQL

# Desloca OIDs apenas no db_a. O manifesto final precisa continuar identico.
docker exec -i "$CONTAINER" psql -U postgres -d db_a -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
CREATE SCHEMA oid_noise;
CREATE TABLE oid_noise.placeholder(id bigint);
CREATE FUNCTION oid_noise.placeholder() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
DROP SCHEMA oid_noise CASCADE;
SQL

for database in db_a db_b; do
  docker exec -i "$CONTAINER" psql -U postgres -d "$database" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
CREATE TABLE public.contacts (
  id bigint GENERATED ALWAYS AS IDENTITY,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contacts_pkey PRIMARY KEY (id),
  CONSTRAINT contacts_email_unique UNIQUE (email)
);
CREATE DOMAIN public.nonempty_text AS text
  CONSTRAINT nonempty_text_check CHECK (VALUE <> '');
CREATE TYPE public.contact_state AS ENUM ('active', 'inactive');
CREATE TYPE public.contact_label AS (name text, priority integer);
CREATE INDEX contacts_created_at_idx ON public.contacts (created_at DESC);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY contacts_select ON public.contacts FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.contacts TO authenticated;
GRANT SELECT (email) ON public.contacts TO authenticated;
REVOKE ALL ON TYPE public.contact_state FROM PUBLIC;
GRANT USAGE ON TYPE public.contact_state TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO authenticated;

CREATE VIEW public.active_contacts WITH (security_barrier = true) AS
SELECT id, email FROM public.contacts WHERE email <> '';
ALTER VIEW public.active_contacts ALTER COLUMN email
  SET DEFAULT 'generated@example.test';

CREATE FUNCTION public.get_contact(p_id bigint) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT p_id::text $$;
CREATE FUNCTION public.get_contact(p_email text) RETURNS text
LANGUAGE sql STABLE SET search_path = public
AS $$ SELECT p_email $$;
REVOKE ALL ON FUNCTION public.get_contact(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_contact(bigint) TO authenticated;

CREATE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.created_at = now(); RETURN NEW; END $$;
CREATE TRIGGER contacts_set_updated_at BEFORE UPDATE ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
SQL
done

docker exec -i "$CONTAINER" psql -U postgres -d db_a -At -v ON_ERROR_STOP=1 \
  < scripts/db-audit/catalog.sql > "$TMP_DIR/catalog-a.json"
docker exec -i "$CONTAINER" psql -U postgres -d db_a -At -v ON_ERROR_STOP=1 \
  < scripts/db-audit/manifest.sql > "$TMP_DIR/manifest-a.json"
docker exec -i "$CONTAINER" psql -U postgres -d db_b -At -v ON_ERROR_STOP=1 \
  < scripts/db-audit/manifest.sql > "$TMP_DIR/manifest-b.json"

node --input-type=module - \
  "$TMP_DIR/catalog-a.json" "$TMP_DIR/manifest-a.json" "$TMP_DIR/manifest-b.json" <<'NODE'
import assert from 'node:assert/strict';
import fs from 'node:fs';

const [, , catalogPath, manifestAPath, manifestBPath] = process.argv;
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const A = JSON.parse(fs.readFileSync(manifestAPath, 'utf8'));
const B = JSON.parse(fs.readFileSync(manifestBPath, 'utf8'));
const sections = [
  'columns', 'defaults', 'constraints', 'indexes', 'views', 'types', 'rls', 'policies',
  'triggers', 'functions', 'relation_grants', 'column_grants', 'routine_grants',
  'type_grants', 'default_grants', 'schema_grants',
];

assert.equal(catalog.format_version, 2);
assert.equal(catalog.database_identity.server_major, 17);
assert.deepEqual(catalog.functions.filter((name) => name === 'get_contact'), ['get_contact']);
assert.equal(
  catalog.function_signatures.filter((signature) => signature.startsWith('get_contact(')).length,
  2,
);

for (const manifest of [A, B]) {
  assert.equal(manifest.format_version, 2);
  assert.equal(manifest.database_identity.server_major, 17);
  for (const section of sections) {
    assert.equal(typeof manifest[section], 'object', section + ' ausente');
    for (const hash of Object.values(manifest[section])) {
      assert.match(hash, /^[a-f0-9]{32}$/, section + ' contem hash invalido');
    }
  }
  assert.ok(
    Object.hasOwn(manifest.constraints, 'domain:nonempty_text.nonempty_text_check'),
    'constraint de domain public ausente',
  );
  assert.ok(
    Object.hasOwn(manifest.defaults, 'active_contacts.email'),
    'default de coluna de view public ausente',
  );
}

delete A.generated_at;
delete A.database_identity;
delete B.generated_at;
delete B.database_identity;
assert.deepEqual(A, B, 'manifesto depende de OID ou ordem fisica');
NODE

docker exec -i "$CONTAINER" psql -U postgres -d db_a -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
ALTER TABLE public.contacts ALTER COLUMN created_at SET DEFAULT statement_timestamp();
ALTER TABLE public.contacts ADD CONSTRAINT contacts_email_nonempty CHECK (email <> '');
ALTER DOMAIN public.nonempty_text DROP CONSTRAINT nonempty_text_check;
ALTER DOMAIN public.nonempty_text ADD CONSTRAINT nonempty_text_check CHECK (length(VALUE) > 1);
ALTER TYPE public.contact_state ADD VALUE 'archived';
CREATE INDEX contacts_email_lower_idx ON public.contacts ((lower(email)));
ALTER TABLE public.contacts FORCE ROW LEVEL SECURITY;
ALTER POLICY contacts_select ON public.contacts USING (email <> 'blocked@example.test');
ALTER TABLE public.contacts DISABLE TRIGGER contacts_set_updated_at;
CREATE OR REPLACE FUNCTION public.get_contact(p_id bigint) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT 'contact:' || p_id::text $$;
REVOKE SELECT ON public.contacts FROM authenticated;
GRANT UPDATE (email) ON public.contacts TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_contact(bigint) FROM authenticated;
REVOKE USAGE ON TYPE public.contact_state FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM authenticated;
CREATE OR REPLACE VIEW public.active_contacts WITH (security_barrier = true) AS
SELECT id, email FROM public.contacts WHERE email <> 'blocked@example.test';
ALTER VIEW public.active_contacts ALTER COLUMN email
  SET DEFAULT 'mutated@example.test';
CREATE FUNCTION public.get_contact(p_id bigint, p_verbose boolean) RETURNS text
LANGUAGE sql STABLE SET search_path = public
AS $$ SELECT p_id::text || ':' || p_verbose::text $$;
SQL

docker exec -i "$CONTAINER" psql -U postgres -d db_a -At -v ON_ERROR_STOP=1 \
  < scripts/db-audit/catalog.sql > "$TMP_DIR/catalog-mutated.json"
docker exec -i "$CONTAINER" psql -U postgres -d db_a -At -v ON_ERROR_STOP=1 \
  < scripts/db-audit/manifest.sql > "$TMP_DIR/manifest-mutated.json"

node --input-type=module - \
  "$TMP_DIR/catalog-a.json" "$TMP_DIR/catalog-mutated.json" \
  "$TMP_DIR/manifest-a.json" "$TMP_DIR/manifest-mutated.json" <<'NODE'
import assert from 'node:assert/strict';
import fs from 'node:fs';

const [, , catalogBeforePath, catalogAfterPath, manifestBeforePath, manifestAfterPath] = process.argv;
const catalogBefore = JSON.parse(fs.readFileSync(catalogBeforePath, 'utf8'));
const catalogAfter = JSON.parse(fs.readFileSync(catalogAfterPath, 'utf8'));
const manifestBefore = JSON.parse(fs.readFileSync(manifestBeforePath, 'utf8'));
const manifestAfter = JSON.parse(fs.readFileSync(manifestAfterPath, 'utf8'));

assert.notDeepEqual(catalogBefore.function_signatures, catalogAfter.function_signatures);
assert.equal(
  catalogAfter.function_signatures.filter((signature) => signature.startsWith('get_contact(')).length,
  3,
);

for (const section of [
  'defaults', 'constraints', 'indexes', 'views', 'types', 'rls', 'policies', 'triggers',
  'functions', 'relation_grants', 'column_grants', 'routine_grants',
  'type_grants', 'default_grants',
]) {
  assert.notDeepEqual(
    manifestBefore[section],
    manifestAfter[section],
    'mutacao nao detectada em ' + section,
  );
}
assert.notEqual(
  manifestBefore.constraints['domain:nonempty_text.nonempty_text_check'],
  manifestAfter.constraints['domain:nonempty_text.nonempty_text_check'],
  'alteracao de constraint de domain nao foi detectada',
);
assert.notEqual(
  manifestBefore.defaults['active_contacts.email'],
  manifestAfter.defaults['active_contacts.email'],
  'alteracao de default de view nao foi detectada',
);
NODE

echo "OK: catalog.sql e manifest.sql validados no PostgreSQL 17 com mutacoes e OIDs distintos."
