#!/usr/bin/env bash
# Contrato de higiene de papel das policies TO public -> TO authenticated E da correcao
# da clausula morta de message_reactions (message_reactions.user_id referencia profiles.id).
#
# Migration do endurecimento (objeto deste cartao):
#   supabase/migrations/20261011003022_harden_policy_roles_and_message_reactions_clause.sql
#   - item 1: ALTER POLICY ... TO authenticated nas 9 policies de conversation_snoozes /
#     favorite_contacts / pinned_conversations.
#   - item 2: recria message_reactions_select_policy usando
#     user_id = public.get_profile_id_for_user(auth.uid()).
# Migration de recuperacao (contrato ja existente, preservado aqui):
#   supabase/migrations/20260930142000_scope_public_policies_to_authenticated.sql
#
# BLOCO A (estado de autoria): 14 policies TO public; a clausula "reacoes proprias" nao
#   enxerga a propria reacao (0 linhas).
# BLOCO B (endurecimento sobre o estado de autoria): as 9 citadas viram {authenticated}
#   (as 5 restantes seguem {public}); o dono passa a enxergar a propria reacao (1);
#   outro usuario e anon seguem negados.
# BLOCO R: o rollback devolve tudo ao estado de autoria (9 de volta a {public}, dono volta a 0).
# BLOCO D (recuperacao 20260930142000 sobre o estado LIMPO pos-rollback): 14 {public}
#   conferidos logo antes de aplicar; depois 0 {public}/15 {authenticated}; a clausula
#   antiga segue morta (dono 0) porque a recuperacao nao toca reacoes.
# BLOCO E (ordem real de replay: recuperacao primeiro, endurecimento depois): o
#   endurecimento aplica sem erro sobre as 9 ja {authenticated}; o dono passa a 1;
#   BOB e anon seguem em 0.
# BLOCO C: reaplicar o endurecimento e idempotente.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20260930142000_scope_public_policies_to_authenticated.sql"
harden_migration="${PUBLIC_POLICY_TEST_HARDEN_MIGRATION:-$repo_root/supabase/migrations/20261011003022_harden_policy_roles_and_message_reactions_clause.sql}"
postgres_image="${PUBLIC_POLICY_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-public-policy-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-public-policy-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }

expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}

expect_ok() { local l="$1" s="$2"; psql_sql "$s" >/dev/null || fail "$l: deveria ter sucesso"; printf '[PASS] %s\n' "$l"; }

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"
[[ -f "$harden_migration" ]] || fail "migration de endurecimento nao encontrada: $harden_migration"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1)); (( ready_checks >= 2 )) && break
  else ready_checks=0; fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
       nullif(current_setting('request.jwt.claim.sub', true), '')
     ), '')::uuid $$;
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT false $$;
CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE);
CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT id FROM public.profiles WHERE user_id = _user_id LIMIT 1 $$;
CREATE FUNCTION public.get_visible_agent_ids(_user_id uuid) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT NULL::uuid WHERE false $$;

CREATE TABLE public.favorite_contacts (id uuid PRIMARY KEY, user_id uuid NOT NULL, contact_id uuid NOT NULL);
CREATE TABLE public.pinned_conversations (id uuid PRIMARY KEY, user_id uuid NOT NULL, conversation_id uuid NOT NULL);
CREATE TABLE public.conversation_snoozes (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.login_attempts (id uuid PRIMARY KEY, user_id uuid, email text);
CREATE TABLE public.talkx_templates (id uuid PRIMARY KEY, name text, created_by uuid);
CREATE TABLE public.contacts (id uuid PRIMARY KEY, assigned_to uuid);
CREATE TABLE public.message_reactions (id uuid PRIMARY KEY, message_id uuid NOT NULL, user_id uuid, contact_id uuid);

ALTER TABLE public.favorite_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pinned_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_snoozes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talkx_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- As 14 policies TO public (nomes exatos de producao).
CREATE POLICY "Users can create own snoozes" ON public.conversation_snoozes FOR INSERT TO public WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can create own favorites" ON public.favorite_contacts FOR INSERT TO public WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own favorites" ON public.favorite_contacts FOR DELETE TO public USING (user_id = auth.uid());
CREATE POLICY "Users can update own favorites" ON public.favorite_contacts FOR UPDATE TO public USING (user_id = auth.uid());
CREATE POLICY "Users can view own favorites" ON public.favorite_contacts FOR SELECT TO public USING (user_id = auth.uid());

CREATE POLICY "Admins and supervisors can view login attempts" ON public.login_attempts FOR SELECT TO public USING (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Users can create own pins" ON public.pinned_conversations FOR INSERT TO public WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own pins" ON public.pinned_conversations FOR DELETE TO public USING (user_id = auth.uid());
CREATE POLICY "Users can update own pins" ON public.pinned_conversations FOR UPDATE TO public USING (user_id = auth.uid());
CREATE POLICY "Users can view own pins" ON public.pinned_conversations FOR SELECT TO public USING (user_id = auth.uid());

CREATE POLICY "talkx_templates_delete" ON public.talkx_templates FOR DELETE TO public USING (created_by = auth.uid());
CREATE POLICY "talkx_templates_insert" ON public.talkx_templates FOR INSERT TO public WITH CHECK (created_by = auth.uid());
CREATE POLICY "talkx_templates_select" ON public.talkx_templates FOR SELECT TO public USING (created_by = auth.uid());
CREATE POLICY "talkx_templates_update" ON public.talkx_templates FOR UPDATE TO public USING (created_by = auth.uid());

-- Forma ANTERIOR da policy de reacoes (20260830110000): clausula morta user_id = auth.uid(),
-- sendo message_reactions.user_id um profiles.id.
CREATE POLICY "message_reactions_select_policy" ON public.message_reactions
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    OR user_id = auth.uid()
    OR contact_id IN (SELECT c.id FROM public.contacts c WHERE c.assigned_to IN (SELECT public.get_visible_agent_ids(auth.uid())))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorite_contacts TO authenticated, anon;
GRANT SELECT ON public.message_reactions TO authenticated, anon;
GRANT SELECT ON public.contacts TO authenticated, anon;
GRANT SELECT ON public.profiles TO authenticated, anon;

-- Perfis: ALICE e BOB (user_id = auth.users.id). Reacao autorada por ALICE (user_id = profiles.id).
INSERT INTO public.profiles (id, user_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('a0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222');
INSERT INTO public.message_reactions (id, message_id, user_id, contact_id) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', NULL);
SQL

psql_file "$tmp_dir/pre.sql"

ALICE="{\"sub\":\"11111111-1111-1111-1111-111111111111\",\"role\":\"authenticated\"}"
BOB="{\"sub\":\"22222222-2222-2222-2222-222222222222\",\"role\":\"authenticated\"}"
UID_ALICE='11111111-1111-1111-1111-111111111111'
PID_ALICE='a0000000-0000-0000-0000-000000000001'

echo '── BLOCO A: ANTES ─────────────────────────────────────────────────────────────────'
expect_value 'A1 14 policies com papel {public}' '14' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND roles::text='{public}'"
expect_value 'A2 anon lê 0 favoritos (RLS bloqueia)' '0' \
  "SET ROLE anon; SELECT count(*) FROM public.favorite_contacts"
expect_value 'A3 dono NÃO enxerga a própria reação (cláusula morta user_id = auth.uid())' '0' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); SELECT count(*) FROM public.message_reactions WHERE user_id='$PID_ALICE'"

echo
echo '── Aplicando a migration de endurecimento ─────────────────────────────────────────'
psql_file "$harden_migration"

echo
echo '── BLOCO B: DEPOIS DO ENDURECIMENTO ───────────────────────────────────────────────'
expect_value 'B1 5 policies ainda {public} (só as 9 citadas mudam)' '5' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND roles::text='{public}'"
expect_value 'B2 10 policies {authenticated} (9 endurecidas + message_reactions)' '10' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND roles::text='{authenticated}'"
expect_value 'B3 anon segue lendo 0 favoritos (sem efeito funcional)' '0' \
  "SET ROLE anon; SELECT count(*) FROM public.favorite_contacts"
expect_value 'B4 dono agora enxerga a própria reação (cláusula corrigida)' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); SELECT count(*) FROM public.message_reactions WHERE user_id='$PID_ALICE'"
expect_value 'B5 outro usuário existente NÃO vê a reação da dona' '0' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$BOB',false); SELECT count(*) FROM public.message_reactions"
expect_value 'B6 anon não lê nenhuma reação' '0' \
  "SET ROLE anon; SELECT count(*) FROM public.message_reactions"

echo
echo '── BLOCO R: ROLLBACK DO ENDURECIMENTO ─────────────────────────────────────────────'
awk '/^-- Rollback \(SQL executável/{f=1;next} f && /^--   /{sub(/^--   /,"");print;next} f{exit}' \
  "$harden_migration" > "$tmp_dir/harden_rollback.sql"
[[ -s "$tmp_dir/harden_rollback.sql" ]] || fail 'rollback da migration de endurecimento vazio'
grep -q 'message_reactions_select_policy' "$tmp_dir/harden_rollback.sql" || fail 'rollback sem a recriação da policy de reações'
grep -q 'to public' "$tmp_dir/harden_rollback.sql" || fail 'rollback sem a volta das policies a public'
psql_file "$tmp_dir/harden_rollback.sql"
expect_value 'R1 as 9 voltam a {public} (14 no total)' '14' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND roles::text='{public}'"
expect_value 'R2 dono volta a NÃO enxergar a própria reação (cláusula antiga restaurada)' '0' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); SELECT count(*) FROM public.message_reactions WHERE user_id='$PID_ALICE'"
expect_value 'R3 anon segue lendo 0 favoritos (rollback não reabre acesso)' '0' \
  "SET ROLE anon; SELECT count(*) FROM public.favorite_contacts"

echo
echo '── BLOCO D: CONTRATO ANTIGO PRESERVADO (20260930142000 SOBRE ESTADO LIMPO) ───────'
expect_value 'D0 14 policies {public} logo antes da recuperação (estado de autoria)' '14' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND roles::text='{public}'"
psql_file "$migration"
expect_value 'D1 0 policies com papel {public}' '0' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND roles::text='{public}'"
expect_value 'D2 15 policies com papel {authenticated}' '15' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND roles::text='{authenticated}'"
expect_value 'D3 anon segue lendo 0 favoritos (sem efeito funcional)' '0' \
  "SET ROLE anon; SELECT count(*) FROM public.favorite_contacts"
expect_ok 'D4 authenticated insere o próprio favorito (política preservada)' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); INSERT INTO public.favorite_contacts (id,user_id,contact_id) VALUES ('d0000000-0000-0000-0000-000000000001','$UID_ALICE','e0000000-0000-0000-0000-000000000001')"
expect_value 'D5 authenticated lê o próprio favorito' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); SELECT count(*) FROM public.favorite_contacts WHERE user_id='$UID_ALICE'"
expect_value 'D6 cláusula antiga preservada: dono segue sem enxergar a própria reação (recuperação não toca reações)' '0' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); SELECT count(*) FROM public.message_reactions WHERE user_id='$PID_ALICE'"

echo
echo '── BLOCO E: ORDEM REAL DE REPLAY (RECUPERAÇÃO PRIMEIRO, ENDURECIMENTO DEPOIS) ────'
psql_file "$harden_migration" || fail 'E0 endurecimento sobre as 9 já {authenticated} deveria aplicar sem erro'
expect_value 'E1 0 policies com papel {public} (endurecimento não reabre nada)' '0' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND roles::text='{public}'"
expect_value 'E2 15 policies com papel {authenticated}' '15' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND roles::text='{authenticated}'"
expect_value 'E3 anon segue lendo 0 favoritos' '0' \
  "SET ROLE anon; SELECT count(*) FROM public.favorite_contacts"
expect_value 'E4 dono passa a enxergar a própria reação (cláusula corrigida)' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); SELECT count(*) FROM public.message_reactions WHERE user_id='$PID_ALICE'"
expect_value 'E5 outro usuário existente NÃO vê a reação da dona' '0' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$BOB',false); SELECT count(*) FROM public.message_reactions"
expect_value 'E6 anon não lê nenhuma reação' '0' \
  "SET ROLE anon; SELECT count(*) FROM public.message_reactions"

echo
echo '── BLOCO C: REAPLICAR O ENDURECIMENTO (IDEMPOTÊNCIA) ─────────────────────────────'
psql_file "$harden_migration"
expect_value 'C1 0 policies {public} de novo (reaplicação limpa)' '0' \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND roles::text='{public}'"
expect_value 'C2 dono segue enxergando a própria reação' '1' \
  "SET ROLE authenticated; SELECT set_config('request.jwt.claims','$ALICE',false); SELECT count(*) FROM public.message_reactions WHERE user_id='$PID_ALICE'"

printf '\n[OK] higiene de papel das policies e cláusula de message_reactions verificadas\n'
