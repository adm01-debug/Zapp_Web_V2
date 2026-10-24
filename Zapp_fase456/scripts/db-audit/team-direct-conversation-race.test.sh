#!/usr/bin/env bash
# Item 55 do BACKLOG_VERIFICADO (P1 funcional) — prova em Postgres descartavel que a
# RPC ativa de conversa direta voltou a usar a garantia de banco contra criacao concorrente.
#
# O teste reproduz o defeito no corpo anterior (duas sessoes simultaneas criam duas conversas),
# aplica a migration real deste cartao e prova que a corrida termina em uma conversa so, com
# direct_member_a/direct_member_b preenchidos e ON CONFLICT decidido pelo indice unico parcial.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261006152414_team_chat_direct_conversation_race_guard.sql"
postgres_image="${TEAM_DIRECT_RACE_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-team-direct-race-test-$$"
HOLD="${TEAM_DIRECT_RACE_TEST_HOLD:-4}"
OFFSET="${TEAM_DIRECT_RACE_TEST_OFFSET:-1.5}"
mkdir -p "${TMPDIR:-$repo_root/.tmp}"

tmp_dir="$(mktemp -d "${TMPDIR:-$repo_root/.tmp}/team-direct-race.XXXXXX")"
cleanup() {
  rm -rf "$tmp_dir" >/dev/null 2>&1 || true
  if [[ "$container_name" =~ ^zapp-v2-team-direct-race-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_stdin() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }

as_user() { # as_user <jwt> <sql>
  local jwt="$1" sql="$2"
  printf "SET ROLE authenticated;\nSET request.jwt.claims = '%s';\n%s\n" "$jwt" "$sql" | psql_stdin
}
as_anon() {
  printf "SET ROLE anon;\n%s\n" "$1" | psql_stdin
}
uuid_of() { grep -Eo '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' "$1" 2>/dev/null | tail -n1 || true; }
fn_md5() { psql_sql "SELECT md5(pg_get_functiondef('public.find_or_create_direct_conversation(uuid)'::regprocedure));" | tail -n1; }

expect_value() {
  local label="$1" expected="$2" sql="$3" got
  got="$(psql_sql "$sql" | tail -n1)"
  [[ "$got" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$got'"
  printf '[PASS] %s\n' "$label"
}
expect_value_as() {
  local label="$1" expected="$2" jwt="$3" sql="$4" got
  got="$(as_user "$jwt" "$sql" | tail -n1)"
  [[ "$got" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$got'"
  printf '[PASS] %s\n' "$label"
}
expect_error_sql() {
  local label="$1" needle="$2" sql="$3" out st
  set +e; out="$(psql_sql "$sql" 2>&1)"; st=$?; set -e
  (( st != 0 )) || { printf '%s\n' "$out" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$label: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$label"
}
expect_error_as() {
  local label="$1" needle="$2" jwt="$3" sql="$4" out st
  set +e; out="$(as_user "$jwt" "$sql" 2>&1)"; st=$?; set -e
  (( st != 0 )) || { printf '%s\n' "$out" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$label: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$label"
}
expect_error_anon() {
  local label="$1" needle="$2" sql="$3" out st
  set +e; out="$(as_anon "$sql" 2>&1)"; st=$?; set -e
  (( st != 0 )) || { printf '%s\n' "$out" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$label: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$label"
}
count_pair() {
  psql_sql "SELECT count(*) FROM public.team_conversations c
              JOIN public.team_conversation_members m1 ON m1.conversation_id = c.id AND m1.profile_id = '$1'
              JOIN public.team_conversation_members m2 ON m2.conversation_id = c.id AND m2.profile_id = '$2'
             WHERE c.type = 'direct';" | tail -n1
}
expect_count_pair() {
  local label="$1" expected="$2" got
  got="$(count_pair "$3" "$4")"
  [[ "$got" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$got'"
  printf '[PASS] %s\n' "$label"
}
race() {
  local ja="$1" oa="$2" fa="$3" jb="$4" ob="$5" fb="$6" pid_a st_b st_a
  printf "SET ROLE authenticated;\nSET request.jwt.claims = '%s';\nBEGIN;\nSELECT public.find_or_create_direct_conversation('%s'::uuid);\nSELECT pg_sleep(%s);\nCOMMIT;\n" \
    "$ja" "$oa" "$HOLD" | psql_stdin > "$fa" 2>&1 &
  pid_a=$!
  sleep "$OFFSET"
  set +e
  printf "SET ROLE authenticated;\nSET request.jwt.claims = '%s';\nBEGIN;\nSELECT public.find_or_create_direct_conversation('%s'::uuid);\nCOMMIT;\n" \
    "$jb" "$ob" | psql_stdin > "$fb" 2>&1
  st_b=$?
  wait "$pid_a"; st_a=$?
  set -e
  [[ "$st_a" == 0 && "$st_b" == 0 ]] || {
    printf -- '--- sessao A ---\n' >&2; sed -n '1,120p' "$fa" >&2
    printf -- '--- sessao B ---\n' >&2; sed -n '1,120p' "$fb" >&2
    fail "a corrida saiu com erro (A=$st_a B=$st_b)"
  }
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

printf '== container: %s (imagem %s) ==\n' "$container_name" "$postgres_image"
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null
ready=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

cat > "$tmp_dir/prev_fn.sql" <<'SQL'
CREATE OR REPLACE FUNCTION public.find_or_create_direct_conversation(other_profile_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_my_profile_id uuid;
  v_conv_id uuid;
BEGIN
  v_my_profile_id := public.current_profile_id();
  IF v_my_profile_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF v_my_profile_id = other_profile_id THEN
    RAISE EXCEPTION 'cannot_create_direct_with_self';
  END IF;
  SELECT c.id INTO v_conv_id
  FROM public.team_conversations c
  JOIN public.team_conversation_members m1 ON m1.conversation_id = c.id AND m1.profile_id = v_my_profile_id
  JOIN public.team_conversation_members m2 ON m2.conversation_id = c.id AND m2.profile_id = other_profile_id
  WHERE c.type = 'direct'
  LIMIT 1;
  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;
  INSERT INTO public.team_conversations(type, created_by)
  VALUES ('direct', v_my_profile_id)
  RETURNING id INTO v_conv_id;
  INSERT INTO public.team_conversation_members(conversation_id, profile_id)
  VALUES (v_conv_id, v_my_profile_id), (v_conv_id, other_profile_id);
  RETURN v_conv_id;
END;
$function$;
SQL

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
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  name text
);

CREATE TABLE public.team_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'direct',
  name text,
  created_by uuid REFERENCES public.profiles(id),
  department_id uuid,
  direct_member_a uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  direct_member_b uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_conversations_type_check CHECK (type IN ('direct', 'group', 'department'))
);

CREATE UNIQUE INDEX idx_team_conversations_direct_pair
  ON public.team_conversations (direct_member_a, direct_member_b) WHERE type = 'direct';

CREATE TABLE public.team_conversation_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  member_role text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, profile_id)
);

CREATE FUNCTION public.current_profile_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $function$ SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1 $function$;

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$function$;
CREATE TRIGGER update_team_conversations_updated_at
  BEFORE UPDATE ON public.team_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
SQL
cat "$tmp_dir/pre.sql" "$tmp_dir/prev_fn.sql" > "$tmp_dir/schema.sql"
cat >> "$tmp_dir/schema.sql" <<'SQL'
REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.find_or_create_direct_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_or_create_direct_conversation(uuid) TO authenticated, service_role;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
INSERT INTO public.profiles (id, user_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Atila'),
  ('a0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Dora'),
  ('a0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'Eva'),
  ('a0000000-0000-0000-0000-000000000004', '44444444-4444-4444-4444-444444444444', 'Otto'),
  ('a0000000-0000-0000-0000-000000000005', '55555555-5555-5555-5555-555555555555', 'Maria'),
  ('a0000000-0000-0000-0000-000000000006', '66666666-6666-6666-6666-666666666666', 'Carlos'),
  ('a0000000-0000-0000-0000-000000000007', '77777777-7777-7777-7777-777777777777', 'Pedro'),
  ('a0000000-0000-0000-0000-000000000008', '88888888-8888-8888-8888-888888888888', 'Rita');

INSERT INTO public.team_conversations (id, type, created_by, created_at, updated_at) VALUES
  ('e0000000-0000-0000-0000-00000000000f', 'direct', 'a0000000-0000-0000-0000-000000000005', '2026-09-29T10:00:00Z', '2026-09-29T10:00:00Z');
INSERT INTO public.team_conversation_members (conversation_id, profile_id, joined_at) VALUES
  ('e0000000-0000-0000-0000-00000000000f', 'a0000000-0000-0000-0000-000000000005', '2026-09-29T10:00:00Z'),
  ('e0000000-0000-0000-0000-00000000000f', 'a0000000-0000-0000-0000-000000000006', '2026-09-29T10:00:00Z');
SQL

printf '\n──── O bloco Rollback do cabecalho e o corpo ANTERIOR ────\n'
python3 - "$migration" "$tmp_dir/prev_fn.sql" > "$tmp_dir/rollback_from_header.sql" <<'PY'
import sys
mig = open(sys.argv[1], encoding='utf-8').read().splitlines()
prev = open(sys.argv[2], encoding='utf-8').read().splitlines()
try:
    i = next(n for n, l in enumerate(mig) if l.strip() == '-- Rollback:')
except StopIteration:
    print('nao achei o bloco Rollback no cabecalho da migration', file=sys.stderr); raise SystemExit(1)
block = []
for l in mig[i + 1:]:
    if l.strip() == '-- Rollback-FIM':
        break
    if not l.startswith('--'):
        print('o bloco Rollback termina sem o marcador Rollback-FIM', file=sys.stderr); raise SystemExit(1)
    block.append(l[3:] if l.startswith('-- ') else l[2:])
if [x.rstrip() for x in block if x.strip()][:len([x for x in prev if x.strip()])] != [x.rstrip() for x in prev if x.strip()]:
    print('o corpo do cabecalho Rollback difere do corpo anterior', file=sys.stderr); raise SystemExit(1)
print('\n'.join(block))
PY
printf '[PASS] o bloco Rollback do cabecalho transcreve o corpo anterior\n'

psql_file "$tmp_dir/schema.sql" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

ATILA='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
DORA='{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'
EVA='{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}'
OTTO='{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}'
MARIA='{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}'
PEDRO='{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}'
RITA='{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}'
P_ATILA='a0000000-0000-0000-0000-000000000001'
P_DORA='a0000000-0000-0000-0000-000000000002'
P_EVA='a0000000-0000-0000-0000-000000000003'
P_OTTO='a0000000-0000-0000-0000-000000000004'
P_MARIA='a0000000-0000-0000-0000-000000000005'
P_CARLOS='a0000000-0000-0000-0000-000000000006'
P_PEDRO='a0000000-0000-0000-0000-000000000007'
P_RITA='a0000000-0000-0000-0000-000000000008'
C_LEGADA='e0000000-0000-0000-0000-00000000000f'
MD5_ANTES="$(fn_md5)"

printf '\n════════════ BLOCO A — estado ANTERIOR (defeito) ════════════\n'
SEQ_EVA="$(as_user "$EVA" "SELECT public.find_or_create_direct_conversation('$P_OTTO'::uuid);" | tail -n1)"
SEQ_EVA2="$(as_user "$EVA" "SELECT public.find_or_create_direct_conversation('$P_OTTO'::uuid);" | tail -n1)"
[[ "$SEQ_EVA" == "$SEQ_EVA2" ]] || fail "A1 controle sequencial devolveu ids diferentes"
printf '[PASS] A1 controle: chamada sequencial ja e idempotente (%s)\n' "$SEQ_EVA"
expect_count_pair 'A1b ...e existe UMA conversa direta entre Eva e Otto' '1' "$P_EVA" "$P_OTTO"
race "$ATILA" "$P_DORA" "$tmp_dir/race_a.out" "$DORA" "$P_ATILA" "$tmp_dir/race_b.out"
A_ID="$(uuid_of "$tmp_dir/race_a.out")"
B_ID="$(uuid_of "$tmp_dir/race_b.out")"
[[ -n "$A_ID" && -n "$B_ID" ]] || fail 'A2 a corrida nao devolveu id nas duas sessoes'
[[ "$A_ID" != "$B_ID" ]] || fail "A2 (DEFEITO) a corrida devolveu o MESMO id: o defeito nao reproduziu"
printf '[PASS] A2 (DEFEITO) a corrida devolveu DOIS ids distintos (%s x %s)\n' "$A_ID" "$B_ID"
expect_count_pair 'A3 (DEFEITO) ...e ficaram DUAS conversas diretas entre Atila e Dora' '2' "$P_ATILA" "$P_DORA"
expect_value 'A4 (DEFEITO) conversas criadas pela RPC antiga seguem sem par; indice fica inerte' '0' \
  "SELECT count(*) FROM public.team_conversations WHERE type = 'direct' AND direct_member_a IS NOT NULL AND id <> '$C_LEGADA';"

printf '\n════════════ Aplicando a migration REAL (%s) ════════════\n' "$(basename "$migration")"
psql_file "$migration" >/dev/null
MD5_DEPOIS_APLICAR="$(fn_md5)"
[[ "$MD5_DEPOIS_APLICAR" != "$MD5_ANTES" ]] || fail 'B0 a migration nao trocou a funcao'
printf '[PASS] B0 a migration aplicou limpa\n'

printf '\n════════════ BLOCO B — comportamento DEPOIS da migration ════════════\n'
race "$PEDRO" "$P_RITA" "$tmp_dir/race_c.out" "$RITA" "$P_PEDRO" "$tmp_dir/race_d.out"
C_ID="$(uuid_of "$tmp_dir/race_c.out")"
D_ID="$(uuid_of "$tmp_dir/race_d.out")"
[[ -n "$C_ID" && -n "$D_ID" ]] || fail 'B1 a corrida nao devolveu id nas duas sessoes'
[[ "$C_ID" == "$D_ID" ]] || fail "B1 (CORRECAO) a corrida ainda devolve ids diferentes ('$C_ID' x '$D_ID')"
printf '[PASS] B1 (CORRECAO) a corrida termina no MESMO id nas duas sessoes (%s)\n' "$C_ID"
expect_count_pair 'B1b ...e existe UMA conversa direta entre Pedro e Rita' '1' "$P_PEDRO" "$P_RITA"
expect_value 'B1c ...gravada com o par ordenado (a < b), como o indice compara' '1' \
  "SELECT count(*) FROM public.team_conversations WHERE id = '$C_ID' AND type = 'direct' AND direct_member_a IS NOT NULL AND direct_member_b IS NOT NULL AND direct_member_a::text < direct_member_b::text;"

expect_value_as 'B2 idempotencia preservada: conversa ja existente por par e devolvida' "$SEQ_EVA" "$EVA" \
  "SELECT public.find_or_create_direct_conversation('$P_OTTO'::uuid);"
expect_count_pair 'B2b ...sem criar uma segunda conversa entre Eva e Otto' '1' "$P_EVA" "$P_OTTO"
expect_value_as 'B3 caminho legado preservado: conversa sem par ainda e achada pelos MEMBROS' "$C_LEGADA" "$MARIA" \
  "SELECT public.find_or_create_direct_conversation('$P_CARLOS'::uuid);"
expect_count_pair 'B3b ...sem criar segunda conversa para Maria/Carlos' '1' "$P_MARIA" "$P_CARLOS"
expect_value 'B4 a migration nao deixa tabela de apoio persistente no schema' '0' \
  "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'team_conversations_direct_pair_backfill';"
expect_error_sql 'B5 a garantia e do BANCO: INSERT direto do mesmo par e recusado pelo indice unico parcial' \
  'duplicate key value violates unique constraint "idx_team_conversations_direct_pair"' \
  "INSERT INTO public.team_conversations (type, created_by, direct_member_a, direct_member_b)
   VALUES ('direct', '$P_PEDRO', '$P_PEDRO', '$P_RITA');"
expect_error_anon 'B6 ACL: anon NAO tem EXECUTE' \
  'permission denied for function find_or_create_direct_conversation' \
  "SELECT public.find_or_create_direct_conversation('$P_DORA'::uuid);"
expect_value 'B6b ACL: authenticated e service_role tem EXECUTE; PUBLIC e anon nao' '1' \
  "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'find_or_create_direct_conversation'
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND has_function_privilege('service_role', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE');"
expect_error_as 'B7 guarda preservada: sem JWT a RPC recusa com not_authenticated' \
  'not_authenticated' '{"role":"authenticated"}' \
  "SELECT public.find_or_create_direct_conversation('$P_DORA'::uuid);"
expect_error_as 'B7b guarda preservada: consigo mesmo a RPC recusa' \
  'cannot_create_direct_with_self' "$ATILA" \
  "SELECT public.find_or_create_direct_conversation('$P_ATILA'::uuid);"
expect_value 'B8 contrato inalterado: UMA assinatura, RETURNS uuid, SECURITY DEFINER, search_path public' '1' \
  "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'find_or_create_direct_conversation'
      AND p.pronargs = 1 AND pg_get_function_result(p.oid) = 'uuid' AND p.prosecdef
      AND p.proconfig = ARRAY['search_path=public'];"

printf '\n──── A guarda fail-closed da migration nao e vacua ────\n'
psql_sql 'DROP INDEX public.idx_team_conversations_direct_pair;' >/dev/null
expect_error_sql 'B9 sem o indice unico parcial a migration RECUSA aplicar (fail-closed)' \
  'exige o indice unico parcial' "$(cat "$migration")"
psql_sql "CREATE UNIQUE INDEX idx_team_conversations_direct_pair ON public.team_conversations (direct_member_a, direct_member_b) WHERE type = 'direct';" >/dev/null
expect_value 'B9b o indice voltou' '1' \
  "SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_team_conversations_direct_pair';"

printf '\n──── O Rollback do cabecalho roda e devolve o estado anterior ────\n'
psql_file "$tmp_dir/rollback_from_header.sql" >/dev/null
MD5_ROLLBACK="$(fn_md5)"
[[ "$MD5_ROLLBACK" == "$MD5_ANTES" ]] || fail "B10 o Rollback nao devolveu o corpo anterior da funcao"
printf '[PASS] B10 o Rollback devolve o corpo anterior da funcao (md5 identico ao do bloco A)\n'
expect_value 'B10b rollback nao deixa tabela de apoio (ela nunca e criada)' '0' \
  "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'team_conversations_direct_pair_backfill';"

printf '\nPASS: item 55 — a RPC de conversa direta voltou a ter protecao contra criacao concorrente COM garantia no banco (indice unico parcial), sem criar objeto persistente fora do schema canonico, sem mudar contrato, guardas nem ACL; o Rollback do cabecalho roda e devolve o corpo anterior.\n'
