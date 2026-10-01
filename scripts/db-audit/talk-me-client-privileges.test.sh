#!/usr/bin/env bash
# Contrato executavel da migration 20260930460000:
# - papeis clientes recebem somente o DML necessario;
# - RLS permanece habilitada nas tabelas do fluxo;
# - guards de contacts vinculam mudancas a auth.uid();
# - bypass sem uid exige JWT e papel PostgreSQL service_role concordantes.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20260930460000_harden_talk_me_client_table_privileges.sql"
postgres_image="${TALK_ME_ACL_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-talk-me-acl-test-$$"
tmp_dir="$(mktemp -d /tmp/zapp-v2-talk-me-acl.XXXXXX)"

cleanup() {
  case "$tmp_dir" in /tmp/zapp-v2-talk-me-acl.*) rm -rf -- "$tmp_dir" ;; esac
  if [[ "$container_name" =~ ^zapp-v2-talk-me-acl-test-[0-9]+$ ]]; then
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

expect_ok() {
  local label="$1" sql="$2"
  psql_sql "$sql" >/dev/null || fail "$label deveria passar"
  printf '[PASS] %s\n' "$label"
}

expect_error() {
  local label="$1" needle="$2" sql="$3" output status
  set +e
  output="$(psql_sql "$sql" 2>&1)"; status=$?
  set -e
  (( status != 0 )) || fail "$label deveria falhar"
  [[ "$output" == *"$needle"* ]] || { printf '%s\n' "$output" >&2; fail "$label: erro nao continha '$needle'"; }
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null
ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1)); (( ready_checks >= 3 )) && break
  else
    ready_checks=0
  fi
  sleep 1
done
(( ready_checks >= 3 )) || fail 'PostgreSQL descartavel nao estabilizou'

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE authenticator NOLOGIN;
GRANT anon, authenticated, service_role TO authenticator;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    NULLIF(current_setting('request.jwt.claim.sub', true), '')
  ), '')::uuid
$$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
);
CREATE TABLE public.queues (id uuid PRIMARY KEY, name text);
CREATE TABLE public.queue_members (
  queue_id uuid NOT NULL REFERENCES public.queues(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  is_active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (queue_id, profile_id)
);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  name text,
  queue_id uuid REFERENCES public.queues(id),
  assigned_to uuid REFERENCES public.profiles(id)
);
CREATE TABLE public.messages (id uuid PRIMARY KEY, contact_id uuid REFERENCES public.contacts(id), content text);
CREATE TABLE public.feature_flags (key text PRIMARY KEY, enabled boolean NOT NULL DEFAULT false);
CREATE TABLE public.whatsapp_groups (id uuid PRIMARY KEY, group_id text NOT NULL, name text NOT NULL);
CREATE TABLE public.audit_logs (id uuid PRIMARY KEY, action text NOT NULL);

CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT profile.id FROM public.profiles profile
  WHERE profile.user_id = _user_id AND _user_id = auth.uid()
  LIMIT 1
$$;
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles user_role
    WHERE user_role.user_id = _user_id
      AND user_role.role IN ('admin', 'supervisor')
  )
$$;

CREATE FUNCTION public.prevent_contact_queue_hijack() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE FUNCTION public.prevent_contact_assignee_hijack() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER trg_prevent_contact_queue_hijack
  BEFORE UPDATE ON public.contacts FOR EACH ROW
  WHEN (OLD.queue_id IS DISTINCT FROM NEW.queue_id)
  EXECUTE FUNCTION public.prevent_contact_queue_hijack();
CREATE TRIGGER trg_prevent_contact_assignee_hijack
  BEFORE UPDATE ON public.contacts FOR EACH ROW
  WHEN (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to)
  EXECUTE FUNCTION public.prevent_contact_assignee_hijack();

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY contacts_authenticated_all ON public.contacts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Reproduz ACLs historicas excessivas para provar que a migration as substitui.
GRANT ALL PRIVILEGES ON TABLE public.contacts, public.messages, public.queues,
  public.queue_members, public.feature_flags, public.whatsapp_groups, public.audit_logs
TO PUBLIC, anon, authenticated, service_role;

INSERT INTO public.profiles (id, user_id, is_active) VALUES
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',true),
 ('a0000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002',true),
 ('a0000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003',true),
 ('a0000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000004',false);
INSERT INTO public.user_roles (user_id, role) VALUES
 ('10000000-0000-0000-0000-000000000001','agent'),
 ('10000000-0000-0000-0000-000000000002','agent'),
 ('10000000-0000-0000-0000-000000000003','admin');
INSERT INTO public.queues (id, name) VALUES
 ('b0000000-0000-0000-0000-000000000001','Comercial'),
 ('b0000000-0000-0000-0000-000000000002','Financeiro');
INSERT INTO public.queue_members (queue_id, profile_id, is_active) VALUES
 ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',true);
INSERT INTO public.contacts (id, name, queue_id) VALUES
 ('c0000000-0000-0000-0000-000000000001','Contato','b0000000-0000-0000-0000-000000000001'),
 ('c0000000-0000-0000-0000-000000000002','Sem fila',NULL);
SQL

psql_file "$tmp_dir/pre.sql"
psql_file "$migration"
# Reaplicacao deve preservar exatamente o mesmo contrato.
psql_file "$migration"

tables="ARRAY['contacts','messages','queues','queue_members','feature_flags','whatsapp_groups']"
extras="ARRAY['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']"

expect_value 'A1 anon nao possui acesso nas sete tabelas' 't' \
  "SELECT bool_and(NOT has_table_privilege('anon', 'public.'||table_name, privilege_name))
   FROM unnest(ARRAY['contacts','messages','queues','queue_members','feature_flags','whatsapp_groups','audit_logs']) table_name
   CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) privilege_name;"
expect_value 'A1b PUBLIC nao conserva nenhum grant explicito' '0' \
  "SELECT count(*) FROM information_schema.table_privileges
   WHERE table_schema='public'
     AND table_name = ANY (ARRAY['contacts','messages','queues','queue_members','feature_flags','whatsapp_groups','audit_logs'])
     AND grantee='PUBLIC';"
expect_value 'A2 authenticated recebe CRUD nas seis tabelas operacionais' 't' \
  "SELECT bool_and(has_table_privilege('authenticated','public.'||table_name,privilege_name))
   FROM unnest($tables) table_name CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) privilege_name;"
expect_value 'A3 authenticated nao recebe privilegios de estrutura' 't' \
  "SELECT bool_and(NOT has_table_privilege('authenticated','public.'||table_name,privilege_name))
   FROM unnest($tables) table_name CROSS JOIN unnest($extras) privilege_name;"
expect_value 'A4 audit_logs e somente leitura para authenticated' 't' \
  "SELECT has_table_privilege('authenticated','public.audit_logs','SELECT')
   AND NOT has_table_privilege('authenticated','public.audit_logs','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN');"
expect_value 'A5 service_role recebe somente CRUD nas seis tabelas operacionais' 't' \
  "SELECT bool_and(has_table_privilege('service_role','public.'||table_name,privilege_name))
          AND bool_and(NOT has_table_privilege('service_role','public.'||table_name,extra_name))
   FROM unnest($tables) table_name
   CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) privilege_name
   CROSS JOIN unnest($extras) extra_name;"
expect_value 'A6 audit_logs e append-only para service_role' 't' \
  "SELECT has_table_privilege('service_role','public.audit_logs','SELECT,INSERT')
   AND NOT has_table_privilege('service_role','public.audit_logs','UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN');"
expect_value 'A7 RLS esta habilitada nas sete tabelas' 't' \
  "SELECT count(*)=7 AND bool_and(relrowsecurity) FROM pg_class
   WHERE oid = ANY (ARRAY['public.contacts'::regclass,'public.messages'::regclass,
     'public.queues'::regclass,'public.queue_members'::regclass,
     'public.feature_flags'::regclass,'public.whatsapp_groups'::regclass,
     'public.audit_logs'::regclass]);"
expect_value 'A8 funcoes de trigger nao sao executaveis por papeis cliente' 't' \
  "SELECT bool_and(NOT has_function_privilege(role_name,function_name,'EXECUTE'))
   FROM unnest(ARRAY['anon','authenticated','service_role']) role_name
   CROSS JOIN unnest(ARRAY['public.prevent_contact_queue_hijack()','public.prevent_contact_assignee_hijack()']) function_name;"
expect_value 'A9 os dois triggers continuam anexados e ativos' '2' \
  "SELECT count(*) FROM pg_trigger WHERE tgrelid='public.contacts'::regclass
   AND tgname IN ('trg_prevent_contact_queue_hijack','trg_prevent_contact_assignee_hijack')
   AND tgenabled='O' AND NOT tgisinternal;"

agent='{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}'
admin='{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}'
spoof='{"sub":"10000000-0000-0000-0000-000000000001","role":"service_role"}'
service='{"role":"service_role"}'

as_authenticated() { printf "SET SESSION AUTHORIZATION authenticator; SET ROLE authenticated; SELECT set_config('request.jwt.claims','%s',false); %s" "$1" "$2"; }
as_service() { printf "SET SESSION AUTHORIZATION authenticator; SET ROLE service_role; SELECT set_config('request.jwt.claims','%s',false); %s" "$service" "$1"; }

expect_error 'B1 agente nao move contato para fila sem membership' 'Sem permissao para mover contato' \
  "$(as_authenticated "$agent" "UPDATE public.contacts SET queue_id='b0000000-0000-0000-0000-000000000002' WHERE id='c0000000-0000-0000-0000-000000000001';")"
expect_error 'B2 agente nao atribui perfil inativo/sem role operacional' 'Sem permissao para atribuir contato' \
  "$(as_authenticated "$agent" "UPDATE public.contacts SET assigned_to='a0000000-0000-0000-0000-000000000004' WHERE id='c0000000-0000-0000-0000-000000000001';")"
expect_error 'B3 authenticated sem uid falha fechado' 'authentication_required' \
  "$(as_authenticated '{"role":"authenticated"}' "UPDATE public.contacts SET queue_id='b0000000-0000-0000-0000-000000000002' WHERE id='c0000000-0000-0000-0000-000000000001';")"
expect_error 'B4 role alegado service_role nao burla papel PostgreSQL authenticated' 'Sem permissao para mover contato' \
  "$(as_authenticated "$spoof" "UPDATE public.contacts SET queue_id='b0000000-0000-0000-0000-000000000002' WHERE id='c0000000-0000-0000-0000-000000000001';")"
expect_error 'B5 service_role alegado sem uid tambem exige papel PostgreSQL correspondente' 'authentication_required' \
  "$(as_authenticated '{"role":"service_role"}' "UPDATE public.contacts SET queue_id='b0000000-0000-0000-0000-000000000002' WHERE id='c0000000-0000-0000-0000-000000000001';")"
expect_ok 'B6 service_role real sem uid pode executar job de manutencao' \
  "$(as_service "UPDATE public.contacts SET queue_id='b0000000-0000-0000-0000-000000000002', assigned_to='a0000000-0000-0000-0000-000000000004' WHERE id='c0000000-0000-0000-0000-000000000001';")"
expect_ok 'B7 superusuario interno sem JWT preserva manutencao confiavel' \
  "RESET ROLE; SELECT set_config('request.jwt.claims','',false); UPDATE public.contacts SET queue_id='b0000000-0000-0000-0000-000000000001', assigned_to=NULL WHERE id='c0000000-0000-0000-0000-000000000001';"
expect_ok 'B8 agente pode atribuir perfil ativo com role operacional' \
  "$(as_authenticated "$agent" "UPDATE public.contacts SET assigned_to='a0000000-0000-0000-0000-000000000002' WHERE id='c0000000-0000-0000-0000-000000000001';")"
expect_error 'B9 contato sem fila so pode ser autoatribuido pelo agente' 'Sem permissao para atribuir contato' \
  "$(as_authenticated "$agent" "UPDATE public.contacts SET assigned_to='a0000000-0000-0000-0000-000000000002' WHERE id='c0000000-0000-0000-0000-000000000002';")"
expect_ok 'B10 contato sem fila aceita autoatribuicao' \
  "$(as_authenticated "$agent" "UPDATE public.contacts SET assigned_to='a0000000-0000-0000-0000-000000000001' WHERE id='c0000000-0000-0000-0000-000000000002';")"
expect_ok 'B11 admin pode mover contato entre filas' \
  "$(as_authenticated "$admin" "UPDATE public.contacts SET queue_id='b0000000-0000-0000-0000-000000000002' WHERE id='c0000000-0000-0000-0000-000000000001';")"
expect_error 'B12 anon nao le contatos' 'permission denied for table contacts' \
  "SET SESSION AUTHORIZATION authenticator; SET ROLE anon; SELECT * FROM public.contacts;"
expect_error 'B13 authenticated nao insere audit log diretamente' 'permission denied for table audit_logs' \
  "$(as_authenticated "$agent" "INSERT INTO public.audit_logs VALUES ('d0000000-0000-0000-0000-000000000001','client-write');")"
expect_ok 'B14 service_role insere audit log append-only' \
  "$(as_service "INSERT INTO public.audit_logs VALUES ('d0000000-0000-0000-0000-000000000001','service-write');")"
expect_error 'B15 service_role nao reescreve audit log' 'permission denied for table audit_logs' \
  "$(as_service "UPDATE public.audit_logs SET action='rewritten';")"

printf '\n[OK] privilegios e guards TALK ME/Inbox/Contatos validados\n'
