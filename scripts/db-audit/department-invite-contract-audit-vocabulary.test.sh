#!/usr/bin/env bash
# TC-008 / item 163 (P2) — "Contrato de convites e vocabulário de auditoria permanecem legados"
# (docs/reconciliation/reports/team-chat/CODE_DATABASE_TRUTH_TEAM_CHAT.md; planos F09/F15/F17/TC-17/TC-28).
#
# Aplica as MIGRATIONS REAIS do módulo (20260928500000/e14, 510000/e15, 520000/e16, 530000/e17) num
# Postgres 17 descartável e roda com o PAPEL REAL (`SET ROLE authenticated` + `request.jwt.claims`).
#
#   BLOCO A — estado ANTERIOR (defeito reproduzido com as migrations reais):
#             * CHECK de department_audit_logs.action com os 12 verbos antigos: aceita
#               'update_settings' e REJEITA o canônico 'invite_created';
#             * create_department_invite devolve código de 12 caracteres e grava
#               action 'create_invite' COM o código em details;
#             * accept_department_invite grava 'accept_invite' com o código em details,
#               fecha o convite como status 'used' e não distingue quem já é do departamento;
#             * CHECK do código aceita 7 caracteres (length entre 6 e 64).
#   BLOCO B — migration do cartão aplicada:
#             * vocabulário único de 8 verbos (invite_created, invite_revoked, invite_accepted,
#               member_added, member_removed, whatsapp_updated, department_transferred,
#               access_requested) — os 12 antigos passam a ser rejeitados;
#             * código '^[A-Z0-9]{8}$' em INSERT novo (trigger que não quebra UPDATE
#               de legado pending), status canônico e use_count <= max_uses;
#             * RPCs in-place: código de 8 caracteres, autorização por user_roles
#               (is_admin_or_supervisor), auditoria SEM o código, 'already_member' sem
#               consumir uso, status final 'accepted';
#             * linhas legadas (código de 12, status 'used', verbo antigo) sobrevivem: as
#               constraints entram NOT VALID e o formato de código é trigger de INSERT.
#   BLOCO C — o Rollback do próprio arquivo roda e devolve o estado anterior.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261007012808_department_invite_contract_audit_vocabulary.sql"
mig_e14="$repo_root/supabase/migrations/20260928500000_team_chat_e14_department_invitations_schema.sql"
mig_e15="$repo_root/supabase/migrations/20260928510000_team_chat_e15_accept_department_invite_rpc.sql"
mig_e16="$repo_root/supabase/migrations/20260928520000_team_chat_e16_create_department_invite_rpc.sql"
mig_e17="$repo_root/supabase/migrations/20260928530000_team_chat_e17_department_audit_logs_hardening.sql"
postgres_image="${DEPARTMENT_INVITE_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-department-invite-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-department-invite-test-[0-9]+$ ]]; then
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
expect_ok() {
  local l="$1" out
  set +e; out="$(psql_sql "$2" 2>&1)"; st=$?; set -e
  (( st == 0 )) || { printf '%s\n' "$out" >&2; fail "$l: deveria ter sucesso"; }
  printf '[PASS] %s\n' "$l"
}
expect_error() {
  local l="$1" needle="$2" out st
  set +e; out="$(psql_sql "$3" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
for f in "$migration" "$mig_e14" "$mig_e15" "$mig_e16" "$mig_e17"; do
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
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# ---------------------------------------------------------------- esquema ambiente (pré-migrations)
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
  name text,
  email text,
  role text DEFAULT 'agent',
  is_active boolean DEFAULT true,
  department_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- ambiente ao vivo: profiles carrega um BEFORE UPDATE por linha que regrava updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger
  LANGUAGE plpgsql AS $function$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
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

-- department_invitations: forma ao vivo ANTES das migrations do modulo (a tabela base veio do ledger,
-- sem arquivo no repositorio; as 4 constraints e as colunas novas vem da e14).
CREATE TABLE public.department_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  role text NOT NULL DEFAULT 'agent',
  email text NOT NULL DEFAULT ''
);
ALTER TABLE public.department_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY department_invitations_admin_all ON public.department_invitations FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.department_invitations TO authenticated;

-- department_audit_logs: forma ao vivo ANTES da e17 (que revoga DML de authenticated, troca as
-- policies e adiciona profile_name + o CHECK dos 12 verbos).
CREATE TABLE public.department_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  action text NOT NULL,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.department_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY dept_audit_select_authenticated ON public.department_audit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY dept_audit_insert_authenticated ON public.department_audit_logs FOR INSERT TO authenticated WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.department_audit_logs TO authenticated;

GRANT SELECT ON public.profiles, public.departments, public.user_roles TO authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
SQL

psql_file "$tmp_dir/pre.sql" >/dev/null

# MIGRATIONS REAIS do módulo, na ordem: e14 (colunas/constraints) → e15 (accept legado)
# → e16 (create legado) → e17 (hardening da auditoria + CHECK dos 12 verbos).
psql_file "$mig_e14" >/dev/null
psql_file "$mig_e15" >/dev/null
psql_file "$mig_e16" >/dev/null
psql_file "$mig_e17" >/dev/null

# ---------------------------------------------------------------- dados
cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.department_audit_logs;
DELETE FROM public.department_invitations;
DELETE FROM public.user_roles;
DELETE FROM public.profiles;
DELETE FROM public.departments;

INSERT INTO public.departments (id, name) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'Comercial'),
  ('d0000000-0000-0000-0000-000000000002', 'Suporte');

INSERT INTO public.profiles (id, user_id, name, email, role, is_active, department_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'ADM CANONICO', 'adm@exemplo.test', 'agent',  true, NULL),
  ('a0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'ESPELHO',      'esp@exemplo.test', 'admin',  true, NULL),
  ('a0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'MEMBRO',       'mem@exemplo.test', 'agent',  true, NULL),
  ('a0000000-0000-0000-0000-000000000004', '44444444-4444-4444-4444-444444444444', 'MEMBRO2',      'mem2@exemplo.test', 'agent', true, NULL),
  ('a0000000-0000-0000-0000-000000000005', '55555555-5555-5555-5555-555555555555', 'JA NO DEPTO',  'ja@exemplo.test', 'agent',  true, 'd0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000006', '66666666-6666-6666-6666-666666666666', 'MEMBRO3',      'mem3@exemplo.test', 'agent', true, NULL),
  ('a0000000-0000-0000-0000-000000000007', '77777777-7777-7777-7777-777777777777', 'LEGADO PEND',  'legado@exemplo.test', 'agent', true, NULL);

-- admin canonico: a verdade e user_roles (profiles.role fica no espelho 'agent' de proposito)
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin');
SQL

psql_file "$tmp_dir/seed.sql" >/dev/null

ADM='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
ESPELHO='{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'
MEMBRO='{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}'
MEMBRO2='{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}'
JANODEPTO='{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}'
MEMBRO3='{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}'
MEMBRO4='{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}'

P_ADM='a0000000-0000-0000-0000-000000000001'
P_MEMBRO='a0000000-0000-0000-0000-000000000003'
P_MEMBRO2='a0000000-0000-0000-0000-000000000004'
P_JANODEPTO='a0000000-0000-0000-0000-000000000005'
P_MEMBRO3='a0000000-0000-0000-0000-000000000006'
P_MEMBRO4='a0000000-0000-0000-0000-000000000007'
DEP1='d0000000-0000-0000-0000-000000000001'
DEP2='d0000000-0000-0000-0000-000000000002'

printf '\n============ BLOCO A — estado ANTERIOR (defeito) ============\n'

# A.1/A.2 — vocabulário legado de auditoria
expect_ok '(DEFEITO) A.1 CHECK aceita o verbo antigo update_settings' \
  "INSERT INTO public.department_audit_logs(department_id, action, profile_id) VALUES ('$DEP1','update_settings','$P_ADM');"
expect_error '(DEFEITO) A.2 CHECK REJEITA o verbo canonico invite_created' \
  'department_audit_logs_action_check' \
  "INSERT INTO public.department_audit_logs(department_id, action, profile_id) VALUES ('$DEP1','invite_created','$P_ADM');"

# A.3 — create legado: 12 caracteres + codigo em details (quem cria e o espelho profiles.role)
CODE_LEGADO="$(as_user "$ESPELHO" "SELECT (public.create_department_invite('$DEP1', 1, 72))->>'code';" | tail -n1)"
printf '[INFO] A.3 codigo legado gerado: %s\n' "$CODE_LEGADO"
expect_value '(DEFEITO) A.3 codigo do convite tem 12 caracteres (era para ser 8)' '12' \
  "SELECT length(code) FROM public.department_invitations WHERE code='$CODE_LEGADO';"
expect_value '(DEFEITO) A.3b auditoria gravou action create_invite' 'create_invite' \
  "SELECT action FROM public.department_audit_logs WHERE action='create_invite' ORDER BY created_at DESC LIMIT 1;"
expect_value '(DEFEITO) A.3c auditoria gravou o CODIGO dentro de details' 'true' \
  "SELECT (details ? 'code')::text FROM public.department_audit_logs WHERE action='create_invite' ORDER BY created_at DESC LIMIT 1;"
expect_value_as '(DEFEITO) A.3d o ADMIN canonico (user_roles, profiles.role=agent) NAO cria: a RPC le o espelho' 'not_authorized' \
  "$ADM" "SELECT (public.create_department_invite('$DEP1', 1, 72))->>'error';"

# A.4 — accept legado
expect_value_as '(DEFEITO) A.4 accept devolve ok pelo caminho legado' 'true' \
  "$MEMBRO" "SELECT (public.accept_department_invite('$CODE_LEGADO'))->>'ok';"
expect_value '(DEFEITO) A.4b auditoria gravou accept_invite com o CODIGO em details' 'true' \
  "SELECT (details ? 'code')::text FROM public.department_audit_logs WHERE action='accept_invite' ORDER BY created_at DESC LIMIT 1;"
expect_value '(DEFEITO) A.4c convite fechou com status legado used' 'used' \
  "SELECT status FROM public.department_invitations WHERE code='$CODE_LEGADO';"

# A.5 — quem JÁ é do departamento aceita de novo (sem erro already_member)
CODE_LEGADO2="$(as_user "$ESPELHO" "SELECT (public.create_department_invite('$DEP1', 1, 72))->>'code';" | tail -n1)"
expect_value_as '(DEFEITO) A.5 ja-membro aceita o convite do proprio departamento sem erro' 'true' \
  "$JANODEPTO" "SELECT (public.accept_department_invite('$CODE_LEGADO2'))->>'ok';"

# A.6 — CHECK do codigo aceita 7 caracteres
expect_ok '(DEFEITO) A.6 CHECK do codigo aceita 7 caracteres (length entre 6 e 64)' \
  "INSERT INTO public.department_invitations(department_id, code, expires_at) VALUES ('$DEP1','ABCDEFG', now() + interval '1 day');"

# linhas LEGADAS que a migration nova tem de respeitar (codigo de 12, status 'used',
# e tambem codigo de 12 ainda pending: aceitar depois da migration nao pode quebrar
# a credencial emitida antes dela).
psql_sql "INSERT INTO public.department_invitations(department_id, code, expires_at, status, use_count, max_uses)
          VALUES ('$DEP1','LEGADO12CHARS', now() + interval '1 day', 'used', 1, 1);" >/dev/null
psql_sql "INSERT INTO public.department_invitations(department_id, code, expires_at, status, use_count, max_uses)
          VALUES ('$DEP1','LEGACYPEND12', now() + interval '1 day', 'pending', 0, 1);" >/dev/null

printf '\n============ BLOCO B — migration do cartao aplicada ============\n'
psql_file "$migration" >/dev/null

# repõe o estado dos perfis (sem apagar convites/auditoria: as linhas LEGADAS ficam)
cat > "$tmp_dir/seed_reset.sql" <<'SQL'
UPDATE public.profiles SET department_id = NULL;
UPDATE public.profiles SET department_id = 'd0000000-0000-0000-0000-000000000001'
  WHERE id = 'a0000000-0000-0000-0000-000000000005';
DELETE FROM public.user_roles;
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin');
SQL
psql_file "$tmp_dir/seed_reset.sql" >/dev/null

# B.1/B.2 — vocabulário canônico
V_VERBOS='invite_created invite_revoked invite_accepted member_added member_removed whatsapp_updated department_transferred access_requested'
for v in $V_VERBOS; do
  expect_ok "B.1 verbo canonico aceito: $v" \
    "INSERT INTO public.department_audit_logs(department_id, action, profile_id) VALUES ('$DEP1','$v','$P_ADM');"
done
for v in accept_invite create_invite join_department leave_department remove_member update_settings delete_department create_department update_role kick_member create_group delete_group; do
  expect_error "B.2 verbo legado rejeitado: $v" 'department_audit_logs_action_check' \
    "INSERT INTO public.department_audit_logs(department_id, action, profile_id) VALUES ('$DEP1','$v','$P_ADM');"
done

# B.3 — linhas legadas sobreviveram e as constraints sao NOT VALID (a migration nao abortou)
expect_value 'B.3a convite legado (codigo de 12) sobreviveu a migration' '1' \
  "SELECT count(*) FROM public.department_invitations WHERE code='LEGADO12CHARS' AND status='used';"
expect_value 'B.3b as 3 constraints NOT VALID do contrato existem' '3' \
  "SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace
     AND conname IN ('department_audit_logs_action_check',
                     'department_invitations_status_check','department_invitations_use_count_within_max')
     AND convalidated = false;"
expect_value 'B.3b2 trigger de formato do codigo existe para INSERT novo' '1' \
  "SELECT count(*) FROM pg_trigger WHERE tgrelid='public.department_invitations'::regclass
     AND tgname='department_invitations_code_format_insert_trg' AND NOT tgisinternal;"
expect_value_as 'B.3c convite legado pending de 12 caracteres ainda aceita depois da migration' 'true' \
  "$MEMBRO4" "SELECT (public.accept_department_invite('LEGACYPEND12'))->>'ok';"
expect_value 'B.3d convite legado pending aceito fechou como accepted sem trocar o codigo' '1|accepted|LEGACYPEND12' \
  "SELECT use_count || '|' || status || '|' || code FROM public.department_invitations WHERE code='LEGACYPEND12';"

# B.4 — contrato do código e do status para linhas NOVAS
expect_error 'B.4a INSERT direto com codigo de 7 caracteres agora falha' 'department_invitations_code_format' \
  "INSERT INTO public.department_invitations(department_id, code, expires_at) VALUES ('$DEP1','ABCDEFG', now() + interval '1 day');"
expect_error 'B.4b INSERT direto com status legado used agora falha' 'department_invitations_status_check' \
  "INSERT INTO public.department_invitations(department_id, code, expires_at, status) VALUES ('$DEP1','AAAAAAAA', now() + interval '1 day', 'used');"
expect_error 'B.4c INSERT direto com use_count > max_uses falha' 'department_invitations_use_count_within_max' \
  "INSERT INTO public.department_invitations(department_id, code, expires_at, max_uses, use_count) VALUES ('$DEP1','BBBBBBBB', now() + interval '1 day', 1, 2);"

# B.5 — create: código canônico, auditoria sem o código, autorização por user_roles
CODE1="$(as_user "$ADM" "SELECT (public.create_department_invite('$DEP1', 1, 72))->>'code';" | tail -n1)"
printf '[INFO] B.5 codigo canonico gerado: %s\n' "$CODE1"
[[ "$CODE1" =~ ^[A-Z0-9]{8}$ ]] || fail "B.5 codigo nao esta em ^[A-Z0-9]{8}\$: '$CODE1'"
printf '[PASS] %s\n' 'B.5 codigo novo em ^[A-Z0-9]{8}$'
expect_value 'B.5b auditoria nova usa invite_created' 'invite_created' \
  "SELECT action FROM public.department_audit_logs WHERE details->>'invite_id' = (SELECT id::text FROM public.department_invitations WHERE code='$CODE1');"
expect_value 'B.5c auditoria NAO guarda o codigo em details' 'false' \
  "SELECT (details ? 'code')::text FROM public.department_audit_logs WHERE details->>'invite_id' = (SELECT id::text FROM public.department_invitations WHERE code='$CODE1');"
expect_value_as 'B.5d autorizacao canonica: admin de user_roles (profiles.role=agent) cria' 'true' \
  "$ADM" "SELECT (public.create_department_invite('$DEP1', 1, 72))->>'ok';"
expect_value_as 'B.5e ESPELHO fora de user_roles nao cria mais (profiles.role nao autoriza)' 'false' \
  "$ESPELHO" "SELECT (public.create_department_invite('$DEP1', 1, 72))->>'ok';"

# B.6 — 10 criacoes: 10 codigos, todos canonicos e distintos
for i in $(seq 1 10); do
  as_user "$ADM" "SELECT public.create_department_invite('$DEP2', 1, 72);" >/dev/null
done
expect_value 'B.6a 10 codigos criados no DEP2, todos no formato canonico' '10' \
  "SELECT count(*) FROM public.department_invitations WHERE department_id='$DEP2' AND code ~ '^[A-Z0-9]{8}\$';"
expect_value 'B.6b nenhum codigo repetido' '0' \
  "SELECT count(*) FROM (SELECT code FROM public.department_invitations GROUP BY code HAVING count(*) > 1) x;"

# B.7 — accept canônico: status final, auditoria sem código, sem already_member falso
# linha antes/depois do gatilho update_profiles_updated_at (BEFORE UPDATE por linha)
T0_UPD="$(psql_sql 'select extract(epoch from clock_timestamp())::text;' | tail -n1)"
UPD_MEMBRO_ANTES="$(psql_sql "select extract(epoch from updated_at)::text from public.profiles where id='$P_MEMBRO';" | tail -n1)"
UPD_JANO_ANTES="$(psql_sql "select extract(epoch from updated_at)::text from public.profiles where id='$P_JANODEPTO';" | tail -n1)"
expect_value_as 'B.7a accept devolve ok' 'true' "$MEMBRO" "SELECT (public.accept_department_invite('$CODE1'))->>'ok';"
expect_value 'B.7b perfil entrou no departamento' "$DEP1" \
  "SELECT department_id FROM public.profiles WHERE id='$P_MEMBRO';"
expect_value 'B.7c convite fechou com status canonico accepted' 'accepted' \
  "SELECT status FROM public.department_invitations WHERE code='$CODE1';"
expect_value 'B.7d auditoria invite_accepted sem o codigo' 'false' \
  "SELECT (details ? 'code')::text FROM public.department_audit_logs WHERE action='invite_accepted' ORDER BY created_at DESC LIMIT 1;"
expect_value_as 'B.7e segundo accept do mesmo codigo: invalid_or_expired_code' 'invalid_or_expired_code' \
  "$MEMBRO2" "SELECT (public.accept_department_invite('$CODE1'))->>'error';"
expect_value 'B.7f o accept tocou UMA linha de profiles (nao e backfill)' '1' \
  "SELECT count(*) FROM public.profiles WHERE updated_at >= to_timestamp($T0_UPD);"
expect_value 'B.7g ...e a linha tocada e a do aceitante' 'true' \
  "SELECT (id = '$P_MEMBRO')::text FROM public.profiles WHERE updated_at >= to_timestamp($T0_UPD);"
expect_value 'B.7h updated_at do aceitante avancou (gatilho do ambiente, 1 linha so)' 'true' \
  "SELECT (extract(epoch from updated_at) > $UPD_MEMBRO_ANTES)::text FROM public.profiles WHERE id='$P_MEMBRO';"
expect_value 'B.7i updated_at dos outros perfis NAO mudou' "$UPD_JANO_ANTES" \
  "SELECT extract(epoch from updated_at)::text FROM public.profiles WHERE id='$P_JANODEPTO';"

# B.8 — already_member sem consumir uso
CODE8="$(as_user "$ADM" "SELECT (public.create_department_invite('$DEP1', 2, 72))->>'code';" | tail -n1)"
expect_value_as 'B.8a ja-membro recebe already_member' 'already_member' \
  "$JANODEPTO" "SELECT (public.accept_department_invite('$CODE8'))->>'error';"
expect_value 'B.8b ...e o uso NAO foi consumido' '0' \
  "SELECT use_count FROM public.department_invitations WHERE code='$CODE8';"
expect_value 'B.8c ...e o convite segue pending' 'pending' \
  "SELECT status FROM public.department_invitations WHERE code='$CODE8';"

# B.9 — max_uses=2: dois aceites, status só fecha no último
expect_value_as 'B.9a primeiro aceite de um convite com 2 usos' 'true' "$MEMBRO2" \
  "SELECT (public.accept_department_invite('$CODE8'))->>'ok';"
expect_value 'B.9b use_count=1 e o convite segue pending' '1|pending' \
  "SELECT use_count || '|' || status FROM public.department_invitations WHERE code='$CODE8';"
expect_value_as 'B.9c segundo aceite (MEMBRO3)' 'true' "$MEMBRO3" \
  "SELECT (public.accept_department_invite('$CODE8'))->>'ok';"
expect_value 'B.9d use_count=2, status accepted e used_by gravado' '2|accepted' \
  "SELECT use_count || '|' || status FROM public.department_invitations WHERE code='$CODE8';"
expect_value 'B.9e used_by aponta para o ultimo aceite' "$P_MEMBRO3" \
  "SELECT used_by FROM public.department_invitations WHERE code='$CODE8';"
expect_value_as 'B.9f terceiro aceite do convite esgotado: invalid_or_expired_code' 'invalid_or_expired_code' \
  "$MEMBRO" "SELECT (public.accept_department_invite('$CODE8'))->>'error';"

# B.10 — entrada inválida e limites
expect_value_as 'B.10a codigo vazio: invalid_or_expired_code' 'invalid_or_expired_code' \
  "$MEMBRO" "SELECT (public.accept_department_invite('   '))->>'error';"
expect_value_as 'B.10b codigo nulo: invalid_or_expired_code' 'invalid_or_expired_code' \
  "$MEMBRO" "SELECT (public.accept_department_invite(NULL))->>'error';"
expect_value_as 'B.10c sem JWT nao cria convite' 'not_authenticated' \
  '{"role":"authenticated"}' "SELECT (public.create_department_invite('$DEP1', 1, 72))->>'error';"
CODE_NEG="$(as_user "$ADM" "SELECT (public.create_department_invite('$DEP1', -5, 72))->>'code';" | tail -n1)"
expect_value 'B.10d max_uses negativo vira 1 (greatest)' '1' \
  "SELECT max_uses FROM public.department_invitations WHERE code='$CODE_NEG';"

# B.11 — nenhum GRANT/papel mudou nas duas RPCs
expect_value 'B.11a authenticated pode executar create_department_invite' 'true' \
  "SELECT has_function_privilege('authenticated','public.create_department_invite(uuid,integer,integer)','EXECUTE')::text;"
expect_value 'B.11b anon NAO pode executar create_department_invite' 'false' \
  "SELECT has_function_privilege('anon','public.create_department_invite(uuid,integer,integer)','EXECUTE')::text;"
expect_value 'B.11c anon NAO pode executar accept_department_invite' 'false' \
  "SELECT has_function_privilege('anon','public.accept_department_invite(text)','EXECUTE')::text;"

printf '\n============ BLOCO C — o Rollback do arquivo devolve o estado anterior ============\n'
sed -n 's/^-- Rollback: //p' "$migration" | head -n1 > "$tmp_dir/rollback.sql"
[[ -s "$tmp_dir/rollback.sql" ]] || fail 'C.0 nao consegui extrair a linha -- Rollback:'
psql_file "$tmp_dir/rollback.sql" >/dev/null
expect_ok 'C.1 rollback rodou: o CHECK volta a aceitar o verbo antigo update_settings' \
  "INSERT INTO public.department_audit_logs(department_id, action, profile_id) VALUES ('$DEP1','update_settings','$P_ADM');"
expect_error 'C.2 rollback rodou: o verbo canonico volta a ser rejeitado' 'department_audit_logs_action_check' \
  "INSERT INTO public.department_audit_logs(department_id, action, profile_id) VALUES ('$DEP1','invite_created','$P_ADM');"
expect_ok 'C.3 rollback rodou: o CHECK do codigo volta a aceitar 7 caracteres' \
  "INSERT INTO public.department_invitations(department_id, code, expires_at) VALUES ('$DEP2','ZZZZZZZ', now() + interval '1 day');"
CODE_RB="$(as_user "$ESPELHO" "SELECT (public.create_department_invite('$DEP2', 1, 72))->>'code';" | tail -n1)"
expect_value 'C.4 rollback rodou: a RPC antiga volta a gerar codigo de 12 caracteres' '12' \
  "SELECT length(code) FROM public.department_invitations WHERE code='$CODE_RB';"
expect_value 'C.5 rollback rodou: a auditoria antiga volta a gravar o codigo em details' 'true' \
  "SELECT (details ? 'code')::text FROM public.department_audit_logs WHERE action='create_invite' ORDER BY created_at DESC LIMIT 1;"

printf '\n== TODOS OS BLOCOS PASSARAM (A: defeito reproduzido · B: corrigido · C: rollback) ==\n'
