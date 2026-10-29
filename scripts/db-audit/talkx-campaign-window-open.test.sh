#!/usr/bin/env bash
# N-118 (cartao t_f0720c47): versiona a prova SQL de talkx_campaign_window_open.
#
# Antes a prova (E1) vivia so no .tmp do cartao complexo; aqui ela passa a rodar
# contra a MIGRATION REAL (20261011000003) num PostgreSQL 17 descartavel, no mesmo
# formato dos testes irmaos de banco (scripts/db-audit/talkx-audience-rpc.test.sh).
#
# Prova, sob roles reais (anon/authenticated), o contrato de janela da campanha:
#   (1) fuso da campanha: a hora/dia saem do schedule_timezone (fuso correto, default
#       America/Sao_Paulo quando ausente) e fuso invalido fecha (invalid_timezone);
#   (2) DND que vira a meia-noite cobre os dois lados, com fim exclusivo, e so vale
#       com opt-in (respect_dnd);
#   (3) business_hours com `days` (jsonb array) abre/fecha nos dias e horas certos —
#       o mesmo caso derruba o cast jsonb->integer[] original (erro 42846);
#   (4) fail-closed: business_hours presente e fora do contrato fecha com
#       invalid_business_hours (nunca abre nem estoura no cast ::time);
#   (5) autorizacao: authenticated sem papel -> 42501, anon sem EXECUTE -> 42501 e
#       campanha inexistente -> P0002.
#
# Override opcional para a prova de mutacao (RED): WINDOW_OPEN_TEST_MIGRATION aponta
# para outra copia da migration (ex.: a versao com o cast quebrado).

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
migration="${WINDOW_OPEN_TEST_MIGRATION:-$repo_root/supabase/migrations/20261011000003_20261010_talkx_campaigns_dnd_weekdays.sql}"
postgres_image="${TALKX_WINDOW_OPEN_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-window-open-test-$$"
test_password="talkx_window_open_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$1"; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_q() { psql_test -Atqc "$1"; }

# Espera o erro de contrato trazendo o SQLSTATE (psql -v VERBOSITY=verbose imprime
# "ERROR:  <code>: <mensagem>") e o texto do RAISE.
expect_error() {
  local label="$1" message="$2" errcode="$3" sql="$4" out status
  set +e
  out="$(psql_test -v VERBOSITY=verbose -c "$sql" 2>&1)"
  status=$?
  set -e
  (( status != 0 )) || { printf '%s\n' "$out" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$out" == *"$message"* ]] || { printf '%s\n' "$out" >&2; fail "$label: esperava a mensagem '$message'"; }
  [[ "$out" == *"$errcode"* ]] || { printf '%s\n' "$out" >&2; fail "$label: esperava o SQLSTATE '$errcode'"; }
  pass "$label"
}

start_postgres() {
  # Requer duas sondas seguidas: o runner as vezes reporta pronto um instante antes
  # do container reiniciar. So o bootstrap e retentado; falha de assercao nunca.
  for attempt in 1 2 3; do
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    if ! docker run -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null; then
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

start_postgres || fail 'PostgreSQL de teste nao iniciou'

admin_uid='20000000-0000-0000-0000-000000000001'
supervisor_uid='20000000-0000-0000-0000-000000000002'
agent_uid='20000000-0000-0000-0000-000000000003'

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
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  )
$$;

CREATE TABLE public.talkx_settings (
  key text PRIMARY KEY,
  value jsonb
);

-- Colunas que talkx_campaign_window_open le; send_weekdays/respect_dnd chegam pela
-- migration (ALTER TABLE ADD COLUMN IF NOT EXISTS).
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY,
  name text NOT NULL DEFAULT 'campanha',
  message_template text NOT NULL DEFAULT 't',
  schedule_timezone text,
  send_window_start time,
  send_window_end time,
  business_hours_only boolean NOT NULL DEFAULT false
);

INSERT INTO public.profiles (id, user_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('20000000-0000-0000-0000-000000000001', 'admin'),
  ('20000000-0000-0000-0000-000000000002', 'supervisor');

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
SQL

[[ -f "$migration" ]] || fail "migration ausente: $migration"
psql_test < "$migration" >/dev/null
# Replayavel: uma segunda aplicacao nao pode falhar.
psql_test < "$migration" >/dev/null
pass 'migration 20261011000003 aplica e e replayavel'

# DND que vira a meia-noite; campanhas de fuso/teste ficam com respect_dnd=false
# para isolar o caso em prova.
psql_test >/dev/null <<'SQL'
INSERT INTO public.talkx_settings (key, value) VALUES
  ('dnd_hours', '{"start":"22:00","end":"06:00"}'::jsonb);

INSERT INTO public.talkx_campaigns (id, name, schedule_timezone, send_window_start, send_window_end, business_hours_only, send_weekdays, respect_dnd) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'tz SP',      'America/Sao_Paulo', '08:00', '10:00', false, NULL, false),
  ('a1000000-0000-0000-0000-000000000002', 'tz UTC',     'UTC',               '08:00', '10:00', false, NULL, false),
  ('a1000000-0000-0000-0000-000000000003', 'tz default', NULL,                '08:00', '10:00', false, NULL, false),
  ('a1000000-0000-0000-0000-000000000004', 'dnd on',     'UTC',               NULL,    NULL,    false, NULL, true),
  ('a1000000-0000-0000-0000-000000000005', 'dnd off',    'UTC',               NULL,    NULL,    false, NULL, false),
  ('a1000000-0000-0000-0000-000000000006', 'bh',         'UTC',               NULL,    NULL,    true,  NULL, false),
  ('a1000000-0000-0000-0000-000000000007', 'bad tz',     'Not/AZone',         NULL,    NULL,    false, NULL, false);
SQL
pass 'fixture de campanhas e dnd_hours carregada'

admin_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='$admin_uid';"
supervisor_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='$supervisor_uid';"
agent_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='$agent_uid';"

# Devolve "allowed|reason" (reason vazio quando aberto).
window() {
  psql_q "$1 SELECT allowed::text || '|' || COALESCE(reason, '') FROM public.talkx_campaign_window_open('$2'::uuid, '$3'::timestamptz);"
}
check() {
  local label="$1" sess="$2" camp="$3" at="$4" want="$5" got
  got="$(window "$sess" "$camp" "$at")"
  [[ "$got" == "$want" ]] || fail "$label: esperado '$want', obtido '$got'"
  pass "$label"
}

# ---------------------------------------------------------------------------
# ACL: anon sem EXECUTE; authenticated com EXECUTE.
# ---------------------------------------------------------------------------
[[ "$(psql_q "SELECT has_function_privilege('anon', 'public.talkx_campaign_window_open(uuid,timestamptz)', 'EXECUTE')")" == 'f' ]] \
  || fail 'anon com EXECUTE em talkx_campaign_window_open'
[[ "$(psql_q "SELECT has_function_privilege('authenticated', 'public.talkx_campaign_window_open(uuid,timestamptz)', 'EXECUTE')")" == 't' ]] \
  || fail 'authenticated sem EXECUTE em talkx_campaign_window_open'
pass 'ACL: anon sem EXECUTE, authenticated com EXECUTE'

# ---------------------------------------------------------------------------
# (1) Fuso da campanha: 12:00Z e 09:00 em America/Sao_Paulo (dentro de 08-10) e
#     12:00 em UTC (fora). Default America/Sao_Paulo quando o fuso e ausente.
# ---------------------------------------------------------------------------
check '(1) fuso SP abre as 09:00 locais (janela 08-10)' "$admin_session" 'a1000000-0000-0000-0000-000000000001' '2026-10-02T12:00:00Z' 'true|'
check '(1) mesmo instante em UTC fecha (12:00 fora de 08-10)' "$admin_session" 'a1000000-0000-0000-0000-000000000002' '2026-10-02T12:00:00Z' 'false|outside_send_window'
check '(1) fuso ausente cai no default America/Sao_Paulo (abre)' "$admin_session" 'a1000000-0000-0000-0000-000000000003' '2026-10-02T12:00:00Z' 'true|'
check '(1) fuso invalido fecha invalid_timezone (fail-closed)' "$admin_session" 'a1000000-0000-0000-0000-000000000007' '2026-10-02T12:00:00Z' 'false|invalid_timezone'

# ---------------------------------------------------------------------------
# (2) Meia-noite no DND: 22:00-06:00 cobre 23:30 e 05:30 (ambos os lados) e a
#     06:00 ja abre (fim exclusivo). Sem opt-in (respect_dnd=false) nao bloqueia.
# ---------------------------------------------------------------------------
check '(2) DND 23:30 (lado da noite) fecha' "$admin_session" 'a1000000-0000-0000-0000-000000000004' '2026-10-02T23:30:00Z' 'false|dnd'
check '(2) DND 05:30 (lado da madrugada) fecha' "$admin_session" 'a1000000-0000-0000-0000-000000000004' '2026-10-03T05:30:00Z' 'false|dnd'
check '(2) DND 06:00 abre (fim exclusivo)' "$admin_session" 'a1000000-0000-0000-0000-000000000004' '2026-10-02T06:00:00Z' 'true|'
check '(2) DND 12:00 abre' "$admin_session" 'a1000000-0000-0000-0000-000000000004' '2026-10-02T12:00:00Z' 'true|'
check '(2) respect_dnd=false ignora o DND 23:30' "$admin_session" 'a1000000-0000-0000-0000-000000000005' '2026-10-02T23:30:00Z' 'true|'

# ---------------------------------------------------------------------------
# (3) business_hours com days (jsonb array): tz UTC, 08:00-18:00, seg-sex.
#     Este caso cobre o cast jsonb->integer[] original (42846) quando quebrado.
# ---------------------------------------------------------------------------
psql_test >/dev/null <<'SQL'
INSERT INTO public.talkx_settings (key, value)
VALUES ('business_hours', '{"start":"08:00","end":"18:00","days":[1,2,3,4,5],"tz":"UTC"}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
SQL
check '(3) bh days: sexta 12:00 abre' "$admin_session" 'a1000000-0000-0000-0000-000000000006' '2026-10-02T12:00:00Z' 'true|'
check '(3) bh days: sexta 08:00 abre (inicio inclusivo)' "$admin_session" 'a1000000-0000-0000-0000-000000000006' '2026-10-02T08:00:00Z' 'true|'
check '(3) bh days: sexta 07:59 fecha' "$admin_session" 'a1000000-0000-0000-0000-000000000006' '2026-10-02T07:59:00Z' 'false|outside_business_hours'
check '(3) bh days: sexta 18:00 fecha (fim exclusivo)' "$admin_session" 'a1000000-0000-0000-0000-000000000006' '2026-10-02T18:00:00Z' 'false|outside_business_hours'
check '(3) bh days: sabado 12:00 fecha (dia fora de [1..5])' "$admin_session" 'a1000000-0000-0000-0000-000000000006' '2026-10-03T12:00:00Z' 'false|outside_business_hours'

# ---------------------------------------------------------------------------
# (4) Fail-closed: business_hours presente e fora do contrato -> invalid_business_hours.
# ---------------------------------------------------------------------------
bad_bh() {
  local label="$1" value="$2"
  psql_test >/dev/null <<SQL
INSERT INTO public.talkx_settings (key, value)
VALUES ('business_hours', '$value'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
SQL
  check "$label" "$admin_session" 'a1000000-0000-0000-0000-000000000006' '2026-10-02T12:00:00Z' 'false|invalid_business_hours'
}
bad_bh '(4) start fora do formato HH:MM' '{"start":"8:00","end":"18:00","days":[1,2,3]}'
bad_bh '(4) days vazio'                  '{"start":"08:00","end":"18:00","days":[]}'
bad_bh '(4) days com 7 (fora de 0..6)'   '{"start":"08:00","end":"18:00","days":[1,7]}'
bad_bh '(4) days com texto'              '{"start":"08:00","end":"18:00","days":["a"]}'
bad_bh '(4) days ausente'                '{"start":"08:00","end":"18:00"}'

# business_hours ausente = default 08:00-18:00, seg-sex, America/Sao_Paulo.
psql_test >/dev/null <<'SQL'
DELETE FROM public.talkx_settings WHERE key = 'business_hours';
SQL
check '(4) bh ausente usa default 08-18 seg-sex SP (sexta 12:00 SP abre)' "$admin_session" 'a1000000-0000-0000-0000-000000000006' '2026-10-02T15:00:00Z' 'true|'
check '(4) default SP 18:00 fecha (fim exclusivo)' "$admin_session" 'a1000000-0000-0000-0000-000000000006' '2026-10-02T21:00:00Z' 'false|outside_business_hours'
check '(4) default seg-sex: sabado 12:00 SP fecha' "$admin_session" 'a1000000-0000-0000-0000-000000000006' '2026-10-03T15:00:00Z' 'false|outside_business_hours'

# ---------------------------------------------------------------------------
# (5) Autorizacao: admin/supervisor leem; authenticated sem papel -> 42501;
#     anon sem EXECUTE -> 42501; campanha inexistente -> P0002.
# ---------------------------------------------------------------------------
check '(5) supervisor tambem le a janela' "$supervisor_session" 'a1000000-0000-0000-0000-000000000004' '2026-10-02T12:00:00Z' 'true|'
expect_error '(5) authenticated sem papel -> 42501' 'talkx_campaign_role_required' '42501' \
  "$agent_session SELECT * FROM public.talkx_campaign_window_open('a1000000-0000-0000-0000-000000000004', '2026-10-02T12:00:00Z');"
expect_error '(5) anon sem EXECUTE -> 42501' 'permission denied' '42501' \
  "SET ROLE anon; SELECT * FROM public.talkx_campaign_window_open('a1000000-0000-0000-0000-000000000004', '2026-10-02T12:00:00Z');"
expect_error '(5) campanha inexistente -> P0002' 'talkx_campaign_not_found' 'P0002' \
  "$admin_session SELECT * FROM public.talkx_campaign_window_open('b1000000-0000-0000-0000-0000000000ff', '2026-10-02T12:00:00Z');"

printf 'PASS: N-118 talkx_campaign_window_open — fuso, meia-noite, business_hours com days, fail-closed e autorizacao\n'
