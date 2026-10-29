#!/usr/bin/env bash
# QA5-10 (P1, cartão t_ab98c520) — frestas de 20261004185228 no team chat:
#   a) create_team_group_conversation deixava QUALQUER autenticado criar a conversa
#      de qualquer departamento e virar owner dela;
#   b) transfer_team_conversation_ownership aceitava o ator só por ser o created_by,
#      então quem já saiu do grupo (sem membership) seguia transferindo a
#      propriedade de fora;
#   c) a tela fazia DELETE direto e mostrava sucesso quando a policy filtrava a
#      linha do último owner (0 linhas afetadas).
#
#   BLOCO A — estado com só 20261004185228 aplicada (defeitos a e b visíveis).
#   BLOCO B — + 20261005110431: não-membro do departamento não cria nem recebe o id,
#             ex-membro não transfere, e a guarda de último owner segue de pé
#             (owner só sai depois de transferir).

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration_base="$repo_root/supabase/migrations/20261004185228_team_membership_bootstrap_owner_grants.sql"
migration_fix="$repo_root/supabase/migrations/20261005110431_team_chat_department_create_transfer_guards.sql"
postgres_image="${TEAM_DEPT_GUARD_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-team-dept-guard-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-team-dept-guard-test-[0-9]+$ ]]; then
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
[[ -f "$migration_base" ]] || fail "migration base nao encontrada: $migration_base"
[[ -f "$migration_fix" ]] || fail "migration da correcao nao encontrada: $migration_fix"

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
  is_active boolean DEFAULT true,
  department_id uuid
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

INSERT INTO public.profiles (id, user_id, role, is_active, department_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'agent', true, NULL), -- ATILA (sem depto)
  ('a0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'agent', true, NULL), -- DORA
  ('a0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'agent', true, NULL), -- EVA (fora de todo depto)
  ('a0000000-0000-0000-0000-000000000004', '44444444-4444-4444-4444-444444444444', 'agent', true, NULL), -- OTTO
  ('a0000000-0000-0000-0000-000000000005', '55555555-5555-5555-5555-555555555555', 'agent', true, NULL), -- MARIA
  ('a0000000-0000-0000-0000-000000000006', '66666666-6666-6666-6666-666666666666', 'agent', true, NULL), -- ADMIN canonico (user_roles)
  ('a0000000-0000-0000-0000-000000000007', '77777777-7777-7777-7777-777777777777', 'agent', true, 'd0000000-0000-0000-0000-000000000001'), -- NINA (depto DEP1)
  ('a0000000-0000-0000-0000-000000000008', '88888888-8888-8888-8888-888888888888', 'agent', true, 'd0000000-0000-0000-0000-000000000001'); -- CARLOS (depto DEP1)

INSERT INTO public.user_roles (user_id, role) VALUES
  ('66666666-6666-6666-6666-666666666666', 'admin');

INSERT INTO public.departments (id, name) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'Comercial'),
  ('d0000000-0000-0000-0000-000000000002', 'Suporte');

-- G_LEAVE: OTTO é o ÚNICO owner; DORA é member (caso 1: último dono não sai sem transferir)
-- G_EX: criada por OTTO, mas OTTO JÁ SAIU (sem linha de membro) — DORA owner + MARIA member
--       (caso 3: ex-membro segue created_by e tentava transferir de fora)
-- G_MC: CARLOS criou e é member (não-owner); DORA owner + MARIA member
--       (controle: criador-membro não-owner mantém a capacidade antiga)
-- G_ADM: OTTO owner + EVA member (controle: admin não-membro transfere)
INSERT INTO public.team_conversations (id, type, name, created_by) VALUES
  ('e0000000-0000-0000-0000-00000000000a', 'group', 'Grupo Saida',   'a0000000-0000-0000-0000-000000000004'),
  ('e0000000-0000-0000-0000-00000000000b', 'group', 'Grupo ExDono', 'a0000000-0000-0000-0000-000000000004'),
  ('e0000000-0000-0000-0000-00000000000c', 'group', 'Grupo MembroCriador', 'a0000000-0000-0000-0000-000000000008'),
  ('e0000000-0000-0000-0000-00000000000d', 'group', 'Grupo Admin',  'a0000000-0000-0000-0000-000000000004');

INSERT INTO public.team_conversation_members (conversation_id, profile_id, member_role) VALUES
  ('e0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000004', 'owner'),
  ('e0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000002', 'member'),
  ('e0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000002', 'owner'),
  ('e0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000005', 'member'),
  ('e0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-000000000008', 'member'),
  ('e0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-000000000002', 'owner'),
  ('e0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-000000000005', 'member'),
  ('e0000000-0000-0000-0000-00000000000d', 'a0000000-0000-0000-0000-000000000004', 'owner'),
  ('e0000000-0000-0000-0000-00000000000d', 'a0000000-0000-0000-0000-000000000003', 'member');
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null
psql_file "$migration_base" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

ATILA='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
DORA='{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'
EVA='{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}'
OTTO='{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}'
MARIA='{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}'
ADM='{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}'
NINA='{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}'
CARLOS='{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}'

P_DORA='a0000000-0000-0000-0000-000000000002'
P_EVA='a0000000-0000-0000-0000-000000000003'
P_OTTO='a0000000-0000-0000-0000-000000000004'
P_MARIA='a0000000-0000-0000-0000-000000000005'
P_NINA='a0000000-0000-0000-0000-000000000007'
P_CARLOS='a0000000-0000-0000-0000-000000000008'
DEP1='d0000000-0000-0000-0000-000000000001'
DEP2='d0000000-0000-0000-0000-000000000002'
G_LEAVE='e0000000-0000-0000-0000-00000000000a'
G_EX='e0000000-0000-0000-0000-00000000000b'
G_MC='e0000000-0000-0000-0000-00000000000c'
G_ADM='e0000000-0000-0000-0000-00000000000d'

printf '\n============ BLOCO A — só 20261004185228 (defeitos QA5-10) ============\n'

CONV_A="$(as_user "$EVA" "SELECT public.create_team_group_conversation(NULL, '{}'::uuid[], '$DEP1');" | tail -n1)"
[[ "$CONV_A" =~ ^[0-9a-f-]{36}$ ]] || fail "A.1 esperava uuid na criacao indevida: $CONV_A"
printf '[PASS] %s\n' 'A.1 (DEFEITO) EVA, fora do DEP1 e sem papel admin, cria a conversa do departamento'
expect_value 'A.2 (DEFEITO) ...e vira OWNER da conversa de um departamento alheio' 'owner' \
  "SELECT member_role FROM public.team_conversation_members WHERE conversation_id='$CONV_A' AND profile_id='$P_EVA';"

expect_ok_as 'A.3 (DEFEITO) OTTO, ex-membro que segue created_by, transfere G_EX de fora do grupo' \
  "$OTTO" "SELECT public.transfer_team_conversation_ownership('$G_EX','$P_MARIA');"
expect_value 'A.4 a transferencia indevida foi aplicada' "$P_MARIA" \
  "SELECT created_by FROM public.team_conversations WHERE id='$G_EX';"

expect_ok_as 'A.5 guarda de 20261004185228 ja filtrava o DELETE do ultimo owner (0 linhas, sem erro)' \
  "$OTTO" "DELETE FROM public.team_conversation_members WHERE conversation_id='$G_LEAVE' AND profile_id='$P_OTTO';"
expect_value 'A.6 ...mas a linha do ultimo owner continuava la (o app mostrava sucesso)' '1' \
  "SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$G_LEAVE' AND profile_id='$P_OTTO';"

printf '\n============ BLOCO B — + 20261005110431 (correção) ============\n'
psql_file "$migration_fix" >/dev/null
psql_file "$tmp_dir/seed.sql" >/dev/null

# --- caso "não-membro não cria" -------------------------------------------------
expect_error_as 'B.1 EVA (fora do DEP1, sem papel) NAO cria a conversa do departamento' \
  'department_membership_required' "$EVA" \
  "SELECT public.create_team_group_conversation(NULL, '{}'::uuid[], '$DEP1');"
expect_value 'B.2 nenhuma conversa de departamento nasceu da tentativa' '0' \
  "SELECT count(*) FROM public.team_conversations WHERE type='department';"

CONV_B="$(as_user "$NINA" "SELECT public.create_team_group_conversation(NULL, '{}'::uuid[], '$DEP1');" | tail -n1)"
[[ "$CONV_B" =~ ^[0-9a-f-]{36}$ ]] || fail "B.3 membro do departamento nao criou: $CONV_B"
printf '[PASS] %s\n' 'B.3 NINA, perfil vinculado ao DEP1, cria a conversa do proprio departamento'
expect_value 'B.4 ...e vira owner dela' 'owner' \
  "SELECT member_role FROM public.team_conversation_members WHERE conversation_id='$CONV_B' AND profile_id='$P_NINA';"
expect_error_as 'B.5 com a conversa do DEP1 ja existente, EVA nem recebe o id (guarda antes do get-or-create)' \
  'department_membership_required' "$EVA" \
  "SELECT public.create_team_group_conversation(NULL, '{}'::uuid[], '$DEP1');"
CONV_B2="$(as_user "$CARLOS" "SELECT public.create_team_group_conversation(NULL, '{}'::uuid[], '$DEP1');" | tail -n1)"
[[ "$CONV_B2" == "$CONV_B" ]] || fail "B.6 get-or-create quebrou: $CONV_B2 != $CONV_B"
printf '[PASS] %s\n' 'B.6 outro membro do DEP1 recebe a MESMA conversa (get-or-create intacto)'

CONV_ADM="$(as_user "$ADM" "SELECT public.create_team_group_conversation(NULL, '{}'::uuid[], '$DEP2');" | tail -n1)"
[[ "$CONV_ADM" =~ ^[0-9a-f-]{36}$ ]] || fail "B.7 admin nao criou: $CONV_ADM"
printf '[PASS] %s\n' 'B.7 admin (user_roles) cria conversa de departamento que nao e o dele'

CONV_G="$(as_user "$ATILA" "SELECT public.create_team_group_conversation('Livre', '{}'::uuid[], NULL);" | tail -n1)"
[[ "$CONV_G" =~ ^[0-9a-f-]{36}$ ]] || fail "B.8 grupo livre falhou: $CONV_G"
printf '[PASS] %s\n' 'B.8 criacao de grupo comum segue livre para qualquer autenticado'

# --- caso "ex-membro não transfere" ----------------------------------------------
expect_error_as 'B.9 OTTO, ex-membro que segue created_by, NAO transfere mais G_EX' \
  'actor_not_a_member' "$OTTO" \
  "SELECT public.transfer_team_conversation_ownership('$G_EX','$P_MARIA');"
expect_value 'B.10 created_by intacto depois da tentativa de fora' "$P_OTTO" \
  "SELECT created_by FROM public.team_conversations WHERE id='$G_EX';"
expect_error_as 'B.11 quem nunca foi membro tambem e barrado pela mesma guarda' \
  'actor_not_a_member' "$EVA" \
  "SELECT public.transfer_team_conversation_ownership('$G_EX','$P_MARIA');"
expect_error_as 'B.12 membro comum (nem owner nem criador) segue sem poder transferir' \
  'not_authorized' "$MARIA" \
  "SELECT public.transfer_team_conversation_ownership('$G_EX','$P_EVA');"
expect_ok_as 'B.13 controle: owner membro transfere normalmente' \
  "$DORA" "SELECT public.transfer_team_conversation_ownership('$G_EX','$P_MARIA');"
expect_value 'B.14 created_by migrado para a nova owner' "$P_MARIA" \
  "SELECT created_by FROM public.team_conversations WHERE id='$G_EX';"
expect_ok_as 'B.15 criador que AINDA e membro (member) mantem a capacidade anterior' \
  "$CARLOS" "SELECT public.transfer_team_conversation_ownership('$G_MC','$P_MARIA');"
expect_ok_as 'B.16 admin nao-membro transfere (papel canonico)' \
  "$ADM" "SELECT public.transfer_team_conversation_ownership('$G_ADM','$P_EVA');"

# --- caso "último dono não sai sem transferir" -----------------------------------
expect_ok_as 'B.17 DELETE do ultimo owner nao estoura erro: a RLS filtra a linha' \
  "$OTTO" "DELETE FROM public.team_conversation_members WHERE conversation_id='$G_LEAVE' AND profile_id='$P_OTTO';"
expect_value 'B.18 ...mas a linha do ultimo owner CONTINUA la: ele nao sai sem transferir' '1' \
  "SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$G_LEAVE' AND profile_id='$P_OTTO';"
expect_ok_as 'B.19 caminho canonico: OTTO transfere a propriedade para DORA' \
  "$OTTO" "SELECT public.transfer_team_conversation_ownership('$G_LEAVE','$P_DORA');"
expect_ok_as 'B.20 depois de transferir, OTTO (agora member) sai de verdade' \
  "$OTTO" "DELETE FROM public.team_conversation_members WHERE conversation_id='$G_LEAVE' AND profile_id='$P_OTTO';"
expect_value 'B.21 saida aplicada e o grupo ficou com owner (DORA)' '1' \
  "SELECT count(*) FROM public.team_conversation_members WHERE conversation_id='$G_LEAVE' AND member_role='owner' AND profile_id='$P_DORA';"

printf '\nPASS: QA5-10 — departamento exige membro/admin na criacao, ex-membro nao transfere e ultimo owner so sai depois de transferir.\n'
