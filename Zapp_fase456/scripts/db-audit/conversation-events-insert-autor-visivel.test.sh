#!/usr/bin/env bash
# Contrato do INSERT em public.conversation_events (N-143, SEC-RLS_CONTATOS_MENSAGENS-09).
#
# Defeito: a politica "Authorized users can insert events" (20260412170036) aceitava
# performed_by NULL (evento "do sistema" forjado por usuario) e media a visibilidade por
# contacts.assigned_to, ignorando is_contact_visible_to_user.
#
# BLOCO A (antes): com a politica vigente, o agente comum grava evento SEM autor.
# BLOCO B (depois): aplica a migration do cartao e prova, com papel real (SET LOCAL ROLE
#   authenticated + claims): autor = proprio perfil (NULL vira o perfil do chamador pelo
#   BEFORE INSERT), autor alheio recusado, contato invisivel recusado, contato visivel por
#   fila aceito, admin tambem nao forja autor, service_role segue gravando evento sem autor.
# BLOCO C (vacuidade): ZAPP_CONVEVENTS_SEM_CORRECAO=1 nao aplica a migration e o BLOCO B
#   tem de FALHAR.
#
# Funcoes reais extraidas dos arquivos versionados:
#   current_profile_id          -> 20260928140000_tasks_unify_reminders_kanban.sql
#   is_contact_visible_to_user  -> 20260909200000_harden_inbox_contact_authorization.sql
#   politica antiga             -> 20260412170036_1c09550f-234f-4215-954f-9e0efd5ed610.sql

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261010071402_conversation_events_insert_autor_e_contato_visivel.sql"
arq_politica_antiga="$repo_root/supabase/migrations/20260412170036_1c09550f-234f-4215-954f-9e0efd5ed610.sql"
arq_profile="$repo_root/supabase/migrations/20260928140000_tasks_unify_reminders_kanban.sql"
arq_visible="$repo_root/supabase/migrations/20260909200000_harden_inbox_contact_authorization.sql"
postgres_image="${CONVEVENTS_TEST_POSTGRES_IMAGE:-postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a3278a52a7ec49117deedb300e552b24}"
container_name="zapp-v2-convevents-test-$$"
sem_correcao="${ZAPP_CONVEVENTS_SEM_CORRECAO:-0}"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-convevents-test-[0-9]+$ ]]; then
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
expect_error() {
  local label="$1" needle="$2" sql="$3" output status
  set +e
  output="$(docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$sql" 2>&1)"; status=$?
  set -e
  (( status == 0 )) && { printf '%s\n' "$output" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$output" == *"$needle"* ]] || { printf '%s\n' "$output" >&2; fail "$label: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$label"
}
expect_ok() {
  local label="$1" sql="$2" output status
  set +e
  output="$(docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$sql" 2>&1)"; status=$?
  set -e
  (( status == 0 )) || { printf '%s\n' "$output" >&2; fail "$label: deveria passar, mas falhou"; }
  printf '[PASS] %s\n' "$label"
}

# Extrai o CREATE FUNCTION <nome> de um arquivo versionado, verbatim.
extrair_funcao() {
  python3 - "$1" "$2" <<'PY'
import re, sys
caminho, nome = sys.argv[1], sys.argv[2]
fonte = open(caminho, encoding='utf-8').read()
padrao = re.compile(r'^CREATE (?:OR REPLACE )?FUNCTION public\.' + re.escape(nome)
                    + r'\s*\(.*?\n(?:\$function\$|\$\$);', re.S | re.M)
achado = padrao.search(fonte)
if not achado:
    sys.exit('funcao %s nao encontrada em %s' % (nome, caminho))
sys.stdout.write(achado.group(0) + '\n')
PY
}

# Executa $2 como o usuario autenticado $1 (papel real + claims), em transacao propria.
como() {
  printf "BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{\"sub\":\"%s\",\"role\":\"authenticated\"}', true); %s COMMIT;" "$1" "$2"
}

# Extrai o bloco executavel de rollback (linhas comentadas '--   <stmt>;') do proprio arquivo da
# migration, verbatim — prova que o rollback escrito no cabecalho roda.
extrair_rollback() {
  python3 - "$1" <<'PY'
import sys
saida = []
for l in open(sys.argv[1], encoding='utf-8').read().splitlines():
    if l.startswith('--   '):
        saida.append(l[len('--   '):])
    elif saida and not l.startswith('--'):
        break
if not saida:
    sys.exit('bloco de rollback executavel nao encontrado em %s' % sys.argv[1])
sys.stdout.write('\n'.join(saida) + '\n')
PY
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

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
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
       nullif(current_setting('request.jwt.claim.sub', true), '')
     ), '')::uuid $$;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE);
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL, PRIMARY KEY (user_id, role));
CREATE TABLE public.queue_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), queue_id uuid NOT NULL, profile_id uuid NOT NULL,
  is_active boolean DEFAULT true
);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY, assigned_to uuid REFERENCES public.profiles(id), queue_id uuid
);
CREATE TABLE public.conversation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_agent_id uuid REFERENCES public.profiles(id),
  to_agent_id uuid REFERENCES public.profiles(id),
  metadata jsonb DEFAULT '{}',
  performed_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.conversation_events ENABLE ROW LEVEL SECURITY;

-- Dependencias de visibilidade (corpos simplificados; o que esta sob teste e a politica).
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin') $$;
CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT id FROM public.profiles WHERE user_id = _user_id LIMIT 1 $$;
CREATE FUNCTION public.get_visible_agent_ids(_user_id uuid) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT id FROM public.profiles WHERE user_id = _user_id $$;

GRANT SELECT, INSERT ON public.conversation_events TO authenticated, service_role;
GRANT SELECT ON public.contacts, public.profiles, public.queue_members TO authenticated;
SQL

{
  extrair_funcao "$arq_profile" current_profile_id
  extrair_funcao "$arq_visible" is_contact_visible_to_user
  cat <<'SQL'
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_contact_visible_to_user(uuid, uuid) TO authenticated;
SQL
} > "$tmp_dir/funcoes.sql"

# Dados: A (agente, dono de c1), B (agente, dono de c2), C (membro da fila q1; c3 na fila),
# D (admin).
cat > "$tmp_dir/dados.sql" <<'SQL'
INSERT INTO public.profiles(id, user_id) VALUES
  ('a0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-00000000000a'),
  ('b0000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-00000000000b'),
  ('c0000000-0000-0000-0000-00000000000c','cccccccc-0000-0000-0000-00000000000c'),
  ('d0000000-0000-0000-0000-00000000000d','dddddddd-0000-0000-0000-00000000000d');
INSERT INTO public.user_roles VALUES ('dddddddd-0000-0000-0000-00000000000d','admin');
INSERT INTO public.queue_members(queue_id, profile_id)
  VALUES ('90000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-00000000000c');
INSERT INTO public.contacts(id, assigned_to, queue_id) VALUES
  ('10000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a',NULL),
  ('20000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-00000000000b',NULL),
  ('30000000-0000-0000-0000-000000000003',NULL,'90000000-0000-0000-0000-000000000001');
SQL

psql_file "$tmp_dir/pre.sql"
psql_file "$tmp_dir/funcoes.sql"
psql_file "$arq_politica_antiga"
psql_file "$tmp_dir/dados.sql"

UA=aaaaaaaa-0000-0000-0000-00000000000a
UC=cccccccc-0000-0000-0000-00000000000c
UD=dddddddd-0000-0000-0000-00000000000d
PA=a0000000-0000-0000-0000-00000000000a
PB=b0000000-0000-0000-0000-00000000000b
PD=d0000000-0000-0000-0000-00000000000d
C1=10000000-0000-0000-0000-000000000001
C2=20000000-0000-0000-0000-000000000002
C3=30000000-0000-0000-0000-000000000003
ins() { printf "INSERT INTO public.conversation_events(contact_id,event_type,performed_by) VALUES ('%s','transfer',%s);" "$1" "$2"; }

echo '== BLOCO A: defeito presente na politica vigente =='
expect_ok 'A1 antes: agente grava evento SEM autor (defeito)' "$(como "$UA" "$(ins "$C1" NULL)")"
expect_value 'A2 antes: o evento ficou com performed_by NULL' '1' \
  "SELECT count(*) FROM public.conversation_events WHERE contact_id='$C1' AND performed_by IS NULL"
psql_sql 'TRUNCATE public.conversation_events'

if [[ "$sem_correcao" != "1" ]]; then
  psql_file "$migration"
fi

echo '== BLOCO B: contrato apos a migration =='
expect_ok 'B1 agente grava evento com o proprio autor no contato proprio' \
  "$(como "$UA" "$(ins "$C1" "'$PA'")")"
expect_ok 'B2 agente grava evento sem informar autor (front atual)' \
  "$(como "$UA" "$(ins "$C1" NULL)")"
expect_value 'B3 autor omitido virou o perfil do chamador (nao NULL)' '2' \
  "SELECT count(*) FROM public.conversation_events WHERE contact_id='$C1' AND performed_by='$PA'"
expect_error 'B4 agente nao grava evento com autor alheio' 'row-level security' \
  "$(como "$UA" "$(ins "$C1" "'$PB'")")"
expect_error 'B5 agente nao grava evento em contato invisivel' 'row-level security' \
  "$(como "$UA" "$(ins "$C2" "'$PA'")")"
expect_ok 'B6 membro da fila grava evento em contato visivel pela fila' \
  "$(como "$UC" "$(ins "$C3" NULL)")"
expect_ok 'B7 admin grava evento com o proprio autor em qualquer contato' \
  "$(como "$UD" "$(ins "$C2" "'$PD'")")"
expect_error 'B8 admin tambem nao forja autor alheio' 'row-level security' \
  "$(como "$UD" "$(ins "$C2" "'$PA'")")"
expect_ok 'B9 service_role segue gravando evento sem autor' \
  "BEGIN; SET LOCAL ROLE service_role; $(ins "$C1" NULL) COMMIT;"
expect_value 'B10 evento do servidor permaneceu sem autor' '1' \
  "SELECT count(*) FROM public.conversation_events WHERE contact_id='$C1' AND performed_by IS NULL"

if [[ "$sem_correcao" != "1" ]]; then
  echo '== BLOCO C: rollback do cabecalho devolve o estado anterior =='
  psql_sql 'TRUNCATE public.conversation_events'
  rollback_sql="$tmp_dir/rollback.sql"
  extrair_rollback "$migration" > "$rollback_sql"
  psql_file "$rollback_sql"
  expect_value 'C1 funcao do gatilho removida' '0' \
    "SELECT count(*) FROM pg_proc WHERE proname='conversation_events_default_performed_by'"
  expect_value 'C2 gatilho removido' '0' \
    "SELECT count(*) FROM pg_trigger WHERE tgname='trg_conversation_events_default_performed_by'"
  expect_ok 'C3 politica anterior de volta: agente grava SEM autor de novo' \
    "$(como "$UA" "$(ins "$C1" NULL)")"
  expect_value 'C4 evento sem autor aceito apos o rollback (trigger nao preenche)' '1' \
    "SELECT count(*) FROM public.conversation_events WHERE contact_id='$C1' AND performed_by IS NULL"
  psql_file "$migration"
  expect_value 'C5 migration reaplica (idempotente): gatilho volta' '1' \
    "SELECT count(*) FROM pg_trigger WHERE tgname='trg_conversation_events_default_performed_by'"
fi

echo 'OK: conversation_events so aceita INSERT com o proprio autor e contato visivel (rollback devolve o estado anterior)'
