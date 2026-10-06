#!/usr/bin/env bash
# Cartao t_f42f89e3 — as duas RPCs de membros do team chat `leave_team_group` e
# `remove_team_member` referenciavam a coluna INEXISTENTE `tcm.role` em
# public.team_conversation_members. A coluna real e `member_role` (migration 20260927270006;
# supabase/schema-manifest.json lista so member_role — nao existe `role` na tabela): em runtime o
# plpgsql estourava 42703 (column tcm.role does not exist) e os fluxos de SAIR DO GRUPO e REMOVER
# MEMBRO ficavam quebrados.
#
# Roteiro no MESMO container PostgreSQL 17 descartavel:
#   BLOCO A — corpo VIGENTE do repositorio, extraido VERBATIM de
#             20261003272707_reconcile_local_replay_with_canonical.sql (ultima definicao antes da
#             correcao, linhas 996-1049 e 1292-1344): as duas RPCs estouram 42703 no caminho
#             FELIZ. O defeito e provado no codigo real, nao numa copia do defeito.
#   BLOCO B — migration 20261005201340_fix_member_role_leave_remove_rpcs.sql aplicada: as duas RPCs
#             respondem, o contrato (assinatura/RETURNS jsonb/SECURITY DEFINER/search_path) nao
#             mudou e a autorizacao continua igual — so que lida de `member_role`: guardas de papel,
#             promocao do proximo dono GRAVANDO member_role='owner' e EXECUTE de anon fechado.
#   BLOCO C — extrai e EXECUTA o SQL completo entre `-- Rollback: ...` e `-- Rollback end.` da migration;
#             prova que as duas funcoes voltam aos corpos anteriores com `tcm.role`/`SET role`,
#             preservando assinatura, SECURITY DEFINER, search_path e ACL.
#
# TEAM_MEMBER_ROLE_TEST_MIGRATIONS_DIR existe para o teste de MUTACAO local (rodar contra uma copia
# do diretorio de migrations com a correcao desfeita): o BLOCO B tem de ficar VERMELHO. CI e uso
# normal apontam para o diretorio real do repo.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migrations_dir="${TEAM_MEMBER_ROLE_TEST_MIGRATIONS_DIR:-$repo_root/supabase/migrations}"
postgres_image="${TEAM_MEMBER_ROLE_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-team-member-role-test-$$"

# Ultima definicao das duas RPCs ANTES da correcao (bloco A) e a propria correcao (bloco B).
mig_antes="20261003272707_reconcile_local_replay_with_canonical.sql"
mig_fix="20261005201340_fix_member_role_leave_remove_rpcs.sql"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-team-member-role-test-[0-9]+$ ]]; then
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
expect_value_as() {
  local label="$1" expected="$2" jwt="$3" sql="$4" actual
  actual="$(as_user "$jwt" "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}
expect_error_as() {
  local label="$1" needle="$2" jwt="$3" sql="$4" output status
  set +e
  output="$(as_user "$jwt" "$sql" 2>&1)"; status=$?
  set -e
  (( status == 0 )) && { printf '%s\n' "$output" >&2; fail "$label: deveria falhar, mas passou"; }
  if [[ "$output" != *"$needle"* ]]; then
    printf '%s\n' "$output" >&2; fail "$label: esperava '$needle' no erro"
  fi
  printf '[PASS] %s\n' "$label"
}
expect_error() {
  local label="$1" needle="$2" sql="$3" output status
  set +e
  output="$(psql_sql "$sql" 2>&1)"; status=$?
  set -e
  (( status == 0 )) && { printf '%s\n' "$output" >&2; fail "$label: deveria falhar, mas passou"; }
  if [[ "$output" != *"$needle"* ]]; then
    printf '%s\n' "$output" >&2; fail "$label: esperava '$needle' no erro"
  fi
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'

# ── Guarda de vigencia ────────────────────────────────────────────────────────────────────────
# A extracao verbatim do BLOCO A so prova o defeito real enquanto o arquivo de origem for a ultima
# definicao anterior a correcao, e a correcao for a ultima definicao no repositorio.
[[ -f "$migrations_dir/$mig_antes" ]] || fail "guarda de vigencia: migration de origem nao encontrada ($mig_antes)"
[[ -f "$migrations_dir/$mig_fix" ]] || fail "guarda de vigencia: migration de correcao nao encontrada ($mig_fix)"
if grep -q 'tcm\.role' "$migrations_dir/$mig_antes"; then :; else
  fail "BLOCO A: $mig_antes nao contem 'tcm.role' — a definicao vigente mudou; revise este teste"
fi
if grep -v '^--' "$migrations_dir/$mig_fix" | grep -q 'tcm\.role'; then
  fail "$mig_fix ainda referencia tcm.role no SQL executavel"
fi
if grep -q 'member_role' "$migrations_dir/$mig_fix"; then :; else
  fail "$mig_fix nao usa member_role"
fi
while IFS= read -r rel; do
  [[ -n "$rel" ]] || continue
  if grep -qiE '(CREATE( OR REPLACE)? FUNCTION|DROP FUNCTION|ALTER FUNCTION)[^;]*public\.(leave_team_group|remove_team_member)' "$migrations_dir/$rel"; then
    fail "guarda de vigencia: $rel redefine as RPCs DEPOIS da correcao; atualize este teste"
  fi
done < <(cd "$migrations_dir" && ls -1 *.sql | sort | awk -v f="$mig_fix" '$0 > f')
printf '[PASS] vigencia: %s e a ultima definicao das RPCs ANTES da correcao; %s e a ultima depois\n' "$mig_antes" "$mig_fix"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# ── Schema minimo: roles, auth.*, tabelas stub ────────────────────────────────────────────────
# O CONTRATO testado (os corpos das duas RPCs) e extraido verbatim das migrations logo abaixo.
# As tabelas sao stubs com as colunas que as RPCs usam — e, de proposito, team_conversation_members
# NAO tem a coluna `role` (o contrato do banco e so `member_role`).
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
GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon, service_role;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE
);

CREATE TABLE public.team_conversations (
  id uuid PRIMARY KEY,
  type text NOT NULL DEFAULT 'group',
  name text,
  created_by uuid REFERENCES public.profiles(id)
);

-- Colunas conforme supabase/schema-manifest.json: NAO existe `role` (so `member_role`).
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
  AS $$ SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1 $$;
SQL

psql_file "$tmp_dir/pre.sql"

# ── BLOCO A: corpo VIGENTE do repositorio, extraido VERBATIM ──────────────────────────────────
extract_fn() { # $1=assinatura literal  $2=saida
  awk -v s="CREATE OR REPLACE FUNCTION public.$1" -v e='$function$;' \
    'index($0, s) {on=1} on {print} on && index($0, e) {exit}' "$migrations_dir/$mig_antes" > "$2"
  [[ -s "$2" ]] || fail "extracao vazia de $1 em $mig_antes"
  grep -q "CREATE OR REPLACE FUNCTION public.$1" "$2" || fail "extracao de $1 veio sem o CREATE"
  grep -q 'tcm\.role' "$2" || fail "extracao de $1 nao trouxe o corpo com o defeito"
}

extract_fn 'leave_team_group(p_conversation_id uuid)' "$tmp_dir/leave_vigente.sql"
extract_fn 'remove_team_member(p_conversation_id uuid, p_profile_id uuid)' "$tmp_dir/remove_vigente.sql"

cat "$tmp_dir/leave_vigente.sql" "$tmp_dir/remove_vigente.sql" > "$tmp_dir/rpcs_vigentes.sql"
cat >> "$tmp_dir/rpcs_vigentes.sql" <<'SQL'

-- ACL como no retrato da producao (manifest: postgres|service_role|authenticated EXECUTE; sem anon/PUBLIC)
REVOKE EXECUTE ON FUNCTION public.leave_team_group(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_team_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_team_group(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_team_member(uuid, uuid) TO authenticated, service_role;
SQL

psql_file "$tmp_dir/rpcs_vigentes.sql"

# Retrato canonico dos corpos anteriores, depois de o PostgreSQL compilar o SQL real da migration
# historica. O bloco C compara pg_get_functiondef depois do rollback, nao apenas trechos/regex.
leave_before_definition="$(psql_sql "SELECT pg_get_functiondef('public.leave_team_group(uuid)'::regprocedure)")"
remove_before_definition="$(psql_sql "SELECT pg_get_functiondef('public.remove_team_member(uuid, uuid)'::regprocedure)")"

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.team_conversation_members;
DELETE FROM public.team_conversations;
DELETE FROM public.profiles;

INSERT INTO public.profiles (id, user_id) VALUES
  ('aaaa0000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'), -- A: criador
  ('bbbb0000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222'), -- B: membro
  ('cccc0000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333'), -- C: membro
  ('dddd0000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444'); -- D: nao-membro

INSERT INTO public.team_conversations (id, type, name, created_by) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'group',  'G sair',           'aaaa0000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000002', 'group',  'G remover',        'aaaa0000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000003', 'group',  'G sozinho',        'cccc0000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000004', 'direct', 'D direta',         'aaaa0000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000005', 'group',  'G criador-membro', 'aaaa0000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000006', 'group',  'G promocao',       'aaaa0000-0000-0000-0000-000000000001');

-- joined_at deterministico: a promocao escolhe o membro de MENOR joined_at (ORDER BY joined_at ASC)
INSERT INTO public.team_conversation_members (conversation_id, profile_id, member_role, joined_at) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000001', 'owner',  '2026-09-01T10:00:00Z'),
  ('e0000000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-000000000001', 'member', '2026-09-02T10:00:00Z'),
  ('e0000000-0000-0000-0000-000000000001', 'cccc0000-0000-0000-0000-000000000001', 'member', '2026-09-03T10:00:00Z'),
  ('e0000000-0000-0000-0000-000000000002', 'aaaa0000-0000-0000-0000-000000000001', 'owner',  '2026-09-01T10:00:00Z'),
  ('e0000000-0000-0000-0000-000000000002', 'bbbb0000-0000-0000-0000-000000000001', 'member', '2026-09-02T10:00:00Z'),
  ('e0000000-0000-0000-0000-000000000002', 'cccc0000-0000-0000-0000-000000000001', 'member', '2026-09-03T10:00:00Z'),
  ('e0000000-0000-0000-0000-000000000003', 'cccc0000-0000-0000-0000-000000000001', 'owner',  '2026-09-01T10:00:00Z'),
  ('e0000000-0000-0000-0000-000000000004', 'aaaa0000-0000-0000-0000-000000000001', 'owner',  '2026-09-01T10:00:00Z'),
  ('e0000000-0000-0000-0000-000000000004', 'bbbb0000-0000-0000-0000-000000000001', 'owner',  '2026-09-02T10:00:00Z'),
  ('e0000000-0000-0000-0000-000000000005', 'aaaa0000-0000-0000-0000-000000000001', 'member', '2026-09-01T10:00:00Z'),
  ('e0000000-0000-0000-0000-000000000005', 'bbbb0000-0000-0000-0000-000000000001', 'owner',  '2026-09-02T10:00:00Z'),
  ('e0000000-0000-0000-0000-000000000006', 'aaaa0000-0000-0000-0000-000000000001', 'owner',  '2026-09-01T10:00:00Z'),
  ('e0000000-0000-0000-0000-000000000006', 'bbbb0000-0000-0000-0000-000000000001', 'member', '2026-09-02T10:00:00Z'),
  ('e0000000-0000-0000-0000-000000000006', 'cccc0000-0000-0000-0000-000000000001', 'member', '2026-09-03T10:00:00Z');
SQL

psql_file "$tmp_dir/seed.sql"

A='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
B='{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'
C='{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}'
D='{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}'
SEM_JWT='{"role":"authenticated"}'
G_SAIR='e0000000-0000-0000-0000-000000000001'
G_REMOVER='e0000000-0000-0000-0000-000000000002'
G_SOZINHO='e0000000-0000-0000-0000-000000000003'
G_DIRETA='e0000000-0000-0000-0000-000000000004'
G_CRIADOR_MEMBRO='e0000000-0000-0000-0000-000000000005'
G_PROMOCAO='e0000000-0000-0000-0000-000000000006'
PERFIL_A='aaaa0000-0000-0000-0000-000000000001'
PERFIL_B='bbbb0000-0000-0000-0000-000000000001'
PERFIL_C='cccc0000-0000-0000-0000-000000000001'
PERFIL_D='dddd0000-0000-0000-0000-000000000001'

echo '── BLOCO A: comportamento ANTES da correcao (defeito no codigo vigente) ──────────'

expect_value 'A0 o corpo vigente extraido do repo referencia tcm.role (leave)' '1' \
  "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='leave_team_group' AND p.prosrc LIKE '%tcm.role%'"
expect_value 'A0b o corpo vigente extraido do repo referencia tcm.role (remove)' '1' \
  "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='remove_team_member' AND p.prosrc LIKE '%tcm.role%'"

expect_error_as 'A1 (defeito) leave_team_group estoura no caminho feliz: column tcm.role does not exist' \
  'column tcm.role does not exist' "$A" \
  "SELECT public.leave_team_group('$G_SAIR'::uuid);"

expect_error_as 'A2 (defeito) remove_team_member estoura no caminho feliz: column tcm.role does not exist' \
  'column tcm.role does not exist' "$A" \
  "SELECT public.remove_team_member('$G_REMOVER'::uuid, '$PERFIL_B'::uuid);"

expect_value 'A3 controle: nenhum membro foi removido pelo defeito (a transacao abortou)' '3' \
  "SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$G_SAIR'"

expect_error 'A4 fronteira preservada: anon nao executa leave_team_group' \
  'permission denied for function leave_team_group' \
  "SET ROLE anon; SELECT public.leave_team_group('$G_SAIR'::uuid);"
expect_error 'A5 fronteira preservada: anon nao executa remove_team_member' \
  'permission denied for function remove_team_member' \
  "SET ROLE anon; SELECT public.remove_team_member('$G_REMOVER'::uuid, '$PERFIL_B'::uuid);"

echo
echo "── Aplicando a correcao ($mig_fix) ───────────────────────────────────────────────"
psql_file "$migrations_dir/$mig_fix"
psql_file "$tmp_dir/seed.sql"

echo
echo '── BLOCO B: comportamento DEPOIS da correcao ────────────────────────────────────'

# Contrato do banco (nao so comportamento): os corpos passaram a ler member_role, sumiram de tcm.role
expect_value 'B0 leave_team_group le member_role e nao referencia mais tcm.role' '1' \
  "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='leave_team_group' AND p.pronargs=1 AND p.prosecdef AND p.prosrc LIKE '%member_role%' AND p.prosrc NOT LIKE '%tcm.role%'"
expect_value 'B0b remove_team_member le member_role e nao referencia mais tcm.role' '1' \
  "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='remove_team_member' AND p.pronargs=2 AND p.prosecdef AND p.prosrc LIKE '%member_role%' AND p.prosrc NOT LIKE '%tcm.role%'"
expect_value 'B0c contrato inalterado: assinatura/retorno de leave_team_group' '1' \
  "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='leave_team_group' AND pg_get_function_arguments(p.oid)='p_conversation_id uuid' AND pg_get_function_result(p.oid)='jsonb'"
expect_value 'B0d contrato inalterado: assinatura/retorno de remove_team_member' '1' \
  "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='remove_team_member' AND pg_get_function_arguments(p.oid)='p_conversation_id uuid, p_profile_id uuid' AND pg_get_function_result(p.oid)='jsonb'"
expect_value 'B0e o search_path continua fechado em public nas duas RPCs (sem estouro de schema)' '2' \
  "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('leave_team_group','remove_team_member') AND p.proconfig @> ARRAY['search_path=public']"

# Sair do grupo — caminho feliz do membro simples (uma unica chamada da RPC)
expect_value_as 'B1 membro comum sai do grupo (left=true, grupo permanece)' 'true|false' \
  "$B" "SELECT (r ->> 'left') || '|' || (r ->> 'group_deleted') FROM (SELECT public.leave_team_group('$G_SAIR'::uuid) AS r) s;"
expect_value 'B1b a linha do membro foi removida (2 membros restantes)' '2' \
  "SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$G_SAIR'"
expect_value 'B1c o membro que saiu nao esta mais na tabela' '0' \
  "SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$G_SAIR' AND profile_id='$PERFIL_B'"

# Promocao do ultimo owner: grava member_role = 'owner' (antes gravava a coluna inexistente `role`)
expect_value_as 'B2 dono unico sai e o proximo (joined_at mais antigo) vira new_owner' "$PERFIL_B" \
  "$A" "SELECT public.leave_team_group('$G_PROMOCAO'::uuid) ->> 'new_owner';"
expect_value 'B2b a promocao gravou member_role=owner (coluna real)' 'owner' \
  "SELECT member_role FROM public.team_conversation_members WHERE conversation_id='$G_PROMOCAO' AND profile_id='$PERFIL_B'"
expect_value 'B2c o novo dono e o unico owner do grupo' '1' \
  "SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$G_PROMOCAO' AND member_role='owner'"
expect_value_as 'B2d autorizacao lida de member_role: o promovido (nao-criador) consegue remover' 'true' \
  "$B" "SELECT public.remove_team_member('$G_PROMOCAO'::uuid, '$PERFIL_C'::uuid) ->> 'removed';"

# Ultimo membro saindo apaga o grupo
expect_value_as 'B3 ultimo membro saindo apaga o grupo (group_deleted=true)' 'true' \
  "$C" "SELECT public.leave_team_group('$G_SOZINHO'::uuid) ->> 'group_deleted';"
expect_value 'B3b a conversa orfa foi apagada' '0' \
  "SELECT count(*) FROM public.team_conversations WHERE id='$G_SOZINHO'"

# Guardas de leave continuam as mesmas
expect_error_as 'B4 guarda preservada: quem nao e membro recebe not_a_member' 'not_a_member' \
  "$D" "SELECT public.leave_team_group('$G_SAIR'::uuid);"
expect_error_as 'B5 guarda preservada: conversa direct recebe not_a_group_conversation' 'not_a_group_conversation' \
  "$A" "SELECT public.leave_team_group('$G_DIRETA'::uuid);"
expect_error_as 'B6 guarda preservada: sem JWT recebe not_authenticated' 'not_authenticated' \
  "$SEM_JWT" "SELECT public.leave_team_group('$G_SAIR'::uuid);"

# Remover membro — caminho feliz do criador (uma unica chamada da RPC)
expect_value_as 'B7 o criador remove um membro (removed=true, grupo permanece)' 'true|false' \
  "$A" "SELECT (r ->> 'removed') || '|' || (r ->> 'group_deleted') FROM (SELECT public.remove_team_member('$G_REMOVER'::uuid, '$PERFIL_B'::uuid) AS r) s;"
expect_value 'B7b o membro removido saiu da tabela' '0' \
  "SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$G_REMOVER' AND profile_id='$PERFIL_B'"

# Guardas de remove continuam as mesmas
expect_error_as 'B8 guarda preservada: ninguem remove a si mesmo' 'cannot_remove_self' \
  "$A" "SELECT public.remove_team_member('$G_REMOVER'::uuid, '$PERFIL_A'::uuid);"
expect_error_as 'B9 guarda preservada: membro comum nao remove ninguem' 'not_authorized' \
  "$C" "SELECT public.remove_team_member('$G_REMOVER'::uuid, '$PERFIL_A'::uuid);"
expect_error_as 'B10 guarda preservada: quem nao e membro recebe actor_not_a_member' 'actor_not_a_member' \
  "$D" "SELECT public.remove_team_member('$G_REMOVER'::uuid, '$PERFIL_A'::uuid);"
expect_error_as 'B11 guarda preservada: alvo que nao e membro recebe target_not_a_member' 'target_not_a_member' \
  "$A" "SELECT public.remove_team_member('$G_REMOVER'::uuid, '$PERFIL_D'::uuid);"
expect_error_as 'B12 guarda lida de member_role: criador (member_role=member) nao remove um owner' 'cannot_remove_owner' \
  "$A" "SELECT public.remove_team_member('$G_CRIADOR_MEMBRO'::uuid, '$PERFIL_B'::uuid);"
expect_error_as 'B13 guarda preservada: conversa direct recebe not_a_group_conversation' 'not_a_group_conversation' \
  "$A" "SELECT public.remove_team_member('$G_DIRETA'::uuid, '$PERFIL_B'::uuid);"
expect_error_as 'B14 guarda preservada: sem JWT recebe not_authenticated' 'not_authenticated' \
  "$SEM_JWT" "SELECT public.remove_team_member('$G_REMOVER'::uuid, '$PERFIL_C'::uuid);"

# Ultimo membro removido NAO apaga o grupo: o ator e sempre membro (actor_not_a_member vem antes),
# entao depois de remover o alvo sobra pelo menos a linha do proprio ator. O ramo
# `IF v_total_count = 0` de remove_team_member e, por desenho, inalcancavel — comportamento
# OBSERVADO aqui e registrado como achado no cartao (nao e o escopo desta correcao; o corpo e o
# mesmo desde 20260929430000, so o nome da coluna mudou).
expect_value_as 'B15 remover o ultimo outro membro nao apaga o grupo (group_deleted=false)' 'true|false' \
  "$A" "SELECT (r ->> 'removed') || '|' || (r ->> 'group_deleted') FROM (SELECT public.remove_team_member('$G_REMOVER'::uuid, '$PERFIL_C'::uuid) AS r) s;"
expect_value 'B15b sobrou so o criador na conversa (ramo group_deleted e inalcancavel por desenho)' '1|1' \
  "SELECT (SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$G_REMOVER') || '|' || (SELECT count(*) FROM public.team_conversations WHERE id='$G_REMOVER')"

# Fronteira de EXECUTE preservada (a correcao nao abriu anon/PUBLIC)
expect_error 'B16 anon continua sem EXECUTE em leave_team_group' \
  'permission denied for function leave_team_group' \
  "SET ROLE anon; SELECT public.leave_team_group('$G_SAIR'::uuid);"
expect_error 'B17 anon continua sem EXECUTE em remove_team_member' \
  'permission denied for function remove_team_member' \
  "SET ROLE anon; SELECT public.remove_team_member('$G_SAIR'::uuid, '$PERFIL_A'::uuid);"
expect_value 'B18 authenticated tem EXECUTE nas duas RPCs (fronteira intacta)' 'true|true' \
  "SELECT has_function_privilege('authenticated','public.leave_team_group(uuid)','EXECUTE') || '|' || has_function_privilege('authenticated','public.remove_team_member(uuid, uuid)','EXECUTE')"
expect_value 'B19 anon nao tem EXECUTE nas duas RPCs' 'false|false' \
  "SELECT has_function_privilege('anon','public.leave_team_group(uuid)','EXECUTE') || '|' || has_function_privilege('anon','public.remove_team_member(uuid, uuid)','EXECUTE')"

echo
echo '── BLOCO C: rollback executavel restaura integralmente os corpos anteriores ──────'

rollback_sql="$tmp_dir/rollback.sql"
set +e
awk '
  /^-- Rollback:/ { in_rollback=1; found_start=1; next }
  /^-- Rollback end\.$/ { if (in_rollback) found_end=1; exit }
  in_rollback {
    if ($0 !~ /^--( |$)/) exit 43
    sub(/^-- ?/, "")
    print
  }
  END {
    if (!found_start) exit 41
    if (!found_end) exit 42
  }
' "$migrations_dir/$mig_fix" > "$rollback_sql"
rollback_extract_status=$?
set -e
(( rollback_extract_status == 0 )) || fail 'C0 o bloco Rollback nao contem SQL executavel completo entre os marcadores'
grep -q '^CREATE OR REPLACE FUNCTION public.leave_team_group' "$rollback_sql" \
  || fail 'C0 rollback nao recria leave_team_group'
grep -q '^CREATE OR REPLACE FUNCTION public.remove_team_member' "$rollback_sql" \
  || fail 'C0 rollback nao recria remove_team_member'
grep -q 'tcm\.role' "$rollback_sql" \
  || fail 'C0 rollback nao contem os corpos anteriores com tcm.role'

psql_file "$rollback_sql"
psql_file "$tmp_dir/seed.sql"

leave_after_rollback="$(psql_sql "SELECT pg_get_functiondef('public.leave_team_group(uuid)'::regprocedure)")"
remove_after_rollback="$(psql_sql "SELECT pg_get_functiondef('public.remove_team_member(uuid, uuid)'::regprocedure)")"
[[ "$leave_after_rollback" == "$leave_before_definition" ]] \
  || fail 'C1 rollback nao restaurou integralmente a definicao anterior de leave_team_group'
printf '[PASS] C1 rollback restaurou integralmente a definicao anterior de leave_team_group\n'
[[ "$remove_after_rollback" == "$remove_before_definition" ]] \
  || fail 'C2 rollback nao restaurou integralmente a definicao anterior de remove_team_member'
printf '[PASS] C2 rollback restaurou integralmente a definicao anterior de remove_team_member\n'
expect_value 'C3 rollback preservou assinaturas, retorno jsonb e search_path' '2' \
  "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND ((p.proname='leave_team_group' AND pg_get_function_arguments(p.oid)='p_conversation_id uuid') OR (p.proname='remove_team_member' AND pg_get_function_arguments(p.oid)='p_conversation_id uuid, p_profile_id uuid')) AND pg_get_function_result(p.oid)='jsonb' AND p.proconfig @> ARRAY['search_path=public']"
expect_value 'C4 rollback preservou ACL (authenticated sim; anon nao)' 'true|true|false|false' \
  "SELECT has_function_privilege('authenticated','public.leave_team_group(uuid)','EXECUTE') || '|' || has_function_privilege('authenticated','public.remove_team_member(uuid, uuid)','EXECUTE') || '|' || has_function_privilege('anon','public.leave_team_group(uuid)','EXECUTE') || '|' || has_function_privilege('anon','public.remove_team_member(uuid, uuid)','EXECUTE')"
expect_error_as 'C5 rollback executado: leave_team_group voltou ao erro anterior em tcm.role' \
  'column tcm.role does not exist' "$A" \
  "SELECT public.leave_team_group('$G_SAIR'::uuid);"
expect_error_as 'C6 rollback executado: remove_team_member voltou ao erro anterior em tcm.role' \
  'column tcm.role does not exist' "$A" \
  "SELECT public.remove_team_member('$G_REMOVER'::uuid, '$PERFIL_B'::uuid);"

printf '\n[OK] member_role nas RPCs e rollback executavel verificados no PostgreSQL local (A=antes, B=correcao, C=rollback)\n'
