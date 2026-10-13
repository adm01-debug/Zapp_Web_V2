#!/usr/bin/env bash
# N-070: view team_message_read_state com security_invoker = true.
#
# Roda o MESMO roteiro no mesmo container, em dois blocos:
#   BLOCO A — estado ANTERIOR (defeito): a view nao existe.
#             Consultar team_message_read_state falha com "relation does not exist".
#   BLOCO B — migration aplicada: a view existe.
#             Com 3 membros (A, B, C) e 1 nao-membro (D):
#               * A envia mensagem; all_read = false (B e C nao leram).
#               * B le; all_read = false (C nao leu).
#               * C le; all_read = true (todos os outros leram).
#               * D (nao membro) nao enxerga nenhuma linha.
#
# Pre-estado fiel ao canonico: tabelas team_messages, team_conversation_members,
# team_message_receipts e helpers is_team_conversation_member / current_profile_id.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261009214931_team_message_read_state_view.sql"
postgres_image="${TEAM_READ_STATE_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-team-read-state-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-team-read-state-test-[0-9]+$ ]]; then
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
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}
expect_value_as() {
  local label="$1" expected="$2" jwt="$3" sql="$4" actual
  actual="$(as_user "$jwt" "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}
expect_ok_as() {
  local label="$1" jwt="$2" sql="$3"
  as_user "$jwt" "$sql" >/dev/null || fail "$label: deveria ter sucesso (como authenticated)"
  printf '[PASS] %s\n' "$label"
}
expect_error_anon() {
  local label="$1" needle="$2" sql="$3" output status
  set +e
  output="$(docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE anon; $sql" 2>&1)"
  status=$?
  set -e
  (( status == 0 )) && { printf '%s\n' "$output" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$output" == *"$needle"* ]] || { printf '%s\n' "$output" >&2; fail "$label: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$label"
}
expect_error_as() {
  local label="$1" needle="$2" jwt="$3" sql="$4" output status
  set +e
  output="$(as_user "$jwt" "$sql" 2>&1)"
  status=$?
  set -e
  (( status == 0 )) && { printf '%s\n' "$output" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$output" == *"$needle"* ]] || { printf '%s\n' "$output" >&2; fail "$label: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=*** "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1)); (( ready_checks >= 2 )) && break
  else ready_checks=0; fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# Schema base + helpers + dados de teste.
cat > "$tmp_dir/setup.sql" <<'SQL'
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
       'authenticated'
     )::text $$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  role text DEFAULT 'agent',
  is_active boolean DEFAULT true
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
);
CREATE TABLE public.team_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'direct',
  name text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.team_conversation_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz DEFAULT now(),
  is_muted boolean DEFAULT false,
  UNIQUE (conversation_id, profile_id)
);
CREATE TABLE public.team_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id),
  content text NOT NULL DEFAULT '',
  message_type text NOT NULL DEFAULT 'text',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.team_message_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.team_messages(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'delivered',
  delivered_at timestamptz DEFAULT now(),
  read_at timestamptz,
  UNIQUE (message_id, profile_id),
  CONSTRAINT team_receipts_status_check CHECK (status IN ('delivered','read'))
);

-- Helper functions BEFORE RLS policies that reference them.
CREATE OR REPLACE FUNCTION public.current_profile_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $function$ SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1; $function$;
REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_team_conversation_member(_user_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.team_conversation_members tcm
    JOIN public.profiles p ON p.id = tcm.profile_id
    WHERE tcm.conversation_id = _conversation_id
      AND p.user_id = _user_id
  );
$function$;

-- RLS policies (after helpers exist).
ALTER TABLE public.team_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view conversations"
  ON public.team_conversations FOR SELECT
  USING (public.is_team_conversation_member(auth.uid(), id));
GRANT SELECT ON public.team_conversations TO authenticated;

ALTER TABLE public.team_conversation_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view membership"
  ON public.team_conversation_members FOR SELECT
  USING (public.is_team_conversation_member(auth.uid(), conversation_id));
GRANT SELECT ON public.team_conversation_members TO authenticated;

ALTER TABLE public.team_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view messages"
  ON public.team_messages FOR SELECT
  USING (public.is_team_conversation_member(auth.uid(), conversation_id));
GRANT SELECT ON public.team_messages TO authenticated;

ALTER TABLE public.team_message_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Conversation members can read receipts"
  ON public.team_message_receipts FOR SELECT
  TO authenticated
  USING (is_team_conversation_member(auth.uid(), conversation_id));
CREATE POLICY "Members can insert own receipts"
  ON public.team_message_receipts FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = current_profile_id());
GRANT SELECT, INSERT, UPDATE ON public.team_message_receipts TO authenticated;
SQL

psql_file "$tmp_dir/setup.sql" >/dev/null

# Dados de teste: 3 membros (A, B, C) + 1 nao-membro (D).
cat > "$tmp_dir/seed.sql" <<'SQL'
INSERT INTO public.profiles (id, user_id, role, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'agent', true),
  ('b0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'agent', true),
  ('c0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'agent', true),
  ('d0000000-0000-0000-0000-000000000004', '44444444-4444-4444-4444-444444444444', 'agent', true);

INSERT INTO public.team_conversations (id, type, name, created_by) VALUES
  ('e0000000-0000-0000-0000-00000000000a', 'group', 'Time Teste', 'a0000000-0000-0000-0000-000000000001');

INSERT INTO public.team_conversation_members (conversation_id, profile_id) VALUES
  ('e0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-000000000002'),
  ('e0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000003');

INSERT INTO public.team_messages (id, conversation_id, sender_id, content) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'mensagem do A');
SQL

psql_file "$tmp_dir/seed.sql" >/dev/null

ATILA='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
BETO='{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'
DORA='{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}'
EVA='{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}'

MSG='d0000000-0000-0000-0000-000000000001'
CONV='e0000000-0000-0000-0000-00000000000a'

printf '\n============ BLOCO A — estado ANTERIOR (view nao existe) ============\n'
expect_error_as 'A.1 view nao existe antes da migration' 'relation "public.team_message_read_state" does not exist' \
  "$ATILA" "SELECT * FROM public.team_message_read_state WHERE message_id = '$MSG';"

printf '\n============ Aplicando migration ============\n'
psql_file "$migration" >/dev/null

printf '\n============ BLOCO B — migration aplicada ============\n'

# Sem receipts: nenhum membro leu. all_read = false (0 != 2).
expect_value_as 'B.1 A envia, sem receipts: all_read=false (0 != 2)' 'f' \
  "$ATILA" "SELECT all_read FROM public.team_message_read_state WHERE message_id = '$MSG';"
expect_value_as 'B.2 member_count = 3' '3' \
  "$ATILA" "SELECT member_count FROM public.team_message_read_state WHERE message_id = '$MSG';"
expect_value_as 'B.3 read_count = 0 (ninguem leu)' '0' \
  "$ATILA" "SELECT read_count FROM public.team_message_read_state WHERE message_id = '$MSG';"

# B le a mensagem.
expect_ok_as 'B.4 B le a mensagem' "$BETO" \
  "INSERT INTO public.team_message_receipts(message_id, profile_id, conversation_id, status, delivered_at, read_at) VALUES('$MSG', 'b0000000-0000-0000-0000-000000000002', '$CONV', 'read', now(), now());"

expect_value_as 'B.5 B leu, C nao: all_read=false (1 != 2)' 'f' \
  "$ATILA" "SELECT all_read FROM public.team_message_read_state WHERE message_id = '$MSG';"
expect_value_as 'B.6 read_count = 1' '1' \
  "$ATILA" "SELECT read_count FROM public.team_message_read_state WHERE message_id = '$MSG';"

# C le a mensagem.
expect_ok_as 'B.7 C le a mensagem' "$DORA" \
  "INSERT INTO public.team_message_receipts(message_id, profile_id, conversation_id, status, delivered_at, read_at) VALUES('$MSG', 'c0000000-0000-0000-0000-000000000003', '$CONV', 'read', now(), now());"

expect_value_as 'B.8 B e C leram: all_read=true (2 = 2)' 't' \
  "$ATILA" "SELECT all_read FROM public.team_message_read_state WHERE message_id = '$MSG';"
expect_value_as 'B.9 read_count = 2' '2' \
  "$ATILA" "SELECT read_count FROM public.team_message_read_state WHERE message_id = '$MSG';"

# Nao-membro D nao enxerga nenhuma linha.
expect_value_as 'B.10 nao-membro D nao vê linhas' '0' \
  "$EVA" "SELECT count(*) FROM public.team_message_read_state WHERE message_id = '$MSG';"

# anon nao le a view; a view e security_invoker.
expect_error_anon 'B.11 anon nao consegue ler a view' 'permission denied' \
  "SELECT * FROM public.team_message_read_state;"
expect_value 'B.12 reloptions contem security_invoker=true' 't' \
  "SELECT coalesce('security_invoker=true' = ANY(reloptions), false) FROM pg_class WHERE oid = 'public.team_message_read_state'::regclass;"

printf '\n============ BLOCO C — rollback da migration e reaplicacao ============\n'

# A linha de rollback vem do proprio arquivo da migration (comeca com "--   DROP VIEW").
rollback_sql="$(sed -n 's/^--[[:space:]]*\(DROP VIEW.*\)$/\1/p' "$migration" | head -n1)"
[[ -n "$rollback_sql" ]] || fail 'C.0 linha de rollback (-- DROP VIEW) nao encontrada na migration'
printf '[INFO] rollback extraido: %s\n' "$rollback_sql"

psql_sql "$rollback_sql" >/dev/null || fail 'C.1 rollback falhou'
printf '[PASS] C.1 rollback executado\n'
expect_value 'C.2 view sumiu apos o rollback' 't' \
  "SELECT to_regclass('public.team_message_read_state') IS NULL;"

psql_file "$migration" >/dev/null || fail 'C.3 reaplicacao da migration falhou'
printf '[PASS] C.3 migration reaplicada\n'
expect_value 'C.4 view voltou (reloptions contem security_invoker=true, como B.12)' 't' \
  "SELECT coalesce('security_invoker=true' = ANY(reloptions), false) FROM pg_class WHERE oid = 'public.team_message_read_state'::regclass;"

printf '\n============ Todos os testes passaram ============\n'
