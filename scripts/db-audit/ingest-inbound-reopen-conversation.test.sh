#!/usr/bin/env bash
# Contrato da reabertura automatica de conversa (ADR-005 / SL-079):
# ingest_inbound_message deve levar resolved|archived -> open quando chega mensagem NOVA.
#
# Roda o MESMO roteiro duas vezes no mesmo container, com a funcao REAL extraida das
# migrations (nada reimplementado aqui):
#   BLOCO A — definicao anterior (20260905070000): prova o defeito (conversa resolved e
#             archived continuam assim depois do inbound).
#   BLOCO B — migration 20261012100000 aplicada: reabre, mas apenas em mensagem nova
#             (redelivery/duplicata nao reabrem; open e contato novo ficam open).

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
old_migration="$repo_root/supabase/migrations/20260905070000_ingest_lock_feature_flags_audit_rate_limit_cleanup.sql"
phone_migration="$repo_root/supabase/migrations/20260905050000_ingest_inbound_message_tx.sql"
migration="$repo_root/supabase/migrations/20261012100000_ingest_inbound_message_reopen_conversation.sql"
postgres_image="${INGEST_REOPEN_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-ingest-reopen-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-ingest-reopen-test-[0-9]+$ ]]; then
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

expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  if [[ "$actual" != "$expected" ]]; then
    fail "$label: esperado '$expected', obtido '$actual'"
  fi
  printf '[PASS] %s\n' "$label"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
for f in "$old_migration" "$phone_migration" "$migration"; do
  [[ -f "$f" ]] || fail "migration nao encontrada: $f"
done

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

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  name text,
  assigned_to uuid,
  avatar_url text,
  whatsapp_connection_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  conversation_status text NOT NULL DEFAULT 'open'
    CHECK (conversation_status IN ('open', 'waiting', 'resolved', 'archived')),
  conversation_status_changed_at timestamptz DEFAULT now()
);
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  whatsapp_connection_id uuid,
  content text,
  message_type text,
  media_url text,
  sender text NOT NULL,
  external_id text,
  status text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_messages_dedup ON public.messages (whatsapp_connection_id, external_id, sender);
SQL
psql_file "$tmp_dir/pre.sql"

# phone_variants real: do inicio de CREATE FUNCTION phone_variants ate o primeiro "$function$;".
awk '/CREATE OR REPLACE FUNCTION public.phone_variants/{p=1} p{print} p&&/^\$function\$;/{exit}' \
  "$phone_migration" > "$tmp_dir/phone_variants.sql"
[[ -s "$tmp_dir/phone_variants.sql" ]] || fail 'nao extraiu phone_variants da migration'
psql_file "$tmp_dir/phone_variants.sql"

# Definicao anterior de ingest_inbound_message (somente a funcao, sem cron/trigger).
awk '/CREATE OR REPLACE FUNCTION public.ingest_inbound_message/{p=1} p{print} p&&/^\$function\$;/{exit}' \
  "$old_migration" > "$tmp_dir/old_ingest.sql"
[[ -s "$tmp_dir/old_ingest.sql" ]] || fail 'nao extraiu ingest_inbound_message anterior'
psql_file "$tmp_dir/old_ingest.sql"

conn="'00000000-0000-4000-8000-0000000000c1'"

# Roteiro: prepara contato com status dado, faz ingest e devolve "outcome|status".
ingest_case() {
  local phone="$1" status="$2" ext="$3"
  psql_sql "
    INSERT INTO public.contacts (phone, name, whatsapp_connection_id, conversation_status)
    VALUES ('$phone', 'Teste', $conn, '$status') ON CONFLICT (phone) DO UPDATE SET conversation_status = '$status';
    SELECT outcome FROM public.ingest_inbound_message($conn, '$phone', 'Teste', 'oi', 'text', NULL, '$ext', now());
  " | tail -n1
}
status_of() {
  psql_sql "SELECT conversation_status FROM public.contacts WHERE phone = '$1'" | tail -n1
}

run_block() {
  local resolved_expected="$1" archived_expected="$2" prefix="$3"
  [[ "$(ingest_case 5511900000001 resolved "$prefix-1")" == inserted ]] || fail "$prefix: resolved nao inseriu"
  expect_value "$prefix: resolved + inbound novo" "$resolved_expected" "SELECT conversation_status FROM public.contacts WHERE phone = '5511900000001'"
  [[ "$(ingest_case 5511900000002 archived "$prefix-2")" == inserted ]] || fail "$prefix: archived nao inseriu"
  expect_value "$prefix: archived + inbound novo" "$archived_expected" "SELECT conversation_status FROM public.contacts WHERE phone = '5511900000002'"
}

printf '== BLOCO A: definicao anterior (defeito) ==\n'
run_block resolved archived antes
# Sentinela: no estado anterior o defeito existe de fato.
[[ "$(status_of 5511900000001)" == resolved ]] || fail 'sentinela: defeito nao reproduzido no estado anterior'

printf '== BLOCO B: migration aplicada ==\n'
psql_file "$migration"
# A migration nao pode alterar assinatura/privilegios: continua uma unica funcao.
expect_value 'uma unica assinatura de ingest_inbound_message' 1 \
  "SELECT count(*) FROM pg_proc WHERE proname = 'ingest_inbound_message'"
run_block open open depois

# Redelivery (updated) e duplicata nao reabrem: conversa resolvida de novo e mesmo external_id.
psql_sql "UPDATE public.contacts SET conversation_status = 'resolved' WHERE phone = '5511900000001'" >/dev/null
out="$(psql_sql "SELECT outcome FROM public.ingest_inbound_message($conn, '5511900000001', 'Teste', 'oi', 'text', NULL, 'depois-1', now())" | tail -n1)"
[[ "$out" == updated ]] || fail "redelivery: esperado outcome updated, obtido '$out'"
expect_value 'redelivery (updated) nao reabre' resolved "SELECT conversation_status FROM public.contacts WHERE phone = '5511900000001'"

# Contato novo nasce open; open continua open e conversation_status_changed_at nao anda.
[[ "$(psql_sql "SELECT outcome FROM public.ingest_inbound_message($conn, '5511900000003', 'Novo', 'oi', 'text', NULL, 'novo-1', now())" | tail -n1)" == inserted ]] || fail 'contato novo nao inseriu'
expect_value 'contato novo fica open' open "SELECT conversation_status FROM public.contacts WHERE phone = '5511900000003'"

# Reabertura atualiza conversation_status_changed_at.
psql_sql "UPDATE public.contacts SET conversation_status = 'resolved', conversation_status_changed_at = now() - interval '1 day' WHERE phone = '5511900000001'" >/dev/null
psql_sql "SELECT 1 FROM public.ingest_inbound_message($conn, '5511900000001', 'Teste', 'oi', 'text', NULL, 'depois-9', now())" >/dev/null
expect_value 'reabertura carimba conversation_status_changed_at' t \
  "SELECT conversation_status_changed_at > now() - interval '1 minute' FROM public.contacts WHERE phone = '5511900000001'"

printf 'OK: reabertura automatica resolved|archived -> open validada\n'
