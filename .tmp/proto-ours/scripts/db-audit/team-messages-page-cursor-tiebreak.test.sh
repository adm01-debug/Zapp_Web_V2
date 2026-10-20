#!/usr/bin/env bash
# N-072 — get_team_messages_page: (a) desempate do cursor por (created_at, id); (b) p_limit <= 0 recusado.
#
# Mesmo roteiro no mesmo container:
#   BLOCO A — estado ANTERIOR (migration 20260930280000): mensagens com o mesmo created_at somem na
#             paginacao por cursor e p_limit zero devolve vazio sem erro.
#   BLOCO B — migration nova aplicada: paginacao sem duplicata nem lacuna, limite invalido recusado,
#             guardas de autorizacao, ACL e teto de 200 preservados.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
base_migration="$repo_root/supabase/migrations/20260930280000_team_rpc_ambiguity_and_tcm_recursion.sql"
migration="$repo_root/supabase/migrations/20261010064729_team_messages_page_cursor_tiebreak_and_min_limit.sql"
postgres_image="${TEAM_CHAT_PAGE_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-team-page-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-team-page-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }
as_user() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$1', false); $2"
}
expect_value_as() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(as_user "$ATILA" "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}
expect_error_as() {
  local label="$1" needle="$2" sql="$3" output status
  set +e; output="$(as_user "$ATILA" "$sql" 2>&1)"; status=$?; set -e
  (( status == 0 )) && { printf '%s\n' "$output" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$output" == *"$needle"* ]] || { printf '%s\n' "$output" >&2; fail "$label: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$label"
}

# Percorre o historico inteiro com paginas de $1 itens, usando o ultimo id de cada pagina como cursor.
# Imprime os ids na ordem em que chegaram (uma linha por mensagem).
walk_pages() {
  local size="$1" cursor="NULL" out="" page last guard=0
  while (( guard++ < 20 )); do
    page="$(as_user "$ATILA" "SELECT id FROM public.get_team_messages_page('$CONV_A'::uuid, $cursor, $size);" | grep -E '^[0-9a-f-]{36}$' || true)"
    [[ -z "$page" ]] && break
    out+="$page"$'\n'
    last="$(tail -n1 <<<"$page")"
    cursor="'$last'::uuid"
  done
  printf '%s' "$out"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$base_migration" ]] || fail "migration base nao encontrada: $base_migration"
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
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid $$;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE, name text, avatar_url text);
CREATE TABLE public.team_conversations (id uuid PRIMARY KEY, type text NOT NULL DEFAULT 'group', name text);
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
ALTER TABLE public.team_conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_messages ENABLE ROW LEVEL SECURITY;
-- Policy que a migration base (20260930280000) descarta e recria.
CREATE POLICY tcm_select_own ON public.team_conversation_members FOR SELECT TO authenticated
  USING (profile_id = public.current_profile_id());
GRANT SELECT ON public.team_conversation_members, public.team_messages, public.profiles TO authenticated;

-- Funcao inicial so para a migration base poder substitui-la (CREATE OR REPLACE exige o mesmo retorno).
CREATE FUNCTION public.get_team_messages_page(p_conversation_id uuid, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, conversation_id uuid, sender_id uuid, content text, message_type text, reply_to_id uuid, media_url text, media_type text, media_bucket text, media_path text, is_edited boolean, created_at timestamp with time zone, updated_at timestamp with time zone, sender_name text, sender_avatar text)
 LANGUAGE sql AS $$ SELECT NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::boolean, NULL::timestamptz, NULL::timestamptz, NULL::text, NULL::text WHERE false $$;
GRANT EXECUTE ON FUNCTION public.get_team_messages_page(uuid, uuid, integer) TO authenticated;
SQL

# Seis mensagens no Time A: 1 antiga, 4 com o MESMO created_at (ids 02..05) e 1 nova.
cat > "$tmp_dir/seed.sql" <<'SQL'
INSERT INTO public.profiles (id, user_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Atila');
INSERT INTO public.team_conversations (id, name) VALUES ('e0000000-0000-0000-0000-00000000000a', 'Time A');
INSERT INTO public.team_conversation_members (conversation_id, profile_id)
  VALUES ('e0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001');
INSERT INTO public.team_messages (id, conversation_id, sender_id, content, created_at)
SELECT ('d0000000-0000-0000-0000-00000000000' || n)::uuid,
       'e0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'msg ' || n,
       CASE WHEN n = 1 THEN timestamptz '2026-10-10T10:00:00Z'
            WHEN n = 6 THEN timestamptz '2026-10-10T12:00:00Z'
            ELSE timestamptz '2026-10-10T11:00:00Z' END
  FROM generate_series(1, 6) AS n;
SQL

ATILA='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
CONV_A='e0000000-0000-0000-0000-00000000000a'
# Ordem esperada do historico completo: created_at DESC, id DESC.
EXPECTED=$'d0000000-0000-0000-0000-000000000006\nd0000000-0000-0000-0000-000000000005\nd0000000-0000-0000-0000-000000000004\nd0000000-0000-0000-0000-000000000003\nd0000000-0000-0000-0000-000000000002\nd0000000-0000-0000-0000-000000000001'

psql_file "$tmp_dir/pre.sql"
psql_file "$base_migration"
psql_file "$tmp_dir/seed.sql"

echo '── BLOCO A: ANTES da migration (os defeitos) ─────────────────────────────────────'
got="$(walk_pages 2)"
[[ "$got" != "$EXPECTED" ]] || fail 'A1: o defeito de desempate nao reproduziu (paginacao ja estava correta)'
printf '[PASS] A1 (defeito) paginacao de 2 em 2 perde mensagens de mesmo created_at: %s de 6 ids\n' "$(grep -c . <<<"$got")"

zero="$(as_user "$ATILA" "SELECT count(*) FROM public.get_team_messages_page('$CONV_A'::uuid, NULL, 0);" | tail -n1)"
[[ "$zero" == "0" ]] || fail "A2: esperava 0 linhas silenciosas com p_limit=0, obtido '$zero'"
printf '[PASS] A2 (defeito) p_limit=0 devolve vazio sem erro\n'

echo
echo '── Aplicando a migration ─────────────────────────────────────────────────────────'
psql_file "$migration"

echo
echo '── BLOCO B: DEPOIS da migration ──────────────────────────────────────────────────'
for size in 1 2 3 4 50; do
  got="$(walk_pages "$size")"
  [[ "$got" == "$EXPECTED" ]] || { printf 'obtido:\n%s\n' "$got" >&2; fail "B1 (pagina=$size) historico incompleto, repetido ou fora de ordem"; }
  printf '[PASS] B1 paginas de %s: 6 mensagens, sem duplicata nem lacuna, ordem created_at DESC, id DESC\n' "$size"
done

expect_value_as 'B2 sem cursor, a primeira pagina traz a mais nova' 'd0000000-0000-0000-0000-000000000006' \
  "SELECT id FROM public.get_team_messages_page('$CONV_A'::uuid, NULL, 1);"
expect_value_as 'B3 cursor na mensagem empatada (04) devolve as 2 empatadas de id menor + a antiga' '3' \
  "SELECT count(*) FROM public.get_team_messages_page('$CONV_A'::uuid, 'd0000000-0000-0000-0000-000000000004'::uuid, 50);"

expect_error_as 'B4 p_limit = 0 e recusado' 'invalid_limit' \
  "SELECT count(*) FROM public.get_team_messages_page('$CONV_A'::uuid, NULL, 0);"
expect_error_as 'B5 p_limit negativo e recusado' 'invalid_limit' \
  "SELECT count(*) FROM public.get_team_messages_page('$CONV_A'::uuid, NULL, -5);"
expect_error_as 'B6 p_limit NULL e recusado' 'invalid_limit' \
  "SELECT count(*) FROM public.get_team_messages_page('$CONV_A'::uuid, NULL, NULL);"
expect_value_as 'B7 p_limit = 1 continua valido' '1' \
  "SELECT count(*) FROM public.get_team_messages_page('$CONV_A'::uuid, NULL, 1);"

expect_error_as 'B8 guarda preservada: nao-membro recebe not_member' 'not_member' \
  "SELECT count(*) FROM public.get_team_messages_page('e0000000-0000-0000-0000-00000000000b'::uuid, NULL, 10);"
actual="$(as_user '{"role":"authenticated"}' "SELECT 1 FROM public.get_team_messages_page('$CONV_A'::uuid, NULL, 10);" 2>&1 || true)"
[[ "$actual" == *not_authenticated* ]] || fail "B9: sem JWT esperava not_authenticated, obtido '$actual'"
printf '[PASS] B9 guarda preservada: sem JWT recebe not_authenticated\n'

expect_value_as 'B10 teto de 200 preservado (limite 100000 nao estoura, devolve as 6)' '6' \
  "SELECT count(*) FROM public.get_team_messages_page('$CONV_A'::uuid, NULL, 100000);"

expect_value_as 'B11 ACL: anon sem EXECUTE, authenticated com' 'false|true' \
  "SELECT has_function_privilege('anon','public.get_team_messages_page(uuid,uuid,integer)','EXECUTE') || '|' || has_function_privilege('authenticated','public.get_team_messages_page(uuid,uuid,integer)','EXECUTE');"
expect_value_as 'B12 SECURITY DEFINER com search_path fixo' '1' \
  "SELECT count(*) FROM pg_proc WHERE proname='get_team_messages_page' AND prosecdef AND 'search_path=public, pg_temp' = ANY(proconfig);"

printf '\n[OK] desempate (created_at, id) e limite minimo de get_team_messages_page verificados\n'
