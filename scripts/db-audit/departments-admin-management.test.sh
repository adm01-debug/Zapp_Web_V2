#!/usr/bin/env bash
# departments-admin-gestao (cartao t_8f85d6e8): a tela de departamentos do V3 e do admin
# precisa CRIAR, RENOMEAR e EXCLUIR com seguranca. Em V2 `departments` tinha escrita ampla
# para admin OU supervisor (policy departments_admin_write, 20260902120000) e DELETE de
# TABELA concedido ao authenticated — qualquer admin podia apagar a linha direto via
# PostgREST e disparar o ON DELETE CASCADE de team_conversations (FK de 20260929200000),
# apagando conversas em cascata SEM checagem.
#
# A correcao (migration 20261011191021_departments_admin.sql) e aditiva:
#   - departments_admin_write passa a exigir public.is_admin(auth.uid()) (GATE 16);
#   - REVOKE DELETE ON public.departments FROM authenticated (a exclusao so passa pela RPC);
#   - RPC public.delete_department(uuid, uuid) -> jsonb: so admin, recusa quando ha
#     membros/conversas/filas e p_move_to e nulo (devolvendo contagens), e com p_move_to
#     move membros e conversas, apaga a linha e audita — tudo numa transacao;
#   - RPC public.departments_overview() -> contagens por departamento (so admin).
#
# ESTE CONTRATO roda em PostgreSQL 17 descartavel (docker), no formato dos testes irmaos
# department-whatsapp-mode-rpc.test.sh e l11-departments-acl-escrita.test.sh. UM banco so,
# so `docker run`/`docker exec ... psql`/`docker rm`: compativel com o docker-shim do
# db-guard.yml (E47). NENHUMA credencial de producao entra aqui.
#
#   ANTES  — estado pre-migration: authenticated tem DELETE de tabela e a escrita aceita
#            supervisor; prova-se o defeito (delete direto apaga conversa em cascata).
#   DEPOIS — aplica o arquivo REAL da migration e prova: DELETE revogado; escrita so admin;
#            RPC so para admin (anon/agente recebem 42501); recusa com contagens sem apagar;
#            move+apaga+auditoria; overview; e o caso de retorno.
#   ESTATICO — o arquivo do repo tem is_admin e as RPCs; a revogacao de DELETE e
#            provada por SQL real no contrato DEPOIS e na MUTACAO A.
#   MUTACAO A — copia sem a linha do REVOKE: com o DELETE ainda concedido, o contrato FALHA.
#   MUTACAO B — copia com o portao de papel desligado: o agente passa, o contrato FALHA.
#   MUTACAO C — copia com overview liberado para supervisor: o contrato FALHA.
#   ROLLBACK — o bloco `-- Rollback (...)` do arquivo roda e devolve o estado anterior.
#
# Uso: bash scripts/db-audit/departments-admin-management.test.sh
#      DEPARTMENTS_ADMIN_TEST_POSTGRES_IMAGE=postgres:17-alpine  (default)

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261011191021_departments_admin.sql"
postgres_image="${DEPARTMENTS_ADMIN_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-dept-admin-test-$$"
tmp_base="${TMPDIR:-$repo_root/.tmp}"
tmp_dir="$tmp_base/zapp-v2-dept-admin-test.$$"
passed=0

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-dept-admin-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
  case "$tmp_dir" in
    */zapp-v2-dept-admin-test.*) rm -rf -- "$tmp_dir" ;;
  esac
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
ok()   { printf '[OK] %s\n' "$1"; ((passed += 1)); }

# Um banco so (compativel com o docker-shim).
psql_q() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }
q1() { psql_q -c "$1"; }

# Variantes usadas DENTRO do contrato: imprimem [FAIL] e retornam 1 — a mutacao precisa
# que o contrato FALHE, com evidencia no log.
assert_eq() { # fase label esperado obtido
  local fase="$1" label="$2" expected="$3" actual="$4"
  if [[ "$actual" == "$expected" ]]; then
    printf '[OK] %s: %s = %s\n' "$fase" "$label" "$actual"
    return 0
  fi
  printf '[FAIL] %s: %s deveria ser %s, obtido %s\n' "$fase" "$label" "$expected" "$actual" >&2
  return 1
}

extract_sqlstate() {
  printf '%s\n' "$1" | python3 -c 'import re,sys; text=sys.stdin.read(); m=re.search(r"ERROR:\s+([0-9A-Z]{5}):", text); print(m.group(1) if m else "")'
}

check_error() { # label sqlstate mensagem_opcional sql
  local label="$1" expected_sqlstate="$2" expected_message="$3" sql="$4" out status actual_sqlstate
  set +e
  out="$(docker exec -i "$container_name" psql -X -v VERBOSITY=verbose -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$sql" 2>&1)"
  status=$?
  set -e
  if (( status == 0 )); then
    printf '[FAIL] %s: a chamada passou (esperava SQLSTATE %s): %s\n' "$label" "$expected_sqlstate" "$out"
    return 1
  fi
  actual_sqlstate="$(extract_sqlstate "$out")"
  if [[ "$actual_sqlstate" != "$expected_sqlstate" ]]; then
    printf '[FAIL] %s: SQLSTATE divergente (esperava %s, obteve %s): %s\n' "$label" "$expected_sqlstate" "${actual_sqlstate:-vazio}" "$out"
    return 1
  fi
  if [[ -n "$expected_message" && "$out" != *"$expected_message"* ]]; then
    printf '[FAIL] %s: mensagem divergente (esperava conter %s): %s\n' "$label" "$expected_message" "$out"
    return 1
  fi
  printf '[OK] %s (SQLSTATE %s)\n' "$label" "$expected_sqlstate"
  return 0
}

DEP_ALFA='50000000-0000-0000-0000-0000000000d1'
DEP_BETA='50000000-0000-0000-0000-0000000000d2'
DEP_GAMA='50000000-0000-0000-0000-0000000000d7'
DEP_VAZIO='50000000-0000-0000-0000-0000000000d9'
DEP_INEXISTENTE='50000000-0000-0000-0000-0000000000ff'
ADMIN_SUB='20000000-0000-0000-0000-0000000000a1'
AGENT_SUB='20000000-0000-0000-0000-0000000000a2'
SUP_SUB='20000000-0000-0000-0000-0000000000a3'
SIG_DEL='public.delete_department(uuid, uuid)'
SIG_OVW='public.departments_overview()'
REVOKE_LINE='REVOKE DELETE ON public.departments FROM authenticated;'

admin_call="BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='$ADMIN_SUB';"
agent_call="BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='$AGENT_SUB';"
sup_call="BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='$SUP_SUB';"
anon_call="BEGIN; SET LOCAL ROLE anon; SET LOCAL request.jwt.claim.sub='$ADMIN_SUB';"

# ── fixtures deterministicas, reaproveitadas nas mutacoes ─────────────────────
read -r -d '' SEED_SQL <<SQL || true
DELETE FROM public.department_audit_logs;
DELETE FROM public.audit_logs;
DELETE FROM public.queue_members;
DELETE FROM public.team_conversations;
DELETE FROM public.profiles;
DELETE FROM public.queues;
DELETE FROM public.user_roles;
DELETE FROM public.departments;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('$ADMIN_SUB','admin'),
  ('$AGENT_SUB','agent'),
  ('$SUP_SUB','supervisor');

INSERT INTO public.departments (id, name) VALUES
  ('$DEP_ALFA','Departamento Alfa'),
  ('$DEP_BETA','Departamento Beta'),
  ('$DEP_GAMA','Departamento Gama'),
  ('$DEP_VAZIO','Departamento Vazio');

INSERT INTO public.profiles (id, user_id, role, department_id, updated_at) VALUES
  ('10000000-0000-0000-0000-0000000000f1','$ADMIN_SUB','admin','$DEP_ALFA','2020-01-01T00:00:00+00'),
  ('10000000-0000-0000-0000-0000000000f2','$AGENT_SUB','agent','$DEP_ALFA','2020-01-02T00:00:00+00'),
  ('10000000-0000-0000-0000-0000000000f3','$SUP_SUB','supervisor','$DEP_ALFA','2020-01-03T00:00:00+00');

INSERT INTO public.team_conversations (id, type, department_id, updated_at) VALUES
  ('60000000-0000-0000-0000-0000000000c1','group','$DEP_ALFA','2020-02-01T00:00:00+00'),
  ('60000000-0000-0000-0000-0000000000c2','department','$DEP_BETA','2020-02-02T00:00:00+00'),
  ('60000000-0000-0000-0000-0000000000c7','department','$DEP_GAMA','2020-02-07T00:00:00+00');

INSERT INTO public.queues (id, name) VALUES ('70000000-0000-0000-0000-0000000000a1','Fila Alfa');

INSERT INTO public.queue_members (id, queue_id, profile_id, is_active) VALUES
  ('71000000-0000-0000-0000-0000000000b1','70000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-0000000000f2',true);
SQL
export SEED_SQL

reseed() { printf '%s\n' "$SEED_SQL" | psql_q >/dev/null; }

# ── contrato DEPOIS: devolve 0 se TODAS passam, 1 na primeira violacao ────────
checa_contrato() { # fase
  local fase="$1"
  reseed

  assert_eq "$fase" 'has_table_privilege(authenticated, departments, DELETE)' 'f' \
    "$(q1 "SELECT has_table_privilege('authenticated','public.departments','DELETE')")" || return 1

  check_error "$fase: DELETE direto do admin e barrado (42501, grant revogado)" '42501' '' \
    "$admin_call DELETE FROM public.departments WHERE id='$DEP_VAZIO'; COMMIT;" || return 1

  check_error "$fase: INSERT do supervisor e barrado pela RLS (42501)" '42501' '' \
    "$sup_call INSERT INTO public.departments (name) VALUES ('Depto Supervisor'); COMMIT;" || return 1

  check_error "$fase: INSERT do agente e barrado pela RLS (42501)" '42501' '' \
    "$agent_call INSERT INTO public.departments (name) VALUES ('Depto Agente'); COMMIT;" || return 1

  q1 "$admin_call INSERT INTO public.departments (name) VALUES ('Departamento Novo'); COMMIT;" >/dev/null \
    || { printf '[FAIL] %s: o admin deveria inserir direto\n' "$fase" >&2; return 1; }
  assert_eq "$fase" 'admin INSERT direto conta 1' '1' \
    "$(q1 "SELECT count(*) FROM public.departments WHERE name='Departamento Novo'")" || return 1

  q1 "$agent_call UPDATE public.departments SET name='HACK' WHERE id='$DEP_VAZIO'; COMMIT;" >/dev/null || true
  assert_eq "$fase" 'agente nao renomeia (UPDATE RLS filtra)' 'Departamento Vazio' \
    "$(q1 "SELECT name FROM public.departments WHERE id='$DEP_VAZIO'")" || return 1

  assert_eq "$fase" "has_function_privilege(authenticated, $SIG_DEL, EXECUTE)" 't' \
    "$(q1 "SELECT has_function_privilege('authenticated','$SIG_DEL','EXECUTE')")" || return 1
  assert_eq "$fase" "has_function_privilege(anon, $SIG_DEL, EXECUTE)" 'f' \
    "$(q1 "SELECT has_function_privilege('anon','$SIG_DEL','EXECUTE')")" || return 1

  check_error "$fase: anon nao executa a RPC (42501)" '42501' '' \
    "$anon_call SELECT public.delete_department('$DEP_VAZIO', NULL); COMMIT;" || return 1
  check_error "$fase: agente nao executa a RPC (42501)" '42501' '' \
    "$agent_call SELECT public.delete_department('$DEP_VAZIO', NULL); COMMIT;" || return 1
  check_error "$fase: supervisor nao executa a RPC (42501, so admin)" '42501' '' \
    "$sup_call SELECT public.delete_department('$DEP_VAZIO', NULL); COMMIT;" || return 1

  check_error "$fase: departamento inexistente recusado" 'P0002' 'department_not_found' \
    "$admin_call SELECT public.delete_department('$DEP_INEXISTENTE', NULL); COMMIT;" || return 1
  check_error "$fase: mover para si mesmo recusado" '22023' 'invalid_move_target' \
    "$admin_call SELECT public.delete_department('$DEP_ALFA', '$DEP_ALFA'); COMMIT;" || return 1

  # recusa com contagens, SEM apagar
  assert_eq "$fase" 'sem destino: recusa department_in_use' 'department_in_use' \
    "$(q1 "$admin_call SELECT (public.delete_department('$DEP_ALFA', NULL))->>'error'; COMMIT;")" || return 1
  assert_eq "$fase" 'sem destino: Alfa continua' '1' \
    "$(q1 "SELECT count(*) FROM public.departments WHERE id='$DEP_ALFA'")" || return 1
  assert_eq "$fase" 'sem destino: membros contados >=1' 't' \
    "$(q1 "$admin_call SELECT ((public.delete_department('$DEP_ALFA', NULL))->>'members')::int >= 1; COMMIT;")" || return 1
  assert_eq "$fase" 'sem destino: filas contadas >=1' 't' \
    "$(q1 "$admin_call SELECT ((public.delete_department('$DEP_ALFA', NULL))->>'queues')::int >= 1; COMMIT;")" || return 1

  # move + apaga + audita (updated_at preservado: o gatilho e desligado so no UPDATE da RPC)
  local ts_perfil_antes ts_perfil_depois ts_conv_antes ts_conv_depois
  ts_perfil_antes="$(q1 "SELECT updated_at::text FROM public.profiles WHERE user_id='$AGENT_SUB'")"
  ts_conv_antes="$(q1 "SELECT updated_at::text FROM public.team_conversations WHERE id='60000000-0000-0000-0000-0000000000c1'")"

  assert_eq "$fase" 'com destino: ok true' 'true' \
    "$(q1 "$admin_call SELECT (public.delete_department('$DEP_ALFA', '$DEP_BETA'))->>'ok'; COMMIT;")" || return 1

  ts_perfil_depois="$(q1 "SELECT updated_at::text FROM public.profiles WHERE user_id='$AGENT_SUB'")"
  ts_conv_depois="$(q1 "SELECT updated_at::text FROM public.team_conversations WHERE id='60000000-0000-0000-0000-0000000000c1'")"
  assert_eq "$fase" 'com destino: updated_at do membro ANTES=DEPOIS' "$ts_perfil_antes" "$ts_perfil_depois" || return 1
  assert_eq "$fase" 'com destino: updated_at da conversa ANTES=DEPOIS' "$ts_conv_antes" "$ts_conv_depois" || return 1
  assert_eq "$fase" 'com destino: membro mudou de departamento' "$DEP_BETA" \
    "$(q1 "SELECT department_id FROM public.profiles WHERE user_id='$AGENT_SUB'")" || return 1
  assert_eq "$fase" 'com destino: Alfa apagado' '0' \
    "$(q1 "SELECT count(*) FROM public.departments WHERE id='$DEP_ALFA'")" || return 1
  assert_eq "$fase" 'com destino: membros movidos' '3' \
    "$(q1 "SELECT count(*) FROM public.profiles WHERE department_id='$DEP_BETA'")" || return 1
  assert_eq "$fase" 'com destino: conversas movidas' '2' \
    "$(q1 "SELECT count(*) FROM public.team_conversations WHERE department_id='$DEP_BETA'")" || return 1
  assert_eq "$fase" 'com destino: auditoria global sobrevive' '1' \
    "$(q1 "SELECT count(*) FROM public.audit_logs WHERE action='delete_department' AND entity_id='$DEP_ALFA'")" || return 1
  assert_eq "$fase" 'com destino: auditoria do destino registrada' '1' \
    "$(q1 "SELECT count(*) FROM public.department_audit_logs WHERE department_id='$DEP_BETA' AND action='delete_department'")" || return 1

  # vazio sem destino: apaga
  reseed
  assert_eq "$fase" 'vazio: ok true' 'true' \
    "$(q1 "$admin_call SELECT (public.delete_department('$DEP_VAZIO', NULL))->>'ok'; COMMIT;")" || return 1
  assert_eq "$fase" 'vazio: apagado' '0' \
    "$(q1 "SELECT count(*) FROM public.departments WHERE id='$DEP_VAZIO'")" || return 1
  assert_eq "$fase" 'vazio: auditoria global registrada' '1' \
    "$(q1 "SELECT count(*) FROM public.audit_logs WHERE action='delete_department' AND entity_id='$DEP_VAZIO'")" || return 1

  # conflito do indice unico ao mover conversa-tipo
  reseed
  check_error "$fase: mover 2 conversas-tipo colidiria (recusa)" '22023' 'move_target_already_has_department_conversation' \
    "$admin_call SELECT public.delete_department('$DEP_GAMA', '$DEP_BETA'); COMMIT;" || return 1
  assert_eq "$fase" 'conflito: Gama continua' '1' \
    "$(q1 "SELECT count(*) FROM public.departments WHERE id='$DEP_GAMA'")" || return 1

  # overview
  assert_eq "$fase" 'overview: admin ve as 4 linhas' '4' \
    "$(q1 "$admin_call SELECT count(*) FROM public.departments_overview(); COMMIT;")" || return 1
  check_error "$fase: overview do supervisor e barrado (42501, so admin)" '42501' '' \
    "$sup_call SELECT * FROM public.departments_overview(); COMMIT;" || return 1
  check_error "$fase: overview do agente e barrado (42501)" '42501' '' \
    "$agent_call SELECT * FROM public.departments_overview(); COMMIT;" || return 1
  check_error "$fase: overview do anon e barrado (42501)" '42501' '' \
    "$anon_call SELECT * FROM public.departments_overview(); COMMIT;" || return 1

  return 0
}

exige_falha_do_contrato() { # fase
  local fase="$1" evid
  evid="$( ( checa_contrato "$fase" ) 2>&1 || true )"
  if [[ "$evid" == *'[FAIL]'* ]]; then
    printf '%s\n' "$evid" | sed 's/^/[EVIDENCIA] /'
    return 0
  fi
  printf '%s\n' "$evid" >&2
  return 1
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration ausente: $migration"

# ── leitura estatica do arquivo do repo ──────────────────────────────────────
grep -qF 'USING (public.is_admin(auth.uid()))' "$migration" ||
  fail 'o arquivo do repo perdeu a policy de escrita para is_admin()'
grep -qF 'IF NOT public.is_admin(v_uid) THEN' "$migration" ||
  fail 'o arquivo do repo perdeu o portao de papel da RPC delete_department'
grep -qF "CREATE OR REPLACE FUNCTION public.delete_department(" "$migration" ||
  fail 'o arquivo do repo perdeu a RPC delete_department'
grep -qF "CREATE OR REPLACE FUNCTION public.departments_overview()" "$migration" ||
  fail 'o arquivo do repo perdeu a RPC departments_overview'
grep -qF 'GRANT EXECUTE ON FUNCTION public.delete_department(uuid, uuid) TO authenticated;' "$migration" ||
  fail 'o arquivo do repo perdeu o GRANT de EXECUTE da RPC'
if grep -qF 'GRANT DELETE ON public.departments' "$migration"; then
  fail 'o arquivo do repo CONCEDE DELETE em public.departments (nao pode)'
fi
ok 'o arquivo do repo tem is_admin/RPCs e nao concede DELETE; REVOKE e validado por SQL real'

mkdir -p "$tmp_dir"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=dept_admin_test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 60); do
  if psql_q -c 'SELECT 1' >/dev/null 2>&1; then
    ready=$((ready + 1)); (( ready >= 2 )) && break
  else
    ready=0
  fi
  sleep 1
done
(( ready >= 2 )) || { printf 'FAIL: PostgreSQL de teste não iniciou\n' >&2; exit 1; }

# ── bootstrap: schema minimo fiel + seeds + estado PRE-migration ─────────────
cat > "$tmp_dir/bootstrap.sql" <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL
);
CREATE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
$$;
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','supervisor'))
$$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text,
  is_active boolean DEFAULT true,
  department_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION public.current_profile_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

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
CREATE POLICY departments_select ON public.departments
  FOR SELECT TO authenticated USING (true);
-- Estado PRE-migration (20260902120000): escrita para admin OU supervisor.
CREATE POLICY departments_admin_write ON public.departments
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);

CREATE TABLE public.team_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'group',
  name text,
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_team_conversations_dept_unique
  ON public.team_conversations(department_id) WHERE type = 'department' AND department_id IS NOT NULL;

-- Gatilhos de updated_at reais (update_updated_at_column: NEW.updated_at = now()).
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_team_conversations_updated_at
  BEFORE UPDATE ON public.team_conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.queues (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL);
CREATE TABLE public.queue_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL REFERENCES public.queues(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  is_active boolean DEFAULT true
);
CREATE TABLE public.department_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  action text NOT NULL,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  profile_name text
);
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
-- Estado PRE-migration: DELETE de TABELA concedido ao authenticated.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
SQL
psql_file "$tmp_dir/bootstrap.sql" >/dev/null
ok 'bootstrap: roles, auth.uid(), catalogo minimo, policies PRE e grants PRE'

reseed
ok 'fixtures carregadas'

echo
echo '── ANTES: o defeito medido (delete direto e escrita ampla) ─────────────────'
v="$(q1 "SELECT has_table_privilege('authenticated','public.departments','DELETE')")"
[[ "$v" == t ]] || fail "ANTES nao reproduziu: authenticated DELETE = $v"
ok 'ANTES: has_table_privilege(authenticated, departments, DELETE) = t'
# supervisor escreve direto (a escrita ainda nao e so admin)
if q1 "$sup_call INSERT INTO public.departments (name) VALUES ('Depto Supervisor ANTES'); COMMIT;" >/dev/null; then
  ok 'ANTES: supervisor insere departamento direto (escrita nao e admin-only)'
else
  fail 'ANTES nao reproduziu: supervisor nao conseguiu inserir'
fi
# exclusao direta do admin apaga conversa em cascata, sem checagem
q1 "INSERT INTO public.departments (id, name) VALUES ('70000000-0000-0000-0000-0000000000d5','Depto Cascata');" >/dev/null
q1 "INSERT INTO public.team_conversations (id, type, department_id) VALUES ('60000000-0000-0000-0000-0000000000c5','group','70000000-0000-0000-0000-0000000000d5');" >/dev/null
q1 "$admin_call DELETE FROM public.departments WHERE id='70000000-0000-0000-0000-0000000000d5'; COMMIT;" >/dev/null
v="$(q1 "SELECT count(*) FROM public.team_conversations WHERE id='60000000-0000-0000-0000-0000000000c5'")"
[[ "$v" == 0 ]] || fail "ANTES nao reproduziu a cascata: conversa ainda existe = $v"
ok 'ANTES: delete direto apagou a conversa em cascata, sem checagem (o defeito)'

echo
echo '── DEPOIS: aplicando o SQL real da migration ──────────────────────────────'
psql_file "$migration" >/dev/null
if ! checa_contrato 'DEPOIS'; then
  fail 'DEPOIS: o contrato deveria passar com a migration aplicada'
fi
ok 'DEPOIS: o contrato inteiro passa com a migration aplicada'

echo
echo '── MUTACAO A: copia sem o REVOKE DELETE (arquivo do repo intacto) ─────────'
mut_a="$tmp_dir/mut_a_sem_revoke.sql"
grep -v -F "$REVOKE_LINE" "$migration" > "$mut_a"
grep -qF "$REVOKE_LINE" "$mut_a" && fail 'MUTACAO A: a copia ainda tem o REVOKE'
grep -qF "CREATE OR REPLACE FUNCTION public.delete_department(" "$mut_a" || fail 'MUTACAO A: a copia perdeu a RPC (mutacao ampla demais)'
grep -qF "$REVOKE_LINE" "$migration" || fail 'MUTACAO A: o arquivo do repo foi alterado'
ok 'MUTACAO A: copia sem o REVOKE (copia em TMPDIR da tarefa)'
reseed
q1 "DROP FUNCTION IF EXISTS public.delete_department(uuid, uuid); DROP FUNCTION IF EXISTS public.departments_overview();" >/dev/null
q1 "GRANT DELETE ON public.departments TO authenticated;" >/dev/null   # reconstroi o estado legado
psql_file "$mut_a" >/dev/null
if exige_falha_do_contrato 'MUTACAO A'; then
  ok 'MUTACAO A: sem o REVOKE o contrato FALHA como esperado (DELETE direto segue possivel)'
else
  fail 'MUTACAO A: sem o REVOKE o contrato passou -- a revogacao nao esta coberta'
fi

echo
echo '── MUTACAO B: copia com o portao de papel desligado (arquivo intacto) ─────'
mut_b="$tmp_dir/mut_b_gate_off.sql"
sed 's/IF NOT public.is_admin(v_uid) THEN/IF false THEN/' "$migration" > "$mut_b"
grep -qF 'IF false THEN' "$mut_b" || fail 'MUTACAO B: a copia nao aplicou a troca do portao'
grep -qF 'IF NOT public.is_admin(v_uid) THEN' "$mut_b" && fail 'MUTACAO B: a copia ainda tem o portao'
grep -qF 'IF NOT public.is_admin(v_uid) THEN' "$migration" || fail 'MUTACAO B: o arquivo do repo foi alterado'
ok 'MUTACAO B: copia com o portao desligado (copia em TMPDIR da tarefa)'
reseed
q1 "DROP FUNCTION IF EXISTS public.delete_department(uuid, uuid); DROP FUNCTION IF EXISTS public.departments_overview();" >/dev/null
psql_file "$mut_b" >/dev/null
if exige_falha_do_contrato 'MUTACAO B'; then
  ok 'MUTACAO B: sem o portao o contrato FALHA como esperado (agente passa a apagar)'
else
  fail 'MUTACAO B: sem o portao o contrato passou -- o gate de papel nao esta coberto'
fi

echo
echo '── MUTACAO C: copia com overview liberado ao supervisor ───────────────────'
mut_c="$tmp_dir/mut_c_overview_supervisor.sql"
python3 - "$migration" "$mut_c" <<'PY'
from pathlib import Path
import sys
src, dst = map(Path, sys.argv[1:])
s = src.read_text()
old = "IF NOT public.is_admin(auth.uid()) THEN"
pos = s.find(old)
if pos < 0:
    raise SystemExit('MUTACAO C: nao encontrou o gate is_admin do overview')
s = s[:pos] + "IF NOT public.is_admin_or_supervisor(auth.uid()) THEN" + s[pos + len(old):]
dst.write_text(s)
PY
grep -qF 'IF NOT public.is_admin_or_supervisor(auth.uid()) THEN' "$mut_c" || fail 'MUTACAO C: a copia nao abriu o overview para supervisor'
ok 'MUTACAO C: copia com overview liberado para supervisor (copia em TMPDIR da tarefa)'
reseed
q1 "DROP FUNCTION IF EXISTS public.delete_department(uuid, uuid); DROP FUNCTION IF EXISTS public.departments_overview();" >/dev/null
psql_file "$mut_c" >/dev/null
if exige_falha_do_contrato 'MUTACAO C'; then
  ok 'MUTACAO C: se overview aceitar supervisor o contrato FALHA como esperado'
else
  fail 'MUTACAO C: overview liberado para supervisor passou -- o gate admin-only nao esta coberto'
fi

echo
echo '── MUTACAO D: copia com SQLSTATE errado no conflito de move ────────────────'
mut_d="$tmp_dir/departments_admin_mut_wrong_sqlstate.sql"
python3 - "$migration" "$mut_d" <<'MUT_D_PY'
from pathlib import Path
import sys
src = Path(sys.argv[1])
dst = Path(sys.argv[2])
s = src.read_text()
old = "RAISE EXCEPTION 'move_target_already_has_department_conversation' USING ERRCODE = '22023';"
new = "RAISE EXCEPTION 'move_target_already_has_department_conversation' USING ERRCODE = 'P0001';"
if old not in s:
    raise SystemExit('MUTACAO D: nao encontrou o erro de conflito 22023')
dst.write_text(s.replace(old, new))
MUT_D_PY
ok 'MUTACAO D: copia com mesma mensagem e SQLSTATE errado (copia em TMPDIR da tarefa)'
reseed
q1 "DROP FUNCTION IF EXISTS public.delete_department(uuid, uuid); DROP FUNCTION IF EXISTS public.departments_overview();" >/dev/null
psql_file "$mut_d" >/dev/null
if exige_falha_do_contrato 'MUTACAO D'; then
  ok 'MUTACAO D: mesma mensagem com SQLSTATE errado FALHA como esperado'
else
  fail 'MUTACAO D: deveria falhar quando a mensagem bate mas o SQLSTATE muda'
fi

echo
echo '── ROLLBACK: o bloco do arquivo devolve o estado anterior ─────────────────'
q1 "DROP FUNCTION IF EXISTS public.delete_department(uuid, uuid); DROP FUNCTION IF EXISTS public.departments_overview();" >/dev/null
psql_file "$migration" >/dev/null   # estado final real
reseed
python3 - "$migration" "$tmp_dir/rollback.sql" <<'RB_PY'
from pathlib import Path
import sys
src = Path(sys.argv[1]).read_text().splitlines()
out = []
for line in src:
    if line.startswith('--   '):
        out.append(line.removeprefix('--   '))
    elif out:
        break
if not out:
    raise SystemExit('rollback nao encontrado no cabecalho da migration')
Path(sys.argv[2]).write_text('\n'.join(out) + '\n')
RB_PY
psql_file "$tmp_dir/rollback.sql" >/dev/null
v="$(q1 "SELECT has_table_privilege('authenticated','public.departments','DELETE')")"
[[ "$v" == t ]] || fail "ROLLBACK: DELETE nao voltou ao authenticated = $v"
ok 'ROLLBACK: DELETE de volta ao authenticated'
if q1 "$sup_call INSERT INTO public.departments (name) VALUES ('Depto Supervisor ROLLBACK'); COMMIT;" >/dev/null; then
  ok 'ROLLBACK: supervisor volta a escrever direto (policy restaurada)'
else
  fail 'ROLLBACK: a policy nao foi restaurada (supervisor ainda barrado)'
fi
v="$(q1 "SELECT to_regprocedure('$SIG_DEL') IS NULL")"
[[ "$v" == t ]] || fail 'ROLLBACK: a RPC delete_department nao foi removida'
v="$(q1 "SELECT to_regprocedure('$SIG_OVW') IS NULL")"
[[ "$v" == t ]] || fail 'ROLLBACK: a RPC departments_overview nao foi removida'
ok 'ROLLBACK: as duas RPCs foram removidas'

echo
printf '[OK] contrato departments-admin-gestao verificado: %s etapas (%s)\n' \
  "$passed" "$postgres_image"
