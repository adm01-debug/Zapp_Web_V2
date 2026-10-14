#!/usr/bin/env bash
# Contrato de autorizacao das RPCs de contato — lacunas L1 e L2 da matriz IA-004.
#
# O teste roda o MESMO roteiro duas vezes no mesmo container:
#   BLOCO A — estado ANTERIOR a migration: prova o defeito (agente sem carteira
#             transiciona o status de contato alheio; qualquer authenticated
#             renomeia/remove etiqueta de TODOS os contatos).
#   BLOCO B — migration aplicada: prova a correcao, sem quebrar os casos legitimos
#             (contato proprio, contato da fila, admin, service_role/cron).
#   BLOCO C — RPCs atomicas de tag (20261011155015_contact_tags_atomic): prova a
#             ATOMICIDADE sob concorrencia (duas conexoes de verdade), a idempotencia,
#             a normalizacao, a autorizacao e a auditoria. Inclui um CONTRA-EXEMPLO
#             que reproduz o lost update da leitura-depois-escrita que as RPCs evitam.
# Vermelho antes e verde depois saem do mesmo run, no banco de verdade, nao de mock.
#
# O estado anterior e fiel ao banco de 30/09: corpos de set_conversation_status
# (20260927330000) e das 4 RPCs de etiqueta (20260927530000, com o bloqueio de anon
# e o SET search_path), predicates com os contratos reais e grants de producao.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20260930090000_harden_status_and_wa_tag_rpc_authorization.sql"
tags_migration="$repo_root/supabase/migrations/20261011155015_contact_tags_atomic.sql"
postgres_image="${WA_TAG_AUTHZ_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-wa-tag-authz-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-wa-tag-authz-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}

psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}

# Erro esperado: exige exit != 0 E o texto/SQLSTATE esperado na mensagem.
expect_error() {
  local label="$1" needle="$2" sql="$3" output status
  set +e
  output="$(docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c '\set VERBOSITY verbose' -c "$sql" 2>&1)"
  status=$?
  set -e
  if (( status == 0 )); then
    printf '%s\n' "$output" >&2
    fail "$label: deveria falhar, mas passou"
  fi
  if [[ "$output" != *"$needle"* ]]; then
    printf '%s\n' "$output" >&2
    fail "$label: esperava '$needle' no erro"
  fi
  printf '[PASS] %s\n' "$label"
}

expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql")"
  if [[ "$actual" != "$expected" ]]; then
    fail "$label: esperado '$expected', obtido '$actual'"
  fi
  printf '[PASS] %s\n' "$label"
}

expect_ok() {
  local label="$1" sql="$2"
  psql_sql "$sql" >/dev/null || fail "$label: deveria ter sucesso"
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready_checks=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then
    ready_checks=$((ready_checks + 1))
    if (( ready_checks >= 2 )); then break; fi
  else
    ready_checks=0
  fi
  sleep 1
done
(( ready_checks >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

# ── Estado ANTERIOR as migrations (fiel ao banco de 30/09) ─────────────────────────────
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
-- Contratos reais: sem claims, auth.role() e NULL (por isso o coalesce com session_user
-- no guard privilegiado); auth.uid() le o claim sub.
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
       nullif(current_setting('request.jwt.claim.sub', true), '')
     ), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT coalesce(
       nullif(current_setting('request.jwt.claim.role', true), ''),
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
     )::text $$;

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
CREATE TABLE public.queues (id uuid PRIMARY KEY);
CREATE TABLE public.queue_members (
  queue_id uuid NOT NULL REFERENCES public.queues(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  is_active boolean NOT NULL,
  PRIMARY KEY (queue_id, profile_id)
);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  phone text NOT NULL,
  tags text[],
  assigned_to uuid REFERENCES public.profiles(id),
  queue_id uuid REFERENCES public.queues(id),
  conversation_status text DEFAULT 'open',
  conversation_status_changed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.conversation_closures (
  contact_id uuid PRIMARY KEY REFERENCES public.contacts(id),
  close_reason text
);
GRANT SELECT ON public.contacts TO authenticated;

-- Predicates: mesmo contrato dos reais (hoisted, caller-bound).
CREATE FUNCTION public.get_profile_id_for_user(_user_id uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT id FROM public.profiles WHERE user_id = _user_id LIMIT 1 $$;
CREATE FUNCTION public.get_visible_agent_ids(_user_id uuid) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT id FROM public.profiles WHERE user_id = _user_id $$;
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles ur
                       WHERE ur.user_id = _user_id AND ur.role IN ('admin','supervisor')) $$;
CREATE FUNCTION public.can_edit_contact(p_assigned_to uuid, p_queue_id uuid,
                                        p_visible_agent_ids uuid[], p_profile_id uuid,
                                        p_is_admin boolean) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
  AS $$ SELECT p_is_admin
            OR (p_profile_id IS NOT NULL AND p_assigned_to = p_profile_id)
            OR (p_profile_id IS NOT NULL AND p_assigned_to = ANY (coalesce(p_visible_agent_ids, '{}'::uuid[])))
            OR (p_profile_id IS NOT NULL AND p_queue_id IS NOT NULL AND EXISTS (
                 SELECT 1 FROM public.queue_members qm
                 WHERE qm.queue_id = p_queue_id AND qm.profile_id = p_profile_id AND qm.is_active)) $$;

-- Corpos ANTERIORES (20260927330000 e 20260927530000), byte a byte.
CREATE FUNCTION public.set_conversation_status(p_contact_id uuid, p_next text, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_current TEXT; v_allowed BOOLEAN := FALSE;
BEGIN
  SELECT conversation_status INTO v_current FROM public.contacts WHERE id = p_contact_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'contact not found: %', p_contact_id; END IF;
  IF v_current = p_next THEN RETURN; END IF;
  IF v_current = 'open'     AND p_next IN ('waiting','resolved','archived') THEN v_allowed := TRUE; END IF;
  IF v_current = 'waiting'  AND p_next IN ('open','resolved')                THEN v_allowed := TRUE; END IF;
  IF v_current = 'resolved' AND p_next IN ('open','archived')                THEN v_allowed := TRUE; END IF;
  IF v_current = 'archived' AND p_next = 'open'                              THEN v_allowed := TRUE; END IF;
  IF NOT v_allowed THEN RAISE EXCEPTION 'invalid transition % -> %', v_current, p_next; END IF;
  UPDATE public.contacts SET conversation_status = p_next, conversation_status_changed_at = NOW()
   WHERE id = p_contact_id;
  IF p_next = 'resolved' THEN
    INSERT INTO public.conversation_closures (contact_id, close_reason)
    VALUES (p_contact_id, COALESCE(p_reason,'resolved')) ON CONFLICT DO NOTHING;
  END IF;
END; $$;

CREATE FUNCTION public.add_wa_tag_if_not_exists(p_contact_id uuid, p_prefix text, p_tag text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$ BEGIN
  IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF;
  UPDATE public.contacts
  SET tags = ARRAY(SELECT t FROM unnest(tags) t WHERE t NOT LIKE p_prefix || '%') || ARRAY[p_tag],
      updated_at = now()
  WHERE id = p_contact_id AND NOT (COALESCE(tags,'{}') @> ARRAY[p_tag]);
END; $$;

CREATE FUNCTION public.remove_wa_tag_by_prefix(p_contact_id uuid, p_prefix text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$ BEGIN
  IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF;
  UPDATE public.contacts
  SET tags = ARRAY(SELECT t FROM unnest(tags) t WHERE t NOT LIKE p_prefix || '%'), updated_at = now()
  WHERE id = p_contact_id AND EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE p_prefix || '%');
END; $$;

CREATE FUNCTION public.remove_wa_label_from_all_contacts(p_label_prefix text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$ BEGIN
  IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF;
  UPDATE public.contacts
  SET tags = ARRAY(SELECT t FROM unnest(tags) t WHERE t NOT LIKE p_label_prefix || '%'), updated_at = now()
  WHERE EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE p_label_prefix || '%');
END; $$;

CREATE FUNCTION public.rename_wa_label_on_all_contacts(p_label_prefix text, p_new_tag text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$ BEGIN
  IF auth.role() = 'anon' THEN RAISE EXCEPTION 'permission denied'; END IF;
  UPDATE public.contacts
  SET tags = ARRAY(SELECT CASE WHEN t LIKE p_label_prefix || '%' THEN p_new_tag ELSE t END FROM unnest(tags) t),
      updated_at = now()
  WHERE EXISTS (SELECT 1 FROM unnest(tags) t WHERE t LIKE p_label_prefix || '%');
END; $$;

REVOKE EXECUTE ON FUNCTION public.set_conversation_status(uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_conversation_status(uuid, text, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.add_wa_tag_if_not_exists(uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.add_wa_tag_if_not_exists(uuid, text, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.remove_wa_tag_by_prefix(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.remove_wa_tag_by_prefix(uuid, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.remove_wa_label_from_all_contacts(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.remove_wa_label_from_all_contacts(text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rename_wa_label_on_all_contacts(text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rename_wa_label_on_all_contacts(text, text) TO authenticated, service_role;
SQL

cat > "$tmp_dir/seed.sql" <<'SQL'
DELETE FROM public.conversation_closures;
DELETE FROM public.queue_members;
DELETE FROM public.user_roles;
DELETE FROM public.contacts;
DELETE FROM public.queues;
DELETE FROM public.profiles;

INSERT INTO public.profiles (id, user_id, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', true),  -- ADMIN
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', true),  -- agent A (sem fila/carteira)
  ('c0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', true);  -- agent B (dono do contato alheio)
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin');
INSERT INTO public.queues (id) VALUES ('e0000000-0000-0000-0000-000000000001');
INSERT INTO public.queue_members (queue_id, profile_id, is_active)
  VALUES ('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', true); -- agent A na fila Q

INSERT INTO public.contacts (id, phone, tags, assigned_to, queue_id, conversation_status) VALUES
  ('d0000000-0000-0000-0000-000000000001', '5511900000001', ARRAY['x_etiqueta','outra'], 'c0000000-0000-0000-0000-000000000001', NULL, 'open'),  -- ALHEIO (de B)
  ('d0000000-0000-0000-0000-000000000002', '5511900000002', ARRAY['x_etiqueta'],        'b0000000-0000-0000-0000-000000000001', NULL, 'open'),  -- PROPRIO (de A)
  ('d0000000-0000-0000-0000-000000000003', '5511900000003', ARRAY['x_etiqueta'],        NULL, 'e0000000-0000-0000-0000-000000000001', 'open'); -- FILA de A
SQL

psql_file "$tmp_dir/pre.sql"
psql_file "$tmp_dir/seed.sql"

AGENT_A_CLAIMS="{\"sub\":\"22222222-2222-2222-2222-222222222222\",\"role\":\"authenticated\"}"
ADMIN_CLAIMS="{\"sub\":\"11111111-1111-1111-1111-111111111111\",\"role\":\"authenticated\"}"
ALHEIO='d0000000-0000-0000-0000-000000000001'
PROPRIO='d0000000-0000-0000-0000-000000000002'
FILA='d0000000-0000-0000-0000-000000000003'

agent_a() { printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '%s', false); %s" "$AGENT_A_CLAIMS" "$1"; }
admin()   { printf "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '%s', false); %s" "$ADMIN_CLAIMS" "$1"; }

echo '── BLOCO A: comportamento ANTES da migration (o defeito) ─────────────────────────'

expect_ok 'A1 (L1) agent sem carteira transiciona status de contato ALHEIO' \
  "$(agent_a "SELECT public.set_conversation_status('$ALHEIO','resolved');")"
expect_value 'A1 confirma o efeito indevido (alheio ficou resolved)' 'resolved' \
  "SELECT conversation_status FROM public.contacts WHERE id='$ALHEIO'"
expect_value 'A1 registrou fechamento indevido' '1' \
  "SELECT count(*) FROM public.conversation_closures WHERE contact_id='$ALHEIO'"

expect_ok 'A2 (L2) agent renomeia etiqueta em TODOS os contatos' \
  "$(agent_a "SELECT public.rename_wa_label_on_all_contacts('x_etiqueta','y_etiqueta');")"
expect_value 'A2 atingiu contatos de terceiros' '3' \
  "SELECT count(*) FROM public.contacts WHERE tags @> ARRAY['y_etiqueta']"

expect_ok 'A3 agent adiciona etiqueta em contato ALHEIO' \
  "$(agent_a "SELECT public.add_wa_tag_if_not_exists('$ALHEIO','x_','x_invasao');")"
expect_value 'A3 etiqueta invasora gravada' '1' \
  "SELECT count(*) FROM public.contacts WHERE tags @> ARRAY['x_invasao']"

expect_ok 'A4 agent remove etiqueta de TODOS os contatos' \
  "$(agent_a "SELECT public.remove_wa_label_from_all_contacts('y_');")"
expect_value 'A4 apagou de todos' '0' \
  "SELECT count(*) FROM public.contacts WHERE tags @> ARRAY['y_etiqueta']"

echo
echo '── Aplicando a migration ─────────────────────────────────────────────────────────'
psql_file "$migration"
psql_file "$tmp_dir/seed.sql"

echo
echo '── BLOCO B: comportamento DEPOIS da migration ────────────────────────────────────'

expect_error 'B1 (N12) agent sem carteira -> contato ALHEIO e recusado com 42501' \
  'contact_not_authorized' "$(agent_a "SELECT public.set_conversation_status('$ALHEIO','resolved');")"
expect_value 'B1 status do contato alheio INALTERADO' 'open' \
  "SELECT conversation_status FROM public.contacts WHERE id='$ALHEIO'"
expect_value 'B1 nenhum fechamento gravado' '0' \
  "SELECT count(*) FROM public.conversation_closures WHERE contact_id='$ALHEIO'"

expect_ok 'B2 agent transiciona o PROPRIO contato (caso legitimo preservado)' \
  "$(agent_a "SELECT public.set_conversation_status('$PROPRIO','waiting');")"
expect_value 'B2 status do proprio mudou' 'waiting' \
  "SELECT conversation_status FROM public.contacts WHERE id='$PROPRIO'"

expect_ok 'B3 agent transiciona contato da SUA fila (caso legitimo preservado)' \
  "$(agent_a "SELECT public.set_conversation_status('$FILA','resolved');")"
expect_value 'B3 fechamento do contato da fila registrado' '1' \
  "SELECT count(*) FROM public.conversation_closures WHERE contact_id='$FILA'"

expect_ok 'B4 ADMIN transiciona contato alheio (bypass usado pelo fixture E2E)' \
  "$(admin "SELECT public.set_conversation_status('$ALHEIO','resolved');")"
expect_value 'B4 admin conseguiu' 'resolved' \
  "SELECT conversation_status FROM public.contacts WHERE id='$ALHEIO'"
expect_ok 'B4b admin reexecuta open->open (no-op idempotente do fixture)' \
  "$(admin "SELECT public.set_conversation_status('$ALHEIO','resolved');")"

expect_error 'B5 (N13) agent -> rename em MASSA recusado (admin_required)' \
  'admin_required' "$(agent_a "SELECT public.rename_wa_label_on_all_contacts('x_etiqueta','z_etiqueta');")"
expect_value 'B5 nenhuma etiqueta foi alterada (sem efeito parcial)' '0' \
  "SELECT count(*) FROM public.contacts WHERE tags @> ARRAY['z_etiqueta']"
expect_error 'B6 (N13) agent -> remove em MASSA recusado (admin_required)' \
  'admin_required' "$(agent_a "SELECT public.remove_wa_label_from_all_contacts('x_etiqueta');")"
expect_value 'B6 etiquetas intactas' '3' \
  "SELECT count(*) FROM public.contacts WHERE tags @> ARRAY['x_etiqueta']"

expect_ok 'B7 admin renomeia etiqueta em massa (operacao global permitida)' \
  "$(admin "SELECT public.rename_wa_label_on_all_contacts('x_etiqueta','z_etiqueta');")"
expect_value 'B7 etiqueta renomeada nos 3 contatos' '3' \
  "SELECT count(*) FROM public.contacts WHERE tags @> ARRAY['z_etiqueta']"

expect_ok 'B8 agent adiciona etiqueta no PROPRIO contato' \
  "$(agent_a "SELECT public.add_wa_tag_if_not_exists('$PROPRIO','x_','x_proprio');")"
expect_value 'B8 etiqueta propria gravada' '1' \
  "SELECT count(*) FROM public.contacts WHERE tags @> ARRAY['x_proprio']"
expect_error 'B9 agent -> etiqueta em contato ALHEIO recusada' \
  'contact_not_authorized' "$(agent_a "SELECT public.add_wa_tag_if_not_exists('$ALHEIO','x_','x_invasao');")"
expect_error 'B10 agent -> remove etiqueta de contato ALHEIO recusado' \
  'contact_not_authorized' "$(agent_a "SELECT public.remove_wa_tag_by_prefix('$ALHEIO','z_');")"
expect_value 'B10 nenhuma etiqueta do alheio removida' '1' \
  "SELECT count(*) FROM public.contacts WHERE id='$ALHEIO' AND tags @> ARRAY['z_etiqueta']"

# Automacao/cron: claims de service_role E conexao direta (session_user) precisam continuar.
expect_ok 'B11 service_role (claims) segue podendo operar em contato alheio' \
  "SET ROLE service_role; SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',false); SELECT public.set_conversation_status('$ALHEIO','archived');"
expect_ok 'B12 session_user privilegiado sem claims (cron via psql) segue passando' \
  "SET ROLE service_role; SELECT set_config('request.jwt.claims','',false); SELECT public.remove_wa_label_from_all_contacts('z_');"

# anon: sem EXECUTE (revogado em producao) e, na RPC de status, tambem sem grant.
expect_error 'B13 anon (claims role=anon) -> set_conversation_status negado' \
  'permission denied' "SET ROLE anon; SELECT set_config('request.jwt.claims','{\"role\":\"anon\"}',false); SELECT public.set_conversation_status('$ALHEIO','open');"

expect_value 'Z1 FSM continua valida e o ultimo estado aplicado foi o do chamador autorizado' 'archived' \
  "SELECT conversation_status FROM public.contacts WHERE id='$ALHEIO'"

# ── BLOCO C: RPCs atomicas de tag (20261011155015_contact_tags_atomic) ─────────────
echo
echo '── Aplicando a migration das RPCs atomicas de tag ────────────────────────────────'

cat > "$tmp_dir/audit_logs.sql" <<'SQL'
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
SQL

psql_file "$tmp_dir/audit_logs.sql"
psql_file "$tags_migration"
psql_file "$tmp_dir/seed.sql"

echo
echo '── BLOCO C: RPCs atomicas de tag ─────────────────────────────────────────────────'

# Roda um arquivo .sql numa conexao propria (usado nas provas de concorrencia).
run_sql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }
reset_proprio() { psql_sql "UPDATE public.contacts SET tags='{}'::text[] WHERE id='$PROPRIO';" >/dev/null; }

# C0 — CONTRA-EXEMPLO: a leitura-depois-escrita perde a escrita concorrente (o defeito
#      que as RPCs existem para eliminar). Le a versao antiga, dorme, e sobrescreve.
reset_proprio
cat > "$tmp_dir/c0_sess1.sql" <<'SQL'
DO $$
DECLARE v text[];
BEGIN
  SELECT COALESCE(tags,'{}'::text[]) INTO v FROM public.contacts WHERE id='d0000000-0000-0000-0000-000000000002';
  PERFORM pg_sleep(4);
  UPDATE public.contacts SET tags = v || ARRAY['tag_lida'] WHERE id='d0000000-0000-0000-0000-000000000002';
END $$;
SQL
run_sql_file "$tmp_dir/c0_sess1.sql" > "$tmp_dir/c0_sess1.out" 2>&1 &
c0_job=$!
sleep 1
psql_sql "UPDATE public.contacts SET tags = COALESCE(tags,'{}'::text[]) || ARRAY['tag_concorrente'] WHERE id='$PROPRIO';" >/dev/null
wait "$c0_job" || fail "C0: sessao 1 falhou: $(cat "$tmp_dir/c0_sess1.out")"
expect_value 'C0 (contra-exemplo) a leitura-depois-escrita PERDEU a tag concorrente' '0' \
  "SELECT count(*) FROM public.contacts WHERE id='$PROPRIO' AND tags @> ARRAY['tag_concorrente']"
expect_value 'C0 (contra-exemplo) so sobrou a versao obsoleta' 'tag_lida' \
  "SELECT array_to_string(tags,'|') FROM public.contacts WHERE id='$PROPRIO'"

# C3 — CONCORRENCIA: duas conexoes autenticadas adicionam tags DIFERENTES na mesma linha;
#      a segunda espera o lock da primeira e reavalia sobre a versao nova — as DUAS ficam.
reset_proprio
cat > "$tmp_dir/c3_sess1.sql" <<SQL
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
BEGIN;
SELECT public.add_contact_tag('$PROPRIO','corrida_a');
SELECT pg_sleep(4);
COMMIT;
SQL
cat > "$tmp_dir/c3_sess2.sql" <<SQL
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
SELECT public.add_contact_tag('$PROPRIO','corrida_b');
SQL
run_sql_file "$tmp_dir/c3_sess1.sql" > "$tmp_dir/c3_sess1.out" 2>&1 &
c3_job=$!
sleep 2
run_sql_file "$tmp_dir/c3_sess2.sql" > "$tmp_dir/c3_sess2.out" 2>&1 \
  || fail "C3: sessao 2 falhou: $(cat "$tmp_dir/c3_sess2.out")"
wait "$c3_job" || fail "C3: sessao 1 falhou: $(cat "$tmp_dir/c3_sess1.out")"
expect_value 'C3 concorrencia: as DUAS tags sobrevivem (sem lost update)' '2' \
  "SELECT count(*) FROM public.contacts c, unnest(c.tags) t WHERE c.id='$PROPRIO' AND t IN ('corrida_a','corrida_b')"

# C4 — CONCORRENCIA + idempotencia: duas conexoes adicionam a MESMA tag em caixas diferentes;
#      a que espera o lock enxerga a tag recem-gravada e NAO duplica.
reset_proprio
cat > "$tmp_dir/c4_sess1.sql" <<SQL
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
BEGIN;
SELECT public.add_contact_tag('$PROPRIO','Dup_Tag');
SELECT pg_sleep(4);
COMMIT;
SQL
cat > "$tmp_dir/c4_sess2.sql" <<SQL
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
SELECT public.add_contact_tag('$PROPRIO','dup_tag');
SQL
run_sql_file "$tmp_dir/c4_sess1.sql" > "$tmp_dir/c4_sess1.out" 2>&1 &
c4_job=$!
sleep 2
run_sql_file "$tmp_dir/c4_sess2.sql" > "$tmp_dir/c4_sess2.out" 2>&1 \
  || fail "C4: sessao 2 falhou: $(cat "$tmp_dir/c4_sess2.out")"
wait "$c4_job" || fail "C4: sessao 1 falhou: $(cat "$tmp_dir/c4_sess1.out")"
expect_value 'C4 concorrencia: a tag repetida entrou UMA vez' '1' \
  "SELECT count(*) FROM public.contacts c, unnest(c.tags) t WHERE c.id='$PROPRIO' AND lower(t)='dup_tag'"

# C1/C2 — adicionar e idempotencia (sequencial, agente A no proprio contato).
reset_proprio
expect_ok 'C1 agent A adiciona tag no proprio contato' \
  "$(agent_a "SELECT public.add_contact_tag('$PROPRIO','cliente_vip');")"
expect_value 'C1 tag gravada' '1' \
  "SELECT count(*) FROM public.contacts WHERE id='$PROPRIO' AND tags @> ARRAY['cliente_vip']"
psql_sql "UPDATE public.contacts SET updated_at='2020-01-01T00:00:00Z' WHERE id='$PROPRIO';" >/dev/null
expect_ok 'C2 adiciona a MESMA tag em outra caixa (idempotente)' \
  "$(agent_a "SELECT public.add_contact_tag('$PROPRIO','CLIENTE_VIP');")"
expect_value 'C2 sem duplicata (1 ocorrencia, sem diferenciar caixa)' '1' \
  "SELECT count(*) FROM public.contacts c, unnest(c.tags) t WHERE c.id='$PROPRIO' AND lower(t)='cliente_vip'"
expect_value 'C2 no-op preserva updated_at' '2020-01-01 00:00:00+00' \
  "SELECT updated_at FROM public.contacts WHERE id='$PROPRIO'"
# C2b — mudança REAL avança updated_at (o UPDATE só toca a linha e só quando a tag muda;
# a sentença grava updated_at = now() explicitamente, então vale mesmo sem o gatilho real).
expect_ok 'C2b adiciona tag NOVA' \
  "$(agent_a "SELECT public.add_contact_tag('$PROPRIO','nova_tag');")"
expect_value 'C2b mudanca real avancou updated_at (antes/depois)' '1' \
  "SELECT (updated_at > '2020-01-01 00:00:00+00'::timestamptz)::int FROM public.contacts WHERE id='$PROPRIO'"

# C5 — remover tira SOMENTE a tag pedida (todas as caixas dela) e preserva o resto.
psql_sql "UPDATE public.contacts SET tags=ARRAY['keep_a','Remover','keep_b'] WHERE id='$PROPRIO';" >/dev/null
expect_ok 'C5 remove a tag pedida (caixa diferente)' \
  "$(agent_a "SELECT public.remove_contact_tag('$PROPRIO','remover');")"
expect_value 'C5 somente a tag pedida saiu, o resto ficou' 'keep_a|keep_b' \
  "SELECT array_to_string(tags,'|') FROM public.contacts WHERE id='$PROPRIO'"

# C6 — autorizacao: contato sem visibilidade/carteira do agente e recusado, sem efeito.
expect_error 'C6 agent sem carteira -> add em contato ALHEIO recusado' 'contact_not_authorized' \
  "$(agent_a "SELECT public.add_contact_tag('$ALHEIO','invasao');")"
expect_value 'C6 nenhuma tag do alheio alterada' '0' \
  "SELECT count(*) FROM public.contacts WHERE id='$ALHEIO' AND tags @> ARRAY['invasao']"
expect_error 'C6b remove em contato ALHEIO tambem recusado' 'contact_not_authorized' \
  "$(agent_a "SELECT public.remove_contact_tag('$ALHEIO','outra');")"
expect_value 'C6b tag do alheio intacta' '1' \
  "SELECT count(*) FROM public.contacts WHERE id='$ALHEIO' AND tags @> ARRAY['outra']"

# C7 — anon: sem EXECUTE (revogado), nao passa nem na porta de entrada.
expect_error 'C7 anon -> add negado' 'permission denied' \
  "SET ROLE anon; SELECT set_config('request.jwt.claims','{\"role\":\"anon\"}',false); SELECT public.add_contact_tag('$PROPRIO','x');"
expect_error 'C7b anon -> remove negado' 'permission denied' \
  "SET ROLE anon; SELECT set_config('request.jwt.claims','{\"role\":\"anon\"}',false); SELECT public.remove_contact_tag('$PROPRIO','x');"

# C8 — service_role (automacao) segue operando em contato de terceiro.
expect_ok 'C8 service_role adiciona tag em contato alheio' \
  "SET ROLE service_role; SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',false); SELECT public.add_contact_tag('$ALHEIO','cron_tag');"
expect_value 'C8 tag do cron gravada' '1' \
  "SELECT count(*) FROM public.contacts WHERE id='$ALHEIO' AND tags @> ARRAY['cron_tag']"

# C9 — normalizacao: vazio e >40 recusados; 40 aceito.
expect_error 'C9 tag vazia (so espacos) recusada' 'contact_tag_empty' \
  "$(agent_a "SELECT public.add_contact_tag('$PROPRIO','   ');")"
expect_error 'C9 tag com 41 caracteres recusada' 'contact_tag_too_long' \
  "$(agent_a "SELECT public.add_contact_tag('$PROPRIO','$(printf 'a%.0s' {1..41})');")"
expect_ok 'C9 tag com 40 caracteres aceita (limite)' \
  "$(agent_a "SELECT public.add_contact_tag('$PROPRIO','$(printf 'b%.0s' {1..40})');")"
expect_value 'C9 tag de 40 sem espacos nas pontas' '1' \
  "SELECT count(*) FROM public.contacts WHERE id='$PROPRIO' AND tags @> ARRAY['$(printf 'b%.0s' {1..40})']"

# C10 — auditoria: um evento por mudanca real, sem dado pessoal; no-op nao audita.
psql_sql "DELETE FROM public.audit_logs;" >/dev/null
expect_ok 'C10 add gera auditoria' "$(agent_a "SELECT public.add_contact_tag('$PROPRIO','audit_tag');")"
expect_value 'C10 exatamente 1 evento de add' '1' \
  "SELECT count(*) FROM public.audit_logs WHERE action='contact_tag_added' AND entity_id='$PROPRIO'"
expect_value 'C10 detalhes guardam apenas a tag' 'audit_tag' \
  "SELECT details->>'tag' FROM public.audit_logs WHERE action='contact_tag_added' LIMIT 1"
expect_value 'C10 detalhes sem nenhuma outra chave (sem dado pessoal)' '1' \
  "SELECT count(*) FROM public.audit_logs a, jsonb_object_keys(a.details) k WHERE a.action='contact_tag_added'"
expect_ok 'C10b repetir a mesma tag em outra caixa (no-op)' \
  "$(agent_a "SELECT public.add_contact_tag('$PROPRIO','AUDIT_TAG');")"
expect_value 'C10b no-op NAO gera evento novo' '1' \
  "SELECT count(*) FROM public.audit_logs WHERE action='contact_tag_added' AND entity_id='$PROPRIO'"
expect_ok 'C11 remove gera auditoria' "$(agent_a "SELECT public.remove_contact_tag('$PROPRIO','audit_tag');")"
expect_value 'C11 evento de remove registrado' '1' \
  "SELECT count(*) FROM public.audit_logs WHERE action='contact_tag_removed' AND entity_id='$PROPRIO'"

printf '\n[OK] contrato de autorizacao L1/L2 + RPCs atomicas de tag verificados\n'
