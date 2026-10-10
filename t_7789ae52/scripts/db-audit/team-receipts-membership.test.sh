#!/usr/bin/env bash
# Auditoria adversarial da Onda 3 (docs/audits/onda3-260930), ACHADO 2 — confirmado por PoC em
# PostgreSQL descartavel, com controle negativo que negou corretamente.
#
# Roda o MESMO roteiro no mesmo container, em dois blocos:
#   BLOCO A — estado ANTERIOR: `mark_team_conversation_read` e SECURITY DEFINER, executavel por
#             `authenticated`, e so valida `current_profile_id() IS NOT NULL`. Sem checagem de
#             vinculo, um perfil membro APENAS do Time A grava recibos de leitura nas mensagens do
#             Time B (a funcao nao passa por RLS, entao a policy estrita "Members can insert own
#             receipts" nao a alcanca). O insert DIRETO nas mesmas linhas e barrado — prova de que a
#             RPC era o unico caminho.
#   BLOCO B — migration aplicada: a RPC passa a exigir vinculo (`not_member`) e nada e gravado, com o
#             caminho legitimo (membro marcando a conversa do proprio time) intacto.
#
# Pre-estado fiel ao canonico de 2026-09-30 (`pg_policies` + `pg_get_functiondef` + `pg_proc`),
# incluindo o helper `is_team_conversation_member` de 20260930280000 e os dois triggers de recibo que
# preenchem `conversation_id` e barram recibo da propria mensagem.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20260930470000_team_receipts_membership_guard.sql"
postgres_image="${TEAM_RECEIPTS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-team-receipts-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-team-receipts-test-[0-9]+$ ]]; then
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
expect_ok_as() { local l="$1" j="$2" s="$3"; as_user "$j" "$s" >/dev/null || fail "$l: deveria ter sucesso (como authenticated)"; printf '[PASS] %s\n' "$l"; }
expect_error_as() {
  local l="$1" needle="$2" j="$3" s="$4" out st
  set +e; out="$(as_user "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
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
  is_pinned boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  member_role text NOT NULL DEFAULT 'member',
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
  status text NOT NULL DEFAULT 'delivered',
  delivered_at timestamptz DEFAULT now(),
  read_at timestamptz,
  conversation_id uuid NOT NULL REFERENCES public.team_conversations(id) ON DELETE CASCADE,
  UNIQUE (message_id, profile_id),
  CHECK (status IN ('delivered','read'))
);

CREATE OR REPLACE FUNCTION public.current_profile_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $function$ SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1; $function$;
REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $function$
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
    )
  $function$;

CREATE OR REPLACE FUNCTION public.is_team_conversation_member(_user_id uuid, _conversation_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $function$
    SELECT EXISTS (
      SELECT 1 FROM public.team_conversation_members tcm
      JOIN public.profiles p ON p.id = tcm.profile_id
      WHERE tcm.conversation_id = _conversation_id
        AND p.user_id = _user_id
    );
  $function$;

CREATE OR REPLACE FUNCTION public.team_receipts_fill_conversation_id() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF NEW.conversation_id IS NULL THEN
    SELECT tm.conversation_id INTO NEW.conversation_id FROM public.team_messages tm WHERE tm.id = NEW.message_id;
  END IF;
  IF NEW.conversation_id IS NULL THEN
    RAISE EXCEPTION 'conversation_id_required: message % has no conversation_id', NEW.message_id;
  END IF;
  RETURN NEW;
END; $f$;
CREATE OR REPLACE FUNCTION public.team_receipts_no_own_sender() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF EXISTS (SELECT 1 FROM public.team_messages WHERE id = NEW.message_id AND sender_id = NEW.profile_id) THEN
    RAISE EXCEPTION 'sender cannot create receipt for own message';
  END IF;
  RETURN NEW;
END; $f$;

-- ESTADO ANTERIOR: RPC real de producao (medida em 2026-09-30), sem checagem de vinculo.
CREATE OR REPLACE FUNCTION public.mark_team_conversation_read(p_conversation_id uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
  AS $function$
DECLARE
  v_profile_id uuid := public.current_profile_id();
  v_now        timestamptz := now();
BEGIN
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  INSERT INTO public.team_message_receipts(message_id, profile_id, status, delivered_at, read_at)
  SELECT m.id, v_profile_id, 'read', v_now, v_now
    FROM public.team_messages m
   WHERE m.conversation_id = p_conversation_id
     AND m.sender_id <> v_profile_id
     AND NOT EXISTS (
       SELECT 1 FROM public.team_message_receipts r
        WHERE r.message_id = m.id AND r.profile_id = v_profile_id AND r.status = 'read'
     )
  ON CONFLICT (message_id, profile_id) DO UPDATE
     SET status = 'read', read_at = v_now;

  UPDATE public.team_conversation_members
     SET last_read_at = v_now
   WHERE conversation_id = p_conversation_id
     AND profile_id = v_profile_id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.mark_team_conversation_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_team_conversation_read(uuid) TO authenticated;

ALTER TABLE public.team_message_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can insert own receipts" ON public.team_message_receipts FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = public.current_profile_id()
    AND EXISTS (
      SELECT 1 FROM public.team_conversation_members mem
      JOIN public.team_messages tm ON tm.id = team_message_receipts.message_id
      WHERE mem.conversation_id = tm.conversation_id
        AND mem.profile_id = team_message_receipts.profile_id
    )
  );
CREATE POLICY "Conversation members can read receipts" ON public.team_message_receipts FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.team_conversation_members mem
    JOIN public.team_messages tm ON tm.id = team_message_receipts.message_id
    WHERE mem.conversation_id = tm.conversation_id AND mem.profile_id = public.current_profile_id()));
CREATE POLICY team_message_receipts_update_own ON public.team_message_receipts FOR UPDATE TO authenticated
  USING (profile_id = public.current_profile_id())
  WITH CHECK (profile_id = public.current_profile_id() AND status = 'read');

CREATE POLICY tcm_select_own ON public.team_conversation_members FOR SELECT TO authenticated
  USING (public.is_team_conversation_member(auth.uid(), conversation_id));

CREATE POLICY "Members can view their conversations" ON public.team_conversations FOR SELECT TO authenticated
  USING (public.is_team_conversation_member(auth.uid(), id)
         OR created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1));

GRANT SELECT, INSERT, UPDATE ON public.team_message_receipts TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.team_conversation_members TO authenticated;
GRANT SELECT, INSERT, DELETE, UPDATE ON public.team_conversations TO authenticated;
GRANT SELECT ON public.team_messages TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;

CREATE TRIGGER team_receipts_fill_conversation_id_trig BEFORE INSERT ON public.team_message_receipts
  FOR EACH ROW EXECUTE FUNCTION public.team_receipts_fill_conversation_id();
CREATE TRIGGER team_receipts_no_own_sender_trig BEFORE INSERT ON public.team_message_receipts
  FOR EACH ROW EXECUTE FUNCTION public.team_receipts_no_own_sender();
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.team_message_receipts;
DELETE FROM public.team_messages;
DELETE FROM public.team_conversation_members;
DELETE FROM public.team_conversations;
DELETE FROM public.user_roles;
DELETE FROM public.profiles;

-- ATILA (A): membro SO do Time A.  BETO (B): membro SO do Time B.
-- DORA  (D): membro do Time A (caminho legitimo).
INSERT INTO public.profiles (id, user_id, role, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'agent', true),
  ('c0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'agent', true),
  ('f0000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'agent', true);

INSERT INTO public.team_conversations (id, type, name, created_by) VALUES
  ('e0000000-0000-0000-0000-00000000000a', 'group', 'Time A', 'a0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-00000000000b', 'group', 'Time B', 'c0000000-0000-0000-0000-000000000001');

INSERT INTO public.team_conversation_members (conversation_id, profile_id) VALUES
  ('e0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-00000000000a', 'f0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-000000000001');

INSERT INTO public.team_messages (id, conversation_id, sender_id, content) VALUES
  ('d0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'mensagem do proprio A no Time A'),
  ('d0000000-0000-0000-0000-00000000000d', 'e0000000-0000-0000-0000-00000000000a', 'f0000000-0000-0000-0000-000000000001', 'mensagem da DORA no Time A'),
  ('d0000000-0000-0000-0000-00000000000b', 'e0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-000000000001', 'mensagem do OUTRO time (B) 1'),
  ('d0000000-0000-0000-0000-00000000000c', 'e0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-000000000001', 'mensagem do OUTRO time (B) 2');
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

ATILA='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
PERFIL_A='a0000000-0000-0000-0000-000000000001'
MSG_B1='d0000000-0000-0000-0000-00000000000b'
CONV_A='e0000000-0000-0000-0000-00000000000a'
CONV_B='e0000000-0000-0000-0000-00000000000b'

printf '\n============ BLOCO A — estado ANTERIOR (defeito) ============\n'
expect_value 'A.0 pre-condicao: A NAO e membro do Time B' '0' \
  "SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$CONV_B' AND profile_id='$PERFIL_A';"

expect_ok_as 'A.1 (DEFEITO) A chama mark_team_conversation_read do Time B sem erro' \
  "$ATILA" "SELECT public.mark_team_conversation_read('$CONV_B');"
expect_value 'A.2 (DEFEITO) A gravou 2 recibos de leitura no Time B (do qual NAO e membro)' '2' \
  "SELECT count(*) FROM public.team_message_receipts WHERE conversation_id='$CONV_B' AND profile_id='$PERFIL_A';"
expect_value 'A.3 os recibos nascem status=read' '2' \
  "SELECT count(*) FROM public.team_message_receipts WHERE conversation_id='$CONV_B' AND profile_id='$PERFIL_A' AND status='read';"

expect_error_as 'A.4 controle negativo: o insert DIRETO de recibo no Time B e barrado pela RLS' \
  'row-level security policy' "$ATILA" \
  "INSERT INTO public.team_message_receipts (message_id, profile_id, status, delivered_at, read_at) VALUES ('$MSG_B1','$PERFIL_A','read',now(),now());"

printf '\n============ BLOCO B — migration aplicada ============\n'
psql_file "$migration" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

expect_error_as 'B.1 (CORRIGIDO) a mesma chamada agora recusa com not_member' \
  'not_member' "$ATILA" "SELECT public.mark_team_conversation_read('$CONV_B');"
expect_value 'B.2 (CORRIGIDO) nenhum recibo foi gravado no Time B' '0' \
  "SELECT count(*) FROM public.team_message_receipts WHERE conversation_id='$CONV_B' AND profile_id='$PERFIL_A';"

expect_ok_as 'B.3 caminho legitimo: A marca a conversa do PROPRIO time' \
  "$ATILA" "SELECT public.mark_team_conversation_read('$CONV_A');"
expect_value 'B.4 recibo legitimo gravado no Time A (so a mensagem da DORA)' '1' \
  "SELECT count(*) FROM public.team_message_receipts WHERE conversation_id='$CONV_A' AND profile_id='$PERFIL_A';"
expect_value 'B.5 last_read_at do vinculo de A no Time A foi atualizado' '1' \
  "SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$CONV_A' AND profile_id='$PERFIL_A' AND last_read_at IS NOT NULL;"

as_sem_claims() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT public.mark_team_conversation_read('$CONV_A');" 2>&1 || true
}
out_sem="$(as_sem_claims)"
[[ "$out_sem" == *"not_authenticated"* ]] || fail "B.6 sem claims: esperava 'not_authenticated', obtido: $out_sem"
printf '[PASS] %s\n' 'B.6 sem claims a recusa e not_authenticated (ordem das guardas preservada)'

expect_value 'B.7 a RPC de recibo do proprio autor nao foi tocada (A=remetente nao gera recibo)' '0' \
  "SELECT count(*) FROM public.team_message_receipts WHERE message_id='d0000000-0000-0000-0000-00000000000a' AND profile_id='$PERFIL_A';"

printf '\nPASS: team chat — `mark_team_conversation_read` exige vinculo com a conversa (auditoria Onda 3, achado 2): recibo cross-team recusado com not_member, caminho legitimo intacto e insert direto seguindo barrado pela RLS.\n'
