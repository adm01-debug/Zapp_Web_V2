#!/usr/bin/env bash
# X070: behavioral contract de talkx_suppression_reasons.
# Critérios de aceite do P046:
#   1. 6 linhas is_system semeadas
#   2. admin cria código personalizado
#   3. agente recebe erro RLS ao inserir
#   4. trigger bloqueia desativar motivo do sistema
#   5. FK rejeita código inexistente (23503)
#   6. talkx_suppress_contact() como service_role devolve uuid

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261101223000_talkx_suppression_reasons.sql"
postgres_image="${TALKX_SUPPR_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-talkx-suppr-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-talkx-suppr-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}

psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}

expect_failure() {
  local label="$1" sql="$2" output status
  set +e
  output="$(psql_sql "$sql" 2>&1)"
  status=$?
  set -e
  if (( status == 0 )); then
    printf '%s\n' "$output" >&2
    fail "$label deveria falhar"
  fi
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null
ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1))
    if (( ready_checks >= 2 )); then break; fi
  else
    ready_checks=0
  fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

psql_sql "
  CREATE SCHEMA auth;
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS \\\$\\\$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \\\$\\\$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
    AS \\\$\\\$ SELECT coalesce(current_setting('request.jwt.claim.role', true), current_role) \\\$\\\$;
  CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL);
  CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
    AS \\\$\\\$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role IN ('admin','supervisor')) \\\$\\\$;
  CREATE TYPE talkx_blacklist_reason AS ENUM (
    'opt_out', 'invalid_number', 'manual', 'lgpd', 'no_commercial_permission', 'bounce'
  );
  CREATE TABLE public.talkx_blacklist (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id        uuid,
    phone             text,
    reason            text,
    reason_code       talkx_blacklist_reason,
    blocked_by        uuid,
    created_at        timestamptz NOT NULL DEFAULT now(),
    origin            text        NOT NULL,
    campaign_id       uuid,
    source_message_id uuid,
    removed_by        uuid,
    removed_at        timestamptz,
    expires_at        timestamptz
  );
  CREATE UNIQUE INDEX talkx_blacklist_contact_active_unique
    ON public.talkx_blacklist (contact_id)
    WHERE contact_id IS NOT NULL AND removed_at IS NULL;
  CREATE UNIQUE INDEX talkx_blacklist_phone_active_unique
    ON public.talkx_blacklist (phone)
    WHERE phone IS NOT NULL AND removed_at IS NULL;
  CREATE TABLE public.contacts (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    consent_status text,
    updated_at     timestamptz DEFAULT now()
  );
  CREATE TABLE public.talkx_recipients (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id  uuid REFERENCES public.contacts(id),
    campaign_id uuid,
    sent_at     timestamptz
  );
  INSERT INTO auth.users (id) VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001'),
    ('aaaaaaaa-0000-0000-0000-000000000002');
  INSERT INTO public.user_roles VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', 'admin');
  GRANT USAGE ON SCHEMA public, auth TO authenticated, anon, service_role;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
" >/dev/null

psql_file "$migration" >/dev/null

psql_sql "
  GRANT SELECT, INSERT, UPDATE ON talkx_suppression_reasons TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON talkx_blacklist TO service_role;
" >/dev/null

# Critério 1: 6 linhas semeadas com is_system = true
count="$(psql_sql 'SELECT count(*) FROM talkx_suppression_reasons WHERE is_system = true')"
[[ "$count" == '6' ]] || fail "esperava 6 linhas is_system=true, encontrou $count"
printf '[PASS] 6 linhas do sistema semeadas\n'

# Critério 2: admin pode criar código personalizado
psql_sql "
  SET ROLE authenticated;
  SET request.jwt.claim.sub='aaaaaaaa-0000-0000-0000-000000000001';
  INSERT INTO talkx_suppression_reasons (code, label, tone, is_system, sort_order)
    VALUES ('cliente_vip', 'VIP bloqueado', 'informativo', false, 200);
" >/dev/null
[[ "$(psql_sql "SELECT count(*) FROM talkx_suppression_reasons WHERE code = 'cliente_vip'")" == '1' ]] \
  || fail 'admin nao conseguiu inserir codigo personalizado'
printf '[PASS] admin cria codigo personalizado\n'

# Critério 3: agente (nao admin) recebe erro RLS ao inserir
expect_failure 'agente recebe erro RLS ao inserir motivo' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='aaaaaaaa-0000-0000-0000-000000000002'; INSERT INTO talkx_suppression_reasons (code, label, tone) VALUES ('teste_agente', 'Teste', 'informativo');"

# Critério 4: trigger bloqueia desativar motivo do sistema
expect_failure 'trigger bloqueia desativacao de motivo do sistema' \
  "UPDATE talkx_suppression_reasons SET active = false WHERE is_system = true AND code = 'opt_out';"

# Critério 5: FK rejeita código inexistente (23503)
set +e
fk_output="$(docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "INSERT INTO talkx_blacklist (origin, reason_code) VALUES ('manual', 'codigo_inexistente');" 2>&1)"
fk_status=$?
set -e
(( fk_status != 0 )) || fail 'FK deveria rejeitar codigo inexistente'
[[ "$fk_output" == *23503* ]] || fail "esperava erro 23503, recebeu: $fk_output"
printf '[PASS] FK rejeita codigo inexistente (23503)\n'

# Critério 6: talkx_suppress_contact como service_role devolve uuid
psql_sql "INSERT INTO public.contacts (id) VALUES ('cccccccc-0000-0000-0000-000000000001');" >/dev/null
result="$(psql_sql "
  SET ROLE service_role;
  SET request.jwt.claim.role='service_role';
  SELECT talkx_suppress_contact(
    'cccccccc-0000-0000-0000-000000000001'::uuid,
    NULL,
    'Bloqueio de teste',
    'manual',
    'manual',
    NULL,
    NULL
  );
")"
[[ "$result" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] \
  || fail "talkx_suppress_contact nao devolveu uuid valido: '$result'"
printf '[PASS] talkx_suppress_contact como service_role devolve uuid\n'

# Extras: enum dropado, reason_code e text
[[ "$(psql_sql "SELECT count(*) FROM pg_type WHERE typname = 'talkx_blacklist_reason'")" == '0' ]] \
  || fail 'enum talkx_blacklist_reason deveria ter sido dropado'
printf '[PASS] enum talkx_blacklist_reason foi dropado\n'

[[ "$(psql_sql "SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='talkx_blacklist' AND column_name='reason_code'")" == 'text' ]] \
  || fail 'reason_code nao e mais text'
printf '[PASS] reason_code convertida para text com FK\n'

printf 'talkx_suppression_reasons behavioral contract: PASS\n'
