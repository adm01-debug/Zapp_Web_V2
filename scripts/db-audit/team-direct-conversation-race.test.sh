#!/usr/bin/env bash
# Item 55 do BACKLOG_VERIFICADO (P1 funcional) — a RPC ativa que cria conversa DIRETA perdeu a
# protecao contra criacao concorrente: 20260929190000 (E29) e 20261003272707 (reconciliacao)
# recriaram public.find_or_create_direct_conversation sem gravar direct_member_a/b e sem
# ON CONFLICT, entao a corrida voltou a ser decidida por consulta-antes-de-inserir. O indice
# unico parcial idx_team_conversations_direct_pair (20260927270007) continua no banco, inerte.
#
# Roda o MESMO roteiro no mesmo container, em dois blocos:
#   BLOCO A — estado ANTERIOR (defeito), fiel ao canonico de 03/10: a chamada sequencial e
#             idempotente, mas DUAS chamadas concorrentes criam DUAS conversas diretas entre as
#             mesmas pessoas, e NENHUMA conversa direta carrega o par que o indice compara.
#   BLOCO B — migration real aplicada: a corrida termina em UMA conversa (o indice unico parcial
#             decide), o par ordenado e gravado, o backfill cobre as conversas legadas sem
#             estourar com o par duplicado que a corrida ja produziu, o caminho da conversa
#             legada por MEMBROS continua valendo, as guardas e a ACL seguem iguais, a guarda da
#             migration e fail-closed e o Rollback escrito no cabecalho roda e devolve o estado.
#
# A corrida e real (duas sessoes psql, transacoes abertas ao mesmo tempo), nao simulada: a sessao
# A chama a RPC e segura a transacao (pg_sleep) e a sessao B chama depois dela ter inserido.
# Nada da funcao e copiado para o teste: o BLOCO B aplica o ARQUIVO de supabase/migrations/.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261006152414_team_chat_direct_conversation_race_guard.sql"
postgres_image="${TEAM_DIRECT_RACE_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-team-direct-race-test-$$"
# folga larga: A insere (milissegundos), segura a transacao por HOLD e B entra OFFSET depois.
HOLD="${TEAM_DIRECT_RACE_TEST_HOLD:-4}"
OFFSET="${TEAM_DIRECT_RACE_TEST_OFFSET:-1.5}"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-team-direct-race-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_stdin() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }

as_user() { # as_user <jwt> <sql>  — roda como o PAPEL REAL authenticated, com o JWT do usuario
  local jwt="$1" sql="$2"
  printf "SET ROLE authenticated;\nSET request.jwt.claims = '%s';\n%s\n" "$jwt" "$sql" | psql_stdin
}
as_anon() { # as_anon <sql>  — roda como o PAPEL REAL anon (sem JWT)
  printf "SET ROLE anon;\n%s\n" "$1" | psql_stdin
}

uuid_of() { grep -Eo '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' "$1" 2>/dev/null | tail -n1 || true; }

expect_value() { # expect_value <rotulo> <esperado> <sql>
  local l="$1" e="$2" s="$3" a
  a="$(psql_sql "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_value_as() { # expect_value_as <rotulo> <esperado> <jwt> <sql>
  local l="$1" e="$2" j="$3" s="$4" a
  a="$(as_user "$j" "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_error_sql() { # expect_error_sql <rotulo> <trecho do erro> <sql>
  local l="$1" needle="$2" s="$3" out st
  set +e; out="$(psql_sql "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}
expect_error_as() { # expect_error_as <rotulo> <trecho do erro> <jwt> <sql>
  local l="$1" needle="$2" j="$3" s="$4" out st
  set +e; out="$(as_user "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}
expect_error_anon() { # expect_error_anon <rotulo> <trecho do erro> <sql>
  local l="$1" needle="$2" s="$3" out st
  set +e; out="$(as_anon "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}

count_pair() { # count_pair <profile_a> <profile_b> — conversas diretas entre os dois (pelos MEMBROS)
  psql_sql "SELECT count(*) FROM public.team_conversations c
              JOIN public.team_conversation_members m1 ON m1.conversation_id = c.id AND m1.profile_id = '$1'
              JOIN public.team_conversation_members m2 ON m2.conversation_id = c.id AND m2.profile_id = '$2'
             WHERE c.type = 'direct';" | tail -n1
}
fn_md5() { psql_sql "SELECT md5(pg_get_functiondef('public.find_or_create_direct_conversation(uuid)'::regprocedure));" | tail -n1; }

expect_count_pair() { # expect_count_pair <rotulo> <esperado> <profile_a> <profile_b>
  local l="$1" e="$2" got
  got="$(count_pair "$3" "$4")"
  [[ "$got" == "$e" ]] || fail "$l: esperado '$e', obtido '$got'"
  printf '[PASS] %s\n' "$l"
}

race() { # race <jwt_a> <alvo_a> <arquivo_a> <jwt_b> <alvo_b> <arquivo_b>
  local ja="$1" oa="$2" fa="$3" jb="$4" ob="$5" fb="$6" pid_a st_b
  printf "SET ROLE authenticated;\nSET request.jwt.claims = '%s';\nBEGIN;\nSELECT public.find_or_create_direct_conversation('%s'::uuid);\nSELECT pg_sleep(%s);\nCOMMIT;\n" \
    "$ja" "$oa" "$HOLD" | psql_stdin > "$fa" 2>&1 &
  pid_a=$!
  sleep "$OFFSET"
  set +e
  printf "SET ROLE authenticated;\nSET request.jwt.claims = '%s';\nBEGIN;\nSELECT public.find_or_create_direct_conversation('%s'::uuid);\nCOMMIT;\n" \
    "$jb" "$ob" | psql_stdin > "$fb" 2>&1
  st_b=$?
  wait "$pid_a"; local st_a=$?
  set -e
  [[ "$st_a" == 0 && "$st_b" == 0 ]] || {
    printf -- '--- sessao A ---\n'; cat "$fa" >&2
    printf -- '--- sessao B ---\n'; cat "$fb" >&2
    fail "a corrida saiu com erro (A=$st_a B=$st_b); o defeito/correcao tem de terminar bem nas duas sessoes"
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

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# ---------------------------------------------------------------------------------------------
# Estado ANTERIOR da funcao (recriado aqui como FIXTURE do defeito; o BLOCO B aplica a migration
# de verdade). Estas linhas sao as MESMAS que o bloco R1 do cabecalho da migration -- o teste
# confere isso abaixo, entao o Rollback escrito e o corpo anterior de verdade, nao uma promessa.
# ---------------------------------------------------------------------------------------------
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

cat > "$tmp_dir/pre_head.sql" <<'SQL'
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

-- fiel ao canonico (20260927270007, E16): ESTA e a garantia de banco que a RPC passa a usar.
-- O indice existe no banco canonico (supabase/schema-manifest.json) e a migration o exige.
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

-- trigger canonico (20260402130912): reescreve updated_at em QUALQUER update da conversa
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

cat > "$tmp_dir/pre_tail.sql" <<'SQL'
REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.find_or_create_direct_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_or_create_direct_conversation(uuid) TO authenticated, service_role;
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.team_conversations TO authenticated;
GRANT SELECT ON public.team_conversation_members TO authenticated;
SQL

cat "$tmp_dir/pre_head.sql" "$tmp_dir/prev_fn.sql" "$tmp_dir/pre_tail.sql" > "$tmp_dir/pre.sql"

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.team_conversation_members;
DELETE FROM public.team_conversations;
DELETE FROM public.profiles;

INSERT INTO public.profiles (id, user_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Atila'),
  ('a0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Dora'),
  ('a0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'Eva'),
  ('a0000000-0000-0000-0000-000000000004', '44444444-4444-4444-4444-444444444444', 'Otto'),
  ('a0000000-0000-0000-0000-000000000005', '55555555-5555-5555-5555-555555555555', 'Maria'),
  ('a0000000-0000-0000-0000-000000000006', '66666666-6666-6666-6666-666666666666', 'Carlos'),
  ('a0000000-0000-0000-0000-000000000007', '77777777-7777-7777-7777-777777777777', 'Pedro'),
  ('a0000000-0000-0000-0000-000000000008', '88888888-8888-8888-8888-888888888888', 'Rita'),
  ('a0000000-0000-0000-0000-000000000009', '99999999-9999-9999-9999-999999999999', 'Sofia'),
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tiago'),
  ('a0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Laura'),
  ('a0000000-0000-0000-0000-00000000000c', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Nuno');

-- Conversa direta LEGADA (como as que a E29/reconciliacao criaram): existe pelos MEMBROS e
-- ficou SEM o par gravado. updated_at antigo de proposito, para medir o efeito do backfill.
INSERT INTO public.team_conversations (id, type, created_by, created_at, updated_at) VALUES
  ('e0000000-0000-0000-0000-00000000000f', 'direct', 'a0000000-0000-0000-0000-000000000005', '2026-09-29T10:00:00Z', '2026-09-29T10:00:00Z');
INSERT INTO public.team_conversation_members (conversation_id, profile_id, joined_at) VALUES
  ('e0000000-0000-0000-0000-00000000000f', 'a0000000-0000-0000-0000-000000000005', '2026-09-29T10:00:00Z'),
  ('e0000000-0000-0000-0000-00000000000f', 'a0000000-0000-0000-0000-000000000006', '2026-09-29T10:00:00Z');

-- Par que ja tinha direct_member_a/b gravado (como uma conversa criada pela RPC do E28) E uma
-- conversa legada sem par para o mesmo par. A migration precisa manter a legada como esta:
-- se tentar backfill nela, o UPDATE viola idx_team_conversations_direct_pair.
INSERT INTO public.team_conversations (id, type, created_by, direct_member_a, direct_member_b, created_at, updated_at) VALUES
  ('e0000000-0000-0000-0000-00000000000d', 'direct', 'a0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000c', '2026-09-29T11:00:00Z', '2026-09-29T11:00:00Z'),
  ('e0000000-0000-0000-0000-00000000000c', 'direct', 'a0000000-0000-0000-0000-00000000000b', NULL, NULL, '2026-09-29T11:01:00Z', '2026-09-29T11:01:00Z');
INSERT INTO public.team_conversation_members (conversation_id, profile_id, joined_at) VALUES
  ('e0000000-0000-0000-0000-00000000000d', 'a0000000-0000-0000-0000-00000000000b', '2026-09-29T11:00:00Z'),
  ('e0000000-0000-0000-0000-00000000000d', 'a0000000-0000-0000-0000-00000000000c', '2026-09-29T11:00:00Z'),
  ('e0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-00000000000b', '2026-09-29T11:01:00Z'),
  ('e0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-00000000000c', '2026-09-29T11:01:00Z');

-- Conversa direta legada de TRES membros (o backfill do par nao cobre: nao e um par): e o
-- caminho em que a RPC precisa continuar achando a conversa pelos MEMBROS.
INSERT INTO public.team_conversations (id, type, created_by, created_at, updated_at) VALUES
  ('e0000000-0000-0000-0000-00000000000e', 'direct', 'a0000000-0000-0000-0000-000000000009', '2026-09-30T10:00:00Z', '2026-09-30T10:00:00Z');
INSERT INTO public.team_conversation_members (conversation_id, profile_id) VALUES
  ('e0000000-0000-0000-0000-00000000000e', 'a0000000-0000-0000-0000-000000000009'),
  ('e0000000-0000-0000-0000-00000000000e', 'a0000000-0000-0000-0000-00000000000a'),
  ('e0000000-0000-0000-0000-00000000000e', 'a0000000-0000-0000-0000-000000000004');
SQL

# ---------------------------------------------------------------------------------------------
# O Rollback do cabecalho e o corpo anterior de verdade?
# ---------------------------------------------------------------------------------------------
printf '\n──── O bloco R1 do cabecalho (Rollback da funcao) e o corpo ANTERIOR ────\n'
python3 - "$migration" "$tmp_dir/prev_fn.sql" <<'PY'
import sys
mig = open(sys.argv[1], encoding='utf-8').read().splitlines()
prev = open(sys.argv[2], encoding='utf-8').read().splitlines()
try:
    i = next(n for n, l in enumerate(mig) if l.startswith('-- R1)'))
except StopIteration:
    print('nao achei o bloco R1 no cabecalho da migration', file=sys.stderr); raise SystemExit(1)
bloco = []
for l in mig[i + 1:]:
    if l.strip() == '-- R1-FIM':
        break
    if not l.startswith('--'):
        print('o bloco R1 termina sem o marcador R1-FIM: %r' % l, file=sys.stderr); raise SystemExit(1)
    bloco.append(l[3:] if l.startswith('-- ') else l[2:])
norm = lambda ls: [x.rstrip() for x in ls if x.strip()]
a, b = norm(bloco), norm(prev)
if a != b:
    print('o corpo do cabecalho (R1) difere do corpo anterior:', file=sys.stderr)
    for x, y in zip(a, b):
        if x != y:
            print('  cabecalho: %r\n  anterior : %r' % (x, y)); break
    print('  linhas: %d x %d' % (len(a), len(b)), file=sys.stderr)
    raise SystemExit(1)
print('[PASS] o Rollback escrito no cabecalho transcreve o corpo anterior (%d linhas)' % len(a))
PY

psql_file "$tmp_dir/pre.sql" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

ATILA='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
DORA='{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'
EVA='{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}'
OTTO='{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}'
MARIA='{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}'
CARLOS='{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}'
PEDRO='{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}'
RITA='{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}'
SOFIA='{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}'
TIAGO='{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}'
LAURA='{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}'

P_ATILA='a0000000-0000-0000-0000-000000000001'
P_DORA='a0000000-0000-0000-0000-000000000002'
P_EVA='a0000000-0000-0000-0000-000000000003'
P_OTTO='a0000000-0000-0000-0000-000000000004'
P_MARIA='a0000000-0000-0000-0000-000000000005'
P_CARLOS='a0000000-0000-0000-0000-000000000006'
P_PEDRO='a0000000-0000-0000-0000-000000000007'
P_RITA='a0000000-0000-0000-0000-000000000008'
P_SOFIA='a0000000-0000-0000-0000-000000000009'
P_TIAGO='a0000000-0000-0000-0000-00000000000a'
P_LAURA='a0000000-0000-0000-0000-00000000000b'
P_NUNO='a0000000-0000-0000-0000-00000000000c'
C_PAIR_EXISTENTE='e0000000-0000-0000-0000-00000000000d'
C_LEGADA_MESMO_PAR='e0000000-0000-0000-0000-00000000000c'
C_LEGADA='e0000000-0000-0000-0000-00000000000f'
C_TRIO='e0000000-0000-0000-0000-00000000000e'

MD5_ANTES="$(fn_md5)"

printf '\n════════════ BLOCO A — estado ANTERIOR (defeito, fiel ao canonico de 03/10) ════════════\n'

SEQ_EVA="$(as_user "$EVA" "SELECT public.find_or_create_direct_conversation('$P_OTTO'::uuid);" | tail -n1)"
SEQ_EVA2="$(as_user "$EVA" "SELECT public.find_or_create_direct_conversation('$P_OTTO'::uuid);" | tail -n1)"
[[ "$SEQ_EVA" == "$SEQ_EVA2" ]] || fail "A1 controle: a chamada sequencial devolveu ids diferentes ('$SEQ_EVA' x '$SEQ_EVA2')"
printf '[PASS] A1 controle: a chamada sequencial ja e idempotente (%s)\n' "$SEQ_EVA"
expect_count_pair 'A1b ...e existe UMA conversa direta entre Eva e Otto' '1' "$P_EVA" "$P_OTTO"

race "$ATILA" "$P_DORA" "$tmp_dir/race_a.out" "$DORA" "$P_ATILA" "$tmp_dir/race_b.out"
A_ID="$(uuid_of "$tmp_dir/race_a.out")"
B_ID="$(uuid_of "$tmp_dir/race_b.out")"
[[ -n "$A_ID" && -n "$B_ID" ]] || { cat "$tmp_dir/race_a.out" "$tmp_dir/race_b.out" >&2; fail 'A2 a corrida nao devolveu id nas duas sessoes'; }
[[ "$A_ID" != "$B_ID" ]] || fail "A2 (DEFEITO) a corrida devolveu o MESMO id ('$A_ID'): o defeito nao reproduziu"
printf '[PASS] A2 (DEFEITO) a corrida devolveu DOIS ids distintos (%s x %s)\n' "$A_ID" "$B_ID"
expect_count_pair 'A3 (DEFEITO) ...e ficaram DUAS conversas diretas entre Atila e Dora' '2' "$P_ATILA" "$P_DORA"

LEGACY_ID="$(as_user "$MARIA" "SELECT public.find_or_create_direct_conversation('$P_CARLOS'::uuid);" | tail -n1)"
[[ "$LEGACY_ID" == "$C_LEGADA" ]] || fail "A4 caminho legado: esperava a conversa semeada $C_LEGADA, veio '$LEGACY_ID'"
printf '[PASS] A4 caminho legado: a conversa sem o par gravado e devolvida pelos membros\n'
expect_count_pair 'A4b ...e continua UMA so conversa entre Maria e Carlos' '1' "$P_MARIA" "$P_CARLOS"

expect_value 'A5 (DEFEITO) nenhuma conversa criada pela RPC antiga carrega o par: o indice unico parcial esta inerte' '0' \
  "SELECT count(*) FROM public.team_conversations WHERE type = 'direct' AND direct_member_a IS NOT NULL AND id <> '$C_PAIR_EXISTENTE';"

printf '\n════════════ Aplicando a migration REAL (%s) ════════════\n' "$(basename "$migration")"
psql_file "$migration" >/dev/null
MD5_DEPOIS_APLICAR="$(fn_md5)"
[[ "$MD5_DEPOIS_APLICAR" != "$MD5_ANTES" ]] || fail 'B0 a migration nao trocou a funcao (md5 igual ao do estado anterior)'
printf '[PASS] B0 a migration aplicou limpa (inclusive com o par duplicado que a corrida deixou)\n'

printf '\n════════════ BLOCO B — comportamento DEPOIS da migration ════════════\n'

race "$PEDRO" "$P_RITA" "$tmp_dir/race_c.out" "$RITA" "$P_PEDRO" "$tmp_dir/race_d.out"
C_ID="$(uuid_of "$tmp_dir/race_c.out")"
D_ID="$(uuid_of "$tmp_dir/race_d.out")"
[[ -n "$C_ID" && -n "$D_ID" ]] || { cat "$tmp_dir/race_c.out" "$tmp_dir/race_d.out" >&2; fail 'B1 a corrida nao devolveu id nas duas sessoes'; }
[[ "$C_ID" == "$D_ID" ]] || fail "B1 (CORRECAO) a corrida ainda devolve ids diferentes ('$C_ID' x '$D_ID')"
printf '[PASS] B1 (CORRECAO) a corrida termina no MESMO id nas duas sessoes (%s)\n' "$C_ID"
expect_count_pair 'B1b ...e existe UMA conversa direta entre Pedro e Rita' '1' "$P_PEDRO" "$P_RITA"
expect_value 'B1c ...gravada com o par ordenado (a < b), como o indice compara' '1' \
  "SELECT count(*) FROM public.team_conversations WHERE id = '$C_ID' AND type = 'direct' AND direct_member_a IS NOT NULL AND direct_member_b IS NOT NULL AND direct_member_a::text < direct_member_b::text;"

expect_value_as 'B2 idempotencia preservada: a RPC devolve a conversa que ja existia' "$SEQ_EVA" "$EVA" \
  "SELECT public.find_or_create_direct_conversation('$P_OTTO'::uuid);"
expect_count_pair 'B2b ...sem criar uma segunda conversa entre Eva e Otto' '1' "$P_EVA" "$P_OTTO"

expect_value 'B3 backfill: as 3 conversas legadas de 2 membros receberam o par (a duplicada da corrida, so uma)' '3' \
  "SELECT count(*) FROM public.team_conversations_direct_pair_backfill;"
expect_value 'B3c ...a conversa Maria/Carlos tem o par gravado' '1' \
  "SELECT count(*) FROM public.team_conversations WHERE id = '$C_LEGADA' AND direct_member_a IS NOT NULL AND direct_member_b IS NOT NULL;"
expect_value 'B3d ...e das DUAS conversas de Atila/Dora que a corrida deixou so UMA ficou com o par (nada e apagado)' '1' \
  "SELECT count(*) FROM public.team_conversations c
     WHERE c.type = 'direct' AND c.direct_member_a IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.team_conversation_members x WHERE x.conversation_id = c.id AND x.profile_id = '$P_ATILA')
       AND EXISTS (SELECT 1 FROM public.team_conversation_members y WHERE y.conversation_id = c.id AND y.profile_id = '$P_DORA');"
expect_value 'B3e atencao: a duplicata PRE-EXISTENTE nao e apagada (o cartao manda corrigir a corrida, nao deduplicar dado)' '1' \
  "SELECT count(*) FROM public.team_conversations c
     WHERE c.type = 'direct' AND c.direct_member_a IS NULL
       AND EXISTS (SELECT 1 FROM public.team_conversation_members x WHERE x.conversation_id = c.id AND x.profile_id = '$P_ATILA')
       AND EXISTS (SELECT 1 FROM public.team_conversation_members y WHERE y.conversation_id = c.id AND y.profile_id = '$P_DORA');"
expect_value_as 'B3f a RPC devolve a conversa coberta (a sobrevivente do par), nao uma terceira' '1' "$ATILA" \
  "SELECT count(*) FROM public.team_conversations c
     WHERE c.id = public.find_or_create_direct_conversation('$P_DORA'::uuid)
       AND c.direct_member_a IS NOT NULL AND c.direct_member_b IS NOT NULL;"
expect_value 'B3g efeito colateral documentado: o trigger canonico avancou updated_at da conversa legada' '1' \
  "SELECT count(*) FROM public.team_conversations WHERE id = '$C_LEGADA' AND updated_at > '2026-09-29T10:00:00Z'::timestamptz;"
expect_value 'B3h tabela de apoio interna tem RLS habilitado e nenhuma policy' '1' \
  "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'team_conversations_direct_pair_backfill'
      AND c.relrowsecurity
      AND NOT EXISTS (SELECT 1 FROM pg_policy pol WHERE pol.polrelid = c.oid);"
expect_value 'B3i par ja gravado: a conversa legada do mesmo par ficou sem par (nao entrou no backfill)' '1' \
  "SELECT count(*) FROM public.team_conversations
    WHERE id = '$C_LEGADA_MESMO_PAR'
      AND direct_member_a IS NULL AND direct_member_b IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.team_conversations_direct_pair_backfill b WHERE b.conversation_id = '$C_LEGADA_MESMO_PAR');"
expect_value_as 'B3j par ja gravado: a RPC devolve a conversa que ja tinha direct_member_a/b' "$C_PAIR_EXISTENTE" "$LAURA" \
  "SELECT public.find_or_create_direct_conversation('$P_NUNO'::uuid);"

expect_value_as 'B4 conversa legada de 3 membros continua sendo achada pelos MEMBROS' "$C_TRIO" "$SOFIA" \
  "SELECT public.find_or_create_direct_conversation('$P_TIAGO'::uuid);"
expect_count_pair 'B4b ...sem criar uma segunda conversa para o par Sofia/Tiago' '1' "$P_SOFIA" "$P_TIAGO"

expect_error_sql 'B5 a garantia e do BANCO: INSERT direto do mesmo par e recusado pelo indice unico parcial' \
  'duplicate key value violates unique constraint "idx_team_conversations_direct_pair"' \
  "INSERT INTO public.team_conversations (type, created_by, direct_member_a, direct_member_b)
   VALUES ('direct', '$P_PEDRO', '$P_PEDRO', '$P_RITA');"
expect_error_sql 'B5b ...e o mesmo par por outro criador tambem e recusado (a garantia e do par, nao do autor)' \
  'duplicate key value violates unique constraint "idx_team_conversations_direct_pair"' \
  "INSERT INTO public.team_conversations (type, created_by, direct_member_a, direct_member_b)
   VALUES ('direct', '$P_RITA', '$P_PEDRO', '$P_RITA');"

expect_error_anon 'B6 ACL: anon NAO tem EXECUTE (REVOKE ... FROM PUBLIC, anon)' \
  'permission denied for function find_or_create_direct_conversation' \
  "SELECT public.find_or_create_direct_conversation('$P_DORA'::uuid);"
expect_value 'B6b ACL: authenticated tem EXECUTE e service_role tambem; PUBLIC e anon nao' '1' \
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
expect_value 'B9b o indice voltou (a migration e reaplicavel depois de recriado)' '1' \
  "SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_team_conversations_direct_pair';"

printf '\n──── O Rollback do cabecalho roda e devolve o estado anterior ────\n'
BACKFILL_IDS="$(psql_sql "SELECT string_agg(quote_literal(conversation_id::text), ',') FROM public.team_conversations_direct_pair_backfill;" | tail -n1)"
[[ -n "$BACKFILL_IDS" ]] || fail 'B10 nao consegui listar as conversas do backfill antes do Rollback'
{
  cat "$tmp_dir/prev_fn.sql"
  printf "UPDATE public.team_conversations SET direct_member_a = NULL, direct_member_b = NULL WHERE id IN (SELECT conversation_id FROM public.team_conversations_direct_pair_backfill);\n"
  printf "DROP TABLE public.team_conversations_direct_pair_backfill;\n"
} > "$tmp_dir/rollback.sql"
psql_file "$tmp_dir/rollback.sql" >/dev/null
MD5_ROLLBACK="$(fn_md5)"
[[ "$MD5_ROLLBACK" == "$MD5_ANTES" ]] || fail "B10 o Rollback nao devolveu o corpo anterior da funcao (md5 '$MD5_ROLLBACK' x '$MD5_ANTES')"
printf '[PASS] B10 o Rollback devolve o corpo anterior da funcao (md5 identico ao do bloco A)\n'
expect_value 'B10b ...as conversas que o backfill cobriu voltaram a NULL' '' \
  "SELECT coalesce(string_agg(id::text, ','), '') FROM public.team_conversations WHERE id IN ($BACKFILL_IDS) AND direct_member_a IS NOT NULL;"
expect_value 'B10c ...a tabela de apoio sumiu' '0' \
  "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'team_conversations_direct_pair_backfill';"
expect_value 'B10d ...e a conversa que a RPC criou DEPOIS da migration segue intacta (o Rollback so desfaz o que a migration fez)' "$C_ID" \
  "SELECT id FROM public.team_conversations WHERE id = '$C_ID' AND direct_member_a IS NOT NULL AND direct_member_b IS NOT NULL;"

printf '\nPASS: item 55 — a RPC de conversa direta voltou a ter protecao contra criacao concorrente COM garantia no banco (indice unico parcial), sem mudar contrato, guardas nem ACL; backfill do par ordenado cobre o legado e o Rollback do cabecalho roda e devolve o estado.\n'
