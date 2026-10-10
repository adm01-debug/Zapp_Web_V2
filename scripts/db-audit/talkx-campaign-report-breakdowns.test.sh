#!/usr/bin/env bash
# N-134 (Fase 6 · banco) — talkx_campaign_report_breakdowns: heatmap 7x24 completo,
# by_segment com nomes, by_link com rotulo distinto do destino, REVOKE/GRANT.
#
# Roteiro no mesmo Postgres 17 descartavel:
#   BLOCO VERMELHO — sem a migration: a RPC nao existe (chamada como authenticated
#             falha com "does not exist").
#   BLOCO VERDE — migration real aplicada: heatmap com 168 celulas (7x24, Seg→Dom),
#             envios/respostas/cliques separados, by_segment/by_link/by_variant com
#             os valores EXATOS da fixture, chamada como authenticated (a funcao e
#             SECURITY INVOKER e depende de RLS), REVOKE de PUBLIC/anon e GRANT so
#             para authenticated/service_role, p_from/p_to nulos rejeitados.
#   BLOCO ROLLBACK — o SQL da linha `-- Rollback:` da migration executa e a funcao
#             some (volta ao estado anterior: nao existia).

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="$repo_root/supabase/migrations/20261011003013_talkx_campaign_report_breakdowns.sql"
postgres_image="${BREAKDOWN_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-v2-talkx-breakdowns-test-$$"

cleanup() {
  if [[ "$container_name" =~ ^zapp-v2-talkx-breakdowns-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

psql_sql() {
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}
psql_file() {
  docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}
as_user() {
  local jwt="$1" sql="$2"
  docker exec "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SET ROLE authenticated; SELECT set_config('request.jwt.claims', '$jwt', false); $sql"
}
expect_value() {
  local l="$1" e="$2" s="$3" a
  a="$(psql_sql "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_value_as() {
  local l="$1" e="$2" j="$3" s="$4" a
  a="$(as_user "$j" "$s" | tail -n1)"
  [[ "$a" == "$e" ]] || fail "$l: esperado '$e', obtido '$a'"
  printf '[PASS] %s\n' "$l"
}
expect_ok_as() { local l="$1" j="$2" s="$3"; as_user "$j" "$s" >/dev/null || fail "$l: deveria ter sucesso (como authenticated)"; printf '[PASS] %s\n' "$l"; }
expect_error_as() {
  local l="$1" needle="$2" j="$3" s="$4" out st
  set +e; out="$(as_user "$j" "$s" 2>&1)"; st=$?; set -e
  (( st == 0 )) && { printf '%s\n' "$out" >&2; fail "$l: deveria falhar, mas passou"; }
  [[ "$out" == *"$needle"* ]] || { printf '%s\n' "$out" >&2; fail "$l: esperava '$needle' no erro"; }
  printf '[PASS] %s\n' "$l"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

printf '== container: %s (imagem %s) ==\n' "$container_name" "$postgres_image"
docker run --rm -d --name "$container_name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null

ready=0
for _ in $(seq 1 90); do
  if psql_sql 'SELECT 1' >/dev/null 2>&1; then ready=$((ready + 1)); (( ready >= 2 )) && break; else ready=0; fi
  sleep 1
done
(( ready >= 2 )) || fail 'PostgreSQL descartavel nao ficou pronto de forma estavel'

# ─── BLOCO 0: papeis, schema minimo (mesmas colunas que a funcao le) e fixture ──
# Sabado 2026-10-10, America/Sao_Paulo (ISODOW 6). Janela: dia 10 inteiro.
psql_sql "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;" >/dev/null
psql_sql "CREATE EXTENSION IF NOT EXISTS pgcrypto;" >/dev/null
psql_sql "CREATE TABLE public.talkx_campaigns (id uuid PRIMARY KEY, schedule_timezone text);" >/dev/null
psql_sql "CREATE TABLE public.talkx_segments (id uuid PRIMARY KEY, name text NOT NULL);" >/dev/null
psql_sql "CREATE TABLE public.talkx_template_variants (id uuid PRIMARY KEY, label text NOT NULL);" >/dev/null
psql_sql "CREATE TABLE public.talkx_recipients (id uuid PRIMARY KEY, campaign_id uuid, segment_id uuid, variant_id uuid, sent_at timestamptz, replied_at timestamptz);" >/dev/null
psql_sql "CREATE TABLE public.talkx_conversions (id uuid PRIMARY KEY, campaign_id uuid, recipient_id uuid, occurred_at timestamptz);" >/dev/null
psql_sql "CREATE TABLE public.talkx_links (id uuid PRIMARY KEY, campaign_id uuid, label text, target_url text, slug text);" >/dev/null
psql_sql "CREATE TABLE public.talkx_link_clicks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), link_id uuid, recipient_id uuid, clicked_at timestamptz);" >/dev/null
# INVOKER executa com os privilegios do chamador: concede leitura a authenticated
# (em producao o acesso vem dos GRANTs + RLS das tabelas Talk X).
psql_sql "GRANT SELECT ON public.talkx_campaigns, public.talkx_segments, public.talkx_template_variants, public.talkx_recipients, public.talkx_conversions, public.talkx_links, public.talkx_link_clicks TO authenticated;" >/dev/null

psql_sql "INSERT INTO public.talkx_campaigns (id, schedule_timezone) VALUES ('11111111-1111-1111-1111-111111111111', 'America/Sao_Paulo');" >/dev/null
psql_sql "INSERT INTO public.talkx_segments (id, name) VALUES ('22222222-2222-2222-2222-222222222222', 'Premium'), ('33333333-3333-3333-3333-333333333333', 'Standard');" >/dev/null
psql_sql "INSERT INTO public.talkx_template_variants (id, label) VALUES ('44444444-4444-4444-4444-444444444444', 'A');" >/dev/null
psql_sql "INSERT INTO public.talkx_recipients (id, campaign_id, segment_id, variant_id, sent_at, replied_at) VALUES
  ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', '2026-10-10T10:00:00-03:00', '2026-10-10T10:05:00-03:00'),
  ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', '2026-10-10T10:00:00-03:00', NULL),
  ('77777777-7777-7777-7777-777777777777', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', NULL, NULL),
  ('88888888-8888-8888-8888-888888888888', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', '2026-10-10T11:00:00-03:00', '2026-10-10T11:30:00-03:00');" >/dev/null
psql_sql "INSERT INTO public.talkx_conversions (id, campaign_id, recipient_id, occurred_at) VALUES
  ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555', '2026-10-10T10:10:00-03:00'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '88888888-8888-8888-8888-888888888888', '2026-10-10T11:40:00-03:00');" >/dev/null
psql_sql "INSERT INTO public.talkx_links (id, campaign_id, label, target_url, slug) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Exemplo', 'https://exemplo.test/oferta-x', 'oferta-x'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'Site', 'https://exemplo.test/site', 'site');" >/dev/null
psql_sql "INSERT INTO public.talkx_link_clicks (link_id, recipient_id, clicked_at) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', '2026-10-10T10:02:00-03:00'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', '2026-10-10T10:03:00-03:00'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '66666666-6666-6666-6666-666666666666', '2026-10-10T10:04:00-03:00'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '88888888-8888-8888-8888-888888888888', '2026-10-10T11:05:00-03:00');" >/dev/null

JWT='{"sub":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","role":"authenticated"}'
CALL="SELECT public.talkx_campaign_report_breakdowns('11111111-1111-1111-1111-111111111111', '2026-10-10T00:00:00-03:00', '2026-10-11T00:00:00-03:00')"

# ─── BLOCO VERMELHO: sem a migration a RPC nao existe ───────────────────────────
expect_error_as 'VERMELHO: RPC inexistente antes da migration (como authenticated)' \
  'does not exist' "$JWT" "$CALL"

# ─── BLOCO VERDE: migration real aplicada ───────────────────────────────────────
psql_file "$migration" >/dev/null
printf '[PASS] migration aplicada\n'

expect_ok_as 'VERDE: RPC executa como authenticated (INVOKER)' "$JWT" "$CALL"

# heatmap: grade 7x24 completa, fuso da campanha, envios/respostas/cliques separados
expect_value_as 'heatmap tem 168 celulas (7 dias x 24h)' '168' "$JWT" \
  "SELECT jsonb_array_length(($CALL)->'heatmap'->'cells')"
expect_value_as 'heatmap usa o fuso da campanha' 'America/Sao_Paulo' "$JWT" \
  "SELECT (($CALL)->'heatmap'->>'timezone')"
expect_value_as 'heatmap soma 3 envios' '3' "$JWT" \
  "SELECT SUM((c->>'sends')::int) FROM jsonb_array_elements(($CALL)->'heatmap'->'cells') c"
expect_value_as 'heatmap soma 2 respostas' '2' "$JWT" \
  "SELECT SUM((c->>'replies')::int) FROM jsonb_array_elements(($CALL)->'heatmap'->'cells') c"
expect_value_as 'heatmap soma 4 cliques' '4' "$JWT" \
  "SELECT SUM((c->>'clicks')::int) FROM jsonb_array_elements(($CALL)->'heatmap'->'cells') c"
expect_value_as 'heatmap celula sabado(dow 6) 10h: 2 envios, 1 resposta, 3 cliques' '2|1|3' "$JWT" \
  "SELECT (c->>'sends')||'|'||(c->>'replies')||'|'||(c->>'clicks') FROM jsonb_array_elements(($CALL)->'heatmap'->'cells') c WHERE c->>'dow'='6' AND c->>'hour'='10'"
expect_value_as 'heatmap celula sabado(dow 6) 11h: 1 envio, 1 resposta, 1 clique' '1|1|1' "$JWT" \
  "SELECT (c->>'sends')||'|'||(c->>'replies')||'|'||(c->>'clicks') FROM jsonb_array_elements(($CALL)->'heatmap'->'cells') c WHERE c->>'dow'='6' AND c->>'hour'='11'"
expect_value_as 'heatmap celula vazia segunda(dow 1) 0h zerada' '0|0|0' "$JWT" \
  "SELECT (c->>'sends')||'|'||(c->>'replies')||'|'||(c->>'clicks') FROM jsonb_array_elements(($CALL)->'heatmap'->'cells') c WHERE c->>'dow'='1' AND c->>'hour'='0'"

# by_segment: NOMES dos segmentos + valores exatos (taxa = conversoes/enviados)
expect_value_as 'by_segment Premium: 2 enviados, 1 resposta, 1 conversao, 50.0%' 'Premium|2|1|1|50.0' "$JWT" \
  "SELECT (s->>'segment')||'|'||(s->>'sent')||'|'||(s->>'replies')||'|'||(s->>'conversions')||'|'||(s->>'rate_pct') FROM jsonb_array_elements(($CALL)->'by_segment') s WHERE s->>'segment'='Premium'"
expect_value_as 'by_segment Standard: 1 enviado, 1 resposta, 1 conversao, 100.0%' 'Standard|1|1|1|100.0' "$JWT" \
  "SELECT (s->>'segment')||'|'||(s->>'sent')||'|'||(s->>'replies')||'|'||(s->>'conversions')||'|'||(s->>'rate_pct') FROM jsonb_array_elements(($CALL)->'by_segment') s WHERE s->>'segment'='Standard'"

# by_link: rotulo DISTINTO do destino + cliques unicos + taxa sobre enviados
expect_value_as 'by_link Exemplo: rotulo distinto do destino, 3 cliques, 2 unicos, 66.7%' 'Exemplo|https://exemplo.test/oferta-x|3|2|66.7' "$JWT" \
  "SELECT (l->>'label')||'|'||(l->>'target_url')||'|'||(l->>'clicks')||'|'||(l->>'unique_clicks')||'|'||(l->>'rate_pct') FROM jsonb_array_elements(($CALL)->'by_link') l WHERE l->>'label'='Exemplo'"
expect_value_as 'by_link Site: 1 clique, 1 unico, 33.3%' 'Site|https://exemplo.test/site|1|1|33.3' "$JWT" \
  "SELECT (l->>'label')||'|'||(l->>'target_url')||'|'||(l->>'clicks')||'|'||(l->>'unique_clicks')||'|'||(l->>'rate_pct') FROM jsonb_array_elements(($CALL)->'by_link') l WHERE l->>'label'='Site'"

# by_variant: variante A com valores exatos
expect_value_as 'by_variant A: 3 enviados, 2 respostas, 2 conversoes' 'A|3|2|2' "$JWT" \
  "SELECT (v->>'variant')||'|'||(v->>'sent')||'|'||(v->>'replies')||'|'||(v->>'conversions') FROM jsonb_array_elements(($CALL)->'by_variant') v WHERE v->>'variant'='A'"

# ACL: PUBLIC e anon sem EXECUTE; authenticated e service_role com EXECUTE
expect_value 'anon sem EXECUTE na RPC' 'f' \
  "SELECT has_function_privilege('anon', 'public.talkx_campaign_report_breakdowns(uuid, timestamptz, timestamptz)', 'EXECUTE')"
# PUBLIC sem EXECUTE: apos o REVOKE, a ACL da funcao nao tem entrada de grantee
# vazio (=X/...), que e a forma do Postgres representar o grant para PUBLIC.
expect_value 'PUBLIC sem EXECUTE na RPC (ACL sem entrada publica)' 't' \
  "SELECT (SELECT proacl::text FROM pg_proc WHERE oid = 'public.talkx_campaign_report_breakdowns(uuid, timestamptz, timestamptz)'::regprocedure) NOT LIKE '{=X/%' AND (SELECT proacl::text FROM pg_proc WHERE oid = 'public.talkx_campaign_report_breakdowns(uuid, timestamptz, timestamptz)'::regprocedure) NOT LIKE '%,=X/%'"
expect_value 'authenticated com EXECUTE na RPC' 't' \
  "SELECT has_function_privilege('authenticated', 'public.talkx_campaign_report_breakdowns(uuid, timestamptz, timestamptz)', 'EXECUTE')"
expect_value 'service_role com EXECUTE na RPC' 't' \
  "SELECT has_function_privilege('service_role', 'public.talkx_campaign_report_breakdowns(uuid, timestamptz, timestamptz)', 'EXECUTE')"

# Entrada invalida: p_from/p_to nulos rejeitados; campanha inexistente rejeitada
expect_error_as 'p_from nulo rejeitado' 'p_from/p_to' "$JWT" \
  "SELECT public.talkx_campaign_report_breakdowns('11111111-1111-1111-1111-111111111111', NULL, '2026-10-11T00:00:00-03:00')"
expect_error_as 'p_to nulo rejeitado' 'p_from/p_to' "$JWT" \
  "SELECT public.talkx_campaign_report_breakdowns('11111111-1111-1111-1111-111111111111', '2026-10-10T00:00:00-03:00', NULL)"
expect_error_as 'campanha inexistente rejeitada' 'nao encontrada' "$JWT" \
  "SELECT public.talkx_campaign_report_breakdowns('00000000-0000-0000-0000-000000000000', '2026-10-10T00:00:00-03:00', '2026-10-11T00:00:00-03:00')"

# ─── BLOCO ROLLBACK: o SQL da linha `-- Rollback:` executa e a funcao some ──────
ROLLBACK_SQL="$(grep '^-- Rollback:' "$migration" | sed 's/^-- Rollback: //')"
[[ -n "$ROLLBACK_SQL" ]] || fail 'migration sem linha -- Rollback:'
psql_sql "$ROLLBACK_SQL" >/dev/null
printf '[PASS] rollback executou\n'
expect_value 'rollback removeu a funcao (volta a nao existir)' '' \
  "SELECT to_regprocedure('public.talkx_campaign_report_breakdowns(uuid, timestamptz, timestamptz)')"

printf 'OK: breakdowns provado RED→GREEN como authenticated, com rollback executavel\n'
