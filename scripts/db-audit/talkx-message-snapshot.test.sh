#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
migration="$repo_root/supabase/migrations/20260912120000_snapshot_talkx_recipient_messages.sql"
postgres_image="${TALKX_MESSAGE_SNAPSHOT_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-message-snapshot-test-$$"
test_password="talkx_message_snapshot_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null
for _ in $(seq 1 30); do
  if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1 || fail 'PostgreSQL de teste não iniciou'

psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user)
$$;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;

CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY,
  status text NOT NULL,
  delivery_claim_token uuid,
  variant_id uuid,
  personalized_message text,
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
INSERT INTO public.talkx_recipients (id, status, delivery_claim_token, variant_id) VALUES
  ('50000000-0000-0000-0000-000000000001', 'sending', '70000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000002', 'sending', '70000000-0000-0000-0000-000000000002', NULL);
SQL

psql_test < "$migration" >/dev/null
service_session="SET ROLE service_role; SET request.jwt.claim.role='service_role';"
user_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated';"

unauthorized="$(psql_test -v VERBOSITY=verbose -c "$user_session SELECT * FROM public.persist_talkx_recipient_message_snapshot('50000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'Olá');" 2>&1 || true)"
[[ "$unauthorized" == *permission*denied* || "$unauthorized" == *service_role_required* ]] || fail 'authenticated persistiu snapshot de destinatário'

first_snapshot="$(psql_test -Atqc "$service_session SELECT personalized_message || ':' || media_url_snapshot || ':' || media_type_snapshot || ':' || variant_id_snapshot FROM public.persist_talkx_recipient_message_snapshot('50000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'Olá Ana, variante A', 'storage/path/banner-a.jpg', 'image', '80000000-0000-0000-0000-000000000001');")"
[[ "$first_snapshot" == 'Olá Ana, variante A:storage/path/banner-a.jpg:image:80000000-0000-0000-0000-000000000001' ]] || fail 'primeiro snapshot não preservou conteúdo, mídia e variante'

retry_snapshot="$(psql_test -Atqc "$service_session SELECT personalized_message || ':' || media_url_snapshot || ':' || media_type_snapshot || ':' || variant_id_snapshot FROM public.persist_talkx_recipient_message_snapshot('50000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'Olá Ana, variante B alterada', 'storage/path/banner-b.jpg', 'image', '90000000-0000-0000-0000-000000000001');")"
[[ "$retry_snapshot" == "$first_snapshot" ]] || fail 'retry alterou snapshot já persistido'

invalid_media="$(psql_test -v VERBOSITY=verbose -c "$service_session SELECT * FROM public.persist_talkx_recipient_message_snapshot('50000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002', 'Mensagem', 'storage/path/audio.ogg', NULL, NULL);" 2>&1 || true)"
[[ "$invalid_media" == *invalid_talkx_recipient_message_snapshot* ]] || fail 'snapshot aceitou URL de mídia sem tipo'

invalid_claim="$(psql_test -v VERBOSITY=verbose -c "$service_session SELECT * FROM public.persist_talkx_recipient_message_snapshot('50000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000099', 'Mensagem');" 2>&1 || true)"
[[ "$invalid_claim" == *talkx_delivery_claim_conflict* ]] || fail 'snapshot aceitou lease de outro worker'

printf 'PASS: Talk X snapshots immutable per-recipient content, media and A/B attribution behind a service lease\n'
