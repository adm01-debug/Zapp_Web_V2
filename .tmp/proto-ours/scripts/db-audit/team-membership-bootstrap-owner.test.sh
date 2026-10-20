#!/usr/bin/env bash
# TC-003 (P1) — "Membership não protege bootstrap e último owner; grants de conversa
# continuam amplos" (docs/reconciliation/reports/team-chat/CODE_DATABASE_TRUTH_TEAM_CHAT.md).
#
# Roda o MESMO roteiro no mesmo container, em dois blocos:
#   BLOCO A — estado ANTERIOR (defeito), fiel ao canônico:
#             * tcm_insert_member exige membro prévio ou profiles.role admin/supervisor
#               → o agente que cria um grupo em duas requests falha no membership e
#               deixa a conversa órfã;
#             * o INSERT não exige member_role='member' → qualquer membro injeta 'owner';
#             * tcm_delete_own_or_admin não guarda o último owner → grupo fica sem owner;
#             * GRANT UPDATE na tabela team_conversations anula os REVOKEs de coluna
#               (type, created_by, department_id seguem graváveis).
#   BLOCO B — migration aplicada: create_team_group_conversation atômica (criador vira
#             owner, membro inválido desfaz tudo, departamento é get-or-create), INSERT
#             direto só cria 'member', último owner não sai nem é rebaixado (promoção e
#             transferência canônicas liberam a saída), UPDATE por coluna só em
#             name/avatar_url/updated_at e autorização canônica via user_roles.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261004185228_team_membership_bootstrap_owner_grants.sql"
postgres_image="${TEAM_MEMBERSHIP_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-team-membership-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-team-membership-test-[0-9]+$ ]]; then
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
  department_id uuid REFERENCES public.departments(id),
  direct_member_a uuid,
  direct_member_b uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_conversations_type_check CHECK (type IN ('direct', 'group', 'department')),
  CONSTRAINT team_conversations_dept_required CHECK (type <> 'department' OR department_id IS NOT NULL),
  CONSTRAINT team_conversations_group_name_required CHECK (type <> 'group' OR name IS NOT NULL)
);
CREATE UNIQUE INDEX idx_team_conversations_dept_unique
  ON public.team_conversations(department_id) WHERE type = 'department' AND department_id IS NOT NULL;
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
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $function$
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
    );
  $function$;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO authenticated, service_role;

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
GRANT EXECUTE ON FUNCTION public.is_team_conversation_member(uuid, uuid) TO authenticated, service_role;

-- set_team_member_role na versao CANONICA ANTERIOR (sem guarda de ultimo owner).
CREATE OR REPLACE FUNCTION public.set_team_member_role(p_conversation_id uuid, p_profile_id uuid, p_new_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF p_new_role NOT IN ('owner', 'admin', 'member') THEN
    RAISE EXCEPTION 'invalid role: %', p_new_role;
  END IF;
  IF NOT is_admin_or_supervisor(auth.uid()) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.team_conversation_members
      WHERE conversation_id = p_conversation_id
        AND profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
        AND member_role = 'owner'
    ) THEN
      RAISE EXCEPTION 'permission denied';
    END IF;
  END IF;
  UPDATE public.team_conversation_members
  SET    member_role = p_new_role
  WHERE  conversation_id = p_conversation_id
    AND  profile_id      = p_profile_id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.set_team_member_role(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_team_member_role(uuid, uuid, text) TO authenticated;

ALTER TABLE public.team_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_conversation_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their conversations" ON public.team_conversations FOR SELECT TO authenticated
  USING (public.is_team_conversation_member(auth.uid(), id)
         OR created_by = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1));
CREATE POLICY "Authenticated users can create conversations" ON public.team_conversations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY team_conversations_update_own ON public.team_conversations FOR UPDATE TO authenticated
  USING (created_by = public.current_profile_id()) WITH CHECK (created_by = public.current_profile_id());
CREATE POLICY "Conversation creator or admin can delete" ON public.team_conversations FOR DELETE TO authenticated
  USING (created_by = public.current_profile_id() OR public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY tcm_select_own ON public.team_conversation_members FOR SELECT TO authenticated
  USING (public.is_team_conversation_member(auth.uid(), conversation_id));
CREATE POLICY tcm_insert_member ON public.team_conversation_members FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.team_conversation_members m2
                       WHERE m2.conversation_id = team_conversation_members.conversation_id
                         AND m2.profile_id = public.current_profile_id())
              OR EXISTS (SELECT 1 FROM public.profiles p
                          WHERE p.id = public.current_profile_id() AND p.role IN ('admin','supervisor')));
CREATE POLICY tcm_delete_own_or_admin ON public.team_conversation_members FOR DELETE TO authenticated
  USING (profile_id = public.current_profile_id()
         OR EXISTS (SELECT 1 FROM public.profiles p
                     WHERE p.id = public.current_profile_id() AND p.role IN ('admin','supervisor')));
CREATE POLICY tcm_update_own_prefs ON public.team_conversation_members FOR UPDATE TO authenticated
  USING (profile_id = public.current_profile_id()) WITH CHECK (profile_id = public.current_profile_id());

GRANT SELECT, INSERT, DELETE, UPDATE ON public.team_conversations TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.team_conversation_members TO authenticated;
GRANT UPDATE (last_read_at, is_muted, is_pinned, is_archived) ON public.team_conversation_members TO authenticated;
-- letra morta do defeito: o REVOKE de coluna convive com o grant de tabela inteira
REVOKE UPDATE (type, created_by, department_id) ON public.team_conversations FROM authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.departments TO authenticated;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.team_conversation_members;
DELETE FROM public.team_conversations;
DELETE FROM public.user_roles;
DELETE FROM public.profiles;
DELETE FROM public.departments;

INSERT INTO public.profiles (id, user_id, role, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'agent', true), -- ATILA
  ('a0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'agent', true), -- DORA
  ('a0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'agent', true), -- EVA
  ('a0000000-0000-0000-0000-000000000004', '44444444-4444-4444-4444-444444444444', 'agent', true), -- OTTO
  ('a0000000-0000-0000-0000-000000000005', '55555555-5555-5555-5555-555555555555', 'agent', true), -- MARIA
  ('a0000000-0000-0000-0000-000000000006', '66666666-6666-6666-6666-666666666666', 'agent', true), -- ADMIN canonico (user_roles)
  ('a0000000-0000-0000-0000-000000000007', '77777777-7777-7777-7777-777777777777', 'admin', true), -- PSEUDO admin (so profiles.role)
  ('a0000000-0000-0000-0000-000000000008', '88888888-8888-8888-8888-888888888888', 'agent', true); -- CARLOS

INSERT INTO public.user_roles (user_id, role) VALUES
  ('66666666-6666-6666-6666-666666666666', 'admin');

INSERT INTO public.departments (id, name) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'Comercial');

-- G_OLD: grupo com OTTO owner + DORA member (injeção de papel, grant de update, admin)
INSERT INTO public.team_conversations (id, type, name, created_by) VALUES
  ('e0000000-0000-0000-0000-00000000000a', 'group', 'Grupo Velho', 'a0000000-0000-0000-0000-000000000004'),
  ('e0000000-0000-0000-0000-00000000000b', 'group', 'Grupo Saida', 'a0000000-0000-0000-0000-000000000004'),
  ('e0000000-0000-0000-0000-00000000000c', 'group', 'Grupo Transf', 'a0000000-0000-0000-0000-000000000004'),
  ('e0000000-0000-0000-0000-00000000000d', 'group', 'Grupo Solo', 'a0000000-0000-0000-0000-000000000004'),
  ('e0000000-0000-0000-0000-00000000000e', 'direct', NULL, 'a0000000-0000-0000-0000-000000000004');

INSERT INTO public.team_conversation_members (conversation_id, profile_id, member_role) VALUES
  ('e0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000004', 'owner'),
  ('e0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000002', 'member'),
  ('e0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000004', 'owner'),
  ('e0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000002', 'member'),
  ('e0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-000000000004', 'owner'),
  ('e0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-000000000005', 'member'),
  ('e0000000-0000-0000-0000-00000000000d', 'a0000000-0000-0000-0000-000000000004', 'owner'),
  ('e0000000-0000-0000-0000-00000000000e', 'a0000000-0000-0000-0000-000000000004', 'owner'),
  ('e0000000-0000-0000-0000-00000000000e', 'a0000000-0000-0000-0000-000000000002', 'member');
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

ATILA='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
DORA='{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'
EVA='{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}'
OTTO='{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}'
MARIA='{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}'
ADM='{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}'
PSEUDO='{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}'
CARLOS='{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}'

P_ATILA='a0000000-0000-0000-0000-000000000001'
P_DORA='a0000000-0000-0000-0000-000000000002'
P_EVA='a0000000-0000-0000-0000-000000000003'
P_OTTO='a0000000-0000-0000-0000-000000000004'
P_MARIA='a0000000-0000-0000-0000-000000000005'
P_CARLOS='a0000000-0000-0000-0000-000000000008'
DEP1='d0000000-0000-0000-0000-000000000001'
G_OLD='e0000000-0000-0000-0000-00000000000a'
G_DEL='e0000000-0000-0000-0000-00000000000b'
G_TR='e0000000-0000-0000-0000-00000000000c'
G_ROLE='e0000000-0000-0000-0000-00000000000d'
G_DIR='e0000000-0000-0000-0000-00000000000e'
G_ORFAO='e0000000-0000-0000-0000-0000000000a1'

printf '\n============ BLOCO A — estado ANTERIOR (defeito) ============\n'

expect_ok_as 'A.1 agente cria a conversa de grupo (request 1 do bootstrap)' \
  "$ATILA" "INSERT INTO public.team_conversations (id, type, name, created_by) VALUES ('$G_ORFAO','group','Orfao','$P_ATILA');"
expect_error_as 'A.2 (DEFEITO) request 2 (membership) falha: insert exige membro previo ou admin' \
  'row-level security' "$ATILA" \
  "INSERT INTO public.team_conversation_members (conversation_id, profile_id) VALUES ('$G_ORFAO','$P_ATILA'),('$G_ORFAO','$P_DORA');"
expect_value 'A.3 (DEFEITO) ficou a conversa ORFA: existe e tem ZERO membros' '0' \
  "SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$G_ORFAO';"

expect_ok_as 'A.4 (DEFEITO) DORA (member) injeta EVA como owner por INSERT direto' \
  "$DORA" "INSERT INTO public.team_conversation_members (conversation_id, profile_id, member_role) VALUES ('$G_OLD','$P_EVA','owner');"
expect_value 'A.5 a linha injetada nasceu owner (escalacao de papel sem RPC)' 'owner' \
  "SELECT member_role FROM public.team_conversation_members WHERE conversation_id='$G_OLD' AND profile_id='$P_EVA';"
psql_sql "DELETE FROM public.team_conversation_members WHERE conversation_id='$G_OLD' AND profile_id='$P_EVA';" >/dev/null

expect_ok_as 'A.6 (DEFEITO) OTTO sai do G_OLD sendo o UNICO owner — sem guarda' \
  "$OTTO" "DELETE FROM public.team_conversation_members WHERE conversation_id='$G_OLD' AND profile_id='$P_OTTO';"
expect_value 'A.7 (DEFEITO) G_OLD ficou com membros e ZERO owners' '0' \
  "SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$G_OLD' AND member_role='owner';"
psql_sql "INSERT INTO public.team_conversation_members (conversation_id, profile_id, member_role) VALUES ('$G_OLD','$P_OTTO','owner');" >/dev/null

expect_ok_as 'A.8 controle: UPDATE de name funciona (grant de tabela cobre tudo)' \
  "$OTTO" "UPDATE public.team_conversations SET name='Renomeado A' WHERE id='$G_OLD';"
expect_ok_as 'A.9 (DEFEITO) UPDATE de department_id TAMBEM funciona: revoke de coluna e letra morta' \
  "$OTTO" "UPDATE public.team_conversations SET department_id='$DEP1' WHERE id='$G_OLD';"
expect_value 'A.10 identidade da conversa foi reescrita por DML direto' "$DEP1" \
  "SELECT department_id FROM public.team_conversations WHERE id='$G_OLD';"
psql_sql "UPDATE public.team_conversations SET department_id=NULL WHERE id='$G_OLD';" >/dev/null

printf '\n============ BLOCO B — migration aplicada ============\n'
psql_file "$migration" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

CONV_B1="$(as_user "$ATILA" "SELECT public.create_team_group_conversation('Time X', ARRAY['$P_DORA']::uuid[], NULL);" | tail -n1)"
[[ "$CONV_B1" =~ ^[0-9a-f-]{36}$ ]] || fail "B.1 a RPC nao devolveu uuid: $CONV_B1"
printf '[PASS] %s\n' 'B.1 agente cria grupo numa UNICA chamada atomica'
expect_value 'B.2 bootstrap completo: criador virou owner e o convidado member (2 linhas)' '2' \
  "SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$CONV_B1';"
expect_value 'B.3 o criador e owner' 'owner' \
  "SELECT member_role FROM public.team_conversation_members WHERE conversation_id='$CONV_B1' AND profile_id='$P_ATILA';"
expect_value 'B.4 o convidado e member' 'member' \
  "SELECT member_role FROM public.team_conversation_members WHERE conversation_id='$CONV_B1' AND profile_id='$P_DORA';"
expect_value 'B.5 created_by gravado' "$P_ATILA" \
  "SELECT created_by FROM public.team_conversations WHERE id='$CONV_B1';"

expect_error_as 'B.6 rollback atomico: membro inexistente (FK) aborta a criacao inteira' \
  'foreign key' "$ATILA" \
  "SELECT public.create_team_group_conversation('Vai Falhar', ARRAY['f0000000-0000-0000-0000-000000000099']::uuid[], NULL);"
expect_value 'B.7 nenhuma conversa orfa sobrou do rollback' '0' \
  "SELECT count(*) FROM public.team_conversations WHERE name='Vai Falhar';"

CONV_D1="$(as_user "$ATILA" "SELECT public.create_team_group_conversation(NULL, '{}'::uuid[], '$DEP1');" | tail -n1)"
CONV_D2="$(as_user "$DORA" "SELECT public.create_team_group_conversation(NULL, '{}'::uuid[], '$DEP1');" | tail -n1)"
[[ "$CONV_D1" == "$CONV_D2" ]] || fail "B.8 departamento nao foi get-or-create: $CONV_D1 != $CONV_D2"
printf '[PASS] %s\n' 'B.8 departamento e get-or-create: segunda chamada devolve a mesma conversa'
expect_value 'B.9 ...e NAO adiciona quem chamou depois (DORA segue fora)' '1' \
  "SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$CONV_D1';"

expect_error_as 'B.10 INSERT direto com member_role=owner agora e barrado pela policy' \
  'row-level security' "$DORA" \
  "INSERT INTO public.team_conversation_members (conversation_id, profile_id, member_role) VALUES ('$G_OLD','$P_EVA','owner');"
expect_ok_as 'B.11 membro segue podendo adicionar como member (papel forjado, nao a entrada)' \
  "$DORA" "INSERT INTO public.team_conversation_members (conversation_id, profile_id, member_role) VALUES ('$G_OLD','$P_EVA','member');"
psql_sql "DELETE FROM public.team_conversation_members WHERE conversation_id='$G_OLD' AND profile_id='$P_EVA';" >/dev/null

expect_error_as 'B.12 quem nao e membro/criador/admin nao se auto-convida' \
  'row-level security' "$EVA" \
  "INSERT INTO public.team_conversation_members (conversation_id, profile_id) VALUES ('$G_OLD','$P_EVA');"
expect_ok_as 'B.13 fallback de bootstrap: o CRIADOR sem membership ainda anexa membros (como member)' \
  "$CARLOS" "INSERT INTO public.team_conversations (id, type, name, created_by) VALUES ('e0000000-0000-0000-0000-0000000000c1','group','Do Carlos','$P_CARLOS');
            INSERT INTO public.team_conversation_members (conversation_id, profile_id) VALUES ('e0000000-0000-0000-0000-0000000000c1','$P_CARLOS'),('e0000000-0000-0000-0000-0000000000c1','$P_EVA');"

expect_ok_as 'B.14 DELETE do ultimo owner nao estoura erro: a RLS filtra a linha' \
  "$OTTO" "DELETE FROM public.team_conversation_members WHERE conversation_id='$G_DEL' AND profile_id='$P_OTTO';"
expect_value 'B.15 ...mas a linha do ultimo owner CONTINUA la (guarda)' '1' \
  "SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$G_DEL' AND profile_id='$P_OTTO';"
expect_ok_as 'B.16 membro comum sai normalmente' \
  "$DORA" "DELETE FROM public.team_conversation_members WHERE conversation_id='$G_DEL' AND profile_id='$P_DORA';"
expect_value 'B.17 saida do membro comum aplicada' '0' \
  "SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$G_DEL' AND profile_id='$P_DORA';"
psql_sql "INSERT INTO public.team_conversation_members (conversation_id, profile_id, member_role) VALUES ('$G_DEL','$P_DORA','member');" >/dev/null

expect_ok_as 'B.18 promocao canonica: owner promove DORA a owner via RPC' \
  "$OTTO" "SELECT public.set_team_member_role('$G_DEL','$P_DORA','owner');"
expect_ok_as 'B.19 com dois owners, OTTO ja pode sair (nao e mais o ultimo)' \
  "$OTTO" "DELETE FROM public.team_conversation_members WHERE conversation_id='$G_DEL' AND profile_id='$P_OTTO';"
expect_value 'B.20 OTTO saiu de verdade' '0' \
  "SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$G_DEL' AND profile_id='$P_OTTO';"
expect_ok_as 'B.21 DORA virou a ultima owner: a guarda passa a proteger ELA' \
  "$DORA" "DELETE FROM public.team_conversation_members WHERE conversation_id='$G_DEL' AND profile_id='$P_DORA';"
expect_value 'B.22 a linha dela continua (grupo nao fica sem owner)' '1' \
  "SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$G_DEL' AND profile_id='$P_DORA';"

expect_error_as 'B.23 rebaixar o ultimo owner pela RPC tambem e barrado' \
  'last_owner_must_transfer_ownership' "$OTTO" \
  "SELECT public.set_team_member_role('$G_ROLE','$P_OTTO','member');"

expect_ok_as 'B.24 conversa direta nao entra na guarda: owner de direct sai normal' \
  "$OTTO" "DELETE FROM public.team_conversation_members WHERE conversation_id='$G_DIR' AND profile_id='$P_OTTO';"
expect_value 'B.25 saida aplicada na direct' '0' \
  "SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$G_DIR' AND profile_id='$P_OTTO';"

expect_error_as 'B.26 transferir grupo alheio e recusado' \
  'not_authorized' "$EVA" \
  "SELECT public.transfer_team_conversation_ownership('$G_TR','$P_MARIA');"
expect_error_as 'B.27 alvo tem de ser membro' \
  'target_not_a_member' "$OTTO" \
  "SELECT public.transfer_team_conversation_ownership('$G_TR','$P_EVA');"
expect_ok_as 'B.28 owner transfere para membro pela RPC canonica' \
  "$OTTO" "SELECT public.transfer_team_conversation_ownership('$G_TR','$P_MARIA');"
expect_value 'B.29 created_by migrado' "$P_MARIA" \
  "SELECT created_by FROM public.team_conversations WHERE id='$G_TR';"
expect_value 'B.30 novo owner com member_role=owner e antigo rebaixado a member' '2' \
  "SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$G_TR' AND ((profile_id='$P_MARIA' AND member_role='owner') OR (profile_id='$P_OTTO' AND member_role='member'));"
expect_ok_as 'B.31 ex-owner (agora member) consegue sair — a transferencia destravou a saida' \
  "$OTTO" "DELETE FROM public.team_conversation_members WHERE conversation_id='$G_TR' AND profile_id='$P_OTTO';"
expect_value 'B.32 OTTO saiu' '0' \
  "SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$G_TR' AND profile_id='$P_OTTO';"

expect_ok_as 'B.33 UPDATE de name continua permitido (coluna concedida)' \
  "$OTTO" "UPDATE public.team_conversations SET name='Renomeado B' WHERE id='$G_OLD';"
expect_ok_as 'B.34 UPDATE de updated_at continua permitido (coluna concedida)' \
  "$OTTO" "UPDATE public.team_conversations SET updated_at=now() WHERE id='$G_OLD';"
expect_error_as 'B.35 UPDATE de created_by agora e PERMISSION DENIED (grant por coluna efetivo)' \
  'permission denied' "$OTTO" "UPDATE public.team_conversations SET created_by='$P_DORA' WHERE id='$G_OLD';"
expect_error_as 'B.36 UPDATE de type tambem negado' \
  'permission denied' "$OTTO" "UPDATE public.team_conversations SET type='direct' WHERE id='$G_OLD';"
expect_error_as 'B.37 UPDATE de department_id tambem negado' \
  'permission denied' "$OTTO" "UPDATE public.team_conversations SET department_id='$DEP1' WHERE id='$G_OLD';"
expect_value 'B.38 created_by intacto depois das tentativas' "$P_OTTO" \
  "SELECT created_by FROM public.team_conversations WHERE id='$G_OLD';"

expect_ok_as 'B.39 admin CANONICO (user_roles, profiles.role=agent) adiciona membro' \
  "$ADM" "INSERT INTO public.team_conversation_members (conversation_id, profile_id) VALUES ('$G_ROLE','$P_EVA');"
expect_error_as 'B.40 profiles.role=admin SEM user_roles nao vale mais (autorizacao canonica)' \
  'row-level security' "$PSEUDO" \
  "INSERT INTO public.team_conversation_members (conversation_id, profile_id) VALUES ('$G_ROLE','$P_DORA');"

printf '\nPASS: TC-003 — bootstrap atomico por RPC (sem orfao), INSERT direto so cria member, ultimo owner protegido na saida e no rebaixamento, transferencia canonica e grants efetivos por coluna.\n'
