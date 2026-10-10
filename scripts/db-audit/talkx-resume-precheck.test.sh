#!/usr/bin/env bash
set -Eeuo pipefail

# N-097 / X142 (parte): talkx_campaign_resume_precheck(uuid).
# Prova, em PostgreSQL 17 descartavel e com papel real (SET LOCAL ROLE authenticated +
# claims), que a RPC aponta conexao desconectada, janela fechada e destinatarios
# suprimidos, e que com tudo ok devolve can_resume = true. A funcao de janela vem da
# migration REAL 20261003242707 (bloco c1, extraido por marcadores).

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="${TALKX_RESUME_PRECHECK_MIGRATION:-$repo_root/supabase/migrations/20261010071435_talkx_campaign_resume_precheck.sql}"
window_migration="$repo_root/supabase/migrations/20261003242707_talkx_log_saude_alertas.sql"
postgres_image="${TALKX_RESUME_PRECHECK_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"
container_name="zapp-talkx-resume-precheck-$RANDOM-$$"
test_password="talkx_resume_precheck_test_only"

cleanup() {
  if [[ "$container_name" =~ ^zapp-talkx-resume-precheck-[0-9]+-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }
pass() { printf '[PASS] %s\n' "$1"; }
psql_test() { docker exec -i "$container_name" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
psql_q() { psql_test -Atc "$1"; }

[[ -f "$migration" ]] || fail "migration ausente: $migration"
command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
docker run --rm -d --name "$container_name" \
  -e POSTGRES_PASSWORD="$test_password" "$postgres_image" >/dev/null

ready=false
for _ in $(seq 1 90); do
  markers="$(docker logs "$container_name" 2>&1 | grep -c 'database system is ready to accept connections' || true)"
  if [[ "$markers" -ge 2 ]] && docker exec "$container_name" \
    psql -X -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'PostgreSQL 17 descartavel nao ficou pronto'

psql_test >/dev/null <<'SQL'
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'authenticated')
$$;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE anon NOLOGIN;

CREATE TABLE public.user_roles (user_id uuid NOT NULL, role text NOT NULL);
CREATE FUNCTION public.is_admin_or_supervisor(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','supervisor'))
$$;

CREATE TABLE public.whatsapp_connections (id uuid PRIMARY KEY, status text);
CREATE TABLE public.contacts (id uuid PRIMARY KEY, phone text NOT NULL);
CREATE TABLE public.talkx_settings (key text PRIMARY KEY, value jsonb);
CREATE TABLE public.talkx_campaigns (
  id uuid PRIMARY KEY,
  whatsapp_connection_id uuid,
  schedule_timezone text,
  send_window_start time,
  send_window_end time,
  business_hours_only boolean NOT NULL DEFAULT false
);
CREATE TABLE public.talkx_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  segment_id uuid,
  status text NOT NULL DEFAULT 'pending'
);
CREATE TABLE public.talkx_segments (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.talkx_campaign_segments (
  campaign_id uuid NOT NULL,
  segment_id uuid NOT NULL,
  position smallint NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  PRIMARY KEY (campaign_id, segment_id)
);
CREATE TABLE public.talkx_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  phone text,
  removed_at timestamptz,
  expires_at timestamptz
);
SQL

# Funcao de janela REAL (bloco c1 da migration X033).
sed -n '/^CREATE OR REPLACE FUNCTION public.talkx_engine_window_open/,/^\$function\$;/p' "$window_migration" \
  | psql_test >/dev/null
[[ "$(psql_q "SELECT count(*) FROM pg_proc WHERE proname='talkx_engine_window_open'")" == "1" ]] \
  || fail 'funcao de janela real nao foi extraida da migration'

psql_test >/dev/null < "$migration"

psql_test >/dev/null <<'SQL'
INSERT INTO public.user_roles VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'agent');
INSERT INTO public.whatsapp_connections VALUES
  ('c0000000-0000-4000-8000-000000000001', 'connected'),
  ('c0000000-0000-4000-8000-000000000002', 'disconnected');
INSERT INTO public.contacts VALUES
  ('d0000000-0000-4000-8000-000000000001', '5511999990001'),
  ('d0000000-0000-4000-8000-000000000002', '5511999990002');
-- 1 ok | 2 conexao desconectada | 3 janela fechada | 4 suprimido por contato
-- 5 suprimido por telefone (formato diferente) | 6 igual a 5, supressao depois removida
INSERT INTO public.talkx_campaigns (id, whatsapp_connection_id, business_hours_only) VALUES
  ('e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', false),
  ('e0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002', false),
  ('e0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', true),
  ('e0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', false),
  ('e0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000001', false),
  ('e0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000001', false);
-- janela fechada o dia todo: nenhum dia permitido
INSERT INTO public.talkx_settings VALUES ('business_hours', '{"start":"08:00","end":"18:00","days":[]}');
INSERT INTO public.talkx_recipients (campaign_id, contact_id) VALUES
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002'),
  ('e0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000002'),
  ('e0000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000002');
INSERT INTO public.talkx_blacklist (contact_id, phone) VALUES
  ('d0000000-0000-4000-8000-000000000001', NULL),
  (NULL, '+55 (11) 99999-0002');
SQL
# O contato 2 (campanhas 1, 5, 6) esta suprimido por telefone. Para o caso "tudo ok" a
# campanha 1 tem o destinatario ja enviado.
psql_test -c "UPDATE public.talkx_recipients SET status='sent' WHERE campaign_id='e0000000-0000-4000-8000-000000000001'" >/dev/null

admin='aaaaaaaa-0000-4000-8000-000000000001'
agent='aaaaaaaa-0000-4000-8000-000000000002'

# Chama a RPC como authenticated com o usuario dado e devolve o jsonb.
precheck() {
  psql_q "BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','$2',true); SELECT public.talkx_campaign_resume_precheck('e0000000-0000-4000-8000-00000000000$1'); COMMIT;" \
    | grep -E '^\{' | head -1
}
# jq_get <json> <expressao sobre j>
jq_get() { psql_q "SELECT ($2) FROM (SELECT '$1'::jsonb AS j) t"; }

out="$(precheck 1 "$admin")"
[[ "$(jq_get "$out" "j->>'can_resume'")" == "true" ]] || fail "tudo ok deveria devolver can_resume=true: $out"
[[ "$(jq_get "$out" "j->>'blockers'")" == "[]" ]] || fail "tudo ok nao deveria ter blockers: $out"
pass 'tudo ok -> can_resume=true'

out="$(precheck 2 "$admin")"
[[ "$(jq_get "$out" "j->>'can_resume'")" == "false" ]] || fail "desconectada deveria bloquear: $out"
[[ "$(jq_get "$out" "j->'blockers' ? 'connection_not_connected'")" == "t" ]] || fail "falta connection_not_connected: $out"
[[ "$(jq_get "$out" "j->>'connection_status'")" == "disconnected" ]] || fail "connection_status errado: $out"
pass 'conexao desconectada apontada'

out="$(precheck 3 "$admin")"
[[ "$(jq_get "$out" "j->>'window_open'")" == "false" ]] || fail "janela deveria estar fechada: $out"
[[ "$(jq_get "$out" "j->'blockers' ? 'outside_send_window'")" == "t" ]] || fail "falta outside_send_window: $out"
pass 'janela fechada apontada'

out="$(precheck 4 "$admin")"
[[ "$(jq_get "$out" "j->>'suppressed_pending_recipients'")" == "1" ]] || fail "esperava 1 suprimido: $out"
[[ "$(jq_get "$out" "j->'blockers' ? 'recipients_suppressed'")" == "t" ]] || fail "falta recipients_suppressed: $out"
pass 'destinatarios bloqueados por contato apontados'

out="$(precheck 5 "$admin")"
[[ "$(jq_get "$out" "j->>'suppressed_pending_recipients'")" == "1" ]] || fail "supressao por telefone nao detectada: $out"
pass 'destinatarios bloqueados por telefone apontados'

psql_test -c "UPDATE public.talkx_blacklist SET removed_at = now() WHERE phone IS NOT NULL" >/dev/null
out="$(precheck 6 "$admin")"
[[ "$(jq_get "$out" "j->>'can_resume'")" == "true" ]] || fail "supressao removida nao deveria bloquear: $out"
pass 'supressao removida nao bloqueia'

set +e
err="$(psql_test -c "BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','$agent',true); SELECT public.talkx_campaign_resume_precheck('e0000000-0000-4000-8000-000000000001'); COMMIT;" 2>&1)"
set -e
[[ "$err" == *talkx_admin_required* ]] || fail "agente comum deveria receber talkx_admin_required: $err"
set +e
err="$(psql_test -c "BEGIN; SET LOCAL ROLE anon; SELECT public.talkx_campaign_resume_precheck('e0000000-0000-4000-8000-000000000001'); COMMIT;" 2>&1)"
set -e
[[ "$err" == *"permission denied"* ]] || fail "anon deveria ser negado por ACL: $err"
set +e
err="$(psql_test -c "BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','$admin',true); SELECT public.talkx_campaign_resume_precheck('e0000000-0000-4000-8000-0000000000ff'); COMMIT;" 2>&1)"
set -e
[[ "$err" == *talkx_campaign_not_found* ]] || fail "campanha inexistente deveria falhar: $err"
pass 'ACL: agente e anon recusados; campanha inexistente falha'

# --- talkx_campaign_segment_progress ---------------------------------------------
# Campanha 7: seg B (position 1) todo enviado = done; seg A (position 2) com enviado,
# entregue, falha e pendente = running; seg C (position 3) so pendente = pending.
psql_test >/dev/null <<'SQL'
INSERT INTO public.talkx_campaigns (id, whatsapp_connection_id) VALUES
  ('e0000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000001');
INSERT INTO public.talkx_segments VALUES
  ('50000000-0000-4000-8000-00000000000a', 'Segmento A'),
  ('50000000-0000-4000-8000-00000000000b', 'Segmento B'),
  ('50000000-0000-4000-8000-00000000000c', 'Segmento C');
INSERT INTO public.talkx_campaign_segments (campaign_id, segment_id, position) VALUES
  ('e0000000-0000-4000-8000-000000000007', '50000000-0000-4000-8000-00000000000a', 2),
  ('e0000000-0000-4000-8000-000000000007', '50000000-0000-4000-8000-00000000000b', 1),
  ('e0000000-0000-4000-8000-000000000007', '50000000-0000-4000-8000-00000000000c', 3);
-- (segmento, status): B = sent, delivered | A = delivered, failed, pending, sent | C = pending
INSERT INTO public.talkx_recipients (campaign_id, contact_id, segment_id, status)
SELECT 'e0000000-0000-4000-8000-000000000007', gen_random_uuid(), v.seg::uuid, v.st
  FROM (VALUES
    ('50000000-0000-4000-8000-00000000000b', 'sent'),
    ('50000000-0000-4000-8000-00000000000b', 'delivered'),
    ('50000000-0000-4000-8000-00000000000a', 'delivered'),
    ('50000000-0000-4000-8000-00000000000a', 'failed'),
    ('50000000-0000-4000-8000-00000000000a', 'pending'),
    ('50000000-0000-4000-8000-00000000000a', 'sent'),
    ('50000000-0000-4000-8000-00000000000c', 'pending')
  ) AS v(seg, st);
SQL

progress() {
  psql_q "BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','$1',true); SELECT public.talkx_campaign_segment_progress('e0000000-0000-4000-8000-000000000007'); COMMIT;" \
    | grep -E '^\{' | head -1
}
out="$(progress "$admin")"
[[ "$(jq_get "$out" "j->>'total_segments'")" == "3" ]] || fail "total_segments esperado 3: $out"
[[ "$(jq_get "$out" "j->>'pending_segments'")" == "1" ]] || fail "pending_segments esperado 1: $out"
[[ "$(jq_get "$out" "(j->'segments'->0)->>'name'")" == "Segmento B" ]] || fail "ordem deve seguir position: $out"
[[ "$(jq_get "$out" "(j->'segments'->0)->>'status'")" == "done" ]] || fail "B deveria estar done: $out"
[[ "$(jq_get "$out" "(j->'segments'->0)->>'percent'")" == "100" ]] || fail "B deveria ter 100%: $out"
seg_a="$(jq_get "$out" "j->'segments'->1")"
[[ "$(jq_get "$out" "(j->'segments'->1)->>'status'")" == "running" ]] || fail "A deveria estar running: $out"
for pair in total:4 sent:2 delivered:1 failed:1 remaining:1 percent:75; do
  [[ "$(jq_get "$out" "(j->'segments'->1)->>'${pair%%:*}'")" == "${pair##*:}" ]] \
    || fail "A: ${pair%%:*} esperado ${pair##*:}: $seg_a"
done
[[ "$(jq_get "$out" "(j->'segments'->2)->>'status'")" == "pending" ]] || fail "C deveria estar pending: $out"
pass 'progresso por segmento: ordem, contagens e status'

set +e
err="$(psql_test -c "BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','$agent',true); SELECT public.talkx_campaign_segment_progress('e0000000-0000-4000-8000-000000000007'); COMMIT;" 2>&1)"
set -e
[[ "$err" == *talkx_admin_required* ]] || fail "progresso: agente deveria receber talkx_admin_required: $err"
set +e
err="$(psql_test -c "BEGIN; SET LOCAL ROLE anon; SELECT public.talkx_campaign_segment_progress('e0000000-0000-4000-8000-000000000007'); COMMIT;" 2>&1)"
set -e
[[ "$err" == *"permission denied"* ]] || fail "progresso: anon deveria ser negado: $err"
pass 'progresso: ACL de agente e anon'

printf 'talkx-resume-precheck: OK\n'
