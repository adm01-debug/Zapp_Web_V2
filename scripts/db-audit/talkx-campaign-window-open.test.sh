#!/usr/bin/env bash
# N-118 isolada ([refazer 2] t_8f7e8008): prova SQL de talkx_campaign_window_open
# no contrato BOOLEAN (TRUE = janela aberta), como o motor consome
# (`windowOpen !== true` = fora-da-janela no talkx-scheduler).
#
# Roda contra a MIGRATION REAL (*talkx_campaign_window_open_isolada.sql) num
# PostgreSQL 17 descartavel, no formato dos testes irmaos de banco. Prova, sob
# o papel real (service_role executa; anon/authenticated sem EXECUTE):
#   (0) troca de contrato: o contrato ANTERIOR da mesma assinatura —
#       TABLE(allowed boolean, reason text, next_window timestamptz), como na
#       migration 20261011000003 — esta na frente antes de aplicar a migration;
#       ela aplica sobre ele (o DROP FUNCTION do cabecalho tira o obstaculo) e o
#       MESMO arquivo SEM o DROP falha com 42P13 (prova de mutacao);
#   (1) fuso da campanha: hora/dia saem do schedule_timezone (default
#       America/Sao_Paulo quando ausente) e fuso invalido fecha (false);
#   (2) DND que vira a meia-noite cobre os dois lados, com fim exclusivo, e so
#       vale com opt-in (respect_dnd);
#   (3) business_hours com `days` (jsonb array) abre/fecha nos dias e horas
#       certos — este caso derruba o cast jsonb->integer[] original (erro 42846);
#   (4) fail-closed: business_hours presente e fora do contrato ERGUE 22023
#       (invalid_business_hours), nunca 22P02/42846; ausente = default
#       08:00-18:00, seg-sex, America/Sao_Paulo;
#   (5) autorizacao: UM grant so — service_role com EXECUTE; anon e
#       authenticated sem EXECUTE (-> 42501 ao chamar);
#   (6) ramos TRUE: send_window com start=end (open 24h) e campanha sem
#       restricao (so existir/active, status irrelevante) — ambos TRUE;
#   (7) campanha inexistente -> P0002.
#
# Override opcional para a prova de mutacao (RED): WINDOW_OPEN_TEST_MIGRATION aponta
# para outra copia da migration (ex.: a versao com o cast quebrado).

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
default_migration=$(ls "$repo_root"/supabase/migrations/*talkx_campaign_window_open_isolada.sql 2>/dev/null | head -n 1 || true)
migration="${WINDOW_OPEN_TEST_MIGRATION:-$default_migration}"
postgres_image="${TALKX_WINDOW_OPEN_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-window-open-test-$$"
test_password="talkx-window-test-pw"

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

psql_test >/dev/null <<'SQL'
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;

CREATE TABLE public.talkx_settings (
  key text PRIMARY KEY,
  value jsonb
);

-- Colunas que talkx_campaign_window_open le; send_weekdays/respect_dnd chegam pela
-- migration (ALTER TABLE ADD COLUMN IF NOT EXISTS). `status` existe de proposito:
-- a funcao o ignora (coluna irrelevante) e o bloco (6) prova isso.
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY,
  name text NOT NULL DEFAULT 'campanha',
  status text NOT NULL DEFAULT 'draft',
  schedule_timezone text,
  send_window_start time,
  send_window_end time,
  business_hours_only boolean NOT NULL DEFAULT false
);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
SQL

# ---------------------------------------------------------------------------
# (0) Contrato ANTERIOR da funcao, exatamente como o da migration 20261011000003:
#     mesma assinatura de entrada (uuid, timestamptz) e retorno
#     TABLE(allowed boolean, reason text, next_window timestamptz). A 20261011000003
#     nao esta na arvore desta branch — o defeito da revisao e justamente a troca de
#     contrato sobre um alvo que a tem —, entao o teste reproduz aqui o contrato dela
#     (assinatura e retorno; o corpo nao importa para o 42P13). Sem essa funcao na
#     frente, o CREATE OR REPLACE da migration nova passaria por acidente.
# ---------------------------------------------------------------------------
psql_test >/dev/null <<'SQL'
CREATE FUNCTION public.talkx_campaign_window_open(
  p_campaign_id uuid,
  p_at timestamptz DEFAULT now()
)
RETURNS TABLE (allowed boolean, reason text, next_window timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $legacy$
BEGIN
  RETURN QUERY SELECT true, 'legacy'::text, p_at;
END;
$legacy$;
SQL
legacy_result="$(psql_q "SELECT pg_get_function_result('public.talkx_campaign_window_open(uuid, timestamptz)'::regprocedure)")"
[[ "$legacy_result" == TABLE* ]] || fail "(0) contrato anterior nao ficou TABLE(...): '$legacy_result'"
pass '(0) contrato TABLE anterior (como em 20261011000003) aplicado antes da migration'

[[ -n "$migration" && -f "$migration" ]] || fail "migration isolada ausente: $migration"
psql_test < "$migration" >/dev/null
# Replayavel: uma segunda aplicacao nao pode falhar.
psql_test < "$migration" >/dev/null
pass 'migration isolada aplica e e replayavel'

# A migration trouxe as colunas da janela.
[[ "$(psql_q "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='talkx_campaigns' AND column_name IN ('send_weekdays','respect_dnd')")" == '2' ]] \
  || fail 'migration nao criou send_weekdays/respect_dnd em talkx_campaigns'
pass 'migration cria send_weekdays e respect_dnd'

# A migration trocou o contrato: a mesma assinatura agora devolve boolean.
window_result="$(psql_q "SELECT pg_get_function_result('public.talkx_campaign_window_open(uuid, timestamptz)'::regprocedure)")"
[[ "$window_result" == 'boolean' ]] \
  || fail "(0) migration nao trocou o retorno para boolean sobre o contrato TABLE anterior: '$window_result'"
pass '(0) migration troca o contrato TABLE anterior por boolean'

# DND que vira a meia-noite; campanhas de fuso/teste ficam com respect_dnd=false
# para isolar o caso em prova.
psql_test >/dev/null <<'SQL'
INSERT INTO public.talkx_settings (key, value) VALUES
  ('dnd_hours', '{"start":"22:00","end":"06:00"}'::jsonb);

INSERT INTO public.talkx_campaigns (id, name, status, schedule_timezone, send_window_start, send_window_end, business_hours_only, send_weekdays, respect_dnd) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'tz SP',      'sending',   'America/Sao_Paulo', '08:00', '10:00', false, NULL, false),
  ('a1000000-0000-0000-0000-000000000002', 'tz UTC',     'sending',   'UTC',               '08:00', '10:00', false, NULL, false),
  ('a1000000-0000-0000-0000-000000000003', 'tz default', 'scheduled', NULL,                '08:00', '10:00', false, NULL, false),
  ('a1000000-0000-0000-0000-000000000004', 'dnd on',     'scheduled', 'UTC',               NULL,    NULL,    false, NULL, true),
  ('a1000000-0000-0000-0000-000000000005', 'dnd off',    'scheduled', 'UTC',               NULL,    NULL,    false, NULL, false),
  ('a1000000-0000-0000-0000-000000000006', 'bh',         'scheduled', 'UTC',               NULL,    NULL,    true,  NULL, false),
  ('a1000000-0000-0000-0000-000000000007', 'bad tz',     'scheduled', 'Not/AZone',         NULL,    NULL,    false, NULL, false),
  ('a1000000-0000-0000-0000-000000000008', 'open 24h',   'sending',   'UTC',               '08:00', '08:00', false, NULL, false),
  ('a1000000-0000-0000-0000-000000000009', 'sem janela', 'draft',     'UTC',               NULL,    NULL,    false, NULL, false),
  ('a1000000-0000-0000-0000-000000000010', 'dias uteis', 'scheduled', 'UTC',               NULL,    NULL,    false, '{1,2,3,4,5}', false);
SQL
pass 'fixture de campanhas e dnd_hours carregada'

svc_session="SET ROLE service_role;"

# Devolve "t"/"f" (boolean cru do contrato; sem ::text, que viraria 'true').
window() {
  psql_q "$1 SELECT public.talkx_campaign_window_open('$2'::uuid, '$3'::timestamptz);"
}
check() {
  local label="$1" sess="$2" camp="$3" at="$4" want="$5" got
  got="$(window "$sess" "$camp" "$at")"
  [[ "$got" == "$want" ]] || fail "$label: esperado '$want', obtido '$got'"
  pass "$label"
}

# ---------------------------------------------------------------------------
# (5 primeiro, para falhar cedo se o grant estiver errado) Um grant so:
# service_role com EXECUTE; anon e authenticated sem.
# ---------------------------------------------------------------------------
[[ "$(psql_q "SELECT has_function_privilege('service_role', 'public.talkx_campaign_window_open(uuid,timestamptz)', 'EXECUTE')")" == 't' ]] \
  || fail 'service_role sem EXECUTE em talkx_campaign_window_open'
[[ "$(psql_q "SELECT has_function_privilege('anon', 'public.talkx_campaign_window_open(uuid,timestamptz)', 'EXECUTE')")" == 'f' ]] \
  || fail 'anon com EXECUTE em talkx_campaign_window_open'
[[ "$(psql_q "SELECT has_function_privilege('authenticated', 'public.talkx_campaign_window_open(uuid,timestamptz)', 'EXECUTE')")" == 'f' ]] \
  || fail 'authenticated com EXECUTE em talkx_campaign_window_open'
pass '(5) ACL: so service_role com EXECUTE (anon/authenticated sem)'
expect_error '(5) anon ao chamar -> 42501' 'permission denied' '42501' \
  "SET ROLE anon; SELECT public.talkx_campaign_window_open('a1000000-0000-0000-0000-000000000004', '2026-10-02T12:00:00Z');"
expect_error '(5) authenticated ao chamar -> 42501' 'permission denied' '42501' \
  "SET ROLE authenticated; SELECT public.talkx_campaign_window_open('a1000000-0000-0000-0000-000000000004', '2026-10-02T12:00:00Z');"

# ---------------------------------------------------------------------------
# (1) Fuso da campanha: 12:00Z e 09:00 em America/Sao_Paulo (dentro de 08-10) e
#     12:00 em UTC (fora). Default America/Sao_Paulo quando o fuso e ausente.
# ---------------------------------------------------------------------------
check '(1) fuso SP abre as 09:00 locais (janela 08-10)' "$svc_session" 'a1000000-0000-0000-0000-000000000001' '2026-10-02T12:00:00Z' 't'
check '(1) mesmo instante em UTC fecha (12:00 fora de 08-10)' "$svc_session" 'a1000000-0000-0000-0000-000000000002' '2026-10-02T12:00:00Z' 'f'
check '(1) fuso ausente usa America/Sao_Paulo (09:00 locais abre)' "$svc_session" 'a1000000-0000-0000-0000-000000000003' '2026-10-02T12:00:00Z' 't'
check '(1) fuso invalido fecha' "$svc_session" 'a1000000-0000-0000-0000-000000000007' '2026-10-02T12:00:00Z' 'f'

# ---------------------------------------------------------------------------
# (2) Meia-noite no DND: 22:00-06:00 cobre 23:30 e 05:30 (ambos os lados) e a
#     06:00 ja abre (fim exclusivo). Sem opt-in (respect_dnd=false) nao bloqueia.
# ---------------------------------------------------------------------------
check '(2) DND 23:30 (lado da noite) fecha' "$svc_session" 'a1000000-0000-0000-0000-000000000004' '2026-10-02T23:30:00Z' 'f'
check '(2) DND 05:30 (lado da madrugada) fecha' "$svc_session" 'a1000000-0000-0000-0000-000000000004' '2026-10-03T05:30:00Z' 'f'
check '(2) DND 06:00 abre (fim exclusivo)' "$svc_session" 'a1000000-0000-0000-0000-000000000004' '2026-10-02T06:00:00Z' 't'
check '(2) DND 12:00 abre' "$svc_session" 'a1000000-0000-0000-0000-000000000004' '2026-10-02T12:00:00Z' 't'
check '(2) respect_dnd=false ignora o DND 23:30' "$svc_session" 'a1000000-0000-0000-0000-000000000005' '2026-10-02T23:30:00Z' 't'

# ---------------------------------------------------------------------------
# send_weekdays: so dias da lista abrem (NULL = todos).
# ---------------------------------------------------------------------------
check '(2b) send_weekdays: sexta abre' "$svc_session" 'a1000000-0000-0000-0000-000000000010' '2026-10-02T12:00:00Z' 't'
check '(2b) send_weekdays: sabado fecha' "$svc_session" 'a1000000-0000-0000-0000-000000000010' '2026-10-03T12:00:00Z' 'f'

# ---------------------------------------------------------------------------
# (3) business_hours com days (jsonb array): tz UTC, 08:00-18:00, seg-sex.
#     Este caso cobre o cast jsonb->integer[] original (42846) quando quebrado.
# ---------------------------------------------------------------------------
psql_test >/dev/null <<'SQL'
INSERT INTO public.talkx_settings (key, value)
VALUES ('business_hours', '{"start":"08:00","end":"18:00","days":[1,2,3,4,5],"tz":"UTC"}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
SQL
check '(3) bh days: sexta 12:00 abre' "$svc_session" 'a1000000-0000-0000-0000-000000000006' '2026-10-02T12:00:00Z' 't'
check '(3) bh days: sexta 08:00 abre (inicio inclusivo)' "$svc_session" 'a1000000-0000-0000-0000-000000000006' '2026-10-02T08:00:00Z' 't'
check '(3) bh days: sexta 07:59 fecha' "$svc_session" 'a1000000-0000-0000-0000-000000000006' '2026-10-02T07:59:00Z' 'f'
check '(3) bh days: sexta 18:00 fecha (fim exclusivo)' "$svc_session" 'a1000000-0000-0000-0000-000000000006' '2026-10-02T18:00:00Z' 'f'
check '(3) bh days: sabado 12:00 fecha (dia fora de [1..5])' "$svc_session" 'a1000000-0000-0000-0000-000000000006' '2026-10-03T12:00:00Z' 'f'

# ---------------------------------------------------------------------------
# (4) Fail-closed por ERRO: business_hours presente e fora do contrato ergue
#     22023 (invalid_business_hours) — nunca 22P02/42846 de cast direto.
# ---------------------------------------------------------------------------
bad_bh() {
  local label="$1" value="$2"
  psql_test >/dev/null <<SQL
INSERT INTO public.talkx_settings (key, value)
VALUES ('business_hours', '$value'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
SQL
  expect_error "$label" 'invalid_business_hours' '22023' \
    "$svc_session SELECT public.talkx_campaign_window_open('a1000000-0000-0000-0000-000000000006', '2026-10-02T12:00:00Z');"
}
bad_bh '(4) start fora do formato HH:MM -> 22023' '{"start":"8:00","end":"18:00","days":[1,2,3]}'
bad_bh '(4) days vazio -> 22023'                  '{"start":"08:00","end":"18:00","days":[]}'
bad_bh '(4) days com 7 (fora de 0..6) -> 22023'   '{"start":"08:00","end":"18:00","days":[1,7]}'
bad_bh '(4) days com texto -> 22023 (nunca 22P02)' '{"start":"08:00","end":"18:00","days":["a"]}'
bad_bh '(4) days ausente -> 22023'                '{"start":"08:00","end":"18:00"}'
bad_bh '(4) days com null -> 22023'               '{"start":"08:00","end":"18:00","days":[1,null]}'

# business_hours ausente = default 08:00-18:00, seg-sex, America/Sao_Paulo.
psql_test >/dev/null <<'SQL'
DELETE FROM public.talkx_settings WHERE key = 'business_hours';
SQL
check '(4) bh ausente usa default 08-18 seg-sex SP (sexta 12:00 SP abre)' "$svc_session" 'a1000000-0000-0000-0000-000000000006' '2026-10-02T15:00:00Z' 't'
check '(4) default SP 18:00 fecha (fim exclusivo)' "$svc_session" 'a1000000-0000-0000-0000-000000000006' '2026-10-02T21:00:00Z' 'f'
check '(4) default seg-sex: sabado 12:00 SP fecha' "$svc_session" 'a1000000-0000-0000-0000-000000000006' '2026-10-03T15:00:00Z' 'f'

# ---------------------------------------------------------------------------
# (6) Ramos TRUE: start=end (open 24h) e campanha sem restricao (status
#     irrelevante: draft e sending abrem igual).
# ---------------------------------------------------------------------------
check '(6) open 24h: 00:00 abre' "$svc_session" 'a1000000-0000-0000-0000-000000000008' '2026-10-02T00:00:00Z' 't'
check '(6) open 24h: 12:00 abre' "$svc_session" 'a1000000-0000-0000-0000-000000000008' '2026-10-02T12:00:00Z' 't'
check '(6) open 24h: 23:59 abre' "$svc_session" 'a1000000-0000-0000-0000-000000000008' '2026-10-02T23:59:00Z' 't'
check '(6) sem restricao (draft) abre' "$svc_session" 'a1000000-0000-0000-0000-000000000009' '2026-10-02T12:00:00Z' 't'
check '(6) sem restricao (scheduled, DND off) abre igual — status irrelevante' "$svc_session" 'a1000000-0000-0000-0000-000000000005' '2026-10-02T23:30:00Z' 't'

# ---------------------------------------------------------------------------
# (7) Campanha inexistente -> P0002.
# ---------------------------------------------------------------------------
expect_error '(7) campanha inexistente -> P0002' 'talkx_campaign_not_found' 'P0002' \
  "$svc_session SELECT public.talkx_campaign_window_open('b1000000-0000-0000-0000-0000000000ff', '2026-10-02T12:00:00Z');"

# ---------------------------------------------------------------------------
# (0b) Prova de mutacao: o MESMO arquivo sem a linha do DROP FUNCTION falha com
#      42P13 quando o contrato TABLE anterior esta na frente — e o defeito que a
#      revisao apontou (CREATE OR REPLACE nao troca o tipo de retorno).
# ---------------------------------------------------------------------------
psql_test >/dev/null <<'SQL'
DROP FUNCTION public.talkx_campaign_window_open(uuid, timestamptz);
CREATE FUNCTION public.talkx_campaign_window_open(
  p_campaign_id uuid,
  p_at timestamptz DEFAULT now()
)
RETURNS TABLE (allowed boolean, reason text, next_window timestamptz)
LANGUAGE plpgsql
AS $legacy$
BEGIN
  RETURN QUERY SELECT true, 'legacy'::text, p_at;
END;
$legacy$;
SQL
# O mutante e o MESMO arquivo real, com a linha do DROP removida aqui em runtime.
# Que a migration tem o DROP ja esta provado pelo bloco positivo (ela aplica sobre
# o contrato TABLE anterior) — nada aqui confere texto de arquivo.
no_drop_migration="$(mktemp "${TMPDIR:-/tmp}/talkx-window-open-sem-drop-XXXXXX.sql")"
grep -v '^DROP FUNCTION IF EXISTS public.talkx_campaign_window_open' "$migration" > "$no_drop_migration"
set +e
out_no_drop="$(psql_test -v VERBOSITY=verbose < "$no_drop_migration" 2>&1)"
status_no_drop=$?
set -e
rm -f "$no_drop_migration"
(( status_no_drop != 0 )) || { printf '%s\n' "$out_no_drop" >&2; fail '(0b) sem o DROP a migration deveria falhar com 42P13, mas passou'; }
[[ "$out_no_drop" == *'cannot change return type'* ]] || { printf '%s\n' "$out_no_drop" >&2; fail '(0b) esperava "cannot change return type" ao aplicar sem o DROP'; }
[[ "$out_no_drop" == *'42P13'* ]] || { printf '%s\n' "$out_no_drop" >&2; fail '(0b) esperava o SQLSTATE 42P13 ao aplicar sem o DROP'; }
pass '(0b) sem o DROP FUNCTION -> 42P13; com o DROP -> aplica'

# A migration (que tem o DROP) reaplica e o banco volta ao contrato BOOLEAN.
psql_test < "$migration" >/dev/null
check '(0b) reaplicada sobre o contrato TABLE anterior, a janela volta a decidir (09:00 SP abre)' "$svc_session" 'a1000000-0000-0000-0000-000000000001' '2026-10-02T12:00:00Z' 't'

printf 'PASS: N-118 isolada talkx_campaign_window_open (BOOLEAN) — troca de contrato (42P13 sem o DROP), fuso, DND, business_hours com days, 22023, grant service_role, ramos TRUE\n'
