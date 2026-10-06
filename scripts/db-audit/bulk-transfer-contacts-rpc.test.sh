#!/usr/bin/env bash
# R2-INB-009 / item 88 — prova comportamental da RPC única de transferência.
# Executa a migration e o trigger real log_assignment_change em PostgreSQL 17
# descartável. Cobre lote e individual (array com um id), autorização pelo mesmo
# can_edit_contact da policy de UPDATE, validação do destino, autoria, from_*,
# supressão estritamente local do evento automático e atomicidade do lote.

set -Eeuo pipefail

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migrations=(
  "$repo_root"/supabase/migrations/*_bulk_transfer_contacts_rpc_atomica.sql
  "$repo_root"/supabase/migrations/*_valida_fila_destino_bulk_transfer.sql
)
postgres_image="${BULK_TRANSFER_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-bulktransfer-test-$$"
tmp_dir="$(mktemp -d)"

cleanup() {
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  rm -rf "$tmp_dir"
}
trap cleanup EXIT INT TERM

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
for migration in "${migrations[@]}"; do
  [[ -f "$migration" ]] || fail "migration nao encontrada: $migration"
done

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}
psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}
as_user() {
  local uid="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET request.jwt.claims = '{\"role\":\"authenticated\",\"sub\":\"$uid\"}'" \
    -c 'SET ROLE authenticated' \
    -c "$sql"
}
expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  pass "$label"
}
expect_user_value() {
  local label="$1" uid="$2" expected="$3" sql="$4" actual
  actual="$(as_user "$uid" "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  pass "$label"
}
expect_user_error() {
  local label="$1" uid="$2" needle="$3" sql="$4" output status
  set +e
  output="$(as_user "$uid" "$sql" 2>&1)"; status=$?
  set -e
  (( status != 0 )) || fail "$label: deveria falhar, mas passou"
  [[ "$output" == *"$needle"* ]] || {
    printf '%s\n' "$output" >&2
    fail "$label: esperava '$needle' no erro"
  }
  pass "$label"
}

U_OP='aaaaaaaa-0000-0000-0000-000000000001'
U_OTHER='aaaaaaaa-0000-0000-0000-000000000002'
U_DEST='aaaaaaaa-0000-0000-0000-000000000003'
U_INACTIVE='aaaaaaaa-0000-0000-0000-000000000004'
U_NONOP='aaaaaaaa-0000-0000-0000-000000000005'
U_ADMIN='aaaaaaaa-0000-0000-0000-000000000006'
P_OP='bbbbbbbb-0000-0000-0000-000000000001'
P_OTHER='bbbbbbbb-0000-0000-0000-000000000002'
P_DEST='bbbbbbbb-0000-0000-0000-000000000003'
P_INACTIVE='bbbbbbbb-0000-0000-0000-000000000004'
P_NONOP='bbbbbbbb-0000-0000-0000-000000000005'
P_ADMIN='bbbbbbbb-0000-0000-0000-000000000006'
Q_OWN='cccccccc-0000-0000-0000-000000000001'
Q_DEST='cccccccc-0000-0000-0000-000000000002'
Q_FOREIGN='cccccccc-0000-0000-0000-000000000003'
C1='dddddddd-0000-0000-0000-000000000001'
C2='dddddddd-0000-0000-0000-000000000002'
C3='dddddddd-0000-0000-0000-000000000003'
C4='dddddddd-0000-0000-0000-000000000004'
C5='dddddddd-0000-0000-0000-000000000005'
C6='dddddddd-0000-0000-0000-000000000006'
C7='dddddddd-0000-0000-0000-000000000007'

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid UNIQUE NOT NULL,
  name text,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.queues (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.queue_members (
  queue_id uuid NOT NULL REFERENCES public.queues(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  name text,
  assigned_to uuid REFERENCES public.profiles(id),
  queue_id uuid REFERENCES public.queues(id)
);
CREATE TABLE public.conversation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_agent_id uuid REFERENCES public.profiles(id),
  to_agent_id uuid REFERENCES public.profiles(id),
  from_queue_id uuid REFERENCES public.queues(id),
  to_queue_id uuid REFERENCES public.queues(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  performed_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  )
$$;

CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT p.id FROM public.profiles p
  WHERE _user_id = auth.uid() AND p.user_id = _user_id
  LIMIT 1
$$;

CREATE FUNCTION public.get_visible_agent_ids(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT p.id FROM public.profiles p
  WHERE _user_id = auth.uid() AND p.user_id = _user_id
$$;

CREATE FUNCTION public.can_edit_contact(
  p_assigned_to uuid,
  p_queue_id uuid,
  p_visible_agent_ids uuid[],
  p_profile_id uuid,
  p_is_admin boolean
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(
    COALESCE(p_is_admin, public.is_admin_or_supervisor(auth.uid()))
    OR p_assigned_to = ANY (COALESCE(p_visible_agent_ids,
         (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v)))
    OR EXISTS (
         SELECT 1 FROM public.queue_members qm
         WHERE qm.queue_id = p_queue_id
           AND qm.profile_id = COALESCE(p_profile_id, public.get_profile_id_for_user(auth.uid()))
           AND qm.is_active = true
       ),
    false)
$function$;

CREATE FUNCTION public.can_edit_contact(p_assigned_to uuid, p_queue_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.can_edit_contact(
    p_assigned_to, p_queue_id, NULL::uuid[], NULL::uuid, NULL::boolean
  )
$function$;

-- Corpo ORIGINAL completo do trigger vigente. A migration deve alterá-lo só para
-- reconhecer a guarda local da RPC; o rollback deve restaurar exatamente isto.
CREATE OR REPLACE FUNCTION public.log_assignment_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = 'public'
AS $$
BEGIN
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO public.conversation_events (
      contact_id, event_type, from_agent_id, to_agent_id, performed_by, metadata
    ) VALUES (
      NEW.id,
      CASE
        WHEN OLD.assigned_to IS NULL THEN 'assign'
        WHEN NEW.assigned_to IS NULL THEN 'unassign'
        ELSE 'transfer'
      END,
      OLD.assigned_to,
      NEW.assigned_to,
      COALESCE(NEW.assigned_to, OLD.assigned_to),
      jsonb_build_object('old_queue', OLD.queue_id, 'new_queue', NEW.queue_id)
    );
  END IF;

  -- Log queue changes
  IF OLD.queue_id IS DISTINCT FROM NEW.queue_id THEN
    INSERT INTO public.conversation_events (
      contact_id, event_type, from_queue_id, to_queue_id, performed_by, metadata
    ) VALUES (
      NEW.id,
      'queue_transfer',
      OLD.queue_id,
      NEW.queue_id,
      NEW.assigned_to,
      jsonb_build_object('agent', NEW.assigned_to)
    );
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_log_assignment_change
  AFTER UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.log_assignment_change();

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_contact(uuid, uuid),
  public.can_edit_contact(uuid, uuid, uuid[], uuid, boolean),
  public.get_profile_id_for_user(uuid), public.get_visible_agent_ids(uuid),
  public.is_admin_or_supervisor(uuid) TO authenticated;
SQL

cat > "$tmp_dir/seed.sql" <<SQL
INSERT INTO auth.users(id) VALUES
  ('$U_OP'), ('$U_OTHER'), ('$U_DEST'), ('$U_INACTIVE'), ('$U_NONOP'), ('$U_ADMIN');
INSERT INTO public.profiles(id, user_id, name, is_active) VALUES
  ('$P_OP', '$U_OP', 'Operador so pela fila', true),
  ('$P_OTHER', '$U_OTHER', 'Dono anterior', true),
  ('$P_DEST', '$U_DEST', 'Destino operacional', true),
  ('$P_INACTIVE', '$U_INACTIVE', 'Destino inativo', false),
  ('$P_NONOP', '$U_NONOP', 'Destino nao operacional', true),
  ('$P_ADMIN', '$U_ADMIN', 'Administrador', true);
INSERT INTO public.user_roles(user_id, role) VALUES
  ('$U_OP', 'agent'), ('$U_OTHER', 'agent'), ('$U_DEST', 'agent'),
  ('$U_INACTIVE', 'agent'), ('$U_NONOP', 'finance'), ('$U_ADMIN', 'admin');
INSERT INTO public.queues(id, name) VALUES
  ('$Q_OWN', 'Fila visivel'), ('$Q_DEST', 'Fila destino'), ('$Q_FOREIGN', 'Fila sem acesso');
INSERT INTO public.queue_members(queue_id, profile_id, is_active) VALUES
  ('$Q_OWN', '$P_OP', true), ('$Q_DEST', '$P_OP', true);
INSERT INTO public.contacts(id, name, assigned_to, queue_id) VALUES
  ('$C1', 'lote 1', '$P_OTHER', '$Q_OWN'),
  ('$C2', 'lote 2', '$P_OTHER', '$Q_OWN'),
  ('$C3', 'individual fila', '$P_OTHER', '$Q_OWN'),
  ('$C4', 'sem acesso', '$P_OTHER', '$Q_FOREIGN'),
  ('$C5', 'atomico permitido', '$P_OTHER', '$Q_OWN'),
  ('$C6', 'atomico negado', '$P_OTHER', '$Q_FOREIGN'),
  ('$C7', 'trigger comum', '$P_OTHER', '$Q_OWN');
SQL

echo '===== PostgreSQL descartável ====='
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null
ready=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready=$((ready + 1)); (( ready >= 2 )) && break
  else
    ready=0
  fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL não ficou pronto'
psql_file "$tmp_dir/pre.sql"
psql_file "$tmp_dir/seed.sql"
original_trigger_def="$(psql_sql "SELECT pg_get_functiondef('public.log_assignment_change()'::regprocedure)")"

expect_value 'pré-condição: RPC ausente' 'f' \
  "SELECT to_regprocedure('public.bulk_transfer_contacts(uuid[],uuid,uuid,text)') IS NOT NULL"

echo '===== Migration real ====='
for migration in "${migrations[@]}"; do
  psql_file "$migration"
done
expect_value 'RPC é SECURITY DEFINER' 't' \
  "SELECT prosecdef FROM pg_proc WHERE oid='public.bulk_transfer_contacts(uuid[],uuid,uuid,text)'::regprocedure"
expect_value 'RPC fixa search_path public, pg_temp' 't' \
  "SELECT proconfig::text LIKE '%search_path=public, pg_temp%' FROM pg_proc WHERE oid='public.bulk_transfer_contacts(uuid[],uuid,uuid,text)'::regprocedure"
expect_value 'anon não executa a RPC' 'f' \
  "SELECT has_function_privilege('anon','public.bulk_transfer_contacts(uuid[],uuid,uuid,text)','EXECUTE')"
expect_value 'service_role sem usuário real não executa a RPC' 'f' \
  "SELECT has_function_privilege('service_role','public.bulk_transfer_contacts(uuid[],uuid,uuid,text)','EXECUTE')"
expect_value 'authenticated executa a RPC' 't' \
  "SELECT has_function_privilege('authenticated','public.bulk_transfer_contacts(uuid[],uuid,uuid,text)','EXECUTE')"

# Operador não é dono dos contatos: o acesso vem exclusivamente de queue_members.
expect_user_value 'operador só-pela-fila transfere lote para agente' "$U_OP" '2' \
  "SELECT public.bulk_transfer_contacts(ARRAY['$C1','$C2']::uuid[], '$P_DEST'::uuid, NULL, '  assumir lote  ')"
expect_value 'lote atualizou os dois contatos' '2' \
  "SELECT count(*) FROM public.contacts WHERE id IN ('$C1','$C2') AND assigned_to='$P_DEST'"
expect_value 'exatamente um evento por contato (trigger real silenciado)' '2' \
  "SELECT count(*) FROM public.conversation_events WHERE contact_id IN ('$C1','$C2')"
expect_value 'eventos têm tipo transfer, origem completa, destino e ator real' '2' \
  "SELECT count(*) FROM public.conversation_events WHERE contact_id IN ('$C1','$C2') AND event_type='transfer' AND from_agent_id='$P_OTHER' AND from_queue_id='$Q_OWN' AND to_agent_id='$P_DEST' AND to_queue_id IS NULL AND performed_by='$P_OP'"
expect_value 'nota é persistida sem espaços externos' '2' \
  "SELECT count(*) FROM public.conversation_events WHERE contact_id IN ('$C1','$C2') AND metadata->>'note'='assumir lote'"

# Array unitário é o mesmo contrato usado pelo fluxo individual.
expect_user_value 'mesma RPC transfere individual para fila válida' "$U_OP" '1' \
  "SELECT public.bulk_transfer_contacts(ARRAY['$C3']::uuid[], NULL, '$Q_DEST'::uuid, NULL)"
expect_value 'individual gera exatamente um transfer com from_*' '1' \
  "SELECT count(*) FROM public.conversation_events WHERE contact_id='$C3' AND event_type='transfer' AND from_agent_id='$P_OTHER' AND from_queue_id='$Q_OWN' AND to_agent_id IS NULL AND to_queue_id='$Q_DEST' AND performed_by='$P_OP' AND metadata='{}'::jsonb"

expect_user_error 'operador sem acesso ao contato é recusado claramente' "$U_OP" \
  'Contato nao encontrado ou sem permissao para transferir' \
  "SELECT public.bulk_transfer_contacts(ARRAY['$C4']::uuid[], '$P_DEST'::uuid, NULL, NULL)"
expect_value 'recusa não muda contato nem grava evento' 't' \
  "SELECT assigned_to='$P_OTHER' AND NOT EXISTS (SELECT 1 FROM public.conversation_events e WHERE e.contact_id='$C4') FROM public.contacts WHERE id='$C4'"

expect_user_error 'lote inteiro falha se um contato não é editável' "$U_OP" \
  'Contato nao encontrado ou sem permissao para transferir' \
  "SELECT public.bulk_transfer_contacts(ARRAY['$C5','$C6']::uuid[], '$P_DEST'::uuid, NULL, NULL)"
expect_value 'rollback do lote preserva os dois contatos' '2' \
  "SELECT count(*) FROM public.contacts WHERE id IN ('$C5','$C6') AND assigned_to='$P_OTHER'"
expect_value 'rollback do lote não deixa evento parcial' '0' \
  "SELECT count(*) FROM public.conversation_events WHERE contact_id IN ('$C5','$C6')"

expect_user_error 'agente de destino inativo é recusado' "$U_OP" \
  'Agente de destino invalido ou inativo' \
  "SELECT public.bulk_transfer_contacts(ARRAY['$C5']::uuid[], '$P_INACTIVE'::uuid, NULL, NULL)"
expect_user_error 'perfil sem role operacional é recusado como destino' "$U_OP" \
  'Agente de destino invalido ou inativo' \
  "SELECT public.bulk_transfer_contacts(ARRAY['$C5']::uuid[], '$P_NONOP'::uuid, NULL, NULL)"
expect_user_error 'fila de destino exige associação ativa do operador' "$U_OP" \
  'Fila de destino invalida ou sem permissao' \
  "SELECT public.bulk_transfer_contacts(ARRAY['$C5']::uuid[], NULL, '$Q_FOREIGN'::uuid, NULL)"
expect_user_error 'admin também recebe erro claro para fila inexistente' "$U_ADMIN" \
  'Fila de destino invalida ou sem permissao' \
  "SELECT public.bulk_transfer_contacts(ARRAY['$C5']::uuid[], NULL, 'cccccccc-0000-0000-0000-00000000ffff'::uuid, NULL)"

set +e
no_auth_output="$(psql_sql "SELECT public.bulk_transfer_contacts(ARRAY['$C5']::uuid[], '$P_DEST'::uuid, NULL, NULL)" 2>&1)"; no_auth_status=$?
set -e
(( no_auth_status != 0 )) || fail 'chamada sem auth.uid() deveria falhar'
[[ "$no_auth_output" == *'Sem sessao autenticada'* ]] || fail 'erro sem sessão não foi claro'
pass 'auth.uid() nulo é recusado'

# Fora da RPC a guarda local não existe: o trigger continua auditando normalmente.
psql_sql "UPDATE public.contacts SET assigned_to='$P_DEST' WHERE id='$C7'" >/dev/null
expect_value 'trigger real continua ativo fora da RPC' '1' \
  "SELECT count(*) FROM public.conversation_events WHERE contact_id='$C7' AND event_type='transfer' AND from_agent_id='$P_OTHER' AND to_agent_id='$P_DEST'"

# Executa os rollbacks declarados, em ordem inversa, e exige restauração integral.
extract_rollback() {
  python3 - "$1" "$2" <<'PY'
from pathlib import Path
import sys
lines = Path(sys.argv[1]).read_text(encoding='utf-8').splitlines()
try:
    start = next(i for i, line in enumerate(lines) if line.startswith('-- Rollback:')) + 1
    end = lines.index('-- End Rollback')
except ValueError as exc:
    raise SystemExit(f'bloco de rollback completo não encontrado: {exc}')
out = []
for line in lines[start:end]:
    if line == '--':
        out.append('')
    elif line.startswith('-- '):
        out.append(line[3:])
    else:
        raise SystemExit(f'linha não executável no rollback: {line!r}')
Path(sys.argv[2]).write_text('\n'.join(out) + '\n', encoding='utf-8')
PY
}
extract_rollback "${migrations[1]}" "$tmp_dir/rollback-2.sql"
psql_file "$tmp_dir/rollback-2.sql"
expect_value 'rollback remove trigger auxiliar de validação' 'f' \
  "SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_validate_bulk_transfer_queue_destination' AND NOT tgisinternal)"
extract_rollback "${migrations[0]}" "$tmp_dir/rollback-1.sql"
psql_file "$tmp_dir/rollback-1.sql"
expect_value 'rollback remove a RPC nova' 'f' \
  "SELECT to_regprocedure('public.bulk_transfer_contacts(uuid[],uuid,uuid,text)') IS NOT NULL"
restored_trigger_def="$(psql_sql "SELECT pg_get_functiondef('public.log_assignment_change()'::regprocedure)")"
[[ "$restored_trigger_def" == "$original_trigger_def" ]] || fail 'rollback não restaurou integralmente o corpo original de log_assignment_change'
pass 'rollback restaura integralmente o corpo original de log_assignment_change'

printf '\nOK — RPC única de transferência validada no PostgreSQL real (lote + individual).\n'
