#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
postgres_image="${TALKX_SEND_BUDGET_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-send-budget-test-$$"
test_password="***"

# X018 — limites por minuto/dia/conexão + perfis de velocidade. A migration sob
# teste é a última; as anteriores reproduzem a main (V21/V23/V25/X009/V26/X014/
# unify) + o seed de settings, para que a migration nova encontre as colunas e
# funções que recria.
migrations=(
  "$repo_root/supabase/migrations/20260912130000_harden_talkx_draft_save.sql"
  "$repo_root/supabase/migrations/20260930640000_talkx_v21_launch_flags.sql"
  "$repo_root/supabase/migrations/20260930770000_talkx_v23_draft_step.sql"
  "$repo_root/supabase/migrations/20261001271230_talkx_v25_campaign_owner.sql"
  "$repo_root/supabase/migrations/20261001281230_talkx_campaigns_draft_step_responsible.sql"
  "$repo_root/supabase/migrations/20261001291230_talkx_v26_template_version.sql"
  "$repo_root/supabase/migrations/20261002381230_talkx_role_gates.sql"
  "$repo_root/supabase/migrations/20261002451230_talkx_owner_responsible_unify.sql"
  "$repo_root/supabase/migrations/20260930410000_talkx_settings_replay_idempotent.sql"
  "$repo_root/supabase/migrations/20261002551230_talkx_limits_ritmo.sql"
)

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

start_postgres() {
  for attempt in 1 2 3; do
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    if ! docker run -d --name "$container_name" -e POSTGRES_PASSWORD="***" "$postgres_image" >/dev/null; then
      printf 'WARN: PostgreSQL container failed to start (attempt %s/3)\n' "$attempt" >&2
      continue
    fi
    for _ in $(seq 1 15); do
      if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
        sleep 1
        if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
          return 0
        fi
      fi
      sleep 1
    done
    printf 'WARN: PostgreSQL bootstrap was not stable (attempt %s/3)\n' "$attempt" >&2
    docker logs "$container_name" >&2 || true
  done
  return 1
}

start_postgres || fail 'PostgreSQL de teste não iniciou'

psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user)
$$;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
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
CREATE FUNCTION public.get_profile_id_for_user(uuid) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM public.profiles WHERE user_id = $1
$$;
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  )
$$;
CREATE FUNCTION public.is_valid_talkx_schedule_timezone(text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1 = 'America/Sao_Paulo' $$;
CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY,
  status text NOT NULL,
  instance_id text
);
INSERT INTO public.whatsapp_connections (id, status, instance_id) VALUES
  ('50000000-0000-0000-0000-000000000001', 'connected', 'evolution-live'),
  ('50000000-0000-0000-0000-000000000002', 'connected', 'evolution-live-2');
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  message_template text NOT NULL,
  variables_config jsonb NOT NULL DEFAULT '[]'::jsonb,
  typing_delay_min integer NOT NULL,
  typing_delay_max integer NOT NULL,
  send_interval_min integer NOT NULL,
  send_interval_max integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  outcome_unknown_count integer NOT NULL DEFAULT 0,
  replied_count integer NOT NULL DEFAULT 0,
  whatsapp_connection_id uuid,
  created_by uuid,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  description text,
  objective text NOT NULL DEFAULT 'engajamento',
  audience_source text NOT NULL DEFAULT 'contacts',
  audience_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  segment_id uuid,
  template_id uuid,
  media_url text,
  media_type text,
  scheduled_at timestamptz,
  schedule_timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  send_window_start time,
  send_window_end time,
  business_hours_only boolean NOT NULL DEFAULT false,
  speed_profile text NOT NULL DEFAULT 'moderate'
);
INSERT INTO public.profiles (id, user_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('20000000-0000-0000-0000-000000000001', 'admin');

ALTER TABLE public.talkx_campaigns
  ADD COLUMN IF NOT EXISTS worker_id text,
  ADD COLUMN IF NOT EXISTS worker_lease_expires_at timestamptz;

CREATE TABLE public.talkx_settings (key text PRIMARY KEY, value jsonb NOT NULL, description text);
CREATE TABLE public.talkx_blacklist (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.talkx_links (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid);
CREATE TABLE public.talkx_link_clicks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), link_id uuid);
CREATE TABLE public.talkx_template_versions (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.talkx_campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  event_type text NOT NULL,
  actor_id uuid,
  message text
);

-- X018: tabelas que o orçamento soma (Talk X + Multiplix).
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  sent_at timestamptz
);
CREATE TABLE public.multiplix_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_connection_id uuid
);
CREATE TABLE public.multiplix_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL,
  sent_at timestamptz
);

GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talkx_campaigns TO authenticated;
SQL

for migration in "${migrations[@]}"; do
  echo "  aplicando $(basename "$migration")"
  docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f - < "$migration" >/dev/null
done

# --- helpers de assert -----------------------------------------------------------------
jqget() { docker exec -i "$container_name" psql -X -At -U postgres -d postgres -c "SELECT ($2 #>> '$3')::text"; }

# (0) migration aplica do zero e deixa o helper + os RPCs criados.
echo "(0) cadeia aplicada do zero e objetos criados"
psql_test -Atqc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND p.proname IN ('talkx_resolve_speed_pace','talkx_connection_send_budget','talkx_campaign_pace')" | grep -q '^3$' || fail 'objetos X018 não criados'

# (1) limite por minuto: 4 envios no último minuto, teto 6 -> minute_remaining=2.
echo "(1) minute_remaining=2 com 4 envios e teto 6"
psql_test >/dev/null <<'SQL'
INSERT INTO public.talkx_campaigns (id, name, message_template, typing_delay_min, typing_delay_max, send_interval_min, send_interval_max, whatsapp_connection_id, created_by)
VALUES ('60000000-0000-0000-0000-000000000001', 'c1', '', 1500, 4000, 8000, 20000, '50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001');
INSERT INTO public.talkx_recipients (campaign_id, sent_at)
SELECT '60000000-0000-0000-0000-000000000001', statement_timestamp() - interval '10 seconds' FROM generate_series(1,4);
SQL
minute_remaining=$(psql_test -Atqc "SET request.jwt.claim.role = 'service_role'; SELECT (public.talkx_connection_send_budget('50000000-0000-0000-0000-000000000001') ->> 'minute_remaining')::int")
[[ "$minute_remaining" == '2' ]] || fail "minute_remaining esperado 2, obtido $minute_remaining"

# (2) limite diário: 500 no dia -> day_remaining=0 (conexão 2, isolada).
echo "(2) day_remaining=0 com 500 envios no dia"
psql_test >/dev/null <<'SQL'
INSERT INTO public.talkx_campaigns (id, name, message_template, typing_delay_min, typing_delay_max, send_interval_min, send_interval_max, whatsapp_connection_id, created_by)
VALUES ('60000000-0000-0000-0000-000000000002', 'c2', '', 1500, 4000, 8000, 20000, '50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001');
INSERT INTO public.talkx_recipients (campaign_id, sent_at)
SELECT '60000000-0000-0000-0000-000000000002', statement_timestamp() - interval '1 hour' FROM generate_series(1,500);
SQL
day_remaining=$(psql_test -Atqc "SET request.jwt.claim.role = 'service_role'; SELECT (public.talkx_connection_send_budget('50000000-0000-0000-0000-000000000002') ->> 'day_remaining')::int")
[[ "$day_remaining" == '0' ]] || fail "day_remaining esperado 0, obtido $day_remaining"

# (3) envio do Multiplix na mesma conexão entra na conta do dia E do minuto.
echo "(3) Multiplix na mesma conexão entra na conta"
psql_test >/dev/null <<'SQL'
INSERT INTO public.multiplix_dispatches (id, whatsapp_connection_id)
VALUES ('70000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001');
INSERT INTO public.multiplix_recipients (dispatch_id, sent_at)
SELECT '70000000-0000-0000-0000-000000000001', statement_timestamp() - interval '5 seconds' FROM generate_series(1,2);
SQL
minute_sent=$(psql_test -Atqc "SET request.jwt.claim.role = 'service_role'; SELECT (public.talkx_connection_send_budget('50000000-0000-0000-0000-000000000001') ->> 'minute_sent')::int")
# 4 (Talk X) + 2 (Multiplix) = 6 no último minuto.
[[ "$minute_sent" == '6' ]] || fail "minute_sent esperado 6 (4 Talk X + 2 Multiplix), obtido $minute_sent"

# (4) perfil fast com send_interval_min=0 -> gravado no mínimo do perfil (3000).
echo "(4) fast com intervalo 0 clampa para 3000"
psql_test >/dev/null <<'SQL'
SET request.jwt.claim.role = 'authenticated';
SET request.jwt.claim.sub = '20000000-0000-0000-0000-000000000001';
SELECT * FROM public.save_talkx_campaign_draft(NULL, NULL, '80000000-0000-0000-0000-000000000001',
  '{"name":"d1","objective":"engajamento","audience_source":"contacts","speed_profile":"fast","send_interval_min":0,"send_interval_max":0,"typing_delay_min":0,"typing_delay_max":0}'::jsonb);
SQL
si_min=$(psql_test -Atqc "SELECT send_interval_min FROM public.talkx_campaigns WHERE draft_creation_key = '80000000-0000-0000-0000-000000000001'")
[[ "$si_min" == '3000' ]] || fail "fast send_interval_min esperado 3000, obtido $si_min"

# (5) max_per_minute acima do teto (6) -> 22023.
echo "(5) max_per_minute acima do teto -> 22023"
err=$(psql_test -Atqc "
  SET request.jwt.claim.role = 'authenticated';
  SET request.jwt.claim.sub = '20000000-0000-0000-0000-000000000001';
  BEGIN;
  DO \$\$ BEGIN
    PERFORM public.save_talkx_campaign_draft(NULL, NULL, '80000000-0000-0000-0000-000000000002',
      '{\"name\":\"d2\",\"objective\":\"engajamento\",\"audience_source\":\"contacts\",\"max_per_minute\":7}'::jsonb);
    RAISE EXCEPTION 'nao_rejeitou';
  END \$\$;
  ROLLBACK;" 2>&1 | grep -oE 'talkx_max_per_minute_acima_do_teto|22023' | head -1 || true)
[[ "$err" == *"talkx_max_per_minute_acima_do_teto"* || "$err" == *"22023"* ]] || fail "max_per_minute=7 deveria rejeitar com 22023, obtido: $err"

printf 'PASS: Talk X limits/pace — budget por minuto e por dia (Talk X + Multiplix), perfil deriva e clampa ritmo, max_per_minute com teto\n'
