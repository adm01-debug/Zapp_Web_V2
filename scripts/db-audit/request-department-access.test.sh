#!/usr/bin/env bash
# N-071 — request_department_access RPC: cria notificacao para admins/supervisores
# do departamento e linha access_requested na auditoria; anon recebe permission denied.
#
# Roda em PostgreSQL descartavel (docker) e aplica os ARQUIVOS REAIS das migrations:
#   supabase/migrations/20261006213734_team_chat_f10_department_whatsapp_safe_config.sql (estado anterior)
#   supabase/migrations/20261010024534_request_department_access_rpc.sql (esta entrega)
# sobre um estado ANTERIOR fiel ao canonico (pre.sql, com a fonte de cada bloco citada),
# executando como os PAPEIS REAIS (`SET LOCAL ROLE authenticated/anon` + request.jwt.claims;
# postgres so nas sondagens de CHECK/ACL). NENHUMA credencial de producao entra aqui.
#
# BLOCO A — estado ANTERIOR (defeito): a funcao nao existe, a chamada falha.
# BLOCO B — migration aplicada: authenticated chama e recebe ok; admins do departamento
#           recebem 1 notificacao cada; auditoria registra access_requested; a lista de
#           verbos do CHECK e derivada do CHECK REAL (antes) + do arquivo F10 real, e cada
#           verbo antigo segue inserivel; anon recebe permission denied (GRANT so a
#           authenticated — sem oraculo de JSON); sem perfil ha not_authenticated.
# BLOCO C — ROLLBACK: a linha "-- Rollback:" do arquivo e executada de verdade e devolve
#           o estado anterior (funcao removida, CHECK identico ao capturado antes).
#
# Uso: bash scripts/db-audit/request-department-access.test.sh
#      REQUEST_DEPT_ACCESS_TEST_POSTGRES_IMAGE=postgres:17-alpine   (default)

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261010024534_request_department_access_rpc.sql"
prev_migration="$repo_root/supabase/migrations/20261006213734_team_chat_f10_department_whatsapp_safe_config.sql"
postgres_image="${REQUEST_DEPT_ACCESS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-request-dept-access-test-$$"
tmp_base="${TMPDIR:-$repo_root/.tmp}"
tmp_dir="$tmp_base/zapp-v2-request-dept-access-test.$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-request-dept-access-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
  case "$tmp_dir" in */zapp-v2-request-dept-access-test.*) rm -rf -- "$tmp_dir" ;; esac
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}
psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}
# Papel real via SET LOCAL ROLE dentro de transacao explicita (BEGIN...COMMIT):
# a escrita persiste (COMMIT) e o papel+claims valem para as instrucoes do bloco.
as_auth() {
  local uid="$1" sql="$2"
  local jwt="{\"sub\":\"$uid\"}"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '$jwt', false); $sql; COMMIT;"
}
as_anon() {
  local sql="$1"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "BEGIN; SET LOCAL ROLE anon; $sql; COMMIT;"
}
expect_line_as() { # label expected uid sql — passa se expected for UMA linha cheia da saida
  local l="$1" e="$2" j="$3" s="$4" out
  out="$(as_auth "$j" "$s")"
  printf '%s\n' "$out" | grep -qxF "$e" || { printf '%s\n' "$out" >&2; fail "$l: esperado linha '$e'"; }
  pass "$l"
}
expect_error_as() { # label needle uid sql
  local l="$1" needle="$2" j="$3" s="$4" out st
  set +e; out="$(as_auth "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  pass "$l"
}
expect_error_anon() { # label needle sql
  local l="$1" needle="$2" s="$3" out st
  set +e; out="$(as_anon "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  pass "$l"
}
expect_error_sql() { # label needle sql (como postgres — sondagem de CHECK)
  local l="$1" needle="$2" s="$3" out st
  set +e; out="$(psql_sql "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  pass "$l"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"
[[ -f "$prev_migration" ]] || fail "migration anterior nao encontrada: $prev_migration"
# O arquivo tem de carregar a linha de rollback executavel (afirmacao, nao contagem).
head -5 "$migration" | grep -qE '^-- Rollback: [^[:space:]]' || fail 'o arquivo perdeu a linha "-- Rollback:" executavel'

mkdir -p "$tmp_dir"

printf '== container: %s (imagem %s) ==\n' "$container_name" "$postgres_image"
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

# Papeis sao globais do cluster: criados UMA vez.
psql_sql 'CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;' >/dev/null

# ── estado ANTERIOR, fiel ao canonico (fonte de cada bloco citada) ──────────────
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE SCHEMA auth;
-- auth.uid()/auth.role(): padrao dos testes de banco aprovados (team-membership, F10).
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

-- profiles: colunas da base (20251215024517: id, user_id UNIQUE, name, role admin/supervisor/agent)
-- + department_id (20260902120001_add_department_id_columns.sql) + policies da base
-- (view-all USING(true) TO authenticated; update/insert proprios).
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  name text NOT NULL,
  role text DEFAULT 'agent' CHECK (role IN ('admin', 'supervisor', 'agent')),
  department_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
GRANT SELECT ON public.profiles TO authenticated;

-- current_profile_id ANTES da policy de auditoria: CREATE POLICY resolve a funcao na criacao.
CREATE OR REPLACE FUNCTION public.current_profile_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $function$ SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1; $function$;
REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;

-- departments: base 20260902120000 (id, name UNIQUE, is_active, whatsapp_mode/api_key/instance_id)
-- + policy departments_select USING(true) TO authenticated.
CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  whatsapp_mode text NOT NULL DEFAULT 'none',
  whatsapp_api_key text,
  whatsapp_instance_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY departments_select ON public.departments FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.departments TO authenticated;

-- notifications: base 20251228173815 (colunas + 4 policies reais: propria SELECT/UPDATE/DELETE,
-- System INSERT WITH CHECK(true)).
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'info',
  is_read boolean DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete their own notifications" ON public.notifications FOR DELETE USING (user_id = auth.uid());
CREATE POLICY "System can insert notifications" ON public.notifications FOR INSERT WITH CHECK (true);
-- Leitura de tabela p/ authenticated (no canonico a linha e regulada por RLS; o GRANT de tabela existe).
GRANT SELECT ON public.notifications TO authenticated;

-- department_audit_logs: base 20260927400000 (colunas) + profile_name do E17
-- (20260928530000) + endurecimento E17: REVOKE de escrita a authenticated, policies
-- antigas removidas, dept_audit_select_own_dept e trigger fill_profile_name.
CREATE TABLE public.department_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  action text NOT NULL,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  profile_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE INSERT, UPDATE, DELETE ON public.department_audit_logs FROM authenticated;
CREATE POLICY dept_audit_select_own_dept ON public.department_audit_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = public.current_profile_id() AND p.department_id = department_audit_logs.department_id AND p.role IN ('admin','supervisor')));
CREATE OR REPLACE FUNCTION public.department_audit_logs_fill_profile_name() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $f$ BEGIN IF NEW.profile_id IS NOT NULL AND NEW.profile_name IS NULL THEN SELECT name INTO NEW.profile_name FROM public.profiles WHERE id = NEW.profile_id; END IF; RETURN NEW; END; $f$;
REVOKE EXECUTE ON FUNCTION public.department_audit_logs_fill_profile_name() FROM PUBLIC, anon;
CREATE TRIGGER department_audit_logs_fill_profile_name_trig BEFORE INSERT ON public.department_audit_logs FOR EACH ROW EXECUTE FUNCTION public.department_audit_logs_fill_profile_name();
GRANT SELECT ON public.department_audit_logs TO authenticated;
-- vocabulario CANONICO antes do F10: 12 verbos (20260928530000). O 13o ('whatsapp_updated')
-- vem do ARQUIVO REAL do F10 aplicado abaixo, nao daqui.
ALTER TABLE public.department_audit_logs ADD CONSTRAINT department_audit_logs_action_check CHECK (action IN ('accept_invite','create_invite','join_department','leave_department','remove_member','update_settings','delete_department','create_department','update_role','kick_member','create_group','delete_group'));

-- user_roles + guarda canonica (fonte do F10).
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
);
CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $function$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'supervisor')); $function$;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid) TO authenticated, service_role;

SQL

psql_file "$tmp_dir/pre.sql" >/dev/null
pass 'P.0 pre.sql fiel ao canonico aplicou sem erro'

# O estado anterior INCLUI o F10 real: e o ARQUIVO dele que instala o 13o verbo.
psql_file "$prev_migration" >/dev/null
pass 'P.1 migration real do F10 aplicou sobre o pre.sql sem erro'

# Lista do CHECK REAL, capturada do banco antes de sobrescrever (nao decorada).
CHECK_BEFORE="$(psql_sql "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='department_audit_logs_action_check'" | tail -n1)"
[[ "$CHECK_BEFORE" == *whatsapp_updated* ]] || fail "CHECK real nao tem whatsapp_updated: $CHECK_BEFORE"
pass 'P.2 CHECK real capturado contem whatsapp_updated'
# Cada verbo do arquivo F10 real tem de estar no CHECK real (derivado do arquivo, nao da memoria).
while read -r verb; do
  [[ "$CHECK_BEFORE" == *"'$verb'"* ]] || fail "CHECK real perdeu o verbo do F10: $verb"
done < <(awk "/^ALTER TABLE public.department_audit_logs ADD CONSTRAINT/{f=1} f{print} f&&/\)\);/{exit}" "$prev_migration" | grep -o "'[a-z_]*'" | tr -d "'")
pass 'P.3 todos os verbos do arquivo F10 real estao no CHECK real'

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.department_audit_logs;
DELETE FROM public.user_roles;
DELETE FROM public.notifications;
DELETE FROM public.departments;
DELETE FROM public.profiles;
INSERT INTO public.departments (id, name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Departamento Teste');
INSERT INTO public.profiles (id, user_id, name, role, department_id) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Admin Teste', 'admin', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Requester Teste', 'agent', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SQL
psql_file "$tmp_dir/seed.sql" >/dev/null

DEPT_ID='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
ADMIN_USER='cccccccc-cccc-cccc-cccc-cccccccccccc'
REQUESTER_USER='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
UNKNOWN_USER='ffffffff-ffff-ffff-ffff-ffffffffffff'

printf '\n== Bloco A: antes da migration (defeito) ==\n'
expect_error_as 'A.1 request_department_access nao existe antes da migration' 'does not exist' "$ADMIN_USER" "SELECT public.request_department_access('$DEPT_ID');"

printf '\n== Aplicando migration real ==\n'
psql_file "$migration" >/dev/null
pass 'M.0 migration real aplicou sem erro'

printf '\n== Bloco B: apos a migration (correcao) ==\n'
# B.1 authenticated chama e recebe ok (SET LOCAL ROLE authenticated + claims).
expect_line_as 'B.1 authenticated chama request_department_access e recebe ok' \
  '{"ok": true}' \
  "$REQUESTER_USER" "SELECT public.request_department_access('$DEPT_ID');"

# B.2 nasce 1 notificacao para o admin do departamento.
expect_line_as 'B.2 notificacao criada para o admin do departamento' '1' \
  "$ADMIN_USER" "SELECT count(*) FROM public.notifications WHERE user_id = '$ADMIN_USER' AND title = 'Pedido de acesso ao departamento';"

# B.2b o agente (requester) nao ve a notificacao do admin pelo RLS (propria SELECT).
expect_line_as 'B.2b agente nao ve notificacao do admin pelo RLS' '0' \
  "$REQUESTER_USER" "SELECT count(*) FROM public.notifications WHERE user_id = '$ADMIN_USER';"

# B.3 nasce 1 linha access_requested na auditoria.
expect_line_as 'B.3 linha access_requested na auditoria' '1' \
  "$ADMIN_USER" "SELECT count(*) FROM public.department_audit_logs WHERE department_id = '$DEPT_ID' AND action = 'access_requested';"

# B.4 anon e barrado no GRANT: permission denied do Postgres (sem oraculo de JSON).
expect_error_anon 'B.4 anon recebe permission denied (sem EXECUTE)' \
  'permission denied for function' \
  "SELECT public.request_department_access('$DEPT_ID');"

# B.5 ACL por comportamento de catalogo: so authenticated tem EXECUTE.
[[ "$(psql_sql "SELECT has_function_privilege('authenticated', 'public.request_department_access(uuid)', 'EXECUTE')" | tail -n1)" == t ]] \
  || fail 'B.5 authenticated deveria ter EXECUTE'
[[ "$(psql_sql "SELECT has_function_privilege('anon', 'public.request_department_access(uuid)', 'EXECUTE')" | tail -n1)" == f ]] \
  || fail 'B.5 anon nao deveria ter EXECUTE'
pass 'B.5 EXECUTE so para authenticated (anon sem acesso)'

# B.6 cada verbo do CHECK anterior segue inserivel (nenhum verbo antigo saiu).
n=0
while read -r verb; do
  psql_sql "INSERT INTO public.department_audit_logs (department_id, action, details) VALUES ('$DEPT_ID', '$verb', '{}');" >/dev/null
  n=$((n + 1))
done < <(awk "/^ALTER TABLE public.department_audit_logs ADD CONSTRAINT/{f=1} f{print} f&&/\)\);/{exit}" "$prev_migration" | grep -o "'[a-z_]*'" | tr -d "'")
(( n >= 13 )) || fail "B.6 esperava >=13 verbos legados, inseriu $n"
pass "B.6 os $n verbos legados seguem inseriveis (nenhum saiu)"
psql_sql "DELETE FROM public.department_audit_logs WHERE action <> 'access_requested';" >/dev/null

# B.7 departamento inexistente: erro de dominio, sem efeito colateral.
expect_line_as 'B.7 departamento inexistente devolve department_not_found' \
  '{"ok": false, "error": "department_not_found"}' \
  "$REQUESTER_USER" "SELECT public.request_department_access('00000000-0000-0000-0000-000000000000');"

# B.8 autenticado sem perfil: not_authenticated, sem efeito colateral.
expect_line_as 'B.8 jwt sem perfil devolve not_authenticated' \
  '{"ok": false, "error": "not_authenticated"}' \
  "$UNKNOWN_USER" "SELECT public.request_department_access('$DEPT_ID');"

printf '\n== Bloco C: rollback executa e devolve o estado ==\n'
# O rollback REAL, extraido da linha do cabecalho, e aplicado sobre o estado JA migrado
# (o bloco C e o ultimo: desfazer aqui nao afeta as provas acima).
sed -n '1,5p' "$migration" | sed -n 's/^-- Rollback: //p' > "$tmp_dir/rollback.sql"
grep -qi 'drop function if exists public.request_department_access' "$tmp_dir/rollback.sql" || fail 'rollback vazio/invalido'
[[ "$(psql_sql "SELECT to_regprocedure('public.request_department_access(uuid)') IS NULL" | tail -n1)" == f ]] \
  || fail 'C.0 a funcao deveria existir antes do rollback'
psql_file "$tmp_dir/rollback.sql" >/dev/null
pass 'C.1 a linha -- Rollback: executou no PostgreSQL sem erro'
[[ "$(psql_sql "SELECT to_regprocedure('public.request_department_access(uuid)') IS NULL" | tail -n1)" == t ]] \
  || fail 'C.2 rollback nao removeu request_department_access'
pass 'C.2 rollback removeu a funcao (ela nao existia antes: sem corpo recriado)'
CHECK_AFTER="$(psql_sql "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='department_audit_logs_action_check'" | tail -n1)"
[[ "$CHECK_AFTER" == "$CHECK_BEFORE" ]] || fail "C.3 CHECK do rollback difere do anterior: $CHECK_AFTER"
pass 'C.3 CHECK restaurado e identico ao capturado antes (13 verbos)'
expect_error_sql 'C.4 access_requested volta a violar o CHECK apos o rollback' \
  'check constraint' \
  "INSERT INTO public.department_audit_logs (department_id, action, details) VALUES ('$DEPT_ID', 'access_requested', '{}');"
psql_sql "INSERT INTO public.department_audit_logs (department_id, action, details) VALUES ('$DEPT_ID', 'create_invite', '{}');" >/dev/null
pass 'C.5 verbo legado segue inserivel apos o rollback'

printf '\nPASS: N-071 — request_department_access cria notificacoes para admins, auditoria registra access_requested, anon recebe permission denied, rollback real devolve o estado.\n'
