#!/usr/bin/env bash
# N-002 (P1 · seguranca): trava de escalada de privilegio em public.profiles.
#
# A trava existe — gatilho prevent_privilege_escalation -> public.prevent_profile_privilege_escalation(),
# corrigido pela migration 20260830161547 — mas nenhum teste garantia que continua funcionando.
# Este contrato prova, num PostgreSQL 17 descartavel, contra os ARQUIVOS REAIS do repo aplicados
# verbatim (nada de SQL de producao copiado para dentro do teste):
#   20260830070000_fn_effective_role_and_sync_trigger.sql  -> sync fn + gatilho em public.user_roles
#   20260830080000_fn_is_admin_and_fix_permissions_rls.sql -> public.is_admin + guard ANTERIOR
#   20260830161547_fix_prevent_privilege_escalation_allow_internal_sync.sql -> a trava EM VIGOR
#
# Bloco A (estado ANTERIOR a 20260830161547) reproduz o DEFEITO que aquela migration corrigiu:
# com auth.uid() nulo — o sync interno roda em SECURITY DEFINER — o UPDATE de profiles.role
# disparado por user_roles era recusado por excecao, e criar usuario por service_role ficava
# impossivel. Bloco B (migration aplicada DUAS vezes: tem de ser reaplicavel) prova:
#   (a) agente nao altera role/permissions/access_level (nem o proprio papel), mas segue
#       editando os proprios campos NAO sensiveis;
#   (b) supervisor tambem nao troca o papel de outro (F02);
#   (c) admin troca o papel de outro e a mudanca persiste;
#   (d) o sync interno segue permitido e a flag app.internal_role_sync nao vaza entre transacoes.
#
# A prova roda com a RLS desligada em profiles de proposito: o sujeito aqui e o GATILHO
# (defesa em profundidade) — mesmo isolamento de scripts/db-audit/talkx-role-gates.test.sh:315.
# As sessoes usam SET ROLE authenticated + request.jwt.claim.sub, como no resto da suite.

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
migrations="$repo_root/supabase/migrations"
sync_migration="$migrations/20260830070000_fn_effective_role_and_sync_trigger.sql"
is_admin_migration="$migrations/20260830080000_fn_is_admin_and_fix_permissions_rls.sql"
escalation_migration="$migrations/20260830161547_fix_prevent_privilege_escalation_allow_internal_sync.sql"
postgres_image="${PROFILES_ESCALATION_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="profiles-escalation-test-$$"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$1"; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_q() { psql_test -Atqc "$1"; }

expect_error() {
  local label="$1" needle="$2" sql="$3" out status
  set +e
  out="$(psql_test -v VERBOSITY=verbose -c "$sql" 2>&1)"
  status=$?
  set -e
  (( status != 0 )) || { printf '%s\n' "$out" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$label: esperava '$needle'"; }
  pass "$label"
}

# Caminho que PRECISA passar: falha com rotulo (sem isso um erro do psql abortaria o script mudo).
run_ok() {
  local label="$1" sql="$2" out status
  set +e
  out="$(psql_q "$sql")"
  status=$?
  set -e
  (( status == 0 )) || fail "$label: deveria passar, mas falhou [obtido: $out]"
  printf '%s' "$out"
}

start_postgres() {
  # O runner pode reportar o PostgreSQL pronto um instante antes do container reiniciar.
  # Exige duas sondagens boas e repete SO o bootstrap descartavel; falha de SQL nunca repete.
  for attempt in 1 2 3; do
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    if ! docker run -d --name "$container_name" -e POSTGRES_PASSWORD=postgres "$postgres_image" >/dev/null; then
      printf 'WARN: container PostgreSQL nao subiu (tentativa %s/3)\n' "$attempt" >&2
      continue
    fi
    for _ in $(seq 1 15); do
      if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
        sleep 1
        if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
          return 0
        fi
      fi
      sleep 1
    done
    printf 'WARN: bootstrap do PostgreSQL nao ficou estavel (tentativa %s/3)\n' "$attempt" >&2
    docker logs "$container_name" >&2 || true
  done
  return 1
}

for f in "$sync_migration" "$is_admin_migration" "$escalation_migration"; do
  [[ -f "$f" ]] || fail "migration ausente: $f"
done

start_postgres || fail 'PostgreSQL de teste não iniciou'

admin_uid='20000000-0000-0000-0000-000000000001'
supervisor_uid='20000000-0000-0000-0000-000000000002'
agent_uid='20000000-0000-0000-0000-000000000003'
other_uid='20000000-0000-0000-0000-000000000004'

psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;

CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'special_agent', 'agent');

-- Colunas que o gatilho protege (role/permissions/access_level): espelham o canonico.
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  name text NOT NULL DEFAULT 'sem nome',
  role text NOT NULL DEFAULT 'agent' CHECK (role IN ('admin', 'supervisor', 'agent')),
  permissions jsonb NOT NULL DEFAULT '{}',
  access_level text NOT NULL DEFAULT 'basic',
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
-- Dependencias do arquivo 20260830080000 (ele recria policies de permissions/role_permissions).
CREATE TABLE public.permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.role_permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  )
$$;

INSERT INTO public.profiles (id, user_id, name, role) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Admin', 'admin'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Supervisor', 'supervisor'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 'Agente', 'agent'),
  ('10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000004', 'Outro agente', 'agent');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('20000000-0000-0000-0000-000000000001', 'admin'),
  ('20000000-0000-0000-0000-000000000002', 'supervisor');

GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT, UPDATE ON public.profiles TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated, service_role;
SQL

# Estado ANTERIOR a 20260830161547, aplicado verbatim: sync (070000) + guard pre-fix (080000).
psql_test < "$sync_migration" >/dev/null
psql_test < "$is_admin_migration" >/dev/null
# O gatilho em profiles ja existia (20260318121449:30-34) e nenhuma das duas migrations acima o
# (re)cria: para o guard valer, ele precisa estar la — DDL verbatim daquela migration.
psql_test >/dev/null <<'SQL'
DROP TRIGGER IF EXISTS prevent_privilege_escalation ON public.profiles;
CREATE TRIGGER prevent_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();
SQL
pass 'fixture: 20260830070000 + 20260830080000 e gatilho prevent_privilege_escalation em profiles (estado anterior)'

agent_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='$agent_uid';"
supervisor_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='$supervisor_uid';"
admin_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='$admin_uid';"
# Caminho INTERNO: sem request.jwt.claim.sub -> auth.uid() nulo, exatamente o caso que a migration
# de 161547 descreve (sync chamado por SECURITY DEFINER a partir de user_roles).
sync_session="SET ROLE service_role;"

# ---------------------------------------------------------------------------
# (A) Defeito reproduzido: no estado anterior a flag interna, o sync falha.
# ---------------------------------------------------------------------------
expect_error '(A) sync interno bloqueado no estado anterior a 20260830161547' \
  'Only administrators can modify role, permissions, or access_level' \
  "$sync_session INSERT INTO public.user_roles (user_id, role) VALUES ('$agent_uid', 'supervisor');"
[[ "$(psql_q "SELECT COALESCE(string_agg(role::text, ','), '-') FROM public.user_roles WHERE user_id = '$agent_uid'")" == '-' ]] \
  || fail '(A) a linha em user_roles entrou apesar do bloqueio'
[[ "$(psql_q "SELECT role FROM public.profiles WHERE user_id = '$agent_uid'")" == 'agent' ]] \
  || fail '(A) profiles.role mudou apesar do bloqueio'
pass '(A) defeito reproduzido: sem a flag interna o sync user_roles -> profiles era recusado'

# ---------------------------------------------------------------------------
# A trava EM VIGOR, aplicada verbatim e duas vezes (reaplicavel).
# ---------------------------------------------------------------------------
psql_test < "$escalation_migration" >/dev/null
psql_test < "$escalation_migration" >/dev/null
pass 'migration 20260830161547 aplica e e reaplicavel'

# ---------------------------------------------------------------------------
# (a) Agente nao escala: nem o proprio papel, nem os 3 campos protegidos.
# ---------------------------------------------------------------------------
[[ "$(psql_q "SELECT count(*) FROM public.profiles WHERE user_id = '$agent_uid'")" == '1' ]] \
  || fail '(a) fixture invalido: a linha do agente precisa existir (negado != inexistente)'

expect_error '(a) agente promovendo a si mesmo (role=admin) -> erro' \
  'Only administrators can modify role, permissions, or access_level' \
  "$agent_session UPDATE public.profiles SET role = 'admin' WHERE user_id = '$agent_uid';"
[[ "$(psql_q "SELECT role FROM public.profiles WHERE user_id = '$agent_uid'")" == 'agent' ]] \
  || fail '(a) o papel do agente mudou apesar da recusa'

expect_error '(a) agente alterando os proprios permissions -> erro' \
  'Only administrators can modify role, permissions, or access_level' \
  "$agent_session UPDATE public.profiles SET permissions = '{\"manage_all\":true}'::jsonb WHERE user_id = '$agent_uid';"
[[ "$(psql_q "SELECT permissions::text FROM public.profiles WHERE user_id = '$agent_uid'")" == '{}' ]] \
  || fail '(a) permissions do agente mudou apesar da recusa'

expect_error '(a) agente alterando o proprio access_level -> erro' \
  'Only administrators can modify role, permissions, or access_level' \
  "$agent_session UPDATE public.profiles SET access_level = 'full' WHERE user_id = '$agent_uid';"
[[ "$(psql_q "SELECT access_level FROM public.profiles WHERE user_id = '$agent_uid'")" == 'basic' ]] \
  || fail '(a) access_level do agente mudou apesar da recusa'

agent_name="$(run_ok '(a) update de campo nao sensivel pelo agente' \
  "$agent_session UPDATE public.profiles SET name = 'Agente A' WHERE user_id = '$agent_uid' RETURNING name;")"
[[ "$agent_name" == 'Agente A' ]] || fail "(a) campo nao sensivel deveria continuar editavel [obtido: $agent_name]"
pass '(a) agente recusado nos 3 campos protegidos e liberado no campo nao sensivel'

# ---------------------------------------------------------------------------
# (b) Supervisor tambem nao troca o papel de outro (F02).
# ---------------------------------------------------------------------------
expect_error '(b) supervisor trocando o papel de outro -> erro' \
  'Only administrators can modify role, permissions, or access_level' \
  "$supervisor_session UPDATE public.profiles SET role = 'admin' WHERE user_id = '$other_uid';"
[[ "$(psql_q "SELECT role FROM public.profiles WHERE user_id = '$other_uid'")" == 'agent' ]] \
  || fail '(b) o papel do outro mudou apesar da recusa do supervisor'
pass '(b) supervisor recusado ao trocar o papel de outro'

# ---------------------------------------------------------------------------
# (c) Admin troca o papel de outro e a mudanca persiste.
# ---------------------------------------------------------------------------
admin_out="$(run_ok '(c) troca de papel pelo admin' \
  "$admin_session UPDATE public.profiles SET role = 'supervisor' WHERE user_id = '$other_uid' RETURNING role;")"
[[ "$admin_out" == 'supervisor' ]] || fail "(c) admin nao trocou o papel do outro [obtido: $admin_out]"
[[ "$(psql_q "SELECT role FROM public.profiles WHERE user_id = '$other_uid'")" == 'supervisor' ]] \
  || fail '(c) a troca feita pelo admin nao persistiu'
pass '(c) admin trocou o papel de outro e a mudanca persistiu'

# ---------------------------------------------------------------------------
# (d) O sync interno segue permitido e a flag nao vaza entre transacoes.
# ---------------------------------------------------------------------------
sync_out="$(run_ok '(d) sync interno user_roles -> profiles' \
  "$sync_session INSERT INTO public.user_roles (user_id, role) VALUES ('$agent_uid', 'supervisor') RETURNING role;")"
[[ "$sync_out" == 'supervisor' ]] || fail "(d) o sync interno foi recusado [obtido: $sync_out]"
[[ "$(psql_q "SELECT role FROM public.profiles WHERE user_id = '$agent_uid'")" == 'supervisor' ]] \
  || fail '(d) o sync interno nao propagou o papel para profiles'
expect_error '(d) a flag interna nao vaza para a sessao do agente' \
  'Only administrators can modify role, permissions, or access_level' \
  "$agent_session UPDATE public.profiles SET role = 'admin' WHERE user_id = '$agent_uid';"
pass '(d) sync interno permitido (com auth.uid() nulo) e a flag nao vaza'

printf 'PASS: N-002 trava de escalada de privilegio em profiles — agente e supervisor recusados, admin permitido, sync interno preservado\n'
