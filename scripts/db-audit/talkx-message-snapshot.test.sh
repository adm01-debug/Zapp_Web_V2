#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
migration="$repo_root/supabase/migrations/20260912120000_snapshot_talkx_recipient_messages.sql"
# X065: a 20261118220000 SUBSTITUI a funcao acima — no primeiro snapshot a
# decisao do worker sobre a variante passa a valer, NULL incluso. Sem carregar
# as duas em ordem, este teste assertaria o comportamento antigo (COALESCE), que
# e justamente o defeito corrigido.
migration_variante="$repo_root/supabase/migrations/20261118220000_talkx_snapshot_variante_primeiro_vale.sql"
postgres_image="${TALKX_MESSAGE_SNAPSHOT_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="talkx-message-snapshot-test-$$"
test_password="talkx_message_snapshot_test_only"

cleanup() { docker rm -f "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
psql_test() { docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

start_postgres() {
  # GitHub-hosted runners can occasionally report PostgreSQL ready one instant
  # before its container restarts. Require two successful probes and retry only
  # the disposable bootstrap; a SQL/assertion failure is never retried.
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
    docker ps -a --filter "name=^/${container_name}$" --format 'talkx-test-container {{.Status}}' >&2 || true
    docker logs "$container_name" >&2 || true
  done
  return 1
}

start_postgres || fail 'PostgreSQL de teste não iniciou'

psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user)
$$;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;

CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY,
  status text NOT NULL,
  delivery_claim_token uuid,
  variant_id uuid,
  personalized_message text,
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
INSERT INTO public.talkx_recipients (id, status, delivery_claim_token, variant_id) VALUES
  ('50000000-0000-0000-0000-000000000001', 'sending', '70000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000002', 'sending', '70000000-0000-0000-0000-000000000002', NULL),
  -- X065: variante ja atribuida pelo snapshot da audiencia; o worker vai mandar
  -- NULL porque o texto proprio da campanha vence a variante (regra X020).
  ('50000000-0000-0000-0000-000000000003', 'sending', '70000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000003');
SQL

psql_test < "$migration" >/dev/null
psql_test < "$migration_variante" >/dev/null
service_session="SET ROLE service_role; SET request.jwt.claim.role='service_role';"
user_session="SET ROLE authenticated; SET request.jwt.claim.role='authenticated';"

unauthorized="$(psql_test -v VERBOSITY=verbose -c "$user_session SELECT * FROM public.persist_talkx_recipient_message_snapshot('50000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'Olá');" 2>&1 || true)"
[[ "$unauthorized" == *permission*denied* || "$unauthorized" == *service_role_required* ]] || fail 'authenticated persistiu snapshot de destinatário'

first_snapshot="$(psql_test -Atqc "$service_session SELECT personalized_message || ':' || media_url_snapshot || ':' || media_type_snapshot || ':' || variant_id_snapshot FROM public.persist_talkx_recipient_message_snapshot('50000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'Olá Ana, variante A', 'storage/path/banner-a.jpg', 'image', '80000000-0000-0000-0000-000000000001');")"
[[ "$first_snapshot" == 'Olá Ana, variante A:storage/path/banner-a.jpg:image:80000000-0000-0000-0000-000000000001' ]] || fail 'primeiro snapshot não preservou conteúdo, mídia e variante'

retry_snapshot="$(psql_test -Atqc "$service_session SELECT personalized_message || ':' || media_url_snapshot || ':' || media_type_snapshot || ':' || variant_id_snapshot FROM public.persist_talkx_recipient_message_snapshot('50000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'Olá Ana, variante B alterada', 'storage/path/banner-b.jpg', 'image', '90000000-0000-0000-0000-000000000001');")"
[[ "$retry_snapshot" == "$first_snapshot" ]] || fail 'retry alterou snapshot já persistido'

invalid_media="$(psql_test -v VERBOSITY=verbose -c "$service_session SELECT * FROM public.persist_talkx_recipient_message_snapshot('50000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002', 'Mensagem', 'storage/path/audio.ogg', NULL, NULL);" 2>&1 || true)"
[[ "$invalid_media" == *invalid_talkx_recipient_message_snapshot* ]] || fail 'snapshot aceitou URL de mídia sem tipo'

invalid_claim="$(psql_test -v VERBOSITY=verbose -c "$service_session SELECT * FROM public.persist_talkx_recipient_message_snapshot('50000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000099', 'Mensagem');" 2>&1 || true)"
[[ "$invalid_claim" == *talkx_delivery_claim_conflict* ]] || fail 'snapshot aceitou lease de outro worker'

# X065 — texto proprio da campanha vence a variante (X020): o worker manda
# p_variant_id NULL e a atribuicao tem de ser LIMPA. Antes da 20261118220000 a
# funcao fazia COALESCE(recipient.variant_id, p_variant_id), entao o NULL era
# ignorado, a linha seguia dizendo "variante A" e talkx_campaign_variant_stats
# creditava a ela entrega e resposta de uma mensagem que ela NAO enviou.
psql_test -Atqc "$service_session SELECT personalized_message FROM public.persist_talkx_recipient_message_snapshot('50000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000003', 'Oferta de novembro');" >/dev/null
variante_limpa="$(psql_test -Atqc "SELECT coalesce(variant_id::text, 'NULO') || ':' || coalesce(variant_id_snapshot::text, 'NULO') FROM public.talkx_recipients WHERE id = '50000000-0000-0000-0000-000000000003';")"
[[ "$variante_limpa" == 'NULO:NULO' ]] || fail "texto proprio venceu mas a variante continuou atribuida: $variante_limpa"

# E a imutabilidade do snapshot segue valendo: a retentativa nao reescreve o
# texto nem ressuscita a variante.
retry_sem_variante="$(psql_test -Atqc "$service_session SELECT personalized_message FROM public.persist_talkx_recipient_message_snapshot('50000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000003', 'texto diferente na retentativa');")"
[[ "$retry_sem_variante" == 'Oferta de novembro' ]] || fail "retry reescreveu o snapshot sem variante: $retry_sem_variante"
variante_apos_retry="$(psql_test -Atqc "SELECT coalesce(variant_id::text, 'NULO') FROM public.talkx_recipients WHERE id = '50000000-0000-0000-0000-000000000003';")"
[[ "$variante_apos_retry" == 'NULO' ]] || fail "retry ressuscitou a variante limpa: $variante_apos_retry"

printf 'PASS: Talk X snapshots immutable per-recipient content, media and A/B attribution behind a service lease, and clears the assignment when the campaign text wins (X020)\n'
