#!/usr/bin/env bash
# N-147 (P3) — remover o ramo `OR is_admin_or_supervisor` das policies de email_threads/email_messages.
#
# O ramo e inerte (gmail_accounts so mostra a conta ao dono), entao o ACESSO nao muda: so o dono
# ve/atualiza. O que a migration muda e o TEXTO das policies. Por isso o vermelho do estado anterior
# e estrutural (BLOCO B.1), e o comportamento (dono ve; admin/supervisor de outra conta NAO ve) tem
# de ficar verde antes e depois.
#
# Aplica as MIGRATIONS REAIS num Postgres 17 descartavel e roda com o PAPEL REAL
# (`SET ROLE authenticated` + `request.jwt.claims`):
#   * 20251215025014 — app_role, user_roles e is_admin_or_supervisor (trechos reais, via sed);
#   * 20260403105341 — gmail_accounts, email_threads, email_messages e as policies originais;
#   * 20260404173941 — SELECT de gmail_accounts so do dono (trecho real, via sed);
#   * 20260829030000 — remove as policies de INSERT de email;
#   * 20261010120000 — a migration do cartao (opcional: sem ela o BLOCO B falha — e o "vermelho").
#
#   BLOCO A — estado anterior: dono ve; admin e supervisor de outra conta NAO veem; o ramo existe no texto.
#   BLOCO B — migration aplicada: ramo ausente do texto; o comportamento do BLOCO A segue identico.
#   BLOCO C — o Rollback do proprio arquivo devolve o texto antigo, com o mesmo comportamento.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mig_dir="$repo_root/supabase/migrations"
migration="$mig_dir/20261010120000_email_rls_remover_ramo_admin.sql"
mig_roles="$mig_dir/20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql"
mig_email="$mig_dir/20260403105341_f342fbf7-d1d3-48b1-83b0-03df78b6c590.sql"
mig_gmail="$mig_dir/20260404173941_26ed03e4-e874-44a0-b864-5db85b0ec44c.sql"
mig_drop_ins="$mig_dir/20260829030000_drop_insert_policies_email.sql"
postgres_image="${EMAIL_RLS_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-email-rls-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-email-rls-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}
psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}
as_user() {
  local jwt="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"
}
expect_value() {
  local l="$1" e="$2" s="$3" a
  a="$(psql_sql "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_value_as() {
  local l="$1" e="$2" j="$3" s="$4" a
  a="$(as_user "$j" "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
for f in "$mig_roles" "$mig_email" "$mig_gmail" "$mig_drop_ins"; do
  [[ -f "$f" ]] || fail "migration nao encontrada: $f"
done

printf '== container: %s (imagem %s) ==\n' "$container_name" "$postgres_image"
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# ---------------------------------------------------------------- ambiente (pre-migrations)
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.sub', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
     )::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- dependencias de 20260403105341 que vivem em outras migrations
CREATE TABLE public.contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
  LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
SQL
psql_file "$tmp_dir/pre.sql" >/dev/null

# ---------------------------------------------------------------- migrations reais
# 20251215025014: so o que o contrato precisa (enum + user_roles + is_admin_or_supervisor); o resto
# do arquivo depende de storage/calls/whatsapp_connections, que nao interessam aqui.
sed -n '/^CREATE TYPE public.app_role/p' "$mig_roles" > "$tmp_dir/roles.sql"
sed -n '/^CREATE TABLE public.user_roles/,/^);/p' "$mig_roles" >> "$tmp_dir/roles.sql"
sed -n '/^CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor/,/^\$\$;\?$/p' "$mig_roles" >> "$tmp_dir/roles.sql"
grep -q 'is_admin_or_supervisor' "$tmp_dir/roles.sql" || fail 'nao extrai is_admin_or_supervisor da migration real'
psql_file "$tmp_dir/roles.sql" >/dev/null

psql_file "$mig_email" >/dev/null
# 20260404173941: trecho 1 (SELECT de gmail_accounts so do dono); os trechos 2 e 3 sao de outras tabelas.
sed -n '1,/^USING (user_id = auth.uid());$/p' "$mig_gmail" > "$tmp_dir/gmail_select.sql"
psql_file "$tmp_dir/gmail_select.sql" >/dev/null
psql_file "$mig_drop_ins" >/dev/null

cat > "$tmp_dir/grants.sql" <<'SQL'
GRANT SELECT, UPDATE ON public.gmail_accounts, public.email_threads, public.email_messages TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
SQL
psql_file "$tmp_dir/grants.sql" >/dev/null

# ---------------------------------------------------------------- dados
OWNER_ID='11111111-1111-1111-1111-111111111111'
ADMIN_ID='22222222-2222-2222-2222-222222222222'
SUPERV_ID='33333333-3333-3333-3333-333333333333'
OWNER="{\"sub\":\"$OWNER_ID\",\"role\":\"authenticated\"}"
ADMIN="{\"sub\":\"$ADMIN_ID\",\"role\":\"authenticated\"}"
SUPERV="{\"sub\":\"$SUPERV_ID\",\"role\":\"authenticated\"}"

cat > "$tmp_dir/seed.sql" <<SQL
INSERT INTO auth.users (id) VALUES ('$OWNER_ID'), ('$ADMIN_ID'), ('$SUPERV_ID');
INSERT INTO public.user_roles (user_id, role) VALUES ('$ADMIN_ID', 'admin'), ('$SUPERV_ID', 'supervisor');
INSERT INTO public.gmail_accounts (id, user_id, email_address)
  VALUES ('a0000000-0000-0000-0000-000000000001', '$OWNER_ID', 'dono@exemplo.test');
INSERT INTO public.email_threads (id, gmail_account_id, gmail_thread_id)
  VALUES ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'thr-1');
INSERT INTO public.email_messages (thread_id, gmail_message_id, gmail_account_id)
  VALUES ('b0000000-0000-0000-0000-000000000001', 'msg-1', 'a0000000-0000-0000-0000-000000000001');
SQL
psql_file "$tmp_dir/seed.sql" >/dev/null

# Contrato de acesso — identico antes e depois da migration (o que NAO pode mudar).
check_access() {
  local tag="$1"
  expect_value_as "$tag dono ve a thread" '1' "$OWNER" 'SELECT count(*) FROM public.email_threads;'
  expect_value_as "$tag dono ve a mensagem" '1' "$OWNER" 'SELECT count(*) FROM public.email_messages;'
  expect_value_as "$tag admin de outra conta NAO ve a thread" '0' "$ADMIN" 'SELECT count(*) FROM public.email_threads;'
  expect_value_as "$tag admin de outra conta NAO ve a mensagem" '0' "$ADMIN" 'SELECT count(*) FROM public.email_messages;'
  expect_value_as "$tag supervisor de outra conta NAO ve a thread" '0' "$SUPERV" 'SELECT count(*) FROM public.email_threads;'
  expect_value_as "$tag admin de outra conta NAO atualiza a thread" '0' "$ADMIN" \
    "WITH u AS (UPDATE public.email_threads SET is_starred = true RETURNING 1) SELECT count(*) FROM u;"
  expect_value_as "$tag admin de outra conta NAO atualiza a mensagem" '0' "$ADMIN" \
    "WITH u AS (UPDATE public.email_messages SET is_read = true RETURNING 1) SELECT count(*) FROM u;"
  expect_value_as "$tag dono atualiza a thread" '1' "$OWNER" \
    "WITH u AS (UPDATE public.email_threads SET is_starred = true RETURNING 1) SELECT count(*) FROM u;"
  expect_value_as "$tag dono atualiza a mensagem" '1' "$OWNER" \
    "WITH u AS (UPDATE public.email_messages SET is_read = true RETURNING 1) SELECT count(*) FROM u;"
}

# Quantas das 4 policies (SELECT/UPDATE x threads/messages) ainda citam is_admin_or_supervisor.
POLICIES_COM_RAMO="SELECT count(*) FROM pg_policies WHERE schemaname='public'
  AND tablename IN ('email_threads','email_messages') AND cmd IN ('SELECT','UPDATE')
  AND qual LIKE '%is_admin_or_supervisor%';"
POLICIES_TOTAL="SELECT count(*) FROM pg_policies WHERE schemaname='public'
  AND tablename IN ('email_threads','email_messages') AND cmd IN ('SELECT','UPDATE');"

printf '\n============ BLOCO A — estado ANTERIOR (migrations reais) ============\n'
expect_value 'A.1 existem 4 policies SELECT/UPDATE nas tabelas de email' '4' "$POLICIES_TOTAL"
expect_value 'A.2 as 4 ainda citam is_admin_or_supervisor (ramo presente)' '4' "$POLICIES_COM_RAMO"
check_access 'A.3'

printf '\n============ BLOCO B — migration do cartao aplicada ============\n'
if [[ -f "$migration" ]]; then
  psql_file "$migration" >/dev/null
else
  printf '[INFO] migration do cartao ausente: BLOCO B roda contra o estado anterior (vermelho esperado)\n'
fi
expect_value 'B.1 nenhuma policy SELECT/UPDATE de email cita is_admin_or_supervisor' '0' "$POLICIES_COM_RAMO"
expect_value 'B.2 as 4 policies continuam existindo' '4' "$POLICIES_TOTAL"
expect_value 'B.3 todas as 4 exigem o dono da conta (ga.user_id = auth.uid())' '4' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public'
     AND tablename IN ('email_threads','email_messages') AND cmd IN ('SELECT','UPDATE')
     AND qual LIKE '%ga.user_id = auth.uid()%';"
expect_value 'B.4 is_admin_or_supervisor segue existindo (outras policies a usam)' '1' \
  "SELECT count(*) FROM pg_proc WHERE proname='is_admin_or_supervisor' AND pronamespace='public'::regnamespace;"
check_access 'B.5'

printf '\n============ BLOCO C — o Rollback do arquivo devolve o texto anterior ============\n'
[[ -f "$migration" ]] || fail 'C.0 migration do cartao ausente'
sed -n 's/^--   //p' "$migration" > "$tmp_dir/rollback.sql"
[[ -s "$tmp_dir/rollback.sql" ]] || fail 'C.0 nao consegui extrair o bloco -- Rollback (SQL executavel):'
psql_file "$tmp_dir/rollback.sql" >/dev/null
expect_value 'C.1 rollback rodou: as 4 policies citam is_admin_or_supervisor de novo' '4' "$POLICIES_COM_RAMO"
check_access 'C.2'

printf '\n== TODOS OS BLOCOS PASSARAM (A: antes · B: corrigido · C: rollback) ==\n'
