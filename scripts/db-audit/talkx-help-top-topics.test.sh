#!/usr/bin/env bash
set -Eeuo pipefail

# N-135: talkx_help_views + talkx_help_top_topics.
# RED: antes da migration, tabela/RPC nao existem. GREEN: existem, agregam sem user_id,
# RLS isola, reaplicar e no-op. Rollback extraido da migration remove tudo.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${TALKX_HELP_TOP_TOPICS_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-talkx-help-top-$RANDOM-$$"
up="$repo_root/supabase/migrations/20261010071304_talkx_help_views_top_topics.sql"

# Extrai o rollback inline da migration (linha 2: "-- Rollback: <sql>").
rollback_sql="$(sed -n '2s/^-- Rollback: //p' "$up")"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao acessivel'
[[ -f "$up" ]] || fail 'migration ausente'
[[ -n "$rollback_sql" ]] || fail 'rollback inline nao encontrado na migration'
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=x "$postgres_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$container_name" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true; break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL descartavel nao ficou pronto'

# Espelha as roles/funcao do Supabase que a migration usa (auth.uid(), authenticated...).
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE anon NOLOGIN;
GRANT USAGE ON SCHEMA public TO authenticated, anon;
SQL

# RED
red_table="$(psql_test -Atqc "SELECT coalesce(to_regclass('public.talkx_help_views')::text, '')")"
[[ "$red_table" == '' ]] || fail 'RED: tabela ja existe'
red_rpc="$(psql_test -Atqc "SELECT coalesce(to_regproc('public.talkx_help_top_topics')::text, '')")"
[[ "$red_rpc" == '' ]] || fail 'RED: RPC ja existe'

# GREEN (e idempotencia: aplicar duas vezes)
psql_test < "$up" >/dev/null || fail 'migration nao aplicou'
psql_test < "$up" >/dev/null || fail 'migration nao e reaplicavel'
cols="$(psql_test -Atqc "SELECT string_agg(column_name, ',' ORDER BY column_name) FROM information_schema.columns WHERE table_name='talkx_help_views' AND column_name IN ('article_id','user_id','viewed_at')")"
[[ "$cols" == 'article_id,user_id,viewed_at' ]] || fail "colunas: [$cols]"
rls="$(psql_test -Atqc "SELECT relrowsecurity FROM pg_class WHERE relname='talkx_help_views'")"
[[ "$rls" == 't' ]] || fail "RLS desligado: [$rls]"

as_user() { # $1 uuid, $2 sql -> stdout+stderr, sempre exit 0
  psql_test -Atqc "BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='$1'; $2; ROLLBACK;" 2>&1 || true
}
A=aaaaaaaa-0000-0000-0000-000000000001
B=aaaaaaaa-0000-0000-0000-000000000002

psql_test -c "INSERT INTO public.talkx_help_views(article_id,user_id,viewed_at) VALUES
 ('campanhas/criar','$A',now()),('campanhas/criar','$B',now()),('campanhas/criar','$B',now()),
 ('lgpd/optout','$A',now()),('antigo/x','$A',now()-interval '90 days')" >/dev/null

first_line() { sed -n '1p'; }

raw="$(as_user "$A" "SELECT string_agg(article_id||':'||views||':'||unique_viewers, ',' ORDER BY views DESC) FROM public.talkx_help_top_topics(30)")"
top="$(printf '%s\n' "$raw" | first_line)"
[[ "$top" == 'campanhas/criar:3:2,lgpd/optout:1:1' ]] || fail "ranking inesperado: [$raw]"
args="$(psql_test -Atqc "SELECT array_to_string(proargnames,',') FROM pg_proc WHERE proname='talkx_help_top_topics'")"
[[ "$args" == 'p_days,article_id,views,unique_viewers' ]] || fail "RPC expoe coluna de usuario: [$args]"

# RLS: so insere como si mesmo, so le o proprio
out_other="$(as_user "$A" "INSERT INTO public.talkx_help_views(article_id,user_id) VALUES ('x','$B')")"
printf '%s\n' "$out_other" | grep -q 'row-level security' || fail "insert em nome de outro permitido: [$out_other]"
own_raw="$(as_user "$A" "INSERT INTO public.talkx_help_views(article_id) VALUES ('y') RETURNING 1")"
[[ "$(printf '%s\n' "$own_raw" | first_line)" == '1' ]] || fail "insert proprio negado: [$own_raw]"
sel_raw="$(as_user "$A" "SELECT count(*) FROM public.talkx_help_views")"
[[ "$(printf '%s\n' "$sel_raw" | first_line)" == '3' ]] || fail "SELECT vazou linhas de outros: [$sel_raw]"
out_anon="$(psql_test -Atqc "BEGIN; SET LOCAL ROLE anon; SELECT count(*) FROM public.talkx_help_top_topics(30); ROLLBACK;" 2>&1 || true)"
printf '%s\n' "$out_anon" | grep -q 'permission denied' || fail "anon executa a RPC: [$out_anon]"

# Rollback: executa o SQL inline extraido da migration
psql_test -c "$rollback_sql" >/dev/null || fail 'rollback nao executou'
psql_test -c "$rollback_sql" >/dev/null || fail 'rollback nao e reexecutavel'
left="$(psql_test -Atqc "SELECT to_regclass('public.talkx_help_views') IS NULL AND to_regproc('public.talkx_help_top_topics') IS NULL")"
[[ "$left" == 't' ]] || fail "rollback deixou objetos: [$left]"

printf '[OK] N-135: talkx_help_views + talkx_help_top_topics (RED/GREEN/RLS/anon/rollback).\n'
