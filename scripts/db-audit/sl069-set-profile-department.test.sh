#!/usr/bin/env bash
# SL-069 (t_6536c5a0) — limpeza da sobra de banco do Team Chat:
#   * a tabela legada public.department_invites (20260927400000) esta aposentada desde que o
#     front migrou para department_invitations + RPCs atuais — nao ha call-site de producao
#     (.from('department_invites')) em src/;
#   * faltava a RPC do plano TC-40: public.set_profile_department(p_profile_id, p_department_id)
#     RETURNS void, SECURITY DEFINER, admin-only pela guarda de profiles.role ('admin',
#     'supervisor') — a mesma de create_department_invite / set_department_whatsapp_config.
#
# ESTE CONTRATO roda em PostgreSQL descartavel (docker) e aplica o ARQUIVO REAL da migration
#   supabase/migrations/20261009034323_sl069_department_invites_cleanup.sql
# sobre um estado ANTERIOR fiel ao canonico (pre.sql), executando como os PAPEIS REAIS
# (`SET ROLE authenticated`/`anon` + request.jwt.claims; postgres so para sondagem de catalogo).
# NENHUMA credencial de producao entra aqui.
#
# BLOCO A — estado ANTERIOR (o vermelho): a RPC nao existe (to_regprocedure NULL) e a tabela
#           legada existe (to_regclass nao NULL).
# BLOCO B — migration aplicada: autenticado sem perfil -> not_authenticated; agente e negado
#           (not_authorized); admin/supervisor mudam o departamento DE FATO e a auditoria sai na
#           mesma transacao ('join_department' / 'remove_member' no departamento anterior);
#           remover quem nao tinha departamento NAO grava auditoria; departamento inexistente/
#           inativo -> department_not_found sem tocar o perfil (tudo-ou-nada); perfil
#           inexistente -> profile_not_found; anon e PUBLIC sem EXECUTE, authenticated com;
#           a tabela legada caiu; anon nao muda departamento nenhum.
# BLOCO C — ROLLBACK: a linha "-- Rollback:" do proprio arquivo e executada e devolve o estado:
#           a RPC some e department_invites volta com colunas, os 3 indices, RLS ligada, as 3
#           policies canonicas e a ACL final (anon sem nada, authenticated com DML).
# BLOCO D — idempotencia: a migration reaplica (CREATE OR REPLACE + DROP IF EXISTS).
#
# Uso: bash scripts/db-audit/sl069-set-profile-department.test.sh
#      SL069_TEST_POSTGRES_IMAGE=postgres:17-alpine   (default)

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261009034323_sl069_department_invites_cleanup.sql"
postgres_image="${SL069_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-sl069-setdept-test-$$"
tmp_base="${TMPDIR:-$repo_root/.tmp}"
tmp_dir="$tmp_base/zapp-v2-sl069-setdept-test.$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-sl069-setdept-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
  case "$tmp_dir" in */zapp-v2-sl069-setdept-test.*) rm -rf -- "$tmp_dir" ;; esac
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

psql_db()      { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$1" -c "$2"; }
psql_file_db() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$1" < "$2"; }
as_user() { # papel authenticated + JWT
  local jwt="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"
}
as_anon() { # papel anon + JWT
  local jwt="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE anon; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"
}
expect_value() { # label expected sql  (sondagem como postgres — catalogo, nao comportamento)
  local l="$1" e="$2" s="$3" a; a="$(psql_db postgres "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"; pass "$l"
}
expect_value_as() { # label expected jwt sql
  local l="$1" e="$2" j="$3" s="$4" a; a="$(as_user "$j" "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"; pass "$l"
}
expect_error_as() { # label needle jwt sql
  local l="$1" needle="$2" j="$3" s="$4" out st
  set +e; out="$(as_user "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  pass "$l"
}
expect_error_anon() { # label needle jwt sql
  local l="$1" needle="$2" j="$3" s="$4" out st
  set +e; out="$(as_anon "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  pass "$l"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"
# O arquivo tem de carregar a linha de rollback executavel (afirmacao, nao contagem).
head -5 "$migration" | grep -qE '^-- Rollback: [^[:space:]]' || fail 'o arquivo perdeu a linha "-- Rollback:" executavel'

mkdir -p "$tmp_dir"

printf '== container: %s (imagem %s) ==\n' "$container_name" "$postgres_image"
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=sl069_test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  if psql_db postgres 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail "PostgreSQL descartavel ($postgres_image) nao ficou pronto"

# ── estado ANTERIOR, fiel ao canonico ───────────────────────────────────────────────────────
# Papeis sao globais do cluster: criados UMA vez, antes do schema.
psql_db postgres 'CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;' >/dev/null

cat > "$tmp_dir/pre.sql" <<'SQL'
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

CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  name text,
  role text DEFAULT 'agent',
  is_active boolean DEFAULT true,
  department_id uuid REFERENCES public.departments(id)
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
);
CREATE TABLE public.department_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  action text NOT NULL,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  profile_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- vocabulario CANONICO vigente (20260928530000 + 'whatsapp_updated' de 20261006213734)
ALTER TABLE public.department_audit_logs ADD CONSTRAINT department_audit_logs_action_check CHECK (action IN (
  'accept_invite','create_invite','join_department','leave_department','remove_member','update_settings',
  'delete_department','create_department','update_role','kick_member','create_group','delete_group',
  'whatsapp_updated'));

-- tabela legada na forma EXATA de 20260927400000 (+ indice de created_by de 20260927550000)
CREATE TABLE public.department_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dept_invites_dept_id ON public.department_invites(department_id);
CREATE INDEX IF NOT EXISTS idx_dept_invites_code ON public.department_invites(code);
CREATE INDEX IF NOT EXISTS idx_dept_invites_created_by ON public.department_invites(created_by);

CREATE OR REPLACE FUNCTION public.current_profile_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $function$ SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1; $function$;
REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $function$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','supervisor')); $function$;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO authenticated, service_role;

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY departments_select ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY departments_admin_write ON public.departments FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

ALTER TABLE public.department_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY dept_audit_select_own_dept ON public.department_audit_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p
                  WHERE p.id = public.current_profile_id()
                    AND p.department_id = department_audit_logs.department_id
                    AND p.role IN ('admin','supervisor')));

ALTER TABLE public.department_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY dept_invites_select_authenticated ON public.department_invites FOR SELECT TO authenticated USING (true);
CREATE POLICY dept_invites_insert_authenticated ON public.department_invites FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY dept_invites_delete_authenticated ON public.department_invites FOR DELETE TO authenticated USING (true);

-- GRANTs de tabela: o ALL reproduz o ALTER DEFAULT PRIVILEGES do Supabase; os dois REVOKEs sao
-- a ACL final canonica (20260928460000 e 20260928450000, nesta ordem).
GRANT ALL ON TABLE public.department_invites TO anon, authenticated, service_role;
REVOKE ALL ON TABLE public.department_invites FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.department_invites FROM anon, authenticated;
GRANT SELECT ON public.departments TO authenticated;
GRANT SELECT, INSERT ON public.department_audit_logs TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.department_audit_logs FROM authenticated;
GRANT SELECT ON public.profiles TO authenticated;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.department_audit_logs;
DO $$ BEGIN IF to_regclass('public.department_invites') IS NOT NULL THEN DELETE FROM public.department_invites; END IF; END $$;
DELETE FROM public.user_roles;
DELETE FROM public.profiles;
DELETE FROM public.departments;

INSERT INTO public.departments (id, name, is_active) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'Comercial', true),
  ('d0000000-0000-0000-0000-000000000002', 'Suporte',   true),
  ('d0000000-0000-0000-0000-000000000003', 'Inativo',   false);

INSERT INTO public.profiles (id, user_id, name, role, is_active, department_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Agente',     'agent',      true, 'd0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Admin',      'admin',      true, 'd0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'Supervisor', 'supervisor', true, 'd0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000004', '44444444-4444-4444-4444-444444444444', 'Membro',     'agent',      true, 'd0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000005', '55555555-5555-5555-5555-555555555555', 'SemDept',    'agent',      true, NULL);
SQL

psql_file_db postgres "$tmp_dir/pre.sql" >/dev/null
psql_file_db postgres "$tmp_dir/seed.sql" >/dev/null

AGENT='{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}'
ADMIN='{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'
SUP='{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}'
SEMPERFIL='{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}'
ANONJWT='{"sub":"00000000-0000-0000-0000-000000000000","role":"anon"}'

P_AGENT='a0000000-0000-0000-0000-000000000001'
P_ADMIN='a0000000-0000-0000-0000-000000000002'
P_MEMBRO='a0000000-0000-0000-0000-000000000004'
P_SEMDEPT='a0000000-0000-0000-0000-000000000005'
DEP1='d0000000-0000-0000-0000-000000000001'
DEP2='d0000000-0000-0000-0000-000000000002'
DEP_INATIVO='d0000000-0000-0000-0000-000000000003'
DEP_GHOST='d0000000-0000-0000-0000-0000000000ff'
P_GHOST='a0000000-0000-0000-0000-0000000000ff'

printf '\n============ BLOCO A — estado ANTERIOR (o defeito) ============\n'
expect_value 'A.1 a RPC set_profile_department(uuid,uuid) NAO existe' 't' \
  "SELECT to_regprocedure('public.set_profile_department(uuid,uuid)') IS NULL;"
expect_value 'A.2 a tabela legada public.department_invites AINDA existe' 't' \
  "SELECT to_regclass('public.department_invites') IS NOT NULL;"

printf '\n============ BLOCO B — migration aplicada ============\n'
psql_file_db postgres "$migration" >/dev/null
psql_file_db postgres "$tmp_dir/seed.sql" >/dev/null
pass 'B.0 a migration real aplicou sem erro'

expect_error_as 'B.1 autenticado SEM perfil recebe not_authenticated' 'not_authenticated' "$SEMPERFIL" \
  "SELECT public.set_profile_department('$P_MEMBRO', '$DEP2');"
expect_error_as 'B.2 AGENTE (authenticated nao-admin) recebe not_authorized' 'not_authorized' "$AGENT" \
  "SELECT public.set_profile_department('$P_MEMBRO', '$DEP2');"
expect_value 'B.2b a tentativa negada NAO tocou o perfil (tudo-ou-nada)' "$DEP1" \
  "SELECT department_id FROM public.profiles WHERE id='$P_MEMBRO';"

expect_value_as 'B.3 ADMIN chama a RPC e a troca acontece DE FATO' "$DEP2" "$ADMIN" \
  "SELECT public.set_profile_department('$P_MEMBRO', '$DEP2'); SELECT department_id FROM public.profiles WHERE id='$P_MEMBRO';"
expect_value 'B.3b a auditoria saiu na MESMA transacao: join_department no DEP2' "$DEP2|$P_MEMBRO|$P_ADMIN" \
  "SELECT department_id||'|'||profile_id||'|'||(details->>'actor_profile_id') FROM public.department_audit_logs WHERE action='join_department' ORDER BY created_at DESC, id DESC LIMIT 1;"
expect_value_as 'B.3c SUPERVISOR tambem passa na guarda' "$DEP1" "$SUP" \
  "SELECT public.set_profile_department('$P_MEMBRO', '$DEP1'); SELECT department_id FROM public.profiles WHERE id='$P_MEMBRO';"

expect_value_as 'B.4 p_department_id NULL remove o departamento do perfil' '|' "$ADMIN" \
  "SELECT public.set_profile_department('$P_MEMBRO', NULL); SELECT coalesce(department_id::text,'')||'|' FROM public.profiles WHERE id='$P_MEMBRO';"
expect_value 'B.4b a remocao audita remove_member no departamento ANTERIOR (DEP1)' "$DEP1|$P_MEMBRO|remove_member" \
  "SELECT department_id||'|'||profile_id||'|'||action FROM public.department_audit_logs WHERE action='remove_member' ORDER BY created_at DESC, id DESC LIMIT 1;"
expect_value_as 'B.4c remover quem NAO tinha departamento: sucesso e NENHUMA auditoria nova' '0' "$ADMIN" \
  "SELECT public.set_profile_department('$P_SEMDEPT', NULL); SELECT count(*) FROM public.department_audit_logs WHERE profile_id='$P_SEMDEPT';"

expect_error_as 'B.5 departamento INATIVO e recusado' 'department_not_found' "$ADMIN" \
  "SELECT public.set_profile_department('$P_MEMBRO', '$DEP_INATIVO');"
expect_error_as 'B.5b departamento INEXISTENTE e recusado' 'department_not_found' "$ADMIN" \
  "SELECT public.set_profile_department('$P_MEMBRO', '$DEP_GHOST');"
expect_value 'B.5c a falha nao mudou o perfil nem gravou auditoria' '0' \
  "SELECT count(*) FROM public.department_audit_logs WHERE department_id IN ('$DEP_INATIVO','$DEP_GHOST');"
expect_error_as 'B.6 perfil inexistente e recusado' 'profile_not_found' "$ADMIN" \
  "SELECT public.set_profile_department('$P_GHOST', '$DEP2');"

expect_value 'B.7 anon NAO tem EXECUTE na RPC' 'f' \
  "SELECT has_function_privilege('anon','public.set_profile_department(uuid,uuid)','EXECUTE');"
expect_value 'B.7b PUBLIC NAO tem EXECUTE na RPC (grantee=0 na ACL)' '0' \
  "SELECT count(*) FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid='public.set_profile_department(uuid,uuid)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE';"
expect_value 'B.7c authenticated TEM EXECUTE na RPC' 't' \
  "SELECT has_function_privilege('authenticated','public.set_profile_department(uuid,uuid)','EXECUTE');"
expect_value 'B.8 a tabela legada department_invites CAIU' 't' \
  "SELECT to_regclass('public.department_invites') IS NULL;"

expect_error_anon 'B.9 anon nao chama a RPC (sem EXECUTE)' 'permission denied' "$ANONJWT" \
  "SELECT public.set_profile_department('$P_MEMBRO', '$DEP2');"
expect_value 'B.9b e nenhum departamento mudou' "$DEP1" \
  "SELECT department_id FROM public.profiles WHERE id='$P_AGENT';"

printf '\n============ BLOCO C — rollback executa e devolve o estado ============\n'
# O rollback REAL, extraido da linha do cabecalho, e aplicado sobre o estado JA migrado.
sed -n '1,5p' "$migration" | sed -n 's/^-- Rollback: //p' > "$tmp_dir/rollback.sql"
grep -q 'DROP FUNCTION IF EXISTS public.set_profile_department' "$tmp_dir/rollback.sql" || fail 'rollback vazio/invalido'
psql_file_db postgres "$tmp_dir/rollback.sql" >/dev/null
pass 'C.1 a linha -- Rollback: executou no PostgreSQL sem erro'
expect_value 'C.2 a RPC sumiu de novo' 't' \
  "SELECT to_regprocedure('public.set_profile_department(uuid,uuid)') IS NULL;"
expect_value 'C.3 department_invites VOLTOU' 't' \
  "SELECT to_regclass('public.department_invites') IS NOT NULL;"
expect_value 'C.4 voltou com as 6 colunas canonicas' 'id,department_id,code,created_by,expires_at,created_at' \
  "SELECT string_agg(column_name, ',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='department_invites';"
expect_value 'C.5 RLS ligada de novo' 't' \
  "SELECT relrowsecurity FROM pg_class WHERE oid='public.department_invites'::regclass;"
expect_value 'C.6 as 3 policies canonicas voltaram' 'dept_invites_delete_authenticated|dept_invites_insert_authenticated|dept_invites_select_authenticated' \
  "SELECT string_agg(policyname, '|' ORDER BY policyname) FROM pg_policies WHERE schemaname='public' AND tablename='department_invites';"
expect_value 'C.7 os 3 indices nomeados voltaram' 'idx_dept_invites_code|idx_dept_invites_created_by|idx_dept_invites_dept_id' \
  "SELECT string_agg(indexname, '|' ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='department_invites' AND indexname LIKE 'idx_dept_invites%';"
expect_value 'C.8 ACL final: authenticated le, anon nao le nada' 'true|false' \
  "SELECT has_table_privilege('authenticated','public.department_invites','SELECT')::text||'|'||has_table_privilege('anon','public.department_invites','SELECT')::text;"

printf '\n============ BLOCO D — idempotencia (reaplicar) ============\n'
psql_file_db postgres "$migration" >/dev/null
pass 'D.1 a migration reaplicou sem erro'
expect_value 'D.2 a RPC existe de novo e a tabela caiu de novo' 'true|true' \
  "SELECT (to_regprocedure('public.set_profile_department(uuid,uuid)') IS NOT NULL)::text||'|'||(to_regclass('public.department_invites') IS NULL)::text;"

printf '\nPASS: SL-069 — set_profile_department admin-only com auditoria na mesma transacao\n'
printf '(join_department/remove_member, sem auditoria quando nada muda), erros tipados\n'
printf '(not_authenticated/not_authorized/department_not_found/profile_not_found), EXECUTE so para\n'
printf 'authenticated, tabela legada department_invites removida e rollback do arquivo restaura\n'
printf 'tabela (vazia), indices, RLS, policies e ACL finais.\n'
