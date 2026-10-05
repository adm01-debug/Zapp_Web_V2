#!/usr/bin/env bash
# R2-INB-009 / item 88 (refazer) — contrato comportamental da RPC atômica de
# transferência em lote `bulk_transfer_contacts`.
#
# Prova, em PostgreSQL descartável, o defeito que a recusa apontou: as duas
# escritas (evento em conversation_events + update em contacts) agora são UMA
# transação — qualquer falha desfaz TAMBÉM os eventos já inseridos:
#
#   BLOCO A (VERMELHO) — estado anterior: as tabelas/policies existem, mas a RPC
#     NÃO existe (o hook fazia duas escritas separadas no cliente).
#   BLOCO B (VERDE) — migration aplicada. A RPC é SECURITY INVOKER (o RLS das
#     duas tabelas continua valendo), search_path=public, performed_by sempre o
#     perfil do auth.uid():
#       * agente/fila: retorna o nº de contatos, preenche to_agent_id/to_queue_id,
#         nota em metadata.note (ou '{}' sem nota), performed_by = chamador;
#       * UPDATE falha (trigger anti-hijack do banco real): aborta e o evento
#         inserido antes NÃO persiste;
#       * INSERT de evento negado pelo RLS (operador que só enxerga o contato
#         pela fila — regressão conhecida registrada no cartão): aborta, nada
#         persiste;
#       * UPDATE atinge MENOS linhas que ids (simulação de drift de policy):
#         a conferência RETURNING aborta e desfaz eventos + update parcial;
#       * validações: exatamente um destino, lista não vazia, sessão presente.
#   MUTAÇÃO — remove a conferência de linhas numa CÓPIA da migration e prova que
#     o teste a pega (o aborto deixa de acontecer). O arquivo do repo não é tocado.
#
# Pré-state fiel ao banco: policies de UPDATE de contacts e INSERT de
# conversation_events copiadas das migrations vigentes, helpers SECURITY DEFINER
# (is_admin_or_supervisor, get_profile_id_for_user, get_visible_agent_ids,
# can_edit_contact) e os triggers anti-hijack trg_prevent_contact_* — fonte real
# de "update falha". trg_log_assignment_change não é modelado (geraria um evento
# extra sem nota no update, fora do contrato desta RPC).
#
# NAO entra no CI (github workflows são território do Joaquim). Roda via Docker local.

set -Eeuo pipefail

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$(cd "$repo_root" && ls supabase/migrations/*_bulk_transfer_contacts_rpc_atomica.sql | head -1)"
postgres_image="${BULK_TRANSFER_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"

main_container="zapp-v2-bulktransfer-test-$$"
mut_container="zapp-v2-bulktransfer-mut-$$"
target_container=""

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail 'migration nao encontrada'

remove_container() {
  local name="$1"
  if [[ "$name" =~ ^zapp-v2-bulktransfer-(test|mut)-[0-9]+$ ]]; then
    docker rm -f "$name" >/dev/null 2>&1 || true
  fi
}
cleanup() { remove_container "$main_container"; remove_container "$mut_container"; }
trap cleanup EXIT INT TERM

psql_sql() {
  docker exec "$target_container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}
psql_file() {
  docker exec -i "$target_container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}

# Roda $2 como usuário autenticado $1 (auth.users.id): claims do JWT + SET ROLE.
as_user() {
  docker exec "$target_container" psql -X -qAt -U postgres -d postgres \
    -c "SET request.jwt.claims = '{\"role\":\"authenticated\",\"sub\":\"$1\"}'" \
    -c "SET ROLE authenticated" \
    -c "$2"
}

expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}
expect_user_value() {
  local label="$1" uid="$2" expected="$3" sql="$4" actual
  actual="$(as_user "$uid" "$sql" | tail -n1)"
  [[ "$actual" == "$expected" ]] || fail "$label: esperado '$expected', obtido '$actual'"
  printf '[PASS] %s\n' "$label"
}
expect_user_error() {
  local label="$1" uid="$2" needle="$3" sql="$4" output status
  set +e
  output="$(docker exec "$target_container" psql -X -qAt -U postgres -d postgres \
    -c "SET request.jwt.claims = '{\"role\":\"authenticated\",\"sub\":\"$uid\"}'" \
    -c "SET ROLE authenticated" \
    -c '\set VERBOSITY verbose' \
    -c "$sql" 2>&1)"; status=$?
  set -e
  (( status == 0 )) && { printf '%s\n' "$output" >&2; fail "$label: deveria falhar, mas passou"; }
  [[ "$output" == *"$needle"* ]] || { printf '%s\n' "$output" >&2; fail "$label: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$label"
}

# ---------------------------------------------------------------------------
# ids fixos (legibilidade das asserções)
# ---------------------------------------------------------------------------
U_ADM='aaaaaaaa-0000-0000-0000-000000000001'
U_OP='aaaaaaaa-0000-0000-0000-000000000002'
U_OPQ='aaaaaaaa-0000-0000-0000-000000000003'
U_DST='aaaaaaaa-0000-0000-0000-000000000004'
U_OTH='aaaaaaaa-0000-0000-0000-000000000005'
P_ADM='bbbbbbbb-0000-0000-0000-000000000001'
P_OP='bbbbbbbb-0000-0000-0000-000000000002'
P_OPQ='bbbbbbbb-0000-0000-0000-000000000003'
P_DST='bbbbbbbb-0000-0000-0000-000000000004'
P_OTH='bbbbbbbb-0000-0000-0000-000000000005'
Q1='cccccccc-0000-0000-0000-000000000001'
Q2='cccccccc-0000-0000-0000-000000000002'
C1='dddddddd-0000-0000-0000-000000000001'
C2='dddddddd-0000-0000-0000-000000000002'
C3='dddddddd-0000-0000-0000-000000000003'
C4='dddddddd-0000-0000-0000-000000000004'
C5='dddddddd-0000-0000-0000-000000000005'
C6='dddddddd-0000-0000-0000-000000000006'
C7='dddddddd-0000-0000-0000-000000000007'
C8='dddddddd-0000-0000-0000-000000000008'
C9='dddddddd-0000-0000-0000-000000000009'
C_GHOST='dddddddd-0000-0000-0000-00000000ffff'

# ---------------------------------------------------------------------------
# Pré-state fiel ao banco (tabelas, helpers, policies e triggers vigentes).
# ---------------------------------------------------------------------------
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
-- auth.uid() fiel ao Supabase: lê o 'sub' das claims do request.
CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;
-- Fiel ao Supabase: os roles de aplicação têm USAGE no schema auth e EXECUTE em
-- auth.uid() (é o que permite as policies e as funções RLS usarem auth.uid()).
GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon, service_role;

CREATE TABLE public.user_roles (user_id uuid, role text);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  name text,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.agent_visibility_grants (agent_id uuid, can_see_agent_id uuid);
CREATE TABLE public.queues (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
CREATE TABLE public.queue_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid,
  profile_id uuid,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  assigned_to uuid REFERENCES public.profiles(id),
  queue_id uuid REFERENCES public.queues(id),
  deleted_at timestamptz
);
CREATE TABLE public.conversation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_agent_id uuid REFERENCES public.profiles(id),
  to_agent_id uuid REFERENCES public.profiles(id),
  from_queue_id uuid REFERENCES public.queues(id),
  to_queue_id uuid REFERENCES public.queues(id),
  metadata jsonb DEFAULT '{}',
  performed_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Helpers: cópias literais das definições vigentes no banco.
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
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
  SELECT profile.id
  FROM public.profiles AS profile
  WHERE _user_id = auth.uid()
    AND profile.user_id = _user_id
  LIMIT 1;
$$;

CREATE FUNCTION public.get_visible_agent_ids(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT profile.id
  FROM public.profiles AS profile
  WHERE _user_id = auth.uid()
    AND profile.user_id = _user_id
  UNION
  SELECT visibility.can_see_agent_id
  FROM public.agent_visibility_grants AS visibility
  JOIN public.profiles AS viewer ON viewer.id = visibility.agent_id
  WHERE _user_id = auth.uid()
    AND viewer.user_id = _user_id
    AND EXISTS (
      SELECT 1
      FROM public.user_roles AS role_assignment
      WHERE role_assignment.user_id = _user_id
        AND role_assignment.role = 'special_agent'
    );
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
    OR p_assigned_to = ANY (COALESCE(p_visible_agent_ids, (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v)))
    OR EXISTS (
         SELECT 1
         FROM public.queue_members qm
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
  SELECT public.can_edit_contact(p_assigned_to, p_queue_id, NULL::uuid[], NULL::uuid, NULL::boolean)
$function$;

-- Policies vigentes (20260929810000 + 20260412170036).
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can update their assigned contacts" ON public.contacts
  FOR UPDATE TO authenticated
  USING (public.can_edit_contact(assigned_to, queue_id,
           (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v),
           (SELECT public.get_profile_id_for_user(auth.uid())),
           (SELECT public.is_admin_or_supervisor(auth.uid()))));

CREATE POLICY "contacts_select_policy" ON public.contacts
  FOR SELECT TO authenticated
  USING (public.can_edit_contact(assigned_to, queue_id,
           (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v),
           (SELECT public.get_profile_id_for_user(auth.uid())),
           (SELECT public.is_admin_or_supervisor(auth.uid()))));

CREATE POLICY "Authorized users can insert events"
ON public.conversation_events
FOR INSERT
TO authenticated
WITH CHECK (
  (performed_by IS NULL OR performed_by = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1))
  AND (
    is_admin_or_supervisor(auth.uid())
    OR contact_id IN (
      SELECT c.id FROM contacts c
      WHERE c.assigned_to = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1)
    )
  )
);

-- Triggers anti-hijack vigentes (20260929790000): a fonte REAL de "update falha"
-- quando um não-admin tenta reatribuir contato sem fila a outro agente ou mover
-- para uma fila da qual não é membro.
CREATE FUNCTION public.prevent_contact_assignee_hijack()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated'
     AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to
     AND NEW.assigned_to IS NOT NULL
     AND NOT is_admin_or_supervisor(auth.uid())
  THEN
    IF NEW.queue_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM profiles p
        JOIN user_roles ur ON ur.user_id = p.user_id
        WHERE p.id = NEW.assigned_to
          AND p.is_active = true
          AND ur.role IN ('agent', 'supervisor', 'admin')
      ) THEN
        RAISE EXCEPTION 'Sem permissao para atribuir contato a este agente';
      END IF;
    ELSIF NEW.assigned_to <> get_profile_id_for_user(auth.uid()) THEN
      RAISE EXCEPTION 'Sem permissao para atribuir contato a este agente';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.prevent_contact_queue_hijack()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated'
     AND OLD.queue_id IS DISTINCT FROM NEW.queue_id
     AND NEW.queue_id IS NOT NULL
     AND NOT is_admin_or_supervisor(auth.uid())
     AND NOT EXISTS (
       SELECT 1
       FROM queue_members qm
       WHERE qm.queue_id = NEW.queue_id
         AND qm.profile_id = get_profile_id_for_user(auth.uid())
         AND qm.is_active = true
     )
  THEN
    RAISE EXCEPTION 'Sem permissao para mover contato para esta fila';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_prevent_contact_assignee_hijack
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_contact_assignee_hijack();
CREATE TRIGGER trg_prevent_contact_queue_hijack
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_contact_queue_hijack();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles, public.profiles,
  public.agent_visibility_grants, public.queues, public.queue_members,
  public.contacts, public.conversation_events TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor(uuid),
  public.get_profile_id_for_user(uuid), public.get_visible_agent_ids(uuid),
  public.can_edit_contact(uuid, uuid),
  public.can_edit_contact(uuid, uuid, uuid[], uuid, boolean) TO authenticated;
SQL

cat > "$tmp_dir/seed.sql" <<SQL
INSERT INTO auth.users (id) VALUES
  ('$U_ADM'), ('$U_OP'), ('$U_OPQ'), ('$U_DST'), ('$U_OTH');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('$U_ADM', 'admin'), ('$U_OP', 'agent'), ('$U_OPQ', 'agent'),
  ('$U_DST', 'agent'), ('$U_OTH', 'agent');
INSERT INTO public.profiles (id, user_id, name) VALUES
  ('$P_ADM', '$U_ADM', 'Admin'),
  ('$P_OP',  '$U_OP',  'Operador'),
  ('$P_OPQ', '$U_OPQ', 'Op. so-fila'),
  ('$P_DST', '$U_DST', 'Destino'),
  ('$P_OTH', '$U_OTH', 'Outro');
INSERT INTO public.queues (id, name) VALUES ('$Q1', 'Fila 1'), ('$Q2', 'Fila 2');
INSERT INTO public.queue_members (queue_id, profile_id, is_active) VALUES
  ('$Q1', '$P_OP',  true),
  ('$Q2', '$P_OP',  true),
  ('$Q1', '$P_OPQ', true);
INSERT INTO public.contacts (id, name, assigned_to, queue_id) VALUES
  ('$C1', 'c1', '$P_OP',  '$Q1'),
  ('$C2', 'c2', '$P_OP',  '$Q1'),
  ('$C3', 'c3 sem fila', '$P_OP', NULL),
  ('$C4', 'c4 so-fila', NULL,     '$Q1'),
  ('$C5', 'c5', '$P_OP',  '$Q1'),
  ('$C6', 'c6', '$P_OP',  '$Q1'),
  ('$C7', 'c7 de outro', '$P_OTH', NULL),
  ('$C8', 'c8', '$P_OP',  '$Q1'),
  ('$C9', 'c9 de outro', '$P_OTH', '$Q1');
SQL

boot_container() {
  local name="$1"
  target_container="$name"
  docker run --rm -d --name "$name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null
  local ready=0
  for _ in $(seq 1 90); do
    if psql_sql 'SELECT 1' >/dev/null 2>&1; then
      ready=$((ready + 1)); (( ready >= 2 )) && break
    else ready=0; fi
    sleep 1
  done
  (( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'
  psql_file "$tmp_dir/pre.sql"
  psql_file "$tmp_dir/seed.sql"
}

echo "===== BLOCO A (VERMELHO): tabelas/policies existem, RPC ausente ====="
boot_container "$main_container"
expect_value "tabela contacts existe" "t" \
  "SELECT to_regclass('public.contacts') IS NOT NULL"
expect_value "tabela conversation_events existe" "t" \
  "SELECT to_regclass('public.conversation_events') IS NOT NULL"
expect_value "RPC bulk_transfer_contacts AUSENTE (defeito)" "f" \
  "SELECT to_regprocedure('public.bulk_transfer_contacts(uuid[],uuid,uuid,text)') IS NOT NULL"

echo "===== BLOCO B (VERDE): migration aplicada ====="
psql_file "$migration"

expect_value "RPC bulk_transfer_contacts agora EXISTE" "t" \
  "SELECT to_regprocedure('public.bulk_transfer_contacts(uuid[],uuid,uuid,text)') IS NOT NULL"
expect_value "é SECURITY INVOKER (mantém o RLS)" "f" \
  "SELECT prosecdef FROM pg_proc WHERE oid = 'public.bulk_transfer_contacts(uuid[],uuid,uuid,text)'::regprocedure"
expect_value "search_path fixo em public" "t" \
  "SELECT proconfig::text LIKE '%search_path=public%' FROM pg_proc WHERE oid = 'public.bulk_transfer_contacts(uuid[],uuid,uuid,text)'::regprocedure"
expect_value "anon NÃO executa" "f" \
  "SELECT has_function_privilege('anon', 'public.bulk_transfer_contacts(uuid[],uuid,uuid,text)', 'EXECUTE')"
expect_value "authenticated executa" "t" \
  "SELECT has_function_privilege('authenticated', 'public.bulk_transfer_contacts(uuid[],uuid,uuid,text)', 'EXECUTE')"
expect_value "service_role executa" "t" \
  "SELECT has_function_privilege('service_role', 'public.bulk_transfer_contacts(uuid[],uuid,uuid,text)', 'EXECUTE')"

echo "-- Caminho feliz: agente --"
expect_user_value "p_op transfere [c1,c2] para o agente p_dst (retorna 2)" "$U_OP" "2" \
  "SELECT public.bulk_transfer_contacts(ARRAY['$C1','$C2']::uuid[], '$P_DST'::uuid, NULL, 'vai com carinho')"
expect_value "c1 e c2 agora são de p_dst" "2" \
  "SELECT count(*) FROM public.contacts WHERE id IN ('$C1','$C2') AND assigned_to = '$P_DST'"
expect_value "2 eventos transfer para p_dst com performed_by = p_op" "2" \
  "SELECT count(*) FROM public.conversation_events WHERE contact_id IN ('$C1','$C2') AND event_type='transfer' AND to_agent_id = '$P_DST' AND performed_by = '$P_OP'"
expect_value "nota gravada em metadata.note nos 2 eventos" "2" \
  "SELECT count(*) FROM public.conversation_events WHERE contact_id IN ('$C1','$C2') AND metadata->>'note' = 'vai com carinho'"

echo "-- Caminho feliz: fila --"
expect_user_value "p_op transfere [c5,c6] para a fila q2 (retorna 2)" "$U_OP" "2" \
  "SELECT public.bulk_transfer_contacts(ARRAY['$C5','$C6']::uuid[], NULL, '$Q2'::uuid)"
expect_value "c5 e c6 agora estão na fila q2" "2" \
  "SELECT count(*) FROM public.contacts WHERE id IN ('$C5','$C6') AND queue_id = '$Q2'"
expect_value "2 eventos transfer com to_queue_id = q2" "2" \
  "SELECT count(*) FROM public.conversation_events WHERE contact_id IN ('$C5','$C6') AND event_type='transfer' AND to_queue_id = '$Q2' AND to_agent_id IS NULL"
expect_value "sem nota: metadata ficou '{}'" "2" \
  "SELECT count(*) FROM public.conversation_events WHERE contact_id IN ('$C5','$C6') AND metadata = '{}'::jsonb"

echo "-- ROLLBACK: update falha (trigger anti-hijack real) --"
# c3 não tem fila: o trigger do banco só deixa não-admin reatribuir para si mesmo.
expect_user_error "não-admin não transfere contato sem fila a outro agente" "$U_OP" \
  "Sem permissao para atribuir contato a este agente" \
  "SELECT public.bulk_transfer_contacts(ARRAY['$C3']::uuid[], '$P_DST'::uuid)"
expect_value "rollback: NENHUM evento ficou gravado para c3" "0" \
  "SELECT count(*) FROM public.conversation_events WHERE contact_id = '$C3'"
expect_value "rollback: c3 continua com p_op" "$P_OP" \
  "SELECT assigned_to FROM public.contacts WHERE id = '$C3'"

echo "-- ROLLBACK: insert do evento negado pelo RLS (regressão so-fila documentada) --"
# c4 é visível para p_opq só pela fila: o UPDATE passaria, mas a policy de INSERT
# de conversation_events exige contato atribuído ao próprio perfil — aborta tudo.
expect_user_error "operador so-fila não grava evento em contato alheio" "$U_OPQ" \
  "row-level security" \
  "SELECT public.bulk_transfer_contacts(ARRAY['$C4']::uuid[], '$P_DST'::uuid)"
expect_value "rollback: NENHUM evento para c4" "0" \
  "SELECT count(*) FROM public.conversation_events WHERE contact_id = '$C4'"
expect_value "rollback: c4 continua sem dono e na fila q1" "t" \
  "SELECT assigned_to IS NULL AND queue_id = '$Q1' FROM public.contacts WHERE id = '$C4'"

echo "-- ROLLBACK: update atinge MENOS linhas que ids (drift de policy simulado) --"
# Simula uma policy de INSERT mais permissiva (drift): eventos passam para os
# dois contatos, mas o UPDATE só alcança c8 — a conferência RETURNING aborta.
psql_sql "DROP POLICY \"Authorized users can insert events\" ON public.conversation_events"
psql_sql "CREATE POLICY \"Authorized users can insert events\" ON public.conversation_events
  FOR INSERT TO authenticated
  WITH CHECK (performed_by IS NULL OR performed_by = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1))"
expect_user_error "update parcial aborta a transação inteira" "$U_OP" \
  "Transferencia em lote abortada: 1 de 2 contatos atualizados" \
  "SELECT public.bulk_transfer_contacts(ARRAY['$C8','$C7']::uuid[], '$P_DST'::uuid)"
expect_value "rollback: NENHUM evento persistiu (c8 e c7)" "0" \
  "SELECT count(*) FROM public.conversation_events WHERE contact_id IN ('$C8','$C7')"
expect_value "rollback: c8 NÃO mudou de dono (update parcial desfeito)" "$P_OP" \
  "SELECT assigned_to FROM public.contacts WHERE id = '$C8'"
expect_value "c7 continua com p_oth" "$P_OTH" \
  "SELECT assigned_to FROM public.contacts WHERE id = '$C7'"
# restaura a policy fiel para os demais cenários
psql_sql "DROP POLICY \"Authorized users can insert events\" ON public.conversation_events"
psql_sql "CREATE POLICY \"Authorized users can insert events\" ON public.conversation_events
  FOR INSERT TO authenticated
  WITH CHECK (
    (performed_by IS NULL OR performed_by = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1))
    AND (is_admin_or_supervisor(auth.uid())
      OR contact_id IN (SELECT c.id FROM contacts c
        WHERE c.assigned_to = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1))))"

echo "-- ROLLBACK: id inexistente quebra FK do evento e desfaz tudo --"
expect_user_error "admin com id inexistente na lista falha" "$U_ADM" \
  "foreign key" \
  "SELECT public.bulk_transfer_contacts(ARRAY['$C9','$C_GHOST']::uuid[], '$P_DST'::uuid)"
expect_value "rollback: NENHUM evento para c9" "0" \
  "SELECT count(*) FROM public.conversation_events WHERE contact_id = '$C9'"
expect_value "rollback: c9 continua com p_oth" "$P_OTH" \
  "SELECT assigned_to FROM public.contacts WHERE id = '$C9'"

echo "-- Validações de entrada --"
expect_user_error "dois destinos ao mesmo tempo rejeita" "$U_OP" "exatamente um destino" \
  "SELECT public.bulk_transfer_contacts(ARRAY['$C1']::uuid[], '$P_DST'::uuid, '$Q1'::uuid)"
expect_user_error "nenhum destino rejeita" "$U_OP" "exatamente um destino" \
  "SELECT public.bulk_transfer_contacts(ARRAY['$C1']::uuid[], NULL, NULL)"
expect_user_error "lista vazia rejeita" "$U_OP" "Lista de contatos vazia" \
  "SELECT public.bulk_transfer_contacts(ARRAY[]::uuid[], '$P_DST'::uuid)"
set +e
out="$(psql_sql "SELECT public.bulk_transfer_contacts(ARRAY['$C1']::uuid[], '$P_DST'::uuid)" 2>&1)"; st=$?
set -e
(( st == 0 )) && fail "chamada sem auth.uid() deveria falhar (postgres tem uid nulo)"
printf '[PASS] chamada sem auth.uid() falha (%s)\n' "$(printf '%s' "$out" | head -1 | cut -c1-80)"

echo "===== MUTAÇÃO: remover a conferência de linhas (o teste deve pegá-la) ====="
sed 's/IF v_updated <> array_length(v_ids, 1) THEN/IF false THEN/' "$migration" > "$tmp_dir/mut.sql"
grep -q "IF false THEN" "$tmp_dir/mut.sql" || fail 'mutacao nao aplicada na copia'
grep -q "IF v_updated <> array_length(v_ids, 1) THEN" "$migration" || fail 'original foi tocado'
orig_sha="$(sha256sum "$migration" | cut -d' ' -f1)"
boot_container "$mut_container"
psql_file "$tmp_dir/mut.sql"
# mesmo drift de policy do cenário anterior: sem a conferência, o update parcial
# passa em silêncio e evento+update parcial persistem — o defeito da rodada 1.
psql_sql "DROP POLICY \"Authorized users can insert events\" ON public.conversation_events"
psql_sql "CREATE POLICY \"Authorized users can insert events\" ON public.conversation_events
  FOR INSERT TO authenticated
  WITH CHECK (performed_by IS NULL OR performed_by = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1))"
mut_row="$(as_user "$U_OP" "SELECT public.bulk_transfer_contacts(ARRAY['$C8','$C7']::uuid[], '$P_DST'::uuid)" | tail -n1)"
[[ "$mut_row" == "1" ]] || fail "mutação deveria retornar 1 sem abortar, obtido '$mut_row'"
expect_value "mutação: update parcial persistiu (defeito pego pelo teste)" "$P_DST" \
  "SELECT assigned_to FROM public.contacts WHERE id = '$C8'"
expect_value "mutação: 2 eventos persistiram para 1 contato transferido" "2" \
  "SELECT count(*) FROM public.conversation_events WHERE contact_id IN ('$C8','$C7')"
now_sha="$(sha256sum "$migration" | cut -d' ' -f1)"
[[ "$orig_sha" == "$now_sha" ]] || fail 'sha256 da migration mudou durante o teste'
printf '[PASS] sha256 da migration do repo preservado (%s)\n' "${now_sha:0:16}"

echo ""
echo "OK — contrato atômico de bulk_transfer_contacts verificado (red → green + mutação)."
