#!/usr/bin/env bash
# Auditoria Conversas 2026-11-13 — prova das 5 migrations 20261113130000..130400 em
# PostgreSQL 17 DESCARTÁVEL (docker), com papéis reais via SET ROLE + request.jwt.claims.
#
#  P0-1 (130000) envio: conexão do contato caída -> contact_whatsapp_connection_disconnected
#        (sem fallback silencioso); fixture E2E_FIXTURE / "[E2E]…" nunca é escolhida;
#        explícita na fixture recusada; fixture vira 'disconnected'; helper sem EXECUTE
#        para authenticated; grupo segue a mesma regra.
#  P0-3 + P1-3 (130100) estado de PRODUÇÃO reproduzido (duas transfer_conversation):
#        chamada nomeada é ambígua (42725) ANTES; DEPOIS há 1 só, fila -> waiting sem
#        dono, agente -> open, compare-and-set 40001.
#  P1-2 (130200) FSM §4.1; UPDATE direto de conversation_status por authenticated
#        recusado (42501), outras colunas seguem; RPCs DEFINER e gatilho encadeado
#        (closure -> resolved) seguem; RPC de lote pula sem permissão/transição inválida
#        e respeita o status esperado; CHECK só com os 4 estados.
#  P1-5 (130300) closed_by forjado vira o perfil de quem insere; UPDATE não troca autor.
#  P1-4/P1-1 (130400) varredura: fixture/nunca despachada/lease sem POST -> failed;
#        ambígua carimbada fica; claim antigo sem carimbo vai para resolução manual;
#        message_attempts preenchida; authenticated não executa.
#  Toda migration aplicada 2x (idempotente) e as pré-condições falham fechado.
#
# Schema: migrations REAIS onde aplicáveis standalone (transfer 20261015182236,
# set_conversation_status 20261016010011, closure sync 20260927510001, message_attempts
# 20261011124430). O resto é HARNESS mínimo, rotulado com a fonte canônica.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MIG="$REPO_ROOT/supabase/migrations"
F_TRANSFER_OLD="$MIG/20261015182236_transfer_conversation_limpa_agente_e_cas.sql"
F_SET_STATUS="$MIG/20261016010011_set_conversation_status_waiting_para_archived.sql"
F_CLOSURE_SYNC="$MIG/20260927510001_add_sync_contact_status_on_closure_trigger.sql"
F_ATTEMPTS="$MIG/20261011124430_message_attempts.sql"
F1="$MIG/20261113130000_envio_sem_conexao_de_teste_nem_fallback_silencioso.sql"
F2="$MIG/20261113130100_transfer_conversation_unica_e_fila_aguardando.sql"
F3="$MIG/20261113130200_conversation_status_regras_e_so_por_rpc.sql"
F4="$MIG/20261113130300_conversation_closures_closed_by_do_autor.sql"
F5="$MIG/20261113130400_varredura_mensagens_presas_em_enviando.sql"

fail() { echo "[FAIL] $*" >&2; exit 1; }
ok()   { echo "[OK] $*"; }

for f in "$F_TRANSFER_OLD" "$F_SET_STATUS" "$F_CLOSURE_SYNC" "$F_ATTEMPTS" "$F1" "$F2" "$F3" "$F4" "$F5"; do
  [[ -f "$f" ]] || fail "migration real ausente: $f"
done

IMAGE="${CONVERSAS_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
CID="conversas-p0p1-test-$$"
docker rm -f "$CID" >/dev/null 2>&1 || true
docker run -d --name "$CID" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null || fail "subir postgres ($IMAGE)"
trap 'docker rm -f "$CID" >/dev/null 2>&1 || true' EXIT
for _ in $(seq 1 120); do docker exec "$CID" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
sleep 3
for _ in $(seq 1 60); do docker exec "$CID" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done

psql_q() { docker exec -i "$CID" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
apply() { psql_q < "$1" >/dev/null 2>&1 || { psql_q < "$1" 2>&1 | tail -5 >&2; fail "aplicar $(basename "$1")"; }; }
val() { psql_q -tA -c "$1" | tr -d '[:space:]'; }
# Executa SQL como um papel/usuário e devolve "OK" ou o SQLSTATE + mensagem do erro.
as_user() {
  local role="$1" sub="$2" sql="$3"
  docker exec -i "$CID" psql -X -q -tA -U postgres -d postgres 2>&1 <<SQL | tr -d '\r' | tr '\n' ' ' | tail -c 2000
\set VERBOSITY verbose
\set ON_ERROR_STOP 1
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub', '$sub', 'role', '$role')::text, true);
SET LOCAL ROLE $role;
$sql
COMMIT;
SQL
}
expect_err() { # $1 rótulo, $2 trecho esperado, $3 saída
  [[ "$3" == *"$2"* ]] || fail "$1: esperado '$2', veio: $3"
  ok "$1"
}

# ── HARNESS ────────────────────────────────────────────────────────────────────
psql_q >/dev/null <<'SQL'
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;

-- HARNESS: tabelas mínimas (colunas usadas pelas funções testadas).
CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid UNIQUE, is_active boolean DEFAULT true);
CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, instance_id text, status text,
  updated_at timestamptz DEFAULT now());
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, phone text,
  assigned_to uuid, queue_id uuid, whatsapp_connection_id uuid,
  conversation_status text DEFAULT 'open', conversation_status_changed_at timestamptz,
  updated_at timestamptz DEFAULT now());
CREATE TABLE public.conversation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid, event_type text,
  from_agent_id uuid, from_queue_id uuid, to_agent_id uuid, to_queue_id uuid,
  performed_by uuid, metadata jsonb, created_at timestamptz DEFAULT now());
CREATE TABLE public.conversation_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid NOT NULL, closed_by uuid,
  close_reason text NOT NULL, outcome text, classification text, notes text,
  client_request_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.whatsapp_groups (id uuid PRIMARY KEY, whatsapp_connection_id uuid, group_id text);
CREATE TABLE public.whatsapp_connection_queues (whatsapp_connection_id uuid, queue_id uuid);
CREATE TABLE public.queue_members (queue_id uuid, profile_id uuid, is_active boolean DEFAULT true);
CREATE TABLE public.global_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text UNIQUE, value text, description text,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), updated_by uuid);
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid, whatsapp_group_id uuid,
  client_message_id uuid, whatsapp_connection_id uuid, agent_id uuid, sender text,
  content text, message_type text DEFAULT 'text', media_url text, caption text,
  media_filename text, media_mimetype text, media_meta jsonb, reply_to_id uuid,
  is_read boolean, status text, external_id text, status_updated_at timestamptz,
  delivery_attempt_count integer NOT NULL DEFAULT 0, delivery_claim_token uuid,
  delivery_claimed_at timestamptz, delivery_claim_expires_at timestamptz,
  delivery_claimed_by text, delivery_last_claim_token uuid,
  delivery_post_started_at timestamptz, manually_resolved_at timestamptz,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE UNIQUE INDEX messages_client_msg_uq ON public.messages (contact_id, client_message_id) WHERE client_message_id IS NOT NULL;
CREATE UNIQUE INDEX messages_group_client_msg_uq ON public.messages (whatsapp_group_id, client_message_id)
  WHERE client_message_id IS NOT NULL AND whatsapp_group_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;

-- HARNESS: helpers de autorização (fontes canônicas: 20260929810000 can_edit_contact,
-- 20260930090000 require_contact_edit_permission, user_has_permission/is_admin_*).
-- Regra simplificada: pode editar quem é o dono ou contato sem dono.
CREATE FUNCTION public.get_profile_id_for_user(uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
  AS $$ SELECT id FROM public.profiles WHERE user_id = $1 $$;
CREATE FUNCTION public.can_edit_contact(p_assigned uuid, p_queue uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
  AS $$ SELECT p_assigned IS NULL OR p_assigned = public.get_profile_id_for_user(auth.uid()) $$;
CREATE FUNCTION public.require_contact_edit_permission(p_contact_id uuid) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = p_contact_id
                  AND public.can_edit_contact(c.assigned_to, c.queue_id)) THEN
    RAISE EXCEPTION 'sem permissao' USING ERRCODE = '42501';
  END IF;
END $$;
CREATE FUNCTION public.is_contact_visible_to_user(uuid, uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION public.user_has_permission(uuid, text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION public.is_admin_or_supervisor(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.is_admin(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;

-- HARNESS: FSM e CHECK VIGENTES (corpo de 20260929560000_contacts_conversation_status_and_grants.sql;
-- o arquivo inteiro também mexe em GRANTs que o harness não tem).
ALTER TABLE public.contacts ADD CONSTRAINT chk_conversation_status_values
  CHECK (conversation_status IS NULL OR conversation_status IN ('open','pending','waiting','resolved','closed','archived'));
CREATE FUNCTION public.enforce_conversation_status_transition() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$ BEGIN
  IF OLD.conversation_status IS NOT DISTINCT FROM NEW.conversation_status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.conversation_status = 'open'     AND NEW.conversation_status IN ('pending','waiting','resolved','closed','archived')) OR
    (OLD.conversation_status = 'pending'  AND NEW.conversation_status IN ('open','waiting','resolved','closed','archived')) OR
    (OLD.conversation_status = 'waiting'  AND NEW.conversation_status IN ('open','pending','resolved','closed','archived')) OR
    (OLD.conversation_status = 'resolved' AND NEW.conversation_status IN ('open','pending','closed','archived')) OR
    (OLD.conversation_status = 'closed'   AND NEW.conversation_status IN ('open','pending','archived')) OR
    (OLD.conversation_status = 'archived' AND NEW.conversation_status IN ('open','pending'))
  ) THEN RAISE EXCEPTION 'Invalid conversation_status transition: % -> %', OLD.conversation_status, NEW.conversation_status USING ERRCODE = 'check_violation'; END IF;
  NEW.conversation_status_changed_at = NOW(); RETURN NEW; END; $f$;
CREATE TRIGGER trg_contacts_fsm_transition BEFORE UPDATE ON public.contacts FOR EACH ROW
  WHEN (OLD.conversation_status IS DISTINCT FROM NEW.conversation_status)
  EXECUTE FUNCTION public.enforce_conversation_status_transition();

-- HARNESS: policy de INSERT VIGENTE em conversation_closures (20260409190343).
ALTER TABLE public.conversation_closures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agents can create closures for their contacts" ON public.conversation_closures
  FOR INSERT TO authenticated WITH CHECK (public.is_contact_visible_to_user(contact_id, auth.uid()));
CREATE POLICY closures_read ON public.conversation_closures FOR SELECT TO authenticated USING (true);
CREATE POLICY closures_upd ON public.conversation_closures FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- HARNESS: assinaturas vigentes dos três enqueue (os corpos reais são recriados pela 130000).
CREATE FUNCTION public.enqueue_outbound_message(uuid, uuid, text, text DEFAULT 'text', text DEFAULT NULL, uuid DEFAULT NULL, uuid DEFAULT NULL, text DEFAULT NULL)
  RETURNS public.messages LANGUAGE sql AS $$ SELECT NULL::public.messages $$;
CREATE FUNCTION public.enqueue_rich_outbound_message(uuid, uuid, text, text, jsonb, uuid DEFAULT NULL, uuid DEFAULT NULL)
  RETURNS public.messages LANGUAGE sql AS $$ SELECT NULL::public.messages $$;
CREATE FUNCTION public.enqueue_group_outbound_message(uuid, uuid, text, text DEFAULT 'text', text DEFAULT NULL, uuid DEFAULT NULL, uuid DEFAULT NULL, text DEFAULT NULL)
  RETURNS public.messages LANGUAGE sql AS $$ SELECT NULL::public.messages $$;

-- Dados
INSERT INTO public.profiles VALUES
  ('aaaaaaaa-0000-4000-8000-00000000000a','a1a1a1a1-0000-4000-8000-0000000000a1', true),
  ('bbbbbbbb-0000-4000-8000-00000000000b','b1b1b1b1-0000-4000-8000-0000000000b1', true);
INSERT INTO public.whatsapp_connections (id, name, instance_id, status, updated_at) VALUES
  ('c0000000-0000-4000-8000-000000000001','Comercial','PRINCIPAL','connected', now() - interval '1 day'),
  ('c0000000-0000-4000-8000-000000000002','Suporte','SUPORTE','disconnected', now()),
  ('e2e0e2e0-0000-4000-a000-e2e000000001','[E2E] Conexão WhatsApp Teste','E2E_FIXTURE','connected', now());
SQL
ok "harness pronto"

apply "$F_TRANSFER_OLD"; apply "$F_SET_STATUS"; apply "$F_CLOSURE_SYNC"; apply "$F_ATTEMPTS"
# Estado de PRODUÇÃO medido (auditoria P0-3): a sobrecarga de 4 argumentos recriada por fora.
psql_q >/dev/null <<'SQL'
CREATE FUNCTION public.transfer_conversation(p_contact_id uuid, p_to_agent_id uuid DEFAULT NULL, p_to_queue_id uuid DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$ SELECT NULL::uuid $$;
SQL
ok "migrations reais de base aplicadas + sobrecarga de produção recriada"

UA=a1a1a1a1-0000-4000-8000-0000000000a1; PA=aaaaaaaa-0000-4000-8000-00000000000a
UB=b1b1b1b1-0000-4000-8000-0000000000b1; PB=bbbbbbbb-0000-4000-8000-00000000000b

# ── ANTES: transferência ambígua ─────────────────────────────────────────────
psql_q -c "INSERT INTO public.contacts (id, phone, assigned_to, conversation_status) VALUES ('d0000000-0000-4000-8000-000000000001','5511911111111','$PA','open')" >/dev/null
out=$(as_user authenticated "$UA" "SELECT public.transfer_conversation(p_contact_id => 'd0000000-0000-4000-8000-000000000001', p_to_queue_id => gen_random_uuid());" || true)
expect_err "ANTES: chamada nomeada de transfer_conversation é ambígua (42725)" "42725" "$out"

# ── Pré-condições falham fechado ─────────────────────────────────────────────
psql_q >/dev/null <<'SQL'
ALTER FUNCTION public.log_message_attempt(uuid, integer, text, text, text, integer, jsonb, integer) RENAME TO log_message_attempt_x;
SQL
out=$(psql_q < "$F5" 2>&1 || true)
expect_err "pré-condição da 130400 falha fechado sem log_message_attempt" "pre-condicao" "$out"
psql_q -c "ALTER FUNCTION public.log_message_attempt_x(uuid, integer, text, text, text, integer, jsonb, integer) RENAME TO log_message_attempt" >/dev/null

# ── Aplicar as 5 migrations, 2x cada ─────────────────────────────────────────
for f in "$F1" "$F2" "$F3" "$F4" "$F5"; do apply "$f"; apply "$f"; done
ok "5 migrations aplicadas duas vezes (idempotentes)"

# ── P0-1 ───────────────────────────────────────────────────────────────────
[[ "$(val "SELECT status FROM public.whatsapp_connections WHERE instance_id='E2E_FIXTURE'")" == disconnected ]] || fail "fixture continua connected"
ok "P0-1: fixture E2E ficou disconnected"
psql_q -c "UPDATE public.whatsapp_connections SET status='connected', updated_at = now() WHERE instance_id='E2E_FIXTURE'" >/dev/null  # pior caso: alguém religa
psql_q >/dev/null <<SQL
INSERT INTO public.contacts (id, phone, whatsapp_connection_id) VALUES
  ('d0000000-0000-4000-8000-000000000010','5511900000010','c0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-000000000011','5511900000011',NULL),
  ('d0000000-0000-4000-8000-000000000012','5511900000012','e2e0e2e0-0000-4000-a000-e2e000000001');
INSERT INTO public.whatsapp_groups VALUES ('a0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002','120363000000000001@g.us');
SQL
enq() { as_user authenticated "$UA" "SELECT whatsapp_connection_id FROM public.enqueue_outbound_message('$1', gen_random_uuid(), 'oi', 'text', NULL, NULL, $2, NULL);" || true; }
out=$(enq d0000000-0000-4000-8000-000000000010 NULL)
expect_err "P0-1: conexão do contato caída -> contact_whatsapp_connection_disconnected (sem fallback)" "contact_whatsapp_connection_disconnected" "$out"
out=$(enq d0000000-0000-4000-8000-000000000011 NULL)
[[ "$out" == *"c0000000-0000-4000-8000-000000000001"* ]] || fail "contato legado deveria ir pela conexão real (veio: $out)"
ok "P0-1: contato sem conexão vai pela conexão REAL, mesmo com a fixture 'connected' e mais recente"
out=$(enq d0000000-0000-4000-8000-000000000012 NULL)
expect_err "P0-1: contato atribuído à fixture -> desconectado" "contact_whatsapp_connection_disconnected" "$out"
out=$(enq d0000000-0000-4000-8000-000000000011 "'e2e0e2e0-0000-4000-a000-e2e000000001'")
expect_err "P0-1: escolha explícita da fixture recusada" "selected_whatsapp_connection_unavailable" "$out"
psql_q -c "UPDATE public.whatsapp_connections SET status='disconnected' WHERE instance_id='PRINCIPAL'; UPDATE public.whatsapp_connections SET instance_id='OUTRA' WHERE name LIKE '[E2E]%'" >/dev/null
out=$(enq d0000000-0000-4000-8000-000000000011 NULL)
expect_err "P0-1: só sobra conexão '[E2E]…' -> no_connected_whatsapp_connection" "no_connected_whatsapp_connection" "$out"
psql_q -c "UPDATE public.whatsapp_connections SET status='connected' WHERE instance_id='PRINCIPAL'; UPDATE public.whatsapp_connections SET instance_id='E2E_FIXTURE' WHERE name LIKE '[E2E]%'" >/dev/null
out=$(as_user authenticated "$UA" "SELECT public.enqueue_group_outbound_message('a0000000-0000-4000-8000-000000000001', gen_random_uuid(), 'oi');" || true)
expect_err "P0-1: grupo com conexão caída -> contact_whatsapp_connection_disconnected" "contact_whatsapp_connection_disconnected" "$out"
out=$(as_user authenticated "$UA" "SELECT public.resolve_outbound_whatsapp_connection(NULL, NULL);" || true)
expect_err "P0-1: authenticated não executa o helper" "42501" "$out"

# ── P0-3 + P1-3 ────────────────────────────────────────────────────────────
[[ "$(val "SELECT count(*) FROM pg_proc WHERE proname='transfer_conversation'")" == 1 ]] || fail "sobrou sobrecarga"
out=$(as_user authenticated "$UA" "SELECT public.transfer_conversation(p_contact_id => 'd0000000-0000-4000-8000-000000000001', p_to_queue_id => 'f0000000-0000-4000-8000-000000000001');")
[[ "$(val "SELECT coalesce(assigned_to::text,'null')||'/'||conversation_status FROM public.contacts WHERE id='d0000000-0000-4000-8000-000000000001'")" == "null/waiting" ]] || fail "fila não foi para waiting sem dono"
ok "P0-3/P1-3: 1 só transfer_conversation; chamada sem o 5º argumento funciona; fila -> waiting sem dono"
as_user authenticated "$UA" "SELECT public.transfer_conversation(p_contact_id => 'd0000000-0000-4000-8000-000000000001', p_to_agent_id => '$PB');" >/dev/null
[[ "$(val "SELECT assigned_to||'/'||conversation_status FROM public.contacts WHERE id='d0000000-0000-4000-8000-000000000001'")" == "$PB/open" ]] || fail "agente não voltou a open"
ok "P1-3: destino agente em waiting -> open"
out=$(as_user authenticated "$UB" "SELECT public.transfer_conversation(p_contact_id => 'd0000000-0000-4000-8000-000000000001', p_to_agent_id => '$PA', p_expected_agent_id => '$PA');" || true)
expect_err "P0-3: compare-and-set com dono velho -> 40001" "40001" "$out"
[[ "$(val "SELECT count(*) FROM public.conversation_events WHERE event_type='transfer'")" == 2 ]] || fail "eventos de transferência"
ok "P0-3: 2 eventos 'transfer' gravados (antes: 0 em toda a história)"

# ── P1-2 ───────────────────────────────────────────────────────────────────
psql_q >/dev/null <<SQL
INSERT INTO public.contacts (id, phone, assigned_to, conversation_status) VALUES
  ('d0000000-0000-4000-8000-000000000020','5511900000020','$PA','open'),
  ('d0000000-0000-4000-8000-000000000021','5511900000021','$PA','open'),
  ('d0000000-0000-4000-8000-000000000022','5511900000022','$PB','open'),
  ('d0000000-0000-4000-8000-000000000023','5511900000023','$PA','resolved');
SQL
out=$(as_user authenticated "$UA" "UPDATE public.contacts SET conversation_status='archived' WHERE id='d0000000-0000-4000-8000-000000000020';" || true)
expect_err "P1-2: UPDATE direto de conversation_status por authenticated recusado" "conversation_status_requires_rpc" "$out"
out=$(as_user authenticated "$UA" "UPDATE public.contacts SET name='novo' WHERE id='d0000000-0000-4000-8000-000000000020'; SELECT 'OK';")
expect_err "P1-2: UPDATE de outra coluna segue liberado" "OK" "$out"
out=$(as_user authenticated "$UA" "SELECT contact_id||':'||previous_status FROM public.set_conversations_status(ARRAY['d0000000-0000-4000-8000-000000000020','d0000000-0000-4000-8000-000000000021','d0000000-0000-4000-8000-000000000022','d0000000-0000-4000-8000-000000000023']::uuid[], 'archived');")
[[ "$(val "SELECT string_agg(right(id::text,2)||conversation_status, ',' ORDER BY id) FROM public.contacts WHERE id::text LIKE 'd0000000-0000-4000-8000-00000000002%'")" == "20archived,21archived,22open,23archived" ]] || fail "lote: $out"
ok "P1-2: lote arquiva o que pode; pula contato de outro dono (sem erro)"
as_user authenticated "$UA" "SELECT count(*) FROM public.set_conversations_status(ARRAY['d0000000-0000-4000-8000-000000000020']::uuid[], 'resolved');" >/dev/null
[[ "$(val "SELECT conversation_status FROM public.contacts WHERE id='d0000000-0000-4000-8000-000000000020'")" == archived ]] || fail "archived->resolved deveria ser recusado"
ok "P1-2: archived -> resolved recusado pela FSM (pulado no lote)"
as_user authenticated "$UA" "SELECT count(*) FROM public.set_conversations_status(ARRAY['d0000000-0000-4000-8000-000000000020','d0000000-0000-4000-8000-000000000021']::uuid[], 'open', 'archived');" >/dev/null
as_user authenticated "$UA" "SELECT count(*) FROM public.set_conversations_status(ARRAY['d0000000-0000-4000-8000-000000000020']::uuid[], 'waiting', 'open');" >/dev/null
[[ "$(val "SELECT string_agg(conversation_status, ',' ORDER BY id) FROM public.contacts WHERE id IN ('d0000000-0000-4000-8000-000000000020','d0000000-0000-4000-8000-000000000021')")" == "waiting,open" ]] || fail "desfazer em dois passos"
ok "P1-2: desfazer em dois passos (archived -> open -> waiting) com status esperado"
out=$(psql_q -c "UPDATE public.contacts SET conversation_status='pending' WHERE id='d0000000-0000-4000-8000-000000000021'" 2>&1 || true)
expect_err "P1-2: ninguém entra em 'pending' (CHECK/FSM, nem postgres)" "ERROR" "$out"
[[ "$(val "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='chk_conversation_status_values'")" != *pending* ]] || fail "CHECK ainda aceita pending"
ok "P1-2: CHECK só com os 4 estados canônicos (sem linhas legadas)"

# ── Decisão do dono 2026-11-13: waiting NÃO vai direto para archived ───────
psql_q -c "INSERT INTO public.contacts (id, phone, assigned_to, conversation_status) VALUES ('d0000000-0000-4000-8000-000000000030','5511900000030',NULL,'waiting'), ('d0000000-0000-4000-8000-000000000031','5511900000031','$PA','open')" >/dev/null
out=$(as_user authenticated "$UA" "SELECT public.set_conversation_status('d0000000-0000-4000-8000-000000000030','archived');" || true)
expect_err "dono: set_conversation_status waiting -> archived recusado com erro claro" "conversation_waiting_cannot_be_archived" "$out"
out=$(psql_q -c "UPDATE public.contacts SET conversation_status='archived' WHERE id='d0000000-0000-4000-8000-000000000030'" 2>&1 || true)
expect_err "dono: nem o dono do banco (FSM) arquiva conversa aguardando" "conversation_waiting_cannot_be_archived" "$out"
out=$(as_user authenticated "$UA" "SELECT string_agg(contact_id::text, ',') FROM public.set_conversations_status(ARRAY['d0000000-0000-4000-8000-000000000030','d0000000-0000-4000-8000-000000000031']::uuid[], 'archived');")
[[ "$(val "SELECT string_agg(right(id::text,2)||conversation_status, ',' ORDER BY id) FROM public.contacts WHERE id IN ('d0000000-0000-4000-8000-000000000030','d0000000-0000-4000-8000-000000000031')")" == "30waiting,31archived" ]] || fail "lote com aguardando: $out"
ok "dono: lote pula a conversa aguardando e arquiva as demais"
as_user authenticated "$UA" "SELECT public.set_conversation_status('d0000000-0000-4000-8000-000000000030','resolved');" >/dev/null
[[ "$(val "SELECT conversation_status FROM public.contacts WHERE id='d0000000-0000-4000-8000-000000000030'")" == resolved ]] || fail "waiting -> resolved"
as_user authenticated "$UA" "SELECT public.set_conversation_status('d0000000-0000-4000-8000-000000000030','archived');" >/dev/null
[[ "$(val "SELECT conversation_status FROM public.contacts WHERE id='d0000000-0000-4000-8000-000000000030'")" == archived ]] || fail "resolved -> archived"
ok "dono: aguardando -> encerrada -> arquivada segue possível (caminho correto)"

# ── P1-5 (+ gatilho encadeado de status) ───────────────────────────────────
out=$(as_user authenticated "$UA" "INSERT INTO public.conversation_closures (contact_id, close_reason, closed_by) VALUES ('d0000000-0000-4000-8000-000000000021','resolved','$PB'); SELECT 'OK';")
expect_err "P1-5: INSERT direto aceito (contato visível)" "OK" "$out"
[[ "$(val "SELECT closed_by FROM public.conversation_closures WHERE contact_id='d0000000-0000-4000-8000-000000000021'")" == "$PA" ]] || fail "closed_by forjado não foi corrigido"
ok "P1-5: closed_by forjado (colega) virou o perfil de quem inseriu"
[[ "$(val "SELECT conversation_status FROM public.contacts WHERE id='d0000000-0000-4000-8000-000000000021'")" == resolved ]] || fail "gatilho encadeado de status bloqueado"
ok "P1-2: gatilho encadeado (closure -> resolved) segue funcionando"
as_user authenticated "$UA" "UPDATE public.conversation_closures SET closed_by='$PB' WHERE contact_id='d0000000-0000-4000-8000-000000000021';" >/dev/null
[[ "$(val "SELECT closed_by FROM public.conversation_closures WHERE contact_id='d0000000-0000-4000-8000-000000000021'")" == "$PA" ]] || fail "UPDATE trocou o autor"
ok "P1-5: UPDATE direto não troca o autor"
as_user authenticated "$UA" "SELECT public.set_conversation_status('d0000000-0000-4000-8000-000000000020','resolved','ok');" >/dev/null
[[ "$(val "SELECT closed_by FROM public.conversation_closures WHERE contact_id='d0000000-0000-4000-8000-000000000020'")" == "$PA" ]] || fail "set_conversation_status sem autor"
ok "P1-5: encerramento pela RPC passa a gravar o autor (antes NULL)"

# ── P1-1 varredura ─────────────────────────────────────────────────────────
MARK=$(val "SELECT value FROM public.global_settings WHERE key='outbound_sweeper_marker_epoch'")
[[ -n "$MARK" ]] || fail "marcador ausente"
C=d0000000-0000-4000-8000-000000000011
REAL=c0000000-0000-4000-8000-000000000001; FIX=e2e0e2e0-0000-4000-a000-e2e000000001
psql_q >/dev/null <<SQL
INSERT INTO public.messages (id, contact_id, sender, status, whatsapp_connection_id, agent_id, created_at, status_updated_at,
  delivery_attempt_count, delivery_claimed_at, delivery_claim_token, delivery_claim_expires_at, delivery_post_started_at) VALUES
 -- 91 fixture, mesmo com POST carimbado: nenhum cliente real -> failed
 ('90000000-0000-4000-8000-000000000091','$C','agent','sending','$FIX','$PA', now()-interval '3 days', now()-interval '3 days', 1, now()-interval '3 days', NULL, NULL, now()-interval '3 days'),
 -- 92 nunca reivindicada -> failed
 ('90000000-0000-4000-8000-000000000092','$C','agent','sending','$REAL','$PA', now()-interval '1 hour', now()-interval '1 hour', 0, NULL, NULL, NULL, NULL),
 -- 93 claim depois do marcador, lease vencido, sem carimbo -> failed (POST não saiu)
 ('90000000-0000-4000-8000-000000000093','$C','agent','sending','$REAL','$PA', now()-interval '1 hour', now()-interval '1 hour', 1, clock_timestamp()+interval '1 second', gen_random_uuid(), now()-interval '1 second', NULL),
 -- 94 claim ANTES do marcador, sem carimbo -> ambígua: vai para resolução manual
 ('90000000-0000-4000-8000-000000000094','$C','agent','sending','$REAL','$PA', now()-interval '2 days', now()-interval '2 days', 2, now()-interval '2 days', NULL, NULL, NULL),
 -- 95 POST carimbado (ambígua) -> intocada
 ('90000000-0000-4000-8000-000000000095','$C','agent','sending','$REAL','$PA', now()-interval '1 hour', now()-interval '1 hour', 1, now()-interval '1 hour', NULL, NULL, now()-interval '1 hour'),
 -- 96 recente -> intocada
 ('90000000-0000-4000-8000-000000000096','$C','agent','sending','$REAL','$PA', now(), now(), 0, NULL, NULL, NULL, NULL),
 -- 97 lease vivo -> intocada
 ('90000000-0000-4000-8000-000000000097','$C','agent','sending','$REAL','$PA', now()-interval '1 hour', now()-interval '1 hour', 1, now(), gen_random_uuid(), now()+interval '5 minutes', NULL),
 -- 98 já resolvida manualmente -> intocada
 ('90000000-0000-4000-8000-000000000098','$C','agent','sending','$REAL','$PA', now()-interval '1 hour', now()-interval '1 hour', 0, NULL, NULL, NULL, NULL);
UPDATE public.messages SET manually_resolved_at = now() WHERE id = '90000000-0000-4000-8000-000000000098';
SQL
sleep 2
out=$(as_user authenticated "$UA" "SELECT public.sweep_stuck_outbound_messages();" || true)
expect_err "P1-1: authenticated não executa a varredura" "42501" "$out"
RES=$(val "SELECT public.sweep_stuck_outbound_messages()")
[[ "$RES" == '{"failed":3,"awaiting_manual":2,"moved_to_manual":1}' ]] || fail "resultado da varredura: $RES"
ok "P1-1: varredura -> 3 failed, 1 movida para resolução manual, 2 aguardando manual"
STATES=$(val "SELECT string_agg(right(id::text,2)||':'||status||':'||(delivery_post_started_at IS NOT NULL)::text, ',' ORDER BY id) FROM public.messages WHERE id::text LIKE '90000000%'")
[[ "$STATES" == "91:failed:true,92:failed:false,93:failed:false,94:sending:true,95:sending:true,96:sending:false,97:sending:false,98:sending:false" ]] || fail "estados: $STATES"
ok "P1-1: nunca reenvia; ambíguas ficam para o painel; recentes/lease vivo/resolvidas intocadas"
ATT=$(val "SELECT string_agg(right(message_id::text,2)||':'||outcome||':'||error_code, ',' ORDER BY message_id) FROM public.message_attempts")
[[ "$ATT" == "91:failed_final:conexao_de_teste,92:failed_final:nunca_despachada,93:failed_final:lease_vencido_sem_post,94:failed_retryable:ambiguo_sem_carimbo" ]] || fail "message_attempts: $ATT"
ok "P1-1: message_attempts preenchida com o motivo de cada decisão"
RES2=$(val "SELECT public.sweep_stuck_outbound_messages()")
[[ "$RES2" == '{"failed":0,"awaiting_manual":2,"moved_to_manual":0}' ]] || fail "segunda varredura não é idempotente: $RES2"
ok "P1-1: segunda varredura não mexe em nada (idempotente)"

echo "TODOS OS CENÁRIOS PASSARAM"
