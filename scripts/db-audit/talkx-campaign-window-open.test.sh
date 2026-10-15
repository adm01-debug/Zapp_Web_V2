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

# ---------------------------------------------------------------------------
# (N-102 fuso, cartao aplicar-at-time-zone-window-fixes): a janela passa a ser
# avaliada no fuso DA CAMPANHA (defeito 2/4). Roda num container separado com
# as MIGRATIONS REAIS da cadeia (fuso + base N-102 + correcao), porque o
# contrato aqui e outro (boolean, send_weekdays + DND) e nao o TABLE(allowed,
# reason) das secoes acima.
#
# Casos do criterio: SP domingo fora de {segunda}, SP dentro do DND, NY dentro
# do DND (prova que o fuso e o DA campanha), fuso legado invalido (fallback
# America/Sao_Paulo) e controle segunda 09:30 aberta. Com so a base (fase
# VERMELHA) os 4 primeiros devolvem true; com a correcao (fase VERDE), false.
# dnd_hours e regravado SEM as chaves holidays/sundays (NULL): a secao prova
# que o NULL nao vira 0 por cast (sem erro, DND avaliado normalmente) e que a
# ausencia e real (value ? 'holidays' = f). Bordas iguais nas duas fases: p_at
# NULL -> true; campanha inexistente -> P0002. O Rollback do cabecalho da
# correcao devolve o comportamento antigo e a reaplicacao volta ao corrigido.
#
# Overrides (mesmo padrao de WINDOW_OPEN_TEST_MIGRATION acima): N102_BASE_MIGRATION
# (default: o arquivo da preparacao N-102 no repo integrado) e N102_FIX_MIGRATION
# (default: a migration deste cartao). Servem a prova de mutacao (RED) e a
# integracao, caso as correcoes do N-102 sejam juntadas num so arquivo.
# ---------------------------------------------------------------------------
n102_tz_migration="$repo_root/supabase/migrations/20260911200000_persist_talkx_schedule_timezone.sql"
n102_base_migration="${N102_BASE_MIGRATION:-$repo_root/supabase/migrations/20261009203548_talkx_campaigns_send_weekdays_dnd.sql}"
n102_fix_migration="${N102_FIX_MIGRATION:-$repo_root/supabase/migrations/20261013230015_talkx_n102_window_fixes.sql}"
n102_container="talkx-n102-fuso-test-$$"

cleanup_n102() { docker rm -f "$n102_container" >/dev/null 2>&1 || true; }
trap 'cleanup; cleanup_n102' EXIT

[[ -f "$n102_tz_migration" ]] || fail "N-102 fuso: migration de fuso ausente: $n102_tz_migration"
[[ -f "$n102_base_migration" ]] || fail "N-102 fuso: base N-102 ausente: $n102_base_migration (preparacao ainda nao integrada? exporte N102_BASE_MIGRATION)"
[[ -f "$n102_fix_migration" ]] || fail "N-102 fuso: correcao ausente: $n102_fix_migration"

docker rm -f "$n102_container" >/dev/null 2>&1 || true
docker run -d --name "$n102_container" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null \
  || fail 'N-102 fuso: PostgreSQL de teste nao iniciou'
for _ in $(seq 1 15); do
  if docker exec "$n102_container" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$n102_container" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1 \
  || fail 'N-102 fuso: PostgreSQL de teste nao respondeu'

n102_psql() { docker exec -i "$n102_container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
n102_q() { n102_psql -Atqc "$1"; }

# Esqueleto pre-existente (o que as migrations leem; nada da migracao sob teste).
n102_psql >/dev/null <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role', true) $$;
create table public.profiles (id uuid primary key default gen_random_uuid(), user_id uuid, is_active boolean not null default true);
create table public.talkx_campaigns (id uuid primary key default gen_random_uuid(), created_by uuid, name text, status text not null default 'draft', revision bigint not null default 1, send_window_start time, send_window_end time, updated_at timestamptz not null default now());
create table public.talkx_settings (key text primary key, value jsonb not null, description text);
create table public.talkx_campaign_events (id bigserial primary key, campaign_id uuid, event_type text, actor_id uuid, message text);
SQL

n102_psql < "$n102_tz_migration" >/dev/null
n102_psql < "$n102_base_migration" >/dev/null
pass 'N-102 fuso: migrations reais de fuso + base N-102 aplicadas'

# c5 tem DND ligado e send_weekdays NULL: exercita o domingo com dnd_hours sem
# 'sundays' (NULL) nos dois lados do DND. A constraint de fuso cai de proposito:
# c4 e LINHA LEGADA gravada antes de a validacao existir.
n102_psql >/dev/null <<'SQL'
alter table public.talkx_campaigns drop constraint if exists talkx_campaigns_schedule_timezone_valid;
insert into public.talkx_campaigns (id, name, schedule_timezone, send_weekdays, respect_dnd) values
  ('11111111-1111-1111-1111-111111111111', 'c1 SP seg', 'America/Sao_Paulo', '{1}', false),
  ('22222222-2222-2222-2222-222222222222', 'c2 SP dnd', 'America/Sao_Paulo', null, true),
  ('33333333-3333-3333-3333-333333333333', 'c3 NY dnd', 'America/New_York', null, true),
  ('44444444-4444-4444-4444-444444444444', 'c4 legado', 'Mars/Olympus', '{1}', false),
  ('55555555-5555-5555-5555-555555555555', 'c5 SP dnd wknd', 'America/Sao_Paulo', null, true);
update public.talkx_settings set value = '{"start":"22:00","end":"08:00"}'::jsonb where key = 'dnd_hours';
SQL
[[ "$(n102_q "select (value ? 'holidays')::text || '/' || (value ? 'sundays')::text from public.talkx_settings where key = 'dnd_hours';")" == 'false/false' ]] \
  || fail 'N-102 fuso: dnd_hours deveria estar sem holidays/sundays (NULL)'
pass 'N-102 fuso: fixture carregada com dnd_hours sem holidays/sundays (NULL)'

n102_check() {
  local label="$1" camp="$2" at="$3" want="$4" got
  got="$(n102_q "set role authenticated; select public.talkx_campaign_window_open('$camp'::uuid, '$at'::timestamptz)::text;")"
  [[ "$got" == "$want" ]] || fail "$label: esperado '$want', obtido '$got'"
  pass "$label"
}

# Fase VERMELHA: so a base (dia/hora de p_at cru, sem fuso) — os 4 casos do
# criterio devolvem true e o controle tambem.
n102_check '(N-102 fuso) base: SP 11/10 23:30 dom e lido como segunda (true)' '11111111-1111-1111-1111-111111111111' '2026-10-12 02:30:00+00' 'true'
n102_check '(N-102 fuso) base: SP 06:00 lida como 09:00, fora do DND (true)' '22222222-2222-2222-2222-222222222222' '2026-10-13 09:00:00+00' 'true'
n102_check '(N-102 fuso) base: NY 07:30 lida como 11:30, fora do DND (true)' '33333333-3333-3333-3333-333333333333' '2026-10-13 11:30:00+00' 'true'
n102_check '(N-102 fuso) base: fuso invalido nao existia, cai como segunda (true)' '44444444-4444-4444-4444-444444444444' '2026-10-12 02:30:00+00' 'true'
n102_check '(N-102 fuso) base: controle segunda 09:30 SP abre (true)' '11111111-1111-1111-1111-111111111111' '2026-10-12 12:30:00+00' 'true'
n102_check '(N-102 fuso) base: domingo 12:00 SP fora do DND abre (true)' '55555555-5555-5555-5555-555555555555' '2026-10-11 15:00:00+00' 'true'
n102_check '(N-102 fuso) base: domingo 23:30 SP dentro do DND fecha (false)' '55555555-5555-5555-5555-555555555555' '2026-10-12 02:30:00+00' 'false'
got_null_base="$(n102_q "set role authenticated; select public.talkx_campaign_window_open('11111111-1111-1111-1111-111111111111'::uuid, null)::text;")"
[[ "$got_null_base" == 'true' ]] || fail "N-102 fuso base: p_at NULL deveria abrir, obteve '$got_null_base'"
pass '(N-102 fuso) base: p_at NULL abre (true)'

# Fase VERDE: aplica a correcao REAL e os 4 casos do criterio viram false.
n102_psql < "$n102_fix_migration" >/dev/null
pass 'N-102 fuso: correcao aplicada'
n102_check '(N-102 fuso) fix: SP 11/10 23:30 dom fora de {segunda} (false)' '11111111-1111-1111-1111-111111111111' '2026-10-12 02:30:00+00' 'false'
n102_check '(N-102 fuso) fix: SP 06:00 dentro do DND (false)' '22222222-2222-2222-2222-222222222222' '2026-10-13 09:00:00+00' 'false'
n102_check '(N-102 fuso) fix: NY 07:30 dentro do DND, fuso DA campanha (false)' '33333333-3333-3333-3333-333333333333' '2026-10-13 11:30:00+00' 'false'
n102_check '(N-102 fuso) fix: fuso legado invalido cai no default SP, domingo (false)' '44444444-4444-4444-4444-444444444444' '2026-10-12 02:30:00+00' 'false'
n102_check '(N-102 fuso) fix: controle segunda 09:30 SP abre (true)' '11111111-1111-1111-1111-111111111111' '2026-10-12 12:30:00+00' 'true'
n102_check '(N-102 fuso) fix: domingo 12:00 SP fora do DND abre, sundays NULL nao fecha (true)' '55555555-5555-5555-5555-555555555555' '2026-10-11 15:00:00+00' 'true'
n102_check '(N-102 fuso) fix: domingo 23:30 SP dentro do DND fecha, holidays NULL nao abre (false)' '55555555-5555-5555-5555-555555555555' '2026-10-12 02:30:00+00' 'false'

# Bordas iguais nas duas fases (mesmo comportamento antes e depois).
got_null_fix="$(n102_q "set role authenticated; select public.talkx_campaign_window_open('11111111-1111-1111-1111-111111111111'::uuid, null)::text;")"
[[ "$got_null_fix" == 'true' ]] || fail "N-102 fuso fix: p_at NULL deveria abrir, obteve '$got_null_fix'"
pass '(N-102 fuso) fix: p_at NULL abre (true)'
set +e
out_n102="$(n102_psql -v VERBOSITY=verbose -c "set role authenticated; select * from public.talkx_campaign_window_open('b1000000-0000-0000-0000-0000000000ff', '2026-10-02T12:00:00Z');" 2>&1)"
status_n102=$?
set -e
(( status_n102 != 0 )) || { printf '%s\n' "$out_n102" >&2; fail '(N-102 fuso) fix: campanha inexistente deveria falhar'; }
[[ "$out_n102" == *'talkx_campaign_not_found'* ]] || { printf '%s\n' "$out_n102" >&2; fail '(N-102 fuso) fix: esperava talkx_campaign_not_found'; }
[[ "$out_n102" == *'P0002'* ]] || { printf '%s\n' "$out_n102" >&2; fail '(N-102 fuso) fix: esperava SQLSTATE P0002'; }
pass '(N-102 fuso) fix: campanha inexistente -> P0002'

# Rollback do cabecalho da correcao devolve o comportamento antigo; reaplicar
# volta ao corrigido.
grep '^--   ' "$n102_fix_migration" | sed 's/^--   //' | n102_psql >/dev/null
n102_check '(N-102 fuso) rollback: volta ao antigo, SP domingo lida como segunda (true)' '11111111-1111-1111-1111-111111111111' '2026-10-12 02:30:00+00' 'true'
n102_psql < "$n102_fix_migration" >/dev/null
n102_check '(N-102 fuso) reaplicada: SP domingo fora de {segunda} (false)' '11111111-1111-1111-1111-111111111111' '2026-10-12 02:30:00+00' 'false'

printf 'PASS: N-102 fuso da campanha na janela — criterio, NULL sem cast, bordas e rollback\n'
