#!/usr/bin/env bash
# Contrato das 14 policies TO public -> TO authenticated (higiene de papel; sem
# efeito funcional porque todas ja exigem auth.uid()/is_admin_or_supervisor).
#
# BLOCO A (antes): 14 policies com roles={public}.
# BLOCO B (depois): 0 {public}, 14 {authenticated}; e o comportamento de leitura
#   nao muda (anon segue lendo 0; authenticated segue lendo o proprio).
#
# BLOCO C (cartao t_45a3a4b4, endurecimento de public.passkey_credentials): mesma
#   familia de higiene de policy em tabela de dono escopada a authenticated. Prova,
#   com role real: (CA) antes da migration o authenticated INSERE credencial forjada e
#   altera public_key direto na tabela; (CB) depois, o INSERT e negado pela RLS, o
#   UPDATE de friendly_name continua passando, o de public_key/counter/credential_id/
#   user_id e negado pelo gatilho, o DELETE proprio segue valendo, a Edge
#   (service_role) segue livre e nenhum GRANT mudou.
# BLOCO D: executa as linhas "-- Rollback (SQL executavel, na ordem)" da propria
#   migration e prova que o estado anterior volta (INSERT passa, gatilho some).

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20260930142000_scope_public_policies_to_authenticated.sql"
passkey_migration="$repo_root/supabase/migrations/20261016114725_passkey_credentials_policies_endurecer.sql"
postgres_image="${PUBLIC_POLICY_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-public-policy-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-public-policy-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }

expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1)); (( ready_checks >= 2 )) && break
  else ready_checks=0; fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
       nullif(current_setting('request.jwt.claim.sub', true), '')
     ), '')::uuid $$;
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT false $$;

CREATE TABLE public.favorite_contacts (id uuid PRIMARY KEY, user_id uuid NOT NULL, contact_id uuid NOT NULL);
CREATE TABLE public.pinned_conversations (id uuid PRIMARY KEY, user_id uuid NOT NULL, conversation_id uuid NOT NULL);
CREATE TABLE public.conversation_snoozes (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.login_attempts (id uuid PRIMARY KEY, user_id uuid, email text);
CREATE TABLE public.talkx_templates (id uuid PRIMARY KEY, name text, created_by uuid);

ALTER TABLE public.favorite_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pinned_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_snoozes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talkx_templates ENABLE ROW LEVEL SECURITY;

-- As 14 policies TO public (nomes exatos de producao).
CREATE POLICY "Users can create own snoozes" ON public.conversation_snoozes FOR INSERT TO public WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can create own favorites" ON public.favorite_contacts FOR INSERT TO public WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own favorites" ON public.favorite_contacts FOR DELETE TO public USING (user_id = auth.uid());
CREATE POLICY "Users can update own favorites" ON public.favorite_contacts FOR UPDATE TO public USING (user_id = auth.uid());
CREATE POLICY "Users can view own favorites" ON public.favorite_contacts FOR SELECT TO public USING (user_id = auth.uid());

CREATE POLICY "Admins and supervisors can view login attempts" ON public.login_attempts FOR SELECT TO public USING (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Users can create own pins" ON public.pinned_conversations FOR INSERT TO public WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own pins" ON public.pinned_conversations FOR DELETE TO public USING (user_id = auth.uid());
CREATE POLICY "Users can update own pins" ON public.pinned_conversations FOR UPDATE TO public USING (user_id = auth.uid());
CREATE POLICY "Users can view own pins" ON public.pinned_conversations FOR SELECT TO public USING (user_id = auth.uid());

CREATE POLICY "talkx_templates_delete" ON public.talkx_templates FOR DELETE TO public USING (created_by = auth.uid());
CREATE POLICY "talkx_templates_insert" ON public.talkx_templates FOR INSERT TO public WITH CHECK (created_by = auth.uid());
CREATE POLICY "talkx_templates_select" ON public.talkx_templates FOR SELECT TO public USING (created_by = auth.uid());
CREATE POLICY "talkx_templates_update" ON public.talkx_templates FOR UPDATE TO public USING (created_by = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorite_contacts TO authenticated, anon;
SQL

psql_file "$tmp_dir/pre.sql"

ALICE="{\"sub\":\"11111111-1111-1111-1111-111111111111\",\"role\":\"authenticated\"}"
UID_ALICE='11111111-1111-1111-1111-111111111111'

echo '── BLOCO A: ANTES ─────────────────────────────────────────────────────────────────'
expect_value 'A1 14 policies com papel {public}' '14' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND roles::text='{public}'"
expect_value 'A2 anon lê 0 favoritos (RLS bloqueia)' '0' \
  "SET ROLE anon; SELECT count(*) FROM public.favorite_contacts"

echo
echo '── Aplicando a migration ───────────────────────────────────────────────────────────'
psql_file "$migration"

echo
echo '── BLOCO B: DEPOIS ─────────────────────────────────────────────────────────────────'
expect_value 'B1 0 policies com papel {public}' '0' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND roles::text='{public}'"
expect_value 'B2 14 policies com papel {authenticated}' '14' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND roles::text='{authenticated}'"
expect_value 'B3 anon segue lendo 0 favoritos (sem efeito funcional)' '0' \
  "SET ROLE anon; SELECT count(*) FROM public.favorite_contacts"

expect_ok() { local l="$1" s="$2"; psql_sql "$s" >/dev/null || fail "$l: deveria ter sucesso"; printf '[PASS] %s\n' "$l"; }

expect_error() {
  local label="$1" needle="$2" sql="$3" output status
  set +e
  output="$(psql_sql "$sql" 2>&1)"
  status=$?
  set -e
  if (( status == 0 )); then printf '%s\n' "$output" >&2; fail "$label: deveria ter falhado, mas passou"; fi
  if [[ -n "$needle" && "$output" != *"$needle"* ]]; then printf '%s\n' "$output" >&2; fail "$label: esperava '$needle' na mensagem de erro"; fi
  printf '[PASS] %s\n' "$label"
}
expect_ok 'B4 authenticated insere o próprio favorito (política preservada)' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); INSERT INTO public.favorite_contacts (id,user_id,contact_id) VALUES ('d0000000-0000-0000-0000-000000000001','$UID_ALICE','e0000000-0000-0000-0000-000000000001')"
expect_value 'B5 authenticated lê o próprio favorito' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); SELECT count(*) FROM public.favorite_contacts WHERE user_id='$UID_ALICE'"

# ── BLOCO C: public.passkey_credentials (cartao t_45a3a4b4) ────────────────────────
[[ -f "$passkey_migration" ]] || fail "migration nao encontrada: $passkey_migration"

cat > "$tmp_dir/passkey-pre.sql" <<'SQL'
CREATE ROLE service_role NOLOGIN BYPASSRLS;

-- public.passkey_credentials como 20251231124607 criou (id/uuid, sem a FK para auth.users).
CREATE TABLE public.passkey_credentials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    credential_id text NOT NULL UNIQUE,
    public_key text NOT NULL,
    counter bigint NOT NULL DEFAULT 0,
    device_type text,
    backed_up boolean DEFAULT false,
    transports text[],
    friendly_name text,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz
);
ALTER TABLE public.passkey_credentials ENABLE ROW LEVEL SECURITY;

-- As 4 policies TO authenticated como 20260317222728 deixou (antes desta migration).
CREATE POLICY "Users can view own passkeys" ON public.passkey_credentials FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own passkeys" ON public.passkey_credentials FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own passkeys" ON public.passkey_credentials FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can delete own passkeys" ON public.passkey_credentials FOR DELETE TO authenticated USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.passkey_credentials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.passkey_credentials TO service_role;

INSERT INTO public.passkey_credentials (id, user_id, credential_id, public_key, counter, friendly_name)
VALUES ('f0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'cred-alice-1', 'pubkey-alice-1', 0, 'Chave da Alice'),
       ('f0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'cred-alice-2', 'pubkey-alice-2', 7, 'Notebook');
SQL

psql_file "$tmp_dir/passkey-pre.sql"

passkey_grants_before="$(psql_sql "SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='passkey_credentials'")"

echo
echo '── BLOCO C-A: ANTES da migration (prova do defeito) ────────────────────────────────'
UID_ALICE='11111111-1111-1111-1111-111111111111'
CLIENTE="SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false);"

expect_ok 'CA1 authenticated INSERE credencial forjada direto na tabela (defeito)' \
  "$CLIENTE INSERT INTO public.passkey_credentials (id,user_id,credential_id,public_key,counter,friendly_name) VALUES ('f0000000-0000-0000-0000-000000000003','$UID_ALICE','cred-forjada','pubkey-forjada',0,'Forjada')"
expect_ok 'CA2 authenticated ALTERA public_key da propria credencial (defeito)' \
  "$CLIENTE UPDATE public.passkey_credentials SET public_key='pubkey-trocada' WHERE credential_id='cred-alice-1'"
expect_value 'CA3 a credencial forjada ficou gravada' '1' \
  "SELECT count(*) FROM public.passkey_credentials WHERE credential_id='cred-forjada'"

echo
echo '── Aplicando a migration de endurecimento ─────────────────────────────────────────'
psql_file "$passkey_migration"

echo
echo '── BLOCO C-B: DEPOIS da migration ─────────────────────────────────────────────────'
expect_error 'CB1 authenticated NAO insere mais (RLS negou)' 'row-level security' \
  "$CLIENTE INSERT INTO public.passkey_credentials (id,user_id,credential_id,public_key,counter,friendly_name) VALUES ('f0000000-0000-0000-0000-000000000004','$UID_ALICE','cred-forjada-2','pubkey-forjada-2',0,'Forjada 2')"
expect_ok 'CB2 authenticated renomeia a propria passkey (friendly_name)' \
  "$CLIENTE UPDATE public.passkey_credentials SET friendly_name='Chave nova' WHERE credential_id='cred-alice-1'"
expect_value 'CB3 o rename gravou' 'Chave nova' \
  "SELECT friendly_name FROM public.passkey_credentials WHERE credential_id='cred-alice-1'"
expect_error 'CB4 authenticated NAO altera public_key' 'passkey_sensitive_column_not_updatable' \
  "$CLIENTE UPDATE public.passkey_credentials SET public_key='pubkey-2' WHERE credential_id='cred-alice-1'"
expect_error 'CB5 authenticated NAO altera counter' 'passkey_sensitive_column_not_updatable' \
  "$CLIENTE UPDATE public.passkey_credentials SET counter=99 WHERE credential_id='cred-alice-1'"
expect_error 'CB6 authenticated NAO altera credential_id' 'passkey_sensitive_column_not_updatable' \
  "$CLIENTE UPDATE public.passkey_credentials SET credential_id='cred-roubada' WHERE credential_id='cred-alice-1'"
expect_error 'CB7 authenticated NAO move a credencial para outro usuario' '' \
  "$CLIENTE UPDATE public.passkey_credentials SET user_id='22222222-2222-2222-2222-222222222222' WHERE credential_id='cred-alice-1'"
expect_ok 'CB8 a Edge (service_role) segue gravando counter/public_key' \
  "SET ROLE service_role; UPDATE public.passkey_credentials SET counter=42, public_key='pubkey-renovada' WHERE credential_id='cred-alice-2'"
expect_value 'CB9 counter atualizado pela Edge' '42' \
  "SELECT counter FROM public.passkey_credentials WHERE credential_id='cred-alice-2'"
expect_ok 'CB10 authenticated apaga a propria passkey (DELETE preservado)' \
  "$CLIENTE DELETE FROM public.passkey_credentials WHERE credential_id='cred-forjada'"
expect_value 'CB11 a policy de INSERT sumiu e as outras 3 ficaram' '3' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='passkey_credentials' AND roles::text='{authenticated}'"
expect_value 'CB12 nenhum GRANT mudou' "$passkey_grants_before" \
  "SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='passkey_credentials'"

echo
echo '── BLOCO D: rollback declarado na migration ───────────────────────────────────────'
head -12 "$passkey_migration" | grep -E '^--   .*;$' | sed -E 's/^--   //' > "$tmp_dir/passkey-rollback.sql"
[[ -s "$tmp_dir/passkey-rollback.sql" ]] || fail 'nao extraí nenhuma linha executavel de rollback da migration'
psql_file "$tmp_dir/passkey-rollback.sql"

expect_value 'D1 o gatilho de guarda sumiu' '0' \
  "SELECT count(*) FROM pg_trigger WHERE tgname='passkey_credentials_guard_sensitive_columns' AND NOT tgisinternal"
expect_ok 'D2 authenticated volta a inserir (policy restaurada)' \
  "$CLIENTE INSERT INTO public.passkey_credentials (id,user_id,credential_id,public_key,counter,friendly_name) VALUES ('f0000000-0000-0000-0000-000000000005','$UID_ALICE','cred-pos-rollback','pubkey-pos-rollback',0,'Pos rollback')"
expect_ok 'D3 authenticated volta a alterar public_key (sem gatilho)' \
  "$CLIENTE UPDATE public.passkey_credentials SET public_key='pubkey-pos-rollback-2' WHERE credential_id='cred-pos-rollback'"

printf '\n[OK] 14 policies TO public -> authenticated + endurecimento de passkey_credentials verificados\n'
