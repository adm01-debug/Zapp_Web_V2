#!/usr/bin/env bash
# SL-045 (P2) — "View slo_inbound_latency_daily (p50/p95)" — docs/runbooks/slo.md, passo 4.
#
# O SLO "Mensagem inbound visível" (p95 < 5 s) mede o atraso entre o created_at do
# provedor (WhatsApp) e o instante em que a linha ficou visível no banco. A view pedida
# agora existe; este teste prova, no Postgres descartável e com a migration REAL:
#
#   BLOCO A (antes/vermelho) — na ponta não há a view nem o relógio do INSERT
#                              (messages.received_at): a lacuna que o item descreve.
#   BLOCO B (depois)         — p50/p95 por dia em ms, só sender = 'contact', só linhas
#                              com as duas pontas conhecidas, atraso negativo zerado,
#                              dia no fuso America/Sao_Paulo, ACL fechada para anon,
#                              security_invoker ativo (RLS de messages continua valendo),
#                              migration idempotente e rollback que roda e desfaz tudo.
#
# Fixture: public.messages é um predecessor MÍNIMO e fiel do canônico (o DDL real da
# tabela está espalhado por centenas de migrations; o objeto sob teste é a view, aplicada
# do arquivo real). RLS ligada + uma policy-stub de leitura para authenticated, para o
# security_invoker ter o que respeitar.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image="${SL045_SLO_INBOUND_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-slo-inbound-test-$$"
migration="$(ls "$repo_root"/supabase/migrations/*_slo_inbound_latency_daily.sql 2>/dev/null | sort | tail -n1 || true)"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-slo-inbound-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }

psql_sql() { docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"; }
psql_file() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }
as_role() { local role="$1" sql="$2"; docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "SET ROLE $role; $sql"; }

expect_value() {
  local l="$1" e="$2" s="$3" a
  a="$(psql_sql "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  pass "$l"
}
expect_true() {
  local l="$1" s="$2" a
  a="$(psql_sql "$s" | tail -n1)"
  [[ "$a" == "true" ]] || fail "$l: esperado true, obtido '$a'"
  pass "$l"
}
expect_value_as() {
  local l="$1" e="$2" role="$3" s="$4" a
  a="$(as_role "$role" "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  pass "$l"
}
expect_error_as() {
  local l="$1" needle="$2" role="$3" s="$4" out st
  set +e; out="$(as_role "$role" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  pass "$l"
}
expect_true_as() {
  local l="$1" role="$2" s="$3" a
  a="$(as_role "$role" "$s" | tail -n1)"
  [[ "$a" == "true" ]] || fail "$l: esperado true, obtido '$a' (como $role)"
  pass "$l"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -n "$migration" && -f "$migration" ]] \
  || fail 'migration nao encontrada: supabase/migrations/*_slo_inbound_latency_daily.sql (a lacuna nao foi fechada)'

printf '== migration: %s ==\n' "${migration#"$repo_root"/}"
printf '== container: %s (imagem %s) ==\n' "$container_name" "$postgres_image"
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

-- Predecessor minimo e fiel de public.messages: SEM received_at (a lacuna do cartao).
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  sender text NOT NULL CHECK (sender IN ('agent', 'contact')),
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_created_at ON public.messages (created_at DESC);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
-- policy-stub de fixture (a RLS de messages nao e o objeto sob teste; o security_invoker
-- da view e que precisa de uma RLS ligada para ser provado por comportamento).
CREATE POLICY test_fixture_read ON public.messages FOR SELECT TO authenticated USING (true);
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT SELECT, INSERT ON public.messages TO service_role;
SQL
psql_file "$tmp_dir/pre.sql" >/dev/null

printf '\n-- BLOCO A: a lacuna na ponta (vermelho)\n'
expect_true 'view slo_inbound_latency_daily nao existe na ponta' \
  "SELECT (to_regclass('public.slo_inbound_latency_daily') IS NULL)::text"
expect_true 'messages.received_at nao existe na ponta (nao havia relogio do INSERT)' \
  "SELECT (count(*) = 0)::text FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'received_at'"

printf '\n-- BLOCO B: migration aplicada\n'
psql_file "$migration" >/dev/null
expect_value 'view criada como VIEW' 'v' \
  "SELECT c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'slo_inbound_latency_daily'"
expect_true 'messages.received_at existe' \
  "SELECT (count(*) = 1)::text FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'received_at'"
expect_true 'received_at tem default do relogio do banco (now())' \
  "SELECT (column_default LIKE 'now()%')::text FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'received_at'"

cat > "$tmp_dir/rows.sql" <<'SQL'
SET ROLE service_role;
-- Dia 06/10 (America/Sao_Paulo): 2000 / 4000 / 6000 ms  -> p50 4000, p95 5800
-- (a terceira e 23:30-03 = 02:30Z do dia 07: prova o balde no fuso de Sao Paulo)
INSERT INTO public.messages (sender, content, created_at, received_at) VALUES
  ('contact', 'a', '2026-10-06 09:00:00-03', '2026-10-06 09:00:02-03'),
  ('contact', 'b', '2026-10-06 09:00:00-03', '2026-10-06 09:00:04-03'),
  ('contact', 'c', '2026-10-06 23:30:00-03', '2026-10-06 23:30:06-03'),
-- Dia 05/10: relogio do provedor adiantado (-1 s -> zerado) e 500 ms -> p50 250, p95 475
  ('contact', 'd', '2026-10-05 08:00:00-03', '2026-10-05 07:59:59-03'),
  ('contact', 'e', '2026-10-05 08:00:00-03', '2026-10-05 08:00:00.5-03'),
-- Dia 04/10: linha legada, sem a ponta do INSERT -> nao entra na medida
  ('contact', 'f', '2026-10-04 07:00:00-03', NULL),
-- Envio do agente no dia 06/10: nao e inbound, nao entra
  ('agent',   'g', '2026-10-06 09:00:00-03', '2026-10-06 09:00:01-03');
SQL
psql_file "$tmp_dir/rows.sql" >/dev/null

expect_value 'dia 06/10: 3 mensagens, p50 4000 ms, p95 5800 ms' '3|4000|5800' \
  "SELECT mensagens || '|' || latencia_p50_ms || '|' || latencia_p95_ms
     FROM public.slo_inbound_latency_daily WHERE dia = DATE '2026-10-06'"
expect_value 'dia 05/10: 2 mensagens, atraso negativo zerado (p50 250, p95 475)' '2|250|475' \
  "SELECT mensagens || '|' || latencia_p50_ms || '|' || latencia_p95_ms
     FROM public.slo_inbound_latency_daily WHERE dia = DATE '2026-10-05'"
expect_value 'so os dias com as duas pontas conhecidas (2 dias)' '2' \
  "SELECT count(*) FROM public.slo_inbound_latency_daily"
expect_value 'linha legada sem received_at fica fora da medida' '0' \
  "SELECT count(*) FROM public.slo_inbound_latency_daily WHERE dia = DATE '2026-10-04'"
expect_value 'mensagem de envio (sender = agent) fica fora' '3' \
  "SELECT mensagens FROM public.slo_inbound_latency_daily WHERE dia = DATE '2026-10-06'"
expect_value 'o dia e o de America/Sao_Paulo (23:30-03 nao cai no dia 07)' '0' \
  "SELECT count(*) FROM public.slo_inbound_latency_daily WHERE dia = DATE '2026-10-07'"
printf '\n-- contrato de acesso\n'
expect_true 'authenticated tem SELECT na view' \
  "SELECT has_table_privilege('authenticated', 'public.slo_inbound_latency_daily', 'SELECT')::text"
expect_true 'anon NAO tem SELECT na view' \
  "SELECT (NOT has_table_privilege('anon', 'public.slo_inbound_latency_daily', 'SELECT'))::text"
expect_value_as 'authenticated le a view' '2' authenticated \
  "SELECT count(*) FROM public.slo_inbound_latency_daily"
expect_error_as 'anon nao le a view' 'permission denied' anon \
  "SELECT count(*) FROM public.slo_inbound_latency_daily"

printf '\n-- security_invoker (a view nao atravessa a RLS/privilegio de messages)\n'
psql_sql 'REVOKE SELECT ON public.messages FROM authenticated' >/dev/null
expect_error_as 'sem SELECT em messages, o authenticated nao le a view' \
  'permission denied for table messages' authenticated \
  "SELECT count(*) FROM public.slo_inbound_latency_daily"
psql_sql 'GRANT SELECT ON public.messages TO authenticated' >/dev/null
expect_value_as 'devolvido o SELECT, a view volta a responder' '2' authenticated \
  "SELECT count(*) FROM public.slo_inbound_latency_daily"
expect_true_as 'a RLS de messages continua valendo para quem le a view' authenticated \
  "SELECT (current_user = 'authenticated')::text"

printf '\n-- a ponta do INSERT passa a existir sozinha (nenhuma edge muda)\n'
expect_value 'o INSERT seguinte ja nasce com received_at do relogio do banco' 'true' \
  "WITH novo AS (INSERT INTO public.messages (sender, content, created_at)
                   VALUES ('contact', 'h', now() - interval '2 seconds') RETURNING received_at)
     SELECT (received_at IS NOT NULL AND received_at >= now() - interval '1 minute')::text FROM novo"

printf '\n-- idempotencia\n'
psql_file "$migration" >/dev/null && pass 'migration reaplicada sem erro'
expect_value 'apos reaplicar, a medida continua a mesma' '3|4000|5800' \
  "SELECT mensagens || '|' || latencia_p50_ms || '|' || latencia_p95_ms
     FROM public.slo_inbound_latency_daily WHERE dia = DATE '2026-10-06'"

printf '\n-- rollback da migration\n'
rollback_sql="$(sed -n '2s/^-- Rollback: //p' "$migration")"
[[ -n "$rollback_sql" ]] || fail 'linha "-- Rollback:" ausente na migration (linha 2)'
psql_sql "$rollback_sql" >/dev/null || fail 'rollback nao rodou'
pass 'linha -- Rollback: roda'
expect_true 'rollback: view removida' \
  "SELECT (to_regclass('public.slo_inbound_latency_daily') IS NULL)::text"
expect_true 'rollback: received_at removida' \
  "SELECT (count(*) = 0)::text FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'received_at'"
expect_value 'rollback: as mensagens continuam no banco (nada de dado perdido)' '8' \
  "SELECT count(*) FROM public.messages"

printf '\nOK: SL-045 (view slo_inbound_latency_daily, p50/p95) provada no Postgres descartavel.\n'
