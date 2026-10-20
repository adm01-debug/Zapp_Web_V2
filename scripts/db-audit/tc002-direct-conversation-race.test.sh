#!/usr/bin/env bash
# TC-002 (#55) — "RPC ativa de conversa direta perdeu a proteção contra criação concorrente"
# (docs/reconciliation/reports/team-chat/CODE_DATABASE_TRUTH_TEAM_CHAT.md, TC-002).
#
# Roda o MESMO roteiro no mesmo container, em três blocos:
#   BLOCO A — estado ATIVO (defeito), montado com as migrations REAIS do repositório:
#             aplica 20260927270007 (par + índice único do par + 1ª versão da RPC) e
#             20260929190000 (corpo ativo hoje: SELECT por membros + INSERT só com
#             type/created_by; a reconciliação 20261003272707 repete esse mesmo corpo).
#             Prova: duas transações concorrentes para o MESMO par devolvem ids
#             DIFERENTES e deixam DUAS conversas diretas, as duas com o par NULL.
#             (É a "mutação": sem a correção, o BLOCO B não passa.)
#   BLOCO B — migration aplicada: as mesmas duas transações devolvem o MESMO id, fica UMA
#             conversa com os DOIS membros (ambos com member_role padrão 'member')
#             e o par ordenado gravado; os dois lados conseguem LER a conversa por
#             RLS; legado sem par não duplica; self e other_profile_id nulo são
#             rejeitados; a ACL não muda.
#   BLOCO C — idempotência e ROLLBACK: reaplica a migration; EXECUTA o bloco
#             `-- Rollback:` extraído do próprio arquivo da migration e prova, pelo
#             COMPORTAMENTO, que o corpo anterior voltou (a corrida duplica de novo);
#             reaplica a migration e confirma a correção de volta.
#
# Uso: bash scripts/db-audit/tc002-direct-conversation-race.test.sh

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261006222858_tc002_find_or_create_direct_pair_upsert.sql"
pre_e16="$repo_root/supabase/migrations/20260927270007_team_chat_e16_find_or_create_direct_conversation.sql"
pre_e29="$repo_root/supabase/migrations/20260929190000_team_chat_e29_conversations_constraints.sql"
postgres_image="${TC002_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-tc002-direct-pair-test-$$"

cleanup() {
  [[ -n "${tmp_dir:-}" ]] && rm -rf "$tmp_dir"
  if [[ "$container_name" =~ ^zapp-v2-tc002-direct-pair-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }
as_user() {
  local jwt="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"
}
expect_value() {
  local l="$1" e="$2" s="$3" a
  a="$(psql_sql "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  pass "$l"
}
expect_value_as() {
  local l="$1" e="$2" j="$3" s="$4" a
  a="$(as_user "$j" "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  pass "$l"
}
expect_error_as() {
  local l="$1" needle="$2" j="$3" s="$4" out st
  set +e; out="$(as_user "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  pass "$l"
}

# Primeira linha que é um uuid — a sessão que dorme imprime também a linha vazia do pg_sleep.
first_uuid() { grep -m1 -E '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' "$1" | tr -d '[:space:]'; }

# Duas transações SIMULTÂNEAS para o mesmo par: a 1ª segura a transação aberta (pg_sleep),
# a 2ª entra ~1s depois, enquanto a 1ª ainda não commitou.
race_pair() {  # <jwt_1> <alvo_1> <jwt_2> <alvo_2> <saida_1> <saida_2>
  local jwt1="$1" alvo1="$2" jwt2="$3" alvo2="$4" out1="$5" out2="$6" p1
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$jwt1', false); SELECT public.find_or_create_direct_conversation('$alvo1'); SELECT pg_sleep(3);" \
    > "$out1" 2>&1 &
  p1=$!
  sleep 1
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$jwt2', false); SELECT public.find_or_create_direct_conversation('$alvo2');" \
    > "$out2" 2>&1 || true
  wait "$p1" || true
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
for f in "$migration" "$pre_e16" "$pre_e29"; do
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

# ---- fixtures: roles, auth, profiles e as duas tabelas do team chat (formato canônico) ----
cat > "$tmp_dir/pre.sql" <<'SQL'
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
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  role text DEFAULT 'agent',
  is_active boolean DEFAULT true
);

CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text
);

CREATE TABLE public.team_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'direct',
  name text,
  avatar_url text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  department_id uuid REFERENCES public.departments(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT team_conversations_type_check CHECK (type IN ('direct', 'group', 'department'))
);

CREATE TABLE public.team_conversation_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz DEFAULT now(),
  is_muted boolean DEFAULT false,
  is_pinned boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  member_role text NOT NULL DEFAULT 'member',
  UNIQUE (conversation_id, profile_id),
  CONSTRAINT team_conversation_members_member_role_check CHECK (member_role IN ('owner', 'admin', 'member'))
);

CREATE OR REPLACE FUNCTION public.current_profile_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $function$ SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1; $function$;
REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_team_conversation_member(_user_id uuid, _conversation_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $function$
    SELECT EXISTS (
      SELECT 1 FROM public.team_conversation_members tcm
      JOIN public.profiles p ON p.id = tcm.profile_id
      WHERE tcm.conversation_id = _conversation_id AND p.user_id = _user_id
    );
  $function$;
REVOKE EXECUTE ON FUNCTION public.is_team_conversation_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_team_conversation_member(uuid, uuid) TO authenticated, service_role;

-- RLS de leitura como no repositório: cada um vê só as conversas de que participa.
ALTER TABLE public.team_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_conversation_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_conversations_select_members ON public.team_conversations FOR SELECT TO authenticated
  USING (public.is_team_conversation_member(auth.uid(), id)
         OR created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1));
CREATE POLICY team_conversation_members_select_members ON public.team_conversation_members FOR SELECT TO authenticated
  USING (public.is_team_conversation_member(auth.uid(), conversation_id));

GRANT SELECT ON public.team_conversations TO authenticated;
GRANT SELECT ON public.team_conversation_members TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.team_conversation_members;
DELETE FROM public.team_conversations;
DELETE FROM public.profiles;

INSERT INTO public.profiles (id, user_id, role) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'agent'), -- ATILA
  ('a0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'agent'), -- DORA
  ('a0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'agent'), -- EVA
  ('a0000000-0000-0000-0000-000000000004', '44444444-4444-4444-4444-444444444444', 'agent'); -- OTTO
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null

JWT_ATILA='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
JWT_DORA='{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'
JWT_EVA='{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}'
JWT_OTTO='{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}'
P_ATILA='a0000000-0000-0000-0000-000000000001'
P_DORA='a0000000-0000-0000-0000-000000000002'
P_EVA='a0000000-0000-0000-0000-000000000003'
P_OTTO='a0000000-0000-0000-0000-000000000004'

# ============================ BLOCO A — estado ativo (defeito) ============================
printf '\n============ BLOCO A — estado ATIVO (defeito), migrations reais ============\n'
psql_file "$pre_e16" >/dev/null
psql_file "$pre_e29" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

expect_value 'A.0 ponto de partida: nenhuma conversa direta ainda' '0' \
  "SELECT count(*) FROM public.team_conversations WHERE type = 'direct';"

race_pair "$JWT_ATILA" "$P_DORA" "$JWT_DORA" "$P_ATILA" "$tmp_dir/a1.txt" "$tmp_dir/a2.txt"
ID_A1="$(first_uuid "$tmp_dir/a1.txt")"
ID_A2="$(first_uuid "$tmp_dir/a2.txt")"
[[ -n "$ID_A1" && -n "$ID_A2" ]] || { cat "$tmp_dir/a1.txt" "$tmp_dir/a2.txt" >&2; fail 'A.1 a corrida nao devolveu dois ids'; }
[[ "$ID_A1" != "$ID_A2" ]] || fail "A.1 (DEFEITO esperado) as duas transacoes devolveram o MESMO id ($ID_A1) mesmo sem a correcao"
pass 'A.1 (DEFEITO) as duas transações concorrentes devolveram ids DIFERENTES'
expect_value 'A.2 (DEFEITO) ficaram DUAS conversas diretas para o mesmo par' '2' \
  "SELECT count(*) FROM public.team_conversations WHERE type = 'direct';"
expect_value 'A.3 (DEFEITO) as duas nasceram com o par ordenado NULL (o índice não arbitra)' '2' \
  "SELECT count(*) FROM public.team_conversations WHERE type = 'direct' AND direct_member_a IS NULL AND direct_member_b IS NULL;"
expect_value 'A.4 (DEFEITO) e com os dois membros cada (duplicata completa)' '2' \
  "SELECT count(*) FROM (SELECT conversation_id FROM public.team_conversation_members GROUP BY conversation_id HAVING count(*) = 2) x;"

# ==================== BLOCO B — migration aplicada (correção) ====================
printf '\n============ BLOCO B — migration aplicada ============\n'
ACL_ANTES="$(psql_sql "SELECT coalesce(proacl::text, 'NULL') FROM pg_proc WHERE oid = 'public.find_or_create_direct_conversation(uuid)'::regprocedure")"
psql_file "$migration" >/dev/null
ACL_DEPOIS="$(psql_sql "SELECT coalesce(proacl::text, 'NULL') FROM pg_proc WHERE oid = 'public.find_or_create_direct_conversation(uuid)'::regprocedure")"
psql_file "$tmp_dir/seed.sql" >/dev/null
pass 'B.0 migration aplicada no PostgreSQL descartável'

expect_value 'B.1 authenticated executa; anon NÃO executa' 'true|false' \
  "SELECT has_function_privilege('authenticated', 'public.find_or_create_direct_conversation(uuid)', 'EXECUTE')::text || '|' || has_function_privilege('anon', 'public.find_or_create_direct_conversation(uuid)', 'EXECUTE')::text;"
expect_value 'B.2 PUBLIC (grantee 0) segue sem EXECUTE' '0' \
  "SELECT count(*) FROM aclexplode((SELECT proacl FROM pg_proc WHERE oid = 'public.find_or_create_direct_conversation(uuid)'::regprocedure)) WHERE grantee = 0 AND privilege_type = 'EXECUTE';"
[[ "$ACL_ANTES" == "$ACL_DEPOIS" ]] || fail "B.3 a ACL mudou com a migration: antes '$ACL_ANTES' / depois '$ACL_DEPOIS'"
pass 'B.3 a ACL da RPC não mudou com a migration'

race_pair "$JWT_ATILA" "$P_DORA" "$JWT_DORA" "$P_ATILA" "$tmp_dir/b1.txt" "$tmp_dir/b2.txt"
ID_B1="$(first_uuid "$tmp_dir/b1.txt")"
ID_B2="$(first_uuid "$tmp_dir/b2.txt")"
[[ -n "$ID_B1" && -n "$ID_B2" ]] || { cat "$tmp_dir/b1.txt" "$tmp_dir/b2.txt" >&2; fail 'B.4 a corrida nao devolveu dois ids'; }
[[ "$ID_B1" == "$ID_B2" ]] || fail "B.4 as duas transacoes concorrentes devolveram ids diferentes ($ID_B1 != $ID_B2)"
pass 'B.4 duas transações concorrentes para o mesmo par devolvem o MESMO id'
expect_value 'B.5 ficou UMA única conversa direta' '1' \
  "SELECT count(*) FROM public.team_conversations WHERE type = 'direct';"
expect_value 'B.6 ...com os DOIS membros' '2' \
  "SELECT count(*) FROM public.team_conversation_members WHERE conversation_id = '$ID_B1';"
expect_value 'B.7 ...e os dois membros mantêm o member_role padrão' 'member|member' \
  "SELECT string_agg(member_role, '|' ORDER BY profile_id) FROM public.team_conversation_members WHERE conversation_id = '$ID_B1';"
expect_value 'B.8 o par ordenado canônico foi gravado (o índice único arbitra)' "$P_ATILA|$P_DORA" \
  "SELECT direct_member_a::text || '|' || direct_member_b::text FROM public.team_conversations WHERE id = '$ID_B1';"
expect_value_as 'B.9 ATILA lê a conversa devolvida sob RLS' "$ID_B1" \
  "$JWT_ATILA" "SELECT id FROM public.team_conversations WHERE id = '$ID_B1';"
expect_value_as 'B.10 DORA lê a MESMA conversa devolvida sob RLS' "$ID_B1" \
  "$JWT_DORA" "SELECT id FROM public.team_conversations WHERE id = '$ID_B1';"
expect_value_as 'B.11 EVA (não participa) NÃO enxerga a conversa' '0' \
  "$JWT_EVA" "SELECT count(*) FROM public.team_conversations WHERE id = '$ID_B1';"

expect_value_as 'B.12 chamada seguinte (mesmo par, invertido) devolve o mesmo id' "$ID_B1" \
  "$JWT_DORA" "SELECT public.find_or_create_direct_conversation('$P_ATILA');"
expect_value 'B.13 e continua existindo UMA conversa' '1' \
  "SELECT count(*) FROM public.team_conversations WHERE type = 'direct';"

# Legado: linha direta criada pelo corpo regredido — par NULL, dois membros.
psql_sql "INSERT INTO public.team_conversations (id, type, created_by) VALUES ('e0000000-0000-0000-0000-0000000000f1', 'direct', '$P_EVA');
          INSERT INTO public.team_conversation_members (conversation_id, profile_id) VALUES ('e0000000-0000-0000-0000-0000000000f1', '$P_EVA'), ('e0000000-0000-0000-0000-0000000000f1', '$P_OTTO');" >/dev/null
expect_value_as 'B.14 legado sem par: a RPC acha a conversa existente pelos membros' 'e0000000-0000-0000-0000-0000000000f1' \
  "$JWT_EVA" "SELECT public.find_or_create_direct_conversation('$P_OTTO');"
expect_value 'B.15 ...e não cria uma duplicata ao lado dela' '1' \
  "SELECT count(*) FROM (SELECT c.id FROM public.team_conversations c JOIN public.team_conversation_members m ON m.conversation_id = c.id WHERE c.type = 'direct' AND m.profile_id IN ('$P_EVA', '$P_OTTO') GROUP BY c.id HAVING count(*) = 2) x;"

expect_error_as 'B.16 conversa consigo mesmo é rejeitada' 'cannot_create_direct_with_self' \
  "$JWT_ATILA" "SELECT public.find_or_create_direct_conversation('$P_ATILA');"
expect_error_as 'B.17 other_profile_id nulo é rejeitado (não nasce linha com par NULL)' 'other_profile_id_required' \
  "$JWT_ATILA" "SELECT public.find_or_create_direct_conversation(NULL);"
expect_value 'B.18 as recusas não deixaram conversa direta a mais' '2' \
  "SELECT count(*) FROM public.team_conversations WHERE type = 'direct';"

# ==================== BLOCO C — idempotência e rollback ====================
printf '\n============ BLOCO C — idempotência e ROLLBACK ============\n'
psql_file "$migration" >/dev/null
pass 'C.1 reaplicar a migration não falha (idempotente)'

rollback_sql="$(awk '
  /^-- Rollback:/ { in_rb=1; next }
  in_rb && /^--   / { sub(/^--   ?/, ""); print; next }
  in_rb && /^--$/ { exit }
  in_rb { exit }
' "$migration")"
printf '%s\n' "$rollback_sql" | \
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres >/dev/null \
  || fail 'C.2 o bloco -- Rollback: do próprio arquivo não executou'
pass 'C.2 o bloco -- Rollback: (extraído do arquivo) executou'

psql_file "$tmp_dir/seed.sql" >/dev/null
race_pair "$JWT_EVA" "$P_OTTO" "$JWT_OTTO" "$P_EVA" "$tmp_dir/c1.txt" "$tmp_dir/c2.txt"
ID_C1="$(first_uuid "$tmp_dir/c1.txt")"
ID_C2="$(first_uuid "$tmp_dir/c2.txt")"
[[ -n "$ID_C1" && -n "$ID_C2" ]] || { cat "$tmp_dir/c1.txt" "$tmp_dir/c2.txt" >&2; fail 'C.3 a corrida pós-rollback nao devolveu dois ids'; }
[[ "$ID_C1" != "$ID_C2" ]] || fail "C.3 o rollback nao devolveu o corpo anterior (a corrida seguiu protegida: $ID_C1)"
pass 'C.3 rollback provado pelo comportamento: o corpo anterior voltou e a corrida duplica de novo'
expect_value 'C.4 e o par voltou a ficar NULL (comportamento do corpo anterior)' '2' \
  "SELECT count(*) FROM public.team_conversations WHERE type = 'direct' AND direct_member_a IS NULL AND direct_member_b IS NULL;"

psql_file "$migration" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null
race_pair "$JWT_EVA" "$P_OTTO" "$JWT_OTTO" "$P_EVA" "$tmp_dir/d1.txt" "$tmp_dir/d2.txt"
ID_D1="$(first_uuid "$tmp_dir/d1.txt")"
ID_D2="$(first_uuid "$tmp_dir/d2.txt")"
[[ -n "$ID_D1" && -n "$ID_D2" && "$ID_D1" == "$ID_D2" ]] || fail "C.5 reaplicar a migration nao restaurou a correção ($ID_D1 != $ID_D2)"
pass 'C.5 reaplicar a migration restaura a correção (mesmo id na corrida)'

printf '\nPASS: TC-002 — o par ordenado de volta ao INSERT arbitrado pelo índice único faz duas transações concorrentes devolverem o MESMO id e deixarem UMA conversa com os DOIS membros usando o member_role padrão; o rollback do próprio arquivo devolve o corpo anterior.\n'
