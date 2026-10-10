#!/usr/bin/env bash
# #1266 — dois defeitos no DDL do team chat, ambos concedidos a `authenticated`:
#   1) `get_team_messages_page` com referencias AMBIGUAS (42702): o nome da tabela/pseudotabela colide com
#      nomes de coluna de saida do `RETURNS TABLE` (que em PL/pgSQL viram variaveis).
#   2) `tcm_select_own` com RECURSAO INFINITA (42P17): o `qual` referencia a propria tabela da policy.
#
# Roda o MESMO roteiro no mesmo container:
#   BLOCO A — estado ANTERIOR: prova os dois defeitos (e prova que a ambiguidade do cursor e um defeito
#             SEPARADO da do vinculo, qualificando so o primeiro ponto num passo intermediario).
#   BLOCO B — migration aplicada: a RPC e a policy funcionam, o contrato nao mudou e as guardas de
#             autorizacao (not_authenticated / not_member) continuam valendo.
#
# Estado anterior fiel ao canonico de 30/09 (`pg_get_functiondef` + `pg_policies`).

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20260930280000_team_rpc_ambiguity_and_tcm_recursion.sql"
postgres_image="${TEAM_CHAT_RPC_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-team-chat-rpc-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-team-chat-rpc-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }
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
expect_error_as() {
  local label="$1" needle="$2" jwt="$3" sql="$4" output status
  set +e
  output="$(as_user "$jwt" "$sql" 2>&1)"; status=$?
  set -e
  (( status == 0 )) && { printf '%s\n' "$output" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$output" == *"$needle"* ]] || { printf '%s\n' "$output" >&2; fail "$label: esperava '$needle' no erro"; }
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

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
       nullif(current_setting('request.jwt.claim.sub', true), '')
     ), '')::uuid $$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  name text,
  avatar_url text
);
CREATE TABLE public.team_conversations (
  id uuid PRIMARY KEY,
  type text NOT NULL DEFAULT 'group',
  name text
);
CREATE TABLE public.team_conversation_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  member_role text NOT NULL DEFAULT 'member',
  UNIQUE (conversation_id, profile_id)
);
CREATE TABLE public.team_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id),
  content text NOT NULL DEFAULT '',
  message_type text NOT NULL DEFAULT 'text',
  reply_to_id uuid,
  media_url text, media_type text, media_bucket text, media_path text,
  is_edited boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.current_profile_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $$ SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1 $$;
CREATE FUNCTION public.is_team_conversation_member(_user_id uuid, _conversation_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT EXISTS (
        SELECT 1 FROM public.team_conversation_members tcm
        JOIN public.profiles p ON p.id = tcm.profile_id
        WHERE tcm.conversation_id = _conversation_id AND p.user_id = _user_id) $$;

-- RLS da tabela de membros + a policy RECURSIVA, fiel ao canonico de 30/09.
ALTER TABLE public.team_conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY tcm_select_own ON public.team_conversation_members
  FOR SELECT TO authenticated
  USING (
    (profile_id = public.current_profile_id())
    OR (EXISTS (
      SELECT 1 FROM public.team_conversation_members m2
       WHERE m2.conversation_id = team_conversation_members.conversation_id
         AND m2.profile_id = public.current_profile_id()
    ))
  );

-- RPC com as TRES referencias ambiguas, fiel ao canonico de 30/09.
CREATE FUNCTION public.get_team_messages_page(p_conversation_id uuid, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, conversation_id uuid, sender_id uuid, content text, message_type text, reply_to_id uuid, media_url text, media_type text, media_bucket text, media_path text, is_edited boolean, created_at timestamp with time zone, updated_at timestamp with time zone, sender_name text, sender_avatar text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid := public.current_profile_id();
  v_before_at  timestamptz;
BEGIN
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.team_conversation_members
     WHERE conversation_id = p_conversation_id AND profile_id = v_profile_id
  ) THEN
    RAISE EXCEPTION 'not_member';
  END IF;

  IF p_before_id IS NOT NULL THEN
    SELECT created_at INTO v_before_at
      FROM public.team_messages WHERE id = p_before_id;
  END IF;

  RETURN QUERY
  SELECT
    m.id, m.conversation_id, m.sender_id, m.content, m.message_type,
    m.reply_to_id, m.media_url, m.media_type, m.media_bucket, m.media_path,
    m.is_edited, m.created_at, m.updated_at,
    p.name, p.avatar_url
  FROM public.team_messages m
  LEFT JOIN public.profiles p ON p.id = m.sender_id
  WHERE m.conversation_id = p_conversation_id
    AND (v_before_at IS NULL OR m.created_at < v_before_at)
  ORDER BY m.created_at DESC
  LIMIT LEAST(p_limit, 200);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_team_messages_page(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_messages_page(uuid, uuid, integer) TO authenticated;
GRANT SELECT ON public.team_conversation_members TO authenticated;
GRANT SELECT ON public.team_messages TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.team_messages;
DELETE FROM public.team_conversation_members;
DELETE FROM public.team_conversations;
DELETE FROM public.profiles;

INSERT INTO public.profiles (id, user_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Atila'),
  ('c0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'Beto');

INSERT INTO public.team_conversations (id, type, name) VALUES
  ('e0000000-0000-0000-0000-00000000000a', 'group', 'Time A'),
  ('e0000000-0000-0000-0000-00000000000b', 'group', 'Time B');

INSERT INTO public.team_conversation_members (conversation_id, profile_id) VALUES
  ('e0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-000000000001');

-- Tres mensagens no Time A, com created_at crescentes e deterministicos.
INSERT INTO public.team_messages (id, conversation_id, sender_id, content, created_at) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'msg 1 (mais antiga)', '2026-09-30T10:00:00Z'),
  ('d0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'msg 2 (meio)',        '2026-09-30T11:00:00Z'),
  ('d0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001', 'msg 3 (mais nova)',  '2026-09-30T12:00:00Z');
SQL

psql_file "$tmp_dir/pre.sql"
psql_file "$tmp_dir/seed.sql"

ATILA='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
BETO='{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}'
CONV_A='e0000000-0000-0000-0000-00000000000a'
CONV_B='e0000000-0000-0000-0000-00000000000b'
MSG_NOVA='d0000000-0000-0000-0000-000000000003'

echo '── BLOCO A: comportamento ANTES da migration (os defeitos) ───────────────────────'

expect_error_as 'A1 (defeito) get_team_messages_page estoura: conversation_id ambiguo (42702)' \
  'column reference "conversation_id" is ambiguous' "$ATILA" \
  "SELECT count(*) FROM public.get_team_messages_page('$CONV_A'::uuid, NULL, 50);"

expect_error_as 'A2 (defeito) tcm_select_own estoura: recursao infinita na policy (42P17)' \
  'infinite recursion detected in policy' "$ATILA" \
  "SELECT count(*) FROM public.team_conversation_members;"

# Prova que a ambiguidade do CURSOR e um defeito SEPARADO: qualifico so a checagem de vinculo
# (o primeiro ponto) e a chamada com p_before_id cai na ambiguidade de created_at/id.
cat > "$tmp_dir/passo-intermediario.sql" <<'SQL'
CREATE OR REPLACE FUNCTION public.get_team_messages_page(p_conversation_id uuid, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, conversation_id uuid, sender_id uuid, content text, message_type text, reply_to_id uuid, media_url text, media_type text, media_bucket text, media_path text, is_edited boolean, created_at timestamp with time zone, updated_at timestamp with time zone, sender_name text, sender_avatar text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid := public.current_profile_id();
  v_before_at  timestamptz;
BEGIN
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.team_conversation_members tcm
     WHERE tcm.conversation_id = p_conversation_id AND tcm.profile_id = v_profile_id
  ) THEN
    RAISE EXCEPTION 'not_member';
  END IF;
  IF p_before_id IS NOT NULL THEN
    SELECT created_at INTO v_before_at
      FROM public.team_messages WHERE id = p_before_id;
  END IF;
  RETURN QUERY
  SELECT m.id, m.conversation_id, m.sender_id, m.content, m.message_type,
         m.reply_to_id, m.media_url, m.media_type, m.media_bucket, m.media_path,
         m.is_edited, m.created_at, m.updated_at, p.name, p.avatar_url
  FROM public.team_messages m
  LEFT JOIN public.profiles p ON p.id = m.sender_id
  WHERE m.conversation_id = p_conversation_id
    AND (v_before_at IS NULL OR m.created_at < v_before_at)
  ORDER BY m.created_at DESC
  LIMIT LEAST(p_limit, 200);
END;
$function$;
SQL
psql_file "$tmp_dir/passo-intermediario.sql"

expect_ok_as 'A3 (controle) so com a checagem de vinculo qualificada, a lista SEM cursor ja funciona' \
  "$ATILA" "SELECT count(*) FROM public.get_team_messages_page('$CONV_A'::uuid, NULL, 50);"

expect_error_as 'A4 (defeito SEPARADO) com cursor, a ambiguidade de created_at/id aparece (42702)' \
  'is ambiguous' "$ATILA" \
  "SELECT count(*) FROM public.get_team_messages_page('$CONV_A'::uuid, '$MSG_NOVA'::uuid, 50);"

echo
echo '── Aplicando a migration ─────────────────────────────────────────────────────────'
psql_file "$migration"
psql_file "$tmp_dir/seed.sql"

echo
echo '── BLOCO B: comportamento DEPOIS da migration ────────────────────────────────────'

expect_value_as 'B1 (#1266) get_team_messages_page responde (sem 42702)' '3' \
  "$ATILA" "SELECT count(*) FROM public.get_team_messages_page('$CONV_A'::uuid, NULL, 50);"

expect_value_as 'B2 (#1266) paginacao por cursor funciona (sem 42702; 2 anteriores a mais nova)' '2' \
  "$ATILA" "SELECT count(*) FROM public.get_team_messages_page('$CONV_A'::uuid, '$MSG_NOVA'::uuid, 50);"

expect_value_as 'B3 ordem preservada: mais nova primeiro' 'msg 3 (mais nova)' \
  "$ATILA" "SELECT content FROM public.get_team_messages_page('$CONV_A'::uuid, NULL, 1);"

expect_value_as 'B4 LIMIT respeitado' '2' \
  "$ATILA" "SELECT count(*) FROM public.get_team_messages_page('$CONV_A'::uuid, NULL, 2);"

expect_value_as 'B5 contrato inalterado: o JOIN traz sender_name (2 mensagens do Atila)' '2' \
  "$ATILA" "SELECT count(*) FROM public.get_team_messages_page('$CONV_A'::uuid, NULL, 50) WHERE sender_name = 'Atila';"

expect_error_as 'B6 guarda de autorizacao preservada: nao-membro recebe not_member' \
  'not_member' "$ATILA" \
  "SELECT count(*) FROM public.get_team_messages_page('$CONV_B'::uuid, NULL, 50);"

expect_error_as 'B7 guarda preservada: sem JWT recebe not_authenticated' \
  'not_authenticated' '{"role":"authenticated"}' \
  "SELECT count(*) FROM public.get_team_messages_page('$CONV_A'::uuid, NULL, 50);"

expect_value_as 'B8 (#1266) tcm_select_own responde (sem recursao): Atila ve as 2 linhas do Time A' '2' \
  "$ATILA" "SELECT count(*) FROM public.team_conversation_members;"

expect_value_as 'B9 isolamento preservado: Beto (nos 2 times) ve as 3 linhas' '3' \
  "$BETO" "SELECT count(*) FROM public.team_conversation_members;"

expect_value_as 'B9b Atila ve exatamente 1 conversa (so o Time A)' '1' \
  "$ATILA" "SELECT count(DISTINCT conversation_id) FROM public.team_conversation_members;"

expect_value 'B10 a policy nao referencia a propria tabela no qual (sem recursao)' '0' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='team_conversation_members' AND cmd='SELECT' AND qual LIKE '%team_conversation_members%'"

expect_value 'B11 a policy usa o helper SECURITY DEFINER' '1' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='team_conversation_members' AND cmd='SELECT' AND qual LIKE '%is_team_conversation_member%'"

expect_value 'B12 contrato da RPC inalterado (mesmas colunas, mesma ordem, mesmos tipos)' '1' \
  "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_team_messages_page' AND pg_get_function_result(p.oid) = 'TABLE(id uuid, conversation_id uuid, sender_id uuid, content text, message_type text, reply_to_id uuid, media_url text, media_type text, media_bucket text, media_path text, is_edited boolean, created_at timestamp with time zone, updated_at timestamp with time zone, sender_name text, sender_avatar text)'"

printf '\n[OK] ambiguidade da RPC e recursao da policy do team chat (#1266) verificadas\n'
