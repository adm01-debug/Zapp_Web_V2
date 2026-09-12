#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
migration="$repo_root/supabase/migrations/20260911130000_add_talkx_recipient_delivery_leases.sql"
completion_migration="$repo_root/supabase/migrations/20260911170000_add_talkx_campaign_completion_rpc.sql"
quarantine_migration="$repo_root/supabase/migrations/20260911180000_quarantine_talkx_unknown_provider_outcomes.sql"
outcome_counter_migration="$repo_root/supabase/migrations/20260911190000_account_for_talkx_unknown_provider_outcomes.sql"
delivery_ack_migration="$repo_root/supabase/migrations/20260911120000_talkx_e87_external_id_delivered.sql"
receipt_migration="$repo_root/supabase/migrations/20260912110000_harden_talkx_delivery_receipts.sql"
postgres_image="${TALKX_DELIVERY_LEASES_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-delivery-leases-test-$$"
test_password="talkx_delivery_leases_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null
for _ in $(seq 1 30); do
  if docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$container_name" psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1 || fail 'PostgreSQL de teste não iniciou'

psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user)
$$;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;

CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY,
  status text NOT NULL,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  whatsapp_connection_id uuid,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.talkx_campaigns(id),
  contact_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  delivered_at timestamptz,
  external_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
INSERT INTO public.talkx_campaigns (id, status, whatsapp_connection_id) VALUES
  ('40000000-0000-0000-0000-000000000001', 'sending', '60000000-0000-0000-0000-000000000001');
INSERT INTO public.talkx_recipients (id, campaign_id, contact_id, status, created_at) VALUES
  ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'pending', statement_timestamp()),
  ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'pending', statement_timestamp() + interval '1 second');
SQL

psql_test < "$migration" >/dev/null
psql_test < "$completion_migration" >/dev/null
psql_test < "$quarantine_migration" >/dev/null
psql_test < "$outcome_counter_migration" >/dev/null
psql_test < "$delivery_ack_migration" >/dev/null
psql_test < "$receipt_migration" >/dev/null
service_session="SET ROLE service_role; SET request.jwt.claim.role='service_role';"
user_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated';"

unauthorized="$(psql_test -v VERBOSITY=verbose -c "$user_session SELECT * FROM public.claim_talkx_recipient('40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'edge-a', 90);" 2>&1 || true)"
[[ "$unauthorized" == *permission*denied* || "$unauthorized" == *service_role_required* ]] || fail 'authenticated conseguiu obter lease'

first_id="$(psql_test -Atqc "$service_session SELECT recipient_id FROM public.claim_talkx_recipient('40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'edge-a', 90);")"
[[ "$first_id" == '50000000-0000-0000-0000-000000000001' ]] || fail 'primeiro claim não selecionou destinatário pendente'

second_id="$(psql_test -Atqc "$service_session SELECT recipient_id FROM public.claim_talkx_recipient('40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'edge-b', 90);")"
[[ "$second_id" == '50000000-0000-0000-0000-000000000002' ]] || fail 'segundo worker não isolou destinatário distinto'

none="$(psql_test -Atqc "$service_session SELECT count(*) FROM public.claim_talkx_recipient('40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'edge-c', 90);")"
[[ "$none" == '0' ]] || fail 'lease ativo foi reivindicado duas vezes'

first_token="$(psql_test -Atqc "SELECT delivery_claim_token FROM public.talkx_recipients WHERE id='50000000-0000-0000-0000-000000000001'")"
psql_test >/dev/null <<SQL
$service_session
SELECT public.record_talkx_recipient_sent('50000000-0000-0000-0000-000000000001', '$first_token'::uuid, 'provider-message-1');
SQL
[[ "$(psql_test -Atqc "SELECT r.status || ':' || r.external_id || ':' || c.sent_count || ':' || c.failed_count FROM public.talkx_recipients r JOIN public.talkx_campaigns c ON c.id=r.campaign_id WHERE r.id='50000000-0000-0000-0000-000000000001'")" == 'sent:provider-message-1:1:0' ]] || fail 'recibo de envio não foi persistido atomicamente'

first_ack="$(psql_test -Atqc "$service_session SELECT public.record_talkx_recipient_delivered('provider-message-1', '60000000-0000-0000-0000-000000000001');")"
[[ "$first_ack" == 't' ]] || fail 'primeiro DELIVERY_ACK não atualizou o destinatário'
repeated_ack="$(psql_test -Atqc "$service_session SELECT public.record_talkx_recipient_delivered('provider-message-1', '60000000-0000-0000-0000-000000000001');")"
[[ "$repeated_ack" == 'f' ]] || fail 'DELIVERY_ACK duplicado incrementou a métrica novamente'
[[ "$(psql_test -Atqc "SELECT r.status || ':' || c.delivered_count FROM public.talkx_recipients r JOIN public.talkx_campaigns c ON c.id=r.campaign_id WHERE r.id='50000000-0000-0000-0000-000000000001'")" == 'delivered:1' ]] || fail 'ack não atualizou destinatário e contador na mesma transação'

stale="$(psql_test -v VERBOSITY=verbose -c "$service_session SELECT public.complete_talkx_recipient('50000000-0000-0000-0000-000000000001', '$first_token'::uuid, 'sent');" 2>&1 || true)"
[[ "$stale" == *talkx_delivery_claim_conflict* ]] || fail 'conclusão com lease antigo foi aceita'

psql_test >/dev/null <<'SQL'
UPDATE public.talkx_recipients
SET delivery_claim_expires_at = statement_timestamp() - interval '1 second'
WHERE id = '50000000-0000-0000-0000-000000000002';
SQL
reclaimed="$(psql_test -Atqc "$service_session SELECT recipient_id || ':' || delivery_attempt_count FROM public.claim_talkx_recipient('40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'edge-recovery', 90);")"
[[ "$reclaimed" == '50000000-0000-0000-0000-000000000002:2' ]] || fail 'lease expirado não foi recuperado uma única vez'

reclaimed_token="$(psql_test -Atqc "SELECT delivery_claim_token FROM public.talkx_recipients WHERE id='50000000-0000-0000-0000-000000000002'")"
released="$(psql_test -Atqc "$service_session SELECT public.release_talkx_recipient_claim('50000000-0000-0000-0000-000000000002', '$reclaimed_token'::uuid);")"
[[ "$released" == 't' ]] || fail 'claim sem POST não foi liberado antes de pausar a campanha'
released_reclaim="$(psql_test -Atqc "$service_session SELECT delivery_attempt_count FROM public.claim_talkx_recipient('40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'edge-resume', 90);")"
[[ "$released_reclaim" == '3' ]] || fail 'claim liberado não voltou imediatamente à fila'

invalid="$(psql_test -v VERBOSITY=verbose -c "$service_session SELECT * FROM public.claim_talkx_recipient('40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'worker invalido', 90);" 2>&1 || true)"
[[ "$invalid" == *invalid_talkx_delivery_claim* ]] || fail 'worker inválido foi aceito'

not_drained="$(psql_test -Atqc "$service_session SELECT public.complete_talkx_campaign_if_drained('40000000-0000-0000-0000-000000000001');")"
[[ "$not_drained" == 'f' ]] || fail 'campanha com lease ativo foi concluída'

second_token="$(psql_test -Atqc "SELECT delivery_claim_token FROM public.talkx_recipients WHERE id='50000000-0000-0000-0000-000000000002'")"
psql_test >/dev/null <<SQL
$service_session
SELECT public.complete_talkx_recipient('50000000-0000-0000-0000-000000000002', '$second_token'::uuid, 'outcome_unknown', 'Confirmação do provedor indisponível');
SQL
[[ "$(psql_test -Atqc "SELECT r.status || ':' || c.sent_count || ':' || c.failed_count || ':' || c.outcome_unknown_count FROM public.talkx_recipients r JOIN public.talkx_campaigns c ON c.id=r.campaign_id WHERE r.id='50000000-0000-0000-0000-000000000002'")" == 'outcome_unknown:1:0:1' ]] || fail 'resultado ambíguo não foi colocado em quarentena sem contaminar contadores'
unknown_claim="$(psql_test -Atqc "$service_session SELECT count(*) FROM public.claim_talkx_recipient('40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'edge-retry', 90);")"
[[ "$unknown_claim" == '0' ]] || fail 'resultado ambíguo voltou automaticamente para a fila e poderia duplicar um envio'
drained="$(psql_test -Atqc "$service_session SELECT public.complete_talkx_campaign_if_drained('40000000-0000-0000-0000-000000000001');")"
[[ "$drained" == 't' ]] || fail 'campanha drenada não foi concluída'
[[ "$(psql_test -Atqc "SELECT status FROM public.talkx_campaigns WHERE id='40000000-0000-0000-0000-000000000001'")" == 'completed' ]] || fail 'estado final não foi persistido'

printf 'PASS: Talk X delivery leases fence duplicates, atomically persist provider receipts/acks, release unsent claims, and quarantine ambiguous outcomes\n'
