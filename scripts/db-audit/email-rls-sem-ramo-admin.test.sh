#!/usr/bin/env bash
# N-147: prova, em PostgreSQL 17 descartavel, que as policies de SELECT/UPDATE de
# email_threads e email_messages perdem o ramo OR public.is_admin_or_supervisor e
# passam a exigir so conta propria (ga.user_id = auth.uid()).
#
# O QUE E REAL (ponto 1 da recusa): nada de DDL/policies copiados a mao.
#   * tipo app_role + tabela user_roles + funcao is_admin_or_supervisor: trechos
#     EXTRAIDOS das linhas 1-11 e 31-42 de 20251215025014 (com assert de fidelidade
#     abaixo: se o canonico mudar, o teste falha em vez de testar copia velha);
#   * funcao update_updated_at_column: linhas 188-194 de 20251215024517 (alvo dos
#     triggers da EMAIL01);
#   * tabelas gmail_accounts/email_threads/email_messages/email_labels com as
#     policies originais: arquivo 20260403105341 (EMAIL01) aplicado INTEIRO,
#     sem edicao;
#   * a migration do cartao: arquivo 20261011000018 aplicado (2x: idempotencia).
# Infra de harness (igual ao molde team-membership-bootstrap-owner.test.sh): roles
# anon/authenticated/service_role, stub auth.uid()/auth.role() lendo o JWT
# (request.jwt.claims.sub, como em producao), stubs auth.users e contacts (alvos de
# FK), GRANTs de tabela ao authenticated. Nao afirmam nada sobre o produto.
# Fases: RED (admin ve tudo antes) -> migration -> GREEN (admin so o proprio;
# dono segue vendo o proprio; anon nada; service_role tudo) -> ROLLBACK do
# cabecalho restaura o acesso admin (+ pg_policies com os 4 nomes E o ramo OR).
# Sem CI aqui (ponto 5): o bloco [SUMMARY] no fim e o que sai para o db-guard
# ajustar os SUMs em cartao proprio.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
email01="$repo_root/supabase/migrations/20260403105341_f342fbf7-d1d3-48b1-83b0-03df78b6c590.sql"
funcsrc="$repo_root/supabase/migrations/20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql"
trigsrc="$repo_root/supabase/migrations/20251215024517_1c312256-b6e4-4d34-8dc5-3b03301e369e.sql"
migration="${MIGRATION_OVERRIDE:-"$repo_root/supabase/migrations/20261011000018_email_rls_remover_ramo_admin.sql"}"
postgres_image="${EMAIL_RLS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-email-rls-$$"

admin_uid='40000000-0000-0000-0000-000000000001'
sup_uid='40000000-0000-0000-0000-000000000004'
user_a='40000000-0000-0000-0000-000000000002'
user_b='40000000-0000-0000-0000-000000000003'
acc_a='41000000-0000-0000-0000-00000000000a'
acc_b='41000000-0000-0000-0000-00000000000b'
acc_c='41000000-0000-0000-0000-00000000000c'

cleanup() {
  if [[ "$container_name" =~ ^zapp-email-rls-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM
fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_super() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}
psql_file() {
  docker exec -i "$container_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}
# ponto 2: roda como o papel real (authenticated + sub do JWT, nunca postgres)
as_auth() {
  local uid="$1" sql="$2"
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '{\"sub\":\"$uid\",\"role\":\"authenticated\"}', false); $sql" | tail -n 1
}
as_anon() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE anon; $1" | tail -n 1
}
as_service() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE service_role; $1" | tail -n 1
}
vistos() {
  as_auth "$1" "SELECT (SELECT count(*) FROM public.email_threads) || '|' || (SELECT count(*) FROM public.email_messages);"
}
atualizados() {
  as_auth "$1" "BEGIN; WITH t AS (UPDATE public.email_threads SET subject = 'n147' RETURNING 1), m AS (UPDATE public.email_messages SET subject = 'n147' RETURNING 1) SELECT (SELECT count(*) FROM t) || '|' || (SELECT count(*) FROM m); ROLLBACK;"
}

[[ -f "$email01" ]] || fail "EMAIL01 nao encontrada: $email01"
[[ -f "$funcsrc" ]] || fail "migration da funcao nao encontrada: $funcsrc"
[[ -f "$trigsrc" ]] || fail "migration do trigger nao encontrada: $trigsrc"
[[ -f "$migration" ]] || fail "migration do cartao nao encontrada: $migration"

# --- fidelidade: o que sera aplicado E o texto canonico (ponto 1) ---
grep -q "CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor" "$funcsrc" || fail 'canonico da funcao mudou de nome'
grep -q "role IN ('admin', 'supervisor')" "$funcsrc" || fail 'WHERE canonico da funcao mudou'
grep -q '"Users can view threads of own accounts"' "$email01" || fail 'EMAIL01 perdeu a policy de threads'
grep -q 'public.is_admin_or_supervisor(auth.uid())' "$email01" || fail 'EMAIL01 perdeu o ramo admin'

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null
ready=0
for _ in $(seq 1 90); do
  if docker exec "$container_name" psql -X -qAt -U postgres -d postgres -c 'SELECT 1' >/dev/null 2>&1; then
    ready=$((ready + 1)); (( ready >= 2 )) && break
  else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.sub', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
     )::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.role', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
     )::text $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
SQL

# trechos REAIS (assert de fidelidade em cada um: o teste falha se o canonico mudar)
sed -n '1,11p' "$funcsrc" > "$tmp_dir/real_roles.sql"
grep -q "CREATE TYPE public.app_role" "$tmp_dir/real_roles.sql" || fail 'extracao de app_role/user_roles divergiu do canonico'
grep -q "REFERENCES auth.users(id)" "$tmp_dir/real_roles.sql" || fail 'extracao de user_roles divergiu do canonico'
sed -n '31,42p' "$funcsrc" > "$tmp_dir/real_func.sql"
grep -q "CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor" "$tmp_dir/real_func.sql" || fail 'extracao da funcao divergiu do canonico'
grep -q "role IN ('admin', 'supervisor')" "$tmp_dir/real_func.sql" || fail 'WHERE extraido da funcao divergiu do canonico'
sed -n '188,194p' "$trigsrc" > "$tmp_dir/real_trigfn.sql"
grep -q "CREATE OR REPLACE FUNCTION public.update_updated_at_column" "$tmp_dir/real_trigfn.sql" || fail 'extracao do trigger divergiu do canonico'

psql_file "$tmp_dir/pre.sql" >/dev/null
psql_file "$tmp_dir/real_roles.sql" >/dev/null
psql_file "$tmp_dir/real_func.sql" >/dev/null
psql_file "$tmp_dir/real_trigfn.sql" >/dev/null
psql_file "$email01" >/dev/null

psql_super "GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;" >/dev/null
psql_super "GRANT SELECT, INSERT, UPDATE, DELETE ON public.gmail_accounts, public.email_threads, public.email_messages TO authenticated;" >/dev/null
psql_super "GRANT ALL ON public.gmail_accounts, public.email_threads, public.email_messages TO service_role;" >/dev/null

psql_super "INSERT INTO auth.users VALUES ('$admin_uid'), ('$sup_uid'), ('$user_a'), ('$user_b');" >/dev/null
psql_super "INSERT INTO public.user_roles (user_id, role) VALUES ('$admin_uid','admin'), ('$sup_uid','supervisor');" >/dev/null
psql_super "INSERT INTO public.gmail_accounts (id, user_id, email_address) VALUES ('$acc_a','$user_a','a@x'), ('$acc_b','$user_b','b@x'), ('$acc_c','$admin_uid','adm@x');" >/dev/null
psql_super "INSERT INTO public.email_threads (id, gmail_account_id, gmail_thread_id) VALUES ('42000000-0000-0000-0000-00000000000a','$acc_a','t-a'), ('42000000-0000-0000-0000-00000000000b','$acc_b','t-b'), ('42000000-0000-0000-0000-00000000000c','$acc_c','t-c');" >/dev/null
psql_super "INSERT INTO public.email_messages (id, thread_id, gmail_account_id, gmail_message_id) VALUES ('43000000-0000-0000-0000-00000000000a','42000000-0000-0000-0000-00000000000a','$acc_a','m-a'), ('43000000-0000-0000-0000-00000000000b','42000000-0000-0000-0000-00000000000b','$acc_b','m-b'), ('43000000-0000-0000-0000-00000000000c','42000000-0000-0000-0000-00000000000c','$acc_c','m-c');" >/dev/null

# --- RED-FIRST: com a EMAIL01 original o admin (ramo OR real) ve tudo ---
[[ "$(vistos "$admin_uid")" == '3|3' ]] || fail 'harness invalido: admin deveria ver tudo antes da migration'
[[ "$(vistos "$sup_uid")" == '3|3' ]] || fail 'harness invalido: supervisor deveria ver tudo antes da migration'
[[ "$(vistos "$user_a")" == '1|1' ]] || fail 'harness invalido: dono A deveria ver so o proprio'
printf '[OK] red-first: antes da migration admin e supervisor enxergam tudo (ramo OR real).\n'

psql_file "$migration" >/dev/null
psql_file "$migration" >/dev/null
printf '[OK] migration aplica 2x (idempotente).\n'

# --- GREEN: fluxos que continuam + acesso retirado (papeis reais, ponto 2) ---
[[ "$(vistos "$user_a")" == '1|1' ]] || fail 'dono A perdeu o proprio e-mail'
[[ "$(vistos "$user_b")" == '1|1' ]] || fail 'dono B perdeu o proprio e-mail'
[[ "$(atualizados "$user_a")" == '1|1' ]] || fail 'dono A perdeu o UPDATE do proprio'
[[ "$(vistos "$admin_uid")" == '1|1' ]] || fail 'admin com conta propria deveria ver so a dela'
[[ "$(atualizados "$admin_uid")" == '1|1' ]] || fail 'admin deveria atualizar so a conta propria'
[[ "$(vistos "$sup_uid")" == '0|0' ]] || fail 'supervisor sem conta ainda ve e-mail de outros'
[[ "$(atualizados "$sup_uid")" == '0|0' ]] || fail 'supervisor sem conta ainda atualiza e-mail de outros'
[[ "$(as_service "SELECT (SELECT count(*) FROM public.email_threads) || '|' || (SELECT count(*) FROM public.email_messages);")" == '3|3' ]] || fail 'service_role perdeu visao total (backend afetado)'
set +e
anon_sel="$(docker exec -i "$container_name" psql -X -qAt -U postgres -d postgres -c "SET ROLE anon; SELECT count(*) FROM public.email_threads;" 2>&1)"
anon_sel_st=$?
anon_upd="$(docker exec -i "$container_name" psql -X -qAt -U postgres -d postgres -c "SET ROLE anon; UPDATE public.email_threads SET subject='x';" 2>&1)"
anon_st=$?
set -e
(( anon_sel_st != 0 )) || fail 'anon conseguiu SELECT (deveria ser negado)'
[[ "$anon_sel" == *'permission denied'* ]] || fail 'erro do SELECT anon nao e permission denied'
(( anon_st != 0 )) || fail 'anon conseguiu UPDATE (deveria ser negado)'
[[ "$anon_upd" == *'permission denied'* ]] || fail 'erro do anon nao e permission denied'
printf '[OK] green: dono ve/atualiza o proprio; admin so o proprio; supervisor sem conta e anon nada; service_role tudo.\n'

# --- ROLLBACK do cabecalho: restaura acesso + nomes + ramo OR (ponto 4) ---
rollback_sql="$(grep '^--| ' "$migration" | sed 's/^--| //')"
[[ -n "$rollback_sql" ]] || fail 'migration sem bloco de rollback executavel (--|)'
printf '%s\n' "$rollback_sql" | docker exec -i "$container_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres >/dev/null \
  || fail 'rollback nao aplicou'
[[ "$(vistos "$admin_uid")" == '3|3' ]] || fail 'rollback nao restaurou SELECT do admin'
[[ "$(vistos "$sup_uid")" == '3|3' ]] || fail 'rollback nao restaurou SELECT do supervisor'
[[ "$(atualizados "$admin_uid")" == '3|3' ]] || fail 'rollback nao restaurou UPDATE do admin'
names="$(psql_super "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname IN ('Users can view threads of own accounts','Users can update threads of own accounts','Users can view messages of own accounts','Users can update messages of own accounts');")"
[[ "$names" == '4' ]] || fail "rollback nao restaurou os 4 nomes (pg_policies=$names)"
branch="$(psql_super "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('email_threads','email_messages') AND position('is_admin_or_supervisor' in qual) > 0;")"
[[ "$branch" == '4' ]] || fail "rollback nao restaurou o ramo OR nas 4 policies (com_ramo=$branch)"
printf '[OK] rollback restaura acesso admin + 4 nomes + ramo OR (pg_policies).\n'

# volta ao estado migrado e confere o estado final que fica
psql_file "$migration" >/dev/null
branch_now="$(psql_super "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('email_threads','email_messages') AND position('is_admin_or_supervisor' in qual) > 0;")"
[[ "$branch_now" == '0' ]] || fail "ramo admin sobreviveu a migration (com_ramo=$branch_now)"
[[ "$(vistos "$admin_uid")" == '1|1' ]] || fail 'estado final: admin deveria ver so o proprio'
printf '[SUMMARY] policies_total=4 with_admin_branch=0 owner_sees_own=1 admin_sees_only_own=1 anon_sees_none=1 service_sees_all=1 rollback_restores_admin=1\n'
printf 'email-rls-sem-ramo-admin: OK\n'
