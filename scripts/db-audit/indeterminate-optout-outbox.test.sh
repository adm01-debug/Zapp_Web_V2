#!/usr/bin/env bash
# #190 (R2-API-006): prova executável da migration
# 20261011180000_indeterminate_optout_outbox.sql em PostgreSQL descartável.
#
# A prova cobre os pontos recusados no refazer:
#   A) base sem #69: migration cria inbound_message_effects + drain; o rollback
#      real extraído dos comentários da migration remove só o que esta migration criou.
#   B) base com outbox/drain da #69 preexistentes: rollback mantém a tabela, os
#      dados e a drain; só remove optout_resolve e restaura o CHECK de 3 efeitos.
#   C) optout_resolve com reavaliação ainda indeterminada/erro: drain deixa a
#      pendência sem applied_at, incrementa attempts e registra last_error.
#
# Segurança: o teste sempre cria bancos descartáveis zapp_indeterminate_outbox_* em
# container PostgreSQL próprio. Mesmo assim, cada fixture aborta se current_database()
# não tiver esse prefixo. O teste executa o texto real do rollback extraído das
# linhas "-- Rollback:" da migration, não uma cópia inline.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="${IND_OPT_OUTBOX_MIGRATION:-$repo_root/supabase/migrations/20261011180000_indeterminate_optout_outbox.sql}"
pg_image="${IND_OPT_OUTBOX_PG_IMAGE:-postgres:17-alpine}"
pg_name="zapp-indeterminate-optout-outbox-$$"
pg_password="indeterminate_optout_test_only"
passed=0

cleanup() {
  if [[ "$pg_name" =~ ^zapp-indeterminate-optout-outbox-[0-9]+$ ]]; then
    docker rm -f "$pg_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { passed=$((passed + 1)); printf '[PASS] %s\n' "$1"; }

psql_db() { docker exec -i "$pg_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d "$1"; }
psql_q() { docker exec "$pg_name" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d "$1" -c "$2"; }

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  pass "$label"
}

assert_like() {
  local label="$1" haystack="$2" needle="$3"
  [[ "$haystack" == *"$needle"* ]] || fail "$label: esperado conter '$needle', obtido '$haystack'"
  pass "$label"
}

start_postgres() {
  docker run --rm -d --name "$pg_name" -e POSTGRES_PASSWORD="$pg_password" "$pg_image" >/dev/null
  local ready=false
  for _ in $(seq 1 90); do
    if docker exec "$pg_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
      ready=true
      break
    fi
    sleep 1
  done
  [[ "$ready" == true ]] || fail 'PostgreSQL de teste não iniciou'
}

create_roles_and_db() {
  local db="$1"
  docker exec -i "$pg_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END;
\$\$;
CREATE DATABASE $db;
SQL
}

rollback_sql_file() {
  local out="$repo_root/.tmp/indeterminate_optout_outbox.rollback.sql"
  mkdir -p "$repo_root/.tmp"
  python3 - "$migration" > "$out" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
all_lines = path.read_text().splitlines()
lines = []
for pos, raw in enumerate(all_lines):
    if raw.startswith('-- Rollback:'):
        lines.append(raw[len('-- Rollback:'):].lstrip())
        j = pos + 1
        while j < len(all_lines) and (all_lines[j] == '--' or all_lines[j].startswith('--   ')):
            lines.append('' if all_lines[j] == '--' else all_lines[j][len('--   '):])
            j += 1
        break
if not lines:
    raise SystemExit('migration sem bloco de rollback SQL executavel')
print('\n'.join(lines))
PY
  printf '%s\n' "$out"
}

install_common_fixture() {
  local db="$1"
  psql_db "$db" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '')
$$;

DO $$
BEGIN
  IF current_database() NOT LIKE 'zapp_indeterminate_outbox_%' THEN
    RAISE EXCEPTION 'unsafe database for indeterminate optout outbox test: %', current_database();
  END IF;
END;
$$;

CREATE FUNCTION public.proof_assert(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'proof assertion failed: %', p_message;
  END IF;
END;
$$;

CREATE FUNCTION public.phone_variants(p_phone text)
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$ SELECT ARRAY[p_phone, regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')] $$;

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  whatsapp_connection_id uuid,
  assigned_to uuid,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (phone)
);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  whatsapp_connection_id uuid NOT NULL,
  content text,
  message_type text,
  media_url text,
  sender text NOT NULL,
  external_id text NOT NULL,
  status text,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (whatsapp_connection_id, external_id, sender)
);

CREATE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_messages_updated_at
  BEFORE UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.talkx_recipients (
  contact_id uuid NOT NULL,
  sent_at timestamptz
);

CREATE FUNCTION public.talkx_suppress_contact(
  p_contact_id uuid,
  p_phone text,
  p_reason text,
  p_reason_code text,
  p_origin text,
  p_message_id uuid
)
RETURNS uuid
LANGUAGE sql
AS $$ SELECT gen_random_uuid() $$;

CREATE FUNCTION public.attribute_talkx_reply(p_contact_id uuid, p_phone text, p_message_id uuid)
RETURNS jsonb
LANGUAGE sql
AS $$ SELECT jsonb_build_object('attributed', true, 'message_id', p_message_id) $$;

CREATE FUNCTION public.attribute_multiplix_item_reply(p_phone text, p_message_id text, p_quoted_external_id text)
RETURNS jsonb
LANGUAGE sql
AS $$ SELECT jsonb_build_object('attributed', true, 'message_id', p_message_id, 'quoted_external_id', p_quoted_external_id) $$;

CREATE FUNCTION public.talkx_match_optout(p_text text)
RETURNS text
LANGUAGE sql STABLE
AS $$ SELECT NULL::text $$;

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
SQL
}

apply_migration() {
  local db="$1"
  psql_db "$db" < "$migration" >/dev/null
}

run_rollback() {
  local db="$1" rollback_file="$2"
  psql_db "$db" < "$rollback_file" >/dev/null
}

case_a_fresh_base() {
  local db='zapp_indeterminate_outbox_a'
  create_roles_and_db "$db"
  install_common_fixture "$db"
  apply_migration "$db"
  assert_eq 'A: migration cria tabela em base sem #69' 't' \
    "$(psql_q "$db" "SELECT to_regclass('public.inbound_message_effects') IS NOT NULL")"
  assert_eq 'A: migration cria drain em base sem #69' 't' \
    "$(psql_q "$db" "SELECT to_regprocedure('public.drain_inbound_message_effects(uuid,text)') IS NOT NULL")"
  assert_like 'A: drain criada recebe marcador de rollback' \
    "$(psql_q "$db" "SELECT coalesce(obj_description('public.drain_inbound_message_effects(uuid,text)'::regprocedure, 'pg_proc'), '')")" \
    '20261011180000:created-fn'
  run_rollback "$db" "$rollback_file"
  assert_eq 'A: rollback remove tabela criada pela migration' 't' \
    "$(psql_q "$db" "SELECT to_regclass('public.inbound_message_effects') IS NULL")"
  assert_eq 'A: rollback remove drain criada pela migration' 't' \
    "$(psql_q "$db" "SELECT to_regprocedure('public.drain_inbound_message_effects(uuid,text)') IS NULL")"
}

case_b_preexisting_69() {
  local db='zapp_indeterminate_outbox_b'
  create_roles_and_db "$db"
  install_common_fixture "$db"
  psql_db "$db" <<'SQL'
CREATE TABLE public.inbound_message_effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_connection_id uuid NOT NULL,
  external_id text NOT NULL,
  effect text NOT NULL CHECK (effect IN ('optout_suppress', 'talkx_reply', 'multiplix_reply')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0,
  applied_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
COMMENT ON TABLE public.inbound_message_effects IS 'preexisting #69 outbox';
INSERT INTO public.inbound_message_effects (id, whatsapp_connection_id, external_id, effect, payload)
VALUES (
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'preexisting-message',
  'talkx_reply',
  '{}'::jsonb
);

CREATE FUNCTION public.drain_inbound_message_effects(p_connection_id uuid, p_external_id text)
RETURNS jsonb
LANGUAGE sql
AS $$ SELECT jsonb_build_object('preexisting_69_drain', true) $$;
COMMENT ON FUNCTION public.drain_inbound_message_effects(uuid, text) IS '#69 preexisting drain';
SQL
  apply_migration "$db"
  psql_db "$db" <<'SQL'
INSERT INTO public.inbound_message_effects (whatsapp_connection_id, external_id, effect, payload)
VALUES ('10000000-0000-0000-0000-000000000001', 'pending-optout', 'optout_resolve', '{}'::jsonb);
SQL
  assert_eq 'B: migration não marca drain preexistente como criada por ela' 'f' \
    "$(psql_q "$db" "SELECT coalesce(obj_description('public.drain_inbound_message_effects(uuid,text)'::regprocedure, 'pg_proc'), '') LIKE '%20261011180000:created-fn%'")"
  run_rollback "$db" "$rollback_file"
  assert_eq 'B: rollback mantém tabela preexistente da #69' 't' \
    "$(psql_q "$db" "SELECT to_regclass('public.inbound_message_effects') IS NOT NULL")"
  assert_eq 'B: rollback mantém dados preexistentes da #69' '1' \
    "$(psql_q "$db" "SELECT count(*) FROM public.inbound_message_effects WHERE id = '40000000-0000-0000-0000-000000000001'")"
  assert_eq 'B: rollback remove só pendências optout_resolve da #190' '0' \
    "$(psql_q "$db" "SELECT count(*) FROM public.inbound_message_effects WHERE effect = 'optout_resolve'")"
  assert_eq 'B: rollback restaura CHECK sem optout_resolve' 't' \
    "$(psql_q "$db" "SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.inbound_message_effects'::regclass AND conname = 'inbound_message_effects_effect_check' AND pg_get_constraintdef(oid) NOT LIKE '%optout_resolve%')")"
  assert_eq 'B: rollback NÃO derruba drain preexistente da #69' 't' \
    "$(psql_q "$db" "SELECT to_regprocedure('public.drain_inbound_message_effects(uuid,text)') IS NOT NULL")"
}

case_c_optout_resolve_error() {
  local db='zapp_indeterminate_outbox_c'
  create_roles_and_db "$db"
  install_common_fixture "$db"
  apply_migration "$db"
  psql_db "$db" <<'SQL'
CREATE OR REPLACE FUNCTION public.talkx_match_optout(p_text text)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'indeterminate_mock';
END;
$$;

INSERT INTO public.messages (id, whatsapp_connection_id, sender, external_id, content, created_at)
VALUES (
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'contact',
  'case-c-message',
  'talvez remover',
  statement_timestamp()
);

INSERT INTO public.inbound_message_effects (id, whatsapp_connection_id, external_id, effect, payload, created_at)
VALUES (
  '50000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'case-c-message',
  'talkx_reply',
  jsonb_build_object(
    'contact_id', '20000000-0000-0000-0000-000000000001',
    'phone', '5511999990001',
    'message_id', '30000000-0000-0000-0000-000000000001'
  ),
  statement_timestamp() - interval '2 seconds'
),
(
  '50000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000001',
  'case-c-message',
  'multiplix_reply',
  jsonb_build_object(
    'phone', '5511999990001',
    'message_id', '30000000-0000-0000-0000-000000000001',
    'quoted_external_id', 'quoted-1'
  ),
  statement_timestamp() - interval '1 second'
),
(
  '50000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'case-c-message',
  'optout_resolve',
  jsonb_build_object(
    'contact_id', '20000000-0000-0000-0000-000000000001',
    'phone', '5511999990001',
    'message_id', '30000000-0000-0000-0000-000000000001',
    'text', 'talvez remover',
    'quoted_external_id', 'quoted-1'
  ),
  statement_timestamp()
);

SELECT set_config('request.jwt.claim.role', 'service_role', false);
SELECT public.drain_inbound_message_effects('10000000-0000-0000-0000-000000000001', 'case-c-message');
SQL
  assert_eq 'C: ramo talkx_reply continua aplicando' 't' \
    "$(psql_q "$db" "SELECT applied_at IS NOT NULL AND last_error IS NULL FROM public.inbound_message_effects WHERE id = '50000000-0000-0000-0000-000000000002'")"
  assert_eq 'C: ramo multiplix_reply continua aplicando' 't' \
    "$(psql_q "$db" "SELECT applied_at IS NOT NULL AND last_error IS NULL FROM public.inbound_message_effects WHERE id = '50000000-0000-0000-0000-000000000003'")"
  assert_eq 'C: optout_resolve com erro fica pendente e registra last_error' 't' \
    "$(psql_q "$db" "SELECT applied_at IS NULL AND attempts = 1 AND last_error LIKE '%indeterminate_mock%' FROM public.inbound_message_effects WHERE id = '50000000-0000-0000-0000-000000000001'")"
}

case_d_ingest_preserves_message_updated_at() {
  local db='zapp_indeterminate_outbox_d'
  create_roles_and_db "$db"
  install_common_fixture "$db"
  apply_migration "$db"
  psql_db "$db" <<'SQL'
INSERT INTO public.contacts (id, phone, name, whatsapp_connection_id)
VALUES ('20000000-0000-0000-0000-000000000004', '5511999990004', 'Cliente D', '10000000-0000-0000-0000-000000000001');

INSERT INTO public.messages (id, contact_id, whatsapp_connection_id, sender, external_id, content, status, created_at, updated_at)
VALUES (
  '30000000-0000-0000-0000-000000000004',
  '20000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000001',
  'contact',
  'case-d-message',
  'conteudo antigo',
  'received',
  timestamp with time zone '2026-01-01 10:00:00+00',
  timestamp with time zone '2026-01-01 10:05:00+00'
);

SELECT * FROM public.ingest_inbound_message(
  '10000000-0000-0000-0000-000000000001',
  '5511999990004',
  'Cliente D',
  'conteudo novo',
  'text',
  NULL,
  'case-d-message',
  timestamp with time zone '2026-01-01 10:10:00+00',
  false,
  'not_matched',
  NULL,
  NULL
);
SQL
  assert_eq 'D: ingest atualiza mensagem existente sem avançar updated_at' '2026-01-01 10:05:00+00' \
    "$(psql_q "$db" "SELECT to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') || '+00' FROM public.messages WHERE id = '30000000-0000-0000-0000-000000000004'")"
}

command -v docker >/dev/null 2>&1 || fail 'Docker não está instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon não está acessível'
[[ -f "$migration" ]] || fail "migration ausente: $migration"

start_postgres
rollback_file="$(rollback_sql_file)"

case_a_fresh_base
case_b_preexisting_69
case_c_optout_resolve_error
case_d_ingest_preserves_message_updated_at

printf '[OK] #190 indeterminate opt-out outbox: rollback real preserva #69, remove só objetos próprios e optout_resolve pendente fica retentável (%s asserções).\n' "$passed"
