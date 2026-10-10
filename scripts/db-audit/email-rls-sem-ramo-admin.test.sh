#!/usr/bin/env bash
# N-147: prova, em PostgreSQL 17 descartavel, que as policies de SELECT/UPDATE de
# email_threads e email_messages deixam de ter o ramo is_admin_or_supervisor.
#  - usuario comum ve so o proprio e-mail
#  - admin NAO ve o de outros apos a migration
#  - o Rollback do cabecalho da migration restaura o acesso admin
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration_file="$repo_root/supabase/migrations/20261010120000_email_rls_remover_ramo_admin.sql"
postgres_image="${EMAIL_RLS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-email-rls-$RANDOM-$$"
admin_uid='40000000-0000-0000-0000-000000000001'
user_a='40000000-0000-0000-0000-000000000002'
user_b='40000000-0000-0000-0000-000000000003'

cleanup() {
  if [[ "$container_name" =~ ^zapp-email-rls-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

[[ -f "$migration_file" ]] || fail 'migration N-147 nao existe'
sed -n '2p' "$migration_file" | grep -q '^-- Rollback:' || fail 'linha 2 da migration nao e "-- Rollback:"'

ready=false
for attempt in 1 2 3; do
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  docker run -d --name "$container_name" -e POSTGRES_PASSWORD=email_rls_test_only "$postgres_image" >/dev/null || continue
  for _ in $(seq 1 30); do
    if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then ready=true; break; fi
    sleep 1
  done
  [[ "$ready" == true ]] && break
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

# estado pre-migration: tabelas minimas + policies originais (20260403105341)
psql_test >/dev/null <<SQL
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS \$\$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
\$\$;
CREATE ROLE authenticated NOLOGIN;
CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text NOT NULL);
CREATE FUNCTION public.is_admin_or_supervisor(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS \$\$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user AND role IN ('admin','supervisor'))
\$\$;
CREATE TABLE public.gmail_accounts (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.email_threads (id uuid PRIMARY KEY, gmail_account_id uuid NOT NULL, subject text NOT NULL DEFAULT '');
CREATE TABLE public.email_messages (id uuid PRIMARY KEY, gmail_account_id uuid NOT NULL, subject text NOT NULL DEFAULT '');
GRANT SELECT, UPDATE ON public.email_threads, public.email_messages TO authenticated;
GRANT SELECT ON public.gmail_accounts, public.profiles TO authenticated;
ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view threads of own accounts" ON public.email_threads FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND (ga.user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()))));
CREATE POLICY "Users can update threads of own accounts" ON public.email_threads FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND (ga.user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()))));
CREATE POLICY "Users can view messages of own accounts" ON public.email_messages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND (ga.user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()))));
CREATE POLICY "Users can update messages of own accounts" ON public.email_messages FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.gmail_accounts ga WHERE ga.id = gmail_account_id AND (ga.user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()))));
INSERT INTO public.profiles VALUES ('$admin_uid','admin'), ('$user_a','agent'), ('$user_b','agent');
INSERT INTO public.gmail_accounts VALUES ('41000000-0000-0000-0000-00000000000a','$user_a'), ('41000000-0000-0000-0000-00000000000b','$user_b');
INSERT INTO public.email_threads(id,gmail_account_id) VALUES ('42000000-0000-0000-0000-00000000000a','41000000-0000-0000-0000-00000000000a'), ('42000000-0000-0000-0000-00000000000b','41000000-0000-0000-0000-00000000000b');
INSERT INTO public.email_messages(id,gmail_account_id) VALUES ('43000000-0000-0000-0000-00000000000a','41000000-0000-0000-0000-00000000000a'), ('43000000-0000-0000-0000-00000000000b','41000000-0000-0000-0000-00000000000b');
SQL

# "threads|mensagens" visiveis para $1
vistos() {
  psql_test -Atq <<SQL | grep -E '^[0-9]+\|[0-9]+$' | tail -1
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '$1';
SELECT (SELECT count(*) FROM public.email_threads) || '|' || (SELECT count(*) FROM public.email_messages);
COMMIT;
SQL
}
# "threads|mensagens" atualizaveis por $1 (desfaz no fim)
atualizados() {
  psql_test -Atq <<SQL | grep -E '^[0-9]+\|[0-9]+$' | tail -1
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '$1';
WITH t AS (UPDATE public.email_threads SET subject = 'x' RETURNING 1), m AS (UPDATE public.email_messages SET subject = 'x' RETURNING 1)
SELECT (SELECT count(*) FROM t) || '|' || (SELECT count(*) FROM m);
ROLLBACK;
SQL
}

# --- red-first: com as policies originais o admin ve tudo ---
[[ "$(vistos "$admin_uid")" == '2|2' ]] || fail 'harness invalido: admin deveria ver tudo antes da migration'
printf '[OK] red-first: antes da migration o admin enxerga threads/mensagens de todos.\n'

psql_test < "$migration_file" >/dev/null || fail 'migration nao aplicou'
psql_test < "$migration_file" >/dev/null || fail 'migration nao e idempotente'

# --- usuario comum: so o proprio ---
[[ "$(vistos "$user_a")" == '1|1' ]] || fail 'usuario A nao ve exatamente o proprio e-mail'
[[ "$(vistos "$user_b")" == '1|1' ]] || fail 'usuario B nao ve exatamente o proprio e-mail'
[[ "$(atualizados "$user_a")" == '1|1' ]] || fail 'usuario A nao atualiza exatamente o proprio e-mail'

# --- admin sem conta propria: nao ve nem atualiza o de outros ---
[[ "$(vistos "$admin_uid")" == '0|0' ]] || fail 'admin ainda ve e-mail de outros apos a migration'
[[ "$(atualizados "$admin_uid")" == '0|0' ]] || fail 'admin ainda atualiza e-mail de outros apos a migration'
printf '[OK] apos a migration: usuario ve so o proprio; admin nao ve nem atualiza o de outros.\n'

# --- rollback do cabecalho restaura o acesso admin ---
rollback_sql="$(grep '^--| ' "$migration_file" | sed 's/^--| //')"
[[ -n "$rollback_sql" ]] || fail 'migration sem bloco de rollback executavel (--|)'
printf '%s\n' "$rollback_sql" | psql_test >/dev/null || fail 'rollback nao aplicou'
[[ "$(vistos "$admin_uid")" == '2|2' ]] || fail 'rollback nao restaurou o acesso admin'
[[ "$(atualizados "$admin_uid")" == '2|2' ]] || fail 'rollback nao restaurou o UPDATE admin'
printf '[OK] rollback restaura as policies originais (acesso admin de volta).\n'
