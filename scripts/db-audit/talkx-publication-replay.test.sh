#!/usr/bin/env bash
set -Eeuo pipefail

# V06 (plano Talk X V3, P2-6/P1-6): fecha o replay das 2 migrations de ALTER
# PUBLICATION. As migrations 20260927500001 e 20260927570000 (sessões paralelas,
# mesmo E27) adicionam as mesmas 3 tabelas à publicação supabase_realtime. Em
# produção as duas estão no ledger; num replay do zero a 2ª falha com SQLSTATE
# 42710 (duplicate_object). A 20260927570000 foi editada para envolver cada
# ALTER PUBLICATION ADD TABLE num DO idempotente (WHEN duplicate_object),
# preservando o efeito final.
#
# Prova, em PostgreSQL 17 descartável:
#   RED   — o DDL original (sem guard) da 2ª migration falha em 42710;
#   GREEN — a migration editada aplica e reaplica sem erro (idempotente),
#           e as 3 tabelas ficam na publicação.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${TALKX_PUBLICATION_REPLAY_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-talkx-pub-replay-$RANDOM-$$"
test_password="***"

cleanup() {
  if [[ "$container_name" =~ ^zapp-talkx-pub-replay-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null

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

# ---- fixtures mínimos: publicação + as 3 tabelas do E27 ----
psql_test >/dev/null <<'SQL'
CREATE PUBLICATION supabase_realtime;
CREATE TABLE public.talkx_campaign_events (id uuid PRIMARY KEY);
CREATE TABLE public.talkx_segments (id uuid PRIMARY KEY);
CREATE TABLE public.talkx_templates (id uuid PRIMARY KEY);
SQL

m1="$repo_root/supabase/migrations/20260927500001_talkx_e27_realtime_campaign_events.sql"
m2="$repo_root/supabase/migrations/20260927570000_talkx_e27_realtime_campaign_events.sql"
[[ -f "$m1" ]] || fail 'migration 20260927500001 nao existe'
[[ -f "$m2" ]] || fail 'migration 20260927570000 nao existe'

# ---- 1ª migration (20260927500001) adiciona as 3 tabelas ----
psql_test < "$m1" >/dev/null || fail '1ª migration (20260927500001) falhou'

# ---- RED: o DDL original (sem guard) falha em 42710 ----
red="$(psql_test -c 'ALTER PUBLICATION supabase_realtime ADD TABLE public.talkx_campaign_events;' 2>&1 || true)"
echo "$red" | grep -qiE 'already member|duplicate' \
  || fail "RED: ALTER PUBLICATION duplicado nao falhou (esperava 42710): $red"

# ---- GREEN: a migration editada (idempotente) aplica e reaplica ----
psql_test < "$m2" >/dev/null || fail 'GREEN: 2ª migration (idempotente) nao aplicou'
psql_test < "$m2" >/dev/null || fail 'GREEN: 2ª migration nao e replayavel (segunda aplicacao falhou)'

count="$(psql_test -Atqc "SELECT count(*) FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename IN ('talkx_campaign_events','talkx_segments','talkx_templates')")"
[[ "$count" == '3' ]] || fail "GREEN: as 3 tabelas nao estao na publicacao (got $count)"

printf '[OK] Talk X V06: replay do ALTER PUBLICATION fechado — 2ª migration idempotente.\n'
