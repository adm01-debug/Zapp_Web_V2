#!/usr/bin/env bash
set -Eeuo pipefail

# V07b do PLANO_TALKX_V3_100_ETAPAS_2026-09-29 — corrige o eixo phone da RPC
# talkx_suppress_contact (achado V07 phone-axis da auditoria adversarial).
#
# Prova, em PostgreSQL 17 descartável, que a RPC:
#  a) devolve NULL (idempotente) quando o MESMO phone já tem supressão ativa,
#     mesmo com contact_id DIFERENTE — antes vazava 23505 (índice phone);
#  b) devolve NULL quando o mesmo contact_id já tem supressão ativa (regressão);
#  c) devolve um uuid quando a supressão é nova;
#  d) mantém ACL: só service_role executa.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${TALKX_SUPPRESS_PHONE_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-talkx-suppress-phone-$RANDOM-$$"
test_password="talkx_suppress_phone_test_only"

cleanup() {
  if [[ "$container_name" =~ ^zapp-talkx-suppress-phone-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
docker run --rm -d --name "$container_name" \
  -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$container_name" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$container_name" \
    psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

# ---- fixtures minimos (espelham a migration) ----
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'authenticated')
$$;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE anon NOLOGIN;

CREATE TYPE public.talkx_blacklist_reason AS ENUM (
  'opt_out', 'invalid_number', 'manual', 'lgpd', 'no_commercial_permission', 'bounce'
);

CREATE TABLE public.talkx_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  phone text,
  reason text,
  reason_code public.talkx_blacklist_reason,
  origin text,
  source_message_id uuid,
  campaign_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  removed_at timestamptz
);

-- Objetos que a X029 (migration seguinte) exige: ela DROPa a assinatura de 6
-- argumentos e cria a de 7, alem da tabela de palavras, do match, do UPDATE do
-- setting e da view por campanha.
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL,
  UNIQUE (user_id, role)
);
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','supervisor'))
$$;
CREATE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
$$;
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'campanha',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), phone text);
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  UNIQUE (campaign_id, contact_id)
);
CREATE TABLE public.talkx_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.talkx_settings (key, value) VALUES ('optout_autoreply', '"PARE para sair"');

-- índices únicos parciais (V05 phone + V07 contact) — são os alvos de conflito
CREATE UNIQUE INDEX talkx_blacklist_phone_active_unique
  ON public.talkx_blacklist (phone)
  WHERE phone IS NOT NULL AND removed_at IS NULL;
CREATE UNIQUE INDEX talkx_blacklist_contact_active_unique
  ON public.talkx_blacklist (contact_id)
  WHERE contact_id IS NOT NULL AND removed_at IS NULL;
SQL

# ---- aplica a migration nova (função corrigida) ----
migration="$repo_root/supabase/migrations/20260930330000_talkx_suppress_contact_phone_axis.sql"
[[ -f "$migration" ]] || fail 'migration 20260930330000 nao existe'
psql_test < "$migration" >/dev/null || fail 'migration nao aplicou'
psql_test < "$migration" >/dev/null || fail 'migration nao e replayavel (2a aplicacao falhou)'

# ---- X029: a assinatura de 6 argumentos e DROPada e nasce a de 7 com default ----
x029="$repo_root/supabase/migrations/20261002581230_talkx_v4_x029_optout.sql"
[[ -f "$x029" ]] || fail 'migration X029 nao existe'
psql_test < "$x029" >/dev/null || fail 'X029 nao aplicou'
psql_test < "$x029" >/dev/null || fail 'X029 nao e replayavel (2a aplicacao falhou)'
[[ "$(psql_test -Atqc "SELECT to_regprocedure('public.talkx_suppress_contact(uuid,text,text,public.talkx_blacklist_reason,text,uuid)') IS NULL")" == 't' ]] \
  || fail 'a assinatura antiga de 6 argumentos sobreviveu (ambiguidade 42725)'
[[ "$(psql_test -Atqc "SELECT count(*) FROM pg_proc WHERE proname='talkx_suppress_contact'")" == '1' ]] \
  || fail 'deveria existir exatamente 1 talkx_suppress_contact'

# ---- (a) eixo phone: mesmo phone, contact_id diferente => NULL (antes vazava 23505) ----
psql_test -q <<'SQL' >/dev/null
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';
-- supressão ativa do contato A com phone X
INSERT INTO public.talkx_blacklist (contact_id, phone, reason, reason_code, origin)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '+5511999999999', 'opt-out', 'opt_out', 'webhook');
COMMIT;
SQL
out="$(psql_test -At 2>&1 <<'SQL' || true
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';
SELECT public.talkx_suppress_contact(
  'bbbbbbbb-0000-0000-0000-000000000002', '+5511999999999', 'opt-out', 'opt_out', 'webhook', NULL, NULL
);
COMMIT;
SQL
)"
# espera linha vazia (NULL) — se vazou 23505, a mensagem de erro aparece
[[ -z "$out" ]] || fail "eixo phone deveria devolver NULL (idempotente), mas veio: $out"

# ---- (b) eixo contact_id: mesmo contato de novo => NULL (regressão) ----
out2="$(psql_test -At 2>&1 <<'SQL' || true
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';
SELECT public.talkx_suppress_contact(
  'aaaaaaaa-0000-0000-0000-000000000001', NULL, 'opt-out', 'opt_out', 'webhook', NULL, NULL
);
COMMIT;
SQL
)"
[[ -z "$out2" ]] || fail "eixo contact_id deveria devolver NULL (idempotente), mas veio: $out2"

# ---- (c) supressão nova => devolve uuid ----
out3="$(psql_test -At 2>&1 <<'SQL' || true
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';
SELECT public.talkx_suppress_contact(
  'cccccccc-0000-0000-0000-000000000003', '+551****8888', 'manual', 'manual', 'ui', NULL, NULL
);
COMMIT;
SQL
)"
[[ "$out3" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] \
  || fail "supressão nova deveria devolver uuid, mas veio: $out3"

# ---- (d) ACL: authenticated/anon NAO executam (42501), service_role sim ----
new_sig='public.talkx_suppress_contact(uuid,text,text,public.talkx_blacklist_reason,text,uuid,uuid)'
[[ "$(psql_test -Atqc "SELECT has_function_privilege('service_role','$new_sig','EXECUTE')")" == 't' ]] \
  || fail 'service_role deveria ter EXECUTE'
[[ "$(psql_test -Atqc "SELECT has_function_privilege('authenticated','$new_sig','EXECUTE')")" == 'f' ]] \
  || fail 'authenticated NAO deveria ter EXECUTE'
[[ "$(psql_test -Atqc "SELECT has_function_privilege('anon','$new_sig','EXECUTE')")" == 'f' ]] \
  || fail 'anon NAO deveria ter EXECUTE'
# A assinatura antiga de 6 argumentos nao existe mais (sem ambiguidade 42725).
[[ "$(psql_test -Atqc "SELECT to_regprocedure('public.talkx_suppress_contact(uuid,text,text,public.talkx_blacklist_reason,text,uuid)') IS NULL")" == 't' ]] \
  || fail 'assinatura antiga de 6 argumentos ainda viva'

printf '[OK] Talk X V07b/X029: supressão de contato idempotente nos eixos phone e contact_id (sem 23505), na assinatura nova de 7 argumentos.\n'
