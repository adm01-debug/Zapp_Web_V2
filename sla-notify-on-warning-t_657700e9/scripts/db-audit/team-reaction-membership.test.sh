#!/usr/bin/env bash
# #1265 (ALTO, demonstrado): reacao cross-team em `team_message_reactions`.
#
# Roda o MESMO roteiro no mesmo container:
#   BLOCO A — estado ANTERIOR: `reactions_insert` (PERMISSIVE, so `profile_id = current_profile_id()`)
#             concorre com a estrita (`team_message_reactions_insert`, que TEM o vinculo). Como
#             PERMISSIVE soma por OR, a fraca sozinha libera o INSERT DIRETO — que e justamente o
#             caminho do app (`useTeamMessageReactions.ts` insere sem RPC). Prova tambem que o time
#             invadido VE a reacao.
#   BLOCO B — migration aplicada: a policy fraca sumiu; so a estrita decide. A RPC (SECURITY DEFINER,
#             que nao passa por RLS) passou a exigir vinculo e a gravar `conversation_id`. O caminho
#             legitimo (membro reagindo na conversa do proprio time) fica identico.
#
# Estado anterior fiel ao canonico de 30/09 (`pg_policies` + `pg_get_functiondef`), incluindo o
# detalhe medido de que `team_message_reactions.conversation_id` e NOT NULL **sem default** e a
# tabela (ao contrario de `team_message_receipts`) nao tem trigger que o preencha.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20260930260000_team_reaction_membership_guard.sql"
postgres_image="${TEAM_REACTION_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-team-reaction-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-team-reaction-test-[0-9]+$ ]]; then
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
# Roda SQL como `authenticated` com as claims do usuario, numa unica sessao.
as_user() {
  local jwt="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"
}
expect_ok() {
  local label="$1" sql="$2"
  psql_sql "$sql" >/dev/null || fail "$label: deveria ter sucesso"
  printf '[PASS] %s\n' "$label"
}
expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}
expect_ok_as() {
  local label="$1" jwt="$2" sql="$3"
  as_user "$jwt" "$sql" >/dev/null || fail "$label: deveria ter sucesso (como authenticated)"
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
  [[ "$output" == *"$needle"* ]] || { printf '%s\n' "$output" >&2; fail "$label: esperava '$needle' no erro"; }
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
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

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
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.role', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
     )::text $$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
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
  content text NOT NULL DEFAULT ''
);
-- Fiel ao canonico: `conversation_id` NOT NULL e SEM default.
CREATE TABLE public.team_message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.team_messages(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, profile_id, emoji)
);

-- Predicates: mesmo contrato dos reais.
CREATE FUNCTION public.current_profile_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $$ SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1 $$;
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles ur
                       WHERE ur.user_id = _user_id AND ur.role IN ('admin','supervisor')) $$;
CREATE FUNCTION public.is_team_conversation_member(_user_id uuid, _conversation_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT EXISTS (
        SELECT 1 FROM public.team_conversation_members tcm
        JOIN public.profiles p ON p.id = tcm.profile_id
        WHERE tcm.conversation_id = _conversation_id AND p.user_id = _user_id) $$;

-- RLS + policies ANTERIORES, fieis ao canonico de 30/09.
ALTER TABLE public.team_message_reactions ENABLE ROW LEVEL SECURITY;

-- (DEFEITO #1265) INSERT PERMISSIVE sem vinculo — concorre com a estrita e, por OR, vence sozinha.
CREATE POLICY reactions_insert ON public.team_message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = current_profile_id());

-- INSERT PERMISSIVE COM vinculo (a estrita, que permanece).
CREATE POLICY team_message_reactions_insert ON public.team_message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = current_profile_id()
    AND EXISTS (
      SELECT 1 FROM public.team_messages tm
      WHERE tm.id = team_message_reactions.message_id
        AND public.is_team_conversation_member(auth.uid(), tm.conversation_id)
    )
  );

CREATE POLICY reactions_delete ON public.team_message_reactions
  FOR DELETE TO authenticated
  USING (profile_id = current_profile_id());
CREATE POLICY team_message_reactions_delete ON public.team_message_reactions
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = team_message_reactions.profile_id AND p.user_id = auth.uid()));

CREATE POLICY reactions_select ON public.team_message_reactions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_conversation_members tcm
    JOIN public.team_messages tm ON tm.id = team_message_reactions.message_id
    WHERE tcm.conversation_id = tm.conversation_id AND tcm.profile_id = current_profile_id()));
CREATE POLICY team_message_reactions_select ON public.team_message_reactions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_messages tm
    JOIN public.team_conversation_members tcm ON tcm.conversation_id = tm.conversation_id
    JOIN public.profiles p ON p.id = tcm.profile_id
    WHERE tm.id = team_message_reactions.message_id AND p.user_id = auth.uid()));

-- RPC anterior, fiel ao canonico: SEM checagem de vinculo e SEM `conversation_id` no INSERT.
CREATE FUNCTION public.toggle_team_reaction(p_message_id uuid, p_emoji text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$
DECLARE
  v_profile_id uuid := public.current_profile_id();
  v_exists boolean;
BEGIN
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.team_message_reactions
                 WHERE message_id = p_message_id AND profile_id = v_profile_id AND emoji = p_emoji) INTO v_exists;
  IF v_exists THEN
    DELETE FROM public.team_message_reactions
     WHERE message_id = p_message_id AND profile_id = v_profile_id AND emoji = p_emoji;
    RETURN jsonb_build_object('action','removed','emoji',p_emoji);
  ELSE
    INSERT INTO public.team_message_reactions(message_id, profile_id, emoji)
    VALUES (p_message_id, v_profile_id, p_emoji) ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('action','added','emoji',p_emoji);
  END IF;
END;
$f$;
REVOKE EXECUTE ON FUNCTION public.toggle_team_reaction(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_team_reaction(uuid, text) TO authenticated;

-- Grants de producao (tabelas abertas; so a RLS segura o anon).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_message_reactions TO anon, authenticated, service_role;
GRANT SELECT ON public.team_messages TO authenticated;
GRANT SELECT ON public.team_conversation_members TO authenticated;
GRANT SELECT ON public.team_conversations TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.team_message_reactions;
DELETE FROM public.team_messages;
DELETE FROM public.team_conversation_members;
DELETE FROM public.team_conversations;
DELETE FROM public.user_roles;
DELETE FROM public.profiles;

INSERT INTO public.profiles (id, user_id, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', true), -- ATILA (membro SO do Time A)
  ('c0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', true); -- BETO  (membro SO do Time B)

INSERT INTO public.team_conversations (id, type, name) VALUES
  ('e0000000-0000-0000-0000-00000000000a', 'group', 'Time A'),
  ('e0000000-0000-0000-0000-00000000000b', 'group', 'Time B');

INSERT INTO public.team_conversation_members (conversation_id, profile_id) VALUES
  ('e0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001'), -- ATILA: so no Time A
  ('e0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-000000000001'); -- BETO: no Time B

INSERT INTO public.team_messages (id, conversation_id, sender_id, content) VALUES
  ('d0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'mensagem do MEU time'),
  ('d0000000-0000-0000-0000-00000000000b', 'e0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-000000000001', 'mensagem do OUTRO time');
SQL

psql_file "$tmp_dir/pre.sql"
psql_file "$tmp_dir/seed.sql"

ATILA='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
BETO='{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}'
PERFIL_ATILA='a0000000-0000-0000-0000-000000000001'
MSG_MEU='d0000000-0000-0000-0000-00000000000a'
MSG_OUTRO='d0000000-0000-0000-0000-00000000000b'
CONV_MEU='e0000000-0000-0000-0000-00000000000a'
CONV_OUTRO='e0000000-0000-0000-0000-00000000000b'

echo '── BLOCO A: comportamento ANTES da migration (o defeito) ─────────────────────────'

expect_ok_as 'A1 (defeito) Atila REAGE em mensagem do OUTRO time pelo INSERT direto (caminho do app)' \
  "$ATILA" "INSERT INTO public.team_message_reactions (message_id, profile_id, emoji, conversation_id) VALUES ('$MSG_OUTRO', '$PERFIL_ATILA', 'alerta', '$CONV_OUTRO');"

expect_value_as 'A2 (defeito) e o time INVADIDO ve a reacao alheia' '1' \
  "$BETO" "SELECT count(*) FROM public.team_message_reactions WHERE message_id='$MSG_OUTRO';"

# A RPC nao checa vinculo: com emoji NOVO ela segue ate o INSERT — e la estoura, porque
# `conversation_id` e NOT NULL e a funcao nao o preenche (segundo defeito, medido no canonico).
expect_error_as 'A3 (defeito) a RPC nao barra por vinculo — segue ate o INSERT (sem checagem de time)' \
  'null value in column "conversation_id"' "$ATILA" \
  "SELECT public.toggle_team_reaction('$MSG_OUTRO', 'festa');"

# Com o emoji que A1 acabou de gravar, o caminho e o DELETE — que tambem nao tem barreira de time.
expect_value_as 'A4 (defeito) a RPC tambem APAGA reacao cross-team sem barreira de time' 'removed' \
  "$ATILA" "SELECT (public.toggle_team_reaction('$MSG_OUTRO', 'alerta'))->>'action';"

echo
echo '── Aplicando a migration ─────────────────────────────────────────────────────────'
psql_file "$migration"
psql_file "$tmp_dir/seed.sql"

echo
echo '── BLOCO B: comportamento DEPOIS da migration ────────────────────────────────────'

expect_error_as 'B1 (#1265) INSERT direto cross-team agora e barrado pela RLS' \
  'row-level security policy' "$ATILA" \
  "INSERT INTO public.team_message_reactions (message_id, profile_id, emoji, conversation_id) VALUES ('$MSG_OUTRO', '$PERFIL_ATILA', 'alerta', '$CONV_OUTRO');"

expect_error_as 'B2 (#1265) a RPC cross-team agora barra por vinculo' \
  'not_member' "$ATILA" \
  "SELECT public.toggle_team_reaction('$MSG_OUTRO', 'alerta');"

expect_value 'B3 nada foi gravado na conversa invadida' '0' \
  "SELECT count(*) FROM public.team_message_reactions WHERE conversation_id='$CONV_OUTRO';"

expect_ok_as 'B4 caminho legitimo preservado: membro reage na conversa do proprio time' \
  "$ATILA" "INSERT INTO public.team_message_reactions (message_id, profile_id, emoji, conversation_id) VALUES ('$MSG_MEU', '$PERFIL_ATILA', 'joinha', '$CONV_MEU');"

expect_value_as 'B5 e ele mesmo le a propria reacao' '1' \
  "$ATILA" "SELECT count(*) FROM public.team_message_reactions WHERE message_id='$MSG_MEU';"

expect_value_as 'B6 a RPC do caminho legitimo funciona (acao=added)' 'added' \
  "$ATILA" "SELECT (public.toggle_team_reaction('$MSG_MEU', 'festa'))->>'action';"

expect_value 'B7 a linha da RPC nasce com o conversation_id da MENSAGEM (coluna NOT NULL era o que quebrava)' '1' \
  "SELECT count(*) FROM public.team_message_reactions WHERE message_id='$MSG_MEU' AND emoji='festa' AND conversation_id='$CONV_MEU';"

expect_value_as 'B8 a RPC continua alternando no caminho legitimo (acao=removed)' 'removed' \
  "$ATILA" "SELECT (public.toggle_team_reaction('$MSG_MEU', 'festa'))->>'action';"

expect_value 'B9 nao sobrou nenhuma policy de INSERT sem vinculo na tabela' '1' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='team_message_reactions' AND cmd='INSERT'"

expect_value 'B10 e essa unica policy de INSERT exige vinculo (is_team_conversation_member)' '1' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='team_message_reactions' AND cmd='INSERT' AND with_check LIKE '%is_team_conversation_member%'"

printf '\n[OK] contrato de vinculo de time na reacao (#1265) verificado\n'
