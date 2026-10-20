#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${TALKX_HISTORY_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
prestate="${TALKX_HISTORY_FK_PRESTATE:-NO_ACTION}"
container_name="zapp-talkx-fk-$RANDOM-$$"
test_password="talkx_fk_test_only"

cleanup() {
  if [[ "$container_name" =~ ^zapp-talkx-fk-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

[[ "$prestate" == NO_ACTION || "$prestate" == SET_NULL || "$prestate" == ORPHAN ]] \
  || fail 'TALKX_HISTORY_FK_PRESTATE deve ser NO_ACTION, SET_NULL ou ORPHAN'
command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
docker run --rm -d --name "$container_name" \
  -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  ready_markers="$(docker logs "$container_name" 2>&1 \
    | grep -c 'database system is ready to accept connections' || true)"
  if [ "$ready_markers" -ge 2 ] \
    && docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' \
      >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[ "$ready" = true ] || fail "PostgreSQL descartavel ($postgres_image) nao ficou pronto"

psql_test >/dev/null <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE public.profiles (id uuid PRIMARY KEY);
CREATE TABLE public.talkx_templates (id uuid PRIMARY KEY);
CREATE TABLE public.talkx_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.talkx_templates(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  saved_by uuid,
  UNIQUE (template_id, version_number)
);
INSERT INTO public.profiles(id) VALUES ('10000000-0000-0000-0000-000000000001');
INSERT INTO public.talkx_templates(id) VALUES ('20000000-0000-0000-0000-000000000001');
SQL

if [[ "$prestate" == NO_ACTION ]]; then
  psql_test -c 'ALTER TABLE public.talkx_template_versions
    ADD CONSTRAINT talkx_template_versions_saved_by_fkey
    FOREIGN KEY (saved_by) REFERENCES public.profiles(id);' >/dev/null
elif [[ "$prestate" == SET_NULL ]]; then
  psql_test -c 'ALTER TABLE public.talkx_template_versions
    ADD CONSTRAINT talkx_template_versions_saved_by_fkey
    FOREIGN KEY (saved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;' >/dev/null
fi

saved_by='10000000-0000-0000-0000-000000000001'
if [[ "$prestate" == ORPHAN ]]; then
  saved_by='10000000-0000-0000-0000-000000000099'
fi
psql_test -v saved_by="$saved_by" >/dev/null <<'SQL'
INSERT INTO public.talkx_template_versions(template_id, version_number, saved_by)
VALUES (
  '20000000-0000-0000-0000-000000000001', 1,
  :'saved_by'::uuid
);
SQL

migration="$repo_root/supabase/migrations/20260909230000_canonicalize_talkx_history_saved_by_fk.sql"
if [[ "$prestate" == ORPHAN ]]; then
  set +e
  failure_output="$(psql_test < "$migration" 2>&1)"
  failure_status=$?
  set -e
  [[ "$failure_status" -ne 0 ]] || fail 'orphan prestate deveria falhar na validacao da FK'
  grep -q 'violates foreign key constraint' <<<"$failure_output" \
    || fail 'orphan prestate nao retornou diagnostico de integridade referencial'
  constraint_count="$(psql_test -Atqc "SELECT count(*) FROM pg_constraint WHERE conrelid='public.talkx_template_versions'::regclass AND conname='talkx_template_versions_saved_by_fkey'")"
  [[ "$constraint_count" == 0 ]] \
    || fail 'falha de validacao deixou constraint parcial apos rollback do bloco atomico'
  printf '[OK] Talk X saved_by FK: ORPHAN abortou atomicamente sem estado parcial.\n'
  exit 0
fi

psql_test < "$migration" >/dev/null
psql_test < "$migration" >/dev/null

result="$(psql_test -Atq <<'SQL'
DELETE FROM public.profiles
WHERE id='10000000-0000-0000-0000-000000000001';
SELECT concat_ws('|',
  (SELECT count(*) FROM public.profiles),
  (SELECT count(*) FROM public.talkx_template_versions),
  COALESCE((SELECT saved_by::text FROM public.talkx_template_versions), 'NULL'),
  (SELECT confdeltype FROM pg_constraint
   WHERE conrelid='public.talkx_template_versions'::regclass
     AND conname='talkx_template_versions_saved_by_fkey'),
  (SELECT convalidated FROM pg_constraint
   WHERE conrelid='public.talkx_template_versions'::regclass
     AND conname='talkx_template_versions_saved_by_fkey')
);
SQL
)"

[[ "$result" == '0|1|NULL|n|t' ]] \
  || fail "estado final inesperado para prestate=$prestate: $result"
printf '[OK] Talk X saved_by FK: %s convergiu idempotentemente para SET NULL validado.\n' "$prestate"
