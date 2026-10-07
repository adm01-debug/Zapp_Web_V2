#!/usr/bin/env bash
set -euo pipefail

# R2-DB-014 / item 299 (P2) — prova, em PostgreSQL 17 descartável, que o
# CANCELAMENTO de campanha do Talk X deixava de descartar a confirmação do
# provedor de um destinatário EM VOO.
#
# Aplica as MIGRATIONS REAIS (não copia corpo de função para o teste):
#   20260911130000 add_talkx_recipient_delivery_leases      (leases + claim)
#   20260911170000 add_talkx_campaign_completion_rpc        (drenagem)
#   20260911180000 quarantine_talkx_unknown_provider_outcomes (quarentena)
#   20260911190000 account_for_talkx_unknown_provider_outcomes (contadores)
#   20260911120000 talkx_e87_external_id_delivered
#   20260912110000 harden_talkx_delivery_receipts           (fencing do recibo)
#   20260930650000 talkx_v12_server_lifecycle_events        (CHECK 'cancelled')
#   20261003172707 talkx_lifecycle_events_delta             (transition = ANTES, com o defeito)
#   <nova migration>                                        (transition = DEPOIS, corrigida)
#   20261001391230 talkx_engine_tick                        (sweeper, usado só no fim)
#
# RED (antes da correção): cancelar com POST em voo manda o destinatário para
#   'cancelled' e apaga o delivery_claim_token; record_talkx_recipient_sent e
#   complete_talkx_recipient(outcome_unknown) falham com talkx_delivery_claim_conflict
#   -> a confirmação do provedor é descartada e o worker lança ANTES de enfileirar
#   a reconciliação.
# GREEN (depois): o destinatário em voo (provider_dispatch_started_at preenchido)
#   fica intacto ('sending' + lease); os três desfechos do worker gravam e o
#   sweeper resolve o caso de worker morto. Pendentes sem POST continuam fechando.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# A migration nova é achada pelo nome (sobrevive ao rename do hermes-db-migrar --nova).
new_migration="$(ls "$repo_root"/supabase/migrations/*_talkx_cancel_em_voo_mantem_confirmacao.sql 2>/dev/null | grep -v '/_superseded/' | sort | tail -1 || true)"
[[ -n "$new_migration" && -f "$new_migration" ]] || { printf 'FAIL: migration nova (talkx_cancel_em_voo_mantem_confirmacao) não encontrada\n' >&2; exit 1; }

declare -a migrations=(
  "$repo_root/supabase/migrations/20260911130000_add_talkx_recipient_delivery_leases.sql"
  "$repo_root/supabase/migrations/20260911170000_add_talkx_campaign_completion_rpc.sql"
  "$repo_root/supabase/migrations/20260911180000_quarantine_talkx_unknown_provider_outcomes.sql"
  "$repo_root/supabase/migrations/20260911190000_account_for_talkx_unknown_provider_outcomes.sql"
  "$repo_root/supabase/migrations/20260911120000_talkx_e87_external_id_delivered.sql"
  "$repo_root/supabase/migrations/20260912110000_harden_talkx_delivery_receipts.sql"
  "$repo_root/supabase/migrations/20260930650000_talkx_v12_server_lifecycle_events.sql"
  "$repo_root/supabase/migrations/20261003172707_talkx_lifecycle_events_delta.sql"
)
before_migration="${migrations[${#migrations[@]}-1]}"
engine_tick="$repo_root/supabase/migrations/20261001391230_talkx_engine_tick.sql"

postgres_image="${TALKX_CANCEL_IN_FLIGHT_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-cancel-in-flight-test-$$"
test_password="talkx_cancel_in_flight_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
pass() { printf 'PASS: %s\n' "$1"; }

psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_q() { docker exec "$container_name" psql -X -Atq -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
# captura erro esperado sem derrubar o harness (usado nas asserções negativas)
psql_err() { docker exec "$container_name" psql -X -Atq -v ON_ERROR_STOP=0 -U postgres -d postgres -c "$1" 2>&1 || true; }

start_postgres() {
  for attempt in 1 2 3; do
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    if ! docker run -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null; then
      printf 'WARN: PostgreSQL container failed to start (attempt %s/3)\n' "$attempt" >&2
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
    printf 'WARN: PostgreSQL bootstrap was not stable (attempt %s/3)\n' "$attempt" >&2
  done
  return 1
}

start_postgres || fail 'PostgreSQL de teste não iniciou'

service_session="SET ROLE service_role; SET request.jwt.claim.role='service_role';"

# ── fixture: só as colunas/objetos que as migrations reais referenciam ───────
psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user)
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;

-- shim mínimo do vault, exigido pela validação do corpo de get_talkx_send_url()
CREATE SCHEMA vault;
CREATE TABLE vault.decrypted_secrets (name text, decrypted_secret text);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.contacts (id uuid PRIMARY KEY, phone text);
CREATE TABLE public.talkx_blacklist (contact_id uuid, phone text, removed_at timestamptz, expires_at timestamptz);
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY,
  status text NOT NULL,
  message_template text NOT NULL DEFAULT 'Ola',
  total_recipients integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  launched_by uuid,
  launched_at timestamptz,
  paused_at timestamptz,
  pause_reason text,
  paused_by uuid,
  cancelled_at timestamptz,
  cancelled_by uuid,
  scheduled_at timestamptz,
  schedule_timezone text,
  worker_id text,
  worker_lease_expires_at timestamptz,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  outcome_unknown_count integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  whatsapp_connection_id uuid,
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id),
  contact_id uuid,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  delivered_at timestamptz,
  external_id text,
  error_message text,
  attempt_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE TABLE public.talkx_campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  message text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO service_role;
SQL

for m in "${migrations[@]}"; do
  [[ -f "$m" ]] || fail "migration ausente: $m"
  psql_test < "$m" >/dev/null
done
pass "migrations reais aplicadas até $(basename "$before_migration") (estado ANTES da correção)"

# ── helper: cria campanha 'sending' com 1 pendente + 1 em voo; devolve o token ─
setup_campaign() { # $1=campaign $2=recip_pending $3=recip_flight
  psql_test >/dev/null <<SQL
INSERT INTO public.talkx_campaigns(id, status, message_template, total_recipients)
  VALUES ('$1', 'sending', 'Ola', 2);
INSERT INTO public.talkx_recipients(id, campaign_id, status) VALUES
  ('$2', '$1', 'pending'),
  ('$3', '$1', 'pending');
SQL
  local cid="$1" rid="$3"
  psql_q "$service_session SELECT claim_token FROM public.claim_talkx_recipient('$cid', '$rid', 'edge-a', 90);" >/dev/null
  local token
  token="$(psql_q "SELECT delivery_claim_token FROM public.talkx_recipients WHERE id = '$rid';")"
  psql_q "$service_session SELECT public.mark_talkx_recipient_dispatch_started('$rid', '$token'::uuid);" >/dev/null
  printf '%s' "$token"
}

# ═══════════════════════════════════════════════════════════════════════════
# RED — com a transition ANTES da correção
# ═══════════════════════════════════════════════════════════════════════════
C1='50000000-0000-0000-0000-0000000000a1'
C1P='51000000-0000-0000-0000-0000000000a1'
C1F='51000000-0000-0000-0000-0000000000b1'
T1="$(setup_campaign "$C1" "$C1P" "$C1F")"
[[ -n "$T1" ]] || fail 'RED: não consegui reivindicar/marcar o destinatário em voo'

red_cancel="$(psql_q "$service_session SELECT current_status FROM public.transition_talkx_campaign('$C1', 'cancel', NULL, NULL);")"
[[ "$red_cancel" == 'cancelled' ]] || fail "RED: cancel não aplicado [obtido: $red_cancel]"

red_flight_state="$(psql_q "SELECT status || '|' || COALESCE(delivery_claim_token::text, 'NULL') FROM public.talkx_recipients WHERE id = '$C1F';")"
[[ "$red_flight_state" == 'cancelled|NULL' ]] || fail "RED: destinatário em voo deveria ter sido descartado (defeito) [obtido: $red_flight_state]"
pass "RED (defeito): cancelar descarta o destinatário EM VOO -> '$red_flight_state' (status + token apagado)"

red_pending="$(psql_q "SELECT status FROM public.talkx_recipients WHERE id = '$C1P';")"
[[ "$red_pending" == 'cancelled' ]] || fail "RED: pendente deveria ter virado cancelled [obtido: $red_pending]"

red_sent_err="$(psql_err "$service_session SELECT public.record_talkx_recipient_sent('$C1F', '$T1'::uuid, 'prov-rec-red');")"
[[ "$red_sent_err" == *talkx_delivery_claim_conflict* ]] || fail "RED: record_talkx_recipient_sent deveria falhar (confirmação descartada) [obtido: $red_sent_err]"
pass "RED (defeito): record_talkx_recipient_sent falha -> confirmação do provedor DESCARTADA"

red_quarantine_err="$(psql_err "$service_session SELECT public.complete_talkx_recipient('$C1F', '$T1'::uuid, 'outcome_unknown', 'Provider outcome unknown: timeout');")"
[[ "$red_quarantine_err" == *talkx_delivery_claim_conflict* ]] || fail "RED: complete_talkx_recipient(outcome_unknown) deveria falhar [obtido: $red_quarantine_err]"
pass "RED (defeito): quarentena falha com o MESMO token -> worker lança antes de enfileirar a reconciliação"

# ═══════════════════════════════════════════════════════════════════════════
# GREEN — aplica a MIGRATION NOVA (real) e repete
# ═══════════════════════════════════════════════════════════════════════════
psql_test < "$new_migration" >/dev/null
pass "migration nova aplicada: $(basename "$new_migration")"

# ACL: continua service_role-only (nada afrouxado)
acl_service="$(psql_q "SELECT has_function_privilege('service_role', 'public.transition_talkx_campaign(uuid,text,text,uuid)', 'EXECUTE')::text;")"
acl_auth="$(psql_q "SELECT has_function_privilege('authenticated', 'public.transition_talkx_campaign(uuid,text,text,uuid)', 'EXECUTE')::text;")"
acl_anon="$(psql_q "SELECT has_function_privilege('anon', 'public.transition_talkx_campaign(uuid,text,text,uuid)', 'EXECUTE')::text;")"
[[ "$acl_service" == 'true' && "$acl_auth" == 'false' && "$acl_anon" == 'false' ]] \
  || fail "ACL indevida após a migration [service=$acl_service auth=$acl_auth anon=$acl_anon]"
pass 'ACL inalterada: EXECUTE só para service_role (authenticated/anon negados)'

# ── G1: desfecho SUCESSO do provedor (mensagem aceita) ──────────────────────
C2='50000000-0000-0000-0000-0000000000a2'
C2P='51000000-0000-0000-0000-0000000000a2'
C2F='51000000-0000-0000-0000-0000000000b2'
T2="$(setup_campaign "$C2" "$C2P" "$C2F")"
green_cancel="$(psql_q "$service_session SELECT current_status FROM public.transition_talkx_campaign('$C2', 'cancel', NULL, NULL);")"
[[ "$green_cancel" == 'cancelled' ]] || fail "GREEN: cancel não aplicado [obtido: $green_cancel]"

flight_preserved="$(psql_q "SELECT status || '|' || (delivery_claim_token = '$T2'::uuid)::text || '|' || (provider_dispatch_started_at IS NOT NULL)::text FROM public.talkx_recipients WHERE id = '$C2F';")"
[[ "$flight_preserved" == 'sending|true|true' ]] || fail "GREEN: destinatário em voo deveria ficar intacto [obtido: $flight_preserved]"
pass "GREEN: destinatário EM VOO preservado após o cancel -> '$flight_preserved' (sending + token + POST iniciado)"

pending_closed="$(psql_q "SELECT status FROM public.talkx_recipients WHERE id = '$C2P';")"
[[ "$pending_closed" == 'cancelled' ]] || fail "GREEN: pendente deveria continuar fechando [obtido: $pending_closed]"
pass 'GREEN: fila continua fechando para quem NÃO saiu para o provedor (pendente -> cancelled)'

psql_q "$service_session SELECT public.record_talkx_recipient_sent('$C2F', '$T2'::uuid, 'prov-rec-green');" >/dev/null
sent_state="$(psql_q "SELECT r.status || '|' || r.external_id || '|' || c.sent_count FROM public.talkx_recipients r JOIN public.talkx_campaigns c ON c.id = r.campaign_id WHERE r.id = '$C2F';")"
[[ "$sent_state" == 'sent|prov-rec-green|1' ]] || fail "GREEN: confirmação não persistiu [obtido: $sent_state]"
pass "GREEN: confirmação do provedor PERSISTIDA após o cancel -> '$sent_state' (status|external_id|sent_count)"

# ── G2: desfecho INCERTO (timeout/5xx) — quarentena + contador ───────────────
C3='50000000-0000-0000-0000-0000000000a3'
C3P='51000000-0000-0000-0000-0000000000a3'
C3F='51000000-0000-0000-0000-0000000000b3'
T3="$(setup_campaign "$C3" "$C3P" "$C3F")"
psql_q "$service_session SELECT public.transition_talkx_campaign('$C3', 'cancel', NULL, NULL);" >/dev/null
psql_q "$service_session SELECT public.complete_talkx_recipient('$C3F', '$T3'::uuid, 'outcome_unknown', 'Provider outcome unknown: HTTP 503');" >/dev/null
unknown_state="$(psql_q "SELECT r.status || '|' || (r.error_message LIKE 'Provider outcome unknown%')::text || '|' || c.outcome_unknown_count FROM public.talkx_recipients r JOIN public.talkx_campaigns c ON c.id = r.campaign_id WHERE r.id = '$C3F';")"
[[ "$unknown_state" == 'outcome_unknown|true|1' ]] || fail "GREEN: quarentena após cancel não gravou [obtido: $unknown_state]"
pass "GREEN: desfecho INCERTO vira quarentena durável após o cancel -> '$unknown_state' (o worker segue para enqueueRecipientReconciliation)"

# ── G3: desfecho FALHA EXPLÍCITA do provedor ────────────────────────────────
C4='50000000-0000-0000-0000-0000000000a4'
C4P='51000000-0000-0000-0000-0000000000a4'
C4F='51000000-0000-0000-0000-0000000000b4'
T4="$(setup_campaign "$C4" "$C4P" "$C4F")"
psql_q "$service_session SELECT public.transition_talkx_campaign('$C4', 'cancel', NULL, NULL);" >/dev/null
psql_q "$service_session SELECT public.complete_talkx_recipient('$C4F', '$T4'::uuid, 'failed', 'Erro ao enviar');" >/dev/null
failed_state="$(psql_q "SELECT r.status || '|' || r.error_message || '|' || c.failed_count FROM public.talkx_recipients r JOIN public.talkx_campaigns c ON c.id = r.campaign_id WHERE r.id = '$C4F';")"
[[ "$failed_state" == 'failed|Erro ao enviar|1' ]] || fail "GREEN: falha explícita após cancel não gravou [obtido: $failed_state]"
pass "GREEN: falha explícita do provedor é registrada após o cancel -> '$failed_state'"

# ── G4: worker MORTO no meio (lease vencido pós-POST) — sweeper resolve ─────
psql_test < "$engine_tick" >/dev/null
C5='50000000-0000-0000-0000-0000000000a5'
C5P='51000000-0000-0000-0000-0000000000a5'
C5F='51000000-0000-0000-0000-0000000000b5'
setup_campaign "$C5" "$C5P" "$C5F" >/dev/null
# a edge morre: a lease vence sem que ninguém conclua
psql_test >/dev/null <<SQL
UPDATE public.talkx_recipients SET delivery_claim_expires_at = statement_timestamp() - interval '1 minute'
 WHERE id = '$C5F';
SQL
psql_q "$service_session SELECT public.transition_talkx_campaign('$C5', 'cancel', NULL, NULL);" >/dev/null
still_sending="$(psql_q "SELECT status FROM public.talkx_recipients WHERE id = '$C5F';")"
[[ "$still_sending" == 'sending' ]] || fail "GREEN: em voo deveria seguir 'sending' até o sweeper [obtido: $still_sending]"
swept="$(psql_q "$service_session SELECT public.sweep_talkx_stuck_recipients(50);")"
[[ "$swept" == '1' ]] || fail "GREEN: sweeper deveria ter varrido 1 [obtido: $swept]"
swept_state="$(psql_q "SELECT r.status || '|' || c.outcome_unknown_count FROM public.talkx_recipients r JOIN public.talkx_campaigns c ON c.id = r.campaign_id WHERE r.id = '$C5F';")"
[[ "$swept_state" == 'outcome_unknown|1' ]] || fail "GREEN: sweeper não resolveu o destino em voo [obtido: $swept_state]"
pass "GREEN: worker morto pós-POST é resolvido pelo sweeper (nenhum efeito incerto fica sem trilha) -> '$swept_state'"

printf 'PASS: Talk X R2-DB-014 — cancelamento em voo preserva a confirmação do provedor e permite reconciliação\n'
